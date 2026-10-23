// Author: MiYu. Original FDF menu control inventory and source coordinate conversion.
export const WARCRAFT_UI_SCALE=1200;
export const WARCRAFT_UI_FONT='Assets/Fonts/Warcraft-Master.ttf';
export const WARCRAFT_UI_GOLD=[.99,.827,.0705,1];
export const WARCRAFT_UI_ADDITIONS=[
  ['realm','menu',true],['replay','single',true],['customCampaign','single',true],['profile','single',true],
  ['optionsGameplay','options',false],['optionsVideo','options',false],['optionsSound','options',false],
  ['pauseToggle','pause',false],['pauseOptions','pause',false],['pauseHelp','pause',false],['pauseTips','pause',false],
  ['hudAllies','toolbar',true],['hudChat','toolbar',true]
];
export function configureWarcraftButtons(buttons,manifest){
  for(const id of ['editor','hudHero','menuSnow']){const b=buttons.find(b=>b.id===id);if(b)b.hidden=true;}
  for(const id of ['multiplayer','rpg']){const b=buttons.find(b=>b.id===id);if(b)b.disabled=true;}
  for(const [id,group,disabled] of WARCRAFT_UI_ADDITIONS){const b=buttons.find(b=>b.id===id);if(b)Object.assign(b,{group,disabled});else buttons.push({id,group,disabled,x:0,y:0,w:1,h:1});}
  for(const b of buttons){if(['musicVolume','sfxVolume'].includes(b.id))b.optionsPage='sound';if(b.id==='menuSnow')b.optionsPage='video';}
  if(manifest)for(const b of buttons){const r=manifest.controls[b.id].rect,[w,h]=r.size_delta,x=(r.anchor_min[0]-.5)*960+r.anchored_position[0],y=(r.anchor_min[1]-.5)*720+r.anchored_position[1];Object.assign(b,{x,y,w,h});if(b.group==='toolbar')b.game={x,y,w,h};}
  return buttons;
}
