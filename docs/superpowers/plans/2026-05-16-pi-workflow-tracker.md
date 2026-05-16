# PI Workflow Tracker — Implementation Plan

**Date:** 2026-05-16
**Spec:** docs/superpowers/specs/2026-05-13-pi-workflow-tracker-design.md
**Status:** Ready to execute

---

## Stack (Locked)

- **Client:** React + Vite + TypeScript, Tailwind CSS, React Router v6, port 3000
- **Server:** Express + TypeScript + better-sqlite3, CommonJS (no `"type":"module"`), port 3001
- **Monorepo:** `server/` + `client/` run via `concurrently` from root
- **Testing:** Vitest + Supertest (server) · Vitest + React Testing Library (client)

---

## Architecture Patterns

### buildApp (server/index.ts)
```ts
export function buildApp(db: Database.Database) {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/api/cases', casesRouter(db));
  app.use('/api/tasks', tasksRouter(db));
  app.use('/api/templates', templatesRouter(db));
  app.use('/api/contacts', contactsRouter(db));
  app.use('/api/contact-schedule', contactScheduleRouter(db));
  app.use('/api/contact-action-items', contactActionItemsRouter(db));
  app.use('/api/dashboard', dashboardRouter(db));
  app.use('/api/settings', settingsRouter(db));
  return app;
}
if (require.main === module) {
  const db = openDatabase();
  buildApp(db).listen(3001, () => console.log('Server running on :3001'));
}
```

### Router factory (each route file)
```ts
export function casesRouter(db: Database.Database): Router {
  const router = Router();
  router.get('/', (req, res) => { ... });
  return router;
}
```

### Test helper (server/db/test-helpers.ts)
```ts
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import { seedDatabase } from './seed';

export function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(readFileSync(join(__dirname, 'schema.sql'), 'utf-8'));
  seedDatabase(db);
  return db;
}
```

### Route test pattern
```ts
import request from 'supertest';
import { buildApp } from '../../index';
import { createTestDb } from '../../db/test-helpers';

describe('Cases API', () => {
  let app: ReturnType<typeof buildApp>;
  beforeEach(() => { app = buildApp(createTestDb()); });
  it('GET /api/cases returns []', async () => {
    const res = await request(app).get('/api/cases').expect(200);
    expect(res.body).toEqual([]);
  });
});
```

---

## File Structure

```
pi_workflow_tracker/
├── package.json                    # root: concurrently dev script
├── .gitignore
├── server/
│   ├── package.json
│   ├── tsconfig.json               # CommonJS, Node moduleResolution
│   ├── vitest.config.ts
│   ├── db/
│   │   ├── schema.sql
│   │   ├── database.ts             # better-sqlite3 singleton
│   │   ├── seed.ts                 # task_templates + phase_settings
│   │   └── test-helpers.ts
│   ├── routes/
│   │   ├── cases.ts
│   │   ├── tasks.ts
│   │   ├── templates.ts
│   │   ├── contacts.ts
│   │   ├── dashboard.ts
│   │   └── __tests__/
│   │       ├── cases.test.ts
│   │       ├── tasks.test.ts
│   │       ├── templates.test.ts
│   │       ├── contacts.test.ts
│   │       └── dashboard.test.ts
│   ├── services/
│   │   ├── phase.ts
│   │   ├── contact-schedule.ts
│   │   ├── overdue.ts
│   │   ├── propagation.ts
│   │   └── __tests__/
│   │       ├── phase.test.ts
│   │       ├── contact-schedule.test.ts
│   │       ├── overdue.test.ts
│   │       └── propagation.test.ts
│   ├── types.ts
│   └── index.ts
├── client/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts              # proxy /api → localhost:3001
│   ├── tailwind.config.ts
│   ├── postcss.config.js
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── index.css
│       ├── types.ts
│       ├── lib/api.ts
│       ├── hooks/
│       │   ├── useDashboard.ts
│       │   ├── useCases.ts
│       │   ├── useTasks.ts
│       │   └── useContacts.ts
│       ├── components/
│       │   ├── Layout.tsx
│       │   ├── Sidebar.tsx
│       │   ├── StatCard.tsx
│       │   ├── NewCaseModal.tsx
│       │   ├── PhaseAdvanceModal.tsx
│       │   ├── LogContactModal.tsx
│       │   └── TaskEditPanel.tsx
│       └── pages/
│           ├── Dashboard.tsx
│           ├── Caseload.tsx
│           ├── CaseDetail.tsx
│           ├── Worklist.tsx
│           ├── Templates.tsx
│           └── Settings.tsx
```

---

## Tasks

### Task 1 — Project Scaffold

**Goal:** Working monorepo where `npm run dev` starts both server and client.

**Files to create:**

`package.json` (root):
```json
{
  "name": "pi-workflow-tracker",
  "private": true,
  "scripts": {
    "dev": "concurrently \"npm run dev --prefix server\" \"npm run dev --prefix client\"",
    "build": "npm run build --prefix server && npm run build --prefix client"
  },
  "devDependencies": {
    "concurrently": "^8.2.2"
  }
}
```

`.gitignore`:
```
node_modules/
dist/
*.db
.env
```

`server/package.json`:
```json
{
  "name": "pi-tracker-server",
  "version": "1.0.0",
  "main": "dist/index.js",
  "scripts": {
    "dev": "ts-node-dev --respawn --transpile-only src/index.ts",
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "better-sqlite3": "^9.4.3",
    "cors": "^2.8.5",
    "express": "^4.18.2"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.8",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/node": "^20.11.5",
    "@types/supertest": "^6.0.2",
    "supertest": "^6.3.4",
    "ts-node-dev": "^2.0.0",
    "typescript": "^5.3.3",
    "vitest": "^1.2.2"
  }
}
```

`server/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "moduleResolution": "node",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

`server/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { globals: true, environment: 'node' }
});
```

**Note:** All server source files live under `server/src/` (tsconfig rootDir). Adjust file structure paths accordingly — `server/src/index.ts`, `server/src/routes/cases.ts`, etc.

`client/package.json`:
```json
{
  "name": "pi-tracker-client",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.22.0"
  },
  "devDependencies": {
    "@testing-library/react": "^14.2.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.2.55",
    "@types/react-dom": "^18.2.19",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.17",
    "postcss": "^8.4.35",
    "tailwindcss": "^3.4.1",
    "typescript": "^5.3.3",
    "vite": "^5.0.12",
    "vitest": "^1.2.2"
  }
}
```

`client/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["src"]
}
```

`client/vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:3001'
    }
  }
});
```

`client/tailwind.config.ts`:
```ts
import type { Config } from 'tailwindcss';
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: []
} satisfies Config;
```

`client/postcss.config.js`:
```js
module.exports = {
  plugins: { tailwindcss: {}, autoprefixer: {} }
};
```

`client/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
  <head><meta charset="UTF-8" /><title>PI Workflow Tracker</title></head>
  <body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>
</html>
```

**Install commands:**
```bash
npm install                    # root (concurrently)
cd server && npm install
cd ../client && npm install
```

**Verification:** `npm run dev` from root starts both processes without errors.

---

### Task 2 — Database Schema

**Goal:** All 7 tables created with FK constraints and CASCADE deletes.

**File:** `server/src/db/schema.sql`

```sql
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
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id            INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  contacted_at       DATE NOT NULL,
  last_attempted     DATE,
  next_contact_due   DATE,
  contact_type       TEXT NOT NULL,
  contact_status     TEXT NOT NULL,
  client_sentiment   TEXT NOT NULL,
  follow_up_necessary BOOLEAN NOT NULL DEFAULT 0,
  notes              TEXT,
  action_item        TEXT,
  created_at         DATETIME NOT NULL DEFAULT (datetime('now'))
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
```

**File:** `server/src/db/database.ts`

```ts
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';

let _db: Database.Database | null = null;

export function openDatabase(path = join(__dirname, '../../pi_tracker.db')): Database.Database {
  if (_db) return _db;
  _db = new Database(path);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  _db.exec(schema);
  return _db;
}
```

**Verification:** Import `openDatabase` in a scratch script; confirm tables exist via `.tables`.

---

### Task 3 — Seed Data

**Goal:** `seedDatabase()` is idempotent; populates `task_templates` (16 tasks) and `phase_settings` (5 phases).

**File:** `server/src/db/seed.ts`

```ts
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
```

**Verification:** Call `seedDatabase(createTestDb())` in a test and assert 22 template rows and 5 phase_settings rows.

---

### Task 4 — Shared Types + Server Foundation

**Goal:** All TypeScript interfaces defined; `buildApp` wired up; test helper working.

**File:** `server/src/types.ts`

```ts
export type Phase = 'file_setup' | 'treating' | 'demand_drafting' | 'demand_sent' | 'negotiations' | 'closed';
export type Priority = 'high' | 'medium' | 'low';
export type TaskStatus = 'pending' | 'in_progress' | 'waiting' | 'completed';
export type WaitingOn = 'client' | 'adjuster' | 'attorney' | 'provider' | null;
export type ContactType = 'phone' | 'email' | 'text' | 'letter';
export type ContactStatus = 'answered' | 'voicemail' | 'no_answer';
export type Sentiment = 'positive' | 'neutral' | 'negative';
export type ScheduleType = 'initial_intro' | 'treating_checkin' | 'monthly_followup';
export type AssignedTo = 'case_manager' | 'attorney' | 'client' | 'provider' | 'adjuster';

export interface Case {
  id: number;
  client_name: string;
  attorney: string;
  current_phase: Phase;
  date_assigned: string;
  created_at: string;
  days_in_phase?: number;
}

export interface CasePhaseHistory {
  id: number;
  case_id: number;
  phase: Phase;
  entered_at: string;
  exited_at: string | null;
}

export interface TaskTemplate {
  id: number;
  phase: Phase;
  title: string;
  priority: Priority;
  sort_order: number;
}

export interface Task {
  id: number;
  case_id: number;
  phase: Phase;
  template_id: number | null;
  category: string | null;
  title: string;
  priority: Priority;
  status: TaskStatus;
  waiting_on: WaitingOn;
  date_assigned: string | null;
  due_date: string | null;
  last_action: string | null;
  next_follow_up: string | null;
  completion_date: string | null;
  notes: string | null;
  created_at: string;
}

export interface Contact {
  id: number;
  case_id: number;
  contacted_at: string;
  last_attempted: string | null;
  next_contact_due: string | null;
  contact_type: ContactType;
  contact_status: ContactStatus;
  client_sentiment: Sentiment;
  follow_up_necessary: boolean;
  notes: string | null;
  action_item: string | null;
  created_at: string;
}

export interface ContactSchedule {
  id: number;
  case_id: number;
  schedule_type: ScheduleType;
  due_date: string;
  completed_contact_id: number | null;
  completed_at: string | null;
}

export interface ContactActionItem {
  id: number;
  contact_id: number;
  description: string;
  assigned_to: AssignedTo;
  due_date: string | null;
  completed: boolean;
  completed_at: string | null;
}

export interface PhaseSettings {
  phase: Phase;
  case_badge_priority: Priority;
  auto_due_offset_days: number | null;
  overdue_threshold_days: number | null;
}

export interface DashboardStats {
  overdueTasks: number;
  dueToday: number;
  openTasks: number;
  totalCases: number;
  contactRate: number;
  overdueTasksList: (Task & { client_name: string })[];
  contactScheduleList: (ContactSchedule & { client_name: string })[];
  todaysFocus: Array<{ type: 'task' | 'contact' | 'action_item'; id: number; label: string; client_name: string; urgency: number }>;
  atRiskClients: Array<{ case_id: number; client_name: string; sentiment: Sentiment; next_contact_due: string | null }>;
}
```

**File:** `server/src/db/test-helpers.ts` — see Architecture Patterns above.

**File:** `server/src/index.ts` — see buildApp pattern above. Import all 8 routers (stubs initially).

**Verification:** `npm test` in server with a smoke test: `buildApp(createTestDb())` doesn't throw.

---

### Task 5 — Phase Service (TDD)

**Goal:** Phase advancement and due-date calculation fully tested.

**File:** `server/src/services/phase.ts`

```ts
import Database from 'better-sqlite3';
import type { Phase, PhaseSettings, Task } from '../types';

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
```

**File:** `server/src/services/__tests__/phase.test.ts`

Tests must cover:
- `nextPhase('file_setup')` → `'treating'`
- `nextPhase('closed')` → `null`
- `computeDueDate` with offset 5 → date_assigned + 5
- `computeDueDate` with offset null → null
- `advanceCase` updates `current_phase`, inserts `case_phase_history`, inserts tasks for new phase
- `advanceCase` returns `incompleteTasks` count
- `advanceCase` on closed case throws
- Advancing to `closed` cancels open contact_schedule rows

**Verification:** `npm test` passes all phase service tests.

---

### Task 6 — Contact Schedule Service (TDD)

**Goal:** Schedule generation and completion linking fully tested.

**File:** `server/src/services/contact-schedule.ts`

```ts
import Database from 'better-sqlite3';

export function generateInitialIntro(db: Database.Database, caseId: number, dateAssigned: string): void {
  const d = new Date(dateAssigned);
  d.setDate(d.getDate() + 1);
  db.prepare("INSERT INTO contact_schedule (case_id, schedule_type, due_date) VALUES (?, 'initial_intro', ?)")
    .run(caseId, d.toISOString().slice(0, 10));
}

export function generateTreatingCheckin(db: Database.Database, caseId: number, phaseEnteredDate: string): void {
  const d = new Date(phaseEnteredDate);
  d.setDate(d.getDate() + 5);
  db.prepare("INSERT INTO contact_schedule (case_id, schedule_type, due_date) VALUES (?, 'treating_checkin', ?)")
    .run(caseId, d.toISOString().slice(0, 10));
}

export function generateMonthlyFollowup(db: Database.Database, caseId: number, completedAt: string): void {
  const d = new Date(completedAt);
  d.setDate(d.getDate() + 25);
  db.prepare("INSERT INTO contact_schedule (case_id, schedule_type, due_date) VALUES (?, 'monthly_followup', ?)")
    .run(caseId, d.toISOString().slice(0, 10));
}

export function linkAnsweredContact(db: Database.Database, caseId: number, contactId: number, contactDate: string): void {
  const openSchedule = db.prepare(
    "SELECT * FROM contact_schedule WHERE case_id = ? AND completed_contact_id IS NULL ORDER BY due_date ASC LIMIT 1"
  ).get(caseId) as any;

  if (!openSchedule) return;

  db.prepare(
    "UPDATE contact_schedule SET completed_contact_id = ?, completed_at = ? WHERE id = ?"
  ).run(contactId, contactDate, openSchedule.id);

  generateMonthlyFollowup(db, caseId, contactDate);
}

export function calculateContactRate(db: Database.Database): number {
  const today = new Date().toISOString().slice(0, 10);
  const result = db.prepare(`
    SELECT
      COUNT(CASE WHEN completed_contact_id IS NOT NULL THEN 1 END) as completed,
      COUNT(*) as total
    FROM contact_schedule cs
    JOIN cases c ON cs.case_id = c.id
    WHERE c.current_phase != 'closed' AND cs.due_date <= ?
  `).get(today) as { completed: number; total: number };
  if (result.total === 0) return 100;
  return Math.round((result.completed / result.total) * 100);
}
```

**File:** `server/src/services/__tests__/contact-schedule.test.ts`

Tests must cover:
- `generateInitialIntro` inserts row with due = date_assigned + 1
- `generateTreatingCheckin` inserts row with due = phase_entered + 5
- `linkAnsweredContact` closes oldest open schedule row and generates next monthly_followup
- `linkAnsweredContact` with no open schedule row → no-op
- `calculateContactRate` returns 100 when no schedules due
- `calculateContactRate` returns correct percentage with mixed completed/open rows

**Verification:** `npm test` passes all contact-schedule tests.

---

### Task 7 — Overdue + At-Risk Service (TDD)

**Goal:** Overdue task detection and at-risk client identification fully tested.

**File:** `server/src/services/overdue.ts`

```ts
import Database from 'better-sqlite3';

export function getOverdueTasks(db: Database.Database, today = new Date().toISOString().slice(0, 10)) {
  return db.prepare(`
    SELECT t.*, c.client_name
    FROM tasks t
    JOIN cases c ON t.case_id = c.id
    JOIN phase_settings ps ON t.phase = ps.phase
    JOIN case_phase_history cph ON cph.case_id = t.case_id AND cph.phase = t.phase AND cph.exited_at IS NULL
    WHERE t.status NOT IN ('completed')
      AND c.current_phase != 'closed'
      AND ps.overdue_threshold_days IS NOT NULL
      AND date(cph.entered_at, '+' || ps.overdue_threshold_days || ' days') < ?
  `).all(today);
}

export function getDueTodayTasks(db: Database.Database, today = new Date().toISOString().slice(0, 10)) {
  return db.prepare(`
    SELECT t.*, c.client_name
    FROM tasks t
    JOIN cases c ON t.case_id = c.id
    WHERE t.status NOT IN ('completed')
      AND c.current_phase != 'closed'
      AND t.due_date = ?
  `).all(today);
}

export function getAtRiskCases(db: Database.Database, today = new Date().toISOString().slice(0, 10)) {
  return db.prepare(`
    SELECT c.id as case_id, c.client_name,
           latest_contact.client_sentiment as sentiment,
           latest_schedule.due_date as next_contact_due
    FROM cases c
    LEFT JOIN (
      SELECT case_id, client_sentiment
      FROM contacts
      WHERE id IN (SELECT MAX(id) FROM contacts GROUP BY case_id)
    ) latest_contact ON latest_contact.case_id = c.id
    LEFT JOIN (
      SELECT case_id, due_date
      FROM contact_schedule
      WHERE completed_contact_id IS NULL
      ORDER BY due_date ASC
    ) latest_schedule ON latest_schedule.case_id = c.id
    WHERE c.current_phase != 'closed'
      AND (
        latest_contact.client_sentiment = 'negative'
        OR (latest_contact.client_sentiment = 'neutral' AND latest_schedule.due_date < ?)
      )
    GROUP BY c.id
  `).all(today);
}
```

**File:** `server/src/services/__tests__/overdue.test.ts`

Tests must cover:
- `getOverdueTasks` returns tasks past overdue threshold
- `getOverdueTasks` excludes completed tasks and closed cases
- `getOverdueTasks` excludes tasks where threshold is NULL (treating)
- `getDueTodayTasks` returns tasks due exactly today
- `getAtRiskCases` returns clients with negative sentiment
- `getAtRiskCases` returns clients with neutral sentiment + overdue schedule
- `getAtRiskCases` excludes positive sentiment clients

**Verification:** `npm test` passes all overdue service tests.

---

### Task 8 — Propagation Service (TDD)

**Goal:** Template updates propagate to pending tasks; completed tasks preserved.

**File:** `server/src/services/propagation.ts`

```ts
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
```

**File:** `server/src/services/__tests__/propagation.test.ts`

Tests must cover:
- `propagateTemplateUpdate` updates title + priority on pending tasks
- `propagateTemplateUpdate` does NOT update completed tasks
- `propagateNewTemplate` inserts pending task for each active case in that phase
- `propagateNewTemplate` does NOT insert tasks for cases in other phases
- `propagateTemplateDelete` removes pending tasks
- `propagateTemplateDelete` preserves completed tasks

**Verification:** `npm test` passes all propagation tests.

---

### Task 9 — Cases Routes

**File:** `server/src/routes/cases.ts`

Endpoints:

**GET /api/cases**
- Join `case_phase_history` to compute `days_in_phase` (days since `entered_at` where `exited_at IS NULL`)
- Join `phase_settings` for `case_badge_priority`
- Accepts query param `?include_closed=true` to include closed cases

**POST /api/cases**
- Body: `{ client_name, attorney, date_assigned }`
- Insert case with `current_phase = 'file_setup'`
- Insert `case_phase_history` row for `file_setup`
- Load `file_setup` templates, insert tasks with due = `date_assigned + 5`
- Call `generateInitialIntro(db, caseId, date_assigned)`
- Return created case

**GET /api/cases/:id**
- Case row + tasks array (current phase) + most recent contact + phase history array
- Include open contact_schedule rows

**POST /api/cases/:id/advance**
- Call `advanceCase(db, caseId)`
- If advancing to `treating`, call `generateTreatingCheckin`
- Return `{ newPhase, incompleteTasks }` — front end shows warning if `incompleteTasks > 0`

**DELETE /api/cases/:id**
- Only allowed if `current_phase = 'closed'`
- CASCADE handles related rows
- Return 409 if case not closed

**File:** `server/src/routes/__tests__/cases.test.ts`

Tests must cover:
- GET /api/cases returns empty array
- POST /api/cases creates case, phase_history row, file_setup tasks, initial_intro schedule
- GET /api/cases/:id returns case with tasks
- POST /api/cases/:id/advance advances phase, returns incompleteTasks
- POST /api/cases/:id/advance to treating generates treating_checkin schedule
- DELETE /api/cases/:id on closed case succeeds
- DELETE /api/cases/:id on active case returns 409

**Verification:** All route tests pass.

---

### Task 10 — Tasks Routes

**File:** `server/src/routes/tasks.ts`

Endpoints:

**GET /api/tasks**
- Query params: `overdue` (boolean), `due_today` (boolean), `phase`, `status`, `priority`, `case_id`, `attorney`
- Joins cases for `client_name` and `attorney`
- `overdue=true` uses same logic as `getOverdueTasks` service

**POST /api/tasks**
- Body: `{ case_id, title, category, priority, due_date, notes }`
- Creates auxiliary task (`template_id = NULL`)
- Validates case exists

**PUT /api/tasks/:id**
- Body: partial Task fields (`status`, `waiting_on`, `last_action`, `next_follow_up`, `notes`, `priority`, `due_date`, `completion_date`)
- If `status = 'completed'`, auto-set `completion_date = today` if not provided

**File:** `server/src/routes/__tests__/tasks.test.ts`

Tests must cover:
- GET /api/tasks returns all tasks with client_name
- GET /api/tasks?status=pending filters correctly
- GET /api/tasks?due_today=true filters correctly
- POST /api/tasks creates auxiliary task
- PUT /api/tasks/:id updates fields
- PUT /api/tasks/:id status=completed auto-sets completion_date

**Verification:** All route tests pass.

---

### Task 11 — Templates Routes

**File:** `server/src/routes/templates.ts`

Endpoints:

**GET /api/templates**
- Returns all templates grouped by phase: `{ file_setup: [...], treating: [...], ... }`

**POST /api/templates**
- Body: `{ phase, title, priority, sort_order }`
- Insert template, call `propagateNewTemplate(db, newId)`
- Return `{ template, affectedCases: number }`

**PUT /api/templates/:id**
- Body: `{ title?, priority?, sort_order? }`
- Update template, call `propagateTemplateUpdate(db, id)`
- Return `{ template, affectedTasks: number }`

**DELETE /api/templates/:id**
- Call `propagateTemplateDelete(db, id)`, then delete template
- Return `{ deletedPendingTasks: number }`

**File:** `server/src/routes/__tests__/templates.test.ts`

Tests must cover:
- GET /api/templates returns grouped structure with all 5 phases
- POST /api/templates inserts and propagates to active cases
- PUT /api/templates/:id updates and propagates to pending tasks
- DELETE /api/templates/:id removes pending tasks, preserves completed

**Verification:** All route tests pass.

---

### Task 12 — Contacts Routes

**File:** `server/src/routes/contacts.ts`

Endpoints:

**GET /api/contacts**
- Query params: `case_id`, `overdue` (boolean — schedule rows past due with no answer)
- Joins contact_action_items

**POST /api/contacts**
- Body: `{ case_id, contacted_at, contact_type, contact_status, client_sentiment, follow_up_necessary, notes, action_item, last_attempted, next_contact_due }`
- Insert contact
- If `contact_status = 'answered'`, call `linkAnsweredContact(db, caseId, newContactId, contacted_at)`
- Return created contact

**POST /api/contacts/:id/action-items**
- Body: `{ description, assigned_to, due_date }`
- Insert `contact_action_items` row

**PUT /api/contact-action-items/:id**
- Body: `{ completed }` (boolean)
- If `completed = true`, set `completed_at = NOW()`

**GET /api/contact-schedule**
- Query params: `overdue`, `due_today`, `due_this_week`, `due_this_month`
- Joins cases for `client_name`
- Excludes schedule rows for closed cases

**File:** `server/src/routes/__tests__/contacts.test.ts`

Tests must cover:
- POST /api/contacts with answered status links schedule and generates monthly_followup
- POST /api/contacts with voicemail leaves schedule open
- POST /api/contacts/:id/action-items inserts action item
- PUT /api/contact-action-items/:id marks complete with timestamp
- GET /api/contact-schedule?due_today returns correct rows

**Verification:** All route tests pass.

---

### Task 13 — Dashboard + Settings Routes

**File:** `server/src/routes/dashboard.ts`

**GET /api/dashboard**

Returns `DashboardStats`:
```ts
{
  overdueTasks: number,        // count from getOverdueTasks()
  dueToday: number,            // count from getDueTodayTasks()
  openTasks: number,           // non-completed tasks across all open cases
  totalCases: number,          // cases where current_phase != 'closed'
  contactRate: number,         // from calculateContactRate()
  overdueTasksList: Task[],    // from getOverdueTasks() with client_name
  contactScheduleList: ContactSchedule[], // overdue + due_today + due_this_week, sorted by urgency
  todaysFocus: FocusItem[],    // overdue tasks + due-today tasks + overdue schedule + due action items
  atRiskClients: AtRiskClient[] // from getAtRiskCases()
}
```

`todaysFocus` assembly:
- Overdue tasks → urgency 1
- Due today tasks → urgency 2
- Overdue contact schedules → urgency 1
- Contact action items where `assigned_to = 'case_manager'` and `due_date <= today` → urgency 2
- Sort ascending by urgency

**File:** `server/src/routes/dashboard.ts` — also mount `/api/settings` here or in a separate file.

**GET /api/settings** → returns all `phase_settings` rows

**PUT /api/settings/:phase** → updates `phase_settings` for that phase

**File:** `server/src/routes/__tests__/dashboard.test.ts`

Tests must cover:
- GET /api/dashboard returns all 5 stat fields
- GET /api/dashboard contactRate = 100 with no schedules
- GET /api/settings returns 5 rows
- PUT /api/settings/:phase updates a field

**Verification:** All route tests pass.

---

### Task 14 — Client Foundation

**Goal:** Typed API wrapper, shared types, React Router, Layout + Sidebar.

**File:** `client/src/types.ts` — Mirror all server types (copy and adjust as needed for frontend use).

**File:** `client/src/lib/api.ts`

```ts
const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  cases: {
    list: (params?: { include_closed?: boolean }) =>
      request<Case[]>(`/cases${params?.include_closed ? '?include_closed=true' : ''}`),
    get: (id: number) => request<CaseDetail>(`/cases/${id}`),
    create: (body: { client_name: string; attorney: string; date_assigned: string }) =>
      request<Case>('/cases', { method: 'POST', body: JSON.stringify(body) }),
    advance: (id: number) => request<{ newPhase: string; incompleteTasks: number }>(`/cases/${id}/advance`, { method: 'POST' }),
    delete: (id: number) => request<void>(`/cases/${id}`, { method: 'DELETE' }),
  },
  tasks: {
    list: (params?: Record<string, string | boolean>) =>
      request<Task[]>(`/tasks?${new URLSearchParams(params as any).toString()}`),
    create: (body: Partial<Task>) => request<Task>('/tasks', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: number, body: Partial<Task>) => request<Task>(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  },
  templates: {
    list: () => request<Record<string, TaskTemplate[]>>('/templates'),
    create: (body: Partial<TaskTemplate>) => request<{ template: TaskTemplate; affectedCases: number }>('/templates', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: number, body: Partial<TaskTemplate>) => request<{ template: TaskTemplate; affectedTasks: number }>(`/templates/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id: number) => request<{ deletedPendingTasks: number }>(`/templates/${id}`, { method: 'DELETE' }),
  },
  contacts: {
    list: (params?: Record<string, string | boolean>) =>
      request<Contact[]>(`/contacts?${new URLSearchParams(params as any).toString()}`),
    create: (body: Partial<Contact>) => request<Contact>('/contacts', { method: 'POST', body: JSON.stringify(body) }),
    addActionItem: (contactId: number, body: Partial<ContactActionItem>) =>
      request<ContactActionItem>(`/contacts/${contactId}/action-items`, { method: 'POST', body: JSON.stringify(body) }),
  },
  contactActionItems: {
    update: (id: number, body: { completed: boolean }) =>
      request<ContactActionItem>(`/contact-action-items/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  },
  contactSchedule: {
    list: (params?: Record<string, boolean>) =>
      request<ContactSchedule[]>(`/contact-schedule?${new URLSearchParams(params as any).toString()}`),
  },
  dashboard: {
    get: () => request<DashboardStats>('/dashboard'),
  },
  settings: {
    list: () => request<PhaseSettings[]>('/settings'),
    update: (phase: string, body: Partial<PhaseSettings>) =>
      request<PhaseSettings>(`/settings/${phase}`, { method: 'PUT', body: JSON.stringify(body) }),
  },
};
```

**File:** `client/src/App.tsx`

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Caseload from './pages/Caseload';
import CaseDetail from './pages/CaseDetail';
import Worklist from './pages/Worklist';
import Templates from './pages/Templates';
import Settings from './pages/Settings';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/caseload" element={<Caseload />} />
          <Route path="/cases/:id" element={<CaseDetail />} />
          <Route path="/worklist" element={<Worklist />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
```

**File:** `client/src/components/Layout.tsx` — Sidebar + `<Outlet />` content area.

**File:** `client/src/components/Sidebar.tsx` — Nav links: Dashboard, Caseload, Worklist, Templates, Settings.

**File:** `client/src/main.tsx`:
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
```

**File:** `client/src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

Each page stub returns `<div>PageName</div>` initially.

**Verification:** `npm run dev` shows sidebar + page stubs with no console errors.

---

### Task 15 — Dashboard Page

**File:** `client/src/hooks/useDashboard.ts`

```ts
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { DashboardStats } from '../types';

export function useDashboard() {
  const [data, setData] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.dashboard.get().then(setData).finally(() => setLoading(false));
  }, []);
  return { data, loading, refetch: () => api.dashboard.get().then(setData) };
}
```

**File:** `client/src/components/StatCard.tsx` — Props: `label`, `value`, `highlight?: 'red' | 'yellow'`.

**File:** `client/src/pages/Dashboard.tsx`

Layout:
1. **Stats row**: 5 `<StatCard>` components (Overdue Tasks red, Due Today yellow, Open Tasks, Total Cases, Contact Rate %)
2. **Two-column row**: Left = overdue tasks list (client name, task title, days overdue). Right = Contact Schedule list with Due Today / Due This Week / Due This Month filter tabs.
3. **Today's Focus**: Unified sorted list. Each item shows: client name, label (task title or schedule type), urgency badge.
4. **At Risk Clients**: Table with client name, sentiment badge (all sentiments shown, negative highlighted red), next contact due.

**Verification:** Dashboard renders with real data from server; filter tabs switch contact schedule list.

---

### Task 16 — Caseload Page

**File:** `client/src/hooks/useCases.ts` — Wraps `api.cases.list()` and `api.cases.advance()` and `api.cases.delete()`.

**File:** `client/src/components/NewCaseModal.tsx` — Form fields: client name, attorney, date assigned. Calls `api.cases.create()`.

**File:** `client/src/components/PhaseAdvanceModal.tsx` — Shows warning if `incompleteTasks > 0`: "X tasks are not complete. Advance anyway?" Confirm/Cancel buttons.

**File:** `client/src/pages/Caseload.tsx`

Features:
- Filterable table: phase dropdown, attorney dropdown, priority badge dropdown
- Columns: Client Name · Attorney · Phase · Days in Phase · Priority Badge · Actions
- "Show Closed Cases" toggle — closed cases appended at bottom, dimmed (`opacity-50`)
- Per-row: **Advance Phase** button (Negotiations phase → **Close Case** button), **Delete** (closed only)
- Advance Phase → call `api.cases.advance()` → if `incompleteTasks > 0`, show `PhaseAdvanceModal`
- Delete → confirmation dialog before `api.cases.delete()`
- **+ New Case** button → `NewCaseModal`

**Verification:** Create a case; verify it appears with correct phase and tasks; advance phase; verify new phase tasks created.

---

### Task 17 — Case Detail Page

**File:** `client/src/pages/CaseDetail.tsx`

Two-column layout:

**Left — Tasks**
- Current phase tasks with checkbox (updates status on click), title, status badge, category, due date
- Overdue tasks: red background row
- Completed: strikethrough
- **+ Add Task** → inline form: title, category, priority, due date → `api.tasks.create()`

**Right — Contact Summary**
- Next scheduled contact: schedule_type label, due date, overdue badge if past due
- Most recent contact: date, status, sentiment (always shown, color-coded)
- Call notes preview (first 200 chars)
- Action items from most recent contact with assignee badges
- "View Full Contact Log" link → scrolls to Contact Log tab

**Tabs below:**
- **Contact Log**: List of all contacts, expandable rows showing notes + action items. Log Contact button → `LogContactModal`
- **Phase History**: Table of `case_phase_history` rows with entered/exited dates

**File:** `client/src/components/LogContactModal.tsx`
- Fields: contacted_at, contact_type, contact_status, client_sentiment, follow_up_necessary, notes, action_item
- On submit: `api.contacts.create()`

**Verification:** Navigate to case detail; verify tasks and contact summary render; log a contact; verify schedule updates.

---

### Task 18 — Worklist Page

**File:** `client/src/hooks/useTasks.ts` — Wraps `api.tasks.list()` and `api.tasks.update()`.

**File:** `client/src/components/TaskEditPanel.tsx` — Slide-in panel (right side). Fields: status, waiting_on, last_action, next_follow_up, notes. Auto-save on blur or explicit Save button.

**File:** `client/src/pages/Worklist.tsx`

Features:
- Filter bar: Priority · Status · Category · Attorney · Waiting On
- Table columns: Priority · Client · Attorney · Task Category · Task · Status · Waiting On · Due Date · Days Open · Next Follow-Up
- Overdue rows: red highlight
- Contact action items appear as rows with category = **"Follow-up"** badge
- Clicking a row → opens `TaskEditPanel` inline on right
- **+ Add Task** button → inline form for auxiliary task

**Verification:** Filter by status; select a row; edit fields in panel; verify changes persisted on refresh.

---

### Task 19 — Templates Page

**File:** `client/src/pages/Templates.tsx`

Features:
- Accordion per phase (file_setup, treating, demand_drafting, demand_sent, negotiations)
- Each section: sortable task list with editable title, priority select, sort_order number
- **Add Task** per phase → appends new row in edit mode
- **Remove** button per task (only pending-safe — shown always, warning on confirm)
- **Save** button per phase:
  1. Count `affectedTasks` across all updates → show warning: "This will update X pending tasks across Y active cases"
  2. On confirm: call `api.templates.update()` for each changed task, `api.templates.create()` for new, `api.templates.delete()` for removed
- Changes tracked in local state until Save

**Verification:** Edit a template title; save; verify propagation warning shown; verify task title updated on Worklist.

---

### Task 20 — Settings Page

**File:** `client/src/pages/Settings.tsx`

Features:
- Editable table with 5 rows (one per phase)
- Columns: Phase · Case Badge Priority · Auto Due Offset (days) · Overdue Threshold (days)
- All cells editable (select for priority, number inputs for offsets; empty = NULL)
- **Save** button: calls `api.settings.update()` for each changed row
- Loading state while fetching; success/error toast on save

**Verification:** Change overdue threshold; save; verify GET /api/settings reflects change.

---

## Execution Notes

- Tasks 1–4 are sequential dependencies (scaffold → schema → seed → types/foundation).
- Tasks 5–8 (services) are parallel — each service is independent.
- Tasks 9–13 (routes) depend on services but can be parallelized by route file.
- Tasks 14–20 (client) depend on Task 14 (foundation) but pages can be parallelized.
- Run `npm test` in `server/` after each service task and each route task.
- No task is complete until its tests pass.
