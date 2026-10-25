// Author: MiYu. Read bounded SYLK table coordinates and quoted source values without assuming one cell per physical row.
use crate::{WarcraftMapCancelToken,WarcraftMapError};
type Result<T> = std::result::Result<T,WarcraftMapError>;
fn invalid(member:&'static str,message:impl Into<String>)->WarcraftMapError {WarcraftMapError::Format {member,offset:0,message:message.into()}}
fn limit(member:&'static str,message:impl Into<String>)->WarcraftMapError {WarcraftMapError::Limit {member,message:message.into()}}
fn check(cancel:&WarcraftMapCancelToken)->Result<()> {if cancel.is_cancelled() {Err(WarcraftMapError::Cancelled)} else {Ok(())}}
use std::collections::BTreeMap;

pub(crate) struct Table {headers:BTreeMap<String,usize>,names:BTreeMap<String,usize>,rows:BTreeMap<usize,BTreeMap<usize,String>>}
fn fields<'a>(line:&'a str,member:&'static str)->Result<Vec<&'a str>> {
    let b=line.as_bytes(); let (mut at,mut start,mut quoted)=(0,0,false); let mut fields=vec![];
    while at<b.len() {match b[at] {b'"'=>{if quoted && b.get(at+1)==Some(&b'"') {at+=1;} else {quoted=!quoted;}},b';' if !quoted=>{if fields.len()>=64 {return Err(limit(member,"too many SYLK record fields"));} fields.push(&line[start..at]); start=at+1;},_=>{}} at+=1;}
    if quoted {return Err(invalid(member,"unterminated SYLK quote"));} fields.push(&line[start..]); Ok(fields)
}
fn value(field:&str,member:&'static str)->Result<String> {
    if field.len()>1024*1024 {return Err(limit(member,"SYLK value exceeds byte limit"));}
    if !field.starts_with('"') {if field.contains('"') {return Err(invalid(member,"invalid SYLK quote"));} return Ok(field.into());}
    let inner=field.strip_prefix('"').and_then(|s|s.strip_suffix('"')).ok_or_else(||invalid(member,"invalid SYLK quoted value"))?; let mut chars=inner.chars(); let mut out=String::new(); out.try_reserve_exact(inner.len()).map_err(|_|limit(member,"cannot reserve SYLK value"))?;
    while let Some(c)=chars.next() {if c=='"' && chars.next()!=Some('"') {return Err(invalid(member,"unescaped SYLK quote"));} out.push(c);} Ok(out)
}
impl Table {
    pub fn parse(bytes:&[u8],member:&'static str,charge:&mut impl FnMut(usize)->Result<()>,cancel:&WarcraftMapCancelToken)->Result<Self> {
        check(cancel)?; let text=std::str::from_utf8(bytes).map_err(|_|invalid(member,"SYLK source must be UTF-8"))?.trim_start_matches('\u{feff}'); if !text.starts_with("ID;") {return Err(invalid(member,"missing SYLK ID record"));}
        let (mut x,mut y)=(1usize,1usize); let mut rows:BTreeMap<usize,BTreeMap<usize,String>>=BTreeMap::new(); let mut cells=0usize;
        for line in text.lines() {check(cancel)?; if !line.starts_with("C;") {continue;} let mut k=None;
            for field in fields(line,member)?.into_iter().skip(1) {match field.as_bytes().first() {Some(b'X')|Some(b'Y')=>{let n=field[1..].parse::<usize>().map_err(|_|invalid(member,"invalid SYLK coordinate"))?; if n==0 || n>65536 || field.starts_with('X') && n>512 {return Err(limit(member,"SYLK coordinate exceeds limit"));} if field.starts_with('X') {x=n;} else {y=n;}},Some(b'K')=>{if k.replace(&field[1..]).is_some() {return Err(invalid(member,"duplicate SYLK value field"));}},_=>{}}}
            if let Some(raw)=k {cells+=1; if cells>1_000_000 {return Err(limit(member,"too many SYLK cells"));} charge(raw.len()+256)?; let v=value(raw,member)?; if rows.entry(y).or_default().insert(x,v).is_some() {return Err(invalid(member,"duplicate SYLK cell"));}}
        }
        let header=rows.remove(&1).ok_or_else(||invalid(member,"missing SYLK headers"))?; let mut headers=BTreeMap::new(); for (x,name) in header {if name.is_empty() || headers.insert(name,x).is_some() {return Err(invalid(member,"empty or duplicate SYLK header"));}}
        let mut names=BTreeMap::new(); for (&y,row) in &rows {if let Some(name)=row.get(&1) {charge(name.len()+128)?; if name.is_empty() || names.insert(name.clone(),y).is_some() {return Err(invalid(member,"empty or duplicate SYLK row ID"));}}}
        check(cancel)?; Ok(Self {headers,names,rows})
    }
    pub fn get(&self,row:&str,column:&str)->Option<&str> {self.names.get(row).and_then(|y|self.get_at(*y,column))}
    pub fn get_at(&self,row:usize,column:&str)->Option<&str> {self.rows.get(&row).and_then(|r|self.headers.get(column).and_then(|x|r.get(x))).map(|s|s.as_str())}
    pub fn row_names(&self)->impl Iterator<Item=(&str,usize)> {self.names.iter().map(|(name,row)|(name.as_str(),*row))}
    pub fn columns(&self)->impl Iterator<Item=&str> {self.headers.keys().map(String::as_str)}
}
