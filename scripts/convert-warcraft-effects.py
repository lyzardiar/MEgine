"""Author: MiYu. Convert selected sources or all meshless sources into sampled native effects."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import importlib.util
import json
from pathlib import Path, PureWindowsPath
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('converter', ROOT/'scripts/convert-warcraft-assets.py')
converter = importlib.util.module_from_spec(spec); spec.loader.exec_module(converter)

def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--library', type=Path, default=ROOT/'asset-library/warcraft-iii')
    parser.add_argument('--output', type=Path, default=ROOT/'asset-library/warcraft-iii/effects-ready')
    parser.add_argument('--sampler', type=Path, default=ROOT/'tmp/warcraft-effects/bin/MdxExport.dll')
    parser.add_argument('--source', action='append', default=[], help='Exact collection/source MDX path; repeat for a selected effect collection')
    args = parser.parse_args(); library = args.library.resolve(); output = args.output.resolve(); binary = args.sampler.resolve()
    output.mkdir(parents=True, exist_ok=True)
    previous = output/'asset-sources.json'
    if previous.exists():
        saved = json.loads(previous.read_text(encoding='utf-8'))
        protected = saved['generatedFiles'] + [dict(record, path='SourceAssets/'+record['path']) for record in saved['sourceFiles']]
        for record in protected:
            path = output/converter.relative(record['path'])
            if not path.is_file() or digest(path) != record['sha256']: raise ValueError(f'Preserve modified output: {path}')
    jobs = []; selected = {p.replace('\\','/').lower() for p in args.source}; matched = set()
    for collection in ['remaining-ready', 'community-ready']:
        root = library/collection
        source = json.loads((root/'asset-sources.json').read_text(encoding='utf-8'))
        models = {m['path'].replace('\\','/').lower():m for m in source['modelSamples']}
        sources = {m['path'].replace('\\','/').lower():m for m in source['sourceFiles']}
        generated = {m['path'].replace('\\','/').lower():m for m in source['generatedFiles']}
        if selected:
            for key, model in models.items():
                source = collection+'/'+key
                if source in selected:
                    jobs.append((collection, root, model, sources, generated)); matched.add(source)
        else:
            failures = json.loads((root/'Validation/conversion-checks.json').read_text(encoding='utf-8'))['failedModels']
            for failure in failures:
                if 'No renderable geosets' not in failure['error']: raise ValueError(f'Unclassified conversion error: {failure}')
                key = failure['path'].replace('\\','/').lower()
                jobs.append((collection, root, models[key], sources, generated))
    if selected != matched: raise ValueError(f'Unknown effect sources: {sorted(selected-matched)}')
    def sample(job):
        collection, root, model, sources, generated = job
        path = root/'SourceAssets'/converter.relative(sources[model['path'].replace('\\','/').lower()]['path'])
        assert digest(path) == sources[model['path'].replace('\\','/').lower()]['sha256']
        cache = ROOT/'tmp/warcraft-effects/sampled'/collection/converter.relative(model['path']).with_suffix('.json')
        cache.parent.mkdir(parents=True, exist_ok=True)
        stamp = cache.with_suffix('.stamp.json')
        # Core parser DLL changes invalidate the sampler as well as its entry assembly.
        signature = dict(source=digest(path), sampler=digest(binary), core=digest(binary.parent/'Wc3ModelViewer.Core.dll'))
        prior = json.loads(stamp.read_text()) if stamp.exists() else {}
        if not cache.exists() or prior != dict(signature, output=digest(cache)):
            run = subprocess.run(['dotnet', str(binary), '--effects', str(path), str(cache)], capture_output=True, text=True, encoding='utf-8', errors='replace')
            if run.returncode: raise ValueError(f'{model["path"]}: {run.stderr[:1600]}')
            converter.json_write(stamp, dict(signature, output=digest(cache)))
        return job, path, cache
    catalog = []; source_records = []; files = {}; texture_sources = {}
    def copy(src, relative):
        target = output/relative; target.parent.mkdir(parents=True, exist_ok=True)
        raw = src.read_bytes()
        if not target.exists() or target.read_bytes() != raw: target.write_bytes(raw)
        files[relative] = dict(path=relative, bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest())
    with ThreadPoolExecutor(max_workers=4) as executor:
        for job, source_path, cached in executor.map(sample, jobs):
            collection, root, model, sources, generated = job
            data = json.loads(cached.read_text(encoding='utf-8')); original = data['sourceModel']
            textures = original['textures']; aliases = model.get('textureSources',{})
            for material in data['materials']:
                identifier = material['textureId']; replacement = material['replaceableId']
                if 0 <= identifier < len(textures):
                    texture = textures[identifier]
                    replacement = replacement or texture['replaceableId']
                    reference = converter.REPLACEMENTS.get(replacement, texture['fileName'])
                else: reference = converter.REPLACEMENTS.get(replacement, '')
                if not reference: raise ValueError(f'Unresolved effect texture: {model["path"]} {material}')
                source_name = aliases.get(reference.lower(), reference).replace('\\','/')
                record = sources[source_name.lower()]
                rel_png = 'Assets/WarcraftIII/Textures/'+PureWindowsPath(record['path']).with_suffix('.png').as_posix()
                record_png = generated[rel_png.lower()]
                png_path = root/record_png['path']; assert digest(png_path) == record_png['sha256']
                target = 'Assets/WarcraftIII/Effects/Textures/'+collection+'/'+PureWindowsPath(record['path']).with_suffix('.png').as_posix()
                copy(png_path, target); material['texture'] = target
                texture_sources[target] = dict(collection=collection, source=record['path'], sha256=record['sha256'], convertedSha256=record_png['sha256'])
            stem = 'Assets/WarcraftIII/Effects/'+collection+'/'+PureWindowsPath(model['path']).with_suffix('').as_posix()
            effect = stem+'.mfx'; prefab = stem+'.prefab'
            converter.json_write(output/effect, data, compact=True)
            # Exact terminal samples are retained; the player starts at the source clip's beginning.
            clips = [{k:c[k] for k in ['name','duration','loop']} | dict(frames=len(c['frames'])) for c in data['clips']]
            stand = next((i for i,c in enumerate(clips) if c['name'].lower().startswith('stand')), 0)
            converter.json_write(output/prefab, dict(version=2,name=PureWindowsPath(model['path']).stem,root=dict(id='root',name=PureWindowsPath(model['path']).stem,active=True,components=dict(Transform=dict(position=[0,0,0],rotation=[0,0,0,1],scale=[1,1,1]),SampledEffect=dict(effect=effect,clip=stand,playing=True,looping=clips[stand]['loop'] if clips else False,speed=1,time_seconds=0)),children=[])))
            source_rel = collection+'/'+PureWindowsPath(model['path']).as_posix()
            copy(source_path, 'SourceAssets/'+source_rel)
            source_records.append(dict(path=source_rel,sha256=digest(source_path),bytes=source_path.stat().st_size))
            visible = bool(original['particleEmitters'] or original['ribbonEmitters'] or original['lights'])
            catalog.append(dict(source=model['path'],collection=collection,effect=effect,prefab=prefab,clips=clips,metadataOnly=not visible,particles=len(original['particleEmitters']),ribbons=len(original['ribbonEmitters']),lights=len(original['lights']),cameras=len(original['cameras']),nodes=len(original['nodes']),previewClip=stand))
            print(f'Converted {len(catalog)}/{len(jobs)}: {model["path"]}', flush=True)
    converter.json_write(output/'Assets/WarcraftIII/effect-catalog.json',dict(schemaVersion=1,models=catalog))
    for path in (output/'Assets').rglob('*'):
        if path.is_file():
            if path.suffix=='.mfx':
                identifier=converter.uuid.uuid5(converter.uuid.NAMESPACE_URL,'mengine/warcraft-iii/effects/'+path.relative_to(output).as_posix())
                converter.json_write(path.with_name(path.name+'.meta'),dict(schemaVersion=1,guid=str(identifier),importer='sampled-effect'))
            else:converter.sidecar(path, output)
    generated_files = [dict(path=p.relative_to(output).as_posix(),sha256=digest(p),bytes=p.stat().st_size) for p in sorted((output/'Assets').rglob('*')) if p.is_file()]
    source_hashes = {p.relative_to(ROOT).as_posix():digest(p) for p in [Path(__file__),ROOT/'scripts/warcraft-assets/EffectExport.cs',ROOT/'scripts/warcraft-assets/Program.cs',ROOT/'scripts/warcraft-assets/MdxExport.csproj']}
    converter.json_write(output/'asset-sources.json',dict(sourceCollections=['remaining-ready','community-ready'],sourceFiles=source_records,textureSources=texture_sources,generatedFiles=generated_files,converter=source_hashes,upstream=dict(url=converter.UPSTREAM,commit=converter.COMMIT,archiveSha256=digest(ROOT/'tmp/warcraft-converter'/converter.COMMIT/'upstream.zip')),scope='Sampled effect playback with source MDX preserved. Viewer simulation is approximate; cameras and helper tracks are metadata only.'))
    checks = dict(convertedSources=len(catalog),visualEffects=sum(not m['metadataOnly'] for m in catalog),metadataOnly=sum(m['metadataOnly'] for m in catalog),clips=sum(len(m['clips']) for m in catalog),frames=sum(sum(c['frames'] for c in m['clips']) for m in catalog),failedModels=[])
    converter.json_write(output/'Validation/conversion-checks.json',checks)
    licenses = output/'Licenses'; licenses.mkdir(exist_ok=True);shutil.copyfile(ROOT/'tmp/warcraft-converter'/converter.COMMIT/'upstream/LICENSE',licenses/'converter-MIT.txt')
    print('PASS effect conversion:',json.dumps(checks))

if __name__=='__main__': main()
