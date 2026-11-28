//! DAG RenderGraph compiler with dead-pass culling, topological ordering,
//! and transient resource lifetime/aliasing planning.

use std::collections::{HashMap, HashSet, VecDeque};
use thiserror::Error;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct ResourceId(pub u32);

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct TransientTextureDesc {
    pub width: u32,
    pub height: u32,
    pub format: wgpu::TextureFormat,
    pub sample_count: u32,
}

#[derive(Clone, Debug)]
pub struct ResourceDecl {
    pub id: ResourceId,
    pub name: String,
    pub desc: Option<TransientTextureDesc>,
    pub imported: bool,
}

#[derive(Clone, Debug)]
pub struct PassDesc {
    pub name: String,
    pub color: bool,
    pub depth: bool,
    pub reads: Vec<ResourceId>,
    pub writes: Vec<ResourceId>,
    /// Marks a terminal or external-side-effect pass (e.g., swapchain present) that cannot be culled.
    pub side_effect: bool,
}

impl PassDesc {
    pub fn simple(name: impl Into<String>, color: bool, depth: bool) -> Self {
        Self {
            name: name.into(),
            color,
            depth,
            reads: Vec::new(),
            writes: Vec::new(),
            side_effect: true,
        }
    }
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum RenderGraphError {
    #[error("render graph contains a cyclic dependency involving pass '{0}'")]
    Cycle(String),
    #[error("pass '{pass}' references unknown resource id {resource:?}")]
    UnknownResource { pass: String, resource: ResourceId },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ResourceLifetime {
    pub id: ResourceId,
    pub name: String,
    pub first_pass: usize,
    pub last_pass: usize,
    /// Transient alias pool slot (non-overlapping compatible resources share an alias group).
    pub alias_group: Option<usize>,
}

#[derive(Clone, Debug)]
pub struct CompiledGraph {
    pub execution_order: Vec<usize>,
    pub culled_passes: Vec<usize>,
    pub lifetimes: Vec<ResourceLifetime>,
    pub alias_slot_count: usize,
}

#[derive(Default)]
pub struct RenderGraph {
    passes: Vec<PassDesc>,
    resources: Vec<ResourceDecl>,
}

impl RenderGraph {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn declare_transient(
        &mut self,
        name: impl Into<String>,
        desc: TransientTextureDesc,
    ) -> ResourceId {
        let id = ResourceId(self.resources.len() as u32);
        self.resources.push(ResourceDecl {
            id,
            name: name.into(),
            desc: Some(desc),
            imported: false,
        });
        id
    }

    pub fn import_resource(&mut self, name: impl Into<String>) -> ResourceId {
        let id = ResourceId(self.resources.len() as u32);
        self.resources.push(ResourceDecl {
            id,
            name: name.into(),
            desc: None,
            imported: true,
        });
        id
    }

    pub fn add_pass(&mut self, pass: PassDesc) -> usize {
        let index = self.passes.len();
        self.passes.push(pass);
        index
    }

    pub fn passes(&self) -> &[PassDesc] {
        &self.passes
    }

    pub fn resources(&self) -> &[ResourceDecl] {
        &self.resources
    }

    /// Compiles pass dependencies into a culled topological order with transient
    /// resource lifetime ranges and memory-aliasing groups.
    pub fn compile(&self) -> Result<CompiledGraph, RenderGraphError> {
        let n = self.passes.len();
        let valid_ids: HashSet<ResourceId> = self.resources.iter().map(|r| r.id).collect();
        for pass in &self.passes {
            for &res in pass.reads.iter().chain(&pass.writes) {
                if !valid_ids.contains(&res) {
                    return Err(RenderGraphError::UnknownResource {
                        pass: pass.name.clone(),
                        resource: res,
                    });
                }
            }
        }

        // Map each resource -> latest writer pass index so far (handles sequential writes cleanly).
        let mut last_writer: HashMap<ResourceId, usize> = HashMap::new();
        let mut edges: Vec<Vec<usize>> = vec![Vec::new(); n];
        let mut indegree: Vec<usize> = vec![0; n];
        let mut producers_of: Vec<Vec<usize>> = vec![Vec::new(); n];

        for (i, pass) in self.passes.iter().enumerate() {
            let mut deps = HashSet::new();
            for &res in &pass.reads {
                if let Some(&writer) = last_writer.get(&res) {
                    if writer != i {
                        deps.insert(writer);
                    }
                }
            }
            for &res in &pass.writes {
                if let Some(&writer) = last_writer.get(&res) {
                    if writer != i {
                        deps.insert(writer);
                    }
                }
                last_writer.insert(res, i);
            }
            for dep in deps {
                edges[dep].push(i);
                indegree[i] += 1;
                producers_of[i].push(dep);
            }
        }

        // Backwards reachability from side-effect passes for dead-pass culling.
        let mut live = vec![false; n];
        let mut stack: Vec<usize> = (0..n).filter(|&i| self.passes[i].side_effect).collect();
        while let Some(idx) = stack.pop() {
            if live[idx] {
                continue;
            }
            live[idx] = true;
            for &dep in &producers_of[idx] {
                if !live[dep] {
                    stack.push(dep);
                }
            }
        }

        // Kahn's topological sort over live passes (tie-broken by original pass index).
        let mut ready: VecDeque<usize> = (0..n)
            .filter(|&i| live[i] && indegree[i] == 0)
            .collect();
        let mut execution_order = Vec::new();
        while let Some(u) = ready.pop_front() {
            execution_order.push(u);
            for &v in &edges[u] {
                if !live[v] {
                    continue;
                }
                indegree[v] -= 1;
                if indegree[v] == 0 {
                    ready.push_back(v);
                }
            }
        }

        let live_count = live.iter().filter(|&&b| b).count();
        if execution_order.len() != live_count {
            let stuck = (0..n)
                .find(|&i| live[i] && !execution_order.contains(&i))
                .map(|i| self.passes[i].name.clone())
                .unwrap_or_default();
            return Err(RenderGraphError::Cycle(stuck));
        }

        let culled_passes: Vec<usize> = (0..n).filter(|&i| !live[i]).collect();

        // Compute resource lifetimes in compiled execution-order indices.
        let mut first_use: HashMap<ResourceId, usize> = HashMap::new();
        let mut last_use: HashMap<ResourceId, usize> = HashMap::new();
        for (exec_idx, &pass_idx) in execution_order.iter().enumerate() {
            let pass = &self.passes[pass_idx];
            for &res in pass.reads.iter().chain(&pass.writes) {
                first_use.entry(res).or_insert(exec_idx);
                last_use.insert(res, exec_idx);
            }
        }

        // Greedy interval aliasing for transient textures with matching descriptors.
        let mut slots: Vec<(TransientTextureDesc, usize)> = Vec::new();
        let mut lifetimes = Vec::new();
        for decl in &self.resources {
            let (Some(&first_pass), Some(&last_pass)) =
                (first_use.get(&decl.id), last_use.get(&decl.id))
            else {
                continue;
            };
            let alias_group = if !decl.imported {
                if let Some(desc) = &decl.desc {
                    if let Some((slot_idx, slot)) = slots
                        .iter_mut()
                        .enumerate()
                        .find(|(_, (d, end))| d == desc && *end < first_pass)
                    {
                        slot.1 = last_pass;
                        Some(slot_idx)
                    } else {
                        let slot_idx = slots.len();
                        slots.push((desc.clone(), last_pass));
                        Some(slot_idx)
                    }
                } else {
                    None
                }
            } else {
                None
            };
            lifetimes.push(ResourceLifetime {
                id: decl.id,
                name: decl.name.clone(),
                first_pass,
                last_pass,
                alias_group,
            });
        }

        Ok(CompiledGraph {
            execution_order,
            culled_passes,
            lifetimes,
            alias_slot_count: slots.len(),
        })
    }

    pub fn default_forward() -> Self {
        let mut g = Self::new();
        let hdr_color = g.declare_transient(
            "hdr_color",
            TransientTextureDesc {
                width: 1280,
                height: 720,
                format: wgpu::TextureFormat::Rgba16Float,
                sample_count: 1,
            },
        );
        let depth = g.declare_transient(
            "scene_depth",
            TransientTextureDesc {
                width: 1280,
                height: 720,
                format: wgpu::TextureFormat::Depth24PlusStencil8,
                sample_count: 1,
            },
        );
        let backbuffer = g.import_resource("swapchain_backbuffer");

        g.add_pass(PassDesc {
            name: "environment_background".into(),
            color: true,
            depth: false,
            reads: vec![],
            writes: vec![hdr_color],
            side_effect: false,
        });
        g.add_pass(PassDesc {
            name: "forward_hdr".into(),
            color: true,
            depth: true,
            reads: vec![hdr_color],
            writes: vec![hdr_color, depth],
            side_effect: false,
        });
        g.add_pass(PassDesc {
            name: "aces_tone_mapping".into(),
            color: true,
            depth: false,
            reads: vec![hdr_color],
            writes: vec![backbuffer],
            side_effect: false,
        });
        g.add_pass(PassDesc {
            name: "ui_overlay".into(),
            color: true,
            depth: false,
            reads: vec![backbuffer],
            writes: vec![backbuffer],
            side_effect: true,
        });
        g
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn forward_graph_keeps_ui_after_hdr_tone_mapping() {
        let graph = RenderGraph::default_forward();
        assert_eq!(
            graph
                .passes()
                .iter()
                .map(|pass| pass.name.as_str())
                .collect::<Vec<_>>(),
            vec![
                "environment_background",
                "forward_hdr",
                "aces_tone_mapping",
                "ui_overlay"
            ]
        );
        assert!(!graph.passes()[0].depth);
        assert!(graph.passes()[1].depth);
        assert!(!graph.passes()[2].depth);
        assert!(!graph.passes()[3].depth);
        let compiled = graph.compile().unwrap();
        assert_eq!(compiled.execution_order, vec![0, 1, 2, 3]);
        assert!(compiled.culled_passes.is_empty());
    }

    #[test]
    fn graph_culls_unused_passes_and_aliases_disjoint_transients() {
        let mut g = RenderGraph::new();
        let desc = TransientTextureDesc {
            width: 512,
            height: 512,
            format: wgpu::TextureFormat::Rgba16Float,
            sample_count: 1,
        };
        let a = g.declare_transient("temp_a", desc.clone());
        let b = g.declare_transient("temp_b", desc.clone());
        let unused = g.declare_transient("unused_bloom", desc);
        let out = g.import_resource("present");

        g.add_pass(PassDesc {
            name: "p0_write_a".into(),
            color: true,
            depth: false,
            reads: vec![],
            writes: vec![a],
            side_effect: false,
        });
        g.add_pass(PassDesc {
            name: "p1_dead_pass".into(),
            color: true,
            depth: false,
            reads: vec![],
            writes: vec![unused],
            side_effect: false,
        });
        g.add_pass(PassDesc {
            name: "p2_a_to_out".into(),
            color: true,
            depth: false,
            reads: vec![a],
            writes: vec![out],
            side_effect: false,
        });
        g.add_pass(PassDesc {
            name: "p3_write_b".into(),
            color: true,
            depth: false,
            reads: vec![out],
            writes: vec![b],
            side_effect: false,
        });
        g.add_pass(PassDesc {
            name: "p4_present".into(),
            color: true,
            depth: false,
            reads: vec![out, b],
            writes: vec![out],
            side_effect: true,
        });

        let compiled = g.compile().unwrap();
        assert_eq!(compiled.culled_passes, vec![1]);
        assert_eq!(compiled.alias_slot_count, 1);
    }
}
