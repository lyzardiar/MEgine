// Author: MiYu. Spread source validation deadlines while retaining bounded synchronous jobs.
use super::*;
const MIN_SOURCES: usize = 32;
const MAX_JOBS: usize = 4;
const SOURCE_INTERVAL: Duration = Duration::from_millis(250);
const SOURCE_PHASES: u64 = 4;

pub(super) struct PoseCheck { pub(super) next: Instant, phase: Duration }

fn next_pose_check(epoch: Instant, phase: Duration, now: Instant) -> Instant {
    let first = epoch + phase;
    let Some(elapsed) = now.checked_duration_since(first) else { return first; };
    let delay = SOURCE_INTERVAL - Duration::from_nanos((elapsed.as_nanos() % SOURCE_INTERVAL.as_nanos()) as u64);
    let next = now + delay;
    if next > now { next } else { now + SOURCE_INTERVAL }
}

impl RuntimeMeshCache {
    pub(super) fn validate_polled_sources<'a>(&mut self, objects: impl Iterator<Item = &'a RenderObject>, checks: &mut FrameSourceChecks) {
        #[cfg(test)]
        if self.sequential_source_checks { return; }
        #[cfg(test)]
        if self.grouped_source_checks { self.validate_grouped_sources(objects, checks); return; }
        if self.poses.is_empty() { self.pose_poll_sources.clear(); return; }
        let Some(root) = self.project_root.as_deref() else { return; };
        checks.periodic_sources = true;
        let now = Instant::now(); let forced = self.last_poll.is_none();
        let started = Instant::now(); let mut invalid = Vec::new();
        if self.last_poll.is_none_or(|last| now.duration_since(last) >= SOURCE_INTERVAL) {
            let mut seen = HashSet::new();
            // Keep only request paths, never source owners. Newly requested poses still validate during sync.
            self.pose_poll_sources = objects.filter_map(|object| {
                let key = object.mesh_key.trim(); let key = self.billboard_views.get(key).map_or(key, |(source, _)| source.as_str());
                let (asset, _, _, _) = parse_gltf_pose_sample(key)?;
                if !seen.insert(asset) || !self.poses.contains_key(asset) { return None; }
                let Some(path) = resolve_project_asset_path(root, asset) else { invalid.push(asset.to_owned()); return None; };
                Some((asset.to_owned(), path))
            }).collect();
        }
        let sources = self.pose_poll_sources.iter().filter_map(|(asset, path)| {
            let (_, source) = self.poses.get(asset)?;
            if !forced && self.pose_checks.get(asset).is_some_and(|check| now < check.next) { return None; }
            Some((asset.as_str(), path, source))
        }).collect::<Vec<_>>();
        let results = if self.poses.len() >= MIN_SOURCES && sources.len() >= MAX_JOBS * 2 {
            let jobs = sources.chunks(sources.len().div_ceil(MAX_JOBS)).collect::<Vec<_>>();
            mengine_jobs::JobSystem::new().parallel_map(jobs, |sources| sources.iter().map(|(asset, path, source)| ((*asset).to_owned(), source.validate_at(path))).collect::<Vec<_>>()).into_iter().flatten().collect::<Vec<_>>()
        } else { sources.iter().map(|(asset, path, source)| ((*asset).to_owned(), source.validate_at(path))).collect() };
        self.profile.source_check_ms += started.elapsed().as_secs_f64() * 1000.;self.profile.source_checks += sources.len() as u32;
        let completed = Instant::now();
        for (asset, stamp) in results {
            if let Some(stamp) = stamp {
                self.schedule_pose_check(&asset, completed, !forced);
                checks.prepared.insert(asset.clone()); checks.stamps.insert(asset, stamp);
            } else { invalid.push(asset); }
        }
        // Invalidate every sampled/camera key before serial preparation, including checks between global polls.
        for asset in invalid { self.poses.remove(&asset); self.pose_checks.remove(&asset); forget_pose_attempts(&mut self.attempted, &self.billboard_views, &asset); }
    }

    fn schedule_pose_check(&mut self, asset: &str, now: Instant, phased: bool) {
        let epoch = *self.pose_check_epoch.get_or_insert(now);
        let check = self.pose_checks.entry(asset.to_owned()).or_insert_with(|| {
            let mut hash = std::collections::hash_map::DefaultHasher::new(); asset.hash(&mut hash);
            PoseCheck { next:now + SOURCE_INTERVAL, phase:Duration::from_nanos((hash.finish() % SOURCE_PHASES) * (SOURCE_INTERVAL.as_nanos() as u64 / SOURCE_PHASES)) }
        });
        check.next = if phased { next_pose_check(epoch, check.phase, now) } else { now + SOURCE_INTERVAL };
    }

    pub(super) fn record_loaded_pose_checks(&mut self, checks: &FrameSourceChecks) {
        #[cfg(test)]
        if self.grouped_source_checks { return; }
        let now = Instant::now();
        for asset in checks.stamps.keys() {
            if self.poses.contains_key(asset) && !self.pose_checks.contains_key(asset) {
                let path = self.project_root.as_deref().and_then(|root| resolve_project_asset_path(root, asset));
                self.schedule_pose_check(asset, now, false);
                if let Some(path) = path { if !self.pose_poll_sources.iter().any(|(known, _)| known == asset) { self.pose_poll_sources.push((asset.clone(), path)); } }
            }
        }
    }
}

#[cfg(test)]
#[path = "mesh_source_poll_tests.rs"]
mod tests;
