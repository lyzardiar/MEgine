// Author: MiYu. Resolve source table fields and object inheritance in memory without copying the common definition set.
use crate::{AssetBytes,AssetSourceId,WarcraftMapCancelToken,WarcraftMapError,WarcraftMapObjectKind,WarcraftMapObjectValue,WarcraftMapSession,WarcraftMapWorldData,WarcraftStringTable};
use std::{collections::BTreeMap,sync::Arc};
mod tables;
mod overrides;
#[cfg(test)] mod tests;
pub use tables::{WarcraftDefinitionTable,WarcraftDefinitionCache,WarcraftDefinitionCacheStats};
pub use overrides::{WarcraftDefinitionDomain,WarcraftDefinitionOverride,WarcraftDefinitionDisposition};
type Result<T> = std::result::Result<T,WarcraftMapError>;
fn invalid(message:impl Into<String>)->WarcraftMapError {WarcraftMapError::Format {member:"map definitions",offset:0,message:message.into()}}
fn limit(message:impl Into<String>)->WarcraftMapError {WarcraftMapError::Limit {member:"map definitions",message:message.into()}}
fn check(cancel:&WarcraftMapCancelToken)->Result<()> {if cancel.is_cancelled() {Err(WarcraftMapError::Cancelled)} else {Ok(())}}
struct Budget {remaining:usize}
impl Budget {fn new(remaining:usize)->Self {Self {remaining}} fn charge(&mut self,bytes:usize)->Result<()> {self.remaining=self.remaining.checked_sub(bytes).ok_or_else(||limit("definition allocation budget exceeded"))?; Ok(())}}
#[derive(Clone,Copy,Debug)]
pub struct WarcraftDefinitionLimits {pub max_member_bytes:usize,pub max_source_bytes:usize,pub max_decoded_bytes:usize,pub max_overlay_bytes:usize,pub max_objects:usize}
impl Default for WarcraftDefinitionLimits {fn default()->Self {Self {max_member_bytes:16*1024*1024,max_source_bytes:32*1024*1024,max_decoded_bytes:256*1024*1024,max_overlay_bytes:32*1024*1024,max_objects:65536}}}
#[derive(Clone,Copy,Debug)]
pub enum WarcraftDefinitionValue<'a> {Source(&'a str),Override(&'a WarcraftMapObjectValue)}
impl<'a> WarcraftDefinitionValue<'a> {
    pub fn text(self)->Option<&'a str> {match self {Self::Source(v)=>Some(v),Self::Override(WarcraftMapObjectValue::Text(v))=>Some(v),_=>None}}
    pub fn number(self)->Option<f64> {let value=match self {Self::Source(v)=>v.parse().ok()?,Self::Override(WarcraftMapObjectValue::Integer(v))=>*v as f64,Self::Override(WarcraftMapObjectValue::Real(v)|WarcraftMapObjectValue::Unreal(v))=>*v as f64,Self::Override(WarcraftMapObjectValue::Text(_))=>return None}; if value.is_finite() {Some(value)} else {None}}
}
/// Immutable source tables are shared across maps. Only changed properties and inherited override references are stored per object.
pub struct WarcraftMapDefinitions {source:AssetSourceId,world:Arc<WarcraftMapWorldData>,strings:Option<Arc<WarcraftStringTable>>,tables:BTreeMap<WarcraftDefinitionTable,Arc<tables::SourceTable>>,overlays:BTreeMap<(WarcraftDefinitionDomain,[u8;4]),overrides::Object>,dispositions:Vec<WarcraftDefinitionOverride>}
impl WarcraftMapDefinitions {
    /// Resolve classic visual and unit stat tables. Ability/buff/upgrade overrides and unsupported metadata targets stay in world_data.
    /// Profile overrides can be queried by index; base TXT profiles require the profile loader before complete names/tooltips are available.
    pub fn load(session:&WarcraftMapSession,world:Arc<WarcraftMapWorldData>,cache:&WarcraftDefinitionCache,limits:WarcraftDefinitionLimits,cancel:&WarcraftMapCancelToken)->Result<Self> {
        check(cancel)?; if world.source!=session.source() {return Err(invalid("world data belongs to another map source"));}
        let mut raw=Budget::new(limits.max_source_bytes); let mut decoded=Budget::new(limits.max_decoded_bytes); let mut overlay=Budget::new(limits.max_overlay_bytes); let mut tables=BTreeMap::new();
        for kind in WarcraftDefinitionTable::SOURCES {decoded.charge(128)?; tables.insert(kind,cache.load(session.assets(),session.source(),kind,limits,&mut raw,&mut decoded,cancel)?);}
        let mut result=Self {source:session.source(),world,strings:session.string_table_handle(),tables,overlays:BTreeMap::new(),dispositions:vec![]}; overrides::apply(&mut result,limits,&mut overlay,cancel)?; check(cancel)?; Ok(result)
    }
    pub fn source(&self)->AssetSourceId {self.source}
    pub fn world_data(&self)->&Arc<WarcraftMapWorldData> {&self.world}
    pub fn sources(&self)->impl ExactSizeIterator<Item=(WarcraftDefinitionTable,&AssetBytes)> {self.tables.iter().map(|(kind,table)|(*kind,&table.bytes))}
    pub fn source_ids(&self,table:WarcraftDefinitionTable)->impl Iterator<Item=[u8;4]>+'_ {self.tables.get(&table).into_iter().flat_map(|t|t.ids.keys().copied())}
    pub fn source_field(&self,table:WarcraftDefinitionTable,id:[u8;4],field:&str)->Option<&str> {self.tables.get(&table)?.get(id,field)}
    pub fn overlay_ids(&self)->impl Iterator<Item=(WarcraftDefinitionDomain,[u8;4])>+'_ {self.overlays.keys().copied()}
    pub fn source_columns(&self,table:WarcraftDefinitionTable)->impl Iterator<Item=&str> {self.tables.get(&table).into_iter().flat_map(|t|t.table.columns())}
    pub fn overrides(&self)->&[WarcraftDefinitionOverride] {&self.dispositions}
    pub fn resolve_text<'a>(&'a self,value:&'a str)->&'a str {self.strings.as_ref().map_or(value,|s|s.resolve(value))}
    pub fn contains(&self,domain:WarcraftDefinitionDomain,id:[u8;4])->bool {self.overlays.contains_key(&(domain,id)) || self.source_contains(domain,id)}
    pub fn root_id(&self,domain:WarcraftDefinitionDomain,id:[u8;4])->Option<[u8;4]> {if let Some(value)=self.overlays.get(&(domain,id)) {Some(value.root)} else if self.source_contains(domain,id) {Some(id)} else {None}}
    pub fn field(&self,domain:WarcraftDefinitionDomain,id:[u8;4],table:WarcraftDefinitionTable,field:&str)->Option<WarcraftDefinitionValue<'_>> {self.indexed_field(domain,id,table,field,-1)}
    /// Profile/list index is part of the property identity. Querying a scalar never silently consumes an indexed modification.
    pub fn indexed_field(&self,domain:WarcraftDefinitionDomain,id:[u8;4],table:WarcraftDefinitionTable,field:&str,index:i32)->Option<WarcraftDefinitionValue<'_>> {
        if !domain.accepts(table) {return None;} let root=self.root_id(domain,id)?;
        if let Some(object)=self.overlays.get(&(domain,id)) {if let Some(value)=object.fields.get(&(table,index)).and_then(|fields|fields.get(field)) {return Some(WarcraftDefinitionValue::Override(overrides::value(&self.world,*value)));}}
        if index!=-1 {return None;} self.tables.get(&table)?.get(root,field).map(WarcraftDefinitionValue::Source)
    }
    fn source_contains(&self,domain:WarcraftDefinitionDomain,id:[u8;4])->bool {self.tables.iter().any(|(kind,t)|domain.accepts(*kind) && t.ids.contains_key(&id))}
}
