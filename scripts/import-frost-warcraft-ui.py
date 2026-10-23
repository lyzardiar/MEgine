"""Author: MiYu. Preserve installed Warcraft UI definitions, typography and menu textures."""
import argparse
import hashlib
import importlib
import io
import json
from pathlib import Path
import re
import struct
import uuid
from PIL import Image
from warcraft_mpq import mpyq, read_archive

ROOT = Path(__file__).resolve().parents[1]
ARCHIVES = ['War3Patch.mpq', 'War3xLocal.mpq', 'War3x.mpq', 'war3.mpq']
SCREENS = ['Glue/MainMenu', 'Glue/SinglePlayerMenu', 'Glue/Skirmish', 'Glue/OptionsMenu', 'Glue/DialogWar3', 'Glue/MapInfoPane', 'Glue/MapListBox', 'Glue/PlayerSlot', 'UI/EscMenuMainPanel', 'UI/EscMenuOptionsPanel', 'UI/ConsoleUI', 'UI/ResourceBar', 'UI/UpperButtonBar', 'UI/InfoPanelUnitDetail']
TEXTURES = ['GlueScreen-Button1-Border', 'GlueScreen-Button1-SmallBorder', 'GlueScreen-Button1-BackdropBackground', 'GlueScreen-Button1-BackdropBackground-Disabled', 'GlueScreen-Button1-BackdropBorder', 'GlueScreen-Button1-BackdropBorder-Down', 'GlueScreen-Button1-BackdropBorder-Disabled', 'GlueScreen-Button1-BackdropBorder-DisabledDown', 'GlueScreen-Button-KeyboardHighlight']
EDGE_SLICES = ['L', 'R', 'T', 'B', 'UL', 'UR', 'BL', 'BR']
BUTTON_STATES = {'Normal': ('', ''), 'Down': ('', '-Down'), 'Disabled': ('-Disabled', '-Disabled'), 'DisabledDown': ('-Disabled', '-DisabledDown')}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def decode_texture(data):
    # BLP1 menu edges use picture type 3; palette and separate alpha planes follow the same layout.
    if data[:4] != b'BLP1' or len(data) < 8 or struct.unpack_from('<I', data, 4)[0] != 1:
        return importlib.import_module('convert-warcraft-assets').decode_texture(data)
    if len(data) < 1180:
        raise ValueError('Truncated BLP1 palette')
    alpha, width, height = struct.unpack_from('<III', data, 8)
    offset = struct.unpack_from('<I', data, 28)[0]
    size = struct.unpack_from('<I', data, 92)[0]
    if alpha not in (0, 1, 4, 8) or not 0 < width <= 16384 or not 0 < height <= 16384:
        raise ValueError('Unsupported BLP1 dimensions or alpha depth')
    count = width * height
    required = count + (count * alpha + 7) // 8
    if offset < 1180 or size < required or offset + size > len(data):
        raise ValueError('Truncated BLP1 mip planes')
    pixels = bytearray(count * 4)
    for i in range(count):
        palette = 156 + data[offset + i] * 4
        a = 255 if alpha == 0 else ((data[offset + count + i * alpha // 8] >> (i * alpha % 8)) & ((1 << alpha) - 1)) * 255 // ((1 << alpha) - 1)
        pixels[i*4:i*4+4] = bytes((data[palette+2], data[palette+1], data[palette], a))
    return Image.frombytes('RGBA', (width, height), bytes(pixels))


def render_backdrop(background, edge, size, corner_px=19, tile_px=38, inset_px=5):
    """Rasterize the original eight-piece Warcraft backdrop with fixed-size corners.

    The inspected 256x32 GlueScreen-Button1 atlas stores L,R,T,B,UL,UR,BL,BR.
    T and B are stored vertically and rotate clockwise into horizontal edges.
    StandardTemplates.fdf specifies corner .016, tile .032 and inset .004.
    Defaults use the 960x720 reference scale (1200 pixels per FDF coordinate).
    """
    width, height = size
    if min(width, height, corner_px, tile_px) <= 0 or max(width, height) > 16384 or inset_px < 0:
        raise ValueError('Invalid backdrop dimensions')
    if edge.width != edge.height * 8:
        raise ValueError('Backdrop edge atlas must contain eight square horizontal slices')
    background, edge = background.convert('RGBA'), edge.convert('RGBA')
    result = Image.new('RGBA', size)
    tile = background.resize((tile_px, tile_px), Image.Resampling.LANCZOS)
    inner_width, inner_height = max(0, width - 2 * inset_px), max(0, height - 2 * inset_px)
    for y in range(0, inner_height, tile_px):
        for x in range(0, inner_width, tile_px):
            result.alpha_composite(tile.crop((0, 0, min(tile_px, inner_width-x), min(tile_px, inner_height-y))), (inset_px+x, inset_px+y))
    # Small controls keep the corner sampling; only rectangles too small for two corners scale it down.
    corner = min(corner_px, max(1, (width+1)//2), max(1, (height+1)//2))
    parts = {}
    for i, name in enumerate(EDGE_SLICES):
        part = edge.crop((i*edge.height, 0, (i+1)*edge.height, edge.height))
        if name in ('T', 'B'):
            part = part.transpose(Image.Transpose.ROTATE_270)
        parts[name] = part.resize((corner, corner), Image.Resampling.LANCZOS)

    def repeat(name, rect):
        x, y, w, h = rect
        if w <= 0 or h <= 0:
            return
        part = parts[name]
        for dy in range(0, h, corner):
            for dx in range(0, w, corner):
                result.alpha_composite(part.crop((0, 0, min(corner, w-dx), min(corner, h-dy))), (x+dx, y+dy))

    repeat('L', (0, corner, corner, height-2*corner))
    repeat('R', (width-corner, corner, corner, height-2*corner))
    repeat('T', (corner, 0, width-2*corner, corner))
    repeat('B', (corner, height-corner, width-2*corner, corner))
    for name, x, y in [('UL', 0, 0), ('UR', width-corner, 0), ('BL', 0, height-corner), ('BR', width-corner, height-corner)]:
        result.alpha_composite(parts[name], (x, y))
    return result


def button_size(value):
    match = re.fullmatch(r'(\d+)x(\d+)', value)
    if not match or min(map(int, match.groups())) <= 0 or max(map(int, match.groups())) > 16384:
        raise argparse.ArgumentTypeError('Button size must be WIDTHxHEIGHT with dimensions in 1..16384')
    return tuple(map(int, match.groups()))


def skin_values(text, race):
    sections, section = {}, None
    for line in text.splitlines():
        line = line.strip()
        if line.startswith('[') and line.endswith(']'):
            section = sections.setdefault(line[1:-1], {})
        elif section is not None and '=' in line and not line.startswith('//'):
            key, value = line.split('=', 1); section[key.strip()] = value.strip()
    return {**sections.get('Default', {}), **sections.get(race, {})}


def run(game, output, button_sizes=None):
    archives = [(name, mpyq.MPQArchive(str(game / name), listfile=False)) for name in ARCHIVES]
    files, sources, textures, decoded, buttons = {}, {}, {}, {}, {}
    previous = output / 'warcraft-ui-sources.json'
    old = {r['path']: r['sha256'] for r in json.loads(previous.read_bytes())['files']} if previous.is_file() else {}

    def read(relative):
        relative = Path(*relative.replace('\\', '/').split('/')).as_posix()
        if relative.startswith('/') or '..' in relative.split('/') or ':' in relative:
            raise ValueError('Unsafe UI source: ' + relative)
        key = relative.lower()
        if key in sources:
            return files[sources[key]['preserved']]
        for name, archive in archives:
            try:
                data = read_archive(archive, relative.replace('/', '\\'))
            except FileNotFoundError:
                continue
            preserved = 'SourceAssets/WarcraftUI/' + relative
            files[preserved] = data
            sources[key] = dict(path=relative, archive=name, sha256=digest(data), bytes=len(data), preserved=preserved)
            return data
        raise FileNotFoundError(relative)

    def definition(relative):
        key = relative.replace('\\', '/').lower()
        if key in sources:
            return
        text = read(relative).decode('utf-8-sig')
        for include in re.findall(r'IncludeFile\s+"([^"]+)"', re.sub(r'//[^\n]*', '', text)):
            definition(include)

    def asset(relative, data, kind):
        files[relative] = data
        files[relative + '.meta'] = (json.dumps(dict(schemaVersion=1, guid=str(uuid.uuid5(uuid.NAMESPACE_URL, 'mengine/warcraft-ui/' + relative)), importer=kind), indent=2) + '\n').encode()

    def texture(name, source):
        source = source.replace('\\', '/')
        image = decode_texture(read(source)); stream = io.BytesIO(); image.save(stream, format='PNG')
        target = 'Assets/WarcraftUI/Textures/' + name + '.png'
        asset(target, stream.getvalue(), 'texture'); textures[name] = dict(path=target, source=source, size=list(image.size))
        decoded[name] = image

    def backdrop(name, background, edge, size, corner=19, tile=38, inset=5, sliced=False):
        image = render_backdrop(decoded[background], decoded[edge], size, corner, tile, inset)
        stream = io.BytesIO(); image.save(stream, format='PNG')
        target = 'Assets/WarcraftUI/Textures/' + name + '.png'
        asset(target, stream.getvalue(), 'texture')
        info = dict(path=target, size=list(size), sha256=digest(stream.getvalue()), rasterCorner=corner, rasterTile=tile, rasterInset=inset, sources=[dict(path=textures[key]['source'], sha256=sources[textures[key]['source'].lower()]['sha256']) for key in (background, edge)])
        if sliced:
            info['sprite'] = dict(border=[corner]*4, source_size=list(size), pixels_per_unit=1, image_type='Sliced', centerBehavior='Stretch; original FDF tiles the background and edges')
        return info

    try:
        for screen in SCREENS:
            definition('UI/FrameDef/' + screen + '.fdf')
        skins = read('UI/war3skins.txt').decode('utf-8-sig')
        read('UI/WorldEditStrings.txt')
        read('UI/FrameDef/GlobalStrings.fdf')
        font = re.search(r'^MasterFont=(.+)$', skins, re.M).group(1).strip()
        asset('Assets/Fonts/Warcraft-Master.ttf', read(font), 'font')
        for name, source in [(name, 'UI/Widgets/Glues/' + name + '.blp') for name in TEXTURES] + [('ButtonMouseHighlight', 'UI/Widgets/BattleNet/bnet-button01-highlight-mouse.blp')]:
            texture(name, source)
        for size in dict.fromkeys([(215, 37), (256, 64)] + list(button_sizes or [])):
            for state, (background_suffix, edge_suffix) in BUTTON_STATES.items():
                background = 'GlueScreen-Button1-BackdropBackground' + background_suffix
                edge = 'GlueScreen-Button1-BackdropBorder' + edge_suffix
                name = f'StandardButton-{state}-{size[0]}x{size[1]}'
                buttons[name] = backdrop(name, background, edge, size, sliced=size == (256, 64))
                buttons[name]['state'] = state
        human = skin_values(skins, 'Human')
        esc_keys = ['EscMenuBackground', 'EscMenuBorder', 'EscMenuButtonMouseOverHighlight']
        for suffix in ('', 'Pushed', 'Disabled', 'DisabledPushed'):
            esc_keys += ['EscMenuButton'+suffix+'Background', 'EscMenuButton'+suffix+'Border']
        for key in esc_keys:
            texture('Human-'+key, human[key])
        esc_images = {}
        for state, suffix in [('Normal', ''), ('Down', 'Pushed'), ('Disabled', 'Disabled'), ('DisabledDown', 'DisabledPushed')]:
            name = 'EscButton-'+state+'-256x64'
            esc_images[name] = backdrop(name, 'Human-EscMenuButton'+suffix+'Background', 'Human-EscMenuButton'+suffix+'Border', (256, 64), 15, 307, 6, True)
            esc_images[name]['state'] = state
        esc_images['EscPanel-Normal-346x461'] = backdrop('EscPanel-Normal-346x461', 'Human-EscMenuBackground', 'Human-EscMenuBorder', (346, 461), 58, 307, 12, True)
        manifest = dict(author='MiYu', game=str(game.resolve()), precedence=ARCHIVES, gameDllSha256=digest((game/'Game.dll').read_bytes()), generator='scripts/import-frost-warcraft-ui.py', generatorSha256=digest(Path(__file__).read_bytes()), sourceCoordinateSize=[.8,.6], font=dict(path='Assets/Fonts/Warcraft-Master.ttf',source=font), textures=textures, sources=list(sources.values()))
        manifest['buttonBackdrops'] = dict(definition='UI/FrameDef/Glue/StandardTemplates.fdf', referenceCanvas=[960, 720], standardSize=[.179, .031], cornerSize=.016, backgroundSize=.032, backgroundInsets=[.004]*4, rasterCorner=19, rasterTile=38, rasterInset=5, edgeSlices=[dict(name=name, rect=[i*32, 0, 32, 32], clockwiseDegrees=90 if name in ('T', 'B') else 0) for i, name in enumerate(EDGE_SLICES)], images=buttons)
        manifest['escBackdrops'] = dict(race='Human', skinSource='UI/war3skins.txt', resolvedSkin={key:human[key] for key in esc_keys}, buttonDefinition='UI/FrameDef/UI/EscMenuTemplates.fdf', panelDefinition='UI/FrameDef/UI/EscMenuMainPanel.fdf', referenceCanvas=[960,720], buttonCornerSize=.0125, panelCornerSize=.048, backgroundSize=.256, buttonBackgroundInsets=[.005]*4, panelBackgroundInsets=[.01]*4, images=esc_images)
        for relative, data in files.items():
            target = output / relative
            if target.exists() and target.read_bytes() != data and digest(target.read_bytes()) != old.get(relative):
                raise ValueError('Preserve modified UI asset: ' + str(target))
        for relative, data in files.items():
            target = output / relative; target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists() or target.read_bytes() != data:
                target.write_bytes(data)
        manifest['files'] = [dict(path=name, sha256=digest(data), bytes=len(data)) for name, data in files.items()]
        previous.write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
        print(json.dumps(dict(sources=len(sources), textures=len(textures), buttons=len(buttons), escBackdrops=len(esc_images), font=font, receipt=str(previous)), ensure_ascii=False))
    finally:
        for _, archive in archives:
            archive.file.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--game', type=Path, default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    parser.add_argument('--output', type=Path, default=ROOT/'samples/frostbound-realms')
    parser.add_argument('--button-size', type=button_size, action='append', help='Additional fixed-corner button raster WIDTHxHEIGHT at the 960x720 reference scale; repeat as needed')
    args = parser.parse_args(); run(args.game, args.output, args.button_size)
