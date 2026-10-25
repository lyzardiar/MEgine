// Author: MiYu. Retain both classic object tables and typed modifications without flattening inheritance or unknown fields.
use super::*;
use super::reader::{Reader,Budget};

#[derive(Clone,Copy,Debug,PartialEq,Eq,serde::Serialize)]
pub enum WarcraftMapObjectKind {Units,Items,Destructables,Doodads,Abilities,Buffs,Upgrades}
impl WarcraftMapObjectKind {
    pub const ALL:[Self;7]=[Self::Units,Self::Items,Self::Destructables,Self::Doodads,Self::Abilities,Self::Buffs,Self::Upgrades];
    pub fn member(self)->&'static str {match self {Self::Units=>"war3map.w3u",Self::Items=>"war3map.w3t",Self::Destructables=>"war3map.w3b",Self::Doodads=>"war3map.w3d",Self::Abilities=>"war3map.w3a",Self::Buffs=>"war3map.w3h",Self::Upgrades=>"war3map.w3q"}}
    pub fn extended(self)->bool {matches!(self,Self::Doodads|Self::Abilities|Self::Upgrades)}
}
#[derive(Debug,PartialEq,serde::Serialize)]
pub enum WarcraftMapObjectValue {Integer(i32),Real(f32),Unreal(f32),Text(String)}
#[derive(Debug,PartialEq,serde::Serialize)]
pub struct WarcraftMapObjectModification {pub field:[u8;4],pub level:Option<i32>,pub data_pointer:Option<i32>,pub value:WarcraftMapObjectValue,pub marker:[u8;4]}
#[derive(Debug,PartialEq,serde::Serialize)]
pub struct WarcraftMapObject {pub base_id:[u8;4],pub new_id:[u8;4],pub modifications:Vec<WarcraftMapObjectModification>}
#[derive(Debug,PartialEq,serde::Serialize)]
pub struct WarcraftMapObjects {pub kind:WarcraftMapObjectKind,pub version:i32,pub original:Vec<WarcraftMapObject>,pub custom:Vec<WarcraftMapObject>}
impl WarcraftMapObjects {
    /// Preserve UTF-8 strings and finite real/unreal values; unsupported encodings and newer versions fail explicitly.
    pub fn parse(bytes:&[u8],kind:WarcraftMapObjectKind,limits:WarcraftMapLimits,cancel:&WarcraftMapCancelToken)->Result<Self> {objects(bytes,kind,&limits,cancel,&mut Budget::new(limits.max_decoded_bytes))}
}

fn table(r:&mut Reader<'_>,extended:bool,custom:bool,budget:&mut Budget)->Result<Vec<WarcraftMapObject>> {
    let count=r.count(12)?; let mut objects=r.array(count,budget)?;
    for _ in 0..count {
        let base_id=r.code()?; let new_id=r.code()?; if custom && new_id==[0;4] {return Err(r.fail("custom object has an empty ID"));}
        let count=r.count(if extended {21} else {13})?; let mut modifications=r.array(count,budget)?;
        for _ in 0..count {
            let field=r.code()?; let kind=r.i32()?; let (level,data_pointer)=if extended {(Some(r.i32()?),Some(r.i32()?))} else {(None,None)};
            let value=match kind {0=>WarcraftMapObjectValue::Integer(r.i32()?),1=>WarcraftMapObjectValue::Real(r.f32()?),2=>WarcraftMapObjectValue::Unreal(r.f32()?),3=>WarcraftMapObjectValue::Text(r.text(budget)?),_=>return Err(r.fail("unsupported object value type"))};
            modifications.push(WarcraftMapObjectModification {field,level,data_pointer,value,marker:r.code()?});
        }
        objects.push(WarcraftMapObject {base_id,new_id,modifications});
    }
    Ok(objects)
}
pub(super) fn objects(bytes:&[u8],kind:WarcraftMapObjectKind,limits:&WarcraftMapLimits,cancel:&WarcraftMapCancelToken,budget:&mut Budget)->Result<WarcraftMapObjects> {
    let mut r=Reader::new(bytes,kind.member(),limits,cancel)?; let version=r.i32()?; if !matches!(version,1|2) {return Err(r.fail("unsupported classic object data version"));}
    let original=table(&mut r,kind.extended(),false,budget)?; let custom=table(&mut r,kind.extended(),true,budget)?; r.finish()?; Ok(WarcraftMapObjects {kind,version,original,custom})
}
