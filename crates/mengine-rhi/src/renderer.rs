use crate::mesh::{MeshGpu, Vertex};
use crate::render_graph::RenderGraph;
use crate::RhiError;
use glam::{Mat4, Vec3, Vec4};
use std::collections::HashMap;
use std::sync::Arc;
use winit::dpi::PhysicalSize;

#[derive(Clone, Copy, Debug)]
pub struct ClearColor {
    pub r: f64,
    pub g: f64,
    pub b: f64,
    pub a: f64,
}

impl From<Vec4> for ClearColor {
    fn from(v: Vec4) -> Self {
        Self {
            r: v.x as f64,
            g: v.y as f64,
            b: v.z as f64,
            a: v.w as f64,
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct FrameCamera {
    pub view: Mat4,
    pub proj: Mat4,
}

#[derive(Clone, Copy, Debug)]
pub struct RenderObject {
    pub mesh_key:   &'static str,
    pub model:      Mat4,
    pub color:      [f32; 4],
}

#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct Uniforms {
    view_proj: [[f32; 4]; 4],
    model:     [[f32; 4]; 4],
    color:     [f32; 4],
}

pub struct Renderer {
    pub device:       wgpu::Device,
    pub queue:        wgpu::Queue,
    surface:          wgpu::Surface<'static>,
    config:           wgpu::SurfaceConfiguration,
    pipeline:         wgpu::RenderPipeline,
    depth_view:       wgpu::TextureView,
    depth_texture:    wgpu::Texture,
    meshes:           HashMap<String, MeshGpu>,
    uniform_buf:      wgpu::Buffer,
    bind_group:       wgpu::BindGroup,
    pub clear:        ClearColor,
    pub graph:        RenderGraph,
    size:             PhysicalSize<u32>,
}

impl Renderer {
    pub async fn new(
        window: Arc<winit::window::Window>,
    ) -> Result<Self, RhiError> {
        let size = window.inner_size();
        let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor {
            backends: wgpu::Backends::PRIMARY,
            ..Default::default()
        });
        let surface = instance
            .create_surface(window.clone())
            .map_err(|e| RhiError::RequestDevice(e.to_string()))?;

        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference:       wgpu::PowerPreference::HighPerformance,
                compatible_surface:     Some(&surface),
                force_fallback_adapter: false,
            })
            .await
            .ok_or(RhiError::NoAdapter)?;

        let (device, queue) = adapter
            .request_device(
                &wgpu::DeviceDescriptor {
                    label:             Some("mengine"),
                    required_features: wgpu::Features::empty(),
                    required_limits:   wgpu::Limits::default(),
                    memory_hints:      Default::default(),
                },
                None,
            )
            .await
            .map_err(|e| RhiError::RequestDevice(e.to_string()))?;

        let caps = surface.get_capabilities(&adapter);
        let format = caps
            .formats
            .iter()
            .copied()
            .find(|f| f.is_srgb())
            .unwrap_or(caps.formats[0]);

        let config = wgpu::SurfaceConfiguration {
            usage:                         wgpu::TextureUsages::RENDER_ATTACHMENT,
            format,
            width:                         size.width.max(1),
            height:                        size.height.max(1),
            present_mode:                  wgpu::PresentMode::Fifo,
            alpha_mode:                    caps.alpha_modes[0],
            view_formats:                  vec![],
            desired_maximum_frame_latency: 2,
        };
        surface.configure(&device, &config);

        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label:  Some("pbr_simple"),
            source: wgpu::ShaderSource::Wgsl(SIMPLE_WGSL.into()),
        });

        let bind_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label:   Some("frame_bgl"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding:    0,
                visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
                ty:         wgpu::BindingType::Buffer {
                    ty:                 wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size:   None,
                },
                count:      None,
            }],
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label:                Some("pipe_layout"),
            bind_group_layouts:   &[&bind_layout],
            push_constant_ranges: &[],
        });

        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label:  Some("forward"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module:      &shader,
                entry_point: Some("vs_main"),
                buffers:     &[wgpu::VertexBufferLayout {
                    array_stride: std::mem::size_of::<Vertex>() as wgpu::BufferAddress,
                    step_mode:    wgpu::VertexStepMode::Vertex,
                    attributes:   &wgpu::vertex_attr_array![0 => Float32x3, 1 => Float32x3, 2 => Float32x2],
                }],
                compilation_options: Default::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module:      &shader,
                entry_point: Some("fs_main"),
                targets:     &[Some(wgpu::ColorTargetState {
                    format,
                    blend:              Some(wgpu::BlendState::REPLACE),
                    write_mask:         wgpu::ColorWrites::ALL,
                })],
                compilation_options: Default::default(),
            }),
            primitive: wgpu::PrimitiveState {
                topology:           wgpu::PrimitiveTopology::TriangleList,
                strip_index_format: None,
                front_face:         wgpu::FrontFace::Ccw,
                cull_mode:          Some(wgpu::Face::Back),
                ..Default::default()
            },
            depth_stencil: Some(wgpu::DepthStencilState {
                format:             wgpu::TextureFormat::Depth32Float,
                depth_write_enabled: true,
                depth_compare:      wgpu::CompareFunction::Less,
                stencil:            Default::default(),
                bias:               Default::default(),
            }),
            multisample: wgpu::MultisampleState::default(),
            multiview:   None,
            cache:       None,
        });

        let uniform_buf = device.create_buffer(&wgpu::BufferDescriptor {
            label:              Some("uniforms"),
            size:               std::mem::size_of::<Uniforms>() as u64,
            usage:              wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label:   Some("frame_bg"),
            layout:  &bind_layout,
            entries: &[wgpu::BindGroupEntry {
                binding:  0,
                resource: uniform_buf.as_entire_binding(),
            }],
        });

        let (depth_texture, depth_view) = create_depth(&device, config.width, config.height);

        let mut meshes = HashMap::new();
        meshes.insert("cube".into(), MeshGpu::unit_cube(&device));

        Ok(Self {
            device,
            queue,
            surface,
            config,
            pipeline,
            depth_view,
            depth_texture,
            meshes,
            uniform_buf,
            bind_group,
            clear: ClearColor {
                r: 0.1,
                g: 0.1,
                b: 0.14,
                a: 1.0,
            },
            graph: RenderGraph::default_forward(),
            size,
        })
    }

    pub fn resize(&mut self, new_size: PhysicalSize<u32>) {
        if new_size.width == 0 || new_size.height == 0 {
            return;
        }
        self.size = new_size;
        self.config.width = new_size.width;
        self.config.height = new_size.height;
        self.surface.configure(&self.device, &self.config);
        let (tex, view) = create_depth(&self.device, new_size.width, new_size.height);
        self.depth_texture = tex;
        self.depth_view = view;
    }

    pub fn render(
        &mut self,
        camera: FrameCamera,
        objects: &[RenderObject],
    ) -> Result<(), RhiError> {
        let frame = self.surface.get_current_texture()?;
        let view = frame
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());

        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("frame"),
            });

        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label:                    Some("forward_opaque"),
                color_attachments:        &[Some(wgpu::RenderPassColorAttachment {
                    view:           &view,
                    resolve_target: None,
                    ops:            wgpu::Operations {
                        load:  wgpu::LoadOp::Clear(wgpu::Color {
                            r: self.clear.r,
                            g: self.clear.g,
                            b: self.clear.b,
                            a: self.clear.a,
                        }),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view:        &self.depth_view,
                    depth_ops:   Some(wgpu::Operations {
                        load:  wgpu::LoadOp::Clear(1.0),
                        store: wgpu::StoreOp::Store,
                    }),
                    stencil_ops: None,
                }),
                ..Default::default()
            });

            pass.set_pipeline(&self.pipeline);
            pass.set_bind_group(0, &self.bind_group, &[]);

            let view_proj = camera.proj * camera.view;
            for obj in objects {
                let Some(mesh) = self.meshes.get(obj.mesh_key) else {
                    continue;
                };
                let u = Uniforms {
                    view_proj: view_proj.to_cols_array_2d(),
                    model:     obj.model.to_cols_array_2d(),
                    color:     obj.color,
                };
                self.queue
                    .write_buffer(&self.uniform_buf, 0, bytemuck::bytes_of(&u));
                pass.set_vertex_buffer(0, mesh.vertex_buffer.slice(..));
                pass.set_index_buffer(mesh.index_buffer.slice(..), wgpu::IndexFormat::Uint32);
                pass.draw_indexed(0..mesh.index_count, 0, 0..1);
            }
        }

        self.queue.submit(std::iter::once(encoder.finish()));
        frame.present();
        Ok(())
    }

    pub fn aspect(&self) -> f32 {
        self.config.width as f32 / self.config.height.max(1) as f32
    }

    pub fn register_mesh(&mut self, key: &str, mesh: MeshGpu) {
        self.meshes.insert(key.to_string(), mesh);
    }

    pub fn upload_gltf_static(
        &mut self,
        key: &str,
        vertices: &[Vertex],
        indices: &[u32],
    ) {
        let mesh = MeshGpu::upload(&self.device, vertices, indices);
        self.meshes.insert(key.to_string(), mesh);
    }
}

fn create_depth(device: &wgpu::Device, width: u32, height: u32) -> (wgpu::Texture, wgpu::TextureView) {
    let tex = device.create_texture(&wgpu::TextureDescriptor {
        label:           Some("depth"),
        size:            wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count:    1,
        dimension:       wgpu::TextureDimension::D2,
        format:          wgpu::TextureFormat::Depth32Float,
        usage:           wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
        view_formats:    &[],
    });
    let view = tex.create_view(&wgpu::TextureViewDescriptor::default());
    (tex, view)
}

pub fn look_at(eye: Vec3, target: Vec3, up: Vec3) -> Mat4 {
    Mat4::look_at_rh(eye, target, up)
}

pub fn perspective(fov_y_deg: f32, aspect: f32, near: f32, far: f32) -> Mat4 {
    Mat4::perspective_rh(fov_y_deg.to_radians(), aspect, near, far)
}

const SIMPLE_WGSL: &str = r#"
struct Uniforms {
    view_proj: mat4x4<f32>,
    model: mat4x4<f32>,
    color: vec4<f32>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

struct VsIn {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
};
struct VsOut {
    @builtin(position) clip: vec4<f32>,
    @location(0) world_n: vec3<f32>,
    @location(1) color: vec4<f32>,
};

@vertex
fn vs_main(v: VsIn) -> VsOut {
    var o: VsOut;
    let world = u.model * vec4<f32>(v.position, 1.0);
    o.clip = u.view_proj * world;
    o.world_n = normalize((u.model * vec4<f32>(v.normal, 0.0)).xyz);
    o.color = u.color;
    return o;
}

@fragment
fn fs_main(i: VsOut) -> @location(0) vec4<f32> {
    let light = normalize(vec3<f32>(0.4, 1.0, 0.3));
    let ndl = max(dot(normalize(i.world_n), light), 0.15);
    return vec4<f32>(i.color.rgb * ndl, i.color.a);
}
"#;
