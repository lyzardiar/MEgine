"""Author: MiYu. Resolve the installed Warcraft OptionsMenu FDF panel layout without manual offsets."""
import argparse
from dataclasses import dataclass, field
import hashlib
import json
from pathlib import Path
import re
from PIL import ImageFont, __version__ as pillow_version

ROOT = Path(__file__).resolve().parents[1]
SCALE = 1200
POINTS = {'TOPLEFT': (0, 0), 'TOP': (.5, 0), 'TOPRIGHT': (1, 0), 'LEFT': (0, .5), 'CENTER': (.5, .5), 'RIGHT': (1, .5), 'BOTTOMLEFT': (0, 1), 'BOTTOM': (.5, 1), 'BOTTOMRIGHT': (1, 1)}
PANELS = {'gameplay': 'GameplayPanel', 'video': 'VideoPanel', 'sound': 'SoundPanel'}
VISIBLE = {'TEXT', 'GLUECHECKBOX', 'CHECKBOX', 'SLIDER', 'BACKDROP', 'POPUPMENU', 'GLUEPOPUPMENU', 'EDITBOX', 'GLUEEDITBOX'}
TOKEN = re.compile(r'//[^\n]*|/\*.*?\*/|"(?:\\.|[^"\\])*"|[{},]|\n|[^\s{},"]+', re.S)


def atom(value):
    if value.startswith('"'):
        return value[1:-1].replace('\\"', '"')
    if re.fullmatch(r'-?(?:\d+(?:\.\d*)?|\.\d+)f?', value):
        return float(value.rstrip('f'))
    return value


def tokens(text):
    line, end = 1, 0
    result = []
    for match in TOKEN.finditer(text):
        line += text[end:match.start()].count('\n')
        value = match.group()
        if not value.startswith(('//', '/*')):
            result.append((value, line))
        line += value.count('\n'); end = match.end()
    return result


@dataclass
class Frame:
    name: str
    type: str
    source: str
    line: int
    template: str = None
    with_children: bool = False
    parent: object = None
    properties: dict = field(default_factory=dict)
    children: list = field(default_factory=list)


def parse_frames(text, source):
    stream, position, roots = tokens(text), 0, []

    def frame(parent=None):
        nonlocal position
        line = stream[position][1]
        kind, name = (atom(stream[position+i][0]) for i in (1, 2)); position += 3
        node = Frame(name, kind, source, line, parent=parent)
        header = []
        while stream[position][0] != '{':
            if stream[position][0] != '\n':
                header.append(atom(stream[position][0]))
            position += 1
        if header:
            if header[0] != 'INHERITS':
                raise ValueError('Unsupported Frame header: ' + str(header))
            node.template = header[-1]; node.with_children = 'WITHCHILDREN' in header
        position += 1
        while position < len(stream):
            key = stream[position][0]
            if key in ('\n', ','):
                position += 1; continue
            if key == '}':
                position += 1; return node
            if key == 'Frame':
                node.children.append(frame(node)); continue
            position += 1; values = []
            while position < len(stream) and stream[position][0] not in ('\n', '}'):
                value = stream[position][0]
                if value == '{':
                    raise ValueError('Unsupported property block: ' + key)
                if value != ',':
                    values.append(atom(value))
                position += 1
            node.properties.setdefault(key, []).append(values)
        raise ValueError('Unclosed Frame: ' + node.name)

    while position < len(stream):
        if stream[position][0] == 'Frame':
            roots.append(frame())
        else:
            position += 1
    return roots


def walk(node):
    yield node
    for child in node.children:
        yield from walk(child)


def strings(text):
    values = {}
    for line in text.splitlines():
        items = [atom(value) for value, _ in tokens(line) if value not in (',', '\n')]
        if len(items) == 2 and re.fullmatch(r'[A-Z][A-Z0-9_]*', str(items[0])):
            values[items[0]] = items[1]
    return values


def point(rect, name):
    fraction = POINTS[name]
    return [rect[i] + fraction[i]*rect[i+2] for i in range(2)]


def place(size, anchors, lookup):
    if not anchors:
        raise ValueError('No SetPoint for visible frame')
    equations = [[], []]
    for own, relative, target, dx, dy in anchors:
        base = point(lookup(relative), target)
        for axis, offset in enumerate((dx*SCALE, -dy*SCALE)):
            equations[axis].append((POINTS[own][axis], base[axis]+offset))
    result = [None, None, *size]
    for axis in range(2):
        pairs = equations[axis]
        if result[axis+2] is None:
            other = next((entry for entry in pairs[1:] if entry[0] != pairs[0][0]), None)
            if other is None:
                raise ValueError('Insufficient dimensions/anchors on axis ' + str(axis))
            result[axis+2] = (other[1]-pairs[0][1])/(other[0]-pairs[0][0])
        result[axis] = pairs[0][1] - pairs[0][0]*result[axis+2]
        if any(abs(result[axis]+fraction*result[axis+2]-value) > 1e-6 for fraction, value in pairs):
            raise ValueError('Conflicting SetPoint constraints')
    if min(result[2:]) < 0:
        raise ValueError('Negative resolved dimensions')
    return result


def extract(project):
    base = 'SourceAssets/WarcraftUI/UI/FrameDef/'
    paths = [base+'Glue/StandardTemplates.fdf', base+'Glue/OptionsMenu.fdf', base+'GlobalStrings.fdf', 'Assets/Fonts/Warcraft-Master.ttf']
    data = {name:(project/name).read_bytes() for name in paths}
    standard, options = [parse_frames(data[name].decode('utf-8-sig'), name) for name in paths[:2]]
    dictionary = strings(data[paths[2]].decode('utf-8-sig'))
    templates = {node.name:node for node in standard+options}
    option_nodes = {node.name:node for root in options for node in walk(root)}
    resolved, measured, properties, chains, fonts = {}, {}, {}, {}, {}
    unresolved = []

    def effective(node, stack=()):
        key = id(node)
        if key in properties:
            return properties[key]
        if key in stack:
            raise ValueError('Cyclic template: ' + node.name)
        values, chain = {}, []
        if node.template:
            template = templates[node.template]
            values.update(effective(template, stack+(key,)))
            chain = [node.template] + chains[id(template)]
        values.update(node.properties); properties[key] = values; chains[key] = chain
        return values

    def first(props, key, fallback=None):
        return props[key][-1] if key in props else fallback

    def font_style(node):
        props = effective(node)
        value = first(props, 'FrameFont')
        if value:
            return value, node.name
        if node.type in ('POPUPMENU', 'GLUEPOPUPMENU'):
            title = first(props, 'PopupTitleFrame')
            if title:
                for name in [node.name] + chains[id(node)]:
                    source = node if name == node.name else templates[name]
                    child = next((child for child in source.children if child.name == title[0]), None)
                    if child:
                        style = first(effective(child), 'FrameFont')
                        if style:
                            return style, child.template or child.name
        return font_style(node.parent) if node.parent else (None, None)

    def text_value(node):
        key = first(effective(node), 'Text', [''])[0]
        if key in dictionary:
            return key, dictionary[key]
        if re.fullmatch(r'[A-Z][A-Z0-9_]+', key):
            raise ValueError('Missing GlobalStrings entry: ' + key)
        return None, key

    def measure(node):
        if node.name in measured:
            return measured[node.name]
        props = effective(node)
        size = [first(props, key, [None])[0] for key in ('Width', 'Height')]
        size = [value*SCALE if value is not None else None for value in size]
        info = {'width': 'FDF Width' if size[0] is not None else None, 'height': 'FDF Height' if size[1] is not None else None}
        if node.type == 'TEXT' and None in size:
            style, source = font_style(node)
            if not style or style[0] != 'MasterFont':
                raise ValueError('Unsupported text font: ' + str(style))
            font_size = style[1]*SCALE; pixel_size = round(font_size*64)
            font = fonts.setdefault(pixel_size, ImageFont.truetype(str(project/paths[3]), pixel_size))
            _, text = text_value(node)
            text = re.sub(r'\|c[0-9a-f]{8}|\|r', '', text.replace('|n', '\n'), flags=re.I)
            lines = text.split('\n'); ascent, descent = font.getmetrics()
            if size[0] is None:
                size[0] = max(font.getlength(line) for line in lines)/64; info['width'] = 'Pillow getlength at 64x template font size'
            if size[1] is None:
                size[1] = (ascent+descent)/64*len(lines); info['height'] = 'Pillow (ascent + descent) per line at 64x template font size'
            info.update(fontSource=source, nominalFontHeight=font_size, ascent=ascent/64, descent=descent/64, lines=len(lines))
        measured[node.name] = (size, info)
        return size, info

    def resolve(name, stack=()):
        if name in resolved:
            return resolved[name]
        if name in stack:
            raise ValueError('Cyclic SetPoint: ' + name)
        node = option_nodes[name]; props = effective(node)
        if name == 'OptionsMenu' and 'SetAllPoints' in props:
            value = [0, 0, 960, 720]
        elif 'SetAllPoints' in props:
            value = resolve(node.parent.name, stack+(name,))
        else:
            size, _ = measure(node)
            value = place(size, props.get('SetPoint', []), lambda other: resolve(other, stack+(name,)))
        resolved[name] = value
        return value

    pages = {}
    for page, panel in PANELS.items():
        records = []

        def visible(node):
            if node.type == 'MENU':
                return
            if node.type in VISIBLE:
                yield node
            for child in node.children:
                yield from visible(child)

        for node in visible(option_nodes[panel]):
            props = effective(node)
            try:
                box = resolve(node.name); _, measurement = measure(node)
                style, font_source = font_style(node); key, text = text_value(node)
                anchors = [dict(point=a[0], relative=a[1], relativePoint=a[2], offset=a[3:]) for a in props.get('SetPoint', [])]
                record = dict(name=node.name, type=node.type, text=text, textKey=key, fontSize=style[1]*SCALE if style else None, color=first(props,'FontColor'), rect=[round(box[0]+box[2]/2-480,6),round(box[1]+box[3]/2-360,6),round(box[2],6),round(box[3],6)], template=node.template, templateChain=chains[id(node)], anchors=anchors, source=dict(path=node.source,line=node.line), measurement=measurement, fontSource=font_source, parent=node.parent.name)
                record['alignment'] = dict(horizontal=first(props,'FontJustificationH',[None])[0],vertical=first(props,'FontJustificationV',[None])[0])
                if node.type == 'SLIDER':
                    record['range'] = [first(props,'SliderMinValue')[0],first(props,'SliderMaxValue')[0]]
                    record['step'] = first(props,'SliderStepSize')[0]; record['initialValue'] = first(props,'SliderInitialValue')[0]
                if node.type in ('POPUPMENU','GLUEPOPUPMENU'):
                    menu_name = first(props,'PopupMenuFrame')[0]; menu = option_nodes[menu_name]
                    items = effective(menu).get('MenuItem', [])
                    record['menuItems'] = [dict(textKey=item[0],text=dictionary.get(item[0],item[0]),value=item[1]) for item in items]
                    record['menuItemsSource'] = 'FDF' if items else 'Runtime supplied; no MenuItem entries in FDF'
                if node.type == 'TEXT':
                    record['associatedControls'] = [a['relative'] for a in anchors if option_nodes[a['relative']].type in ('GLUECHECKBOX','CHECKBOX','SLIDER','POPUPMENU','GLUEPOPUPMENU','EDITBOX','GLUEEDITBOX')]
                records.append(record)
            except (ValueError, KeyError) as error:
                unresolved.append(dict(name=node.name, source=dict(path=node.source,line=node.line), reason=str(error)))
        pages[page] = records
    return dict(schemaVersion=1, referenceCanvas=[960,720], coordinateSystem='center origin; +x right; +y down; rect=[centerX,centerY,width,height]', sourceCoordinateSize=[.8,.6], scale=SCALE, generator='scripts/extract-frost-warcraft-options.py', generatorSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), sources=[dict(path=name,sha256=hashlib.sha256(content).hexdigest()) for name,content in data.items()], textMetrics=dict(engine='Pillow '+pillow_version, font=paths[3], supersampling=64, autoWidth='getlength', autoHeight='(ascent + descent) * line count'), pages=pages, unresolved=unresolved, limitations=['Unspecified text dimensions use Pillow metrics from the preserved MasterFont TTF at the inherited FDF font size; Warcraft native font rasterization, glyph spacing, baseline and line-box rules have not been measured.', 'SetPoint offsets and explicit dimensions are evaluated directly without layout adjustments; text measurement differences propagate through dependent anchors.', 'Only explicitly declared panel controls are emitted; inherited control internals and popup MENU frames are not separate visible records.', 'Dynamic dropdown selections and runtime-populated item lists are not present in FDF and remain empty; no resolution/provider choices are invented.', 'Null color means no FontColor on the frame/template chain; it is not an inferred native default.'])


def self_test():
    tree = parse_frames('/* { */\nFrame "TEXT" "Base" {\n Width 0.2,\n}\nFrame "FRAME" "Root" {\n Frame "TEXT" "Child" INHERITS WITHCHILDREN "Base" {\n Text "quoted { text}",\n SetPoint TOPLEFT,"Root",BOTTOMRIGHT,0.01,-0.02,\n }\n}', 'fixture')
    assert tree[1].children[0].template == 'Base' and tree[1].children[0].with_children
    assert tree[1].children[0].properties['Text'][0] == ['quoted { text}']
    assert strings('LOW "低",\n// HIGH "ignored",\nHIGH "高",') == {'LOW':'低','HIGH':'高'}
    assert place([24,12],[['TOPLEFT','Root','BOTTOMRIGHT',.01,-.02]],lambda _: [10,20,100,50]) == [122,94,24,12]
    assert place([None,None],[['TOPLEFT','Root','TOPLEFT',0,0],['BOTTOMRIGHT','Root','BOTTOMRIGHT',0,0]],lambda _:[0,0,960,720]) == [0,0,960,720]
    try:
        place([10,10],[['TOPLEFT','Root','TOPLEFT',0,0],['BOTTOMRIGHT','Root','BOTTOMRIGHT',0,0]],lambda _:[0,0,960,720])
    except ValueError:
        pass
    else:
        raise AssertionError('Conflicting constraints were accepted')
    print('6 focused parser/anchor checks passed')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', type=Path, default=ROOT/'samples/frostbound-realms')
    parser.add_argument('--output', type=Path)
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        self_test()
    else:
        result = extract(args.project); target = args.output or args.project/'warcraft-options-layout.json'
        target.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(json.dumps(dict(output=str(target),pages={key:len(value) for key,value in result['pages'].items()},unresolved=result['unresolved']),ensure_ascii=False))
        raise SystemExit(1 if result['unresolved'] else 0)
