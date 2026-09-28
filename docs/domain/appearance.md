# Appearance

Pipeup is the displayed product name. The developer-focused interface uses warm neutral surfaces, a vermilion accent, restrained motion, and clear provider configuration. Light, dark, system theme, and reduced-motion preferences are supported.

## Interface

- `src/styles/globals.css` owns the palette and shared surface styles. Existing `jelly-*` class names are compatibility hooks; their appearance is now flat.
- `MainLayout` owns the primary sidebar. Overview, History, and Dictionary are primary destinations; Settings stays at the bottom of the sidebar. Settings has General, Dictation, AI processing, Privacy, and About pages with addressable routes and explicit Save/Discard changes behavior.
- Active recording, transcription, polishing, and completion all use an 88 by 32 logical-pixel capsule. `useCapsuleResize` adds the native window padding. Recovery messages retain their larger sizes.
- Normal recording and processing have no visible text. State labels remain available to assistive technology. See [Voice input](voice-input.md#recording-feedback) for cancellation, recording limits, and recovery behavior.

## Brand assets

`src-tauri/icons/app-icon.svg` is the flat vermilion-and-ivory app icon source. `tray-icon.svg` is the monochrome mark. The PNG, ICO, and ICNS files are generated assets; the frontend shares them rather than maintaining another drawing. The macOS tray uses a template icon so the system controls its color. Windows and Linux use the colored app icon.

Regenerate assets using the commands in [Commands](../references/commands.md#brand-icons).

## App identity

The display name, native window titles, permission copy, and tray tooltip use Pipeup. The repository is `azhurb/pipeup`; historical upstream attribution and copyright are retained.

The bundle identifier is `com.azhurb.pipeup`; the native executable and frontend npm package are named `pipeup`. The old `com.opentypeless.app` data remains available for an optional first-run copy. Release builds use the `Pipeup Release` signing certificate. See [Identity migration](../architecture/identity-migration.md).

The macOS bundle is `Pipeup.app`, separate from `OpenTypeless.app`. The two can remain installed together; running both requires distinct global shortcuts. Repository fork detachment is a separate decision. See [release preparation](../references/release-preparation.md).

Name availability and trademark clearance are outside this implementation and remain unverified.
