import { db } from '../client.js';
import type { AgentSnapshot, GatewaySnapshot, MessageCounterSnapshot, ResourceSnapshot, SessionSnapshot } from '../../types.js';

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
      INSERT INTO agents (node_id, agent_id, name, model, workspace, config_json, status, busy, last_seen_at)
      VALUES (@nodeId, @agentId, @name, @model, @workspace, @configJson, @status, @busy, @updatedAt)
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
      INSERT INTO sessions (node_id, session_id, agent_id, status, queue_depth, last_seen_at)
      VALUES (@nodeId, @sessionId, @agentId, @status, @queueDepth, @updatedAt)
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

  saveEvent(nodeId: string | null, eventType: string, payload: unknown, createdAt: string): void {
    db.prepare('INSERT INTO events (node_id, event_type, payload_json, created_at) VALUES (?, ?, ?, ?)')
      .run(nodeId, eventType, JSON.stringify(payload), createdAt);
  },

  getOverview(): unknown {
    const nodes = db.prepare('SELECT id, name, url, status, last_seen_at FROM nodes ORDER BY name ASC').all();
    const agents = db.prepare(`
      SELECT node_id, status, COUNT(*) as count
      FROM agents
      GROUP BY node_id, status
    `).all();
    const sessions = db.prepare(`
      SELECT node_id, status, COUNT(*) as count, SUM(queue_depth) as queue_depth
      FROM sessions
      GROUP BY node_id, status
    `).all();
    const latestResources = db.prepare(`
      SELECT rs.*
      FROM resource_snapshots rs
      INNER JOIN (
        SELECT node_id, MAX(collected_at) AS max_collected_at
        FROM resource_snapshots
        GROUP BY node_id
      ) latest
      ON latest.node_id = rs.node_id AND latest.max_collected_at = rs.collected_at
    `).all();

    return { nodes, agents, sessions, latestResources };
  },
};
