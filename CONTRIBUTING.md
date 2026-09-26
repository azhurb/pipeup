# Contributing to Pipeup

Pipeup is a desktop voice input app for people comfortable configuring their own providers. Changes should make dictation reliable, configuration understandable, and the interface consistent.

## Development setup

Install Node.js 20.19+ or 22.12+, Rust stable, and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/). Clone the repository, run `npm ci`, then `npm run tauri dev`.

Start with the [documentation index](docs/index.md) for architecture and behavior. [Commands](docs/references/commands.md) is the canonical source for builds and validation.

## Making changes

1. Fork the repository and create a branch for one coherent change.
2. Make the change and add meaningful regression coverage for behavior changes.
3. Update matching documentation in the same PR. See [documentation maintenance](docs/references/documentation-maintenance.md).
4. Run the relevant checks from the [command reference](docs/references/commands.md).
5. Open a pull request against `main` with the problem, resulting behavior, and actual verification results.

For a substantial feature, describe the proposed behavior in a draft PR before investing in the full implementation. Small fixes can go straight to a PR. Do not include API keys, personal dictation, or unredacted logs in reports or screenshots. Security reports follow [SECURITY.md](SECURITY.md).

## Review expectations

- Keep existing settings, credentials, history, and dictionary compatible unless a migration is explicitly part of the change.
- Check keyboard navigation, accessible control names, light/dark themes, reduced motion, and English/Chinese text for UI changes. Include screenshots where appearance changes.
- Report platforms actually tested and anything skipped or failing. A check that did not run is not a passing check.
- If documentation is unaffected, say `Docs: not affected.` in the PR description.
- AI-assisted contributions follow the same standard. Disclose substantial AI assistance and review the result before submitting it.

## Code and commits

TypeScript uses strict mode, React, Tailwind, and Zustand. Rust formatting and Clippy checks must pass. Prettier formats frontend code. See [conventions](docs/references/conventions.md).

Use [Conventional Commits](https://www.conventionalcommits.org/), for example `fix: restore shortcut after cancelling capture` or `feat: add a speech provider`. Keep titles specific and avoid bundling unrelated changes.

See [VISION.md](VISION.md) for product direction and [release preparation](docs/references/release-preparation.md) for the rebrand's release checks.
