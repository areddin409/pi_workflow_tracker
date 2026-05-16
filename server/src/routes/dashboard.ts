import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';
import { getOverdueTasks, getDueTodayTasks, getAtRiskCases } from '../services/overdue';
import { calculateContactRate } from '../services/contact-schedule';

export function dashboardRouter(db: Database.Database): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    const today = new Date().toISOString().slice(0, 10);

    const overdueTasksList = getOverdueTasks(db, today) as any[];
    const dueTodayTasksList = getDueTodayTasks(db, today) as any[];

    const overdueTasks = overdueTasksList.length;
    const dueToday = dueTodayTasksList.length;

    const openTasks = (db.prepare(
      "SELECT COUNT(*) as c FROM tasks t JOIN cases c ON t.case_id = c.id WHERE t.status != 'completed' AND c.current_phase != 'closed'"
    ).get() as { c: number }).c;

    const totalCases = (db.prepare(
      "SELECT COUNT(*) as c FROM cases WHERE current_phase != 'closed'"
    ).get() as { c: number }).c;

    const contactRate = calculateContactRate(db);

    const contactScheduleList = db.prepare(`
      SELECT cs.*, c.client_name
      FROM contact_schedule cs
      JOIN cases c ON cs.case_id = c.id
      WHERE cs.completed_contact_id IS NULL
        AND c.current_phase != 'closed'
        AND cs.due_date <= date(?, '+6 days')
      ORDER BY cs.due_date ASC
    `).all(today);

    const atRiskClients = getAtRiskCases(db, today);

    // Build todaysFocus
    const overdueIds = new Set(overdueTasksList.map((t: any) => t.id));
    const focusItems: any[] = [];

    for (const t of overdueTasksList) {
      focusItems.push({ type: 'task', id: t.id, label: t.title, client_name: t.client_name, urgency: 1 });
    }
    for (const t of dueTodayTasksList) {
      if (!overdueIds.has(t.id)) {
        focusItems.push({ type: 'task', id: t.id, label: t.title, client_name: t.client_name, urgency: 2 });
      }
    }

    const overdueSchedule = db.prepare(`
      SELECT cs.*, c.client_name
      FROM contact_schedule cs
      JOIN cases c ON cs.case_id = c.id
      WHERE cs.completed_contact_id IS NULL AND cs.due_date < ? AND c.current_phase != 'closed'
    `).all(today) as any[];

    const dueTodaySchedule = db.prepare(`
      SELECT cs.*, c.client_name
      FROM contact_schedule cs
      JOIN cases c ON cs.case_id = c.id
      WHERE cs.completed_contact_id IS NULL AND cs.due_date = ? AND c.current_phase != 'closed'
    `).all(today) as any[];

    for (const cs of overdueSchedule) {
      focusItems.push({ type: 'contact', id: cs.id, label: cs.schedule_type, client_name: cs.client_name, urgency: 1 });
    }
    for (const cs of dueTodaySchedule) {
      focusItems.push({ type: 'contact', id: cs.id, label: cs.schedule_type, client_name: cs.client_name, urgency: 2 });
    }

    const actionItems = db.prepare(`
      SELECT cai.*, con.case_id, c.client_name
      FROM contact_action_items cai
      JOIN contacts con ON cai.contact_id = con.id
      JOIN cases c ON con.case_id = c.id
      WHERE cai.assigned_to = 'case_manager'
        AND cai.completed = 0
        AND cai.due_date IS NOT NULL
        AND cai.due_date <= ?
    `).all(today) as any[];

    for (const item of actionItems) {
      focusItems.push({ type: 'action_item', id: item.id, label: item.description, client_name: item.client_name, urgency: 2 });
    }

    focusItems.sort((a, b) => a.urgency - b.urgency);

    res.json({
      overdueTasks,
      dueToday,
      openTasks,
      totalCases,
      contactRate,
      overdueTasksList,
      contactScheduleList,
      todaysFocus: focusItems,
      atRiskClients
    });
  });

  return router;
}
