// Author: MiYu. Reproduce Siege Engine Barrage, Chaos conversion and training availability static evidence against the authenticated original Warcraft DLL.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url)),rea=path.join(root,'third_party/rea'),require=createRequire(path.join(rea,'package.json'));
const {Client}=require('@modelcontextprotocol/client'),{StdioClientTransport}=require('@modelcontextprotocol/client/stdio'),provider=require(path.join(rea,'rizin-source.json'));
const binary=process.argv[2]||'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Game.dll',expected='e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a';
const digest=raw=>createHash('sha256').update(raw).digest('hex'),out=path.join(root,'tmp/docs-artifacts/frost-siege-engine');
assert.equal(digest(fs.readFileSync(binary)),expected,'Version-specific addresses require this original Game.dll');
const probes=[
 ['siege-identities','pd 2 @ 0x6f57bcd0;pd 2 @ 0x6f57e550;pd 2 @ 0x6f4b9480;pd 2 @ 0x6f4bbb10;pd 2 @ 0x6f690620;pd 2 @ 0x6f691ae0',['CAbilityBarrage','0x41726f63','CAbilityChaos','0x41636861','CUpgradeAddTechMaxAllowed','0x72746d61']],
 ['chaos-unit-change','af @ 0x6f3fad70;pdf @ 0x6f3fad70;af @ 0x6f4ac3b0;pdf @ 0x6f4ac3b0',['eax + ecx + 0x44','0x6f3fad70','0x6f653220','0x6f65ae60','0x6f676610']],
 ['chaos-availability','af @ 0x6f4ae840;pdf @ 0x6f4ae840',['esi + 0x3c','eax + 0x268','0xd01c1','0x6f043700','0x6f672a90','0x6f672880']],
 ['training-availability','af @ 0x6f6985d0;pdf @ 0x6f6985d0',['0x6f689b40','0x6f0528b0','0x6f052f30','edi + 0x34','0x6f2486e0','0x7fffffff','esi - 1','0x6f24d360']],
 ['barrage-real-vtable','pD 70 @ 0x6f576e30;pxw 8 @ 0x6fa16c04;pxw 4 @ 0x6fa16dbc;pd 2 @ 0x6f589250',['0x6fa16ab4','0x6f571fa0','0x6f3f0ce0','0x6f589250','0xd01f8']],
 ['barrage-weapon-routing','pD 300 @ 0x6f689580;pxw 32 @ 0x6f477a2c;pD 180 @ 0x6f47719a;pD 220 @ 0x6f4772e0',['str.missile','str.instant','str.mline','0x6f4772e0','0x6f47719a','0x6f6620e0','0x6f6624a0','0x6f479df0','0x6f6b5d20']],
 ['barrage-virtual-dispatch','af @ 0x6f6624a0;pdf @ 0x6f6624a0;af @ 0x6f6620e0;pdf @ 0x6f6620e0;pd 2 @ 0x6f3f0ce0',['eax + 0x150','eax + 0x154','xor   eax, eax','ret   8']],
 ['barrage-attack-context','af @ 0x6f571fa0;pdf @ 0x6f571fa0',['ebx + 0x3c','eax + 0x268','0x6f3f74d0','0x6f3f7470','add   eax, 0x44','0x6f3f6920','eax + 0x308','0x6f6b91d0']],
 ['barrage-enumeration','af @ 0x6f6b91d0;pdf @ 0x6f6b91d0',['0x6f6b94d0','0x6f661060','0x6f6b9470','0x6f78bfc0','cmp   esi, ecx','jg    0x6f6b93e7','0x6f6b6770']],
 ['barrage-targets','af @ 0x6f6b94d0;pdf @ 0x6f6b94d0;af @ 0x6f66e820;pdf @ 0x6f66e820',['0x6f6526a0','0x6f654740','0x6f03df80','0x6f6b7550','cmp   ecx, dword [edx + 0x14]','setne al']],
 ['barrage-missile','af @ 0x6f6b6770;pdf @ 0x6f6b6770',['esi + 0x24','0x6f324760','0x6f324730','0x6f324780','0x6f3ff2e0','esi + 0x30','esi + 0x2c','0x6f6b5d20']],
];
const client=new Client({name:'frostbound-siege-engine-research',version:'1.0.0'}),reports=[];
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
  console.log('PASS REA Siege Engine '+name);
 }
 fs.writeFileSync(path.join(out,'rea-summary.json'),JSON.stringify({binarySha256:expected,reaSource:'https://github.com/morluto/rea',reaVersion:'6.5.0',probes:reports,originalRuntimeVerified:false,limitations:['Static observations bind the preserved Aroc, Acha and rtma source rows to native classes and their dispatch paths.','The isolated native asset preview does not exercise Warcraft gameplay; full Chaos state preservation, attack-slot selection, all masks/immunities and source-engine animation dispatch remain separate verification requirements.']},null,2)+'\n');
}finally{await client.close();}
