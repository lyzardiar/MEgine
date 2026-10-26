"""Author: MiYu. Compare integer tokens and expression grouping with pinned 1.27 instructions.

Integer callbacks execute without substituted game code. Expression comparison runs
the original shift/reduce machine, feeding lexer tokens and observing reductions;
semantic actions are replaced by symbolic tree records. It does not execute the
original AST constructors, type checker, compiler or VM. Game.dll is read as data.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import struct
import sys

ROOT = Path(__file__).resolve().parents[3]
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / 'tmp/docs-artifacts/frost-siege-engine/dependencies'))
import pefile
import unicorn
from unicorn.x86_const import UC_X86_REG_EAX, UC_X86_REG_ECX, UC_X86_REG_EIP, UC_X86_REG_ESP

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--data-root', type=Path, default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
parser.add_argument('--fixture', type=Path, default=ROOT / 'tmp/docs-artifacts/war3/jass/frontend-native.json')
parser.add_argument('--output', type=Path, default=ROOT / 'tmp/docs-artifacts/war3/jass/frontend-cpu.json')
args = parser.parse_args()
profile = json.loads((ROOT / 'watcher/war3/profiles/classic-1.27.json').read_text(encoding='utf-8-sig'))
raw = (args.data_root / 'Game.dll').read_bytes()
digest = hashlib.sha256(raw).hexdigest()
assert digest == profile['referenceGame']['sha256'], 'Addresses require pinned Game.dll'
image = pefile.PE(data=raw)
assert image.OPTIONAL_HEADER.ImageBase == 0x6f000000 and image.FILE_HEADER.Machine == 0x14c
blob = image.get_memory_mapped_image()
cpu = unicorn.Uc(unicorn.UC_ARCH_X86, unicorn.UC_MODE_32)
cpu.mem_map(0x6f000000, (len(blob) + 4095) & ~4095)
cpu.mem_write(0x6f000000, blob)
cpu.mem_map(0, 4096)  # Isolated SEH slot used by the original parser prologue.
cpu.mem_map(0x1000000, 0x20000)
CONTEXT, TOKEN, DFA, PARSER = 0x1001000, 0x1002000, 0x1004000, 0x1005000
STATES, VALUES, STACK, STOP = 0x1006000, 0x1007000, 0x1008000, 0x1010000
fixture_bytes = args.fixture.read_bytes()
fixture = json.loads(fixture_bytes)

def read32(address):
    return struct.unpack('<I', cpu.mem_read(address, 4))[0]

def write32(address, value):
    cpu.mem_write(address, struct.pack('<I', value))

integer_counts = dict(decimal=0, octal=0, hexadecimal=0)
for token, expected in fixture['integers']:
    text = token.encode('ascii')
    assert 0 < len(text) < 4096
    offset = 1 if token.startswith('$') else 2 if token.startswith(('0x', '0X')) else 0
    kind = 'hexadecimal' if offset else 'octal' if len(token) > 1 and token[0] == '0' else 'decimal'
    entry = dict(decimal=0x6f7fb830, octal=0x6f7fbab0, hexadecimal=0x6f7fb970)[kind]
    cpu.mem_write(CONTEXT, bytes(256))
    cpu.mem_write(TOKEN, text + b'\0')
    write32(CONTEXT + 0x98, TOKEN)
    write32(CONTEXT + 0xc4, len(text))
    cpu.mem_write(STACK, struct.pack('<II', STOP, offset))
    cpu.reg_write(UC_X86_REG_ESP, STACK)
    cpu.reg_write(UC_X86_REG_ECX, CONTEXT)
    cpu.emu_start(entry, STOP, count=50000)
    assert cpu.reg_read(UC_X86_REG_EIP) == STOP
    assert read32(CONTEXT + 0x24) == expected, (token, hex(read32(CONTEXT + 0x24)), hex(expected))
    assert cpu.reg_read(UC_X86_REG_EAX) == 0x108
    assert cpu.reg_read(UC_X86_REG_ESP) == STACK + (8 if offset else 4)
    integer_counts[kind] += 1

# The isolated lexer sees a prefilled buffer and moves it in place before scanning.
# This CRT boundary is modeled with rep movsb; no original game code is replaced.
memmove = read32(0x6f94e46c)
cpu.mem_map(memmove & ~4095, 4096)
cpu.mem_write(memmove, bytes.fromhex('57568b7c240c8b7424108b4c24148bc7f3a45e5fc3'))

def lex(word):
    text = (word + ' ?').encode('ascii')
    cpu.mem_write(CONTEXT, bytes(256))
    cpu.mem_write(TOKEN, text + bytes(64))
    cpu.mem_write(DFA, bytes(512))
    for offset, value in [(8, DFA), (12, 500), (16, len(text)), (24, 10), (32, text[0]), (0x98, TOKEN)]:
        write32(CONTEXT + offset, value)
    write32(STACK, STOP)
    cpu.reg_write(UC_X86_REG_ESP, STACK)
    cpu.reg_write(UC_X86_REG_ECX, CONTEXT)
    cpu.emu_start(0x6f7faff0, STOP, count=50000)
    assert cpu.reg_read(UC_X86_REG_EIP) == STOP, ('Lexer budget', word)
    assert read32(CONTEXT + 0xc4) == len(word), ('Lexer token boundary', word)
    return cpu.reg_read(UC_X86_REG_EAX)

for token, expected in fixture['integers']:
    assert lex(token) == 0x108 and read32(CONTEXT + 0x24) == expected, ('Integer lexer classification', token)

words = '1 2 3 and or not function nothing returns takes return endfunction true false + - * / == != >= > < <= ( )'.split() + ['\n']
tokens = {word: lex(word) for word in words}
assert tokens['and'] == 296 and tokens['or'] == 297 and tokens['not'] == 303
operators = {'+', '-', '*', '/', 'and', 'or', '==', '!=', '<', '>', '<=', '>='}
nodes, stream, token_index, actual_tree = {}, [], 0, None

def shape(node):
    if isinstance(node, str):
        return node
    rule, children = node
    children = [child for child in children if isinstance(child, str) or child[1]]
    if len(children) == 3 and isinstance(children[1], str) and children[1] in operators:
        return '(' + children[1] + ' ' + shape(children[0]) + ' ' + shape(children[2]) + ')'
    if len(children) == 2 and isinstance(children[0], str) and children[0] in {'not', '-', '+'}:
        return '(' + children[0] + ' ' + shape(children[1]) + ')'
    if len(children) == 3 and children[0] == '(':
        return shape(children[1])
    raise AssertionError(('Unrecognized expression production', rule, children))

def boundary(machine, address, size, user_data):
    global token_index, actual_tree
    if address == 0x6f7faff0:
        token, text = stream[token_index]
        token_index += 1
        identifier = len(nodes) + 1
        nodes[identifier] = text
        write32(CONTEXT + 0x24, identifier)
        machine.reg_write(UC_X86_REG_EAX, token)
        esp = machine.reg_read(UC_X86_REG_ESP)
        machine.reg_write(UC_X86_REG_EIP, read32(esp))
        machine.reg_write(UC_X86_REG_ESP, esp + 4)
    elif address == 0x6f7f92b2:
        rule = machine.reg_read(UC_X86_REG_EAX)
        length = struct.unpack('<h', machine.mem_read(0x6fb6c4b0 + rule * 2, 2))[0]
        top = read32(PARSER + 0x24)
        children = [nodes[read32(top - 4 * i)] for i in reversed(range(length))]
        if rule == 132:  # return expression newline
            actual_tree = shape(children[1])
            machine.emu_stop()
            return
        identifier = len(nodes) + 1
        nodes[identifier] = children[0] if length == 1 else (rule, children)
        write32(PARSER + 0x20, identifier)
        machine.reg_write(UC_X86_REG_EIP, 0x6f7f90e6)
    else:
        raise AssertionError(('Original parser rejected expression token stream', stream, token_index))

for address in [0x6f7faff0, 0x6f7f92b2, 0x6f7fa471]:
    cpu.hook_add(unicorn.UC_HOOK_CODE, boundary, begin=address, end=address)
cpu.ctl_flush_tb()
mismatches = []
for text, expected in fixture['expressions']:
    parts = re.findall(r'\d+|true|false|not|and|or|==|!=|<=|>=|[()+*/<>-]', text)
    assert ''.join(parts) == ''.join(text.split()), ('Unsupported comparison input', text)
    words = ['function', 'f', 'takes', 'nothing', 'returns', 'nothing', '\n', 'return', *parts, '\n', 'endfunction', '\n']
    # The sole identifier is supplied as original new-name terminal 306 (0x6f7fbaa6).
    stream = [(306 if word == 'f' else tokens[word], word) for word in words] + [(0, 'EOF')]
    token_index, actual_tree, nodes = 0, None, {}
    cpu.mem_write(PARSER, bytes(256))
    cpu.mem_write(STATES, bytes(2048))
    cpu.mem_write(VALUES, bytes(2048))
    for offset, value in [(0, 500), (4, 1), (12, STATES), (16, VALUES)]:
        write32(PARSER + offset, value)
    cpu.mem_write(STACK, struct.pack('<II', STOP, CONTEXT))
    cpu.reg_write(UC_X86_REG_ESP, STACK)
    cpu.reg_write(UC_X86_REG_ECX, PARSER)
    cpu.emu_start(0x6f7f9070, STOP, count=300000)
    if actual_tree != expected:
        mismatches.append((text, actual_tree, expected))

assert not mismatches, ('Expression grouping mismatches', mismatches[:12])

result = dict(binarySha256=digest, nativeFixtureSha256=hashlib.sha256(fixture_bytes).hexdigest(),
              integerCases=len(fixture['integers']), integerLexerCases=len(fixture['integers']), integerRadices=integer_counts, expressionCases=len(fixture['expressions']), passed=True,
              parserEntry='0x6f7f9070', lexerEntry='0x6f7faff0', parserActionBoundary='0x6f7f92b2',
              integerEntries=dict(decimal='0x6f7fb830', octal='0x6f7fbab0', hexadecimal='0x6f7fb970'),
              modeledBoundaries=['CRT memmove for isolated lexer', 'parser lexer input', 'symbolic reductions replace semantic actions'],
              limitations=['Expression grouping only; original AST construction, typing, bytecode and execution are not tested.',
                           'Expressions intentionally include syntax-only combinations; they do not establish type validity.',
                           'The original parser stops at the return-expression reduction; whole-source acceptance is not asserted.',
                           'Valid integer token classification is checked; malformed token classification remains outside this comparison.'])
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(json.dumps(result))
