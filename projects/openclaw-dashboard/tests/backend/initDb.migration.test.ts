import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

test('initDb upgrades an existing database with readonly monitoring schema additions', async () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'openclaw-dashboard-initdb-'));
  const dbPath = path.join(tempRoot, 'data', 'dashboard.db');

  try {
    mkdirSync(path.dirname(dbPath), { recursive: true });

    const seedDb = new Database(dbPath);
    seedDb.exec(`
      CREATE TABLE nodes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT NOT NULL UNIQUE,
        api_token TEXT,
        status TEXT NOT NULL DEFAULT 'disconnected',
        last_seen_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE agents (
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
        UNIQUE(node_id, agent_id)
      );

      CREATE TABLE sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        node_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        agent_id TEXT,
        status TEXT NOT NULL,
        queue_depth INTEGER NOT NULL DEFAULT 0,
        last_seen_at TEXT NOT NULL,
        UNIQUE(node_id, session_id)
      );

      CREATE TABLE message_counters (
        node_id TEXT PRIMARY KEY,
        inbound_count INTEGER NOT NULL DEFAULT 0,
        outbound_count INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        node_id TEXT,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    seedDb.close();

    process.env.DASHBOARD_DB_PATH = dbPath;

    const { initDb } = await import('../../src/db/init.ts');
    const { db } = await import('../../src/db/client.ts');

    initDb();

    const migrationNames = db.prepare('SELECT name FROM schema_migrations ORDER BY name ASC').all() as Array<{ name: string }>;
    assert.deepEqual(migrationNames, [{ name: '001_readonly_monitoring_panel.sql' }]);

    const agentColumns = db.prepare("PRAGMA table_info('agents')").all() as Array<{ name: string }>;
    const sessionColumns = db.prepare("PRAGMA table_info('sessions')").all() as Array<{ name: string }>;
    const timelineColumns = db.prepare("PRAGMA table_info('agent_timeline_events')").all() as Array<{ name: string }>;

    assert.ok(agentColumns.some((column) => column.name === 'task_summary'));
    assert.ok(agentColumns.some((column) => column.name === 'task_phase'));
    assert.ok(agentColumns.some((column) => column.name === 'task_started_at'));
    assert.ok(agentColumns.some((column) => column.name === 'last_progress_at'));
    assert.ok(agentColumns.some((column) => column.name === 'stale_reason'));

    assert.ok(sessionColumns.some((column) => column.name === 'task_summary'));
    assert.ok(sessionColumns.some((column) => column.name === 'task_phase'));
    assert.ok(sessionColumns.some((column) => column.name === 'task_started_at'));
    assert.ok(sessionColumns.some((column) => column.name === 'last_progress_at'));

    assert.ok(timelineColumns.some((column) => column.name === 'agent_id'));
    assert.ok(timelineColumns.some((column) => column.name === 'summary'));
    assert.ok(timelineColumns.some((column) => column.name === 'detail'));
    assert.ok(timelineColumns.some((column) => column.name === 'status'));

    db.close();
  } finally {
    delete process.env.DASHBOARD_DB_PATH;
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
