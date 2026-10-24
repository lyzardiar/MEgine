// Author: MiYu. Reuse exact forward draw commands while uniforms and buffer contents keep updating.
use super::HDR_COLOR_FORMAT;

const MIN_DRAWS: usize = 64;
const MAX_ENTRIES: usize = 4;
const MAX_DRAWS: usize = 32_768;
const MAX_IDLE_SUBMISSIONS: u64 = 8;

pub(super) struct WorldDraw<'a> {
    pub pipeline: &'a wgpu::RenderPipeline,
    pub textures: &'a wgpu::BindGroup,
    pub vertices: &'a wgpu::Buffer,
    pub indices: &'a wgpu::Buffer,
    pub count: u32,
    pub offset: u32,
}

pub(super) struct WorldBindings<'a> {
    pub globals: &'a wgpu::BindGroup,
    pub shadows: &'a wgpu::BindGroup,
    pub environment: &'a wgpu::BindGroup,
}

struct CachedDraw {
    pipeline: wgpu::RenderPipeline, textures: wgpu::BindGroup,
    vertices: wgpu::Buffer, indices: wgpu::Buffer, count: u32, offset: u32,
}

impl CachedDraw {
    fn matches(&self, draw: &WorldDraw<'_>) -> bool {
        self.count == draw.count && self.offset == draw.offset && self.pipeline == *draw.pipeline && self.textures == *draw.textures && self.vertices == *draw.vertices && self.indices == *draw.indices
    }
}

struct Entry {
    globals: wgpu::BindGroup, shadows: wgpu::BindGroup, environment: wgpu::BindGroup,
    draws: Vec<CachedDraw>, samples: u32, last_used: u64, bundle: Option<wgpu::RenderBundle>,
}

#[derive(Default)]
pub(super) struct WorldBundleCache { entries: Vec<Entry>, epoch: u64 }

impl WorldBundleCache {
    pub fn accepts_count(count: usize) -> bool { (MIN_DRAWS..=MAX_DRAWS).contains(&count) }

    #[cfg(test)]
    pub fn counts(&self) -> (usize, usize) { (self.entries.len(), self.entries.iter().map(|entry| entry.draws.len()).sum()) }

    // Exact handle equality prevents stale bindings after hot reload or buffer growth; no hash-only hits.
    // A draw list is admitted on its second occurrence so changing lists do not encode unused bundles.
    pub fn prepare(&mut self, device: &wgpu::Device, samples: u32, bindings: WorldBindings<'_>, draws: &[WorldDraw<'_>]) -> Option<(&wgpu::RenderBundle, bool)> {
        self.epoch = self.epoch.wrapping_add(1);
        self.entries.retain(|entry| self.epoch.wrapping_sub(entry.last_used) <= MAX_IDLE_SUBMISSIONS);
        if !Self::accepts_count(draws.len()) { return None; }
        if let Some(index) = self.entries.iter().position(|entry| entry.samples == samples && entry.globals == *bindings.globals && entry.shadows == *bindings.shadows && entry.environment == *bindings.environment && entry.draws.len() == draws.len() && entry.draws.iter().zip(draws).all(|(cached, draw)| cached.matches(draw))) {
            let entry = &mut self.entries[index]; entry.last_used = self.epoch;
            let reused = entry.bundle.is_some();
            let bundle = entry.bundle.get_or_insert_with(|| {
                let mut encoder = device.create_render_bundle_encoder(&wgpu::RenderBundleEncoderDescriptor {
                    label: Some("cached forward draws"), color_formats: &[Some(HDR_COLOR_FORMAT)],
                    depth_stencil: Some(wgpu::RenderBundleDepthStencil { format: wgpu::TextureFormat::Depth24PlusStencil8, depth_read_only: false, stencil_read_only: true }), sample_count: samples, multiview: None,
                });
                encoder.set_bind_group(2, bindings.shadows, &[]); encoder.set_bind_group(3, bindings.environment, &[]);
                let (mut pipeline, mut textures, mut vertices, mut indices) = (None, None, None, None);
                for draw in draws {
                    if pipeline != Some(draw.pipeline) { encoder.set_pipeline(draw.pipeline); pipeline = Some(draw.pipeline); }
                    encoder.set_bind_group(0, bindings.globals, &[draw.offset]);
                    if textures != Some(draw.textures) { encoder.set_bind_group(1, draw.textures, &[]); textures = Some(draw.textures); }
                    if vertices != Some(draw.vertices) { encoder.set_vertex_buffer(0, draw.vertices.slice(..)); vertices = Some(draw.vertices); }
                    if indices != Some(draw.indices) { encoder.set_index_buffer(draw.indices.slice(..), wgpu::IndexFormat::Uint32); indices = Some(draw.indices); }
                    encoder.draw_indexed(0..draw.count, 0, 0..1);
                }
                encoder.finish(&wgpu::RenderBundleDescriptor { label: Some("cached forward draws") })
            });
            return Some((bundle, reused));
        }
        while self.entries.len() >= MAX_ENTRIES || self.entries.iter().map(|entry| entry.draws.len()).sum::<usize>() + draws.len() > MAX_DRAWS {
            let index = self.entries.iter().enumerate().max_by_key(|(_, entry)| self.epoch.wrapping_sub(entry.last_used)).unwrap().0;
            self.entries.swap_remove(index);
        }
        self.entries.push(Entry {
            globals: bindings.globals.clone(), shadows: bindings.shadows.clone(), environment: bindings.environment.clone(), samples, last_used: self.epoch, bundle: None,
            draws: draws.iter().map(|draw| CachedDraw { pipeline: draw.pipeline.clone(), textures: draw.textures.clone(), vertices: draw.vertices.clone(), indices: draw.indices.clone(), count: draw.count, offset: draw.offset }).collect(),
        });
        None
    }
}
