//! Lightweight frame profiler hooks (lock-free during scope execution).

use parking_lot::Mutex;
use std::cmp::Reverse;
use std::collections::HashMap;
use std::time::Instant;

#[derive(Default)]
pub struct Profiler {
    scopes: HashMap<String, ScopeStats>,
}

#[derive(Default, Clone, Debug, PartialEq, Eq)]
pub struct ScopeStats {
    pub calls: u64,
    pub total_ns: u64,
    pub last_ns: u64,
}

impl Profiler {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn record(&mut self, name: &str, ns: u64) {
        if let Some(entry) = self.scopes.get_mut(name) {
            entry.calls += 1;
            entry.total_ns += ns;
            entry.last_ns = ns;
        } else {
            self.scopes.insert(
                name.to_string(),
                ScopeStats {
                    calls: 1,
                    total_ns: ns,
                    last_ns: ns,
                },
            );
        }
    }

    pub fn scope<R>(&mut self, name: &str, f: impl FnOnce() -> R) -> R {
        let t0 = Instant::now();
        let out = f();
        let ns = t0.elapsed().as_nanos() as u64;
        self.record(name, ns);
        out
    }

    pub fn clear(&mut self) {
        self.scopes.clear();
    }

    pub fn report(&self) -> Vec<(String, ScopeStats)> {
        let mut v: Vec<_> = self
            .scopes
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect();
        v.sort_by_key(|entry| Reverse(entry.1.total_ns));
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

/// Profile `f` WITHOUT holding the global profiler mutex while `f` executes.
/// Safe for both nested `profile_scope` calls and concurrent rayon worker threads.
pub fn profile_scope<R>(name: &str, f: impl FnOnce() -> R) -> R {
    let t0 = Instant::now();
    let out = f();
    let ns = t0.elapsed().as_nanos() as u64;
    let mut g = global();
    if let Some(profiler) = g.as_mut() {
        profiler.record(name, ns);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::JobSystem;

    #[test]
    fn nested_profile_scopes_do_not_deadlock() {
        let result = profile_scope("outer_test_scope", || {
            profile_scope("inner_test_scope", || 42usize)
        });
        assert_eq!(result, 42);
        let report = global().as_ref().map(Profiler::report).unwrap_or_default();
        assert!(report.iter().any(|(k, s)| k == "outer_test_scope" && s.calls >= 1));
        assert!(report.iter().any(|(k, s)| k == "inner_test_scope" && s.calls >= 1));
    }

    #[test]
    fn concurrent_parallel_profile_scopes_record_all_calls() {
        let jobs = JobSystem::new();
        jobs.parallel_for(32, |i| {
            let _ = profile_scope("parallel_test_scope", || i * 2);
        });
        let report = global().as_ref().map(Profiler::report).unwrap_or_default();
        let calls = report
            .iter()
            .find(|(k, _)| k == "parallel_test_scope")
            .map(|(_, s)| s.calls)
            .unwrap_or(0);
        assert!(calls >= 32, "expected >= 32 recorded calls, got {calls}");
    }
}
