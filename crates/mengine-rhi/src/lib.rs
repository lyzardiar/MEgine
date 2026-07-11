//! wgpu-based RHI with a minimal linear render-graph.

mod mesh;
mod renderer;
mod render_graph;

pub use mesh::{MeshGpu, Vertex};
pub use render_graph::{PassDesc, RenderGraph};
pub use renderer::{
    look_at, perspective, ClearColor, FrameCamera, RenderObject, Renderer,
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
