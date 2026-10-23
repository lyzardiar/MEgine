"""Author: MiYu. Check original unit binding source parsing and coordinate conversion."""
import struct
import unittest
from warcraft_unit_bindings import model_bounds, ini
from warcraft_selection_ground import selection_patch, ground_triangles
import tempfile
from pathlib import Path
from warcraft_unit_bindings import converter


class BindingSourceTests(unittest.TestCase):
    def model(self, bounds):
        chunk=bytes(340)+struct.pack('<7f',*bounds)+bytes(4)
        return b'MDLXMODL'+struct.pack('<I',len(chunk))+chunk

    def test_model_coordinate_axes_and_scale(self):
        result=model_bounds(self.model([500,-128,-256,-64,384,512,640]))
        self.assertEqual(result,dict(min=[-1,-.5,-4],max=[3,5,2]))

    def test_invalid_extents_do_not_produce_pickable_objects(self):
        for bounds in [[1,2,0,0,1,1,1],[1,0,0,0,float('nan'),1,1]]:
            with self.assertRaises(ValueError):model_bounds(self.model(bounds))
        for raw in [b'not a model',b'MDLXMODL'+struct.pack('<I',999)+b'xxx',b'MDLX']:
            with self.assertRaises(ValueError):model_bounds(raw)

    def test_localized_strings_and_source_selection_comments(self):
        source='[ngol]\nName=金矿\n[SelectionCircle]\nScaleFactor=72 // source comment\nColorNeutral=255,255,255,0\n'
        result=ini(source.encode('utf-8'));self.assertEqual(result['ngol']['Name'],'金矿');self.assertEqual(result['SelectionCircle']['ScaleFactor'],'72')

    def test_selection_clips_to_exact_sloped_triangles(self):
        triangles=[[[-2,-2,-2],[2,2,-2],[-2,2,2]],[[2,2,-2],[2,6,2],[-2,2,2]]]
        positions,uvs,indices=selection_patch(triangles,0,0,2)
        area=0
        for p,uv in zip(positions,uvs):
            self.assertTrue(-.5<=p[0]<=.5 and -.5<=p[2]<=.5)
            self.assertAlmostEqual(p[1],p[0]*2+p[2]*2+2)
            self.assertEqual(uv,[p[0]+.5,p[2]+.5])
        for n in range(0,len(indices),3):
            a,b,c=[positions[i] for i in indices[n:n+3]]
            area+=abs((b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]))/2
        self.assertAlmostEqual(area,1)
        self.assertEqual(selection_patch(triangles,100,100,1),([],[],[]))

    def test_generated_ground_glb_and_malformed_input(self):
        points=[[0,1,0],[1,2,0],[0,3,1]]
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'ground.glb';glb=converter.Glb();glb.mesh(points,[[0,1,0]]*3,[[0,0]]*3,[0,1,2]);glb.save(path)
            raw=path.read_bytes();self.assertEqual(ground_triangles(raw),[[tuple(p) for p in points]])
            with self.assertRaises(ValueError):ground_triangles(raw[:-1])


if __name__=='__main__':unittest.main()
