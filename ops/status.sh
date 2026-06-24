#!/usr/bin/env bash
# Show the local gateway's container status, health, and connection info.
#
# Usage: ops/status.sh

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

require_docker

info "Container status:"
"${COMPOSE[@]}" ps

echo
info "Gateway StatusPing (${GATEWAY_URL}/StatusPing):"
if curl -fsS "${GATEWAY_URL}/StatusPing" 2>/dev/null; then
  echo
  ok "Gateway is reachable."
  echo "   URL:    ${GATEWAY_URL}"
  echo "   Login:  ${ADMIN_USER} / ${ADMIN_PASS}"
  echo "   Module: Config -> Modules"
else
  echo
  warn "Gateway not responding yet. If you just started it, give it a minute (see ops/logs.sh)."
fi

echo
info "Staged module file(s) in ops/modules:"
ls -1 "${MODULES_DIR}"/*.modl 2>/dev/null || echo "   (none staged — run ops/setup.sh or ops/deploy.sh)"
