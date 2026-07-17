use crate::{AssetError, TextureRgba8};
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

    #[test]
    fn decodes_texture_files_to_tightly_packed_rgba8() {
        let path = std::env::temp_dir().join(format!(
            "mengine-texture-{}-{}.png",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
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
}
