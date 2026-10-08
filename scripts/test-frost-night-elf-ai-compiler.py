"""Author: MiYu. Independently check strict source-subset parsing and JASS arithmetic lowering."""
import runpy
from pathlib import Path

repo = Path(__file__).resolve().parents[1]
Compiler = runpy.run_path(str(repo / 'scripts/import-frost-night-elf-ai.py'))['Compiler']
source = repo / 'samples/frostbound-realms/SourceAssets/WarcraftIII/Scripts'
elf = (source / 'elf.ai').read_text(encoding='utf-8')
common = (source / 'common.ai').read_text(encoding='utf-8')
c = Compiler(elf, common)
c.locals = {'a', 'b'}
assert c.expr('2 * a / 3') == 'Math.trunc((2*a)/3)'
assert c.expr('(a - 2 * b) / 3') == 'Math.trunc((a-(2*b))/3)'
assert c.expr('-a / 3') == 'Math.trunc((-a)/3)'
assert c.expr('a > 3 and b != 1 or a == 0') == '(((a>3)&&(b!==1))||(a===0))'
for edit in ('call UnsupportedNative()', 'loop', 'set missing_global = 1'):
    changed = elf.replace('call InitBuildArray()', edit, 1)
    try:
        Compiler(changed, common).generate()
    except ValueError:
        pass
    else:
        raise AssertionError('Unsupported source accepted: ' + edit)
print('PASS strict AI compiler: integer precedence/truncation, negative division, boolean precedence and unsupported call/loop/global rejection')
