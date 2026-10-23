// Author: MiYu. Folding and selection invalidate tree presentation independently of scene content.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import ts from '../node_modules/typescript/lib/typescript.js';

const syntax=file=>ts.createSourceFile(file,fs.readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const app=syntax('App.tsx'),hierarchy=syntax('panels/Hierarchy.tsx');
const find=(node,predicate)=>predicate(node)?node:ts.forEachChild(node,child=>find(child,predicate));
const variable=(tree,name)=>find(tree,node=>ts.isVariableDeclaration(node)&&node.name.getText(tree)===name).initializer.getText(tree);
const evaluate=(code,env)=>vm.runInNewContext(ts.transpileModule('('+code+')',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,env);
const button=name=>{
  const node=find(hierarchy,node=>ts.isJsxOpeningElement(node)&&node.attributes.properties.some(p=>ts.isJsxAttribute(p)&&p.name.getText(hierarchy)==='aria-label'&&p.initializer?.text===name));
  return node.attributes.properties.find(p=>p.name?.getText(hierarchy)==='onClick').initializer.expression.getText(hierarchy);
};

test('tree folding, ping and ancestor reveal avoid world refresh while tree memo survives selection',async()=>{
  const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
  try{
    const {createEditorStore}=await server.ssrLoadModule('/src/store.ts'),store=createEditorStore();
    store.loadSceneJson(JSON.stringify({version:1,name:'Tree',world:{entities:[
      {entity:1,name:'Root',components:{}},{entity:2,name:'Child',parent:1,components:{}},
      {entity:3,name:'Leaf',parent:2,components:{}},{entity:4,name:'Other',components:{}}
    ]}}));
    let hierarchyTick=0,treeTick=0,full=0,selection=0,builds=0,previousDeps,result;
    let snap=store.presentationSnapshot();const initialEntities=snap.entities;
    const refreshHierarchy=evaluate(variable(app,'refreshHierarchy'),{setHierarchyTick:fn=>hierarchyTick=fn(hierarchyTick)});
    const props={store,filter:'',onRefresh:()=>full++,onSelectionChange:()=>selection++,onHierarchyChange:refreshHierarchy};
    const build=store.hierarchyPresentation;store.hierarchyPresentation=entities=>{builds++;return build(entities);};
    const useMemo=(fn,deps)=>{if(!previousDeps||deps.some((dep,i)=>!Object.is(dep,previousDeps[i])))result=fn();previousDeps=deps;return result;};
    const render=()=>evaluate(variable(app,'treeNodes'),{store,snap,treeTick,hierarchyTick,useMemo});
    const ids=()=>render().map(row=>row.entity.entity);
    assert.deepEqual(ids(),[1,4]);assert.equal(builds,1);
    store.select(4);snap={...snap,selected:4,selectedIds:[4]};assert.deepEqual(ids(),[1,4]);assert.equal(builds,1);
    evaluate(button('Expand all hierarchy nodes'),{props})();assert.deepEqual(ids(),[1,2,3,4]);
    evaluate(button('Collapse all hierarchy nodes'),{props})();assert.deepEqual(ids(),[1,4]);
    store.select(3);
    const reveal=find(hierarchy,node=>ts.isCallExpression(node)&&node.expression.getText(hierarchy)==='useEffect'&&node.arguments[0]?.getText(hierarchy).includes('revealEntityAncestors(selected)'));
    evaluate(reveal.arguments[0].getText(hierarchy),{props,scrollRowRef:{current:()=>{}}})();assert.deepEqual(ids(),[1,2,3,4]);
    const before=hierarchyTick;evaluate(reveal.arguments[0].getText(hierarchy),{props,scrollRowRef:{current:()=>{}}})();assert.equal(hierarchyTick,before);
    const runAction=evaluate(variable(hierarchy,'runAction'),{props,setCtx:()=>{}});
    runAction('collapseAll');assert.deepEqual(ids(),[1,4]);runAction('expandAll');assert.deepEqual(ids(),[1,2,3,4]);
    assert.equal(full,0);assert.equal(selection,0);assert.equal(snap.entities,initialEntities);assert.equal(treeTick,0);
    runAction('collapseAll');let ping;const pendingScroll={current:null};
    const subscription=find(hierarchy,node=>ts.isCallExpression(node)&&node.expression.getText(hierarchy)==='useEffect'&&node.arguments[0]?.getText(hierarchy).includes('subscribePing('));
    evaluate(subscription.arguments[0].getText(hierarchy),{props,subscribePing:fn=>ping=fn,pendingScroll,setPingId:()=>{},window:{setTimeout:()=>{}}})();
    ping({kind:'entity',id:3});assert.equal(store.selected,3);assert.equal(pendingScroll.current.id,3);assert.equal(selection,1);assert.deepEqual(ids(),[1,2,3,4]);
    store.select(1);
    for(const key of ['ArrowLeft','ArrowRight']){
      const statement=find(app,node=>ts.isIfStatement(node)&&node.expression.getText(app)===`e.key === '${key}'`);
      evaluate(`()=>{${statement.getText(app)}}`,{e:{key,preventDefault:()=>{}},store,refreshHierarchy,refreshSelection:()=>selection++})();
      assert.deepEqual(ids(),key==='ArrowLeft'?[1,4]:[1,2,3,4]);
    }
    assert.equal(full,0);assert.equal(treeTick,0);
    store.rename(4,'Renamed');snap=store.presentationSnapshot();treeTick++;assert.equal(render().at(-1).entity.name,'Renamed');
  }finally{await server.close();}
});
