// Author: MiYu. Reuse a bounded object-buffer image and coalesce changed upload ranges.
use std::ops::Range;
const MAX_BYTES: usize=8*1024*1024;
const MAX_RANGES: usize=8;
const MAX_GAP: usize=256;

#[derive(Default)]
pub(super) struct ObjectPacketCache { bytes: Vec<u8>, ranges: Vec<Range<usize>>, valid: bool, full: bool }
impl ObjectPacketCache {
    pub(super) fn invalidate(&mut self) { self.valid=false; }
    pub(super) fn begin(&mut self, required: usize) -> bool {
        self.ranges.clear();
        if required==0 || required>MAX_BYTES { self.bytes=Vec::new();self.valid=false;self.full=false;return false; }
        self.full=!self.valid || required>self.bytes.len();self.valid=false;
        if required>self.bytes.capacity() {self.bytes.reserve_exact(required-self.bytes.len());}
        self.bytes.resize(required,0);
        if self.bytes.capacity()>required.saturating_mul(2).max(16*1024) {self.bytes.shrink_to_fit();}
        true
    }
    pub(super) fn update(&mut self, offset: usize, data: &[u8]) {
        let end=offset+data.len();let current=&mut self.bytes[offset..end];
        if !self.full && current==data {return;}
        current.copy_from_slice(data);if self.full {return;}
        if let Some(last)=self.ranges.last_mut() {if offset<=last.end+MAX_GAP {last.start=last.start.min(offset);last.end=last.end.max(end);if last.len()>self.bytes.len()/2 {self.ranges.clear();self.full=true;}return;}}
        if self.ranges.len()==MAX_RANGES {self.ranges.clear();self.full=true;}else {self.ranges.push(offset..end);}
    }
    pub(super) fn ranges(&self) -> impl Iterator<Item=Range<usize>>+'_ {
        let full=self.full || self.ranges.iter().map(|range|range.len()).sum::<usize>()>self.bytes.len()/2;
        full.then_some(0..self.bytes.len()).into_iter().chain(self.ranges.iter().filter(move |_|!full).cloned())
    }
    pub(super) fn bytes(&self) -> &[u8] {&self.bytes}
    pub(super) fn uploaded(&mut self) {self.valid=true;}
    #[cfg(test)] pub(super) fn capacity(&self) -> usize {self.bytes.capacity()}
}
