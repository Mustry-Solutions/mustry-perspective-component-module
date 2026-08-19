#!/usr/bin/env bash
# Launch the sales demo: the "Mustry Bottling Co." Perspective project
# (ops/demo/project) on the local dev gateway, opened in the default browser.
#
# Usage:
#   ops/demo.sh            Bring the gateway up if needed and open the demo.
#                          Assumes the module was installed before (setup.sh or
#                          a previous --fresh run).
#   ops/demo.sh --fresh    Pre-meeting ritual: wipe the gateway and bring it
#                          back fully unattended with a freshly built+signed
#                          module and a NEW 2h Perspective trial. Run this ~10
#                          minutes before a customer demo.
#
# Demo tips (also printed at the end):
#   - The demo seeds its data relative to "today" on session start; the
#     "Reset demo" button in the top bar reseeds mid-session.
#   - Present full-screen (Chrome: View > Enter Full Screen / Cmd-Ctrl-F).

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

MODE="up"
OPEN_BROWSER=1
for arg in "$@"; do
  case "${arg}" in
    --fresh)   MODE="fresh" ;;
    --no-open) OPEN_BROWSER=0 ;;
    *) err "Unknown argument: ${arg}"; exit 1 ;;
  esac
done

require_docker

# The demo seeds wall-clock data on the GATEWAY, so for a demo the gateway's
# timezone should match this laptop's or shift times read wrong. Export the
# host zone for THIS compose invocation only — e2e.sh/CI keep the compose
# default (UTC). Takes effect when the container is (re)created (--fresh).
if [[ -z "${GATEWAY_TZ:-}" ]]; then
  host_tz="$(readlink /etc/localtime 2>/dev/null | sed 's|.*/zoneinfo/||')"
  if [[ -n "${host_tz}" ]]; then
    export GATEWAY_TZ="${host_tz}"
    info "Gateway timezone for this run: ${host_tz} (applies on container recreation)."
    if [[ "${MODE}" != "fresh" ]]; then
      warn "If shift times look offset, run 'ops/demo.sh --fresh' once so the timezone applies."
    fi
  fi
fi

case "${MODE}" in
  fresh)
    # Same unattended bootstrap as e2e.sh --fresh, without the test suite.
    build_and_stage_module
    info "Recreating the gateway from a fresh volume (unattended)..."
    "${COMPOSE[@]}" down -v
    "${COMPOSE[@]}" up -d
    wait_for_gateway 60
    wait_for_modules_registry 60
    accept_staged_module
    wait_for_commissioned 60
    # Give Perspective a moment after the acceptance restart so the first
    # session doesn't drop its websocket while services settle.
    sleep 15
    ;;
  up)
    if ! curl -fsS "${GATEWAY_URL}/StatusPing" >/dev/null 2>&1; then
      info "Gateway is not running — starting it..."
      "${COMPOSE[@]}" up -d
      wait_for_commissioned 60
    else
      ok "Gateway already running."
    fi
    ;;
esac

# The demo is only worth opening if the module bundle is actually served.
bundle_ok=""
for _ in $(seq 1 12); do
  if curl -fsS -o /dev/null "${GATEWAY_URL}/res/mustry-components/MustryComponents.js" 2>/dev/null; then
    bundle_ok=1
    break
  fi
  sleep 5
done
if [[ -z "${bundle_ok}" ]]; then
  err "Gateway is up but not serving the module bundle."
  err "Run 'ops/demo.sh --fresh' (or ops/setup.sh) to install the module first."
  exit 1
fi

DEMO_URL="${GATEWAY_URL}/data/perspective/client/demo"
ok "Demo ready: ${DEMO_URL}"
info "Reminders:"
echo "    - Perspective trial lasts 2h; 'ops/demo.sh --fresh' before a meeting resets it."
echo "    - 'Reset demo' in the top bar reseeds the data (relative to today)."
echo "    - Present full-screen (Cmd-Ctrl-F in Chrome) for the control-room look."

if [[ "${OPEN_BROWSER}" == "1" ]] && command -v open >/dev/null 2>&1; then
  open "${DEMO_URL}"
fi
