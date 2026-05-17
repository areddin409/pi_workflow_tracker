# Communication Hub — Design Spec
**Date:** 2026-05-17  
**Status:** Approved

---

## Overview

Add a Communication Hub to the PI Workflow Tracker: a dedicated sidebar page for tracking client contact activity across all cases, with dashboard integration showing contact rates and overdue contacts, and sentiment surfaced on the Caseload page.

---

## Section 1 — Database Changes

### Extend `contacts` table

Three schema changes via `ALTER TABLE`. No existing columns modified. No existing data migrated.

```sql
ALTER TABLE contacts ADD COLUMN contact_attempt_type TEXT;
-- values: 'attempted' | 'not_attempted' | 'completed'

ALTER TABLE contacts ADD COLUMN follow_up_type TEXT;
-- values: 'none_needed' | 'cm_follow_up' | 'attorney_review'
--         'attorney_contact' | 'urgent_escalation'
```

The existing `contact_type` column (phone/email/text/letter) is `NOT NULL`. The Hub does not collect contact medium, so the Hub log route passes `contact_type = 'phone'` as a silent default. SQLite does not support `ALTER COLUMN`, so the column stays `NOT NULL` — no migration needed.

The `client_sentiment` column already accepts freeform TEXT. The value `'at_risk'` is added as a valid option enforced by the application layer only — no schema change required.

### Null behavior

| Logged from | `contact_attempt_type` | `follow_up_type` | `client_sentiment` |
|---|---|---|---|
| Case Detail modal (existing) | NULL | NULL | positive/neutral/negative |
| Communication Hub (new) | always filled | always filled | positive/neutral/negative/at_risk |

### Unchanged

- `contact_schedule` table — untouched
- `contact_action_items` table — untouched
- All existing overdue/schedule services — untouched

---

## Section 2 — API Routes

All new routes are additions. No existing routes modified except `GET /api/dashboard` (extended response only).

### New: `GET /api/communication`

Returns all non-closed cases with their latest contact summary. Each row:

```ts
{
  case_id: number
  client_name: string
  attorney: string
  current_phase: Phase
  initial_contact_date: string | null    // earliest contacted_at for this case
  last_contact_date: string | null       // most recent contacted_at
  last_attempted: string | null
  next_contact_due: string | null        // from contact_schedule
  contact_attempt_type: string | null
  contact_status: ContactStatus | null
  client_sentiment: string | null        // includes 'at_risk'
  follow_up_type: string | null
  action_item: string | null
  is_overdue: boolean                    // computed server-side
}
```

### New: `POST /api/communication/:caseId/log`

Saves a new contact entry to the `contacts` table with all Hub fields populated.

Request body:
```ts
{
  contacted_at: string          // manual date input
  last_attempted: string | null // manual date input
  contact_attempt_type: 'attempted' | 'not_attempted' | 'completed'
  contact_status: 'answered' | 'voicemail' | 'no_answer'
  client_sentiment: 'positive' | 'neutral' | 'negative' | 'at_risk'
  follow_up_type: 'none_needed' | 'cm_follow_up' | 'attorney_review' | 'attorney_contact' | 'urgent_escalation'
  action_item: string | null
}
```

On `contact_status === 'answered'`, calls the existing `linkAnsweredContact()` so the contact schedule chain continues working automatically (monthly follow-up generated, open schedule closed).

### Extended: `GET /api/dashboard`

Existing fields preserved. Three new fields added to response:

- `contactsNeedingContact` — array of `{ case_id, client_name, next_contact_due, days_overdue }` for cases that are overdue or have never been contacted
- `openTasksByPhase` — `Record<Phase, { count: number, tasks: { client_name, title }[] }>` for the Open Tasks card drill-down
- `casesByPhase` — `Record<Phase, { count: number, cases: { case_id, client_name, attorney }[] }>` for the Total Cases card drill-down

### Overdue logic — `getOverdueContacts()`

New server-side function. A case is overdue for contact if:

| Phase | Rule |
|---|---|
| `file_setup` | No `answered` contact within 24 hours of `date_assigned` |
| `treating` | No contact within 5 days of entering treating phase, OR `next_contact_due` is past with no subsequent `answered` contact |
| All other phases | `next_contact_due` is past with no subsequent `answered` contact |

### Contact rate bug fix

`calculateContactRate()` currently returns `100` when `total === 0`. Fixed to return `0` when no non-closed cases have open schedules.

---

## Section 3 — Communication Hub Page

### Route & navigation

`/communication` — new `NavLink` in `Sidebar.tsx` between Worklist and Templates.

### Layout

Two-panel split. Left panel fixed at ~340px, right panel takes remaining width.

### Left panel — case list

**Filter bar (top):**
- `All Cases` button — default, shows all non-closed cases
- `Contacts Due` button — filters to `is_overdue === true` cases, displays red count badge (`● N`)

**Each case row shows:**
- Client name (bold)
- Attorney · Last contact date
- Next contact due date (red + overdue label if `is_overdue`)
- Sentiment badge

**Row states:**
- Default — white background
- Overdue — `#fff5f5` background, red left border (`3px solid #ef4444`)
- Never contacted — same red treatment as overdue
- Selected — `#eff6ff` background, blue left border (`3px solid #2563eb`)

Clicking a row selects it and opens the right panel for that case.

### Right panel — detail + log form

**Header:** Client name, attorney, phase, overdue badge if applicable.

**Three summary tiles:**
| Tile | Value | Style when overdue |
|---|---|---|
| Initial Contact | Earliest `contacted_at` for case (manual entry populates this) | — |
| Last Contact | Most recent `contacted_at` | — |
| Next Contact Due | From `contact_schedule`, auto-calculated | Red background |

**Log New Contact form fields:**

| Field | Input type | Values |
|---|---|---|
| Contact Date | Date picker (manual) | Any date |
| Last Attempted | Date picker (manual) | Any date |
| Contact Type | Dropdown | Attempted / Not Attempted / Completed |
| Contact Status | Dropdown | Answered / Left Voicemail / Not Answered |
| Client Sentiment | Dropdown | Positive / Neutral / Negative / At Risk |
| Follow Up Necessary | Dropdown | None Needed / CM Follow Up Needed / Attorney Review Needed / Attorney Contact Needed / Urgent Escalation |
| Contact Action Items | Text input (free text) | — |

`Save Contact` → `POST /api/communication/:caseId/log` → refreshes left panel row and right panel summary tiles on success.

**Contact history** (below the form): read-only list of previous Hub-logged contacts for this case, most recent first, collapsed rows expandable.

### New TypeScript types

```ts
export type ContactAttemptType = 'attempted' | 'not_attempted' | 'completed';
export type FollowUpType = 'none_needed' | 'cm_follow_up' | 'attorney_review' | 'attorney_contact' | 'urgent_escalation';

export interface CommunicationSummary {
  case_id: number;
  client_name: string;
  attorney: string;
  current_phase: Phase;
  initial_contact_date: string | null;
  last_contact_date: string | null;
  last_attempted: string | null;
  next_contact_due: string | null;
  contact_attempt_type: ContactAttemptType | null;
  contact_status: ContactStatus | null;
  client_sentiment: Sentiment | 'at_risk';
  follow_up_type: FollowUpType | null;
  action_item: string | null;
  is_overdue: boolean;
}
```

New hook: `useCommunication()` — fetches from `/api/communication`, returns `{ data, loading, error, refetch }`.

---

## Section 4 — Dashboard Changes

### Clickable stat cards

All five cards start unselected. Click to highlight blue and expand a detail panel below. Click again to collapse. Clicking a different card switches panels.

| Card | Panel content |
|---|---|
| Overdue Tasks | Flat list: client name, task title, days-overdue badge |
| Due Today | Flat list: client name, task title, phase badge (color-coded) |
| Open Tasks | Phase tiles → click tile → list of client name + task title for that phase |
| Total Cases | Phase tiles → click tile → list of client name + attorney for that phase |
| Contact Rate | Progress bar (X of Y), completed list (left), Needs Contact list (right, red), "View Communication Hub →" link |

**Contact Rate card** shows progress bar and "X of Y contacted" sub-label permanently on the card face (no click required to see the bar).

Phase color coding: File Setup → indigo, Treating → cyan, Demand Drafting → amber, Negotiations → green, Demand Sent → gray.

### Dashboard data hook

`useDashboard()` extended — new response fields `openTasksByPhase`, `casesByPhase`, `contactsNeedingContact` drive the drill-down panels client-side.

### Contact rate bug fix

`calculateContactRate()` returns `0` (not `100`) when `total === 0`.

---

## Section 5 — Caseload Sentiment Mirror

Each case row on `/caseload` gains a sentiment badge sourced from the most recent contact's `client_sentiment`.

| Value | Badge style |
|---|---|
| `positive` | Green pill |
| `neutral` | Amber pill |
| `negative` | Red pill |
| `at_risk` | Red pill, bold "At Risk" label (distinct from plain Negative) |
| No contacts | No badge |

Clicking a sentiment badge navigates to `/communication` with that case pre-selected in the left panel.

The cases API (`GET /api/cases`) is extended to include `latest_sentiment: string | null` on each case row.

---

## Files Affected

### Server
- `src/db/schema.sql` — add two `ALTER TABLE` statements
- `src/types.ts` — add `ContactAttemptType`, `FollowUpType`, extend `Contact`
- `src/routes/communication.ts` — new file: GET list + POST log
- `src/routes/dashboard.ts` — extend response with phase breakdowns + needs-contact list
- `src/routes/cases.ts` — add `latest_sentiment` to case rows
- `src/services/contact-schedule.ts` — fix `calculateContactRate` zero-case bug
- `src/services/overdue.ts` — add `getOverdueContacts()` for Hub is_overdue flag
- `src/index.ts` — mount new communication router

### Client
- `src/types.ts` — add `ContactAttemptType`, `FollowUpType`, `CommunicationSummary`
- `src/lib/api.ts` — add `communication.list()` and `communication.log()`
- `src/hooks/useCommunication.ts` — new hook
- `src/hooks/useDashboard.ts` — consume extended response fields
- `src/pages/Communication.tsx` — new page (two-panel hub)
- `src/pages/Dashboard.tsx` — clickable cards + drill-down panel
- `src/pages/Caseload.tsx` — sentiment badge per row, click → hub navigation
- `src/components/Sidebar.tsx` — add Communication nav link
- `src/App.tsx` — add `/communication` route
