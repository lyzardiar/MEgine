// Author: MiYu. Bounded, immutable terrain patches shared by native Scene, Game and Player.
use crate::MeshData;

// MiYu: each two-unit rock module has one broad slanted face between its crown and foot.
fn rock_course(distance:f32,height:f32) -> f32 {
    let band=distance.rem_euclid(2.)*4.;let profile=[0.,0.13,0.24,0.32,0.36,0.34,0.22,0.10,0.];let i=band.floor() as usize;
    (profile[i]+(profile[i+1]-profile[i])*(band-i as f32))*((height-distance)*4.).clamp(0.,1.)
}

// MiYu: asymmetric facets vary by world tile and height layer, while every module edge stays welded.
fn rock_module(t:f32,distance:f32,height:f32,variant:usize) -> f32 {
    let profiles=[[0.,0.9,1.,0.8,0.],[0.,0.8,0.95,1.,0.],[0.,1.,0.85,0.9,0.]];
    let layer=(distance.max(0.)/2.).floor() as usize;let band=(t*4.).clamp(0.,4.);let i=(band.floor() as usize).min(3);
    let profile=profiles[(variant+layer)%3];let width=profile[i]+(profile[i+1]-profile[i])*(band-i as f32);
    width*rock_course(distance,height)
}

/// Four by four two-unit tiles, centered at the origin. Each tile supplies its four corner
/// heights (NW, NE, SE, SW) as hexadecimal integers in `terrain4:` followed by 64 digits.
/// Independent corners preserve vertical cliffs; skirts extend to -0.25. No file IO is needed.
/// `terrain4r:` adds two hexadecimal chunk coordinates and a six-by-six corner-height halo
/// for subdivided tops, connected rock faces and shelf/contact material weights in UVs.
/// `terrain4h:` adds a seven-by-seven signed relief field encoded as 128 + height * 16.
/// An optional final 0/1/2, or 36 halo style digits, selects rock, ice or masonry geometry.
/// `terrain4w:` adds 36 wet-cell flags and a final 0/1 for the water surface/riverbed.
pub fn terrain_mesh(key: &str) -> Result<MeshData, &'static str> {
    if let Some(data) = key.strip_prefix("terrain4w:") {
        if data.len()!=281 || !data.is_ascii() || !data.as_bytes()[244..].iter().all(|v|*v==b'0'||*v==b'1') {return Err("invalid water terrain payload");}
        return rocky_terrain(&data[..244],true,Some((&data.as_bytes()[244..280],data.as_bytes()[280]==b'1')));
    }
    if let Some(data) = key.strip_prefix("terrain4h:") { return rocky_terrain(data,true,None); }
    if let Some(data) = key.strip_prefix("terrain4r:") { return rocky_terrain(data,false,None); }
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
fn rocky_terrain(data: &str,sculpted:bool,water:Option<(&[u8],bool)>) -> Result<MeshData, &'static str> {
    if !data.is_ascii() {return Err("invalid rock terrain height payload");}
    let styles=if sculpted&&data.len()==280 {Some(&data.as_bytes()[244..])}else{None};
    if styles.is_some_and(|values|values.iter().any(|v|!(b'0'..=b'2').contains(v))) {return Err("invalid cliff geometry styles");}
    let style=if sculpted&&data.len()==245 {let digit=data.as_bytes()[244];if !(b'0'..=b'2').contains(&digit) {return Err("invalid cliff geometry style");}digit-b'0'}else{0};
    let data=if sculpted&&(data.len()==245||styles.is_some()) {&data[..244]}else{data};
    if data.len()!=(if sculpted {244} else {146}) || !data.bytes().all(|v| v.is_ascii_hexdigit()) { return Err("invalid rock terrain height payload"); }
    let digits:Vec<f32>=data[..146].chars().map(|v| v.to_digit(16).unwrap() as f32).collect();
    if digits[0]>7. || digits[1]>7. { return Err("rock terrain chunk coordinate exceeds eight patches"); }
    let origin=[digits[0]*8.-28.,digits[1]*8.-28.];let heights=&digits[2..];
    let mut relief=[0.;49];if sculpted {for (i,value) in relief.iter_mut().enumerate() {*value=(u8::from_str_radix(&data[146+i*2..148+i*2],16).unwrap() as f32-128.)/16.;if value.abs()>1. {return Err("sculpted relief exceeds one world unit");}}}
    let relief_height=|x:f32,z:f32| {
        let u=((x+6.)/2.).clamp(0.,6.);let v=((z+6.)/2.).clamp(0.,6.);let ix=(u.floor() as usize).min(5);let iz=(v.floor() as usize).min(5);let fx=u-ix as f32;let fz=v-iz as f32;let i=iz*7+ix;
        (relief[i]*(1.-fx)+relief[i+1]*fx)*(1.-fz)+(relief[i+7]*(1.-fx)+relief[i+8]*fx)*fz
    };
    // MiYu: the halo keeps submerged beds continuous at chunk borders and level at dry banks.
    let water_offset=|x:f32,z:f32| {
        let Some((wet,bed))=water else {return 0.;};if !bed {return 0.04;}
        let mut distance=1_f32;for (i,flag) in wet.iter().enumerate() {if *flag==b'0' {let dx=(x-(i%6) as f32*2.+5.).abs()-1.;let dz=(z-(i/6) as f32*2.+5.).abs()-1.;distance=distance.min(glam::Vec2::new(dx.max(0.),dz.max(0.)).length());}}
        let t=distance.clamp(0.,1.);-0.75*t*t*(3.-2.*t)
    };
    let mut mesh=MeshData { positions:Vec::new(),normals:Vec::new(),uvs:Vec::new(),indices:Vec::new() };
    let mut triangle=|mut p:[[f32;3];3],uv:[[f32;2];3],top:bool,style:u8| {
        let base=(glam::Vec3::from_array(p[1])-glam::Vec3::from_array(p[0])).cross(glam::Vec3::from_array(p[2])-glam::Vec3::from_array(p[0])).normalize_or_zero();
        if water.is_some()&&!top {return;}
        for vertex in &mut p {vertex[1]+=relief_height(vertex[0],vertex[2])+water_offset(vertex[0],vertex[2]);}
        let a=glam::Vec3::from_array(p[1])-glam::Vec3::from_array(p[0]);let b=glam::Vec3::from_array(p[2])-glam::Vec3::from_array(p[0]);let cross=a.cross(b);
        if cross.length_squared()<1e-10 { return; }
        debug_assert!(!top||cross.y>0.,"terrain top winding: {p:?}");
        let normals=p.map(|v|if top&&sculpted&&base.y>0.01 {let height=|x,z|relief_height(x,z)+water_offset(x,z);let dx=(height(v[0]+0.25,v[2])-height(v[0]-0.25,v[2]))*2.;let dz=(height(v[0],v[2]+0.25)-height(v[0],v[2]-0.25))*2.;glam::Vec3::new(base.x/base.y-dx,1.,base.z/base.y-dz).normalize().to_array()}else{cross.normalize().to_array()});
        // MiYu: style occupies whole UV bands; contact shade stays within the tile's atlas layer.
        let first=mesh.positions.len() as u32;mesh.positions.extend(p);mesh.normals.extend(normals);mesh.uvs.extend(uv.map(|v|[v[0]+style as f32*2.,v[1]]));mesh.indices.extend([first,first+1,first+2]);
    };
    let point=|x:f32,y:f32,z:f32| { let wx=x+origin[0];let wz=z+origin[1];[x+(wx*1.13+wz*0.71).sin()*0.12,y,z+(wz*1.07-wx*0.83).sin()*0.12] };
    let lerp=|a:f32,b:f32,t:f32| a+(b-a)*t;
    let corner=|vx:usize,vz:usize,height:f32| {
        let touching=[(vz*6+vx,2,[-1.,-1.]),(vz*6+vx+1,3,[1.,-1.]),((vz+1)*6+vx,1,[-1.,1.]),((vz+1)*6+vx+1,0,[1.,1.])];let mut inward=glam::Vec2::ZERO;let mut high=[false;4];
        for (i,(cell,index,direction)) in touching.iter().enumerate() {high[i]=heights[cell*4+index]>=height-0.01;if !high[i] {inward-=glam::Vec2::from_array(*direction);}}
        // MiYu: broader level shoulders retain the existing passage width wherever a ramp meets them.
        let ramp=touching.iter().any(|(cell,_,_)|heights[cell*4..cell*4+4].iter().any(|h|*h!=heights[cell*4]));
        let offset=inward.normalize_or_zero()*if ramp {0.3}else{0.42};let mut p=point(vx as f32*2.-4.,height,vz as f32*2.-4.);p[0]+=offset.x;p[2]+=offset.y;
        if !ramp {let low=touching.iter().map(|(cell,index,_)|heights[cell*4+index]).fold(height,f32::min);p[1]-=(height-low).clamp(0.,1.)*0.18;}
        let mut rays=[glam::Vec2::ZERO;2];let mut count=0;for (a,b,ray) in [(0,1,[0.,-1.]),(1,3,[1.,0.]),(3,2,[0.,1.]),(2,0,[-1.,0.])] {if high[a]!=high[b] {if count<2 {rays[count]=glam::Vec2::from_array(ray);}count+=1;}}
        if count!=2 || rays[0].dot(rays[1]).abs()>0.01 {rays=[glam::Vec2::ZERO;2];}(p,rays)
    };
    let edge_delta=|a:[usize;2],b:[usize;2]| {
        let (first,last)=if a[1]==b[1] {let cell=a[1]*6+a[0].min(b[0])+1;let d=[heights[cell*4+3]-heights[(cell+6)*4],heights[cell*4+2]-heights[(cell+6)*4+1]];if a[0]<b[0] {(d[0],d[1])}else{(d[1],d[0])}}else{let cell=(a[1].min(b[1])+1)*6+a[0];let d=[heights[cell*4+1]-heights[(cell+1)*4],heights[cell*4+2]-heights[(cell+1)*4+3]];if a[1]<b[1] {(d[0],d[1])}else{(d[1],d[0])}};
        [first,last]
    };
    let crossing=|a,b| {let [first,last]=edge_delta(a,b);if first*last<0. {Some(first/(first-last))}else{None}};
    // MiYu: each height layer shares one curved corner; all touching tops and cliff walls use its boundary.
    let joint=|vx:usize,vz:usize,height:f32| {let (mut p,rays)=corner(vx,vz,height);let offset=(rays[0]+rays[1])*0.2;p[0]+=offset.x;p[2]+=offset.y;p};
    let boundary=|a:[usize;2],ha:f32,b:[usize;2],hb:f32,t:f32| {
        let direction=glam::Vec2::new(b[0] as f32-a[0] as f32,b[1] as f32-a[1] as f32);
        let round=|rays:[glam::Vec2;2],ray:glam::Vec2,f:f32| {let sum=rays[0]+rays[1];if rays.iter().any(|r|r.dot(ray)>0.99) {if f>=0.4 {glam::Vec2::ZERO}else{let q=0.5+f/0.8;((sum-ray)*(1.-q).powi(2)+ray*q*q)*0.8-ray*f*2.}}else{sum*0.2*(1.-f)}};
        let sample=|v:[usize;2],height:f32,ray:glam::Vec2,f:f32| {let i=v[1]*6+v[0];let levels=[heights[i*4+2],heights[(i+1)*4+3],heights[(i+6)*4+1],heights[(i+7)*4]];let lo=levels.iter().copied().filter(|h|*h<=height).fold(f32::NEG_INFINITY,f32::max);let hi=levels.iter().copied().filter(|h|*h>=height).fold(f32::INFINITY,f32::min);let lo=if lo.is_finite() {lo}else{height};let hi=if hi.is_finite() {hi}else{height};let (pa,ra)=corner(v[0],v[1],lo);if hi-lo<0.001 {(pa,round(ra,ray,f))}else{let (pb,rb)=corner(v[0],v[1],hi);let blend=(height-lo)/(hi-lo);(std::array::from_fn::<_,3,_>(|axis|lerp(pa[axis],pb[axis],blend)),round(ra,ray,f).lerp(round(rb,ray,f),blend))}};
        let (pa,oa)=sample(a,ha,direction,t);let (pb,ob)=sample(b,hb,-direction,1.-t);let offset=oa+ob;let mut p=std::array::from_fn::<_,3,_>(|i|lerp(pa[i],pb[i],t));p[0]+=offset.x;p[2]+=offset.y;
        if let Some(cut)=crossing(a,b) {let factor=if t<cut {(cut-t)/cut}else{(t-cut)/(1.-cut)};let raw_a=point(a[0] as f32*2.-4.,ha,a[1] as f32*2.-4.);let raw_b=point(b[0] as f32*2.-4.,hb,b[1] as f32*2.-4.);for axis in [0,2] {let raw=lerp(raw_a[axis],raw_b[axis],t);p[axis]=lerp(raw,p[axis],factor);}}
        // MiYu: fracture the straight middle of level cliffs; curved corners and sloped junctions keep their common transition.
        let [first,last]=edge_delta(a,b);let delta=if first==last&&ha==hb {first.clamp(-1.,1.)}else{0.};let wx=lerp(a[0] as f32,b[0] as f32,t)*2.-4.+origin[0];let wz=lerp(a[1] as f32,b[1] as f32,t)*2.-4.+origin[1];
        let fracture=((wx*2.7+wz*0.9).sin()*0.16+(wz*2.3-wx*0.7).sin()*0.08)*((t-0.4)*10.).min((0.6-t)*10.).clamp(0.,1.)*delta;
        p[if a[1]==b[1] {2}else{0}]+=fracture;p
    };
    for iz in 0..4 { for ix in 0..4 {
        let cell=(iz+1)*6+ix+1;let h=&heights[cell*4..cell*4+4];
        let style=styles.map_or(style,|values|values[cell]-b'0');
        let corners=[joint(ix,iz,h[0]),joint(ix+1,iz,h[1]),joint(ix+1,iz+1,h[2]),joint(ix,iz+1,h[3])];
        let edges=[(cell-6,0,1,3,2,[0.,-1.]),(cell+1,1,2,0,3,[1.,0.]),(cell+6,2,3,1,0,[0.,1.]),(cell-1,3,0,2,1,[-1.,0.])];
        let top=|u:f32,v:f32| {
            let north=boundary([ix,iz],h[0],[ix+1,iz],h[1],u);let south=boundary([ix,iz+1],h[3],[ix+1,iz+1],h[2],u);let west=boundary([ix,iz],h[0],[ix,iz+1],h[3],v);let east=boundary([ix+1,iz],h[1],[ix+1,iz+1],h[2],v);
            let mut p=std::array::from_fn(|axis|lerp(north[axis],south[axis],v)+lerp(west[axis],east[axis],u)-lerp(lerp(corners[0][axis],corners[1][axis],u),lerp(corners[3][axis],corners[2][axis],u),v));let mut shade:f32=0.;let mut rim:f32=0.;
            // MiYu: crowns fold down into the cliff while the inner shelf retains its authored elevation.
            let flat=lerp(lerp(h[0],h[1],u),lerp(h[3],h[2],u),v);let interior=(u.min(1.-u).min(v.min(1.-v))*4.).clamp(0.,1.);p[1]=lerp(p[1],flat,interior);
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
            for t in steps {let u=lerp(vertices[a][0] as f32,vertices[b][0] as f32,t);let v=lerp(vertices[a][1] as f32,vertices[b][1] as f32,t);let outer=top(u-ix as f32,v-iz as f32);let mut p=std::array::from_fn(|axis|lerp(center.0[axis],outer.0[axis],0.5));let inner_top=top((u-ix as f32+0.5)*0.5,(v-iz as f32+0.5)*0.5);p[1]=inner_top.0[1];outline.push(outer);inner.push((p,inner_top.1));}
        }
        for i in 0..outline.len() {let j=(i+1)%outline.len();triangle([center.0,inner[i].0,inner[j].0],[center.1,inner[i].1,inner[j].1],true,style);triangle([inner[i].0,outline[i].0,outline[j].0],[inner[i].1,outline[i].1,outline[j].1],true,style);triangle([inner[i].0,outline[j].0,inner[j].0],[inner[i].1,outline[j].1,inner[j].1],true,style);}
        if water.is_some() {continue;}
        for (neighbor,a,b,na,nb,outward) in edges {
            let nh=&heights[neighbor*4..neighbor*4+4];if h[a]<=nh[na] && h[b]<=nh[nb] { continue; }
            let da=h[a]-nh[na];let db=h[b]-nh[nb];let first=if da<=0. {da/(da-db)}else{0.};let last=if db<=0. {da/(da-db)}else{1.};
            let wx=origin[0]+(vertices[a][0]+vertices[b][0]) as f32-4.;let wz=origin[1]+(vertices[a][1]+vertices[b][1]) as f32-4.;
            let variant=(wx as i32*17+wz as i32*31).rem_euclid(3) as usize;
            let side=|t:f32,depth:f32| {
                let upper=lerp(h[a],h[b],t);let lower=lerp(nh[na],nh[nb],t).min(upper);let y=lerp(upper,lower,depth);
                let upper_point=boundary(vertices[a],h[a],vertices[b],h[b],t);let px=upper_point[0];let pz=upper_point[2];
                // MiYu: all styles keep their top, foot and vertical joints on the shared contour.
                let bulge=match style {
                    1=>{let peak=0.35+0.2*((px+origin[0])*0.7+(pz+origin[1])*0.9).sin();let ridge=if depth<peak {depth/peak}else{(1.-depth)/(1.-peak)};0.32*(1.-(t*2.-1.).abs())*ridge},
                    2=>{let row=(depth*4.).floor();let course=(depth*4.).rem_euclid(1.);let block=(t*4.+row.rem_euclid(2.)*0.5).rem_euclid(1.);let bevel=|v:f32|(v*8.).min((1.-v)*8.).clamp(0.,1.);0.06*bevel(course)*bevel(block)*bevel(t)},
                    _=>rock_module(t,upper-y,upper-lower,variant)
                };
                let bulge=bulge*((upper-lower)*4.).clamp(0.,1.);let mut p=boundary(vertices[a],lerp(h[a],nh[na],depth),vertices[b],lerp(h[b],nh[nb],depth),t);p[0]+=outward[0]*bulge;p[2]+=outward[1]*bulge;(p,[depth,if sculpted {-1.-(upper-y)}else{upper-y}])
            };
            // MiYu: common height subdivisions weld vertical corners between different cliff levels.
            let depths=|upper:f32,lower:f32| {let mut cuts=Vec::new();if (upper-lower).abs()>0.001 {for level in (upper.min(lower)*4.).floor() as i32..=(upper.max(lower)*4.).ceil() as i32 {let d=(upper-level as f32/4.)/(upper-lower);if d>0.&&d<1. {cuts.push(d);}}cuts.sort_by(f32::total_cmp);}cuts};
            if style==0 {
                // MiYu: unequal ramp columns retain the same absolute height cuts as adjoining straight cliff modules.
                let column=|t:f32| {let upper=lerp(h[a],h[b],t);let lower=lerp(nh[na],nh[nb],t).min(upper);let mut cuts=vec![0.];cuts.extend(depths(upper,lower));cuts.push(1.);cuts};
                for along in 0..4 {
                    let t=(along as f32/4.).max(first);let end=((along+1) as f32/4.).min(last);if t>=end {continue;}let left=column(t);let right=column(end);let mut i=0;let mut j=0;
                    while i+1<left.len()||j+1<right.len() {
                        let a=side(t,left[i]);let b=side(end,right[j]);let c=if j+1<right.len()&&(i+1==left.len()||right[j+1]<=left[i+1]) {j+=1;side(end,right[j])}else{i+=1;side(t,left[i])};
                        triangle([a.0,b.0,c.0],[a.1,b.1,c.1],false,style);
                    }
                }
                continue;
            }
            let ca=depths(h[a],nh[na]);let cb=depths(h[b],nh[nb]);
            let mut side_triangle=|params:[[f32;2];3]| {let mut polygon=Vec::new();for i in 0..3 {let a=params[i];let b=params[(i+1)%3];polygon.push(side(a[0],a[1]));if a[0]==b[0]&&(a[0]==0.||a[0]==1.) {let cuts=if a[0]==0. {&ca}else{&cb};let mut extra:Vec<_>=cuts.iter().copied().filter(|d|*d>a[1].min(b[1])+1e-6&&*d<a[1].max(b[1])-1e-6).collect();if a[1]>b[1] {extra.reverse();}for d in extra {polygon.push(side(a[0],d));}}}
                if polygon.len()==3 {triangle([polygon[0].0,polygon[1].0,polygon[2].0],[polygon[0].1,polygon[1].1,polygon[2].1],false,style);}else{let center=side(params.iter().map(|p|p[0]).sum::<f32>()/3.,params.iter().map(|p|p[1]).sum::<f32>()/3.);for i in 0..polygon.len() {let next=(i+1)%polygon.len();triangle([center.0,polygon[i].0,polygon[next].0],[center.1,polygon[i].1,polygon[next].1],false,style);}}
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
    #[test]
    fn rock_cliffs_repeat_broad_faces_and_preserve_inner_shelves() {
        for distance in [0.25,0.5,0.75,1.,1.25,1.5,1.75] {assert!((rock_course(distance,6.)-rock_course(distance+2.,6.)).abs()<1e-6);assert!((rock_course(distance,6.)-rock_course(distance+4.,6.)).abs()<1e-6);}
        for level in [0.,2.,4.,6.] {assert_eq!(rock_course(level,6.),0.);}
        for depth in [0.25,0.5,0.75] {assert!(rock_course(depth,6.)<rock_course(depth+0.25,6.));}
        for depth in [1.,1.25,1.5,1.75] {assert!(rock_course(depth,6.)>rock_course(depth+0.25,6.));}
        assert_eq!(rock_course(6.,6.),0.);
        let mut heights=vec!['0';144];for i in 0..4 {heights[(2*6+2)*4+i]='6';}let key=format!("terrain4h:33{}{}",heights.into_iter().collect::<String>(),"80".repeat(49));let mesh=terrain_mesh(&key).unwrap();
        assert!(mesh.indices.len()<12000);assert!(mesh.positions.iter().flatten().all(|v|v.is_finite()));
        let tops:Vec<_>=mesh.positions.iter().zip(&mesh.uvs).filter(|(_,uv)|uv[1]>=0.).map(|(p,_)|p).collect();
        assert!(tops.iter().all(|p|p[1]==0.||(5.81999..=6.).contains(&p[1])));assert!(tops.iter().any(|p|p[1]==6.));assert!(tops.iter().any(|p|(p[1]-5.82).abs()<1e-6));
        assert!(mesh.normals.iter().zip(&mesh.uvs).any(|(n,uv)|uv[1]>=0.&&n[1]>0.5&&n[1]<0.999),"the crown must include sloping top triangles");
        for depth in [0.25,2.25,4.25] {assert!(mesh.positions.iter().zip(&mesh.uvs).any(|(p,uv)|(p[1]-(6.-depth)*0.97).abs()<1e-6&&(uv[1]+1.+depth).abs()<1e-6),"wall columns must reach the folded crown without losing their height subdivisions");}
    }
    #[test]
    fn rock_modules_have_distinct_facets_and_closed_edges() {
        let sample=|variant|[0.25,0.5,0.75].map(|t|rock_module(t,0.5,6.,variant));
        assert_ne!(sample(0),sample(1));assert_ne!(sample(1),sample(2));assert_ne!(sample(0),sample(2));
        for variant in 0..3 {for distance in [0.,0.25,0.5,1.25,1.75,2.,2.5,4.,4.5,6.] {
            for t in [0.,1.] {assert_eq!(rock_module(t,distance,6.,variant),0.);}
            for t in [0.25,0.5,0.75] {let value=rock_module(t,distance,6.,variant);assert!((0.0..=0.36).contains(&value));if distance.rem_euclid(2.)==0. {assert_eq!(value,0.);}}
        }assert_ne!(rock_module(0.25,0.5,6.,variant),rock_module(0.25,2.5,6.,variant));}
    }
    #[test]
    fn ramp_cliff_sides_sample_crown_and_foot_at_quarter_unit_heights() {
        let mut heights=vec!['0';144];for (i,h) in ['6','0','0','6'].into_iter().enumerate() {heights[(2*6+2)*4+i]=h;}
        let mesh=terrain_mesh(&format!("terrain4h:33{}{}",heights.into_iter().collect::<String>(),"80".repeat(49))).unwrap();
        let wall:Vec<_>=mesh.positions.iter().zip(&mesh.uvs).filter(|(_,uv)|uv[1]<0.).collect();
        assert!(wall.iter().any(|(p,uv)|(p[1]-4.25).abs()<1e-5&&(uv[1]+1.25).abs()<1e-5),"the interior ramp column must retain its first crown bevel");
        assert!(wall.iter().all(|(p,_)|(p[1]*4.-(p[1]*4.).round()).abs()<1e-5),"sloped walls must share the quarter-unit vertical lattice");
        assert!(mesh.indices.len()<12000&&mesh.normals.iter().flatten().all(|v|v.is_finite()));
    }
    use super::*;
    #[test]
    fn water_layers_preserve_tops_and_lower_only_submerged_beds() {
        let payload=format!("33{}{}","0000".repeat(36),"80".repeat(49));let ground=terrain_mesh(&format!("terrain4h:{payload}")).unwrap();
        let surface=terrain_mesh(&format!("terrain4w:{payload}{}0","1".repeat(36))).unwrap();let bed=terrain_mesh(&format!("terrain4w:{payload}{}1","1".repeat(36))).unwrap();
        assert_eq!(surface.indices,ground.indices);assert_eq!(bed.indices,ground.indices);
        for ((g,w),b) in ground.positions.iter().zip(&surface.positions).zip(&bed.positions) {assert_eq!(g[0],w[0]);assert_eq!(g[2],w[2]);assert!((w[1]-g[1]-0.04).abs()<1e-6);assert!((b[1]-g[1]+0.75).abs()<1e-6);}
        let wet:String=(0..36).map(|i|if i%6>=3 {'1'}else{'0'}).collect();let bank=terrain_mesh(&format!("terrain4w:{payload}{wet}1")).unwrap();
        assert!(bank.positions.iter().any(|p|p[0]>1.&&p[1]< -0.74));for p in &bank.positions {if p[0]<=0. {assert_eq!(p[1],0.);}assert!((-0.75..=0.).contains(&p[1]));}
        for mesh in [&surface,&bed,&bank] {assert!(mesh.normals.iter().all(|n|n[1]>0.&&n.iter().all(|v|v.is_finite())&&(glam::Vec3::from_array(*n).length()-1.).abs()<1e-5));for tri in mesh.indices.chunks_exact(3) {let a=glam::Vec3::from_array(mesh.positions[tri[0] as usize]);let b=glam::Vec3::from_array(mesh.positions[tri[1] as usize]);let c=glam::Vec3::from_array(mesh.positions[tri[2] as usize]);assert!((b-a).cross(c-a).y>0.);}}
        for suffix in [format!("{}0","1".repeat(35)),format!("{}2","1".repeat(36)),format!("{}0","x".repeat(36))] {assert!(terrain_mesh(&format!("terrain4w:{payload}{suffix}")).is_err());}
        assert!(terrain_mesh(&format!("terrain4w:{}{}0","é".repeat(122),"1".repeat(36))).is_err());assert!(terrain_mesh(&format!("terrain4h:{}0","é".repeat(122))).is_err());
    }
    #[test]
    fn submerged_patch_seams_match_in_height_and_normal() {
        let key=|cx:i32,layer:u32| {let mut data=format!("terrain4w:{cx}3{}{}","0000".repeat(36),"80".repeat(49));for z in -1..=4 {for x in -1..=4 {data.push(if (cx*4+x>=14&&cx*4+x<=18)&&z>=1 {'1'}else{'0'});}}data.push(char::from_digit(layer,10).unwrap());data};
        for layer in [0,1] {let left=terrain_mesh(&key(3,layer)).unwrap();let right=terrain_mesh(&key(4,layer)).unwrap();let mut matched=0;
            for (a,n) in left.positions.iter().zip(&left.normals).filter(|(p,_)|p[0]>3.8) {if let Some((b,m))=right.positions.iter().zip(&right.normals).find(|(b,_)|(a[0]-b[0]-8.).abs()<1e-5&&(a[2]-b[2]).abs()<1e-5) {matched+=1;assert!((a[1]-b[1]).abs()<1e-5);assert!((glam::Vec3::from_array(*n)-glam::Vec3::from_array(*m)).length()<1e-5);}}
            assert!(matched>16);
        }
    }
    #[test]
    fn cliff_styles_change_wall_geometry_and_preserve_shelves() {
        let mut h=vec!['0';144];for i in 0..4 {h[(2*6+2)*4+i]='2';}let key=format!("terrain4h:00{}{}",h.into_iter().collect::<String>(),"80".repeat(49));
        let rock=terrain_mesh(&key).unwrap();assert_eq!(rock.positions,terrain_mesh(&(key.clone()+"0")).unwrap().positions);
        let tops=|mesh:&MeshData|mesh.positions.iter().zip(&mesh.uvs).filter(|(_,uv)|uv[1]>=0.).map(|(p,_)|*p).collect::<Vec<_>>();
        for style in [1,2] {let mesh=terrain_mesh(&format!("{key}{style}")).unwrap();assert_ne!(mesh.positions,rock.positions);assert_eq!(tops(&mesh),tops(&rock));assert!(mesh.positions.iter().flatten().all(|v|v.is_finite()));assert!(mesh.normals.iter().all(|n|(glam::Vec3::from_array(*n).length()-1.).abs()<0.0001));if style==2 {assert!(mesh.indices.len()>rock.indices.len());}}
        for suffix in ["3","f","12"] {assert!(terrain_mesh(&(key.clone()+suffix)).is_err());}
    }
    #[test]
    fn per_tile_cliffs_keep_geometry_and_atlas_layers_registered() {
        let mut heights=vec!['0';144];for i in 0..4 {heights[(2*6+2)*4+i]='2';}let key=format!("terrain4h:33{}{}",heights.into_iter().collect::<String>(),"80".repeat(49));
        for style in 0..=2 {let uniform=terrain_mesh(&format!("{key}{style}")).unwrap();let painted=terrain_mesh(&format!("{key}{}",style.to_string().repeat(36))).unwrap();assert_eq!(painted.positions,uniform.positions);assert_eq!(painted.uvs,uniform.uvs);assert_eq!(painted.indices,uniform.indices);}
        let styles:String=(0..36).map(|i|char::from_digit(((i%6+i/6)%3) as u32,10).unwrap()).collect();let mixed=terrain_mesh(&format!("{key}{styles}")).unwrap();let mut layers=[false;3];
        for indices in mixed.indices.chunks_exact(3) {let layer=(mixed.uvs[indices[0] as usize][0]/2.).floor() as usize;assert!(layer<3);layers[layer]=true;for index in indices {let uv=mixed.uvs[*index as usize];assert_eq!((uv[0]/2.).floor() as usize,layer);assert!((0.0..=1.0).contains(&(uv[0]-layer as f32*2.)));}}
        assert_eq!(layers,[true;3]);for styles in ["0".repeat(35),"3".repeat(36),"0".repeat(37)] {assert!(terrain_mesh(&format!("{key}{styles}")).is_err());}
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
        assert!(cliff.positions.iter().zip(&cliff.uvs).any(|(p,uv)|(p[1]-1.82).abs()<1e-6 && uv[1]>0.9),"folded crown receives exposed rim weight");
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
            if mask==4&&ramp<2 {let inset=(if ramp==0 {0.42}else{0.3})/2_f32.sqrt()+0.2;let crown=if ramp==0 {1.82}else{2.};assert!(points.iter().any(|p|(p[0]-inset).abs()<1e-5&&(p[2]-inset).abs()<1e-5&&(p[1]-crown).abs()<1e-5),"convex corner uses the shared curved joint");}
            if mask==11&&ramp<2 {let inset= -(if ramp==0 {0.42}else{0.3})/2_f32.sqrt()+0.2;let crown=if ramp==0 {1.82}else{2.};assert!(points.iter().any(|p|(p[0]-inset).abs()<1e-5&&(p[2]-inset).abs()<1e-5&&(p[1]-crown).abs()<1e-5),"concave corner uses the shared curved joint");}
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
