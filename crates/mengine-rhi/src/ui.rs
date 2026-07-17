use bytemuck::{Pod, Zeroable};
use std::hash::Hash;
use wgpu::util::DeviceExt;

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
    pub key: UiBatchKey,
}

impl UiPrimitive {
    pub fn solid(rect: [f32; 4], color: [f32; 4]) -> Self {
        Self {
            rect,
            color,
            pivot: [0.5, 0.5],
            rotation_radians: 0.0,
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
}

impl From<&UiPrimitive> for UiInstance {
    fn from(value: &UiPrimitive) -> Self {
        Self {
            rect: value.rect,
            color: value.color,
            transform: [value.rotation_radians, value.pivot[0], value.pivot[1], 0.0],
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
    viewport: [u32; 2],
    stats: UiFrameStats,
}

impl UiRenderer {
    pub fn new(
        device: &wgpu::Device,
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
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("ui_instanced"),
            source: wgpu::ShaderSource::Wgsl(UI_WGSL.into()),
        });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("ui_pipeline_layout"),
            bind_group_layouts: &[&bind_group_layout],
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
                        attributes: &wgpu::vertex_attr_array![1 => Float32x4, 2 => Float32x4, 3 => Float32x4],
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
                        attributes: &wgpu::vertex_attr_array![1 => Float32x4, 2 => Float32x4, 3 => Float32x4],
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
            viewport: [width.max(1), height.max(1)],
            stats: UiFrameStats::default(),
        }
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

struct VsIn {
    @location(0) position: vec2<f32>,
    @location(1) rect: vec4<f32>,
    @location(2) color: vec4<f32>,
    @location(3) transform: vec4<f32>,
};

struct VsOut {
    @builtin(position) clip: vec4<f32>,
    @location(0) color: vec4<f32>,
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
    return output;
}

@fragment
fn fs_main(input: VsOut) -> @location(0) vec4<f32> {
    return input.color;
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
}
