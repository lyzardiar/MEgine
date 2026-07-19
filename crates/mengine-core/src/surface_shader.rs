use serde::Deserialize;
use serde_json::Value;
use std::collections::HashSet;

pub const SURFACE_SHADER_PARAMETERS_MARKER: &str = "/* MENGINE_PARAMETERS";
pub const MAX_SURFACE_SHADER_PARAMETERS: usize = 16;

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

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RawSchema {
    parameters: Vec<RawParameter>,
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

pub fn parse_surface_shader_parameters(
    source: &str,
) -> Result<Vec<SurfaceShaderParameter>, String> {
    let Some(marker_start) = source.find(SURFACE_SHADER_PARAMETERS_MARKER) else {
        return Ok(Vec::new());
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
    let mut names = HashSet::new();
    raw.parameters
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
        .collect()
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
    }
}
