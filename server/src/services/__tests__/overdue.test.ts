import Database from 'better-sqlite3';
import { createTestDb } from '../../db/test-helpers';
import { getOverdueTasks, getDueTodayTasks, getAtRiskCases } from '../overdue';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function insertCase(
  db: Database.Database,
  phase = 'file_setup',
  phaseEnteredAt = '2026-01-01T00:00:00.000Z'
): number {
  db.prepare(
    "INSERT INTO cases (client_name, attorney, date_assigned, current_phase) VALUES ('Test Client', 'Test Atty', '2026-01-01', ?)"
  ).run(phase);
  const caseId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id;
  db.prepare(
    'INSERT INTO case_phase_history (case_id, phase, entered_at) VALUES (?, ?, ?)'
  ).run(caseId, phase, phaseEnteredAt);
  return caseId;
}

function insertTask(
  db: Database.Database,
  caseId: number,
  phase: string,
  overrides: Record<string, any> = {}
): number {
  const defaults = {
    case_id: caseId,
    phase,
    title: 'Test Task',
    priority: 'high',
    status: 'pending',
    due_date: null,
  };
  const values = { ...defaults, ...overrides };
  db.prepare(
    'INSERT INTO tasks (case_id, phase, title, priority, status, due_date) VALUES (@case_id, @phase, @title, @priority, @status, @due_date)'
  ).run(values);
  return (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id;
}

function insertContact(
  db: Database.Database,
  caseId: number,
  sentiment: string,
  nextContactDue: string | null = null
): number {
  db.prepare(
    "INSERT INTO contacts (case_id, contacted_at, contact_type, contact_status, client_sentiment) VALUES (?, '2026-01-01', 'phone', 'answered', ?)"
  ).run(caseId, sentiment);
  const contactId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id;
  if (nextContactDue) {
    db.prepare(
      "INSERT INTO contact_schedule (case_id, schedule_type, due_date) VALUES (?, 'monthly_followup', ?)"
    ).run(caseId, nextContactDue);
  }
  return contactId;
}

// ---------------------------------------------------------------------------
// getOverdueTasks
// ---------------------------------------------------------------------------

describe('getOverdueTasks', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it('test 1: returns tasks past the overdue threshold', () => {
    // file_setup has overdue_threshold_days = 0
    // entered_at '2026-01-01', today '2026-01-10' → 0 days threshold means entered_at + 0 < today → overdue
    const caseId = insertCase(db, 'file_setup', '2026-01-01T00:00:00.000Z');
    insertTask(db, caseId, 'file_setup');

    const results = getOverdueTasks(db, '2026-01-10');
    expect(results.length).toBe(1);
    expect((results[0] as any).case_id).toBe(caseId);
  });

  it('test 2: excludes completed tasks', () => {
    const caseId = insertCase(db, 'file_setup', '2026-01-01T00:00:00.000Z');
    insertTask(db, caseId, 'file_setup', { status: 'completed' });

    const results = getOverdueTasks(db, '2026-01-10');
    expect(results.length).toBe(0);
  });

  it('test 3: excludes cases with current_phase = closed', () => {
    // Insert a closed case — but closed is not in phase_settings, so we need file_setup phase
    // We'll insert the case as 'closed' but insert a phase_history row for file_setup
    db.prepare(
      "INSERT INTO cases (client_name, attorney, date_assigned, current_phase) VALUES ('Closed Client', 'Test Atty', '2026-01-01', 'closed')"
    ).run();
    const caseId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id;
    db.prepare(
      "INSERT INTO case_phase_history (case_id, phase, entered_at) VALUES (?, 'file_setup', '2026-01-01T00:00:00.000Z')"
    ).run(caseId);
    insertTask(db, caseId, 'file_setup');

    const results = getOverdueTasks(db, '2026-01-10');
    expect(results.length).toBe(0);
  });

  it('test 4: excludes tasks in treating phase (overdue_threshold_days = NULL)', () => {
    // treating has overdue_threshold_days = NULL → never overdue
    const caseId = insertCase(db, 'treating', '2026-01-01T00:00:00.000Z');
    insertTask(db, caseId, 'treating');

    const results = getOverdueTasks(db, '2026-01-10');
    expect(results.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getDueTodayTasks
// ---------------------------------------------------------------------------

describe('getDueTodayTasks', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it('test 5: returns tasks with due_date = today', () => {
    const caseId = insertCase(db);
    insertTask(db, caseId, 'file_setup', { due_date: '2026-05-16' });

    const results = getDueTodayTasks(db, '2026-05-16');
    expect(results.length).toBe(1);
    expect((results[0] as any).case_id).toBe(caseId);
  });

  it('test 6: excludes tasks not due today', () => {
    const caseId = insertCase(db);
    insertTask(db, caseId, 'file_setup', { due_date: '2026-05-15' });
    insertTask(db, caseId, 'file_setup', { due_date: '2026-05-17' });

    const results = getDueTodayTasks(db, '2026-05-16');
    expect(results.length).toBe(0);
  });

  it('test 7: excludes completed tasks', () => {
    const caseId = insertCase(db);
    insertTask(db, caseId, 'file_setup', { due_date: '2026-05-16', status: 'completed' });

    const results = getDueTodayTasks(db, '2026-05-16');
    expect(results.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getAtRiskCases
// ---------------------------------------------------------------------------

describe('getAtRiskCases', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it('test 8: returns cases where latest contact has client_sentiment = negative', () => {
    const caseId = insertCase(db);
    insertContact(db, caseId, 'negative');

    const results = getAtRiskCases(db, '2026-05-16');
    expect(results.length).toBe(1);
    expect((results[0] as any).case_id).toBe(caseId);
  });

  it('test 9: returns cases where latest sentiment is neutral AND next_contact_due < today', () => {
    const caseId = insertCase(db);
    // neutral sentiment + overdue schedule (due before today)
    insertContact(db, caseId, 'neutral', '2026-05-01');

    const results = getAtRiskCases(db, '2026-05-16');
    expect(results.length).toBe(1);
    expect((results[0] as any).case_id).toBe(caseId);
  });

  it('test 10: does NOT return cases where latest sentiment is positive', () => {
    const caseId = insertCase(db);
    insertContact(db, caseId, 'positive');

    const results = getAtRiskCases(db, '2026-05-16');
    expect(results.length).toBe(0);
  });

  it('test 11: does NOT return cases where sentiment is neutral but schedule is not overdue', () => {
    const caseId = insertCase(db);
    // neutral sentiment + future schedule (not overdue)
    insertContact(db, caseId, 'neutral', '2026-12-31');

    const results = getAtRiskCases(db, '2026-05-16');
    expect(results.length).toBe(0);
  });
});
