import { useRef, useState } from 'react';
import {
  Bot,
  Box,
  CheckCircle2,
  Copy,
  Layers,
  PackageCheck,
  SendHorizontal,
  Sparkles,
  Sun,
  Wand2,
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

type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  code?: string;
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

export function AiAgentSidebar(props: AiAgentSidebarProps) {
  const { locale } = useI18n();
  const zh = locale === 'zh-CN';
  const projectName = getDesktopProject()?.projectName || 'MEngine Project';
  const displayScene = props.sceneName ? sceneFileName(props.sceneName) : (zh ? '未命名场景' : 'Untitled');
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome',
      role: 'assistant',
      text: zh
        ? '你好，我是 MEngine AI Copilot。你可以直接用快捷指令操作当前场景、诊断实体与光照，或接入本地 MCP Agent 进行全自动代码与场景构建。'
        : 'Hi, I am MEngine AI Copilot. Run instant scene actions, audit entities & lighting, or connect your MCP agent for full autonomous scene & script editing.',
    },
  ]);
  const listRef = useRef<HTMLDivElement>(null);

  const appendMessages = (...next: ChatMessage[]) => {
    setMessages((prev) => [...prev, ...next]);
    window.requestAnimationFrame(() => {
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    });
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
        text: zh
          ? `场景「${displayScene}」扫描完成：\n实体 ${entities.length} · 摄像机 ${cameras} · 光源 ${lights} · 画布 ${canvases} · 粒子 ${particles}\n${hints.join('\n')}`
          : `Audit for "${displayScene}":\nEntities ${entities.length} · Cameras ${cameras} · Lights ${lights} · Canvases ${canvases} · Particles ${particles}\n${hints.join('\n')}`,
      },
    );
  };

  const handleCommand = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    const lower = text.toLowerCase();
    const uid = `u-${Date.now()}`;
    const aid = `a-${Date.now() + 1}`;

    if (/^(audit|check|诊断|检查|分析)/.test(lower)) {
      runSceneAudit();
      setDraft('');
      return;
    }
    if (/(cube|立方体|方块)/.test(lower)) {
      props.store.spawnPrefab('Cube');
      props.onRefresh();
      appendMessages(
        { id: uid, role: 'user', text },
        { id: aid, role: 'assistant', text: zh ? '已在当前场景创建 3D Cube 实体并刷新层级视图。' : 'Spawned a 3D Cube in the active scene.' },
      );
      setDraft('');
      return;
    }
    if (/(light|光源|太阳光|平行光)/.test(lower)) {
      props.store.spawnDirectionalLight();
      props.onRefresh();
      appendMessages(
        { id: uid, role: 'user', text },
        { id: aid, role: 'assistant', text: zh ? '已添加 DirectionalLight 平行光源。' : 'Added a DirectionalLight to the scene.' },
      );
      setDraft('');
      return;
    }
    if (/(camera|相机|摄像机)/.test(lower)) {
      props.store.spawnCamera();
      props.onRefresh();
      appendMessages(
        { id: uid, role: 'user', text },
        { id: aid, role: 'assistant', text: zh ? '已创建新的 Camera3D 摄像机节点。' : 'Created a new Camera3D entity.' },
      );
      setDraft('');
      return;
    }
    if (/(play|运行|播放|stop|停止)/.test(lower)) {
      props.onTogglePlay();
      appendMessages(
        { id: uid, role: 'user', text },
        { id: aid, role: 'assistant', text: zh ? '已切换预览运行状态。' : 'Toggled Play Mode.' },
      );
      setDraft('');
      return;
    }
    if (/(save|保存)/.test(lower)) {
      props.onSave();
      appendMessages(
        { id: uid, role: 'user', text },
        { id: aid, role: 'assistant', text: zh ? '已触发场景保存。' : 'Triggered scene save.' },
      );
      setDraft('');
      return;
    }
    if (/(build|构建|打包|发布)/.test(lower)) {
      props.onFocusPanel('build');
      appendMessages(
        { id: uid, role: 'user', text },
        { id: aid, role: 'assistant', text: zh ? '已切换到多平台构建发布面板。' : 'Focused the Multi-Platform Build Settings panel.' },
      );
      setDraft('');
      return;
    }
    if (/(pink|粉色|玫粉)/.test(lower)) {
      setAccent('pink');
      appendMessages(
        { id: uid, role: 'user', text },
        { id: aid, role: 'assistant', text: zh ? '已切换为 PinK 霓虹玫粉主题。' : 'Switched accent theme to PinK Rose.' },
      );
      setDraft('');
      return;
    }
    if (/(cobalt|蓝色|钴蓝)/.test(lower)) {
      setAccent('cobalt');
      appendMessages(
        { id: uid, role: 'user', text },
        { id: aid, role: 'assistant', text: zh ? '已切换为 Cobalt 钴蓝主题。' : 'Switched accent theme to Cobalt Blue.' },
      );
      setDraft('');
      return;
    }
    if (/(light theme|浅色|亮色|暗色|深色|theme)/.test(lower)) {
      toggleTheme();
      appendMessages(
        { id: uid, role: 'user', text },
        { id: aid, role: 'assistant', text: zh ? '已切换明暗主题。' : 'Toggled dark/light theme.' },
      );
      setDraft('');
      return;
    }

    const mcpPrompt = `[MEngine MCP Context] Project: ${projectName} | Scene: ${displayScene} | Entities: ${props.entityCount} | Selected: ${props.selectedName ?? 'None'}\nTask: ${text}`;
    appendMessages(
      { id: uid, role: 'user', text },
      {
        id: aid,
        role: 'assistant',
        text: zh
          ? '该任务需要完整大模型推理与脚本/多资产联动。已为你打包好当前工程上下文，可一键复制到已连接的 MCP Agent 执行：'
          : 'This request benefits from full LLM + MCP tool execution. Here is a ready-to-paste context prompt for your connected MCP agent:',
        code: mcpPrompt,
      },
    );
    setDraft('');
  };

  return (
    <aside className="ide-ai-sidebar" aria-label="AI Copilot">
      <header className="ide-ai-header">
        <div className="ide-ai-title">
          <span className="ide-ai-orb" aria-hidden="true">
            <Sparkles size={13} />
          </span>
          <div>
            <strong>AI Copilot</strong>
            <span>{zh ? 'AgentBridge · 实时场景联动' : 'AgentBridge · Live Scene Sync'}</span>
          </div>
        </div>
        <div className="ide-ai-header-actions">
          <button
            type="button"
            className="ide-ghost-icon"
            title={zh ? '配置本地 MCP / AI Agent' : 'Configure MCP / AI Agent'}
            aria-label="Open AI Agent Setup"
            onClick={() => AgentSetupWindow.openFromMenu(true)}
          >
            <Bot size={14} aria-hidden="true" />
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

      <div className="ide-ai-context">
        <div className="ide-ai-ctx-row">
          <span className="ide-ai-pill is-live">
            <CheckCircle2 size={11} aria-hidden="true" /> MCP Ready
          </span>
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
          onClick={() => handleCommand(zh ? '新建 3D 立方体' : 'Create Cube')}
        >
          <Box size={12} aria-hidden="true" />
          <span>{zh ? '添加 Cube' : 'Add Cube'}</span>
        </button>
        <button
          type="button"
          className="ide-ai-quick-btn"
          onClick={() => handleCommand(zh ? '添加平行光源' : 'Add Light')}
        >
          <Sun size={12} aria-hidden="true" />
          <span>{zh ? '添加光源' : 'Add Light'}</span>
        </button>
        <button
          type="button"
          className="ide-ai-quick-btn"
          onClick={() => handleCommand(zh ? '打开多平台构建' : 'Open Build')}
        >
          <PackageCheck size={12} aria-hidden="true" />
          <span>{zh ? '多平台发布' : 'Build All'}</span>
        </button>
      </div>

      <div className="ide-ai-messages" ref={listRef}>
        {messages.map((msg) => (
          <div key={msg.id} className={`ide-ai-msg is-${msg.role}`}>
            <div className="ide-ai-bubble">
              <p>{msg.text}</p>
              {msg.code && (
                <div className="ide-ai-code-card">
                  <pre>{msg.code}</pre>
                  <button
                    type="button"
                    className="ide-ai-copy-btn"
                    onClick={() => {
                      void navigator.clipboard?.writeText(msg.code!).then(
                        () => pushToast(zh ? '已复制 MCP 上下文指令' : 'Copied MCP context prompt', 'success', 1600),
                        () => undefined,
                      );
                    }}
                  >
                    <Copy size={11} aria-hidden="true" />
                    {zh ? '复制给 Agent' : 'Copy Prompt'}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <form
        className="ide-ai-composer"
        onSubmit={(event) => {
          event.preventDefault();
          handleCommand(draft);
        }}
      >
        <input
          type="text"
          value={draft}
          placeholder={zh ? '输入指令（如：诊断、添加立方体、添加光源、切换钴蓝）…' : 'Ask AI or run action (audit, cube, light, build)…'}
          aria-label="AI Copilot prompt"
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" className="ide-ai-send-btn" disabled={!draft.trim()} aria-label="Send">
          <SendHorizontal size={13} aria-hidden="true" />
        </button>
      </form>
    </aside>
  );
}
