import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import { seedDatabase } from './seed';
import { runMigrations } from './database';

export function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(readFileSync(join(__dirname, 'schema.sql'), 'utf-8'));
  runMigrations(db);
  seedDatabase(db);
  return db;
}
