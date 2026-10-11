# Idle Guard: engineering reference

How the Idle Guard (`mustrysolutions.perspective.screensaver.idleguard`) works,
its props, and how it is tested. The user-facing section is in the
[README](../README.md#idle-guard-screensaver).

**It is a browser overlay, not an access control or a safety function.**
Anyone with the browser's developer tools can remove it. Never document or
sell it as either.

## Safety rules

These hold whatever the props say, and every change to the guard keeps them:

- **An active Critical alarm is never covered.** `evaluateAlarms` clamps the
  wake priority to Critical; tested in jest and e2e.
- **No feed, no cover.** A stale or missing alarm feed removes the overlay and
  prevents idling (fail open). No code path may show the overlay without a
  fresh feed.
- **The input that wakes the page never reaches the page.** Wake listeners are
  window capture-phase; the rest of the gesture is swallowed for `SWALLOW_MS`
  while the overlay fades. If you touch this, run the e2e click and key tests
  and check they still fail with swallowing disabled (mutation check: break
  the two `if (this.shielding ...)` conditions in `IdleGuard.tsx`, set
  `FADE_MS` to 0).

## What is built

| Area | State |
|---|---|
| Idle detection in the browser (pointer with jitter threshold, touch, keys, wheel, tab visibility) | Done |
| Outputs (`output.idle`, `idleSince`, `lastInput`, `mode`, `wakeCause`, `feedOk`, `alarms`) and events (`onIdle`, `onWake`) | Done |
| Overlay in a `document.body` portal, page stays mounted | Done |
| The waking gesture never reaches the page | Done, e2e-tested and mutation-checked |
| Line modes: pipes, aurora, halo; starfield (WebGL2) | Done |
| Showpieces: synthwave, lava, tunnel, flow (WebGL2) | Done |
| Funny: bounce, pong, ducks (2D, run everywhere) | Done |
| Shuffle through the animated modes; clock, blank, external | Done |
| 2D fallback for browsers without WebGL2; automatic quality steps for weak kiosks | Done |
| Alarm policy: wake, pin banner, Critical always wakes, fail open on a stale feed | Done, unit- and e2e-tested |
| Burn-in and power: drifting text, a night window (dimmed clock by default) | Done |
| Reduced motion: animated modes give way to the clock | Done |
| Screen Wake Lock (HTTPS only) | Done, not e2e-tested (the dev gateway is plain HTTP) |
| Designer: inert, shows a chip | Done |

### Design choices

- **Not built:** an Andon board, a rotation of the project's own views, a
  privacy lock with re-authentication, and page-level pixel orbit. The board
  and the rotation are what integrators already build as views (`external`
  mode plus their own view covers it); a lock would be the part most likely to
  be mistaken for a security control.
- **The alarm feed polls** the gateway's alarm status once a second, once per
  gateway, instead of an `AlarmListener` per delegate. `AlarmManager.addListener`
  takes one source path, so a listener per guard would not cover "every alarm",
  and one query per tick costs the same whatever the number of displays.
- **The night window applies only while idle**, and by default swaps the
  mode for a dimmed clock rather than dimming whatever runs. The spec dims the
  wall on a schedule; dimming a screen someone is using is not what an
  operator wants, and a dimmed animation still costs the graphics card its
  full load all night. A dimmed clock renders no canvas, and unlike a fully
  black screen it still reads as alive, with the wake hint, so a night-shift
  operator does not take it for a dead PC. `blank` is there for screens that
  should go fully dark.
- **The demo pipes are not the plant's pipe topology.** They are generic
  pipes, one per bound state/flow. Drawing the real routing needs the P&ID,
  which is the HMI Kit fly-through idea, not this module.

## Architecture

```
Browser (Perspective client)                       Gateway
┌──────────────────────────────────────┐          ┌──────────────────────────────────────┐
│ IdleGuard.tsx (React class)          │  model   │ GuardModelDelegate (one per guard)    │
│  window capture listeners → input()  │  events  │  screensaver-subscribe → AlarmFeed    │
│  250 ms tick → tick() (idleLogic.ts) │◄────────►│ AlarmFeed (one per gateway)           │
│  evaluateAlarms() on the last feed   │          │  1 s poll of AlarmManager.queryStatus │
│  portal on document.body:            │          │  per-guard SourceFilter + summary     │
│   starfield / pipes (canvas, 30 fps) │          │  push on change, heartbeat every 2 s  │
│   clock / blank / banner / dim       │          │ MustryPerspectiveComponentsGatewayHook│
│ guardDelegate.ts (store delegate)    │          │  registers component + delegate       │
│                                      │          │  (polls only while a guard listens)   │
└──────────────────────────────────────┘          └──────────────────────────────────────┘
```

### Browser

- `idleLogic.ts`: pure, node-tested. The idle state machine (`tick`,
  `input`), the alarm policy (`evaluateAlarms`), the jitter check, the dim
  window and the drift path.
- `guardProps.ts`: PropertyTree → typed props.
- `guardDelegate.ts`: the store delegate; parses feed messages and stamps them
  with the **browser's** clock (staleness never compares two clocks).
- `IdleGuard.tsx`: the component: lifecycle, input handling, the state
  machine, outputs, wake lock. It portals a `Cover` while idle.
- `Cover.tsx`: what the cover shows, rendered from props: the mode (via
  `modes/modeToShow.ts`), clock, legend, halo labels, banner, dimming.
- `CanvasMode.tsx`: the canvas behind the animated modes (renderer choice,
  fallback, frame loop).
- `modes/`: the canvas modes. See [Idle modes and rendering](#idle-modes-and-rendering).

**Input handling.** All listeners are on `window` in the capture phase, so
they run before anything on the page. While the overlay is up, a pointer-down,
touch-start, key-down or wheel wakes the page and is stopped
(`preventDefault` + `stopImmediatePropagation`). The rest of that gesture
(pointer/mouse up, click, touch-end, key-up, ...) is swallowed for 700 ms, and
the overlay fades out over 300 ms while still catching input. Without this a
release-acting control under the overlay (a jog button, `onMouseUp` scripts)
would fire from the tap that woke the screen. Mouse movement wakes without
being stopped. Wakes that are not input (alarm, stale feed, disabled) drop the
overlay at once.

**Alarm policy.** From the last feed message:

- `feedOk`: a message arrived within `alarm.staleAfterSec`. Without it the
  guard never covers the page and removes a cover that is up (fail open). It
  also re-sends its subscription every 5 s, which recovers a session that
  reconnected and lost its gateway delegate.
- `wake`: an active alarm at or above `alarm.wakePriority` (clamped so Critical
  always qualifies). Wakes the page and blocks idling while active. Acked
  alarms count unless `alarm.includeAcked` is off, except Critical, which
  always counts.
- `pin`: between `pinPriority` and `wakePriority`: a banner over the idle mode,
  and the night dimming lifts.

**One guard per page.** The first guard to mount owns the page; another
instance stays inert. Put it in a shared dock so it survives navigation.

**Reused component stores** (see Doom's SDK notes): the guard acts only after
`timeoutSec` (minimum 5 s), so props from a previous view are long replaced by
then; subscriptions are re-sent whenever `alarm.sources` changes.

### Idle modes and rendering

The canvas modes draw through one interface (`modes/renderer.ts`:
`configure(props)`, `frame(dt, now)`, `dispose()`). `modes/index.ts` builds
them: the GL modes try WebGL2 first; when the browser has none or a shader
fails, `IdleGuard.tsx` mounts a fresh canvas with the 2D version (pipes has its
own; the other GL modes fall back to the 2D starfield). A lost GPU context
does the same. The funny modes are 2D by design. The canvas is keyed by mode,
because a canvas that held a GL context cannot give a 2D one (shuffle swaps
between the two). It carries `data-renderer` (`webgl2` or `2d`).

- **Pipes** (`gl/pipesGL.ts`): `PipesSim` grows one walker per line through a
  16 x 10 x 10 grid; the renderer draws instanced, lit tubes with ball joints
  and flanges, a floor grid and fog, from a camera orbiting every 150 s.
  Segments grow smoothly. Bright pulses travel along each pipe at its flow
  (`dist` along the run, a per-line phase); fault pipes throb. The scene fades
  out and restarts at 30 % fill or `modes.pipes.resetAfterSec`.
- **Aurora** (`gl/aurora.ts`): one fullscreen shader. One curtain per line (up
  to six), coloured by state, folding with its flow; ridged-noise mountains;
  the lake is the sky evaluated again, mirrored and rippled.
- **Halo** (`gl/halo.ts`): one neon ring per line with two comets orbiting at
  its flow, dial ticks, a clock in the middle. Ring radii and label angle come
  from `haloLayout.ts`, shared with the DOM labels; both drift together.
- **Starfield** (`gl/starfieldGL.ts`): instanced streaks, colour by
  temperature, length by speed, over a fbm nebula; tinted by `modes.starfield.color`.

- **Synthwave**, **Lava**, **Tunnel** (`gl/showpieces.ts`, one fragment
  shader each on `gl/shaderMode.ts`): a retro sunset over a racing neon grid;
  lava-lamp metaballs with glossy light, the wax colour drifting between
  orange, magenta and teal over minutes; a bending neon wormhole.
- **Flow** (`gl/flow.ts`): ~32k particles (12k at `low`) in a curl-noise field
  of gradient noise (value noise leaves seams), moved by transform feedback so
  no float textures are needed, painted into a ping-pong trail buffer that
  fades each frame.
- **Bounce** (`fun/bounce*.ts`): the bouncing badge (`modes.bounce.text`),
  a new colour per bounce, confetti and "CORNER!" when it hits one exactly,
  and a dim scoreboard of bounces and time since the last corner.
- **Pong** (`fun/pong*.ts`): two AIs (`modes.pong.left` / `right`, default day
  shift vs night shift) that aim for the predicted crossing with a per-rally
  error, sometimes big enough to miss; first to 11; CRT scanlines; the field
  drifts.
- **Ducks** (`fun/ducks*.ts`): rubber ducks in hard hats and hi-vis vests on a
  pool, one of them now and then saying something sensible.
- **Shuffle** (`shuffle.ts`): a new mode every `modes.shuffle.minutes`
  (minimum 0.5) from `modes.shuffle.modes` (empty = all), in an order shuffled
  per idle session and cycled, so a mode never follows itself.

The GL modes render into an HDR target (MSAA when allowed), then bloom, ACES tone
mapping, vignette and dither (`gl/post.ts`). Line colours, glow and beacons come
from `lineStyle.ts`, shared by all line modes.

**Quality.** `config.quality` `auto` (default) starts at full quality and the
governor (`quality.ts`) steps down one level per 2-second window averaging
under 20 fps: no MSAA, then 75 % resolution, then 60 % without bloom. It
never steps back up, so it cannot oscillate. GL canvases are capped at
DPR 1.5 and 2560 px wide. `high` and `low` pin a level. All modes run at up
to 30 fps (a 24/7 wall does not need 60, and pays for it in power and heat).

**Preview.** `cd web && npm run preview:guard`, then open
`web/build/guard-preview/index.html#pipes` (or `#aurora`, `#halo`, `#starfield`;
query `?quality=high&fault=1&lines=5&legacy=1`). It runs the renderers without
Perspective, which is the fast loop for visual work. Not part of the module.

### What the cover shows

`modes/modeToShow.ts` (pure, tested) starts from `config.mode` and applies,
in order:

1. `external` stays external: the project draws. `blank` stays blank: the
   night window never lights a dark screen up.
2. **Night window** (`burnIn.night`, on by default, 22:00-06:00 browser local
   time): `clock` (default, dimmed to `level`) or `blank` replaces any other
   mode; `dim` keeps the mode and dims it to `level`. Alarms behave as always: a wake alarm wakes, a
   pinned one shows its banner and lifts the dimming.
3. **Shuffle** picks the mode for this slot.
4. **Reduced motion**: when the viewer wants less motion, every animated mode
   becomes the clock. `config.reduceMotion` `auto` follows the browser's
   `prefers-reduced-motion`; `always` forces it on a kiosk that has no such
   setting; `never` ignores it. The overlay's fade-in and the text's glide
   are switched off too (`mustry-idle-overlay--still`).

The overlay carries `data-mode` (what is shown) and `data-reason`
(`configured`, `night`, `shuffle`, `reduced-motion`). `output.mode` and the
`onIdle` event's `mode` report the same shown mode, not `config.mode`;
`output.mode` follows it while idle (a shuffle slot, the night window
starting).

The default `config.mode` is `clock`: it renders no canvas at all, so a guard
dropped in with no configuration costs no graphics load on a 24/7 screen.
The animated modes are opt-in.

### Gateway

- `AlarmFeed`: one daemon thread per gateway, and only while at least one
  guard is subscribed: the first guard's subscription starts the poll, the
  last guard's departure stops it, so a gateway whose projects use no guard
  pays nothing. A restarted poll never replays alarms read before it stopped.
  Reads active, unshelved alarms each second, builds each subscriber's summary with its own `SourceFilter`,
  sends it when it changed or every 2 s as a heartbeat. If the query throws it
  sends nothing, so every guard fails open.
- `AlarmSummary`: counts by priority (active, and unacknowledged), plus the
  top N alarms (unacknowledged first, then priority, then newest).
- `SourceFilter`: `alarm.sources` globs (`*` only), case-insensitive, against
  the display path or the source path.
- `GuardModelDelegate`: subscribes on `screensaver-subscribe`, unsubscribes on
  shutdown.

Event names live in `guardDelegate.ts` and `GuardModelDelegate.java`; change
both.

### Who sees the alarms

Every session that has an Idle Guard receives, every couple of seconds, the
active alarm counts and the top three alarms (label and display path) that
match its `alarm.sources`. There is **no permission check**: it goes to the
session whoever is logged in, or nobody. That is what any Alarm Status Table
in a view does too, but the guard sits in a shared dock on every page, so it
is easy to forget.

- On a lobby, canteen or other public screen, set `alarm.sources` to the
  alarms that screen may show. A pattern that matches nothing hides every
  alarm from it, but then no alarm wakes that screen either.
- The counts and labels never leave the gateway for a session without a
  guard, and the delegate never accepts anything from the browser but its
  source patterns.


## Props

The full schema with descriptions is
[`idleguard.props.json`](../common/src/main/resources/idleguard.props.json).

| Prop | Default | |
|---|---|---|
| `config.enabled` | true | Off wakes the page and stops detection |
| `config.timeoutSec` | 600 | Minimum 5 |
| `config.mode` | clock | pipes, aurora, halo, starfield, synthwave, lava, tunnel, flow, bounce, pong, ducks, shuffle, clock, blank, external |
| `config.reduceMotion` | auto | auto (browser preference), always, never |
| `config.quality` | auto | auto, high, low (see Quality) |
| `config.locale` | '' | UI-text language (en/fr/de/es/nl/it/pt) and the clock's date/time locale; '' follows the browser |
| `config.labels.*` | | Per-key overrides: `wakeHint`, `activeAlarm`, `activeAlarms` (`{n}`), `line` (`{n}`), priority names |
| `config.wakeOnMove` / `moveThresholdPx` | true / 8 | Mouse movement counts beyond the threshold |
| `config.wakeLock` | false | Screen Wake Lock; HTTPS only |
| `alarm.wakePriority` | High | Critical always wakes |
| `alarm.pinPriority` | Medium | Banner between pin and wake |
| `alarm.includeAcked` | true | |
| `alarm.sources` | [] | Glob patterns; empty = all alarms |
| `alarm.staleAfterSec` | 8 | Fail open after this much feed silence (min 3) |
| `burnIn.drift` | true | Text wanders on a 7/11-minute Lissajous path |
| `burnIn.night` | on, 22:00–06:00, clock, 0.4 | While idle inside the window: `mode` clock (dimmed to `level`), dim (the configured mode, to `level`) or blank |
| `lines` | demo set | `[{label, state, flow, color}]`, max 12: one pipe, curtain (max 6) or ring each. state: running, idle, warning, fault, off |
| `modes.legend` | true | Line legend over pipes and aurora |
| `modes.clock` | | `title` (also shown in halo), `showSeconds` |
| `modes.starfield` | | `speed` (bind a line rate), `color`, `density`, `caption` |
| `modes.pipes` | | `resetAfterSec` (120), `orbit` (true) |
| `modes.bounce` | | `text` ("IDLE") |
| `modes.pong` | | `left` ("DAY SHIFT"), `right` ("NIGHT SHIFT") |
| `modes.shuffle` | | `modes` ([] = all animated), `minutes` (5, min 0.5) |

Events: `onIdle {mode, idleSince}`, `onWake {cause, idleForMs}` with cause
`input`, `alarm`, `feed-stale` or `disabled`.

## Build and test

```bash
./gradlew build                 # .modl + jest (web) + JUnit (gateway, incl. the alarm feed)
cd web && npx tsc --noEmit && npm test
ops/e2e.sh --no-deploy tests/guard.spec.ts       # the guard's Playwright suite on the running gateway
python3 ops/verify/tools/build_guard_views.py    # regenerate GuardDock / GuardDemo and the /guard routes
```

The demo page is `http://localhost:9088/data/perspective/client/verify/guard`;
`/guard/<mode>/<timeoutSec>[/<wakePriority>[/<quality>]]` picks the guard's
config (the e2e suite uses those). `GuardDemo` embeds the `GuardDock` header,
which holds the guard bound to `session.custom.guard` (set from the URL); in a
real project that header is a shared dock. The demo's tags and alarm buttons
come from the project library script `screensaver` (creates
`[default]Screensaver/*` on view startup). Alarm tests share those gateway-wide
tags: they clear them first and last.

Never call a guard change done because the build is green: open
`/guard/pipes/5`, wait, see the pipes, move the mouse, see the page, and check
the console is clean.

What the e2e suite proves, on a real 8.3.6 gateway:

- idle after the timeout, wake on movement beyond the jitter threshold, page
  state intact;
- a waking mouse press/release and a waking key press never reach the page
  (the mouse and key tests fail when the swallowing is disabled; the touch test
  cannot, because Chromium already drops a tap whose target vanished);
- a High alarm wakes the page within the poll budget and keeps it awake;
- a Medium alarm pins a banner without waking;
- Critical wakes even with `wakePriority` Critical, and is never covered;
- a silent feed (the suite drops its WebSocket messages) makes the guard fail
  open and stay away until the feed returns;
- all eleven canvas modes run on their renderer (WebGL2 or 2D) and draw
  (share of bright pixels with the overlay text hidden, thresholds calibrated
  against measured scenes and their dark backgrounds); halo labels each line;
  clock shows the time; blank stays black; external draws nothing but reports idle;
- with WebGL2 taken away, every GL mode falls back to 2D, draws, and warns
  (never errors) in the console;
- shuffle swaps lava (GL) and ducks (2D) back and forth on fresh canvases
  (mutation-checked: with the canvas not keyed by mode, the swap draws nothing);
- the night window (browser pinned to a 1 a.m. zone; the suite otherwise runs
  at midday) shows the dimmed clock, never a black screen, and still wakes;
- reduced motion turns an animated mode into a still clock;
- the browser console stays clean throughout.
