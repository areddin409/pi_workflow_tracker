import Database from 'better-sqlite3';

/** Add `days` to an ISO date string (YYYY-MM-DD) and return the result as YYYY-MM-DD.
 *  Operates purely on UTC to avoid local-timezone shifts from date-string parsing. */
function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return d.toISOString().slice(0, 10);
}

export function generateInitialIntro(db: Database.Database, caseId: number, dateAssigned: string): void {
  db.prepare("INSERT INTO contact_schedule (case_id, schedule_type, due_date) VALUES (?, 'initial_intro', ?)")
    .run(caseId, addDays(dateAssigned, 1));
}

export function generateTreatingCheckin(db: Database.Database, caseId: number, phaseEnteredDate: string): void {
  db.prepare("INSERT INTO contact_schedule (case_id, schedule_type, due_date) VALUES (?, 'treating_checkin', ?)")
    .run(caseId, addDays(phaseEnteredDate, 5));
}

export function generateMonthlyFollowup(db: Database.Database, caseId: number, completedAt: string): void {
  db.prepare("INSERT INTO contact_schedule (case_id, schedule_type, due_date) VALUES (?, 'monthly_followup', ?)")
    .run(caseId, addDays(completedAt, 25));
}

export function linkAnsweredContact(db: Database.Database, caseId: number, contactId: number, contactDate: string): void {
  const openSchedule = db.prepare(
    "SELECT * FROM contact_schedule WHERE case_id = ? AND completed_contact_id IS NULL ORDER BY due_date ASC LIMIT 1"
  ).get(caseId) as any;

  if (!openSchedule) return;

  db.prepare(
    "UPDATE contact_schedule SET completed_contact_id = ?, completed_at = ? WHERE id = ?"
  ).run(contactId, contactDate, openSchedule.id);

  generateMonthlyFollowup(db, caseId, contactDate);
}

export function calculateContactRate(db: Database.Database): number {
  const today = new Date().toISOString().slice(0, 10);
  const result = db.prepare(`
    SELECT
      COUNT(CASE WHEN completed_contact_id IS NOT NULL THEN 1 END) as completed,
      COUNT(*) as total
    FROM contact_schedule cs
    JOIN cases c ON cs.case_id = c.id
    WHERE c.current_phase != 'closed' AND cs.due_date <= ?
  `).get(today) as { completed: number; total: number };
  if (result.total === 0) return 100;
  return Math.round((result.completed / result.total) * 100);
}
