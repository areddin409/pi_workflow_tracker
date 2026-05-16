import Database from 'better-sqlite3';
import { createTestDb } from '../../db/test-helpers';
import {
  generateInitialIntro,
  generateTreatingCheckin,
  generateMonthlyFollowup,
  linkAnsweredContact,
  calculateContactRate,
} from '../contact-schedule';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function insertCase(db: Database.Database, phase = 'file_setup'): number {
  db.prepare(
    "INSERT INTO cases (client_name, attorney, date_assigned, current_phase) VALUES ('Test', 'Atty', '2026-01-01', ?)"
  ).run(phase);
  return (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id;
}

function insertContact(db: Database.Database, caseId: number, status = 'answered'): number {
  db.prepare(
    "INSERT INTO contacts (case_id, contacted_at, contact_type, contact_status, client_sentiment) VALUES (?, '2026-01-01', 'phone', ?, 'positive')"
  ).run(caseId, status);
  return (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id;
}

// ---------------------------------------------------------------------------
// generateInitialIntro
// ---------------------------------------------------------------------------

describe('generateInitialIntro', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it('test 1: inserts a row with schedule_type = initial_intro and due_date = date_assigned + 1 day', () => {
    const caseId = insertCase(db);
    generateInitialIntro(db, caseId, '2026-01-10');

    const row = db.prepare(
      "SELECT * FROM contact_schedule WHERE case_id = ? AND schedule_type = 'initial_intro'"
    ).get(caseId) as { schedule_type: string; due_date: string } | undefined;

    expect(row).toBeDefined();
    expect(row!.schedule_type).toBe('initial_intro');
    expect(row!.due_date).toBe('2026-01-11');
  });
});

// ---------------------------------------------------------------------------
// generateTreatingCheckin
// ---------------------------------------------------------------------------

describe('generateTreatingCheckin', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it('test 2: inserts a row with schedule_type = treating_checkin and due_date = phase_entered + 5 days', () => {
    const caseId = insertCase(db);
    generateTreatingCheckin(db, caseId, '2026-02-01');

    const row = db.prepare(
      "SELECT * FROM contact_schedule WHERE case_id = ? AND schedule_type = 'treating_checkin'"
    ).get(caseId) as { schedule_type: string; due_date: string } | undefined;

    expect(row).toBeDefined();
    expect(row!.schedule_type).toBe('treating_checkin');
    expect(row!.due_date).toBe('2026-02-06');
  });
});

// ---------------------------------------------------------------------------
// generateMonthlyFollowup
// ---------------------------------------------------------------------------

describe('generateMonthlyFollowup', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it('test 3: inserts a row with schedule_type = monthly_followup and due_date = completed_at + 25 days', () => {
    const caseId = insertCase(db);
    generateMonthlyFollowup(db, caseId, '2026-03-01');

    const row = db.prepare(
      "SELECT * FROM contact_schedule WHERE case_id = ? AND schedule_type = 'monthly_followup'"
    ).get(caseId) as { schedule_type: string; due_date: string } | undefined;

    expect(row).toBeDefined();
    expect(row!.schedule_type).toBe('monthly_followup');
    expect(row!.due_date).toBe('2026-03-26');
  });
});

// ---------------------------------------------------------------------------
// linkAnsweredContact
// ---------------------------------------------------------------------------

describe('linkAnsweredContact', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it('test 4: links contact to the oldest open schedule row (sets completed_contact_id and completed_at)', () => {
    const caseId = insertCase(db);
    const contactId = insertContact(db, caseId);

    db.prepare(
      "INSERT INTO contact_schedule (case_id, schedule_type, due_date) VALUES (?, 'initial_intro', '2026-01-05')"
    ).run(caseId);

    const scheduleId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id;

    linkAnsweredContact(db, caseId, contactId, '2026-01-06');

    const row = db.prepare('SELECT * FROM contact_schedule WHERE id = ?').get(scheduleId) as {
      completed_contact_id: number;
      completed_at: string;
    };

    expect(row.completed_contact_id).toBe(contactId);
    expect(row.completed_at).toBe('2026-01-06');
  });

  it('test 5: generates a new monthly_followup row after linking', () => {
    const caseId = insertCase(db);
    const contactId = insertContact(db, caseId);

    db.prepare(
      "INSERT INTO contact_schedule (case_id, schedule_type, due_date) VALUES (?, 'initial_intro', '2026-01-05')"
    ).run(caseId);

    linkAnsweredContact(db, caseId, contactId, '2026-01-06');

    const followup = db.prepare(
      "SELECT * FROM contact_schedule WHERE case_id = ? AND schedule_type = 'monthly_followup'"
    ).get(caseId) as { due_date: string } | undefined;

    expect(followup).toBeDefined();
    expect(followup!.due_date).toBe('2026-01-31'); // 2026-01-06 + 25 days
  });

  it('test 6: links the OLDEST open row when multiple open rows exist', () => {
    const caseId = insertCase(db);
    const contactId = insertContact(db, caseId);

    // Insert newer row first
    db.prepare(
      "INSERT INTO contact_schedule (case_id, schedule_type, due_date) VALUES (?, 'monthly_followup', '2026-03-01')"
    ).run(caseId);
    const newerId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id;

    // Insert older row second
    db.prepare(
      "INSERT INTO contact_schedule (case_id, schedule_type, due_date) VALUES (?, 'initial_intro', '2026-01-05')"
    ).run(caseId);
    const olderId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id;

    linkAnsweredContact(db, caseId, contactId, '2026-01-06');

    const olderRow = db.prepare('SELECT * FROM contact_schedule WHERE id = ?').get(olderId) as {
      completed_contact_id: number | null;
    };
    const newerRow = db.prepare('SELECT * FROM contact_schedule WHERE id = ?').get(newerId) as {
      completed_contact_id: number | null;
    };

    // Oldest (lowest due_date) should be linked
    expect(olderRow.completed_contact_id).toBe(contactId);
    // Newer row should remain open
    expect(newerRow.completed_contact_id).toBeNull();
  });

  it('test 7: is a no-op when there are no open schedule rows', () => {
    const caseId = insertCase(db);
    const contactId = insertContact(db, caseId);

    // No schedule rows at all
    expect(() => linkAnsweredContact(db, caseId, contactId, '2026-01-06')).not.toThrow();

    // No new rows should be created (no monthly_followup either)
    const rows = db.prepare('SELECT * FROM contact_schedule WHERE case_id = ?').all(caseId) as any[];
    expect(rows.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calculateContactRate
// ---------------------------------------------------------------------------

describe('calculateContactRate', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it('test 8: returns 100 when there are no schedules due today or earlier', () => {
    const caseId = insertCase(db, 'treating');

    // Only a future schedule row — should not be counted
    db.prepare(
      "INSERT INTO contact_schedule (case_id, schedule_type, due_date) VALUES (?, 'monthly_followup', '2099-12-31')"
    ).run(caseId);

    const rate = calculateContactRate(db);
    expect(rate).toBe(100);
  });

  it('test 9: returns correct percentage with mixed completed/open rows', () => {
    const caseId = insertCase(db, 'treating');
    const contactId1 = insertContact(db, caseId);
    const contactId2 = insertContact(db, caseId);

    // 2 completed, 1 open — all due in the past
    db.prepare(
      "INSERT INTO contact_schedule (case_id, schedule_type, due_date, completed_contact_id, completed_at) VALUES (?, 'initial_intro', '2026-01-01', ?, '2026-01-02')"
    ).run(caseId, contactId1);
    db.prepare(
      "INSERT INTO contact_schedule (case_id, schedule_type, due_date, completed_contact_id, completed_at) VALUES (?, 'treating_checkin', '2026-01-06', ?, '2026-01-07')"
    ).run(caseId, contactId2);
    db.prepare(
      "INSERT INTO contact_schedule (case_id, schedule_type, due_date) VALUES (?, 'monthly_followup', '2026-01-10')"
    ).run(caseId);

    const rate = calculateContactRate(db);
    expect(rate).toBe(67); // 2/3 = 66.67 → rounds to 67
  });

  it('test 10: excludes closed cases from the calculation', () => {
    // Active case with an open overdue schedule
    const activeCaseId = insertCase(db, 'treating');
    db.prepare(
      "INSERT INTO contact_schedule (case_id, schedule_type, due_date) VALUES (?, 'monthly_followup', '2026-01-10')"
    ).run(activeCaseId);

    // Closed case with a completed schedule — should be excluded entirely
    const closedCaseId = insertCase(db, 'closed');
    const closedContactId = insertContact(db, closedCaseId);
    db.prepare(
      "INSERT INTO contact_schedule (case_id, schedule_type, due_date, completed_contact_id, completed_at) VALUES (?, 'initial_intro', '2026-01-01', ?, '2026-01-02')"
    ).run(closedCaseId, closedContactId);

    // Only the active case's open row is counted: 0/1 = 0%
    const rate = calculateContactRate(db);
    expect(rate).toBe(0);
  });
});
