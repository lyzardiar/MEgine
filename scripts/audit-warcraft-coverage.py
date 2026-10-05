"""Author: MiYu. Account for every indexed source model and verify converted-library provenance."""
import argparse
import hashlib
import json
from pathlib import Path, PureWindowsPath
import struct

ROOT = Path(__file__).resolve().parents[1]
LIBRARY = ROOT / 'asset-library/warcraft-iii'

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def source_key(path):
    return str(PureWindowsPath(path)).replace('\\', '/').lower()

def audit(name):
    root=LIBRARY/name
    source=json.loads((root/'asset-sources.json').read_text(encoding='utf-8'))
    catalog_path=root/'Assets/WarcraftIII/model-catalog.json'
    catalog=json.loads(catalog_path.read_text(encoding='utf-8'))
    conversion=json.loads((root/'Validation/conversion-checks.json').read_text(encoding='utf-8'))
    extraction=json.loads((root/'Validation/extraction-checks.json').read_text(encoding='utf-8'))
    verification=json.loads((root/'Validation/verification.json').read_text(encoding='utf-8'))
    assert verification['runtimePassed'],name
    generated={source_key(f['path']):f for f in source['generatedFiles']}
    assert len(generated)==len(source['generatedFiles']),(name,'duplicate output paths')
    sources={source_key(f['path']):f for f in source['sourceFiles']}
    converted={source_key(m['source']):m for m in catalog['models']}
    deferred={source_key(m['path']):m for m in conversion['failedModels']}
    missing={source_key(m['path']):m for m in extraction['failedModels']}
    extracted={source_key(m['path']) for m in source['modelSamples']}
    assert len(converted)==len(catalog['models']) and len(deferred)==len(conversion['failedModels'])
    assert not (converted.keys() & deferred.keys()) and not (extracted & missing.keys())
    assert converted.keys() | deferred.keys()==extracted,(name,'unaccounted extracted sources')
    checked=set()
    def verify_generated(relative):
        key=source_key(relative)
        if key in checked:return
        record=generated[key];path=root/record['path']
        assert path.stat().st_size==record['bytes'] and digest(path)==record['sha256'],path
        checked.add(key)
    verify_generated(catalog_path.relative_to(root).as_posix())
    for key in extracted:
        record=sources[key];path=root/'SourceAssets'/Path(*PureWindowsPath(record['path']).parts)
        assert path.stat().st_size==record['bytes'] and digest(path)==record['sha256'],path
    for model in converted.values():
        verify_generated(model['prefab'])
        assert model['parts'],model['source']
        for part in model['parts']:
            for field in ['mesh','animatedMesh','material']:
                if part.get(field):verify_generated(part[field])
            for material in [*part.get('textureMaterials',{}).values(),*part.get('teamMaterials',{}).values()]:verify_generated(material)
            for field in ['mesh','animatedMesh']:
                if not part.get(field):continue
                path=root/generated[source_key(part[field])]['path']
                with path.open('rb') as stream:header=struct.unpack('<III',stream.read(12))
                assert header==(0x46546c67,2,path.stat().st_size),path
            for relative in [part['material'],*part.get('textureMaterials',{}).values(),*part.get('teamMaterials',{}).values()]:
                material=json.loads((root/generated[source_key(relative)]['path']).read_text(encoding='utf-8'))
                if material.get('base_color_texture'):verify_generated(material['base_color_texture'])
    assert len(converted)==conversion['modelSources']
    return dict(collection=name,catalogSha256=digest(catalog_path),extractedModels=len(extracted),convertedModels=len(converted),clips=sum(len(m['clips']) for m in converted.values()),verifiedSourceModels=len(extracted),verifiedGeneratedDependencies=len(checked),deferredModels=list(deferred.values()),missingDependencies=list(missing.values()),previousRuntimeValidation=dict(report=str((root/'Validation/verification.json').relative_to(ROOT)),executableSha256=verification['runtimeSha256'],passed=verification['runtimePassed'],nativeTerminalPoseChecks=verification['nativeTerminalPoseChecks'])),extracted | missing.keys()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inventory',type=Path,default=LIBRARY/'cliff-skins-ready/SourceAssets/model-inventory.json',help='Original installation model-inventory.json from the linked extraction task')
    parser.add_argument('--output',type=Path,default=ROOT/'docs/designs/frostbound-realms/asset-conversion-coverage.json')
    args=parser.parse_args()
    inventory=json.loads(args.inventory.read_text(encoding='utf-8'))
    expected={source_key(m['path']) for m in inventory}
    assert len(expected)==len(inventory)
    reports=[];original=set();community=set()
    for name in ['game-ready','remaining-ready','community-ready']:
        report,covered=audit(name);reports.append(report)
        if name=='community-ready':community=covered
        else:
            assert not (original & covered),name
            original |= covered
    assert original==expected,dict(unaccounted=sorted(expected-original),unexpected=sorted(original-expected))
    report=dict(inventory=str(args.inventory.resolve()),inventorySha256=digest(args.inventory),originalIndexedModels=len(expected),originalAccountedModels=len(original),communityAccountedModels=len(community),convertedModels=sum(r['convertedModels'] for r in reports),clips=sum(r['clips'] for r in reports),deferredModels=sum(len(r['deferredModels']) for r in reports),missingDependencies=sum(len(r['missingDependencies']) for r in reports),collections=reports,scope='Mesh assets converted and current source/output dependencies hash-verified. Meshless effects require emitter/ribbon/light adaptation; missing texture dependencies remain unresolved. Existing runtime/pose results are prior verification reports, not new gameplay acceptance.')
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('PASS Warcraft conversion coverage:',json.dumps({k:v for k,v in report.items() if k not in ['collections','scope']},ensure_ascii=False))

if __name__=='__main__':main()
