import Database from 'better-sqlite3';
import type { Phase, PhaseSettings } from '../types';

const PHASE_ORDER: Phase[] = ['file_setup', 'treating', 'demand_drafting', 'demand_sent', 'negotiations', 'closed'];

export function nextPhase(current: Phase): Phase | null {
  const idx = PHASE_ORDER.indexOf(current);
  if (idx === -1 || idx >= PHASE_ORDER.length - 1) return null;
  return PHASE_ORDER[idx + 1];
}

export function computeDueDate(phase: Phase, settings: PhaseSettings, referenceDate: string): string | null {
  if (settings.auto_due_offset_days === null) return null;
  const d = new Date(referenceDate);
  d.setDate(d.getDate() + settings.auto_due_offset_days);
  return d.toISOString().slice(0, 10);
}

export function advanceCase(db: Database.Database, caseId: number): { newPhase: Phase; incompleteTasks: number } {
  const caseRow = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId) as any;
  if (!caseRow) throw new Error(`Case ${caseId} not found`);

  const next = nextPhase(caseRow.current_phase);
  if (!next) throw new Error('Case is already closed');

  const incompleteTasks = (db.prepare(
    "SELECT COUNT(*) as c FROM tasks WHERE case_id = ? AND status NOT IN ('completed') AND phase = ?"
  ).get(caseId, caseRow.current_phase) as { c: number }).c;

  const now = new Date().toISOString();

  db.prepare("UPDATE case_phase_history SET exited_at = ? WHERE case_id = ? AND exited_at IS NULL").run(now, caseId);
  db.prepare("UPDATE cases SET current_phase = ? WHERE id = ?").run(next, caseId);
  db.prepare("INSERT INTO case_phase_history (case_id, phase, entered_at) VALUES (?, ?, ?)").run(caseId, next, now);

  const settings = db.prepare('SELECT * FROM phase_settings WHERE phase = ?').get(next) as PhaseSettings;
  const templates = db.prepare('SELECT * FROM task_templates WHERE phase = ?').all(next) as any[];
  const phaseEnteredDate = now.slice(0, 10);

  const insertTask = db.prepare(`
    INSERT INTO tasks (case_id, phase, template_id, title, priority, status, date_assigned, due_date)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
  `);

  for (const t of templates) {
    const dueDate = computeDueDate(next, settings, phaseEnteredDate);
    insertTask.run(caseId, next, t.id, t.title, t.priority, phaseEnteredDate, dueDate);
  }

  if (next === 'closed') {
    db.prepare("UPDATE contact_schedule SET completed_at = ? WHERE case_id = ? AND completed_contact_id IS NULL")
      .run(phaseEnteredDate, caseId);
  }

  return { newPhase: next, incompleteTasks };
}
