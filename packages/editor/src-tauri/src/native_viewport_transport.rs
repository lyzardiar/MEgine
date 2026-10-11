use std::sync::Arc;

/// MiYu: retain the renderer's RGBA allocation until writing the final transport buffer.
pub struct FramePayload { header: [u8; 16], metadata: Vec<u8>, rgba: Vec<u8> }

impl FramePayload {
    pub fn new(width: u32, height: u32, metadata: Vec<u8>, rgba: Vec<u8>) -> Result<Self, String> {
        let metadata_len = u32::try_from(metadata.len()).map_err(|_| "Viewport metadata exceeds 4 GiB")?;
        let mut header = [0; 16];
        for (slot, value) in header.chunks_exact_mut(4).zip([0x3146474d_u32, width, height, metadata_len]) { slot.copy_from_slice(&value.to_le_bytes()); }
        Ok(Self { header, metadata, rgba })
    }

    fn len(&self) -> usize { self.header.len() + self.metadata.len() + self.rgba.len() }

    fn write_to(&self, destination: &mut [u8]) {
        assert_eq!(destination.len(), self.len());
        let (header, rest) = destination.split_at_mut(16);
        let (metadata, rgba) = rest.split_at_mut(self.metadata.len());
        header.copy_from_slice(&self.header);metadata.copy_from_slice(&self.metadata);rgba.copy_from_slice(&self.rgba);
    }

    pub fn encode(&self) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(self.len());
        bytes.extend_from_slice(&self.header);bytes.extend_from_slice(&self.metadata);bytes.extend_from_slice(&self.rgba);
        bytes
    }
}

/// SharedBuffer is CPU shared memory. COM calls stay on WebView2's UI thread.
#[cfg(windows)]
pub async fn share_frame(window: &tauri::WebviewWindow, bytes: Arc<FramePayload>, request: String) -> Result<(), String> {
    use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2Environment12, ICoreWebView2_2, ICoreWebView2_17, COREWEBVIEW2_SHARED_BUFFER_ACCESS_READ_ONLY};
    use windows::core::{HSTRING, Interface};
    let (tx, rx) = tokio::sync::oneshot::channel();
    window.with_webview(move |platform| {
        let result = (|| -> windows::core::Result<()> {
            unsafe {
                let webview = platform.controller().CoreWebView2()?;
                let environment = webview.cast::<ICoreWebView2_2>()?.Environment()?.cast::<ICoreWebView2Environment12>()?;
                let receiver = webview.cast::<ICoreWebView2_17>()?;
                let buffer = environment.CreateSharedBuffer(bytes.len() as u64)?;
                let result = (|| {
                    let mut destination = std::ptr::null_mut();
                    buffer.Buffer(&mut destination)?;
                    // The allocated mapping has exactly bytes.len() writable native bytes.
                    bytes.write_to(std::slice::from_raw_parts_mut(destination, bytes.len()));
                    let metadata = HSTRING::from(serde_json::json!({"nativeViewportRequest": request}).to_string());
                    receiver.PostSharedBufferToScript(&buffer, COREWEBVIEW2_SHARED_BUFFER_ACCESS_READ_ONLY, &metadata)
                })();
                // JS owns its mapping until releaseBuffer; native Close does not revoke it.
                let _ = buffer.Close();
                result
            }
        })().map_err(|error| error.to_string());
        let _ = tx.send(result);
    }).map_err(|error| error.to_string())?;
    rx.await.map_err(|error| error.to_string())?
}

#[cfg(not(windows))]
pub async fn share_frame(_window: &tauri::WebviewWindow, _bytes: Arc<FramePayload>, _request: String) -> Result<(), String> {
    Err("WebView2 shared buffers are unavailable on this platform".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mapped_and_ipc_frames_have_identical_wire_bytes() {
        let metadata = br#"{"hasAuthoredCamera":true}"#.to_vec();
        let rgba = vec![1, 2, 3, 255, 7, 8, 9, 0];
        let pointer = rgba.as_ptr();
        let frame = FramePayload::new(2, 1, metadata.clone(), rgba.clone()).unwrap();
        let retained = FramePayload::new(2, 1, metadata.clone(), rgba).unwrap();
        assert_eq!(retained.rgba.as_ptr(), pointer, "shared transport retains the renderer allocation");
        let mut mapped = vec![0; frame.len()];
        frame.write_to(&mut mapped);
        let expected = [0x3146474d_u32, 2, 1, metadata.len() as u32].into_iter().flat_map(u32::to_le_bytes).chain(metadata).chain([1, 2, 3, 255, 7, 8, 9, 0]).collect::<Vec<_>>();
        assert_eq!(mapped, expected);
        assert_eq!(frame.encode(), expected);
    }
}
