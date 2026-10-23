/* Author: MiYu. One game project owns map selection, scene requests and fresh map instances. */
var FrostMapSession=(()=>{
  const main='Assets/Scenes/Main.mscene',buttons=JSON.parse(JSON.stringify(FrostButtons));
  let active=null,runtime=null,pending=null,selected=0,loaded=false,elapsed=0,camera=null,statusLabel=null,paused=false,notice='';
  let importing=false,importMessage='',cancelRequested=false,progress=null;
  function importFile(path=null){
    if(importing||pending||active)return false;
    importing=true;cancelRequested=false;progress=null;importMessage='请选择 .w3m / .w3x 地图文件';
    engine.importContent('warcraft-map',path);return true;
  }
  function cancelImport(){if(importing){cancelRequested=true;importMessage='正在取消地图导入…';engine.cancelContentImport();}}
  function contentImported(event){
    if(!importing)return;
    if(['complete','failed','cancelled'].includes(event.status)){importing=false;progress=null;}
    if(cancelRequested){if(!importing)importMessage='已取消地图导入';return;}
    if(event.status==='choosing')importMessage='请选择 .w3m / .w3x 地图文件';
    else if(event.status==='importing'){importMessage='正在转换 '+event.file+'\n首次加载需要转换资源，请稍候。可随时取消。';progress={value:null,label:'准备地图转换…'};}
    else if(event.status==='progress'){
      if(!Number.isInteger(event.step)||!Number.isInteger(event.steps)||event.steps<1||event.step<0||event.step>=event.steps||typeof event.message!=='string')return;
      const counted=Number.isInteger(event.completed)&&Number.isInteger(event.total)&&event.total>0&&event.completed>=0&&event.completed<=event.total;
      const fraction=(event.step+(counted?event.completed/event.total:0))/event.steps;
      progress={value:Math.max(progress?.value||0,Math.min(1,fraction)),label:event.message+(counted?' '+event.completed+'/'+event.total:'')+' · 步骤 '+(event.step+1)+'/'+event.steps};
    }
    else if(event.status==='cancelled')importMessage='已取消地图选择';
    else if(event.status==='failed')importMessage='地图导入失败：'+event.message;
    else if(event.status==='complete'){
      try {
        const entry={...event.content};
        if(!/^[a-z0-9][a-z0-9-]*$/.test(entry.id)||entry.runtime!=='warcraft-scene'||entry.gameplay!==false||typeof entry.title!=='string'||typeof entry.description!=='string'||!Array.isArray(entry.preview)||entry.preview.length!==256||entry.preview.some(v=>![0,1,2].includes(v))||typeof entry.scriptSource!=='string')throw Error('地图转换结果无效');
        // Only the local converter's generated runtime is evaluated; map JASS is retained as source data.
        entry.create=new Function(entry.scriptSource+'\nreturn {tick:onTick,pathing:originalMapPathing,camera:typeof originalMapCamera==="undefined"?null:originalMapCamera};');delete entry.scriptSource;
        const index=FrostMapPackages.findIndex(map=>map.id===entry.id);
        if(index<0)FrostMapPackages.push(entry);else FrostMapPackages[index]=entry;
        importMessage=entry.cached?'正在加载缓存地图…':'转换完成，正在加载地图…';
        const choice=FrostClient.refreshMaps(entry.id);start(entry.id,choice);
      }catch(error){importMessage='地图导入失败：'+error.message;}
    }
  }
  function request(scene,id){if(pending)return false;pending={scene,id,seconds:0,frames:0,sent:false};if(scene===main||active){pending.sent=true;engine.loadScene(scene);}return true;}
  function start(id,index){const entry=FrostMapPackages.find(map=>map.id===id);if(!entry||importing)return false;selected=index;return request(entry.scene,id);}
  function back(){return request(main,null);}
  function reload(){return active?request(active.scene,active.id):false;}
  function sceneLoaded(scene){
    const entry=FrostMapPackages.find(map=>map.scene===scene.path),returning=loaded;
    if(scene.path!==main&&!entry)throw Error('Unregistered game map: '+scene.path);
    pending=null;progress=null;active=entry||null;elapsed=0;camera=null;statusLabel=null;paused=false;notice='';importMessage='';
    if(entry){runtime=entry.create();FrostClient=null;}
    else {runtime=null;FrostButtons=JSON.parse(JSON.stringify(buttons));FrostClient=createFrostClient();if(returning)FrostClient.openMaps(selected);}
    loaded=true;
  }
  function write(entity,component,value){engine.pushCommandJson(JSON.stringify({op:'setComponent',entity,component,value}));}
  function tick(dt){
    if(pending){
      pending.seconds+=Math.max(0,dt);
      // Present loading UI before the synchronous scene switch; completion comes from onSceneLoaded.
      if(!pending.sent&&++pending.frames>=2){pending.sent=true;pending.seconds=0;engine.loadScene(pending.scene);}
      if(pending.sent&&pending.seconds>10){pending=null;progress=null;notice='地图加载未完成，请重试';importMessage=notice;if(FrostClient)FrostClient.mapError(notice);}
    }
    if(!active){FrostClient.tick(dt);return;}
    const input=engine.input||{},pressed=input.pressedKeys||[],keys=input.keys||[],[width,height]=input.viewport||[1280,720],point=input.pointer||[-1,-1];
    const x=(point[0]-width/2)*1280/width,y=(point[1]-height/2)*1280/width,click=(input.pressedButtons||[]).includes(0);
    if(pressed.includes('Escape')||click&&x>=-620&&x<=-440&&y>=-340&&y<=-296){back();return;}
    if(pressed.includes('KeyR')||click&&x>=-425&&x<=-245&&y>=-340&&y<=-296){reload();return;}
    if(pressed.includes('Space'))paused=!paused;
    if(!paused){runtime.tick(dt);elapsed+=Math.max(0,dt);}else runtime.camera?.tick(dt);
    if(!camera){const found=engine.findEntitiesByName(['Camera','Map session status']);camera=found.find(e=>e.name==='Camera');statusLabel=found.find(e=>e.name==='Map session status');}
    if(camera&&!runtime.camera){
      const c=camera.components,t=c.Transform,projection=c.Camera3D,speed=Math.max(1,projection.orthographic_size)*Math.min(.2,Math.max(0,dt)),p=[...t.position];
      p[0]+=((keys.includes('ArrowRight')||keys.includes('KeyD')?1:0)-(keys.includes('ArrowLeft')||keys.includes('KeyA')?1:0))*speed;
      p[2]+=((keys.includes('ArrowDown')||keys.includes('KeyS')?1:0)-(keys.includes('ArrowUp')||keys.includes('KeyW')?1:0))*speed;
      const grid=runtime.pathing,loX=grid.origin[0]/128,hiX=loX+grid.size[0]/4,hiZ=-grid.origin[1]/128,loZ=hiZ-grid.size[1]/4;
      p[0]=Math.max(loX,Math.min(hiX,p[0]));p[2]=Math.max(loZ,Math.min(hiZ,p[2]));
      if(p.some((v,i)=>v!==t.position[i])){c.Transform={...t,position:p};write(camera.entity,'Transform',c.Transform);}
      const zoom=(keys.includes('Equal')||keys.includes('NumpadAdd')?-1:0)+(keys.includes('Minus')||keys.includes('NumpadSubtract')?1:0);
      if(zoom){c.Camera3D={...projection,orthographic_size:Math.max(4,Math.min(Math.max(hiX-loX,hiZ-loZ),projection.orthographic_size+zoom*speed))};write(camera.entity,'Camera3D',c.Camera3D);}
    }
    const text=notice||(active.title+' · '+(paused?'已暂停':'场景运行')+' | 点击 Game 后 WASD / 方向键移动 · +/- 缩放 · 空格暂停\n对局规则尚未接入');
    if(statusLabel&&statusLabel.components.Text.text!==text){statusLabel.components.Text={...statusLabel.components.Text,text};write(statusLabel.entity,'Text',statusLabel.components.Text);}
  }
  return {start,back,reload,tick,sceneLoaded,importFile,cancelImport,contentImported,importStatus:()=>({busy:importing,loading:!!pending,message:importMessage,progress:pending?{value:null,label:'正在进入地图…'}:cancelRequested&&importing?{value:null,label:'正在取消地图导入…'}:progress,visible:importing||!!pending}),status:()=>({map:active?.id||null,scene:engine.scene?.path||null,pending:pending?.scene||null,importing,importMessage,elapsed,paused,pathing:runtime?.pathing?{size:[...runtime.pathing.size],revision:runtime.pathing.revision,sourceSha256:runtime.pathing.sourceSha256}:null})};
})();
function onContentImport(event){FrostMapSession.contentImported(event);}
function onSceneLoaded(scene){FrostMapSession.sceneLoaded(scene);}
function onTick(dt){FrostMapSession.tick(dt);}
