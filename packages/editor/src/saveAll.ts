export const SAVE_ALL_RESOURCES_EVENT = 'mengine:save-all-resources';
export const SAVE_RESOURCE_DOCUMENT_EVENT = 'mengine:save-resource-document';
export const DISCARD_RESOURCE_DOCUMENT_EVENT = 'mengine:discard-resource-document';

export type SaveAllTask = {
  label: string;
  run: () => Promise<void>;
};

export type SaveAllResult = {
  saved: string[];
  failures: Array<{ label: string; error: string }>;
};

export type RemoteSavePeer = {
  sender: string;
  panel: string;
};

export type RemoteSaveRequest = {
  requestId: string;
  targets: string[];
  paths?: string[];
  operation?: 'save' | 'discard';
};

type SaveAllRequest = { tasks: SaveAllTask[] };
type SaveDocumentRequest = SaveAllRequest & { path: string };

type PendingRemoteSave = {
  peers: Map<string, RemoteSavePeer>;
  results: Map<string, SaveAllResult>;
  operation: 'save' | 'discard';
  resolve: (result: SaveAllResult) => void;
  timeout: ReturnType<typeof setTimeout>;
};

let remoteSaveSequence = 0;

function nextRemoteSaveRequestId(): string {
  remoteSaveSequence += 1;
  return `save-${Date.now().toString(36)}-${remoteSaveSequence.toString(36)}`;
}

function scopedSaveResult(
  peer: RemoteSavePeer,
  result: SaveAllResult,
): SaveAllResult {
  return {
    saved: result.saved.map((label) => `${peer.panel}/${label}`),
    failures: result.failures.map((failure) => ({
      label: `${peer.panel}/${failure.label}`,
      error: failure.error,
    })),
  };
}

export function mergeSaveAllResults(results: readonly SaveAllResult[]): SaveAllResult {
  return {
    saved: results.flatMap((result) => result.saved),
    failures: results.flatMap((result) => result.failures),
  };
}

export class RemoteSaveCoordinator {
  private readonly pending = new Map<string, PendingRemoteSave>();
  private readonly dispatch: (request: RemoteSaveRequest) => void;
  private readonly timeoutMs: number;
  private readonly requestId: () => string;

  constructor(
    dispatch: (request: RemoteSaveRequest) => void,
    timeoutMs = 10_000,
    requestId: () => string = nextRemoteSaveRequestId,
  ) {
    this.dispatch = dispatch;
    this.timeoutMs = timeoutMs;
    this.requestId = requestId;
  }

  request(
    peers: readonly RemoteSavePeer[],
    paths: readonly string[] = [],
    operation: 'save' | 'discard' = 'save',
  ): Promise<SaveAllResult> {
    const uniquePeers = new Map<string, RemoteSavePeer>();
    for (const peer of peers) {
      if (!peer.sender || uniquePeers.has(peer.sender)) continue;
      uniquePeers.set(peer.sender, { ...peer });
    }
    if (uniquePeers.size === 0) {
      return Promise.resolve({ saved: [], failures: [] });
    }

    const requestId = this.requestId();
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.finish(requestId, true);
      }, this.timeoutMs);
      this.pending.set(requestId, {
        peers: uniquePeers,
        results: new Map(),
        operation,
        resolve,
        timeout,
      });
      try {
        this.dispatch({
          requestId,
          targets: [...uniquePeers.keys()],
          ...(paths.length > 0 ? { paths: [...paths] } : {}),
          ...(operation === 'discard' ? { operation } : {}),
        });
      } catch (reason) {
        clearTimeout(timeout);
        this.pending.delete(requestId);
        const error = reason instanceof Error ? reason.message : String(reason);
        resolve({
          saved: [],
          failures: [...uniquePeers.values()].map((peer) => ({
            label: peer.panel,
            error: `Could not request background ${operation}: ${error}`,
          })),
        });
      }
    });
  }

  accept(requestId: string, sender: string, result: SaveAllResult): boolean {
    const pending = this.pending.get(requestId);
    if (!pending || !pending.peers.has(sender)) return false;
    if (!pending.results.has(sender)) pending.results.set(sender, structuredClone(result));
    if (pending.results.size === pending.peers.size) this.finish(requestId, false);
    return true;
  }

  dispose(): void {
    for (const requestId of [...this.pending.keys()]) this.finish(requestId, true);
  }

  private finish(requestId: string, timedOut: boolean): void {
    const pending = this.pending.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pending.delete(requestId);

    const results: SaveAllResult[] = [];
    for (const [sender, peer] of pending.peers) {
      const result = pending.results.get(sender);
      if (result) {
        results.push(scopedSaveResult(peer, result));
      } else if (timedOut) {
        results.push({
          saved: [],
          failures: [{
            label: peer.panel,
            error: `Background editor window did not respond to ${pending.operation} within ${
              this.timeoutMs
            } ms`,
          }],
        });
      }
    }
    pending.resolve(mergeSaveAllResults(results));
  }
}

export function registerSaveAllParticipant(
  label: string,
  task: () => (() => Promise<void>) | null,
): () => void {
  const listener = (event: Event) => {
    const request = (event as CustomEvent<SaveAllRequest>).detail;
    const run = task();
    if (run) request.tasks.push({ label, run });
  };
  window.addEventListener(SAVE_ALL_RESOURCES_EVENT, listener);
  return () => window.removeEventListener(SAVE_ALL_RESOURCES_EVENT, listener);
}

export function sameSaveDocumentPath(left: string | null, right: string): boolean {
  return left?.replace(/\\/g, '/').toLocaleLowerCase()
    === right.replace(/\\/g, '/').toLocaleLowerCase();
}

export function registerSaveDocumentParticipant(
  label: string,
  task: (path: string) => (() => Promise<void>) | null,
): () => void {
  const listener = (event: Event) => {
    const request = (event as CustomEvent<SaveDocumentRequest>).detail;
    const run = task(request.path);
    if (run) request.tasks.push({ label, run });
  };
  window.addEventListener(SAVE_RESOURCE_DOCUMENT_EVENT, listener);
  return () => window.removeEventListener(SAVE_RESOURCE_DOCUMENT_EVENT, listener);
}

export function registerDiscardDocumentParticipant(
  label: string,
  task: (path: string) => (() => Promise<void>) | null,
): () => void {
  const listener = (event: Event) => {
    const request = (event as CustomEvent<SaveDocumentRequest>).detail;
    const run = task(request.path);
    if (run) request.tasks.push({ label, run });
  };
  window.addEventListener(DISCARD_RESOURCE_DOCUMENT_EVENT, listener);
  return () => window.removeEventListener(DISCARD_RESOURCE_DOCUMENT_EVENT, listener);
}

export async function executeSaveAllTasks(tasks: readonly SaveAllTask[]): Promise<SaveAllResult> {
  const saved: string[] = [];
  const failures: SaveAllResult['failures'] = [];
  for (const task of tasks) {
    try {
      await task.run();
      saved.push(task.label);
    } catch (reason) {
      failures.push({
        label: task.label,
        error: reason instanceof Error ? reason.message : String(reason),
      });
    }
  }
  return { saved, failures };
}

export async function saveAllResources(): Promise<SaveAllResult> {
  const request: SaveAllRequest = { tasks: [] };
  window.dispatchEvent(new CustomEvent<SaveAllRequest>(SAVE_ALL_RESOURCES_EVENT, {
    detail: request,
  }));
  return executeSaveAllTasks(request.tasks);
}

export async function saveResourceDocument(path: string): Promise<SaveAllResult> {
  return executeResourceDocumentEvent(SAVE_RESOURCE_DOCUMENT_EVENT, path, 'save');
}

export async function discardResourceDocument(path: string): Promise<SaveAllResult> {
  return executeResourceDocumentEvent(DISCARD_RESOURCE_DOCUMENT_EVENT, path, 'discard');
}

async function executeResourceDocumentEvent(
  eventName: string,
  path: string,
  operation: 'save' | 'discard',
): Promise<SaveAllResult> {
  const request: SaveDocumentRequest = { path, tasks: [] };
  window.dispatchEvent(new CustomEvent<SaveDocumentRequest>(eventName, {
    detail: request,
  }));
  if (request.tasks.length > 1) {
    return {
      saved: [],
      failures: [{
        label: path,
        error: `Multiple resource editors claimed this document for ${operation}: ${
          request.tasks.map((task) => task.label).join(', ')
        }`,
      }],
    };
  }
  const [task] = request.tasks;
  return task
    ? executeSaveAllTasks([{ label: path, run: task.run }])
    : { saved: [], failures: [] };
}
