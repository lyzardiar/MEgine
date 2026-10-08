"""Author: MiYu. Exercise source BOM handling and preservation before Blood Mage conversion."""
import importlib
import pathlib
import subprocess
import sys
import tempfile
import unittest

importer=importlib.import_module('import-frost-blood-mage')

class BloodMageImportTests(unittest.TestCase):
 def test_localized_first_section(self):
  raw=(importer.SAMPLE/'SourceAssets/WarcraftIII/Units/HumanUnitStrings.txt').read_bytes()
  self.assertTrue(raw.startswith(b'\xef\xbb\xbf[Hblm]'))
  self.assertEqual(importer.safe_section(raw,'Hblm')['Name'],'血魔法师')
  self.assertEqual(importer.safe_section(raw,'hphx')['Name'],'火凤凰')
  self.assertEqual(importer.safe_section(raw,'absent'),{})

 def test_preserve_existing_source_before_geometry(self):
  with tempfile.TemporaryDirectory(prefix='frost-blood-mage-preserve-') as folder:
   root=pathlib.Path(folder);target=root/'SourceAssets/WarcraftIII/Units/HumanUnitStrings.txt';target.parent.mkdir(parents=True);target.write_bytes(b'owned local source')
   result=subprocess.run([sys.executable,str(importer.ROOT/'scripts/import-frost-blood-mage.py'),'--output',str(root)],capture_output=True,text=True)
   self.assertNotEqual(result.returncode,0)
   self.assertIn('Preserve modified BloodMage output: SourceAssets/WarcraftIII/Units/HumanUnitStrings.txt',result.stderr)
   self.assertNotIn('Converted ',result.stdout)
   self.assertEqual(target.read_bytes(),b'owned local source')
   self.assertEqual([p for p in root.rglob('*') if p.is_file()],[target])

if __name__=='__main__':unittest.main()
