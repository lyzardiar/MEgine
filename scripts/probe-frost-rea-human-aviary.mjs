// Author: MiYu. Preserve bounded original human aviary upgrade, missile routing and getter evidence.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url)),rea=path.join(root,'third_party/rea'),require=createRequire(path.join(rea,'package.json'));
const {Client}=require('@modelcontextprotocol/client'),{StdioClientTransport}=require('@modelcontextprotocol/client/stdio'),provider=require(path.join(rea,'rizin-source.json'));
const binary=process.argv[2]||'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Game.dll',expected='e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a';
const digest=raw=>createHash('sha256').update(raw).digest('hex'),out=path.join(root,'tmp/docs-artifacts/frost-human-aviary/rea');
assert.equal(digest(fs.readFileSync(binary)),expected,'Version-specific addresses require this original Game.dll');
const probes=[
 ['aviary-identities','pd 2 @ 0x6f57bef0;pd 2 @ 0x6f57e770;pd 2 @ 0x6f6906c0;pd 2 @ 0x6f691b80;pd 2 @ 0x6f6b4910;pd 2 @ 0x6f4b94e0;pd 2 @ 0x6f4b89b0;pd 2 @ 0x6f61c2c0;px 20 @ 0x6fa3e72c;pd 2 @ 0x6f61ba00',['CAbilityStormHammers','0x41737468','CUpgradeAttackSpillDistance','0x72617364','CMissileLine','CAbilityCloudOfFog','0x41636c66','0x416d6c73']],
 ['aviary-spill-upgrade','pxw 144 @ 0x6fa4ec80;af @ 0x6f698980;pdf @ 0x6f698980;af @ 0x6f478b50;pdf @ 0x6f478b50',['0x6f698980','0x6f689b40','0x6f478b50','ecx + 0x10c','add   ebx, 0x10','test  ecx, esi']],
 ['aviary-weapon-dispatch','pD 300 @ 0x6f689580;pxw 32 @ 0x6f477a2c;pd 48 @ 0x6f47762f;pd 32 @ 0x6f477702;pd 26 @ 0x6f3f8930;pd 3 @ 0x6f6b4810;pxw 204 @ 0x6fa506bc',['str.mline','0x6f47762f','0x6f479f50','0x6f6b60d0','0x422d4d6c','0xbc','0x134']],
 ['aviary-primary-and-spill','af @ 0x6f6b60d0;pdf @ 0x6f6b60d0;af @ 0x6f6b26c0;pdf @ 0x6f6b26c0;pd 18 @ 0x6f6b4aa0;af @ 0x6f6b8b20;pdf @ 0x6f6b8b20',['ebx + 0x84','ebx + 0x88','0x6f6b1500','0x6f03ee40','0xd01aa','0x6f03e790','esi + 0xa0']],
 ['aviary-spill-collision','af @ 0x6f6b7790;pdf @ 0x6f6b7790;af @ 0x6f6af320;pdf @ 0x6f6af320;af @ 0x6f6b0320;pdf @ 0x6f6b0320',['0x6f6af320','edi + 0xbc','0x6f0527e0','0x6f6b0320','0x6f6b1500','cmp   edi, esi','0x6f68abb0']],
 ['aviary-missile-list-fallback','pd 22 @ 0x6f338c3d;af @ 0x6f3246d0;pdf @ 0x6f3246d0;af @ 0x6f325670;pdf @ 0x6f325670;af @ 0x6f3256f0;pdf @ 0x6f3256f0;pd 22 @ 0x6f3256c0',['str.Missilespeed','str.Missilearc','str.Missileart','str.missileModelPath','str.rangeMissileArc','str.rangeMissileSpeed','str.rangeMissileHoming','cmovb','xor   eax, eax']],
 ['aviary-selected-weapon-getters','pxw 16 @ 0x6f9ae080;af @ 0x6f47b4a0;pdf @ 0x6f47b4a0;af @ 0x6f47b4f0;pdf @ 0x6f47b4f0;pd 10 @ 0x6f47b4d0;pd 24 @ 0x6f3f6cf0',['ecx + 0x2b8','0x6f325670','0x6f3256f0','0x6f3256c0','0x2c4','0x2c8']],
];
const client=new Client({name:'frostbound-human-aviary-research',version:'1.0.0'}),reports=[];
fs.mkdirSync(out,{recursive:true});
try{
 await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(rea,'node_modules/rea-agents/scripts/rea.mjs'),'mcp'],env:{...process.env,REA_RIZIN_COMMAND:path.join(rea,provider.localExecutable)},stderr:'inherit'}));
 for(const [name,command,markers] of probes){
  const result=await client.callTool({name:'execute_rizin_command',arguments:{path:binary,command:'e scr.color=0;'+command}});
  assert.notEqual(result.isError,true,JSON.stringify(result));
  const evidence=result.structuredContent||JSON.parse(result.content.find(c=>c.type==='text').text),r=evidence.normalized_result;
  fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(evidence,null,2)+'\n');
  assert.equal(evidence.subject.digest.sha256,expected);assert.equal(r.artifact_sha256_after,expected);
  assert.equal(r.artifact_changed,false);assert.equal(r.completion_status,'complete');assert.equal(r.output_truncated,false);assert.equal(r.exit_code,0);
  assert.ok(!r.stderr.includes('ERROR:'),name+': '+r.stderr);
  const assembly=r.stdout.replace(/\bfcn\.([0-9a-f]+)/g,'0x$1');
  for(const marker of markers)assert.ok(assembly.includes(marker),name+': missing '+marker);
  reports.push({name,evidenceId:evidence.evidence_id,stdoutSha256:digest(r.stdout),markers});
  console.log('PASS REA '+name);
 }
 fs.writeFileSync(path.join(out,'rea-summary.json'),JSON.stringify({binarySha256:expected,probes:reports,originalRuntimeVerified:false,limitations:['These are static original-binary observations.','Collision event order, overlap, repeated contacts, geometry and final damage/immunity need separate gameplay validation.','The singleton unit missile getters clamp to the final available entry; absent homing returns zero.','Cloud and Aerial Shackles are identified only; full channel behavior is outside this stage.']},null,2)+'\n');
}finally{await client.close();}
