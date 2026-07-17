//! wgpu-based RHI with a minimal linear render-graph.

mod mesh;
mod render_graph;
mod renderer;
mod ui;

pub use mesh::{MeshGpu, Vertex};
pub use render_graph::{PassDesc, RenderGraph};
pub use renderer::{
    look_at, orthographic, perspective, ClearColor, DirectionalLightData, FrameCamera,
    FrameLighting, PointLightData, RenderMaterial, RenderObject, Renderer, SpotLightData,
};
pub use ui::{
    UiBatch, UiBatchKey, UiBatchPlan, UiBlendMode, UiClipRect, UiFrameStats, UiPrimitive,
    UiTextureError,
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
}
