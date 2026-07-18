use crate::post_process::HDR_COLOR_FORMAT;
use crate::renderer::{EnvironmentLightData, FrameCamera};
use std::num::NonZeroU64;

#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct SkyUniforms {
    inverse_view_projection: [[f32; 4]; 4],
    camera_position: [f32; 4],
    sky_color: [f32; 4],
    equator_color: [f32; 4],
    ground_color: [f32; 4],
    params: [f32; 4],
}

impl SkyUniforms {
    fn new(camera: FrameCamera, environment: &EnvironmentLightData, has_texture: bool) -> Self {
        let rotation = finite_or(environment.rotation_degrees, 0.0)
            .rem_euclid(360.0)
            .to_radians();
        Self {
            inverse_view_projection: (camera.proj * camera.view).inverse().to_cols_array_2d(),
            camera_position: [camera.position.x, camera.position.y, camera.position.z, 1.0],
            sky_color: radiance_color(environment.sky_color),
            equator_color: radiance_color(environment.equator_color),
            ground_color: radiance_color(environment.ground_color),
            params: [
                if has_texture { 1.0 } else { 0.0 },
                rotation,
                finite_or(environment.background_intensity, 1.0).clamp(0.0, 65_504.0),
                0.0,
            ],
        }
    }
}

pub(crate) struct SkyBackground {
    uniform: wgpu::Buffer,
    bind_group: wgpu::BindGroup,
    pipeline: wgpu::RenderPipeline,
}

impl SkyBackground {
    pub(crate) fn new(device: &wgpu::Device, environment_layout: &wgpu::BindGroupLayout) -> Self {
        let uniform = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("sky_background_uniform"),
            size: std::mem::size_of::<SkyUniforms>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("sky_background_bgl"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: NonZeroU64::new(std::mem::size_of::<SkyUniforms>() as u64),
                },
                count: None,
            }],
        });
        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("sky_background_bg"),
            layout: &layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: uniform.as_entire_binding(),
            }],
        });
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("sky_background"),
            source: wgpu::ShaderSource::Wgsl(SKY_BACKGROUND_WGSL.into()),
        });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("sky_background_pipeline_layout"),
            bind_group_layouts: &[&layout, environment_layout],
            push_constant_ranges: &[],
        });
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("sky_background_pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                buffers: &[],
                compilation_options: Default::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState {
                    format: HDR_COLOR_FORMAT,
                    blend: None,
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
        });
        Self {
            uniform,
            bind_group,
            pipeline,
        }
    }

    pub(crate) fn prepare(
        &self,
        queue: &wgpu::Queue,
        camera: FrameCamera,
        environment: &EnvironmentLightData,
        has_texture: bool,
    ) {
        queue.write_buffer(
            &self.uniform,
            0,
            bytemuck::bytes_of(&SkyUniforms::new(camera, environment, has_texture)),
        );
    }

    pub(crate) fn draw<'pass>(
        &'pass self,
        pass: &mut wgpu::RenderPass<'pass>,
        environment_bind_group: &'pass wgpu::BindGroup,
    ) {
        pass.set_pipeline(&self.pipeline);
        pass.set_bind_group(0, &self.bind_group, &[]);
        pass.set_bind_group(1, environment_bind_group, &[]);
        pass.draw(0..3, 0..1);
    }
}

fn finite_or(value: f32, fallback: f32) -> f32 {
    if value.is_finite() {
        value
    } else {
        fallback
    }
}

fn radiance_color(color: [f32; 3]) -> [f32; 4] {
    [
        finite_or(color[0], 0.0).clamp(0.0, 65_504.0),
        finite_or(color[1], 0.0).clamp(0.0, 65_504.0),
        finite_or(color[2], 0.0).clamp(0.0, 65_504.0),
        1.0,
    ]
}

const SKY_BACKGROUND_WGSL: &str = r#"
const PI: f32 = 3.141592653589793;

struct SkyUniforms {
    inverse_view_projection: mat4x4<f32>,
    camera_position: vec4<f32>,
    sky_color: vec4<f32>,
    equator_color: vec4<f32>,
    ground_color: vec4<f32>,
    params: vec4<f32>,
};

@group(0) @binding(0) var<uniform> sky: SkyUniforms;
@group(1) @binding(1) var environment_sampler: sampler;
@group(1) @binding(5) var environment_source: texture_2d<f32>;

struct VsOut {
    @builtin(position) position: vec4<f32>,
    @location(0) clip_xy: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VsOut {
    let positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0),
    );
    var output: VsOut;
    output.position = vec4<f32>(positions[vertex_index], 0.0, 1.0);
    output.clip_xy = positions[vertex_index];
    return output;
}

fn rotate_environment_direction(direction: vec3<f32>) -> vec3<f32> {
    let sine = sin(sky.params.y);
    let cosine = cos(sky.params.y);
    return vec3<f32>(
        cosine * direction.x + sine * direction.z,
        direction.y,
        -sine * direction.x + cosine * direction.z,
    );
}

fn analytic_background(direction: vec3<f32>) -> vec3<f32> {
    let vertical = clamp(direction.y, -1.0, 1.0);
    if vertical >= 0.0 {
        return mix(sky.equator_color.rgb, sky.sky_color.rgb, vertical);
    }
    return mix(sky.equator_color.rgb, sky.ground_color.rgb, -vertical);
}

@fragment
fn fs_main(input: VsOut) -> @location(0) vec4<f32> {
    let far_world = sky.inverse_view_projection * vec4<f32>(input.clip_xy, 1.0, 1.0);
    let world_position = far_world.xyz / far_world.w;
    let direction = normalize(world_position - sky.camera_position.xyz);
    let rotated = normalize(rotate_environment_direction(direction));
    var radiance = analytic_background(rotated);
    if sky.params.x > 0.5 {
        let longitude = atan2(rotated.z, rotated.x);
        let latitude = acos(clamp(rotated.y, -1.0, 1.0));
        let uv = vec2<f32>(longitude / (2.0 * PI) + 0.5, latitude / PI);
        radiance = textureSampleLevel(environment_source, environment_sampler, uv, 0.0).rgb;
    }
    return vec4<f32>(max(radiance, vec3<f32>(0.0)) * sky.params.z, 1.0);
}
"#;

#[cfg(test)]
mod tests {
    use super::*;
    use glam::Mat4;

    #[test]
    fn sky_shader_is_valid_wgsl() {
        let module = naga::front::wgsl::parse_str(SKY_BACKGROUND_WGSL)
            .expect("sky background shader must parse");
        naga::valid::Validator::new(
            naga::valid::ValidationFlags::all(),
            naga::valid::Capabilities::all(),
        )
        .validate(&module)
        .expect("sky background shader must validate");
    }

    #[test]
    fn sky_uniforms_preserve_hdr_intensity_and_sanitize_invalid_values() {
        let camera = FrameCamera {
            view: Mat4::IDENTITY,
            proj: Mat4::IDENTITY,
            position: glam::Vec3::ZERO,
        };
        let environment = EnvironmentLightData {
            sky_color: [4.0, f32::NAN, -1.0],
            rotation_degrees: 450.0,
            background_intensity: f32::INFINITY,
            ..Default::default()
        };
        let uniforms = SkyUniforms::new(camera, &environment, true);
        assert_eq!(uniforms.sky_color, [4.0, 0.0, 0.0, 1.0]);
        assert!((uniforms.params[1] - std::f32::consts::FRAC_PI_2).abs() < 0.0001);
        assert_eq!(uniforms.params[2], 1.0);
        assert_eq!(uniforms.params[0], 1.0);
    }
}
