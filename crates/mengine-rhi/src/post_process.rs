//! Modern Single-Sample HDR Post-Processing Stack:
//!   1. Depth Resolve (1x or 4x MSAA scene depth -> single-sample R32Float)
//!   2. Half-Resolution SSAO + Separable Depth-Aware Bilateral Blur
//!   3. 5-Mip Dual-Kawase / Jimenez Anti-Flicker HDR Bloom
//!   4. Final Composite: SSAO modulation + Bloom + Exposure + AgX / ACES / Neutral + sRGB FXAA
//!      + Strict output colorspace encoding (linear for sRGB views, OETF sRGB for UNORM views).

use crate::renderer::ToneMapper;
use glam::Mat4;
use std::num::NonZeroU64;

pub(crate) const HDR_COLOR_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba16Float;
const SSAO_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::R8Unorm;
const DEPTH_RESOLVED_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::R32Float;
const BLOOM_MIPS: usize = 5;

const DEPTH_RESOLVE_SINGLE_WGSL: &str = include_str!("shaders/depth_resolve.wgsl");
const DEPTH_RESOLVE_MSAA_WGSL: &str = include_str!("shaders/depth_resolve_msaa.wgsl");
const SSAO_WGSL: &str = include_str!("shaders/ssao.wgsl");
const BLOOM_WGSL: &str = include_str!("shaders/bloom.wgsl");
const POST_PROCESS_WGSL: &str = include_str!("shaders/post_process.wgsl");

#[derive(Clone, Copy, Debug)]
pub(crate) struct PostProcessSettings {
    pub(crate) exposure: f32,
    pub(crate) tone_mapper: ToneMapper,
    pub(crate) bloom_intensity: f32,
    pub(crate) bloom_threshold: f32,
    pub(crate) ssao_intensity: f32,
    pub(crate) fxaa_enabled: bool,
}

impl Default for PostProcessSettings {
    fn default() -> Self {
        Self {
            exposure: 0.0,
            tone_mapper: ToneMapper::AgX,
            bloom_intensity: 0.14,
            bloom_threshold: 1.05,
            ssao_intensity: 0.45,
            fxaa_enabled: true,
        }
    }
}

#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct PostProcessUniforms {
    params: [f32; 4], // exposure, tone_mapper, bloom_intensity, ssao_strength
    flags: [f32; 4],  // output_is_srgb, fxaa_enabled, 0, 0
}

#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct SsaoUniforms {
    inv_proj: [[f32; 4]; 4],
    proj: [[f32; 4]; 4],
    params: [f32; 4],
    texel_size: [f32; 4],
}

#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct BloomUniforms {
    texel_size: [f32; 2],
    threshold: f32,
    knee: f32,
}

struct BloomMip {
    _texture: wgpu::Texture,
    view: wgpu::TextureView,
    width: u32,
    height: u32,
}

pub(crate) struct HdrPostProcess {
    width: u32,
    height: u32,
    sample_count: u32,
    surface_format: wgpu::TextureFormat,
    linear_sampler: wgpu::Sampler,

    // Scene HDR target (single-sample resolved) + optional 4x MSAA scene HDR color attachment
    _hdr_texture: wgpu::Texture,
    hdr_view: wgpu::TextureView,
    msaa_hdr_color: Option<(wgpu::Texture, wgpu::TextureView)>,

    // Depth resolve (R32Float full-res) for SSAO
    depth_resolve_bgl: wgpu::BindGroupLayout,
    depth_resolve_pipeline: wgpu::RenderPipeline,
    _resolved_depth_tex: wgpu::Texture,
    resolved_depth_view: wgpu::TextureView,

    // Half-resolution SSAO + separable bilateral blur
    ssao_bgl: wgpu::BindGroupLayout,
    ssao_pipeline: wgpu::RenderPipeline,
    ssao_blur_pipeline: wgpu::RenderPipeline,
    ssao_uniform_gen: wgpu::Buffer,
    ssao_uniform_blur_h: wgpu::Buffer,
    ssao_uniform_blur_v: wgpu::Buffer,
    _ssao_raw_tex: wgpu::Texture,
    ssao_raw_view: wgpu::TextureView,
    _ssao_tmp_tex: wgpu::Texture,
    ssao_tmp_view: wgpu::TextureView,
    _ssao_final_tex: wgpu::Texture,
    ssao_final_view: wgpu::TextureView,
    ssao_bg_gen: wgpu::BindGroup,
    ssao_bg_blur_h: wgpu::BindGroup,
    ssao_bg_blur_v: wgpu::BindGroup,
    _white_ao_tex: wgpu::Texture,
    white_ao_view: wgpu::TextureView,

    // 5-mip Dual-Kawase Bloom
    bloom_bgl: wgpu::BindGroupLayout,
    bloom_prefilter_pipeline: wgpu::RenderPipeline,
    bloom_down_pipeline: wgpu::RenderPipeline,
    bloom_up_pipeline: wgpu::RenderPipeline,
    bloom_mips: Vec<BloomMip>,
    bloom_down_uniforms: Vec<wgpu::Buffer>,
    bloom_up_uniforms: Vec<wgpu::Buffer>,
    bloom_down_bgs: Vec<wgpu::BindGroup>,
    bloom_up_bgs: Vec<wgpu::BindGroup>,

    // Final single-sample composite (SSAO + Bloom + AgX/ACES + FXAA + sRGB OETF)
    composite_bgl: wgpu::BindGroupLayout,
    composite_pipeline: wgpu::RenderPipeline,
    composite_uniform: wgpu::Buffer,
    composite_bg: wgpu::BindGroup,
}

impl HdrPostProcess {
    pub(crate) fn new(
        device: &wgpu::Device,
        surface_format: wgpu::TextureFormat,
        width: u32,
        height: u32,
        sample_count: u32,
    ) -> Self {
        let width = width.max(1);
        let height = height.max(1);
        let linear_sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("post_linear_sampler"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::FilterMode::Nearest,
            ..Default::default()
        });

        let (hdr_texture, hdr_view) = create_hdr_target(device, width, height);
        let msaa_hdr_color = create_msaa_hdr(device, width, height, sample_count);

        // ---- Depth resolve
        let depth_resolve_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("depth_resolve_bgl"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Texture {
                    sample_type: wgpu::TextureSampleType::Depth,
                    view_dimension: wgpu::TextureViewDimension::D2,
                    multisampled: sample_count > 1,
                },
                count: None,
            }],
        });
        let depth_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("depth_resolve_shader"),
            source: wgpu::ShaderSource::Wgsl(
                if sample_count > 1 { DEPTH_RESOLVE_MSAA_WGSL } else { DEPTH_RESOLVE_SINGLE_WGSL }.into(),
            ),
        });
        let depth_pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("depth_resolve_pl"),
            bind_group_layouts: &[&depth_resolve_bgl],
            push_constant_ranges: &[],
        });
        let depth_resolve_pipeline = fullscreen_pipeline(
            device,
            "depth_resolve_pipeline",
            &depth_pl,
            &depth_shader,
            "vs_main",
            "fs_main",
            DEPTH_RESOLVED_FORMAT,
            None,
        );
        let (resolved_depth_tex, resolved_depth_view) = create_resolved_depth(device, width, height);

        // ---- SSAO
        let ssao_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("ssao_bgl"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: false },
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
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 3,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: NonZeroU64::new(std::mem::size_of::<SsaoUniforms>() as u64),
                    },
                    count: None,
                },
            ],
        });
        let ssao_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("ssao_shader"),
            source: wgpu::ShaderSource::Wgsl(SSAO_WGSL.into()),
        });
        let ssao_pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("ssao_pl"),
            bind_group_layouts: &[&ssao_bgl],
            push_constant_ranges: &[],
        });
        let ssao_pipeline = fullscreen_pipeline(
            device, "ssao_gen_pipeline", &ssao_pl, &ssao_shader, "vs_main", "fs_ssao", SSAO_FORMAT, None,
        );
        let ssao_blur_pipeline = fullscreen_pipeline(
            device, "ssao_blur_pipeline", &ssao_pl, &ssao_shader, "vs_main", "fs_blur", SSAO_FORMAT, None,
        );
        let make_ssao_buf = |label| {
            device.create_buffer(&wgpu::BufferDescriptor {
                label: Some(label),
                size: std::mem::size_of::<SsaoUniforms>() as u64,
                usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            })
        };
        let ssao_uniform_gen = make_ssao_buf("ssao_uniform_gen");
        let ssao_uniform_blur_h = make_ssao_buf("ssao_uniform_blur_h");
        let ssao_uniform_blur_v = make_ssao_buf("ssao_uniform_blur_v");

        let (white_ao_tex, white_ao_view) = create_white_r8(device);
        let (hw, hh) = (width.div_ceil(2).max(1), height.div_ceil(2).max(1));
        let (ssao_raw_tex, ssao_raw_view) = create_ssao_tex(device, hw, hh, "ssao_raw");
        let (ssao_tmp_tex, ssao_tmp_view) = create_ssao_tex(device, hw, hh, "ssao_tmp");
        let (ssao_final_tex, ssao_final_view) = create_ssao_tex(device, hw, hh, "ssao_final");

        let ssao_bg_gen = make_ssao_bg(device, &ssao_bgl, &resolved_depth_view, &white_ao_view, &linear_sampler, &ssao_uniform_gen);
        let ssao_bg_blur_h = make_ssao_bg(device, &ssao_bgl, &resolved_depth_view, &ssao_raw_view, &linear_sampler, &ssao_uniform_blur_h);
        let ssao_bg_blur_v = make_ssao_bg(device, &ssao_bgl, &resolved_depth_view, &ssao_tmp_view, &linear_sampler, &ssao_uniform_blur_v);

        // ---- Bloom
        let bloom_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("bloom_bgl"),
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
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: NonZeroU64::new(std::mem::size_of::<BloomUniforms>() as u64),
                    },
                    count: None,
                },
            ],
        });
        let bloom_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("bloom_shader"),
            source: wgpu::ShaderSource::Wgsl(BLOOM_WGSL.into()),
        });
        let bloom_pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("bloom_pl"),
            bind_group_layouts: &[&bloom_bgl],
            push_constant_ranges: &[],
        });
        let bloom_prefilter_pipeline = fullscreen_pipeline(
            device, "bloom_prefilter", &bloom_pl, &bloom_shader, "vs_main", "fs_prefilter", HDR_COLOR_FORMAT, None,
        );
        let bloom_down_pipeline = fullscreen_pipeline(
            device, "bloom_downsample", &bloom_pl, &bloom_shader, "vs_main", "fs_downsample", HDR_COLOR_FORMAT, None,
        );
        let additive_blend = wgpu::BlendState {
            color: wgpu::BlendComponent {
                src_factor: wgpu::BlendFactor::One,
                dst_factor: wgpu::BlendFactor::One,
                operation: wgpu::BlendOperation::Add,
            },
            alpha: wgpu::BlendComponent::REPLACE,
        };
        let bloom_up_pipeline = fullscreen_pipeline(
            device, "bloom_upsample", &bloom_pl, &bloom_shader, "vs_main", "fs_upsample", HDR_COLOR_FORMAT, Some(additive_blend),
        );
        let bloom_down_uniforms: Vec<_> = (0..BLOOM_MIPS)
            .map(|_| {
                device.create_buffer(&wgpu::BufferDescriptor {
                    label: Some("bloom_down_uniform"),
                    size: std::mem::size_of::<BloomUniforms>() as u64,
                    usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                    mapped_at_creation: false,
                })
            })
            .collect();
        let bloom_up_uniforms: Vec<_> = (0..BLOOM_MIPS.saturating_sub(1))
            .map(|_| {
                device.create_buffer(&wgpu::BufferDescriptor {
                    label: Some("bloom_up_uniform"),
                    size: std::mem::size_of::<BloomUniforms>() as u64,
                    usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                    mapped_at_creation: false,
                })
            })
            .collect();
        let bloom_mips = create_bloom_mips(device, width, height);
        let (bloom_down_bgs, bloom_up_bgs) = create_bloom_bind_groups(
            device,
            &bloom_bgl,
            &hdr_view,
            &bloom_mips,
            &linear_sampler,
            &bloom_down_uniforms,
            &bloom_up_uniforms,
        );

        // ---- Final single-sample composite (NO wasted 4x MSAA on fullscreen post!)
        let composite_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("post_composite_bgl"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: false },
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
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 4,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: NonZeroU64::new(std::mem::size_of::<PostProcessUniforms>() as u64),
                    },
                    count: None,
                },
            ],
        });
        let composite_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("post_composite_shader"),
            source: wgpu::ShaderSource::Wgsl(POST_PROCESS_WGSL.into()),
        });
        let composite_pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("post_composite_pl"),
            bind_group_layouts: &[&composite_bgl],
            push_constant_ranges: &[],
        });
        let composite_pipeline = fullscreen_pipeline(
            device, "post_composite_pipeline", &composite_pl, &composite_shader, "vs_main", "fs_main", surface_format, None,
        );
        let composite_uniform = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("post_composite_uniform"),
            size: std::mem::size_of::<PostProcessUniforms>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let composite_bg = make_composite_bg(
            device,
            &composite_bgl,
            &hdr_view,
            &bloom_mips[0].view,
            &ssao_final_view,
            &linear_sampler,
            &composite_uniform,
        );

        Self {
            width,
            height,
            sample_count,
            surface_format,
            linear_sampler,
            _hdr_texture: hdr_texture,
            hdr_view,
            msaa_hdr_color,
            depth_resolve_bgl,
            depth_resolve_pipeline,
            _resolved_depth_tex: resolved_depth_tex,
            resolved_depth_view,
            ssao_bgl,
            ssao_pipeline,
            ssao_blur_pipeline,
            ssao_uniform_gen,
            ssao_uniform_blur_h,
            ssao_uniform_blur_v,
            _ssao_raw_tex: ssao_raw_tex,
            ssao_raw_view,
            _ssao_tmp_tex: ssao_tmp_tex,
            ssao_tmp_view,
            _ssao_final_tex: ssao_final_tex,
            ssao_final_view,
            ssao_bg_gen,
            ssao_bg_blur_h,
            ssao_bg_blur_v,
            _white_ao_tex: white_ao_tex,
            white_ao_view,
            bloom_bgl,
            bloom_prefilter_pipeline,
            bloom_down_pipeline,
            bloom_up_pipeline,
            bloom_mips,
            bloom_down_uniforms,
            bloom_up_uniforms,
            bloom_down_bgs,
            bloom_up_bgs,
            composite_bgl,
            composite_pipeline,
            composite_uniform,
            composite_bg,
        }
    }

    pub(crate) fn resize(&mut self, device: &wgpu::Device, width: u32, height: u32) {
        self.width = width.max(1);
        self.height = height.max(1);
        let (hdr_tex, hdr_view) = create_hdr_target(device, self.width, self.height);
        self._hdr_texture = hdr_tex;
        self.hdr_view = hdr_view;
        self.msaa_hdr_color = create_msaa_hdr(device, self.width, self.height, self.sample_count);

        let (rd_tex, rd_view) = create_resolved_depth(device, self.width, self.height);
        self._resolved_depth_tex = rd_tex;
        self.resolved_depth_view = rd_view;

        let (hw, hh) = (self.width.div_ceil(2).max(1), self.height.div_ceil(2).max(1));
        let (raw_t, raw_v) = create_ssao_tex(device, hw, hh, "ssao_raw");
        let (tmp_t, tmp_v) = create_ssao_tex(device, hw, hh, "ssao_tmp");
        let (fin_t, fin_v) = create_ssao_tex(device, hw, hh, "ssao_final");
        self._ssao_raw_tex = raw_t;
        self.ssao_raw_view = raw_v;
        self._ssao_tmp_tex = tmp_t;
        self.ssao_tmp_view = tmp_v;
        self._ssao_final_tex = fin_t;
        self.ssao_final_view = fin_v;

        self.ssao_bg_gen = make_ssao_bg(device, &self.ssao_bgl, &self.resolved_depth_view, &self.white_ao_view, &self.linear_sampler, &self.ssao_uniform_gen);
        self.ssao_bg_blur_h = make_ssao_bg(device, &self.ssao_bgl, &self.resolved_depth_view, &self.ssao_raw_view, &self.linear_sampler, &self.ssao_uniform_blur_h);
        self.ssao_bg_blur_v = make_ssao_bg(device, &self.ssao_bgl, &self.resolved_depth_view, &self.ssao_tmp_view, &self.linear_sampler, &self.ssao_uniform_blur_v);

        self.bloom_mips = create_bloom_mips(device, self.width, self.height);
        let (down_bgs, up_bgs) = create_bloom_bind_groups(
            device,
            &self.bloom_bgl,
            &self.hdr_view,
            &self.bloom_mips,
            &self.linear_sampler,
            &self.bloom_down_uniforms,
            &self.bloom_up_uniforms,
        );
        self.bloom_down_bgs = down_bgs;
        self.bloom_up_bgs = up_bgs;

        self.composite_bg = make_composite_bg(
            device,
            &self.composite_bgl,
            &self.hdr_view,
            &self.bloom_mips[0].view,
            &self.ssao_final_view,
            &self.linear_sampler,
            &self.composite_uniform,
        );
    }

    pub(crate) fn scene_view(&self) -> &wgpu::TextureView {
        self.msaa_hdr_color.as_ref().map_or(&self.hdr_view, |(_, view)| view)
    }

    pub(crate) fn scene_resolve_target(&self) -> Option<&wgpu::TextureView> {
        self.msaa_hdr_color.as_ref().map(|_| &self.hdr_view)
    }

    pub(crate) fn prepare(
        &self,
        queue: &wgpu::Queue,
        proj: Mat4,
        settings: PostProcessSettings,
    ) {
        let tone_mode = match settings.tone_mapper {
            ToneMapper::None => 0.0,
            ToneMapper::AgX => 1.0,
            ToneMapper::Aces => 2.0,
            ToneMapper::Neutral => 3.0,
        };
        let ssao_strength = sanitize(settings.ssao_intensity, 0.0).clamp(0.0, 1.5);
        let bloom_intensity = sanitize(settings.bloom_intensity, 0.0).clamp(0.0, 2.0);
        let bloom_threshold = sanitize(settings.bloom_threshold, 1.05).clamp(0.0, 16.0);

        let composite = PostProcessUniforms {
            params: [
                sanitize(settings.exposure, 0.0).clamp(-16.0, 16.0),
                tone_mode,
                bloom_intensity,
                ssao_strength,
            ],
            flags: [
                if self.surface_format.is_srgb() { 1.0 } else { 0.0 },
                if settings.fxaa_enabled && self.sample_count == 1 { 1.0 } else { 0.0 },
                0.0,
                0.0,
            ],
        };
        queue.write_buffer(&self.composite_uniform, 0, bytemuck::bytes_of(&composite));

        if ssao_strength > 0.001 {
            let inv_proj = proj.inverse().to_cols_array_2d();
            let proj_arr = proj.to_cols_array_2d();
            let (hw, hh) = (self.width.div_ceil(2).max(1) as f32, self.height.div_ceil(2).max(1) as f32);
            let gen = SsaoUniforms {
                inv_proj,
                proj: proj_arr,
                params: [0.85, 0.04, ssao_strength, 0.0],
                texel_size: [1.0 / hw, 1.0 / hh, 0.0, 0.0],
            };
            let blur_h = SsaoUniforms {
                texel_size: [1.0 / hw, 1.0 / hh, 1.0, 0.0],
                ..gen
            };
            let blur_v = SsaoUniforms {
                texel_size: [1.0 / hw, 1.0 / hh, 0.0, 1.0],
                ..gen
            };
            queue.write_buffer(&self.ssao_uniform_gen, 0, bytemuck::bytes_of(&gen));
            queue.write_buffer(&self.ssao_uniform_blur_h, 0, bytemuck::bytes_of(&blur_h));
            queue.write_buffer(&self.ssao_uniform_blur_v, 0, bytemuck::bytes_of(&blur_v));
        }

        if bloom_intensity > 0.0001 {
            let knee = (bloom_threshold * 0.5).max(0.15);
            for (idx, buf) in self.bloom_down_uniforms.iter().enumerate() {
                let (sw, sh) = if idx == 0 {
                    (self.width, self.height)
                } else {
                    (self.bloom_mips[idx - 1].width, self.bloom_mips[idx - 1].height)
                };
                let u = BloomUniforms {
                    texel_size: [1.0 / sw.max(1) as f32, 1.0 / sh.max(1) as f32],
                    threshold: bloom_threshold,
                    knee,
                };
                queue.write_buffer(buf, 0, bytemuck::bytes_of(&u));
            }
            for (idx, buf) in self.bloom_up_uniforms.iter().enumerate() {
                let src = &self.bloom_mips[idx + 1];
                let u = BloomUniforms {
                    texel_size: [1.0 / src.width.max(1) as f32, 1.0 / src.height.max(1) as f32],
                    threshold: bloom_threshold,
                    knee,
                };
                queue.write_buffer(buf, 0, bytemuck::bytes_of(&u));
            }
        }
    }

    pub(crate) fn encode(
        &self,
        device: &wgpu::Device,
        encoder: &mut wgpu::CommandEncoder,
        scene_depth_only_view: &wgpu::TextureView,
        output_view: &wgpu::TextureView,
        settings: PostProcessSettings,
        timestamp_writes: Option<wgpu::RenderPassTimestampWrites<'_>>,
    ) {
        // 1. Optional SSAO (depth resolve + half-res AO + H/V bilateral blur)
        if settings.ssao_intensity > 0.001 {
            let depth_bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("depth_resolve_bg"),
                layout: &self.depth_resolve_bgl,
                entries: &[wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(scene_depth_only_view),
                }],
            });
            run_fs_pass(encoder, "depth_resolve", &self.resolved_depth_view, &self.depth_resolve_pipeline, &depth_bg, false, None);
            run_fs_pass(encoder, "ssao_generate", &self.ssao_raw_view, &self.ssao_pipeline, &self.ssao_bg_gen, false, None);
            run_fs_pass(encoder, "ssao_blur_h", &self.ssao_tmp_view, &self.ssao_blur_pipeline, &self.ssao_bg_blur_h, false, None);
            run_fs_pass(encoder, "ssao_blur_v", &self.ssao_final_view, &self.ssao_blur_pipeline, &self.ssao_bg_blur_v, false, None);
        }

        // 2. Optional 5-mip Dual-Kawase HDR Bloom
        if settings.bloom_intensity > 0.0001 {
            run_fs_pass(
                encoder,
                "bloom_prefilter",
                &self.bloom_mips[0].view,
                &self.bloom_prefilter_pipeline,
                &self.bloom_down_bgs[0],
                false,
                None,
            );
            for mip in 1..BLOOM_MIPS {
                run_fs_pass(
                    encoder,
                    "bloom_downsample",
                    &self.bloom_mips[mip].view,
                    &self.bloom_down_pipeline,
                    &self.bloom_down_bgs[mip],
                    false,
                    None,
                );
            }
            for mip in (0..BLOOM_MIPS - 1).rev() {
                run_fs_pass(
                    encoder,
                    "bloom_upsample",
                    &self.bloom_mips[mip].view,
                    &self.bloom_up_pipeline,
                    &self.bloom_up_bgs[mip],
                    true, // additive load onto existing mip
                    None,
                );
            }
        }

        // 3. Final single-sample composite (SSAO + Bloom + AgX/ACES + FXAA + sRGB OETF)
        run_fs_pass(
            encoder,
            "post_composite",
            output_view,
            &self.composite_pipeline,
            &self.composite_bg,
            false,
            timestamp_writes,
        );
    }
}

fn run_fs_pass(
    encoder: &mut wgpu::CommandEncoder,
    label: &str,
    target_view: &wgpu::TextureView,
    pipeline: &wgpu::RenderPipeline,
    bind_group: &wgpu::BindGroup,
    load_existing: bool,
    timestamp_writes: Option<wgpu::RenderPassTimestampWrites<'_>>,
) {
    let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
        label: Some(label),
        timestamp_writes,
        color_attachments: &[Some(wgpu::RenderPassColorAttachment {
            view: target_view,
            resolve_target: None,
            ops: wgpu::Operations {
                load: if load_existing { wgpu::LoadOp::Load } else { wgpu::LoadOp::Clear(wgpu::Color::BLACK) },
                store: wgpu::StoreOp::Store,
            },
        })],
        depth_stencil_attachment: None,
        ..Default::default()
    });
    pass.set_pipeline(pipeline);
    pass.set_bind_group(0, bind_group, &[]);
    pass.draw(0..3, 0..1);
}

#[allow(clippy::too_many_arguments)]
fn fullscreen_pipeline(
    device: &wgpu::Device,
    label: &str,
    layout: &wgpu::PipelineLayout,
    module: &wgpu::ShaderModule,
    vs: &str,
    fs: &str,
    format: wgpu::TextureFormat,
    blend: Option<wgpu::BlendState>,
) -> wgpu::RenderPipeline {
    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some(label),
        layout: Some(layout),
        vertex: wgpu::VertexState {
            module,
            entry_point: Some(vs),
            buffers: &[],
            compilation_options: Default::default(),
        },
        fragment: Some(wgpu::FragmentState {
            module,
            entry_point: Some(fs),
            targets: &[Some(wgpu::ColorTargetState {
                format,
                blend,
                write_mask: wgpu::ColorWrites::ALL,
            })],
            compilation_options: Default::default(),
        }),
        primitive: wgpu::PrimitiveState {
            topology: wgpu::PrimitiveTopology::TriangleList,
            cull_mode: None,
            ..Default::default()
        },
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        multiview: None,
        cache: None,
    })
}

fn create_hdr_target(device: &wgpu::Device, width: u32, height: u32) -> (wgpu::Texture, wgpu::TextureView) {
    let tex = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("forward_hdr_color"),
        size: wgpu::Extent3d { width: width.max(1), height: height.max(1), depth_or_array_layers: 1 },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: HDR_COLOR_FORMAT,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
        view_formats: &[],
    });
    let view = tex.create_view(&Default::default());
    (tex, view)
}

fn create_msaa_hdr(device: &wgpu::Device, width: u32, height: u32, sample_count: u32) -> Option<(wgpu::Texture, wgpu::TextureView)> {
    if sample_count <= 1 {
        return None;
    }
    let tex = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("msaa_scene_hdr"),
        size: wgpu::Extent3d { width: width.max(1), height: height.max(1), depth_or_array_layers: 1 },
        mip_level_count: 1,
        sample_count,
        dimension: wgpu::TextureDimension::D2,
        format: HDR_COLOR_FORMAT,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
        view_formats: &[],
    });
    let view = tex.create_view(&Default::default());
    Some((tex, view))
}

fn create_resolved_depth(device: &wgpu::Device, width: u32, height: u32) -> (wgpu::Texture, wgpu::TextureView) {
    let tex = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("resolved_scene_depth_r32f"),
        size: wgpu::Extent3d { width: width.max(1), height: height.max(1), depth_or_array_layers: 1 },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: DEPTH_RESOLVED_FORMAT,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
        view_formats: &[],
    });
    let view = tex.create_view(&Default::default());
    (tex, view)
}

fn create_ssao_tex(device: &wgpu::Device, width: u32, height: u32, label: &str) -> (wgpu::Texture, wgpu::TextureView) {
    let tex = device.create_texture(&wgpu::TextureDescriptor {
        label: Some(label),
        size: wgpu::Extent3d { width: width.max(1), height: height.max(1), depth_or_array_layers: 1 },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: SSAO_FORMAT,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
        view_formats: &[],
    });
    let view = tex.create_view(&Default::default());
    (tex, view)
}

fn create_white_r8(device: &wgpu::Device) -> (wgpu::Texture, wgpu::TextureView) {
    let tex = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("ssao_dummy_r8"),
        size: wgpu::Extent3d { width: 1, height: 1, depth_or_array_layers: 1 },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: SSAO_FORMAT,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::RENDER_ATTACHMENT,
        view_formats: &[],
    });
    let view = tex.create_view(&Default::default());
    (tex, view)
}

fn create_bloom_mips(device: &wgpu::Device, width: u32, height: u32) -> Vec<BloomMip> {
    let mut mips = Vec::with_capacity(BLOOM_MIPS);
    let mut mw = width.div_ceil(2).max(1);
    let mut mh = height.div_ceil(2).max(1);
    for _ in 0..BLOOM_MIPS {
        let tex = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("bloom_mip"),
            size: wgpu::Extent3d { width: mw, height: mh, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: HDR_COLOR_FORMAT,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        let view = tex.create_view(&Default::default());
        mips.push(BloomMip { _texture: tex, view, width: mw, height: mh });
        mw = mw.div_ceil(2).max(1);
        mh = mh.div_ceil(2).max(1);
    }
    mips
}

fn create_bloom_bind_groups(
    device: &wgpu::Device,
    layout: &wgpu::BindGroupLayout,
    hdr_view: &wgpu::TextureView,
    mips: &[BloomMip],
    sampler: &wgpu::Sampler,
    down_uniforms: &[wgpu::Buffer],
    up_uniforms: &[wgpu::Buffer],
) -> (Vec<wgpu::BindGroup>, Vec<wgpu::BindGroup>) {
    let make = |src: &wgpu::TextureView, buf: &wgpu::Buffer| {
        device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("bloom_bg"),
            layout,
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(src) },
                wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::Sampler(sampler) },
                wgpu::BindGroupEntry { binding: 2, resource: buf.as_entire_binding() },
            ],
        })
    };
    let mut down = Vec::with_capacity(BLOOM_MIPS);
    down.push(make(hdr_view, &down_uniforms[0]));
    for i in 1..BLOOM_MIPS {
        down.push(make(&mips[i - 1].view, &down_uniforms[i]));
    }
    let mut up = Vec::with_capacity(BLOOM_MIPS - 1);
    for i in 0..BLOOM_MIPS - 1 {
        up.push(make(&mips[i + 1].view, &up_uniforms[i]));
    }
    (down, up)
}

fn make_ssao_bg(
    device: &wgpu::Device,
    layout: &wgpu::BindGroupLayout,
    depth_view: &wgpu::TextureView,
    ssao_view: &wgpu::TextureView,
    sampler: &wgpu::Sampler,
    uniform: &wgpu::Buffer,
) -> wgpu::BindGroup {
    device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("ssao_bg"),
        layout,
        entries: &[
            wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(depth_view) },
            wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::TextureView(ssao_view) },
            wgpu::BindGroupEntry { binding: 2, resource: wgpu::BindingResource::Sampler(sampler) },
            wgpu::BindGroupEntry { binding: 3, resource: uniform.as_entire_binding() },
        ],
    })
}

fn make_composite_bg(
    device: &wgpu::Device,
    layout: &wgpu::BindGroupLayout,
    hdr_view: &wgpu::TextureView,
    bloom_view: &wgpu::TextureView,
    ssao_view: &wgpu::TextureView,
    sampler: &wgpu::Sampler,
    uniform: &wgpu::Buffer,
) -> wgpu::BindGroup {
    device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("post_composite_bg"),
        layout,
        entries: &[
            wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::TextureView(hdr_view) },
            wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::TextureView(bloom_view) },
            wgpu::BindGroupEntry { binding: 2, resource: wgpu::BindingResource::TextureView(ssao_view) },
            wgpu::BindGroupEntry { binding: 3, resource: wgpu::BindingResource::Sampler(sampler) },
            wgpu::BindGroupEntry { binding: 4, resource: uniform.as_entire_binding() },
        ],
    })
}

fn sanitize(v: f32, fallback: f32) -> f32 {
    if v.is_finite() { v } else { fallback }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_post_process_shaders_validate() {
        for (name, src) in [
            ("depth_resolve_single", DEPTH_RESOLVE_SINGLE_WGSL),
            ("depth_resolve_msaa", DEPTH_RESOLVE_MSAA_WGSL),
            ("ssao", SSAO_WGSL),
            ("bloom", BLOOM_WGSL),
            ("post_process", POST_PROCESS_WGSL),
        ] {
            let module = naga::front::wgsl::parse_str(src)
                .unwrap_or_else(|e| panic!("{name} failed to parse: {e}"));
            naga::valid::Validator::new(
                naga::valid::ValidationFlags::all(),
                naga::valid::Capabilities::all(),
            )
            .validate(&module)
            .unwrap_or_else(|e| panic!("{name} failed to validate: {e}"));
        }
    }
}
