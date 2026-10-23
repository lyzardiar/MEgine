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
    result = importlib.import_module('build-frost-original-doodads').build(exported, args.game, project,
        ROOT/'tmp/warcraft-effects/sentinel-bin/MdxExport.dll', ROOT/'tmp/warcraft-effects/node-metadata/NodeMetadata.dll')
    print(json.dumps(dict(project=str(project), source=str(source), sourceSha256=data['source']['sha256'],
        placements=result['placements'], entities=result['entities'], gameplay=False,
        validationCommand=f'node scripts/qa-frost-original-doodads.mjs "{project}" --visual-only'), ensure_ascii=False))


if __name__ == '__main__':
    main()
