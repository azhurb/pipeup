# Release preparation

Use this checklist before the next Pipeup release. Version 0.9.0 was published with the earlier shared identity; the independent app identity and provider updates on this branch require a new packaged release. Commands for validation and creating releases remain in [Commands](commands.md#releases). Public installation and upgrade instructions remain in the [README](../../README.md#download-and-setup).

## Product verification

- Run the relevant frontend and Rust checks from [Commands](commands.md). Record exact results and skipped checks in the PR and release notes.
- Test a fresh setup with speech recognition only, then with optional AI processing. A failed save must remain visible and keep setup open.
- Capture a shortcut, cancel it, leave its page, save another shortcut, and discard an unsaved change. Verify the active shortcut follows the saved settings.
- Review Overview, Dictionary, History, and every Settings page in light/dark themes, English/Chinese, with keyboard navigation and reduced motion.
- Verify recording, cancel, processing, successful insertion, and permission recovery in the native app. Browser previews alone do not verify the native pipeline.
- Check tray destinations, launch at startup, saved credentials, history retention, and local history search. Verify one provider flow with your own test account without including its key or transcript in screenshots.
- Refresh the README screenshots from the current UI using non-sensitive preview data.
- Confirm the provider model suggestions refresh when stale or after changing credentials or the endpoint. Test the selected model because the list comes from the provider and can contain models unsuitable for chat completion.
- Test Groq Whisper Turbo and the new Gemini 3.5 Flash-Lite defaults with current accounts. For Gemini 3.5 Transcribe, check both smart and verbatim output with speech, and record the delay after recording stops. Its connection test only checks model access.
- For Gemini 3.5 Transcribe Live, confirm it uses the key saved for batch without asking again, that interim text appears in the capsule while speaking, and that the inserted text matches the final transcript with the last words present once. Record the delay from hotkey release to insertion next to batch (848 to 1,026 ms against 4,022 ms in the 2026-09-28 dev-build smoke test). Cancel mid-dictation and confirm nothing is inserted. Confirm a user whose saved provider is batch Gemini still gets batch after upgrading.

## Upgrade and coexistence

Pipeup uses its own app, executable, database, and credential identifiers. The first-run import copies old shared-identity data only after the user chooses it. See [Identity migration](../architecture/identity-migration.md) for the exact behavior.

Test fresh setup, **Import a copy**, and **Start fresh** with a packaged release. Seed the old directory with settings, a saved credential, history, and dictionary entries. Confirm import preserves them in Pipeup, turns off Pipeup's auto-start setting, and leaves the source untouched. Also test an incompatible or unreadable legacy database and an unavailable credential store. Confirm a second Pipeup launch does not offer import again. Install original OpenTypeless beside Pipeup, give each a different shortcut, and verify both launch independently with separate data and macOS permission entries. Test the release artifacts on Windows, both macOS architectures, and Linux; a debug bundle is not a packaged upgrade test.

## macOS release signing

The macOS release jobs require a PKCS#12 certificate named `Pipeup Release` in the `MACOS_CERT_P12_BASE64` and `MACOS_CERT_P12_PASSWORD` repository secrets. Missing secrets or a certificate with a different name fail the jobs. Both secrets were rotated on 2026-09-27. Check their update times before tagging:

```bash
gh secret list -R azhurb/pipeup
```

To replace the certificate again, run:

```bash
set -o pipefail
scripts/create-release-cert.sh | gh secret set -f - -R azhurb/pipeup
```

After building, inspect each macOS DMG's app signature with `codesign -dv --verbose=4 /path/to/Pipeup.app` and confirm `Authority=Pipeup Release` and `Identifier=com.azhurb.pipeup`. Keep the certificate private and do not put its output in logs or a commit. Rotating the certificate changes macOS's designated requirement, so installed copies may need Microphone and Accessibility permission again. See [Troubleshooting](troubleshooting.md) for recovery.

## Repository changes

The repository was renamed to `azhurb/pipeup` on 2026-09-26. Origin, package metadata, app source links, templates, active documentation, and stacked PR links use the new name. The repository left the GitHub fork network on 2026-09-26 and is now standalone. Upstream attribution and the MIT license are preserved.

The repository description is "Voice input for desktop with your own speech and AI providers." Topics are `voice-input`, `speech-to-text`, `tauri`, `macos`, `windows`, `linux`, and `byok`, applied and verified on 2026-09-26.

Issues remain disabled; enabling them is a separate product decision. Fork detachment is complete, verified through the GitHub API (`fork: false`, no parent).

See GitHub's [rename guidance](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository) for redirect behavior and exceptions. Name and trademark clearance still needs maintainer judgment.

## Publish and verify

Merge the independent identity and provider update PR before tagging. Follow [Cutting a release](commands.md#cutting-a-release). Manual dispatch must use the explicit repository and hardened workflow on `main`; it checks out the requested existing tag before syncing versions. The workflow creates a draft with installation and migration copy; it does not verify the artifacts or publish automatically.

Before publishing, add release highlights, tested platforms, and known limitations. Confirm Windows, both macOS architectures, and Linux artifacts match the intended version and show Pipeup branding. Record any untested platform explicitly. Remove the workflow's draft-only checklist from the public release body.

If publishing a draft created before the independent identity change, replace its old upgrade instructions with the current [first-run import guidance](../../README.md#upgrading-from-opentypeless-or-an-earlier-pipeup-build). A rebuilt artifact alone does not update existing draft text.

After publication, verify the download links and the README's release destination. Keep the legacy data and credential files in place; the import is a copy.

## Release verification record, 2026-09-26

The rebrand and follow-up PRs #58 through #63 are merged. CI passed, and [release run 36258627560](https://github.com/azhurb/pipeup/actions/runs/36258627560) successfully built macOS arm64, macOS x64, Windows, and Linux artifacts from tag `v0.9.0`, commit `6cc4f4dc745a978b04e7f2878f123e3d7173af71`.

The maintainer installed the Apple Silicon prerelease and reported that it works. Earlier local debug checks confirmed dictation and capsule appearance. Browser checks covered the redesigned screens with synthetic data in light/dark themes at 900 by 700 and 720 by 480. Frontend regression coverage passed 259 tests, and four release-dispatch tests passed.

Windows, Linux, and Intel Mac runtime checks are not confirmed. Detailed data preservation, startup, cancellation, and shortcut-conflict checks are not separately confirmed by the general installation report. Release notes disclose these limits. macOS builds remain self-signed rather than notarized, and Accessibility may retain the previous OpenTypeless label.

The maintainer authorized stable publication after the documentation/rebranding review. Promotion reuses the exact prerelease assets and tag that were tested. The versioned changelog is recorded on `main` after the prerelease tag; the existing tag is not moved or rebuilt for this documentation-only update. Future releases should fold the changelog before tagging as described in [Commands](commands.md#cutting-a-release).

After promotion, verify the latest-release destination and download links. No SQL, database migration, backfill, or cache cleanup is required. The current P icon is retained; a further icon redesign is separate optional work.

Version 0.9.0 was published on 2026-09-26. The independent app identity, new signing certificate, and provider updates in this PR were not part of its artifacts. Before publishing their first packaged release, complete the product, upgrade, coexistence, signing, and platform checks above. Preserve legacy data after an import.
