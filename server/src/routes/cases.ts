import { Router } from 'express';
import Database from 'better-sqlite3';

export function casesRouter(db: Database.Database): Router {
  const router = Router();
  router.get('/', (_req, res) => res.status(501).json({ error: 'Not implemented' }));
  router.post('/', (_req, res) => res.status(501).json({ error: 'Not implemented' }));
  router.get('/:id', (_req, res) => res.status(501).json({ error: 'Not implemented' }));
  router.post('/:id/advance', (_req, res) => res.status(501).json({ error: 'Not implemented' }));
  router.delete('/:id', (_req, res) => res.status(501).json({ error: 'Not implemented' }));
  return router;
}
