import request from 'supertest';
import { buildApp } from '../../index';
import { createTestDb } from '../../db/test-helpers';
import Database from 'better-sqlite3';

describe('Tasks API', () => {
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
  async function createCase(overrides: Record<string, string> = {}) {
    const res = await request(app)
      .post('/api/cases')
      .send({ client_name: 'Jane Doe', attorney: 'Smith', date_assigned: '2026-01-10', ...overrides });
    return res.body as { id: number; current_phase: string; client_name: string; attorney: string };
  }

  // Helper: get the first task for a given case
  function getFirstTask(caseId: number): any {
    return db.prepare('SELECT * FROM tasks WHERE case_id = ? LIMIT 1').get(caseId);
  }

  // ── GET /api/tasks ──────────────────────────────────────────────────────────

  it('GET /api/tasks returns all tasks with client_name and attorney fields', async () => {
    const created = await createCase();
    const res = await request(app).get('/api/tasks').expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    for (const task of res.body) {
      expect(task).toHaveProperty('client_name', 'Jane Doe');
      expect(task).toHaveProperty('attorney', 'Smith');
    }
    // All tasks should belong to the created case
    expect(res.body.every((t: any) => t.case_id === created.id)).toBe(true);
  });

  it('GET /api/tasks?status=pending filters by status', async () => {
    await createCase();
    // Mark one task completed to verify filter excludes it
    const task = db.prepare('SELECT * FROM tasks LIMIT 1').get() as any;
    db.prepare("UPDATE tasks SET status = 'completed' WHERE id = ?").run(task.id);

    const res = await request(app).get('/api/tasks?status=pending').expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    for (const t of res.body) {
      expect(t.status).toBe('pending');
    }
    // The completed task should not appear
    expect(res.body.find((t: any) => t.id === task.id)).toBeUndefined();
  });

  it('GET /api/tasks?phase=file_setup filters by phase', async () => {
    await createCase();
    const res = await request(app).get('/api/tasks?phase=file_setup').expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    for (const t of res.body) {
      expect(t.phase).toBe('file_setup');
    }
  });

  it('GET /api/tasks?due_today=true returns only tasks due today (non-completed)', async () => {
    const created = await createCase();
    const today = new Date().toISOString().slice(0, 10);

    // Set one task's due_date to today
    const task = getFirstTask(created.id);
    db.prepare('UPDATE tasks SET due_date = ? WHERE id = ?').run(today, task.id);

    // Mark another task due today but completed — should be excluded
    const tasks = db.prepare('SELECT * FROM tasks WHERE case_id = ?').all(created.id) as any[];
    const secondTask = tasks[1];
    db.prepare("UPDATE tasks SET due_date = ?, status = 'completed' WHERE id = ?").run(today, secondTask.id);

    const res = await request(app).get('/api/tasks?due_today=true').expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    for (const t of res.body) {
      expect(t.due_date).toBe(today);
      expect(t.status).not.toBe('completed');
    }
    expect(res.body.find((t: any) => t.id === task.id)).toBeDefined();
    expect(res.body.find((t: any) => t.id === secondTask.id)).toBeUndefined();
  });

  it('GET /api/tasks?overdue=true returns only overdue tasks (past threshold)', async () => {
    // file_setup has overdue_threshold_days = 0, so tasks are immediately overdue
    // We need a case in file_setup phase whose phase_history entry was entered in the past
    const now = new Date().toISOString();
    const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days ago

    // Insert case directly with an old entered_at
    const caseResult = db.prepare(
      "INSERT INTO cases (client_name, attorney, current_phase, date_assigned, created_at) VALUES (?, ?, 'file_setup', ?, ?)"
    ).run('Overdue Client', 'Jones', '2026-01-01', now);
    const caseId = caseResult.lastInsertRowid as number;

    // Insert phase history with entered_at 2 days ago (overdue_threshold_days=0 means entered_at + 0 days < today)
    db.prepare("INSERT INTO case_phase_history (case_id, phase, entered_at) VALUES (?, 'file_setup', ?)").run(caseId, pastDate);

    // Insert a task for this case in file_setup phase
    db.prepare(
      "INSERT INTO tasks (case_id, phase, template_id, title, priority, status, created_at) VALUES (?, 'file_setup', NULL, 'Overdue Task', 'high', 'pending', ?)"
    ).run(caseId, now);

    const res = await request(app).get('/api/tasks?overdue=true').expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    for (const t of res.body) {
      expect(t.status).not.toBe('completed');
    }
    expect(res.body.find((t: any) => t.case_id === caseId)).toBeDefined();
  });

  it('GET /api/tasks?case_id=X filters by case', async () => {
    const case1 = await createCase({ client_name: 'Client One' });
    const case2 = await createCase({ client_name: 'Client Two' });

    const res = await request(app).get(`/api/tasks?case_id=${case1.id}`).expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    for (const t of res.body) {
      expect(t.case_id).toBe(case1.id);
    }
    // case2 tasks should not appear
    expect(res.body.find((t: any) => t.case_id === case2.id)).toBeUndefined();
  });

  // ── POST /api/tasks ─────────────────────────────────────────────────────────

  it('POST /api/tasks creates auxiliary task (template_id = null), returns 201', async () => {
    const created = await createCase();

    const res = await request(app)
      .post('/api/tasks')
      .send({ case_id: created.id, title: 'My Custom Task', priority: 'high', notes: 'Some notes' })
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.title).toBe('My Custom Task');
    expect(res.body.template_id).toBeNull();
    expect(res.body.status).toBe('pending');
    expect(res.body.phase).toBe('file_setup');
    expect(res.body.priority).toBe('high');
    expect(res.body.notes).toBe('Some notes');
    expect(res.body.case_id).toBe(created.id);
  });

  it('POST /api/tasks missing case_id or title returns 400', async () => {
    // Missing title
    let res = await request(app)
      .post('/api/tasks')
      .send({ case_id: 1 })
      .expect(400);
    expect(res.body).toHaveProperty('error');

    // Missing case_id
    res = await request(app)
      .post('/api/tasks')
      .send({ title: 'No case' })
      .expect(400);
    expect(res.body).toHaveProperty('error');
  });

  it('POST /api/tasks with non-existent case_id returns 404', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ case_id: 99999, title: 'Ghost Task' })
      .expect(404);
    expect(res.body).toHaveProperty('error');
  });

  // ── PUT /api/tasks/:id ──────────────────────────────────────────────────────

  it('PUT /api/tasks/:id updates allowed fields', async () => {
    const created = await createCase();
    const task = getFirstTask(created.id);

    const res = await request(app)
      .put(`/api/tasks/${task.id}`)
      .send({ status: 'in_progress', notes: 'Working on it', priority: 'high' })
      .expect(200);

    expect(res.body.id).toBe(task.id);
    expect(res.body.status).toBe('in_progress');
    expect(res.body.notes).toBe('Working on it');
    expect(res.body.priority).toBe('high');
  });

  it('PUT /api/tasks/:id status=completed auto-sets completion_date', async () => {
    const created = await createCase();
    const task = getFirstTask(created.id);
    const today = new Date().toISOString().slice(0, 10);

    const res = await request(app)
      .put(`/api/tasks/${task.id}`)
      .send({ status: 'completed' })
      .expect(200);

    expect(res.body.status).toBe('completed');
    expect(res.body.completion_date).toBe(today);
  });

  it('PUT /api/tasks/:id returns 404 for unknown id', async () => {
    const res = await request(app)
      .put('/api/tasks/99999')
      .send({ status: 'in_progress' })
      .expect(404);
    expect(res.body).toHaveProperty('error');
  });

  it("PUT /api/tasks/:id doesn't overwrite fields not in body", async () => {
    const created = await createCase();
    const task = getFirstTask(created.id);

    // First set some initial field values
    db.prepare('UPDATE tasks SET notes = ?, waiting_on = ? WHERE id = ?').run('Original notes', 'client', task.id);

    // Update only status
    const res = await request(app)
      .put(`/api/tasks/${task.id}`)
      .send({ status: 'in_progress' })
      .expect(200);

    expect(res.body.status).toBe('in_progress');
    // notes and waiting_on should remain unchanged
    expect(res.body.notes).toBe('Original notes');
    expect(res.body.waiting_on).toBe('client');
  });
});
