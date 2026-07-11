use serde::{Deserialize, Serialize};
use std::fmt;

/// Stable entity id with generation to prevent ABA reuse bugs.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Entity {
    pub index:      u32,
    pub generation: u32,
}

impl Entity {
    pub const INVALID: Entity = Entity {
        index:      u32::MAX,
        generation: 0,
    };

    pub fn new(index: u32, generation: u32) -> Self {
        Self { index, generation }
    }

    pub fn is_valid(self) -> bool {
        self.index != u32::MAX
    }

    pub fn to_u64(self) -> u64 {
        ((self.generation as u64) << 32) | self.index as u64
    }

    pub fn from_u64(v: u64) -> Self {
        Self {
            index:      v as u32,
            generation: (v >> 32) as u32,
        }
    }
}

impl fmt::Debug for Entity {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Entity({}:{})", self.index, self.generation)
    }
}

impl fmt::Display for Entity {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}:{}", self.index, self.generation)
    }
}
