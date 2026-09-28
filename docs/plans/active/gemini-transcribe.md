# Gemini Transcribe

`gemini-3.5-transcribe` is registered as a batch STT provider (`gemini-transcribe`). This file
tracks what is left open after live verification.

Landed: provider in `src-tauri/src/stt/gemini.rs`, factory arm, `SttConfig.custom_vocabulary`
fed from the user's dictionary, connection test / benchmark via a free model read, pre-warm,
frontend ID and label. See [Providers → Gemini Transcribe](../../architecture/providers.md#gemini-transcribe-batch).

## Verified against the live API on 2026-08-27

Run with a real key; each row is a request that returned 200 and parsed. The end-to-end check
is `stt::gemini::tests::live_round_trips_against_the_real_api`, ignored by default:

```bash
GEMINI_API_KEY=... GEMINI_TEST_WAV=/path/to/16k-mono.wav \
  cargo test --manifest-path src-tauri/Cargo.toml --lib stt::gemini::tests::live -- --ignored --nocapture
```

- **Inline base64 audio works.** `{"type": "audio", "data": "<base64>", "mime_type": "audio/wav"}`
  is accepted, so the Files API and its extra round-trip are not needed.
- **The field names are right, and that is proven rather than assumed.** The API rejects an
  unknown parameter with a 400 (`custom_vocabularyy` → *"Unknown parameter … at
  generation_config.transcription_config"*), so `custom_vocabulary`, `language_codes` and `mode`
  returning 200 means they are recognized, not silently swallowed.
- **`mode.type` is enum-validated** to exactly `smart` and `verbatim`, which is the mapping
  `smart_format` uses.
- **The transcript is not where the docs say.** There is no `output_text` at the REST top level;
  the live response has `id`, `status`, `usage`, `created`, `updated`, `service_tier`, `steps`,
  `object`, `model`. `interaction.output_text` is the SDK accessor. `parse_response` reads
  `steps[].content[].text` (filtered to `type == "text"`) and keeps the `output_text` check
  first only as forward compatibility.
- **No detected-language field exists** anywhere in the response, so returning `None` is correct
  rather than a gap. History rows show no language for this provider, as with AssemblyAI.
- **`language_codes` is *not* validated.** A bare `en` and a gibberish `xx-YY` both return 200,
  so the region mapping in `bcp47()` is about keeping to the documented shape, not about
  avoiding a rejection.
- **`mime_type` is not validated either** (`audio/banana` returns 200), so the format is sniffed
  and the MIME we send is not load-bearing.

## Smart mode corrected on 2026-09-27

The previous request used `mode: {"type": "smart"}`. Google accepted that shape, but
paired trials on synthetic and real microphone samples produced no visible smart-mode effect:

| Parameter | Sample | Paired trials | Result |
| --- | --- | --- | --- |
| `custom_vocabulary` on/off | `say`-synthesized | 3 | byte-identical |
| `custom_vocabulary` on/off | real microphone | 2 | byte-identical |
| `mode: smart` vs `verbatim` | `say`-synthesized, disfluent | 2 | byte-identical, fillers retained in both |
| `mode: smart` vs `verbatim` | real microphone, spoken digits | 3 | byte-identical |

The current [transcription guide](https://ai.google.dev/gemini-api/docs/transcribe) sends
`mode: "smart"` for plain smart transcription. Pipeup now sends that string. A live run of
`stt::gemini::tests::live_round_trips_against_the_real_api` with a synthetic 7.4-second WAV
returned `I had three meetings on Tuesday: 1. Review budget 2. Send a recap` after about
four seconds. The spoken fillers were removed and the list was formatted. This verifies the
new request shape and the Rust response parser against the current API. It does not prove
the full effect of `custom_vocabulary`; repeat that paired trial with the new shape before
claiming dictionary biasing works.

Keep LLM polish optional for users who want more rewriting than smart transcription provides.

## Latency: a flat cost per dictation

Measured 2026-08-28 from eleven real dictations through the app (log line pairs
`Gemini Transcribe: sending Xs of audio` to `Gemini Transcribe transcription: N chars`):

| Audio length | API round-trip |
| --- | --- |
| 2.2 s | 3.15 s |
| 2.2 s | 3.73 s |
| 3.1 s | 3.06 s |
| 6.7 s | 3.51 s |
| 9.1 s | 3.00 s |
| 9.3 s | 4.14 s |
| 15.1 s | 3.84 s |

The round-trip is essentially independent of how much audio is sent: a seven-fold increase in
audio length costs about 20% more time. This is fixed overhead, not throughput. The pipeline's
whole `stop()` ran 2.8 to 4.5 s, of which the STT step is nearly all.

The practical consequence is that this batch provider adds about three to four seconds after
hotkey release in these samples. A per-provider latency comparison against Groq Whisper on the
same machine has not been done yet. The separate Gemini Live transcription model streams
partials during speech and is the path to evaluate if shorter post-recording waits are required.

**Needs confirmation**: whether the flat cost is model warm-up, the inline-base64 upload, or
queueing. The upload is the cheapest to rule out, since request size does scale with audio length
and the timings do not.

## Deferred

- **`gemini-3.5-transcribe-live`.** The streaming counterpart over the Live API, in the shape of
  `stt::deepgram`: partials during the utterance instead of one request at the end. Roughly twice
  the price (~$0.009/min blended against ~$0.005/min). Worth doing only if the batch round-trip
  measures badly against the streaming providers.
- **Vocabulary biasing for the other providers.** `SttConfig.custom_vocabulary` now reaches every
  provider and only this one reads it. Deepgram keyterms and AssemblyAI word boost are the
  equivalents, and unlike this provider's version they may actually do something — worth wiring
  on their own merits rather than waiting on the question above, which is settled.
- **Regional language variants.** Settings offers bare ISO-639-1 codes only, so `en-GB` spelling
  or `pt-PT` cannot be asked for. Exposing variants is a `LANGUAGES` change that affects every
  provider's mapping.
