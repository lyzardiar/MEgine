// Author: MiYu. Upgrade an installed map's source initialization without rebuilding converted art.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {attachUnitInitialization,replaceManifestProperty} from './frost-unit-initialization-package.mjs';
import {readMapPackages,syncGameScript} from './frost-script-bundle.mjs';
const project=path.resolve(process.argv[2]||fileURLToPath(new URL('../samples/frostbound-realms',import.meta.url))),id=process.argv[3]||'amazonia';
if(!readMapPackages(project).some(map=>map.id===id))throw Error('Unknown installed map');
const relative='Assets/Maps/'+id,file=path.join(project,relative,'manifest.json'),original=fs.readFileSync(file,'utf8'),manifest=JSON.parse(original);
manifest.unitInitialization=attachUnitInitialization(project,relative,manifest.assets,manifest.source.members['war3map.j']?.sha256);
if(!manifest.unitInitialization)throw Error('Map has no preserved JASS');
fs.writeFileSync(file,replaceManifestProperty(replaceManifestProperty(original,'assets',manifest.assets),'unitInitialization',manifest.unitInitialization));syncGameScript(project);
console.log(JSON.stringify(manifest.unitInitialization));
