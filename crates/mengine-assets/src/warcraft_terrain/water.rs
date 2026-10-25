// Author: MiYu. Compile W3E water, source Water.slk colors and animated BLP frames without exporting runtime assets.
use super::*;

#[derive(Clone,Debug,serde::Serialize)]
pub struct WarcraftWaterSettings {pub height:f32,pub frame_count:u32,pub frame_rate:f32,pub cells:f32,pub colors:[[f32;4];4]}
pub struct WarcraftWater {pub atlas:TextureRgba8,pub depth:TextureRgba8,pub settings:WarcraftWaterSettings,pub heights:Vec<f32>,pub tiles:Vec<[u32;2]>,origin:[f32;2],frame_size:u32}
impl WarcraftWater {
    pub fn frame_at(&self,elapsed_ms:u64)->u32 {((elapsed_ms as f64*self.settings.frame_rate as f64/1000.).floor()%self.settings.frame_count as f64) as u32}
    pub fn shader(&self)->String {shader(self)}
}
fn number(table:&slk::Table,row:&str,column:&str,min:f32,max:f32)->Result<f32> {let v=table.get(row,column)?.parse::<f32>().map_err(|_|invalid(format!("invalid water field {column}")))?; if !v.is_finite() || v<min || v>max {return Err(invalid(format!("water field outside supported range: {column}")));} Ok(v)}
pub(super) fn compile(t:&WarcraftMapTerrain,layout:&WarcraftTerrainLayout,c:&mut Compiler<'_>)->Result<Option<WarcraftWater>> {
    let [width,height]=t.size(); let mut count=0usize; for y in 0..height-1 {check(c.cancel)?; for x in 0..width-1 {if wet(t,x,y) {count+=1;}}} if count==0 {return Ok(None);}
    let bytes=c.read("TerrainArt/Water.slk",false)?; let table=slk::Table::parse(&bytes.bytes,&mut c.layout,c.cancel)?; let row=format!("{}Sha",t.tileset() as char); let frames=number(&table,&row,"numTex",1.,128.)?; if frames.fract()!=0. {return Err(invalid("water frame count must be integral"));}
    let mut colors=[[0.;4];4]; for (color,prefix) in colors.iter_mut().zip(["Smin","Smax","Dmin","Dmax"]) {for (value,channel) in color.iter_mut().zip(["R","G","B","A"]) {*value=number(&table,&row,&format!("{prefix}_{channel}"),0.,255.)?/255.;}}
    let settings=WarcraftWaterSettings {height:number(&table,&row,"height",-4096.,4096.)?,frame_count:frames as u32,frame_rate:number(&table,&row,"texRate",0.,1000.)?,cells:number(&table,&row,"cells",1./1024.,4096.)?,colors};
    let path=table.get(&row,"texFile")?; if path.is_empty() || path.len()>4086 {return Err(limit("water frame path exceeds limit"));} c.layout.charge(path.len())?; let path=path.to_owned();
    let first=c.texture(&format!("{path}00.blp"))?; let size=first.width; if size==0 || !size.is_power_of_two() || first.height!=size || size>1024 {return Err(invalid("water frame must be square power-of-two up to1024"));}
    let atlas_size=[size*8,size*settings.frame_count.div_ceil(8)]; if atlas_size[0]>8192 || atlas_size[1]>8192 {return Err(limit("water atlas exceeds8192 texture limit"));} let mut pixels=filled(atlas_size[0] as usize*atlas_size[1] as usize*4,0u8,&mut c.textures)?;
    for frame in 0..settings.frame_count {check(c.cancel)?; let image=if frame==0 {first.clone()} else {c.texture(&format!("{path}{frame:02}.blp"))?}; if [image.width,image.height]!=[size,size] {return Err(invalid("water frame dimensions differ"));} for y in 0..size {let from=y as usize*size as usize*4; let to=((frame/8*size+y)*atlas_size[0]+frame%8*size) as usize*4; pixels[to..to+size as usize*4].copy_from_slice(&image.pixels[from..from+size as usize*4]);}}
    let n=layout.surface_heights.len(); let mut heights=array(n,&mut c.layout)?; let mut depth=filled(n.checked_mul(4).ok_or_else(||limit("water depth size overflow"))?,0u8,&mut c.textures)?; let mut tiles=array(count,&mut c.layout)?;
    for y in 0..height {check(c.cancel)?; for x in 0..width {let index=(y*width+x) as usize; let h=t.corner(x,y).unwrap().water_height()+settings.height; let value=(h-layout.surface_heights[index]).max(0.); if !h.is_finite() || !value.is_finite() {return Err(invalid("non-finite compiled water height or depth"));} heights.push(h); depth[index*4..index*4+4].copy_from_slice(&value.to_le_bytes());}}
    for y in 0..height-1 {check(c.cancel)?; for x in 0..width-1 {if wet(t,x,y) {tiles.push([x,y]);}}}
    Ok(Some(WarcraftWater {atlas:TextureRgba8 {width:atlas_size[0],height:atlas_size[1],pixels},depth:TextureRgba8 {width,height,pixels:depth},settings,heights,tiles,origin:t.origin().map(|n|n/128.),frame_size:size}))
}
fn wet(t:&WarcraftMapTerrain,x:u32,y:u32)->bool {[t.corner(x,y),t.corner(x,y+1),t.corner(x+1,y+1),t.corner(x+1,y)].iter().any(|c|c.unwrap().has_water())}
fn vec4(v:[f32;4])->String {format!("vec4<f32>({:?},{:?},{:?},{:?})",v[0],v[1],v[2],v[3])}
fn shader(w:&WarcraftWater)->String {
    let size=w.frame_size; let max_mip=size.ilog2(); let [ox,oy]=w.origin; let cells=w.settings.cells; let frames=w.settings.frame_count; let colors=w.settings.colors;
    format!(r#"/* MENGINE_PARAMETERS
{{"parameters":[{{"name":"water_time","type":"vector4","default":[0,0,0,0]}}],"textures":[{{"name":"water","type":"color","default":""}},{{"name":"water_depth","type":"data","default":""}}]}}
*/
// Author: MiYu. Repeat bilinear taps inside one source frame through its last isolated mip.
fn source_water_level(frame:u32,local:vec2<f32>,level:f32) -> vec4<f32> {{
    let n=i32({size}u>>u32(level));let origin=vec2<i32>(i32(frame%8u),i32(frame/8u))*n;
    if n==1 {{return textureLoad(mengine_custom_texture_0,origin,i32(level));}}
    let pixel=local*f32(n)-vec2<f32>(0.5);let lo=vec2<i32>(floor(pixel));let f=fract(pixel);
    let wrapped=((lo%vec2<i32>(n))+vec2<i32>(n))%vec2<i32>(n);
    if all(wrapped+vec2<i32>(1)<vec2<i32>(n)) {{let uv=(vec2<f32>(origin+wrapped)+f+vec2<f32>(0.5))/vec2<f32>(textureDimensions(mengine_custom_texture_0,u32(level)));return textureSampleLevel(mengine_custom_texture_0,material_sampler,uv,level);}}
    let a=origin+wrapped;let b=origin+(wrapped+vec2<i32>(1))%vec2<i32>(n);
    let sw=textureLoad(mengine_custom_texture_0,a,i32(level));let se=textureLoad(mengine_custom_texture_0,vec2<i32>(b.x,a.y),i32(level));
    let nw=textureLoad(mengine_custom_texture_0,vec2<i32>(a.x,b.y),i32(level));let ne=textureLoad(mengine_custom_texture_0,b,i32(level));return mix(mix(sw,se,f.x),mix(nw,ne,f.x),f.y);
}}
fn source_water_sample(frame:u32,local:vec2<f32>,lod:f32) -> vec4<f32> {{
    let level=clamp(lod,0.0,{max_mip}.0);let lower=floor(level);let a=source_water_level(frame,local,lower);
    if level==lower {{return a;}}return mix(a,source_water_level(frame,local,lower+1.0),level-lower);
}}
fn source_water_tint(cell:vec2<i32>) -> vec4<f32> {{
    let packed=vec4<u32>(textureLoad(mengine_custom_texture_1,clamp(cell,vec2<i32>(0),vec2<i32>({max_x},{max_y})),0)*255.0+vec4<f32>(0.5));
    let depth=clamp(bitcast<f32>(packed.r|(packed.g<<8u)|(packed.b<<16u)|(packed.a<<24u)),0.0,1.0);
    if depth<=0.5 {{return mix({smin},{smax},clamp((depth-0.078125)/0.421875,0.0,1.0));}}return mix({dmin},{dmax},clamp((depth-0.5)/0.0625,0.0,1.0));
}}
fn mengine_lit_surface_hook(surface:MEngineSurface,uv:vec2<f32>,world_position:vec3<f32>) -> MEngineSurface {{
    var s=surface;let frame=u32(max(0.0,mengine_param_water_time().x))%{frames}u;
    let lattice=(vec2<f32>(world_position.x,-world_position.z)-vec2<f32>({ox:?},{oy:?}))/{cells:?};let local=vec2<f32>(lattice.x,-lattice.y);
    let dx=dpdx(lattice)*{size}.0;let dy=dpdy(lattice)*{size}.0;let lod=0.5*log2(max(max(dot(dx,dx),dot(dy,dy)),0.000001));let pixel=source_water_sample(frame,local,lod);
    let grid=lattice*{cells:?};let cell=vec2<i32>(floor(grid));let f=fract(grid);
    let sw=source_water_tint(cell);let nw=source_water_tint(cell+vec2<i32>(0,1));let ne=source_water_tint(cell+vec2<i32>(1,1));let se=source_water_tint(cell+vec2<i32>(1,0));
    var tint=sw*(1.0-f.x-f.y)+se*f.x+nw*f.y;if f.x+f.y>1.0 {{tint=ne*(f.x+f.y-1.0)+nw*(1.0-f.x)+se*(1.0-f.y);}}
    s.base_color=pixel.rgb*pow(tint.rgb,vec3<f32>(2.2));s.alpha=pixel.a*tint.a;s.roughness=0.4;s.metallic=0.0;return s;
}}
"#,max_x=w.depth.width-1,max_y=w.depth.height-1,smin=vec4(colors[0]),smax=vec4(colors[1]),dmin=vec4(colors[2]),dmax=vec4(colors[3]))
}
