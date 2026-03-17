ALTER TABLE agents ADD COLUMN task_summary TEXT;
ALTER TABLE agents ADD COLUMN task_phase TEXT;
ALTER TABLE agents ADD COLUMN task_started_at TEXT;
ALTER TABLE agents ADD COLUMN last_progress_at TEXT;
ALTER TABLE agents ADD COLUMN stale_reason TEXT;

ALTER TABLE sessions ADD COLUMN task_summary TEXT;
ALTER TABLE sessions ADD COLUMN task_phase TEXT;
ALTER TABLE sessions ADD COLUMN task_started_at TEXT;
ALTER TABLE sessions ADD COLUMN last_progress_at TEXT;

CREATE TABLE IF NOT EXISTS agent_timeline_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  session_id TEXT,
  event_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  detail TEXT,
  status TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_timeline_events_agent_time ON agent_timeline_events(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_timeline_events_node_time ON agent_timeline_events(node_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_timeline_events_node_agent_time ON agent_timeline_events(node_id, agent_id, created_at DESC);
