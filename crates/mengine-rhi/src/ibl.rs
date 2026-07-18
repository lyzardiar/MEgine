use glam::Vec3;
use half::f16;
use wgpu::util::DeviceExt;

const BRDF_LUT_SIZE: u32 = 128;
const BRDF_LUT_SAMPLES: u32 = 256;
const ENVIRONMENT_MAX_WIDTH: u32 = 1024;
const ENVIRONMENT_MAX_HEIGHT: u32 = 512;
const IRRADIANCE_WIDTH: u32 = 64;
const IRRADIANCE_HEIGHT: u32 = 32;

pub(crate) struct BrdfLut {
    _texture: wgpu::Texture,
    view: wgpu::TextureView,
    sampler: wgpu::Sampler,
}

impl BrdfLut {
    pub(crate) fn new(device: &wgpu::Device, queue: &wgpu::Queue) -> Self {
        let size = BRDF_LUT_SIZE;
        let integrated = build_brdf_lut(size, BRDF_LUT_SAMPLES);
        let encoded = integrated
            .iter()
            .flat_map(|value| {
                [
                    f16::from_f32(value[0]).to_bits(),
                    f16::from_f32(value[1]).to_bits(),
                ]
            })
            .collect::<Vec<_>>();
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
            bytemuck::cast_slice(&encoded),
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
struct EnvironmentPrefilterUniforms {
    output_size: [u32; 2],
    params: [f32; 2],
}

pub(crate) struct PrefilteredEnvironment {
    pub(crate) _texture: wgpu::Texture,
    pub(crate) view: wgpu::TextureView,
    pub(crate) mip_level_count: u32,
    pub(crate) _irradiance_texture: wgpu::Texture,
    pub(crate) irradiance_view: wgpu::TextureView,
}

pub(crate) struct EnvironmentPrefilter {
    layout: wgpu::BindGroupLayout,
    prefilter_pipeline: wgpu::ComputePipeline,
    irradiance_pipeline: wgpu::ComputePipeline,
    sampler: wgpu::Sampler,
}

impl EnvironmentPrefilter {
    pub(crate) fn new(device: &wgpu::Device) -> Self {
        let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("environment_prefilter_bgl"),
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
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::StorageTexture {
                        access: wgpu::StorageTextureAccess::WriteOnly,
                        format: wgpu::TextureFormat::Rgba16Float,
                        view_dimension: wgpu::TextureViewDimension::D2,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 3,
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
            label: Some("environment_ggx_prefilter"),
            source: wgpu::ShaderSource::Wgsl(ENVIRONMENT_PREFILTER_WGSL.into()),
        });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("environment_prefilter_pipeline_layout"),
            bind_group_layouts: &[&layout],
            push_constant_ranges: &[],
        });
        let prefilter_pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("environment_ggx_prefilter_pipeline"),
            layout: Some(&pipeline_layout),
            module: &shader,
            entry_point: Some("cs_prefilter"),
            compilation_options: Default::default(),
            cache: None,
        });
        let irradiance_pipeline =
            device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
                label: Some("environment_irradiance_pipeline"),
                layout: Some(&pipeline_layout),
                module: &shader,
                entry_point: Some("cs_irradiance"),
                compilation_options: Default::default(),
                cache: None,
            });
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("environment_prefilter_sampler"),
            address_mode_u: wgpu::AddressMode::Repeat,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::FilterMode::Nearest,
            ..Default::default()
        });
        Self {
            layout,
            prefilter_pipeline,
            irradiance_pipeline,
            sampler,
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
        let source_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("environment_prefilter_source"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba16Float,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        queue.write_texture(
            wgpu::TexelCopyTextureInfo {
                texture: &source_texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            bytemuck::cast_slice(&source_pixels),
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(width * 8),
                rows_per_image: Some(height),
            },
            wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
        );
        let source_view = source_texture.create_view(&wgpu::TextureViewDescriptor::default());

        let [target_width, target_height] = prefilter_target_size(width, height);
        let mip_level_count = mip_level_count(target_width, target_height);
        let target_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("environment_ggx_prefiltered"),
            size: wgpu::Extent3d {
                width: target_width,
                height: target_height,
                depth_or_array_layers: 1,
            },
            mip_level_count,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba16Float,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::STORAGE_BINDING,
            view_formats: &[],
        });
        let target_view = target_texture.create_view(&wgpu::TextureViewDescriptor::default());
        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("environment_ggx_prefilter"),
        });
        for mip_level in 0..mip_level_count {
            let output_width = (target_width >> mip_level).max(1);
            let output_height = (target_height >> mip_level).max(1);
            let roughness = if mip_level_count > 1 {
                mip_level as f32 / (mip_level_count - 1) as f32
            } else {
                0.0
            };
            let uniform = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("environment_prefilter_uniform"),
                contents: bytemuck::bytes_of(&EnvironmentPrefilterUniforms {
                    output_size: [output_width, output_height],
                    params: [roughness, 0.0],
                }),
                usage: wgpu::BufferUsages::UNIFORM,
            });
            let output_view = target_texture.create_view(&wgpu::TextureViewDescriptor {
                label: Some("environment_prefilter_mip"),
                format: Some(wgpu::TextureFormat::Rgba16Float),
                dimension: Some(wgpu::TextureViewDimension::D2),
                usage: Some(wgpu::TextureUsages::STORAGE_BINDING),
                aspect: wgpu::TextureAspect::All,
                base_mip_level: mip_level,
                mip_level_count: Some(1),
                base_array_layer: 0,
                array_layer_count: Some(1),
            });
            let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("environment_prefilter_bg"),
                layout: &self.layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: wgpu::BindingResource::TextureView(&source_view),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: wgpu::BindingResource::Sampler(&self.sampler),
                    },
                    wgpu::BindGroupEntry {
                        binding: 2,
                        resource: wgpu::BindingResource::TextureView(&output_view),
                    },
                    wgpu::BindGroupEntry {
                        binding: 3,
                        resource: uniform.as_entire_binding(),
                    },
                ],
            });
            let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("environment_prefilter_mip"),
                timestamp_writes: None,
            });
            pass.set_pipeline(&self.prefilter_pipeline);
            pass.set_bind_group(0, &bind_group, &[]);
            pass.dispatch_workgroups(output_width.div_ceil(8), output_height.div_ceil(8), 1);
        }

        let irradiance_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("environment_diffuse_irradiance"),
            size: wgpu::Extent3d {
                width: IRRADIANCE_WIDTH,
                height: IRRADIANCE_HEIGHT,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba16Float,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::STORAGE_BINDING,
            view_formats: &[],
        });
        let irradiance_view =
            irradiance_texture.create_view(&wgpu::TextureViewDescriptor::default());
        let irradiance_storage_view =
            irradiance_texture.create_view(&wgpu::TextureViewDescriptor {
                label: Some("environment_irradiance_storage"),
                format: Some(wgpu::TextureFormat::Rgba16Float),
                dimension: Some(wgpu::TextureViewDimension::D2),
                usage: Some(wgpu::TextureUsages::STORAGE_BINDING),
                aspect: wgpu::TextureAspect::All,
                base_mip_level: 0,
                mip_level_count: Some(1),
                base_array_layer: 0,
                array_layer_count: Some(1),
            });
        let irradiance_uniform = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("environment_irradiance_uniform"),
            contents: bytemuck::bytes_of(&EnvironmentPrefilterUniforms {
                output_size: [IRRADIANCE_WIDTH, IRRADIANCE_HEIGHT],
                params: [0.0, 0.0],
            }),
            usage: wgpu::BufferUsages::UNIFORM,
        });
        let irradiance_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("environment_irradiance_bg"),
            layout: &self.layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&source_view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&self.sampler),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::TextureView(&irradiance_storage_view),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: irradiance_uniform.as_entire_binding(),
                },
            ],
        });
        {
            let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("environment_diffuse_irradiance"),
                timestamp_writes: None,
            });
            pass.set_pipeline(&self.irradiance_pipeline);
            pass.set_bind_group(0, &irradiance_bind_group, &[]);
            pass.dispatch_workgroups(
                IRRADIANCE_WIDTH.div_ceil(8),
                IRRADIANCE_HEIGHT.div_ceil(8),
                1,
            );
        }
        queue.submit(std::iter::once(encoder.finish()));

        PrefilteredEnvironment {
            _texture: target_texture,
            view: target_view,
            mip_level_count,
            _irradiance_texture: irradiance_texture,
            irradiance_view,
        }
    }
}

fn prefilter_target_size(width: u32, height: u32) -> [u32; 2] {
    let width = width.max(1);
    let height = height.max(1);
    let scale = (ENVIRONMENT_MAX_WIDTH as f32 / width as f32)
        .min(ENVIRONMENT_MAX_HEIGHT as f32 / height as f32)
        .min(1.0);
    [
        (width as f32 * scale).round().max(1.0) as u32,
        (height as f32 * scale).round().max(1.0) as u32,
    ]
}

fn mip_level_count(width: u32, height: u32) -> u32 {
    u32::BITS - width.max(height).max(1).leading_zeros()
}

fn srgb_to_linear(value: u8) -> f32 {
    let value = value as f32 / 255.0;
    if value <= 0.04045 {
        value / 12.92
    } else {
        ((value + 0.055) / 1.055).powf(2.4)
    }
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

const ENVIRONMENT_PREFILTER_WGSL: &str = r#"
struct PrefilterUniforms {
    output_size: vec2<u32>,
    params: vec2<f32>,
}

@group(0) @binding(0) var environment_source: texture_2d<f32>;
@group(0) @binding(1) var environment_sampler: sampler;
@group(0) @binding(2) var environment_output: texture_storage_2d<rgba16float, write>;
@group(0) @binding(3) var<uniform> settings: PrefilterUniforms;

const PI: f32 = 3.141592653589793;
const PREFILTER_SAMPLE_COUNT: u32 = 64u;
const IRRADIANCE_SAMPLE_COUNT: u32 = 128u;

fn radical_inverse_vdc(bits: u32) -> f32 {
    return f32(reverseBits(bits)) * 2.3283064365386963e-10;
}

fn importance_sample_ggx(xi: vec2<f32>, normal: vec3<f32>, roughness: f32) -> vec3<f32> {
    let alpha = roughness * roughness;
    let alpha_squared = alpha * alpha;
    let phi = 2.0 * PI * xi.x;
    let cosine = sqrt((1.0 - xi.y) / (1.0 + (alpha_squared - 1.0) * xi.y));
    let sine = sqrt(max(1.0 - cosine * cosine, 0.0));
    let halfway_tangent = vec3<f32>(cos(phi) * sine, sin(phi) * sine, cosine);
    let up = select(vec3<f32>(0.0, 0.0, 1.0), vec3<f32>(1.0, 0.0, 0.0), abs(normal.z) > 0.999);
    let tangent = normalize(cross(up, normal));
    let bitangent = cross(normal, tangent);
    return normalize(
        tangent * halfway_tangent.x
        + bitangent * halfway_tangent.y
        + normal * halfway_tangent.z
    );
}

fn cosine_sample_hemisphere(xi: vec2<f32>, normal: vec3<f32>) -> vec3<f32> {
    let phi = 2.0 * PI * xi.x;
    let radius = sqrt(xi.y);
    let local = vec3<f32>(cos(phi) * radius, sin(phi) * radius, sqrt(1.0 - xi.y));
    let up = select(vec3<f32>(0.0, 0.0, 1.0), vec3<f32>(1.0, 0.0, 0.0), abs(normal.z) > 0.999);
    let tangent = normalize(cross(up, normal));
    let bitangent = cross(normal, tangent);
    return normalize(tangent * local.x + bitangent * local.y + normal * local.z);
}

fn uv_to_direction(uv: vec2<f32>) -> vec3<f32> {
    let longitude = (uv.x - 0.5) * 2.0 * PI;
    let latitude = uv.y * PI;
    let latitude_sine = sin(latitude);
    return vec3<f32>(
        cos(longitude) * latitude_sine,
        cos(latitude),
        sin(longitude) * latitude_sine,
    );
}

fn direction_to_uv(direction: vec3<f32>) -> vec2<f32> {
    let normalized = normalize(direction);
    return vec2<f32>(
        atan2(normalized.z, normalized.x) / (2.0 * PI) + 0.5,
        acos(clamp(normalized.y, -1.0, 1.0)) / PI,
    );
}

@compute @workgroup_size(8, 8, 1)
fn cs_prefilter(@builtin(global_invocation_id) global_id: vec3<u32>) {
    if any(global_id.xy >= settings.output_size) {
        return;
    }
    let uv = (vec2<f32>(global_id.xy) + vec2<f32>(0.5)) / vec2<f32>(settings.output_size);
    let normal = normalize(uv_to_direction(uv));
    let view = normal;
    let roughness = clamp(settings.params.x, 0.001, 1.0);
    var radiance = vec3<f32>(0.0);
    var weight = 0.0;
    for (var index = 0u; index < PREFILTER_SAMPLE_COUNT; index = index + 1u) {
        let xi = vec2<f32>(f32(index) / f32(PREFILTER_SAMPLE_COUNT), radical_inverse_vdc(index));
        let halfway = importance_sample_ggx(xi, normal, roughness);
        let light = normalize(2.0 * dot(view, halfway) * halfway - view);
        let ndl = max(dot(normal, light), 0.0);
        if ndl > 0.0 {
            radiance += textureSampleLevel(
                environment_source,
                environment_sampler,
                direction_to_uv(light),
                0.0,
            ).rgb * ndl;
            weight += ndl;
        }
    }
    let fallback = textureSampleLevel(
        environment_source,
        environment_sampler,
        direction_to_uv(normal),
        0.0,
    ).rgb;
    let filtered = select(fallback, radiance / max(weight, 0.000001), weight > 0.0);
    textureStore(environment_output, vec2<i32>(global_id.xy), vec4<f32>(filtered, 1.0));
}

@compute @workgroup_size(8, 8, 1)
fn cs_irradiance(@builtin(global_invocation_id) global_id: vec3<u32>) {
    if any(global_id.xy >= settings.output_size) {
        return;
    }
    let uv = (vec2<f32>(global_id.xy) + vec2<f32>(0.5)) / vec2<f32>(settings.output_size);
    let normal = normalize(uv_to_direction(uv));
    var irradiance = vec3<f32>(0.0);
    for (var index = 0u; index < IRRADIANCE_SAMPLE_COUNT; index = index + 1u) {
        let xi = vec2<f32>(
            f32(index) / f32(IRRADIANCE_SAMPLE_COUNT),
            radical_inverse_vdc(index),
        );
        let light = cosine_sample_hemisphere(xi, normal);
        irradiance += textureSampleLevel(
            environment_source,
            environment_sampler,
            direction_to_uv(light),
            0.0,
        ).rgb;
    }
    irradiance /= f32(IRRADIANCE_SAMPLE_COUNT);
    textureStore(environment_output, vec2<i32>(global_id.xy), vec4<f32>(irradiance, 1.0));
}
"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn split_sum_brdf_lut_is_deterministic_finite_and_bounded() {
        assert_eq!(radical_inverse_vdc(0), 0.0);
        assert_eq!(radical_inverse_vdc(1), 0.5);
        assert_eq!(radical_inverse_vdc(2), 0.25);

        let lut = build_brdf_lut(8, 128);
        assert_eq!(lut.len(), 64);
        for value in &lut {
            assert!(value[0].is_finite() && (0.0..=1.0).contains(&value[0]));
            assert!(value[1].is_finite() && (0.0..=1.0).contains(&value[1]));
        }
        let scale_range = lut.iter().map(|value| value[0]).fold(
            (f32::INFINITY, f32::NEG_INFINITY),
            |(minimum, maximum), value| (minimum.min(value), maximum.max(value)),
        );
        assert!(scale_range.1 - scale_range.0 > 0.1);
        assert_eq!(lut, build_brdf_lut(8, 128));
    }

    #[test]
    fn environment_prefilter_contract_is_valid_and_bounded() {
        let module = naga::front::wgsl::parse_str(ENVIRONMENT_PREFILTER_WGSL)
            .expect("environment prefilter shader must parse");
        naga::valid::Validator::new(
            naga::valid::ValidationFlags::all(),
            naga::valid::Capabilities::all(),
        )
        .validate(&module)
        .expect("environment prefilter shader must validate");
        assert!(ENVIRONMENT_PREFILTER_WGSL.contains("fn cs_prefilter"));
        assert!(ENVIRONMENT_PREFILTER_WGSL.contains("fn cs_irradiance"));
        assert!(ENVIRONMENT_PREFILTER_WGSL.contains("cosine_sample_hemisphere"));

        assert_eq!(prefilter_target_size(4000, 2000), [1024, 512]);
        assert_eq!(prefilter_target_size(128, 64), [128, 64]);
        assert_eq!(mip_level_count(1024, 512), 11);
        assert_eq!(mip_level_count(1, 1), 1);
        assert!((srgb_to_linear(128) - 0.21586).abs() < 0.0001);
    }
}
