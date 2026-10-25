// Author: MiYu. Check source topology, compositing, SYLK records and bounded native terrain compilation with authored data.
use super::*;
use crate::{AssetByteCache,AssetByteSource,AssetSourceId,AssetSourceRead,WarcraftMapLimits};
use std::sync::Arc;

fn terrain(size:[u32;2],edit:impl Fn(u32,u32,&mut[u8;7]))->WarcraftMapTerrain {
    let mut b=b"W3E!".to_vec(); b.extend(11i32.to_le_bytes()); b.push(b'L'); b.extend(0i32.to_le_bytes()); b.extend(1i32.to_le_bytes()); b.extend(b"Ldrt"); b.extend(2i32.to_le_bytes()); b.extend(b"CLdiCLgr"); for n in size {b.extend(n.to_le_bytes());} b.extend((-256f32).to_le_bytes()); b.extend((-128f32).to_le_bytes());
    for y in 0..size[1] {for x in 0..size[0] {let mut c=[0,32,0,32,0,0,2]; edit(x,y,&mut c); b.extend(c);}} WarcraftMapTerrain::parse(b.into(),WarcraftMapLimits::default()).unwrap()
}
fn compiler<'a>(mounts:&'a AssetMounts,cancel:&'a WarcraftMapCancelToken)->Compiler<'a> {Compiler {mounts,cancel,limits:WarcraftTerrainLimits::default(),layout:Budget(128*1024*1024),textures:Budget(128*1024*1024),templates_budget:Budget(32*1024*1024),templates:vec![],patterns:HashMap::new(),resources:vec![],decoded:HashMap::new()}}
fn mounts()->AssetMounts {AssetMounts::new(vec![],Arc::new(AssetByteCache::default()))}
fn defs()->Vec<CliffDef> {(0..2).map(|_|CliffDef {family:"Cliffs".into(),ramp:"CliffTrans".into(),ground:*b"Ldrt",texture:"cliff.blp".into()}).collect()}
fn mesh(span:[u32;2])->MeshData {MeshData {positions:vec![[-(span[0] as f32),0.,0.],[0.,1.,-(span[1] as f32)],[0.,0.,0.]],normals:vec![[0.,1.,0.];3],uvs:vec![[0.,0.],[1.,1.],[1.,0.]],indices:vec![0,2,1]}}
fn patterns(c:&mut Compiler<'_>) {
    for code in 0..81 {let mut n=code; let mut pattern=[b'A';4]; for v in &mut pattern {*v+=n%3; n/=3;} if pattern.iter().all(|v|*v==pattern[0]) {continue;} let name=std::str::from_utf8(&pattern).unwrap(); let slot=c.templates.len(); c.patterns.insert(format!("Cliffs/{name}"),Pattern {variants:vec![slot,slot+1],complete:true}); for variation in 0..2 {c.templates.push(Template {member:format!("Cliffs{name}{variation}.mdx"),span:[1,1],mesh:mesh([1,1])});}}
    for (pattern,span) in [("AAHL",[1,2]),("AALH",[1,2]),("AHLA",[2,1]),("ALHA",[2,1]),("HAAL",[2,1]),("LAAH",[2,1]),("HLAA",[1,2]),("LHAA",[1,2])] {c.patterns.insert(format!("CliffTrans/{pattern}"),Pattern {variants:vec![c.templates.len()],complete:true}); c.templates.push(Template {member:format!("CliffTrans{pattern}0.mdx"),span,mesh:mesh(span)});}
}

#[test]
fn native_warcraft_terrain_flat_non_square_relief_and_cliff_normals() {
    let mounts=mounts(); let cancel=WarcraftMapCancelToken::default(); let mut c=compiler(&mounts,&cancel);
    let t=terrain([9,4],|x,y,b|{let h=8192+x as u16*128+y as u16*64; b[..2].copy_from_slice(&h.to_le_bytes());}); let l=layout::compile(&t,&defs(),&mut c).unwrap(); assert_eq!(l.ground.len(),24); assert!(l.cliffs.is_empty()); assert_eq!(l.ground.last().unwrap().corners,[25,34,35,26]); let expected=glam::Vec3::new(-0.25,1.,0.125).normalize(); for n in &l.normals {assert!((glam::Vec3::from_array(*n)-expected).length()<1e-6);}
    let mut c=compiler(&mounts,&cancel); patterns(&mut c); let t=terrain([6,6],|x,_,b|if x>=3 {b[6]=3;}); let l=layout::compile(&t,&defs(),&mut c).unwrap(); assert!(!l.cliffs.is_empty()); for cell in &l.ground {for id in cell.corners {assert_eq!(l.normals[id as usize],[0.,1.,0.]);}}
}

#[test]
fn native_warcraft_terrain_transition_occupancy_in_all_directions() {
    let mounts=mounts(); let cancel=WarcraftMapCancelToken::default();
    for (pattern,want_anchor,want_span) in [("AAHL",[3,1],[1,2]),("AALH",[3,2],[1,2]),("AHLA",[4,2],[2,1]),("ALHA",[3,2],[2,1]),("HAAL",[4,2],[2,1]),("LAAH",[3,2],[2,1]),("HLAA",[3,2],[1,2]),("LHAA",[3,1],[1,2])] {
        let t=terrain([6,6],|x,y,b|{if let Some(i)=[[2,2],[2,3],[3,3],[3,2]].iter().position(|p|*p==[x,y]) {let v=pattern.as_bytes()[i]; b[6]=if matches!(v,b'B'|b'H') {3} else {2}; b[4]=if matches!(v,b'L'|b'H') {16} else {0};}}); let mut c=compiler(&mounts,&cancel); patterns(&mut c); let l=layout::compile(&t,&defs(),&mut c).unwrap(); let p=l.cliffs.iter().find(|p|p.cell==[2,2]).unwrap(); assert_eq!(p.anchor,want_anchor,"{pattern}"); assert_eq!(p.span,want_span); assert_eq!(p.member,format!("CliffTrans{pattern}0.mdx"));
        let mut covered=HashMap::new(); for p in &l.cliffs {for y in p.anchor[1]..p.anchor[1]+p.span[1] {for x in p.anchor[0]-p.span[0]..p.anchor[0] {assert!(covered.insert([x,y],()).is_none());}}} for g in &l.ground {assert!(!covered.contains_key(&g.cell));} assert_eq!(covered.len()+l.ground.len(),25);
    }
}

#[test]
fn native_warcraft_terrain_ramp_shared_heights_variants_and_blight() {
    let mounts=mounts(); let cancel=WarcraftMapCancelToken::default(); let mut c=compiler(&mounts,&cancel); patterns(&mut c);
    let t=terrain([6,6],|x,y,b|{if let Some(i)=[[2,2],[2,3],[3,3],[3,2]].iter().position(|p|*p==[x,y]) {b[6]=[3,2,2,3][i]; b[4]=16;}}); let l=layout::compile(&t,&defs(),&mut c).unwrap(); assert!(l.ramp_entrances.contains(&[2,2])); assert_eq!([14,20,21,15].map(|i|l.surface_heights[i]),[1.,0.5,0.5,1.]); assert!(l.ground.iter().any(|g|g.cell==[2,2])); assert!(l.cliffs.iter().all(|p|p.cell!=[2,2]));
    let mut c=compiler(&mounts,&cancel); patterns(&mut c); let t=terrain([6,6],|x,y,b|{if x==3 && y==2 {b[6]=3;} if x==2 && y==2 {b[5]=7<<5;}}); let l=layout::compile(&t,&defs(),&mut c).unwrap(); assert!(l.cliffs.iter().find(|p|p.cell==[2,2]).unwrap().member.ends_with("1.mdx"));
    let t=terrain([3,2],|x,y,b|if x==0 && y==0 {b[4]=32;}); let l=layout::compile(&t,&defs(),&mut c).unwrap(); assert_eq!(l.ground[0].textures[0],1);
    let t=terrain([3,2],|_,_,b|b[4]=1); assert!(layout::compile(&t,&defs(),&mut c).is_err());
}

#[test]
fn native_warcraft_terrain_ground_layers_and_alpha_compositing() {
    for variation in 0..32 {assert_eq!(warcraft_ground_layers([0;4],variation,&[true]).unwrap().layers(),&[(0,if variation<16 {16+variation} else if variation==16 {15} else {0})]); assert_eq!(warcraft_ground_layers([0;4],variation,&[false]).unwrap().layers(),&[(0,if variation==0 {0} else {15})]);}
    assert_eq!(warcraft_ground_layers([0,1,2,3],0,&[false;4]).unwrap().layers(),&[(0,0),(1,8),(2,4),(3,1)]); assert_eq!(warcraft_ground_layers([1,0,0,0],0,&[false;2]).unwrap().layers(),&[(0,0),(1,2)]); assert!(warcraft_ground_layers([2;4],0,&[false]).is_err()); assert!(warcraft_ground_layers([0;4],32,&[true]).is_err());
    let mounts=mounts(); let cancel=WarcraftMapCancelToken::default(); let mut c=compiler(&mounts,&cancel); let images=[[100,0,0,0],[0,0,200,128]].map(|pixel|Arc::new(TextureRgba8 {width:256,height:256,pixels:pixel.repeat(256*256)})); let ground=[WarcraftGroundTile {cell:[0,0],corners:[0,1,2,3],textures:[0,1,1,1],variation:0}]; let (atlas,tiles)=surface::atlas(&ground,&images,&mut c).unwrap(); assert_eq!(tiles,[0]); assert_eq!((atlas.width,atlas.height),(64,64)); assert!(atlas.pixels.chunks_exact(4).all(|p|p==[50,0,100,255]));
}

#[test]
fn native_warcraft_terrain_sylk_quotes_coordinates_duplicates_and_limits() {
    let cancel=WarcraftMapCancelToken::default(); let bytes=b"ID;PWXL\nC;X1;Y1;K\"id\"\nC;X2;K\"field\"\nC;X1;Y2;K\"A\"\nC;X2;K\"a;b\"\"c\"\n"; let t=slk::Table::parse(bytes,&mut Budget(65536),&cancel).unwrap(); assert_eq!(t.get("A","field").unwrap(),"a;b\"c"); assert!(t.get("missing","field").is_err());
    for b in [&b"ID;P\nC;X0;Y1;K1\n"[..],b"ID;P\nC;X513;Y1;K1\n",b"ID;P\nC;X1;Y1;K\"x\n",b"ID;P\nC;X1;Y1;K\"x\"\nC;K\"y\"\n",b"ID;P\nC;X1;Y1;K\"x\";K\"y\"\n",b"invalid",b"\xff"] {assert!(slk::Table::parse(b,&mut Budget(65536),&cancel).is_err());}
    assert!(matches!(slk::Table::parse(bytes,&mut Budget(1),&cancel),Err(WarcraftMapError::Limit {..}))); cancel.cancel(); assert!(matches!(slk::Table::parse(bytes,&mut Budget(65536),&cancel),Err(WarcraftMapError::Cancelled)));
}

struct MemorySource {id:AssetSourceId,files:HashMap<String,Arc<[u8]>>}
impl AssetByteSource for MemorySource {fn identity(&self)->AssetSourceId {self.id} fn read(&self,member:&str)->std::result::Result<AssetSourceRead,AssetError> {Ok(self.files.get(member).map(|v|AssetSourceRead::Bytes(v.clone())).unwrap_or(AssetSourceRead::Missing))}}
fn memory_mounts()->AssetMounts {
    fn png(pixel:[u8;4])->Vec<u8> {let image=image::RgbaImage::from_pixel(256,256,image::Rgba(pixel)); let mut out=std::io::Cursor::new(Vec::new()); image.write_to(&mut out,image::ImageFormat::Png).unwrap(); out.into_inner()}
    let ground=b"ID;P\nC;X1;Y1;K\"tileID\"\nC;X2;K\"dir\"\nC;X3;K\"file\"\nC;X1;Y2;K\"Ldrt\"\nC;X2;K\"tex\"\nC;X3;K\"ground\"\n".to_vec();
    let cliff=b"ID;P\nC;X1;Y1;K\"id\"\nC;X2;K\"cliffModelDir\"\nC;X3;K\"rampModelDir\"\nC;X4;K\"groundTile\"\nC;X5;K\"texDir\"\nC;X6;K\"texFile\"\nC;X1;Y2;K\"CLdi\"\nC;X2;K\"Cliffs\"\nC;X3;K\"CliffTrans\"\nC;X4;K\"Ldrt\"\nC;X5;K\"tex\"\nC;X6;K\"cliff\"\nC;X1;Y3;K\"CLgr\"\nC;X2;K\"Cliffs\"\nC;X3;K\"CliffTrans\"\nC;X4;K\"Ldrt\"\nC;X5;K\"tex\"\nC;X6;K\"cliff\"\n".to_vec();
    let mut files:HashMap<String,Arc<[u8]>>=[("terrainart/terrain.slk",ground),("terrainart/clifftypes.slk",cliff),("tex/ground.blp",png([10,20,30,0])),("tex/cliff.blp",png([40,50,60,255])),("terrainart/blight/lords_blight.blp",png([70,80,90,255]))].into_iter().map(|(k,v)|(k.into(),Arc::from(v))).collect(); files.extend(water_files(&[])); AssetMounts::new(vec![Arc::new(MemorySource {id:AssetSourceId::fresh(),files})],Arc::new(AssetByteCache::default()))
}

#[test]
fn native_warcraft_terrain_compiles_memory_assets_and_preflights_budgets() {
    let mounts=memory_mounts(); let cancel=WarcraftMapCancelToken::default(); let t=terrain([3,2],|_,_,_|{}); let compiled=WarcraftTerrain::compile(&t,&mounts,WarcraftTerrainLimits::default(),&cancel).unwrap(); assert_eq!(compiled.chunks.len(),1); assert_eq!(compiled.chunks[0].mesh.positions.len(),8); assert_eq!(compiled.chunks[0].mesh.indices.len(),12); assert_eq!(compiled.chunks[0].mesh.positions[0],[-2.,0.,1.]); assert_eq!(compiled.ground_atlas.pixels[..4],[10,20,30,255]); assert_eq!(compiled.resources.len(),5); assert_eq!(compiled.cliff_textures.len(),2); assert!(crate::parse_surface_shader(compiled.ground_shader().as_bytes()).is_ok());
    for limits in [WarcraftTerrainLimits {max_layout_bytes:1,..Default::default()},WarcraftTerrainLimits {max_mesh_bytes:1,..Default::default()},WarcraftTerrainLimits {max_texture_bytes:1,..Default::default()},WarcraftTerrainLimits {max_member_bytes:1,..Default::default()},WarcraftTerrainLimits {max_atlas_tiles:0,..Default::default()},WarcraftTerrainLimits {max_chunks:0,..Default::default()},WarcraftTerrainLimits {chunk_size:0,..Default::default()}] {assert!(WarcraftTerrain::compile(&t,&mounts,limits,&cancel).is_err());}
    cancel.cancel(); assert!(matches!(WarcraftTerrain::compile(&t,&mounts,WarcraftTerrainLimits::default(),&cancel),Err(WarcraftMapError::Cancelled)));
}

#[test]
fn native_warcraft_terrain_rejects_template_overlap_and_uses_original_relief() {
    let mounts=mounts(); let cancel=WarcraftMapCancelToken::default(); let mut c=compiler(&mounts,&cancel); patterns(&mut c); let mut occupied=vec![usize::MAX;25]; let mut cliffs=vec![]; place_test(&mut cliffs,&mut occupied,&mut c).unwrap(); assert!(place_test(&mut cliffs,&mut occupied,&mut c).is_err());
    let t=terrain([6,6],|_,_,_|{}); let heights=(0..6).flat_map(|y|(0..6).map(move|x|x as f32/4.+y as f32/8.)).collect::<Vec<_>>(); assert_eq!(layout::relief(&t,&heights,2.5,3.25),1.03125);
}
fn place_test(cliffs:&mut Vec<WarcraftCliffPlacement>,occupied:&mut[usize],c:&mut Compiler<'_>)->Result<()> {layout::place(cliffs,occupied,[5,5],[2,2],2,0,0,2,2,c)}

#[test]
fn native_warcraft_terrain_validates_derived_strings_before_copying() {
    let mut budget=Budget(32); assert!(source_path(&"x".repeat(4096),"ground",&mut budget).is_err()); assert_eq!(budget.0,32); assert!(family(&"x".repeat(65),&mut budget).is_err()); assert_eq!(budget.0,32); assert!(source_path("../outside","ground",&mut Budget(4096)).is_err()); assert!(source_path("tex","ground",&mut Budget(1)).is_err()); assert_eq!(source_path("TerrainArt\\Lords","Grass",&mut Budget(4096)).unwrap(),"terrainart/lords/grass.blp");
}

#[test]
fn native_warcraft_terrain_variant_requests_keep_loaded_templates_and_cache_the_missing_end() {
    let mounts=mounts(); let cancel=WarcraftMapCancelToken::default(); let mut c=compiler(&mounts,&cancel); c.templates.push(Template {member:"loaded0.mdx".into(),span:[1,1],mesh:mesh([1,1])}); c.patterns.insert("Cliffs/AAAB".into(),Pattern {variants:vec![0],complete:false});
    assert_eq!(c.resolve("Cliffs",*b"AAAB",0).unwrap(),Some(0)); assert!(!c.patterns["Cliffs/AAAB"].complete); assert_eq!(c.resolve("Cliffs",*b"AAAB",7).unwrap(),Some(0)); assert!(c.patterns["Cliffs/AAAB"].complete); assert_eq!(c.resolve("Cliffs",*b"AAAB",5).unwrap(),Some(0)); assert_eq!(c.templates.len(),1);
}

#[test]
fn native_warcraft_terrain_rejects_unrepresented_cliff_materials() {
    let layer=crate::MdxLayerPose {texture:0,filter:0,flags:0,texture_flags:0,material_flags:0,priority:0,alpha:1.,uv_set:0,uv:[1.,0.,0.,1.,0.,0.]};
    let g=crate::MdxGeosetPose {mesh:mesh([1,1]),geoset:0,material:0,alpha:1.,color:[1.;3],layers:vec![layer.clone()].into()}; let texture=crate::MdxTexture {path:String::new(),replaceable_id:11,flags:0}; assert!(cliff_material(&g,&[texture.clone()]).is_ok());
    for mode in 0..7 {let mut g=g.clone(); let mut layers=g.layers.to_vec(); let mut texture=texture.clone(); match mode {0=>layers.push(layer.clone()),1=>layers[0].uv_set=1,2=>layers[0].uv[4]=0.5,3=>g.alpha=0.5,4=>g.color[0]=0.5,5=>texture.replaceable_id=0,6=>layers[0].filter=2,_=>unreachable!()} g.layers=layers.into(); assert!(cliff_material(&g,&[texture]).is_err());}
    let mounts=memory_mounts(); let cancel=WarcraftMapCancelToken::default(); let t=terrain([3,2],|_,_,_|{}); let compiled=WarcraftTerrain::compile(&t,&mounts,WarcraftTerrainLimits::default(),&cancel).unwrap(); assert!(Arc::ptr_eq(&compiled.cliff_textures[0],&compiled.cliff_textures[1]));
}

fn water_files(overrides:&[(&str,&str)])->HashMap<String,Arc<[u8]>> {
    let mut fields=vec![("waterID".to_owned(),"LSha".to_owned()),("height".into(),"0.1".into()),("numTex".into(),"2".into()),("texRate".into(),"4".into()),("cells".into(),"3".into()),("texFile".into(),"water/frame".into())];
    for (i,prefix) in ["Smin","Smax","Dmin","Dmax"].into_iter().enumerate() {for (j,channel) in ["R","G","B","A"].into_iter().enumerate() {fields.push((format!("{prefix}_{channel}"),(10+i*40+j*10).to_string()));}}
    for &(key,value) in overrides {fields.iter_mut().find(|(k,_)|k==key).unwrap().1=value.into();} let mut slk=String::from("ID;P\n"); for (i,(key,value)) in fields.iter().enumerate() {slk.push_str(&format!("C;X{};Y1;K\"{key}\"\nC;Y2;K\"{value}\"\n",i+1));}
    let mut files=HashMap::new(); files.insert("terrainart/water.slk".into(),Arc::from(slk.into_bytes()));
    for (i,pixel) in [[8,16,32,128],[64,96,128,192]].into_iter().enumerate() {let image=image::RgbaImage::from_pixel(16,16,image::Rgba(pixel)); let mut bytes=std::io::Cursor::new(Vec::new()); image.write_to(&mut bytes,image::ImageFormat::Png).unwrap(); files.insert(format!("water/frame{i:02}.blp"),Arc::from(bytes.into_inner()));} files
}

#[test]
fn native_warcraft_water_source_heights_depth_frames_and_chunk_budget() {
    let mounts=memory_mounts(); let cancel=WarcraftMapCancelToken::default(); let t=terrain([3,2],|x,y,b|if x==0 && y==0 {b[4]=64; b[2..4].copy_from_slice(&0xe100u16.to_le_bytes());}); let compiled=WarcraftTerrain::compile(&t,&mounts,WarcraftTerrainLimits::default(),&cancel).unwrap(); let water=compiled.water.as_ref().unwrap(); assert_eq!(water.tiles,[[0,0]]); assert_eq!(water.heights[0],0.6); assert_eq!(&water.depth.pixels[..4],&0.6f32.to_le_bytes()); assert_eq!([water.atlas.width,water.atlas.height],[128,16]); assert_eq!(water.atlas.pixels[..4],[8,16,32,128]); assert_eq!(water.atlas.pixels[64..68],[64,96,128,192]); assert_eq!(water.settings.colors[0],[10./255.,20./255.,30./255.,40./255.]);
    for (ms,expected) in [(0,0),(249,0),(250,1),(499,1),(500,0)] {assert_eq!(water.frame_at(ms),expected);} let mesh=&compiled.chunks.iter().find(|c|c.material==WarcraftTerrainMaterial::Water).unwrap().mesh; assert_eq!(mesh.positions[0],[-2.,0.6,1.]); assert_eq!(mesh.uvs[0],[0.6,0.]); assert!(crate::parse_surface_shader(water.shader().as_bytes()).is_ok()); assert!(WarcraftTerrain::compile(&t,&mounts,WarcraftTerrainLimits {max_chunks:1,..Default::default()},&cancel).is_err());
}

#[test]
fn native_warcraft_water_rejects_bad_source_fields_and_cancellation() {
    for change in [("numTex","0"),("numTex","129"),("numTex","1.5"),("texRate","-1"),("texRate","NaN"),("cells","0"),("cells","1e-35"),("height","inf"),("Smin_A","256"),("texFile","../escape")] {
        let source=MemorySource {id:AssetSourceId::fresh(),files:water_files(&[change])}; let mounts=AssetMounts::new(vec![Arc::new(source)],Arc::new(AssetByteCache::default())); let cancel=WarcraftMapCancelToken::default(); let mut c=compiler(&mounts,&cancel); let t=terrain([3,2],|_,_,b|b[4]=64); let layout=layout::compile(&t,&defs(),&mut c).unwrap(); assert!(water::compile(&t,&layout,&mut c).is_err(),"{change:?}");
    }
    let mounts=memory_mounts(); let cancel=WarcraftMapCancelToken::default(); let mut c=compiler(&mounts,&cancel); let t=terrain([3,2],|_,_,b|b[4]=64); let layout=layout::compile(&t,&defs(),&mut c).unwrap(); c.textures=Budget(1); assert!(matches!(water::compile(&t,&layout,&mut c),Err(WarcraftMapError::Limit {..}))); cancel.cancel(); assert!(matches!(water::compile(&t,&layout,&mut c),Err(WarcraftMapError::Cancelled)));
}
