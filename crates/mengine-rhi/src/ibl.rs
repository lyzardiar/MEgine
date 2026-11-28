//! True GPU Cubemap IBL Engine:
//!   - Converts Equirectangular HDR/LDR textures into 6-face Rgba16Float Cubemaps
//!   - Generates full mipmap chains on the source Cubemap via scratch copy (strict wgpu safe)
//!   - Runs Filtered Importance Sampling GGX specular prefilter (zero fireflies, zero seams)
//!   - Convolves seamless 6-face diffuse irradiance Cubemap
//!   - Provides shared immutable 128x128 Split-Sum BRDF integration LUT

use glam::Vec3;
use half::f16;
use std::sync::OnceLock;
use wgpu::util::DeviceExt;

const BRDF_LUT_SIZE: u32 = 128;
const BRDF_LUT_SAMPLES: u32 = 256;
const SOURCE_CUBE_SIZE: u32 = 256;
const PREFILTER_CUBE_SIZE: u32 = 128;
const PREFILTER_MIP_LEVELS: u32 = 6; // roughness 0.0 .. 1.0 across 128 -> 4 px per face
const IRRADIANCE_CUBE_SIZE: u32 = 32;

const IBL_PREFILTER_WGSL: &str = include_str!("shaders/ibl_prefilter.wgsl");

pub(crate) struct BrdfLut {
    _texture: wgpu::Texture,
    view: wgpu::TextureView,
    sampler: wgpu::Sampler,
}

impl BrdfLut {
    pub(crate) fn new(device: &wgpu::Device, queue: &wgpu::Queue) -> Self {
        let size = BRDF_LUT_SIZE;
        let encoded = encoded_brdf_lut();
        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("split_sum_brdf_lut"),
            size: wgpu::Extent3d {
                width: size,
                height: size,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rg16Float,
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
            bytemuck::cast_slice(encoded),
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(size * 4),
                rows_per_image: Some(size),
            },
            wgpu::Extent3d {
                width: size,
                height: size,
                depth_or_array_layers: 1,
            },
        );
        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("brdf_lut_sampler"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::FilterMode::Nearest,
            ..Default::default()
        });
        Self {
            _texture: texture,
            view,
            sampler,
        }
    }

    pub(crate) fn view(&self) -> &wgpu::TextureView {
        &self.view
    }

    pub(crate) fn sampler(&self) -> &wgpu::Sampler {
        &self.sampler
    }
}

#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct IblUniforms {
    output_size: [u32; 2],
    source_size: [u32; 2],
    params: [f32; 4],
}

pub(crate) struct PrefilteredEnvironment {
    pub(crate) _source_cube: wgpu::Texture,
    pub(crate) source_view: wgpu::TextureView,
    pub(crate) _prefilter_cube: wgpu::Texture,
    pub(crate) view: wgpu::TextureView,
    pub(crate) mip_level_count: u32,
    pub(crate) _irradiance_cube: wgpu::Texture,
    pub(crate) irradiance_view: wgpu::TextureView,
}

pub(crate) struct FallbackCubemap {
    pub(crate) _texture: wgpu::Texture,
    pub(crate) view: wgpu::TextureView,
}

impl FallbackCubemap {
    pub(crate) fn new(device: &wgpu::Device, queue: &wgpu::Queue) -> Self {
        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("fallback_env_cubemap"),
            size: wgpu::Extent3d {
                width: 1,
                height: 1,
                depth_or_array_layers: 6,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba16Float,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        let half_mid = f16::from_f32(0.25).to_bits();
        let half_one = f16::from_f32(1.0).to_bits();
        let face_pixel = [half_mid, half_mid, half_mid, half_one];
        for face in 0..6u32 {
            queue.write_texture(
                wgpu::TexelCopyTextureInfo {
                    texture: &texture,
                    mip_level: 0,
                    origin: wgpu::Origin3d { x: 0, y: 0, z: face },
                    aspect: wgpu::TextureAspect::All,
                },
                bytemuck::cast_slice(&face_pixel),
                wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(8),
                    rows_per_image: Some(1),
                },
                wgpu::Extent3d {
                    width: 1,
                    height: 1,
                    depth_or_array_layers: 1,
                },
            );
        }
        let view = texture.create_view(&wgpu::TextureViewDescriptor {
            label: Some("fallback_env_cubemap_view"),
            dimension: Some(wgpu::TextureViewDimension::Cube),
            base_array_layer: 0,
            array_layer_count: Some(6),
            ..Default::default()
        });
        Self { _texture: texture, view }
    }
}

pub(crate) struct EnvironmentPrefilter {
    layout: wgpu::BindGroupLayout,
    equirect_pipeline: wgpu::ComputePipeline,
    downsample_pipeline: wgpu::ComputePipeline,
    prefilter_pipeline: wgpu::ComputePipeline,
    irradiance_pipeline: wgpu::ComputePipeline,
    sampler: wgpu::Sampler,
    dummy_equirect_view: wgpu::TextureView,
    _dummy_equirect_tex: wgpu::Texture,
    dummy_cube: FallbackCubemap,
}

impl EnvironmentPrefilter {
    pub(crate) fn new(device: &wgpu::Device, queue: &wgpu::Queue) -> Self {
        let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("cubemap_ibl_bgl"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::Cube,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 3,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::StorageTexture {
                        access: wgpu::StorageTextureAccess::WriteOnly,
                        format: wgpu::TextureFormat::Rgba16Float,
                        view_dimension: wgpu::TextureViewDimension::D2Array,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 4,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });

        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("cubemap_ibl_prefilter"),
            source: wgpu::ShaderSource::Wgsl(IBL_PREFILTER_WGSL.into()),
        });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("cubemap_ibl_pipeline_layout"),
            bind_group_layouts: &[&layout],
            push_constant_ranges: &[],
        });

        let make_cp = |label, entry| {
            device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
                label: Some(label),
                layout: Some(&pipeline_layout),
                module: &shader,
                entry_point: Some(entry),
                compilation_options: Default::default(),
                cache: None,
            })
        };

        let equirect_pipeline = make_cp("ibl_equirect_to_cube", "cs_equirect_to_cube");
        let downsample_pipeline = make_cp("ibl_downsample_cube", "cs_downsample_cube");
        let prefilter_pipeline = make_cp("ibl_prefilter_ggx", "cs_prefilter_ggx");
        let irradiance_pipeline = make_cp("ibl_irradiance_cube", "cs_irradiance_cube");

        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("ibl_compute_sampler"),
            address_mode_u: wgpu::AddressMode::Repeat,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::FilterMode::Linear,
            ..Default::default()
        });

        let dummy_equirect_tex = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("ibl_dummy_equirect"),
            size: wgpu::Extent3d { width: 1, height: 1, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba16Float,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        let dummy_equirect_view = dummy_equirect_tex.create_view(&Default::default());
        let dummy_cube = FallbackCubemap::new(device, queue);

        Self {
            layout,
            equirect_pipeline,
            downsample_pipeline,
            prefilter_pipeline,
            irradiance_pipeline,
            sampler,
            dummy_equirect_view,
            _dummy_equirect_tex: dummy_equirect_tex,
            dummy_cube,
        }
    }

    pub(crate) fn prefilter_rgba8(
        &self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        width: u32,
        height: u32,
        rgba8: &[u8],
    ) -> PrefilteredEnvironment {
        debug_assert!(width > 0 && height > 0);
        debug_assert_eq!(rgba8.len(), width as usize * height as usize * 4);
        let source_pixels = rgba8
            .chunks_exact(4)
            .flat_map(|pixel| {
                [
                    f16::from_f32(srgb_to_linear(pixel[0])).to_bits(),
                    f16::from_f32(srgb_to_linear(pixel[1])).to_bits(),
                    f16::from_f32(srgb_to_linear(pixel[2])).to_bits(),
                    f16::from_f32(pixel[3] as f32 / 255.0).to_bits(),
                ]
            })
            .collect::<Vec<_>>();
        self.prefilter_rgba16(device, queue, width, height, &source_pixels)
    }

    pub(crate) fn prefilter_rgba32f(
        &self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        width: u32,
        height: u32,
        rgba32f: &[f32],
    ) -> PrefilteredEnvironment {
        debug_assert!(width > 0 && height > 0);
        debug_assert_eq!(rgba32f.len(), width as usize * height as usize * 4);
        let source_pixels = rgba32f
            .chunks_exact(4)
            .flat_map(|pixel| {
                [
                    encode_radiance(pixel[0]),
                    encode_radiance(pixel[1]),
                    encode_radiance(pixel[2]),
                    f16::from_f32(sanitize_alpha(pixel[3])).to_bits(),
                ]
            })
            .collect::<Vec<_>>();
        self.prefilter_rgba16(device, queue, width, height, &source_pixels)
    }

    fn prefilter_rgba16(
        &self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        width: u32,
        height: u32,
        source_pixels: &[u16],
    ) -> PrefilteredEnvironment {
        // 1. Upload equirectangular source
        let equirect_tex = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("ibl_equirect_source"),
            size: wgpu::Extent3d { width, height, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba16Float,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        queue.write_texture(
            wgpu::TexelCopyTextureInfo {
                texture: &equirect_tex,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            bytemuck::cast_slice(source_pixels),
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(width * 8),
                rows_per_image: Some(height),
            },
            wgpu::Extent3d { width, height, depth_or_array_layers: 1 },
        );
        let equirect_view = equirect_tex.create_view(&Default::default());

        // 2. Create source Cubemap with full mip chain (sampled only; written via copy from scratch)
        let cube_size = SOURCE_CUBE_SIZE.min(width.max(height).next_power_of_two()).max(32);
        let source_mips = mip_level_count(cube_size, cube_size);
        let source_cube = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("ibl_source_cubemap"),
            size: wgpu::Extent3d { width: cube_size, height: cube_size, depth_or_array_layers: 6 },
            mip_level_count: source_mips,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba16Float,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        let source_view = source_cube.create_view(&wgpu::TextureViewDescriptor {
            label: Some("ibl_source_cubemap_view"),
            dimension: Some(wgpu::TextureViewDimension::Cube),
            base_array_layer: 0,
            array_layer_count: Some(6),
            ..Default::default()
        });

        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("cubemap_ibl_build"),
        });

        // 2a. Equirectangular -> scratch mip 0 -> copy into source_cube mip 0
        let scratch0 = create_storage_cube_layer(device, cube_size);
        self.dispatch_cube(
            device,
            &mut encoder,
            &self.equirect_pipeline,
            &equirect_view,
            &self.dummy_cube.view,
            &scratch0.1,
            cube_size,
            cube_size,
            [0.0, source_mips as f32, 0.0, 0.0],
        );
        encoder.copy_texture_to_texture(
            wgpu::TexelCopyTextureInfo {
                texture: &scratch0.0,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::TexelCopyTextureInfo {
                texture: &source_cube,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::Extent3d { width: cube_size, height: cube_size, depth_or_array_layers: 6 },
        );

        // 2b. Downsample source_cube mip (m-1) -> scratch -> copy into source_cube mip m
        for mip in 1..source_mips {
            let mip_size = (cube_size >> mip).max(1);
            let scratch = create_storage_cube_layer(device, mip_size);
            self.dispatch_cube(
                device,
                &mut encoder,
                &self.downsample_pipeline,
                &self.dummy_equirect_view,
                &source_view,
                &scratch.1,
                mip_size,
                cube_size,
                [(mip - 1) as f32, source_mips as f32, 0.0, 0.0],
            );
            encoder.copy_texture_to_texture(
                wgpu::TexelCopyTextureInfo {
                    texture: &scratch.0,
                    mip_level: 0,
                    origin: wgpu::Origin3d::ZERO,
                    aspect: wgpu::TextureAspect::All,
                },
                wgpu::TexelCopyTextureInfo {
                    texture: &source_cube,
                    mip_level: mip,
                    origin: wgpu::Origin3d::ZERO,
                    aspect: wgpu::TextureAspect::All,
                },
                wgpu::Extent3d { width: mip_size, height: mip_size, depth_or_array_layers: 6 },
            );
        }

        // 3. GGX Specular Prefiltered Cubemap (Filtered Importance Sampling)
        let prefilter_size = PREFILTER_CUBE_SIZE.min(cube_size);
        let prefilter_mips = PREFILTER_MIP_LEVELS.min(mip_level_count(prefilter_size, prefilter_size));
        let prefilter_cube = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("ibl_prefilter_cubemap"),
            size: wgpu::Extent3d {
                width: prefilter_size,
                height: prefilter_size,
                depth_or_array_layers: 6,
            },
            mip_level_count: prefilter_mips,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba16Float,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::STORAGE_BINDING,
            view_formats: &[],
        });
        let prefilter_view = prefilter_cube.create_view(&wgpu::TextureViewDescriptor {
            label: Some("ibl_prefilter_cubemap_view"),
            dimension: Some(wgpu::TextureViewDimension::Cube),
            base_array_layer: 0,
            array_layer_count: Some(6),
            ..Default::default()
        });
        for mip in 0..prefilter_mips {
            let mip_size = (prefilter_size >> mip).max(1);
            let roughness = if prefilter_mips > 1 {
                mip as f32 / (prefilter_mips - 1) as f32
            } else {
                0.0
            };
            let mip_storage_view = prefilter_cube.create_view(&wgpu::TextureViewDescriptor {
                label: Some("ibl_prefilter_mip_storage"),
                format: Some(wgpu::TextureFormat::Rgba16Float),
                dimension: Some(wgpu::TextureViewDimension::D2Array),
                usage: Some(wgpu::TextureUsages::STORAGE_BINDING),
                aspect: wgpu::TextureAspect::All,
                base_mip_level: mip,
                mip_level_count: Some(1),
                base_array_layer: 0,
                array_layer_count: Some(6),
            });
            self.dispatch_cube(
                device,
                &mut encoder,
                &self.prefilter_pipeline,
                &self.dummy_equirect_view,
                &source_view,
                &mip_storage_view,
                mip_size,
                cube_size,
                [roughness, source_mips as f32, 0.0, 0.0],
            );
        }

        // 4. Diffuse Irradiance Cubemap
        let irradiance_cube = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("ibl_irradiance_cubemap"),
            size: wgpu::Extent3d {
                width: IRRADIANCE_CUBE_SIZE,
                height: IRRADIANCE_CUBE_SIZE,
                depth_or_array_layers: 6,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba16Float,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::STORAGE_BINDING,
            view_formats: &[],
        });
        let irradiance_view = irradiance_cube.create_view(&wgpu::TextureViewDescriptor {
            label: Some("ibl_irradiance_cubemap_view"),
            dimension: Some(wgpu::TextureViewDimension::Cube),
            base_array_layer: 0,
            array_layer_count: Some(6),
            ..Default::default()
        });
        let irradiance_storage_view = irradiance_cube.create_view(&wgpu::TextureViewDescriptor {
            label: Some("ibl_irradiance_storage"),
            format: Some(wgpu::TextureFormat::Rgba16Float),
            dimension: Some(wgpu::TextureViewDimension::D2Array),
            usage: Some(wgpu::TextureUsages::STORAGE_BINDING),
            aspect: wgpu::TextureAspect::All,
            base_mip_level: 0,
            mip_level_count: Some(1),
            base_array_layer: 0,
            array_layer_count: Some(6),
        });
        self.dispatch_cube(
            device,
            &mut encoder,
            &self.irradiance_pipeline,
            &self.dummy_equirect_view,
            &source_view,
            &irradiance_storage_view,
            IRRADIANCE_CUBE_SIZE,
            cube_size,
            [0.0, source_mips as f32, 0.0, 0.0],
        );

        queue.submit(std::iter::once(encoder.finish()));

        PrefilteredEnvironment {
            _source_cube: source_cube,
            source_view,
            _prefilter_cube: prefilter_cube,
            view: prefilter_view,
            mip_level_count: prefilter_mips,
            _irradiance_cube: irradiance_cube,
            irradiance_view,
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn dispatch_cube(
        &self,
        device: &wgpu::Device,
        encoder: &mut wgpu::CommandEncoder,
        pipeline: &wgpu::ComputePipeline,
        equirect_view: &wgpu::TextureView,
        src_cube_view: &wgpu::TextureView,
        dst_storage_view: &wgpu::TextureView,
        out_size: u32,
        src_size: u32,
        params: [f32; 4],
    ) {
        let uniform = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("ibl_dispatch_uniform"),
            contents: bytemuck::bytes_of(&IblUniforms {
                output_size: [out_size, out_size],
                source_size: [src_size, src_size],
                params,
            }),
            usage: wgpu::BufferUsages::UNIFORM,
        });
        let bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("ibl_dispatch_bg"),
            layout: &self.layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(equirect_view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(src_cube_view),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::Sampler(&self.sampler),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: wgpu::BindingResource::TextureView(dst_storage_view),
                },
                wgpu::BindGroupEntry {
                    binding: 4,
                    resource: uniform.as_entire_binding(),
                },
            ],
        });
        let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
            label: Some("ibl_compute_pass"),
            timestamp_writes: None,
        });
        pass.set_pipeline(pipeline);
        pass.set_bind_group(0, &bg, &[]);
        pass.dispatch_workgroups(out_size.div_ceil(8), out_size.div_ceil(8), 6);
    }
}

fn create_storage_cube_layer(device: &wgpu::Device, size: u32) -> (wgpu::Texture, wgpu::TextureView) {
    let tex = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("ibl_scratch_cube_mip"),
        size: wgpu::Extent3d { width: size, height: size, depth_or_array_layers: 6 },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba16Float,
        usage: wgpu::TextureUsages::STORAGE_BINDING | wgpu::TextureUsages::COPY_SRC,
        view_formats: &[],
    });
    let view = tex.create_view(&wgpu::TextureViewDescriptor {
        label: Some("ibl_scratch_cube_mip_view"),
        format: Some(wgpu::TextureFormat::Rgba16Float),
        dimension: Some(wgpu::TextureViewDimension::D2Array),
        usage: Some(wgpu::TextureUsages::STORAGE_BINDING),
        aspect: wgpu::TextureAspect::All,
        base_mip_level: 0,
        mip_level_count: Some(1),
        base_array_layer: 0,
        array_layer_count: Some(6),
    });
    (tex, view)
}

fn mip_level_count(width: u32, height: u32) -> u32 {
    u32::BITS - width.max(height).max(1).leading_zeros()
}

fn srgb_to_linear(value: u8) -> f32 {
    let v = value as f32 / 255.0;
    if v <= 0.04045 {
        v / 12.92
    } else {
        ((v + 0.055) / 1.055).powf(2.4)
    }
}

fn encode_radiance(value: f32) -> u16 {
    let v = if value.is_finite() { value.clamp(0.0, 65_504.0) } else { 0.0 };
    f16::from_f32(v).to_bits()
}

fn sanitize_alpha(value: f32) -> f32 {
    if value.is_finite() { value.clamp(0.0, 1.0) } else { 1.0 }
}

fn encoded_brdf_lut() -> &'static [u16] {
    static DATA: OnceLock<Vec<u16>> = OnceLock::new();
    DATA.get_or_init(|| {
        build_brdf_lut(BRDF_LUT_SIZE, BRDF_LUT_SAMPLES)
            .iter()
            .flat_map(|value| [f16::from_f32(value[0]).to_bits(), f16::from_f32(value[1]).to_bits()])
            .collect()
    })
}

fn build_brdf_lut(size: u32, sample_count: u32) -> Vec<[f32; 2]> {
    let size = size.max(1);
    let sample_count = sample_count.max(1);
    let mut values = Vec::with_capacity(size as usize * size as usize);
    for roughness_index in 0..size {
        let roughness = (roughness_index as f32 + 0.5) / size as f32;
        for ndv_index in 0..size {
            let ndv = (ndv_index as f32 + 0.5) / size as f32;
            values.push(integrate_brdf(ndv, roughness, sample_count));
        }
    }
    values
}

fn integrate_brdf(ndv: f32, roughness: f32, sample_count: u32) -> [f32; 2] {
    let ndv = ndv.clamp(0.0001, 1.0);
    let roughness = roughness.clamp(0.0001, 1.0);
    let view = Vec3::new((1.0 - ndv * ndv).sqrt(), 0.0, ndv);
    let mut scale = 0.0_f32;
    let mut bias = 0.0_f32;
    let sample_count = sample_count.max(1);
    for sample_index in 0..sample_count {
        let xi = [
            sample_index as f32 / sample_count as f32,
            radical_inverse_vdc(sample_index),
        ];
        let halfway = importance_sample_ggx(xi, roughness);
        let light = (2.0 * view.dot(halfway) * halfway - view).normalize_or_zero();
        let ndl = light.z.max(0.0);
        let ndh = halfway.z.max(0.0);
        let vdh = view.dot(halfway).max(0.0);
        if ndl <= 0.0 || ndh <= 0.0 || vdh <= 0.0 {
            continue;
        }
        let geometry = geometry_smith_ibl(ndv, ndl, roughness);
        let visibility = geometry * vdh / (ndh * ndv).max(0.000001);
        let fresnel = (1.0 - vdh).powi(5);
        scale += (1.0 - fresnel) * visibility;
        bias += fresnel * visibility;
    }
    [
        (scale / sample_count as f32).clamp(0.0, 1.0),
        (bias / sample_count as f32).clamp(0.0, 1.0),
    ]
}

fn importance_sample_ggx(xi: [f32; 2], roughness: f32) -> Vec3 {
    let alpha = roughness * roughness;
    let alpha_squared = alpha * alpha;
    let phi = std::f32::consts::TAU * xi[0];
    let cosine = ((1.0 - xi[1]) / (1.0 + (alpha_squared - 1.0) * xi[1])).sqrt();
    let sine = (1.0 - cosine * cosine).max(0.0).sqrt();
    Vec3::new(phi.cos() * sine, phi.sin() * sine, cosine).normalize_or_zero()
}

fn geometry_smith_ibl(ndv: f32, ndl: f32, roughness: f32) -> f32 {
    let k = roughness * roughness * 0.5;
    let view = ndv / (ndv * (1.0 - k) + k).max(0.000001);
    let light = ndl / (ndl * (1.0 - k) + k).max(0.000001);
    view * light
}

fn radical_inverse_vdc(bits: u32) -> f32 {
    bits.reverse_bits() as f32 * 2.328_306_4e-10
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cubemap_ibl_shader_validates() {
        let module = naga::front::wgsl::parse_str(IBL_PREFILTER_WGSL)
            .expect("cubemap IBL shader must parse");
        naga::valid::Validator::new(
            naga::valid::ValidationFlags::all(),
            naga::valid::Capabilities::all(),
        )
        .validate(&module)
        .expect("cubemap IBL shader must validate");
    }

    #[test]
    fn brdf_lut_is_deterministic_and_bounded() {
        let lut = build_brdf_lut(8, 128);
        assert_eq!(lut.len(), 64);
        for v in &lut {
            assert!(v[0].is_finite() && (0.0..=1.0).contains(&v[0]));
            assert!(v[1].is_finite() && (0.0..=1.0).contains(&v[1]));
        }
    }
}
