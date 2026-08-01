use crate::sorting::{SortingLayers, WorldPrimitive, WorldPrimitiveKind};
use crate::ui_raycast::{ray_plane, BlockingObjects, WorldRay};
use glam::{Mat4, Quat, Vec3};
use mengine_core::generated::{
    AspectRatioFitter, Button, Camera2D, Camera3D, Canvas, CanvasGroup, CanvasRenderer,
    CanvasScaler, ContentSizeFitter, Dropdown, GraphicRaycaster, Image, InputField, LayoutGroup,
    ListView, Mask, Outline, Panel, ProgressBar, RawImage, RectMask2D, RectTransform, ScrollView,
    Scrollbar, Shadow, Slider, TabView, Text, Toggle, ToggleGroup,
};
use mengine_core::hierarchy::Parent;
use mengine_core::{Entity, TransformHierarchy, World};
use mengine_rhi::{
    look_at, orthographic, perspective, FrameCamera, UiBatchKey, UiBatchPlan, UiBlendMode,
    UiClipRect, UiPrimitive, UiSoftClip, UiStencilMode,
};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

const TRANSPARENT_MESH_ALPHA_EPSILON: f32 = 1.0 / 255.0;

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct UiRect {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum UiButtonVisualState {
    #[default]
    Normal,
    Highlighted,
    Pressed,
    Selected,
    Disabled,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct UiInteractionState {
    pub hovered: Option<Entity>,
    pub pressed: Option<Entity>,
    pub selected: Option<Entity>,
}

impl UiInteractionState {
    fn button_state(self, entity: Entity, interactable: bool) -> UiButtonVisualState {
        if !interactable {
            UiButtonVisualState::Disabled
        } else if self.pressed == Some(entity) && self.hovered == Some(entity) {
            UiButtonVisualState::Pressed
        } else if self.hovered == Some(entity) {
            UiButtonVisualState::Highlighted
        } else if self.selected == Some(entity) {
            UiButtonVisualState::Selected
        } else {
            UiButtonVisualState::Normal
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct UiButtonTintTween {
    pub state: UiButtonVisualState,
    pub start: [f32; 4],
    pub current: [f32; 4],
    pub target: [f32; 4],
    pub elapsed: f32,
    pub duration: f32,
}

fn sanitize_button_color(color: [f32; 4]) -> [f32; 4] {
    color.map(|channel| {
        if channel.is_finite() {
            channel.max(0.0)
        } else {
            0.0
        }
    })
}

pub fn button_target_tint(button: &Button, state: UiButtonVisualState) -> [f32; 4] {
    let color = match state {
        UiButtonVisualState::Normal => button.normal_color,
        UiButtonVisualState::Highlighted => button.highlighted_color,
        UiButtonVisualState::Pressed => button.pressed_color,
        UiButtonVisualState::Selected => button.selected_color,
        UiButtonVisualState::Disabled => button.disabled_color,
    };
    let multiplier = if button.color_multiplier.is_finite() {
        button.color_multiplier.max(0.0)
    } else {
        1.0
    };
    sanitize_button_color(color).map(|channel| channel * multiplier)
}

pub fn button_target_sprite(button: &Button, state: UiButtonVisualState) -> Option<&str> {
    let sprite = match state {
        UiButtonVisualState::Normal => return None,
        UiButtonVisualState::Highlighted => &button.highlighted_sprite,
        UiButtonVisualState::Pressed => &button.pressed_sprite,
        UiButtonVisualState::Selected => &button.selected_sprite,
        UiButtonVisualState::Disabled => &button.disabled_sprite,
    }
    .trim();
    (!sprite.is_empty()).then_some(sprite)
}

fn button_effective_interactable(world: &World, entity: Entity) -> bool {
    let mut chain = Vec::new();
    let mut visited = HashSet::new();
    let mut cursor = Some(entity);
    while let Some(current) = cursor {
        if !visited.insert(current) {
            break;
        }
        chain.push(current);
        cursor = world
            .get_component::<Parent>(current)
            .map(|parent| parent.entity);
    }
    let mut interactable = true;
    for current in chain.into_iter().rev() {
        if let Some(group) = world.get_component::<CanvasGroup>(current) {
            if group.ignore_parent_groups {
                interactable = true;
            }
            interactable &= group.interactable;
        }
    }
    interactable
}

fn sample_button_tween(tween: UiButtonTintTween) -> [f32; 4] {
    let progress = if tween.duration <= 0.0 {
        1.0
    } else {
        (tween.elapsed / tween.duration).clamp(0.0, 1.0)
    };
    std::array::from_fn(|index| {
        tween.start[index] + (tween.target[index] - tween.start[index]) * progress
    })
}

pub fn update_ui_button_tints(
    world: &World,
    interaction: UiInteractionState,
    delta_time: f32,
    cache: &mut HashMap<Entity, UiButtonTintTween>,
) {
    cache.retain(|entity, _| world.get_component::<Button>(*entity).is_some());
    let delta_time = if delta_time.is_finite() {
        delta_time.max(0.0)
    } else {
        0.0
    };
    for entity in world.iter_entities() {
        let Some(button) = world.get_component::<Button>(entity) else {
            continue;
        };
        if !button.transition.eq_ignore_ascii_case("ColorTint") {
            cache.remove(&entity);
            continue;
        }
        let state = interaction.button_state(
            entity,
            button.interactable && button_effective_interactable(world, entity),
        );
        let target = button_target_tint(button, state);
        let duration = if button.fade_duration.is_finite() {
            button.fade_duration.max(0.0)
        } else {
            0.1
        };
        match cache.get_mut(&entity) {
            None => {
                cache.insert(
                    entity,
                    UiButtonTintTween {
                        state,
                        start: target,
                        current: target,
                        target,
                        elapsed: duration,
                        duration,
                    },
                );
            }
            Some(tween) => {
                let sampled = sample_button_tween(*tween);
                if tween.state != state || tween.target != target {
                    *tween = UiButtonTintTween {
                        state,
                        start: sampled,
                        current: if duration <= 0.0 { target } else { sampled },
                        target,
                        elapsed: 0.0,
                        duration,
                    };
                } else {
                    tween.elapsed += delta_time;
                    tween.current = sample_button_tween(*tween);
                }
            }
        }
    }
}

#[derive(Clone, Debug)]
pub enum UiControlKind {
    Blocker,
    Button,
    Toggle {
        is_on: bool,
    },
    Slider {
        min: f32,
        max: f32,
        value: f32,
        whole_numbers: bool,
        direction: String,
    },
    Scrollbar {
        value: f32,
        size: f32,
        number_of_steps: i32,
        direction: String,
    },
    InputField,
    Dropdown {
        option_index: Option<i32>,
    },
    ListItem {
        index: i32,
    },
    ScrollView,
    Tab {
        index: i32,
    },
}

#[derive(Clone, Debug)]
pub struct UiControlRegion {
    pub entity: Entity,
    pub rect: UiRect,
    /// Unity Graphic.raycastPadding in rendered pixels: left, bottom, right, top.
    pub raycast_padding: [f32; 4],
    pub clip: UiClipRect,
    pub rotation_radians: f32,
    pub pivot: [f32; 2],
    /// Projected screen quad for perspective World Space Canvas hit testing.
    pub corners: Option<[[f32; 2]; 4]>,
    /// Separately projected padded quad; visual corners remain unchanged for alpha mapping.
    pub raycast_corners: Option<[[f32; 2]; 4]>,
    /// Per-corner reciprocal clip W used for perspective-correct pointer UVs.
    pub corner_inverse_w: Option<[f32; 4]>,
    /// Unity GraphicRaycaster back-face filtering for projected World Space quads.
    pub ignore_reversed_graphics: bool,
    /// Physics dimensions checked before this graphic for Camera/World Space canvases.
    pub blocking_objects: BlockingObjects,
    /// Signed Unity-style LayerMask used by the blocking query.
    pub blocking_mask: i32,
    /// World-space plane containing this graphic. Overlay canvases intentionally have no plane.
    pub raycast_plane: Option<UiRaycastPlane>,
    /// Event camera that rendered this Canvas. This can differ from the active scene camera.
    pub raycast_camera: Option<FrameCamera>,
    /// Active Unity Mask rectangles inherited by this Graphic (maximum stencil depth 8).
    pub mask_regions: [Option<UiMaskRegion>; 8],
    /// Unity Image alpha filter attached to every same-entity raycast receiver.
    pub image_alpha_hit_test: Option<UiImageAlphaHitTest>,
    pub kind: UiControlKind,
    pub callback: Value,
}

#[derive(Clone, Debug)]
pub struct UiAlphaTexture {
    pub width: u32,
    pub height: u32,
    pub alpha: Arc<[u8]>,
}

impl UiAlphaTexture {
    fn sample_bilinear(&self, u: f32, v: f32) -> Option<f32> {
        if self.width == 0
            || self.height == 0
            || self.alpha.len() != self.width as usize * self.height as usize
        {
            return None;
        }
        let x = (u * self.width as f32 - 0.5).clamp(0.0, self.width.saturating_sub(1) as f32);
        let y = (v * self.height as f32 - 0.5).clamp(0.0, self.height.saturating_sub(1) as f32);
        let x0 = x.floor() as u32;
        let y0 = y.floor() as u32;
        let x1 = (x0 + 1).min(self.width - 1);
        let y1 = (y0 + 1).min(self.height - 1);
        let tx = x - x0 as f32;
        let ty = y - y0 as f32;
        let sample = |px: u32, py: u32| self.alpha[(py * self.width + px) as usize] as f32 / 255.0;
        let top = sample(x0, y0) * (1.0 - tx) + sample(x1, y0) * tx;
        let bottom = sample(x0, y1) * (1.0 - tx) + sample(x1, y1) * tx;
        Some(top * (1.0 - ty) + bottom * ty)
    }
}

#[derive(Clone, Debug)]
pub struct UiImageAlphaHitTest {
    pub threshold: f32,
    pub sprite: String,
    pub image_type: String,
    pub source_size: [f32; 2],
    pub source_border: [f32; 4],
    pub destination_border: [f32; 4],
    pub destination_size: [f32; 2],
    pub pixel_scale: f32,
    pub fill_center: bool,
    pub texture_uv: [f32; 4],
    pub texture: Option<Arc<UiAlphaTexture>>,
}

impl UiImageAlphaHitTest {
    fn allows(&self, point: [f32; 2], destination_size: [f32; 2]) -> bool {
        if !self.threshold.is_finite() || self.threshold <= 0.0 {
            return true;
        }
        let Some(texture) = self.texture.as_deref() else {
            return true;
        };
        let Some(local_uv) = map_image_alpha_point(
            point,
            destination_size,
            &self.image_type,
            self.source_size,
            self.source_border,
            self.destination_border,
            self.pixel_scale,
            self.fill_center,
        ) else {
            return true;
        };
        let texture_u = self.texture_uv[0] + local_uv[0] * self.texture_uv[2];
        let texture_v = self.texture_uv[1] + local_uv[1] * self.texture_uv[3];
        texture
            .sample_bilinear(texture_u, texture_v)
            .is_none_or(|alpha| alpha >= self.threshold)
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct UiMaskRegion {
    pub rect: UiRect,
    pub rotation_radians: f32,
    pub pivot: [f32; 2],
    pub corners: Option<[[f32; 2]; 4]>,
}

impl UiMaskRegion {
    fn contains(self, x: f32, y: f32) -> bool {
        point_in_ui_region(
            self.rect,
            self.rotation_radians,
            self.pivot,
            self.corners,
            x,
            y,
        )
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct UiRaycastPlane {
    pub point: Vec3,
    pub normal: Vec3,
}

impl UiRaycastPlane {
    pub fn distance(self, ray: WorldRay) -> Option<f32> {
        ray_plane(ray, self.point, self.normal)
    }
}

impl UiControlRegion {
    fn normalized_point(&self, x: f32, y: f32) -> Option<[f32; 2]> {
        if let Some(corners) = self.corners {
            return quad_uv(corners, [x, y], self.corner_inverse_w);
        }
        if self.rect.width <= 0.0 || self.rect.height <= 0.0 {
            return None;
        }
        let pivot_x = self.rect.x + self.rect.width * self.pivot[0];
        let pivot_y = self.rect.y + self.rect.height * self.pivot[1];
        let dx = x - pivot_x;
        let dy = y - pivot_y;
        let c = self.rotation_radians.cos();
        let s = self.rotation_radians.sin();
        Some([
            (dx * c + dy * s + self.rect.width * self.pivot[0]) / self.rect.width,
            (-dx * s + dy * c + self.rect.height * self.pivot[1]) / self.rect.height,
        ])
    }

    pub fn contains(&self, x: f32, y: f32) -> bool {
        if x < self.clip.x as f32
            || y < self.clip.y as f32
            || x > (self.clip.x + self.clip.width) as f32
            || y > (self.clip.y + self.clip.height) as f32
        {
            return false;
        }
        if self
            .mask_regions
            .iter()
            .flatten()
            .any(|mask| !mask.contains(x, y))
        {
            return false;
        }
        let inside_raycast_geometry = if let Some(corners) = self.raycast_corners {
            point_in_ui_region(
                self.rect,
                self.rotation_radians,
                self.pivot,
                Some(corners),
                x,
                y,
            )
        } else if self.corners.is_some() && self.raycast_padding == [0.0; 4] {
            point_in_ui_region(
                self.rect,
                self.rotation_radians,
                self.pivot,
                self.corners,
                x,
                y,
            )
        } else {
            padded_raycast_geometry(self.rect, self.pivot, self.raycast_padding).is_some_and(
                |(rect, pivot)| point_in_ui_region(rect, self.rotation_radians, pivot, None, x, y),
            )
        };
        if !inside_raycast_geometry {
            return false;
        }
        self.image_alpha_hit_test.as_ref().is_none_or(|filter| {
            self.normalized_point(x, y).is_none_or(|uv| {
                filter.allows(
                    [
                        uv[0] * filter.destination_size[0],
                        uv[1] * filter.destination_size[1],
                    ],
                    filter.destination_size,
                )
            })
        })
    }

    pub fn range_value_at(&self, x: f32, y: f32) -> Option<f32> {
        let (min, max, whole_numbers, direction, handle_size, number_of_steps) = match &self.kind {
            UiControlKind::Slider {
                min,
                max,
                whole_numbers,
                direction,
                ..
            } => (*min, *max, *whole_numbers, direction, 0.0, 0),
            UiControlKind::Scrollbar {
                size,
                number_of_steps,
                direction,
                ..
            } => (
                0.0,
                1.0,
                false,
                direction,
                size.clamp(0.0, 1.0),
                *number_of_steps,
            ),
            _ => return None,
        };
        let [u, v] = self.normalized_point(x, y)?;
        let mut t = if direction == "LeftToRight" || direction == "RightToLeft" {
            u
        } else {
            v
        };
        if handle_size > 0.0 {
            t = (t - handle_size * 0.5) / (1.0 - handle_size).max(0.0001);
        }
        if direction == "RightToLeft" || direction == "BottomToTop" {
            t = 1.0 - t;
        }
        let low = min.min(max);
        let high = min.max(max);
        let mut value = low + (high - low) * t.clamp(0.0, 1.0);
        if whole_numbers {
            value = value.round();
        }
        if number_of_steps > 1 {
            let intervals = (number_of_steps - 1) as f32;
            value = (value * intervals).round() / intervals;
        }
        Some(value)
    }
}

fn point_in_ui_region(
    rect: UiRect,
    rotation_radians: f32,
    pivot: [f32; 2],
    corners: Option<[[f32; 2]; 4]>,
    x: f32,
    y: f32,
) -> bool {
    if let Some(corners) = corners {
        let mut sign = 0.0_f32;
        for index in 0..4 {
            let a = corners[index];
            let b = corners[(index + 1) % 4];
            let cross = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
            if cross.abs() <= 0.0001 {
                continue;
            }
            if sign == 0.0 {
                sign = cross.signum();
            } else if cross.signum() != sign {
                return false;
            }
        }
        return true;
    }

    let pivot_x = rect.x + rect.width * pivot[0];
    let pivot_y = rect.y + rect.height * pivot[1];
    let dx = x - pivot_x;
    let dy = y - pivot_y;
    let c = rotation_radians.cos();
    let s = rotation_radians.sin();
    let local_x = dx * c + dy * s + rect.width * pivot[0];
    let local_y = -dx * s + dy * c + rect.height * pivot[1];
    local_x >= 0.0 && local_y >= 0.0 && local_x <= rect.width && local_y <= rect.height
}

fn padded_raycast_geometry(
    rect: UiRect,
    pivot: [f32; 2],
    padding: [f32; 4],
) -> Option<(UiRect, [f32; 2])> {
    let finite = |value: f32| if value.is_finite() { value } else { 0.0 };
    let left = finite(padding[0]);
    let bottom = finite(padding[1]);
    let right = finite(padding[2]);
    let top = finite(padding[3]);
    let width = rect.width - left - right;
    let height = rect.height - top - bottom;
    if width <= 0.0 || height <= 0.0 {
        return None;
    }
    let x = rect.x + left;
    let y = rect.y + top;
    let pivot_x = rect.x + rect.width * pivot[0];
    let pivot_y = rect.y + rect.height * pivot[1];
    Some((
        UiRect {
            x,
            y,
            width,
            height,
        },
        [(pivot_x - x) / width, (pivot_y - y) / height],
    ))
}

fn quad_uv(
    corners: [[f32; 2]; 4],
    point: [f32; 2],
    inverse_w: Option<[f32; 4]>,
) -> Option<[f32; 2]> {
    let triangles = [
        ([0_usize, 1, 2], [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0]]),
        ([0_usize, 2, 3], [[0.0, 0.0], [1.0, 1.0], [0.0, 1.0]]),
    ];
    for (indices, uv) in triangles {
        let a = corners[indices[0]];
        let b = corners[indices[1]];
        let c = corners[indices[2]];
        let denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
        if denominator.abs() <= 0.000001 {
            continue;
        }
        let wa =
            ((b[1] - c[1]) * (point[0] - c[0]) + (c[0] - b[0]) * (point[1] - c[1])) / denominator;
        let wb =
            ((c[1] - a[1]) * (point[0] - c[0]) + (a[0] - c[0]) * (point[1] - c[1])) / denominator;
        let wc = 1.0 - wa - wb;
        if wa >= -0.0001 && wb >= -0.0001 && wc >= -0.0001 {
            let weights = [wa, wb, wc];
            let corrected = std::array::from_fn::<_, 3, _>(|index| {
                let reciprocal = inverse_w
                    .map(|values| values[indices[index]])
                    .filter(|value| value.is_finite() && *value > 0.0)
                    .unwrap_or(1.0);
                weights[index] * reciprocal
            });
            let total = corrected.iter().sum::<f32>();
            if total <= 0.00000001 {
                continue;
            }
            return Some([
                (corrected[0] * uv[0][0] + corrected[1] * uv[1][0] + corrected[2] * uv[2][0])
                    / total,
                (corrected[0] * uv[0][1] + corrected[1] * uv[1][1] + corrected[2] * uv[2][1])
                    / total,
            ]);
        }
    }
    None
}

pub fn next_ui_focus(
    controls: &[UiControlRegion],
    current: Option<Entity>,
    reverse: bool,
) -> Option<Entity> {
    let mut entities = Vec::new();
    for control in controls {
        if matches!(
            control.kind,
            UiControlKind::Blocker | UiControlKind::ScrollView
        ) || entities.contains(&control.entity)
        {
            continue;
        }
        entities.push(control.entity);
    }
    if entities.is_empty() {
        return None;
    }
    let Some(index) = current.and_then(|entity| entities.iter().position(|id| *id == entity))
    else {
        return reverse
            .then(|| entities[entities.len() - 1])
            .or_else(|| entities.first().copied());
    };
    let next = if reverse {
        (index + entities.len() - 1) % entities.len()
    } else {
        (index + 1) % entities.len()
    };
    Some(entities[next])
}

pub fn append_ui_focus_ring(
    plan: &mut UiBatchPlan,
    controls: &[UiControlRegion],
    focused: Option<Entity>,
) {
    let Some(focused) = focused else {
        return;
    };
    let matching: Vec<&UiControlRegion> = controls
        .iter()
        .filter(|control| {
            control.entity == focused
                && !matches!(
                    control.kind,
                    UiControlKind::Blocker | UiControlKind::ScrollView
                )
        })
        .collect();
    let Some(first) = matching.first() else {
        return;
    };
    let mut left = first.rect.x;
    let mut top = first.rect.y;
    let mut right = first.rect.x + first.rect.width;
    let mut bottom = first.rect.y + first.rect.height;
    for control in matching.iter().skip(1) {
        left = left.min(control.rect.x);
        top = top.min(control.rect.y);
        right = right.max(control.rect.x + control.rect.width);
        bottom = bottom.max(control.rect.y + control.rect.height);
    }
    let color = [0.22, 0.72, 1.0, 1.0];
    let thickness = 2.0;
    let rects = [
        UiRect {
            x: left - thickness,
            y: top - thickness,
            width: right - left + thickness * 2.0,
            height: thickness,
        },
        UiRect {
            x: left - thickness,
            y: bottom,
            width: right - left + thickness * 2.0,
            height: thickness,
        },
        UiRect {
            x: left - thickness,
            y: top,
            width: thickness,
            height: bottom - top,
        },
        UiRect {
            x: right,
            y: top,
            width: thickness,
            height: bottom - top,
        },
    ];
    for rect in rects {
        plan.primitives.push(primitive(
            rect,
            color,
            [0.5, 0.5],
            0.0,
            "ui/focus",
            "white",
            first.clip,
        ));
    }
    *plan = UiBatchPlan::build(std::mem::take(&mut plan.primitives));
}

fn nearest_toggle_group(world: &World, entity: Entity) -> Option<Entity> {
    let mut parent = world
        .get_component::<Parent>(entity)
        .map(|value| value.entity);
    let mut guard = Vec::new();
    while let Some(candidate) = parent {
        if guard.contains(&candidate) {
            return None;
        }
        guard.push(candidate);
        if world.get_component::<ToggleGroup>(candidate).is_some() {
            return Some(candidate);
        }
        parent = world
            .get_component::<Parent>(candidate)
            .map(|value| value.entity);
    }
    None
}

/// Apply one Toggle value atomically, enforcing the nearest ancestor ToggleGroup.
pub fn set_toggle_value(world: &mut World, target: Entity, requested_on: bool) -> bool {
    let hierarchy = TransformHierarchy::build(world);
    let Some(current) = world
        .get_component::<Toggle>(target)
        .map(|toggle| toggle.is_on)
    else {
        return false;
    };
    let Some(group_entity) = nearest_toggle_group(world, target) else {
        if current == requested_on {
            return false;
        }
        if let Some(toggle) = world.get_component_mut::<Toggle>(target) {
            toggle.is_on = requested_on;
            return true;
        }
        return false;
    };

    let allow_switch_off = world
        .get_component::<ToggleGroup>(group_entity)
        .is_some_and(|group| group.allow_switch_off);
    let members: Vec<(Entity, bool)> = world
        .iter_entities()
        .filter(|entity| {
            hierarchy.is_active(*entity)
                && world.get_component::<Toggle>(*entity).is_some()
                && nearest_toggle_group(world, *entity) == Some(group_entity)
        })
        .filter_map(|entity| {
            world
                .get_component::<Toggle>(entity)
                .map(|toggle| (entity, toggle.is_on))
        })
        .collect();
    if !requested_on
        && !allow_switch_off
        && !members
            .iter()
            .any(|(entity, is_on)| *entity != target && *is_on)
    {
        return false;
    }

    let mut changed = false;
    for (entity, is_on) in members {
        let next = if requested_on {
            entity == target
        } else if entity == target {
            false
        } else {
            is_on
        };
        if next == is_on {
            continue;
        }
        if let Some(toggle) = world.get_component_mut::<Toggle>(entity) {
            toggle.is_on = next;
            changed = true;
        }
    }
    changed
}

#[derive(Clone, Debug, Default)]
pub struct RuntimeUiFrame {
    pub plan: UiBatchPlan,
    /// World Space Canvas output participates in the same Sorting Layer/Order queue as 2D
    /// renderers. It remains separate until after 2D lighting so ordinary UI shaders are not lit.
    pub world_primitives: Vec<WorldPrimitive>,
    pub controls: Vec<UiControlRegion>,
}

#[derive(Clone, Copy, Debug)]
struct UiInheritedState {
    canvas_group: Option<u64>,
    alpha: f32,
    interactable: bool,
    blocks_raycasts: bool,
    raycaster_enabled: bool,
    ignore_reversed_graphics: bool,
    blocking_objects: BlockingObjects,
    blocking_mask: i32,
    pixel_perfect: bool,
    screen_space: bool,
    stencil_depth: u8,
    mask_regions: [Option<UiMaskRegion>; 8],
    soft_clips: [Option<UiSoftClip>; 8],
}

#[derive(Clone, Copy, Debug)]
struct UiWalkLayout {
    parent_rect: UiRect,
    scale: f32,
    sprite_pixel_scale: f32,
    /// Viewport and control clipping that every Graphic must retain.
    clip: UiClipRect,
    /// RectMask2D clipping, ignored by MaskableGraphic when maskable is false.
    rect_mask_clip: Option<UiRect>,
    forced_rect: Option<UiRect>,
}

impl Default for UiInheritedState {
    fn default() -> Self {
        Self {
            canvas_group: None,
            alpha: 1.0,
            interactable: true,
            blocks_raycasts: true,
            raycaster_enabled: false,
            ignore_reversed_graphics: true,
            blocking_objects: BlockingObjects::None,
            blocking_mask: -1,
            pixel_perfect: false,
            screen_space: true,
            stencil_depth: 0,
            mask_regions: [None; 8],
            soft_clips: [None; 8],
        }
    }
}

impl UiInheritedState {
    fn accepts_raycasts(self) -> bool {
        self.blocks_raycasts && self.raycaster_enabled
    }
}

fn apply_canvas_group(
    mut state: UiInheritedState,
    group: Option<&CanvasGroup>,
) -> UiInheritedState {
    let Some(group) = group else {
        return state;
    };
    if group.ignore_parent_groups {
        state.alpha = 1.0;
        state.interactable = true;
        state.blocks_raycasts = true;
    }
    state.alpha *= group.alpha.clamp(0.0, 1.0);
    state.interactable &= group.interactable;
    state.blocks_raycasts &= group.blocks_raycasts;
    state
}

pub fn collect_ui_frame(world: &World, width: u32, height: u32) -> RuntimeUiFrame {
    let hierarchy = TransformHierarchy::build(world);
    collect_ui_frame_with_hierarchy(world, &hierarchy, width, height)
}

pub fn collect_ui_frame_with_hierarchy(
    world: &World,
    hierarchy: &TransformHierarchy,
    width: u32,
    height: u32,
) -> RuntimeUiFrame {
    collect_ui_frame_internal(
        world,
        hierarchy,
        width,
        height,
        None,
        None,
        0,
        UiInteractionState::default(),
        None,
    )
}

pub fn collect_ui_frame_with_hierarchy_and_camera(
    world: &World,
    hierarchy: &TransformHierarchy,
    width: u32,
    height: u32,
    active_camera: FrameCamera,
    sorting_layers: &SortingLayers,
) -> RuntimeUiFrame {
    collect_ui_frame_internal(
        world,
        hierarchy,
        width,
        height,
        Some(active_camera),
        Some(sorting_layers),
        0,
        UiInteractionState::default(),
        None,
    )
}

pub fn collect_ui_frame_for_display(
    world: &World,
    hierarchy: &TransformHierarchy,
    width: u32,
    height: u32,
    active_camera: Option<FrameCamera>,
    sorting_layers: &SortingLayers,
    target_display: i32,
) -> RuntimeUiFrame {
    collect_ui_frame_internal(
        world,
        hierarchy,
        width,
        height,
        active_camera,
        Some(sorting_layers),
        normalize_target_display(target_display),
        UiInteractionState::default(),
        None,
    )
}

#[allow(clippy::too_many_arguments)]
pub fn collect_ui_frame_for_display_with_interaction(
    world: &World,
    hierarchy: &TransformHierarchy,
    width: u32,
    height: u32,
    active_camera: Option<FrameCamera>,
    sorting_layers: &SortingLayers,
    target_display: i32,
    interaction: UiInteractionState,
    button_tints: &HashMap<Entity, UiButtonTintTween>,
) -> RuntimeUiFrame {
    collect_ui_frame_internal(
        world,
        hierarchy,
        width,
        height,
        active_camera,
        Some(sorting_layers),
        normalize_target_display(target_display),
        interaction,
        Some(button_tints),
    )
}

#[allow(clippy::too_many_arguments)]
fn collect_ui_frame_internal(
    world: &World,
    hierarchy: &TransformHierarchy,
    width: u32,
    height: u32,
    active_camera: Option<FrameCamera>,
    sorting_layers: Option<&SortingLayers>,
    target_display: i32,
    interaction: UiInteractionState,
    button_tints: Option<&HashMap<Entity, UiButtonTintTween>>,
) -> RuntimeUiFrame {
    let root = UiRect {
        x: 0.0,
        y: 0.0,
        width: width.max(1) as f32,
        height: height.max(1) as f32,
    };
    let mut canvases: Vec<Entity> = world
        .iter_entities()
        .filter(|entity| {
            hierarchy.is_active(*entity)
                && world.get_component::<Canvas>(*entity).is_some()
                && canvas_chain_enabled(world, *entity)
                && is_canvas_render_root(world, *entity)
        })
        .collect();
    canvases.sort_by_key(|entity| canvas_sort_key(world, *entity, sorting_layers));

    let mut primitives = Vec::new();
    let mut world_primitives = Vec::new();
    let mut controls = Vec::new();
    for canvas_entity in canvases {
        let Some(authored_canvas) = world.get_component::<Canvas>(canvas_entity) else {
            continue;
        };
        let inherited_canvas_entity = outermost_canvas(world, canvas_entity);
        let mut canvas = world
            .get_component::<Canvas>(inherited_canvas_entity)
            .cloned()
            .unwrap_or_else(|| authored_canvas.clone());
        if authored_canvas.override_sorting {
            canvas.override_sorting = true;
            canvas.sorting_layer = authored_canvas.sorting_layer.clone();
            canvas.sorting_order = authored_canvas.sorting_order;
        }
        if canvas.render_mode != "ScreenSpaceOverlay"
            && canvas.render_mode != "ScreenSpaceCamera"
            && canvas.render_mode != "WorldSpace"
        {
            continue;
        }
        if canvas.render_mode == "ScreenSpaceOverlay" {
            if normalize_target_display(canvas.target_display) != target_display {
                continue;
            }
        } else if canvas.render_mode == "ScreenSpaceCamera" {
            if let Some(camera_display) = explicit_canvas_camera_display(world, &canvas) {
                if camera_display != target_display {
                    continue;
                }
            }
        }
        let world_space = canvas.render_mode == "WorldSpace";
        let scaler = world.get_component::<CanvasScaler>(inherited_canvas_entity);
        let scale = if world_space {
            1.0
        } else {
            scaler
                .map(|value| canvas_scale_factor(value, root.width, root.height))
                .unwrap_or(1.0)
        };
        let sprite_pixel_scale = scaler
            .map(|value| canvas_sprite_pixel_scale(value, scale))
            .unwrap_or(scale);
        let canvas_rect_transform = world
            .get_component::<RectTransform>(inherited_canvas_entity)
            .cloned()
            .unwrap_or_default();
        let world_canvas_root_rect = world_canvas_rect(&canvas_rect_transform, scaler);
        let canvas_rect = if world_space {
            canvas_rect_in_root(
                world,
                canvas_entity,
                inherited_canvas_entity,
                world_canvas_root_rect,
                1.0,
            )
        } else {
            screen_canvas_rect(world, canvas_entity, inherited_canvas_entity, root, scale)
        };
        let clip_root = if world_space { canvas_rect } else { root };
        let clip = UiClipRect {
            x: clip_root.x.max(0.0) as u32,
            y: clip_root.y.max(0.0) as u32,
            width: clip_root.width.max(1.0) as u32,
            height: clip_root.height.max(1.0) as u32,
        };
        let primitive_start = primitives.len();
        let control_start = controls.len();
        walk(
            world,
            canvas_entity,
            canvas_entity,
            UiWalkLayout {
                parent_rect: canvas_rect,
                scale,
                sprite_pixel_scale,
                clip,
                rect_mask_clip: None,
                forced_rect: Some(canvas_rect),
            },
            UiInheritedState {
                pixel_perfect: !world_space && canvas_pixel_perfect(world, canvas_entity),
                screen_space: !world_space,
                ..UiInheritedState::default()
            },
            interaction,
            button_tints,
            &mut primitives,
            &mut controls,
        );
        let mut world_sort_depth = None;
        if canvas.render_mode == "ScreenSpaceCamera" {
            let camera = active_camera.map(|fallback| {
                resolve_canvas_camera(world, hierarchy, &canvas, root.width / root.height.max(1.0))
                    .unwrap_or(fallback)
            });
            if let Some(camera) = camera {
                let depth = screen_space_camera_depth(camera, canvas.plane_distance);
                for primitive in &mut primitives[primitive_start..] {
                    primitive.depth = depth;
                    primitive.key.depth_test = true;
                }
                let forward = camera
                    .view
                    .inverse()
                    .transform_vector3(-Vec3::Z)
                    .normalize_or_zero();
                let distance = if canvas.plane_distance.is_finite() {
                    canvas.plane_distance.max(0.01)
                } else {
                    100.0
                };
                let plane = UiRaycastPlane {
                    point: camera.position + forward * distance,
                    normal: forward,
                };
                for control in &mut controls[control_start..] {
                    control.raycast_plane = Some(plane);
                    control.raycast_camera = Some(camera);
                }
            } else {
                primitives.truncate(primitive_start);
                controls.truncate(control_start);
            }
        } else if world_space {
            if let Some(camera) = active_camera.map(|fallback| {
                resolve_canvas_camera(world, hierarchy, &canvas, root.width / root.height.max(1.0))
                    .unwrap_or(fallback)
            }) {
                world_sort_depth = project_world_canvas_output(
                    world,
                    hierarchy,
                    inherited_canvas_entity,
                    &canvas_rect_transform,
                    world_canvas_root_rect,
                    scaler,
                    camera,
                    [width.max(1), height.max(1)],
                    &mut primitives,
                    primitive_start,
                    &mut controls,
                    control_start,
                );
            } else {
                primitives.truncate(primitive_start);
                controls.truncate(control_start);
            }
        }
        if world_space {
            let sort_depth = world_sort_depth.or_else(|| {
                primitives[primitive_start..]
                    .first()
                    .map(|primitive| primitive.depth)
            });
            if let Some(sort_depth) = sort_depth {
                world_primitives.extend(primitives.drain(primitive_start..).map(|primitive| {
                    WorldPrimitive {
                        kind: WorldPrimitiveKind::TwoD,
                        sorting_layer: canvas.sorting_layer.clone(),
                        sorting_order: canvas.sorting_order,
                        depth: sort_depth,
                        world_position: None,
                        primitive,
                    }
                }));
            }
        }
    }

    RuntimeUiFrame {
        plan: UiBatchPlan::build(primitives),
        world_primitives,
        controls,
    }
}

fn canvas_render_rank(mode: &str) -> u8 {
    match mode {
        "WorldSpace" => 0,
        "ScreenSpaceCamera" => 1,
        _ => 2,
    }
}

fn normalize_target_display(display: i32) -> i32 {
    display.clamp(0, 7)
}

fn explicit_canvas_camera_display(world: &World, canvas: &Canvas) -> Option<i32> {
    let entity = parse_entity_reference(&canvas.render_camera)?;
    let camera_2d = world.get_component::<Camera2D>(entity);
    let camera_3d = world.get_component::<Camera3D>(entity);
    match (camera_2d, camera_3d) {
        (Some(camera), None) => Some(normalize_target_display(camera.target_display)),
        (None, Some(camera)) => Some(normalize_target_display(camera.target_display)),
        _ => None,
    }
}

fn is_canvas_render_root(world: &World, entity: Entity) -> bool {
    !has_canvas_ancestor(world, entity)
        || world
            .get_component::<Canvas>(entity)
            .is_some_and(|canvas| canvas.override_sorting)
}

fn canvas_chain_enabled(world: &World, entity: Entity) -> bool {
    let mut current = Some(entity);
    let mut guard = 0usize;
    while let Some(candidate) = current {
        if world
            .get_component::<Canvas>(candidate)
            .is_some_and(|canvas| !canvas.enabled)
        {
            return false;
        }
        guard += 1;
        if guard > 4096 {
            return false;
        }
        current = world
            .get_component::<Parent>(candidate)
            .map(|value| value.entity);
    }
    true
}

fn outermost_canvas(world: &World, entity: Entity) -> Entity {
    let mut result = entity;
    let mut current = world
        .get_component::<Parent>(entity)
        .map(|value| value.entity);
    let mut guard = 0usize;
    while let Some(parent) = current {
        if world.get_component::<Canvas>(parent).is_some() {
            result = parent;
        }
        guard += 1;
        if guard > 4096 {
            break;
        }
        current = world
            .get_component::<Parent>(parent)
            .map(|value| value.entity);
    }
    result
}

fn canvas_sort_key(
    world: &World,
    entity: Entity,
    sorting_layers: Option<&SortingLayers>,
) -> (u8, usize, i32) {
    let authored = world.get_component::<Canvas>(entity);
    let inherited = world.get_component::<Canvas>(outermost_canvas(world, entity));
    let mode = inherited
        .or(authored)
        .map(|canvas| canvas.render_mode.as_str())
        .unwrap_or("ScreenSpaceOverlay");
    let source = authored
        .filter(|canvas| canvas.override_sorting)
        .or(inherited);
    let layer = source
        .map(|canvas| canvas.sorting_layer.as_str())
        .unwrap_or("default");
    let order = source
        .map(|canvas| canvas.sorting_order)
        .unwrap_or_default();
    (
        canvas_render_rank(mode),
        sorting_layers
            .map(|layers| layers.rank(layer))
            .unwrap_or_default(),
        order,
    )
}

fn canvas_pixel_perfect(world: &World, entity: Entity) -> bool {
    let mut chain = Vec::new();
    let mut current = Some(entity);
    let mut guard = 0usize;
    while let Some(candidate) = current {
        if world.get_component::<Canvas>(candidate).is_some() {
            chain.push(candidate);
        }
        guard += 1;
        if guard > 4096 {
            break;
        }
        current = world
            .get_component::<Parent>(candidate)
            .map(|parent| parent.entity);
    }
    let mut pixel_perfect = false;
    for (index, canvas_entity) in chain.into_iter().rev().enumerate() {
        let Some(canvas) = world.get_component::<Canvas>(canvas_entity) else {
            continue;
        };
        if index == 0 || canvas.override_pixel_perfect {
            pixel_perfect = canvas.pixel_perfect;
        }
    }
    pixel_perfect
}

fn screen_canvas_rect(
    world: &World,
    entity: Entity,
    root_canvas: Entity,
    screen: UiRect,
    scale: f32,
) -> UiRect {
    let root_transform = world
        .get_component::<RectTransform>(root_canvas)
        .cloned()
        .unwrap_or_default();
    let rect = solve_rect(screen, &root_transform, scale);
    canvas_rect_in_root(world, entity, root_canvas, rect, scale)
}

fn canvas_rect_in_root(
    world: &World,
    entity: Entity,
    root_canvas: Entity,
    root_rect: UiRect,
    scale: f32,
) -> UiRect {
    let mut rect = root_rect;
    if entity == root_canvas {
        return rect;
    }
    let mut chain = Vec::new();
    let mut current = world
        .get_component::<Parent>(entity)
        .map(|value| value.entity);
    let mut guard = 0usize;
    while let Some(parent) = current {
        if parent == root_canvas {
            break;
        }
        chain.push(parent);
        guard += 1;
        if guard > 4096 {
            return rect;
        }
        current = world
            .get_component::<Parent>(parent)
            .map(|value| value.entity);
    }
    for ancestor in chain.into_iter().rev() {
        if let Some(transform) = world.get_component::<RectTransform>(ancestor) {
            rect = solve_rect(rect, transform, scale);
        }
    }
    world
        .get_component::<RectTransform>(entity)
        .map(|transform| solve_rect(rect, transform, scale))
        .unwrap_or(rect)
}

fn world_canvas_rect(rect: &RectTransform, scaler: Option<&CanvasScaler>) -> UiRect {
    let reference = scaler
        .map(|value| value.reference_resolution)
        .unwrap_or([800.0, 600.0]);
    let dimension = |value: f32, fallback: f32| {
        if value.is_finite() && value.abs() > 0.0001 {
            value.abs()
        } else if fallback.is_finite() && fallback > 0.0 {
            fallback
        } else {
            100.0
        }
    };
    UiRect {
        x: 0.0,
        y: 0.0,
        width: dimension(rect.size_delta[0], reference[0]),
        height: dimension(rect.size_delta[1], reference[1]),
    }
}

#[allow(clippy::too_many_arguments)]
fn project_world_canvas_output(
    world: &World,
    hierarchy: &TransformHierarchy,
    canvas_entity: Entity,
    rect_transform: &RectTransform,
    canvas_rect: UiRect,
    scaler: Option<&CanvasScaler>,
    camera: FrameCamera,
    viewport: [u32; 2],
    primitives: &mut Vec<UiPrimitive>,
    primitive_start: usize,
    controls: &mut Vec<UiControlRegion>,
    control_start: usize,
) -> Option<f32> {
    let world_matrix = hierarchy
        .get(canvas_entity)
        .or_else(|| hierarchy.parent_world(world, canvas_entity))
        .map(|value| value.matrix)
        .unwrap_or(Mat4::IDENTITY);
    let pixels_per_unit = scaler
        .map(|value| finite_positive(value.reference_pixels_per_unit, 100.0))
        .unwrap_or(100.0);
    let projection = WorldCanvasProjection {
        world_matrix,
        rect_transform,
        canvas_rect,
        pixels_per_unit,
        camera,
        viewport,
    };
    let plane = UiRaycastPlane {
        point: world_matrix.transform_point3(Vec3::ZERO),
        normal: world_matrix.transform_vector3(Vec3::Z).normalize_or_zero(),
    };
    let sort_depth = projection.project_depth([
        canvas_rect.x + canvas_rect.width * rect_transform.pivot[0],
        canvas_rect.y + canvas_rect.height * rect_transform.pivot[1],
    ]);

    let projected_primitives = primitives
        .drain(primitive_start..)
        .filter_map(|mut primitive| {
            let pixel_corners = rotated_pixel_corners(
                UiRect {
                    x: primitive.rect[0],
                    y: primitive.rect[1],
                    width: primitive.rect[2],
                    height: primitive.rect[3],
                },
                primitive.rotation_radians,
                primitive.pivot,
            );
            let (clip_corners, screen_corners) = projection.project_corners(pixel_corners)?;
            let bounds = screen_bounds(screen_corners);
            primitive.rect = [bounds.x, bounds.y, bounds.width, bounds.height];
            primitive.pivot = [0.5, 0.5];
            primitive.rotation_radians = 0.0;
            primitive.depth = clip_corners
                .iter()
                .map(|corner| corner[2] / corner[3])
                .sum::<f32>()
                * 0.25;
            primitive.clip_corners = Some(clip_corners);
            primitive.key.depth_test = true;
            if let Some(clip) = primitive.key.clip {
                primitive.key.clip = Some(projection.project_clip(clip)?);
            }
            for soft_clip in primitive.soft_clips.iter_mut().flatten() {
                let source = UiRect {
                    x: soft_clip.rect[0],
                    y: soft_clip.rect[1],
                    width: soft_clip.rect[2],
                    height: soft_clip.rect[3],
                };
                let (_, projected) =
                    projection.project_corners(rotated_pixel_corners(source, 0.0, [0.5, 0.5]))?;
                let bounds = screen_bounds(projected);
                let scale_x = bounds.width / source.width.max(0.0001);
                let scale_y = bounds.height / source.height.max(0.0001);
                soft_clip.rect = [bounds.x, bounds.y, bounds.width, bounds.height];
                soft_clip.softness = [
                    soft_clip.softness[0] * scale_x,
                    soft_clip.softness[1] * scale_y,
                ];
            }
            Some(primitive)
        })
        .collect::<Vec<_>>();
    primitives.extend(projected_primitives);

    let projected_controls = controls
        .drain(control_start..)
        .filter_map(|mut control| {
            let (raycast_rect, raycast_pivot) =
                padded_raycast_geometry(control.rect, control.pivot, control.raycast_padding)?;
            let raycast_pixel_corners =
                rotated_pixel_corners(raycast_rect, control.rotation_radians, raycast_pivot);
            let (_, raycast_screen_corners) = projection.project_corners(raycast_pixel_corners)?;
            let pixel_corners =
                rotated_pixel_corners(control.rect, control.rotation_radians, control.pivot);
            let (clip_corners, screen_corners) = projection.project_corners(pixel_corners)?;
            if control.ignore_reversed_graphics && is_reversed_screen_quad(screen_corners) {
                return None;
            }
            control.rect = screen_bounds(screen_corners);
            control.rotation_radians = 0.0;
            control.pivot = [0.5, 0.5];
            control.corners = Some(screen_corners);
            control.raycast_corners = Some(raycast_screen_corners);
            control.corner_inverse_w = Some(clip_corners.map(|corner| {
                if corner[3].is_finite() && corner[3].abs() > 0.000001 {
                    1.0 / corner[3].abs()
                } else {
                    1.0
                }
            }));
            control.clip = projection.project_clip(control.clip)?;
            for mask in control.mask_regions.iter_mut().flatten() {
                let mask_corners =
                    rotated_pixel_corners(mask.rect, mask.rotation_radians, mask.pivot);
                let (_, mask_screen_corners) = projection.project_corners(mask_corners)?;
                mask.rect = screen_bounds(mask_screen_corners);
                mask.rotation_radians = 0.0;
                mask.pivot = [0.5, 0.5];
                mask.corners = Some(mask_screen_corners);
            }
            control.raycast_plane = Some(plane);
            control.raycast_camera = Some(camera);
            Some(control)
        })
        .collect::<Vec<_>>();
    controls.extend(projected_controls);
    sort_depth
}

fn is_reversed_screen_quad(corners: [[f32; 2]; 4]) -> bool {
    let mut twice_area = 0.0;
    for index in 0..4 {
        let current = corners[index];
        let next = corners[(index + 1) % 4];
        twice_area += current[0] * next[1] - current[1] * next[0];
    }
    twice_area < -0.0001
}

struct WorldCanvasProjection<'a> {
    world_matrix: Mat4,
    rect_transform: &'a RectTransform,
    canvas_rect: UiRect,
    pixels_per_unit: f32,
    camera: FrameCamera,
    viewport: [u32; 2],
}

impl WorldCanvasProjection<'_> {
    fn project_depth(&self, pixel: [f32; 2]) -> Option<f32> {
        let world = self.pixel_to_world(pixel);
        let value = self.camera.proj * self.camera.view * world.extend(1.0);
        if !value.is_finite() || value.w <= 0.0001 || value.z < 0.0 || value.z > value.w {
            return None;
        }
        Some(value.z / value.w)
    }

    #[allow(clippy::type_complexity)]
    fn project_corners(&self, pixels: [[f32; 2]; 4]) -> Option<([[f32; 4]; 4], [[f32; 2]; 4])> {
        let mut clip = [[0.0; 4]; 4];
        let mut screen = [[0.0; 2]; 4];
        for index in 0..4 {
            let world = self.pixel_to_world(pixels[index]);
            let value = self.camera.proj * self.camera.view * world.extend(1.0);
            if !value.is_finite() || value.w <= 0.0001 || value.z < 0.0 || value.z > value.w {
                return None;
            }
            clip[index] = value.to_array();
            let ndc = value.truncate() / value.w;
            screen[index] = [
                (ndc.x * 0.5 + 0.5) * self.viewport[0] as f32,
                (0.5 - ndc.y * 0.5) * self.viewport[1] as f32,
            ];
        }
        Some((clip, screen))
    }

    fn project_clip(&self, clip: UiClipRect) -> Option<UiClipRect> {
        let x = clip.x as f32;
        let y = clip.y as f32;
        let width = clip.width as f32;
        let height = clip.height as f32;
        let (_, screen) = self.project_corners([
            [x, y],
            [x + width, y],
            [x + width, y + height],
            [x, y + height],
        ])?;
        let bounds = screen_bounds(screen);
        let left = bounds.x.floor().clamp(0.0, self.viewport[0] as f32) as u32;
        let top = bounds.y.floor().clamp(0.0, self.viewport[1] as f32) as u32;
        let right = (bounds.x + bounds.width)
            .ceil()
            .clamp(left as f32, self.viewport[0] as f32) as u32;
        let bottom = (bounds.y + bounds.height)
            .ceil()
            .clamp(top as f32, self.viewport[1] as f32) as u32;
        (right > left && bottom > top).then_some(UiClipRect {
            x: left,
            y: top,
            width: right - left,
            height: bottom - top,
        })
    }

    fn pixel_to_world(&self, pixel: [f32; 2]) -> Vec3 {
        let pivot = self.rect_transform.pivot;
        let x = (pixel[0] - self.canvas_rect.x - self.canvas_rect.width * pivot[0])
            / self.pixels_per_unit;
        let y = (self.canvas_rect.y + self.canvas_rect.height * pivot[1] - pixel[1])
            / self.pixels_per_unit;
        let local_scale = self.rect_transform.local_scale;
        let local_rotation = Quat::from_rotation_z(self.rect_transform.local_rotation.to_radians());
        let local = local_rotation * Vec3::new(x * local_scale[0], y * local_scale[1], 0.0)
            + Vec3::new(
                self.rect_transform.anchored_position[0] / self.pixels_per_unit,
                self.rect_transform.anchored_position[1] / self.pixels_per_unit,
                0.0,
            );
        self.world_matrix.transform_point3(local)
    }
}

fn rotated_pixel_corners(rect: UiRect, rotation_radians: f32, pivot: [f32; 2]) -> [[f32; 2]; 4] {
    let center = [
        rect.x + rect.width * pivot[0],
        rect.y + rect.height * pivot[1],
    ];
    let c = rotation_radians.cos();
    let s = rotation_radians.sin();
    let transform = |x: f32, y: f32| {
        let dx = x - center[0];
        let dy = y - center[1];
        [center[0] + dx * c - dy * s, center[1] + dx * s + dy * c]
    };
    [
        transform(rect.x, rect.y),
        transform(rect.x + rect.width, rect.y),
        transform(rect.x + rect.width, rect.y + rect.height),
        transform(rect.x, rect.y + rect.height),
    ]
}

fn screen_bounds(corners: [[f32; 2]; 4]) -> UiRect {
    let mut left = f32::INFINITY;
    let mut top = f32::INFINITY;
    let mut right = f32::NEG_INFINITY;
    let mut bottom = f32::NEG_INFINITY;
    for point in corners {
        left = left.min(point[0]);
        top = top.min(point[1]);
        right = right.max(point[0]);
        bottom = bottom.max(point[1]);
    }
    UiRect {
        x: left,
        y: top,
        width: (right - left).max(0.0),
        height: (bottom - top).max(0.0),
    }
}

fn has_canvas_ancestor(world: &World, entity: Entity) -> bool {
    let mut current = world
        .get_component::<Parent>(entity)
        .map(|parent| parent.entity);
    let mut guard = 0usize;
    while let Some(parent) = current {
        if world.get_component::<Canvas>(parent).is_some() {
            return true;
        }
        guard += 1;
        if guard > 4096 {
            break;
        }
        current = world
            .get_component::<Parent>(parent)
            .map(|value| value.entity);
    }
    false
}

fn snap_canvas_output_to_pixels(primitives: &mut [UiPrimitive], controls: &mut [UiControlRegion]) {
    for primitive in primitives {
        primitive.rect = primitive.rect.map(f32::round);
    }
    for control in controls {
        control.rect.x = control.rect.x.round();
        control.rect.y = control.rect.y.round();
        control.rect.width = control.rect.width.round();
        control.rect.height = control.rect.height.round();
    }
}

fn parse_entity_reference(value: &str) -> Option<Entity> {
    let value = value.trim();
    if value.is_empty() {
        return None;
    }
    if let Some((index, generation)) = value.split_once(':') {
        return Some(Entity::new(index.parse().ok()?, generation.parse().ok()?));
    }
    Some(Entity::from_u64(value.parse().ok()?))
}

fn resolve_canvas_camera(
    world: &World,
    hierarchy: &TransformHierarchy,
    canvas: &Canvas,
    aspect: f32,
) -> Option<FrameCamera> {
    let entity = parse_entity_reference(&canvas.render_camera)?;
    let transform = hierarchy.get(entity)?.to_transform();
    let position = Vec3::from(transform.position);
    let rotation = safe_camera_rotation(transform.rotation);
    let view = look_at(position, position + rotation * -Vec3::Z, rotation * Vec3::Y);
    let aspect = aspect.max(0.001);
    let proj = if let Some(camera) = world.get_component::<Camera2D>(entity) {
        orthographic(camera.size.max(0.001), aspect, 0.01, 1000.0)
    } else {
        let camera = world.get_component::<Camera3D>(entity)?;
        let near = camera.near.max(0.001);
        let far = camera.far.max(near + 0.001);
        if camera.projection.eq_ignore_ascii_case("orthographic") {
            orthographic(camera.orthographic_size.max(0.001), aspect, near, far)
        } else {
            perspective(camera.fov_y_degrees.clamp(1.0, 179.0), aspect, near, far)
        }
    };
    Some(FrameCamera {
        view,
        proj,
        position,
    })
}

fn safe_camera_rotation(value: [f32; 4]) -> Quat {
    let rotation = Quat::from_xyzw(value[0], value[1], value[2], value[3]);
    if rotation.is_finite() && rotation.length_squared() > 0.000001 {
        rotation.normalize()
    } else {
        Quat::IDENTITY
    }
}

fn screen_space_camera_depth(camera: FrameCamera, distance: f32) -> f32 {
    let distance = if distance.is_finite() {
        distance.max(0.01)
    } else {
        100.0
    };
    let clip = camera.proj * Vec3::new(0.0, 0.0, -distance).extend(1.0);
    if clip.w.abs() > 0.000001 && clip.z.is_finite() {
        (clip.z / clip.w).clamp(0.0, 1.0)
    } else {
        0.0
    }
}

#[allow(clippy::too_many_arguments)]
fn walk(
    world: &World,
    entity: Entity,
    canvas_root: Entity,
    layout_state: UiWalkLayout,
    inherited: UiInheritedState,
    interaction: UiInteractionState,
    button_tints: Option<&HashMap<Entity, UiButtonTintTween>>,
    primitives: &mut Vec<UiPrimitive>,
    controls: &mut Vec<UiControlRegion>,
) {
    if !world.entity_active(entity) {
        return;
    }
    if world
        .get_component::<Canvas>(entity)
        .is_some_and(|canvas| !canvas.enabled)
    {
        return;
    }
    if entity != canvas_root
        && world
            .get_component::<Canvas>(entity)
            .is_some_and(|canvas| canvas.override_sorting)
    {
        return;
    }
    let rect_transform = world
        .get_component::<RectTransform>(entity)
        .cloned()
        .unwrap_or_default();
    let UiWalkLayout {
        parent_rect,
        scale,
        sprite_pixel_scale,
        clip: base_clip,
        rect_mask_clip,
        forced_rect,
    } = layout_state;
    let mut rect = forced_rect.unwrap_or_else(|| solve_rect(parent_rect, &rect_transform, scale));
    if let (Some(fitter), Some(layout)) = (
        world.get_component::<ContentSizeFitter>(entity),
        world.get_component::<LayoutGroup>(entity),
    ) {
        rect = apply_content_size(
            rect,
            rect_transform.pivot,
            &fitter.horizontal_fit,
            &fitter.vertical_fit,
            measure_layout_content(layout, children_of(world, entity).len(), scale),
        );
    }
    if let Some(fitter) = world.get_component::<AspectRatioFitter>(entity) {
        rect = apply_aspect_ratio(
            rect,
            parent_rect,
            rect_transform.pivot,
            &fitter.aspect_mode,
            fitter.aspect_ratio,
        );
    }
    let rotation = -rect_transform.local_rotation.to_radians();
    let pivot = rect_transform.pivot;
    let mut state = inherited;
    if world.get_component::<Canvas>(entity).is_some() {
        state.canvas_group = Some(entity.to_u64());
        let raycaster = world.get_component::<GraphicRaycaster>(entity);
        state.raycaster_enabled = raycaster.is_some_and(|value| value.enabled);
        state.ignore_reversed_graphics = raycaster
            .map(|value| value.ignore_reversed_graphics)
            .unwrap_or(true);
        state.blocking_objects = raycaster
            .map(|value| BlockingObjects::parse(&value.blocking_objects))
            .unwrap_or(BlockingObjects::None);
        state.blocking_mask = raycaster.map_or(-1, |value| value.blocking_mask);
    }
    if state.screen_space {
        if let Some(canvas) = world.get_component::<Canvas>(entity) {
            if canvas.override_pixel_perfect {
                state.pixel_perfect = canvas.pixel_perfect;
            }
        }
    }
    state = apply_canvas_group(state, world.get_component::<CanvasGroup>(entity));
    let mut child_clip = base_clip;
    let mut child_rect_mask_clip = rect_mask_clip;
    if let Some(mask) = world.get_component::<RectMask2D>(entity) {
        if mask.enabled {
            let mut mask_rect = inset_rect_lbrt(rect, mask.padding, scale);
            if state.pixel_perfect {
                mask_rect.x = mask_rect.x.round();
                mask_rect.y = mask_rect.y.round();
                mask_rect.width = mask_rect.width.round();
                mask_rect.height = mask_rect.height.round();
            }
            child_rect_mask_clip = Some(match child_rect_mask_clip {
                Some(inherited) => intersect_rect(inherited, mask_rect),
                None => mask_rect,
            });
            if let Some(slot) = state.soft_clips.iter_mut().find(|slot| slot.is_none()) {
                *slot = Some(UiSoftClip {
                    rect: [mask_rect.x, mask_rect.y, mask_rect.width, mask_rect.height],
                    softness: [
                        finite_non_negative(mask.softness[0]) * scale,
                        finite_non_negative(mask.softness[1]) * scale,
                    ],
                });
            }
        }
    }
    if world.get_component::<ScrollView>(entity).is_some()
        || world.get_component::<ListView>(entity).is_some()
    {
        child_clip = intersect_clip(child_clip, rect);
    }
    let authored_image = world.get_component::<Image>(entity);
    let authored_raw_image = world.get_component::<RawImage>(entity);
    let authored_text = world.get_component::<Text>(entity);
    let authored_panel = world.get_component::<Panel>(entity);
    let image = authored_image.filter(|graphic| graphic.enabled);
    let raw_image = authored_raw_image.filter(|graphic| graphic.enabled);
    let text = authored_text.filter(|graphic| graphic.enabled);
    let panel = authored_panel.filter(|graphic| graphic.enabled);
    let has_authored_graphic = authored_image.is_some()
        || authored_raw_image.is_some()
        || authored_text.is_some()
        || authored_panel.is_some();
    let has_enabled_graphic =
        image.is_some() || raw_image.is_some() || text.is_some() || panel.is_some();
    let graphic_maskable = image
        .map(|graphic| graphic.maskable)
        .or_else(|| raw_image.map(|graphic| graphic.maskable))
        .or_else(|| text.map(|graphic| graphic.maskable))
        .or_else(|| panel.map(|graphic| graphic.maskable))
        .unwrap_or(true);
    let clip = if graphic_maskable {
        rect_mask_clip.map_or(base_clip, |mask_clip| intersect_clip(base_clip, mask_clip))
    } else {
        base_clip
    };
    let receives_graphic_raycast = !has_authored_graphic
        || image.is_some_and(|graphic| graphic.raycast_target)
        || raw_image.is_some_and(|graphic| graphic.raycast_target)
        || text.is_some_and(|graphic| graphic.raycast_target)
        || panel.is_some_and(|graphic| graphic.raycast_target);
    let graphic_start = primitives.len();
    let control_start = controls.len();
    let image_sprite_pixel_scale = image.map_or(sprite_pixel_scale, |image| {
        let multiplier = if image.pixels_per_unit_multiplier.is_finite() {
            image.pixels_per_unit_multiplier.max(0.01)
        } else {
            1.0
        };
        sprite_pixel_scale / multiplier
    });

    if let Some(image) = image {
        if image.image_type.eq_ignore_ascii_case("tiled") {
            push_tiled_image(
                primitives,
                rect,
                multiply_alpha(image.color, state.alpha),
                pivot,
                rotation,
                &image.sprite,
                image.border,
                image.source_size,
                image_sprite_pixel_scale,
                image.fill_center,
                clip,
            );
        } else if image.image_type.eq_ignore_ascii_case("filled") {
            push_filled_image(
                primitives,
                rect,
                multiply_alpha(image.color, state.alpha),
                pivot,
                rotation,
                &image.sprite,
                image.source_size,
                image.preserve_aspect,
                &image.fill_method,
                image.fill_amount,
                image.fill_clockwise,
                image.fill_origin,
                clip,
            );
        } else if image.image_type.eq_ignore_ascii_case("sliced") {
            push_sliced_image(
                primitives,
                rect,
                multiply_alpha(image.color, state.alpha),
                pivot,
                rotation,
                &image.sprite,
                image.border,
                image.source_size,
                image_sprite_pixel_scale,
                image.fill_center,
                clip,
            );
        } else {
            let (image_rect, image_pivot) =
                image_geometry(rect, pivot, image.source_size, image.preserve_aspect);
            primitives.push(primitive(
                image_rect,
                multiply_alpha(image.color, state.alpha),
                image_pivot,
                rotation,
                "ui/image",
                &image.sprite,
                clip,
            ));
        }
        if image.raycast_target && state.accepts_raycasts() {
            controls.push(control_region(
                entity,
                rect,
                rotation,
                pivot,
                clip,
                state.ignore_reversed_graphics,
                UiControlKind::Blocker,
                Value::Null,
            ));
        }
    }

    if let Some(raw_image) = raw_image {
        let mut output = primitive(
            rect,
            multiply_alpha(raw_image.color, state.alpha),
            pivot,
            rotation,
            "ui/raw-image",
            &raw_image.texture,
            clip,
        );
        output.uv = raw_image.uv_rect;
        primitives.push(output);
        if raw_image.raycast_target && state.accepts_raycasts() {
            controls.push(control_region(
                entity,
                rect,
                rotation,
                pivot,
                clip,
                state.ignore_reversed_graphics,
                UiControlKind::Blocker,
                Value::Null,
            ));
        }
    }

    if text.is_some_and(|value| value.raycast_target) && state.accepts_raycasts() {
        controls.push(control_region(
            entity,
            rect,
            rotation,
            pivot,
            clip,
            state.ignore_reversed_graphics,
            UiControlKind::Blocker,
            Value::Null,
        ));
    }

    if let Some(button) = world.get_component::<Button>(entity) {
        if authored_image.is_none() && authored_raw_image.is_none() {
            primitives.push(primitive(
                rect,
                [0.25, 0.45, 0.85, state.alpha],
                pivot,
                rotation,
                "ui/button",
                "white",
                clip,
            ));
        }
        let target_end = primitives.len();
        if button.transition.eq_ignore_ascii_case("ColorTint") {
            let visual_state =
                interaction.button_state(entity, button.interactable && state.interactable);
            let tint = button_tints
                .and_then(|cache| cache.get(&entity))
                .map(|tween| tween.current)
                .unwrap_or_else(|| button_target_tint(button, visual_state));
            for primitive in &mut primitives[graphic_start..target_end] {
                primitive.color = multiply_color(primitive.color, tint);
            }
        } else if button.transition.eq_ignore_ascii_case("SpriteSwap") {
            let visual_state =
                interaction.button_state(entity, button.interactable && state.interactable);
            if let Some(sprite) = button_target_sprite(button, visual_state) {
                for primitive in &mut primitives[graphic_start..target_end] {
                    if primitive.key.material == "ui/image" {
                        primitive.key.texture = sprite.to_owned();
                    }
                }
            }
        }
        push_text(
            primitives,
            rect,
            &button.label,
            multiply_alpha(button.text_color, state.alpha),
            button.font_size * scale,
            "Center",
            "Middle",
            clip,
        );
        if button.interactable
            && state.interactable
            && receives_graphic_raycast
            && state.accepts_raycasts()
        {
            controls.push(UiControlRegion {
                entity,
                rect,
                raycast_padding: [0.0; 4],
                clip,
                rotation_radians: rotation,
                pivot,
                corners: None,
                raycast_corners: None,
                corner_inverse_w: None,
                ignore_reversed_graphics: state.ignore_reversed_graphics,
                blocking_objects: state.blocking_objects,
                blocking_mask: state.blocking_mask,
                raycast_plane: None,
                raycast_camera: None,
                mask_regions: [None; 8],
                image_alpha_hit_test: None,
                kind: UiControlKind::Button,
                callback: button.on_click.clone(),
            });
        }
    }

    if let Some(text) = text {
        push_text_styled(
            primitives,
            rect,
            &text.text,
            multiply_alpha(text.color, state.alpha),
            multiply_alpha(text.outline_color, state.alpha),
            (text.outline_width * scale).max(0.0),
            text.font_size * scale,
            &text.alignment,
            &text.vertical_align,
            clip,
        );
    }

    if let Some(toggle) = world.get_component::<Toggle>(entity) {
        let alpha = state.alpha
            * if toggle.interactable && state.interactable {
                1.0
            } else {
                0.45
            };
        let box_size = (rect.height - 8.0).clamp(12.0, 24.0);
        let box_rect = UiRect {
            x: rect.x + 4.0,
            y: rect.y + (rect.height - box_size) * 0.5,
            width: box_size,
            height: box_size,
        };
        primitives.push(primitive(
            box_rect,
            [0.08, 0.09, 0.1, alpha],
            [0.5, 0.5],
            rotation,
            "ui/toggle",
            "white",
            clip,
        ));
        if toggle.is_on {
            let inset = 3.0;
            primitives.push(primitive(
                UiRect {
                    x: box_rect.x + inset,
                    y: box_rect.y + inset,
                    width: (box_rect.width - inset * 2.0).max(0.0),
                    height: (box_rect.height - inset * 2.0).max(0.0),
                },
                multiply_alpha(toggle.color, alpha),
                [0.5, 0.5],
                rotation,
                "ui/toggle",
                "white",
                clip,
            ));
        }
        push_text(
            primitives,
            UiRect {
                x: box_rect.x + box_rect.width + 8.0,
                y: rect.y,
                width: (rect.width - box_rect.width - 16.0).max(0.0),
                height: rect.height,
            },
            &toggle.label,
            multiply_alpha(toggle.text_color, alpha),
            toggle.font_size * scale,
            "Left",
            "Middle",
            clip,
        );
        if toggle.interactable
            && state.interactable
            && receives_graphic_raycast
            && state.accepts_raycasts()
        {
            controls.push(UiControlRegion {
                entity,
                rect,
                raycast_padding: [0.0; 4],
                clip,
                rotation_radians: rotation,
                pivot,
                corners: None,
                raycast_corners: None,
                corner_inverse_w: None,
                ignore_reversed_graphics: state.ignore_reversed_graphics,
                blocking_objects: state.blocking_objects,
                blocking_mask: state.blocking_mask,
                raycast_plane: None,
                raycast_camera: None,
                mask_regions: [None; 8],
                image_alpha_hit_test: None,
                kind: UiControlKind::Toggle {
                    is_on: toggle.is_on,
                },
                callback: toggle.on_value_changed.clone(),
            });
        }
    }

    if let Some(slider) = world.get_component::<Slider>(entity) {
        let alpha = state.alpha
            * if slider.interactable && state.interactable {
                1.0
            } else {
                0.45
            };
        primitives.push(primitive(
            rect,
            multiply_alpha(slider.background_color, alpha),
            pivot,
            rotation,
            "ui/slider",
            "white",
            clip,
        ));
        let (fill_rect, vertical, reverse) = range_fill_rect(
            rect,
            slider.min_value,
            slider.max_value,
            slider.value,
            &slider.direction,
        );
        primitives.push(primitive(
            fill_rect,
            multiply_alpha(slider.fill_color, alpha),
            pivot,
            rotation,
            "ui/slider",
            "white",
            clip,
        ));
        let handle_rect = if vertical {
            let y = if reverse {
                fill_rect.y
            } else {
                fill_rect.y + fill_rect.height
            };
            UiRect {
                x: rect.x - 2.0,
                y: y - 3.0,
                width: rect.width + 4.0,
                height: 6.0,
            }
        } else {
            let x = if reverse {
                fill_rect.x
            } else {
                fill_rect.x + fill_rect.width
            };
            UiRect {
                x: x - 3.0,
                y: rect.y - 2.0,
                width: 6.0,
                height: rect.height + 4.0,
            }
        };
        primitives.push(primitive(
            handle_rect,
            multiply_alpha(slider.handle_color, alpha),
            pivot,
            rotation,
            "ui/slider",
            "white",
            clip,
        ));
        if slider.interactable
            && state.interactable
            && receives_graphic_raycast
            && state.accepts_raycasts()
        {
            controls.push(UiControlRegion {
                entity,
                rect,
                raycast_padding: [0.0; 4],
                clip,
                rotation_radians: rotation,
                pivot,
                corners: None,
                raycast_corners: None,
                corner_inverse_w: None,
                ignore_reversed_graphics: state.ignore_reversed_graphics,
                blocking_objects: state.blocking_objects,
                blocking_mask: state.blocking_mask,
                raycast_plane: None,
                raycast_camera: None,
                mask_regions: [None; 8],
                image_alpha_hit_test: None,
                kind: UiControlKind::Slider {
                    min: slider.min_value,
                    max: slider.max_value,
                    value: slider.value,
                    whole_numbers: slider.whole_numbers,
                    direction: slider.direction.clone(),
                },
                callback: slider.on_value_changed.clone(),
            });
        }
    }

    if let Some(scrollbar) = world.get_component::<Scrollbar>(entity) {
        let alpha = state.alpha
            * if scrollbar.interactable && state.interactable {
                1.0
            } else {
                0.45
            };
        primitives.push(primitive(
            rect,
            multiply_alpha(scrollbar.background_color, alpha),
            pivot,
            rotation,
            "ui/scrollbar",
            "white",
            clip,
        ));
        let vertical = scrollbar.direction == "BottomToTop" || scrollbar.direction == "TopToBottom";
        let reverse = scrollbar.direction == "RightToLeft" || scrollbar.direction == "BottomToTop";
        let size = scrollbar.size.clamp(0.0, 1.0);
        let value = scrollbar.value.clamp(0.0, 1.0);
        let t = if reverse { 1.0 - value } else { value };
        let handle_rect = if vertical {
            let handle = (rect.height * size).clamp(4.0_f32.min(rect.height), rect.height);
            UiRect {
                x: rect.x,
                y: rect.y + (rect.height - handle) * t,
                width: rect.width,
                height: handle,
            }
        } else {
            let handle = (rect.width * size).clamp(4.0_f32.min(rect.width), rect.width);
            UiRect {
                x: rect.x + (rect.width - handle) * t,
                y: rect.y,
                width: handle,
                height: rect.height,
            }
        };
        primitives.push(primitive(
            handle_rect,
            multiply_alpha(scrollbar.handle_color, alpha),
            pivot,
            rotation,
            "ui/scrollbar",
            "white",
            clip,
        ));
        if scrollbar.interactable
            && state.interactable
            && receives_graphic_raycast
            && state.accepts_raycasts()
        {
            controls.push(UiControlRegion {
                entity,
                rect,
                raycast_padding: [0.0; 4],
                clip,
                rotation_radians: rotation,
                pivot,
                corners: None,
                raycast_corners: None,
                corner_inverse_w: None,
                ignore_reversed_graphics: state.ignore_reversed_graphics,
                blocking_objects: state.blocking_objects,
                blocking_mask: state.blocking_mask,
                raycast_plane: None,
                raycast_camera: None,
                mask_regions: [None; 8],
                image_alpha_hit_test: None,
                kind: UiControlKind::Scrollbar {
                    value: scrollbar.value,
                    size: scrollbar.size,
                    number_of_steps: scrollbar.number_of_steps,
                    direction: scrollbar.direction.clone(),
                },
                callback: scrollbar.on_value_changed.clone(),
            });
        }
    }

    if let Some(panel) = panel {
        primitives.push(primitive(
            rect,
            multiply_alpha(panel.color, state.alpha),
            pivot,
            rotation,
            "ui/panel",
            "white",
            clip,
        ));
        if panel.border_width > 0.0 {
            push_border(
                primitives,
                rect,
                panel.border_width * scale,
                multiply_alpha(panel.border_color, state.alpha),
                clip,
            );
        }
        if panel.raycast_target && state.accepts_raycasts() {
            controls.push(control_region(
                entity,
                rect,
                rotation,
                pivot,
                clip,
                state.ignore_reversed_graphics,
                UiControlKind::Blocker,
                Value::Null,
            ));
        }
    }

    if let Some(progress) = world.get_component::<ProgressBar>(entity) {
        primitives.push(primitive(
            rect,
            multiply_alpha(progress.background_color, state.alpha),
            pivot,
            rotation,
            "ui/progress",
            "white",
            clip,
        ));
        let (fill_rect, _, _) = range_fill_rect(
            rect,
            progress.min_value,
            progress.max_value,
            progress.value,
            &progress.direction,
        );
        primitives.push(primitive(
            fill_rect,
            multiply_alpha(progress.fill_color, state.alpha),
            pivot,
            rotation,
            "ui/progress",
            "white",
            clip,
        ));
        if progress.show_label {
            let percent =
                range_fraction(progress.min_value, progress.max_value, progress.value) * 100.0;
            push_text(
                primitives,
                rect,
                &format!("{percent:.0}%"),
                multiply_alpha(progress.text_color, state.alpha),
                progress.font_size * scale,
                "Center",
                "Middle",
                clip,
            );
        }
    }

    if let Some(input) = world.get_component::<InputField>(entity) {
        let enabled = input.interactable && state.interactable;
        let alpha = state.alpha * if enabled { 1.0 } else { 0.45 };
        primitives.push(primitive(
            rect,
            multiply_alpha(input.background_color, alpha),
            pivot,
            rotation,
            "ui/input",
            "white",
            clip,
        ));
        push_border(primitives, rect, scale, [0.32, 0.38, 0.48, alpha], clip);
        let (value, color) = if input.text.is_empty() {
            (&input.placeholder, input.placeholder_color)
        } else {
            (&input.text, input.text_color)
        };
        push_text(
            primitives,
            inset_rect(rect, [8.0, 2.0, 8.0, 2.0], scale),
            value,
            multiply_alpha(color, alpha),
            input.font_size * scale,
            "Left",
            "Middle",
            clip,
        );
        if enabled && receives_graphic_raycast && state.accepts_raycasts() {
            controls.push(control_region(
                entity,
                rect,
                rotation,
                pivot,
                clip,
                state.ignore_reversed_graphics,
                UiControlKind::InputField,
                input.on_value_changed.clone(),
            ));
        }
    }

    if let Some(dropdown) = world.get_component::<Dropdown>(entity) {
        let enabled = dropdown.interactable && state.interactable;
        let alpha = state.alpha * if enabled { 1.0 } else { 0.45 };
        primitives.push(primitive(
            rect,
            multiply_alpha(dropdown.background_color, alpha),
            pivot,
            rotation,
            "ui/dropdown",
            "white",
            clip,
        ));
        let selected = dropdown
            .options
            .get(dropdown.selected_index.max(0) as usize)
            .map(String::as_str)
            .unwrap_or("Select...");
        push_text(
            primitives,
            inset_rect(rect, [8.0, 0.0, 26.0, 0.0], scale),
            selected,
            multiply_alpha(dropdown.text_color, alpha),
            dropdown.font_size * scale,
            "Left",
            "Middle",
            clip,
        );
        push_text(
            primitives,
            UiRect {
                x: rect.x + rect.width - 24.0 * scale,
                width: 20.0 * scale,
                ..rect
            },
            if dropdown.expanded { "^" } else { "v" },
            multiply_alpha(dropdown.text_color, alpha),
            dropdown.font_size * scale,
            "Center",
            "Middle",
            clip,
        );
        if enabled && receives_graphic_raycast && state.accepts_raycasts() {
            controls.push(control_region(
                entity,
                rect,
                rotation,
                pivot,
                clip,
                state.ignore_reversed_graphics,
                UiControlKind::Dropdown { option_index: None },
                dropdown.on_value_changed.clone(),
            ));
        }
        if dropdown.expanded {
            for (index, option) in dropdown.options.iter().enumerate() {
                let option_rect = UiRect {
                    x: rect.x,
                    y: rect.y + rect.height * (index as f32 + 1.0),
                    width: rect.width,
                    height: rect.height,
                };
                let color = if index as i32 == dropdown.selected_index {
                    dropdown.selected_color
                } else {
                    dropdown.item_color
                };
                primitives.push(primitive(
                    option_rect,
                    multiply_alpha(color, alpha),
                    pivot,
                    rotation,
                    "ui/dropdown/item",
                    "white",
                    clip,
                ));
                push_text(
                    primitives,
                    inset_rect(option_rect, [8.0, 0.0, 8.0, 0.0], scale),
                    option,
                    multiply_alpha(dropdown.text_color, alpha),
                    dropdown.font_size * scale,
                    "Left",
                    "Middle",
                    clip,
                );
                if enabled && receives_graphic_raycast && state.accepts_raycasts() {
                    controls.push(control_region(
                        entity,
                        option_rect,
                        rotation,
                        pivot,
                        clip,
                        state.ignore_reversed_graphics,
                        UiControlKind::Dropdown {
                            option_index: Some(index as i32),
                        },
                        dropdown.on_value_changed.clone(),
                    ));
                }
            }
        }
    }

    if let Some(list) = world.get_component::<ListView>(entity) {
        let enabled = list.interactable && state.interactable;
        let alpha = state.alpha * if enabled { 1.0 } else { 0.45 };
        primitives.push(primitive(
            rect,
            multiply_alpha(list.background_color, alpha),
            pivot,
            rotation,
            "ui/list",
            "white",
            clip,
        ));
        let row_height = (list.item_height * scale).max(1.0);
        let spacing = list.spacing * scale;
        let stride = (row_height + spacing).max(1.0);
        let first_visible = (list.scroll_offset * scale / stride).floor().max(0.0) as usize;
        let visible_count = (rect.height / stride).ceil().max(0.0) as usize + 2;
        let last_visible = (first_visible + visible_count).min(list.items.len());
        for index in first_visible..last_visible {
            let item = &list.items[index];
            let row = UiRect {
                x: rect.x + 2.0 * scale,
                y: rect.y + index as f32 * stride - list.scroll_offset * scale,
                width: (rect.width - 4.0 * scale).max(0.0),
                height: row_height,
            };
            if !rects_overlap(row, rect) {
                continue;
            }
            let color = if index as i32 == list.selected_index {
                list.selected_color
            } else {
                list.item_color
            };
            primitives.push(primitive(
                row,
                multiply_alpha(color, alpha),
                [0.5, 0.5],
                rotation,
                "ui/list/item",
                "white",
                child_clip,
            ));
            push_text(
                primitives,
                inset_rect(row, [8.0, 0.0, 8.0, 0.0], scale),
                item,
                multiply_alpha(list.text_color, alpha),
                list.font_size * scale,
                "Left",
                "Middle",
                child_clip,
            );
            if enabled && receives_graphic_raycast && state.accepts_raycasts() {
                controls.push(control_region(
                    entity,
                    intersect_rect(row, rect),
                    rotation,
                    pivot,
                    child_clip,
                    state.ignore_reversed_graphics,
                    UiControlKind::ListItem {
                        index: index as i32,
                    },
                    list.on_value_changed.clone(),
                ));
            }
        }
    }

    if let Some(scroll) = world.get_component::<ScrollView>(entity) {
        primitives.push(primitive(
            rect,
            multiply_alpha(scroll.viewport_color, state.alpha),
            pivot,
            rotation,
            "ui/scroll",
            "white",
            clip,
        ));
        if state.interactable && receives_graphic_raycast && state.accepts_raycasts() {
            controls.push(control_region(
                entity,
                rect,
                rotation,
                pivot,
                clip,
                state.ignore_reversed_graphics,
                UiControlKind::ScrollView,
                scroll.on_value_changed.clone(),
            ));
        }
        if scroll.show_scrollbar && scroll.vertical {
            let track = UiRect {
                x: rect.x + rect.width - 6.0 * scale,
                width: 4.0 * scale,
                ..rect
            };
            primitives.push(primitive(
                track,
                [0.05, 0.06, 0.08, state.alpha],
                pivot,
                rotation,
                "ui/scrollbar",
                "white",
                clip,
            ));
            let thumb = UiRect {
                y: rect.y + scroll.normalized_position[1].clamp(0.0, 1.0) * (rect.height * 0.7),
                height: rect.height * 0.3,
                ..track
            };
            primitives.push(primitive(
                thumb,
                [0.38, 0.44, 0.54, state.alpha],
                pivot,
                rotation,
                "ui/scrollbar",
                "white",
                clip,
            ));
        }
    }

    if let Some(tab_view) = world.get_component::<TabView>(entity) {
        primitives.push(primitive(
            rect,
            multiply_alpha(tab_view.background_color, state.alpha),
            pivot,
            rotation,
            "ui/tabs",
            "white",
            clip,
        ));
        let count = tab_view.tabs.len().max(1);
        let tab_width = rect.width / count as f32;
        let tab_height = (tab_view.tab_height * scale).min(rect.height);
        for (index, label) in tab_view.tabs.iter().enumerate() {
            let tab_rect = UiRect {
                x: rect.x + tab_width * index as f32,
                y: rect.y,
                width: tab_width,
                height: tab_height,
            };
            let color = if index as i32 == tab_view.selected_index {
                tab_view.selected_color
            } else {
                tab_view.tab_color
            };
            primitives.push(primitive(
                tab_rect,
                multiply_alpha(color, state.alpha),
                pivot,
                rotation,
                "ui/tabs/tab",
                "white",
                clip,
            ));
            push_text(
                primitives,
                tab_rect,
                label,
                multiply_alpha(tab_view.text_color, state.alpha),
                tab_view.font_size * scale,
                "Center",
                "Middle",
                clip,
            );
            if tab_view.interactable
                && state.interactable
                && receives_graphic_raycast
                && state.accepts_raycasts()
            {
                controls.push(control_region(
                    entity,
                    tab_rect,
                    rotation,
                    pivot,
                    clip,
                    state.ignore_reversed_graphics,
                    UiControlKind::Tab {
                        index: index as i32,
                    },
                    tab_view.on_value_changed.clone(),
                ));
            }
        }
    }

    if has_enabled_graphic {
        apply_graphic_effects(
            primitives,
            graphic_start,
            world.get_component::<Shadow>(entity),
            world.get_component::<Outline>(entity),
            scale,
            state.alpha,
        );
    }
    let cull_transparent_mesh = world
        .get_component::<CanvasRenderer>(entity)
        .is_none_or(|renderer| renderer.cull_transparent_mesh);
    if cull_transparent_mesh
        && graphic_start < primitives.len()
        && primitives[graphic_start..].iter().all(|primitive| {
            primitive.color[3].is_finite()
                && primitive.color[3].abs() <= TRANSPARENT_MESH_ALPHA_EPSILON
        })
    {
        // CanvasRenderer culling is visual-only: keep controls and authored Mask
        // identity so transparent blockers and empty stencil sources retain meaning.
        primitives.truncate(graphic_start);
    }
    if state.pixel_perfect {
        snap_canvas_output_to_pixels(
            &mut primitives[graphic_start..],
            &mut controls[control_start..],
        );
    }

    for primitive in &mut primitives[graphic_start..] {
        primitive.key.canvas_group = state.canvas_group;
        primitive.soft_clips = if graphic_maskable {
            inherited.soft_clips
        } else {
            [None; 8]
        };
    }

    let mask = world
        .get_component::<Mask>(entity)
        .filter(|mask| mask.enabled);
    let has_mask_graphic = has_authored_graphic || graphic_start < primitives.len();
    let mask_enabled =
        mask.is_some() && has_mask_graphic && state.stencil_depth < state.mask_regions.len() as u8;
    let mut mask_pop = Vec::new();
    if graphic_start < primitives.len() {
        let mut graphic: Vec<UiPrimitive> = primitives.drain(graphic_start..).collect();
        if let Some(mask) = mask.filter(|_| mask_enabled) {
            if mask.show_mask_graphic {
                let mut visible = graphic.clone();
                if state.stencil_depth > 0 {
                    for primitive in &mut visible {
                        primitive.key.stencil = UiStencilMode::Test {
                            reference: state.stencil_depth,
                        };
                    }
                }
                primitives.extend(visible);
            }
            for primitive in &mut graphic {
                primitive.key.stencil = UiStencilMode::Push {
                    reference: state.stencil_depth,
                };
            }
            primitives.extend(graphic.iter().cloned());
            mask_pop = graphic;
            for primitive in &mut mask_pop {
                primitive.key.stencil = UiStencilMode::Pop {
                    reference: state.stencil_depth + 1,
                };
            }
            state.stencil_depth += 1;
        } else {
            if graphic_maskable && state.stencil_depth > 0 {
                for primitive in &mut graphic {
                    primitive.key.stencil = UiStencilMode::Test {
                        reference: state.stencil_depth,
                    };
                }
            }
            primitives.extend(graphic);
        }
    } else if mask_enabled {
        // Unity MaskEnabled only requires an associated Graphic. A disabled Graphic
        // emits no stencil geometry, but descendants still test the reserved depth.
        state.stencil_depth += 1;
    }
    let raycast_padding = image
        .map(|graphic| graphic.raycast_padding)
        .or_else(|| raw_image.map(|graphic| graphic.raycast_padding))
        .or_else(|| text.map(|graphic| graphic.raycast_padding))
        .or_else(|| panel.map(|graphic| graphic.raycast_padding))
        .unwrap_or([0.0; 4])
        .map(|value| {
            if value.is_finite() {
                value * scale
            } else {
                0.0
            }
        });
    let image_alpha_hit_test = image.and_then(|image| {
        (image.raycast_target && image.alpha_hit_test_minimum_threshold > 0.0).then(|| {
            let sprite = world
                .get_component::<Button>(entity)
                .filter(|button| button.transition.eq_ignore_ascii_case("SpriteSwap"))
                .and_then(|button| {
                    let visual_state =
                        interaction.button_state(entity, button.interactable && state.interactable);
                    button_target_sprite(button, visual_state)
                })
                .unwrap_or(&image.sprite)
                .to_owned();
            let pixel_scale = if image_sprite_pixel_scale.is_finite() {
                image_sprite_pixel_scale.max(0.0)
            } else {
                1.0
            };
            UiImageAlphaHitTest {
                threshold: image.alpha_hit_test_minimum_threshold,
                sprite,
                image_type: image.image_type.clone(),
                source_size: image.source_size,
                source_border: image.border,
                destination_border: image.border.map(|value| value.max(0.0) * pixel_scale),
                destination_size: [
                    if state.pixel_perfect {
                        rect.width.round()
                    } else {
                        rect.width
                    },
                    if state.pixel_perfect {
                        rect.height.round()
                    } else {
                        rect.height
                    },
                ],
                pixel_scale,
                fill_center: image.fill_center,
                texture_uv: [0.0, 0.0, 1.0, 1.0],
                texture: None,
            }
        })
    });
    for control in &mut controls[control_start..] {
        control.raycast_padding = raycast_padding;
        control.blocking_objects = state.blocking_objects;
        control.blocking_mask = state.blocking_mask;
        control.mask_regions = if graphic_maskable {
            inherited.mask_regions
        } else {
            [None; 8]
        };
        control.image_alpha_hit_test = image_alpha_hit_test.clone();
    }
    controls[control_start..].sort_by_key(|control| {
        if matches!(
            &control.kind,
            UiControlKind::Blocker | UiControlKind::ScrollView
        ) {
            0
        } else {
            1
        }
    });

    if mask_enabled {
        if let Some(slot) = state.mask_regions.iter_mut().find(|slot| slot.is_none()) {
            let mask_rect = if state.pixel_perfect {
                UiRect {
                    x: rect.x.round(),
                    y: rect.y.round(),
                    width: rect.width.round(),
                    height: rect.height.round(),
                }
            } else {
                rect
            };
            *slot = Some(UiMaskRegion {
                rect: mask_rect,
                rotation_radians: rotation,
                pivot,
                corners: None,
            });
        }
    }

    let mut children = children_of(world, entity);
    if let Some(tab_view) = world.get_component::<TabView>(entity) {
        if !children.is_empty() {
            let selected = tab_view.selected_index.clamp(0, children.len() as i32 - 1) as usize;
            children = vec![children[selected]];
        }
    }
    let layout = world.get_component::<LayoutGroup>(entity);
    let child_parent = if let Some(scroll) = world.get_component::<ScrollView>(entity) {
        UiRect {
            x: rect.x
                - if scroll.horizontal {
                    scroll.normalized_position[0].clamp(0.0, 1.0) * rect.width
                } else {
                    0.0
                },
            y: rect.y
                - if scroll.vertical {
                    scroll.normalized_position[1].clamp(0.0, 1.0) * rect.height
                } else {
                    0.0
                },
            ..rect
        }
    } else if let Some(tab_view) = world.get_component::<TabView>(entity) {
        let tab_height = (tab_view.tab_height * scale).clamp(0.0, rect.height);
        UiRect {
            y: rect.y + tab_height,
            height: rect.height - tab_height,
            ..rect
        }
    } else {
        rect
    };
    let child_count = children.len();
    for (index, child) in children.into_iter().enumerate() {
        let forced =
            layout.map(|group| layout_child_rect(child_parent, group, index, child_count, scale));
        walk(
            world,
            child,
            canvas_root,
            UiWalkLayout {
                parent_rect: child_parent,
                scale,
                sprite_pixel_scale,
                clip: child_clip,
                rect_mask_clip: child_rect_mask_clip,
                forced_rect: forced,
            },
            state,
            interaction,
            button_tints,
            primitives,
            controls,
        );
    }
    primitives.extend(mask_pop);
}

fn children_of(world: &World, parent: Entity) -> Vec<Entity> {
    let mut children: Vec<Entity> = world
        .iter_entities()
        .filter(|entity| {
            world.entity_active(*entity)
                && world
                    .get_component::<Parent>(*entity)
                    .is_some_and(|value| value.entity == parent)
        })
        .collect();
    children.sort_by_key(|entity| world.sibling_index(*entity));
    children
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct ContentSize {
    min_width: f32,
    min_height: f32,
    preferred_width: f32,
    preferred_height: f32,
}

fn measure_layout_content(group: &LayoutGroup, child_count: usize, scale: f32) -> ContentSize {
    let count = child_count;
    let left = (group.padding[0] * scale).max(0.0);
    let top = (group.padding[1] * scale).max(0.0);
    let right = (group.padding[2] * scale).max(0.0);
    let bottom = (group.padding[3] * scale).max(0.0);
    let cell_width = (group.cell_size[0] * scale).max(0.0);
    let cell_height = (group.cell_size[1] * scale).max(0.0);
    let spacing_x = (group.spacing[0] * scale).max(0.0);
    let spacing_y = (group.spacing[1] * scale).max(0.0);
    let min_width = left + right;
    let min_height = top + bottom;
    if count == 0 {
        return ContentSize {
            min_width,
            min_height,
            preferred_width: min_width,
            preferred_height: min_height,
        };
    }
    let (preferred_width, preferred_height) = match group.direction.as_str() {
        "Horizontal" => (
            min_width + cell_width * count as f32 + spacing_x * count.saturating_sub(1) as f32,
            min_height + cell_height,
        ),
        "Grid" => {
            let columns = (group.constraint_count.max(1) as usize).min(count);
            let rows = count.div_ceil(columns);
            (
                min_width
                    + cell_width * columns as f32
                    + spacing_x * columns.saturating_sub(1) as f32,
                min_height + cell_height * rows as f32 + spacing_y * rows.saturating_sub(1) as f32,
            )
        }
        _ => (
            min_width + cell_width,
            min_height + cell_height * count as f32 + spacing_y * count.saturating_sub(1) as f32,
        ),
    };
    ContentSize {
        min_width,
        min_height,
        preferred_width,
        preferred_height,
    }
}

fn apply_content_size(
    rect: UiRect,
    pivot: [f32; 2],
    horizontal_fit: &str,
    vertical_fit: &str,
    content: ContentSize,
) -> UiRect {
    let width = match horizontal_fit {
        "MinSize" => content.min_width,
        "PreferredSize" => content.preferred_width,
        _ => rect.width,
    };
    let height = match vertical_fit {
        "MinSize" => content.min_height,
        "PreferredSize" => content.preferred_height,
        _ => rect.height,
    };
    UiRect {
        x: rect.x + (rect.width - width) * pivot[0],
        y: rect.y + (rect.height - height) * pivot[1],
        width: width.max(0.0),
        height: height.max(0.0),
    }
}

fn apply_graphic_effects(
    primitives: &mut Vec<UiPrimitive>,
    graphic_start: usize,
    shadow: Option<&Shadow>,
    outline: Option<&Outline>,
    scale: f32,
    inherited_alpha: f32,
) {
    if graphic_start >= primitives.len() || (shadow.is_none() && outline.is_none()) {
        return;
    }
    let source: Vec<UiPrimitive> = primitives.drain(graphic_start..).collect();
    if let Some(shadow) = shadow {
        push_graphic_effect(
            primitives,
            &source,
            shadow.effect_color,
            [
                shadow.effect_distance[0] * scale,
                -shadow.effect_distance[1] * scale,
            ],
            shadow.use_graphic_alpha,
            inherited_alpha,
        );
    }
    if let Some(outline) = outline {
        let dx = outline.effect_distance[0].abs() * scale;
        let dy = outline.effect_distance[1].abs() * scale;
        for offset in [[dx, dy], [dx, -dy], [-dx, dy], [-dx, -dy]] {
            push_graphic_effect(
                primitives,
                &source,
                outline.effect_color,
                offset,
                outline.use_graphic_alpha,
                inherited_alpha,
            );
        }
    }
    primitives.extend(source);
}

fn push_graphic_effect(
    primitives: &mut Vec<UiPrimitive>,
    source: &[UiPrimitive],
    color: [f32; 4],
    offset: [f32; 2],
    use_graphic_alpha: bool,
    inherited_alpha: f32,
) {
    primitives.extend(source.iter().cloned().map(|mut primitive| {
        primitive.rect[0] += offset[0];
        primitive.rect[1] += offset[1];
        primitive.color = [
            color[0],
            color[1],
            color[2],
            color[3]
                * if use_graphic_alpha {
                    primitive.color[3]
                } else {
                    inherited_alpha
                },
        ];
        primitive
    }));
}

#[allow(clippy::too_many_arguments)]
fn control_region(
    entity: Entity,
    rect: UiRect,
    rotation_radians: f32,
    pivot: [f32; 2],
    clip: UiClipRect,
    ignore_reversed_graphics: bool,
    kind: UiControlKind,
    callback: Value,
) -> UiControlRegion {
    UiControlRegion {
        entity,
        rect,
        raycast_padding: [0.0; 4],
        clip,
        rotation_radians,
        pivot,
        corners: None,
        raycast_corners: None,
        corner_inverse_w: None,
        ignore_reversed_graphics,
        blocking_objects: BlockingObjects::None,
        blocking_mask: -1,
        raycast_plane: None,
        raycast_camera: None,
        mask_regions: [None; 8],
        image_alpha_hit_test: None,
        kind,
        callback,
    }
}

fn range_fraction(min: f32, max: f32, value: f32) -> f32 {
    let low = min.min(max);
    let high = min.max(max);
    if high <= low {
        0.0
    } else {
        ((value - low) / (high - low)).clamp(0.0, 1.0)
    }
}

fn range_fill_rect(
    rect: UiRect,
    min: f32,
    max: f32,
    value: f32,
    direction: &str,
) -> (UiRect, bool, bool) {
    let t = range_fraction(min, max, value);
    let vertical = direction == "BottomToTop" || direction == "TopToBottom";
    let reverse = direction == "RightToLeft" || direction == "BottomToTop";
    let fill_rect = if vertical {
        let fill = rect.height * t;
        UiRect {
            x: rect.x,
            y: if reverse {
                rect.y + rect.height - fill
            } else {
                rect.y
            },
            width: rect.width,
            height: fill,
        }
    } else {
        let fill = rect.width * t;
        UiRect {
            x: if reverse {
                rect.x + rect.width - fill
            } else {
                rect.x
            },
            y: rect.y,
            width: fill,
            height: rect.height,
        }
    };
    (fill_rect, vertical, reverse)
}

fn inset_rect(rect: UiRect, padding: [f32; 4], scale: f32) -> UiRect {
    let left = padding[0] * scale;
    let top = padding[1] * scale;
    let right = padding[2] * scale;
    let bottom = padding[3] * scale;
    UiRect {
        x: rect.x + left,
        y: rect.y + top,
        width: (rect.width - left - right).max(0.0),
        height: (rect.height - top - bottom).max(0.0),
    }
}

fn inset_rect_lbrt(rect: UiRect, padding: [f32; 4], scale: f32) -> UiRect {
    inset_rect(
        rect,
        [padding[0], padding[3], padding[2], padding[1]],
        scale,
    )
}

fn intersect_rect(a: UiRect, b: UiRect) -> UiRect {
    let x = a.x.max(b.x);
    let y = a.y.max(b.y);
    let right = (a.x + a.width).min(b.x + b.width);
    let bottom = (a.y + a.height).min(b.y + b.height);
    UiRect {
        x,
        y,
        width: (right - x).max(0.0),
        height: (bottom - y).max(0.0),
    }
}

fn rects_overlap(a: UiRect, b: UiRect) -> bool {
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

fn intersect_clip(clip: UiClipRect, rect: UiRect) -> UiClipRect {
    let clip_rect = UiRect {
        x: clip.x as f32,
        y: clip.y as f32,
        width: clip.width as f32,
        height: clip.height as f32,
    };
    let result = intersect_rect(clip_rect, rect);
    UiClipRect {
        x: result.x.max(0.0).floor() as u32,
        y: result.y.max(0.0).floor() as u32,
        width: result.width.ceil() as u32,
        height: result.height.ceil() as u32,
    }
}

fn layout_child_rect(
    parent: UiRect,
    group: &LayoutGroup,
    index: usize,
    count: usize,
    scale: f32,
) -> UiRect {
    let content = inset_rect(parent, group.padding, scale);
    let spacing_x = group.spacing[0] * scale;
    let spacing_y = group.spacing[1] * scale;
    match group.direction.as_str() {
        "Horizontal" => {
            let width = if group.child_force_expand && count > 0 {
                (content.width - spacing_x * count.saturating_sub(1) as f32).max(0.0) / count as f32
            } else {
                group.cell_size[0] * scale
            };
            UiRect {
                x: content.x + index as f32 * (width + spacing_x),
                y: content.y,
                width,
                height: if group.child_force_expand {
                    content.height
                } else {
                    group.cell_size[1] * scale
                },
            }
        }
        "Grid" => {
            let columns = group.constraint_count.max(1) as usize;
            let column = index % columns;
            let row = index / columns;
            let width = if group.child_force_expand {
                (content.width - spacing_x * columns.saturating_sub(1) as f32).max(0.0)
                    / columns as f32
            } else {
                group.cell_size[0] * scale
            };
            let height = group.cell_size[1] * scale;
            UiRect {
                x: content.x + column as f32 * (width + spacing_x),
                y: content.y + row as f32 * (height + spacing_y),
                width,
                height,
            }
        }
        _ => {
            let height = if group.child_force_expand && count > 0 {
                (content.height - spacing_y * count.saturating_sub(1) as f32).max(0.0)
                    / count as f32
            } else {
                group.cell_size[1] * scale
            };
            UiRect {
                x: content.x,
                y: content.y + index as f32 * (height + spacing_y),
                width: if group.child_force_expand {
                    content.width
                } else {
                    group.cell_size[0] * scale
                },
                height,
            }
        }
    }
}

fn push_border(
    primitives: &mut Vec<UiPrimitive>,
    rect: UiRect,
    width: f32,
    color: [f32; 4],
    clip: UiClipRect,
) {
    let width = width.max(0.5).min(rect.width * 0.5).min(rect.height * 0.5);
    for edge in [
        UiRect {
            height: width,
            ..rect
        },
        UiRect {
            y: rect.y + rect.height - width,
            height: width,
            ..rect
        },
        UiRect { width, ..rect },
        UiRect {
            x: rect.x + rect.width - width,
            width,
            ..rect
        },
    ] {
        primitives.push(primitive(
            edge,
            color,
            [0.5, 0.5],
            0.0,
            "ui/border",
            "white",
            clip,
        ));
    }
}

fn solve_rect(parent: UiRect, rect: &RectTransform, scale: f32) -> UiRect {
    let anchor_min_x = parent.x + rect.anchor_min[0] * parent.width;
    let anchor_min_y = parent.y + rect.anchor_min[1] * parent.height;
    let anchor_max_x = parent.x + rect.anchor_max[0] * parent.width;
    let anchor_max_y = parent.y + rect.anchor_max[1] * parent.height;
    let anchor_width = anchor_max_x - anchor_min_x;
    let anchor_height = anchor_max_y - anchor_min_y;
    let width = ((anchor_width + rect.size_delta[0] * scale) * rect.local_scale[0].abs()).max(0.0);
    let height =
        ((anchor_height + rect.size_delta[1] * scale) * rect.local_scale[1].abs()).max(0.0);
    let pivot_x = anchor_min_x + anchor_width * rect.pivot[0] + rect.anchored_position[0] * scale;
    let pivot_y = anchor_min_y + anchor_height * rect.pivot[1] + rect.anchored_position[1] * scale;
    UiRect {
        x: pivot_x - width * rect.pivot[0],
        y: pivot_y - height * rect.pivot[1],
        width,
        height,
    }
}

fn apply_aspect_ratio(
    rect: UiRect,
    parent: UiRect,
    pivot: [f32; 2],
    mode: &str,
    aspect_ratio: f32,
) -> UiRect {
    if mode.eq_ignore_ascii_case("none") || !aspect_ratio.is_finite() || aspect_ratio <= 0.0 {
        return rect;
    }
    let pivot_x = rect.x + rect.width * pivot[0];
    let pivot_y = rect.y + rect.height * pivot[1];
    if mode.eq_ignore_ascii_case("widthcontrolsheight") {
        let height = rect.width / aspect_ratio;
        return UiRect {
            y: pivot_y - height * pivot[1],
            height,
            ..rect
        };
    }
    if mode.eq_ignore_ascii_case("heightcontrolswidth") {
        let width = rect.height * aspect_ratio;
        return UiRect {
            x: pivot_x - width * pivot[0],
            width,
            ..rect
        };
    }
    let fit = mode.eq_ignore_ascii_case("fitinparent");
    let envelope = mode.eq_ignore_ascii_case("envelopeparent");
    if (!fit && !envelope) || parent.width <= 0.0 || parent.height <= 0.0 {
        return rect;
    }
    let parent_ratio = parent.width / parent.height;
    let fit_width = if fit {
        parent_ratio <= aspect_ratio
    } else {
        parent_ratio >= aspect_ratio
    };
    let width = if fit_width {
        parent.width
    } else {
        parent.height * aspect_ratio
    };
    let height = if fit_width {
        parent.width / aspect_ratio
    } else {
        parent.height
    };
    UiRect {
        x: parent.x + (parent.width - width) * pivot[0],
        y: parent.y + (parent.height - height) * pivot[1],
        width,
        height,
    }
}

fn canvas_scale_factor(scaler: &CanvasScaler, width: f32, height: f32) -> f32 {
    canvas_scale_factor_with_dpi(scaler, width, height, 0.0)
}

fn canvas_scale_factor_with_dpi(
    scaler: &CanvasScaler,
    width: f32,
    height: f32,
    screen_dpi: f32,
) -> f32 {
    match scaler.ui_scale_mode.as_str() {
        "ConstantPixelSize" => return finite_positive(scaler.scale_factor, 1.0).max(0.01),
        "ConstantPhysicalSize" => {
            let fallback_dpi = finite_positive(scaler.fallback_screen_dpi, 96.0);
            let dpi = finite_positive(screen_dpi, fallback_dpi);
            let target_dpi = physical_target_dpi(&scaler.physical_unit);
            return dpi / target_dpi;
        }
        _ => {}
    }
    let reference_width = finite_positive(scaler.reference_resolution[0], 800.0);
    let reference_height = finite_positive(scaler.reference_resolution[1], 600.0);
    let width_ratio = finite_positive(width, 1.0) / reference_width;
    let height_ratio = finite_positive(height, 1.0) / reference_height;
    match scaler.screen_match_mode.as_str() {
        "Expand" => return width_ratio.min(height_ratio),
        "Shrink" => return width_ratio.max(height_ratio),
        _ => {}
    }
    let match_factor = scaler.match_width_or_height.clamp(0.0, 1.0);
    let match_factor = if match_factor.is_finite() {
        match_factor
    } else {
        0.0
    };
    let log_width = width_ratio.ln();
    let log_height = height_ratio.ln();
    (log_width * (1.0 - match_factor) + log_height * match_factor).exp()
}

fn canvas_sprite_pixel_scale(scaler: &CanvasScaler, layout_scale: f32) -> f32 {
    if scaler.ui_scale_mode != "ConstantPhysicalSize" {
        return layout_scale;
    }
    let target_dpi = physical_target_dpi(&scaler.physical_unit);
    let sprite_dpi = finite_positive(scaler.default_sprite_dpi, 96.0);
    layout_scale * target_dpi / sprite_dpi
}

fn physical_target_dpi(unit: &str) -> f32 {
    match unit {
        "Centimeters" => 2.54,
        "Millimeters" => 25.4,
        "Inches" => 1.0,
        "Picas" => 6.0,
        _ => 72.0,
    }
}

fn finite_positive(value: f32, fallback: f32) -> f32 {
    if value.is_finite() && value > 0.0 {
        value
    } else {
        fallback
    }
}

fn finite_non_negative(value: f32) -> f32 {
    if value.is_finite() {
        value.max(0.0)
    } else {
        0.0
    }
}

fn primitive(
    rect: UiRect,
    color: [f32; 4],
    pivot: [f32; 2],
    rotation_radians: f32,
    material: &str,
    texture: &str,
    clip: UiClipRect,
) -> UiPrimitive {
    UiPrimitive {
        rect: [rect.x, rect.y, rect.width, rect.height],
        color,
        pivot,
        rotation_radians,
        depth: 0.0,
        clip_corners: None,
        uv: [0.0, 0.0, 1.0, 1.0],
        vertex_positions: None,
        soft_clips: [None; 8],
        key: UiBatchKey {
            canvas_group: None,
            material: material.into(),
            texture: texture.into(),
            clip: Some(clip),
            blend: UiBlendMode::Alpha,
            depth_test: false,
            stencil: Default::default(),
        },
    }
}

fn image_geometry(
    rect: UiRect,
    pivot: [f32; 2],
    source_size: [f32; 2],
    preserve_aspect: bool,
) -> (UiRect, [f32; 2]) {
    if !preserve_aspect
        || !rect.width.is_finite()
        || !rect.height.is_finite()
        || rect.width <= 0.0
        || rect.height <= 0.0
        || !source_size[0].is_finite()
        || !source_size[1].is_finite()
        || source_size[0] <= 0.0
        || source_size[1] <= 0.0
    {
        return (rect, pivot);
    }

    let source_aspect = source_size[0] / source_size[1];
    let rect_aspect = rect.width / rect.height;
    if !source_aspect.is_finite()
        || !rect_aspect.is_finite()
        || source_aspect <= 0.0
        || rect_aspect <= 0.0
    {
        return (rect, pivot);
    }
    let fitted = if source_aspect > rect_aspect {
        let height = rect.width / source_aspect;
        UiRect {
            x: rect.x,
            y: rect.y + (rect.height - height) * 0.5,
            width: rect.width,
            height,
        }
    } else {
        let width = rect.height * source_aspect;
        UiRect {
            x: rect.x + (rect.width - width) * 0.5,
            y: rect.y,
            width,
            height: rect.height,
        }
    };
    if !fitted.width.is_finite()
        || !fitted.height.is_finite()
        || fitted.width <= 0.0
        || fitted.height <= 0.0
    {
        return (rect, pivot);
    }
    let global_pivot = [
        rect.x + pivot[0] * rect.width,
        rect.y + pivot[1] * rect.height,
    ];
    (
        fitted,
        [
            (global_pivot[0] - fitted.x) / fitted.width,
            (global_pivot[1] - fitted.y) / fitted.height,
        ],
    )
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ImageFillMethod {
    Horizontal,
    Vertical,
    Radial90,
    Radial180,
    Radial360,
}

impl ImageFillMethod {
    fn parse(value: &str) -> Self {
        if value.eq_ignore_ascii_case("horizontal") {
            Self::Horizontal
        } else if value.eq_ignore_ascii_case("vertical") {
            Self::Vertical
        } else if value.eq_ignore_ascii_case("radial90") {
            Self::Radial90
        } else if value.eq_ignore_ascii_case("radial180") {
            Self::Radial180
        } else {
            Self::Radial360
        }
    }

    fn normalized_origin(self, origin: i32) -> usize {
        let maximum = if matches!(self, Self::Horizontal | Self::Vertical) {
            1
        } else {
            3
        };
        if (0..=maximum).contains(&origin) {
            origin as usize
        } else {
            0
        }
    }
}

type ImageFillQuad = [[f32; 2]; 4];

fn unity_image_quad(x0: f32, y0: f32, x1: f32, y1: f32) -> ImageFillQuad {
    [[x0, y0], [x0, y1], [x1, y1], [x1, y0]]
}

fn top_left_image_quad(mut quad: ImageFillQuad) -> ImageFillQuad {
    for point in &mut quad {
        point[1] = 1.0 - point[1];
    }
    quad
}

fn point_lerp(quad: &ImageFillQuad, from: usize, to: usize, axis: usize, value: f32) -> f32 {
    quad[from][axis] + (quad[to][axis] - quad[from][axis]) * value
}

/// Port of Unity uGUI Image.RadialCut for one quadrant.
fn radial_image_cut(
    quad: &mut ImageFillQuad,
    raw_fill: f32,
    mut invert: bool,
    corner: usize,
) -> bool {
    let fill = if raw_fill.is_finite() {
        raw_fill.clamp(0.0, 1.0)
    } else {
        1.0
    };
    if fill < 0.001 {
        return false;
    }
    if corner & 1 == 1 {
        invert = !invert;
    }
    if !invert && fill > 0.999 {
        return true;
    }

    let mut angle = if invert { 1.0 - fill } else { fill };
    angle *= std::f32::consts::FRAC_PI_2;
    let mut cos = angle.cos();
    let mut sin = angle.sin();
    let i0 = corner;
    let i1 = (corner + 1) % 4;
    let i2 = (corner + 2) % 4;
    let i3 = (corner + 3) % 4;

    if corner & 1 == 1 {
        if sin > cos {
            cos /= sin;
            sin = 1.0;
            if invert {
                quad[i1][0] = point_lerp(quad, i0, i2, 0, cos);
                quad[i2][0] = quad[i1][0];
            }
        } else if cos > sin {
            sin /= cos;
            cos = 1.0;
            if !invert {
                quad[i2][1] = point_lerp(quad, i0, i2, 1, sin);
                quad[i3][1] = quad[i2][1];
            }
        } else {
            cos = 1.0;
            sin = 1.0;
        }
        if !invert {
            quad[i3][0] = point_lerp(quad, i0, i2, 0, cos);
        } else {
            quad[i1][1] = point_lerp(quad, i0, i2, 1, sin);
        }
    } else {
        if cos > sin {
            sin /= cos;
            cos = 1.0;
            if !invert {
                quad[i1][1] = point_lerp(quad, i0, i2, 1, sin);
                quad[i2][1] = quad[i1][1];
            }
        } else if sin > cos {
            cos /= sin;
            sin = 1.0;
            if invert {
                quad[i2][0] = point_lerp(quad, i0, i2, 0, cos);
                quad[i3][0] = quad[i2][0];
            }
        } else {
            cos = 1.0;
            sin = 1.0;
        }
        if invert {
            quad[i3][1] = point_lerp(quad, i0, i2, 1, sin);
        } else {
            quad[i1][0] = point_lerp(quad, i0, i2, 0, cos);
        }
    }
    true
}

fn filled_image_quads(
    method: &str,
    raw_amount: f32,
    clockwise: bool,
    raw_origin: i32,
) -> Vec<ImageFillQuad> {
    let method = ImageFillMethod::parse(method);
    let amount = if raw_amount.is_finite() {
        raw_amount.clamp(0.0, 1.0)
    } else {
        1.0
    };
    if amount < 0.001 {
        return Vec::new();
    }
    let origin = method.normalized_origin(raw_origin);
    if method == ImageFillMethod::Horizontal {
        let quad = if origin == 1 {
            unity_image_quad(1.0 - amount, 0.0, 1.0, 1.0)
        } else {
            unity_image_quad(0.0, 0.0, amount, 1.0)
        };
        return vec![top_left_image_quad(quad)];
    }
    if method == ImageFillMethod::Vertical {
        let quad = if origin == 1 {
            unity_image_quad(0.0, 1.0 - amount, 1.0, 1.0)
        } else {
            unity_image_quad(0.0, 0.0, 1.0, amount)
        };
        return vec![top_left_image_quad(quad)];
    }
    if amount >= 1.0 {
        return vec![top_left_image_quad(unity_image_quad(0.0, 0.0, 1.0, 1.0))];
    }
    if method == ImageFillMethod::Radial90 {
        let mut quad = unity_image_quad(0.0, 0.0, 1.0, 1.0);
        return if radial_image_cut(&mut quad, amount, clockwise, origin) {
            vec![top_left_image_quad(quad)]
        } else {
            Vec::new()
        };
    }

    let mut output = Vec::with_capacity(if method == ImageFillMethod::Radial180 {
        2
    } else {
        4
    });
    if method == ImageFillMethod::Radial180 {
        for side in 0..2 {
            let even = usize::from(origin > 1);
            let (fx0, fx1, fy0, fy1) = if origin == 0 || origin == 2 {
                if side == even {
                    (0.0, 0.5, 0.0, 1.0)
                } else {
                    (0.5, 1.0, 0.0, 1.0)
                }
            } else if side == even {
                (0.0, 1.0, 0.5, 1.0)
            } else {
                (0.0, 1.0, 0.0, 0.5)
            };
            let mut quad = unity_image_quad(fx0, fy0, fx1, fy1);
            let value = if clockwise {
                amount * 2.0 - side as f32
            } else {
                amount * 2.0 - (1 - side) as f32
            };
            if radial_image_cut(&mut quad, value, clockwise, (side + origin + 3) % 4) {
                output.push(top_left_image_quad(quad));
            }
        }
        return output;
    }

    for corner in 0..4 {
        let (fx0, fx1) = if corner < 2 { (0.0, 0.5) } else { (0.5, 1.0) };
        let (fy0, fy1) = if corner == 0 || corner == 3 {
            (0.0, 0.5)
        } else {
            (0.5, 1.0)
        };
        let mut quad = unity_image_quad(fx0, fy0, fx1, fy1);
        let phase = (corner + origin) % 4;
        let value = if clockwise {
            amount * 4.0 - phase as f32
        } else {
            amount * 4.0 - (3 - phase) as f32
        };
        if radial_image_cut(&mut quad, value, clockwise, (corner + 2) % 4) {
            output.push(top_left_image_quad(quad));
        }
    }
    output
}

#[allow(clippy::too_many_arguments)]
fn push_filled_image(
    primitives: &mut Vec<UiPrimitive>,
    rect: UiRect,
    color: [f32; 4],
    pivot: [f32; 2],
    rotation: f32,
    texture: &str,
    source_size: [f32; 2],
    preserve_aspect: bool,
    fill_method: &str,
    fill_amount: f32,
    fill_clockwise: bool,
    fill_origin: i32,
    clip: UiClipRect,
) {
    let (image_rect, image_pivot) = image_geometry(rect, pivot, source_size, preserve_aspect);
    for quad in filled_image_quads(fill_method, fill_amount, fill_clockwise, fill_origin) {
        let mut output = primitive(
            image_rect,
            color,
            image_pivot,
            rotation,
            "ui/image",
            texture,
            clip,
        );
        output.vertex_positions = Some(quad);
        primitives.push(output);
    }
}

fn split_axis(total: f32, start: f32, end: f32) -> [f32; 4] {
    let total = total.max(0.0);
    let start = start.max(0.0);
    let end = end.max(0.0);
    let sum = start + end;
    let scale = if sum > total && sum > 0.0 {
        total / sum
    } else {
        1.0
    };
    [0.0, start * scale, total - end * scale, total]
}

fn map_stretched_axis(point: f32, source: [f32; 4], destination: [f32; 4]) -> f32 {
    if point <= destination[1] && destination[1] > destination[0] {
        return source[0]
            + (point - destination[0]) * (source[1] - source[0])
                / (destination[1] - destination[0]);
    }
    if point >= destination[2] && destination[3] > destination[2] {
        return source[2]
            + (point - destination[2]) * (source[3] - source[2])
                / (destination[3] - destination[2]);
    }
    let destination_center = destination[2] - destination[1];
    if destination_center <= 0.0 {
        return source[1];
    }
    source[1] + (point - destination[1]) * (source[2] - source[1]) / destination_center
}

fn map_tiled_axis(point: f32, source: [f32; 4], destination: [f32; 4], tile_size: f32) -> f32 {
    if point <= destination[1] || point >= destination[2] {
        return map_stretched_axis(point, source, destination);
    }
    let source_center = source[2] - source[1];
    if source_center <= 0.0 || !tile_size.is_finite() || tile_size <= 0.0 {
        return map_stretched_axis(point, source, destination);
    }
    source[1] + (point - destination[1]).max(0.0).rem_euclid(tile_size) * source_center / tile_size
}

#[allow(clippy::too_many_arguments)]
fn tiled_image_scale(
    source_size: [f32; 2],
    destination_size: [f32; 2],
    source_border: [f32; 4],
    destination_border: [f32; 4],
    pixel_scale: f32,
    fill_center: bool,
) -> f32 {
    let sx = split_axis(source_size[0], source_border[0], source_border[2]);
    let sy = split_axis(source_size[1], source_border[3], source_border[1]);
    let dx = split_axis(
        destination_size[0],
        destination_border[0],
        destination_border[2],
    );
    let dy = split_axis(
        destination_size[1],
        destination_border[3],
        destination_border[1],
    );
    let source_center_width = sx[2] - sx[1];
    let source_center_height = sy[2] - sy[1];
    let destination_center_width = dx[2] - dx[1];
    let destination_center_height = dy[2] - dy[1];
    let base_scale = if pixel_scale.is_finite() && pixel_scale > 0.0 {
        pixel_scale
    } else {
        1.0
    };
    let has_border = source_border
        .iter()
        .any(|value| value.is_finite() && *value > 0.0);
    let render_center = fill_center || !has_border;
    let left_valid = sx[1] > sx[0] && dx[1] > dx[0];
    let right_valid = sx[3] > sx[2] && dx[3] > dx[2];
    let top_valid = sy[1] > sy[0] && dy[1] > dy[0];
    let bottom_valid = sy[3] > sy[2] && dy[3] > dy[2];
    let count = |scale: f32| {
        let tile_width = source_center_width * base_scale * scale;
        let tile_height = source_center_height * base_scale * scale;
        let cap = MAX_TILED_IMAGE_QUADS + 1;
        let columns =
            if destination_center_width > 0.0 && tile_width.is_finite() && tile_width > 0.0 {
                ((destination_center_width / tile_width).ceil() as usize).min(cap)
            } else {
                0
            };
        let rows =
            if destination_center_height > 0.0 && tile_height.is_finite() && tile_height > 0.0 {
                ((destination_center_height / tile_height).ceil() as usize).min(cap)
            } else {
                0
            };
        let corners = usize::from(left_valid && top_valid)
            + usize::from(right_valid && top_valid)
            + usize::from(left_valid && bottom_valid)
            + usize::from(right_valid && bottom_valid);
        corners
            .saturating_add(
                columns.saturating_mul(usize::from(top_valid) + usize::from(bottom_valid)),
            )
            .saturating_add(rows.saturating_mul(usize::from(left_valid) + usize::from(right_valid)))
            .saturating_add(if render_center {
                columns.saturating_mul(rows)
            } else {
                0
            })
            .min(cap)
    };
    if count(1.0) <= MAX_TILED_IMAGE_QUADS {
        return 1.0;
    }
    let mut low = 1.0;
    let mut high = 2.0;
    while count(high) > MAX_TILED_IMAGE_QUADS {
        high *= 2.0;
    }
    for _ in 0..40 {
        let middle = (low + high) * 0.5;
        if count(middle) > MAX_TILED_IMAGE_QUADS {
            low = middle;
        } else {
            high = middle;
        }
    }
    high
}

#[allow(clippy::too_many_arguments)]
fn map_image_alpha_point(
    point: [f32; 2],
    destination_size: [f32; 2],
    image_type: &str,
    source_size: [f32; 2],
    source_border: [f32; 4],
    destination_border: [f32; 4],
    pixel_scale: f32,
    fill_center: bool,
) -> Option<[f32; 2]> {
    if source_size
        .into_iter()
        .chain(destination_size)
        .any(|value| !value.is_finite() || value <= 0.0)
    {
        return None;
    }
    let point = [
        point[0].clamp(0.0, destination_size[0]),
        point[1].clamp(0.0, destination_size[1]),
    ];
    if image_type.eq_ignore_ascii_case("simple") || image_type.eq_ignore_ascii_case("filled") {
        return Some([
            point[0] / destination_size[0],
            point[1] / destination_size[1],
        ]);
    }
    let sx = split_axis(source_size[0], source_border[0], source_border[2]);
    let sy = split_axis(source_size[1], source_border[3], source_border[1]);
    let dx = split_axis(
        destination_size[0],
        destination_border[0],
        destination_border[2],
    );
    let dy = split_axis(
        destination_size[1],
        destination_border[3],
        destination_border[1],
    );
    if image_type.eq_ignore_ascii_case("sliced") {
        return Some([
            map_stretched_axis(point[0], sx, dx) / source_size[0],
            map_stretched_axis(point[1], sy, dy) / source_size[1],
        ]);
    }
    let tile_scale = tiled_image_scale(
        source_size,
        destination_size,
        source_border,
        destination_border,
        pixel_scale,
        fill_center,
    );
    let base_scale = if pixel_scale.is_finite() && pixel_scale > 0.0 {
        pixel_scale
    } else {
        1.0
    };
    Some([
        map_tiled_axis(point[0], sx, dx, (sx[2] - sx[1]) * base_scale * tile_scale)
            / source_size[0],
        map_tiled_axis(point[1], sy, dy, (sy[2] - sy[1]) * base_scale * tile_scale)
            / source_size[1],
    ])
}

const MAX_TILED_IMAGE_QUADS: usize = 16_250;

#[derive(Clone, Copy, Debug)]
struct TiledImageRegion {
    source: [f32; 4],
    destination: [f32; 4],
}

fn plan_tiled_image(
    source_size: [f32; 2],
    destination_size: [f32; 2],
    source_border: [f32; 4],
    destination_border: [f32; 4],
    pixel_scale: f32,
    fill_center: bool,
) -> Vec<TiledImageRegion> {
    let source_width = source_size[0];
    let source_height = source_size[1];
    let destination_width = destination_size[0];
    let destination_height = destination_size[1];
    if !source_width.is_finite()
        || !source_height.is_finite()
        || !destination_width.is_finite()
        || !destination_height.is_finite()
        || source_width <= 0.0
        || source_height <= 0.0
        || destination_width <= 0.0
        || destination_height <= 0.0
    {
        return Vec::new();
    }

    let sx = split_axis(source_width, source_border[0], source_border[2]);
    let sy = split_axis(source_height, source_border[3], source_border[1]);
    let dx = split_axis(
        destination_width,
        destination_border[0],
        destination_border[2],
    );
    let dy = split_axis(
        destination_height,
        destination_border[3],
        destination_border[1],
    );
    let source_center_width = sx[2] - sx[1];
    let source_center_height = sy[2] - sy[1];
    let destination_center_width = dx[2] - dx[1];
    let destination_center_height = dy[2] - dy[1];
    let base_scale = if pixel_scale.is_finite() && pixel_scale > 0.0 {
        pixel_scale
    } else {
        1.0
    };
    let has_border = source_border
        .iter()
        .any(|value| value.is_finite() && *value > 0.0);
    let render_center = fill_center || !has_border;
    let left_valid = sx[1] > sx[0] && dx[1] > dx[0];
    let right_valid = sx[3] > sx[2] && dx[3] > dx[2];
    let top_valid = sy[1] > sy[0] && dy[1] > dy[0];
    let bottom_valid = sy[3] > sy[2] && dy[3] > dy[2];

    let counts = |scale: f32| {
        let tile_width = source_center_width * base_scale * scale;
        let tile_height = source_center_height * base_scale * scale;
        let cap = MAX_TILED_IMAGE_QUADS + 1;
        let columns =
            if destination_center_width > 0.0 && tile_width.is_finite() && tile_width > 0.0 {
                ((destination_center_width / tile_width).ceil() as usize).min(cap)
            } else {
                0
            };
        let rows =
            if destination_center_height > 0.0 && tile_height.is_finite() && tile_height > 0.0 {
                ((destination_center_height / tile_height).ceil() as usize).min(cap)
            } else {
                0
            };
        let corners = usize::from(left_valid && top_valid)
            + usize::from(right_valid && top_valid)
            + usize::from(left_valid && bottom_valid)
            + usize::from(right_valid && bottom_valid);
        let horizontal_edges =
            columns.saturating_mul(usize::from(top_valid) + usize::from(bottom_valid));
        let vertical_edges =
            rows.saturating_mul(usize::from(left_valid) + usize::from(right_valid));
        let center = if render_center {
            columns.saturating_mul(rows)
        } else {
            0
        };
        (
            columns,
            rows,
            tile_width,
            tile_height,
            corners
                .saturating_add(horizontal_edges)
                .saturating_add(vertical_edges)
                .saturating_add(center)
                .min(cap),
        )
    };

    let mut tile_scale = 1.0;
    if counts(tile_scale).4 > MAX_TILED_IMAGE_QUADS {
        let mut low = 1.0;
        let mut high = 2.0;
        while counts(high).4 > MAX_TILED_IMAGE_QUADS {
            high *= 2.0;
        }
        for _ in 0..40 {
            let middle = (low + high) * 0.5;
            if counts(middle).4 > MAX_TILED_IMAGE_QUADS {
                low = middle;
            } else {
                high = middle;
            }
        }
        tile_scale = high;
    }
    let (columns, rows, tile_width, tile_height, _) = counts(tile_scale);
    let mut regions = Vec::with_capacity(MAX_TILED_IMAGE_QUADS.min(counts(tile_scale).4));
    let mut add = |source: [f32; 4], destination: [f32; 4]| {
        if source[2].is_finite()
            && source[3].is_finite()
            && destination[2].is_finite()
            && destination[3].is_finite()
            && source[2] > 0.0
            && source[3] > 0.0
            && destination[2] > 0.0
            && destination[3] > 0.0
        {
            regions.push(TiledImageRegion {
                source,
                destination,
            });
        }
    };

    add(
        [sx[0], sy[0], sx[1] - sx[0], sy[1] - sy[0]],
        [dx[0], dy[0], dx[1] - dx[0], dy[1] - dy[0]],
    );
    add(
        [sx[2], sy[0], sx[3] - sx[2], sy[1] - sy[0]],
        [dx[2], dy[0], dx[3] - dx[2], dy[1] - dy[0]],
    );
    add(
        [sx[0], sy[2], sx[1] - sx[0], sy[3] - sy[2]],
        [dx[0], dy[2], dx[1] - dx[0], dy[3] - dy[2]],
    );
    add(
        [sx[2], sy[2], sx[3] - sx[2], sy[3] - sy[2]],
        [dx[2], dy[2], dx[3] - dx[2], dy[3] - dy[2]],
    );

    for column in 0..columns {
        let destination_x = dx[1] + column as f32 * tile_width;
        let width = tile_width.min(dx[2] - destination_x);
        let source_tile_width = source_center_width * width / tile_width;
        add(
            [sx[1], sy[0], source_tile_width, sy[1] - sy[0]],
            [destination_x, dy[0], width, dy[1] - dy[0]],
        );
        add(
            [sx[1], sy[2], source_tile_width, sy[3] - sy[2]],
            [destination_x, dy[2], width, dy[3] - dy[2]],
        );
    }
    for row in 0..rows {
        let destination_y = dy[1] + row as f32 * tile_height;
        let height = tile_height.min(dy[2] - destination_y);
        let source_tile_height = source_center_height * height / tile_height;
        add(
            [sx[0], sy[1], sx[1] - sx[0], source_tile_height],
            [dx[0], destination_y, dx[1] - dx[0], height],
        );
        add(
            [sx[2], sy[1], sx[3] - sx[2], source_tile_height],
            [dx[2], destination_y, dx[3] - dx[2], height],
        );
    }
    if render_center {
        for row in 0..rows {
            let destination_y = dy[1] + row as f32 * tile_height;
            let height = tile_height.min(dy[2] - destination_y);
            let source_tile_height = source_center_height * height / tile_height;
            for column in 0..columns {
                let destination_x = dx[1] + column as f32 * tile_width;
                let width = tile_width.min(dx[2] - destination_x);
                add(
                    [
                        sx[1],
                        sy[1],
                        source_center_width * width / tile_width,
                        source_tile_height,
                    ],
                    [destination_x, destination_y, width, height],
                );
            }
        }
    }
    regions
}

#[allow(clippy::too_many_arguments)]
fn push_tiled_image(
    primitives: &mut Vec<UiPrimitive>,
    rect: UiRect,
    color: [f32; 4],
    pivot: [f32; 2],
    rotation_radians: f32,
    texture: &str,
    border: [f32; 4],
    source_size: [f32; 2],
    scale: f32,
    fill_center: bool,
    clip: UiClipRect,
) {
    let destination_border = [
        border[0] * scale.max(0.0),
        border[1] * scale.max(0.0),
        border[2] * scale.max(0.0),
        border[3] * scale.max(0.0),
    ];
    let regions = plan_tiled_image(
        source_size,
        [rect.width, rect.height],
        border,
        destination_border,
        scale,
        fill_center,
    );
    let source_width = source_size[0].max(1.0);
    let source_height = source_size[1].max(1.0);
    let global_pivot = [
        rect.x + pivot[0] * rect.width,
        rect.y + pivot[1] * rect.height,
    ];
    for region in regions {
        let tile = UiRect {
            x: rect.x + region.destination[0],
            y: rect.y + region.destination[1],
            width: region.destination[2],
            height: region.destination[3],
        };
        let mut output = primitive(
            tile,
            color,
            [
                (global_pivot[0] - tile.x) / tile.width,
                (global_pivot[1] - tile.y) / tile.height,
            ],
            rotation_radians,
            "ui/image-tiled",
            texture,
            clip,
        );
        output.uv = [
            region.source[0] / source_width,
            region.source[1] / source_height,
            region.source[2] / source_width,
            region.source[3] / source_height,
        ];
        primitives.push(output);
    }
}

#[allow(clippy::too_many_arguments)]
fn push_sliced_image(
    primitives: &mut Vec<UiPrimitive>,
    rect: UiRect,
    color: [f32; 4],
    pivot: [f32; 2],
    rotation_radians: f32,
    texture: &str,
    border: [f32; 4],
    source_size: [f32; 2],
    scale: f32,
    fill_center: bool,
    clip: UiClipRect,
) {
    if rect.width <= 0.0 || rect.height <= 0.0 {
        return;
    }
    let source_width = source_size[0].max(1.0);
    let source_height = source_size[1].max(1.0);
    let source_x = split_axis(source_width, border[0], border[2]);
    let source_y = split_axis(source_height, border[3], border[1]);
    let destination_x = split_axis(
        rect.width,
        border[0] * scale.max(0.0),
        border[2] * scale.max(0.0),
    );
    let destination_y = split_axis(
        rect.height,
        border[3] * scale.max(0.0),
        border[1] * scale.max(0.0),
    );
    let global_pivot = [
        rect.x + pivot[0] * rect.width,
        rect.y + pivot[1] * rect.height,
    ];
    let has_border = border.iter().any(|value| value.is_finite() && *value > 0.0);

    for row in 0..3 {
        for column in 0..3 {
            if !fill_center && has_border && row == 1 && column == 1 {
                continue;
            }
            let source_w = source_x[column + 1] - source_x[column];
            let source_h = source_y[row + 1] - source_y[row];
            let width = destination_x[column + 1] - destination_x[column];
            let height = destination_y[row + 1] - destination_y[row];
            if source_w <= 0.0 || source_h <= 0.0 || width <= 0.0 || height <= 0.0 {
                continue;
            }
            let slice = UiRect {
                x: rect.x + destination_x[column],
                y: rect.y + destination_y[row],
                width,
                height,
            };
            let mut output = primitive(
                slice,
                color,
                [
                    (global_pivot[0] - slice.x) / slice.width,
                    (global_pivot[1] - slice.y) / slice.height,
                ],
                rotation_radians,
                "ui/image-sliced",
                texture,
                clip,
            );
            output.uv = [
                source_x[column] / source_width,
                source_y[row] / source_height,
                source_w / source_width,
                source_h / source_height,
            ];
            primitives.push(output);
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn push_text(
    primitives: &mut Vec<UiPrimitive>,
    rect: UiRect,
    text: &str,
    color: [f32; 4],
    font_size: f32,
    alignment: &str,
    vertical_align: &str,
    clip: UiClipRect,
) {
    push_text_styled(
        primitives,
        rect,
        text,
        color,
        [0.0, 0.0, 0.0, 0.0],
        0.0,
        font_size,
        alignment,
        vertical_align,
        clip,
    );
}

#[allow(clippy::too_many_arguments)]
fn push_text_styled(
    primitives: &mut Vec<UiPrimitive>,
    rect: UiRect,
    text: &str,
    color: [f32; 4],
    outline_color: [f32; 4],
    outline_width: f32,
    font_size: f32,
    alignment: &str,
    vertical_align: &str,
    clip: UiClipRect,
) {
    let scale = (font_size.max(7.0) / 7.0).max(1.0);
    let advance = 6.0 * scale;
    let line_height = 8.0 * scale;
    let chars: Vec<char> = text.chars().collect();
    let line_width = chars.len() as f32 * advance - if chars.is_empty() { 0.0 } else { scale };
    let start_x = match alignment {
        "Left" => rect.x,
        "Right" => rect.x + rect.width - line_width,
        _ => rect.x + (rect.width - line_width) * 0.5,
    };
    let start_y = match vertical_align {
        "Top" => rect.y,
        "Bottom" => rect.y + rect.height - line_height,
        _ => rect.y + (rect.height - line_height) * 0.5,
    };

    let glyphs: Vec<(f32, [u8; 7])> = chars
        .into_iter()
        .enumerate()
        .map(|(char_index, character)| {
            (start_x + char_index as f32 * advance, glyph_rows(character))
        })
        .collect();

    let radius = outline_width.ceil().clamp(0.0, 16.0) as i32;
    if radius > 0 && outline_color[3] > 0.0 {
        for (glyph_x, rows) in &glyphs {
            for (row_index, row) in rows.iter().enumerate() {
                for column in 0..5 {
                    if row & (1 << (4 - column)) == 0 {
                        continue;
                    }
                    for offset_y in -radius..=radius {
                        for offset_x in -radius..=radius {
                            if offset_x == 0 && offset_y == 0
                                || offset_x * offset_x + offset_y * offset_y > radius * radius
                            {
                                continue;
                            }
                            primitives.push(primitive(
                                UiRect {
                                    x: *glyph_x + column as f32 * scale + offset_x as f32,
                                    y: start_y + row_index as f32 * scale + offset_y as f32,
                                    width: scale,
                                    height: scale,
                                },
                                outline_color,
                                [0.5, 0.5],
                                0.0,
                                "ui/text/bitmap-outline",
                                "white",
                                clip,
                            ));
                        }
                    }
                }
            }
        }
    }

    for (glyph_x, rows) in glyphs {
        for (row_index, row) in rows.iter().enumerate() {
            for column in 0..5 {
                if row & (1 << (4 - column)) == 0 {
                    continue;
                }
                primitives.push(primitive(
                    UiRect {
                        x: glyph_x + column as f32 * scale,
                        y: start_y + row_index as f32 * scale,
                        width: scale,
                        height: scale,
                    },
                    color,
                    [0.5, 0.5],
                    0.0,
                    "ui/text/bitmap",
                    "white",
                    clip,
                ));
            }
        }
    }
}

fn multiply_alpha(mut color: [f32; 4], factor: f32) -> [f32; 4] {
    color[3] *= factor;
    color
}

fn multiply_color(color: [f32; 4], tint: [f32; 4]) -> [f32; 4] {
    std::array::from_fn(|index| color[index] * tint[index])
}

fn glyph_rows(character: char) -> [u8; 7] {
    match character.to_ascii_uppercase() {
        'A' => [
            0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001,
        ],
        'B' => [
            0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110,
        ],
        'C' => [
            0b01111, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b01111,
        ],
        'D' => [
            0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110,
        ],
        'E' => [
            0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111,
        ],
        'F' => [
            0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000,
        ],
        'G' => [
            0b01111, 0b10000, 0b10000, 0b10111, 0b10001, 0b10001, 0b01111,
        ],
        'H' => [
            0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001,
        ],
        'I' => [
            0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111,
        ],
        'J' => [
            0b00111, 0b00010, 0b00010, 0b00010, 0b10010, 0b10010, 0b01100,
        ],
        'K' => [
            0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001,
        ],
        'L' => [
            0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111,
        ],
        'M' => [
            0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001,
        ],
        'N' => [
            0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001,
        ],
        'O' => [
            0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110,
        ],
        'P' => [
            0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000,
        ],
        'Q' => [
            0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101,
        ],
        'R' => [
            0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001,
        ],
        'S' => [
            0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110,
        ],
        'T' => [
            0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100,
        ],
        'U' => [
            0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110,
        ],
        'V' => [
            0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100,
        ],
        'W' => [
            0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010,
        ],
        'X' => [
            0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001,
        ],
        'Y' => [
            0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100,
        ],
        'Z' => [
            0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111,
        ],
        '0' => [
            0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110,
        ],
        '1' => [
            0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110,
        ],
        '2' => [
            0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111,
        ],
        '3' => [
            0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110,
        ],
        '4' => [
            0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010,
        ],
        '5' => [
            0b11111, 0b10000, 0b10000, 0b11110, 0b00001, 0b00001, 0b11110,
        ],
        '6' => [
            0b01110, 0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110,
        ],
        '7' => [
            0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000,
        ],
        '8' => [
            0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110,
        ],
        '9' => [
            0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110,
        ],
        ' ' => [0; 7],
        '-' => [0, 0, 0, 0b11111, 0, 0, 0],
        '.' => [0, 0, 0, 0, 0, 0b01100, 0b01100],
        ':' => [0, 0b01100, 0b01100, 0, 0b01100, 0b01100, 0],
        _ => [
            0b11111, 0b10001, 0b00110, 0b00100, 0b00110, 0b10001, 0b11111,
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canvas_scaler_matches_unity_screen_modes() {
        let mut scaler = CanvasScaler {
            ui_scale_mode: "ScaleWithScreenSize".into(),
            reference_resolution: [800.0, 600.0],
            ..CanvasScaler::default()
        };
        scaler.screen_match_mode = "MatchWidthOrHeight".into();
        scaler.match_width_or_height = 0.0;
        assert_eq!(canvas_scale_factor(&scaler, 1600.0, 600.0), 2.0);
        scaler.match_width_or_height = 1.0;
        assert_eq!(canvas_scale_factor(&scaler, 1600.0, 600.0), 1.0);
        scaler.match_width_or_height = 0.5;
        assert!((canvas_scale_factor(&scaler, 1600.0, 600.0) - 2.0_f32.sqrt()).abs() < 1e-6);
        scaler.screen_match_mode = "Expand".into();
        assert_eq!(canvas_scale_factor(&scaler, 1600.0, 600.0), 1.0);
        scaler.screen_match_mode = "Shrink".into();
        assert_eq!(canvas_scale_factor(&scaler, 1600.0, 600.0), 2.0);
    }

    #[test]
    fn canvas_scaler_matches_unity_physical_units_and_fallback_dpi() {
        let mut scaler = CanvasScaler {
            ui_scale_mode: "ConstantPhysicalSize".into(),
            fallback_screen_dpi: 120.0,
            ..CanvasScaler::default()
        };
        scaler.physical_unit = "Points".into();
        assert!((canvas_scale_factor(&scaler, 1.0, 1.0) - 120.0 / 72.0).abs() < 1e-6);
        assert_eq!(canvas_scale_factor_with_dpi(&scaler, 1.0, 1.0, 144.0), 2.0);
        assert!((canvas_sprite_pixel_scale(&scaler, 120.0 / 72.0) - 1.25).abs() < 1e-6);
        scaler.physical_unit = "Millimeters".into();
        assert!((canvas_scale_factor(&scaler, 1.0, 1.0) - 120.0 / 25.4).abs() < 1e-6);
        scaler.physical_unit = "Picas".into();
        assert_eq!(canvas_scale_factor(&scaler, 1.0, 1.0), 20.0);
    }

    #[test]
    fn button_color_block_cross_fades_runtime_target_graphic_states() {
        let mut world = World::new();
        let canvas = world.spawn_empty();
        world.insert_component(canvas, Canvas::default());
        world.insert_component(canvas, GraphicRaycaster::default());
        let entity = world.spawn_empty();
        world.insert_component(entity, RectTransform::default());
        world.insert_component(
            entity,
            Image {
                color: [0.4, 0.8, 1.0, 0.5],
                ..Image::default()
            },
        );
        world.insert_component(
            entity,
            Button {
                normal_color: [1.0; 4],
                highlighted_color: [0.5, 0.5, 0.5, 1.0],
                pressed_color: [0.25, 0.25, 0.25, 1.0],
                fade_duration: 0.1,
                ..Button::default()
            },
        );
        world.set_parent(entity, Some(canvas));

        let mut cache = HashMap::new();
        update_ui_button_tints(&world, UiInteractionState::default(), 0.0, &mut cache);
        let hovered = UiInteractionState {
            hovered: Some(entity),
            ..UiInteractionState::default()
        };
        update_ui_button_tints(&world, hovered, 0.0, &mut cache);
        update_ui_button_tints(&world, hovered, 0.05, &mut cache);
        assert_eq!(cache[&entity].current, [0.75, 0.75, 0.75, 1.0]);

        let hierarchy = TransformHierarchy::build(&world);
        let frame = collect_ui_frame_for_display_with_interaction(
            &world,
            &hierarchy,
            800,
            600,
            None,
            &SortingLayers::default(),
            0,
            hovered,
            &cache,
        );
        let graphic = frame
            .plan
            .primitives
            .iter()
            .find(|primitive| primitive.key.material == "ui/image")
            .unwrap();
        assert_eq!(graphic.color, [0.3, 0.6, 0.75, 0.5]);

        let pressed = UiInteractionState {
            hovered: Some(entity),
            pressed: Some(entity),
            selected: Some(entity),
        };
        assert_eq!(
            pressed.button_state(entity, true),
            UiButtonVisualState::Pressed
        );
        assert_eq!(
            pressed.button_state(entity, false),
            UiButtonVisualState::Disabled
        );

        world.insert_component(
            canvas,
            CanvasGroup {
                interactable: false,
                ..CanvasGroup::default()
            },
        );
        update_ui_button_tints(&world, hovered, 0.0, &mut cache);
        update_ui_button_tints(&world, hovered, 0.1, &mut cache);
        assert_eq!(cache[&entity].state, UiButtonVisualState::Disabled);
        assert_eq!(cache[&entity].current, Button::default().disabled_color);
    }

    #[test]
    fn button_sprite_swap_uses_selectable_state_on_the_target_image() {
        let mut world = World::new();
        let canvas = world.spawn_empty();
        world.insert_component(canvas, Canvas::default());
        world.insert_component(canvas, GraphicRaycaster::default());
        let entity = world.spawn_empty();
        world.insert_component(entity, RectTransform::default());
        world.insert_component(
            entity,
            Image {
                sprite: "Assets/UI/normal.png".into(),
                ..Image::default()
            },
        );
        world.insert_component(
            entity,
            Button {
                transition: "SpriteSwap".into(),
                highlighted_sprite: "Assets/UI/highlighted.png".into(),
                pressed_sprite: "Assets/UI/pressed.png".into(),
                selected_sprite: "Assets/UI/selected.png".into(),
                disabled_sprite: "Assets/UI/disabled.png".into(),
                ..Button::default()
            },
        );
        world.set_parent(entity, Some(canvas));
        let hierarchy = TransformHierarchy::build(&world);
        fn texture_for(
            world: &World,
            hierarchy: &TransformHierarchy,
            interaction: UiInteractionState,
        ) -> String {
            collect_ui_frame_for_display_with_interaction(
                world,
                hierarchy,
                800,
                600,
                None,
                &SortingLayers::default(),
                0,
                interaction,
                &HashMap::new(),
            )
            .plan
            .primitives
            .into_iter()
            .find(|primitive| primitive.key.material == "ui/image")
            .unwrap()
            .key
            .texture
        }

        assert_eq!(
            texture_for(&world, &hierarchy, UiInteractionState::default()),
            "Assets/UI/normal.png"
        );
        assert_eq!(
            texture_for(
                &world,
                &hierarchy,
                UiInteractionState {
                    hovered: Some(entity),
                    pressed: Some(entity),
                    selected: Some(entity),
                }
            ),
            "Assets/UI/pressed.png"
        );
        assert_eq!(
            texture_for(
                &world,
                &hierarchy,
                UiInteractionState {
                    selected: Some(entity),
                    ..UiInteractionState::default()
                }
            ),
            "Assets/UI/selected.png"
        );
        world
            .get_component_mut::<Button>(entity)
            .unwrap()
            .interactable = false;
        assert_eq!(
            texture_for(&world, &hierarchy, UiInteractionState::default()),
            "Assets/UI/disabled.png"
        );
        world
            .get_component_mut::<Button>(entity)
            .unwrap()
            .disabled_sprite
            .clear();
        assert_eq!(
            texture_for(&world, &hierarchy, UiInteractionState::default()),
            "Assets/UI/normal.png"
        );
    }

    #[test]
    fn raw_image_preserves_uv_texture_tint_and_raycast_blocking() {
        let mut world = World::new();
        let canvas = world.spawn_empty();
        world.insert_component(canvas, Canvas::default());
        world.insert_component(canvas, GraphicRaycaster::default());
        world.insert_component(canvas, CanvasScaler::default());
        let image = world.spawn_empty();
        world.insert_component(image, RectTransform::default());
        world.insert_component(
            image,
            RawImage {
                enabled: true,
                maskable: true,
                texture: "Assets/UI/avatar.png".into(),
                color: [0.5, 0.75, 1.0, 0.8],
                uv_rect: [0.25, 0.0, 0.5, 1.0],
                raycast_target: true,
                raycast_padding: [0.0; 4],
            },
        );
        world.set_parent(image, Some(canvas));

        let frame = collect_ui_frame(&world, 1920, 1080);
        let primitive = frame
            .plan
            .primitives
            .iter()
            .find(|primitive| primitive.key.material == "ui/raw-image")
            .unwrap();
        assert_eq!(primitive.key.texture, "Assets/UI/avatar.png");
        assert_eq!(primitive.uv, [0.25, 0.0, 0.5, 1.0]);
        assert_eq!(primitive.color, [0.5, 0.75, 1.0, 0.8]);
        assert!(frame.controls.iter().any(|control| {
            control.entity == image && matches!(control.kind, UiControlKind::Blocker)
        }));
    }

    #[test]
    fn graphic_raycast_padding_scales_all_graphics_and_preserves_rotated_hits() {
        let legacy_image: Image = serde_json::from_value(serde_json::json!({})).unwrap();
        let legacy_raw_image: RawImage = serde_json::from_value(serde_json::json!({})).unwrap();
        let legacy_text: Text = serde_json::from_value(serde_json::json!({})).unwrap();
        let legacy_panel: Panel = serde_json::from_value(serde_json::json!({})).unwrap();
        assert_eq!(legacy_image.raycast_padding, [0.0; 4]);
        assert_eq!(legacy_raw_image.raycast_padding, [0.0; 4]);
        assert_eq!(legacy_text.raycast_padding, [0.0; 4]);
        assert_eq!(legacy_panel.raycast_padding, [0.0; 4]);

        let mut world = World::new();
        let canvas = world.spawn_empty();
        world.insert_component(canvas, Canvas::default());
        world.insert_component(canvas, GraphicRaycaster::default());
        world.insert_component(
            canvas,
            CanvasScaler {
                scale_factor: 2.0,
                ..CanvasScaler::default()
            },
        );

        let image = world.spawn_empty();
        world.insert_component(
            image,
            RectTransform {
                size_delta: [100.0, 80.0],
                local_rotation: 30.0,
                ..RectTransform::default()
            },
        );
        world.insert_component(
            image,
            Image {
                raycast_padding: [10.0, 20.0, 30.0, 5.0],
                ..Image::default()
            },
        );
        world.insert_component(image, Button::default());
        world.set_parent(image, Some(canvas));

        let raw_image = world.spawn_empty();
        world.insert_component(raw_image, RectTransform::default());
        world.insert_component(
            raw_image,
            RawImage {
                raycast_padding: [1.0, 2.0, 3.0, 4.0],
                ..RawImage::default()
            },
        );
        world.set_parent(raw_image, Some(canvas));

        let text = world.spawn_empty();
        world.insert_component(text, RectTransform::default());
        world.insert_component(
            text,
            Text {
                raycast_padding: [5.0, 6.0, 7.0, 8.0],
                ..Text::default()
            },
        );
        world.set_parent(text, Some(canvas));

        let panel = world.spawn_empty();
        world.insert_component(panel, RectTransform::default());
        world.insert_component(
            panel,
            Panel {
                raycast_target: true,
                raycast_padding: [9.0, 10.0, 11.0, 12.0],
                ..Panel::default()
            },
        );
        world.set_parent(panel, Some(canvas));

        let frame = collect_ui_frame(&world, 800, 600);
        for (entity, expected) in [
            (image, [20.0, 40.0, 60.0, 10.0]),
            (raw_image, [2.0, 4.0, 6.0, 8.0]),
            (text, [10.0, 12.0, 14.0, 16.0]),
            (panel, [18.0, 20.0, 22.0, 24.0]),
        ] {
            let controls = frame
                .controls
                .iter()
                .filter(|control| control.entity == entity)
                .collect::<Vec<_>>();
            assert!(!controls.is_empty());
            assert!(controls
                .iter()
                .all(|control| control.raycast_padding == expected));
        }

        let button = frame
            .controls
            .iter()
            .find(|control| {
                control.entity == image && matches!(control.kind, UiControlKind::Button)
            })
            .unwrap();
        let screen_point = |local_x: f32, local_y: f32| {
            let pivot_x = button.rect.x + button.rect.width * button.pivot[0];
            let pivot_y = button.rect.y + button.rect.height * button.pivot[1];
            let dx = local_x - button.rect.width * button.pivot[0];
            let dy = local_y - button.rect.height * button.pivot[1];
            let c = button.rotation_radians.cos();
            let s = button.rotation_radians.sin();
            [pivot_x + dx * c - dy * s, pivot_y + dx * s + dy * c]
        };
        let outside_left = screen_point(19.0, button.rect.height * 0.5);
        let inside_left = screen_point(21.0, button.rect.height * 0.5);
        assert!(!button.contains(outside_left[0], outside_left[1]));
        assert!(button.contains(inside_left[0], inside_left[1]));

        world
            .get_component_mut::<Image>(image)
            .unwrap()
            .raycast_padding = [-10.0, -5.0, -20.0, -15.0];
        let expanded = collect_ui_frame(&world, 800, 600);
        let button = expanded
            .controls
            .iter()
            .find(|control| {
                control.entity == image && matches!(control.kind, UiControlKind::Button)
            })
            .unwrap();
        assert!(button.contains(
            button.rect.x - 10.0,
            button.rect.y + button.rect.height * 0.5
        ));
    }

    #[test]
    fn canvas_target_display_filters_overlay_and_uses_screen_camera_display() {
        let mut world = World::new();
        let overlay = world.spawn_empty();
        world.insert_component(
            overlay,
            Canvas {
                target_display: 1,
                ..Canvas::default()
            },
        );
        let overlay_image = world.spawn_empty();
        world.insert_component(overlay_image, RectTransform::default());
        world.insert_component(overlay_image, Image::default());
        world.set_parent(overlay_image, Some(overlay));

        let camera = world.spawn_empty();
        world.insert_component(camera, mengine_core::generated::Transform::default());
        world.insert_component(
            camera,
            Camera3D {
                target_display: 1,
                ..Camera3D::default()
            },
        );
        let camera_canvas = world.spawn_empty();
        world.insert_component(
            camera_canvas,
            Canvas {
                render_mode: "ScreenSpaceCamera".into(),
                render_camera: camera.to_u64().to_string(),
                ..Canvas::default()
            },
        );
        let camera_image = world.spawn_empty();
        world.insert_component(camera_image, RectTransform::default());
        world.insert_component(camera_image, Image::default());
        world.set_parent(camera_image, Some(camera_canvas));

        let active = FrameCamera {
            view: look_at(Vec3::new(0.0, 0.0, 10.0), Vec3::ZERO, Vec3::Y),
            proj: orthographic(5.0, 4.0 / 3.0, 0.1, 100.0),
            position: Vec3::new(0.0, 0.0, 10.0),
        };
        let hierarchy = TransformHierarchy::build(&world);
        let filtered = collect_ui_frame_with_hierarchy_and_camera(
            &world,
            &hierarchy,
            800,
            600,
            active,
            &SortingLayers::default(),
        );
        assert!(filtered.plan.primitives.is_empty());

        world
            .get_component_mut::<Camera3D>(camera)
            .unwrap()
            .target_display = 0;
        world
            .get_component_mut::<Canvas>(overlay)
            .unwrap()
            .target_display = 0;
        let hierarchy = TransformHierarchy::build(&world);
        let visible = collect_ui_frame_with_hierarchy_and_camera(
            &world,
            &hierarchy,
            800,
            600,
            active,
            &SortingLayers::default(),
        );
        assert_eq!(visible.plan.primitives.len(), 2);

        let no_camera = collect_ui_frame_for_display(
            &world,
            &hierarchy,
            800,
            600,
            None,
            &SortingLayers::default(),
            0,
        );
        assert_eq!(no_camera.plan.primitives.len(), 1);
    }

    #[test]
    fn graphic_raycaster_presence_and_enabled_state_gate_hits_without_hiding_graphics() {
        for raycaster in [
            None,
            Some(GraphicRaycaster {
                enabled: false,
                ..GraphicRaycaster::default()
            }),
        ] {
            let mut world = World::new();
            let canvas = world.spawn_empty();
            world.insert_component(canvas, Canvas::default());
            if let Some(raycaster) = raycaster {
                world.insert_component(canvas, raycaster);
            }
            let image = world.spawn_empty();
            world.insert_component(image, RectTransform::default());
            world.insert_component(image, Image::default());
            world.set_parent(image, Some(canvas));

            let frame = collect_ui_frame(&world, 800, 600);
            assert_eq!(frame.plan.primitives.len(), 1);
            assert!(frame.controls.is_empty());
        }
    }

    #[test]
    fn graphic_enabled_defaults_are_legacy_safe_and_disabled_graphics_stop_output() {
        assert!(Image::default().enabled);
        assert!(RawImage::default().enabled);
        assert!(Text::default().enabled);
        assert!(Panel::default().enabled);
        assert!(
            serde_json::from_value::<Image>(serde_json::json!({}))
                .unwrap()
                .enabled
        );
        assert!(
            serde_json::from_value::<RawImage>(serde_json::json!({}))
                .unwrap()
                .enabled
        );
        assert!(
            serde_json::from_value::<Text>(serde_json::json!({}))
                .unwrap()
                .enabled
        );
        assert!(
            serde_json::from_value::<Panel>(serde_json::json!({}))
                .unwrap()
                .enabled
        );

        let mut world = World::new();
        let canvas = world.spawn_empty();
        world.insert_component(canvas, Canvas::default());
        world.insert_component(canvas, GraphicRaycaster::default());

        let image = world.spawn_empty();
        world.insert_component(image, RectTransform::default());
        world.insert_component(
            image,
            Image {
                enabled: false,
                ..Default::default()
            },
        );
        world.set_parent(image, Some(canvas));

        let raw_image = world.spawn_empty();
        world.insert_component(raw_image, RectTransform::default());
        world.insert_component(
            raw_image,
            RawImage {
                enabled: false,
                ..Default::default()
            },
        );
        world.set_parent(raw_image, Some(canvas));

        let text = world.spawn_empty();
        world.insert_component(text, RectTransform::default());
        world.insert_component(
            text,
            Text {
                enabled: false,
                ..Default::default()
            },
        );
        world.set_parent(text, Some(canvas));

        let panel = world.spawn_empty();
        world.insert_component(panel, RectTransform::default());
        world.insert_component(
            panel,
            Panel {
                enabled: false,
                raycast_target: true,
                ..Default::default()
            },
        );
        world.set_parent(panel, Some(canvas));

        let child = world.spawn_empty();
        world.insert_component(child, RectTransform::default());
        world.insert_component(child, Image::default());
        world.set_parent(child, Some(image));

        let frame = collect_ui_frame(&world, 800, 600);
        assert_eq!(
            frame
                .plan
                .primitives
                .iter()
                .filter(|primitive| primitive.key.material == "ui/image")
                .count(),
            1,
            "disabling a Graphic must not deactivate its child hierarchy"
        );
        assert!(!frame.plan.primitives.iter().any(|primitive| {
            primitive.key.material == "ui/raw-image"
                || primitive.key.material == "ui/panel"
                || primitive.key.material.starts_with("ui/text/")
        }));
        assert!(frame
            .controls
            .iter()
            .all(|control| { ![image, raw_image, text, panel].contains(&control.entity) }));
    }

    #[test]
    fn selectables_require_an_enabled_same_entity_graphic_when_one_is_authored() {
        let mut world = World::new();
        let canvas = world.spawn_empty();
        world.insert_component(canvas, Canvas::default());
        world.insert_component(canvas, GraphicRaycaster::default());

        let disabled_target = world.spawn_empty();
        world.insert_component(disabled_target, RectTransform::default());
        world.insert_component(disabled_target, Button::default());
        world.insert_component(
            disabled_target,
            Image {
                enabled: false,
                ..Default::default()
            },
        );
        world.set_parent(disabled_target, Some(canvas));

        let pass_through_target = world.spawn_empty();
        world.insert_component(pass_through_target, RectTransform::default());
        world.insert_component(pass_through_target, Button::default());
        world.insert_component(
            pass_through_target,
            Image {
                raycast_target: false,
                ..Default::default()
            },
        );
        world.set_parent(pass_through_target, Some(canvas));

        let standalone = world.spawn_empty();
        world.insert_component(standalone, RectTransform::default());
        world.insert_component(standalone, Button::default());
        world.set_parent(standalone, Some(canvas));

        let frame = collect_ui_frame(&world, 800, 600);
        let buttons: Vec<Entity> = frame
            .controls
            .iter()
            .filter(|control| matches!(control.kind, UiControlKind::Button))
            .map(|control| control.entity)
            .collect();
        assert_eq!(buttons, vec![standalone]);
    }

    #[test]
    fn text_raycast_targets_default_to_blocking_and_same_entity_actions_stay_on_top() {
        assert!(Text::default().raycast_target);
        let legacy_text: Text = serde_json::from_value(serde_json::json!({ "text": "Legacy" }))
            .expect("Text with a missing raycast_target should use the generated default");
        assert!(legacy_text.raycast_target);
        let opted_out: Text = serde_json::from_value(serde_json::json!({
            "text": "Click through",
            "raycast_target": false
        }))
        .expect("Text should preserve an explicit raycast opt-out");
        assert!(!opted_out.raycast_target);

        let mut world = World::new();
        let canvas = world.spawn_empty();
        world.insert_component(canvas, Canvas::default());
        world.insert_component(canvas, GraphicRaycaster::default());

        let text_only = world.spawn_empty();
        world.insert_component(
            text_only,
            RectTransform {
                anchored_position: [-150.0, 0.0],
                ..Default::default()
            },
        );
        world.insert_component(text_only, Text::default());
        world.set_parent(text_only, Some(canvas));

        let composite_button = world.spawn_empty();
        world.insert_component(
            composite_button,
            RectTransform {
                anchored_position: [150.0, 0.0],
                ..Default::default()
            },
        );
        world.insert_component(composite_button, Button::default());
        world.insert_component(composite_button, Text::default());
        world.insert_component(
            composite_button,
            Panel {
                raycast_target: true,
                ..Default::default()
            },
        );
        world.set_parent(composite_button, Some(canvas));

        let frame = collect_ui_frame(&world, 800, 600);
        assert!(frame.controls.iter().any(|control| {
            control.entity == text_only && matches!(control.kind, UiControlKind::Blocker)
        }));

        let button_region = frame
            .controls
            .iter()
            .find(|control| {
                control.entity == composite_button && matches!(control.kind, UiControlKind::Button)
            })
            .unwrap();
        let point = [
            button_region.rect.x + button_region.rect.width * 0.5,
            button_region.rect.y + button_region.rect.height * 0.5,
        ];
        let topmost = frame
            .controls
            .iter()
            .rev()
            .find(|control| control.contains(point[0], point[1]))
            .unwrap();
        assert_eq!(topmost.entity, composite_button);
        assert!(matches!(topmost.kind, UiControlKind::Button));
    }

    #[test]
    fn nested_canvas_subtrees_are_collected_once() {
        let mut world = World::new();
        let root = world.spawn_empty();
        world.insert_component(root, Canvas::default());
        let nested = world.spawn_empty();
        world.insert_component(nested, Canvas::default());
        world.insert_component(nested, RectTransform::default());
        world.set_parent(nested, Some(root));
        let image = world.spawn_empty();
        world.insert_component(image, RectTransform::default());
        world.insert_component(image, Image::default());
        world.set_parent(image, Some(nested));

        let frame = collect_ui_frame(&world, 800, 600);
        assert_eq!(
            frame
                .plan
                .primitives
                .iter()
                .filter(|primitive| primitive.key.material == "ui/image")
                .count(),
            1
        );
    }

    #[test]
    fn nested_canvases_keep_independent_runtime_batches() {
        let mut world = World::new();
        let root = world.spawn_empty();
        world.insert_component(root, Canvas::default());

        let parent_before = world.spawn_empty();
        world.insert_component(parent_before, RectTransform::default());
        world.insert_component(parent_before, Image::default());
        world.set_parent(parent_before, Some(root));
        world.set_editor_state(parent_before, 0, true);

        let nested = world.spawn_empty();
        world.insert_component(nested, Canvas::default());
        world.insert_component(nested, RectTransform::default());
        world.set_parent(nested, Some(root));
        world.set_editor_state(nested, 1, true);

        let nested_image = world.spawn_empty();
        world.insert_component(nested_image, RectTransform::default());
        world.insert_component(nested_image, Image::default());
        world.set_parent(nested_image, Some(nested));

        let parent_after = world.spawn_empty();
        world.insert_component(parent_after, RectTransform::default());
        world.insert_component(parent_after, Image::default());
        world.set_parent(parent_after, Some(root));
        world.set_editor_state(parent_after, 2, true);

        let frame = collect_ui_frame(&world, 800, 600);
        assert_eq!(frame.plan.primitives.len(), 3);
        assert_eq!(frame.plan.batches.len(), 3);
        assert_eq!(frame.plan.batches[0].key.canvas_group, Some(root.to_u64()));
        assert_eq!(
            frame.plan.batches[1].key.canvas_group,
            Some(nested.to_u64())
        );
        assert_eq!(frame.plan.batches[2].key.canvas_group, Some(root.to_u64()));
    }

    #[test]
    fn override_sorting_canvas_is_a_separate_inherited_render_root() {
        let mut world = World::new();
        let root = world.spawn_empty();
        world.insert_component(
            root,
            Canvas {
                render_mode: "ScreenSpaceCamera".into(),
                plane_distance: 5.0,
                ..Canvas::default()
            },
        );
        world.insert_component(
            root,
            RectTransform {
                anchor_min: [0.0, 0.0],
                anchor_max: [1.0, 1.0],
                size_delta: [0.0, 0.0],
                ..RectTransform::default()
            },
        );
        let nested = world.spawn_empty();
        world.insert_component(
            nested,
            Canvas {
                override_sorting: true,
                sorting_order: 10,
                ..Canvas::default()
            },
        );
        world.insert_component(
            nested,
            RectTransform {
                anchored_position: [100.0, 0.0],
                size_delta: [200.0, 100.0],
                ..RectTransform::default()
            },
        );
        world.set_parent(nested, Some(root));
        let image = world.spawn_empty();
        world.insert_component(image, RectTransform::default());
        world.insert_component(image, Image::default());
        world.set_parent(image, Some(nested));
        let hierarchy = TransformHierarchy::build(&world);
        let camera = FrameCamera {
            view: look_at(Vec3::new(0.0, 0.0, 10.0), Vec3::ZERO, Vec3::Y),
            proj: perspective(60.0, 4.0 / 3.0, 0.1, 100.0),
            position: Vec3::new(0.0, 0.0, 10.0),
        };

        let frame = collect_ui_frame_with_hierarchy_and_camera(
            &world,
            &hierarchy,
            800,
            600,
            camera,
            &SortingLayers::default(),
        );
        assert_eq!(frame.plan.primitives.len(), 1);
        assert!(frame.world_primitives.is_empty());
        let primitive = &frame.plan.primitives[0];
        assert!(
            primitive.key.depth_test,
            "nested Canvas inherits root render mode"
        );
        assert!(primitive.rect[0] + primitive.rect[2] * 0.5 > 400.0);
    }

    #[test]
    fn canvas_root_groups_apply_and_override_sorting_starts_a_new_group_boundary() {
        let mut world = World::new();
        let root = world.spawn_empty();
        world.insert_component(root, Canvas::default());
        world.insert_component(root, GraphicRaycaster::default());
        world.insert_component(
            root,
            CanvasGroup {
                alpha: 0.25,
                interactable: false,
                blocks_raycasts: false,
                ..CanvasGroup::default()
            },
        );

        let blocked_image = world.spawn_empty();
        world.insert_component(
            blocked_image,
            RectTransform {
                anchored_position: [-150.0, 0.0],
                ..RectTransform::default()
            },
        );
        world.insert_component(blocked_image, Image::default());
        world.set_parent(blocked_image, Some(root));

        let nested = world.spawn_empty();
        world.insert_component(
            nested,
            Canvas {
                override_sorting: true,
                sorting_order: 1,
                ..Canvas::default()
            },
        );
        world.insert_component(nested, GraphicRaycaster::default());
        world.insert_component(
            nested,
            RectTransform {
                anchored_position: [150.0, 0.0],
                ..RectTransform::default()
            },
        );
        world.insert_component(
            nested,
            CanvasGroup {
                alpha: 0.5,
                ..CanvasGroup::default()
            },
        );
        world.set_parent(nested, Some(root));

        let independent_image = world.spawn_empty();
        world.insert_component(independent_image, RectTransform::default());
        world.insert_component(independent_image, Image::default());
        world.set_parent(independent_image, Some(nested));

        let frame = collect_ui_frame(&world, 800, 600);
        assert!(!frame
            .controls
            .iter()
            .any(|control| control.entity == blocked_image));
        assert!(frame
            .controls
            .iter()
            .any(|control| control.entity == independent_image));
        let image_primitives: Vec<_> = frame
            .plan
            .primitives
            .iter()
            .filter(|primitive| primitive.key.material == "ui/image")
            .collect();
        assert_eq!(image_primitives.len(), 2);
        let blocked = image_primitives
            .iter()
            .find(|primitive| primitive.rect[0] < 350.0)
            .unwrap();
        let independent = image_primitives
            .iter()
            .find(|primitive| primitive.rect[0] > 350.0)
            .unwrap();
        assert!((blocked.color[3] - 0.25).abs() < 0.0001);
        assert!((independent.color[3] - 0.5).abs() < 0.0001);
    }

    #[test]
    fn canvas_root_graphics_render_and_rect_mask_clips_children() {
        let mut world = World::new();
        let canvas = world.spawn_empty();
        world.insert_component(canvas, Canvas::default());
        world.insert_component(canvas, GraphicRaycaster::default());
        world.insert_component(
            canvas,
            RectTransform {
                anchor_min: [0.0, 0.0],
                anchor_max: [1.0, 1.0],
                size_delta: [0.0, 0.0],
                ..RectTransform::default()
            },
        );
        world.insert_component(canvas, Image::default());
        world.insert_component(
            canvas,
            RectMask2D {
                padding: [10.0, 20.0, 30.0, 40.0],
                softness: [12.0, 16.0],
                ..RectMask2D::default()
            },
        );

        let child = world.spawn_empty();
        world.insert_component(
            child,
            RectTransform {
                anchor_min: [0.0, 0.0],
                anchor_max: [1.0, 1.0],
                size_delta: [0.0, 0.0],
                ..RectTransform::default()
            },
        );
        world.insert_component(child, Button::default());
        world.set_parent(child, Some(canvas));

        let frame = collect_ui_frame(&world, 800, 600);
        assert!(frame
            .plan
            .primitives
            .iter()
            .any(|primitive| primitive.key.material == "ui/image"));
        let control = frame
            .controls
            .iter()
            .find(|control| control.entity == child)
            .expect("child button control");
        assert_eq!(control.clip.x, 10);
        assert_eq!(control.clip.y, 40);
        assert_eq!(control.clip.width, 760);
        assert_eq!(control.clip.height, 540);
        assert!(!control.contains(5.0, 300.0));
        assert!(control.contains(400.0, 300.0));
        let button = frame
            .plan
            .primitives
            .iter()
            .find(|primitive| primitive.key.material == "ui/button")
            .expect("child button primitive");
        assert_eq!(
            button.soft_clips[0],
            Some(UiSoftClip {
                rect: [10.0, 40.0, 760.0, 540.0],
                softness: [12.0, 16.0],
            })
        );
        let root_image = frame
            .plan
            .primitives
            .iter()
            .find(|primitive| primitive.key.material == "ui/image")
            .unwrap();
        assert!(root_image.soft_clips.iter().all(Option::is_none));
    }

    #[test]
    fn maskable_graphic_ignores_parent_stencil_and_rect_masks() {
        let mut world = World::new();
        let canvas = world.spawn_empty();
        world.insert_component(canvas, Canvas::default());
        world.insert_component(canvas, GraphicRaycaster::default());
        world.insert_component(
            canvas,
            RectTransform {
                anchor_min: [0.0, 0.0],
                anchor_max: [1.0, 1.0],
                size_delta: [0.0, 0.0],
                ..RectTransform::default()
            },
        );

        let mask = world.spawn_empty();
        world.insert_component(
            mask,
            RectTransform {
                size_delta: [100.0, 100.0],
                ..RectTransform::default()
            },
        );
        world.insert_component(
            mask,
            Image {
                raycast_target: false,
                ..Image::default()
            },
        );
        world.insert_component(mask, Mask::default());
        world.insert_component(
            mask,
            CanvasGroup {
                alpha: 0.5,
                ..CanvasGroup::default()
            },
        );
        world.insert_component(
            mask,
            RectMask2D {
                softness: [4.0, 6.0],
                ..RectMask2D::default()
            },
        );
        world.set_parent(mask, Some(canvas));

        let masked = world.spawn_empty();
        world.insert_component(
            masked,
            RectTransform {
                anchored_position: [-120.0, 0.0],
                size_delta: [200.0, 200.0],
                ..RectTransform::default()
            },
        );
        world.insert_component(masked, Image::default());
        world.insert_component(masked, Button::default());
        world.set_parent(masked, Some(mask));

        let unmasked = world.spawn_empty();
        world.insert_component(
            unmasked,
            RectTransform {
                anchored_position: [120.0, 0.0],
                size_delta: [200.0, 200.0],
                ..RectTransform::default()
            },
        );
        world.insert_component(
            unmasked,
            Image {
                maskable: false,
                ..Image::default()
            },
        );
        world.insert_component(unmasked, Button::default());
        world.set_parent(unmasked, Some(mask));

        let scroll = world.spawn_empty();
        world.insert_component(
            scroll,
            RectTransform {
                anchored_position: [250.0, 0.0],
                size_delta: [80.0, 80.0],
                ..RectTransform::default()
            },
        );
        world.insert_component(scroll, ScrollView::default());
        world.set_parent(scroll, Some(canvas));
        let scroll_child = world.spawn_empty();
        world.insert_component(
            scroll_child,
            RectTransform {
                size_delta: [200.0, 200.0],
                ..RectTransform::default()
            },
        );
        world.insert_component(
            scroll_child,
            Image {
                maskable: false,
                ..Image::default()
            },
        );
        world.insert_component(scroll_child, Button::default());
        world.set_parent(scroll_child, Some(scroll));

        let frame = collect_ui_frame(&world, 800, 600);
        let masked_control = frame
            .controls
            .iter()
            .find(|control| control.entity == masked)
            .expect("masked control");
        assert_eq!(masked_control.clip.width, 100);
        assert!(masked_control.mask_regions[0].is_some());
        let unmasked_control = frame
            .controls
            .iter()
            .find(|control| control.entity == unmasked)
            .expect("unmasked control");
        assert_eq!(unmasked_control.clip.width, 800);
        assert!(unmasked_control.mask_regions.iter().all(Option::is_none));
        let scroll_control = frame
            .controls
            .iter()
            .find(|control| control.entity == scroll_child)
            .expect("scroll child control");
        assert_eq!(scroll_control.clip.width, 80);
        assert_eq!(scroll_control.clip.height, 80);

        let masked_primitive = frame
            .plan
            .primitives
            .iter()
            .find(|primitive| {
                primitive.key.material == "ui/image"
                    && primitive.rect[0] < 300.0
                    && primitive.rect[2] == 200.0
            })
            .expect("masked image primitive");
        assert!(matches!(
            masked_primitive.key.stencil,
            UiStencilMode::Test { reference: 1 }
        ));
        assert!(masked_primitive.soft_clips[0].is_some());
        let unmasked_primitive = frame
            .plan
            .primitives
            .iter()
            .find(|primitive| {
                primitive.key.material == "ui/image"
                    && primitive.rect[0] > 400.0
                    && primitive.rect[2] == 200.0
            })
            .expect("unmasked image primitive");
        assert_eq!(unmasked_primitive.key.stencil, UiStencilMode::Disabled);
        assert!(unmasked_primitive.soft_clips.iter().all(Option::is_none));
        assert_eq!(unmasked_primitive.color[3], 0.5);
    }

    #[test]
    fn mask_without_graphic_does_not_mask_children() {
        let mut world = World::new();
        let canvas = world.spawn_empty();
        world.insert_component(canvas, Canvas::default());
        world.insert_component(canvas, GraphicRaycaster::default());
        world.insert_component(
            canvas,
            RectTransform {
                anchor_min: [0.0, 0.0],
                anchor_max: [1.0, 1.0],
                size_delta: [0.0, 0.0],
                ..RectTransform::default()
            },
        );

        let mask = world.spawn_empty();
        world.insert_component(
            mask,
            RectTransform {
                size_delta: [100.0, 100.0],
                ..RectTransform::default()
            },
        );
        world.insert_component(mask, Mask::default());
        world.set_parent(mask, Some(canvas));

        let child = world.spawn_empty();
        world.insert_component(
            child,
            RectTransform {
                size_delta: [200.0, 200.0],
                ..RectTransform::default()
            },
        );
        world.insert_component(child, Image::default());
        world.insert_component(child, Button::default());
        world.set_parent(child, Some(mask));

        let frame = collect_ui_frame(&world, 800, 600);
        let control = frame
            .controls
            .iter()
            .find(|control| control.entity == child)
            .expect("child control");
        assert_eq!(control.clip.width, 800);
        assert!(control.mask_regions.iter().all(Option::is_none));
        let primitive = frame
            .plan
            .primitives
            .iter()
            .find(|primitive| primitive.key.material == "ui/image" && primitive.rect[2] == 200.0)
            .expect("child image primitive");
        assert_eq!(primitive.key.stencil, UiStencilMode::Disabled);
    }

    #[test]
    fn mask_with_disabled_graphic_still_reserves_stencil_depth() {
        let mut world = World::new();
        let canvas = world.spawn_empty();
        world.insert_component(canvas, Canvas::default());
        world.insert_component(canvas, GraphicRaycaster::default());
        world.insert_component(
            canvas,
            RectTransform {
                anchor_min: [0.0, 0.0],
                anchor_max: [1.0, 1.0],
                size_delta: [0.0, 0.0],
                ..RectTransform::default()
            },
        );

        let mask = world.spawn_empty();
        world.insert_component(
            mask,
            RectTransform {
                size_delta: [100.0, 100.0],
                ..RectTransform::default()
            },
        );
        world.insert_component(
            mask,
            Image {
                enabled: false,
                ..Image::default()
            },
        );
        world.insert_component(mask, Mask::default());
        world.set_parent(mask, Some(canvas));

        let child = world.spawn_empty();
        world.insert_component(
            child,
            RectTransform {
                size_delta: [200.0, 200.0],
                ..RectTransform::default()
            },
        );
        world.insert_component(child, Image::default());
        world.insert_component(child, Button::default());
        world.set_parent(child, Some(mask));

        let frame = collect_ui_frame(&world, 800, 600);
        let control = frame
            .controls
            .iter()
            .find(|control| control.entity == child)
            .expect("child control");
        assert!(control.mask_regions[0].is_some());
        let primitive = frame
            .plan
            .primitives
            .iter()
            .find(|primitive| primitive.key.material == "ui/image" && primitive.rect[2] == 200.0)
            .expect("child image primitive");
        assert!(matches!(
            primitive.key.stencil,
            UiStencilMode::Test { reference: 1 }
        ));
    }

    #[test]
    fn canvas_renderer_culls_transparent_geometry_but_preserves_raycast_controls() {
        let mut world = World::new();
        let canvas = world.spawn_empty();
        world.insert_component(canvas, Canvas::default());
        world.insert_component(canvas, GraphicRaycaster::default());

        let image = world.spawn_empty();
        world.insert_component(image, RectTransform::default());
        world.insert_component(
            image,
            Image {
                color: [1.0, 1.0, 1.0, 0.0],
                ..Image::default()
            },
        );
        world.set_parent(image, Some(canvas));

        let culled = collect_ui_frame(&world, 800, 600);
        assert!(culled.plan.primitives.is_empty());
        assert!(culled
            .controls
            .iter()
            .any(|control| control.entity == image));

        world.insert_component(
            image,
            CanvasRenderer {
                cull_transparent_mesh: false,
            },
        );
        let retained = collect_ui_frame(&world, 800, 600);
        assert_eq!(retained.plan.primitives.len(), 1);
        assert_eq!(retained.plan.primitives[0].color[3], 0.0);
    }

    #[test]
    fn alpha_independent_graphic_effect_prevents_canvas_renderer_culling() {
        let mut world = World::new();
        let canvas = world.spawn_empty();
        world.insert_component(canvas, Canvas::default());

        let image = world.spawn_empty();
        world.insert_component(image, RectTransform::default());
        world.insert_component(
            image,
            Image {
                color: [1.0, 1.0, 1.0, 0.0],
                ..Image::default()
            },
        );
        world.insert_component(
            image,
            Shadow {
                effect_color: [0.0, 0.0, 0.0, 0.5],
                use_graphic_alpha: false,
                ..Shadow::default()
            },
        );
        world.set_parent(image, Some(canvas));

        let frame = collect_ui_frame(&world, 800, 600);
        assert_eq!(frame.plan.primitives.len(), 2);
        assert!(frame
            .plan
            .primitives
            .iter()
            .any(|primitive| primitive.color[3] == 0.5));
    }

    #[test]
    fn transparent_culled_mask_keeps_an_empty_reserved_stencil_depth() {
        let mut world = World::new();
        let canvas = world.spawn_empty();
        world.insert_component(canvas, Canvas::default());

        let mask = world.spawn_empty();
        world.insert_component(mask, RectTransform::default());
        world.insert_component(
            mask,
            Image {
                color: [1.0, 1.0, 1.0, 0.0],
                ..Image::default()
            },
        );
        world.insert_component(mask, Mask::default());
        world.set_parent(mask, Some(canvas));

        let child = world.spawn_empty();
        world.insert_component(child, RectTransform::default());
        world.insert_component(child, Image::default());
        world.set_parent(child, Some(mask));

        let frame = collect_ui_frame(&world, 800, 600);
        assert_eq!(frame.plan.primitives.len(), 1);
        assert!(matches!(
            frame.plan.primitives[0].key.stencil,
            UiStencilMode::Test { reference: 1 }
        ));
        assert!(!frame.plan.primitives.iter().any(|primitive| matches!(
            primitive.key.stencil,
            UiStencilMode::Push { .. } | UiStencilMode::Pop { .. }
        )));
    }

    #[test]
    fn screen_space_camera_uses_plane_depth_and_scene_depth_testing() {
        let mut world = World::new();
        let canvas = world.spawn_empty();
        world.insert_component(
            canvas,
            Canvas {
                render_mode: "ScreenSpaceCamera".into(),
                plane_distance: 10.0,
                ..Canvas::default()
            },
        );
        world.insert_component(
            canvas,
            GraphicRaycaster {
                blocking_objects: "All".into(),
                blocking_mask: 1 << 3,
                ..GraphicRaycaster::default()
            },
        );
        let image = world.spawn_empty();
        world.insert_component(image, RectTransform::default());
        world.insert_component(image, Image::default());
        world.set_parent(image, Some(canvas));
        let hierarchy = TransformHierarchy::build(&world);
        let camera = FrameCamera {
            view: look_at(Vec3::new(0.0, 0.0, 20.0), Vec3::ZERO, Vec3::Y),
            proj: perspective(60.0, 4.0 / 3.0, 0.1, 100.0),
            position: Vec3::new(0.0, 0.0, 20.0),
        };

        let frame = collect_ui_frame_with_hierarchy_and_camera(
            &world,
            &hierarchy,
            800,
            600,
            camera,
            &SortingLayers::default(),
        );
        assert!(!frame.plan.primitives.is_empty());
        let expected = screen_space_camera_depth(camera, 10.0);
        assert!(frame.plan.primitives.iter().all(|primitive| {
            primitive.key.depth_test && (primitive.depth - expected).abs() < 0.000001
        }));
        assert!(expected > 0.0 && expected < 1.0);
        let control = frame.controls.first().expect("Image hit region");
        assert_eq!(control.blocking_objects, BlockingObjects::All);
        assert_eq!(control.blocking_mask, 1 << 3);
        assert_eq!(
            control.raycast_camera.expect("event camera").position,
            camera.position
        );
        let ray = crate::ui_raycast::viewport_world_ray(camera, [800, 600], [400.0, 300.0])
            .expect("center ray");
        assert!((control.raycast_plane.unwrap().distance(ray).unwrap() - 9.9).abs() < 0.001);
    }

    #[test]
    fn pixel_perfect_canvas_rounds_render_and_hit_rects_together() {
        let mut world = World::new();
        let canvas = world.spawn_empty();
        world.insert_component(
            canvas,
            Canvas {
                pixel_perfect: true,
                ..Canvas::default()
            },
        );
        world.insert_component(canvas, GraphicRaycaster::default());
        let image = world.spawn_empty();
        world.insert_component(
            image,
            RectTransform {
                anchored_position: [0.25, 0.75],
                size_delta: [100.4, 50.6],
                ..RectTransform::default()
            },
        );
        world.insert_component(image, Image::default());
        world.set_parent(image, Some(canvas));

        let frame = collect_ui_frame(&world, 800, 600);
        let primitive = frame.plan.primitives.first().unwrap();
        let control = frame.controls.first().unwrap();
        assert!(primitive.rect.iter().all(|value| value.fract() == 0.0));
        assert_eq!(primitive.rect[0], control.rect.x);
        assert_eq!(primitive.rect[1], control.rect.y);
        assert_eq!(primitive.rect[2], control.rect.width);
        assert_eq!(primitive.rect[3], control.rect.height);
    }

    #[test]
    fn nested_canvas_pixel_perfect_requires_override_and_keeps_hit_rects_aligned() {
        let mut world = World::new();
        let canvas = world.spawn_empty();
        world.insert_component(canvas, Canvas::default());
        world.insert_component(canvas, GraphicRaycaster::default());

        let inherited_canvas = world.spawn_empty();
        world.insert_component(
            inherited_canvas,
            Canvas {
                pixel_perfect: true,
                override_pixel_perfect: false,
                ..Canvas::default()
            },
        );
        world.insert_component(inherited_canvas, GraphicRaycaster::default());
        world.insert_component(inherited_canvas, RectTransform::default());
        world.set_parent(inherited_canvas, Some(canvas));
        let inherited_image = world.spawn_empty();
        world.insert_component(
            inherited_image,
            RectTransform {
                anchored_position: [0.25, 0.75],
                size_delta: [100.4, 50.6],
                ..RectTransform::default()
            },
        );
        world.insert_component(
            inherited_image,
            Image {
                color: [0.25, 1.0, 1.0, 1.0],
                ..Image::default()
            },
        );
        world.set_parent(inherited_image, Some(inherited_canvas));

        let overridden_canvas = world.spawn_empty();
        world.insert_component(
            overridden_canvas,
            Canvas {
                pixel_perfect: true,
                override_pixel_perfect: true,
                ..Canvas::default()
            },
        );
        world.insert_component(overridden_canvas, GraphicRaycaster::default());
        world.insert_component(overridden_canvas, RectTransform::default());
        world.set_parent(overridden_canvas, Some(canvas));
        let overridden_image = world.spawn_empty();
        world.insert_component(
            overridden_image,
            RectTransform {
                anchored_position: [0.25, 0.75],
                size_delta: [100.4, 50.6],
                ..RectTransform::default()
            },
        );
        world.insert_component(
            overridden_image,
            Image {
                color: [0.75, 1.0, 1.0, 1.0],
                ..Image::default()
            },
        );
        world.set_parent(overridden_image, Some(overridden_canvas));

        let frame = collect_ui_frame(&world, 800, 600);
        let inherited_primitive = frame
            .plan
            .primitives
            .iter()
            .find(|primitive| primitive.color[0] == 0.25)
            .unwrap();
        let overridden_primitive = frame
            .plan
            .primitives
            .iter()
            .find(|primitive| primitive.color[0] == 0.75)
            .unwrap();
        let inherited_control = frame
            .controls
            .iter()
            .find(|control| control.entity == inherited_image)
            .unwrap();
        let overridden_control = frame
            .controls
            .iter()
            .find(|control| control.entity == overridden_image)
            .unwrap();

        assert!(inherited_primitive
            .rect
            .iter()
            .any(|value| value.fract() != 0.0));
        assert!(overridden_primitive
            .rect
            .iter()
            .all(|value| value.fract() == 0.0));
        assert_eq!(overridden_primitive.rect[0], overridden_control.rect.x);
        assert_eq!(overridden_primitive.rect[1], overridden_control.rect.y);
        assert_eq!(overridden_primitive.rect[2], overridden_control.rect.width);
        assert_eq!(overridden_primitive.rect[3], overridden_control.rect.height);
        assert!(inherited_control.rect.x.fract() != 0.0);
    }

    #[test]
    fn world_space_canvas_projects_perspective_quads_and_hit_regions() {
        let mut world = World::new();
        let canvas = world.spawn_empty();
        world.insert_component(
            canvas,
            Canvas {
                render_mode: "WorldSpace".into(),
                ..Canvas::default()
            },
        );
        world.insert_component(canvas, GraphicRaycaster::default());
        world.insert_component(
            canvas,
            RectTransform {
                size_delta: [200.0, 100.0],
                ..RectTransform::default()
            },
        );
        world.insert_component(
            canvas,
            RectMask2D {
                softness: [10.0, 20.0],
                ..RectMask2D::default()
            },
        );
        world.insert_component(
            canvas,
            mengine_core::generated::Transform {
                position: [1.0, 0.0, 0.0],
                ..Default::default()
            },
        );
        let image = world.spawn_empty();
        world.insert_component(
            image,
            RectTransform {
                size_delta: [200.0, 100.0],
                ..RectTransform::default()
            },
        );
        world.insert_component(
            image,
            Image {
                raycast_padding: [20.0, 10.0, 20.0, 10.0],
                ..Image::default()
            },
        );
        world.set_parent(image, Some(canvas));
        let hierarchy = TransformHierarchy::build(&world);
        let camera = FrameCamera {
            view: look_at(Vec3::new(0.0, 0.0, 10.0), Vec3::ZERO, Vec3::Y),
            proj: perspective(60.0, 4.0 / 3.0, 0.1, 100.0),
            position: Vec3::new(0.0, 0.0, 10.0),
        };

        let frame = collect_ui_frame_with_hierarchy_and_camera(
            &world,
            &hierarchy,
            800,
            600,
            camera,
            &SortingLayers::default(),
        );
        assert!(frame.plan.primitives.is_empty());
        assert_eq!(frame.world_primitives.len(), 1);
        let primitive = &frame.world_primitives[0].primitive;
        assert!(primitive.key.depth_test);
        assert!(primitive.clip_corners.is_some());
        let soft_clip = primitive.soft_clips[0].expect("projected RectMask2D softness");
        assert!(soft_clip.rect[2] > 0.0);
        assert!(soft_clip.rect[3] > 0.0);
        assert!(soft_clip.softness[0] > 0.0);
        assert!(soft_clip.softness[1] > 0.0);
        assert!(
            primitive.rect[0] + primitive.rect[2] * 0.5 > 400.0,
            "translated Canvas center should project right of center"
        );
        let control = frame.controls.first().expect("Image hit region");
        assert_eq!(
            control.raycast_camera.expect("event camera").position,
            camera.position
        );
        assert!(control.raycast_plane.is_some());
        assert!(control.raycast_corners.is_some());
        let center = [
            control
                .corners
                .unwrap()
                .iter()
                .map(|point| point[0])
                .sum::<f32>()
                * 0.25,
            control
                .corners
                .unwrap()
                .iter()
                .map(|point| point[1])
                .sum::<f32>()
                * 0.25,
        ];
        assert!(control.contains(center[0], center[1]));
        let visible_corner = control.corners.unwrap()[0];
        assert!(!control.contains(visible_corner[0], visible_corner[1]));
        assert!(!control.contains(0.0, 0.0));
    }

    #[test]
    fn world_space_mask_projects_stencil_geometry_and_raycast_regions_together() {
        let mut world = World::new();
        let canvas = world.spawn_empty();
        world.insert_component(
            canvas,
            Canvas {
                render_mode: "WorldSpace".into(),
                ..Canvas::default()
            },
        );
        world.insert_component(canvas, GraphicRaycaster::default());
        world.insert_component(canvas, RectTransform::default());
        world.insert_component(canvas, mengine_core::generated::Transform::default());

        let mask_entity = world.spawn_empty();
        world.insert_component(mask_entity, RectTransform::default());
        world.insert_component(mask_entity, Image::default());
        world.insert_component(
            mask_entity,
            Mask {
                show_mask_graphic: false,
                ..Mask::default()
            },
        );
        world.set_parent(mask_entity, Some(canvas));

        let child = world.spawn_empty();
        world.insert_component(
            child,
            RectTransform {
                size_delta: [200.0, 200.0],
                ..RectTransform::default()
            },
        );
        world.insert_component(child, Image::default());
        world.set_parent(child, Some(mask_entity));

        let camera = FrameCamera {
            view: look_at(Vec3::new(0.0, 0.0, 10.0), Vec3::ZERO, Vec3::Y),
            proj: perspective(60.0, 4.0 / 3.0, 0.1, 100.0),
            position: Vec3::new(0.0, 0.0, 10.0),
        };
        let hierarchy = TransformHierarchy::build(&world);
        let frame = collect_ui_frame_with_hierarchy_and_camera(
            &world,
            &hierarchy,
            800,
            600,
            camera,
            &SortingLayers::default(),
        );

        let modes: Vec<_> = frame
            .world_primitives
            .iter()
            .map(|primitive| primitive.primitive.key.stencil)
            .collect();
        assert_eq!(
            modes,
            vec![
                UiStencilMode::Push { reference: 0 },
                UiStencilMode::Test { reference: 1 },
                UiStencilMode::Pop { reference: 1 },
            ]
        );
        let control = frame
            .controls
            .iter()
            .find(|control| control.entity == child)
            .expect("World Space masked child hit region");
        let mask = control.mask_regions[0].expect("projected mask region");
        assert!(mask.corners.is_some());
        let center_x = mask.rect.x + mask.rect.width * 0.5;
        let center_y = mask.rect.y + mask.rect.height * 0.5;
        assert!(control.contains(center_x, center_y));
        assert!(!control.contains(mask.rect.x + mask.rect.width + 1.0, center_y));
    }

    #[test]
    fn world_space_graphic_raycaster_filters_reversed_graphics_unless_opted_out() {
        let legacy: GraphicRaycaster =
            serde_json::from_value(serde_json::json!({ "enabled": true })).unwrap();
        assert!(legacy.ignore_reversed_graphics);
        assert_eq!(legacy.blocking_objects, "None");
        assert_eq!(legacy.blocking_mask, -1);

        let mut world = World::new();
        let canvas = world.spawn_empty();
        world.insert_component(
            canvas,
            Canvas {
                render_mode: "WorldSpace".into(),
                ..Canvas::default()
            },
        );
        world.insert_component(canvas, GraphicRaycaster::default());
        world.insert_component(canvas, RectTransform::default());
        world.insert_component(
            canvas,
            mengine_core::generated::Transform {
                rotation: [0.0, 1.0, 0.0, 0.0],
                ..Default::default()
            },
        );
        let image = world.spawn_empty();
        world.insert_component(image, RectTransform::default());
        world.insert_component(image, Image::default());
        world.set_parent(image, Some(canvas));
        let camera = FrameCamera {
            view: look_at(Vec3::new(0.0, 0.0, 10.0), Vec3::ZERO, Vec3::Y),
            proj: perspective(60.0, 4.0 / 3.0, 0.1, 100.0),
            position: Vec3::new(0.0, 0.0, 10.0),
        };

        let hierarchy = TransformHierarchy::build(&world);
        let filtered = collect_ui_frame_with_hierarchy_and_camera(
            &world,
            &hierarchy,
            800,
            600,
            camera,
            &SortingLayers::default(),
        );
        assert_eq!(filtered.world_primitives.len(), 1);
        assert!(filtered.controls.is_empty());

        world
            .get_component_mut::<GraphicRaycaster>(canvas)
            .unwrap()
            .ignore_reversed_graphics = false;
        let hierarchy = TransformHierarchy::build(&world);
        let allowed = collect_ui_frame_with_hierarchy_and_camera(
            &world,
            &hierarchy,
            800,
            600,
            camera,
            &SortingLayers::default(),
        );
        assert_eq!(allowed.world_primitives.len(), 1);
        assert_eq!(allowed.controls.len(), 1);
    }

    #[test]
    fn world_space_canvas_joins_the_2d_sorting_queue() {
        use crate::sorting::sort_world_primitives;

        let mut world = World::new();
        let canvas = world.spawn_empty();
        world.insert_component(
            canvas,
            Canvas {
                render_mode: "WorldSpace".into(),
                sorting_layer: "default".into(),
                sorting_order: 5,
                ..Canvas::default()
            },
        );
        world.insert_component(
            canvas,
            RectTransform {
                size_delta: [200.0, 100.0],
                ..RectTransform::default()
            },
        );
        world.insert_component(canvas, mengine_core::generated::Transform::default());
        let image = world.spawn_empty();
        world.insert_component(image, RectTransform::default());
        world.insert_component(image, Image::default());
        world.set_parent(image, Some(canvas));
        let hierarchy = TransformHierarchy::build(&world);
        let camera = FrameCamera {
            view: look_at(Vec3::new(0.0, 0.0, 10.0), Vec3::ZERO, Vec3::Y),
            proj: perspective(60.0, 4.0 / 3.0, 0.1, 100.0),
            position: Vec3::new(0.0, 0.0, 10.0),
        };

        let frame = collect_ui_frame_with_hierarchy_and_camera(
            &world,
            &hierarchy,
            800,
            600,
            camera,
            &SortingLayers::default(),
        );
        assert!(frame.plan.primitives.is_empty());
        assert_eq!(frame.world_primitives.len(), 1);
        assert_eq!(frame.world_primitives[0].kind, WorldPrimitiveKind::TwoD);
        assert_eq!(frame.world_primitives[0].sorting_layer, "default");
        assert_eq!(frame.world_primitives[0].sorting_order, 5);
        assert_eq!(frame.world_primitives[0].world_position, None);

        let make_sprite = |material: &str, sorting_order: i32| {
            let mut primitive = UiPrimitive::solid([0.0, 0.0, 1.0, 1.0], [1.0; 4]);
            primitive.key.material = material.into();
            WorldPrimitive {
                kind: WorldPrimitiveKind::TwoD,
                sorting_layer: "default".into(),
                sorting_order,
                depth: 0.5,
                world_position: Some([0.0, 0.0]),
                primitive,
            }
        };
        let mut queued = frame.world_primitives;
        queued[0].primitive.key.material = "world-canvas".into();
        queued.push(make_sprite("before-canvas", 4));
        queued.push(make_sprite("after-canvas", 6));
        sort_world_primitives(&mut queued, &SortingLayers::default());
        assert_eq!(
            queued
                .iter()
                .map(|value| value.primitive.key.material.as_str())
                .collect::<Vec<_>>(),
            ["before-canvas", "world-canvas", "after-canvas"]
        );
    }

    #[test]
    fn world_space_override_canvas_keeps_outer_rect_transform_ancestry() {
        let mut world = World::new();
        let canvas = world.spawn_empty();
        world.insert_component(
            canvas,
            Canvas {
                render_mode: "WorldSpace".into(),
                ..Canvas::default()
            },
        );
        world.insert_component(
            canvas,
            RectTransform {
                size_delta: [200.0, 100.0],
                ..RectTransform::default()
            },
        );
        world.insert_component(canvas, mengine_core::generated::Transform::default());
        world.insert_component(
            canvas,
            CanvasScaler {
                reference_pixels_per_unit: 100.0,
                reference_resolution: [200.0, 100.0],
                ..CanvasScaler::default()
            },
        );
        let holder = world.spawn_empty();
        world.insert_component(
            holder,
            RectTransform {
                anchored_position: [30.0, 0.0],
                size_delta: [100.0, 50.0],
                ..RectTransform::default()
            },
        );
        world.set_parent(holder, Some(canvas));
        let nested = world.spawn_empty();
        world.insert_component(
            nested,
            Canvas {
                override_sorting: true,
                ..Canvas::default()
            },
        );
        world.insert_component(
            nested,
            RectTransform {
                anchored_position: [50.0, 0.0],
                size_delta: [100.0, 50.0],
                ..RectTransform::default()
            },
        );
        world.set_parent(nested, Some(holder));
        let image = world.spawn_empty();
        world.insert_component(image, RectTransform::default());
        world.insert_component(image, Image::default());
        world.set_parent(image, Some(nested));
        let hierarchy = TransformHierarchy::build(&world);
        let camera = FrameCamera {
            view: look_at(Vec3::new(0.0, 0.0, 10.0), Vec3::ZERO, Vec3::Y),
            proj: perspective(60.0, 4.0 / 3.0, 0.1, 100.0),
            position: Vec3::new(0.0, 0.0, 10.0),
        };

        let frame = collect_ui_frame_with_hierarchy_and_camera(
            &world,
            &hierarchy,
            800,
            600,
            camera,
            &SortingLayers::default(),
        );
        assert!(frame.plan.primitives.is_empty());
        assert_eq!(frame.world_primitives.len(), 1);
        let primitive = &frame.world_primitives[0].primitive;
        assert!(
            primitive.rect[0] + primitive.rect[2] * 0.5 > 435.0,
            "nested render root must retain its intermediate RectTransform offset"
        );
    }

    #[test]
    fn canvas_render_camera_reference_overrides_active_camera_projection() {
        let mut world = World::new();
        let render_camera = world.spawn_empty();
        world.insert_component(
            render_camera,
            mengine_core::generated::Transform {
                position: [0.0, 0.0, 20.0],
                ..Default::default()
            },
        );
        world.insert_component(
            render_camera,
            Camera3D {
                near: 0.5,
                far: 200.0,
                ..Camera3D::default()
            },
        );
        let canvas = world.spawn_empty();
        world.insert_component(
            canvas,
            Canvas {
                render_mode: "ScreenSpaceCamera".into(),
                render_camera: render_camera.to_u64().to_string(),
                plane_distance: 20.0,
                ..Canvas::default()
            },
        );
        world.insert_component(canvas, GraphicRaycaster::default());
        let image = world.spawn_empty();
        world.insert_component(image, RectTransform::default());
        world.insert_component(image, Image::default());
        world.set_parent(image, Some(canvas));
        let hierarchy = TransformHierarchy::build(&world);
        let active = FrameCamera {
            view: look_at(Vec3::new(0.0, 0.0, 5.0), Vec3::ZERO, Vec3::Y),
            proj: perspective(45.0, 4.0 / 3.0, 0.1, 10.0),
            position: Vec3::new(0.0, 0.0, 5.0),
        };
        let assigned = resolve_canvas_camera(
            &world,
            &hierarchy,
            world.get_component::<Canvas>(canvas).unwrap(),
            4.0 / 3.0,
        )
        .unwrap();

        let frame = collect_ui_frame_with_hierarchy_and_camera(
            &world,
            &hierarchy,
            800,
            600,
            active,
            &SortingLayers::default(),
        );
        assert!(frame.plan.primitives.iter().all(|primitive| {
            (primitive.depth - screen_space_camera_depth(assigned, 20.0)).abs() < 0.000001
        }));
        assert_ne!(
            screen_space_camera_depth(assigned, 20.0),
            screen_space_camera_depth(active, 20.0),
        );
        let control = frame.controls.first().expect("Image hit region");
        assert_eq!(
            control
                .raycast_camera
                .expect("assigned event camera")
                .position,
            assigned.position
        );
    }

    #[test]
    fn projected_range_controls_map_quad_coordinates() {
        let control = UiControlRegion {
            entity: Entity::new(1, 1),
            rect: UiRect {
                x: 10.0,
                y: 10.0,
                width: 120.0,
                height: 60.0,
            },
            raycast_padding: [0.0; 4],
            clip: UiClipRect {
                x: 0,
                y: 0,
                width: 200,
                height: 200,
            },
            rotation_radians: 0.0,
            pivot: [0.5, 0.5],
            corners: Some([[10.0, 20.0], [130.0, 10.0], [110.0, 70.0], [20.0, 60.0]]),
            raycast_corners: None,
            corner_inverse_w: None,
            ignore_reversed_graphics: true,
            blocking_objects: BlockingObjects::None,
            blocking_mask: -1,
            raycast_plane: None,
            raycast_camera: None,
            mask_regions: [None; 8],
            image_alpha_hit_test: None,
            kind: UiControlKind::Slider {
                min: 0.0,
                max: 10.0,
                value: 0.0,
                whole_numbers: false,
                direction: "LeftToRight".into(),
            },
            callback: Value::Null,
        };
        assert!((control.range_value_at(60.0, 45.0).unwrap() - 5.0).abs() < 0.001);
    }

    #[test]
    fn aspect_ratio_modes_match_editor_layout_semantics() {
        let parent = UiRect {
            x: 0.0,
            y: 0.0,
            width: 200.0,
            height: 100.0,
        };
        let rect = UiRect {
            x: 50.0,
            y: 25.0,
            width: 100.0,
            height: 50.0,
        };
        assert_eq!(
            apply_aspect_ratio(rect, parent, [0.5, 0.5], "WidthControlsHeight", 1.0),
            UiRect {
                x: 50.0,
                y: 0.0,
                width: 100.0,
                height: 100.0,
            }
        );
        assert_eq!(
            apply_aspect_ratio(rect, parent, [0.5, 0.5], "FitInParent", 1.0),
            UiRect {
                x: 50.0,
                y: 0.0,
                width: 100.0,
                height: 100.0,
            }
        );
        assert_eq!(
            apply_aspect_ratio(rect, parent, [0.0, 0.0], "EnvelopeParent", 1.0),
            UiRect {
                x: 0.0,
                y: 0.0,
                width: 200.0,
                height: 200.0,
            }
        );
    }

    #[test]
    fn content_size_fitter_uses_layout_group_metrics_and_pivot() {
        let group = LayoutGroup {
            direction: "Grid".into(),
            padding: [8.0, 10.0, 12.0, 14.0],
            spacing: [6.0, 4.0],
            cell_size: [100.0, 30.0],
            constraint_count: 2,
            child_force_expand: true,
        };
        let content = measure_layout_content(&group, 3, 1.0);
        assert_eq!(content.preferred_width, 226.0);
        assert_eq!(content.preferred_height, 88.0);
        assert_eq!(
            apply_content_size(
                UiRect {
                    x: 10.0,
                    y: 20.0,
                    width: 300.0,
                    height: 200.0,
                },
                [0.5, 1.0],
                "PreferredSize",
                "MinSize",
                content,
            ),
            UiRect {
                x: 47.0,
                y: 196.0,
                width: 226.0,
                height: 24.0,
            }
        );
    }

    #[test]
    fn graphic_effects_duplicate_geometry_without_breaking_batch_keys() {
        let source = primitive(
            UiRect {
                x: 10.0,
                y: 20.0,
                width: 100.0,
                height: 50.0,
            },
            [1.0, 1.0, 1.0, 0.4],
            [0.5, 0.5],
            0.0,
            "ui/image",
            "atlas",
            UiClipRect {
                x: 0,
                y: 0,
                width: 1920,
                height: 1080,
            },
        );
        let source_key = source.key.clone();
        let mut primitives = vec![source];
        apply_graphic_effects(
            &mut primitives,
            0,
            Some(&Shadow {
                effect_color: [0.0, 0.0, 0.0, 0.5],
                effect_distance: [2.0, -3.0],
                use_graphic_alpha: true,
            }),
            Some(&Outline {
                effect_color: [1.0, 0.5, 0.0, 0.25],
                effect_distance: [1.0, -2.0],
                use_graphic_alpha: false,
            }),
            1.0,
            0.8,
        );

        assert_eq!(primitives.len(), 6);
        assert!(primitives
            .iter()
            .all(|primitive| primitive.key == source_key));
        assert_eq!(primitives[0].rect[0..2], [12.0, 23.0]);
        assert_eq!(primitives[0].color, [0.0, 0.0, 0.0, 0.2]);
        assert_eq!(primitives[1].rect[0..2], [11.0, 22.0]);
        assert_eq!(primitives[1].color, [1.0, 0.5, 0.0, 0.2]);
        assert_eq!(primitives[5].rect[0..2], [10.0, 20.0]);
        assert_eq!(UiBatchPlan::build(primitives).batches.len(), 1);
    }

    #[test]
    fn ui_focus_navigation_deduplicates_subcontrols_wraps_and_draws_one_ring() {
        let entity_a = Entity::new(1, 0);
        let entity_b = Entity::new(2, 0);
        let clip = UiClipRect {
            x: 0,
            y: 0,
            width: 400,
            height: 300,
        };
        let region = |entity, y, kind| UiControlRegion {
            entity,
            rect: UiRect {
                x: 20.0,
                y,
                width: 100.0,
                height: 30.0,
            },
            raycast_padding: [0.0; 4],
            clip,
            rotation_radians: 0.0,
            pivot: [0.5, 0.5],
            corners: None,
            raycast_corners: None,
            corner_inverse_w: None,
            ignore_reversed_graphics: true,
            blocking_objects: BlockingObjects::None,
            blocking_mask: -1,
            raycast_plane: None,
            raycast_camera: None,
            mask_regions: [None; 8],
            image_alpha_hit_test: None,
            kind,
            callback: Value::Null,
        };
        let controls = vec![
            region(entity_a, 20.0, UiControlKind::Button),
            region(entity_b, 60.0, UiControlKind::ListItem { index: 0 }),
            region(entity_b, 90.0, UiControlKind::ListItem { index: 1 }),
            region(entity_a, 0.0, UiControlKind::Blocker),
        ];

        assert_eq!(next_ui_focus(&controls, None, false), Some(entity_a));
        assert_eq!(
            next_ui_focus(&controls, Some(entity_a), false),
            Some(entity_b)
        );
        assert_eq!(
            next_ui_focus(&controls, Some(entity_b), false),
            Some(entity_a)
        );
        assert_eq!(
            next_ui_focus(&controls, Some(entity_a), true),
            Some(entity_b)
        );

        let mut plan = UiBatchPlan::default();
        append_ui_focus_ring(&mut plan, &controls, Some(entity_b));
        assert_eq!(plan.primitives.len(), 4);
        assert_eq!(plan.batches.len(), 1);
        assert_eq!(plan.primitives[0].rect, [18.0, 58.0, 104.0, 2.0]);
        assert_eq!(plan.primitives[1].rect, [18.0, 120.0, 104.0, 2.0]);
    }

    #[test]
    fn toggle_group_enforces_exclusion_switch_off_and_nested_boundaries() {
        let mut world = World::new();
        let group = world.spawn_empty();
        world.insert_component(
            group,
            ToggleGroup {
                allow_switch_off: false,
            },
        );
        let first = world.spawn_empty();
        world.insert_component(
            first,
            Toggle {
                is_on: true,
                ..Default::default()
            },
        );
        world.set_parent(first, Some(group));
        let second = world.spawn_empty();
        world.insert_component(second, Toggle::default());
        world.set_parent(second, Some(group));
        let nested_group = world.spawn_empty();
        world.insert_component(
            nested_group,
            ToggleGroup {
                allow_switch_off: false,
            },
        );
        world.set_parent(nested_group, Some(group));
        let nested = world.spawn_empty();
        world.insert_component(
            nested,
            Toggle {
                is_on: true,
                ..Default::default()
            },
        );
        world.set_parent(nested, Some(nested_group));

        assert!(set_toggle_value(&mut world, second, true));
        assert!(!world.get_component::<Toggle>(first).unwrap().is_on);
        assert!(world.get_component::<Toggle>(second).unwrap().is_on);
        assert!(world.get_component::<Toggle>(nested).unwrap().is_on);
        assert!(!set_toggle_value(&mut world, second, false));
        assert!(world.get_component::<Toggle>(second).unwrap().is_on);

        world
            .get_component_mut::<ToggleGroup>(group)
            .unwrap()
            .allow_switch_off = true;
        assert!(set_toggle_value(&mut world, second, false));
        assert!(!world.get_component::<Toggle>(second).unwrap().is_on);
    }

    #[test]
    fn sliced_images_emit_uv_regions_with_one_shared_rotation_pivot() {
        let mut primitives = Vec::new();
        push_sliced_image(
            &mut primitives,
            UiRect {
                x: 10.0,
                y: 20.0,
                width: 200.0,
                height: 100.0,
            },
            [1.0; 4],
            [0.5, 0.5],
            0.5,
            "panel.png",
            [10.0, 20.0, 30.0, 15.0],
            [100.0, 80.0],
            1.0,
            true,
            UiClipRect {
                x: 0,
                y: 0,
                width: 1000,
                height: 1000,
            },
        );

        assert_eq!(primitives.len(), 9);
        assert_eq!(UiBatchPlan::build(primitives.clone()).batches.len(), 1);
        assert_eq!(primitives[0].uv, [0.0, 0.0, 0.1, 0.1875]);
        assert_eq!(primitives[8].uv, [0.7, 0.75, 0.3, 0.25]);
        for primitive in primitives {
            let pivot_x = primitive.rect[0] + primitive.pivot[0] * primitive.rect[2];
            let pivot_y = primitive.rect[1] + primitive.pivot[1] * primitive.rect[3];
            assert!((pivot_x - 110.0).abs() < 0.0001);
            assert!((pivot_y - 70.0).abs() < 0.0001);
        }
    }

    #[test]
    fn image_pixels_per_unit_multiplier_scales_geometry_and_alpha_mapping() {
        assert_eq!(Image::default().pixels_per_unit_multiplier, 1.0);
        let legacy: Image = serde_json::from_value(serde_json::json!({})).unwrap();
        assert_eq!(legacy.pixels_per_unit_multiplier, 1.0);

        let mut world = World::new();
        let canvas = world.spawn_empty();
        world.insert_component(canvas, Canvas::default());
        world.insert_component(canvas, GraphicRaycaster::default());
        let image = world.spawn_empty();
        world.insert_component(
            image,
            RectTransform {
                size_delta: [200.0, 100.0],
                ..RectTransform::default()
            },
        );
        world.insert_component(
            image,
            Image {
                image_type: "Sliced".into(),
                border: [10.0, 20.0, 30.0, 15.0],
                source_size: [100.0, 80.0],
                pixels_per_unit_multiplier: 2.0,
                alpha_hit_test_minimum_threshold: 0.25,
                ..Image::default()
            },
        );
        world.set_parent(image, Some(canvas));

        let frame = collect_ui_frame(&world, 800, 600);
        let first = frame
            .plan
            .primitives
            .iter()
            .find(|primitive| primitive.key.material == "ui/image-sliced")
            .unwrap();
        assert_eq!([first.rect[2], first.rect[3]], [5.0, 7.5]);
        let filter = frame
            .controls
            .iter()
            .find(|control| control.entity == image)
            .and_then(|control| control.image_alpha_hit_test.as_ref())
            .unwrap();
        assert_eq!(filter.pixel_scale, 0.5);
        assert_eq!(filter.destination_border, [5.0, 10.0, 15.0, 7.5]);
    }

    #[test]
    fn image_preserve_aspect_keeps_the_rect_transform_rotation_pivot() {
        let rect = UiRect {
            x: 10.0,
            y: 20.0,
            width: 100.0,
            height: 100.0,
        };
        let (fitted, pivot) = image_geometry(rect, [0.0, 0.0], [200.0, 100.0], true);
        assert_eq!(
            [fitted.x, fitted.y, fitted.width, fitted.height],
            [10.0, 45.0, 100.0, 50.0]
        );
        assert!((fitted.x + pivot[0] * fitted.width - 10.0).abs() < 0.0001);
        assert!((fitted.y + pivot[1] * fitted.height - 20.0).abs() < 0.0001);
    }

    #[test]
    fn filled_image_linear_and_radial_meshes_match_unity_origins() {
        assert_eq!(
            filled_image_quads("Horizontal", 0.25, true, 0),
            vec![[[0.0, 1.0], [0.0, 0.0], [0.25, 0.0], [0.25, 1.0]]]
        );
        assert_eq!(
            filled_image_quads("Vertical", 0.25, true, 1),
            vec![[[0.0, 0.25], [0.0, 0.0], [1.0, 0.0], [1.0, 0.25]]]
        );
        assert_eq!(
            filled_image_quads("Radial180", 0.5, true, 0),
            vec![[[0.0, 1.0], [0.0, 0.0], [0.5, 0.0], [0.5, 1.0]]]
        );
        assert_eq!(
            filled_image_quads("Radial360", 0.25, true, 0),
            vec![[[0.0, 1.0], [0.0, 0.5], [0.5, 0.5], [0.5, 1.0]]]
        );
        assert!(filled_image_quads("Radial90", 0.0, true, 0).is_empty());
    }

    #[test]
    fn filled_image_mesh_preserves_aspect_rotation_and_full_raycast_rect() {
        let mut world = World::new();
        let canvas = world.spawn_empty();
        world.insert_component(canvas, Canvas::default());
        world.insert_component(canvas, GraphicRaycaster::default());
        let image = world.spawn_empty();
        world.insert_component(
            image,
            RectTransform {
                pivot: [0.0, 0.0],
                size_delta: [200.0, 100.0],
                local_rotation: 30.0,
                ..RectTransform::default()
            },
        );
        world.insert_component(
            image,
            Image {
                image_type: "Filled".into(),
                preserve_aspect: true,
                source_size: [100.0, 100.0],
                fill_method: "Radial360".into(),
                fill_amount: 0.25,
                ..Image::default()
            },
        );
        world.set_parent(image, Some(canvas));

        let frame = collect_ui_frame(&world, 800, 600);
        let primitives: Vec<_> = frame
            .plan
            .primitives
            .iter()
            .filter(|primitive| primitive.key.material == "ui/image")
            .collect();
        assert_eq!(primitives.len(), 1);
        assert_eq!(primitives[0].rect, [450.0, 300.0, 100.0, 100.0]);
        assert_eq!(primitives[0].pivot, [-0.5, 0.0]);
        assert_eq!(
            primitives[0].vertex_positions,
            Some([[0.0, 1.0], [0.0, 0.5], [0.5, 0.5], [0.5, 1.0]])
        );
        assert!((primitives[0].rotation_radians + 30.0_f32.to_radians()).abs() < 0.0001);
        let control = frame
            .controls
            .iter()
            .find(|control| control.entity == image)
            .unwrap();
        assert_eq!(
            [
                control.rect.x,
                control.rect.y,
                control.rect.width,
                control.rect.height
            ],
            [400.0, 300.0, 200.0, 100.0]
        );
    }

    #[test]
    fn preserved_image_mesh_does_not_shrink_its_graphic_raycast_rect() {
        let mut world = World::new();
        let canvas = world.spawn_empty();
        world.insert_component(canvas, Canvas::default());
        world.insert_component(canvas, GraphicRaycaster::default());
        let image = world.spawn_empty();
        world.insert_component(
            image,
            RectTransform {
                size_delta: [200.0, 100.0],
                ..RectTransform::default()
            },
        );
        world.insert_component(
            image,
            Image {
                preserve_aspect: true,
                source_size: [100.0, 100.0],
                ..Image::default()
            },
        );
        world.set_parent(image, Some(canvas));

        let frame = collect_ui_frame(&world, 800, 600);
        let primitive = frame
            .plan
            .primitives
            .iter()
            .find(|primitive| primitive.key.material == "ui/image")
            .unwrap();
        assert_eq!(primitive.rect, [350.0, 250.0, 100.0, 100.0]);
        let control = frame
            .controls
            .iter()
            .find(|control| control.entity == image)
            .unwrap();
        assert_eq!(
            [
                control.rect.x,
                control.rect.y,
                control.rect.width,
                control.rect.height,
            ],
            [300.0, 250.0, 200.0, 100.0]
        );
    }

    #[test]
    fn sliced_image_fill_center_removes_only_a_bordered_center() {
        let clip = UiClipRect {
            x: 0,
            y: 0,
            width: 1000,
            height: 1000,
        };
        let rect = UiRect {
            x: 0.0,
            y: 0.0,
            width: 200.0,
            height: 100.0,
        };
        let mut hollow = Vec::new();
        push_sliced_image(
            &mut hollow,
            rect,
            [1.0; 4],
            [0.5, 0.5],
            0.0,
            "panel.png",
            [10.0, 20.0, 30.0, 15.0],
            [100.0, 80.0],
            1.0,
            false,
            clip,
        );
        assert_eq!(hollow.len(), 8);

        let mut borderless = Vec::new();
        push_sliced_image(
            &mut borderless,
            rect,
            [1.0; 4],
            [0.5, 0.5],
            0.0,
            "panel.png",
            [0.0; 4],
            [100.0, 80.0],
            1.0,
            false,
            clip,
        );
        assert_eq!(borderless.len(), 1);
    }

    #[test]
    fn tiled_image_repeats_edges_and_center_with_partial_uvs() {
        let regions = plan_tiled_image([40.0, 30.0], [75.0, 55.0], [5.0; 4], [5.0; 4], 1.0, true);
        assert_eq!(regions.len(), 25);
        assert_eq!(regions[0].source, [0.0, 0.0, 5.0, 5.0]);
        assert_eq!(regions[0].destination, [0.0, 0.0, 5.0, 5.0]);
        assert!(regions.iter().any(|region| {
            region.destination == [65.0, 45.0, 5.0, 5.0] && region.source == [5.0, 5.0, 5.0, 5.0]
        }));
    }

    #[test]
    fn tiled_image_enlarges_tiles_to_stay_inside_unity_quad_budget() {
        let regions = plan_tiled_image(
            [1.0, 1.0],
            [1_000_000.0, 1_000_000.0],
            [0.0; 4],
            [0.0; 4],
            1.0,
            true,
        );
        assert!(!regions.is_empty());
        assert!(regions.len() <= MAX_TILED_IMAGE_QUADS);
        let area: f64 = regions
            .iter()
            .map(|region| region.destination[2] as f64 * region.destination[3] as f64)
            .sum();
        assert!((area - 1_000_000_000_000.0).abs() < 100_000.0);
    }

    #[test]
    fn tiled_image_fill_center_and_rotation_pivot_flow_through_canvas_collection() {
        let mut world = World::new();
        let canvas = world.spawn_empty();
        world.insert_component(canvas, Canvas::default());
        world.insert_component(canvas, GraphicRaycaster::default());
        let image_entity = world.spawn_empty();
        world.insert_component(
            image_entity,
            RectTransform {
                pivot: [0.0, 0.0],
                size_delta: [75.0, 55.0],
                local_rotation: 30.0,
                ..RectTransform::default()
            },
        );
        world.insert_component(
            image_entity,
            Image {
                image_type: "Tiled".into(),
                fill_center: false,
                border: [5.0; 4],
                source_size: [40.0, 30.0],
                ..Image::default()
            },
        );
        world.set_parent(image_entity, Some(canvas));

        let frame = collect_ui_frame(&world, 800, 600);
        let primitives: Vec<_> = frame
            .plan
            .primitives
            .iter()
            .filter(|primitive| primitive.key.material == "ui/image-tiled")
            .collect();
        assert_eq!(primitives.len(), 16);
        for primitive in primitives {
            assert!(
                (primitive.rect[0] + primitive.pivot[0] * primitive.rect[2] - 400.0).abs() < 0.0001
            );
            assert!(
                (primitive.rect[1] + primitive.pivot[1] * primitive.rect[3] - 300.0).abs() < 0.0001
            );
            assert!((primitive.rotation_radians + 30.0_f32.to_radians()).abs() < 0.0001);
        }
        assert_eq!(frame.controls.len(), 1);
        assert_eq!(frame.controls[0].entity, image_entity);
    }

    #[test]
    fn canvas_controls_generate_batched_primitives_and_hit_regions() {
        let mut world = World::new();
        let canvas = world.spawn_empty();
        world.insert_component(canvas, Canvas::default());
        world.insert_component(canvas, GraphicRaycaster::default());
        world.insert_component(canvas, CanvasScaler::default());
        world.insert_component(
            canvas,
            RectTransform {
                anchor_min: [0.0, 0.0],
                anchor_max: [1.0, 1.0],
                size_delta: [0.0, 0.0],
                ..Default::default()
            },
        );
        let toggle = world.spawn_empty();
        world.insert_component(toggle, RectTransform::default());
        world.insert_component(toggle, Toggle::default());
        world.set_parent(toggle, Some(canvas));
        let slider = world.spawn_empty();
        world.insert_component(
            slider,
            RectTransform {
                anchored_position: [0.0, 80.0],
                size_delta: [220.0, 30.0],
                ..Default::default()
            },
        );
        world.insert_component(slider, Slider::default());
        world.set_parent(slider, Some(canvas));
        let scrollbar = world.spawn_empty();
        world.insert_component(
            scrollbar,
            RectTransform {
                anchored_position: [140.0, 0.0],
                size_delta: [20.0, 180.0],
                ..Default::default()
            },
        );
        world.insert_component(scrollbar, Scrollbar::default());
        world.set_parent(scrollbar, Some(canvas));

        let frame = collect_ui_frame(&world, 1920, 1080);
        assert_eq!(frame.controls.len(), 3);
        assert!(!frame.plan.primitives.is_empty());
        assert!(frame.plan.batches.len() < frame.plan.primitives.len());
        assert!(frame.controls.iter().all(|control| control.contains(
            control.rect.x + control.rect.width * 0.5,
            control.rect.y + control.rect.height * 0.5,
        )));
    }

    #[test]
    fn slider_value_mapping_honors_direction_and_whole_numbers() {
        let control = UiControlRegion {
            entity: Entity::new(1, 1),
            rect: UiRect {
                x: 10.0,
                y: 20.0,
                width: 100.0,
                height: 20.0,
            },
            raycast_padding: [0.0; 4],
            clip: UiClipRect {
                x: 0,
                y: 0,
                width: 200,
                height: 200,
            },
            rotation_radians: 0.0,
            pivot: [0.5, 0.5],
            corners: None,
            raycast_corners: None,
            corner_inverse_w: None,
            ignore_reversed_graphics: true,
            blocking_objects: BlockingObjects::None,
            blocking_mask: -1,
            raycast_plane: None,
            raycast_camera: None,
            mask_regions: [None; 8],
            image_alpha_hit_test: None,
            kind: UiControlKind::Slider {
                min: 0.0,
                max: 10.0,
                value: 0.0,
                whole_numbers: true,
                direction: "RightToLeft".into(),
            },
            callback: Value::Null,
        };
        assert_eq!(control.range_value_at(10.0, 30.0), Some(10.0));
        assert_eq!(control.range_value_at(110.0, 30.0), Some(0.0));
    }

    #[test]
    fn scrollbar_value_mapping_accounts_for_handle_size_and_steps() {
        let control = UiControlRegion {
            entity: Entity::new(1, 1),
            rect: UiRect {
                x: 0.0,
                y: 0.0,
                width: 20.0,
                height: 100.0,
            },
            raycast_padding: [0.0; 4],
            clip: UiClipRect {
                x: 0,
                y: 0,
                width: 100,
                height: 100,
            },
            rotation_radians: 0.0,
            pivot: [0.5, 0.5],
            corners: None,
            raycast_corners: None,
            corner_inverse_w: None,
            ignore_reversed_graphics: true,
            blocking_objects: BlockingObjects::None,
            blocking_mask: -1,
            raycast_plane: None,
            raycast_camera: None,
            mask_regions: [None; 8],
            image_alpha_hit_test: None,
            kind: UiControlKind::Scrollbar {
                value: 0.0,
                size: 0.2,
                number_of_steps: 5,
                direction: "TopToBottom".into(),
            },
            callback: Value::Null,
        };
        assert_eq!(control.range_value_at(10.0, 10.0), Some(0.0));
        assert_eq!(control.range_value_at(10.0, 50.0), Some(0.5));
        assert_eq!(control.range_value_at(10.0, 90.0), Some(1.0));
    }

    #[test]
    fn text_outline_is_serialized_into_outline_primitives_before_glyphs() {
        let mut primitives = Vec::new();
        let clip = UiClipRect {
            x: 0,
            y: 0,
            width: 320,
            height: 200,
        };
        push_text_styled(
            &mut primitives,
            UiRect {
                x: 0.0,
                y: 0.0,
                width: 160.0,
                height: 40.0,
            },
            "A",
            [1.0, 1.0, 1.0, 1.0],
            [0.1, 0.2, 0.3, 0.75],
            2.0,
            16.0,
            "Center",
            "Middle",
            clip,
        );

        let first_fill = primitives
            .iter()
            .position(|primitive| primitive.key.material == "ui/text/bitmap")
            .expect("text fill primitives");
        assert!(first_fill > 0);
        assert!(primitives[..first_fill].iter().all(|primitive| {
            primitive.key.material == "ui/text/bitmap-outline"
                && primitive.color == [0.1, 0.2, 0.3, 0.75]
        }));
        assert!(primitives[first_fill..]
            .iter()
            .all(|primitive| primitive.key.material == "ui/text/bitmap"));
    }

    #[test]
    fn layout_group_places_children_and_canvas_group_inherits_alpha() {
        let mut world = World::new();
        let canvas = world.spawn_empty();
        world.insert_component(canvas, Canvas::default());
        world.insert_component(canvas, GraphicRaycaster::default());
        world.insert_component(canvas, CanvasScaler::default());
        world.insert_component(
            canvas,
            RectTransform {
                anchor_min: [0.0, 0.0],
                anchor_max: [1.0, 1.0],
                size_delta: [0.0, 0.0],
                ..Default::default()
            },
        );
        let layout = world.spawn_empty();
        world.insert_component(
            layout,
            RectTransform {
                size_delta: [300.0, 100.0],
                ..Default::default()
            },
        );
        world.insert_component(
            layout,
            LayoutGroup {
                direction: "Horizontal".into(),
                padding: [0.0; 4],
                spacing: [10.0, 0.0],
                child_force_expand: true,
                ..Default::default()
            },
        );
        world.insert_component(
            layout,
            CanvasGroup {
                alpha: 0.5,
                ..Default::default()
            },
        );
        world.set_parent(layout, Some(canvas));
        for _ in 0..2 {
            let child = world.spawn_empty();
            world.insert_component(child, RectTransform::default());
            world.insert_component(child, InputField::default());
            world.set_parent(child, Some(layout));
        }

        let frame = collect_ui_frame(&world, 1920, 1080);
        assert_eq!(frame.controls.len(), 2);
        assert!((frame.controls[0].rect.width - 145.0).abs() < 0.001);
        assert!((frame.controls[1].rect.x - frame.controls[0].rect.x - 155.0).abs() < 0.001);
        assert!(frame
            .plan
            .primitives
            .iter()
            .filter(|primitive| primitive.key.material == "ui/input")
            .all(|primitive| primitive.color[3] <= 0.5));
    }

    #[test]
    fn canvas_group_can_ignore_parent_alpha_interaction_and_raycasts() {
        let mut world = World::new();
        let canvas = world.spawn_empty();
        world.insert_component(canvas, Canvas::default());
        world.insert_component(canvas, GraphicRaycaster::default());

        let parent_group = world.spawn_empty();
        world.insert_component(parent_group, RectTransform::default());
        world.insert_component(
            parent_group,
            CanvasGroup {
                alpha: 0.25,
                interactable: false,
                blocks_raycasts: false,
                ..Default::default()
            },
        );
        world.set_parent(parent_group, Some(canvas));

        let inherited_button = world.spawn_empty();
        world.insert_component(
            inherited_button,
            RectTransform {
                anchored_position: [-100.0, 0.0],
                ..Default::default()
            },
        );
        world.insert_component(inherited_button, Button::default());
        world.set_parent(inherited_button, Some(parent_group));

        let independent_group = world.spawn_empty();
        world.insert_component(independent_group, RectTransform::default());
        world.insert_component(
            independent_group,
            CanvasGroup {
                alpha: 0.5,
                ignore_parent_groups: true,
                ..Default::default()
            },
        );
        world.set_parent(independent_group, Some(parent_group));

        let independent_button = world.spawn_empty();
        world.insert_component(
            independent_button,
            RectTransform {
                anchored_position: [100.0, 0.0],
                ..Default::default()
            },
        );
        world.insert_component(independent_button, Button::default());
        world.set_parent(independent_button, Some(independent_group));

        let frame = collect_ui_frame(&world, 800, 600);
        assert!(!frame
            .controls
            .iter()
            .any(|control| control.entity == inherited_button));
        assert!(frame
            .controls
            .iter()
            .any(|control| control.entity == independent_button));

        let button_primitives: Vec<_> = frame
            .plan
            .primitives
            .iter()
            .filter(|primitive| primitive.key.material == "ui/button")
            .collect();
        assert_eq!(button_primitives.len(), 2);
        let inherited = button_primitives
            .iter()
            .find(|primitive| primitive.rect[0] < 350.0)
            .unwrap();
        let independent = button_primitives
            .iter()
            .find(|primitive| primitive.rect[0] > 350.0)
            .unwrap();
        assert!((inherited.color[3] - Button::default().disabled_color[3] * 0.25).abs() < 0.0001);
        assert!((independent.color[3] - 0.5).abs() < 0.0001);
    }

    #[test]
    fn advanced_controls_generate_expected_hit_regions_and_clips() {
        let mut world = World::new();
        let canvas = world.spawn_empty();
        world.insert_component(canvas, Canvas::default());
        world.insert_component(canvas, GraphicRaycaster::default());
        world.insert_component(canvas, CanvasScaler::default());
        world.insert_component(
            canvas,
            RectTransform {
                anchor_min: [0.0, 0.0],
                anchor_max: [1.0, 1.0],
                size_delta: [0.0, 0.0],
                ..Default::default()
            },
        );

        let input = world.spawn_empty();
        world.insert_component(input, RectTransform::default());
        world.insert_component(input, InputField::default());
        world.set_parent(input, Some(canvas));

        let dropdown = world.spawn_empty();
        world.insert_component(dropdown, RectTransform::default());
        world.insert_component(
            dropdown,
            Dropdown {
                options: vec!["A".into(), "B".into()],
                expanded: true,
                ..Default::default()
            },
        );
        world.set_parent(dropdown, Some(canvas));

        let list = world.spawn_empty();
        world.insert_component(list, RectTransform::default());
        world.insert_component(
            list,
            ListView {
                items: (0..100).map(|index| format!("Item {index}")).collect(),
                ..Default::default()
            },
        );
        world.set_parent(list, Some(canvas));

        let tabs = world.spawn_empty();
        world.insert_component(tabs, RectTransform::default());
        world.insert_component(
            tabs,
            TabView {
                tabs: vec!["A".into(), "B".into(), "C".into()],
                ..Default::default()
            },
        );
        world.set_parent(tabs, Some(canvas));

        let masked = world.spawn_empty();
        world.insert_component(
            masked,
            RectTransform {
                size_delta: [100.0, 80.0],
                ..Default::default()
            },
        );
        world.insert_component(masked, RectMask2D::default());
        world.set_parent(masked, Some(canvas));
        let panel = world.spawn_empty();
        world.insert_component(
            panel,
            RectTransform {
                size_delta: [200.0, 160.0],
                ..Default::default()
            },
        );
        world.insert_component(
            panel,
            Panel {
                raycast_target: true,
                ..Default::default()
            },
        );
        world.set_parent(panel, Some(masked));

        let frame = collect_ui_frame(&world, 1920, 1080);
        assert!(frame
            .controls
            .iter()
            .any(|control| matches!(control.kind, UiControlKind::InputField)));
        assert_eq!(
            frame
                .controls
                .iter()
                .filter(|control| matches!(control.kind, UiControlKind::Dropdown { .. }))
                .count(),
            3
        );
        let visible_list_controls = frame
            .controls
            .iter()
            .filter(|control| matches!(control.kind, UiControlKind::ListItem { .. }))
            .count();
        assert!(visible_list_controls > 0 && visible_list_controls < 10);
        assert_eq!(
            frame
                .controls
                .iter()
                .filter(|control| matches!(control.kind, UiControlKind::Tab { .. }))
                .count(),
            3
        );
        let panel_primitive = frame
            .plan
            .primitives
            .iter()
            .find(|primitive| primitive.key.material == "ui/panel")
            .unwrap();
        assert_eq!(panel_primitive.key.clip.unwrap().width, 100);
        assert_eq!(panel_primitive.key.clip.unwrap().height, 80);
        let panel_control = frame
            .controls
            .iter()
            .find(|control| control.entity == panel)
            .unwrap();
        assert!(panel_control.contains(
            panel_control.clip.x as f32 + panel_control.clip.width as f32 * 0.5,
            panel_control.clip.y as f32 + panel_control.clip.height as f32 * 0.5,
        ));
        assert!(!panel_control.contains(
            panel_control.clip.x as f32 - 1.0,
            panel_control.clip.y as f32 + 1.0,
        ));
    }

    #[test]
    fn mask_hides_its_graphic_stencils_children_and_filters_raycast_rects() {
        let mut world = World::new();
        let canvas = world.spawn_empty();
        world.insert_component(canvas, Canvas::default());
        world.insert_component(canvas, GraphicRaycaster::default());

        let mask_entity = world.spawn_empty();
        world.insert_component(mask_entity, RectTransform::default());
        world.insert_component(mask_entity, Image::default());
        world.insert_component(
            mask_entity,
            Mask {
                show_mask_graphic: false,
                ..Mask::default()
            },
        );
        world.set_parent(mask_entity, Some(canvas));

        let child = world.spawn_empty();
        world.insert_component(
            child,
            RectTransform {
                size_delta: [200.0, 200.0],
                ..RectTransform::default()
            },
        );
        world.insert_component(
            child,
            Panel {
                raycast_target: true,
                ..Panel::default()
            },
        );
        world.set_parent(child, Some(mask_entity));

        let frame = collect_ui_frame(&world, 800, 600);
        assert!(frame.plan.primitives.len() >= 3);
        assert!(matches!(
            frame.plan.primitives[0].key.stencil,
            UiStencilMode::Push { reference: 0 }
        ));
        assert!(matches!(
            frame.plan.primitives.last().unwrap().key.stencil,
            UiStencilMode::Pop { reference: 1 }
        ));
        assert!(frame.plan.primitives[1..frame.plan.primitives.len() - 1]
            .iter()
            .all(|primitive| matches!(
                primitive.key.stencil,
                UiStencilMode::Test { reference: 1 }
            )));
        let control = frame
            .controls
            .iter()
            .find(|control| control.entity == child)
            .expect("masked child remains raycastable inside the mask");
        assert!(control.contains(400.0, 300.0));
        assert!(!control.contains(475.0, 300.0));
    }

    #[test]
    fn nested_masks_restore_parent_stencil_depth_after_each_subtree() {
        let mut world = World::new();
        let canvas = world.spawn_empty();
        world.insert_component(canvas, Canvas::default());

        let outer = world.spawn_empty();
        world.insert_component(outer, RectTransform::default());
        world.insert_component(outer, Image::default());
        world.insert_component(outer, Mask::default());
        world.set_parent(outer, Some(canvas));

        let inner = world.spawn_empty();
        world.insert_component(inner, RectTransform::default());
        world.insert_component(inner, Image::default());
        world.insert_component(
            inner,
            Mask {
                show_mask_graphic: false,
                ..Mask::default()
            },
        );
        world.set_parent(inner, Some(outer));

        let child = world.spawn_empty();
        world.insert_component(child, RectTransform::default());
        world.insert_component(child, Image::default());
        world.set_parent(child, Some(inner));

        let frame = collect_ui_frame(&world, 800, 600);
        let modes: Vec<_> = frame
            .plan
            .primitives
            .iter()
            .map(|primitive| primitive.key.stencil)
            .collect();
        assert_eq!(
            modes,
            vec![
                UiStencilMode::Disabled,
                UiStencilMode::Push { reference: 0 },
                UiStencilMode::Push { reference: 1 },
                UiStencilMode::Test { reference: 2 },
                UiStencilMode::Pop { reference: 2 },
                UiStencilMode::Pop { reference: 1 },
            ]
        );
    }

    #[test]
    fn ninth_nested_mask_renders_normally_without_allocating_stencil_depth() {
        let mut world = World::new();
        let canvas = world.spawn_empty();
        world.insert_component(canvas, Canvas::default());

        let mut parent = canvas;
        for _ in 0..9 {
            let entity = world.spawn_empty();
            world.insert_component(entity, RectTransform::default());
            world.insert_component(entity, Image::default());
            world.insert_component(
                entity,
                Mask {
                    show_mask_graphic: false,
                    ..Mask::default()
                },
            );
            world.set_parent(entity, Some(parent));
            parent = entity;
        }
        let child = world.spawn_empty();
        world.insert_component(child, RectTransform::default());
        world.insert_component(child, Image::default());
        world.set_parent(child, Some(parent));

        let frame = collect_ui_frame(&world, 800, 600);
        let modes: Vec<_> = frame
            .plan
            .primitives
            .iter()
            .map(|primitive| primitive.key.stencil)
            .collect();
        assert_eq!(
            modes
                .iter()
                .filter(|mode| matches!(mode, UiStencilMode::Push { .. }))
                .count(),
            8
        );
        assert_eq!(
            modes
                .iter()
                .filter(|mode| matches!(mode, UiStencilMode::Pop { .. }))
                .count(),
            8
        );
        assert_eq!(modes[8], UiStencilMode::Test { reference: 8 });
        assert_eq!(modes[9], UiStencilMode::Test { reference: 8 });
        assert!(!modes.iter().any(|mode| matches!(
            mode,
            UiStencilMode::Push { reference: 8 }
                | UiStencilMode::Test { reference: 9 }
                | UiStencilMode::Pop { reference: 9 }
        )));
    }

    #[test]
    fn canvas_below_an_inactive_parent_does_not_render_or_receive_input() {
        let mut world = World::new();
        let parent = world.spawn_empty();
        world.set_editor_state(parent, 0, false);
        let canvas = world.spawn_empty();
        world.insert_component(canvas, Canvas::default());
        world.set_parent(canvas, Some(parent));
        let button = world.spawn_empty();
        world.insert_component(button, RectTransform::default());
        world.insert_component(button, Button::default());
        world.set_parent(button, Some(canvas));

        let frame = collect_ui_frame(&world, 1920, 1080);
        assert!(frame.plan.primitives.is_empty());
        assert!(frame.controls.is_empty());
    }

    #[test]
    fn disabled_canvas_suppresses_override_sorting_descendants() {
        let legacy: Canvas = serde_json::from_value(serde_json::json!({})).unwrap();
        assert!(legacy.enabled);

        let mut world = World::new();
        let root = world.spawn_empty();
        world.insert_component(
            root,
            Canvas {
                enabled: false,
                ..Canvas::default()
            },
        );
        let nested = world.spawn_empty();
        world.insert_component(
            nested,
            Canvas {
                override_sorting: true,
                ..Canvas::default()
            },
        );
        world.insert_component(nested, GraphicRaycaster::default());
        world.set_parent(nested, Some(root));
        let image = world.spawn_empty();
        world.insert_component(image, RectTransform::default());
        world.insert_component(image, Image::default());
        world.set_parent(image, Some(nested));

        let frame = collect_ui_frame(&world, 1920, 1080);
        assert!(frame.plan.primitives.is_empty());
        assert!(frame.controls.is_empty());
    }

    fn alpha_filter(texture: Arc<UiAlphaTexture>) -> UiImageAlphaHitTest {
        UiImageAlphaHitTest {
            threshold: 0.5,
            sprite: "test.png".into(),
            image_type: "Simple".into(),
            source_size: [2.0, 1.0],
            source_border: [0.0; 4],
            destination_border: [0.0; 4],
            destination_size: [100.0, 20.0],
            pixel_scale: 1.0,
            fill_center: true,
            texture_uv: [0.0, 0.0, 1.0, 1.0],
            texture: Some(texture),
        }
    }

    #[test]
    fn image_alpha_hit_test_defaults_and_same_entity_controls_match_unity() {
        assert_eq!(Image::default().alpha_hit_test_minimum_threshold, 0.0);
        let legacy: Image = serde_json::from_value(serde_json::json!({})).unwrap();
        assert_eq!(legacy.alpha_hit_test_minimum_threshold, 0.0);

        let mut world = World::new();
        let canvas = world.spawn_empty();
        world.insert_component(canvas, Canvas::default());
        world.insert_component(canvas, GraphicRaycaster::default());
        let button = world.spawn_empty();
        world.insert_component(button, RectTransform::default());
        world.insert_component(
            button,
            Image {
                alpha_hit_test_minimum_threshold: 0.25,
                ..Image::default()
            },
        );
        world.insert_component(button, Button::default());
        world.set_parent(button, Some(canvas));

        let frame = collect_ui_frame(&world, 800, 600);
        let controls = frame
            .controls
            .iter()
            .filter(|control| control.entity == button)
            .collect::<Vec<_>>();
        assert_eq!(controls.len(), 2);
        assert!(controls.iter().all(|control| control
            .image_alpha_hit_test
            .as_ref()
            .is_some_and(|filter| { filter.threshold == 0.25 && filter.sprite == "white" })));
    }

    #[test]
    fn alpha_hit_test_samples_transparent_pixels_after_rotation() {
        let texture = Arc::new(UiAlphaTexture {
            width: 2,
            height: 1,
            alpha: Arc::from([0_u8, 255_u8]),
        });
        let clip = UiClipRect {
            x: 0,
            y: 0,
            width: 200,
            height: 200,
        };
        let mut control = control_region(
            Entity::new(1, 1),
            UiRect {
                x: 10.0,
                y: 20.0,
                width: 100.0,
                height: 20.0,
            },
            std::f32::consts::FRAC_PI_2,
            [0.5, 0.5],
            clip,
            true,
            UiControlKind::Button,
            Value::Null,
        );
        control.image_alpha_hit_test = Some(alpha_filter(texture));
        assert!(!control.contains(60.0, 5.0));
        assert!(control.contains(60.0, 55.0));
    }

    #[test]
    fn projected_alpha_hit_coordinates_use_reciprocal_clip_w() {
        let mut control = control_region(
            Entity::new(1, 1),
            UiRect {
                x: 0.0,
                y: 0.0,
                width: 100.0,
                height: 100.0,
            },
            0.0,
            [0.5, 0.5],
            UiClipRect {
                x: 0,
                y: 0,
                width: 100,
                height: 100,
            },
            true,
            UiControlKind::Blocker,
            Value::Null,
        );
        control.corners = Some([[0.0, 0.0], [100.0, 0.0], [100.0, 100.0], [0.0, 100.0]]);
        control.corner_inverse_w = Some([1.0, 0.5, 0.5, 1.0]);
        let uv = control.normalized_point(50.0, 50.0).unwrap();
        assert!((uv[0] - 1.0 / 3.0).abs() < 0.000001);
        assert!((uv[1] - 1.0 / 3.0).abs() < 0.000001);
    }

    #[test]
    fn sliced_and_tiled_alpha_mapping_matches_render_geometry() {
        let sliced = map_image_alpha_point(
            [90.0, 100.0],
            [200.0, 200.0],
            "Sliced",
            [100.0, 100.0],
            [10.0, 20.0, 30.0, 15.0],
            [10.0, 20.0, 30.0, 15.0],
            1.0,
            true,
        )
        .unwrap();
        assert!((sliced[0] - 0.4).abs() < 0.000001);
        assert!((sliced[1] - 0.4848485).abs() < 0.000001);

        let first = map_image_alpha_point(
            [12.0, 12.0],
            [100.0, 80.0],
            "Tiled",
            [40.0, 30.0],
            [5.0; 4],
            [5.0; 4],
            1.0,
            true,
        )
        .unwrap();
        let repeated = map_image_alpha_point(
            [42.0, 32.0],
            [100.0, 80.0],
            "Tiled",
            [40.0, 30.0],
            [5.0; 4],
            [5.0; 4],
            1.0,
            true,
        )
        .unwrap();
        assert!((first[0] - repeated[0]).abs() < 0.000001);
        assert!((first[1] - repeated[1]).abs() < 0.000001);
    }
}
