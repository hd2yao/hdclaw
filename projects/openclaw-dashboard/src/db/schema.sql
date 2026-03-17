PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  api_token TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected',
  last_seen_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gateway_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id TEXT NOT NULL,
  bind_address TEXT,
  port INTEGER,
  status TEXT NOT NULL,
  collected_at TEXT NOT NULL,
  FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_gateway_snapshots_node_time ON gateway_snapshots(node_id, collected_at DESC);

CREATE TABLE IF NOT EXISTS resource_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id TEXT NOT NULL,
  cpu_percent REAL,
  memory_used_mb REAL,
  memory_total_mb REAL,
  collected_at TEXT NOT NULL,
  FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_resource_snapshots_node_time ON resource_snapshots(node_id, collected_at DESC);

CREATE TABLE IF NOT EXISTS agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  name TEXT NOT NULL,
  model TEXT,
  workspace TEXT,
  config_json TEXT,
  status TEXT NOT NULL,
  busy INTEGER NOT NULL DEFAULT 0,
  last_seen_at TEXT NOT NULL,
  UNIQUE(node_id, agent_id),
  FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_agents_node_status ON agents(node_id, status);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  agent_id TEXT,
  status TEXT NOT NULL,
  queue_depth INTEGER NOT NULL DEFAULT 0,
  last_seen_at TEXT NOT NULL,
  UNIQUE(node_id, session_id),
  FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_node_status ON sessions(node_id, status);

CREATE TABLE IF NOT EXISTS message_counters (
  node_id TEXT PRIMARY KEY,
  inbound_count INTEGER NOT NULL DEFAULT 0,
  outbound_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id TEXT,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_events_type_time ON events(event_type, created_at DESC);
