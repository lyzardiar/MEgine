use serde::Deserialize;
use serde_json::Value;
use std::collections::HashSet;

pub const SURFACE_SHADER_PARAMETERS_MARKER: &str = "/* MENGINE_PARAMETERS";
pub const MAX_SURFACE_SHADER_PARAMETERS: usize = 16;
pub const MAX_SURFACE_SHADER_KEYWORDS: usize = 16;
pub const MAX_SURFACE_SHADER_TEXTURES: usize = 4;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SurfaceShaderParameterType {
    Float,
    Vector2,
    Vector3,
    Vector4,
    Color,
}

impl SurfaceShaderParameterType {
    pub fn component_count(self) -> usize {
        match self {
            Self::Float => 1,
            Self::Vector2 => 2,
            Self::Vector3 => 3,
            Self::Vector4 | Self::Color => 4,
        }
    }

    pub fn wgsl_type(self) -> &'static str {
        match self {
            Self::Float => "f32",
            Self::Vector2 => "vec2<f32>",
            Self::Vector3 => "vec3<f32>",
            Self::Vector4 | Self::Color => "vec4<f32>",
        }
    }

    pub fn wgsl_swizzle(self) -> &'static str {
        match self {
            Self::Float => ".x",
            Self::Vector2 => ".xy",
            Self::Vector3 => ".xyz",
            Self::Vector4 | Self::Color => "",
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct SurfaceShaderParameter {
    pub name: String,
    pub label: String,
    pub parameter_type: SurfaceShaderParameterType,
    pub default: [f32; 4],
    pub min: Option<f32>,
    pub max: Option<f32>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SurfaceShaderKeyword {
    pub name: String,
    pub label: String,
    pub default: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SurfaceShaderTextureType {
    Color,
    Data,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SurfaceShaderTexture {
    pub name: String,
    pub label: String,
    pub texture_type: SurfaceShaderTextureType,
    pub default: String,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct SurfaceShaderSchema {
    pub parameters: Vec<SurfaceShaderParameter>,
    pub keywords: Vec<SurfaceShaderKeyword>,
    pub textures: Vec<SurfaceShaderTexture>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RawSchema {
    #[serde(default)]
    parameters: Vec<RawParameter>,
    #[serde(default)]
    keywords: Vec<RawKeyword>,
    #[serde(default)]
    textures: Vec<RawTexture>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RawParameter {
    name: String,
    #[serde(default)]
    label: String,
    #[serde(rename = "type")]
    parameter_type: String,
    default: Value,
    #[serde(default)]
    min: Option<f32>,
    #[serde(default)]
    max: Option<f32>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RawKeyword {
    name: String,
    #[serde(default)]
    label: String,
    #[serde(default)]
    default: bool,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RawTexture {
    name: String,
    #[serde(default)]
    label: String,
    #[serde(rename = "type")]
    texture_type: String,
    #[serde(default)]
    default: String,
}

fn valid_identifier(name: &str) -> bool {
    let mut characters = name.chars();
    matches!(characters.next(), Some(first) if first.is_ascii_alphabetic())
        && characters.all(|character| character.is_ascii_alphanumeric() || character == '_')
        && name.len() <= 48
}

fn parameter_type(value: &str) -> Result<SurfaceShaderParameterType, String> {
    match value {
        "float" => Ok(SurfaceShaderParameterType::Float),
        "vector2" => Ok(SurfaceShaderParameterType::Vector2),
        "vector3" => Ok(SurfaceShaderParameterType::Vector3),
        "vector4" => Ok(SurfaceShaderParameterType::Vector4),
        "color" => Ok(SurfaceShaderParameterType::Color),
        _ => Err(format!(
            "unsupported Surface Shader parameter type '{value}'"
        )),
    }
}

fn texture_type(value: &str) -> Result<SurfaceShaderTextureType, String> {
    match value {
        "color" => Ok(SurfaceShaderTextureType::Color),
        "data" => Ok(SurfaceShaderTextureType::Data),
        _ => Err(format!("unsupported Surface Shader texture type '{value}'")),
    }
}

fn texture_path(value: &str, name: &str) -> Result<String, String> {
    let normalized = value.trim().replace('\\', "/");
    if normalized.is_empty() {
        return Ok(normalized);
    }
    let lower = normalized.to_ascii_lowercase();
    if !normalized.starts_with("Assets/")
        || normalized
            .split('/')
            .any(|segment| segment.is_empty() || segment == "." || segment == "..")
        || ![".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tga"]
            .iter()
            .any(|extension| lower.ends_with(extension))
    {
        return Err(format!(
            "Surface Shader texture '{name}' default must be an Assets image path"
        ));
    }
    Ok(normalized)
}

fn parameter_default(
    value: &Value,
    kind: SurfaceShaderParameterType,
    name: &str,
) -> Result<[f32; 4], String> {
    let count = kind.component_count();
    let values = if count == 1 {
        vec![value
            .as_f64()
            .ok_or_else(|| format!("Surface Shader parameter '{name}' default must be a number"))?
            as f32]
    } else {
        let array = value.as_array().ok_or_else(|| {
            format!("Surface Shader parameter '{name}' default must contain {count} numbers")
        })?;
        if array.len() != count {
            return Err(format!(
                "Surface Shader parameter '{name}' default must contain {count} numbers"
            ));
        }
        array
            .iter()
            .map(|part| {
                part.as_f64().map(|number| number as f32).ok_or_else(|| {
                    format!("Surface Shader parameter '{name}' default contains a non-number")
                })
            })
            .collect::<Result<Vec<_>, _>>()?
    };
    if values.iter().any(|value| !value.is_finite()) {
        return Err(format!(
            "Surface Shader parameter '{name}' default must be finite"
        ));
    }
    let mut packed = [0.0; 4];
    packed[..count].copy_from_slice(&values);
    Ok(packed)
}

pub fn parse_surface_shader_schema(source: &str) -> Result<SurfaceShaderSchema, String> {
    let Some(marker_start) = source.find(SURFACE_SHADER_PARAMETERS_MARKER) else {
        return Ok(SurfaceShaderSchema::default());
    };
    let json_start = marker_start + SURFACE_SHADER_PARAMETERS_MARKER.len();
    let block_end = source[json_start..]
        .find("*/")
        .map(|offset| json_start + offset)
        .ok_or_else(|| "Surface Shader parameter block is not terminated".to_owned())?;
    if source[block_end + 2..].contains(SURFACE_SHADER_PARAMETERS_MARKER) {
        return Err("Surface Shader can contain only one parameter block".into());
    }
    let raw: RawSchema = serde_json::from_str(source[json_start..block_end].trim())
        .map_err(|error| format!("invalid Surface Shader parameter JSON: {error}"))?;
    if raw.parameters.len() > MAX_SURFACE_SHADER_PARAMETERS {
        return Err(format!(
            "Surface Shader declares more than {MAX_SURFACE_SHADER_PARAMETERS} parameters"
        ));
    }
    if raw.keywords.len() > MAX_SURFACE_SHADER_KEYWORDS {
        return Err(format!(
            "Surface Shader declares more than {MAX_SURFACE_SHADER_KEYWORDS} keywords"
        ));
    }
    if raw.textures.len() > MAX_SURFACE_SHADER_TEXTURES {
        return Err(format!(
            "Surface Shader declares more than {MAX_SURFACE_SHADER_TEXTURES} textures"
        ));
    }
    let mut names = HashSet::new();
    let parameters = raw
        .parameters
        .into_iter()
        .map(|parameter| {
            let name = parameter.name.trim().to_owned();
            if !valid_identifier(&name) {
                return Err(format!(
                    "Surface Shader parameter name '{name}' must be an ASCII identifier of at most 48 characters"
                ));
            }
            if !names.insert(name.clone()) {
                return Err(format!("duplicate Surface Shader parameter '{name}'"));
            }
            let label = if parameter.label.trim().is_empty() {
                name.replace('_', " ")
            } else {
                parameter.label.trim().to_owned()
            };
            if label.len() > 64 {
                return Err(format!(
                    "Surface Shader parameter '{name}' label exceeds 64 characters"
                ));
            }
            let kind = parameter_type(&parameter.parameter_type)?;
            let minimum = parameter
                .min
                .or((kind == SurfaceShaderParameterType::Color).then_some(0.0));
            let maximum = parameter
                .max
                .or((kind == SurfaceShaderParameterType::Color).then_some(1.0));
            if minimum.is_some_and(|value| !value.is_finite())
                || maximum.is_some_and(|value| !value.is_finite())
                || matches!((minimum, maximum), (Some(min), Some(max)) if min > max)
                || kind == SurfaceShaderParameterType::Color
                    && (minimum.is_some_and(|value| value < 0.0)
                        || maximum.is_some_and(|value| value > 1.0))
            {
                return Err(format!(
                    "Surface Shader parameter '{name}' has an invalid range"
                ));
            }
            let mut default = parameter_default(&parameter.default, kind, &name)?;
            for value in &mut default[..kind.component_count()] {
                if let Some(minimum) = minimum {
                    *value = value.max(minimum);
                }
                if let Some(maximum) = maximum {
                    *value = value.min(maximum);
                }
            }
            Ok(SurfaceShaderParameter {
                name,
                label,
                parameter_type: kind,
                default,
                min: minimum,
                max: maximum,
            })
        })
        .collect::<Result<Vec<_>, _>>()?;
    let mut keyword_names = HashSet::new();
    let keywords = raw
        .keywords
        .into_iter()
        .map(|keyword| {
            let name = keyword.name.trim().to_owned();
            if !valid_identifier(&name) {
                return Err(format!(
                    "Surface Shader keyword name '{name}' must be an ASCII identifier of at most 48 characters"
                ));
            }
            if !keyword_names.insert(name.clone()) {
                return Err(format!("duplicate Surface Shader keyword '{name}'"));
            }
            let label = if keyword.label.trim().is_empty() {
                name.replace('_', " ")
            } else {
                keyword.label.trim().to_owned()
            };
            if label.len() > 64 {
                return Err(format!(
                    "Surface Shader keyword '{name}' label exceeds 64 characters"
                ));
            }
            Ok(SurfaceShaderKeyword {
                name,
                label,
                default: keyword.default,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    let mut texture_names = HashSet::new();
    let textures = raw
        .textures
        .into_iter()
        .map(|texture| {
            let name = texture.name.trim().to_owned();
            if !valid_identifier(&name) {
                return Err(format!(
                    "Surface Shader texture name '{name}' must be an ASCII identifier of at most 48 characters"
                ));
            }
            if !texture_names.insert(name.clone()) {
                return Err(format!("duplicate Surface Shader texture '{name}'"));
            }
            let label = if texture.label.trim().is_empty() {
                name.replace('_', " ")
            } else {
                texture.label.trim().to_owned()
            };
            if label.len() > 64 {
                return Err(format!(
                    "Surface Shader texture '{name}' label exceeds 64 characters"
                ));
            }
            Ok(SurfaceShaderTexture {
                name: name.clone(),
                label,
                texture_type: texture_type(&texture.texture_type)?,
                default: texture_path(&texture.default, &name)?,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    Ok(SurfaceShaderSchema {
        parameters,
        keywords,
        textures,
    })
}

pub fn parse_surface_shader_parameters(
    source: &str,
) -> Result<Vec<SurfaceShaderParameter>, String> {
    Ok(parse_surface_shader_schema(source)?.parameters)
}

pub fn parse_surface_shader_keywords(source: &str) -> Result<Vec<SurfaceShaderKeyword>, String> {
    Ok(parse_surface_shader_schema(source)?.keywords)
}

pub fn parse_surface_shader_textures(source: &str) -> Result<Vec<SurfaceShaderTexture>, String> {
    Ok(parse_surface_shader_schema(source)?.textures)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_reflected_parameters_in_stable_declaration_order() {
        let parameters = parse_surface_shader_parameters(
            r#"/* MENGINE_PARAMETERS
            {"parameters":[
              {"name":"rim_color","label":"Rim Color","type":"color","default":[2,0.5,-1,1]},
              {"name":"rim_power","type":"float","default":2,"min":0,"max":8}
            ]}
            */
            fn mengine_lit_surface_hook() {}"#,
        )
        .unwrap();
        assert_eq!(parameters.len(), 2);
        assert_eq!(parameters[0].name, "rim_color");
        assert_eq!(parameters[0].default, [1.0, 0.5, 0.0, 1.0]);
        assert_eq!(parameters[1].label, "rim power");
        assert_eq!(parameters[1].default, [2.0, 0.0, 0.0, 0.0]);
    }

    #[test]
    fn rejects_duplicate_invalid_and_oversized_parameter_schemas() {
        let wrap = |json: &str| format!("/* MENGINE_PARAMETERS\n{json}\n*/");
        assert!(parse_surface_shader_parameters(&wrap(
            r#"{"parameters":[{"name":"bad-name","type":"float","default":0}]}"#
        ))
        .is_err());
        assert!(parse_surface_shader_parameters(&wrap(
            r#"{"parameters":[{"name":"x","type":"float","default":0},{"name":"x","type":"float","default":1}]}"#
        ))
        .is_err());
        assert!(parse_surface_shader_parameters(&format!(
            "{}{}",
            wrap(r#"{"parameters":[]}"#),
            wrap(r#"{"parameters":[]}"#)
        ))
        .is_err());
        assert!(parse_surface_shader_parameters(&wrap(
            r#"{"parameters":[{"name":"tint","type":"color","default":[1,1,1,1],"min":2}]}"#
        ))
        .is_err());
        assert!(parse_surface_shader_parameters(&wrap(
            r#"{"parameters":[{"name":"tint","type":"color","default":[1,1,1,1],"max":2}]}"#
        ))
        .is_err());
    }

    #[test]
    fn parses_and_validates_shader_keywords() {
        let schema = parse_surface_shader_schema(
            r#"/* MENGINE_PARAMETERS
            {"parameters":[],"keywords":[
              {"name":"USE_RIM","label":"Use Rim","default":true},
              {"name":"USE_DETAIL"}
            ]}
            */"#,
        )
        .unwrap();
        assert_eq!(schema.keywords.len(), 2);
        assert_eq!(schema.keywords[0].label, "Use Rim");
        assert!(schema.keywords[0].default);
        assert!(!schema.keywords[1].default);
        assert!(parse_surface_shader_schema(
            r#"/* MENGINE_PARAMETERS {"keywords":[{"name":"BAD-NAME"}]} */"#
        )
        .is_err());
        assert!(parse_surface_shader_schema(
            r#"/* MENGINE_PARAMETERS {"keywords":[{"name":"DUP"},{"name":"DUP"}]} */"#
        )
        .is_err());
    }

    #[test]
    fn parses_and_validates_shader_textures() {
        let schema = parse_surface_shader_schema(
            r#"/* MENGINE_PARAMETERS
            {"textures":[
              {"name":"detail_color","label":"Detail Color","type":"color","default":"Assets/Textures/detail.png"},
              {"name":"mask","type":"data"}
            ]}
            */"#,
        )
        .unwrap();
        assert_eq!(schema.textures.len(), 2);
        assert_eq!(schema.textures[0].label, "Detail Color");
        assert_eq!(
            schema.textures[0].texture_type,
            SurfaceShaderTextureType::Color
        );
        assert_eq!(schema.textures[0].default, "Assets/Textures/detail.png");
        assert_eq!(
            schema.textures[1].texture_type,
            SurfaceShaderTextureType::Data
        );
        assert!(parse_surface_shader_schema(
            r#"/* MENGINE_PARAMETERS {"textures":[{"name":"BAD-NAME","type":"color"}]} */"#
        )
        .is_err());
        assert!(parse_surface_shader_schema(
            r#"/* MENGINE_PARAMETERS {"textures":[{"name":"detail","type":"cube"}]} */"#
        )
        .is_err());
        assert!(parse_surface_shader_schema(
            r#"/* MENGINE_PARAMETERS {"textures":[{"name":"detail","type":"data","default":"../outside.png"}]} */"#
        )
        .is_err());
    }
}
