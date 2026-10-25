// Author: MiYu. Share bounded immutable public SYLK tables by actual archive identity; map tables stay with their definitions.
use super::*;
use crate::{AssetBytes,AssetLocation,AssetMounts};
use parking_lot::Mutex;
use std::collections::HashMap;

#[derive(Clone,Copy,Debug,PartialEq,Eq,PartialOrd,Ord,serde::Serialize)]
pub enum WarcraftDefinitionTable {UnitUi,UnitData,UnitBalance,UnitWeapons,UnitAbilities,Items,Doodads,Destructables,UnitMetadata,DoodadMetadata,DestructableMetadata,Profile}
impl WarcraftDefinitionTable {
    pub const SOURCES:[Self;11]=[Self::UnitUi,Self::UnitData,Self::UnitBalance,Self::UnitWeapons,Self::UnitAbilities,Self::Items,Self::Doodads,Self::Destructables,Self::UnitMetadata,Self::DoodadMetadata,Self::DestructableMetadata];
    pub fn member(self)->Option<&'static str> {Some(match self {Self::UnitUi=>"Units/UnitUI.slk",Self::UnitData=>"Units/UnitData.slk",Self::UnitBalance=>"Units/UnitBalance.slk",Self::UnitWeapons=>"Units/UnitWeapons.slk",Self::UnitAbilities=>"Units/UnitAbilities.slk",Self::Items=>"Units/ItemData.slk",Self::Doodads=>"Doodads/Doodads.slk",Self::Destructables=>"Units/DestructableData.slk",Self::UnitMetadata=>"Units/UnitMetaData.slk",Self::DoodadMetadata=>"Doodads/DoodadMetaData.slk",Self::DestructableMetadata=>"Units/DestructableMetaData.slk",Self::Profile=>return None})}
    pub(super) fn named(value:&str)->Option<Self> {match value {"UnitUI"=>Some(Self::UnitUi),"UnitData"=>Some(Self::UnitData),"UnitBalance"=>Some(Self::UnitBalance),"UnitWeapons"=>Some(Self::UnitWeapons),"UnitAbilities"=>Some(Self::UnitAbilities),"ItemData"=>Some(Self::Items),"DoodadData"=>Some(Self::Doodads),"DestructableData"=>Some(Self::Destructables),"Profile"=>Some(Self::Profile),_=>None}}
}

pub(super) struct SourceTable {pub bytes:AssetBytes,pub table:crate::warcraft_slk::Table,pub ids:BTreeMap<[u8;4],usize>,pub decoded_bytes:usize}
impl SourceTable {pub fn get(&self,id:[u8;4],field:&str)->Option<&str> {self.ids.get(&id).and_then(|row|self.table.get_at(*row,field))}}
struct Entry {table:Arc<SourceTable>,used:u64}
#[derive(Default)]
struct State {entries:HashMap<AssetLocation,Entry>,resident_bytes:usize,clock:u64,hits:u64,misses:u64}
#[derive(Clone,Copy,Debug,serde::Serialize)]
pub struct WarcraftDefinitionCacheStats {pub entries:usize,pub resident_bytes:usize,pub hits:u64,pub misses:u64}
/// Bounded strong references to decoded public sources only. Live definitions may keep evicted tables alive.
pub struct WarcraftDefinitionCache {max_bytes:usize,state:Mutex<State>}
impl Default for WarcraftDefinitionCache {fn default()->Self {Self::new(256*1024*1024)}}
impl WarcraftDefinitionCache {
    pub fn new(max_bytes:usize)->Self {Self {max_bytes,state:Mutex::new(State::default())}}
    pub fn stats(&self)->WarcraftDefinitionCacheStats {let s=self.state.lock(); WarcraftDefinitionCacheStats {entries:s.entries.len(),resident_bytes:s.resident_bytes,hits:s.hits,misses:s.misses}}
    fn get(&self,key:&AssetLocation)->Option<Arc<SourceTable>> {let mut s=self.state.lock(); s.clock=s.clock.saturating_add(1); let clock=s.clock; if let Some(e)=s.entries.get_mut(key) {e.used=clock; let result=e.table.clone(); s.hits+=1; Some(result)} else {s.misses+=1; None}}
    fn intern(&self,table:Arc<SourceTable>)->Arc<SourceTable> {
        let cost=table.decoded_bytes.saturating_add(table.bytes.bytes.len()); let mut s=self.state.lock(); if let Some(e)=s.entries.get(&table.bytes.location) {return e.table.clone();} if cost>self.max_bytes {return table;}
        while s.entries.len()>=64 || s.resident_bytes>self.max_bytes-cost {let key=s.entries.iter().min_by_key(|(_,e)|e.used).map(|(k,_)|k.clone()); if let Some(key)=key {let e=s.entries.remove(&key).unwrap(); s.resident_bytes-=e.table.decoded_bytes+e.table.bytes.bytes.len();} else {break;}}
        s.clock=s.clock.saturating_add(1); let used=s.clock; s.resident_bytes+=cost; s.entries.insert(table.bytes.location.clone(),Entry {table:table.clone(),used}); table
    }
    pub(super) fn load(&self,mounts:&AssetMounts,map:crate::AssetSourceId,kind:WarcraftDefinitionTable,limits:WarcraftDefinitionLimits,raw:&mut Budget,decoded:&mut Budget,cancel:&WarcraftMapCancelToken)->Result<Arc<SourceTable>> {
        check(cancel)?; let member=kind.member().ok_or_else(||invalid("Profile base data requires a profile source reader"))?; let bytes=mounts.read_limited(member,limits.max_member_bytes.min(raw.remaining))?; raw.charge(bytes.bytes.len())?; check(cancel)?;
        if bytes.location.source!=map {if let Some(table)=self.get(&bytes.location) {decoded.charge(table.decoded_bytes)?; return Ok(table);}}
        let before=decoded.remaining; let table=crate::warcraft_slk::Table::parse(&bytes.bytes,member,&mut |n|decoded.charge(n),cancel)?; let mut ids=BTreeMap::new();
        for (name,row) in table.row_names() {check(cancel)?; let mut id=[0;4]; let mut chars=name.chars(); for byte in &mut id {*byte=chars.next().filter(|v|u32::from(*v)<=255).ok_or_else(||invalid("source row ID must contain four bytes"))? as u8;} if chars.next().is_some() {return Err(invalid("source row ID must contain four bytes"));} decoded.charge(64)?; if ids.insert(id,row).is_some() {return Err(invalid("duplicate byte row ID"));}}
        let result=Arc::new(SourceTable {bytes,table,ids,decoded_bytes:before-decoded.remaining}); if result.bytes.location.source!=map {Ok(self.intern(result))} else {Ok(result)}
    }
}
