// Author: MiYu. Explicit one-time migration of a flat authored scene into editable UI assets.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {UI_SCREENS,prefabSource,stableUiId,fullStretchRect,controlLocalRect,uiSceneEntities} from './frost-ui-prefabs.mjs';

const groupScreen={menu:'MainMenu',single:'SinglePlayer',custom:'MapSelection',options:'Options',credits:'Credits',quit:'QuitDialog',network:'NetworkDialog',address:'NetworkDialog',connecting:'NetworkDialog',rooms:'NetworkDialog',lobby:'NetworkDialog',modal:'NetworkDialog',pause:'PauseDialog',rename:'RenameDialog',toolbar:'BattleHUD',inventory:'BattleHUD',hud:'BattleHUD'};
function screenFor(name,parts){
  if(parts.has(name))return groupScreen[parts.get(name).group];
  if(/^Menu (logo|subtitle)/.test(name))return 'MenuBrand';
  for(const [prefix,key] of [['Menu ','MenuBackdrop'],['Title ','MainMenu'],['Solo ','SinglePlayer'],['Front ','FrontChrome'],['Map ','MapSelection'],['Options ','Options'],['Credits ','Credits'],['Quit ','QuitDialog'],['Modal ','NetworkDialog'],['Pause ','PauseDialog'],['Rename ','RenameDialog'],['Tooltip ','Tooltip']])if(name.startsWith(prefix))return key;
  if(name==='Hero preview')return 'MapSelection';
  if(/^(Damage |Sleep |TD route |Waypoint |Drag box$)/.test(name))return 'WorldOverlay';
  if(['Status','Controls','Frost telemetry'].includes(name))return 'Notifications';
  return 'BattleHUD';
}

function sectionFor(name){
  for(const [pattern,label] of [[/^Menu snow /,'Snow'],[/^Title chain /,'Suspension'],[/^Map tile /,'Preview grid'],[/^Mini tile /,'Minimap terrain'],[/^Mini unit /,'Minimap units'],[/^Sleep /,'Sleep markers'],[/^Damage /,'Damage labels'],[/^TD route /,'Route labels'],[/^Waypoint /,'Waypoint labels']]){
    if(pattern.test(name)){const index=Number(name.match(/\d+$/)?.[0]??0),size=/tile/.test(name)?16:32;return label+' '+Math.floor(index/size);}
  }
  if(/^UI Control /.test(name))return 'Controls';
  if(/^HUD (Console|Clock|Daynight)|^(Header|Bottom|Brand|Clock|Resources)$/.test(name))return 'Console';
  if(/^(HUD Hero|HUD Selected)/.test(name))return 'Selection roster';
  if(/^(HUD Inventory|item\d)/.test(name))return 'Inventory';
  if(/^(Portrait|HUD Live portrait|Health|Mana|Selection|HUD (Stat|Health|Mana))/.test(name))return 'Selection details';
  if(/^(Minimap|Mini )/.test(name))return 'Minimap';
  return 'Presentation';
}

export function nestUiMinimapGroups(root){
  let minimap;const groups=[];
  const visit=n=>{if(n.name==='UI BattleHUD / Minimap')minimap=n;for(const child of n.children){if(/^UI BattleHUD \/ Minimap (terrain|units) /.test(child.name))groups.push({parent:n,node:child});visit(child);}};
  visit(root);if(!minimap)throw new Error('BattleHUD has no Minimap functional group');
  for(const {parent,node} of groups)if(parent!==minimap){parent.children=parent.children.filter(child=>child!==node);minimap.children.push(node);}
}

export function seedUiPrefabs(scene,buttons,outputRoot){
  for(const [key] of UI_SCREENS)if(fs.existsSync(path.join(outputRoot,prefabSource(key))))throw new Error('Seed refuses to overwrite editable prefab: '+prefabSource(key));
  const selected=uiSceneEntities(scene).entities,byName=new Map(selected.map(e=>[e.name,e])),parts=new Map();
  for(const button of buttons)for(const e of selected)if(e.name.startsWith(button.id+' '))parts.set(e.name,button);
  const oldIds=new Map(),assets=new Map(),node=(name,components,active=true)=>({id:stableUiId('node/'+name),name,active,tag:'Untagged',layer:0,components:structuredClone(components),children:[]});
  for(const [key,,active] of UI_SCREENS)assets.set(key,{version:2,name:key,root:node('UI '+key,{RectTransform:fullStretchRect()},active)});
  const converted=new Set(),groups=new Map(),groupCounts=new Map(),lastGroup=new Map();
  function append(key,child,section=sectionFor(child.name)){
    const root=assets.get(key).root,last=lastGroup.get(key),groupKey=key+'/'+section;
    let group=last?.section===section&&last.node.children.length<32?last.node:null;
    if(!group){const count=(groupCounts.get(groupKey)??0)+1;groupCounts.set(groupKey,count);group=node('UI '+key+' / '+section+(count>1?' '+count:''),{RectTransform:fullStretchRect()});root.children.push(group);lastGroup.set(key,{section,node:group});groups.set(group.name,group);}
    group.children.push(child);
  }
  function leaf(e,key){
    const active=/^Title chain/.test(e.name)||['BattleHUD','WorldOverlay','Tooltip','Notifications'].includes(key)?e.active!==false:true;
    const value=node(e.name,e.components,active);delete value.components.__MEnginePrefab;oldIds.set(String(e.entity),value.id);converted.add(e.name);return value;
  }
  const ordered=selected.filter(e=>e.components.RectTransform).sort((a,b)=>a.siblingIndex-b.siblingIndex);
  for(const e of ordered){
    if(converted.has(e.name))continue;
    const button=parts.get(e.name),key=screenFor(e.name,parts);
    if(button){
      const box=byName.get(button.id+' box');if(!box)throw new Error('Control missing box: '+button.id);
      const control=node('UI Control '+button.id,{RectTransform:box.components.RectTransform});
      for(const part of ordered.filter(p=>parts.get(p.name)===button)){
        const child=leaf(part,key);child.components.RectTransform=controlLocalRect(box.components.RectTransform,child.components.RectTransform);control.children.push(child);
      }
      append(key,control,button.group==='inventory'?'Inventory controls':button.group==='hud'?'Commands':button.group==='toolbar'?'Toolbar':'Controls');
    }else append(key,leaf(e,key));
  }
  const capture=e=>{const n=leaf(e,'BattleHUD');n.children=selected.filter(c=>c.parent===e.entity&&!c.components.RectTransform).sort((a,b)=>a.siblingIndex-b.siblingIndex).map(capture);return n;};
  for(const name of ['Portrait model','Portrait camera']){const e=byName.get(name);if(e)append('BattleHUD',capture(e),'Portrait renderer');}
  for(const e of selected)if(!converted.has(e.name))throw new Error('Unassigned UI entity: '+e.name);
  const visit=(n,fn)=>{fn(n);n.children.forEach(child=>visit(child,fn));};
  for(const asset of assets.values())visit(asset.root,n=>{if(n.children.length>32){const children=n.children;n.children=[];for(let i=0;i<children.length;i+=32){const group=node(n.name+' / '+(n.components.Transform?'Mesh slots ':'Sections ')+Math.floor(i/32),n.components.Transform?{}:{RectTransform:fullStretchRect()});group.children=children.slice(i,i+32);n.children.push(group);}}});
  nestUiMinimapGroups(assets.get('BattleHUD').root);
  for(const [key,asset] of assets){
    const localIds=new Set();visit(asset.root,n=>localIds.add(n.id));
    visit(asset.root,n=>{for(const [component,field] of [['RawImage','render_camera'],['RawImage','render_root'],['Canvas','render_camera']]){
      const value=n.components[component]?.[field];if(value==null||value==='')continue;
      const target=oldIds.get(String(value));if(!target||!localIds.has(target))throw new Error('Cross-prefab entity reference: '+n.name+'/'+field);
      n.components[component][field]={$mengine_entity_ref:{kind:'prefab_node',node:target}};
    }});
    const relative=prefabSource(key),target=path.join(outputRoot,relative);if(fs.existsSync(target))throw new Error('Seed refuses to overwrite editable prefab: '+target);
    fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(asset,null,2)+'\n');
    fs.writeFileSync(target+'.meta',JSON.stringify({schemaVersion:1,guid:stableUiId('asset/'+relative),importer:'prefab'},null,2)+'\n');
  }
  return [...assets.values()];
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const [sourceRoot,outputRoot]=process.argv.slice(2);if(!sourceRoot||!outputRoot)throw new Error('Usage: node scripts/seed-frost-ui-prefabs.mjs <seed-project> <destination-project>');
  const scene=JSON.parse(fs.readFileSync(path.join(sourceRoot,'Assets/Scenes/Main.mscene'),'utf8')).world.entities,script=fs.readFileSync(path.join(sourceRoot,'Assets/Scripts/Main.js'),'utf8'),match=script.match(/var FrostButtons=(.*);\r?\n/);
  if(!match)throw new Error('Seed script has no FrostButtons declaration');
  console.log(JSON.stringify({prefabs:seedUiPrefabs(scene,JSON.parse(match[1]),outputRoot).length,destination:path.resolve(outputRoot)}));
}
