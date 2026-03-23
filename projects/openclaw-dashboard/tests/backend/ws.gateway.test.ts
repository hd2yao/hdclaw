import { once } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import WebSocket from 'ws';
import { eventBus } from '../../src/services/eventBus.ts';

interface WsFrame {
  type: string;
  ts: string;
  payload: unknown;
}

function waitForMessage(socket: WebSocket, label: string, timeoutMs = 3000): Promise<WsFrame> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error(`timed out waiting for websocket message (${label})`));
    }, timeoutMs);

    const onMessage = (raw: WebSocket.RawData) => {
      clearTimeout(timer);
      socket.off('message', onMessage);
      resolve(JSON.parse(String(raw)) as WsFrame);
    };

    socket.on('message', onMessage);
  });
}

test('ws gateway emits snapshot, delta events, and snapshot again after reconnect', async () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'openclaw-dashboard-ws-gateway-'));
  const dbPath = path.join(tempRoot, 'data', 'dashboard.db');
  let server: http.Server | null = null;
  let gateway: { close: () => void } | null = null;
  let socket: WebSocket | null = null;
  let reconnectSocket: WebSocket | null = null;

  try {
    mkdirSync(path.dirname(dbPath), { recursive: true });
    process.env.DASHBOARD_DB_PATH = dbPath;

    const { initDb } = await import('../../src/db/init.ts');
    const { db } = await import('../../src/db/client.ts');
    const { createApp } = await import('../../src/app.ts');
    const { DashboardWsGateway } = await import('../../src/services/wsGateway.ts');
    const { nodeRepository } = await import('../../src/db/repositories/nodeRepository.ts');
    const { telemetryRepository } = await import('../../src/db/repositories/telemetryRepository.ts');

    initDb();
    nodeRepository.upsert({
      id: 'node-sg-01',
      name: 'Singapore Gateway',
      url: 'ws://sg-core-01:18789',
      token: 'node-token',
    });
    nodeRepository.setStatus('node-sg-01', 'connected', '2026-03-23T09:00:00.000Z');
    telemetryRepository.saveGateway(
      'node-sg-01',
      { bindAddress: 'sg-core-01', port: 18789, status: 'running' },
      '2026-03-23T09:00:00.000Z',
    );
    telemetryRepository.saveResources(
      'node-sg-01',
      { cpuPercent: 43, memoryUsedMb: 2304, memoryTotalMb: 8192 },
      '2026-03-23T09:00:00.000Z',
    );
    telemetryRepository.replaceAgents('node-sg-01', [
      {
        nodeId: 'node-sg-01',
        agentId: 'agent-sg-14',
        name: 'agent-sg-14',
        model: 'gpt-5.4',
        workspace: '/srv/sg14',
        configJson: null,
        status: 'busy',
        busy: true,
        taskSummary: 'Compile AI policy digest',
        taskPhase: 'summarizing',
        taskStartedAt: '2026-03-23T08:40:00.000Z',
        lastProgressAt: '2026-03-23T09:00:00.000Z',
        staleReason: null,
        updatedAt: '2026-03-23T09:00:00.000Z',
      },
    ]);

    const app = createApp();
    server = http.createServer(app);
    gateway = new DashboardWsGateway(server);
    server.listen(0);
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('failed to resolve test server address');
    }

    const wsUrl = `ws://127.0.0.1:${address.port}/ws`;
    socket = new WebSocket(wsUrl);
    const firstFramePromise = waitForMessage(socket, 'dashboard.snapshot');
    await once(socket, 'open');
    const firstFrame = await firstFramePromise;
    assert.equal(firstFrame.type, 'dashboard.snapshot');
    const snapshotPayload = firstFrame.payload as {
      summary?: { nodeCount?: number };
      nodes?: Array<{ id: string }>;
    };
    assert.equal(snapshotPayload.summary?.nodeCount, 1);
    assert.equal(snapshotPayload.nodes?.[0]?.id, 'node-sg-01');

    nodeRepository.setStatus('node-sg-01', 'degraded', '2026-03-23T09:01:00.000Z');
    const nodeDeltaPromise = waitForMessage(socket, 'node.delta');
    eventBus.publish({
      type: 'node.state.changed',
      ts: '2026-03-23T09:01:00.000Z',
      payload: {
        nodeId: 'node-sg-01',
        from: 'connected',
        to: 'degraded',
        reason: 'polling failed',
      },
    });
    const nodeDelta = await nodeDeltaPromise;
    assert.equal(nodeDelta.type, 'node.delta');
    const nodeDeltaPayload = nodeDelta.payload as {
      node?: { id?: string; status?: string };
      reason?: string | null;
    };
    assert.equal(nodeDeltaPayload.node?.id, 'node-sg-01');
    assert.equal(nodeDeltaPayload.node?.status, 'degraded');
    assert.equal(nodeDeltaPayload.reason, 'polling failed');

    telemetryRepository.replaceAgents('node-sg-01', [
      {
        nodeId: 'node-sg-01',
        agentId: 'agent-sg-14',
        name: 'agent-sg-14',
        model: 'gpt-5.4',
        workspace: '/srv/sg14',
        configJson: null,
        status: 'idle',
        busy: false,
        taskSummary: 'Compile AI policy digest',
        taskPhase: 'publishing',
        taskStartedAt: '2026-03-23T08:40:00.000Z',
        lastProgressAt: '2026-03-23T09:02:00.000Z',
        staleReason: null,
        updatedAt: '2026-03-23T09:02:00.000Z',
      },
    ]);
    const agentDeltaPromise = waitForMessage(socket, 'agent.delta');
    eventBus.publish({
      type: 'agent.state.changed',
      ts: '2026-03-23T09:02:00.000Z',
      payload: {
        nodeId: 'node-sg-01',
        agentId: 'agent-sg-14',
        previousStatus: 'busy',
        currentStatus: 'idle',
        previousTaskPhase: 'summarizing',
        currentTaskPhase: 'publishing',
        currentTaskSummary: 'Compile AI policy digest',
        lastProgressAt: '2026-03-23T09:02:00.000Z',
      },
    });
    const agentDelta = await agentDeltaPromise;
    assert.equal(agentDelta.type, 'agent.delta');
    const agentDeltaPayload = agentDelta.payload as {
      nodeId?: string;
      agentId?: string;
      agent?: { status?: string; taskPhase?: string | null };
    };
    assert.equal(agentDeltaPayload.nodeId, 'node-sg-01');
    assert.equal(agentDeltaPayload.agentId, 'agent-sg-14');
    assert.equal(agentDeltaPayload.agent?.status, 'idle');
    assert.equal(agentDeltaPayload.agent?.taskPhase, 'publishing');

    const sessionEventPromise = waitForMessage(socket, 'session.event');
    eventBus.publish({
      type: 'timeline.event.created',
      ts: '2026-03-23T09:03:00.000Z',
      payload: {
        nodeId: 'node-sg-01',
        agentId: 'agent-sg-14',
        eventType: 'task.progress',
        summary: 'Publishing queued',
        status: 'running',
        createdAt: '2026-03-23T09:03:00.000Z',
      },
    });
    const sessionEvent = await sessionEventPromise;
    assert.equal(sessionEvent.type, 'session.event');
    const sessionEventPayload = sessionEvent.payload as { summary?: string; eventType?: string };
    assert.equal(sessionEventPayload.summary, 'Publishing queued');
    assert.equal(sessionEventPayload.eventType, 'task.progress');

    socket.close();
    await once(socket, 'close');
    reconnectSocket = new WebSocket(wsUrl);
    const reconnectFramePromise = waitForMessage(reconnectSocket, 'dashboard.snapshot.reconnect');
    await once(reconnectSocket, 'open');
    const reconnectFrame = await reconnectFramePromise;
    assert.equal(reconnectFrame.type, 'dashboard.snapshot');

    reconnectSocket.close();
    await once(reconnectSocket, 'close');

    gateway.close();
    server.close();
    db.close();
  } finally {
    socket?.removeAllListeners();
    reconnectSocket?.removeAllListeners();
    try {
      socket?.close();
      reconnectSocket?.close();
      socket?.terminate();
      reconnectSocket?.terminate();
    } catch {
      // Ignore socket teardown errors in cleanup.
    }
    try {
      gateway?.close();
    } catch {
      // Ignore gateway teardown errors in cleanup.
    }
    if (server?.listening) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
    }
    delete process.env.DASHBOARD_DB_PATH;
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
