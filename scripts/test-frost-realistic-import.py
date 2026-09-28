"""Author: MiYu. Source-asset UV regression and glTF texture-transform order."""
import importlib.util
import json
import math
from pathlib import Path
import numpy as np

root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('importer',root/'scripts/import-frost-realistic.py');importer=importlib.util.module_from_spec(spec);spec.loader.exec_module(importer)
source=json.loads((root/'samples/frostbound-realms/SourceAssets/polyhaven/fir_sapling_medium/fir_sapling_medium_1k.gltf').read_text())
branch=source['materials'][0]['pbrMetallicRoughness']['baseColorTexture']
np.testing.assert_allclose(importer.texture_uvs([[0,0],[1,1]],importer.texture_mapping(branch)),[[0,.9],[1.2,1]],atol=1e-6)
mapping=importer.texture_mapping({'texCoord':0,'extensions':{'KHR_texture_transform':{'texCoord':1,'scale':[2,3],'rotation':math.pi/2,'offset':[5,7]}}})
assert mapping[0]==1
np.testing.assert_allclose(importer.texture_uvs([[1,2]],mapping),[[-1,9]],atol=1e-6)
np.testing.assert_allclose(importer.texture_uvs([[-2,.5],[4,7]],importer.texture_mapping({})),[[-2,.5],[4,7]])
print('PASS: source fir branch UVs, scale then rotation then offset, alternate UV set and identity')
