//! wgpu-based RHI with a minimal linear render-graph.

mod ibl;
mod mesh;
mod post_process;
mod render_graph;
mod renderer;
mod shader_targets;
mod sky;
mod ui;

pub use mesh::{MeshGpu, Vertex};
pub use render_graph::{PassDesc, RenderGraph};
pub use renderer::{
    look_at, orthographic, perspective, project_world_to_viewport, validate_surface_shader_hook,
    ClearColor, DirectionalLightData, EnvironmentLightData, FrameCamera, FrameLighting,
    MaterialBlendMode, MaterialFilter, MaterialPipelinePrewarmReport, MaterialPipelineStats,
    MaterialTextureStats, MaterialWrap, OffscreenRenderTarget, PointLightData, RenderFrame,
    RenderMaterial, RenderObject, RenderTarget, Renderer, SpotLightData,
    SurfaceShaderParameterBinding, SurfaceShaderPipelineDiagnostic,
};
pub use shader_targets::{compile_shader_backends, ShaderBackendArtifact, ShaderCompilationReport};
pub use ui::{
    validate_ui_shader_hook, UiBatch, UiBatchKey, UiBatchPlan, UiBlendMode, UiClipRect,
    UiFrameStats, UiPrimitive, UiRenderMaterial, UiShaderChannelData, UiShaderChannels, UiSoftClip,
    UiStencilMode, UiTextureError,
};

use thiserror::Error;

#[derive(Debug, Error)]
pub enum RhiError {
    #[error("surface error: {0}")]
    Surface(#[from] wgpu::SurfaceError),
    #[error("request device failed: {0}")]
    RequestDevice(String),
    #[error("no adapter")]
    NoAdapter,
    #[error("invalid render target: {0}")]
    InvalidTarget(String),
}
