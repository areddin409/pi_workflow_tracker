# PI Workflow Tracker — Design Spec

**Date:** 2026-05-13
**Status:** Approved

## Overview

A local desktop web app built for a single PI (personal injury) case manager. Replaces a Google Sheets workflow tracker. The goal is proactive deadline management — surfacing overdue tasks, flagging at-risk clients, and tracking what every party owes before a case can advance. Complements Filevine (the firm's primary CRM) without replacing it.

---

## Stack

| Layer    | Technology                                        |
| -------- | ------------------------------------------------- |
| Frontend | React + Vite + TypeScript                         |
| Backend  | Express + TypeScript                              |
| Database | SQLite via `better-sqlite3`                       |
| Runtime  | Local only — `npm run dev`, open `localhost:3000` |

No authentication required (single user, local machine). No hosting. No Filevine integration — all data entered manually.

---

## Data Model

### `cases`

| Column        | Type       | Notes                                                                                      |
| ------------- | ---------- | ------------------------------------------------------------------------------------------ |
| id            | INTEGER PK |                                                                                            |
| client_name   | TEXT       |                                                                                            |
| attorney      | TEXT       |                                                                                            |
| current_phase | TEXT       | Enum: `file_setup`, `treating`, `demand_drafting`, `demand_sent`, `negotiations`, `closed` |
| date_assigned | DATE       | Case assigned date — used for File Set Up due date calculation                             |
| created_at    | DATETIME   |                                                                                            |

### `case_phase_history`

| Column     | Type       | Notes                 |
| ---------- | ---------- | --------------------- |
| id         | INTEGER PK |                       |
| case_id    | INTEGER FK | → cases               |
| phase      | TEXT       |                       |
| entered_at | DATETIME   |                       |
| exited_at  | DATETIME   | NULL if current phase |

Powers "days in phase" calculation — no spreadsheet formulas needed.

### `task_templates`

| Column     | Type       | Notes                      |
| ---------- | ---------- | -------------------------- |
| id         | INTEGER PK |                            |
| phase      | TEXT       |                            |
| title      | TEXT       |                            |
| priority   | TEXT       | `high`, `medium`, `low`    |
| sort_order | INTEGER    | Display order within phase |

**Seeded from existing spreadsheet at first run:**

| Phase           | Tasks                                                                                                                                                                                                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File Set Up     | Activate File Set Up Task Flow in Filevine; Make sure Team tab has proper followers/roles assigned; Request Crash Photos, Body Worn Camera Footage, 911 CAD Report & Audio; Please Check SOL; If Client has Medicaid, Put them on notice; Call Client — No text or Email, check on treatment |
| Treating        | Activate Treating Taskflows in Filevine; Log into Case Status & Send Invitation to Client; Review Police Report, conduct conflict checks; Send Lien requests to all lien holders; Call Client, Check on treatment status; Request updated MRBs                                               |
| Demand Drafting | Activate Demand Taskflows in Filevine; Review Medical Records and Bills; Update billing amounts in Meds Tab; Send Lien Requests to all Lien Holders; Draft demand in EvenUp (Express Demand); Send demand to adjuster                                                                        |
| Demand Sent     | Alert attorney at 30 days post demand; Have we received an offer?                                                                                                                                                                                                                            |
| Negotiations    | Have we settled?; Ensure file is up to date in case we have to LIT                                                                                                                                                                                                                           |

### `tasks`

| Column          | Type       | Notes                                                                  |
| --------------- | ---------- | ---------------------------------------------------------------------- |
| id              | INTEGER PK |                                                                        |
| case_id         | INTEGER FK | → cases                                                                |
| phase           | TEXT       | Phase this task belongs to                                             |
| template_id     | INTEGER FK | → task_templates; NULL for auxiliary tasks                             |
| category        | TEXT       | `records`, `demand`, `follow_up`, `treatment`, `medical`, etc.         |
| title           | TEXT       | Copied from template at creation; preserved if template changes later  |
| priority        | TEXT       | `high`, `medium`, `low` — defaults from template, manually overridable |
| status          | TEXT       | `pending`, `in_progress`, `waiting`, `completed`                       |
| waiting_on      | TEXT       | `client`, `adjuster`, `attorney`, `provider`, NULL                     |
| date_assigned   | DATE       |                                                                        |
| due_date        | DATE       | Auto-set by phase rules; manual for Treating and auxiliary tasks       |
| last_action     | TEXT       | Notes on last action taken                                             |
| next_follow_up  | DATE       |                                                                        |
| completion_date | DATE       |                                                                        |
| notes           | TEXT       |                                                                        |
| created_at      | DATETIME   |                                                                        |

**Auxiliary tasks** (template_id = NULL) are created manually from the Active Worklist with user-set priority and due date.

### `contacts`

| Column              | Type       | Notes                                                                 |
| ------------------- | ---------- | --------------------------------------------------------------------- |
| id                  | INTEGER PK |                                                                       |
| case_id             | INTEGER FK | → cases                                                               |
| contacted_at        | DATE       | Date of this contact event                                            |
| last_attempted      | DATE       | Most recent attempt (if not reached)                                  |
| next_contact_due    | DATE       | Follow-up date set from this interaction                              |
| contact_type        | TEXT       | `phone`, `email`, `text`, `letter`                                    |
| contact_status      | TEXT       | `answered`, `voicemail`, `no_answer`                                  |
| client_sentiment    | TEXT       | `positive`, `neutral`, `negative` — always recorded, all values shown |
| follow_up_necessary | BOOLEAN    |                                                                       |
| notes               | TEXT       | Full call notes                                                       |
| action_item         | TEXT       | Summary action item from this contact                                 |
| created_at          | DATETIME   |                                                                       |

### `contact_schedule`

Auto-generated contact obligations for every active case. A contact only counts as complete when a linked `contacts` record has `contact_status = 'answered'`. Voicemail and no-answer attempts do NOT satisfy the schedule — the obligation stays open and goes overdue.

| Column               | Type       | Notes                                                   |
| -------------------- | ---------- | ------------------------------------------------------- |
| id                   | INTEGER PK |                                                         |
| case_id              | INTEGER FK | → cases                                                 |
| schedule_type        | TEXT       | `initial_intro`, `treating_checkin`, `monthly_followup` |
| due_date             | DATE       |                                                         |
| completed_contact_id | INTEGER FK | → contacts; NULL until answered                         |
| completed_at         | DATE       | NULL until answered                                     |

**Generation rules:**

- Case created → insert `initial_intro` due = `case.date_assigned + 1 day`
- Case advances to Treating → insert `treating_checkin` due = `phase_entered + 5 days`
- When `treating_checkin` is completed (answered) → insert first `monthly_followup` due = `completed_at + 25 days`
- When any `monthly_followup` is completed (answered) → insert next `monthly_followup` due = `completed_at + 25 days`
- Monthly follow-up chain continues through all phases until case is `closed`

**Completion rule:** When a contact is logged with `contact_status = 'answered'`, the system finds the oldest open `contact_schedule` row for that case and links it (sets `completed_contact_id` and `completed_at`). Voicemail/no-answer logs the attempt in `contacts` but leaves the schedule row open.

### `contact_action_items`

| Column       | Type       | Notes                                                        |
| ------------ | ---------- | ------------------------------------------------------------ |
| id           | INTEGER PK |                                                              |
| contact_id   | INTEGER FK | → contacts                                                   |
| description  | TEXT       | What needs to be done                                        |
| assigned_to  | TEXT       | `case_manager`, `attorney`, `client`, `provider`, `adjuster` |
| due_date     | DATE       | Optional                                                     |
| completed    | BOOLEAN    | Default false                                                |
| completed_at | DATETIME   |                                                              |

Action items where `assigned_to = case_manager` and `due_date` is approaching surface in the Active Worklist and Today's Focus alongside regular tasks.

### `phase_settings`

| Column                 | Type    | Notes                                                 |
| ---------------------- | ------- | ----------------------------------------------------- |
| phase                  | TEXT PK |                                                       |
| case_badge_priority    | TEXT    | `high`, `medium`, `low` — displayed on case cards     |
| auto_due_offset_days   | INTEGER | NULL = manual (Treating)                              |
| overdue_threshold_days | INTEGER | Days after due_date before task is considered overdue |

**Default values:**

| Phase           | Case Badge | Auto Due Offset                  | Overdue Threshold |
| --------------- | ---------- | -------------------------------- | ----------------- |
| File Set Up     | High       | 5 days from `case.date_assigned` | 0 (same day)      |
| Treating        | Medium     | NULL (manual)                    | NULL              |
| Demand Drafting | High       | 1 day from phase entry           | 0                 |
| Demand Sent     | Low        | 14 days from phase entry         | 30 days           |
| Negotiations    | Low        | 30 days from phase entry         | 0                 |

---

## Business Logic

### Phase Advancement (`POST /cases/:id/advance`)

1. Set `case_phase_history.exited_at = NOW()` for the current phase record
2. Update `cases.current_phase` to the next phase
3. Insert a new `case_phase_history` row with `entered_at = NOW()`
4. Load all `task_templates` for the new phase
5. Insert one `tasks` row per template, computing `due_date` from phase settings
6. Case cannot advance past `closed`

### Task Auto-Due-Date Calculation

- **File Set Up:** `due_date = case.date_assigned + 5 days`
- **Treating:** `due_date = NULL` (user enters manually after review)
- **Demand Drafting:** `due_date = phase_entered + 1 day`
- **Demand Sent:** `due_date = phase_entered + 14 days`
- **Negotiations:** `due_date = phase_entered + 30 days`

### Overdue Detection

Two separate states, shown with different visual treatments:

- **Due warning** (yellow): `due_date IS NOT NULL AND due_date <= TODAY() AND status != 'completed'`
- **Overdue** (red): `phase_entered_at + phase_settings.overdue_threshold_days < TODAY() AND status != 'completed'`

For most phases these align (overdue_threshold = 0 means overdue = same day as due_date). Demand Sent is the exception: due_date fires at 14 days (yellow follow-up reminder) and overdue fires at 30 days (red alert), so there's a 16-day window where the task shows yellow but not red.

### Phase Advancement

When **Advance Phase** is clicked:

- If any tasks for the current phase are still pending/in-progress, show a warning: "X tasks are not complete. Advance anyway?" — she can confirm or cancel. Advancement is never blocked, only warned.
- On confirm, run the advancement logic.

### Case Closure
When **Close Case** is clicked from the Negotiations phase:
- Set `case_phase_history.exited_at = NOW()` for the Negotiations record
- Set `cases.current_phase = 'closed'`
- Cancel all open `contact_schedule` rows for the case (no further contacts generated)
- Case disappears from all active views; accessible via "Show Closed Cases" toggle on Caseload
- Closed cases can be permanently deleted via confirmation dialog; deletion cascades to all related rows

### Template Propagation (on template save)

When a template task **title or priority** is updated:

- Find all `tasks` where `template_id = updated_template.id AND status != 'completed'`
- Update `title` and `priority` on those tasks (both propagate)

When a new template task is added to a phase:

- Find all cases currently in that phase
- Insert a new pending task for each, using the phase's auto-due-date rule unless case phase is closed.

When a template task is deleted:

- Remove matching pending tasks from active cases
- Preserve completed tasks (history must remain intact)

### Contact Schedule Management

A `contact_schedule` row is **overdue** when: `due_date < TODAY() AND completed_contact_id IS NULL`

A `contact_schedule` row is **due today** when: `due_date = TODAY() AND completed_contact_id IS NULL`

**Contact rate metric** (shown on dashboard):
`(count of completed schedule rows for open cases) / (count of all schedule rows with due_date <= TODAY() for open cases) × 100`

Goal is 100%. A voicemail or no-answer attempt counts as an attempt but not toward the rate.

### At-Risk Client Detection

A client is at risk when:

- Most recent `contacts.client_sentiment = 'negative'`, OR
- Most recent `contacts.client_sentiment = 'neutral'` AND `next_contact_due < TODAY()`

---

## Views

### Navigation

- **Fixed sidebar** (left): Dashboard, Caseload, Worklist, Contacts, Templates, Settings
- **Top context bar**: Shows current case name + priority badge when inside Case Detail; shows view title otherwise

### 1. Dashboard

Layout (top to bottom):

1. **Stats row** (5 cards): Overdue Tasks · Due Today · Open Tasks · Total Cases · **Contact Rate %**
2. **Two columns**: Overdue Tasks list (left) · Contact Schedule list (right — overdue calls + due today + due this week, sorted by urgency; auto-updates daily)
3. **Today's Focus**: Unified list of all overdue + due-today tasks and contact schedule obligations, sorted by urgency. Includes case manager action items from `contact_action_items`.
4. **Contact Schedule list**: A single filterable list defaulting to **Due Today**. Toggle filter between Due Today / Due This Week / Due This Month — switching the filter replaces the list contents entirely. Shows client name, schedule type, and days overdue if past due.
5. **At Risk Clients**: Clients with negative sentiment, or neutral sentiment + overdue scheduled contact. Sentiment always shown for all clients — positive included — so she can see what's working.

### 2. Caseload

- Filterable table: phase, attorney, priority badge
- **Closed cases hidden by default** — "Show Closed Cases" toggle reveals them at the bottom, visually dimmed
- Columns: Client Name · Attorney · Phase · Days in Phase · Priority · Status
- Days in phase computed from `case_phase_history.entered_at`
- **Advance Phase** button per row (triggers phase advancement logic)
- In Negotiations phase, button becomes **Close Case** — sets `current_phase = 'closed'`, records exit in `case_phase_history`, stops contact schedule generation
- Closed cases show a **Delete** button — requires confirmation: "This will permanently delete all data for [Client Name]. This cannot be undone." Active cases have no delete option.
- **+ New Case** button opens a modal: client name, attorney, date assigned

### 3. Case Detail

Two-column layout:

**Left — Tasks**

- Current phase tasks listed with: checkbox, title, status badge, category, due date
- Overdue tasks highlighted in red
- Completed tasks shown with strikethrough
- **+ Add Task** button for auxiliary tasks (manual priority + due date)

**Right — Contact Summary**

- Next scheduled contact: due date, type (`initial_intro` / `treating_checkin` / `monthly_followup`), overdue badge if past due
- Most recent contact attempt: date, status (answered/voicemail/no-answer), sentiment (always shown for all values)
- Call notes preview
- Action items from most recent contact with assignee badges
- Link to full contact log

**Below (tabs):** Contact Log · Phase History

### 4. Active Worklist

- Flat table with filter bar: Priority · Status · Category · Attorney · Waiting On
- Columns: Priority · Client · Attorney · Task Category · Task · Status · Waiting On · Due Date · Days Open · Next Follow-Up
- Overdue rows highlighted
- **+ Add Task** button for auxiliary tasks
- Clicking a row opens inline edit for: status, waiting_on, last_action, next_follow_up, notes
- Case manager action items from `contact_action_items` appear as rows with a distinct **"Follow-up"** category badge and the originating client name, visually distinguishable from regular template/auxiliary tasks

### 5. Task Templates

- One section per phase (accordion or tabs)
- Editable task list per phase: title, priority, sort order
- Add / remove tasks per phase
- **Save** triggers template propagation to active cases
- Warning shown before save: "This will update X pending tasks across Y active cases"

### 6. Settings

- Per-phase threshold configuration (auto_due_offset_days, overdue_threshold_days, case_badge_priority)
- Editable table, save button

---

## API Endpoints

| Method | Path                             | Purpose                                                                                    |
| ------ | -------------------------------- | ------------------------------------------------------------------------------------------ |
| GET    | `/api/cases`                     | List all cases with current phase + days in phase                                          |
| POST   | `/api/cases`                     | Create new case + generate File Set Up tasks                                               |
| GET    | `/api/cases/:id`                 | Single case with tasks, most recent contact, phase history                                 |
| POST   | `/api/cases/:id/advance`         | Advance to next phase                                                                      |
| GET    | `/api/tasks`                     | All tasks; query params: `overdue`, `due_today`, `phase`, `status`, `priority`             |
| POST   | `/api/tasks`                     | Create auxiliary task                                                                      |
| PUT    | `/api/tasks/:id`                 | Update task fields                                                                         |
| GET    | `/api/templates`                 | All templates grouped by phase                                                             |
| PUT    | `/api/templates/:id`             | Update template + propagate                                                                |
| POST   | `/api/templates`                 | Add new template task                                                                      |
| DELETE | `/api/templates/:id`             | Remove template task + clean up pending tasks                                              |
| GET    | `/api/contacts`                  | All contacts; query params: `case_id`, `overdue`                                           |
| POST   | `/api/contacts`                  | Log new contact event; auto-links to open schedule row if answered                         |
| POST   | `/api/contacts/:id/action-items` | Add action item to a contact                                                               |
| PUT    | `/api/contact-action-items/:id`  | Mark action item complete                                                                  |
| GET    | `/api/contact-schedule`          | All schedule rows; query params: `overdue`, `due_today`, `due_this_week`, `due_this_month` |
| GET    | `/api/dashboard`                 | Aggregated dashboard stats                                                                 |
| GET    | `/api/settings`                  | Phase settings                                                                             |
| PUT    | `/api/settings/:phase`           | Update phase settings                                                                      |

---

## Project Structure

```
pi_workflow_tracker/
├── server/
│   ├── db/
│   │   ├── schema.sql
│   │   └── seed.ts          # seeds task templates from spreadsheet data
│   ├── routes/
│   │   ├── cases.ts
│   │   ├── tasks.ts
│   │   ├── templates.ts
│   │   ├── contacts.ts
│   │   └── dashboard.ts
│   ├── services/
│   │   ├── phase.ts         # advancement, due-date calculation
│   │   ├── propagation.ts   # template propagation logic
│   │   ├── contact-schedule.ts  # schedule generation, completion linking, rate calculation
│   │   └── overdue.ts       # overdue + at-risk detection
│   └── index.ts
├── client/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Caseload.tsx
│   │   │   ├── CaseDetail.tsx
│   │   │   ├── Worklist.tsx
│   │   │   ├── Templates.tsx
│   │   │   └── Settings.tsx
│   │   ├── hooks/
│   │   └── App.tsx
│   └── vite.config.ts
├── docs/
│   └── superpowers/specs/
│       └── 2026-05-13-pi-workflow-tracker-design.md
└── package.json
```

---

## Out of Scope

- Authentication / multi-user access
- Filevine integration
- Mobile / tablet views
- Email or SMS notifications
- Data export / backup tooling (SQLite file is the backup)
