#!/usr/bin/env bash
# Shared helpers for the ops/ scripts. Sourced by the other scripts; not run directly.

set -euo pipefail

# Resolve key paths relative to this file, so scripts work from any directory.
OPS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${OPS_DIR}/.." && pwd)"
MODULES_DIR="${OPS_DIR}/modules"

# Local self-signed signing material for development (gitignored). The gateway is
# told to auto-accept this module's certificate (ACCEPT_MODULE_CERTS in compose),
# so a signed dev build loads with no manual steps. These are throwaway dev creds.
SIGNING_DIR="${OPS_DIR}/signing"
KEYSTORE_FILE="${SIGNING_DIR}/dev-keystore.p12"
CERT_FILE="${SIGNING_DIR}/dev-cert.pem"
CERT_ALIAS="mspc-dev"
SIGNING_PASS="devpassword"
SIGNING_DNAME="CN=Mustry Solutions (Dev), O=Mustry Solutions, C=BE"

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
