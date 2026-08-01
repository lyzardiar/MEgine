use bytemuck::{Pod, Zeroable};
use mengine_core::surface_shader::{
    parse_surface_shader_schema, MAX_SURFACE_SHADER_PARAMETERS, MAX_SURFACE_SHADER_TEXTURES,
};
use std::collections::{hash_map::DefaultHasher, HashMap, HashSet};
use std::hash::{Hash, Hasher};
use std::sync::Arc;
use thiserror::Error;
use wgpu::util::DeviceExt;

use crate::renderer::{MaterialFilter, MaterialWrap};

#[derive(Clone, Debug, Error, PartialEq, Eq)]
pub enum UiTextureError {
    #[error("texture dimensions must be greater than zero")]
    EmptyDimensions,
    #[error("RGBA texture data length mismatch: expected {expected}, got {actual}")]
    InvalidDataLength { expected: usize, actual: usize },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum UiBlendMode {
    Alpha,
    Premultiplied,
    Additive,
    Multiply,
}

/// Resolved project material consumed by an instanced UI draw. Graphic texture and vertex tint
/// stay on the primitive, matching Unity's `Graphic.material` contract where a replacement
/// material still receives the Graphic's main texture and generated vertex stream.
#[derive(Clone, Debug)]
pub struct UiRenderMaterial {
    pub base_color: [f32; 4],
    pub blend: UiBlendMode,
    pub shader: Arc<str>,
    pub keywords: Vec<String>,
    pub custom_parameters: [[f32; 4]; MAX_SURFACE_SHADER_PARAMETERS],
    pub custom_textures: [String; MAX_SURFACE_SHADER_TEXTURES],
    pub custom_texture_srgb: [bool; MAX_SURFACE_SHADER_TEXTURES],
    pub wrap_u: MaterialWrap,
    pub wrap_v: MaterialWrap,
    pub filter: MaterialFilter,
    pub mipmap_filter: MaterialFilter,
    pub anisotropy: u8,
    pub is_error: bool,
}

impl Default for UiRenderMaterial {
    fn default() -> Self {
        Self {
            base_color: [1.0; 4],
            blend: UiBlendMode::Alpha,
            shader: Arc::from(""),
            keywords: Vec::new(),
            custom_parameters: [[0.0; 4]; MAX_SURFACE_SHADER_PARAMETERS],
            custom_textures: std::array::from_fn(|_| String::new()),
            custom_texture_srgb: [false; MAX_SURFACE_SHADER_TEXTURES],
            wrap_u: MaterialWrap::Clamp,
            wrap_v: MaterialWrap::Clamp,
            filter: MaterialFilter::Linear,
            mipmap_filter: MaterialFilter::Nearest,
            anisotropy: 1,
            is_error: false,
        }
    }
}

impl UiRenderMaterial {
    pub fn error() -> Self {
        Self {
            base_color: [1.0, 0.0, 1.0, 1.0],
            is_error: true,
            ..Self::default()
        }
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub enum UiStencilMode {
    #[default]
    Disabled,
    /// Render only where the current stencil depth equals `reference`.
    Test { reference: u8 },
    /// Draw a mask and increment matching pixels for its children.
    Push { reference: u8 },
    /// Redraw the mask after its descendants and restore the parent depth.
    Pop { reference: u8 },
}

impl UiStencilMode {
    fn pipeline(self) -> UiStencilPipeline {
        match self {
            Self::Disabled => UiStencilPipeline::Disabled,
            Self::Test { .. } => UiStencilPipeline::Test,
            Self::Push { .. } => UiStencilPipeline::Push,
            Self::Pop { .. } => UiStencilPipeline::Pop,
        }
    }

    fn reference(self) -> u32 {
        match self {
            Self::Disabled => 0,
            Self::Test { reference } | Self::Push { reference } | Self::Pop { reference } => {
                u32::from(reference)
            }
        }
    }

    fn writes_stencil(self) -> bool {
        matches!(self, Self::Push { .. } | Self::Pop { .. })
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct UiClipRect {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct UiSoftClip {
    /// Top-left pixel rect: x, y, width, height.
    pub rect: [f32; 4],
    /// Horizontal and vertical inner fade distances in pixels.
    pub softness: [f32; 2],
}

/// Unity AdditionalCanvasShaderChannels bit mask carried by a Canvas draw stream.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
#[repr(transparent)]
pub struct UiShaderChannels(u32);

impl UiShaderChannels {
    pub const TEX_COORD_1: Self = Self(1 << 0);
    pub const TEX_COORD_2: Self = Self(1 << 1);
    pub const TEX_COORD_3: Self = Self(1 << 2);
    pub const NORMAL: Self = Self(1 << 3);
    pub const TANGENT: Self = Self(1 << 4);
    pub const ALL: Self = Self((1 << 5) - 1);

    pub const fn from_additional_mask(mask: i32) -> Self {
        Self((mask as u32) & Self::ALL.0)
    }

    pub fn for_canvas(mask: i32, render_mode: &str) -> Self {
        let authored = Self::from_additional_mask(mask).0;
        if matches!(render_mode, "ScreenSpaceCamera" | "WorldSpace") {
            Self(authored | Self::NORMAL.0 | Self::TANGENT.0)
        } else {
            Self(authored)
        }
    }

    pub const fn bits(self) -> u32 {
        self.0
    }

    pub const fn contains(self, channel: Self) -> bool {
        self.0 & channel.0 == channel.0
    }
}

/// Optional per-vertex UI streams. Values follow Unity UIVertex defaults so
/// custom mesh producers can override individual quad slots without changing
/// the fixed instanced UI layout.
#[derive(Clone, Debug, PartialEq)]
pub struct UiShaderChannelData {
    pub uv1: [[f32; 4]; 4],
    pub uv2: [[f32; 4]; 4],
    pub uv3: [[f32; 4]; 4],
    pub normals: [[f32; 4]; 4],
    pub tangents: [[f32; 4]; 4],
}

impl Default for UiShaderChannelData {
    fn default() -> Self {
        Self {
            uv1: [[0.0; 4]; 4],
            uv2: [[0.0; 4]; 4],
            uv3: [[0.0; 4]; 4],
            normals: [[0.0, 0.0, -1.0, 0.0]; 4],
            tangents: [[1.0, 0.0, 0.0, -1.0]; 4],
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct UiBatchKey {
    /// Nested Canvases are independent Unity batching islands even when their
    /// material and texture match the parent Canvas.
    pub canvas_group: Option<u64>,
    pub material: String,
    pub texture: String,
    pub clip: Option<UiClipRect>,
    pub blend: UiBlendMode,
    /// Effective shader vertex streams. Different declarations cannot batch together.
    pub shader_channels: UiShaderChannels,
    /// Test the primitive against the scene depth buffer without writing depth.
    pub depth_test: bool,
    pub stencil: UiStencilMode,
}

impl Default for UiBatchKey {
    fn default() -> Self {
        Self {
            canvas_group: None,
            material: "ui/default".into(),
            texture: "white".into(),
            clip: None,
            blend: UiBlendMode::Alpha,
            shader_channels: UiShaderChannels::default(),
            depth_test: false,
            stencil: UiStencilMode::Disabled,
        }
    }
}

#[derive(Clone, Debug)]
pub struct UiPrimitive {
    /// Top-left pixel rect: x, y, width, height.
    pub rect: [f32; 4],
    pub color: [f32; 4],
    pub pivot: [f32; 2],
    pub rotation_radians: f32,
    /// WebGPU clip-space depth in the 0..1 range for screen-aligned primitives.
    pub depth: f32,
    /// Optional clip-space corners ordered top-left, top-right, bottom-right, bottom-left.
    /// Supplying corners preserves perspective for World Space Canvas quads.
    pub clip_corners: Option<[[f32; 4]; 4]>,
    /// Normalized UV rect: u, v, width, height.
    pub uv: [f32; 4],
    /// Optional normalized positions for the four quad vertex slots. The default
    /// order is top-left, top-right, bottom-right, bottom-left. Custom polygons
    /// let Unity-style Filled Images retain their generated mesh and UV mapping.
    pub vertex_positions: Option<[[f32; 2]; 4]>,
    /// Allocated only when a custom UI mesh overrides Unity UIVertex defaults.
    pub shader_channel_data: Option<Arc<UiShaderChannelData>>,
    /// Present only for an asset-backed replacement Graphic material. The batch key retains the
    /// normalized asset path, while this resolved payload carries hot-reloadable GPU bindings.
    pub render_material: Option<Arc<UiRenderMaterial>>,
    /// Nested RectMask2D soft clips, ordered outermost to innermost.
    pub soft_clips: [Option<UiSoftClip>; 8],
    /// Canvas-native overlap analysis cell size. `None` keeps non-Canvas draw
    /// streams in authored order; zero and invalid values use Unity's 0.1 default.
    pub canvas_sorting_grid_size: Option<f32>,
    pub key: UiBatchKey,
}

impl UiPrimitive {
    pub fn solid(rect: [f32; 4], color: [f32; 4]) -> Self {
        Self {
            rect,
            color,
            pivot: [0.5, 0.5],
            rotation_radians: 0.0,
            depth: 0.0,
            clip_corners: None,
            uv: [0.0, 0.0, 1.0, 1.0],
            vertex_positions: None,
            shader_channel_data: None,
            render_material: None,
            soft_clips: [None; 8],
            canvas_sorting_grid_size: None,
            key: UiBatchKey::default(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UiBatch {
    pub key: UiBatchKey,
    pub start: u32,
    pub end: u32,
}

#[derive(Clone, Debug, Default)]
pub struct UiBatchPlan {
    pub primitives: Vec<UiPrimitive>,
    pub batches: Vec<UiBatch>,
}

impl UiBatchPlan {
    pub fn build(primitives: Vec<UiPrimitive>) -> Self {
        let primitives = optimize_canvas_batch_order(primitives);
        let mut batches: Vec<UiBatch> = Vec::new();
        for (index, primitive) in primitives.iter().enumerate() {
            let index = index as u32;
            if let Some(tail) = batches.last_mut() {
                if tail.key == primitive.key {
                    tail.end = index + 1;
                    continue;
                }
            }
            batches.push(UiBatch {
                key: primitive.key.clone(),
                start: index,
                end: index + 1,
            });
        }
        Self {
            primitives,
            batches,
        }
    }

    pub fn is_empty(&self) -> bool {
        self.primitives.is_empty()
    }
}

const DEFAULT_CANVAS_SORTING_GRID_SIZE: f32 = 0.1;
const MAX_CANVAS_SORTING_GRID_AXIS: usize = 128;
const MAX_CANVAS_SORTING_GRID_REFERENCES: usize = 1_048_576;
const MAX_CANVAS_OVERLAP_EDGES: usize = 262_144;

#[derive(Clone, Copy, Debug)]
struct PrimitiveBounds {
    min_x: f32,
    min_y: f32,
    max_x: f32,
    max_y: f32,
}

impl PrimitiveBounds {
    fn intersects(self, other: Self) -> bool {
        self.min_x < other.max_x
            && other.min_x < self.max_x
            && self.min_y < other.max_y
            && other.min_y < self.max_y
    }

    fn is_empty(self) -> bool {
        !self.min_x.is_finite()
            || !self.min_y.is_finite()
            || !self.max_x.is_finite()
            || !self.max_y.is_finite()
            || self.max_x <= self.min_x
            || self.max_y <= self.min_y
    }
}

fn primitive_bounds(primitive: &UiPrimitive) -> PrimitiveBounds {
    let [x, y, width, height] = primitive.rect;
    let pivot_x = x + primitive.pivot[0] * width;
    let pivot_y = y + primitive.pivot[1] * height;
    let cosine = primitive.rotation_radians.cos();
    let sine = primitive.rotation_radians.sin();
    let mut bounds = PrimitiveBounds {
        min_x: f32::INFINITY,
        min_y: f32::INFINITY,
        max_x: f32::NEG_INFINITY,
        max_y: f32::NEG_INFINITY,
    };
    for [corner_x, corner_y] in [
        [x, y],
        [x + width, y],
        [x + width, y + height],
        [x, y + height],
    ] {
        let local_x = corner_x - pivot_x;
        let local_y = corner_y - pivot_y;
        let rotated_x = pivot_x + local_x * cosine - local_y * sine;
        let rotated_y = pivot_y + local_x * sine + local_y * cosine;
        bounds.min_x = bounds.min_x.min(rotated_x);
        bounds.min_y = bounds.min_y.min(rotated_y);
        bounds.max_x = bounds.max_x.max(rotated_x);
        bounds.max_y = bounds.max_y.max(rotated_y);
    }
    if let Some(clip) = primitive.key.clip {
        bounds.min_x = bounds.min_x.max(clip.x as f32);
        bounds.min_y = bounds.min_y.max(clip.y as f32);
        bounds.max_x = bounds.max_x.min(clip.x.saturating_add(clip.width) as f32);
        bounds.max_y = bounds.max_y.min(clip.y.saturating_add(clip.height) as f32);
    }
    bounds
}

fn normalized_canvas_grid_size(value: f32) -> f32 {
    if value.is_finite() && value > 0.0 {
        value.min(1.0)
    } else {
        DEFAULT_CANVAS_SORTING_GRID_SIZE
    }
}

/// Unity UI may join compatible graphics across an intermediate material only
/// when their bounding boxes can be reordered without changing transparent
/// overlap. The grid limits overlap candidates; the topological pass preserves
/// every original order edge between intersecting graphics.
fn optimize_canvas_segment(mut primitives: Vec<UiPrimitive>, grid_size: f32) -> Vec<UiPrimitive> {
    if primitives.len() < 3 {
        return primitives;
    }
    let bounds: Vec<_> = primitives.iter().map(primitive_bounds).collect();
    let non_empty: Vec<_> = bounds
        .iter()
        .copied()
        .filter(|value| !value.is_empty())
        .collect();
    if non_empty.is_empty() {
        return primitives;
    }
    let area = non_empty.iter().copied().fold(
        PrimitiveBounds {
            min_x: f32::INFINITY,
            min_y: f32::INFINITY,
            max_x: f32::NEG_INFINITY,
            max_y: f32::NEG_INFINITY,
        },
        |mut total, value| {
            total.min_x = total.min_x.min(value.min_x);
            total.min_y = total.min_y.min(value.min_y);
            total.max_x = total.max_x.max(value.max_x);
            total.max_y = total.max_y.max(value.max_y);
            total
        },
    );
    let axis = ((1.0 / normalized_canvas_grid_size(grid_size)).ceil() as usize)
        .clamp(1, MAX_CANVAS_SORTING_GRID_AXIS);
    let cell_width = ((area.max_x - area.min_x) / axis as f32).max(f32::EPSILON);
    let cell_height = ((area.max_y - area.min_y) / axis as f32).max(f32::EPSILON);
    let cell_range = |value: PrimitiveBounds| {
        let coordinate = |point: f32, origin: f32, extent: f32| {
            (((point - origin) / extent).floor() as isize).clamp(0, axis as isize - 1) as usize
        };
        (
            coordinate(value.min_x, area.min_x, cell_width),
            coordinate(value.max_x, area.min_x, cell_width),
            coordinate(value.min_y, area.min_y, cell_height),
            coordinate(value.max_y, area.min_y, cell_height),
        )
    };

    let mut cells: HashMap<(usize, usize), Vec<usize>> = HashMap::new();
    let mut outgoing = vec![Vec::<usize>::new(); primitives.len()];
    let mut indegree = vec![0usize; primitives.len()];
    let mut grid_references = 0usize;
    let mut overlap_edges = 0usize;
    for (index, current) in bounds.iter().copied().enumerate() {
        if current.is_empty() {
            continue;
        }
        let (min_x, max_x, min_y, max_y) = cell_range(current);
        let references = (max_x - min_x + 1).saturating_mul(max_y - min_y + 1);
        grid_references = grid_references.saturating_add(references);
        if grid_references > MAX_CANVAS_SORTING_GRID_REFERENCES {
            return primitives;
        }
        let mut candidates = std::collections::BTreeSet::new();
        for cell_x in min_x..=max_x {
            for cell_y in min_y..=max_y {
                if let Some(entries) = cells.get(&(cell_x, cell_y)) {
                    candidates.extend(entries.iter().copied());
                }
            }
        }
        for earlier in candidates {
            if bounds[earlier].intersects(current) {
                overlap_edges += 1;
                if overlap_edges > MAX_CANVAS_OVERLAP_EDGES {
                    return primitives;
                }
                outgoing[earlier].push(index);
                indegree[index] += 1;
            }
        }
        for cell_x in min_x..=max_x {
            for cell_y in min_y..=max_y {
                cells.entry((cell_x, cell_y)).or_default().push(index);
            }
        }
    }

    let mut ready = std::collections::BTreeSet::new();
    let mut ready_by_key: HashMap<UiBatchKey, std::collections::BTreeSet<usize>> = HashMap::new();
    for (index, degree) in indegree.iter().copied().enumerate() {
        if degree == 0 {
            ready.insert(index);
            ready_by_key
                .entry(primitives[index].key.clone())
                .or_default()
                .insert(index);
        }
    }
    let mut order = Vec::with_capacity(primitives.len());
    let mut previous_key: Option<UiBatchKey> = None;
    while !ready.is_empty() {
        let next = previous_key
            .as_ref()
            .and_then(|key| ready_by_key.get(key))
            .and_then(|entries| entries.first().copied())
            .or_else(|| {
                ready.iter().copied().find(|candidate| {
                    outgoing[*candidate].iter().copied().any(|dependent| {
                        indegree[dependent] == 1
                            && ready_by_key.contains_key(&primitives[dependent].key)
                    })
                })
            })
            .or_else(|| ready.first().copied())
            .expect("non-empty ready set");
        ready.remove(&next);
        let key = primitives[next].key.clone();
        if let Some(entries) = ready_by_key.get_mut(&key) {
            entries.remove(&next);
            if entries.is_empty() {
                ready_by_key.remove(&key);
            }
        }
        order.push(next);
        previous_key = Some(key);
        for dependent in outgoing[next].iter().copied() {
            indegree[dependent] -= 1;
            if indegree[dependent] == 0 {
                ready.insert(dependent);
                ready_by_key
                    .entry(primitives[dependent].key.clone())
                    .or_default()
                    .insert(dependent);
            }
        }
    }
    debug_assert_eq!(order.len(), primitives.len());
    let mut slots: Vec<_> = primitives.drain(..).map(Some).collect();
    order
        .into_iter()
        .map(|index| slots[index].take().expect("each primitive is emitted once"))
        .collect()
}

fn optimize_canvas_batch_order(primitives: Vec<UiPrimitive>) -> Vec<UiPrimitive> {
    let mut input = primitives.into_iter().peekable();
    let mut output = Vec::with_capacity(input.size_hint().0);
    while let Some(first) = input.next() {
        let canvas_group = first.key.canvas_group;
        let grid_size = first.canvas_sorting_grid_size;
        let mut segment = vec![first];
        while input.peek().is_some_and(|next| {
            next.key.canvas_group == canvas_group
                && next.canvas_sorting_grid_size.map(f32::to_bits) == grid_size.map(f32::to_bits)
        }) {
            segment.push(input.next().expect("peeked primitive must exist"));
        }
        if canvas_group.is_some() {
            output.extend(optimize_canvas_segment(
                segment,
                grid_size.unwrap_or(DEFAULT_CANVAS_SORTING_GRID_SIZE),
            ));
        } else {
            output.extend(segment);
        }
    }
    output
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct UiFrameStats {
    pub primitives: u32,
    pub batches: u32,
    pub draw_calls: u32,
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct UiVertex {
    position: [f32; 2],
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct UiInstance {
    rect: [f32; 4],
    color: [f32; 4],
    transform: [f32; 4],
    uv: [f32; 4],
    projection: [f32; 4],
    corners: [[f32; 4]; 4],
    vertex_positions: [[f32; 4]; 2],
}

impl From<&UiPrimitive> for UiInstance {
    fn from(value: &UiPrimitive) -> Self {
        let vertices =
            value
                .vertex_positions
                .unwrap_or([[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]]);
        Self {
            rect: value.rect,
            color: value.color,
            transform: [value.rotation_radians, value.pivot[0], value.pivot[1], 0.0],
            uv: value.uv,
            projection: [
                if value.depth.is_finite() {
                    value.depth.clamp(0.0, 1.0)
                } else {
                    0.0
                },
                if value.clip_corners.is_some() {
                    1.0
                } else {
                    0.0
                },
                if value.key.stencil.writes_stencil() {
                    1.0
                } else {
                    0.0
                },
                value.key.shader_channels.bits() as f32,
            ],
            corners: value.clip_corners.unwrap_or([[0.0; 4]; 4]),
            vertex_positions: [
                [
                    vertices[0][0],
                    vertices[1][0],
                    vertices[2][0],
                    vertices[3][0],
                ],
                [
                    vertices[0][1],
                    vertices[1][1],
                    vertices[2][1],
                    vertices[3][1],
                ],
            ],
        }
    }
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct UiUniform {
    viewport: [f32; 2],
    _padding: [f32; 2],
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct UiSoftClipGpu {
    rect: [f32; 4],
    softness: [f32; 4],
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct UiSoftClipInstance {
    clips: [UiSoftClipGpu; 8],
}

impl From<&UiPrimitive> for UiSoftClipInstance {
    fn from(value: &UiPrimitive) -> Self {
        Self {
            clips: std::array::from_fn(|index| match value.soft_clips[index] {
                Some(clip) => UiSoftClipGpu {
                    rect: clip.rect,
                    softness: [clip.softness[0], clip.softness[1], 1.0, 0.0],
                },
                None => UiSoftClipGpu::zeroed(),
            }),
        }
    }
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct UiShaderChannelInstance {
    meta: [u32; 4],
    uv1: [[f32; 4]; 4],
    uv2: [[f32; 4]; 4],
    uv3: [[f32; 4]; 4],
    normals: [[f32; 4]; 4],
    tangents: [[f32; 4]; 4],
}

impl From<&UiPrimitive> for UiShaderChannelInstance {
    fn from(value: &UiPrimitive) -> Self {
        let data = value.shader_channel_data.as_deref();
        Self {
            meta: [value.key.shader_channels.bits(), 0, 0, 0],
            uv1: data.map_or([[0.0; 4]; 4], |value| value.uv1),
            uv2: data.map_or([[0.0; 4]; 4], |value| value.uv2),
            uv3: data.map_or([[0.0; 4]; 4], |value| value.uv3),
            normals: data.map_or([[0.0, 0.0, -1.0, 0.0]; 4], |value| value.normals),
            tangents: data.map_or([[1.0, 0.0, 0.0, -1.0]; 4], |value| value.tangents),
        }
    }
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct UiMaterialInstance {
    base_color: [f32; 4],
    custom_parameters: [[f32; 4]; MAX_SURFACE_SHADER_PARAMETERS],
}

impl From<&UiPrimitive> for UiMaterialInstance {
    fn from(value: &UiPrimitive) -> Self {
        let material = value.render_material.as_deref();
        Self {
            base_color: material.map_or([1.0; 4], |value| value.base_color),
            custom_parameters: material
                .map_or([[0.0; 4]; MAX_SURFACE_SHADER_PARAMETERS], |value| {
                    value.custom_parameters
                }),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
enum UiStencilPipeline {
    Disabled,
    Test,
    Push,
    Pop,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
struct UiPipelineKey {
    blend: UiBlendMode,
    depth_test: bool,
    stencil: UiStencilPipeline,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
struct UiMaterialPipelineKey {
    state: UiPipelineKey,
    shader_fingerprint: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
struct UiMaterialSamplerKey {
    wrap_u: MaterialWrap,
    wrap_v: MaterialWrap,
    filter: MaterialFilter,
    mipmap_filter: MaterialFilter,
    anisotropy: u8,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
struct UiMaterialTextureSetKey {
    textures: [String; MAX_SURFACE_SHADER_TEXTURES],
    srgb: [bool; MAX_SURFACE_SHADER_TEXTURES],
    sampler: UiMaterialSamplerKey,
}

impl From<&UiRenderMaterial> for UiMaterialTextureSetKey {
    fn from(material: &UiRenderMaterial) -> Self {
        Self {
            textures: std::array::from_fn(|index| {
                material.custom_textures[index].trim().to_owned()
            }),
            srgb: material.custom_texture_srgb,
            sampler: UiMaterialSamplerKey {
                wrap_u: material.wrap_u,
                wrap_v: material.wrap_v,
                filter: material.filter,
                mipmap_filter: material.mipmap_filter,
                anisotropy: material.anisotropy.clamp(1, 16),
            },
        }
    }
}

pub(crate) struct UiRenderer {
    pipelines: HashMap<UiPipelineKey, wgpu::RenderPipeline>,
    custom_pipelines: HashMap<UiMaterialPipelineKey, wgpu::RenderPipeline>,
    error_pipelines: HashMap<UiPipelineKey, wgpu::RenderPipeline>,
    rejected_shaders: HashMap<u64, String>,
    pipeline_layout: wgpu::PipelineLayout,
    format: wgpu::TextureFormat,
    vertex_buffer: wgpu::Buffer,
    instance_buffer: wgpu::Buffer,
    soft_clip_buffer: wgpu::Buffer,
    shader_channel_buffer: wgpu::Buffer,
    material_buffer: wgpu::Buffer,
    instance_capacity: usize,
    shader_channel_capacity: usize,
    material_capacity: usize,
    uniform_buffer: wgpu::Buffer,
    bind_group_layout: wgpu::BindGroupLayout,
    bind_group: wgpu::BindGroup,
    texture_bind_group_layout: wgpu::BindGroupLayout,
    material_texture_bind_group_layout: wgpu::BindGroupLayout,
    sampler: wgpu::Sampler,
    fallback_texture: UiTextureGpu,
    textures: HashMap<String, UiTextureGpu>,
    material_color_textures: HashMap<String, UiTextureGpu>,
    material_data_textures: HashMap<String, UiTextureGpu>,
    material_samplers: HashMap<UiMaterialSamplerKey, wgpu::Sampler>,
    material_texture_sets: HashMap<UiMaterialTextureSetKey, wgpu::BindGroup>,
    fallback_material_texture_set: wgpu::BindGroup,
    supports_anisotropy: bool,
    viewport: [u32; 2],
    stats: UiFrameStats,
}

struct UiTextureGpu {
    _texture: wgpu::Texture,
    view: wgpu::TextureView,
    bind_group: wgpu::BindGroup,
}

impl UiRenderer {
    pub fn new(
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        format: wgpu::TextureFormat,
        width: u32,
        height: u32,
        supports_anisotropy: bool,
    ) -> Self {
        const VERTICES: [UiVertex; 6] = [
            UiVertex {
                position: [0.0, 0.0],
            },
            UiVertex {
                position: [1.0, 0.0],
            },
            UiVertex {
                position: [1.0, 1.0],
            },
            UiVertex {
                position: [0.0, 0.0],
            },
            UiVertex {
                position: [1.0, 1.0],
            },
            UiVertex {
                position: [0.0, 1.0],
            },
        ];
        let vertex_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("ui_quad_vertices"),
            contents: bytemuck::cast_slice(&VERTICES),
            usage: wgpu::BufferUsages::VERTEX,
        });
        let instance_capacity = 256;
        let instance_buffer = create_instance_buffer(device, instance_capacity);
        let soft_clip_buffer = create_soft_clip_buffer(device, instance_capacity);
        let shader_channel_capacity = 1;
        let shader_channel_buffer = create_shader_channel_buffer(device, shader_channel_capacity);
        let material_capacity = 1;
        let material_buffer = create_material_buffer(device, material_capacity);
        let uniform_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("ui_frame_uniform"),
            contents: bytemuck::bytes_of(&UiUniform {
                viewport: [width.max(1) as f32, height.max(1) as f32],
                _padding: [0.0; 2],
            }),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });
        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("ui_frame_bgl"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::VERTEX,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::VERTEX,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 3,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });
        let bind_group = create_frame_bind_group(
            device,
            &bind_group_layout,
            &uniform_buffer,
            &soft_clip_buffer,
            &shader_channel_buffer,
            &material_buffer,
        );
        let texture_bind_group_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("ui_texture_bgl"),
                entries: &[
                    wgpu::BindGroupLayoutEntry {
                        binding: 0,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Float { filterable: true },
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 1,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                        count: None,
                    },
                ],
            });
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("ui_linear_sampler"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::FilterMode::Nearest,
            ..Default::default()
        });
        let material_texture_bind_group_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("ui_material_textures_bgl"),
                entries: &[
                    material_texture_layout_entry(0),
                    material_texture_layout_entry(1),
                    material_texture_layout_entry(2),
                    material_texture_layout_entry(3),
                    wgpu::BindGroupLayoutEntry {
                        binding: 4,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                        count: None,
                    },
                ],
            });
        let fallback_texture = create_texture_rgba8(
            device,
            queue,
            &texture_bind_group_layout,
            &sampler,
            UiTextureUpload {
                label: "ui_white_texture",
                dimensions: [1, 1],
                rgba8: &[255, 255, 255, 255],
                srgb: true,
            },
        );
        let fallback_material_texture_set = create_ui_material_texture_set(
            device,
            &material_texture_bind_group_layout,
            std::array::from_fn(|_| &fallback_texture.view),
            &sampler,
        );
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("ui_instanced"),
            source: wgpu::ShaderSource::Wgsl(UI_WGSL.into()),
        });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("ui_pipeline_layout"),
            bind_group_layouts: &[
                &bind_group_layout,
                &texture_bind_group_layout,
                &material_texture_bind_group_layout,
            ],
            push_constant_ranges: &[],
        });
        let mut pipelines = HashMap::new();
        for blend in [
            UiBlendMode::Alpha,
            UiBlendMode::Premultiplied,
            UiBlendMode::Additive,
            UiBlendMode::Multiply,
        ] {
            for depth_test in [false, true] {
                for stencil in [UiStencilPipeline::Disabled, UiStencilPipeline::Test] {
                    let key = UiPipelineKey {
                        blend,
                        depth_test,
                        stencil,
                    };
                    pipelines.insert(
                        key,
                        create_ui_pipeline(device, &pipeline_layout, &shader, format, key),
                    );
                }
            }
        }
        for depth_test in [false, true] {
            for stencil in [UiStencilPipeline::Push, UiStencilPipeline::Pop] {
                let key = UiPipelineKey {
                    blend: UiBlendMode::Alpha,
                    depth_test,
                    stencil,
                };
                pipelines.insert(
                    key,
                    create_ui_pipeline(device, &pipeline_layout, &shader, format, key),
                );
            }
        }

        Self {
            pipelines,
            custom_pipelines: HashMap::new(),
            error_pipelines: HashMap::new(),
            rejected_shaders: HashMap::new(),
            pipeline_layout,
            format,
            vertex_buffer,
            instance_buffer,
            soft_clip_buffer,
            shader_channel_buffer,
            material_buffer,
            instance_capacity,
            shader_channel_capacity,
            material_capacity,
            uniform_buffer,
            bind_group_layout,
            bind_group,
            texture_bind_group_layout,
            material_texture_bind_group_layout,
            sampler,
            fallback_texture,
            textures: HashMap::new(),
            material_color_textures: HashMap::new(),
            material_data_textures: HashMap::new(),
            material_samplers: HashMap::new(),
            material_texture_sets: HashMap::new(),
            fallback_material_texture_set,
            supports_anisotropy,
            viewport: [width.max(1), height.max(1)],
            stats: UiFrameStats::default(),
        }
    }

    pub fn upload_texture_rgba8(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        key: &str,
        width: u32,
        height: u32,
        rgba8: &[u8],
    ) -> Result<(), UiTextureError> {
        validate_texture_rgba8(width, height, rgba8)?;
        let texture = create_texture_rgba8(
            device,
            queue,
            &self.texture_bind_group_layout,
            &self.sampler,
            UiTextureUpload {
                label: key,
                dimensions: [width, height],
                rgba8,
                srgb: true,
            },
        );
        self.textures.insert(key.to_owned(), texture);
        Ok(())
    }

    pub fn remove_texture(&mut self, key: &str) -> bool {
        self.textures.remove(key).is_some()
    }

    pub fn upload_material_texture_rgba8(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        key: &str,
        dimensions: [u32; 2],
        rgba8: &[u8],
        srgb: bool,
    ) -> Result<(), UiTextureError> {
        let [width, height] = dimensions;
        validate_texture_rgba8(width, height, rgba8)?;
        let texture = create_texture_rgba8(
            device,
            queue,
            &self.texture_bind_group_layout,
            &self.sampler,
            UiTextureUpload {
                label: "ui_material_texture",
                dimensions,
                rgba8,
                srgb,
            },
        );
        if srgb {
            self.material_color_textures.insert(key.to_owned(), texture);
        } else {
            self.material_data_textures.insert(key.to_owned(), texture);
        }
        self.material_texture_sets.clear();
        Ok(())
    }

    pub fn remove_material_texture(&mut self, key: &str, srgb: bool) -> bool {
        let removed = if srgb {
            self.material_color_textures.remove(key).is_some()
        } else {
            self.material_data_textures.remove(key).is_some()
        };
        if removed {
            self.material_texture_sets.clear();
        }
        removed
    }

    pub fn resize(&mut self, queue: &wgpu::Queue, width: u32, height: u32) {
        self.viewport = [width.max(1), height.max(1)];
        self.write_uniform(queue);
    }

    pub fn prepare(&mut self, device: &wgpu::Device, queue: &wgpu::Queue, plan: &UiBatchPlan) {
        let mut recreate_bind_group = false;
        if plan.primitives.len() > self.instance_capacity {
            self.instance_capacity = plan.primitives.len().next_power_of_two();
            self.instance_buffer = create_instance_buffer(device, self.instance_capacity);
            self.soft_clip_buffer = create_soft_clip_buffer(device, self.instance_capacity);
            recreate_bind_group = true;
        }
        let needs_shader_channels = plan
            .primitives
            .iter()
            .any(|value| value.key.shader_channels.bits() != 0);
        let needs_materials = plan
            .primitives
            .iter()
            .any(|value| value.render_material.is_some());
        if needs_shader_channels && plan.primitives.len() > self.shader_channel_capacity {
            self.shader_channel_capacity = plan.primitives.len().next_power_of_two();
            self.shader_channel_buffer =
                create_shader_channel_buffer(device, self.shader_channel_capacity);
            recreate_bind_group = true;
        }
        if needs_materials && plan.primitives.len() > self.material_capacity {
            self.material_capacity = plan.primitives.len().next_power_of_two();
            self.material_buffer = create_material_buffer(device, self.material_capacity);
            recreate_bind_group = true;
        }
        if recreate_bind_group {
            self.bind_group = create_frame_bind_group(
                device,
                &self.bind_group_layout,
                &self.uniform_buffer,
                &self.soft_clip_buffer,
                &self.shader_channel_buffer,
                &self.material_buffer,
            );
        }
        if !plan.primitives.is_empty() {
            let instances: Vec<UiInstance> = plan.primitives.iter().map(UiInstance::from).collect();
            queue.write_buffer(&self.instance_buffer, 0, bytemuck::cast_slice(&instances));
            let soft_clips: Vec<UiSoftClipInstance> = plan
                .primitives
                .iter()
                .map(UiSoftClipInstance::from)
                .collect();
            queue.write_buffer(&self.soft_clip_buffer, 0, bytemuck::cast_slice(&soft_clips));
            if needs_shader_channels {
                let shader_channels: Vec<UiShaderChannelInstance> = plan
                    .primitives
                    .iter()
                    .map(UiShaderChannelInstance::from)
                    .collect();
                queue.write_buffer(
                    &self.shader_channel_buffer,
                    0,
                    bytemuck::cast_slice(&shader_channels),
                );
            }
            if needs_materials {
                let materials: Vec<UiMaterialInstance> = plan
                    .primitives
                    .iter()
                    .map(UiMaterialInstance::from)
                    .collect();
                queue.write_buffer(&self.material_buffer, 0, bytemuck::cast_slice(&materials));
            }
        }
        let mut live_pipelines = HashSet::new();
        let mut live_shader_fingerprints = HashSet::new();
        let mut live_texture_sets = HashSet::new();
        let mut live_samplers = HashSet::new();
        for batch in &plan.batches {
            let material = plan.primitives[batch.start as usize]
                .render_material
                .as_ref()
                .map(Arc::clone);
            if let Some(material) = material {
                if !material.is_error && !self.material_has_missing_textures(&material) {
                    let texture_set = UiMaterialTextureSetKey::from(material.as_ref());
                    live_samplers.insert(texture_set.sampler);
                    live_texture_sets.insert(texture_set);
                    let fingerprint = ui_shader_fingerprint(&material.shader, &material.keywords);
                    if fingerprint != 0 {
                        live_shader_fingerprints.insert(fingerprint);
                        live_pipelines.insert(UiMaterialPipelineKey {
                            state: ui_pipeline_state(&batch.key),
                            shader_fingerprint: fingerprint,
                        });
                    }
                }
                if !material.is_error {
                    self.ensure_material_texture_set(device, &material);
                }
                self.ensure_material_pipeline(device, batch, &material);
            }
        }
        self.custom_pipelines
            .retain(|key, _| live_pipelines.contains(key));
        self.rejected_shaders
            .retain(|fingerprint, _| live_shader_fingerprints.contains(fingerprint));
        self.material_texture_sets
            .retain(|key, _| live_texture_sets.contains(key));
        self.material_samplers
            .retain(|key, _| live_samplers.contains(key));
        self.write_uniform(queue);
        self.stats = UiFrameStats {
            primitives: plan.primitives.len() as u32,
            batches: plan.batches.len() as u32,
            draw_calls: plan
                .batches
                .iter()
                .filter(|batch| {
                    batch.key.clip.is_none_or(|clip| {
                        clip.x < self.viewport[0]
                            && clip.y < self.viewport[1]
                            && clip.width > 0
                            && clip.height > 0
                    })
                })
                .count() as u32,
        };
    }

    fn write_uniform(&self, queue: &wgpu::Queue) {
        queue.write_buffer(
            &self.uniform_buffer,
            0,
            bytemuck::bytes_of(&UiUniform {
                viewport: [self.viewport[0] as f32, self.viewport[1] as f32],
                _padding: [0.0; 2],
            }),
        );
    }

    fn ensure_material_pipeline(
        &mut self,
        device: &wgpu::Device,
        batch: &UiBatch,
        material: &UiRenderMaterial,
    ) {
        let state = ui_pipeline_state(&batch.key);
        if material.is_error || self.material_has_missing_textures(material) {
            self.ensure_error_pipeline(device, state);
            return;
        }
        let fingerprint = ui_shader_fingerprint(&material.shader, &material.keywords);
        if fingerprint == 0 {
            self.ensure_error_pipeline(device, state);
            return;
        }
        let key = UiMaterialPipelineKey {
            state,
            shader_fingerprint: fingerprint,
        };
        if self.custom_pipelines.contains_key(&key)
            || self.rejected_shaders.contains_key(&fingerprint)
        {
            if self.rejected_shaders.contains_key(&fingerprint) {
                self.ensure_error_pipeline(device, state);
            }
            return;
        }
        let source = match compose_ui_shader(&material.shader, Some(&material.keywords)) {
            Ok(source) => source,
            Err(error) => {
                log::warn!("UI shader rejected: {error}");
                self.rejected_shaders.insert(fingerprint, error);
                self.ensure_error_pipeline(device, state);
                return;
            }
        };
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("custom_ui_material"),
            source: wgpu::ShaderSource::Wgsl(source.into()),
        });
        self.custom_pipelines.insert(
            key,
            create_ui_pipeline(device, &self.pipeline_layout, &shader, self.format, state),
        );
    }

    fn ensure_error_pipeline(&mut self, device: &wgpu::Device, state: UiPipelineKey) {
        if self.error_pipelines.contains_key(&state) {
            return;
        }
        let source = compose_ui_shader(ERROR_UI_SHADER_HOOK, None)
            .expect("engine error UI Shader must remain valid");
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("error_ui_material"),
            source: wgpu::ShaderSource::Wgsl(source.into()),
        });
        self.error_pipelines.insert(
            state,
            create_ui_pipeline(device, &self.pipeline_layout, &shader, self.format, state),
        );
    }

    fn material_has_missing_textures(&self, material: &UiRenderMaterial) -> bool {
        material
            .custom_textures
            .iter()
            .zip(material.custom_texture_srgb)
            .any(|(key, srgb)| {
                let key = key.trim();
                !key.is_empty()
                    && if srgb {
                        !self.material_color_textures.contains_key(key)
                    } else {
                        !self.material_data_textures.contains_key(key)
                    }
            })
    }

    fn ensure_material_texture_set(&mut self, device: &wgpu::Device, material: &UiRenderMaterial) {
        if self.material_has_missing_textures(material) {
            return;
        }
        let key = UiMaterialTextureSetKey::from(material);
        if self.material_texture_sets.contains_key(&key) {
            return;
        }
        self.material_samplers
            .entry(key.sampler)
            .or_insert_with(|| {
                create_ui_material_sampler(device, key.sampler, self.supports_anisotropy)
            });
        let views = std::array::from_fn(|index| {
            let texture = key.textures[index].trim();
            if texture.is_empty() {
                &self.fallback_texture.view
            } else if key.srgb[index] {
                &self.material_color_textures[texture].view
            } else {
                &self.material_data_textures[texture].view
            }
        });
        let bind_group = create_ui_material_texture_set(
            device,
            &self.material_texture_bind_group_layout,
            views,
            &self.material_samplers[&key.sampler],
        );
        self.material_texture_sets.insert(key, bind_group);
    }

    pub fn draw<'pass>(&'pass self, pass: &mut wgpu::RenderPass<'pass>, plan: &UiBatchPlan) {
        if plan.is_empty() {
            return;
        }
        pass.set_bind_group(0, &self.bind_group, &[]);
        pass.set_vertex_buffer(0, self.vertex_buffer.slice(..));
        pass.set_vertex_buffer(1, self.instance_buffer.slice(..));
        for batch in &plan.batches {
            let pipeline_key = ui_pipeline_state(&batch.key);
            let material = plan.primitives[batch.start as usize]
                .render_material
                .as_deref();
            let custom_fingerprint = material
                .map(|value| ui_shader_fingerprint(&value.shader, &value.keywords))
                .unwrap_or(0);
            let use_error = material.is_some_and(|value| {
                value.is_error
                    || custom_fingerprint == 0
                    || self.rejected_shaders.contains_key(&custom_fingerprint)
                    || self.material_has_missing_textures(value)
            });
            let pipeline = if use_error {
                &self.error_pipelines[&pipeline_key]
            } else if let Some(material) = material {
                &self.custom_pipelines[&UiMaterialPipelineKey {
                    state: pipeline_key,
                    shader_fingerprint: ui_shader_fingerprint(&material.shader, &material.keywords),
                }]
            } else {
                self.pipelines
                    .get(&pipeline_key)
                    .expect("all built-in UI pipeline variants are created at startup")
            };
            pass.set_pipeline(pipeline);
            pass.set_stencil_reference(batch.key.stencil.reference());
            let texture = self
                .textures
                .get(&batch.key.texture)
                .unwrap_or(&self.fallback_texture);
            pass.set_bind_group(1, &texture.bind_group, &[]);
            let material_texture_set = if use_error {
                &self.fallback_material_texture_set
            } else if let Some(material) = material {
                &self.material_texture_sets[&UiMaterialTextureSetKey::from(material)]
            } else {
                &self.fallback_material_texture_set
            };
            pass.set_bind_group(2, material_texture_set, &[]);
            if let Some(clip) = batch.key.clip {
                let x = clip.x.min(self.viewport[0]);
                let y = clip.y.min(self.viewport[1]);
                let width = clip.width.min(self.viewport[0].saturating_sub(x));
                let height = clip.height.min(self.viewport[1].saturating_sub(y));
                if width == 0 || height == 0 {
                    continue;
                }
                pass.set_scissor_rect(x, y, width, height);
            } else {
                pass.set_scissor_rect(0, 0, self.viewport[0], self.viewport[1]);
            }
            pass.draw(0..6, batch.start..batch.end);
        }
    }

    pub fn stats(&self) -> UiFrameStats {
        self.stats
    }
}

fn additive_blend_state() -> wgpu::BlendState {
    wgpu::BlendState {
        color: wgpu::BlendComponent {
            src_factor: wgpu::BlendFactor::SrcAlpha,
            dst_factor: wgpu::BlendFactor::One,
            operation: wgpu::BlendOperation::Add,
        },
        alpha: wgpu::BlendComponent {
            src_factor: wgpu::BlendFactor::One,
            dst_factor: wgpu::BlendFactor::One,
            operation: wgpu::BlendOperation::Add,
        },
    }
}

fn premultiplied_blend_state() -> wgpu::BlendState {
    wgpu::BlendState {
        color: wgpu::BlendComponent {
            src_factor: wgpu::BlendFactor::One,
            dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
            operation: wgpu::BlendOperation::Add,
        },
        alpha: wgpu::BlendComponent {
            src_factor: wgpu::BlendFactor::One,
            dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
            operation: wgpu::BlendOperation::Add,
        },
    }
}

fn multiply_blend_state() -> wgpu::BlendState {
    wgpu::BlendState {
        color: wgpu::BlendComponent {
            src_factor: wgpu::BlendFactor::Dst,
            dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
            operation: wgpu::BlendOperation::Add,
        },
        alpha: wgpu::BlendComponent {
            src_factor: wgpu::BlendFactor::Zero,
            dst_factor: wgpu::BlendFactor::One,
            operation: wgpu::BlendOperation::Add,
        },
    }
}

fn ui_pipeline_state(key: &UiBatchKey) -> UiPipelineKey {
    UiPipelineKey {
        blend: if matches!(
            key.stencil,
            UiStencilMode::Push { .. } | UiStencilMode::Pop { .. }
        ) {
            UiBlendMode::Alpha
        } else {
            key.blend
        },
        depth_test: key.depth_test,
        stencil: key.stencil.pipeline(),
    }
}

fn create_ui_pipeline(
    device: &wgpu::Device,
    layout: &wgpu::PipelineLayout,
    shader: &wgpu::ShaderModule,
    format: wgpu::TextureFormat,
    key: UiPipelineKey,
) -> wgpu::RenderPipeline {
    let (compare, pass_op, color_write) = match key.stencil {
        UiStencilPipeline::Disabled => (
            wgpu::CompareFunction::Always,
            wgpu::StencilOperation::Keep,
            true,
        ),
        UiStencilPipeline::Test => (
            wgpu::CompareFunction::Equal,
            wgpu::StencilOperation::Keep,
            true,
        ),
        UiStencilPipeline::Push => (
            wgpu::CompareFunction::Equal,
            wgpu::StencilOperation::IncrementClamp,
            false,
        ),
        UiStencilPipeline::Pop => (
            wgpu::CompareFunction::Equal,
            wgpu::StencilOperation::DecrementClamp,
            false,
        ),
    };
    let stencil_face = wgpu::StencilFaceState {
        compare,
        fail_op: wgpu::StencilOperation::Keep,
        depth_fail_op: wgpu::StencilOperation::Keep,
        pass_op,
    };
    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some(match (key.depth_test, key.stencil) {
            (_, UiStencilPipeline::Push) => "ui_stencil_push",
            (_, UiStencilPipeline::Pop) => "ui_stencil_pop",
            (true, UiStencilPipeline::Test) => "ui_depth_stencil_test",
            (false, UiStencilPipeline::Test) => "ui_stencil_test",
            (true, UiStencilPipeline::Disabled) => "ui_depth",
            (false, UiStencilPipeline::Disabled) => "ui_overlay",
        }),
        layout: Some(layout),
        vertex: wgpu::VertexState {
            module: shader,
            entry_point: Some("vs_main"),
            buffers: &[
                wgpu::VertexBufferLayout {
                    array_stride: std::mem::size_of::<UiVertex>() as u64,
                    step_mode: wgpu::VertexStepMode::Vertex,
                    attributes: &wgpu::vertex_attr_array![0 => Float32x2],
                },
                wgpu::VertexBufferLayout {
                    array_stride: std::mem::size_of::<UiInstance>() as u64,
                    step_mode: wgpu::VertexStepMode::Instance,
                    attributes: &wgpu::vertex_attr_array![
                        1 => Float32x4, 2 => Float32x4, 3 => Float32x4, 4 => Float32x4,
                        5 => Float32x4, 6 => Float32x4, 7 => Float32x4, 8 => Float32x4,
                        9 => Float32x4, 10 => Float32x4, 11 => Float32x4
                    ],
                },
            ],
            compilation_options: Default::default(),
        },
        fragment: Some(wgpu::FragmentState {
            module: shader,
            entry_point: Some("fs_main"),
            targets: &[Some(wgpu::ColorTargetState {
                format,
                blend: Some(match key.blend {
                    UiBlendMode::Alpha => wgpu::BlendState::ALPHA_BLENDING,
                    UiBlendMode::Premultiplied => premultiplied_blend_state(),
                    UiBlendMode::Additive => additive_blend_state(),
                    UiBlendMode::Multiply => multiply_blend_state(),
                }),
                write_mask: if color_write {
                    wgpu::ColorWrites::ALL
                } else {
                    wgpu::ColorWrites::empty()
                },
            })],
            compilation_options: Default::default(),
        }),
        primitive: wgpu::PrimitiveState {
            topology: wgpu::PrimitiveTopology::TriangleList,
            cull_mode: None,
            ..Default::default()
        },
        depth_stencil: Some(wgpu::DepthStencilState {
            format: wgpu::TextureFormat::Depth24PlusStencil8,
            depth_write_enabled: false,
            depth_compare: if key.depth_test {
                wgpu::CompareFunction::LessEqual
            } else {
                wgpu::CompareFunction::Always
            },
            stencil: wgpu::StencilState {
                front: stencil_face,
                back: stencil_face,
                read_mask: 0xff,
                write_mask: if matches!(
                    key.stencil,
                    UiStencilPipeline::Push | UiStencilPipeline::Pop
                ) {
                    0xff
                } else {
                    0
                },
            },
            bias: Default::default(),
        }),
        multisample: wgpu::MultisampleState::default(),
        multiview: None,
        cache: None,
    })
}

fn validate_texture_rgba8(width: u32, height: u32, rgba8: &[u8]) -> Result<(), UiTextureError> {
    if width == 0 || height == 0 {
        return Err(UiTextureError::EmptyDimensions);
    }
    let expected = width as usize * height as usize * 4;
    if rgba8.len() != expected {
        return Err(UiTextureError::InvalidDataLength {
            expected,
            actual: rgba8.len(),
        });
    }
    Ok(())
}

struct UiTextureUpload<'a> {
    label: &'a str,
    dimensions: [u32; 2],
    rgba8: &'a [u8],
    srgb: bool,
}

fn create_texture_rgba8(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    layout: &wgpu::BindGroupLayout,
    sampler: &wgpu::Sampler,
    upload: UiTextureUpload<'_>,
) -> UiTextureGpu {
    let UiTextureUpload {
        label,
        dimensions: [width, height],
        rgba8,
        srgb,
    } = upload;
    let size = wgpu::Extent3d {
        width,
        height,
        depth_or_array_layers: 1,
    };
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some(label),
        size,
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: if srgb {
            wgpu::TextureFormat::Rgba8UnormSrgb
        } else {
            wgpu::TextureFormat::Rgba8Unorm
        },
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    });
    queue.write_texture(
        wgpu::TexelCopyTextureInfo {
            texture: &texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        rgba8,
        wgpu::TexelCopyBufferLayout {
            offset: 0,
            bytes_per_row: Some(width * 4),
            rows_per_image: Some(height),
        },
        size,
    );
    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
    let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some(&format!("{label}_bg")),
        layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::TextureView(&view),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: wgpu::BindingResource::Sampler(sampler),
            },
        ],
    });
    UiTextureGpu {
        _texture: texture,
        view,
        bind_group,
    }
}

fn create_instance_buffer(device: &wgpu::Device, capacity: usize) -> wgpu::Buffer {
    device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("ui_instances"),
        size: (capacity.max(1) * std::mem::size_of::<UiInstance>()) as u64,
        usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    })
}

fn create_soft_clip_buffer(device: &wgpu::Device, capacity: usize) -> wgpu::Buffer {
    device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("ui_soft_clips"),
        size: (capacity.max(1) * std::mem::size_of::<UiSoftClipInstance>()) as u64,
        usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    })
}

fn create_shader_channel_buffer(device: &wgpu::Device, capacity: usize) -> wgpu::Buffer {
    device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("ui_shader_channels"),
        size: (capacity.max(1) * std::mem::size_of::<UiShaderChannelInstance>()) as u64,
        usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    })
}

fn create_material_buffer(device: &wgpu::Device, capacity: usize) -> wgpu::Buffer {
    device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("ui_material_instances"),
        size: (capacity.max(1) * std::mem::size_of::<UiMaterialInstance>()) as u64,
        usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    })
}

fn create_frame_bind_group(
    device: &wgpu::Device,
    layout: &wgpu::BindGroupLayout,
    uniform_buffer: &wgpu::Buffer,
    soft_clip_buffer: &wgpu::Buffer,
    shader_channel_buffer: &wgpu::Buffer,
    material_buffer: &wgpu::Buffer,
) -> wgpu::BindGroup {
    device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("ui_frame_bg"),
        layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: uniform_buffer.as_entire_binding(),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: soft_clip_buffer.as_entire_binding(),
            },
            wgpu::BindGroupEntry {
                binding: 2,
                resource: shader_channel_buffer.as_entire_binding(),
            },
            wgpu::BindGroupEntry {
                binding: 3,
                resource: material_buffer.as_entire_binding(),
            },
        ],
    })
}

fn material_texture_layout_entry(binding: u32) -> wgpu::BindGroupLayoutEntry {
    wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::FRAGMENT,
        ty: wgpu::BindingType::Texture {
            sample_type: wgpu::TextureSampleType::Float { filterable: true },
            view_dimension: wgpu::TextureViewDimension::D2,
            multisampled: false,
        },
        count: None,
    }
}

fn create_ui_material_texture_set(
    device: &wgpu::Device,
    layout: &wgpu::BindGroupLayout,
    views: [&wgpu::TextureView; MAX_SURFACE_SHADER_TEXTURES],
    sampler: &wgpu::Sampler,
) -> wgpu::BindGroup {
    device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("ui_material_textures_bg"),
        layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::TextureView(views[0]),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: wgpu::BindingResource::TextureView(views[1]),
            },
            wgpu::BindGroupEntry {
                binding: 2,
                resource: wgpu::BindingResource::TextureView(views[2]),
            },
            wgpu::BindGroupEntry {
                binding: 3,
                resource: wgpu::BindingResource::TextureView(views[3]),
            },
            wgpu::BindGroupEntry {
                binding: 4,
                resource: wgpu::BindingResource::Sampler(sampler),
            },
        ],
    })
}

fn create_ui_material_sampler(
    device: &wgpu::Device,
    key: UiMaterialSamplerKey,
    supports_anisotropy: bool,
) -> wgpu::Sampler {
    let filter = match key.filter {
        MaterialFilter::Nearest => wgpu::FilterMode::Nearest,
        MaterialFilter::Linear => wgpu::FilterMode::Linear,
    };
    let mipmap_filter = match key.mipmap_filter {
        MaterialFilter::Nearest => wgpu::FilterMode::Nearest,
        MaterialFilter::Linear => wgpu::FilterMode::Linear,
    };
    device.create_sampler(&wgpu::SamplerDescriptor {
        label: Some("ui_material_sampler"),
        address_mode_u: ui_material_address_mode(key.wrap_u),
        address_mode_v: ui_material_address_mode(key.wrap_v),
        address_mode_w: wgpu::AddressMode::ClampToEdge,
        mag_filter: filter,
        min_filter: filter,
        mipmap_filter,
        anisotropy_clamp: if supports_anisotropy
            && filter == wgpu::FilterMode::Linear
            && mipmap_filter == wgpu::FilterMode::Linear
        {
            u16::from(key.anisotropy.clamp(1, 16))
        } else {
            1
        },
        ..Default::default()
    })
}

fn ui_material_address_mode(wrap: MaterialWrap) -> wgpu::AddressMode {
    match wrap {
        MaterialWrap::Repeat => wgpu::AddressMode::Repeat,
        MaterialWrap::Clamp => wgpu::AddressMode::ClampToEdge,
        MaterialWrap::Mirror => wgpu::AddressMode::MirrorRepeat,
    }
}

const UI_HOOK_BEGIN: &str = "// MENGINE_UI_HOOK_BEGIN";
const UI_HOOK_END: &str = "// MENGINE_UI_HOOK_END";
const ERROR_UI_SHADER_HOOK: &str = r#"fn mengine_ui_hook(input: MEngineUiInput) -> vec4<f32> {
    let cell = floor(input.screen_position / vec2<f32>(8.0));
    let checker = (u32(cell.x) + u32(cell.y)) & 1u;
    let intensity = select(0.12, 1.0, checker == 0u);
    return vec4<f32>(intensity, 0.0, intensity, 1.0);
}"#;

pub fn validate_ui_shader_hook(source: &str) -> Result<(), String> {
    compose_ui_shader(source, None).map(|_| ())
}

fn compose_ui_shader(source: &str, active_keywords: Option<&[String]>) -> Result<String, String> {
    let hook = source.trim();
    if hook.is_empty() {
        return Err("UI shader source is empty".into());
    }
    for forbidden in ["@group", "@binding", "@vertex", "@fragment", "@compute"] {
        if hook.contains(forbidden) {
            return Err(format!(
                "UI hook cannot declare engine bindings or entry points ({forbidden})"
            ));
        }
    }
    let compact = hook
        .chars()
        .filter(|character| !character.is_whitespace())
        .collect::<String>();
    if !compact.contains("fnmengine_ui_hook(") {
        return Err("UI shader must define mengine_ui_hook".into());
    }
    let schema = parse_surface_shader_schema(hook)?;
    let enabled_keywords = if let Some(active_keywords) = active_keywords {
        let declared = schema
            .keywords
            .iter()
            .map(|keyword| keyword.name.as_str())
            .collect::<HashSet<_>>();
        let mut enabled = HashSet::new();
        for keyword in active_keywords {
            if !declared.contains(keyword.as_str()) {
                return Err(format!(
                    "material keyword '{keyword}' is not declared by its UI Shader"
                ));
            }
            if !enabled.insert(keyword.clone()) {
                return Err(format!("duplicate enabled material keyword '{keyword}'"));
            }
        }
        enabled
    } else {
        schema
            .keywords
            .iter()
            .filter(|keyword| keyword.default)
            .map(|keyword| keyword.name.clone())
            .collect::<HashSet<_>>()
    };
    let parameter_helpers = schema
        .parameters
        .iter()
        .enumerate()
        .map(|(index, parameter)| {
            format!(
                "fn mengine_param_{}(instance_index: u32) -> {} {{ return ui_material_instances[instance_index].custom_parameters[{}u]{}; }}",
                parameter.name,
                parameter.parameter_type.wgsl_type(),
                index,
                parameter.parameter_type.wgsl_swizzle(),
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    let keyword_helpers = schema
        .keywords
        .iter()
        .map(|keyword| {
            format!(
                "fn mengine_keyword_{}() -> bool {{ return {}; }}",
                keyword.name,
                enabled_keywords.contains(&keyword.name)
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    let texture_helpers = schema
        .textures
        .iter()
        .enumerate()
        .map(|(index, texture)| {
            format!(
                "fn mengine_texture_{}(uv: vec2<f32>) -> vec4<f32> {{ return textureSample(mengine_custom_texture_{index}, ui_material_sampler, uv); }}",
                texture.name,
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    let start = UI_WGSL
        .find(UI_HOOK_BEGIN)
        .ok_or_else(|| "engine UI-hook start marker is missing".to_owned())?;
    let end = UI_WGSL
        .find(UI_HOOK_END)
        .map(|index| index + UI_HOOK_END.len())
        .ok_or_else(|| "engine UI-hook end marker is missing".to_owned())?;
    let mut composed = UI_WGSL.to_owned();
    composed.replace_range(
        start..end,
        &format!(
            "{UI_HOOK_BEGIN}\n{parameter_helpers}\n{keyword_helpers}\n{texture_helpers}\n{hook}\n{UI_HOOK_END}"
        ),
    );
    let module = naga::front::wgsl::parse_str(&composed)
        .map_err(|error| format!("WGSL parse failed: {error}"))?;
    naga::valid::Validator::new(
        naga::valid::ValidationFlags::all(),
        naga::valid::Capabilities::all(),
    )
    .validate(&module)
    .map_err(|error| format!("WGSL validation failed: {error}: {error:?}"))?;
    Ok(composed)
}

fn ui_shader_fingerprint(source: &str, keywords: &[String]) -> u64 {
    if source.trim().is_empty() {
        return 0;
    }
    let mut hasher = DefaultHasher::new();
    source.hash(&mut hasher);
    let mut canonical_keywords = keywords.to_vec();
    canonical_keywords.sort();
    canonical_keywords.dedup();
    canonical_keywords.hash(&mut hasher);
    let value = hasher.finish();
    if value == 0 {
        1
    } else {
        value
    }
}

const UI_WGSL: &str = r#"
struct UiFrame {
    viewport: vec2<f32>,
    padding: vec2<f32>,
};
@group(0) @binding(0) var<uniform> frame: UiFrame;
struct UiSoftClip {
    rect: vec4<f32>,
    softness: vec4<f32>,
};
struct UiSoftClipInstance {
    clips: array<UiSoftClip, 8>,
};
@group(0) @binding(1) var<storage, read> soft_clip_instances: array<UiSoftClipInstance>;
struct UiShaderChannelInstance {
    channel_mask: vec4<u32>,
    uv1: array<vec4<f32>, 4>,
    uv2: array<vec4<f32>, 4>,
    uv3: array<vec4<f32>, 4>,
    normals: array<vec4<f32>, 4>,
    tangents: array<vec4<f32>, 4>,
};
@group(0) @binding(2) var<storage, read> shader_channel_instances: array<UiShaderChannelInstance>;
struct UiMaterialInstance {
    base_color: vec4<f32>,
    custom_parameters: array<vec4<f32>, 16>,
};
@group(0) @binding(3) var<storage, read> ui_material_instances: array<UiMaterialInstance>;
@group(1) @binding(0) var ui_texture: texture_2d<f32>;
@group(1) @binding(1) var ui_sampler: sampler;
@group(2) @binding(0) var mengine_custom_texture_0: texture_2d<f32>;
@group(2) @binding(1) var mengine_custom_texture_1: texture_2d<f32>;
@group(2) @binding(2) var mengine_custom_texture_2: texture_2d<f32>;
@group(2) @binding(3) var mengine_custom_texture_3: texture_2d<f32>;
@group(2) @binding(4) var ui_material_sampler: sampler;

struct VsIn {
    @builtin(instance_index) instance_index: u32,
    @location(0) position: vec2<f32>,
    @location(1) rect: vec4<f32>,
    @location(2) color: vec4<f32>,
    @location(3) transform: vec4<f32>,
    @location(4) uv_rect: vec4<f32>,
    @location(5) projection: vec4<f32>,
    @location(6) corner_top_left: vec4<f32>,
    @location(7) corner_top_right: vec4<f32>,
    @location(8) corner_bottom_right: vec4<f32>,
    @location(9) corner_bottom_left: vec4<f32>,
    @location(10) vertex_x: vec4<f32>,
    @location(11) vertex_y: vec4<f32>,
};

struct VsOut {
    @builtin(position) clip: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) alpha_clip: f32,
    @location(3) @interpolate(flat) instance_index: u32,
    @location(4) uv1: vec4<f32>,
    @location(5) uv2: vec4<f32>,
    @location(6) uv3: vec4<f32>,
    @location(7) normal: vec3<f32>,
    @location(8) tangent: vec4<f32>,
    @location(9) @interpolate(flat) shader_channels: u32,
};

struct MEngineUiInput {
    vertex_color: vec4<f32>,
    uv0: vec2<f32>,
    uv1: vec4<f32>,
    uv2: vec4<f32>,
    uv3: vec4<f32>,
    normal: vec3<f32>,
    tangent: vec4<f32>,
    screen_position: vec2<f32>,
    shader_channels: u32,
    instance_index: u32,
};

fn mengine_ui_main_texture(uv: vec2<f32>) -> vec4<f32> {
    return textureSample(ui_texture, ui_sampler, uv);
}

fn mengine_ui_material_color(instance_index: u32) -> vec4<f32> {
    return ui_material_instances[instance_index].base_color;
}

// MENGINE_UI_HOOK_BEGIN
fn mengine_ui_hook(input: MEngineUiInput) -> vec4<f32> {
    return mengine_ui_main_texture(input.uv0) * input.vertex_color;
}
// MENGINE_UI_HOOK_END

@vertex
fn vs_main(input: VsIn) -> VsOut {
    let vertex_top = mix(
        vec2<f32>(input.vertex_x.x, input.vertex_y.x),
        vec2<f32>(input.vertex_x.y, input.vertex_y.y),
        input.position.x,
    );
    let vertex_bottom = mix(
        vec2<f32>(input.vertex_x.w, input.vertex_y.w),
        vec2<f32>(input.vertex_x.z, input.vertex_y.z),
        input.position.x,
    );
    let vertex_position = mix(vertex_top, vertex_bottom, input.position.y);
    let pivot = input.transform.yz;
    let local = (vertex_position - pivot) * input.rect.zw;
    let c = cos(input.transform.x);
    let s = sin(input.transform.x);
    let rotated = vec2<f32>(local.x * c - local.y * s, local.x * s + local.y * c);
    let pixel = input.rect.xy + pivot * input.rect.zw + rotated;
    let ndc = vec2<f32>(pixel.x / frame.viewport.x * 2.0 - 1.0, 1.0 - pixel.y / frame.viewport.y * 2.0);
    var output: VsOut;
    if input.projection.y > 0.5 {
        let top = mix(input.corner_top_left, input.corner_top_right, vertex_position.x);
        let bottom = mix(input.corner_bottom_left, input.corner_bottom_right, vertex_position.x);
        output.clip = mix(top, bottom, vertex_position.y);
    } else {
        output.clip = vec4<f32>(ndc, input.projection.x, 1.0);
    }
    output.color = input.color;
    output.uv = input.uv_rect.xy + vertex_position * input.uv_rect.zw;
    output.alpha_clip = input.projection.z;
    output.instance_index = input.instance_index;
    let channels = u32(input.projection.w);
    output.uv1 = vec4<f32>(0.0);
    output.uv2 = vec4<f32>(0.0);
    output.uv3 = vec4<f32>(0.0);
    output.normal = vec3<f32>(0.0);
    output.tangent = vec4<f32>(0.0);
    if channels != 0u {
        let channel_data = shader_channel_instances[input.instance_index];
        let vertex_slot = select(
            u32(input.position.x),
            3u - u32(input.position.x),
            input.position.y > 0.5,
        );
        output.uv1 = select(output.uv1, channel_data.uv1[vertex_slot], (channels & 1u) != 0u);
        output.uv2 = select(output.uv2, channel_data.uv2[vertex_slot], (channels & 2u) != 0u);
        output.uv3 = select(output.uv3, channel_data.uv3[vertex_slot], (channels & 4u) != 0u);
        output.normal = select(output.normal, channel_data.normals[vertex_slot].xyz, (channels & 8u) != 0u);
        output.tangent = select(output.tangent, channel_data.tangents[vertex_slot], (channels & 16u) != 0u);
    }
    output.shader_channels = channels;
    return output;
}

@fragment
fn fs_main(input: VsOut) -> @location(0) vec4<f32> {
    var color = mengine_ui_hook(MEngineUiInput(
        input.color,
        input.uv,
        input.uv1,
        input.uv2,
        input.uv3,
        input.normal,
        input.tangent,
        input.clip.xy,
        input.shader_channels,
        input.instance_index,
    ));
    if input.alpha_clip > 0.5 && color.a <= 0.001 {
        discard;
    }
    var clip_alpha = 1.0;
    for (var index = 0u; index < 8u; index = index + 1u) {
        let clip = soft_clip_instances[input.instance_index].clips[index];
        if clip.softness.z > 0.5 {
            let distance = min(
                input.clip.xy - clip.rect.xy,
                clip.rect.xy + clip.rect.zw - input.clip.xy,
            );
            if distance.x <= 0.0 || distance.y <= 0.0 {
                discard;
            }
            let horizontal = select(1.0, clamp(distance.x / max(clip.softness.x, 0.000001), 0.0, 1.0), clip.softness.x > 0.0);
            let vertical = select(1.0, clamp(distance.y / max(clip.softness.y, 0.000001), 0.0, 1.0), clip.softness.y > 0.0);
            clip_alpha = clip_alpha * horizontal * vertical;
        }
    }
    color.a = color.a * clip_alpha;
    return color;
}
"#;

#[cfg(test)]
mod tests {
    use super::*;

    fn primitive(texture: &str, clip: Option<UiClipRect>) -> UiPrimitive {
        let mut primitive = UiPrimitive::solid([0.0, 0.0, 10.0, 10.0], [1.0; 4]);
        primitive.key.texture = texture.into();
        primitive.key.clip = clip;
        primitive
    }

    #[test]
    fn merges_only_adjacent_compatible_primitives() {
        let plan = UiBatchPlan::build(vec![
            primitive("atlas", None),
            primitive("atlas", None),
            primitive("other", None),
            primitive("atlas", None),
        ]);
        assert_eq!(plan.batches.len(), 3);
        assert_eq!((plan.batches[0].start, plan.batches[0].end), (0, 2));
        assert_eq!((plan.batches[2].start, plan.batches[2].end), (3, 4));
    }

    #[test]
    fn canvas_batching_joins_non_overlapping_compatible_primitives() {
        let mut first = primitive("atlas", None);
        first.key.canvas_group = Some(1);
        first.canvas_sorting_grid_size = Some(0.1);
        first.rect = [0.0, 0.0, 10.0, 10.0];
        let mut intermediate = primitive("other", None);
        intermediate.key.canvas_group = Some(1);
        intermediate.canvas_sorting_grid_size = Some(0.1);
        intermediate.rect = [20.0, 0.0, 10.0, 10.0];
        let mut last = primitive("atlas", None);
        last.key.canvas_group = Some(1);
        last.canvas_sorting_grid_size = Some(0.1);
        last.rect = [40.0, 0.0, 10.0, 10.0];

        let plan = UiBatchPlan::build(vec![first, intermediate, last]);
        assert_eq!(plan.batches.len(), 2);
        assert_eq!(plan.primitives[0].key.texture, "atlas");
        assert_eq!(plan.primitives[1].key.texture, "atlas");
        assert_eq!(plan.primitives[2].key.texture, "other");
        assert_eq!((plan.batches[0].start, plan.batches[0].end), (0, 2));
    }

    #[test]
    fn canvas_batching_preserves_overlapping_transparent_order() {
        let mut first = primitive("atlas", None);
        first.key.canvas_group = Some(1);
        first.canvas_sorting_grid_size = Some(0.0);
        let mut intermediate = primitive("other", None);
        intermediate.key.canvas_group = Some(1);
        intermediate.canvas_sorting_grid_size = Some(0.0);
        let mut last = primitive("atlas", None);
        last.key.canvas_group = Some(1);
        last.canvas_sorting_grid_size = Some(0.0);

        let plan = UiBatchPlan::build(vec![first, intermediate, last]);
        assert_eq!(plan.batches.len(), 3);
        assert_eq!(
            plan.primitives
                .iter()
                .map(|value| value.key.texture.as_str())
                .collect::<Vec<_>>(),
            ["atlas", "other", "atlas"]
        );
        assert_eq!(normalized_canvas_grid_size(0.0), 0.1);
        assert_eq!(normalized_canvas_grid_size(f32::NAN), 0.1);
    }

    #[test]
    fn canvas_batching_moves_an_unconstrained_prefix_to_join_a_blocked_pair() {
        let mut first = primitive("atlas", None);
        first.key.canvas_group = Some(1);
        first.canvas_sorting_grid_size = Some(0.1);
        first.rect = [0.0, 0.0, 10.0, 10.0];
        let mut intermediate = primitive("other", None);
        intermediate.key.canvas_group = Some(1);
        intermediate.canvas_sorting_grid_size = Some(0.1);
        intermediate.rect = [20.0, 0.0, 10.0, 10.0];
        let mut last = primitive("atlas", None);
        last.key.canvas_group = Some(1);
        last.canvas_sorting_grid_size = Some(0.1);
        last.rect = [25.0, 0.0, 10.0, 10.0];

        let plan = UiBatchPlan::build(vec![first, intermediate, last]);
        assert_eq!(plan.batches.len(), 2);
        assert_eq!(
            plan.primitives
                .iter()
                .map(|value| value.key.texture.as_str())
                .collect::<Vec<_>>(),
            ["other", "atlas", "atlas"]
        );
    }

    #[test]
    fn canvas_batching_preserves_every_generated_overlap_edge() {
        let mut primitives = Vec::new();
        for index in 0..48 {
            let mut value = primitive(if index % 3 == 0 { "atlas" } else { "other" }, None);
            value.key.canvas_group = Some(9);
            value.canvas_sorting_grid_size = Some(0.037);
            value.rect = [
                ((index * 17) % 61) as f32,
                ((index * 29) % 47) as f32,
                9.0 + (index % 5) as f32,
                7.0 + (index % 7) as f32,
            ];
            value.color[0] = index as f32;
            primitives.push(value);
        }
        let overlaps = (0..primitives.len())
            .flat_map(|left| {
                let primitives = &primitives;
                (left + 1..primitives.len())
                    .filter(move |right| {
                        primitive_bounds(&primitives[left])
                            .intersects(primitive_bounds(&primitives[*right]))
                    })
                    .map(move |right| (left, right))
            })
            .collect::<Vec<_>>();

        let plan = UiBatchPlan::build(primitives);
        let mut positions = vec![0usize; plan.primitives.len()];
        for (position, value) in plan.primitives.iter().enumerate() {
            positions[value.color[0] as usize] = position;
        }
        for (left, right) in overlaps {
            assert!(
                positions[left] < positions[right],
                "overlap edge {left}->{right}"
            );
        }
    }

    #[test]
    fn canvas_groups_split_otherwise_compatible_batches() {
        let mut parent_before = primitive("atlas", None);
        parent_before.key.canvas_group = Some(1);
        let mut nested = primitive("atlas", None);
        nested.key.canvas_group = Some(2);
        let mut parent_after = primitive("atlas", None);
        parent_after.key.canvas_group = Some(1);
        let plan = UiBatchPlan::build(vec![parent_before, nested, parent_after]);
        assert_eq!(plan.batches.len(), 3);
        assert_eq!(plan.batches[0].key.canvas_group, Some(1));
        assert_eq!(plan.batches[1].key.canvas_group, Some(2));
        assert_eq!(plan.batches[2].key.canvas_group, Some(1));
    }

    #[test]
    fn clip_changes_split_batches() {
        let clip = UiClipRect {
            x: 0,
            y: 0,
            width: 100,
            height: 100,
        };
        let plan = UiBatchPlan::build(vec![
            primitive("atlas", None),
            primitive("atlas", Some(clip)),
            primitive("atlas", Some(clip)),
        ]);
        assert_eq!(plan.batches.len(), 2);
        assert_eq!((plan.batches[1].start, plan.batches[1].end), (1, 3));
    }

    #[test]
    fn custom_vertex_positions_flow_into_instances() {
        let vertices = [[0.0, 1.0], [0.0, 0.0], [0.75, 0.0], [0.75, 1.0]];
        let mut primitive = UiPrimitive::solid([0.0, 0.0, 10.0, 10.0], [1.0; 4]);
        primitive.vertex_positions = Some(vertices);
        let instance = UiInstance::from(&primitive);
        assert_eq!(instance.vertex_positions[0], [0.0, 0.0, 0.75, 0.75]);
        assert_eq!(instance.vertex_positions[1], [1.0, 0.0, 0.0, 1.0]);
    }

    #[test]
    fn ui_shader_with_custom_quad_attributes_parses() {
        naga::front::wgsl::parse_str(UI_WGSL).expect("UI WGSL should remain valid");
    }

    #[test]
    fn custom_ui_hook_reflection_composes_parameters_keywords_textures_and_streams() {
        let source = r#"/* MENGINE_PARAMETERS
        {"parameters":[{"name":"strength","type":"float","default":1}],
         "keywords":[{"name":"USE_DETAIL","default":true}],
         "textures":[{"name":"detail","type":"color","default":""}]}
        */
        fn mengine_ui_hook(input: MEngineUiInput) -> vec4<f32> {
            let detail = mengine_texture_detail(input.uv1.xy);
            let normal_factor = abs(input.normal.z);
            let keyword_factor = select(0.0, 1.0, mengine_keyword_USE_DETAIL());
            return mengine_ui_main_texture(input.uv0) * input.vertex_color
                * detail * (mengine_param_strength(input.instance_index) * normal_factor * keyword_factor);
        }"#;
        assert!(validate_ui_shader_hook(source).is_ok());
        assert!(validate_ui_shader_hook(
            "fn mengine_lit_surface_hook(surface: MEngineSurface, uv: vec2<f32>, world_position: vec3<f32>) -> MEngineSurface { return surface; }"
        )
        .is_err());
        assert!(validate_ui_shader_hook(
            "@group(3) @binding(0) var stolen: texture_2d<f32>; fn mengine_ui_hook(input: MEngineUiInput) -> vec4<f32> { return input.vertex_color; }"
        )
        .is_err());
    }

    #[test]
    fn shader_channel_mask_matches_unity_and_forces_camera_basis_streams() {
        assert_eq!(UiShaderChannels::TEX_COORD_1.bits(), 1);
        assert_eq!(UiShaderChannels::TEX_COORD_2.bits(), 2);
        assert_eq!(UiShaderChannels::TEX_COORD_3.bits(), 4);
        assert_eq!(UiShaderChannels::NORMAL.bits(), 8);
        assert_eq!(UiShaderChannels::TANGENT.bits(), 16);
        assert_eq!(
            UiShaderChannels::for_canvas(1 | 4 | 64, "ScreenSpaceOverlay").bits(),
            1 | 4
        );
        assert_eq!(
            UiShaderChannels::for_canvas(2, "ScreenSpaceCamera").bits(),
            2 | 8 | 16
        );
        assert_eq!(UiShaderChannels::for_canvas(0, "WorldSpace").bits(), 8 | 16);
    }

    #[test]
    fn shader_channel_streams_reach_gpu_storage_and_split_batches() {
        let mut base = primitive("atlas", None);
        base.key.shader_channels = UiShaderChannels::TEX_COORD_1;
        let mut channel_data = UiShaderChannelData::default();
        channel_data.uv1[2] = [0.2, 0.4, 0.6, 0.8];
        base.shader_channel_data = Some(Arc::new(channel_data));
        let gpu = UiShaderChannelInstance::from(&base);
        assert_eq!(gpu.meta[0], 1);
        assert_eq!(gpu.uv1[2], [0.2, 0.4, 0.6, 0.8]);
        assert_eq!(gpu.normals[0], [0.0, 0.0, -1.0, 0.0]);
        assert_eq!(gpu.tangents[0], [1.0, 0.0, 0.0, -1.0]);
        assert_eq!(std::mem::size_of::<UiShaderChannelInstance>(), 336);

        let mut normal = base.clone();
        normal.key.shader_channels = UiShaderChannels::NORMAL;
        let plan = UiBatchPlan::build(vec![base, normal]);
        assert_eq!(plan.batches.len(), 2);
    }

    #[test]
    fn depth_state_changes_split_batches_and_reaches_instances() {
        let overlay = primitive("atlas", None);
        let mut camera = primitive("atlas", None);
        camera.key.depth_test = true;
        camera.depth = 0.75;
        camera.clip_corners = Some([
            [-1.0, 1.0, 0.75, 1.0],
            [1.0, 1.0, 0.75, 1.0],
            [1.0, -1.0, 0.75, 1.0],
            [-1.0, -1.0, 0.75, 1.0],
        ]);
        let plan = UiBatchPlan::build(vec![overlay, camera.clone()]);
        assert_eq!(plan.batches.len(), 2);
        let instance = UiInstance::from(&camera);
        assert_eq!(instance.projection[0], 0.75);
        assert_eq!(instance.projection[1], 1.0);
        assert_eq!(instance.corners[2], [1.0, -1.0, 0.75, 1.0]);
    }

    #[test]
    fn stencil_modes_split_batches_and_mark_only_mask_writes_for_alpha_clip() {
        let mut visible = primitive("atlas", None);
        visible.key.stencil = UiStencilMode::Test { reference: 1 };
        let mut push = primitive("atlas", None);
        push.key.stencil = UiStencilMode::Push { reference: 1 };
        let mut child = primitive("atlas", None);
        child.key.stencil = UiStencilMode::Test { reference: 2 };
        let mut pop = primitive("atlas", None);
        pop.key.stencil = UiStencilMode::Pop { reference: 2 };

        let plan = UiBatchPlan::build(vec![visible.clone(), push.clone(), child, pop.clone()]);
        assert_eq!(plan.batches.len(), 4);
        assert_eq!(plan.batches[0].key.stencil.reference(), 1);
        assert_eq!(plan.batches[1].key.stencil.reference(), 1);
        assert_eq!(plan.batches[2].key.stencil.reference(), 2);
        assert_eq!(plan.batches[3].key.stencil.reference(), 2);
        assert_eq!(UiInstance::from(&visible).projection[2], 0.0);
        assert_eq!(UiInstance::from(&push).projection[2], 1.0);
        assert_eq!(UiInstance::from(&pop).projection[2], 1.0);
    }

    #[test]
    fn nested_soft_clips_reach_the_per_instance_gpu_buffer() {
        let mut value = primitive("white", None);
        value.soft_clips[0] = Some(UiSoftClip {
            rect: [10.0, 20.0, 100.0, 80.0],
            softness: [4.0, 6.0],
        });
        value.soft_clips[1] = Some(UiSoftClip {
            rect: [30.0, 40.0, 50.0, 30.0],
            softness: [8.0, 10.0],
        });
        let gpu = UiSoftClipInstance::from(&value);
        assert_eq!(gpu.clips[0].rect, [10.0, 20.0, 100.0, 80.0]);
        assert_eq!(gpu.clips[0].softness, [4.0, 6.0, 1.0, 0.0]);
        assert_eq!(gpu.clips[1].rect, [30.0, 40.0, 50.0, 30.0]);
        assert_eq!(gpu.clips[1].softness, [8.0, 10.0, 1.0, 0.0]);
        assert_eq!(gpu.clips[2].softness[2], 0.0);
    }

    #[test]
    fn stencil_pipelines_encode_on_an_available_headless_adapter() {
        let instance = wgpu::Instance::default();
        let Some(adapter) =
            pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: None,
                force_fallback_adapter: false,
            }))
        else {
            return;
        };
        let (device, queue) = pollster::block_on(adapter.request_device(
            &wgpu::DeviceDescriptor {
                label: Some("ui_stencil_test"),
                required_features: wgpu::Features::empty(),
                required_limits: wgpu::Limits::default(),
                memory_hints: Default::default(),
            },
            None,
        ))
        .expect("headless UI test device");
        device.push_error_scope(wgpu::ErrorFilter::Validation);

        let format = wgpu::TextureFormat::Bgra8UnormSrgb;
        let supports_anisotropy = adapter
            .get_downlevel_capabilities()
            .flags
            .contains(wgpu::DownlevelFlags::ANISOTROPIC_FILTERING);
        let mut renderer = UiRenderer::new(&device, &queue, format, 16, 16, supports_anisotropy);
        let mut push = primitive("white", None);
        push.key.stencil = UiStencilMode::Push { reference: 0 };
        let mut child = primitive("white", None);
        child.key.stencil = UiStencilMode::Test { reference: 1 };
        child.key.shader_channels = UiShaderChannels::for_canvas(1 | 2 | 4, "WorldSpace");
        let mut channel_data = UiShaderChannelData::default();
        channel_data.uv2[3] = [0.25, 0.5, 0.75, 1.0];
        child.shader_channel_data = Some(Arc::new(channel_data));
        child.key.material = "Assets/Materials/HeadlessUi.mmat".into();
        child.render_material = Some(Arc::new(UiRenderMaterial {
            shader: Arc::from(
                r#"fn mengine_ui_hook(input: MEngineUiInput) -> vec4<f32> {
                    let stream = clamp(input.uv2.x + abs(input.normal.z), 0.0, 1.0);
                    return mengine_ui_main_texture(input.uv0) * input.vertex_color
                        * mengine_ui_material_color(input.instance_index)
                        * vec4<f32>(stream, stream, stream, 1.0);
                }"#,
            ),
            base_color: [0.5, 0.75, 1.0, 1.0],
            ..UiRenderMaterial::default()
        }));
        let mut pop = primitive("white", None);
        pop.key.stencil = UiStencilMode::Pop { reference: 1 };
        let plan = UiBatchPlan::build(vec![push, child, pop]);
        renderer.prepare(&device, &queue, &plan);
        assert_eq!(renderer.custom_pipelines.len(), 1);

        let color = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("ui_stencil_test_color"),
            size: wgpu::Extent3d {
                width: 16,
                height: 16,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        });
        let depth = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("ui_stencil_test_depth"),
            size: wgpu::Extent3d {
                width: 16,
                height: 16,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Depth24PlusStencil8,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        });
        let color_view = color.create_view(&Default::default());
        let depth_view = depth.create_view(&Default::default());
        let mut encoder = device.create_command_encoder(&Default::default());
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("ui_stencil_test_pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &color_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: &depth_view,
                    depth_ops: Some(wgpu::Operations {
                        load: wgpu::LoadOp::Clear(1.0),
                        store: wgpu::StoreOp::Store,
                    }),
                    stencil_ops: Some(wgpu::Operations {
                        load: wgpu::LoadOp::Clear(0),
                        store: wgpu::StoreOp::Store,
                    }),
                }),
                ..Default::default()
            });
            renderer.draw(&mut pass, &plan);
        }
        queue.submit([encoder.finish()]);
        let error = pollster::block_on(device.pop_error_scope());
        assert!(error.is_none(), "UI stencil validation error: {error:?}");
        renderer.prepare(&device, &queue, &UiBatchPlan::default());
        assert!(renderer.custom_pipelines.is_empty());
        assert!(renderer.material_texture_sets.is_empty());
    }

    #[test]
    fn rgba8_upload_validation_rejects_invalid_dimensions_and_lengths() {
        assert_eq!(
            validate_texture_rgba8(0, 1, &[]),
            Err(UiTextureError::EmptyDimensions)
        );
        assert_eq!(
            validate_texture_rgba8(2, 2, &[255; 12]),
            Err(UiTextureError::InvalidDataLength {
                expected: 16,
                actual: 12,
            })
        );
        assert!(validate_texture_rgba8(2, 2, &[255; 16]).is_ok());
    }

    #[test]
    fn solid_primitives_cover_the_full_texture_by_default() {
        assert_eq!(
            UiPrimitive::solid([0.0; 4], [1.0; 4]).uv,
            [0.0, 0.0, 1.0, 1.0]
        );
    }
}
