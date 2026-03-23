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

test('timeline route supports window filters and query validation', async () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'openclaw-dashboard-routes-timeline-'));
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
    nodeRepository.setStatus('node-sg-01', 'connected', '2026-03-23T08:45:00.000Z');

    telemetryRepository.appendAgentTimelineEvents([
      {
        nodeId: 'node-sg-01',
        agentId: 'agent-sg-14',
        sessionId: 'session-301',
        eventType: 'task.progress',
        summary: 'Publishing queued',
        detail: 'Output package staged.',
        status: 'running',
        createdAt: '2026-03-23T08:45:00.000Z',
      },
      {
        nodeId: 'node-sg-01',
        agentId: 'agent-sg-14',
        sessionId: 'session-301',
        eventType: 'task.progress',
        summary: 'Long running preparation',
        detail: 'Preparation stage',
        status: 'running',
        createdAt: '2026-03-23T06:45:00.000Z',
      },
      {
        nodeId: 'node-sg-01',
        agentId: 'agent-sg-14',
        sessionId: 'session-301',
        eventType: 'task.progress',
        summary: 'Initial task accepted',
        detail: 'Task entered queue',
        status: 'running',
        createdAt: '2026-03-22T08:45:00.000Z',
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
    const timeline1hResponse = await fetch(
      `${baseUrl}/api/nodes/node-sg-01/agents/agent-sg-14/timeline?window=1h`,
      { headers: authHeaders() },
    );
    assert.equal(timeline1hResponse.status, 200);
    const timeline1h = (await timeline1hResponse.json()) as { items: Array<{ summary: string }> };
    assert.equal(timeline1h.items.length, 1);
    assert.equal(timeline1h.items[0]?.summary, 'Publishing queued');

    const timeline24hResponse = await fetch(
      `${baseUrl}/api/nodes/node-sg-01/agents/agent-sg-14/timeline?window=24h`,
      { headers: authHeaders() },
    );
    assert.equal(timeline24hResponse.status, 200);
    const timeline24h = (await timeline24hResponse.json()) as { items: Array<{ summary: string }> };
    assert.equal(timeline24h.items.length, 3);
    assert.equal(timeline24h.items[0]?.summary, 'Publishing queued');
    assert.equal(timeline24h.items[1]?.summary, 'Long running preparation');
    assert.equal(timeline24h.items[2]?.summary, 'Initial task accepted');

    const invalidQueryResponse = await fetch(
      `${baseUrl}/api/nodes/node-sg-01/agents/agent-sg-14/timeline?window=3h`,
      { headers: authHeaders() },
    );
    assert.equal(invalidQueryResponse.status, 400);
    const invalidQueryPayload = (await invalidQueryResponse.json()) as { error: string };
    assert.equal(invalidQueryPayload.error, 'invalid_query');

    const missingNodeResponse = await fetch(
      `${baseUrl}/api/nodes/node-missing/agents/agent-sg-14/timeline?window=1h`,
      { headers: authHeaders() },
    );
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
