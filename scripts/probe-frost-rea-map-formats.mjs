// Author: MiYu. Reproduce original map formats static evidence against the authenticated original Warcraft DLL.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url)),rea=path.join(root,'third_party/rea'),require=createRequire(path.join(rea,'package.json'));
const {Client}=require('@modelcontextprotocol/client'),{StdioClientTransport}=require('@modelcontextprotocol/client/stdio'),provider=require(path.join(rea,'rizin-source.json'));
const appearance=process.argv.includes('--unit-appearance'),units=appearance||process.argv.includes('--units'),binary=process.argv.slice(2).find(a=>!a.startsWith('--'))||'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/'+(units?'WorldEdit.exe':'Game.dll'),expected=units?'811130e637b4885c08c3c8cb707d0e02a7692ddcddc4c1d57c783c3379ef4b90':'e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a';
const digest=raw=>createHash('sha256').update(raw).digest('hex'),out=path.join(root,'tmp/docs-artifacts/frost-original-maps',appearance?'unit-appearance-evidence':units?'unit-evidence':'');
assert.equal(digest(fs.readFileSync(binary)),expected,'Version-specific addresses require the pinned original binary');
const probes=appearance?[['unit-appearance-fields','iz~modelScale;iz~teamColor;iz~moveHeight',['modelScale','teamColor','moveHeight','0x007e5214','0x007e5220','0x007e531c']]]:units?[['unit-editor-strings','iz~Units.doo;iz~CreateAllUnits',['Units.doo','CreateAllUnits']],['unit-editor-accessor','pd 2 @ 0x0059f940;pd 8 @ 0x0062ad05',['str.Units.doo','str.CreateAllUnits','0x6237d0','str.CreateNeutralHostileBuildings','str.CreateNeutralPassiveBuildings']]]:[['map-file-strings','iz~w3e;iz~wpm;iz~w3i',['.w3e','.wpm','.w3i']],['map-loader','pd 10 @ 0x6f76e9da;pd 19 @ 0x6f76eb7c;pd 12 @ 0x6f6f0dfc',['0x6f965e58','0x6f965e60','0x6fa56e0c','0x6f72f180','0x6f819118','str.Path.tga','0x6f702d60']]];
const client=new Client({name:'frostbound-map-research',version:'1.0.0'}),reports=[];
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
  console.log('PASS REA original map formats '+name);
 }
 fs.writeFileSync(path.join(out,'rea-summary.json'),JSON.stringify({binarySha256:expected,reaSource:'https://github.com/morluto/rea',reaVersion:'6.5.0',probes:reports,originalRuntimeVerified:false,limitations:appearance?['Appearance field strings only; formulas and native visual parity require independent evidence.']:units?['World Editor filename accessor and script-generation references only; record parsing is checked independently.','Editor placements do not execute generated JASS or prove runtime unit creation.']:['Static evidence records source control flow; it does not prove original runtime map behavior.','Map file references are static evidence; parser semantics and original runtime map behavior require separate verification.']},null,2)+'\n');
}finally{await client.close();}
