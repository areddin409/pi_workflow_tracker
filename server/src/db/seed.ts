import Database from 'better-sqlite3';

const TEMPLATES = [
  // file_setup (priority: high)
  { phase: 'file_setup', title: 'Activate File Set Up Task Flow in Filevine', priority: 'high', sort_order: 1 },
  { phase: 'file_setup', title: 'Make sure Team tab has proper followers/roles assigned', priority: 'high', sort_order: 2 },
  { phase: 'file_setup', title: 'Request Crash Photos, Body Worn Camera Footage, 911 CAD Report & Audio', priority: 'high', sort_order: 3 },
  { phase: 'file_setup', title: 'Please Check SOL', priority: 'high', sort_order: 4 },
  { phase: 'file_setup', title: 'If Client has Medicaid, Put them on notice', priority: 'high', sort_order: 5 },
  { phase: 'file_setup', title: 'Call Client — No text or Email, check on treatment', priority: 'high', sort_order: 6 },
  // treating (priority: medium)
  { phase: 'treating', title: 'Activate Treating Taskflows in Filevine', priority: 'medium', sort_order: 1 },
  { phase: 'treating', title: 'Log into Case Status & Send Invitation to Client', priority: 'medium', sort_order: 2 },
  { phase: 'treating', title: 'Review Police Report, conduct conflict checks', priority: 'medium', sort_order: 3 },
  { phase: 'treating', title: 'Send Lien requests to all lien holders', priority: 'medium', sort_order: 4 },
  { phase: 'treating', title: 'Call Client, Check on treatment status', priority: 'medium', sort_order: 5 },
  { phase: 'treating', title: 'Request updated MRBs', priority: 'medium', sort_order: 6 },
  // demand_drafting (priority: high)
  { phase: 'demand_drafting', title: 'Activate Demand Taskflows in Filevine', priority: 'high', sort_order: 1 },
  { phase: 'demand_drafting', title: 'Review Medical Records and Bills', priority: 'high', sort_order: 2 },
  { phase: 'demand_drafting', title: 'Update billing amounts in Meds Tab', priority: 'high', sort_order: 3 },
  { phase: 'demand_drafting', title: 'Send Lien Requests to all Lien Holders', priority: 'high', sort_order: 4 },
  { phase: 'demand_drafting', title: 'Draft demand in EvenUp (Express Demand)', priority: 'high', sort_order: 5 },
  { phase: 'demand_drafting', title: 'Send demand to adjuster', priority: 'high', sort_order: 6 },
  // demand_sent (priority: low)
  { phase: 'demand_sent', title: 'Alert attorney at 30 days post demand', priority: 'low', sort_order: 1 },
  { phase: 'demand_sent', title: 'Have we received an offer?', priority: 'low', sort_order: 2 },
  // negotiations (priority: low)
  { phase: 'negotiations', title: 'Have we settled?', priority: 'low', sort_order: 1 },
  { phase: 'negotiations', title: 'Ensure file is up to date in case we have to LIT', priority: 'low', sort_order: 2 },
];

const PHASE_SETTINGS = [
  { phase: 'file_setup',       case_badge_priority: 'high',   auto_due_offset_days: 5,    overdue_threshold_days: 0    },
  { phase: 'treating',         case_badge_priority: 'medium', auto_due_offset_days: null,  overdue_threshold_days: null },
  { phase: 'demand_drafting',  case_badge_priority: 'high',   auto_due_offset_days: 1,    overdue_threshold_days: 0    },
  { phase: 'demand_sent',      case_badge_priority: 'low',    auto_due_offset_days: 14,   overdue_threshold_days: 30   },
  { phase: 'negotiations',     case_badge_priority: 'low',    auto_due_offset_days: 30,   overdue_threshold_days: 0    },
];

export function seedDatabase(db: Database.Database): void {
  const templateCount = (db.prepare('SELECT COUNT(*) as c FROM task_templates').get() as { c: number }).c;
  if (templateCount === 0) {
    const insertTemplate = db.prepare(
      'INSERT INTO task_templates (phase, title, priority, sort_order) VALUES (@phase, @title, @priority, @sort_order)'
    );
    for (const t of TEMPLATES) insertTemplate.run(t);
  }

  const settingsCount = (db.prepare('SELECT COUNT(*) as c FROM phase_settings').get() as { c: number }).c;
  if (settingsCount === 0) {
    const insertSettings = db.prepare(
      'INSERT INTO phase_settings (phase, case_badge_priority, auto_due_offset_days, overdue_threshold_days) VALUES (@phase, @case_badge_priority, @auto_due_offset_days, @overdue_threshold_days)'
    );
    for (const s of PHASE_SETTINGS) insertSettings.run(s);
  }
}
