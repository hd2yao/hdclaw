import http from 'node:http';
import { config } from './config.js';
import { createApp } from './app.js';
import { initDb } from './db/init.js';
import { logger } from './logger.js';
import { nodeManager } from './services/nodeManager.js';
import { DashboardWsGateway } from './services/wsGateway.js';

initDb();

const app = createApp();
const server = http.createServer(app);
new DashboardWsGateway(server);
nodeManager.start();

server.listen(config.port, () => {
  logger.info({ port: config.port }, 'OpenClaw Dashboard backend listening');
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info({ signal }, 'shutting down OpenClaw Dashboard backend');
    nodeManager.stop();
    server.close(() => process.exit(0));
  });
}
