# ops/ — local development gateway

Helper scripts for running a disposable **Ignition 8.3.6** gateway in Docker so you
can build, install, and test this module locally. The gateway is defined in
[`../docker-compose.yml`](../docker-compose.yml).

> **Development only.** This gateway accepts the EULA automatically and uses a fixed
> weak admin password (`admin` / `password`). The module is signed with a local
> self-signed dev certificate (auto-generated under `ops/signing/`, gitignored).
> Never use this configuration in production.

## Prerequisites

- Docker (Docker Desktop running)
- JDK 17 (the scripts point Gradle at Temurin 17 if installed in the standard macOS location)
- Internet access on first run (downloads the Ignition image and Gradle dependencies)

## Quick start

```bash
ops/setup.sh
```

This builds and signs the module, stages it for the gateway, and starts the gateway.
On a **fresh** gateway there is a one-time step: open <http://localhost:9088>, step
through the commissioning wizard, and **accept the certificate + license for
"Mustry Solutions Perspective Components"** when it's listed (Ignition 8.3 accepts
third-party modules right in the commissioning wizard). Then log in with
`admin` / `password` and find it under **Config → Modules**.

The accepted certificate persists in the gateway data volume, and the dev signing
certificate is stable across rebuilds — so redeploys (`ops/deploy.sh`) reload your
module with no prompt. You only commission again after `teardown.sh --purge`.

> **Ports:** the gateway is published on host port **9088** (HTTPS 9043) by default,
> set in [`../.env`](../.env). The default 8088 was already in use locally. To change
> it, edit `GATEWAY_HTTP_PORT` in `../.env` — the gateway still listens on 8088 inside
> the container, so only the published host port changes.

> The Ignition gateway runs in **trial mode** (no license). Perspective works in
> trial; the trial resets every 2 hours — just click "reset trial" in the gateway.

## Scripts

| Script | What it does |
|--------|--------------|
| `setup.sh` | Build the module, start the gateway, install the module. Safe to re-run. |
| `deploy.sh` | Rebuild after code changes and reload the module into the running gateway. |
| `teardown.sh` | Stop/remove the gateway. Keeps the data volume. |
| `teardown.sh --purge` | Also delete the gateway data volume (completely clean slate). |
| `logs.sh` | Tail the gateway logs (`Ctrl-C` to stop). |
| `status.sh` | Show container status, health, URL, and the staged `.modl`. |
| `e2e.sh` | Rebuild + redeploy, then run the Playwright smoke suite (`e2e/`) against the verify project. |
| `e2e.sh --fresh` | Wipe the gateway and bring it back **fully unattended** (no wizard, fresh 2h trial), then run the suite. What CI runs. |

## Typical workflow

```bash
ops/setup.sh        # first time (or after --purge)
# ... edit module code ...
ops/deploy.sh       # rebuild + reload into the running gateway
ops/logs.sh         # watch what the gateway is doing
ops/teardown.sh     # stop when done (keeps state)
```

## How it works

- The gateway is `inductiveautomation/ignition:8.3.6`, edition `standard` (includes Perspective).
- `ops/lib.sh` generates a self-signed dev keystore under `ops/signing/` (once), then
  builds **and signs** the module by passing `-Pignition.signing.*` to Gradle. A plain
  `./gradlew build` with no signing properties still works and produces an *unsigned* build.
- The signed `.modl` is staged into `ops/modules/`, bind-mounted to `/external-modules`
  in the container. The gateway is pointed there with
  `-Dignition.gateway.externalModulesFolder=/external-modules` and discovers the module.
- Ignition 8.3 quarantines any module whose certificate hasn't been accepted. You accept
  the dev certificate once in the commissioning wizard; it's recorded in the data volume.
  Because the dev cert is reused for every build, later redeploys load without re-prompting.

> **Hands-off alternative:** Ignition 8.3 records third-party acceptance in
> `data/modules.json` (`certFingerprint` = SHA-1 of the signing cert). `e2e.sh --fresh`
> exploits that: it lets a fresh gateway commission headlessly (EULA/admin/edition come
> from compose env), then stops it, merges the module's entry into the gateway-written
> `modules.json`, and restarts — no wizard. CI uses this; locally it also gives you a
> fresh 2h Perspective trial whenever the old one expires.

## Troubleshooting

- **Module doesn't appear:** make sure you completed the commissioning wizard at
  <http://localhost:9088> and accepted the module's certificate. Check `ops/status.sh`;
  if the gateway shows `NEEDS_COMMISSIONING`, finish the wizard. In a running gateway,
  a quarantined module can also be accepted under **Config → Modules**.
- **Wrong / stale version:** `ops/teardown.sh --purge && ops/setup.sh` for a clean cycle.
- **Port already in use:** another service (maybe another gateway) is using the host
  port. Change `GATEWAY_HTTP_PORT` (and `GATEWAY_HTTPS_PORT`) in `../.env`, then re-run.
- **Gateway slow to start:** first launch initializes the database; give it a minute
  and watch `ops/logs.sh`.
