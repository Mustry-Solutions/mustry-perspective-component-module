# Holiday Manager — manual test checklist

Hands-on checklist for the Holiday Manager
(`mustrysolutions.perspective.admin.holidaymanager`). Date parsing, next-occurrence
math and draft logic are unit-tested; the e2e suite covers the CRUD lifecycle
against a live gateway. This covers the visual/interop checks the suite
doesn't automate. The committed demo at `/holidays` (verify project) persists
edits for real.

## Rendering

- [ ] The rail sorts by next occurrence: upcoming first (soonest on top),
      past non-repeating holidays dimmed at the bottom with a "past" badge.
- [ ] An annual repeat shows its NEXT date (not its original year); a Feb-29
      holiday shows Feb 28 in non-leap years.
- [ ] Dark theme: rail, badges, date input and form follow the theme vars.

## Schedule interop (the reason this component exists)

- [ ] Create a holiday for TODAY; a schedule with "Observes holidays"
      enabled goes inactive (Schedule Manager preview strip + active dots
      reflect it after refresh); a schedule without the flag is unaffected.
- [ ] Delete the holiday; the schedule goes active again.

## Editing flows

- [ ] The native date input matches the gateway's stored date across
      timezones (the demo formats gateway-side with yyyy-MM-dd — verify a
      holiday created in the gateway web UI shows the same calendar day).
- [ ] Rename keeps the date/repeat; the rail re-sorts after a date change.
- [ ] Save persists across a gateway restart.

## Touch (tablet session — joins the standing hardware checklist)

- [ ] The native date input opens a usable date picker on the tablet OS.
- [ ] Two-step Delete is comfortably tappable and reverts after 4s.
