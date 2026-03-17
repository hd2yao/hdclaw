import fs from 'node:fs';
import path from 'node:path';
import { db } from './client.js';

export function initDb(): void {
  const schemaPath = path.resolve(process.cwd(), 'src/db/schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schemaSql);
}
