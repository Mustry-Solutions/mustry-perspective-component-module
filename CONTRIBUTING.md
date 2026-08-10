# Contributing

Thanks for your interest in improving **Mustry Perspective Components**! This
guide covers how to build, test, and submit changes.

## Ground rules

- Be respectful — see our [Code of Conduct](CODE_OF_CONDUCT.md).
- By contributing you agree your work is licensed under the repository's
  [Apache-2.0 License](LICENSE), and you certify the **Developer Certificate
  of Origin** (below).
- Found a security issue? **Do not** open a public issue — see
  [SECURITY.md](SECURITY.md).

## Developer Certificate of Origin (DCO)

We use the [DCO](https://developercertificate.org/) instead of a CLA. Every
commit must be signed off, certifying you wrote the code (or have the right to
submit it) under the project license:

```
git commit -s -m "Your message"
```

This appends a `Signed-off-by: Your Name <you@example.com>` line. Set your git
`user.name`/`user.email` to a real identity.

## Prerequisites

- **JDK 17** (Temurin), **Node 18+**, **Docker** (for the local dev gateway).
- The module builds with Gradle (`io.ia.sdk.modl`); the web components are
  React/TypeScript under `web/`.

## Build & test

```bash
./gradlew build          # compiles Java + web, runs jest + the schema guard
cd web && npx tsc --noEmit && npx jest   # web-only fast loop
```

End-to-end tests run against a real Ignition gateway in Docker:

```bash
ops/e2e.sh --fresh       # teardown + fresh gateway + full Playwright suite
ops/e2e.sh --no-deploy tests/branching.spec.ts   # one spec, reusing the gateway
```

See [`ops/README.md`](ops/README.md) for the dev-gateway lifecycle.

## Pull request flow

1. Branch off `main` (`feature/…`, `fix/…`, `docs/…`).
2. Make your change **with tests** (jest for pure logic, Playwright for
   rendered behavior) and a `CHANGELOG.md` entry under `## [Unreleased]`.
3. Open a PR. The two required checks — **Build & test** and
   **E2E smoke (Playwright)** — must pass, and commits must be DCO-signed.
4. A maintainer squash-merges. `main` is always releasable.

## Conventions

- **Additive-only prop schemas.** Perspective bakes prop values into saved
  views, so a removed/renamed `*.props.json` key silently resets that setting
  in every existing view. The CI **schema guard** enforces this; deliberate
  pre-1.0 breakage is acknowledged in `ops/schema-guard-acknowledged.txt`.
- **Pure logic separate from the DOM.** Layout/parse logic lives in
  node-tested `*Logic.ts` / reducers; React shells stay thin.
- Match the surrounding code style; keep components controlled (events out,
  no mutation of bound `data.*`).
- User-facing text ships in the module's built-in language packs — add all
  supported languages when you touch labels.

## Releasing

Maintainers only — tag-driven, see [`RELEASING.md`](RELEASING.md).
