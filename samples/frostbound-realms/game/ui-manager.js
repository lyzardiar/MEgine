/* Author: MiYu. Screen lifetimes, modal input and hierarchical UI layout. */
var FrostUI=(()=>{
  const identity=()=>({anchor_min:[0,0],anchor_max:[1,1],pivot:[.5,.5],anchored_position:[0,0],size_delta:[0,0]});
  function compose(parent,child){
    const r={...child,anchor_min:[],anchor_max:[],anchored_position:[],size_delta:[]};
    for(let i=0;i<2;i++){
      const span=parent.anchor_max[i]-parent.anchor_min[i],childSpan=child.anchor_max[i]-child.anchor_min[i],anchor=child.anchor_min[i]+childSpan*child.pivot[i];
      r.anchor_min[i]=parent.anchor_min[i]+span*child.anchor_min[i];r.anchor_max[i]=parent.anchor_min[i]+span*child.anchor_max[i];
      r.size_delta[i]=parent.size_delta[i]*childSpan+child.size_delta[i];r.anchored_position[i]=parent.anchored_position[i]+parent.size_delta[i]*(anchor-parent.pivot[i])+child.anchored_position[i];
    }
    return r;
  }
  function rectangle(r,viewport){
    const size=r.size_delta.map((v,i)=>v+(r.anchor_max[i]-r.anchor_min[i])*viewport[i]);
    const pos=r.anchored_position.map((v,i)=>v+(r.anchor_min[i]+(r.anchor_max[i]-r.anchor_min[i])*r.pivot[i]-.5)*viewport[i]);
    return {x:pos[0]+(.5-r.pivot[0])*size[0],y:pos[1]+(.5-r.pivot[1])*size[1],w:size[0],h:size[1]};
  }
  function relative(parent,child,viewport){
    const r={...child,anchor_min:[],anchor_max:[],anchored_position:[],size_delta:[]};
    for(let i=0;i<2;i++){
      const span=parent.anchor_max[i]-parent.anchor_min[i];
      if(Math.abs(span)>1e-8){
        r.anchor_min[i]=(child.anchor_min[i]-parent.anchor_min[i])/span;r.anchor_max[i]=(child.anchor_max[i]-parent.anchor_min[i])/span;
        const delta=r.anchor_max[i]-r.anchor_min[i],anchor=r.anchor_min[i]+delta*child.pivot[i];
        r.size_delta[i]=child.size_delta[i]-parent.size_delta[i]*delta;r.anchored_position[i]=child.anchored_position[i]-parent.anchored_position[i]-(anchor-parent.pivot[i])*parent.size_delta[i];
      }else{
        r.anchor_min[i]=0;r.anchor_max[i]=1;
        r.size_delta[i]=(child.anchor_max[i]-child.anchor_min[i])*viewport[i]+child.size_delta[i]-parent.size_delta[i];
        const anchor=child.anchor_min[i]+(child.anchor_max[i]-child.anchor_min[i])*child.pivot[i];
        r.anchored_position[i]=(anchor-parent.anchor_min[i])*viewport[i]+child.anchored_position[i]-parent.anchored_position[i]+(parent.pivot[i]-child.pivot[i])*parent.size_delta[i];
      }
    }
    return r;
  }
  function create(manifest,entities,authored,active,activate,write){
    const byId=new Map(Object.values(entities).map(e=>[e.entity,e])),parents={},local={},screens={},controlBoxes={},buttons={},buttonStates={};
    let viewport=[1280,720],modal=null,stateKey='';
    for(const e of Object.values(entities)){parents[e.name]=byId.get(e.parent)?.name;if(e.components.RectTransform)local[e.name]=e.components.RectTransform;}
    function canvas(name,seen=new Set()){
      if(!name||entities[name]?.components.Canvas)return identity();
      if(seen.has(name))throw Error('Cyclic UI hierarchy: '+name);seen.add(name);
      const p=canvas(parents[name],seen);return local[name]?compose(p,local[name]):p;
    }
    const authoredCanvas={};
    for(const name of Object.keys(manifest.nodes))if(local[name])authoredCanvas[name]=canvas(name);
    for(const [name,rect] of Object.entries(authoredCanvas))authored[name]={...authored[name],RectTransform:rect};
    for(const [id,control] of Object.entries(manifest.controls)){controlBoxes[id+' box']=control.name;buttons[id]=control;}
    function setRect(name,rect){
      const target=controlBoxes[name]??name;
      if(!local[target]){write(name,'RectTransform',rect);return;}
      const value=relative(canvas(parents[target]),rect,viewport);local[target]=value;write(target,'RectTransform',value);
      if(target!==name){const value=identity();value.pivot=rect.pivot;local[name]=value;write(name,'RectTransform',value);}
    }
    function update(context,input){
      const {mode,paused,rename}=context,world=['playing','finished','reconnecting','editor'].includes(mode),v=FrostHUD.viewport(input,world);viewport=[v.width,v.height];
      modal=rename?'RenameDialog':mode==='playing'&&paused?'PauseDialog':['network','address','connecting','rooms','lobby','reconnecting','finished'].includes(mode)?'NetworkDialog':mode==='quit'?'QuitDialog':null;
      const key=mode+'/'+!!paused+'/'+!!rename;if(key===stateKey)return;stateKey=key;
      const enabled={MenuBackdrop:!world,MenuBrand:mode==='title'||mode==='single',MainMenu:mode==='title',SinglePlayer:mode==='single',FrontChrome:['custom','options','credits','quit'].includes(mode),MapSelection:mode==='custom',Options:mode==='options',Credits:mode==='credits',BattleHUD:world,WorldOverlay:world,QuitDialog:mode==='quit',NetworkDialog:['network','address','connecting','rooms','lobby','reconnecting','finished'].includes(mode),PauseDialog:mode==='playing'&&paused,RenameDialog:!!rename,Tooltip:world,Notifications:true};
      for(const screen of manifest.screens){screens[screen.key]=!!enabled[screen.key];activate(screen.name,screens[screen.key]);}
    }
    function visible(name){for(let n=name;n;n=parents[n])if(active[n]===false)return false;return true;}
    function interactive(id){const control=buttons[id];return !control||screens[control.screen]!==false&&(!modal||modal===control.screen)&&visible(control.name);}
    function buttonRect(id){const control=buttons[id];return control?rectangle(canvas(control.name),viewport):null;}
    function authoredButtonRect(id){const control=buttons[id];return control?rectangle(authoredCanvas[control.name],viewport):null;}
    function showControl(id,on){const control=buttons[id];if(control)activate(control.name,on);}
    function changedButton(id,state){if(buttonStates[id]===state)return false;buttonStates[id]=state;return true;}
    return {update,setRect,visible,interactive,buttonRect,authoredButtonRect,showControl,changedButton,canvas};
  }
  return {create,compose,relative,rectangle};
})();
if(typeof module!=='undefined')module.exports=FrostUI;
