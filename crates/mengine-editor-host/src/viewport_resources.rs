// Author: MiYu. Bounded background resource metadata sampling outside viewport locks.
use super::{collect_resource_references, sample_resource_metadata, EditorViewportProfileNode, EditorViewportResource, ResourceSamplingProfile, ResourceTextureDimensionCache};
use mengine_runtime::frame_compiler::CompiledFrame;
use std::{path::PathBuf, sync::{mpsc::{self, Receiver, SyncSender, TryRecvError, TrySendError}, atomic::{AtomicBool, AtomicU64, Ordering}, Arc, OnceLock}, time::{Duration, Instant}};

static GENERATION: AtomicU64 = AtomicU64::new(0);
pub(super) fn invalidate() { GENERATION.fetch_add(1, Ordering::Relaxed); }
pub(super) fn generation() -> u64 { GENERATION.load(Ordering::Relaxed) }
struct Request { root: PathBuf, resources: Vec<EditorViewportResource>, dimensions: ResourceTextureDimensionCache, truncated: bool, sampled_at: Instant, output: SyncSender<Sample> }
struct Sample { resources: Vec<EditorViewportResource>, dimensions: ResourceTextureDimensionCache, truncated: bool, sampled_at: Instant, metadata_ms: f64 }

#[derive(Clone)]
struct Worker { requests: SyncSender<Request>, alive: Arc<AtomicBool> }
struct WorkerLife(Arc<AtomicBool>);
impl Drop for WorkerLife { fn drop(&mut self) { self.0.store(false, Ordering::Release); } }

fn start_worker(mut load: impl FnMut(&mut Request) + Send + 'static) -> Option<Worker> {
    let (requests, input) = mpsc::sync_channel::<Request>(8);
    let alive = Arc::new(AtomicBool::new(true));
    let lifetime = WorkerLife(alive.clone());
    match std::thread::Builder::new().name("viewport-resource-profiler".into()).spawn(move || {
        let _lifetime = lifetime;
        while let Ok(mut request) = input.recv() {
            let started = Instant::now();
            load(&mut request);
            let sample = Sample { resources: request.resources, dimensions: request.dimensions, truncated: request.truncated, sampled_at: request.sampled_at, metadata_ms: started.elapsed().as_secs_f64() * 1000.0 };
            let _ = request.output.try_send(sample);
        }
    }) {
        Ok(_) => Some(Worker { requests, alive }),
        Err(error) => { log::warn!("Viewport resource sampling unavailable: {error}"); None }
    }
}

pub(super) struct ResourceSampler {
    root: PathBuf,
    requests: Option<Worker>,
    output: SyncSender<Sample>,
    results: Receiver<Sample>,
    latest: Option<Sample>,
    dimensions: ResourceTextureDimensionCache,
    epoch: u64,
    requested_at: Option<Instant>,
    pending: bool,
    waiting_since: Option<Instant>,
    unavailable: bool,
}

impl ResourceSampler {
    pub(super) fn new(root: PathBuf) -> Self {
        static WORKER: OnceLock<Option<Worker>> = OnceLock::new();
        let requests = WORKER.get_or_init(|| start_worker(|request| sample_resource_metadata(&request.root, &mut request.resources, &mut request.dimensions))).clone();
        Self::with_worker(root, requests)
    }

    fn with_worker(root: PathBuf, requests: Option<Worker>) -> Self {
        let (output, results) = mpsc::sync_channel(1);
        let unavailable = requests.is_none();
        Self { root, requests, output, results, latest: None, dimensions: Default::default(), epoch: 0, requested_at: None, pending: false, waiting_since: None, unavailable }
    }

    /// One outstanding request per viewport; a process-wide worker caps threads across project switches.
    pub(super) fn sample(&mut self, frame: &CompiledFrame, stages: &mut Vec<EditorViewportProfileNode>, epoch: u64) -> (Vec<EditorViewportResource>, bool, f64, ResourceSamplingProfile) {
        // Late requests cannot relabel old world data or roll a sampler back to an expired session.
        if epoch < self.epoch || epoch < generation() { return (Vec::new(), false, 0.0, ResourceSamplingProfile::default()); }
        if self.epoch != epoch {
            (self.output, self.results) = mpsc::sync_channel(1);
            self.latest = None; self.dimensions.clear(); self.pending = false; self.waiting_since = None; self.requested_at = None; self.epoch = epoch;
        }
        if self.requests.as_ref().is_some_and(|worker| !worker.alive.load(Ordering::Acquire)) { self.pending = false; self.unavailable = true; }
        if self.pending {
            match self.results.try_recv() {
                Ok(mut sample) => { self.dimensions = std::mem::take(&mut sample.dimensions); self.latest = Some(sample); self.pending = false; self.waiting_since = None; }
                Err(TryRecvError::Empty) => {}
                Err(TryRecvError::Disconnected) => { self.pending = false; self.unavailable = true; }
            }
        }
        if !self.pending && !self.unavailable && self.requested_at.is_none_or(|at| at.elapsed() >= Duration::from_millis(250)) {
            let sampled_at = Instant::now();
            let (resources, truncated) = collect_resource_references(frame, stages);
            self.requested_at = Some(sampled_at);
            self.waiting_since.get_or_insert(sampled_at);
            let request = Request { root: self.root.clone(), resources, dimensions: std::mem::take(&mut self.dimensions), truncated, sampled_at, output: self.output.clone() };
            match self.requests.as_ref().unwrap().requests.try_send(request) {
                Ok(()) => self.pending = true,
                Err(error) => { match error { TrySendError::Full(request) => self.dimensions = request.dimensions, TrySendError::Disconnected(request) => { self.dimensions = request.dimensions; self.unavailable = true; } } }
            }
        }
        let profile = ResourceSamplingProfile { ready: self.latest.is_some(), pending: !self.unavailable && self.waiting_since.is_some(), delayed: !self.unavailable && self.waiting_since.is_some_and(|at| at.elapsed() > Duration::from_secs(2)), unavailable: self.unavailable, metadata_ms: self.latest.as_ref().map(|sample| sample.metadata_ms) };
        self.latest.as_ref().map_or((Vec::new(), false, 0.0, profile.clone()), |sample| (sample.resources.clone(), sample.truncated, sample.sampled_at.elapsed().as_secs_f64() * 1000.0, profile))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn frame() -> CompiledFrame { super::super::tests::resource_frame(vec![], vec![]) }
    fn accept(sampler: &mut ResourceSampler) { let mut sample = sampler.results.recv_timeout(Duration::from_secs(2)).unwrap(); sampler.dimensions = std::mem::take(&mut sample.dimensions); sampler.latest = Some(sample); sampler.pending = false; sampler.waiting_since = None; }

    #[test]
    fn slow_metadata_never_blocks_render_sampling_or_queues_more_work() {
        let (entered_tx, entered) = mpsc::channel(); let (release, blocked) = mpsc::channel();
        let worker = start_worker(move |_| { entered_tx.send(()).unwrap(); blocked.recv_timeout(Duration::from_secs(2)).unwrap(); });
        let mut sampler = ResourceSampler::with_worker(PathBuf::new(), worker);
        let initial = sampler.sample(&frame(), &mut Vec::new(), 0); assert!(!initial.3.ready); assert!(initial.3.pending);
        entered.recv_timeout(Duration::from_secs(2)).unwrap(); sampler.requested_at = Some(Instant::now() - Duration::from_secs(3)); sampler.waiting_since = sampler.requested_at;
        let started = Instant::now();
        for _ in 0..100 { let p = sampler.sample(&frame(), &mut Vec::new(), 0).3; assert!(p.pending); assert!(p.delayed); }
        assert!(started.elapsed() < Duration::from_millis(250)); assert!(entered.try_recv().is_err());
        release.send(()).unwrap(); accept(&mut sampler);
        let refreshed = sampler.sample(&frame(), &mut Vec::new(), 0); assert!(refreshed.3.ready); assert!(refreshed.3.pending);
        entered.recv_timeout(Duration::from_secs(2)).unwrap(); release.send(()).unwrap(); accept(&mut sampler);
    }

    #[test]
    fn project_generation_discards_completed_and_inflight_resource_samples() {
        let (entered_tx, entered) = mpsc::channel(); let (release, blocked) = mpsc::channel();
        let worker = start_worker(move |_| { entered_tx.send(()).unwrap(); blocked.recv_timeout(Duration::from_secs(2)).unwrap(); });
        let mut sampler = ResourceSampler::with_worker(PathBuf::new(), worker);
        sampler.sample(&frame(), &mut Vec::new(), 0); entered.recv_timeout(Duration::from_secs(2)).unwrap();
        release.send(()).unwrap(); accept(&mut sampler); assert!(sampler.latest.is_some());
        let reset = sampler.sample(&frame(), &mut Vec::new(), 1); assert!(!reset.3.ready); assert!(reset.3.pending);
        entered.recv_timeout(Duration::from_secs(2)).unwrap();
        let reset_again = sampler.sample(&frame(), &mut Vec::new(), 2); assert!(!reset_again.3.ready);
        release.send(()).unwrap(); entered.recv_timeout(Duration::from_secs(2)).unwrap(); assert!(sampler.results.try_recv().is_err());
        release.send(()).unwrap(); accept(&mut sampler); assert!(sampler.latest.is_some());
    }

    #[test]
    fn late_same_root_render_cannot_reset_new_session_sample() {
        let (requests, input) = mpsc::sync_channel(8);
        let worker = Worker { requests, alive: Arc::new(AtomicBool::new(true)) };
        let mut sampler = ResourceSampler::with_worker(PathBuf::from("same-project"), Some(worker));
        sampler.sample(&frame(), &mut Vec::new(), 1);
        let old = input.try_recv().unwrap();
        sampler.sample(&frame(), &mut Vec::new(), 2);
        let new = input.try_recv().unwrap();
        let stale = sampler.sample(&frame(), &mut Vec::new(), 1);
        assert!(!stale.3.ready); assert_eq!(sampler.epoch, 2); assert!(sampler.pending); assert!(input.try_recv().is_err());
        let result = |request: Request| Sample { resources: request.resources, dimensions: request.dimensions, truncated: request.truncated, sampled_at: request.sampled_at, metadata_ms: 1.0 };
        assert!(old.output.clone().try_send(result(old)).is_err());
        new.output.clone().try_send(result(new)).unwrap();
        assert!(sampler.sample(&frame(), &mut Vec::new(), 2).3.ready);
    }

    #[test]
    fn full_queue_reports_delay_and_recovers_without_resetting_wait_age() {
        let (requests, input) = mpsc::sync_channel(1);
        let worker = Worker { requests, alive: Arc::new(AtomicBool::new(true)) };
        let mut occupied = ResourceSampler::with_worker(PathBuf::new(), Some(worker.clone()));
        occupied.sample(&frame(), &mut Vec::new(), 0);
        let mut sampler = ResourceSampler::with_worker(PathBuf::new(), Some(worker));
        assert!(sampler.sample(&frame(), &mut Vec::new(), 0).3.pending); assert!(!sampler.pending);
        let waiting = Instant::now() - Duration::from_secs(3); sampler.waiting_since = Some(waiting);
        sampler.requested_at = Some(waiting);
        let delayed = sampler.sample(&frame(), &mut Vec::new(), 0).3;
        assert!(delayed.pending); assert!(delayed.delayed); assert_eq!(sampler.waiting_since, Some(waiting));
        input.try_recv().unwrap(); sampler.requested_at = Some(waiting);
        assert!(sampler.sample(&frame(), &mut Vec::new(), 0).3.delayed); assert!(sampler.pending);
        let request = input.try_recv().unwrap();
        request.output.try_send(Sample { resources: request.resources, dimensions: request.dimensions, truncated: request.truncated, sampled_at: request.sampled_at, metadata_ms: 1.0 }).unwrap();
        let ready = sampler.sample(&frame(), &mut Vec::new(), 0).3;
        assert!(ready.ready); assert!(!ready.pending); assert!(!ready.delayed);
    }

    #[test]
    fn missing_worker_is_reported_without_blocking_rendering() {
        let mut sampler = ResourceSampler::with_worker(PathBuf::new(), None);
        let (_, _, _, profile) = sampler.sample(&frame(), &mut Vec::new(), 0);
        assert!(profile.unavailable); assert!(!profile.pending); assert!(!profile.ready);
    }
}
