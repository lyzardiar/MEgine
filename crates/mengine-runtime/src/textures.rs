use mengine_assets::{
    load_environment_texture, load_sprite_import, load_texture_rgba8, split_sprite_reference,
    sprite_import_path, texture_dimensions,
};
use mengine_rhi::{FrameLighting, RenderObject, Renderer, UiBatchPlan, UiPrimitive};
use std::collections::{HashMap, HashSet};
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
    attempted_environment: HashMap<String, FileStamp>,
    sprite_regions: HashMap<String, CachedSpriteRegion>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
struct FileStamp {
    modified: Option<SystemTime>,
    length: Option<u64>,
}

#[derive(Clone, Debug)]
struct ResolvedSpriteRegion {
    texture: String,
    uv: [f32; 4],
}

#[derive(Clone, Debug)]
struct CachedSpriteRegion {
    texture_stamp: FileStamp,
    import_stamp: FileStamp,
    result: Result<ResolvedSpriteRegion, String>,
    reported: bool,
}

impl RuntimeTextureCache {
    pub fn new(project_root: Option<PathBuf>) -> Self {
        Self {
            project_root,
            attempted_ui: HashMap::new(),
            attempted_material: HashMap::new(),
            attempted_environment: HashMap::new(),
            sprite_regions: HashMap::new(),
        }
    }

    pub fn set_project_root(&mut self, project_root: Option<PathBuf>) {
        if self.project_root == project_root {
            return;
        }
        self.project_root = project_root;
        self.attempted_ui.clear();
        self.attempted_material.clear();
        self.attempted_environment.clear();
        self.sprite_regions.clear();
    }

    pub fn invalidate(&mut self, key: &str) {
        self.attempted_ui.remove(key);
        self.attempted_material
            .retain(|attempt, _| attempt.split_once('\0').is_none_or(|(_, path)| path != key));
        self.attempted_environment.remove(key);
        self.sprite_regions.clear();
    }

    /// Resolve `Assets/sheet.png#Slice` references before batching. Legacy texture paths pass through.
    pub fn resolve_sprite_regions(
        &mut self,
        primitives: &mut [UiPrimitive],
    ) -> Vec<TextureLoadFailure> {
        let Some(root) = self.project_root.clone() else {
            return Vec::new();
        };
        let mut failures = Vec::new();
        for primitive in primitives {
            let original = primitive.key.texture.trim().to_owned();
            let (texture_reference, slice) = split_sprite_reference(&original);
            let Some(slice) = slice else {
                continue;
            };
            let Some(texture_path) = resolve_texture_path(&root, texture_reference) else {
                failures.push(TextureLoadFailure {
                    key: original,
                    path: root.clone(),
                    error: "sprite texture must be a project-relative path without '..'".into(),
                });
                continue;
            };
            let import_path = sprite_import_path(&texture_path);
            let texture_stamp = file_stamp(&texture_path);
            let import_stamp = file_stamp(&import_path);
            let stale = self.sprite_regions.get(&original).is_none_or(|cached| {
                cached.texture_stamp != texture_stamp || cached.import_stamp != import_stamp
            });
            if stale {
                let result = resolve_sprite_region(&texture_path, texture_reference, slice);
                self.sprite_regions.insert(
                    original.clone(),
                    CachedSpriteRegion {
                        texture_stamp,
                        import_stamp,
                        result,
                        reported: false,
                    },
                );
            }
            let Some(cached) = self.sprite_regions.get_mut(&original) else {
                continue;
            };
            match &cached.result {
                Ok(region) => {
                    primitive.uv = compose_uv(region.uv, primitive.uv);
                    primitive.key.texture = region.texture.clone();
                }
                Err(error) if !cached.reported => {
                    cached.reported = true;
                    primitive.key.texture = texture_reference.replace('\\', "/");
                    failures.push(TextureLoadFailure {
                        key: original,
                        path: import_path,
                        error: error.clone(),
                    });
                }
                Err(_) => primitive.key.texture = texture_reference.replace('\\', "/"),
            }
        }
        failures
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
        let references = material_texture_references(objects);
        let stale_attempts = stale_material_texture_attempts(&self.attempted_material, &references);
        for attempt in stale_attempts {
            self.attempted_material.remove(&attempt);
            if let Some((srgb, key)) = split_material_texture_attempt(&attempt) {
                renderer.remove_material_texture_variant(key, srgb);
            }
        }
        for (key, srgb) in references {
            let attempt = material_texture_attempt_key(&key, srgb);
            let Some(path) = resolve_project_asset_path(root, &key) else {
                renderer.remove_material_texture_variant(&key, srgb);
                if should_attempt(&mut self.attempted_material, &attempt, FileStamp::default()) {
                    failures.push(TextureLoadFailure {
                        key,
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
                        &key,
                        texture.width,
                        texture.height,
                        &texture.pixels,
                        srgb,
                    ) {
                        renderer.remove_material_texture_variant(&key, srgb);
                        failures.push(TextureLoadFailure {
                            key,
                            path,
                            error: error.to_string(),
                        });
                    }
                }
                Err(error) => {
                    renderer.remove_material_texture_variant(&key, srgb);
                    failures.push(TextureLoadFailure {
                        key,
                        path,
                        error: error.to_string(),
                    });
                }
            }
        }
        failures
    }

    pub fn sync_environment(
        &mut self,
        renderer: &mut Renderer,
        lighting: &FrameLighting,
    ) -> Vec<TextureLoadFailure> {
        let key = lighting.environment.texture.trim();
        if key.is_empty() {
            return Vec::new();
        }
        let Some(root) = self.project_root.as_deref() else {
            return Vec::new();
        };
        let Some(path) = resolve_project_asset_path(root, key) else {
            if should_attempt(&mut self.attempted_environment, key, FileStamp::default()) {
                renderer.remove_environment_texture(key);
                return vec![TextureLoadFailure {
                    key: key.to_owned(),
                    path: root.to_owned(),
                    error: "environment texture must be a project-relative path without '..'"
                        .into(),
                }];
            }
            return Vec::new();
        };
        if !should_attempt(&mut self.attempted_environment, key, file_stamp(&path)) {
            return Vec::new();
        }
        match load_environment_texture(&path) {
            Ok(texture) => renderer
                .upload_environment_texture_rgba32f(
                    key,
                    texture.width,
                    texture.height,
                    &texture.pixels,
                )
                .err()
                .map(|error| {
                    renderer.remove_environment_texture(key);
                    TextureLoadFailure {
                        key: key.to_owned(),
                        path,
                        error: error.to_string(),
                    }
                })
                .into_iter()
                .collect(),
            Err(error) => {
                renderer.remove_environment_texture(key);
                vec![TextureLoadFailure {
                    key: key.to_owned(),
                    path,
                    error: error.to_string(),
                }]
            }
        }
    }
}

fn material_texture_references(objects: &[RenderObject]) -> Vec<(String, bool)> {
    let mut references = HashSet::new();
    for object in objects {
        let material = &object.material;
        references.extend(
            [
                (material.base_color_texture.trim(), true),
                (material.normal_texture.trim(), false),
                (material.metallic_roughness_texture.trim(), false),
                (material.occlusion_texture.trim(), false),
                (material.emissive_texture.trim(), true),
            ]
            .into_iter()
            .chain(
                material
                    .custom_textures
                    .iter()
                    .zip(material.custom_texture_srgb)
                    .map(|(key, srgb)| (key.trim(), srgb)),
            )
            .filter(|(key, _)| !key.is_empty() && !key.eq_ignore_ascii_case("white"))
            .map(|(key, srgb)| (key.to_owned(), srgb)),
        );
    }
    let mut references = references.into_iter().collect::<Vec<_>>();
    references.sort_by(|left, right| left.0.cmp(&right.0).then(left.1.cmp(&right.1)));
    references
}

fn material_texture_attempt_key(key: &str, srgb: bool) -> String {
    format!("{}\0{key}", if srgb { "srgb" } else { "linear" })
}

fn stale_material_texture_attempts(
    attempted: &HashMap<String, FileStamp>,
    references: &[(String, bool)],
) -> Vec<String> {
    let live = references
        .iter()
        .map(|(key, srgb)| material_texture_attempt_key(key, *srgb))
        .collect::<HashSet<_>>();
    let mut stale = attempted
        .keys()
        .filter(|attempt| !live.contains(*attempt))
        .cloned()
        .collect::<Vec<_>>();
    stale.sort();
    stale
}

fn split_material_texture_attempt(attempt: &str) -> Option<(bool, &str)> {
    let (color_space, key) = attempt.split_once('\0')?;
    match color_space {
        "srgb" => Some((true, key)),
        "linear" => Some((false, key)),
        _ => None,
    }
}

fn resolve_sprite_region(
    texture_path: &Path,
    texture_reference: &str,
    slice: &str,
) -> Result<ResolvedSpriteRegion, String> {
    let dimensions = texture_dimensions(texture_path).map_err(|error| error.to_string())?;
    let import = load_sprite_import(texture_path, dimensions).map_err(|error| error.to_string())?;
    let region = import.resolve(slice, dimensions).ok_or_else(|| {
        format!(
            "sprite slice '{slice}' is not defined in {}",
            sprite_import_path(texture_path).display()
        )
    })?;
    Ok(ResolvedSpriteRegion {
        texture: texture_reference.trim().replace('\\', "/"),
        uv: region.uv,
    })
}

fn compose_uv(region: [f32; 4], authored: [f32; 4]) -> [f32; 4] {
    [
        region[0] + authored[0] * region[2],
        region[1] + authored[1] * region[3],
        authored[2] * region[2],
        authored[3] * region[3],
    ]
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
    use glam::Mat4;
    use mengine_rhi::UiPrimitive;

    #[test]
    fn material_texture_usage_deduplicates_roles_without_merging_color_spaces() {
        let mut material = mengine_rhi::RenderMaterial {
            base_color_texture: "Assets/Shared.png".into(),
            normal_texture: "Assets/Shared.png".into(),
            emissive_texture: "white".into(),
            ..Default::default()
        };
        material.custom_textures[0] = "Assets/Shared.png".into();
        material.custom_texture_srgb[0] = true;
        let object = RenderObject {
            mesh_key: "cube".into(),
            model: Mat4::IDENTITY,
            material,
            cast_shadows: true,
            receive_shadows: true,
        };
        assert_eq!(
            material_texture_references(&[object]),
            vec![
                ("Assets/Shared.png".into(), false),
                ("Assets/Shared.png".into(), true)
            ]
        );
        assert_eq!(
            split_material_texture_attempt("srgb\0Assets/Shared.png"),
            Some((true, "Assets/Shared.png"))
        );
        assert_eq!(
            split_material_texture_attempt("linear\0Assets/Shared.png"),
            Some((false, "Assets/Shared.png"))
        );
        let attempted = HashMap::from([
            (
                material_texture_attempt_key("Assets/Shared.png", true),
                FileStamp::default(),
            ),
            (
                material_texture_attempt_key("Assets/Shared.png", false),
                FileStamp::default(),
            ),
        ]);
        assert_eq!(
            stale_material_texture_attempts(&attempted, &[("Assets/Shared.png".into(), true)]),
            vec![material_texture_attempt_key("Assets/Shared.png", false)]
        );
    }

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

    #[test]
    fn sprite_subresources_compose_uvs_and_share_the_base_texture_batch_key() {
        let root =
            std::env::temp_dir().join(format!("mengine-sprite-region-{}", uuid::Uuid::new_v4()));
        let texture = root.join("Assets/Sprites/sheet.png");
        std::fs::create_dir_all(texture.parent().unwrap()).unwrap();
        image::RgbaImage::from_pixel(4, 2, image::Rgba([255, 255, 255, 255]))
            .save(&texture)
            .unwrap();
        std::fs::write(
            mengine_assets::sprite_import_path(&texture),
            r#"{
                "version":1,"mode":"multiple","pixels_per_unit":16,
                "slices":[{"name":"Right","rect":[2,0,2,2],"pivot":[0.5,0.5]}]
            }"#,
        )
        .unwrap();

        let mut primitive = UiPrimitive::solid([0.0; 4], [1.0; 4]);
        primitive.key.texture = "Assets/Sprites/sheet.png#Right".into();
        primitive.uv = [1.0, 0.0, -1.0, 1.0];
        let mut cache = RuntimeTextureCache::new(Some(root.clone()));
        let failures = cache.resolve_sprite_regions(std::slice::from_mut(&mut primitive));
        assert!(failures.is_empty());
        assert_eq!(primitive.key.texture, "Assets/Sprites/sheet.png");
        assert_eq!(primitive.uv, [1.0, 0.0, -0.5, 1.0]);

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn missing_sprite_slice_is_reported_once_for_an_unchanged_import() {
        let root = std::env::temp_dir().join(format!(
            "mengine-missing-sprite-region-{}",
            uuid::Uuid::new_v4()
        ));
        let texture = root.join("Assets/sheet.png");
        std::fs::create_dir_all(texture.parent().unwrap()).unwrap();
        image::RgbaImage::from_pixel(1, 1, image::Rgba([255, 255, 255, 255]))
            .save(&texture)
            .unwrap();
        let mut primitive = UiPrimitive::solid([0.0; 4], [1.0; 4]);
        primitive.key.texture = "Assets/sheet.png#Missing".into();
        let mut cache = RuntimeTextureCache::new(Some(root.clone()));
        assert_eq!(
            cache
                .resolve_sprite_regions(std::slice::from_mut(&mut primitive))
                .len(),
            1
        );
        assert!(cache
            .resolve_sprite_regions(std::slice::from_mut(&mut primitive))
            .is_empty());
        std::fs::remove_dir_all(root).unwrap();
    }
}
