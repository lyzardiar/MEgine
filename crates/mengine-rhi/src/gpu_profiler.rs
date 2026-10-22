// Author: MiYu. Optional hardware timestamps for main viewport passes and texture readback.
const PASS_NAMES: [&str; 6] = ["Shadow depth", "Environment background", "Forward HDR", "Tone mapping", "UI overlay", "Texture readback copy"];
const QUERY_STRIDE: u64 = wgpu::QUERY_RESOLVE_BUFFER_ALIGNMENT;
const BUFFER_BYTES: u64 = QUERY_STRIDE * PASS_NAMES.len() as u64;

#[derive(Clone, Debug)]
pub struct GpuProfileStage { pub name: &'static str, pub milliseconds: f64 }
#[derive(Clone, Debug, Default)]
pub struct GpuFrameProfile { pub timestamp_period_ns: f64, pub stages: Vec<GpuProfileStage> }

pub(crate) fn profiling_features(supported: wgpu::Features, requested: bool) -> wgpu::Features {
    if requested && supported.contains(wgpu::Features::TIMESTAMP_QUERY) { wgpu::Features::TIMESTAMP_QUERY | (supported & wgpu::Features::TIMESTAMP_QUERY_INSIDE_ENCODERS) } else { wgpu::Features::empty() }
}

pub(crate) struct GpuFrameProfiler {
    query: wgpu::QuerySet,
    resolved: wgpu::Buffer,
    active: u8,
    copy_timestamps: bool,
}

impl GpuFrameProfiler {
    pub fn new(device: &wgpu::Device) -> Option<Self> {
        if !device.features().contains(wgpu::Features::TIMESTAMP_QUERY) { return None; }
        let query = device.create_query_set(&wgpu::QuerySetDescriptor { label: Some("viewport GPU timings"), ty: wgpu::QueryType::Timestamp, count: PASS_NAMES.len() as u32 * 2 });
        let resolved = device.create_buffer(&wgpu::BufferDescriptor { label: Some("viewport GPU query resolve"), size: BUFFER_BYTES, usage: wgpu::BufferUsages::QUERY_RESOLVE | wgpu::BufferUsages::COPY_SRC, mapped_at_creation: false });
        Some(Self { query, resolved, active: 0, copy_timestamps: device.features().contains(wgpu::Features::TIMESTAMP_QUERY_INSIDE_ENCODERS) })
    }

    pub fn begin_frame(&mut self, shadows: bool, ui: bool) { self.active = 0b001110 | u8::from(shadows) | (u8::from(ui) << 4); }

    pub fn pass(&self, index: u32) -> wgpu::RenderPassTimestampWrites<'_> {
        wgpu::RenderPassTimestampWrites { query_set: &self.query, beginning_of_pass_write_index: Some(index * 2), end_of_pass_write_index: Some(index * 2 + 1) }
    }

    pub fn resolve_frame(&self, encoder: &mut wgpu::CommandEncoder) {
        for index in 0..5_u32 { if self.active & (1 << index) != 0 { encoder.resolve_query_set(&self.query, index * 2..index * 2 + 2, &self.resolved, u64::from(index) * QUERY_STRIDE); } }
    }

    pub fn begin_copy(&self, encoder: &mut wgpu::CommandEncoder) { if self.copy_timestamps { encoder.write_timestamp(&self.query, 10); } }

    pub fn finish_copy(&self, encoder: &mut wgpu::CommandEncoder, readback: &wgpu::Buffer) {
        if self.copy_timestamps { encoder.write_timestamp(&self.query, 11); encoder.resolve_query_set(&self.query, 10..12, &self.resolved, 5 * QUERY_STRIDE); }
        encoder.copy_buffer_to_buffer(&self.resolved, 0, readback, 0, BUFFER_BYTES);
    }

    pub fn active_mask(&self) -> u8 { self.active | (u8::from(self.copy_timestamps) << 5) }

    pub fn create_readback(device: &wgpu::Device) -> wgpu::Buffer {
        device.create_buffer(&wgpu::BufferDescriptor { label: Some("viewport GPU query readback"), size: BUFFER_BYTES, usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ, mapped_at_creation: false })
    }
}

pub(crate) fn decode_timestamps(bytes: &[u8], active: u8, period_ns: f64) -> GpuFrameProfile {
    let mut profile = GpuFrameProfile { timestamp_period_ns: period_ns, stages: Vec::new() };
    if !period_ns.is_finite() || period_ns <= 0.0 { return profile; }
    for (index, name) in PASS_NAMES.into_iter().enumerate() {
        if active & (1 << index) == 0 { continue; }
        let offset = index * QUERY_STRIDE as usize;
        let Some(pair) = bytes.get(offset..offset + 16) else { continue; };
        let start = u64::from_le_bytes(pair[..8].try_into().unwrap());
        let end = u64::from_le_bytes(pair[8..].try_into().unwrap());
        if let Some(ticks) = end.checked_sub(start) { profile.stages.push(GpuProfileStage { name, milliseconds: ticks as f64 * period_ns / 1_000_000.0 }); }
    }
    profile
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn optional_gpu_features_preserve_unsupported_and_disabled_devices() {
        let all = wgpu::Features::TIMESTAMP_QUERY | wgpu::Features::TIMESTAMP_QUERY_INSIDE_ENCODERS;
        assert!(profiling_features(all, false).is_empty());
        assert!(profiling_features(wgpu::Features::TIMESTAMP_QUERY_INSIDE_ENCODERS, true).is_empty());
        assert_eq!(profiling_features(all, true), all);
        assert_eq!(profiling_features(wgpu::Features::TIMESTAMP_QUERY, true), wgpu::Features::TIMESTAMP_QUERY);
    }
    #[test]
    fn gpu_ticks_use_aligned_slots_and_ignore_inactive_or_invalid_ranges() {
        let mut bytes = vec![0; BUFFER_BYTES as usize];
        for (index, start, end) in [(0, 5_u64, 25_u64), (1, 10, 30), (2, 100, 300), (3, 90, 20), (5, 7, 57)] {
            let offset = index * QUERY_STRIDE as usize; bytes[offset..offset + 8].copy_from_slice(&start.to_le_bytes()); bytes[offset + 8..offset + 16].copy_from_slice(&end.to_le_bytes());
        }
        let profile = decode_timestamps(&bytes, 0b101101, 1000.0);
        assert_eq!(profile.stages.iter().map(|stage| stage.name).collect::<Vec<_>>(), ["Shadow depth", "Forward HDR", "Texture readback copy"]);
        assert_eq!(profile.stages.iter().map(|stage| stage.milliseconds).collect::<Vec<_>>(), [0.02, 0.2, 0.05]);
        assert!(decode_timestamps(&bytes[..8], 1, 1.0).stages.is_empty());
        assert!(decode_timestamps(&bytes, 63, f64::NAN).stages.is_empty());
    }
}
