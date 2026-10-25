// Author: MiYu. Inspect source placements and object overrides in memory, without exporting project assets.
use mengine_assets::{AssetByteCache,WarcraftArchives,WarcraftMapCancelToken,WarcraftMapLimits,WarcraftMapSession};
use sha2::{Digest,Sha256};
use std::{path::PathBuf,sync::Arc,time::Instant};

fn main()->Result<(),Box<dyn std::error::Error>> {
    let mut args=std::env::args_os().skip(1); let game=PathBuf::from(args.next().ok_or("Provide game directory and map paths")?); let paths=args.map(PathBuf::from).collect::<Vec<_>>(); if paths.is_empty() {return Err("Provide at least one map path".into());}
    let cache=Arc::new(AssetByteCache::default()); let archives=WarcraftArchives::open(&game,0,cache.clone(),32*1024*1024)?; let common=archives.common().read("Units/Human/Footman/Footman.mdx")?; let baseline=cache.stats(); let mut results=vec![];
    for path in paths {
        let session=WarcraftMapSession::open(&archives,&path,WarcraftMapLimits::default(),&WarcraftMapCancelToken::default())?; let started=Instant::now(); let world=session.load_world_data(WarcraftMapLimits::default(),&WarcraftMapCancelToken::default())?; let load_ms=started.elapsed().as_secs_f64()*1000.;
        let public_shared=Arc::ptr_eq(&common.bytes,&session.assets().read("Units/Human/Footman/Footman.mdx")?.bytes); if !public_shared {return Err("Sharing probe was overridden by this map".into());}
        let members=world.members().iter().map(|m|serde_json::json!({"member":m.location.member,"bytes":m.bytes.len(),"sha256":format!("{:x}",Sha256::digest(&m.bytes))})).collect::<Vec<_>>(); if world.members().iter().any(|m|m.location.source!=session.source()) {return Err("World member came from a different source".into());}
        let before=cache.stats(); drop(session); let after=cache.stats(); if after.entries!=baseline.entries || after.resident_bytes!=baseline.resident_bytes {return Err("Map cache survived session release".into());}
        for (m,expected) in world.members().iter().zip(&members) {if format!("{:x}",Sha256::digest(&m.bytes))!=expected["sha256"].as_str().unwrap() {return Err("Owned source payload changed after release".into());}}
        results.push(serde_json::json!({"path":path,"worldDataMs":load_ms,"doodads":world.doodads,"units":world.units,"objects":world.objects,"members":members,"publicArcShared":public_shared,"mapCacheReleased":true,"ownedPayloadsSurvive":true,"releasedMapCacheBytes":before.resident_bytes-after.resident_bytes,"remainingCacheBytes":after.resident_bytes}));
    }
    println!("{}",serde_json::json!({"scope":"Source world data only; no model instantiation, JASS, GPU or game startup. Debug timings are diagnostic.","maps":results})); Ok(())
}
