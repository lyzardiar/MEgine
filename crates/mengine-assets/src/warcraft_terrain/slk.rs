// Author: MiYu. Read bounded SYLK table coordinates and quoted source values without assuming one cell per physical row.
use super::*;
use std::collections::BTreeMap;

pub(super) struct Table {headers:BTreeMap<String,usize>,names:BTreeMap<String,usize>,rows:BTreeMap<usize,BTreeMap<usize,String>>}
fn fields(line:&str)->Result<Vec<&str>> {
    let b=line.as_bytes(); let (mut at,mut start,mut quoted)=(0,0,false); let mut fields=vec![];
    while at<b.len() {match b[at] {b'"'=>{if quoted && b.get(at+1)==Some(&b'"') {at+=1;} else {quoted=!quoted;}},b';' if !quoted=>{if fields.len()>=64 {return Err(limit("too many SYLK record fields"));} fields.push(&line[start..at]); start=at+1;},_=>{}} at+=1;}
    if quoted {return Err(invalid("unterminated SYLK quote"));} fields.push(&line[start..]); Ok(fields)
}
fn value(field:&str)->Result<String> {
    if field.len()>1024*1024 {return Err(limit("SYLK value exceeds byte limit"));}
    if !field.starts_with('"') {if field.contains('"') {return Err(invalid("invalid SYLK quote"));} return Ok(field.into());}
    let inner=field.strip_prefix('"').and_then(|s|s.strip_suffix('"')).ok_or_else(||invalid("invalid SYLK quoted value"))?; let mut chars=inner.chars(); let mut out=String::new(); out.try_reserve_exact(inner.len()).map_err(|_|limit("cannot reserve SYLK value"))?;
    while let Some(c)=chars.next() {if c=='"' && chars.next()!=Some('"') {return Err(invalid("unescaped SYLK quote"));} out.push(c);} Ok(out)
}
impl Table {
    pub fn parse(bytes:&[u8],budget:&mut Budget,cancel:&WarcraftMapCancelToken)->Result<Self> {
        check(cancel)?; let text=std::str::from_utf8(bytes).map_err(|_|invalid("SYLK source must be UTF-8"))?.trim_start_matches('\u{feff}'); if !text.starts_with("ID;") {return Err(invalid("missing SYLK ID record"));}
        let (mut x,mut y)=(1usize,1usize); let mut rows:BTreeMap<usize,BTreeMap<usize,String>>=BTreeMap::new(); let mut cells=0usize;
        for line in text.lines() {check(cancel)?; if !line.starts_with("C;") {continue;} let mut k=None;
            for field in fields(line)?.into_iter().skip(1) {match field.as_bytes().first() {Some(b'X')|Some(b'Y')=>{let n=field[1..].parse::<usize>().map_err(|_|invalid("invalid SYLK coordinate"))?; if n==0 || n>65536 || field.starts_with('X') && n>512 {return Err(limit("SYLK coordinate exceeds limit"));} if field.starts_with('X') {x=n;} else {y=n;}},Some(b'K')=>{if k.replace(&field[1..]).is_some() {return Err(invalid("duplicate SYLK value field"));}},_=>{}}}
            if let Some(raw)=k {cells+=1; if cells>1_000_000 {return Err(limit("too many SYLK cells"));} budget.charge(raw.len()+256)?; let v=value(raw)?; if rows.entry(y).or_default().insert(x,v).is_some() {return Err(invalid("duplicate SYLK cell"));}}
        }
        let header=rows.remove(&1).ok_or_else(||invalid("missing SYLK headers"))?; let mut headers=BTreeMap::new(); for (x,name) in header {if name.is_empty() || headers.insert(name,x).is_some() {return Err(invalid("empty or duplicate SYLK header"));}}
        let mut names=BTreeMap::new(); for (&y,row) in &rows {if let Some(name)=row.get(&1) {budget.charge(name.len()+128)?; if name.is_empty() || names.insert(name.clone(),y).is_some() {return Err(invalid("empty or duplicate SYLK row ID"));}}}
        check(cancel)?; Ok(Self {headers,names,rows})
    }
    pub fn get(&self,row:&str,column:&str)->Result<&str> {self.names.get(row).and_then(|y|self.rows.get(y)).and_then(|r|self.headers.get(column).and_then(|x|r.get(x))).map(|s|s.as_str()).ok_or_else(||invalid(format!("missing source table field {row}.{column}")))}
}
