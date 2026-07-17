use crate::component::Component;
use crate::entity::Entity;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Parent {
    pub entity: Entity,
}

impl Component for Parent {
    fn type_name() -> &'static str {
        "Parent"
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn as_any_mut(&mut self) -> &mut dyn std::any::Any {
        self
    }

    fn to_value(&self) -> serde_json::Value {
        serde_json::to_value(self).unwrap_or(serde_json::Value::Null)
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Children {
    pub entities: Vec<Entity>,
}

impl Component for Children {
    fn type_name() -> &'static str {
        "Children"
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn as_any_mut(&mut self) -> &mut dyn std::any::Any {
        self
    }

    fn to_value(&self) -> serde_json::Value {
        serde_json::to_value(self).unwrap_or(serde_json::Value::Null)
    }
}
