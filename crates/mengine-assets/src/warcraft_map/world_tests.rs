// Author: MiYu. Exercise classic world layouts, malformed binary boundaries and map-only ownership with authored members.
use super::*;
use super::tests::{MemorySource,map_source,scope,defaults,is_format,is_limit};
use crate::{AssetByteCache,AssetByteSource,AssetSourceRead};

fn int(b:&mut Vec<u8>,v:i32) {b.extend(v.to_le_bytes());}
fn floats(b:&mut Vec<u8>) {for v in [-1024.5f32,2048.,-128.,1.25,0.5,2.,-3.] {b.extend(v.to_le_bytes());}}
fn choices(b:&mut Vec<u8>) {int(b,2); for (id,chance) in [(b"ratf",35),(b"\xff\0ab",-7)] {b.extend(id); int(b,chance);}}
fn sets(b:&mut Vec<u8>) {int(b,2); choices(b); int(b,0);}
fn doodads(version:i32)->Vec<u8> {
    let mut b=b"W3do".to_vec(); for v in [version,11,1] {int(&mut b,v);} b.extend(b"ATtr"); int(&mut b,3); floats(&mut b); b.extend([0x83,37]);
    if version==8 {int(&mut b,-1); sets(&mut b);} int(&mut b,-42); for v in [0,1] {int(&mut b,v);} b.extend(b"YTpb"); int(&mut b,-99); int(&mut b,i32::MIN); int(&mut b,i32::MAX); b
}
fn units(version:i32,random:i32)->Vec<u8> {
    let mut b=b"W3do".to_vec(); for v in [version,if version==7 {9} else {11},1] {int(&mut b,v);} b.extend(b"uDNR"); int(&mut b,5); floats(&mut b); b.push(0x82); int(&mut b,15); b.extend(0xab12u16.to_le_bytes()); int(&mut b,-1); int(&mut b,73);
    if version==8 {int(&mut b,-1);} sets(&mut b); int(&mut b,14500); b.extend((-2.5f32).to_le_bytes()); int(&mut b,7); if version==8 {for v in [3,5,9] {int(&mut b,v);}}
    int(&mut b,1); int(&mut b,5); b.extend(b"ratf"); int(&mut b,1); b.extend(b"AHhb"); int(&mut b,-1); int(&mut b,3); int(&mut b,random);
    match random {0=>b.extend([0xff,0x80,0x12,7]),1=>{int(&mut b,-3); int(&mut b,-7);},2=>choices(&mut b),_=>{}} for v in [-1,-42,951] {int(&mut b,v);} b
}
fn objects(version:i32,extended:bool)->Vec<u8> {
    let mut b=vec![]; int(&mut b,version);
    for (base,target) in [(b"hfoo",b"\0\0\0\0"),(b"hfoo",b"H001")] {
        int(&mut b,1); b.extend(base); b.extend(target); int(&mut b,4);
        for kind in 0..4 {b.extend(b"abcd"); int(&mut b,kind); if extended {int(&mut b,kind-1); int(&mut b,17);} match kind {0=>int(&mut b,-123),1=>b.extend((-0.5f32).to_le_bytes()),2=>b.extend((-0.0f32).to_le_bytes()),3=>b.extend("TRIGSTR_0001/单位\0".as_bytes()),_=>unreachable!()} b.extend([0xff,0,0x81,42]);}
    } b
}

#[test]
fn native_warcraft_world_doodads_preserve_versions_source_transforms_and_nested_drops() {
    for version in [7,8] {
        let p=WarcraftMapDoodads::parse(&doodads(version),defaults(),&WarcraftMapCancelToken::default()).unwrap(); assert_eq!((p.version,p.subversion),(version,11)); let d=&p.doodads[0];
        assert_eq!(d.id,*b"ATtr"); assert_eq!(d.variation,3); assert_eq!(d.location,[-1024.5,2048.,-128.]); assert_eq!(d.angle,1.25); assert_eq!(d.scale,[0.5,2.,-3.]); assert_eq!((d.flags,d.life,d.editor_id),(0x83,37,-42));
        assert_eq!(d.item_table,if version==8 {Some(u32::MAX)} else {None}); if version==8 {assert_eq!(d.item_sets.len(),2); assert!(d.item_sets[1].is_empty()); assert_eq!(d.item_sets[0][1],WarcraftMapItemChoice {id:*b"\xff\0ab",chance:-7});} else {assert!(d.item_sets.is_empty());}
        assert_eq!(p.terrain_version,0); assert_eq!(p.terrain_doodads[0],WarcraftMapTerrainDoodad {id:*b"YTpb",unknown:(-99i32) as u32,location:[0x80000000,0x7fffffff]});
    }
}

#[test]
fn native_warcraft_world_units_preserve_both_versions_all_random_modes_and_reserved_values() {
    for version in [7,8] {for flag in [-1,0,1,2] {
        let p=WarcraftMapUnits::parse(&units(version,flag),defaults(),&WarcraftMapCancelToken::default()).unwrap(); assert_eq!(p.version,version); assert_eq!(p.subversion,if version==7 {9} else {11}); let u=&p.units[0];
        assert_eq!(u.id,*b"uDNR"); assert_eq!(u.variation,5); assert_eq!(u.location,[-1024.5,2048.,-128.]); assert_eq!(u.angle,1.25); assert_eq!(u.scale,[0.5,2.,-3.]); assert_eq!((u.flags,u.player,u.unknown,u.hitpoints,u.mana),(0x82,15,0xab12,-1,73));
        assert_eq!(u.dropped_item_table,if version==8 {Some(-1)} else {None}); assert_eq!(u.dropped_item_sets.len(),2); assert!(u.dropped_item_sets[1].is_empty()); assert_eq!(u.dropped_item_sets[0][0].chance,35);
        assert_eq!((u.gold_amount,u.target_acquisition,u.hero_level),(14500,-2.5,7)); assert_eq!(u.hero_attributes,if version==8 {Some([3,5,9])} else {None}); assert_eq!(u.items_in_inventory[0],WarcraftMapInventoryItem {slot:5,id:*b"ratf"});
        assert_eq!(u.modified_abilities[0],WarcraftMapModifiedAbility {id:*b"AHhb",active_for_autocast:-1,hero_level:3}); assert_eq!((u.custom_team_color,u.waygate,u.creation_number),(-1,-42,951));
        match (&u.random,flag) {(WarcraftMapRandomPlacement::None,-1)=>{},(WarcraftMapRandomPlacement::Any {level,item_class},0)=>{assert_eq!(*level,[255,128,18]); assert_eq!(*item_class,7);},(WarcraftMapRandomPlacement::Group {unit_group,position_in_group},1)=>{assert_eq!(*unit_group,(-3i32) as u32); assert_eq!(*position_in_group,(-7i32) as u32);},(WarcraftMapRandomPlacement::Choices(values),2)=>assert_eq!(values[1].id,*b"\xff\0ab"),_=>panic!("random mode changed")}
    }}
}

#[test]
fn native_warcraft_world_objects_preserve_all_families_types_tables_markers_and_levels() {
    for version in [1,2] {for kind in WarcraftMapObjectKind::ALL {
        let p=WarcraftMapObjects::parse(&objects(version,kind.extended()),kind,defaults(),&WarcraftMapCancelToken::default()).unwrap(); assert_eq!((p.kind,p.version),(kind,version)); assert_eq!(p.original[0].new_id,[0;4]); assert_eq!(p.original[0].base_id,*b"hfoo"); assert_eq!(p.custom[0].new_id,*b"H001");
        for row in p.original.iter().chain(&p.custom) {for (i,m) in row.modifications.iter().enumerate() {assert_eq!(m.field,*b"abcd"); assert_eq!(m.marker,[255,0,129,42]); assert_eq!(m.level,kind.extended().then_some(i as i32-1)); assert_eq!(m.data_pointer,kind.extended().then_some(17));}
            assert_eq!(row.modifications[0].value,WarcraftMapObjectValue::Integer(-123)); assert_eq!(row.modifications[1].value,WarcraftMapObjectValue::Real(-0.5)); assert!(matches!(row.modifications[2].value,WarcraftMapObjectValue::Unreal(v) if v.to_bits()==(-0.0f32).to_bits())); assert_eq!(row.modifications[3].value,WarcraftMapObjectValue::Text("TRIGSTR_0001/单位".into()));}
    }}
}

#[test]
fn native_warcraft_world_truncation_trailing_bytes_magic_versions_and_counts_fail() {
    let cancel=WarcraftMapCancelToken::default();
    for bytes in [doodads(7),doodads(8)] {for end in 0..bytes.len() {is_format(WarcraftMapDoodads::parse(&bytes[..end],defaults(),&cancel));} let mut b=bytes; b.push(0); is_format(WarcraftMapDoodads::parse(&b,defaults(),&cancel));}
    for version in [7,8] {for flag in [-1,0,1,2] {let bytes=units(version,flag); for end in 0..bytes.len() {is_format(WarcraftMapUnits::parse(&bytes[..end],defaults(),&cancel));} let mut b=bytes; b.push(0); is_format(WarcraftMapUnits::parse(&b,defaults(),&cancel));}}
    for kind in [WarcraftMapObjectKind::Units,WarcraftMapObjectKind::Doodads] {let bytes=objects(2,kind.extended()); for end in 0..bytes.len() {is_format(WarcraftMapObjects::parse(&bytes[..end],kind,defaults(),&cancel));} let mut b=bytes; b.push(0); is_format(WarcraftMapObjects::parse(&b,kind,defaults(),&cancel));}
    for (at,value) in [(0,0),(4,9),(12,-1),(12,i32::MAX)] {let mut b=doodads(8); b[at..at+4].copy_from_slice(&value.to_le_bytes()); is_format(WarcraftMapDoodads::parse(&b,defaults(),&cancel));}
    for at in [58,62,doodads(8).len()-20] {for value in [-1i32,i32::MAX] {let mut b=doodads(8); b[at..at+4].copy_from_slice(&value.to_le_bytes()); is_format(WarcraftMapDoodads::parse(&b,defaults(),&cancel));}}
    for (at,value) in [(0,0),(4,9),(8,9),(12,-1),(12,i32::MAX)] {let mut b=units(8,-1); b[at..at+4].copy_from_slice(&value.to_le_bytes()); is_format(WarcraftMapUnits::parse(&b,defaults(),&cancel));}
    for at in [71,75] {for value in [-1i32,i32::MAX] {let mut b=units(8,-1); b[at..at+4].copy_from_slice(&value.to_le_bytes()); is_format(WarcraftMapUnits::parse(&b,defaults(),&cancel));}}
    let mut b=units(8,-1); let at=b.len()-16; b[at..at+4].copy_from_slice(&3i32.to_le_bytes()); is_format(WarcraftMapUnits::parse(&b,defaults(),&cancel));
    for (at,value) in [(0,3),(4,-1),(4,i32::MAX),(16,-1),(24,4)] {let mut b=objects(2,false); b[at..at+4].copy_from_slice(&value.to_le_bytes()); is_format(WarcraftMapObjects::parse(&b,WarcraftMapObjectKind::Units,defaults(),&cancel));}
}

#[test]
fn native_warcraft_world_nonfinite_encoding_and_empty_custom_ids_fail_explicitly() {
    let cancel=WarcraftMapCancelToken::default();
    for bits in [f32::NAN.to_bits(),f32::INFINITY.to_bits(),f32::NEG_INFINITY.to_bits()] {
        for at in [24,28,32,36,40,44,48] {let mut b=doodads(8); b[at..at+4].copy_from_slice(&bits.to_le_bytes()); is_format(WarcraftMapDoodads::parse(&b,defaults(),&cancel)); let mut b=units(8,0); b[at..at+4].copy_from_slice(&bits.to_le_bytes()); is_format(WarcraftMapUnits::parse(&b,defaults(),&cancel));}
        let mut b=objects(2,false); b[44..48].copy_from_slice(&bits.to_le_bytes()); is_format(WarcraftMapObjects::parse(&b,WarcraftMapObjectKind::Units,defaults(),&cancel));
    }
    let mut b=objects(2,false); let at=b.windows(7).position(|w|w==b"TRIGSTR").unwrap(); b[at]=0xff; is_format(WarcraftMapObjects::parse(&b,WarcraftMapObjectKind::Units,defaults(),&cancel));
    let mut b=objects(2,false); let at=b.windows(4).position(|w|w==b"H001").unwrap(); b[at..at+4].fill(0); is_format(WarcraftMapObjects::parse(&b,WarcraftMapObjectKind::Units,defaults(),&cancel));
}

#[test]
fn native_warcraft_world_parsers_enforce_nested_quotas_allocation_and_precancel() {
    let cancel=WarcraftMapCancelToken::default();
    for limits in [WarcraftMapLimits {max_records:1,..defaults()},WarcraftMapLimits {max_decoded_bytes:1,..defaults()},WarcraftMapLimits {max_member_bytes:8,..defaults()}] {
        is_limit(WarcraftMapDoodads::parse(&doodads(8),limits,&cancel)); is_limit(WarcraftMapUnits::parse(&units(8,2),limits,&cancel)); is_limit(WarcraftMapObjects::parse(&objects(2,false),WarcraftMapObjectKind::Units,limits,&cancel));
    }
    is_limit(WarcraftMapObjects::parse(&objects(2,true),WarcraftMapObjectKind::Doodads,WarcraftMapLimits {max_string_bytes:4,..defaults()},&cancel));
    cancel.cancel(); assert!(matches!(WarcraftMapDoodads::parse(&doodads(8),defaults(),&cancel),Err(WarcraftMapError::Cancelled))); assert!(matches!(WarcraftMapUnits::parse(&units(8,2),defaults(),&cancel),Err(WarcraftMapError::Cancelled))); assert!(matches!(WarcraftMapObjects::parse(&objects(2,false),WarcraftMapObjectKind::Units,defaults(),&cancel),Err(WarcraftMapError::Cancelled)));
}

fn world_source()->Arc<MemorySource> {let mut s=map_source(); let files=&mut Arc::get_mut(&mut s).unwrap().files; files.insert("war3map.doo".into(),doodads(8).into()); files.insert("war3mapunits.doo".into(),units(8,2).into()); for kind in WarcraftMapObjectKind::ALL {files.insert(kind.member().into(),objects(2,kind.extended()).into());} s}
#[test]
fn native_warcraft_world_session_map_only_optional_members_and_owned_data_outlive_archive() {
    let cache=Arc::new(AssetByteCache::default()); let source=world_source(); let id=source.id; let weak=Arc::downgrade(&source); let common=MemorySource::new(vec![("shared.blp",b"common".to_vec())]); let common_mount=AssetMounts::new(vec![common.clone()],cache.clone()); let shared=common_mount.read("shared.blp").unwrap();
    let session=WarcraftMapSession::load(scope(source,common.clone(),cache.clone()),defaults(),&WarcraftMapCancelToken::default(),|_|{}).unwrap(); let world=session.load_world_data(defaults(),&WarcraftMapCancelToken::default()).unwrap();
    assert_eq!(world.source,id); assert_eq!(world.members().len(),9); assert!(world.members().iter().all(|m|m.location.source==id)); assert_eq!(world.objects.len(),7); for kind in WarcraftMapObjectKind::ALL {assert_eq!(world.objects(kind).unwrap().kind,kind);} assert!(world.doodads.is_some()); assert!(world.units.is_some());
    let raw=world.members()[0].bytes.clone(); drop(session); assert!(weak.upgrade().is_none()); assert_eq!(cache.stats().entries,1); assert_eq!(cache.stats().resident_bytes,6); assert_eq!(&*raw,doodads(8)); assert_eq!(world.units.unwrap().units[0].creation_number,951); assert!(Arc::ptr_eq(&shared.bytes,&common_mount.read("shared.blp").unwrap().bytes));
    let source=map_source(); let common=MemorySource::new(vec![("war3map.doo",doodads(8)),("war3mapunits.doo",units(8,-1)),("war3map.w3u",objects(2,false))]); let session=WarcraftMapSession::load(scope(source,common.clone(),Arc::new(AssetByteCache::default())),defaults(),&WarcraftMapCancelToken::default(),|_|{}).unwrap(); let world=session.load_world_data(defaults(),&WarcraftMapCancelToken::default()).unwrap(); assert!(world.doodads.is_none()); assert!(world.units.is_none()); assert!(world.objects.is_empty()); assert!(world.members().is_empty()); assert!(common.reads.lock().unwrap().is_empty());
}

#[test]
fn native_warcraft_world_session_combines_raw_and_decoded_quotas_and_keeps_present_errors() {
    let cancel=WarcraftMapCancelToken::default(); let session=WarcraftMapSession::load(scope(world_source(),MemorySource::new(vec![]),Arc::new(AssetByteCache::default())),defaults(),&cancel,|_|{}).unwrap(); let core=session.members().iter().map(|m|m.bytes.len()).sum::<usize>();
    is_limit(session.load_world_data(WarcraftMapLimits {max_data_bytes:core-1,..defaults()},&cancel)); assert!(matches!(session.load_world_data(WarcraftMapLimits {max_data_bytes:core+doodads(8).len()-1,..defaults()},&cancel),Err(WarcraftMapError::Resource(AssetError::Invalid(_)))));
    let decoded=std::mem::size_of::<AssetBytes>()*9+std::mem::size_of::<WarcraftMapObjects>()*7+std::mem::size_of::<WarcraftMapDoodad>()+std::mem::size_of::<WarcraftMapTerrainDoodad>()+2*std::mem::size_of::<Vec<WarcraftMapItemChoice>>()+2*std::mem::size_of::<WarcraftMapItemChoice>();
    is_limit(session.load_world_data(WarcraftMapLimits {max_decoded_bytes:decoded,..defaults()},&cancel)); cancel.cancel(); assert!(matches!(session.load_world_data(defaults(),&cancel),Err(WarcraftMapError::Cancelled)));
    let mut s=world_source(); Arc::get_mut(&mut s).unwrap().files.insert("war3map.w3u".into(),Arc::from(&b"bad"[..])); let common=MemorySource::new(vec![("war3map.w3u",objects(2,false))]); let session=WarcraftMapSession::load(scope(s,common.clone(),Arc::new(AssetByteCache::default())),defaults(),&WarcraftMapCancelToken::default(),|_|{}).unwrap(); is_format(session.load_world_data(defaults(),&WarcraftMapCancelToken::default())); assert!(common.reads.lock().unwrap().is_empty());
}

struct CancellingSource {source:Arc<MemorySource>,cancel:WarcraftMapCancelToken}
impl AssetByteSource for CancellingSource {
    fn identity(&self)->AssetSourceId {self.source.id}
    fn read(&self,member:&str)->std::result::Result<AssetSourceRead,AssetError> {let result=self.source.read(member); if member=="war3map.doo" {self.cancel.cancel();} result}
}
#[test]
fn native_warcraft_world_session_cancel_after_member_read_stops_before_next_member() {
    let source=world_source(); let cancel=WarcraftMapCancelToken::default(); let cache=Arc::new(AssetByteCache::default()); let mounted=ScopedWarcraftMap::new("cancel.w3x".into(),Arc::new(CancellingSource {source:source.clone(),cancel:cancel.clone()}),vec![],cache.clone());
    let session=WarcraftMapSession::load(mounted,defaults(),&cancel,|_|{}).unwrap(); assert!(matches!(session.load_world_data(defaults(),&cancel),Err(WarcraftMapError::Cancelled))); assert!(!source.reads.lock().unwrap().iter().any(|s|s=="war3mapunits.doo")); drop(session); assert_eq!(cache.stats().entries,0);
}
