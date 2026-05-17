import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';
import { advanceCase } from '../services/phase';
import { generateInitialIntro, generateTreatingCheckin } from '../services/contact-schedule';

export function casesRouter(db: Database.Database): Router {
  const router = Router();

  router.get('/', (req: Request, res: Response) => {
    const includesClosed = req.query.include_closed === 'true';
    const cases = db.prepare(`
      SELECT c.*,
        ps.case_badge_priority,
        CAST(julianday('now') - julianday(cph.entered_at) AS INTEGER) as days_in_phase,
        latest_contact.client_sentiment as latest_sentiment
      FROM cases c
      LEFT JOIN phase_settings ps ON c.current_phase = ps.phase
      JOIN case_phase_history cph ON cph.case_id = c.id AND cph.exited_at IS NULL
      LEFT JOIN (
        SELECT case_id, client_sentiment
        FROM contacts
        WHERE id IN (SELECT MAX(id) FROM contacts GROUP BY case_id)
      ) latest_contact ON latest_contact.case_id = c.id
      ${includesClosed ? '' : "WHERE c.current_phase != 'closed'"}
      ORDER BY c.created_at DESC
    `).all();
    res.json(cases);
  });

  router.post('/', (req: Request, res: Response) => {
    const { client_name, attorney, date_assigned } = req.body;
    if (!client_name || !attorney || !date_assigned) {
      return res.status(400).json({ error: 'client_name, attorney, and date_assigned are required' });
    }
    const now = new Date().toISOString();
    const result = db.prepare(
      "INSERT INTO cases (client_name, attorney, current_phase, date_assigned, created_at) VALUES (?, ?, 'file_setup', ?, ?)"
    ).run(client_name, attorney, date_assigned, now);
    const caseId = result.lastInsertRowid as number;

    db.prepare("INSERT INTO case_phase_history (case_id, phase, entered_at) VALUES (?, 'file_setup', ?)").run(caseId, now);

    const settings = db.prepare("SELECT * FROM phase_settings WHERE phase = 'file_setup'").get() as any;
    const templates = db.prepare("SELECT * FROM task_templates WHERE phase = 'file_setup' ORDER BY sort_order").all() as any[];
    const insertTask = db.prepare(
      "INSERT INTO tasks (case_id, phase, template_id, title, priority, status, date_assigned, due_date) VALUES (?, 'file_setup', ?, ?, ?, 'pending', ?, ?)"
    );
    for (const t of templates) {
      const d = new Date(date_assigned);
      d.setUTCDate(d.getUTCDate() + (settings?.auto_due_offset_days ?? 5));
      const dueDate = d.toISOString().slice(0, 10);
      insertTask.run(caseId, t.id, t.title, t.priority, date_assigned, dueDate);
    }

    generateInitialIntro(db, caseId, date_assigned);

    const created = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
    return res.status(201).json(created);
  });

  router.get('/:id', (req: Request, res: Response) => {
    const caseRow = db.prepare('SELECT * FROM cases WHERE id = ?').get(Number(req.params.id));
    if (!caseRow) return res.status(404).json({ error: 'Case not found' });

    const tasks = db.prepare('SELECT * FROM tasks WHERE case_id = ? ORDER BY created_at').all(Number(req.params.id));
    const contacts = db.prepare('SELECT * FROM contacts WHERE case_id = ? ORDER BY created_at DESC LIMIT 1').get(Number(req.params.id));
    const phaseHistory = db.prepare('SELECT * FROM case_phase_history WHERE case_id = ? ORDER BY entered_at').all(Number(req.params.id));
    const schedules = db.prepare('SELECT * FROM contact_schedule WHERE case_id = ? AND completed_contact_id IS NULL ORDER BY due_date').all(Number(req.params.id));

    res.json({ ...caseRow as object, tasks, latestContact: contacts ?? null, phaseHistory, openSchedules: schedules });
  });

  router.post('/:id/advance', (req: Request, res: Response) => {
    const caseId = Number(req.params.id);
    const caseRow = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId) as any;
    if (!caseRow) return res.status(404).json({ error: 'Case not found' });

    try {
      const result = advanceCase(db, caseId);
      if (result.newPhase === 'treating') {
        generateTreatingCheckin(db, caseId, new Date().toISOString().slice(0, 10));
      }
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/:id', (req: Request, res: Response) => {
    const caseId = Number(req.params.id);
    const caseRow = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId) as any;
    if (!caseRow) return res.status(404).json({ error: 'Case not found' });
    if (caseRow.current_phase !== 'closed') return res.status(409).json({ error: 'Only closed cases can be deleted' });
    db.prepare('DELETE FROM cases WHERE id = ?').run(caseId);
    res.status(204).send();
  });

  return router;
}
