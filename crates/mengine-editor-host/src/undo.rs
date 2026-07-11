use mengine_core::command::WorldCommand;
use serde::{Deserialize, Serialize};

#[derive(Default)]
pub struct UndoStack {
    undo: Vec<Vec<WorldCommand>>,
    redo: Vec<Vec<WorldCommand>>,
}

impl UndoStack {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn push_group(&mut self, cmds: Vec<WorldCommand>, inverse: Vec<WorldCommand>) {
        // Store inverse for undo; keep forward on redo path via inverse of inverse later.
        self.undo.push(inverse);
        self.redo.clear();
        let _ = cmds;
    }

    pub fn push_simple(&mut self, inverse: Vec<WorldCommand>) {
        self.undo.push(inverse);
        self.redo.clear();
    }

    pub fn undo(&mut self) -> Option<Vec<WorldCommand>> {
        let inv = self.undo.pop()?;
        self.redo.push(inv.clone());
        Some(inv)
    }

    pub fn redo(&mut self) -> Option<Vec<WorldCommand>> {
        // MVP: redo reapplies last undone inverse again (limited); full redo needs forward cmds.
        self.redo.pop()
    }

    pub fn can_undo(&self) -> bool {
        !self.undo.is_empty()
    }

    pub fn can_redo(&self) -> bool {
        !self.redo.is_empty()
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum EditorCommand {
    Select { entity: Option<u64> },
    Undo,
    Redo,
    Play,
    Stop,
    Pause,
    Step,
    SaveScene { path: String },
    LoadScene { path: String },
}
