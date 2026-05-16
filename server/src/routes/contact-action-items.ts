import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';

export function contactActionItemsRouter(db: Database.Database): Router {
  const router = Router();

  router.put('/:id', (req: Request, res: Response) => {
    const itemId = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM contact_action_items WHERE id = ?').get(itemId);
    if (!existing) return res.status(404).json({ error: 'Action item not found' });

    const { completed } = req.body;
    if (completed === true || completed === 1) {
      db.prepare("UPDATE contact_action_items SET completed = 1, completed_at = datetime('now') WHERE id = ?").run(itemId);
    } else {
      db.prepare('UPDATE contact_action_items SET completed = 0, completed_at = NULL WHERE id = ?').run(itemId);
    }

    const updated = db.prepare('SELECT * FROM contact_action_items WHERE id = ?').get(itemId);
    res.json(updated);
  });

  return router;
}
