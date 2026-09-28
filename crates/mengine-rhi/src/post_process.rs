use std::num::NonZeroU64;

pub(crate) const HDR_COLOR_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba16Float;

#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct ToneMappingUniforms {
    params: [f32; 4],
}

impl ToneMappingUniforms {
    fn new(exposure: f32, tone_mapping: bool) -> Self {
        Self {
            params: [sanitize_exposure(exposure), if tone_mapping { 1.0 } else { 0.0 }, 0.0, 0.0],
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

    pub(crate) fn write_settings(&self, queue: &wgpu::Queue, exposure: f32, tone_mapping: bool) {
        queue.write_buffer(
            &self.tone_mapping_uniform,
            0,
            bytemuck::bytes_of(&ToneMappingUniforms::new(exposure, tone_mapping)),
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

fn mapped_pixel(pixel: vec2<i32>) -> vec4<f32> {
    let dimensions = vec2<i32>(textureDimensions(hdr_color));
    let coordinate = clamp(pixel, vec2<i32>(0), dimensions - vec2<i32>(1));
    let hdr = textureLoad(hdr_color, coordinate, 0);
    let exposed = max(hdr.rgb, vec3<f32>(0.0)) * exp2(settings.params.x);
    if settings.params.y < 0.5 {
        return vec4<f32>(exposed, clamp(hdr.a, 0.0, 1.0));
    }
    return vec4<f32>(aces_fitted(exposed), clamp(hdr.a, 0.0, 1.0));
}

// MiYu: FXAA operates on exposed, tone-mapped scene color before the UI overlay.
fn mapped_sample(pixel: vec2<f32>) -> vec3<f32> {
    let base = vec2<i32>(floor(pixel));
    let blend = fract(pixel);
    return mix(mix(mapped_pixel(base).rgb, mapped_pixel(base + vec2<i32>(1, 0)).rgb, blend.x), mix(mapped_pixel(base + vec2<i32>(0, 1)).rgb, mapped_pixel(base + vec2<i32>(1, 1)).rgb, blend.x), blend.y);
}

fn luma(color: vec3<f32>) -> f32 {
    return sqrt(max(dot(color, vec3<f32>(0.299, 0.587, 0.114)), 0.0));
}

@fragment
fn fs_main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let pixel = vec2<i32>(position.xy);
    let center = mapped_pixel(pixel);
    let nw = luma(mapped_pixel(pixel + vec2<i32>(-1, -1)).rgb);
    let ne = luma(mapped_pixel(pixel + vec2<i32>(1, -1)).rgb);
    let sw = luma(mapped_pixel(pixel + vec2<i32>(-1, 1)).rgb);
    let se = luma(mapped_pixel(pixel + vec2<i32>(1, 1)).rgb);
    let middle = luma(center.rgb);
    let low = min(middle, min(min(nw, ne), min(sw, se)));
    let high = max(middle, max(max(nw, ne), max(sw, se)));
    if high - low < max(0.0312, high * 0.125) { return center; }
    let direction = vec2<f32>(-((nw + ne) - (sw + se)), (nw + sw) - (ne + se));
    let reduction = max((nw + ne + sw + se) * 0.03125, 0.0078125);
    let step = clamp(direction / (min(abs(direction.x), abs(direction.y)) + reduction), vec2<f32>(-8.0), vec2<f32>(8.0));
    let p = vec2<f32>(pixel);
    let narrow = (mapped_sample(p - step / 6.0) + mapped_sample(p + step / 6.0)) * 0.5;
    let wide = narrow * 0.5 + (mapped_sample(p - step * 0.5) + mapped_sample(p + step * 0.5)) * 0.25;
    let wide_luma = luma(wide);
    return vec4<f32>(select(wide, narrow, wide_luma < low || wide_luma > high), center.a);
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
        assert_eq!(ToneMappingUniforms::new(1.25, true).params, [1.25, 1.0, 0.0, 0.0]);
        assert_eq!(ToneMappingUniforms::new(1.25, false).params, [1.25, 0.0, 0.0, 0.0]);
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

    #[test]
    fn antialiasing_smooths_diagonals_and_preserves_flat_color_and_alpha() {
        let instance = wgpu::Instance::default();
        let Some(adapter) = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions::default())) else { eprintln!("SKIP: no headless GPU adapter"); return; };
        let (device, queue) = pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor::default(), None)).expect("post-process test device");
        device.push_error_scope(wgpu::ErrorFilter::Validation);
        for size in [32, 1] {
            let mut post = HdrPostProcess::new(&device, wgpu::TextureFormat::Rgba8Unorm, size, size);
            let input = device.create_texture(&wgpu::TextureDescriptor {
                label: Some("antialiasing_test_input"), size: wgpu::Extent3d { width: size, height: size, depth_or_array_layers: 1 },
                mip_level_count: 1, sample_count: 1, dimension: wgpu::TextureDimension::D2, format: wgpu::TextureFormat::Rgba8Unorm,
                usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST, view_formats: &[],
            });
            let pixels: Vec<u8> = (0..size).flat_map(|y| (0..size).flat_map(move |x| { let value = if size == 1 { 64 } else if x > y { 255 } else { 0 }; [value, value, value, 128] })).collect();
            queue.write_texture(input.as_image_copy(), &pixels, wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(size * 4), rows_per_image: Some(size) }, input.size());
            post.tone_mapping_bind_group = create_tone_mapping_bind_group(&device, &post.tone_mapping_layout, &input.create_view(&Default::default()), &post.tone_mapping_uniform);
            post.write_settings(&queue, 0.0, false);
            let output = device.create_texture(&wgpu::TextureDescriptor {
                label: Some("antialiasing_test_output"), size: input.size(), mip_level_count: 1, sample_count: 1,
                dimension: wgpu::TextureDimension::D2, format: wgpu::TextureFormat::Rgba8Unorm,
                usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC, view_formats: &[],
            });
            let readback = device.create_buffer(&wgpu::BufferDescriptor { label: None, size: size as u64 * 256, usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ, mapped_at_creation: false });
            let view = output.create_view(&Default::default());
            let mut encoder = device.create_command_encoder(&Default::default());
            {
                let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                    color_attachments: &[Some(wgpu::RenderPassColorAttachment { view: &view, resolve_target: None, ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::BLACK), store: wgpu::StoreOp::Store } })],
                    ..Default::default()
                });
                post.draw(&mut pass);
            }
            encoder.copy_texture_to_buffer(output.as_image_copy(), wgpu::TexelCopyBufferInfo { buffer: &readback, layout: wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(256), rows_per_image: Some(size) } }, output.size());
            queue.submit([encoder.finish()]);
            let (tx, rx) = std::sync::mpsc::channel();
            readback.slice(..).map_async(wgpu::MapMode::Read, move |result| { tx.send(result).unwrap(); });
            device.poll(wgpu::Maintain::Wait);
            rx.recv().unwrap().unwrap();
            let data = readback.slice(..).get_mapped_range();
            if size == 1 {
                assert_eq!(&data[..4], &[64, 64, 64, 128], "one-pixel border clamps without changing color or alpha");
            } else {
                assert_eq!(data[4 * 24 + 4 * 256], 255, "flat white stays white");
                assert_eq!(data[4 * 4 + 24 * 256], 0, "flat black stays black");
                assert!((4..28).any(|y| { let value = data[y * 256 + y * 4]; value > 0 && value < 255 }), "diagonal gets fractional coverage");
                for y in 0..size as usize { for x in 0..size as usize { assert_eq!(data[y * 256 + x * 4 + 3], 128); } }
            }
            drop(data);readback.unmap();
        }
        let error = pollster::block_on(device.pop_error_scope());
        assert!(error.is_none(), "post-process GPU validation: {error:?}");
    }
}
