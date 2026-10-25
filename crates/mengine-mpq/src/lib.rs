// Author: MiYu. Own read-only archive handles and return bounded, decompressed members without export files.
use std::{ffi::{c_char, c_void, CString}, path::Path, ptr::NonNull};

unsafe extern "C" {
    fn mengine_mpq_open(path: *const c_void, archive: *mut *mut c_void) -> u32;
    fn mengine_mpq_close(archive: *mut c_void);
    fn mengine_mpq_open_member(archive: *mut c_void, name: *const c_char, locale: u32, member: *mut *mut c_void, size: *mut u64) -> u32;
    fn mengine_mpq_read(member: *mut c_void, buffer: *mut c_void, size: u32, read: *mut u32) -> u32;
    fn mengine_mpq_close_member(member: *mut c_void);
}

#[derive(Debug, thiserror::Error)]
pub enum MpqError {
    #[error("MPQ source: {0}")]
    Io(#[from] std::io::Error),
    #[error("MPQ {operation} failed with code {code}")]
    Native { operation: &'static str, code: u32 },
    #[error("MPQ member is {size} bytes, exceeding the {limit} byte read limit")]
    TooLarge { size: u64, limit: usize },
    #[error("MPQ path contains a zero byte")]
    InvalidPath,
    #[error("cannot reserve {0} bytes for MPQ member")]
    Allocation(usize),
    #[error("binary MPQ delta member requires a base/patch archive chain")]
    DeltaRequiresBase,
}

#[derive(Debug, PartialEq, Eq)]
pub enum MemberRead { Missing, Deleted, Bytes(Vec<u8>) }

pub struct Archive { handle: NonNull<c_void> }

// The sole owner can transfer the handle. All archive access requires &mut self,
// and the C boundary serializes StormLib's process-global locale and initial open.
unsafe impl Send for Archive {}

impl Archive {
    pub fn open(path: &Path) -> Result<Self, MpqError> {
        let path = path.canonicalize()?;
        if !path.is_file() { return Err(std::io::Error::new(std::io::ErrorKind::InvalidInput, "MPQ source must be a local file").into()); }
        #[cfg(windows)]
        let encoded = {
            use std::os::windows::ffi::OsStrExt;
            let mut encoded = path.as_os_str().encode_wide().collect::<Vec<_>>();
            if encoded.contains(&0) { return Err(MpqError::InvalidPath); }
            encoded.push(0); encoded
        };
        #[cfg(not(windows))]
        let encoded = {
            use std::os::unix::ffi::OsStrExt;
            CString::new(path.as_os_str().as_bytes()).map_err(|_| MpqError::InvalidPath)?
        };
        let mut handle = std::ptr::null_mut();
        // encoded is a live, terminated native path. The returned handle is owned until Drop.
        let code = unsafe { mengine_mpq_open(encoded.as_ptr().cast(), &mut handle) };
        if code != 0 { return Err(MpqError::Native { operation: "open archive", code }); }
        Ok(Self { handle: NonNull::new(handle).ok_or(MpqError::Native { operation: "open archive", code: 6 })? })
    }

    pub fn read(&mut self, member: &str, locale: u32, limit: usize) -> Result<MemberRead, MpqError> {
        let name = CString::new(member).map_err(|_| MpqError::InvalidPath)?;
        let mut handle = std::ptr::null_mut(); let mut size = 0;
        // The C boundary closes partial opens. A successful member cannot outlive this mutable borrow.
        let code = unsafe { mengine_mpq_open_member(self.handle.as_ptr(), name.as_ptr(), locale, &mut handle, &mut size) };
        match code {
            2 => return Ok(MemberRead::Missing),
            10005 | 10010 => return Ok(MemberRead::Deleted),
            0x80000001 => return Err(MpqError::DeltaRequiresBase),
            0 => {},
            _ => return Err(MpqError::Native { operation: "open member", code }),
        }
        let file = Member(NonNull::new(handle).ok_or(MpqError::Native { operation: "open member", code: 6 })?);
        if size > limit as u64 { return Err(MpqError::TooLarge { size, limit }); }
        let size = usize::try_from(size).map_err(|_| MpqError::TooLarge { size, limit })?;
        let mut bytes = Vec::new(); bytes.try_reserve_exact(size).map_err(|_| MpqError::Allocation(size))?; bytes.resize(size, 0);
        for part in bytes.chunks_mut(1024 * 1024) {
            let mut read = 0;
            // part owns exactly the writable buffer passed to StormLib; its size fits u32.
            let code = unsafe { mengine_mpq_read(file.0.as_ptr(), part.as_mut_ptr().cast(), part.len() as u32, &mut read) };
            if code != 0 || read as usize != part.len() { return Err(MpqError::Native { operation: "read member", code: if code == 0 { 38 } else { code } }); }
        }
        Ok(MemberRead::Bytes(bytes))
    }
}

impl Drop for Archive { fn drop(&mut self) { unsafe { mengine_mpq_close(self.handle.as_ptr()); } } }
struct Member(NonNull<c_void>);
impl Drop for Member { fn drop(&mut self) { unsafe { mengine_mpq_close_member(self.0.as_ptr()); } } }

#[cfg(test)]
mod tests;
