use crate::textures::resolve_project_asset_path;
use mengine_assets::{
    load_material_asset, load_material_instance_asset, load_surface_shader, MaterialAsset,
    MaterialBlendMode as AssetMaterialBlendMode, MaterialFilter as AssetMaterialFilter,
    MaterialInstanceAsset, MaterialShader, MaterialSurface, MaterialWrap as AssetMaterialWrap,
};
use mengine_core::generated::MaterialPropertyBlock;
use mengine_core::surface_shader::{
    parse_surface_shader_schema, SurfaceShaderSchema, SurfaceShaderTextureType,
    MAX_SURFACE_SHADER_PARAMETERS, MAX_SURFACE_SHADER_TEXTURES,
};
use mengine_rhi::{
    validate_surface_shader_hook, MaterialBlendMode, MaterialFilter, MaterialWrap, RenderMaterial,
    SurfaceShaderParameterBinding,
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
    result: Result<Arc<LoadedSurfaceShader>, String>,
}

#[derive(Clone)]
struct LoadedSurfaceShader {
    source: Arc<str>,
    schema: Arc<SurfaceShaderSchema>,
    parameter_bindings: Arc<[SurfaceShaderParameterBinding]>,
    texture_names: Arc<[String]>,
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
    active_failures: HashMap<String, String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RuntimeMaterialDiagnostic {
    pub asset: String,
    pub error: String,
}

impl RuntimeMaterialCache {
    pub fn new(project_root: Option<PathBuf>) -> Self {
        Self {
            project_root,
            materials: HashMap::new(),
            instances: HashMap::new(),
            surface_shaders: HashMap::new(),
            active_failures: HashMap::new(),
        }
    }

    pub fn resolve(&mut self, key: &str) -> Option<RenderMaterial> {
        let normalized = key.trim();
        if !is_material_path(normalized) {
            return None;
        }
        match self.resolve_asset(normalized) {
            Ok(material) => {
                let mut render = render_material_from_asset(&material);
                if material.shader == MaterialShader::Custom {
                    match self.load_custom_shader(&material.custom_shader) {
                        Ok(shader) => match resolve_surface_shader_material_with_schema(
                            &material,
                            &shader.schema,
                            Arc::clone(&shader.parameter_bindings),
                            Arc::clone(&shader.texture_names),
                        ) {
                            Ok(bindings) => {
                                self.clear_failure(normalized);
                                self.clear_failure(&material.custom_shader);
                                render.surface_shader = Arc::clone(&shader.source);
                                render.surface_keywords = bindings.keywords;
                                render.custom_parameters = bindings.parameters;
                                render.custom_parameter_bindings = bindings.parameter_bindings;
                                render.custom_textures = bindings.textures;
                                render.custom_texture_names = bindings.texture_names;
                                render.custom_texture_srgb = bindings.texture_srgb;
                            }
                            Err(error) => {
                                self.clear_failure(&material.custom_shader);
                                if self.record_failure(normalized, &error) {
                                    log::warn!(
                                        "material '{}' has invalid bindings for custom shader '{}': {}",
                                        normalized,
                                        material.custom_shader,
                                        error
                                    );
                                }
                                render = RenderMaterial::error();
                            }
                        },
                        Err(error) => {
                            self.clear_failure(normalized);
                            if self.record_failure(&material.custom_shader, &error) {
                                log::warn!(
                                    "custom shader '{}' could not be loaded: {}",
                                    material.custom_shader,
                                    error
                                );
                            }
                            render = RenderMaterial::error();
                        }
                    }
                } else {
                    self.clear_failure(normalized);
                }
                Some(render)
            }
            Err(error) => {
                if self.record_failure(normalized, &error) {
                    log::warn!("material '{}' could not be loaded: {}", normalized, error);
                }
                Some(RenderMaterial::error())
            }
        }
    }

    /// Returns current material and Surface Shader failures in stable asset-path order.
    pub fn diagnostics(&self) -> Vec<RuntimeMaterialDiagnostic> {
        let mut diagnostics = self
            .active_failures
            .iter()
            .map(|(asset, error)| RuntimeMaterialDiagnostic {
                asset: asset.clone(),
                error: error.clone(),
            })
            .collect::<Vec<_>>();
        diagnostics.sort_by(|left, right| left.asset.cmp(&right.asset));
        diagnostics
    }

    pub fn invalidate(&mut self, key: &str) {
        self.clear_failure(key.trim());
        let Some(root) = self.project_root.as_deref() else {
            return;
        };
        if let Some(path) = resolve_project_asset_path(root, key) {
            self.materials.remove(&path);
            self.instances.remove(&path);
            self.surface_shaders.remove(&path);
        }
    }

    fn record_failure(&mut self, asset: &str, error: &str) -> bool {
        if self
            .active_failures
            .get(asset)
            .is_some_and(|value| value == error)
        {
            return false;
        }
        self.active_failures
            .insert(asset.to_owned(), error.to_owned());
        true
    }

    fn clear_failure(&mut self, asset: &str) {
        self.active_failures.remove(asset);
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
            instance
                .apply_to(parent)
                .map_err(|error| error.to_string())?
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

    fn load_custom_shader(&mut self, key: &str) -> Result<Arc<LoadedSurfaceShader>, String> {
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
                    let schema = Arc::new(parse_surface_shader_schema(&source)?);
                    let (parameter_bindings, texture_names) = surface_shader_reflection(&schema);
                    Ok(Arc::new(LoadedSurfaceShader {
                        source: Arc::from(source),
                        schema,
                        parameter_bindings,
                        texture_names,
                    }))
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

#[derive(Clone, Debug, PartialEq)]
pub struct ResolvedSurfaceShaderMaterial {
    pub parameters: [[f32; 4]; MAX_SURFACE_SHADER_PARAMETERS],
    pub parameter_bindings: Arc<[SurfaceShaderParameterBinding]>,
    pub keywords: Vec<String>,
    pub textures: [String; MAX_SURFACE_SHADER_TEXTURES],
    pub texture_names: Arc<[String]>,
    pub texture_srgb: [bool; MAX_SURFACE_SHADER_TEXTURES],
}

pub fn resolve_surface_shader_material(
    material: &MaterialAsset,
    shader_source: &str,
) -> Result<ResolvedSurfaceShaderMaterial, String> {
    let schema = parse_surface_shader_schema(shader_source)?;
    let (parameter_bindings, texture_names) = surface_shader_reflection(&schema);
    resolve_surface_shader_material_with_schema(
        material,
        &schema,
        parameter_bindings,
        texture_names,
    )
}

fn resolve_surface_shader_material_with_schema(
    material: &MaterialAsset,
    schema: &SurfaceShaderSchema,
    parameter_bindings: Arc<[SurfaceShaderParameterBinding]>,
    texture_names: Arc<[String]>,
) -> Result<ResolvedSurfaceShaderMaterial, String> {
    let parameters = pack_surface_shader_parameters_with_schema(material, schema)?;
    let keywords = resolve_surface_shader_keywords_with_schema(material, schema)?;
    let (textures, texture_srgb) = resolve_surface_shader_textures_with_schema(material, schema)?;
    Ok(ResolvedSurfaceShaderMaterial {
        parameters,
        parameter_bindings,
        keywords,
        textures,
        texture_names,
        texture_srgb,
    })
}

fn surface_shader_reflection(
    schema: &SurfaceShaderSchema,
) -> (Arc<[SurfaceShaderParameterBinding]>, Arc<[String]>) {
    let parameter_bindings = Arc::from(
        schema
            .parameters
            .iter()
            .map(|parameter| SurfaceShaderParameterBinding {
                name: parameter.name.clone(),
                components: parameter.parameter_type.component_count() as u8,
                min: parameter.min,
                max: parameter.max,
            })
            .collect::<Vec<_>>(),
    );
    let texture_names = Arc::from(
        schema
            .textures
            .iter()
            .map(|texture| texture.name.clone())
            .collect::<Vec<_>>(),
    );
    (parameter_bindings, texture_names)
}

pub fn pack_surface_shader_parameters(
    material: &MaterialAsset,
    shader_source: &str,
) -> Result<[[f32; 4]; MAX_SURFACE_SHADER_PARAMETERS], String> {
    let schema = parse_surface_shader_schema(shader_source)?;
    pack_surface_shader_parameters_with_schema(material, &schema)
}

fn pack_surface_shader_parameters_with_schema(
    material: &MaterialAsset,
    schema: &SurfaceShaderSchema,
) -> Result<[[f32; 4]; MAX_SURFACE_SHADER_PARAMETERS], String> {
    if let Some(unknown) = material.custom_parameters.keys().find(|name| {
        !schema
            .parameters
            .iter()
            .any(|parameter| parameter.name.as_str() == name.as_str())
    }) {
        return Err(format!(
            "material parameter '{unknown}' is not declared by its Surface Shader"
        ));
    }
    let mut packed = [[0.0; 4]; MAX_SURFACE_SHADER_PARAMETERS];
    for (index, parameter) in schema.parameters.iter().enumerate() {
        let source = material
            .custom_parameters
            .get(&parameter.name)
            .unwrap_or(&parameter.default);
        let mut value = *source;
        for (component_index, component) in value[..parameter.parameter_type.component_count()]
            .iter_mut()
            .enumerate()
        {
            *component = finite_or(*component, parameter.default[component_index]);
            if let Some(minimum) = parameter.min {
                *component = component.max(minimum);
            }
            if let Some(maximum) = parameter.max {
                *component = component.min(maximum);
            }
        }
        packed[index] = value;
    }
    Ok(packed)
}

pub fn resolve_surface_shader_keywords(
    material: &MaterialAsset,
    shader_source: &str,
) -> Result<Vec<String>, String> {
    let schema = parse_surface_shader_schema(shader_source)?;
    resolve_surface_shader_keywords_with_schema(material, &schema)
}

fn resolve_surface_shader_keywords_with_schema(
    material: &MaterialAsset,
    schema: &SurfaceShaderSchema,
) -> Result<Vec<String>, String> {
    if let Some(unknown) = material.custom_keywords.keys().find(|name| {
        !schema
            .keywords
            .iter()
            .any(|keyword| keyword.name.as_str() == name.as_str())
    }) {
        return Err(format!(
            "material keyword '{unknown}' is not declared by its Surface Shader"
        ));
    }
    Ok(schema
        .keywords
        .iter()
        .filter(|keyword| {
            material
                .custom_keywords
                .get(&keyword.name)
                .copied()
                .unwrap_or(keyword.default)
        })
        .map(|keyword| keyword.name.clone())
        .collect())
}

pub fn resolve_surface_shader_textures(
    material: &MaterialAsset,
    shader_source: &str,
) -> Result<
    (
        [String; MAX_SURFACE_SHADER_TEXTURES],
        [bool; MAX_SURFACE_SHADER_TEXTURES],
    ),
    String,
> {
    let schema = parse_surface_shader_schema(shader_source)?;
    resolve_surface_shader_textures_with_schema(material, &schema)
}

fn resolve_surface_shader_textures_with_schema(
    material: &MaterialAsset,
    schema: &SurfaceShaderSchema,
) -> Result<
    (
        [String; MAX_SURFACE_SHADER_TEXTURES],
        [bool; MAX_SURFACE_SHADER_TEXTURES],
    ),
    String,
> {
    if let Some(unknown) = material.custom_textures.keys().find(|name| {
        !schema
            .textures
            .iter()
            .any(|texture| texture.name.as_str() == name.as_str())
    }) {
        return Err(format!(
            "material texture '{unknown}' is not declared by its Surface Shader"
        ));
    }
    let mut textures = std::array::from_fn(|_| String::new());
    let mut srgb = [false; MAX_SURFACE_SHADER_TEXTURES];
    for (index, texture) in schema.textures.iter().enumerate() {
        textures[index] = material
            .custom_textures
            .get(&texture.name)
            .unwrap_or(&texture.default)
            .clone();
        srgb[index] = texture.texture_type == SurfaceShaderTextureType::Color;
    }
    Ok((textures, srgb))
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
        surface_shader: Arc::from(""),
        surface_keywords: Vec::new(),
        custom_parameters: [[0.0; 4]; MAX_SURFACE_SHADER_PARAMETERS],
        custom_parameter_bindings: Arc::from(Vec::new()),
        custom_textures: std::array::from_fn(|_| String::new()),
        custom_texture_names: Arc::from(Vec::new()),
        custom_texture_srgb: [false; MAX_SURFACE_SHADER_TEXTURES],
        is_error: false,
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
    for (name, authored) in block
        .custom_parameter_names
        .iter()
        .zip(&block.custom_parameter_values)
    {
        let name = name.trim();
        let Some(index) = material
            .custom_parameter_bindings
            .iter()
            .position(|declared| declared.name == name)
        else {
            continue;
        };
        let binding = &material.custom_parameter_bindings[index];
        let components = usize::from(binding.components).min(4);
        for component in 0..components {
            let mut value = finite_or(
                authored[component],
                material.custom_parameters[index][component],
            );
            if let Some(minimum) = binding.min {
                value = value.max(minimum);
            }
            if let Some(maximum) = binding.max {
                value = value.min(maximum);
            }
            material.custom_parameters[index][component] = value;
        }
    }
    for (name, path) in block
        .custom_texture_names
        .iter()
        .zip(&block.custom_texture_values)
    {
        let name = name.trim();
        let Some(index) = material
            .custom_texture_names
            .iter()
            .position(|declared| declared == name)
        else {
            continue;
        };
        if let Ok(path) = normalize_property_block_texture_path(path) {
            material.custom_textures[index] = path;
        }
    }
    material
}

pub fn validate_material_property_block(
    block: &MaterialPropertyBlock,
    material: &RenderMaterial,
) -> Result<(), String> {
    if block.custom_parameter_names.len() != block.custom_parameter_values.len() {
        return Err("custom parameter names and values must have equal lengths".into());
    }
    if block.custom_parameter_names.len() > MAX_SURFACE_SHADER_PARAMETERS {
        return Err(format!(
            "MaterialPropertyBlock contains more than {MAX_SURFACE_SHADER_PARAMETERS} custom parameters"
        ));
    }
    let mut names = HashSet::new();
    for (name, value) in block
        .custom_parameter_names
        .iter()
        .zip(&block.custom_parameter_values)
    {
        if name.trim() != name || !valid_surface_binding_name(name) || !names.insert(name) {
            return Err(format!(
                "MaterialPropertyBlock contains invalid or duplicate custom parameter '{name}'"
            ));
        }
        if !material
            .custom_parameter_bindings
            .iter()
            .any(|declared| declared.name == *name)
        {
            return Err(format!(
                "MaterialPropertyBlock parameter '{name}' is not declared by the renderer Surface Shader"
            ));
        }
        if value.iter().any(|component| !component.is_finite()) {
            return Err(format!(
                "MaterialPropertyBlock parameter '{name}' must contain finite values"
            ));
        }
    }
    if block.custom_texture_names.len() != block.custom_texture_values.len() {
        return Err("custom texture names and values must have equal lengths".into());
    }
    if block.custom_texture_names.len() > MAX_SURFACE_SHADER_TEXTURES {
        return Err(format!(
            "MaterialPropertyBlock contains more than {MAX_SURFACE_SHADER_TEXTURES} custom textures"
        ));
    }
    names.clear();
    for (name, path) in block
        .custom_texture_names
        .iter()
        .zip(&block.custom_texture_values)
    {
        if name.trim() != name || !valid_surface_binding_name(name) || !names.insert(name) {
            return Err(format!(
                "MaterialPropertyBlock contains invalid or duplicate custom texture '{name}'"
            ));
        }
        if !material
            .custom_texture_names
            .iter()
            .any(|declared| declared == name)
        {
            return Err(format!(
                "MaterialPropertyBlock texture '{name}' is not declared by the renderer Surface Shader"
            ));
        }
        normalize_property_block_texture_path(path)?;
    }
    Ok(())
}

fn valid_surface_binding_name(name: &str) -> bool {
    let mut characters = name.chars();
    matches!(characters.next(), Some(first) if first.is_ascii_alphabetic())
        && characters.all(|character| character.is_ascii_alphanumeric() || character == '_')
        && name.len() <= 48
}

fn normalize_property_block_texture_path(path: &str) -> Result<String, String> {
    let normalized = path.trim().replace('\\', "/");
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
            "MaterialPropertyBlock custom texture must be an Assets image path: {path}"
        ));
    }
    Ok(normalized)
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
            custom_parameters: [[0.0; 4]; MAX_SURFACE_SHADER_PARAMETERS],
            custom_parameter_bindings: Arc::from(vec![SurfaceShaderParameterBinding {
                name: "power".into(),
                components: 1,
                min: Some(0.0),
                max: Some(8.0),
            }]),
            custom_textures: std::array::from_fn(|_| String::new()),
            custom_texture_names: Arc::from(vec!["detail".into()]),
            ..RenderMaterial::default()
        };
        let block = MaterialPropertyBlock {
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
            custom_parameter_names: vec!["power".into()],
            custom_parameter_values: vec![[99.0, 5.0, 5.0, 5.0]],
            custom_texture_names: vec!["detail".into()],
            custom_texture_values: vec!["Assets\\Textures\\object.png".into()],
        };
        assert!(validate_material_property_block(&block, &source).is_ok());
        let result = apply_material_property_block(source, &block);
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
        assert_eq!(result.custom_parameters[0][0], 8.0);
        assert_eq!(result.custom_textures[0], "Assets/Textures/object.png");
        assert!(!result.surface_shader.is_empty());

        let invalid = MaterialPropertyBlock {
            custom_texture_names: vec!["removed".into()],
            custom_texture_values: vec!["../outside.png".into()],
            ..MaterialPropertyBlock::default()
        };
        assert!(validate_material_property_block(&invalid, &result).is_err());
    }

    #[test]
    fn custom_surface_shader_is_loaded_validated_and_attached_to_material() {
        let root = std::env::temp_dir().join(format!("mengine-surface-{}", Uuid::new_v4()));
        std::fs::create_dir_all(root.join("Assets/Materials")).unwrap();
        std::fs::create_dir_all(root.join("Assets/Shaders")).unwrap();
        std::fs::write(
            root.join("Assets/Shaders/Rim.mshader"),
            r#"/* MENGINE_PARAMETERS
            {"parameters":[
              {"name":"rim_color","type":"color","default":[1,1,1,1]},
              {"name":"rim_power","type":"float","default":2,"min":0,"max":8}
            ],"textures":[
              {"name":"detail","type":"color","default":"Assets/Textures/default.png"},
              {"name":"mask","type":"data"}
            ]}
            */
            fn mengine_lit_surface_hook(
              surface: MEngineSurface, uv: vec2<f32>,
              world_position: vec3<f32>
            ) -> MEngineSurface {
              var result = surface;
              result.roughness = 0.2 + uv.x;
              result.emissive = mengine_param_rim_color().xyz * mengine_param_rim_power();
              return result;
            }"#,
        )
        .unwrap();
        std::fs::write(
            root.join("Assets/Materials/Rim.mmat"),
            r#"{"version":10,"shader":"custom","custom_shader":"Assets/Shaders/Rim.mshader","custom_parameters":{"rim_color":[0.2,0.4,0.8,1],"rim_power":[3,0,0,0]},"custom_textures":{"mask":"Assets/Textures/mask.png"}}"#,
        )
        .unwrap();

        let mut cache = RuntimeMaterialCache::new(Some(root.clone()));
        let material = cache.resolve("Assets/Materials/Rim.mmat").unwrap();
        assert!(material.surface_shader.contains("result.roughness"));
        assert_eq!(material.custom_parameters[0], [0.2, 0.4, 0.8, 1.0]);
        assert_eq!(material.custom_parameters[1], [3.0, 0.0, 0.0, 0.0]);
        assert_eq!(material.custom_parameter_bindings[0].name, "rim_color");
        assert_eq!(material.custom_parameter_bindings[1].name, "rim_power");
        assert_eq!(material.custom_parameter_bindings[0].components, 4);
        assert_eq!(material.custom_parameter_bindings[1].components, 1);
        assert_eq!(material.custom_parameter_bindings[1].min, Some(0.0));
        assert_eq!(material.custom_parameter_bindings[1].max, Some(8.0));
        assert_eq!(material.custom_textures[0], "Assets/Textures/default.png");
        assert_eq!(material.custom_textures[1], "Assets/Textures/mask.png");
        assert_eq!(material.custom_texture_names[0], "detail");
        assert_eq!(material.custom_texture_names[1], "mask");
        assert_eq!(material.custom_texture_srgb, [true, false, false, false]);
        let repeated = cache.resolve("Assets/Materials/Rim.mmat").unwrap();
        assert!(Arc::ptr_eq(
            &material.surface_shader,
            &repeated.surface_shader,
        ));
        assert!(Arc::ptr_eq(
            &material.custom_parameter_bindings,
            &repeated.custom_parameter_bindings,
        ));
        assert!(Arc::ptr_eq(
            &material.custom_texture_names,
            &repeated.custom_texture_names,
        ));

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn reflected_shader_parameters_use_defaults_clamp_ranges_and_reject_stale_values() {
        let shader = r#"/* MENGINE_PARAMETERS
        {"parameters":[{"name":"power","type":"float","default":2,"min":0,"max":8}]}
        */
        fn mengine_lit_surface_hook(
          surface: MEngineSurface, uv: vec2<f32>, world_position: vec3<f32>
        ) -> MEngineSurface { return surface; }"#;
        let mut material = MaterialAsset {
            shader: MaterialShader::Custom,
            ..MaterialAsset::default()
        };
        assert_eq!(
            pack_surface_shader_parameters(&material, shader).unwrap()[0][0],
            2.0
        );
        material
            .custom_parameters
            .insert("power".into(), [99.0, 0.0, 0.0, 0.0]);
        assert_eq!(
            pack_surface_shader_parameters(&material, shader).unwrap()[0][0],
            8.0
        );
        material
            .custom_parameters
            .insert("removed".into(), [1.0, 0.0, 0.0, 0.0]);
        assert!(pack_surface_shader_parameters(&material, shader)
            .unwrap_err()
            .contains("not declared"));
    }

    #[test]
    fn reflected_shader_textures_resolve_defaults_overrides_and_color_space() {
        let shader = r#"/* MENGINE_PARAMETERS
        {"textures":[
          {"name":"detail","type":"color","default":"Assets/Textures/default.png"},
          {"name":"mask","type":"data"}
        ]}
        */
        fn mengine_lit_surface_hook(
          surface: MEngineSurface, uv: vec2<f32>, world_position: vec3<f32>
        ) -> MEngineSurface { return surface; }"#;
        let mut material = MaterialAsset {
            shader: MaterialShader::Custom,
            ..MaterialAsset::default()
        };
        material
            .custom_textures
            .insert("mask".into(), "Assets/Textures/mask.png".into());
        let (textures, srgb) = resolve_surface_shader_textures(&material, shader).unwrap();
        assert_eq!(textures[0], "Assets/Textures/default.png");
        assert_eq!(textures[1], "Assets/Textures/mask.png");
        assert_eq!(srgb, [true, false, false, false]);
        material
            .custom_textures
            .insert("removed".into(), "Assets/Textures/stale.png".into());
        assert!(resolve_surface_shader_textures(&material, shader)
            .unwrap_err()
            .contains("not declared"));
    }

    #[test]
    fn surface_shader_keywords_resolve_defaults_and_material_overrides() {
        let shader = r#"/* MENGINE_PARAMETERS
        {"keywords":[
          {"name":"USE_RIM","default":true},
          {"name":"USE_DETAIL","default":false}
        ]}
        */
        fn mengine_lit_surface_hook(
          surface: MEngineSurface, uv: vec2<f32>, world_position: vec3<f32>
        ) -> MEngineSurface { return surface; }"#;
        let mut material = MaterialAsset {
            shader: MaterialShader::Custom,
            ..MaterialAsset::default()
        };
        assert_eq!(
            resolve_surface_shader_keywords(&material, shader).unwrap(),
            vec!["USE_RIM"]
        );
        material.custom_keywords.insert("USE_RIM".into(), false);
        material.custom_keywords.insert("USE_DETAIL".into(), true);
        assert_eq!(
            resolve_surface_shader_keywords(&material, shader).unwrap(),
            vec!["USE_DETAIL"]
        );
        material.custom_keywords.insert("STALE".into(), true);
        assert!(resolve_surface_shader_keywords(&material, shader)
            .unwrap_err()
            .contains("not declared"));
    }

    #[test]
    fn material_instances_resolve_nested_overrides_and_parent_hot_reload() {
        let root = std::env::temp_dir().join(format!("mengine-instance-{}", Uuid::new_v4()));
        let materials = root.join("Assets/Materials");
        std::fs::create_dir_all(&materials).unwrap();
        let parent = materials.join("Base.mmat");
        std::fs::write(
            &parent,
            r#"{"version":8,"name":"Base","shader":"custom","custom_shader":"Assets/Shaders/Rim.mshader","custom_parameters":{"rim_color":[1,0.5,0,1]},"base_color":[1,0,0,1],"roughness":0.8}"#,
        )
        .unwrap();
        std::fs::write(
            materials.join("Wet.minst"),
            r#"{"version":2,"name":"Wet","parent":"Assets/Materials/Base.mmat","overrides":{"roughness":0.2,"clearcoat":0.7,"custom_parameters":{"rim_color":[0.2,0.5,1,1]}}}"#,
        )
        .unwrap();
        std::fs::write(
            materials.join("Ocean.minst"),
            r#"{"version":2,"name":"Ocean","parent":"Assets/Materials/Wet.minst","overrides":{"base_color":[0,0.2,0.8,1],"ior":1.33,"custom_parameters":{"rim_power":[3,0,0,0]}}}"#,
        )
        .unwrap();

        let mut cache = RuntimeMaterialCache::new(Some(root.clone()));
        let first = cache.resolve_asset("Assets/Materials/Ocean.minst").unwrap();
        assert_eq!(first.name, "Ocean");
        assert_eq!(first.base_color, [0.0, 0.2, 0.8, 1.0]);
        assert_eq!(first.roughness, 0.2);
        assert_eq!(first.clearcoat, 0.7);
        assert_eq!(first.ior, 1.33);
        assert_eq!(first.custom_parameters["rim_color"], [0.2, 0.5, 1.0, 1.0]);
        assert_eq!(first.custom_parameters["rim_power"][0], 3.0);

        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(
            &parent,
            r#"{"version":8,"name":"Base","shader":"custom","custom_shader":"Assets/Shaders/Rim.mshader","custom_parameters":{"rim_color":[1,0,0,1]},"base_color":[1,0,0,1],"roughness":0.8,"emissive_strength":4}"#,
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

    #[test]
    fn missing_material_uses_error_material_and_diagnostic_clears_after_recovery() {
        let root = std::env::temp_dir().join(format!("mengine-material-error-{}", Uuid::new_v4()));
        let materials = root.join("Assets/Materials");
        std::fs::create_dir_all(&materials).unwrap();
        let key = "Assets/Materials/Recovered.mmat";
        let mut cache = RuntimeMaterialCache::new(Some(root.clone()));

        let missing = cache.resolve(key).unwrap();
        assert!(missing.is_error);
        assert_eq!(missing.base_color, [1.0, 0.0, 1.0, 1.0]);
        assert_eq!(cache.diagnostics().len(), 1);
        assert_eq!(cache.diagnostics()[0].asset, key);

        std::fs::write(
            materials.join("Recovered.mmat"),
            r#"{"version":10,"name":"Recovered"}"#,
        )
        .unwrap();
        cache.invalidate(key);
        let recovered = cache.resolve(key).unwrap();
        assert!(!recovered.is_error);
        assert!(cache.diagnostics().is_empty());

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn invalid_custom_shader_uses_error_material_until_shader_recovers() {
        let root = std::env::temp_dir().join(format!("mengine-shader-error-{}", Uuid::new_v4()));
        let materials = root.join("Assets/Materials");
        let shaders = root.join("Assets/Shaders");
        std::fs::create_dir_all(&materials).unwrap();
        std::fs::create_dir_all(&shaders).unwrap();
        let material_key = "Assets/Materials/Broken.mmat";
        let shader_key = "Assets/Shaders/Broken.mshader";
        std::fs::write(
            materials.join("Broken.mmat"),
            r#"{"version":10,"name":"Broken","shader":"custom","custom_shader":"Assets/Shaders/Broken.mshader"}"#,
        )
        .unwrap();
        std::fs::write(shaders.join("Broken.mshader"), "fn unrelated() {}\n").unwrap();
        let mut cache = RuntimeMaterialCache::new(Some(root.clone()));

        assert!(cache.resolve(material_key).unwrap().is_error);
        assert_eq!(cache.diagnostics()[0].asset, shader_key);
        assert!(cache.resolve(material_key).unwrap().is_error);
        assert_eq!(cache.diagnostics().len(), 1);

        std::fs::write(
            shaders.join("Broken.mshader"),
            r#"fn mengine_lit_surface_hook(
    surface: MEngineSurface,
    uv: vec2<f32>,
    world_position: vec3<f32>,
) -> MEngineSurface {
    return surface;
}
"#,
        )
        .unwrap();
        cache.invalidate(shader_key);
        let recovered = cache.resolve(material_key).unwrap();
        assert!(!recovered.is_error);
        assert!(cache.diagnostics().is_empty());

        std::fs::remove_dir_all(root).unwrap();
    }
}
