"""Author: MiYu. Bind converted Warcraft models and sampled material states to the RTS catalog."""
import argparse
import os
import subprocess
import hashlib
import json
import pathlib
import shutil
import struct

ROOT = pathlib.Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
LIBRARY = ROOT / 'asset-library/warcraft-iii'
UNITS = {
    'RealWorker': 'peasant', 'ClassicPeon': 'peon', 'ClassicWisp': 'Wisp', 'RealFootman': 'Footman',
    'RealOrc': 'grunt', 'ClassicHeadhunter': 'Headhunter', 'RealRifleman': 'Rifleman', 'RealArcher': 'Archer',
    'RealKnight': 'Knight', 'RealPaladin': 'HeroPaladin', 'RealGhoul': 'Ghoul', 'RealAcolyte': 'Acolyte',
    'RealAbomination': 'Abomination', 'RealNecromancer': 'Necromancer', 'RealShaman': 'Shaman',
    'RealBoneArcher': 'SkeletonArcher', 'RealSkeletonWarrior': 'Skeleton', 'RealSkeletonMage': 'SkeletonMage',
    'RealTreant': 'Ent', 'ClassicHuntress': 'Huntress', 'ClassicDruid': 'DruidoftheClaw',
    'RealFrostWarden': 'HeroArchMage', 'RealEmberSage': 'HeroBloodElf', 'RealSylvanRanger': 'HeroMoonPriestess',
    'RealDawnPaladin': 'HeroPaladin', 'RealWolf': 'DireWolf', 'RealBear': 'PolarBear',
    'RealCatapult': 'Catapult', 'ClassicMeatwagon': 'Meatwagon', 'ClassicMortarTeam': 'MortarTeam',
    'ClassicGryphon': 'GryphonRider', 'ClassicWyvern': 'WyvernRider', 'ClassicChimaera': 'Chimaera',
    'ClassicFrostWyrm': 'FrostWyrm',
}
BUILDINGS = {
    'Kingdom': ['TownHall', 'HumanBarracks', 'Farm', 'HumanTower', 'AltarOfKings', 'Workshop', 'ArcaneVault'],
    'Warclans': ['GreatHall', 'OrcBarracks', 'TrollBurrow', 'WatchTower', 'AltarofStorms', 'WarMill', 'VoodooLounge'],
    'Wildwood': ['TreeofLife', 'AncientofWar', 'MoonWell', 'AncientProtector', 'AltarofElders', 'HuntersHall', 'AncientOfWonder'],
    'Revenant': ['Necropolis', 'Crypt', 'Ziggurat', 'Ziggurat', 'AltarOfDarkness', 'SlaughterHouse', 'TombOfRelics'],
}

def load(path):
    return json.loads(path.read_text(encoding='utf-8'))

def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = (json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')
    if not path.exists() or path.read_bytes() != raw:
        path.write_bytes(raw)

def digest(data):
    return hashlib.sha256(data).hexdigest()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--pose-probe', default=os.environ.get('MENGINE_POSE_PROBE_EXECUTABLE'))
    args = parser.parse_args()
    assert args.pose_probe and pathlib.Path(args.pose_probe).is_file(), 'Pass --pose-probe with the current gltf_bounds executable (cargo build --release -p mengine-assets --example gltf_bounds)'
    catalog_path = SAMPLE / 'model-catalog.json'
    catalog = load(catalog_path)
    previous = SAMPLE / 'classic-sources.json'
    old = {x['path'].lower(): x['sha256'] for x in load(previous).get('files', [])} if previous.exists() else {}
    files, sources = {}, []
    libraries = {key: LIBRARY / key for key in ['game-ready', 'community-ready', 'remaining-ready']}
    models = {key: {m['id'].lower(): m for m in load(root / 'Assets/WarcraftIII/model-catalog.json')['models']} for key, root in libraries.items()}

    def copy(pack, relative):
        source = libraries[pack] / relative
        raw = source.read_bytes()
        target = SAMPLE / relative
        if target.exists() and target.read_bytes() != raw:
            assert old.get(relative.lower()) == digest(target.read_bytes()), f'Preserve modified asset: {target}'
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_bytes() != raw:
            shutil.copyfile(source, target)
        files[relative] = dict(path=relative, sha256=digest(raw), bytes=len(raw))
        sidecar = source.with_name(source.name + '.meta')
        if sidecar.exists():
            meta = relative + '.meta'
            data = sidecar.read_bytes()
            destination = SAMPLE / meta
            if destination.exists() and destination.read_bytes() != data:
                assert old.get(meta.lower()) == digest(destination.read_bytes()), f'Preserve modified sidecar: {destination}'
            if not destination.exists() or destination.read_bytes() != data:
                shutil.copyfile(sidecar, destination)
            files[meta] = dict(path=meta, sha256=digest(data), bytes=len(data))

    def bind(key, identifier, pack='game-ready', tier=1, building=False, environment=False):
        root = libraries[pack]
        model = models[pack][identifier.lower()]
        tracks = load(root / model['stateTracks'])
        parts = []
        for part in model['parts']:
            p = dict(part, mesh=part['animatedMesh'] if model['clips'] else part['mesh'], pivot=[0, 0, 0])
            for path in {part['mesh'], part['animatedMesh']}:
                copy(pack, path)
            materials = {part['material'], *part['teamMaterials'].values(), *part['textureMaterials'].values()}
            for path in materials:
                copy(pack, path)
                material = load(root / path)
                for slot in ['base_color_texture', 'normal_texture', 'metallic_roughness_texture', 'occlusion_texture', 'emissive_texture']:
                    if material.get(slot):
                        copy(pack, material[slot])
            p['states'] = []
            for clip in tracks['clips']:
                runs = []
                last = None
                for frame, state in enumerate(clip['frames']):
                    geo = state['geosets'][part['geoset']]
                    layer = state['materials'][part['materialIndex']][part['layer']]
                    value = [*geo['color'], geo['alpha'] * layer['alpha'], layer['texture']]
                    if value != last:
                        runs.append([frame, *value])
                        last = value
                p['states'].append(runs)
            # Placement keeps each layer's texture, lighting and culling state.
            placement = load(root / part['material'])
            placement.update(surface='transparent', transparent_depth_write=False, render_queue=4000 + part['layer'])
            if placement['blend_mode'] not in ('additive', 'multiply'):
                placement['blend_mode'] = 'alpha'
            placement_path = 'Assets/WarcraftIII/Materials/Placement/' + digest(part['material'].encode())[:20] + '.mmat'
            destination = SAMPLE / placement_path
            candidate = (json.dumps(placement, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')
            if destination.exists() and destination.read_bytes() != candidate:
                assert old.get(placement_path.lower()) == digest(destination.read_bytes()), f'Preserve modified placement material: {destination}'
            write(destination, placement)
            raw = (SAMPLE / placement_path).read_bytes()
            files[placement_path] = dict(path=placement_path, sha256=digest(raw), bytes=len(raw))
            p['placementMaterial'] = placement_path
            parts.append(p)
        boxes = []
        for p in model['parts']:
            if not p['defaultVisible'] or p['sourceFlags'] & 1:
                continue
            raw = (root / p['mesh']).read_bytes()
            document = json.loads(raw[20:20 + struct.unpack_from('<I', raw, 12)[0]])
            bounds = document['accessors'][document['meshes'][0]['primitives'][0]['attributes']['POSITION']]
            boxes.append(bounds)
        if not boxes:
            for p in model['parts'][:1]:
                raw = (root / p['mesh']).read_bytes()
                document = json.loads(raw[20:20 + struct.unpack_from('<I', raw, 12)[0]])
                boxes.append(document['accessors'][document['meshes'][0]['primitives'][0]['attributes']['POSITION']])
        minimum = [min(b['min'][i] for b in boxes) for i in range(3)]
        maximum = [max(b['max'][i] for b in boxes) for i in range(3)]
        size = [max(.01, maximum[i] - minimum[i]) for i in range(3)]
        entry = dict(material=parts[0]['material'], parts=parts, size=size, bounds=dict(min=minimum, max=maximum), realistic=True, classic=True,
                     classicTier=tier, classicYaw=0 if building or environment else -1.5707963267948966,
                     sourcePack=pack, sourceModel=model['source'], animations=[dict(name=c['name'], frames=c['frameCount'], duration=c['duration'], loop=c['loop']) for c in model['clips']])
        if not building and not environment:
            entry['worldHeight'] = 3.74 if key in ['RealFrostWarden', 'RealEmberSage', 'RealSylvanRanger', 'RealDawnPaladin'] else 4.4 if key == 'RealKnight' else 4.8 if key == 'RealTreant' else 2.125 if key == 'RealGhoul' else 2.55
        if building:
            entry.update(factionBuilding=True, maxWorldHeight=catalog.get(key, {}).get('maxWorldHeight', 6))
        if environment:
            entry.update(lods=[parts[0]['mesh']] * 2, lod_parts=[parts] * 2)
        catalog[key] = entry
        sources.append(dict(key=key, source=identifier, pack=pack, model=model['source'], tier=tier))

    for key, model in UNITS.items():
        bind(key, model)
    for faction, values in BUILDINGS.items():
        for suffix, model in zip(['Hall', 'Barracks', 'Lodge', 'Tower', 'Altar', 'Workshop', 'Shop'], values):
            bind(faction + suffix, model, building=True)
        for tier in [2, 3]:
            bind(faction + 'Hall' + str(tier), values[0], tier=tier, building=True)
    for key, model in {'KingdomArcaneVault': 'ArcaneVault', 'HauntedMine': 'HauntedMine', 'RealTemple': 'TempleOfTheDamned', 'RevenantTower': 'Ziggurat', 'ClassicSpiritLodge': 'SpiritLodge'}.items():
        bind(key, model, building=True)
    for key, tier in [('RevenantSpiritTower', 2), ('RevenantNerubianTower', 3)]:
        bind(key, 'Ziggurat', tier=tier, building=True)
    for key, model, pack in [('ClassicOak', 'LordaeronTree0', 'game-ready'), ('ClassicBarrensTree', 'BarrensTree0', 'community-ready'), ('ClassicWinterTree', 'Wintertree', 'community-ready')]:
        bind(key, model, pack, environment=True)
    for key in ['RealWorker', 'ClassicPeon', 'ClassicWisp', 'RealAcolyte', 'RealGhoul']:
        for activity in ['Mine', 'Wood', 'Build']:
            catalog[key + activity] = dict(catalog[key], classicWork=activity)
    for key in ['WildwoodHall', 'WildwoodHall2', 'WildwoodHall3']:
        catalog[key + 'Uprooted'] = dict(catalog[key], classicUprooted=True)
    classic = {k: v for k, v in catalog.items() if v.get('classic')}
    select = "global.Frost={ancient:u=>u.ancient};global.FrostArt={};const V=require('./samples/frostbound-realms/game/visuals.js');let raw='';process.stdin.on('data',b=>raw+=b);process.stdin.on('end',()=>console.log(JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(raw)).map(([k,a])=>[k,V.classicClip(a,'Stand',{ancient:k.startsWith('WildwoodHall'),uprooted:!!a.classicUprooted})])))));"
    clips = json.loads(subprocess.check_output(['node', '-e', select], input=json.dumps(classic).encode('utf-8'), cwd=ROOT))
    probe = subprocess.Popen([args.pose_probe, '--stdin'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, encoding='utf-8')
    cached = {}
    try:
        for key, entry in classic.items():
            clip = clips[key]
            visible = [p for p in entry['parts'] if (p['states'][clip][0][4] > .001 if p['states'] and clip >= 0 else p['defaultVisible'])]
            body = [p for p in visible if not p['sourceFlags'] & 1] or visible
            boxes = []
            for part in body:
                ref = str(SAMPLE / part['mesh']) + ('#pose=' + str(clip) + ':0' if entry['animations'] and clip >= 0 else '')
                if ref not in cached:
                    probe.stdin.write(ref + '\n')
                    probe.stdin.flush()
                    line = probe.stdout.readline()
                    assert line, f'Native bounds failed: {ref}'
                    cached[ref] = json.loads(line)
                boxes.append(cached[ref])
            assert boxes, f'No visible stand geometry: {key}'
            minimum = [min(b['min'][i] for b in boxes) for i in range(3)]
            maximum = [max(b['max'][i] for b in boxes) for i in range(3)]
            entry.update(bounds=dict(min=minimum, max=maximum), size=[max(.01, maximum[i]-minimum[i]) for i in range(3)], boundsSource='nativeStand')
    finally:
        probe.stdin.close()
        if probe.wait(timeout=10):
            raise RuntimeError('Native pose bounds exited unsuccessfully')
    # Match the stored spelling of every copied path on case-sensitive checkouts.
    spelling = {p.relative_to(SAMPLE).as_posix().lower(): p.relative_to(SAMPLE).as_posix() for p in (SAMPLE / 'Assets/WarcraftIII').rglob('*') if p.is_file()}
    def canonical(value):
        if isinstance(value, str):
            return spelling.get(value.lower(), value)
        if isinstance(value, list):
            return [canonical(v) for v in value]
        if isinstance(value, dict):
            return {k: canonical(v) for k, v in value.items()}
        return value
    normalized = {}
    for entry in files.values():
        relative = spelling[entry['path'].lower()]
        path = SAMPLE / relative
        if path.suffix == '.mmat':
            material = load(path)
            fixed = canonical(material)
            if material != fixed:
                write(path, fixed)
        raw = path.read_bytes()
        normalized[relative] = dict(path=relative, sha256=digest(raw), bytes=len(raw))
    files = normalized
    catalog = canonical(catalog)
    write(catalog_path, catalog)
    report = dict(generator='scripts/import-frost-classic.py', models=sources, files=list(files.values()), sourceLibrary='asset-library/warcraft-iii', poseProbeSha256=digest(pathlib.Path(args.pose_probe).read_bytes()), boundsReferences=len(cached), teamMapping={'0': 'blue', '1': 'red'})
    write(previous, report)
    write(SAMPLE / 'Assets/Licenses/warcraft-classic-sources.json', report)
    (SAMPLE / 'Assets/Licenses/warcraft-classic.txt').write_text('Warcraft III classic game assets: Blizzard Entertainment. Community scenery: UTM 4.0 and its contributing authors. Source, original attribution and conversion records: asset-library/warcraft-iii/README.md and each source package Licenses directory. These assets are not CC0 or MIT.\n', encoding='utf-8', newline='\n')
    print(f'Imported {len(sources)} classic actor/scenery bindings; {len(files)} runtime files')

if __name__ == '__main__':
    main()
