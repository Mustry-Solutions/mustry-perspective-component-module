# Admin Components (Schedule / Roster / User Management) — family plan

**Status (2026-07-22): ALL FOUR BUILT AND SHIPPING** (the Holiday Manager joined the original three — holidays graduated from "deferred, render read-only" to a full component). The family landed in
build order Schedule Manager (`…admin.schedulemanager`, M0–M2) → Roster
Manager (`…admin.rostermanager`) → User Manager (`…admin.usermanager`);
demos at `/schedule`, `/roster` and `/users` persist against the live
gateway. The plan below is kept for the decisions and their rationale;
deviations that emerged during the build are footnoted inline.

**Deviations from the original plan:**
- Rename is a single `onScheduleSave {…, oldName}` payload field, not a
  separate `onScheduleRename` event (one persistence script beats two).
- Rosters and users don't rename at all in v1 (no gateway rename API for
  rosters; username changes are an auth/history decision, not a UI one).
- User Manager shipped with the family rather than demand-gated — the
  shared patterns made it cheap once Schedule/Roster existed.
- The password flow is a staged field in the save payload
  (`config.allowPasswordChange`, default off) instead of a separate
  onPasswordChange event.
- Hard-won 8.3 facts now encoded in the reference scripts: the default
  user source is named `'default'` (empty string throws), Jython's
  `except Exception` misses Java exceptions (demo scripts use bare
  `except` + logging), `system.roster.addUsers` takes User OBJECTS, and
  the source's password complexity policy applies to scripted writes.

## What & why

Vision ships User Management, Schedule Management and Roster Management
components; Perspective ships none of them. Admins fall back to the gateway
web UI (which operators shouldn't touch) or to IA Sales Engineering's
Exchange *view templates* — copy-in views, unversioned, script-heavy, not
compiled components. That's the same gap shape the Color Picker and
On-Screen Keyboard filled.

Demand anchor (researched 2026-07-22): "Perspective - Admin Components" on
the Ideas portal — **102 votes, open since July 2019, no IA status label**
(not even Under Review), the highest-vote component-shaped request on the
board with no native commitment. The only activity is a 2021 comment
pointing at the Exchange templates.

Why Schedule Manager first: it's a calendar-shaped UI — the module already
owns week-grid rendering and drag-to-paint gestures — and its API surface
is the cleanest (full CRUD, gateway-global, no user-source variance).

## Feasibility (API verified 2026-07-22 against 8.3 docs)

All persistence goes through documented scripting APIs, called from the
*author's* scripts — the components stay controlled and never touch user
sources themselves.

- **Schedules** — full CRUD under `system.user`: `getSchedules`,
  `getSchedule`, `addSchedule`, `editSchedule`, `removeSchedule`, plus
  `getScheduledUsers`, `isUserScheduled`, `addCompositeSchedule`,
  `createScheduleAdjustment`, and holiday CRUD
  (`getHolidays`/`addHoliday`/…).
- **Rosters** — separate `system.roster` namespace: `getRosters`,
  `getRoster`, `getRosterNames`, `getUsers`, `createRoster`,
  `deleteRoster`, `addUsers` (always appends), `removeUsers`. **There is no
  reorder/edit primitive** — reordering a roster means removing all users
  and re-appending in the new order. The reference persistence script owns
  that reconcile; the component just reports the desired ordered list.
- **Users** — CRUD under `system.user` (`getUsers`, `getNewUser`,
  `addUser`, `editUser`, `removeUser`), role CRUD (`getRoles`, `addRole`,
  `editRole`, `removeRole`), `getUserSources()`. Caveat: AD/LDAP-backed
  sources are read-only — the components need a degrade-to-viewer mode
  (`config.readOnly`), because the module can't detect writability
  reliably from the client.

## Settled decisions (proposed) — family-wide

1. **Controlled, always.** Components render bound data and edit *drafts*;
   commits fire events carrying the full desired object; the author's
   script persists via `system.user.*` / `system.roster.*` and refreshes
   the binding. No gateway calls from the module, no Java beyond the usual
   descriptors. The verify project ships reference persistence scripts —
   for this family the scripts are half the deliverable.
2. **Shared `admin` visual layer** (`web/typescript/components/admin/`
   shared subfolder or `shared/admin/`): master-detail panel chrome,
   user-chip rendering, confirm-delete affordance, and (from M2 on) the
   directory-picker popover reused by Roster and User Managers. One
   `--adm-*` CSS variable set; one label-pack family (7 locales, admin
   vocabulary — "roster", "availability" — overridable per key as usual).
3. **Transactional editing discipline**: drafts live in component state
   with explicit Save/Discard per detail pane; `output.isDirty` and
   `output.validationErrors` let authors gate their own commit UI (the
   code-editor `output.isValid` pattern). No live-commit — admins expect
   transactionality.
4. **Security posture is the author's job, documented loudly**: the
   components are UI only; docs + demo views show gating behind Perspective
   security levels. Password handling (User Manager, deferred) never
   echoes into `output.*` or props — event payload only, draft wiped on
   commit/cancel, behind `config.allowPasswordChange`.
5. **Item schemas stay open** (rows carry user fields) per the props
   conventions; section locking (`additionalProperties: false`) everywhere
   else.

## Component 1: Schedule Manager (this branch)

Master-detail: schedule list (left rail, "active now" dot per schedule) +
detail editor. The detail pane is a **7-day week grid where you drag to
paint availability blocks** — a `dragGestureController` subclass over the
calendar's week-grid rendering pattern. Below the grid: repetition
(all-weeks / alternating A-B, matching Ignition's `repeatWeeks` model) and
observation metadata (name, description).

- `data.schedules[]` mirrors the Ignition schedule shape: `name`,
  `description`, per-day availability time-range strings (`"8:00-17:00"`,
  multiple ranges comma-separated — the exact format `system.user`
  schedules use), `repeatWeeks`, start/end effective dates. Open item
  schema.
- `state.selectedSchedule` (two-way) — pre-settable and bindable.
- Events: `onScheduleSave {schedule, isNew}`, `onScheduleDelete {name}`,
  `onScheduleRename {oldName, name}` (rename is `removeSchedule` +
  `addSchedule` server-side — surfaced as its own event so the author can
  decide whether renames are allowed).
- `output.isDirty`, `output.validationErrors`, `output.selectedName`.
- **Preview strip** (the feature Vision never had): "who's on this
  schedule / is it active at instant T" — pure evaluation of the
  availability model against a probe time, rendered as a live badge and
  exposed as `output.isActiveNow`. All availability parsing/evaluation
  is pure `scheduleLogic.ts` with Jest coverage (range-string
  parse/format, overlap merge on paint, active-at-instant, alternating
  weeks).
- Deferred, rendered read-only if present: composite schedules, holiday
  calendars, schedule adjustments.

## Component 2: Roster Manager (next branch)

Roster list + ordered user list with **drag-to-reorder** (order = alarm
escalation sequence; the UI labels it "1st contact, 2nd contact…").
Add-users via the shared directory-picker popover (typeahead over
`data.availableUsers` — bound, typically `system.user.getUsers`). Per-row
missing-contact-info warning (the failure admins are hunting). Events:
`onRosterSave {name, users[]}` (script reconciles via
`removeUsers`+`addUsers`), `onRosterCreate`, `onRosterDelete`.

## Component 3: User Manager (demand-gated, not scheduled)

Filterable user grid (reuse grid subcomponents) + detail drawer: contact
points, role chips, schedule dropdown, language; `config.mode` full /
edit-single / edit-self. Password + role management behind config flags,
last. Biggest surface, most security-sensitive — deliberately deferred
until Schedule + Roster prove the family out.

## Milestones (Schedule Manager)

- **M0 — read-only vertical slice**: schema + descriptor + registration;
  schedule list from `data.schedules`, week grid renders availability
  (no editing), selection two-way, demo view at `/schedule` with a
  `system.user.getSchedules()` reference binding. Exit: renders real
  gateway schedules in the verify project.
- **M1 — editing**: drag-to-paint availability (paint/erase/resize via the
  gesture controller), range merge, repetition + metadata editing, drafts +
  Save/Discard, `onScheduleSave`/`onScheduleDelete`, dirty/validation
  outputs, reference persistence scripts in the demo.
- **M2 — polish**: create/rename flows, preview strip + `isActiveNow`,
  labels ×7, `--adm-*` theming light+dark pass, e2e coverage, manual-test
  checklist (touch joins the standing tablet session).

## Risks

- **Model fidelity**: the availability range-string format and
  alternating-week semantics must match `system.user` exactly or saves
  corrupt schedules — M0 pins the shape against a live gateway before any
  editing exists.
- **IA ships it natively**: the idea is unlabeled after six years — lowest
  native-risk item on the board, but the general clock (they marked our
  other four anchors Planned/In Progress) argues for shipping fast.
- **Roster ordering reconcile** (M-roster): remove-all + append is racy if
  two admins edit at once; the reference script does it atomically enough
  for the real use case, and the docs say so.
- **AD read-only sources** (M-user): mitigated by `config.readOnly`
  degrade; can't be auto-detected client-side.
