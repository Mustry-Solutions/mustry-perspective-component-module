#!/usr/bin/env bash
# Schema guard: fail when a published prop key was REMOVED or RENAMED in any
# component props.json, compared to a base git ref. Perspective serializes prop
# VALUES into saved views, so removing/renaming a schema key silently resets that
# setting in every existing view — an additive-only policy is the contract.
#
# Usage: ops/schema-guard.sh [base-ref]     (default: HEAD^)
# New keys are fine; removals fail with the offending paths listed.
set -euo pipefail
cd "$(dirname "$0")/.."

BASE_REF="${1:-HEAD^}"
SCHEMAS=(common/src/main/resources/*.props.json)
FAIL=0

paths_of() {
    # All property key paths of a schema JSON on stdin, one per line.
    python3 -c '
import json, sys

def walk(node, prefix):
    if not isinstance(node, dict):
        return
    props = node.get("properties")
    if isinstance(props, dict):
        for k, v in props.items():
            p = f"{prefix}.{k}" if prefix else k
            print(p)
            walk(v, p)
    items = node.get("items")
    if isinstance(items, dict):
        walk(items, prefix + "[]")

walk(json.load(sys.stdin), "")
'
}

for schema in "${SCHEMAS[@]}"; do
    if ! git cat-file -e "$BASE_REF:$schema" 2>/dev/null; then
        continue   # schema didn't exist at the base ref (new component)
    fi
    removed=$(comm -23 \
        <(git show "$BASE_REF:$schema" | paths_of | sort) \
        <(paths_of < "$schema" | sort))
    if [[ -n "$removed" ]]; then
        echo "SCHEMA GUARD: keys removed/renamed in $schema (vs $BASE_REF):" >&2
        echo "$removed" | sed 's/^/  - /' >&2
        FAIL=1
    fi
done

if [[ $FAIL -ne 0 ]]; then
    echo "" >&2
    echo "Published prop keys must not be removed or renamed (existing views would" >&2
    echo "silently reset). Add new keys instead, or if this is intentional pre-1.0" >&2
    echo "breakage, re-run with an explicit base ref acknowledging it." >&2
    exit 1
fi
echo "schema-guard: OK (no removed keys vs $BASE_REF)"
