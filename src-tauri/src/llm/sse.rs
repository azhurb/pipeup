/// Buffer network bytes until complete SSE lines can be decoded as UTF-8.
/// HTTP chunks can split any character, including a Cyrillic letter or emoji.
#[derive(Default)]
pub(super) struct SseLines {
    pending: Vec<u8>,
}

impl SseLines {
    pub(super) fn push(&mut self, chunk: &[u8]) -> Result<Vec<String>, std::str::Utf8Error> {
        self.pending.extend_from_slice(chunk);
        let Some(end) = self.pending.iter().rposition(|byte| *byte == b'\n') else {
            return Ok(Vec::new());
        };
        // Decode only complete lines. Invalid UTF-8 surfaces as a provider error
        // so the pipeline can use its existing raw-transcript fallback.
        let lines = std::str::from_utf8(&self.pending[..=end])?
            .split_terminator('\n')
            .map(|line| line.trim().to_string())
            .collect();
        self.pending.drain(..=end);
        Ok(lines)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preserves_multilingual_sse_at_every_byte_boundary() {
        let line = "data: {\"choices\":[{\"delta\":{\"content\":\"Привет, мир! 日本語 😀\"}}]}";
        let wire = format!("{line}\r\n\r\ndata: [DONE]\n");
        for split in 0..=wire.len() {
            let mut decoder = SseLines::default();
            let mut lines = decoder.push(&wire.as_bytes()[..split]).unwrap();
            lines.extend(decoder.push(&wire.as_bytes()[split..]).unwrap());
            assert_eq!(lines, [line, "", "data: [DONE]"], "split at {split}");
        }
    }

    #[test]
    fn preserves_multilingual_sse_delivered_one_byte_at_a_time() {
        let line = "data: {\"choices\":[{\"delta\":{\"content\":\"Вопрос? 中文 😀\"}}]}";
        let mut decoder = SseLines::default();
        let mut lines = Vec::new();
        for byte in format!("{line}\n").bytes() {
            lines.extend(decoder.push(&[byte]).unwrap());
        }
        assert_eq!(lines, [line]);
    }

    #[test]
    fn waits_for_complete_lines() {
        let mut decoder = SseLines::default();
        assert!(decoder.push(b"data: hello").unwrap().is_empty());
        assert_eq!(
            decoder.push(b" world\nnext").unwrap(),
            ["data: hello world"]
        );
        assert_eq!(decoder.push(b" line\n").unwrap(), ["next line"]);
    }

    #[test]
    fn rejects_invalid_utf8_instead_of_corrupting_output() {
        let mut decoder = SseLines::default();
        assert!(decoder.push(b"data: \xff\n").is_err());
    }
}
