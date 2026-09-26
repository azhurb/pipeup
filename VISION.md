# Vision

## What is Pipeup?

Pipeup is an open-source, cross-platform desktop application that converts speech to polished text using AI. It combines real-time speech-to-text with LLM-powered refinement, letting users speak naturally and get well-structured written output.

## Origin and audience

Pipeup builds on [OpenTypeless](https://github.com/tover0314-w/opentypeless) by Tover0314. It keeps the local, bring-your-own-key dictation pipeline and develops its own product identity and interface. See the [README credits](README.md#credits) and original copyright notice in [LICENSE](LICENSE).

The first audience is developers and people comfortable configuring API keys and models. The interface should make that control clear, with a quiet recording capsule and useful recovery messages. Broader onboarding can follow without hiding the provider choices.

## Core Principles

- **Privacy first**: BYOK (Bring Your Own Key) model. Your API keys stay on your machine. No mandatory cloud accounts, no telemetry.
- **Cross-platform**: Windows, macOS, and Linux via Tauri.
- **Open source**: MIT licensed. Transparent development, community-driven roadmap.
- **Provider agnostic**: Support multiple STT and LLM providers. No vendor lock-in.

## Current Priorities

1. Stability and reliability across all platforms
2. User experience polish
3. Broader STT provider support (Deepgram, AssemblyAI, Whisper variants, etc.)
4. Broader LLM provider support (OpenAI, DeepSeek, Anthropic, etc.)
5. Internationalization

## Future Directions

- Plugin / extension system for custom workflows
- Voice commands and shortcuts
- Mobile companion app
- Offline STT support
- Team / collaboration features

## What We Won't Merge

- Features that break the privacy-first principle (mandatory cloud accounts, telemetry)
- Forced vendor lock-in to a single provider
- Complexity that doesn't serve a clear user need
