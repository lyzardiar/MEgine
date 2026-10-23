// Author: MiYu. Reproduce source table references and optional doodad life-state evidence in the authenticated Warcraft DLL.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url)),rea=path.join(root,'third_party/rea'),require=createRequire(path.join(rea,'package.json'));
const {Client}=require('@modelcontextprotocol/client'),{StdioClientTransport}=require('@modelcontextprotocol/client/stdio'),provider=require(path.join(rea,'rizin-source.json'));
const binary=process.argv.slice(2).find(arg=>!arg.startsWith('--'))||'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Game.dll',expected='e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a';
const digest=raw=>createHash('sha256').update(raw).digest('hex'),out=path.join(root,'tmp/docs-artifacts/frost-original-doodads');
assert.equal(digest(fs.readFileSync(binary)),expected,'Version-specific addresses require this original Game.dll');
const lifeOnly=process.argv.includes('--life'),flagsOnly=process.argv.includes('--flags'),standOnly=process.argv.includes('--stand'),cycleOnly=process.argv.includes('--cycle');
assert.ok([lifeOnly,flagsOnly,standOnly,cycleOnly].filter(Boolean).length<=1,'Select one probe group');
const probes=cycleOnly?[
 ['doodad-cycle-update','af @ 0x6f74e930;pdf @ 0x6f74e930;af @ 0x6f751840;pdf @ 0x6f751840;af @ 0x6f75c030;pdf @ 0x6f75c030',['cvttss2si','0x6f751840','0x6f75c030','0x6f12ef70','0x6f75e840','0x6f12fa50']],
 ['doodad-cycle-clock','af @ 0x6f77a1e0;pdf @ 0x6f77a1e0;af @ 0x6f77ba30;pdf @ 0x6f77ba30;af @ 0x6f77a370;pdf @ 0x6f77a370',['0x54','0x20','0x6f77ba30','0x6f77be00','0x3c','0x40']],
 ['doodad-cycle-callback','af @ 0x6f75e840;pdf @ 0x6f75e840;af @ 0x6f7592a0;pdf @ 0x6f7592a0',['0x144','0x28','0x140','0x150','0x6f6f20b0']],
]:standOnly?[
 ['doodad-stand-tags','af @ 0x6f6a6f50;pdf @ 0x6f6a6f50;af @ 0x6f707d80;pdf @ 0x6f707d80',['str.stand','str.work','str.alternate','0x6f18e490','0x6f12068e']],
 ['doodad-stand-choice','af @ 0x6f6f19f0;pdf @ 0x6f6f19f0;af @ 0x6f7011a0;pdf @ 0x6f7011a0;af @ 0x6f704ee0;pdf @ 0x6f704ee0',['0x6f709d50','0x6f7011a0','cvttss2si','0x6f704ee0','MSVCR120.dll_rand']],
 ['doodad-stand-rarity','pd 16 @ 0x6f785330;pd 1 @ 0x6f771f98;af @ 0x6f778ab0;pdf @ 0x6f778ab0',['0x6f771f98','divss','_libm_sse2_pow_precise','0x10']],
]:flagsOnly?[
 ['doodad-flags-dispatch','af @ 0x6f751980;pdf @ 0x6f751980;af @ 0x6f7518a0;pdf @ 0x6f7518a0',['0x6f6d5790','0x6fbed448','test  al, 1','test  al, 2','shr   eax, 2','0x110']],
 ['doodad-flags-write','pd 29 @ 0x6f75b6f6',['0x6f72d8e0','0x4c','or    bl, 2','or    bl, 4','0x6f04dfa0']],
]:lifeOnly?[
 ['doodad-life-read','pd 14 @ 0x6f7569be;pd 17 @ 0x6f7571c0;pd 14 @ 0x6f74eaa0',['0x6f04d3b0','0x6f75c5f0','0x14']],
 ['doodad-life-state','af @ 0x6f75c5f0;pdf @ 0x6f75c5f0;af @ 0x6f7592a0;pdf @ 0x6f7592a0',['0x87','0x14c','0x150','str.death','0x6f6f1f50']],
 ['doodad-death-seek','af @ 0x6f6f1f50;pdf @ 0x6f6f1f50',['Ordinal_509','0x6f12fa70','0x6f12f500','cmovne']],
]:[['doodad-strings','ps @ 0x6f965e68;ps @ 0x6fa52a34;ps @ 0x6fa50210',['.doo','Doodads','DestructableData']],['doodad-source-references','pd 2 @ 0x6f7537c0;pd 14 @ 0x6f1c0800;pd 14 @ 0x6f1cce20;pd 2 @ 0x6f6bf922;pd 5 @ 0x6f6a4817',['0x6f965e68','str..w3b','str..w3d','0x6f1c0710','0x6f1ccd70','0x6f6c0790','0x6f17c020']]];
const client=new Client({name:'frostbound-doodad-research',version:'1.0.0'}),reports=[];
fs.mkdirSync(out,{recursive:true});
try{
 await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(rea,'node_modules/rea-agents/scripts/rea.mjs'),'mcp'],env:{...process.env,REA_RIZIN_COMMAND:path.join(rea,provider.localExecutable)},stderr:'inherit'}));
 for(const [name,command,markers] of probes){
  const result=await client.callTool({name:'execute_rizin_command',arguments:{path:binary,command:'e scr.color=0;'+command}});
  assert.notEqual(result.isError,true,JSON.stringify(result));
  const evidence=result.structuredContent||JSON.parse(result.content.find(c=>c.type==='text').text),r=evidence.normalized_result;
  fs.writeFileSync(path.join(out,name+'-rea.json'),JSON.stringify(evidence,null,2)+'\n');
  fs.writeFileSync(path.join(out,name+'-rea.txt'),r.stdout);
  assert.equal(evidence.subject.digest.sha256,expected);assert.equal(r.artifact_sha256_after,expected);
  assert.equal(r.artifact_changed,false);assert.equal(r.completion_status,'complete');assert.equal(r.output_truncated,false);assert.equal(r.exit_code,0);
  assert.ok(!r.stderr.includes('ERROR:'),name+': '+r.stderr);
  assert.ok(!r.stdout.includes('invalid'),name+': invalid instruction alignment');
  const assembly=r.stdout.replace(/\bfcn\.([0-9a-f]+)/g,'0x$1');
  for(const marker of markers)assert.ok(assembly.includes(marker),name+': missing '+marker);
  reports.push({name,evidenceId:evidence.evidence_id,stdoutSha256:digest(r.stdout),markers});
  console.log('PASS REA original doodads '+name);
 }
 const limitations=cycleOnly?['Source forward Stand completion and seek; pair with probe-frost-rea-doodad-cycle-cpu.py for bounded execution.','Visibility gating, special state queues, original shared RNG order and particle simulation remain unverified.']:standOnly?['Source tag ranking, rarity normalization and weighted selection; pair with probe-frost-rea-doodad-stand-cpu.py for bounded execution.','Original RNG initialization/call order, complete animation scheduling and rendering remain unverified.']:flagsOnly?['Source dispatch and flags serialization only; pair with probe-frost-rea-doodad-flags-cpu.py for bounded execution.','Complete object creation, collisions, pathing and live original rendering remain unverified.']:lifeOnly?['Source life and named-sequence branch evidence; pair with probe-frost-rea-doodad-life-cpu.py for bounded execution.','Flags visibility, Stand random variants, original rendering and complete runtime scheduling remain unverified.']:['Static references locate extensions and source tables; they do not establish DOO field layouts or loader semantics.','Placement decoding is independently cross-checked; original runtime instantiation, animation, drops and pathing remain unverified.'];
 fs.writeFileSync(path.join(out,cycleOnly?'rea-cycle-summary.json':standOnly?'rea-stand-summary.json':flagsOnly?'rea-flags-summary.json':lifeOnly?'rea-life-summary.json':'rea-summary.json'),JSON.stringify({binarySha256:expected,reaSource:'https://github.com/morluto/rea',reaVersion:'6.5.0',probes:reports,originalRuntimeVerified:false,limitations},null,2)+'\n');
}finally{await client.close();}
