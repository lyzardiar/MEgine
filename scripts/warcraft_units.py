"""Author: MiYu. Preserve classic editor unit/item placements without executing map scripts.

Pinned format and MIT notice: third_party/warcraft-map-format/README.md.
"""
import struct
from warcraft_map import Reader


def parse_units(data):
    r = Reader(data, 'war3mapUnits.doo')
    if r.take(4) != b'W3do':
        r.fail('invalid magic')
    version, subversion = r.integer(), r.unsigned()
    if (version, subversion) not in ((7, 9), (8, 11)):
        r.fail(f'unsupported classic version {version}/{subversion}')
    units = []
    for _ in range(r.count(91 if subversion == 9 else 107)):
        unit = dict(id=r.code(), variation=r.integer(), location=r.values('3f'), angle=r.values('f')[0], scale=r.values('3f'),
                    flags=r.values('B')[0], player=r.integer(), unknown=r.values('H')[0], hitpoints=r.integer(), mana=r.integer())
        if subversion > 10:
            unit['droppedItemTable'] = r.integer()
        unit['droppedItemSets'] = [dict(items=[dict(id=r.code(), chance=r.integer()) for _ in range(r.count(8))]) for _ in range(r.count(4))]
        unit.update(goldAmount=r.integer(), targetAcquisition=r.values('f')[0], heroLevel=r.integer())
        if subversion > 10:
            unit.update(heroStrength=r.integer(), heroAgility=r.integer(), heroIntelligence=r.integer())
        unit['itemsInInventory'] = [dict(slot=r.integer(), id=r.code()) for _ in range(r.count(8))]
        unit['modifiedAbilities'] = [dict(id=r.code(), activeForAutocast=r.integer(), heroLevel=r.integer()) for _ in range(r.count(12))]
        unit['randomFlag'] = r.integer()
        if unit['randomFlag'] == 0:
            unit.update(level=r.values('3B'), itemClass=r.values('B')[0])
        elif unit['randomFlag'] == 1:
            unit.update(unitGroup=r.unsigned(), positionInGroup=r.unsigned())
        elif unit['randomFlag'] == 2:
            unit['randomUnitTables'] = [dict(id=r.code(), chance=r.integer()) for _ in range(r.count(8))]
        elif unit['randomFlag'] != -1:
            r.fail(f'unsupported random unit flag {unit["randomFlag"]}')
        unit.update(customTeamColor=r.integer(), waygate=r.integer(), creationNumber=r.integer())
        units.append(unit)
    r.finish()
    return dict(version=version, subversion=subversion, units=units)


def encode_units(value):
    """Reconstruct source bytes for validation; identifiers and reserved fields remain intact."""
    pack = lambda fmt,*values:struct.pack('<'+fmt,*values)
    code = lambda value:value.encode('latin1')
    raw = b'W3do'+pack('iIi',value['version'],value['subversion'],len(value['units']))
    for u in value['units']:
        raw += code(u['id'])+pack('i7fBiHii',u['variation'],*u['location'],u['angle'],*u['scale'],u['flags'],u['player'],u['unknown'],u['hitpoints'],u['mana'])
        if value['subversion'] > 10:
            raw += pack('i',u['droppedItemTable'])
        raw += pack('i',len(u['droppedItemSets']))
        for group in u['droppedItemSets']:
            raw += pack('i',len(group['items']))
            for item in group['items']:
                raw += code(item['id'])+pack('i',item['chance'])
        raw += pack('ifi',u['goldAmount'],u['targetAcquisition'],u['heroLevel'])
        if value['subversion'] > 10:
            raw += pack('3i',u['heroStrength'],u['heroAgility'],u['heroIntelligence'])
        raw += pack('i',len(u['itemsInInventory']))
        for item in u['itemsInInventory']:
            raw += pack('i',item['slot'])+code(item['id'])
        raw += pack('i',len(u['modifiedAbilities']))
        for ability in u['modifiedAbilities']:
            raw += code(ability['id'])+pack('2i',ability['activeForAutocast'],ability['heroLevel'])
        raw += pack('i',u['randomFlag'])
        if u['randomFlag'] == 0:
            raw += pack('4B',*u['level'],u['itemClass'])
        elif u['randomFlag'] == 1:
            raw += pack('2I',u['unitGroup'],u['positionInGroup'])
        elif u['randomFlag'] == 2:
            raw += pack('i',len(u['randomUnitTables']))
            for entry in u['randomUnitTables']:
                raw += code(entry['id'])+pack('i',entry['chance'])
        elif u['randomFlag'] != -1:
            raise ValueError('Unsupported random unit flag')
        raw += pack('3i',u['customTeamColor'],u['waygate'],u['creationNumber'])
    return raw
