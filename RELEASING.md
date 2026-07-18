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
   - derives the module version from the tag (`v0.2.0` → `0.2.0`),
   - builds and **signs** the `.modl`,
   - creates a GitHub Release named `v0.2.0`, attaches the signed `.modl`,
     and uses the changelog's `[0.2.0]` section as the notes.

The tag should point at a commit already on `main` (hence already green — the
release build signs the artifact rather than re-running the e2e gateway).

Versioning is semver; pre-1.0 the prop schemas may still change (the CI schema
guard flags removed/renamed keys — see `CHANGELOG.md`).

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

If any are missing, the release fails fast with a message naming them. The
signing material is **never** committed; the local dev keystore under
`ops/signing/` (git-ignored, self-signed) is for the dev gateway only and is
unrelated to release signing.

## Local / dev builds

`./gradlew build` locally produces version `0.2.0-SNAPSHOT` (the
`releaseVersion` property is unset). Only the tagged Release workflow stamps a
real version. `ops/setup.sh`/`deploy.sh` sign with the local dev keystore for
the disposable gateway, which is independent of release signing.
