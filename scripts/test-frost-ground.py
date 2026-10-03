"""Author: MiYu. Verify linear texture packing and normal orientation against scanned height."""
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image

s=Path(__file__).resolve().parents[1]/'samples/frostbound-realms';manifest=json.loads((s/'ground-sources.json').read_text());report={'passed':True,'materials':{}}
for entry in manifest['sources']+manifest['generated']:
    assert hashlib.sha256((s/entry['file']).read_bytes()).hexdigest()==entry['sha256'],entry['file']
    for member in entry.get('members',[]):assert hashlib.sha256((s/member['file']).read_bytes()).hexdigest()==member['sha256'],member['file']
for asset in manifest['assets']:
    packed=np.asarray(Image.open(s/asset['output']));assert packed.shape==(1024,1024,4)
    normal=np.asarray(Image.open(s/asset['channels']['nor_gl']).convert('RGB'));assert np.array_equal(packed[:,:,:2],normal[:,:,:2])
    for index,key in [(2,'Rough'),(3,'Displacement')]:
        original=Image.open(s/asset['channels'][key]);source=np.asarray(original,dtype=float) if original.mode.startswith('I') else np.asarray(original.convert('L'),dtype=float)
        expected=np.rint(source/257) if original.mode.startswith('I') else source
        assert np.array_equal(packed[:,:,index],expected),key
        assert np.std(packed[:,:,index])>3,'channel must retain scanned variation'
    height=source;dx=np.roll(height,-1,1)-np.roll(height,1,1);dy=np.roll(height,-1,0)-np.roll(height,1,0)
    # MiYu: compare height slopes with normal X/Z and Y/Z, including steep rock faces.
    nz=np.maximum(1,normal[:,:,2].astype(float)-127.5)
    nx=(normal[:,:,0].astype(float)-127.5)/nz;ny=(normal[:,:,1].astype(float)-127.5)/nz
    corr=[float(np.corrcoef(nx.ravel(),-dx.ravel())[0,1]),float(np.corrcoef(ny.ravel(),dy.ravel())[0,1])]
    assert min(corr)>.7,'OpenGL normal X opposes height U; green follows image V, so world tangent V is negated'
    report['materials'][asset['id']]={'size':[1024,1024],'normalSlopeHeightCorrelation':corr,'roughnessRange':[int(packed[:,:,2].min()),int(packed[:,:,2].max())],'heightRange':[int(packed[:,:,3].min()),int(packed[:,:,3].max())]}
for atlas in manifest.get('atlases',[]):
    assets=[next(a for a in manifest['assets'] if a['id']==id) for id in atlas['assets']];gutter=atlas['gutter']
    for key,channel,mode in [('color','albedo','RGB'),('data','output','RGBA')]:
        panels=[np.pad(np.asarray(Image.open(s/a[channel]).convert(mode)),((gutter,gutter),(gutter,gutter),(0,0)),mode='wrap') for a in assets]
        assert np.array_equal(np.asarray(Image.open(s/atlas[key])),np.concatenate(panels,axis=1)),'atlas panels and wrap gutters must preserve source pixels'
report['atlases']={'count':len(manifest.get('atlases',[])),'exactPixelsAndWrappedGutters':True}
shader=(s/'Assets/Shaders/Ground.mshader').read_text();schema=json.loads(shader.split('/* MENGINE_PARAMETERS',1)[1].split('*/',1)[0]);assert [t['type'] for t in schema['textures']]==['color']*3+['data']*3
for texture in schema['textures']:assert (s/texture['default']).is_file()
cliffs=next(a for a in manifest['atlases'] if len(a['assets'])==3)
for name in ['Ground','GroundIce','GroundMasonry']:
    material=json.loads((s/('Assets/Materials/'+name+'.mmat')).read_text())
    assert material['base_color_texture']==cliffs['color'] and material['metallic_roughness_texture']==cliffs['data']
(s.parents[1]/'docs/designs/frostbound-realms/ground-import-qa.json').write_text(json.dumps(report,indent=2)+'\n')
print(f"PASS: {len(manifest['sources'])} source hashes, {len(manifest['generated'])} packed outputs, exact linear channels, 16-bit heights, normal orientation and cliff material bindings")
