import http from 'node:http';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const port = Number(process.env.PORT ?? 3300);
const apiToken = process.env.DASHBOARD_API_TOKEN ?? 'e2e-token';
const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'openclaw-dashboard-e2e-'));
const dbPath = path.join(tempRoot, 'data', 'dashboard.db');

mkdirSync(path.dirname(dbPath), { recursive: true });
process.env.DASHBOARD_DB_PATH = dbPath;
process.env.DASHBOARD_API_TOKEN = apiToken;

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
nodeRepository.setStatus('node-sg-01', 'degraded', '2026-03-23T10:00:00.000Z');

telemetryRepository.saveGateway(
  'node-sg-01',
  { bindAddress: 'sg-core-01', port: 18789, status: 'running' },
  '2026-03-23T10:00:00.000Z',
);
telemetryRepository.saveResources(
  'node-sg-01',
  { cpuPercent: 52, memoryUsedMb: 2048, memoryTotalMb: 8192 },
  '2026-03-23T10:00:00.000Z',
);
telemetryRepository.upsertMessageCounters({
  nodeId: 'node-sg-01',
  inbound: 120,
  outbound: 108,
  updatedAt: '2026-03-23T10:00:00.000Z',
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
    taskStartedAt: '2026-03-23T09:42:00.000Z',
    lastProgressAt: '2026-03-23T10:00:00.000Z',
    staleReason: 'waiting for queue slot',
    updatedAt: '2026-03-23T10:00:00.000Z',
  },
  {
    nodeId: 'node-sg-01',
    agentId: 'agent-sg-21',
    name: 'agent-sg-21',
    model: 'gpt-5.3-codex',
    workspace: '/srv/sg21',
    configJson: null,
    status: 'idle',
    busy: false,
    taskSummary: 'Idle',
    taskPhase: 'standby',
    taskStartedAt: null,
    lastProgressAt: '2026-03-23T09:58:00.000Z',
    staleReason: null,
    updatedAt: '2026-03-23T09:58:00.000Z',
  },
]);
telemetryRepository.replaceSessions('node-sg-01', [
  {
    nodeId: 'node-sg-01',
    sessionId: 'session-301',
    agentId: 'agent-sg-14',
    status: 'running',
    taskSummary: 'Compile AI policy digest',
    taskPhase: 'summarizing',
    taskStartedAt: '2026-03-23T09:42:00.000Z',
    lastProgressAt: '2026-03-23T10:00:00.000Z',
    queueDepth: 4,
    updatedAt: '2026-03-23T10:00:00.000Z',
  },
]);
telemetryRepository.appendAgentTimelineEvents([
  {
    nodeId: 'node-sg-01',
    agentId: 'agent-sg-14',
    sessionId: 'session-301',
    eventType: 'task.progress',
    summary: 'Publishing queued',
    detail: 'Output package staged.',
    status: 'running',
    createdAt: '2026-03-23T09:58:00.000Z',
  },
  {
    nodeId: 'node-sg-01',
    agentId: 'agent-sg-14',
    sessionId: 'session-301',
    eventType: 'task.failed',
    summary: 'Task failed',
    detail: 'upstream request timeout',
    status: 'error',
    createdAt: '2026-03-23T09:59:00.000Z',
  },
  {
    nodeId: 'node-sg-01',
    agentId: 'agent-sg-14',
    sessionId: 'session-301',
    eventType: 'task.completed',
    summary: 'Task recovered',
    detail: 'pipeline resumed',
    status: 'completed',
    createdAt: '2026-03-23T10:00:00.000Z',
  },
]);

const app = createApp();
const server = http.createServer(app);

await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
console.log(`[dashboard-e2e] backend listening on http://127.0.0.1:${port}`);

let cleaned = false;
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  try {
    db.close();
  } catch {
    // Ignore close errors in teardown.
  }
  rmSync(tempRoot, { recursive: true, force: true });
}

process.on('SIGTERM', () => {
  server.close(() => {
    cleanup();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  server.close(() => {
    cleanup();
    process.exit(0);
  });
});
