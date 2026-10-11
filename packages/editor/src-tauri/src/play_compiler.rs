// Author: MiYu. Bound Play compilation so a stalled compiler cannot block subsequent starts.
use std::{process::{Command, Output}, time::Duration};

pub async fn output(command: Command, timeout: Duration) -> Result<Output, String> {
    let mut command = tokio::process::Command::from(command);
    command.kill_on_drop(true);
    tokio::time::timeout(timeout, command.output()).await
        .map_err(|_| "Play script compilation timed out".to_string())?
        .map_err(|error| error.to_string())
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
