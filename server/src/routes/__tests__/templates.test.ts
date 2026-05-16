import request from 'supertest';
import { buildApp } from '../../index';
import { createTestDb } from '../../db/test-helpers';
import Database from 'better-sqlite3';

describe('Templates API', () => {
  let app: ReturnType<typeof buildApp>;
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    app = buildApp(db);
  });

  afterEach(() => {
    db.close();
  });

  // Helper: create a case in a specific phase via POST
  async function createCase(overrides: Record<string, string> = {}) {
    const res = await request(app)
      .post('/api/cases')
      .send({ client_name: 'Jane Doe', attorney: 'Smith', date_assigned: '2026-01-10', ...overrides });
    return res.body as { id: number; current_phase: string };
  }

  // ── GET /api/templates ──────────────────────────────────────────────────────

  it('GET /api/templates returns object with all 5 phase keys', async () => {
    const res = await request(app).get('/api/templates').expect(200);
    expect(res.body).toHaveProperty('file_setup');
    expect(res.body).toHaveProperty('treating');
    expect(res.body).toHaveProperty('demand_drafting');
    expect(res.body).toHaveProperty('demand_sent');
    expect(res.body).toHaveProperty('negotiations');
    // All values should be arrays
    for (const key of ['file_setup', 'treating', 'demand_drafting', 'demand_sent', 'negotiations']) {
      expect(Array.isArray(res.body[key])).toBe(true);
    }
  });

  it('GET /api/templates each phase array contains correct templates sorted by sort_order', async () => {
    const res = await request(app).get('/api/templates').expect(200);

    // Seed has 6 file_setup templates, 6 treating, 6 demand_drafting, 2 demand_sent, 2 negotiations
    expect(res.body.file_setup).toHaveLength(6);
    expect(res.body.treating).toHaveLength(6);
    expect(res.body.demand_drafting).toHaveLength(6);
    expect(res.body.demand_sent).toHaveLength(2);
    expect(res.body.negotiations).toHaveLength(2);

    // Each phase array should be sorted by sort_order ascending
    for (const phase of ['file_setup', 'treating', 'demand_drafting', 'demand_sent', 'negotiations']) {
      const arr = res.body[phase] as any[];
      for (let i = 1; i < arr.length; i++) {
        expect(arr[i].sort_order).toBeGreaterThanOrEqual(arr[i - 1].sort_order);
      }
      // Each template belongs to the correct phase
      for (const t of arr) {
        expect(t.phase).toBe(phase);
      }
    }
  });

  // ── POST /api/templates ─────────────────────────────────────────────────────

  it('POST /api/templates creates template and returns 201 with { template, affectedCases }', async () => {
    const res = await request(app)
      .post('/api/templates')
      .send({ phase: 'file_setup', title: 'New Test Template', priority: 'high', sort_order: 99 })
      .expect(201);

    expect(res.body).toHaveProperty('template');
    expect(res.body).toHaveProperty('affectedCases');
    expect(res.body.template.title).toBe('New Test Template');
    expect(res.body.template.phase).toBe('file_setup');
    expect(res.body.template.priority).toBe('high');
    expect(res.body.template.sort_order).toBe(99);
    expect(typeof res.body.affectedCases).toBe('number');
  });

  it('POST /api/templates propagates to active cases in that phase', async () => {
    // Create a case (starts in file_setup by default)
    const created = await createCase();
    expect(created.current_phase).toBe('file_setup');

    // The case already has file_setup tasks from the seed templates.
    // Now add a new template and verify it gets propagated.
    const tasksBefore = db.prepare('SELECT COUNT(*) as c FROM tasks WHERE case_id = ?').get(created.id) as { c: number };
    const countBefore = tasksBefore.c;

    const res = await request(app)
      .post('/api/templates')
      .send({ phase: 'file_setup', title: 'Propagated Template', priority: 'medium' })
      .expect(201);

    expect(res.body.affectedCases).toBe(1); // 1 case in file_setup

    // Verify a new task was created for the case
    const tasksAfter = db.prepare('SELECT COUNT(*) as c FROM tasks WHERE case_id = ?').get(created.id) as { c: number };
    expect(tasksAfter.c).toBe(countBefore + 1);

    // Verify the new task matches the new template
    const newTemplateId = res.body.template.id;
    const propagatedTask = db.prepare(
      'SELECT * FROM tasks WHERE case_id = ? AND template_id = ?'
    ).get(created.id, newTemplateId) as any;
    expect(propagatedTask).toBeDefined();
    expect(propagatedTask.title).toBe('Propagated Template');
    expect(propagatedTask.status).toBe('pending');
  });

  it('POST /api/templates missing phase or title returns 400', async () => {
    // Missing title
    let res = await request(app)
      .post('/api/templates')
      .send({ phase: 'file_setup' })
      .expect(400);
    expect(res.body).toHaveProperty('error');

    // Missing phase
    res = await request(app)
      .post('/api/templates')
      .send({ title: 'No Phase Template' })
      .expect(400);
    expect(res.body).toHaveProperty('error');
  });

  // ── PUT /api/templates/:id ──────────────────────────────────────────────────

  it('PUT /api/templates/:id updates template fields and returns { template, affectedTasks }', async () => {
    // Get a seeded template id
    const template = db.prepare('SELECT * FROM task_templates LIMIT 1').get() as any;

    const res = await request(app)
      .put(`/api/templates/${template.id}`)
      .send({ title: 'Updated Title', priority: 'low', sort_order: 10 })
      .expect(200);

    expect(res.body).toHaveProperty('template');
    expect(res.body).toHaveProperty('affectedTasks');
    expect(res.body.template.id).toBe(template.id);
    expect(res.body.template.title).toBe('Updated Title');
    expect(res.body.template.priority).toBe('low');
    expect(res.body.template.sort_order).toBe(10);
    expect(typeof res.body.affectedTasks).toBe('number');
  });

  it('PUT /api/templates/:id propagates title/priority update to pending tasks', async () => {
    // Create a case to generate tasks
    const created = await createCase();

    // Get a file_setup template (which will have tasks due to propagation from case creation)
    const template = db.prepare(
      "SELECT * FROM task_templates WHERE phase = 'file_setup' LIMIT 1"
    ).get() as any;

    // Verify there's a pending task for this template
    const taskBefore = db.prepare(
      "SELECT * FROM tasks WHERE case_id = ? AND template_id = ? AND status = 'pending'"
    ).get(created.id, template.id) as any;
    expect(taskBefore).toBeDefined();
    expect(taskBefore.title).toBe(template.title);

    // Update the template title and priority
    await request(app)
      .put(`/api/templates/${template.id}`)
      .send({ title: 'Propagation Updated Title', priority: 'low' })
      .expect(200);

    // Verify the task was updated by propagation
    const taskAfter = db.prepare(
      'SELECT * FROM tasks WHERE id = ?'
    ).get(taskBefore.id) as any;
    expect(taskAfter.title).toBe('Propagation Updated Title');
    expect(taskAfter.priority).toBe('low');
  });

  it('PUT /api/templates/:id returns 404 for unknown id', async () => {
    const res = await request(app)
      .put('/api/templates/99999')
      .send({ title: 'Ghost Template' })
      .expect(404);
    expect(res.body).toHaveProperty('error');
  });

  // ── DELETE /api/templates/:id ───────────────────────────────────────────────

  it('DELETE /api/templates/:id removes template and returns { deletedPendingTasks }', async () => {
    // Create a case to generate tasks linked to templates
    const created = await createCase();

    // Get a file_setup template that has pending tasks
    const template = db.prepare(
      "SELECT * FROM task_templates WHERE phase = 'file_setup' LIMIT 1"
    ).get() as any;

    // Count pending tasks for this template
    const pendingBefore = db.prepare(
      "SELECT COUNT(*) as c FROM tasks WHERE template_id = ? AND status = 'pending'"
    ).get(template.id) as { c: number };
    expect(pendingBefore.c).toBeGreaterThan(0);

    const res = await request(app)
      .delete(`/api/templates/${template.id}`)
      .expect(200);

    expect(res.body).toHaveProperty('deletedPendingTasks');
    expect(res.body.deletedPendingTasks).toBe(pendingBefore.c);

    // Verify template is gone
    const deletedTemplate = db.prepare('SELECT * FROM task_templates WHERE id = ?').get(template.id);
    expect(deletedTemplate).toBeUndefined();

    // Verify pending tasks are gone
    const pendingAfter = db.prepare(
      "SELECT COUNT(*) as c FROM tasks WHERE template_id = ? AND status = 'pending'"
    ).get(template.id) as { c: number };
    expect(pendingAfter.c).toBe(0);
  });

  it('DELETE /api/templates/:id propagates deletion: pending tasks removed, completed preserved', async () => {
    const created = await createCase();

    // Get a file_setup template
    const template = db.prepare(
      "SELECT * FROM task_templates WHERE phase = 'file_setup' LIMIT 1"
    ).get() as any;

    // Get all tasks for this template on this case
    const pendingTask = db.prepare(
      "SELECT * FROM tasks WHERE case_id = ? AND template_id = ? AND status = 'pending'"
    ).get(created.id, template.id) as any;
    expect(pendingTask).toBeDefined();

    // Mark the task as completed
    db.prepare("UPDATE tasks SET status = 'completed' WHERE id = ?").run(pendingTask.id);

    // Delete the template — completed task should survive, pending tasks removed
    const res = await request(app)
      .delete(`/api/templates/${template.id}`)
      .expect(200);

    // No pending tasks were deleted (we completed the only one)
    expect(res.body.deletedPendingTasks).toBe(0);

    // Completed task should still exist
    const completedTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(pendingTask.id) as any;
    expect(completedTask).toBeDefined();
    expect(completedTask.status).toBe('completed');
  });

  it('DELETE /api/templates/:id returns 404 for unknown id', async () => {
    const res = await request(app)
      .delete('/api/templates/99999')
      .expect(404);
    expect(res.body).toHaveProperty('error');
  });
});
