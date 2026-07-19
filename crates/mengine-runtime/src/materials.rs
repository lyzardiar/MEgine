use crate::textures::resolve_project_asset_path;
use mengine_assets::{
    load_material_asset, load_material_instance_asset, load_surface_shader, MaterialAsset,
    MaterialBlendMode as AssetMaterialBlendMode, MaterialFilter as AssetMaterialFilter,
    MaterialInstanceAsset, MaterialShader, MaterialSurface, MaterialWrap as AssetMaterialWrap,
};
use mengine_core::generated::MaterialPropertyBlock;
use mengine_rhi::{
    validate_surface_shader_hook, MaterialBlendMode, MaterialFilter, MaterialWrap, RenderMaterial,
};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::SystemTime;

#[derive(Clone)]
struct CachedMaterial {
    modified: Option<SystemTime>,
    result: Result<Arc<MaterialAsset>, String>,
}

#[derive(Clone)]
struct CachedSurfaceShader {
    modified: Option<SystemTime>,
    result: Result<Arc<String>, String>,
}

#[derive(Clone)]
struct CachedMaterialInstance {
    modified: Option<SystemTime>,
    result: Result<Arc<MaterialInstanceAsset>, String>,
}

#[derive(Default)]
pub struct RuntimeMaterialCache {
    project_root: Option<PathBuf>,
    materials: HashMap<PathBuf, CachedMaterial>,
    instances: HashMap<PathBuf, CachedMaterialInstance>,
    surface_shaders: HashMap<PathBuf, CachedSurfaceShader>,
    reported_failures: HashSet<(String, String)>,
}

impl RuntimeMaterialCache {
    pub fn new(project_root: Option<PathBuf>) -> Self {
        Self {
            project_root,
            materials: HashMap::new(),
            instances: HashMap::new(),
            surface_shaders: HashMap::new(),
            reported_failures: HashSet::new(),
        }
    }

    pub fn resolve(&mut self, key: &str) -> Option<RenderMaterial> {
        let normalized = key.trim();
        if !is_material_path(normalized) {
            return None;
        }
        match self.resolve_asset(normalized) {
            Ok(material) => {
                self.reported_failures
                    .retain(|(reported_key, _)| reported_key != normalized);
                let mut render = render_material_from_asset(&material);
                if material.shader == MaterialShader::Custom {
                    match self.load_custom_shader(&material.custom_shader) {
                        Ok(source) => render.surface_shader = (*source).clone(),
                        Err(error) => {
                            if self
                                .reported_failures
                                .insert((material.custom_shader.clone(), error.clone()))
                            {
                                log::warn!(
                                    "custom shader '{}' could not be loaded: {}",
                                    material.custom_shader,
                                    error
                                );
                            }
                        }
                    }
                }
                Some(render)
            }
            Err(error) => {
                if self
                    .reported_failures
                    .insert((normalized.to_owned(), error.clone()))
                {
                    log::warn!("material '{}' could not be loaded: {}", normalized, error);
                }
                Some(RenderMaterial::default())
            }
        }
    }

    pub fn invalidate(&mut self, key: &str) {
        let Some(root) = self.project_root.as_deref() else {
            return;
        };
        if let Some(path) = resolve_project_asset_path(root, key) {
            self.materials.remove(&path);
            self.instances.remove(&path);
            self.surface_shaders.remove(&path);
        }
    }

    pub fn resolve_asset(&mut self, key: &str) -> Result<MaterialAsset, String> {
        let mut chain = Vec::new();
        self.resolve_asset_inner(key.trim(), &mut chain)
    }

    fn resolve_asset_inner(
        &mut self,
        key: &str,
        chain: &mut Vec<PathBuf>,
    ) -> Result<MaterialAsset, String> {
        if chain.len() >= 32 {
            return Err("material instance inheritance exceeds 32 levels".into());
        }
        let root = self
            .project_root
            .as_deref()
            .ok_or_else(|| "runtime requires --project-root to resolve materials".to_owned())?;
        let path = resolve_project_asset_path(root, key)
            .ok_or_else(|| "material path must be project-relative without '..'".to_owned())?;
        if let Some(index) = chain.iter().position(|ancestor| ancestor == &path) {
            let mut cycle = chain[index..]
                .iter()
                .map(|entry| entry.display().to_string())
                .collect::<Vec<_>>();
            cycle.push(path.display().to_string());
            return Err(format!(
                "material instance inheritance cycle: {}",
                cycle.join(" -> ")
            ));
        }
        chain.push(path);
        let lower = key.to_ascii_lowercase();
        let resolved = if lower.ends_with(".minst") {
            let instance = self.load_instance(key)?;
            let parent = self.resolve_asset_inner(&instance.parent, chain)?;
            instance.apply_to(parent)
        } else if lower.ends_with(".mmat") || lower.ends_with(".mat") {
            (*self.load(key)?).clone()
        } else {
            return Err("material path must end with .mmat, .mat, or .minst".into());
        };
        chain.pop();
        Ok(resolved)
    }

    fn load(&mut self, key: &str) -> Result<Arc<MaterialAsset>, String> {
        let root = self
            .project_root
            .as_deref()
            .ok_or_else(|| "runtime requires --project-root to resolve materials".to_owned())?;
        let path = resolve_project_asset_path(root, key)
            .ok_or_else(|| "material path must be project-relative without '..'".to_owned())?;
        let modified = std::fs::metadata(&path)
            .and_then(|metadata| metadata.modified())
            .ok();
        let reload = self
            .materials
            .get(&path)
            .is_none_or(|cached| cached.modified != modified);
        if reload {
            let result = load_material_asset(&path)
                .map(Arc::new)
                .map_err(|error| error.to_string());
            self.materials
                .insert(path.clone(), CachedMaterial { modified, result });
        }
        self.materials
            .get(&path)
            .expect("material cache inserted")
            .result
            .clone()
    }

    fn load_instance(&mut self, key: &str) -> Result<Arc<MaterialInstanceAsset>, String> {
        let root = self
            .project_root
            .as_deref()
            .ok_or_else(|| "runtime requires --project-root to resolve materials".to_owned())?;
        let path = resolve_project_asset_path(root, key).ok_or_else(|| {
            "material instance path must be project-relative without '..'".to_owned()
        })?;
        let modified = std::fs::metadata(&path)
            .and_then(|metadata| metadata.modified())
            .ok();
        let reload = self
            .instances
            .get(&path)
            .is_none_or(|cached| cached.modified != modified);
        if reload {
            let result = load_material_instance_asset(&path)
                .map(Arc::new)
                .map_err(|error| error.to_string());
            self.instances
                .insert(path.clone(), CachedMaterialInstance { modified, result });
        }
        self.instances
            .get(&path)
            .expect("material instance cache inserted")
            .result
            .clone()
    }

    fn load_custom_shader(&mut self, key: &str) -> Result<Arc<String>, String> {
        let normalized = key.trim();
        if normalized.is_empty() {
            return Err("custom material requires a .mshader asset".into());
        }
        if !normalized.to_ascii_lowercase().ends_with(".mshader") {
            return Err("custom shader path must end with .mshader".into());
        }
        let root = self
            .project_root
            .as_deref()
            .ok_or_else(|| "runtime requires --project-root to resolve shaders".to_owned())?;
        let path = resolve_project_asset_path(root, normalized)
            .ok_or_else(|| "shader path must be project-relative without '..'".to_owned())?;
        let modified = std::fs::metadata(&path)
            .and_then(|metadata| metadata.modified())
            .ok();
        let reload = self
            .surface_shaders
            .get(&path)
            .is_none_or(|cached| cached.modified != modified);
        if reload {
            let result = load_surface_shader(&path)
                .map_err(|error| error.to_string())
                .and_then(|source| {
                    validate_surface_shader_hook(&source)?;
                    Ok(Arc::new(source))
                });
            self.surface_shaders
                .insert(path.clone(), CachedSurfaceShader { modified, result });
        }
        self.surface_shaders
            .get(&path)
            .expect("surface shader cache inserted")
            .result
            .clone()
    }
}

fn is_material_path(key: &str) -> bool {
    let lower = key.to_ascii_lowercase();
    lower.ends_with(".mmat") || lower.ends_with(".mat") || lower.ends_with(".minst")
}

pub fn render_material_from_asset(material: &MaterialAsset) -> RenderMaterial {
    RenderMaterial {
        base_color: material.base_color,
        metallic: material.metallic,
        roughness: material.roughness,
        ior: material.ior,
        clearcoat: material.clearcoat,
        clearcoat_roughness: material.clearcoat_roughness,
        emissive: material.emissive,
        emissive_strength: material.emissive_strength,
        unlit: material.shader == MaterialShader::Unlit,
        double_sided: material.double_sided,
        transparent: material.surface == MaterialSurface::Transparent,
        blend_mode: match material.blend_mode {
            AssetMaterialBlendMode::Alpha => MaterialBlendMode::Alpha,
            AssetMaterialBlendMode::Premultiplied => MaterialBlendMode::Premultiplied,
            AssetMaterialBlendMode::Additive => MaterialBlendMode::Additive,
            AssetMaterialBlendMode::Multiply => MaterialBlendMode::Multiply,
        },
        depth_write: material.surface != MaterialSurface::Transparent
            || material.transparent_depth_write,
        render_queue: if material.render_queue >= 0 {
            material.render_queue
        } else {
            match material.surface {
                MaterialSurface::Opaque => 2000,
                MaterialSurface::Cutout => 2450,
                MaterialSurface::Transparent => 3000,
            }
        },
        alpha_cutoff: if material.surface == MaterialSurface::Cutout {
            material.alpha_cutoff
        } else {
            0.0
        },
        base_color_texture: material.base_color_texture.clone(),
        normal_texture: material.normal_texture.clone(),
        normal_scale: material.normal_scale,
        metallic_roughness_texture: material.metallic_roughness_texture.clone(),
        occlusion_texture: material.occlusion_texture.clone(),
        occlusion_strength: material.occlusion_strength,
        emissive_texture: material.emissive_texture.clone(),
        uv_scale: material.uv_scale,
        uv_offset: material.uv_offset,
        uv_rotation_degrees: material.uv_rotation,
        wrap_u: render_wrap(material.wrap_u),
        wrap_v: render_wrap(material.wrap_v),
        filter: match material.filter {
            AssetMaterialFilter::Nearest => MaterialFilter::Nearest,
            AssetMaterialFilter::Linear => MaterialFilter::Linear,
        },
        mipmap_filter: match material.mipmap_filter {
            AssetMaterialFilter::Nearest => MaterialFilter::Nearest,
            AssetMaterialFilter::Linear => MaterialFilter::Linear,
        },
        anisotropy: material.anisotropy,
        surface_shader: String::new(),
    }
}

pub fn apply_material_property_block(
    mut material: RenderMaterial,
    block: &MaterialPropertyBlock,
) -> RenderMaterial {
    if block.override_base_color {
        material.base_color = sanitize_color4(block.base_color);
    }
    if block.override_metallic {
        material.metallic = finite_or(block.metallic, 0.0).clamp(0.0, 1.0);
    }
    if block.override_roughness {
        material.roughness = finite_or(block.roughness, 0.5).clamp(0.04, 1.0);
    }
    if block.override_ior {
        material.ior = finite_or(block.ior, 1.5).clamp(1.0, 2.5);
    }
    if block.override_clearcoat {
        material.clearcoat = finite_or(block.clearcoat, 0.0).clamp(0.0, 1.0);
    }
    if block.override_clearcoat_roughness {
        material.clearcoat_roughness = finite_or(block.clearcoat_roughness, 0.1).clamp(0.04, 1.0);
    }
    if block.override_emissive {
        material.emissive = block.emissive.map(|value| finite_or(value, 0.0).max(0.0));
    }
    if block.override_emissive_strength {
        material.emissive_strength = finite_or(block.emissive_strength, 1.0).max(0.0);
    }
    material
}

fn sanitize_color4(color: [f32; 4]) -> [f32; 4] {
    color.map(|value| finite_or(value, 1.0).clamp(0.0, 1.0))
}

fn finite_or(value: f32, fallback: f32) -> f32 {
    if value.is_finite() {
        value
    } else {
        fallback
    }
}

fn render_wrap(wrap: AssetMaterialWrap) -> MaterialWrap {
    match wrap {
        AssetMaterialWrap::Repeat => MaterialWrap::Repeat,
        AssetMaterialWrap::Clamp => MaterialWrap::Clamp,
        AssetMaterialWrap::Mirror => MaterialWrap::Mirror,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn converts_surface_shader_texture_and_uv_settings() {
        let asset = MaterialAsset {
            shader: MaterialShader::Unlit,
            surface: MaterialSurface::Cutout,
            blend_mode: AssetMaterialBlendMode::Premultiplied,
            transparent_depth_write: true,
            render_queue: 2600,
            alpha_cutoff: 0.4,
            base_color_texture: "Assets/Textures/leaves.png".into(),
            normal_texture: "Assets/Textures/leaves-normal.png".into(),
            normal_scale: 0.75,
            clearcoat: 0.8,
            clearcoat_roughness: 0.18,
            ior: 1.33,
            metallic_roughness_texture: "Assets/Textures/leaves-orm.png".into(),
            occlusion_texture: "Assets/Textures/leaves-ao.png".into(),
            occlusion_strength: 0.6,
            emissive_texture: "Assets/Textures/leaves-emissive.png".into(),
            uv_scale: [2.0, 3.0],
            uv_offset: [0.25, 0.5],
            uv_rotation: 45.0,
            wrap_u: AssetMaterialWrap::Clamp,
            wrap_v: AssetMaterialWrap::Mirror,
            filter: AssetMaterialFilter::Nearest,
            mipmap_filter: AssetMaterialFilter::Nearest,
            anisotropy: 1,
            ..MaterialAsset::default()
        };
        let material = render_material_from_asset(&asset);
        assert!(material.unlit);
        assert!(!material.transparent);
        assert_eq!(material.blend_mode, MaterialBlendMode::Premultiplied);
        assert!(material.depth_write);
        assert_eq!(material.render_queue, 2600);
        assert_eq!(material.alpha_cutoff, 0.4);
        assert_eq!(material.base_color_texture, asset.base_color_texture);
        assert_eq!(material.normal_texture, asset.normal_texture);
        assert_eq!(material.normal_scale, 0.75);
        assert_eq!(material.clearcoat, 0.8);
        assert_eq!(material.clearcoat_roughness, 0.18);
        assert_eq!(material.ior, 1.33);
        assert_eq!(
            material.metallic_roughness_texture,
            asset.metallic_roughness_texture
        );
        assert_eq!(material.occlusion_strength, 0.6);
        assert_eq!(material.occlusion_texture, asset.occlusion_texture);
        assert_eq!(material.emissive_texture, asset.emissive_texture);
        assert_eq!(material.uv_scale, [2.0, 3.0]);
        assert_eq!(material.uv_offset, [0.25, 0.5]);
        assert_eq!(material.uv_rotation_degrees, 45.0);
        assert_eq!(material.wrap_u, MaterialWrap::Clamp);
        assert_eq!(material.wrap_v, MaterialWrap::Mirror);
        assert_eq!(material.filter, MaterialFilter::Nearest);
        assert_eq!(material.mipmap_filter, MaterialFilter::Nearest);
        assert_eq!(material.anisotropy, 1);
    }

    #[test]
    fn automatic_render_queues_and_transparent_depth_are_surface_aware() {
        let transparent = render_material_from_asset(&MaterialAsset {
            surface: MaterialSurface::Transparent,
            blend_mode: AssetMaterialBlendMode::Additive,
            transparent_depth_write: false,
            ..MaterialAsset::default()
        });
        assert!(transparent.transparent);
        assert_eq!(transparent.blend_mode, MaterialBlendMode::Additive);
        assert!(!transparent.depth_write);
        assert_eq!(transparent.render_queue, 3000);

        let cutout = render_material_from_asset(&MaterialAsset {
            surface: MaterialSurface::Cutout,
            ..MaterialAsset::default()
        });
        assert!(cutout.depth_write);
        assert_eq!(cutout.render_queue, 2450);
    }

    #[test]
    fn property_blocks_override_enabled_values_and_preserve_pipeline_state() {
        let source = RenderMaterial {
            base_color: [0.2, 0.3, 0.4, 1.0],
            metallic: 0.7,
            roughness: 0.6,
            ior: 1.33,
            emissive: [1.0, 2.0, 3.0],
            emissive_strength: 4.0,
            transparent: true,
            render_queue: 3100,
            base_color_texture: "Assets/Textures/paint.png".into(),
            surface_shader: "fn mengine_lit_surface_hook() {}".into(),
            ..RenderMaterial::default()
        };
        let result = apply_material_property_block(
            source,
            &MaterialPropertyBlock {
                override_base_color: true,
                base_color: [2.0, 0.5, -1.0, f32::NAN],
                override_metallic: false,
                metallic: 0.1,
                override_roughness: true,
                roughness: 0.0,
                override_ior: true,
                ior: 4.0,
                override_clearcoat: true,
                clearcoat: 2.0,
                override_clearcoat_roughness: true,
                clearcoat_roughness: 0.0,
                override_emissive: false,
                emissive: [9.0; 3],
                override_emissive_strength: true,
                emissive_strength: 2.0,
            },
        );
        assert_eq!(result.base_color, [1.0, 0.5, 0.0, 1.0]);
        assert_eq!(result.metallic, 0.7);
        assert_eq!(result.roughness, 0.04);
        assert_eq!(result.ior, 2.5);
        assert_eq!(result.clearcoat, 1.0);
        assert_eq!(result.clearcoat_roughness, 0.04);
        assert_eq!(result.emissive, [1.0, 2.0, 3.0]);
        assert_eq!(result.emissive_strength, 2.0);
        assert!(result.transparent);
        assert_eq!(result.render_queue, 3100);
        assert_eq!(result.base_color_texture, "Assets/Textures/paint.png");
        assert!(!result.surface_shader.is_empty());
    }

    #[test]
    fn custom_surface_shader_is_loaded_validated_and_attached_to_material() {
        let root = std::env::temp_dir().join(format!("mengine-surface-{}", Uuid::new_v4()));
        std::fs::create_dir_all(root.join("Assets/Materials")).unwrap();
        std::fs::create_dir_all(root.join("Assets/Shaders")).unwrap();
        std::fs::write(
            root.join("Assets/Shaders/Rim.mshader"),
            r#"fn mengine_lit_surface_hook(
              surface: MEngineSurface, uv: vec2<f32>,
              world_position: vec3<f32>
            ) -> MEngineSurface {
              var result = surface;
              result.roughness = 0.2 + uv.x;
              return result;
            }"#,
        )
        .unwrap();
        std::fs::write(
            root.join("Assets/Materials/Rim.mmat"),
            r#"{"shader":"custom","custom_shader":"Assets/Shaders/Rim.mshader"}"#,
        )
        .unwrap();

        let mut cache = RuntimeMaterialCache::new(Some(root.clone()));
        let material = cache.resolve("Assets/Materials/Rim.mmat").unwrap();
        assert!(material.surface_shader.contains("result.roughness"));

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn material_instances_resolve_nested_overrides_and_parent_hot_reload() {
        let root = std::env::temp_dir().join(format!("mengine-instance-{}", Uuid::new_v4()));
        let materials = root.join("Assets/Materials");
        std::fs::create_dir_all(&materials).unwrap();
        let parent = materials.join("Base.mmat");
        std::fs::write(
            &parent,
            r#"{"version":7,"name":"Base","base_color":[1,0,0,1],"roughness":0.8}"#,
        )
        .unwrap();
        std::fs::write(
            materials.join("Wet.minst"),
            r#"{"version":1,"name":"Wet","parent":"Assets/Materials/Base.mmat","overrides":{"roughness":0.2,"clearcoat":0.7}}"#,
        )
        .unwrap();
        std::fs::write(
            materials.join("Ocean.minst"),
            r#"{"version":1,"name":"Ocean","parent":"Assets/Materials/Wet.minst","overrides":{"base_color":[0,0.2,0.8,1],"ior":1.33}}"#,
        )
        .unwrap();

        let mut cache = RuntimeMaterialCache::new(Some(root.clone()));
        let first = cache.resolve_asset("Assets/Materials/Ocean.minst").unwrap();
        assert_eq!(first.name, "Ocean");
        assert_eq!(first.base_color, [0.0, 0.2, 0.8, 1.0]);
        assert_eq!(first.roughness, 0.2);
        assert_eq!(first.clearcoat, 0.7);
        assert_eq!(first.ior, 1.33);

        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(
            &parent,
            r#"{"version":7,"name":"Base","base_color":[1,0,0,1],"roughness":0.8,"emissive_strength":4}"#,
        )
        .unwrap();
        let reloaded = cache.resolve_asset("Assets/Materials/Ocean.minst").unwrap();
        assert_eq!(reloaded.emissive_strength, 4.0);

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn material_instances_reject_cycles_instead_of_falling_back_silently() {
        let root = std::env::temp_dir().join(format!("mengine-instance-cycle-{}", Uuid::new_v4()));
        let materials = root.join("Assets/Materials");
        std::fs::create_dir_all(&materials).unwrap();
        std::fs::write(
            materials.join("A.minst"),
            r#"{"version":1,"parent":"Assets/Materials/B.minst"}"#,
        )
        .unwrap();
        std::fs::write(
            materials.join("B.minst"),
            r#"{"version":1,"parent":"Assets/Materials/A.minst"}"#,
        )
        .unwrap();
        let error = RuntimeMaterialCache::new(Some(root.clone()))
            .resolve_asset("Assets/Materials/A.minst")
            .unwrap_err();
        assert!(error.contains("inheritance cycle"), "{error}");
        std::fs::remove_dir_all(root).unwrap();
    }
}
