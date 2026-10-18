// Author: MiYu. Reproduce authenticated read-only REA MCP evidence for the owned Warcraft DLL.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),rea=path.join(root,'third_party/rea'),require=createRequire(path.join(rea,'package.json'));
const {Client}=require('@modelcontextprotocol/client'),{StdioClientTransport}=require('@modelcontextprotocol/client/stdio'),provider=require(path.join(rea,'rizin-source.json'));
const workerFields=process.argv.includes('--worker-fields'),binary=process.argv.slice(2).find(a=>!a.startsWith('--'))||'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Game.dll',expected='e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a',digest=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(digest(binary),expected,'This probe uses version-specific addresses; inspect a different binary separately');
const executable=path.join(rea,provider.localExecutable),client=new Client({name:'frostbound-rewards-research',version:'1.0.0'}),out=path.join(root,'tmp/docs-artifacts',workerFields?'frost-worker-balance':'frost-combat-rewards');fs.mkdirSync(out,{recursive:true});
try{
 await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(rea,'node_modules/rea-agents/scripts/rea.mjs'),'mcp'],env:{...process.env,REA_RIZIN_COMMAND:executable},stderr:'inherit'}));
 const {tools}=await client.listTools();assert.ok(tools.some(t=>t.name==='execute_rizin_command'));
 for(const [name,command] of (workerFields?[['worker-fields-rea','e scr.color=0;iz~goldcost;iz~bldtm;iz~regenType;iz~defType;iz~minSpd']]:[['rewards-mcp-identity','iIj'],['rewards-mcp-field-loader','e scr.color=0;pd 44 @ 0x6f693492']])){
  const result=await client.callTool({name:'execute_rizin_command',arguments:{path:binary,command}});assert.notEqual(result.isError,true,JSON.stringify(result));const evidence=result.structuredContent;
  assert.equal(evidence.subject.digest.sha256,expected);assert.equal(evidence.normalized_result.artifact_changed,false);assert.equal(evidence.normalized_result.exit_code,0);
  fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({name,evidenceId:evidence.evidence_id,reaVersion:client.getServerVersion().version,binaryChanged:false,providerExecutableSha256:digest(executable)}));
 }
}finally{await client.close();}
