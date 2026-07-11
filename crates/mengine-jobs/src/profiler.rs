//! Lightweight frame profiler hooks (Phase 4).

use parking_lot::Mutex;
use std::collections::HashMap;
use std::time::Instant;

#[derive(Default)]
pub struct Profiler {
    scopes: HashMap<String, ScopeStats>,
}

#[derive(Default, Clone, Debug)]
pub struct ScopeStats {
    pub calls: u64,
    pub total_ns: u64,
    pub last_ns:  u64,
}

impl Profiler {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn scope<R>(&mut self, name: &str, f: impl FnOnce() -> R) -> R {
        let t0 = Instant::now();
        let out = f();
        let ns = t0.elapsed().as_nanos() as u64;
        let entry = self.scopes.entry(name.to_string()).or_default();
        entry.calls += 1;
        entry.total_ns += ns;
        entry.last_ns = ns;
        out
    }

    pub fn report(&self) -> Vec<(String, ScopeStats)> {
        let mut v: Vec<_> = self.scopes.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
        v.sort_by(|a, b| b.1.total_ns.cmp(&a.1.total_ns));
        v
    }
}

static GLOBAL: Mutex<Option<Profiler>> = Mutex::new(None);

pub fn global() -> parking_lot::MutexGuard<'static, Option<Profiler>> {
    let mut g = GLOBAL.lock();
    if g.is_none() {
        *g = Some(Profiler::new());
    }
    g
}

pub fn profile_scope<R>(name: &str, f: impl FnOnce() -> R) -> R {
    let mut g = global();
    g.as_mut().unwrap().scope(name, f)
}
