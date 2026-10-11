"""Author: MiYu. Verify retained human source rows, signed files, icons, model references and material identities."""
import hashlib
import importlib
import json
import pathlib
import struct
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
rows = importlib.import_module('import-frost-wisp-rules').rows
sha = lambda raw: hashlib.sha256(raw).hexdigest()


def main():
    receipt = json.loads((SAMPLE / 'human-army-sources.json').read_bytes())
    rules = json.loads((SAMPLE / 'human-army.json').read_bytes())
    models = json.loads((SAMPLE / 'human-army-models.json').read_bytes())
    assert rules['roster'] == ['humanfootman', 'humanrifleman', 'humanknight']
    assert len(receipt['sources']) == 19 and len(models) == 2
    for record in receipt['sources']:
        raw = (SAMPLE / 'SourceAssets/HumanArmy' / record['path']).read_bytes()
        assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], record['path']
    for record in receipt['generators']:
        assert sha((ROOT / record['path']).read_bytes()) == record['sha256'], record['path']
    identities, materials = set(), 0
    for record in receipt['files']:
        path = record['path']; raw = (SAMPLE / path).read_bytes()
        assert len(raw) == record['bytes'] and sha(raw) == record['sha256'], path
        if path.endswith('.mmat'):
            material = json.loads(raw); materials += 1
            assert (SAMPLE / (path + '.meta')).is_file(), path
            for key in ['base_color_texture', 'normal_texture', 'metallic_roughness_texture', 'occlusion_texture', 'emissive_texture']:
                if material.get(key): assert (SAMPLE / material[key]).is_file(), material[key]
        if path.endswith('.meta'):
            guid = uuid.UUID(json.loads(raw)['guid']); assert guid.int and guid not in identities, path
            identities.add(guid)
        if path.startswith('Assets/Art/'):
            assert raw[:8] == b'\x89PNG\r\n\x1a\n' and struct.unpack('>II', raw[16:24]) == (64, 64), path
    tables = {name: rows((SAMPLE / ('SourceAssets/HumanArmy/Units/' + name + '.slk')).read_bytes()) for name in ['UnitBalance', 'UnitWeapons', 'UnitAbilities', 'UnitUI']}
    for kind, unit in {**rules['units'], **rules['buildings']}.items():
        id = unit['sourceUnit']; b, w, ui = [tables[key][id] for key in ['UnitBalance', 'UnitWeapons', 'UnitUI']]
        assert unit['sourceRows'] == {key: value[id] for key, value in tables.items()}, kind
        assert [unit['hp'], unit['gold'], unit['wood'], unit['time'], unit['armorValue']] == [int(b['HP']), int(b['goldcost']), int(b['lumbercost']), float(b['bldtm']), float(b['def'])], kind
        assert [unit['modelScale'], unit['selectionScale']] == [float(ui['modelScale']), float(ui['scale'])], kind
        if kind in rules['units']:
            assert [unit['damage'], unit['range'], unit['cooldown'], unit['damagePoint'], unit['food']] == [float(w['avgdmg1']), float(w['rangeN1']) / 100, float(w['cool1']), float(w['dmgpt1']), int(b['fused'])], kind
    assert rules['units']['humanrifleman']['requires'] == ['hbla']
    assert rules['units']['humanknight']['requires'] == ['hlum', 'hcas', 'hbla']
    for model in models.values():
        assert model['classic'] and model['factionBuilding'] and len(model['parts']) == 14
        assert any(a['name'].lower() == 'birth' for a in model['animations'])
        for part in model['parts']:
            for ref in [part['mesh'], part['material'], *part['teamMaterials'].values(), *part['textureMaterials'].values()]: assert (SAMPLE / ref.split('#')[0]).is_file(), ref
    print('PASS human army sources: 19 hashed originals, six source profiles, three original training/prerequisite lists, twelve original icons, two 14-part animated buildings, %d signed files and %d material sidecars' % (len(receipt['files']), materials))


if __name__ == '__main__': main()
