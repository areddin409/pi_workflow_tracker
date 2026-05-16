import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Database Schema', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(readFileSync(join(__dirname, '../schema.sql'), 'utf-8'));
  });

  afterEach(() => { db.close(); });

  it('creates all 7 tables', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    const names = tables.map(t => t.name);
    expect(names).toContain('cases');
    expect(names).toContain('case_phase_history');
    expect(names).toContain('task_templates');
    expect(names).toContain('tasks');
    expect(names).toContain('contacts');
    expect(names).toContain('contact_schedule');
    expect(names).toContain('contact_action_items');
    expect(names).toContain('phase_settings');
  });

  it('cascades delete from cases to tasks', () => {
    db.prepare("INSERT INTO cases (client_name, attorney, date_assigned) VALUES ('Test', 'Atty', '2026-01-01')").run();
    const caseId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id;
    db.prepare("INSERT INTO task_templates (phase, title, priority, sort_order) VALUES ('file_setup', 'Test Task', 'high', 1)").run();
    const templateId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id;
    db.prepare("INSERT INTO tasks (case_id, phase, template_id, title) VALUES (?, 'file_setup', ?, 'Test Task')").run(caseId, templateId);
    db.prepare('DELETE FROM cases WHERE id = ?').run(caseId);
    const tasks = db.prepare('SELECT * FROM tasks WHERE case_id = ?').all(caseId);
    expect(tasks).toHaveLength(0);
  });
});
