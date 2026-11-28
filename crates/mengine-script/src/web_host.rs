//! Lightweight Web/WASM script host bridge contract.
//!
//! Unlike native desktop/Android builds that embed V8 (or QuickJS on W^X-restricted
//! targets like iOS), Web builds delegate JS execution directly to the browser's
//! native JS engine (`platforms/web/src/webEngineHost.ts`) via a minimal JSON/TypedArray
//! command queue — shipping zero embedded VM binary overhead.

use mengine_core::CommandBuffer;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct WebScriptIdentity {
    pub backend: &'static str,
    pub bridge_version: u32,
    pub zero_vm_overhead: bool,
}

pub const WEB_NATIVE_IDENTITY: WebScriptIdentity = WebScriptIdentity {
    backend: "web-native-js",
    bridge_version: 1,
    zero_vm_overhead: true,
};

/// Host-side command inbox consumed by WASM builds when browser-native JS scripts
/// submit `WorldCommand` batches without embedding V8 or QuickJS.
#[derive(Default)]
pub struct WebCommandBridge {
    buffer: CommandBuffer,
}

impl WebCommandBridge {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn push_command_json(&mut self, json: &str) -> Result<(), String> {
        let cmd: mengine_core::WorldCommand =
            serde_json::from_str(json).map_err(|e| e.to_string())?;
        self.buffer.push(cmd);
        Ok(())
    }

    pub fn push_command_batch_json(&mut self, json: &str) -> Result<usize, String> {
        let cmds: Vec<mengine_core::WorldCommand> =
            serde_json::from_str(json).map_err(|e| e.to_string())?;
        let count = cmds.len();
        for cmd in cmds {
            self.buffer.push(cmd);
        }
        Ok(count)
    }

    pub fn drain_buffer(&mut self) -> CommandBuffer {
        std::mem::take(&mut self.buffer)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn web_command_bridge_reports_zero_vm_overhead_and_parses_batches() {
        assert_eq!(WEB_NATIVE_IDENTITY.backend, "web-native-js");
        assert!(WEB_NATIVE_IDENTITY.zero_vm_overhead);
        let mut bridge = WebCommandBridge::new();
        assert_eq!(bridge.push_command_batch_json("[]").unwrap(), 0);
        assert!(bridge.drain_buffer().is_empty());
    }
}
