// Author: MiYu. Bounded, immutable terrain patches shared by native Scene, Game and Player.
use crate::MeshData;

/// Four by four two-unit tiles, centered at the origin. Each tile supplies its four corner
/// heights (NW, NE, SE, SW) as hexadecimal integers in `terrain4:` followed by 64 digits.
/// Independent corners preserve vertical cliffs; skirts extend to -0.25. No file IO is needed.
pub fn terrain_mesh(key: &str) -> Result<MeshData, &'static str> {
    let data = key.strip_prefix("terrain4:").ok_or("invalid terrain prefix")?;
    if data.len() != 64 || !data.bytes().all(|v| v.is_ascii_hexdigit()) { return Err("terrain patch requires 64 hexadecimal heights"); }
    let heights: Vec<f32> = data.chars().map(|v| v.to_digit(16).unwrap() as f32).collect();
    let mut mesh = MeshData { positions: Vec::new(), normals: Vec::new(), uvs: Vec::new(), indices: Vec::new() };
    let mut quad = |points: [[f32; 3]; 4]| {
        let a = std::array::from_fn::<_,3,_>(|i| points[1][i] - points[0][i]);
        let b = std::array::from_fn::<_,3,_>(|i| points[2][i] - points[0][i]);
        let cross = [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
        let length = cross.iter().map(|v| v*v).sum::<f32>().sqrt().max(0.0001);
        let normal = cross.map(|v| v/length);
        let first = mesh.positions.len() as u32;
        mesh.positions.extend(points);mesh.normals.extend([normal;4]);mesh.uvs.extend([[0.,0.],[0.,1.],[1.,1.],[1.,0.]]);
        mesh.indices.extend([first,first+1,first+2,first,first+2,first+3]);
    };
    for i in 0..16 {
        let x = (i%4) as f32*2.-4.;let z = (i/4) as f32*2.-4.;let h = &heights[i*4..i*4+4];
        let p = [[x,h[0],z],[x+2.,h[1],z],[x+2.,h[2],z+2.],[x,h[3],z+2.]];
        quad([p[0],p[3],p[2],p[1]]);
        for j in 0..4 {let a=p[j];let b=p[(j+1)%4];quad([a,b,[b[0],-0.25,b[2]],[a[0],-0.25,a[2]]]);}
    }
    Ok(mesh)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bounded_patch_has_upward_tops_and_outward_cliffs() {
        let mesh=terrain_mesh(&format!("terrain4:{}", "0220".repeat(16))).unwrap();
        assert_eq!(mesh.positions.len(),320);assert_eq!(mesh.indices.len(),480);
        assert!(mesh.normals[0][1]>0.7);assert!(mesh.normals[0][0]< -0.7);
        assert_eq!(mesh.normals[4],[0.,0.,-1.]);
        assert_eq!(mesh.positions[0],[-4.,0.,-4.]);assert_eq!(mesh.positions[2],[-2.,2.,-2.]);
        for key in ["terrain4:","terrain4:NaN","terrain4:0000"] {assert!(terrain_mesh(key).is_err());}
        assert!(terrain_mesh(&format!("terrain4:{}", "g".repeat(64))).is_err());
        assert!(terrain_mesh(&format!("terrain4:{}", "0".repeat(65))).is_err());
    }
}
