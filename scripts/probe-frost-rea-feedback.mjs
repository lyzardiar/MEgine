// Author: MiYu. Reproduce Feedback damage evidence against the authenticated original Warcraft DLL.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url)),rea=path.join(root,'third_party/rea'),require=createRequire(path.join(rea,'package.json'));
const {Client}=require('@modelcontextprotocol/client'),{StdioClientTransport}=require('@modelcontextprotocol/client/stdio'),provider=require(path.join(rea,'rizin-source.json'));
const binary=process.argv[2]||'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Game.dll',expected='e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a';
const digest=raw=>createHash('sha256').update(raw).digest('hex'),out=path.join(root,'tmp/docs-artifacts/frost-feedback');
assert.equal(digest(fs.readFileSync(binary)),expected,'Version-specific addresses require this original Game.dll');
const probes=[
 ['feedback-identity','pd 2 @ 0x6f57e630;pd 5 @ 0x6f5671d0;pxw 12 @ 0x6fa15300;pxw 16 @ 0x6fa155c8',['0x4166626b','CAbilityFeedback','0x6f572410','0x6f5722b0','0x6f56b1f0']],
 ['feedback-source-fields','pd 30 @ 0x6f3f7410;pd 30 @ 0x6f3f7470;pd 30 @ 0x6f3f74d0;pd 30 @ 0x6f3f7530;pd 30 @ 0x6f3f7590',['ecx + 0x20','ecx + 0x24','ecx + 0x28','ecx + 0x2c','ecx + 0x30']],
 ['feedback-launch','pd 84 @ 0x6f57247e;pd 5 @ 0x6f57256b',['0x6f3f7590','ebx + 0x248','0x6f3f74d0','0x6f3f7410','0x6f3f7530','0x6f3f7470','edi + 0x48','edi + 0x74','edi + 0x44','edi + 0x3c','edi + 0x40']],
 ['feedback-projectile-fields','pd 31 @ 0x6f6b58e2;pd 17 @ 0x6f6b5d28',['edi + 0x3c','esi + 0x38','edi + 0x40','esi + 0x3c','edi + 0x48','esi + 0x48','edi + 0x58','esi + 0x5c','edi + 0x74','ebx + 0x98']],
 ['feedback-impact','pd 62 @ 0x6f56b1f0;pd 4 @ 0x6f56b2e5',['CMissileFeedback::DealDamage','0x6f03adf0','0x6f67c940','ebx + 0x9c','0x6f0527e0','ebx + 0x48','0x6f03ae60','0x6f6b2450']],
 ['feedback-damage-packet','pd 45 @ 0x6f6b6f1e;pd 31 @ 0x6f68c891;pd 7 @ 0x6f6b1632',['ebx + 0x38','0x6f685690','ebx + 0x5c','esi + 0x20','0x6f68c870','ebx + 0x10','ebx + 0x18','ebx + 0x1c','edx + 0x120']],
 ['feedback-armor-path','pd 21 @ 0x6f67dfad;pd 17 @ 0x6f67e008;pd 26 @ 0x6f6971c0',['ebp - 0x18','0x10','edi + 0xe0','0x6f64fbf0','0x6f6971c0','0x6f64d7f0','ebx + 0x10','ebx + 0x18','0x6f0527e0']],
 ['feedback-normal-table','pd 7 @ 0x6f64d846;pd 8 @ 0x6f64d9e6;pd 20 @ 0x6f64fbfc',['DamageBonusNormal','0x6fbec348','edx*8','0x6fbec368','DefenseArmor','0x6f0527e0','0x6f0529d0']],
];
const client=new Client({name:'frostbound-feedback-research',version:'1.0.0'}),reports=[];
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
  console.log('PASS REA Feedback '+name);
 }
 fs.writeFileSync(path.join(out,'rea-summary.json'),JSON.stringify({binarySha256:expected,reaSource:'https://github.com/morluto/rea',reaVersion:'6.5.0',probes:reports,originalRuntimeVerified:false,limitations:['Static evidence authenticates Feedback field selection, mana-to-damage packet and shared armor/type scaling. Full original runtime acceptance, defensive ability ordering and animation remain unverified.']},null,2)+'\n');
}finally{await client.close();}
