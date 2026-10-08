"""Author: MiYu. Compile the actual standard-library scene walker and its focused Rust tests."""
import pathlib
import os
import subprocess
import tempfile

root=pathlib.Path(__file__).resolve().parents[1]
text=(root/'packages/editor/src-tauri/src/lib.rs').read_text(encoding='utf-8')
start=text.index('fn collect_build_scene_paths(')
walker=text[start:text.index('\nfn no_project()',start)]
tests=[]
for name in ['build_scene_scan_finds_sorted_nested_scene_assets_only','build_scene_scan_tolerates_concurrent_import_metadata_changes']:
 start=text.index('    fn '+name+'(')
 end=text.index('\n    #[test]',start)
 tests.append('#[test]\n'+text[start:end])
with tempfile.TemporaryDirectory(prefix='agent-scene-walk-',dir=root/'tmp') as directory:
 directory=pathlib.Path(directory)
 source=directory/'scene-walk.rs'
 source.write_text('use std::path::Path;\nuse std::time::{SystemTime,UNIX_EPOCH};\n'+walker+'\n'+'\n'.join(tests),encoding='utf-8')
 executable=directory/('scene-walk.exe' if os.name=='nt' else 'scene-walk')
 subprocess.run(['rustc','--edition=2021','--test',str(source),'-o',str(executable)],check=True)
 subprocess.run([str(executable),'--test-threads=1'],check=True)
