// Author: MiYu. Preserve source terrain topology, shared ramp heights and two-cell transition footprints.
use super::*;
use glam::Vec3;

#[derive(Debug,serde::Serialize)]
pub struct WarcraftGroundTile {pub cell:[u32;2],pub corners:[u32;4],pub textures:[u8;4],pub variation:u8}
#[derive(Debug,serde::Serialize)]
pub struct WarcraftCliffPlacement {pub cell:[u32;2],pub anchor:[u32;2],pub span:[u32;2],pub base_layer:u8,pub texture:u8,pub template:usize,pub member:String}
#[derive(serde::Serialize)]
pub struct WarcraftTerrainLayout {pub ground:Vec<WarcraftGroundTile>,pub cliffs:Vec<WarcraftCliffPlacement>,pub ground_heights:Vec<f32>,pub surface_heights:Vec<f32>,pub normals:Vec<[f32;3]>,pub raised_corners:Vec<u32>,pub ramp_entrances:Vec<[u32;2]>}
fn ids(width:u32,x:u32,y:u32)->[u32;4] {[y*width+x,(y+1)*width+x,(y+1)*width+x+1,y*width+x+1]}
fn values(t:&WarcraftMapTerrain,x:u32,y:u32)->[u8;4] {[t.corner(x,y),t.corner(x,y+1),t.corner(x+1,y+1),t.corner(x+1,y)].map(|c|c.unwrap().layer())}
fn entrance(t:&WarcraftMapTerrain,x:u32,y:u32,v:[u8;4])->bool {v.iter().any(|n|*n!=v[0]) && !(v[0]==v[2] && v[1]==v[3]) && [t.corner(x,y),t.corner(x,y+1),t.corner(x+1,y+1),t.corner(x+1,y)].iter().all(|c|c.unwrap().is_ramp())}
fn skin(t:&WarcraftMapTerrain,defs:&[CliffDef],x:u32,y:u32)->Result<usize> {let index=t.corner(x,y).unwrap().cliff_texture(); let index=if index==15 {1} else {index as usize}; if index>=defs.len() {return Err(invalid(format!("cliff texture outside tileset at {x},{y}")));} Ok(index)}
pub(super) fn place(cliffs:&mut Vec<WarcraftCliffPlacement>,occupied:&mut[usize],size:[u32;2],cell:[u32;2],base:u8,texture:usize,template:usize,left:i64,bottom:i64,c:&mut Compiler<'_>)->Result<()> {
    let model=&c.templates[template]; let [sx,sy]=model.span; if left<0 || bottom<0 || left+sx as i64>size[0] as i64 || bottom+sy as i64>size[1] as i64 {return Err(invalid("cliff footprint leaves map"));}
    for y in bottom as u32..bottom as u32+sy {for x in left as u32..left as u32+sx {if occupied[(y*size[0]+x) as usize]!=usize::MAX {return Err(invalid("overlapping cliff footprints"));}}}
    c.layout.charge(model.member.len())?; let index=cliffs.len(); cliffs.push(WarcraftCliffPlacement {cell,anchor:[left as u32+sx,bottom as u32],span:[sx,sy],base_layer:base,texture:texture as u8,template,member:model.member.clone()});
    for y in bottom as u32..bottom as u32+sy {for x in left as u32..left as u32+sx {occupied[(y*size[0]+x) as usize]=index;}} Ok(())
}

pub(super) fn compile(t:&WarcraftMapTerrain,defs:&[CliffDef],c:&mut Compiler<'_>)->Result<WarcraftTerrainLayout> {
    let [width,height]=t.size(); let size=t.tile_size(); let n=(width as usize).checked_mul(height as usize).ok_or_else(||limit("terrain vertex size overflow"))?; let cells=(size[0] as usize).checked_mul(size[1] as usize).ok_or_else(||limit("terrain cell size overflow"))?;
    if n>u32::MAX as usize {return Err(limit("terrain corner index exceeds32bits"));}
    let mut ground_heights=array(n,&mut c.layout)?; let mut surface_heights=array(n,&mut c.layout)?; let mut raised=filled(n,false,&mut c.layout)?; let mut occupied=filled(cells,usize::MAX,&mut c.layout)?; let mut entrances=filled(cells,false,&mut c.layout)?; let mut nonflat=0;
    for y in 0..height {check(c.cancel)?; for x in 0..width {let corner=t.corner(x,y).unwrap(); ground_heights.push(corner.ground_height()); surface_heights.push(corner.ground_height()+corner.layer() as f32-2.);}}
    for y in 0..size[1] {check(c.cancel)?; for x in 0..size[0] {let v=values(t,x,y); if v.iter().all(|n|*n==v[0]) {continue;} nonflat+=1; if entrance(t,x,y,v) {entrances[(y*size[0]+x) as usize]=true; let base=*v.iter().min().unwrap(); for (id,value) in ids(width,x,y).into_iter().zip(v) {if value==base {raised[id as usize]=true;}}}}}
    for (height,raised) in surface_heights.iter_mut().zip(&raised) {if *raised {*height+=0.5;}}
    let mut cliffs=array(nonflat,&mut c.layout)?;
    for y in 0..size[1] {check(c.cancel)?; for x in 0..size[0] {let v=values(t,x,y); let base=*v.iter().min().unwrap(); if entrances[(y*size[0]+x) as usize] || *v.iter().max().unwrap()-base!=1 {continue;}
        let marked=[t.corner(x,y),t.corner(x,y+1),t.corner(x+1,y+1),t.corner(x+1,y)].map(|c|c.unwrap().is_ramp()); if marked.iter().filter(|v|**v).count()!=2 || !((marked[0]!=marked[3] && marked[1]!=marked[2]) || (marked[0]!=marked[1] && marked[3]!=marked[2])) {continue;}
        let texture=skin(t,defs,x,y)?; let pattern=std::array::from_fn(|i|if marked[i] {if v[i]==base {b'L'} else {b'H'}} else {b'A'+v[i]-base}); let Some(template)=c.resolve(&defs[texture].ramp,pattern,0)? else {continue;}; let span=c.templates[template].span;
        let (mut left,mut bottom)=(x as i64,y as i64); let extra=if span[0]==2 {if u16::from(v[0])+u16::from(v[1])<u16::from(v[2])+u16::from(v[3]) {left-=1;} [if left<x as i64 {left} else {x as i64+1},y as i64]} else if span[1]==2 {if u16::from(v[0])+u16::from(v[3])<u16::from(v[1])+u16::from(v[2]) {bottom-=1;} [x as i64,if bottom<y as i64 {bottom} else {y as i64+1}]} else {return Err(invalid("transition template must span two cells"));};
        if extra[0]>=0 && extra[1]>=0 && extra[0]<size[0] as i64 && extra[1]<size[1] as i64 {let extra=values(t,extra[0] as u32,extra[1] as u32); if extra.iter().any(|v|*v!=extra[0]) {continue;}}
        place(&mut cliffs,&mut occupied,size,[x,y],base,texture,template,left,bottom,c)?;
    }}
    for y in 0..size[1] {check(c.cancel)?; for x in 0..size[0] {let v=values(t,x,y); if occupied[(y*size[0]+x) as usize]!=usize::MAX || entrances[(y*size[0]+x) as usize] || v.iter().all(|n|*n==v[0]) {continue;} let base=*v.iter().min().unwrap(); let texture=skin(t,defs,x,y)?; let pattern=v.map(|v|b'A'+v-base); let variation=t.corner(x,y).unwrap().variation>>5; let template=c.resolve(&defs[texture].family,pattern,variation)?.ok_or_else(||invalid(format!("unsupported source cliff pattern at {x},{y}")))?;
        if c.templates[template].span!=[1,1] {return Err(invalid("ordinary cliff template must occupy one cell"));} place(&mut cliffs,&mut occupied,size,[x,y],base,texture,template,x as i64,y as i64,c)?;
    }}
    let mut textures=array(n,&mut c.layout)?;
    for y in 0..height {check(c.cancel)?; for x in 0..width {let mut texture=None;
        'neighbor: for cy in y.saturating_sub(1)..=y.min(size[1]-1) {for cx in x.saturating_sub(1)..=x.min(size[0]-1) {let slot=occupied[(cy*size[0]+cx) as usize]; if slot!=usize::MAX {let ground=defs[cliffs[slot].texture as usize].ground; texture=Some(t.ground_tilesets().iter().position(|id|*id==ground).unwrap_or(0) as u8); break 'neighbor;}}}
        let corner=t.corner(x,y).unwrap(); let texture=texture.unwrap_or_else(||if corner.is_blight() {t.ground_tilesets().len() as u8} else {corner.ground_texture()}); if !corner.is_blight() && texture as usize>=t.ground_tilesets().len() {return Err(invalid("ground texture outside tileset"));} textures.push(texture);
    }}
    let ground_count=occupied.iter().filter(|n|**n==usize::MAX).count(); let mut ground=array(ground_count,&mut c.layout)?; let mut normals=filled(n,[0.;3],&mut c.layout)?;
    for y in 0..size[1] {check(c.cancel)?; for x in 0..size[0] {if occupied[(y*size[0]+x) as usize]!=usize::MAX {continue;} let corners=ids(width,x,y); let points=corners.map(|i|Vec3::new((i%width) as f32,surface_heights[i as usize],-((i/width) as f32)));
        for [a,b,d] in [[0,3,1],[1,3,2]] {let normal=(points[b]-points[a]).cross(points[d]-points[a]); for at in [a,b,d] {let index=corners[at] as usize; normals[index]=(Vec3::from_array(normals[index])+normal).to_array();}}
        ground.push(WarcraftGroundTile {cell:[x,y],corners,textures:corners.map(|i|textures[i as usize]),variation:t.corner(x,y).unwrap().variation&31});
    }}
    for normal in &mut normals {*normal=Vec3::from_array(*normal).try_normalize().unwrap_or(Vec3::Y).to_array();}
    let mut raised_corners=array(raised.iter().filter(|v|**v).count(),&mut c.layout)?; for (i,v) in raised.into_iter().enumerate() {if v {raised_corners.push(i as u32);}}
    let mut ramp_entrances=array(entrances.iter().filter(|v|**v).count(),&mut c.layout)?; for (i,v) in entrances.into_iter().enumerate() {if v {ramp_entrances.push([i as u32%size[0],i as u32/size[0]]);}}
    Ok(WarcraftTerrainLayout {ground,cliffs,ground_heights,surface_heights,normals,raised_corners,ramp_entrances})
}

pub(super) fn relief(t:&WarcraftMapTerrain,heights:&[f32],x:f32,y:f32)->f32 {let [w,h]=t.size(); let (x,y)=(x.clamp(0.,(w-1) as f32),y.clamp(0.,(h-1) as f32)); let (ix,iy)=((x.floor() as u32).min(w-2),(y.floor() as u32).min(h-2)); let (u,v)=(x-ix as f32,y-iy as f32); let at=(iy*w+ix) as usize; (heights[at]*(1.-u)+heights[at+1]*u)*(1.-v)+(heights[at+w as usize]*(1.-u)+heights[at+w as usize+1]*u)*v}
