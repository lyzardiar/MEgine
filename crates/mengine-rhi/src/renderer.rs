use crate::mesh::{MeshGpu, Vertex};
use crate::render_graph::RenderGraph;
use crate::ui::{UiBatchPlan, UiFrameStats, UiRenderer, UiTextureError};
use crate::RhiError;
use glam::{Mat4, Vec3, Vec4};
use std::collections::{hash_map::DefaultHasher, HashMap, HashSet};
use std::hash::{Hash, Hasher};
use std::num::NonZeroU64;
use std::sync::Arc;
use winit::dpi::PhysicalSize;

const MAX_POINT_LIGHTS: usize = 4;
const MAX_SPOT_LIGHTS: usize = 4;

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
    pub position: Vec3,
}

pub fn project_world_to_viewport(
    position: Vec3,
    camera: FrameCamera,
    viewport: [u32; 2],
) -> Option<[f32; 3]> {
    let clip = camera.proj * camera.view * position.extend(1.0);
    if clip.w <= 0.0001 {
        return None;
    }
    let ndc = clip.truncate() / clip.w;
    if ndc.z < -1.0 || ndc.z > 1.0 {
        return None;
    }
    Some([
        (ndc.x * 0.5 + 0.5) * viewport[0].max(1) as f32,
        (0.5 - ndc.y * 0.5) * viewport[1].max(1) as f32,
        ndc.z,
    ])
}

#[derive(Clone, Debug)]
pub struct RenderMaterial {
    pub base_color: [f32; 4],
    pub metallic: f32,
    pub roughness: f32,
    pub emissive: [f32; 3],
    pub emissive_strength: f32,
    pub unlit: bool,
    pub double_sided: bool,
    pub transparent: bool,
    pub blend_mode: MaterialBlendMode,
    pub depth_write: bool,
    pub render_queue: i32,
    pub alpha_cutoff: f32,
    pub base_color_texture: String,
    pub normal_texture: String,
    pub normal_scale: f32,
    pub metallic_roughness_texture: String,
    pub occlusion_texture: String,
    pub occlusion_strength: f32,
    pub emissive_texture: String,
    pub uv_scale: [f32; 2],
    pub uv_offset: [f32; 2],
    pub uv_rotation_degrees: f32,
    pub wrap_u: MaterialWrap,
    pub wrap_v: MaterialWrap,
    pub filter: MaterialFilter,
    /// Optional project-authored WGSL surface hook. The engine wraps and validates this hook
    /// against its stable forward-material interface before creating a pipeline.
    pub surface_shader: String,
}

#[derive(Clone, Copy, Debug, Default, Eq, Hash, PartialEq)]
pub enum MaterialWrap {
    #[default]
    Repeat,
    Clamp,
    Mirror,
}

#[derive(Clone, Copy, Debug, Default, Eq, Hash, PartialEq)]
pub enum MaterialFilter {
    Nearest,
    #[default]
    Linear,
}

#[derive(Clone, Copy, Debug, Default, Eq, Hash, PartialEq)]
pub enum MaterialBlendMode {
    #[default]
    Alpha,
    Premultiplied,
    Additive,
    Multiply,
}

impl Default for RenderMaterial {
    fn default() -> Self {
        Self {
            base_color: [0.8, 0.8, 0.8, 1.0],
            metallic: 0.0,
            roughness: 0.5,
            emissive: [0.0; 3],
            emissive_strength: 1.0,
            unlit: false,
            double_sided: false,
            transparent: false,
            blend_mode: MaterialBlendMode::Alpha,
            depth_write: true,
            render_queue: 2000,
            alpha_cutoff: 0.0,
            base_color_texture: String::new(),
            normal_texture: String::new(),
            normal_scale: 1.0,
            metallic_roughness_texture: String::new(),
            occlusion_texture: String::new(),
            occlusion_strength: 1.0,
            emissive_texture: String::new(),
            uv_scale: [1.0, 1.0],
            uv_offset: [0.0, 0.0],
            uv_rotation_degrees: 0.0,
            wrap_u: MaterialWrap::Repeat,
            wrap_v: MaterialWrap::Repeat,
            filter: MaterialFilter::Linear,
            surface_shader: String::new(),
        }
    }
}

#[derive(Clone, Debug)]
pub struct RenderObject {
    pub mesh_key: String,
    pub model: Mat4,
    pub material: RenderMaterial,
}

#[derive(Clone, Copy, Debug)]
pub struct DirectionalLightData {
    /// Direction in which light rays travel.
    pub direction: Vec3,
    pub color: [f32; 3],
    pub intensity: f32,
}

#[derive(Clone, Copy, Debug)]
pub struct PointLightData {
    pub position: Vec3,
    pub color: [f32; 3],
    pub intensity: f32,
    pub range: f32,
}

#[derive(Clone, Copy, Debug)]
pub struct SpotLightData {
    pub position: Vec3,
    /// Direction in which the cone points.
    pub direction: Vec3,
    pub color: [f32; 3],
    pub intensity: f32,
    pub range: f32,
    pub inner_angle_degrees: f32,
    pub outer_angle_degrees: f32,
}

#[derive(Clone, Debug)]
pub struct FrameLighting {
    pub ambient: [f32; 3],
    pub directional: Option<DirectionalLightData>,
    pub points: Vec<PointLightData>,
    pub spots: Vec<SpotLightData>,
}

impl Default for FrameLighting {
    fn default() -> Self {
        Self {
            ambient: [0.08, 0.09, 0.12],
            directional: Some(DirectionalLightData {
                direction: Vec3::new(-0.4, -1.0, -0.3).normalize(),
                color: [1.0, 1.0, 0.95],
                intensity: 1.0,
            }),
            points: Vec::new(),
            spots: Vec::new(),
        }
    }
}

#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct GlobalUniforms {
    view_proj: [[f32; 4]; 4],
    camera_position: [f32; 4],
    ambient: [f32; 4],
    directional_direction: [f32; 4],
    directional_color: [f32; 4],
    point_positions: [[f32; 4]; MAX_POINT_LIGHTS],
    point_colors: [[f32; 4]; MAX_POINT_LIGHTS],
    spot_positions: [[f32; 4]; MAX_SPOT_LIGHTS],
    spot_directions: [[f32; 4]; MAX_SPOT_LIGHTS],
    spot_colors: [[f32; 4]; MAX_SPOT_LIGHTS],
    spot_params: [[f32; 4]; MAX_SPOT_LIGHTS],
    light_counts: [u32; 4],
}

#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct ObjectUniforms {
    model: [[f32; 4]; 4],
    normal_matrix: [[f32; 4]; 4],
    base_color: [f32; 4],
    material: [f32; 4],
    emissive: [f32; 4],
    texture_transform: [f32; 4],
    map_params: [f32; 4],
}

struct MaterialTextureGpu {
    _texture: wgpu::Texture,
    view: wgpu::TextureView,
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
struct MaterialTextureSetKey {
    base_color: String,
    normal: String,
    metallic_roughness: String,
    occlusion: String,
    emissive: String,
    sampler: MaterialSamplerKey,
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
struct MaterialSamplerKey {
    wrap_u: MaterialWrap,
    wrap_v: MaterialWrap,
    filter: MaterialFilter,
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
enum MaterialPipelineBlend {
    Replace,
    Alpha,
    Premultiplied,
    Additive,
    Multiply,
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
struct MaterialPipelineKey {
    blend: MaterialPipelineBlend,
    double_sided: bool,
    depth_write: bool,
    shader_fingerprint: u64,
}

impl From<&RenderMaterial> for MaterialPipelineKey {
    fn from(material: &RenderMaterial) -> Self {
        Self {
            blend: if !material.transparent {
                MaterialPipelineBlend::Replace
            } else {
                match material.blend_mode {
                    MaterialBlendMode::Alpha => MaterialPipelineBlend::Alpha,
                    MaterialBlendMode::Premultiplied => MaterialPipelineBlend::Premultiplied,
                    MaterialBlendMode::Additive => MaterialPipelineBlend::Additive,
                    MaterialBlendMode::Multiply => MaterialPipelineBlend::Multiply,
                }
            },
            double_sided: material.double_sided,
            depth_write: !material.transparent || material.depth_write,
            shader_fingerprint: surface_shader_fingerprint(&material.surface_shader),
        }
    }
}

impl From<&RenderMaterial> for MaterialTextureSetKey {
    fn from(material: &RenderMaterial) -> Self {
        let metallic_roughness = material.metallic_roughness_texture.trim().to_owned();
        Self {
            base_color: material.base_color_texture.trim().to_owned(),
            normal: material.normal_texture.trim().to_owned(),
            occlusion: if material.occlusion_texture.trim().is_empty() {
                metallic_roughness.clone()
            } else {
                material.occlusion_texture.trim().to_owned()
            },
            metallic_roughness,
            emissive: material.emissive_texture.trim().to_owned(),
            sampler: MaterialSamplerKey {
                wrap_u: material.wrap_u,
                wrap_v: material.wrap_v,
                filter: material.filter,
            },
        }
    }
}

pub struct Renderer {
    pub device: wgpu::Device,
    pub queue: wgpu::Queue,
    surface: wgpu::Surface<'static>,
    config: wgpu::SurfaceConfiguration,
    material_pipelines: HashMap<MaterialPipelineKey, wgpu::RenderPipeline>,
    invalid_surface_shaders: HashSet<u64>,
    depth_view: wgpu::TextureView,
    depth_texture: wgpu::Texture,
    meshes: HashMap<String, MeshGpu>,
    bind_layout: wgpu::BindGroupLayout,
    pipeline_layout: wgpu::PipelineLayout,
    global_buf: wgpu::Buffer,
    object_buf: wgpu::Buffer,
    bind_group: wgpu::BindGroup,
    material_texture_layout: wgpu::BindGroupLayout,
    material_samplers: HashMap<MaterialSamplerKey, wgpu::Sampler>,
    fallback_base_color_texture: MaterialTextureGpu,
    fallback_normal_texture: MaterialTextureGpu,
    fallback_metallic_roughness_texture: MaterialTextureGpu,
    fallback_occlusion_texture: MaterialTextureGpu,
    fallback_emissive_texture: MaterialTextureGpu,
    material_color_textures: HashMap<String, MaterialTextureGpu>,
    material_data_textures: HashMap<String, MaterialTextureGpu>,
    material_texture_sets: HashMap<MaterialTextureSetKey, wgpu::BindGroup>,
    object_stride: u64,
    object_capacity: usize,
    ui: UiRenderer,
    pub clear: ClearColor,
    pub graph: RenderGraph,
    size: PhysicalSize<u32>,
}

impl Renderer {
    pub async fn new(window: Arc<winit::window::Window>) -> Result<Self, RhiError> {
        let size = window.inner_size();
        let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor {
            // Keep cross-platform defaults, but allow diagnostics and deployments to pin a
            // backend with WGPU_BACKEND (for example `dx12` on Windows build agents).
            backends: wgpu::Backends::PRIMARY.with_env(),
            ..Default::default()
        });
        let surface = instance
            .create_surface(window.clone())
            .map_err(|e| RhiError::RequestDevice(e.to_string()))?;

        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: Some(&surface),
                force_fallback_adapter: false,
            })
            .await
            .ok_or(RhiError::NoAdapter)?;

        let (device, queue) = adapter
            .request_device(
                &wgpu::DeviceDescriptor {
                    label: Some("mengine"),
                    required_features: wgpu::Features::empty(),
                    required_limits: wgpu::Limits::default(),
                    memory_hints: Default::default(),
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
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format,
            width: size.width.max(1),
            height: size.height.max(1),
            present_mode: wgpu::PresentMode::Fifo,
            alpha_mode: caps.alpha_modes[0],
            view_formats: vec![],
            desired_maximum_frame_latency: 2,
        };
        surface.configure(&device, &config);

        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("forward_material"),
            source: wgpu::ShaderSource::Wgsl(FORWARD_WGSL.into()),
        });

        let bind_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("forward_bgl"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: NonZeroU64::new(
                            std::mem::size_of::<GlobalUniforms>() as u64
                        ),
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: true,
                        min_binding_size: NonZeroU64::new(
                            std::mem::size_of::<ObjectUniforms>() as u64
                        ),
                    },
                    count: None,
                },
            ],
        });
        let material_texture_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("material_texture_bgl"),
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
                        ty: wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Float { filterable: true },
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 2,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Float { filterable: true },
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 3,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Float { filterable: true },
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 4,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Float { filterable: true },
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 5,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                        count: None,
                    },
                ],
            });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("forward_pipeline_layout"),
            bind_group_layouts: &[&bind_layout, &material_texture_layout],
            push_constant_ranges: &[],
        });
        let mut material_pipelines = HashMap::new();
        for double_sided in [false, true] {
            let opaque = MaterialPipelineKey {
                blend: MaterialPipelineBlend::Replace,
                double_sided,
                depth_write: true,
                shader_fingerprint: 0,
            };
            material_pipelines.insert(
                opaque,
                create_pipeline(&device, format, &shader, &pipeline_layout, opaque),
            );
            for blend in [
                MaterialPipelineBlend::Alpha,
                MaterialPipelineBlend::Premultiplied,
                MaterialPipelineBlend::Additive,
                MaterialPipelineBlend::Multiply,
            ] {
                for depth_write in [false, true] {
                    let key = MaterialPipelineKey {
                        blend,
                        double_sided,
                        depth_write,
                        shader_fingerprint: 0,
                    };
                    material_pipelines.insert(
                        key,
                        create_pipeline(&device, format, &shader, &pipeline_layout, key),
                    );
                }
            }
        }

        let global_buf = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("frame_uniforms"),
            size: std::mem::size_of::<GlobalUniforms>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let object_stride = align_to(
            std::mem::size_of::<ObjectUniforms>() as u64,
            device.limits().min_uniform_buffer_offset_alignment as u64,
        );
        let object_capacity = 64;
        let object_buf = create_object_buffer(&device, object_stride, object_capacity);
        let bind_group = create_bind_group(&device, &bind_layout, &global_buf, &object_buf);
        let fallback_base_color_texture = create_material_texture_rgba8(
            &device,
            &queue,
            "material_white_texture",
            1,
            1,
            &[255, 255, 255, 255],
            true,
        );
        let fallback_normal_texture = create_material_texture_rgba8(
            &device,
            &queue,
            "material_flat_normal_texture",
            1,
            1,
            &[128, 128, 255, 255],
            false,
        );
        let fallback_metallic_roughness_texture = create_material_texture_rgba8(
            &device,
            &queue,
            "material_white_orm_texture",
            1,
            1,
            &[255, 255, 255, 255],
            false,
        );
        let fallback_occlusion_texture = create_material_texture_rgba8(
            &device,
            &queue,
            "material_white_occlusion_texture",
            1,
            1,
            &[255, 255, 255, 255],
            false,
        );
        let fallback_emissive_texture = create_material_texture_rgba8(
            &device,
            &queue,
            "material_white_emissive_texture",
            1,
            1,
            &[255, 255, 255, 255],
            true,
        );

        let (depth_texture, depth_view) = create_depth(&device, config.width, config.height);
        let mut meshes = HashMap::new();
        meshes.insert("cube".into(), MeshGpu::unit_cube(&device));
        let ui = UiRenderer::new(&device, &queue, format, config.width, config.height);

        Ok(Self {
            device,
            queue,
            surface,
            config,
            material_pipelines,
            invalid_surface_shaders: HashSet::new(),
            depth_view,
            depth_texture,
            meshes,
            bind_layout,
            pipeline_layout,
            global_buf,
            object_buf,
            bind_group,
            material_texture_layout,
            material_samplers: HashMap::new(),
            fallback_base_color_texture,
            fallback_normal_texture,
            fallback_metallic_roughness_texture,
            fallback_occlusion_texture,
            fallback_emissive_texture,
            material_color_textures: HashMap::new(),
            material_data_textures: HashMap::new(),
            material_texture_sets: HashMap::new(),
            object_stride,
            object_capacity,
            ui,
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
        self.ui.resize(&self.queue, new_size.width, new_size.height);
    }

    pub fn render(
        &mut self,
        camera: FrameCamera,
        objects: &[RenderObject],
    ) -> Result<(), RhiError> {
        self.render_lit_frame(camera, objects, &FrameLighting::default(), None)
    }

    pub fn render_frame(
        &mut self,
        camera: FrameCamera,
        objects: &[RenderObject],
        ui: Option<&UiBatchPlan>,
    ) -> Result<(), RhiError> {
        self.render_lit_frame(camera, objects, &FrameLighting::default(), ui)
    }

    pub fn render_lit_frame(
        &mut self,
        camera: FrameCamera,
        objects: &[RenderObject],
        lighting: &FrameLighting,
        ui: Option<&UiBatchPlan>,
    ) -> Result<(), RhiError> {
        self.ensure_object_capacity(objects.len().max(1));
        let global = make_global_uniforms(camera, lighting);
        self.queue
            .write_buffer(&self.global_buf, 0, bytemuck::bytes_of(&global));
        if !objects.is_empty() {
            let mut packed = vec![0_u8; self.object_stride as usize * objects.len()];
            for (index, object) in objects.iter().enumerate() {
                let uniform = make_object_uniforms(object);
                let bytes = bytemuck::bytes_of(&uniform);
                let start = index * self.object_stride as usize;
                packed[start..start + bytes.len()].copy_from_slice(bytes);
            }
            self.queue.write_buffer(&self.object_buf, 0, &packed);
        }

        let empty_ui = UiBatchPlan::default();
        let ui_plan = ui.unwrap_or(&empty_ui);
        self.ui.prepare(&self.device, &self.queue, ui_plan);
        let draw_order = sorted_render_indices(objects, camera.position);
        for object in objects {
            self.ensure_material_pipeline(&object.material);
            self.ensure_material_texture_set(&object.material);
        }
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
                label: Some("forward_opaque"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color {
                            r: self.clear.r,
                            g: self.clear.g,
                            b: self.clear.b,
                            a: self.clear.a,
                        }),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: &self.depth_view,
                    depth_ops: Some(wgpu::Operations {
                        load: wgpu::LoadOp::Clear(1.0),
                        store: wgpu::StoreOp::Store,
                    }),
                    stencil_ops: None,
                }),
                ..Default::default()
            });

            for index in draw_order {
                let object = &objects[index];
                let Some(mesh) = self.meshes.get(&object.mesh_key) else {
                    continue;
                };
                let pipeline_key = MaterialPipelineKey::from(&object.material);
                let pipeline = self
                    .material_pipelines
                    .get(&pipeline_key)
                    .or_else(|| {
                        self.material_pipelines.get(&MaterialPipelineKey {
                            shader_fingerprint: 0,
                            ..pipeline_key
                        })
                    })
                    .expect("built-in material pipeline variants are created at startup");
                pass.set_pipeline(pipeline);
                pass.set_bind_group(
                    0,
                    &self.bind_group,
                    &[(index as u64 * self.object_stride) as u32],
                );
                let texture_key = MaterialTextureSetKey::from(&object.material);
                let texture_set = self
                    .material_texture_sets
                    .get(&texture_key)
                    .expect("material texture set prepared before render pass");
                pass.set_bind_group(1, texture_set, &[]);
                pass.set_vertex_buffer(0, mesh.vertex_buffer.slice(..));
                pass.set_index_buffer(mesh.index_buffer.slice(..), wgpu::IndexFormat::Uint32);
                pass.draw_indexed(0..mesh.index_count, 0, 0..1);
            }

            self.ui.draw(&mut pass, ui_plan);
        }

        self.queue.submit(std::iter::once(encoder.finish()));
        frame.present();
        Ok(())
    }

    fn ensure_object_capacity(&mut self, required: usize) {
        if required <= self.object_capacity {
            return;
        }
        self.object_capacity = required.next_power_of_two();
        self.object_buf =
            create_object_buffer(&self.device, self.object_stride, self.object_capacity);
        self.bind_group = create_bind_group(
            &self.device,
            &self.bind_layout,
            &self.global_buf,
            &self.object_buf,
        );
    }

    fn ensure_material_pipeline(&mut self, material: &RenderMaterial) {
        let key = MaterialPipelineKey::from(material);
        if key.shader_fingerprint == 0
            || self.material_pipelines.contains_key(&key)
            || self
                .invalid_surface_shaders
                .contains(&key.shader_fingerprint)
        {
            return;
        }
        let source = match compose_surface_shader(&material.surface_shader) {
            Ok(source) => source,
            Err(error) => {
                log::warn!("surface shader rejected: {error}");
                self.invalid_surface_shaders.insert(key.shader_fingerprint);
                return;
            }
        };
        let shader = self
            .device
            .create_shader_module(wgpu::ShaderModuleDescriptor {
                label: Some("custom_surface_material"),
                source: wgpu::ShaderSource::Wgsl(source.into()),
            });
        self.material_pipelines.insert(
            key,
            create_pipeline(
                &self.device,
                self.config.format,
                &shader,
                &self.pipeline_layout,
                key,
            ),
        );
    }

    fn ensure_material_texture_set(&mut self, material: &RenderMaterial) {
        let key = MaterialTextureSetKey::from(material);
        if self.material_texture_sets.contains_key(&key) {
            return;
        }
        if !self.material_samplers.contains_key(&key.sampler) {
            let sampler = create_material_sampler(&self.device, key.sampler);
            self.material_samplers.insert(key.sampler, sampler);
        }
        let base_color = self
            .material_color_textures
            .get(&key.base_color)
            .unwrap_or(&self.fallback_base_color_texture);
        let normal = self
            .material_data_textures
            .get(&key.normal)
            .unwrap_or(&self.fallback_normal_texture);
        let metallic_roughness = self
            .material_data_textures
            .get(&key.metallic_roughness)
            .unwrap_or(&self.fallback_metallic_roughness_texture);
        let occlusion = self
            .material_data_textures
            .get(&key.occlusion)
            .unwrap_or(&self.fallback_occlusion_texture);
        let emissive = self
            .material_color_textures
            .get(&key.emissive)
            .unwrap_or(&self.fallback_emissive_texture);
        let bind_group = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("material_texture_set_bg"),
            layout: &self.material_texture_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&base_color.view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(&normal.view),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::TextureView(&metallic_roughness.view),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: wgpu::BindingResource::TextureView(&emissive.view),
                },
                wgpu::BindGroupEntry {
                    binding: 4,
                    resource: wgpu::BindingResource::TextureView(&occlusion.view),
                },
                wgpu::BindGroupEntry {
                    binding: 5,
                    resource: wgpu::BindingResource::Sampler(
                        self.material_samplers
                            .get(&key.sampler)
                            .expect("material sampler inserted before bind group"),
                    ),
                },
            ],
        });
        self.material_texture_sets.insert(key, bind_group);
    }

    pub fn ui_stats(&self) -> UiFrameStats {
        self.ui.stats()
    }

    pub fn upload_ui_texture_rgba8(
        &mut self,
        key: &str,
        width: u32,
        height: u32,
        rgba8: &[u8],
    ) -> Result<(), UiTextureError> {
        self.ui
            .upload_texture_rgba8(&self.device, &self.queue, key, width, height, rgba8)
    }

    pub fn remove_ui_texture(&mut self, key: &str) -> bool {
        self.ui.remove_texture(key)
    }

    pub fn upload_material_texture_rgba8(
        &mut self,
        key: &str,
        width: u32,
        height: u32,
        rgba8: &[u8],
        srgb: bool,
    ) -> Result<(), UiTextureError> {
        validate_material_texture_rgba8(width, height, rgba8)?;
        let texture = create_material_texture_rgba8(
            &self.device,
            &self.queue,
            "material_texture",
            width,
            height,
            rgba8,
            srgb,
        );
        if srgb {
            self.material_color_textures.insert(key.to_owned(), texture);
        } else {
            self.material_data_textures.insert(key.to_owned(), texture);
        }
        self.material_texture_sets.clear();
        Ok(())
    }

    pub fn remove_material_texture(&mut self, key: &str) -> bool {
        let removed = self.material_color_textures.remove(key).is_some()
            | self.material_data_textures.remove(key).is_some();
        if removed {
            self.material_texture_sets.clear();
        }
        removed
    }

    pub fn aspect(&self) -> f32 {
        self.config.width as f32 / self.config.height.max(1) as f32
    }

    pub fn register_mesh(&mut self, key: &str, mesh: MeshGpu) {
        self.meshes.insert(key.to_string(), mesh);
    }

    pub fn upload_gltf_static(&mut self, key: &str, vertices: &[Vertex], indices: &[u32]) {
        let mesh = MeshGpu::upload(&self.device, vertices, indices);
        self.meshes.insert(key.to_string(), mesh);
    }
}

fn make_global_uniforms(camera: FrameCamera, lighting: &FrameLighting) -> GlobalUniforms {
    let mut point_positions = [[0.0; 4]; MAX_POINT_LIGHTS];
    let mut point_colors = [[0.0; 4]; MAX_POINT_LIGHTS];
    for (index, light) in lighting.points.iter().take(MAX_POINT_LIGHTS).enumerate() {
        point_positions[index] = [
            light.position.x,
            light.position.y,
            light.position.z,
            light.range.max(0.001),
        ];
        point_colors[index] = [
            light.color[0],
            light.color[1],
            light.color[2],
            light.intensity.max(0.0),
        ];
    }

    let mut spot_positions = [[0.0; 4]; MAX_SPOT_LIGHTS];
    let mut spot_directions = [[0.0; 4]; MAX_SPOT_LIGHTS];
    let mut spot_colors = [[0.0; 4]; MAX_SPOT_LIGHTS];
    let mut spot_params = [[0.0; 4]; MAX_SPOT_LIGHTS];
    for (index, light) in lighting.spots.iter().take(MAX_SPOT_LIGHTS).enumerate() {
        let direction = light.direction.normalize_or_zero();
        let inner = (light.inner_angle_degrees.clamp(0.0, 89.0) * 0.5)
            .to_radians()
            .cos();
        let outer = (light
            .outer_angle_degrees
            .clamp(light.inner_angle_degrees, 179.0)
            * 0.5)
            .to_radians()
            .cos();
        spot_positions[index] = [
            light.position.x,
            light.position.y,
            light.position.z,
            light.range.max(0.001),
        ];
        spot_directions[index] = [direction.x, direction.y, direction.z, 0.0];
        spot_colors[index] = [
            light.color[0],
            light.color[1],
            light.color[2],
            light.intensity.max(0.0),
        ];
        spot_params[index] = [inner, outer, 0.0, 0.0];
    }

    let (directional_direction, directional_color, directional_count) =
        if let Some(light) = lighting.directional {
            let direction = light.direction.normalize_or_zero();
            (
                [direction.x, direction.y, direction.z, 0.0],
                [
                    light.color[0],
                    light.color[1],
                    light.color[2],
                    light.intensity.max(0.0),
                ],
                1,
            )
        } else {
            ([0.0; 4], [0.0; 4], 0)
        };

    GlobalUniforms {
        view_proj: (camera.proj * camera.view).to_cols_array_2d(),
        camera_position: [camera.position.x, camera.position.y, camera.position.z, 1.0],
        ambient: [
            lighting.ambient[0],
            lighting.ambient[1],
            lighting.ambient[2],
            1.0,
        ],
        directional_direction,
        directional_color,
        point_positions,
        point_colors,
        spot_positions,
        spot_directions,
        spot_colors,
        spot_params,
        light_counts: [
            directional_count,
            lighting.points.len().min(MAX_POINT_LIGHTS) as u32,
            lighting.spots.len().min(MAX_SPOT_LIGHTS) as u32,
            0,
        ],
    }
}

fn sorted_render_indices(objects: &[RenderObject], camera_position: Vec3) -> Vec<usize> {
    let mut indices: Vec<usize> = (0..objects.len()).collect();
    indices.sort_by(|left, right| {
        let left_object = &objects[*left];
        let right_object = &objects[*right];
        left_object
            .material
            .render_queue
            .cmp(&right_object.material.render_queue)
            .then_with(|| {
                left_object
                    .material
                    .transparent
                    .cmp(&right_object.material.transparent)
            })
            .then_with(|| {
                if !left_object.material.transparent || !right_object.material.transparent {
                    return left.cmp(right);
                }
                let left_distance =
                    (left_object.model.w_axis.truncate() - camera_position).length_squared();
                let right_distance =
                    (right_object.model.w_axis.truncate() - camera_position).length_squared();
                right_distance.total_cmp(&left_distance)
            })
            .then_with(|| left.cmp(right))
    });
    indices
}

fn make_object_uniforms(object: &RenderObject) -> ObjectUniforms {
    let material = &object.material;
    ObjectUniforms {
        model: object.model.to_cols_array_2d(),
        normal_matrix: object.model.inverse().transpose().to_cols_array_2d(),
        base_color: material.base_color,
        material: [
            material.metallic.clamp(0.0, 1.0),
            material.roughness.clamp(0.04, 1.0),
            material.emissive_strength.max(0.0),
            if material.unlit { 1.0 } else { 0.0 },
        ],
        emissive: [
            material.emissive[0],
            material.emissive[1],
            material.emissive[2],
            material.alpha_cutoff.clamp(0.0, 1.0),
        ],
        texture_transform: [
            material.uv_scale[0],
            material.uv_scale[1],
            material.uv_offset[0],
            material.uv_offset[1],
        ],
        map_params: [
            material.normal_scale.max(0.0),
            material.occlusion_strength.clamp(0.0, 1.0),
            material.uv_rotation_degrees.to_radians(),
            if material.transparent {
                match material.blend_mode {
                    MaterialBlendMode::Alpha => 0.0,
                    MaterialBlendMode::Premultiplied => 1.0,
                    MaterialBlendMode::Additive => 2.0,
                    MaterialBlendMode::Multiply => 3.0,
                }
            } else {
                0.0
            },
        ],
    }
}

fn create_material_sampler(device: &wgpu::Device, key: MaterialSamplerKey) -> wgpu::Sampler {
    let filter = match key.filter {
        MaterialFilter::Nearest => wgpu::FilterMode::Nearest,
        MaterialFilter::Linear => wgpu::FilterMode::Linear,
    };
    device.create_sampler(&wgpu::SamplerDescriptor {
        label: Some("material_sampler"),
        address_mode_u: material_address_mode(key.wrap_u),
        address_mode_v: material_address_mode(key.wrap_v),
        address_mode_w: wgpu::AddressMode::Repeat,
        mag_filter: filter,
        min_filter: filter,
        // Keep the sampler compatible with the filtering bind-group layout. Material textures
        // currently have one mip level, so this does not soften nearest min/mag sampling.
        mipmap_filter: wgpu::FilterMode::Linear,
        ..Default::default()
    })
}

fn material_address_mode(wrap: MaterialWrap) -> wgpu::AddressMode {
    match wrap {
        MaterialWrap::Repeat => wgpu::AddressMode::Repeat,
        MaterialWrap::Clamp => wgpu::AddressMode::ClampToEdge,
        MaterialWrap::Mirror => wgpu::AddressMode::MirrorRepeat,
    }
}

fn surface_shader_fingerprint(source: &str) -> u64 {
    if source.trim().is_empty() {
        return 0;
    }
    let mut hasher = DefaultHasher::new();
    source.hash(&mut hasher);
    let value = hasher.finish();
    if value == 0 {
        1
    } else {
        value
    }
}

const SURFACE_HOOK_BEGIN: &str = "// MENGINE_SURFACE_HOOK_BEGIN";
const SURFACE_HOOK_END: &str = "// MENGINE_SURFACE_HOOK_END";

pub fn validate_surface_shader_hook(source: &str) -> Result<(), String> {
    compose_surface_shader(source).map(|_| ())
}

fn compose_surface_shader(surface_hook: &str) -> Result<String, String> {
    let hook = surface_hook.trim();
    if hook.is_empty() {
        return Ok(FORWARD_WGSL.to_owned());
    }
    for forbidden in ["@group", "@binding", "@vertex", "@fragment", "@compute"] {
        if hook.contains(forbidden) {
            return Err(format!(
                "surface hook cannot declare engine bindings or entry points ({forbidden})"
            ));
        }
    }
    let start = FORWARD_WGSL
        .find(SURFACE_HOOK_BEGIN)
        .ok_or_else(|| "engine surface-hook start marker is missing".to_owned())?;
    let end = FORWARD_WGSL
        .find(SURFACE_HOOK_END)
        .map(|index| index + SURFACE_HOOK_END.len())
        .ok_or_else(|| "engine surface-hook end marker is missing".to_owned())?;
    let mut composed = FORWARD_WGSL.to_owned();
    composed.replace_range(
        start..end,
        &format!("{SURFACE_HOOK_BEGIN}\n{hook}\n{SURFACE_HOOK_END}"),
    );
    let module = naga::front::wgsl::parse_str(&composed)
        .map_err(|error| format!("WGSL parse failed: {error}"))?;
    naga::valid::Validator::new(
        naga::valid::ValidationFlags::all(),
        naga::valid::Capabilities::all(),
    )
    .validate(&module)
    .map_err(|error| format!("WGSL validation failed: {error}"))?;
    Ok(composed)
}

fn create_pipeline(
    device: &wgpu::Device,
    format: wgpu::TextureFormat,
    shader: &wgpu::ShaderModule,
    layout: &wgpu::PipelineLayout,
    key: MaterialPipelineKey,
) -> wgpu::RenderPipeline {
    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("forward_material_pipeline"),
        layout: Some(layout),
        vertex: wgpu::VertexState {
            module: shader,
            entry_point: Some("vs_main"),
            buffers: &[wgpu::VertexBufferLayout {
                array_stride: std::mem::size_of::<Vertex>() as wgpu::BufferAddress,
                step_mode: wgpu::VertexStepMode::Vertex,
                attributes: &wgpu::vertex_attr_array![0 => Float32x3, 1 => Float32x3, 2 => Float32x2],
            }],
            compilation_options: Default::default(),
        },
        fragment: Some(wgpu::FragmentState {
            module: shader,
            entry_point: Some("fs_main"),
            targets: &[Some(wgpu::ColorTargetState {
                format,
                blend: Some(material_blend_state(key.blend)),
                write_mask: wgpu::ColorWrites::ALL,
            })],
            compilation_options: Default::default(),
        }),
        primitive: wgpu::PrimitiveState {
            topology: wgpu::PrimitiveTopology::TriangleList,
            strip_index_format: None,
            front_face: wgpu::FrontFace::Ccw,
            cull_mode: (!key.double_sided).then_some(wgpu::Face::Back),
            ..Default::default()
        },
        depth_stencil: Some(wgpu::DepthStencilState {
            format: wgpu::TextureFormat::Depth32Float,
            depth_write_enabled: key.depth_write,
            depth_compare: wgpu::CompareFunction::Less,
            stencil: Default::default(),
            bias: Default::default(),
        }),
        multisample: wgpu::MultisampleState::default(),
        multiview: None,
        cache: None,
    })
}

fn material_blend_state(blend: MaterialPipelineBlend) -> wgpu::BlendState {
    let component = |src_factor, dst_factor| wgpu::BlendComponent {
        src_factor,
        dst_factor,
        operation: wgpu::BlendOperation::Add,
    };
    match blend {
        MaterialPipelineBlend::Replace => wgpu::BlendState::REPLACE,
        MaterialPipelineBlend::Alpha => wgpu::BlendState::ALPHA_BLENDING,
        MaterialPipelineBlend::Premultiplied => wgpu::BlendState {
            color: component(wgpu::BlendFactor::One, wgpu::BlendFactor::OneMinusSrcAlpha),
            alpha: component(wgpu::BlendFactor::One, wgpu::BlendFactor::OneMinusSrcAlpha),
        },
        MaterialPipelineBlend::Additive => wgpu::BlendState {
            color: component(wgpu::BlendFactor::SrcAlpha, wgpu::BlendFactor::One),
            alpha: component(wgpu::BlendFactor::One, wgpu::BlendFactor::One),
        },
        MaterialPipelineBlend::Multiply => wgpu::BlendState {
            color: component(wgpu::BlendFactor::Dst, wgpu::BlendFactor::Zero),
            alpha: component(
                wgpu::BlendFactor::SrcAlpha,
                wgpu::BlendFactor::OneMinusSrcAlpha,
            ),
        },
    }
}

fn create_object_buffer(device: &wgpu::Device, stride: u64, capacity: usize) -> wgpu::Buffer {
    device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("object_uniforms"),
        size: stride * capacity.max(1) as u64,
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    })
}

fn create_bind_group(
    device: &wgpu::Device,
    layout: &wgpu::BindGroupLayout,
    global_buf: &wgpu::Buffer,
    object_buf: &wgpu::Buffer,
) -> wgpu::BindGroup {
    device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("forward_bg"),
        layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: global_buf.as_entire_binding(),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: wgpu::BindingResource::Buffer(wgpu::BufferBinding {
                    buffer: object_buf,
                    offset: 0,
                    size: NonZeroU64::new(std::mem::size_of::<ObjectUniforms>() as u64),
                }),
            },
        ],
    })
}

fn validate_material_texture_rgba8(
    width: u32,
    height: u32,
    rgba8: &[u8],
) -> Result<(), UiTextureError> {
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

fn create_material_texture_rgba8(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    label: &str,
    width: u32,
    height: u32,
    rgba8: &[u8],
    srgb: bool,
) -> MaterialTextureGpu {
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
        format: if srgb {
            wgpu::TextureFormat::Rgba8UnormSrgb
        } else {
            wgpu::TextureFormat::Rgba8Unorm
        },
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
    MaterialTextureGpu {
        _texture: texture,
        view,
    }
}

fn align_to(value: u64, alignment: u64) -> u64 {
    let alignment = alignment.max(1);
    value.div_ceil(alignment) * alignment
}

fn create_depth(
    device: &wgpu::Device,
    width: u32,
    height: u32,
) -> (wgpu::Texture, wgpu::TextureView) {
    let tex = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("depth"),
        size: wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Depth32Float,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
        view_formats: &[],
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

pub fn orthographic(size: f32, aspect: f32, near: f32, far: f32) -> Mat4 {
    let half_height = size.max(0.001);
    let half_width = half_height * aspect.max(0.001);
    Mat4::orthographic_rh(
        -half_width,
        half_width,
        -half_height,
        half_height,
        near,
        far,
    )
}

const FORWARD_WGSL: &str = r#"
const MAX_POINT_LIGHTS: u32 = 4u;
const MAX_SPOT_LIGHTS: u32 = 4u;

struct GlobalUniforms {
    view_proj: mat4x4<f32>,
    camera_position: vec4<f32>,
    ambient: vec4<f32>,
    directional_direction: vec4<f32>,
    directional_color: vec4<f32>,
    point_positions: array<vec4<f32>, 4>,
    point_colors: array<vec4<f32>, 4>,
    spot_positions: array<vec4<f32>, 4>,
    spot_directions: array<vec4<f32>, 4>,
    spot_colors: array<vec4<f32>, 4>,
    spot_params: array<vec4<f32>, 4>,
    light_counts: vec4<u32>,
};

struct ObjectUniforms {
    model: mat4x4<f32>,
    normal_matrix: mat4x4<f32>,
    base_color: vec4<f32>,
    material: vec4<f32>,
    emissive: vec4<f32>,
    texture_transform: vec4<f32>,
    map_params: vec4<f32>,
};

@group(0) @binding(0) var<uniform> frame: GlobalUniforms;
@group(0) @binding(1) var<uniform> object: ObjectUniforms;
@group(1) @binding(0) var base_color_texture: texture_2d<f32>;
@group(1) @binding(1) var normal_texture: texture_2d<f32>;
@group(1) @binding(2) var metallic_roughness_texture: texture_2d<f32>;
@group(1) @binding(3) var emissive_texture: texture_2d<f32>;
@group(1) @binding(4) var occlusion_texture: texture_2d<f32>;
@group(1) @binding(5) var material_sampler: sampler;

struct VsIn {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
};

struct VsOut {
    @builtin(position) clip: vec4<f32>,
    @location(0) world_position: vec3<f32>,
    @location(1) world_normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
};

@vertex
fn vs_main(v: VsIn) -> VsOut {
    var o: VsOut;
    let world = object.model * vec4<f32>(v.position, 1.0);
    o.clip = frame.view_proj * world;
    o.world_position = world.xyz;
    o.world_normal = normalize((object.normal_matrix * vec4<f32>(v.normal, 0.0)).xyz);
    let scaled_uv = v.uv * object.texture_transform.xy;
    let center = object.texture_transform.xy * 0.5;
    let angle = object.map_params.z;
    let rotation = mat2x2<f32>(cos(angle), sin(angle), -sin(angle), cos(angle));
    o.uv = rotation * (scaled_uv - center) + center + object.texture_transform.zw;
    return o;
}

const PI: f32 = 3.141592653589793;

fn distribution_ggx(n: vec3<f32>, h: vec3<f32>, roughness: f32) -> f32 {
    let alpha = roughness * roughness;
    let alpha_squared = alpha * alpha;
    let ndh = max(dot(n, h), 0.0);
    let denominator = ndh * ndh * (alpha_squared - 1.0) + 1.0;
    return alpha_squared / max(PI * denominator * denominator, 0.000001);
}

fn geometry_schlick_ggx(ndx: f32, roughness: f32) -> f32 {
    let radius = roughness + 1.0;
    let k = radius * radius * 0.125;
    return ndx / max(ndx * (1.0 - k) + k, 0.000001);
}

fn geometry_smith(n: vec3<f32>, v: vec3<f32>, l: vec3<f32>, roughness: f32) -> f32 {
    let ndv = max(dot(n, v), 0.0);
    let ndl = max(dot(n, l), 0.0);
    return geometry_schlick_ggx(ndv, roughness) * geometry_schlick_ggx(ndl, roughness);
}

fn fresnel_schlick(cos_theta: f32, f0: vec3<f32>) -> vec3<f32> {
    let grazing = pow(clamp(1.0 - cos_theta, 0.0, 1.0), 5.0);
    return f0 + (vec3<f32>(1.0) - f0) * grazing;
}

fn light_contribution(
    n: vec3<f32>,
    v: vec3<f32>,
    l: vec3<f32>,
    radiance: vec3<f32>,
    base_color: vec3<f32>,
    metallic: f32,
    roughness: f32,
) -> vec3<f32> {
    let ndl = max(dot(n, l), 0.0);
    let ndv = max(dot(n, v), 0.0);
    if ndl <= 0.0 || ndv <= 0.0 {
        return vec3<f32>(0.0);
    }
    let h = normalize(l + v);
    let f0 = mix(vec3<f32>(0.04), base_color, metallic);
    let fresnel = fresnel_schlick(max(dot(h, v), 0.0), f0);
    let distribution = distribution_ggx(n, h, roughness);
    let geometry = geometry_smith(n, v, l, roughness);
    let specular = distribution * geometry * fresnel / max(4.0 * ndv * ndl, 0.000001);
    let diffuse_weight = (vec3<f32>(1.0) - fresnel) * (1.0 - metallic);
    let diffuse = diffuse_weight * base_color / PI;
    return (diffuse + specular) * radiance * ndl;
}

fn distance_attenuation(distance: f32, range: f32) -> f32 {
    let normalized = clamp(1.0 - distance / max(range, 0.001), 0.0, 1.0);
    return normalized * normalized;
}

fn mapped_normal(
    geometric_normal: vec3<f32>,
    world_position: vec3<f32>,
    uv: vec2<f32>,
    encoded_normal: vec3<f32>,
    scale: f32,
) -> vec3<f32> {
    let position_dx = dpdx(world_position);
    let position_dy = dpdy(world_position);
    let uv_dx = dpdx(uv);
    let uv_dy = dpdy(uv);
    let tangent_raw = cross(position_dy, geometric_normal) * uv_dx.x
        + cross(geometric_normal, position_dx) * uv_dy.x;
    let bitangent_raw = cross(position_dy, geometric_normal) * uv_dx.y
        + cross(geometric_normal, position_dx) * uv_dy.y;
    let inverse_scale = inverseSqrt(max(
        max(dot(tangent_raw, tangent_raw), dot(bitangent_raw, bitangent_raw)),
        0.000001,
    ));
    let tangent = tangent_raw * inverse_scale;
    let bitangent = bitangent_raw * inverse_scale;
    var tangent_normal = encoded_normal * 2.0 - vec3<f32>(1.0);
    tangent_normal.x *= scale;
    tangent_normal.y *= scale;
    return normalize(
        tangent * tangent_normal.x
        + bitangent * tangent_normal.y
        + geometric_normal * tangent_normal.z
    );
}

// MENGINE_SURFACE_HOOK_BEGIN
fn mengine_surface_hook(
    color: vec4<f32>,
    uv: vec2<f32>,
    world_position: vec3<f32>,
    world_normal: vec3<f32>,
) -> vec4<f32> {
    return color;
}
// MENGINE_SURFACE_HOOK_END

fn material_output(color: vec3<f32>, alpha: f32) -> vec4<f32> {
    if object.map_params.w > 0.5 && object.map_params.w < 1.5 {
        return vec4<f32>(color * alpha, alpha);
    }
    return vec4<f32>(color, alpha);
}

@fragment
fn fs_main(i: VsOut, @builtin(front_facing) front_facing: bool) -> @location(0) vec4<f32> {
    let sampled_color = textureSample(base_color_texture, material_sampler, i.uv);
    let sampled_normal = textureSample(normal_texture, material_sampler, i.uv).rgb;
    let sampled_orm = textureSample(metallic_roughness_texture, material_sampler, i.uv).rgb;
    let sampled_emissive = textureSample(emissive_texture, material_sampler, i.uv).rgb;
    let sampled_occlusion = textureSample(occlusion_texture, material_sampler, i.uv).r;
    let surface_color = object.base_color * sampled_color;
    if object.emissive.w > 0.0 && surface_color.a < object.emissive.w {
        discard;
    }
    let base_color = max(surface_color.rgb, vec3<f32>(0.0));
    let metallic = clamp(object.material.x * sampled_orm.b, 0.0, 1.0);
    let roughness = clamp(object.material.y * sampled_orm.g, 0.04, 1.0);
    let occlusion = mix(1.0, sampled_occlusion, clamp(object.map_params.y, 0.0, 1.0));
    let emissive = max(object.emissive.rgb, vec3<f32>(0.0))
        * object.material.z
        * sampled_emissive;
    let face_normal = select(-normalize(i.world_normal), normalize(i.world_normal), front_facing);
    let n = mapped_normal(
        face_normal,
        i.world_position,
        i.uv,
        sampled_normal,
        max(object.map_params.x, 0.0),
    );
    if object.material.w > 0.5 {
        let surface = mengine_surface_hook(
            vec4<f32>(base_color + emissive, surface_color.a),
            i.uv,
            i.world_position,
            n,
        );
        return material_output(surface.rgb, surface.a);
    }

    let v = normalize(frame.camera_position.xyz - i.world_position);
    let ambient_f0 = mix(vec3<f32>(0.04), base_color, metallic);
    let ambient_diffuse = base_color * (1.0 - metallic);
    let ambient_specular = ambient_f0 * (1.0 - roughness * 0.5);
    var color = frame.ambient.rgb * (ambient_diffuse + ambient_specular) * occlusion;

    if frame.light_counts.x > 0u {
        let l = normalize(-frame.directional_direction.xyz);
        color += light_contribution(
            n, v, l,
            frame.directional_color.rgb * frame.directional_color.a,
            base_color, metallic, roughness,
        );
    }

    for (var index = 0u; index < MAX_POINT_LIGHTS; index += 1u) {
        if index < frame.light_counts.y {
            let to_light = frame.point_positions[index].xyz - i.world_position;
            let distance = length(to_light);
            let attenuation = distance_attenuation(distance, frame.point_positions[index].w);
            color += light_contribution(
                n, v, normalize(to_light),
                frame.point_colors[index].rgb * frame.point_colors[index].a * attenuation,
                base_color, metallic, roughness,
            );
        }
    }

    for (var index = 0u; index < MAX_SPOT_LIGHTS; index += 1u) {
        if index < frame.light_counts.z {
            let to_light = frame.spot_positions[index].xyz - i.world_position;
            let distance = length(to_light);
            let from_light = -normalize(to_light);
            let cone = dot(from_light, normalize(frame.spot_directions[index].xyz));
            let inner_cos = frame.spot_params[index].x;
            let outer_cos = frame.spot_params[index].y;
            let cone_attenuation = smoothstep(outer_cos, inner_cos, cone);
            let attenuation = distance_attenuation(distance, frame.spot_positions[index].w) * cone_attenuation;
            color += light_contribution(
                n, v, normalize(to_light),
                frame.spot_colors[index].rgb * frame.spot_colors[index].a * attenuation,
                base_color, metallic, roughness,
            );
        }
    }

    color += emissive;
    let surface = mengine_surface_hook(
        vec4<f32>(color, surface_color.a),
        i.uv,
        i.world_position,
        n,
    );
    return material_output(surface.rgb, surface.a);
}
"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn forward_shader_is_valid_wgsl() {
        let module = naga::front::wgsl::parse_str(FORWARD_WGSL)
            .expect("forward shader should parse as WGSL");
        naga::valid::Validator::new(
            naga::valid::ValidationFlags::all(),
            naga::valid::Capabilities::all(),
        )
        .validate(&module)
        .expect("forward shader should pass validation");
    }

    #[test]
    fn forward_shader_uses_energy_conserving_ggx_lighting() {
        for required in [
            "fn distribution_ggx",
            "fn geometry_smith",
            "fn fresnel_schlick",
            "diffuse_weight = (vec3<f32>(1.0) - fresnel) * (1.0 - metallic)",
        ] {
            assert!(FORWARD_WGSL.contains(required), "missing {required}");
        }
        assert!(!FORWARD_WGSL.contains("let shininess ="));
    }

    #[test]
    fn custom_surface_hooks_are_composed_validated_and_fingerprinted() {
        let hook = r#"
            fn mengine_surface_hook(
                color: vec4<f32>,
                uv: vec2<f32>,
                world_position: vec3<f32>,
                world_normal: vec3<f32>,
            ) -> vec4<f32> {
                let rim = pow(1.0 - abs(world_normal.z), 2.0);
                return vec4<f32>(color.rgb + vec3<f32>(rim * uv.x), color.a);
            }
        "#;
        let composed = compose_surface_shader(hook).unwrap();
        assert!(composed.contains("let rim ="));
        assert!(!composed.contains("return color;\n}\n// MENGINE_SURFACE_HOOK_END"));
        assert_ne!(surface_shader_fingerprint(hook), 0);
        assert_eq!(surface_shader_fingerprint(""), 0);
        assert!(validate_surface_shader_hook("fn mengine_surface_hook() {}").is_err());
        assert!(validate_surface_shader_hook("@fragment fn fs_main() {}").is_err());
    }

    #[test]
    fn alignment_matches_dynamic_uniform_requirement() {
        assert_eq!(align_to(176, 256), 256);
        assert_eq!(align_to(256, 256), 256);
    }

    #[test]
    fn light_counts_are_clamped_to_shader_limits() {
        let camera = FrameCamera {
            view: Mat4::IDENTITY,
            proj: Mat4::IDENTITY,
            position: Vec3::ZERO,
        };
        let lighting = FrameLighting {
            points: vec![
                PointLightData {
                    position: Vec3::ZERO,
                    color: [1.0; 3],
                    intensity: 1.0,
                    range: 1.0,
                };
                8
            ],
            ..Default::default()
        };
        let uniforms = make_global_uniforms(camera, &lighting);
        assert_eq!(uniforms.light_counts[1], MAX_POINT_LIGHTS as u32);
    }

    #[test]
    fn material_texture_roles_and_map_parameters_remain_distinct() {
        let object = RenderObject {
            mesh_key: "cube".into(),
            model: Mat4::IDENTITY,
            material: RenderMaterial {
                base_color_texture: "base.png".into(),
                normal_texture: "normal.png".into(),
                normal_scale: 1.5,
                metallic_roughness_texture: "orm.png".into(),
                occlusion_texture: "ao.png".into(),
                occlusion_strength: 0.65,
                emissive_texture: "emissive.png".into(),
                uv_rotation_degrees: 90.0,
                wrap_u: MaterialWrap::Clamp,
                wrap_v: MaterialWrap::Mirror,
                filter: MaterialFilter::Nearest,
                ..Default::default()
            },
        };
        let key = MaterialTextureSetKey::from(&object.material);
        assert_eq!(key.base_color, "base.png");
        assert_eq!(key.normal, "normal.png");
        assert_eq!(key.metallic_roughness, "orm.png");
        assert_eq!(key.occlusion, "ao.png");
        assert_eq!(key.emissive, "emissive.png");
        assert_eq!(key.sampler.wrap_u, MaterialWrap::Clamp);
        assert_eq!(key.sampler.wrap_v, MaterialWrap::Mirror);
        assert_eq!(key.sampler.filter, MaterialFilter::Nearest);
        assert_eq!(
            make_object_uniforms(&object).map_params,
            [1.5, 0.65, std::f32::consts::FRAC_PI_2, 0.0]
        );
    }

    #[test]
    fn legacy_orm_map_remains_the_occlusion_source() {
        let material = RenderMaterial {
            metallic_roughness_texture: "orm.png".into(),
            ..Default::default()
        };
        let key = MaterialTextureSetKey::from(&material);
        assert_eq!(key.occlusion, "orm.png");
    }

    #[test]
    fn material_pipeline_key_preserves_blend_depth_and_culling_state() {
        let material = RenderMaterial {
            transparent: true,
            blend_mode: MaterialBlendMode::Premultiplied,
            depth_write: false,
            double_sided: true,
            ..Default::default()
        };
        assert_eq!(
            MaterialPipelineKey::from(&material),
            MaterialPipelineKey {
                blend: MaterialPipelineBlend::Premultiplied,
                double_sided: true,
                depth_write: false,
                shader_fingerprint: 0,
            }
        );
        let object = RenderObject {
            mesh_key: "cube".into(),
            model: Mat4::IDENTITY,
            material,
        };
        assert_eq!(make_object_uniforms(&object).map_params[3], 1.0);
    }

    #[test]
    fn render_queue_precedes_transparent_distance_sorting() {
        let object = |queue, transparent, z| RenderObject {
            mesh_key: "cube".into(),
            model: Mat4::from_translation(Vec3::new(0.0, 0.0, z)),
            material: RenderMaterial {
                transparent,
                render_queue: queue,
                ..Default::default()
            },
        };
        let objects = vec![
            object(3000, true, 2.0),
            object(2000, false, 10.0),
            object(3000, true, 8.0),
            object(2450, false, 0.0),
        ];
        assert_eq!(
            sorted_render_indices(&objects, Vec3::ZERO),
            vec![1, 3, 2, 0]
        );
    }
}
