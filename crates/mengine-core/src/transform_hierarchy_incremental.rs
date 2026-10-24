// Author: MiYu. Resolve sparse local changes and their active descendants in an immutable hierarchy frame.
use super::*;
use std::collections::HashSet;

pub(super) struct HierarchyDependents { offsets: Vec<usize>, children: Vec<Entity>, subtree: Vec<usize>, pub(super) topology_valid: bool }

impl HierarchyDependents {
    fn new(cache: &TransformHierarchyCache) -> Self {
        let hierarchy = cache.hierarchy.as_ref().unwrap();
        let links: Vec<_> = cache.inputs.iter().filter_map(|(entity, _, _)| {
            let entry = cache.entries.get(entity.index as usize)?.as_ref()?;
            if entry.generation != entity.generation || !hierarchy.nodes.get(entity).is_some_and(|node| node.active) { return None; }
            entry.parent.filter(|parent| (parent.index as usize) < cache.entries.len()).map(|parent| (parent.index as usize, *entity))
        }).collect();
        let mut offsets = vec![0; cache.entries.len() + 1];
        for (parent, _) in &links { offsets[parent + 1] += 1; }
        for index in 1..offsets.len() { offsets[index] += offsets[index - 1]; }
        let mut cursor = offsets.clone(); let mut children = vec![Entity::new(0, 0); links.len()]; let mut parents = vec![None; cache.entries.len()];
        for (parent, child) in links { children[cursor[parent]] = child; cursor[parent] += 1; parents[child.index as usize] = Some(parent); }
        let mut remaining: Vec<_> = offsets.windows(2).map(|range| range[1] - range[0]).collect();
        let mut ready: Vec<_> = remaining.iter().enumerate().filter_map(|(index, &count)| (count == 0).then_some(index)).collect(); let mut subtree = vec![1; remaining.len()]; let mut index = 0;
        while index < ready.len() {
            let child = ready[index];
            if let Some(parent) = parents[child] { subtree[parent] += subtree[child]; remaining[parent] -= 1; if remaining[parent] == 0 { ready.push(parent); } }
            index += 1;
        }
        Self { offsets, children, subtree, topology_valid: true }
    }

    fn children(&self, entity: Entity) -> &[Entity] { let index = entity.index as usize; &self.children[self.offsets[index]..self.offsets[index + 1]] }

    #[cfg(test)]
    pub(super) fn allocation_identity(&self) -> (*const usize, *const Entity) { (self.offsets.as_ptr(), self.children.as_ptr()) }
}

impl TransformHierarchyCache {
    pub(super) fn reuse_frame(&mut self, world: &World) -> Option<TransformHierarchy> {
        if self.world_id != world.snapshot_id || !self.reusable || self.frame == u64::MAX || self.version > u64::MAX - self.input_slots as u64 - 1 || self.hierarchy.is_none() { return None; }
        let mut changed = Vec::new(); let mut count = 0; let limit = self.inputs.len().div_ceil(8);
        // The ordered key includes inactive records, generations, activity and stable native revisions.
        for entity in world.iter_entities() {
            let previous = self.inputs.get(count)?;
            let revision = world.stable_hierarchy_revision(entity)?;
            if previous.0 != entity || previous.2 != world.entity_active(entity) { return None; }
            if previous.1 != Some(revision) { changed.push((count, entity, revision)); if self.inputs.len() < 256 || changed.len() > limit { return None; } }
            count += 1;
        }
        if count != self.inputs.len() { return None; }
        if changed.is_empty() { self.frame += 1; return self.hierarchy.clone(); }
        if self.entries.is_empty() { return None; }
        let mut seeds = Vec::new();
        // Structural edits and invalid branches retain the complete resolver and cycle semantics.
        for (_, entity, _) in &changed {
            let entry = self.entries.get(entity.index as usize)?.as_ref()?;
            if entry.generation != entity.generation || !self.hierarchy.as_ref()?.nodes.get(entity)?.active || world.get_component::<Parent>(*entity).map(|parent| parent.entity) != entry.parent { return None; }
            if Self::local_bits(world, *entity) != entry.local { seeds.push(*entity); }
        }
        let hierarchy = if seeds.is_empty() { self.frame += 1; self.hierarchy.clone()? } else { self.resolve_changes(world, seeds, limit)? };
        for (index, entity, revision) in changed { self.inputs[index].1 = Some(revision); self.entries[entity.index as usize].as_mut().unwrap().revision = Some(revision); }
        Some(hierarchy)
    }

    fn resolve_changes(&mut self, world: &World, mut affected: Vec<Entity>, limit: usize) -> Option<TransformHierarchy> {
        if self.dependents.is_none() { self.dependents = Some(HierarchyDependents::new(self)); }
        let dependents = self.dependents.as_mut().unwrap(); dependents.topology_valid = true;
        // Large local subtrees keep the verified topology while using the complete resolver.
        if affected.iter().any(|entity| dependents.subtree[entity.index as usize] > limit) { return None; }
        let mut seen: HashSet<_> = affected.iter().copied().collect(); let mut index = 0;
        while index < affected.len() {
            if affected.len() > limit { return None; }
            for &child in dependents.children(affected[index]) { if seen.insert(child) { affected.push(child); } }
            index += 1;
        }
        let HierarchyNodes::Dense(previous) = self.hierarchy.as_ref()?.nodes.as_ref() else { return None; };
        let mut slots = previous.clone(); for entity in &affected { slots[entity.index as usize] = None; }
        let mut nodes = HierarchyNodes::Dense(slots); self.frame += 1;
        for entity in affected { self.resolve(world, entity, &mut nodes, true); }
        let hierarchy = TransformHierarchy { nodes: Arc::new(nodes) }; self.hierarchy = Some(hierarchy.clone());
        #[cfg(test)]
        { self.incremental_frames += 1; }
        Some(hierarchy)
    }
}
