#!/usr/bin/env bash
# Tail the gateway's logs. Pass extra `docker compose logs` flags through if you like.
#
# Usage:
#   ops/logs.sh                Follow logs (Ctrl-C to stop).
#   ops/logs.sh --tail 200     Follow, starting from the last 200 lines.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

require_docker

if [[ "$#" -gt 0 ]]; then
  exec "${COMPOSE[@]}" logs "$@" gateway
else
  exec "${COMPOSE[@]}" logs -f --tail 100 gateway
fi
