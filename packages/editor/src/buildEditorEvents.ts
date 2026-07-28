import { createEditorBroadcastChannel } from './editorInstance.ts';
import type { ProjectBuildSettings } from './transport/editorTransport.ts';

export const PROJECT_BUILD_SETTINGS_CHANGED_EVENT = 'mengine:project-build-settings-changed';
export const PROJECT_BUILD_ARTIFACTS_CHANGED_EVENT = 'mengine:project-build-artifacts-changed';

type BuildEditorMessage =
  | {
      type: 'settings';
      detail: ProjectBuildSettings;
      sender: string;
      timestamp: number;
    }
  | {
      type: 'artifacts';
      detail: unknown;
      sender: string;
      timestamp: number;
    };

const BUILD_CHANNEL = 'mengine.editor.build.v1';
const buildSender = crypto.randomUUID();
let buildChannel: BroadcastChannel | null = null;

export function initializeBuildEditorEvents(): void {
  if (buildChannel) return;
  buildChannel = createEditorBroadcastChannel(BUILD_CHANNEL);
  buildChannel?.addEventListener(
    'message',
    (event: MessageEvent<BuildEditorMessage>) => {
      const message = event.data;
      if (!message || message.sender === buildSender) return;
      dispatchBuildEditorMessage(message);
    },
  );
}

export function broadcastProjectBuildSettingsChanged(
  detail: ProjectBuildSettings,
): void {
  broadcastBuildEditorMessage({
    type: 'settings',
    detail,
    sender: buildSender,
    timestamp: Date.now(),
  });
}

export function broadcastProjectBuildArtifactsChanged(detail: unknown): void {
  broadcastBuildEditorMessage({
    type: 'artifacts',
    detail,
    sender: buildSender,
    timestamp: Date.now(),
  });
}

function broadcastBuildEditorMessage(message: BuildEditorMessage): void {
  initializeBuildEditorEvents();
  dispatchBuildEditorMessage(message);
  buildChannel?.postMessage(message);
}

function dispatchBuildEditorMessage(message: BuildEditorMessage): void {
  window.dispatchEvent(new CustomEvent(
    message.type === 'settings'
      ? PROJECT_BUILD_SETTINGS_CHANGED_EVENT
      : PROJECT_BUILD_ARTIFACTS_CHANGED_EVENT,
    {
      detail: message.type === 'settings'
        ? message.detail
        : {
            detail: message.detail,
            remote: message.sender !== buildSender,
            timestamp: message.timestamp,
          },
    },
  ));
}
