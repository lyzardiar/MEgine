// Author: MiYu. Decode one mounted Warcraft texture in memory and optionally compare an independent RGBA reference.
use mengine_assets::{decode_texture_rgba8, AssetByteCache, WarcraftArchives};
use sha2::{Digest, Sha256};
use std::{path::PathBuf, sync::Arc, time::Instant};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args_os().skip(1);
    let game = PathBuf::from(args.next().ok_or("Provide game directory, map path, member name and optional reference RGBA file")?);
    let map = PathBuf::from(args.next().ok_or("Provide .w3m or .w3x map path")?);
    let member = args.next().ok_or("Provide an archive texture member name")?.into_string().map_err(|_| "Member name must be Unicode")?;
    let reference = args.next().map(PathBuf::from);
    if args.next().is_some() { return Err("Unexpected argument after optional RGBA reference".into()); }
    let cache = Arc::new(AssetByteCache::default()); let archives = WarcraftArchives::open(&game, 0, cache.clone(), 256 * 1024 * 1024)?;
    let mounted = archives.mount_map(&map)?; let started = Instant::now(); let bytes = mounted.read_texture_bytes(&member)?; let read_ms = started.elapsed().as_secs_f64() * 1000.;
    let started = Instant::now(); let texture = decode_texture_rgba8(&bytes.bytes, &bytes.location.member)?; let decode_ms = started.elapsed().as_secs_f64() * 1000.;
    let mut comparison = None;
    if let Some(reference) = reference {
        if std::fs::metadata(&reference)?.len() != texture.pixels.len() as u64 { return Err("RGBA reference length differs from decoded texture".into()); }
        let reference = std::fs::read(reference)?; let mut changed = [0u64; 4]; let mut max_delta = [0u8; 4]; let mut total_delta = [0u64; 4];
        for (index, (actual, expected)) in texture.pixels.iter().zip(&reference).enumerate() { let delta = actual.abs_diff(*expected); let channel = index % 4; changed[channel] += u64::from(delta != 0); max_delta[channel] = max_delta[channel].max(delta); total_delta[channel] += u64::from(delta); }
        comparison = Some(serde_json::json!({"referenceSha256":format!("{:x}",Sha256::digest(&reference)),"changedChannels":changed,"maxChannelDelta":max_delta,"totalChannelDelta":total_delta}));
    }
    let mut alpha_counts = [0u64; 3]; for alpha in texture.pixels.chunks_exact(4).map(|p| p[3]) { alpha_counts[if alpha == 0 { 0 } else if alpha == 255 { 2 } else { 1 }] += 1; }
    let warm = mounted.read_texture_bytes(&member)?; assert!(Arc::ptr_eq(&bytes.bytes, &warm.bytes)); let location = bytes.location.clone();
    drop(mounted); let remounted = archives.mount_map(&map)?.read_texture_bytes(&member)?;
    let common_reused = location.source == remounted.location.source && Arc::ptr_eq(&bytes.bytes, &remounted.bytes);
    let stats = cache.stats();
    println!("{}", serde_json::json!({"scope":"One texture, archive bytes to RGBA memory; no disk export, GPU upload, decoded cache or full map execution", "requestedMember":member,"resolvedMember":location.member,"source":format!("{:?}",location.source),"sourceSha256":format!("{:x}",Sha256::digest(&bytes.bytes)),"size":[texture.width,texture.height],"rgbaBytes":texture.pixels.len(),"rgbaSha256":format!("{:x}",Sha256::digest(&texture.pixels)),"alphaCountsTransparentPartialOpaque":alpha_counts,"readMs":read_ms,"decodeMs":decode_ms,"rawBytesSharedAfterRemount":common_reused,"reference":comparison,"rawCache":{"entries":stats.entries,"residentBytes":stats.resident_bytes}}));
    Ok(())
}
