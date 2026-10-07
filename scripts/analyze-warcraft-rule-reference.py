"""Author: MiYu. Validate and summarize actual original-game Druid and Dryad probe output."""
import argparse
import json
import math
import pathlib
import re


def analyze(path):
    values = {}
    for key, text in re.findall(r'MENGINE\|([A-Za-z0-9_.]+)=(-?[0-9]+(?:\.[0-9]+)?)', path.read_text(encoding='utf-8-sig')):
        if key in values: raise ValueError('Duplicate measurement: ' + key)
        value = float(text)
        if not math.isfinite(value): raise ValueError('Nonfinite measurement: ' + key)
        values[key] = value
    def value(key):
        if key not in values: raise ValueError('Missing measurement: ' + key)
        return values[key]
    if value('completed') != 1 or 'poison.timeout' in values: raise ValueError('Original-game probe did not complete')
    forms = {}
    expected = {'claw': 'edoc', 'bear': 'edcm', 'talon': 'edot', 'crow': 'edtm'}
    state_names = ['claw.fixed.before', 'bear.fixed.after', 'claw.fixed.return', 'claw.half.before', 'bear.half.after', 'claw.half.return', 'claw.regen.after', 'bear.regen.after', 'talon.regen.after', 'crow.after', 'crow.regen.after', 'talon.return']
    for name in state_names:
        state = {field:value(name + '.' + field) for field in ['hp', 'maxHp', 'mana', 'maxMana', 'height', 'type']}
        if state['type'] != int.from_bytes(expected[name.split('.')[0]].encode('ascii'), 'big'): raise ValueError('Morph unit type differs: ' + name)
        if not 0 < state['hp'] <= state['maxHp'] or not 0 <= state['mana'] <= state['maxMana']: raise ValueError('Invalid original unit state: ' + name)
        forms[name] = state
    orders = {key:val for key,val in values.items() if key.startswith('order.')}
    if len(orders) != 7 or any(val != 1 for val in orders.values()): raise ValueError('One or more morph orders failed')
    regen = {}
    for name in expected:
        duration = value(name + '.regen.end') - value(name + '.regen.start')
        if not 4.9 <= duration <= 5.1: raise ValueError('Mana observation interval differs: ' + name)
        regen[name] = dict(seconds=duration, mana=forms[name + '.regen.after']['mana'], manaPerSecond=forms[name + '.regen.after']['mana'] / duration)
    flight = {}
    for name in ['takeoff', 'landing']:
        samples = [{field:value(name + '.' + str(i) + '.' + field) for field in ['time', 'height', 'type']} for i in range(30)]
        if any(b['time'] <= a['time'] or abs(b['time'] - a['time'] - .1) > .02 for a,b in zip(samples, samples[1:])): raise ValueError('Flight sample timing differs: ' + name)
        if any(v['height'] < 0 or v['type'] not in [int.from_bytes(x.encode('ascii'), 'big') for x in ['edot', 'edtm']] for v in samples): raise ValueError('Invalid flight sample: ' + name)
        flight[name] = samples
    poison = []
    for case, counts in enumerate([(1,0), (2,0), (1,1)]):
        prefix = 'poison.' + str(case)
        if (value(prefix + '.hitsA'), value(prefix + '.hitsB')) != counts: raise ValueError('Unexpected poison attack identities: ' + str(case))
        duration = value(prefix + '.endTime') - value(prefix + '.baselineTime')
        if not 3.9 <= duration <= 4.1 or value(prefix + '.endHp') <= 0: raise ValueError('Invalid poison observation interval or target died')
        indexes = sorted({int(k.split('.')[3]) for k in values if k.startswith(prefix + '.event.')})
        if indexes != list(range(len(indexes))) or not indexes: raise ValueError('Missing poison damage-event sequence')
        events = [{field:value(prefix + '.event.' + str(i) + '.' + field) for field in ['time', 'damage', 'source']} for i in indexes]
        if any(e['damage'] < 0 or e['source'] not in [0,1,2] for e in events) or any(b['time'] < a['time'] for a,b in zip(events, events[1:])): raise ValueError('Invalid poison damage-event trace')
        observed = [sum(e['damage'] > 8 and e['source'] == source for e in events) for source in [1,2]]
        if tuple(observed) != counts: raise ValueError('Poison event trace disagrees with direct-hit counts')
        direct = [e for e in events if e['damage'] > 8]
        window_damage = value(prefix + '.baselineHp') - value(prefix + '.endHp')
        control_gain = value(prefix + '.controlEndHp') - value(prefix + '.controlBaselineHp')
        poison.append(dict(case=case, seconds=duration, directHits=direct, events=events, baselineTime=value(prefix + '.baselineTime'), endTime=value(prefix + '.endTime'), windowHpLoss=window_damage, controlHpGain=control_gain, regenAdjustedWindowLoss=window_damage + control_gain))
    return dict(author='MiYu', measurementFile=str(path.resolve()), measurementCount=len(values), forms=forms, manaRegeneration=regen, flight=flight, poison=poison, cacheSaved=value('cacheSaved') == 1, limitations=['Poison observations cover four seconds after the final direct impact, not the full lifetime of all effects.', 'Sources are paused after expected direct hits; source-pause effects and the >8 direct-hit classification must be checked against the event trace.', 'Runtime identity and map hashes must be joined from the matching launch receipt.'])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=pathlib.Path)
    parser.add_argument('--output', type=pathlib.Path, required=True)
    args = parser.parse_args(); result = analyze(args.input)
    args.output.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print('PASS original-game measurements:', result['measurementCount'])
