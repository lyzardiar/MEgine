"""Author: MiYu. Prepare pinned model converters used by the game's map importer."""
import importlib
import shutil
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]

if __name__ == '__main__':
    converter = importlib.import_module('convert-warcraft-assets')
    sampler, _, _ = converter.sampler()
    destination = ROOT / 'tmp/warcraft-effects/sentinel-bin'
    destination.mkdir(parents=True, exist_ok=True)
    for source in sampler.parent.iterdir():
        if source.is_file():
            shutil.copyfile(source, destination / source.name)
    core = ROOT / 'tmp/warcraft-converter' / converter.COMMIT / 'upstream/src/Wc3ModelViewer.Core'
    subprocess.run(['dotnet', 'build', str(ROOT / 'scripts/warcraft-node-metadata/NodeMetadata.csproj'), '-p:Wc3Core=' + str(core), '-o', str(ROOT / 'tmp/warcraft-effects/node-metadata'), '--nologo', '--verbosity', 'quiet'], check=True)
    print('Warcraft map import tools are ready.')
