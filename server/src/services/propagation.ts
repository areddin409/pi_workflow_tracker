import Database from 'better-sqlite3';
import { computeDueDate } from './phase';

export function propagateTemplateUpdate(db: Database.Database, templateId: number): void {
  const template = db.prepare('SELECT * FROM task_templates WHERE id = ?').get(templateId) as any;
  if (!template) return;
  db.prepare(`
    UPDATE tasks SET title = ?, priority = ?
    WHERE template_id = ? AND status != 'completed'
  `).run(template.title, template.priority, templateId);
}

export function propagateNewTemplate(db: Database.Database, templateId: number): void {
  const template = db.prepare('SELECT * FROM task_templates WHERE id = ?').get(templateId) as any;
  if (!template) return;

  const activeCases = db.prepare(
    "SELECT c.*, cph.entered_at as phase_entered FROM cases c JOIN case_phase_history cph ON cph.case_id = c.id AND cph.exited_at IS NULL WHERE c.current_phase = ?"
  ).all(template.phase) as any[];

  const settings = db.prepare('SELECT * FROM phase_settings WHERE phase = ?').get(template.phase) as any;
  const today = new Date().toISOString().slice(0, 10);

  const insertTask = db.prepare(`
    INSERT INTO tasks (case_id, phase, template_id, title, priority, status, date_assigned, due_date)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
  `);

  for (const c of activeCases) {
    const dueDate = settings ? computeDueDate(template.phase, settings, c.phase_entered.slice(0, 10)) : null;
    insertTask.run(c.id, template.phase, templateId, template.title, template.priority, today, dueDate);
  }
}

export function propagateTemplateDelete(db: Database.Database, templateId: number): void {
  db.prepare("DELETE FROM tasks WHERE template_id = ? AND status != 'completed'").run(templateId);
}
