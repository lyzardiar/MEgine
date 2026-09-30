// Author: MiYu. Measure screen-space layout against the authored Frostbound scene.
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createServer} from '../packages/editor/node_modules/vite/dist/node/index.js';
const server=await createServer({root:fileURLToPath(new URL('../packages/editor/',import.meta.url)),appType:'custom',logLevel:'silent',server:{middlewareMode:true}});
try{
  const {layoutUiOverlay}=await server.ssrLoadModule('/src/ui/uiLayout.ts');
  const entities=JSON.parse(fs.readFileSync(new URL('../samples/frostbound-realms/Assets/Scenes/Main.mscene',import.meta.url))).world.entities;
  const layout=()=>layoutUiOverlay(entities,{x:0,y:0,w:1280,h:720},new Set(),undefined,undefined,0,undefined,true);
  for(let i=0;i<50;i++)layout();
  const timings=[];for(let run=0;run<5;run++){const start=performance.now();for(let i=0;i<100;i++)layout();timings.push((performance.now()-start)/100);}
  console.log(JSON.stringify({entities:entities.length,items:layout().length,runsMs:timings,medianMs:[...timings].sort((a,b)=>a-b)[2]},null,2));
}finally{await server.close();}
