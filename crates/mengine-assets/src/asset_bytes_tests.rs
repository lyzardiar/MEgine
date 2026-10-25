// Author: MiYu. Verify source precedence, immutable sharing, bounded ownership and concurrent resource requests.
use super::*;
use std::sync::atomic::{AtomicUsize, Ordering};

struct MemorySource { id: AssetSourceId, files: HashMap<String, Vec<u8>>, deleted: Vec<String>, broken: bool, reads: AtomicUsize }
impl MemorySource {
    fn new(files: &[(&str, &[u8])]) -> Arc<Self> { Arc::new(Self { id: AssetSourceId::fresh(), files: files.iter().map(|(k, v)| (k.to_string(), v.to_vec())).collect(), deleted: vec![], broken: false, reads: AtomicUsize::new(0) }) }
}
impl AssetByteSource for MemorySource {
    fn identity(&self) -> AssetSourceId { self.id }
    fn read(&self, member: &str) -> Result<AssetSourceRead, AssetError> {
        self.reads.fetch_add(1, Ordering::Relaxed);
        if self.broken { return Err(AssetError::Invalid("corrupt overriding source".into())); }
        if self.deleted.iter().any(|name| name == member) { return Ok(AssetSourceRead::Deleted); }
        Ok(self.files.get(member).map(|v| AssetSourceRead::Bytes(v.clone().into())).unwrap_or(AssetSourceRead::Missing))
    }
}

#[test]
fn asset_byte_sources_keep_map_overrides_out_of_common_cache() {
    let base = MemorySource::new(&[("units/a.mdx", b"original"), ("icons/a.blp", b"icon")]);
    let first = MemorySource::new(&[("units/a.mdx", b"first")]); let second = MemorySource::new(&[("units/a.mdx", b"second")]);
    let cache = Arc::new(AssetByteCache::default());
    let a = AssetMounts::new(vec![first.clone(), base.clone()], cache.clone()); let b = AssetMounts::new(vec![second.clone(), base.clone()], cache.clone()); let common = AssetMounts::new(vec![base.clone()], cache.clone());
    let ar = a.read("Units\\A.mdx").unwrap(); let br = b.read("units/a.mdx").unwrap();
    assert_eq!(&*ar.bytes, b"first"); assert_eq!(&*br.bytes, b"second"); assert_ne!(ar.location.source, br.location.source);
    assert_eq!(&*common.read("units/a.mdx").unwrap().bytes, b"original");
    let icon = a.read("Icons/A.blp").unwrap(); assert!(Arc::ptr_eq(&icon.bytes, &b.read("icons/a.blp").unwrap().bytes));
    assert_eq!(cache.stats().entries, 4);
    assert_eq!(base.reads.load(Ordering::Relaxed), 2);
}

#[test]
fn asset_byte_sources_reject_unsafe_names_before_reading() {
    let source = MemorySource::new(&[]); let mounts = AssetMounts::new(vec![source.clone()], Arc::new(AssetByteCache::default()));
    for path in ["", "/a", "a/", "../a", "a/../b", "a//b", "a/./b", "C:\\a", "a\0b", "a\nb", "\\\\host\\a"] { assert!(matches!(mounts.read(path), Err(AssetError::Invalid(_))), "{path:?}"); }
    assert_eq!(source.reads.load(Ordering::Relaxed), 0);
}

#[test]
fn asset_byte_sources_do_not_fall_through_deletion_or_errors() {
    let base = MemorySource::new(&[("a", b"original")]);
    for broken in [false, true] {
        let override_source = Arc::new(MemorySource { id: AssetSourceId::fresh(), files: HashMap::new(), deleted: vec!["a".into()], broken, reads: AtomicUsize::new(0) });
        let mounts = AssetMounts::new(vec![override_source, base.clone()], Arc::new(AssetByteCache::default()));
        if broken { assert!(matches!(mounts.read("a"), Err(AssetError::Invalid(_)))); } else { assert!(matches!(mounts.read("a"), Err(AssetError::NotFound(_)))); }
    }
    assert_eq!(base.reads.load(Ordering::Relaxed), 0);
}

#[test]
fn asset_byte_cache_releases_owned_references_and_keeps_live_readers_valid() {
    let source = MemorySource::new(&[("a", b"1234"), ("b", b"5678"), ("c", b"9012")]); let cache = Arc::new(AssetByteCache::new(8, 2)); let mounts = AssetMounts::new(vec![source.clone()], cache.clone());
    let a = mounts.read("a").unwrap(); mounts.read("b").unwrap(); assert!(Arc::ptr_eq(&a.bytes, &mounts.read("a").unwrap().bytes)); mounts.read("c").unwrap();
    assert_eq!((cache.stats().entries, cache.stats().resident_bytes, cache.stats().evictions), (2, 8, 1));
    assert!(Arc::ptr_eq(&a.bytes, &mounts.read("a").unwrap().bytes)); cache.remove_source(source.id); assert_eq!(cache.stats().resident_bytes, 0); assert_eq!(cache.stats().entries, 0); assert_eq!(&*a.bytes, b"1234");
    let again = mounts.read("a").unwrap(); assert!(!Arc::ptr_eq(&a.bytes, &again.bytes)); cache.clear(); assert_eq!(cache.stats().resident_bytes, 0);
}

#[test]
fn asset_byte_cache_bypasses_oversized_and_disabled_entries() {
    for (bytes, entries) in [(3, 10), (10, 0)] {
        let source = MemorySource::new(&[("a", b"1234")]); let cache = Arc::new(AssetByteCache::new(bytes, entries)); let mounts = AssetMounts::new(vec![source.clone()], cache.clone());
        assert_eq!(&*mounts.read("a").unwrap().bytes, b"1234"); mounts.read("a").unwrap(); assert_eq!(cache.stats().entries, 0); assert_eq!(cache.stats().resident_bytes, 0); assert_eq!(cache.stats().bypasses, 2); assert_eq!(source.reads.load(Ordering::Relaxed), 2);
    }
}

#[test]
fn asset_byte_cache_concurrent_cold_reads_converge_to_one_retained_payload() {
    let source = MemorySource::new(&[("a", b"immutable")]); let cache = Arc::new(AssetByteCache::default()); let mounts = Arc::new(AssetMounts::new(vec![source], cache.clone()));
    let barrier = Arc::new(std::sync::Barrier::new(8));
    let threads = (0..8).map(|_| { let mounts = mounts.clone(); let barrier = barrier.clone(); std::thread::spawn(move || { barrier.wait(); mounts.read("a").unwrap() }) }).collect::<Vec<_>>();
    let joined = threads.into_iter().map(|t| t.join()).collect::<Vec<_>>();
    let result = joined.into_iter().map(Result::unwrap).collect::<Vec<_>>();
    assert!(result.iter().all(|r| Arc::ptr_eq(&r.bytes, &result[0].bytes))); assert_eq!(cache.stats().entries, 1); assert_eq!(cache.stats().resident_bytes, 9);
}

#[test]
fn asset_byte_texture_aliases_keep_map_priority_and_resolved_identity() {
    let base = MemorySource::new(&[("cliff.tga", b"base")]); let custom = MemorySource::new(&[("cliff.blp", b"custom")]); let cache = Arc::new(AssetByteCache::default());
    AssetMounts::new(vec![base.clone()], cache.clone()).read("cliff.tga").unwrap();
    let mounted = AssetMounts::new(vec![custom.clone(), base], cache); let tga = mounted.read_texture_bytes("Cliff.TGA").unwrap(); let blp = mounted.read_texture_bytes("cliff.blp").unwrap();
    assert_eq!(&*tga.bytes, b"custom"); assert_eq!(tga.location.member, "cliff.blp"); assert_eq!(tga.location.source, custom.id); assert!(Arc::ptr_eq(&tga.bytes, &blp.bytes));
    let exact = MemorySource::new(&[("cliff.tga", b"exact"), ("cliff.blp", b"alias")]); let mounted = AssetMounts::new(vec![exact], Arc::new(AssetByteCache::default())); assert_eq!(&*mounted.read_texture_bytes("cliff.tga").unwrap().bytes, b"exact");
    assert!(mounted.read_texture_bytes("cliff.mdx").is_err());
}

#[test]
fn asset_byte_texture_alias_errors_and_deletion_block_public_fallback() {
    let base = MemorySource::new(&[("cliff.tga", b"public")]);
    for broken in [false, true] {
        let custom = Arc::new(MemorySource { id: AssetSourceId::fresh(), files: HashMap::new(), deleted: vec!["cliff.blp".into()], broken, reads: AtomicUsize::new(0) });
        let mounted = AssetMounts::new(vec![custom, base.clone()], Arc::new(AssetByteCache::default()));
        if broken { assert!(matches!(mounted.read_texture_bytes("cliff.tga"), Err(AssetError::Invalid(_)))); } else { assert!(matches!(mounted.read_texture_bytes("cliff.tga"), Err(AssetError::NotFound(_)))); }
    }
    assert_eq!(base.reads.load(Ordering::Relaxed), 0);
}

#[test]
fn asset_byte_read_limits_apply_to_cold_and_shared_payloads() {
    let source=MemorySource::new(&[("a",b"1234"),("empty",b"")]); let cache=Arc::new(AssetByteCache::default()); let mounts=AssetMounts::new(vec![source.clone()],cache.clone());
    assert!(mounts.read_limited("a",3).is_err()); assert_eq!(cache.stats().entries,0); assert_eq!(mounts.read_limited("a",4).unwrap().bytes.len(),4); let reads=source.reads.load(Ordering::Relaxed);
    assert!(mounts.read_limited("a",3).is_err()); assert_eq!(source.reads.load(Ordering::Relaxed),reads); assert!(mounts.read_limited("empty",0).unwrap().bytes.is_empty());
}

#[test]
fn asset_byte_read_limits_do_not_fall_through_oversized_overrides() {
    let base=MemorySource::new(&[("a",b"ok")]); let custom=MemorySource::new(&[("a",b"override")]); let mounts=AssetMounts::new(vec![custom,base.clone()],Arc::new(AssetByteCache::default()));
    assert!(mounts.read_limited("a",2).is_err()); assert_eq!(base.reads.load(Ordering::Relaxed),0);
}
