// Author: MiYu. Reuse resolved transforms when local inputs and the resolved parent are unchanged.
use super::*;
#[path = "transform_hierarchy_incremental.rs"]
mod incremental;

struct CachedNode {
    generation: u32,
    frame: u64,
    version: u64,
    revision: Option<u64>,
    parent: Option<Entity>,
    parent_version: u64,
    active: bool,
    local: Option<[u32; 10]>,
    node: ResolvedNode,
}

/// A renderer-owned cache; returned hierarchies remain independent immutable frame values.
#[derive(Default)]
pub struct TransformHierarchyCache {
    world_id: u64,
    frame: u64,
    version: u64,
    entries: Vec<Option<CachedNode>>,
    inputs: Vec<(Entity, Option<u64>, bool)>,
    input_slots: usize,
    reusable: bool,
    hierarchy: Option<TransformHierarchy>,
    dependents: Option<incremental::HierarchyDependents>,
    #[cfg(test)]
    incremental_frames: usize,
}

impl TransformHierarchyCache {
    pub fn build(&mut self, world: &World) -> TransformHierarchy {
        if let Some(dependents) = &mut self.dependents { dependents.topology_valid = false; }
        if let Some(hierarchy) = self.reuse_frame(world) { return hierarchy; }
        let mut slots = 0;
        let mut inputs = std::mem::take(&mut self.inputs); inputs.clear();
        let entities: Vec<_> = world.iter_entities().filter(|entity| {
            let active = world.entity_active(*entity); inputs.push((*entity, world.stable_hierarchy_revision(*entity), active));
            slots = slots.max(entity.index as usize + 1); active
        }).collect();
        if self.world_id != world.snapshot_id || self.frame == u64::MAX || self.version > u64::MAX - slots as u64 - 1 { *self = Self { world_id: world.snapshot_id, ..Default::default() }; }
        self.frame += 1;
        // Sparse worlds keep the existing bounded resolver instead of retaining high entity slots.
        if slots > entities.len().saturating_mul(2) {
            self.entries = Vec::new(); let mut nodes = HierarchyNodes::with_capacity(entities.len());
            for entity in entities { resolve_node(world, entity, &mut nodes); }
            return self.retain_hierarchy(inputs, slots, nodes);
        }
        self.entries.resize_with(slots, || None);
        if self.entries.capacity() > slots.saturating_mul(2) { self.entries.shrink_to_fit(); }
        let mut nodes = HierarchyNodes::Dense(vec![None; slots]);
        for entity in entities { self.resolve(world, entity, &mut nodes, false); }
        self.retain_hierarchy(inputs, slots, nodes)
    }

    fn retain_hierarchy(&mut self, mut inputs: Vec<(Entity, Option<u64>, bool)>, slots: usize, nodes: HierarchyNodes) -> TransformHierarchy {
        // Custom Any projections can change without a revision and always keep the resolver path.
        self.reusable = inputs.iter().all(|(_, revision, _)| revision.is_some());
        if inputs.capacity() > inputs.len().saturating_mul(2) { inputs.shrink_to_fit(); }
        self.inputs = inputs; self.input_slots = slots;
        // Only a validated local-only pass can retain topology through a complete-resolver fallback.
        if !self.dependents.as_ref().is_some_and(|dependents| dependents.topology_valid) { self.dependents = None; }
        let hierarchy = TransformHierarchy { nodes: Arc::new(nodes) }; self.hierarchy = Some(hierarchy.clone()); hierarchy
    }

    fn local_bits(world: &World, entity: Entity) -> Option<[u32; 10]> {
        world.get_component::<Transform>(entity).map(|t| [t.position[0].to_bits(), t.position[1].to_bits(), t.position[2].to_bits(), t.rotation[0].to_bits(), t.rotation[1].to_bits(), t.rotation[2].to_bits(), t.rotation[3].to_bits(), t.scale[0].to_bits(), t.scale[1].to_bits(), t.scale[2].to_bits()])
    }

    fn resolve(&mut self, world: &World, entity: Entity, nodes: &mut HierarchyNodes, retained: bool) -> (ResolvedNode, u64) {
        if let Some(node) = nodes.get(&entity) {
            // Retained active nodes are complete; current-frame invalid placeholders still break cycles.
            let version = self.entries[entity.index as usize].as_ref().filter(|entry| entry.generation == entity.generation && (entry.frame == self.frame || retained && node.active)).map_or(0, |entry| entry.version);
            return (*node, version);
        }
        if !world.is_alive(entity) { return (ResolvedNode::INVALID, 0); }
        nodes.insert(entity, ResolvedNode::INVALID);
        let revision = world.stable_hierarchy_revision(entity);
        let stable = self.entries[entity.index as usize].as_ref().filter(|entry| revision.is_some() && entry.generation == entity.generation && entry.revision == revision);
        let previous_input = stable.map(|entry| (entry.parent, entry.local, entry.active));
        let parent = previous_input.map_or_else(|| world.get_component::<Parent>(entity).map(|value| value.entity), |input| input.0);
        let (parent_node, parent_version) = parent.map_or((ResolvedNode { active: true, has_transform: false, aggregate: WorldTransform::IDENTITY }, 0), |parent| self.resolve(world, parent, nodes, retained));
        let bits = previous_input.map_or_else(|| Self::local_bits(world, entity), |input| input.1);
        let active = previous_input.map_or_else(|| world.entity_active(entity), |input| input.2);
        let previous = &mut self.entries[entity.index as usize];
        if let Some(entry) = previous.as_mut().filter(|entry| entry.generation == entity.generation && entry.parent == parent && entry.parent_version == parent_version && entry.active == active && entry.local == bits) {
            entry.frame = self.frame; entry.revision = revision; nodes.insert(entity, entry.node); return (entry.node, entry.version);
        }
        let local = bits.map(|b| { let f = b.map(f32::from_bits); Transform { position: [f[0], f[1], f[2]], rotation: [f[3], f[4], f[5], f[6]], scale: [f[7], f[8], f[9]] } });
        let node = ResolvedNode { active: parent_node.active && active, has_transform: local.is_some(), aggregate: local.map_or(parent_node.aggregate, |local| parent_node.aggregate.compose(WorldTransform::from_local(&local))) };
        self.version += 1;
        *previous = Some(CachedNode { generation: entity.generation, frame: self.frame, version: self.version, revision, parent, parent_version, active, local: bits, node });
        nodes.insert(entity, node); (node, self.version)
    }
}

#[cfg(test)]
#[path = "transform_hierarchy_cache_tests.rs"]
mod tests;
#[cfg(test)]
#[path = "transform_hierarchy_frame_tests.rs"]
mod frame_tests;
#[cfg(test)]
#[path = "transform_hierarchy_incremental_tests.rs"]
mod incremental_tests;
