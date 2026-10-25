// Author: MiYu. Install the repository commit checks while preserving custom hooks.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawnSync} from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const configured=spawnSync('git',['config','--get','core.hooksPath'],{cwd:root,encoding:'utf8'});
if(configured.status!==0&&configured.status!==1)throw Error(configured.stderr||'Cannot read Git hook configuration');
const current=configured.stdout.trim(),target=path.join(root,'.githooks');
if(current&&path.resolve(root,current)!==target)throw Error(`Existing core.hooksPath is ${current}; add the asset metadata check to your existing pre-commit hook.`);
if(!current){
  const existing=path.resolve(root,git('rev-parse','--git-path','hooks/pre-commit'));
  if(fs.existsSync(existing))throw Error(`Existing hook at ${existing}; add the asset metadata check there before changing core.hooksPath.`);
}
git('config','--local','core.hooksPath','.githooks');
console.log('Installed .githooks/pre-commit. Commits require Python 3 and tracked Frostbound asset metadata.');
