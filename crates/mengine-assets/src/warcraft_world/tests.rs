// Author: MiYu. Validate original placement transforms, variants, flags, preview animation choices and shared source lifetimes.
use super::*;
use crate::{AssetBytes,AssetByteCache,WarcraftDefinitionCache,WarcraftMapDoodad,WarcraftMapDoodads,WarcraftMapUnit,WarcraftMapUnits,WarcraftMapRandomPlacement};
use crate::warcraft_map::tests::{MemorySource,map_source,authored_session};
fn slk(headers:&[&str],rows:&[Vec<&str>])->Vec<u8> {let mut s=String::from("ID;P\n"); for (y,row) in std::iter::once(headers.to_vec()).chain(rows.iter().cloned()).enumerate() {for (x,v) in row.iter().enumerate() {s.push_str(&format!("C;X{};Y{};K\"{v}\"\n",x+1,y+1));}} s.into_bytes()}
fn seqs(clips:&[(&str,f32)])->Vec<u8> {let raw=crate::mdx::tests::fixture(); let at=raw.windows(4).position(|w|w==b"SEQS").unwrap(); let len=u32::from_le_bytes(raw[at+4..at+8].try_into().unwrap()) as usize; let mut out=raw[..at+4].to_vec(); out.extend((clips.len() as u32*132).to_le_bytes()); for (name,rarity) in clips {let mut b=vec![0;132]; b[..name.len()].copy_from_slice(name.as_bytes()); b[84..88].copy_from_slice(&1000i32.to_le_bytes()); b[96..100].copy_from_slice(&rarity.to_le_bytes()); out.extend(b);} out.extend(&raw[at+8+len..]); out}
fn common()->Arc<MemorySource> {let mut files=crate::warcraft_definitions::tests::files(); files.extend([
    ("doodads/doodads.slk",slk(&["id","file","numVar","vertR03","vertG03","vertB03","texID","texFile"],&[vec!["AOob","Rock.mdl","3","128","255","0","0","TRIGSTR_0001"]])),
    ("units/destructabledata.slk",slk(&["id","file","numVar","colorR","colorG","colorB"],&[vec!["ATtr","Tree.mdl","1","255","255","255"]])),
    ("units/unitui.slk",slk(&["id","file","modelScale","teamColor","red","green","blue"],&[vec!["hfoo","Footman.mdl","2","-1","128","255","255"]])),
    ("units/unitdata.slk",slk(&["id","moveHeight"],&[vec!["hfoo","64"]])),
    ("rock.mdx",seqs(&[("Stand",0.),("Stand alternate",0.),("Death",0.)])),("tree.mdx",seqs(&[("Stand",0.),("Death",0.)])),("footman.mdx",seqs(&[("Stand",0.)])),("chest.mdx",seqs(&[("Stand",0.)])),
]); MemorySource::new(files)}
fn doodad(id:&[u8;4],variation:i32,flags:u8,life:u8)->WarcraftMapDoodad {WarcraftMapDoodad {id:*id,variation,location:[128.,256.,384.],angle:1.,scale:[2.,3.,4.],flags,life,item_table:None,item_sets:vec![],editor_id:7}}
fn unit(id:&[u8;4])->WarcraftMapUnit {WarcraftMapUnit {id:*id,variation:0,location:[128.,256.,384.],angle:1.,scale:[2.,3.,4.],flags:0,player:15,unknown:0,hitpoints:-1,mana:-1,dropped_item_table:None,dropped_item_sets:vec![],gold_amount:0,target_acquisition:-1.,hero_level:1,hero_attributes:None,items_in_inventory:vec![],modified_abilities:vec![],random:WarcraftMapRandomPlacement::None,custom_team_color:-1,waygate:-1,creation_number:7}}
fn session()->WarcraftMapSession {let mut map=map_source(); Arc::get_mut(&mut map).unwrap().files.insert("war3map.wts".into(),Arc::from(&b"STRING 1\n{\nTextures\\v1.0\\Tree\n}\n"[..])); authored_session(map,common(),Arc::new(AssetByteCache::default()))}
fn definitions(session:&WarcraftMapSession)->Arc<WarcraftMapDefinitions> {let mut w=session.load_world_data(Default::default(),&Default::default()).unwrap(); w.doodads=Some(WarcraftMapDoodads {version:8,subversion:11,doodads:vec![doodad(b"AOob",2,0,100),doodad(b"ATtr",0,2,0),doodad(b"ATtr",0,0,100)],terrain_version:0,terrain_doodads:vec![]}); w.units=Some(WarcraftMapUnits {version:8,subversion:11,units:vec![unit(b"hfoo"),unit(b"phea"),unit(b"sloc"),unit(b"uDNR"),unit(b"iDNR")]}); Arc::new(WarcraftMapDefinitions::load(session,Arc::new(w),&WarcraftDefinitionCache::default(),Default::default(),&Default::default()).unwrap())}

#[test]
fn native_warcraft_placed_world_graph_preserves_source_roles_transform_tint_variants_and_replacements() {
    let session=session(); let defs=definitions(&session); let world=WarcraftPlacedWorld::load(&session,defs,&WarcraftResourceCache::default(),Default::default(),[1,1],&Default::default()).unwrap();
    assert_eq!(world.nodes.len(),12); assert_eq!(world.models.len(),4); assert_eq!(world.nodes[4].parent,Some(1)); let transform=world.nodes[4].transform.unwrap(); assert_eq!(transform.position,[1.,3.,-2.]); assert_eq!(transform.scale,[2.,4.,3.]); assert!((transform.rotation[1]-(0.5f32).sin()).abs()<1e-7); let appearance=&world.appearances[world.nodes[4].appearance.unwrap()]; assert_eq!(appearance.tint,[128./255.,1.,0.]); assert_eq!(appearance.replacement.as_ref().unwrap().member,"textures/v1.0/tree.blp"); assert_eq!(world.models[appearance.model].source.location.member,"rock.mdx");
    assert!(world.nodes[5].held); assert_eq!(world.nodes[5].sequence,Some(1)); assert!(!world.nodes[6].active); assert_eq!(world.nodes[7].parent,Some(2)); let transform=world.nodes[7].transform.unwrap(); assert_eq!(transform.position,[1.,3.5,-2.]); assert_eq!(transform.scale,[4.,8.,6.]); assert_eq!(world.appearances[world.nodes[7].appearance.unwrap()].team,12); assert_eq!(world.nodes[9].kind,WarcraftWorldNodeKind::StartLocation(2)); assert!(world.nodes[10..].iter().all(|n|matches!(n.kind,WarcraftWorldNodeKind::RandomPlacement(_)) && n.appearance.is_none()));
    drop(session); assert_eq!(world.models[0].model.sample(Some(0),250,None).unwrap().geosets.len(),1);
}

#[test]
fn native_warcraft_placed_world_rejects_budgets_cancellation_and_cross_map_definitions() {
    let session=session(); let defs=definitions(&session); let cache=WarcraftResourceCache::default();
    for limits in [WarcraftWorldLimits {max_nodes:1,..Default::default()},WarcraftWorldLimits {max_models:0,..Default::default()},WarcraftWorldLimits {max_member_bytes:1,..Default::default()},WarcraftWorldLimits {max_model_source_bytes:1,..Default::default()},WarcraftWorldLimits {max_model_decoded_bytes:1,..Default::default()},WarcraftWorldLimits {max_layout_bytes:1,..Default::default()}] {assert!(WarcraftPlacedWorld::load(&session,defs.clone(),&cache,limits,[1,1],&Default::default()).is_err());}
    let cancel=WarcraftMapCancelToken::default(); cancel.cancel(); assert!(matches!(WarcraftPlacedWorld::load(&session,defs.clone(),&cache,Default::default(),[1,1],&cancel),Err(WarcraftMapError::Cancelled))); let other=self::session(); assert!(WarcraftPlacedWorld::load(&other,defs,&cache,Default::default(),[1,1],&Default::default()).is_err());
}

#[test]
fn native_warcraft_placed_animation_uses_known_tags_weights_held_death_and_zero_total_fallback() {
    let m=MdxModel::parse(&seqs(&[("Stand alternate",0.),("Stand unknown42",0.),("Attack",0.),("Death",0.)])).unwrap(); let mut r=animation::Random(1); assert_eq!(animation::select(&m,false,&mut r).unwrap(),(Some(1),false)); assert_eq!(r.0,1); assert_eq!(animation::select(&m,true,&mut r).unwrap(),(Some(3),true));
    let m=MdxModel::parse(&seqs(&[("Stand",200.),("Stand",200.)])).unwrap(); assert_eq!(animation::select(&m,false,&mut r).unwrap(),(Some(0),false)); assert_ne!(r.0,1);
    let m=MdxModel::parse(&seqs(&[("Stand",0.),("Stand",1.)])).unwrap(); let mut r=animation::Random(1); let actual=(0..8).map(|_|animation::select(&m,false,&mut r).unwrap().0.unwrap()).collect::<Vec<_>>(); assert_eq!(actual,[0,1,0,1,0,0,0,0]);
    assert!(MdxModel::parse(&seqs(&[("Stand",f32::NAN)])).is_err()); let m=MdxModel::parse(&seqs(&[("Stand",-128.),("Stand",0.)])).unwrap(); assert!(animation::select(&m,false,&mut r).is_err());
}

#[test]
fn native_warcraft_placed_resources_share_public_handles_and_honor_map_ownership_and_hot_limits() {
    let source=AssetSourceId::fresh(); let map=AssetSourceId::fresh(); let bytes=AssetBytes {location:AssetLocation {source,member:"model.mdx".into()},bytes:crate::mdx::tests::fixture().into()}; let cache=WarcraftResourceCache::default(); let a=cache.model(bytes.clone(),map,1024*1024,&Default::default()).unwrap(); let b=cache.model(bytes.clone(),map,a.model.decoded_bytes(),&Default::default()).unwrap(); assert!(Arc::ptr_eq(&a,&b)); assert!(cache.model(bytes.clone(),map,1,&Default::default()).is_err()); assert!(a.model.sample(Some(0),500,None).is_ok());
    let c=cache.model(bytes.clone(),source,1024*1024,&Default::default()).unwrap(); assert!(!Arc::ptr_eq(&a,&c)); assert_eq!(cache.stats().entries,1); let disabled=WarcraftResourceCache::new(0); let d=disabled.model(bytes.clone(),map,1024*1024,&Default::default()).unwrap(); assert_eq!(disabled.stats().entries,0); assert!(d.model.sample(Some(0),100,None).is_ok());
    let minimal=AssetBytes {location:AssetLocation {source,member:"m.mdx".into()},bytes:[b"MDLX".as_slice(),b"VERS",&4u32.to_le_bytes(),&800u32.to_le_bytes()].concat().into()}; let bounded=WarcraftResourceCache::new(256); bounded.model(minimal,map,65536,&Default::default()).unwrap(); assert_eq!(bounded.stats().entries,0);
    let mut long=bytes; long.location.member="x".repeat(4000)+".mdx"; let tiny=WarcraftResourceCache::new(4000); tiny.model(long,map,1024*1024,&Default::default()).unwrap(); assert_eq!(tiny.stats().entries,0);
}

#[test]
fn native_warcraft_placed_texture_cache_checks_dimensions_before_decode_and_preserves_live_data() {
    let image=image::RgbaImage::from_pixel(2,2,image::Rgba([128,64,32,255])); let mut out=std::io::Cursor::new(Vec::new()); image::DynamicImage::ImageRgba8(image).write_to(&mut out,image::ImageFormat::Png).unwrap(); let source=AssetSourceId::fresh(); let map=AssetSourceId::fresh(); let bytes=AssetBytes {location:AssetLocation {source,member:"t.blp".into()},bytes:out.into_inner().into()}; let cache=WarcraftResourceCache::default(); assert!(cache.texture(bytes.clone(),map,15,&Default::default()).is_err()); let a=cache.texture(bytes.clone(),map,16,&Default::default()).unwrap(); let b=cache.texture(bytes.clone(),map,16,&Default::default()).unwrap(); assert!(Arc::ptr_eq(&a,&b)); assert!(cache.texture(bytes.clone(),map,1,&Default::default()).is_err()); let own=cache.texture(bytes,source,16,&Default::default()).unwrap(); assert!(!Arc::ptr_eq(&a,&own)); assert_eq!(a.rgba.pixels[0],128); let cancel=WarcraftMapCancelToken::default(); cancel.cancel(); assert!(cache.texture(a.source.clone(),map,16,&cancel).is_err());
}

#[test]
fn native_warcraft_placed_held_pose_clamps_looping_sequence_at_terminal_keys() {let model=MdxModel::parse(&crate::mdx::tests::fixture()).unwrap(); let looping=model.sample(Some(0),1000,None).unwrap(); let held=model.sample_clamped(Some(0),1000,None).unwrap(); assert_ne!(looping.geosets[0].mesh.positions,held.geosets[0].mesh.positions); assert_eq!(held.geosets[0].mesh.positions,model.sample_clamped(Some(0),5000,None).unwrap().geosets[0].mesh.positions);}
