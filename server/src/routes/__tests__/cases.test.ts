import request from 'supertest';
import { buildApp } from '../../index';
import { createTestDb } from '../../db/test-helpers';
import Database from 'better-sqlite3';

describe('Cases API', () => {
  let app: ReturnType<typeof buildApp>;
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    app = buildApp(db);
  });

  afterEach(() => {
    db.close();
  });

  // Helper: create a case via POST and return the response body
  function createCase(overrides: Record<string, string> = {}) {
    return request(app)
      .post('/api/cases')
      .send({ client_name: 'Jane Doe', attorney: 'Smith', date_assigned: '2026-01-10', ...overrides });
  }

  // Helper: insert a closed case directly into the DB and return its id
  function insertClosedCase(): number {
    const now = new Date().toISOString();
    const result = db.prepare(
      "INSERT INTO cases (client_name, attorney, current_phase, date_assigned, created_at) VALUES (?, ?, 'closed', ?, ?)"
    ).run('Closed Client', 'Jones', '2025-06-01', now);
    const caseId = result.lastInsertRowid as number;
    // Insert a phase_history row so JOIN in GET / works
    db.prepare("INSERT INTO case_phase_history (case_id, phase, entered_at, exited_at) VALUES (?, 'closed', ?, NULL)")
      .run(caseId, now);
    return caseId;
  }

  // ── GET /api/cases ──────────────────────────────────────────────

  it('GET /api/cases returns empty array when no cases', async () => {
    const res = await request(app).get('/api/cases').expect(200);
    expect(res.body).toEqual([]);
  });

  it('GET /api/cases returns cases with days_in_phase and case_badge_priority fields', async () => {
    await createCase();
    const res = await request(app).get('/api/cases').expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toHaveProperty('days_in_phase');
    expect(res.body[0]).toHaveProperty('case_badge_priority');
    expect(res.body[0].client_name).toBe('Jane Doe');
  });

  it('GET /api/cases excludes closed cases by default', async () => {
    await createCase();
    insertClosedCase();
    const res = await request(app).get('/api/cases').expect(200);
    // Only the active case should appear
    expect(res.body).toHaveLength(1);
    expect(res.body[0].current_phase).not.toBe('closed');
  });

  it('GET /api/cases?include_closed=true includes closed cases', async () => {
    await createCase();
    insertClosedCase();
    const res = await request(app).get('/api/cases?include_closed=true').expect(200);
    expect(res.body).toHaveLength(2);
    const phases = res.body.map((c: any) => c.current_phase);
    expect(phases).toContain('closed');
  });

  // ── POST /api/cases ─────────────────────────────────────────────

  it('POST /api/cases with valid body creates case and returns 201 with case object', async () => {
    const res = await createCase().expect(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.client_name).toBe('Jane Doe');
    expect(res.body.attorney).toBe('Smith');
    expect(res.body.current_phase).toBe('file_setup');
    expect(res.body.date_assigned).toBe('2026-01-10');
  });

  it('POST /api/cases creates file_setup tasks for the new case', async () => {
    const res = await createCase().expect(201);
    const caseId = res.body.id;
    const tasks = db.prepare('SELECT * FROM tasks WHERE case_id = ?').all(caseId) as any[];
    // Seed has 6 file_setup templates
    expect(tasks.length).toBe(6);
    for (const task of tasks) {
      expect(task.phase).toBe('file_setup');
      expect(task.status).toBe('pending');
    }
  });

  it('POST /api/cases creates initial_intro contact_schedule row', async () => {
    const res = await createCase({ date_assigned: '2026-01-10' }).expect(201);
    const caseId = res.body.id;
    const schedules = db.prepare(
      "SELECT * FROM contact_schedule WHERE case_id = ? AND schedule_type = 'initial_intro'"
    ).all(caseId) as any[];
    expect(schedules).toHaveLength(1);
    expect(schedules[0].due_date).toBe('2026-01-11'); // date_assigned + 1 day
  });

  it('POST /api/cases with missing fields returns 400', async () => {
    const res = await request(app).post('/api/cases').send({ client_name: 'Only Name' }).expect(400);
    expect(res.body).toHaveProperty('error');
  });

  // ── GET /api/cases/:id ──────────────────────────────────────────

  it('GET /api/cases/:id returns case with tasks, phaseHistory, openSchedules, latestContact', async () => {
    const created = (await createCase().expect(201)).body;
    const res = await request(app).get(`/api/cases/${created.id}`).expect(200);
    expect(res.body.id).toBe(created.id);
    expect(res.body.client_name).toBe('Jane Doe');
    expect(Array.isArray(res.body.tasks)).toBe(true);
    expect(res.body.tasks.length).toBe(6); // file_setup templates
    expect(Array.isArray(res.body.phaseHistory)).toBe(true);
    expect(res.body.phaseHistory.length).toBe(1);
    expect(Array.isArray(res.body.openSchedules)).toBe(true);
    expect(res.body.openSchedules.length).toBe(1); // initial_intro
    expect(res.body).toHaveProperty('latestContact');
    expect(res.body.latestContact).toBeNull(); // no contacts yet
  });

  it('GET /api/cases/:id returns 404 for unknown id', async () => {
    const res = await request(app).get('/api/cases/99999').expect(404);
    expect(res.body).toHaveProperty('error');
  });

  // ── POST /api/cases/:id/advance ─────────────────────────────────

  it('POST /api/cases/:id/advance advances phase and returns { newPhase, incompleteTasks }', async () => {
    const created = (await createCase().expect(201)).body;
    const res = await request(app).post(`/api/cases/${created.id}/advance`).expect(200);
    expect(res.body).toHaveProperty('newPhase', 'treating');
    expect(res.body).toHaveProperty('incompleteTasks');
    expect(typeof res.body.incompleteTasks).toBe('number');
    // Verify phase was updated in DB
    const caseRow = db.prepare('SELECT current_phase FROM cases WHERE id = ?').get(created.id) as any;
    expect(caseRow.current_phase).toBe('treating');
  });

  it('POST /api/cases/:id/advance to treating creates treating_checkin schedule', async () => {
    const created = (await createCase().expect(201)).body;
    await request(app).post(`/api/cases/${created.id}/advance`).expect(200);
    const schedules = db.prepare(
      "SELECT * FROM contact_schedule WHERE case_id = ? AND schedule_type = 'treating_checkin'"
    ).all(created.id) as any[];
    expect(schedules).toHaveLength(1);
  });

  // ── DELETE /api/cases/:id ───────────────────────────────────────

  it('DELETE /api/cases/:id on closed case returns 204', async () => {
    const caseId = insertClosedCase();
    await request(app).delete(`/api/cases/${caseId}`).expect(204);
    // Verify it's gone
    const row = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
    expect(row).toBeUndefined();
  });

  it('DELETE /api/cases/:id on active case returns 409', async () => {
    const created = (await createCase().expect(201)).body;
    const res = await request(app).delete(`/api/cases/${created.id}`).expect(409);
    expect(res.body).toHaveProperty('error');
  });

  it('DELETE /api/cases/:id on unknown id returns 404', async () => {
    const res = await request(app).delete('/api/cases/99999').expect(404);
    expect(res.body).toHaveProperty('error');
  });
});
