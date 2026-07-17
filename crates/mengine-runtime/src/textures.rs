use mengine_assets::load_texture_rgba8;
use mengine_rhi::{RenderObject, Renderer, UiBatchPlan};
use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use std::time::SystemTime;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TextureLoadFailure {
    pub key: String,
    pub path: PathBuf,
    pub error: String,
}

#[derive(Default)]
pub struct RuntimeTextureCache {
    project_root: Option<PathBuf>,
    attempted_ui: HashMap<String, FileStamp>,
    attempted_material: HashMap<String, FileStamp>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
struct FileStamp {
    modified: Option<SystemTime>,
    length: Option<u64>,
}

impl RuntimeTextureCache {
    pub fn new(project_root: Option<PathBuf>) -> Self {
        Self {
            project_root,
            attempted_ui: HashMap::new(),
            attempted_material: HashMap::new(),
        }
    }

    pub fn set_project_root(&mut self, project_root: Option<PathBuf>) {
        if self.project_root == project_root {
            return;
        }
        self.project_root = project_root;
        self.attempted_ui.clear();
        self.attempted_material.clear();
    }

    pub fn invalidate(&mut self, key: &str) {
        self.attempted_ui.remove(key);
        self.attempted_material
            .retain(|attempt, _| attempt.split_once('\0').is_none_or(|(_, path)| path != key));
    }

    pub fn sync(&mut self, renderer: &mut Renderer, plan: &UiBatchPlan) -> Vec<TextureLoadFailure> {
        let Some(root) = self.project_root.as_deref() else {
            return Vec::new();
        };
        let mut failures = Vec::new();
        for batch in &plan.batches {
            let key = batch.key.texture.trim();
            if key.is_empty() || key.eq_ignore_ascii_case("white") {
                continue;
            }
            let Some(path) = resolve_texture_path(root, key) else {
                if should_attempt(&mut self.attempted_ui, key, FileStamp::default()) {
                    failures.push(TextureLoadFailure {
                        key: key.to_owned(),
                        path: root.to_owned(),
                        error: "texture key must be a project-relative path without '..'".into(),
                    });
                }
                continue;
            };
            if !should_attempt(&mut self.attempted_ui, key, file_stamp(&path)) {
                continue;
            }
            match load_texture_rgba8(&path) {
                Ok(texture) => {
                    if let Err(error) = renderer.upload_ui_texture_rgba8(
                        key,
                        texture.width,
                        texture.height,
                        &texture.pixels,
                    ) {
                        failures.push(TextureLoadFailure {
                            key: key.to_owned(),
                            path,
                            error: error.to_string(),
                        });
                    }
                }
                Err(error) => failures.push(TextureLoadFailure {
                    key: key.to_owned(),
                    path,
                    error: error.to_string(),
                }),
            }
        }
        failures
    }

    pub fn sync_materials(
        &mut self,
        renderer: &mut Renderer,
        objects: &[RenderObject],
    ) -> Vec<TextureLoadFailure> {
        let Some(root) = self.project_root.as_deref() else {
            return Vec::new();
        };
        let mut failures = Vec::new();
        for object in objects {
            let material = &object.material;
            for (key, srgb) in [
                (material.base_color_texture.trim(), true),
                (material.normal_texture.trim(), false),
                (material.metallic_roughness_texture.trim(), false),
                (material.occlusion_texture.trim(), false),
                (material.emissive_texture.trim(), true),
            ] {
                if key.is_empty() || key.eq_ignore_ascii_case("white") {
                    continue;
                }
                let attempt = format!("{}\0{key}", if srgb { "srgb" } else { "linear" });
                let Some(path) = resolve_project_asset_path(root, key) else {
                    if should_attempt(&mut self.attempted_material, &attempt, FileStamp::default())
                    {
                        failures.push(TextureLoadFailure {
                            key: key.to_owned(),
                            path: root.to_owned(),
                            error: "material texture must be a project-relative path without '..'"
                                .into(),
                        });
                    }
                    continue;
                };
                if !should_attempt(&mut self.attempted_material, &attempt, file_stamp(&path)) {
                    continue;
                }
                match load_texture_rgba8(&path) {
                    Ok(texture) => {
                        if let Err(error) = renderer.upload_material_texture_rgba8(
                            key,
                            texture.width,
                            texture.height,
                            &texture.pixels,
                            srgb,
                        ) {
                            failures.push(TextureLoadFailure {
                                key: key.to_owned(),
                                path,
                                error: error.to_string(),
                            });
                        }
                    }
                    Err(error) => failures.push(TextureLoadFailure {
                        key: key.to_owned(),
                        path,
                        error: error.to_string(),
                    }),
                }
            }
        }
        failures
    }
}

fn file_stamp(path: &Path) -> FileStamp {
    match std::fs::metadata(path) {
        Ok(metadata) => FileStamp {
            modified: metadata.modified().ok(),
            length: Some(metadata.len()),
        },
        Err(_) => FileStamp::default(),
    }
}

fn should_attempt(cache: &mut HashMap<String, FileStamp>, key: &str, stamp: FileStamp) -> bool {
    if cache.get(key) == Some(&stamp) {
        return false;
    }
    cache.insert(key.to_owned(), stamp);
    true
}

pub fn resolve_project_asset_path(project_root: &Path, key: &str) -> Option<PathBuf> {
    let normalized = key.trim().replace('\\', "/");
    let relative = Path::new(&normalized);
    if relative.is_absolute()
        || relative.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return None;
    }
    Some(project_root.join(relative))
}

pub fn resolve_texture_path(project_root: &Path, key: &str) -> Option<PathBuf> {
    resolve_project_asset_path(project_root, key)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_assets_relative_to_project_root() {
        let root = Path::new("C:/Games/Demo");
        assert_eq!(
            resolve_texture_path(root, r"Assets\Textures\icon.png"),
            Some(root.join("Assets/Textures/icon.png"))
        );
    }

    #[test]
    fn rejects_absolute_and_parent_traversal_texture_keys() {
        let root = Path::new("C:/Games/Demo");
        assert_eq!(resolve_texture_path(root, "../secret.png"), None);
        assert_eq!(resolve_texture_path(root, "C:/secret.png"), None);
        assert_eq!(resolve_texture_path(root, "/secret.png"), None);
    }

    #[test]
    fn attempts_again_only_after_a_texture_file_stamp_changes() {
        let mut attempts = HashMap::new();
        let initial = FileStamp {
            modified: None,
            length: Some(4),
        };
        assert!(should_attempt(&mut attempts, "texture", initial));
        assert!(!should_attempt(&mut attempts, "texture", initial));
        assert!(should_attempt(
            &mut attempts,
            "texture",
            FileStamp {
                length: Some(8),
                ..initial
            }
        ));
    }
}
