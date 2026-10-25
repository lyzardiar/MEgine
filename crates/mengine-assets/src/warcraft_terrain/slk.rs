// Author: MiYu. Adapt the shared bounded source SYLK reader to the terrain allocation budget.
use super::*;
pub(super) struct Table(crate::warcraft_slk::Table);
impl Table {
    pub fn parse(bytes:&[u8],budget:&mut Budget,cancel:&WarcraftMapCancelToken)->Result<Self> {Ok(Self(crate::warcraft_slk::Table::parse(bytes,"terrain compiler",&mut |n|budget.charge(n),cancel)?))}
    pub fn get(&self,row:&str,column:&str)->Result<&str> {self.0.get(row,column).ok_or_else(||invalid(format!("missing source table field {row}.{column}")))}
}
