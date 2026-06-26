# Mustry Solutions Perspective Components

An Ignition **8.3.6** module that adds custom [Perspective](https://www.inductiveautomation.com/) components, written as React/TypeScript module components. It currently ships one component — a **Date/Time Range Picker** — with more to follow.

- **Module ID:** `com.mustrysolutions.perspective.components`
- **Palette category:** `Mustry Solutions`

---

## Date/Time Range Picker

A Booking.com-style start/end date-time range picker. Component id `mustrysolutions.input.datetimerangepicker`.

### Features

- **Range selection** with a hover preview band and a two-click (anchor → endpoint) state machine.
- **Responsive layouts** — `compact`, `oneMonth`, `twoMonths`, or `auto` (size-driven via breakpoints).
- **Inline or popover** display (`config.display`) — popover shows a trigger field and floats the calendar in a portal.
- **Time precision** via `config.granularity` (`day` / `hour` / `minute` / `second`).
- **Selectable-range constraints** — `disableDates` (past/future/none), `dateBounds`, and `spanDays` min/max, with tooltips explaining why a day or preset is disabled.
- **Presets** — `rolling` (amount × unit from now) and `calendar` (today, this/last week/month/year…); conflicting presets are auto-disabled.
- **Localisation** — `config.timezone`, `config.locale`, `config.weekStart`, and overridable UI strings via `config.labels`.
- **Theming** — every colour is a CSS variable defaulting to the active Perspective theme (see [Theming](#theming)).
- **Component events** — `onRangeChanged`, `onPresetSelected`.

### Property reference

All public props are grouped under `config` / `selection` / `output` (+ standard `style`). Each prop carries an inline description visible in the Designer; this is the high-level map.

**`config`** — behaviour & appearance
| Prop | Notes |
|---|---|
| `enabled` | When false, display-only and dimmed. |
| `display` | `inline` \| `popover`. |
| `popover` | `{ placeholder, closeOnSelect, dateFormat }` (popover trigger). `dateFormat` tokens: `YYYY YY MM M DD D`; 24h time auto-appended per granularity. |
| `disableDates` | `past` \| `future` \| `none`. |
| `dateBounds` | `{ earliest, latest }` (YYYY-MM-DD). |
| `spanDays` | `{ min, max }` allowed range length. |
| `granularity` | `day` \| `hour` \| `minute` \| `second`. |
| `durationLabelThresholdHours` | Below this span, the label shows time units instead of days. |
| `weekStart` | `monday` \| `sunday`. |
| `timezone`, `locale` | Empty = browser/session default. |
| `layout` | `auto` \| `compact` \| `oneMonth` \| `twoMonths`. |
| `breakpoints` | `{ compactBelowWidth, compactBelowHeight, twoMonthsAboveWidth }` (drive `auto`). |
| `showClear`, `showPresets` | Toggle the Clear button / preset row. |
| `presets` | `[{ label, type, rolling:{amount,unit}, calendar:{period} }]`. |
| `labels` | Override UI text: `startTime, endTime, startDate, endDate, clear, selectRange, invalidRange, sameDay, previousMonth, nextMonth`. |

**`selection`** — two-way; set to pre-select
`startDate`, `endDate` (YYYY-MM-DD); `startTimeSec`, `endTimeSec` (seconds since midnight).

**`output`** — read-only, derived
`startDateTime` / `endDateTime` (ISO 8601 + offset), `startEpochMs` / `endEpochMs` (UTC ms), `durationDays`, `durationHours`, `durationLabel`, `isValid`.

### Events

- **`onRangeChanged`** — fires when the selection or its derived outputs change. Payload mirrors `output.*`.
- **`onPresetSelected`** — fires on a preset click. Payload: `{ label, type, amount, unit, period }`.

### Theming

Colours come from CSS custom properties that default to the active Perspective theme (the `--neutral-*` scale for text/border/background, `--callToAction` for the accent), each with a hex fallback. Override them — without rebuilding — via a Perspective style class on the component or the project stylesheet:

```css
.mustry-datetime-range-picker { --dtrp-accent: #2e7d32; --dtrp-range: #c8e6c9; }
```

Variables: `--dtrp-accent`, `--dtrp-accent-text`, `--dtrp-range`, `--dtrp-text`, `--dtrp-muted`, `--dtrp-border`, `--dtrp-bg`.

---

## Project layout

| Path | Scope |
|---|---|
| `common/` | Component descriptor + the props/event JSON schemas (`src/main/resources`). |
| `gateway/` | Gateway hook (registers components, mounts web resources). |
| `designer/` | Designer hook (registers components in the Designer). |
| `web/` | React/TypeScript front-end + styles, built by webpack. |
| `ops/` | Local dev gateway (Docker) + scripts — see [`ops/README.md`](ops/README.md). |
| `ops/verify/` | Live browser-verification harness — see [`ops/verify/README.md`](ops/verify/README.md). |

---

## Build, test, deploy

Requires JDK 17 (`JAVA_HOME`). Node 18.20.4 is downloaded automatically by the build.

```bash
# Build the signed-or-unsigned .modl (web bundle + Java)
./gradlew build

# Run the TypeScript unit tests (also part of `gradlew check` / `build`)
./gradlew :web:jestTest        # or: cd web && npm test

# Local dev gateway + deploy (see ops/README.md)
ops/setup.sh                   # first-time: signed gateway on http://localhost:9088
ops/deploy.sh                  # rebuild + redeploy after code changes
```

Signing is conditional: a self-signed keystore is generated by the ops scripts; `./gradlew build` without signing properties produces an unsigned module.

### Tests

Unit tests use **Jest + ts-jest** (`web/jest.config.js`, `web/tsconfig.test.json`). They cover the pure logic: `dateUtils.ts` (date math, `startOfWeek`, `formatPattern`, timezone/DST resolution, time-of-day round-trips) and `pickerLogic.ts` (layout resolution, selectable bounds, rolling/calendar preset ranges, preset conflicts, the output contract). The React component's own rendering/state machine isn't directly unit-tested — it's exercised via the live verification harness.

### Live verification

After changing a component, render it in a real Perspective session rather than trusting a gateway 200 — use `ops/verify/` (or the `/verify-component` skill). See [`ops/verify/README.md`](ops/verify/README.md).

---

## Roadmap / deferred work

### Prop-schema versioning & migration (deferred)

**Status: not started — deliberately deferred until the component is in real use.**

Perspective serializes each instance's configured **prop values** into the view's JSON, not a live link to `props.json`. So when the schema changes across a module upgrade (a renamed or re-nested prop), old saved values are orphaned and the affected settings **silently reset to defaults**. During development that's a non-issue — the only instances are the few in `ops/verify/` and we just re-create them — but once real views are built on this component, the prop schema becomes a contract that can't be freely broken.

**Do this before a v1.0 release / first real deployment:**

1. **Freeze the schema** and stop renaming/re-nesting published props.
2. **Additive-only policy** thereafter — new props are optional with defaults (non-breaking); renames/moves require a converter.
3. **Versioned converters** — confirm the exact Perspective 8.3 SDK hook (component descriptor version + prop converter; verify via `javap`) and register migrations that rewrite old prop trees forward. As a cheaper interim, the reducer can read legacy paths as fallbacks.
4. **Document the policy** here and in `CLAUDE.md`.
5. *(Optional)* a CI guard that flags a removed/renamed key in `props.json` versus the previous commit.

Until the component is actively used, breaking schema changes remain acceptable.
