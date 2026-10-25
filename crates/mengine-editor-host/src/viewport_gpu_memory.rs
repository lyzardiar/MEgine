// Author: MiYu. Read device-wide allocator totals only when a diagnostic consumer requests them.
use serde::Serialize;
use std::{collections::BTreeMap, time::Instant};

const MAX_GROUPS: usize = 64;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AllocationGroup { pub name: String, pub allocations: usize, pub bytes: u64 }

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewportGpuMemory {
    pub device_id: u64,
    pub available: bool,
    pub allocated_bytes: Option<u64>,
    pub reserved_bytes: Option<u64>,
    pub allocations: Option<usize>,
    pub blocks: Option<usize>,
    pub groups: Vec<AllocationGroup>,
    pub groups_truncated: bool,
    pub elapsed_ms: f64,
}

fn allocation_groups(allocations: impl Iterator<Item = (String, u64)>) -> (Vec<AllocationGroup>, bool) {
    let mut groups = BTreeMap::<String, AllocationGroup>::new();
    for (name, bytes) in allocations {
        let name = if name.is_empty() { "<unlabeled>".into() } else { name };
        let group = groups.entry(name.clone()).or_insert(AllocationGroup { name, allocations: 0, bytes: 0 });
        group.allocations += 1; group.bytes += bytes;
    }
    let truncated = groups.len() > MAX_GROUPS;
    let mut groups = groups.into_values().collect::<Vec<_>>();
    groups.sort_by(|a,b| b.bytes.cmp(&a.bytes).then(a.name.cmp(&b.name))); groups.truncate(MAX_GROUPS);
    (groups, truncated)
}

fn summarize(device_id: u64, report: Option<mengine_rhi::GpuAllocatorReport>) -> ViewportGpuMemory {
    let mut result = ViewportGpuMemory { device_id, available: report.is_some(), allocated_bytes: None, reserved_bytes: None, allocations: None, blocks: None, groups: vec![], groups_truncated: false, elapsed_ms: 0.0 };
    if let Some(report) = report {
        result.allocated_bytes = Some(report.allocated_bytes); result.reserved_bytes = Some(report.reserved_bytes);
        result.allocations = Some(report.allocations.len()); result.blocks = Some(report.blocks);
        (result.groups, result.groups_truncated) = allocation_groups(report.allocations.into_iter());
    }
    result
}

impl super::EditorViewportRenderer {
    pub fn gpu_memory_diagnostics(&self) -> ViewportGpuMemory {
        let started = Instant::now(); let (device, report) = self.renderer.gpu_allocator_report();
        let mut result = summarize(device, report); result.elapsed_ms = started.elapsed().as_secs_f64() * 1000.0; result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unsupported_allocator_is_distinct_from_supported_empty_allocator() {
        let unavailable = summarize(7, None); assert!(!unavailable.available); assert!(unavailable.allocated_bytes.is_none()); assert_eq!(unavailable.device_id, 7);
        let empty = summarize(8, Some(mengine_rhi::GpuAllocatorReport { allocations: vec![], blocks: 0, allocated_bytes: 0, reserved_bytes: 0 }));
        assert!(empty.available); assert_eq!(empty.allocated_bytes, Some(0)); assert_eq!(empty.allocations, Some(0)); assert_eq!(empty.blocks, Some(0)); assert!(empty.groups.is_empty());
    }

    #[test]
    fn allocation_labels_aggregate_and_top_groups_are_bounded_and_deterministic() {
        let input = vec![("mesh".into(), 7), ("mesh".into(), 5), ("".into(), 1), ("texture".into(), 12)];
        let (groups, truncated) = allocation_groups(input.into_iter()); assert!(!truncated);
        assert_eq!(groups.iter().map(|g| (g.name.as_str(), g.allocations, g.bytes)).collect::<Vec<_>>(), vec![("mesh",2,12),("texture",1,12),("<unlabeled>",1,1)]);
        let input = (0..100).map(|index| (format!("group-{index:03}"), 100));
        let (groups, truncated) = allocation_groups(input); assert!(truncated); assert_eq!(groups.len(), MAX_GROUPS); assert_eq!(groups[0].name, "group-000"); assert_eq!(groups[63].name, "group-063");
    }
}
