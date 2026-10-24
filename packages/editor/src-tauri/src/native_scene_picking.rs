// Author: MiYu. Retain a bounded set of submitted Scene geometries, scoped to their project, window and Play generation.
use mengine_rhi::MeshPickFrame;
use parking_lot::Mutex;
use std::{collections::{HashSet, VecDeque}, path::PathBuf, sync::{Arc, OnceLock}};

const MAX_FRAMES: usize = 12;
const MAX_WINDOW_FRAMES: usize = 3;
const MAX_BYTES: usize = 256 * 1024 * 1024;

#[derive(Clone, PartialEq, Eq)]
pub(crate) struct Owner { pub project: PathBuf, pub window: String, pub generation: u64 }
struct Entry { token: String, owner: Owner, frame: Arc<MeshPickFrame>, bytes: usize }
#[derive(Default)]
struct Frames { next: u64, generation: u64, entries: VecDeque<Entry>, bytes: usize }
static FRAMES: OnceLock<Mutex<Frames>> = OnceLock::new();
fn frames() -> &'static Mutex<Frames> { FRAMES.get_or_init(Mutex::default) }

impl Frames {
    fn retire_before(&mut self, generation: u64) {
        self.generation = self.generation.max(generation);let current = self.generation;
        self.retain(|entry| entry.owner.generation >= current);
    }
    fn retain(&mut self, mut keep: impl FnMut(&Entry) -> bool) {
        self.entries.retain(|entry| keep(entry)); self.bytes = self.entries.iter().map(|entry| entry.bytes).sum();
    }
    fn insert(&mut self, owner: Owner, frame: MeshPickFrame) -> Option<String> {
        if owner.generation < self.generation { return None; }
        // Geometry is shared within a frame; counting it again across frames conservatively bounds retention.
        let mut geometries = HashSet::new();
        let bytes = std::mem::size_of::<MeshPickFrame>().checked_add(std::mem::size_of_val(frame.objects.as_slice()))?.checked_add(frame.objects.iter().filter(|object| geometries.insert(Arc::as_ptr(&object.geometry))).try_fold(0usize, |bytes, object| bytes.checked_add(object.geometry.bytes()))?)?;
        self.retain(|entry| entry.owner.window != owner.window || entry.owner == owner);
        if bytes > MAX_BYTES { return None; }
        while self.entries.len() >= MAX_FRAMES || self.bytes + bytes > MAX_BYTES || self.entries.iter().filter(|entry| entry.owner == owner).count() >= MAX_WINDOW_FRAMES {
            let index = if self.entries.iter().filter(|entry| entry.owner == owner).count() >= MAX_WINDOW_FRAMES { self.entries.iter().position(|entry| entry.owner == owner).unwrap() } else { 0 };
            self.bytes -= self.entries.remove(index).unwrap().bytes;
        }
        self.next = self.next.checked_add(1)?; let token = self.next.to_string(); self.bytes += bytes;
        self.entries.push_back(Entry { token: token.clone(), owner, frame: Arc::new(frame), bytes }); Some(token)
    }
    fn get(&self, owner: &Owner, token: &str) -> Option<Arc<MeshPickFrame>> {
        self.entries.iter().find(|entry| entry.token == token && &entry.owner == owner).map(|entry| Arc::clone(&entry.frame))
    }
}

pub(crate) fn publish(owner: Owner, frame: Option<MeshPickFrame>) -> Option<String> { frames().lock().insert(owner, frame?) }
pub(crate) fn read(owner: &Owner, token: &str) -> Option<Arc<MeshPickFrame>> { frames().lock().get(owner, token) }
pub(crate) fn destroy_window(window: &str) { frames().lock().retain(|entry| entry.owner.window != window); }
pub(crate) fn clear() { frames().lock().retain(|_| false); }
pub(crate) fn retire_before(generation: u64) { frames().lock().retire_before(generation); }

#[cfg(test)]
mod tests {
    use super::*;
    fn owner(window: &str) -> Owner { Owner { project: "project-a".into(), window: window.into(), generation: 1 } }
    fn empty() -> MeshPickFrame { MeshPickFrame { camera: mengine_rhi::FrameCamera { view: Default::default(), proj: Default::default(), position: Default::default() }, objects: vec![] } }
    #[test]
    fn frames_expire_by_window_budget_project_and_generation_without_substitution() {
        let mut frames = Frames::default(); let a = owner("a");
        let first = frames.insert(a.clone(), empty()).unwrap(); let held = frames.get(&a, &first).unwrap();
        for _ in 0..3 { frames.insert(a.clone(), empty()).unwrap(); }
        assert!(frames.get(&a, &first).is_none()); assert_eq!(Arc::strong_count(&held), 1);
        let last = frames.entries.back().unwrap().token.clone(); assert!(frames.get(&owner("b"), &last).is_none());
        for changed in [Owner { project: "project-b".into(), ..a.clone() }, Owner { generation: 2, ..a.clone() }] { assert!(frames.get(&changed, &last).is_none()); }
        for window in 0..20 { frames.insert(owner(&window.to_string()), empty()).unwrap(); }
        assert_eq!(frames.entries.len(), MAX_FRAMES); assert!(frames.get(&a, &last).is_none());
        frames.insert(Owner { generation: 2, ..owner("19") }, empty()).unwrap();
        assert_eq!(frames.entries.iter().filter(|entry| entry.owner.window == "19").count(), 1);
        frames.entries.back_mut().unwrap().bytes = MAX_BYTES; frames.bytes = frames.entries.iter().map(|entry| entry.bytes).sum();
        frames.insert(owner("20"), empty()).unwrap(); assert!(frames.bytes <= MAX_BYTES); assert_eq!(frames.entries.len(), 1);
        frames.retain(|_| false); assert_eq!(frames.bytes, 0); assert!(frames.entries.is_empty());
    }
}

#[cfg(test)]
#[path = "native_scene_picking_lifetime_tests.rs"]
mod lifetime_tests;
