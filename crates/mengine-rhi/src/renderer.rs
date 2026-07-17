use crate::mesh::{MeshGpu, Vertex};
use crate::render_graph::RenderGraph;
use crate::ui::{UiBatchPlan, UiFrameStats, UiRenderer, UiTextureError};
use crate::RhiError;
use glam::{Mat4, Vec3, Vec4};
use std::collections::HashMap;
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
    pub alpha_cutoff: f32,
    pub base_color_texture: String,
    pub uv_scale: [f32; 2],
    pub uv_offset: [f32; 2],
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
            alpha_cutoff: 0.0,
            base_color_texture: String::new(),
            uv_scale: [1.0, 1.0],
            uv_offset: [0.0, 0.0],
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
}

struct MaterialTextureGpu {
    _texture: wgpu::Texture,
    bind_group: wgpu::BindGroup,
}

pub struct Renderer {
    pub device: wgpu::Device,
    pub queue: wgpu::Queue,
    surface: wgpu::Surface<'static>,
    config: wgpu::SurfaceConfiguration,
    pipeline: wgpu::RenderPipeline,
    double_sided_pipeline: wgpu::RenderPipeline,
    transparent_pipeline: wgpu::RenderPipeline,
    transparent_double_sided_pipeline: wgpu::RenderPipeline,
    depth_view: wgpu::TextureView,
    depth_texture: wgpu::Texture,
    meshes: HashMap<String, MeshGpu>,
    bind_layout: wgpu::BindGroupLayout,
    global_buf: wgpu::Buffer,
    object_buf: wgpu::Buffer,
    bind_group: wgpu::BindGroup,
    material_texture_layout: wgpu::BindGroupLayout,
    material_sampler: wgpu::Sampler,
    fallback_material_texture: MaterialTextureGpu,
    material_textures: HashMap<String, MaterialTextureGpu>,
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
        let pipeline = create_pipeline(
            &device,
            format,
            &shader,
            &pipeline_layout,
            Some(wgpu::Face::Back),
            false,
        );
        let double_sided_pipeline =
            create_pipeline(&device, format, &shader, &pipeline_layout, None, false);
        let transparent_pipeline = create_pipeline(
            &device,
            format,
            &shader,
            &pipeline_layout,
            Some(wgpu::Face::Back),
            true,
        );
        let transparent_double_sided_pipeline =
            create_pipeline(&device, format, &shader, &pipeline_layout, None, true);

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
        let material_sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("material_sampler"),
            address_mode_u: wgpu::AddressMode::Repeat,
            address_mode_v: wgpu::AddressMode::Repeat,
            address_mode_w: wgpu::AddressMode::Repeat,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::FilterMode::Linear,
            ..Default::default()
        });
        let fallback_material_texture = create_material_texture_rgba8(
            &device,
            &queue,
            &material_texture_layout,
            &material_sampler,
            "material_white_texture",
            1,
            1,
            &[255, 255, 255, 255],
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
            pipeline,
            double_sided_pipeline,
            transparent_pipeline,
            transparent_double_sided_pipeline,
            depth_view,
            depth_texture,
            meshes,
            bind_layout,
            global_buf,
            object_buf,
            bind_group,
            material_texture_layout,
            material_sampler,
            fallback_material_texture,
            material_textures: HashMap::new(),
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
        let mut draw_order: Vec<usize> = objects
            .iter()
            .enumerate()
            .filter_map(|(index, object)| (!object.material.transparent).then_some(index))
            .collect();
        let mut transparent_order: Vec<usize> = objects
            .iter()
            .enumerate()
            .filter_map(|(index, object)| object.material.transparent.then_some(index))
            .collect();
        transparent_order.sort_by(|left, right| {
            let left_distance =
                (objects[*left].model.w_axis.truncate() - camera.position).length_squared();
            let right_distance =
                (objects[*right].model.w_axis.truncate() - camera.position).length_squared();
            right_distance.total_cmp(&left_distance)
        });
        draw_order.extend(transparent_order);
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
                let pipeline = match (object.material.transparent, object.material.double_sided) {
                    (true, true) => &self.transparent_double_sided_pipeline,
                    (true, false) => &self.transparent_pipeline,
                    (false, true) => &self.double_sided_pipeline,
                    (false, false) => &self.pipeline,
                };
                pass.set_pipeline(pipeline);
                pass.set_bind_group(
                    0,
                    &self.bind_group,
                    &[(index as u64 * self.object_stride) as u32],
                );
                let texture = self
                    .material_textures
                    .get(&object.material.base_color_texture)
                    .unwrap_or(&self.fallback_material_texture);
                pass.set_bind_group(1, &texture.bind_group, &[]);
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
    ) -> Result<(), UiTextureError> {
        validate_material_texture_rgba8(width, height, rgba8)?;
        let texture = create_material_texture_rgba8(
            &self.device,
            &self.queue,
            &self.material_texture_layout,
            &self.material_sampler,
            "material_texture",
            width,
            height,
            rgba8,
        );
        self.material_textures.insert(key.to_owned(), texture);
        Ok(())
    }

    pub fn remove_material_texture(&mut self, key: &str) -> bool {
        self.material_textures.remove(key).is_some()
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
    }
}

fn create_pipeline(
    device: &wgpu::Device,
    format: wgpu::TextureFormat,
    shader: &wgpu::ShaderModule,
    layout: &wgpu::PipelineLayout,
    cull_mode: Option<wgpu::Face>,
    transparent: bool,
) -> wgpu::RenderPipeline {
    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some(match (transparent, cull_mode.is_none()) {
            (false, false) => "forward",
            (false, true) => "forward_double_sided",
            (true, false) => "forward_transparent",
            (true, true) => "forward_transparent_double_sided",
        }),
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
                blend: Some(if transparent {
                    wgpu::BlendState::ALPHA_BLENDING
                } else {
                    wgpu::BlendState::REPLACE
                }),
                write_mask: wgpu::ColorWrites::ALL,
            })],
            compilation_options: Default::default(),
        }),
        primitive: wgpu::PrimitiveState {
            topology: wgpu::PrimitiveTopology::TriangleList,
            strip_index_format: None,
            front_face: wgpu::FrontFace::Ccw,
            cull_mode,
            ..Default::default()
        },
        depth_stencil: Some(wgpu::DepthStencilState {
            format: wgpu::TextureFormat::Depth32Float,
            depth_write_enabled: !transparent,
            depth_compare: wgpu::CompareFunction::Less,
            stencil: Default::default(),
            bias: Default::default(),
        }),
        multisample: wgpu::MultisampleState::default(),
        multiview: None,
        cache: None,
    })
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
    layout: &wgpu::BindGroupLayout,
    sampler: &wgpu::Sampler,
    label: &str,
    width: u32,
    height: u32,
    rgba8: &[u8],
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
        label: Some("material_texture_bg"),
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
    MaterialTextureGpu {
        _texture: texture,
        bind_group,
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
};

@group(0) @binding(0) var<uniform> frame: GlobalUniforms;
@group(0) @binding(1) var<uniform> object: ObjectUniforms;
@group(1) @binding(0) var base_color_texture: texture_2d<f32>;
@group(1) @binding(1) var base_color_sampler: sampler;

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
    o.uv = v.uv * object.texture_transform.xy + object.texture_transform.zw;
    return o;
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
    if ndl <= 0.0 {
        return vec3<f32>(0.0);
    }
    let h = normalize(l + v);
    let shininess = mix(128.0, 4.0, roughness);
    let specular_color = mix(vec3<f32>(0.04), base_color, metallic);
    let specular = pow(max(dot(n, h), 0.0), shininess) * specular_color;
    let diffuse = base_color * (1.0 - metallic);
    return (diffuse * ndl + specular * ndl) * radiance;
}

fn distance_attenuation(distance: f32, range: f32) -> f32 {
    let normalized = clamp(1.0 - distance / max(range, 0.001), 0.0, 1.0);
    return normalized * normalized;
}

@fragment
fn fs_main(i: VsOut, @builtin(front_facing) front_facing: bool) -> @location(0) vec4<f32> {
    let sampled_color = textureSample(base_color_texture, base_color_sampler, i.uv);
    let surface_color = object.base_color * sampled_color;
    if object.emissive.w > 0.0 && surface_color.a < object.emissive.w {
        discard;
    }
    let base_color = max(surface_color.rgb, vec3<f32>(0.0));
    let metallic = clamp(object.material.x, 0.0, 1.0);
    let roughness = clamp(object.material.y, 0.04, 1.0);
    let emissive = max(object.emissive.rgb, vec3<f32>(0.0)) * object.material.z;
    if object.material.w > 0.5 {
        return vec4<f32>(base_color + emissive, surface_color.a);
    }

    let geometric_normal = normalize(i.world_normal);
    let n = select(-geometric_normal, geometric_normal, front_facing);
    let v = normalize(frame.camera_position.xyz - i.world_position);
    var color = frame.ambient.rgb * base_color * (1.0 - metallic * 0.5);

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
    return vec4<f32>(color, surface_color.a);
}
"#;

#[cfg(test)]
mod tests {
    use super::*;

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
}
