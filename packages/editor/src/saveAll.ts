export const SAVE_ALL_RESOURCES_EVENT = 'mengine:save-all-resources';

export type SaveAllTask = {
  label: string;
  run: () => Promise<void>;
};

export type SaveAllResult = {
  saved: string[];
  failures: Array<{ label: string; error: string }>;
};

type SaveAllRequest = { tasks: SaveAllTask[] };

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
