use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Stage {
    Startup,
    PreUpdate,
    Update,
    PostUpdate,
    PreRender,
    Render,
}

impl Stage {
    pub fn order(self) -> u8 {
        match self {
            Stage::Startup => 0,
            Stage::PreUpdate => 1,
            Stage::Update => 2,
            Stage::PostUpdate => 3,
            Stage::PreRender => 4,
            Stage::Render => 5,
        }
    }

    pub fn all() -> [Stage; 6] {
        [
            Stage::Startup,
            Stage::PreUpdate,
            Stage::Update,
            Stage::PostUpdate,
            Stage::PreRender,
            Stage::Render,
        ]
    }
}

#[derive(Clone, Debug)]
pub struct SystemDesc {
    pub name: String,
    pub stage: Stage,
    pub reads: Vec<String>,
    pub writes: Vec<String>,
}

/// A conflict-free wave of systems in the same stage whose `reads`/`writes`
/// sets do not hazard each other and can be executed in parallel on disjoint columns.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SystemBatch {
    pub stage: Stage,
    pub system_names: Vec<String>,
}

/// Returns true if two systems have a Read-Write or Write-Write hazard
/// (or if either system declares no access metadata and must run conservatively).
pub fn systems_conflict(a: &SystemDesc, b: &SystemDesc) -> bool {
    if a.reads.is_empty() && a.writes.is_empty() {
        return true;
    }
    if b.reads.is_empty() && b.writes.is_empty() {
        return true;
    }
    let a_writes: HashSet<&str> = a.writes.iter().map(String::as_str).collect();
    let b_writes: HashSet<&str> = b.writes.iter().map(String::as_str).collect();
    // Write-Write conflict
    if a_writes.iter().any(|w| b_writes.contains(w)) {
        return true;
    }
    // Write-Read / Read-Write conflicts
    if a.reads.iter().any(|r| b_writes.contains(r.as_str())) {
        return true;
    }
    if b.reads.iter().any(|r| a_writes.contains(r.as_str())) {
        return true;
    }
    false
}

type SystemFn = Box<dyn FnMut(&mut crate::world::World) + Send>;

struct RegisteredSystem {
    desc: SystemDesc,
    run: SystemFn,
    once: bool,
    done: bool,
}

#[derive(Default)]
pub struct Schedule {
    systems: Vec<RegisteredSystem>,
}

impl Schedule {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add_system<F>(&mut self, desc: SystemDesc, f: F)
    where
        F: FnMut(&mut crate::world::World) + Send + 'static,
    {
        self.systems.push(RegisteredSystem {
            desc,
            run: Box::new(f),
            once: false,
            done: false,
        });
    }

    pub fn add_startup<F>(&mut self, name: &str, f: F)
    where
        F: FnMut(&mut crate::world::World) + Send + 'static,
    {
        self.systems.push(RegisteredSystem {
            desc: SystemDesc {
                name: name.to_string(),
                stage: Stage::Startup,
                reads: vec![],
                writes: vec![],
            },
            run: Box::new(f),
            once: true,
            done: false,
        });
    }

    /// Groups registered systems in `stage` into deterministic, conflict-free execution waves
    /// based on `reads`/`writes` hazard analysis while preserving causal order.
    pub fn plan_batches(&self, stage: Stage) -> Vec<SystemBatch> {
        let mut batches: Vec<Vec<&SystemDesc>> = Vec::new();
        for sys in self.systems.iter().filter(|s| s.desc.stage == stage) {
            if sys.once && sys.done {
                continue;
            }
            if let Some(last_batch) = batches.last_mut() {
                let conflicts = last_batch.iter().any(|prev| systems_conflict(prev, &sys.desc));
                if !conflicts {
                    last_batch.push(&sys.desc);
                    continue;
                }
            }
            batches.push(vec![&sys.desc]);
        }
        batches
            .into_iter()
            .map(|group| SystemBatch {
                stage,
                system_names: group.into_iter().map(|d| d.name.clone()).collect(),
            })
            .collect()
    }

    pub fn run(&mut self, world: &mut crate::world::World, stage: Stage) {
        for sys in self.systems.iter_mut().filter(|s| s.desc.stage == stage) {
            if sys.once && sys.done {
                continue;
            }
            (sys.run)(world);
            if sys.once {
                sys.done = true;
            }
        }
    }

    pub fn run_frame(&mut self, world: &mut crate::world::World) {
        for stage in Stage::all() {
            self.run(world, stage);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn schedule_batches_disjoint_readers_and_separates_writers() {
        let mut schedule = Schedule::new();
        schedule.add_system(
            SystemDesc {
                name: "cull_meshes".into(),
                stage: Stage::PreRender,
                reads: vec!["Transform".into(), "MeshRenderer".into()],
                writes: vec!["Visibility".into()],
            },
            |_| {},
        );
        schedule.add_system(
            SystemDesc {
                name: "audio_listener".into(),
                stage: Stage::PreRender,
                reads: vec!["Transform".into(), "AudioListener".into()],
                writes: vec!["AudioState".into()],
            },
            |_| {},
        );
        schedule.add_system(
            SystemDesc {
                name: "mutate_transforms".into(),
                stage: Stage::PreRender,
                reads: vec![],
                writes: vec!["Transform".into()],
            },
            |_| {},
        );

        let batches = schedule.plan_batches(Stage::PreRender);
        assert_eq!(batches.len(), 2);
        assert_eq!(batches[0].system_names, vec!["cull_meshes", "audio_listener"]);
        assert_eq!(batches[1].system_names, vec!["mutate_transforms"]);
    }
}
