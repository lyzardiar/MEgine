use crate::gizmo::GizmoState;
use crate::undo::{EditorCommand, UndoStack};
use mengine_core::command::WorldCommand;
use mengine_core::entity::Entity;
use mengine_core::snapshot::WorldSnapshot;
use mengine_core::World;
use mengine_scene::{load_scene, save_scene};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum EditorMode {
    Edit,
    Play,
    Pause,
}

pub struct EditorSession {
    pub edit_world:  World,
    pub play_world:  Option<World>,
    pub mode:        EditorMode,
    pub undo:        UndoStack,
    pub gizmo:       GizmoState,
    pub scene_path:  Option<String>,
    pub scene_name:  String,
}

impl EditorSession {
    pub fn new() -> Self {
        Self {
            edit_world: World::new(),
            play_world: None,
            mode:       EditorMode::Edit,
            undo:       UndoStack::new(),
            gizmo:      GizmoState::default(),
            scene_path: None,
            scene_name: "Untitled".into(),
        }
    }

    pub fn active_world(&self) -> &World {
        match self.mode {
            EditorMode::Edit => &self.edit_world,
            EditorMode::Play | EditorMode::Pause => {
                self.play_world.as_ref().unwrap_or(&self.edit_world)
            }
        }
    }

    pub fn active_world_mut(&mut self) -> &mut World {
        match self.mode {
            EditorMode::Edit => &mut self.edit_world,
            EditorMode::Play | EditorMode::Pause => {
                if self.play_world.is_none() {
                    return &mut self.edit_world;
                }
                self.play_world.as_mut().unwrap()
            }
        }
    }

    pub fn snapshot(&self) -> WorldSnapshot {
        WorldSnapshot::from_world(self.active_world())
    }

    pub fn handle_editor_command(&mut self, cmd: EditorCommand) -> anyhow::Result<()> {
        match cmd {
            EditorCommand::Select { entity } => {
                self.edit_world.selected = entity.map(Entity::from_u64);
                self.gizmo.target = self.edit_world.selected;
            }
            EditorCommand::Undo => {
                if let Some(inv) = self.undo.undo() {
                    for c in inv {
                        self.edit_world.commands.push(c);
                    }
                    self.edit_world.commit();
                }
            }
            EditorCommand::Redo => {
                if let Some(fwd) = self.undo.redo() {
                    for c in fwd {
                        self.edit_world.commands.push(c);
                    }
                    self.edit_world.commit();
                }
            }
            EditorCommand::Play => self.enter_play()?,
            EditorCommand::Stop => self.exit_play(),
            EditorCommand::Pause => {
                if self.mode == EditorMode::Play {
                    self.mode = EditorMode::Pause;
                } else if self.mode == EditorMode::Pause {
                    self.mode = EditorMode::Play;
                }
            }
            EditorCommand::Step => {
                if self.mode == EditorMode::Pause {
                    if let Some(w) = self.play_world.as_mut() {
                        w.time.tick(w.time.fixed_delta);
                    }
                }
            }
            EditorCommand::SaveScene { path } => {
                save_scene(Path::new(&path), &self.scene_name, &self.edit_world)?;
                self.scene_path = Some(path);
            }
            EditorCommand::LoadScene { path } => {
                load_scene(Path::new(&path), &mut self.edit_world)?;
                self.scene_path = Some(path);
            }
        }
        Ok(())
    }

    fn enter_play(&mut self) -> anyhow::Result<()> {
        let snap = WorldSnapshot::from_world(&self.edit_world);
        let mut play = World::new();
        mengine_scene::apply_snapshot(&mut play, &snap);
        self.play_world = Some(play);
        self.mode = EditorMode::Play;
        Ok(())
    }

    fn exit_play(&mut self) {
        self.play_world = None;
        self.mode = EditorMode::Edit;
    }

    /// Apply world command in edit mode with undo inverse (SetComponent only MVP).
    pub fn apply_edit(&mut self, cmd: WorldCommand, inverse: WorldCommand) {
        self.undo.push_simple(vec![inverse]);
        self.edit_world.commands.push(cmd);
        self.edit_world.commit();
    }
}

impl Default for EditorSession {
    fn default() -> Self {
        Self::new()
    }
}
