import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { NodeTelemetryPayload } from '../../src/types.ts';

test('NodeManager degrades on polling failure and preserves last snapshot state', async () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'openclaw-dashboard-node-manager-'));
  const dbPath = path.join(tempRoot, 'data', 'dashboard.db');

  try {
    mkdirSync(path.dirname(dbPath), { recursive: true });
    process.env.DASHBOARD_DB_PATH = dbPath;

    const { initDb } = await import('../../src/db/init.ts');
    const { telemetryRepository } = await import('../../src/db/repositories/telemetryRepository.ts');
    const { NodeManager } = await import('../../src/services/nodeManager.ts');
    const { db } = await import('../../src/db/client.ts');
    initDb();

    const snapshots: Array<object | Error> = [
      {
        gateway: {
          bindAddress: 'sg-core-01',
          port: 18789,
          status: 'running',
        },
        resources: {
          cpuPercent: 28,
          memoryUsedMb: 1536,
          memoryTotalMb: 8192,
        },
        agents: [
          {
            nodeId: '',
            agentId: 'agent-sg-14',
            name: 'agent-sg-14',
            model: 'gpt-5.4',
            workspace: '/srv/sg14',
            configJson: null,
            status: 'idle',
            busy: false,
            taskSummary: null,
            taskPhase: null,
            taskStartedAt: null,
            lastProgressAt: null,
            staleReason: null,
            updatedAt: '2026-03-23T08:00:00.000Z',
          },
        ],
        sessions: [],
        messages: {
          nodeId: '',
          inbound: 10,
          outbound: 9,
          updatedAt: '2026-03-23T08:00:00.000Z',
        },
        collectedAt: '2026-03-23T08:00:00.000Z',
      },
      new Error('schema mismatch: malformed payload'),
      new Error('schema mismatch: malformed payload'),
    ];
    const emittedEvents: Array<{ type: string; payload: unknown }> = [];
    const manager = new NodeManager({
      createRpcClient: () => ({
        collectSnapshot: async () => {
          const next = snapshots.shift();
          if (next instanceof Error) {
            throw next;
          }
          if (!next) {
            throw new Error('missing queued snapshot');
          }
          return next as NodeTelemetryPayload;
        },
      }),
      publishEvent: (event) => {
        emittedEvents.push({ type: event.type, payload: event.payload });
      },
      nowIso: () => '2026-03-23T08:00:03.000Z',
      pollIntervalMs: 10_000,
      reconnectMinMs: 1_000,
      reconnectMaxMs: 1_000,
    });

    const node = manager.registerNode(
      {
        id: 'node-sg-01',
        name: 'Singapore Gateway',
        url: 'ws://sg-core-01:18789',
        token: 'node-token',
      },
      { autoStartPolling: false },
    );

    await manager.pollNodeOnce(node.id);
    await manager.pollNodeOnce(node.id);
    await manager.pollNodeOnce(node.id);

    const overview = telemetryRepository.getDashboardOverview();
    assert.equal(overview.summary.onlineNodes, 0);
    assert.equal(overview.summary.degradedNodes, 1);
    assert.equal(overview.nodes[0]?.status, 'degraded');

    const state = telemetryRepository.getLastKnownNodeState(node.id);
    assert.equal(state?.gateway?.bindAddress, 'sg-core-01');
    assert.equal(state?.resources?.memoryUsedMb, 1536);

    const systemTimeline = telemetryRepository.getAgentTimeline(node.id, '__system__', '1h');
    assert.equal(systemTimeline.length, 1);
    assert.equal(systemTimeline[0]?.summary, 'Polling failed');
    assert.equal(systemTimeline[0]?.detail, 'schema mismatch: malformed payload');

    const nodeStateEvents = emittedEvents.filter((event) => event.type === 'node.state.changed');
    assert.ok(nodeStateEvents.length >= 2);
    assert.ok(
      nodeStateEvents.some((event) => {
        const payload = event.payload as { from?: string; to?: string };
        return payload.from === 'disconnected' && payload.to === 'connected';
      }),
    );
    assert.ok(
      nodeStateEvents.some((event) => {
        const payload = event.payload as { from?: string; to?: string };
        return payload.from === 'connected' && payload.to === 'degraded';
      }),
    );

    manager.stop();
    db.close();
  } finally {
    delete process.env.DASHBOARD_DB_PATH;
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
