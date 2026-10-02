// Author: MiYu. Bounded, immutable terrain patches shared by native Scene, Game and Player.
use crate::MeshData;

/// Four by four two-unit tiles, centered at the origin. Each tile supplies its four corner
/// heights (NW, NE, SE, SW) as hexadecimal integers in `terrain4:` followed by 64 digits.
/// Independent corners preserve vertical cliffs; skirts extend to -0.25. No file IO is needed.
/// `terrain4r:` adds two hexadecimal chunk coordinates and a six-by-six corner-height halo
/// for subdivided tops, connected rock faces and shelf/contact material weights in UVs.
/// `terrain4h:` adds a seven-by-seven signed relief field encoded as 128 + height * 16.
/// An optional final 0/1/2 selects rock, faceted ice or coursed masonry cliff geometry.
pub fn terrain_mesh(key: &str) -> Result<MeshData, &'static str> {
    if let Some(data) = key.strip_prefix("terrain4h:") { return rocky_terrain(data,true); }
    if let Some(data) = key.strip_prefix("terrain4r:") { return rocky_terrain(data,false); }
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
fn rocky_terrain(data: &str,sculpted:bool) -> Result<MeshData, &'static str> {
    let style=if sculpted&&data.len()==245 {let digit=data.as_bytes()[244];if !(b'0'..=b'2').contains(&digit) {return Err("invalid cliff geometry style");}digit-b'0'}else{0};
    let data=if sculpted&&data.len()==245 {&data[..244]}else{data};
    if data.len()!=(if sculpted {244} else {146}) || !data.bytes().all(|v| v.is_ascii_hexdigit()) { return Err("invalid rock terrain height payload"); }
    let digits:Vec<f32>=data[..146].chars().map(|v| v.to_digit(16).unwrap() as f32).collect();
    if digits[0]>7. || digits[1]>7. { return Err("rock terrain chunk coordinate exceeds eight patches"); }
    let origin=[digits[0]*8.-28.,digits[1]*8.-28.];let heights=&digits[2..];
    let mut relief=[0.;49];if sculpted {for (i,value) in relief.iter_mut().enumerate() {*value=(u8::from_str_radix(&data[146+i*2..148+i*2],16).unwrap() as f32-128.)/16.;if value.abs()>1. {return Err("sculpted relief exceeds one world unit");}}}
    let relief_height=|x:f32,z:f32| {
        let u=((x+6.)/2.).clamp(0.,6.);let v=((z+6.)/2.).clamp(0.,6.);let ix=(u.floor() as usize).min(5);let iz=(v.floor() as usize).min(5);let fx=u-ix as f32;let fz=v-iz as f32;let i=iz*7+ix;
        (relief[i]*(1.-fx)+relief[i+1]*fx)*(1.-fz)+(relief[i+7]*(1.-fx)+relief[i+8]*fx)*fz
    };
    let mut mesh=MeshData { positions:Vec::new(),normals:Vec::new(),uvs:Vec::new(),indices:Vec::new() };
    let mut triangle=|mut p:[[f32;3];3],uv:[[f32;2];3],top:bool| {
        let base=(glam::Vec3::from_array(p[1])-glam::Vec3::from_array(p[0])).cross(glam::Vec3::from_array(p[2])-glam::Vec3::from_array(p[0])).normalize_or_zero();
        for vertex in &mut p {vertex[1]+=relief_height(vertex[0],vertex[2]);}
        let a=glam::Vec3::from_array(p[1])-glam::Vec3::from_array(p[0]);let b=glam::Vec3::from_array(p[2])-glam::Vec3::from_array(p[0]);let cross=a.cross(b);
        if cross.length_squared()<1e-10 { return; }
        debug_assert!(!top||cross.y>0.,"terrain top winding");
        let normals=p.map(|v|if top&&sculpted&&base.y>0.01 {let dx=(relief_height(v[0]+0.25,v[2])-relief_height(v[0]-0.25,v[2]))*2.;let dz=(relief_height(v[0],v[2]+0.25)-relief_height(v[0],v[2]-0.25))*2.;glam::Vec3::new(base.x/base.y-dx,1.,base.z/base.y-dz).normalize().to_array()}else{cross.normalize().to_array()});
        let first=mesh.positions.len() as u32;mesh.positions.extend(p);mesh.normals.extend(normals);mesh.uvs.extend(uv);mesh.indices.extend([first,first+1,first+2]);
    };
    let point=|x:f32,y:f32,z:f32| { let wx=x+origin[0];let wz=z+origin[1];[x+(wx*1.13+wz*0.71).sin()*0.12,y,z+(wz*1.07-wx*0.83).sin()*0.12] };
    let lerp=|a:f32,b:f32,t:f32| a+(b-a)*t;
    let corner=|vx:usize,vz:usize,height:f32| {
        let touching=[(vz*6+vx,2,[-1.,-1.]),(vz*6+vx+1,3,[1.,-1.]),((vz+1)*6+vx,1,[-1.,1.]),((vz+1)*6+vx+1,0,[1.,1.])];let mut inward=glam::Vec2::ZERO;let mut high=[false;4];
        for (i,(cell,index,direction)) in touching.iter().enumerate() {high[i]=heights[cell*4+index]>=height-0.01;if !high[i] {inward-=glam::Vec2::from_array(*direction);}}
        let offset=inward.normalize_or_zero()*0.3;let mut p=point(vx as f32*2.-4.,height,vz as f32*2.-4.);p[0]+=offset.x;p[2]+=offset.y;
        let mut rays=[glam::Vec2::ZERO;2];let mut count=0;for (a,b,ray) in [(0,1,[0.,-1.]),(1,3,[1.,0.]),(3,2,[0.,1.]),(2,0,[-1.,0.])] {if high[a]!=high[b] {if count<2 {rays[count]=glam::Vec2::from_array(ray);}count+=1;}}
        if count!=2 || rays[0].dot(rays[1]).abs()>0.01 {rays=[glam::Vec2::ZERO;2];}(p,rays)
    };
    let crossing=|a:[usize;2],b:[usize;2]| {
        let (first,last)=if a[1]==b[1] {let cell=a[1]*6+a[0].min(b[0])+1;let d=[heights[cell*4+3]-heights[(cell+6)*4],heights[cell*4+2]-heights[(cell+6)*4+1]];if a[0]<b[0] {(d[0],d[1])}else{(d[1],d[0])}}else{let cell=(a[1].min(b[1])+1)*6+a[0];let d=[heights[cell*4+1]-heights[(cell+1)*4],heights[cell*4+2]-heights[(cell+1)*4+3]];if a[1]<b[1] {(d[0],d[1])}else{(d[1],d[0])}};
        if first*last<0. {Some(first/(first-last))}else{None}
    };
    // MiYu: each height layer shares one curved corner; all touching tops and cliff walls use its boundary.
    let joint=|vx:usize,vz:usize,height:f32| {let (mut p,rays)=corner(vx,vz,height);let offset=(rays[0]+rays[1])*0.2;p[0]+=offset.x;p[2]+=offset.y;p};
    let boundary=|a:[usize;2],ha:f32,b:[usize;2],hb:f32,t:f32| {
        let direction=glam::Vec2::new(b[0] as f32-a[0] as f32,b[1] as f32-a[1] as f32);
        let round=|rays:[glam::Vec2;2],ray:glam::Vec2,f:f32| {let sum=rays[0]+rays[1];if rays.iter().any(|r|r.dot(ray)>0.99) {if f>=0.4 {glam::Vec2::ZERO}else{let q=0.5+f/0.8;((sum-ray)*(1.-q).powi(2)+ray*q*q)*0.8-ray*f*2.}}else{sum*0.2*(1.-f)}};
        let sample=|v:[usize;2],height:f32,ray:glam::Vec2,f:f32| {let i=v[1]*6+v[0];let levels=[heights[i*4+2],heights[(i+1)*4+3],heights[(i+6)*4+1],heights[(i+7)*4]];let lo=levels.iter().copied().filter(|h|*h<=height).fold(f32::NEG_INFINITY,f32::max);let hi=levels.iter().copied().filter(|h|*h>=height).fold(f32::INFINITY,f32::min);let lo=if lo.is_finite() {lo}else{height};let hi=if hi.is_finite() {hi}else{height};let (pa,ra)=corner(v[0],v[1],lo);if hi-lo<0.001 {(pa,round(ra,ray,f))}else{let (pb,rb)=corner(v[0],v[1],hi);let blend=(height-lo)/(hi-lo);(std::array::from_fn::<_,3,_>(|axis|lerp(pa[axis],pb[axis],blend)),round(ra,ray,f).lerp(round(rb,ray,f),blend))}};
        let (pa,oa)=sample(a,ha,direction,t);let (pb,ob)=sample(b,hb,-direction,1.-t);let offset=oa+ob;let mut p=std::array::from_fn::<_,3,_>(|i|lerp(pa[i],pb[i],t));p[0]+=offset.x;p[2]+=offset.y;
        if let Some(cut)=crossing(a,b) {let factor=if t<cut {(cut-t)/cut}else{(t-cut)/(1.-cut)};let raw_a=point(a[0] as f32*2.-4.,ha,a[1] as f32*2.-4.);let raw_b=point(b[0] as f32*2.-4.,hb,b[1] as f32*2.-4.);for axis in [0,2] {let raw=lerp(raw_a[axis],raw_b[axis],t);p[axis]=lerp(raw,p[axis],factor);}}p
    };
    for iz in 0..4 { for ix in 0..4 {
        let cell=(iz+1)*6+ix+1;let h=&heights[cell*4..cell*4+4];
        let corners=[joint(ix,iz,h[0]),joint(ix+1,iz,h[1]),joint(ix+1,iz+1,h[2]),joint(ix,iz+1,h[3])];
        let edges=[(cell-6,0,1,3,2,[0.,-1.]),(cell+1,1,2,0,3,[1.,0.]),(cell+6,2,3,1,0,[0.,1.]),(cell-1,3,0,2,1,[-1.,0.])];
        let top=|u:f32,v:f32| {
            let north=boundary([ix,iz],h[0],[ix+1,iz],h[1],u);let south=boundary([ix,iz+1],h[3],[ix+1,iz+1],h[2],u);let west=boundary([ix,iz],h[0],[ix,iz+1],h[3],v);let east=boundary([ix+1,iz],h[1],[ix+1,iz+1],h[2],v);
            let p=std::array::from_fn(|axis|lerp(north[axis],south[axis],v)+lerp(west[axis],east[axis],u)-lerp(lerp(corners[0][axis],corners[1][axis],u),lerp(corners[3][axis],corners[2][axis],u),v));let mut shade:f32=0.;let mut rim:f32=0.;
            for (j,(neighbor,a,b,na,nb,_)) in edges.iter().enumerate() {
                let t=[u,v,1.-u,1.-v][j];let distance=[v,1.-u,1.-v,u][j]*2.;let nh=&heights[neighbor*4..neighbor*4+4];let delta=lerp(nh[*na],nh[*nb],t)-lerp(h[*a],h[*b],t);let weight=(-distance*4.).exp()*0.5;
                shade=shade.max(delta.max(0.)*weight);rim=rim.max((-delta).max(0.)*weight);
            }
            (p,[shade.min(1.),rim.min(1.)])
        };
        let vertices=[[ix,iz],[ix+1,iz],[ix+1,iz+1],[ix,iz+1]];
        // MiYu: concentric surface rings share the cliff outline and keep all top triangles upward.
        let center=top(0.5,0.5);let mut outline=Vec::new();let mut inner=Vec::new();
        for (a,b) in [(0,3),(3,2),(2,1),(1,0)] {
            let cut=crossing(vertices[a],vertices[b]);let mut steps=vec![0.,0.25,0.5,0.75];if let Some(t)=cut {if t>1e-6&&t<1.-1e-6&&!steps.iter().any(|v:&f32|(*v-t).abs()<1e-6) {steps.push(t);}}steps.sort_by(f32::total_cmp);
            for t in steps {let u=lerp(vertices[a][0] as f32,vertices[b][0] as f32,t);let v=lerp(vertices[a][1] as f32,vertices[b][1] as f32,t);let outer=top(u-ix as f32,v-iz as f32);let p=std::array::from_fn(|axis|lerp(center.0[axis],outer.0[axis],0.5));let uv=top((u-ix as f32+0.5)*0.5,(v-iz as f32+0.5)*0.5).1;outline.push(outer);inner.push((p,uv));}
        }
        for i in 0..outline.len() {let j=(i+1)%outline.len();triangle([center.0,inner[i].0,inner[j].0],[center.1,inner[i].1,inner[j].1],true);triangle([inner[i].0,outline[i].0,outline[j].0],[inner[i].1,outline[i].1,outline[j].1],true);triangle([inner[i].0,outline[j].0,inner[j].0],[inner[i].1,outline[j].1,inner[j].1],true);}
        for (neighbor,a,b,na,nb,outward) in edges {
            let nh=&heights[neighbor*4..neighbor*4+4];if h[a]<=nh[na] && h[b]<=nh[nb] { continue; }
            let da=h[a]-nh[na];let db=h[b]-nh[nb];let first=if da<=0. {da/(da-db)}else{0.};let last=if db<=0. {da/(da-db)}else{1.};
            let side=|t:f32,depth:f32| {
                let upper=lerp(h[a],h[b],t);let lower=lerp(nh[na],nh[nb],t).min(upper);let y=lerp(upper,lower,depth);
                let upper_point=boundary(vertices[a],h[a],vertices[b],h[b],t);let px=upper_point[0];let pz=upper_point[2];
                let taper=(std::f32::consts::PI*t).sin()*(std::f32::consts::PI*depth).sin();
                // MiYu: all styles keep their top, foot and vertical joints on the shared contour.
                let bulge=match style {
                    1=>{let peak=0.35+0.2*((px+origin[0])*0.7+(pz+origin[1])*0.9).sin();let ridge=if depth<peak {depth/peak}else{(1.-depth)/(1.-peak)};0.32*(1.-(t*2.-1.).abs())*ridge},
                    2=>{let row=(depth*4.).floor();let course=(depth*4.).rem_euclid(1.);let block=(t*4.+row.rem_euclid(2.)*0.5).rem_euclid(1.);let bevel=|v:f32|(v*8.).min((1.-v)*8.).clamp(0.,1.);0.06*bevel(course)*bevel(block)*bevel(t)},
                    _=>taper*(0.12+0.07*((px+origin[0])*2.1+(pz+origin[1])*0.8+y*3.7).sin())
                };
                let bulge=bulge*if style==0 {1.}else{((upper-lower)*4.).clamp(0.,1.)};let mut p=boundary(vertices[a],lerp(h[a],nh[na],depth),vertices[b],lerp(h[b],nh[nb],depth),t);p[1]=y;p[0]+=outward[0]*bulge;p[2]+=outward[1]*bulge;(p,[depth,if style==0 {upper-y}else{-1.-(upper-y)}])
            };
            // MiYu: common height subdivisions weld vertical corners between different cliff levels.
            let depths=|upper:f32,lower:f32| {let mut cuts=Vec::new();if (upper-lower).abs()>0.001 {for level in (upper.min(lower)*4.).floor() as i32..=(upper.max(lower)*4.).ceil() as i32 {let d=(upper-level as f32/4.)/(upper-lower);if d>0.&&d<1. {cuts.push(d);}}cuts.sort_by(f32::total_cmp);}cuts};let ca=depths(h[a],nh[na]);let cb=depths(h[b],nh[nb]);
            let mut side_triangle=|params:[[f32;2];3]| {let mut polygon=Vec::new();for i in 0..3 {let a=params[i];let b=params[(i+1)%3];polygon.push(side(a[0],a[1]));if a[0]==b[0]&&(a[0]==0.||a[0]==1.) {let cuts=if a[0]==0. {&ca}else{&cb};let mut extra:Vec<_>=cuts.iter().copied().filter(|d|*d>a[1].min(b[1])+1e-6&&*d<a[1].max(b[1])-1e-6).collect();if a[1]>b[1] {extra.reverse();}for d in extra {polygon.push(side(a[0],d));}}}
                if polygon.len()==3 {triangle([polygon[0].0,polygon[1].0,polygon[2].0],[polygon[0].1,polygon[1].1,polygon[2].1],false);}else{let center=side(params.iter().map(|p|p[0]).sum::<f32>()/3.,params.iter().map(|p|p[1]).sum::<f32>()/3.);for i in 0..polygon.len() {let next=(i+1)%polygon.len();triangle([center.0,polygon[i].0,polygon[next].0],[center.1,polygon[i].1,polygon[next].1],false);}}
            };
            let columns=4;let bands=4;
            for along in 0..columns { for band in 0..bands {
                let t=(along as f32/columns as f32).max(first);let end=((along+1) as f32/columns as f32).min(last);if t>=end {continue;}let d=band as f32/bands as f32;let next=(band+1) as f32/bands as f32;
                if style==2 {
                    let mid=(t+end)*0.5;let mut polygon=vec![[t,d]];if band>0 {polygon.push([mid,d]);}polygon.extend([[end,d],[end,next]]);if band+1<bands {polygon.push([mid,next]);}polygon.push([t,next]);
                    // MiYu: a ramp tip collapses several wall vertices into one; inset only the unique contour.
                    let coincident=|a:[f32;2],b:[f32;2]|(glam::Vec3::from_array(side(a[0],a[1]).0)-glam::Vec3::from_array(side(b[0],b[1]).0)).length_squared()<1e-10;
                    polygon.dedup_by(|a,b|coincident(*a,*b));if polygon.len()>1&&coincident(polygon[0],*polygon.last().unwrap()) {polygon.pop();}
                    let center=[mid,(d+next)*0.5];let inner:Vec<_>=polygon.iter().map(|p|[lerp(center[0],p[0],0.5),lerp(center[1],p[1],0.5)]).collect();
                    for i in 0..polygon.len() {let j=(i+1)%polygon.len();side_triangle([polygon[i],polygon[j],inner[j]]);side_triangle([polygon[i],inner[j],inner[i]]);}
                    for i in 0..inner.len() {side_triangle([center,inner[i],inner[(i+1)%inner.len()]]);}
                }
                else {side_triangle([[t,d],[end,d],[end,next]]);side_triangle([[t,d],[end,next],[t,next]]);}
            }}
        }
    }}
    Ok(mesh)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cliff_styles_change_wall_geometry_and_preserve_shelves() {
        let mut h=vec!['0';144];for i in 0..4 {h[(2*6+2)*4+i]='2';}let key=format!("terrain4h:00{}{}",h.into_iter().collect::<String>(),"80".repeat(49));
        let rock=terrain_mesh(&key).unwrap();assert_eq!(rock.positions,terrain_mesh(&(key.clone()+"0")).unwrap().positions);
        let tops=|mesh:&MeshData|mesh.positions.iter().zip(&mesh.normals).filter(|(_,n)|n[1]>0.999).map(|(p,_)|*p).collect::<Vec<_>>();
        for style in [1,2] {let mesh=terrain_mesh(&format!("{key}{style}")).unwrap();assert_ne!(mesh.positions,rock.positions);assert_eq!(tops(&mesh),tops(&rock));assert!(mesh.positions.iter().flatten().all(|v|v.is_finite()));assert!(mesh.normals.iter().all(|n|(glam::Vec3::from_array(*n).length()-1.).abs()<0.0001));if style==2 {assert!(mesh.indices.len()>rock.indices.len());}}
        for suffix in ["3","f","12"] {assert!(terrain_mesh(&(key.clone()+suffix)).is_err());}
    }
    #[test]
    fn javascript_floor_triangles_match_native_cliff_surfaces() {
        let cases:serde_json::Value=serde_json::from_str(include_str!("../../../docs/designs/frostbound-realms/cliff-surface-fixtures.json")).unwrap();
        for style in 0..=2 {for case in cases.as_array().unwrap() {
            let key=case["key"].as_str().unwrap();let mesh=terrain_mesh(&format!("{key}{style}")).unwrap();let origin=[key[10..11].parse::<f32>().unwrap()*8.-28.,key[11..12].parse::<f32>().unwrap()*8.-28.];
            for triangle in case["triangles"].as_array().unwrap() {
                let matched=mesh.indices.chunks_exact(3).any(|indices|indices.iter().enumerate().all(|(vertex,index)| {
                    let p=mesh.positions[*index as usize];let world=[p[0]+origin[0],p[1],p[2]+origin[1]];
                    (0..3).all(|axis|(world[axis]-triangle[vertex][axis].as_f64().unwrap() as f32).abs()<0.00002)
                }));
                assert!(matched,"JavaScript floor differs from native surface: mask={} mode={}",case["mask"],case["mode"]);
            }
        }}
    }
    #[test]
    fn sculpted_height_matches_world_plane_and_patch_seams() {
        let key=|x:u32| {let mut payload=format!("terrain4h:{x}3{}","0000".repeat(36));for _z in 0..7 {for vx in 0..7 {let world_x=x as i32*8-34+vx*2;payload.push_str(&format!("{:02x}",128+world_x/2));}}payload};
        let left=terrain_mesh(&key(3)).unwrap();let right=terrain_mesh(&key(4)).unwrap();
        for p in &left.positions {assert!((p[1]-(p[0]-4.)/32.).abs()<0.00001);}
        for a in left.positions.iter().filter(|p|p[0]>3.8&&(p[1]==0.||p[1]==2.)) {assert!(right.positions.iter().any(|b|(a[0]-b[0]-8.).abs()<0.00001&&(a[1]-b[1]).abs()<0.00001&&(a[2]-b[2]).abs()<0.00001));}
        assert!(left.normals.iter().all(|n|n[1]>0.99&&n[0]< -0.02));
        let flat=terrain_mesh(&format!("terrain4h:00{}{}","0000".repeat(36),"88".repeat(49))).unwrap();assert!(flat.positions.iter().all(|p|p[1]==0.5));
        assert!(terrain_mesh(&format!("terrain4h:00{}{}","0000".repeat(36),"ff".repeat(49))).is_err());
        assert!(terrain_mesh(&format!("terrain4h:00{}{}","0000".repeat(36),"80".repeat(48))).is_err());
    }
    #[test]
    fn rocky_tiles_weld_and_emit_only_exposed_cliffs() {
        let flat=terrain_mesh(&format!("terrain4r:00{}","2222".repeat(36))).unwrap();
        assert_eq!(flat.indices.len(),2304);assert!(flat.normals.iter().all(|n|n[1]>0.999));assert!(flat.positions.iter().all(|p|p[1]==2.));
        let next=terrain_mesh(&format!("terrain4r:10{}","2222".repeat(36))).unwrap();
        let edge:Vec<_>=flat.positions.iter().filter(|p|p[0]>3.8).collect();
        for a in edge {assert!(next.positions.iter().any(|b|(a[0]-b[0]-8.).abs()<0.00001&&(a[2]-b[2]).abs()<0.00001));}
        let stripe:String=(0..36).map(|i|if i/6==2||i/6==3 {"2222"} else {"0000"}).collect();
        let left=terrain_mesh(&format!("terrain4r:00{stripe}")).unwrap();let right=terrain_mesh(&format!("terrain4r:10{stripe}")).unwrap();
        for a in left.positions.iter().filter(|p|p[0]>3.8&&(p[1]==0.||p[1]==2.)) {assert!(right.positions.iter().any(|b|(a[0]-b[0]-8.).abs()<0.00001&&(a[1]-b[1]).abs()<0.00001&&(a[2]-b[2]).abs()<0.00001),"cliff contours weld across patches");}
        let mut h=vec!['0';144];for i in 0..4 {h[(2*6+2)*4+i]='2';}
        let cliff=terrain_mesh(&format!("terrain4r:00{}",h.into_iter().collect::<String>())).unwrap();
        assert!(cliff.indices.len()>2304&&cliff.indices.len()<4096);assert!(cliff.normals.iter().any(|n|n[1].abs()<0.2));
        assert!(cliff.positions.iter().zip(&cliff.uvs).any(|(p,uv)|p[1]==0. && uv[0]>0.9),"lower shelf receives contact shade");
        assert!(cliff.positions.iter().zip(&cliff.uvs).any(|(p,uv)|p[1]==2. && uv[1]>0.9),"upper shelf receives exposed rim weight");
        assert!(cliff.uvs.iter().any(|uv|uv[1]>1.5));assert!(cliff.positions.iter().flatten().all(|v|v.is_finite()));
        for key in ["terrain4r:00","terrain4r:80", "terrain4r:gg"] {assert!(terrain_mesh(key).is_err());}
        assert!(terrain_mesh(&format!("terrain4r:80{}","0000".repeat(36))).is_err());
    }
    #[test]
    fn all_corner_patterns_are_watertight_across_four_patches() {
        use std::collections::BTreeMap;
        for style in 0..=2 {for ramp in 0..=3 {for mask in 0..16 {
            let mut edges=BTreeMap::<([i32;3],[i32;3]),u32>::new();let mut points=Vec::new();
            for cz in 3..=4 {for cx in 3..=4 {
                let mut key=format!("terrain4h:{cx}{cz}");for dz in -1..=4 {for dx in -1..=4 {let x=cx*4+dx;let z=cz*4+dz;let quadrant=match (x>=16,z>=16) {(false,false)=>0,(true,false)=>1,(true,true)=>2,(false,true)=>3};for [vx,_vz] in [[x,z],[x+1,z],[x+1,z+1],[x,z+1]] {let h=if mask&(1<<quadrant)!=0 {2}else{0};let rise=if ramp==0 {0}else if ramp>=2&&z>=16 {let rise=if ramp==3 {1}else{2};rise-(vx-16).clamp(0,1)*rise}else{(vx-16).clamp(0,1)*2};key.push(char::from_digit((h+rise) as u32,16).unwrap());}}}key.push_str(&"80".repeat(49));
                key.push(char::from_digit(style,16).unwrap());let mesh=terrain_mesh(&key).unwrap();assert!(mesh.normals.iter().flatten().all(|v|v.is_finite()));assert_eq!(mesh.positions.len(),mesh.normals.len());
                let world:Vec<_>=mesh.positions.iter().map(|p|[p[0]+(cx*8-28) as f32,p[1],p[2]+(cz*8-28) as f32]).collect();points.extend(world.iter().copied());
                for triangle in mesh.indices.chunks_exact(3) {for i in 0..3 {let a=world[triangle[i] as usize].map(|v|(v*10000.).round() as i32);let b=world[triangle[(i+1)%3] as usize].map(|v|(v*10000.).round() as i32);if a!=b {*edges.entry(if a<b {(a,b)}else{(b,a)}).or_default()+=1;}}}
            }}
            for ((a,b),count) in edges {if count==1 {assert!([a,b].iter().all(|p|p[0].abs()>72500||p[2].abs()>72500),"unclosed interior edge for style {style}, ramp {ramp}, mask {mask}: {a:?} -> {b:?}");}}
            if mask==4&&ramp<2 {let inset=0.3/2_f32.sqrt()+0.2;assert!(points.iter().any(|p|(p[0]-inset).abs()<1e-5&&(p[2]-inset).abs()<1e-5&&p[1]==2.),"convex corner uses the shared curved joint");}
            if mask==11&&ramp<2 {let inset= -0.3/2_f32.sqrt()+0.2;assert!(points.iter().any(|p|(p[0]-inset).abs()<1e-5&&(p[2]-inset).abs()<1e-5&&p[1]==2.),"concave corner uses the shared curved joint");}
        }}}
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
