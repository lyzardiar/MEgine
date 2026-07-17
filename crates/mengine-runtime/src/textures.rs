use mengine_assets::load_texture_rgba8;
use mengine_rhi::{Renderer, UiBatchPlan};
use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TextureLoadFailure {
    pub key: String,
    pub path: PathBuf,
    pub error: String,
}

#[derive(Default)]
pub struct RuntimeTextureCache {
    project_root: Option<PathBuf>,
    attempted: HashSet<String>,
}

impl RuntimeTextureCache {
    pub fn new(project_root: Option<PathBuf>) -> Self {
        Self {
            project_root,
            attempted: HashSet::new(),
        }
    }

    pub fn set_project_root(&mut self, project_root: Option<PathBuf>) {
        if self.project_root == project_root {
            return;
        }
        self.project_root = project_root;
        self.attempted.clear();
    }

    pub fn invalidate(&mut self, key: &str) {
        self.attempted.remove(key);
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
            if !self.attempted.insert(key.to_owned()) {
                continue;
            }
            let Some(path) = resolve_texture_path(root, key) else {
                failures.push(TextureLoadFailure {
                    key: key.to_owned(),
                    path: root.to_owned(),
                    error: "texture key must be a project-relative path without '..'".into(),
                });
                continue;
            };
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
}
