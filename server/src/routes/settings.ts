import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';

export function settingsRouter(db: Database.Database): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    const settings = db.prepare("SELECT * FROM phase_settings ORDER BY phase").all();
    res.json(settings);
  });

  router.put('/:phase', (req: Request, res: Response) => {
    const { phase } = req.params;
    const existing = db.prepare('SELECT * FROM phase_settings WHERE phase = ?').get(phase);
    if (!existing) return res.status(404).json({ error: 'Phase not found' });

    const allowed = ['case_badge_priority', 'auto_due_offset_days', 'overdue_threshold_days'];
    const updates: Record<string, any> = {};
    for (const field of allowed) {
      if (field in req.body) updates[field] = req.body[field];
    }

    if (Object.keys(updates).length > 0) {
      const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      db.prepare(`UPDATE phase_settings SET ${setClauses} WHERE phase = ?`).run(...Object.values(updates), phase);
    }

    const updated = db.prepare('SELECT * FROM phase_settings WHERE phase = ?').get(phase);
    res.json(updated);
  });

  return router;
}
