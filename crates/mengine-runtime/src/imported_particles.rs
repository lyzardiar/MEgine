//! Deterministic simulation for normalized `.mparticle` assets.
use glam::{EulerRot, Mat4, Quat, Vec3};
use mengine_assets::particle_definition::*;

const STEP: f32 = 1.0 / 60.0;

#[derive(Clone, Copy, Debug)]
pub struct ParticleCameraBasis { pub right: Vec3, pub up: Vec3, pub forward: Vec3 }
impl Default for ParticleCameraBasis {
    fn default() -> Self { Self { right: Vec3::X, up: Vec3::Y, forward: Vec3::Z } }
}

#[derive(Clone, Debug)]
pub struct ImportedParticle {
    pub transform: Mat4,
    pub position: Vec3,
    pub velocity: Vec3,
    pub color: [f32; 4],
    pub custom_data1: [f32; 4],
    pub custom_data2: [f32; 4],
    /// UV scale xy and offset zw, composed with each material texture's own transform.
    pub uv_transform: [f32; 4],
    pub normalized_age: f32,
}

#[derive(Clone)]
struct SimParticle {
    position: Vec3,
    velocity: Vec3,
    rotation: Vec3,
    size: Vec3,
    color: [f32; 4],
    age: f32,
    custom_age: f32,
    lifetime: f32,
    random: [f32; 8],
    birth_transform: Mat4,
    direction_rotation: Quat,
}

#[derive(Clone)]
pub struct ImportedParticleSimulation {
    particles: Vec<SimParticle>,
    tick: u64,
    random: u32,
    remainder: f32,
    initialized: bool,
    delay: f32,
    last_requested: f32,
}
impl Default for ImportedParticleSimulation {
    fn default() -> Self { Self { particles: Vec::new(), tick: 0, random: 1, remainder: 0.0, initialized: false, delay: 0.0, last_requested: 0.0 } }
}

impl ImportedParticleSimulation {
    pub fn reset(&mut self) { *self = Self::default(); }

    /// Absolute time permits timeline seeks and replay. Deactivation clears particles.
    /// World-space particles retain the emitter matrix from their emission frame.
    pub fn sample(&mut self, definition: &ParticleDefinition, time_seconds: f32, active: bool, parent: Mat4, camera: ParticleCameraBasis) -> Vec<ImportedParticle> {
        let time_seconds = time_seconds * definition.simulation_speed.max(0.0);
        if !active || !time_seconds.is_finite() || time_seconds < 0.0 || !parent.is_finite() {
            self.reset();
            return Vec::new();
        }
        if time_seconds < self.last_requested { self.reset(); }
        self.last_requested = time_seconds;
        if !self.initialized {
            self.random = definition.seed.max(1);
            let random = self.random();
            self.delay = definition.start_delay.evaluate(0.0, random).max(0.0);
            self.initialized = true;
            self.emit_bursts(definition, -f32::EPSILON, 0.0, parent);
        }
        let fixed_step = if definition.coordinate_space == "unity" { 0.02 * definition.simulation_speed.max(1e-6) } else { STEP };
        let target_tick = (time_seconds as f64 / fixed_step as f64).floor() as u64;
        while self.tick < target_tick {
            let start = self.tick as f32 * fixed_step;
            self.step(definition, start, (self.tick + 1) as f32 * fixed_step, parent);
            self.tick += 1;
        }
        let start = self.tick as f32 * fixed_step;
        if time_seconds > start + 1e-7 {
            let mut preview = self.clone();
            preview.step(definition, start, time_seconds, parent);
            return preview.output(definition, parent, camera);
        }
        self.output(definition, parent, camera)
    }

    fn random(&mut self) -> f32 {
        let mut x = self.random;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.random = x.max(1);
        (self.random >> 8) as f32 / 16_777_216.0
    }

    fn step(&mut self, d: &ParticleDefinition, start: f32, end: f32, parent: Mat4) {
        let dt = (end - start).max(0.0);
        for particle in &mut self.particles { integrate(particle, d, dt); }
        self.particles.retain(|p| p.age < p.lifetime);
        let emission_start = start.max(self.delay);
        let emission_end = if d.looping { end } else { end.min(self.delay + d.duration) };
        if emission_end > emission_start && d.duration > 0.0 {
            let phase = ((emission_start + emission_end) * 0.5 - self.delay).rem_euclid(d.duration) / d.duration;
            let rate = d.rate_over_time.evaluate(phase, 0.5).max(0.0);
            let span = emission_end - emission_start;
            let emission = self.remainder + rate * span;
            let count = (emission + 1e-5).floor().min(100_000.0) as u32;
            for index in 0..count {
                let born = emission_start + ((index as f32 + 1.0 - self.remainder) / rate.max(f32::EPSILON)).clamp(0.0, span);
                self.spawn(d, born, end - born, parent);
            }
            self.remainder = (emission - count as f32).max(0.0);
        }
        self.emit_bursts(d, start, end, parent);
    }

    fn emit_bursts(&mut self, d: &ParticleDefinition, start: f32, end: f32, parent: Mat4) {
        if d.duration <= 0.0 || end < self.delay { return; }
        let first_cycle = ((start - self.delay).max(0.0) / d.duration).floor() as u32;
        let last_cycle = if d.looping { ((end - self.delay).max(0.0) / d.duration).floor() as u32 } else { 0 };
        for cycle in first_cycle..=last_cycle {
            if !d.looping && cycle != 0 { break; }
            let cycle_start = self.delay + cycle as f32 * d.duration;
            for burst in &d.bursts {
                for repeat in 0..burst.cycles.clamp(1, 100_000) {
                    let offset = burst.time + repeat as f32 * burst.interval;
                    if offset >= d.duration { break; }
                    let born = cycle_start + offset;
                    if born <= start || born > end { continue; }
                    if self.random() > burst.probability.clamp(0.0, 1.0) { continue; }
                    let random = self.random();
                    let count = burst.count.evaluate(offset / d.duration, random).round().clamp(0.0, 100_000.0) as u32;
                    for _ in 0..count { self.spawn(d, born, end - born, parent); }
                }
            }
        }
    }

    fn spawn(&mut self, d: &ParticleDefinition, born: f32, elapsed: f32, parent: Mat4) {
        if self.particles.len() >= d.max_particles.min(100_000) as usize { return; }
        let random: [f32; 8] = std::array::from_fn(|_| self.random());
        let phase = (born - self.delay).max(0.0).rem_euclid(d.duration.max(0.001)) / d.duration.max(0.001);
        let lifetime = d.start_lifetime.evaluate(phase, random[0]);
        if lifetime <= 0.0 || !lifetime.is_finite() { return; }
        let (position, direction) = sample_shape(&d.shape, random, d.coordinate_space == "unity");
        let speed = d.start_speed.evaluate(phase, random[1]);
        let rotation = Vec3::from_array(std::array::from_fn(|i| d.start_rotation[i].evaluate(phase, random[3])));
        let size = Vec3::from_array(std::array::from_fn(|i| d.start_size[i].evaluate(phase, random[2])));
        let world = d.simulation_space == "world";
        let direction_rotation = if d.shape.align_to_direction { Quat::from_rotation_arc(Vec3::Z, direction.normalize_or_zero()) } else { Quat::IDENTITY };
        let mut particle = SimParticle { position: if world { parent.transform_point3(position) } else { position }, velocity: if world { parent.transform_vector3(direction * speed) } else { direction * speed }, rotation, size, color: d.start_color.evaluate(phase, random[4]), age: 0.0, custom_age: 0.0, lifetime, random, birth_transform: parent, direction_rotation };
        integrate(&mut particle, d, elapsed);
        if particle.age < particle.lifetime { self.particles.push(particle); }
    }

    fn output(&self, d: &ParticleDefinition, parent: Mat4, camera: ParticleCameraBasis) -> Vec<ImportedParticle> {
        self.particles.iter().map(|p| {
            let age = (p.age / p.lifetime).clamp(0.0, 1.0);
            let local = d.simulation_space != "world";
            let base = if local { parent } else { p.birth_transform };
            let position = if local { parent.transform_point3(p.position) } else { p.position };
            let velocity = if local { parent.transform_vector3(p.velocity) } else { p.velocity };
            let mut size = p.size;
            if let Some(curves) = &d.size_over_lifetime { size *= Vec3::from_array(std::array::from_fn(|i| curves[i].evaluate(age, p.random[2]))); }
            let rotation = particle_rotation(p.rotation, d.coordinate_space == "unity", d.renderer.mode != "mesh");
            let mut transform = if d.renderer.mode == "mesh" {
                let mut matrix = base * Mat4::from_quat(p.direction_rotation * rotation) * Mat4::from_scale(size);
                matrix.w_axis = position.extend(1.0);
                matrix
            } else {
                let scale = Vec3::new(base.x_axis.truncate().length(), base.y_axis.truncate().length(), base.z_axis.truncate().length());
                size *= scale;
                if d.coordinate_space == "unity" && d.renderer.mode == "stretch" {
                    // Unity's default stretch uses U as length and anchors the particle at U=0.
                    let direction = if velocity.length_squared() > 1e-8 { velocity.normalize() } else { -camera.right };
                    let width = camera.forward.cross(direction).normalize_or_zero();
                    let width = if width.length_squared() > 0.5 { width } else { camera.up };
                    let length_axis = -direction * (size.y * d.renderer.length_scale + velocity.length() * d.renderer.velocity_scale);
                    let width_axis = width * size.x;
                    let normal = direction.cross(width).normalize_or_zero() * size.z;
                    Mat4::from_cols(length_axis.extend(0.0), width_axis.extend(0.0), normal.extend(0.0), (position + length_axis * 0.5).extend(1.0))
                } else {
                let (right, up, forward) = if d.renderer.mode == "stretch" && velocity.length_squared() > 1e-8 {
                    let up = velocity.normalize();
                    let right = up.cross(camera.forward).normalize_or_zero();
                    let right = if right.length_squared() < 0.5 { camera.right } else { right };
                    (right, up, right.cross(up).normalize_or_zero())
                } else if d.renderer.alignment == "world" { (Vec3::X, Vec3::Y, Vec3::Z) }
                else if d.renderer.alignment == "local" { (base.x_axis.truncate().normalize_or_zero(), base.y_axis.truncate().normalize_or_zero(), base.z_axis.truncate().normalize_or_zero()) }
                else { (camera.right, camera.up, camera.forward) };
                if d.renderer.mode == "stretch" { size.y = size.y * d.renderer.length_scale + velocity.length() * d.renderer.velocity_scale; }
                Mat4::from_cols(right.extend(0.0), up.extend(0.0), forward.extend(0.0), position.extend(1.0)) * Mat4::from_quat(rotation) * Mat4::from_scale(size)
                }
            };
            transform *= Mat4::from_translation(-Vec3::from_array(d.renderer.pivot));
            let mut color = p.color;
            if let Some(gradient) = &d.color_over_lifetime { let c = gradient.evaluate(age, p.random[4]); for i in 0..4 { color[i] *= c[i]; } }
            if d.coordinate_space == "unity" { color = unity_particle_color(color); }
            let custom_age = if d.coordinate_space == "unity" { (p.custom_age / p.lifetime).clamp(0.0, 1.0) } else { age };
            let custom = |curves: &Option<[ParticleCurve; 4]>| curves.as_ref().map(|v| std::array::from_fn(|i| v[i].evaluate(custom_age, p.random[5 + i % 3]))).unwrap_or([0.0; 4]);
            ImportedParticle { transform, position, velocity, color, custom_data1: custom(&d.custom_data1), custom_data2: custom(&d.custom_data2), uv_transform: sample_uv(d.texture_sheet.as_ref(), age, p.random[7]), normalized_age: age }
        }).collect()
    }
}

fn integrate(p: &mut SimParticle, d: &ParticleDefinition, dt: f32) {
    if dt <= 0.0 { return; }
    p.custom_age = p.age;
    let age = ((p.age + dt * 0.5) / p.lifetime).clamp(0.0, 1.0);
    let gravity = Vec3::from_array(d.gravity);
    let mut extra_velocity = Vec3::ZERO;
    if let Some(curves) = &d.velocity_over_lifetime { extra_velocity = Vec3::from_array(std::array::from_fn(|i| curves[i].evaluate(age, p.random[1]))); }
    p.position += (p.velocity + extra_velocity) * dt + gravity * (0.5 * dt * dt);
    p.velocity += gravity * dt;
    if let Some(limit) = &d.limit_velocity {
        let speed = p.velocity.length();
        let maximum = limit.limit.evaluate(age, p.random[1]).max(0.0);
        if speed > maximum {
            let damping = 1.0 - (1.0 - limit.dampen.clamp(0.0, 1.0)).powf(dt * 60.0);
            p.velocity *= (speed + (maximum - speed) * damping) / speed;
        }
        p.velocity *= (-limit.drag.evaluate(age, p.random[1]).max(0.0) * dt).exp();
    }
    if let Some(curves) = &d.rotation_over_lifetime { p.rotation += Vec3::from_array(std::array::from_fn(|i| curves[i].evaluate(age, p.random[3]))) * dt; }
    p.age += dt;
}

fn unity_particle_color(color: [f32; 4]) -> [f32; 4] {
    let mut color = color.map(|value| (value.clamp(0.0, 1.0) * 255.0).round() / 255.0);
    for value in &mut color[..3] { *value = if *value <= 0.04045 { *value / 12.92 } else { ((*value + 0.055) / 1.055).powf(2.4) }; }
    color
}

fn particle_rotation(rotation: Vec3, unity: bool, billboard: bool) -> Quat {
    if unity {
        // Unity applies Z, then X, then Y. Billboard spin is clockwise in its plane.
        let z = if billboard { -rotation.z } else { rotation.z };
        Quat::from_rotation_y(rotation.y) * Quat::from_rotation_x(rotation.x) * Quat::from_rotation_z(z)
    } else { Quat::from_euler(EulerRot::XYZ, rotation.x, rotation.y, rotation.z) }
}

fn sample_shape(s: &ParticleShape, random: [f32; 8], unity: bool) -> (Vec3, Vec3) {
    let theta = random[0] * s.arc_degrees.to_radians();
    let radial = Vec3::new(theta.cos(), theta.sin(), 0.0);
    let shell = (1.0 - s.radius_thickness.clamp(0.0, 1.0)).powi(2);
    let radius = s.radius * (shell + (1.0 - shell) * random[1]).sqrt();
    let z = random[2] * 2.0 - 1.0;
    let sphere = Vec3::new((1.0 - z * z).sqrt() * theta.cos(), (1.0 - z * z).sqrt() * theta.sin(), z);
    let (mut position, mut direction) = match s.kind.as_str() {
        "cone" | "cone_volume" => {
            let angle = s.angle_degrees.to_radians();
            let direction = (radial * angle.sin() + Vec3::Z * angle.cos()).normalize_or_zero();
            let depth = if s.kind == "cone_volume" { random[3] * s.length } else { 0.0 };
            (radial * radius + direction * depth, direction)
        }
        "sphere" | "hemisphere" => {
            let mut direction = sphere;
            if s.kind == "hemisphere" { direction.z = direction.z.abs(); }
            let inner = (1.0 - s.radius_thickness.clamp(0.0, 1.0)).powi(3);
            (direction * s.radius * (inner + (1.0 - inner) * random[1]).cbrt(), direction)
        }
        "circle" => (radial * radius, radial),
        "box" => (Vec3::new(random[0] - 0.5, random[1] - 0.5, random[2] - 0.5), Vec3::Z),
        "edge" => (Vec3::X * ((random[0] * 2.0 - 1.0) * s.radius), Vec3::Z),
        _ => (Vec3::ZERO, Vec3::Z),
    };
    direction = direction.lerp(sphere, s.random_direction.clamp(0.0, 1.0)).normalize_or_zero();
    if position.length_squared() > 1e-8 { direction = direction.lerp(position.normalize(), s.spherical_direction.clamp(0.0, 1.0)).normalize_or_zero(); }
    let rotation = particle_rotation(Vec3::from_array(s.rotation), unity, false);
    position = rotation * (position * Vec3::from_array(s.scale)) + Vec3::from_array(s.position);
    (position, rotation * direction)
}

fn sample_uv(sheet: Option<&ParticleTextureSheet>, age: f32, random: f32) -> [f32; 4] {
    let Some(sheet) = sheet else { return [1.0, 1.0, 0.0, 0.0]; };
    let columns = sheet.tiles[0].max(1);
    let rows = sheet.tiles[1].max(1);
    let single_row = sheet.row.is_some() || sheet.random_row;
    let count = if single_row { columns } else { columns.saturating_mul(rows) };
    let phase = sheet.frame_over_time.evaluate(age, random) * sheet.cycles + sheet.start_frame.evaluate(0.0, random);
    let index = (phase * count as f32).floor().rem_euclid(count as f32) as u32;
    let row = if sheet.random_row { ((random * rows as f32) as u32).min(rows - 1) } else { sheet.row.unwrap_or(index / columns).min(rows - 1) };
    [1.0 / columns as f32, 1.0 / rows as f32, (index % columns) as f32 / columns as f32, 1.0 - (row + 1) as f32 / rows as f32]
}

#[cfg(test)]
mod tests {
    use super::*;
    fn burst_definition() -> ParticleDefinition {
        ParticleDefinition { looping: false, start_lifetime: ParticleCurve::constant(2.0), start_speed: ParticleCurve::constant(1.0), rate_over_time: ParticleCurve::constant(0.0), bursts: vec![ParticleBurst { count: ParticleCurve::constant(3.0), ..Default::default() }], ..Default::default() }
    }
    #[test]
    fn burst_determinism_seek_and_inactive_reset() {
        let d = burst_definition();
        let mut sim = ImportedParticleSimulation::default();
        let a = sim.sample(&d, 0.5, true, Mat4::IDENTITY, ParticleCameraBasis::default());
        assert_eq!(a.len(), 3);
        sim.sample(&d, 1.0, true, Mat4::IDENTITY, ParticleCameraBasis::default());
        let b = sim.sample(&d, 0.5, true, Mat4::IDENTITY, ParticleCameraBasis::default());
        assert_eq!(a[0].position, b[0].position);
        assert!((a[0].position.z - 0.5).abs() < 1e-5);
        assert!(sim.sample(&d, 0.5, false, Mat4::IDENTITY, ParticleCameraBasis::default()).is_empty());
        assert_eq!(sim.sample(&d, 0.0, true, Mat4::IDENTITY, ParticleCameraBasis::default()).len(), 3);
    }
    #[test]
    fn frame_partition_preserves_deterministic_state() {
        let mut d = burst_definition();
        d.rate_over_time = ParticleCurve::constant(30.0);
        let mut incremental = ImportedParticleSimulation::default();
        for i in 0..37 { incremental.sample(&d, i as f32 / 37.0, true, Mat4::IDENTITY, ParticleCameraBasis::default()); }
        let a = incremental.sample(&d, 1.0, true, Mat4::IDENTITY, ParticleCameraBasis::default());
        let b = ImportedParticleSimulation::default().sample(&d, 1.0, true, Mat4::IDENTITY, ParticleCameraBasis::default());
        assert_eq!(a.len(), b.len());
        for (a, b) in a.iter().zip(b) { assert_eq!(a.position, b.position); }
    }
    #[test]
    fn parent_matrix_and_world_birth_transform() {
        let mut d = burst_definition();
        d.renderer.mode = "mesh".into();
        let parent = Mat4::from_scale_rotation_translation(Vec3::new(2.0, 3.0, 4.0), Quat::from_rotation_y(std::f32::consts::FRAC_PI_2), Vec3::new(5.0, 6.0, 7.0));
        let a = ImportedParticleSimulation::default().sample(&d, 0.5, true, parent, ParticleCameraBasis::default());
        assert!((a[0].position - Vec3::new(7.0, 6.0, 7.0)).length() < 1e-4);
        assert!((a[0].transform.x_axis.length() - 2.0).abs() < 1e-5);
        d.simulation_space = "world".into();
        let mut sim = ImportedParticleSimulation::default();
        sim.sample(&d, 0.0, true, parent, ParticleCameraBasis::default());
        let b = sim.sample(&d, 0.5, true, Mat4::IDENTITY, ParticleCameraBasis::default());
        assert!((a[0].position - b[0].position).length() < 1e-4);
    }
    #[test]
    fn custom_data_and_texture_sheet_are_per_particle() {
        let mut d = burst_definition();
        d.custom_data1 = Some(std::array::from_fn(|i| ParticleCurve::constant(i as f32 + 1.0)));
        d.custom_data2 = Some(std::array::from_fn(|i| ParticleCurve::constant(i as f32 + 5.0)));
        d.texture_sheet = Some(ParticleTextureSheet { tiles: [4, 2], frame_over_time: ParticleCurve::constant(0.375), ..Default::default() });
        let p = ImportedParticleSimulation::default().sample(&d, 0.5, true, Mat4::IDENTITY, ParticleCameraBasis::default());
        assert_eq!(p[0].custom_data1, [1.0, 2.0, 3.0, 4.0]);
        assert_eq!(p[0].custom_data2, [5.0, 6.0, 7.0, 8.0]);
        assert_eq!(p[0].uv_transform, [0.25, 0.5, 0.75, 0.5]);
    }
    #[test]
    fn delayed_repeated_bursts_fire_once_and_lifetime_expires() {
        let mut d = burst_definition();
        d.start_delay = ParticleCurve::constant(0.25);
        d.bursts[0].cycles = 2;
        d.bursts[0].interval = 0.25;
        let mut sim = ImportedParticleSimulation::default();
        assert!(sim.sample(&d, 0.2, true, Mat4::IDENTITY, ParticleCameraBasis::default()).is_empty());
        assert_eq!(sim.sample(&d, 0.6, true, Mat4::IDENTITY, ParticleCameraBasis::default()).len(), 6);
        assert!(sim.sample(&d, 3.0, true, Mat4::IDENTITY, ParticleCameraBasis::default()).is_empty());
    }
    #[test]
    fn unity_mesh_euler_and_reflected_parent_match_live_editor() {
        let mut d = burst_definition();
        d.coordinate_space = "unity".into();
        d.renderer.mode = "mesh".into();
        d.start_speed = ParticleCurve::constant(0.0);
        d.start_rotation = [20.0_f32, 30.0, 40.0].map(|angle| ParticleCurve::constant(angle.to_radians()));
        let reflection = Mat4::from_scale(Vec3::new(1.0, 1.0, -1.0));
        let p = ImportedParticleSimulation::default().sample(&d, 0.0, true, reflection, ParticleCameraBasis::default());
        let actual = p[0].transform.transform_point3(Vec3::X);
        // Unity BakeMesh with rotation3D=(20,30,40), followed by engine Z reflection.
        assert!((actual - Vec3::new(0.7733371, 0.6040227, 0.192629889)).length() < 1e-6);
    }
    #[test]
    fn unity_billboard_spin_is_clockwise_and_zero_velocity_stretch_is_finite() {
        let mut d = burst_definition();
        d.coordinate_space = "unity".into();
        d.start_speed = ParticleCurve::constant(0.0);
        d.start_rotation[2] = ParticleCurve::constant(std::f32::consts::FRAC_PI_2);
        let reflection = Mat4::from_scale(Vec3::new(1.0, 1.0, -1.0));
        for alignment in ["view", "local", "world"] {
            d.renderer.alignment = alignment.into();
            let p = ImportedParticleSimulation::default().sample(&d, 0.0, true, reflection, ParticleCameraBasis::default());
            assert!((p[0].transform.transform_point3(Vec3::new(-0.5, 0.5, 0.0)) - Vec3::new(0.5, 0.5, 0.0)).length() < 1e-6);
        }
        d.renderer.mode = "stretch".into();
        d.start_rotation[2] = ParticleCurve::constant(0.0);
        let p = ImportedParticleSimulation::default().sample(&d, 0.0, true, reflection, ParticleCameraBasis::default());
        assert!(p[0].transform.is_finite());
        assert!((p[0].transform.x_axis.length() - 2.0).abs() < 1e-6);
        assert!((p[0].transform.y_axis.length() - 1.0).abs() < 1e-6);
        assert!((p[0].transform.transform_point3(Vec3::new(-0.5, 0.0, 0.0)) - p[0].position).length() < 1e-6);
    }
    #[test]
    fn unity_custom_data_uses_previous_fixed_step_but_size_uses_current_age() {
        let mut d = burst_definition();
        d.coordinate_space = "unity".into();
        d.start_lifetime = ParticleCurve::constant(1.0);
        let linear = ParticleCurve { mode: "curve".into(), keys: vec![ParticleCurveKey { time: 0.0, value: 0.0, out_tangent: 1.0, ..Default::default() }, ParticleCurveKey { time: 1.0, value: 1.0, in_tangent: 1.0, ..Default::default() }], ..Default::default() };
        d.custom_data1 = Some(std::array::from_fn(|_| linear.clone()));
        d.size_over_lifetime = Some(std::array::from_fn(|_| linear.clone()));
        let p = ImportedParticleSimulation::default().sample(&d, 0.6, true, Mat4::IDENTITY, ParticleCameraBasis::default());
        assert!((p[0].custom_data1[0] - 0.58).abs() < 1e-6);
        assert!((p[0].normalized_age - 0.6).abs() < 1e-6);
        assert!((p[0].transform.x_axis.length() - 0.6).abs() < 1e-6);
        let color = unity_particle_color([0.6, 0.6, 0.6, 0.5]);
        assert!((color[0] - 0.3185468).abs() < 1e-6);
        assert!((color[3] - 128.0 / 255.0).abs() < 1e-6);
    }
    #[test]
    fn emission_boundary_does_not_drop_particle_to_roundoff() {
        let mut d = burst_definition();
        d.bursts.clear();
        d.rate_over_time = ParticleCurve::constant(10.0);
        for space in ["engine", "unity"] {
            d.coordinate_space = space.into();
            let direct = ImportedParticleSimulation::default().sample(&d, 0.5, true, Mat4::IDENTITY, ParticleCameraBasis::default());
            let mut incremental = ImportedParticleSimulation::default();
            for index in 1..30 { incremental.sample(&d, index as f32 / 60.0, true, Mat4::IDENTITY, ParticleCameraBasis::default()); }
            let partitioned = incremental.sample(&d, 0.5, true, Mat4::IDENTITY, ParticleCameraBasis::default());
            assert_eq!(direct.len(), 5);
            assert_eq!(partitioned.len(), 5);
            for (left, right) in direct.iter().zip(partitioned) { assert_eq!(left.position, right.position); }
        }
    }
    #[test]
    fn unity_stretch_uses_u_length_and_anchors_at_particle_position() {
        let mut d = burst_definition();
        d.coordinate_space = "unity".into();
        d.renderer.mode = "stretch".into();
        d.renderer.length_scale = -2.0;
        d.start_size = [ParticleCurve::constant(0.3), ParticleCurve::constant(0.4), ParticleCurve::constant(1.0)];
        d.shape.rotation[0] = -std::f32::consts::FRAC_PI_2;
        let parent = Mat4::from_scale(Vec3::new(5.0, 5.0, -5.0));
        let p = ImportedParticleSimulation::default().sample(&d, 0.1, true, parent, ParticleCameraBasis::default());
        let transform = p[0].transform;
        assert!((transform.x_axis.truncate() - Vec3::Y * 4.0).length() < 1e-5);
        assert!((transform.y_axis.length() - 1.5).abs() < 1e-5);
        assert!((transform.transform_point3(Vec3::new(-0.5, 0.0, 0.0)) - p[0].position).length() < 1e-5);
    }
}
