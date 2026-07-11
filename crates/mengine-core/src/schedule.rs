use serde::{Deserialize, Serialize};

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
            Stage::Startup    => 0,
            Stage::PreUpdate  => 1,
            Stage::Update     => 2,
            Stage::PostUpdate => 3,
            Stage::PreRender  => 4,
            Stage::Render     => 5,
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
    pub name:   String,
    pub stage:  Stage,
    pub reads:  Vec<String>,
    pub writes: Vec<String>,
}

type SystemFn = Box<dyn FnMut(&mut crate::world::World) + Send>;

struct RegisteredSystem {
    desc: SystemDesc,
    run:  SystemFn,
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
            run:  Box::new(f),
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
                name:   name.to_string(),
                stage:  Stage::Startup,
                reads:  vec![],
                writes: vec![],
            },
            run:  Box::new(f),
            once: true,
            done: false,
        });
    }

    pub fn run(&mut self, world: &mut crate::world::World, stage: Stage) {
        // Stable order by registration within stage (parallelism later via reads/writes).
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
            if stage == Stage::Startup {
                self.run(world, stage);
                continue;
            }
            self.run(world, stage);
        }
    }
}
