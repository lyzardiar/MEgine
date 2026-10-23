// Author: MiYu. Authenticate the original map camera field, projection matrix and constants.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),rea=path.join(root,'third_party/rea'),require=createRequire(path.join(rea,'package.json'));
const {Client}=require('@modelcontextprotocol/client'),{StdioClientTransport}=require('@modelcontextprotocol/client/stdio'),provider=require(path.join(rea,'rizin-source.json'));
const binary=process.argv[2]||'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Game.dll',expected='e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a';
const out=path.join(root,'tmp/docs-artifacts/war3-ui/camera-source'),digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const probes=[
 ['field-binding','af @ 0x6f1f4170;pdf @ 0x6f1f4170;af @ 0x6f345760;pdf @ 0x6f345760;pxw 8 @ 0x6f95a588',['0x6f345760','0x6f95a588','0x6f95a58c','0x144','0x40490fdb','0x43340000']],
 ['projection','af @ 0x6f190210;pdf @ 0x6f190210;af @ 0x6f0d31d0;pdf @ 0x6f0d31d0;pxw 8 @ 0x6f950d88;pxw 4 @ 0x6f95d54c',['0x6f0d31d0','0x114','sqrt_precise','tan_precise','0x3f000000','0x3f800000','0xc0000000']],
 ['viewport-call','af @ 0x6f346980;pdf @ 0x6f346980;pd 46 @ 0x6f368480;pd 18 @ 0x6f368587',['0x6f190160','0x6f346980','0x6f3684c2','0x6f3685b8']],
 ['logical-layout','af @ 0x6f0a1f80;pdf @ 0x6f0a1f80;af @ 0x6f0bce10;pdf @ 0x6f0bce10;af @ 0x6f78a1d0;pdf @ 0x6f78a1d0;pxw 8 @ 0x6f97b498',['0xb4','0x44','0x6f97b49c','0x6f97b498','0x3f19999a','0x3f4ccccd']],
 ['world-anchors','pd 29 @ 0x6f34a737;af @ 0x6f0ca6d0;pdf @ 0x6f0ca6d0;af @ 0x6f0ca7d0;pdf @ 0x6f0ca7d0',['0x3e051eb8','0xbca3d70a','0x6f0bd8a0','0x6f0ca749','0x6f0ca782','0x6f0ca849','0x6f0ca882']],
 ['root-placement','pxw 20 @ 0x6f98c4d4;pxw 16 @ 0x6f95d430;af @ 0x6f0ca2a0;pdf @ 0x6f0ca2a0;af @ 0x6f78a280;pdf @ 0x6f78a280',['0x6f0ca2a0','0x6f0a2730','0x3f800000','0x6f78a280','0x6f97b49c','0x6f97b498']]
];
const client=new Client({name:'frostbound-camera-source',version:'1.0.0'}),reports=[];fs.mkdirSync(out,{recursive:true});
try{
 await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(rea,'node_modules/rea-agents/scripts/rea.mjs'),'mcp'],env:{...process.env,REA_RIZIN_COMMAND:path.join(rea,provider.localExecutable)},stderr:'inherit'}));
 for(const [name,command,markers] of probes){
  const result=await client.callTool({name:'execute_rizin_command',arguments:{path:binary,command:'e scr.color=0;'+command}});assert.notEqual(result.isError,true,JSON.stringify(result));
  const evidence=result.structuredContent||JSON.parse(result.content.find(c=>c.type==='text').text),r=evidence.normalized_result;
  fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(evidence,null,2)+'\n');fs.writeFileSync(path.join(out,name+'.txt'),r.stdout);
  assert.equal(evidence.subject.digest.sha256,expected);assert.equal(r.artifact_sha256_after,expected);assert.equal(r.artifact_changed,false);assert.equal(r.completion_status,'complete');assert.equal(r.output_truncated,false);assert.equal(r.exit_code,0);assert.ok(!r.stderr.includes('ERROR:'),r.stderr);
  const assembly=r.stdout.replace(/\bfcn\.([0-9a-f]+)/g,'0x$1');for(const marker of markers)assert.ok(assembly.includes(marker),name+': missing '+marker);
  reports.push({name,evidenceId:evidence.evidence_id,stdoutSha256:digest(r.stdout),markers});console.log('PASS REA camera '+name);
 }
 fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({binarySha256:expected,reaSource:'https://github.com/morluto/rea',reaVersion:'6.5.0',probes:reports,verticalFovFormula:'sourceFov / sqrt(1 + aspect * aspect)',defaultLayout:{root:[.8,.6],bottomInset:.13,topInset:.02,projectionAspect:16/9},originalRuntimeVerified:false,limitations:['Static original camera and matrix evidence; run probe-frost-camera-binary.py for isolated original instruction execution.','Default game layout only; cinematic/hidden UI relocation and full client pixel comparison remain unverified.']},null,2)+'\n');
}finally{await client.close();}
