// Author: MiYu. Query the same authored triangles used by rendering for picking and ground height.
use crate::MeshData;
use glam::DVec3;

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshSurfaceHit {
    pub position: [f32; 3],
    pub normal: [f32; 3],
    pub uv: Option<[f32; 2]>,
    pub barycentric: [f32; 3],
    pub triangle: usize,
    pub distance: f32,
}

/// Two-sided triangle intersection. Distance is measured in mesh units regardless of direction length.
pub fn raycast_mesh(mesh: &MeshData, origin: [f32; 3], direction: [f32; 3], max_distance: f32) -> Result<Option<MeshSurfaceHit>, String> {
    if !origin.iter().chain(&direction).all(|v| v.is_finite()) || !max_distance.is_finite() || max_distance < 0. { return Err("invalid mesh ray".into()); }
    if mesh.indices.len() % 3 != 0 || mesh.indices.iter().any(|i| *i as usize >= mesh.positions.len()) || mesh.positions.iter().flatten().any(|v| !v.is_finite()) { return Err("invalid mesh triangle geometry".into()); }
    let origin=DVec3::from_array(origin.map(f64::from));
    let direction=DVec3::from_array(direction.map(f64::from));
    if direction.length_squared() == 0. { return Err("mesh ray direction is zero".into()); }
    let direction=direction.normalize();
    let mut nearest=max_distance as f64;
    let mut result=None;
    for (triangle, indices) in mesh.indices.chunks_exact(3).enumerate() {
        let [a,b,c]=std::array::from_fn(|k| DVec3::from_array(mesh.positions[indices[k] as usize].map(f64::from)));
        let edge1=b-a;let edge2=c-a;let p=direction.cross(edge2);let det=edge1.dot(p);
        if det.abs() <= 1e-10 * edge1.length() * edge2.length() { continue; }
        let delta=origin-a;let u=delta.dot(p)/det;let q=delta.cross(edge1);let v=direction.dot(q)/det;
        if u < -1e-8 || v < -1e-8 || u+v > 1.+1e-8 { continue; }
        let distance=edge2.dot(q)/det;
        if distance < -1e-8 || distance > nearest || result.is_some() && distance == nearest { continue; }
        nearest=distance.max(0.);
        let weights=[1.-u-v,u,v];
        let uv=if mesh.uvs.len() == mesh.positions.len() { Some(std::array::from_fn(|axis| (0..3).map(|k| mesh.uvs[indices[k] as usize][axis] as f64 * weights[k]).sum::<f64>() as f32)) } else { None };
        result=Some(MeshSurfaceHit { position:(origin+direction*nearest).as_vec3().to_array(), normal:edge1.cross(edge2).normalize().as_vec3().to_array(), uv, barycentric:weights.map(|v| v as f32), triangle, distance:nearest as f32 });
    }
    Ok(result)
}

/// Highest triangle intersected by a vertical ray; vertical walls and uncovered gaps yield no surface.
pub fn mesh_height_at(mesh: &MeshData, x: f32, z: f32) -> Result<Option<MeshSurfaceHit>, String> {
    if !x.is_finite() || !z.is_finite() { return Err("invalid mesh height coordinates".into()); }
    if mesh.positions.is_empty() { return raycast_mesh(mesh,[x,0.,z],[0.,-1.,0.],0.); }
    let min=mesh.positions.iter().map(|p|p[1]).fold(f32::INFINITY,f32::min);
    let max=mesh.positions.iter().map(|p|p[1]).fold(f32::NEG_INFINITY,f32::max);
    let margin=(max-min).max(1.);let start=max+margin;let distance=start-min+margin;
    raycast_mesh(mesh,[x,start,z],[0.,-1.,0.],distance)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> MeshData {
        MeshData { positions:vec![[0.,0.,0.],[0.,0.,2.],[2.,2.,0.],[0.,4.,0.],[0.,4.,2.],[2.,4.,0.]], normals:vec![], uvs:vec![[0.,0.],[0.,1.],[1.,0.],[0.,0.],[0.,1.],[1.,0.]], indices:vec![0,1,2,3,4,5] }
    }
    #[test]
    fn height_uses_highest_authored_surface_and_preserves_holes() {
        let mesh=fixture();let hit=mesh_height_at(&mesh,0.5,0.5).unwrap().unwrap();
        assert_eq!(hit.position,[0.5,4.,0.5]);assert_eq!(hit.normal,[0.,1.,0.]);assert_eq!(hit.triangle,1);
        assert_eq!(hit.uv,Some([0.25,0.25]));assert_eq!(hit.barycentric,[0.5,0.25,0.25]);
        assert!(mesh_height_at(&mesh,1.5,1.5).unwrap().is_none());
    }
    #[test]
    fn rays_are_two_sided_normalized_and_bounded() {
        let mesh=fixture();let hit=raycast_mesh(&mesh,[0.5,-1.,0.5],[0.,100.,0.],2.).unwrap().unwrap();
        assert_eq!(hit.position,[0.5,0.5,0.5]);assert_eq!(hit.distance,1.5);assert_eq!(hit.triangle,0);
        assert!(raycast_mesh(&mesh,[0.5,-1.,0.5],[0.,1.,0.],1.).unwrap().is_none());
        assert!(raycast_mesh(&mesh,[0.5,-1.,0.5],[0.,-1.,0.],20.).unwrap().is_none());
        assert!(raycast_mesh(&mesh,[0.5,0.5,0.5],[0.,1.,0.],0.).unwrap().is_some());
    }
    #[test]
    fn vertical_walls_are_pickable_but_not_ground() {
        let mesh=MeshData { positions:vec![[0.,0.,0.],[0.,2.,0.],[0.,0.,2.]], normals:vec![], uvs:vec![], indices:vec![0,1,2] };
        assert!(mesh_height_at(&mesh,0.,0.5).unwrap().is_none());
        let hit=raycast_mesh(&mesh,[-1.,0.5,0.5],[1.,0.,0.],2.).unwrap().unwrap();
        assert_eq!(hit.position,[0.,0.5,0.5]);assert_eq!(hit.distance,1.);assert_eq!(hit.uv,None);
    }
    #[test]
    fn malformed_geometry_and_nonfinite_queries_are_rejected() {
        let mut mesh=fixture();mesh.indices.push(0);assert!(mesh_height_at(&mesh,0.,0.).is_err());
        let mut mesh=fixture();mesh.indices[0]=99;assert!(mesh_height_at(&mesh,0.,0.).is_err());
        let mut mesh=fixture();mesh.positions[0][0]=f32::NAN;assert!(mesh_height_at(&mesh,0.,0.).is_err());
        let mesh=fixture();assert!(raycast_mesh(&mesh,[0.;3],[0.;3],1.).is_err());
        assert!(raycast_mesh(&mesh,[0.;3],[0.,1.,0.],-1.).is_err());assert!(mesh_height_at(&mesh,f32::INFINITY,0.).is_err());
    }
}
