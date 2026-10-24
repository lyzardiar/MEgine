// Author: MiYu. World-space imported particles share scene depth and transparent draw ordering.
use std::{collections::HashMap, num::NonZeroU64, sync::{Arc, Weak}};
use wgpu::util::DeviceExt;
use crate::{FrameCamera, RenderObject};

pub const PARTICLE_PARAMETER_COUNT: usize = 128;

#[repr(C)]
#[derive(Clone, Copy, Debug, bytemuck::Pod, bytemuck::Zeroable)]
pub struct ParticleVertex { pub position: [f32; 3], pub uv: [f32; 2], pub color: [f32; 4] }

#[derive(Debug)]
pub struct ParticleGeometry { pub vertices: Vec<ParticleVertex>, pub indices: Vec<u32> }

#[derive(Clone, Debug)]
pub struct ParticleRenderData {
    pub geometry: Arc<ParticleGeometry>,
    pub color: [f32; 4],
    pub custom1: [f32; 4],
    pub custom2: [f32; 4],
    pub uv_transform: [f32; 4],
    pub parameters: Arc<[[f32; 4]; PARTICLE_PARAMETER_COUNT]>,
    pub seconds: f32,
    pub features: u32,
    pub sorting_position: [f32;3],
    pub sorting_fudge: f32,
    pub source_blend: u32,
    pub destination_blend: u32,
    pub depth_compare: u32,
    pub cull: u32,
    pub depth_write: bool,
}

#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct ParticleUniform {
    view_projection: [[f32; 4]; 4], model: [[f32; 4]; 4], color: [f32; 4], custom1: [f32; 4], custom2: [f32; 4], uv_transform: [f32; 4], time_features: [f32; 4], parameters: [[f32; 4]; PARTICLE_PARAMETER_COUNT],
}

#[derive(Clone, Copy, Debug, Hash, Eq, PartialEq)]
struct PipelineKey { source: u32, destination: u32, compare: u32, cull: u32, write: bool }
impl From<&ParticleRenderData> for PipelineKey {
    fn from(value: &ParticleRenderData) -> Self { Self { source: value.source_blend, destination: value.destination_blend, compare: value.depth_compare, cull: value.cull, write: value.depth_write } }
}

struct GeometryGpu { owner: Weak<ParticleGeometry>, vertices: wgpu::Buffer, indices: wgpu::Buffer, count: u32 }

pub(crate) struct ParticleRenderer {
    layout: wgpu::BindGroupLayout,
    pipeline_layout: wgpu::PipelineLayout,
    shader: wgpu::ShaderModule,
    pipelines: HashMap<PipelineKey, wgpu::RenderPipeline>,
    geometry: HashMap<usize, GeometryGpu>,
    buffer: wgpu::Buffer,
    bind_group: wgpu::BindGroup,
    capacity: usize,
    stride: u64,
    slots: HashMap<usize, u32>,
    sample_count: u32,
    sampler_layout: wgpu::BindGroupLayout,
    samplers: HashMap<[[u32;3];5],wgpu::BindGroup>,
}

fn sampler_key(data:&ParticleRenderData)->[[u32;3];5] {std::array::from_fn(|i|std::array::from_fn(|j|data.parameters[100+i][j] as u32))}
fn wrap(value:u32)->wgpu::AddressMode {match value {1|3=>wgpu::AddressMode::ClampToEdge,2=>wgpu::AddressMode::MirrorRepeat,_=>wgpu::AddressMode::Repeat}}
fn compare(value: u32) -> wgpu::CompareFunction {
    match value { 0 | 8 => wgpu::CompareFunction::Always, 1 => wgpu::CompareFunction::Never, 2 => wgpu::CompareFunction::Less, 3 => wgpu::CompareFunction::Equal, 4 => wgpu::CompareFunction::LessEqual, 5 => wgpu::CompareFunction::Greater, 6 => wgpu::CompareFunction::NotEqual, 7 => wgpu::CompareFunction::GreaterEqual, _ => wgpu::CompareFunction::LessEqual }
}
fn blend(value: u32) -> wgpu::BlendFactor {
    match value { 0 => wgpu::BlendFactor::Zero, 1 => wgpu::BlendFactor::One, 2 => wgpu::BlendFactor::Dst, 3 => wgpu::BlendFactor::Src, 4 => wgpu::BlendFactor::OneMinusDst, 5 => wgpu::BlendFactor::SrcAlpha, 6 => wgpu::BlendFactor::OneMinusSrc, 7 => wgpu::BlendFactor::DstAlpha, 8 => wgpu::BlendFactor::OneMinusDstAlpha, 9 => wgpu::BlendFactor::SrcAlphaSaturated, _ => wgpu::BlendFactor::OneMinusSrcAlpha }
}

impl ParticleRenderer {
    pub fn new(device: &wgpu::Device, textures: &wgpu::BindGroupLayout, sample_count: u32) -> Self {
        let size = std::mem::size_of::<ParticleUniform>() as u64;
        let alignment = device.limits().min_uniform_buffer_offset_alignment as u64;
        let stride = size.div_ceil(alignment) * alignment;
        let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor { label: Some("particle uniforms"), entries: &[wgpu::BindGroupLayoutEntry { binding: 0, visibility: wgpu::ShaderStages::VERTEX_FRAGMENT, ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: true, min_binding_size: NonZeroU64::new(size) }, count: None }] });
        let sampler_entries:Vec<_>=(0..5).map(|binding|wgpu::BindGroupLayoutEntry {binding,visibility:wgpu::ShaderStages::FRAGMENT,ty:wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),count:None}).collect();
        let sampler_layout=device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {label:Some("particle texture samplers"),entries:&sampler_entries});
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor { label: Some("particle layout"), bind_group_layouts: &[&layout, textures, &sampler_layout], push_constant_ranges: &[] });
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some("Unity VFX particle adapter"), source: wgpu::ShaderSource::Wgsl(include_str!("particle_render.wgsl").into()) });
        let (buffer, bind_group) = Self::uniform_buffer(device, &layout, stride);
        Self { layout, pipeline_layout, shader, pipelines: HashMap::new(), geometry: HashMap::new(), buffer, bind_group, capacity: 1, stride, slots: HashMap::new(), sample_count, sampler_layout, samplers:HashMap::new() }
    }

    fn uniform_buffer(device: &wgpu::Device, layout: &wgpu::BindGroupLayout, bytes: u64) -> (wgpu::Buffer, wgpu::BindGroup) {
        let buffer = device.create_buffer(&wgpu::BufferDescriptor { label: Some("particle uniforms"), size: bytes, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
        let group = device.create_bind_group(&wgpu::BindGroupDescriptor { label: Some("particle uniforms"), layout, entries: &[wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::Buffer(wgpu::BufferBinding { buffer: &buffer, offset: 0, size: NonZeroU64::new(std::mem::size_of::<ParticleUniform>() as u64) }) }] });
        (buffer, group)
    }

    pub fn prepare(&mut self, device: &wgpu::Device, queue: &wgpu::Queue, camera: FrameCamera, objects: &[RenderObject]) {
        self.slots.clear();
        self.geometry.retain(|_, geometry| geometry.owner.strong_count() > 0);
        let count = objects.iter().filter(|object| object.material.particle.is_some()).count();
        if count == 0 { return; }
        if count > self.capacity { self.capacity = count.next_power_of_two(); (self.buffer, self.bind_group) = Self::uniform_buffer(device, &self.layout, self.stride * self.capacity as u64); }
        let mut bytes = vec![0; self.stride as usize * count];
        for (index, object) in objects.iter().enumerate() {
            let Some(particle) = object.material.particle.as_deref() else { continue; };
            let slot = self.slots.len(); self.slots.insert(index, slot as u32);
            let uniform = ParticleUniform { view_projection: (camera.proj * camera.view).to_cols_array_2d(), model: object.model.to_cols_array_2d(), color: particle.color, custom1: particle.custom1, custom2: particle.custom2, uv_transform: particle.uv_transform, time_features: [particle.seconds, particle.features as f32, 0.0, 0.0], parameters: *particle.parameters };
            let payload = bytemuck::bytes_of(&uniform); let offset = slot * self.stride as usize; bytes[offset..offset + payload.len()].copy_from_slice(payload);
            let geometry = &particle.geometry;
            let key = Arc::as_ptr(geometry) as usize;
            if !geometry.vertices.is_empty() && !geometry.indices.is_empty() && !self.geometry.contains_key(&key) {
                self.geometry.insert(key, GeometryGpu { owner: Arc::downgrade(geometry), vertices: device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some("particle vertices"), contents: bytemuck::cast_slice(&geometry.vertices), usage: wgpu::BufferUsages::VERTEX }), indices: device.create_buffer_init(&wgpu::util::BufferInitDescriptor { label: Some("particle indices"), contents: bytemuck::cast_slice(&geometry.indices), usage: wgpu::BufferUsages::INDEX }), count: geometry.indices.len() as u32 });
            }
            let sampler_key=sampler_key(particle);
            if !self.samplers.contains_key(&sampler_key) {
                let samplers:Vec<_>=sampler_key.iter().map(|key|device.create_sampler(&wgpu::SamplerDescriptor {
                    label:Some("Unity particle texture sampler"),address_mode_u:wrap(key[0]),address_mode_v:wrap(key[1]),mag_filter:if key[2]==0 {wgpu::FilterMode::Nearest}else{wgpu::FilterMode::Linear},min_filter:if key[2]==0 {wgpu::FilterMode::Nearest}else{wgpu::FilterMode::Linear},mipmap_filter:if key[2]==2 {wgpu::FilterMode::Linear}else{wgpu::FilterMode::Nearest},..Default::default()
                })).collect();
                let entries:Vec<_>=samplers.iter().enumerate().map(|(i,s)|wgpu::BindGroupEntry {binding:i as u32,resource:wgpu::BindingResource::Sampler(s)}).collect();
                self.samplers.insert(sampler_key,device.create_bind_group(&wgpu::BindGroupDescriptor {label:Some("particle samplers"),layout:&self.sampler_layout,entries:&entries}));
            }
            let key = PipelineKey::from(particle);
            if !self.pipelines.contains_key(&key) { let pipeline = self.pipeline(device, key); self.pipelines.insert(key, pipeline); }
        }
        queue.write_buffer(&self.buffer, 0, &bytes);
    }

    fn pipeline(&self, device: &wgpu::Device, key: PipelineKey) -> wgpu::RenderPipeline {
        let component = wgpu::BlendComponent { src_factor: blend(key.source), dst_factor: blend(key.destination), operation: wgpu::BlendOperation::Add };
        device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("world particle"), layout: Some(&self.pipeline_layout),
            vertex: wgpu::VertexState { module: &self.shader, entry_point: Some("vs_main"), compilation_options: Default::default(), buffers: &[wgpu::VertexBufferLayout { array_stride: std::mem::size_of::<ParticleVertex>() as u64, step_mode: wgpu::VertexStepMode::Vertex, attributes: &wgpu::vertex_attr_array![0 => Float32x3, 1 => Float32x2, 2 => Float32x4] }] },
            fragment: Some(wgpu::FragmentState { module: &self.shader, entry_point: Some("fs_main"), compilation_options: Default::default(), targets: &[Some(wgpu::ColorTargetState { format: crate::post_process::HDR_COLOR_FORMAT, blend: Some(wgpu::BlendState { color: component, alpha: component }), write_mask: wgpu::ColorWrites::ALL })] }),
            primitive: wgpu::PrimitiveState { cull_mode: match key.cull { 1 => Some(wgpu::Face::Front), 2 => Some(wgpu::Face::Back), _ => None }, ..Default::default() },
            depth_stencil: Some(wgpu::DepthStencilState { format: wgpu::TextureFormat::Depth24PlusStencil8, depth_write_enabled: key.write, depth_compare: compare(key.compare), stencil: Default::default(), bias: Default::default() }),
            multisample: wgpu::MultisampleState { count: self.sample_count, ..Default::default() }, multiview: None, cache: None,
        })
    }

    pub fn draw<'a>(&'a self, pass: &mut wgpu::RenderPass<'a>, index: usize, data: &ParticleRenderData, textures: &'a wgpu::BindGroup) {
        let Some(slot) = self.slots.get(&index) else { return; };
        let Some(geometry) = self.geometry.get(&(Arc::as_ptr(&data.geometry) as usize)) else { return; };
        let Some(pipeline) = self.pipelines.get(&PipelineKey::from(data)) else { return; };
        pass.set_pipeline(pipeline); pass.set_bind_group(0, &self.bind_group, &[*slot * self.stride as u32]); pass.set_bind_group(1, textures, &[]); pass.set_bind_group(2,&self.samplers[&sampler_key(data)],&[]);
        pass.set_vertex_buffer(0, geometry.vertices.slice(..)); pass.set_index_buffer(geometry.indices.slice(..), wgpu::IndexFormat::Uint32); pass.draw_indexed(0..geometry.count, 0, 0..1);
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn shader_and_uniform_layout_are_valid() {
        let module = naga::front::wgsl::parse_str(include_str!("particle_render.wgsl")).unwrap();
        naga::valid::Validator::new(naga::valid::ValidationFlags::all(), naga::valid::Capabilities::all()).validate(&module).unwrap();
        assert_eq!(std::mem::size_of::<super::ParticleUniform>() % 16, 0);
        assert_eq!(super::compare(2), wgpu::CompareFunction::Less);
    }
    #[test]
    fn gpu_particle_color_blend_custom_data_and_scene_depth() {
        use super::*;
        use crate::{Renderer, RenderMaterial, RenderFrame, RenderTarget, FrameLighting, ClearColor};
        use glam::{Mat4,Vec3,Vec4};
        let size=winit::dpi::PhysicalSize::new(32,32);
        let mut renderer=pollster::block_on(Renderer::new_headless(size)).expect("native GPU required for particle integration test");
        let target=renderer.create_offscreen_target(size);
        let mut lighting=FrameLighting::default();lighting.environment.background_enabled=false;lighting.environment.tone_mapping=false;lighting.environment.exposure=0.;
        let camera=FrameCamera {view:Mat4::IDENTITY,proj:Mat4::IDENTITY,position:Vec3::new(0.,0.,-1.)};
        let mut parameters=[[0.;4];PARTICLE_PARAMETER_COUNT];parameters[3][0]=1.;parameters[57][0]=1.;
        for slot in 116..121 {parameters[slot]=[1.,1.,0.,0.];}
        parameters[121]=[1.;4];parameters[124]=[1.;4];parameters[125]=[1.,1.,1.,0.];
        let geometry=Arc::new(ParticleGeometry {vertices:[[-1.,-1.,0.],[1.,-1.,0.],[1.,1.,0.],[-1.,1.,0.]].into_iter().map(|position|ParticleVertex {position,uv:[0.5;2],color:[0.5,1.,1.,1.]}).collect(),indices:vec![0,1,2,0,2,3]});
        let data=ParticleRenderData {geometry,color:[0.5,0.,0.,1.],custom1:[0.;4],custom2:[0.;4],uv_transform:[1.,1.,0.,0.],parameters:Arc::new(parameters),seconds:0.,features:0,sorting_position:[0.;3],sorting_fudge:0.,source_blend:5,destination_blend:10,depth_compare:2,cull:0,depth_write:false};
        let object=|data:ParticleRenderData,z|RenderObject {mesh_key:"$test".into(),model:Mat4::from_translation(Vec3::new(0.,0.,z)),material:RenderMaterial {transparent:true,unlit:true,particle:Some(Arc::new(data)),..Default::default()}.into(),cast_shadows:false,receive_shadows:false};
        let mut render=|objects:Vec<RenderObject>| {
            renderer.submit_frame_to(&RenderFrame {clear:ClearColor::from(Vec4::new(0.,0.,0.,1.)),camera,objects:&objects,lighting:&lighting,ui:None,scene_views:&[]},RenderTarget::Offscreen(&target)).unwrap();
            let (pixels,_)=renderer.read_offscreen_rgba8_profiled(&target).unwrap();let i=(16*32+16)*4;[pixels[i],pixels[i+1],pixels[i+2]]
        };
        let full=render(vec![object(data.clone(),0.6)]);assert!((130..=145).contains(&full[0]) && full[1]<3 && full[2]<3,"vertex and particle color: {full:?}");
        let mut half=data.clone();half.color[3]=0.5;let blended=render(vec![object(half,0.6)]);assert!(blended[0]>85 && blended[0]<full[0]-20,"alpha blend: {blended:?}");
        let mut custom=data.clone();custom.features=1;Arc::make_mut(&mut custom.parameters)[95][0]=1.;custom.custom1[0]=0.;let invisible=render(vec![object(custom,0.6)]);assert!(invisible.iter().all(|c|*c<3),"CustomData alpha: {invisible:?}");
        let mut red=data.clone();red.color[3]=0.5;let mut blue=red.clone();blue.color=[0.,0.,0.5,0.5];
        red.sorting_fudge=-20.;let biased=render(vec![object(red.clone(),0.6),object(blue.clone(),0.6)]);
        red.sorting_fudge=20.;let reversed=render(vec![object(red,0.6),object(blue,0.6)]);assert!(biased[0]>reversed[0] && biased[2]<reversed[2],"renderer sorting bias: {biased:?} / {reversed:?}");
        let cube=||RenderObject {mesh_key:"cube".into(),model:Mat4::from_scale_rotation_translation(Vec3::splat(0.4),glam::Quat::IDENTITY,Vec3::new(0.,0.,0.5)),material:RenderMaterial {unlit:true,base_color:[0.,1.,0.,1.],double_sided:true,..Default::default()}.into(),cast_shadows:false,receive_shadows:false};
        let hidden=render(vec![cube(),object(data.clone(),0.8)]);assert!(hidden[0]<3 && hidden[1]>240,"scene depth occlusion: {hidden:?}");
        let front=render(vec![cube(),object(data,0.1)]);assert!((130..=145).contains(&front[0]) && front[1]<3,"front particle: {front:?}");
    }

}
