//! Parallel job system backed by rayon.

mod profiler;

pub use profiler::{profile_scope, Profiler, ScopeStats};

use parking_lot::Mutex;
use rayon::prelude::*;
use std::sync::Arc;

pub struct JobSystem {
    // reserved for future custom pools
}

impl Default for JobSystem {
    fn default() -> Self {
        Self::new()
    }
}

impl JobSystem {
    pub fn new() -> Self {
        Self {}
    }

    pub fn parallel_for<F>(&self, count: usize, f: F)
    where
        F: Fn(usize) + Sync + Send,
    {
        (0..count).into_par_iter().for_each(f);
    }

    pub fn parallel_map<T, R, F>(&self, items: Vec<T>, f: F) -> Vec<R>
    where
        T: Send,
        R: Send,
        F: Fn(T) -> R + Sync + Send,
    {
        items.into_par_iter().map(f).collect()
    }
}

/// Simple concurrent counter for tests / profiling hooks.
pub fn parallel_sum(n: usize) -> u64 {
    let acc = Arc::new(Mutex::new(0u64));
    let jobs = JobSystem::new();
    jobs.parallel_for(n, |_| {
        let mut g = acc.lock();
        *g += 1;
    });
    let total = *acc.lock();
    total
}
