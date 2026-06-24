# ops/ — local development gateway

Helper scripts for running a disposable **Ignition 8.3.6** gateway in Docker so you
can build, install, and test this module locally. The gateway is defined in
[`../docker-compose.yml`](../docker-compose.yml).

> **Development only.** This gateway accepts the EULA automatically, uses a fixed
> weak admin password (`admin` / `password`), and allows **unsigned** modules.
> Never use this configuration in production.

## Prerequisites

- Docker (Docker Desktop running)
- JDK 17 (the scripts point Gradle at Temurin 17 if installed in the standard macOS location)
- Internet access on first run (downloads the Ignition image and Gradle dependencies)

## Quick start

```bash
ops/setup.sh
```

This builds the module, starts the gateway, and installs the module. When it
finishes, open <http://localhost:9088> and log in with `admin` / `password`. Find the
module under **Config → Modules** ("Mustry Solutions Perspective Components").

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
- Unsigned modules are allowed via the wrapper argument
  `-Dignition.allowunsignedmodules=true` (passed after `--` in the compose `command`).
- The built `.modl` is staged into `ops/modules/`, which is bind-mounted to `/modules`
  in the container. The image links any `.modl` found there into the gateway at startup.
- On a brand-new gateway, third-party modules aren't linked on the very first boot, so
  `setup.sh` restarts the gateway once after initial commissioning.

## Troubleshooting

- **Module doesn't appear / wrong version:** `ops/teardown.sh --purge && ops/setup.sh`
  for a clean cycle.
- **Port already in use:** another service (maybe another gateway) is using the host
  port. Change `GATEWAY_HTTP_PORT` (and `GATEWAY_HTTPS_PORT`) in `../.env`, then re-run.
- **Gateway slow to start:** first launch initializes the database; give it a minute
  and watch `ops/logs.sh`.
