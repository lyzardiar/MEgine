// Author: MiYu. Reproduce Cannon Tower damage evidence against the authenticated original Warcraft DLL.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url)),rea=path.join(root,'third_party/rea'),require=createRequire(path.join(rea,'package.json'));
const {Client}=require('@modelcontextprotocol/client'),{StdioClientTransport}=require('@modelcontextprotocol/client/stdio'),provider=require(path.join(rea,'rizin-source.json'));
const binary=process.argv[2]||'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Game.dll',expected='e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a';
const digest=raw=>createHash('sha256').update(raw).digest('hex'),out=path.join(root,'tmp/docs-artifacts/frost-cannon-tower');
assert.equal(digest(fs.readFileSync(binary)),expected,'Version-specific addresses require this original Game.dll');
const probes=[
 ['artillery-identity','pd 2 @ 0x6f6b4860;pd 25 @ 0x6f5566d0;pxw 20 @ 0x6fa055a8',['CArtillery','0x6fa054e8','0x6f6b57d0','0x6f6b8d10']],
 ['artillery-source-fields','pd 17 @ 0x6f693ca0;pd 50 @ 0x6f694010',['splashTargs','Farea','Harea','edi, 2']],
 ['artillery-band-fields','pd 65 @ 0x6f6b4de0',['ebx + 0x88','ebx + 0x8c','ebx + 0x90','ebx + 0x80','ebx + 0x84']],
 ['artillery-band-selection','pd 130 @ 0x6f6b8d10',['0x6f03e260','esi + 0xb8','esi + 0xc0','esi + 0xa8','esi + 0xc8','esi + 0xb0','0x6f6b1500']],
 ['artillery-ground-endpoint','pd 36 @ 0x6f6b57d0',['ebx + 4','0x6f76fab0','edi + 0x78','0x6f773840']],
 ['artillery-collision','pd 99 @ 0x6f03e260',['esi + 0x90','0x6f0529d0','0x6f0527e0','0x6f03ebf0','0x6f053660','0x6fb59398']],
];
const client=new Client({name:'frostbound-cannon-tower-research',version:'1.0.0'}),reports=[];
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
  console.log('PASS REA Cannon Tower '+name);
 }
 fs.writeFileSync(path.join(out,'rea-summary.json'),JSON.stringify({binarySha256:expected,reaSource:'https://github.com/morluto/rea',reaVersion:'6.5.0',probes:reports,originalRuntimeVerified:false,limitations:['Static evidence binds artillery identity, per-slot splash data, damage bands and collision overlap. Full original runtime, target enumeration and target-mask filtering are not exercised.']},null,2)+'\n');
}finally{await client.close();}
