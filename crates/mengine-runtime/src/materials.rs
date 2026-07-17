use crate::textures::resolve_project_asset_path;
use mengine_assets::{load_material_asset, MaterialAsset, MaterialShader, MaterialSurface};
use mengine_rhi::RenderMaterial;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::SystemTime;

#[derive(Clone)]
struct CachedMaterial {
    modified: Option<SystemTime>,
    result: Result<Arc<MaterialAsset>, String>,
}

#[derive(Default)]
pub struct RuntimeMaterialCache {
    project_root: Option<PathBuf>,
    materials: HashMap<PathBuf, CachedMaterial>,
    reported_failures: HashSet<(String, String)>,
}

impl RuntimeMaterialCache {
    pub fn new(project_root: Option<PathBuf>) -> Self {
        Self {
            project_root,
            materials: HashMap::new(),
            reported_failures: HashSet::new(),
        }
    }

    pub fn resolve(&mut self, key: &str) -> Option<RenderMaterial> {
        let normalized = key.trim();
        if !normalized.to_ascii_lowercase().ends_with(".mmat")
            && !normalized.to_ascii_lowercase().ends_with(".mat")
        {
            return None;
        }
        match self.load(normalized) {
            Ok(material) => {
                self.reported_failures
                    .retain(|(reported_key, _)| reported_key != normalized);
                Some(render_material_from_asset(&material))
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
        }
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
}

pub fn render_material_from_asset(material: &MaterialAsset) -> RenderMaterial {
    RenderMaterial {
        base_color: material.base_color,
        metallic: material.metallic,
        roughness: material.roughness,
        emissive: material.emissive,
        emissive_strength: material.emissive_strength,
        unlit: material.shader == MaterialShader::Unlit,
        double_sided: material.double_sided,
        transparent: material.surface == MaterialSurface::Transparent,
        alpha_cutoff: if material.surface == MaterialSurface::Cutout {
            material.alpha_cutoff
        } else {
            0.0
        },
        base_color_texture: material.base_color_texture.clone(),
        uv_scale: material.uv_scale,
        uv_offset: material.uv_offset,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_surface_shader_texture_and_uv_settings() {
        let asset = MaterialAsset {
            shader: MaterialShader::Unlit,
            surface: MaterialSurface::Cutout,
            alpha_cutoff: 0.4,
            base_color_texture: "Assets/Textures/leaves.png".into(),
            uv_scale: [2.0, 3.0],
            uv_offset: [0.25, 0.5],
            ..MaterialAsset::default()
        };
        let material = render_material_from_asset(&asset);
        assert!(material.unlit);
        assert!(!material.transparent);
        assert_eq!(material.alpha_cutoff, 0.4);
        assert_eq!(material.base_color_texture, asset.base_color_texture);
        assert_eq!(material.uv_scale, [2.0, 3.0]);
        assert_eq!(material.uv_offset, [0.25, 0.5]);
    }
}
