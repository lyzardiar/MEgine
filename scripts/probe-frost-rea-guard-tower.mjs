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
 fs.writeFileSync(path.join(out,'rea-summary.json'),JSON.stringify({binarySha256:expected,reaSource:'https://github.com/morluto/rea',reaVersion:'6.5.0',probes:reports,originalRuntimeVerified:false,limitations:['Static evidence records source control flow; it does not measure original runtime timing or animation.','Range-buffer loading, repacking and launch checks are static evidence; original projectile solver, full collision geometry and frame timing still require runtime comparison.']},null,2)+'\n');
}finally{await client.close();}
