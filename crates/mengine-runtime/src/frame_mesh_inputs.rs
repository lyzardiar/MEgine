// Author: MiYu. Reuse revisioned mesh inputs while polling authored materials and taking current hierarchy matrices.
use super::*;
use std::collections::hash_map::Entry;

struct Source { key: String, base: SharedRenderMaterial, frame: u64 }
struct CachedInput { revision: Option<u64>, frame: u64, source: Option<usize>, base: SharedRenderMaterial, object: RenderObject }

/// Renderer-owned authored mesh inputs. Entries and material sources follow the current active mesh set.
#[derive(Default)]
pub struct FrameMeshInputs {
    last_entities: Vec<Entity>,
    world_id: u64, frame: u64, entries: HashMap<Entity, CachedInput>,
    sources: Vec<Source>, source_indices: HashMap<String, usize>,
    #[cfg(test)]
    rebuilt: usize,
}

impl FrameMeshInputs {
    /// Entity order belonging to the mesh prefix of the most recent collected object list.
    pub fn last_entities(&self) -> &[Entity] { &self.last_entities }

    /// Matrices come from this hierarchy; material polling and custom Any projections remain live.
    pub fn collect(&mut self, world: &World, hierarchy: &TransformHierarchy, materials: &mut RuntimeMaterialCache, mut entities: Option<&mut Vec<Entity>>) -> Vec<RenderObject> {
        if self.world_id != world.cache_identity() || self.frame == u64::MAX { *self = Self { world_id: world.cache_identity(), ..Default::default() }; }
        self.frame += 1;
        self.last_entities.clear();
        #[cfg(test)]
        { self.rebuilt = 0; }
        let mut tinted = HashMap::new();
        let mut out = Vec::with_capacity(self.entries.len());
        for entity in world.entities_with_components(&["MeshRenderer"]) {
            let Some(transform) = hierarchy.get_ref(entity) else { continue; };
            let revision = world.stable_entity_revision(entity);
            let entry = match self.entries.entry(entity) { Entry::Occupied(slot) if revision.is_some() && slot.get().revision == revision => {
                let entry = slot.into_mut();
                if let Some(index) = entry.source {
                    let base = refresh_source(&mut self.sources[index], self.frame, materials);
                    if !std::ptr::eq(&**base, &*entry.base) {
                        entry.object.material = apply_block(base, world.get_component::<MaterialPropertyBlock>(entity), &mut tinted);
                        entry.base = base.clone();
                    }
                }
                entry.frame = self.frame;
                entry
            }, slot => {
                let Some(mesh) = world.get_component::<MeshRenderer>(entity) else { continue; };
                let block = world.get_component::<MaterialPropertyBlock>(entity);
                let (source, base, material) = if let Some(pbr) = world.get_component::<PbrMaterial>(entity) {
                    let mut value = render_material_from_component(pbr);
                    if let Some(block) = block { apply_material_property_block_in_place(&mut value, block); }
                    let material: SharedRenderMaterial = value.into(); (None, material.clone(), material)
                } else {
                    let index = if let Some(index) = self.source_indices.get(&mesh.material) { *index } else {
                        let index = self.sources.len(); let base = materials.resolve_shared(&mesh.material).unwrap_or_else(|| material_preset(&mesh.material).into());
                        self.sources.push(Source { key: mesh.material.clone(), base, frame: self.frame }); self.source_indices.insert(mesh.material.clone(), index); index
                    };
                    let base = refresh_source(&mut self.sources[index], self.frame, materials);
                    (Some(index), base.clone(), apply_block(base, block, &mut tinted))
                };
                let input = CachedInput { revision, frame: self.frame, source, base, object: RenderObject {
                    mesh_key: mesh.mesh.trim().replace('\\', "/"), model: transform.matrix, cast_shadows: mesh.cast_shadows, receive_shadows: mesh.receive_shadows, material,
                } };
                #[cfg(test)]
                { self.rebuilt += 1; }
                match slot { Entry::Occupied(mut slot) => { slot.insert(input); slot.into_mut() }, Entry::Vacant(slot) => slot.insert(input) }
            } };
            let mut object = entry.object.clone(); object.model = transform.matrix; out.push(object);
            self.last_entities.push(entity);
            if let Some(entities) = entities.as_deref_mut() { entities.push(entity); }
        }
        self.entries.retain(|_, entry| entry.frame == self.frame);
        if self.sources.iter().any(|source| source.frame != self.frame) {
            let mut remap = vec![0; self.sources.len()]; let mut retained = Vec::new(); self.source_indices.clear();
            for (old, source) in self.sources.drain(..).enumerate() {
                if source.frame != self.frame { continue; }
                remap[old] = retained.len(); self.source_indices.insert(source.key.clone(), retained.len()); retained.push(source);
            }
            self.sources = retained;
            for entry in self.entries.values_mut() { if let Some(index) = &mut entry.source { *index = remap[*index]; } }
            if self.source_indices.capacity() > self.source_indices.len().saturating_mul(4).max(64) { self.source_indices.shrink_to_fit(); }
        }
        if self.entries.capacity() > self.entries.len().saturating_mul(4).max(64) { self.entries.shrink_to_fit(); }
        if self.last_entities.capacity() > self.last_entities.len().saturating_mul(4).max(64) { self.last_entities.shrink_to_fit(); }
        out
    }
}

// Poll each used source once per extraction, including custom shader dependencies. Removed inputs do not poll.
fn refresh_source<'a>(source: &'a mut Source, frame: u64, materials: &mut RuntimeMaterialCache) -> &'a SharedRenderMaterial {
    if source.frame != frame { source.base = materials.resolve_shared(&source.key).unwrap_or_else(|| source.base.clone()); source.frame = frame; }
    &source.base
}

fn apply_block(base: &SharedRenderMaterial, block: Option<&MaterialPropertyBlock>, tinted: &mut HashMap<(*const RenderMaterial, [u32; 4]), SharedRenderMaterial>) -> SharedRenderMaterial {
    let Some(block) = block else { return base.clone(); };
    if material_block_is_tint_only(block) {
        if !block.override_base_color { return base.clone(); }
        let color = sanitize_color4(block.base_color); let bits = color.map(f32::to_bits);
        if bits == base.base_color.map(f32::to_bits) { return base.clone(); }
        return tinted.entry((&**base as *const RenderMaterial, bits)).or_insert_with(|| { let mut material = base.clone(); material.base_color = color; material }).clone();
    }
    let mut material = base.clone(); apply_material_property_block_in_place(&mut material, block); material
}

#[cfg(test)]
#[path = "frame_mesh_inputs_tests.rs"]
mod tests;
