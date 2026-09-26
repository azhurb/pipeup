# Appearance

Pipeup is the displayed product name. The developer-focused interface uses warm neutral surfaces, a vermilion accent, restrained motion, and clear provider configuration. Light, dark, system theme, and reduced-motion preferences are supported.

## Interface

- `src/styles/globals.css` owns the palette and shared surface styles. Existing `jelly-*` class names are compatibility hooks; their appearance is now flat.
- `MainLayout` owns the primary sidebar. Settings panes use a wrapping row of navigation buttons, preserving the existing provider options and explicit Save/Reset behavior.
- Active recording, transcription, polishing, and completion all use an 88 by 32 logical-pixel capsule. `useCapsuleResize` adds the native window padding. Recovery messages retain their larger sizes.
- Normal recording and processing have no visible text. State labels remain available to assistive technology. See [Voice input](voice-input.md#recording-feedback) for cancellation, recording limits, and recovery behavior.

## Brand assets

`src-tauri/icons/app-icon.svg` is the flat vermilion-and-ivory app icon source. `tray-icon.svg` is the monochrome mark. The PNG, ICO, and ICNS files are generated assets; the frontend shares them rather than maintaining another drawing. The macOS tray uses a template icon so the system controls its color. Windows and Linux use the colored app icon.

Regenerate assets using the commands in [Commands](../references/commands.md#brand-icons).

## Identity compatibility

The display name, native window titles, permission copy, and tray tooltip use Pipeup. The repository remains `azhurb/opentypeless`; historical upstream attribution and copyright are retained.

The bundle identifier (`com.opentypeless.app`), credential namespace, database filenames, Cargo executable name, and existing signing certificate identities are deliberately unchanged. This visual rebrand does not move or reset local data and does not detach the repository from its fork network.

The macOS bundle is named `Pipeup.app`; its executable remains `opentypeless`. The previous `OpenTypeless.app` will not be overwritten by that differently named bundle. The [installation instructions](../../README.md#macos) cover retiring the old app copy without deleting its data.

Name availability and trademark clearance are outside this implementation and remain unverified.
