use crate::AssetError;
use std::path::Path;

/// Static geometry extracted from the first glTF mesh. All triangle primitives are combined so a
/// MeshRenderer can draw common multi-primitive exports with one MEngine material override.
#[derive(Clone, Debug, PartialEq)]
pub struct MeshData {
    pub positions: Vec<[f32; 3]>,
    pub normals: Vec<[f32; 3]>,
    pub uvs: Vec<[f32; 2]>,
    pub indices: Vec<u32>,
}

pub fn load_gltf_mesh_data(path: &Path) -> Result<MeshData, AssetError> {
    let (document, buffers, _images) =
        gltf::import(path).map_err(|error| AssetError::Gltf(error.to_string()))?;
    let mesh = document
        .meshes()
        .next()
        .ok_or_else(|| AssetError::Gltf("no meshes".into()))?;
    let mut output = MeshData {
        positions: Vec::new(),
        normals: Vec::new(),
        uvs: Vec::new(),
        indices: Vec::new(),
    };

    for primitive in mesh.primitives() {
        if primitive.mode() != gltf::mesh::Mode::Triangles {
            return Err(AssetError::Gltf(format!(
                "mesh primitive {} uses unsupported {:?} topology",
                primitive.index(),
                primitive.mode()
            )));
        }
        let reader = primitive.reader(|buffer| Some(&buffers[buffer.index()]));
        let positions = reader
            .read_positions()
            .ok_or_else(|| AssetError::Gltf("mesh primitive has no positions".into()))?
            .collect::<Vec<_>>();
        if positions.is_empty() {
            continue;
        }
        if positions
            .iter()
            .flatten()
            .any(|component| !component.is_finite())
        {
            return Err(AssetError::Gltf(
                "mesh primitive contains a non-finite position".into(),
            ));
        }
        let local_indices = reader
            .read_indices()
            .map(|indices| indices.into_u32().collect::<Vec<_>>())
            .unwrap_or_else(|| (0..positions.len() as u32).collect());
        if local_indices.len() % 3 != 0 {
            return Err(AssetError::Gltf(
                "triangle primitive index count is not divisible by three".into(),
            ));
        }
        if local_indices
            .iter()
            .any(|index| *index as usize >= positions.len())
        {
            return Err(AssetError::Gltf(
                "mesh primitive index is outside its vertex buffer".into(),
            ));
        }
        let normals = reader
            .read_normals()
            .map(|normals| normals.collect::<Vec<_>>())
            .filter(|normals| normals.len() == positions.len())
            .unwrap_or_else(|| generated_normals(&positions, &local_indices));
        let uvs = reader
            .read_tex_coords(0)
            .map(|coords| coords.into_f32().collect::<Vec<_>>())
            .filter(|coords| coords.len() == positions.len())
            .unwrap_or_else(|| vec![[0.0, 0.0]; positions.len()]);
        let base = output.positions.len() as u32;
        output.positions.extend(positions);
        output.normals.extend(normals);
        output.uvs.extend(uvs);
        output
            .indices
            .extend(local_indices.into_iter().map(|index| base + index));
    }

    if output.positions.is_empty() || output.indices.is_empty() {
        return Err(AssetError::Gltf(
            "first mesh has no triangle geometry".into(),
        ));
    }
    Ok(output)
}

fn generated_normals(positions: &[[f32; 3]], indices: &[u32]) -> Vec<[f32; 3]> {
    let mut normals = vec![[0.0_f32; 3]; positions.len()];
    for triangle in indices.chunks_exact(3) {
        let a = positions[triangle[0] as usize];
        let b = positions[triangle[1] as usize];
        let c = positions[triangle[2] as usize];
        let ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        let ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        let face = [
            ab[1] * ac[2] - ab[2] * ac[1],
            ab[2] * ac[0] - ab[0] * ac[2],
            ab[0] * ac[1] - ab[1] * ac[0],
        ];
        for index in triangle {
            let normal = &mut normals[*index as usize];
            normal[0] += face[0];
            normal[1] += face[1];
            normal[2] += face[2];
        }
    }
    for normal in &mut normals {
        let length = (normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]).sqrt();
        if length > 0.000001 {
            normal[0] /= length;
            normal[1] /= length;
            normal[2] /= length;
        } else {
            *normal = [0.0, 1.0, 0.0];
        }
    }
    normals
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn combines_triangle_primitives_and_generates_missing_normals() {
        let root = std::env::temp_dir().join(format!("mengine-gltf-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let mut buffer = Vec::new();
        for value in [0.0_f32, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0] {
            buffer.extend_from_slice(&value.to_le_bytes());
        }
        for index in [0_u16, 1, 2] {
            buffer.extend_from_slice(&index.to_le_bytes());
        }
        std::fs::write(root.join("triangle.bin"), buffer).unwrap();
        std::fs::write(
            root.join("triangle.gltf"),
            r#"{
              "asset":{"version":"2.0"},
              "buffers":[{"uri":"triangle.bin","byteLength":42}],
              "bufferViews":[
                {"buffer":0,"byteOffset":0,"byteLength":36,"target":34962},
                {"buffer":0,"byteOffset":36,"byteLength":6,"target":34963}
              ],
              "accessors":[
                {"bufferView":0,"componentType":5126,"count":3,"type":"VEC3","min":[0,0,0],"max":[1,1,0]},
                {"bufferView":1,"componentType":5123,"count":3,"type":"SCALAR"}
              ],
              "meshes":[{"primitives":[
                {"attributes":{"POSITION":0},"indices":1},
                {"attributes":{"POSITION":0},"indices":1}
              ]}]
            }"#,
        )
        .unwrap();

        let mesh = load_gltf_mesh_data(&root.join("triangle.gltf")).unwrap();
        assert_eq!(mesh.positions.len(), 6);
        assert_eq!(mesh.indices, [0, 1, 2, 3, 4, 5]);
        assert!(mesh
            .normals
            .iter()
            .all(|normal| normal[2] > 0.999 && normal[0].abs() < 0.001));
        std::fs::remove_dir_all(root).unwrap();
    }
}
