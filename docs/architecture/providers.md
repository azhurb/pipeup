# Providers

STT and LLM integrations use trait + factory patterns in Rust. Provider IDs also appear in the frontend Zustand store. The IDs in `appStore.ts` and the match arms in the Rust factories must stay in sync.

Used by: [Pipeline](pipeline.md) (calls `create_provider`), [Feature map](../domain/features.md) (user-facing labels).

Evidence: `src-tauri/src/stt/mod.rs`, `src-tauri/src/llm/mod.rs`, `src-tauri/src/retry.rs`, `src/stores/appStore.ts`, `src/lib/constants.ts`, `src/components/Settings/`.

## Pooled HTTP Client

There is exactly one `reqwest::Client` in the app: `crate::HttpClient`, built in `lib.rs::setup` and Tauri-managed. `Client` is `Arc`-backed, so clones share its connection pool and warm TLS sessions.

Both factories take that client by value — `create_provider(provider_name, client)` — rather than an `Option`, so no provider can build its own and silently opt out of the pool. `PipelineHandle` holds a clone (`shared_client`) and hands one to each provider it constructs; the connection-test and benchmark commands in `lib.rs` read it from managed state. Connection reuse matters more now that calls retry: without it every attempt pays a fresh handshake.

## Retry Policy

Provider calls retry transient failures with exponential backoff. The helper lives in `src-tauri/src/retry.rs`; the policy is 3 attempts total, 400 ms backoff doubling to 800 ms, plus a **10 s time budget**: once failed attempts have consumed that much wall-clock, the error surfaces instead of being retried.

The time budget is what makes attempt-counting safe. Provider requests carry a 60 s `reqwest` timeout and a timeout is a transient error, so a count-only policy could sit for three minutes — past `pipeline::STT_FINALIZE_TIMEOUT_SECS` (120 s), which would abandon the transcript, and `LlmProvider::polish` has no outer deadline at all. Retry is worth it while failures are cheap (a 429 or 502 answers in milliseconds, a refused connection immediately); a slow failure means the provider is in trouble and the user is better served by the error. In practice a fast-failing call adds at most 1.2 s.

Retry is **not** uniformly safe across the provider surface, because `SttProvider` is a stateful streaming session:

| Call | Retries | Why |
| --- | --- | --- |
| `SttProvider::connect` (Deepgram, AssemblyAI) | Yes | No session state exists yet; a failed handshake is a clean slate |
| `SttProvider::send_audio` | No | A mid-stream resend reorders or duplicates audio |
| `SttProvider::recv_transcript` | No | Same — the session is stateful |
| Whisper-compatible file upload (in `disconnect`) | Yes | One idempotent multipart POST, and nothing is on screen yet |
| `LlmProvider::polish` | Request head only | Retries `send()` plus the status check; stops once chunks reach the callback, since re-running would duplicate text the user can already see |
| Connection tests / benchmarks (`lib.rs`) | No | User-initiated; a failure is the answer they asked for |

**What counts as transient:** HTTP 429 and 5xx, `reqwest` connect/timeout errors, and WebSocket handshake failures at the socket layer (`tungstenite::Error::Io`) or with a retryable HTTP status. Everything else is fatal on the first attempt — a bad key, a malformed request or an exhausted quota returns the same answer forever, and retrying it only delays the error the user needs to see. An error the classifier does not recognize is treated as fatal.

**One exception a status code cannot express:** a 429 against a per-**day** budget is not transient. Three attempts spread over 1.2 s cannot outlast a quota that resets tomorrow, so retrying only makes the user wait longer for the same answer. `is_retryable` looks for the phrasings providers use for a daily limit (`per day`, `(TPD)`, `(RPD)`, `daily` — Groq and OpenAI word it differently) and treats those as fatal, while a per-minute limit stays retryable because that one really does clear while the backoff runs. The check lives in `is_retryable` rather than `is_retryable_status` because the distinction is in the response body, not the status; a bare 429 status is still classed as transient.

`retry::classify` does the cause-chain walk once and returns a `FailureKind` (`Status`, `Timeout`, `Unreachable`, `Unknown`); `is_retryable` is a match over it. The pipeline uses the same function to word the capsule's error message, so the retry policy and what the user is told about a failure can never disagree about what went wrong — see [Pipeline → Events](pipeline.md#events).

Classification survives the `anyhow` boundary via `retry::HttpStatusError`, which carries the status while displaying the provider's own message. This is the part that rots silently: replacing it with a plain `anyhow::bail!` erases the status and turns every transient 503 back into a lost dictation, so both call sites (`stt::whisper_compat::upload_error`, `llm::openai::api_error`) are unit-tested for it.

**Retries are silent.** The capsule already shows a progress state for the step being retried, and a "retrying 2/3" surface would turn a recovery nobody was meant to notice into an apparent fault. Attempts are logged at warn level instead. Revisit only if retries turn out to take long enough to read as a hang.

## STT Providers

Trait in `src-tauri/src/stt/mod.rs`:

```rust
async fn connect(&mut self, config: &SttConfig) -> Result<()>;
async fn send_audio(&mut self, chunk: &[u8]) -> Result<()>;
async fn recv_transcript(&mut self) -> Result<Option<TranscriptEvent>>;
async fn disconnect(&mut self) -> Result<DisconnectResult>;
async fn abort(&mut self) {} // default: nothing to do
fn name(&self) -> &str;
```

`abort` runs instead of `disconnect` when the user cancels: the STT task checks the pipeline's `abort_flag` when the audio channel closes. The default does nothing, which is enough for the file-based providers (dropping them drops the buffered audio, and they no longer upload a cancelled dictation). `gemini-transcribe-live` overrides it to close its socket without finishing the turn.

`TranscriptEvent` variants: `Partial`, `Final { text, confidence, language }`, `SpeechStarted`, `SpeechEnded`, `Error`. The `language` field on `Final` carries an ISO-639-1 code when the provider reports detected language (Deepgram in multi mode; AssemblyAI does not currently report it).

`DisconnectResult` is `Option<(String, Option<String>)>` — file-based providers return `(text, detected_language)` on close. Streaming providers return `Ok(None)` and emit `Final` instead.

`SttConfig.custom_vocabulary` carries the user's dictionary words (the same list the polish prompt gets, cloned in `pipeline.rs` before the polish path `take()`s the preloaded copy). Only `gemini-transcribe-live` reads it today; every other provider ignores it, the way the Whisper-compatible ones ignore `smart_format`. Deepgram keyterms and AssemblyAI word boost are the per-provider equivalents and are not wired — see [`../plans/active/gemini-transcribe.md`](../plans/active/gemini-transcribe.md).

### Language hint mapping rule

`SttConfig.languages: Vec<String>` carries the user's selection (empty = auto-detect). Adapters map it to each provider's wire format:

- **Whisper-compatible** (`openai-whisper`, `groq-whisper`, `glm-asr`, `siliconflow`): the form field `language=<code>` is sent **only when `languages.len() == 1`**. Both 0 and >1 omit the field and let Whisper auto-detect — the Whisper API doesn't accept a set. All Whisper-compat requests also include `response_format=verbose_json` so the response carries the detected `language`.
- **Deepgram**: URL `?language=<code>` when `languages.len() == 1`; otherwise `?language=multi` (Deepgram's native multi-language mode handles both empty-set and many-set).
- **AssemblyAI**: the streaming WebSocket URL does not accept a language hint today; the field is silently ignored. Follow-up.
- **Gemini Transcribe Live**: the only provider that takes the selection as a *set*. `language_codes` is a JSON array and the model handles code-switching between the entries, so a multi-language selection reaches the wire intact instead of degrading to auto-detect. The API wants region-tagged BCP-47 (`en-US`, `es-ES`) while `SttConfig.languages` holds ISO-639-1, so `gemini_live::bcp47` maps each code and picks a region per language; an unmappable code is **dropped** rather than passed through, because an unknown tag risks a 400 that loses the utterance while auto-detect still produces text. An empty set omits the field.

The multi-element selection in the UI is primarily a hint to the **polish prompt** (which receives the full `user_languages` set via `PolishRequest`) rather than the STT. The pipeline-level polish therefore biases toward the user's languages even when the wire-level STT request can't carry them.

### Verbose-json language extraction (Whisper-compat)

`response_format=verbose_json` returns a `language` value that providers spell either as ISO-639-1 (`"en"`) or as a lowercase English name (`"english"`). `whisper_compat::normalize_language` accepts both and silently falls back to `None` for unrecognized values — so a provider that omits the field, or returns a label outside our small table, simply produces a transcript with no detected-language badge rather than crashing. **Needs confirmation**: whether GLM-ASR and SiliconFlow honor `response_format=verbose_json` — both currently ignore unknown form fields, so requests succeed either way; only the badge is missing when they don't.

### Provider IDs in `create_provider`

Match arms currently registered in `stt::create_provider`:

- `deepgram`
- `assemblyai`
- `gemini-transcribe-live`
- `gemini-transcribe`
- `glm-asr`
- `openai-whisper`
- `groq-whisper`
- `siliconflow`
- `_` (default) → falls back to GLM-ASR.

`glm-asr`, `openai-whisper`, `groq-whisper`, and `siliconflow` share `WhisperCompatProvider` with different endpoints, models, and extra fields.

### Gemini Transcribe (batch, removed)

`gemini-transcribe` ran `gemini-3.5-transcribe` over the Interactions API and was removed on 2026-09-28: Live returns the same text about three seconds sooner, and the batch option only added a choice nobody needed. A saved `gemini-transcribe` is moved to `gemini-transcribe-live` when the config loads (`storage::migrate_legacy_config`), and the Gemini key stays under the batch id, which Live already reads (below). Its verification notes are in git history (`src-tauri/src/stt/gemini.rs` before removal) and in [`../plans/active/gemini-transcribe.md`](../plans/active/gemini-transcribe.md). Two findings carry over to Live: the plain string form of the smart mode visibly removes fillers and formats lists (2026-09-27), and vocabulary biasing still needs a paired trial.

### Gemini Transcribe Live (streaming)

`gemini-transcribe-live` runs `gemini-3.5-transcribe-live` over the Live API: a WebSocket to `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent`, implemented in `src-tauri/src/stt/gemini_live.rs`. It is the only Gemini option in Settings and onboarding, and it replaced the batch provider (above).

**Key.** It reads the key saved under the batch provider's id. `credentials::CredentialId::new` maps the STT id `gemini-transcribe-live` onto `gemini-transcribe` (`STT_KEY_ALIASES`), so every read, write, presence check and deletion shares one vault entry. The key goes in an `x-goog-api-key` header rather than the documented `?key=` query parameter, so it never appears in a URL.

**Push-to-talk protocol.** `connect` sends `setup` with `automaticActivityDetection.disabled: true`, waits for `setupComplete` (8 s bound), then sends `activityStart`. Audio streams as base64 `audio/pcm;rate=16000` in 100 ms messages. `disconnect` flushes the remainder, sends `activityEnd`, and waits for the turn's final transcript (10 s bound). Transcription settings (`languageCodes` via `gemini_live::bcp47`, `customVocabulary` capped at 1,000, `mode` `SMART` or `VERBATIM`), in the Live API's camelCase and upper-case spelling.

**Verified against the live API on 2026-09-28**, with a raw WebSocket probe and with the Rust path (`stt::gemini_live::tests::live_streams_speech_against_the_real_api`, `#[ignore]`d since it needs a key and a network). Findings the code depends on:

- **Server messages arrive in binary frames**, `setupComplete` included. `frame_text` accepts binary and text frames; the shared `drain_final_text` helper ignores binary frames, which is one reason this provider has its own reader.
- **Interim text is cumulative per turn.** Each `interimInputTranscription` repeats and extends the previous one, so the provider replaces its pending text rather than appending. The first interim can be a vocabulary term the model has not actually heard yet (`Pipeup` appeared before `Hi team`); interim text is display-only, so this never reaches the document.
- **One final per activity**, even across a three-second pause, because server-side VAD is off. After `activityEnd` the server sent `inputTranscription`, then `generationComplete`, then a `voiceActivity` `ACTIVITY_END`, all within a millisecond, 225 to 550 ms after `activityEnd`. Silence produces `ACTIVITY_END` alone.
- **A bad key passes the handshake.** The server accepts the socket and closes it with code 1007 and "API key not valid" once it reads `setup`, so `connect` waits for the close frame. `close_error` maps close reasons onto HTTP statuses so `retry::classify` words them correctly ("API key rejected", "rate limited"); only 1011 and 1013 are retried.

**Finalization rules** (the pure `Transcript` state and `await_final`, unit-tested with scripted streams). A final replaces the interim it confirms, a repeated or cumulative final is merged rather than appended, and an interim after the final is ignored. The wait ends on `generationComplete` or `ACTIVITY_END` once a final is in. `ACTIVITY_END` without a final starts a 300 ms grace for a late final; the observed order makes that unnecessary, but it is observed rather than documented, and it only delays a silent recording. The final goes back through `DisconnectResult`, so the pipeline inserts it once.

**Failures.** A timeout, a close, or a send failure before the final keeps the latest interim text rather than losing the dictation, and logs a warning; an error is returned only when there is no text. If the session drops while recording, `recv_transcript` hands the interim over as a `Final` and then returns the error, which the pipeline records without showing (the text may be enough). Speech after a mid-recording drop is lost. The Live API documents a 10-minute session limit, shorter than the 12.5-minute audio cap of the file-based providers; past it the same salvage applies. **Needs confirmation**: how the server ends a session at that limit (`goAway` is parsed and logged, but was not observed).

**Latency and price.** On synthetic speech (8 s), the final arrived 300 to 513 ms after release in the Rust live test, against 3.1 to 3.5 s for batch on the same audio, with identical text. The first interim appeared 0.7 to 1.1 s after capture started. In the native app, hotkey release to finished insertion took 848 and 1,026 ms with Live (STT 380 and 556 ms) and 4,022 ms with batch (STT 3,553 ms). Google's pricing page lists Live at $3.50 per million input tokens against $2.00 for batch (about $0.009 against $0.005 per minute including output), both with a free tier, as of 2026-09-28.

### Connection tests and benchmarks

`test_stt_connection` and `bench_stt_connection` in `lib.rs` probe a key without running a dictation. The key comes either from the command's `api_key: Option<String>` (a candidate the user typed but has not saved) or, when that is `None`, from the credential vault — see [Storage → Credentials](storage.md#credentials-os-credential-vault). Probing never persists the candidate. Deepgram and AssemblyAI use a cheap authenticated `GET`. The Whisper-compatible providers upload a 0.1 s silent WAV, sharing endpoint/model/extra-field resolution through `whisper_compat_test_target`.

`gemini-transcribe` and `openai-whisper` are the exceptions, for the same reason. OpenAI bills every `/audio/transcriptions` call, so the upload probe charged the user to verify their own key — a real annoyance in a BYOK app. It now reads `GET /v1/models/whisper-1` instead, which proves the key is accepted for free. `gemini-transcribe` reads `GET /v1beta/models/gemini-3.5-transcribe` for the same reason (and `gemini-transcribe-live` reads `gemini-3.5-transcribe-live`, since access is granted per model), and that probe also catches a case the upload probe cannot: a key that is valid but has no access to the transcription model. The other Whisper-compatible providers keep the upload probe. One consequence worth knowing: the benchmark number shown for `openai-whisper` is now a model-read round-trip rather than a transcription round-trip, so it is not comparable with the other Whisper-compatible providers' figures. **Needs confirmation**: whether GLM-ASR, Groq and SiliconFlow expose an equivalent per-model endpoint, and whether their transcription calls are billed the same way — if both hold, they should move to the same probe.

### Draining the close of a streaming session

`disconnect()` on a streaming provider sends the provider's finish signal and then **reads what comes back** before closing the socket, returning any flushed text through the existing `DisconnectResult` channel (the same one file-based providers use). `stt::drain_final_text` implements the loop; each provider passes its own message parser.

This exists because both providers used to send the signal and shut the socket in the same breath, dropping whatever the server sent in response: for Deepgram the results still pending at `CloseStream`, for AssemblyAI the formatted version of the turn in progress. Since the pipeline accumulates from `Final` events only, that cost the tail of an utterance — and all of it for a dictation short enough to be a single turn.

The drain is bounded twice, because it sits between the user releasing the hotkey and text appearing: a `DRAIN_IDLE_MS` (150 ms) gap with nothing received ends it, and `DRAIN_TOTAL_MS` (600 ms, checked between reads) caps it even if the provider keeps sending. A provider that answers promptly costs only its own flush time. `TranscriptEvent::SpeechEnded` is the stop signal — AssemblyAI's `Termination` maps to it, meaning the server has nothing left; it is the one place that variant is load-bearing.

**Needs confirmation** — the timing constants and the duplication question both want one live dictation per provider to settle: whether 150 ms is long enough for the flush to arrive, and whether AssemblyAI can re-send a formatted turn that was already delivered as a `Final` during the session (per protocol it finalizes only the turn in progress, so the drain does not de-duplicate). The symptom to watch for is a duplicated last sentence rather than a missing one.

### Deepgram result parsing

`deepgram::parse_result_message` turns one `Results` message into a `TranscriptEvent`, kept pure so the protocol handling is unit-tested without a socket. Empty transcripts (keep-alives, metadata, silent segments) yield `None`; `is_final: false` yields `Partial`; a finalized segment yields `Final` with confidence and `channel.detected_language`.

A finalized segment yields its text **even when `speech_final` is set**. Deepgram marks end-of-speech on the message that also carries the last words of the utterance, so treating `speech_final` as a pure signal drops them — and nothing downstream notices, because the pipeline ignores `TranscriptEvent::SpeechEnded` (`pipeline.rs`, `_ => {}`) and drives finalization from the audio channel closing. That was live in the provider until the factory arm was wired up; there is a regression test on it.

**Resolved** (was a `Needs confirmation` on the frontend/factory mismatch): `src/lib/constants.ts` and `src/stores/appStore.ts` expose `deepgram` (label `Deepgram Nova-3`), and the connection-test, benchmark and pre-warm paths in `lib.rs` / `pipeline.rs` have always recognised it — but `stt::create_provider` had no arm for it since the initial commit, so selecting Deepgram silently fell through to the GLM-ASR default and authenticated a GLM-ASR request with a Deepgram key. The arm now exists. `DeepgramProvider` was dead code for that whole period, so its end-to-end behavior is **unverified against the live API** — the parsing is unit-tested, but nothing here has been exercised with a real Deepgram key.

## LLM Providers

Trait in `src-tauri/src/llm/mod.rs`:

```rust
async fn polish(
    &self,
    config: &LlmConfig,
    req: &PolishRequest,
    on_chunk: Option<&ChunkCallback>,
) -> Result<PolishResponse>;

fn name(&self) -> &str;
```

`OpenAiProvider` handles OpenAI-compatible providers via `base_url` + `model`. All registered LLM providers go through it.

Frontend LLM provider IDs (`src/stores/appStore.ts`): `zhipu`, `deepseek`, `siliconflow`, `openai`, `gemini`, `moonshot`, `qwen`, `groq`, `claude`, `ollama`, `openrouter`.

The AI Settings model field is free text. With a configured key, the pane fetches the selected provider's `/models` endpoint, refreshes cached results after one day, and offers a manual refresh button. Changing the provider, base URL, or key clears the cache. This discovery list is provider supplied; the app does not maintain a fixed catalog or automatically replace a user's saved model. Fresh Google Gemini and OpenRouter settings now seed Gemini 3.5 Flash-Lite because Google limits 2.5 access for new projects. DeepSeek's preset uses `deepseek-flash` because the old V4 Flash ID is a temporary compatibility alias. Groq's LLM default remains `openai/gpt-oss-120b` and Groq Whisper uses `whisper-large-v3-turbo`, both listed as production models on 2026-09-27.

## Adding A Provider

When adding a provider, update all of:

- The factory in `src-tauri/src/stt/mod.rs` or `src-tauri/src/llm/mod.rs`. For STT, add the id to `stt::factory_tests::DROPDOWN_IDS` in the same file: that test builds every dropdown id and asserts which provider comes back, so a new id with no arm fails there instead of silently falling through to the GLM-ASR default and sending the wrong provider's key to Zhipu.
- The frontend IDs in `src/stores/appStore.ts` and labels in `src/lib/constants.ts`.
- Connection-test and benchmark match arms in `src-tauri/src/lib.rs`.
- Pre-warm endpoints in `src-tauri/src/pipeline.rs::pre_warm`.
- The Settings UI under `src/components/Settings/`.
- The relevant docs (this file and [Feature map](../domain/features.md)).

This list is the source of truth for the conventions checklist; [`references/conventions.md`](../references/conventions.md) defers to it.

## Needs confirmation

- No documented policy for when a new provider should be bespoke vs OpenAI-compatible vs Whisper-compatible.
- Provider reliability, latency, and quota expectations are not tracked in repo-local docs.
