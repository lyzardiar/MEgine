//! Minimal IDL parser + codegen for MEngine.
//! IDL syntax (line-oriented):
//!   component Name { field: type [= default] }
//!   command Name { ... }
//!   resource Name { ... }

mod emit;
mod parse;

use anyhow::{Context, Result};
use clap::Parser;
use std::fs;
use std::path::PathBuf;
use walkdir::WalkDir;

#[derive(Parser, Debug)]
#[command(name = "mengine-idl", about = "MEngine IDL codegen")]
struct Args {
    #[arg(long, default_value = "idl")]
    idl_dir: PathBuf,

    #[arg(long, default_value = "crates/mengine-core/src/generated")]
    out_rust: PathBuf,

    #[arg(long, default_value = "packages/api/src/generated")]
    out_ts: PathBuf,
}

fn main() -> Result<()> {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
    let args = Args::parse();

    let mut units = Vec::new();
    for entry in WalkDir::new(&args.idl_dir)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("idl") {
            continue;
        }
        let text = fs::read_to_string(path).with_context(|| format!("read {}", path.display()))?;
        let parsed =
            parse::parse_idl(&text).with_context(|| format!("parse {}", path.display()))?;
        log::info!("parsed {} ({} defs)", path.display(), parsed.len());
        units.extend(parsed);
    }

    fs::create_dir_all(&args.out_rust)?;
    fs::create_dir_all(&args.out_ts)?;

    let rust = emit::emit_rust(&units);
    let ts = emit::emit_typescript(&units);
    let schema = emit::emit_json_schema(&units);

    fs::write(args.out_rust.join("mod.rs"), rust)?;
    fs::write(args.out_ts.join("components.ts"), &ts)?;
    fs::write(args.out_ts.join("schema.json"), schema)?;
    fs::write(
        args.out_ts.join("index.ts"),
        "export * from './components';\n",
    )?;

    log::info!("codegen OK → {:?} / {:?}", args.out_rust, args.out_ts);
    Ok(())
}
