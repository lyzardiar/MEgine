// Author: MiYu. Apply original objects before custom inheritance and retain unsupported fields with explicit dispositions.
use super::*;

#[derive(Clone,Copy,Debug,PartialEq,Eq,PartialOrd,Ord,serde::Serialize)]
pub enum WarcraftDefinitionDomain {UnitsAndItems,Doodads,Destructables}
impl WarcraftDefinitionDomain {
    fn kind(kind:WarcraftMapObjectKind)->Option<Self> {match kind {WarcraftMapObjectKind::Units|WarcraftMapObjectKind::Items=>Some(Self::UnitsAndItems),WarcraftMapObjectKind::Doodads=>Some(Self::Doodads),WarcraftMapObjectKind::Destructables=>Some(Self::Destructables),_=>None}}
    pub(super) fn accepts(self,table:WarcraftDefinitionTable)->bool {use WarcraftDefinitionTable::*; match self {Self::UnitsAndItems=>matches!(table,UnitUi|UnitData|UnitBalance|UnitWeapons|UnitAbilities|Items|Profile),Self::Doodads=>table==Doodads,Self::Destructables=>table==Destructables}}
    fn metadata(self)->WarcraftDefinitionTable {match self {Self::UnitsAndItems=>WarcraftDefinitionTable::UnitMetadata,Self::Doodads=>WarcraftDefinitionTable::DoodadMetadata,Self::Destructables=>WarcraftDefinitionTable::DestructableMetadata}}
}
#[derive(Clone,Copy,Debug)]
pub(super) struct Reference {file:usize,custom:bool,object:usize,modification:usize}
#[derive(Clone,PartialEq,Eq,PartialOrd,Ord)]
pub(super) struct Key {pub table:WarcraftDefinitionTable,pub field:String,pub index:i32}
pub(super) struct Object {pub root:[u8;4],pub fields:BTreeMap<(WarcraftDefinitionTable,i32),BTreeMap<String,Reference>>}
#[derive(Clone,Copy,Debug,PartialEq,Eq,serde::Serialize)]
pub enum WarcraftDefinitionDisposition {Applied,UnknownMetadata,UnsupportedTarget,UnsupportedDataPointer,UnsupportedFamily}
#[derive(Debug,serde::Serialize)]
pub struct WarcraftDefinitionOverride {pub file:usize,pub custom:bool,pub object:usize,pub modification:usize,pub disposition:WarcraftDefinitionDisposition}
pub(super) fn value(world:&WarcraftMapWorldData,r:Reference)->&WarcraftMapObjectValue {let f=&world.objects[r.file]; &(if r.custom {&f.custom} else {&f.original})[r.object].modifications[r.modification].value}
fn mapping(defs:&WarcraftMapDefinitions,domain:WarcraftDefinitionDomain,m:&crate::WarcraftMapObjectModification,budget:&mut Budget)->Result<std::result::Result<Key,WarcraftDefinitionDisposition>> {
    use WarcraftDefinitionDisposition::*; let meta=&defs.tables[&domain.metadata()]; let field=if let Some(v)=meta.get(m.field,"field").filter(|s|!s.is_empty()) {v} else {return Ok(Err(UnknownMetadata));};
    let table=meta.get(m.field,"slk").and_then(WarcraftDefinitionTable::named); let table=if let Some(t)=table.filter(|t|domain.accepts(*t)) {t} else {return Ok(Err(UnsupportedTarget));};
    if m.data_pointer.is_some_and(|n|n!=0) {return Ok(Err(UnsupportedDataPointer));}
    let repeated=meta.get(m.field,"repeat").map(|v|v.parse::<u32>().map_err(|_|invalid("invalid metadata repeat count"))).transpose()?.unwrap_or(0); let index=meta.get(m.field,"index").map(|v|v.parse::<i32>().map_err(|_|invalid("invalid metadata field index"))).transpose()?.unwrap_or(-1);
    if field.len()>1024 {return Err(limit("metadata target field exceeds limit"));} budget.charge(field.len()+16+std::mem::size_of::<Key>()+std::mem::size_of::<Reference>()+64)?;
    let field=if repeated!=0 {let level=m.level.filter(|n|*n>=1 && *n as u32<=repeated).ok_or_else(||invalid("doodad variation exceeds metadata repeat range"))?; format!("{field}{level:02}")} else {field.into()};
    // Doodad/destructable index zero addresses a scalar SLK cell; unit/Profile indices address list elements.
    let index=if domain==WarcraftDefinitionDomain::UnitsAndItems {index} else {-1}; Ok(Ok(Key {table,field,index}))
}
pub(super) fn apply(defs:&mut WarcraftMapDefinitions,limits:WarcraftDefinitionLimits,budget:&mut Budget,cancel:&WarcraftMapCancelToken)->Result<()> {
    for custom in [false,true] {for fi in 0..defs.world.objects.len() {
        let kind=defs.world.objects[fi].kind; let rows=if custom {defs.world.objects[fi].custom.len()} else {defs.world.objects[fi].original.len()};
        for oi in 0..rows {
            check(cancel)?; let row=&(if custom {&defs.world.objects[fi].custom} else {&defs.world.objects[fi].original})[oi];
            let base=row.base_id; let target=if custom {row.new_id} else {base}; let mods=row.modifications.len(); let domain=WarcraftDefinitionDomain::kind(kind);
            if let Some(domain)=domain {
                if !defs.contains(domain,base) {return Err(invalid(format!("missing base object {base:?}")));} if custom && defs.contains(domain,target) {return Err(invalid(format!("duplicate custom object {target:?}")));}
                if !defs.overlays.contains_key(&(domain,target)) {
                    if defs.overlays.len()>=limits.max_objects {return Err(limit("too many object definition overlays"));} budget.charge(std::mem::size_of::<Object>()+96)?;
                    let mut object=Object {root:base,fields:BTreeMap::new()}; if custom {if let Some(parent)=defs.overlays.get(&(domain,base)) {object.root=parent.root; for (key,fields) in &parent.fields {budget.charge(128)?; let mut inherited=BTreeMap::new(); for (field,value) in fields {check(cancel)?; budget.charge(field.len()+std::mem::size_of::<Key>()+std::mem::size_of::<Reference>()+64)?; inherited.insert(field.clone(),*value);} object.fields.insert(*key,inherited);}}}
                    defs.overlays.insert((domain,target),object);
                }
            }
            for mi in 0..mods {
                check(cancel)?; let row=&(if custom {&defs.world.objects[fi].custom} else {&defs.world.objects[fi].original})[oi]; let r=Reference {file:fi,custom,object:oi,modification:mi};
                let disposition=if let Some(domain)=domain {match mapping(defs,domain,&row.modifications[mi],budget)? {Ok(key)=>{let fields=&mut defs.overlays.get_mut(&(domain,target)).unwrap().fields; if !fields.contains_key(&(key.table,key.index)) {budget.charge(128)?;} fields.entry((key.table,key.index)).or_default().insert(key.field,r); WarcraftDefinitionDisposition::Applied},Err(reason)=>reason}} else {WarcraftDefinitionDisposition::UnsupportedFamily};
                if defs.dispositions.len()==defs.dispositions.capacity() {let extra=defs.dispositions.capacity().max(1); budget.charge(extra.checked_mul(std::mem::size_of::<WarcraftDefinitionOverride>()).ok_or_else(||limit("override report allocation overflow"))?)?; defs.dispositions.try_reserve_exact(extra).map_err(|_|limit("cannot reserve override report"))?;}
                defs.dispositions.push(WarcraftDefinitionOverride {file:fi,custom,object:oi,modification:mi,disposition});
            }
        }
    }} Ok(())
}
