// Author: MiYu. Compile source placements into a native hierarchy with shared models and explicit unresolved placement kinds.
use crate::{AssetLocation,AssetMounts,AssetSourceId,MdxModel,WarcraftDecodedModel,WarcraftDefinitionDomain as Domain,WarcraftDefinitionTable as Table,WarcraftMapDefinitions,WarcraftMapError,WarcraftMapSession,WarcraftMapCancelToken,WarcraftResourceCache};
use std::{collections::{BTreeMap,HashMap},sync::Arc};
mod animation;
#[cfg(test)] mod tests;
type Result<T> = std::result::Result<T,WarcraftMapError>;
fn invalid(message:impl Into<String>)->WarcraftMapError {WarcraftMapError::Format {member:"map placements",offset:0,message:message.into()}}
fn limit()->WarcraftMapError {WarcraftMapError::Limit {member:"map placements",message:"native world exceeds allocation or record budget".into()}}
fn check(cancel:&WarcraftMapCancelToken)->Result<()> {if cancel.is_cancelled() {Err(WarcraftMapError::Cancelled)} else {Ok(())}}
#[derive(Clone,Copy,Debug)]
pub struct WarcraftWorldLimits {pub max_nodes:usize,pub max_models:usize,pub max_member_bytes:usize,pub max_model_source_bytes:usize,pub max_model_decoded_bytes:usize,pub max_layout_bytes:usize}
impl Default for WarcraftWorldLimits {fn default()->Self {Self {max_nodes:131072,max_models:1024,max_member_bytes:16*1024*1024,max_model_source_bytes:128*1024*1024,max_model_decoded_bytes:256*1024*1024,max_layout_bytes:64*1024*1024}}}
#[derive(Clone,Copy,Debug,PartialEq,serde::Serialize)]
pub struct WarcraftWorldTransform {pub position:[f32;3],pub rotation:[f32;4],pub scale:[f32;3]}
#[derive(Clone,Copy,Debug,PartialEq,Eq,serde::Serialize)]
pub enum WarcraftWorldNodeKind {Root,Doodads,Units,TerrainDoodads,Doodad(usize),Unit(usize),StartLocation(usize),RandomPlacement(usize),TerrainDoodad(usize)}
#[derive(Debug,serde::Serialize)]
pub struct WarcraftWorldNode {pub parent:Option<usize>,pub kind:WarcraftWorldNodeKind,pub id:Option<[u8;4]>,pub transform:Option<WarcraftWorldTransform>,pub active:bool,pub appearance:Option<usize>,pub sequence:Option<usize>,pub held:bool}
#[derive(Clone,Debug,PartialEq,Eq,PartialOrd,Ord,serde::Serialize)]
pub struct WarcraftTextureReplacement {pub id:u32,pub member:String}
#[derive(Debug,serde::Serialize)]
pub struct WarcraftWorldAppearance {pub model:usize,pub tint:[f32;3],pub team:u8,pub replacement:Option<WarcraftTextureReplacement>}
/// A visual instance graph; source gameplay records, random configurations and unconsumed model behavior remain available through definitions.
pub struct WarcraftPlacedWorld {pub definitions:Arc<WarcraftMapDefinitions>,pub nodes:Vec<WarcraftWorldNode>,pub appearances:Vec<WarcraftWorldAppearance>,pub models:Vec<Arc<WarcraftDecodedModel>>,pub doodad_random_state:u32,pub unit_random_state:u32}
type AppearanceKey=(usize,[u32;3],u8,Option<WarcraftTextureReplacement>);
struct Compiler<'a> {mounts:&'a AssetMounts,cache:&'a WarcraftResourceCache,map:AssetSourceId,cancel:&'a WarcraftMapCancelToken,limits:WarcraftWorldLimits,layout:usize,raw:usize,decoded:usize,models:Vec<Arc<WarcraftDecodedModel>>,requested:BTreeMap<String,usize>,resolved:HashMap<AssetLocation,usize>,appearances:Vec<WarcraftWorldAppearance>,bindings:BTreeMap<AppearanceKey,usize>}
impl Compiler<'_> {
    fn charge(&mut self,n:usize)->Result<()> {self.layout=self.layout.checked_sub(n).ok_or_else(limit)?; Ok(())}
    fn model(&mut self,member:&str,fallback:Option<&str>)->Result<usize> {
        check(self.cancel)?; if let Some(index)=self.requested.get(member) {return Ok(*index);} let bytes=match self.mounts.read_model_bytes_limited(member,self.limits.max_member_bytes) {Ok(bytes)=>bytes,Err(crate::AssetError::NotFound(_))=>if let Some(fallback)=fallback {self.mounts.read_model_bytes_limited(fallback,self.limits.max_member_bytes)?} else {return Err(crate::AssetError::NotFound(member.into()).into());},Err(e)=>return Err(e.into())}; check(self.cancel)?;
        let index=if let Some(index)=self.resolved.get(&bytes.location) {*index} else {if self.models.len()>=self.limits.max_models {return Err(limit());} self.raw=self.raw.checked_sub(bytes.bytes.len()).ok_or_else(limit)?; let model=self.cache.model(bytes,self.map,self.decoded,self.cancel)?; check(self.cancel)?; self.decoded=self.decoded.checked_sub(model.model.decoded_bytes()).ok_or_else(limit)?; self.charge(model.source.location.member.len()+128)?; let index=self.models.len(); self.resolved.insert(model.source.location.clone(),index); self.models.push(model); index};
        self.charge(member.len()+96)?; self.requested.insert(member.into(),index); Ok(index)
    }
    fn appearance(&mut self,model:usize,tint:[f32;3],team:u8,replacement:Option<WarcraftTextureReplacement>)->Result<usize> {
        let key=(model,tint.map(f32::to_bits),team,replacement); if let Some(index)=self.bindings.get(&key) {return Ok(*index);} self.charge(256+key.3.as_ref().map_or(0,|r|r.member.len()*2))?; let index=self.appearances.len(); self.appearances.push(WarcraftWorldAppearance {model,tint,team,replacement:key.3.clone()}); self.bindings.insert(key,index); Ok(index)
    }
}
fn text<'a>(defs:&'a WarcraftMapDefinitions,domain:Domain,id:[u8;4],table:Table,field:&str)->Result<&'a str> {defs.field(domain,id,table,field).and_then(|v|v.text()).map(|v|defs.resolve_text(v)).ok_or_else(||invalid(format!("missing source field {id:?}.{field}")))}
fn number(defs:&WarcraftMapDefinitions,domain:Domain,id:[u8;4],table:Table,field:&str,default:Option<f64>)->Result<f64> {match defs.field(domain,id,table,field) {Some(value)=>value.number().ok_or_else(||invalid(format!("invalid numeric source field {id:?}.{field}"))),None=>default.ok_or_else(||invalid(format!("missing numeric source field {id:?}.{field}")))}}
fn integer(value:f64)->Result<i32> {if value.fract()!=0. || value<i32::MIN as f64 || value>i32::MAX as f64 {return Err(invalid("source integer outside range"));} Ok(value as i32)}
fn path(value:&str,variation:Option<i32>)->Result<String> {if value.len()>4000 {return Err(limit());} let lower=value.to_ascii_lowercase(); let stem=if lower.ends_with(".mdl") || lower.ends_with(".mdx") {&value[..value.len()-4]} else {value}; let path=match variation {Some(v)=>format!("{stem}{v}.mdx"),None=>format!("{stem}.mdx")}; Ok(crate::asset_bytes::normalize_member(&path)?)}
fn transform(location:[f32;3],angle:f32,scale:[f32;3],model_scale:f64,height:f64)->Result<WarcraftWorldTransform> {
    if location.iter().chain(&scale).chain([&angle]).any(|v|!v.is_finite()) || !model_scale.is_finite() || !height.is_finite() {return Err(invalid("non-finite placement transform"));} let half=angle as f64*0.5;
    let value=WarcraftWorldTransform {position:[location[0]/128.,(location[2] as f64/128.+height/128.) as f32,-location[1]/128.],rotation:[0.,half.sin() as f32,0.,half.cos() as f32],scale:[(scale[0] as f64*model_scale) as f32,(scale[2] as f64*model_scale) as f32,(scale[1] as f64*model_scale) as f32]};
    if value.position.iter().chain(&value.scale).any(|v|!v.is_finite()) {return Err(invalid("placement transform exceeds finite range"));} Ok(value)
}
fn tint(defs:&WarcraftMapDefinitions,domain:Domain,id:[u8;4],table:Table,variation:Option<i32>)->Result<[f32;3]> {let mut result=[1.;3]; for (i,color) in ["R","G","B"].iter().enumerate() {let ordinary=format!("color{color}"); let varied=variation.map(|v|format!("vert{color}{:02}",v+1)); let key=if defs.field(domain,id,table,&ordinary).is_some() {ordinary.as_str()} else {varied.as_deref().unwrap_or("")}; let n=number(defs,domain,id,table,key,Some(255.))?; if !(0. ..=255.).contains(&n) {return Err(invalid("source tint outside0..255"));} result[i]=(n/255.) as f32;} Ok(result)}
impl WarcraftPlacedWorld {
    /// Build source visuals on a worker. The two explicit seeds reproduce preview streams, not the complete original game RNG call order.
    pub fn load(session:&WarcraftMapSession,definitions:Arc<WarcraftMapDefinitions>,cache:&WarcraftResourceCache,limits:WarcraftWorldLimits,seeds:[u32;2],cancel:&WarcraftMapCancelToken)->Result<Arc<Self>> {
        check(cancel)?; if definitions.source()!=session.source() {return Err(invalid("definitions belong to another map"));} let world=definitions.world_data();
        let count=world.doodads.as_ref().map_or(0,|d|d.doodads.len().saturating_add(d.terrain_doodads.len())).checked_add(world.units.as_ref().map_or(0,|u|u.units.len())).and_then(|n|n.checked_add(4)).filter(|n|*n<=limits.max_nodes).ok_or_else(limit)?;
        let mut c=Compiler {mounts:session.assets(),cache,map:session.source(),cancel,limits,layout:limits.max_layout_bytes,raw:limits.max_model_source_bytes,decoded:limits.max_model_decoded_bytes,models:vec![],requested:BTreeMap::new(),resolved:HashMap::new(),appearances:vec![],bindings:BTreeMap::new()}; c.charge(count.checked_mul(std::mem::size_of::<WarcraftWorldNode>()+std::mem::size_of::<WarcraftWorldAppearance>()).ok_or_else(limit)?.checked_add(limits.max_models.checked_mul(std::mem::size_of::<Arc<WarcraftDecodedModel>>()).ok_or_else(limit)?).ok_or_else(limit)?)?;
        let mut nodes=Vec::new(); nodes.try_reserve_exact(count).map_err(|_|limit())?; c.models.try_reserve_exact(limits.max_models).map_err(|_|limit())?; c.appearances.try_reserve_exact(count).map_err(|_|limit())?;
        for kind in [WarcraftWorldNodeKind::Root,WarcraftWorldNodeKind::Doodads,WarcraftWorldNodeKind::Units,WarcraftWorldNodeKind::TerrainDoodads] {nodes.push(WarcraftWorldNode {parent:if nodes.is_empty() {None} else {Some(0)},kind,id:None,transform:Some(transform([0.;3],0.,[1.;3],1.,0.)?),active:true,appearance:None,sequence:None,held:false});}
        let mut doodad_random=animation::Random(seeds[0]); let mut unit_random=animation::Random(seeds[1]);
        if let Some(doodads)=&world.doodads {for (index,d) in doodads.doodads.iter().enumerate() {
            check(cancel)?; let destructable=definitions.contains(Domain::Destructables,d.id); let (domain,table)=if destructable {(Domain::Destructables,Table::Destructables)} else {(Domain::Doodads,Table::Doodads)};
            let variants=integer(number(&definitions,domain,d.id,table,"numVar",None)?)?; if d.variation<0 || variants<1 {return Err(invalid("invalid model variation"));} let variation=d.variation.min(variants-1); let base=path(text(&definitions,domain,d.id,table,"file")?,None)?; let member=path(text(&definitions,domain,d.id,table,"file")?,(variants>1).then_some(variation))?; let model=c.model(&member,(member!=base).then_some(base.as_str()))?;
            let replacement=match definitions.field(domain,d.id,table,"texFile").and_then(|v|v.text()).map(|v|definitions.resolve_text(v)).filter(|v|!matches!(*v,""|"-"|"_")) {Some(member)=>{if member.len()>4000 {return Err(limit());} let member=crate::asset_bytes::normalize_member(member)?; let member=if member.rsplit('/').next().and_then(|s|s.rsplit_once('.')).is_some_and(|(a,b)|!a.is_empty() && !b.is_empty()) {member} else {format!("{member}.blp")}; Some(WarcraftTextureReplacement {id:integer(number(&definitions,domain,d.id,table,"texID",Some(0.))?)?.try_into().map_err(|_|invalid("negative replaceable texture ID"))?,member:crate::asset_bytes::normalize_member(&member)?})},None=>None};
            let appearance=c.appearance(model,tint(&definitions,domain,d.id,table,Some(variation))?,0,replacement)?; let active=!destructable || d.flags&3!=0; let mut suppressed_random=animation::Random(1); let (sequence,held)=animation::select(&c.models[model].model,destructable && d.life==0,if active {&mut doodad_random} else {&mut suppressed_random})?;
            nodes.push(WarcraftWorldNode {parent:Some(1),kind:WarcraftWorldNodeKind::Doodad(index),id:Some(d.id),transform:Some(transform(d.location,d.angle,d.scale,1.,0.)?),active,appearance:Some(appearance),sequence,held});
        } for (index,d) in doodads.terrain_doodads.iter().enumerate() {nodes.push(WarcraftWorldNode {parent:Some(3),kind:WarcraftWorldNodeKind::TerrainDoodad(index),id:Some(d.id),transform:None,active:true,appearance:None,sequence:None,held:false});}}
        if let Some(units)=&world.units {for (index,u) in units.units.iter().enumerate() {
            check(cancel)?; let mut node=WarcraftWorldNode {parent:Some(2),kind:WarcraftWorldNodeKind::Unit(index),id:Some(u.id),transform:Some(transform(u.location,u.angle,u.scale,1.,0.)?),active:true,appearance:None,sequence:None,held:false};
            if u.id==*b"sloc" {node.kind=WarcraftWorldNodeKind::StartLocation(index);} else if matches!(&u.id,b"uDNR"|b"iDNR") {node.kind=WarcraftWorldNodeKind::RandomPlacement(index);} else {
                let domain=Domain::UnitsAndItems; let item=definitions.field(domain,u.id,Table::Items,"file").is_some(); let table=if item {Table::Items} else {Table::UnitUi}; let model_scale=number(&definitions,domain,u.id,table,if item {"scale"} else {"modelScale"},None)?; if model_scale<=0. {return Err(invalid("nonpositive unit model scale"));} let height=if item {0.} else {number(&definitions,domain,u.id,Table::UnitData,"moveHeight",None)?}; let member=path(text(&definitions,domain,u.id,table,"file")?,None)?; let model=c.model(&member,None)?;
                let mut team=if u.custom_team_color>=0 {u.custom_team_color} else if item {-1} else {integer(number(&definitions,domain,u.id,table,"teamColor",Some(-1.))?)?}; if team<0 {team=u.player.min(12);} if !(0..=12).contains(&team) {return Err(invalid("unsupported classic team color"));}
                let color=if item {tint(&definitions,domain,u.id,table,None)?} else {let mut color=[0.;3]; for (i,field) in ["red","green","blue"].iter().enumerate() {let n=number(&definitions,domain,u.id,table,field,None)?; if !(0. ..=255.).contains(&n) {return Err(invalid("unit tint outside0..255"));} color[i]=(n/255.) as f32;} color};
                node.transform=Some(transform(u.location,u.angle,u.scale,model_scale,height)?); node.appearance=Some(c.appearance(model,color,team as u8,None)?); (node.sequence,node.held)=animation::select(&c.models[model].model,false,&mut unit_random)?;
            } nodes.push(node);
        }} check(cancel)?; Ok(Arc::new(Self {definitions,nodes,appearances:c.appearances,models:c.models,doodad_random_state:doodad_random.0,unit_random_state:unit_random.0}))
    }
}
