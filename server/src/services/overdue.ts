import Database from 'better-sqlite3';

export function getOverdueTasks(
  db: Database.Database,
  today = new Date().toISOString().slice(0, 10)
) {
  return db
    .prepare(
      `
    SELECT t.*, c.client_name
    FROM tasks t
    JOIN cases c ON t.case_id = c.id
    JOIN phase_settings ps ON t.phase = ps.phase
    JOIN case_phase_history cph ON cph.case_id = t.case_id AND cph.phase = t.phase AND cph.exited_at IS NULL
    WHERE t.status NOT IN ('completed')
      AND c.current_phase != 'closed'
      AND ps.overdue_threshold_days IS NOT NULL
      AND date(cph.entered_at, '+' || ps.overdue_threshold_days || ' days') < ?
  `
    )
    .all(today);
}

export function getDueTodayTasks(
  db: Database.Database,
  today = new Date().toISOString().slice(0, 10)
) {
  return db
    .prepare(
      `
    SELECT t.*, c.client_name
    FROM tasks t
    JOIN cases c ON t.case_id = c.id
    WHERE t.status NOT IN ('completed')
      AND c.current_phase != 'closed'
      AND t.due_date = ?
  `
    )
    .all(today);
}

export function getAtRiskCases(
  db: Database.Database,
  today = new Date().toISOString().slice(0, 10)
) {
  return db
    .prepare(
      `
    SELECT c.id as case_id, c.client_name,
           latest_contact.client_sentiment as sentiment,
           latest_schedule.due_date as next_contact_due
    FROM cases c
    LEFT JOIN (
      SELECT case_id, client_sentiment
      FROM contacts
      WHERE id IN (SELECT MAX(id) FROM contacts GROUP BY case_id)
    ) latest_contact ON latest_contact.case_id = c.id
    LEFT JOIN (
      SELECT case_id, due_date
      FROM contact_schedule
      WHERE completed_contact_id IS NULL
      ORDER BY due_date ASC
    ) latest_schedule ON latest_schedule.case_id = c.id
    WHERE c.current_phase != 'closed'
      AND (
        latest_contact.client_sentiment IN ('negative', 'at_risk')
        OR (latest_contact.client_sentiment = 'neutral' AND latest_schedule.due_date < ?)
      )
    GROUP BY c.id
  `
    )
    .all(today);
}

export function getOverdueContacts(
  db: Database.Database,
  today = new Date().toISOString().slice(0, 10)
): Array<{ case_id: number; client_name: string; next_contact_due: string | null; days_overdue: number }> {
  return db.prepare(`
    SELECT
      c.id as case_id,
      c.client_name,
      cs.due_date as next_contact_due,
      CAST(julianday(?) - julianday(cs.due_date) AS INTEGER) as days_overdue
    FROM contact_schedule cs
    JOIN cases c ON cs.case_id = c.id
    WHERE cs.completed_contact_id IS NULL
      AND cs.due_date < ?
      AND c.current_phase != 'closed'
    ORDER BY cs.due_date ASC
  `).all(today, today) as any[];
}
