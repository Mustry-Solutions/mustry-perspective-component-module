#!/usr/bin/env bash
# Shared helpers for the ops/ scripts. Sourced by the other scripts; not run directly.

set -euo pipefail

# Resolve key paths relative to this file, so scripts work from any directory.
OPS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${OPS_DIR}/.." && pwd)"
MODULES_DIR="${OPS_DIR}/modules"

# Local self-signed signing material for development (gitignored). On a fresh
# gateway the certificate is accepted either once in the commissioning wizard
# (setup.sh) or unattended by seeding data/modules.json (accept_staged_module,
# used by e2e.sh --fresh / CI). These are throwaway dev creds.
SIGNING_DIR="${OPS_DIR}/signing"
KEYSTORE_FILE="${SIGNING_DIR}/dev-keystore.p12"
CERT_FILE="${SIGNING_DIR}/dev-cert.pem"
CERT_ALIAS="mspc-dev"
SIGNING_PASS="devpassword"
SIGNING_DNAME="CN=Mustry Solutions (Dev), O=Mustry Solutions, C=BE"

# Must match MODULE_ID in common/.../MustrySolutionsPerspectiveComponentsModule.java.
MODULE_ID="com.mustrysolutions.perspective.components.MustrySolutionsPerspectiveComponents"
CONTAINER_NAME="mspc-ignition"

# Use Java 17 for Gradle (matches the module's toolchain).
JAVA_17_HOME="/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home"
if [[ -d "${JAVA_17_HOME}" ]]; then
  export JAVA_HOME="${JAVA_17_HOME}"
fi

# Read host port overrides from .env (if present) so the printed URL matches compose.
if [[ -f "${PROJECT_ROOT}/.env" ]]; then
  # shellcheck disable=SC1091
  set -a; source "${PROJECT_ROOT}/.env"; set +a
fi
GATEWAY_HTTP_PORT="${GATEWAY_HTTP_PORT:-9088}"
GATEWAY_URL="http://localhost:${GATEWAY_HTTP_PORT}"
ADMIN_USER="admin"
ADMIN_PASS="password"

# docker compose invocation, always pointed at this project's compose file.
COMPOSE=(docker compose -f "${PROJECT_ROOT}/docker-compose.yml")

# --- pretty logging -------------------------------------------------------
if [[ -t 1 ]]; then
  C_BLUE=$'\033[34m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'; C_RESET=$'\033[0m'
else
  C_BLUE=""; C_GREEN=""; C_YELLOW=""; C_RED=""; C_RESET=""
fi
info()  { echo "${C_BLUE}==>${C_RESET} $*"; }
ok()    { echo "${C_GREEN}✓${C_RESET} $*"; }
warn()  { echo "${C_YELLOW}!${C_RESET} $*"; }
err()   { echo "${C_RED}✗${C_RESET} $*" >&2; }

# --- guards ---------------------------------------------------------------
require_docker() {
  if ! docker info >/dev/null 2>&1; then
    err "Docker does not appear to be running. Start Docker Desktop and try again."
    exit 1
  fi
}

# --- signing --------------------------------------------------------------
# Generate a local self-signed keystore + exported certificate the first time,
# so the module can be signed for the dev gateway. Throwaway dev credentials.
ensure_dev_keystore() {
  if [[ -f "${KEYSTORE_FILE}" && -f "${CERT_FILE}" ]]; then
    return 0
  fi
  local keytool="${JAVA_HOME:-}/bin/keytool"
  [[ -x "${keytool}" ]] || keytool="keytool"
  info "Generating a self-signed dev signing keystore (first time only)..."
  mkdir -p "${SIGNING_DIR}"
  "${keytool}" -genkeypair \
    -alias "${CERT_ALIAS}" \
    -keyalg RSA -keysize 2048 \
    -validity 3650 \
    -dname "${SIGNING_DNAME}" \
    -keystore "${KEYSTORE_FILE}" -storetype PKCS12 \
    -storepass "${SIGNING_PASS}"
  "${keytool}" -exportcert \
    -alias "${CERT_ALIAS}" \
    -keystore "${KEYSTORE_FILE}" -storetype PKCS12 \
    -storepass "${SIGNING_PASS}" \
    -rfc -file "${CERT_FILE}"
  ok "Created dev keystore at ops/signing/ (gitignored)."
}

# --- build & stage --------------------------------------------------------
# Build the module (signed with the local dev cert) and copy the freshly built
# .modl into ops/modules so the gateway can pick it up.
build_and_stage_module() {
  ensure_dev_keystore
  info "Building and signing the module with Gradle (first build downloads dependencies)..."
  # `clean` so the signed .modl is produced fresh and never confused with a stale
  # unsigned artifact. This module is small, so a clean build is quick.
  ( cd "${PROJECT_ROOT}" && ./gradlew clean build --console plain \
      -Dorg.gradle.java.installations.auto-download=false \
      -Pignition.signing.keystoreFile="${KEYSTORE_FILE}" \
      -Pignition.signing.keystorePassword="${SIGNING_PASS}" \
      -Pignition.signing.certFile="${CERT_FILE}" \
      -Pignition.signing.certAlias="${CERT_ALIAS}" \
      -Pignition.signing.certPassword="${SIGNING_PASS}" )

  # Select the SIGNED module, not the `.unsigned.modl` signing intermediate.
  local modl
  modl="$(find "${PROJECT_ROOT}/build" -maxdepth 1 -name '*.modl' ! -name '*.unsigned.modl' | head -1)"
  if [[ -z "${modl}" ]]; then
    err "No signed .modl found under build/ after the build. Aborting."
    exit 1
  fi

  mkdir -p "${MODULES_DIR}"
  # Clear old copies so only the current build is staged.
  rm -f "${MODULES_DIR}"/*.modl 2>/dev/null || true
  cp "${modl}" "${MODULES_DIR}/"
  ok "Staged $(basename "${modl}") -> ops/modules/"
}

# --- wait for gateway -----------------------------------------------------
# Poll the gateway's StatusPing endpoint until it reports RUNNING (or time out).
wait_for_gateway() {
  local tries="${1:-60}"
  info "Waiting for the gateway to come up at ${GATEWAY_URL} ..."
  for ((i = 1; i <= tries; i++)); do
    if curl -fsS "${GATEWAY_URL}/StatusPing" 2>/dev/null | grep -q '"state"'; then
      ok "Gateway is responding."
      return 0
    fi
    sleep 5
  done
  warn "Gateway did not report ready after $((tries * 5))s. Check 'ops/logs.sh'."
  return 1
}

# Stricter: wait until the gateway is RUNNING with no COMMISSIONING/FAULTED
# detail, i.e. fully commissioned and serving.
wait_for_commissioned() {
  local tries="${1:-60}"
  info "Waiting for the gateway to be commissioned and RUNNING ..."
  for ((i = 1; i <= tries; i++)); do
    if [[ "$(curl -fsS "${GATEWAY_URL}/StatusPing" 2>/dev/null)" == '{"state":"RUNNING"}' ]]; then
      ok "Gateway is commissioned and running."
      return 0
    fi
    sleep 5
  done
  err "Gateway did not reach a clean RUNNING state after $((tries * 5))s. Check 'ops/logs.sh'."
  return 1
}

# --- fresh-volume fix -------------------------------------------------------
# Docker creates the verify bind-mount's parent path (data/projects/) as root
# inside a brand-new volume, and the gateway then faults with "unable to create
# resource dir: .../projects/.resources". Hand the directory to the ignition
# user and bounce the gateway once so it starts clean. Idempotent — a no-op
# restart on an already-correct volume.
fix_projects_ownership() {
  if ! "${COMPOSE[@]}" exec -T -u root gateway \
          stat -c '%U' /usr/local/bin/ignition/data/projects 2>/dev/null | grep -q ignition; then
    info "Fresh volume: fixing data/projects ownership for the ignition user..."
    "${COMPOSE[@]}" exec -T -u root gateway \
        chown ignition:ignition /usr/local/bin/ignition/data/projects
    "${COMPOSE[@]}" restart gateway
  fi
}

# Wait until the gateway has written its module registry (data/modules.json
# with the built-ins' cert fingerprints). On a fresh volume this happens while
# the gateway parks in COMMISSIONING over the staged-but-unaccepted module —
# it's the point where accept_staged_module can safely merge.
wait_for_modules_registry() {
  local tries="${1:-60}"
  info "Waiting for the gateway to write its module registry ..."
  for ((i = 1; i <= tries; i++)); do
    if docker exec "${CONTAINER_NAME}" \
         grep -q certFingerprint /usr/local/bin/ignition/data/modules.json 2>/dev/null; then
      ok "Module registry present."
      return 0
    fi
    sleep 5
  done
  err "Gateway never wrote data/modules.json after $((tries * 5))s. Check 'ops/logs.sh'."
  return 1
}

# --- unattended module acceptance ------------------------------------------
# Pre-accept the staged module's signing certificate on an already-commissioned
# gateway, with no browser wizard. Ignition 8.3 records third-party acceptance
# in data/modules.json as {filename, onStartup, certFingerprint(sha1 of the
# signing cert)}; the gateway treats that file as authoritative, so we merge our
# entry into the gateway-written file (never replace it — it also carries every
# built-in module). Requires python3 (same dependency as ops/schema-guard.sh).
accept_staged_module() {
  local modl fingerprint tmp
  modl="$(find "${MODULES_DIR}" -maxdepth 1 -name '*.modl' | head -1)"
  [[ -n "${modl}" ]] || { err "No staged .modl in ops/modules."; return 1; }
  fingerprint="$(openssl x509 -in "${CERT_FILE}" -noout -fingerprint -sha1 \
                   | cut -d= -f2 | tr -d ':' | tr '[:upper:]' '[:lower:]')"
  [[ -n "${fingerprint}" ]] || { err "Could not fingerprint ${CERT_FILE}."; return 1; }

  info "Pre-accepting the module certificate (fingerprint ${fingerprint})..."
  "${COMPOSE[@]}" stop gateway
  tmp="$(mktemp -d)"
  docker cp "${CONTAINER_NAME}:/usr/local/bin/ignition/data/modules.json" "${tmp}/modules.json"
  MODULE_ID="${MODULE_ID}" MODL_NAME="$(basename "${modl}")" FINGERPRINT="${fingerprint}" \
  python3 - "${tmp}/modules.json" <<'EOF'
import json, os, sys
path = sys.argv[1]
with open(path) as f:
    modules = json.load(f)
modules[os.environ["MODULE_ID"]] = {
    "filename": f"/external-modules/{os.environ['MODL_NAME']}",
    "onStartup": "enabled",
    "certFingerprint": os.environ["FINGERPRINT"],
}
with open(path, "w") as f:
    json.dump(modules, f, indent=2)
EOF
  docker cp "${tmp}/modules.json" "${CONTAINER_NAME}:/usr/local/bin/ignition/data/modules.json"
  rm -rf "${tmp}"
  "${COMPOSE[@]}" start gateway
  ok "Module acceptance seeded; gateway restarting."
}
