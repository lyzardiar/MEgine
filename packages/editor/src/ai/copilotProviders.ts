export type AiProviderId =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'deepseek'
  | 'qwen'
  | 'moonshot'
  | 'siliconflow'
  | 'openrouter'
  | 'ollama'
  | 'custom';

export type AiWireProtocol = 'openai' | 'anthropic' | 'gemini';

export type AiProviderPreset = {
  id: AiProviderId;
  name: string;
  zhName: string;
  protocol: AiWireProtocol;
  defaultBaseUrl: string;
  defaultModels: readonly string[];
  requiresApiKey: boolean;
  keyPlaceholder: string;
};

export type AiProviderProfile = {
  baseUrl: string;
  apiKey: string;
  selectedModel: string;
  customModels: string[];
  fetchedModels: string[];
  temperature: number;
};

export type AiCopilotConfig = {
  activeProviderId: AiProviderId;
  useLocalMcpOnly: boolean;
  systemPrompt: string;
  providers: Record<AiProviderId, AiProviderProfile>;
};

export const LOCAL_MCP_MODEL_ID = '__local_mcp__';
const STORAGE_KEY = 'mengine.ai.copilot.config.v1';

export const AI_PROVIDER_PRESETS: readonly AiProviderPreset[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    zhName: 'OpenAI',
    protocol: 'openai',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModels: ['gpt-5.4', 'gpt-5.4-mini', 'gpt-4.1', 'o3-mini'],
    requiresApiKey: true,
    keyPlaceholder: 'sk-...',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    zhName: 'Anthropic (Claude)',
    protocol: 'anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModels: ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-haiku-3-5'],
    requiresApiKey: true,
    keyPlaceholder: 'sk-ant-...',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    zhName: 'Google Gemini',
    protocol: 'gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModels: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
    requiresApiKey: true,
    keyPlaceholder: 'AIza...',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    zhName: 'DeepSeek',
    protocol: 'openai',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModels: ['deepseek-chat', 'deepseek-reasoner'],
    requiresApiKey: true,
    keyPlaceholder: 'sk-...',
  },
  {
    id: 'qwen',
    name: 'Qwen (DashScope)',
    zhName: '通义千问 (DashScope)',
    protocol: 'openai',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModels: ['qwen3-coder-plus', 'qwen-max', 'qwen-plus', 'qwen-turbo'],
    requiresApiKey: true,
    keyPlaceholder: 'sk-...',
  },
  {
    id: 'moonshot',
    name: 'Moonshot (Kimi)',
    zhName: 'Moonshot (Kimi)',
    protocol: 'openai',
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    defaultModels: ['kimi-k2-0905-preview', 'moonshot-v1-128k', 'moonshot-v1-32k'],
    requiresApiKey: true,
    keyPlaceholder: 'sk-...',
  },
  {
    id: 'siliconflow',
    name: 'SiliconFlow',
    zhName: '硅基流动 (SiliconFlow)',
    protocol: 'openai',
    defaultBaseUrl: 'https://api.siliconflow.cn/v1',
    defaultModels: [
      'Qwen/Qwen3-Coder-480B-A35B-Instruct',
      'deepseek-ai/DeepSeek-V3',
      'deepseek-ai/DeepSeek-R1',
    ],
    requiresApiKey: true,
    keyPlaceholder: 'sk-...',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    zhName: 'OpenRouter',
    protocol: 'openai',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModels: [
      'anthropic/claude-sonnet-4.5',
      'openai/gpt-5.4',
      'google/gemini-2.5-pro',
      'deepseek/deepseek-chat-v3-0324',
    ],
    requiresApiKey: true,
    keyPlaceholder: 'sk-or-v1-...',
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    zhName: 'Ollama (本地模型)',
    protocol: 'openai',
    defaultBaseUrl: 'http://127.0.0.1:11434/v1',
    defaultModels: ['qwen2.5-coder:14b', 'deepseek-r1:14b', 'llama3.2:latest'],
    requiresApiKey: false,
    keyPlaceholder: '本地无需 API Key（可留空）',
  },
  {
    id: 'custom',
    name: 'Custom (OpenAI Compatible)',
    zhName: '自定义 (OpenAI 兼容)',
    protocol: 'openai',
    defaultBaseUrl: 'http://127.0.0.1:8000/v1',
    defaultModels: ['custom-model'],
    requiresApiKey: false,
    keyPlaceholder: '可选 API Key',
  },
];

export function getProviderPreset(id: AiProviderId): AiProviderPreset {
  return AI_PROVIDER_PRESETS.find((preset) => preset.id === id) ?? AI_PROVIDER_PRESETS[0];
}

export function createDefaultCopilotConfig(): AiCopilotConfig {
  const providers = {} as Record<AiProviderId, AiProviderProfile>;
  for (const preset of AI_PROVIDER_PRESETS) {
    providers[preset.id] = {
      baseUrl: preset.defaultBaseUrl,
      apiKey: '',
      selectedModel: preset.defaultModels[0] ?? '',
      customModels: [],
      fetchedModels: [],
      temperature: 0.4,
    };
  }
  return {
    activeProviderId: 'deepseek',
    useLocalMcpOnly: false,
    systemPrompt: '',
    providers,
  };
}

function isProviderId(value: unknown): value is AiProviderId {
  return typeof value === 'string' && AI_PROVIDER_PRESETS.some((p) => p.id === value);
}

function sanitizeModelList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function loadCopilotConfig(): AiCopilotConfig {
  const fallback = createDefaultCopilotConfig();
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<AiCopilotConfig> | null;
    if (!parsed || typeof parsed !== 'object') return fallback;
    const next: AiCopilotConfig = {
      activeProviderId: isProviderId(parsed.activeProviderId)
        ? parsed.activeProviderId
        : fallback.activeProviderId,
      useLocalMcpOnly: Boolean(parsed.useLocalMcpOnly),
      systemPrompt: typeof parsed.systemPrompt === 'string' ? parsed.systemPrompt : '',
      providers: { ...fallback.providers },
    };
    const rawProviders = parsed.providers as Partial<Record<AiProviderId, Partial<AiProviderProfile>>> | undefined;
    if (rawProviders && typeof rawProviders === 'object') {
      for (const preset of AI_PROVIDER_PRESETS) {
        const stored = rawProviders[preset.id];
        if (!stored || typeof stored !== 'object') continue;
        const customModels = sanitizeModelList(stored.customModels);
        const fetchedModels = sanitizeModelList(stored.fetchedModels);
        const temp = typeof stored.temperature === 'number' && Number.isFinite(stored.temperature)
          ? Math.max(0, Math.min(2, stored.temperature))
          : 0.4;
        next.providers[preset.id] = {
          baseUrl: typeof stored.baseUrl === 'string' && stored.baseUrl.trim()
            ? stored.baseUrl.trim()
            : preset.defaultBaseUrl,
          apiKey: typeof stored.apiKey === 'string' ? stored.apiKey : '',
          selectedModel: typeof stored.selectedModel === 'string' && stored.selectedModel.trim()
            ? stored.selectedModel.trim()
            : preset.defaultModels[0] ?? '',
          customModels,
          fetchedModels,
          temperature: temp,
        };
      }
    }
    return next;
  } catch {
    return fallback;
  }
}

export function saveCopilotConfig(config: AiCopilotConfig): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    }
  } catch {
    // Ignore storage quota / private mode failures.
  }
}

export function getAvailableModels(config: AiCopilotConfig, providerId = config.activeProviderId): string[] {
  const preset = getProviderPreset(providerId);
  const profile = config.providers[providerId];
  const seen = new Set<string>();
  const models: string[] = [];
  const push = (id: string) => {
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    models.push(trimmed);
  };
  for (const m of profile?.customModels ?? []) push(m);
  for (const m of preset.defaultModels) push(m);
  for (const m of profile?.fetchedModels ?? []) push(m);
  if (profile?.selectedModel) push(profile.selectedModel);
  return models;
}

export function isProviderReady(config: AiCopilotConfig, providerId = config.activeProviderId): boolean {
  const preset = getProviderPreset(providerId);
  const profile = config.providers[providerId];
  if (!profile) return false;
  if (!profile.baseUrl.trim()) return false;
  if (!preset.requiresApiKey) return true;
  return profile.apiKey.trim().length > 0;
}

function trimTrailingSlash(url: string): string {
  return url.trim().replace(/\/+$/u, '');
}

export async function fetchProviderModels(
  providerId: AiProviderId,
  profile: AiProviderProfile,
  signal?: AbortSignal,
): Promise<string[]> {
  const preset = getProviderPreset(providerId);
  const baseUrl = trimTrailingSlash(profile.baseUrl || preset.defaultBaseUrl);
  if (!baseUrl) {
    throw new Error('Base URL is empty');
  }

  if (preset.protocol === 'gemini') {
    const key = profile.apiKey.trim();
    if (!key) throw new Error('Gemini requires an API Key');
    const response = await fetch(`${baseUrl}/models?key=${encodeURIComponent(key)}`, {
      method: 'GET',
      signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
    }
    const data = (await response.json()) as { models?: Array<{ name?: string; supportedGenerationMethods?: string[] }> };
    const list = (data.models ?? [])
      .filter((m) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
      .map((m) => (m.name ?? '').replace(/^models\//u, ''))
      .filter(Boolean);
    return sanitizeModelList(list).slice(0, 40);
  }

  const headers: Record<string, string> = {};
  if (preset.protocol === 'anthropic') {
    if (!profile.apiKey.trim()) throw new Error('Anthropic requires an API Key');
    headers['x-api-key'] = profile.apiKey.trim();
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
  } else if (profile.apiKey.trim()) {
    headers.Authorization = `Bearer ${profile.apiKey.trim()}`;
  }

  const response = await fetch(`${baseUrl}/models`, {
    method: 'GET',
    headers,
    signal,
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  const data = (await response.json()) as { data?: Array<{ id?: string }>; models?: Array<{ name?: string; id?: string }> };
  const ids = Array.isArray(data.data)
    ? data.data.map((m) => m.id ?? '')
    : Array.isArray(data.models)
      ? data.models.map((m) => m.id ?? m.name ?? '')
      : [];
  return sanitizeModelList(ids).slice(0, 50);
}

export type CopilotTurn = {
  role: 'user' | 'assistant';
  text: string;
};

export type CopilotSceneContext = {
  projectName: string;
  sceneName: string;
  entityCount: number;
  selectedName: string | null;
  selectedComponents: string[];
  errorCount: number;
  warnCount: number;
};

export type CopilotCompletionResult = {
  text: string;
  model: string;
  providerId: AiProviderId;
  totalTokens?: number;
};

export function buildCopilotSystemPrompt(ctx: CopilotSceneContext, extraPrompt: string): string {
  const parts = [
    'You are MEngine AI Copilot, an expert game engine assistant embedded inside MEngine Studio (Rust + wgpu + TypeScript/ECS).',
    'Give concise, actionable, technically accurate answers tailored to the user’s active scene.',
    `Active Project: ${ctx.projectName}`,
    `Active Scene: ${ctx.sceneName} (${ctx.entityCount} entities, ${ctx.errorCount} errors, ${ctx.warnCount} warnings)`,
    `Selected Entity: ${ctx.selectedName ? `${ctx.selectedName} [${ctx.selectedComponents.join(', ') || 'No components'}]` : 'None'}`,
  ];
  if (extraPrompt.trim()) {
    parts.push(`User Custom Instructions:\n${extraPrompt.trim()}`);
  }
  return parts.join('\n');
}

export async function sendCopilotCompletion(options: {
  config: AiCopilotConfig;
  history: CopilotTurn[];
  sceneContext: CopilotSceneContext;
  signal?: AbortSignal;
}): Promise<CopilotCompletionResult> {
  const { config, history, sceneContext, signal } = options;
  const providerId = config.activeProviderId;
  const preset = getProviderPreset(providerId);
  const profile = config.providers[providerId];
  const baseUrl = trimTrailingSlash(profile.baseUrl || preset.defaultBaseUrl);
  const model = profile.selectedModel.trim() || preset.defaultModels[0] || '';

  if (!baseUrl) throw new Error('Base URL is required');
  if (!model) throw new Error('Model is required');
  if (preset.requiresApiKey && !profile.apiKey.trim()) {
    throw new Error(`${preset.name} requires an API Key`);
  }

  const systemPrompt = buildCopilotSystemPrompt(sceneContext, config.systemPrompt);
  const recentHistory = history.slice(-12);

  if (preset.protocol === 'anthropic') {
    const response = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': profile.apiKey.trim(),
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        temperature: profile.temperature,
        system: systemPrompt,
        messages: recentHistory.map((m) => ({ role: m.role, content: m.text })),
      }),
      signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 260)}`);
    }
    const data = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text = (data.content ?? [])
      .filter((c) => c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text)
      .join('\n')
      .trim();
    const totalTokens = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);
    return {
      text: text || '(Empty response)',
      model,
      providerId,
      totalTokens: totalTokens > 0 ? totalTokens : undefined,
    };
  }

  if (preset.protocol === 'gemini') {
    const endpoint = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(profile.apiKey.trim())}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { temperature: profile.temperature },
        contents: recentHistory.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.text }],
        })),
      }),
      signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 260)}`);
    }
    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { totalTokenCount?: number };
    };
    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? '')
      .join('')
      .trim();
    return {
      text: text || '(Empty response)',
      model,
      providerId,
      totalTokens: data.usageMetadata?.totalTokenCount,
    };
  }

  // OpenAI-compatible protocol (OpenAI, DeepSeek, Qwen, Moonshot, SiliconFlow, OpenRouter, Ollama, Custom)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (profile.apiKey.trim()) {
    headers.Authorization = `Bearer ${profile.apiKey.trim()}`;
  }
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      temperature: profile.temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        ...recentHistory.map((m) => ({ role: m.role, content: m.text })),
      ],
    }),
    signal,
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 260)}`);
  }
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
    usage?: { total_tokens?: number };
  };
  const msg = data.choices?.[0]?.message;
  const text = (msg?.content ?? msg?.reasoning_content ?? '').trim();
  return {
    text: text || '(Empty response)',
    model,
    providerId,
    totalTokens: data.usage?.total_tokens,
  };
}
