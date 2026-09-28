# Commands

This page is the canonical command reference. `CLAUDE.md`, `CONTRIBUTING.md`, and CI workflows defer to it. CI mirror: `.github/workflows/ci.yml`.

## Development

```bash
npm run tauri dev
```

Runs Vite on port 1420 and launches the Tauri shell.

To auto-open WebKit devtools for both windows:

```bash
npm run tauri dev -- --features devtools
```

## Production Build

```bash
npm run tauri build
```

Output: `src-tauri/target/release/bundle/`.

## CI triggers

As verified on 2026-09-26, automatic CI is active on this fork. `ci.yml` runs for pushes to `main` and pull requests targeting `main`. Stacked PRs targeting another branch need a manual run. Check actual run results before merging; an absent check is not a successful check.

```bash
gh workflow run ci.yml --repo azhurb/pipeup --ref <branch>
gh run list --repo azhurb/pipeup --workflow ci.yml --limit 5
```

## Frontend Checks (mirrors `check-frontend` in CI)

```bash
npx tsc --noEmit
npx eslint src/
npx prettier --check src/
npx vitest run
```

Targeted Vitest:

```bash
npx vitest run path/to/file
npx vitest -t "pattern"
```

Release dispatch regression checks (also run in frontend CI):

```bash
node --test scripts/tests/release-workflow.test.mjs
```

## Rust Checks (mirrors `check-rust` in CI on Windows / macOS / Linux)

```bash
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

Targeted test:

```bash
cargo test --manifest-path src-tauri/Cargo.toml test_parse_hotkey_ctrl_slash
```

## Audit (CI only, non-blocking)

`npm audit --audit-level=high` and `cargo audit --file src-tauri/Cargo.lock` run in the `audit` job and are `continue-on-error: true`.

## Housekeeping Workflows

`.github/workflows/lock-threads.yml` locks closed issues and PRs after 60 days of inactivity,
nightly at 00:00 UTC. It also accepts `workflow_dispatch`, because a `schedule`-only workflow
cannot be tested from a branch — the trigger exists so a change to it can be verified without
waiting a day:

```bash
gh workflow run lock-threads.yml
gh run list --workflow lock-threads.yml --limit 5
```

**A manual run is not a dry run** — `dessant/lock-threads` has no such mode, so a dispatch locks
every thread that qualifies. Locking is reversible from the thread's own menu, but it is a real
mutation on real PRs; check what qualifies before dispatching.

Note that issues are disabled on this repository, so the `issue-*` inputs and the `issues: write`
permission are currently inert — only PRs are ever locked. They are kept so the workflow behaves
correctly if issues are enabled later.

## Releases

Releases are tag-driven. `.github/workflows/release.yml` triggers on tags matching `v*` and on manual `workflow_dispatch`.

### Cutting a release

1. Refresh tags with `git fetch origin --tags`, then pick the next version above the highest existing `vX.Y.Z` tag (`git tag --sort=-version:refname | head -1`). Check existing drafts with `gh release list --repo azhurb/pipeup`. Replace `vX.Y.Z` below with the chosen version; it is a placeholder, not a runnable version.
2. **Fold the changelog before tagging.** Open a small PR that renames the `[Unreleased]` section in `CHANGELOG.md` to `[X.Y.Z] - YYYY-MM-DD` and merge it. Without this step, `git checkout vX.Y.Z` shows the release's changes under `[Unreleased]` even though they have shipped — the tag points at a commit where the file disagrees with reality.
3. Tag the fold's merge commit on `main` and push the tag:

   ```bash
   git tag vX.Y.Z <merge-commit-sha>
   git push origin vX.Y.Z
   ```

4. **If the release workflow doesn't trigger automatically** (tag-push triggers can stall on this fork), kick it manually:

   ```bash
   gh workflow run release.yml --repo azhurb/pipeup --ref main --field tag=vX.Y.Z
   ```

   The required input must name an existing tag in `vX.Y.Z` form. The hardened workflow on `main` validates it before checkout and builds `refs/tags/<input>`, regardless of the workflow dispatch ref. Missing tags fail checkout; branch names cannot substitute for tags. Release metadata and package versions use the same validated input. The explicit repository prevents the GitHub CLI from dispatching to the upstream fork parent.

5. The `Release` workflow runs four parallel builds: Windows (`x86_64-pc-windows-msvc`), macOS arm64 (`aarch64-apple-darwin`), macOS x86_64 (`x86_64-apple-darwin`), Linux (`x86_64-unknown-linux-gnu`).
6. CI strips the leading `v` and writes the version into `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` *during the build only* — these files stay at `0.1.0` in git. **Do not commit version bumps.**
7. `tauri-apps/tauri-action@v0` uploads the artifacts to a **draft** GitHub Release with download and upgrade instructions plus a draft-only publishing checklist. Add the release highlights, verified platforms, and known issues using the `CHANGELOG.md` entry. Complete [release preparation](release-preparation.md), smoke-test the artifacts, and remove the draft-only section before publishing from the Releases page (default to non-prerelease for visibility).

### Re-running a build for an existing tag

Use the explicit manual command above after this workflow change is merged into `main`. The workflow definition comes from `main`; source code comes from the requested existing tag. This rebuilds without retagging and can replace draft assets. Inspect the existing release and obtain authorization before rerunning; do not silently overwrite published assets. Dispatching an older workflow ref uses that older workflow and does not acquire these safeguards.

## README screenshots

Run `python3 scripts/capture-readme-screenshots.py` from the repository root after changing the interface or screenshot preview settings. It renders the real Overview and AI Settings components with synthetic data from `src/readme-preview.tsx` and writes both README screenshots at 1800 by 1400 pixels for a 900 by 700 interface. It requires Chrome or Chromium; set `CHROME_BIN` if it is not on the path or in the standard macOS location. Do not put real keys or transcripts in the preview.

## Brand icons

The SVG files are the editable sources. Generate the desktop app assets, then regenerate the monochrome macOS tray sizes in a temporary output directory:

```bash
npx tauri icon src-tauri/icons/app-icon.svg --output /tmp/pipeup-app-icons
cp /tmp/pipeup-app-icons/{32x32.png,64x64.png,128x128.png,128x128@2x.png,icon.png,icon.ico,icon.icns} src-tauri/icons/
npx tauri icon src-tauri/icons/tray-icon.svg --output /tmp/pipeup-tray-icons --png 44 --png 128
cp /tmp/pipeup-tray-icons/44x44.png src-tauri/icons/tray-icon.png
cp /tmp/pipeup-tray-icons/128x128.png src-tauri/icons/tray-mark.png
```

Inspect the generated assets before committing. The tray PNG must retain transparency; an opaque background makes macOS template rendering a solid square.

## Needs confirmation

- No docs-only validation command (link checker, freshness check) exists yet. A simple grep-based check would catch the "Tauri command exists in `lib.rs` but no TS wrapper" class of bug.
