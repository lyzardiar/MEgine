//! Unity serialization adapters; references remain strings. Author: MiYu.
use anyhow::{Context, Result};
use serde_json::{json, Value};
use std::collections::BTreeMap;

pub(crate) fn number(v: &Value, default: f64) -> f64 {
    v.as_f64().unwrap_or(default)
}
fn enabled(v: &Value) -> bool {
    number(&v["enabled"], 0.) != 0.
}
pub(crate) fn vector(v: &Value, axes: &[&str], defaults: &[f64]) -> Vec<f64> {
    axes.iter()
        .zip(defaults)
        .map(|(a, d)| number(&v[*a], *d))
        .collect()
}
pub(crate) fn vec3(v: &Value, default: f64) -> Vec<f64> {
    vector(v, &["x", "y", "z"], &[default; 3])
}
fn color(v: &Value) -> Vec<f64> {
    vector(v, &["r", "g", "b", "a"], &[1.; 4])
}
fn constant(v: f64) -> Value {
    json!({"mode":"constant","constant":v,"constant_min":v,"multiplier":1.})
}
fn keys(v: &Value) -> Vec<Value> {
    v["m_Curve"].as_array().into_iter().flatten().map(|k|json!({"time":number(&k["time"],0.),"value":number(&k["value"],0.),"in_tangent":number(&k["inSlope"],0.),"out_tangent":number(&k["outSlope"],0.)})).collect()
}
fn curve(v: &Value) -> Value {
    let mode = match v["minMaxState"].as_u64().unwrap_or(0) {
        1 => "curve",
        2 => "two_curves",
        3 => "two_constants",
        _ => "constant",
    };
    json!({"mode":mode,"constant":number(&v["scalar"],0.),"constant_min":number(&v["minScalar"],0.),"multiplier":number(&v["scalar"],1.),"keys":keys(&v["maxCurve"]),"keys_min":keys(&v["minCurve"])})
}
fn gradient_keys(v: &Value) -> Vec<Value> {
    let colors: Vec<_> = (0..v["m_NumColorKeys"].as_u64().unwrap_or(0).min(8))
        .map(|i| {
            (
                number(&v[format!("ctime{i}")], 0.) / 65535.,
                color(&v[format!("key{i}")]),
            )
        })
        .collect();
    let alphas: Vec<_> = (0..v["m_NumAlphaKeys"].as_u64().unwrap_or(0).min(8))
        .map(|i| {
            (
                number(&v[format!("atime{i}")], 0.) / 65535.,
                number(&v[format!("key{i}")]["a"], 1.),
            )
        })
        .collect();
    let mut times: Vec<f64> = colors
        .iter()
        .map(|p| p.0)
        .chain(alphas.iter().map(|p| p.0))
        .collect();
    times.sort_by(f64::total_cmp);
    times.dedup();
    fn sample(points: &[(f64, f64)], time: f64) -> f64 {
        if points.is_empty() {
            return 1.;
        }
        if time <= points[0].0 {
            return points[0].1;
        }
        for p in points.windows(2) {
            if time <= p[1].0 {
                let t = (time - p[0].0) / (p[1].0 - p[0].0).max(f64::EPSILON);
                return p[0].1 + (p[1].1 - p[0].1) * t;
            }
        }
        points.last().unwrap().1
    }
    times
        .into_iter()
        .map(|time| {
            let mut c = Vec::new();
            for channel in 0..3 {
                c.push(sample(
                    &colors
                        .iter()
                        .map(|p| (p.0, p.1[channel]))
                        .collect::<Vec<_>>(),
                    time,
                ));
            }
            c.push(sample(&alphas, time));
            json!({"time":time,"color":c})
        })
        .collect()
}
fn gradient(v: &Value) -> Value {
    json!({"mode":match v["minMaxState"].as_u64().unwrap_or(0){1=>"gradient",2=>"two_colors",3=>"two_gradients",_=>"color"},"color":color(&v["maxColor"]),"color_min":color(&v["minColor"]),"keys":gradient_keys(&v["maxGradient"]),"keys_min":gradient_keys(&v["minGradient"])})
}
pub(crate) fn material(v: &Value, paths: &BTreeMap<String, String>) -> Value {
    let properties = &v["m_SavedProperties"];
    let mut floats = serde_json::Map::new();
    let mut colors = serde_json::Map::new();
    let mut textures = serde_json::Map::new();
    for item in properties["m_Floats"].as_array().into_iter().flatten() {
        if let Some(o) = item.as_object() {
            for (k, v) in o {
                floats.insert(k.clone(), v.clone());
            }
        }
    }
    for item in properties["m_Colors"].as_array().into_iter().flatten() {
        if let Some(o) = item.as_object() {
            for (k, v) in o {
                colors.insert(k.clone(), json!(color(v)));
            }
        }
    }
    for item in properties["m_TexEnvs"].as_array().into_iter().flatten() {
        if let Some(o) = item.as_object() {
            for (k, v) in o {
                if let Some(path) = v["m_Texture"]["guid"].as_str().and_then(|g| paths.get(g)) {
                    textures.insert(k.clone(),json!({"path":path,"scale":vector(&v["m_Scale"],&["x","y"],&[1.;2]),"offset":vector(&v["m_Offset"],&["x","y"],&[0.;2])}));
                }
            }
        }
    }
    json!({"shader":if v["m_Shader"]["guid"]=="f31c201e480f44f9a78911601ee5cab2"{"VFX/EffectURP_V2_3D"}else{"unsupported"},"floats":floats,"colors":colors,"textures":textures,"source_shader":v["m_Shader"],"keywords":material_keywords(v)})
}
pub(crate) fn definition(
    name: &str,
    p: &Value,
    r: &Value,
    materials: &BTreeMap<String, Value>,
    paths: &BTreeMap<String, String>,
) -> Result<Value> {
    let initial = &p["InitialModule"];
    let shape = &p["ShapeModule"];
    let emission = &p["EmissionModule"];
    let mode = match r["m_RenderMode"].as_u64().unwrap_or(0) {
        4 => "mesh",
        1 => "stretch",
        _ => "billboard",
    };
    let material_guid = r["m_Materials"][0]["guid"]
        .as_str()
        .context("Particle renderer has no material GUID")?;
    let mut mat = materials
        .get(material_guid)
        .context("Particle material missing")?
        .clone();
    mat["source_guid"] = json!(material_guid);
    let size = curve(&initial["startSize"]);
    let size3d = number(&initial["size3D"], 0.) != 0.;
    let rot3d = number(&initial["rotation3D"], 0.) != 0.;
    let bursts: Vec<_> = if enabled(emission) {
        emission["m_Bursts"].as_array().into_iter().flatten().map(|b|json!({"time":number(&b["time"],0.),"count":curve(&b["countCurve"]),"cycles":b["cycleCount"].as_u64().unwrap_or(1),"interval":number(&b["repeatInterval"],0.),"probability":number(&b["probability"],1.)})).collect()
    } else {
        vec![]
    };
    let mut out = json!({"version":1,"name":name,"seed":p["randomSeed"].as_u64().unwrap_or(1),"duration":number(&p["lengthInSec"],5.),"simulation_speed":number(&p["simulationSpeed"],1.),"looping":number(&p["looping"],0.)!=0.,"start_delay":curve(&p["startDelay"]),"max_particles":initial["maxNumParticles"].as_u64().unwrap_or(1000),"simulation_space":if number(&p["moveWithTransform"],0.)==0.{"local"}else{"world"},"start_lifetime":curve(&initial["startLifetime"]),"start_speed":curve(&initial["startSpeed"]),"start_size":[size.clone(),if size3d{curve(&initial["startSizeY"])}else{size.clone()},if size3d{curve(&initial["startSizeZ"])}else{size}],"start_rotation":[if rot3d{curve(&initial["startRotationX"])}else{constant(0.)},if rot3d{curve(&initial["startRotationY"])}else{constant(0.)},curve(&initial["startRotation"])],"start_color":gradient(&initial["startColor"]),"gravity":[0.,-9.81*number(&initial["gravityModifier"]["scalar"],0.),0.],"rate_over_time":if enabled(emission){curve(&emission["rateOverTime"])}else{constant(0.)},"bursts":bursts,
        "shape":{"kind":if !enabled(shape){"point"}else{match shape["type"].as_u64().unwrap_or(0){0|1=>"sphere",2|3=>"hemisphere",4|7=>"cone",5=>"box",8|9=>"cone_volume",10|11=>"circle",12=>"edge",_=>"point"}},"radius":number(&shape["radius"]["value"],1.),"radius_thickness":number(&shape["radiusThickness"],1.),"angle_degrees":number(&shape["angle"],25.),"arc_degrees":number(&shape["arc"]["value"],360.),"length":number(&shape["length"],0.),"position":vec3(&shape["m_Position"],0.),"rotation":vec3(&shape["m_Rotation"],0.).into_iter().map(f64::to_radians).collect::<Vec<_>>(),"scale":vec3(&shape["m_Scale"],1.),"random_direction":number(&shape["randomDirectionAmount"],0.),"spherical_direction":number(&shape["sphericalDirectionAmount"],0.),"align_to_direction":number(&shape["alignToDirection"],0.)!=0.},
        "renderer":{"mode":mode,"mesh":r["m_Mesh"]["guid"].as_str().and_then(|g|paths.get(g)).cloned().unwrap_or_default(),"alignment":match r["m_RenderAlignment"].as_u64().unwrap_or(0){1=>"world",2=>"local",_=>"view"},"pivot":vec3(&r["m_Pivot"],0.),"length_scale":number(&r["m_LengthScale"],2.),"velocity_scale":number(&r["m_VelocityScale"],0.),"sorting_fudge":number(&r["m_SortingFudge"],0.)},"material":mat});
    out["coordinate_space"] = json!("unity");
    out["scaling_mode"] = json!("hierarchy");
    out["renderer"]["mesh_basis"] = json!("unity_shared_mesh_fbx2gltf");
    let size = &p["SizeModule"];
    if enabled(size) {
        let x = curve(&size["curve"]);
        out["size_over_lifetime"] = if number(&size["separateAxes"], 0.) != 0. {
            json!([x, curve(&size["y"]), curve(&size["z"])])
        } else {
            json!([x, x, x])
        };
    }
    let rotation = &p["RotationModule"];
    if enabled(rotation) {
        out["rotation_over_lifetime"] = json!([
            if number(&rotation["separateAxes"], 0.) != 0. {
                curve(&rotation["x"])
            } else {
                constant(0.)
            },
            if number(&rotation["separateAxes"], 0.) != 0. {
                curve(&rotation["y"])
            } else {
                constant(0.)
            },
            curve(&rotation["curve"])
        ]);
    }
    let color = &p["ColorModule"];
    if enabled(color) {
        out["color_over_lifetime"] = gradient(&color["gradient"]);
    }
    let velocity = &p["VelocityModule"];
    if enabled(velocity) {
        out["velocity_over_lifetime"] = json!([
            curve(&velocity["x"]),
            curve(&velocity["y"]),
            curve(&velocity["z"])
        ]);
    }
    let limit = &p["ClampVelocityModule"];
    if enabled(limit) {
        out["limit_velocity"] = json!({"limit":curve(&limit["magnitude"]),"dampen":number(&limit["dampen"],0.),"drag":curve(&limit["drag"])});
    }
    let uv = &p["UVModule"];
    if enabled(uv) {
        out["texture_sheet"] = json!({"tiles":[uv["tilesX"].as_u64().unwrap_or(1),uv["tilesY"].as_u64().unwrap_or(1)],"frame_over_time":curve(&uv["frameOverTime"]),"start_frame":curve(&uv["startFrame"]),"cycles":number(&uv["cycles"],1.),"row":if number(&uv["animationType"],0.)==1.{uv["rowIndex"].as_u64()}else{None},"random_row":number(&uv["rowMode"],0.)==0.});
    }
    let custom = &p["CustomDataModule"];
    if enabled(custom) {
        for slot in 0..2 {
            if number(&custom[format!("mode{slot}")], 0.) == 1. {
                out[format!("custom_data{}", slot + 1)] = json!((0..4)
                    .map(|i| curve(&custom[format!("vector{slot}_{i}")]))
                    .collect::<Vec<_>>());
            }
        }
    }
    Ok(out)
}
pub(crate) fn diagnostics(p: &Value, blockers: &mut Vec<String>, path: &str) {
    let supported = [
        "InitialModule",
        "ShapeModule",
        "EmissionModule",
        "SizeModule",
        "RotationModule",
        "ColorModule",
        "UVModule",
        "VelocityModule",
        "ClampVelocityModule",
        "CustomDataModule",
    ];
    if let Some(o) = p.as_object() {
        for (k, v) in o {
            if k.ends_with("Module") && enabled(v) && !supported.contains(&k.as_str()) {
                blockers.push(format!(
                    "{path}: enabled particle module {k} is unsupported"
                ));
            }
        }
    }
    if enabled(&p["ShapeModule"])
        && ![0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12]
            .contains(&p["ShapeModule"]["type"].as_u64().unwrap_or(0))
    {
        blockers.push(format!(
            "{path}: unsupported particle shape type {}",
            p["ShapeModule"]["type"]
        ));
    }
    let limit = &p["ClampVelocityModule"];
    if enabled(limit)
        && (number(&limit["separateAxis"], 0.) != 0.
            || (number(&limit["drag"]["scalar"], 0.) != 0.
                && (number(&limit["multiplyDragByParticleSize"], 0.) != 0.
                    || number(&limit["multiplyDragByParticleVelocity"], 0.) != 0.)))
    {
        blockers.push(format!(
            "{path}: separate-axis velocity limit or scaled drag is unsupported"
        ));
    }
    if number(&p["moveWithTransform"], 0.) > 1. || number(&p["scalingMode"], 0.) != 0. {
        blockers.push(format!(
            "{path}: custom simulation space or non-hierarchy particle scaling is unsupported"
        ));
    }
    if number(&p["prewarm"], 0.) != 0. {
        blockers.push(format!(
            "{path}: prewarmed particle simulation is unsupported"
        ));
    }
    let uv = &p["UVModule"];
    if enabled(uv)
        && (number(&uv["mode"], 0.) != 0.
            || number(&uv["timeMode"], 0.) != 0.
            || number(&uv["flipU"], 0.) != 0.
            || number(&uv["flipV"], 0.) != 0.)
    {
        blockers.push(format!(
            "{path}: sprite, speed/FPS or flipped texture-sheet animation is unsupported"
        ));
    }
    let custom = &p["CustomDataModule"];
    if enabled(custom) && (number(&custom["mode0"], 0.) > 1. || number(&custom["mode1"], 0.) > 1.) {
        blockers.push(format!(
            "{path}: custom particle color streams are unsupported"
        ));
    }
    let shape = &p["ShapeModule"];
    if enabled(shape)
        && (number(&shape["radius"]["mode"], 0.) != 0.
            || number(&shape["arc"]["mode"], 0.) != 0.
            || number(&shape["randomPositionAmount"], 0.) != 0.)
    {
        blockers.push(format!(
            "{path}: animated shape radius/arc or random position is unsupported"
        ));
    }
    let emission = &p["EmissionModule"];
    if enabled(emission) && curve_is_nonzero(&emission["rateOverDistance"]) {
        blockers.push(format!(
            "{path}: rate-over-distance emission is unsupported"
        ));
    }
    let velocity = &p["VelocityModule"];
    if enabled(velocity)
        && (number(&velocity["inWorldSpace"], 0.) != 0.
            || [
                "orbitalX",
                "orbitalY",
                "orbitalZ",
                "orbitalOffsetX",
                "orbitalOffsetY",
                "orbitalOffsetZ",
                "radial",
            ]
            .iter()
            .any(|k| curve_is_nonzero(&velocity[*k])))
    {
        blockers.push(format!(
            "{path}: world-space, orbital or radial velocity modules are unsupported"
        ));
    }
}
fn curve_is_nonzero(curve: &Value) -> bool {
    match curve["minMaxState"].as_u64().unwrap_or(0) {
        0 => number(&curve["scalar"], 0.) != 0.,
        3 => number(&curve["scalar"], 0.) != 0. || number(&curve["minScalar"], 0.) != 0.,
        _ => {
            number(&curve["scalar"], 0.) != 0.
                && ["maxCurve", "minCurve"].iter().any(|name| {
                    curve[*name]["m_Curve"]
                        .as_array()
                        .into_iter()
                        .flatten()
                        .any(|k| number(&k["value"], 0.) != 0.)
                })
        }
    }
}
pub(crate) fn renderer_diagnostics(renderer: &Value, blockers: &mut Vec<String>, path: &str) {
    if ![0, 1, 4].contains(&renderer["m_RenderMode"].as_u64().unwrap_or(0)) {
        blockers.push(format!(
            "{path}: particle renderer mode {} is unsupported",
            renderer["m_RenderMode"]
        ));
    }
    if ![0, 1, 2].contains(&renderer["m_RenderAlignment"].as_u64().unwrap_or(0)) {
        blockers.push(format!(
            "{path}: particle renderer alignment {} is unsupported",
            renderer["m_RenderAlignment"]
        ));
    }
    if ["m_Mesh1", "m_Mesh2", "m_Mesh3"]
        .iter()
        .any(|k| super::ref_id(&renderer[*k]) != "0")
    {
        blockers.push(format!(
            "{path}: random selection among multiple particle meshes is unsupported"
        ));
    }
}
fn material_keywords(material: &Value) -> Vec<String> {
    if let Some(keywords) = material["m_ValidKeywords"].as_array() {
        keywords
            .iter()
            .filter_map(Value::as_str)
            .map(str::to_owned)
            .collect()
    } else {
        material["m_ShaderKeywords"]
            .as_str()
            .unwrap_or("")
            .split_whitespace()
            .map(str::to_owned)
            .collect()
    }
}
pub(crate) fn material_diagnostics(material: &Value, warnings: &mut Vec<String>, path: &str) {
    let supported = [
        "_CustomData_ON",
        "_MASK_ON",
        "_NOISE_ON",
        "_DISSOLVE_SOFT",
        "_Sub_ON",
    ];
    for keyword in material_keywords(material) {
        if keyword == "_ENABLE_FOG_TRANS" {
            warnings.push(format!(
                "{path}: transparent scene fog is disabled in the standalone particle preview"
            ));
        } else if !supported.contains(&keyword.as_str()) {
            warnings.push(format!("{path}: active shader keyword {keyword} has no native adapter; material preview is approximate"));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn unsupported_enabled_modules_and_shapes_block_import() {
        for input in [
            json!({"NoiseModule":{"enabled":1}}),
            json!({"ShapeModule":{"enabled":1,"type":13}}),
            json!({"UVModule":{"enabled":1,"timeMode":1}}),
        ] {
            let mut blockers = vec![];
            diagnostics(&input, &mut blockers, "sample");
            assert!(!blockers.is_empty());
        }
        let mut blockers = vec![];
        diagnostics(
            &json!({"NoiseModule":{"enabled":0}}),
            &mut blockers,
            "sample",
        );
        assert!(blockers.is_empty());
    }
    #[test]
    fn unknown_shader_keywords_and_fog_are_explicit_diagnostics() {
        let mut warnings = vec![];
        material_diagnostics(
            &json!({"m_ValidKeywords":["_MASK_ON","_ENABLE_FOG_TRANS","_UNKNOWN"]}),
            &mut warnings,
            "sample",
        );
        assert_eq!(warnings.len(), 2);
        assert!(warnings.iter().any(|s| s.contains("approximate")));
        assert!(warnings.iter().any(|s| s.contains("fog is disabled")));
    }
    #[test]
    fn modern_unity_space_and_cone_volume_are_preserved() {
        let system =
            json!({"moveWithTransform":0,"ShapeModule":{"enabled":1,"type":8},"InitialModule":{}});
        let renderer = json!({"m_Materials":[{"guid":"material"}]});
        let materials = BTreeMap::from([(
            "material".into(),
            json!({"floats":{},"colors":{},"textures":{}}),
        )]);
        let result =
            definition("sample", &system, &renderer, &materials, &BTreeMap::new()).unwrap();
        assert_eq!(result["simulation_space"], "local");
        assert_eq!(result["shape"]["kind"], "cone_volume");
        assert_eq!(result["coordinate_space"], "unity");
        assert_eq!(
            result["renderer"]["mesh_basis"],
            "unity_shared_mesh_fbx2gltf"
        );
    }
    #[test]
    fn unity_curve_modes_are_not_swapped() {
        assert_eq!(curve(&json!({"minMaxState":2}))["mode"], "two_curves");
        assert_eq!(curve(&json!({"minMaxState":3}))["mode"], "two_constants");
    }
    #[test]
    fn gradient_merges_independent_alpha_times() {
        let keys = gradient_keys(
            &json!({"m_NumColorKeys":2,"m_NumAlphaKeys":3,"key0":{"r":0,"g":0,"b":0,"a":0},"key1":{"r":1,"g":1,"b":1,"a":1},"key2":{"a":0},"ctime0":0,"ctime1":65535,"atime0":0,"atime1":32768,"atime2":65535}),
        );
        assert_eq!(keys.len(), 3);
        assert_eq!(keys[1]["color"][3], 1.);
        assert_eq!(keys[2]["color"][3], 0.);
    }
}
