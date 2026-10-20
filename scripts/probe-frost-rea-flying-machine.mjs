// Author: MiYu. Reproduce Flying Machine Flak Cannon static evidence against the authenticated original Warcraft DLL.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url)),rea=path.join(root,'third_party/rea'),require=createRequire(path.join(rea,'package.json'));
const {Client}=require('@modelcontextprotocol/client'),{StdioClientTransport}=require('@modelcontextprotocol/client/stdio'),provider=require(path.join(rea,'rizin-source.json'));
const binary=process.argv[2]||'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Game.dll',expected='e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a';
const digest=raw=>createHash('sha256').update(raw).digest('hex'),out=path.join(root,'tmp/docs-artifacts/frost-flying-machine');
assert.equal(digest(fs.readFileSync(binary)),expected,'Version-specific addresses require this original Game.dll');
const probes=[
 ['flak-identity','pd 2 @ 0x6f57bdd0;pd 2 @ 0x6f57b460;pxw 8 @ 0x6fa159a0',['CAbilityFlakCannon','0x41666c6b','0x6f57bdd0']],
 ['flak-primary-filter','af @ 0x6f573800;pdf @ 0x6f573800',['cmp   dword [esi + 4], ecx','0x6f573813','0x6f417f20']],
 ['flak-area-dispatch','af @ 0x6f5725e0;pdf @ 0x6f5725e0',['0x6f3f6920','0x6f3f74d0','0x6f3f7410','0x6f3f7530','0x6f3f7470','0x6f3f7590','0x6f573800','push  3','0x6f6b19e0']],
];
const client=new Client({name:'frostbound-flying-machine-research',version:'1.0.0'}),reports=[];
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
  console.log('PASS REA Flying Machine '+name);
 }
 fs.writeFileSync(path.join(out,'rea-summary.json'),JSON.stringify({binarySha256:expected,reaSource:'https://github.com/morluto/rea',reaVersion:'6.5.0',probes:reports,originalRuntimeVerified:false,limitations:['Static evidence binds Aflk to CAbilityFlakCannon and records its area dispatch and primary-target exclusion.','Original damage scaling, target-mask combinations, exact distance boundaries and complete runtime gameplay remain to be verified.']},null,2)+'\n');
}finally{await client.close();}
