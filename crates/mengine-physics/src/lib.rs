//! Physics subsystem stub — C-ABI ready interface for Phase 4.

use glam::Vec3;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum PhysicsError {
    #[error("not initialized")]
    NotInit,
}

#[derive(Clone, Copy, Debug)]
pub struct RigidBodyDesc {
    pub position: Vec3,
    pub mass: f32,
    pub is_static: bool,
}

pub struct PhysicsWorld {
    ready: bool,
    bodies: Vec<RigidBodyDesc>,
}

impl Default for PhysicsWorld {
    fn default() -> Self {
        Self::new()
    }
}

impl PhysicsWorld {
    pub fn new() -> Self {
        Self {
            ready: false,
            bodies: Vec::new(),
        }
    }

    pub fn init(&mut self) -> Result<(), PhysicsError> {
        log::info!("physics: stub init");
        self.ready = true;
        Ok(())
    }

    pub fn add_body(&mut self, desc: RigidBodyDesc) -> Result<usize, PhysicsError> {
        if !self.ready {
            return Err(PhysicsError::NotInit);
        }
        self.bodies.push(desc);
        Ok(self.bodies.len() - 1)
    }

    pub fn step(&mut self, _dt: f32) {
        // Phase 4: integrate / call external engine
    }
}
