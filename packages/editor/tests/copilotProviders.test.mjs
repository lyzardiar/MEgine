import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_PROVIDER_PRESETS,
  buildCopilotSystemPrompt,
  createDefaultCopilotConfig,
  getAvailableModels,
  getProviderPreset,
  isProviderReady,
  loadCopilotConfig,
  saveCopilotConfig,
} from '../src/ai/copilotProviders.ts';

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

test('copilot system prompt injects active MEngine scene context cleanly', () => {
  const prompt = buildCopilotSystemPrompt(
    {
      projectName: 'Frostbound',
      sceneName: 'MainScene.mscene',
      entityCount: 12,
      selectedName: 'HeroCamera',
      selectedComponents: ['Transform', 'Camera3D'],
      errorCount: 1,
      warnCount: 2,
    },
    'Reply in Chinese',
  );
  assert.match(prompt, /Frostbound/);
  assert.match(prompt, /MainScene\.mscene/);
  assert.match(prompt, /HeroCamera \[Transform, Camera3D\]/);
  assert.match(prompt, /Reply in Chinese/);
});
