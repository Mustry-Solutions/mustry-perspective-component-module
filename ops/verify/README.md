# ops/verify — live component verification harness

A committed Perspective project for **seeing the components actually render and
behave** in a browser, instead of only checking that the gateway served the bundle.

## What's here

- `project/` — a Perspective project named **`verify`**, bind-mounted into the dev
  gateway (see the volume in `../../docker-compose.yml`). It contains:
  - `project.json` — the project definition.
  - `com.inductiveautomation.perspective/views/Main/` — a view with the
    DateTimeRangePicker in three layouts (oneMonth / compact / twoMonths), labelled.
  - `com.inductiveautomation.perspective/page-config/` — maps the page `/` to that view.

Because it's bind-mounted, the project is always present in the gateway (survives
`teardown.sh --purge`), and anything you save against it in the Designer writes
**straight back into this folder** in the repo.

## Use it

1. Build + deploy the module: `../deploy.sh` (or `../setup.sh` the first time).
2. Open the session in a browser:

   **http://localhost:9088/data/perspective/client/verify**

   (host port follows `GATEWAY_HTTP_PORT` in `../../.env`).
3. You should see the picker in all three layouts. Interact with it and confirm the
   behaviour of whatever you changed.

After a redeploy, navigate to the URL fresh (full reload) so Perspective picks up
the new component bundle; if it looks stale, `docker compose restart gateway` and
reload.

## Automated verification

The `/verify-component` skill (`.claude/skills/verify-component`) drives this loop
with the Chrome automation tools: deploy → open the session → screenshot the
layouts → report what's on screen. Run it after component changes.

## Notes

- The view/page JSON is hand-authored (it renders correctly on Ignition 8.3.6). If a
  future Ignition version changes the resource format, recreate the `Main` view +
  page in the Designer and save — it writes back here through the bind mount.
- To test a specific config (disableDates / spanDays / granularity / presets),
  temporarily tweak an instance's props in `Main/view.json` and restart the gateway,
  then revert.
