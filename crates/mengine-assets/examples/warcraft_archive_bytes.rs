// Author: MiYu. Inspect native MPQ byte resources and common-cache reuse without converting or exporting a map.
use mengine_assets::{AssetByteCache, WarcraftArchives};
use sha2::{Digest, Sha256};
use std::{path::PathBuf, sync::Arc, time::Instant};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args_os().skip(1);
    let game = PathBuf::from(args.next().ok_or("Provide the Warcraft game directory and a map path")?);
    let map = PathBuf::from(args.next().ok_or("Provide a .w3m or .w3x path")?);
    if args.next().is_some() { return Err("Expected only game directory and map path".into()); }
    let started = Instant::now(); let cache = Arc::new(AssetByteCache::default());
    let archives = WarcraftArchives::open(&game, 0, cache.clone(), 256 * 1024 * 1024)?;
    let common = archives.common(); let model = common.read("Units/Human/Footman/Footman.mdx")?;
    let mounted = archives.mount_map(&map)?; let open_ms = started.elapsed().as_secs_f64() * 1000.;
    let mut records = Vec::new();
    for member in ["war3map.w3i", "scripts/war3map.j", "Units/Human/Footman/Footman.mdx", "ReplaceableTextures/CommandButtons/BTNFootman.blp"] {
        let read = Instant::now(); let value = mounted.read(member)?; let read_ms = read.elapsed().as_secs_f64() * 1000.;
        assert!(Arc::ptr_eq(&value.bytes, &mounted.read(member)?.bytes));
        records.push(serde_json::json!({"member":member,"source":format!("{:?}",value.location.source),"bytes":value.bytes.len(),"sha256":format!("{:x}",Sha256::digest(&value.bytes)),"readMs":read_ms}));
    }
    let in_map = mounted.read("units/human/footman/footman.mdx")?;
    let same_common = in_map.location.source == model.location.source;
    if same_common { assert!(Arc::ptr_eq(&in_map.bytes, &model.bytes)); }
    drop(mounted);
    assert!(Arc::ptr_eq(&common.read("Units/Human/Footman/Footman.mdx")?.bytes, &model.bytes));
    let next_map = archives.mount_map(&map)?;
    if same_common { assert!(Arc::ptr_eq(&next_map.read("Units/Human/Footman/Footman.mdx")?.bytes, &model.bytes)); }
    let stats = cache.stats();
    println!("{}", serde_json::json!({"scope":"Native member reading only; no map world or original game timing measurement","openAndWarmModelMs":open_ms,"records":records,"sameCommonModel":same_common,"cache":{"entries":stats.entries,"residentBytes":stats.resident_bytes,"hits":stats.hits,"misses":stats.misses,"evictions":stats.evictions,"bypasses":stats.bypasses}}));
    Ok(())
}
