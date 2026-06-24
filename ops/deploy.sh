#!/usr/bin/env bash
# Rebuild the module and reload it into the already-running gateway.
# Use this after you change module code. For a clean slate, use teardown.sh + setup.sh.
#
# Usage: ops/deploy.sh

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

require_docker

# If the gateway isn't running yet, just hand off to setup.
if ! "${COMPOSE[@]}" ps --status running --services 2>/dev/null | grep -q '^gateway$'; then
  warn "Gateway isn't running. Running setup.sh instead."
  exec "${OPS_DIR}/setup.sh"
fi

build_and_stage_module

info "Restarting the gateway to load the new build..."
"${COMPOSE[@]}" restart gateway
wait_for_gateway 60 || true

echo
ok "Redeployed. Refresh ${GATEWAY_URL} -> Config -> Modules to confirm the new version."
warn "If the version doesn't change, do a clean cycle: ops/teardown.sh --purge && ops/setup.sh"
