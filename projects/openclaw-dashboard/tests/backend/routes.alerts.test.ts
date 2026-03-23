import { once } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Server } from 'node:http';

const API_TOKEN = 'change-me';

function authHeaders(): HeadersInit {
  return {
    authorization: `Bearer ${API_TOKEN}`,
    'content-type': 'application/json',
  };
}

test('alerts route supports severity/node/window filters', async () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'openclaw-dashboard-routes-alerts-'));
  const dbPath = path.join(tempRoot, 'data', 'dashboard.db');
  let server: Server | null = null;

  try {
    mkdirSync(path.dirname(dbPath), { recursive: true });
    process.env.DASHBOARD_DB_PATH = dbPath;

    const { initDb } = await import('../../src/db/init.ts');
    const { db } = await import('../../src/db/client.ts');
    const { createApp } = await import('../../src/app.ts');
    const { nodeRepository } = await import('../../src/db/repositories/nodeRepository.ts');
    const { telemetryRepository } = await import('../../src/db/repositories/telemetryRepository.ts');

    initDb();
    nodeRepository.upsert({
      id: 'node-sg-01',
      name: 'Singapore Gateway',
      url: 'ws://sg-core-01:18789',
      token: 'node-token',
    });
    nodeRepository.upsert({
      id: 'node-hk-01',
      name: 'Hongkong Gateway',
      url: 'ws://hk-core-01:18789',
      token: 'node-token',
    });

    nodeRepository.setStatus('node-sg-01', 'degraded', '2026-03-23T09:45:00.000Z');
    nodeRepository.setStatus('node-hk-01', 'connected', '2026-03-23T09:45:00.000Z');

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
        taskSummary: 'Compile digest',
        taskPhase: 'summarizing',
        taskStartedAt: '2026-03-23T09:00:00.000Z',
        lastProgressAt: '2026-03-23T09:44:00.000Z',
        staleReason: 'waiting for queue slot',
        updatedAt: '2026-03-23T09:45:00.000Z',
      },
    ]);
    telemetryRepository.replaceSessions('node-sg-01', [
      {
        nodeId: 'node-sg-01',
        sessionId: 'session-301',
        agentId: 'agent-sg-14',
        status: 'running',
        taskSummary: 'Compile digest',
        taskPhase: 'summarizing',
        taskStartedAt: '2026-03-23T09:00:00.000Z',
        lastProgressAt: '2026-03-23T09:44:00.000Z',
        queueDepth: 6,
        updatedAt: '2026-03-23T09:45:00.000Z',
      },
    ]);
    telemetryRepository.appendAgentTimelineEvents([
      {
        nodeId: 'node-sg-01',
        agentId: 'agent-sg-14',
        sessionId: 'session-301',
        eventType: 'task.failed',
        summary: 'Task failed',
        detail: 'upstream request timeout',
        status: 'error',
        createdAt: '2026-03-23T09:45:00.000Z',
      },
      {
        nodeId: 'node-sg-01',
        agentId: 'agent-sg-14',
        sessionId: 'session-301',
        eventType: 'task.completed',
        summary: 'Task recovered',
        detail: 'pipeline resumed',
        status: 'completed',
        createdAt: '2026-03-23T09:47:00.000Z',
      },
    ]);

    const app = createApp();
    server = app.listen(0);
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('failed to resolve test server address');
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const allResponse = await fetch(`${baseUrl}/api/alerts?window=24h`, { headers: authHeaders() });
    assert.equal(allResponse.status, 200);
    const allPayload = (await allResponse.json()) as {
      items: Array<{ severity: string; nodeId: string; summary: string }>;
    };
    assert.ok(allPayload.items.length >= 3);
    assert.ok(allPayload.items.some((item) => item.severity === 'critical'));
    assert.ok(allPayload.items.some((item) => item.severity === 'warning'));
    assert.ok(allPayload.items.some((item) => item.severity === 'recovered'));

    const criticalResponse = await fetch(`${baseUrl}/api/alerts?window=24h&severity=critical`, { headers: authHeaders() });
    assert.equal(criticalResponse.status, 200);
    const criticalPayload = (await criticalResponse.json()) as {
      items: Array<{ severity: string }>;
    };
    assert.ok(criticalPayload.items.length >= 1);
    assert.ok(criticalPayload.items.every((item) => item.severity === 'critical'));

    const nodeResponse = await fetch(`${baseUrl}/api/alerts?window=24h&nodeId=node-sg-01`, { headers: authHeaders() });
    assert.equal(nodeResponse.status, 200);
    const nodePayload = (await nodeResponse.json()) as {
      items: Array<{ nodeId: string }>;
    };
    assert.ok(nodePayload.items.length >= 1);
    assert.ok(nodePayload.items.every((item) => item.nodeId === 'node-sg-01'));

    const invalidQueryResponse = await fetch(`${baseUrl}/api/alerts?window=24h&severity=fatal`, { headers: authHeaders() });
    assert.equal(invalidQueryResponse.status, 400);
    assert.deepEqual(await invalidQueryResponse.json(), { error: 'invalid_query' });

    const missingNodeResponse = await fetch(`${baseUrl}/api/alerts?window=24h&nodeId=node-missing`, { headers: authHeaders() });
    assert.equal(missingNodeResponse.status, 404);
    assert.deepEqual(await missingNodeResponse.json(), { error: 'node_not_found' });

    db.close();
  } finally {
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
    }
    delete process.env.DASHBOARD_DB_PATH;
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
