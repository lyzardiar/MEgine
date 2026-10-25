// Author: MiYu. Preserve the JSON Play contract while optionally returning privately decoded bytes.
use serde::Serialize;

pub(super) fn encode(value: &impl Serialize, raw: bool) -> Result<tauri::ipc::Response, String> {
    if raw { serde_json::to_vec(value).map(tauri::ipc::Response::new).map_err(|error| error.to_string()) }
    else { serde_json::to_string(value).map(tauri::ipc::Response::new).map_err(|error| error.to_string()) }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::ipc::{IpcResponse, InvokeResponseBody};

    #[test]
    fn binary_and_json_play_responses_have_identical_payloads() {
        let payload = serde_json::json!({"revision":2,"baseRevision":1,"reset":false,"quitRequested":false,"snapshot":{"entities":[{"entity":4294967297u64,"name":"地图","components":{"Text":{"text":"a\n\"b"}}}],"elapsed":0.25},"timing":{"workerMs":0.0}});
        let raw = encode(&payload, true).unwrap().body().unwrap();
        let json = encode(&payload, false).unwrap().body().unwrap();
        let InvokeResponseBody::Raw(bytes) = raw else { panic!("raw Play response must use binary IPC") };
        let InvokeResponseBody::Json(text) = json else { panic!("default Play response must preserve JSON IPC") };
        assert_eq!(serde_json::from_slice::<serde_json::Value>(&bytes).unwrap(), payload);
        assert_eq!(serde_json::from_str::<serde_json::Value>(&text).unwrap(), payload);
    }
}
