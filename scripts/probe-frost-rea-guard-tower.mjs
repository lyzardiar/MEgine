// Author: MiYu. Reproduce Guard Tower static evidence against the authenticated original Warcraft DLL.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url)),rea=path.join(root,'third_party/rea'),require=createRequire(path.join(rea,'package.json'));
const {Client}=require('@modelcontextprotocol/client'),{StdioClientTransport}=require('@modelcontextprotocol/client/stdio'),provider=require(path.join(rea,'rizin-source.json'));
const binary=process.argv[2]||'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Game.dll',expected='e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a';
const digest=raw=>createHash('sha256').update(raw).digest('hex'),out=path.join(root,'tmp/docs-artifacts/frost-guard-tower');
assert.equal(digest(fs.readFileSync(binary)),expected,'Version-specific addresses require this original Game.dll');
const probes=[
 ['weapon-fields','iz~Missilearc;iz~Missilespeed;iz~dmgpt1;iz~backSw1;pxw 64 @ 0x6fa51080',['Missilearc','Missilespeed','dmgpt1','backSw1','0x6fa51a58','0x6fa51a80']],
 ['unit-weapon-loader','pd 80 @ 0x6f693ad8',['str.acquire','str.launchX','str.launchY','str.launchZ','str.impactZ','0x6f689500']],
 ['range-buffer-source','pd 28 @ 0x6f693e71;pd 13 @ 0x6f68b880',['str.RngBuff','esi + 0x734','eax + 0x1cd','0x6f68fb30']],
 ['range-buffer-cache','pd 12 @ 0x6f64ed43;pd 9 @ 0x6f64cd5d;pd 22 @ 0x6f65b137',['0x6f68b880','ebx + 0x60','eax*4 + 0x108','ebx, 0xa0','0x6f64cd00','ebx + 8']],
 ['range-buffer-repack','pd 8 @ 0x6f6532be;pd 28 @ 0x6f653ad0;pd 7 @ 0x6f653c29',['ebp - 0x1b0','0x6f65aea0','ebp - 0x2c0','esi + 0x68','edi*4 - 0x108','esi - 0x60','ebp - 0x2e0','0x6f47f380']],
 ['range-buffer-install','pd 5 @ 0x6f47f41c;pd 16 @ 0x6f47f6d8',['ebx, 4','ecx*8 + 0x254','ebx + 0x20','eax, 0x4d','edi + eax*8','ebx + 0x24']],
 ['range-buffer-release','pd 17 @ 0x6f47ce99;pd 55 @ 0x6f477065',['0x6f476f80','0x6f47ad70','eax*8 + 0x26c','0x6f0529d0','0x6f03e3a0','0x6f4779f8']],
 ['range-start-check','pd 13 @ 0x6f47addc;pD 77 @ 0x6f47cd34',['edi*8 + 0x258','0x6f47adf0','0x6f03e3a0']],
 ['collision-source','pd 6 @ 0x6f69379e;pd 10 @ 0x6f68b560;pd 4 @ 0x6f64f2d4;pd 4 @ 0x6f656bab',['str.collision','esi + 0x3f8','ecx + 0x3f8','0x6f68fb30','ebx + 0x19c','ecx + 0x19c']],
 ['collision-install','pd 4 @ 0x6f6435d1;pxw 8 @ 0x6fa4a86c;pd 23 @ 0x6f676e70;pd 32 @ 0x6f03f100;pd 12 @ 0x6f10c640',['0x6fa4a704','0x6f656bc0','0x6f676e70','eax + 0x168','edi + 0x164','0x6f03f100','0xfd800000','0x6f10c640','ecx + 0x90']],
 ['collision-minimum','pd 3 @ 0x6f001b30;pd 13 @ 0x6f656bc0',['edx, 1','0x6fbb81d8','0x6f053b90','ecx + 0x30','0x6f656b50']],
 ['collision-distance','pd 47 @ 0x6f03e3c3',['0xfd800000','edi + 0x90','esi + 0x90','0x6f0529d0','0x6fb593e8','0x6f0527e0']],
 ['collision-plane','pd 32 @ 0x6f03e446;pd 47 @ 0x6f03ebf0',['0x6f10d790','0x6f03ebf0','esi + 0x78','edi + 0x78','0x6f053660','ebx + 0x80','ebx + 0x84','ebx + 0x78','ebx + 0x7c']],
 ['collision-boundary','pd 25 @ 0x6f03e491;pxw 4 @ 0x6fb59398;pxw 4 @ 0x6fb593e8',['0x6f0528b0','0x6fb59398','0x6f03e4d3','0x3a83126f','0x3efae148']],
 ['acquisition-source','pd 6 @ 0x6f693ad8;pd 10 @ 0x6f6893f0;pd 4 @ 0x6f64eb84;pd 4 @ 0x6f64bd6b',['str.acquire','esi + 0x5e4','ecx + 0x5e4','0x6f6893f0','ebx + 0x194','ecx + 0x194']],
 ['acquisition-distance','pd 8 @ 0x6f49fb62;pd 13 @ 0x6f67a770;pd 7 @ 0x6f47eca0;pd 23 @ 0x6f47b757;pd 21 @ 0x6f480aff',['0x6f64bd10','0x6f67a770','0x6f47eca0','ecx + 0x240','edi + 0x244','0x6f47ae90','0x6f47b720','0x6f03e3a0']],

];
const client=new Client({name:'frostbound-tower-research',version:'1.0.0'}),reports=[];
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
  const assembly=r.stdout.replace(/\bfcn\.([0-9a-f]+)/g,'0x$1');
  for(const marker of markers)assert.ok(assembly.includes(marker),name+': missing '+marker);
  reports.push({name,evidenceId:evidence.evidence_id,stdoutSha256:digest(r.stdout),markers});
  console.log('PASS REA Guard Tower '+name);
 }
 fs.writeFileSync(path.join(out,'rea-summary.json'),JSON.stringify({binarySha256:expected,reaSource:'https://github.com/morluto/rea',reaVersion:'6.5.0',probes:reports,originalRuntimeVerified:false,limitations:['Static evidence records source control flow; it does not measure original runtime timing or animation.','Range-buffer loading, repacking and launch checks are static evidence; body-radius range, planar position and acquisition checks are static evidence; original projectile solver, moving-body interpolation and bit-exact arithmetic still require runtime comparison.']},null,2)+'\n');
}finally{await client.close();}
