import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';
import { linkAnsweredContact } from '../services/contact-schedule';

export function contactsRouter(db: Database.Database): Router {
  const router = Router();

  router.get('/', (req: Request, res: Response) => {
    const today = new Date().toISOString().slice(0, 10);
    const { case_id, overdue } = req.query;

    if (overdue === 'true') {
      const rows = db.prepare(`
        SELECT cs.*, c.client_name
        FROM contact_schedule cs
        JOIN cases c ON cs.case_id = c.id
        WHERE cs.completed_contact_id IS NULL AND cs.due_date < ? AND c.current_phase != 'closed'
        ORDER BY cs.due_date ASC
      `).all(today);
      return res.json(rows);
    }

    const conditions: string[] = ['1=1'];
    const params: any[] = [];
    if (case_id) {
      conditions.push('con.case_id = ?');
      params.push(Number(case_id));
    }

    const contacts = db.prepare(`
      SELECT con.*, c.client_name
      FROM contacts con
      JOIN cases c ON con.case_id = c.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY con.created_at DESC
    `).all(...params) as any[];

    const withItems = contacts.map(contact => {
      const action_items = db.prepare('SELECT * FROM contact_action_items WHERE contact_id = ?').all(contact.id);
      return { ...contact, action_items };
    });

    res.json(withItems);
  });

  router.post('/', (req: Request, res: Response) => {
    const {
      case_id,
      contacted_at,
      contact_type,
      contact_status,
      client_sentiment,
      follow_up_necessary = 0,
      notes,
      action_item,
      last_attempted,
      next_contact_due,
    } = req.body;

    if (!case_id || !contacted_at || !contact_type || !contact_status || !client_sentiment) {
      return res.status(400).json({ error: 'case_id, contacted_at, contact_type, contact_status, and client_sentiment are required' });
    }

    const caseRow = db.prepare('SELECT * FROM cases WHERE id = ?').get(Number(case_id));
    if (!caseRow) return res.status(404).json({ error: 'Case not found' });

    const result = db.prepare(`
      INSERT INTO contacts (case_id, contacted_at, last_attempted, next_contact_due, contact_type, contact_status, client_sentiment, follow_up_necessary, notes, action_item, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      Number(case_id),
      contacted_at,
      last_attempted ?? null,
      next_contact_due ?? null,
      contact_type,
      contact_status,
      client_sentiment,
      follow_up_necessary ? 1 : 0,
      notes ?? null,
      action_item ?? null,
    );

    const contactId = result.lastInsertRowid as number;

    if (contact_status === 'answered') {
      linkAnsweredContact(db, Number(case_id), contactId, contacted_at);
    }

    const created = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);
    return res.status(201).json(created);
  });

  router.post('/:id/action-items', (req: Request, res: Response) => {
    const contactId = Number(req.params.id);
    const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    const { description, assigned_to, due_date } = req.body;
    if (!description || !assigned_to) {
      return res.status(400).json({ error: 'description and assigned_to are required' });
    }

    const result = db.prepare(`
      INSERT INTO contact_action_items (contact_id, description, assigned_to, due_date, completed)
      VALUES (?, ?, ?, ?, 0)
    `).run(contactId, description, assigned_to, due_date ?? null);

    const item = db.prepare('SELECT * FROM contact_action_items WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json(item);
  });

  return router;
}
