# Data Grid — manual test checklist

Hands-on checklist for the Data Grid (`mustrysolutions.perspective.input.datagrid`). The pure
logic (virtualization window, column layout, sort/filter, validation, paste plan,
aggregates) is unit-tested; this covers rendering, interaction and the write-back
contract. The committed demo at `/grid` (verify project) has everything enabled
with full write-back scripts (batch mode).

> Prop sections: `config` = set-and-forget, `data` = bound content, `state` =
> two-way runtime state (sort, quickFilter, selection, columnLayout — all
> pre-settable), `output` = read-only derived values (dirtyCount).

## Read-side (M0/M1)

- [ ] 2,500 rows scroll smoothly; the DOM holds only ~24 rows at any scroll
      position; the scrollbar reflects the full dataset; no blank flashes.
- [ ] The header sticks to the top; pinned columns (`column.pinned`) stick left
      under horizontal scroll, in both light and dark themes.
- [ ] **Sort**: header click cycles asc ▲ / desc ▼ / off; numeric strings sort as
      numbers; empty cells sort LAST in both directions; `state.sort` is two-way.
- [ ] **Quick filter** matches the DISPLAYED text of any column (localized dates,
      formatted numbers), shows a match count, and typing never loses keystrokes;
      `state.quickFilter` is two-way (debounced).
- [ ] **Selection** (`config.rowSelect`): single replaces, multi supports
      Ctrl/Cmd-toggle and Shift-range over the VISIBLE (filtered + sorted) order;
      "{n} selected" badge; `state.selection` (ids via `config.idField`) two-way.
- [ ] **Column layout**: drag a header to reorder (insertion indicator), drag its
      right edge to resize (live preview), hide/show via the toolbar chooser —
      all in two-way `state.columnLayout`, surviving re-renders; `config.columns`
      itself never changes.
- [ ] **Types**: number columns group + fix decimals per `config.locale` and
      right-align by default; `date` renders the wall date (never shifts a day
      across timezones); boolean shows ✓/— (a live checkbox when editable).
- [ ] **Conditional styles** (`column.cellStyles`): first matching rule wins
      (equals / gt+lt band / contains → color/background).
- [ ] **CSV export** downloads the CURRENT view (filtered + sorted, visible
      columns, displayed text), BOM + formula-injection guarded.
- [ ] Empty `data.rows` (not loading) → localized "No rows" badge
      (`emptyMessage` default follows the locale packs; '' hides it).

## Editing (M2)

- [ ] With `config.editable` off, nothing edits. On: double-click / Enter / F2 /
      type-to-edit opens the editor on columns whose `editable` isn't false.
- [ ] Editor types: text, number (decimal comma tolerated), date, datetime, and
      a real **dropdown** when `column.options` is set; boolean cells are live
      checkboxes committing on toggle.
- [ ] **Validation**: required / min / max / pattern / options — an invalid
      draft turns the editor red with a localized message and Enter does NOT
      commit; Escape reverts; blur commits-if-valid, reverts-if-not.
- [ ] **Keyboard**: arrows/PageUp/PageDown/Home/End move the focus ring
      (auto-scrolled into view, pinned-aware); Enter/Tab commit + move
      (Shift-Tab left); the cell keeps Excel muscle memory.
- [ ] **Cell mode** (`config.editMode: 'cell'`): each commit fires `onCellEdit`
      {rowId, field, oldValue, newValue, row}; the value shows italic + dot
      until the write-back rebinds `data.rows` with the matching value.
- [ ] `+` (config.allowAdd) fires `onRowAdd`; the trash (config.allowDelete)
      fires `onRowsDelete` for the selection and clears it.

## Batch mode + paste + aggregates (M3)

- [ ] `config.editMode: 'batch'`: commits accumulate (italic + dot,
      "{n} unsaved" badge, `output.dirtyCount`); **Save** fires ONE
      `onBatchSave` {edits, rows}; after the write-back rebinds, the overlays
      reconcile away; **Discard** reverts everything locally.
- [ ] **Excel paste**: copy a range in Excel/Sheets, focus a cell, paste — the
      matrix lands rightward/downward over visible columns, skipping
      non-editable columns and invalid values; in batch mode it accumulates,
      in cell mode it fires one `onCellEdit` per changed cell.
- [ ] **Aggregate footer** (`column.aggregate`): sum/avg/min/max/count over the
      CURRENT (filtered) view, sticky at the bottom, locale-formatted; empty
      cells are absent, not zero (avg/min unaffected by blanks).

## Stress (`/grid-stress`, 50,000 generated rows)

Fixture generates its rows per view load (5.6 KB committed — no repo bloat).
Measured 2026-07-06 on the dev gateway:

- [ ] Loads and renders (cold load ≈ 25–40 s: the ~6 MB initial props sync is
      the real cost at this size — see the plan's guidance). ~23 DOM rows at
      any position; scrollbar exact over 1.6 M px.
- [ ] Sort click over 50k: ~140 ms round-trip. Quick filter: ≤ 55 ms per
      keystroke (matches displayed text across 10 columns). Selection click:
      ~2 ms. Footer sum over 50k updates with the view.
- [ ] Filter while scrolled deep: the view renders the TAIL, never a blank
      grid (stale-scrollTop clamp).
- [ ] ⚠️ Known constraint: syncing the 6 MB payload in a BACKGROUND/throttled
      tab can drop the session websocket ("WebSocket disconnected" in the
      gateway log) and stick at "Synchronizing" — load it foregrounded, or
      keep datasets this size behind a query filter.

## Touch (⚠️ joins the standing real-hardware item)

> Same status as the calendar/timeline: pointer-events based, never verified on
> a real tablet. Editors, header drag vs scroll, and the keyboard model need a
> device pass.
