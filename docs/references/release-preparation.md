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

Test an upgrade with existing settings, a saved credential, history, and dictionary entries. Follow the README's old-app removal instructions. Confirm only one app starts and permissions recover without deleting application data. Verify both a fresh installation and an upgrade using the packaged release, not just development mode.

## Repository changes

The repository was renamed to `azhurb/pipeup` on 2026-09-26. Origin, package metadata, app source links, templates, active documentation, and stacked PR links use the new name. The fork relationship and upstream attribution are preserved.

A maintainer must separately authorize outward changes:

- Update the repository description and topics, and decide whether to enable Issues. Suggested description: "Voice input for desktop with your own speech and AI providers." Suggested topics: `voice-input`, `speech-to-text`, `tauri`, `macos`, `windows`, `linux`, `byok`.
- Decide independently whether to detach the fork. Detachment is permanent and can remove repository metadata. Review the actual repository history and GitHub's current [detachment guidance](https://docs.github.com/en/pull-requests/how-tos/work-with-forks/detaching-a-fork) before authorizing it. A product rebrand does not require detachment.

See GitHub's [rename guidance](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository) for redirect behavior and exceptions. Name and trademark clearance still needs maintainer judgment.

## Publish and verify

Follow [Cutting a release](commands.md#cutting-a-release). The workflow creates a draft with installation and migration copy; it does not verify the artifacts or publish automatically.

Before publishing, add release highlights, tested platforms, and known limitations. Confirm Windows, both macOS architectures, and Linux artifacts match the intended version and show Pipeup branding. Record any untested platform explicitly. Remove the workflow's draft-only checklist from the public release body.

After publication, verify the download links and the README's release destination. No database migration or data cleanup is required by this rebrand. Do not delete legacy data directories or credential files.

## Local review snapshot, 2026-09-26

The preparation is split into stacked local branches, in review order:

1. `codex/pipeup-design`: brand, icon, palette, and minimal capsule.
2. `codex/pipeup-interactions`: shortcut/save consistency and optional AI setup.
3. `codex/pipeup-navigation`: information architecture, accessibility, localization, and screen consistency.
4. `codex/pipeup-repository`: repository presentation, screenshots, and release guidance.

The final branch contains all four layers. The branches are pushed as PRs [#58](https://github.com/azhurb/pipeup/pull/58), [#59](https://github.com/azhurb/pipeup/pull/59), [#60](https://github.com/azhurb/pipeup/pull/60), and [#61](https://github.com/azhurb/pipeup/pull/61). Merge in order with merge commits, retargeting each dependent PR to `main` after its predecessor merges. Keep parent branches until dependents are retargeted. Squash merges require rebasing the remaining stack. Merging, release publication, and fork detachment still need separate authorization. No database migration is part of this stack.

Local verification on macOS: 253 frontend tests passed; 317 Rust tests passed with one existing ignored test. TypeScript, Prettier, Rust formatting, and Clippy passed. ESLint passed with six pre-existing warnings. An unsigned debug `Pipeup.app` bundle built successfully. The interaction branch was also tested independently: 236 frontend tests passed.

Browser verification used the real React components with synthetic local data at 900 by 700 and 720 by 480. Light/dark appearance, discard, navigation, and refreshed screenshots were checked. Native UI automation was unavailable; real microphone-to-paste dictation, native shortcut conflict handling, packaged upgrade behavior, and Windows/Linux packaging remain to be tested before publishing. The browser preview does not validate those native flows.
