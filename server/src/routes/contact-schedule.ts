import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';

export function contactScheduleRouter(db: Database.Database): Router {
  const router = Router();

  router.get('/', (req: Request, res: Response) => {
    const today = new Date().toISOString().slice(0, 10);
    const { overdue, due_today, due_this_week, due_this_month } = req.query;

    const base = `
      SELECT cs.*, c.client_name
      FROM contact_schedule cs
      JOIN cases c ON cs.case_id = c.id
      WHERE cs.completed_contact_id IS NULL
        AND c.current_phase != 'closed'
    `;

    let rows: unknown[];
    if (overdue === 'true') {
      rows = db.prepare(base + ' AND cs.due_date < ? ORDER BY cs.due_date ASC').all(today);
    } else if (due_today === 'true') {
      rows = db.prepare(base + ' AND cs.due_date = ? ORDER BY cs.due_date ASC').all(today);
    } else if (due_this_week === 'true') {
      rows = db.prepare(base + " AND cs.due_date >= ? AND cs.due_date <= date(?, '+6 days') ORDER BY cs.due_date ASC").all(today, today);
    } else if (due_this_month === 'true') {
      rows = db.prepare(base + " AND cs.due_date >= ? AND cs.due_date <= date(?, '+30 days') ORDER BY cs.due_date ASC").all(today, today);
    } else {
      rows = db.prepare(base + ' ORDER BY cs.due_date ASC').all();
    }

    res.json(rows);
  });

  return router;
}
