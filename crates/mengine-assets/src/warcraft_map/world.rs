// Author: MiYu. Read optional world members only from the current map, with no export or common-data fallback.
use super::*;
use super::reader::Budget;

/// Source records for a future world consumer; loading these does not instantiate models or execute JASS.
/// Owned records and raw member Arcs survive session release, while the archive cache belongs to the session.
pub struct WarcraftMapWorldData {pub source:AssetSourceId,pub doodads:Option<WarcraftMapDoodads>,pub units:Option<WarcraftMapUnits>,pub objects:Vec<WarcraftMapObjects>,members:Vec<AssetBytes>}
impl WarcraftMapWorldData {
    pub fn members(&self)->&[AssetBytes] {&self.members}
    pub fn objects(&self,kind:WarcraftMapObjectKind)->Option<&WarcraftMapObjects> {self.objects.iter().find(|o|o.kind==kind)}
}
impl WarcraftMapSession {
    /// Synchronous worker-side source load. Raw quota includes core members; decoded quota covers this returned data set.
    /// Missing optional members are empty; present malformed members fail. All record arrays share one decoded budget.
    pub fn load_world_data(&self,limits:WarcraftMapLimits,cancel:&WarcraftMapCancelToken)->Result<WarcraftMapWorldData> {
        cancel.check()?; let mut budget=Budget::new(limits.max_decoded_bytes); let mut retained=self.members.iter().try_fold(0usize,|sum,m|sum.checked_add(m.bytes.len()).ok_or_else(||WarcraftMapError::Limit {member:"map world",message:"retained core member size overflow".into()}))?;
        if retained>limits.max_data_bytes {return Err(WarcraftMapError::Limit {member:"map world",message:"core data already exceeds retained byte budget".into()});}
        budget.charge("map world",std::mem::size_of::<AssetBytes>()*9+std::mem::size_of::<WarcraftMapObjects>()*7)?; let mut members=Vec::with_capacity(9); let mut objects=Vec::with_capacity(7);
        let doodads=match self.read_world_member("war3map.doo",limits,&mut retained,cancel)? {Some(bytes)=>{let value=placements::doodads(&bytes.bytes,&limits,cancel,&mut budget)?; members.push(bytes); Some(value)},None=>None};
        let units=match self.read_world_member("war3mapUnits.doo",limits,&mut retained,cancel)? {Some(bytes)=>{let value=placements::units(&bytes.bytes,&limits,cancel,&mut budget)?; members.push(bytes); Some(value)},None=>None};
        for kind in WarcraftMapObjectKind::ALL {if let Some(bytes)=self.read_world_member(kind.member(),limits,&mut retained,cancel)? {objects.push(objects::objects(&bytes.bytes,kind,&limits,cancel,&mut budget)?); members.push(bytes);}}
        cancel.check()?; Ok(WarcraftMapWorldData {source:self.source(),doodads,units,objects,members})
    }
    fn read_world_member(&self,member:&'static str,limits:WarcraftMapLimits,retained:&mut usize,cancel:&WarcraftMapCancelToken)->Result<Option<AssetBytes>> {
        cancel.check()?; let result=read_member(&self.mount,member,limits,retained); cancel.check()?; match result {Ok(bytes)=>Ok(Some(bytes)),Err(WarcraftMapError::Resource(AssetError::NotFound(_)))=>Ok(None),Err(e)=>Err(e)}
    }
}
