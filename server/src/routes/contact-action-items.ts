import { Router } from 'express';
import Database from 'better-sqlite3';

export function contactActionItemsRouter(db: Database.Database): Router {
  const router = Router();
  router.put('/:id', (_req, res) => res.status(501).json({ error: 'Not implemented' }));
  return router;
}
