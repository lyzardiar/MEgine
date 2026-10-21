// Author: MiYu. Bounded original Game.dll Cloud of Fog and Magic Leash call-chain evidence.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url)),rea=path.join(root,'third_party/rea'),require=createRequire(path.join(rea,'package.json'));
const {Client}=require('@modelcontextprotocol/client'),{StdioClientTransport}=require('@modelcontextprotocol/client/stdio'),provider=require(path.join(rea,'rizin-source.json'));
const binary=process.argv[2]||'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Game.dll',expected='e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a';
const digest=raw=>createHash('sha256').update(raw).digest('hex'),out=path.join(root,'tmp/docs-artifacts/frost-human-aviary/rea/channels');
assert.equal(digest(fs.readFileSync(binary)),expected);
const probes=[
 ['class-vtables','pxw 416 @ 0x6f9cc640;pxw 416 @ 0x6fa3dc0c;pxw 416 @ 0x6f9cc1cc;pxw 416 @ 0x6fa3e04c;pxw 416 @ 0x6fa3e3b4'],
 ['cloud-cast','af @ 0x6f4ac650;pdf @ 0x6f4ac650;af @ 0x6f5e98f0;pdf @ 0x6f5e98f0;af @ 0x6f5ed4a0;pdf @ 0x6f5ed4a0;af @ 0x6f667a80;pdf @ 0x6f667a80'],
 ['leash-cast','af @ 0x6f611ff0;pdf @ 0x6f611ff0;af @ 0x6f626920;pdf @ 0x6f626920;af @ 0x6f6251a0;pdf @ 0x6f6251a0;af @ 0x6f673ae0;pdf @ 0x6f673ae0'],
 ['leash-buffs','af @ 0x6f513a00;pdf @ 0x6f513a00;af @ 0x6f513990;pdf @ 0x6f513990;af @ 0x6f613e20;pdf @ 0x6f613e20;af @ 0x6f50fa90;pdf @ 0x6f50fa90'],
 ['cloud-buff','af @ 0x6f500660;pdf @ 0x6f500660;af @ 0x6f4cd380;pdf @ 0x6f4cd380;af @ 0x6f4b9df0;pdf @ 0x6f4b9df0'],
 ['cloud-effect','pxw 192 @ 0x6f9cc580;af @ 0x6f6bc3b0;pdf @ 0x6f6bc3b0;af @ 0x6f6a0ae0;pdf @ 0x6f6a0ae0;af @ 0x6f4e36d0;pdf @ 0x6f4e36d0'],
 ['leash-target-check','af @ 0x6f608cf0;pdf @ 0x6f608cf0;af @ 0x6f613e20;pdf @ 0x6f613e20;af @ 0x6f4181c0;pdf @ 0x6f4181c0'],
 ['cloud-mask-and-targets','af @ 0x6f4bdb50;pdf @ 0x6f4bdb50;af @ 0x6f49c650;pdf @ 0x6f49c650;af @ 0x6f4fab00;pdf @ 0x6f4fab00;af @ 0x6f4a17d0;pdf @ 0x6f4a17d0;af @ 0x6f68abb0;pdf @ 0x6f68abb0'],
 ['leash-damage-and-clock','af @ 0x6f4a8890;pdf @ 0x6f4a8890;af @ 0x6f4a8620;pdf @ 0x6f4a8620;af @ 0x6f2298f0;pdf @ 0x6f2298f0;af @ 0x6f0430d0;pdf @ 0x6f0430d0'],
 ['leash-initialized-period','pd 3 @ 0x6f7718b4;pd 2 @ 0x6f77267c;ii~initterm;pxw 8 @ 0x6f94ebc8;pd 4 @ 0x6f001b30;pd 4 @ 0x6f001a30;af @ 0x6f053b90;pdf @ 0x6f053b90;af @ 0x6f4c7540;pdf @ 0x6f4c7540;pxw 32 @ 0x6fa3e70c;af @ 0x6f685690;pdf @ 0x6f685690'],
 ['cloud-target-defaults','pxw 400 @ 0x6fb6a0b0;af @ 0x6f68c7b0;pdf @ 0x6f68c7b0;af @ 0x6f68aa30;pdf @ 0x6f68aa30;af @ 0x6f691240;pdf @ 0x6f691240;af @ 0x6f68a650;pdf @ 0x6f68a650'],
 ['cloud-weapon-gate','pxw 16 @ 0x6f9cc614;af @ 0x6f4bf1f0;pdf @ 0x6f4bf1f0;af @ 0x6f47a670;pdf @ 0x6f47a670;af @ 0x6f47c060;pdf @ 0x6f47c060;af @ 0x6f47bfc0;pdf @ 0x6f47bfc0;af @ 0x6f39c990;pdf @ 0x6f39c990'],
 ['cloud-weapon-source','pd 20 @ 0x6f693bf1;pd 18 @ 0x6f693c41;af @ 0x6f689580;pdf @ 0x6f689580;af @ 0x6f6896c0;pdf @ 0x6f6896c0;af @ 0x6f68a570;pdf @ 0x6f68a570;af @ 0x6f68bc10;pdf @ 0x6f68bc10'],
 ['cloud-weapon-loading','pd 14 @ 0x6f64ec55;pd 5 @ 0x6f64ed1d;af @ 0x6f64cdf0;pdf @ 0x6f64cdf0;af @ 0x6f64ce60;pdf @ 0x6f64ce60;pd 8 @ 0x6f65b140;pd 5 @ 0x6f65b1d6;pd 4 @ 0x6f653b0f;pd 2 @ 0x6f653b6c;pd 9 @ 0x6f47f459;pd 2 @ 0x6f47f6ba'],
];
fs.mkdirSync(out,{recursive:true});
const client=new Client({name:'frostbound-human-aviary-channels',version:'1.0.0'}),reports=[];
try{
 await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(rea,'node_modules/rea-agents/scripts/rea.mjs'),'mcp'],env:{...process.env,REA_RIZIN_COMMAND:path.join(rea,provider.localExecutable)},stderr:'inherit'}));
 for(const [name,command] of probes){
  const result=await client.callTool({name:'execute_rizin_command',arguments:{path:binary,command:'e scr.color=0;'+command}});
  assert.notEqual(result.isError,true,JSON.stringify(result));
  const evidence=result.structuredContent||JSON.parse(result.content.find(c=>c.type==='text').text),r=evidence.normalized_result;
  assert.equal(evidence.subject.digest.sha256,expected);assert.equal(r.artifact_sha256_after,expected);
  assert.equal(r.artifact_changed,false);assert.equal(r.completion_status,'complete');assert.equal(r.output_truncated,false);assert.equal(r.exit_code,0);
  fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(evidence,null,2)+'\n');
  reports.push({name,evidenceId:evidence.evidence_id,stdoutSha256:digest(r.stdout)});
  console.log('PASS REA '+name);
 }
 fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({binarySha256:expected,probes:reports,originalRuntimeVerified:false},null,2)+'\n');
}finally{await client.close();}
