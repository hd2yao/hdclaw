import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeGatewaySnapshot } from '../../src/services/rpcClient.ts';

test('normalizeGatewaySnapshot maps modern gateway payloads into dashboard snapshot', () => {
  const collectedAt = '2026-03-23T10:00:00.000Z';
  const activeUpdatedAt = Date.parse('2026-03-23T09:59:30.000Z');
  const staleUpdatedAt = Date.parse('2026-03-23T09:40:00.000Z');
  const activeIso = new Date(activeUpdatedAt).toISOString();
  const staleIso = new Date(staleUpdatedAt).toISOString();

  const snapshot = normalizeGatewaySnapshot({
    url: 'ws://127.0.0.1:18890',
    collectedAt,
    statusResult: {
      sessions: {
        byAgent: {
          0: {
            agentId: 'main',
            path: '/home/node/.openclaw/agents/main/sessions/sessions.json',
            count: 2,
            recent: [
              {
                agentId: 'main',
                key: 'agent:main:main',
                sessionId: 'session-main',
                kind: 'direct',
                updatedAt: activeUpdatedAt,
                model: 'gpt-5.4',
                displayName: 'heartbeat',
                abortedLastRun: false,
              },
            ],
          },
          1: {
            agentId: 'ops-bot',
            path: '/home/node/.openclaw/agents/ops-bot/sessions/sessions.json',
            count: 0,
            recent: [],
          },
        },
      },
    },
    agentsResult: {
      agents: [
        { id: 'main', name: 'Main' },
        { id: 'ops-bot', name: 'Ops Bot' },
      ],
    },
    sessionsResult: {
      sessions: [
        {
          key: 'agent:main:main',
          sessionId: 'session-main',
          updatedAt: activeUpdatedAt,
          kind: 'direct',
          displayName: 'heartbeat',
          model: 'gpt-5.4',
          abortedLastRun: false,
          inputTokens: 100,
          outputTokens: 25,
        },
        {
          key: 'agent:ops-bot:main',
          sessionId: 'session-ops',
          updatedAt: staleUpdatedAt,
          kind: 'group',
          displayName: 'ops bridge',
          model: 'gpt-5.3-codex',
          abortedLastRun: true,
          inputTokens: 8,
          outputTokens: 2,
        },
      ],
    },
  });

  assert.equal(snapshot.gateway.status, 'running');
  assert.equal(snapshot.gateway.bindAddress, '127.0.0.1');
  assert.equal(snapshot.gateway.port, 18890);

  assert.equal(snapshot.agents.length, 2);

  const mainAgent = snapshot.agents.find((agent) => agent.agentId === 'main');
  assert.ok(mainAgent);
  assert.equal(mainAgent.workspace, '/home/node/.openclaw/agents/main/sessions/sessions.json');
  assert.equal(mainAgent.model, 'gpt-5.4');
  assert.equal(mainAgent.taskSummary, 'heartbeat');
  assert.equal(mainAgent.taskPhase, 'direct');
  assert.equal(mainAgent.lastProgressAt, activeIso);

  const opsAgent = snapshot.agents.find((agent) => agent.agentId === 'ops-bot');
  assert.ok(opsAgent);
  assert.equal(opsAgent.workspace, '/home/node/.openclaw/agents/ops-bot/sessions/sessions.json');

  assert.equal(snapshot.sessions.length, 2);
  assert.deepEqual(snapshot.sessions[0], {
    nodeId: '',
    sessionId: 'session-main',
    agentId: 'main',
    status: 'running',
    taskSummary: 'heartbeat',
    taskPhase: 'direct',
    taskStartedAt: null,
    lastProgressAt: activeIso,
    queueDepth: 0,
    updatedAt: activeIso,
  });
  assert.deepEqual(snapshot.sessions[1], {
    nodeId: '',
    sessionId: 'session-ops',
    agentId: 'ops-bot',
    status: 'error',
    taskSummary: 'ops bridge',
    taskPhase: 'group',
    taskStartedAt: null,
    lastProgressAt: staleIso,
    queueDepth: 0,
    updatedAt: staleIso,
  });

  assert.deepEqual(snapshot.messages, {
    nodeId: '',
    inbound: 108,
    outbound: 27,
    updatedAt: activeIso,
  });
});

test('normalizeGatewaySnapshot falls back to legacy status.health payload shape', () => {
  const snapshot = normalizeGatewaySnapshot({
    url: 'ws://legacy-node:18789',
    collectedAt: '2026-03-23T10:05:00.000Z',
    statusResult: {
      health: {
        ok: true,
        agents: [
          {
            agentId: 'legacy-main',
            name: 'Legacy Main',
            sessions: {
              path: '/srv/legacy-main',
            },
          },
        ],
      },
    },
    agentsResult: {
      agents: [{ id: 'legacy-main', name: 'Legacy Main' }],
    },
    sessionsResult: {
      sessions: [],
    },
  });

  assert.equal(snapshot.gateway.status, 'running');
  assert.equal(snapshot.agents.length, 1);
  assert.equal(snapshot.agents[0]?.workspace, '/srv/legacy-main');
  assert.equal(snapshot.agents[0]?.name, 'Legacy Main');
});
