"""Author: MiYu. Source-asset UV regression and glTF texture-transform order."""
import importlib.util
import json
import math
from pathlib import Path
import numpy as np
from PIL import Image

root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('importer',root/'scripts/import-frost-realistic.py');importer=importlib.util.module_from_spec(spec);spec.loader.exec_module(importer)
source=json.loads((root/'samples/frostbound-realms/SourceAssets/polyhaven/fir_sapling_medium/fir_sapling_medium_1k.gltf').read_text())
branch=source['materials'][0]['pbrMetallicRoughness']['baseColorTexture']
np.testing.assert_allclose(importer.texture_uvs([[0,0],[1,1]],importer.texture_mapping(branch)),[[0,.9],[1.2,1]],atol=1e-6)
mapping=importer.texture_mapping({'texCoord':0,'extensions':{'KHR_texture_transform':{'texCoord':1,'scale':[2,3],'rotation':math.pi/2,'offset':[5,7]}}})
assert mapping[0]==1
np.testing.assert_allclose(importer.texture_uvs([[1,2]],mapping),[[-1,9]],atol=1e-6)
np.testing.assert_allclose(importer.texture_uvs([[-2,.5],[4,7]],importer.texture_mapping({})),[[-2,.5],[4,7]])
image=np.zeros((8,8,3),dtype=np.uint8);image[3,3]=[90,140,55];mask=np.zeros((8,8),dtype=np.uint8);mask[3,3]=255
padded=np.array(importer.pad_texture(Image.fromarray(image),Image.fromarray(mask),2))
np.testing.assert_array_equal(padded[3,3],[90,140,55])
np.testing.assert_array_equal(padded[3,5],[90,140,55])
np.testing.assert_array_equal(padded[3,6],[0,0,0])
# A minified footprint around a narrow needle retains its authored color.
np.testing.assert_array_equal(padded[2:4,2:4].mean(axis=(0,1)),[90,140,55])
assert image[2:4,2:4].mean(axis=(0,1))[1]==35
try:importer.pad_texture(Image.fromarray(image),Image.new('L',(8,8)))
except ValueError:pass
else:raise AssertionError('Empty padding mask must fail')
sample=root/'samples/frostbound-realms';manifest=json.loads((sample/'realistic-sources.json').read_text())
for name in ['RealSpruceA','RealSpruceB','RealSpruceC']:
    lods=manifest['models'][name]['lods'];assert len(lods)==2
    assert all(lod['authored'] and 0<lod['triangles']<20000 for lod in lods)
alpha=Image.open(sample/'Assets/Textures/Real_fir_sapling_medium_base.png').getchannel('A')
assert alpha.getextrema()==(0,255)
# The authored twig tile must retain sRGB bytes when combined with its separate alpha mask.
twig_root=sample/'SourceAssets/polyhaven/fir_sapling_medium/textures'
source_color=np.array(Image.open(twig_root/'fir_sapling_medium_twigs_diff_1k.png').convert('RGB'))
source_alpha=np.array(Image.open(twig_root/'fir_sapling_medium_twigs_alpha_1k.png').convert('L'))
atlas=np.array(Image.open(sample/'Assets/Textures/Real_fir_sapling_medium_base.png'))
twig=atlas[:,5*1024:6*1024]
np.testing.assert_array_equal(twig[:,:,3],source_alpha)
np.testing.assert_array_equal(twig[source_alpha>=128,:3],source_color[source_alpha>=128])
material=json.loads((sample/'Assets/Materials/Real_fir_sapling_medium.mmat').read_text())
assert material['surface']=='cutout' and material['alpha_cutoff']==.3 and material['double_sided']
print('PASS: source UV transforms, bounded padding, minified needle color, authored 3D LODs and RGBA cutout')
