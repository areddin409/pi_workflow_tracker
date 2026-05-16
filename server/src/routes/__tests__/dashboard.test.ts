import request from 'supertest';
import { buildApp } from '../../index';
import { createTestDb } from '../../db/test-helpers';
import Database from 'better-sqlite3';

describe('Dashboard + Settings API', () => {
  let app: ReturnType<typeof buildApp>;
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    app = buildApp(db);
  });

  afterEach(() => {
    db.close();
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Create a case via POST and return its id */
  async function createCase(overrides: Record<string, string> = {}): Promise<number> {
    const res = await request(app)
      .post('/api/cases')
      .send({ client_name: 'Jane Doe', attorney: 'Smith', date_assigned: '2026-01-10', ...overrides });
    return res.body.id as number;
  }

  /** Insert a case directly and return its id (for fine-grained phase control) */
  function insertCase(overrides: { client_name?: string; current_phase?: string } = {}): number {
    const now = new Date().toISOString();
    const result = db.prepare(
      "INSERT INTO cases (client_name, attorney, current_phase, date_assigned, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(
      overrides.client_name ?? 'Test Client',
      'Smith',
      overrides.current_phase ?? 'file_setup',
      '2026-01-10',
      now
    );
    const caseId = result.lastInsertRowid as number;
    db.prepare(
      "INSERT INTO case_phase_history (case_id, phase, entered_at) VALUES (?, ?, datetime('now', '-10 days'))"
    ).run(caseId, overrides.current_phase ?? 'file_setup');
    return caseId;
  }

  /** Insert a task for a case, optionally completed */
  function insertTask(caseId: number, overrides: { status?: string; due_date?: string } = {}): number {
    const result = db.prepare(`
      INSERT INTO tasks (case_id, phase, title, priority, status, due_date, created_at)
      VALUES (?, 'file_setup', 'Test Task', 'medium', ?, ?, datetime('now'))
    `).run(caseId, overrides.status ?? 'pending', overrides.due_date ?? null);
    return result.lastInsertRowid as number;
  }

  /** Insert a contact directly and return its id */
  function insertContact(caseId: number, overrides: { client_sentiment?: string; contacted_at?: string } = {}): number {
    const result = db.prepare(`
      INSERT INTO contacts (case_id, contacted_at, contact_type, contact_status, client_sentiment, follow_up_necessary, created_at)
      VALUES (?, ?, 'phone', 'answered', ?, 0, datetime('now'))
    `).run(caseId, overrides.contacted_at ?? '2026-01-15', overrides.client_sentiment ?? 'neutral');
    return result.lastInsertRowid as number;
  }

  // ── GET /api/dashboard ─────────────────────────────────────────────────────

  it('GET /api/dashboard returns all stat fields', async () => {
    const res = await request(app).get('/api/dashboard').expect(200);
    expect(res.body).toHaveProperty('overdueTasks');
    expect(res.body).toHaveProperty('dueToday');
    expect(res.body).toHaveProperty('openTasks');
    expect(res.body).toHaveProperty('totalCases');
    expect(res.body).toHaveProperty('contactRate');
  });

  it('GET /api/dashboard with no data returns zeros and contactRate=100', async () => {
    const res = await request(app).get('/api/dashboard').expect(200);
    expect(res.body.totalCases).toBe(0);
    expect(res.body.contactRate).toBe(100);
    expect(res.body.overdueTasksList).toEqual([]);
  });

  it('GET /api/dashboard correctly counts openTasks (non-completed in open cases)', async () => {
    const caseId = insertCase();

    // Insert 2 pending tasks and 1 completed task
    insertTask(caseId, { status: 'pending' });
    insertTask(caseId, { status: 'in_progress' });
    insertTask(caseId, { status: 'completed' });

    // Insert a closed case with a pending task — should NOT be counted
    const closedId = insertCase({ current_phase: 'closed' });
    insertTask(closedId, { status: 'pending' });

    const res = await request(app).get('/api/dashboard').expect(200);
    // 2 non-completed tasks from open case (plus however many were created by createCase helper above — but we used insertCase which doesn't call the API, so no auto-templates)
    expect(res.body.openTasks).toBe(2);
  });

  it('GET /api/dashboard todaysFocus includes overdue tasks with urgency=1', async () => {
    const today = new Date().toISOString().slice(0, 10);

    // Use insertCase so we can control phase history manually for overdue detection
    // overdue = phase_settings.overdue_threshold_days elapsed since case_phase_history.entered_at
    // file_setup has overdue_threshold_days = 0, so any file_setup task is immediately overdue
    const caseId = insertCase({ current_phase: 'file_setup' });
    insertTask(caseId, { status: 'pending' });

    const res = await request(app).get('/api/dashboard').expect(200);

    const focus: any[] = res.body.todaysFocus;
    const urgency1Items = focus.filter(f => f.urgency === 1 && f.type === 'task');
    expect(urgency1Items.length).toBeGreaterThan(0);
    expect(urgency1Items[0]).toHaveProperty('type', 'task');
    expect(urgency1Items[0]).toHaveProperty('urgency', 1);
  });

  it('GET /api/dashboard todaysFocus items are sorted by urgency ascending', async () => {
    const today = new Date().toISOString().slice(0, 10);

    // Create an overdue task (urgency=1) via a file_setup case (threshold=0)
    const caseId = insertCase({ current_phase: 'file_setup' });
    insertTask(caseId, { status: 'pending' });

    // Create a due-today task (urgency=2)
    const caseId2 = insertCase({ current_phase: 'treating' });
    insertTask(caseId2, { status: 'pending', due_date: today });

    const res = await request(app).get('/api/dashboard').expect(200);

    const focus: any[] = res.body.todaysFocus;
    if (focus.length >= 2) {
      for (let i = 1; i < focus.length; i++) {
        expect(focus[i].urgency).toBeGreaterThanOrEqual(focus[i - 1].urgency);
      }
    }
  });

  it('GET /api/dashboard atRiskClients returns clients with negative sentiment', async () => {
    const caseId = await createCase({ client_name: 'Negative Nancy' });
    insertContact(caseId, { client_sentiment: 'negative' });

    const res = await request(app).get('/api/dashboard').expect(200);
    const atRisk: any[] = res.body.atRiskClients;

    expect(atRisk.length).toBeGreaterThan(0);
    const match = atRisk.find((c: any) => c.client_name === 'Negative Nancy');
    expect(match).toBeDefined();
    expect(match.sentiment).toBe('negative');
  });

  // ── GET /api/settings ──────────────────────────────────────────────────────

  it('GET /api/settings returns all 5 phase settings rows', async () => {
    const res = await request(app).get('/api/settings').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(5);
    const phases = res.body.map((s: any) => s.phase);
    expect(phases).toContain('file_setup');
    expect(phases).toContain('treating');
    expect(phases).toContain('demand_drafting');
    expect(phases).toContain('demand_sent');
    expect(phases).toContain('negotiations');
  });

  // ── PUT /api/settings/:phase ───────────────────────────────────────────────

  it('PUT /api/settings/:phase updates a field and returns updated row', async () => {
    const res = await request(app)
      .put('/api/settings/file_setup')
      .send({ auto_due_offset_days: 10 })
      .expect(200);

    expect(res.body.phase).toBe('file_setup');
    expect(res.body.auto_due_offset_days).toBe(10);

    // Confirm persisted in DB
    const row = db.prepare('SELECT * FROM phase_settings WHERE phase = ?').get('file_setup') as any;
    expect(row.auto_due_offset_days).toBe(10);
  });

  it('PUT /api/settings/:phase on unknown phase returns 404', async () => {
    const res = await request(app)
      .put('/api/settings/nonexistent_phase')
      .send({ auto_due_offset_days: 5 })
      .expect(404);

    expect(res.body).toHaveProperty('error');
  });
});
