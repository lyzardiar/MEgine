use crate::{AssetError, EnvironmentTexture, TextureRgba8};
use image::DynamicImage;
use std::path::Path;

pub fn load_texture_rgba8(path: &Path) -> Result<TextureRgba8, AssetError> {
    if !path.is_file() {
        return Err(AssetError::NotFound(path.display().to_string()));
    }
    let image = image::open(path)?.into_rgba8();
    let (width, height) = image.dimensions();
    Ok(TextureRgba8 {
        width,
        height,
        pixels: image.into_raw(),
    })
}

/// Decode an environment map without collapsing HDR sources to 8-bit color.
/// Float images are treated as linear light; conventional 8-bit images are
/// converted from sRGB so both paths feed the same IBL prefilter contract.
pub fn load_environment_texture(path: &Path) -> Result<EnvironmentTexture, AssetError> {
    if !path.is_file() {
        return Err(AssetError::NotFound(path.display().to_string()));
    }
    let image = image::open(path)?;
    let (width, height, pixels) = match image {
        DynamicImage::ImageRgb32F(image) => {
            let (width, height) = image.dimensions();
            let pixels = image
                .into_raw()
                .chunks_exact(3)
                .flat_map(|pixel| {
                    [
                        sanitize_radiance(pixel[0]),
                        sanitize_radiance(pixel[1]),
                        sanitize_radiance(pixel[2]),
                        1.0,
                    ]
                })
                .collect();
            (width, height, pixels)
        }
        DynamicImage::ImageRgba32F(image) => {
            let (width, height) = image.dimensions();
            let pixels = image
                .into_raw()
                .chunks_exact(4)
                .flat_map(|pixel| {
                    [
                        sanitize_radiance(pixel[0]),
                        sanitize_radiance(pixel[1]),
                        sanitize_radiance(pixel[2]),
                        sanitize_alpha(pixel[3]),
                    ]
                })
                .collect();
            (width, height, pixels)
        }
        image => {
            let image = image.into_rgba8();
            let (width, height) = image.dimensions();
            let pixels = image
                .into_raw()
                .chunks_exact(4)
                .flat_map(|pixel| {
                    [
                        srgb_to_linear(pixel[0]),
                        srgb_to_linear(pixel[1]),
                        srgb_to_linear(pixel[2]),
                        pixel[3] as f32 / 255.0,
                    ]
                })
                .collect();
            (width, height, pixels)
        }
    };
    Ok(EnvironmentTexture {
        width,
        height,
        pixels,
    })
}

fn sanitize_radiance(value: f32) -> f32 {
    if value.is_finite() {
        value.clamp(0.0, 65_504.0)
    } else {
        0.0
    }
}

fn sanitize_alpha(value: f32) -> f32 {
    if value.is_finite() {
        value.clamp(0.0, 1.0)
    } else {
        1.0
    }
}

fn srgb_to_linear(value: u8) -> f32 {
    let value = value as f32 / 255.0;
    if value <= 0.04045 {
        value / 12.92
    } else {
        ((value + 0.055) / 1.055).powf(2.4)
    }
}

pub fn texture_dimensions(path: &Path) -> Result<[u32; 2], AssetError> {
    if !path.is_file() {
        return Err(AssetError::NotFound(path.display().to_string()));
    }
    let (width, height) = image::image_dimensions(path)?;
    Ok([width, height])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_asset(extension: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "mengine-texture-{}-{}.{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos(),
            extension
        ))
    }

    #[test]
    fn decodes_texture_files_to_tightly_packed_rgba8() {
        let path = temp_asset("png");
        let pixels = vec![255, 0, 0, 255, 0, 128, 255, 64];
        image::RgbaImage::from_raw(2, 1, pixels.clone())
            .unwrap()
            .save(&path)
            .unwrap();

        let decoded = load_texture_rgba8(&path).unwrap();
        assert_eq!(texture_dimensions(&path).unwrap(), [2, 1]);
        std::fs::remove_file(path).unwrap();
        assert_eq!((decoded.width, decoded.height), (2, 1));
        assert_eq!(decoded.pixels, pixels);
    }

    #[test]
    fn environment_loader_preserves_hdr_radiance_above_one() {
        let path = temp_asset("hdr");
        let pixels = [image::Rgb([4.0, 2.0, 1.0]), image::Rgb([0.25, 0.5, 0.75])];
        image::codecs::hdr::HdrEncoder::new(std::fs::File::create(&path).unwrap())
            .encode(&pixels, 2, 1)
            .unwrap();

        let decoded = load_environment_texture(&path).unwrap();
        std::fs::remove_file(path).unwrap();
        assert_eq!((decoded.width, decoded.height), (2, 1));
        assert_eq!(decoded.pixels.len(), 8);
        assert!(decoded.pixels[0] > 3.9);
        assert!(decoded.pixels[1] > 1.9);
        assert_eq!(decoded.pixels[3], 1.0);
    }

    #[test]
    fn environment_loader_preserves_openexr_float_radiance() {
        let path = temp_asset("exr");
        image::Rgb32FImage::from_raw(1, 1, vec![16.0, 2.0, 0.5])
            .unwrap()
            .save(&path)
            .unwrap();

        let decoded = load_environment_texture(&path).unwrap();
        std::fs::remove_file(path).unwrap();
        assert_eq!((decoded.width, decoded.height), (1, 1));
        assert!((decoded.pixels[0] - 16.0).abs() < 0.01);
        assert!((decoded.pixels[1] - 2.0).abs() < 0.01);
        assert!((decoded.pixels[2] - 0.5).abs() < 0.01);
        assert_eq!(decoded.pixels[3], 1.0);
    }

    #[test]
    fn environment_loader_converts_ldr_srgb_to_linear() {
        let path = temp_asset("png");
        image::RgbaImage::from_raw(1, 1, vec![128, 255, 0, 64])
            .unwrap()
            .save(&path)
            .unwrap();

        let decoded = load_environment_texture(&path).unwrap();
        std::fs::remove_file(path).unwrap();
        assert!((decoded.pixels[0] - 0.21586).abs() < 0.0001);
        assert_eq!(decoded.pixels[1], 1.0);
        assert_eq!(decoded.pixels[2], 0.0);
        assert!((decoded.pixels[3] - 64.0 / 255.0).abs() < f32::EPSILON);
    }
}
