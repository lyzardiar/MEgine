// Author: MiYu. Native QuickJS battle execution and GPU rendering, independent of the Tauri bridge.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../',import.meta.url)),out=path.join(repo,'docs/designs/frostbound-realms'),qa=JSON.parse(fs.readFileSync(path.join(out,fs.existsSync(path.join(out,'status-effects-fixture.json'))?'status-effects-fixture.json':'native-status-effects-qa.json'))),executable=process.env.MENGINE_ASSET_PREVIEW_EXECUTABLE||'D:/MEngineNativeQA/tile-build-1790939800003/release/examples/render_asset_preview.exe',image=path.join(out,'classic-status-native-play.png');
assert.ok(fs.existsSync(qa.sample),'Run qa-frost-effects.mjs to prepare the isolated battlefield fixture');
const run=spawnSync(executable,[qa.sample,image,'--play-frames','18'],{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});assert.equal(run.status,0,run.stderr||run.error?.message);assert.ok(!/sampled effect:|cannot load texture|script error/i.test(run.stderr),run.stderr);
const world=JSON.parse(fs.readFileSync(image.replace('.png','.play.json'))),telemetry=JSON.parse(world.entities.find(e=>e.name==='Frost telemetry').components.Text.text),effects=world.entities.filter(e=>e.active!==false&&e.name?.startsWith('Classic status ')&&e.components.Transform.position[1]>-50),profile=JSON.parse(fs.readFileSync(image.replace('.png','.profile.json')));
assert.equal(telemetry.mode,'playing');assert.ok(effects.length>=16);assert.equal(profile.counts.materialPipelinesRejected,0);
const paths=effects.map(e=>e.components.SampledEffect.effect);for(const name of ['HealingSalveTarget','ClarityTarget','Staff_Sanctuary_Target','RejuvenationTarget','CrippleTarget','ElfLargeBuildingFire','UndeadLargeBuildingFire'])assert.ok(paths.some(p=>p.includes(name)),name);
const report={passed:true,method:'EditorPlayRuntime QuickJS, F1 ScriptInput, 18 fixed frames and native Game View GPU renderer',scope:'Native script execution and rendering. Tauri bridge and physical input/audio are separate acceptance paths.',sample:qa.sample,executableSha256:crypto.createHash('sha256').update(fs.readFileSync(executable)).digest('hex'),imageSha256:crypto.createHash('sha256').update(fs.readFileSync(image)).digest('hex'),activeEffects:effects.length,sources:[...new Set(paths)],telemetry,counts:profile.counts};
fs.writeFileSync(path.join(out,'native-status-effects-play.json'),JSON.stringify(report,null,2)+'\n');console.log('PASS native QuickJS battle and GPU render:',effects.length,'original effect roots, no rejected pipelines');
