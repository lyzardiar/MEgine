use crate::entity::Entity;
use crate::world::World;
use std::any::Any;

/// Simple query over entities that have all requested component type names.
pub struct Query<'a> {
    world: &'a World,
    type_names: Vec<&'static str>,
}

impl<'a> Query<'a> {
    pub fn new(world: &'a World, type_names: &[&'static str]) -> Self {
        Self {
            world,
            type_names: type_names.to_vec(),
        }
    }

    pub fn iter(&self) -> impl Iterator<Item = Entity> + '_ {
        self.world.entities_with_components(&self.type_names)
    }

    pub fn get<T: Any + Send + Sync>(&self, entity: Entity) -> Option<&T> {
        self.world.get_component::<T>(entity)
    }
}
