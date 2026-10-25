// Author: MiYu. Index WTS values in their original UTF-8 payload, preserving multiline contents without duplicate strings.
use super::*;
use super::reader::Budget;
use std::ops::Range;

struct Entry {id:u32,range:Range<usize>,line:usize}
pub struct WarcraftStringTable {bytes:Arc<[u8]>,entries:Vec<Entry>}
impl WarcraftStringTable {
    pub fn parse(bytes:Arc<[u8]>,limits:WarcraftMapLimits)->Result<Self> {parse(bytes,&limits,&WarcraftMapCancelToken::default(),&mut Budget::new(limits.max_decoded_bytes))}
    pub fn len(&self)->usize {self.entries.len()}
    pub fn is_empty(&self)->bool {self.entries.is_empty()}
    /// Borrow validated values in numeric ID order without copying their contents.
    pub fn iter(&self)->impl ExactSizeIterator<Item=(u32,&str)> {self.entries.iter().map(|e|(e.id,std::str::from_utf8(&self.bytes[e.range.clone()]).expect("validated WTS UTF-8 range")))}
    pub fn get(&self,id:u32)->Option<&str> {let index=self.entries.binary_search_by_key(&id,|e|e.id).ok()?; std::str::from_utf8(&self.bytes[self.entries[index].range.clone()]).ok()}
    pub fn resolve<'a>(&'a self,value:&'a str)->&'a str {value.strip_prefix("TRIGSTR_").filter(|id|!id.is_empty() && id.bytes().all(|n|n.is_ascii_digit())).and_then(|id|id.parse::<u32>().ok()).and_then(|id|self.get(id)).unwrap_or(value)}
}

enum State {Outside,Open(u32),Value(u32,usize)}
pub(super) fn parse(bytes:Arc<[u8]>,limits:&WarcraftMapLimits,cancel:&WarcraftMapCancelToken,budget:&mut Budget)->Result<WarcraftStringTable> {
    cancel.check()?; let member="war3map.wts"; if bytes.len()>limits.max_member_bytes {return Err(WarcraftMapError::Limit {member,message:"string table exceeds input byte limit".into()});}
    let format=|offset,message:&str|WarcraftMapError::Format {member,offset,message:message.into()};
    let text=std::str::from_utf8(&bytes).map_err(|_|format(0,"string table is not UTF-8"))?; let mut at=if text.starts_with('\u{feff}') {3} else {0}; let text=&text[at..]; let mut state=State::Outside; let mut entries=Vec::new(); let mut total=0usize;
    for line in text.split_inclusive('\n') {
        cancel.check()?; let trim=line.trim_matches(|c|matches!(c,' '| '\t'| '\r'| '\n')); let next=at+line.len();
        match state {
            State::Outside=>{if trim.is_empty() || trim.starts_with("//") {} else {
                let rest=trim.strip_prefix("STRING").filter(|rest|rest.starts_with([' ','\t'])).ok_or_else(||format(at,"expected STRING identifier"))?.trim_matches([' ','\t']);
                let id=if !rest.is_empty() && rest.bytes().all(|n|n.is_ascii_digit()) {rest.parse::<u32>().map_err(|_|format(at,"string identifier exceeds32 bits"))?} else {return Err(format(at,"invalid string identifier"));};
                state=State::Open(id);
            }},
            State::Open(id)=>{if trim.is_empty() || trim.starts_with("//") {} else if trim=="{" {state=State::Value(id,next);} else {return Err(format(at,"expected opening brace"));}},
            State::Value(id,start)=>{if trim=="}" {let mut end=at; if end>start && bytes[end-1]==b'\n' {end-=1;} if end>start && bytes[end-1]==b'\r' {end-=1;}
                let length=end-start; total=total.checked_add(length).filter(|n|*n<=limits.max_text_bytes).ok_or_else(||WarcraftMapError::Limit {member,message:"string contents exceed total byte limit".into()})?;
                if length>limits.max_string_bytes || entries.len()>=limits.max_records {return Err(WarcraftMapError::Limit {member,message:"string size or entry count exceeds limit".into()});}
                budget.push(member,&mut entries,Entry {id,range:start..end,line:at})?; state=State::Outside;
            }},
        }
        at=next;
    }
    if !matches!(state,State::Outside) {return Err(format(at,"unterminated STRING block"));} cancel.check()?; entries.sort_unstable_by_key(|e|e.id); if let Some(pair)=entries.windows(2).find(|p|p[0].id==p[1].id) {return Err(format(pair[1].line,"duplicate string identifier"));} cancel.check()?; Ok(WarcraftStringTable {bytes,entries})
}
