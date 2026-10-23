// Author: MiYu. Run project-configured content converters without blocking simulation or rendering.
use crate::scenes::SceneManager;
use mengine_script::{ScriptHost, ScriptRuntimeRequest};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{fs, path::{Component, Path, PathBuf}, process::{Child, Command, Stdio}, sync::{Arc, atomic::{AtomicBool, Ordering}, mpsc}, time::{Duration, SystemTime, UNIX_EPOCH}};

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Importer {
    program: String,
    #[serde(default)] args: Vec<String>,
    extensions: Vec<String>,
    title: String,
    #[serde(default)] initial_directory: Option<String>,
    work_directory: String,
}

pub struct ContentImports {
    root: Option<PathBuf>,
    sender: mpsc::Sender<Value>,
    receiver: mpsc::Receiver<Value>,
    cancelled: Option<Arc<AtomicBool>>,
    worker: Option<std::thread::JoinHandle<()>>,
}

impl ContentImports {
    pub fn new(root: Option<PathBuf>) -> Self {
        let (sender, receiver) = mpsc::channel();
        Self { root, sender, receiver, cancelled: None, worker: None }
    }

    pub fn apply(&mut self, request: &ScriptRuntimeRequest) -> bool {
        match request {
            ScriptRuntimeRequest::CancelContentImport => { if let Some(flag) = &self.cancelled { flag.store(true, Ordering::Release); } true }
            ScriptRuntimeRequest::ImportContent { importer, path } => {
                if self.cancelled.is_some() { return true; }
                let cancelled = Arc::new(AtomicBool::new(false));
                self.cancelled = Some(cancelled.clone());
                let root = self.root.clone(); let importer = importer.clone(); let path = path.clone(); let sender = self.sender.clone();
                self.worker = Some(std::thread::spawn(move || {
                    let result = run(root.as_deref(), &importer, path.as_deref(), &cancelled, &sender);
                    let event = if cancelled.load(Ordering::Acquire) { json!({"status":"cancelled"}) } else { match result { Ok(Some(value)) => json!({"status":"complete","content":value}), Ok(None) => json!({"status":"cancelled"}), Err(error) => json!({"status":"failed","message":error}) } };
                    let _ = sender.send(event);
                }));
                true
            }
            _ => false,
        }
    }

    pub fn update(&mut self, script: &mut ScriptHost, scenes: &mut SceneManager) -> Result<(), String> {
        while let Ok(mut event) = self.receiver.try_recv() {
            let terminal = matches!(event["status"].as_str(), Some("complete" | "failed" | "cancelled"));
            if terminal {
                if self.cancelled.as_ref().is_some_and(|flag| flag.load(Ordering::Acquire)) { event = json!({"status":"cancelled"}); }
                self.cancelled = None;
                if let Some(worker) = self.worker.take() { let _ = worker.join(); }
            }
            let scene = if event["status"] == "complete" {
                match self.prepare(&mut event) { Ok(scene) => Some(scene), Err(error) => { event = json!({"status":"failed","message":error}); None } }
            } else { None };
            script.notify_content_import(&event).map_err(|error| error.to_string())?;
            if let Some(scene) = scene { scenes.register_imported(scene); }
        }
        Ok(())
    }

    fn prepare(&self, event: &mut Value) -> Result<PathBuf, String> {
        let root = self.root.as_deref().ok_or("Content import requires a project")?;
        let content = &mut event["content"];
        let scene = content["scene"].as_str().ok_or("Imported content has no scene")?.to_owned();
        let script = content["script"].as_str().ok_or("Imported content has no script")?;
        let scene_path = project_file(root, &scene)?;
        if scene_path.extension().and_then(|s| s.to_str()) != Some("mscene") { return Err("Imported scene must be .mscene".into()); }
        let script_path = project_file(root, script)?;
        if fs::metadata(&script_path).map_err(|e| e.to_string())?.len() > 32 * 1024 * 1024 { return Err("Imported script exceeds 32 MiB".into()); }
        content["scriptSource"] = Value::String(fs::read_to_string(script_path).map_err(|e| e.to_string())?);
        Ok(PathBuf::from(scene))
    }
}

impl Drop for ContentImports {
    fn drop(&mut self) {
        if let Some(flag) = &self.cancelled { flag.store(true, Ordering::Release); }
        // Player shutdown must wait until this job's child process tree has exited.
        if let Some(worker) = self.worker.take() { let _ = worker.join(); }
    }
}

fn project_file(root: &Path, reference: &str) -> Result<PathBuf, String> {
    let path = Path::new(reference);
    if !reference.starts_with("Assets/") || reference.contains('\\') || path.components().any(|c| !matches!(c, Component::Normal(_))) { return Err("Imported content must stay inside project Assets".into()); }
    let root = root.canonicalize().map_err(|e| e.to_string())?;
    let resolved = root.join(path).canonicalize().map_err(|e| e.to_string())?;
    if !resolved.starts_with(root.join("Assets")) || !resolved.is_file() { return Err("Imported content escapes project Assets".into()); }
    Ok(resolved)
}

fn hidden(command: &mut Command) {
    #[cfg(windows)] { use std::os::windows::process::CommandExt; command.creation_flags(0x08000000); }
    #[cfg(not(windows))] let _ = command;
}

fn wait(child: &mut Child, cancelled: &AtomicBool) -> Result<std::process::ExitStatus, String> {
    loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? { return Ok(status); }
        if cancelled.load(Ordering::Acquire) {
            // The process and its converter children belong exclusively to this import job.
            #[cfg(windows)] { let mut command = Command::new("taskkill"); command.args(["/PID", &child.id().to_string(), "/T", "/F"]).stdout(Stdio::null()).stderr(Stdio::null()); hidden(&mut command); let _ = command.status(); }
            let _ = child.kill(); let _ = child.wait(); return Err("Content import cancelled".into());
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}

#[cfg(windows)]
fn pick_file(config: &Importer, job: &Path, cancelled: &AtomicBool) -> Result<Option<PathBuf>, String> {
    // Environment values keep file paths and dialog text out of executable PowerShell source.
    let destination = job.join("selection.txt"); let filter = config.extensions.iter().map(|ext| format!("*.{ext}")).collect::<Vec<_>>().join(";");
    let source = "Add-Type -AssemblyName System.Windows.Forms; $picker = New-Object System.Windows.Forms.OpenFileDialog; $picker.Title = $env:MENGINE_PICK_TITLE; $picker.Filter = $env:MENGINE_PICK_FILTER; $picker.InitialDirectory = $env:MENGINE_PICK_DIRECTORY; $picker.CheckFileExists = $true; $picker.Multiselect = $false; if ($picker.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [System.IO.File]::WriteAllText($env:MENGINE_PICK_RESULT, $picker.FileName, (New-Object System.Text.UTF8Encoding($false))) }; $picker.Dispose()";
    let mut command = Command::new("powershell.exe");
    command.args(["-NoProfile", "-STA", "-Command", source]).env("MENGINE_PICK_TITLE", &config.title).env("MENGINE_PICK_FILTER", format!("{}|{}", config.title.replace('|', " "), filter)).env("MENGINE_PICK_DIRECTORY", config.initial_directory.as_deref().unwrap_or("")).env("MENGINE_PICK_RESULT", &destination).stdout(Stdio::null()).stderr(Stdio::null()); hidden(&mut command);
    let status = wait(&mut command.spawn().map_err(|e| e.to_string())?, cancelled)?;
    if !status.success() { return Err("Unable to open the file selection dialog".into()); }
    if !destination.exists() { return Ok(None); }
    fs::read_to_string(destination).map(|value| Some(PathBuf::from(value))).map_err(|e| e.to_string())
}

#[cfg(not(windows))]
fn pick_file(_config: &Importer, _job: &Path, _cancelled: &AtomicBool) -> Result<Option<PathBuf>, String> { Err("File selection is currently supported on Windows; supply a source path on this platform".into()) }

fn run(root: Option<&Path>, importer: &str, source: Option<&str>, cancelled: &AtomicBool, sender: &mpsc::Sender<Value>) -> Result<Option<Value>, String> {
    let root = root.ok_or("Content import requires a project")?.canonicalize().map_err(|e| e.to_string())?;
    let project: Value = serde_json::from_slice(&fs::read(root.join("project.json")).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    let config: Importer = serde_json::from_value(project["contentImporters"][importer].clone()).map_err(|_| format!("Content importer '{importer}' is not configured"))?;
    if config.extensions.is_empty() || config.extensions.iter().any(|ext| ext.is_empty() || !ext.bytes().all(|c| c.is_ascii_alphanumeric())) { return Err("Invalid importer extensions".into()); }
    let job = root.join(&config.work_directory).join(format!("job-{}", SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos()));
    fs::create_dir_all(&job).map_err(|e| e.to_string())?;
    let _ = sender.send(json!({"status":"choosing"}));
    let source = match source { Some(file) => PathBuf::from(file), None => match pick_file(&config, &job, cancelled)? { Some(path) => path, None => return Ok(None) } };
    let extension = source.extension().and_then(|s| s.to_str()).unwrap_or_default();
    if !source.is_file() || !config.extensions.iter().any(|s| s.eq_ignore_ascii_case(extension)) { return Err("Select an existing file with a supported extension".into()); }
    if cancelled.load(Ordering::Acquire) { return Ok(None); }
    let source = source.canonicalize().map_err(|e| e.to_string())?;
    let _ = sender.send(json!({"status":"importing","file":source.file_name().map(|s| s.to_string_lossy())}));
    let result = job.join("result.json"); let log_path = job.join("converter.log"); let log = fs::File::create(&log_path).map_err(|e| e.to_string())?;
    let program = if Path::new(&config.program).components().count() > 1 { root.join(&config.program) } else { PathBuf::from(&config.program) };
    let mut command = Command::new(program);
    command.current_dir(&root).args(&config.args).arg("--project").arg(&root).arg("--source").arg(&source).arg("--result").arg(&result).stdin(Stdio::null()).stdout(log.try_clone().map_err(|e| e.to_string())?).stderr(log); hidden(&mut command);
    let status = wait(&mut command.spawn().map_err(|e| format!("Cannot start content converter: {e}"))?, cancelled)?;
    let payload: Value = fs::read(&result).ok().and_then(|bytes| serde_json::from_slice(&bytes).ok()).unwrap_or(Value::Null);
    if !status.success() || payload["error"].is_string() { return Err(format!("{} (log: {})", payload["error"].as_str().unwrap_or("Map conversion failed; check converter prerequisites"), log_path.display())); }
    if !payload.is_object() { return Err("Converter did not produce a content receipt".into()); }
    Ok(Some(payload))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn imported_files_are_project_scoped_and_existing() {
        let root = std::env::temp_dir().join(format!("mengine-content-{}", uuid::Uuid::new_v4())); fs::create_dir_all(root.join("Assets/Maps")).unwrap(); fs::write(root.join("Assets/Maps/a.js"), "").unwrap();
        assert!(project_file(&root, "Assets/Maps/a.js").is_ok());
        for path in ["Assets/../project.json", "Assets\\Maps\\a.js", "C:/outside.js", "Assets/Maps/missing.js"] { assert!(project_file(&root, path).is_err(), "{path}"); }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn cancelled_queued_completion_is_not_delivered_or_registered() {
        let mut imports = ContentImports::new(None);
        imports.cancelled = Some(Arc::new(AtomicBool::new(true)));
        imports.sender.send(json!({"status":"complete","content":{"scene":"Assets/Map.mscene"}})).unwrap();
        let mut script = ScriptHost::new().unwrap();
        script.eval("var status;function onContentImport(event){status=event.status;}").unwrap();
        let mut scenes = SceneManager::new(None, vec![], true);
        imports.update(&mut script, &mut scenes).unwrap();
        script.eval("if(status!=='cancelled')throw Error('late completion');").unwrap();
        assert!(scenes.build_scenes().is_empty());
    }

    #[cfg(windows)]
    #[test]
    fn background_converter_reports_success_failure_and_cleans_up_on_drop() {
        let root = std::env::temp_dir().join(format!("mengine-import-job-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join("Assets/Maps")).unwrap();
        fs::write(root.join("Assets/Maps/map.mscene"), "{}").unwrap();
        fs::write(root.join("Assets/Maps/map.js"), "var generated=true;").unwrap();
        fs::write(root.join("map.w3x"), "fixture").unwrap();
        fs::write(root.join("convert.ps1"), r#"param($project,$source,$result)
$project=$project.Replace('\\?\','');$result=$result.Replace('\\?\','')
if(Test-Path "$project/delay"){[IO.File]::WriteAllText("$project/started","started");Start-Sleep -Seconds 60}
if(Test-Path "$project/fail"){[IO.File]::WriteAllText($result,'{"error":"unsupported fixture"}');exit 1}
[IO.File]::WriteAllText($result,'{"scene":"Assets/Maps/map.mscene","script":"Assets/Maps/map.js"}')
"#).unwrap();
        fs::write(root.join("project.json"), json!({"contentImporters":{"test":{"program":"powershell.exe","args":["-NoProfile","-File","convert.ps1"],"extensions":["w3x"],"title":"test","workDirectory":"jobs"}}}).to_string()).unwrap();
        let request = ScriptRuntimeRequest::ImportContent { importer: "test".into(), path: Some(root.join("map.w3x").to_string_lossy().into_owned()) };
        for fail in [false, true] {
            if fail { fs::write(root.join("fail"), "").unwrap(); }
            let mut imports = ContentImports::new(Some(root.clone()));
            imports.apply(&request);
            let mut script = ScriptHost::new().unwrap();
            script.eval("var result;function onContentImport(event){result=event;}").unwrap();
            let mut scenes = SceneManager::new(Some(root.clone()), vec![], true);
            let start = std::time::Instant::now();
            while imports.cancelled.is_some() { assert!(start.elapsed().as_secs()<15); imports.update(&mut script, &mut scenes).unwrap(); std::thread::sleep(Duration::from_millis(10)); }
            script.eval(if fail { "if(result.status!=='failed')throw Error('expected failure');" } else { "if(result.status!=='complete'||result.content.scriptSource!=='var generated=true;')throw Error('expected receipt');" }).unwrap();
            assert_eq!(scenes.build_scenes().len(), if fail {0} else {1});
        }
        fs::remove_file(root.join("fail")).unwrap();fs::write(root.join("delay"), "").unwrap();
        let mut imports = ContentImports::new(Some(root.clone()));imports.apply(&request);
        let start = std::time::Instant::now();
        while !root.join("started").exists() { assert!(start.elapsed().as_secs()<15);std::thread::sleep(Duration::from_millis(10)); }
        let start = std::time::Instant::now();drop(imports);assert!(start.elapsed().as_secs()<5);
        fs::remove_dir_all(root).unwrap();
    }
}
