/* Author: MiYu. One game project owns map selection, scene requests and fresh map instances. */
var FrostMapSession=(()=>{
  const main='Assets/Scenes/Main.mscene',buttons=JSON.parse(JSON.stringify(FrostButtons));
  let active=null,runtime=null,pending=null,selected=0,loaded=false,elapsed=0,camera=null,statusLabel=null,paused=false,notice='';
  function request(scene,id){if(pending)return false;pending={scene,id,seconds:0};engine.loadScene(scene);return true;}
  function start(id,index){const entry=FrostMapPackages.find(map=>map.id===id);if(!entry)return false;selected=index;return request(entry.scene,id);}
  function back(){return request(main,null);}
  function reload(){return active?request(active.scene,active.id):false;}
  function sceneLoaded(scene){
    const entry=FrostMapPackages.find(map=>map.scene===scene.path),returning=loaded;
    if(scene.path!==main&&!entry)throw Error('Unregistered game map: '+scene.path);
    pending=null;active=entry||null;elapsed=0;camera=null;statusLabel=null;paused=false;notice='';
    if(entry){runtime=entry.create();FrostClient=null;}
    else {runtime=null;FrostButtons=JSON.parse(JSON.stringify(buttons));FrostClient=createFrostClient();if(returning)FrostClient.openMaps(selected);}
    loaded=true;
  }
  function write(entity,component,value){engine.pushCommandJson(JSON.stringify({op:'setComponent',entity,component,value}));}
  function tick(dt){
    if(pending){pending.seconds+=Math.max(0,dt);if(pending.seconds>10){pending=null;notice='地图加载未完成，请重试';if(FrostClient)FrostClient.mapError(notice);}}
    if(!active){FrostClient.tick(dt);return;}
    const input=engine.input||{},pressed=input.pressedKeys||[],keys=input.keys||[],[width,height]=input.viewport||[1280,720],point=input.pointer||[-1,-1];
    const x=(point[0]-width/2)*1280/width,y=(point[1]-height/2)*1280/width,click=(input.pressedButtons||[]).includes(0);
    if(pressed.includes('Escape')||click&&x>=-620&&x<=-440&&y>=-340&&y<=-296){back();return;}
    if(pressed.includes('KeyR')||click&&x>=-425&&x<=-245&&y>=-340&&y<=-296){reload();return;}
    if(pressed.includes('Space'))paused=!paused;
    if(!paused){runtime.tick(dt);elapsed+=Math.max(0,dt);}
    if(!camera){const found=engine.findEntitiesByName(['Camera','Map session status']);camera=found.find(e=>e.name==='Camera');statusLabel=found.find(e=>e.name==='Map session status');}
    if(camera){
      const c=camera.components,t=c.Transform,projection=c.Camera3D,speed=Math.max(1,projection.orthographic_size)*Math.min(.2,Math.max(0,dt)),p=[...t.position];
      p[0]+=((keys.includes('ArrowRight')||keys.includes('KeyD')?1:0)-(keys.includes('ArrowLeft')||keys.includes('KeyA')?1:0))*speed;
      p[2]+=((keys.includes('ArrowDown')||keys.includes('KeyS')?1:0)-(keys.includes('ArrowUp')||keys.includes('KeyW')?1:0))*speed;
      const grid=runtime.pathing,loX=grid.origin[0]/128,hiX=loX+grid.size[0]/4,hiZ=-grid.origin[1]/128,loZ=hiZ-grid.size[1]/4;
      p[0]=Math.max(loX,Math.min(hiX,p[0]));p[2]=Math.max(loZ,Math.min(hiZ,p[2]));
      if(p.some((v,i)=>v!==t.position[i])){c.Transform={...t,position:p};write(camera.entity,'Transform',c.Transform);}
      const zoom=(keys.includes('Equal')||keys.includes('NumpadAdd')?-1:0)+(keys.includes('Minus')||keys.includes('NumpadSubtract')?1:0);
      if(zoom){c.Camera3D={...projection,orthographic_size:Math.max(4,Math.min(Math.max(hiX-loX,hiZ-loZ),projection.orthographic_size+zoom*speed))};write(camera.entity,'Camera3D',c.Camera3D);}
    }
    const text=notice||(active.title+' · '+(paused?'已暂停':'场景运行')+' | WASD / 方向键移动 · +/- 缩放 · 空格暂停\n对局规则尚未接入');
    if(statusLabel&&statusLabel.components.Text.text!==text){statusLabel.components.Text={...statusLabel.components.Text,text};write(statusLabel.entity,'Text',statusLabel.components.Text);}
  }
  return {start,back,reload,tick,sceneLoaded,status:()=>({map:active?.id||null,scene:engine.scene?.path||null,pending:pending?.scene||null,elapsed,paused,pathing:runtime?.pathing?{size:[...runtime.pathing.size],revision:runtime.pathing.revision,sourceSha256:runtime.pathing.sourceSha256}:null})};
})();
function onSceneLoaded(scene){FrostMapSession.sceneLoaded(scene);}
function onTick(dt){FrostMapSession.tick(dt);}
