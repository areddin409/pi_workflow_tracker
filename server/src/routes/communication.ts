import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';
import { linkAnsweredContact } from '../services/contact-schedule';

export function communicationRouter(db: Database.Database): Router {
  const router = Router();
  const today = () => new Date().toISOString().slice(0, 10);

  router.get('/', (_req: Request, res: Response) => {
    const t = today();

    const cases = db.prepare(`
      SELECT
        c.id as case_id,
        c.client_name,
        c.attorney,
        c.current_phase,
        c.date_assigned,
        latest.contacted_at     as last_contact_date,
        latest.last_attempted,
        latest.contact_attempt_type,
        latest.contact_status,
        latest.client_sentiment,
        latest.follow_up_type,
        latest.action_item,
        first_contact.contacted_at as initial_contact_date,
        next_sched.due_date     as next_contact_due,
        CASE WHEN overdue_sched.id IS NOT NULL THEN 1 ELSE 0 END as is_overdue
      FROM cases c
      LEFT JOIN (
        SELECT * FROM contacts
        WHERE id IN (SELECT MAX(id) FROM contacts GROUP BY case_id)
      ) latest ON latest.case_id = c.id
      LEFT JOIN (
        SELECT case_id, MIN(contacted_at) as contacted_at FROM contacts GROUP BY case_id
      ) first_contact ON first_contact.case_id = c.id
      LEFT JOIN (
        SELECT case_id, MIN(due_date) as due_date
        FROM contact_schedule
        WHERE completed_contact_id IS NULL
        GROUP BY case_id
      ) next_sched ON next_sched.case_id = c.id
      LEFT JOIN (
        SELECT DISTINCT case_id, id FROM contact_schedule
        WHERE completed_contact_id IS NULL AND due_date < ?
      ) overdue_sched ON overdue_sched.case_id = c.id
      WHERE c.current_phase != 'closed'
      ORDER BY c.client_name ASC
    `).all(t) as any[];

    res.json(cases.map(row => ({
      ...row,
      is_overdue: row.is_overdue === 1,
    })));
  });

  router.post('/:caseId/log', (req: Request, res: Response) => {
    const caseId = Number(req.params.caseId);
    const {
      contacted_at,
      last_attempted,
      contact_attempt_type,
      contact_status,
      client_sentiment,
      follow_up_type,
      action_item,
    } = req.body;

    if (!contacted_at || !contact_attempt_type || !contact_status || !client_sentiment || !follow_up_type) {
      return res.status(400).json({ error: 'contacted_at, contact_attempt_type, contact_status, client_sentiment, and follow_up_type are required' });
    }

    const caseRow = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
    if (!caseRow) return res.status(404).json({ error: 'Case not found' });

    const result = db.prepare(`
      INSERT INTO contacts (
        case_id, contacted_at, last_attempted, contact_type,
        contact_status, client_sentiment, follow_up_necessary,
        contact_attempt_type, follow_up_type, action_item, created_at
      ) VALUES (?, ?, ?, 'phone', ?, ?, 0, ?, ?, ?, datetime('now'))
    `).run(
      caseId,
      contacted_at,
      last_attempted ?? null,
      contact_status,
      client_sentiment,
      contact_attempt_type,
      follow_up_type,
      action_item ?? null,
    );

    const contactId = result.lastInsertRowid as number;

    if (contact_status === 'answered') {
      linkAnsweredContact(db, caseId, contactId, contacted_at);
    }

    const created = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);
    return res.status(201).json(created);
  });

  return router;
}
