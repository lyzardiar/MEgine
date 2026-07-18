use crate::AssetError;
use std::path::Path;

pub const SURFACE_SHADER_HOOK_NAME: &str = "mengine_surface_hook";
const MAX_SURFACE_SHADER_BYTES: usize = 256 * 1024;

pub fn parse_surface_shader(bytes: &[u8]) -> Result<String, AssetError> {
    if bytes.len() > MAX_SURFACE_SHADER_BYTES {
        return Err(AssetError::Invalid(format!(
            "surface shader exceeds {} KiB",
            MAX_SURFACE_SHADER_BYTES / 1024
        )));
    }
    let source = std::str::from_utf8(bytes)
        .map_err(|_| AssetError::Invalid("surface shader must be UTF-8".into()))?
        .trim();
    if source.is_empty() {
        return Err(AssetError::Invalid("surface shader is empty".into()));
    }
    if source.contains('\0') {
        return Err(AssetError::Invalid(
            "surface shader contains a NUL character".into(),
        ));
    }
    if !source.contains(&format!("fn {SURFACE_SHADER_HOOK_NAME}")) {
        return Err(AssetError::Invalid(format!(
            "surface shader must define fn {SURFACE_SHADER_HOOK_NAME}"
        )));
    }
    Ok(format!("{source}\n"))
}

pub fn load_surface_shader(path: impl AsRef<Path>) -> Result<String, AssetError> {
    parse_surface_shader(&std::fs::read(path)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn surface_shader_requires_utf8_and_the_engine_hook() {
        let source = parse_surface_shader(
            br#"
              fn mengine_surface_hook(
                color: vec4<f32>,
                uv: vec2<f32>,
                world_position: vec3<f32>,
                world_normal: vec3<f32>,
              ) -> vec4<f32> { return color; }
            "#,
        )
        .unwrap();
        assert!(source.starts_with("fn mengine_surface_hook"));
        assert!(source.ends_with('\n'));
        assert!(parse_surface_shader(b"fn other() {}").is_err());
        assert!(parse_surface_shader(&[0xff, 0xfe]).is_err());
    }
}
