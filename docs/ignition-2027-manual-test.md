# Ignition 2027 manual test

What the automated suite can't cover on a 2027 gateway. The gateway comes from
`source ops/ignition-2027.env && ops/e2e.sh --fresh`.

## Designer

Run on each new Ignition beta. The Designer Launcher is at
`http://localhost:9288/app/launchers`.

- [ ] The Designer opens the `verify` project with no module error
- [ ] The palette lists all 15 components under **Mustry Solutions**
- [ ] A demo view renders in the Designer
- [ ] A component dropped from the palette renders; close without saving

## Perspective Workstation on-screen keyboard

2027 adds a built-in Workstation keyboard. On `2027.2.0-beta1` it was off in a new
Workstation install (`browser.keyboard.enabled` in
`~/.ignition/clientlauncher-data/workstation.json`). When on, it opens on focus of
any `input`, `textarea` or `contenteditable` element.

First checked on `2027.2.0-beta1` with mouse clicks in Workstation on Linux, not on a
touchscreen. Repeat on a real touch panel.

- [ ] **On-Screen Keyboard** (`/keyboard`): our keypad, QWERTY and popover work, and
      the built-in keyboard stays closed (our value display is a `div`)
- [ ] **Rich Text Editor** (`/rte`): keys and Backspace work. Enter breaks the line
      with extra spacing below it; compare against a physical Enter key
- [ ] **Code Editor** (`/code`): keys, Backspace, Enter and live validation work
- [ ] **Data Grid** (`/grid`): a text cell takes keys, Enter commits it. A numeric
      cell opens the QWERTY layout, not digits (`data-osk-layout` can select another)
- [ ] **Date/Time Range Picker** (`/picker`): not yet checked with the keyboard on
- [ ] **Idle Guard** (`/guard/clock/5`): the page idles, a tap on the "Show Keyboard"
      tab only wakes it and opens nothing, and "Pump start presses" stays at 0
