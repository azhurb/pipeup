# Security Policy

## Reporting a Vulnerability

Please report security vulnerabilities through [GitHub Security Advisories](https://github.com/azhurb/opentypeless/security/advisories/new).

**Do not open a public issue for security vulnerabilities.**

Your report should include:

- A descriptive title
- Severity assessment (Critical / High / Medium / Low)
- Affected component(s)
- Steps to reproduce
- Impact description

## Security model

Pipeup uses a bring-your-own-key model. There is no Pipeup account service or cloud proxy.

- Audio is sent directly to the configured speech provider. Optional AI processing sends transcript text and relevant context directly to the configured LLM provider.
- API keys are stored separately from settings. macOS uses an unencrypted, owner-only file (`0600`). Windows and Linux use the OS credential store with a local file fallback if unavailable.
- Settings, dictionary, and optional history stay on the local machine. Provider privacy and retention policies apply to requests sent to them.
- The application does not collect telemetry or usage data. CSP is enabled in the Tauri webview.

See the [storage reference](docs/architecture/storage.md) for credential migration and persistence details. Do not include real API keys or personal dictation in vulnerability reports.

## Out of Scope

The following are not considered vulnerabilities:

- Prompt injection in LLM responses (no security boundary to bypass)
- Users exposing their own API keys through misconfiguration
- Issues requiring physical access to the user's machine
- Vulnerabilities in third-party STT/LLM provider APIs
