//! 4-Cascade Directional Cascaded Shadow Maps (CSM) with frustum fitting,
//! light-space texel snapping (zero shimmer), and per-cascade draw uniforms.

use crate::renderer::{FrameCamera, FrameLighting};
use glam::{Mat4, Vec3, Vec4};

pub(crate) const CASCADE_COUNT: usize = 4;
pub(crate) const CSM_RESOLUTION: u32 = 2048;

#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
pub(crate) struct ShadowUniforms {
    pub(crate) light_view_proj: [[[f32; 4]; 4]; CASCADE_COUNT],
    pub(crate) split_depths: [f32; 4],
    pub(crate) cascade_biases: [f32; 4],
    pub(crate) params: [f32; 4],     // x=strength, y=depth_bias, z=normal_bias, w=enabled
    pub(crate) texel_size: [f32; 4], // xy=1/res, z=fade_start, w=max_distance
}

#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
pub(crate) struct ShadowCascadeUniform {
    pub(crate) light_view_proj: [[f32; 4]; 4],
}

pub(crate) struct CascadedShadowMap {
    pub(crate) _texture: wgpu::Texture,
    pub(crate) array_view: wgpu::TextureView,
    pub(crate) layer_views: [wgpu::TextureView; CASCADE_COUNT],
    pub(crate) sampler: wgpu::Sampler,
    pub(crate) sample_uniform_buf: wgpu::Buffer,
    pub(crate) cascade_uniform_bufs: [wgpu::Buffer; CASCADE_COUNT],
}

impl CascadedShadowMap {
    pub(crate) fn new(device: &wgpu::Device) -> Self {
        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("csm_shadow_depth_array"),
            size: wgpu::Extent3d {
                width: CSM_RESOLUTION,
                height: CSM_RESOLUTION,
                depth_or_array_layers: CASCADE_COUNT as u32,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Depth32Float,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });

        let array_view = texture.create_view(&wgpu::TextureViewDescriptor {
            label: Some("csm_shadow_array_view"),
            dimension: Some(wgpu::TextureViewDimension::D2Array),
            base_array_layer: 0,
            array_layer_count: Some(CASCADE_COUNT as u32),
            ..Default::default()
        });

        let layer_views = std::array::from_fn(|layer| {
            texture.create_view(&wgpu::TextureViewDescriptor {
                label: Some("csm_shadow_layer_view"),
                dimension: Some(wgpu::TextureViewDimension::D2),
                base_array_layer: layer as u32,
                array_layer_count: Some(1),
                ..Default::default()
            })
        });

        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("csm_shadow_comparison_sampler"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::FilterMode::Nearest,
            compare: Some(wgpu::CompareFunction::LessEqual),
            ..Default::default()
        });

        let sample_uniform_buf = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("csm_sample_uniforms"),
            size: std::mem::size_of::<ShadowUniforms>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let cascade_uniform_bufs = std::array::from_fn(|_| {
            device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("csm_cascade_pass_uniform"),
                size: std::mem::size_of::<ShadowCascadeUniform>() as u64,
                usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            })
        });

        Self {
            _texture: texture,
            array_view,
            layer_views,
            sampler,
            sample_uniform_buf,
            cascade_uniform_bufs,
        }
    }

    pub(crate) fn update(
        &self,
        queue: &wgpu::Queue,
        camera: FrameCamera,
        lighting: &FrameLighting,
    ) -> ShadowUniforms {
        let uniforms = compute_csm_uniforms(camera, lighting);
        queue.write_buffer(&self.sample_uniform_buf, 0, bytemuck::bytes_of(&uniforms));
        for cascade in 0..CASCADE_COUNT {
            let pass_u = ShadowCascadeUniform {
                light_view_proj: uniforms.light_view_proj[cascade],
            };
            queue.write_buffer(&self.cascade_uniform_bufs[cascade], 0, bytemuck::bytes_of(&pass_u));
        }
        uniforms
    }
}

/// Computes Practical Split Scheme (lambda = 0.65) 4-cascade matrices with bounding-sphere
/// fitting and light-space texel snapping so shadows stay sharp and shimmer-free.
pub(crate) fn compute_csm_uniforms(
    camera: FrameCamera,
    lighting: &FrameLighting,
) -> ShadowUniforms {
    let inv_res = 1.0 / CSM_RESOLUTION as f32;
    let disabled = ShadowUniforms {
        light_view_proj: [Mat4::IDENTITY.to_cols_array_2d(); CASCADE_COUNT],
        split_depths: [10.0, 30.0, 80.0, 180.0],
        cascade_biases: [1.0, 2.0, 4.0, 8.0],
        params: [0.0; 4],
        texel_size: [inv_res, inv_res, 0.0, 0.0],
    };

    let Some(light) = lighting.directional else {
        return disabled;
    };
    let direction = light.direction.normalize_or_zero();
    if !light.cast_shadows || light.shadow_strength <= 0.0 || direction.length_squared() < 0.5 {
        return disabled;
    }

    let max_dist = light.shadow_distance.clamp(4.0, 600.0);
    let near_clip = extract_camera_near(camera.proj).clamp(0.05, max_dist * 0.2);
    let far_clip = extract_camera_far(camera.proj).max(near_clip + 1.0);
    let effective_far = max_dist.min(far_clip);

    // Practical split scheme: blend logarithmic and uniform splits
    let lambda = 0.68_f32;
    let mut splits = [0.0_f32; CASCADE_COUNT + 1];
    splits[0] = near_clip;
    for i in 1..=CASCADE_COUNT {
        let p = i as f32 / CASCADE_COUNT as f32;
        let log_split = near_clip * (effective_far / near_clip).powf(p);
        let lin_split = near_clip + (effective_far - near_clip) * p;
        splits[i] = lambda * log_split + (1.0 - lambda) * lin_split;
    }

    let inv_view = camera.view.inverse();
    let inv_proj = camera.proj.inverse();
    let up = if direction.dot(Vec3::Y).abs() > 0.96 {
        Vec3::X
    } else {
        Vec3::Y
    };

    // Unproject full frustum NDC corners in view space so we can slice cleanly by view Z.
    let ndc_corners = [
        Vec4::new(-1.0, -1.0, 0.0, 1.0),
        Vec4::new( 1.0, -1.0, 0.0, 1.0),
        Vec4::new(-1.0,  1.0, 0.0, 1.0),
        Vec4::new( 1.0,  1.0, 0.0, 1.0),
        Vec4::new(-1.0, -1.0, 1.0, 1.0),
        Vec4::new( 1.0, -1.0, 1.0, 1.0),
        Vec4::new(-1.0,  1.0, 1.0, 1.0),
        Vec4::new( 1.0,  1.0, 1.0, 1.0),
    ];
    let mut view_corners = [Vec3::ZERO; 8];
    for (idx, ndc) in ndc_corners.iter().enumerate() {
        let v = inv_proj * *ndc;
        view_corners[idx] = if v.w.abs() > 1e-6 { v.truncate() / v.w } else { Vec3::ZERO };
    }

    let mut light_view_proj = [Mat4::IDENTITY.to_cols_array_2d(); CASCADE_COUNT];
    let mut cascade_biases = [1.0_f32; CASCADE_COUNT];
    let frustum_span = (far_clip - near_clip).max(0.001);

    for c in 0..CASCADE_COUNT {
        let split_near = splits[c];
        let split_far = splits[c + 1];
        let t0 = ((split_near - near_clip) / frustum_span).clamp(0.0, 1.0);
        let t1 = ((split_far - near_clip) / frustum_span).clamp(0.0, 1.0);

        let mut world_corners = [Vec3::ZERO; 8];
        let mut center = Vec3::ZERO;
        for k in 0..4 {
            let vn = view_corners[k].lerp(view_corners[k + 4], t0);
            let vf = view_corners[k].lerp(view_corners[k + 4], t1);
            world_corners[k] = inv_view.transform_point3(vn);
            world_corners[k + 4] = inv_view.transform_point3(vf);
            center += world_corners[k] + world_corners[k + 4];
        }
        center *= 0.125;

        // Bounding sphere radius keeps cascade projection rotationally invariant (zero shimmer).
        let mut radius = 1.0_f32;
        for corner in &world_corners {
            radius = radius.max(corner.distance(center));
        }
        radius = (radius * 16.0).ceil() / 16.0;

        let texel_world = (radius * 2.0) / CSM_RESOLUTION as f32;
        let z_pullback = (radius * 2.5).max(80.0);
        let z_depth = z_pullback + radius * 2.5;

        let base_view = Mat4::look_at_rh(center - direction * z_pullback, center, up);
        let origin_light = base_view.transform_point3(Vec3::ZERO);
        let snapped_x = (origin_light.x / texel_world).round() * texel_world;
        let snapped_y = (origin_light.y / texel_world).round() * texel_world;
        let snap_offset = Vec3::new(snapped_x - origin_light.x, snapped_y - origin_light.y, 0.0);

        let proj = Mat4::orthographic_rh(-radius, radius, -radius, radius, 0.1, z_depth);
        let snapped_proj = Mat4::from_translation(Vec3::new(
            snap_offset.x / radius,
            snap_offset.y / radius,
            0.0,
        )) * proj;

        light_view_proj[c] = (snapped_proj * base_view).to_cols_array_2d();
        // Scale normal bias proportionally to world-space texel size of this cascade.
        cascade_biases[c] = (texel_world * 16.0).clamp(0.5, 16.0);
    }

    ShadowUniforms {
        light_view_proj,
        split_depths: [splits[1], splits[2], splits[3], splits[4]],
        cascade_biases,
        params: [
            light.shadow_strength.clamp(0.0, 1.0),
            light.shadow_bias.clamp(0.0, 0.02),
            light.shadow_normal_bias.clamp(0.0, 2.0),
            1.0,
        ],
        texel_size: [inv_res, inv_res, effective_far * 0.85, effective_far],
    }
}

fn extract_camera_near(proj: Mat4) -> f32 {
    // Standard right-handed wgpu perspective_rh (z in [0, 1]):
    // proj.z_axis.z = far / (near - far), proj.w_axis.z = (near * far) / (near - far)
    let m22 = proj.z_axis.z;
    let m32 = proj.w_axis.z;
    if m22.abs() < 1e-6 || proj.w_axis.w.abs() > 0.5 {
        // Orthographic or identity test matrix fallback
        return 0.1;
    }
    let near = m32 / m22;
    if near.is_finite() && near > 0.001 {
        near
    } else {
        0.1
    }
}

fn extract_camera_far(proj: Mat4) -> f32 {
    let m22 = proj.z_axis.z;
    let m32 = proj.w_axis.z;
    if (m22 + 1.0).abs() < 1e-6 || proj.w_axis.w.abs() > 0.5 {
        return 500.0;
    }
    let far = m32 / (m22 + 1.0);
    if far.is_finite() && far > 1.0 {
        far
    } else {
        500.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::renderer::{look_at, perspective, DirectionalLightData};

    #[test]
    fn csm_splits_are_strictly_increasing_and_finite() {
        let camera = FrameCamera {
            view: look_at(Vec3::new(0.0, 10.0, 25.0), Vec3::ZERO, Vec3::Y),
            proj: perspective(55.0, 16.0 / 9.0, 0.2, 1000.0),
            position: Vec3::new(0.0, 10.0, 25.0),
        };
        let mut lighting = FrameLighting::default();
        lighting.directional = Some(DirectionalLightData {
            direction: Vec3::new(0.4, -0.7, 0.5).normalize(),
            color: [1.0, 0.95, 0.9],
            intensity: 2.0,
            cast_shadows: true,
            shadow_strength: 0.9,
            shadow_bias: 0.001,
            shadow_normal_bias: 0.02,
            shadow_distance: 160.0,
        });
        let u = compute_csm_uniforms(camera, &lighting);
        assert_eq!(u.params[3], 1.0);
        assert!(u.split_depths[0] > 0.2);
        assert!(u.split_depths[0] < u.split_depths[1]);
        assert!(u.split_depths[1] < u.split_depths[2]);
        assert!(u.split_depths[2] < u.split_depths[3]);
        assert!((u.split_depths[3] - 160.0).abs() < 0.01);
        for mat in &u.light_view_proj {
            for col in mat {
                for &v in col {
                    assert!(v.is_finite());
                }
            }
        }
    }
}
