import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';

export function contactScheduleRouter(db: Database.Database): Router {
  const router = Router();

  router.get('/', (req: Request, res: Response) => {
    const today = new Date().toISOString().slice(0, 10);
    const { overdue, due_today, due_this_week, due_this_month } = req.query;

    let dateCondition = '1=1';
    const params: string[] = [];

    if (overdue === 'true') {
      dateCondition = 'cs.due_date < ?';
      params.push(today);
    } else if (due_today === 'true') {
      dateCondition = 'cs.due_date = ?';
      params.push(today);
    } else if (due_this_week === 'true') {
      dateCondition = "cs.due_date >= ? AND cs.due_date <= date(?, '+6 days')";
      params.push(today, today);
    } else if (due_this_month === 'true') {
      dateCondition = "cs.due_date >= ? AND cs.due_date <= date(?, '+30 days')";
      params.push(today, today);
    }

    const rows = db.prepare(`
      SELECT cs.*, c.client_name
      FROM contact_schedule cs
      JOIN cases c ON cs.case_id = c.id
      WHERE cs.completed_contact_id IS NULL
        AND c.current_phase != 'closed'
        AND ${dateCondition}
      ORDER BY cs.due_date ASC
    `).all(...params);

    res.json(rows);
  });

  return router;
}
