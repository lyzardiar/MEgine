//! Cache-friendly sparse-set storage for dense, contiguous ECS component columns.
//!
//! Each built-in component type can live in a packed `SparseSet<T>` giving O(1)
//! random lookup, O(1) swap-remove, and linear cache-friendly slice iteration.

use std::any::{Any, TypeId};
use std::collections::HashMap;

/// Packed dense component array indexed by entity slot (`u32`).
#[derive(Debug, Clone)]
pub struct SparseSet<T> {
    sparse: Vec<Option<u32>>,
    entities: Vec<u32>,
    dense: Vec<T>,
}

impl<T> Default for SparseSet<T> {
    fn default() -> Self {
        Self::new()
    }
}

impl<T> SparseSet<T> {
    pub fn new() -> Self {
        Self {
            sparse: Vec::new(),
            entities: Vec::new(),
            dense: Vec::new(),
        }
    }

    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            sparse: Vec::with_capacity(capacity),
            entities: Vec::with_capacity(capacity),
            dense: Vec::with_capacity(capacity),
        }
    }

    pub fn len(&self) -> usize {
        self.dense.len()
    }

    pub fn is_empty(&self) -> bool {
        self.dense.is_empty()
    }

    pub fn contains(&self, entity_index: u32) -> bool {
        self.sparse
            .get(entity_index as usize)
            .copied()
            .flatten()
            .is_some()
    }

    pub fn insert(&mut self, entity_index: u32, value: T) -> Option<T> {
        let slot = entity_index as usize;
        if slot >= self.sparse.len() {
            self.sparse.resize(slot + 1, None);
        }
        if let Some(dense_index) = self.sparse[slot] {
            return Some(std::mem::replace(&mut self.dense[dense_index as usize], value));
        }
        let dense_index = self.dense.len() as u32;
        self.sparse[slot] = Some(dense_index);
        self.entities.push(entity_index);
        self.dense.push(value);
        None
    }

    pub fn get(&self, entity_index: u32) -> Option<&T> {
        let dense_index = self.sparse.get(entity_index as usize)?.as_ref().copied()?;
        self.dense.get(dense_index as usize)
    }

    pub fn get_mut(&mut self, entity_index: u32) -> Option<&mut T> {
        let dense_index = self.sparse.get(entity_index as usize)?.as_ref().copied()?;
        self.dense.get_mut(dense_index as usize)
    }

    pub fn remove(&mut self, entity_index: u32) -> Option<T> {
        let slot = entity_index as usize;
        let dense_index = self.sparse.get_mut(slot)?.take()? as usize;
        let last_index = self.dense.len() - 1;
        let removed = self.dense.swap_remove(dense_index);
        self.entities.swap_remove(dense_index);
        if dense_index != last_index {
            let moved_entity = self.entities[dense_index] as usize;
            self.sparse[moved_entity] = Some(dense_index as u32);
        }
        Some(removed)
    }

    pub fn clear(&mut self) {
        for &entity_index in &self.entities {
            if let Some(slot) = self.sparse.get_mut(entity_index as usize) {
                *slot = None;
            }
        }
        self.entities.clear();
        self.dense.clear();
    }

    pub fn entities(&self) -> &[u32] {
        &self.entities
    }

    pub fn as_slice(&self) -> &[T] {
        &self.dense
    }

    pub fn as_mut_slice(&mut self) -> &mut [T] {
        &mut self.dense
    }

    pub fn iter(&self) -> impl Iterator<Item = (u32, &T)> {
        self.entities.iter().copied().zip(self.dense.iter())
    }

    pub fn iter_mut(&mut self) -> impl Iterator<Item = (u32, &mut T)> {
        self.entities.iter().copied().zip(self.dense.iter_mut())
    }
}

trait AnySparseSet: Send + Sync {
    fn as_any(&self) -> &dyn Any;
    fn as_any_mut(&mut self) -> &mut dyn Any;
    fn remove_entity(&mut self, entity_index: u32) -> bool;
    fn len(&self) -> usize;
}

impl<T: Send + Sync + 'static> AnySparseSet for SparseSet<T> {
    fn as_any(&self) -> &dyn Any {
        self
    }

    fn as_any_mut(&mut self) -> &mut dyn Any {
        self
    }

    fn remove_entity(&mut self, entity_index: u32) -> bool {
        self.remove(entity_index).is_some()
    }

    fn len(&self) -> usize {
        SparseSet::len(self)
    }
}

/// Type-erased registry of dense `SparseSet<T>` component columns keyed by `TypeId`.
#[derive(Default)]
pub struct ComponentColumns {
    columns: HashMap<TypeId, Box<dyn AnySparseSet>>,
}

impl ComponentColumns {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn column<T: Send + Sync + 'static>(&self) -> Option<&SparseSet<T>> {
        self.columns
            .get(&TypeId::of::<T>())
            .and_then(|col| col.as_any().downcast_ref::<SparseSet<T>>())
    }

    pub fn column_mut<T: Send + Sync + 'static>(&mut self) -> &mut SparseSet<T> {
        self.columns
            .entry(TypeId::of::<T>())
            .or_insert_with(|| Box::new(SparseSet::<T>::new()))
            .as_any_mut()
            .downcast_mut::<SparseSet<T>>()
            .expect("TypeId-keyed column matches T")
    }

    pub fn insert<T: Send + Sync + 'static>(&mut self, entity_index: u32, value: T) -> Option<T> {
        self.column_mut::<T>().insert(entity_index, value)
    }

    pub fn get<T: Send + Sync + 'static>(&self, entity_index: u32) -> Option<&T> {
        self.column::<T>()?.get(entity_index)
    }

    pub fn get_mut<T: Send + Sync + 'static>(&mut self, entity_index: u32) -> Option<&mut T> {
        self.columns
            .get_mut(&TypeId::of::<T>())
            .and_then(|col| col.as_any_mut().downcast_mut::<SparseSet<T>>())
            .and_then(|set| set.get_mut(entity_index))
    }

    pub fn remove<T: Send + Sync + 'static>(&mut self, entity_index: u32) -> Option<T> {
        self.columns
            .get_mut(&TypeId::of::<T>())
            .and_then(|col| col.as_any_mut().downcast_mut::<SparseSet<T>>())
            .and_then(|set| set.remove(entity_index))
    }

    pub fn remove_all_for_entity(&mut self, entity_index: u32) {
        for column in self.columns.values_mut() {
            column.remove_entity(entity_index);
        }
    }

    pub fn column_count(&self) -> usize {
        self.columns.len()
    }

    pub fn total_components(&self) -> usize {
        self.columns.values().map(|c| c.len()).sum()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sparse_set_insert_swap_remove_and_dense_iteration_stay_coherent() {
        let mut set = SparseSet::new();
        assert_eq!(set.insert(10, "a"), None);
        assert_eq!(set.insert(2, "b"), None);
        assert_eq!(set.insert(42, "c"), None);
        assert_eq!(set.len(), 3);
        assert_eq!(set.get(2), Some(&"b"));
        assert_eq!(set.insert(2, "b2"), Some("b"));
        assert_eq!(set.remove(10), Some("a"));
        assert_eq!(set.len(), 2);
        assert!(!set.contains(10));
        assert_eq!(set.get(42), Some(&"c"));
        assert_eq!(set.get(2), Some(&"b2"));

        let pairs: Vec<_> = set.iter().map(|(e, v)| (e, *v)).collect();
        assert_eq!(pairs.len(), 2);
        assert!(pairs.contains(&(2, "b2")));
        assert!(pairs.contains(&(42, "c")));
    }

    #[test]
    fn component_columns_manage_multiple_dense_types() {
        #[derive(Debug, PartialEq)]
        struct Pos(f32, f32);
        #[derive(Debug, PartialEq)]
        struct Vel(f32, f32);

        let mut cols = ComponentColumns::new();
        cols.insert(1, Pos(1.0, 2.0));
        cols.insert(1, Vel(0.5, -0.5));
        cols.insert(5, Pos(3.0, 4.0));
        assert_eq!(cols.column_count(), 2);
        assert_eq!(cols.total_components(), 3);
        assert_eq!(cols.get::<Pos>(1), Some(&Pos(1.0, 2.0)));

        cols.remove_all_for_entity(1);
        assert_eq!(cols.get::<Pos>(1), None);
        assert_eq!(cols.get::<Vel>(1), None);
        assert_eq!(cols.get::<Pos>(5), Some(&Pos(3.0, 4.0)));
    }
}
