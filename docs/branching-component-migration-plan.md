# Branching Component — migration plan (from ignition-mustry-ui)

**Status (2026-08-04): PLANNING — nothing migrated.** Source repo:
`github.com/Mustry-Solutions/ignition-mustry-ui`. Despite its "Mustry UI /
compilation of components" framing, that repo ships **exactly one**
registered Perspective component — the **Branching Component**
(`mustryui.display.branching`), a left-to-right decision-tree / flow-path
diagram — plus four internal presentational children (Node, Connection,
Icon, InfoCard). Surveyed 2026-08-04; decisions below are proposals to
settle with Sam.

## What it is & why migrate it

A directed tree laid out horizontally from a flat node array (`id`,
`category`, `nextId[]`, colour, icon, name, markdown tooltip): BFS layout
with category→row mapping, duplicate-node forward-pushing, SVG connector
routing, width-responsive re-layout, Ignition `IconRenderer` icons and
markdown info-cards. **No overlap** with any of our thirteen components —
it lands next to Pan & Zoom in the display family and answers the
"React-Flow-style node graph" demand noted in `component-ideas.md`
(read-only half of it). The layout algorithm (~250 lines) is the real
asset: non-trivial and already solved.

**Working id after migration:** `mustrysolutions.perspective.display.branching`,
display name **"Branching Diagram"**, dir `web/typescript/components/branching/`.

## What migrates, what doesn't

- **Migrate**: the five component sources (as one unit), the layout
  algorithm, `doc/data_structure.md` (seed for our data-shape docs), the
  props.json content *as reference only*.
- **Drop**: the entire module scaffolding (hooks/gradle — ours already does
  it all; their gateway hook is registration-only, nothing to port), the
  `dev_react/` CRA sandbox (duplicate source; our verify project replaces
  it), dead code (commented old `render()`, sprite-sheet icon remnants,
  stale tsconfig include), the unused `connectionColor` prop, the stale
  branches (`dev_module`, `develop`, `feature/merge_dev_react` — diff the
  last one for stragglers before archiving the repo).

## The five known frictions (from the survey) and their resolutions

1. **React 18 → 16**: source is React 18.3; we pin React 16.14. The only
   hard 18 dependency is `react-markdown@9` (info-card tooltips). Resolve
   by rendering tooltips with a React-16-compatible markdown path — either
   an older react-markdown major or reusing our rich-text machinery for
   read-only markdown. Class component core ports cleanly; the four
   function children are version-agnostic.
2. **perspective-client drift**: they pin `^2.1.16`; verify `IconRenderer`,
   `store.element`, `emit()` against our pin during M0 (compile-time
   breaks, not silent ones).
3. **Unprefixed global CSS** (`node`, `name`, `icon`, `nodeTree`, …):
   rename wholesale to `mustry-branch-*` on the way in; add `--brn-*`
   theme variables with Perspective-theme fallbacks per house convention
   (their styling is hardcoded-colour inline today).
4. **No pure-logic layer**: extract `buildTree` / `displayTree` /
   `convertInput` / root detection into `branchingLogic.ts` (pure,
   node-tested — the algorithm is self-contained and nearly pure already).
   This is the bulk of the port and the reason it's a rewrite-in, not a
   copy-in.
5. **Schema rework**: their schema is flat, drifted (phantom-required
   `rootId` that code no longer reads; `nodeBorderWidth` read but
   undeclared; `data` untyped) and event-less. Rewrite into our
   `config` / `data` / `state` / `output` sections: node fields documented
   in an open item schema, `config` for layout knobs (offsets, curve,
   node size, line width), and add the controlled-component surface it
   lacks today — `onNodeClick {id, node}` at minimum, `state.selectedNode`
   (two-way) + `output.count` to match family conventions. 7-language
   label pack (few strings — likely just empty-state + tooltip
   affordances).

## Milestones

- **M0 — port & render (go/no-go)**: extract the pure layout into
  `branchingLogic.ts` with jest coverage ported from the algorithm's
  behavior (roots, BFS levels, duplicate forwarding, connector midpoints);
  class shell + four children under our React 16/strict TS; CSS
  namespaced; schema rewritten; registered in all four places; demo view
  `/branching` with a seeded decision-tree; renders in the verify project.
- **M1 — house polish**: `onNodeClick` + `state.selectedNode`, `--brn-*`
  theming light/dark, label pack, docSync CONTRACT row, e2e spec
  (render + node click + selection write-back), README section + manual
  chapter, changelog.
- **M2 (optional, demand-driven)**: pan/zoom the canvas by composing with
  our Pan & Zoom View (document the recipe rather than re-implementing),
  markdown tooltip parity decision, editable/interactive graph — explicitly
  out of scope until asked (that's the React-Flow-sized product).

## Risks

- The React-16 markdown swap is the only piece with real unknowns; if no
  acceptable React-16 renderer exists, tooltips fall back to plain text in
  M0 and markdown becomes an M1 decision.
- Source has **zero tests** — the extracted logic tests are written from
  observed behavior; goldens should be captured from the live source
  component before porting (run their module once, snapshot layouts for
  2-3 seed trees).
- After migration, archive `ignition-mustry-ui` (README pointer to this
  repo) so two copies never drift — the fate its own `dev_react/`
  duplicate demonstrates.

## Estimate

M0 ≈ 1–2 days, M1 ≈ 1 day, given the algorithm arrives solved and our
scaffolding (registration, demo, e2e, labels, theming) is pattern-stamped
by now.
