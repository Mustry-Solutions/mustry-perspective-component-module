# ops/verify — live component verification harness

A committed Perspective project for **seeing the components actually render and
behave** in a browser, instead of only checking that the gateway served the bundle.

## What's here

- `project/` — a Perspective project named **`verify`**, bind-mounted into the dev
  gateway (see the volume in `../../docker-compose.yml`). Views live under
  `com.inductiveautomation.perspective/views/`, routed by `page-config/`:

| Route | View | What it exercises |
|---|---|---|
| `/` or `/picker` | Main | DateTimeRangePicker showcase: a presets+realtime demo instance with live output readouts, plus the labelled oneMonth / compact / popover layout gallery. |
| `/calendar` | CalendarDemo | Evergreen editable calendar (data seeded relative to today via a `now(0)` binding): shifts, categories, statuses, backgrounds, recurring series, export, Live toggle, and the full scope-aware `onChange` write-back script across `events` **and** `recurringEvents`. |
| `/calendar-db` | CalendarDbDemo | Windowed-fetch recipe: `data.events` driven by `output.visibleStart/End` over a 114-event source + always-loaded `recurringEvents`. |
| `/calendar-empty` | CalendarEmpty | Empty-state badge/tooltip behaviour. |
| `/timeline` | TimelineDemo | Evergreen editable Resource Timeline (seeded relative to today): groups, icons, state/background bands, shifts, export, Live toggle, and the full write-back script (drag/reassign/resize/create/editor, recurring detach + series scope). |
| `/timeline-db` | TimelineDbDemo | Timeline windowed-fetch recipe (window-scoped transform on `output.visibleEnd`). |
| `/timeline-empty` | TimelineEmpty | Empty-state badge/tooltip behaviour. |
| `/timeline-cycle` | TimelineCycle | Cycle-time fixture (issue #117): machine cycles with second-long (and sub-second) phases seeded around now; `config.zooms` offers the `millisecond`/`second`/`minute` presets, opens at `second` on the current cycle. Read-only, so sub-second phases (40 ms `Vent`, 60 ms `Arc on/off`) render at their true width. |
| `/timeline-window` | TimelineWindow | Custom-window fixture (issue #186): `state.windowStart`/`windowEnd` pin the board to 06:00-14:00 UTC on 2026-06-01; Next pages by 8 h and writes the window back; a zoom button clears it. Used by the e2e suite. |
| `/i186` | I186Index | Manual-test hub for issue #186, linking the pages below plus `/timeline-db` and `/calendar-db` (paging must not fade the new window in). |
| `/i186-live` | I186Live | Live machine-cycle board (a new phase every second or two): toggle `config.animations`, and switch between stable ids and an id regenerated per refresh to see the flashing the issue reported. |
| `/i186-window` | I186Window | Custom time window in Europe/Brussels: buttons for a shift, the 2026-10-25 DST weekend, a live 45-second window, mixed epoch/ISO edges, a half-set window and out-of-range values; readouts show state, value types and the visible range. |
| `/i186-weekstart` | I186WeekStart | One dropdown drives `config.weekStart` on a calendar, a date/time picker (This week / Last week presets) and a timeline (mini month on the title). |
| `/toast` | ToastDemo | `system.mustry.toast()`: the four types, markup shown as text, a 1 s and a sticky toast, an unknown type, a gateway background thread with and without explicit session/page ids, and light/dark theme buttons. Holds only standard components, proving the toast bundle loads on any page. Used by the e2e suite. |
| `/grid-stress` | GridStress | 50,000 generated rows (5.6 KB committed): validates the client-side ceiling — virtualization, sort/filter latency, the ~6 MB payload constraint. |
| `/grid-cell` | GridCellEdit | Five work orders in CELL edit mode with the reference `onCellEdit` write-back script and a counter of its runs: each committed edit (Enter, Tab, click away) must run it exactly once. Used by the e2e suite. |
| `/grid` | GridDemo | Data Grid M0-M3: 2,500 evergreen work orders — virtualization, frozen columns, sort/filter/select, column layout gestures, typed formatting + validation, dropdown-in-cell + BATCH editing (Save/Discard), Excel paste, Qty sum footer, add/delete rows, CSV export. |
| `/panzoom` | PanZoomDemo | Pan & Zoom View M0–M3: embeds `SynopticDemo` (a 2400×1500 plant-floor coordinate view with a click-counter button proving embedded interactivity survives the transform) — drag-pan, wheel/pinch/double-click zoom toward the cursor, +/−/home/fit controls, zoom badge, minimap, `data.pois` with the "Go to…" list, and buttons scripting the two-way state: "Fly to Pump 3" (`state.target`), "Fly home" (`state.zoom = 0`), "Toggle Pump 3 alarm" (`pois[].flagged` → pulse ring / edge indicator). |

(The former `CalendarStress`/`TimelineStress` volume fixtures were removed after
the P2 perf pass — restore from git history if ever needed.)

The demo views carry a **theme dropdown** (top-right) that writes
`session.props.theme` (light / dark / warm / cool variants) so the components
can be eyeballed against any Perspective theme. The theme is session-scoped: a
full page reload starts a fresh session and resets it to the project default.

Because it's bind-mounted, the project is always present in the gateway (survives
`teardown.sh --purge`), and anything you save against it in the Designer writes
**straight back into this folder** in the repo.

> Demo mutations persist only in the Perspective session (the component write-backs
> update session props, not the committed view JSON) — a fresh browser session
> starts from the committed data again.

## Use it

1. Build + deploy the module: `../deploy.sh` (or `../setup.sh` the first time).
2. Open the session in a browser:

   **http://localhost:9088/data/perspective/client/verify**

   (host port follows `GATEWAY_HTTP_PORT` in `../../.env`).
3. Open the route for the component you changed (table above) and confirm the
   behaviour live. Manual checklists: `docs/calendar-manual-test.md`,
   `docs/timeline-manual-test.md`.

> **Trial expired?** The dev gateway runs Perspective in a **2-hour trial**, and this
> image persists it across container restarts. If the session shows "Trial Expired",
> open the gateway at **http://localhost:9088** and **log in** (`admin` / `password`) —
> logging into the gateway starts a fresh 2-hour trial. Then reload the session.

After a redeploy, navigate to the URL fresh (full reload) so Perspective picks up
the new component bundle; if it looks stale, `docker compose restart gateway` and
reload.

## Automated verification

The `/verify-component` skill (`.claude/skills/verify-component`) drives this loop
with the Chrome automation tools: deploy → open the session → screenshot the
layouts → report what's on screen. Run it after component changes.

## Notes

- The view/page JSON is hand-authored (it renders correctly on Ignition 8.3.6). If a
  future Ignition version changes the resource format, recreate the views + pages
  in the Designer and save — they write back here through the bind mount.
- To test a specific config, temporarily tweak an instance's props in the relevant
  `view.json` and restart the gateway, then revert.
