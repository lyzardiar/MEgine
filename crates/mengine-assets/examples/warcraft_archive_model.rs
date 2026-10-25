// Author: MiYu. Decode a mounted native MDX model and compare poses with the pinned independent sampler when requested.
use mengine_assets::{decode_texture_rgba8, AssetByteCache, MdxModel, WarcraftArchives};
use sha2::{Digest,Sha256};
use std::{path::PathBuf,sync::Arc,time::Instant};

fn main() -> Result<(),Box<dyn std::error::Error>> {
    let mut args=std::env::args_os().skip(1); let game=PathBuf::from(args.next().ok_or("Provide game directory, map path, MDX member and optional reference JSON")?);
    let map=PathBuf::from(args.next().ok_or("Provide map path")?); let member=args.next().ok_or("Provide MDX member")?.into_string().map_err(|_|"Member must be Unicode")?; let reference=args.next().map(PathBuf::from);
    if args.next().is_some() {return Err("Unexpected argument".into());}
    let cache=Arc::new(AssetByteCache::default()); let archives=WarcraftArchives::open(&game,0,cache.clone(),128*1024*1024)?; let mounts=archives.mount_map(&map)?;
    let bytes=mounts.read(&member)?; let started=Instant::now(); let model=MdxModel::parse(&bytes.bytes)?; let parse_ms=started.elapsed().as_secs_f64()*1000.;
    let mut samples=0; let mut vertices=0; let mut max_position_delta=0f64; let mut max_normal_delta=0f64;
    if let Some(reference)=reference {
        if std::fs::metadata(&reference)?.len()>128*1024*1024 {return Err("Reference JSON exceeds limit".into());}
        let reference:serde_json::Value=serde_json::from_reader(std::fs::File::open(reference)?)?;
        for clip in reference["clips"].as_array().ok_or("Reference clips missing")? {
            let index=model.sequences().iter().position(|s|Some(s.name.as_str())==clip["name"].as_str()).ok_or("Reference sequence not found")?; let sequence=&model.sequences()[index];
            for frame in clip["frames"].as_array().ok_or("Reference frames missing")?.iter().filter(|f|f["reference"].is_array()) {
                let elapsed=(frame["seconds"].as_f64().ok_or("Reference time missing")?*1000.).round_ties_even() as u64;
                // The independent exporter samples the inclusive source end; the runtime API loops that endpoint.
                if !sequence.non_looping && elapsed>=(sequence.end_ms-sequence.start_ms) as u64 {continue;}
                let pose=model.sample(Some(index),elapsed,None)?; let expected=frame["reference"].as_array().unwrap(); if pose.geosets.len()!=expected.len() {return Err("Reference geoset count differs".into());}
                for (actual,expected) in pose.geosets.iter().zip(expected) {
                    for (field,values,max_delta) in [("positions",&actual.mesh.positions,&mut max_position_delta),("normals",&actual.mesh.normals,&mut max_normal_delta)] {
                        let expected=expected[field].as_array().ok_or("Reference vertex values missing")?; if values.len()!=expected.len() {return Err("Reference vertex count differs".into());}
                        for (actual,expected) in values.iter().zip(expected) {let expected=expected.as_array().ok_or("Reference vertex missing")?; if expected.len()!=3 {return Err("Reference component count differs".into());} for c in 0..3 {*max_delta=(*max_delta).max((actual[c] as f64-expected[c].as_f64().ok_or("Reference component missing")?).abs());}}
                    }
                    vertices+=actual.mesh.positions.len();
                }
                samples+=1;
            }
        }
    }
    let sequence=model.sequences().iter().position(|s|s.name.eq_ignore_ascii_case("Stand")).or_else(||(!model.sequences().is_empty()).then_some(0)); let pose=model.sample(sequence,0,None)?;
    let mut textures=Vec::new(); for texture in model.textures() {let member=texture.default_member(0).ok_or("Texture replacement is missing")?; let bytes=mounts.read_texture_bytes(&member)?; let decoded=decode_texture_rgba8(&bytes.bytes,&bytes.location.member)?; textures.push(serde_json::json!({"member":bytes.location.member,"size":[decoded.width,decoded.height],"rgbaSha256":format!("{:x}",Sha256::digest(&decoded.pixels))}));}
    println!("{}",serde_json::json!({"scope":"Native archive model and texture memory consumer; no map execution or GPU rendering","sourceSha256":format!("{:x}",Sha256::digest(&bytes.bytes)),"name":model.name(),"version":model.version(),"nodes":model.node_count(),"geosets":model.geoset_count(),"sequences":model.sequences().len(),"previewVertices":pose.geosets.iter().map(|g|g.mesh.positions.len()).sum::<usize>(),"parseMs":parse_ms,"diagnostics":model.diagnostics(),"textures":textures,"reference":{"samples":samples,"vertices":vertices,"maxPositionDelta":max_position_delta,"maxNormalDelta":max_normal_delta}}));
    Ok(())
}
