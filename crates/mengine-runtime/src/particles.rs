use glam::{Vec3, Vec4};
use mengine_core::generated::{ParticleEmitter2D, ParticleEmitter3D, Transform};
use mengine_core::{Entity, World};
use mengine_rhi::{FrameCamera, UiBatchKey, UiBlendMode, UiPrimitive};
use std::collections::{HashMap, HashSet};

const MAX_PARTICLES: usize = 100_000;
const MAX_STEP: f32 = 1.0 / 30.0;

#[derive(Clone, Debug)]
struct Particle {
    position: Vec3,
    velocity: Vec3,
    age: f32,
    lifetime: f32,
    size_start: f32,
    size_end: f32,
    color_start: Vec4,
    color_end: Vec4,
}

#[derive(Default)]
struct EmitterState {
    particles: Vec<Particle>,
    elapsed: f32,
    remainder: f32,
    random: u32,
    configured_seed: i32,
}

impl EmitterState {
    fn reset(&mut self, seed: i32) {
        self.particles.clear();
        self.elapsed = 0.0;
        self.remainder = 0.0;
        self.random = if seed == 0 { 1 } else { seed as u32 };
        self.configured_seed = if seed == 0 { 1 } else { seed };
    }

    fn random(&mut self) -> f32 {
        let mut x = self.random;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.random = if x == 0 { 0x6d2b_79f5 } else { x };
        self.random as f32 / (u32::MAX as f32 + 1.0)
    }

    fn range(&mut self, min: f32, max: f32) -> f32 {
        min + (max - min) * self.random()
    }
}

enum Emitter<'a> {
    Two(&'a ParticleEmitter2D),
    Three(&'a ParticleEmitter3D),
}

impl Emitter<'_> {
    fn seed(&self) -> i32 {
        match self {
            Self::Two(value) => value.seed,
            Self::Three(value) => value.seed,
        }
    }

    fn playing(&self) -> bool {
        match self {
            Self::Two(value) => value.playing,
            Self::Three(value) => value.playing,
        }
    }

    fn looping(&self) -> bool {
        match self {
            Self::Two(value) => value.looping,
            Self::Three(value) => value.looping,
        }
    }

    fn duration(&self) -> f32 {
        match self {
            Self::Two(value) => value.duration,
            Self::Three(value) => value.duration,
        }
    }

    fn start_delay(&self) -> f32 {
        match self {
            Self::Two(value) => value.start_delay,
            Self::Three(value) => value.start_delay,
        }
    }

    fn rate(&self) -> f32 {
        match self {
            Self::Two(value) => value.rate_over_time,
            Self::Three(value) => value.rate_over_time,
        }
    }

    fn max_particles(&self) -> usize {
        let value = match self {
            Self::Two(value) => value.max_particles,
            Self::Three(value) => value.max_particles,
        };
        (value.max(0) as usize).min(MAX_PARTICLES)
    }

    fn simulation_space(&self) -> &str {
        match self {
            Self::Two(value) => &value.simulation_space,
            Self::Three(value) => &value.simulation_space,
        }
    }

    fn blend(&self) -> UiBlendMode {
        let mode = match self {
            Self::Two(value) => &value.blend_mode,
            Self::Three(value) => &value.blend_mode,
        };
        if mode.eq_ignore_ascii_case("additive") {
            UiBlendMode::Additive
        } else {
            UiBlendMode::Alpha
        }
    }

    fn texture(&self) -> &str {
        let texture = match self {
            Self::Two(value) => &value.texture,
            Self::Three(value) => &value.texture,
        };
        if texture.is_empty() {
            "white"
        } else {
            texture
        }
    }

    fn sorting_order(&self) -> i32 {
        match self {
            Self::Two(value) => value.sorting_order,
            Self::Three(_) => 0,
        }
    }

    fn gravity(&self) -> Vec3 {
        match self {
            Self::Two(value) => Vec3::new(value.gravity[0], value.gravity[1], 0.0),
            Self::Three(value) => Vec3::from_array(value.gravity),
        }
    }

    fn lifetime(&self) -> (f32, f32) {
        let (min, max) = match self {
            Self::Two(value) => (value.lifetime_min, value.lifetime_max),
            Self::Three(value) => (value.lifetime_min, value.lifetime_max),
        };
        let min = min.max(0.01);
        (min, max.max(min))
    }

    fn speed(&self) -> (f32, f32) {
        let (min, max) = match self {
            Self::Two(value) => (value.speed_min, value.speed_max),
            Self::Three(value) => (value.speed_min, value.speed_max),
        };
        let min = min.max(0.0);
        (min, max.max(min))
    }

    fn size(&self) -> (f32, f32) {
        match self {
            Self::Two(value) => (value.size_start.max(0.0), value.size_end.max(0.0)),
            Self::Three(value) => (value.size_start.max(0.0), value.size_end.max(0.0)),
        }
    }

    fn colors(&self) -> (Vec4, Vec4) {
        match self {
            Self::Two(value) => (
                Vec4::from_array(value.color_start),
                Vec4::from_array(value.color_end),
            ),
            Self::Three(value) => (
                Vec4::from_array(value.color_start),
                Vec4::from_array(value.color_end),
            ),
        }
    }
}

#[derive(Default)]
pub struct ParticleWorld {
    emitters: HashMap<Entity, EmitterState>,
}

impl ParticleWorld {
    pub fn update_and_collect(
        &mut self,
        world: &World,
        camera: FrameCamera,
        viewport: [u32; 2],
        delta_seconds: f32,
    ) -> Vec<UiPrimitive> {
        let mut live = HashSet::new();
        let mut output: Vec<(String, UiPrimitive)> = Vec::new();
        for entity in world.iter_entities() {
            let Some(transform) = world.get_component::<Transform>(entity) else {
                continue;
            };
            let emitter = if let Some(component) = world.get_component::<ParticleEmitter2D>(entity)
            {
                Emitter::Two(component)
            } else if let Some(component) = world.get_component::<ParticleEmitter3D>(entity) {
                Emitter::Three(component)
            } else {
                continue;
            };
            live.insert(entity);
            let state = self.emitters.entry(entity).or_default();
            step_emitter(
                state,
                &emitter,
                Vec3::from_array(transform.position),
                delta_seconds,
            );
            collect_emitter(
                state,
                &emitter,
                Vec3::from_array(transform.position),
                camera,
                viewport,
                &mut output,
            );
        }
        self.emitters.retain(|entity, _| live.contains(entity));
        output.sort_by(|left, right| left.0.cmp(&right.0));
        output.into_iter().map(|(_, primitive)| primitive).collect()
    }
}

fn step_emitter(state: &mut EmitterState, emitter: &Emitter<'_>, origin: Vec3, delta: f32) {
    let seed = if emitter.seed() == 0 {
        1
    } else {
        emitter.seed()
    };
    if state.configured_seed != seed {
        state.reset(seed);
    }
    if !emitter.playing() {
        return;
    }
    let mut remaining = delta.clamp(0.0, 0.25);
    while remaining > 0.0 {
        let dt = remaining.min(MAX_STEP);
        step_subframe(state, emitter, origin, dt);
        remaining -= dt;
    }
}

fn step_subframe(state: &mut EmitterState, emitter: &Emitter<'_>, origin: Vec3, dt: f32) {
    let gravity = emitter.gravity();
    for particle in &mut state.particles {
        particle.age += dt;
        particle.velocity += gravity * dt;
        particle.position += particle.velocity * dt;
    }
    state
        .particles
        .retain(|particle| particle.age < particle.lifetime);
    state.elapsed += dt;
    let active_time = state.elapsed - emitter.start_delay().max(0.0);
    if active_time < 0.0 || (!emitter.looping() && active_time > emitter.duration().max(0.01)) {
        return;
    }
    state.remainder += emitter.rate().max(0.0) * dt;
    // Small epsilon prevents f32 substep accumulation from losing a whole
    // emission when mathematically landing on an integer boundary.
    let requested = (state.remainder + 1.0e-5).floor() as usize;
    state.remainder = (state.remainder - requested as f32).max(0.0);
    let available = emitter
        .max_particles()
        .saturating_sub(state.particles.len());
    for _ in 0..requested.min(available) {
        let mut particle = spawn_particle(state, emitter);
        if !emitter.simulation_space().eq_ignore_ascii_case("local") {
            particle.position += origin;
        }
        state.particles.push(particle);
    }
}

fn spawn_particle(state: &mut EmitterState, emitter: &Emitter<'_>) -> Particle {
    let (position, direction) = match emitter {
        Emitter::Two(value) => {
            let position = if value.shape.eq_ignore_ascii_case("circle") {
                let angle = state.random() * std::f32::consts::TAU;
                let distance = state.random().sqrt() * value.shape_radius.max(0.0);
                Vec3::new(angle.cos() * distance, angle.sin() * distance, 0.0)
            } else if value.shape.eq_ignore_ascii_case("box") {
                Vec3::new(
                    (state.random() - 0.5) * value.shape_size[0],
                    (state.random() - 0.5) * value.shape_size[1],
                    0.0,
                )
            } else {
                Vec3::ZERO
            };
            let base = value.direction[1].atan2(value.direction[0]);
            let spread = value.spread_degrees.to_radians();
            let angle = base + (state.random() - 0.5) * spread;
            (position, Vec3::new(angle.cos(), angle.sin(), 0.0))
        }
        Emitter::Three(value) => {
            let position = if value.shape.eq_ignore_ascii_case("sphere") {
                random_unit(state) * state.random().cbrt() * value.shape_radius.max(0.0)
            } else if value.shape.eq_ignore_ascii_case("box") {
                Vec3::new(
                    (state.random() - 0.5) * value.shape_size[0],
                    (state.random() - 0.5) * value.shape_size[1],
                    (state.random() - 0.5) * value.shape_size[2],
                )
            } else if value.shape.eq_ignore_ascii_case("cone") {
                let angle = state.random() * std::f32::consts::TAU;
                let distance = state.random().sqrt() * value.shape_radius.max(0.0);
                Vec3::new(angle.cos() * distance, 0.0, angle.sin() * distance)
            } else {
                Vec3::ZERO
            };
            let base = Vec3::from_array(value.direction).normalize_or_zero();
            let base = if base == Vec3::ZERO { Vec3::Y } else { base };
            let spread = value.spread_degrees.max(0.0).to_radians().tan();
            (
                position,
                (base + random_unit(state) * spread).normalize_or_zero(),
            )
        }
    };
    let (speed_min, speed_max) = emitter.speed();
    let (life_min, life_max) = emitter.lifetime();
    let (size_start, size_end) = emitter.size();
    let (color_start, color_end) = emitter.colors();
    Particle {
        position,
        velocity: direction * state.range(speed_min, speed_max),
        age: 0.0,
        lifetime: state.range(life_min, life_max),
        size_start,
        size_end,
        color_start,
        color_end,
    }
}

fn random_unit(state: &mut EmitterState) -> Vec3 {
    let z = state.random() * 2.0 - 1.0;
    let angle = state.random() * std::f32::consts::TAU;
    let radius = (1.0 - z * z).max(0.0).sqrt();
    Vec3::new(radius * angle.cos(), z, radius * angle.sin())
}

fn project(position: Vec3, camera: FrameCamera, viewport: [u32; 2]) -> Option<[f32; 3]> {
    let clip = camera.proj * camera.view * position.extend(1.0);
    if clip.w <= 0.0001 {
        return None;
    }
    let ndc = clip.truncate() / clip.w;
    if ndc.z < -1.0 || ndc.z > 1.0 {
        return None;
    }
    Some([
        (ndc.x * 0.5 + 0.5) * viewport[0].max(1) as f32,
        (0.5 - ndc.y * 0.5) * viewport[1].max(1) as f32,
        ndc.z,
    ])
}

fn collect_emitter(
    state: &EmitterState,
    emitter: &Emitter<'_>,
    origin: Vec3,
    camera: FrameCamera,
    viewport: [u32; 2],
    output: &mut Vec<(String, UiPrimitive)>,
) {
    let local = emitter.simulation_space().eq_ignore_ascii_case("local");
    let blend = emitter.blend();
    let texture = emitter.texture().to_owned();
    let material = match emitter {
        Emitter::Two(_) => "particle/2d",
        Emitter::Three(_) => "particle/3d",
    };
    let order_key = (emitter.sorting_order() as i64 - i32::MIN as i64) as u32;
    let sort_key = format!("{order_key:010}|{:?}|{}|{}", blend, material, texture);
    for particle in &state.particles {
        let position = if local {
            particle.position + origin
        } else {
            particle.position
        };
        let Some(screen) = project(position, camera, viewport) else {
            continue;
        };
        let progress = (particle.age / particle.lifetime).clamp(0.0, 1.0);
        let size = particle.size_start + (particle.size_end - particle.size_start) * progress;
        let Some(size_point) = project(position + Vec3::X * size, camera, viewport) else {
            continue;
        };
        let radius = (size_point[0] - screen[0])
            .hypot(size_point[1] - screen[1])
            .clamp(0.75, 256.0);
        let color = particle
            .color_start
            .lerp(particle.color_end, progress)
            .to_array();
        if color[3] <= 0.0 || radius <= 0.0 {
            continue;
        }
        output.push((
            sort_key.clone(),
            UiPrimitive {
                rect: [
                    screen[0] - radius,
                    screen[1] - radius,
                    radius * 2.0,
                    radius * 2.0,
                ],
                color,
                pivot: [0.5, 0.5],
                rotation_radians: 0.0,
                uv: [0.0, 0.0, 1.0, 1.0],
                key: UiBatchKey {
                    material: material.into(),
                    texture: texture.clone(),
                    clip: None,
                    blend,
                },
            },
        ));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn emission_is_frame_rate_independent() {
        let emitter = ParticleEmitter2D {
            rate_over_time: 30.0,
            lifetime_min: 10.0,
            lifetime_max: 10.0,
            ..Default::default()
        };
        let mut a = EmitterState::default();
        let mut b = EmitterState::default();
        for _ in 0..60 {
            step_emitter(&mut a, &Emitter::Two(&emitter), Vec3::ZERO, 1.0 / 60.0);
        }
        for _ in 0..10 {
            step_emitter(&mut b, &Emitter::Two(&emitter), Vec3::ZERO, 0.1);
        }
        assert_eq!(a.particles.len(), b.particles.len());
        assert_eq!(a.particles.len(), 30);
    }

    #[test]
    fn max_particles_is_enforced() {
        let emitter = ParticleEmitter3D {
            rate_over_time: 10_000.0,
            max_particles: 8,
            lifetime_min: 10.0,
            lifetime_max: 10.0,
            ..Default::default()
        };
        let mut state = EmitterState::default();
        step_emitter(&mut state, &Emitter::Three(&emitter), Vec3::ZERO, 1.0);
        assert_eq!(state.particles.len(), 8);
    }
}
