# Editable Data Grid — component plan

**Status (2026-07-06): M0 + M1 core built and live-verified** (virtualized grid
with sticky header + frozen columns; header-click sort, quick filter,
multi-select with Ctrl/Shift, CSV export of the view — all two-way via
`state.*`). Still to come from M1: column resize/reorder/hide, typed
formatting, conditional styling. Fourth component of the module:
`mustrysolutions.input.datagrid`. Remaining decisions are proposals to settle
with Sam; change them here first if they change.

## What & why

Excel-like editable grid: cell editing with validation, per-column edit
permissions, DB write-back, frozen (pinned) columns, sorting/filtering —
the **largest remaining demand** in [`component-ideas.md`](component-ideas.md)
(biggest raw IA-forum thread volume; native Table edits "hit limits fast":
no per-column edit control, weak validation, awkward write-back).

V1 design driver: **trustworthy write-back editing** — the operator edits a
cell, the value is validated, the author persists it with one event handler,
and nothing is ever silently lost. Same "controlled component, one change
event" philosophy as the calendar/timeline `onChange` contract.

## Build approach: custom (settled 2026-07-06)

**No third-party grid wrap** — Sam's explicit call, consistent with the
calendar and timeline (both planned as library wraps, both built custom).
Full control over theming, label packs, the config/data/state/output
contract, bundle size and pure-logic testability; no license ceilings
(researched for the record: AG-Grid row grouping / server-side rows /
range clipboard are Enterprise-only anyway).

Libraries are referenced only as UX yardsticks. The three expensive
custom pieces, called out so milestones respect them: **row
virtualization**, the **Excel-grade keyboard grid model** (Enter/Tab
commit-and-move, F2/type-to-edit, arrow navigation — doubles as the
module-wide arrow-key a11y pattern the other components still lack), and
**multi-cell paste** parsing (shares ground with `shared/csv.ts`).

## Feature expectations (researched 2026-07-06)

Tiered from IA forum threads, Canny ideas and native-Table gap analysis —
see component-ideas.md sources plus the frozen-columns Canny idea, the
dropdown-in-cell thread cluster, and the multi-row delete how-to genre.

- **T1 — assumed table basics:** sort, per-column filter + quick search,
  column resize/reorder/hide, frozen columns + sticky header, row
  virtualization, usable multi-select (array out, two-way), per-column
  number/date/locale formatting, conditional cell/row styling by value,
  CSV export, loading + empty states.
- **T2 — the editing core (native Table's failure zone):** typed editors
  (text, number min/max/step, checkbox, date, **dropdown-in-cell**),
  per-column + conditional per-row/cell editability, declarative
  validation before commit (visible error, Escape reverts), the
  `onCellEdit` write-back contract, add/delete row(s), Excel keyboard
  model.
- **T3 — spreadsheet feel (differentiators):** batch mode (dirty tracking
  + Save/Discard + dirty count), multi-cell paste from Excel, row
  copy/paste, fill-down, aggregate footer, section grouping (timeline
  pattern), column layout as two-way state.
- **T4 — Ignition-specific:** dataset AND array-of-objects binding,
  documented named-query write-back recipe, touch-friendly editors,
  light/dark theming, 7-language labels, role-driven editability via
  session props.
- **Out of scope:** pivot, formulas, master/detail, xlsx export,
  server-side paging.

## Settled decisions (proposed)

1. **Client-side row model only**, documented for ≤ ~50k rows (virtualized
   rendering, but all rows in the prop). The house windowed-binding recipe
   (`output.visibleStart/End`) doesn't apply; instead document
   filter-at-the-query pattern + `config.loading` stale-while-revalidate.
2. **Sections follow the house contract**: `config` (columns, options,
   permissions), `data` (rows), `state` (two-way: selection, sort, filter,
   column widths/order), `output` (read-only: derived counts), plus events.
3. **Rows are arrays of objects** with a mandatory `idField` (default `id`)
   — the write-back contract needs stable row identity. Dataset bindings
   documented via the standard dataset→JSON transform.
4. **Write-back contract (the centerpiece)** — `onCellEdit` fires
   `{rowId, field, oldValue, newValue, row}` after client-side validation
   passes; the grid renders the new value optimistically but the prop data
   stays the source of truth (author persists + rebinds, calendar-style).
   A `config.editMode: 'cell'` ships in v1; `'batch'` (dirty tracking +
   Save/Discard + `output.dirtyCount`) is designed into the contract but
   built in a later milestone.
5. **Columns** (`config.columns[]`): `{field, header, type: text|number|
   boolean|date|select, width, pinned, editable, required, min, max,
   pattern, options[], format}`. `editable` accepts a boolean now; a
   per-row/per-cell hook is a later milestone (needs a scripting story).
6. **Validation is declarative in v1** (required/min/max/pattern/options);
   invalid input never fires `onCellEdit` — the cell shows the localized
   error and reverts on Escape.
7. **Reuse the module's stack**: 7-language label packs (grid UI text),
   `--dg-*` CSS variables off the Perspective theme vars (light/dark
   verified live), pure logic in `gridLogic.ts` + Jest, live verification
   via a `/grid` route with an evergreen demo + write-back script,
   manual-test checklist.

## Milestones (custom build)

- **M0 — skeleton + virtualization:** themed read-only grid on `/grid`
  (columns from config, sticky header, frozen columns, row
  virtualization); the layout/geometry lives in pure `gridLogic.ts` with
  Jest coverage; light + dark verified live.
- **M1 — T1 complete:** sort, filter + quick search, column
  resize/reorder/hide with layout in two-way `state`, multi-select,
  formatting, conditional styling, CSV export, loading/empty states,
  label packs.
- **M2 — T2 editing core:** typed editors incl. dropdown-in-cell,
  editability rules, declarative validation, the `onCellEdit` contract +
  evergreen write-back demo, add/delete rows, the keyboard grid model.
- **M3 — T3 spreadsheet feel:** batch mode, Excel range paste, fill-down,
  aggregate footer, section grouping.
- **Later:** row subviews/expandable detail, pagination mode, per-cell
  editability scripting hook.

## Risks

- **Scope** — a custom grid is the biggest build yet (bigger than the
  timeline); the tier cut and milestone gates above are the control.
- **Virtualization correctness** — editing + virtualization interact
  (editor must survive scroll); M0 builds virtualization first for this
  reason.
- **Keyboard/IME edge cases** — type-to-edit and composition input need
  real-hardware passes (joins the standing touch-verification item).
- **IA native-Table erosion** — IA keeps improving Table; the moat is
  T2+T3 (validation, dropdown editors, batch, paste), so M2 ships first
  and fast.
