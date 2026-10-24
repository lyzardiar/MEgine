// Author: MiYu. Imported particles consume each Play simulation interval once.
#[derive(Default)]
pub(super) struct ImportedParticleClock { play: Option<(u64, f64)> }

impl ImportedParticleClock {
    /// Edit previews use the host delta; Play preserves the full interval, including a late first frame.
    pub(super) fn sample(&mut self, session: Option<u64>, elapsed: f64) -> (Option<f32>, bool) {
        let previous = self.play;
        let Some(session) = session else { self.play = None; return (previous.map(|_| 0.0), previous.is_some()); };
        if !elapsed.is_finite() { return (Some(0.0), false); }
        let elapsed = elapsed.max(0.0);
        self.play = Some((session, elapsed));
        match previous {
            Some((id, time)) if id == session && elapsed >= time => (Some((elapsed - time) as f32), false),
            _ => (Some(elapsed as f32), true),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sampled_particles_consume_late_first_frame_and_full_step_once() {
        let mut clock = ImportedParticleClock::default();
        assert_eq!(clock.sample(None, 0.8), (None, false));
        assert_eq!(clock.sample(Some(7), 0.8), (Some(0.8), true));
        assert_eq!(clock.sample(Some(7), 0.8), (Some(0.0), false));
        assert_eq!(clock.sample(Some(7), 1.6), (Some(0.8), false));
        assert_eq!(clock.sample(Some(8), 0.6), (Some(0.6), true));
        assert_eq!(clock.sample(Some(8), 0.2), (Some(0.2), true));
        assert_eq!(clock.sample(Some(8), f64::NAN), (Some(0.0), false));
        assert_eq!(clock.sample(Some(8), 0.4), (Some(0.2), false));
    }

    #[test]
    fn leaving_play_restarts_particles_then_restores_host_preview_delta() {
        let mut clock = ImportedParticleClock::default();
        assert_eq!(clock.sample(Some(7), 0.0), (Some(0.0), true));
        assert_eq!(clock.sample(Some(7), 0.125), (Some(0.125), false));
        assert_eq!(clock.sample(None, 0.0), (Some(0.0), true));
        assert_eq!(clock.sample(None, 0.0), (None, false));
        assert_eq!(clock.sample(Some(8), 0.0), (Some(0.0), true));
    }
}
