import Database from 'better-sqlite3';
import { createTestDb } from '../../db/test-helpers';
import { nextPhase, computeDueDate, advanceCase } from '../phase';
import type { PhaseSettings } from '../../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function insertCase(db: Database.Database, overrides: Record<string, any> = {}): number {
  db.prepare(
    'INSERT INTO cases (client_name, attorney, date_assigned, current_phase) VALUES (@client_name, @attorney, @date_assigned, @current_phase)'
  ).run({
    client_name: 'Test Client',
    attorney: 'Test Atty',
    date_assigned: '2026-01-01',
    current_phase: 'file_setup',
    ...overrides,
  });
  const caseId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id;
  db.prepare(
    "INSERT INTO case_phase_history (case_id, phase, entered_at) VALUES (?, 'file_setup', datetime('now'))"
  ).run(caseId);
  return caseId;
}

// ---------------------------------------------------------------------------
// nextPhase
// ---------------------------------------------------------------------------

describe('nextPhase', () => {
  it('test 1: file_setup → treating', () => {
    expect(nextPhase('file_setup')).toBe('treating');
  });

  it('test 2: negotiations → closed', () => {
    expect(nextPhase('negotiations')).toBe('closed');
  });

  it('test 3: closed → null', () => {
    expect(nextPhase('closed')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// computeDueDate
// ---------------------------------------------------------------------------

describe('computeDueDate', () => {
  it('test 4: adds auto_due_offset_days to referenceDate', () => {
    const settings: PhaseSettings = {
      phase: 'file_setup',
      case_badge_priority: 'high',
      auto_due_offset_days: 5,
      overdue_threshold_days: 0,
    };
    expect(computeDueDate('file_setup', settings, '2026-01-01')).toBe('2026-01-06');
  });

  it('test 5: returns null when auto_due_offset_days is null', () => {
    const settings: PhaseSettings = {
      phase: 'treating',
      case_badge_priority: 'medium',
      auto_due_offset_days: null,
      overdue_threshold_days: null,
    };
    expect(computeDueDate('treating', settings, '2026-01-01')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// advanceCase
// ---------------------------------------------------------------------------

describe('advanceCase', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it('test 6: updates cases.current_phase to next phase', () => {
    const caseId = insertCase(db);
    advanceCase(db, caseId);
    const row = db.prepare('SELECT current_phase FROM cases WHERE id = ?').get(caseId) as { current_phase: string };
    expect(row.current_phase).toBe('treating');
  });

  it('test 7: sets exited_at on the old case_phase_history row', () => {
    const caseId = insertCase(db);
    advanceCase(db, caseId);
    const history = db.prepare(
      "SELECT * FROM case_phase_history WHERE case_id = ? AND phase = 'file_setup'"
    ).get(caseId) as { exited_at: string | null };
    expect(history.exited_at).not.toBeNull();
  });

  it('test 8: inserts a new case_phase_history row for the new phase', () => {
    const caseId = insertCase(db);
    advanceCase(db, caseId);
    const history = db.prepare(
      "SELECT * FROM case_phase_history WHERE case_id = ? AND phase = 'treating'"
    ).get(caseId) as { entered_at: string; exited_at: string | null } | undefined;
    expect(history).toBeDefined();
    expect(history!.exited_at).toBeNull();
    expect(history!.entered_at).toBeTruthy();
  });

  it('test 9: inserts tasks for the new phase (correct count)', () => {
    const caseId = insertCase(db);
    // treating phase has 6 templates in seed data
    const templateCount = (
      db.prepare("SELECT COUNT(*) as c FROM task_templates WHERE phase = 'treating'").get() as { c: number }
    ).c;
    advanceCase(db, caseId);
    const taskCount = (
      db.prepare("SELECT COUNT(*) as c FROM tasks WHERE case_id = ? AND phase = 'treating'").get(caseId) as { c: number }
    ).c;
    expect(taskCount).toBe(templateCount);
    expect(taskCount).toBeGreaterThan(0);
  });

  it('test 10: returns correct incompleteTasks count', () => {
    const caseId = insertCase(db);
    // Manually insert some pending tasks for file_setup phase
    db.prepare(
      "INSERT INTO tasks (case_id, phase, title, priority, status, date_assigned) VALUES (?, 'file_setup', 'Pending Task 1', 'high', 'pending', '2026-01-01')"
    ).run(caseId);
    db.prepare(
      "INSERT INTO tasks (case_id, phase, title, priority, status, date_assigned) VALUES (?, 'file_setup', 'Pending Task 2', 'medium', 'in_progress', '2026-01-01')"
    ).run(caseId);
    db.prepare(
      "INSERT INTO tasks (case_id, phase, title, priority, status, date_assigned) VALUES (?, 'file_setup', 'Completed Task', 'low', 'completed', '2026-01-01')"
    ).run(caseId);

    const result = advanceCase(db, caseId);
    // 2 non-completed tasks in file_setup
    expect(result.incompleteTasks).toBe(2);
  });

  it('test 11: throws an error when advancing a closed case', () => {
    const caseId = insertCase(db, { current_phase: 'negotiations' });
    // First advance to closed
    advanceCase(db, caseId);
    // Now try to advance from closed
    expect(() => advanceCase(db, caseId)).toThrow('Case is already closed');
  });

  it('test 12: advancing to closed sets completed_at on open contact_schedule rows', () => {
    const caseId = insertCase(db, { current_phase: 'negotiations' });
    // Insert open contact_schedule rows
    db.prepare(
      "INSERT INTO contact_schedule (case_id, schedule_type, due_date) VALUES (?, 'monthly_followup', '2026-02-01')"
    ).run(caseId);
    db.prepare(
      "INSERT INTO contact_schedule (case_id, schedule_type, due_date) VALUES (?, 'treating_checkin', '2026-03-01')"
    ).run(caseId);

    advanceCase(db, caseId);

    const openRows = db.prepare(
      'SELECT * FROM contact_schedule WHERE case_id = ? AND completed_at IS NULL'
    ).all(caseId) as any[];
    expect(openRows.length).toBe(0);

    const closedRows = db.prepare(
      'SELECT * FROM contact_schedule WHERE case_id = ? AND completed_at IS NOT NULL'
    ).all(caseId) as any[];
    expect(closedRows.length).toBe(2);
  });
});
