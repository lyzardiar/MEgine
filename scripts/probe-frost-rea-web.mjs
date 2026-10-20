// Author: MiYu. Reproduce read-only Web evidence against the authenticated original Warcraft DLL.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url)),rea=path.join(root,'third_party/rea'),require=createRequire(path.join(rea,'package.json'));
const {Client}=require('@modelcontextprotocol/client'),{StdioClientTransport}=require('@modelcontextprotocol/client/stdio'),provider=require(path.join(rea,'rizin-source.json'));
const binary=process.argv[2]||'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Game.dll',expected='e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a';
const digest=raw=>createHash('sha256').update(raw).digest('hex'),out=path.join(root,'tmp/docs-artifacts/frost-crypt-web');
assert.equal(digest(fs.readFileSync(binary)),expected,'Version-specific addresses require this original Game.dll');
const probes=[
 ['identity','iz~CAbilityWeb;iz~CBuffWeb;iz~CMissileWeb',['CAbilityWeb','CBuffWebAir','CMissileWeb']],
 ['ability','pd 39 @ 0x6f5c2fc0;pxw 8 @ 0x6fa1dfc4;pd 6 @ 0x6f5cca10;pd 6 @ 0x6f5ccc80',['0x6fa1ddec','0x6f5cca10','WebIsMagic','0x1d8']],
 ['buff-types','pd 37 @ 0x6f5c0570;pd 37 @ 0x6f5c05e0;pxw 40 @ 0x6fa1d958;pxw 40 @ 0x6fa1dccc',['0x6fa1d61c','0x6fa1d990','0x6f59cac0','0x6f5ca8d0']],
 ['buff-apply','pd 171 @ 0x6f5ca8d0',['0x6f5dd040','0x6f478760','0x6f052af0','0x6f66a080']],
 ['ground-classification','pd 46 @ 0x6f66a080;pd 42 @ 0x6f67f100',['0xfffffffb','or    eax, 2','0x6f67c110','0x6f67f7e0']],
 ['altitude','pd 56 @ 0x6f67f7e0;pd 74 @ 0x6f67f91a;pd 23 @ 0x6f693270',['[esi + 0x20c]','[esi + 0x208]','0x6f052af0','moveFloor','moveHeight']],
 ['buff-expiry','pd 115 @ 0x6f5bbab0;pd 42 @ 0x6f5da770;pd 3 @ 0x6f5dc000',['0x6f478760','0x6f67f100','0x344','0xd01c1']],
 ['movement-lock','pd 20 @ 0x6f5dd040;pd 68 @ 0x6f5dcf60',['[esi + 0x7c]','0x6f5e2eb0','0x6f67ef60']],
 ['melee-range','pd 95 @ 0x6f5d2950',['[ecx + 0x114]','0x6f47ad70','0x6f478760']],
 ['missile-impact','pxw 16 @ 0x6fa1ddc8;pd 98 @ 0x6f5a9180;pd 80 @ 0x6f5aa080',['0x6f5a9180','0x6f5aa080','0x358','0x35c','0x6f46e090']],
];
const client=new Client({name:'frostbound-web-research',version:'1.0.0'}),reports=[];
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
  for(const marker of markers)assert.ok(r.stdout.includes(marker),name+': missing '+marker);
  reports.push({name,evidenceId:evidence.evidence_id,stdoutSha256:digest(r.stdout),markers});
  console.log('PASS REA Web '+name);
 }
 fs.writeFileSync(path.join(out,'rea-summary.json'),JSON.stringify({binarySha256:expected,reaSource:'https://github.com/morluto/rea',reaVersion:'6.5.0',probes:reports,originalRuntimeVerified:false,limitations:['Static evidence does not measure original runtime timing, dispel outcomes or client presentation.','The altitude transition selects unit fields +0x20c/+0x208; linking their initialization to source fields requires further analysis.']},null,2)+'\n');
}finally{await client.close();}
