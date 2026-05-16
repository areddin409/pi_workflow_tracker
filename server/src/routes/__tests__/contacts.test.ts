import request from 'supertest';
import { buildApp } from '../../index';
import { createTestDb } from '../../db/test-helpers';
import Database from 'better-sqlite3';

describe('Contacts API', () => {
  let app: ReturnType<typeof buildApp>;
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    app = buildApp(db);
  });

  afterEach(() => {
    db.close();
  });

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /** Create a case via POST and return its id */
  async function createCase(overrides: Record<string, string> = {}): Promise<number> {
    const res = await request(app)
      .post('/api/cases')
      .send({ client_name: 'Jane Doe', attorney: 'Smith', date_assigned: '2026-01-10', ...overrides });
    return res.body.id as number;
  }

  /** Insert a contact directly and return its id */
  function insertContact(caseId: number, overrides: Record<string, any> = {}): number {
    const result = db.prepare(`
      INSERT INTO contacts (case_id, contacted_at, contact_type, contact_status, client_sentiment, follow_up_necessary, created_at)
      VALUES (?, ?, ?, ?, ?, 0, datetime('now'))
    `).run(
      caseId,
      overrides.contacted_at ?? '2026-01-15',
      overrides.contact_type ?? 'phone',
      overrides.contact_status ?? 'voicemail',
      overrides.client_sentiment ?? 'neutral',
    );
    return result.lastInsertRowid as number;
  }

  /** Insert a contact_schedule row directly and return its id */
  function insertSchedule(caseId: number, dueDate: string, completedContactId: number | null = null): number {
    const result = db.prepare(`
      INSERT INTO contact_schedule (case_id, schedule_type, due_date, completed_contact_id)
      VALUES (?, 'monthly_followup', ?, ?)
    `).run(caseId, dueDate, completedContactId);
    return result.lastInsertRowid as number;
  }

  // ── GET /api/contacts ────────────────────────────────────────────────────────

  it('GET /api/contacts returns all contacts with client_name and action_items array', async () => {
    const caseId = await createCase();
    const contactId = insertContact(caseId);

    // Add an action item to the contact
    db.prepare(`
      INSERT INTO contact_action_items (contact_id, description, assigned_to, completed)
      VALUES (?, 'Follow up call', 'Jane', 0)
    `).run(contactId);

    const res = await request(app).get('/api/contacts').expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toHaveProperty('client_name', 'Jane Doe');
    expect(Array.isArray(res.body[0].action_items)).toBe(true);
    expect(res.body[0].action_items).toHaveLength(1);
    expect(res.body[0].action_items[0].description).toBe('Follow up call');
  });

  it('GET /api/contacts?case_id=X filters to that case', async () => {
    const case1 = await createCase({ client_name: 'Alice' });
    const case2 = await createCase({ client_name: 'Bob' });
    insertContact(case1);
    insertContact(case2);

    const res = await request(app).get(`/api/contacts?case_id=${case1}`).expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].case_id).toBe(case1);
    expect(res.body[0].client_name).toBe('Alice');
  });

  it('GET /api/contacts?overdue=true returns overdue open schedule rows (not contacts)', async () => {
    const caseId = await createCase();
    const pastDate = '2026-01-01'; // clearly in the past relative to today (2026-05-16)
    insertSchedule(caseId, pastDate); // open overdue schedule

    // Also create a completed schedule — should NOT appear
    const contactId = insertContact(caseId);
    insertSchedule(caseId, '2026-01-02', contactId);

    const res = await request(app).get('/api/contacts?overdue=true').expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    // All returned rows should be from contact_schedule, past due, and open
    for (const row of res.body) {
      expect(row.completed_contact_id).toBeNull();
      expect(row.due_date < new Date().toISOString().slice(0, 10)).toBe(true);
    }
    // The completed schedule should not appear
    const completedRow = res.body.find((r: any) => r.completed_contact_id !== null);
    expect(completedRow).toBeUndefined();
  });

  // ── POST /api/contacts ───────────────────────────────────────────────────────

  it('POST /api/contacts with answered status creates contact and links contact_schedule', async () => {
    const caseId = await createCase({ date_assigned: '2026-01-10' });

    // The case creation inserts an initial_intro schedule due on 2026-01-11
    const schedulesBefore = db.prepare(
      'SELECT * FROM contact_schedule WHERE case_id = ? AND completed_contact_id IS NULL'
    ).all(caseId) as any[];
    expect(schedulesBefore).toHaveLength(1);

    const res = await request(app)
      .post('/api/contacts')
      .send({
        case_id: caseId,
        contacted_at: '2026-01-11',
        contact_type: 'phone',
        contact_status: 'answered',
        client_sentiment: 'positive',
      })
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.contact_status).toBe('answered');

    // The open schedule should now be linked
    const openSchedules = db.prepare(
      'SELECT * FROM contact_schedule WHERE case_id = ? AND completed_contact_id IS NULL'
    ).all(caseId) as any[];
    // linkAnsweredContact closes the open one and creates a new monthly_followup — so still 1 open
    expect(openSchedules).toHaveLength(1);
    const linkedSchedule = db.prepare(
      'SELECT * FROM contact_schedule WHERE case_id = ? AND completed_contact_id IS NOT NULL'
    ).all(caseId) as any[];
    expect(linkedSchedule).toHaveLength(1);
    expect(linkedSchedule[0].completed_contact_id).toBe(res.body.id);
  });

  it('POST /api/contacts with voicemail leaves schedule open', async () => {
    const caseId = await createCase({ date_assigned: '2026-01-10' });

    const res = await request(app)
      .post('/api/contacts')
      .send({
        case_id: caseId,
        contacted_at: '2026-01-11',
        contact_type: 'phone',
        contact_status: 'voicemail',
        client_sentiment: 'neutral',
      })
      .expect(201);

    expect(res.body.contact_status).toBe('voicemail');

    // Schedule should remain open (not linked)
    const openSchedules = db.prepare(
      'SELECT * FROM contact_schedule WHERE case_id = ? AND completed_contact_id IS NULL'
    ).all(caseId) as any[];
    expect(openSchedules).toHaveLength(1);
  });

  it('POST /api/contacts missing required fields returns 400', async () => {
    const caseId = await createCase();

    // Missing client_sentiment
    const res = await request(app)
      .post('/api/contacts')
      .send({
        case_id: caseId,
        contacted_at: '2026-01-11',
        contact_type: 'phone',
        contact_status: 'voicemail',
        // client_sentiment omitted
      })
      .expect(400);

    expect(res.body).toHaveProperty('error');
  });

  it('POST /api/contacts with non-existent case_id returns 404', async () => {
    const res = await request(app)
      .post('/api/contacts')
      .send({
        case_id: 99999,
        contacted_at: '2026-01-11',
        contact_type: 'phone',
        contact_status: 'voicemail',
        client_sentiment: 'neutral',
      })
      .expect(404);

    expect(res.body).toHaveProperty('error');
  });

  // ── POST /api/contacts/:id/action-items ──────────────────────────────────────

  it('POST /api/contacts/:id/action-items creates action item', async () => {
    const caseId = await createCase();
    const contactId = insertContact(caseId);

    const res = await request(app)
      .post(`/api/contacts/${contactId}/action-items`)
      .send({ description: 'Request medical records', assigned_to: 'Paralegal', due_date: '2026-02-01' })
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.contact_id).toBe(contactId);
    expect(res.body.description).toBe('Request medical records');
    expect(res.body.assigned_to).toBe('Paralegal');
    expect(res.body.due_date).toBe('2026-02-01');
    expect(res.body.completed).toBe(0);
  });

  it('POST /api/contacts/:id/action-items missing fields returns 400', async () => {
    const caseId = await createCase();
    const contactId = insertContact(caseId);

    // Missing assigned_to
    const res = await request(app)
      .post(`/api/contacts/${contactId}/action-items`)
      .send({ description: 'Do something' })
      .expect(400);

    expect(res.body).toHaveProperty('error');
  });

  // ── PUT /api/contact-action-items/:id ────────────────────────────────────────

  it('PUT /api/contact-action-items/:id with completed=true sets completed_at', async () => {
    const caseId = await createCase();
    const contactId = insertContact(caseId);

    const itemResult = db.prepare(`
      INSERT INTO contact_action_items (contact_id, description, assigned_to, completed)
      VALUES (?, 'Call adjuster', 'Jane', 0)
    `).run(contactId);
    const itemId = itemResult.lastInsertRowid as number;

    const res = await request(app)
      .put(`/api/contact-action-items/${itemId}`)
      .send({ completed: true })
      .expect(200);

    expect(res.body.completed).toBe(1);
    expect(res.body.completed_at).not.toBeNull();
  });

  it('PUT /api/contact-action-items/:id with completed=false clears completed_at', async () => {
    const caseId = await createCase();
    const contactId = insertContact(caseId);

    const itemResult = db.prepare(`
      INSERT INTO contact_action_items (contact_id, description, assigned_to, completed, completed_at)
      VALUES (?, 'Call adjuster', 'Jane', 1, datetime('now'))
    `).run(contactId);
    const itemId = itemResult.lastInsertRowid as number;

    const res = await request(app)
      .put(`/api/contact-action-items/${itemId}`)
      .send({ completed: false })
      .expect(200);

    expect(res.body.completed).toBe(0);
    expect(res.body.completed_at).toBeNull();
  });

  // ── GET /api/contact-schedule ─────────────────────────────────────────────────

  it('GET /api/contact-schedule returns open schedule rows with client_name', async () => {
    const caseId = await createCase({ date_assigned: '2026-01-10' });
    // Case creation inserts an initial_intro schedule

    const res = await request(app).get('/api/contact-schedule').expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    for (const row of res.body) {
      expect(row).toHaveProperty('client_name');
      expect(row.completed_contact_id).toBeNull();
    }
    expect(res.body.find((r: any) => r.case_id === caseId)).toBeDefined();
  });

  it('GET /api/contact-schedule?due_today=true filters to today', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const caseId = await createCase();

    insertSchedule(caseId, today);
    insertSchedule(caseId, '2026-01-01'); // past — should not appear

    const res = await request(app).get('/api/contact-schedule?due_today=true').expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    for (const row of res.body) {
      expect(row.due_date).toBe(today);
    }
  });

  it('GET /api/contact-schedule?overdue=true returns past-due rows', async () => {
    const caseId = await createCase();
    insertSchedule(caseId, '2026-01-01'); // clearly past due

    const today = new Date().toISOString().slice(0, 10);
    insertSchedule(caseId, today); // due today — should NOT appear

    const res = await request(app).get('/api/contact-schedule?overdue=true').expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    for (const row of res.body) {
      expect(row.due_date < today).toBe(true);
    }
  });

  it('GET /api/contact-schedule?due_this_week=true returns rows within 6 days', async () => {
    const caseId = await createCase();
    const today = new Date().toISOString().slice(0, 10);

    // Date 3 days from now — should appear
    const d3 = new Date();
    d3.setDate(d3.getDate() + 3);
    const threeDaysOut = d3.toISOString().slice(0, 10);

    // Date 10 days from now — should NOT appear
    const d10 = new Date();
    d10.setDate(d10.getDate() + 10);
    const tenDaysOut = d10.toISOString().slice(0, 10);

    insertSchedule(caseId, threeDaysOut);
    insertSchedule(caseId, tenDaysOut);

    const res = await request(app).get('/api/contact-schedule?due_this_week=true').expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    for (const row of res.body) {
      expect(row.due_date >= today).toBe(true);
      expect(row.due_date <= tenDaysOut).toBe(true); // within range check
    }
    // The 10-day row should not appear
    const tenDayRow = res.body.find((r: any) => r.due_date === tenDaysOut);
    expect(tenDayRow).toBeUndefined();
  });
});
