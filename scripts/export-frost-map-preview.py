"""Author: MiYu. Preserve and decode a map's own menu/minimap image for the game catalog."""
import argparse
import hashlib
import importlib
import io
import json
from pathlib import Path
from warcraft_map import load_map
from warcraft_mpq import mpyq, read_archive


def export_preview(source, output):
    data, _ = load_map(source)
    archive = mpyq.MPQArchive(io.BytesIO(Path(source).read_bytes()[data['source']['mpqOffset']:]), listfile=False)
    for name in ['war3mapPreview.tga', 'war3mapMap.blp']:
        try:
            raw = read_archive(archive, name)
        except FileNotFoundError:
            continue
        image = importlib.import_module('convert-warcraft-assets').decode_texture(raw)
        output = Path(output)
        preserved = output.parent / name
        if output.exists() or preserved.exists():
            raise FileExistsError('Preserve existing map preview')
        output.parent.mkdir(parents=True, exist_ok=True)
        image.save(output)
        preserved.write_bytes(raw)
        return dict(member=name, sourceSha256=hashlib.sha256(raw).hexdigest(), pngSha256=hashlib.sha256(output.read_bytes()).hexdigest(), size=list(image.size))
    return None


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    print(json.dumps(export_preview(args.source, args.output)))
