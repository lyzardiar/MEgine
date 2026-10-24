// Author: MiYu. Retain only the current world's ordered UI child index; layout metrics stay frame-local.
use super::*;

struct Node { entity: Entity, revision: Option<u64>, parent: Option<Entity>, sibling: i32, active: bool }

#[derive(Default)]
pub struct UiTraversalCache { world_id: u64, nodes: Vec<Node>, children: HashMap<Entity, Vec<Entity>> }

impl UiTraversalCache {
    pub(super) fn sync(&mut self, world: &World) -> &HashMap<Entity, Vec<Entity>> {
        if self.world_id != world.cache_identity() { *self = Self { world_id: world.cache_identity(), ..Default::default() }; }
        let mut changed = false; let mut count = 0;
        for (index, entity) in world.iter_entities().enumerate() {
            count = index + 1;
            let revision = world.stable_entity_revision(entity);
            if self.nodes.get(index).is_some_and(|node| node.entity == entity && revision.is_some() && node.revision == revision) { continue; }
            let next = Node { entity, revision, parent: world.get_component::<Parent>(entity).map(|parent| parent.entity), sibling: world.sibling_index(entity), active: world.entity_active(entity) };
            changed |= self.nodes.get(index).is_none_or(|old| old.entity != entity || old.parent != next.parent || old.sibling != next.sibling || old.active != next.active);
            if index == self.nodes.len() { self.nodes.push(next); } else { self.nodes[index] = next; }
        }
        changed |= self.nodes.len() != count; self.nodes.truncate(count);
        if changed {
            self.children.clear();
            for node in &self.nodes { if node.active { if let Some(parent) = node.parent { self.children.entry(parent).or_default().push(node.entity); } } }
            for children in self.children.values_mut() { children.sort_by_key(|entity| world.sibling_index(*entity)); }
            if self.nodes.capacity() > count.saturating_mul(4).max(64) { self.nodes.shrink_to_fit(); }
            if self.children.capacity() > self.children.len().saturating_mul(4).max(64) { self.children.shrink_to_fit(); }
        }
        &self.children
    }
}

#[cfg(test)]
#[path = "ui_traversal_cache_tests.rs"]
mod tests;
