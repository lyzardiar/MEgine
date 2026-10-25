// Author: MiYu. Parse map records with explicit input, allocation, count and cancellation boundaries.
use super::*;

pub(super) struct Budget {remaining:usize}
impl Budget {
    pub fn new(bytes:usize)->Self {Self {remaining:bytes}}
    pub fn charge(&mut self,member:&'static str,bytes:usize)->Result<()> {self.remaining=self.remaining.checked_sub(bytes).ok_or_else(||WarcraftMapError::Limit {member,message:"decoded map data exceeds byte budget".into()})?; Ok(())}
    pub fn push<T>(&mut self,member:&'static str,values:&mut Vec<T>,value:T)->Result<()> {
        if values.len()==values.capacity() {let extra=values.capacity().max(1); self.charge(member,extra.checked_mul(std::mem::size_of::<T>()).ok_or_else(||WarcraftMapError::Limit {member,message:"record allocation overflow".into()})?)?; values.try_reserve_exact(extra).map_err(|_|WarcraftMapError::Limit {member,message:"cannot reserve record array".into()})?;} values.push(value); Ok(())
    }
}
pub(super) struct Reader<'a> {pub bytes:&'a[u8],pub at:usize,pub member:&'static str,pub limits:&'a WarcraftMapLimits,pub cancel:&'a WarcraftMapCancelToken}
impl<'a> Reader<'a> {
    pub fn new(bytes:&'a[u8],member:&'static str,limits:&'a WarcraftMapLimits,cancel:&'a WarcraftMapCancelToken)->Result<Self> {cancel.check()?; if bytes.len()>limits.max_member_bytes {return Err(WarcraftMapError::Limit {member,message:"member exceeds input byte limit".into()});} Ok(Self {bytes,at:0,member,limits,cancel})}
    pub fn remaining(&self)->usize {self.bytes.len()-self.at}
    pub fn fail(&self,message:impl Into<String>)->WarcraftMapError {WarcraftMapError::Format {member:self.member,offset:self.at,message:message.into()}}
    pub fn limit(&self,message:impl Into<String>)->WarcraftMapError {WarcraftMapError::Limit {member:self.member,message:message.into()}}
    pub fn take(&mut self,count:usize)->Result<&'a[u8]> {self.cancel.check()?; let end=self.at.checked_add(count).ok_or_else(||self.fail("record range overflow"))?; let value=self.bytes.get(self.at..end).ok_or_else(||self.fail("truncated record"))?; self.at=end; Ok(value)}
    pub fn u32(&mut self)->Result<u32> {Ok(u32::from_le_bytes(self.take(4)?.try_into().unwrap()))}
    pub fn i32(&mut self)->Result<i32> {Ok(self.u32()? as i32)}
    pub fn f32(&mut self)->Result<f32> {let value=f32::from_bits(self.u32()?); if !value.is_finite() {return Err(self.fail("non-finite coordinate"));} Ok(value)}
    pub fn code(&mut self)->Result<[u8;4]> {Ok(self.take(4)?.try_into().unwrap())}
    pub fn floats<const N:usize>(&mut self)->Result<[f32;N]> {let mut value=[0.;N]; for field in &mut value {*field=self.f32()?;} Ok(value)}
    pub fn integers<const N:usize>(&mut self)->Result<[i32;N]> {let mut value=[0;N]; for field in &mut value {*field=self.i32()?;} Ok(value)}
    pub fn text(&mut self,budget:&mut Budget)->Result<String> {
        let search=self.remaining().min(self.limits.max_string_bytes.saturating_add(1)); let length=self.bytes[self.at..self.at+search].iter().position(|n|*n==0).ok_or_else(||if self.remaining()>self.limits.max_string_bytes {self.limit("string exceeds byte limit")} else {self.fail("unterminated string")})?;
        let raw=self.take(length+1)?; let value=std::str::from_utf8(&raw[..length]).map_err(|_|self.fail("non-UTF-8 string requires an explicit legacy encoding policy"))?; budget.charge(self.member,value.len())?;
        let mut output=String::new(); output.try_reserve_exact(value.len()).map_err(|_|self.limit("cannot reserve string"))?; output.push_str(value); Ok(output)
    }
    pub fn count(&mut self,minimum:usize)->Result<usize> {let count=self.i32()?; if count<0 || minimum>0 && count as usize>self.remaining()/minimum {return Err(self.fail("invalid record count"));} if count as usize>self.limits.max_records {return Err(self.limit("record count exceeds limit"));} Ok(count as usize)}
    pub fn array<T>(&self,count:usize,budget:&mut Budget)->Result<Vec<T>> {budget.charge(self.member,count.checked_mul(std::mem::size_of::<T>()).ok_or_else(||self.limit("array allocation overflow"))?)?; let mut values=Vec::new(); values.try_reserve_exact(count).map_err(|_|self.limit("cannot reserve record array"))?; Ok(values)}
    pub fn finish(&self)->Result<()> {self.cancel.check()?; if self.remaining()!=0 {return Err(self.fail("unexpected trailing bytes"));} Ok(())}
}

pub(super) fn terrain(bytes:Arc<[u8]>,limits:&WarcraftMapLimits,cancel:&WarcraftMapCancelToken,budget:&mut Budget)->Result<WarcraftMapTerrain> {
    let mut r=Reader::new(&bytes,"war3map.w3e",limits,cancel)?; if r.take(4)?!=b"W3E!" || r.i32()?!=11 {return Err(r.fail("unsupported W3E magic or version"));}
    let tileset=r.take(1)?[0]; let custom=r.i32()?; let count=r.count(4)?; let mut ground=r.array(count,budget)?; for _ in 0..count {ground.push(r.code()?);} let count=r.count(4)?; let mut cliffs=r.array(count,budget)?; for _ in 0..count {cliffs.push(r.code()?);}
    let size=r.integers::<2>()?; let origin=r.floats::<2>()?; if size.iter().any(|n|*n<2) {return Err(r.fail("terrain dimensions must include at least two vertices per axis"));}
    let count=(size[0] as usize).checked_mul(size[1] as usize).filter(|n|*n<=limits.max_terrain_vertices).ok_or_else(||r.limit("terrain vertex count exceeds limit"))?; let count=count.checked_mul(7).ok_or_else(||r.limit("terrain payload size overflow"))?; let offset=r.at; if count!=r.remaining() {return Err(r.fail("terrain corner count differs from payload length"));} r.take(count)?; r.finish()?;
    Ok(WarcraftMapTerrain {bytes,offset,size:[size[0] as u32,size[1] as u32],origin,tileset,custom,ground,cliffs})
}
pub(super) fn pathing(bytes:Arc<[u8]>,limits:&WarcraftMapLimits,cancel:&WarcraftMapCancelToken)->Result<WarcraftMapPathing> {
    let mut r=Reader::new(&bytes,"war3map.wpm",limits,cancel)?; if r.take(4)?!=b"MP3W" || r.i32()?!=0 {return Err(r.fail("unsupported WPM magic or version"));} let size=r.integers::<2>()?; if size.iter().any(|n|*n<1) {return Err(r.fail("pathing dimensions must be positive"));}
    let count=(size[0] as usize).checked_mul(size[1] as usize).filter(|n|*n<=limits.max_pathing_cells).ok_or_else(||r.limit("pathing cell count exceeds limit"))?; if count!=r.remaining() {return Err(r.fail("pathing cell count differs from payload length"));} r.take(count)?; r.finish()?; Ok(WarcraftMapPathing {bytes,size:[size[0] as u32,size[1] as u32]})
}
