// Author: MiYu. Bounded owned GPU readback tickets release renderer and world locks before completion.
use crate::gpu_profiler::{decode_timestamps, GpuFrameProfiler};
use crate::{OffscreenReadbackProfile, RhiError};
use std::sync::{mpsc, Arc, Mutex};
use std::time::Instant;
#[path = "readback_cpu.rs"]
mod cpu;
pub use cpu::recycle_readback_rgba;

const MAX_READBACK_SLOTS: usize = 3;
type MapResult = mpsc::Receiver<Result<(), wgpu::BufferAsyncError>>;

pub(crate) struct ReadbackSlot { pub buffer: wgpu::Buffer, query: Option<wgpu::Buffer>, busy: bool }

#[derive(Default)]
pub(crate) struct ReadbackPool { pub slots: Vec<ReadbackSlot>, pub allocations: u64 }

impl ReadbackPool {
    pub fn stats(&self) -> (u64, u64) { (self.slots.iter().map(|slot| slot.buffer.size()).sum(), self.allocations) }

    #[cfg(test)]
    pub fn replace_test_buffer(&mut self, buffer: wgpu::Buffer) { self.slots = vec![ReadbackSlot { buffer, query: None, busy: false }]; self.allocations = 1; }
}

/// Owns one exact submitted image. Finish outside renderer/world locks; dropping cancels its maps.
pub struct OffscreenReadbackTicket {
    device: wgpu::Device,
    poll_gate: Arc<Mutex<()>>,
    submission: wgpu::SubmissionIndex,
    pool: Arc<Mutex<ReadbackPool>>,
    slot: Option<usize>,
    buffer: wgpu::Buffer,
    mapped: MapResult,
    query: Option<(wgpu::Buffer, MapResult, u8, f64)>,
    row_bytes: u32,
    padded_row_bytes: u32,
    height: u32,
    bgra: bool,
    profile: OffscreenReadbackProfile,
}

fn map_buffer(buffer: &wgpu::Buffer, bytes: u64) -> MapResult {
    let (sender, receiver) = mpsc::sync_channel(1);
    buffer.slice(..bytes).map_async(wgpu::MapMode::Read, move |result| { let _ = sender.send(result); });
    receiver
}

pub(crate) fn begin_readback(device: &wgpu::Device, queue: &wgpu::Queue, texture: &wgpu::Texture, width: u32, height: u32, format: wgpu::TextureFormat, profiler: Option<&GpuFrameProfiler>, pool: &Arc<Mutex<ReadbackPool>>, poll_gate: &Arc<Mutex<()>>) -> Result<OffscreenReadbackTicket, RhiError> {
    let started = Instant::now();
    let bgra = matches!(format, wgpu::TextureFormat::Bgra8Unorm | wgpu::TextureFormat::Bgra8UnormSrgb);
    if !bgra && !matches!(format, wgpu::TextureFormat::Rgba8Unorm | wgpu::TextureFormat::Rgba8UnormSrgb) { return Err(RhiError::InvalidTarget(format!("RGBA8 readback does not support {format:?}"))); }
    let row_bytes = width * 4;
    let padded_row_bytes = row_bytes.div_ceil(wgpu::COPY_BYTES_PER_ROW_ALIGNMENT) * wgpu::COPY_BYTES_PER_ROW_ALIGNMENT;
    let required_bytes = u64::from(padded_row_bytes) * u64::from(height);
    let mut cache = pool.lock().map_err(|error| RhiError::InvalidTarget(format!("readback pool lock failed: {error}")))?;
    let slot = cache.slots.iter().position(|slot| !slot.busy).unwrap_or(cache.slots.len());
    if slot == MAX_READBACK_SLOTS { return Err(RhiError::ReadbackBusy); }
    let buffer_reused = cache.slots.get(slot).is_some_and(|slot| slot.buffer.size() >= required_bytes);
    if !buffer_reused {
        let buffer = device.create_buffer(&wgpu::BufferDescriptor { label: Some("mengine_offscreen_readback"), size: required_bytes, usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ, mapped_at_creation: false });
        if slot == cache.slots.len() { cache.slots.push(ReadbackSlot { buffer, query: None, busy: false }); } else { cache.slots[slot].buffer = buffer; }
        cache.allocations += 1;
    }
    if profiler.is_some() && cache.slots[slot].query.is_none() { cache.slots[slot].query = Some(GpuFrameProfiler::create_readback(device)); }
    let buffer = cache.slots[slot].buffer.clone();
    let query = profiler.map(|profiler| (cache.slots[slot].query.as_ref().unwrap().clone(), profiler.active_mask(), f64::from(queue.get_timestamp_period())));
    let mut profile = OffscreenReadbackProfile { buffer_prepare_ms: started.elapsed().as_secs_f64() * 1000.0, buffer_reused, buffer_bytes: cache.stats().0, buffer_allocations: cache.allocations, ..Default::default() };
    let started = Instant::now();
    let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("mengine_offscreen_readback") });
    if let Some(profiler) = profiler { profiler.begin_copy(&mut encoder); }
    encoder.copy_texture_to_buffer(wgpu::TexelCopyTextureInfo { texture, mip_level: 0, origin: wgpu::Origin3d::ZERO, aspect: wgpu::TextureAspect::All }, wgpu::TexelCopyBufferInfo { buffer: &buffer, layout: wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(padded_row_bytes), rows_per_image: Some(height) } }, wgpu::Extent3d { width, height, depth_or_array_layers: 1 });
    if let (Some(profiler), Some((buffer, _, _))) = (profiler, &query) { profiler.finish_copy(&mut encoder, buffer); }
    let submission = queue.submit(std::iter::once(encoder.finish()));
    profile.copy_submit_ms = started.elapsed().as_secs_f64() * 1000.0;
    let mapped = map_buffer(&buffer, required_bytes);
    let query = query.map(|(buffer, active, period)| { let mapped = map_buffer(&buffer, buffer.size()); (buffer, mapped, active, period) });
    cache.slots[slot].busy = true;
    Ok(OffscreenReadbackTicket { device: device.clone(), poll_gate: Arc::clone(poll_gate), submission, pool: Arc::clone(pool), slot: Some(slot), buffer, mapped, query, row_bytes, padded_row_bytes, height, bgra, profile })
}

impl OffscreenReadbackTicket {
    pub fn finish(self) -> Result<(Vec<u8>, OffscreenReadbackProfile), RhiError> { self.finish_pixels(false) }

    /// Reuse returned CPU capacity; the final consumer may return its owned Vec with recycle_readback_rgba.
    pub fn finish_reusing_rgba(self) -> Result<(Vec<u8>, OffscreenReadbackProfile), RhiError> { self.finish_pixels(true) }

    fn finish_pixels(mut self, reuse: bool) -> Result<(Vec<u8>, OffscreenReadbackProfile), RhiError> {
        let started = Instant::now();
        {
            // DX12 uses one device event for fence waits; concurrent waits can consume another viewport's signal.
            let _poll = self.poll_gate.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
            let _ = self.device.poll(wgpu::Maintain::WaitForSubmissionIndex(self.submission.clone()));
        }
        let mapped = self.mapped.recv().map_err(|error| RhiError::InvalidTarget(format!("readback callback failed: {error}"))).and_then(|result| result.map_err(|error| RhiError::InvalidTarget(format!("readback mapping failed: {error}"))));
        self.profile.gpu_wait_ms = started.elapsed().as_secs_f64() * 1000.0;
        let started = Instant::now();
        if let Some((buffer, receiver, active, period)) = &self.query {
            if receiver.recv().is_ok_and(|result| result.is_ok()) { self.profile.gpu = Some(decode_timestamps(&buffer.slice(..).get_mapped_range(), *active, *period)); }
        }
        self.profile.gpu_query_read_ms = started.elapsed().as_secs_f64() * 1000.0;
        mapped?;
        let started = Instant::now();
        let bytes = u64::from(self.padded_row_bytes) * u64::from(self.height);
        let mapped = self.buffer.slice(..bytes).get_mapped_range();
        let required = self.row_bytes as usize * self.height as usize;
        let mut rgba = if reuse { cpu::take_readback_rgba(required) } else { Vec::new() };
        rgba.reserve(required);
        for row in mapped.chunks_exact(self.padded_row_bytes as usize) { rgba.extend_from_slice(&row[..self.row_bytes as usize]); }
        if self.bgra { for pixel in rgba.chunks_exact_mut(4) { pixel.swap(0, 2); } }
        drop(mapped);
        self.profile.rgba_pack_ms = started.elapsed().as_secs_f64() * 1000.0;
        let started = Instant::now();
        self.release();
        self.profile.unmap_ms = started.elapsed().as_secs_f64() * 1000.0;
        Ok((rgba, std::mem::take(&mut self.profile)))
    }

    fn release(&mut self) {
        let Some(slot) = self.slot.take() else { return; };
        self.buffer.unmap();
        if let Some((buffer, _, _, _)) = &self.query { buffer.unmap(); }
        self.pool.lock().unwrap_or_else(|error| error.into_inner()).slots[slot].busy = false;
    }
}

impl Drop for OffscreenReadbackTicket { fn drop(&mut self) { self.release(); } }
