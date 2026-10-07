"""Author: MiYu. Accept complete tagged original coupling observations without inferring a life formula."""
import argparse
import hashlib
import json
import math
import pathlib
import re


def analyze(path, receipt):
    signed=json.loads(receipt.read_bytes())
    if hashlib.sha256(pathlib.Path(signed['map']).read_bytes()).hexdigest()!=signed['mapSha256']: raise ValueError('Reference map hash differs')
    text=path.read_text(encoding='utf-8'); tags=re.findall(r'MENGINE\|tag=([^"\r\n]+)',text)
    if tags!=[signed['tag']]: raise ValueError('Measurement tag differs')
    records=re.findall(r'MENGINE\|([\w.]+)=(-?[\d.]+)',text);values={k:float(v) for k,v in records}
    if len(records)!=len(values) or any(not math.isfinite(v) for v in values.values()): raise ValueError('Duplicate or nonfinite measurements')
    def value(k):
        if k not in values: raise ValueError('Missing measurement: '+k)
        return values[k]
    if value('completed')!=1: raise ValueError('Incomplete measurement')
    def state(k,kind,hp):
        result={f:value(k+'.'+f) for f in ['type','id','hp','maxHp','x','y','height','order','owner','hidden']}
        if result['type']!=int.from_bytes(kind.encode(),'big') or result['maxHp']!=hp or not 0<result['hp']<=hp or result['id']<1 or result['id']!=int(result['id']) or result['owner']!=0 or result['hidden']!=0: raise ValueError('Invalid original state: '+k)
        return result
    cases=[]
    for i in range(4):
        p='case.'+str(i)
        if value(p+'.mount.accepted')!=1 or value(p+'.dismount.accepted') not in [0,1] or value(p+'.dismount.retry') not in [0,1] or value(p+'.dismount.accepted')+value(p+'.dismount.retry')<1: raise ValueError('Coupling order failed')
        if not 5.9<=value(p+'.mount.end')-value(p+'.mount.start')<=6.1 or not 32.9<=value(p+'.dismount.end')-value(p+'.dismount.start')<=33.1: raise ValueError('Observation timing differs')
        before=[state(p+'.archer.before','earc',245),state(p+'.hippo.before','ehip',525)]
        mounted=state(p+'.rider.after','ehpr',765); wounded=state(p+'.rider.wounded','ehpr',765)
        returned=[state(p+'.archer.return','earc',245),state(p+'.hippo.return','ehip',525)]
        expected=[(245,525),(100,200),(200,100),(245,525)][i]
        if tuple(s['hp'] for s in before)!=expected or wounded['hp']!=300 or wounded['id']!=mounted['id']: raise ValueError('Reference life setup differs')
        if before[0]['id']==before[1]['id'] or returned[0]['id']==returned[1]['id']: raise ValueError('Duplicate participant identity')
        food=[value(p+'.'+name+'.food') for name in ['before','mounted','returned']]
        if food!=[4,4,4]: raise ValueError('Reference population differs')
        approach={name:{f:value(p+'.'+name+'.approach.'+f) for f in ['type','id','hp','maxHp','x','y','height','order','owner','hidden']} for name in ['archer','hippo']}
        after={name:{f:value(p+'.'+name+'.after.'+f) for f in ['type','id','hp','maxHp','x','y','height','order','owner','hidden']} for name in ['archer','hippo']}
        cases.append(dict(case=i,order='coupleinstant' if i==3 else 'coupletarget',before=before,approach=approach,originalHandlesAfter=after,mounted=mounted,wounded=wounded,returned=returned,food=food,immediateDismountAccepted=value(p+'.dismount.accepted'),delayedDismountAccepted=value(p+'.dismount.retry')))
    return dict(author='MiYu',tag=signed['tag'],mapSha256=signed['mapSha256'],scriptSha256=signed['scriptSha256'],runtime=signed['runtime'],measurementSha256=hashlib.sha256(path.read_bytes()).hexdigest(),cases=cases,limitations=['Tagged file observations require confirmation that the matching map ran in the recorded original build.','No buff, DOT, weapon cooldown, death or blocked landing conclusions are inferred from this probe.','Four observations do not establish a universal life transfer formula.'])


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('input',type=pathlib.Path);parser.add_argument('--receipt',required=True,type=pathlib.Path);parser.add_argument('--output',required=True,type=pathlib.Path);args=parser.parse_args()
    args.output.write_text(json.dumps(analyze(args.input,args.receipt),indent=2)+'\n',encoding='utf-8')
