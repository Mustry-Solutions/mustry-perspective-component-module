#!/usr/bin/env bash
# Run the Playwright e2e smoke suite (e2e/) against the local dev gateway.
# Each test opens a route of the committed "verify" project in a real
# Perspective session and asserts the component renders and behaves.
#
# Usage:
#   ops/e2e.sh              Rebuild + redeploy the module into the running
#                           gateway, then run the suite. Needs a commissioned
#                           gateway (setup.sh) with an unexpired trial.
#   ops/e2e.sh --fresh      Wipe gateway data (like teardown.sh --purge) and
#                           bring the gateway back fully unattended: headless
#                           commissioning, module certificate pre-accepted, and
#                           a fresh 2h Perspective trial — no browser wizard.
#                           This is what CI runs; locally it's also the fastest
#                           fix for an expired trial.
#   ops/e2e.sh --no-deploy  Skip build/deploy; test whatever the gateway serves.
#
# Extra arguments after the mode flag are passed to `playwright test`, e.g.:
#   ops/e2e.sh --no-deploy tests/grid.spec.ts

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

MODE="deploy"
case "${1:-}" in
  --fresh)     MODE="fresh";  shift ;;
  --no-deploy) MODE="none";   shift ;;
esac

require_docker

case "${MODE}" in
  fresh)
    build_and_stage_module
    info "Recreating the gateway from a fresh volume (unattended)..."
    "${COMPOSE[@]}" down -v
    "${COMPOSE[@]}" up -d
    # Give the container a moment to exist before exec'ing into it.
    sleep 5
    fix_projects_ownership
    # First boot: EULA/admin/edition commission headlessly from compose env,
    # but the staged module is unaccepted, so the gateway parks in
    # COMMISSIONING (never clean RUNNING). Wait for it to respond and write
    # its module registry, then seed the acceptance and restart — that
    # completes commissioning.
    wait_for_gateway 60
    wait_for_modules_registry 60
    accept_staged_module
    wait_for_commissioned 60
    # Perspective sessions opened immediately after the acceptance restart can
    # drop their websocket once while background services settle; give it a
    # moment so the first test session is stable.
    sleep 15
    ;;
  deploy)
    "${OPS_DIR}/deploy.sh"
    ;;
  none)
    wait_for_gateway 12
    ;;
esac

# Sanity: the gateway must serve the component bundle before we spend time
# booting browser sessions. Retry — right after a restart StatusPing answers
# before module startup has mounted the resources.
bundle_ok=""
for _ in $(seq 1 12); do
  if curl -fsS -o /dev/null "${GATEWAY_URL}/res/mustry-components/MustryComponents.js" 2>/dev/null; then
    bundle_ok=1
    break
  fi
  sleep 5
done
if [[ -z "${bundle_ok}" ]]; then
  err "Gateway is up but not serving the module bundle. Is the module installed/accepted?"
  exit 1
fi

cd "${PROJECT_ROOT}/e2e"
if [[ ! -d node_modules ]]; then
  info "Installing e2e dependencies (first run)..."
  npm ci
fi

info "Running the Playwright suite against ${GATEWAY_URL} ..."
E2E_BASE_URL="${GATEWAY_URL}" npx playwright test "$@"
