//! MiYu: render a project with the editor's native Game View renderer and export its GPU pixels.
use mengine_editor_host::{EditorViewportRenderer, ProjectSession};
use std::path::PathBuf;

fn main() -> anyhow::Result<()> {
    let args=std::env::args().skip(1).collect::<Vec<_>>();
    anyhow::ensure!(args.len()==2,"Usage: render_asset_preview <project-root> <output.png>");
    let root=std::fs::canonicalize(&args[0])?;
    let output=PathBuf::from(&args[1]);
    let mut project=ProjectSession::open(&root)?;
    project.open_main_scene()?;
    let mut renderer=pollster::block_on(EditorViewportRenderer::new(root,1280,1024))?;
    let frame=renderer.render_game(project.active_world(),1280,1024)?;
    anyhow::ensure!(frame.has_authored_camera,"Preview scene requires an authored camera");
    image::save_buffer(&output,&frame.rgba,frame.width,frame.height,image::ColorType::Rgba8)?;
    std::fs::write(output.with_extension("profile.json"),serde_json::to_vec_pretty(&frame.profile)?)?;
    println!("Rendered native Game View {}x{}: {}",frame.width,frame.height,output.display());
    Ok(())
}
