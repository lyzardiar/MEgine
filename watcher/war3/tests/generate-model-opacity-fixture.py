"""Author: MiYu. Generate an isolated peasant model-opacity rendering fixture."""
import argparse
import io
import struct
import importlib.util
from pathlib import Path
root=Path(__file__).resolve().parents[3]
spec=importlib.util.spec_from_file_location('fixture',root/'watcher/war3/tests/generate-live-world-fixture.py')
f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--data-root',type=Path,required=True)
parser.add_argument('--output',type=Path,default=root/'tmp/docs-artifacts/war3/alpha-animation/fixture.w3m')
args=parser.parse_args()
data=args.data_root
if args.output.resolve().is_relative_to(data.resolve()):raise ValueError('Fixture output must stay outside the read-only installation')
source=(data/'Maps/(2)BootyBay.w3m').read_bytes();offset=source.index(b'MPQ\x1a');archive=f.mpyq.MPQArchive(io.BytesIO(source[offset:]),listfile=False)
names=f.read_archive(archive,'(listfile)').decode('ascii').splitlines();files={name:f.read_archive(archive,name) for name in names if name and name!='(listfile)'}
name='Units\\Human\\Peasant\\Peasant.mdx'
for mpq in ['War3Patch.mpq','War3xLocal.mpq','War3x.mpq','war3.mpq']:
 try:
  model=f.read_archive(f.mpyq.MPQArchive(data/mpq,listfile=False),name);break
 except FileNotFoundError: pass
else: raise RuntimeError('model missing')
chunks=[];p=4;count=0
while p+8<=len(model):
 tag,size=struct.unpack_from('<4sI',model,p);body=model[p+8:p+8+size]
 if tag==b'GEOS':
  q=0
  while q<len(body):
   size2=struct.unpack_from('<I',body,q)[0];count+=1;q+=size2
  if q!=len(body):raise RuntimeError('bad geosets')
 if tag!=b'GEOA':chunks.append((tag,body))
 p+=8+size
if not count:raise RuntimeError('no geosets')
geo=b''.join(struct.pack('<IfI3fI',28,0.5,0,1.,1.,1.,i) for i in range(count));chunks.append((b'GEOA',geo));files[name]=b'MDLX'+b''.join(tag+struct.pack('<I',len(body))+body for tag,body in chunks)
out=args.output;out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(source[:offset]+f.build_archive(files));print('fixture',out,'geosets',count)
