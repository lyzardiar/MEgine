// Author: MiYu. Bound Play compilation so a stalled compiler cannot block subsequent starts.
use std::{process::{Command, Output}, time::Duration};

const MAX_SCRIPT_BYTES: usize = 16 * 1024 * 1024;

pub fn source(bytes: &[u8]) -> Result<String, String> {
    // JSON can encode one source byte as six bytes (for example, a control character).
    if bytes.len() > MAX_SCRIPT_BYTES * 6 + 4096 { return Err("Play compiler response exceeds its encoded size limit".into()); }
    #[derive(serde::Deserialize)]
    struct Compilation { source: String }
    let result: Compilation = serde_json::from_slice(bytes).map_err(|error| format!("Invalid Play compiler response: {error}"))?;
    if result.source.len() > MAX_SCRIPT_BYTES { return Err("Play script exceeds 16 MiB".into()); }
    Ok(result.source)
}

pub async fn output(command: Command, timeout: Duration) -> Result<Output, String> {
    let mut command = tokio::process::Command::from(command);
    command.kill_on_drop(true);
    tokio::time::timeout(timeout, command.output()).await
        .map_err(|_| "Play script compilation timed out".to_string())?
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod source_tests {
    use super::*;

    #[test]
    fn source_limit_applies_to_decoded_utf8_not_json_escaping() {
        let text = "\\\"\n".repeat(MAX_SCRIPT_BYTES / 3);
        let encoded = serde_json::to_vec(&serde_json::json!({"source": text})).unwrap();
        assert!(encoded.len() > MAX_SCRIPT_BYTES);
        assert_eq!(source(&encoded).unwrap(), text);
        let text = "中".repeat(MAX_SCRIPT_BYTES / 3) + "x";
        assert_eq!(text.len(), MAX_SCRIPT_BYTES);
        assert_eq!(source(&serde_json::to_vec(&serde_json::json!({"source": text})).unwrap()).unwrap(), text);
    }

    #[test]
    fn oversized_source_and_invalid_envelopes_are_rejected() {
        let text = "x".repeat(MAX_SCRIPT_BYTES + 1);
        assert_eq!(source(&serde_json::to_vec(&serde_json::json!({"source": text})).unwrap()).unwrap_err(), "Play script exceeds 16 MiB");
        for bytes in [b"{}".as_slice(), b"{\"source\":null}", b"{\"source\":42}", b"not json"] { assert!(source(bytes).is_err()); }
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::os::windows::process::CommandExt;

    #[tokio::test]
    async fn stalled_compiler_is_bounded_and_next_command_can_finish() {
        let mut stalled = Command::new("powershell.exe");
        stalled.args(["-NoProfile", "-Command", "Start-Sleep -Seconds 10"]);
        stalled.creation_flags(0x08000000);
        let started = std::time::Instant::now();
        assert!(output(stalled, Duration::from_millis(100)).await.unwrap_err().contains("timed out"));
        assert!(started.elapsed() < Duration::from_secs(5));
        let mut success = Command::new("cmd.exe");
        success.args(["/C", "echo", "compiled"]);
        success.creation_flags(0x08000000);
        let result = output(success, Duration::from_secs(5)).await.unwrap();
        assert!(result.status.success());
        assert!(String::from_utf8(result.stdout).unwrap().contains("compiled"));
    }
}
