import { getOverdueContacts } from '../overdue';
import { createTestDb } from '../../db/test-helpers';
import Database from 'better-sqlite3';

describe('getOverdueContacts', () => {
  let db: Database.Database;

  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  function insertCase(phase: string, dateAssigned: string): number {
    const r = db.prepare(
      "INSERT INTO cases (client_name, attorney, current_phase, date_assigned, created_at) VALUES ('C', 'A', ?, ?, datetime('now'))"
    ).run(phase, dateAssigned);
    const id = r.lastInsertRowid as number;
    db.prepare(
      "INSERT INTO case_phase_history (case_id, phase, entered_at) VALUES (?, ?, datetime('now'))"
    ).run(id, phase);
    return id;
  }

  function insertOpenSchedule(caseId: number, dueDate: string): void {
    db.prepare(
      "INSERT INTO contact_schedule (case_id, schedule_type, due_date) VALUES (?, 'initial_intro', ?)"
    ).run(caseId, dueDate);
  }

  it('returns case with overdue open schedule', () => {
    const caseId = insertCase('treating', '2026-01-01');
    insertOpenSchedule(caseId, '2026-01-06'); // due Jan 6

    const result = getOverdueContacts(db, '2026-02-01'); // checked Feb 1 — overdue
    const ids = result.map(r => r.case_id);
    expect(ids).toContain(caseId);
  });

  it('does NOT return case whose open schedule is in the future', () => {
    const caseId = insertCase('treating', '2026-01-01');
    insertOpenSchedule(caseId, '2026-06-01'); // due Jun 1 — future

    const result = getOverdueContacts(db, '2026-02-01');
    const ids = result.map(r => r.case_id);
    expect(ids).not.toContain(caseId);
  });

  it('does NOT return closed cases', () => {
    const caseId = insertCase('closed', '2026-01-01');
    insertOpenSchedule(caseId, '2026-01-02');

    const result = getOverdueContacts(db, '2026-02-01');
    const ids = result.map(r => r.case_id);
    expect(ids).not.toContain(caseId);
  });

  it('does NOT return case whose schedule is completed', () => {
    const caseId = insertCase('treating', '2026-01-01');
    const contactR = db.prepare(
      "INSERT INTO contacts (case_id, contacted_at, contact_type, contact_status, client_sentiment, follow_up_necessary, created_at) VALUES (?, '2026-01-10', 'phone', 'answered', 'neutral', 0, datetime('now'))"
    ).run(caseId);
    db.prepare(
      "INSERT INTO contact_schedule (case_id, schedule_type, due_date, completed_contact_id) VALUES (?, 'initial_intro', '2026-01-06', ?)"
    ).run(caseId, contactR.lastInsertRowid);

    const result = getOverdueContacts(db, '2026-02-01');
    const ids = result.map(r => r.case_id);
    expect(ids).not.toContain(caseId);
  });

  it('includes days_overdue in result', () => {
    const caseId = insertCase('file_setup', '2026-01-01');
    insertOpenSchedule(caseId, '2026-01-02');

    const result = getOverdueContacts(db, '2026-01-10'); // 8 days after due date
    const row = result.find(r => r.case_id === caseId);
    expect(row).toBeDefined();
    expect(row!.days_overdue).toBe(8);
  });
});
