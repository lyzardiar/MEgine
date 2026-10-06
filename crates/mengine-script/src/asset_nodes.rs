//! MiYu: project-scoped exact node queries shared by editor and standalone scripts.
use glam::{Mat4,Vec3};
use mengine_assets::{parse_gltf_pose_sample,GltfBillboardCamera,GltfPoseSource};
use serde::Deserialize;
use std::{collections::HashMap,path::{Path,PathBuf},time::SystemTime};

#[derive(PartialEq)]
struct Stamp { path: PathBuf, bytes: u64, modified: SystemTime }
impl Stamp {
    fn read(path: &Path) -> Result<Self,String> {
        let m=std::fs::metadata(path).map_err(|e|e.to_string())?;
        if !m.is_file() {return Err("Pose dependency is not a file".into());}
        Ok(Self {path:path.into(),bytes:m.len(),modified:m.modified().map_err(|e|e.to_string())?})
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Fixture { directory: PathBuf, root: PathBuf }
    impl Fixture {
        fn new(offset: f32) -> Self {
            let directory=std::env::temp_dir().join(format!("mengine-node-query-{}-{}",std::process::id(),SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).unwrap().as_nanos()));
            let root=directory.join("project");std::fs::create_dir_all(root.join("Assets")).unwrap();
            let value=serde_json::json!({"asset":{"version":"2.0"},"buffers":[{"uri":"pose%20data.bin","byteLength":32}],"bufferViews":[{"buffer":0,"byteOffset":0,"byteLength":8},{"buffer":0,"byteOffset":8,"byteLength":24}],"accessors":[{"bufferView":0,"componentType":5126,"count":2,"type":"SCALAR","min":[0],"max":[1]},{"bufferView":1,"componentType":5126,"count":2,"type":"VEC3"}],"nodes":[{"name":"ref","children":[1],"extras":{"mengineBillboard":{"flags":8}}},{"name":"ref","translation":[2,0,0]}],"animations":[{"name":"move","samplers":[{"input":0,"output":1}],"channels":[{"sampler":0,"target":{"node":0,"path":"translation"}}],"extras":{"menginePlayback":{"durationSeconds":1,"loop":false}}}]});
            std::fs::write(root.join("Assets/actor.gltf"),value.to_string()).unwrap();
            let fixture=Self {directory,root};fixture.buffer(offset,false);fixture
        }
        fn buffer(&self, offset: f32, padding: bool) {
            let mut values=vec![0f32,1.0,0.0,0.0,0.0,offset,0.0,0.0];if padding {values.push(0.0);}
            let bytes=values.iter().flat_map(|v|v.to_le_bytes()).collect::<Vec<_>>();std::fs::write(self.root.join("Assets/pose data.bin"),bytes).unwrap();
        }
    }
    impl Drop for Fixture {fn drop(&mut self) {let _=std::fs::remove_dir_all(&self.directory);}}
    fn nodes(cache: &mut AssetNodeCache, reference: &str, options: &str) -> serde_json::Value {
        let value:serde_json::Value=serde_json::from_str(&cache.query(reference,options)).unwrap();assert_eq!(value["ok"],true,"{value}");value["value"].clone()
    }
    #[test]
    fn query_reloads_changed_buffer_dependencies_at_the_next_frame_and_keeps_camera_results_separate() {
        let fixture=Fixture::new(8.0);let mut cache=AssetNodeCache::default();cache.set_root(fixture.root.clone());
        let reference="Assets/actor.gltf#pose=0:15@30";
        assert_eq!(nodes(&mut cache,reference,"{}")[1]["position"],serde_json::json!([6.0,0.0,0.0]));
        let options=serde_json::json!({"camera":{"model":Mat4::IDENTITY.to_cols_array(),"look":[0,0,-1],"up":[0,1,0]}}).to_string();
        assert_eq!(nodes(&mut cache,reference,&options)[1]["position"],serde_json::json!([4.0,0.0,2.0]));
        fixture.buffer(12.0,true);cache.begin_frame();
        assert_eq!(nodes(&mut cache,reference,"{}")[1]["position"],serde_json::json!([8.0,0.0,0.0]));
        assert_eq!(nodes(&mut cache,"Assets/actor.gltf#pose=0:60@30","{}")[1]["position"],serde_json::json!([14.0,0.0,0.0]));
        std::fs::remove_file(fixture.root.join("Assets/pose data.bin")).unwrap();cache.begin_frame();
        let value:serde_json::Value=serde_json::from_str(&cache.query(reference,"{}")).unwrap();assert_eq!(value["ok"],false);
    }
    #[test]
    fn quickjs_api_is_project_scoped_and_does_not_expose_its_native_function() {
        let a=Fixture::new(8.0);let b=Fixture::new(20.0);let mut host=crate::ScriptHost::new().unwrap();host.set_project_root(a.root.clone());
        host.eval("var nodes=engine.assets.sampleNodes('Assets/actor.gltf#pose=0:15@30');if(nodes[1].position[0]!==6||nodes[0].name!==nodes[1].name||nodes[0].index===nodes[1].index)throw Error('bad native nodes');if(typeof __mengineAssetNodes!=='undefined')throw Error('native function leaked');").unwrap();
        host.set_project_root(b.root.clone());host.eval("if(engine.assets.sampleNodes('Assets/actor.gltf#pose=0:15@30')[1].position[0]!==12)throw Error('project cache leaked');").unwrap();
        std::fs::copy(b.root.join("Assets/actor.gltf"),b.directory.join("outside.gltf")).unwrap();
        host.eval("var rejected=false;try{engine.assets.sampleNodes('../outside.gltf#pose=0:0')}catch(e){rejected=String(e).includes('outside the project')}if(!rejected)throw Error('outside asset accepted');").unwrap();
        std::fs::write(b.directory.join("outside.bin"),[0u8;32]).unwrap();
        let path=b.root.join("Assets/actor.gltf");let mut doc:serde_json::Value=serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();doc["buffers"][0]["uri"]=serde_json::json!("../../outside.bin");std::fs::write(path,doc.to_string()).unwrap();
        host.eval("var rejected=false;try{engine.assets.sampleNodes('Assets/actor.gltf#pose=0:0')}catch(e){rejected=String(e).includes('outside the project')}if(!rejected)throw Error('outside dependency accepted');").unwrap();
    }
}
struct Source { pose: GltfPoseSource, stamps: Vec<Stamp>, checked: u64, used: u64, results: HashMap<String,String> }
#[derive(Default)]
pub(crate) struct AssetNodeCache { root: Option<PathBuf>, sources: HashMap<PathBuf,Source>, epoch: u64, serial: u64 }
#[derive(Deserialize,Default)]
#[serde(deny_unknown_fields)]
struct Options { camera: Option<Camera>, #[serde(default,rename="attachmentsOnly")] attachments_only: bool }
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Camera { model: [f32;16], look: [f32;3], up: [f32;3] }

impl AssetNodeCache {
    pub(crate) fn set_root(&mut self, root: PathBuf) {self.root=Some(root);self.sources.clear();}
    pub(crate) fn begin_frame(&mut self) {self.epoch=self.epoch.wrapping_add(1);for source in self.sources.values_mut() {source.results.clear();}}
    pub(crate) fn query(&mut self, reference: &str, options: &str) -> String {
        match self.sample(reference,options) {Ok(value)=>value,Err(error)=>serde_json::json!({"ok":false,"error":error}).to_string()}
    }
    fn sample(&mut self, reference: &str, options: &str) -> Result<String,String> {
        if reference.len()>4096 || options.len()>4096 {return Err("Node query is too large".into());}
        let (relative,clip,frame,rate)=parse_gltf_pose_sample(reference).ok_or("Node queries require a bounded #pose reference")?;
        if relative.contains([':', '\0']) || Path::new(relative).is_absolute() {return Err("Pose asset must be project relative".into());}
        let root=self.root.as_ref().ok_or("Project assets are not configured")?.canonicalize().map_err(|e|e.to_string())?;
        let path=root.join(relative).canonicalize().map_err(|e|e.to_string())?;
        if !path.starts_with(&root) {return Err("Pose asset is outside the project".into());}
        let options_value:Options=serde_json::from_str(options).map_err(|e|e.to_string())?;
        let camera=options_value.camera.map(|c|GltfBillboardCamera {model:Mat4::from_cols_array(&c.model),look:Vec3::from_array(c.look),up:Vec3::from_array(c.up)});
        self.serial=self.serial.wrapping_add(1);
        if let Some(source)=self.sources.get_mut(&path) {
            if source.checked!=self.epoch {
                let stamps=source.stamps.iter().map(|s|Stamp::read(&s.path)).collect::<Result<Vec<_>,_>>();
                if stamps.as_ref().is_ok_and(|s|*s==source.stamps) {source.checked=self.epoch;} else {self.sources.remove(&path);}
            }
        }
        if !self.sources.contains_key(&path) {
            let (pose,dependencies)=GltfPoseSource::load_in_project(&path,&root).map_err(|e|e.to_string())?;
            let stamps=dependencies.iter().map(|p|Stamp::read(p)).collect::<Result<Vec<_>,_>>()?;
            let bytes=stamps.iter().map(|s|s.bytes).sum::<u64>();
            while self.sources.len()>=128 || self.sources.values().flat_map(|s|&s.stamps).map(|s|s.bytes).sum::<u64>()+bytes>256*1024*1024 {
                let Some(oldest)=self.sources.iter().min_by_key(|(_,s)|s.used).map(|(p,_)|p.clone()) else {break;};self.sources.remove(&oldest);
            }
            self.sources.insert(path.clone(),Source {pose,stamps,checked:self.epoch,used:self.serial,results:HashMap::new()});
        }
        let source=self.sources.get_mut(&path).unwrap();source.used=self.serial;
        let key=format!("{clip}:{frame}@{rate}|{options}");
        if let Some(value)=source.results.get(&key) {return Ok(value.clone());}
        let poses=source.pose.sample_nodes(clip,frame,rate,camera).map_err(|e|e.to_string())?;
        let value=serde_json::json!({"ok":true,"value":poses.iter().filter(|n|!options_value.attachments_only || n.attachment.is_some()).map(|n|serde_json::json!({"index":n.index,"name":n.name,"position":n.matrix.w_axis.truncate().to_array(),"matrix":n.matrix.to_cols_array(),"attachment":n.attachment.as_ref().map(|a|serde_json::json!({"id":a.id,"path":a.path,"visibility":a.visibility}))})).collect::<Vec<_>>()}).to_string();
        if source.results.len()<128 && source.results.values().map(|v|v.len()).sum::<usize>()+value.len()<=512*1024 {source.results.insert(key,value.clone());}
        Ok(value)
    }
}
