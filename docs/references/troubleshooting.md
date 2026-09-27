# Troubleshooting

Short list of failure modes that surface in user reports.

## macOS: Accessibility still lists OpenTypeless

Pipeup now uses `com.azhurb.pipeup`. An existing OpenTypeless entry belongs to the old `com.opentypeless.app` identity and does not grant Pipeup Accessibility access. Enable the separate **Pipeup** entry in System Settings > Privacy & Security > Accessibility. If it is absent or ineffective, use the recovery steps below and select the exact `Pipeup.app` bundle you run. Do not delete either app's data to fix a permission entry.

The old shared-identity builds could appear under the OpenTypeless name. For upgrades, see [the first-run import](../../README.md#upgrading-from-opentypeless-or-an-earlier-pipeup-build). A debug bundle and a packaged bundle may have different signatures and need separate permission recovery.

## macOS: "I press the hotkey but nothing happens"

### Microphone is denied or restricted

Pipeup refuses to start the pipeline when macOS reports the Microphone authorization status as `denied` or `restricted` - letting `cpal` try to open the input device would fail silently and the macOS prompt is one-shot per install.

Fix:

1. System Settings → Privacy & Security → **Microphone**
2. Toggle Pipeup on (or add it if it isn't listed)
3. Re-press the hotkey

The main window also shows a red **Microphone denied** banner with a one-click deeplink to the right pane.

### Accessibility is granted but paste does nothing

macOS keys Accessibility (TCC) grants by bundle ID *plus* code signature. When a new build with a different signing identity replaces an older OpenTypeless.app - common for self-signed local builds, ad-hoc-signed dev builds, or fork-built bundles - the entry remains in System Settings but the OS silently denies it because the signature hash doesn't match. CGEventPost then drops every synthesised key without surfacing an error.

Pipeup detects this on the next paste attempt (`AXIsProcessTrusted()` returns false even though the entry exists) and surfaces the Accessibility banner. The user-visible symptom is "I granted permission but paste still doesn't work."

Fix:

1. System Settings → Privacy & Security → **Accessibility**
2. Select the ineffective Pipeup entry, then click `-` to remove that entry
3. Click `+` and select the exact `Pipeup.app` bundle you intend to run
4. Toggle that entry on; quit and reopen Pipeup if macOS asks
5. Dictate again

## macOS: credential prompts after an upgrade

Current macOS builds store provider keys in an owner-only file, not the login Keychain. This avoids repeated Keychain prompts for self-signed builds. See [Storage](../architecture/storage.md#credentials-os-credential-vault) for the exact persistence and migration behavior.

A Keychain prompt may come from an older app copy or a custom build using the system vault. Quit any old OpenTypeless copy and confirm which app is requesting access. Keep credential files and application data intact; removing them is not part of the Pipeup upgrade.

Release signing still uses the existing `OpenTypeless Release` certificate. The certificate name is an internal build identifier; Pipeup's bundle identifier is separate. Inspect a bundle's designated requirement with:

```bash
codesign -d -r- /Applications/Pipeup.app
```

## macOS: "I granted Microphone but it never appeared again"

The macOS Microphone dialog is one-shot per install. If you dismissed or denied it, the only path forward is System Settings → Privacy & Security → Microphone. The onboarding Permissions step surfaces a deeplink button for this case.

## "Editing selected text by voice does nothing"

Check these in order:

1. **Is AI processing on?** Settings > AI processing. The LLM is what applies the spoken instruction, so with polish off the setting does nothing at all. The toggle is disabled in that state and says so, but a config saved by an older version can still have the feature on with polish off - turn polish on and the gate clears.
2. **Was the text still selected when you pressed the hotkey?** Clicking into another window to reach the capsule drops the selection in most apps. Use the hotkey, not the capsule, and keep focus where the text is.
3. **Did the capsule show the amber ring?** No ring means no selection was found and the dictation was inserted as ordinary text rather than treated as an instruction. The ring is now a complete signal, so this is decisive.
4. **Which app is it?** Editing works wherever macOS Accessibility can read the selection, which includes native apps and text fields in a browser. It does **not** work in Monaco-based editors - VS Code, Cursor - which publish no focused element to Accessibility at all, nor anywhere off macOS. If you are on 0.8.0 or 0.8.1 and it works nowhere, that is a known bug fixed after 0.8.1: the app was asking the wrong Accessibility element and the read failed in every app. See [Pipeline → Selected-Text Capture](../architecture/pipeline.md#selected-text-capture).
5. **Was what you said plausibly an instruction?** Dictating ordinary prose with something selected is treated as dictation, deliberately: the alternative is mangling a paragraph because you happened to have it highlighted.
6. **Password fields are never read**, by design.

Nothing is lost when an edit fails: the selection is left untouched and the error is surfaced. The raw transcript is never pasted over selected text.

## "The capsule showed an error I couldn't read"

Provider failures are reported as `<stage>: <reason>` - the stage says which step failed, which matters when STT and the LLM are different providers with separate quotas (the recommended Groq + Google pairing, for instance). `Speech` is transcription, `Polish` is the AI rewrite of a dictation, `Edit` is a selected-text rewrite.

| Message | What happened | What to do |
|---|---|---|
| `…: daily quota reached` | The provider's per-**day** budget is spent | Wait for the reset, or switch provider in Settings |
| `…: rate limited` | A per-minute limit; already retried three times | Wait a moment and dictate again |
| `…: API key rejected` | The provider refused the key (401 / 403) | Re-enter it in Settings |
| `…: out of credit` | The account has no balance | Top up, or switch provider |
| `…: model not found` | The configured model name isn't available to this key | Fix the model in Settings |
| `…: request too large` | The recording or the selected text exceeded the provider's limit | Dictate in shorter passes; select less text |
| `…: provider unavailable` | Provider-side 5xx | Try again shortly |
| `…: cannot reach provider` / `provider timed out` | Network or DNS, or the provider never answered | Check connectivity |
| `No speech detected` | Transcription succeeded and returned nothing | Check the input device and that the hotkey was held while speaking |

`No speech detected` means what it says: the microphone is the thing to check *only* for that message. Before 0.7.1 it was also shown when the STT provider itself failed, which sent people looking at their microphone over what was actually an exhausted quota.

Transient capsule errors clear after 2.5 s. Microphone and Accessibility errors remain visible and open the relevant System Settings pane when clicked. The provider's full response - status, body, model - is logged at error level. `Needs confirmation:` a packaged build currently logs to stdout only, so on a Finder launch there is nothing to read afterwards; launching the binary from a terminal (`/Applications/Pipeup.app/Contents/MacOS/pipeup`) is the only way to capture it today.

An `Edit` failure never costs you anything: the selection is left exactly as it was. A `Polish` failure still pastes the raw transcript.

## Non-macOS

The in-app Permissions step is macOS only. On Linux and Windows, check the default input device and any operating-system microphone privacy controls if recording fails.

Editing selected text by voice is **macOS only**, and the Settings toggle is disabled on Windows and Linux. Reading the selection needs macOS Accessibility; the Ctrl+C capture that used to stand in for it was removed because it could not distinguish a real selection from an app copying the current line. Everything else - dictation, polish, translation, dictionary - works normally.
