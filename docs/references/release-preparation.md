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

The repository was renamed to `azhurb/pipeup` on 2026-09-26. Origin, package metadata, app source links, templates, active documentation, and stacked PR links use the new name. The fork relationship and upstream attribution are preserved.

The repository description is "Voice input for desktop with your own speech and AI providers." Topics are `voice-input`, `speech-to-text`, `tauri`, `macos`, `windows`, `linux`, and `byok`, applied and verified on 2026-09-26.

A maintainer must separately authorize remaining outward changes:

- Decide whether to enable Issues.
- Decide independently whether to detach the fork. Detachment is permanent and can remove repository metadata. Review the actual repository history and GitHub's current [detachment guidance](https://docs.github.com/en/pull-requests/how-tos/work-with-forks/detaching-a-fork) before authorizing it. A product rebrand does not require detachment.

See GitHub's [rename guidance](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository) for redirect behavior and exceptions. Name and trademark clearance still needs maintainer judgment.

## Publish and verify

Follow [Cutting a release](commands.md#cutting-a-release). The workflow creates a draft with installation and migration copy; it does not verify the artifacts or publish automatically.

Before publishing, add release highlights, tested platforms, and known limitations. Confirm Windows, both macOS architectures, and Linux artifacts match the intended version and show Pipeup branding. Record any untested platform explicitly. Remove the workflow's draft-only checklist from the public release body.

After publication, verify the download links and the README's release destination. No database migration or data cleanup is required by this rebrand. Do not delete legacy data directories or credential files.

## Release status, 2026-09-26

The rebrand stack is merged into `main`: [#58](https://github.com/azhurb/pipeup/pull/58) (design), [#59](https://github.com/azhurb/pipeup/pull/59) (interactions), [#60](https://github.com/azhurb/pipeup/pull/60) (navigation), and [#61](https://github.com/azhurb/pipeup/pull/61) (repository presentation and capsule routing). Post-merge CI, CodeQL, and Typos passed. No Pipeup release has been published; the latest public release remains v0.8.2, with an existing v0.9.0 draft. Recheck remote state before choosing a release version.

The final stack passed all five CI jobs. Local frontend verification passed 259 tests, including capsule routing regressions. An unsigned debug `Pipeup.app` bundle built successfully. The maintainer confirmed dictation works and the capsule looks correct in that bundle. Cancellation was not separately confirmed.

Browser verification used the real React components with synthetic local data at 900 by 700 and 720 by 480. Light/dark appearance, discard, navigation, and refreshed screenshots were checked. Native UI automation could not attach to the packaged app.

The permission follow-up explains the legacy OpenTypeless label in onboarding, the main-window warning, and upgrade guidance. It does not rename macOS's stored permission entry. Packaged fresh-install and upgrade verification, native shortcut conflicts and cancellation, and release artifact checks on Windows, both macOS architectures, and Linux remain outstanding. Follow the full product and upgrade checks above before publication.

Release publication and optional fork detachment still require separate authorization. No database migration, backfill, or cache cleanup is required by the rebrand. After publication, verify download links, a single app instance at login, and successful dictation.
