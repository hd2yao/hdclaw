import express from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { logger } from './logger.js';
import { requireApiToken } from './auth.js';
import { healthRouter } from './routes/health.js';
import { nodeRouter } from './routes/nodes.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(pinoHttp.default({ logger }));

  app.use('/api', healthRouter);
  app.use('/api', requireApiToken, nodeRouter);

  return app;
}
