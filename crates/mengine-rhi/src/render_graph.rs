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
            name: "forward_opaque".into(),
            color: true,
            depth: true,
        });
        g.add_pass(PassDesc {
            name: "ui_overlay".into(),
            color: true,
            depth: false,
        });
        g
    }
}
