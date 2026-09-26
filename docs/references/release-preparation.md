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

## Upgrade compatibility

Keep `com.opentypeless.app`, the native executable name, database filename, credential identifiers, and existing signing certificate identity. Renaming them requires a separate migration design.

Test an upgrade with existing settings, a saved credential, history, and dictionary entries. Follow the README's old-app removal instructions. Confirm only one app starts and permissions recover without deleting application data. Verify both a fresh installation and an upgrade using the packaged release, not just development mode. Record the name shown in macOS Accessibility for each, and verify the [legacy-name guidance and permission recovery](troubleshooting.md#macos-accessibility-lists-opentypeless-instead-of-pipeup). A debug bundle alongside an installed OpenTypeless copy does not verify the packaged upgrade.

## Repository changes

The repository was renamed to `azhurb/pipeup` on 2026-09-26. Origin, package metadata, app source links, templates, active documentation, and stacked PR links use the new name. The repository left the GitHub fork network on 2026-09-26 and is now standalone. Upstream attribution and the MIT license are preserved.

The repository description is "Voice input for desktop with your own speech and AI providers." Topics are `voice-input`, `speech-to-text`, `tauri`, `macos`, `windows`, `linux`, and `byok`, applied and verified on 2026-09-26.

Issues remain disabled; enabling them is a separate product decision. Fork detachment is complete, verified through the GitHub API (`fork: false`, no parent).

See GitHub's [rename guidance](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository) for redirect behavior and exceptions. Name and trademark clearance still needs maintainer judgment.

## Publish and verify

Merge the permission guidance PR and release-preparation PR before tagging. Follow [Cutting a release](commands.md#cutting-a-release). Manual dispatch must use the explicit repository and hardened workflow on `main`; it checks out the requested existing tag before syncing versions. The workflow creates a draft with installation and migration copy; it does not verify the artifacts or publish automatically.

Before publishing, add release highlights, tested platforms, and known limitations. Confirm Windows, both macOS architectures, and Linux artifacts match the intended version and show Pipeup branding. Record any untested platform explicitly. Remove the workflow's draft-only checklist from the public release body.

After publication, verify the download links and the README's release destination. No database migration or data cleanup is required by this rebrand. Do not delete legacy data directories or credential files.

## Release verification record, 2026-09-26

The rebrand and follow-up PRs #58 through #63 are merged. CI passed, and [release run 36258627560](https://github.com/azhurb/pipeup/actions/runs/36258627560) successfully built macOS arm64, macOS x64, Windows, and Linux artifacts from tag `v0.9.0`, commit `6cc4f4dc745a978b04e7f2878f123e3d7173af71`.

The maintainer installed the Apple Silicon prerelease and reported that it works. Earlier local debug checks confirmed dictation and capsule appearance. Browser checks covered the redesigned screens with synthetic data in light/dark themes at 900 by 700 and 720 by 480. Frontend regression coverage passed 259 tests, and four release-dispatch tests passed.

Windows, Linux, and Intel Mac runtime checks are not confirmed. Detailed data preservation, startup, cancellation, and shortcut-conflict checks are not separately confirmed by the general installation report. Release notes disclose these limits. macOS builds remain self-signed rather than notarized, and Accessibility may retain the previous OpenTypeless label.

The maintainer authorized stable publication after the documentation/rebranding review. Promotion reuses the exact prerelease assets and tag that were tested. The versioned changelog is recorded on `main` after the prerelease tag; the existing tag is not moved or rebuilt for this documentation-only update. Future releases should fold the changelog before tagging as described in [Commands](commands.md#cutting-a-release).

After promotion, verify the latest-release destination and download links. No SQL, database migration, backfill, or cache cleanup is required. The current P icon is retained; a further icon redesign is separate optional work.
