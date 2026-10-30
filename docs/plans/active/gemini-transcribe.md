# Gemini Transcribe

**The batch provider described below was removed on 2026-09-28; `gemini-transcribe-live` replaced it** (see [Providers](../../architecture/providers.md#gemini-transcribe-batch-removed)). The trial history stays for reference. The open vocabulary and region items apply to Live, which sends the same `customVocabulary`, `languageCodes` and mode.

`gemini-3.5-transcribe` is registered as a batch STT provider (`gemini-transcribe`). This file
tracks what is left open after live verification.

Landed: provider in `src-tauri/src/stt/gemini.rs`, factory arm, `SttConfig.custom_vocabulary`
fed from the user's dictionary, connection test / benchmark via a free model read, pre-warm,
frontend ID and label. See [Providers → Gemini Transcribe](../../architecture/providers.md#gemini-transcribe-batch-removed).

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

## Dictation fidelity check, 2026-10-30

Controlled API comparison using synthetic speech, not the user's missing recordings. The
English passage was 151.7 seconds; the Russian passage was 139.5 seconds. Both included
fillers, corrections, numerical details, qualifications, and a question. Separate short
English and Russian recordings asked whether the listener could explain how something works.

Gemini used the app's batch model, inline 16 kHz mono PCM WAV input, `en-US`/`ru-RU`
language hints, and smart-mode object. Its raw results were then sent through the configured
`qwen/qwen3.8-27b` on Groq using the current dictation prompt, General and Chat contexts,
English/Russian language hints, temperature 0.3, 4,096-token ceiling, streaming enabled,
and reasoning disabled. No selection, translation, or dictionary was supplied. The HTTP
harness assembled complete SSE lines before decoding UTF-8; this comparison did not exercise
microphone capture, app detection, or paste delivery.

| Sample | Raw Gemini whitespace-separated words | After General polish | After Chat polish |
| --- | --- | --- | --- |
| Short English question | 7 | 8 | 8 |
| Short Russian question | 6 | 6 | 6 |
| Long English passage | 360 | 361 | 358 |
| Long Russian passage | 237 | 237 | 236 |

Word counts describe these samples only; they are not a fidelity score. All polish responses
completed with `finish_reason: stop`.

The substantive failure was already in the raw Russian smart transcript:

- Source: "Семинар состоится семнадцатого ноября, не девятнадцатого". Smart output set the
  date to **19 November**, reversing the stated correction.
- Smart omitted "Эти группы пересекаются, это не семь разных людей" and "Аллергию нельзя
  считать просто предпочтением", losing the overlapping attendee counts and allergy caveat.
- It also removed the statement that the spoken question was part of the dictation.
- General and Chat polish retained the wrong date and did not recover the missing details.

On the **same Russian audio**, `mode: {"type": "verbatim"}` returned 261 words, preserved
"17 ноября, не 19" and all three qualifications above. General polish of that verbatim
transcript returned 260 words and kept those details. The documented `mode: "smart"` form
returned a byte-identical transcript to the app's smart object. No Gemini request-shape
change is justified by this comparison alone.

Neither the single-sentence collapse nor answering a dictated question reproduced in these
trials. The questions remained questions through both stages. The tests did not exercise
selected-text edit mode, which uses a different prompt. Synthetic speech is a controlled
probe, not evidence of the frequency of failures in natural, stuttering speech.

Initial Groq requests with Python's default User-Agent received HTTP 403; an app-specific
User-Agent succeeded. Two Russian polish requests then hit the per-minute output-token
limit and succeeded after waiting. Neither transport failure was treated as model output.

**Scope correction before release:** these trials used the older local checkout's batch
provider. GitHub main had already replaced it with Gemini Live. They demonstrate a batch
smart-mode fidelity failure, not the cause of the user's Live incidents. The batch provider
remains removed. The release change applies verbatim mode to Gemini Live and keeps optional
polish enabled by default. Live protocol verification is recorded in the release PR.

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
same machine has not been done yet. The streaming counterpart, `gemini-transcribe-live`, landed on
2026-09-28 and finalizes in about half a second on the same audio; see
[Providers → Gemini Transcribe Live](../../architecture/providers.md#gemini-transcribe-live-streaming).

**Needs confirmation**: whether the flat cost is model warm-up, the inline-base64 upload, or
queueing. The upload is the cheapest to rule out, since request size does scale with audio length
and the timings do not.

## Deferred

- **Vocabulary biasing for the other providers.** `SttConfig.custom_vocabulary` now reaches every
  provider and only this one reads it. Deepgram keyterms and AssemblyAI word boost are the
  equivalents, and unlike this provider's version they may actually do something — worth wiring
  on their own merits rather than waiting on the question above, which is settled.
- **Regional language variants.** Settings offers bare ISO-639-1 codes only, so `en-GB` spelling
  or `pt-PT` cannot be asked for. Exposing variants is a `LANGUAGES` change that affects every
  provider's mapping.
