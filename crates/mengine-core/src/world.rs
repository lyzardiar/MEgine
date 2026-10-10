use crate::command::{CommandBuffer, WorldCommand};
use crate::component::{Component, ComponentBox, ComponentId, ComponentRegistry};
use crate::entity::Entity;
use crate::generated::{Name, Transform};
use crate::hierarchy::{Children, Parent};
use crate::schedule::Schedule;
use crate::time::Time;
use glam::{Quat, Vec3, Vec4};
use serde_json::Value;
use std::any::Any;
use std::collections::{BTreeSet, HashMap};
use std::sync::atomic::{AtomicU64, Ordering};

static NEXT_WORLD_ID: AtomicU64 = AtomicU64::new(1);

struct EntityRecord {
    revision: u64,
    generation: u32,
    alive: bool,
    name: Option<String>,
    components: HashMap<String, ComponentBox>,
    serialized_components: HashMap<String, Value>,
    sibling_index: i32,
    active: bool,
    tag: String,
    layer: u8,
}

pub struct World {
    pub(crate) snapshot_id: u64,
    entities: Vec<EntityRecord>,
    free_list: Vec<u32>,
    component_entities: HashMap<String, BTreeSet<u32>>,
    pub time: Time,
    pub commands: CommandBuffer,
    pub schedule: Schedule,
    pub registry: ComponentRegistry,
    pub selected: Option<Entity>,
    /// Last spawned entities from a single Spawn command batch (for scripts).
    last_spawned: Vec<Entity>,
}

impl Default for World {
    fn default() -> Self {
        Self::new()
    }
}

impl World {
    pub fn new() -> Self {
        let mut registry = ComponentRegistry::new();
        for name in crate::generated::meta::COMPONENT_NAMES {
            registry.register_named(name);
        }
        registry.register_named("Parent");
        registry.register_named("Children");
        Self {
            snapshot_id: NEXT_WORLD_ID.fetch_add(1, Ordering::Relaxed),
            entities: Vec::new(),
            free_list: Vec::new(),
            component_entities: HashMap::new(),
            time: Time::default(),
            commands: CommandBuffer::new(),
            schedule: Schedule::new(),
            registry,
            selected: None,
            last_spawned: Vec::new(),
        }
    }

    pub fn spawn_empty(&mut self) -> Entity {
        if let Some(index) = self.free_list.pop() {
            let rec = &mut self.entities[index as usize];
            rec.alive = true;
            rec.revision = 0;
            rec.generation = rec.generation.wrapping_add(1);
            rec.name = None;
            rec.components.clear();
            rec.serialized_components.clear();
            rec.sibling_index = 0;
            rec.active = true;
            rec.tag = "Untagged".into();
            rec.layer = 0;
            Entity::new(index, rec.generation)
        } else {
            let index = self.entities.len() as u32;
            self.entities.push(EntityRecord {
                revision: 0,
                generation: 1,
                alive: true,
                name: None,
                components: HashMap::new(),
                serialized_components: HashMap::new(),
                sibling_index: 0,
                active: true,
                tag: "Untagged".into(),
                layer: 0,
            });
            Entity::new(index, 1)
        }
    }

    pub fn despawn(&mut self, entity: Entity) {
        if !self.is_alive(entity) {
            return;
        }
        if self.selected == Some(entity) {
            self.selected = None;
        }
        // Detach children
        if let Some(children) = self
            .get_component::<Children>(entity)
            .map(|c| c.entities.clone())
        {
            for child in children {
                self.remove_component_by_name(child, "Parent");
            }
        }
        if let Some(parent) = self.get_component::<Parent>(entity).map(|p| p.entity) {
            self.remove_child(parent, entity);
        }
        let rec = &mut self.entities[entity.index as usize];
        rec.alive = false;
        for name in rec.components.keys() { self.component_entities.get_mut(name).expect("live component index").remove(&entity.index); }
        rec.components.clear();
        rec.serialized_components.clear();
        rec.name = None;
        self.free_list.push(entity.index);
    }

    pub fn is_alive(&self, entity: Entity) -> bool {
        self.entities
            .get(entity.index as usize)
            .map(|r| r.alive && r.generation == entity.generation)
            .unwrap_or(false)
    }

    pub fn iter_entities(&self) -> impl Iterator<Item = Entity> + '_ {
        self.entities.iter().enumerate().filter_map(|(i, r)| {
            if r.alive {
                Some(Entity::new(i as u32, r.generation))
            } else {
                None
            }
        })
    }

    pub fn insert_component<T: Component>(&mut self, entity: Entity, value: T) {
        if !self.is_alive(entity) {
            return;
        }
        let name = T::type_name();
        self.entities[entity.index as usize].revision += 1;
        if self.entities[entity.index as usize].components.insert(name.to_string(), Box::new(value)).is_none() { self.component_entities.entry(name.to_string()).or_default().insert(entity.index); }
    }

    /// Read component state; serialized mutations must use `get_component_mut` or a World command.
    pub fn get_component<T: Any + Send + Sync>(&self, entity: Entity) -> Option<&T> {
        if !self.is_alive(entity) {
            return None;
        }
        self.entities[entity.index as usize]
            .components
            .values()
            .find_map(|c| c.as_any().downcast_ref::<T>())
    }

    pub fn get_component_mut<T: Any + Send + Sync>(&mut self, entity: Entity) -> Option<&mut T> {
        if !self.is_alive(entity) {
            return None;
        }
        let record = &mut self.entities[entity.index as usize];
        let value = record.components
            .values_mut()
            .find_map(|c| c.as_any_mut().downcast_mut::<T>());
        if value.is_some() { record.revision += 1; }
        value
    }

    pub(crate) fn entity_revision(&self, entity: Entity) -> u64 { self.entities[entity.index as usize].revision }

    /// Serialize the live typed component, including runtime mutations.
    pub fn component_value(&self, entity: Entity, name: &str) -> Option<Value> {
        if !self.is_alive(entity) {
            return None;
        }
        let name = canonical_component_name(name);
        self.entities[entity.index as usize]
            .components
            .get(name)
            .map(|component| component.to_value())
    }

    /// Snapshot every live typed component without maintaining a manual type list.
    pub fn component_values(&self, entity: Entity) -> Option<HashMap<String, Value>> {
        if !self.is_alive(entity) {
            return None;
        }
        Some(
            self.entities[entity.index as usize]
                .components
                .iter()
                .map(|(name, component)| (name.clone(), component.to_value()))
                .collect(),
        )
    }

    /// Replace a component from its serialized value through the canonical IDL path.
    pub fn set_component_value(&mut self, entity: Entity, name: &str, value: Value) {
        self.apply_set_component(entity, name, value);
    }

    pub fn remove_component_by_name(&mut self, entity: Entity, name: &str) {
        if !self.is_alive(entity) {
            return;
        }
        let name = canonical_component_name(name);
        self.entities[entity.index as usize].revision += 1;
        if self.entities[entity.index as usize].components.remove(name).is_some() { self.component_entities.get_mut(name).expect("live component index").remove(&entity.index); }
        self.entities[entity.index as usize]
            .serialized_components
            .remove(name);
    }

    pub fn serialized_components(&self, entity: Entity) -> Option<&HashMap<String, Value>> {
        if !self.is_alive(entity) {
            return None;
        }
        Some(&self.entities[entity.index as usize].serialized_components)
    }

    pub fn set_editor_state(&mut self, entity: Entity, sibling_index: i32, active: bool) {
        if let Some(record) = self.entities.get_mut(entity.index as usize) {
            if record.alive && record.generation == entity.generation {
                if record.sibling_index != sibling_index || record.active != active { record.revision += 1; }
                record.sibling_index = sibling_index;
                record.active = active;
            }
        }
    }

    pub fn sibling_index(&self, entity: Entity) -> i32 {
        self.entities
            .get(entity.index as usize)
            .filter(|record| record.alive && record.generation == entity.generation)
            .map(|record| record.sibling_index)
            .unwrap_or_default()
    }

    pub fn entity_active(&self, entity: Entity) -> bool {
        self.entities
            .get(entity.index as usize)
            .filter(|record| record.alive && record.generation == entity.generation)
            .map(|record| record.active)
            .unwrap_or(true)
    }

    pub fn set_entity_metadata(&mut self, entity: Entity, tag: String, layer: u8) {
        if let Some(record) = self.entities.get_mut(entity.index as usize) {
            if record.alive && record.generation == entity.generation {
                record.revision += 1;
                let tag = tag.trim();
                record.tag = if tag.is_empty() {
                    "Untagged".into()
                } else {
                    tag.chars().take(64).collect()
                };
                record.layer = layer.min(31);
            }
        }
    }

    pub fn entity_tag(&self, entity: Entity) -> &str {
        self.entities
            .get(entity.index as usize)
            .filter(|record| record.alive && record.generation == entity.generation)
            .map(|record| record.tag.as_str())
            .unwrap_or("Untagged")
    }

    pub fn entity_layer(&self, entity: Entity) -> u8 {
        self.entities
            .get(entity.index as usize)
            .filter(|record| record.alive && record.generation == entity.generation)
            .map(|record| record.layer)
            .unwrap_or_default()
    }

    /// Whether any live entity contains this canonical typed component, including inactive entities.
    pub fn has_component_type(&self, name: &str) -> bool { self.component_entities.get(name).is_some_and(|entities| !entities.is_empty()) }

    pub fn entities_with_components<'a>(
        &'a self,
        type_names: &'a [&'static str],
    ) -> impl Iterator<Item = Entity> + 'a {
        let available = type_names.iter().all(|name| self.has_component_type(name));
        let candidates = available.then(|| type_names.iter().filter_map(|name| self.component_entities.get(*name)).min_by_key(|entities| entities.len())).flatten();
        let indexed = candidates.into_iter().flatten().filter_map(move |&index| {
            let record = &self.entities[index as usize];
            (record.alive && type_names.iter().all(|name| record.components.contains_key(*name))).then_some(Entity::new(index, record.generation))
        });
        self.iter_entities().take(if type_names.is_empty() { usize::MAX } else { 0 }).chain(indexed)
    }

    /// MiYu: Ordered, deduplicated union of component memberships, including inactive entities.
    pub fn entities_with_any_component(&self, type_names: &[&str]) -> impl Iterator<Item = Entity> + '_ {
        let indices: BTreeSet<_> = type_names.iter().filter_map(|name| self.component_entities.get(*name)).flat_map(|entities| entities.iter().copied()).collect();
        indices.into_iter().filter_map(move |index| {
            let record = &self.entities[index as usize];
            record.alive.then_some(Entity::new(index, record.generation))
        })
    }

    pub fn set_parent(&mut self, entity: Entity, parent: Option<Entity>) {
        if !self.is_alive(entity) {
            return;
        }
        if let Some(old) = self.get_component::<Parent>(entity).map(|p| p.entity) {
            self.remove_child(old, entity);
            self.remove_component_by_name(entity, "Parent");
        }
        if let Some(p) = parent {
            if !self.is_alive(p) {
                return;
            }
            self.insert_component(entity, Parent { entity: p });
            self.add_child(p, entity);
        }
    }

    fn add_child(&mut self, parent: Entity, child: Entity) {
        if let Some(c) = self.get_component_mut::<Children>(parent) {
            if !c.entities.contains(&child) {
                c.entities.push(child);
            }
        } else {
            self.insert_component(
                parent,
                Children {
                    entities: vec![child],
                },
            );
        }
    }

    fn remove_child(&mut self, parent: Entity, child: Entity) {
        if let Some(c) = self.get_component_mut::<Children>(parent) {
            c.entities.retain(|e| *e != child);
        }
    }

    pub fn commit(&mut self) -> Vec<Entity> {
        let cmds = self.commands.drain();
        self.last_spawned.clear();
        for cmd in cmds {
            self.apply_command(cmd);
        }
        self.last_spawned.clone()
    }

    pub fn apply_command(&mut self, cmd: WorldCommand) {
        match cmd {
            WorldCommand::Spawn { name, components } => {
                let e = self.spawn_empty();
                if let Some(n) = name.clone() {
                    self.entities[e.index as usize].name = Some(n.clone());
                    self.insert_component(e, Name { value: n });
                }
                if let Value::Object(map) = components {
                    for (key, val) in map {
                        self.apply_set_component(e, &key, val);
                    }
                }
                self.last_spawned.push(e);
            }
            WorldCommand::Despawn { entity } => {
                self.despawn(Entity::from_u64(entity));
            }
            WorldCommand::SetActive { entity, active } => {
                let entity = Entity::from_u64(entity);
                self.set_editor_state(entity, self.sibling_index(entity), active);
            }
            WorldCommand::SetComponent {
                entity,
                component,
                value,
            } => {
                self.apply_set_component(Entity::from_u64(entity), &component, value);
            }
            WorldCommand::RemoveComponent { entity, component } => {
                self.remove_component_by_name(Entity::from_u64(entity), &component);
            }
            WorldCommand::SetSpriteBatchData { entity, instances, colors } => {
                if instances.len() <= 8192 && colors.len() <= 8192 && instances.iter().chain(&colors).flatten().all(|value| value.is_finite()) {
                    if let Some(batch) = self.get_component_mut::<crate::generated::SpriteBatch2D>(Entity::from_u64(entity)) {
                        batch.instances = instances;
                        batch.colors = colors;
                    }
                }
            }
            WorldCommand::SetParent { entity, parent } => {
                self.set_parent(Entity::from_u64(entity), parent.map(Entity::from_u64));
            }
            WorldCommand::SetClearColor { r, g, b, a } => {
                self.time.clear_color = Vec4::new(r, g, b, a);
            }
        }
    }

    fn apply_set_component(&mut self, entity: Entity, component: &str, value: Value) {
        if !self.is_alive(entity) {
            return;
        }
        let component = canonical_component_name(component);
        self.entities[entity.index as usize].revision += 1;
        self.entities[entity.index as usize]
            .serialized_components
            .insert(component.to_string(), value.clone());
        match component {
            "Name" | "name" => {
                if let Ok(n) = serde_json::from_value::<Name>(value.clone()) {
                    self.entities[entity.index as usize].name = Some(n.value.clone());
                    self.insert_component(entity, n);
                } else if let Some(s) = value.as_str() {
                    self.entities[entity.index as usize].name = Some(s.to_string());
                    self.insert_component(
                        entity,
                        Name {
                            value: s.to_string(),
                        },
                    );
                }
            }
            "Transform" | "transform" => {
                let t = parse_transform(&value);
                self.insert_component(entity, t);
            }
            other => match crate::generated::component_from_value(other, value) {
                Ok(Some(component)) => {
                    if self.entities[entity.index as usize].components.insert(other.to_string(), component).is_none() { self.component_entities.entry(other.to_string()).or_default().insert(entity.index); }
                }
                Ok(None) => {
                    log::debug!("unknown component '{other}' preserved as serialized data");
                }
                Err(error) => {
                    log::warn!(
                        "component '{other}' could not be deserialized and remains preserved: {error}"
                    );
                }
            },
        }
    }

    pub fn entity_name(&self, entity: Entity) -> Option<&str> {
        self.entities
            .get(entity.index as usize)
            .and_then(|r| r.name.as_deref())
    }

    pub fn component_id(&self, name: &str) -> Option<ComponentId> {
        self.registry.id_of_name(name)
    }
}

fn canonical_component_name(component: &str) -> &str {
    match component {
        "Name" | "name" => "Name",
        "Transform" | "transform" => "Transform",
        "Transform2D" | "transform2D" | "transform2d" => "Transform2D",
        "Camera3D" | "camera3D" | "camera3d" => "Camera3D",
        "Camera2D" | "camera2D" | "camera2d" => "Camera2D",
        "DirectionalLight" | "directionalLight" => "DirectionalLight",
        "EnvironmentLight" | "environmentLight" => "EnvironmentLight",
        "PointLight" | "pointLight" => "PointLight",
        "SpotLight" | "spotLight" => "SpotLight",
        "Light2D" | "light2D" | "light2d" => "Light2D",
        "MeshRenderer" | "meshRenderer" => "MeshRenderer",
        "PbrMaterial" | "pbrMaterial" => "PbrMaterial",
        "SpriteRenderer" | "spriteRenderer" => "SpriteRenderer",
        "AnimatedSprite2D" | "animatedSprite2D" | "animatedSprite2d" => "AnimatedSprite2D",
        "Line2D" | "line2D" | "line2d" => "Line2D",
        "AnimationPlayer" | "animationPlayer" => "AnimationPlayer",
        "Animator" | "animator" => "Animator",
        "AudioListener" | "audioListener" => "AudioListener",
        "AudioSource" | "audioSource" => "AudioSource",
        "AudioMixer" | "audioMixer" => "AudioMixer",
        "RigidBody3D" | "rigidBody3D" | "rigidBody3d" => "RigidBody3D",
        "BoxCollider3D" | "boxCollider3D" | "boxCollider3d" => "BoxCollider3D",
        "SphereCollider3D" | "sphereCollider3D" | "sphereCollider3d" => "SphereCollider3D",
        "Rigidbody2D" | "rigidbody2D" | "rigidbody2d" => "Rigidbody2D",
        "BoxCollider2D" | "boxCollider2D" | "boxCollider2d" => "BoxCollider2D",
        "CircleCollider2D" | "circleCollider2D" | "circleCollider2d" => "CircleCollider2D",
        "EdgeCollider2D" | "edgeCollider2D" | "edgeCollider2d" => "EdgeCollider2D",
        "PolygonCollider2D" | "polygonCollider2D" | "polygonCollider2d" => "PolygonCollider2D",
        "TargetJoint2D" | "targetJoint2D" | "targetJoint2d" => "TargetJoint2D",
        "Canvas" | "canvas" => "Canvas",
        "CanvasScaler" | "canvasScaler" => "CanvasScaler",
        "CanvasGroup" | "canvasGroup" => "CanvasGroup",
        "RectTransform" | "rectTransform" => "RectTransform",
        "AspectRatioFitter" | "aspectRatioFitter" => "AspectRatioFitter",
        "ContentSizeFitter" | "contentSizeFitter" => "ContentSizeFitter",
        "RectMask2D" | "rectMask2D" | "rectMask2d" => "RectMask2D",
        "LayoutGroup" | "layoutGroup" => "LayoutGroup",
        "Image" | "image" => "Image",
        "RawImage" | "rawImage" => "RawImage",
        "Shadow" | "shadow" => "Shadow",
        "Outline" | "outline" => "Outline",
        "Button" | "button" => "Button",
        "Text" | "text" => "Text",
        "Toggle" | "toggle" => "Toggle",
        "ToggleGroup" | "toggleGroup" => "ToggleGroup",
        "Slider" | "slider" => "Slider",
        "Scrollbar" | "scrollbar" => "Scrollbar",
        "Panel" | "panel" => "Panel",
        "ProgressBar" | "progressBar" => "ProgressBar",
        "InputField" | "inputField" => "InputField",
        "Dropdown" | "dropdown" => "Dropdown",
        "ListView" | "listView" => "ListView",
        "ScrollView" | "scrollView" => "ScrollView",
        "TabView" | "tabView" => "TabView",
        "Layer" | "layer" => "Layer",
        "EditorOnly" | "editorOnly" => "EditorOnly",
        "AutoRotate" | "autoRotate" => "AutoRotate",
        "ParticleEmitter2D" | "particleEmitter2D" | "particleEmitter2d" => "ParticleEmitter2D",
        "ParticleEmitter3D" | "particleEmitter3D" | "particleEmitter3d" => "ParticleEmitter3D",
        "SampledEffect" | "sampledEffect" => "SampledEffect",
        "SpineSkeleton" | "spineSkeleton" => "SpineSkeleton",
        other => other,
    }
}

fn parse_transform(value: &Value) -> Transform {
    if let Ok(t) = serde_json::from_value::<Transform>(value.clone()) {
        return t;
    }
    let mut t = Transform::default();
    if let Some(pos) = value.get("position").and_then(|v| v.as_array()) {
        if pos.len() >= 3 {
            t.position = [
                pos[0].as_f64().unwrap_or(0.0) as f32,
                pos[1].as_f64().unwrap_or(0.0) as f32,
                pos[2].as_f64().unwrap_or(0.0) as f32,
            ];
        }
    }
    if let Some(rot) = value.get("rotation").and_then(|v| v.as_array()) {
        if rot.len() >= 4 {
            t.rotation = [
                rot[0].as_f64().unwrap_or(0.0) as f32,
                rot[1].as_f64().unwrap_or(0.0) as f32,
                rot[2].as_f64().unwrap_or(0.0) as f32,
                rot[3].as_f64().unwrap_or(1.0) as f32,
            ];
        }
    }
    if let Some(scale) = value.get("scale").and_then(|v| v.as_array()) {
        if scale.len() >= 3 {
            t.scale = [
                scale[0].as_f64().unwrap_or(1.0) as f32,
                scale[1].as_f64().unwrap_or(1.0) as f32,
                scale[2].as_f64().unwrap_or(1.0) as f32,
            ];
        }
    }
    t
}

impl Transform {
    pub fn to_matrix(&self) -> glam::Mat4 {
        glam::Mat4::from_scale_rotation_translation(
            Vec3::from(self.scale),
            Quat::from_xyzw(
                self.rotation[0],
                self.rotation[1],
                self.rotation[2],
                self.rotation[3],
            ),
            Vec3::from(self.position),
        )
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn component_presence_tracks_typed_serialized_and_entity_lifecycles() {
        use super::*;
        let mut world = World::new();
        let first = world.spawn_empty();
        let second = world.spawn_empty();
        assert!(!world.has_component_type("Transform"));
        world.insert_component(first, Transform::default());
        world.insert_component(first, Transform::default());
        world.set_component_value(second, "transform", serde_json::json!({"position":[1,2,3]}));
        world.set_editor_state(second, 0, false);
        assert_eq!(world.entities_with_components(&["Transform"]).count(), 2);
        world.remove_component_by_name(first, "transform");
        world.remove_component_by_name(first, "Transform");
        assert!(world.has_component_type("Transform"));
        world.set_component_value(second, "UserBehaviour", serde_json::json!({"enabled":true}));
        assert!(!world.has_component_type("UserBehaviour"));
        assert_eq!(world.entities_with_components(&["Transform", "BoxCollider3D"]).count(), 0);
        world.despawn(second);
        assert!(!world.has_component_type("Transform"));
        let recycled = world.spawn_empty();
        assert_eq!(second.index, recycled.index);
        world.insert_component(second, Transform::default());
        world.remove_component_by_name(second, "Transform");
        assert!(!world.has_component_type("Transform"));
        for name in crate::generated::meta::COMPONENT_NAMES {
            world.set_component_value(recycled, name, serde_json::json!({}));
            world.set_component_value(recycled, name, serde_json::json!({}));
            assert!(world.has_component_type(name), "{name}");
            world.remove_component_by_name(recycled, name);
            assert!(!world.has_component_type(name), "{name}");
        }
        world.set_parent(recycled, Some(first));
        assert!(world.has_component_type("Parent"));
        world.despawn(first);
        assert!(!world.has_component_type("Parent"));
        assert!(!world.has_component_type("Children"));
        assert_eq!(world.entities_with_components(&[]).count(), 1);
    }

    #[test]
    fn indexed_queries_preserve_order_intersection_and_recycled_generations() {
        use super::*;
        let mut world = World::new();
        let entities: Vec<_> = (0..90_000).map(|_| world.spawn_empty()).collect();
        for &entity in &entities { world.insert_component(entity, Transform::default()); }
        for &index in &[89_999, 42_000, 7] { world.insert_component(entities[index], Name { value: index.to_string() }); }
        world.set_editor_state(entities[42_000], 0, false);
        let expected = vec![entities[7], entities[42_000], entities[89_999]];
        assert_eq!(world.entities_with_components(&["Transform", "Name"]).collect::<Vec<_>>(), expected);
        assert_eq!(world.entities_with_components(&["Name", "Transform", "Name"]).collect::<Vec<_>>(), expected);
        assert_eq!(world.entities_with_components(&["Missing"]).count(), 0);
        world.remove_component_by_name(entities[7], "Transform");
        world.despawn(entities[42_000]);
        let recycled = world.spawn_empty();
        assert_eq!(recycled.index, entities[42_000].index);
        assert_ne!(recycled.generation, entities[42_000].generation);
        world.set_component_value(recycled, "name", serde_json::json!({"value":"recycled"}));
        world.insert_component(recycled, Transform::default());
        world.insert_component(entities[42_000], Name { value: "stale".into() });
        world.remove_component_by_name(entities[42_000], "Name");
        assert_eq!(world.entities_with_components(&["Name", "Transform"]).collect::<Vec<_>>(), vec![recycled, entities[89_999]]);
        assert_eq!(world.entities_with_components(&[]).count(), 90_000);
    }

    #[test]
    #[ignore = "manual large-scene CPU benchmark"]
    fn benchmark_sparse_component_query() {
        use super::*;
        use std::time::Instant;
        let mut world = World::new();
        for i in 0..90_000 {
            let entity = world.spawn_empty();
            world.insert_component(entity, Transform::default());
            if i % 900 == 0 { world.insert_component(entity, Name { value: i.to_string() }); }
        }
        let begin = Instant::now();
        for _ in 0..100 { assert_eq!(world.iter_entities().filter(|entity| world.get_component::<Name>(*entity).is_some()).count(), 100); }
        let scan_ms = begin.elapsed().as_secs_f64() * 1000.0;
        let begin = Instant::now();
        for _ in 0..100 { assert_eq!(world.entities_with_components(&["Name"]).count(), 100); }
        println!("sparse_query entities=90000 matches=100 iterations=100 scan_ms={scan_ms:.3} index_ms={:.3}", begin.elapsed().as_secs_f64() * 1000.0);
    }

    #[test]
    fn component_union_matches_ordered_scan_after_removal_and_slot_reuse() {
        use super::*;
        let mut world = World::new();
        let entities: Vec<_> = (0..300).map(|_| world.spawn_empty()).collect();
        for (index, &entity) in entities.iter().enumerate() {
            if index % 3 == 0 { world.insert_component(entity, Transform::default()); }
            if index % 5 == 0 { world.insert_component(entity, Name { value: index.to_string() }); }
            if index % 7 == 0 { world.set_editor_state(entity, 0, false); }
        }
        let verify = |world: &World| {
            let expected: Vec<_> = world.iter_entities().filter(|entity| world.get_component::<Transform>(*entity).is_some() || world.get_component::<Name>(*entity).is_some()).collect();
            assert_eq!(world.entities_with_any_component(&["Missing", "Name", "Transform", "Name"]).collect::<Vec<_>>(), expected);
            assert_eq!(world.entities_with_any_component(&[]).count(), 0);
            assert_eq!(world.entities_with_any_component(&["Missing"]).count(), 0);
        };
        verify(&world);
        world.remove_component_by_name(entities[15], "Transform");
        world.remove_component_by_name(entities[15], "Name");
        world.despawn(entities[0]); let recycled = world.spawn_empty();
        world.set_component_value(recycled, "Name", serde_json::json!({"value":"recycled"}));
        assert_ne!(recycled, entities[0]);
        world.insert_component(entities[0], Transform::default());
        verify(&world);
        assert_eq!(world.entities_with_any_component(&["Name"]).next(), Some(recycled));
    }

    #[test]
    fn generated_factory_deserializes_every_registered_idl_component() {
        for name in crate::generated::meta::COMPONENT_NAMES {
            let component = crate::generated::component_from_value(name, serde_json::json!({}))
                .unwrap_or_else(|error| panic!("{name} failed: {error}"));
            assert!(component.is_some(), "{name} has no generated factory arm");
        }
        assert!(
            crate::generated::component_from_value("UserBehaviour", serde_json::json!({}))
                .unwrap()
                .is_none()
        );
    }
}
