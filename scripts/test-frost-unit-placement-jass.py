"""Author: MiYu. Audit literal generated JASS placements; this is not a JASS interpreter."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import re


def audit(folder):
    data=json.loads((folder/'map.json').read_bytes());member=data['source']['members']['war3map.j']
    raw=(folder/member['preservedFile']).read_bytes();assert hashlib.sha256(raw).hexdigest()==member['sha256']
    text=raw.decode('utf-8-sig');units=data['units']['units'];remaining={i for i,u in enumerate(units) if u['id']!='sloc'};matches=[];unmatched=[];gold=[];player=None;last=None
    number=r'([-+]?\d+(?:\.\d*)?)'
    create=re.compile(r"set\s+(\w+)\s*=\s*CreateUnit\(\s*p\s*,\s*'(.{4})'\s*,\s*"+number+r'\s*,\s*'+number+r'\s*,\s*'+number+r'\s*\)')
    for line_number,line in enumerate(text.splitlines(),1):
        line=line.split('//',1)[0].strip()
        if line.startswith('function '):player=None;last=None
        p=re.fullmatch(r'local player p = Player\((\d+|PLAYER_NEUTRAL_AGGRESSIVE|PLAYER_NEUTRAL_PASSIVE)\)',line)
        if p:player={'PLAYER_NEUTRAL_AGGRESSIVE':12,'PLAYER_NEUTRAL_PASSIVE':15}.get(p[1],int(p[1]) if p[1].isdigit() else None)
        c=create.fullmatch(line)
        if c:
            variable,kind,x,y,angle=c.groups();x,y,angle=map(float,(x,y,angle))
            candidates=[i for i in remaining if units[i]['id']==kind and units[i]['player']==player and abs(units[i]['location'][0]-x)<=.051 and abs(units[i]['location'][1]-y)<=.051 and abs((math.degrees(units[i]['angle'])-angle+180)%360-180)<=.0006]
            if len(candidates)==1:
                index=candidates[0];remaining.remove(index);last=(variable,index);matches.append(dict(line=line_number,index=index,creationNumber=units[index]['creationNumber']))
            else:last=None;unmatched.append(dict(line=line_number,text=line,candidates=candidates))
        elif 'CreateUnit(' in line:unmatched.append(dict(line=line_number,text=line,reason='non-literal call'))
        amount=re.fullmatch(r'call SetResourceAmount\(\s*(\w+)\s*,\s*(\d+)\s*\)',line)
        if amount:
            assert last and amount[1]==last[0],f'Unassociated resource assignment at {line_number}'
            assert units[last[1]]['goldAmount']==int(amount[2]),f'Resource amount at {line_number}'
            gold.append(dict(index=last[1],amount=int(amount[2])))
    starts=[]
    for u in units:
        if u['id']=='sloc':
            player_info=next(p for p in data['info']['players'] if p['id']==u['player'])
            assert all(abs(a-b)<=.001 for a,b in zip(u['location'][:2],player_info['startLocation']))
            starts.append(u['player'])
    result=dict(map=data['name'],mapSha256=data['source']['sha256'],jassSha256=member['sha256'],placements=len(units),matched=matches,unmatchedCalls=unmatched,unmatchedPlacements=sorted(remaining),gold=gold,startPlayers=starts,runtimeExecuted=False)
    (folder/'unit-jass-audit.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    assert not remaining and not unmatched,'Literal placement mismatch; inspect unit-jass-audit.json'
    print(json.dumps(dict(map=data['name'],matched=len(matches),starts=len(starts),gold=len(gold),runtimeExecuted=False)))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('exports',nargs='+',type=Path);args=parser.parse_args()
    for folder in args.exports:audit(folder)
