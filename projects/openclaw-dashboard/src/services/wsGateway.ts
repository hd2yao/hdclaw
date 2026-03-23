import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '../logger.js';
import { eventBus } from './eventBus.js';
import type { DashboardInternalEvent } from '../types.js';
import { telemetryRepository } from '../db/repositories/telemetryRepository.js';

export class DashboardWsGateway {
  private wss: WebSocketServer;
  private unsubscribe: (() => void) | null = null;

  constructor(server: HttpServer) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.wss.on('connection', (socket) => {
      logger.info('dashboard websocket client connected');
      this.sendSnapshot(socket);
    });

    this.unsubscribe = eventBus.subscribe((event) => this.handleInternalEvent(event));
  }

  close(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.wss.close();
  }

  private sendSnapshot(socket: WebSocket): void {
    const payload = telemetryRepository.getDashboardOverview();
    socket.send(JSON.stringify({
      type: 'dashboard.snapshot',
      ts: new Date().toISOString(),
      payload: this.sanitizePayload(payload),
    }));
  }

  private handleInternalEvent(event: DashboardInternalEvent): void {
    if (event.type === 'telemetry.snapshot.ready' || event.type === 'node.state.changed') {
      const state = telemetryRepository.getLastKnownNodeState(event.payload.nodeId);
      if (!state) return;
      this.broadcast({
        type: 'node.delta',
        ts: event.ts,
        payload: {
          nodeId: state.id,
          node: state,
          reason: event.type === 'node.state.changed' ? event.payload.reason ?? null : null,
        },
      });
      return;
    }

    if (event.type === 'agent.state.changed') {
      const detail = telemetryRepository.getNodeDetail(event.payload.nodeId);
      const agent = detail?.agents.find((item) => item.id === event.payload.agentId) ?? null;
      if (!agent) return;
      this.broadcast({
        type: 'agent.delta',
        ts: event.ts,
        payload: {
          nodeId: event.payload.nodeId,
          agentId: event.payload.agentId,
          agent,
        },
      });
      return;
    }

    if (event.type === 'timeline.event.created') {
      this.broadcast({
        type: 'session.event',
        ts: event.ts,
        payload: event.payload,
      });
    }
  }

  private broadcast(event: { type: string; ts: string; payload: unknown }): void {
    const safeEvent = {
      type: event.type,
      ts: event.ts,
      payload: this.sanitizePayload(event.payload),
    };
    const data = JSON.stringify(safeEvent);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  private sanitizePayload(payload: any): any {
    if (payload === null || typeof payload !== 'object') return payload;
    if (Array.isArray(payload)) return payload.map((item) => this.sanitizePayload(item));

    const result: any = {};
    for (const [key, value] of Object.entries(payload)) {
      if (key.startsWith('_') || key.includes('Timeout') || key.includes('Timer')) {
        continue;
      }
      result[key] = this.sanitizePayload(value);
    }
    return result;
  }
}
