import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';

let _db: Database.Database | null = null;

export function openDatabase(path = join(__dirname, '../../pi_tracker.db')): Database.Database {
  if (_db) return _db;
  _db = new Database(path);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  _db.exec(schema);
  return _db;
}
