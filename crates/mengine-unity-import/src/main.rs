//! Offline Unity package importer. Author: MiYu.
use anyhow::{bail, Context, Result};
use std::path::Path;
fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let command = args.get(1).context(
        "Usage: mengine-unity-import analyze PACKAGE | import PACKAGE PROJECT [CONVERTER]",
    )?;
    let source = Path::new(args.get(2).context("Missing package path")?);
    match command.as_str() {
        "analyze" => println!(
            "{}",
            serde_json::to_string_pretty(&mengine_unity_import::analyze(source)?)?
        ),
        "import" => {
            let report = mengine_unity_import::analyze(source)?;
            let root = Path::new(args.get(3).context("Missing project root")?);
            let converter = args.get(4).map(Path::new);
            let result =
                mengine_unity_import::import_package(source, root, &report.fingerprint, converter)?;
            println!("{}", serde_json::to_string_pretty(&result)?);
        }
        _ => bail!("Unknown command {command}"),
    }
    Ok(())
}
