//! Linear render-graph placeholder (Phase 4 expands dependencies / barriers).

#[derive(Clone, Debug)]
pub struct PassDesc {
    pub name: String,
    pub color: bool,
    pub depth: bool,
}

#[derive(Default)]
pub struct RenderGraph {
    passes: Vec<PassDesc>,
}

impl RenderGraph {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add_pass(&mut self, pass: PassDesc) {
        self.passes.push(pass);
    }

    pub fn passes(&self) -> &[PassDesc] {
        &self.passes
    }

    pub fn default_forward() -> Self {
        let mut g = Self::new();
        g.add_pass(PassDesc {
            name: "environment_background".into(),
            color: true,
            depth: false,
        });
        g.add_pass(PassDesc {
            name: "forward_hdr".into(),
            color: true,
            depth: true,
        });
        g.add_pass(PassDesc {
            name: "aces_tone_mapping".into(),
            color: true,
            depth: false,
        });
        g.add_pass(PassDesc {
            name: "ui_overlay".into(),
            color: true,
            depth: false,
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
    }
}
