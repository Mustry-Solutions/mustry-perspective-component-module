# User Manager — manual test checklist

Hands-on checklist for the User Manager
(`mustrysolutions.ingots.admin.usermanager`). Draft/serialization logic is
unit-tested; the e2e suite covers filter, contact/role editing, the
create-with-password lifecycle and the delete guard against a live gateway.
This covers the touch/visual/security checks the suite doesn't automate.
The committed demo at `/users` (verify project) binds the gateway's
'default' source and persists edits for real.

> Prop sections: `config` = set-and-forget (editable/allowCreate/allowDelete/
> allowPasswordChange, locale), `data.users` + role/schedule catalogs = bound
> content, `state.selectedUser` = two-way selection, `output` = read-only
> (`count`, `isDirty`, `validationErrors` — the staged password is
> deliberately NOT mirrored anywhere).

## Rendering

- [ ] The rail filter matches on username, first and last name; clearing it
      restores the full list.
- [ ] Role chips reflect `data.availableRoles`; a role on the user but
      missing from the catalog still shows (bound truth wins).
- [ ] Dark theme: rail, form fields, selects and chips follow the theme vars.

## Security posture (do this before any real deployment)

- [ ] The component is only reachable behind an authenticated Perspective
      session with an appropriate security level.
- [ ] `config.allowPasswordChange` is OFF unless the page is TLS-terminated
      end-to-end; verify the staged password never appears in
      `output.*`, `state.*`, session props or the browser console.
- [ ] The persistence script never logs `event.password` (check the
      reference script's pattern before copying it).
- [ ] Editing an AD/LDAP-backed source: `config.editable` is false (the
      component cannot detect read-only sources itself).

## Editing flows

- [ ] Contact rows: add/edit/remove round-trip; a row left blank is dropped
      on save (not persisted as an empty contact).
- [ ] Setting a password that violates the source's complexity policy
      surfaces the policy error (the demo mirrors it into lastEvent —
      real deployments should show `output.validationErrors`-style UI or
      the script's own feedback).
- [ ] Deleting the account you are logged in with: decide what should
      happen BEFORE trying it in production (the demo refuses 'admin').
- [ ] Save persists across a gateway restart.

## Touch (tablet session — joins the standing hardware checklist)

- [ ] Form inputs raise the OS keyboard as expected; pairing with the
      On-Screen Keyboard component avoids the double-keyboard problem on
      kiosk hardware.
- [ ] Role chips and the two-step Delete are comfortably tappable.
