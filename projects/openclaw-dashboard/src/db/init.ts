import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './client.js';

export function initDb(): void {
  const dbDir = path.dirname(fileURLToPath(import.meta.url));
  const schemaPath = path.resolve(dbDir, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schemaSql);

  const migrationsDir = path.resolve(dbDir, 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    return;
  }

  const appliedMigrations = new Set(
    (db.prepare('SELECT name FROM schema_migrations ORDER BY name ASC').all() as Array<{ name: string }>).map((row) => row.name),
  );

  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((entry) => entry.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));

  for (const migrationFile of migrationFiles) {
    if (appliedMigrations.has(migrationFile)) {
      continue;
    }

    const migrationPath = path.join(migrationsDir, migrationFile);
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');

    const applyMigration = db.transaction(() => {
      db.exec(migrationSql);
      db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(migrationFile, new Date().toISOString());
    });

    applyMigration();
  }
}
