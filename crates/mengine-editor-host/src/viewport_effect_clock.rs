// Author: MiYu. Play effects follow simulation time; edit previews follow bounded wall time.
use std::time::Instant;

pub(super) struct ViewportEffectClock { wall: Instant, play: Option<(u64, f64)> }

impl Default for ViewportEffectClock {
    fn default() -> Self { Self { wall: Instant::now(), play: None } }
}

impl ViewportEffectClock {
    pub(super) fn sample(&mut self, session: Option<u64>, elapsed: f64, now: Instant) -> (f32, bool) {
        let wall_delta = now.saturating_duration_since(self.wall).as_secs_f32().min(0.25);
        self.wall = now;
        let previous = self.play;
        let Some(session) = session else { self.play = None; return (if previous.is_some() { 0.0 } else { wall_delta }, previous.is_some()); };
        if !elapsed.is_finite() { return (0.0, false); }
        let elapsed = elapsed.max(0.0);
        self.play = Some((session, elapsed));
        match previous {
            Some((id, time)) if id == session && elapsed >= time => ((elapsed - time).min(0.25) as f32, false),
            _ => (0.0, true),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn play_consumes_each_simulation_interval_once_and_preview_keeps_wall_time() {
        let mut clock = ViewportEffectClock::default(); let start = clock.wall;
        assert_eq!(clock.sample(None, 0.0, start + Duration::from_millis(100)), (0.1, false));
        assert_eq!(clock.sample(Some(7), 1.0, start + Duration::from_secs(1)), (0.0, true));
        assert_eq!(clock.sample(Some(7), 1.0, start + Duration::from_secs(2)), (0.0, false));
        assert_eq!(clock.sample(Some(7), 1.125, start + Duration::from_secs(3)), (0.125, false));
        assert_eq!(clock.sample(Some(7), 1.125, start + Duration::from_secs(4)), (0.0, false));
        assert_eq!(clock.sample(Some(7), 1.0, start + Duration::from_secs(5)), (0.0, true));
        assert_eq!(clock.sample(Some(8), 1.0, start + Duration::from_secs(6)), (0.0, true));
        assert_eq!(clock.sample(Some(8), f64::NAN, start + Duration::from_secs(7)), (0.0, false));
        assert_eq!(clock.sample(Some(8), 9.0, start + Duration::from_secs(8)), (0.25, false));
        assert_eq!(clock.sample(None, 0.0, start + Duration::from_secs(9)), (0.0, true));
        assert_eq!(clock.sample(None, 0.0, start + Duration::from_secs(10)), (0.25, false));
    }
}
