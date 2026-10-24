// Author: MiYu. Preserve UI pixels through idle eviction, reload and project ownership changes.
use super::*;
struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {let root=std::env::temp_dir().join(format!("mengine-ui-retention-{}",uuid::Uuid::new_v4()));std::fs::create_dir(&root).unwrap();Self(root)}
    fn write(&self,key:&str,width:u32,color:[u8;4]) {image::RgbaImage::from_pixel(width,2,image::Rgba(color)).save(self.0.join(key)).unwrap();}
}
impl Drop for Fixture {fn drop(&mut self) {let _=std::fs::remove_dir_all(&self.0);}}
fn plan(keys:&[&str]) -> UiBatchPlan {UiBatchPlan::build(keys.iter().map(|key| {let mut image=UiPrimitive::solid([0.,0.,16.,16.],[1.;4]);image.key.texture=(*key).into();image}).collect())}

#[test]
fn pixels_return_after_eviction_reload_and_project_switch_without_removing_other_owners() {
    let fixture=Fixture::new();fixture.write("a.png",2,[255,0,0,255]);fixture.write("b.png",2,[0,255,0,255]);
    let mut renderer=pollster::block_on(Renderer::new_headless((32,32).into())).unwrap();let target=renderer.create_offscreen_target((32,32).into());let mut cache=RuntimeTextureCache::new(Some(fixture.0.clone()));
    let capture=|renderer:&mut Renderer,plan:&UiBatchPlan| {renderer.submit_frame_to(&mengine_rhi::RenderFrame {clear:mengine_rhi::ClearColor {r:0.,g:0.,b:0.,a:1.},camera:mengine_rhi::FrameCamera {view:Default::default(),proj:Default::default(),position:Default::default()},objects:&[],lighting:&Default::default(),ui:Some(plan),scene_views:&[]},mengine_rhi::RenderTarget::Offscreen(&target)).unwrap();renderer.read_offscreen_rgba8(&target).unwrap()};
    renderer.upload_ui_texture_rgba8("mengine-font://guard",1,1,&[255;4]).unwrap();renderer.upload_ui_texture_rgba8("$scene-view:guard",1,1,&[255;4]).unwrap();renderer.upload_material_texture_rgba8("a.png",1,1,&[255;4],true).unwrap();
    let a=plan(&["a.png"]);let b=plan(&["b.png"]);assert!(cache.sync(&mut renderer,&a).is_empty());let original=capture(&mut renderer,&a);assert!(original.chunks_exact(4).any(|pixel|pixel==[255,0,0,255]));
    for _ in 0..120 {assert!(cache.sync(&mut renderer,&b).is_empty());}assert!(cache.ui_usage.contains_key("a.png"));
    assert!(cache.sync(&mut renderer,&b).is_empty());assert!(!cache.ui_usage.contains_key("a.png"));assert!(!cache.attempted_ui.contains_key("a.png"));assert!(!renderer.remove_ui_texture("a.png"));
    assert!(cache.sync(&mut renderer,&a).is_empty());assert_eq!(capture(&mut renderer,&a),original,"returning UI reloads exact pixels");
    cache.invalidate("a.png");for _ in 0..121 {assert!(cache.sync(&mut renderer,&b).is_empty());}assert!(!cache.ui_usage.contains_key("a.png"));assert!(!renderer.remove_ui_texture("a.png"));
    assert!(cache.sync(&mut renderer,&a).is_empty());assert_eq!(capture(&mut renderer,&a),original);
    let stamp=cache.attempted_ui["a.png"];fixture.write("a.png",3,[0,0,255,255]);std::fs::File::options().write(true).open(fixture.0.join("a.png")).unwrap().set_modified(stamp.modified.unwrap()).unwrap();assert!(cache.sync(&mut renderer,&a).is_empty());let changed=capture(&mut renderer,&a);assert_ne!(changed,original);
    std::fs::remove_file(fixture.0.join("a.png")).unwrap();assert_eq!(cache.sync(&mut renderer,&a).len(),1);assert!(cache.sync(&mut renderer,&a).is_empty());assert_eq!(capture(&mut renderer,&a),changed,"failed reload preserves the existing texture");
    fixture.write("a.png",4,[255,0,0,255]);assert!(cache.sync(&mut renderer,&a).is_empty());assert_eq!(capture(&mut renderer,&a),original);
    let other=Fixture::new();other.write("a.png",2,[0,255,0,255]);cache.set_project_root(Some(other.0.clone()));assert!(cache.sync(&mut renderer,&a).is_empty());assert_ne!(capture(&mut renderer,&a),original);assert!(!renderer.remove_ui_texture("b.png"));
    cache.set_project_root(None);assert!(cache.sync(&mut renderer,&UiBatchPlan::build(vec![])).is_empty());assert!(cache.ui_usage.is_empty());assert!(!renderer.remove_ui_texture("a.png"));
    assert!(renderer.remove_ui_texture("mengine-font://guard"));assert!(renderer.remove_ui_texture("$scene-view:guard"));assert_eq!(renderer.material_texture_stats().color,1);
}

#[test]
fn active_lists_over_budget_keep_every_texture_then_evict_idle_entries() {
    let fixture=Fixture::new();let keys=(0..130).map(|index|format!("texture-{index:03}.png")).collect::<Vec<_>>();for key in &keys {fixture.write(key,1,[64,128,192,255]);}
    let mut renderer=pollster::block_on(Renderer::new_headless((16,16).into())).unwrap();let mut cache=RuntimeTextureCache::new(Some(fixture.0.clone()));
    assert!(cache.sync(&mut renderer,&plan(&keys.iter().map(String::as_str).collect::<Vec<_>>())).is_empty());assert_eq!(cache.ui_usage.len(),130);assert_eq!(cache.attempted_ui.len(),130);
    assert!(cache.sync(&mut renderer,&plan(&[&keys[129]])).is_empty());assert_eq!(cache.ui_usage.len(),128);assert!(!renderer.remove_ui_texture(&keys[0]));assert!(!renderer.remove_ui_texture(&keys[1]));assert!(cache.ui_usage.contains_key(&keys[129]));
    let bytes=cache.ui_usage.values().map(|entry|entry.bytes).sum::<u64>();assert_eq!(bytes,128*8);println!("UI_TEXTURE_RETENTION active=130 retained_after_transition=128 logical_rgba_bytes={bytes}");
}
