// Author: MiYu. Inspect native source tables and effective object fields without converting or exporting game assets.
use mengine_assets::{AssetByteCache,WarcraftArchives,WarcraftMapSession,WarcraftMapDefinitions,WarcraftDefinitionCache,WarcraftDefinitionTable,WarcraftDefinitionDomain,WarcraftDefinitionValue};
use sha2::{Digest,Sha256};
use std::{path::PathBuf,sync::Arc,collections::{BTreeMap,BTreeSet}};
fn domain(table:WarcraftDefinitionTable)->Option<WarcraftDefinitionDomain> {use WarcraftDefinitionTable::*; match table {UnitUi|UnitData|UnitBalance|UnitWeapons|UnitAbilities|Items=>Some(WarcraftDefinitionDomain::UnitsAndItems),Doodads=>Some(WarcraftDefinitionDomain::Doodads),Destructables=>Some(WarcraftDefinitionDomain::Destructables),_=>None}}
fn value(v:WarcraftDefinitionValue<'_>)->serde_json::Value {match v {WarcraftDefinitionValue::Source(v)=>serde_json::json!({"source":v}),WarcraftDefinitionValue::Override(v)=>serde_json::json!({"override":v})}}
fn main()->Result<(),Box<dyn std::error::Error>> {
    let mut args=std::env::args_os().skip(1); let game=PathBuf::from(args.next().ok_or("Provide game directory and map paths")?); let paths=args.map(PathBuf::from).collect::<Vec<_>>(); if paths.is_empty() {return Err("Provide at least one map path".into());}
    let byte_cache=Arc::new(AssetByteCache::default()); let archives=WarcraftArchives::open(&game,0,byte_cache.clone(),32*1024*1024)?; let cache=WarcraftDefinitionCache::default(); let mut results=vec![];
    for path in paths {
        let session=WarcraftMapSession::open(&archives,&path,Default::default(),&Default::default())?; let world=Arc::new(session.load_world_data(Default::default(),&Default::default())?); let before=cache.stats(); let defs=WarcraftMapDefinitions::load(&session,world,&cache,Default::default(),&Default::default())?; let map_source=session.source(); drop(session);
        let mut tables=vec![];
        for (kind,source) in defs.sources() {
            let columns=defs.source_columns(kind).collect::<Vec<_>>(); let rows=defs.source_ids(kind).map(|id|serde_json::json!({"id":id,"fields":columns.iter().filter_map(|column|defs.source_field(kind,id,column).map(|v|(*column,v))).collect::<BTreeMap<_,_>>()})).collect::<Vec<_>>();
            let mut effective=vec![]; if let Some(d)=domain(kind) {let mut ids=defs.source_ids(kind).collect::<BTreeSet<_>>(); ids.extend(defs.overlay_ids().filter(|(other,_)|*other==d).map(|(_,id)|id));
                for id in ids {let fields=columns.iter().filter_map(|column|defs.field(d,id,kind,column).map(|v|(*column,value(v)))).collect::<BTreeMap<_,_>>(); if !fields.is_empty() {effective.push(serde_json::json!({"id":id,"root":defs.root_id(d,id),"fields":fields}));}}
            }
            tables.push(serde_json::json!({"kind":kind,"member":source.location.member,"mapOverride":source.location.source==map_source,"sha256":format!("{:x}",Sha256::digest(&source.bytes)),"bytes":source.bytes.len(),"rows":rows,"effective":effective}));
        }
        let mut dispositions=BTreeMap::<String,usize>::new(); for r in defs.overrides() {*dispositions.entry(format!("{:?}",r.disposition)).or_default()+=1;}
        results.push(serde_json::json!({"path":path,"tables":tables,"dispositions":dispositions,"decodedCacheBefore":before,"decodedCacheAfter":cache.stats(),"definitionsSurviveSessionClose":true}));
    }
    println!("{}",serde_json::json!({"scope":"Native visual and unit stat definitions; no TXT base profiles, model instantiation, JASS or startup/FPS benchmark","maps":results})); Ok(())
}
