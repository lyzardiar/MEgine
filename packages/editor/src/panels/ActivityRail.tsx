import {
  Activity,
  Boxes,
  Clapperboard,
  FolderKanban,
  GitBranch,
  Home,
  PackageCheck,
  Palette,
  SlidersHorizontal,
  Sparkles,
  TerminalSquare,
} from 'lucide-react';
import type { PanelKind } from './DockWorkspace';
import { useI18n } from '../i18n';

export type ActivityRailProps = {
  activePanels: ReadonlySet<PanelKind>;
  aiOpen: boolean;
  errorCount: number;
  warnCount: number;
  isDesktop: boolean;
  onFocusPanel: (panel: PanelKind) => void;
  onToggleAi: () => void;
  onOpenPreferences: () => void;
  onCloseProject: () => void;
};

export function ActivityRail(props: ActivityRailProps) {
  const { locale } = useI18n();
  const zh = locale === 'zh-CN';

  const items: Array<{
    id: PanelKind;
    label: string;
    icon: typeof Boxes;
    badge?: number;
    badgeTone?: 'error' | 'warn';
  }> = [
    { id: 'scene', label: zh ? '场景视口' : 'Scene', icon: Boxes },
    { id: 'project', label: zh ? '资源库' : 'Assets', icon: FolderKanban },
    { id: 'timeline', label: zh ? '时间轴' : 'Timeline', icon: Clapperboard },
    { id: 'animator', label: zh ? '动画状态机' : 'Animator', icon: GitBranch },
    { id: 'material', label: zh ? '材质与着色' : 'Lookdev', icon: Palette },
    { id: 'build', label: zh ? '多平台构建' : 'Build', icon: PackageCheck },
    { id: 'profiler', label: zh ? '性能分析' : 'Profiler', icon: Activity },
    {
      id: 'console',
      label: zh ? '控制台' : 'Console',
      icon: TerminalSquare,
      badge: props.errorCount > 0 ? props.errorCount : props.warnCount > 0 ? props.warnCount : undefined,
      badgeTone: props.errorCount > 0 ? 'error' : props.warnCount > 0 ? 'warn' : undefined,
    },
  ];

  return (
    <aside className="ide-activity-rail" aria-label={zh ? '工作区导航栏' : 'Workspace Activity Rail'}>
      <div className="ide-rail-group">
        {items.map((item) => {
          const Icon = item.icon;
          const active = props.activePanels.has(item.id);
          return (
            <button
              key={item.id}
              type="button"
              className={`ide-rail-btn${active ? ' active' : ''}`}
              title={item.label}
              aria-label={item.label}
              aria-pressed={active}
              onClick={() => props.onFocusPanel(item.id)}
            >
              <Icon size={17} strokeWidth={1.75} aria-hidden="true" />
              {item.badge != null && (
                <span className={`ide-rail-badge is-${item.badgeTone ?? 'info'}`}>
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="ide-rail-group ide-rail-bottom">
        <button
          type="button"
          className={`ide-rail-btn ide-rail-ai${props.aiOpen ? ' active' : ''}`}
          title={zh ? 'AI Copilot 助手 (Ctrl+Shift+A)' : 'AI Copilot (Ctrl+Shift+A)'}
          aria-label="Toggle AI Copilot"
          aria-pressed={props.aiOpen}
          onClick={props.onToggleAi}
        >
          <Sparkles size={17} strokeWidth={1.85} aria-hidden="true" />
        </button>

        <button
          type="button"
          className="ide-rail-btn"
          title={zh ? '偏好与主题设置' : 'Preferences & Theme'}
          aria-label="Open Preferences"
          onClick={props.onOpenPreferences}
        >
          <SlidersHorizontal size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>

        {props.isDesktop && (
          <button
            type="button"
            className="ide-rail-btn"
            title={zh ? '返回工程工作台' : 'Back to Project Hub'}
            aria-label="Back to Project Hub"
            onClick={props.onCloseProject}
          >
            <Home size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
      </div>
    </aside>
  );
}
