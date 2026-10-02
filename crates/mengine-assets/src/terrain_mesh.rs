// Author: MiYu. Bounded, immutable terrain patches shared by native Scene, Game and Player.
use crate::MeshData;

/// Four by four two-unit tiles, centered at the origin. Each tile supplies its four corner
/// heights (NW, NE, SE, SW) as hexadecimal integers in `terrain4:` followed by 64 digits.
/// Independent corners preserve vertical cliffs; skirts extend to -0.25. No file IO is needed.
/// `terrain4r:` adds two hexadecimal chunk coordinates and a six-by-six corner-height halo
/// for subdivided tops, connected rock faces and shelf/contact material weights in UVs.
pub fn terrain_mesh(key: &str) -> Result<MeshData, &'static str> {
    if let Some(data) = key.strip_prefix("terrain4r:") { return rocky_terrain(data); }
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

// MiYu: a one-tile halo exposes only height discontinuities; world coordinates weld chunk borders.
fn rocky_terrain(data: &str) -> Result<MeshData, &'static str> {
    if data.len()!=146 || !data.bytes().all(|v| v.is_ascii_hexdigit()) { return Err("rock terrain requires chunk coordinates and 144 hexadecimal heights"); }
    let digits:Vec<f32>=data.chars().map(|v| v.to_digit(16).unwrap() as f32).collect();
    if digits[0]>7. || digits[1]>7. { return Err("rock terrain chunk coordinate exceeds eight patches"); }
    let origin=[digits[0]*8.-28.,digits[1]*8.-28.];let heights=&digits[2..];
    let mut mesh=MeshData { positions:Vec::new(),normals:Vec::new(),uvs:Vec::new(),indices:Vec::new() };
    let mut triangle=|p:[[f32;3];3],uv:[[f32;2];3]| {
        let a=glam::Vec3::from_array(p[1])-glam::Vec3::from_array(p[0]);let b=glam::Vec3::from_array(p[2])-glam::Vec3::from_array(p[0]);let cross=a.cross(b);
        if cross.length_squared()<1e-10 { return; }
        let first=mesh.positions.len() as u32;mesh.positions.extend(p);mesh.normals.extend([cross.normalize().to_array();3]);mesh.uvs.extend(uv);mesh.indices.extend([first,first+1,first+2]);
    };
    let point=|x:f32,y:f32,z:f32| { let wx=x+origin[0];let wz=z+origin[1];[x+(wx*1.13+wz*0.71).sin()*0.12,y,z+(wz*1.07-wx*0.83).sin()*0.12] };
    let lerp=|a:f32,b:f32,t:f32| a+(b-a)*t;
    let corner=|vx:usize,vz:usize,height:f32| {
        let touching=[(vz*6+vx,2,[-1.,-1.]),(vz*6+vx+1,3,[1.,-1.]),((vz+1)*6+vx,1,[-1.,1.]),((vz+1)*6+vx+1,0,[1.,1.])];let mut inward=glam::Vec2::ZERO;
        for (cell,index,direction) in touching {if heights[cell*4+index]<height-0.01 {inward-=glam::Vec2::from_array(direction);}}
        let offset=inward.normalize_or_zero()*0.3;let mut p=point(vx as f32*2.-4.,height,vz as f32*2.-4.);p[0]+=offset.x;p[2]+=offset.y;p
    };
    for iz in 0..4 { for ix in 0..4 {
        let cell=(iz+1)*6+ix+1;let h=&heights[cell*4..cell*4+4];
        let corners=[corner(ix,iz,h[0]),corner(ix+1,iz,h[1]),corner(ix+1,iz+1,h[2]),corner(ix,iz+1,h[3])];
        let edges=[(cell-6,0,1,3,2,[0.,-1.]),(cell+1,1,2,0,3,[1.,0.]),(cell+6,2,3,1,0,[0.,1.]),(cell-1,3,0,2,1,[-1.,0.])];
        let top=|u:f32,v:f32| {
            let p=std::array::from_fn(|axis|lerp(lerp(corners[0][axis],corners[1][axis],u),lerp(corners[3][axis],corners[2][axis],u),v));let mut shade:f32=0.;let mut rim:f32=0.;
            for (j,(neighbor,a,b,na,nb,_)) in edges.iter().enumerate() {
                let t=[u,v,1.-u,1.-v][j];let distance=[v,1.-u,1.-v,u][j]*2.;let nh=&heights[neighbor*4..neighbor*4+4];let delta=lerp(nh[*na],nh[*nb],t)-lerp(h[*a],h[*b],t);let weight=(-distance*4.).exp()*0.5;
                shade=shade.max(delta.max(0.)*weight);rim=rim.max((-delta).max(0.)*weight);
            }
            (p,[shade.min(1.),rim.min(1.)])
        };
        for vz in 0..4 { for vx in 0..4 {
            let u=vx as f32/4.;let v=vz as f32/4.;let d=0.25;let p=[top(u,v),top(u,v+d),top(u+d,v+d),top(u+d,v)];
            triangle([p[0].0,p[1].0,p[2].0],[p[0].1,p[1].1,p[2].1]);triangle([p[0].0,p[2].0,p[3].0],[p[0].1,p[2].1,p[3].1]);
        }}
        for (neighbor,a,b,na,nb,outward) in edges {
            let nh=&heights[neighbor*4..neighbor*4+4];if h[a]<=nh[na] && h[b]<=nh[nb] { continue; }
            let vertices=[[ix,iz],[ix+1,iz],[ix+1,iz+1],[ix,iz+1]];let bottom_a=corner(vertices[a][0],vertices[a][1],nh[na]);let bottom_b=corner(vertices[b][0],vertices[b][1],nh[nb]);
            let side=|t:f32,depth:f32| {
                let upper=lerp(h[a],h[b],t);let lower=lerp(nh[na],nh[nb],t).min(upper);let y=lerp(upper,lower,depth);
                let upper_point=std::array::from_fn::<_,3,_>(|axis|lerp(corners[a][axis],corners[b][axis],t));let lower_point=std::array::from_fn::<_,3,_>(|axis|lerp(bottom_a[axis],bottom_b[axis],t));let px=upper_point[0];let pz=upper_point[2];
                let bulge=(std::f32::consts::PI*t).sin()*(std::f32::consts::PI*depth).sin()*(0.12+0.07*((px+origin[0])*2.1+(pz+origin[1])*0.8+y*3.7).sin());
                let mut p=std::array::from_fn::<_,3,_>(|axis|lerp(upper_point[axis],lower_point[axis],depth));p[1]=y;p[0]+=outward[0]*bulge;p[2]+=outward[1]*bulge;(p,[depth,upper-y])
            };
            for along in 0..4 { for band in 0..4 {
                let t=along as f32/4.;let d=band as f32/4.;let p=[side(t,d),side(t+0.25,d),side(t+0.25,d+0.25),side(t,d+0.25)];
                triangle([p[0].0,p[1].0,p[2].0],[p[0].1,p[1].1,p[2].1]);triangle([p[0].0,p[2].0,p[3].0],[p[0].1,p[2].1,p[3].1]);
            }}
        }
    }}
    Ok(mesh)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rocky_tiles_weld_and_emit_only_exposed_cliffs() {
        let flat=terrain_mesh(&format!("terrain4r:00{}","2222".repeat(36))).unwrap();
        assert_eq!(flat.indices.len(),1536);assert!(flat.normals.iter().all(|n|n[1]>0.999));assert!(flat.positions.iter().all(|p|p[1]==2.));
        let next=terrain_mesh(&format!("terrain4r:10{}","2222".repeat(36))).unwrap();
        let edge:Vec<_>=flat.positions.iter().filter(|p|p[0]>3.8).collect();
        for a in edge {assert!(next.positions.iter().any(|b|(a[0]-b[0]-8.).abs()<0.00001&&(a[2]-b[2]).abs()<0.00001));}
        let stripe:String=(0..36).map(|i|if i/6==2||i/6==3 {"2222"} else {"0000"}).collect();
        let left=terrain_mesh(&format!("terrain4r:00{stripe}")).unwrap();let right=terrain_mesh(&format!("terrain4r:10{stripe}")).unwrap();
        for a in left.positions.iter().filter(|p|p[0]>3.8) {assert!(right.positions.iter().any(|b|(a[0]-b[0]-8.).abs()<0.00001&&(a[1]-b[1]).abs()<0.00001&&(a[2]-b[2]).abs()<0.00001),"cliff contours weld across patches");}
        let mut h=vec!['0';144];for i in 0..4 {h[(2*6+2)*4+i]='2';}
        let cliff=terrain_mesh(&format!("terrain4r:00{}",h.into_iter().collect::<String>())).unwrap();
        assert_eq!(cliff.indices.len(),1920);assert!(cliff.normals.iter().any(|n|n[1].abs()<0.2));
        assert!(cliff.positions.iter().zip(&cliff.uvs).any(|(p,uv)|p[1]==0. && uv[0]>0.9),"lower shelf receives contact shade");
        assert!(cliff.positions.iter().zip(&cliff.uvs).any(|(p,uv)|p[1]==2. && uv[1]>0.9),"upper shelf receives exposed rim weight");
        assert!(cliff.uvs.iter().any(|uv|uv[1]>1.5));assert!(cliff.positions.iter().flatten().all(|v|v.is_finite()));
        for key in ["terrain4r:00","terrain4r:80", "terrain4r:gg"] {assert!(terrain_mesh(key).is_err());}
        assert!(terrain_mesh(&format!("terrain4r:80{}","0000".repeat(36))).is_err());
    }
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
