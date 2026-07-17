use mengine_core::command::WorldCommand;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug)]
struct UndoEntry {
    forward: Vec<WorldCommand>,
    inverse: Vec<WorldCommand>,
}

#[derive(Default)]
pub struct UndoStack {
    undo: Vec<UndoEntry>,
    redo: Vec<UndoEntry>,
}

impl UndoStack {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn push_group(&mut self, cmds: Vec<WorldCommand>, inverse: Vec<WorldCommand>) {
        self.undo.push(UndoEntry {
            forward: cmds,
            inverse,
        });
        self.redo.clear();
    }

    pub fn undo(&mut self) -> Option<Vec<WorldCommand>> {
        let entry = self.undo.pop()?;
        let commands = entry.inverse.clone();
        self.redo.push(entry);
        Some(commands)
    }

    pub fn redo(&mut self) -> Option<Vec<WorldCommand>> {
        let entry = self.redo.pop()?;
        let commands = entry.forward.clone();
        self.undo.push(entry);
        Some(commands)
    }

    pub fn can_undo(&self) -> bool {
        !self.undo.is_empty()
    }

    pub fn can_redo(&self) -> bool {
        !self.redo.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn color(r: f32) -> WorldCommand {
        WorldCommand::SetClearColor {
            r,
            g: 0.0,
            b: 0.0,
            a: 1.0,
        }
    }

    #[test]
    fn redo_replays_forward_commands() {
        let mut stack = UndoStack::new();
        stack.push_group(vec![color(1.0)], vec![color(0.0)]);

        match stack.undo().unwrap()[0] {
            WorldCommand::SetClearColor { r, .. } => assert_eq!(r, 0.0),
            _ => panic!("unexpected undo command"),
        }
        match stack.redo().unwrap()[0] {
            WorldCommand::SetClearColor { r, .. } => assert_eq!(r, 1.0),
            _ => panic!("unexpected redo command"),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum EditorCommand {
    Select {
        entity: Option<u64>,
    },
    Undo,
    Redo,
    Play,
    Stop,
    Pause,
    Step,
    ApplyBatch {
        forward: Vec<WorldCommand>,
        inverse: Vec<WorldCommand>,
    },
    SaveScene {
        path: String,
    },
    LoadScene {
        path: String,
    },
}
