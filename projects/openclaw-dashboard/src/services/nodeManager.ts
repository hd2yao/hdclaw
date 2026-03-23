import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { nowIso, clamp } from '../utils/time.js';
import type {
  AgentSnapshot,
  AgentTimelineEvent,
  DashboardInternalEvent,
  ManagedNode,
  NodeStatus,
  NodeTelemetryPayload,
  SessionSnapshot,
} from '../types.js';
import { nodeRepository } from '../db/repositories/nodeRepository.js';
import { telemetryRepository } from '../db/repositories/telemetryRepository.js';
import { eventBus } from './eventBus.js';
import { OpenClawRpcClient } from './rpcClient.js';

interface RegisteredNode extends ManagedNode {
  autoPolling: boolean;
  timer?: NodeJS.Timeout;
  reconnectTimer?: NodeJS.Timeout;
}

interface RpcClientLike {
  collectSnapshot(): Promise<NodeTelemetryPayload>;
}

interface NodeManagerDependencies {
  createRpcClient: (url: string, token?: string | null) => RpcClientLike;
  publishEvent: (event: DashboardInternalEvent) => void;
  nowIso: () => string;
  pollIntervalMs: number;
  reconnectMinMs: number;
  reconnectMaxMs: number;
}

const SYSTEM_AGENT_ID = '__system__';

export class NodeManager {
  private readonly dependencies: NodeManagerDependencies;
  private nodes = new Map<string, RegisteredNode>();
  private lastSnapshots = new Map<string, NodeTelemetryPayload>();

  constructor(dependencies: Partial<NodeManagerDependencies> = {}) {
    this.dependencies = {
      createRpcClient: (url, token) => new OpenClawRpcClient(url, token),
      publishEvent: (event) => eventBus.publish(event),
      nowIso,
      pollIntervalMs: config.nodePollIntervalMs,
      reconnectMinMs: config.nodeReconnectMinMs,
      reconnectMaxMs: config.nodeReconnectMaxMs,
      ...dependencies,
    };
  }

  start(): void {
    for (const node of nodeRepository.list()) {
      this.registerNode({ id: node.id, name: node.name, url: node.url, token: node.token }, { autoStartPolling: true });
    }
  }

  stop(): void {
    for (const node of this.nodes.values()) {
      if (node.timer) clearInterval(node.timer);
      if (node.reconnectTimer) clearTimeout(node.reconnectTimer);
    }
  }

  async pollNodeOnce(nodeId: string): Promise<void> {
    const node = this.nodes.get(nodeId);
    if (!node) return;
    await this.pollNode(node);
  }

  registerNode(
    input: { id?: string; name: string; url: string; token?: string | null },
    options: { autoStartPolling?: boolean } = {},
  ): ManagedNode {
    const id = input.id ?? randomUUID();
    const node: RegisteredNode = {
      id,
      name: input.name,
      url: input.url,
      token: input.token ?? null,
      status: 'disconnected',
      lastSeenAt: null,
      reconnectAttempt: 0,
      autoPolling: options.autoStartPolling ?? true,
    };

    nodeRepository.upsert({ id, name: input.name, url: input.url, token: input.token });
    this.nodes.set(id, node);
    if (node.autoPolling) {
      this.startPolling(node);
    }
    return node;
  }

  listNodes(): ManagedNode[] {
    return Array.from(this.nodes.values()).map(({ autoPolling: _autoPolling, timer: _timer, reconnectTimer: _reconnectTimer, ...node }) => node);
  }

  private startPolling(node: RegisteredNode): void {
    if (node.timer) clearInterval(node.timer);
    this.transitionNodeStatus(node, 'connecting');
    void this.pollNode(node);
    node.timer = setInterval(() => void this.pollNode(node), this.dependencies.pollIntervalMs);
  }

  private async pollNode(node: RegisteredNode): Promise<void> {
    const client = this.dependencies.createRpcClient(node.url, node.token);

    try {
      const snapshot = await client.collectSnapshot();
      this.handleSnapshot(node, this.normalizeSnapshot(node.id, snapshot));
    } catch (error) {
      this.handlePollingFailure(node, error);
      this.scheduleReconnect(node);
    }
  }

  private normalizeSnapshot(nodeId: string, snapshot: NodeTelemetryPayload): NodeTelemetryPayload {
    const maybeSnapshot = snapshot as unknown;
    if (
      !maybeSnapshot ||
      typeof maybeSnapshot !== 'object' ||
      !Array.isArray((maybeSnapshot as { agents?: unknown[] }).agents) ||
      !Array.isArray((maybeSnapshot as { sessions?: unknown[] }).sessions)
    ) {
      throw new Error('schema mismatch: invalid snapshot payload');
    }

    const collectedAt = snapshot.collectedAt || this.dependencies.nowIso();
    const agents: AgentSnapshot[] = snapshot.agents.map((item) => ({
      nodeId,
      agentId: item.agentId,
      name: item.name,
      model: item.model ?? null,
      workspace: item.workspace ?? null,
      configJson: item.configJson ?? null,
      status: item.status,
      busy: item.busy,
      taskSummary: item.taskSummary ?? null,
      taskPhase: item.taskPhase ?? null,
      taskStartedAt: item.taskStartedAt ?? null,
      lastProgressAt: item.lastProgressAt ?? null,
      staleReason: item.staleReason ?? null,
      updatedAt: item.updatedAt || collectedAt,
    }));
    const sessions: SessionSnapshot[] = snapshot.sessions.map((item) => ({
      nodeId,
      sessionId: item.sessionId,
      agentId: item.agentId ?? null,
      status: item.status,
      taskSummary: item.taskSummary ?? null,
      taskPhase: item.taskPhase ?? null,
      taskStartedAt: item.taskStartedAt ?? null,
      lastProgressAt: item.lastProgressAt ?? null,
      queueDepth: Number.isFinite(item.queueDepth) ? item.queueDepth : 0,
      updatedAt: item.updatedAt || collectedAt,
    }));

    return {
      gateway: {
        bindAddress: snapshot.gateway.bindAddress ?? null,
        port: Number.isFinite(snapshot.gateway.port) ? snapshot.gateway.port : null,
        status: snapshot.gateway.status ?? 'unknown',
      },
      resources: {
        cpuPercent: Number.isFinite(snapshot.resources.cpuPercent) ? snapshot.resources.cpuPercent : null,
        memoryUsedMb: Number.isFinite(snapshot.resources.memoryUsedMb) ? snapshot.resources.memoryUsedMb : null,
        memoryTotalMb: Number.isFinite(snapshot.resources.memoryTotalMb) ? snapshot.resources.memoryTotalMb : null,
      },
      agents,
      sessions,
      messages: {
        nodeId,
        inbound: Number.isFinite(snapshot.messages.inbound) ? snapshot.messages.inbound : 0,
        outbound: Number.isFinite(snapshot.messages.outbound) ? snapshot.messages.outbound : 0,
        updatedAt: snapshot.messages.updatedAt || collectedAt,
      },
      collectedAt,
    };
  }

  private handleSnapshot(node: RegisteredNode, snapshot: NodeTelemetryPayload): void {
    const collectedAt = snapshot.collectedAt || this.dependencies.nowIso();
    node.lastSeenAt = collectedAt;
    node.reconnectAttempt = 0;

    const previousSnapshot = this.lastSnapshots.get(node.id);
    this.transitionNodeStatus(node, 'connected', collectedAt);

    telemetryRepository.saveGateway(node.id, snapshot.gateway, collectedAt);
    telemetryRepository.saveResources(node.id, snapshot.resources, collectedAt);
    telemetryRepository.replaceAgents(node.id, snapshot.agents);
    telemetryRepository.replaceSessions(node.id, snapshot.sessions);
    telemetryRepository.upsertMessageCounters({ ...snapshot.messages, nodeId: node.id, updatedAt: collectedAt });
    telemetryRepository.saveEvent(node.id, 'telemetry.snapshot', snapshot, collectedAt);

    const timelineEvents = this.collectAgentTransitionEvents(node.id, previousSnapshot?.agents ?? [], snapshot.agents, collectedAt);
    if (timelineEvents.length > 0) {
      telemetryRepository.appendAgentTimelineEvents(timelineEvents);
      for (const event of timelineEvents) {
        this.publish({
          type: 'timeline.event.created',
          ts: this.dependencies.nowIso(),
          payload: {
            nodeId: event.nodeId,
            agentId: event.agentId,
            eventType: event.eventType,
            summary: event.summary,
            status: event.status,
            createdAt: event.createdAt,
          },
        });
      }
    }

    this.lastSnapshots.set(node.id, snapshot);
    this.publish({
      type: 'telemetry.snapshot.ready',
      ts: this.dependencies.nowIso(),
      payload: {
        nodeId: node.id,
        collectedAt,
      },
    });
  }

  private collectAgentTransitionEvents(
    nodeId: string,
    previousAgents: AgentSnapshot[],
    currentAgents: AgentSnapshot[],
    createdAt: string,
  ): AgentTimelineEvent[] {
    const previousByAgentId = new Map(previousAgents.map((agent) => [agent.agentId, agent] as const));
    const timelineEvents: AgentTimelineEvent[] = [];

    for (const agent of currentAgents) {
      const previousAgent = previousByAgentId.get(agent.agentId);
      if (!previousAgent) {
        continue;
      }

      const statusChanged = previousAgent.status !== agent.status;
      const phaseChanged = previousAgent.taskPhase !== agent.taskPhase;
      if (!statusChanged && !phaseChanged) {
        continue;
      }

      this.publish({
        type: 'agent.state.changed',
        ts: this.dependencies.nowIso(),
        payload: {
          nodeId,
          agentId: agent.agentId,
          previousStatus: previousAgent.status,
          currentStatus: agent.status,
          previousTaskPhase: previousAgent.taskPhase,
          currentTaskPhase: agent.taskPhase,
          currentTaskSummary: agent.taskSummary,
          lastProgressAt: agent.lastProgressAt,
        },
      });

      const previousPhase = previousAgent.taskPhase ?? 'unknown';
      const currentPhase = agent.taskPhase ?? 'unknown';
      const summary = agent.taskSummary ?? `Status ${previousAgent.status} -> ${agent.status}`;
      const detail = statusChanged
        ? `status changed from ${previousAgent.status} to ${agent.status}; phase ${previousPhase} -> ${currentPhase}`
        : `phase changed from ${previousPhase} to ${currentPhase}`;

      timelineEvents.push({
        nodeId,
        agentId: agent.agentId,
        sessionId: null,
        eventType: 'task.progress',
        summary,
        detail,
        status: agent.status,
        createdAt,
      });
    }

    return timelineEvents;
  }

  private handlePollingFailure(node: RegisteredNode, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : 'unknown';
    logger.warn({ err: error, nodeId: node.id }, 'node polling failed');
    this.transitionNodeStatus(node, 'degraded', undefined, errorMessage);

    const createdAt = this.dependencies.nowIso();
    const timelineEvent: AgentTimelineEvent = {
      nodeId: node.id,
      agentId: SYSTEM_AGENT_ID,
      sessionId: null,
      eventType: 'system',
      summary: 'Polling failed',
      detail: errorMessage,
      status: 'error',
      createdAt,
    };
    telemetryRepository.appendAgentTimelineEvents([timelineEvent]);
    telemetryRepository.saveEvent(node.id, 'session.event', {
      kind: 'system',
      summary: timelineEvent.summary,
      detail: timelineEvent.detail,
    }, createdAt);
    this.publish({
      type: 'timeline.event.created',
      ts: this.dependencies.nowIso(),
      payload: {
        nodeId: timelineEvent.nodeId,
        agentId: timelineEvent.agentId,
        eventType: timelineEvent.eventType,
        summary: timelineEvent.summary,
        status: timelineEvent.status,
        createdAt: timelineEvent.createdAt,
      },
    });
  }

  private transitionNodeStatus(node: RegisteredNode, next: NodeStatus, lastSeenAt?: string, reason?: string): void {
    const previous = node.status;
    node.status = next;
    if (lastSeenAt) {
      node.lastSeenAt = lastSeenAt;
    }
    nodeRepository.setStatus(node.id, next, lastSeenAt);

    if (previous === next) {
      return;
    }

    this.publish({
      type: 'node.state.changed',
      ts: this.dependencies.nowIso(),
      payload: {
        nodeId: node.id,
        from: previous,
        to: next,
        reason,
      },
    });
  }

  private scheduleReconnect(node: RegisteredNode): void {
    if (!node.autoPolling) return;
    if (node.reconnectTimer) return;

    node.reconnectAttempt += 1;
    const backoff = clamp(
      this.dependencies.reconnectMinMs * 2 ** (node.reconnectAttempt - 1),
      this.dependencies.reconnectMinMs,
      this.dependencies.reconnectMaxMs,
    );

    node.reconnectTimer = setTimeout(() => {
      node.reconnectTimer = undefined;
      void this.pollNode(node);
    }, backoff);
  }

  private publish(event: DashboardInternalEvent): void {
    this.dependencies.publishEvent(event);
  }
}

export const nodeManager = new NodeManager();
