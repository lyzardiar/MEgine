//! MiYu: render a project with the editor's native Game View renderer and export its GPU pixels.
use mengine_editor_host::{EditorPlayRuntime, EditorViewportRenderer, PlayProject, ProjectSession, ScriptInput};
use mengine_core::snapshot::WorldSnapshot;
use std::path::PathBuf;

fn main() -> anyhow::Result<()> {
    let args=std::env::args().skip(1).collect::<Vec<_>>();
    anyhow::ensure!(args.len()==2 || args.len()==4 && args[2]=="--play-frames","Usage: render_asset_preview <project-root> <output.png> [--play-frames N]");
    let root=std::fs::canonicalize(&args[0])?;
    let output=PathBuf::from(&args[1]);
    let mut project=ProjectSession::open(&root)?;
    project.open_main_scene()?;
    let height=if args.len()==4 { 720 } else { 1024 };
    let mut renderer=pollster::block_on(EditorViewportRenderer::new(root.clone(),1280,height))?;
    let frame=if args.len()==4 {
        let count=args[3].parse::<usize>()?;
        anyhow::ensure!((1..=600).contains(&count),"Play frame count must be in 1..=600");
        let manifest:serde_json::Value=serde_json::from_slice(&std::fs::read(root.join("project.json"))?)?;
        let source=std::fs::read_to_string(root.join(manifest["startupScript"].as_str().ok_or_else(||anyhow::anyhow!("Missing startupScript"))?))?;
        let runtime=EditorPlayRuntime::default();let generation=runtime.begin();
        runtime.start(generation,source,WorldSnapshot::from_world(project.active_world()),PlayProject { root:Some(root),scene:PathBuf::from(manifest["mainScene"].as_str().unwrap_or_default()),name:manifest["name"].as_str().unwrap_or_default().into(),..PlayProject::default() }).map_err(anyhow::Error::msg)?;
        let mut snapshot=None;
        for i in 0..count {
            let mut input=ScriptInput { viewport:[1280,720],pointer:[640.,230.],..ScriptInput::default() };
            if i==1 { input.key("F1".into(),true); }
            snapshot=Some(runtime.advance(generation,None,input,0.1).map_err(anyhow::Error::msg)?);
        }
        std::fs::write(output.with_extension("play.json"),serde_json::to_vec(snapshot.as_ref().unwrap())?)?;
        runtime.render(generation,move|world|renderer.render_game(world,1280,height).map_err(|error|error.to_string())).map_err(anyhow::Error::msg)?
    } else { renderer.render_game(project.active_world(),1280,height)? };
    anyhow::ensure!(frame.has_authored_camera,"Preview scene requires an authored camera");
    image::save_buffer(&output,&frame.rgba,frame.width,frame.height,image::ColorType::Rgba8)?;
    std::fs::write(output.with_extension("profile.json"),serde_json::to_vec_pretty(&frame.profile)?)?;
    println!("Rendered native Game View {}x{}: {}",frame.width,frame.height,output.display());
    Ok(())
}
