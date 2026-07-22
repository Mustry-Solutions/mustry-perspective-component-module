# Schedule Manager — manual test checklist

Hands-on checklist for the Schedule Manager
(`mustrysolutions.ingots.admin.schedulemanager`). Range parsing/merging,
availability evaluation, transitions and the paint/resize geometry are
unit-tested (`scheduleLogic.ts` / `scheduleEditLogic.ts`); the e2e suite
covers the full create/edit/rename/delete lifecycle against a live gateway.
This covers the touch gestures and visual checks the suite doesn't automate.
The committed demo at `/schedule` (verify project) binds the gateway's real
schedules and persists edits for real.

> Prop sections: `config` = set-and-forget (editable/allowCreate/allowDelete,
> hour window, snap, locale), `data.schedules` = the flat BasicScheduleModel
> mirror, `state.selectedSchedule` = two-way selection, `output` = read-only
> (`count`, `isDirty`, `isActiveNow`, `validationErrors`).

## Rendering

- [ ] Gateway schedules and the two synthetic demo shifts all list; active
      schedules carry a green dot that matches the current wall clock.
- [ ] The red now-line sits at the current time in today's column and moves
      (30s tick — leave the view open across a minute boundary).
- [ ] The preview strip text matches reality ("Active now — until …" /
      "Inactive — next …") and flips when a schedule boundary passes.
- [ ] `config.dayStartHour`/`dayEndHour` clip the axis without losing data
      (blocks outside the window are clipped, ranges survive a save intact).
- [ ] Dark theme: swap the session theme — list, grid, blocks, badges,
      inputs and the strip all follow the theme vars (no hard-coded white).

## Touch (tablet session — joins the standing hardware checklist)

- [ ] Painting by finger drag works and does NOT scroll the page (the paint
      surface sets `touch-action: none`); a stray touch-scroll elsewhere
      cancels an in-flight paint without committing (pointercancel).
- [ ] Resize handles are hittable by finger (7px zones — flag if too thin).
- [ ] A deliberate tap on a block removes it; a tap that wiggles slightly
      (< 10px, the touch threshold) still counts as a tap, not a paint.
- [ ] Two-step Delete is comfortably tappable and reverts after 4s untouched.

## Editing flows

- [ ] Painting over an existing block merges rather than stacks (drag across
      a block: one continuous block results).
- [ ] Resizing a block into its neighbour merges them on release.
- [ ] All-days toggle: grid fills, painting suspends; untoggling restores
      the previously painted per-day ranges (drafts keep them).
- [ ] Rename to an existing name blocks Save with "Name already in use";
      the create flow blocks Save until a fresh name is typed.
- [ ] Switching schedules with unsaved edits drops the draft silently
      (known M2 behaviour — no guard prompt yet); `output.isDirty` is the
      author's hook to gate navigation.
- [ ] Save persists across a gateway restart (`docker restart mspc-ignition`,
      re-open the session, verify the edit is still there).
