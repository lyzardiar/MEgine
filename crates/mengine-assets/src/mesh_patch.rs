// Author: MiYu. Compose authored static meshes into grid patches without changing geometry or UVs.
use crate::MeshData;
use serde::Deserialize;
use std::path::Path;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshPatchSource {
    schema_version: u32,
    columns: usize,
    rows: usize,
    cell_size: [f32; 2],
    scale: f32,
    height_step: f32,
    origin: [f32; 2],
    template_offset: [f32; 3],
    templates: Vec<MeshData>,
}

/// Each cell contains three hex template digits (fff skips it) and a signed height byte biased by 128.
pub fn parse_mesh_patch_key(key: &str) -> Option<(&str, &str)> {
    let (path, cells) = key.strip_prefix("meshpatch:")?.split_once('#')?;
    if path.is_empty() || !path.to_ascii_lowercase().ends_with(".mpatch") || cells.is_empty() || !cells.is_ascii() || !cells.bytes().all(|b| b.is_ascii_hexdigit()) { return None; }
    Some((path, cells))
}

impl MeshPatchSource {
    pub fn load(path: &Path) -> Result<Self, String> {
        let size = std::fs::metadata(path).map_err(|e| e.to_string())?.len();
        if size > 64 * 1024 * 1024 { return Err("mesh patch source exceeds 64 MiB".into()); }
        let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
        Self::parse(&text)
    }

    pub fn parse(text: &str) -> Result<Self, String> {
        let source: Self = serde_json::from_str(text).map_err(|e| e.to_string())?;
        if source.schema_version != 1 || !(1..=32).contains(&source.columns) || !(1..=32).contains(&source.rows) || source.templates.is_empty() || source.templates.len() > 4095 { return Err("invalid mesh patch dimensions or schema".into()); }
        if !source.cell_size.iter().chain([&source.scale, &source.height_step]).all(|v| v.is_finite() && *v > 0.) || !source.origin.iter().chain(&source.template_offset).all(|v| v.is_finite()) { return Err("invalid mesh patch spacing or transform".into()); }
        let mut total = 0;
        for mesh in &source.templates {
            total += mesh.positions.len();
            if mesh.positions.is_empty() || total > 1_000_000 || mesh.normals.len() != mesh.positions.len() || mesh.uvs.len() != mesh.positions.len() || mesh.indices.is_empty() || mesh.indices.len() % 3 != 0 || mesh.indices.len() > 6_000_000 || mesh.indices.iter().any(|i| *i as usize >= mesh.positions.len()) { return Err("invalid mesh patch template channels or indices".into()); }
            if !mesh.positions.iter().flatten().chain(mesh.normals.iter().flatten()).chain(mesh.uvs.iter().flatten()).all(|v| v.is_finite()) || mesh.normals.iter().any(|n| (glam::Vec3::from_array(*n).length() - 1.).abs() > 0.001) { return Err("invalid mesh patch template values or normals".into()); }
        }
        Ok(source)
    }

    pub fn compose(&self, cells: &str) -> Result<MeshData, String> {
        if cells.len() != self.columns * self.rows * 5 || !cells.is_ascii() || !cells.bytes().all(|b| b.is_ascii_hexdigit()) { return Err("invalid mesh patch cell encoding".into()); }
        let mut output = MeshData { positions: Vec::new(), normals: Vec::new(), uvs: Vec::new(), indices: Vec::new() };
        for (i, cell) in cells.as_bytes().chunks_exact(5).enumerate() {
            let text = std::str::from_utf8(cell).unwrap();
            let id = usize::from_str_radix(&text[..3], 16).unwrap();
            if id == 4095 { continue; }
            let mesh = self.templates.get(id).ok_or("mesh patch template is missing")?;
            if output.positions.len() + mesh.positions.len() > 2_000_000 || output.indices.len() + mesh.indices.len() > 12_000_000 { return Err("mesh patch output exceeds geometry limit".into()); }
            let base = output.positions.len() as u32;
            let height = (i32::from_str_radix(&text[3..], 16).unwrap() - 128) as f32 * self.height_step;
            let offset = [self.origin[0] + (i % self.columns) as f32 * self.cell_size[0] + self.template_offset[0], height + self.template_offset[1], self.origin[1] + (i / self.columns) as f32 * self.cell_size[1] + self.template_offset[2]];
            output.positions.extend(mesh.positions.iter().map(|p| std::array::from_fn(|k| p[k] * self.scale + offset[k])));
            if output.positions[base as usize..].iter().flatten().any(|v| !v.is_finite()) { return Err("mesh patch transformed positions overflow".into()); }
            output.normals.extend_from_slice(&mesh.normals);
            output.uvs.extend_from_slice(&mesh.uvs);
            output.indices.extend(mesh.indices.iter().map(|n| n + base));
        }
        Ok(output)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> serde_json::Value {
        serde_json::json!({"schemaVersion":1,"columns":2,"rows":1,"cellSize":[2.,2.],"scale":2.,"heightStep":0.5,"origin":[-2.,0.],"templateOffset":[2.,0.,2.],"templates":[{"positions":[[-1.,0.,-1.],[0.,1.,-1.],[0.,0.,0.]],"normals":[[0.,1.,0.],[0.,1.,0.],[0.,1.,0.]],"uvs":[[0.,0.],[1.,0.],[1.,1.]],"indices":[0,1,2]}]})
    }
    #[test]
    fn patches_preserve_source_channels_and_rebase_indices() {
        let source = MeshPatchSource::parse(&fixture().to_string()).unwrap();
        let mesh = source.compose("000800007c").unwrap();
        assert_eq!(mesh.positions, vec![[-2.,0.,0.],[0.,2.,0.],[0.,0.,2.],[0.,-2.,0.],[2.,0.,0.],[2.,-2.,2.]]);
        assert_eq!(mesh.indices, vec![0,1,2,3,4,5]);
        assert_eq!(&mesh.normals[..3], &mesh.normals[3..]);
        assert_eq!(&mesh.uvs[..3], &mesh.uvs[3..]);
        assert_eq!(source.compose("fff8000080").unwrap().positions.len(), 3);
        assert!(source.compose("fff80fff80").unwrap().indices.is_empty());
    }
    #[test]
    fn invalid_geometry_and_cell_references_are_rejected() {
        for (field, value) in [("columns", serde_json::json!(0)), ("scale", serde_json::json!(-1)), ("schemaVersion", serde_json::json!(2))] { let mut f=fixture(); f[field]=value; assert!(MeshPatchSource::parse(&f.to_string()).is_err()); }
        let mut f=fixture(); f["templates"][0]["indices"]=serde_json::json!([0,1,9]); assert!(MeshPatchSource::parse(&f.to_string()).is_err());
        let mut f=fixture(); f["templates"][0]["normals"][0]=serde_json::json!([0.,2.,0.]); assert!(MeshPatchSource::parse(&f.to_string()).is_err());
        let s=MeshPatchSource::parse(&fixture().to_string()).unwrap();
        for key in ["00080", "0018000080", "000é00080", "0008x00080"] { assert!(s.compose(key).is_err(), "{key}"); }
        assert_eq!(parse_mesh_patch_key("meshpatch:Assets/a.mpatch#00080"), Some(("Assets/a.mpatch", "00080")));
        assert_eq!(parse_mesh_patch_key("meshpatch:Assets/a.MPATCH#00080"), Some(("Assets/a.MPATCH", "00080")));
        for key in ["meshpatch:Assets/a.glb#00080", "meshpatch:#00080", "meshpatch:a.mpatch#é", "meshpatch:a.mpatch#xyz"] { assert!(parse_mesh_patch_key(key).is_none()); }
        let mut f=fixture(); f["scale"]=serde_json::json!(3.0e38); f["templates"][0]["positions"][0][0]=serde_json::json!(2.); assert!(MeshPatchSource::parse(&f.to_string()).unwrap().compose("0008000080").is_err());
    }
}
