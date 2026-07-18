use std::num::NonZeroU64;

pub(crate) const HDR_COLOR_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba16Float;

#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct ToneMappingUniforms {
    params: [f32; 4],
}

impl ToneMappingUniforms {
    fn new(exposure: f32) -> Self {
        Self {
            params: [sanitize_exposure(exposure), 0.0, 0.0, 0.0],
        }
    }
}

pub(crate) struct HdrPostProcess {
    _hdr_texture: wgpu::Texture,
    hdr_view: wgpu::TextureView,
    tone_mapping_uniform: wgpu::Buffer,
    tone_mapping_layout: wgpu::BindGroupLayout,
    tone_mapping_bind_group: wgpu::BindGroup,
    tone_mapping_pipeline: wgpu::RenderPipeline,
}

impl HdrPostProcess {
    pub(crate) fn new(
        device: &wgpu::Device,
        surface_format: wgpu::TextureFormat,
        width: u32,
        height: u32,
    ) -> Self {
        let (hdr_texture, hdr_view) = create_hdr_target(device, width, height);
        let tone_mapping_uniform = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("tone_mapping_uniform"),
            size: std::mem::size_of::<ToneMappingUniforms>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let tone_mapping_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("tone_mapping_bgl"),
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
                        ty: wgpu::BindingType::Buffer {
                            ty: wgpu::BufferBindingType::Uniform,
                            has_dynamic_offset: false,
                            min_binding_size: NonZeroU64::new(
                                std::mem::size_of::<ToneMappingUniforms>() as u64,
                            ),
                        },
                        count: None,
                    },
                ],
            });
        let tone_mapping_bind_group = create_tone_mapping_bind_group(
            device,
            &tone_mapping_layout,
            &hdr_view,
            &tone_mapping_uniform,
        );
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("aces_tone_mapping"),
            source: wgpu::ShaderSource::Wgsl(TONE_MAPPING_WGSL.into()),
        });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("tone_mapping_pipeline_layout"),
            bind_group_layouts: &[&tone_mapping_layout],
            push_constant_ranges: &[],
        });
        let tone_mapping_pipeline =
            device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                label: Some("aces_tone_mapping_pipeline"),
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
                        format: surface_format,
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
            _hdr_texture: hdr_texture,
            hdr_view,
            tone_mapping_uniform,
            tone_mapping_layout,
            tone_mapping_bind_group,
            tone_mapping_pipeline,
        }
    }

    pub(crate) fn resize(&mut self, device: &wgpu::Device, width: u32, height: u32) {
        let (hdr_texture, hdr_view) = create_hdr_target(device, width, height);
        let tone_mapping_bind_group = create_tone_mapping_bind_group(
            device,
            &self.tone_mapping_layout,
            &hdr_view,
            &self.tone_mapping_uniform,
        );
        self._hdr_texture = hdr_texture;
        self.hdr_view = hdr_view;
        self.tone_mapping_bind_group = tone_mapping_bind_group;
    }

    pub(crate) fn write_exposure(&self, queue: &wgpu::Queue, exposure: f32) {
        queue.write_buffer(
            &self.tone_mapping_uniform,
            0,
            bytemuck::bytes_of(&ToneMappingUniforms::new(exposure)),
        );
    }

    pub(crate) fn hdr_view(&self) -> &wgpu::TextureView {
        &self.hdr_view
    }

    pub(crate) fn draw<'pass>(&'pass self, pass: &mut wgpu::RenderPass<'pass>) {
        pass.set_pipeline(&self.tone_mapping_pipeline);
        pass.set_bind_group(0, &self.tone_mapping_bind_group, &[]);
        pass.draw(0..3, 0..1);
    }
}

fn create_hdr_target(
    device: &wgpu::Device,
    width: u32,
    height: u32,
) -> (wgpu::Texture, wgpu::TextureView) {
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("forward_hdr_color"),
        size: wgpu::Extent3d {
            width: width.max(1),
            height: height.max(1),
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: HDR_COLOR_FORMAT,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
        view_formats: &[],
    });
    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
    (texture, view)
}

fn create_tone_mapping_bind_group(
    device: &wgpu::Device,
    layout: &wgpu::BindGroupLayout,
    hdr_view: &wgpu::TextureView,
    uniform: &wgpu::Buffer,
) -> wgpu::BindGroup {
    device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("tone_mapping_bg"),
        layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::TextureView(hdr_view),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: uniform.as_entire_binding(),
            },
        ],
    })
}

fn sanitize_exposure(exposure: f32) -> f32 {
    if exposure.is_finite() {
        exposure.clamp(-16.0, 16.0)
    } else {
        0.0
    }
}

const TONE_MAPPING_WGSL: &str = r#"
struct ToneMappingUniforms {
    params: vec4<f32>,
}

@group(0) @binding(0) var hdr_color: texture_2d<f32>;
@group(0) @binding(1) var<uniform> settings: ToneMappingUniforms;

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> @builtin(position) vec4<f32> {
    let positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0),
    );
    return vec4<f32>(positions[vertex_index], 0.0, 1.0);
}

fn aces_fitted(color: vec3<f32>) -> vec3<f32> {
    let numerator = color * (2.51 * color + vec3<f32>(0.03));
    let denominator = color * (2.43 * color + vec3<f32>(0.59)) + vec3<f32>(0.14);
    return clamp(numerator / denominator, vec3<f32>(0.0), vec3<f32>(1.0));
}

@fragment
fn fs_main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let dimensions = vec2<i32>(textureDimensions(hdr_color));
    let coordinate = clamp(
        vec2<i32>(i32(position.x), i32(position.y)),
        vec2<i32>(0),
        dimensions - vec2<i32>(1),
    );
    let hdr = textureLoad(hdr_color, coordinate, 0);
    let exposed = max(hdr.rgb, vec3<f32>(0.0)) * exp2(settings.params.x);
    return vec4<f32>(aces_fitted(exposed), clamp(hdr.a, 0.0, 1.0));
}
"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exposure_is_finite_and_bounded() {
        assert_eq!(sanitize_exposure(f32::NAN), 0.0);
        assert_eq!(sanitize_exposure(f32::INFINITY), 0.0);
        assert_eq!(sanitize_exposure(-20.0), -16.0);
        assert_eq!(sanitize_exposure(20.0), 16.0);
        assert_eq!(sanitize_exposure(1.25), 1.25);
    }

    #[test]
    fn tone_mapping_shader_is_valid_wgsl() {
        let module = naga::front::wgsl::parse_str(TONE_MAPPING_WGSL)
            .expect("tone mapping shader must parse");
        naga::valid::Validator::new(
            naga::valid::ValidationFlags::all(),
            naga::valid::Capabilities::all(),
        )
        .validate(&module)
        .expect("tone mapping shader must validate");
    }
}
