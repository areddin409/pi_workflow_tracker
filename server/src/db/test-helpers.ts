import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import { seedDatabase } from './seed';

export function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(readFileSync(join(__dirname, 'schema.sql'), 'utf-8'));
  seedDatabase(db);
  return db;
}
