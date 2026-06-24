#!/usr/bin/env bash
# Build the module and bring up a fresh local Ignition 8.3.6 gateway with the
# module installed. Safe to re-run.
#
# Usage: ops/setup.sh

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

require_docker
build_and_stage_module

info "Starting the Ignition gateway container..."
"${COMPOSE[@]}" up -d

# On a brand-new (fresh) data volume, the gateway runs first-time commissioning
# and may not link third-party modules until its next start. Wait for it to be
# up, then restart once so our module is reliably linked and loaded.
if wait_for_gateway 60; then
  info "Restarting once so the module is linked into the freshly initialized gateway..."
  "${COMPOSE[@]}" restart gateway
  wait_for_gateway 60 || true
fi

echo
ok "Done. Your development gateway is running."
echo "   URL:      ${GATEWAY_URL}"
echo "   Login:    ${ADMIN_USER} / ${ADMIN_PASS}"
echo "   Module:   Config -> Modules  (look for 'Mustry Solutions Perspective Components')"
echo
echo "   Tail logs:        ops/logs.sh"
echo "   Redeploy changes: ops/deploy.sh"
echo "   Tear it down:     ops/teardown.sh   (add --purge to wipe gateway data)"
