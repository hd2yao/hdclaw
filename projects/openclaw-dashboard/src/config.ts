import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const rootDir = process.cwd();

function numberFromEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  port: numberFromEnv('PORT', 3000),
  apiToken: process.env.DASHBOARD_API_TOKEN || 'change-me',
  dbPath: path.resolve(rootDir, process.env.DASHBOARD_DB_PATH || './data/dashboard.db'),
  nodePollIntervalMs: numberFromEnv('NODE_POLL_INTERVAL_MS', 5000),
  nodeHeartbeatTimeoutMs: numberFromEnv('NODE_HEARTBEAT_TIMEOUT_MS', 15000),
  nodeReconnectMinMs: numberFromEnv('NODE_RECONNECT_MIN_MS', 1000),
  nodeReconnectMaxMs: numberFromEnv('NODE_RECONNECT_MAX_MS', 30000),
};
