import type { DashboardSnapshot, SessionEvent } from '../types/dashboard';

const now = Date.now();
const timestamps = Array.from({ length: 12 }, (_, index) => new Date(now - (11 - index) * 60_000).toISOString());

export const mockSnapshot: DashboardSnapshot = {
  generatedAt: new Date(now).toISOString(),
  nodes: [
    {
      id: 'node-sg-01',
      name: 'Singapore Gateway',
      region: 'ap-southeast-1',
      endpoint: 'wss://sg.openclaw.internal',
      status: 'online',
      agentsOnline: 98,
      totalAgents: 124,
      cpu: 64,
      memory: 71,
      messages: { sent: 12440, received: 12980, errors: 18 },
      lastHeartbeat: new Date(now - 6_000).toISOString(),
      resourceHistory: timestamps.map((timestamp, index) => ({ timestamp, cpu: 52 + index, memory: 61 + Math.round(index * 0.8) })),
      agents: Array.from({ length: 18 }, (_, index) => ({
        id: `sg-agent-${index + 1}`,
        name: `frontend-developer-${index + 1}`,
        role: index % 3 === 0 ? 'frontend-developer' : index % 3 === 1 ? 'backend-architect' : 'ops-automator',
        sessionId: `sess-sg-${index + 1}`,
        status: index % 7 === 0 ? 'error' : index % 5 === 0 ? 'completed' : 'running',
        cpu: 20 + (index % 6) * 8,
        memory: 30 + (index % 5) * 10,
        messages: { sent: 100 + index * 9, received: 130 + index * 11, errors: index % 7 === 0 ? 2 : 0 },
        updatedAt: new Date(now - index * 15_000).toISOString(),
      })),
    },
    {
      id: 'node-fra-01',
      name: 'Frankfurt Edge',
      region: 'eu-central-1',
      endpoint: 'wss://fra.openclaw.internal',
      status: 'degraded',
      agentsOnline: 76,
      totalAgents: 112,
      cpu: 81,
      memory: 88,
      messages: { sent: 9320, received: 9011, errors: 42 },
      lastHeartbeat: new Date(now - 17_000).toISOString(),
      resourceHistory: timestamps.map((timestamp, index) => ({ timestamp, cpu: 74 + Math.round(index * 0.6), memory: 80 + Math.round(index * 0.5) })),
      agents: Array.from({ length: 14 }, (_, index) => ({
        id: `fra-agent-${index + 1}`,
        name: `agent-${index + 1}`,
        role: index % 2 === 0 ? 'qa-engineer' : 'devops-automator',
        sessionId: `sess-fra-${index + 1}`,
        status: index % 6 === 0 ? 'queued' : index % 5 === 0 ? 'error' : 'running',
        cpu: 28 + (index % 4) * 11,
        memory: 40 + (index % 4) * 12,
        messages: { sent: 80 + index * 7, received: 90 + index * 8, errors: index % 5 === 0 ? 1 : 0 },
        updatedAt: new Date(now - index * 21_000).toISOString(),
      })),
    },
    {
      id: 'node-iad-01',
      name: 'Virginia Core',
      region: 'us-east-1',
      endpoint: 'wss://iad.openclaw.internal',
      status: 'offline',
      agentsOnline: 0,
      totalAgents: 109,
      cpu: 0,
      memory: 0,
      messages: { sent: 0, received: 0, errors: 0 },
      lastHeartbeat: new Date(now - 180_000).toISOString(),
      resourceHistory: timestamps.map((timestamp) => ({ timestamp, cpu: 0, memory: 0 })),
      agents: [],
    },
  ],
};

export const mockSessionHistory: Record<string, SessionEvent[]> = {
  'sg-agent-1': [
    {
      id: 'evt-1',
      timestamp: new Date(now - 120_000).toISOString(),
      type: 'status',
      summary: 'Session started',
      detail: 'Agent picked up dashboard redesign task.',
      status: 'running',
    },
    {
      id: 'evt-2',
      timestamp: new Date(now - 90_000).toISOString(),
      type: 'message',
      summary: 'Subagent spawned',
      detail: 'Spawned frontend-developer child for chart refactor.',
      status: 'running',
    },
    {
      id: 'evt-3',
      timestamp: new Date(now - 30_000).toISOString(),
      type: 'system',
      summary: 'Checkpoint saved',
      detail: 'Persisted latest UI snapshot to workspace.',
      status: 'running',
    },
  ],
};
