// Author: MiYu. File events invalidate only the affected asset records; idle polls return a revision.
use super::{collect_project_assets, mark_duplicate_project_asset_guids, project_asset_info, project_asset_kind, ProjectAssetInfo};
use notify::{event::ModifyKind, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use parking_lot::Mutex;
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, OnceLock};

static INDEX: OnceLock<Mutex<Option<AssetIndex>>> = OnceLock::new();

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AssetIndexSnapshot {
    revision: String,
    pub(crate) assets: Option<Vec<ProjectAssetInfo>>,
}

#[derive(Default)]
struct Pending {
    paths: BTreeSet<PathBuf>,
    rescan: bool,
    watcher_failed: bool,
}

struct AssetIndex {
    root: PathBuf,
    pending: Arc<Mutex<Pending>>,
    _watcher: RecommendedWatcher,
    records: BTreeMap<String, ProjectAssetInfo>,
    assets: Vec<ProjectAssetInfo>,
    revision: String,
}

impl AssetIndex {
    fn new(root: &Path) -> Result<Self, String> {
        let pending = Arc::new(Mutex::new(Pending { rescan: true, ..Pending::default() }));
        let events = pending.clone();
        let assets_root = root.join("Assets");
        let mut watcher = notify::recommended_watcher(move |result: notify::Result<Event>| {
            let mut pending = events.lock();
            match result {
                Ok(event) if !matches!(event.kind, EventKind::Access(_)) => {
                    if event.need_rescan() || event.paths.is_empty() {
                        pending.rescan = true;
                    }
                    for path in event.paths {
                        if path.starts_with(&assets_root) && !pending.rescan {
                            if matches!(event.kind, EventKind::Modify(ModifyKind::Any | ModifyKind::Metadata(_) | ModifyKind::Data(_))) && std::fs::symlink_metadata(&path).is_ok_and(|metadata| metadata.is_dir()) { continue; }
                            pending.paths.insert(path);
                        }
                    }
                    // Bound event bursts; an overflow is reconciled by a complete, checked scan.
                    if pending.paths.len() > 4096 { pending.rescan = true; }
                    if pending.rescan { pending.paths.clear(); }
                }
                Err(_) => { pending.watcher_failed = true; pending.rescan = true; pending.paths.clear(); }
                _ => {}
            }
        }).map_err(|error| format!("cannot watch project assets: {error}"))?;
        // Watching the project also observes deletion/recreation of the Assets directory itself.
        watcher.watch(root, RecursiveMode::Recursive).map_err(|error| format!("cannot watch {}: {error}", root.display()))?;
        Ok(Self { root: root.into(), pending, _watcher: watcher, records: BTreeMap::new(), assets: Vec::new(), revision: String::new() })
    }

    fn refresh(&mut self, force: bool) -> Result<(), String> {
        let changes = {
            let mut pending = self.pending.lock();
            let changes = std::mem::take(&mut *pending);
            pending.watcher_failed = changes.watcher_failed;
            changes
        };
        let force = force || changes.watcher_failed;
        if !force && !changes.rescan && changes.paths.is_empty() { return Ok(()); }
        let result = self.reconcile(changes, force);
        if result.is_err() { self.pending.lock().rescan = true; }
        result
    }

    fn reconcile(&mut self, changes: Pending, force: bool) -> Result<(), String> {
        let mut records = if force || changes.rescan { BTreeMap::new() } else { self.records.clone() };
        if force || changes.rescan {
            let mut assets = Vec::new();
            collect_project_assets(&self.root, &self.root.join("Assets"), &mut assets)?;
            records.extend(assets.into_iter().map(|asset| (asset.rel_path.clone(), asset)));
        } else {
            let mut covered = Vec::<PathBuf>::new();
            for changed in changes.paths {
                let path = if changed.extension().is_some_and(|ext| ext == "meta") { changed.with_extension("") } else { changed };
                if covered.iter().any(|parent| path.starts_with(parent)) { continue; }
                covered.push(path.clone());
                let relative = path.strip_prefix(&self.root).map_err(|error| error.to_string())?;
                if relative.components().any(|part| matches!(part, Component::Normal(name) if name.to_string_lossy().starts_with('.'))) { continue; }
                let key = relative.to_string_lossy().replace('\\', "/");
                let prefix = format!("{key}/");
                records.remove(&key);
                let descendants: Vec<_> = records.range(prefix.clone()..).take_while(|(entry, _)| entry.starts_with(&prefix)).map(|(entry, _)| entry.clone()).collect();
                for entry in descendants { records.remove(&entry); }
                // Never follow a replaced directory symlink, including parents of a file event.
                let mut ancestor = self.root.clone();
                let mut missing = false;
                for component in relative.components() {
                    ancestor.push(component);
                    match std::fs::symlink_metadata(&ancestor) {
                        Ok(metadata) if metadata.file_type().is_symlink() => { missing = true; break; }
                        Ok(_) => {}
                        Err(error) if error.kind() == std::io::ErrorKind::NotFound => { missing = true; break; }
                        Err(error) => return Err(error.to_string()),
                    }
                }
                if missing { continue; }
                let metadata = std::fs::symlink_metadata(&path).map_err(|error| error.to_string())?;
                if metadata.is_dir() {
                    let mut assets = Vec::new();
                    collect_project_assets(&self.root, &path, &mut assets)?;
                    records.extend(assets.into_iter().map(|asset| (asset.rel_path.clone(), asset)));
                } else if metadata.is_file() && path.file_name().is_some_and(|name| project_asset_kind(&name.to_string_lossy()).is_some()) {
                    let asset = project_asset_info(&self.root, &path).ok_or_else(|| format!("asset changed while indexing {}", path.display()))?;
                    records.insert(asset.rel_path.clone(), asset);
                }
            }
        }
        let mut assets: Vec<_> = records.values().cloned().collect();
        mark_duplicate_project_asset_guids(&mut assets);
        if self.revision.is_empty() || assets != self.assets {
            self.revision = uuid::Uuid::new_v4().to_string();
            self.assets = assets;
        }
        self.records = records;
        Ok(())
    }

    fn snapshot(&mut self, known_revision: Option<&str>, force: bool) -> Result<AssetIndexSnapshot, String> {
        self.refresh(force)?;
        Ok(AssetIndexSnapshot { revision: self.revision.clone(), assets: (known_revision != Some(self.revision.as_str())).then(|| self.assets.clone()) })
    }
}

pub(crate) fn snapshot(root: &Path, known_revision: Option<&str>, force: bool) -> Result<AssetIndexSnapshot, String> {
    let mut guard = INDEX.get_or_init(|| Mutex::new(None)).lock();
    if guard.as_ref().is_none_or(|index| index.root != root) { *guard = Some(AssetIndex::new(root)?); }
    guard.as_mut().unwrap().snapshot(known_revision, force)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    fn temp_project() -> PathBuf {
        let root = std::env::temp_dir().join(format!("mengine-asset-index-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root.join("Assets")).unwrap();
        root.canonicalize().unwrap()
    }

    fn wait_for(index: &mut AssetIndex, predicate: impl Fn(&[ProjectAssetInfo]) -> bool) {
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            index.refresh(false).unwrap();
            if predicate(&index.assets) { return; }
            assert!(Instant::now() < deadline, "native asset watcher did not publish the disk change");
            std::thread::sleep(Duration::from_millis(20));
        }
    }

    #[test]
    fn asset_index_watches_external_files_metadata_renames_and_directory_recreation() {
        let root = temp_project();
        let mut index = AssetIndex::new(&root).unwrap();
        index.refresh(false).unwrap();
        let initial = index.revision.clone();
        assert!(index.snapshot(Some(&initial), false).unwrap().assets.is_none());
        let a = root.join("Assets/A.mmat");
        std::fs::write(&a, "{}").unwrap();
        wait_for(&mut index, |assets| assets.len() == 1);
        let guid = index.assets[0].guid.clone();
        std::fs::write(&a, "{\"changed\":true}").unwrap();
        wait_for(&mut index, |assets| assets[0].size > 2);
        let b = root.join("Assets/B.mmat");
        std::fs::write(&b, "{}").unwrap();
        std::fs::copy(root.join("Assets/A.mmat.meta"), root.join("Assets/B.mmat.meta")).unwrap();
        wait_for(&mut index, |assets| assets.len() == 2 && assets.iter().all(|asset| asset.meta_status == "duplicate"));
        std::fs::write(root.join("Assets/B.mmat.meta"), "broken").unwrap();
        wait_for(&mut index, |assets| assets[0].meta_status == "ready" && assets[1].meta_status == "invalid");
        assert_eq!(index.assets[0].guid, guid);
        std::fs::create_dir(root.join("Assets/Nested")).unwrap();
        std::fs::rename(&a, root.join("Assets/Nested/A.mmat")).unwrap();
        wait_for(&mut index, |assets| assets.iter().any(|asset| asset.rel_path == "Assets/Nested/A.mmat") && assets.iter().all(|asset| asset.rel_path != "Assets/A.mmat"));
        std::fs::remove_dir_all(root.join("Assets")).unwrap();
        wait_for(&mut index, |assets| assets.is_empty());
        std::fs::create_dir(root.join("Assets")).unwrap();
        std::fs::write(root.join("Assets/Restored.mmat"), "{}").unwrap();
        wait_for(&mut index, |assets| assets.len() == 1 && assets[0].name == "Restored.mmat");
        drop(index);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn asset_index_large_directory_and_idle_poll_benchmark() {
        let root = temp_project();
        for n in 0..10_025 {
            let file = root.join(format!("Assets/Asset{n:05}.mmat"));
            std::fs::write(&file, "{}").unwrap();
            mengine_assets::ensure_asset_sidecar(&file, "material").unwrap();
        }
        let start = Instant::now();
        let mut before = Vec::new();
        collect_project_assets(&root, &root.join("Assets"), &mut before).unwrap();
        let full_scan_ms = start.elapsed().as_secs_f64() * 1000.0;
        assert_eq!(before.len(), 10_025);
        let mut index = AssetIndex::new(&root).unwrap();
        index.refresh(false).unwrap();
        let revision = index.revision.clone();
        let start = Instant::now();
        for _ in 0..1000 { assert!(index.snapshot(Some(&revision), false).unwrap().assets.is_none()); }
        let idle_poll_ms = start.elapsed().as_secs_f64(); // 1000 polls, expressed as milliseconds per poll.
        assert_eq!(index.assets.len(), 10_025);
        eprintln!("asset-index benchmark: assets=10025 full_scan_ms={full_scan_ms:.3} idle_poll_ms={idle_poll_ms:.6}");
        drop(index);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn asset_index_failed_scan_preserves_last_complete_snapshot_and_project_switch_isolated() {
        let root = temp_project();
        std::fs::write(root.join("Assets/A.mmat"), "{}").unwrap();
        let mut index = AssetIndex::new(&root).unwrap();
        index.refresh(false).unwrap();
        let revision = index.revision.clone();
        std::fs::rename(root.join("Assets"), root.join("MovedAssets")).unwrap();
        std::fs::write(root.join("Assets"), "not a directory").unwrap();
        assert!(index.refresh(true).is_err());
        assert_eq!(index.assets.len(), 1);
        assert_eq!(index.revision, revision);
        std::fs::remove_file(root.join("Assets")).unwrap();
        std::fs::rename(root.join("MovedAssets"), root.join("Assets")).unwrap();
        index.refresh(false).unwrap();
        let other = temp_project();
        std::fs::write(other.join("Assets/B.mmat"), "{}").unwrap();
        let first = snapshot(&root, None, false).unwrap();
        let second = snapshot(&other, Some(&first.revision), false).unwrap();
        assert_eq!(second.assets.unwrap()[0].name, "B.mmat");
        let restored = snapshot(&root, Some(&second.revision), false).unwrap();
        assert_eq!(restored.assets.unwrap()[0].name, "A.mmat");
        *INDEX.get().unwrap().lock() = None;
        drop(index);
        std::fs::remove_dir_all(root).unwrap();
        std::fs::remove_dir_all(other).unwrap();
    }
}
