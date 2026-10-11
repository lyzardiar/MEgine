// Author: MiYu. Independent generation keeps source assets intact and emits referenced sounds and playable maps.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../',import.meta.url)),root=path.join(repo,'samples/frostbound-realms'),output=fs.mkdtempSync(path.join(os.tmpdir(),'frost-build-output-')),S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
function snapshot(){
  const result={};
  function visit(relative){const p=path.join(root,relative);if(!fs.existsSync(p)){result[relative]=null;return;}if(fs.statSync(p).isDirectory()){result[relative]='directory';for(const n of fs.readdirSync(p).sort())visit(relative+'/'+n);}else result[relative]=createHash('sha256').update(fs.readFileSync(p)).digest('hex');}
  for(const relative of ['Assets/Audio','Assets/Maps','Assets/Fonts','Assets/Shaders','Assets/Scenes','Assets/Scripts','project.json'])visit(relative);return result;
}
try{
  const before=snapshot();execFileSync(process.execPath,[fileURLToPath(new URL('./build-frostbound.mjs',import.meta.url))],{cwd:repo,env:{...process.env,MENGINE_FROST_BUILD_OUTPUT:output,MENGINE_FROST_MODEL_CATALOG:path.join(root,'model-catalog.json')},encoding:'utf8',timeout:120000});assert.deepEqual(snapshot(),before,'an independent output build must not write generated products back into its source project');
  const project=JSON.parse(fs.readFileSync(path.join(output,'project.json'),'utf8'));assert.ok(fs.existsSync(path.join(output,project.startupScript)));for(const scene of project.buildScenes)assert.ok(fs.existsSync(path.join(output,scene)));
  const world=JSON.parse(fs.readFileSync(path.join(output,project.mainScene),'utf8')).world,sounds=world.entities.filter(e=>e.components.AudioSource).map(e=>e.components.AudioSource.clip);assert.equal(sounds.length,5);for(const clip of sounds){const wav=fs.readFileSync(path.join(output,clip));assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.toString('ascii',8,12),'WAVE');assert.equal(wav.readUInt32LE(24),22050);assert.equal(wav.readUInt32LE(40)+44,wav.length);}
  for(const name of ['rocky-crossing','skirmish','moba','td','rpg','highland-pass','supply-road'])assert.ok(S.validateMap(JSON.parse(fs.readFileSync(path.join(output,'Assets/Maps',name+'.json'),'utf8'))));
  console.log('PASS independent Frost build output: source scripts/scenes/maps/audio/fonts/shaders unchanged, complete project entry points, five referenced PCM sounds and seven valid playable maps emitted into the requested output');
}finally{assert.ok(!fs.lstatSync(output).isSymbolicLink());fs.rmSync(output,{recursive:true,force:true});}
