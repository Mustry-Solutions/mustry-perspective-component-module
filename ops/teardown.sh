#!/usr/bin/env bash
# Stop and remove the local gateway container.
#
# Usage:
#   ops/teardown.sh           Stop the gateway, KEEP its data volume (fast restart later).
#   ops/teardown.sh --purge   Also delete the gateway data volume for a completely clean slate.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

require_docker

PURGE=0
if [[ "${1:-}" == "--purge" ]]; then
  PURGE=1
fi

if [[ "${PURGE}" -eq 1 ]]; then
  warn "Tearing down the gateway AND deleting its data volume (full reset)..."
  "${COMPOSE[@]}" down --volumes
  ok "Gateway and data volume removed. Next 'ops/setup.sh' starts from scratch."
else
  info "Stopping and removing the gateway container (data volume preserved)..."
  "${COMPOSE[@]}" down
  ok "Gateway stopped. Data volume kept; 'ops/setup.sh' will resume with existing state."
fi
