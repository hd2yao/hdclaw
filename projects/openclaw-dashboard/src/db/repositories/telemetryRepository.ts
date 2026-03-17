import { db } from '../client.js';
import type {
  AgentSnapshot,
  AgentTimelineEvent,
  DashboardAgentSummary,
  DashboardGatewayState,
  DashboardNodeDetail,
  DashboardNodeHealth,
  DashboardNodeResources,
  DashboardNodeState,
  DashboardOverviewNode,
  DashboardOverviewResponse,
  DashboardSummary,
  GatewaySnapshot,
  MessageCounterSnapshot,
  ResourceSnapshot,
  SessionSnapshot,
  TimelineWindow,
} from '../../types.js';

interface NodeRow {
  id: string;
  name: string;
  url: string;
  status: string;
  last_seen_at: string | null;
}

interface AgentRow {
  node_id: string;
  agent_id: string;
  name: string;
  model: string | null;
  workspace: string | null;
  status: string;
  busy: number;
  task_summary: string | null;
  task_phase: string | null;
  task_started_at: string | null;
  last_progress_at: string | null;
  stale_reason: string | null;
  last_seen_at: string;
}

interface GatewayRow {
  node_id: string;
  bind_address: string | null;
  port: number | null;
  status: 'running' | 'stopped' | 'unknown';
  collected_at: string;
}

interface ResourceRow {
  node_id: string;
  cpu_percent: number | null;
  memory_used_mb: number | null;
  memory_total_mb: number | null;
  collected_at: string;
}

interface MessageCounterRow {
  node_id: string;
  inbound_count: number;
  outbound_count: number;
  updated_at: string;
}

function toDashboardNodeHealth(status: string): DashboardNodeHealth {
  if (status === 'connected') return 'online';
  if (status === 'degraded') return 'degraded';
  return 'offline';
}

function toDashboardAgentSummary(row: AgentRow): DashboardAgentSummary {
  return {
    id: row.agent_id,
    name: row.name,
    model: row.model,
    workspace: row.workspace,
    status: row.status,
    busy: row.busy === 1,
    taskSummary: row.task_summary,
    taskPhase: row.task_phase,
    taskStartedAt: row.task_started_at,
    lastProgressAt: row.last_progress_at,
    staleReason: row.stale_reason,
    updatedAt: row.last_seen_at,
  };
}

function toDashboardGatewayState(row: GatewayRow | undefined): DashboardGatewayState | null {
  if (!row) return null;
  return {
    bindAddress: row.bind_address,
    port: row.port,
    status: row.status,
    collectedAt: row.collected_at,
  };
}

function toDashboardNodeResources(row: ResourceRow | undefined): DashboardNodeResources | null {
  if (!row) return null;
  return {
    cpuPercent: row.cpu_percent,
    memoryUsedMb: row.memory_used_mb,
    memoryTotalMb: row.memory_total_mb,
    collectedAt: row.collected_at,
  };
}

function toMessageCounters(row: MessageCounterRow | undefined): MessageCounterSnapshot | null {
  if (!row) return null;
  return {
    nodeId: row.node_id,
    inbound: row.inbound_count,
    outbound: row.outbound_count,
    updatedAt: row.updated_at,
  };
}

function maxIso(values: Array<string | null | undefined>): string {
  const filtered = values.filter((value): value is string => typeof value === 'string' && value.length > 0);
  if (filtered.length === 0) {
    return new Date().toISOString();
  }

  return filtered.reduce((latest, current) => (current > latest ? current : latest));
}

function subtractWindow(referenceIso: string, window: TimelineWindow): string {
  const reference = new Date(referenceIso).getTime();
  const delta = window === '1h' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  return new Date(reference - delta).toISOString();
}

export const telemetryRepository = {
  saveGateway(nodeId: string, gateway: GatewaySnapshot, collectedAt: string): void {
    db.prepare('INSERT INTO gateway_snapshots (node_id, bind_address, port, status, collected_at) VALUES (?, ?, ?, ?, ?)')
      .run(nodeId, gateway.bindAddress, gateway.port, gateway.status, collectedAt);
  },

  saveResources(nodeId: string, resources: ResourceSnapshot, collectedAt: string): void {
    db.prepare('INSERT INTO resource_snapshots (node_id, cpu_percent, memory_used_mb, memory_total_mb, collected_at) VALUES (?, ?, ?, ?, ?)')
      .run(nodeId, resources.cpuPercent, resources.memoryUsedMb, resources.memoryTotalMb, collectedAt);
  },

  replaceAgents(nodeId: string, agents: AgentSnapshot[]): void {
    const deleteStmt = db.prepare('DELETE FROM agents WHERE node_id = ?');
    const insertStmt = db.prepare(`
      INSERT INTO agents (
        node_id, agent_id, name, model, workspace, config_json, status, busy,
        task_summary, task_phase, task_started_at, last_progress_at, stale_reason, last_seen_at
      )
      VALUES (
        @nodeId, @agentId, @name, @model, @workspace, @configJson, @status, @busy,
        @taskSummary, @taskPhase, @taskStartedAt, @lastProgressAt, @staleReason, @updatedAt
      )
    `);
    const tx = db.transaction((items: AgentSnapshot[]) => {
      deleteStmt.run(nodeId);
      for (const item of items) {
        insertStmt.run({ ...item, busy: item.busy ? 1 : 0 });
      }
    });
    tx(agents);
  },

  replaceSessions(nodeId: string, sessions: SessionSnapshot[]): void {
    const deleteStmt = db.prepare('DELETE FROM sessions WHERE node_id = ?');
    const insertStmt = db.prepare(`
      INSERT INTO sessions (
        node_id, session_id, agent_id, status, task_summary, task_phase,
        task_started_at, last_progress_at, queue_depth, last_seen_at
      )
      VALUES (
        @nodeId, @sessionId, @agentId, @status, @taskSummary, @taskPhase,
        @taskStartedAt, @lastProgressAt, @queueDepth, @updatedAt
      )
    `);
    const tx = db.transaction((items: SessionSnapshot[]) => {
      deleteStmt.run(nodeId);
      for (const item of items) {
        insertStmt.run(item);
      }
    });
    tx(sessions);
  },

  upsertMessageCounters(snapshot: MessageCounterSnapshot): void {
    db.prepare(`
      INSERT INTO message_counters (node_id, inbound_count, outbound_count, updated_at)
      VALUES (@nodeId, @inbound, @outbound, @updatedAt)
      ON CONFLICT(node_id) DO UPDATE SET
        inbound_count = excluded.inbound_count,
        outbound_count = excluded.outbound_count,
        updated_at = excluded.updated_at
    `).run(snapshot);
  },

  appendAgentTimelineEvents(events: AgentTimelineEvent[]): void {
    const insertStmt = db.prepare(`
      INSERT INTO agent_timeline_events (
        node_id, agent_id, session_id, event_type, summary, detail, status, created_at
      )
      VALUES (@nodeId, @agentId, @sessionId, @eventType, @summary, @detail, @status, @createdAt)
    `);

    const tx = db.transaction((items: AgentTimelineEvent[]) => {
      for (const item of items) {
        insertStmt.run(item);
      }
    });

    tx(events);
  },

  saveEvent(nodeId: string | null, eventType: string, payload: unknown, createdAt: string): void {
    db.prepare('INSERT INTO events (node_id, event_type, payload_json, created_at) VALUES (?, ?, ?, ?)')
      .run(nodeId, eventType, JSON.stringify(payload), createdAt);
  },

  getLastKnownNodeState(nodeId: string): DashboardNodeState | null {
    const node = db.prepare('SELECT id, name, url, status, last_seen_at FROM nodes WHERE id = ?').get(nodeId) as NodeRow | undefined;
    if (!node) {
      return null;
    }

    const gateway = db.prepare(`
      SELECT node_id, bind_address, port, status, collected_at
      FROM gateway_snapshots
      WHERE node_id = ?
      ORDER BY collected_at DESC
      LIMIT 1
    `).get(nodeId) as GatewayRow | undefined;

    const resources = db.prepare(`
      SELECT node_id, cpu_percent, memory_used_mb, memory_total_mb, collected_at
      FROM resource_snapshots
      WHERE node_id = ?
      ORDER BY collected_at DESC
      LIMIT 1
    `).get(nodeId) as ResourceRow | undefined;

    const messages = db.prepare(`
      SELECT node_id, inbound_count, outbound_count, updated_at
      FROM message_counters
      WHERE node_id = ?
    `).get(nodeId) as MessageCounterRow | undefined;

    return {
      id: node.id,
      name: node.name,
      url: node.url,
      status: toDashboardNodeHealth(node.status),
      lastSeenAt: node.last_seen_at,
      gateway: toDashboardGatewayState(gateway),
      resources: toDashboardNodeResources(resources),
      messages: toMessageCounters(messages),
    };
  },

  getNodeDetail(nodeId: string): DashboardNodeDetail | null {
    const state = this.getLastKnownNodeState(nodeId);
    if (!state) {
      return null;
    }

    const agents = db.prepare(`
      SELECT
        node_id, agent_id, name, model, workspace, status, busy,
        task_summary, task_phase, task_started_at, last_progress_at, stale_reason, last_seen_at
      FROM agents
      WHERE node_id = ?
      ORDER BY busy DESC, name ASC
    `).all(nodeId) as AgentRow[];

    const resourceHistoryRows = db.prepare(`
      SELECT node_id, cpu_percent, memory_used_mb, memory_total_mb, collected_at
      FROM resource_snapshots
      WHERE node_id = ?
      ORDER BY collected_at DESC
      LIMIT 60
    `).all(nodeId) as ResourceRow[];

    return {
      ...state,
      agents: agents.map(toDashboardAgentSummary),
      resourceHistory: resourceHistoryRows
        .map((row) => toDashboardNodeResources(row))
        .filter((row): row is DashboardNodeResources => row !== null),
    };
  },

  getAgentTimeline(nodeId: string, agentId: string, window: TimelineWindow): AgentTimelineEvent[] {
    const latest = db.prepare(`
      SELECT created_at
      FROM agent_timeline_events
      WHERE node_id = ? AND agent_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(nodeId, agentId) as { created_at: string } | undefined;

    const referenceIso = latest?.created_at ?? new Date().toISOString();
    const cutoff = subtractWindow(referenceIso, window);

    const rows = db.prepare(`
      SELECT id, node_id, agent_id, session_id, event_type, summary, detail, status, created_at
      FROM agent_timeline_events
      WHERE node_id = ? AND agent_id = ? AND created_at >= ?
      ORDER BY created_at DESC
    `).all(nodeId, agentId, cutoff) as Array<{
      id: number;
      node_id: string;
      agent_id: string;
      session_id: string | null;
      event_type: string;
      summary: string;
      detail: string | null;
      status: string | null;
      created_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      nodeId: row.node_id,
      agentId: row.agent_id,
      sessionId: row.session_id,
      eventType: row.event_type,
      summary: row.summary,
      detail: row.detail,
      status: row.status,
      createdAt: row.created_at,
    }));
  },

  getDashboardOverview(): DashboardOverviewResponse {
    const nodes = db.prepare('SELECT id, name, url, status, last_seen_at FROM nodes ORDER BY name ASC').all() as NodeRow[];
    const agents = db.prepare(`
      SELECT
        node_id, agent_id, name, model, workspace, status, busy,
        task_summary, task_phase, task_started_at, last_progress_at, stale_reason, last_seen_at
      FROM agents
      ORDER BY busy DESC, name ASC
    `).all() as AgentRow[];

    const gateways = db.prepare(`
      SELECT gs.node_id, gs.bind_address, gs.port, gs.status, gs.collected_at
      FROM gateway_snapshots gs
      INNER JOIN (
        SELECT node_id, MAX(collected_at) AS collected_at
        FROM gateway_snapshots
        GROUP BY node_id
      ) latest
        ON latest.node_id = gs.node_id AND latest.collected_at = gs.collected_at
    `).all() as GatewayRow[];

    const resources = db.prepare(`
      SELECT rs.node_id, rs.cpu_percent, rs.memory_used_mb, rs.memory_total_mb, rs.collected_at
      FROM resource_snapshots rs
      INNER JOIN (
        SELECT node_id, MAX(collected_at) AS collected_at
        FROM resource_snapshots
        GROUP BY node_id
      ) latest
        ON latest.node_id = rs.node_id AND latest.collected_at = rs.collected_at
    `).all() as ResourceRow[];

    const messages = db.prepare(`
      SELECT node_id, inbound_count, outbound_count, updated_at
      FROM message_counters
    `).all() as MessageCounterRow[];

    const generatedAt = maxIso([
      ...nodes.map((node) => node.last_seen_at),
      ...agents.map((agent) => agent.last_seen_at),
      ...gateways.map((gateway) => gateway.collected_at),
      ...resources.map((resource) => resource.collected_at),
      ...messages.map((message) => message.updated_at),
    ]);
    const outputsCutoff = subtractWindow(generatedAt, '1h');
    const outputsLastHour = (
      db.prepare('SELECT COUNT(*) AS count FROM events WHERE event_type = ? AND created_at >= ? AND created_at <= ?')
        .get('session.output', outputsCutoff, generatedAt) as { count: number }
    ).count;

    const gatewayByNode = new Map(gateways.map((row) => [row.node_id, row] as const));
    const resourceByNode = new Map(resources.map((row) => [row.node_id, row] as const));
    const messageByNode = new Map(messages.map((row) => [row.node_id, row] as const));

    const overviewNodes: DashboardOverviewNode[] = nodes.map((node) => ({
      id: node.id,
      name: node.name,
      url: node.url,
      status: toDashboardNodeHealth(node.status),
      lastSeenAt: node.last_seen_at,
      gateway: toDashboardGatewayState(gatewayByNode.get(node.id)),
      resources: toDashboardNodeResources(resourceByNode.get(node.id)),
      messages: toMessageCounters(messageByNode.get(node.id)),
      agents: agents.filter((agent) => agent.node_id === node.id).map(toDashboardAgentSummary),
    }));

    const summary: DashboardSummary = {
      nodeCount: overviewNodes.length,
      onlineNodes: overviewNodes.filter((node) => node.status === 'online').length,
      degradedNodes: overviewNodes.filter((node) => node.status === 'degraded').length,
      offlineNodes: overviewNodes.filter((node) => node.status === 'offline').length,
      busyAgents: overviewNodes.flatMap((node) => node.agents).filter((agent) => agent.busy).length,
      idleAgents: overviewNodes.flatMap((node) => node.agents).filter((agent) => !agent.busy).length,
      staleAgents: overviewNodes.flatMap((node) => node.agents).filter((agent) => agent.staleReason !== null).length,
      outputsLastHour,
    };

    return {
      generatedAt,
      summary,
      nodes: overviewNodes,
    };
  },

  getOverview(): unknown {
    const overview = this.getDashboardOverview();

    return overview.nodes.map((node) => ({
      id: node.id,
      name: node.name,
      status: node.status,
      lastSeenAt: node.lastSeenAt,
      agents: [...node.agents]
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((agent) => ({
          id: agent.id,
          name: agent.name,
          model: agent.model ?? 'unknown',
          status: agent.status,
        })),
    }));
  },
};
