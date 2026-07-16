# CLAUDE.md

Ignition 8.3 Perspective module: five custom components (date/time range picker,
calendar/scheduler, resource timeline, data grid, pan & zoom view). React 16
class components + TypeScript (full strict) on the web side; Java scopes for
gateway/designer registration. See README.md for the component reference.

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
```

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
