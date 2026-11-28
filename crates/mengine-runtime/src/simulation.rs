//! Unified headless simulation timing & subsystem coordinator shared across
//! Standalone Player, Editor Play Mode, and future Mobile/Web shells.

use crate::{
    animation::{AnimationLoadFailure, AnimationRuntime, RuntimeAnimationEvent},
    audio::{AudioLoadFailure, AudioRuntime},
    timeline::{
        RuntimeParticleCommand, RuntimeTimelineSignal, TimelineLoadFailure, TimelineRuntime,
    },
};
use mengine_core::{TransformHierarchy, World};
use mengine_physics::{PhysicsStepEvents, PhysicsWorld, PhysicsWorld2D};
use std::path::PathBuf;

pub const DEFAULT_FIXED_DT: f32 = 1.0 / 60.0;
pub const MAX_PHYSICS_SUBSTEPS: u32 = 8;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FixedStepConfig {
    pub fixed_dt: f32,
    pub max_substeps: u32,
}

impl Default for FixedStepConfig {
    fn default() -> Self {
        Self {
            fixed_dt: DEFAULT_FIXED_DT,
            max_substeps: MAX_PHYSICS_SUBSTEPS,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct StepTiming {
    pub substeps: u32,
    pub step_dt: f32,
    pub clamped: bool,
}

/// Computes bounded fixed-step physics subdivisions, preventing spiral-of-death on lag spikes.
pub fn compute_fixed_substeps(dt: f32, config: FixedStepConfig) -> StepTiming {
    if !dt.is_finite() || dt <= 0.0 || !config.fixed_dt.is_finite() || config.fixed_dt <= 0.0 {
        return StepTiming {
            substeps: 0,
            step_dt: 0.0,
            clamped: false,
        };
    }
    let max_substeps = config.max_substeps.max(1);
    let raw = (dt / config.fixed_dt).ceil().max(1.0);
    let clamped = raw > max_substeps as f32;
    let substeps = (raw.min(max_substeps as f32)) as u32;
    let effective_dt = if clamped {
        config.fixed_dt * substeps as f32
    } else {
        dt
    };
    StepTiming {
        substeps,
        step_dt: effective_dt / substeps as f32,
        clamped,
    }
}

pub struct MediaStepResult {
    pub timeline_failures: Vec<TimelineLoadFailure>,
    pub animation_failures: Vec<AnimationLoadFailure>,
    pub audio_failures: Vec<AudioLoadFailure>,
    pub animation_events: Vec<RuntimeAnimationEvent>,
    pub timeline_signals: Vec<RuntimeTimelineSignal>,
    pub particle_commands: Vec<RuntimeParticleCommand>,
}

/// Platform-agnostic simulation subsystem container for consistent execution semantics.
pub struct SimulationSubsystems {
    pub root: Option<PathBuf>,
    pub config: FixedStepConfig,
    pub physics2d: PhysicsWorld2D,
    pub physics3d: PhysicsWorld,
    pub animations: AnimationRuntime,
    pub timelines: TimelineRuntime,
    pub audio: AudioRuntime,
}

impl SimulationSubsystems {
    pub fn new(root: Option<PathBuf>) -> Self {
        Self {
            animations: AnimationRuntime::new(root.clone()),
            timelines: TimelineRuntime::new(root.clone()),
            audio: AudioRuntime::new(root.clone()),
            root,
            config: FixedStepConfig::default(),
            physics2d: PhysicsWorld2D::new(),
            physics3d: PhysicsWorld::new(),
        }
    }

    pub fn reset_for_scene_change(&mut self) {
        self.physics2d.clear();
        self.physics3d.clear();
        self.audio.clear();
        self.animations = AnimationRuntime::new(self.root.clone());
        self.timelines = TimelineRuntime::new(self.root.clone());
    }

    pub fn resolve_transforms(&self, world: &World) -> TransformHierarchy {
        TransformHierarchy::build(world)
    }

    pub fn step_physics_substep(
        &mut self,
        world: &mut World,
        step_dt: f32,
    ) -> (PhysicsStepEvents, PhysicsStepEvents) {
        let two = self.physics2d.step(world, step_dt);
        let three = self.physics3d.step(world, step_dt);
        (two, three)
    }

    pub fn step_media(&mut self, world: &mut World, dt: f32) -> MediaStepResult {
        let timeline_failures = self.timelines.update(world, dt);
        let mut animation_failures = self.animations.update(world, dt);
        animation_failures.extend(
            self.animations
                .apply_timeline_blends(world, &self.timelines.animation_blends()),
        );
        let audio_failures = self.audio.update(world);
        let particle_commands = self.timelines.take_particle_commands();
        let animation_events = self.animations.take_events();
        let timeline_signals = self.timelines.take_signals();
        MediaStepResult {
            timeline_failures,
            animation_failures,
            audio_failures,
            animation_events,
            timeline_signals,
            particle_commands,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fixed_substeps_clamps_lag_spikes_and_rejects_invalid_dt() {
        let cfg = FixedStepConfig::default();
        assert_eq!(compute_fixed_substeps(0.0, cfg).substeps, 0);
        assert_eq!(compute_fixed_substeps(-0.1, cfg).substeps, 0);
        assert_eq!(compute_fixed_substeps(f32::NAN, cfg).substeps, 0);

        let normal = compute_fixed_substeps(1.0 / 60.0, cfg);
        assert_eq!(normal.substeps, 1);
        assert!(!normal.clamped);

        let stall = compute_fixed_substeps(2.5, cfg);
        assert_eq!(stall.substeps, MAX_PHYSICS_SUBSTEPS);
        assert!(stall.clamped);
        assert!((stall.step_dt - DEFAULT_FIXED_DT).abs() < 1e-5);
    }
}
