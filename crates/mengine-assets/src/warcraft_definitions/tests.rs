// Author: MiYu. Validate source-table identity, inherited typed fields, metadata mappings and bounded cache lifetime.
use super::*;
use crate::{AssetByteCache,AssetByteSource,AssetMounts,AssetSourceRead,AssetError,WarcraftMapObject,WarcraftMapObjects,WarcraftMapObjectModification};
use crate::warcraft_map::tests::{MemorySource,map_source,authored_session};
use WarcraftDefinitionTable::*;
use WarcraftDefinitionDomain::UnitsAndItems;

fn slk(headers:&[&str],rows:&[Vec<&str>])->Vec<u8> {let mut b=String::from("ID;P\n"); for (y,row) in std::iter::once(headers.to_vec()).chain(rows.iter().cloned()).enumerate() {for (x,v) in row.iter().enumerate() {b.push_str(&format!("C;X{};Y{};K\"{}\"\n",x+1,y+1,v.replace('"',"\"\"")));}} b.into_bytes()}
fn files()->Vec<(&'static str,Vec<u8>)> {vec![
    ("units/unitui.slk",slk(&["id","file","modelScale","teamColor"],&[vec!["hfoo","Footman.mdl","1","-1"],vec!["hrif","Rifleman.mdl","1","-1"]])),
    ("units/unitdata.slk",slk(&["id","moveHeight"],&[vec!["hfoo","0"],vec!["hrif","0"]])),
    ("units/unitbalance.slk",slk(&["id","HP"],&[vec!["hfoo","100"],vec!["hrif","120"]])),
    ("units/unitweapons.slk",slk(&["id","rangeN1"],&[vec!["hfoo","128"]])),
    ("units/unitabilities.slk",slk(&["id","abilList"],&[vec!["hfoo","Adef"]])),
    ("units/itemdata.slk",slk(&["id","file","HP","scale"],&[vec!["phea","Chest.mdl","75","1"]])),
    ("doodads/doodads.slk",slk(&["id","file","numVar","vertR01","vertR02"],&[vec!["AOob","Rock.mdl","3","255","255"]])),
    ("units/destructabledata.slk",slk(&["id","file","colorR"],&[vec!["ATtr","Tree.mdl","255"]])),
    ("units/unitmetadata.slk",slk(&["ID","field","slk","index"],&[vec!["umdl","file","UnitUI","-1"],vec!["usca","modelScale","UnitUI","-1"],vec!["uhpm","HP","UnitBalance","-1"],vec!["uabi","abilList","UnitAbilities","-1"],vec!["unam","Name","Profile","0"],vec!["unm2","Name","Profile","1"],vec!["ihtp","HP","ItemData","-1"],vec!["zzzz","x","Unknown","-1"]])),
    ("doodads/doodadmetadata.slk",slk(&["ID","field","slk","index","repeat"],&[vec!["dfil","file","DoodadData","0","0"],vec!["dvr1","vertR","DoodadData","0","10"]])),
    ("units/destructablemetadata.slk",slk(&["ID","field","slk","index"],&[vec!["bfil","file","DestructableData","0"],vec!["bvcr","colorR","DestructableData","0"]])),
]}
fn m(field:&[u8;4],value:WarcraftMapObjectValue)->WarcraftMapObjectModification {WarcraftMapObjectModification {field:*field,level:None,data_pointer:None,value,marker:[0;4]}}
fn object(base:&[u8;4],target:&[u8;4],mods:Vec<WarcraftMapObjectModification>)->WarcraftMapObject {WarcraftMapObject {base_id:*base,new_id:*target,modifications:mods}}
fn file(kind:WarcraftMapObjectKind,original:Vec<WarcraftMapObject>,custom:Vec<WarcraftMapObject>)->WarcraftMapObjects {WarcraftMapObjects {kind,version:2,original,custom}}
fn world(session:&WarcraftMapSession,objects:Vec<WarcraftMapObjects>)->Arc<WarcraftMapWorldData> {let mut world=session.load_world_data(Default::default(),&Default::default()).unwrap(); world.objects=objects; Arc::new(world)}
fn load(session:&WarcraftMapSession,objects:Vec<WarcraftMapObjects>,cache:&WarcraftDefinitionCache)->Result<WarcraftMapDefinitions> {WarcraftMapDefinitions::load(session,world(session,objects),cache,Default::default(),&Default::default())}
fn txt(value:&str)->WarcraftMapObjectValue {WarcraftMapObjectValue::Text(value.into())}

#[test]
fn native_warcraft_definitions_share_public_decoding_without_sharing_map_overrides() {
    let common=MemorySource::new(files()); let bytes=Arc::new(AssetByteCache::default()); let cache=WarcraftDefinitionCache::default(); let a=authored_session(map_source(),common.clone(),bytes.clone()); let first=load(&a,vec![],&cache).unwrap(); let b=authored_session(map_source(),common,bytes); let second=load(&b,vec![],&cache).unwrap();
    assert_eq!(cache.stats().entries,11); assert_eq!(cache.stats().hits,11); for kind in WarcraftDefinitionTable::SOURCES {assert!(Arc::ptr_eq(&first.tables[&kind],&second.tables[&kind]));} assert_eq!(first.field(UnitsAndItems,*b"hfoo",UnitUi,"file").unwrap().text(),Some("Footman.mdl"));
    let mut map=map_source(); Arc::get_mut(&mut map).unwrap().files.insert("units/unitui.slk".into(),slk(&["id","file"],&[vec!["hfoo","MapOnly.mdx"]]).into()); let c=authored_session(map,MemorySource::new(files()),Arc::new(AssetByteCache::default())); let own=load(&c,vec![],&cache).unwrap();
    assert_eq!(own.field(UnitsAndItems,*b"hfoo",UnitUi,"file").unwrap().text(),Some("MapOnly.mdx")); assert!(own.field(UnitsAndItems,*b"hrif",UnitUi,"file").is_none()); assert_ne!(own.tables[&UnitUi].bytes.location,first.tables[&UnitUi].bytes.location); assert_eq!(cache.stats().entries,21); let weak=Arc::downgrade(&own.tables[&UnitUi]); drop(c); assert!(weak.upgrade().is_some()); drop(own); assert!(weak.upgrade().is_none());
}

#[test]
fn native_warcraft_definitions_originals_precede_customs_with_isolated_siblings_and_owned_strings() {
    let bytes=Arc::new(AssetByteCache::default()); let session=authored_session(map_source(),MemorySource::new(files()),bytes.clone()); let cache=WarcraftDefinitionCache::default();
    let original=object(b"hfoo",b"\0\0\0\0",vec![m(b"uhpm",WarcraftMapObjectValue::Integer(150))]);
    let custom=vec![object(b"hfoo",b"H001",vec![m(b"umdl",txt("Custom.mdx")),m(b"usca",WarcraftMapObjectValue::Unreal(2.)),m(b"uabi",txt("AHbz")),m(b"unam",txt("TRIGSTR_0001")),m(b"unm2",txt("second"))]),object(b"hfoo",b"H002",vec![]),object(b"H001",b"H003",vec![m(b"uhpm",WarcraftMapObjectValue::Integer(175))]),object(b"phea",b"I001",vec![])];
    let item=file(WarcraftMapObjectKind::Items,vec![object(b"phea",b"\0\0\0\0",vec![m(b"ihtp",WarcraftMapObjectValue::Integer(200))])],vec![]);
    let d=load(&session,vec![file(WarcraftMapObjectKind::Units,vec![original],custom),item],&cache).unwrap();
    assert_eq!(d.field(UnitsAndItems,*b"H001",UnitUi,"file").unwrap().text(),Some("Custom.mdx")); assert_eq!(d.field(UnitsAndItems,*b"H002",UnitUi,"file").unwrap().text(),Some("Footman.mdl")); assert_eq!(d.field(UnitsAndItems,*b"H002",UnitBalance,"HP").unwrap().number(),Some(150.));
    assert_eq!(d.field(UnitsAndItems,*b"H003",UnitBalance,"HP").unwrap().number(),Some(175.)); assert_eq!(d.field(UnitsAndItems,*b"H003",UnitUi,"modelScale").unwrap().number(),Some(2.)); assert_eq!(d.field(UnitsAndItems,*b"H001",UnitAbilities,"abilList").unwrap().text(),Some("AHbz")); assert_eq!(d.field(UnitsAndItems,*b"I001",Items,"HP").unwrap().number(),Some(200.)); assert_eq!(d.root_id(UnitsAndItems,*b"H003"),Some(*b"hfoo"));
    assert_eq!(d.source_field(UnitBalance,*b"hfoo","HP"),Some("100")); assert!(d.field(UnitsAndItems,*b"H001",Profile,"Name").is_none()); assert_eq!(d.indexed_field(UnitsAndItems,*b"H001",Profile,"Name",1).unwrap().text(),Some("second"));
    let name=d.indexed_field(UnitsAndItems,*b"H003",Profile,"Name",0).unwrap().text().unwrap(); drop(session); assert_eq!(d.resolve_text(name),"Map name"); assert_eq!(d.world_data().objects[0].custom[0].modifications.len(),5); assert_eq!(bytes.stats().entries,11); assert!(d.overrides().iter().all(|r|r.disposition==WarcraftDefinitionDisposition::Applied));
}

#[test]
fn native_warcraft_definitions_doodad_variation_destructable_and_preserved_dispositions() {
    let session=authored_session(map_source(),MemorySource::new(files()),Arc::new(AssetByteCache::default())); let mut variation=m(b"dvr1",WarcraftMapObjectValue::Integer(100)); variation.level=Some(2); variation.data_pointer=Some(0); let mut pointer=m(b"dfil",txt("Ignored.mdx")); pointer.level=Some(0); pointer.data_pointer=Some(1);
    let d=load(&session,vec![file(WarcraftMapObjectKind::Doodads,vec![],vec![object(b"AOob",b"D001",vec![variation,pointer,m(b"xxxx",txt("raw"))])]),file(WarcraftMapObjectKind::Destructables,vec![],vec![object(b"ATtr",b"B001",vec![m(b"bvcr",WarcraftMapObjectValue::Integer(190))])]),file(WarcraftMapObjectKind::Units,vec![object(b"hfoo",b"\0\0\0\0",vec![m(b"zzzz",txt("raw"))])],vec![]),file(WarcraftMapObjectKind::Abilities,vec![],vec![object(b"????",b"A001",vec![m(b"????",txt("raw"))])])],&WarcraftDefinitionCache::default()).unwrap();
    assert_eq!(d.field(WarcraftDefinitionDomain::Doodads,*b"D001",WarcraftDefinitionTable::Doodads,"vertR01").unwrap().text(),Some("255")); assert_eq!(d.field(WarcraftDefinitionDomain::Doodads,*b"D001",WarcraftDefinitionTable::Doodads,"vertR02").unwrap().number(),Some(100.)); assert_eq!(d.field(WarcraftDefinitionDomain::Destructables,*b"B001",WarcraftDefinitionTable::Destructables,"colorR").unwrap().number(),Some(190.));
    let statuses=d.overrides().iter().map(|r|r.disposition).collect::<Vec<_>>(); for status in [WarcraftDefinitionDisposition::UnknownMetadata,WarcraftDefinitionDisposition::UnsupportedDataPointer,WarcraftDefinitionDisposition::UnsupportedTarget,WarcraftDefinitionDisposition::UnsupportedFamily] {assert!(statuses.contains(&status));} assert_eq!(d.world_data().objects[0].custom[0].modifications[1].value,txt("Ignored.mdx"));
}

#[test]
fn native_warcraft_definitions_reject_missing_bases_duplicate_customs_invalid_variation_and_wrong_world() {
    let session=authored_session(map_source(),MemorySource::new(files()),Arc::new(AssetByteCache::default())); let cache=WarcraftDefinitionCache::default();
    for rows in [vec![object(b"none",b"H001",vec![])],vec![object(b"hfoo",b"H001",vec![]),object(b"hfoo",b"H001",vec![])],vec![object(b"hfoo",b"hrif",vec![])],vec![object(b"H002",b"H001",vec![]),object(b"hfoo",b"H002",vec![])]] {assert!(matches!(load(&session,vec![file(WarcraftMapObjectKind::Units,vec![],rows)],&cache),Err(WarcraftMapError::Format {..})));}
    for level in [0,11] {let mut v=m(b"dvr1",WarcraftMapObjectValue::Integer(100)); v.level=Some(level); v.data_pointer=Some(0); assert!(matches!(load(&session,vec![file(WarcraftMapObjectKind::Doodads,vec![],vec![object(b"AOob",b"D001",vec![v])])],&cache),Err(WarcraftMapError::Format {..})));}
    let mut other=session.load_world_data(Default::default(),&Default::default()).unwrap(); other.source=AssetSourceId::fresh(); assert!(matches!(WarcraftMapDefinitions::load(&session,Arc::new(other),&cache,Default::default(),&Default::default()),Err(WarcraftMapError::Format {..})));
}

#[test]
fn native_warcraft_definitions_enforce_cached_source_and_overlay_limits_and_cancel() {
    let session=authored_session(map_source(),MemorySource::new(files()),Arc::new(AssetByteCache::default())); let cache=WarcraftDefinitionCache::default(); load(&session,vec![],&cache).unwrap();
    for limits in [WarcraftDefinitionLimits {max_member_bytes:1,..Default::default()},WarcraftDefinitionLimits {max_source_bytes:1,..Default::default()},WarcraftDefinitionLimits {max_decoded_bytes:1,..Default::default()},WarcraftDefinitionLimits {max_overlay_bytes:1,..Default::default()},WarcraftDefinitionLimits {max_objects:0,..Default::default()}] {
        let w=world(&session,vec![file(WarcraftMapObjectKind::Units,vec![],vec![object(b"hfoo",b"H001",vec![])])]); assert!(WarcraftMapDefinitions::load(&session,w,&cache,limits,&Default::default()).is_err());
    }
    let cancel=WarcraftMapCancelToken::default(); cancel.cancel(); assert!(matches!(WarcraftMapDefinitions::load(&session,world(&session,vec![]),&cache,Default::default(),&cancel),Err(WarcraftMapError::Cancelled)));
    for input in [b"invalid".to_vec(),slk(&["id","file"],&[vec!["toolong","x"]]),slk(&["id","file"],&[vec!["\u{100}abc","x"]]),slk(&["id","file"],&[vec!["hfoo","x"],vec!["hfoo","y"]])] {let mut common=MemorySource::new(files()); Arc::get_mut(&mut common).unwrap().files.insert("units/unitui.slk".into(),input.into()); let session=authored_session(map_source(),common,Arc::new(AssetByteCache::default())); assert!(load(&session,vec![],&cache).is_err());}
}

#[test]
fn native_warcraft_definitions_cache_evicts_with_live_handles_and_latin1_row_identity() {
    let source=MemorySource::new(vec![("units/unitui.slk",slk(&["id","file"],&[vec!["éABC","one"]])),("units/unitdata.slk",slk(&["id","field"],&[vec!["hfoo","two"]]))]); let mounts=AssetMounts::new(vec![source],Arc::new(AssetByteCache::default())); let map=AssetSourceId::fresh(); let cancel=WarcraftMapCancelToken::default(); let limits=WarcraftDefinitionLimits::default(); let initial=WarcraftDefinitionCache::new(0); let a=initial.load(&mounts,map,UnitUi,limits,&mut Budget::new(65536),&mut Budget::new(65536),&cancel).unwrap(); assert_eq!(initial.stats().entries,0); assert_eq!(a.get([233,b'A',b'B',b'C'],"file"),Some("one"));
    let cache=WarcraftDefinitionCache::new(a.decoded_bytes+a.bytes.bytes.len()); let first=cache.load(&mounts,map,UnitUi,limits,&mut Budget::new(65536),&mut Budget::new(65536),&cancel).unwrap(); let second=cache.load(&mounts,map,UnitData,limits,&mut Budget::new(65536),&mut Budget::new(65536),&cancel).unwrap(); assert_eq!(first.get([233,b'A',b'B',b'C'],"file"),Some("one")); assert_eq!(second.get(*b"hfoo","field"),Some("two")); assert!(cache.stats().resident_bytes<=a.decoded_bytes+a.bytes.bytes.len()); assert!(cache.stats().entries<=1);
}

struct CancelRead {source:Arc<MemorySource>,cancel:WarcraftMapCancelToken}
impl AssetByteSource for CancelRead {fn identity(&self)->AssetSourceId {self.source.id} fn read(&self,member:&str)->std::result::Result<AssetSourceRead,AssetError> {let result=self.source.read(member); self.cancel.cancel(); result}}
#[test]
fn native_warcraft_definitions_cancel_after_archive_read_does_not_publish_decoding() {
    let cancel=WarcraftMapCancelToken::default(); let mounts=AssetMounts::new(vec![Arc::new(CancelRead {source:MemorySource::new(files()),cancel:cancel.clone()})],Arc::new(AssetByteCache::default())); let cache=WarcraftDefinitionCache::default(); assert!(matches!(cache.load(&mounts,AssetSourceId::fresh(),UnitUi,Default::default(),&mut Budget::new(65536),&mut Budget::new(65536),&cancel),Err(WarcraftMapError::Cancelled))); assert_eq!(cache.stats().entries,0);
}
