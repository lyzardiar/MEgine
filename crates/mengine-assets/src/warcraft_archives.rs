// Author: MiYu. Retain Warcraft MPQ mounts and resolve map overrides without generating project assets.
use crate::{asset_bytes::normalize_member, AssetByteCache, AssetByteSource, AssetError, AssetMounts, AssetSourceId, AssetSourceRead};
use mengine_mpq::{Archive, MemberRead};
use parking_lot::Mutex;
use std::{path::{Path, PathBuf}, sync::Arc};

pub struct MpqAssetSource { identity: AssetSourceId, archive: Mutex<Archive>, path: PathBuf, locale: u32, max_member_bytes: usize }

impl MpqAssetSource {
    pub fn open(path: &Path, locale: u32, max_member_bytes: usize) -> Result<Self, AssetError> {
        let path = path.canonicalize()?;
        if !path.is_file() { return Err(AssetError::Invalid(format!("MPQ source must be a file: {}", path.display()))); }
        let archive = Archive::open(&path).map_err(|e| AssetError::Invalid(format!("{}: {e}", path.display())))?;
        Ok(Self { identity: AssetSourceId::fresh(), archive: Mutex::new(archive), path, locale, max_member_bytes })
    }
    pub fn path(&self) -> &Path { &self.path }
    fn read_member(&self, member: &str, max_bytes: usize) -> Result<AssetSourceRead,AssetError> {
        let member=normalize_member(member)?.replace('/',"\\");
        match self.archive.lock().read(&member,self.locale,self.max_member_bytes.min(max_bytes)).map_err(|e|AssetError::Invalid(format!("{}::{member}: {e}",self.path.display())))? {
            MemberRead::Missing=>Ok(AssetSourceRead::Missing), MemberRead::Deleted=>Ok(AssetSourceRead::Deleted), MemberRead::Bytes(bytes)=>Ok(AssetSourceRead::Bytes(bytes.into())),
        }
    }
}

impl AssetByteSource for MpqAssetSource {
    fn identity(&self) -> AssetSourceId { self.identity }
    fn read(&self, member: &str) -> Result<AssetSourceRead, AssetError> {
        self.read_member(member,self.max_member_bytes)
    }
    fn read_limited(&self, member: &str, max_bytes: usize) -> Result<AssetSourceRead,AssetError> {self.read_member(member,max_bytes)}
}

/// Own the map mount independently of the common archives; both successful and failed sessions release its cache entries.
pub(crate) struct ScopedWarcraftMap {pub members:AssetMounts,pub assets:AssetMounts,pub path:PathBuf,pub source:AssetSourceId,cache:Arc<AssetByteCache>}
impl ScopedWarcraftMap {
    pub(crate) fn new(path:PathBuf,map:Arc<dyn AssetByteSource>,common:Vec<Arc<dyn AssetByteSource>>,cache:Arc<AssetByteCache>)->Self {
        let source=map.identity(); let members=AssetMounts::new(vec![map.clone()],cache.clone()); let mut sources=vec![map]; sources.extend(common); let assets=AssetMounts::new(sources,cache.clone()); Self {members,assets,path,source,cache}
    }
}
impl Drop for ScopedWarcraftMap {fn drop(&mut self) {self.cache.remove_source(self.source);}}

/// Hold one instance while the application runs. Map mounts borrow the same public archives and byte cache.
pub struct WarcraftArchives { common: Vec<Arc<dyn AssetByteSource>>, cache: Arc<AssetByteCache>, locale: u32, max_member_bytes: usize }

impl WarcraftArchives {
    pub fn open(game: &Path, locale: u32, cache: Arc<AssetByteCache>, max_member_bytes: usize) -> Result<Self, AssetError> {
        let mut common: Vec<Arc<dyn AssetByteSource>> = Vec::new();
        for name in ["War3Patch.mpq", "War3xLocal.mpq", "War3x.mpq", "war3.mpq"] { common.push(Arc::new(MpqAssetSource::open(&game.join(name), locale, max_member_bytes)?)); }
        Ok(Self { common, cache, locale, max_member_bytes })
    }

    pub fn common(&self) -> AssetMounts { AssetMounts::new(self.common.clone(), self.cache.clone()) }
    pub fn mount_map(&self, path: &Path) -> Result<AssetMounts, AssetError> {
        let source = Arc::new(MpqAssetSource::open(path, self.locale, self.max_member_bytes)?);
        let mut sources: Vec<Arc<dyn AssetByteSource>> = vec![source]; sources.extend(self.common.iter().cloned());
        Ok(AssetMounts::new(sources, self.cache.clone()))
    }
    pub(crate) fn scoped_map(&self, path: &Path) -> Result<ScopedWarcraftMap,AssetError> {
        let source=Arc::new(MpqAssetSource::open(path,self.locale,self.max_member_bytes)?); let path=source.path().to_owned(); Ok(ScopedWarcraftMap::new(path,source,self.common.clone(),self.cache.clone()))
    }
}
