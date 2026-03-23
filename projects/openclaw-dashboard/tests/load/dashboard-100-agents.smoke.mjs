import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'openclaw-dashboard-load-'));
const dbPath = path.join(tempRoot, 'data', 'dashboard.db');
const apiToken = 'load-test-token';
const nodeId = 'node-load-001';
let server = null;
let db = null;

function isoFromNow(offsetMs) {
  return new Date(Date.now() + offsetMs).toISOString();
}

try {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  process.env.DASHBOARD_DB_PATH = dbPath;
  process.env.DASHBOARD_API_TOKEN = apiToken;

  const { initDb } = await import('../../src/db/init.ts');
  const { createApp } = await import('../../src/app.ts');
  const { db: dbClient } = await import('../../src/db/client.ts');
  const { nodeRepository } = await import('../../src/db/repositories/nodeRepository.ts');
  const { telemetryRepository } = await import('../../src/db/repositories/telemetryRepository.ts');
  db = dbClient;
  initDb();

  nodeRepository.upsert({
    id: nodeId,
    name: 'Load Test Singapore Gateway',
    url: 'ws://load-test-gateway:18789',
    token: 'load-token',
  });
  nodeRepository.setStatus(nodeId, 'connected', isoFromNow(-1000));

  telemetryRepository.saveGateway(
    nodeId,
    { bindAddress: 'load-test-gateway', port: 18789, status: 'running' },
    isoFromNow(-1000),
  );

  for (let index = 0; index < 80; index += 1) {
    telemetryRepository.saveResources(
      nodeId,
      {
        cpuPercent: 35 + (index % 45),
        memoryUsedMb: 2048 + index * 12,
        memoryTotalMb: 16384,
      },
      isoFromNow(-(80 - index) * 15_000),
    );
  }

  telemetryRepository.upsertMessageCounters({
    nodeId,
    inbound: 98_432,
    outbound: 96_900,
    updatedAt: isoFromNow(-1000),
  });

  const agents = Array.from({ length: 128 }, (_, index) => ({
    nodeId,
    agentId: `agent-load-${String(index + 1).padStart(3, '0')}`,
    name: `agent-load-${String(index + 1).padStart(3, '0')}`,
    model: index % 2 === 0 ? 'gpt-5.4' : 'gpt-4.1',
    workspace: `/srv/load/${index + 1}`,
    configJson: null,
    status: index % 9 === 0 ? 'error' : index % 3 === 0 ? 'busy' : 'idle',
    busy: index % 3 === 0,
    taskSummary: index % 3 === 0 ? `Process queue batch #${index + 1}` : null,
    taskPhase: index % 3 === 0 ? 'executing' : null,
    taskStartedAt: index % 3 === 0 ? isoFromNow(-(index + 30) * 1000) : null,
    lastProgressAt: isoFromNow(-(index % 8) * 1000),
    staleReason: index % 25 === 0 ? 'waiting for queue slot' : null,
    updatedAt: isoFromNow(-(index % 6) * 1000),
  }));
  telemetryRepository.replaceAgents(nodeId, agents);

  telemetryRepository.replaceSessions(
    nodeId,
    agents.slice(0, 64).map((agent, index) => ({
      nodeId,
      sessionId: `session-load-${String(index + 1).padStart(3, '0')}`,
      agentId: agent.agentId,
      status: agent.status === 'error' ? 'error' : 'running',
      taskSummary: agent.taskSummary,
      taskPhase: agent.taskPhase,
      taskStartedAt: agent.taskStartedAt,
      lastProgressAt: agent.lastProgressAt,
      queueDepth: (index % 5) + 1,
      updatedAt: agent.updatedAt,
    })),
  );

  telemetryRepository.appendAgentTimelineEvents(
    Array.from({ length: 48 }, (_, index) => ({
      nodeId,
      agentId: 'agent-load-001',
      sessionId: 'session-load-001',
      eventType: 'task.progress',
      summary: `Timeline event ${index + 1}`,
      detail: `Synthetic load event ${index + 1}`,
      status: 'running',
      createdAt: isoFromNow(-(48 - index) * 60_000),
    })),
  );

  telemetryRepository.saveEvent(nodeId, 'session.output', { sessionId: 'session-load-001' }, isoFromNow(-3000));

  const app = createApp();
  server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('failed to resolve server address');
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const overviewStart = performance.now();
  const overviewResponse = await fetch(`${baseUrl}/api/overview`, {
    headers: { authorization: `Bearer ${apiToken}` },
  });
  const overviewDurationMs = performance.now() - overviewStart;
  assert.equal(overviewResponse.status, 200);
  const overviewPayload = await overviewResponse.json();
  assert.equal(overviewPayload.summary.nodeCount, 1);
  assert.equal(overviewPayload.nodes[0].agents.length, 128);
  assert.ok(overviewPayload.summary.busyAgents > 0);

  const nodeDetailStart = performance.now();
  const detailResponse = await fetch(`${baseUrl}/api/nodes/${encodeURIComponent(nodeId)}`, {
    headers: { authorization: `Bearer ${apiToken}` },
  });
  const detailDurationMs = performance.now() - nodeDetailStart;
  assert.equal(detailResponse.status, 200);
  const detailPayload = await detailResponse.json();
  assert.equal(detailPayload.agents.length, 128);

  const timelineResponse = await fetch(
    `${baseUrl}/api/nodes/${encodeURIComponent(nodeId)}/agents/agent-load-001/timeline?window=24h`,
    { headers: { authorization: `Bearer ${apiToken}` } },
  );
  assert.equal(timelineResponse.status, 200);
  const timelinePayload = await timelineResponse.json();
  assert.ok(timelinePayload.items.length > 0);

  console.log(`[dashboard-load] overview latency: ${overviewDurationMs.toFixed(2)}ms`);
  console.log(`[dashboard-load] node detail latency: ${detailDurationMs.toFixed(2)}ms`);
  console.log(`[dashboard-load] busy agents: ${overviewPayload.summary.busyAgents}`);
  console.log('[dashboard-load] passed');
} finally {
  if (server?.listening) {
    await new Promise((resolve) => server.close(resolve));
  }
  try {
    db?.close();
  } catch {
    // Ignore DB close errors during cleanup.
  }
  delete process.env.DASHBOARD_DB_PATH;
  delete process.env.DASHBOARD_API_TOKEN;
  rmSync(tempRoot, { recursive: true, force: true });
}
