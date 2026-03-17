import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '../logger.js';
import { eventBus } from './eventBus.js';
import type { DashboardEvent } from '../types.js';

export class DashboardWsGateway {
  private wss: WebSocketServer;

  constructor(server: HttpServer) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.wss.on('connection', (socket) => {
      logger.info('dashboard websocket client connected');
      socket.send(JSON.stringify({ type: 'system.ready', ts: new Date().toISOString(), payload: { ok: true } }));
    });

    eventBus.subscribe((event) => this.broadcast(event));
  }

  broadcast(event: DashboardEvent): void {
    // 移除可能包含循环引用的字段
    const safeEvent = {
      type: event.type,
      ts: event.ts,
      payload: this.sanitizePayload(event.payload)
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
    if (Array.isArray(payload)) return payload.map(p => this.sanitizePayload(p));

    const result: any = {};
    for (const [key, value] of Object.entries(payload)) {
      // 跳过可能包含循环引用的字段
      if (key.startsWith('_') || key.includes('Timeout') || key.includes('Timer')) {
        continue;
      }
      result[key] = this.sanitizePayload(value);
    }
    return result;
  }
}
