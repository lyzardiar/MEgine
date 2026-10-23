/* Author: MiYu. Source option controls, staged settings and pointer capture. */
var FrostOptions=(()=>{
  const defaults={music:1,sfx:1,musicEnabled:true,sfxEnabled:true,snow:true,mouseScroll:.5,keyScroll:.5,mouseScrollDisabled:false,tooltips:true,healthBars:true};
  const textures='Assets/WarcraftUI/Textures/';
  function create(api){
    const settings={...defaults},frames=Object.values(FrostWarcraftOptions.pages).flat(),bindings=FrostWarcraftOptions.bindings;
    let original=null,captured=null;
    const id=name=>'option'+name,node=name=>'Warcraft option '+name;
    const disabled=name=>!bindings[name]||bindings[name].enabledBy&&!settings[bindings[name].enabledBy]||bindings[name].disabledBy&&settings[bindings[name].disabledBy];
    function load(saved){for(const [key,value] of Object.entries(defaults))if(typeof value==='boolean'){if(typeof saved?.[key]==='boolean')settings[key]=saved[key];}else if(Number.isFinite(saved?.[key]))settings[key]=Math.max(0,Math.min(1,saved[key]));}
    function begin(){original={...settings};captured=null;}
    function finish(commit){captured=null;if(commit){if(!api.save({...settings}))return false;}else if(original){Object.assign(settings,original);api.apply();}original=null;return true;}
    function action(control){const frame=frames.find(f=>id(f.name)===control);if(!frame)return false;if(!disabled(frame.name)&&frame.type==='GLUECHECKBOX'){const key=bindings[frame.name].key;settings[key]=!settings[key];api.apply();api.refresh();}return true;}
    function move(p){const frame=frames.find(f=>f.name===captured),r=api.rect(id(captured)),half=9.6,value=Math.max(0,Math.min(1,(p.x-r.x+r.w/2-half)/Math.max(1,r.w-half*2)));settings[bindings[frame.name].key]=Math.round(value*100)/100;api.apply();api.refresh();}
    function input(input,p,page){
      if(input.pressedKeys.some(k=>['Escape','KeyA','KeyO','Enter'].includes(k))){captured=null;return false;}
      if(captured){if(input.buttons.includes(0)||input.releasedButtons.includes(0))move(p);if(input.releasedButtons.includes(0)||!input.buttons.includes(0))captured=null;return true;}
      if(input.pressedButtons.includes(0)){const f=FrostWarcraftOptions.pages[page].find(f=>f.type==='SLIDER'&&!disabled(f.name)&&api.hit(id(f.name),p));if(f){captured=f.name;move(p);return true;}}
      return false;
    }
    function render(page,input,p){
      for(const key of Object.keys(FrostWarcraftOptions.pages))api.show('Warcraft options '+key,key===page);
      for(const f of FrostWarcraftOptions.pages[page]){
        const binding=bindings[f.name],off=disabled(f.name),name=id(f.name),value=binding?settings[binding.key]:false;
        if(f.type==='SLIDER'){
          const r=api.rect(name),a=api.authored(name+' thumb').RectTransform;
          const position=binding?value:(f.initialValue-f.range[0])/(f.range[1]-f.range[0]);
          api.set(name+' thumb','RectTransform',{...a,anchored_position:[r.x+(r.w-19.2)*(position-.5),r.y]});
          api.set(name+' thumb','Image',{...api.authored(name+' thumb').Image,sprite:textures+'SinglePlayerSkirmish-ScrollBarKnob'+(off?'Disabled':'')+'.png'});
        }else if(f.type==='GLUECHECKBOX'){
          const pressed=!off&&api.hit(name,p)&&input.buttons.includes(0);
          api.set(name+' box','Image',{...api.authored(name+' box').Image,sprite:textures+'StandardCheckbox-'+(off?'Disabled':pressed?'Pressed':'Normal')+'-'+(value?'Checked':'Unchecked')+'.png'});
        }
      }
    }
    return {settings,load,begin,finish,action,input,render,cancelDrag(){captured=null;},disabled,audioFactor:looped=>looped?(settings.musicEnabled?settings.music:0):(settings.sfxEnabled?settings.sfx:0)};
  }
  return {create};
})();
