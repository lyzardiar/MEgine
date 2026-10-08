"""Author: MiYu. Compile the supported pure elf.ai strategy subset, failing closed."""
import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
SOURCE = SAMPLE / 'SourceAssets/WarcraftIII/Scripts'
FUNCTIONS = ('init_vars', 'basics', 'do_upgrades', 'build_sequence', 'force_level')
NATIVES = {'GetUpgradeLevel', 'GetUnitCount', 'GetUnitCountDone', 'TownCount', 'TownCountDone', 'GetFoodMade', 'FoodUsed', 'GetGold', 'GetWood', 'GetGoldOwned', 'GetMinesOwned', 'MeleeDifficulty', 'InitBuildArray', 'SetBuildUnit', 'SetBuildNext', 'SetBuildUpgr', 'BasicExpansion', 'MeleeTownHall', 'GuardSecondary', 'BuildFactory', 'GetZeppelin'}


def digest(data):
    return hashlib.sha256(data).hexdigest()


class Compiler:
    def __init__(self, elf, common):
        self.constants = {}
        for name, value in re.findall(r'constant integer (\w+)\s*=\s*([^\r\n]+)', common):
            value = value.split('//')[0].strip()
            if re.fullmatch(r"'[^']{4}'", value):
                self.constants[name] = value[1:-1]
            elif re.fullmatch(r'-?\d+', value):
                self.constants[name] = int(value)
            elif value in self.constants:
                self.constants[name] = self.constants[value]
        block = re.search(r'globals\s+(.*?)endglobals', elf, re.S).group(1)
        self.defaults = {name: (value == 'true' if typ == 'boolean' else int(value)) for typ, name, value in re.findall(r'(boolean|integer)\s+(\w+)\s*=\s*(true|false|\d+)', block)}
        self.external = {'hero_id', 'hero_id2', 'hero_id3'}
        self.used_constants = {}
        self.elf = elf

    def name(self, name):
        if name in self.locals:
            return name
        if name in self.defaults or name in self.external:
            return 'g.' + name
        if name in self.constants:
            self.used_constants[name] = self.constants[name]
            return json.dumps(self.constants[name])
        raise ValueError('Unsupported identifier: ' + name)

    def expr(self, expression):
        token_re = r'\s*(\d+|[A-Za-z_]\w*|!=|==|>=|<=|[()+*/<>,\-])'
        tokens = []
        at = 0
        while at < len(expression):
            m = re.match(token_re, expression[at:])
            if not m:
                raise ValueError('Unsupported expression: ' + expression[at:])
            tokens.append(m.group(1))
            at += m.end()
        pos = 0
        precedence = {'or': 1, 'and': 2, '==': 3, '!=': 3, '>': 4, '<': 4, '>=': 4, '<=': 4, '+': 5, '-': 5, '*': 6, '/': 6}

        def parse(minimum=0):
            nonlocal pos
            token = tokens[pos]
            pos += 1
            if token in ('not', '-'):
                left = '(' + ('!' if token == 'not' else '-') + parse(7) + ')'
            elif token == '(':
                left = parse()
                assert tokens[pos] == ')'
                pos += 1
            elif token.isdigit() or token in ('true', 'false'):
                left = token
            elif pos < len(tokens) and tokens[pos] == '(':
                pos += 1
                args = []
                if tokens[pos] != ')':
                    while True:
                        args.append(parse())
                        if tokens[pos] != ',':
                            break
                        pos += 1
                assert tokens[pos] == ')'
                pos += 1
                if token in FUNCTIONS:
                    left = token + '(g,a' + (',' + ','.join(args) if args else '') + ')'
                elif token in NATIVES:
                    left = 'a.' + token + '(' + ','.join(args) + ')'
                else:
                    raise ValueError('Unsupported call: ' + token)
            else:
                left = self.name(token)
            while pos < len(tokens) and precedence.get(tokens[pos], -1) >= minimum:
                op = tokens[pos]
                pos += 1
                right = parse(precedence[op] + 1)
                if op == '/':
                    left = 'Math.trunc(' + left + '/' + right + ')'
                else:
                    left = '(' + left + {'and': '&&', 'or': '||', '==': '===', '!=': '!=='}.get(op, op) + right + ')'
            return left

        result = parse()
        if pos != len(tokens):
            raise ValueError('Unparsed tokens: ' + expression)
        return result

    def function(self, name):
        m = re.search(r'function ' + name + r' takes (.*?) returns (\w+)\s*\n(.*?)endfunction', self.elf, re.S)
        if not m:
            raise ValueError('Missing source function: ' + name)
        params = [] if m[1] == 'nothing' else [p.strip().split()[1] for p in m[1].split(',')]
        self.locals = set(params)
        out = ['  function ' + name + '(g,a' + (',' + ','.join(params) if params else '') + '){']
        depth = 0
        for raw in m[3].splitlines():
            line = raw.split('//')[0].strip()
            if not line:
                continue
            if line.startswith('local '):
                v = re.fullmatch(r'local (integer|boolean) (\w+)(?:\s*=\s*(.*))?', line)
                if not v:
                    raise ValueError('Unsupported local: ' + line)
                self.locals.add(v[2])
                out.append('    let ' + v[2] + '=' + (self.expr(v[3]) if v[3] else '0' if v[1] == 'integer' else 'false') + ';')
            elif line.startswith('set '):
                v = re.fullmatch(r'set (\w+)\s*=\s*(.*)', line)
                out.append('    ' + self.name(v[1]) + '=' + self.expr(v[2]) + ';')
            elif line.startswith('call '):
                out.append('    ' + self.expr(line[5:]) + ';')
            elif line.startswith('if ') and line.endswith(' then'):
                out.append('    if(' + self.expr(line[3:-5]) + '){')
                depth += 1
            elif line.startswith('elseif ') and line.endswith(' then') and depth:
                out.append('    }else if(' + self.expr(line[7:-5]) + '){')
            elif line == 'else' and depth:
                out.append('    }else{')
            elif line == 'endif' and depth:
                out.append('    }')
                depth -= 1
            elif line == 'return' or line.startswith('return '):
                out.append('    return' + (' ' + self.expr(line[7:]) if len(line) > 6 else '') + ';')
            else:
                raise ValueError('Unsupported source statement: ' + line)
        if depth:
            raise ValueError('Unclosed if: ' + name)
        return '\n'.join(out + ['  }'])

    def generate(self):
        functions = [self.function(name) for name in FUNCTIONS]
        return ('// Author: MiYu. Generated by scripts/import-frost-night-elf-ai.py from signed original scripts.\n'
                'var FrostNightAISource=(()=>{\n  const defaults=' + json.dumps(self.defaults, separators=(',', ':')) + ';\n'
                + '\n'.join(functions) + '\n  return {defaults,constants:' + json.dumps(self.used_constants, sort_keys=True, separators=(',', ':')) + ',' + ','.join(FUNCTIONS) + '};\n})();\n'
                "if(typeof module!=='undefined')module.exports=FrostNightAISource;\n")


def main():
    parser = argparse.ArgumentParser(__doc__)
    parser.add_argument('--check', action='store_true', help='verify exact generated output without writing')
    args = parser.parse_args()
    elf = (SOURCE / 'elf.ai').read_text(encoding='utf-8')
    common = (SOURCE / 'common.ai').read_text(encoding='utf-8')
    code = Compiler(elf, common).generate().encode('utf-8')
    rel = 'samples/frostbound-realms/game/night-elf-ai-source.js'
    receipt = {'schema': 1, 'functions': list(FUNCTIONS), 'generatorHashMode': 'lf-text', 'generator': 'scripts/import-frost-night-elf-ai.py', 'generatorSha256': digest(Path(__file__).read_text(encoding='utf-8').replace('\r\n', '\n').encode()), 'sources': [{'path': 'samples/frostbound-realms/SourceAssets/WarcraftIII/Scripts/' + name, 'sha256': digest((SOURCE / name).read_bytes())} for name in ('elf.ai', 'common.ai')], 'outputs': [{'path': rel, 'sha256': digest(code)}], 'scope': 'Five pure source strategy functions; native production/counting/harvest/combat remain explicit MEngine adapters.'}
    for path, data in [(ROOT / rel, code), (SAMPLE / 'night-elf-ai-sources.json', (json.dumps(receipt, indent=2) + '\n').encode())]:
        if args.check:
            if not path.exists() or path.read_bytes().replace(b'\r\n', b'\n') != data:
                raise SystemExit('Generated file mismatch: ' + str(path))
        else:
            path.write_bytes(data)
    print('PASS exact source strategy generation' if args.check else 'Generated five original Night Elf strategy functions')


if __name__ == '__main__':
    main()
