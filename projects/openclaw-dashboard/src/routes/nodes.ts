import { Router } from 'express';
import { z } from 'zod';
import { nodeManager } from '../services/nodeManager.js';
import { telemetryRepository } from '../db/repositories/telemetryRepository.js';

const createNodeSchema = z.object({
  name: z.string().min(1),
  url: z.string().url().or(z.string().startsWith('ws://')).or(z.string().startsWith('wss://')),
  token: z.string().optional(),
});

export const nodeRouter = Router();

nodeRouter.get('/nodes', (_req, res) => {
  res.json({ items: nodeManager.listNodes() });
});

nodeRouter.post('/nodes', (req, res) => {
  const parsed = createNodeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_payload', issues: parsed.error.issues });
    return;
  }

  const node = nodeManager.registerNode(parsed.data);
  res.status(201).json({
    item: {
      id: node.id,
      name: node.name,
      url: node.url,
      token: node.token ?? null,
      status: node.status,
      lastSeenAt: node.lastSeenAt ?? null,
      reconnectAttempt: node.reconnectAttempt,
    },
  });
});

nodeRouter.get('/overview', (_req, res) => {
  res.json(telemetryRepository.getOverview());
});
