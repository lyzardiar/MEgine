use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Supported target platforms across Desktop, Mobile, and Web.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum PlatformTarget {
    Windows,
    MacOs,
    Linux,
    Android,
    Ios,
    Web,
}

/// Implementation tier for each target platform adapter.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum SupportStage {
    /// Active primary implementation target.
    Active,
    /// Reserved adapter contract ready for platform-specific implementation.
    AdapterReserved,
}

/// Script VM strategy per platform:
/// - Native platforms (Windows / Android / Desktop) default to V8 for peak performance.
/// - W^X-restricted native targets (iOS) fall back to QuickJS.
/// - Web/WASM uses the browser's native JS runtime for smaller bundle size & lower overhead.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ScriptBackendKind {
    NativeV8,
    NativeQuickJs,
    WebNativeJs,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum GraphicsBackendHint {
    Dx12,
    Vulkan,
    Metal,
    Gles,
    WebGpu,
    WebGl2,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct PlatformCapabilities {
    pub target: PlatformTarget,
    pub stage: SupportStage,
    pub default_script_backend: ScriptBackendKind,
    pub fallback_script_backend: Option<ScriptBackendKind>,
    pub preferred_graphics: GraphicsBackendHint,
    pub fallback_graphics: Option<GraphicsBackendHint>,
    pub supports_multi_touch: bool,
    pub supports_native_filesystem: bool,
    pub requires_async_boot: bool,
    pub supports_jit: bool,
}

pub const fn current_target() -> PlatformTarget {
    #[cfg(target_os = "windows")]
    {
        PlatformTarget::Windows
    }
    #[cfg(target_os = "macos")]
    {
        PlatformTarget::MacOs
    }
    #[cfg(target_os = "linux")]
    {
        PlatformTarget::Linux
    }
    #[cfg(target_os = "android")]
    {
        PlatformTarget::Android
    }
    #[cfg(target_os = "ios")]
    {
        PlatformTarget::Ios
    }
    #[cfg(target_arch = "wasm32")]
    {
        PlatformTarget::Web
    }
    #[cfg(not(any(
        target_os = "windows",
        target_os = "macos",
        target_os = "linux",
        target_os = "android",
        target_os = "ios",
        target_arch = "wasm32"
    )))]
    {
        PlatformTarget::Linux
    }
}

pub fn capabilities_for(target: PlatformTarget) -> PlatformCapabilities {
    match target {
        PlatformTarget::Windows => PlatformCapabilities {
            target,
            stage: SupportStage::Active,
            default_script_backend: ScriptBackendKind::NativeV8,
            fallback_script_backend: Some(ScriptBackendKind::NativeQuickJs),
            preferred_graphics: GraphicsBackendHint::Dx12,
            fallback_graphics: Some(GraphicsBackendHint::Vulkan),
            supports_multi_touch: false,
            supports_native_filesystem: true,
            requires_async_boot: false,
            supports_jit: true,
        },
        PlatformTarget::MacOs => PlatformCapabilities {
            target,
            stage: SupportStage::AdapterReserved,
            default_script_backend: ScriptBackendKind::NativeV8,
            fallback_script_backend: Some(ScriptBackendKind::NativeQuickJs),
            preferred_graphics: GraphicsBackendHint::Metal,
            fallback_graphics: None,
            supports_multi_touch: false,
            supports_native_filesystem: true,
            requires_async_boot: false,
            supports_jit: true,
        },
        PlatformTarget::Linux => PlatformCapabilities {
            target,
            stage: SupportStage::AdapterReserved,
            default_script_backend: ScriptBackendKind::NativeV8,
            fallback_script_backend: Some(ScriptBackendKind::NativeQuickJs),
            preferred_graphics: GraphicsBackendHint::Vulkan,
            fallback_graphics: Some(GraphicsBackendHint::Gles),
            supports_multi_touch: false,
            supports_native_filesystem: true,
            requires_async_boot: false,
            supports_jit: true,
        },
        PlatformTarget::Android => PlatformCapabilities {
            target,
            stage: SupportStage::Active,
            default_script_backend: ScriptBackendKind::NativeV8,
            fallback_script_backend: Some(ScriptBackendKind::NativeQuickJs),
            preferred_graphics: GraphicsBackendHint::Vulkan,
            fallback_graphics: Some(GraphicsBackendHint::Gles),
            supports_multi_touch: true,
            supports_native_filesystem: true,
            requires_async_boot: false,
            supports_jit: true,
        },
        PlatformTarget::Ios => PlatformCapabilities {
            target,
            stage: SupportStage::AdapterReserved,
            default_script_backend: ScriptBackendKind::NativeQuickJs,
            fallback_script_backend: None,
            preferred_graphics: GraphicsBackendHint::Metal,
            fallback_graphics: None,
            supports_multi_touch: true,
            supports_native_filesystem: true,
            requires_async_boot: false,
            supports_jit: false,
        },
        PlatformTarget::Web => PlatformCapabilities {
            target,
            stage: SupportStage::Active,
            default_script_backend: ScriptBackendKind::WebNativeJs,
            fallback_script_backend: None,
            preferred_graphics: GraphicsBackendHint::WebGpu,
            fallback_graphics: Some(GraphicsBackendHint::WebGl2),
            supports_multi_touch: true,
            supports_native_filesystem: false,
            requires_async_boot: true,
            supports_jit: true,
        },
    }
}

pub fn current_capabilities() -> PlatformCapabilities {
    capabilities_for(current_target())
}

/// Platform adapter contract implemented per target shell (Desktop / Mobile / Web).
pub trait PlatformAdapter: Send + Sync {
    fn target(&self) -> PlatformTarget;

    fn capabilities(&self) -> PlatformCapabilities {
        capabilities_for(self.target())
    }

    /// Persistent writable data directory (saves, settings, caches). None on stateless Web.
    fn writable_data_dir(&self) -> Option<PathBuf>;

    /// Request soft keyboard visibility on touch platforms (no-op on desktop).
    fn set_soft_keyboard_visible(&self, _visible: bool) {}
}

#[derive(Debug, Default)]
pub struct WindowsAdapter {
    pub data_dir: Option<PathBuf>,
}

impl PlatformAdapter for WindowsAdapter {
    fn target(&self) -> PlatformTarget {
        PlatformTarget::Windows
    }

    fn writable_data_dir(&self) -> Option<PathBuf> {
        self.data_dir
            .clone()
            .or_else(|| std::env::var_os("LOCALAPPDATA").map(|p| PathBuf::from(p).join("MEngine")))
    }
}

/// Reserved macOS desktop adapter entry point.
#[derive(Debug, Default)]
pub struct MacOsAdapter {
    pub data_dir: Option<PathBuf>,
}

impl PlatformAdapter for MacOsAdapter {
    fn target(&self) -> PlatformTarget {
        PlatformTarget::MacOs
    }

    fn writable_data_dir(&self) -> Option<PathBuf> {
        self.data_dir.clone()
    }
}

/// Reserved Linux desktop adapter entry point.
#[derive(Debug, Default)]
pub struct LinuxAdapter {
    pub data_dir: Option<PathBuf>,
}

impl PlatformAdapter for LinuxAdapter {
    fn target(&self) -> PlatformTarget {
        PlatformTarget::Linux
    }

    fn writable_data_dir(&self) -> Option<PathBuf> {
        self.data_dir.clone()
    }
}

/// Active Android mobile adapter entry point (bridges JNI / android-activity internal files dir).
#[derive(Debug, Default)]
pub struct AndroidAdapter {
    pub internal_files_dir: Option<PathBuf>,
}

impl PlatformAdapter for AndroidAdapter {
    fn target(&self) -> PlatformTarget {
        PlatformTarget::Android
    }

    fn writable_data_dir(&self) -> Option<PathBuf> {
        self.internal_files_dir.clone()
    }
}

/// Reserved iOS mobile adapter entry point (bridges Swift/Metal + App Sandbox Documents dir).
#[derive(Debug, Default)]
pub struct IosAdapter {
    pub documents_dir: Option<PathBuf>,
}

impl PlatformAdapter for IosAdapter {
    fn target(&self) -> PlatformTarget {
        PlatformTarget::Ios
    }

    fn writable_data_dir(&self) -> Option<PathBuf> {
        self.documents_dir.clone()
    }
}

/// Active Web / WASM adapter entry point (async boot, browser-native JS bridge, WebGPU/WebGL2).
#[derive(Debug, Default)]
pub struct WebAdapter {
    pub base_asset_url: String,
}

impl PlatformAdapter for WebAdapter {
    fn target(&self) -> PlatformTarget {
        PlatformTarget::Web
    }

    fn writable_data_dir(&self) -> Option<PathBuf> {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn platform_script_and_graphics_policies_match_architecture() {
        let win = capabilities_for(PlatformTarget::Windows);
        assert_eq!(win.default_script_backend, ScriptBackendKind::NativeV8);
        assert_eq!(win.stage, SupportStage::Active);

        let android = capabilities_for(PlatformTarget::Android);
        assert_eq!(android.default_script_backend, ScriptBackendKind::NativeV8);
        assert_eq!(android.fallback_graphics, Some(GraphicsBackendHint::Gles));
        assert!(android.supports_multi_touch);

        let ios = capabilities_for(PlatformTarget::Ios);
        assert_eq!(ios.stage, SupportStage::AdapterReserved);
        assert_eq!(ios.default_script_backend, ScriptBackendKind::NativeQuickJs);
        assert!(!ios.supports_jit);

        let web = capabilities_for(PlatformTarget::Web);
        assert_eq!(web.default_script_backend, ScriptBackendKind::WebNativeJs);
        assert!(web.requires_async_boot);
        assert!(!web.supports_native_filesystem);
    }
}
