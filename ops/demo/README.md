# Sales demo — "Mustry Bottling Co."

A story-driven Perspective project that shows **every component of the module in
a plant-operations narrative**, instead of a component-by-component catalog. It
runs on the local dev gateway and is built for showing to potential buyers on a
laptop.

```bash
ops/demo.sh --fresh   # pre-meeting ritual (~10 min before): fresh gateway,
                      # freshly signed module, NEW 2h Perspective trial
ops/demo.sh           # gateway already provisioned: just start + open
```

Opens http://localhost:9088/data/perspective/client/demo — present it
full-screen (Cmd-Ctrl-F in Chrome).

## The 7-minute walkthrough

| Page | What to show | Component(s) being sold |
|---|---|---|
| **Overview** | KPI cards tick live; drag/zoom the plant floor; pick "Line 2 — Filler" from *Go to…*; every ~minute Filler 2 faults: the KPI flips to STOPPED, the POI pulses, downstream equipment starves to amber. Click **Log sample** inside the QA lab — embedded views stay fully interactive. | Pan & Zoom View |
| **Schedule** | The scheduling board: grouped resources, categories + legend, live now-line. **Drag an order to another row** (reassign), resize one, click one to edit, switch to the Shift zoom preset. Navigate away and back — the change persisted (one `onChange` script). | Resource Timeline |
| **Maintenance** | Month view: recurring line walk-downs (↻), a multi-day shutdown bar, done/cancelled styling. Drag the PM to another day; week view for the time grid. Same data philosophy: one `onChange`. | Calendar / Scheduler |
| **Quality** | Live rolling window (the picker re-derives every minute — alarm-journal style). Out-of-spec fills glow red; double-click a cell: typed editors + validation; **+ New sample** pushes a row. Flip **Batch edit ON** to accumulate dirty cells and Save once (`onBatchSave`). CSV export on the toolbar. | Date/Time Range Picker + Data Grid |
| **Triage** | The downtime decision tree: Yes/No edge labels, the dashed red *Recurs* loop, hover info cards. Click *Clear jam* → the LOTO SOP loads beside it. Then the closer: **Escalate → create work order** — the WO instantly appears on the Schedule board *and* the Maintenance calendar (the components compose through one session store). | Branching Diagram |
| **Handover** | Write in the editor, **Save**, and the display copy updates; tick a checklist step on the *display* side — it fires an event and persists. The numpad is the no-OS-keyboard answer for panel PCs. | Rich Text Editor + On-Screen Keyboard |
| **Admin** | Schedules / rosters / users / holidays over the *real* gateway user source — the screens every integrator rebuilds. Last tab: a validated JSON config (invalid JSON cannot be saved) and the brand accent — change it and revisit Overview. | Admin family + Code Editor + Color Picker |

Two one-click moments from the top bar, any time they land well:

- **Language dropdown** (EN/FR/DE/NL/ES/IT/PT) — the WHOLE app relocalizes in
  one click: component UI (label packs + dates via `config.locale`) and the
  shell (titles, nav, KPI captions, category legends, board resources, grid
  headers — all bound to a `session.custom.demo.i18n` dict the dropdown
  swaps). Seeded event titles, SOP texts and the plant-floor signage stay
  English on purpose: they're content, not chrome.
- **Light/Dark** — the full app follows the Perspective theme: components
  restyle themselves, and every shell colour carries a theme-conditional
  binding (dark ↔ light palette pairs, applied by the generator's theme
  pass).

Closer: "Everything you dragged, edited and saved went through the same
pattern — components fire events, one small script persists. Bind them to your
tags, named queries or historian and this is your project."

## How it works (for maintainers)

- **Data seeds itself relative to *today*** on session start, in the browser's
  timezone, so the demo never goes stale. The seeder is a property-change
  script on a hidden label in the docked `Nav` view, keyed on
  `session.custom.demo.seeded` (declared in the project's `session-props`).
- All page views bind their `data.*` to `session.custom.demo.*`; the
  `onChange`/`onCellEdit`/`onSave` handlers write back to the same place, so
  edits persist across page navigation within a session.
- **Reset demo** (top bar) flips `seeded` back to `false`, which reseeds and
  returns home. A fresh browser session reseeds automatically.
- The animated "live" feel (equipment states, KPI ticks, the Filler 2 fault
  every ~minute) is pure `now(...)`-driven expression bindings — no tags, no
  timers, nothing to install.
- The views are plain committed JSON (same bind-mount mechanics as
  `ops/verify/`). **The gateway only reads project files at startup** on this
  Docker-for-Mac setup — after editing files here, restart the gateway
  (`docker compose restart gateway`) or run `ops/deploy.sh`.
- Smoke-tested in CI by `e2e/tests/demo.spec.ts` (one test per page, seeded
  content asserted, console must stay clean).
