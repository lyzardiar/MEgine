"""Author: MiYu. Check source unit transforms and generated original-map resource integrity."""
import argparse
import importlib
import json
import math
from pathlib import Path
import unittest

builder=importlib.import_module('build-frost-original-units')


class AppearanceTests(unittest.TestCase):
    def test_source_axes_scale_color_and_height(self):
        unit=dict(id='hfoo',randomFlag=0,location=[128,256,384],scale=[2,3,4],angle=math.pi/2,player=15,customTeamColor=-1)
        ui={'hfoo':dict(file='Units/Test.mdl',modelScale='1.5',teamColor='-1',red='128',green='255',blue='0')};data={'hfoo':dict(moveHeight='128')}
        value=builder.appearance(unit,ui,data)
        self.assertEqual(value['model'],'Units/Test.mdx');self.assertEqual(value['transform']['position'],[1,4,-2]);self.assertEqual(value['transform']['scale'],[3,6,4.5]);self.assertEqual(value['teamColor'],12)
        self.assertAlmostEqual(value['transform']['rotation'][1],math.sqrt(.5));self.assertEqual(value['tint'],[128/255,1,0])
        ui['hfoo']['teamColor']='0';self.assertEqual(builder.appearance(unit,ui,data)['teamColor'],0)
        unit['customTeamColor']=4;self.assertEqual(builder.appearance(unit,ui,data)['teamColor'],4)

    def test_markers_and_unresolved_records(self):
        self.assertIsNone(builder.appearance(dict(id='sloc'),{},{}))
        with self.assertRaisesRegex(ValueError,'random'):builder.appearance(dict(id='uDNR'),{},{})
        with self.assertRaisesRegex(ValueError,'Missing source'):builder.appearance(dict(id='I000'),{},{})


def integrity(project):
    read=lambda file:json.loads((project/file).read_bytes())
    receipt=read('unit-scene-sources.json');placements=read('unit-placements.json');scene=read('Assets/Scenes/Main.mscene')['world']['entities'];base=Path(receipt['baseProject']);original=json.loads((base/'Assets/Scenes/Main.mscene').read_bytes())['world']['entities']
    assert builder.shared.sha((base/'Assets/Scenes/Main.mscene').read_bytes())==receipt['baseSceneSha256']
    assert builder.shared.sha((base/'Assets/Scripts/Main.js').read_bytes())==receipt['baseScriptSha256']
    assert scene[:len(original)]==original;assert len(scene)-len(original)==receipt['addedEntities']
    ids={e['entity']:e for e in scene};names={e['name']:e for e in scene};assert len(ids)==len(scene)==len(names)
    for record in receipt['generatedFiles']:assert builder.shared.sha((project/record['path']).read_bytes())==record['sha256'],record['path']
    for record in receipt['sources']:assert builder.shared.sha((project/'SourceAssets'/record['path']).read_bytes())==record['sha256'],record['path']
    for record in read('terrain-sources.json')['meshes']:assert (base/record['path']).read_bytes()==(project/record['path']).read_bytes()
    for placement in placements:
        if not placement['rendered']:assert placement['source']['id']=='sloc';continue
        parent=names[placement['name']];assert parent['components']['Transform']==placement['appearance']['transform']
        for name in placement['parts']:assert names[name]['parent']==parent['entity']
        if placement['effect']:
            effect=read(placement['effect'])
            for material in effect['materials']:
                if 'model' in material:
                    for part in material['model']['parts']:
                        assert (project/part['mesh']).is_file() and (project/part['texture']).is_file();assert part['states'][0]['frame']==0
                else:assert (project/material['texture']).is_file()
    assert len(placements)==receipt['placements'];assert sum(p['rendered'] for p in placements)==receipt['rendered']
    print(json.dumps(dict(placements=len(placements),rendered=receipt['rendered'],entities=len(scene),sourceModels=len(receipt['models']),generatedFiles=len(receipt['generatedFiles']),baseEntitiesUnchanged=len(original))))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--project',type=Path);args=parser.parse_args()
    result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(AppearanceTests))
    if not result.wasSuccessful():raise SystemExit(1)
    if args.project:integrity(args.project)
