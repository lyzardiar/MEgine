// Author: MiYu. Exercise the real native ABI, encrypted sector readers, locale selection and allocation limits.
use super::*;
use std::{path::PathBuf, sync::atomic::{AtomicU64, Ordering}};

unsafe extern "system" {
    fn SFileCreateArchive(path: *const c_void, flags: u32, count: u32, archive: *mut *mut c_void) -> bool;
    fn SFileCreateFile(archive: *mut c_void, name: *const c_char, time: u64, size: u32, locale: u32, flags: u32, file: *mut *mut c_void) -> bool;
    fn SFileWriteFile(file: *mut c_void, bytes: *const c_void, count: u32, compression: u32) -> bool;
    fn SFileFinishFile(file: *mut c_void) -> bool;
    fn SFileCloseArchive(archive: *mut c_void) -> bool;
    fn SFileGetLocale() -> u32;
    fn SFileSetLocale(locale: u32) -> u32;
}

static NEXT_FIXTURE: AtomicU64 = AtomicU64::new(1);
// Fixtures call native writer APIs and the locale test inspects global state directly.
// Serialize whole tests, including their opens; the explicit threaded case still tests concurrent readers.
static NATIVE_TESTS: std::sync::Mutex<()> = std::sync::Mutex::new(());
fn native_test_guard() -> std::sync::MutexGuard<'static, ()> { NATIVE_TESTS.lock().unwrap_or_else(|p| p.into_inner()) }
struct Fixture { directory: PathBuf, path: PathBuf }
impl Fixture {
    fn new(records: &[(&str, &[u8], u32, u32, u32)]) -> Self {
        let base = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tmp/docs-artifacts/warcraft-archives/fixtures"); std::fs::create_dir_all(&base).unwrap();
        let directory = base.join(format!("{}-{}", std::process::id(), NEXT_FIXTURE.fetch_add(1, Ordering::Relaxed))); std::fs::create_dir(&directory).unwrap();
        let path = directory.join("地图 [fixture].mpq");
        #[cfg(windows)] let encoded = { use std::os::windows::ffi::OsStrExt; path.as_os_str().encode_wide().chain(Some(0)).collect::<Vec<_>>() };
        #[cfg(not(windows))] let encoded = { use std::os::unix::ffi::OsStrExt; CString::new(path.as_os_str().as_bytes()).unwrap() };
        let format = if records.iter().any(|r| r.3 & 0x00100000 != 0) { 0x01000000 } else { 0 };
        let mut archive = std::ptr::null_mut(); assert!(unsafe { SFileCreateArchive(encoded.as_ptr().cast(), format, 32, &mut archive) });
        for (name, bytes, locale, flags, compression) in records {
            let name = CString::new(*name).unwrap(); let mut file = std::ptr::null_mut();
            assert!(unsafe { SFileCreateFile(archive, name.as_ptr(), 0, bytes.len() as u32, *locale, *flags, &mut file) });
            if !bytes.is_empty() { assert!(unsafe { SFileWriteFile(file, bytes.as_ptr().cast(), bytes.len() as u32, *compression) }); }
            assert!(unsafe { SFileFinishFile(file) });
        }
        assert!(unsafe { SFileCloseArchive(archive) }); Self { directory, path }
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let base = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tmp/docs-artifacts/warcraft-archives/fixtures").canonicalize().unwrap(); let directory = self.directory.canonicalize().unwrap();
        assert!(directory.starts_with(&base) && directory != base); std::fs::remove_dir_all(directory).unwrap();
    }
}

#[test]
fn mpq_reads_encrypted_fix_key_sectors_and_pkware_without_extracting_assets() {
    let _serial = native_test_guard();
    let bytes = b"native compressed archive member ".repeat(4096);
    let fixture = Fixture::new(&[("Data\\Mixed.txt", &bytes, 0, 0x30200, 2), ("Scripts\\war3map.j", &bytes, 0, 0x30200, 8)]);
    let before = std::fs::read_dir(&fixture.directory).unwrap().count(); let mut archive = Archive::open(&fixture.path).unwrap();
    for name in ["data\\MIXED.TXT", "scripts\\war3map.j"] { assert_eq!(archive.read(name, 0, bytes.len()).unwrap(), MemberRead::Bytes(bytes.clone())); }
    assert_eq!(archive.read("absent", 0, 1).unwrap(), MemberRead::Missing); assert_eq!(std::fs::read_dir(&fixture.directory).unwrap().count(), before);
}

#[test]
fn mpq_rejects_oversize_then_keeps_archive_usable_and_reads_empty_members() {
    let _serial = native_test_guard();
    let fixture = Fixture::new(&[("large", b"0123456789", 0, 0, 0), ("empty", b"", 0, 0, 0)]); let mut archive = Archive::open(&fixture.path).unwrap();
    assert!(matches!(archive.read("large", 0, 9), Err(MpqError::TooLarge { size: 10, limit: 9 })));
    assert_eq!(archive.read("large", 0, 10).unwrap(), MemberRead::Bytes(b"0123456789".to_vec())); assert_eq!(archive.read("empty", 0, 0).unwrap(), MemberRead::Bytes(vec![]));
    assert!(matches!(archive.read("bad\0name", 0, 10), Err(MpqError::InvalidPath)));
}

#[test]
fn mpq_prefers_requested_locale_and_restores_other_callers_locale() {
    let _serial = native_test_guard();
    let fixture = Fixture::new(&[("name", b"neutral", 0, 0, 0), ("name", b"english", 0x409, 0, 0), ("name", b"chinese", 0x804, 0, 0)]); let mut archive = Archive::open(&fixture.path).unwrap();
    struct RestoreLocale(u32);
    impl Drop for RestoreLocale { fn drop(&mut self) { unsafe { SFileSetLocale(self.0); } } }
    let _restore = RestoreLocale(unsafe { SFileGetLocale() }); unsafe { SFileSetLocale(0x411); }
    for (locale, expected) in [(0x409, "english"), (0x804, "chinese"), (0x407, "neutral"), (0, "neutral")] { assert_eq!(archive.read("name", locale, 100).unwrap(), MemberRead::Bytes(expected.as_bytes().to_vec())); assert_eq!(unsafe { SFileGetLocale() }, 0x411); }
    assert_eq!(archive.read("absent", 0x409, 100).unwrap(), MemberRead::Missing); assert_eq!(unsafe { SFileGetLocale() }, 0x411);
    assert!(matches!(archive.read("name", 0x804, 1), Err(MpqError::TooLarge { .. }))); assert_eq!(unsafe { SFileGetLocale() }, 0x411);
}

#[test]
fn mpq_reads_warcraft_prefixed_archives_and_rejects_bad_headers() {
    let _serial = native_test_guard();
    let fixture = Fixture::new(&[("a", b"value", 0, 0, 0)]); let original = std::fs::read(&fixture.path).unwrap(); let mut prefixed = vec![0; 512]; prefixed[..4].copy_from_slice(b"HM3W"); prefixed.extend_from_slice(&original); std::fs::write(&fixture.path, prefixed).unwrap();
    assert_eq!(Archive::open(&fixture.path).unwrap().read("a", 0, 10).unwrap(), MemberRead::Bytes(b"value".to_vec()));
    let bad = fixture.directory.join("bad.mpq"); std::fs::write(&bad, b"invalid").unwrap(); assert!(Archive::open(&bad).is_err());
}

#[test]
fn mpq_reports_deleted_and_delta_patch_members_without_serving_their_payload() {
    let _serial = native_test_guard();
    // Native creation marks binary patches after recognizing the MPQ patch envelope.
    let mut patch = vec![0; 128]; patch[..4].copy_from_slice(b"PTCH"); patch[16..20].copy_from_slice(b"MD5_"); patch[56..60].copy_from_slice(b"XFRM"); patch[64..68].copy_from_slice(b"BSD0");
    let fixture = Fixture::new(&[("removed", b"", 0, 0x02000000, 0), ("delta", &patch, 0, 0x00100000, 0)]); let mut archive = Archive::open(&fixture.path).unwrap();
    assert_eq!(archive.read("removed", 0, 100).unwrap(), MemberRead::Deleted);
    let delta = archive.read("delta", 0, 100);
    assert!(matches!(delta, Err(MpqError::DeltaRequiresBase)), "{delta:?}");
}

#[test]
fn mpq_parallel_locale_lookups_keep_each_archives_requested_language() {
    let _serial = native_test_guard();
    let fixture = Fixture::new(&[("name", b"neutral", 0, 0, 0), ("name", b"english", 0x409, 0, 0), ("name", b"chinese", 0x804, 0, 0)]);
    let threads = (0..8).map(|index| { let path = fixture.path.clone(); std::thread::spawn(move || { let mut archive = Archive::open(&path).unwrap(); let (locale, expected) = if index % 2 == 0 { (0x409, b"english") } else { (0x804, b"chinese") }; for _ in 0..128 { assert_eq!(archive.read("name", locale, 100).unwrap(), MemberRead::Bytes(expected.to_vec())); } }) }).collect::<Vec<_>>();
    let results = threads.into_iter().map(|thread| thread.join()).collect::<Vec<_>>();
    assert!(results.iter().all(Result::is_ok), "{} locale reader threads failed", results.iter().filter(|r| r.is_err()).count());
}
