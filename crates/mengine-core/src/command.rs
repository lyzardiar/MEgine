use crate::entity::Entity;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// All world mutations go through commands (script, editor, AI).
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum WorldCommand {
    Spawn {
        #[serde(default)]
        name: Option<String>,
        #[serde(default)]
        components: Value,
    },
    Despawn {
        entity: u64,
    },
    SetComponent {
        entity: u64,
        component: String,
        value: Value,
    },
    RemoveComponent {
        entity: u64,
        component: String,
    },
    SetParent {
        entity: u64,
        parent: Option<u64>,
    },
    /// Clear color for clear-screen / debug (Phase 0 bridge).
    SetClearColor {
        r: f32,
        g: f32,
        b: f32,
        a: f32,
    },
}

#[derive(Default, Clone, Debug)]
pub struct CommandBuffer {
    commands: Vec<WorldCommand>,
}

impl CommandBuffer {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn push(&mut self, cmd: WorldCommand) {
        self.commands.push(cmd);
    }

    pub fn spawn(&mut self, name: Option<&str>, components: Value) {
        self.push(WorldCommand::Spawn {
            name: name.map(|s| s.to_string()),
            components,
        });
    }

    pub fn set_component(&mut self, entity: Entity, component: &str, value: Value) {
        self.push(WorldCommand::SetComponent {
            entity: entity.to_u64(),
            component: component.to_string(),
            value,
        });
    }

    pub fn despawn(&mut self, entity: Entity) {
        self.push(WorldCommand::Despawn {
            entity: entity.to_u64(),
        });
    }

    pub fn set_clear_color(&mut self, r: f32, g: f32, b: f32, a: f32) {
        self.push(WorldCommand::SetClearColor { r, g, b, a });
    }

    pub fn drain(&mut self) -> Vec<WorldCommand> {
        std::mem::take(&mut self.commands)
    }

    pub fn is_empty(&self) -> bool {
        self.commands.is_empty()
    }

    pub fn len(&self) -> usize {
        self.commands.len()
    }

    pub fn as_slice(&self) -> &[WorldCommand] {
        &self.commands
    }
}
