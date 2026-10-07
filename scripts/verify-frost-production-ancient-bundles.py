"""Author: MiYu. Compare both final native QA projects with the product files after narrowly defined observations."""
import hashlib
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
report = json.loads((ROOT / 'docs/designs/frostbound-realms/native-production-ancients-qa.json').read_bytes())
assert report['passed'] and report['bundleMatchesProduct'], 'Final native QA has not passed'
host = pathlib.Path(report['sample'])
files = [p for p in SAMPLE.rglob('*') if p.is_file() and not {'SourceAssets', 'Builds', '.mengine'}.intersection(p.relative_to(SAMPLE).parts)]
peers = []
for sample in [host, host.with_name('sample-1')]:
    for p in files:
        relative = p.relative_to(SAMPLE); expected = p.read_bytes(); actual = (sample / relative).read_bytes()
        if relative.as_posix() == 'project.json':
            a, b = json.loads(expected), json.loads(actual)
            for d in [a, b]:
                for k in ['id', 'storageId']: d.pop(k, None)
            assert a == b, relative
        elif relative.as_posix() == 'Assets/Scripts/Main.js':
            text = actual.decode('utf-8')
            text, ports = re.subn(r"address='127\.0\.0\.1:\d+'", "address='127.0.0.1:7788'", text)
            assert ports == 1
            text = text.replace('JSON.stringify({qaUnits:state.units,mode,', 'JSON.stringify({mode,')
            assert text.encode('utf-8') == expected, relative
        else: assert actual == expected, relative
    peers.append(dict(sample=str(sample), comparedFiles=len(files), bundleSha256=hashlib.sha256((SAMPLE / 'Assets/Scripts/Main.js').read_bytes()).hexdigest(), sceneSha256=hashlib.sha256((SAMPLE / 'Assets/Scenes/Main.mscene').read_bytes()).hexdigest()))
result = dict(author='MiYu', passed=True, allowedChanges=['project id/storageId', 'temporary local TCP port', 'qaUnits observation field'], peers=peers)
(ROOT / 'docs/designs/frostbound-realms/production-ancient-native-bundle-validation.json').write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8')
print("PASS final production Ancient native projects:", len(files), 'product files per peer, byte-identical after allowed observations')
