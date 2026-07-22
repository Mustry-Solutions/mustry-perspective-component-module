# Roster Manager — manual test checklist

Hands-on checklist for the Roster Manager
(`mustrysolutions.ingots.admin.rostermanager`). Draft/reorder/filter logic is
unit-tested; the e2e suite covers picker-add, drag-reorder persistence and
the create/delete lifecycle against a live gateway. This covers the touch
gestures and visual checks the suite doesn't automate. The committed demo at
`/roster` (verify project) binds the gateway's real rosters + the default
user source and persists edits for real.

> Prop sections: `config` = set-and-forget (editable/allowCreate/allowDelete,
> locale), `data.rosters` + `data.availableUsers` = bound content,
> `state.selectedRoster` = two-way selection, `output` = read-only
> (`count`, `isDirty`, `validationErrors`).

## Rendering

- [ ] Rosters list with user counts; rows show "Contact N" ordinals, display
      names resolved from the directory, and contact chips.
- [ ] A user with no contact info shows the ⚠ warning; a username missing
      from `data.availableUsers` shows the "Unknown user" badge.
- [ ] Dark theme: list, rows, picker and buttons all follow the theme vars.

## Touch (tablet session — joins the standing hardware checklist)

- [ ] Reordering by dragging the grip with a finger works and does NOT
      scroll the list (the grip sets `touch-action: none`); dragging
      anywhere else on the row scrolls normally.
- [ ] A touch-scroll takeover mid-drag cancels without committing.
- [ ] The picker is usable on touch: search field focuses without the OS
      keyboard covering the result list (pair with the On-Screen Keyboard
      component if it does).

## Editing flows

- [ ] Reorder previews live while dragging (rows shift, moved row
      highlighted); releasing outside a real move commits nothing.
- [ ] Adding a user appends at the END (append-only semantics preserved).
- [ ] Duplicate adds are impossible (picker hides users already on the
      roster).
- [ ] Save rewrites the order wholesale — verify with two browser sessions
      open: the second session sees the new order after its next refresh.
- [ ] Deleting a roster referenced by an alarm pipeline: verify the pipeline
      degrades the way you expect BEFORE deleting in production (the
      component can't know; the demo script deletes unconditionally).
- [ ] Save persists across a gateway restart.
