import { db } from '../client.js';
import { nowIso } from '../../utils/time.js';
import type { ManagedNode } from '../../types.js';

export const nodeRepository = {
  upsert(input: Pick<ManagedNode, 'id' | 'name' | 'url'> & { token?: string | null }): void {
    const now = nowIso();
    db.prepare(`
      INSERT INTO nodes (id, name, url, api_token, status, created_at, updated_at)
      VALUES (@id, @name, @url, @token, 'disconnected', @now, @now)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        url = excluded.url,
        api_token = excluded.api_token,
        updated_at = excluded.updated_at
    `).run({ ...input, now });
  },

  list(): Array<{ id: string; name: string; url: string; status: string; last_seen_at: string | null }> {
    return db.prepare('SELECT id, name, url, status, last_seen_at FROM nodes ORDER BY name ASC').all() as Array<{ id: string; name: string; url: string; status: string; last_seen_at: string | null }>;
  },

  setStatus(nodeId: string, status: string, lastSeenAt?: string): void {
    db.prepare(`UPDATE nodes SET status = ?, last_seen_at = COALESCE(?, last_seen_at), updated_at = ? WHERE id = ?`)
      .run(status, lastSeenAt ?? null, nowIso(), nodeId);
  },
};
