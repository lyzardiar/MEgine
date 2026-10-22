// Author: MiYu. File change checks without opening ordinary Windows files.
use std::path::Path;
use std::time::SystemTime;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FileChangeStamp {
    pub modified: Option<SystemTime>,
    pub length: u64,
}

/// Query the time and length used to detect file changes, following link targets.
pub fn file_change_stamp(path: &Path) -> std::io::Result<FileChangeStamp> {
    #[cfg(windows)]
    if let Some(stamp) = windows_file_change_stamp(path) { return Ok(stamp); }
    let metadata = std::fs::metadata(path)?;
    Ok(FileChangeStamp { modified: metadata.modified().ok(), length: metadata.len() })
}

/// Query the modification time, following links as `std::fs::metadata` does.
pub fn file_modified_time(path: &Path) -> std::io::Result<SystemTime> {
    #[cfg(windows)]
    if let Some(modified) = windows_file_change_stamp(path).and_then(|stamp| stamp.modified) { return Ok(modified); }
    std::fs::metadata(path)?.modified()
}

#[cfg(windows)]
fn windows_file_change_stamp(path: &Path) -> Option<FileChangeStamp> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{GetFileAttributesExW, GetFileExInfoStandard, WIN32_FILE_ATTRIBUTE_DATA, FILE_ATTRIBUTE_DIRECTORY, FILE_ATTRIBUTE_REPARSE_POINT};
    let mut wide: Vec<u16> = path.as_os_str().encode_wide().collect();
    if wide.contains(&0) { return None; }
    wide.push(0);
    let mut data = std::mem::MaybeUninit::<WIN32_FILE_ATTRIBUTE_DATA>::uninit();
    // SAFETY: the input is NUL-terminated and output has the required size and alignment.
    if unsafe { GetFileAttributesExW(wide.as_ptr(), GetFileExInfoStandard, data.as_mut_ptr().cast()) } == 0 { return None; }
    // SAFETY: a successful GetFileAttributesExW initializes the complete output structure.
    let data = unsafe { data.assume_init() };
    if data.dwFileAttributes & (FILE_ATTRIBUTE_DIRECTORY | FILE_ATTRIBUTE_REPARSE_POINT) != 0 { return None; }
    let ticks = (u64::from(data.ftLastWriteTime.dwHighDateTime) << 32) | u64::from(data.ftLastWriteTime.dwLowDateTime);
    Some(FileChangeStamp { modified: Some(time_from_windows_ticks(ticks)?), length: (u64::from(data.nFileSizeHigh) << 32) | u64::from(data.nFileSizeLow) })
}

#[cfg(windows)]
fn time_from_windows_ticks(ticks: u64) -> Option<SystemTime> {
    use std::time::{Duration, UNIX_EPOCH};
    const UNIX_EPOCH_TICKS: u64 = 116_444_736_000_000_000;
    let delta = ticks.abs_diff(UNIX_EPOCH_TICKS);
    let duration = Duration::new(delta / 10_000_000, ((delta % 10_000_000) * 100) as u32);
    if ticks >= UNIX_EPOCH_TICKS { UNIX_EPOCH.checked_add(duration) } else { UNIX_EPOCH.checked_sub(duration) }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, UNIX_EPOCH};

    #[test]
    fn modification_query_tracks_changes_and_preserves_path_errors() {
        let root = std::env::temp_dir().join(format!("mengine-file-time-{}-{}", std::process::id(), SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("材质 空格.mmat");
        let file = std::fs::File::create(&path).unwrap();
        for time in [UNIX_EPOCH + Duration::from_secs(1_500_000_000), UNIX_EPOCH + Duration::new(1_600_000_000, 123_456_700)] {
            file.set_modified(time).unwrap();
            assert_eq!(file_modified_time(&path).unwrap(), std::fs::metadata(&path).unwrap().modified().unwrap());
            #[cfg(windows)]
            assert_eq!(windows_file_change_stamp(&path).unwrap().modified, Some(file_modified_time(&path).unwrap()), "ordinary files use the attribute query");
        }
        let first = file_change_stamp(&path).unwrap();
        for length in [1, 257, 65_537] {
            file.set_len(length).unwrap(); file.set_modified(first.modified.unwrap()).unwrap();
            let stamp = file_change_stamp(&path).unwrap();
            assert_eq!(stamp, FileChangeStamp { modified: first.modified, length });
            let metadata = std::fs::metadata(&path).unwrap();
            assert_eq!(stamp, FileChangeStamp { modified: metadata.modified().ok(), length: metadata.len() });
            #[cfg(windows)]
            assert_eq!(windows_file_change_stamp(&path), Some(stamp));
        }
        drop(file);
        assert_eq!(file_modified_time(&root).unwrap(), std::fs::metadata(&root).unwrap().modified().unwrap());
        let directory = std::fs::metadata(&root).unwrap();
        assert_eq!(file_change_stamp(&root).unwrap(), FileChangeStamp { modified: directory.modified().ok(), length: directory.len() });
        #[cfg(windows)]
        assert_eq!(windows_file_change_stamp(&root), None, "directory length comes from metadata");
        let invalid = root.join("invalid\0suffix");
        assert_eq!(file_modified_time(&invalid).unwrap_err().kind(), std::fs::metadata(&invalid).unwrap_err().kind());
        assert_eq!(file_change_stamp(&invalid).unwrap_err().kind(), std::fs::metadata(&invalid).unwrap_err().kind());
        std::fs::remove_file(&path).unwrap();
        assert_eq!(file_modified_time(&path).unwrap_err().kind(), std::fs::metadata(&path).unwrap_err().kind());
        assert_eq!(file_change_stamp(&path).unwrap_err().kind(), std::fs::metadata(&path).unwrap_err().kind());
        std::fs::remove_dir(&root).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn windows_time_conversion_retains_epoch_and_subsecond_precision() {
        assert_eq!(time_from_windows_ticks(116_444_736_000_000_000), Some(UNIX_EPOCH));
        assert_eq!(time_from_windows_ticks(116_444_735_999_999_999), UNIX_EPOCH.checked_sub(Duration::from_nanos(100)));
        assert_eq!(time_from_windows_ticks(116_444_736_000_000_001), UNIX_EPOCH.checked_add(Duration::from_nanos(100)));
        assert_eq!(time_from_windows_ticks(0), UNIX_EPOCH.checked_sub(Duration::from_secs(11_644_473_600)));
    }

    #[cfg(windows)]
    #[test]
    fn windows_queries_follow_links_and_support_long_paths() {
        let root = std::env::temp_dir().join(format!("mengine-file-paths-{}-{}", std::process::id(), SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir_all(&root).unwrap();
        let target = root.join("target.mmat");
        let file = std::fs::File::create(&target).unwrap();
        file.set_len(321).unwrap();
        file.set_modified(UNIX_EPOCH + Duration::from_secs(1_400_000_000)).unwrap();
        drop(file);
        let hard = root.join("hard.mmat");
        std::fs::hard_link(&target, &hard).unwrap();
        assert_eq!(file_modified_time(&hard).unwrap(), file_modified_time(&target).unwrap());
        assert_eq!(file_change_stamp(&hard).unwrap(), file_change_stamp(&target).unwrap());
        std::fs::remove_file(hard).unwrap();
        let link = root.join("link.mmat");
        match std::os::windows::fs::symlink_file(&target, &link) {
            Ok(()) => {
                assert_eq!(windows_file_change_stamp(&link), None, "reparse points use metadata to follow their target");
                assert_eq!(file_modified_time(&link).unwrap(), file_modified_time(&target).unwrap());
                assert_eq!(file_change_stamp(&link).unwrap(), file_change_stamp(&target).unwrap());
                std::fs::remove_file(&target).unwrap();
                assert_eq!(file_modified_time(&link).unwrap_err().kind(), std::fs::metadata(&link).unwrap_err().kind());
                std::fs::remove_file(link).unwrap();
            }
            Err(error) if error.raw_os_error() == Some(1314) || error.kind() == std::io::ErrorKind::PermissionDenied => {
                use std::os::windows::process::CommandExt;
                let directory = root.join("target-directory"); std::fs::create_dir(&directory).unwrap();
                let junction = root.join("junction");
                let output = std::process::Command::new("powershell.exe").args(["-NoProfile", "-NonInteractive", "-Command", "$ErrorActionPreference='Stop'; New-Item -ItemType Junction -Path $env:MENGINE_TEST_JUNCTION -Target $env:MENGINE_TEST_TARGET | Out-Null"]).env("MENGINE_TEST_JUNCTION", &junction).env("MENGINE_TEST_TARGET", &directory).creation_flags(0x08000000).output().unwrap();
                assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
                assert_eq!(windows_file_change_stamp(&junction), None);
                assert_eq!(file_modified_time(&junction).unwrap(), std::fs::metadata(&directory).unwrap().modified().unwrap());
                assert_eq!(file_change_stamp(&junction).unwrap(), file_change_stamp(&directory).unwrap());
                std::fs::remove_dir(junction).unwrap(); std::fs::remove_dir(directory).unwrap();
                eprintln!("file symlink privilege unavailable; directory junction fallback verified");
                std::fs::remove_file(&target).unwrap();
            }
            Err(error) => panic!("cannot create test symbolic link: {error}"),
        }
        let mut directory = root.clone();
        while directory.as_os_str().len() < 300 { directory.push("long-path-component-123456789"); std::fs::create_dir(&directory).unwrap(); }
        let path = directory.join("材质.mmat"); std::fs::write(&path, b"{}").unwrap();
        assert_eq!(file_modified_time(&path).unwrap(), std::fs::metadata(&path).unwrap().modified().unwrap());
        assert_eq!(file_change_stamp(&path).unwrap().length, 2);
        let extended = path.canonicalize().unwrap();
        assert_eq!(windows_file_change_stamp(&extended).unwrap().modified, Some(file_modified_time(&extended).unwrap()));
        std::fs::remove_file(path).unwrap();
        while directory != root { std::fs::remove_dir(&directory).unwrap(); directory.pop(); }
        std::fs::remove_dir(root).unwrap();
    }
}
