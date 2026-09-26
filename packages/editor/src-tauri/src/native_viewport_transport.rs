use std::sync::Arc;

/// SharedBuffer is CPU shared memory. COM calls stay on WebView2's UI thread.
#[cfg(windows)]
pub async fn share_frame(window: &tauri::WebviewWindow, bytes: Arc<Vec<u8>>, request: String) -> Result<(), String> {
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
                    std::ptr::copy_nonoverlapping(bytes.as_ptr(), destination, bytes.len());
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
pub async fn share_frame(_window: &tauri::WebviewWindow, _bytes: Arc<Vec<u8>>, _request: String) -> Result<(), String> {
    Err("WebView2 shared buffers are unavailable on this platform".into())
}
