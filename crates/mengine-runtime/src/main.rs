//! MEngine PC runtime / sample player.

use anyhow::Result;
use clap::Parser;
use glam::{Vec3, Vec4};
use mengine_core::command::WorldCommand;
use mengine_core::generated::{Camera3D, MeshRenderer, Transform};
use mengine_core::World;
use mengine_platform::InputState;
use mengine_rhi::{look_at, perspective, FrameCamera, RenderObject, Renderer};
use mengine_script::ScriptHost;
use serde_json::json;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Instant;
use winit::application::ApplicationHandler;
use winit::event::{ElementState, KeyEvent, WindowEvent};
use winit::event_loop::{ActiveEventLoop, ControlFlow, EventLoop};
use winit::keyboard::{KeyCode as WinitKey, PhysicalKey};
use winit::window::{Window, WindowId};

#[derive(Parser, Debug)]
#[command(name = "mengine-runtime")]
struct Args {
    #[arg(long, default_value = "spinning-cube")]
    sample: String,

    #[arg(long)]
    script: Option<PathBuf>,
}

struct App {
    args:       Args,
    window:     Option<Arc<Window>>,
    renderer:   Option<Renderer>,
    world:      World,
    script:     Option<ScriptHost>,
    input:      InputState,
    last:       Instant,
    cube:       Option<mengine_core::Entity>,
    angle:      f32,
}

impl App {
    fn new(args: Args) -> Self {
        Self {
            args,
            window:   None,
            renderer: None,
            world:    World::new(),
            script:   None,
            input:    InputState::default(),
            last:     Instant::now(),
            cube:     None,
            angle:    0.0,
        }
    }

    fn bootstrap_sample(&mut self) {
        match self.args.sample.as_str() {
            "hello-triangle" | "clear" => {
                self.world.time.clear_color = Vec4::new(0.15, 0.2, 0.35, 1.0);
            }
            _ => {
                // spinning-cube default
                self.world.commands.push(WorldCommand::Spawn {
                    name: Some("MainCamera".into()),
                    components: json!({
                        "Transform": {
                            "position": [0.0, 1.5, 4.0],
                            "rotation": [0.0, 0.0, 0.0, 1.0],
                            "scale": [1.0, 1.0, 1.0]
                        },
                        "Camera3D": {
                            "fov_y_degrees": 60.0,
                            "near": 0.1,
                            "far": 100.0,
                            "primary": true
                        }
                    }),
                });
                self.world.commands.push(WorldCommand::Spawn {
                    name: Some("Cube".into()),
                    components: json!({
                        "Transform": {
                            "position": [0.0, 0.0, 0.0],
                            "rotation": [0.0, 0.0, 0.0, 1.0],
                            "scale": [1.0, 1.0, 1.0]
                        },
                        "MeshRenderer": {
                            "mesh": "cube",
                            "material": "default"
                        }
                    }),
                });
                let spawned = self.world.commit();
                self.cube = spawned.get(1).copied();
            }
        }
    }
}

impl ApplicationHandler for App {
    fn resumed(&mut self, event_loop: &ActiveEventLoop) {
        if self.window.is_some() {
            return;
        }
        let window = Arc::new(
            event_loop
                .create_window(
                    Window::default_attributes()
                        .with_title("MEngine Runtime")
                        .with_inner_size(winit::dpi::LogicalSize::new(1280, 720)),
                )
                .expect("window"),
        );
        let renderer = pollster::block_on(Renderer::new(window.clone())).expect("renderer");
        self.window = Some(window);
        self.renderer = Some(renderer);
        self.bootstrap_sample();

        let mut script = ScriptHost::new().ok();
        if let Some(ref mut s) = script {
            let default_script = format!(
                r#"
var t = 0.0;
function onTick(dt, frame) {{
  t += dt;
  var r = 0.1 + 0.1 * Math.sin(t);
  var g = 0.1 + 0.05 * Math.cos(t * 0.7);
  engine.setClearColor(r, g, 0.14, 1.0);
}}
"#
            );
            if let Some(path) = &self.args.script {
                let _ = s.load_file(path);
            } else {
                let loaded = false;
                let sample_js = PathBuf::from(format!("samples/{}/main.js", self.args.sample));
                let sample_ts = PathBuf::from(format!("samples/{}/main.ts", self.args.sample));
                if sample_js.exists() {
                    loaded = s.load_file(&sample_js).is_ok();
                }
                if !loaded && sample_ts.exists() {
                    log::warn!(
                        "found {}.ts but no compiled .js — run: npm run build:samples",
                        self.args.sample
                    );
                }
                if !loaded {
                    let _ = s.eval(&default_script);
                }
            }
        }
        self.script = script;
        self.last = Instant::now();
    }

    fn window_event(&mut self, event_loop: &ActiveEventLoop, _id: WindowId, event: WindowEvent) {
        match event {
            WindowEvent::CloseRequested => event_loop.exit(),
            WindowEvent::Resized(size) => {
                if let Some(r) = self.renderer.as_mut() {
                    r.resize(size);
                }
            }
            WindowEvent::KeyboardInput {
                event:
                    KeyEvent {
                        physical_key: PhysicalKey::Code(code),
                        state,
                        ..
                    },
                ..
            } => {
                let key = match code {
                    WinitKey::KeyW => mengine_platform::KeyCode::W,
                    WinitKey::KeyA => mengine_platform::KeyCode::A,
                    WinitKey::KeyS => mengine_platform::KeyCode::S,
                    WinitKey::KeyD => mengine_platform::KeyCode::D,
                    WinitKey::Space => mengine_platform::KeyCode::Space,
                    WinitKey::Escape => mengine_platform::KeyCode::Escape,
                    WinitKey::F5 => mengine_platform::KeyCode::F5,
                    _ => mengine_platform::KeyCode::Other,
                };
                match state {
                    ElementState::Pressed => self.input.key_down(key),
                    ElementState::Released => self.input.key_up(key),
                }
                if key == mengine_platform::KeyCode::Escape
                    && state == ElementState::Pressed
                {
                    event_loop.exit();
                }
            }
            WindowEvent::RedrawRequested => {
                let now = Instant::now();
                let dt = (now - self.last).as_secs_f32();
                self.last = now;
                self.input.begin_frame(self.world.time.frame);
                let steps = self.world.time.tick(dt);

                for _ in 0..steps {
                    self.angle += self.world.time.fixed_delta;
                    if let Some(cube) = self.cube {
                        if let Some(t) = self.world.get_component_mut::<Transform>(cube) {
                            let half = self.angle * 0.5;
                            t.rotation = [0.0, half.sin(), 0.0, half.cos()];
                        }
                    }
                }

                if let Some(script) = self.script.as_mut() {
                    let _ = script.tick(&mut self.world, dt);
                }

                if let Some(r) = self.renderer.as_mut() {
                    r.clear = self.world.time.clear_color.into();
                    let aspect = r.aspect();
                    let (eye, fov) = find_camera(&self.world);
                    let camera = FrameCamera {
                        view: look_at(eye, Vec3::ZERO, Vec3::Y),
                        proj: perspective(fov, aspect, 0.1, 100.0),
                    };
                    let objects = collect_objects(&self.world);
                    if let Err(e) = r.render(camera, &objects) {
                        log::warn!("render: {e}");
                    }
                }

                if let Some(w) = &self.window {
                    w.request_redraw();
                }
            }
            _ => {}
        }
    }

    fn about_to_wait(&mut self, event_loop: &ActiveEventLoop) {
        event_loop.set_control_flow(ControlFlow::Poll);
        if let Some(w) = &self.window {
            w.request_redraw();
        }
    }
}

fn find_camera(world: &World) -> (Vec3, f32) {
    for e in world.iter_entities() {
        if let (Some(t), Some(c)) = (
            world.get_component::<Transform>(e),
            world.get_component::<Camera3D>(e),
        ) {
            if c.primary {
                return (Vec3::from(t.position), c.fov_y_degrees);
            }
        }
    }
    (Vec3::new(0.0, 1.5, 4.0), 60.0)
}

fn collect_objects(world: &World) -> Vec<RenderObject> {
    let mut out = Vec::new();
    for e in world.iter_entities() {
        if let (Some(t), Some(m)) = (
            world.get_component::<Transform>(e),
            world.get_component::<MeshRenderer>(e),
        ) {
            let _ = m;
            out.push(RenderObject {
                mesh_key: "cube",
                model:    t.to_matrix(),
                color:    [0.85, 0.55, 0.25, 1.0],
            });
        }
    }
    out
}

fn main() -> Result<()> {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
    let args = Args::parse();
    let event_loop = EventLoop::new()?;
    let mut app = App::new(args);
    event_loop.run_app(&mut app)?;
    Ok(())
}
