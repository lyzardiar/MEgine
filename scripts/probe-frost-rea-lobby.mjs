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
 ['screen-initialization','pxw 4 @ 0x6f983058;af @ 0x6f2bcd60;pdf @ 0x6f2bcd60',['0x6f2bcd60','str.TeamSetup','str.TeamSetupContainer','str.ChatTextArea','str.ChatEditBox','str.ChatroomChatEditBox','str.ChatroomTextArea','str.MapInfoPane','str.AdvancedOptionsDisplay','str.StartGameButton','str.CancelButton']],
 ['team-registration','ps @ 0x6f97ba50;pxw 12 @ 0x6fb69124',['TeamSetup','0x6f2a4520','0xffffffff']],
 ['team-factory','af @ 0x6f2a4520;pdf @ 0x6f2a4520',['0x194','0x6f2890a0']],
 ['team-constructor','af @ 0x6f2890a0;pdf @ 0x6f2890a0',['0x6f979e74','0x6f979f5c']],
 ['team-initialization','pxw 4 @ 0x6f979f50;af @ 0x6f2910c0;pdf @ 0x6f2910c0',['0x6f2910c0','0x6f29a860']],
 ['team-change','af @ 0x6f296ce0;pdf @ 0x6f296ce0',['0x6f29a520']],
 ['team-controls','ps utf8 null @ 0x6f979f80;af @ 0x6f29a520;pdf @ 0x6f29a520',['PlayerSlot','0x6f282df0','0x6f0909c0','0x6f2998f0','0x6f29a690']],
 ['team-arrangement','af @ 0x6f2998f0;pdf @ 0x6f2998f0',['str.ChatroomHeaders','0x6f97b458','0x6f0bd7c0','str.COLON_OBSERVERS','str.TEAM_FORMAT','[eax + 0x1c]']],
 ['team-header-metrics','pxw 4 @ 0x6f97b458;af @ 0x6f0bd7c0;pdf @ 0x6f0bd7c0;af @ 0x6f0bcdf0;pdf @ 0x6f0bcdf0',['0x3b449ba6','[ecx + 0x5c]','[ecx + 0x60]']]
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
 const fonts=Object.fromEntries(['ChatroomTextArea','ChatroomChatEditBox','ChatroomHeaders'].map(key=>{const match=config.match(new RegExp('^'+key+'=([\\d.]+)','m'));assert.ok(match,key);return [key,Number(match[1])];}));
 assert.equal(fonts.ChatroomTextArea,.011);assert.equal(fonts.ChatroomChatEditBox,.015);assert.equal(fonts.ChatroomHeaders,.011);
 const slotSource=path.join(root,'samples/frostbound-realms/SourceAssets/WarcraftUI/UI/FrameDef/Glue/PlayerSlot.fdf'),slotBytes=fs.readFileSync(slotSource),slotHeight=slotBytes.toString('utf8').match(/Frame "FRAME" "PlayerSlot"\s*\{[^{}]*?Height\s+([\d.]+)/);
 assert.ok(slotHeight,'PlayerSlot outer frame height');assert.equal(Number(slotHeight[1]),.025);
 fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({binarySha256:expected,reaSource:'https://github.com/morluto/rea',reaVersion:'6.5.0',probes:reports,fontConfig:{source:path.relative(root,source),sha256:digest(fs.readFileSync(source)),values:fonts},playerSlot:{source:path.relative(root,slotSource),sha256:digest(slotBytes),height:Number(slotHeight[1])},headerExtraHeight:Buffer.from('a69b443b','hex').readFloatLE(),originalRuntimeVerified:false,limitations:['Static evidence confirms dynamic slot creation and grouped layout; complete map force policy, visibility and non-grouped branches remain unresolved.','MiscUI and PlayerSlot metrics are confirmed for this installation; native text rasterization and full lobby interaction remain unverified.']},null,2)+'\n');
}finally{await client.close();}
