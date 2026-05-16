import { Router } from 'express';
import Database from 'better-sqlite3';

export function settingsRouter(db: Database.Database): Router {
  const router = Router();
  router.get('/', (_req, res) => res.status(501).json({ error: 'Not implemented' }));
  router.put('/:phase', (_req, res) => res.status(501).json({ error: 'Not implemented' }));
  return router;
}
