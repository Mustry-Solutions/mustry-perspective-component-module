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

(The former `CalendarStress`/`TimelineStress` volume fixtures were removed after
the P2 perf pass — restore from git history if ever needed.)

The three demo views carry a **theme dropdown** (top-right) that writes
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
