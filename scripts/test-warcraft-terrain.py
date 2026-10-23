"""Author: MiYu. Check source terrain topology, template footprints and emitted native geometry."""
import argparse
from collections import Counter
import copy
import hashlib
import importlib
import json
import math
from pathlib import Path
import unittest
import numpy as np
from PIL import Image
from warcraft_terrain import ground_layers, ground_normals, interpolate_height, placed_template, terrain_layout

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT/'samples/frostbound-realms'
CATALOG = json.loads((SAMPLE/'Assets/WarcraftIII/classic-cliff-catalog.json').read_bytes())
PATCHES = json.loads((SAMPLE/CATALOG['mesh']).read_bytes())['templates']
ROWS = [dict(cliffModelDir='Cliffs',rampModelDir='CliffTrans',groundTile='Ldrt')]*2
validation = importlib.import_module('validate-warcraft-assets')


def fixture():
    return dict(vertexSize=[6,6], tileSize=[5,5], origin=[-256,-128], groundTilesets=['Ldrt'],
                corners=[[8192,8192,0,0,2] for _ in range(36)])


class TerrainTests(unittest.TestCase):
    def test_ground_lighting_does_not_cross_cliff_steps(self):
        t=fixture()
        for y in range(6):
            for x in range(3,6):t['corners'][y*6+x][4]=3
        layout=terrain_layout(t,CATALOG,ROWS)
        normals=ground_normals(t,layout)
        self.assertTrue(layout['cliffs'])
        for cell in layout['ground']:
            for corner in cell['corners']:self.assertEqual(normals[corner],[0,1,0])

    def test_ground_lighting_preserves_continuous_relief(self):
        t=fixture()
        for y in range(6):
            for x in range(6):t['corners'][y*6+x][0]+=x*128+y*64
        normals=ground_normals(t,terrain_layout(t,CATALOG,ROWS))
        expected=np.array([-.25,1,.125]);expected/=np.linalg.norm(expected)
        for normal in normals:np.testing.assert_allclose(normal,expected,atol=1e-7)

    def test_blp_jpeg_alpha_and_independent_source_pixels(self):
        base=ROOT/'asset-library/warcraft-iii/game-ready'
        relative=Path('TerrainArt/LordaeronSummer/Lords_Grass')
        image=importlib.import_module('convert-warcraft-assets').decode_texture((base/'SourceAssets'/relative.with_suffix('.blp')).read_bytes())
        reference=Image.open(base/'Assets/WarcraftIII/Textures'/relative.with_suffix('.png')).convert('RGBA')
        self.assertEqual(image.mode,'RGBA');self.assertEqual(image.getchannel('A').getextrema(),(0,255))
        # Independent C# and libjpeg decoders may differ by one component level.
        self.assertLessEqual(np.abs(np.asarray(image,dtype=int)-np.asarray(reference,dtype=int)).max(),1)
        masks=[]
        for tile in range(16):
            x,y=tile%4*64,tile//4*64
            masks.append(sum(bit for (dx,dy),bit in zip([(0,0),(63,0),(0,63),(63,63)],[1,2,4,8]) if image.getpixel((x+dx,y+dy))[3]>127))
        self.assertEqual(masks,[15,8,4,12,2,10,6,14,1,9,5,13,3,11,7,15])

    def test_flat_non_square_world_coordinates_and_no_mutation(self):
        t=fixture();t['vertexSize']=[9,4];t['tileSize']=[8,3]
        before=copy.deepcopy(t);layout=terrain_layout(t,CATALOG,ROWS)
        self.assertEqual(t,before);self.assertEqual(len(layout['ground']),24);self.assertEqual(layout['cliffs'],[])
        self.assertEqual(layout['ground'][-1]['corners'],[25,34,35,26])
        self.assertEqual(layout['surfaceHeights'],[0]*36)

    def test_cliff_all_patterns_variants_and_footprint(self):
        for pattern,models in CATALOG['families']['Cliffs'].items():
            for variation in range(8):
                t=fixture();ids=[14,20,21,15]
                for i,k in zip(ids,pattern):t['corners'][i][4]=2+ord(k)-65
                t['corners'][14][3]=variation<<5
                layout=terrain_layout(t,CATALOG,ROWS)
                p=next(p for p in layout['cliffs'] if p['cell']==[2,2])
                self.assertEqual(p['template'],models[min(variation,len(models)-1)])
                self.assertEqual(p['cells'],[[2,2]])
                self.assertEqual(p['anchor'],[3,2])

    def test_transition_footprints_in_all_four_directions(self):
        expected={'AAHL':[[2,1],[2,2]],'AALH':[[2,2],[2,3]],'AHLA':[[2,2],[3,2]],'ALHA':[[1,2],[2,2]],
                  'HAAL':[[2,2],[3,2]],'LAAH':[[1,2],[2,2]],'HLAA':[[2,2],[2,3]],'LHAA':[[2,1],[2,2]]}
        for pattern,cells in expected.items():
            t=fixture()
            for i,k in zip([14,20,21,15],pattern):
                t['corners'][i][4]=2+{'A':0,'B':1,'L':0,'H':1}[k]
                t['corners'][i][2]=16 if k in 'LH' else 0
            layout=terrain_layout(t,CATALOG,ROWS)
            p=next(p for p in layout['cliffs'] if p['cell']==[2,2])
            self.assertEqual(p['model'],'CliffTrans'+pattern+'0');self.assertEqual(p['cells'],cells)
            ground={tuple(p['cell']) for p in layout['ground']}
            self.assertTrue(all(tuple(cell) not in ground for cell in cells))
            counts=Counter(tuple(cell) for p in layout['cliffs'] for cell in p['cells'])
            self.assertTrue(all(count==1 for count in counts.values()))
            self.assertEqual(len(ground)+len(counts),25)

    def test_ramp_entrance_shared_corner_height(self):
        t=fixture()
        for i,value in zip([14,20,21,15],[3,2,2,3]):t['corners'][i][4]=value;t['corners'][i][2]=16
        layout=terrain_layout(t,CATALOG,ROWS)
        self.assertIn([2,2],layout['rampEntrances'])
        self.assertEqual([layout['surfaceHeights'][i] for i in [14,20,21,15]],[1,.5,.5,1])
        self.assertTrue(all(p['cell']!=[2,2] for p in layout['cliffs']))
        self.assertTrue(any(p['cell']==[2,2] for p in layout['ground']))

    def test_relief_and_source_template_axes(self):
        t=fixture();heights=[x/4+y/8 for y in range(6) for x in range(6)]
        self.assertEqual(interpolate_height(t,heights,2.5,3.25),1.03125)
        layout=dict(groundHeights=heights)
        p=dict(anchor=[3,2],baseLayer=4)
        result=placed_template(t,layout,p,dict(positions=[[-1,0,0],[0,1,-1]]))
        self.assertEqual(result,[[0,2.75,-1],[1,4.125,-2]])

    def test_ground_atlas_masks_and_variation_ranges(self):
        for texture in range(4):
            result=ground_layers([texture]*4,7,[False]*4)
            self.assertEqual(result,[(texture,15)])
        self.assertEqual(ground_layers([0]*4,0,[False]),[(0,0)])
        for variation in range(32):
            self.assertEqual(ground_layers([0]*4,variation,[True]),[(0,16+variation if variation<16 else 15 if variation==16 else 0)])
        self.assertEqual(ground_layers([0,1,2,3],0,[False]*4),[(0,0),(1,8),(2,4),(3,1)])
        self.assertEqual(ground_layers([1,0,0,0],0,[False]*2),[(0,0),(1,2)])
        self.assertEqual(ground_layers([10,2,10,2],0,[False]*11),[(2,0),(10,6)])

    def test_invalid_source_ground_slot_is_not_blight(self):
        t=fixture();t['corners'][0][2]=1
        with self.assertRaisesRegex(ValueError,'Ground texture outside'):
            terrain_layout(t,CATALOG,ROWS)
        t['corners'][0][2]=32
        layout=terrain_layout(t,CATALOG,ROWS)
        self.assertEqual(layout['ground'][0]['textures'][0],1)


def verify_project(project):
    receipt=json.loads((project/'terrain-sources.json').read_bytes())
    layout=json.loads((project/'terrain-layout.json').read_bytes())
    data=json.loads((Path(receipt['sourceExport'])/'map.json').read_bytes());terrain=data['terrain']
    ground={tuple(cell['cell']) for cell in layout['ground']}
    occupied=Counter(tuple(cell) for p in layout['cliffs'] for cell in p['cells'])
    assert all(value==1 for value in occupied.values())
    assert ground.isdisjoint(occupied)
    assert ground|occupied.keys()=={(x,y) for y in range(terrain['tileSize'][1]) for x in range(terrain['tileSize'][0])}
    for source in receipt['sources']:
        assert hashlib.sha256((project/'SourceAssets'/source['path']).read_bytes()).hexdigest()==source['sha256']
    water_row=importlib.import_module('import-frost-wisp-rules').rows((project/'SourceAssets/TerrainArt/Water.slk').read_bytes())[terrain['tileset']+'Sha']
    expected_depth=np.asarray([max(0,((corner[1]&0x3fff)-8192)/512+float(water_row['height'])-layout['surfaceHeights'][i]) for i,corner in enumerate(terrain['corners'])],dtype='<f4')
    encoded_depth=np.asarray(Image.open(project/'Assets/Textures/WaterDepth.png').convert('RGBA'),dtype='u1').tobytes()
    assert encoded_depth==expected_depth.tobytes(),'Water depth data preserves every float bit'
    triangles=vertices=0
    for mesh in receipt['meshes']:
        path=project/mesh['path'];assert hashlib.sha256(path.read_bytes()).hexdigest()==mesh['sha256']
        doc,blob=validation.load_glb(path);p=doc['meshes'][0]['primitives'][0]
        pos=validation.accessor(doc,blob,p['attributes']['POSITION']);normals=validation.accessor(doc,blob,p['attributes']['NORMAL'])
        uv=validation.accessor(doc,blob,p['attributes']['TEXCOORD_0']);indices=validation.accessor(doc,blob,p['indices']).reshape(-1)
        assert np.isfinite(pos).all() and np.isfinite(normals).all() and np.isfinite(uv).all()
        assert indices.min()>=0 and indices.max()<len(pos) and len(indices)%3==0
        if '/Ground-' in mesh['path']:
            cross=np.cross(pos[indices.reshape(-1,3)[:,1]]-pos[indices.reshape(-1,3)[:,0]],pos[indices.reshape(-1,3)[:,2]]-pos[indices.reshape(-1,3)[:,0]])
            assert (cross[:,1]>0).all(),'ground winding'
            assert ((uv>=0)&(uv<=1)).all()
            for point in pos:
                x=round(float(point[0])-terrain['origin'][0]/128);y=round(-float(point[2])-terrain['origin'][1]/128)
                assert abs(float(point[1])-layout['surfaceHeights'][y*terrain['vertexSize'][0]+x])<1e-6
        triangles+=len(indices)//3;vertices+=len(pos)
    seams=verify_seams(terrain,layout,ground)
    result=dict(project=str(project),groundTiles=len(ground),cliffCells=len(occupied),meshes=len(receipt['meshes']),vertices=vertices,triangles=triangles,seams=seams,passed=True)
    print(json.dumps(result));return result


def verify_seams(terrain,layout,ground):
    checked,maximum=0,0
    for placement in layout['cliffs']:
        template=PATCHES[placement['template']]
        points=np.array(placed_template(terrain,layout,placement,template))
        triangles=points[np.array(template['indices']).reshape(-1,3)]
        a,b,c=triangles[:,0],triangles[:,1],triangles[:,2]
        determinant=(b[:,2]-c[:,2])*(a[:,0]-c[:,0])+(c[:,0]-b[:,0])*(a[:,2]-c[:,2])
        valid=np.abs(determinant)>1e-8;determinant=np.where(valid,determinant,1)
        for x,y in placement['cells']:
            edges=[((x-1,y),(x,y),(x,y+1)),((x+1,y),(x+1,y),(x+1,y+1)),((x,y-1),(x,y),(x+1,y)),((x,y+1),(x,y+1),(x+1,y+1))]
            for neighbor,start,end in edges:
                if neighbor not in ground:continue
                for fraction in [.1,.25,.5,.75,.9]:
                    gx=start[0]+(end[0]-start[0])*fraction;gy=start[1]+(end[1]-start[1])*fraction
                    wx=terrain['origin'][0]/128+gx;wz=-terrain['origin'][1]/128-gy
                    u=((b[:,2]-c[:,2])*(wx-c[:,0])+(c[:,0]-b[:,0])*(wz-c[:,2]))/determinant
                    v=((c[:,2]-a[:,2])*(wx-c[:,0])+(a[:,0]-c[:,0])*(wz-c[:,2]))/determinant
                    inside=valid&(u>=-.001)&(v>=-.001)&(u+v<=1.001)
                    assert inside.any(),f'Uncovered cliff-ground seam: {placement["model"]} {gx},{gy}'
                    actual=(u*a[:,1]+v*b[:,1]+(1-u-v)*c[:,1])[inside]
                    expected=interpolate_height(terrain,layout['surfaceHeights'],gx,gy)
                    error=float(np.min(abs(actual-expected)));maximum=max(maximum,error);checked+=1
                    assert error<=.5/128,f'Cliff-ground gap exceeds half a source unit: {placement["model"]} {gx},{gy}: {error}'
    return dict(samples=checked,maxHeightError=maximum,tolerance=.5/128)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--project',type=Path);parser.add_argument('--report',type=Path)
    args=parser.parse_args();result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(TerrainTests))
    if not result.wasSuccessful():raise SystemExit(1)
    if args.project:
        report=verify_project(args.project)
        if args.report:args.report.parent.mkdir(parents=True,exist_ok=True);args.report.write_text(json.dumps(report,indent=2),encoding='utf-8')
