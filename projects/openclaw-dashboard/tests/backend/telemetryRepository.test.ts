import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';

test('telemetryRepository persists task fields and exposes timeline and overview queries', async () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'openclaw-dashboard-telemetry-'));
  const dbPath = path.join(tempRoot, 'data', 'dashboard.db');

  try {
    mkdirSync(path.dirname(dbPath), { recursive: true });
    process.env.DASHBOARD_DB_PATH = dbPath;

    const { initDb } = await import('../../src/db/init.ts');
    const { db } = await import('../../src/db/client.ts');
    const { nodeRepository } = await import('../../src/db/repositories/nodeRepository.ts');
    const { telemetryRepository } = await import('../../src/db/repositories/telemetryRepository.ts');

    initDb();

    nodeRepository.upsert({
      id: 'node-sg-01',
      name: 'Singapore Gateway',
      url: 'ws://sg-core-01:18789',
      token: 'node-token',
    });
    nodeRepository.setStatus('node-sg-01', 'connected', '2026-03-17T10:42:00.000Z');

    telemetryRepository.saveGateway(
      'node-sg-01',
      { bindAddress: 'sg-core-01', port: 18789, status: 'running' },
      '2026-03-17T10:42:00.000Z',
    );
    telemetryRepository.saveResources(
      'node-sg-01',
      { cpuPercent: 41, memoryUsedMb: 2048, memoryTotalMb: 8192 },
      '2026-03-17T10:39:00.000Z',
    );
    telemetryRepository.saveResources(
      'node-sg-01',
      { cpuPercent: 63, memoryUsedMb: 3072, memoryTotalMb: 8192 },
      '2026-03-17T10:42:00.000Z',
    );
    telemetryRepository.upsertMessageCounters({
      nodeId: 'node-sg-01',
      inbound: 120,
      outbound: 108,
      updatedAt: '2026-03-17T10:42:00.000Z',
    });

    telemetryRepository.replaceAgents('node-sg-01', [
      {
        nodeId: 'node-sg-01',
        agentId: 'agent-sg-14',
        name: 'agent-sg-14',
        model: 'gpt-5.4',
        workspace: '/srv/sg14',
        configJson: '{"role":"research"}',
        status: 'busy',
        busy: true,
        taskSummary: 'Compile AI policy digest',
        taskPhase: 'summarizing',
        taskStartedAt: '2026-03-17T10:27:00.000Z',
        lastProgressAt: '2026-03-17T10:42:00.000Z',
        staleReason: null,
        updatedAt: '2026-03-17T10:42:00.000Z',
      },
      {
        nodeId: 'node-sg-01',
        agentId: 'agent-sg-03',
        name: 'agent-sg-03',
        model: 'gpt-4.1',
        workspace: '/srv/sg03',
        configJson: null,
        status: 'idle',
        busy: false,
        taskSummary: null,
        taskPhase: null,
        taskStartedAt: null,
        lastProgressAt: null,
        staleReason: 'waiting for queue',
        updatedAt: '2026-03-17T10:42:00.000Z',
      },
    ]);

    telemetryRepository.replaceSessions('node-sg-01', [
      {
        nodeId: 'node-sg-01',
        sessionId: 'session-77',
        agentId: 'agent-sg-14',
        status: 'running',
        taskSummary: 'Compile AI policy digest',
        taskPhase: 'summarizing',
        taskStartedAt: '2026-03-17T10:27:00.000Z',
        lastProgressAt: '2026-03-17T10:42:00.000Z',
        queueDepth: 2,
        updatedAt: '2026-03-17T10:42:00.000Z',
      },
    ]);

    telemetryRepository.appendAgentTimelineEvents([
      {
        nodeId: 'node-sg-01',
        agentId: 'agent-sg-14',
        sessionId: 'session-77',
        eventType: 'task.progress',
        summary: 'Publishing queued',
        detail: 'Output package staged for review.',
        status: 'running',
        createdAt: '2026-03-17T10:42:00.000Z',
      },
      {
        nodeId: 'node-sg-01',
        agentId: 'agent-sg-14',
        sessionId: 'session-77',
        eventType: 'task.progress',
        summary: 'Initial task accepted',
        detail: 'Task entered execution queue.',
        status: 'running',
        createdAt: '2026-03-16T07:42:00.000Z',
      },
    ]);

    telemetryRepository.saveEvent('node-sg-01', 'session.output', { sessionId: 'session-77' }, '2026-03-17T10:41:00.000Z');

    const overview = telemetryRepository.getDashboardOverview();
    assert.equal(overview.summary.onlineNodes, 1);
    assert.equal(overview.summary.busyAgents, 1);
    assert.equal(overview.summary.outputsLastHour, 1);
    assert.equal(overview.nodes[0]?.agents[0]?.taskSummary, 'Compile AI policy digest');
    assert.equal(overview.nodes[0]?.resources?.cpuPercent, 63);

    const timeline1h = telemetryRepository.getAgentTimeline('node-sg-01', 'agent-sg-14', '1h');
    assert.equal(timeline1h.length, 1);
    assert.equal(timeline1h[0]?.summary, 'Publishing queued');

    const timeline24h = telemetryRepository.getAgentTimeline('node-sg-01', 'agent-sg-14', '24h');
    assert.equal(timeline24h.length, 1);

    const nodeState = telemetryRepository.getLastKnownNodeState('node-sg-01');
    assert.ok(nodeState);
    assert.equal(nodeState?.messages?.outbound, 108);
    assert.equal(nodeState?.gateway?.bindAddress, 'sg-core-01');
    assert.equal(nodeState?.resources?.memoryUsedMb, 3072);

    const legacyOverview = telemetryRepository.getOverview() as Array<{ id: string; agents: Array<{ id: string; status: string }> }>;
    assert.equal(legacyOverview[0]?.id, 'node-sg-01');
    assert.equal(legacyOverview[0]?.agents[0]?.id, 'agent-sg-03');

    db.close();
  } finally {
    delete process.env.DASHBOARD_DB_PATH;
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
