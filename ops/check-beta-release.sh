#!/usr/bin/env bash
# Gate for a beta build (.github/workflows/release.yml). The release notes say the
# browser suite ran on this Ignition beta, so that has to be true of this commit:
#   1. the tag's SDK is the one ops/ignition-2027.env (and so CI) tests,
#   2. the advisory CI job passed on the commit. It isn't a required check and tags
#      don't trigger ci.yml, so nothing else stops a red commit from being tagged.
#
# Usage: ops/check-beta-release.sh <sdk> <commit sha> <publish: true|false>
# A dry run only warns about (2), so signing can be checked before CI finishes.
# Needs GH_TOKEN and GITHUB_REPOSITORY.
set -euo pipefail

sdk="$1"
sha="$2"
publish="$3"
job="E2E Ignition 2027 beta (advisory)"

env_file="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/ignition-2027.env"
tested_sdk="$(sed -n 's/^export ORG_GRADLE_PROJECT_ignitionSdkVersion=//p' "${env_file}")"
if [[ "${sdk}" != "${tested_sdk}" ]]; then
  echo "::error::Tag SDK ${sdk} is not the SDK CI tests (${tested_sdk}). Move ops/ignition-2027.env to ${sdk} in a PR, then tag a commit where the 2027 job passed."
  exit 1
fi

result="$(gh api --method GET "repos/${GITHUB_REPOSITORY}/commits/${sha}/check-runs" \
  -f check_name="${job}" \
  --jq '.check_runs[0] | if . == null then "not run" else (.conclusion // .status) end')"
if [[ "${result}" == "success" ]]; then
  echo "${job}: passed on ${sha}, testing ${tested_sdk}"
elif [[ "${publish}" == "true" ]]; then
  echo "::error::${job} is '${result}' on ${sha}. A beta build is only published from a commit where it passed."
  exit 1
else
  echo "::warning::${job} is '${result}' on ${sha}. A real tag on this commit would stop here."
fi
