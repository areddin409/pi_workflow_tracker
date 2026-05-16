# Session Handoff — PI Workflow Tracker

## Status
Design spec is approved. Implementation plan has NOT been written yet (two attempts failed due to output token limit). Environment is now set to 64000 tokens.

## Your First Action
Read the spec, then write the plan file using the Write tool — no prose narration. Keep all explanatory text to the user under 3 sentences.

**Spec location:** `docs/superpowers/specs/2026-05-13-pi-workflow-tracker-design.md`
**Plan destination:** `docs/superpowers/plans/2026-05-16-pi-workflow-tracker.md`

---

## Why Previous Sessions Failed
Claude was outputting the plan as **prose response text**, which counts against the 32k output token cap. The fix: use the `Write` tool to write the plan file directly. Tool outputs don't count the same way. Write the plan to the file silently — minimal user-facing text.

---

## Locked Decisions (do not re-brainstorm)
- **Stack:** React + Vite + TypeScript (client) · Express + TypeScript + better-sqlite3 (server) · SQLite
- **Monorepo:** `server/` + `client/` run together via `concurrently`
- **Local only** — no auth, no Filevine integration
- **Testing:** Vitest + Supertest (server) · Vitest + React Testing Library (client)
- **Server module system:** CommonJS (no `"type": "module"`) to avoid ESM/native-addon issues with better-sqlite3
- **Client:** Tailwind CSS for styling, React Router v6
- **Server port:** 3001 · **Client port:** 3000 (Vite proxies `/api` → `localhost:3001`)

---

## File Structure to Define in the Plan

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
│   │   └── test-helpers.ts         # createTestDb() — in-memory DB for tests
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
│   │   ├── phase.ts                # advancement, due-date calc
│   │   ├── contact-schedule.ts     # generation, completion linking, rate
│   │   ├── overdue.ts              # overdue + at-risk detection
│   │   ├── propagation.ts          # template propagation
│   │   └── __tests__/
│   │       ├── phase.test.ts
│   │       ├── contact-schedule.test.ts
│   │       ├── overdue.test.ts
│   │       └── propagation.test.ts
│   ├── types.ts
│   └── index.ts                    # buildApp(db) export pattern
├── client/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts              # proxy /api → localhost:3001
│   ├── tailwind.config.ts
│   ├── postcss.config.js
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx                 # React Router setup
│       ├── index.css
│       ├── types.ts
│       ├── lib/api.ts              # typed fetch wrapper
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

## Key Architecture Patterns for the Plan

### buildApp pattern (index.ts)
```typescript
export function buildApp(db: Database.Database) {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/api/cases', casesRouter(db));
  // ... mount all routers
  return app;
}
// Start server only when run directly:
if (require.main === module) {
  const db = openDatabase();
  buildApp(db).listen(3001);
}
```

### Router factory pattern (each route file)
```typescript
export function casesRouter(db: Database.Database): Router {
  const router = Router();
  router.get('/', (req, res) => { ... });
  return router;
}
```

### Test helper (db/test-helpers.ts)
```typescript
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

### Route integration test pattern
```typescript
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

## 20 Tasks for the Plan

1. **Project Scaffold** — root package.json (concurrently), .gitignore, server/package.json, server/tsconfig.json, server/vitest.config.ts, client/package.json, client/tsconfig.json, client/vite.config.ts, client/tailwind.config.ts, client/postcss.config.js, client/index.html — install deps in both
2. **Database Schema** — server/db/schema.sql (all 7 tables with FK + CASCADE), server/db/database.ts (singleton)
3. **Seed Data** — server/db/seed.ts: task_templates (all 16 tasks from spec) + phase_settings (5 phases with badge/offset/threshold values)
4. **Shared Types + Server Foundation** — server/types.ts (all interfaces), server/db/test-helpers.ts, server/index.ts (buildApp pattern)
5. **Phase Service (TDD)** — server/services/phase.ts: `nextPhase()`, `computeDueDate()`, `advanceCase()` (closes contact_schedule on → closed)
6. **Contact Schedule Service (TDD)** — server/services/contact-schedule.ts: `generateInitialIntro()`, `generateTreatingCheckin()`, `linkAnsweredContact()` (chains monthly_followup), `calculateContactRate()`
7. **Overdue + At-Risk Service (TDD)** — server/services/overdue.ts: `getOverdueTasks()`, `getDueTodayTasks()`, `getAtRiskCases()` (negative sentiment OR neutral+overdue schedule)
8. **Propagation Service (TDD)** — server/services/propagation.ts: `propagateTemplateUpdate()`, `propagateNewTemplate()`, `propagateTemplateDelete()` (preserves completed)
9. **Cases Routes** — GET /api/cases (+ daysInPhase), POST /api/cases (+ initial_intro schedule), GET /api/cases/:id, POST /api/cases/:id/advance (warns frontend via response if incomplete tasks), DELETE /api/cases/:id (closed only)
10. **Tasks Routes** — GET /api/tasks (query: overdue, due_today, phase, status, priority), POST /api/tasks (auxiliary), PUT /api/tasks/:id
11. **Templates Routes** — GET /api/templates (grouped by phase), POST /api/templates (+ propagateNewTemplate), PUT /api/templates/:id (+ propagateTemplateUpdate), DELETE /api/templates/:id (+ propagateTemplateDelete)
12. **Contacts Routes** — GET /api/contacts, POST /api/contacts (answered → linkAnsweredContact), POST /api/contacts/:id/action-items, PUT /api/contact-action-items/:id, GET /api/contact-schedule (query: overdue, due_today, due_this_week, due_this_month)
13. **Dashboard + Settings Routes** — GET /api/dashboard (5 stats + overdueTasksList + contactScheduleList + todaysFocus + atRiskClients), GET /api/settings, PUT /api/settings/:phase
14. **Client Foundation** — client/src/lib/api.ts (typed fetch wrapper for all endpoints), client/src/types.ts (mirror server types), client/src/App.tsx (React Router), client/src/components/Layout.tsx + Sidebar.tsx
15. **Dashboard Page** — StatCard, overdue task list, contact schedule list (Due Today/Week/Month toggle), Today's Focus, At-Risk Clients
16. **Caseload Page** — filterable table (phase/attorney/priority), daysInPhase column, Advance Phase button (incomplete warning modal), Close Case button (negotiations only), Delete button (closed only), + New Case modal
17. **Case Detail Page** — left: tasks list with status/due/overdue highlight + Add Task; right: contact summary (next scheduled, last attempt, sentiment, action items); tabs: Contact Log + Phase History
18. **Worklist Page** — flat task table, filter bar (priority/status/category/attorney/waiting_on), inline edit panel (status/waiting_on/last_action/next_follow_up/notes), action items shown as "Follow-up" category rows, + Add Task
19. **Templates Page** — accordion per phase, editable title/priority/sort_order per task, add/remove tasks, Save with propagation warning ("will update X pending tasks across Y cases")
20. **Settings Page** — editable table of phase_settings (badge_priority/auto_due_offset_days/overdue_threshold_days per phase), Save button

---

## Seed Data Reference (exact task titles from spec)

**file_setup (priority: high):**
1. Activate File Set Up Task Flow in Filevine
2. Make sure Team tab has proper followers/roles assigned
3. Request Crash Photos, Body Worn Camera Footage, 911 CAD Report & Audio
4. Please Check SOL
5. If Client has Medicaid, Put them on notice
6. Call Client — No text or Email, check on treatment

**treating (priority: medium):**
1. Activate Treating Taskflows in Filevine
2. Log into Case Status & Send Invitation to Client
3. Review Police Report, conduct conflict checks
4. Send Lien requests to all lien holders
5. Call Client, Check on treatment status
6. Request updated MRBs

**demand_drafting (priority: high):**
1. Activate Demand Taskflows in Filevine
2. Review Medical Records and Bills
3. Update billing amounts in Meds Tab
4. Send Lien Requests to all Lien Holders
5. Draft demand in EvenUp (Express Demand)
6. Send demand to adjuster

**demand_sent (priority: low):**
1. Alert attorney at 30 days post demand
2. Have we received an offer?

**negotiations (priority: low):**
1. Have we settled?
2. Ensure file is up to date in case we have to LIT

**phase_settings:**
| phase | case_badge_priority | auto_due_offset_days | overdue_threshold_days |
|---|---|---|---|
| file_setup | high | 5 | 0 |
| treating | medium | NULL | NULL |
| demand_drafting | high | 1 | 0 |
| demand_sent | low | 14 | 30 |
| negotiations | low | 30 | 0 |

---

## Prompt for New Session

```
Continue the PI Workflow Tracker project. Read docs/HANDOFF.md first — it has full context, locked decisions, file structure, architecture patterns, and the 20-task breakdown. Then write the implementation plan to docs/superpowers/plans/2026-05-16-pi-workflow-tracker.md using the Write tool directly (no prose narration). CLAUDE_CODE_MAX_OUTPUT_TOKENS is set to 64000. After the plan is written, invoke superpowers:subagent-driven-development.
```
