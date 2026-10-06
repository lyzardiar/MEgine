"""Author: MiYu. Reproduce complete source nodes and protect modified attachment outputs."""
import argparse
import importlib
import json
import pathlib
import subprocess
import sys
import tempfile

base=importlib.import_module('convert-frost-classic-billboards')
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--metadata-reader',type=pathlib.Path,required=True)
args=p.parse_args()
library=base.LIBRARY/'classic-attachment-ready'
receipt=json.loads((library/'asset-sources.json').read_bytes())
paths=[r['path'] for r in receipt['generatedFiles']]+['asset-sources.json']
def run(command): return subprocess.run(command,capture_output=True,text=True,encoding='utf-8')
with tempfile.TemporaryDirectory(prefix='attachment-reproduction-',dir=base.ROOT/'tmp') as temp:
    output=pathlib.Path(temp)/'classic-attachment-ready'
    command=[sys.executable,str(base.ROOT/'scripts/convert-frost-classic-attachments.py'),'--metadata-reader',str(args.metadata_reader.resolve()),'--output',str(output)]
    result=run(command);assert result.returncode==0,result.stderr
    for path in paths:assert (output/path).read_bytes()==(library/path).read_bytes(),path
    changed=receipt['annotations'][0]['output'];target=output/changed
    target.write_bytes(target.read_bytes()+b'\n')
    before={p:base.digest((output/p).read_bytes()) for p in paths}
    result=run(command);assert result.returncode!=0 and 'Preserve modified attachment output' in result.stderr,result.stderr
    assert all(base.digest((output/p).read_bytes())==value for p,value in before.items()),'Refusal changed output'
report=dict(passed=True,reproducedFiles=len(paths),modifiedOutputProtected=True,refusalLeavesOutputsUnchanged=True,scope='Independent source-based reconstruction of complete nodes, KATV and unchanged GLB binary payloads.')
(base.ROOT/'docs/designs/frostbound-realms/classic-attachment-reproduction.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print('PASS attachment reproduction:',json.dumps(report))
