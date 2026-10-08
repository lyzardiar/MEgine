"""Author: MiYu. Retain and convert original Warcraft information-card textures with signed provenance."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT/'samples/frostbound-realms'
DECODER = ROOT/'scripts/import-frost-console.py'
spec = importlib.util.spec_from_file_location('console_decoder', DECODER)
decoder = importlib.util.module_from_spec(spec); spec.loader.exec_module(decoder)


def sha(raw): return hashlib.sha256(raw).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-export', type=Path, help='Initial extract-frost-classic.py export; later runs use retained sources')
    parser.add_argument('--output', type=Path, default=SOURCE)
    args = parser.parse_args(); output = args.output.resolve(); files = {}
    archive_receipt = 'info-panel-source-archives.json'
    if args.source_export:
        manifest = json.loads((args.source_export/'manifest.json').read_bytes())
        assert not manifest['failures']
        origins = dict(source=manifest['source'], precedence=manifest['precedence'], files=manifest['files'])
    else:
        origins = json.loads((SOURCE/archive_receipt).read_bytes())
    records = {r['path'].replace('\\', '/').lower(): r for r in origins['files']}
    skin_path = 'SourceAssets/WarcraftIII/UI/war3skins.txt'
    frame_path = 'SourceAssets/WarcraftIII/UI/FrameDef/UI/InfoPanelUnitDetail.fdf'
    skin = (SOURCE/skin_path).read_bytes()
    icons, aliases, used = {}, {}, set()
    for key, requested in re.findall(r'^(Hero(?:Strength|Agility|Intelligence)Icon|InfoPanelIcon(?:Damage|Armor)\w+)=(.+)$', skin.decode('utf-8'), re.M):
        requested = requested.strip().replace('\\', '/')
        # The installed classic archives name these cards differently from this skin configuration.
        resolved = requested.replace('human-attribute-', 'infocard-heroattributes-').replace('infocard-neutral-armor-hero.blp', 'infocard-armor-hero.blp')
        record = records[resolved.lower()]; relative = record['path'].replace('\\', '/')
        source_path = 'SourceAssets/WarcraftIII/'+relative
        raw = ((args.source_export/'raw'/relative) if args.source_export else (SOURCE/source_path)).read_bytes()
        assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], relative
        assert len(Path(relative).parts) == 5 and not Path(relative).is_absolute(), relative
        pixels = decoder.decode_texture(raw); assert pixels.shape == (64, 64, 4), relative
        sprite = 'Assets/Art/info-panel-'+Path(relative).stem.removeprefix('infocard-')+'.png'
        files[source_path] = raw; files[sprite] = decoder.png(Image.fromarray(pixels))
        icons[key] = sprite; used.add(resolved.lower())
        if requested.lower() != relative.lower(): aliases[key] = dict(requested=requested, source=relative)
    assert used == set(records), 'Export must contain exactly the information-card sources'
    files[archive_receipt] = (json.dumps(origins, ensure_ascii=False, separators=(',', ':'))+'\n').encode()
    files['info-panel-icons.json'] = (json.dumps(dict(author='MiYu', icons=icons, sourceAliases=aliases), ensure_ascii=False, separators=(',', ':'))+'\n').encode()
    files['Assets/Licenses/warcraft-info-panel.txt'] = b'Warcraft III information-card and hero-attribute textures: Blizzard Entertainment. These assets are not CC0 or MIT. Use is subject to the original Warcraft III terms.\nOriginal archive paths, precedence and SHA-256 are recorded in info-panel-source-archives.json. Source aliases are explicit in info-panel-icons.json. Retained BLP files are in SourceAssets/WarcraftIII. Generated PNG and source hashes are in info-panel-sources.json.\nAuthor: MiYu. Conversion: scripts/import-frost-info-panel.py and the paletted BLP1 decoder in scripts/import-frost-console.py.\n'
    receipt_path = output/'info-panel-sources.json'
    old = {r['path']: r['sha256'] for r in json.loads(receipt_path.read_bytes())['files']} if receipt_path.exists() else {}
    for relative, raw in files.items():
        target = output/relative
        if target.exists() and target.read_bytes() != raw: assert sha(target.read_bytes()) == old.get(relative), 'Preserve modified information card: '+relative
    for relative, raw in files.items():
        target = output/relative; target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_bytes() != raw: target.write_bytes(raw)
    generator = 'scripts/import-frost-info-panel.py'
    receipt = dict(author='MiYu', generator=generator, generatorSha256=sha((ROOT/generator).read_bytes()), decoderSha256=sha(DECODER.read_bytes()), sourceConfigHashes={skin_path:sha(skin), frame_path:sha((SOURCE/frame_path).read_bytes())}, files=[dict(path=p, bytes=len(raw), sha256=sha(raw)) for p, raw in sorted(files.items())])
    receipt_path.write_bytes((json.dumps(receipt, ensure_ascii=False, separators=(',', ':'))+'\n').encode())
    print('PASS original information panel:', len(records), 'BLP sources;', len(icons), 'skin bindings;', len(aliases), 'explicit source aliases')


if __name__ == '__main__': main()
