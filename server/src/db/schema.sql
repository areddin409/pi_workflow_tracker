PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS cases (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  client_name   TEXT NOT NULL,
  attorney      TEXT NOT NULL,
  current_phase TEXT NOT NULL DEFAULT 'file_setup',
  date_assigned DATE NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS case_phase_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id     INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  phase       TEXT NOT NULL,
  entered_at  DATETIME NOT NULL DEFAULT (datetime('now')),
  exited_at   DATETIME
);

CREATE TABLE IF NOT EXISTS task_templates (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  phase       TEXT NOT NULL,
  title       TEXT NOT NULL,
  priority    TEXT NOT NULL DEFAULT 'medium',
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tasks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id         INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  phase           TEXT NOT NULL,
  template_id     INTEGER REFERENCES task_templates(id) ON DELETE SET NULL,
  category        TEXT,
  title           TEXT NOT NULL,
  priority        TEXT NOT NULL DEFAULT 'medium',
  status          TEXT NOT NULL DEFAULT 'pending',
  waiting_on      TEXT,
  date_assigned   DATE,
  due_date        DATE,
  last_action     TEXT,
  next_follow_up  DATE,
  completion_date DATE,
  notes           TEXT,
  created_at      DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contacts (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id             INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  contacted_at        DATE NOT NULL,
  last_attempted      DATE,
  next_contact_due    DATE,
  contact_type        TEXT NOT NULL,
  contact_status      TEXT NOT NULL,
  client_sentiment    TEXT NOT NULL,
  follow_up_necessary BOOLEAN NOT NULL DEFAULT 0,
  notes               TEXT,
  action_item         TEXT,
  created_at          DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contact_schedule (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id              INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  schedule_type        TEXT NOT NULL,
  due_date             DATE NOT NULL,
  completed_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  completed_at         DATE
);

CREATE TABLE IF NOT EXISTS contact_action_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id   INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  description  TEXT NOT NULL,
  assigned_to  TEXT NOT NULL,
  due_date     DATE,
  completed    BOOLEAN NOT NULL DEFAULT 0,
  completed_at DATETIME
);

CREATE TABLE IF NOT EXISTS phase_settings (
  phase                  TEXT PRIMARY KEY,
  case_badge_priority    TEXT NOT NULL DEFAULT 'medium',
  auto_due_offset_days   INTEGER,
  overdue_threshold_days INTEGER
);

-- Migration: communication hub columns (applied via runMigrations in database.ts)
-- ALTER TABLE contacts ADD COLUMN contact_attempt_type TEXT;
--   values: 'attempted' | 'not_attempted' | 'completed'
-- ALTER TABLE contacts ADD COLUMN follow_up_type TEXT;
--   values: 'none_needed' | 'cm_follow_up' | 'attorney_review' | 'attorney_contact' | 'urgent_escalation'
-- client_sentiment now also accepts 'at_risk' (enforced at app layer only)
