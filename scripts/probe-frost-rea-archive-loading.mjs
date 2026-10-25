// Author: MiYu. Keep read-only REA evidence for the original Warcraft archive dependency and names.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),rea=path.join(root,'third_party/rea'),require=createRequire(path.join(rea,'package.json'));
const {Client}=require('@modelcontextprotocol/client'),{StdioClientTransport}=require('@modelcontextprotocol/client/stdio');
const provider=JSON.parse(fs.readFileSync(path.join(rea,'rizin-source.json'),'utf8'));
const game=process.argv[2]||process.env.MENGINE_WARCRAFT_ROOT;assert.ok(game,'Provide the Warcraft game directory or MENGINE_WARCRAFT_ROOT');
const out=path.join(root,'tmp/docs-artifacts/warcraft-archives/rea');fs.mkdirSync(out,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),client=new Client({name:'mengine-warcraft-archive-evidence',version:'1.0.0'}),probes=[];
try{
 await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(rea,'node_modules/rea-agents/scripts/rea.mjs'),'mcp'],env:{...process.env,REA_RIZIN_COMMAND:path.join(rea,provider.localExecutable)},stderr:'inherit'}));
 for(const [label,file,command,marker] of [['game-storm-imports','Game.dll','ii~Storm','storm'],['game-mpq-names','Game.dll','iz~mpq','mpq'],['storm-exports','Storm.dll','iE','ordinal']]){
  const binary=path.join(game,file),before=hash(fs.readFileSync(binary));
  const result=await client.callTool({name:'execute_rizin_command',arguments:{path:binary,command:'e scr.color=0;'+command}});assert.notEqual(result.isError,true,JSON.stringify(result));
  const evidence=result.structuredContent||JSON.parse(result.content.find(c=>c.type==='text').text),r=evidence.normalized_result;
  fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(evidence,null,2));fs.writeFileSync(path.join(out,label+'.txt'),r.stdout);
  assert.equal(evidence.subject.digest.sha256,before);assert.equal(r.artifact_sha256_after,before);assert.equal(r.artifact_changed,false);assert.equal(r.completion_status,'complete');assert.equal(r.output_truncated,false);assert.equal(r.exit_code,0);assert.ok(r.stdout.toLowerCase().includes(marker),label+' missing '+marker);
  probes.push({label,binarySha256:before,evidenceId:evidence.evidence_id,stdoutSha256:hash(r.stdout)});console.log('PASS REA '+label);
 }
 fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({reaSource:'https://github.com/morluto/rea',reaVersion:'6.5.0',probes,scope:'Static DLL dependencies, archive-name strings and export table; no runtime loading timings or function-ordinal semantics inferred.'},null,2));
}finally{await client.close();}
