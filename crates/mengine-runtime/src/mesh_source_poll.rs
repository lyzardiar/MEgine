// Author: MiYu. Bound polling to four independent jobs while retaining per-frame source validation.
use super::*;
const MIN_SOURCES: usize = 32;
const MAX_JOBS: usize = 4;

impl RuntimeMeshCache {
    pub(super) fn validate_polled_sources<'a>(&mut self, objects: impl Iterator<Item = &'a RenderObject>, checks: &mut FrameSourceChecks) {
        #[cfg(test)]
        if self.sequential_source_checks { return; }
        if self.poses.len() < MIN_SOURCES || self.last_poll.is_some_and(|last| last.elapsed() < Duration::from_millis(250)) { return; }
        let Some(root) = self.project_root.as_deref() else { return; };
        let started = Instant::now();let mut seen = HashSet::new();
        let sources = objects.filter_map(|object| {
            let key = object.mesh_key.trim();let key = self.billboard_views.get(key).map_or(key, |(source, _)| source.as_str());
            let (asset, _, _, _) = parse_gltf_pose_sample(key)?;
            if !seen.insert(asset) { return None; }
            let (_, source) = self.poses.get(asset)?;let path = resolve_project_asset_path(root, asset)?;
            Some((asset, path, source))
        }).collect::<Vec<_>>();
        if sources.len() < MIN_SOURCES { return; }
        let jobs = sources.chunks(sources.len().div_ceil(MAX_JOBS)).collect::<Vec<_>>();
        let results = mengine_jobs::JobSystem::new().parallel_map(jobs, |sources| sources.iter().map(|(asset, path, source)| ((*asset).to_owned(), source.validate_at(path))).collect::<Vec<_>>());
        self.profile.source_check_ms += started.elapsed().as_secs_f64() * 1000.;self.profile.source_checks += sources.len() as u32;
        for (asset, stamp) in results.into_iter().flatten() {
            // Failed validation retains the existing serial reload/recovery path.
            if let Some(stamp) = stamp { checks.prepared.insert(asset.clone());checks.stamps.insert(asset, stamp); }
        }
    }
}
