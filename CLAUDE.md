# CLAUDE.md

Ignition 8.3 Perspective module: nine custom components (date/time range
picker, calendar/scheduler, resource timeline, data grid, pan & zoom view, rich
text editor, code/JSON editor, colour picker, on-screen keyboard). React 16
class components + TypeScript (full strict) on the web side; Java scopes for
gateway/designer registration. See README.md for the component reference.

## Source-control workflow — READ FIRST

**Never commit or push to `main` directly. All changes go through a pull request.**

1. Branch off `main` (`git switch -c area/short-name`).
2. Commit logical chunks; push the branch.
3. Open a PR. Both CI checks — **Build & test** and **E2E smoke (Playwright)** —
   must pass.
4. Squash-merge into `main`, delete the branch.

This is **convention, not enforced** — the repo is private on a free plan, where
GitHub gates branch protection/rulesets behind Pro (the owner has deferred
paying). Because nothing *stops* a direct push, the discipline is on you: follow
it anyway. `main` must always stay releasable.

Verify before opening the PR: `cd web && npx tsc --noEmit && npm test`, and
`ops/e2e.sh --fresh` for anything with a runtime surface.

## Releases (tag-driven)

Cutting a release is: bump `CHANGELOG.md` (`[Unreleased]` → `[X.Y.Z] - date`) in
a normal PR, merge, then tag the merge commit `vX.Y.Z` and push the tag. The
**Release** workflow (`.github/workflows/release.yml`) derives the version from
the tag, builds + **signs** the `.modl` (from Actions secrets), and publishes a
GitHub Release. Full detail + the five signing-secret names in `RELEASING.md`.
Never commit keystores/certs (`signing/`, `*.p12`, `*.jks` are git-ignored).

## Build & test

```bash
./gradlew build          # full module (.modl): prod webpack bundle + jest + Java
./gradlew build -PwebDev # unminified web bundle with source maps (debugging)
cd web && npm test       # jest only (pure-logic suites, node env — no DOM)
cd web && npx tsc --noEmit
```

## Dev gateway & verification

```bash
ops/e2e.sh --fresh   # recreate the gateway UNATTENDED (no wizard, fresh 2h trial)
                     # + run the Playwright suite. Also the fix for an expired trial.
ops/deploy.sh        # rebuild + reload into the running gateway
ops/e2e.sh           # deploy + full e2e suite (18 tests, real Perspective sessions)
ops/e2e.sh --no-deploy tests/grid.spec.ts   # quick re-run against what's deployed
ops/demo.sh [--fresh]   # sales demo ("Mustry Bottling Co.", ops/demo/) — every
                        # component in one story-driven app; see ops/demo/README.md
```

The demo project's views are committed JSON generated data-free: they seed
`session.custom.demo` relative to "today" on session start. **Project-file
edits (ops/demo/, ops/verify/) are only read at gateway startup** on this
Docker-for-Mac setup — restart the gateway after editing them.

**Never call a component change done because the gateway returned 200.** Deploy
and render it: `ops/e2e.sh` at minimum; look at it in a browser session
(http://localhost:9088/data/perspective/client/verify + route per component)
when the change is visual. The verify project (`ops/verify/project/`) is
bind-mounted into the gateway — Designer saves write back into the repo.

## Architecture conventions

- **Three layers per component** (`web/typescript/components/<name>/`): pure
  `*Logic.ts`/`*Props.ts` (node-tested, no DOM), a gesture controller
  (DOM-facing, untested by design — keep it thin), and the class component
  composing presentational subcomponents (`MonthView`, `TimelineTrack`,
  `GridCells`, …). New render code goes in subcomponents, not the class.
- **Drag gestures** extend `shared/dragGestureController.ts` (pointer capture,
  doc listeners, click-vs-drag threshold, cancel, commit dispatch). Subclasses
  contribute geometry only. Pan & zoom is deliberately separate (continuous
  multi-pointer, no preview/commit).
- **Labels/i18n**: per-component packs in `shared/labels/`, re-exported through
  `shared/labelPacks.ts`. `config.locale` picks the pack; `config.labels.*`
  overrides per key.
- **Component identity** must match in three places: `COMPONENT_ID` in the Java
  descriptor, `COMPONENT_TYPE` in the TSX, and registration in BOTH
  `common/.../comp/Components.ALL` (drives both hooks) and
  `web/typescript/index.ts`.

## Props schemas (common/src/main/resources/*.props.json)

- Sections: `config` (set-and-forget) / `data` (bound content) / `state`
  (two-way) / `output` (read-only). Everything locked with
  `additionalProperties: false` — except data-array ITEM schemas, which stay
  open (rows/events carry user fields).
- **Never put per-key defaults on label-like keys** — they materialize into
  views and shadow the code fallbacks/locale packs. Array defaults merge
  per-index. Old-module residue can survive redeploys: validate schema changes
  on a fresh gateway (`ops/e2e.sh --fresh`).
- Pre-1.0, breaking schema changes are sanctioned but never accidental:
  `ops/schema-guard.sh` (CI) flags removed/renamed keys; acknowledge deliberate
  breaks in `ops/schema-guard-acknowledged.txt`. Versioning/migration is
  deliberately deferred until real deployments exist (see README roadmap).

## Working agreements

- Commit style: `Area: what changed` + a body explaining why; logical chunks.
- Components are controlled: they never mutate their own bound data — gestures
  and editors fire events (`onChange`, `onCellEdit`, …) and the author's
  script persists. Demo views in the verify project ship reference scripts.
- Touch support is implemented but NOT yet verified on real hardware; the
  checklists in `docs/*-manual-test.md` are the script for that tablet session.
- `docs/component-ideas.md` is temporary (owner: Sam) — don't extend it.
