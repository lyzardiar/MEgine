use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Opaque asset identifier (stable across sessions when persisted).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct AssetId(pub Uuid);

impl AssetId {
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }

    pub fn nil() -> Self {
        Self(Uuid::nil())
    }
}

impl Default for AssetId {
    fn default() -> Self {
        Self::nil()
    }
}

/// Typed handle wrapper for scripts (TS sees u64 / string id).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Handle<T> {
    pub id: AssetId,
    _marker: std::marker::PhantomData<T>,
}

impl<T> Handle<T> {
    pub fn new(id: AssetId) -> Self {
        Self {
            id,
            _marker: std::marker::PhantomData,
        }
    }

    pub fn none() -> Self {
        Self::new(AssetId::nil())
    }

    pub fn is_none(self) -> bool {
        self.id == AssetId::nil()
    }
}
