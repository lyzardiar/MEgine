// Author: MiYu. Verify native map formats, quotas, cancellation and source lifetime with small authored members.
use super::*;
use crate::{AssetByteCache,AssetByteSource,AssetSourceRead};
use std::{collections::BTreeMap,sync::Mutex};

fn int(out:&mut Vec<u8>,value:i32) {out.extend(value.to_le_bytes());}
fn float(out:&mut Vec<u8>,value:f32) {out.extend(value.to_le_bytes());}
fn text(out:&mut Vec<u8>,value:&str) {out.extend(value.as_bytes()); out.push(0);}

struct InfoFixture {bytes:Vec<u8>,player_at:usize,float_at:usize,tail_at:usize}
fn info(version:i32)->InfoFixture {
    let mut b=Vec::new(); for n in [version,7,6060] {int(&mut b,n);} for s in ["TRIGSTR_0001","Author","Description","2 players"] {text(&mut b,s);}
    let float_at=b.len(); for n in 0..8 {float(&mut b,n as f32*128.);} for n in [1,2,3,4,2,1,0x12345678] {int(&mut b,n);} b.push(b'L');
    int(&mut b,5); if version==25 {text(&mut b,"Loading.mdx");} for s in ["Loading text","Loading title","Loading subtitle"] {text(&mut b,s);} int(&mut b,2);
    if version==25 {text(&mut b,"Prologue.mdx");} for s in ["Prologue text","Prologue title","Prologue subtitle"] {text(&mut b,s);}
    if version==25 {int(&mut b,1); for n in [64.,256.,0.5] {float(&mut b,n);} b.extend([1,2,3,4]); b.extend(b"RAhr"); text(&mut b,"Default"); b.push(b'L'); b.extend([5,6,7,8]);}
    let player_at=b.len(); int(&mut b,2);
    for id in [3,1] {for n in [id,1,2,1] {int(&mut b,n);} text(&mut b,&format!("Player{id}")); float(&mut b,id as f32*32.); float(&mut b,-128.); int(&mut b,0x1234); int(&mut b,-1);}
    int(&mut b,1); int(&mut b,0x21); int(&mut b,10); text(&mut b,"Force");
    let tail_at=b.len(); int(&mut b,1); int(&mut b,10); b.extend(b"Rhme"); int(&mut b,2); int(&mut b,1);
    int(&mut b,1); int(&mut b,8); b.extend(b"hfoo");
    int(&mut b,1); int(&mut b,4); text(&mut b,"Random units"); int(&mut b,2); int(&mut b,0); int(&mut b,1); int(&mut b,2);
    for (chance,a,c) in [(25,b"hfoo",b"hrif"),(75,b"ogru",b"opeo")] {int(&mut b,chance); b.extend(a); b.extend(c);}
    if version==25 {int(&mut b,1); int(&mut b,9); text(&mut b,"Random items"); int(&mut b,2); int(&mut b,0); int(&mut b,1); int(&mut b,100); b.extend(b"ratf");}
    InfoFixture {bytes:b,player_at,float_at,tail_at}
}
fn terrain(size:[i32;2])->Vec<u8> {
    let mut b=b"W3E!".to_vec(); int(&mut b,11); b.push(b'L'); int(&mut b,1); int(&mut b,2); b.extend(b"LdrtLgrs"); int(&mut b,1); b.extend(b"CLdi"); for n in size {int(&mut b,n);} float(&mut b,-128.); float(&mut b,-256.);
    for index in 0..size[0]*size[1] {b.extend((8192+index as i16*512).to_le_bytes()); b.extend(0xe200u16.to_le_bytes()); b.extend([0xf3,0xab,0x72]);} b
}
fn pathing(size:[i32;2])->Vec<u8> {let mut b=b"MP3W".to_vec(); for n in [0,size[0],size[1]] {int(&mut b,n);} b.extend((0..size[0]*size[1]).map(|n|n as u8)); b}
pub(super) fn defaults()->WarcraftMapLimits {WarcraftMapLimits::default()}
pub(super) fn is_format<T>(r:Result<T>) {assert!(matches!(r,Err(WarcraftMapError::Format {..})));}
pub(super) fn is_limit<T>(r:Result<T>) {assert!(matches!(r,Err(WarcraftMapError::Limit {..})));}

#[test]
fn native_warcraft_map_terrain_preserves_packed_corners_and_shared_bytes() {
    let bytes:Arc<[u8]>=terrain([3,2]).into(); let map=WarcraftMapTerrain::parse(bytes.clone(),defaults()).unwrap();
    assert!(Arc::ptr_eq(&bytes,&map.bytes)); assert_eq!(map.size(),[3,2]); assert_eq!(map.tile_size(),[2,1]); assert_eq!(map.origin(),[-128.,-256.]); assert_eq!(map.tileset(),b'L'); assert_eq!(map.custom_tileset(),1);
    assert_eq!(map.ground_tilesets(),&[*b"Ldrt",*b"Lgrs"]); assert_eq!(map.cliff_tilesets(),&[*b"CLdi"]); assert_eq!(map.packed_corners().len(),42);
    let c=map.corner(2,1).unwrap(); assert_eq!(c,WarcraftTerrainCorner {ground:10752,water:0xe200,flags:0xf3,variation:0xab,cliff:0x72}); assert_eq!((c.ground_height(),c.water_height()),(5.,1.)); assert_eq!((c.ground_texture(),c.cliff_texture(),c.layer()),(3,7,2));
    assert!(c.is_ramp() && c.is_blight() && c.has_water() && c.is_boundary() && c.is_map_edge()); assert_eq!(map.source_vertex(2,1),Some([128.,-128.,640.])); assert_eq!(map.corner(3,0),None); assert_eq!(map.corner(0,2),None);
}

#[test]
fn native_warcraft_map_terrain_rejects_bad_headers_dimensions_lengths_and_quotas() {
    let bytes=terrain([3,2]);
    for length in [0,4,8,17,bytes.len()-1] {is_format(WarcraftMapTerrain::parse(Arc::from(&bytes[..length]),defaults()));}
    for (at,value) in [(0,0),(4,10),(33,1),(37,-1),(41,f32::NAN.to_bits() as i32)] {let mut b=bytes.clone(); b[at..at+4].copy_from_slice(&value.to_le_bytes()); is_format(WarcraftMapTerrain::parse(b.into(),defaults()));}
    let mut b=bytes.clone(); b.push(0); is_format(WarcraftMapTerrain::parse(b.into(),defaults()));
    for limits in [WarcraftMapLimits {max_terrain_vertices:5,..defaults()},WarcraftMapLimits {max_member_bytes:bytes.len()-1,..defaults()},WarcraftMapLimits {max_decoded_bytes:11,..defaults()},WarcraftMapLimits {max_records:1,..defaults()}] {is_limit(WarcraftMapTerrain::parse(bytes.clone().into(),limits));}
}

#[test]
fn native_warcraft_map_pathing_preserves_all_flags_and_half_open_source_grid() {
    let mut bytes=pathing([8,4]); bytes[16]=0xff; bytes[47]=0xa5; let bytes:Arc<[u8]>=bytes.into(); let p=WarcraftMapPathing::parse(bytes.clone(),defaults()).unwrap();
    assert!(Arc::ptr_eq(&bytes,&p.bytes)); assert_eq!(p.size(),[8,4]); assert_eq!(p.cells().len(),32); assert_eq!(p.cell(0,0),Some(255)); assert_eq!(p.cell(7,3),Some(165)); assert_eq!(p.cell(8,0),None);
    for (point,want) in [([-128.,-256.],Some(255)),([-96.,-256.],Some(1)),([127.9,-128.1],Some(165)),([-128.01,-256.],None),([128.,-256.],None),([-128.,-128.],None)] {assert_eq!(p.at_source([-128.,-256.],point).unwrap(),want,"{point:?}");}
    is_format(p.at_source([f32::INFINITY,0.],[0.,0.])); is_format(p.at_source([0.,0.],[0.,f32::NAN]));
}

#[test]
fn native_warcraft_map_pathing_rejects_bad_counts_versions_and_quotas() {
    let bytes=pathing([8,4]);
    for (at,value) in [(0,0i32),(4,1),(8,0),(12,-1)] {let mut b=bytes.clone(); b[at..at+4].copy_from_slice(&value.to_le_bytes()); is_format(WarcraftMapPathing::parse(b.into(),defaults()));}
    for length in [0,15,bytes.len()-1] {is_format(WarcraftMapPathing::parse(Arc::from(&bytes[..length]),defaults()));}
    let mut b=bytes.clone(); b.push(0); is_format(WarcraftMapPathing::parse(b.into(),defaults()));
    for limits in [WarcraftMapLimits {max_pathing_cells:31,..defaults()},WarcraftMapLimits {max_member_bytes:16,..defaults()}] {is_limit(WarcraftMapPathing::parse(bytes.clone().into(),limits));}
}

#[test]
fn native_warcraft_map_info_keeps_classic_versions_screens_and_ordered_tables() {
    for version in [18,25] {
        let fixture=info(version); let i=WarcraftMapInfo::parse(&fixture.bytes,defaults()).unwrap();
        assert_eq!((i.version,i.saves,i.editor_version),(version,7,6060)); assert_eq!((&*i.name,&*i.author,&*i.description,&*i.recommended_players),("TRIGSTR_0001","Author","Description","2 players")); assert_eq!(i.camera_bounds,[0.,128.,256.,384.,512.,640.,768.,896.]); assert_eq!(i.camera_complements,[1,2,3,4]); assert_eq!(i.playable_size,[2,1]); assert_eq!(i.flags,0x12345678); assert_eq!(i.tileset,b'L');
        assert_eq!(i.loading_screen.background,Some(5)); assert_eq!(i.loading_screen.text,"Loading text"); assert_eq!(i.loading_screen.title,"Loading title"); assert_eq!(i.loading_screen.subtitle,"Loading subtitle"); assert_eq!(i.game_data_set,2); assert_eq!(i.prologue_screen.background,None); assert_eq!(i.prologue_screen.text,"Prologue text"); assert_eq!(i.prologue_screen.title,"Prologue title"); assert_eq!(i.prologue_screen.subtitle,"Prologue subtitle");
        assert_eq!(i.players.iter().map(|p|p.id).collect::<Vec<_>>(),[3,1]); assert_eq!(i.players[0],WarcraftMapPlayer {id:3,kind:1,race:2,fixed_start_position:1,name:"Player3".into(),start_location:[96.,-128.],ally_low_priorities:0x1234,ally_high_priorities:u32::MAX}); assert_eq!(i.forces[0],WarcraftMapForce {flags:0x21,player_mask:10,name:"Force".into()});
        assert_eq!(i.upgrades[0],WarcraftMapUpgrade {player_flags:10,id:*b"Rhme",level:2,availability:1}); assert_eq!(i.tech[0],WarcraftMapTech {player_flags:8,id:*b"hfoo"});
        let u=&i.random_units[0]; assert_eq!((u.id,u.name.as_str()),(4,"Random units")); assert_eq!(u.column_types,[0,1]); assert_eq!(u.choices[0],WarcraftMapRandomUnitChoice {chance:25,ids:vec![*b"hfoo",*b"hrif"]}); assert_eq!(u.choices[1].chance,75); assert_eq!(u.choices[1].ids,vec![*b"ogru",*b"opeo"]); assert!(!i.omitted_editor_tables); assert!(i.editor_table_tail.is_empty());
        if version==25 {assert_eq!(i.loading_screen.model,"Loading.mdx"); assert_eq!(i.prologue_screen.model,"Prologue.mdx"); assert_eq!(i.fog,Some(WarcraftMapFog {style:1,height:[64.,256.],density:0.5,color:[1,2,3,4]})); assert_eq!(i.global_weather,u32::from_le_bytes(*b"RAhr")); assert_eq!(i.sound_environment,"Default"); assert_eq!(i.light_environment_tileset,Some(b'L')); assert_eq!(i.water_vertex_color,Some([5,6,7,8])); assert_eq!(i.random_items[0],WarcraftMapRandomItems {id:9,name:"Random items".into(),sets:vec![vec![],vec![WarcraftMapRandomItemChoice {chance:100,id:*b"ratf"}]]});}
        else {assert!(i.loading_screen.model.is_empty() && i.prologue_screen.model.is_empty()); assert!(i.fog.is_none() && i.water_vertex_color.is_none() && i.light_environment_tileset.is_none()); assert_eq!(i.global_weather,0); assert!(i.sound_environment.is_empty() && i.random_items.is_empty());}
        for tail in [vec![],vec![0xff]] {let mut b=fixture.bytes[..fixture.tail_at].to_vec(); b.extend(&tail); let i=WarcraftMapInfo::parse(&b,defaults()).unwrap(); assert!(i.omitted_editor_tables); assert_eq!(i.editor_table_tail,tail); assert!(i.upgrades.is_empty() && i.tech.is_empty() && i.random_units.is_empty() && i.random_items.is_empty());}
    }
}

#[test]
fn native_warcraft_map_info_rejects_invalid_input_and_allocation_amplification() {
    let f=info(25);
    for (at,value) in [(0,28),(f.player_at,-1),(f.player_at,i32::MAX),(f.float_at,f32::INFINITY.to_bits() as i32)] {let mut b=f.bytes.clone(); b[at..at+4].copy_from_slice(&value.to_le_bytes()); is_format(WarcraftMapInfo::parse(&b,defaults()));}
    let mut b=f.bytes.clone(); b[12]=0xff; is_format(WarcraftMapInfo::parse(&b,defaults())); is_format(WarcraftMapInfo::parse(&f.bytes[..15],defaults()));
    for length in [0,3,f.player_at+1,f.tail_at+3,f.bytes.len()-1] {is_format(WarcraftMapInfo::parse(&f.bytes[..length],defaults()));}
    let mut b=f.bytes.clone(); b.push(0); is_format(WarcraftMapInfo::parse(&b,defaults()));
    for limits in [WarcraftMapLimits {max_decoded_bytes:1,..defaults()},WarcraftMapLimits {max_string_bytes:2,..defaults()},WarcraftMapLimits {max_records:1,..defaults()},WarcraftMapLimits {max_member_bytes:f.bytes.len()-1,..defaults()}] {is_limit(WarcraftMapInfo::parse(&f.bytes,limits));}
}

#[test]
fn native_warcraft_map_strings_preserve_bom_crlf_multiline_empty_and_unresolved_values() {
    let bytes:Arc<[u8]>=Arc::from(&b"\xef\xbb\xbf// comment\r\n STRING 0002 \r\n// before brace\r\n{\r\nline one\r\n // literal comment\r\nline three\r\n}\r\nSTRING 1\n{\n}\nSTRING 3\n{\nvalue\n}"[..]);
    let t=WarcraftStringTable::parse(bytes.clone(),defaults()).unwrap(); assert_eq!(Arc::strong_count(&bytes),2); assert_eq!(t.len(),3); assert!(!t.is_empty()); assert_eq!(t.get(2),Some("line one\r\n // literal comment\r\nline three")); assert_eq!(t.get(1),Some("")); assert_eq!(t.get(3),Some("value")); assert_eq!(t.resolve("TRIGSTR_0003"),"value");
    for s in ["TRIGSTR_9","trigstr_3","TRIGSTR_-3","TRIGSTR_","TRIGSTR_4294967296","literal"] {assert_eq!(t.resolve(s),s);}
    assert_eq!(t.iter().map(|(id,_)|id).collect::<Vec<_>>(),[1,2,3]); assert!(t.iter().all(|(id,value)|t.get(id)==Some(value)));
    assert!(WarcraftStringTable::parse(Arc::from(&b"//empty"[..]),defaults()).unwrap().is_empty());
}

#[test]
fn native_warcraft_map_strings_reject_duplicate_normalized_ids_bad_syntax_and_quotas() {
    for bytes in [&b"STRING 1\n{\na\n}\nSTRING 001\n{\nb\n}"[..],b"STRING 1\n{",b"STRING 1\n{oops",b"STRING 1\nx",b"STRING -1\n{\n}\n",b"STRING 4294967296\n{\n}\n",b"STRING1\n{\n}\n",b"\xff"] {is_format(WarcraftStringTable::parse(Arc::from(bytes),defaults()));}
    let b=&b"STRING 1\n{\nabc\n}\nSTRING 2\n{\ndef\n}\n"[..];
    for limits in [WarcraftMapLimits {max_text_bytes:5,..defaults()},WarcraftMapLimits {max_string_bytes:2,..defaults()},WarcraftMapLimits {max_records:1,..defaults()},WarcraftMapLimits {max_decoded_bytes:1,..defaults()},WarcraftMapLimits {max_member_bytes:5,..defaults()}] {is_limit(WarcraftStringTable::parse(Arc::from(b),limits));}
}

pub(super) struct MemorySource {pub(super) id:AssetSourceId,pub(super) files:BTreeMap<String,Arc<[u8]>>,pub(super) reads:Mutex<Vec<String>>}
impl MemorySource {pub(super) fn new(files:Vec<(&str,Vec<u8>)>)->Arc<Self> {Arc::new(Self {id:AssetSourceId::fresh(),files:files.into_iter().map(|(k,v)|(k.into(),v.into())).collect(),reads:Mutex::new(vec![])})}}
impl AssetByteSource for MemorySource {
    fn identity(&self)->AssetSourceId {self.id}
    fn read(&self,member:&str)->std::result::Result<AssetSourceRead,AssetError> {self.reads.lock().unwrap().push(member.into()); Ok(self.files.get(member).map(|b|AssetSourceRead::Bytes(b.clone())).unwrap_or(AssetSourceRead::Missing))}
}
pub(super) fn map_source()->Arc<MemorySource> {MemorySource::new(vec![("war3map.w3i",info(25).bytes),("war3map.w3e",terrain([3,2])),("war3map.wpm",pathing([8,4])),("war3map.wts",b"STRING 1\n{\nMap name\n}\n".to_vec()),("units/a.mdx",b"override".to_vec())])}
pub(super) fn scope(source:Arc<MemorySource>,common:Arc<MemorySource>,cache:Arc<AssetByteCache>)->ScopedWarcraftMap {ScopedWarcraftMap::new("authored-map.w3x".into(),source,vec![common],cache)}

#[test]
fn native_warcraft_map_session_shares_common_assets_and_releases_only_its_map() {
    let cache=Arc::new(AssetByteCache::default()); let common=MemorySource::new(vec![("shared.blp",b"common".to_vec())]); let common_mounts=AssetMounts::new(vec![common.clone()],cache.clone()); let public=common_mounts.read("shared.blp").unwrap();
    let source=map_source(); let weak=Arc::downgrade(&source); let id=source.id; let mut phases=vec![];
    let session=WarcraftMapSession::load(scope(source,common.clone(),cache.clone()),defaults(),&WarcraftMapCancelToken::default(),|p|{assert_eq!(p.total,6); assert_eq!(p.completed,phases.len()+1); phases.push(p.phase);}).unwrap();
    assert_eq!(phases,[WarcraftMapLoadPhase::Info,WarcraftMapLoadPhase::Terrain,WarcraftMapLoadPhase::Pathing,WarcraftMapLoadPhase::Strings,WarcraftMapLoadPhase::Validate,WarcraftMapLoadPhase::DataReady]);
    assert_eq!(session.display_name(),"Map name"); assert_eq!(session.path(),Path::new("authored-map.w3x")); assert_eq!(session.source(),id); assert_eq!(session.terrain().size(),[3,2]); assert_eq!(session.pathing().size(),[8,4]); assert_eq!(session.pathing_at_source([-128.,-256.]).unwrap(),Some(0)); assert!(session.diagnostics().is_empty());
    let map_bytes=session.assets().read("units/a.mdx").unwrap(); assert_eq!(map_bytes.location.source,id); assert_eq!(&*map_bytes.bytes,b"override"); assert!(Arc::ptr_eq(&public.bytes,&session.assets().read("shared.blp").unwrap().bytes));
    let retained=session.members()[1].bytes.clone(); assert!(Arc::ptr_eq(&retained,&session.terrain().bytes)); assert_eq!(cache.stats().entries,6); drop(session);
    assert!(weak.upgrade().is_none()); assert_eq!(cache.stats().entries,1); assert_eq!(cache.stats().resident_bytes,6); assert_eq!(&*map_bytes.bytes,b"override"); assert_eq!(&*retained,&terrain([3,2])); assert!(Arc::ptr_eq(&public.bytes,&common_mounts.read("shared.blp").unwrap().bytes)); assert_eq!(common.reads.lock().unwrap().len(),1);
}

#[test]
fn native_warcraft_map_sessions_do_not_mix_map_identity_or_drop_another_session() {
    let cache=Arc::new(AssetByteCache::default()); let common=MemorySource::new(vec![]); let a=map_source(); let b=map_source();
    let first=WarcraftMapSession::load(scope(a.clone(),common.clone(),cache.clone()),defaults(),&WarcraftMapCancelToken::default(),|_|{}).unwrap(); let second=WarcraftMapSession::load(scope(b.clone(),common,cache.clone()),defaults(),&WarcraftMapCancelToken::default(),|_|{}).unwrap();
    assert_ne!(first.source(),second.source()); assert_eq!(cache.stats().entries,8); drop(first); assert_eq!(cache.stats().entries,4);
    let reads=b.reads.lock().unwrap().len(); let current=second.assets().read("war3map.w3e").unwrap(); assert!(Arc::ptr_eq(&current.bytes,&second.terrain().bytes)); assert_eq!(b.reads.lock().unwrap().len(),reads); drop(second); assert_eq!(cache.stats().entries,0);
}

#[test]
fn native_warcraft_map_session_core_members_never_fall_back_to_common_archives() {
    let cache=Arc::new(AssetByteCache::default()); let common=MemorySource::new(vec![("war3map.wpm",pathing([8,4]))]); let mut source=map_source(); Arc::get_mut(&mut source).unwrap().files.remove("war3map.wpm"); let weak=Arc::downgrade(&source);
    let result=WarcraftMapSession::load(scope(source,common.clone(),cache.clone()),defaults(),&WarcraftMapCancelToken::default(),|_|{});
    assert!(matches!(result,Err(WarcraftMapError::Resource(AssetError::NotFound(_))))); assert!(common.reads.lock().unwrap().is_empty()); assert!(weak.upgrade().is_none()); assert_eq!(cache.stats().entries,0);
}

#[test]
fn native_warcraft_map_session_cancellation_stops_before_next_member_and_releases_cache() {
    for (phase,reads) in [(WarcraftMapLoadPhase::Info,0),(WarcraftMapLoadPhase::Terrain,1),(WarcraftMapLoadPhase::Pathing,2),(WarcraftMapLoadPhase::Strings,3),(WarcraftMapLoadPhase::Validate,4),(WarcraftMapLoadPhase::DataReady,4)] {
        let cache=Arc::new(AssetByteCache::default()); let source=map_source(); let cancel=WarcraftMapCancelToken::default(); let result=WarcraftMapSession::load(scope(source.clone(),MemorySource::new(vec![]),cache.clone()),defaults(),&cancel,|p|if p.phase==phase {cancel.cancel();});
        assert!(matches!(result,Err(WarcraftMapError::Cancelled))); assert_eq!(source.reads.lock().unwrap().len(),reads); assert_eq!(cache.stats().entries,0);
    }
    let cancel=WarcraftMapCancelToken::default(); cancel.cancel(); let mut calls=0; assert!(matches!(report(&cancel,&mut |_|calls+=1,WarcraftMapLoadPhase::Mount,0),Err(WarcraftMapError::Cancelled))); assert_eq!(calls,0);
}

#[test]
fn native_warcraft_map_session_rejects_mismatch_and_limits_but_keeps_recoverable_wts_bytes() {
    for mode in [0,1,2,3,4,5] {
        let cache=Arc::new(AssetByteCache::default()); let mut source=map_source(); let s=Arc::get_mut(&mut source).unwrap(); let mut limits=defaults();
        match mode {0=>{s.files.insert("war3map.wpm".into(),pathing([4,8]).into());},1=>limits.max_data_bytes=info(25).bytes.len()+terrain([3,2]).len()-1,2=>limits.max_member_bytes=16,3=>{s.files.insert("war3map.wts".into(),Arc::from(&b"malformed WTS"[..]));},4=>{s.files.remove("war3map.wts");},5=>limits.max_text_bytes=1,_=>unreachable!()}
        let result=WarcraftMapSession::load(scope(source,MemorySource::new(vec![]),cache.clone()),limits,&WarcraftMapCancelToken::default(),|_|{});
        match mode {0=>is_format(result),1|2=>assert!(matches!(result,Err(WarcraftMapError::Resource(AssetError::Invalid(_))))),3=>{let session=result.unwrap(); assert!(session.strings().is_none()); assert_eq!(session.display_name(),"TRIGSTR_0001"); assert_eq!(session.diagnostics().len(),1); assert_eq!(&*session.members().last().unwrap().bytes,b"malformed WTS");},4=>{let session=result.unwrap(); assert!(session.strings().is_none()); assert!(session.diagnostics().is_empty()); assert_eq!(session.members().len(),3);},5=>is_limit(result),_=>unreachable!()}
        assert_eq!(cache.stats().entries,0);
    }
}
