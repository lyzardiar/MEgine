use glam::Vec4;
use serde::{Deserialize, Serialize};

/// Fixed-timestep simulation clock.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Time {
    pub delta:           f32,
    pub elapsed:         f64,
    pub fixed_delta:     f32,
    pub accumulator:     f32,
    pub frame:           u64,
    pub sim_frame:       u64,
    pub clear_color:     Vec4,
}

impl Default for Time {
    fn default() -> Self {
        Self {
            delta:       0.0,
            elapsed:     0.0,
            fixed_delta: 1.0 / 60.0,
            accumulator: 0.0,
            frame:       0,
            sim_frame:   0,
            clear_color: Vec4::new(0.1, 0.1, 0.14, 1.0),
        }
    }
}

impl Time {
    pub fn tick(&mut self, real_delta: f32) -> u32 {
        let clamped = real_delta.min(0.25);
        self.delta = clamped;
        self.elapsed += clamped as f64;
        self.frame += 1;
        self.accumulator += clamped;
        let mut steps = 0u32;
        while self.accumulator >= self.fixed_delta {
            self.accumulator -= self.fixed_delta;
            self.sim_frame += 1;
            steps += 1;
            if steps > 8 {
                self.accumulator = 0.0;
                break;
            }
        }
        steps
    }

    pub fn alpha(&self) -> f32 {
        (self.accumulator / self.fixed_delta).clamp(0.0, 1.0)
    }
}
