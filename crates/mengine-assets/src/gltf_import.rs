use crate::AssetError;
use std::path::Path;

/// Minimal static mesh extraction from glTF (first mesh / first primitive).
pub struct MeshData {
    pub positions: Vec<[f32; 3]>,
    pub normals: Vec<[f32; 3]>,
    pub uvs: Vec<[f32; 2]>,
    pub indices: Vec<u32>,
}

pub fn load_gltf_mesh_data(path: &Path) -> Result<MeshData, AssetError> {
    let (doc, buffers, _images) =
        gltf::import(path).map_err(|e| AssetError::Gltf(e.to_string()))?;
    let mesh = doc
        .meshes()
        .next()
        .ok_or_else(|| AssetError::Gltf("no meshes".into()))?;
    let prim = mesh
        .primitives()
        .next()
        .ok_or_else(|| AssetError::Gltf("no primitives".into()))?;

    let reader = prim.reader(|buf| Some(&buffers[buf.index()]));
    let positions: Vec<[f32; 3]> = reader
        .read_positions()
        .ok_or_else(|| AssetError::Gltf("no positions".into()))?
        .collect();
    let normals: Vec<[f32; 3]> = reader
        .read_normals()
        .map(|n| n.collect())
        .unwrap_or_else(|| positions.iter().map(|_| [0.0, 1.0, 0.0]).collect());
    let uvs: Vec<[f32; 2]> = reader
        .read_tex_coords(0)
        .map(|t| t.into_f32().collect())
        .unwrap_or_else(|| positions.iter().map(|_| [0.0, 0.0]).collect());
    let indices: Vec<u32> = reader
        .read_indices()
        .map(|i| i.into_u32().collect())
        .unwrap_or_else(|| (0..positions.len() as u32).collect());

    Ok(MeshData {
        positions,
        normals,
        uvs,
        indices,
    })
}
