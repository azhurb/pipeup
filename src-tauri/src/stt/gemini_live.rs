use std::time::{Duration, Instant};

use anyhow::Result;
use async_trait::async_trait;
use base64::Engine;
use futures_util::{SinkExt, Stream, StreamExt};
use tokio_tungstenite::{
    connect_async,
    tungstenite::{self, protocol::CloseFrame, Message},
};

use super::gemini::{bcp47, MAX_VOCABULARY_TERMS};
use super::{DisconnectResult, SttConfig, SttProvider, TranscriptEvent, WsStream};

pub const PROVIDER_NAME: &str = "Gemini Transcribe Live";
pub const MODEL: &str = "gemini-3.5-transcribe-live";
pub const WS_URL: &str = "wss://generativelanguage.googleapis.com/ws/\
     google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";
const HOST: &str = "generativelanguage.googleapis.com";

/// How long `connect` waits for `setupComplete`. Measured at ~200 ms after the
/// handshake on 2026-09-28. A bad key does not fail the handshake: the server
/// accepts the socket, then closes it with code 1007 once it reads the setup, so
/// the close frame is what `connect` has to wait for.
const SETUP_TIMEOUT: Duration = Duration::from_secs(8);

/// How long `disconnect` waits for the final transcript after `activityEnd`.
///
/// The final arrived 225-260 ms after `activityEnd` in every live trial, for 3 to
/// 8 seconds of speech. This bound only matters when the service is in trouble,
/// and it sits between the user releasing the hotkey and text appearing, so it is
/// kept far under the pipeline's own 120 s `STT_FINALIZE_TIMEOUT_SECS`.
const FINAL_TIMEOUT: Duration = Duration::from_secs(10);

/// How long to keep reading after `ACTIVITY_END` when no final has arrived yet.
///
/// In every trial the final, `generationComplete` and `ACTIVITY_END` arrived in
/// that order within the same millisecond, and silence produced `ACTIVITY_END`
/// alone. Stopping the instant `ACTIVITY_END` shows up would therefore be correct
/// on the evidence, but the ordering is observed rather than documented, and a
/// final that lands just behind it would be the user's whole dictation. The grace
/// costs nothing when a final already arrived, and only delays the "No speech
/// detected" answer for a silent recording.
const LATE_FINAL_GRACE: Duration = Duration::from_millis(300);

/// Audio is sent in 100 ms messages (3,200 bytes of 16 kHz 16-bit mono), the
/// chunk size the Live API guide recommends. Capture delivers ~20 ms chunks, and
/// sending each one as its own base64 JSON message would be five times the
/// framing for no gain in latency the user can see.
const SEND_CHUNK_BYTES: usize = 3200;

/// Bound on the close handshake, which runs in the background so it never adds
/// to the time before text appears.
const CLOSE_TIMEOUT: Duration = Duration::from_secs(1);

/// Build the Live API `setup` message. Pure so the wire shape is unit-testable.
///
/// Automatic activity detection is disabled because Pipeup is push-to-talk: the
/// hotkey already says exactly when speech starts and ends, and server-side VAD
/// would split a dictation at every pause. With it disabled the server produces
/// one final transcript per `activityStart`/`activityEnd` pair, even across a
/// multi-second pause (verified live on 2026-09-28).
///
/// Language, vocabulary and mode follow the batch provider, but the Live API
/// spells its fields in camelCase and its modes in upper case.
fn build_setup_message(languages: &[String], smart: bool, vocabulary: &[String]) -> String {
    let mut transcription = serde_json::Map::new();

    let codes: Vec<&str> = languages.iter().filter_map(|c| bcp47(c)).collect();
    if !codes.is_empty() {
        transcription.insert("languageCodes".into(), serde_json::json!(codes));
    }

    if !vocabulary.is_empty() {
        let terms: Vec<&String> = vocabulary.iter().take(MAX_VOCABULARY_TERMS).collect();
        transcription.insert("customVocabulary".into(), serde_json::json!(terms));
    }

    transcription.insert(
        "mode".into(),
        serde_json::json!(if smart { "SMART" } else { "VERBATIM" }),
    );

    serde_json::json!({
        "setup": {
            "model": format!("models/{MODEL}"),
            "generationConfig": { "responseModalities": ["TEXT"] },
            "inputAudioTranscription": serde_json::Value::Object(transcription),
            "realtimeInputConfig": {
                "automaticActivityDetection": { "disabled": true }
            },
        }
    })
    .to_string()
}

fn audio_message(pcm: &[u8]) -> String {
    serde_json::json!({
        "realtimeInput": {
            "audio": {
                "data": base64::engine::general_purpose::STANDARD.encode(pcm),
                "mimeType": "audio/pcm;rate=16000",
            }
        }
    })
    .to_string()
}

fn activity_start_message() -> String {
    serde_json::json!({ "realtimeInput": { "activityStart": {} } }).to_string()
}

fn activity_end_message() -> String {
    serde_json::json!({ "realtimeInput": { "activityEnd": {} } }).to_string()
}

/// One thing the server told us. A single message can carry several.
#[derive(Debug, Clone, PartialEq)]
enum ServerEvent {
    SetupComplete,
    /// The whole turn so far, not a delta: each interim repeats and extends the
    /// previous one.
    Interim(String),
    /// The authoritative transcript for the turn.
    Final(String),
    /// `generationComplete` or `turnComplete`: the server has finished the turn.
    TurnDone,
    ActivityEnded,
    /// The server is about to end the session (for example at the 10-minute
    /// limit).
    GoAway,
}

/// Parse one server message. Pure so the protocol is unit-tested without a
/// socket.
///
/// Events come out in a fixed order (interim, final, turn done, activity end)
/// so a message that carries several is applied the way the server sends them
/// when they arrive separately.
fn parse_server_message(raw: &str) -> Result<Vec<ServerEvent>> {
    let v: serde_json::Value = serde_json::from_str(raw)?;
    let mut events = Vec::new();

    if v.get("setupComplete").is_some() {
        events.push(ServerEvent::SetupComplete);
    }

    let content = &v["serverContent"];
    if let Some(text) = content["interimInputTranscription"]["text"].as_str() {
        events.push(ServerEvent::Interim(text.to_string()));
    }
    if let Some(text) = content["inputTranscription"]["text"].as_str() {
        events.push(ServerEvent::Final(text.to_string()));
    }
    if content["generationComplete"].as_bool() == Some(true)
        || content["turnComplete"].as_bool() == Some(true)
    {
        events.push(ServerEvent::TurnDone);
    }

    if v["voiceActivity"]["type"].as_str() == Some("ACTIVITY_END") {
        events.push(ServerEvent::ActivityEnded);
    }
    if v.get("goAway").is_some() {
        events.push(ServerEvent::GoAway);
    }

    Ok(events)
}

/// The server sends its JSON in **binary** frames (every message observed on
/// 2026-09-28, `setupComplete` included). Text frames are accepted too, in case
/// that changes.
fn frame_text(msg: &Message) -> Option<&str> {
    match msg {
        Message::Text(text) => Some(text.as_str()),
        Message::Binary(bytes) => std::str::from_utf8(bytes).ok(),
        _ => None,
    }
}

/// Turn a server close frame into an error the pipeline can word for the
/// capsule.
///
/// The Live API reports rejections as close frames after the handshake, not as
/// HTTP statuses: a bad key closes with 1007 and "API key not valid". Mapping
/// the reason onto the status it stands for lets `retry::classify` pick the
/// right advice ("API key rejected", "rate limited") and keeps the retry policy
/// honest: only 1011 (internal error) and 1013 (try again later) are retried.
fn close_error(frame: Option<&CloseFrame<'_>>) -> anyhow::Error {
    let (code, reason) = match frame {
        Some(f) => (u16::from(f.code), f.reason.to_string()),
        None => (1005, String::new()),
    };
    let lower = reason.to_lowercase();
    let status = if lower.contains("api key") || lower.contains("unauthenticated") {
        reqwest::StatusCode::UNAUTHORIZED
    } else if lower.contains("permission") {
        reqwest::StatusCode::FORBIDDEN
    } else if lower.contains("quota") || lower.contains("resource_exhausted") {
        reqwest::StatusCode::TOO_MANY_REQUESTS
    } else if lower.contains("not found") || lower.contains("not supported") {
        reqwest::StatusCode::NOT_FOUND
    } else if code == 1011 || code == 1013 {
        reqwest::StatusCode::SERVICE_UNAVAILABLE
    } else {
        reqwest::StatusCode::BAD_REQUEST
    };
    let reason = crate::retry::truncate_error_body(&reason);
    crate::retry::HttpStatusError::new(
        status,
        format!("{PROVIDER_NAME} closed the session ({code}): {reason}"),
    )
    .into()
}

/// Merge one final into the text already committed, without duplicating it.
///
/// With manual activity detection the server sent exactly one final per turn in
/// every trial. The protocol does not promise that, so a repeated final, a
/// cumulative one that extends the previous final, and a separate segment are
/// all handled.
fn merge_final(committed: &mut String, next: &str) {
    let next = next.trim();
    if next.is_empty() {
        return;
    }
    if committed.is_empty() || next.starts_with(committed.as_str()) {
        *committed = next.to_string();
    } else if !committed.ends_with(next) {
        committed.push(' ');
        committed.push_str(next);
    }
}

/// What applying one event means for the caller.
#[derive(Debug, PartialEq)]
enum Progress {
    Nothing,
    /// Updated text to show while recording.
    Partial(String),
    /// The final transcript is in: stop reading.
    Done,
    /// The server says the activity ended but no final has arrived yet.
    AwaitLateFinal,
}

/// Transcript state for one dictation.
///
/// `committed` holds finals, `pending` holds the latest interim for the turn in
/// progress. A final clears `pending`, so the text is always `committed` plus
/// whatever is still unconfirmed, and nothing is counted twice.
#[derive(Debug, Default)]
struct Transcript {
    committed: String,
    pending: String,
    /// `activityEnd` has been sent.
    ended: bool,
    /// A final arrived after `activityEnd`. Any interim after this point is
    /// stale and must not be appended.
    finalized: bool,
}

impl Transcript {
    fn apply(&mut self, event: &ServerEvent) -> Progress {
        match event {
            ServerEvent::Interim(text) => {
                if self.finalized {
                    return Progress::Nothing;
                }
                self.pending = text.trim().to_string();
                Progress::Partial(self.text())
            }
            ServerEvent::Final(text) => {
                merge_final(&mut self.committed, text);
                self.pending.clear();
                if self.ended {
                    self.finalized = true;
                }
                Progress::Partial(self.text())
            }
            ServerEvent::TurnDone if self.finalized => Progress::Done,
            ServerEvent::ActivityEnded if self.ended => {
                if self.finalized {
                    Progress::Done
                } else {
                    Progress::AwaitLateFinal
                }
            }
            _ => Progress::Nothing,
        }
    }

    fn text(&self) -> String {
        match (self.committed.is_empty(), self.pending.is_empty()) {
            (_, true) => self.committed.clone(),
            (true, false) => self.pending.clone(),
            (false, false) => format!("{} {}", self.committed, self.pending),
        }
    }
}

/// How the wait for the final transcript ended.
#[derive(Debug)]
enum Finalize {
    /// The server finished the turn, with or without text.
    Complete,
    /// Nothing authoritative arrived before [`FINAL_TIMEOUT`].
    TimedOut,
    /// The socket closed or failed first.
    Lost(anyhow::Error),
}

/// Read server messages after `activityEnd` until the turn's final transcript
/// is in. Generic over the stream so tests can drive it without a socket.
async fn await_final<S>(
    stream: &mut S,
    transcript: &mut Transcript,
    timeout: Duration,
    grace: Duration,
) -> Finalize
where
    S: Stream<Item = std::result::Result<Message, tungstenite::Error>> + Unpin,
{
    let deadline = tokio::time::Instant::now() + timeout;
    let mut grace_deadline: Option<tokio::time::Instant> = None;

    loop {
        let until = grace_deadline.map_or(deadline, |g| g.min(deadline));
        let msg = match tokio::time::timeout_at(until, stream.next()).await {
            Err(_) if grace_deadline.is_some() => return Finalize::Complete,
            Err(_) => return Finalize::TimedOut,
            Ok(None) => {
                return Finalize::Lost(anyhow::anyhow!(
                    "{PROVIDER_NAME} connection closed before the final transcript"
                ))
            }
            Ok(Some(Err(e))) => return Finalize::Lost(e.into()),
            Ok(Some(Ok(Message::Close(frame)))) => {
                return Finalize::Lost(close_error(frame.as_ref()))
            }
            Ok(Some(Ok(msg))) => msg,
        };

        let Some(raw) = frame_text(&msg) else {
            continue;
        };
        match parse_server_message(raw) {
            Ok(events) => {
                for event in &events {
                    match transcript.apply(event) {
                        Progress::Done => return Finalize::Complete,
                        Progress::AwaitLateFinal => {
                            grace_deadline
                                .get_or_insert_with(|| tokio::time::Instant::now() + grace);
                        }
                        _ => {}
                    }
                }
            }
            Err(e) => tracing::warn!("{PROVIDER_NAME}: unparsable message: {e}"),
        }
    }
}

/// Decide what `disconnect` returns.
///
/// The final transcript is the answer whenever it arrived. Without one, the
/// latest interim is still the user's words, so it is kept rather than thrown
/// away: an error is returned only when there is no text at all.
fn finish(transcript: Transcript, outcome: Finalize) -> Result<DisconnectResult> {
    let finalized = transcript.finalized;
    let text = transcript.text();
    let result = if text.is_empty() {
        None
    } else {
        Some((text, None))
    };

    match outcome {
        Finalize::Complete => Ok(result),
        Finalize::TimedOut if result.is_some() => {
            tracing::warn!(
                "{PROVIDER_NAME}: no final transcript within {}s, using the latest interim text",
                FINAL_TIMEOUT.as_secs()
            );
            Ok(result)
        }
        Finalize::TimedOut => Err(crate::retry::HttpStatusError::new(
            reqwest::StatusCode::GATEWAY_TIMEOUT,
            format!(
                "{PROVIDER_NAME}: no final transcript within {}s",
                FINAL_TIMEOUT.as_secs()
            ),
        )
        .into()),
        Finalize::Lost(e) if finalized || result.is_some() => {
            if !finalized {
                tracing::warn!(
                    "{PROVIDER_NAME}: session ended before the final transcript ({e:#}), \
                     using the latest interim text"
                );
            }
            Ok(result)
        }
        Finalize::Lost(e) => Err(e),
    }
}

/// Open a socket, send `setup`, and wait for `setupComplete`.
async fn open_session(config: &SttConfig) -> Result<WsStream> {
    // The key goes in a header rather than the documented `?key=` query
    // parameter, so it never appears in a URL that could reach a log. Verified
    // to authenticate on 2026-09-28.
    let request = http::Request::builder()
        .uri(WS_URL)
        .header("x-goog-api-key", &config.api_key)
        .header("Host", HOST)
        .header("Connection", "Upgrade")
        .header("Upgrade", "websocket")
        .header("Sec-WebSocket-Version", "13")
        .header(
            "Sec-WebSocket-Key",
            tungstenite::handshake::client::generate_key(),
        )
        .body(())?;

    let (mut ws, _) = connect_async(request).await?;
    ws.send(Message::Text(build_setup_message(
        &config.languages,
        config.smart_format,
        &config.custom_vocabulary,
    )))
    .await?;

    let wait = async {
        loop {
            match ws.next().await {
                Some(Ok(Message::Close(frame))) => return Err(close_error(frame.as_ref())),
                Some(Ok(msg)) => {
                    if let Some(raw) = frame_text(&msg) {
                        if parse_server_message(raw)?.contains(&ServerEvent::SetupComplete) {
                            return Ok(());
                        }
                    }
                }
                Some(Err(e)) => return Err(e.into()),
                None => anyhow::bail!("{PROVIDER_NAME} closed the connection during setup"),
            }
        }
    };
    match tokio::time::timeout(SETUP_TIMEOUT, wait).await {
        Ok(result) => result?,
        Err(elapsed) => {
            return Err(anyhow::Error::new(elapsed).context(format!(
                "{PROVIDER_NAME} did not confirm the session within {}s",
                SETUP_TIMEOUT.as_secs()
            )))
        }
    }

    ws.send(Message::Text(activity_start_message())).await?;
    Ok(ws)
}

/// Close a socket without making anyone wait for it.
fn close_in_background(mut ws: WsStream) {
    tokio::spawn(async move {
        let _ = tokio::time::timeout(CLOSE_TIMEOUT, ws.close(None)).await;
    });
}

/// Streaming provider for `gemini-3.5-transcribe-live` over the Live API.
///
/// Push-to-talk maps onto manual activity detection: `connect` opens the session
/// and sends `activityStart`, audio streams while the hotkey is held, and
/// `disconnect` sends `activityEnd` and waits for the final transcript. Interim
/// text is emitted as `TranscriptEvent::Partial` for the capsule. The final goes
/// back through `DisconnectResult`, the same channel the drained streaming
/// providers use, so the pipeline inserts it exactly once.
pub struct GeminiLiveProvider {
    ws: Option<WsStream>,
    transcript: Transcript,
    outbox: Vec<u8>,
    /// A send failure or a dropped session, reported once from
    /// `recv_transcript`.
    failure: Option<anyhow::Error>,
    connected_at: Option<Instant>,
    first_partial_logged: bool,
}

impl Default for GeminiLiveProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl GeminiLiveProvider {
    pub fn new() -> Self {
        Self {
            ws: None,
            transcript: Transcript::default(),
            outbox: Vec::with_capacity(SEND_CHUNK_BYTES * 2),
            failure: None,
            connected_at: None,
            first_partial_logged: false,
        }
    }

    async fn flush_outbox(&mut self) -> Result<()> {
        if self.outbox.is_empty() {
            return Ok(());
        }
        let Some(ws) = &mut self.ws else {
            self.outbox.clear();
            return Ok(());
        };
        let message = audio_message(&self.outbox);
        self.outbox.clear();
        ws.send(Message::Text(message)).await?;
        Ok(())
    }

    /// Record that the session is gone. The socket is dropped so nothing else
    /// is sent on it.
    fn fail(&mut self, error: anyhow::Error) {
        tracing::error!("{PROVIDER_NAME}: {error:#}");
        if let Some(ws) = self.ws.take() {
            close_in_background(ws);
        }
        self.outbox.clear();
        self.failure.get_or_insert(error);
    }

    /// After a failure, hand over whatever text exists as a `Final` first, so the
    /// pipeline keeps it, and report the error on the next call.
    fn salvage_or_fail(&mut self) -> Result<Option<TranscriptEvent>> {
        let text = std::mem::take(&mut self.transcript).text();
        if !text.is_empty() {
            tracing::warn!(
                "{PROVIDER_NAME}: session lost while recording, keeping {} chars of interim text",
                text.len()
            );
            return Ok(Some(TranscriptEvent::Final {
                text,
                confidence: 0.0,
                language: None,
            }));
        }
        match self.failure.take() {
            Some(e) => Err(e),
            None => Ok(None),
        }
    }
}

#[async_trait]
impl SttProvider for GeminiLiveProvider {
    async fn connect(&mut self, config: &SttConfig) -> Result<()> {
        if config.api_key.is_empty() {
            anyhow::bail!("{PROVIDER_NAME} API key is empty");
        }
        if config.custom_vocabulary.len() > MAX_VOCABULARY_TERMS {
            tracing::warn!(
                "{}: dictionary has {} terms, sending the first {}",
                PROVIDER_NAME,
                config.custom_vocabulary.len(),
                MAX_VOCABULARY_TERMS
            );
        }

        // Safe to retry: nothing has been sent to the user yet, and each attempt
        // is a fresh socket with its own setup. Once connected, nothing on this
        // provider retries: see `crate::retry`.
        let started = Instant::now();
        let ws =
            crate::retry::with_retry(&format!("{PROVIDER_NAME} connect"), || open_session(config))
                .await?;

        *self = Self::new();
        self.ws = Some(ws);
        self.connected_at = Some(Instant::now());
        tracing::info!(
            "{PROVIDER_NAME} session ready in {}ms",
            started.elapsed().as_millis()
        );
        Ok(())
    }

    async fn send_audio(&mut self, chunk: &[u8]) -> Result<()> {
        if self.ws.is_none() {
            return Ok(());
        }
        self.outbox.extend_from_slice(chunk);
        if self.outbox.len() < SEND_CHUNK_BYTES {
            return Ok(());
        }
        if let Err(e) = self.flush_outbox().await {
            let e = e.context(format!("{PROVIDER_NAME}: sending audio failed"));
            let message = format!("{e:#}");
            self.fail(e);
            anyhow::bail!(message);
        }
        Ok(())
    }

    async fn recv_transcript(&mut self) -> Result<Option<TranscriptEvent>> {
        if self.failure.is_some() {
            return self.salvage_or_fail();
        }
        loop {
            let next = match self.ws.as_mut() {
                Some(ws) => ws.next().await,
                // No session: never resolve, so the pipeline's select loop waits
                // on audio instead of spinning on an empty result.
                None => return std::future::pending().await,
            };
            let msg = match next {
                Some(Ok(Message::Close(frame))) => {
                    let e = close_error(frame.as_ref());
                    self.fail(e);
                    return self.salvage_or_fail();
                }
                Some(Ok(msg)) => msg,
                Some(Err(e)) => {
                    self.fail(e.into());
                    return self.salvage_or_fail();
                }
                None => {
                    self.fail(anyhow::anyhow!("{PROVIDER_NAME} connection closed"));
                    return self.salvage_or_fail();
                }
            };

            let Some(raw) = frame_text(&msg) else {
                continue;
            };
            let events = match parse_server_message(raw) {
                Ok(events) => events,
                Err(e) => {
                    tracing::warn!("{PROVIDER_NAME}: unparsable message: {e}");
                    continue;
                }
            };

            let mut partial = None;
            for event in &events {
                if *event == ServerEvent::GoAway {
                    tracing::warn!("{PROVIDER_NAME}: server announced the session is ending");
                }
                if let Progress::Partial(text) = self.transcript.apply(event) {
                    partial = Some(text);
                }
            }
            if let Some(text) = partial {
                if !self.first_partial_logged {
                    self.first_partial_logged = true;
                    if let Some(at) = self.connected_at {
                        tracing::info!(
                            "[Pipeline Timing] {PROVIDER_NAME} first partial: {}ms after connect",
                            at.elapsed().as_millis()
                        );
                    }
                }
                return Ok(Some(TranscriptEvent::Partial { text }));
            }
        }
    }

    async fn disconnect(&mut self) -> Result<DisconnectResult> {
        if self.ws.is_none() {
            // The session already failed. Anything salvageable was handed over
            // by `recv_transcript`, unless the pipeline never asked for it.
            let transcript = std::mem::take(&mut self.transcript);
            return match self.failure.take() {
                Some(e) => finish(transcript, Finalize::Lost(e)),
                None => finish(transcript, Finalize::Complete),
            };
        }

        let sent = match self.flush_outbox().await {
            Ok(()) => match &mut self.ws {
                Some(ws) => ws
                    .send(Message::Text(activity_end_message()))
                    .await
                    .map_err(anyhow::Error::from),
                None => Ok(()),
            },
            Err(e) => Err(e),
        };
        let Some(mut ws) = self.ws.take() else {
            return finish(std::mem::take(&mut self.transcript), Finalize::Complete);
        };
        if let Err(e) = sent {
            close_in_background(ws);
            let e = e.context(format!("{PROVIDER_NAME}: sending end of speech failed"));
            return finish(std::mem::take(&mut self.transcript), Finalize::Lost(e));
        }

        let released = Instant::now();
        self.transcript.ended = true;
        let outcome = await_final(
            &mut ws,
            &mut self.transcript,
            FINAL_TIMEOUT,
            LATE_FINAL_GRACE,
        )
        .await;
        close_in_background(ws);
        tracing::info!(
            "[Pipeline Timing] {PROVIDER_NAME} final: {}ms after activityEnd ({outcome:?})",
            released.elapsed().as_millis()
        );

        finish(std::mem::take(&mut self.transcript), outcome)
    }

    async fn abort(&mut self) {
        if let Some(ws) = self.ws.take() {
            close_in_background(ws);
        }
        self.transcript = Transcript::default();
        self.outbox.clear();
        tracing::info!("{PROVIDER_NAME} session cancelled");
    }

    fn name(&self) -> &str {
        PROVIDER_NAME
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::stream;
    use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;

    type Item = std::result::Result<Message, tungstenite::Error>;

    fn setup(languages: &[&str], smart: bool, vocabulary: &[&str]) -> serde_json::Value {
        let langs: Vec<String> = languages.iter().map(|s| s.to_string()).collect();
        let vocab: Vec<String> = vocabulary.iter().map(|s| s.to_string()).collect();
        serde_json::from_str(&build_setup_message(&langs, smart, &vocab)).unwrap()
    }

    /// The server's framing: JSON in a binary frame.
    fn binary(json: serde_json::Value) -> Item {
        Ok(Message::Binary(json.to_string().into_bytes()))
    }

    fn interim(text: &str) -> Item {
        binary(serde_json::json!({"serverContent": {"interimInputTranscription": {"text": text}}}))
    }

    fn final_(text: &str) -> Item {
        binary(serde_json::json!({"serverContent": {"inputTranscription": {"text": text}}}))
    }

    fn generation_complete() -> Item {
        binary(serde_json::json!({"serverContent": {"generationComplete": true}}))
    }

    fn activity_end() -> Item {
        binary(serde_json::json!({
            "serverContent": {},
            "voiceActivity": {"type": "ACTIVITY_END", "audioOffset": "8.03s"}
        }))
    }

    fn close(code: u16, reason: &'static str) -> Item {
        Ok(Message::Close(Some(CloseFrame {
            code: CloseCode::from(code),
            reason: reason.into(),
        })))
    }

    /// A server that sends `items` and then stays open and silent, the way the
    /// real one does after `ACTIVITY_END`.
    fn server(items: Vec<Item>) -> impl Stream<Item = Item> + Unpin {
        stream::iter(items).chain(stream::pending())
    }

    async fn finalize(items: Vec<Item>, pending_interim: &str) -> Result<DisconnectResult> {
        let mut transcript = Transcript::default();
        if !pending_interim.is_empty() {
            transcript.apply(&ServerEvent::Interim(pending_interim.to_string()));
        }
        transcript.ended = true;
        let mut s = server(items);
        let outcome = await_final(
            &mut s,
            &mut transcript,
            Duration::from_millis(200),
            Duration::from_millis(30),
        )
        .await;
        finish(transcript, outcome)
    }

    fn text_of(result: Result<DisconnectResult>) -> Option<String> {
        result
            .expect("expected a transcript, not an error")
            .map(|(text, _)| text)
    }

    #[test]
    fn setup_disables_server_vad_for_push_to_talk() {
        let v = setup(&[], true, &[]);
        assert_eq!(v["setup"]["model"], "models/gemini-3.5-transcribe-live");
        assert_eq!(
            v["setup"]["generationConfig"]["responseModalities"],
            serde_json::json!(["TEXT"])
        );
        assert_eq!(
            v["setup"]["realtimeInputConfig"]["automaticActivityDetection"]["disabled"], true,
            "server VAD would split a dictation at every pause"
        );
    }

    #[test]
    fn setup_maps_mode_languages_and_vocabulary() {
        let v = setup(&["en", "de", "xx"], true, &["Pipeup", "Tauri"]);
        let t = &v["setup"]["inputAudioTranscription"];
        assert_eq!(t["mode"], "SMART");
        assert_eq!(t["languageCodes"], serde_json::json!(["en-US", "de-DE"]));
        assert_eq!(
            t["customVocabulary"],
            serde_json::json!(["Pipeup", "Tauri"])
        );

        let v = setup(&[], false, &[]);
        let t = &v["setup"]["inputAudioTranscription"];
        assert_eq!(t["mode"], "VERBATIM");
        assert!(
            t.get("languageCodes").is_none(),
            "no languages means auto-detect"
        );
        assert!(t.get("customVocabulary").is_none());
    }

    #[test]
    fn setup_caps_vocabulary_at_the_api_limit() {
        let words: Vec<String> = (0..1500).map(|i| format!("w{i}")).collect();
        let v: serde_json::Value =
            serde_json::from_str(&build_setup_message(&[], true, &words)).unwrap();
        let sent = v["setup"]["inputAudioTranscription"]["customVocabulary"]
            .as_array()
            .unwrap();
        assert_eq!(sent.len(), MAX_VOCABULARY_TERMS);
    }

    #[test]
    fn audio_message_is_base64_pcm_at_16k() {
        let v: serde_json::Value = serde_json::from_str(&audio_message(&[1, 2, 3])).unwrap();
        assert_eq!(
            v["realtimeInput"]["audio"]["mimeType"],
            "audio/pcm;rate=16000"
        );
        assert_eq!(v["realtimeInput"]["audio"]["data"], "AQID");
    }

    #[test]
    fn activity_messages_match_the_manual_vad_protocol() {
        assert_eq!(
            activity_start_message(),
            r#"{"realtimeInput":{"activityStart":{}}}"#
        );
        assert_eq!(
            activity_end_message(),
            r#"{"realtimeInput":{"activityEnd":{}}}"#
        );
    }

    #[test]
    fn parses_each_server_message_kind() {
        let parse = |item: Item| match item.unwrap() {
            Message::Binary(b) => parse_server_message(std::str::from_utf8(&b).unwrap()).unwrap(),
            _ => unreachable!(),
        };
        assert_eq!(
            parse_server_message("{\n  \"setupComplete\": {}\n}\n").unwrap(),
            vec![ServerEvent::SetupComplete]
        );
        assert_eq!(
            parse(interim("Hi team")),
            vec![ServerEvent::Interim("Hi team".into())]
        );
        assert_eq!(
            parse(final_("Hi team.")),
            vec![ServerEvent::Final("Hi team.".into())]
        );
        assert_eq!(parse(generation_complete()), vec![ServerEvent::TurnDone]);
        assert_eq!(parse(activity_end()), vec![ServerEvent::ActivityEnded]);
        assert_eq!(
            parse_server_message(r#"{"goAway": {"timeLeft": "10s"}}"#).unwrap(),
            vec![ServerEvent::GoAway]
        );
        assert!(parse_server_message(
            r#"{"serverContent": {}, "voiceActivity": {"type": "ACTIVITY_START"}}"#
        )
        .unwrap()
        .is_empty());
    }

    #[test]
    fn a_combined_message_yields_its_events_in_protocol_order() {
        let raw = r#"{"serverContent": {
            "generationComplete": true,
            "inputTranscription": {"text": "done"},
            "interimInputTranscription": {"text": "don"}
        }}"#;
        assert_eq!(
            parse_server_message(raw).unwrap(),
            vec![
                ServerEvent::Interim("don".into()),
                ServerEvent::Final("done".into()),
                ServerEvent::TurnDone,
            ]
        );
    }

    #[test]
    fn malformed_json_is_an_error_not_a_panic() {
        assert!(parse_server_message("not json").is_err());
    }

    #[test]
    fn binary_and_text_frames_both_carry_json() {
        assert_eq!(frame_text(&Message::Binary(b"{}".to_vec())), Some("{}"));
        assert_eq!(frame_text(&Message::Text("{}".into())), Some("{}"));
        assert_eq!(frame_text(&Message::Ping(vec![])), None);
    }

    #[test]
    fn a_rejected_key_is_worded_as_a_key_problem_and_not_retried() {
        let frame = CloseFrame {
            code: CloseCode::from(1007),
            reason: "API key not valid. Please pass a valid API key.".into(),
        };
        let err = close_error(Some(&frame));
        assert_eq!(
            crate::retry::classify(&err),
            crate::retry::FailureKind::Status(reqwest::StatusCode::UNAUTHORIZED)
        );
        assert!(!crate::retry::is_retryable(&err));
        assert!(format!("{err}").contains("API key not valid"));
    }

    #[test]
    fn an_internal_server_close_is_retried() {
        let frame = CloseFrame {
            code: CloseCode::from(1011),
            reason: "Internal error".into(),
        };
        assert!(crate::retry::is_retryable(&close_error(Some(&frame))));
    }

    #[test]
    fn a_quota_close_is_a_rate_limit() {
        let frame = CloseFrame {
            code: CloseCode::from(1011),
            reason: "You exceeded your current quota".into(),
        };
        assert_eq!(
            crate::retry::classify(&close_error(Some(&frame))),
            crate::retry::FailureKind::Status(reqwest::StatusCode::TOO_MANY_REQUESTS)
        );
    }

    #[test]
    fn merge_final_never_duplicates() {
        let mut text = String::new();
        merge_final(&mut text, " Hi team. ");
        assert_eq!(text, "Hi team.");
        merge_final(&mut text, "Hi team.");
        assert_eq!(text, "Hi team.", "a repeated final is not appended again");
        merge_final(&mut text, "Hi team. See you.");
        assert_eq!(text, "Hi team. See you.", "a cumulative final replaces");
        merge_final(&mut text, "Bye.");
        assert_eq!(text, "Hi team. See you. Bye.", "a new segment is appended");
        merge_final(&mut text, "  ");
        assert_eq!(text, "Hi team. See you. Bye.");
    }

    #[test]
    fn interims_replace_each_other_rather_than_accumulating() {
        let mut t = Transcript::default();
        t.apply(&ServerEvent::Interim("Hi team".into()));
        let shown = t.apply(&ServerEvent::Interim("Hi team, I pushed".into()));
        assert_eq!(shown, Progress::Partial("Hi team, I pushed".into()));
    }

    #[test]
    fn a_final_supersedes_the_interim_it_confirms() {
        let mut t = Transcript::default();
        t.apply(&ServerEvent::Interim("Hi team, I pushed".into()));
        t.apply(&ServerEvent::Final("Hi team, I pushed the notes.".into()));
        assert_eq!(t.text(), "Hi team, I pushed the notes.");
        t.apply(&ServerEvent::Interim("Next".into()));
        assert_eq!(t.text(), "Hi team, I pushed the notes. Next");
    }

    #[tokio::test]
    async fn observed_sequence_yields_the_final_once() {
        // The exact order the live service produced on 2026-09-28: the final,
        // then generationComplete, then ACTIVITY_END, all at once.
        let text = text_of(
            finalize(
                vec![
                    final_("Hi team, I pushed the release notes by noon."),
                    generation_complete(),
                    activity_end(),
                ],
                "Hi team, I pushed the release notes by",
            )
            .await,
        );
        assert_eq!(
            text.as_deref(),
            Some("Hi team, I pushed the release notes by noon."),
            "the final replaces the interim; the last words are neither lost nor doubled"
        );
    }

    #[tokio::test]
    async fn a_stale_interim_after_the_final_is_ignored() {
        let text = text_of(
            finalize(
                vec![final_("One two three."), interim("One two"), activity_end()],
                "",
            )
            .await,
        );
        assert_eq!(text.as_deref(), Some("One two three."));
    }

    #[tokio::test]
    async fn silence_finishes_with_no_text_after_the_grace_period() {
        let started = tokio::time::Instant::now();
        let result = finalize(vec![activity_end()], "").await;
        assert_eq!(text_of(result), None);
        assert!(
            started.elapsed() < Duration::from_millis(150),
            "silence must end on ACTIVITY_END plus the grace, not the full timeout"
        );
    }

    #[tokio::test]
    async fn a_final_just_behind_activity_end_is_kept() {
        let text = text_of(finalize(vec![activity_end(), final_("Late words.")], "Late").await);
        assert_eq!(text.as_deref(), Some("Late words."));
    }

    #[tokio::test]
    async fn a_timeout_falls_back_to_the_latest_interim() {
        let text = text_of(finalize(vec![], "Everything I said so far").await);
        assert_eq!(text.as_deref(), Some("Everything I said so far"));
    }

    #[tokio::test]
    async fn a_timeout_with_nothing_heard_is_an_error() {
        assert!(finalize(vec![], "").await.is_err());
    }

    #[tokio::test]
    async fn a_close_before_the_final_keeps_the_interim() {
        let text = text_of(finalize(vec![close(1011, "Internal error")], "Keep this").await);
        assert_eq!(text.as_deref(), Some("Keep this"));
    }

    #[tokio::test]
    async fn a_close_after_the_final_is_not_an_error() {
        let text = text_of(finalize(vec![final_("All of it."), close(1000, "")], "").await);
        assert_eq!(text.as_deref(), Some("All of it."));
    }

    #[tokio::test]
    async fn a_close_with_nothing_heard_reports_the_reason() {
        let err = finalize(vec![close(1007, "API key not valid.")], "")
            .await
            .unwrap_err();
        assert!(format!("{err}").contains("API key not valid"));
    }

    #[tokio::test]
    async fn a_lost_session_while_recording_hands_over_its_text_then_the_error() {
        let mut provider = GeminiLiveProvider::new();
        provider
            .transcript
            .apply(&ServerEvent::Interim("spoken so far".into()));
        provider.fail(anyhow::anyhow!("socket reset"));

        match provider.recv_transcript().await {
            Ok(Some(TranscriptEvent::Final { text, .. })) => assert_eq!(text, "spoken so far"),
            other => panic!("expected the salvaged text first, got {other:?}"),
        }
        assert!(provider.recv_transcript().await.is_err());
        assert_eq!(
            provider.disconnect().await.unwrap(),
            None,
            "the salvaged text was already handed over and must not be returned twice"
        );
    }

    #[tokio::test]
    async fn disconnect_after_a_send_failure_returns_the_interim_once() {
        let mut provider = GeminiLiveProvider::new();
        provider
            .transcript
            .apply(&ServerEvent::Interim("before the failure".into()));
        provider.fail(anyhow::anyhow!("broken pipe"));
        let result = provider.disconnect().await.unwrap();
        assert_eq!(
            result.map(|(t, _)| t).as_deref(),
            Some("before the failure")
        );
    }

    #[tokio::test]
    async fn abort_discards_the_transcript() {
        let mut provider = GeminiLiveProvider::new();
        provider
            .transcript
            .apply(&ServerEvent::Interim("cancelled words".into()));
        provider.abort().await;
        assert_eq!(provider.transcript.text(), "");
    }

    /// End-to-end against the live API, and a latency comparison with the batch
    /// provider on the same audio. Ignored by default: it needs a key and a
    /// network.
    ///
    /// Audio is fed through a channel in 20 ms chunks at real-time pace, started
    /// *before* `connect`, which is what the pipeline does: capture opens first
    /// and buffers while the session is set up.
    ///
    /// ```text
    /// GEMINI_API_KEY=... GEMINI_TEST_WAV=/path/to/16k-mono.wav \
    ///     cargo test --manifest-path src-tauri/Cargo.toml \
    ///     --lib stt::gemini_live::tests::live -- --ignored --nocapture
    /// ```
    #[tokio::test]
    #[ignore = "requires GEMINI_API_KEY and network"]
    async fn live_streams_speech_and_compares_with_batch() {
        let api_key = match std::env::var("GEMINI_API_KEY") {
            Ok(k) if !k.is_empty() => k,
            _ => panic!("set GEMINI_API_KEY to run this test"),
        };
        let pcm = match std::env::var("GEMINI_TEST_WAV") {
            Ok(path) if !path.is_empty() => {
                let bytes = std::fs::read(&path).expect("GEMINI_TEST_WAV must be readable");
                let start = bytes
                    .windows(4)
                    .position(|w| w == b"data")
                    .map(|i| i + 8)
                    .expect("GEMINI_TEST_WAV must be a WAV file with a data chunk");
                bytes[start..].to_vec()
            }
            _ => vec![0u8; 32000],
        };
        let config = SttConfig {
            api_key,
            languages: vec!["en".to_string()],
            smart_format: true,
            sample_rate: 16000,
            custom_vocabulary: vec!["Pipeup".to_string()],
        };
        let audio_secs = pcm.len() as f64 / 32000.0;

        let (tx, mut rx) = tokio::sync::mpsc::channel::<Vec<u8>>(1000);
        let feed = pcm.clone();
        let started = Instant::now();
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(Duration::from_millis(20));
            for chunk in feed.chunks(640) {
                tick.tick().await;
                if tx.send(chunk.to_vec()).await.is_err() {
                    break;
                }
            }
        });

        let mut live = GeminiLiveProvider::new();
        live.connect(&config).await.expect("connect");
        let connect_ms = started.elapsed().as_millis();

        let mut first_partial_ms = None;
        let mut partials = 0;
        loop {
            tokio::select! {
                chunk = rx.recv() => match chunk {
                    Some(data) => live.send_audio(&data).await.expect("send_audio"),
                    None => break,
                },
                event = live.recv_transcript() => match event.expect("recv_transcript") {
                    Some(TranscriptEvent::Partial { text }) => {
                        partials += 1;
                        first_partial_ms.get_or_insert(started.elapsed().as_millis());
                        println!("partial @{}ms: {text}", started.elapsed().as_millis());
                    }
                    other => println!("event: {other:?}"),
                },
            }
        }
        let released = Instant::now();
        let live_result = live.disconnect().await.expect("disconnect");
        let live_final_ms = released.elapsed().as_millis();

        let mut batch = super::super::gemini::GeminiTranscribeProvider::new(reqwest::Client::new());
        batch.connect(&config).await.expect("batch connect");
        batch.send_audio(&pcm).await.expect("batch send_audio");
        let released = Instant::now();
        let batch_result = batch.disconnect().await.expect("batch disconnect");
        let batch_final_ms = released.elapsed().as_millis();

        println!("audio: {audio_secs:.1}s");
        println!("live connect: {connect_ms}ms after capture start");
        println!(
            "live first partial: {first_partial_ms:?}ms after capture start ({partials} partials)"
        );
        println!("live release to final: {live_final_ms}ms -> {live_result:?}");
        println!("batch release to final: {batch_final_ms}ms -> {batch_result:?}");
    }
}
