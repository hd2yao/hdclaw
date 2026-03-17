import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { nowIso, clamp } from '../utils/time.js';
import type { DashboardEvent, ManagedNode, NodeTelemetryPayload } from '../types.js';
import { nodeRepository } from '../db/repositories/nodeRepository.js';
import { telemetryRepository } from '../db/repositories/telemetryRepository.js';
import { eventBus } from './eventBus.js';
import { OpenClawRpcClient } from './rpcClient.js';

interface RegisteredNode extends ManagedNode {
  timer?: NodeJS.Timeout;
  reconnectTimer?: NodeJS.Timeout;
}

export class NodeManager {
  private nodes = new Map<string, RegisteredNode>();

  start(): void {
    for (const node of nodeRepository.list()) {
      this.registerNode({ id: node.id, name: node.name, url: node.url });
    }
  }

  stop(): void {
    for (const node of this.nodes.values()) {
      if (node.timer) clearInterval(node.timer);
      if (node.reconnectTimer) clearTimeout(node.reconnectTimer);
    }
  }

  registerNode(input: { id?: string; name: string; url: string; token?: string | null }): ManagedNode {
    const id = input.id ?? randomUUID();
    const node: RegisteredNode = {
      id,
      name: input.name,
      url: input.url,
      token: input.token ?? null,
      status: 'disconnected',
      lastSeenAt: null,
      reconnectAttempt: 0,
    };

    nodeRepository.upsert({ id, name: input.name, url: input.url, token: input.token });
    this.nodes.set(id, node);
    this.startPolling(node);
    this.publish('node.registered', node);
    return node;
  }

  listNodes(): ManagedNode[] {
    return Array.from(this.nodes.values()).map(({ timer: _timer, reconnectTimer: _reconnectTimer, ...node }) => node);
  }

  private startPolling(node: RegisteredNode): void {
    if (node.timer) clearInterval(node.timer);
    node.status = 'connecting';
    nodeRepository.setStatus(node.id, 'connecting');
    void this.pollNode(node);
    node.timer = setInterval(() => void this.pollNode(node), config.nodePollIntervalMs);
  }

  private async pollNode(node: RegisteredNode): Promise<void> {
    const client = new OpenClawRpcClient(node.url, node.token);

    try {
      const snapshot = await client.collectSnapshot();
      this.handleSnapshot(node, snapshot);
    } catch (error) {
      logger.warn({ err: error, nodeId: node.id }, 'node polling failed');
      node.status = 'degraded';
      nodeRepository.setStatus(node.id, 'degraded');
      this.publish('node.degraded', { nodeId: node.id, error: error instanceof Error ? error.message : 'unknown' });
      this.scheduleReconnect(node);
    }
  }

  private handleSnapshot(node: RegisteredNode, snapshot: NodeTelemetryPayload): void {
    const collectedAt = snapshot.collectedAt || nowIso();
    node.status = 'connected';
    node.lastSeenAt = collectedAt;
    node.reconnectAttempt = 0;

    nodeRepository.setStatus(node.id, 'connected', collectedAt);
    telemetryRepository.saveGateway(node.id, snapshot.gateway, collectedAt);
    telemetryRepository.saveResources(node.id, snapshot.resources, collectedAt);
    telemetryRepository.replaceAgents(node.id, snapshot.agents.map((item) => ({ ...item, nodeId: node.id })));
    telemetryRepository.replaceSessions(node.id, snapshot.sessions.map((item) => ({ ...item, nodeId: node.id })));
    telemetryRepository.upsertMessageCounters({ ...snapshot.messages, nodeId: node.id, updatedAt: collectedAt });
    telemetryRepository.saveEvent(node.id, 'telemetry.snapshot', snapshot, collectedAt);

    this.publish('telemetry.snapshot', { nodeId: node.id, snapshot });
  }

  private scheduleReconnect(node: RegisteredNode): void {
    if (node.reconnectTimer) return;

    node.reconnectAttempt += 1;
    const backoff = clamp(
      config.nodeReconnectMinMs * 2 ** (node.reconnectAttempt - 1),
      config.nodeReconnectMinMs,
      config.nodeReconnectMaxMs,
    );

    node.reconnectTimer = setTimeout(() => {
      node.reconnectTimer = undefined;
      void this.pollNode(node);
    }, backoff);
  }

  private publish(type: string, payload: unknown): void {
    const event: DashboardEvent = { type, ts: nowIso(), payload };
    eventBus.publish(event);
  }
}

export const nodeManager = new NodeManager();
