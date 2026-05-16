import Database from 'better-sqlite3';
import { createTestDb } from '../../db/test-helpers';
import { propagateTemplateUpdate, propagateNewTemplate, propagateTemplateDelete } from '../propagation';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function insertCase(db: Database.Database, phase = 'file_setup', phaseEnteredAt = '2026-01-01'): number {
  db.prepare("INSERT INTO cases (client_name, attorney, date_assigned, current_phase) VALUES ('Test', 'Atty', '2026-01-01', ?)").run(phase);
  const caseId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id;
  db.prepare("INSERT INTO case_phase_history (case_id, phase, entered_at) VALUES (?, ?, datetime(?))")
    .run(caseId, phase, phaseEnteredAt);
  return caseId;
}

function insertTemplate(db: Database.Database, phase = 'file_setup', title = 'Old Title', priority = 'high'): number {
  db.prepare("INSERT INTO task_templates (phase, title, priority, sort_order) VALUES (?, ?, ?, 99)").run(phase, title, priority);
  return (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id;
}

function insertTask(db: Database.Database, caseId: number, templateId: number, phase = 'file_setup', status = 'pending'): number {
  db.prepare("INSERT INTO tasks (case_id, phase, template_id, title, priority, status) VALUES (?, ?, ?, 'Old Title', 'high', ?)").run(caseId, phase, templateId, status);
  return (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id;
}

// ---------------------------------------------------------------------------
// propagateTemplateUpdate
// ---------------------------------------------------------------------------

describe('propagateTemplateUpdate', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it('test 1: updates title AND priority on pending tasks linked to that template', () => {
    const caseId = insertCase(db);
    const templateId = insertTemplate(db, 'file_setup', 'Old Title', 'high');
    insertTask(db, caseId, templateId, 'file_setup', 'pending');

    // Update the template
    db.prepare("UPDATE task_templates SET title = 'New Title', priority = 'low' WHERE id = ?").run(templateId);
    propagateTemplateUpdate(db, templateId);

    const task = db.prepare('SELECT * FROM tasks WHERE case_id = ? AND template_id = ?').get(caseId, templateId) as any;
    expect(task.title).toBe('New Title');
    expect(task.priority).toBe('low');
  });

  it('test 2: does NOT update completed tasks', () => {
    const caseId = insertCase(db);
    const templateId = insertTemplate(db, 'file_setup', 'Old Title', 'high');
    const taskId = insertTask(db, caseId, templateId, 'file_setup', 'completed');

    db.prepare("UPDATE task_templates SET title = 'New Title', priority = 'low' WHERE id = ?").run(templateId);
    propagateTemplateUpdate(db, templateId);

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any;
    expect(task.title).toBe('Old Title');
    expect(task.priority).toBe('high');
  });

  it('test 3: does NOT update tasks from a different template', () => {
    const caseId = insertCase(db);
    const templateId = insertTemplate(db, 'file_setup', 'Old Title', 'high');
    const otherTemplateId = insertTemplate(db, 'file_setup', 'Other Template', 'medium');
    const otherTaskId = insertTask(db, caseId, otherTemplateId, 'file_setup', 'pending');

    db.prepare("UPDATE task_templates SET title = 'New Title', priority = 'low' WHERE id = ?").run(templateId);
    propagateTemplateUpdate(db, templateId);

    const otherTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(otherTaskId) as any;
    expect(otherTask.title).toBe('Old Title');
    expect(otherTask.priority).toBe('high');
  });

  it('test 4: non-existent templateId is a no-op (no error thrown)', () => {
    expect(() => propagateTemplateUpdate(db, 999999)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// propagateNewTemplate
// ---------------------------------------------------------------------------

describe('propagateNewTemplate', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it('test 5: inserts a pending task for each case currently in that phase', () => {
    const caseId1 = insertCase(db, 'file_setup', '2026-01-01');
    const caseId2 = insertCase(db, 'file_setup', '2026-01-05');
    const templateId = insertTemplate(db, 'file_setup', 'New Template Task', 'medium');

    propagateNewTemplate(db, templateId);

    const task1 = db.prepare('SELECT * FROM tasks WHERE case_id = ? AND template_id = ?').get(caseId1, templateId) as any;
    const task2 = db.prepare('SELECT * FROM tasks WHERE case_id = ? AND template_id = ?').get(caseId2, templateId) as any;
    expect(task1).toBeDefined();
    expect(task1.status).toBe('pending');
    expect(task2).toBeDefined();
    expect(task2.status).toBe('pending');
  });

  it('test 6: does NOT insert tasks for cases in a different phase', () => {
    const caseId = insertCase(db, 'treating', '2026-01-01');
    const templateId = insertTemplate(db, 'file_setup', 'File Setup Task', 'high');

    propagateNewTemplate(db, templateId);

    const task = db.prepare('SELECT * FROM tasks WHERE case_id = ? AND template_id = ?').get(caseId, templateId) as any;
    expect(task).toBeUndefined();
  });

  it('test 7: uses computeDueDate to set due_date (file_setup offset=5)', () => {
    const phaseEnteredAt = '2026-01-01';
    const caseId = insertCase(db, 'file_setup', phaseEnteredAt);
    const templateId = insertTemplate(db, 'file_setup', 'Due Date Task', 'high');

    propagateNewTemplate(db, templateId);

    const task = db.prepare('SELECT * FROM tasks WHERE case_id = ? AND template_id = ?').get(caseId, templateId) as any;
    expect(task).toBeDefined();
    // file_setup has auto_due_offset_days=5, so 2026-01-01 + 5 = 2026-01-06
    expect(task.due_date).toBe('2026-01-06');
  });
});

// ---------------------------------------------------------------------------
// propagateTemplateDelete
// ---------------------------------------------------------------------------

describe('propagateTemplateDelete', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it('test 8: removes pending tasks linked to that template', () => {
    const caseId = insertCase(db);
    const templateId = insertTemplate(db);
    const taskId = insertTask(db, caseId, templateId, 'file_setup', 'pending');

    propagateTemplateDelete(db, templateId);

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any;
    expect(task).toBeUndefined();
  });

  it('test 9: preserves completed tasks linked to that template', () => {
    const caseId = insertCase(db);
    const templateId = insertTemplate(db);
    const taskId = insertTask(db, caseId, templateId, 'file_setup', 'completed');

    propagateTemplateDelete(db, templateId);

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any;
    expect(task).toBeDefined();
    expect(task.status).toBe('completed');
  });

  it('test 10: does not affect tasks from other templates', () => {
    const caseId = insertCase(db);
    const templateId = insertTemplate(db);
    const otherTemplateId = insertTemplate(db, 'file_setup', 'Other Task', 'low');
    const otherTaskId = insertTask(db, caseId, otherTemplateId, 'file_setup', 'pending');

    propagateTemplateDelete(db, templateId);

    const otherTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(otherTaskId) as any;
    expect(otherTask).toBeDefined();
    expect(otherTask.status).toBe('pending');
  });
});
