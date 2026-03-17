import type { Request, Response, NextFunction } from 'express';
import { config } from './config.js';

export function requireApiToken(req: Request, res: Response, next: NextFunction): void {
  const auth = req.header('authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice('Bearer '.length) : null;

  if (!token || token !== config.apiToken) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  next();
}
