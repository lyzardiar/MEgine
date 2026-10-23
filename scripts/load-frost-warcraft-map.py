"""Author: MiYu. Load a real .w3m/.w3x into a reproducible MEngine map test project."""
import argparse
from datetime import datetime
import importlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('map', type=Path, help='Original Warcraft III .w3m/.w3x file; read-only')
    parser.add_argument('--game', type=Path, default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    parser.add_argument('--output', type=Path, help='New folder containing source export and the Editor project')
    parser.add_argument('--animation-seed', type=int, default=1, help='Reproducible initial Stand choices')
    parser.add_argument('--base-project', type=Path, help='Reuse an existing terrain/doodad project from this map')
    args = parser.parse_args()
    source = args.map.resolve()
    if source.suffix.lower() not in ('.w3m', '.w3x') or not source.is_file():
        parser.error('Provide an existing .w3m or .w3x map file')
    name = re.sub(r'[^\w-]', '-', source.stem)
    output = (args.output or ROOT/'tmp/docs-artifacts/warcraft-map-tests'/f'{name}-{datetime.now():%Y%m%d-%H%M%S-%f}').resolve()
    output.mkdir(parents=True, exist_ok=False)
    exported = output/'source-map'
    data = importlib.import_module('import-frost-original-map').export_map(source, exported)
    project = output/'project'
    base_project = args.base_project or output/'doodad-project'
    if not args.base_project:
        importlib.import_module('build-frost-original-doodads').build(exported, args.game, base_project,
            ROOT/'tmp/warcraft-effects/sentinel-bin/MdxExport.dll', ROOT/'tmp/warcraft-effects/node-metadata/NodeMetadata.dll', args.animation_seed)
    result = importlib.import_module('build-frost-original-units').build(exported, base_project, args.game, project,
        ROOT/'tmp/warcraft-effects/farseer-bin/MdxExport.dll', ROOT/'tmp/warcraft-effects/node-metadata/NodeMetadata.dll')
    entities = len(json.loads((project/'Assets/Scenes/Main.mscene').read_bytes())['world']['entities'])
    print(json.dumps(dict(project=str(project), source=str(source), sourceSha256=data['source']['sha256'],
        doodadPlacements=len(data['doodads']['doodads']) if data['doodads'] else 0, editorUnitPlacements=result['placements'], renderedUnitPlacements=result['rendered'], entities=entities, gameplay=False,
        validationCommand=f'node scripts/qa-frost-original-units.mjs "{project}"'), ensure_ascii=False))


if __name__ == '__main__':
    main()
