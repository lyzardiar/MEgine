import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Box,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Layers,
  Loader2,
  PackageCheck,
  Plus,
  RefreshCw,
  RotateCcw,
  SendHorizontal,
  SlidersHorizontal,
  Sparkles,
  Square,
  Sun,
  Trash2,
  Wand2,
  Wrench,
  X,
} from 'lucide-react';
import type { EditorStore } from '../store';
import type { PanelKind } from './DockWorkspace';
import { useI18n } from '../i18n';
import { setAccent, toggleTheme } from '../theme';
import { pushToast } from '../components/ui/ToastHost';
import { AgentSetupWindow } from '../editorWindow/windows/AgentSetupWindow';
import { getDesktopProject } from '../transport/desktopProjectSession';
import { sceneFileName } from '../sceneLibrary';
import {
  AI_PROVIDER_PRESETS,
  LOCAL_MCP_MODEL_ID,
  fetchProviderModels,
  getAvailableModels,
  getProviderPreset,
  isProviderReady,
  loadCopilotConfig,
  saveCopilotConfig,
  sendCopilotCompletion,
  type AiCopilotConfig,
  type AiProviderId,
} from '../ai/copilotProviders';
import {
  COPILOT_TOOLS,
  buildCompactSceneSummary,
  executeCopilotTool,
  type CopilotToolExecution,
} from '../ai/copilotTools';

type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  code?: string;
  meta?: string;
  isError?: boolean;
  suggestConfig?: boolean;
  toolExecutions?: CopilotToolExecution[];
};

export type AiAgentSidebarProps = {
  store: EditorStore;
  sceneName: string | null;
  entityCount: number;
  selectedName: string | null;
  selectedComponents: string[];
  errorCount: number;
  warnCount: number;
  onRefresh: () => void;
  onSave: () => void;
  onTogglePlay: () => void;
  onFocusPanel: (panel: PanelKind) => void;
  onClose: () => void;
};

function makeWelcomeMessage(zh: boolean): ChatMessage {
  return {
    id: 'welcome',
    role: 'assistant',
    text: zh
      ? '你好，我是 MEngine AI Copilot。你可以点击右上角配置大模型供应商与 API Key，在下方切换使用的模型直接对话；也可以随时执行场景诊断、实体操作或接入 MCP Agent。'
      : 'Hi, I am MEngine AI Copilot. Configure your LLM provider & API key via the top-right settings button and pick a model below, or run instant local scene & MCP actions.',
  };
}

export function AiAgentSidebar(props: AiAgentSidebarProps) {
  const { locale } = useI18n();
  const zh = locale === 'zh-CN';
  const projectName = getDesktopProject()?.projectName || 'MEngine Project';
  const displayScene = props.sceneName ? sceneFileName(props.sceneName) : (zh ? '未命名场景' : 'Untitled');

  const [config, setConfig] = useState<AiCopilotConfig>(() => loadCopilotConfig());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [customModelInput, setCustomModelInput] = useState('');
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchStatus, setFetchStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [activeToolHint, setActiveToolHint] = useState<string | null>(null);
  const [toolsEnabled, setToolsEnabled] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [makeWelcomeMessage(zh)]);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const activePreset = getProviderPreset(config.activeProviderId);
  const activeProfile = config.providers[config.activeProviderId];
  const availableModels = useMemo(
    () => getAvailableModels(config, config.activeProviderId),
    [config],
  );
  const providerReady = isProviderReady(config, config.activeProviderId);
  const effectiveSelectValue = config.useLocalMcpOnly
    ? LOCAL_MCP_MODEL_ID
    : (activeProfile.selectedModel || availableModels[0] || LOCAL_MCP_MODEL_ID);

  useEffect(() => {
    saveCopilotConfig(config);
  }, [config]);

  useEffect(() => () => {
    abortRef.current?.abort();
  }, []);

  const scrollToBottom = () => {
    window.requestAnimationFrame(() => {
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    });
  };

  const appendMessages = (...next: ChatMessage[]) => {
    setMessages((prev) => [...prev, ...next]);
    scrollToBottom();
  };

  const updateActiveProfile = (patch: Partial<AiCopilotConfig['providers'][AiProviderId]>) => {
    setConfig((prev) => {
      const id = prev.activeProviderId;
      return {
        ...prev,
        providers: {
          ...prev.providers,
          [id]: {
            ...prev.providers[id],
            ...patch,
          },
        },
      };
    });
  };

  const handleSelectProvider = (nextProvider: AiProviderId) => {
    setFetchStatus(null);
    setShowKey(false);
    setConfig((prev) => {
      const preset = getProviderPreset(nextProvider);
      const existing = prev.providers[nextProvider];
      const nextModel = existing?.selectedModel || preset.defaultModels[0] || '';
      return {
        ...prev,
        activeProviderId: nextProvider,
        useLocalMcpOnly: false,
        providers: {
          ...prev.providers,
          [nextProvider]: {
            ...existing,
            selectedModel: nextModel,
          },
        },
      };
    });
  };

  const handleSelectModel = (value: string) => {
    if (value === LOCAL_MCP_MODEL_ID) {
      setConfig((prev) => ({ ...prev, useLocalMcpOnly: true }));
      return;
    }
    setConfig((prev) => {
      const id = prev.activeProviderId;
      return {
        ...prev,
        useLocalMcpOnly: false,
        providers: {
          ...prev.providers,
          [id]: {
            ...prev.providers[id],
            selectedModel: value,
          },
        },
      };
    });
  };

  const handleAddCustomModel = () => {
    const trimmed = customModelInput.trim();
    if (!trimmed) return;
    const nextCustom = Array.from(new Set([trimmed, ...activeProfile.customModels]));
    updateActiveProfile({
      customModels: nextCustom,
      selectedModel: trimmed,
    });
    setConfig((prev) => ({ ...prev, useLocalMcpOnly: false }));
    setCustomModelInput('');
    pushToast(zh ? `已添加并选中模型：${trimmed}` : `Added & selected model: ${trimmed}`, 'success');
  };

  const handleRemoveCustomModel = (modelId: string) => {
    const nextCustom = activeProfile.customModels.filter((m) => m !== modelId);
    const nextSelected = activeProfile.selectedModel === modelId
      ? (nextCustom[0] || activePreset.defaultModels[0] || '')
      : activeProfile.selectedModel;
    updateActiveProfile({
      customModels: nextCustom,
      selectedModel: nextSelected,
    });
  };

  const handleFetchModels = async () => {
    setFetchingModels(true);
    setFetchStatus(null);
    try {
      const fetched = await fetchProviderModels(config.activeProviderId, activeProfile);
      if (fetched.length === 0) {
        setFetchStatus({
          ok: true,
          text: zh ? '连接成功，但接口未返回模型列表，可继续使用预设或手动添加。' : 'Connected, but endpoint returned 0 models.',
        });
      } else {
        updateActiveProfile({
          fetchedModels: fetched,
          selectedModel: activeProfile.selectedModel || fetched[0],
        });
        setFetchStatus({
          ok: true,
          text: zh ? `连接成功，已同步 ${fetched.length} 个可用模型。` : `Connected! Synced ${fetched.length} models.`,
        });
      }
    } catch (reason) {
      const raw = reason instanceof Error ? reason.message : String(reason);
      const corsHint = /failed to fetch/i.test(raw)
        ? (zh ? '（可能被浏览器 CORS 拦截或地址不可达，建议在桌面客户端或支持 CORS 的代理地址中使用）' : ' (Check endpoint reachability or browser CORS policy)')
        : '';
      setFetchStatus({
        ok: false,
        text: `${raw}${corsHint}`,
      });
    } finally {
      setFetchingModels(false);
    }
  };

  const runSceneAudit = () => {
    const entities = props.store.snapshot().entities;
    const cameras = entities.filter((e) => Boolean(e.components.Camera3D || e.components.Camera2D)).length;
    const lights = entities.filter((e) => Boolean(e.components.DirectionalLight || e.components.PointLight || e.components.SpotLight)).length;
    const canvases = entities.filter((e) => Boolean(e.components.Canvas)).length;
    const particles = entities.filter((e) => Boolean(e.components.ParticleEmitter3D || e.components.ParticleEmitter2D)).length;
    const hints: string[] = [];
    if (cameras === 0) hints.push(zh ? '• 缺少主摄像机（建议添加 Camera3D）' : '• Missing Camera (add Camera3D)');
    if (lights === 0) hints.push(zh ? '• 缺少光源（建议添加 DirectionalLight）' : '• Missing Light (add DirectionalLight)');
    if (props.errorCount > 0) hints.push(zh ? `• 控制台存在 ${props.errorCount} 条错误日志` : `• ${props.errorCount} console errors detected`);
    if (hints.length === 0) hints.push(zh ? '• 基础场景结构健康，无阻塞问题。' : '• Scene structure looks healthy.');

    appendMessages(
      { id: `u-${Date.now()}`, role: 'user', text: zh ? '诊断当前场景状态' : 'Audit current scene' },
      {
        id: `a-${Date.now() + 1}`,
        role: 'assistant',
        meta: zh ? '本地场景引擎' : 'Local Engine',
        text: zh
          ? `场景「${displayScene}」扫描完成：\n实体 ${entities.length} · 摄像机 ${cameras} · 光源 ${lights} · 画布 ${canvases} · 粒子 ${particles}\n${hints.join('\n')}`
          : `Audit for "${displayScene}":\nEntities ${entities.length} · Cameras ${cameras} · Lights ${lights} · Canvases ${canvases} · Particles ${particles}\n${hints.join('\n')}`,
      },
    );
  };

  const tryLocalEditorAction = (text: string): boolean => {
    const lower = text.toLowerCase();
    const uid = `u-${Date.now()}`;
    const aid = `a-${Date.now() + 1}`;
    const meta = zh ? '本地快捷指令' : 'Local Action';

    if (/^(audit|check|诊断|检查|分析)/.test(lower)) {
      runSceneAudit();
      return true;
    }
    if (/^(新建|添加|创建|add|create|spawn).*(cube|立方体|方块)/.test(lower)) {
      props.store.spawnPrefab('Cube');
      props.onRefresh();
      appendMessages(
        { id: uid, role: 'user', text },
        { id: aid, role: 'assistant', meta, text: zh ? '已在当前场景创建 3D Cube 实体并刷新层级视图。' : 'Spawned a 3D Cube in the active scene.' },
      );
      return true;
    }
    if (/^(新建|添加|创建|add|create|spawn).*(light|光源|太阳光|平行光)/.test(lower)) {
      props.store.spawnDirectionalLight();
      props.onRefresh();
      appendMessages(
        { id: uid, role: 'user', text },
        { id: aid, role: 'assistant', meta, text: zh ? '已添加 DirectionalLight 平行光源。' : 'Added a DirectionalLight to the scene.' },
      );
      return true;
    }
    if (/^(新建|添加|创建|add|create|spawn).*(camera|相机|摄像机)/.test(lower)) {
      props.store.spawnCamera();
      props.onRefresh();
      appendMessages(
        { id: uid, role: 'user', text },
        { id: aid, role: 'assistant', meta, text: zh ? '已创建新的 Camera3D 摄像机节点。' : 'Created a new Camera3D entity.' },
      );
      return true;
    }
    if (/^(play|stop|运行|播放|停止)$/.test(lower)) {
      props.onTogglePlay();
      appendMessages(
        { id: uid, role: 'user', text },
        { id: aid, role: 'assistant', meta, text: zh ? '已切换预览运行状态。' : 'Toggled Play Mode.' },
      );
      return true;
    }
    if (/^(save|保存|保存场景)$/.test(lower)) {
      props.onSave();
      appendMessages(
        { id: uid, role: 'user', text },
        { id: aid, role: 'assistant', meta, text: zh ? '已触发场景保存。' : 'Triggered scene save.' },
      );
      return true;
    }
    if (/^(打开多平台构建|open build|build|构建|打包|发布)$/.test(lower)) {
      props.onFocusPanel('build');
      appendMessages(
        { id: uid, role: 'user', text },
        { id: aid, role: 'assistant', meta, text: zh ? '已切换到多平台构建发布面板。' : 'Focused the Multi-Platform Build Settings panel.' },
      );
      return true;
    }
    if (/^(pink|粉色主题|切换粉色)$/.test(lower)) {
      setAccent('pink');
      appendMessages(
        { id: uid, role: 'user', text },
        { id: aid, role: 'assistant', meta, text: zh ? '已切换为 PinK 霓虹玫粉主题。' : 'Switched accent theme to PinK Rose.' },
      );
      return true;
    }
    if (/^(cobalt|蓝色主题|切换蓝色)$/.test(lower)) {
      setAccent('cobalt');
      appendMessages(
        { id: uid, role: 'user', text },
        { id: aid, role: 'assistant', meta, text: zh ? '已切换为 Cobalt 钴蓝主题。' : 'Switched accent theme to Cobalt Blue.' },
      );
      return true;
    }
    if (/^(light theme|切换主题|浅色|深色)$/.test(lower)) {
      toggleTheme();
      appendMessages(
        { id: uid, role: 'user', text },
        { id: aid, role: 'assistant', meta, text: zh ? '已切换明暗主题。' : 'Toggled dark/light theme.' },
      );
      return true;
    }
    return false;
  };

  const handleStop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
  };

  const handleCommand = async (raw: string, forceLocal = false) => {
    const text = raw.trim();
    if (!text || busy) return;
    setDraft('');

    const useRemoteLlm = !forceLocal && !config.useLocalMcpOnly && providerReady;
    if (forceLocal || (!useRemoteLlm && tryLocalEditorAction(text))) {
      if (forceLocal) tryLocalEditorAction(text);
      return;
    }

    const uid = `u-${Date.now()}`;
    const aid = `a-${Date.now() + 1}`;

    if (!useRemoteLlm) {
      const mcpPrompt = `[MEngine MCP Context] Project: ${projectName} | Scene: ${displayScene} | Entities: ${props.entityCount} | Selected: ${props.selectedName ?? 'None'}\nTask: ${text}`;
      appendMessages(
        { id: uid, role: 'user', text },
        {
          id: aid,
          role: 'assistant',
          meta: zh ? '未配置大模型 API · MCP 模式' : 'API Not Configured · MCP Mode',
          text: zh
            ? `当前「${activePreset.zhName}」尚未配置 API Key（或处于本地 MCP 模式）。你可以点击下方按钮配置供应商与 API Key 直接对话，或复制上下文给外部 MCP Agent：`
            : `Provider "${activePreset.name}" needs an API key (or Local MCP mode is active). Configure a provider below to chat directly, or copy this context for your MCP agent:`,
          code: mcpPrompt,
          suggestConfig: true,
        },
      );
      return;
    }

    const nextHistory = [
      ...messages
        .filter((m) => m.id !== 'welcome' && !m.isError)
        .map((m) => ({ role: m.role, text: m.text })),
      { role: 'user' as const, text },
    ];
    appendMessages({ id: uid, role: 'user', text });
    setBusy(true);
    setActiveToolHint(null);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await sendCopilotCompletion({
        config,
        history: nextHistory,
        sceneContext: {
          projectName,
          sceneName: displayScene,
          entityCount: props.entityCount,
          selectedName: props.selectedName,
          selectedComponents: props.selectedComponents,
          errorCount: props.errorCount,
          warnCount: props.warnCount,
          hierarchySummary: buildCompactSceneSummary(props.store),
          toolsEnabled,
        },
        tools: toolsEnabled ? COPILOT_TOOLS : [],
        executeTool: toolsEnabled
          ? (toolName, toolArgs) => executeCopilotTool(toolName, toolArgs, {
              store: props.store,
              signal: controller.signal,
              onRefresh: props.onRefresh,
              onSave: props.onSave,
              onTogglePlay: props.onTogglePlay,
              onFocusPanel: props.onFocusPanel,
            })
          : undefined,
        onToolStep: (exec) => {
          setActiveToolHint(exec.summary);
          scrollToBottom();
        },
        signal: controller.signal,
      });
      const tokenPart = result.totalTokens ? ` · ${result.totalTokens} tok` : '';
      const toolPart = result.toolExecutions?.length
        ? ` · ${result.toolExecutions.length} ${zh ? '次操作' : 'tools'}`
        : '';
      appendMessages({
        id: aid,
        role: 'assistant',
        meta: `${activePreset.name} · ${result.model}${toolPart}${tokenPart}`,
        text: result.text,
        toolExecutions: result.toolExecutions,
      });
    } catch (reason) {
      if (controller.signal.aborted) {
        appendMessages({
          id: aid,
          role: 'assistant',
          meta: zh ? '已中止' : 'Stopped',
          text: zh ? '已停止本次生成。' : 'Generation stopped.',
        });
      } else {
        const rawErr = reason instanceof Error ? reason.message : String(reason);
        const hint = /failed to fetch/i.test(rawErr)
          ? (zh ? '\n提示：浏览器直接访问部分第三方 API 可能受 CORS 限制，可改用原生桌面端、Ollama 或支持 CORS 的中转地址。' : '\nTip: Browser requests may hit CORS on some endpoints; try the desktop app, Ollama, or a CORS-enabled gateway.')
          : '';
        appendMessages({
          id: aid,
          role: 'assistant',
          isError: true,
          suggestConfig: true,
          meta: `${activePreset.name} · Error`,
          text: `${zh ? '请求失败：' : 'Request failed: '}${rawErr}${hint}`,
        });
      }
    } finally {
      abortRef.current = null;
      setActiveToolHint(null);
      setBusy(false);
    }
  };

  const activeSubtitle = config.useLocalMcpOnly
    ? (zh ? '本地 MCP · 实时场景联动' : 'Local MCP · Live Scene Sync')
    : `${activePreset.name} · ${activeProfile.selectedModel || (zh ? '未选模型' : 'No model')}`;

  return (
    <aside className="ide-ai-sidebar" aria-label="AI Copilot">
      <header className="ide-ai-header">
        <div className="ide-ai-title">
          <span className="ide-ai-orb" aria-hidden="true">
            <Sparkles size={13} />
          </span>
          <div className="ide-ai-title-text">
            <strong>AI Copilot</strong>
            <span title={activeSubtitle}>{activeSubtitle}</span>
          </div>
        </div>
        <div className="ide-ai-header-actions">
          <button
            type="button"
            className={`ide-ghost-icon ${settingsOpen ? 'is-open' : ''}`}
            title={zh ? '供应商与模型配置' : 'Provider & Model Settings'}
            aria-label="Configure AI Provider"
            aria-pressed={settingsOpen}
            onClick={() => setSettingsOpen((open) => !open)}
          >
            <SlidersHorizontal size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="ide-ghost-icon"
            title={zh ? '打开 MCP Agent 接入配置' : 'Open MCP Agent Setup'}
            aria-label="Open AI Agent Setup"
            onClick={() => AgentSetupWindow.openFromMenu(true)}
          >
            <Bot size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="ide-ghost-icon"
            title={zh ? '清空对话记录' : 'Clear conversation'}
            aria-label="Clear AI chat"
            onClick={() => {
              handleStop();
              setMessages([makeWelcomeMessage(zh)]);
            }}
          >
            <Trash2 size={13} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="ide-ghost-icon"
            title={zh ? '收起 AI 侧栏' : 'Collapse AI Copilot'}
            aria-label="Close AI Copilot"
            onClick={props.onClose}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      </header>

      {settingsOpen ? (
        <div className="ide-ai-config" aria-label={zh ? 'AI 供应商配置' : 'AI Provider Configuration'}>
          <div className="ide-ai-config-head">
            <div>
              <strong>{zh ? '模型供应商与 API 配置' : 'Provider & API Configuration'}</strong>
              <span>{zh ? '配置自动保存在本地，支持 OpenAI / Claude / Gemini / DeepSeek / Ollama' : 'Saved locally. Supports OpenAI, Claude, Gemini, DeepSeek & Ollama.'}</span>
            </div>
            <span className={`ide-ai-pill ${providerReady ? 'is-live' : 'is-warn'}`}>
              {providerReady
                ? (zh ? '已就绪' : 'Ready')
                : (zh ? '需填 Key' : 'Key Needed')}
            </span>
          </div>

          <div className="ide-ai-config-field">
            <label htmlFor="ai-provider-select">{zh ? '供应商 (Provider)' : 'Provider'}</label>
            <select
              id="ai-provider-select"
              aria-label="AI Provider"
              value={config.activeProviderId}
              onChange={(e) => handleSelectProvider(e.target.value as AiProviderId)}
            >
              {AI_PROVIDER_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {zh ? preset.zhName : preset.name}
                </option>
              ))}
            </select>
          </div>

          <div className="ide-ai-config-field">
            <div className="ide-ai-config-label-row">
              <label htmlFor="ai-baseurl-input">API Base URL</label>
              <button
                type="button"
                className="ide-ai-link-btn"
                onClick={() => updateActiveProfile({ baseUrl: activePreset.defaultBaseUrl })}
              >
                <RotateCcw size={10} aria-hidden="true" />
                {zh ? '默认' : 'Reset'}
              </button>
            </div>
            <input
              id="ai-baseurl-input"
              type="text"
              spellCheck={false}
              value={activeProfile.baseUrl}
              placeholder={activePreset.defaultBaseUrl}
              onChange={(e) => updateActiveProfile({ baseUrl: e.target.value })}
            />
          </div>

          <div className="ide-ai-config-field">
            <div className="ide-ai-config-label-row">
              <label htmlFor="ai-apikey-input">
                API Key {!activePreset.requiresApiKey && <small>({zh ? '可选' : 'Optional'})</small>}
              </label>
              <button
                type="button"
                className="ide-ai-link-btn"
                onClick={() => setShowKey((s) => !s)}
              >
                {showKey ? <EyeOff size={11} aria-hidden="true" /> : <Eye size={11} aria-hidden="true" />}
                {showKey ? (zh ? '隐藏' : 'Hide') : (zh ? '显示' : 'Show')}
              </button>
            </div>
            <input
              id="ai-apikey-input"
              type={showKey ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              value={activeProfile.apiKey}
              placeholder={activePreset.keyPlaceholder}
              onChange={(e) => updateActiveProfile({ apiKey: e.target.value })}
            />
          </div>

          <div className="ide-ai-config-field">
            <div className="ide-ai-config-label-row">
              <label htmlFor="ai-default-model">{zh ? '当前默认模型' : 'Default Model'}</label>
              <button
                type="button"
                className="ide-ai-link-btn"
                disabled={fetchingModels}
                onClick={() => void handleFetchModels()}
              >
                <RefreshCw size={10} className={fetchingModels ? 'ide-spin' : ''} aria-hidden="true" />
                {fetchingModels ? (zh ? '拉取中…' : 'Fetching…') : (zh ? '拉取模型列表' : 'Fetch Models')}
              </button>
            </div>
            <select
              id="ai-default-model"
              aria-label="Default AI Model"
              value={activeProfile.selectedModel || availableModels[0] || ''}
              onChange={(e) => handleSelectModel(e.target.value)}
            >
              {availableModels.map((modelId) => (
                <option key={modelId} value={modelId}>{modelId}</option>
              ))}
            </select>
            {fetchStatus && (
              <div className={`ide-ai-fetch-status ${fetchStatus.ok ? 'is-ok' : 'is-err'}`}>
                {fetchStatus.text}
              </div>
            )}
          </div>

          <div className="ide-ai-config-field">
            <label htmlFor="ai-custom-model">{zh ? '添加自定义模型 ID' : 'Add Custom Model ID'}</label>
            <div className="ide-ai-inline-add">
              <input
                id="ai-custom-model"
                type="text"
                spellCheck={false}
                value={customModelInput}
                placeholder={zh ? '如：gpt-5.4-codex / qwen3:32b' : 'e.g. gpt-5.4-codex / qwen3:32b'}
                onChange={(e) => setCustomModelInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomModel();
                  }
                }}
              />
              <button type="button" className="ide-ai-add-btn" onClick={handleAddCustomModel}>
                <Plus size={13} aria-hidden="true" />
              </button>
            </div>
            {activeProfile.customModels.length > 0 && (
              <div className="ide-ai-model-chips">
                {activeProfile.customModels.map((m) => (
                  <span key={m} className="ide-ai-model-chip">
                    <span>{m}</span>
                    <button
                      type="button"
                      aria-label={`Remove model ${m}`}
                      onClick={() => handleRemoveCustomModel(m)}
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="ide-ai-config-field">
            <div className="ide-ai-config-label-row">
              <label htmlFor="ai-temp-range">{zh ? '采样温度 (Temperature)' : 'Temperature'}</label>
              <span className="ide-ai-mono-val">{activeProfile.temperature.toFixed(1)}</span>
            </div>
            <input
              id="ai-temp-range"
              type="range"
              min={0}
              max={1.5}
              step={0.1}
              value={activeProfile.temperature}
              onChange={(e) => updateActiveProfile({ temperature: Number(e.target.value) })}
            />
          </div>

          <div className="ide-ai-config-field">
            <label htmlFor="ai-sys-prompt">{zh ? '附加系统提示词（可选）' : 'Extra System Prompt (Optional)'}</label>
            <textarea
              id="ai-sys-prompt"
              rows={2}
              value={config.systemPrompt}
              placeholder={zh ? '例如：请始终使用中文回复，优先给出 TypeScript / WGSL 示例代码' : 'e.g. Prefer concise TypeScript/WGSL examples'}
              onChange={(e) => setConfig((prev) => ({ ...prev, systemPrompt: e.target.value }))}
            />
          </div>

          <div className="ide-ai-config-actions">
            <button
              type="button"
              className="ide-ai-primary-btn"
              onClick={() => {
                setSettingsOpen(false);
                pushToast(
                  zh ? `已应用供应商：${activePreset.zhName}` : `Active provider: ${activePreset.name}`,
                  'success',
                );
              }}
            >
              {zh ? '完成配置，返回对话' : 'Save & Back to Chat'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="ide-ai-context">
            <div className="ide-ai-ctx-row">
              <button
                type="button"
                className={`ide-ai-pill ide-ai-pill-btn ${providerReady && !config.useLocalMcpOnly ? 'is-live' : 'is-warn'}`}
                onClick={() => setSettingsOpen(true)}
                title={zh ? '点击切换供应商或配置 API Key' : 'Click to configure provider & API key'}
              >
                <CheckCircle2 size={11} aria-hidden="true" />
                {config.useLocalMcpOnly
                  ? 'MCP Local'
                  : providerReady
                    ? activePreset.name
                    : `${activePreset.name} · ${zh ? '未配置 Key' : 'No Key'}`}
              </button>
              <button
                type="button"
                className={`ide-ai-pill ide-ai-pill-btn ${toolsEnabled ? 'is-live' : ''}`}
                aria-pressed={toolsEnabled}
                onClick={() => setToolsEnabled((on) => !on)}
                title={zh ? '开关 AI 操作全编辑器的工具权限（覆盖场景/资产/脚本/Prefab/构建等 171 项能力）' : 'Toggle live full-editor tool access (171 AgentBridge operations)'}
              >
                <Wrench size={10} aria-hidden="true" />
                {toolsEnabled ? (zh ? '全工具已开启' : 'Full Tools ON') : (zh ? '只读问答' : 'Read-only')}
              </button>
              <span className="ide-ai-pill">{displayScene}</span>
              <span className="ide-ai-pill">{props.entityCount} {zh ? '实体' : 'Entities'}</span>
            </div>
            {props.selectedName && (
              <div className="ide-ai-selection-chip">
                <Layers size={11} aria-hidden="true" />
                <strong>{props.selectedName}</strong>
                <span>{props.selectedComponents.slice(0, 3).join(' · ') || 'Empty'}</span>
              </div>
            )}
          </div>

          <div className="ide-ai-quick-grid">
            <button type="button" className="ide-ai-quick-btn" onClick={runSceneAudit}>
              <Wand2 size={12} aria-hidden="true" />
              <span>{zh ? '场景诊断' : 'Audit Scene'}</span>
            </button>
            <button
              type="button"
              className="ide-ai-quick-btn"
              onClick={() => void handleCommand(zh ? '新建 3D 立方体' : 'Create Cube', true)}
            >
              <Box size={12} aria-hidden="true" />
              <span>{zh ? '添加 Cube' : 'Add Cube'}</span>
            </button>
            <button
              type="button"
              className="ide-ai-quick-btn"
              onClick={() => void handleCommand(zh ? '添加平行光源' : 'Add Light', true)}
            >
              <Sun size={12} aria-hidden="true" />
              <span>{zh ? '添加光源' : 'Add Light'}</span>
            </button>
            <button
              type="button"
              className="ide-ai-quick-btn"
              onClick={() => void handleCommand(zh ? '打开多平台构建' : 'Open Build', true)}
            >
              <PackageCheck size={12} aria-hidden="true" />
              <span>{zh ? '多平台发布' : 'Build All'}</span>
            </button>
          </div>

          <div className="ide-ai-messages" ref={listRef}>
            {messages.map((msg) => (
              <div key={msg.id} className={`ide-ai-msg is-${msg.role}`}>
                <div className={`ide-ai-bubble ${msg.isError ? 'is-error' : ''}`}>
                  {msg.meta && <div className="ide-ai-msg-meta">{msg.meta}</div>}
                  {msg.toolExecutions && msg.toolExecutions.length > 0 && (
                    <div className="ide-ai-tool-list" aria-label="Executed editor tools">
                      {msg.toolExecutions.map((tool) => (
                        <div key={tool.id} className={`ide-ai-tool-pill ${tool.ok ? 'is-ok' : 'is-err'}`}>
                          <Wrench size={10} aria-hidden="true" />
                          <code>{tool.name}</code>
                          <span>{tool.summary}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <p>{msg.text}</p>
                  {msg.code && (
                    <div className="ide-ai-code-card">
                      <pre>{msg.code}</pre>
                      <button
                        type="button"
                        className="ide-ai-copy-btn"
                        onClick={() => {
                          void navigator.clipboard?.writeText(msg.code ?? '');
                          pushToast(zh ? '已复制上下文指令到剪贴板' : 'Copied context prompt', 'success');
                        }}
                      >
                        <Copy size={11} aria-hidden="true" />
                        <span>{zh ? '复制给 Agent' : 'Copy for Agent'}</span>
                      </button>
                    </div>
                  )}
                  {msg.suggestConfig && (
                    <button
                      type="button"
                      className="ide-ai-inline-cfg-btn"
                      onClick={() => setSettingsOpen(true)}
                    >
                      <KeyRound size={11} aria-hidden="true" />
                      <span>{zh ? '配置供应商与 API Key' : 'Configure Provider & API Key'}</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="ide-ai-msg is-assistant">
                <div className="ide-ai-bubble is-thinking">
                  <Loader2 size={12} className="ide-spin" aria-hidden="true" />
                  <span>
                    {activeToolHint
                      ? `${zh ? '执行完成：' : 'Ran: '}${activeToolHint}`
                      : (zh ? `${activePreset.name} 正在思考…` : `${activePreset.name} is thinking…`)}
                  </span>
                </div>
              </div>
            )}
          </div>

          <form
            className="ide-ai-composer-card"
            onSubmit={(event) => {
              event.preventDefault();
              void handleCommand(draft);
            }}
          >
            <textarea
              className="ide-ai-composer-input"
              rows={2}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void handleCommand(draft);
                }
              }}
              placeholder={zh ? '输入指令或提问（Enter 发送，Shift+Enter 换行）' : 'Ask or run a command (Enter to send)...'}
              aria-label="AI Copilot command input"
            />
            <div className="ide-ai-composer-footer">
              <select
                className="ide-ai-model-select"
                aria-label={zh ? '选择使用的模型' : 'Select AI model'}
                title={zh ? '选择本次对话使用的模型' : 'Select active AI model'}
                value={effectiveSelectValue}
                onChange={(event) => handleSelectModel(event.target.value)}
              >
                <optgroup label={zh ? activePreset.zhName : activePreset.name}>
                  {availableModels.map((modelId) => (
                    <option key={modelId} value={modelId}>
                      {modelId}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={zh ? '内置模式' : 'Built-in'}>
                  <option value={LOCAL_MCP_MODEL_ID}>
                    {zh ? '本地快捷指令 / MCP' : 'Local Actions / MCP'}
                  </option>
                </optgroup>
              </select>
              <button
                type="button"
                className="ide-ai-provider-chip"
                title={zh ? '切换供应商或配置 API Key' : 'Switch provider or configure API key'}
                onClick={() => setSettingsOpen(true)}
              >
                <SlidersHorizontal size={11} aria-hidden="true" />
                <span>{activePreset.name}</span>
              </button>
              {busy ? (
                <button
                  type="button"
                  className="ide-ai-send-btn is-stop"
                  title={zh ? '停止生成' : 'Stop generation'}
                  aria-label="Stop generation"
                  onClick={handleStop}
                >
                  <Square size={12} aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="submit"
                  className="ide-ai-send-btn"
                  title={zh ? '发送' : 'Send'}
                  aria-label="Send command"
                  disabled={!draft.trim()}
                >
                  <SendHorizontal size={13} aria-hidden="true" />
                </button>
              )}
            </div>
          </form>
        </>
      )}
    </aside>
  );
}
