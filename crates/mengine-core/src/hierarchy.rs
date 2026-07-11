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
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Children {
    pub entities: Vec<Entity>,
}

impl Component for Children {
    fn type_name() -> &'static str {
        "Children"
    }
}
