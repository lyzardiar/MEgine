import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import {
  AI_PROVIDER_PRESETS,
  buildCopilotSystemPrompt,
  createDefaultCopilotConfig,
  getAvailableModels,
  getProviderPreset,
  isProviderReady,
  loadCopilotConfig,
  saveCopilotConfig,
  sendCopilotCompletion,
} from '../src/ai/copilotProviders.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

test('copilot provider presets expose mainstream and local models with safe defaults', () => {
  assert.ok(AI_PROVIDER_PRESETS.length >= 10);
  const deepseek = getProviderPreset('deepseek');
  assert.equal(deepseek.protocol, 'openai');
  assert.equal(deepseek.requiresApiKey, true);
  assert.ok(deepseek.defaultModels.includes('deepseek-chat'));

  const ollama = getProviderPreset('ollama');
  assert.equal(ollama.requiresApiKey, false);

  const config = createDefaultCopilotConfig();
  assert.equal(isProviderReady(config, 'deepseek'), false);
  assert.equal(isProviderReady(config, 'ollama'), true);
});

test('copilot config persists provider selection, API keys, and deduplicated custom/fetched models', () => {
  const prevStorage = globalThis.localStorage;
  globalThis.localStorage = createMemoryStorage();
  try {
    const cfg = createDefaultCopilotConfig();
    cfg.activeProviderId = 'openai';
    cfg.providers.openai.apiKey = 'sk-test-123';
    cfg.providers.openai.customModels = ['gpt-5.4-codex', 'gpt-5.4'];
    cfg.providers.openai.fetchedModels = ['gpt-5.4', 'gpt-4o-mini'];
    cfg.providers.openai.selectedModel = 'gpt-5.4-codex';
    saveCopilotConfig(cfg);

    const reloaded = loadCopilotConfig();
    assert.equal(reloaded.activeProviderId, 'openai');
    assert.equal(reloaded.providers.openai.apiKey, 'sk-test-123');
    assert.equal(isProviderReady(reloaded, 'openai'), true);

    const models = getAvailableModels(reloaded, 'openai');
    assert.equal(models[0], 'gpt-5.4-codex');
    assert.equal(models.filter((m) => m === 'gpt-5.4').length, 1);
    assert.ok(models.includes('gpt-4o-mini'));
  } finally {
    globalThis.localStorage = prevStorage;
  }
});

test('copilot system prompt injects active MEngine scene context and tool instructions cleanly', () => {
  const prompt = buildCopilotSystemPrompt(
    {
      projectName: 'Frostbound',
      sceneName: 'MainScene.mscene',
      entityCount: 12,
      selectedName: 'HeroCamera',
      selectedComponents: ['Transform', 'Camera3D'],
      errorCount: 1,
      warnCount: 2,
      toolsEnabled: true,
    },
    'Reply in Chinese',
  );
  assert.match(prompt, /Frostbound/);
  assert.match(prompt, /MainScene\.mscene/);
  assert.match(prompt, /HeroCamera \[Transform, Camera3D\]/);
  assert.match(prompt, /LIVE FULL-EDITOR TOOLS ARE ENABLED/);
  assert.match(prompt, /Reply in Chinese/);
});

test('copilot tools mutate EditorStore with RectTransform alias normalization, Undo, AgentBridge meta-tools, and DeepSeek Reasoner loop', async () => {
  const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { createEditorStore } = await server.ssrLoadModule('/src/store.ts');
    const {
      COPILOT_TOOLS,
      buildCompactSceneSummary,
      compactToolResult,
      executeCopilotTool,
      normalizeComponentPatch,
    } = await server.ssrLoadModule('/src/ai/copilotTools.ts');

    const store = createEditorStore();
    let refreshes = 0;
    let saves = 0;
    const bridgeCalls = [];
    const mockBridge = {
      async query(queryId, params) {
        bridgeCalls.push({ kind: 'query', id: queryId, params });
        if (queryId === 'asset.list') {
          return { files: ['Assets/Scenes/MainScene.mscene', 'Assets/Scripts/Player.ts'] };
        }
        if (queryId === 'console.get_logs') {
          return { logs: [{ level: 'error', message: 'Shader compile error' }] };
        }
        throw new Error(`Invalid params for ${queryId}`);
      },
      async execute(commandId, args) {
        bridgeCalls.push({ kind: 'execute', id: commandId, args });
        if (commandId === 'asset.write_text') {
          return { ok: true, path: args.path, screenshot: `data:image/png;base64,${'A'.repeat(400)}` };
        }
        throw new Error(`Invalid args for ${commandId}`);
      },
    };
    const ctx = {
      store,
      bridge: mockBridge,
      onRefresh: () => { refreshes += 1; },
      onSave: () => { saves += 1; },
      onTogglePlay: () => {},
      onFocusPanel: () => {},
    };

    // 1. Spawn a UI Button and move it to top-left using camelCase aliases (as LLMs often emit)
    const spawned = await executeCopilotTool('spawn_entity', { preset: 'Button', name: 'StartBtn' }, ctx);
    assert.equal(spawned.ok, true);
    const btnId = spawned.result.entity;
    assert.equal(typeof btnId, 'number');

    const patched = await executeCopilotTool(
      'patch_component',
      {
        entity: btnId,
        component: 'RectTransform',
        patch: {
          anchorMin: [0, 1],
          anchorMax: [0, 1],
          pivot: [0, 1],
          anchoredPosition: [16, -16],
          sizeDelta: [120, 44],
        },
      },
      ctx,
    );
    assert.equal(patched.ok, true);
    assert.deepEqual(patched.result.value.anchor_min, [0, 1]);
    assert.deepEqual(patched.result.value.anchor_max, [0, 1]);
    assert.deepEqual(patched.result.value.anchored_position, [16, -16]);
    assert.deepEqual(patched.result.value.size_delta, [120, 44]);

    const summary = buildCompactSceneSummary(store);
    assert.match(summary, /StartBtn/);
    assert.match(summary, /RectTransform/);

    // 2. Verify Undo reverts the tool edit
    const undone = await executeCopilotTool('editor_action', { action: 'undo' }, ctx);
    assert.equal(undone.ok, true);
    const afterUndo = store.snapshot().entities.find((e) => e.entity === btnId);
    assert.notDeepEqual(afterUndo.components.RectTransform.anchored_position, [16, -16]);

    // 3. Verify save action & Transform Euler conversion
    const saved = await executeCopilotTool('editor_action', { action: 'save_scene' }, ctx);
    assert.equal(saved.ok, true);
    assert.equal(saves, 1);
    assert.ok(refreshes >= 3);

    const normalizedTransform = normalizeComponentPatch('Transform', { rotation_euler: [0, 90, 0] });
    assert.equal(Array.isArray(normalizedTransform.rotation), true);
    assert.equal(normalizedTransform.rotation.length, 4);
    assert.equal('rotation_euler' in normalizedTransform, false);

    // 4. Verify AgentBridge full-editor discovery, query, command, schema feedback & blob compaction
    const discQueries = await executeCopilotTool('editor_discover', { kind: 'queries', filter: 'asset' }, ctx);
    assert.equal(discQueries.ok, true);
    assert.ok(discQueries.result.total >= 60);
    assert.ok(discQueries.result.matched.includes('asset.list'));
    assert.ok(discQueries.result.matched.includes('asset.read_text'));

    const discCommands = await executeCopilotTool('editor_discover', { kind: 'commands', filter: 'prefab' }, ctx);
    assert.equal(discCommands.ok, true);
    assert.ok(discCommands.result.total >= 100);
    assert.ok(discCommands.result.matched.includes('prefab.create'));

    const cmdSchema = await executeCopilotTool('editor_discover', { kind: 'command_schema', name: 'asset.write_text' }, ctx);
    assert.equal(cmdSchema.ok, true);
    assert.ok(cmdSchema.result.argsSchema);

    const qRes = await executeCopilotTool('editor_query', { query: 'asset.list' }, ctx);
    assert.equal(qRes.ok, true);
    assert.equal(qRes.result.files.length, 2);

    const cRes = await executeCopilotTool('editor_command', {
      command: 'asset.write_text',
      args: { path: 'Assets/Scripts/Player.ts', text: 'export class Player {}' },
    }, ctx);
    assert.equal(cRes.ok, true);
    assert.match(cRes.result.screenshot, /screenshot omitted/);

    const badCmd = await executeCopilotTool('editor_command', { command: 'prefab.create', args: {} }, ctx);
    assert.equal(badCmd.ok, false);
    assert.ok(badCmd.result.expectedArgsSchema);

    const compacted = compactToolResult({ img: `data:image/png;base64,${'B'.repeat(400)}` });
    assert.match(compacted.img, /base64 image omitted/);
    assert.equal(COPILOT_TOOLS.length, 14);

    // 4. Verify multi-turn DeepSeek Reasoner tool calling + reasoning_content passthrough
    store.select(btnId);
    const cfg = createDefaultCopilotConfig();
    cfg.activeProviderId = 'deepseek';
    cfg.providers.deepseek.apiKey = 'sk-mock-key';
    cfg.providers.deepseek.selectedModel = 'deepseek-reasoner';

    const requests = [];
    const prevFetch = globalThis.fetch;
    globalThis.fetch = async (_url, init) => {
      const parsed = JSON.parse(init.body);
      requests.push(parsed);
      if (requests.length === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{
              message: {
                role: 'assistant',
                content: null,
                reasoning_content: 'User wants StartBtn pinned to top-left; calling patch_component.',
                tool_calls: [{
                  id: 'call_rect_1',
                  type: 'function',
                  function: {
                    name: 'patch_component',
                    arguments: JSON.stringify({
                      entity: btnId,
                      component: 'RectTransform',
                      patch: { anchor_min: [0, 1], anchor_max: [0, 1], anchored_position: [16, -16] },
                    }),
                  },
                }],
              },
            }],
            usage: { total_tokens: 120 },
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              role: 'assistant',
              content: '已将 StartBtn 固定到左上角 (16, -16)。',
            },
          }],
          usage: { total_tokens: 80 },
        }),
      };
    };

    try {
      const result = await sendCopilotCompletion({
        config: cfg,
        history: [{ role: 'user', text: '把 Button 放到左上角' }],
        sceneContext: {
          projectName: 'Demo',
          sceneName: 'MainScene.mscene',
          entityCount: store.snapshot().entities.length,
          selectedName: 'StartBtn',
          selectedComponents: ['RectTransform', 'Image', 'Button'],
          errorCount: 0,
          warnCount: 0,
          toolsEnabled: true,
        },
        tools: COPILOT_TOOLS,
        executeTool: (name, args) => executeCopilotTool(name, args, ctx),
      });

      assert.equal(requests.length, 2);
      assert.ok(Array.isArray(requests[0].tools) && requests[0].tools.length >= 10);
      const assistantToolTurn = requests[1].messages.find((m) => m.role === 'assistant' && m.tool_calls);
      assert.equal(assistantToolTurn.reasoning_content, 'User wants StartBtn pinned to top-left; calling patch_component.');
      const toolResultTurn = requests[1].messages.find((m) => m.role === 'tool');
      assert.equal(toolResultTurn.tool_call_id, 'call_rect_1');

      assert.equal(result.totalTokens, 200);
      assert.equal(result.toolExecutions.length, 1);
      assert.equal(result.toolExecutions[0].ok, true);
      assert.match(result.text, /左上角/);

      const updated = store.snapshot().entities.find((e) => e.entity === btnId);
      assert.deepEqual(updated.components.RectTransform.anchor_min, [0, 1]);
      assert.deepEqual(updated.components.RectTransform.anchored_position, [16, -16]);
    } finally {
      globalThis.fetch = prevFetch;
    }
  } finally {
    await server.close();
  }
});
