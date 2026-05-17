import request from 'supertest';
import { buildApp } from '../../index';
import { createTestDb } from '../../db/test-helpers';
import Database from 'better-sqlite3';

describe('Communication API', () => {
  let app: ReturnType<typeof buildApp>;
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    app = buildApp(db);
  });
  afterEach(() => { db.close(); });

  async function createCase(overrides: Record<string, string> = {}): Promise<number> {
    const res = await request(app)
      .post('/api/cases')
      .send({ client_name: 'Jane Doe', attorney: 'Smith', date_assigned: '2026-01-10', ...overrides });
    return res.body.id as number;
  }

  // ── GET /api/communication ─────────────────────────────────────────────────

  it('GET /api/communication returns all non-closed cases', async () => {
    await createCase({ client_name: 'Alice' });
    await createCase({ client_name: 'Bob' });

    // Closed case — should NOT appear
    const closedRes = await request(app)
      .post('/api/cases')
      .send({ client_name: 'Closed Client', attorney: 'Smith', date_assigned: '2026-01-10' });
    db.prepare("UPDATE cases SET current_phase = 'closed' WHERE id = ?").run(closedRes.body.id);

    const res = await request(app).get('/api/communication').expect(200);
    const names = res.body.map((r: any) => r.client_name);
    expect(names).toContain('Alice');
    expect(names).toContain('Bob');
    expect(names).not.toContain('Closed Client');
  });

  it('GET /api/communication row has required fields', async () => {
    await createCase();
    const res = await request(app).get('/api/communication').expect(200);
    const row = res.body[0];
    expect(row).toHaveProperty('case_id');
    expect(row).toHaveProperty('client_name');
    expect(row).toHaveProperty('attorney');
    expect(row).toHaveProperty('current_phase');
    expect(row).toHaveProperty('initial_contact_date');
    expect(row).toHaveProperty('last_contact_date');
    expect(row).toHaveProperty('next_contact_due');
    expect(row).toHaveProperty('is_overdue');
  });

  it('GET /api/communication is_overdue=true when open schedule is past due', async () => {
    const caseId = await createCase({ date_assigned: '2026-01-01' });
    // Force the initial_intro schedule to be past due
    db.prepare(
      "UPDATE contact_schedule SET due_date = '2026-01-02' WHERE case_id = ?"
    ).run(caseId);

    const res = await request(app).get('/api/communication').expect(200);
    const row = res.body.find((r: any) => r.case_id === caseId);
    expect(row.is_overdue).toBe(true);
  });

  it('GET /api/communication is_overdue=false when no open schedule is past due', async () => {
    const caseId = await createCase({ date_assigned: '2099-01-01' }); // far future
    db.prepare(
      "UPDATE contact_schedule SET due_date = '2099-01-02' WHERE case_id = ?"
    ).run(caseId);

    const res = await request(app).get('/api/communication').expect(200);
    const row = res.body.find((r: any) => r.case_id === caseId);
    expect(row.is_overdue).toBe(false);
  });

  it('GET /api/communication populates last_contact_date from most recent contact', async () => {
    const caseId = await createCase();
    db.prepare(
      "INSERT INTO contacts (case_id, contacted_at, contact_type, contact_status, client_sentiment, follow_up_necessary, created_at) VALUES (?, '2026-02-01', 'phone', 'answered', 'positive', 0, datetime('now'))"
    ).run(caseId);

    const res = await request(app).get('/api/communication').expect(200);
    const row = res.body.find((r: any) => r.case_id === caseId);
    expect(row.last_contact_date).toBe('2026-02-01');
  });

  // ── POST /api/communication/:caseId/log ────────────────────────────────────

  it('POST /api/communication/:caseId/log creates a contact with hub fields', async () => {
    const caseId = await createCase();

    const res = await request(app)
      .post(`/api/communication/${caseId}/log`)
      .send({
        contacted_at: '2026-03-01',
        last_attempted: '2026-02-28',
        contact_attempt_type: 'completed',
        contact_status: 'answered',
        client_sentiment: 'positive',
        follow_up_type: 'none_needed',
        action_item: 'Send updated medical records',
      })
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.contact_attempt_type).toBe('completed');
    expect(res.body.follow_up_type).toBe('none_needed');
    expect(res.body.client_sentiment).toBe('positive');
    expect(res.body.action_item).toBe('Send updated medical records');
  });

  it('POST /api/communication/:caseId/log stores contact_type as phone', async () => {
    const caseId = await createCase();
    const res = await request(app)
      .post(`/api/communication/${caseId}/log`)
      .send({
        contacted_at: '2026-03-01',
        contact_attempt_type: 'attempted',
        contact_status: 'no_answer',
        client_sentiment: 'neutral',
        follow_up_type: 'cm_follow_up',
      })
      .expect(201);

    const row = db.prepare('SELECT * FROM contacts WHERE id = ?').get(res.body.id) as any;
    expect(row.contact_type).toBe('phone');
  });

  it('POST /api/communication/:caseId/log with answered status advances schedule', async () => {
    const caseId = await createCase({ date_assigned: '2026-01-10' });

    await request(app)
      .post(`/api/communication/${caseId}/log`)
      .send({
        contacted_at: '2026-01-11',
        contact_attempt_type: 'completed',
        contact_status: 'answered',
        client_sentiment: 'positive',
        follow_up_type: 'none_needed',
      })
      .expect(201);

    // The initial_intro schedule should be linked
    const linked = db.prepare(
      'SELECT * FROM contact_schedule WHERE case_id = ? AND completed_contact_id IS NOT NULL'
    ).all(caseId) as any[];
    expect(linked).toHaveLength(1);
  });

  it('POST /api/communication/:caseId/log with at_risk sentiment is saved', async () => {
    const caseId = await createCase();
    const res = await request(app)
      .post(`/api/communication/${caseId}/log`)
      .send({
        contacted_at: '2026-03-01',
        contact_attempt_type: 'completed',
        contact_status: 'answered',
        client_sentiment: 'at_risk',
        follow_up_type: 'urgent_escalation',
      })
      .expect(201);

    expect(res.body.client_sentiment).toBe('at_risk');
  });

  it('POST /api/communication/:caseId/log missing required fields returns 400', async () => {
    const caseId = await createCase();
    const res = await request(app)
      .post(`/api/communication/${caseId}/log`)
      .send({ contacted_at: '2026-03-01' }) // missing contact_attempt_type etc.
      .expect(400);
    expect(res.body).toHaveProperty('error');
  });

  it('POST /api/communication/99999/log returns 404 for unknown case', async () => {
    const res = await request(app)
      .post('/api/communication/99999/log')
      .send({
        contacted_at: '2026-03-01',
        contact_attempt_type: 'attempted',
        contact_status: 'no_answer',
        client_sentiment: 'neutral',
        follow_up_type: 'cm_follow_up',
      })
      .expect(404);
    expect(res.body).toHaveProperty('error');
  });
});
