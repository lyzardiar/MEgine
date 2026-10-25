// Author: MiYu. Resolve mounted resource identities and share bounded immutable byte payloads.
use crate::AssetError;
use parking_lot::Mutex;
use std::{collections::{BTreeMap, HashMap}, sync::{atomic::{AtomicU64, Ordering}, Arc}};

static NEXT_SOURCE: AtomicU64 = AtomicU64::new(1);

/// Process-local mount identity. Reopening or replacing a source gives it a new identity.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct AssetSourceId(u64);
impl AssetSourceId { pub fn fresh() -> Self { Self(NEXT_SOURCE.fetch_add(1, Ordering::Relaxed)) } }

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct AssetLocation { pub source: AssetSourceId, pub member: String }

#[derive(Clone, Debug)]
pub struct AssetBytes { pub location: AssetLocation, pub bytes: Arc<[u8]> }

pub enum AssetSourceRead { Missing, Deleted, Bytes(Arc<[u8]>) }

pub trait AssetByteSource: Send + Sync {
    fn identity(&self) -> AssetSourceId;
    /// member is normalized by AssetMounts. Errors in an overriding source must not fall through.
    fn read(&self, member: &str) -> Result<AssetSourceRead, AssetError>;
}

pub(crate) fn normalize_member(member: &str) -> Result<String, AssetError> {
    let member = member.replace('\\', "/");
    if member.is_empty() || member.len() > 4096 || member.contains(':') || member.chars().any(char::is_control) || member.split('/').any(|p| p.is_empty() || p == "." || p == "..") {
        return Err(AssetError::Invalid("archive member must be a relative resource path without empty or traversal components".into()));
    }
    Ok(member.to_ascii_lowercase())
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct AssetByteCacheStats { pub entries: usize, pub resident_bytes: usize, pub hits: u64, pub misses: u64, pub evictions: u64, pub bypasses: u64 }

struct CacheEntry { bytes: Arc<[u8]>, used: u64 }
#[derive(Default)]
struct CacheState { entries: HashMap<AssetLocation, CacheEntry>, order: BTreeMap<u64, AssetLocation>, clock: u64, stats: AssetByteCacheStats }

/// Limits cache-owned strong references. Live readers may retain bytes after eviction.
pub struct AssetByteCache { state: Mutex<CacheState>, max_bytes: usize, max_entries: usize }

impl Default for AssetByteCache { fn default() -> Self { Self::new(64 * 1024 * 1024, 4096) } }

impl AssetByteCache {
    pub fn new(max_bytes: usize, max_entries: usize) -> Self { Self { state: Mutex::new(CacheState::default()), max_bytes, max_entries } }
    pub fn stats(&self) -> AssetByteCacheStats { self.state.lock().stats }
    pub fn clear(&self) { let mut state = self.state.lock(); state.entries.clear(); state.order.clear(); state.stats.entries = 0; state.stats.resident_bytes = 0; }

    pub fn remove_source(&self, source: AssetSourceId) {
        let mut state = self.state.lock();
        let keys = state.entries.keys().filter(|key| key.source == source).cloned().collect::<Vec<_>>();
        for key in keys { if let Some(entry) = state.entries.remove(&key) { state.order.remove(&entry.used); state.stats.resident_bytes -= entry.bytes.len(); } }
        state.stats.entries = state.entries.len();
    }

    fn touch(state: &mut CacheState, key: &AssetLocation) -> Option<Arc<[u8]>> {
        // Rebase timestamps before overflow while preserving LRU order.
        if state.clock == u64::MAX {
            let order = std::mem::take(&mut state.order);
            for (index, key) in order.into_values().enumerate() { let time = index as u64; state.entries.get_mut(&key).unwrap().used = time; state.order.insert(time, key); }
            state.clock = state.order.len() as u64;
        }
        let entry = state.entries.get_mut(key)?;
        let previous = entry.used; let bytes = entry.bytes.clone(); state.clock += 1; entry.used = state.clock;
        state.order.remove(&previous); state.order.insert(state.clock, key.clone()); Some(bytes)
    }

    fn get(&self, key: &AssetLocation) -> Option<Arc<[u8]>> {
        let mut state = self.state.lock();
        let bytes = Self::touch(&mut state, key);
        if bytes.is_some() { state.stats.hits += 1; } else { state.stats.misses += 1; }
        bytes
    }

    fn intern(&self, key: AssetLocation, bytes: Arc<[u8]>) -> Arc<[u8]> {
        let mut state = self.state.lock();
        if let Some(existing) = Self::touch(&mut state, &key) { return existing; }
        if self.max_entries == 0 || bytes.len() > self.max_bytes { state.stats.bypasses += 1; return bytes; }
        while state.entries.len() >= self.max_entries || state.stats.resident_bytes > self.max_bytes - bytes.len() {
            let Some((_, oldest)) = state.order.pop_first() else { break; };
            if let Some(entry) = state.entries.remove(&oldest) { state.stats.resident_bytes -= entry.bytes.len(); state.stats.evictions += 1; }
        }
        // Touch also handles timestamp rebasing for a cache that has had only insertions.
        if state.clock == u64::MAX {
            let order = std::mem::take(&mut state.order);
            for (index, key) in order.into_values().enumerate() { let time = index as u64; state.entries.get_mut(&key).unwrap().used = time; state.order.insert(time, key); }
            state.clock = state.order.len() as u64;
        }
        state.clock += 1; let used = state.clock;
        state.stats.resident_bytes += bytes.len(); state.entries.insert(key.clone(), CacheEntry { bytes: bytes.clone(), used }); state.order.insert(used, key); state.stats.entries = state.entries.len();
        bytes
    }
}

/// Sources are searched in priority order. Share the cache and source Arcs across map sessions and views.
pub struct AssetMounts { sources: Vec<Arc<dyn AssetByteSource>>, cache: Arc<AssetByteCache> }

impl AssetMounts {
    pub fn new(sources: Vec<Arc<dyn AssetByteSource>>, cache: Arc<AssetByteCache>) -> Self { Self { sources, cache } }
    pub fn cache(&self) -> &Arc<AssetByteCache> { &self.cache }
    pub fn read(&self, member: &str) -> Result<AssetBytes, AssetError> {
        let member = normalize_member(member)?;
        self.read_candidates(&[member])
    }

    /// Texture aliases are resolved within each source before considering a lower-priority archive.
    pub fn read_texture_bytes(&self, member: &str) -> Result<AssetBytes, AssetError> {
        let member = normalize_member(member)?; let mut candidates = vec![member.clone()];
        if let Some((stem, extension)) = member.rsplit_once('.') { if extension == "blp" { candidates.push(format!("{stem}.tga")); } else if extension == "tga" { candidates.push(format!("{stem}.blp")); } }
        self.read_candidates(&candidates)
    }

    fn read_candidates(&self, members: &[String]) -> Result<AssetBytes, AssetError> {
        for source in &self.sources {
            for member in members {
                let location = AssetLocation { source: source.identity(), member: member.clone() };
                if let Some(bytes) = self.cache.get(&location) { return Ok(AssetBytes { location, bytes }); }
                match source.read(member)? {
                    AssetSourceRead::Missing => continue,
                    AssetSourceRead::Deleted => return Err(AssetError::NotFound(member.clone())),
                    AssetSourceRead::Bytes(bytes) => return Ok(AssetBytes { bytes: self.cache.intern(location.clone(), bytes), location }),
                }
            }
        }
        Err(AssetError::NotFound(members.join(" / ")))
    }
}

#[cfg(test)]
#[path = "asset_bytes_tests.rs"]
mod tests;
