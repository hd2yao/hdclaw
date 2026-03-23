import { Router } from 'express';
import { z } from 'zod';
import { nodeManager } from '../services/nodeManager.js';
import { telemetryRepository } from '../db/repositories/telemetryRepository.js';

const createNodeSchema = z.object({
  name: z.string().min(1),
  url: z.string().url().or(z.string().startsWith('ws://')).or(z.string().startsWith('wss://')),
  token: z.string().optional(),
});
const timelineQuerySchema = z.object({
  window: z.enum(['1h', '24h']).default('1h'),
});
const alertsQuerySchema = z.object({
  window: z.enum(['1h', '24h']).default('24h'),
  severity: z.enum(['all', 'warning', 'critical', 'recovered']).default('all'),
  nodeId: z.string().min(1).optional(),
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
  res.json(telemetryRepository.getDashboardOverview());
});

nodeRouter.get('/nodes/:nodeId', (req, res) => {
  const detail = telemetryRepository.getNodeDetail(req.params.nodeId);
  if (!detail) {
    res.status(404).json({ error: 'node_not_found' });
    return;
  }

  res.json(detail);
});

nodeRouter.get('/nodes/:nodeId/agents/:agentId/timeline', (req, res) => {
  const queryParsed = timelineQuerySchema.safeParse(req.query);
  if (!queryParsed.success) {
    res.status(400).json({ error: 'invalid_query', issues: queryParsed.error.issues });
    return;
  }

  const nodeId = req.params.nodeId;
  const node = telemetryRepository.getLastKnownNodeState(nodeId);
  if (!node) {
    res.status(404).json({ error: 'node_not_found' });
    return;
  }

  const timeline = telemetryRepository.getAgentTimeline(nodeId, req.params.agentId, queryParsed.data.window);
  res.json({ items: timeline });
});

nodeRouter.get('/alerts', (req, res) => {
  const queryParsed = alertsQuerySchema.safeParse(req.query);
  if (!queryParsed.success) {
    res.status(400).json({ error: 'invalid_query' });
    return;
  }

  const { nodeId, window, severity } = queryParsed.data;
  if (nodeId) {
    const node = telemetryRepository.getLastKnownNodeState(nodeId);
    if (!node) {
      res.status(404).json({ error: 'node_not_found' });
      return;
    }
  }

  res.json(telemetryRepository.getDashboardAlerts({ nodeId, window, severity }));
});
