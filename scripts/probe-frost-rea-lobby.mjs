// Author: MiYu. Authenticate original pre-game lobby construction and runtime font configuration.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),rea=path.join(root,'third_party/rea'),require=createRequire(path.join(rea,'package.json'));
const {Client}=require('@modelcontextprotocol/client'),{StdioClientTransport}=require('@modelcontextprotocol/client/stdio'),provider=require(path.join(rea,'rizin-source.json'));
const binary=process.argv[2]||'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Game.dll',expected='e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a';
const out=path.join(root,'tmp/docs-artifacts/war3-ui/lobby-source'),digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const probes=[
 ['screen-registration','ps @ 0x6f97c298;pxw 12 @ 0x6fb690c4',['GameChatroom','0x6f97c298','0x6f2a29c0','0x0000000b']],
 ['screen-factory','af @ 0x6f2a29c0;pdf @ 0x6f2a29c0',['0x220','0x6f2a77d0']],
 ['screen-constructor','af @ 0x6f2a77d0;pdf @ 0x6f2a77d0',['0x6f982f7c','0x6f983064']],
 ['screen-initialization','pxw 4 @ 0x6f983058;af @ 0x6f2bcd60;pdf @ 0x6f2bcd60',['0x6f2bcd60','str.TeamSetup','str.TeamSetupContainer','str.ChatTextArea','str.ChatEditBox','str.ChatroomChatEditBox','str.ChatroomTextArea','str.MapInfoPane','str.AdvancedOptionsDisplay','str.StartGameButton','str.CancelButton']]
];
const client=new Client({name:'frostbound-lobby-source',version:'1.0.0'}),reports=[];fs.mkdirSync(out,{recursive:true});
try{
 await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(rea,'node_modules/rea-agents/scripts/rea.mjs'),'mcp'],env:{...process.env,REA_RIZIN_COMMAND:path.join(rea,provider.localExecutable)},stderr:'inherit'}));
 for(const [name,command,markers] of probes){
  const result=await client.callTool({name:'execute_rizin_command',arguments:{path:binary,command:'e scr.color=0;'+command}});assert.notEqual(result.isError,true,JSON.stringify(result));
  const evidence=result.structuredContent||JSON.parse(result.content.find(c=>c.type==='text').text),r=evidence.normalized_result;
  fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(evidence,null,2)+'\n');fs.writeFileSync(path.join(out,name+'.txt'),r.stdout);
  assert.equal(evidence.subject.digest.sha256,expected);assert.equal(r.artifact_sha256_after,expected);assert.equal(r.artifact_changed,false);assert.equal(r.completion_status,'complete');assert.equal(r.output_truncated,false);assert.equal(r.exit_code,0);assert.ok(!r.stderr.includes('ERROR:'),r.stderr);
  const assembly=r.stdout.replace(/\bfcn\.([0-9a-f]+)/g,'0x$1');for(const marker of markers)assert.ok(assembly.includes(marker),name+': missing '+marker);
  reports.push({name,evidenceId:evidence.evidence_id,stdoutSha256:digest(r.stdout),markers});console.log('PASS REA lobby '+name);
 }
 const source=path.join(root,'samples/frostbound-realms/SourceAssets/WarcraftUI/UI/MiscUI.txt'),config=fs.readFileSync(source,'utf8');
 const fonts=Object.fromEntries(['ChatroomTextArea','ChatroomChatEditBox'].map(key=>{const match=config.match(new RegExp('^'+key+'=([\\d.]+)','m'));assert.ok(match,key);return [key,Number(match[1])];}));
 assert.equal(fonts.ChatroomTextArea,.011);assert.equal(fonts.ChatroomChatEditBox,.015);
 fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({binarySha256:expected,reaSource:'https://github.com/morluto/rea',reaVersion:'6.5.0',probes:reports,fontConfig:{source:path.relative(root,source),sha256:digest(fs.readFileSync(source)),values:fonts},originalRuntimeVerified:false,limitations:['Static registration and initialization evidence; player-slot layout and team policy still require source runtime analysis.','MiscUI font values are confirmed for this installation; native text rasterization and full lobby interaction remain unverified.']},null,2)+'\n');
}finally{await client.close();}
