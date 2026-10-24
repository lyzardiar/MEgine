// Author: MiYu. Bound idle UI file textures while preserving every texture referenced by the current frame.
use std::collections::HashMap;
const GRACE_FRAMES: u64 = 120;
const MAX_ENTRIES: usize = 128;
const MAX_BYTES: u64 = 64 * 1024 * 1024;

#[derive(Clone, Copy)]
pub(super) struct UiTextureUsage {pub frame:u64,pub bytes:u64}

pub(super) fn ui_texture_evictions(used: &HashMap<String, UiTextureUsage>, epoch: u64) -> Vec<String> {
    let mut entries = used.len();let mut bytes = used.values().fold(0u64, |total, entry| total.saturating_add(entry.bytes));
    let mut idle = used.iter().filter(|(_, entry)| entry.frame != epoch).map(|(key, entry)| (key, epoch.wrapping_sub(entry.frame), entry.bytes)).collect::<Vec<_>>();
    idle.sort_by(|left, right| right.1.cmp(&left.1).then(left.0.cmp(right.0)));
    let mut evicted = Vec::new();
    for (key, age, size) in idle {
        if age <= GRACE_FRAMES && entries <= MAX_ENTRIES && bytes <= MAX_BYTES { break; }
        evicted.push(key.clone());entries -= 1;bytes = bytes.saturating_sub(size);
    }
    evicted
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn age_count_and_byte_budgets_preserve_current_textures_and_handle_epoch_wrap() {
        let mut used=HashMap::from([("old".into(),UiTextureUsage {frame:1,bytes:1}),("current".into(),UiTextureUsage {frame:122,bytes:MAX_BYTES+1})]);
        assert_eq!(ui_texture_evictions(&used,122),vec!["old"]);used.remove("old");assert!(ui_texture_evictions(&used,122).is_empty());
        used=HashMap::from([("old".into(),UiTextureUsage {frame:u64::MAX-120,bytes:1}),("current".into(),UiTextureUsage {frame:1,bytes:1})]);assert_eq!(ui_texture_evictions(&used,1),vec!["old"]);
        used=(0..130).map(|index|(format!("{index:03}"),UiTextureUsage {frame:2,bytes:1})).collect();assert!(ui_texture_evictions(&used,2).is_empty());assert_eq!(ui_texture_evictions(&used,3),vec!["000","001"]);
        used=HashMap::from([("old".into(),UiTextureUsage {frame:1,bytes:MAX_BYTES}),("young".into(),UiTextureUsage {frame:2,bytes:4}),("current".into(),UiTextureUsage {frame:3,bytes:4})]);assert_eq!(ui_texture_evictions(&used,3),vec!["old"]);
        used=HashMap::from([("grace".into(),UiTextureUsage {frame:1,bytes:1})]);assert!(ui_texture_evictions(&used,121).is_empty());assert_eq!(ui_texture_evictions(&used,122),vec!["grace"]);
    }
}
