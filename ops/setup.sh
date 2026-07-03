#!/usr/bin/env bash
# Build the module and bring up a fresh local Ignition 8.3.6 gateway with the
# module installed. Safe to re-run.
#
# Usage: ops/setup.sh

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

require_docker
build_and_stage_module

info "Starting the Ignition gateway container..."
# The freshly built+signed .modl is staged in ops/modules, which is bind-mounted to
# /external-modules in the container (see docker-compose.yml). The gateway discovers
# it during first-time commissioning.
"${COMPOSE[@]}" up -d

# Fresh-volume fix: Docker creates the bind-mount's parent path (data/projects/)
# as root inside a brand-new volume, and the gateway then faults with "unable to
# create resource dir: .../projects/.resources". Hand the directory to the
# ignition user and bounce the gateway once so it starts clean. Idempotent —
# a no-op restart on an already-correct volume.
if ! "${COMPOSE[@]}" exec -T -u root gateway \
        stat -c '%U' /usr/local/bin/ignition/data/projects 2>/dev/null | grep -q ignition; then
    info "Fresh volume: fixing data/projects ownership for the ignition user..."
    "${COMPOSE[@]}" exec -T -u root gateway \
        chown ignition:ignition /usr/local/bin/ignition/data/projects
    "${COMPOSE[@]}" restart gateway
fi

wait_for_gateway 60 || true

echo
ok "Gateway is running. Your signed module is staged and awaiting commissioning."
echo
warn "ONE-TIME STEP on a fresh gateway: finish commissioning in the browser."
echo "   1. Open ${GATEWAY_URL}"
echo "   2. Step through the commissioning wizard. When it lists"
echo "      'Mustry Solutions Perspective Components', ACCEPT its certificate and"
echo "      license (8.3 accepts third-party modules right in the wizard)."
echo "   3. Finish the wizard / start the gateway."
echo "   4. Log in as ${ADMIN_USER} / ${ADMIN_PASS} and open Config -> Modules to"
echo "      see it Running."
echo
echo "   The accepted certificate persists in the gateway data volume, so this is"
echo "   only needed once (and again after 'teardown.sh --purge'). The dev cert is"
echo "   stable across rebuilds, so ops/deploy.sh reloads new builds with no prompt."
echo
echo "   Tail logs:        ops/logs.sh"
echo "   Redeploy changes: ops/deploy.sh"
echo "   Tear it down:     ops/teardown.sh   (add --purge to wipe gateway data)"
