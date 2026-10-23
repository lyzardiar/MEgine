// Author: MiYu. Resolve dependency identity and metadata through one Windows file handle.
use std::{path::{Path, PathBuf}, time::SystemTime};

pub(super) fn canonical_file_metadata(path: &Path) -> std::io::Result<(PathBuf, std::fs::Metadata, Option<PathBuf>)> {
    #[cfg(windows)]
    if let Ok(info) = windows_file_metadata(path) { return Ok(info); }
    let canonical = path.canonicalize()?;
    let metadata = std::fs::metadata(&canonical)?;
    Ok((canonical, metadata, None))
}

#[cfg(windows)]
fn windows_file_metadata(path: &Path) -> std::io::Result<(PathBuf, std::fs::Metadata, Option<PathBuf>)> {
    let file = open_metadata_file(path)?;
    let canonical = final_path(&file, 0)?;
    let metadata = file.metadata()?;
    let device = final_path(&file, windows_sys::Win32::Storage::FileSystem::VOLUME_NAME_NT).ok().filter(|device| same_volume_relative_path(&canonical, device));
    Ok((canonical, metadata, device))
}

// Both sequential name queries must describe the same volume-relative path, even during rename.
// Mounted directories, SUBST paths and unfamiliar device namespaces retain DOS validation.
#[cfg(windows)]
fn same_volume_relative_path(canonical: &Path, device: &Path) -> bool {
    use std::path::{Component, Prefix};
    let mut canonical = canonical.components(); let mut device = device.components();
    if !matches!(canonical.next(), Some(Component::Prefix(prefix)) if matches!(prefix.kind(), Prefix::VerbatimDisk(_))) || canonical.next() != Some(Component::RootDir) { return false; }
    if device.next() != Some(Component::RootDir) || device.next() != Some(Component::Normal(std::ffi::OsStr::new("Device"))) { return false; }
    let Some(Component::Normal(volume)) = device.next() else { return false; };
    let Some(number) = volume.to_str().and_then(|name| name.strip_prefix("HarddiskVolume")) else { return false; };
    !number.is_empty() && number.bytes().all(|byte| byte.is_ascii_digit()) && canonical.eq(device)
}

pub(super) fn matches_file_metadata(request: &Path, canonical: &Path, device_path: Option<&Path>, bytes: u64, modified: SystemTime) -> bool {
    #[cfg(windows)]
    if let Ok(file) = open_metadata_file(request) {
        let identity = device_path.filter(|_| same_dos_request(request, canonical)).and_then(|expected| final_path(&file, windows_sys::Win32::Storage::FileSystem::VOLUME_NAME_NT).ok().map(|current| current == expected));
        let identity = identity.map(Ok).unwrap_or_else(|| final_path(&file, 0).map(|current| current == canonical));
        if let (Ok(matches), Ok(info)) = (identity, file.metadata()) {
            return matches && info.is_file() && info.len() == bytes && info.modified().is_ok_and(|time| time == modified);
        }
    }
    #[cfg(not(windows))]
    let _ = device_path;
    canonical_file_metadata(request).is_ok_and(|(path, info, _)| path == canonical && info.is_file() && info.len() == bytes && info.modified().is_ok_and(|time| time == modified))
}

// Only unchanged absolute DOS components can reuse the recorded DOS-to-device identity.
// Aliases, UNC names, differing filename case and parent traversal retain normalized DOS validation.
#[cfg(windows)]
fn same_dos_request(request: &Path, canonical: &Path) -> bool {
    use std::path::{Component, Prefix};
    let mut request = request.components(); let mut canonical = canonical.components();
    let (Some(Component::Prefix(a)), Some(Component::Prefix(b))) = (request.next(), canonical.next()) else { return false; };
    matches!((a.kind(), b.kind()), (Prefix::Disk(x) | Prefix::VerbatimDisk(x), Prefix::VerbatimDisk(y)) if x == y) && request.eq(canonical)
}

#[cfg(windows)]
fn open_metadata_file(path: &Path) -> std::io::Result<std::fs::File> {
    use std::os::windows::fs::OpenOptionsExt;
    use windows_sys::Win32::Storage::FileSystem::{FILE_FLAG_BACKUP_SEMANTICS, FILE_READ_ATTRIBUTES, FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE};
    std::fs::OpenOptions::new().access_mode(FILE_READ_ATTRIBUTES).share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE).custom_flags(FILE_FLAG_BACKUP_SEMANTICS).open(path)
}

#[cfg(windows)]
fn final_path(file: &std::fs::File, flags: u32) -> std::io::Result<PathBuf> {
    use std::os::windows::{ffi::OsStringExt, io::AsRawHandle};
    use windows_sys::Win32::Storage::FileSystem::GetFinalPathNameByHandleW;
    let mut short_path = [0u16; 512]; let mut long_path = Vec::new();
    loop {
        let buffer = if long_path.is_empty() { &mut short_path[..] } else { &mut long_path[..] };
        // SAFETY: the file owns a live handle and the output buffer is writable for its supplied length.
        let length = unsafe { GetFinalPathNameByHandleW(file.as_raw_handle(), buffer.as_mut_ptr(), buffer.len() as u32, flags) };
        if length == 0 { return Err(std::io::Error::last_os_error()); }
        if (length as usize) < buffer.len() {
            return Ok(PathBuf::from(std::ffi::OsString::from_wide(&buffer[..length as usize])));
        }
        long_path.resize(length as usize + 1, 0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(windows)]
    #[test]
    fn device_identity_rejects_mixed_names_from_sequential_queries() {
        let canonical = Path::new(r"\\?\C:\Assets\Unit.glb");
        assert!(same_volume_relative_path(canonical, Path::new(r"\Device\HarddiskVolume3\Assets\Unit.glb")));
        for device in [r"\Device\HarddiskVolume3\Renamed\Unit.glb", r"\Device\HarddiskVolume3\assets\Unit.glb", r"\Device\HarddiskVolume3\Unit.glb", r"\Device\HarddiskVolume\Assets\Unit.glb", r"\Device\HarddiskVolume3x\Assets\Unit.glb", r"\Device\Mup\server\Assets\Unit.glb"] { assert!(!same_volume_relative_path(canonical, Path::new(device)), "{device}"); }
        assert!(!same_volume_relative_path(Path::new(r"\\?\C:\mount\Assets\Unit.glb"), Path::new(r"\Device\HarddiskVolume3\Assets\Unit.glb")));
        assert!(!same_volume_relative_path(Path::new(r"\\?\UNC\server\Assets\Unit.glb"), Path::new(r"\Device\HarddiskVolume3\Assets\Unit.glb")));
    }

    #[cfg(windows)]
    #[test]
    fn device_identity_only_accepts_the_same_absolute_dos_spelling() {
        let canonical = Path::new(r"\\?\C:\Assets\Unit.glb");
        for path in [r"C:\Assets\Unit.glb", r"c:\Assets\Unit.glb", "C:/Assets/Unit.glb", r"\\?\C:\Assets\Unit.glb"] { assert!(same_dos_request(Path::new(path), canonical), "{path}"); }
        for path in [r"C:\assets\Unit.glb", r"C:Assets\Unit.glb", r"C:\Assets\folder\..\Unit.glb", r"D:\Assets\Unit.glb", r"\\server\share\Unit.glb"] { assert!(!same_dos_request(Path::new(path), canonical), "{path}"); }
        assert!(!same_dos_request(Path::new(r"\\server\share\Unit.glb"), Path::new(r"\\?\UNC\server\share\Unit.glb")));
    }

    #[cfg(windows)]
    #[test]
    fn metadata_matching_preserves_case_normalization_and_alias_identity() {
        let root = std::env::temp_dir().join(format!("mengine-device-identity-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap(); let path = root.join("Pose-Mixed.bin"); std::fs::write(&path, b"data").unwrap();
        let (canonical, info, device) = canonical_file_metadata(&path).unwrap(); assert!(device.is_some());
        let matches = |request: &Path, identity: Option<&Path>| matches_file_metadata(request, &canonical, identity, info.len(), info.modified().unwrap());
        assert!(matches(&path, device.as_deref())); assert!(matches(&path, None));
        let lower = root.join("pose-mixed.bin"); assert!(!same_dos_request(&lower, &canonical)); assert!(matches(&lower, device.as_deref()));
        let alias = root.join("hard.bin"); std::fs::hard_link(&path, &alias).unwrap(); assert!(!matches(&alias, device.as_deref())); std::fs::remove_file(alias).unwrap();
        let other = root.join("other.bin"); std::fs::copy(&path, &other).unwrap(); std::fs::File::options().write(true).open(&other).unwrap().set_modified(info.modified().unwrap()).unwrap();
        assert!(!matches(&other, device.as_deref())); std::fs::remove_file(other).unwrap();
        std::fs::rename(&path, &lower).unwrap(); assert_ne!(lower.canonicalize().unwrap(), canonical); assert!(!matches(&path, device.as_deref()));
        std::fs::remove_file(lower).unwrap(); assert!(!matches(&path, device.as_deref())); std::fs::remove_dir(root).unwrap();
    }

    #[cfg(windows)]
    #[test]
    #[ignore = "manual Windows metadata stage profile using a preserved map project"]
    fn benchmark_dependency_metadata_steps() {
        use std::time::Instant;
        let root = PathBuf::from(std::env::var_os("MENGINE_METADATA_PROJECT").expect("Set MENGINE_METADATA_PROJECT to a preserved map project"));
        let scene: serde_json::Value = serde_json::from_slice(&std::fs::read(root.join("Assets/Scenes/Main.mscene")).unwrap()).unwrap();
        let paths: std::collections::BTreeSet<_> = scene["world"]["entities"].as_array().unwrap().iter().filter_map(|e| e["components"]["MeshRenderer"]["mesh"].as_str()?.split_once("#pose=").map(|(path, _)| root.join(path))).collect();
        assert!(!paths.is_empty());
        let expected: Vec<_> = paths.iter().map(|path| { let (canonical, info, device) = canonical_file_metadata(path).unwrap(); assert!(same_dos_request(path, &canonical)); (canonical, info.len(), info.modified().unwrap(), device.unwrap()) }).collect();
        let mut samples = vec![Vec::new(); 8];
        for run in 0..11 {
            let mut times = [0.; 8];
            for index in (0..3).map(|i| (i + run) % 3) {
                let total = Instant::now();
                for _ in 0..5 { for (path, expected) in paths.iter().zip(&expected) {
                    if index == 1 { assert!(matches_file_metadata(path, &expected.0, Some(&expected.3), expected.1, expected.2)); continue; }
                    let (canonical, info) = if index == 2 {
                        let start = Instant::now(); let file = open_metadata_file(path).unwrap(); times[3] += start.elapsed().as_secs_f64();
                        let start = Instant::now(); let canonical = final_path(&file, 0).unwrap(); times[4] += start.elapsed().as_secs_f64();
                        let start = Instant::now(); let device = final_path(&file, windows_sys::Win32::Storage::FileSystem::VOLUME_NAME_NT).unwrap(); times[5] += start.elapsed().as_secs_f64();
                        assert_eq!(device, expected.3);
                        let start = Instant::now(); let info = file.metadata().unwrap(); times[6] += start.elapsed().as_secs_f64();
                        let start = Instant::now(); drop(file); times[7] += start.elapsed().as_secs_f64();
                        (canonical, info)
                    } else {
                        // Previous polling path: normalized DOS identity and metadata from one handle.
                        let file = open_metadata_file(path).unwrap(); (final_path(&file, 0).unwrap(), file.metadata().unwrap())
                    };
                    assert_eq!((&canonical, info.len(), info.modified().unwrap()), (&expected.0, expected.1, expected.2));
                    std::hint::black_box((canonical, info));
                }}
                times[index] = total.elapsed().as_secs_f64();
            }
            if run > 1 { for (sample, value) in samples.iter_mut().zip(times) { sample.push(value * 1000. / 5.); } }
        }
        for sample in &mut samples { sample.sort_by(f64::total_cmp); }
        println!("METADATA_STAGES={}", serde_json::json!({"project":root,"files":paths.len(),"samples":9,"iterations_per_sample":5,"baseline_ms":samples[0][4],"device_identity_ms":samples[1][4],"instrumented_with_both_paths_ms":samples[2][4],"open_ms":samples[3][4],"normalized_dos_path_ms":samples[4][4],"normalized_device_path_ms":samples[5][4],"metadata_ms":samples[6][4],"close_ms":samples[7][4]}));
    }

    fn verify(path: &Path) {
        let (canonical, metadata, device) = canonical_file_metadata(path).unwrap();
        let expected = path.canonicalize().unwrap(); let expected_metadata = std::fs::metadata(&expected).unwrap();
        assert_eq!(canonical, expected); assert_eq!(metadata.is_file(), expected_metadata.is_file());
        assert_eq!(metadata.len(), expected_metadata.len()); assert_eq!(metadata.modified().unwrap(), expected_metadata.modified().unwrap());
        assert_eq!(matches_file_metadata(path, &canonical, device.as_deref(), metadata.len(), metadata.modified().unwrap()), metadata.is_file());
        #[cfg(windows)]
        { let (direct, info, _) = windows_file_metadata(path).unwrap(); assert_eq!(direct, canonical); assert_eq!(info.len(), metadata.len()); assert_eq!(info.modified().unwrap(), metadata.modified().unwrap()); }
    }

    #[test]
    fn dependency_info_matches_canonical_metadata_for_paths_changes_and_errors() {
        let root = std::env::temp_dir().join(format!("mengine-dependency-info-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        let path = root.join("姿态 data.bin"); std::fs::write(&path, b"before").unwrap();
        verify(&path); verify(&root.join(".").join("姿态 data.bin")); verify(&root);
        let time = std::fs::metadata(&path).unwrap().modified().unwrap();
        std::fs::write(&path, b"longer after").unwrap();
        std::fs::File::options().write(true).open(&path).unwrap().set_modified(time).unwrap(); verify(&path);
        let link = root.join("hard.bin"); std::fs::hard_link(&path, &link).unwrap(); verify(&link);
        std::fs::remove_file(link).unwrap(); std::fs::remove_file(&path).unwrap();
        assert_eq!(canonical_file_metadata(&path).unwrap_err().kind(), path.canonicalize().unwrap_err().kind());
        let invalid = root.join("invalid\0suffix");
        assert_eq!(canonical_file_metadata(&invalid).unwrap_err().kind(), invalid.canonicalize().unwrap_err().kind());
        let mut directory = root.clone();
        while directory.as_os_str().len() < 600 { directory.push("dependency-path-123456789"); std::fs::create_dir(&directory).unwrap(); }
        let path = directory.join("pose.bin"); std::fs::write(&path, b"long path").unwrap(); verify(&path); verify(&path.canonicalize().unwrap());
        std::fs::remove_file(path).unwrap();
        while directory != root { std::fs::remove_dir(&directory).unwrap(); directory.pop(); }
        std::fs::remove_dir(root).unwrap();
    }
}
