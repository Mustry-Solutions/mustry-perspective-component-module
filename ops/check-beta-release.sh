#!/usr/bin/env bash
# Gate for a beta build (.github/workflows/release.yml). The release notes say the
# browser suite ran on this Ignition beta, so that has to be true of this commit:
#   1. the tag's SDK is the one ops/ignition-2027.env (and so CI) tests,
#   2. the commit is on main (the notes say a beta build ships what main holds),
#   3. the advisory CI job passed on the commit. It isn't a required check and tags
#      don't trigger ci.yml, so nothing else stops a red commit from being tagged,
#   4. the version is higher than every published beta build's: a beta build is
#      stamped plain X.Y.Z (RELEASING.md), so a gateway moving to this one has to
#      see a higher number, whichever Ignition beta each was built for.
#
# Usage: ops/check-beta-release.sh <sdk> <commit sha> <publish: true|false> <x.y.z>
# A dry run only warns about (2), (3) and (4), so signing can be checked on a branch
# or before CI finishes.
# Needs GH_TOKEN and GITHUB_REPOSITORY.
set -euo pipefail

sdk="$1"
sha="$2"
publish="$3"
version="$4"
job="E2E Ignition 2027 beta (advisory)"

env_file="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/ignition-2027.env"
tested_sdk="$(sed -n 's/^export ORG_GRADLE_PROJECT_ignitionSdkVersion=//p' "${env_file}")"
if [[ "${sdk}" != "${tested_sdk}" ]]; then
  echo "::error::Tag SDK ${sdk} is not the SDK CI tests (${tested_sdk}). Move ops/ignition-2027.env to ${sdk} in a PR, then tag a commit where the 2027 job passed."
  exit 1
fi

# Fails closed: a gh error ends the script (set -e) even on a dry run.
fail() {
  if [[ "${publish}" == "true" ]]; then echo "::error::$1"; exit 1; fi
  echo "::warning::$1 A real tag on this commit would stop here."
}

# Published releases only: a tag the gate refused never became a build anyone has.
# Their numbers are compared as X.Y.Z. The one published before beta builds were
# stamped plain (v0.9.1-ignition2027.2.0-beta1, module version 0.9.1.1) needs no
# special case: anything above 0.9.1 is at least 0.9.2, which is above 0.9.1.1.
highest="$(gh api --paginate "repos/${GITHUB_REPOSITORY}/releases" --jq '.[].tag_name' \
  | sed -nE 's/^v([0-9]+\.[0-9]+\.[0-9]+)-ignition.*/\1/p' \
  | sort -V | tail -n 1)"
if [[ -n "${highest}" ]]; then
  if [[ "${version}" == "${highest}" \
        || "$(printf '%s\n%s\n' "${version}" "${highest}" | sort -V | tail -n 1)" != "${version}" ]]; then
    fail "Version ${version} is not higher than the latest published beta build (${highest}). Use a higher X.Y.Z: main's fallback version in build.gradle.kts, bumped after each beta build (RELEASING.md)."
  fi
fi

on_main="$(gh api "repos/${GITHUB_REPOSITORY}/compare/main...${sha}" --jq '.status')"
if [[ "${on_main}" != "identical" && "${on_main}" != "behind" ]]; then
  fail "${sha} is not on main (${on_main}). Tag a commit on main."
fi

# Only github-actions (app 15368) runs, so no other app can post a passing check
# under this name. The default filter=latest keeps the newest attempt of each
# workflow run, so a passing re-run replaces a flaky failure. A commit can still
# carry one run per workflow run (push and PR), and every one of them must pass.
result="$(gh api --method GET "repos/${GITHUB_REPOSITORY}/commits/${sha}/check-runs" \
  -f check_name="${job}" -f app_id=15368 \
  --jq '[.check_runs[] | .conclusion // .status]
        | if length == 0 then "not run"
          elif all(. == "success") then "success"
          else (map(select(. != "success")) | first) end')"
if [[ "${result}" == "success" ]]; then
  echo "${job}: passed on ${sha}, testing ${tested_sdk}"
else
  fail "${job} is '${result}' on ${sha}. If it's still queued or running, wait for it to pass, then re-run this Release workflow run: the tag can stay. If it failed, fix main and tag a new commit."
fi
