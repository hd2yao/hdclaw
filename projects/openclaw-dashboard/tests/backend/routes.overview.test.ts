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

test('overview and node detail routes return readonly monitoring payloads', async () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'openclaw-dashboard-routes-overview-'));
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
    nodeRepository.setStatus('node-sg-01', 'connected', '2026-03-23T08:15:00.000Z');

    telemetryRepository.saveGateway(
      'node-sg-01',
      { bindAddress: 'sg-core-01', port: 18789, status: 'running' },
      '2026-03-23T08:15:00.000Z',
    );
    telemetryRepository.saveResources(
      'node-sg-01',
      { cpuPercent: 52, memoryUsedMb: 2048, memoryTotalMb: 8192 },
      '2026-03-23T08:15:00.000Z',
    );
    telemetryRepository.upsertMessageCounters({
      nodeId: 'node-sg-01',
      inbound: 66,
      outbound: 63,
      updatedAt: '2026-03-23T08:15:00.000Z',
    });
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
        taskStartedAt: '2026-03-23T08:01:00.000Z',
        lastProgressAt: '2026-03-23T08:15:00.000Z',
        staleReason: null,
        updatedAt: '2026-03-23T08:15:00.000Z',
      },
    ]);
    telemetryRepository.saveEvent('node-sg-01', 'session.output', { sessionId: 'session-101' }, '2026-03-23T08:14:00.000Z');

    const app = createApp();
    server = app.listen(0);
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('failed to resolve test server address');
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const overviewResponse = await fetch(`${baseUrl}/api/overview`, { headers: authHeaders() });
    assert.equal(overviewResponse.status, 200);
    const overview = (await overviewResponse.json()) as {
      summary: { onlineNodes: number; busyAgents: number; outputsLastHour: number };
      nodes: Array<{ id: string; agents: Array<{ id: string; taskSummary: string | null }> }>;
    };
    assert.equal(overview.summary.onlineNodes, 1);
    assert.equal(overview.summary.busyAgents, 1);
    assert.equal(overview.summary.outputsLastHour, 1);
    assert.equal(overview.nodes[0]?.id, 'node-sg-01');
    assert.equal(overview.nodes[0]?.agents[0]?.taskSummary, 'Compile AI policy digest');

    const detailResponse = await fetch(`${baseUrl}/api/nodes/node-sg-01`, { headers: authHeaders() });
    assert.equal(detailResponse.status, 200);
    const detail = (await detailResponse.json()) as {
      id: string;
      resources: { cpuPercent: number | null } | null;
      agents: Array<{ id: string; taskPhase: string | null }>;
      resourceHistory: Array<unknown>;
    };
    assert.equal(detail.id, 'node-sg-01');
    assert.equal(detail.resources?.cpuPercent, 52);
    assert.equal(detail.agents[0]?.id, 'agent-sg-14');
    assert.equal(detail.agents[0]?.taskPhase, 'summarizing');
    assert.equal(detail.resourceHistory.length, 1);

    const missingResponse = await fetch(`${baseUrl}/api/nodes/node-missing`, { headers: authHeaders() });
    assert.equal(missingResponse.status, 404);
    assert.deepEqual(await missingResponse.json(), { error: 'node_not_found' });

    db.close();
  } finally {
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
    }
    delete process.env.DASHBOARD_DB_PATH;
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
