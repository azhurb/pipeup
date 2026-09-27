# Release preparation

Use this checklist before publishing the Pipeup rebrand. Commands for validation and creating releases remain in [Commands](commands.md#releases). Public installation and upgrade instructions remain in the [README](../../README.md#download-and-setup).

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

The repository was renamed to `azhurb/pipeup` on 2026-09-26. Origin, package metadata, app source links, templates, active documentation, and stacked PR links use the new name. The fork relationship and upstream attribution are preserved.

The repository description is "Voice input for desktop with your own speech and AI providers." Topics are `voice-input`, `speech-to-text`, `tauri`, `macos`, `windows`, `linux`, and `byok`, applied and verified on 2026-09-26.

A maintainer must separately authorize remaining outward changes:

- Decide whether to enable Issues.
- Decide independently whether to detach the fork. Detachment is permanent and can remove repository metadata. Review the actual repository history and GitHub's current [detachment guidance](https://docs.github.com/en/pull-requests/how-tos/work-with-forks/detaching-a-fork) before authorizing it. A product rebrand does not require detachment.

See GitHub's [rename guidance](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository) for redirect behavior and exceptions. Name and trademark clearance still needs maintainer judgment.

## Publish and verify

Merge the permission guidance PR and release-preparation PR before tagging. Follow [Cutting a release](commands.md#cutting-a-release). Manual dispatch must use the explicit repository and hardened workflow on `main`; it checks out the requested existing tag before syncing versions. The workflow creates a draft with installation and migration copy; it does not verify the artifacts or publish automatically.

Before publishing, add release highlights, tested platforms, and known limitations. Confirm Windows, both macOS architectures, and Linux artifacts match the intended version and show Pipeup branding. Record any untested platform explicitly. Remove the workflow's draft-only checklist from the public release body.

If publishing a draft created before the independent identity change, replace its old upgrade instructions with the current [first-run import guidance](../../README.md#upgrading-from-opentypeless-or-an-earlier-pipeup-build). A rebuilt artifact alone does not update existing draft text.

After publication, verify the download links and the README's release destination. Keep the legacy data and credential files in place; the import is a copy.

## Release status, 2026-09-26

The rebrand stack is merged into `main`: [#58](https://github.com/azhurb/pipeup/pull/58) (design), [#59](https://github.com/azhurb/pipeup/pull/59) (interactions), [#60](https://github.com/azhurb/pipeup/pull/60) (navigation), and [#61](https://github.com/azhurb/pipeup/pull/61) (repository presentation and capsule routing). Post-merge CI, CodeQL, and Typos passed. No Pipeup release has been published; the latest public release remains v0.8.2, with an existing v0.9.0 draft. Recheck remote state before choosing a release version.

The final stack passed all five CI jobs. Local frontend verification passed 259 tests, including capsule routing regressions. An unsigned debug `Pipeup.app` bundle built successfully. The maintainer confirmed dictation works and the capsule looks correct in that bundle. Cancellation was not separately confirmed.

Browser verification used the real React components with synthetic local data at 900 by 700 and 720 by 480. Light/dark appearance, discard, navigation, and refreshed screenshots were checked. Native UI automation could not attach to the packaged app.

The 2026-09-26 permission follow-up explained the legacy OpenTypeless label before Pipeup had a separate identifier. Packaged fresh-install and upgrade verification, native shortcut conflicts and cancellation, and release artifact checks on Windows, both macOS architectures, and Linux remain outstanding. Follow the full product and upgrade checks above before publication.

Release publication and optional fork detachment still require separate authorization. After publication, verify download links, separate app and permission identities, and successful dictation. Do not delete legacy data after an import.
