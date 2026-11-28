//! Structured panic diagnostics hook for desktop, editor, and mobile runtime hosts.

use std::sync::OnceLock;

static PANIC_HOOK_INSTALLED: OnceLock<()> = OnceLock::new();

/// Installs a structured panic hook once per process that logs panic location and payload
/// cleanly through `log::error!` and stderr before chaining to the previous panic hook.
pub fn install_panic_hook() {
    PANIC_HOOK_INSTALLED.get_or_init(|| {
        let previous = std::panic::take_hook();
        std::panic::set_hook(Box::new(move |info| {
            let thread_name = std::thread::current()
                .name()
                .unwrap_or("unnamed")
                .to_string();
            let location = info
                .location()
                .map(|loc| format!("{}:{}:{}", loc.file(), loc.line(), loc.column()))
                .unwrap_or_else(|| "<unknown>".to_string());
            let payload = if let Some(msg) = info.payload().downcast_ref::<&str>() {
                (*msg).to_string()
            } else if let Some(msg) = info.payload().downcast_ref::<String>() {
                msg.clone()
            } else {
                "<non-string panic payload>".to_string()
            };
            log::error!(
                "MEngine panic on thread '{thread_name}' at {location}: {payload}"
            );
            eprintln!(
                "[MEngine][PANIC] thread='{thread_name}' at {location}: {payload}"
            );
            previous(info);
        }));
    });
}
