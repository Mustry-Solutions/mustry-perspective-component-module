# Idle Guard — manual test checklist

The Playwright suite (`e2e/tests/guard.spec.ts`) proves the guard idles, wakes,
swallows the waking click and key, obeys the alarm policy, fails open, and that
every mode runs on its renderer and draws. Some of those checks are coarse, and
some things need real hardware. Run this list before a release that touches
the guard. Demo page: `/data/perspective/client/verify/guard/<mode>/<timeoutSec>`
(see [idle-guard.md](idle-guard.md#build-and-test)).

## Visual correctness of the modes

The mode tests prove that each mode runs on the expected renderer
(`data-renderer` = `webgl2` or `2d`) and **draws something** (a share of bright
pixels above a threshold calibrated against its dark background). They do
**not** prove that it looks right.

- [ ] Watch every mode for a few minutes on a real screen: pipes, aurora, halo,
      starfield, synthwave, lava, tunnel, flow, bounce, pong, ducks, clock,
      blank. Look for glitches, seams, flicker, wrong colours, text running off
      screen, the pipes scene restarting cleanly.
- [ ] Line modes: change a line's state (running → fault → off) and flow while
      idle; colours, pulses and beacons follow.
- [ ] Shuffle: modes fade into each other; no black frame or flash between a GL
      mode and a 2D one.
- [ ] `config.locale` set to each bundled language: the wake hint, the alarm
      banner and the clock's date follow it.

## Touch

- [ ] The touch test passes even with input swallowing disabled, because
      headless Chromium already drops a tap whose target vanished. Real touch
      browsers (iOS/iPadOS Safari, Android Chrome, WPE WebKit kiosks) may not.
      On a real touchscreen, tap a button under the screensaver about 20 times:
      it must only wake the page, never press the button. Include a
      release-acting control (the demo page's "Jog" control counts releases).

## Timing-dependent tests

- [ ] The alarm tests raise alarms 8 s after a click and expect the page to idle
      first (5 s timeout). On a slow CI runner they could become flaky. If they
      flake, prefer a test hook over longer sleeps.

## Not covered by the suite

- [ ] **Designer**: the guard is inert and shows its chip; dropping it in a
      view, binding props and previewing does not trigger idle.
- [ ] **Screen Wake Lock** (`config.wakeLock`) only works over HTTPS; the dev
      gateway is plain HTTP. Check on an HTTPS gateway that a TV does not sleep.
- [ ] **Night window and reduced motion on a real kiosk**: the e2e tests fake
      the time zone and the motion preference; check once with the real clock
      and OS setting.
- [ ] **Multiple displays / sessions**: two guards on one page (only the first
      acts), a guard in a shared dock across page navigation, a session that
      reconnects (the feed resubscribes).
- [ ] **Real alarm sources**: OPC/device tags with alarms, shelved alarms
      (excluded), `alarm.sources` patterns against real display paths.
- [ ] **No guard, no load**: on a gateway whose projects use no Idle Guard,
      the `mustry-idle-guard-alarm-feed` thread does not exist (Status →
      Threads); it appears with the first guard and goes away after the last
      session with one closes.

## Soak test on real kiosk hardware (48 h, 24/7 behaviour)

Everything automated runs on SwiftShader (software WebGL) in a container. The
guard lives on walls 24/7, so run it for days on the hardware it is meant for.

At least two machines, 48 h each, idle most of the time:

- [ ] Raspberry Pi 4 (or 5) kiosk, Chromium or WPE WebKit, 1080p TV
- [ ] An older Intel NUC (or similar iGPU box) in Perspective Workstation or
      Chrome kiosk, 1080p and, if available, 4K
- [ ] Optional: a control-room PC with a discrete GPU

Run each animated mode for a few hours, then `shuffle` (it creates a new GL
context every few minutes) overnight. Measure:

- [ ] **Frame rate** per mode, and which quality level the governor settles on
      (`auto`). Does any mode fall to the bottom level, or below 20 fps there?
- [ ] **Memory**: browser process RSS at start, after 1 h, 12 h, 48 h. Steady
      growth points at a leak (GL contexts, canvases, particle arrays).
- [ ] **GPU context churn**: `chrome://gpu` / the console never reports "too
      many active WebGL contexts"; contexts are released on dispose.
- [ ] **Temperature and power**: SoC temperature on the Pi
      (`vcgencmd measure_temp`), wall power if a meter is available, for the
      clock, the GL modes, and the night window (dimmed clock).
- [ ] **Driver issues**: any shader compile failure or lost context on real
      drivers (Mali/V3D on the Pi, Intel iGPU) falls back to 2D with a console
      *warning*, never an error or a black screen.
- [ ] **Alarm wake latency** under load: raise a High alarm while a heavy mode
      (flow, aurora) runs; the overlay clears within ~2 s.

Write the numbers per machine and mode into [idle-guard.md](idle-guard.md)
("Measured on real hardware"), and adjust the defaults (quality, frame cap,
night window) from the findings.
