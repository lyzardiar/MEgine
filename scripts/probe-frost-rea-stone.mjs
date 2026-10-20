// Author: MiYu. Reproduce Stone Form static evidence against the authenticated original Warcraft DLL.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url)),rea=path.join(root,'third_party/rea'),require=createRequire(path.join(rea,'package.json'));
const {Client}=require('@modelcontextprotocol/client'),{StdioClientTransport}=require('@modelcontextprotocol/client/stdio'),provider=require(path.join(rea,'rizin-source.json'));
const binary=process.argv[2]||'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Game.dll',expected='e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a';
const digest=raw=>createHash('sha256').update(raw).digest('hex'),out=path.join(root,'tmp/docs-artifacts/frost-gargoyle-stone');
const functions=(...addresses)=>addresses.map(a=>`af @ ${a};pdr @ ${a}`).join(';');
assert.equal(digest(fs.readFileSync(binary)),expected,'Version-specific addresses require this original Game.dll');
const probes=[
 ['identity','iz~CAbilityStoneForm;pd 36 @ 0x6f4f5c30;pd 3 @ 0x6f4f9cc0',['CAbilityStoneForm','0x6f48b6e0','0x6f9d1370','0x4173746e']],
 ['vtable','pxw 16 @ 0x6f9d1370;pxw 16 @ 0x6f9d1778;pxw 16 @ 0x6f9ae598',['0x6f5ed6e0','0x6f4ecf40','0x6f4ece60','0x6f4ece10','0x6f4aaf40','0x6f4aae60']],
 ['orders',functions('0x6f5009e0','0x6f508d90','0x6f4fbdd0'),['0xd00ee','0xd00ef','xor   eax, eax']],
 ['web-disable-dispatch','pxw 4 @ 0x6fa1dcec;'+functions('0x6f5ca8d0','0x6f5bb8f0','0x6f5bc4a0','0x6f5bbab0'),['0x6f5ca8d0','xor   edx, edx','0x6f5bb8f0','0x6f46f330','0x6f5bc4a0','0x6f5cc4f0','0x6f3e9fa0','0x6f3ee3c0','mov   edx, 1']],
 ['web-morph-filter',functions('0x6f5cc4f0','0x6f595280','0x6f53b860'),['0x210','0x6f595280','0x6f5cc774','0x6f53b860','0x6f02fbf0','0x416d6f72']],
 ['stone-morph-ancestry',functions('0x6f5036f0','0x6f0308c0','0x6f02fc20'),['0x6f53b860','0x4173746e','0x6f0308c0','mov   dword [esi + 0x78], eax','0x78','0x6f02fc20']],
 ['crow-morph-gates',functions('0x6f5031f0','0x6f4f9a40')+';pxw 4 @ 0x6f9d0f3c;pxw 4 @ 0x6f9d0fec;pxw 4 @ 0x6f9d1130;pxw 4 @ 0x6f9d1224;pxw 4 @ 0x6f9d12fc',['0x41726176','0x6f53b860','0x6f0308c0','0x6f4f9a40','0x6f3dcd40','0x6f3ff7c0','0x6f528cb0','0x6f3ded20']],
 ['web-disabled-order','pxw 4 @ 0x6f9d143c;pxw 4 @ 0x6f9d1674;pxw 4 @ 0x6f9d174c;'+functions('0x6f3dcd40','0x6f3e9fa0','0x6f3ee3c0','0x6f3ded20','0x6f3e0e30','0x6f528cb0'),['0x6f3dcd40','0x6f528cb0','0x6f3ded20','add   dword [esi + 0x3c], edi','0xdd','0x6f3e0e30','0x3dc','0x200']],
 ['web-landing-floor',functions('0x6f54c420','0x6f67af00'),['0x6f65b2e0','0x6f67af00','[ebx + 0x204]','[edi + 8]','0x210','0x214','0x6f03b070']],
 ['web-height-owner',functions('0x6f67af50','0x6f67f7e0','0x6f66a080','0x6f67f100'),['[edi + 0x200]','0x6f67f7e0','0x20c','0x208','0x214','0x224','0x6f03adf0','0x6f3c64f0','0x6f03af40']],
 ['web-body-height','pd 30 @ 0x6f653380;'+functions('0x6f65aea0','0x6f65b2e0','0x6f65b350','0x6f412340'),['0x20c','0x204','0x6f65b350','0x6f65b2e0','0x1f8','0x1fc','0x70','0x74']],
 ['web-preserved-body','pxw 4 @ 0x6fa1da80;'+functions('0x6f6777d0','0x6f6770b0','0x6f3fc860'),['0x6f3fc860','0x6f46f330','0x6f6770b0','0xf0','0x6f471160','mov   eax, 1']],
 ['web-morph-directed-timer',functions('0x6f54c6c0','0x6f043700','0x6f042fc0','0x6f043ad0'),['0xd01c4','0xe4','0x6f043700','0x6f042fc0','mov   dword [edi + 8], esi','mov   esi, dword [ecx + 8]','call  dword [eax + 0xc]']],
 ['web-height-speed',functions('0x6f5badb0','0x6f6b5d20','0x6f5a9180','0x6f5aa080','0x6f5ca8d0'),['0x6f3f7410','0x6f3f7470','[edi + 0x70]','[edi + 0x74]','[ebx + 0x94]','[ebx + 0x9c]','[esi + 0x210]','0x6f66a080']],
 ['morph-flags',functions('0x6f53fc10'),['0x6f3f7470','test  al, 2','test  al, 4','test  al, 1','0x400000','0x800000','0x200000']],
 ['enter-exit',functions('0x6f54c7e0','0x6f54c140'),['0x408','0x410','0x6f5274f0','0x6f54c6c0']],
 ['regeneration-lifetime',functions('0x6f4ece60','0x6f4ece10','0x6f3f7590','0x6f4007b0'),['0x6f3f7590','[eax + ecx + 0x30]','0x6f4007b0','add   ecx, 0x98','0x6f03af40','[esi + 0x1a4]','0x6f3c64f0']],
 ['regeneration-rate','pd 42 @ 0x6f0454d0;pd 12 @ 0x6f045670;pd 38 @ 0x6f10e600;pd 30 @ 0x6f10e250',['0x6f045670','0x6f10e600','0x6f10e250','[ebx + 0x50]','[esi + 0x7c]']],
 ['entry-effects',functions('0x6f4ecf40'),['0x6f4713d0','0x6f46e150','0xa0000000']],
 ['magic-immunity','pxw 4 @ 0x6f1e8e7c;pd 6 @ 0x6f1e8df3;pd 18 @ 0x6f46e150;pd 26 @ 0x6f4ecf40;pd 8 @ 0x6f471600',['0x6f1e8df3','[esi + 0x15c]','setg','0x6f46e150','[ecx + 0x15c]']],
 ['dispel-arguments','pd 10 @ 0x6f1ec345;pd 24 @ 0x6f1fb130;pd 110 @ 0x6f4713d0',['UnitRemoveBuffsEx','0x6f1fb130','0x6f4713d0','[eax + 0x1d8]','[eax + 0x1dc]','[eax + 0x1e0]','[eax + 0x1e4]','[eax + 0x1e8]','[eax + 0x32c]','[eax + 0x330]','0x6f471160']],
 ['flight-dispatch',functions('0x6f5274f0'),['0x6f65b3c0','cmp   eax, 2','0x6f54c420','0x6f54c8a0']],
 ['landing',functions('0x6f54c420'),['MorphLandClosest','0x6f41bd50','0x6f3f74d0','0x6f67af50','0x6f3f7530','0xd01dd']],
 ['takeoff',functions('0x6f54c8a0','0x6f534ac0'),['0x6f5454f0','0x6f3f6dd0','0xd01dc','0x6f3f74d0','0x6f67af50']],
 ['transition-timers',functions('0x6f54c6c0','0x6f5315b0'),['0x6f3f78b0','[esi + 0x9c]','0x6f3f74d0','0x6f0529d0','0xd01c4']],
 ['form-commit',functions('0x6f5454f0','0x6f5349b0','0x6f5327e0'),['0x6f5276f0','0x6f5349b0','0x6f5327e0','0x40c','0x414']],
 ['state-events',functions('0x6f5ed6e0','0x6f5edae0','0x6f5e9b60'),['0xd01bf','0x6f5edae0','0x3d8','[edi + 0x18c]','0x6f662bf0','0x6f043700']],
 ['cast-duration-loader','pd 95 @ 0x6f689ed0;'+functions('0x6f3f6dd0','0x6f3f78b0'),['0x6fb6a078','0x6fb6a080','[eax + ecx + 4]','[eax + ecx + 8]']],
 ['default-clock-property','pd 55 @ 0x6f3cca20;'+functions('0x6f3fea20'),['[esi + 0x98]','[esi + 0x9c]','0x6fbb81d4','[esi + 0x80]','[esi + 0x88]','[esi + 0x90]']],
 ['independent-unlock',functions('0x6f534800','0x6f66b660','0x6f65ae90','0x6f3ea000','0x6f3ee460'),['0x6f5454f0','0x6f3ee460','0x6f65ae90','[ecx + 0x198]','[ecx + 0x44]']],
 ['exit-cooldown','pd 40 @ 0x6f3da4d0;'+functions('0x6f418d20','0x6f4ecf40','0x6f4ece60','0x6f4aaf10','0x6f3ded20'),['0x3c0','0x3a4','0xd01be','0xa0000000','0x200','0xd2']],
 ['animation-command',functions('0x6f527400','0x6f67bb90','0x6f675e90','0x6f6a0ae0'),['push  0x200','push  7','push  4','push  0xb','0x6f6a0ae0','0x6f186590']],
 ['animation-default-rate','pd 6 @ 0x6f180aa3;pd 22 @ 0x6f18236c;'+functions('0x6f184a40','0x6f12fb80','0x6f77a500'),['0x3f800000','0x174','[edi + 0x190]','0x6f12fb80','0x6f77a500','[ecx + 0x48]']],
 ['animation-clock','pd 18 @ 0x6f183aa7;'+functions('0x6f77a1e0'),['0x80','0x2c','0x3f800000','[edi + 0x48]','mulss','[edi + 0x50]','0x6f77ba30']],
 ['same-model-morph','pd 29 @ 0x6f65330b;pd 7 @ 0x6f65b0ee;pxw 4 @ 0x6fa4a78c;'+functions('0x6f3247b0','0x6f6a0b10'),['modelPath','0x6f3247b0','0x6f051310','0x6f653150','[arg_4h], 0','0x6f33def0','push  4']],
 ['unit-rate-and-idle','pd 4 @ 0x6f67f0bb;'+functions('0x6f677d50','0x6f64c6a0','0x6f64c780'),['[ecx + 0x300], 0x3f800000','[ecx + 0x300]','0x6f186f60','0x6f03d9b0','0x6f03d9f0','cmp   dword [eax], 5','cmp   dword [ecx], 5','push  4','push  5']],
];
const client=new Client({name:'frostbound-stone-research',version:'1.0.0'}),reports=[];
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
  console.log('PASS REA Stone Form '+name);
 }
 fs.writeFileSync(path.join(out,'rea-summary.json'),JSON.stringify({binarySha256:expected,reaSource:'https://github.com/morluto/rea',reaVersion:'6.5.0',probes:reports,originalRuntimeVerified:false,limitations:['Static evidence records source control flow; it does not measure original runtime timing or animation.','Phase clocks use the inherited scalar default zero; blocked landing, special buff classification and Web/Ensnare gates still require original runtime verification.']},null,2)+'\n');
}finally{await client.close();}
