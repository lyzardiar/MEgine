use glam::Vec3;
use half::f16;

const BRDF_LUT_SIZE: u32 = 128;
const BRDF_LUT_SAMPLES: u32 = 256;

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
}
