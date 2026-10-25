// Author: MiYu. Inspect native placement graphs and shared source models without materializing an editor project.
use mengine_assets::{AssetByteCache,WarcraftArchives,WarcraftMapSession,WarcraftMapDefinitions,WarcraftDefinitionCache,WarcraftResourceCache,WarcraftPlacedWorld};
use sha2::{Digest,Sha256};
use std::{path::PathBuf,sync::Arc};
fn main()->Result<(),Box<dyn std::error::Error>> {
    let mut args=std::env::args_os().skip(1); let game=PathBuf::from(args.next().ok_or("Provide game directory and maps")?); let paths=args.map(PathBuf::from).collect::<Vec<_>>(); if paths.is_empty() {return Err("Provide map paths".into());}
    let bytes=Arc::new(AssetByteCache::default()); let archives=WarcraftArchives::open(&game,0,bytes.clone(),32*1024*1024)?; let definitions=WarcraftDefinitionCache::default(); let resources=WarcraftResourceCache::default(); let mut results=vec![];
    for path in paths {
        let session=WarcraftMapSession::open(&archives,&path,Default::default(),&Default::default())?; let world=Arc::new(session.load_world_data(Default::default(),&Default::default())?); let defs=Arc::new(WarcraftMapDefinitions::load(&session,world,&definitions,Default::default(),&Default::default())?); let placed=WarcraftPlacedWorld::load(&session,defs,&resources,Default::default(),[1,1],&Default::default())?; let map=session.source(); let before=bytes.stats(); drop(session); let after=bytes.stats();
        let models=placed.models.iter().map(|m|serde_json::json!({"member":m.source.location.member,"mapOverride":m.source.location.source==map,"bytes":m.source.bytes.len(),"sha256":format!("{:x}",Sha256::digest(&m.source.bytes)),"decodedBytes":m.model.decoded_bytes(),"billboard":m.model.has_billboard_nodes(),"sequences":m.model.sequences().iter().map(|s|serde_json::json!({"name":s.name,"start":s.start_ms,"end":s.end_ms,"rarity":s.rarity,"nonLooping":s.non_looping})).collect::<Vec<_>>(),"initialPoseError":m.model.sample(m.model.sequences().iter().position(|s|s.name.eq_ignore_ascii_case("Stand")),0,None).err().map(|e|e.to_string()),"diagnostics":m.model.diagnostics()})).collect::<Vec<_>>();
        results.push(serde_json::json!({"path":path,"nodes":placed.nodes,"appearances":placed.appearances,"models":models,"doodadRandomState":placed.doodad_random_state,"unitRandomState":placed.unit_random_state,"cache":resources.stats(),"sessionClosed":true,"mapCacheBytesReleased":before.resident_bytes-after.resident_bytes}));
    }
    println!("{}",serde_json::json!({"scope":"Native source visual placements and models only; effects, random evaluation, JASS and full game startup remain separate consumers","maps":results})); Ok(())
}
