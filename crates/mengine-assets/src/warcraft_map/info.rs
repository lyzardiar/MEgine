// Author: MiYu. Preserve classic W3I18/25 map screens, players, forces and editor tables in source order.
use super::*;
use super::reader::{Reader,Budget};

#[derive(Clone,Debug,PartialEq,serde::Serialize)]
#[serde(rename_all="camelCase")]
pub struct WarcraftMapScreen {pub background:Option<i32>,pub model:String,pub text:String,pub title:String,pub subtitle:String}
#[derive(Clone,Debug,PartialEq,serde::Serialize)]
#[serde(rename_all="camelCase")]
pub struct WarcraftMapFog {pub style:i32,pub height:[f32;2],pub density:f32,pub color:[u8;4]}
#[derive(Clone,Debug,PartialEq,serde::Serialize)]
#[serde(rename_all="camelCase")]
pub struct WarcraftMapPlayer {pub id:i32,pub kind:i32,pub race:i32,pub fixed_start_position:i32,pub name:String,pub start_location:[f32;2],pub ally_low_priorities:u32,pub ally_high_priorities:u32}
#[derive(Clone,Debug,PartialEq,serde::Serialize)]
#[serde(rename_all="camelCase")]
pub struct WarcraftMapForce {pub flags:u32,pub player_mask:u32,pub name:String}
#[derive(Clone,Debug,PartialEq,serde::Serialize)]
#[serde(rename_all="camelCase")]
pub struct WarcraftMapUpgrade {pub player_flags:u32,pub id:[u8;4],pub level:i32,pub availability:i32}
#[derive(Clone,Debug,PartialEq,serde::Serialize)]
#[serde(rename_all="camelCase")]
pub struct WarcraftMapTech {pub player_flags:u32,pub id:[u8;4]}
#[derive(Clone,Debug,PartialEq,serde::Serialize)]
pub struct WarcraftMapRandomUnitChoice {pub chance:i32,pub ids:Vec<[u8;4]>}
#[derive(Clone,Debug,PartialEq,serde::Serialize)]
#[serde(rename_all="camelCase")]
pub struct WarcraftMapRandomUnits {pub id:i32,pub name:String,pub column_types:Vec<i32>,pub choices:Vec<WarcraftMapRandomUnitChoice>}
#[derive(Clone,Debug,PartialEq,serde::Serialize)]
pub struct WarcraftMapRandomItemChoice {pub chance:i32,pub id:[u8;4]}
#[derive(Clone,Debug,PartialEq,serde::Serialize)]
pub struct WarcraftMapRandomItems {pub id:i32,pub name:String,pub sets:Vec<Vec<WarcraftMapRandomItemChoice>>}

#[derive(Clone,Debug,PartialEq,serde::Serialize)]
#[serde(rename_all="camelCase")]
pub struct WarcraftMapInfo {pub version:i32,pub saves:i32,pub editor_version:i32,pub name:String,pub author:String,pub description:String,pub recommended_players:String,pub camera_bounds:[f32;8],pub camera_complements:[i32;4],pub playable_size:[i32;2],pub flags:u32,pub tileset:u8,pub loading_screen:WarcraftMapScreen,pub game_data_set:i32,pub prologue_screen:WarcraftMapScreen,pub fog:Option<WarcraftMapFog>,pub global_weather:u32,pub sound_environment:String,pub light_environment_tileset:Option<u8>,pub water_vertex_color:Option<[u8;4]>,pub players:Vec<WarcraftMapPlayer>,pub forces:Vec<WarcraftMapForce>,pub upgrades:Vec<WarcraftMapUpgrade>,pub tech:Vec<WarcraftMapTech>,pub random_units:Vec<WarcraftMapRandomUnits>,pub random_items:Vec<WarcraftMapRandomItems>,pub omitted_editor_tables:bool,pub editor_table_tail:Vec<u8>}
impl WarcraftMapInfo {pub fn parse(bytes:&[u8],limits:WarcraftMapLimits)->Result<Self> {parse(bytes,&limits,&WarcraftMapCancelToken::default(),&mut Budget::new(limits.max_decoded_bytes))}}

fn screen(r:&mut Reader<'_>,background:Option<i32>,has_model:bool,budget:&mut Budget)->Result<WarcraftMapScreen> {Ok(WarcraftMapScreen {background,model:if has_model {r.text(budget)?} else {String::new()},text:r.text(budget)?,title:r.text(budget)?,subtitle:r.text(budget)?})}

pub(super) fn parse(bytes:&[u8],limits:&WarcraftMapLimits,cancel:&WarcraftMapCancelToken,budget:&mut Budget)->Result<WarcraftMapInfo> {
    let mut r=Reader::new(bytes,"war3map.w3i",limits,cancel)?; let version=r.i32()?; if !matches!(version,18|25) {return Err(r.fail("unsupported W3I version; expected18 or25"));}
    let saves=r.i32()?; let editor_version=r.i32()?; let name=r.text(budget)?; let author=r.text(budget)?; let description=r.text(budget)?; let recommended_players=r.text(budget)?;
    let camera_bounds=r.floats::<8>()?; let camera_complements=r.integers::<4>()?; let playable_size=r.integers::<2>()?; let flags=r.u32()?; let tileset=r.take(1)?[0];
    let background=r.i32()?; let loading_screen=screen(&mut r,Some(background),version==25,budget)?; let game_data_set=r.i32()?; let prologue_screen=screen(&mut r,None,version==25,budget)?;
    let (fog,global_weather,sound_environment,light_environment_tileset,water_vertex_color)=if version==25 {
        let fog=WarcraftMapFog {style:r.i32()?,height:r.floats::<2>()?,density:r.f32()?,color:r.take(4)?.try_into().unwrap()}; let weather=r.u32()?; let sound=r.text(budget)?; let light=r.take(1)?[0]; let water=r.take(4)?.try_into().unwrap(); (Some(fog),weather,sound,Some(light),Some(water))
    } else {(None,0,String::new(),None,None)};
    let count=r.count(33)?; let mut players=r.array(count,budget)?;
    for _ in 0..count {players.push(WarcraftMapPlayer {id:r.i32()?,kind:r.i32()?,race:r.i32()?,fixed_start_position:r.i32()?,name:r.text(budget)?,start_location:r.floats::<2>()?,ally_low_priorities:r.u32()?,ally_high_priorities:r.u32()?});}
    let count=r.count(9)?; let mut forces=r.array(count,budget)?;
    for _ in 0..count {forces.push(WarcraftMapForce {flags:r.u32()?,player_mask:r.u32()?,name:r.text(budget)?});}
    let omitted_editor_tables=matches!(&bytes[r.at..],[]|[0xff]);
    let mut upgrades=Vec::new(); let mut tech=Vec::new(); let mut random_units=Vec::new(); let mut random_items=Vec::new(); let mut editor_table_tail=Vec::new();
    if omitted_editor_tables {let remaining=r.remaining(); editor_table_tail=r.array(remaining,budget)?; editor_table_tail.extend_from_slice(r.take(remaining)?);} else {
        let count=r.count(16)?; upgrades=r.array(count,budget)?; for _ in 0..count {upgrades.push(WarcraftMapUpgrade {player_flags:r.u32()?,id:r.code()?,level:r.i32()?,availability:r.i32()?});}
        let count=r.count(8)?; tech=r.array(count,budget)?; for _ in 0..count {tech.push(WarcraftMapTech {player_flags:r.u32()?,id:r.code()?});}
        let count=r.count(13)?; random_units=r.array(count,budget)?;
        for _ in 0..count {
            let id=r.i32()?; let name=r.text(budget)?; let count=r.count(4)?; let mut column_types=r.array(count,budget)?; for _ in 0..count {column_types.push(r.i32()?);}
            let minimum=4usize.checked_add(column_types.len().checked_mul(4).ok_or_else(||r.limit("random-unit row size overflow"))?).ok_or_else(||r.limit("random-unit row size overflow"))?;
            let count=r.count(minimum)?; let mut choices=r.array(count,budget)?;
            for _ in 0..count {let chance=r.i32()?; let mut ids=r.array(column_types.len(),budget)?; for _ in 0..column_types.len() {ids.push(r.code()?);} choices.push(WarcraftMapRandomUnitChoice {chance,ids});}
            random_units.push(WarcraftMapRandomUnits {id,name,column_types,choices});
        }
        if version==25 {let count=r.count(9)?; random_items=r.array(count,budget)?;
            for _ in 0..count {let id=r.i32()?; let name=r.text(budget)?; let count=r.count(4)?; let mut sets=r.array(count,budget)?;
                for _ in 0..count {let count=r.count(8)?; let mut entries=r.array(count,budget)?; for _ in 0..count {entries.push(WarcraftMapRandomItemChoice {chance:r.i32()?,id:r.code()?});} sets.push(entries);}
                random_items.push(WarcraftMapRandomItems {id,name,sets});
            }
        }
    }
    r.finish()?;
    Ok(WarcraftMapInfo {version,saves,editor_version,name,author,description,recommended_players,camera_bounds,camera_complements,playable_size,flags,tileset,loading_screen,game_data_set,prologue_screen,fog,global_weather,sound_environment,light_environment_tileset,water_vertex_color,players,forces,upgrades,tech,random_units,random_items,omitted_editor_tables,editor_table_tail})
}
