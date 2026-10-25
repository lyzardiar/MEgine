// Author: MiYu. Preserve classic source placements and random configurations before world instantiation.
use super::*;
use super::reader::{Reader,Budget};

#[derive(Debug,PartialEq,serde::Serialize)]
pub struct WarcraftMapItemChoice {pub id:[u8;4],pub chance:i32}
#[derive(Debug,PartialEq,serde::Serialize)]
#[serde(rename_all="camelCase")]
pub struct WarcraftMapDoodad {pub id:[u8;4],pub variation:i32,pub location:[f32;3],pub angle:f32,pub scale:[f32;3],pub flags:u8,pub life:u8,pub item_table:Option<u32>,pub item_sets:Vec<Vec<WarcraftMapItemChoice>>,pub editor_id:i32}
#[derive(Debug,PartialEq,serde::Serialize)]
pub struct WarcraftMapTerrainDoodad {pub id:[u8;4],pub unknown:u32,pub location:[u32;2]}
#[derive(Debug,PartialEq,serde::Serialize)]
#[serde(rename_all="camelCase")]
pub struct WarcraftMapDoodads {pub version:i32,pub subversion:i32,pub doodads:Vec<WarcraftMapDoodad>,pub terrain_version:u32,pub terrain_doodads:Vec<WarcraftMapTerrainDoodad>}
#[derive(Debug,PartialEq,serde::Serialize)]
pub struct WarcraftMapInventoryItem {pub slot:i32,pub id:[u8;4]}
#[derive(Debug,PartialEq,serde::Serialize)]
#[serde(rename_all="camelCase")]
pub struct WarcraftMapModifiedAbility {pub id:[u8;4],pub active_for_autocast:i32,pub hero_level:i32}
#[derive(Debug,PartialEq,serde::Serialize)]
pub enum WarcraftMapRandomPlacement {None,Any {level:[u8;3],item_class:u8},Group {unit_group:u32,position_in_group:u32},Choices(Vec<WarcraftMapItemChoice>)}
#[derive(Debug,PartialEq,serde::Serialize)]
#[serde(rename_all="camelCase")]
pub struct WarcraftMapUnit {pub id:[u8;4],pub variation:i32,pub location:[f32;3],pub angle:f32,pub scale:[f32;3],pub flags:u8,pub player:i32,pub unknown:u16,pub hitpoints:i32,pub mana:i32,pub dropped_item_table:Option<i32>,pub dropped_item_sets:Vec<Vec<WarcraftMapItemChoice>>,pub gold_amount:i32,pub target_acquisition:f32,pub hero_level:i32,pub hero_attributes:Option<[i32;3]>,pub items_in_inventory:Vec<WarcraftMapInventoryItem>,pub modified_abilities:Vec<WarcraftMapModifiedAbility>,pub random:WarcraftMapRandomPlacement,pub custom_team_color:i32,pub waygate:i32,pub creation_number:i32}
#[derive(Debug,PartialEq,serde::Serialize)]
pub struct WarcraftMapUnits {pub version:i32,pub subversion:u32,pub units:Vec<WarcraftMapUnit>}

impl WarcraftMapDoodads {
    /// Explicit pre-1.32 layout. The DOO version alone cannot identify Reforged skin records; callers select the layout from the map build.
    pub fn parse(bytes:&[u8],limits:WarcraftMapLimits,cancel:&WarcraftMapCancelToken)->Result<Self> {doodads(bytes,&limits,cancel,&mut Budget::new(limits.max_decoded_bytes))}
}
impl WarcraftMapUnits {
    /// Explicit pre-1.32 layout, including original reserved and random fields without evaluating their gameplay meaning.
    pub fn parse(bytes:&[u8],limits:WarcraftMapLimits,cancel:&WarcraftMapCancelToken)->Result<Self> {units(bytes,&limits,cancel,&mut Budget::new(limits.max_decoded_bytes))}
}

fn choices(r:&mut Reader<'_>,budget:&mut Budget)->Result<Vec<WarcraftMapItemChoice>> {let count=r.count(8)?; let mut values=r.array(count,budget)?; for _ in 0..count {values.push(WarcraftMapItemChoice {id:r.code()?,chance:r.i32()?});} Ok(values)}
fn item_sets(r:&mut Reader<'_>,budget:&mut Budget)->Result<Vec<Vec<WarcraftMapItemChoice>>> {let count=r.count(4)?; let mut values=r.array(count,budget)?; for _ in 0..count {values.push(choices(r,budget)?);} Ok(values)}

pub(super) fn doodads(bytes:&[u8],limits:&WarcraftMapLimits,cancel:&WarcraftMapCancelToken,budget:&mut Budget)->Result<WarcraftMapDoodads> {
    let mut r=Reader::new(bytes,"war3map.doo",limits,cancel)?; if r.take(4)?!=b"W3do" {return Err(r.fail("invalid DOO magic"));} let version=r.i32()?; let subversion=r.i32()?;
    if !matches!(version,7|8) {return Err(r.fail("unsupported classic doodad version; 1.32 skin records require a separate layout"));}
    let count=r.count(if version==7 {42} else {50})?; let mut doodads=r.array(count,budget)?;
    for _ in 0..count {
        let id=r.code()?; let variation=r.i32()?; let location=r.floats()?; let angle=r.f32()?; let scale=r.floats()?; let flags=r.take(1)?[0]; let life=r.take(1)?[0];
        let (item_table,item_sets)=if version==8 {(Some(r.u32()?),item_sets(&mut r,budget)?)} else {(None,Vec::new())}; let editor_id=r.i32()?;
        doodads.push(WarcraftMapDoodad {id,variation,location,angle,scale,flags,life,item_table,item_sets,editor_id});
    }
    let terrain_version=r.u32()?; let count=r.count(16)?; let mut terrain_doodads=r.array(count,budget)?;
    for _ in 0..count {terrain_doodads.push(WarcraftMapTerrainDoodad {id:r.code()?,unknown:r.u32()?,location:[r.u32()?,r.u32()?]});} r.finish()?;
    Ok(WarcraftMapDoodads {version,subversion,doodads,terrain_version,terrain_doodads})
}

pub(super) fn units(bytes:&[u8],limits:&WarcraftMapLimits,cancel:&WarcraftMapCancelToken,budget:&mut Budget)->Result<WarcraftMapUnits> {
    let mut r=Reader::new(bytes,"war3mapUnits.doo",limits,cancel)?; if r.take(4)?!=b"W3do" {return Err(r.fail("invalid unit DOO magic"));} let version=r.i32()?; let subversion=r.u32()?;
    if !matches!((version,subversion),(7,9)|(8,11)) {return Err(r.fail("unsupported classic unit version/subversion"));}
    let count=r.count(if subversion==9 {91} else {107})?; let mut units=r.array(count,budget)?;
    for _ in 0..count {
        let id=r.code()?; let variation=r.i32()?; let location=r.floats()?; let angle=r.f32()?; let scale=r.floats()?; let flags=r.take(1)?[0]; let player=r.i32()?; let unknown=u16::from_le_bytes(r.take(2)?.try_into().unwrap()); let hitpoints=r.i32()?; let mana=r.i32()?;
        let dropped_item_table=if subversion==11 {Some(r.i32()?)} else {None}; let dropped_item_sets=item_sets(&mut r,budget)?; let gold_amount=r.i32()?; let target_acquisition=r.f32()?; let hero_level=r.i32()?;
        let hero_attributes=if subversion==11 {Some(r.integers()?)} else {None}; let count=r.count(8)?; let mut items_in_inventory=r.array(count,budget)?;
        for _ in 0..count {items_in_inventory.push(WarcraftMapInventoryItem {slot:r.i32()?,id:r.code()?});} let count=r.count(12)?; let mut modified_abilities=r.array(count,budget)?;
        for _ in 0..count {modified_abilities.push(WarcraftMapModifiedAbility {id:r.code()?,active_for_autocast:r.i32()?,hero_level:r.i32()?});}
        let random=match r.i32()? {-1=>WarcraftMapRandomPlacement::None,0=>WarcraftMapRandomPlacement::Any {level:r.take(3)?.try_into().unwrap(),item_class:r.take(1)?[0]},1=>WarcraftMapRandomPlacement::Group {unit_group:r.u32()?,position_in_group:r.u32()?},2=>WarcraftMapRandomPlacement::Choices(choices(&mut r,budget)?),_=>return Err(r.fail("unsupported random placement flag"))};
        let custom_team_color=r.i32()?; let waygate=r.i32()?; let creation_number=r.i32()?;
        units.push(WarcraftMapUnit {id,variation,location,angle,scale,flags,player,unknown,hitpoints,mana,dropped_item_table,dropped_item_sets,gold_amount,target_acquisition,hero_level,hero_attributes,items_in_inventory,modified_abilities,random,custom_team_color,waygate,creation_number});
    }
    r.finish()?; Ok(WarcraftMapUnits {version,subversion,units})
}
