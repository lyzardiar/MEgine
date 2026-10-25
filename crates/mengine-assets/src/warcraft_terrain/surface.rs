// Author: MiYu. Compose source ground masks and build bounded mesh chunks with original cliff templates and continuous relief.
use super::*;

#[derive(Clone,Copy,Debug,PartialEq,Eq,Hash,serde::Serialize)]
pub struct WarcraftGroundLayers {layers:[(u8,u8);4],count:u8}
impl WarcraftGroundLayers {pub fn layers(&self)->&[(u8,u8)] {&self.layers[..self.count as usize]}}
pub fn warcraft_ground_layers(textures:[u8;4],variation:u8,extended:&[bool])->Result<WarcraftGroundLayers> {
    if variation>31 || textures.iter().any(|t|*t as usize>=extended.len()) {return Err(invalid("ground layer slot or variation outside source range"));}
    let mut sorted=textures; sorted.sort_unstable(); let mut layers=WarcraftGroundLayers {layers:[(0,0);4],count:0};
    for texture in sorted {if layers.count>0 && layers.layers[layers.count as usize-1].0==texture {continue;} let tile=if layers.count==0 {if extended[texture as usize] && variation<16 {16+variation} else if variation==16 || !extended[texture as usize] && variation!=0 {15} else {0}} else {textures.into_iter().zip([2,8,4,1]).filter(|(t,_)|*t==texture).map(|(_,bit)|bit).sum()}; layers.layers[layers.count as usize]=(texture,tile); layers.count+=1;} Ok(layers)
}

pub(super) fn atlas(ground:&[WarcraftGroundTile],textures:&[Arc<TextureRgba8>],c:&mut Compiler<'_>)->Result<(TextureRgba8,Vec<usize>)> {
    if textures.iter().any(|t|!matches!([t.width,t.height],[256,256]|[512,256])) {return Err(invalid("ground source atlas must be256x256 or512x256"));}
    let extended=textures.iter().map(|t|t.width==512).collect::<Vec<_>>(); let mut tiles=array(ground.len(),&mut c.layout)?; let mut lookup=HashMap::new(); let mut keys=Vec::new();
    for cell in ground {check(c.cancel)?; let key=warcraft_ground_layers(cell.textures,cell.variation,&extended)?; let tile=if let Some(tile)=lookup.get(&key) {*tile} else {if keys.len()>=c.limits.max_atlas_tiles {return Err(limit("too many composite ground tiles"));} c.layout.charge(160)?; let tile=keys.len(); keys.push(key); lookup.insert(key,tile); tile}; tiles.push(tile);}
    let columns=(keys.len().max(1) as f64).sqrt().ceil() as u32; let rows=(keys.len().max(1) as u32).div_ceil(columns); let width=columns.checked_mul(64).ok_or_else(||limit("atlas width overflow"))?; let height=rows.checked_mul(64).ok_or_else(||limit("atlas height overflow"))?; if width>8192 || height>8192 {return Err(limit("ground atlas exceeds native8192 texture limit"));}
    let count=(width as usize).checked_mul(height as usize).and_then(|n|n.checked_mul(4)).ok_or_else(||limit("atlas allocation overflow"))?; let mut pixels=filled(count,0u8,&mut c.textures)?;
    for (index,key) in keys.iter().enumerate() {check(c.cancel)?; let (dx,dy)=(index as u32%columns*64,index as u32/columns*64);
        for (layer,&(texture,tile)) in key.layers().iter().enumerate() {let source=&textures[texture as usize]; let (sx,sy)=if tile<16 {(tile as u32%4*64,tile as u32/4*64)} else {(4+(tile as u32-16)%4,(tile as u32-16)/4)}; let (sx,sy)=if tile<16 {(sx,sy)} else {(sx*64,sy*64)};
            for y in 0..64 {for x in 0..64 {let src=((sy+y)*source.width+sx+x) as usize*4; let dst=((dy+y)*width+dx+x) as usize*4; if layer==0 {pixels[dst..dst+3].copy_from_slice(&source.pixels[src..src+3]);} else {let alpha=source.pixels[src+3] as u32; for channel in 0..3 {pixels[dst+channel]=((source.pixels[src+channel] as u32*alpha+pixels[dst+channel] as u32*(255-alpha)+127)/255) as u8;}} pixels[dst+3]=255;}}
        }
    }
    Ok((TextureRgba8 {width,height,pixels},tiles))
}

struct Plan {cell:[u32;2],material:WarcraftTerrainMaterial,vertices:usize,indices:usize}
fn plan(plans:&mut Vec<Plan>,lookup:&mut HashMap<([u32;2],WarcraftTerrainMaterial),usize>,cell:[u32;2],material:WarcraftTerrainMaterial,vertices:usize,indices:usize,limits:WarcraftTerrainLimits,budget:&mut Budget)->Result<()> {
    let chunk=cell.map(|n|n/limits.chunk_size); let key=(chunk,material); let index=if let Some(index)=lookup.get(&key) {*index} else {if plans.len()>=limits.max_chunks {return Err(limit("too many terrain chunks"));} budget.charge(std::mem::size_of::<Plan>()*2+160)?; let index=plans.len(); plans.push(Plan {cell:chunk,material,vertices:0,indices:0}); lookup.insert(key,index); index}; let p=&mut plans[index];
    p.vertices=p.vertices.checked_add(vertices).filter(|n|*n<=u32::MAX as usize).ok_or_else(||limit("chunk vertex index overflow"))?; p.indices=p.indices.checked_add(indices).ok_or_else(||limit("chunk index count overflow"))?; Ok(())
}
fn append(mesh:&mut MeshData,points:impl Iterator<Item=[f32;3]>,normals:&[[f32;3]],uvs:&[[f32;2]],indices:&[u32])->Result<()> {let start=mesh.positions.len() as u32; for p in points {if p.iter().any(|n|!n.is_finite()) {return Err(invalid("non-finite compiled terrain position"));} mesh.positions.push(p);} mesh.normals.extend_from_slice(normals); mesh.uvs.extend_from_slice(uvs); mesh.indices.extend(indices.iter().map(|i|start+*i)); Ok(())}

pub(super) fn meshes(t:&WarcraftMapTerrain,layout:&WarcraftTerrainLayout,templates:&[Template],tiles:&[usize],atlas:&TextureRgba8,water:Option<&WarcraftWater>,limits:WarcraftTerrainLimits,cancel:&WarcraftMapCancelToken)->Result<Vec<WarcraftTerrainChunk>> {
    let mut budget=Budget(limits.max_mesh_bytes); let mut plans=vec![]; let mut lookup=HashMap::new();
    for cell in &layout.ground {check(cancel)?; plan(&mut plans,&mut lookup,cell.cell,WarcraftTerrainMaterial::Ground,4,6,limits,&mut budget)?;}
    for cell in &layout.cliffs {check(cancel)?; let m=&templates[cell.template].mesh; plan(&mut plans,&mut lookup,cell.cell,WarcraftTerrainMaterial::Cliff(cell.texture),m.positions.len(),m.indices.len(),limits,&mut budget)?;}
    if let Some(water)=water {for &cell in &water.tiles {check(cancel)?; plan(&mut plans,&mut lookup,cell,WarcraftTerrainMaterial::Water,4,6,limits,&mut budget)?;}}
    let mut chunks=array(plans.len(),&mut budget)?; for p in plans {chunks.push(WarcraftTerrainChunk {cell:p.cell,material:p.material,mesh:MeshData {positions:array(p.vertices,&mut budget)?,normals:array(p.vertices,&mut budget)?,uvs:array(p.vertices,&mut budget)?,indices:array(p.indices,&mut budget)?}});}
    let origin=t.origin().map(|v|v/128.); let width=t.size()[0]; let columns=atlas.width/64;
    for (cell,tile) in layout.ground.iter().zip(tiles) {check(cancel)?; let chunk=lookup[&(cell.cell.map(|n|n/limits.chunk_size),WarcraftTerrainMaterial::Ground)]; let points=cell.corners.map(|i|[origin[0]+(i%width) as f32,layout.surface_heights[i as usize],-origin[1]-(i/width) as f32]); let normals=cell.corners.map(|i|layout.normals[i as usize]); let tile=*tile as u32; let (tx,ty)=((tile%columns*64) as f32+0.5,(tile/columns*64) as f32+0.5); let uv=[[0.,1.],[0.,0.],[1.,0.],[1.,1.]].map(|[u,v]|[(tx+u*63.)/atlas.width as f32,(ty+v*63.)/atlas.height as f32]); append(&mut chunks[chunk].mesh,points.into_iter(),&normals,&uv,&[0,3,1,1,3,2])?;}
    for cell in &layout.cliffs {check(cancel)?; let chunk=lookup[&(cell.cell.map(|n|n/limits.chunk_size),WarcraftTerrainMaterial::Cliff(cell.texture))]; let mesh=&templates[cell.template].mesh; let points=mesh.positions.iter().map(|&[x,h,z]|{let (gx,gy)=(cell.anchor[0] as f32+x,cell.anchor[1] as f32-z); [origin[0]+gx,h+cell.base_layer as f32-2.+layout::relief(t,&layout.ground_heights,gx,gy),-origin[1]-gy]}); append(&mut chunks[chunk].mesh,points,&mesh.normals,&mesh.uvs,&mesh.indices)?;}
    if let Some(water)=water {for &cell in &water.tiles {check(cancel)?; let [x,y]=cell; let ids=[y*width+x,(y+1)*width+x,(y+1)*width+x+1,y*width+x+1]; let chunk=lookup[&(cell.map(|n|n/limits.chunk_size),WarcraftTerrainMaterial::Water)]; let points=ids.map(|i|[origin[0]+(i%width) as f32,water.heights[i as usize],-origin[1]-(i/width) as f32]); let uvs=ids.map(|i|[(water.heights[i as usize]-layout.surface_heights[i as usize]).max(0.),0.]); append(&mut chunks[chunk].mesh,points.into_iter(),&[[0.,1.,0.];4],&uvs,&[0,3,1,1,3,2])?;}}
    Ok(chunks)
}

pub(super) fn ground_shader(size:[u32;2])->String {
    format!(r#"/* MENGINE_PARAMETERS
{{"textures":[{{"name":"ground","type":"color","default":""}}]}}
*/
// Author: MiYu. Clamp each ground tile independently through mip6.
fn source_ground_level(uv:vec2<f32>,level:f32) -> vec4<f32> {{
    let size=vec2<f32>({}.0,{}.0);let tile=floor(uv*size/64.0)*64.0;
    let local=(uv*size-tile-vec2<f32>(0.5))*(64.0/63.0);let margin=vec2<f32>(0.5*exp2(level));
    let pixel=tile+clamp(local,margin,vec2<f32>(64.0)-margin);
    return textureSampleLevel(mengine_custom_texture_0,material_sampler,pixel/size,level);
}}
fn mengine_lit_surface_hook(surface:MEngineSurface,uv:vec2<f32>,world_position:vec3<f32>) -> MEngineSurface {{
    let pixel=uv*vec2<f32>({}.0,{}.0)*(64.0/63.0);let dx=dpdx(pixel);let dy=dpdy(pixel);
    let lod=clamp(0.5*log2(max(max(dot(dx,dx),dot(dy,dy)),0.000001)),0.0,6.0);
    let lower=floor(lod);let upper=min(lower+1.0,6.0);let a=source_ground_level(uv,lower);
    var color=a;if lod!=lower {{color=mix(a,source_ground_level(uv,upper),lod-lower);}}
    var s=surface;s.base_color=color.rgb;s.alpha=1.0;return s;
}}
"#,size[0],size[1],size[0],size[1])
}
