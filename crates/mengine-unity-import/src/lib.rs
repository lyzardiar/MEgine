//! Unity package analysis and transactional native asset import. Author: MiYu.
mod particle;
mod shader;

use anyhow::{ensure, Context, Result};
use flate2::read::GzDecoder;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    io::Read,
    path::{Component, Path, PathBuf},
    process::Command,
};

const MAX_FILE: u64 = 256 * 1024 * 1024;
const MAX_TOTAL: u64 = 1024 * 1024 * 1024;
const MAX_ENTRIES: usize = 100_000;
pub const IMPORTER_VERSION: &str = "1.4.0";
pub const CONVERTER_ARCHIVE_SHA256: &str =
    "9ff30dc5839155aead31ddadce99884773f8bf81678f3ac9a97ca24f8d58d64c";
const CONVERTER_EXE_SHA256: &str =
    "8d90fb5e0a8d186a3d9a7ff8c75eaee541c3975ce4df0d80351f20092ae0877f";

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AssetSummary {
    pub guid: String,
    pub path: String,
    pub kind: String,
    pub sha256: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AnalysisReport {
    pub fingerprint: String,
    pub source_path: String,
    pub asset_count: usize,
    pub prefab_count: usize,
    pub particle_count: usize,
    pub mesh_count: usize,
    pub texture_count: usize,
    pub assets: Vec<AssetSummary>,
    pub warnings: Vec<String>,
    pub blockers: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ImportResult {
    pub report: AnalysisReport,
    pub destination: String,
    pub source_destination: String,
    pub prefab_paths: Vec<String>,
    pub manifest_path: String,
}
#[derive(Clone)]
struct Asset {
    summary: AssetSummary,
    bytes: Vec<u8>,
    meta: Vec<u8>,
}
#[derive(Clone, Debug)]
pub(crate) struct Document {
    pub class: u32,
    pub id: String,
    pub value: Value,
}

fn sha(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
struct HashReader<R> {
    inner: R,
    digest: Sha256,
    size: u64,
}
impl<R: Read> Read for HashReader<R> {
    fn read(&mut self, buffer: &mut [u8]) -> std::io::Result<usize> {
        let count = self.inner.read(buffer)?;
        self.size += count as u64;
        if self.size > MAX_TOTAL {
            return Err(std::io::Error::other(
                "Compressed package size limit exceeded",
            ));
        }
        self.digest.update(&buffer[..count]);
        Ok(count)
    }
}
fn hash_file(path: &Path) -> Result<String> {
    let mut reader = HashReader {
        inner: fs::File::open(path)?,
        digest: Sha256::new(),
        size: 0,
    };
    std::io::copy(&mut reader, &mut std::io::sink())?;
    Ok(format!("{:x}", reader.digest.finalize()))
}
fn valid_guid(s: &str) -> bool {
    s.len() == 32 && s.bytes().all(|b| b.is_ascii_hexdigit())
}
fn safe_path(path: &str) -> Result<()> {
    ensure!(
        !path.is_empty() && !path.contains(['\\', ':', '\0']),
        "Unsafe archive path: {path}"
    );
    ensure!(
        Path::new(path)
            .components()
            .all(|c| matches!(c, Component::Normal(_))),
        "Unsafe archive path: {path}"
    );
    ensure!(
        path.split('/')
            .all(|p| !p.is_empty() && p != "." && p != ".." && !p.ends_with([' ', '.'])),
        "Unsafe archive path: {path}"
    );
    Ok(())
}
fn package(package: &Path) -> Result<(AnalysisReport, Vec<Asset>)> {
    ensure!(
        fs::metadata(package)?.len() <= MAX_TOTAL,
        "Package exceeds size limit"
    );
    let fingerprint = hash_file(package)?;
    let reader = HashReader {
        inner: fs::File::open(package)?,
        digest: Sha256::new(),
        size: 0,
    };
    let mut archive = tar::Archive::new(GzDecoder::new(reader));
    let mut files = BTreeMap::<String, BTreeMap<String, Vec<u8>>>::new();
    let mut seen = BTreeSet::new();
    let mut total = 0u64;
    for (index, entry) in archive.entries()?.enumerate() {
        ensure!(index < MAX_ENTRIES, "Archive entry limit exceeded");
        let mut entry = entry?;
        let name = String::from_utf8(entry.path_bytes().into_owned())
            .context("Archive path is not UTF-8")?;
        let name = name.trim_end_matches('/');
        safe_path(name)?;
        ensure!(
            seen.insert(name.to_ascii_lowercase()),
            "Duplicate archive entry: {name}"
        );
        if entry.header().entry_type().is_dir() {
            ensure!(valid_guid(name), "Invalid asset directory: {name}");
            continue;
        }
        ensure!(
            entry.header().entry_type().is_file(),
            "Links and special archive entries are forbidden: {name}"
        );
        let (guid, leaf) = name
            .split_once('/')
            .context("Expected GUID/member archive layout")?;
        ensure!(
            valid_guid(guid) && matches!(leaf, "asset" | "asset.meta" | "pathname" | "preview.png"),
            "Unsupported archive member: {name}"
        );
        let size = entry.size();
        total = total.checked_add(size).context("Archive size overflow")?;
        ensure!(
            size <= MAX_FILE && total <= MAX_TOTAL,
            "Decompressed archive size limit exceeded"
        );
        let mut body = Vec::new();
        entry.read_to_end(&mut body)?;
        files
            .entry(guid.to_ascii_lowercase())
            .or_default()
            .insert(leaf.into(), body);
    }
    let mut decoder = archive.into_inner();
    // Finish gzip validation and hash any buffered/trailing compressed bytes as well.
    std::io::copy(
        &mut decoder.by_ref().take(MAX_TOTAL + 1),
        &mut std::io::sink(),
    )
    .and_then(|n| {
        if n > MAX_TOTAL {
            Err(std::io::Error::other(
                "Trailing decompressed data exceeds limit",
            ))
        } else {
            Ok(n)
        }
    })?;
    let mut reader = decoder.into_inner();
    std::io::copy(&mut reader, &mut std::io::sink())?;
    ensure!(
        format!("{:x}", reader.digest.finalize()) == fingerprint,
        "Package changed while analyzing; retry with a stable source file"
    );
    let mut assets = Vec::new();
    let mut paths = BTreeSet::new();
    for (guid, mut members) in files {
        let pathname = members
            .remove("pathname")
            .context("Missing asset pathname")?;
        let path = std::str::from_utf8(&pathname)?
            .trim_end_matches(['\r', '\n', '\0'])
            .to_owned();
        safe_path(&path)?;
        ensure!(
            path.starts_with("Assets/"),
            "Asset pathname must be under Assets: {path}"
        );
        ensure!(
            paths.insert(path.to_ascii_lowercase()),
            "Conflicting asset pathname: {path}"
        );
        let meta = members.remove("asset.meta").context("Missing asset.meta")?;
        let metadata: Value = yaml_value(&meta)?;
        ensure!(
            metadata["guid"].as_str() == Some(guid.as_str()),
            "GUID mismatch for {path}"
        );
        if metadata["folderAsset"].as_bool() == Some(true)
            || metadata["folderAsset"].as_str() == Some("yes")
        {
            continue;
        }
        let bytes = members.remove("asset").context("Missing asset bytes")?;
        let ext = Path::new(&path)
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        let kind = match ext.as_str() {
            "prefab" => "prefab",
            "mat" => "material",
            "fbx" => "mesh",
            "png" | "tga" | "jpg" | "jpeg" => "texture",
            "shader" | "hlsl" | "cginc" => "shader_source",
            _ => "source",
        };
        assets.push(Asset {
            summary: AssetSummary {
                guid,
                path,
                kind: kind.into(),
                sha256: sha(&bytes),
            },
            bytes,
            meta,
        });
    }
    let mut report = AnalysisReport {
        fingerprint,
        source_path: package.display().to_string(),
        asset_count: assets.len(),
        prefab_count: 0,
        particle_count: 0,
        mesh_count: 0,
        texture_count: 0,
        assets: assets.iter().map(|a| a.summary.clone()).collect(),
        warnings: vec![],
        blockers: vec![],
    };
    let guids: BTreeSet<_> = assets.iter().map(|a| a.summary.guid.as_str()).collect();
    let used_materials: BTreeSet<String> = assets
        .iter()
        .filter(|a| a.summary.kind == "prefab")
        .map(|a| documents(&a.bytes))
        .collect::<Result<Vec<_>>>()?
        .iter()
        .flatten()
        .filter(|d| d.class == 199)
        .flat_map(|d| d.value["m_Materials"].as_array().into_iter().flatten())
        .filter_map(|v| v["guid"].as_str().map(str::to_owned))
        .collect();
    let mut custom_materials = BTreeSet::new();
    for asset in assets.iter().filter(|a| a.summary.kind == "material") {
        if documents(&asset.bytes)?
            .iter()
            .any(|d| d.class == 21 && particle::material_uses_custom_data(&d.value))
        {
            custom_materials.insert(asset.summary.guid.as_str());
        }
    }
    for a in &assets {
        match a.summary.kind.as_str() {
            "prefab" => {
                report.prefab_count += 1;
                let docs = documents(&a.bytes)?;
                report.particle_count += docs.iter().filter(|d| d.class == 198).count();
                for d in &docs {
                    if ![1, 4, 198, 199].contains(&d.class) {
                        report.warnings.push(format!(
                            "{}: component class {} retained in source snapshot only",
                            a.summary.path, d.class
                        ));
                    }
                    missing_refs(&d.value, &guids, &mut report.blockers, &a.summary.path);
                    if d.class == 198 {
                        particle::diagnostics(&d.value, &mut report.blockers, &a.summary.path);
                        if has_weighted_curve(&d.value) {
                            report.blockers.push(format!(
                                "{}: weighted particle curve tangents are unsupported",
                                a.summary.path
                            ));
                        }
                    }
                    if d.class == 199 {
                        particle::renderer_diagnostics(
                            &d.value,
                            d.value["m_Materials"]
                                .as_array()
                                .into_iter()
                                .flatten()
                                .filter_map(|m| m["guid"].as_str())
                                .any(|g| custom_materials.contains(g)),
                            &mut report.blockers,
                            &a.summary.path,
                        );
                    }
                }
            }
            "material" => {
                for d in documents(&a.bytes)? {
                    let used = d.class == 21 && used_materials.contains(&a.summary.guid);
                    if used {
                        let verification = shader::verify(
                            &assets,
                            d.value["m_Shader"]["guid"].as_str().unwrap_or(""),
                        );
                        if let Some(reason) = verification.reason {
                            report.warnings.push(format!(
                                "{}: {reason}; native particle preview is approximate",
                                a.summary.path
                            ));
                        } else {
                            report.warnings.push(shader::URP_BASELINE_NOTICE.into());
                        }
                        particle::material_diagnostics(
                            &d.value,
                            &mut report.warnings,
                            &a.summary.path,
                        );
                    }
                    let issues = if used {
                        &mut report.blockers
                    } else {
                        &mut report.warnings
                    };
                    // Missing shader source is an explicit approximate adapter;
                    // missing textures and other material references still block.
                    for (field, value) in d.value.as_object().into_iter().flatten() {
                        if field != "m_Shader" {
                            missing_refs(value, &guids, issues, &a.summary.path);
                        }
                    }
                }
            }
            "mesh" => report.mesh_count += 1,
            "texture" => {
                report.texture_count += 1;
                let settings = texture_settings(&yaml_value(&a.meta)?);
                if settings["mipmaps"] == true {
                    report.warnings.push(format!("{}: source mipmaps are enabled; native particle preview currently samples mip level zero",a.summary.path));
                }
            }
            _ => {}
        }
    }
    report.warnings.sort();
    report.warnings.dedup();
    report.blockers.sort();
    report.blockers.dedup();
    Ok((report, assets))
}
fn missing_refs(v: &Value, guids: &BTreeSet<&str>, issues: &mut Vec<String>, path: &str) {
    if let Some(guid) = v.get("guid").and_then(Value::as_str) {
        if !guid.starts_with("0000000000000000") && !guids.contains(guid) {
            issues.push(format!("{path}: missing referenced GUID {guid}"));
        }
    }
    match v {
        Value::Object(o) => {
            for x in o.values() {
                missing_refs(x, guids, issues, path)
            }
        }
        Value::Array(a) => {
            for x in a {
                missing_refs(x, guids, issues, path)
            }
        }
        _ => {}
    }
}
fn has_weighted_curve(value: &Value) -> bool {
    match value {
        Value::Object(o) => {
            o.get("weightedMode")
                .and_then(Value::as_i64)
                .is_some_and(|v| v != 0)
                || o.values().any(has_weighted_curve)
        }
        Value::Array(a) => a.iter().any(has_weighted_curve),
        _ => false,
    }
}
pub fn analyze(package_path: &Path) -> Result<AnalysisReport> {
    package(package_path).map(|p| p.0)
}

/// The fingerprint is mandatory: analysis and import must consume identical package bytes.
/// Runtime and source trees are staged separately. Source publication is rolled back
/// if runtime publication fails; existing trees are never overwritten or removed.
pub fn import_package(
    package_path: &Path,
    project_root: &Path,
    expected_fingerprint: &str,
    converter: Option<&Path>,
) -> Result<ImportResult> {
    let (report, assets) = package(package_path)?;
    ensure!(
        report.fingerprint == expected_fingerprint,
        "Package changed after analysis; analyze again"
    );
    ensure!(
        report.blockers.is_empty(),
        "Package has unresolved references: {}",
        report.blockers.join("; ")
    );
    let project_root = project_root
        .canonicalize()
        .context("Project directory does not exist")?;
    ensure!(project_root.is_dir(), "Project root is not a directory");
    let name: String = package_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("package")
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let relative = format!("Assets/Imported/{}-{}", name, &report.fingerprint[..12]);
    let source_relative = format!(
        "SourceAssets/UnityPackages/{}-{}",
        name,
        &report.fingerprint[..12]
    );
    let destination = project_root.join(&relative);
    let source_destination = project_root.join(&source_relative);
    let parent = destination.parent().unwrap();
    let source_parent = source_destination.parent().unwrap();
    validate_parent_path(&project_root, parent)?;
    validate_parent_path(&project_root, source_parent)?;
    if destination.exists() {
        return reuse_import(
            &destination,
            &relative,
            &source_destination,
            &source_relative,
            &report,
            &assets,
        );
    }
    ensure!(
        !source_destination.exists(),
        "Source snapshot destination already exists without matching runtime import: {}",
        source_destination.display()
    );
    fs::create_dir_all(parent)?;
    fs::create_dir_all(source_parent)?;
    validate_parent_path(&project_root, parent)?;
    validate_parent_path(&project_root, source_parent)?;
    let stage = project_root.join(format!(
        ".unity-import-{}-{}",
        std::process::id(),
        &report.fingerprint[..12]
    ));
    fs::create_dir(&stage).context("Another import transaction is active")?;
    let runtime_stage = stage.join("runtime");
    let source_stage = stage.join("source");
    let result = (|| {
        fs::create_dir(&runtime_stage)?;
        fs::create_dir(&source_stage)?;
        import_staged(
            &assets,
            &report,
            &runtime_stage,
            &source_stage,
            &relative,
            &source_relative,
            converter,
        )
    })()
    .and_then(|prefab_paths| {
        validate_parent_path(&project_root, parent)?;
        validate_parent_path(&project_root, source_parent)?;
        ensure_plain_path(&runtime_stage)?;
        ensure_plain_path(&source_stage)?;
        ensure!(
            !destination.exists() && !source_destination.exists(),
            "Import destination appeared during conversion"
        );
        publish_pair(
            &runtime_stage,
            &destination,
            &source_stage,
            &source_destination,
        )?;
        Ok(ImportResult {
            report: report.clone(),
            destination: destination.display().to_string(),
            source_destination: source_destination.display().to_string(),
            prefab_paths,
            manifest_path: destination.join("manifest.json").display().to_string(),
        })
    });
    if stage.exists() {
        let _ = fs::remove_dir_all(&stage);
    }
    result
}
fn validate_parent_path(project_root: &Path, parent: &Path) -> Result<()> {
    ensure!(
        parent.starts_with(project_root),
        "Import target is outside the project"
    );
    for ancestor in parent.ancestors().take_while(|p| *p != project_root) {
        if ancestor.exists() {
            ensure_plain_path(ancestor)?;
            ensure!(
                ancestor.canonicalize()?.starts_with(project_root),
                "Import target escapes project through a link"
            );
        }
    }
    Ok(())
}
fn publish_pair(
    runtime_stage: &Path,
    destination: &Path,
    source_stage: &Path,
    source_destination: &Path,
) -> Result<()> {
    fs::rename(source_stage, source_destination).context("Publish original source snapshots")?;
    if let Err(error) = fs::rename(runtime_stage, destination) {
        fs::rename(source_destination,source_stage).with_context(||format!("Runtime publication failed ({error}); could not roll back newly published sources at {}",source_destination.display()))?;
        return Err(error)
            .context("Runtime publication failed; original source publication was rolled back");
    }
    Ok(())
}
fn ensure_plain_path(path: &Path) -> Result<()> {
    let metadata = fs::symlink_metadata(path)?;
    ensure!(
        !metadata.file_type().is_symlink(),
        "Import path must not be a symlink: {}",
        path.display()
    );
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        ensure!(
            metadata.file_attributes() & 0x400 == 0,
            "Import path must not be a reparse point: {}",
            path.display()
        );
    }
    Ok(())
}
fn reuse_import(
    destination: &Path,
    relative: &str,
    source_destination: &Path,
    source_relative: &str,
    report: &AnalysisReport,
    assets: &[Asset],
) -> Result<ImportResult> {
    ensure_plain_path(destination)?;
    ensure_plain_path(source_destination)
        .context("Original source snapshot directory is missing or unsafe")?;
    let manifest_path = destination.join("manifest.json");
    ensure_plain_path(&manifest_path)?;
    let manifest: Value = serde_json::from_slice(&fs::read(&manifest_path)?)
        .context("Existing import manifest is invalid")?;
    ensure!(
        manifest["version"] == 1
            && manifest["importer_version"] == IMPORTER_VERSION
            && manifest["source_fingerprint"] == report.fingerprint
            && manifest["import_key"]
                == sha(format!("{}:{}", IMPORTER_VERSION, report.fingerprint).as_bytes()),
        "Existing import has stale or conflicting provenance"
    );
    let expected_texture_settings: BTreeMap<String, Value> = assets
        .iter()
        .filter(|a| a.summary.kind == "texture")
        .map(|a| {
            Ok((
                format!("{relative}/Textures/{}.png", a.summary.guid),
                texture_settings(&yaml_value(&a.meta)?),
            ))
        })
        .collect::<Result<_>>()?;
    ensure!(
        manifest["texture_import_settings"] == serde_json::to_value(expected_texture_settings)?,
        "Existing import sampler metadata is stale; regenerate the import"
    );
    let recorded = manifest["outputs"]
        .as_array()
        .context("Existing import has no output hashes")?;
    let mut actual = Vec::new();
    collect_output_hashes(destination, destination, &mut actual)?;
    actual.retain(|v| v["path"] != "manifest.json");
    ensure!(&actual==recorded,"Existing import files were changed, added or removed; choose a new destination or restore the original files");
    ensure!(
        manifest["source_root"] == source_relative,
        "Existing import source root does not match this project"
    );
    let mut actual_sources = Vec::new();
    collect_output_hashes(source_destination, source_destination, &mut actual_sources)?;
    ensure!(
        manifest["source_outputs"] == serde_json::to_value(actual_sources)?,
        "Original source snapshot files were changed, added or removed"
    );
    // Compare snapshots against this source, independently of the editable manifest hashes.
    for asset in assets {
        let source = source_destination.join(&asset.summary.guid);
        ensure!(
            fs::read(source.join("asset"))? == asset.bytes
                && fs::read(source.join("asset.meta"))? == asset.meta
                && fs::read_to_string(source.join("pathname"))? == asset.summary.path,
            "Existing original source snapshot was changed"
        );
    }
    let prefab_paths: Vec<String> = serde_json::from_value(manifest["prefabs"].clone())?;
    let expected_prefabs: Vec<String> = assets
        .iter()
        .filter(|a| a.summary.kind == "prefab")
        .map(|a| format!("{relative}/Prefabs/{}.prefab", a.summary.guid))
        .collect();
    ensure!(
        prefab_paths == expected_prefabs,
        "Existing prefab manifest paths are invalid"
    );
    Ok(ImportResult {
        report: report.clone(),
        destination: destination.display().to_string(),
        source_destination: source_destination.display().to_string(),
        prefab_paths,
        manifest_path: manifest_path.display().to_string(),
    })
}
fn write_json(path: &Path, value: &impl Serialize) -> Result<()> {
    fs::write(path, serde_json::to_vec_pretty(value)?)?;
    Ok(())
}
fn import_staged(
    assets: &[Asset],
    report: &AnalysisReport,
    stage: &Path,
    source_stage: &Path,
    relative: &str,
    source_relative: &str,
    converter: Option<&Path>,
) -> Result<Vec<String>> {
    for d in ["Textures", "Meshes", "Particles", "Prefabs", "Materials"] {
        fs::create_dir(stage.join(d))?;
    }
    let paths: BTreeMap<String, String> = assets
        .iter()
        .filter_map(|a| {
            let suffix = match a.summary.kind.as_str() {
                "texture" => format!("Textures/{}.png", a.summary.guid),
                "mesh" => format!("Meshes/{}.glb", a.summary.guid),
                _ => return None,
            };
            Some((a.summary.guid.clone(), format!("{relative}/{suffix}")))
        })
        .collect();
    let mut material_values = BTreeMap::new();
    let mut mesh_details = Vec::new();
    let texture_import_settings: BTreeMap<String, Value> = assets
        .iter()
        .filter(|a| a.summary.kind == "texture")
        .map(|a| {
            Ok((
                paths[&a.summary.guid].clone(),
                texture_settings(&yaml_value(&a.meta)?),
            ))
        })
        .collect::<Result<_>>()?;
    let srgb: BTreeMap<_, _> = texture_import_settings
        .iter()
        .map(|(path, v)| (path.clone(), v["srgb"].clone()))
        .collect();
    for asset in assets {
        let source = source_stage.join(&asset.summary.guid);
        fs::create_dir(&source)?;
        fs::write(source.join("asset"), &asset.bytes)?;
        fs::write(source.join("asset.meta"), &asset.meta)?;
        fs::write(source.join("pathname"), &asset.summary.path)?;
        match asset.summary.kind.as_str() {
            "texture" => {
                let ext = Path::new(&asset.summary.path)
                    .extension()
                    .unwrap()
                    .to_str()
                    .unwrap();
                let format =
                    image::ImageFormat::from_extension(ext).context("Unsupported texture")?;
                image::load_from_memory_with_format(&asset.bytes, format)?.save(
                    stage
                        .join("Textures")
                        .join(format!("{}.png", asset.summary.guid)),
                )?;
            }
            "mesh" => {
                let executable=converter.map(Path::to_path_buf).or_else(||std::env::var_os("MENGINE_FBX2GLTF").map(PathBuf::from)).context("FBX converter is required. Run scripts/prepare-unity-import.py and set MENGINE_FBX2GLTF")?;
                ensure!(
                    executable.is_file(),
                    "FBX converter does not exist: {}",
                    executable.display()
                );
                ensure!(
                    sha(&fs::read(&executable)?) == CONVERTER_EXE_SHA256,
                    "FBX converter binary hash mismatch; prepare the pinned converter"
                );
                let input = source.join("source.fbx");
                fs::write(&input, &asset.bytes)?;
                let output = stage.join("Meshes").join(&asset.summary.guid);
                let result = Command::new(&executable)
                    .args(["-i"])
                    .arg(&input)
                    .arg("-o")
                    .arg(&output)
                    .arg("-b")
                    .output()
                    .context("Run FBX2glTF")?;
                ensure!(
                    result.status.success(),
                    "FBX conversion failed for {}: {}",
                    asset.summary.path,
                    String::from_utf8_lossy(&result.stderr)
                );
                let glb = output.with_extension("glb");
                if !glb.exists() {
                    let nested = stage
                        .join("Meshes")
                        .join(format!("{}_out", asset.summary.guid))
                        .join(format!("{}.glb", asset.summary.guid));
                    ensure!(
                        nested.is_file(),
                        "Converter did not produce GLB for {}",
                        asset.summary.path
                    );
                    fs::rename(nested, &glb)?;
                }
                let doc = glb_document(&fs::read(&glb)?)?;
                ensure!(
                    doc["meshes"].as_array().map(Vec::len) == Some(1),
                    "FBX contains multiple meshes; Unity fileID selection is ambiguous for {}",
                    asset.summary.path
                );
                let primitives: Vec<_> = doc["meshes"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .flat_map(|m| m["primitives"].as_array().into_iter().flatten())
                    .collect();
                ensure!(!primitives.is_empty(), "Converted FBX has no geometry");
                for (source_attribute, converted_attribute) in [
                    ("LayerElementUV", "TEXCOORD_0"),
                    ("LayerElementNormal", "NORMAL"),
                    ("LayerElementColor", "COLOR_0"),
                ] {
                    if asset
                        .bytes
                        .windows(source_attribute.len())
                        .any(|w| w == source_attribute.as_bytes())
                    {
                        ensure!(
                            primitives
                                .iter()
                                .all(|p| !p["attributes"][converted_attribute].is_null()),
                            "FBX converter dropped {converted_attribute} from {}",
                            asset.summary.path
                        );
                    }
                }
                mesh_details.push(json!({"guid":asset.summary.guid,"path":paths[&asset.summary.guid],"sha256":sha(&fs::read(&glb)?),"primitive_count":primitives.len(),"has_uv":primitives.iter().all(|p|!p["attributes"]["TEXCOORD_0"].is_null()),"has_normals":primitives.iter().all(|p|!p["attributes"]["NORMAL"].is_null()),"has_vertex_colors":primitives.iter().any(|p|!p["attributes"]["COLOR_0"].is_null())}));
            }
            "material" => {
                let docs = documents(&asset.bytes)?;
                let source = docs
                    .iter()
                    .find(|d| d.class == 21)
                    .context("Material has no class 21 document")?;
                let verification = shader::verify(
                    assets,
                    source.value["m_Shader"]["guid"].as_str().unwrap_or(""),
                );
                let mut value = particle::material(&source.value, &paths, &verification);
                value["source_guid"] = json!(asset.summary.guid);
                if let Some(textures) = value["textures"].as_object_mut() {
                    for texture in textures.values_mut() {
                        if let Some(settings) =
                            texture_import_settings.get(texture["path"].as_str().unwrap_or(""))
                        {
                            for field in ["srgb", "wrap_u", "wrap_v", "filter"] {
                                texture[field] = settings[field].clone();
                            }
                        }
                    }
                }
                write_json(
                    &stage
                        .join("Materials")
                        .join(format!("{}.json", asset.summary.guid)),
                    &value,
                )?;
                material_values.insert(asset.summary.guid.clone(), value);
            }
            _ => {}
        }
    }
    let mut prefab_paths = Vec::new();
    let mut references = Vec::new();
    for asset in assets.iter().filter(|a| a.summary.kind == "prefab") {
        let docs = documents(&asset.bytes)?;
        let by_id: BTreeMap<_, _> = docs.iter().map(|d| (d.id.clone(), d)).collect();
        let transforms: BTreeMap<_, _> = docs
            .iter()
            .filter(|d| d.class == 4)
            .map(|d| (ref_id(&d.value["m_GameObject"]), d))
            .collect();
        let root = docs
            .iter()
            .find(|d| d.class == 4 && ref_id(&d.value["m_Father"]) == "0")
            .context("Prefab has no root transform")?;
        let root_id = ref_id(&root.value["m_GameObject"]);
        let mut visited = BTreeSet::new();
        let root_node = prefab_node(
            &root_id,
            &by_id,
            &transforms,
            &material_values,
            &paths,
            stage,
            relative,
            &mut references,
            &mut visited,
            0,
        )?;
        ensure!(
            visited.len() == docs.iter().filter(|d| d.class == 1).count(),
            "Prefab contains disconnected nodes"
        );
        let path = format!("Prefabs/{}.prefab", asset.summary.guid);
        write_json(
            &stage.join(&path),
            &json!({"version":2,"name":root_node["name"],"root":root_node}),
        )?;
        prefab_paths.push(format!("{relative}/{path}"));
    }
    write_json(&stage.join("analysis.json"), report)?;
    // The editor scans JSON reports too. Create every native sidecar before
    // hashing, including the manifest sidecar, without hashing the manifest itself.
    write_json(&stage.join("manifest.json"), &json!({}))?;
    create_native_sidecars(stage)?;
    let mut outputs = Vec::new();
    collect_output_hashes(stage, stage, &mut outputs)?;
    outputs.retain(|v| v["path"] != "manifest.json");
    let mut source_outputs = Vec::new();
    collect_output_hashes(source_stage, source_stage, &mut source_outputs)?;
    write_json(
        &stage.join("manifest.json"),
        &json!({"version":1,"importer_version":IMPORTER_VERSION,"import_key":sha(format!("{}:{}",IMPORTER_VERSION,report.fingerprint).as_bytes()),"source_fingerprint":report.fingerprint,"assets":report.assets,"outputs":outputs,"source_root":source_relative,"source_outputs":source_outputs,"prefabs":prefab_paths,"references":references,"meshes":mesh_details,"texture_srgb":srgb,"texture_import_settings":texture_import_settings,"converter":{"name":"FBX2glTF","version":"0.9.7-p1","archive_sha256":CONVERTER_ARCHIVE_SHA256,"executable_sha256":CONVERTER_EXE_SHA256},"coordinate_system":"Prefab transforms reflect Unity Z to engine; particle data retains explicit Unity basis; particle meshes use raw FBX2glTF geometry reflected on X, without source node transforms","warnings":report.warnings}),
    )?;
    Ok(prefab_paths)
}
fn runtime_asset_kind(path: &Path) -> Option<&'static str> {
    match path.extension()?.to_str()? {
        "png" => Some("texture"),
        "glb" => Some("model"),
        "mparticle" => Some("particle"),
        "prefab" => Some("prefab"),
        // Matches the editor project scanner's generic JSON classification.
        "json" => Some("spine-json"),
        _ => None,
    }
}
fn create_native_sidecars(directory: &Path) -> Result<()> {
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        let path = entry.path();
        ensure_plain_path(&path)?;
        if entry.file_type()?.is_dir() {
            create_native_sidecars(&path)?;
        } else if let Some(kind) = runtime_asset_kind(&path) {
            mengine_assets::ensure_asset_sidecar(&path, kind).map_err(anyhow::Error::msg)?;
        }
    }
    Ok(())
}
fn collect_output_hashes(root: &Path, directory: &Path, outputs: &mut Vec<Value>) -> Result<()> {
    let mut entries = fs::read_dir(directory)?.collect::<std::io::Result<Vec<_>>>()?;
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        let path = entry.path();
        ensure_plain_path(&path)?;
        if entry.file_type()?.is_dir() {
            collect_output_hashes(root, &path, outputs)?;
        } else {
            ensure!(
                entry.file_type()?.is_file(),
                "Import output is not a regular file"
            );
            outputs.push(json!({"path":path.strip_prefix(root)?.to_string_lossy().replace('\\',"/"),"size":entry.metadata()?.len(),"sha256":hash_file(&path)?}));
        }
    }
    Ok(())
}
pub(crate) fn ref_id(v: &Value) -> String {
    v["fileID"].as_str().unwrap_or("0").to_owned()
}
#[allow(clippy::too_many_arguments)]
fn prefab_node(
    id: &str,
    docs: &BTreeMap<String, &Document>,
    transforms: &BTreeMap<String, &Document>,
    materials: &BTreeMap<String, Value>,
    paths: &BTreeMap<String, String>,
    stage: &Path,
    relative: &str,
    references: &mut Vec<Value>,
    visited: &mut BTreeSet<String>,
    depth: usize,
) -> Result<Value> {
    ensure!(
        depth < 256 && visited.insert(id.into()),
        "Prefab hierarchy cycle or depth limit"
    );
    let object = docs.get(id).context("Missing GameObject")?;
    let tr = transforms.get(id).context("Missing transform")?;
    let mut components = json!({"Transform":unity_transform(&tr.value)});
    let system = docs
        .values()
        .find(|d| d.class == 198 && ref_id(&d.value["m_GameObject"]) == id);
    if let Some(system) = system {
        let renderer = docs
            .values()
            .find(|d| d.class == 199 && ref_id(&d.value["m_GameObject"]) == id)
            .context("Particle renderer missing")?;
        let name = object.value["m_Name"].as_str().unwrap_or("Particle");
        let definition =
            particle::definition(name, &system.value, &renderer.value, materials, paths)?;
        let path = format!("{relative}/Particles/{}.mparticle", system.id);
        write_json(
            &stage
                .join("Particles")
                .join(format!("{}.mparticle", system.id)),
            &definition,
        )?;
        components["ParticleEmitter3D"] = json!({"definition":path,"playing":true,"seed":system.value["randomSeed"],"looping":particle::number(&system.value["looping"],0.)!=0.});
        references.push(json!({"source_file_id":system.id,"game_object_file_id":id,"definition":path,"renderer":renderer.value}));
    }
    let mut children = Vec::new();
    for child in tr.value["m_Children"].as_array().into_iter().flatten() {
        let transform = docs
            .get(&ref_id(child))
            .context("Missing child transform")?;
        children.push(prefab_node(
            &ref_id(&transform.value["m_GameObject"]),
            docs,
            transforms,
            materials,
            paths,
            stage,
            relative,
            references,
            visited,
            depth + 1,
        )?);
    }
    Ok(
        json!({"id":id,"name":object.value["m_Name"],"active":particle::number(&object.value["m_IsActive"],1.)!=0.,"components":components,"children":children}),
    )
}
fn unity_transform(value: &Value) -> Value {
    let mut position = particle::vec3(&value["m_LocalPosition"], 0.);
    position[2] = -position[2];
    let mut rotation = particle::vector(
        &value["m_LocalRotation"],
        &["x", "y", "z", "w"],
        &[0., 0., 0., 1.],
    );
    rotation[0] = -rotation[0];
    rotation[1] = -rotation[1];
    json!({"position":position,"rotation":rotation,"scale":particle::vec3(&value["m_LocalScale"],1.)})
}
fn texture_settings(metadata: &Value) -> Value {
    let importer = &metadata["TextureImporter"];
    let sampler = &importer["textureSettings"];
    let wrap = |key: &str| match sampler[key]
        .as_i64()
        .unwrap_or_else(|| sampler["wrapMode"].as_i64().unwrap_or(0))
    {
        1 => "clamp",
        2 => "mirror",
        3 => "mirror_once",
        _ => "repeat",
    };
    let srgb = importer["mipmaps"]
        .get("sRGBTexture")
        .unwrap_or(&importer["sRGBTexture"]);
    json!({"srgb":particle::number(srgb,1.)!=0.,"wrap_u":wrap("wrapU"),"wrap_v":wrap("wrapV"),"filter":match sampler["filterMode"].as_i64().unwrap_or(1) {0=>"point",2=>"trilinear",_=>"bilinear"},"mipmaps":particle::number(&importer["mipmaps"]["enableMipMap"],0.)!=0.})
}
fn glb_document(bytes: &[u8]) -> Result<Value> {
    ensure!(bytes.len() >= 20 && &bytes[..4] == b"glTF", "Invalid GLB");
    let len = u32::from_le_bytes(bytes[12..16].try_into()?) as usize;
    ensure!(20 + len <= bytes.len(), "Invalid GLB JSON length");
    Ok(serde_json::from_slice(&bytes[20..20 + len])?)
}
fn yaml_value(bytes: &[u8]) -> Result<Value> {
    let value: serde_yaml::Value = serde_yaml::from_slice(bytes)?;
    fn convert(v: serde_yaml::Value, key: &str) -> Result<Value> {
        Ok(match v {
            serde_yaml::Value::Mapping(m) => {
                let mut o = serde_json::Map::new();
                for (k, v) in m {
                    let k = k.as_str().context("Non-string YAML key")?;
                    o.insert(k.into(), convert(v, k)?);
                }
                Value::Object(o)
            }
            serde_yaml::Value::Sequence(a) => Value::Array(
                a.into_iter()
                    .map(|v| convert(v, ""))
                    .collect::<Result<_>>()?,
            ),
            serde_yaml::Value::Number(n) if key == "fileID" => Value::String(n.to_string()),
            serde_yaml::Value::Number(n) => serde_json::to_value(n).unwrap_or(Value::Null),
            serde_yaml::Value::String(s) => Value::String(s),
            serde_yaml::Value::Bool(b) => Value::Bool(b),
            serde_yaml::Value::Null => Value::Null,
            serde_yaml::Value::Tagged(t) => convert(t.value, key)?,
        })
    }
    convert(value, "")
}
pub(crate) fn documents(bytes: &[u8]) -> Result<Vec<Document>> {
    let text = std::str::from_utf8(bytes)?;
    let mut documents = Vec::new();
    let mut header: Option<(u32, String)> = None;
    let mut body = String::new();
    fn push(docs: &mut Vec<Document>, header: &Option<(u32, String)>, body: &str) -> Result<()> {
        if let Some((class, id)) = header {
            let v = yaml_value(body.as_bytes())?;
            let value = v
                .as_object()
                .and_then(|o| o.values().next())
                .context("Empty Unity document")?
                .clone();
            docs.push(Document {
                class: *class,
                id: id.clone(),
                value,
            });
        }
        Ok(())
    }
    for line in text.lines() {
        if let Some(h) = line.strip_prefix("--- !u!") {
            push(&mut documents, &header, &body)?;
            body.clear();
            let (class, id) = h.split_once(" &").context("Malformed Unity YAML header")?;
            let id = id.split_whitespace().next().context("Missing fileID")?;
            ensure!(id.parse::<i64>().is_ok(), "Invalid fileID");
            header = Some((class.parse()?, id.into()));
        } else if header.is_some() {
            body.push_str(line);
            body.push('\n');
        }
    }
    push(&mut documents, &header, &body)?;
    ensure!(!documents.is_empty(), "No Unity YAML documents");
    let mut ids = BTreeSet::new();
    ensure!(
        documents.iter().all(|d| ids.insert(&d.id)),
        "Duplicate Unity fileID"
    );
    Ok(documents)
}

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::{write::GzEncoder, Compression};
    const GUID: &str = "a1234567890123456789012345678901";
    #[test]
    fn texture_sampler_and_nested_srgb_are_preserved() {
        let value = texture_settings(
            &json!({"TextureImporter":{"mipmaps":{"sRGBTexture":0,"enableMipMap":1},"textureSettings":{"wrapU":0,"wrapV":1,"filterMode":0}}}),
        );
        assert_eq!(
            value,
            json!({"srgb":false,"wrap_u":"repeat","wrap_v":"clamp","filter":"point","mipmaps":true})
        );
    }
    #[test]
    fn prefab_transform_reflects_unity_z_axis() {
        let value = unity_transform(
            &json!({"m_LocalPosition":{"x":1.,"y":2.,"z":3.},"m_LocalRotation":{"x":0.1,"y":0.2,"z":0.3,"w":0.9},"m_LocalScale":{"x":2.,"y":3.,"z":4.}}),
        );
        assert_eq!(value["position"], json!([1., 2., -3.]));
        assert_eq!(value["rotation"], json!([-0.1, -0.2, 0.3, 0.9]));
        assert_eq!(value["scale"], json!([2., 3., 4.]));
    }
    fn archive(path: &Path, entries: &[(&str, &[u8])]) {
        let file = fs::File::create(path).unwrap();
        let gzip = GzEncoder::new(file, Compression::fast());
        let mut tar = tar::Builder::new(gzip);
        for (name, data) in entries {
            let mut header = tar::Header::new_gnu();
            header.set_size(data.len() as u64);
            header.set_mode(0o644);
            header.set_cksum();
            tar.append_data(&mut header, name, *data).unwrap();
        }
        tar.into_inner().unwrap().finish().unwrap();
    }
    fn simple_package(path: &Path, pathname: &str) {
        archive(
            path,
            &[
                (&format!("{GUID}/pathname"), pathname.as_bytes()),
                (
                    &format!("{GUID}/asset.meta"),
                    format!("fileFormatVersion: 2\nguid: {GUID}\n").as_bytes(),
                ),
                (&format!("{GUID}/asset"), b"original bytes"),
            ],
        );
    }
    #[test]
    fn signed_file_ids_are_exact_strings() {
        let docs=documents(b"%YAML 1.1\n--- !u!4 &7254309366521424843\nTransform:\n  m_Mesh: {fileID: -1319848589710561965, guid: a1234567890123456789012345678901}\n").unwrap();
        assert_eq!(docs[0].id, "7254309366521424843");
        assert_eq!(docs[0].value["m_Mesh"]["fileID"], "-1319848589710561965");
    }
    #[test]
    fn traversal_and_duplicate_archive_members_fail() {
        let temp = tempfile::tempdir().unwrap();
        let p = temp.path().join("p.unitypackage");
        simple_package(&p, "Assets/../outside.txt");
        assert!(analyze(&p).is_err());
        archive(
            &p,
            &[
                (&format!("{GUID}/asset"), b"a"),
                (&format!("{GUID}/asset"), b"b"),
            ],
        );
        assert!(analyze(&p).unwrap_err().to_string().contains("Duplicate"));
    }
    #[test]
    fn missing_shader_source_warns_and_serializes_approximate_adapter() {
        let temp = tempfile::tempdir().unwrap();
        let package = temp.path().join("p.unitypackage");
        let material_guid = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
        let material = b"%YAML 1.1\n--- !u!21 &2100000\nMaterial:\n  m_Shader: {fileID: 4800000, guid: f31c201e480f44f9a78911601ee5cab2}\n  m_SavedProperties: {}\n";
        archive(&package, &[
            (&format!("{GUID}/pathname"), b"Assets/test.prefab"),
            (&format!("{GUID}/asset.meta"), format!("guid: {GUID}\n").as_bytes()),
            (&format!("{GUID}/asset"), format!("%YAML 1.1\n--- !u!199 &1\nParticleSystemRenderer:\n  m_RenderMode: 0\n  m_VertexStreams: '00010304'\n  m_Materials: [{{fileID: 2100000, guid: {material_guid}}}]\n").as_bytes()),
            (&format!("{material_guid}/pathname"), b"Assets/test.mat"),
            (&format!("{material_guid}/asset.meta"), format!("guid: {material_guid}\n").as_bytes()),
            (&format!("{material_guid}/asset"), material),
        ]);
        let report = analyze(&package).unwrap();
        assert!(report.blockers.is_empty(), "{:?}", report.blockers);
        assert!(report
            .warnings
            .iter()
            .any(|warning| warning.contains("shader source is missing")
                && warning.contains("approximate")));
        let document = documents(material).unwrap();
        let verification = shader::verify(&[], "f31c201e480f44f9a78911601ee5cab2");
        let converted = particle::material(&document[0].value, &BTreeMap::new(), &verification);
        assert_eq!(converted["shader"], "unsupported");
        assert_eq!(converted["shader_verification"]["status"], "approximate");
        assert_eq!(
            converted["shader_verification"]["external_urp_baseline"],
            "14.0.11"
        );
    }
    #[test]
    fn native_sidecars_survive_registry_refresh_for_every_generated_kind() {
        let temp = tempfile::tempdir().unwrap();
        let assets = [
            ("texture.png", "texture"),
            ("mesh.glb", "model"),
            ("effect.mparticle", "particle"),
            ("root.prefab", "prefab"),
            ("material.json", "spine-json"),
            ("analysis.json", "spine-json"),
            ("manifest.json", "spine-json"),
        ];
        for (path, _) in assets {
            fs::write(temp.path().join(path), b"{}").unwrap();
        }
        create_native_sidecars(temp.path()).unwrap();
        let mut ids = BTreeSet::new();
        let mut first_registry = mengine_assets::AssetRegistry::new(temp.path());
        let mut second_registry = mengine_assets::AssetRegistry::new(temp.path());
        for (path, kind) in assets {
            let asset = temp.path().join(path);
            let sidecar_path = mengine_assets::asset_sidecar_path(&asset);
            let before = fs::read(&sidecar_path).unwrap();
            let native = mengine_assets::read_asset_sidecar(&asset, kind).unwrap();
            assert_eq!(native.importer, kind);
            assert!(ids.insert(native.guid.0.to_string()));
            assert_ne!(native.guid.0.simple().to_string(), GUID);
            assert_eq!(
                first_registry
                    .register_persisted(path.into(), kind)
                    .unwrap(),
                native.guid
            );
            assert_eq!(
                second_registry
                    .register_persisted(path.into(), kind)
                    .unwrap(),
                native.guid
            );
            assert_eq!(fs::read(sidecar_path).unwrap(), before);
        }
    }
    #[test]
    fn reuse_after_editor_metadata_refresh_preserves_complete_inventory() {
        let temp = tempfile::tempdir().unwrap();
        let package = temp.path().join("p.unitypackage");
        let mut png = std::io::Cursor::new(Vec::new());
        image::RgbaImage::new(1, 1)
            .write_to(&mut png, image::ImageFormat::Png)
            .unwrap();
        archive(
            &package,
            &[
                (&format!("{GUID}/pathname"), b"Assets/texture.png"),
                (
                    &format!("{GUID}/asset.meta"),
                    format!("fileFormatVersion: 2\nguid: {GUID}\nTextureImporter: {{}}\n")
                        .as_bytes(),
                ),
                (&format!("{GUID}/asset"), png.get_ref()),
            ],
        );
        let report = analyze(&package).unwrap();
        let result = import_package(&package, temp.path(), &report.fingerprint, None).unwrap();
        let root = Path::new(&result.destination);
        let mut before = Vec::new();
        collect_output_hashes(root, root, &mut before).unwrap();
        let mut registry = mengine_assets::AssetRegistry::new(root);
        let mut metadata_count = 0;
        for output in &before {
            let path = Path::new(output["path"].as_str().unwrap());
            if let Some(kind) = runtime_asset_kind(path) {
                let native = mengine_assets::read_asset_sidecar(&root.join(path), kind).unwrap();
                assert_ne!(native.guid.0.simple().to_string(), GUID);
                assert_eq!(
                    registry.register_persisted(path.to_owned(), kind).unwrap(),
                    native.guid
                );
                metadata_count += 1;
            }
        }
        assert_eq!(metadata_count, 3);
        let reused = import_package(&package, temp.path(), &report.fingerprint, None).unwrap();
        assert_eq!(result.destination, reused.destination);
        let mut after = Vec::new();
        collect_output_hashes(root, root, &mut after).unwrap();
        assert_eq!(before, after);
        let original_meta = fs::read(
            Path::new(&result.source_destination)
                .join(GUID)
                .join("asset.meta"),
        )
        .unwrap();
        assert!(serde_json::from_slice::<Value>(&original_meta).is_err());
        fs::write(root.join("manifest.json.meta"), b"modified metadata").unwrap();
        assert!(import_package(&package, temp.path(), &report.fingerprint, None).is_err());
    }
    #[test]
    fn source_snapshot_commit_and_conflict_are_transactional() {
        let temp = tempfile::tempdir().unwrap();
        let p = temp.path().join("p.unitypackage");
        simple_package(&p, "Assets/source.txt");
        let report = analyze(&p).unwrap();
        let result = import_package(&p, temp.path(), &report.fingerprint, None).unwrap();
        let manifest_before = fs::read(&result.manifest_path).unwrap();
        let reused = import_package(&p, temp.path(), &report.fingerprint, None).unwrap();
        assert_eq!(result.destination, reused.destination);
        assert_eq!(manifest_before, fs::read(&result.manifest_path).unwrap());
        let source = Path::new(&result.source_destination)
            .join(GUID)
            .join("asset");
        assert!(Path::new(&result.source_destination).starts_with(
            temp.path()
                .join("SourceAssets/UnityPackages")
                .canonicalize()
                .unwrap()
        ));
        assert!(!Path::new(&result.destination).join("SourceAssets").exists());
        assert_eq!(fs::read(&source).unwrap(), b"original bytes");
        fs::write(&source, b"user edit").unwrap();
        assert!(import_package(&p, temp.path(), &report.fingerprint, None).is_err());
        assert_eq!(fs::read(source).unwrap(), b"user edit");
    }
    #[test]
    fn changed_fingerprint_writes_nothing() {
        let temp = tempfile::tempdir().unwrap();
        let p = temp.path().join("p.unitypackage");
        simple_package(&p, "Assets/source.txt");
        let before = analyze(&p).unwrap();
        simple_package(&p, "Assets/mutated.txt");
        assert!(import_package(&p, temp.path(), &before.fingerprint, None).is_err());
        assert!(!temp.path().join("Assets").exists());
    }
    #[test]
    fn converter_failure_removes_staging_without_publishing() {
        let temp = tempfile::tempdir().unwrap();
        let p = temp.path().join("p.unitypackage");
        simple_package(&p, "Assets/model.fbx");
        let report = analyze(&p).unwrap();
        assert!(import_package(
            &p,
            temp.path(),
            &report.fingerprint,
            Some(Path::new("nonexistent.exe"))
        )
        .is_err());
        let parent = temp.path().join("Assets/Imported");
        assert_eq!(fs::read_dir(parent).unwrap().count(), 0);
        assert_eq!(
            fs::read_dir(temp.path().join("SourceAssets/UnityPackages"))
                .unwrap()
                .count(),
            0
        );
    }
    #[test]
    fn failed_runtime_publish_rolls_back_only_owned_source_tree() {
        let temp = tempfile::tempdir().unwrap();
        let source_stage = temp.path().join("source-stage");
        let source_destination = temp.path().join("source-final");
        fs::create_dir(&source_stage).unwrap();
        fs::write(source_stage.join("asset.meta"), b"owned").unwrap();
        let untouched = temp.path().join("user-original");
        fs::create_dir(&untouched).unwrap();
        fs::write(untouched.join("asset.meta"), b"user").unwrap();
        let result = publish_pair(
            &temp.path().join("missing-runtime-stage"),
            &temp.path().join("runtime-final"),
            &source_stage,
            &source_destination,
        );
        assert!(result.is_err());
        assert!(!source_destination.exists());
        assert_eq!(fs::read(source_stage.join("asset.meta")).unwrap(), b"owned");
        assert_eq!(fs::read(untouched.join("asset.meta")).unwrap(), b"user");
    }
    #[test]
    fn reuse_requires_complete_external_source_inventory() {
        let temp = tempfile::tempdir().unwrap();
        let p = temp.path().join("p.unitypackage");
        simple_package(&p, "Assets/source.txt");
        let report = analyze(&p).unwrap();
        let result = import_package(&p, temp.path(), &report.fingerprint, None).unwrap();
        fs::remove_file(
            Path::new(&result.source_destination)
                .join(GUID)
                .join("asset.meta"),
        )
        .unwrap();
        assert!(import_package(&p, temp.path(), &report.fingerprint, None).is_err());
        assert!(Path::new(&result.destination).is_dir());
    }
    #[test]
    fn reuse_rejects_missing_extra_and_stale_outputs() {
        for change in ["missing", "extra", "stale"] {
            let temp = tempfile::tempdir().unwrap();
            let p = temp.path().join("p.unitypackage");
            simple_package(&p, "Assets/source.txt");
            let report = analyze(&p).unwrap();
            let result = import_package(&p, temp.path(), &report.fingerprint, None).unwrap();
            let root = Path::new(&result.destination);
            match change {
                "missing" => fs::remove_file(root.join("analysis.json")).unwrap(),
                "extra" => fs::write(root.join("user.txt"), b"preserve").unwrap(),
                _ => {
                    let mut manifest: Value =
                        serde_json::from_slice(&fs::read(&result.manifest_path).unwrap()).unwrap();
                    manifest["importer_version"] = json!("old");
                    write_json(Path::new(&result.manifest_path), &manifest).unwrap();
                }
            }
            assert!(
                import_package(&p, temp.path(), &report.fingerprint, None).is_err(),
                "{change}"
            );
        }
    }
    #[test]
    fn guid_meta_mismatch_and_weighted_curves_are_rejected() {
        let temp = tempfile::tempdir().unwrap();
        let p = temp.path().join("p.unitypackage");
        archive(
            &p,
            &[
                (&format!("{GUID}/pathname"), b"Assets/a.txt"),
                (
                    &format!("{GUID}/asset.meta"),
                    b"guid: b1234567890123456789012345678901\n",
                ),
                (&format!("{GUID}/asset"), b"a"),
            ],
        );
        assert!(analyze(&p)
            .unwrap_err()
            .to_string()
            .contains("GUID mismatch"));
        assert!(has_weighted_curve(
            &json!({"curve":{"keys":[{"weightedMode":1}]}})
        ));
        assert!(!has_weighted_curve(&json!({"weightedMode":0})));
    }
    #[test]
    fn archive_links_are_rejected_before_extraction() {
        let temp = tempfile::tempdir().unwrap();
        let p = temp.path().join("links.unitypackage");
        let gzip = GzEncoder::new(fs::File::create(&p).unwrap(), Compression::fast());
        let mut tar = tar::Builder::new(gzip);
        let mut header = tar::Header::new_gnu();
        header.set_entry_type(tar::EntryType::Symlink);
        header.set_size(0);
        header.set_mode(0o777);
        header.set_cksum();
        tar.append_link(&mut header, format!("{GUID}/asset"), "../../escape")
            .unwrap();
        tar.into_inner().unwrap().finish().unwrap();
        assert!(analyze(&p)
            .unwrap_err()
            .to_string()
            .contains("Links and special"));
        assert!(!temp.path().join("escape").exists());
    }
}
