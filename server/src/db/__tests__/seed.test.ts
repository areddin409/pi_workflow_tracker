import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import { seedDatabase } from '../seed';
import { createTestDb } from '../test-helpers';

describe('seedDatabase', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(readFileSync(join(__dirname, '../schema.sql'), 'utf-8'));
  });

  afterEach(() => db.close());

  it('seeds 22 task templates', () => {
    seedDatabase(db);
    const count = (db.prepare('SELECT COUNT(*) as c FROM task_templates').get() as { c: number }).c;
    expect(count).toBe(22);
  });

  it('seeds 5 phase settings', () => {
    seedDatabase(db);
    const count = (db.prepare('SELECT COUNT(*) as c FROM phase_settings').get() as { c: number }).c;
    expect(count).toBe(5);
  });

  it('is idempotent — calling twice does not duplicate', () => {
    seedDatabase(db);
    seedDatabase(db);
    const count = (db.prepare('SELECT COUNT(*) as c FROM task_templates').get() as { c: number }).c;
    expect(count).toBe(22);
  });

  it('seeds correct templates per phase', () => {
    seedDatabase(db);
    const phases = db.prepare('SELECT phase, COUNT(*) as c FROM task_templates GROUP BY phase').all() as { phase: string; c: number }[];
    const phaseMap = Object.fromEntries(phases.map(p => [p.phase, p.c]));
    expect(phaseMap['file_setup']).toBe(6);
    expect(phaseMap['treating']).toBe(6);
    expect(phaseMap['demand_drafting']).toBe(6);
    expect(phaseMap['demand_sent']).toBe(2);
    expect(phaseMap['negotiations']).toBe(2);
  });

  it('seeds correct phase_settings values', () => {
    seedDatabase(db);
    const fileSetup = db.prepare("SELECT * FROM phase_settings WHERE phase = 'file_setup'").get() as any;
    expect(fileSetup.case_badge_priority).toBe('high');
    expect(fileSetup.auto_due_offset_days).toBe(5);
    expect(fileSetup.overdue_threshold_days).toBe(0);

    const treating = db.prepare("SELECT * FROM phase_settings WHERE phase = 'treating'").get() as any;
    expect(treating.case_badge_priority).toBe('medium');
    expect(treating.auto_due_offset_days).toBeNull();
    expect(treating.overdue_threshold_days).toBeNull();
  });

  it('createTestDb returns seeded in-memory DB', () => {
    const testDb = createTestDb();
    const count = (testDb.prepare('SELECT COUNT(*) as c FROM task_templates').get() as { c: number }).c;
    expect(count).toBe(22);
    testDb.close();
  });
});
