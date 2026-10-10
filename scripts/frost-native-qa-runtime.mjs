// Author: MiYu. Keep disposable native QA data on E and await the owned editor's normal exit.
import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const exec=promisify(execFile),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export const nativeQaRoot=process.env.MENGINE_QA_ROOT||'E:/work/codex/cache/mengine/native-qa';
export function configureNativeQa(root){
  if(!path.isAbsolute(root))throw new Error('Native QA root must be absolute');
  fs.mkdirSync(path.dirname(root),{recursive:true});fs.mkdirSync(root);
  fs.writeFileSync(path.join(root,'qa-owner.json'),JSON.stringify({pid:process.pid,root:path.resolve(root)}));
  for(const folder of ['temp','runtime','discovery'])fs.mkdirSync(path.join(root,folder),{recursive:true});
  const discovery=path.join(root,'discovery','agent-bridge.json');
  if(fs.existsSync(discovery))throw new Error('Native QA requires a fresh discovery path');
  Object.assign(process.env,{MENGINE_AGENT_RUNTIME_ROOT:path.join(root,'runtime'),MENGINE_AGENT_BRIDGE_FILE:discovery,TEMP:path.join(root,'temp'),TMP:path.join(root,'temp')});
}
export async function closeNativeQa(root){
  const discovery=path.join(root,'discovery','agent-bridge.json');
  if(!fs.existsSync(discovery))return {launched:false};
  const record=JSON.parse(fs.readFileSync(discovery,'utf8'));
  if(!record.background||!Number.isSafeInteger(record.pid))throw new Error('Native QA editor ownership mismatch');
  await exec(process.env.MENGINE_QA_POWERSHELL||'pwsh.exe',['-NoProfile','-File',fileURLToPath(new URL('./close-native-qa.ps1',import.meta.url)),'-EditorPid',String(record.pid),'-DiscoveryFile',discovery,...(process.env.MENGINE_EDITOR_EXECUTABLE?['-ExpectedExecutable',process.env.MENGINE_EDITOR_EXECUTABLE]:[])],{windowsHide:true});
  const alive=()=>{try{process.kill(record.pid,0);return true;}catch(e){return e.code==='EPERM';}};
  const deadline=Date.now()+60000;
  while(Date.now()<deadline&&(alive()||fs.existsSync(discovery)))await sleep(200);
  if(alive()||fs.existsSync(discovery))throw new Error('Native QA editor remained after normal close: '+root);
  // WebView cache locks may outlive its window. Retry only inside this verified disposable fixture.
  const owner=JSON.parse(fs.readFileSync(path.join(root,'qa-owner.json'),'utf8')),runtime=path.resolve(root,'runtime');
  if(owner.root!==path.resolve(root)||fs.lstatSync(root).isSymbolicLink()||fs.lstatSync(runtime).isSymbolicLink())throw new Error('Native QA runtime ownership mismatch');
  let runtimeRemovalError;
  for(const entry of fs.readdirSync(runtime)){
    const target=path.resolve(runtime,entry);
    if(path.dirname(target)!==runtime||!entry.startsWith('com.mengine.editor.agent-')||fs.lstatSync(target).isSymbolicLink())throw new Error('Native QA runtime boundary mismatch');
    try{fs.rmSync(target,{recursive:true,force:true,maxRetries:8,retryDelay:200});}catch(error){if(!['EPERM','EBUSY','ENOTEMPTY'].includes(error.code))throw error;runtimeRemovalError=error.message;}
  }
  return {pid:record.pid,normalExit:true,runtimeRemoved:!runtimeRemovalError,discoveryRemoved:true,...(runtimeRemovalError?{runtimeRemovalError}: {})};
}
export function removeNativeQaFixture(root,storage){
  const owner=JSON.parse(fs.readFileSync(path.join(root,'qa-owner.json'),'utf8'));
  if(owner.pid!==process.pid||owner.root!==path.resolve(root)||fs.lstatSync(root).isSymbolicLink())throw new Error('Native QA fixture ownership mismatch');
  if(fs.existsSync(path.join(root,'discovery','agent-bridge.json'))||fs.readdirSync(path.join(root,'runtime')).length)throw new Error('Native QA fixture is still in use');
  const saves=path.resolve(process.env.LOCALAPPDATA,'MEngine/UserData');
  if(path.dirname(path.resolve(storage))!==saves||!/^[a-f0-9]{16}$/.test(path.basename(storage)))throw new Error('Native QA storage boundary mismatch');
  if(fs.existsSync(storage)&&fs.lstatSync(storage).isSymbolicLink())throw new Error('Native QA storage became a link');
  fs.rmSync(storage,{recursive:true,force:true});fs.rmSync(root,{recursive:true});
  return {fixtureRemoved:true,qaStorageRemoved:true};
}
