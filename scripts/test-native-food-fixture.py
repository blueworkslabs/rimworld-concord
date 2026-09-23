#!/usr/bin/env python3
import pathlib,subprocess,tempfile,unittest,xml.etree.ElementTree as E
SCRIPT=pathlib.Path(__file__).with_name('native-food-fixture.py')
class FixtureTest(unittest.TestCase):
 def test_matched_variants_preserve_everything_but_one_food_level(self):
  with tempfile.TemporaryDirectory() as td:
   p=pathlib.Path(td);src=p/'source.rws'
   src.write_text('<save><maps><li><things>'+''.join('<thing><def>Human</def><id>Human'+n+'</id><needs><needs><li><def>Food</def><curLevel>.4</curLevel></li></needs></needs><other>keep</other></thing>' for n in ['405','408','411'])+'<thing><def>RawBerries</def><stackCount>75</stackCount></thing></things></li></maps></save>')
   original=src.read_bytes();trees=[]
   for v in ['hungry','urgent']:
    out=p/(v+'.rws');subprocess.run(['python3',str(SCRIPT),str(src),str(out),v],check=True,capture_output=True);trees.append(E.parse(out))
    retained=out.read_bytes();self.assertNotEqual(subprocess.run(['python3',str(SCRIPT),str(src),str(out),v],capture_output=True).returncode,0);self.assertEqual(out.read_bytes(),retained)
   a,b=[t.find('.//things/thing/needs/needs/li/curLevel') for t in trees];self.assertEqual(a.text,'0.2');self.assertEqual(b.text,'0.1');a.text=b.text='NORMALIZED';self.assertEqual(E.tostring(trees[0].getroot()),E.tostring(trees[1].getroot()));self.assertEqual(src.read_bytes(),original)
if __name__=='__main__':unittest.main()
