import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';

export function tasksRouter(db: Database.Database): Router {
  const router = Router();

  router.get('/', (req: Request, res: Response) => {
    const today = new Date().toISOString().slice(0, 10);
    const { overdue, due_today, phase, status, priority, case_id, attorney } = req.query;

    if (overdue === 'true') {
      const tasks = db.prepare(`
        SELECT t.*, c.client_name, c.attorney
        FROM tasks t
        JOIN cases c ON t.case_id = c.id
        JOIN phase_settings ps ON t.phase = ps.phase
        JOIN case_phase_history cph ON cph.case_id = t.case_id AND cph.phase = t.phase AND cph.exited_at IS NULL
        WHERE t.status NOT IN ('completed')
          AND c.current_phase != 'closed'
          AND ps.overdue_threshold_days IS NOT NULL
          AND date(cph.entered_at, '+' || ps.overdue_threshold_days || ' days') < ?
        ORDER BY t.due_date ASC
      `).all(today);
      return res.json(tasks);
    }

    if (due_today === 'true') {
      const tasks = db.prepare(`
        SELECT t.*, c.client_name, c.attorney
        FROM tasks t
        JOIN cases c ON t.case_id = c.id
        WHERE t.status NOT IN ('completed')
          AND c.current_phase != 'closed'
          AND t.due_date = ?
        ORDER BY t.priority DESC
      `).all(today);
      return res.json(tasks);
    }

    // General filter query
    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];

    if (phase) { conditions.push('t.phase = ?'); params.push(phase); }
    if (status) { conditions.push('t.status = ?'); params.push(status); }
    if (priority) { conditions.push('t.priority = ?'); params.push(priority); }
    if (case_id) { conditions.push('t.case_id = ?'); params.push(Number(case_id)); }
    if (attorney) { conditions.push('c.attorney = ?'); params.push(attorney); }

    const tasks = db.prepare(`
      SELECT t.*, c.client_name, c.attorney
      FROM tasks t
      JOIN cases c ON t.case_id = c.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY t.created_at DESC
    `).all(...params);

    return res.json(tasks);
  });

  router.post('/', (req: Request, res: Response) => {
    const { case_id, title, category, priority, due_date, notes } = req.body;
    if (!case_id || !title) {
      return res.status(400).json({ error: 'case_id and title are required' });
    }
    const caseRow = db.prepare('SELECT * FROM cases WHERE id = ?').get(Number(case_id)) as any;
    if (!caseRow) return res.status(404).json({ error: 'Case not found' });

    const result = db.prepare(`
      INSERT INTO tasks (case_id, phase, template_id, title, category, priority, status, due_date, notes, created_at)
      VALUES (?, ?, NULL, ?, ?, ?, 'pending', ?, ?, datetime('now'))
    `).run(caseRow.id, caseRow.current_phase, title, category ?? null, priority ?? 'medium', due_date ?? null, notes ?? null);

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json(task);
  });

  router.put('/:id', (req: Request, res: Response) => {
    const taskId = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any;
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    const allowed = ['status', 'waiting_on', 'last_action', 'next_follow_up', 'notes', 'priority', 'due_date', 'completion_date', 'category', 'title'];
    const updates: Record<string, unknown> = {};

    for (const field of allowed) {
      if (field in req.body) updates[field] = req.body[field];
    }

    if (updates['status'] === 'completed' && !('completion_date' in updates)) {
      updates['completion_date'] = new Date().toISOString().slice(0, 10);
    }

    if (Object.keys(updates).length === 0) {
      return res.json(existing);
    }

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), taskId];
    db.prepare(`UPDATE tasks SET ${setClauses} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    return res.json(updated);
  });

  return router;
}
