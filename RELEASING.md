# Releasing

This repo follows **GitHub Flow** with tag-driven releases.

## Day-to-day flow

1. Branch off `main` for any change (`git switch -c feature/…`).
2. Open a pull request. CI (**Build & test** + **E2E smoke**) must pass.
3. Squash-merge into `main`. `main` is always releasable.

Direct pushes to `main` are blocked by branch protection — everything goes
through a PR, and the two CI checks are required to merge.

## Cutting a release

Releases are driven entirely by an annotated git tag `vX.Y.Z`.

1. **Update the changelog.** Rename the `## [Unreleased]` heading to
   `## [X.Y.Z] - YYYY-MM-DD` and add a fresh empty `## [Unreleased]` above it.
   Do this in a normal PR and merge it.
2. **Tag the merge commit and push the tag:**
   ```bash
   git switch main && git pull
   git tag -a v0.2.0 -m "v0.2.0"
   git push origin v0.2.0
   ```
3. The **Release** workflow (`.github/workflows/release.yml`) then:
   - derives the module version from the tag (`v0.2.0` → `0.2.0`) —
     **plain `x.y.z` tags only** (apart from the beta builds below): other
     prerelease suffixes are rejected because Ignition's `module.xml` version
     parser is numeric-only,
   - builds and **signs** the `.modl` (which carries `license.html`, the
     install-time EULA) and verifies the signature landed,
   - builds the branded **user-manual PDF** (`scripts/build_manual_pdf.sh`
     from `docs/user_manual.md`),
   - creates a **draft** GitHub Release named `v0.2.0`, attaches the
     signed `.modl` and the manual PDF, then flips it public — using the
     changelog's `[0.2.0]` section as the notes (`ops/changelog-notes.py`
     folds each `###` entry into a collapsible block titled with its
     heading). If that section is missing or empty, the workflow stops
     before creating the release, so do step 1 before tagging.

4. **Bump the dev version.** In a follow-up PR, set the fallback version in
   `build.gradle.kts` to the next patch as a SNAPSHOT (after `v0.2.0`:
   `0.2.1-SNAPSHOT`). module.xml drops the `-SNAPSHOT` suffix, so a dev build
   left on the old number would claim to be the release it follows and
   install as a downgrade.

The tag should point at a commit already on `main` (hence already green — the
release build signs the artifact rather than re-running the e2e gateway).

Versioning is semver; pre-1.0 the prop schemas may still change (the CI schema
guard flags removed/renamed keys — see `CHANGELOG.md`).

## Beta builds for a future Ignition version

While an Ignition line is in beta (now: 2027), its builds ship as GitHub
**prereleases**, separate from normal releases. Ignition gates modules on the
year version, so the same `.modl` can't load on both 8.3 and 2027.

To publish one:

1. Pick a commit on `main` where **E2E Ignition 2027 beta (advisory)** passed.
   It isn't a required check, so `main` can be red on it. The workflow stops if
   the commit isn't on `main`, if the job didn't pass, or if the tag's SDK isn't the
   one in `ops/ignition-2027.env`. If you tagged before the job finished, wait
   for it, then re-run the failed Release run: the tag doesn't need replacing.
2. Tag that commit `vX.Y.Z-ignition<sdk>`, with `X.Y.Z` taken from the fallback
   version in `build.gradle.kts`, and push the tag:
   ```bash
   git tag -a v0.9.1-ignition2027.2.0-beta1 -m "0.9.1 for Ignition 2027.2.0-beta1"
   git push origin v0.9.1-ignition2027.2.0-beta1
   ```

The Release workflow reads the SDK from the tag, builds and signs on Java 25, and:

- checks that the beta label reached the file and module names,
- publishes a prerelease that never becomes "latest", with the notes from
  `ops/beta-release-notes.md` (no CHANGELOG section or changelog PR needed),
- names the file `Mustry-Perspective-Components-ignition-<sdk>.modl` and the
  module `Mustry Perspective Components (BETA for Ignition <sdk>)`,
- stamps the numeric module version `X.Y.Z.<beta number>`.

The fallback SNAPSHOT version isn't bumped afterwards. Each new build needs a
higher `X.Y.Z.<beta number>` than the last one, so raise the patch number when
that wouldn't be true: to rebuild for the same Ignition beta (a tag can't be
reused either), or when a new SDK restarts the beta number (`2027.2.0-beta3` gives
`.3`, then `2027.3.0-beta1` gives `.1`).

When Inductive Automation ships a new beta, change the image and SDK in
`ops/ignition-2027.env` in a PR, let the advisory job run, and publish a new build
from a commit where it passed. A beta
build may not survive a later Ignition beta.

**When 2027 is released:** build on the final SDK, make the 2027 job a required
check, and have the normal `vX.Y.Z` release publish both `.modl` files. That last
step isn't implemented yet because the final SDK doesn't exist.

## Signing secrets

Signing runs only in the Release workflow, from repository secrets
(**Settings → Secrets and variables → Actions**). Add all five:

| Secret | What |
|---|---|
| `SIGNING_KEYSTORE_B64` | Base64 of the signing keystore (`.p12`/`.jks`) — `base64 -i keystore.p12` |
| `SIGNING_CERT_B64` | Base64 of the certificate chain (`.pem`) |
| `SIGNING_KEYSTORE_PASSWORD` | Keystore password |
| `SIGNING_CERT_ALIAS` | Key alias inside the keystore |
| `SIGNING_CERT_PASSWORD` | Key password (often the same as the keystore password) |

To check the secrets without releasing, run the **Release** workflow by hand
(**Actions → Release → Run workflow**) with a plain `x.y.z` version, or a
`x.y.z-ignition<sdk>` one to check a beta build. A manual run is always a dry run: it builds and signs, and uploads the signed `.modl`
as a workflow artifact. Only a pushed tag publishes a release.

If any are missing, the release fails fast with a message naming them. The
signing material is **never** committed; the local dev keystore under
`ops/signing/` (git-ignored, self-signed) is for the dev gateway only and is
unrelated to release signing.

## Local / dev builds

`./gradlew build` locally produces the fallback SNAPSHOT version from
`build.gradle.kts` (the `releaseVersion` property is unset), one patch ahead
of the latest release. module.xml carries it without the suffix
(`0.8.1-SNAPSHOT` → `0.8.1`). Only the tagged Release workflow stamps a real
version. `ops/setup.sh`/`deploy.sh` sign with the local dev keystore for
the disposable gateway, which is independent of release signing.
