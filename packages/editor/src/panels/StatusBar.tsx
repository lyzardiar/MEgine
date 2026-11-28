import { AlertTriangle, CheckCircle2, CircleAlert } from 'lucide-react';
import { buildConsoleRows } from '../consoleModel';
import { useI18n } from '../i18n';
import { sceneFileName } from '../sceneLibrary';
import { getDesktopProject } from '../transport/desktopProjectSession';
import type { GizmoMode } from '../store';

export function StatusBar(props: {
  sceneName: string | null;
  sceneDirty: boolean;
  entityCount: number;
  selectedCount: number;
  gizmo: GizmoMode;
  logs: string[];
}) {
  const { t } = useI18n();
  const safeLogs = Array.isArray(props.logs) ? props.logs.filter((line): line is string => typeof line === 'string') : [];
  const consoleSummary = buildConsoleRows(
    safeLogs,
    new Set(['info', 'warn', 'error']),
    '',
    false,
  );
  const latestAlert = [...consoleSummary.rows]
    .reverse()
    .find((row) => row.level === 'error' || row.level === 'warn')
    ?? consoleSummary.rows[consoleSummary.rows.length - 1]
    ?? null;
  const projectTitle = getDesktopProject()?.projectName || 'MEngine';

  return (
    <div className="status-bar">
      <div className="me-status-group">
        <span className="me-status-scene">
          {props.sceneDirty && <span className="me-status-dirty" title="Unsaved changes" />}
          {props.sceneName ? sceneFileName(props.sceneName) : t('common.untitledScene')}
        </span>
        <span className="me-status-sep">·</span>
        <span>{t('status.objects', { count: props.entityCount })}</span>
        {props.selectedCount > 0 && (
          <>
            <span className="me-status-sep">·</span>
            <span>{t('status.selected', { count: props.selectedCount })}</span>
          </>
        )}
        <span className="me-status-badge">{props.gizmo}</span>
      </div>

      <button
        type="button"
        className={`me-status-log-btn${
          consoleSummary.counts.error > 0
            ? ' is-error'
            : consoleSummary.counts.warn > 0
              ? ' is-warn'
              : ''
        }`}
        title="Open Console"
        onClick={() => window.dispatchEvent(new CustomEvent('mengine:focus-panel', { detail: 'console' }))}
      >
        {consoleSummary.counts.error > 0 ? (
          <CircleAlert size={12} aria-hidden="true" />
        ) : consoleSummary.counts.warn > 0 ? (
          <AlertTriangle size={12} aria-hidden="true" />
        ) : (
          <CheckCircle2 size={12} aria-hidden="true" />
        )}
        <span>
          {latestAlert
            ? latestAlert.message.split(/\r?\n/, 1)[0]
            : t('status.noErrors')}
        </span>
      </button>

      <div className="me-status-group">
        {consoleSummary.counts.warn > 0 && (
          <span className="me-status-badge">
            {t('status.warnings', { count: consoleSummary.counts.warn })}
          </span>
        )}
        {consoleSummary.counts.error > 0 && (
          <span className="me-status-badge">
            {t('status.errors', { count: consoleSummary.counts.error })}
          </span>
        )}
        <span>{projectTitle}</span>
      </div>
    </div>
  );
}
