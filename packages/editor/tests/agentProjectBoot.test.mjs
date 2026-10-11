import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// MiYu: execute the App boot callback with failed startup dependencies.
const appSource=fs.readFileSync(fileURLToPath(new URL('../src/App.tsx',import.meta.url)),'utf8');
const bootMarker=appSource.indexOf("let bootStage = 'scene library'");
const effectPrefix='  useEffect(() => {';
const bootBody=appSource.slice(appSource.lastIndexOf(effectPrefix,bootMarker)+effectPrefix.length,appSource.indexOf('\n  }, [props.detachedPanel, store]);',bootMarker)).replace('void (async () => {','return (async () => {');
const runBoot=new Function('booted','initSceneLibrary','loadSortingLayers','refreshSprites','log','bumpScenes',bootBody);
for(const stage of ['scene library','sprites','scene restore'])test(`failed ${stage} initialization reports the cause and releases the boot flag`,async()=>{
 const booted={current:false},logs=[],failure=new Error('fixture failure');
 const dependency=name=>async()=>{if(name===stage)throw failure;return {backend:'desktop',migrated:0,prefs:{}};};
 await runBoot(booted,dependency('scene library'),dependency('sorting layers'),dependency('sprites'),(message,level)=>logs.push({message,level}),()=>{if(stage==='scene restore')throw failure;});
 assert.equal(booted.current,false);assert.deepEqual(logs,[{message:`Editor initialization failed at ${stage}: Error: fixture failure`,level:'error'}]);
});

test('project boot reports the blocking dialog without resolving it or waiting for timeout', async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { agentBridge } = await server.ssrLoadModule('/src/agent/AgentBridge.ts');
    const dialogs = await server.ssrLoadModule('/src/editorDialog.ts');
    const pending = dialogs.confirmEditor('Restore the autosaved scene?', { title: 'Scene recovery' });
    const dialog = dialogs.getActiveEditorDialog();
    await assert.rejects(agentBridge.waitForEditorBootAfter(0), (error) => {
      assert.equal(error.code, 'NOT_READY');
      assert.equal(error.data.reason, 'dialog');
      assert.equal(error.data.activeDialog.id, dialog.id);
      assert.equal(error.data.nextQuery, 'project.state');
      return true;
    });
    assert.equal(dialogs.getActiveEditorDialog().id, dialog.id);
    dialogs.respondToEditorDialog(dialog.id, 'cancel');
    assert.equal(await pending, false);
    agentBridge.editorBootReady = true;
    agentBridge.editorBootGeneration = 1;
    await agentBridge.waitForEditorBootAfter(0);
  } finally {
    await server.close();
  }
});
