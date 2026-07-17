use bytemuck::{Pod, Zeroable};
use std::collections::HashMap;
use std::hash::Hash;
use thiserror::Error;
use wgpu::util::DeviceExt;

#[derive(Clone, Debug, Error, PartialEq, Eq)]
pub enum UiTextureError {
    #[error("texture dimensions must be greater than zero")]
    EmptyDimensions,
    #[error("RGBA8 texture data length mismatch: expected {expected}, got {actual}")]
    InvalidDataLength { expected: usize, actual: usize },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum UiBlendMode {
    Alpha,
    Additive,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct UiClipRect {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct UiBatchKey {
    pub material: String,
    pub texture: String,
    pub clip: Option<UiClipRect>,
    pub blend: UiBlendMode,
}

impl Default for UiBatchKey {
    fn default() -> Self {
        Self {
            material: "ui/default".into(),
            texture: "white".into(),
            clip: None,
            blend: UiBlendMode::Alpha,
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
    /// Normalized UV rect: u, v, width, height.
    pub uv: [f32; 4],
    pub key: UiBatchKey,
}

impl UiPrimitive {
    pub fn solid(rect: [f32; 4], color: [f32; 4]) -> Self {
        Self {
            rect,
            color,
            pivot: [0.5, 0.5],
            rotation_radians: 0.0,
            uv: [0.0, 0.0, 1.0, 1.0],
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
}

impl From<&UiPrimitive> for UiInstance {
    fn from(value: &UiPrimitive) -> Self {
        Self {
            rect: value.rect,
            color: value.color,
            transform: [value.rotation_radians, value.pivot[0], value.pivot[1], 0.0],
            uv: value.uv,
        }
    }
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct UiUniform {
    viewport: [f32; 2],
    _padding: [f32; 2],
}

pub(crate) struct UiRenderer {
    alpha_pipeline: wgpu::RenderPipeline,
    additive_pipeline: wgpu::RenderPipeline,
    vertex_buffer: wgpu::Buffer,
    instance_buffer: wgpu::Buffer,
    instance_capacity: usize,
    uniform_buffer: wgpu::Buffer,
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
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        });
        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("ui_frame_bg"),
            layout: &bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: uniform_buffer.as_entire_binding(),
            }],
        });
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
        let alpha_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("ui_instanced_pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
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
                        attributes: &wgpu::vertex_attr_array![1 => Float32x4, 2 => Float32x4, 3 => Float32x4, 4 => Float32x4],
                    },
                ],
                compilation_options: Default::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState {
                    format,
                    blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: Default::default(),
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                cull_mode: None,
                ..Default::default()
            },
            depth_stencil: Some(wgpu::DepthStencilState {
                format: wgpu::TextureFormat::Depth32Float,
                depth_write_enabled: false,
                depth_compare: wgpu::CompareFunction::Always,
                stencil: Default::default(),
                bias: Default::default(),
            }),
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        });

        let additive_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("ui_instanced_additive_pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
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
                        attributes: &wgpu::vertex_attr_array![1 => Float32x4, 2 => Float32x4, 3 => Float32x4, 4 => Float32x4],
                    },
                ],
                compilation_options: Default::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState {
                    format,
                    blend: Some(wgpu::BlendState {
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
                    }),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: Default::default(),
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                cull_mode: None,
                ..Default::default()
            },
            depth_stencil: Some(wgpu::DepthStencilState {
                format: wgpu::TextureFormat::Depth32Float,
                depth_write_enabled: false,
                depth_compare: wgpu::CompareFunction::Always,
                stencil: Default::default(),
                bias: Default::default(),
            }),
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        });

        Self {
            alpha_pipeline,
            additive_pipeline,
            vertex_buffer,
            instance_buffer,
            instance_capacity,
            uniform_buffer,
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
        }
        if !plan.primitives.is_empty() {
            let instances: Vec<UiInstance> = plan.primitives.iter().map(UiInstance::from).collect();
            queue.write_buffer(&self.instance_buffer, 0, bytemuck::cast_slice(&instances));
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
            pass.set_pipeline(match batch.key.blend {
                UiBlendMode::Alpha => &self.alpha_pipeline,
                UiBlendMode::Additive => &self.additive_pipeline,
            });
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

const UI_WGSL: &str = r#"
struct UiFrame {
    viewport: vec2<f32>,
    padding: vec2<f32>,
};
@group(0) @binding(0) var<uniform> frame: UiFrame;
@group(1) @binding(0) var ui_texture: texture_2d<f32>;
@group(1) @binding(1) var ui_sampler: sampler;

struct VsIn {
    @location(0) position: vec2<f32>,
    @location(1) rect: vec4<f32>,
    @location(2) color: vec4<f32>,
    @location(3) transform: vec4<f32>,
    @location(4) uv_rect: vec4<f32>,
};

struct VsOut {
    @builtin(position) clip: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) uv: vec2<f32>,
};

@vertex
fn vs_main(input: VsIn) -> VsOut {
    let pivot = input.transform.yz;
    let local = (input.position - pivot) * input.rect.zw;
    let c = cos(input.transform.x);
    let s = sin(input.transform.x);
    let rotated = vec2<f32>(local.x * c - local.y * s, local.x * s + local.y * c);
    let pixel = input.rect.xy + pivot * input.rect.zw + rotated;
    let ndc = vec2<f32>(pixel.x / frame.viewport.x * 2.0 - 1.0, 1.0 - pixel.y / frame.viewport.y * 2.0);
    var output: VsOut;
    output.clip = vec4<f32>(ndc, 0.0, 1.0);
    output.color = input.color;
    output.uv = input.uv_rect.xy + input.position * input.uv_rect.zw;
    return output;
}

@fragment
fn fs_main(input: VsOut) -> @location(0) vec4<f32> {
    return textureSample(ui_texture, ui_sampler, input.uv) * input.color;
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
