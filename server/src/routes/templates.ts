import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';
import { propagateTemplateUpdate, propagateNewTemplate, propagateTemplateDelete } from '../services/propagation';

export function templatesRouter(db: Database.Database): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    const templates = db.prepare('SELECT * FROM task_templates ORDER BY phase, sort_order').all() as any[];
    const grouped: Record<string, any[]> = {
      file_setup: [], treating: [], demand_drafting: [], demand_sent: [], negotiations: []
    };
    for (const t of templates) {
      if (grouped[t.phase]) grouped[t.phase].push(t);
    }
    res.json(grouped);
  });

  router.post('/', (req: Request, res: Response) => {
    const { phase, title, priority = 'medium', sort_order = 0 } = req.body;
    if (!phase || !title) {
      return res.status(400).json({ error: 'phase and title are required' });
    }

    // Count cases in phase before propagation (for affectedCases)
    const affectedCases = (db.prepare("SELECT COUNT(*) as c FROM cases WHERE current_phase = ?").get(phase) as { c: number }).c;

    const result = db.prepare(
      'INSERT INTO task_templates (phase, title, priority, sort_order) VALUES (?, ?, ?, ?)'
    ).run(phase, title, priority, sort_order);
    const newId = result.lastInsertRowid as number;

    propagateNewTemplate(db, newId);

    const template = db.prepare('SELECT * FROM task_templates WHERE id = ?').get(newId);
    return res.status(201).json({ template, affectedCases });
  });

  router.put('/:id', (req: Request, res: Response) => {
    const templateId = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM task_templates WHERE id = ?').get(templateId) as any;
    if (!existing) return res.status(404).json({ error: 'Template not found' });

    const allowed = ['title', 'priority', 'sort_order'];
    const updates: Record<string, any> = {};
    for (const field of allowed) {
      if (field in req.body) updates[field] = req.body[field];
    }

    if (Object.keys(updates).length > 0) {
      const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      db.prepare(`UPDATE task_templates SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), templateId);
    }

    // Count pending tasks BEFORE propagation to report how many will be updated
    const affectedTasks = (db.prepare(
      "SELECT COUNT(*) as c FROM tasks WHERE template_id = ? AND status != 'completed'"
    ).get(templateId) as { c: number }).c;

    propagateTemplateUpdate(db, templateId);

    const template = db.prepare('SELECT * FROM task_templates WHERE id = ?').get(templateId);
    res.json({ template, affectedTasks });
  });

  router.delete('/:id', (req: Request, res: Response) => {
    const templateId = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM task_templates WHERE id = ?').get(templateId);
    if (!existing) return res.status(404).json({ error: 'Template not found' });

    // Count pending tasks before deletion
    const deletedPendingTasks = (db.prepare(
      "SELECT COUNT(*) as c FROM tasks WHERE template_id = ? AND status != 'completed'"
    ).get(templateId) as { c: number }).c;

    propagateTemplateDelete(db, templateId);
    db.prepare('DELETE FROM task_templates WHERE id = ?').run(templateId);

    res.json({ deletedPendingTasks });
  });

  return router;
}
