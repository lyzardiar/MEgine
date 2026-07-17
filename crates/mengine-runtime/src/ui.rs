use mengine_core::generated::{
    Button, Canvas, CanvasGroup, CanvasScaler, Dropdown, Image, InputField, LayoutGroup, ListView,
    Panel, ProgressBar, RectMask2D, RectTransform, ScrollView, Scrollbar, Slider, TabView, Text,
    Toggle,
};
use mengine_core::hierarchy::Parent;
use mengine_core::{Entity, World};
use mengine_rhi::{UiBatchKey, UiBatchPlan, UiBlendMode, UiClipRect, UiPrimitive};
use serde_json::Value;

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct UiRect {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
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
    pub clip: UiClipRect,
    pub rotation_radians: f32,
    pub pivot: [f32; 2],
    pub kind: UiControlKind,
    pub callback: Value,
}

impl UiControlRegion {
    pub fn contains(&self, x: f32, y: f32) -> bool {
        if x < self.clip.x as f32
            || y < self.clip.y as f32
            || x > (self.clip.x + self.clip.width) as f32
            || y > (self.clip.y + self.clip.height) as f32
        {
            return false;
        }
        let pivot_x = self.rect.x + self.rect.width * self.pivot[0];
        let pivot_y = self.rect.y + self.rect.height * self.pivot[1];
        let dx = x - pivot_x;
        let dy = y - pivot_y;
        let c = self.rotation_radians.cos();
        let s = self.rotation_radians.sin();
        let local_x = dx * c + dy * s + self.rect.width * self.pivot[0];
        let local_y = -dx * s + dy * c + self.rect.height * self.pivot[1];
        local_x >= 0.0
            && local_y >= 0.0
            && local_x <= self.rect.width
            && local_y <= self.rect.height
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
        let pivot_x = self.rect.x + self.rect.width * self.pivot[0];
        let pivot_y = self.rect.y + self.rect.height * self.pivot[1];
        let dx = x - pivot_x;
        let dy = y - pivot_y;
        let c = self.rotation_radians.cos();
        let s = self.rotation_radians.sin();
        let local_x = dx * c + dy * s + self.rect.width * self.pivot[0];
        let local_y = -dx * s + dy * c + self.rect.height * self.pivot[1];
        let mut t = if direction == "LeftToRight" || direction == "RightToLeft" {
            local_x / self.rect.width.max(1.0)
        } else {
            local_y / self.rect.height.max(1.0)
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

#[derive(Clone, Debug, Default)]
pub struct RuntimeUiFrame {
    pub plan: UiBatchPlan,
    pub controls: Vec<UiControlRegion>,
}

#[derive(Clone, Copy, Debug)]
struct UiInheritedState {
    alpha: f32,
    interactable: bool,
    blocks_raycasts: bool,
}

#[derive(Clone, Copy, Debug)]
struct UiWalkLayout {
    parent_rect: UiRect,
    scale: f32,
    clip: UiClipRect,
    forced_rect: Option<UiRect>,
}

impl Default for UiInheritedState {
    fn default() -> Self {
        Self {
            alpha: 1.0,
            interactable: true,
            blocks_raycasts: true,
        }
    }
}

pub fn collect_ui_frame(world: &World, width: u32, height: u32) -> RuntimeUiFrame {
    let root = UiRect {
        x: 0.0,
        y: 0.0,
        width: width.max(1) as f32,
        height: height.max(1) as f32,
    };
    let mut canvases: Vec<Entity> = world
        .iter_entities()
        .filter(|entity| {
            world.entity_active(*entity) && world.get_component::<Canvas>(*entity).is_some()
        })
        .collect();
    canvases.sort_by_key(|entity| {
        world
            .get_component::<Canvas>(*entity)
            .map(|canvas| canvas.sorting_order)
            .unwrap_or_default()
    });

    let mut primitives = Vec::new();
    let mut controls = Vec::new();
    for canvas_entity in canvases {
        let Some(canvas) = world.get_component::<Canvas>(canvas_entity) else {
            continue;
        };
        if canvas.render_mode != "ScreenSpaceOverlay" && canvas.render_mode != "ScreenSpaceCamera" {
            continue;
        }
        let scale = world
            .get_component::<CanvasScaler>(canvas_entity)
            .map(|scaler| canvas_scale_factor(scaler, root.width, root.height))
            .unwrap_or(1.0);
        let canvas_rect = world
            .get_component::<RectTransform>(canvas_entity)
            .map(|rect| solve_rect(root, rect, scale))
            .unwrap_or(root);
        let clip = UiClipRect {
            x: root.x.max(0.0) as u32,
            y: root.y.max(0.0) as u32,
            width: root.width.max(1.0) as u32,
            height: root.height.max(1.0) as u32,
        };
        for child in children_of(world, canvas_entity) {
            walk(
                world,
                child,
                UiWalkLayout {
                    parent_rect: canvas_rect,
                    scale,
                    clip,
                    forced_rect: None,
                },
                UiInheritedState::default(),
                &mut primitives,
                &mut controls,
            );
        }
    }

    RuntimeUiFrame {
        plan: UiBatchPlan::build(primitives),
        controls,
    }
}

fn walk(
    world: &World,
    entity: Entity,
    layout_state: UiWalkLayout,
    inherited: UiInheritedState,
    primitives: &mut Vec<UiPrimitive>,
    controls: &mut Vec<UiControlRegion>,
) {
    if !world.entity_active(entity) {
        return;
    }
    let rect_transform = world
        .get_component::<RectTransform>(entity)
        .cloned()
        .unwrap_or_default();
    let UiWalkLayout {
        parent_rect,
        scale,
        clip,
        forced_rect,
    } = layout_state;
    let rect = forced_rect.unwrap_or_else(|| solve_rect(parent_rect, &rect_transform, scale));
    let rotation = -rect_transform.local_rotation.to_radians();
    let pivot = rect_transform.pivot;
    let mut state = inherited;
    if let Some(group) = world.get_component::<CanvasGroup>(entity) {
        state.alpha *= group.alpha.clamp(0.0, 1.0);
        state.interactable &= group.interactable;
        state.blocks_raycasts &= group.blocks_raycasts;
    }
    let mut child_clip = clip;
    if let Some(mask) = world.get_component::<RectMask2D>(entity) {
        if mask.enabled {
            child_clip = intersect_clip(child_clip, inset_rect(rect, mask.padding, scale));
        }
    }
    if world.get_component::<ScrollView>(entity).is_some()
        || world.get_component::<ListView>(entity).is_some()
    {
        child_clip = intersect_clip(child_clip, rect);
    }
    let image = world.get_component::<Image>(entity);

    if let Some(image) = image {
        primitives.push(primitive(
            rect,
            multiply_alpha(image.color, state.alpha),
            pivot,
            rotation,
            "ui/image",
            &image.sprite,
            clip,
        ));
    }

    if let Some(button) = world.get_component::<Button>(entity) {
        if image.is_none() {
            primitives.push(primitive(
                rect,
                [
                    0.25,
                    0.45,
                    0.85,
                    state.alpha
                        * if button.interactable && state.interactable {
                            1.0
                        } else {
                            0.45
                        },
                ],
                pivot,
                rotation,
                "ui/button",
                "white",
                clip,
            ));
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
        if button.interactable && state.interactable && state.blocks_raycasts {
            controls.push(UiControlRegion {
                entity,
                rect,
                clip,
                rotation_radians: rotation,
                pivot,
                kind: UiControlKind::Button,
                callback: button.on_click.clone(),
            });
        }
    }

    if let Some(text) = world.get_component::<Text>(entity) {
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
        if toggle.interactable && state.interactable && state.blocks_raycasts {
            controls.push(UiControlRegion {
                entity,
                rect,
                clip,
                rotation_radians: rotation,
                pivot,
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
        if slider.interactable && state.interactable && state.blocks_raycasts {
            controls.push(UiControlRegion {
                entity,
                rect,
                clip,
                rotation_radians: rotation,
                pivot,
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
        if scrollbar.interactable && state.interactable && state.blocks_raycasts {
            controls.push(UiControlRegion {
                entity,
                rect,
                clip,
                rotation_radians: rotation,
                pivot,
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

    if let Some(panel) = world.get_component::<Panel>(entity) {
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
        if panel.raycast_target && state.blocks_raycasts {
            controls.push(control_region(
                entity,
                rect,
                rotation,
                pivot,
                clip,
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
        if enabled && state.blocks_raycasts {
            controls.push(control_region(
                entity,
                rect,
                rotation,
                pivot,
                clip,
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
        if enabled && state.blocks_raycasts {
            controls.push(control_region(
                entity,
                rect,
                rotation,
                pivot,
                clip,
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
                if enabled && state.blocks_raycasts {
                    controls.push(control_region(
                        entity,
                        option_rect,
                        rotation,
                        pivot,
                        clip,
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
            if enabled && state.blocks_raycasts {
                controls.push(control_region(
                    entity,
                    intersect_rect(row, rect),
                    rotation,
                    pivot,
                    child_clip,
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
        if state.interactable && state.blocks_raycasts {
            controls.push(control_region(
                entity,
                rect,
                rotation,
                pivot,
                clip,
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
            if tab_view.interactable && state.interactable && state.blocks_raycasts {
                controls.push(control_region(
                    entity,
                    tab_rect,
                    rotation,
                    pivot,
                    clip,
                    UiControlKind::Tab {
                        index: index as i32,
                    },
                    tab_view.on_value_changed.clone(),
                ));
            }
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
            UiWalkLayout {
                parent_rect: child_parent,
                scale,
                clip: child_clip,
                forced_rect: forced,
            },
            state,
            primitives,
            controls,
        );
    }
}

fn children_of(world: &World, parent: Entity) -> Vec<Entity> {
    let mut children: Vec<Entity> = world
        .iter_entities()
        .filter(|entity| {
            world
                .get_component::<Parent>(*entity)
                .is_some_and(|value| value.entity == parent)
        })
        .collect();
    children.sort_by_key(|entity| world.sibling_index(*entity));
    children
}

fn control_region(
    entity: Entity,
    rect: UiRect,
    rotation_radians: f32,
    pivot: [f32; 2],
    clip: UiClipRect,
    kind: UiControlKind,
    callback: Value,
) -> UiControlRegion {
    UiControlRegion {
        entity,
        rect,
        clip,
        rotation_radians,
        pivot,
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

fn canvas_scale_factor(scaler: &CanvasScaler, width: f32, height: f32) -> f32 {
    if scaler.ui_scale_mode == "ConstantPixelSize" {
        return scaler.scale_factor.max(0.0001);
    }
    let reference_width = scaler.reference_resolution[0].max(1.0);
    let reference_height = scaler.reference_resolution[1].max(1.0);
    let match_factor = scaler.match_width_or_height.clamp(0.0, 1.0);
    let log_width = (width / reference_width).ln();
    let log_height = (height / reference_height).ln();
    (log_width * (1.0 - match_factor) + log_height * match_factor).exp()
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
        key: UiBatchKey {
            material: material.into(),
            texture: texture.into(),
            clip: Some(clip),
            blend: UiBlendMode::Alpha,
        },
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
    fn canvas_controls_generate_batched_primitives_and_hit_regions() {
        let mut world = World::new();
        let canvas = world.spawn_empty();
        world.insert_component(canvas, Canvas::default());
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
            clip: UiClipRect {
                x: 0,
                y: 0,
                width: 200,
                height: 200,
            },
            rotation_radians: 0.0,
            pivot: [0.5, 0.5],
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
            clip: UiClipRect {
                x: 0,
                y: 0,
                width: 100,
                height: 100,
            },
            rotation_radians: 0.0,
            pivot: [0.5, 0.5],
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
    fn advanced_controls_generate_expected_hit_regions_and_clips() {
        let mut world = World::new();
        let canvas = world.spawn_empty();
        world.insert_component(canvas, Canvas::default());
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
}
