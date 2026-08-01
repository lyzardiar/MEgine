use bytemuck::{Pod, Zeroable};
use std::collections::HashMap;
use std::hash::Hash;
use thiserror::Error;
use wgpu::util::DeviceExt;

#[derive(Clone, Debug, Error, PartialEq, Eq)]
pub enum UiTextureError {
    #[error("texture dimensions must be greater than zero")]
    EmptyDimensions,
    #[error("RGBA texture data length mismatch: expected {expected}, got {actual}")]
    InvalidDataLength { expected: usize, actual: usize },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum UiBlendMode {
    Alpha,
    Additive,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub enum UiStencilMode {
    #[default]
    Disabled,
    /// Render only where the current stencil depth equals `reference`.
    Test { reference: u8 },
    /// Draw a mask and increment matching pixels for its children.
    Push { reference: u8 },
    /// Redraw the mask after its descendants and restore the parent depth.
    Pop { reference: u8 },
}

impl UiStencilMode {
    fn pipeline(self) -> UiStencilPipeline {
        match self {
            Self::Disabled => UiStencilPipeline::Disabled,
            Self::Test { .. } => UiStencilPipeline::Test,
            Self::Push { .. } => UiStencilPipeline::Push,
            Self::Pop { .. } => UiStencilPipeline::Pop,
        }
    }

    fn reference(self) -> u32 {
        match self {
            Self::Disabled => 0,
            Self::Test { reference } | Self::Push { reference } | Self::Pop { reference } => {
                u32::from(reference)
            }
        }
    }

    fn writes_stencil(self) -> bool {
        matches!(self, Self::Push { .. } | Self::Pop { .. })
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct UiClipRect {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct UiSoftClip {
    /// Top-left pixel rect: x, y, width, height.
    pub rect: [f32; 4],
    /// Horizontal and vertical inner fade distances in pixels.
    pub softness: [f32; 2],
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct UiBatchKey {
    /// Nested Canvases are independent Unity batching islands even when their
    /// material and texture match the parent Canvas.
    pub canvas_group: Option<u64>,
    pub material: String,
    pub texture: String,
    pub clip: Option<UiClipRect>,
    pub blend: UiBlendMode,
    /// Test the primitive against the scene depth buffer without writing depth.
    pub depth_test: bool,
    pub stencil: UiStencilMode,
}

impl Default for UiBatchKey {
    fn default() -> Self {
        Self {
            canvas_group: None,
            material: "ui/default".into(),
            texture: "white".into(),
            clip: None,
            blend: UiBlendMode::Alpha,
            depth_test: false,
            stencil: UiStencilMode::Disabled,
        }
    }
}

#[derive(Clone, Debug)]
pub struct UiPrimitive {
    /// Top-left pixel rect: x, y, width, height.
    pub rect: [f32; 4],
    pub color: [f32; 4],
    pub pivot: [f32; 2],
    pub rotation_radians: f32,
    /// WebGPU clip-space depth in the 0..1 range for screen-aligned primitives.
    pub depth: f32,
    /// Optional clip-space corners ordered top-left, top-right, bottom-right, bottom-left.
    /// Supplying corners preserves perspective for World Space Canvas quads.
    pub clip_corners: Option<[[f32; 4]; 4]>,
    /// Normalized UV rect: u, v, width, height.
    pub uv: [f32; 4],
    /// Optional normalized positions for the four quad vertex slots. The default
    /// order is top-left, top-right, bottom-right, bottom-left. Custom polygons
    /// let Unity-style Filled Images retain their generated mesh and UV mapping.
    pub vertex_positions: Option<[[f32; 2]; 4]>,
    /// Nested RectMask2D soft clips, ordered outermost to innermost.
    pub soft_clips: [Option<UiSoftClip>; 8],
    pub key: UiBatchKey,
}

impl UiPrimitive {
    pub fn solid(rect: [f32; 4], color: [f32; 4]) -> Self {
        Self {
            rect,
            color,
            pivot: [0.5, 0.5],
            rotation_radians: 0.0,
            depth: 0.0,
            clip_corners: None,
            uv: [0.0, 0.0, 1.0, 1.0],
            vertex_positions: None,
            soft_clips: [None; 8],
            key: UiBatchKey::default(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UiBatch {
    pub key: UiBatchKey,
    pub start: u32,
    pub end: u32,
}

#[derive(Clone, Debug, Default)]
pub struct UiBatchPlan {
    pub primitives: Vec<UiPrimitive>,
    pub batches: Vec<UiBatch>,
}

impl UiBatchPlan {
    pub fn build(primitives: Vec<UiPrimitive>) -> Self {
        let mut batches: Vec<UiBatch> = Vec::new();
        for (index, primitive) in primitives.iter().enumerate() {
            let index = index as u32;
            if let Some(tail) = batches.last_mut() {
                if tail.key == primitive.key {
                    tail.end = index + 1;
                    continue;
                }
            }
            batches.push(UiBatch {
                key: primitive.key.clone(),
                start: index,
                end: index + 1,
            });
        }
        Self {
            primitives,
            batches,
        }
    }

    pub fn is_empty(&self) -> bool {
        self.primitives.is_empty()
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct UiFrameStats {
    pub primitives: u32,
    pub batches: u32,
    pub draw_calls: u32,
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct UiVertex {
    position: [f32; 2],
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct UiInstance {
    rect: [f32; 4],
    color: [f32; 4],
    transform: [f32; 4],
    uv: [f32; 4],
    projection: [f32; 4],
    corners: [[f32; 4]; 4],
    vertex_positions: [[f32; 4]; 2],
}

impl From<&UiPrimitive> for UiInstance {
    fn from(value: &UiPrimitive) -> Self {
        let vertices =
            value
                .vertex_positions
                .unwrap_or([[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]]);
        Self {
            rect: value.rect,
            color: value.color,
            transform: [value.rotation_radians, value.pivot[0], value.pivot[1], 0.0],
            uv: value.uv,
            projection: [
                if value.depth.is_finite() {
                    value.depth.clamp(0.0, 1.0)
                } else {
                    0.0
                },
                if value.clip_corners.is_some() {
                    1.0
                } else {
                    0.0
                },
                if value.key.stencil.writes_stencil() {
                    1.0
                } else {
                    0.0
                },
                0.0,
            ],
            corners: value.clip_corners.unwrap_or([[0.0; 4]; 4]),
            vertex_positions: [
                [
                    vertices[0][0],
                    vertices[1][0],
                    vertices[2][0],
                    vertices[3][0],
                ],
                [
                    vertices[0][1],
                    vertices[1][1],
                    vertices[2][1],
                    vertices[3][1],
                ],
            ],
        }
    }
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct UiUniform {
    viewport: [f32; 2],
    _padding: [f32; 2],
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct UiSoftClipGpu {
    rect: [f32; 4],
    softness: [f32; 4],
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct UiSoftClipInstance {
    clips: [UiSoftClipGpu; 8],
}

impl From<&UiPrimitive> for UiSoftClipInstance {
    fn from(value: &UiPrimitive) -> Self {
        Self {
            clips: std::array::from_fn(|index| match value.soft_clips[index] {
                Some(clip) => UiSoftClipGpu {
                    rect: clip.rect,
                    softness: [clip.softness[0], clip.softness[1], 1.0, 0.0],
                },
                None => UiSoftClipGpu::zeroed(),
            }),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
enum UiStencilPipeline {
    Disabled,
    Test,
    Push,
    Pop,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
struct UiPipelineKey {
    blend: UiBlendMode,
    depth_test: bool,
    stencil: UiStencilPipeline,
}

pub(crate) struct UiRenderer {
    pipelines: HashMap<UiPipelineKey, wgpu::RenderPipeline>,
    vertex_buffer: wgpu::Buffer,
    instance_buffer: wgpu::Buffer,
    soft_clip_buffer: wgpu::Buffer,
    instance_capacity: usize,
    uniform_buffer: wgpu::Buffer,
    bind_group_layout: wgpu::BindGroupLayout,
    bind_group: wgpu::BindGroup,
    texture_bind_group_layout: wgpu::BindGroupLayout,
    sampler: wgpu::Sampler,
    fallback_texture: UiTextureGpu,
    textures: HashMap<String, UiTextureGpu>,
    viewport: [u32; 2],
    stats: UiFrameStats,
}

struct UiTextureGpu {
    _texture: wgpu::Texture,
    bind_group: wgpu::BindGroup,
}

impl UiRenderer {
    pub fn new(
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        format: wgpu::TextureFormat,
        width: u32,
        height: u32,
    ) -> Self {
        const VERTICES: [UiVertex; 6] = [
            UiVertex {
                position: [0.0, 0.0],
            },
            UiVertex {
                position: [1.0, 0.0],
            },
            UiVertex {
                position: [1.0, 1.0],
            },
            UiVertex {
                position: [0.0, 0.0],
            },
            UiVertex {
                position: [1.0, 1.0],
            },
            UiVertex {
                position: [0.0, 1.0],
            },
        ];
        let vertex_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("ui_quad_vertices"),
            contents: bytemuck::cast_slice(&VERTICES),
            usage: wgpu::BufferUsages::VERTEX,
        });
        let instance_capacity = 256;
        let instance_buffer = create_instance_buffer(device, instance_capacity);
        let soft_clip_buffer = create_soft_clip_buffer(device, instance_capacity);
        let uniform_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("ui_frame_uniform"),
            contents: bytemuck::bytes_of(&UiUniform {
                viewport: [width.max(1) as f32, height.max(1) as f32],
                _padding: [0.0; 2],
            }),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });
        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("ui_frame_bgl"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::VERTEX,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });
        let bind_group = create_frame_bind_group(
            device,
            &bind_group_layout,
            &uniform_buffer,
            &soft_clip_buffer,
        );
        let texture_bind_group_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("ui_texture_bgl"),
                entries: &[
                    wgpu::BindGroupLayoutEntry {
                        binding: 0,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Float { filterable: true },
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 1,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                        count: None,
                    },
                ],
            });
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("ui_linear_sampler"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::FilterMode::Nearest,
            ..Default::default()
        });
        let fallback_texture = create_texture_rgba8(
            device,
            queue,
            &texture_bind_group_layout,
            &sampler,
            "ui_white_texture",
            [1, 1],
            &[255, 255, 255, 255],
        );
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("ui_instanced"),
            source: wgpu::ShaderSource::Wgsl(UI_WGSL.into()),
        });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("ui_pipeline_layout"),
            bind_group_layouts: &[&bind_group_layout, &texture_bind_group_layout],
            push_constant_ranges: &[],
        });
        let mut pipelines = HashMap::new();
        for blend in [UiBlendMode::Alpha, UiBlendMode::Additive] {
            for depth_test in [false, true] {
                for stencil in [UiStencilPipeline::Disabled, UiStencilPipeline::Test] {
                    let key = UiPipelineKey {
                        blend,
                        depth_test,
                        stencil,
                    };
                    pipelines.insert(
                        key,
                        create_ui_pipeline(device, &pipeline_layout, &shader, format, key),
                    );
                }
            }
        }
        for depth_test in [false, true] {
            for stencil in [UiStencilPipeline::Push, UiStencilPipeline::Pop] {
                let key = UiPipelineKey {
                    blend: UiBlendMode::Alpha,
                    depth_test,
                    stencil,
                };
                pipelines.insert(
                    key,
                    create_ui_pipeline(device, &pipeline_layout, &shader, format, key),
                );
            }
        }

        Self {
            pipelines,
            vertex_buffer,
            instance_buffer,
            soft_clip_buffer,
            instance_capacity,
            uniform_buffer,
            bind_group_layout,
            bind_group,
            texture_bind_group_layout,
            sampler,
            fallback_texture,
            textures: HashMap::new(),
            viewport: [width.max(1), height.max(1)],
            stats: UiFrameStats::default(),
        }
    }

    pub fn upload_texture_rgba8(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        key: &str,
        width: u32,
        height: u32,
        rgba8: &[u8],
    ) -> Result<(), UiTextureError> {
        validate_texture_rgba8(width, height, rgba8)?;
        let texture = create_texture_rgba8(
            device,
            queue,
            &self.texture_bind_group_layout,
            &self.sampler,
            key,
            [width, height],
            rgba8,
        );
        self.textures.insert(key.to_owned(), texture);
        Ok(())
    }

    pub fn remove_texture(&mut self, key: &str) -> bool {
        self.textures.remove(key).is_some()
    }

    pub fn resize(&mut self, queue: &wgpu::Queue, width: u32, height: u32) {
        self.viewport = [width.max(1), height.max(1)];
        self.write_uniform(queue);
    }

    pub fn prepare(&mut self, device: &wgpu::Device, queue: &wgpu::Queue, plan: &UiBatchPlan) {
        if plan.primitives.len() > self.instance_capacity {
            self.instance_capacity = plan.primitives.len().next_power_of_two();
            self.instance_buffer = create_instance_buffer(device, self.instance_capacity);
            self.soft_clip_buffer = create_soft_clip_buffer(device, self.instance_capacity);
            self.bind_group = create_frame_bind_group(
                device,
                &self.bind_group_layout,
                &self.uniform_buffer,
                &self.soft_clip_buffer,
            );
        }
        if !plan.primitives.is_empty() {
            let instances: Vec<UiInstance> = plan.primitives.iter().map(UiInstance::from).collect();
            queue.write_buffer(&self.instance_buffer, 0, bytemuck::cast_slice(&instances));
            let soft_clips: Vec<UiSoftClipInstance> = plan
                .primitives
                .iter()
                .map(UiSoftClipInstance::from)
                .collect();
            queue.write_buffer(&self.soft_clip_buffer, 0, bytemuck::cast_slice(&soft_clips));
        }
        self.write_uniform(queue);
        self.stats = UiFrameStats {
            primitives: plan.primitives.len() as u32,
            batches: plan.batches.len() as u32,
            draw_calls: plan
                .batches
                .iter()
                .filter(|batch| {
                    batch.key.clip.is_none_or(|clip| {
                        clip.x < self.viewport[0]
                            && clip.y < self.viewport[1]
                            && clip.width > 0
                            && clip.height > 0
                    })
                })
                .count() as u32,
        };
    }

    fn write_uniform(&self, queue: &wgpu::Queue) {
        queue.write_buffer(
            &self.uniform_buffer,
            0,
            bytemuck::bytes_of(&UiUniform {
                viewport: [self.viewport[0] as f32, self.viewport[1] as f32],
                _padding: [0.0; 2],
            }),
        );
    }

    pub fn draw<'pass>(&'pass self, pass: &mut wgpu::RenderPass<'pass>, plan: &UiBatchPlan) {
        if plan.is_empty() {
            return;
        }
        pass.set_bind_group(0, &self.bind_group, &[]);
        pass.set_vertex_buffer(0, self.vertex_buffer.slice(..));
        pass.set_vertex_buffer(1, self.instance_buffer.slice(..));
        for batch in &plan.batches {
            let pipeline_key = UiPipelineKey {
                blend: if matches!(
                    batch.key.stencil,
                    UiStencilMode::Push { .. } | UiStencilMode::Pop { .. }
                ) {
                    UiBlendMode::Alpha
                } else {
                    batch.key.blend
                },
                depth_test: batch.key.depth_test,
                stencil: batch.key.stencil.pipeline(),
            };
            pass.set_pipeline(
                self.pipelines
                    .get(&pipeline_key)
                    .expect("all UI pipeline variants are created at startup"),
            );
            pass.set_stencil_reference(batch.key.stencil.reference());
            let texture = self
                .textures
                .get(&batch.key.texture)
                .unwrap_or(&self.fallback_texture);
            pass.set_bind_group(1, &texture.bind_group, &[]);
            if let Some(clip) = batch.key.clip {
                let x = clip.x.min(self.viewport[0]);
                let y = clip.y.min(self.viewport[1]);
                let width = clip.width.min(self.viewport[0].saturating_sub(x));
                let height = clip.height.min(self.viewport[1].saturating_sub(y));
                if width == 0 || height == 0 {
                    continue;
                }
                pass.set_scissor_rect(x, y, width, height);
            } else {
                pass.set_scissor_rect(0, 0, self.viewport[0], self.viewport[1]);
            }
            pass.draw(0..6, batch.start..batch.end);
        }
    }

    pub fn stats(&self) -> UiFrameStats {
        self.stats
    }
}

fn additive_blend_state() -> wgpu::BlendState {
    wgpu::BlendState {
        color: wgpu::BlendComponent {
            src_factor: wgpu::BlendFactor::SrcAlpha,
            dst_factor: wgpu::BlendFactor::One,
            operation: wgpu::BlendOperation::Add,
        },
        alpha: wgpu::BlendComponent {
            src_factor: wgpu::BlendFactor::One,
            dst_factor: wgpu::BlendFactor::One,
            operation: wgpu::BlendOperation::Add,
        },
    }
}

fn create_ui_pipeline(
    device: &wgpu::Device,
    layout: &wgpu::PipelineLayout,
    shader: &wgpu::ShaderModule,
    format: wgpu::TextureFormat,
    key: UiPipelineKey,
) -> wgpu::RenderPipeline {
    let (compare, pass_op, color_write) = match key.stencil {
        UiStencilPipeline::Disabled => (
            wgpu::CompareFunction::Always,
            wgpu::StencilOperation::Keep,
            true,
        ),
        UiStencilPipeline::Test => (
            wgpu::CompareFunction::Equal,
            wgpu::StencilOperation::Keep,
            true,
        ),
        UiStencilPipeline::Push => (
            wgpu::CompareFunction::Equal,
            wgpu::StencilOperation::IncrementClamp,
            false,
        ),
        UiStencilPipeline::Pop => (
            wgpu::CompareFunction::Equal,
            wgpu::StencilOperation::DecrementClamp,
            false,
        ),
    };
    let stencil_face = wgpu::StencilFaceState {
        compare,
        fail_op: wgpu::StencilOperation::Keep,
        depth_fail_op: wgpu::StencilOperation::Keep,
        pass_op,
    };
    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some(match (key.depth_test, key.stencil) {
            (_, UiStencilPipeline::Push) => "ui_stencil_push",
            (_, UiStencilPipeline::Pop) => "ui_stencil_pop",
            (true, UiStencilPipeline::Test) => "ui_depth_stencil_test",
            (false, UiStencilPipeline::Test) => "ui_stencil_test",
            (true, UiStencilPipeline::Disabled) => "ui_depth",
            (false, UiStencilPipeline::Disabled) => "ui_overlay",
        }),
        layout: Some(layout),
        vertex: wgpu::VertexState {
            module: shader,
            entry_point: Some("vs_main"),
            buffers: &[
                wgpu::VertexBufferLayout {
                    array_stride: std::mem::size_of::<UiVertex>() as u64,
                    step_mode: wgpu::VertexStepMode::Vertex,
                    attributes: &wgpu::vertex_attr_array![0 => Float32x2],
                },
                wgpu::VertexBufferLayout {
                    array_stride: std::mem::size_of::<UiInstance>() as u64,
                    step_mode: wgpu::VertexStepMode::Instance,
                    attributes: &wgpu::vertex_attr_array![
                        1 => Float32x4, 2 => Float32x4, 3 => Float32x4, 4 => Float32x4,
                        5 => Float32x4, 6 => Float32x4, 7 => Float32x4, 8 => Float32x4,
                        9 => Float32x4, 10 => Float32x4, 11 => Float32x4
                    ],
                },
            ],
            compilation_options: Default::default(),
        },
        fragment: Some(wgpu::FragmentState {
            module: shader,
            entry_point: Some("fs_main"),
            targets: &[Some(wgpu::ColorTargetState {
                format,
                blend: Some(match key.blend {
                    UiBlendMode::Alpha => wgpu::BlendState::ALPHA_BLENDING,
                    UiBlendMode::Additive => additive_blend_state(),
                }),
                write_mask: if color_write {
                    wgpu::ColorWrites::ALL
                } else {
                    wgpu::ColorWrites::empty()
                },
            })],
            compilation_options: Default::default(),
        }),
        primitive: wgpu::PrimitiveState {
            topology: wgpu::PrimitiveTopology::TriangleList,
            cull_mode: None,
            ..Default::default()
        },
        depth_stencil: Some(wgpu::DepthStencilState {
            format: wgpu::TextureFormat::Depth24PlusStencil8,
            depth_write_enabled: false,
            depth_compare: if key.depth_test {
                wgpu::CompareFunction::LessEqual
            } else {
                wgpu::CompareFunction::Always
            },
            stencil: wgpu::StencilState {
                front: stencil_face,
                back: stencil_face,
                read_mask: 0xff,
                write_mask: if matches!(
                    key.stencil,
                    UiStencilPipeline::Push | UiStencilPipeline::Pop
                ) {
                    0xff
                } else {
                    0
                },
            },
            bias: Default::default(),
        }),
        multisample: wgpu::MultisampleState::default(),
        multiview: None,
        cache: None,
    })
}

fn validate_texture_rgba8(width: u32, height: u32, rgba8: &[u8]) -> Result<(), UiTextureError> {
    if width == 0 || height == 0 {
        return Err(UiTextureError::EmptyDimensions);
    }
    let expected = width as usize * height as usize * 4;
    if rgba8.len() != expected {
        return Err(UiTextureError::InvalidDataLength {
            expected,
            actual: rgba8.len(),
        });
    }
    Ok(())
}

fn create_texture_rgba8(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    layout: &wgpu::BindGroupLayout,
    sampler: &wgpu::Sampler,
    label: &str,
    dimensions: [u32; 2],
    rgba8: &[u8],
) -> UiTextureGpu {
    let [width, height] = dimensions;
    let size = wgpu::Extent3d {
        width,
        height,
        depth_or_array_layers: 1,
    };
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some(label),
        size,
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8UnormSrgb,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    });
    queue.write_texture(
        wgpu::TexelCopyTextureInfo {
            texture: &texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        rgba8,
        wgpu::TexelCopyBufferLayout {
            offset: 0,
            bytes_per_row: Some(width * 4),
            rows_per_image: Some(height),
        },
        size,
    );
    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
    let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some(&format!("{label}_bg")),
        layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::TextureView(&view),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: wgpu::BindingResource::Sampler(sampler),
            },
        ],
    });
    UiTextureGpu {
        _texture: texture,
        bind_group,
    }
}

fn create_instance_buffer(device: &wgpu::Device, capacity: usize) -> wgpu::Buffer {
    device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("ui_instances"),
        size: (capacity.max(1) * std::mem::size_of::<UiInstance>()) as u64,
        usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    })
}

fn create_soft_clip_buffer(device: &wgpu::Device, capacity: usize) -> wgpu::Buffer {
    device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("ui_soft_clips"),
        size: (capacity.max(1) * std::mem::size_of::<UiSoftClipInstance>()) as u64,
        usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    })
}

fn create_frame_bind_group(
    device: &wgpu::Device,
    layout: &wgpu::BindGroupLayout,
    uniform_buffer: &wgpu::Buffer,
    soft_clip_buffer: &wgpu::Buffer,
) -> wgpu::BindGroup {
    device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("ui_frame_bg"),
        layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: uniform_buffer.as_entire_binding(),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: soft_clip_buffer.as_entire_binding(),
            },
        ],
    })
}

const UI_WGSL: &str = r#"
struct UiFrame {
    viewport: vec2<f32>,
    padding: vec2<f32>,
};
@group(0) @binding(0) var<uniform> frame: UiFrame;
struct UiSoftClip {
    rect: vec4<f32>,
    softness: vec4<f32>,
};
struct UiSoftClipInstance {
    clips: array<UiSoftClip, 8>,
};
@group(0) @binding(1) var<storage, read> soft_clip_instances: array<UiSoftClipInstance>;
@group(1) @binding(0) var ui_texture: texture_2d<f32>;
@group(1) @binding(1) var ui_sampler: sampler;

struct VsIn {
    @builtin(instance_index) instance_index: u32,
    @location(0) position: vec2<f32>,
    @location(1) rect: vec4<f32>,
    @location(2) color: vec4<f32>,
    @location(3) transform: vec4<f32>,
    @location(4) uv_rect: vec4<f32>,
    @location(5) projection: vec4<f32>,
    @location(6) corner_top_left: vec4<f32>,
    @location(7) corner_top_right: vec4<f32>,
    @location(8) corner_bottom_right: vec4<f32>,
    @location(9) corner_bottom_left: vec4<f32>,
    @location(10) vertex_x: vec4<f32>,
    @location(11) vertex_y: vec4<f32>,
};

struct VsOut {
    @builtin(position) clip: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) alpha_clip: f32,
    @location(3) @interpolate(flat) instance_index: u32,
};

@vertex
fn vs_main(input: VsIn) -> VsOut {
    let vertex_top = mix(
        vec2<f32>(input.vertex_x.x, input.vertex_y.x),
        vec2<f32>(input.vertex_x.y, input.vertex_y.y),
        input.position.x,
    );
    let vertex_bottom = mix(
        vec2<f32>(input.vertex_x.w, input.vertex_y.w),
        vec2<f32>(input.vertex_x.z, input.vertex_y.z),
        input.position.x,
    );
    let vertex_position = mix(vertex_top, vertex_bottom, input.position.y);
    let pivot = input.transform.yz;
    let local = (vertex_position - pivot) * input.rect.zw;
    let c = cos(input.transform.x);
    let s = sin(input.transform.x);
    let rotated = vec2<f32>(local.x * c - local.y * s, local.x * s + local.y * c);
    let pixel = input.rect.xy + pivot * input.rect.zw + rotated;
    let ndc = vec2<f32>(pixel.x / frame.viewport.x * 2.0 - 1.0, 1.0 - pixel.y / frame.viewport.y * 2.0);
    var output: VsOut;
    if input.projection.y > 0.5 {
        let top = mix(input.corner_top_left, input.corner_top_right, vertex_position.x);
        let bottom = mix(input.corner_bottom_left, input.corner_bottom_right, vertex_position.x);
        output.clip = mix(top, bottom, vertex_position.y);
    } else {
        output.clip = vec4<f32>(ndc, input.projection.x, 1.0);
    }
    output.color = input.color;
    output.uv = input.uv_rect.xy + vertex_position * input.uv_rect.zw;
    output.alpha_clip = input.projection.z;
    output.instance_index = input.instance_index;
    return output;
}

@fragment
fn fs_main(input: VsOut) -> @location(0) vec4<f32> {
    var color = textureSample(ui_texture, ui_sampler, input.uv) * input.color;
    if input.alpha_clip > 0.5 && color.a <= 0.001 {
        discard;
    }
    var clip_alpha = 1.0;
    for (var index = 0u; index < 8u; index = index + 1u) {
        let clip = soft_clip_instances[input.instance_index].clips[index];
        if clip.softness.z > 0.5 {
            let distance = min(
                input.clip.xy - clip.rect.xy,
                clip.rect.xy + clip.rect.zw - input.clip.xy,
            );
            if distance.x <= 0.0 || distance.y <= 0.0 {
                discard;
            }
            let horizontal = select(1.0, clamp(distance.x / max(clip.softness.x, 0.000001), 0.0, 1.0), clip.softness.x > 0.0);
            let vertical = select(1.0, clamp(distance.y / max(clip.softness.y, 0.000001), 0.0, 1.0), clip.softness.y > 0.0);
            clip_alpha = clip_alpha * horizontal * vertical;
        }
    }
    color.a = color.a * clip_alpha;
    return color;
}
"#;

#[cfg(test)]
mod tests {
    use super::*;

    fn primitive(texture: &str, clip: Option<UiClipRect>) -> UiPrimitive {
        let mut primitive = UiPrimitive::solid([0.0, 0.0, 10.0, 10.0], [1.0; 4]);
        primitive.key.texture = texture.into();
        primitive.key.clip = clip;
        primitive
    }

    #[test]
    fn merges_only_adjacent_compatible_primitives() {
        let plan = UiBatchPlan::build(vec![
            primitive("atlas", None),
            primitive("atlas", None),
            primitive("other", None),
            primitive("atlas", None),
        ]);
        assert_eq!(plan.batches.len(), 3);
        assert_eq!((plan.batches[0].start, plan.batches[0].end), (0, 2));
        assert_eq!((plan.batches[2].start, plan.batches[2].end), (3, 4));
    }

    #[test]
    fn canvas_groups_split_otherwise_compatible_batches() {
        let mut parent_before = primitive("atlas", None);
        parent_before.key.canvas_group = Some(1);
        let mut nested = primitive("atlas", None);
        nested.key.canvas_group = Some(2);
        let mut parent_after = primitive("atlas", None);
        parent_after.key.canvas_group = Some(1);
        let plan = UiBatchPlan::build(vec![parent_before, nested, parent_after]);
        assert_eq!(plan.batches.len(), 3);
        assert_eq!(plan.batches[0].key.canvas_group, Some(1));
        assert_eq!(plan.batches[1].key.canvas_group, Some(2));
        assert_eq!(plan.batches[2].key.canvas_group, Some(1));
    }

    #[test]
    fn clip_changes_split_batches() {
        let clip = UiClipRect {
            x: 0,
            y: 0,
            width: 100,
            height: 100,
        };
        let plan = UiBatchPlan::build(vec![
            primitive("atlas", None),
            primitive("atlas", Some(clip)),
            primitive("atlas", Some(clip)),
        ]);
        assert_eq!(plan.batches.len(), 2);
        assert_eq!((plan.batches[1].start, plan.batches[1].end), (1, 3));
    }

    #[test]
    fn custom_vertex_positions_flow_into_instances() {
        let vertices = [[0.0, 1.0], [0.0, 0.0], [0.75, 0.0], [0.75, 1.0]];
        let mut primitive = UiPrimitive::solid([0.0, 0.0, 10.0, 10.0], [1.0; 4]);
        primitive.vertex_positions = Some(vertices);
        let instance = UiInstance::from(&primitive);
        assert_eq!(instance.vertex_positions[0], [0.0, 0.0, 0.75, 0.75]);
        assert_eq!(instance.vertex_positions[1], [1.0, 0.0, 0.0, 1.0]);
    }

    #[test]
    fn ui_shader_with_custom_quad_attributes_parses() {
        naga::front::wgsl::parse_str(UI_WGSL).expect("UI WGSL should remain valid");
    }

    #[test]
    fn depth_state_changes_split_batches_and_reaches_instances() {
        let overlay = primitive("atlas", None);
        let mut camera = primitive("atlas", None);
        camera.key.depth_test = true;
        camera.depth = 0.75;
        camera.clip_corners = Some([
            [-1.0, 1.0, 0.75, 1.0],
            [1.0, 1.0, 0.75, 1.0],
            [1.0, -1.0, 0.75, 1.0],
            [-1.0, -1.0, 0.75, 1.0],
        ]);
        let plan = UiBatchPlan::build(vec![overlay, camera.clone()]);
        assert_eq!(plan.batches.len(), 2);
        let instance = UiInstance::from(&camera);
        assert_eq!(instance.projection[0], 0.75);
        assert_eq!(instance.projection[1], 1.0);
        assert_eq!(instance.corners[2], [1.0, -1.0, 0.75, 1.0]);
    }

    #[test]
    fn stencil_modes_split_batches_and_mark_only_mask_writes_for_alpha_clip() {
        let mut visible = primitive("atlas", None);
        visible.key.stencil = UiStencilMode::Test { reference: 1 };
        let mut push = primitive("atlas", None);
        push.key.stencil = UiStencilMode::Push { reference: 1 };
        let mut child = primitive("atlas", None);
        child.key.stencil = UiStencilMode::Test { reference: 2 };
        let mut pop = primitive("atlas", None);
        pop.key.stencil = UiStencilMode::Pop { reference: 2 };

        let plan = UiBatchPlan::build(vec![visible.clone(), push.clone(), child, pop.clone()]);
        assert_eq!(plan.batches.len(), 4);
        assert_eq!(plan.batches[0].key.stencil.reference(), 1);
        assert_eq!(plan.batches[1].key.stencil.reference(), 1);
        assert_eq!(plan.batches[2].key.stencil.reference(), 2);
        assert_eq!(plan.batches[3].key.stencil.reference(), 2);
        assert_eq!(UiInstance::from(&visible).projection[2], 0.0);
        assert_eq!(UiInstance::from(&push).projection[2], 1.0);
        assert_eq!(UiInstance::from(&pop).projection[2], 1.0);
    }

    #[test]
    fn nested_soft_clips_reach_the_per_instance_gpu_buffer() {
        let mut value = primitive("white", None);
        value.soft_clips[0] = Some(UiSoftClip {
            rect: [10.0, 20.0, 100.0, 80.0],
            softness: [4.0, 6.0],
        });
        value.soft_clips[1] = Some(UiSoftClip {
            rect: [30.0, 40.0, 50.0, 30.0],
            softness: [8.0, 10.0],
        });
        let gpu = UiSoftClipInstance::from(&value);
        assert_eq!(gpu.clips[0].rect, [10.0, 20.0, 100.0, 80.0]);
        assert_eq!(gpu.clips[0].softness, [4.0, 6.0, 1.0, 0.0]);
        assert_eq!(gpu.clips[1].rect, [30.0, 40.0, 50.0, 30.0]);
        assert_eq!(gpu.clips[1].softness, [8.0, 10.0, 1.0, 0.0]);
        assert_eq!(gpu.clips[2].softness[2], 0.0);
    }

    #[test]
    fn stencil_pipelines_encode_on_an_available_headless_adapter() {
        let instance = wgpu::Instance::default();
        let Some(adapter) =
            pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: None,
                force_fallback_adapter: false,
            }))
        else {
            return;
        };
        let (device, queue) = pollster::block_on(adapter.request_device(
            &wgpu::DeviceDescriptor {
                label: Some("ui_stencil_test"),
                required_features: wgpu::Features::empty(),
                required_limits: wgpu::Limits::default(),
                memory_hints: Default::default(),
            },
            None,
        ))
        .expect("headless UI test device");
        device.push_error_scope(wgpu::ErrorFilter::Validation);

        let format = wgpu::TextureFormat::Bgra8UnormSrgb;
        let mut renderer = UiRenderer::new(&device, &queue, format, 16, 16);
        let mut push = primitive("white", None);
        push.key.stencil = UiStencilMode::Push { reference: 0 };
        let mut child = primitive("white", None);
        child.key.stencil = UiStencilMode::Test { reference: 1 };
        let mut pop = primitive("white", None);
        pop.key.stencil = UiStencilMode::Pop { reference: 1 };
        let plan = UiBatchPlan::build(vec![push, child, pop]);
        renderer.prepare(&device, &queue, &plan);

        let color = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("ui_stencil_test_color"),
            size: wgpu::Extent3d {
                width: 16,
                height: 16,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        });
        let depth = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("ui_stencil_test_depth"),
            size: wgpu::Extent3d {
                width: 16,
                height: 16,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Depth24PlusStencil8,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        });
        let color_view = color.create_view(&Default::default());
        let depth_view = depth.create_view(&Default::default());
        let mut encoder = device.create_command_encoder(&Default::default());
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("ui_stencil_test_pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &color_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: &depth_view,
                    depth_ops: Some(wgpu::Operations {
                        load: wgpu::LoadOp::Clear(1.0),
                        store: wgpu::StoreOp::Store,
                    }),
                    stencil_ops: Some(wgpu::Operations {
                        load: wgpu::LoadOp::Clear(0),
                        store: wgpu::StoreOp::Store,
                    }),
                }),
                ..Default::default()
            });
            renderer.draw(&mut pass, &plan);
        }
        queue.submit([encoder.finish()]);
        let error = pollster::block_on(device.pop_error_scope());
        assert!(error.is_none(), "UI stencil validation error: {error:?}");
    }

    #[test]
    fn rgba8_upload_validation_rejects_invalid_dimensions_and_lengths() {
        assert_eq!(
            validate_texture_rgba8(0, 1, &[]),
            Err(UiTextureError::EmptyDimensions)
        );
        assert_eq!(
            validate_texture_rgba8(2, 2, &[255; 12]),
            Err(UiTextureError::InvalidDataLength {
                expected: 16,
                actual: 12,
            })
        );
        assert!(validate_texture_rgba8(2, 2, &[255; 16]).is_ok());
    }

    #[test]
    fn solid_primitives_cover_the_full_texture_by_default() {
        assert_eq!(
            UiPrimitive::solid([0.0; 4], [1.0; 4]).uv,
            [0.0, 0.0, 1.0, 1.0]
        );
    }
}
