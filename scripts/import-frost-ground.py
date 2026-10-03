"""Author: MiYu. Pack pinned CC0 ground normals, roughness and height without color conversion."""
import hashlib
import json
import urllib.request
import zipfile
from pathlib import Path
import numpy as np
from PIL import Image

SAMPLE=Path(__file__).resolve().parents[1]/'samples/frostbound-realms'
MANIFEST=SAMPLE/'ground-sources.json'

def scalar(path):
    image=Image.open(path)
    if image.mode.startswith('I'):
        return Image.fromarray(np.rint(np.asarray(image,dtype=np.float64)/257).clip(0,255).astype(np.uint8))
    return image.convert('L')

def main():
    manifest=json.loads(MANIFEST.read_text());generated=[]
    for source in manifest['sources']:
        target=SAMPLE/source['file']
        if not target.exists():
            request=urllib.request.Request(source['url'],headers={'User-Agent':'MEngine Frostbound (https://github.com/lyzardiar/MEgine)'})
            data=urllib.request.urlopen(request,timeout=45).read()
            if hashlib.sha256(data).hexdigest()!=source['sha256']:raise ValueError('Downloaded source hash mismatch: '+source['file'])
            target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
        if hashlib.sha256(target.read_bytes()).hexdigest()!=source['sha256']:raise ValueError('Source hash mismatch: '+source['file'])
        if source.get('members'):
            with zipfile.ZipFile(target) as archive:
                for member in source['members']:
                    data=archive.read(member['name'])
                    if hashlib.sha256(data).hexdigest()!=member['sha256']:raise ValueError('Archive member hash mismatch: '+member['name'])
                    output=SAMPLE/member['file'];output.parent.mkdir(parents=True,exist_ok=True);output.write_bytes(data)
    for asset in manifest['assets']:
        paths={key:SAMPLE/value for key,value in asset['channels'].items()}
        normal=Image.open(paths['nor_gl']).convert('RGB');rough=scalar(paths['Rough']);height=scalar(paths['Displacement'])
        if not normal.size==rough.size==height.size==(1024,1024):raise ValueError('Ground channel dimensions differ')
        red,green,_=normal.split();output=SAMPLE/asset['output'];Image.merge('RGBA',(red,green,rough,height)).save(output)
        generated.append({'file':asset['output'],'sha256':hashlib.sha256(output.read_bytes()).hexdigest()})
    for atlas in manifest.get('atlases',[]):
        assets=[next(a for a in manifest['assets'] if a['id']==id) for id in atlas['assets']];gutter=atlas['gutter']
        for key,channel,mode in [('color','albedo','RGB'),('data','output','RGBA')]:
            panels=[np.pad(np.asarray(Image.open(SAMPLE/a[channel]).convert(mode)),((gutter,gutter),(gutter,gutter),(0,0)),mode='wrap') for a in assets]
            output=SAMPLE/atlas[key];Image.fromarray(np.concatenate(panels,axis=1)).save(output)
            generated.append({'file':atlas[key],'sha256':hashlib.sha256(output.read_bytes()).hexdigest()})
    manifest['generated']=generated;MANIFEST.write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    print('Generated',len(generated),'ground textures from',len(manifest['sources']),'verified sources')

if __name__=='__main__':main()
