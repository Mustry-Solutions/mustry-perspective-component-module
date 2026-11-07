# Security Policy

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues,
discussions, or pull requests.**

Instead, use one of these private channels:

- **GitHub Private Vulnerability Reporting** — on this repository, go to the
  **Security** tab → **Report a vulnerability** (preferred).
- **Email** — `hello@mustrysolutions.com` with the details below.

Please include:

- the affected component(s) and module version,
- the Ignition gateway version and platform,
- a description of the issue and its impact,
- steps to reproduce (a minimal Perspective view or script if possible).

We aim to acknowledge reports within a few business days, keep you updated on
remediation, and credit you (if you wish) once a fix ships.

## Scope

This module is UI-layer Perspective components. Note that the admin-family
components (User / Roster / Schedule / Holiday managers) are **UI only**, and
every write has to be authorized in the event script on the gateway: a security
level limits who can open a page, but any session on that page can still send a
crafted event. See "Capability flags are not security" in the README. Their
password and role-catalog features are opt-in flags. Misconfiguration of gateway security
is outside the scope of this policy, but we're happy to advise.

## Supported versions

Pre-1.0, fixes land on the latest release line. Please test against the most
recent release before reporting.
