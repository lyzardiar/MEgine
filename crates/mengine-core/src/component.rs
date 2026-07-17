use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::any::{Any, TypeId};
use std::collections::HashMap;

/// Runtime component type id (stable within a process; IDL assigns names).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ComponentId(pub u32);

pub trait Component: Any + Send + Sync + 'static {
    fn type_name() -> &'static str
    where
        Self: Sized;

    fn as_any(&self) -> &dyn Any;
    fn as_any_mut(&mut self) -> &mut dyn Any;
    fn to_value(&self) -> Value;
}

#[derive(Default)]
pub struct ComponentRegistry {
    name_to_id: HashMap<String, ComponentId>,
    id_to_name: HashMap<ComponentId, String>,
    type_to_id: HashMap<TypeId, ComponentId>,
    next: u32,
}

impl ComponentRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register_named(&mut self, name: &str) -> ComponentId {
        if let Some(id) = self.name_to_id.get(name) {
            return *id;
        }
        let id = ComponentId(self.next);
        self.next += 1;
        self.name_to_id.insert(name.to_string(), id);
        self.id_to_name.insert(id, name.to_string());
        id
    }

    pub fn register_type<T: Component>(&mut self) -> ComponentId {
        let tid = TypeId::of::<T>();
        if let Some(id) = self.type_to_id.get(&tid) {
            return *id;
        }
        let id = self.register_named(T::type_name());
        self.type_to_id.insert(tid, id);
        id
    }

    pub fn id_of_name(&self, name: &str) -> Option<ComponentId> {
        self.name_to_id.get(name).copied()
    }

    pub fn name_of(&self, id: ComponentId) -> Option<&str> {
        self.id_to_name.get(&id).map(|s| s.as_str())
    }
}

/// Erased component storage entry.
pub type ComponentBox = Box<dyn Component>;
