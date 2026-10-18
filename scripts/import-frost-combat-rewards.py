"""Author: MiYu. Preserve original combat reward rows and archive identities."""
import argparse
import hashlib
import importlib
import json
from pathlib import Path
from warcraft_mpq import mpyq, read_archive

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
rows = importlib.import_module('import-frost-wisp-rules').rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--game', type=Path, default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    parser.add_argument('--output', type=Path, default=SAMPLE)
    args = parser.parse_args()
    archives = [(name, mpyq.MPQArchive(str(args.game / name), listfile=False)) for name in ['War3Patch.mpq', 'War3xLocal.mpq', 'War3x.mpq', 'war3.mpq']]
    sources, raw_files = [], {}
    for relative in ['Units/UnitBalance.slk', 'Units/MiscGame.txt', 'Scripts/common.j']:
        for name, archive in archives:
            try:
                raw = read_archive(archive, relative.replace('/', '\\'))
                break
            except FileNotFoundError:
                continue
        else:
            raise ValueError('Missing original reward data: ' + relative)
        raw_files[relative] = raw
        sources.append(dict(path=relative, archive=name, bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest()))
    assert b'PLAYER_STATE_GIVES_BOUNTY' in raw_files['Scripts/common.j']
    fields = ['bountyplus', 'bountydice', 'bountysides']
    units = {}
    for source, row in rows(raw_files['Units/UnitBalance.slk']).items():
        number = lambda field, default=0: default if row.get(field, '-') in ['', '-'] else int(row[field])
        units[source] = dict(level=number('level', 1), building=number('isbldg') == 1, gold=[number(field) for field in fields])
    profile = dict(author='MiYu', schemaVersion=1, units=units)
    previous = SAMPLE / 'paladin-rules.json'
    misc = json.loads(previous.read_text(encoding='utf-8'))['misc']
    for key in ['HeroExpRange', 'GrantNormalXP', 'GrantNormalXPFormulaA', 'GrantNormalXPFormulaB', 'GrantNormalXPFormulaC', 'GrantHeroXP', 'GrantHeroXPFormulaA', 'GrantHeroXPFormulaB', 'GrantHeroXPFormulaC', 'HeroFactorXP', 'SummonedKillFactor', 'GlobalExperience', 'BuildingKillsGiveExp', 'MaxLevelHeroesDrainExp']:
        assert (key + '=' + misc[key]).encode() in raw_files['Units/MiscGame.txt'], key
    output = args.output.resolve()
    for relative, raw in raw_files.items():
        target = output / 'SourceAssets/CombatRewards' / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
    output.mkdir(parents=True, exist_ok=True)
    encoded = (json.dumps(profile, ensure_ascii=False, separators=(',', ':')) + '\n').encode()
    (output / 'combat-rewards.json').write_bytes(encoded)
    manifest = dict(author='MiYu', gameDirectory=str(args.game.resolve()), generator='scripts/import-frost-combat-rewards.py', sources=sources, profileSha256=hashlib.sha256(encoded).hexdigest(), miscSource='paladin-rules.json: misc', reaEvidence='docs/designs/frostbound-realms/rea/rewards-mcp-field-loader.json', license='Blizzard Entertainment original game terms; extraction does not grant redistribution rights')
    (output / 'combat-rewards-sources.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(dict(units=len(units), sources=len(sources), profileSha256=manifest['profileSha256'])))


if __name__ == '__main__':
    main()
