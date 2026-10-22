// Author: MiYu. Resolve dependency identity and metadata through one Windows file handle.
use std::path::{Path, PathBuf};

pub(super) fn canonical_file_metadata(path: &Path) -> std::io::Result<(PathBuf, std::fs::Metadata)> {
    #[cfg(windows)]
    if let Ok(info) = windows_file_metadata(path) { return Ok(info); }
    let canonical = path.canonicalize()?;
    let metadata = std::fs::metadata(&canonical)?;
    Ok((canonical, metadata))
}

#[cfg(windows)]
fn windows_file_metadata(path: &Path) -> std::io::Result<(PathBuf, std::fs::Metadata)> {
    use std::os::windows::{ffi::OsStringExt, fs::OpenOptionsExt, io::AsRawHandle};
    use windows_sys::Win32::Storage::FileSystem::{GetFinalPathNameByHandleW, FILE_FLAG_BACKUP_SEMANTICS, FILE_NAME_NORMALIZED, FILE_READ_ATTRIBUTES, FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE};
    let file = std::fs::OpenOptions::new().access_mode(FILE_READ_ATTRIBUTES).share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE).custom_flags(FILE_FLAG_BACKUP_SEMANTICS).open(path)?;
    let mut short_path = [0u16; 512]; let mut long_path = Vec::new();
    loop {
        let buffer = if long_path.is_empty() { &mut short_path[..] } else { &mut long_path[..] };
        // SAFETY: the file owns a live handle and the output buffer is writable for its supplied length.
        let length = unsafe { GetFinalPathNameByHandleW(file.as_raw_handle(), buffer.as_mut_ptr(), buffer.len() as u32, FILE_NAME_NORMALIZED) };
        if length == 0 { return Err(std::io::Error::last_os_error()); }
        if (length as usize) < buffer.len() {
            let canonical = PathBuf::from(std::ffi::OsString::from_wide(&buffer[..length as usize]));
            return Ok((canonical, file.metadata()?));
        }
        long_path.resize(length as usize + 1, 0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn verify(path: &Path) {
        let (canonical, metadata) = canonical_file_metadata(path).unwrap();
        let expected = path.canonicalize().unwrap(); let expected_metadata = std::fs::metadata(&expected).unwrap();
        assert_eq!(canonical, expected); assert_eq!(metadata.is_file(), expected_metadata.is_file());
        assert_eq!(metadata.len(), expected_metadata.len()); assert_eq!(metadata.modified().unwrap(), expected_metadata.modified().unwrap());
        #[cfg(windows)]
        { let (direct, info) = windows_file_metadata(path).unwrap(); assert_eq!(direct, canonical); assert_eq!(info.len(), metadata.len()); assert_eq!(info.modified().unwrap(), metadata.modified().unwrap()); }
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
