// Author: MiYu. Upgrade an installed map's source initialization without rebuilding converted art.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {attachUnitInitialization} from './frost-unit-initialization-package.mjs';
import {readMapPackages,syncGameScript} from './frost-script-bundle.mjs';
const project=path.resolve(process.argv[2]||fileURLToPath(new URL('../samples/frostbound-realms',import.meta.url))),id=process.argv[3]||'amazonia';
if(!readMapPackages(project).some(map=>map.id===id))throw Error('Unknown installed map');
const relative='Assets/Maps/'+id,file=path.join(project,relative,'manifest.json'),original=fs.readFileSync(file,'utf8'),manifest=JSON.parse(original);
manifest.unitInitialization=attachUnitInitialization(project,relative,manifest.assets,manifest.source.members['war3map.j']?.sha256);
if(!manifest.unitInitialization)throw Error('Map has no preserved JASS');
function replaceProperty(raw,key,value){
  const encoded=JSON.stringify(value,null,2).replaceAll('\n','\n  '),marker='  "'+key+'": ',at=raw.indexOf('\n'+marker);
  if(at<0){const end=raw.lastIndexOf('\n}');if(end<0)throw Error('Expected formatted map manifest');return raw.slice(0,end)+',\n'+marker+encoded+raw.slice(end);}
  const start=at+1+marker.length;let depth=0,quoted=false,escaped=false;
  for(let end=start;end<raw.length;end++){
    const c=raw[end];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
    if(c==='"')quoted=true;else if(c==='{'||c==='[')depth++;else if(c==='}'||c===']'){if(--depth===0)return raw.slice(0,start)+encoded+raw.slice(end+1);}
  }
  throw Error('Unterminated map manifest property');
}
fs.writeFileSync(file,replaceProperty(replaceProperty(original,'assets',manifest.assets),'unitInitialization',manifest.unitInitialization));syncGameScript(project);
console.log(JSON.stringify(manifest.unitInitialization));
