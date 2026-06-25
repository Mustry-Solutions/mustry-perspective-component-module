---
name: verify-component
description: Live end-to-end verification of the Perspective components in a real browser session. Use after changing component code (web/ or the Java scopes) to actually SEE it render and behave before calling a change done — not just confirm the gateway served the bundle. Builds+deploys, opens the bound "verify" Perspective project in a browser via the Chrome tools, screenshots the layouts, and reports what's actually on screen.
---

# Verify the Perspective component live

The point of this skill: **don't deploy-and-hope.** A bundle returning HTTP 200
proves nothing about how the component looks or behaves. Render it in a real
Perspective session and look at it.

There is a committed verification harness:
- `ops/verify/project/` — a Perspective project ("verify") bind-mounted into the
  dev gateway (see `docker-compose.yml`). Its `Main` view contains the
  DateTimeRangePicker in three layouts (oneMonth / compact / twoMonths), each
  labelled.
- Session URL: **http://localhost:9088/data/perspective/client/verify**
  (port follows `GATEWAY_HTTP_PORT` in `.env`).

## Steps

1. **Build + deploy the change** so the gateway serves the new bundle:
   - `ops/deploy.sh` (rebuilds, re-signs, restarts; waits for the gateway).
   - If the gateway isn't up at all, `ops/setup.sh` (first run needs the one-time
     commissioning — see `ops/README.md`).

2. **Hard-refresh the bundle.** Perspective caches component JS/CSS. After deploy,
   the session must reload the new bundle. The reliable way in automation is to
   navigate the tab to the session URL fresh (a full navigation, not just an
   in-app refresh). If you still see stale rendering, restart the gateway
   (`docker compose restart gateway`) and re-navigate.

3. **Open it in the browser** with the Chrome tools (load them via ToolSearch
   first if deferred):
   - `tabs_context_mcp` (createIfEmpty: true) to get/create a tab.
   - `navigate` the tab to `http://localhost:9088/data/perspective/client/verify`.
   - `computer` action `screenshot` to capture it. (Saving/looking may require the
     user to grant the Chrome extension permission for localhost — if a call is
     "Permission denied by user", ask them to allow it, or have them screenshot.)

   - **Trial Expired screen?** The dev gateway runs Perspective in a 2-hour trial
     that this image persists across restarts. A `docker compose restart`/recreate
     does NOT reset it. Ask the user to open http://localhost:9088 and log in
     (`admin`/`password`) — logging into the gateway starts a fresh 2-hour trial —
     then reload the session. (Don't type the gateway password yourself.)

4. **Actually review the screenshot** against the change you made. Check the
   relevant layout(s): one-month grid + hover, compact two-field form, two-month
   side-by-side, the time pickers, presets, the duration/footer text, disabled-day
   styling. Compare to what the change was supposed to do.

5. **Exercise interactions when the change is behavioral** (selection state
   machine, hover band, presets, span limits, granularity). Use `computer`
   `left_click` on day cells / preset buttons / time inputs, then screenshot. This
   needs browser permission for localhost.

6. **Report what you actually saw** — not "deployed successfully", but "the
   two-month band spans correctly / the compact end-date input is bounded / the
   day cells tooltip the disable reason", etc. If something's off, that's a finding
   to fix before calling it done.

## Testing specific props/layouts

The `Main` view fixes the three layouts via `config.layout`. To exercise a
specific config (e.g. `disableDates`, `spanDays`, `granularity`, presets), either:
- temporarily edit a component instance's props in `ops/verify/project/.../Main/view.json`
  and restart the gateway, or
- add another instance/view. Edits there are committed harness changes — keep the
  default three-layout view intact (revert temporary prop tweaks).

## If the harness view ever breaks

The view/page resources are hand-authored Perspective JSON under
`ops/verify/project/com.inductiveautomation.perspective/`. If the gateway stops
rendering it after an Ignition upgrade, the reliable fix is to open the "verify"
project in the Designer, fix/recreate the `Main` view + a page mapped to `/`, save
(it writes straight back into the repo via the bind mount), and commit.
