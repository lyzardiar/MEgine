import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDesktopProject } from '../transport/desktopProjectSession';
import {
  buildAssetPathsDirty,
  parseAlwaysIncludeDraft,
} from '../buildSettingsModel';
import { registerSaveAllParticipant } from '../saveAll';
import {
  buildPcPlayer,
  cancelPcBuild,
  chooseBuildPublicKey,
  comparePcBuildHistory,
  createPcBuildHistoryPatch,
  getProjectBuildSettings,
  isDesktopEditor,
  listPcBuildHistory,
  listPcBuildPatches,
  listenToPcBuildProgress,
  runPcPlayer,
  saveProjectBuildAssetSettings,
  saveProjectBuildSettings,
  verifyPcPlayer,
  verifyPcBuildPatch,
  type BuildComparisonResult,
  type BuildHistoryEntry,
  type BuildHistoryPatchResult,
  type BuildPatchInventoryEntry,
  type VerifyBuildPatchResult,
  type BuildPlayerProfile,
  type BuildProgressEvent,
  type BuildPlayerResult,
  type ProjectBuildSettings,
  type VerifyPlayerResult,
} from '../transport/editorTransport';

const SHADER_VARIANT_LIMIT_OPTIONS = [64, 128, 256, 512, 1024, 2048, 4096, 8192];
const MAX_RENDERED_SHADER_VARIANTS = 512;

function scenePath(name: string): string {
  return `Assets/Scenes/${name}.mscene`;
}

function sceneLabel(path: string): string {
  return path.split('/').pop() ?? path;
}

function byteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

function signedByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes === 0) return '0 B';
  return `${bytes > 0 ? '+' : '−'}${byteSize(Math.abs(bytes))}`;
}

function durationText(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return '0 ms';
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
  return `${(milliseconds / 1000).toFixed(milliseconds < 10000 ? 2 : 1)} s`;
}

function buildTimestamp(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return 'Unknown time';
  return new Date(milliseconds).toLocaleString();
}

function BuildComparisonReport(props: {
  comparison: BuildComparisonResult;
  identicalLabel: string;
}) {
  const { comparison } = props;
  return <>
    <div className="build-comparison-summary">
      <span className="added">+{comparison.addedFiles} added</span>
      <span className="removed">−{comparison.removedFiles} removed</span>
      <span className="changed">~{comparison.changedFiles} changed</span>
      <span>{comparison.unchangedFiles} unchanged</span>
      <strong>{signedByteSize(comparison.byteDelta)}</strong>
    </div>
    {comparison.changes.length > 0
      ? <div className="build-content-table changes">
          {comparison.changes.map((file) => (
            <div className={`build-content-row ${file.kind}`} key={`${file.kind}:${file.path}`}>
              <strong title={file.path}>{file.path}</strong>
              <span>{file.kind}</span>
              <span>{signedByteSize(file.byteDelta)}</span>
            </div>
          ))}
        </div>
      : <div className="build-identical">{props.identicalLabel}</div>}
  </>;
}

export function BuildSettings(props: {
  sceneName: string | null;
  sceneTick: number;
  sceneDirty: boolean;
  resourceDirty: boolean;
  onSaveScene: () => Promise<boolean>;
  onSaveAll: () => Promise<boolean>;
  onDirtyChange: (dirty: boolean) => void;
  onLog: (message: string, level?: 'info' | 'warn' | 'error') => void;
}) {
  const desktop = isDesktopEditor();
  const project = getDesktopProject();
  const [profile, setProfile] = useState<BuildPlayerProfile>('release');
  const [clean, setClean] = useState(true);
  const [settings, setSettings] = useState<ProjectBuildSettings | null>(null);
  const [alwaysIncludeDraft, setAlwaysIncludeDraft] = useState('');
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [building, setBuilding] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [buildProgress, setBuildProgress] = useState<BuildProgressEvent | null>(null);
  const [cancelRequested, setCancelRequested] = useState(false);
  const [lastBuild, setLastBuild] = useState<BuildPlayerResult | null>(null);
  const [lastVerification, setLastVerification] = useState<VerifyPlayerResult | null>(null);
  const [buildHistory, setBuildHistory] = useState<BuildHistoryEntry[]>([]);
  const [invalidHistoryRecords, setInvalidHistoryRecords] = useState(0);
  const [historyRetentionLimit, setHistoryRetentionLimit] = useState(50);
  const [historySelection, setHistorySelection] = useState<string[]>([]);
  const [historyComparison, setHistoryComparison] = useState<{
    previous: BuildHistoryEntry;
    current: BuildHistoryEntry;
    comparison: BuildComparisonResult;
  } | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyComparing, setHistoryComparing] = useState(false);
  const [historyPatching, setHistoryPatching] = useState(false);
  const [historyPatch, setHistoryPatch] = useState<BuildHistoryPatchResult | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [buildPatches, setBuildPatches] = useState<BuildPatchInventoryEntry[]>([]);
  const [invalidBuildPatches, setInvalidBuildPatches] = useState(0);
  const [patchInventoryLoading, setPatchInventoryLoading] = useState(false);
  const [patchInventoryError, setPatchInventoryError] = useState<string | null>(null);
  const [patchVerifyingId, setPatchVerifyingId] = useState<string | null>(null);
  const [patchVerification, setPatchVerification] = useState<VerifyBuildPatchResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageError, setMessageError] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const settingsRef = useRef<ProjectBuildSettings | null>(null);
  const alwaysIncludeDraftRef = useRef('');
  const buildReportRevisionRef = useRef(0);
  const historyLoadRevisionRef = useRef(0);
  const patchLoadRevisionRef = useRef(0);
  const onLogRef = useRef(props.onLog);
  settingsRef.current = settings;
  alwaysIncludeDraftRef.current = alwaysIncludeDraft;
  onLogRef.current = props.onLog;
  const assetSettingsDirty = Boolean(
    settings && buildAssetPathsDirty(alwaysIncludeDraft, settings.alwaysInclude),
  );
  const platform = useMemo(() => {
    const source = `${navigator.platform} ${navigator.userAgent}`.toLowerCase();
    if (source.includes('win')) return 'Windows (current host)';
    if (source.includes('mac')) return 'macOS (current host)';
    return 'Linux (current host)';
  }, []);
  const selectedHistoryEntries = useMemo(() => historySelection
    .map((id) => buildHistory.find((entry) => entry.id === id))
    .filter((entry): entry is BuildHistoryEntry => Boolean(entry))
    .sort((left, right) => left.recordedAtMs - right.recordedAtMs || left.id.localeCompare(right.id)),
  [buildHistory, historySelection]);
  const historyPatchEligible = selectedHistoryEntries.length === 2
    && selectedHistoryEntries.every((entry) => entry.contentAvailable && entry.artifactSigned)
    && selectedHistoryEntries[0].artifactSigningKeyId === selectedHistoryEntries[1].artifactSigningKeyId
    && selectedHistoryEntries[0].projectName === selectedHistoryEntries[1].projectName
    && selectedHistoryEntries[0].platform === selectedHistoryEntries[1].platform
    && selectedHistoryEntries[0].architecture === selectedHistoryEntries[1].architecture
    && selectedHistoryEntries[0].profile === selectedHistoryEntries[1].profile;

  const refreshBuildHistory = useCallback(async (reportFailure = true) => {
    const revision = historyLoadRevisionRef.current + 1;
    historyLoadRevisionRef.current = revision;
    if (!desktop) {
      setBuildHistory([]);
      setInvalidHistoryRecords(0);
      setHistoryRetentionLimit(50);
      setHistorySelection([]);
      setHistoryComparison(null);
      setHistoryPatch(null);
      setHistoryError(null);
      return;
    }
    setHistoryLoading(true);
    if (reportFailure) setHistoryError(null);
    try {
      const result = await listPcBuildHistory();
      if (historyLoadRevisionRef.current !== revision) return;
      const entries = result.entries;
      const ids = new Set(entries.map((entry) => entry.id));
      setBuildHistory(entries);
      setInvalidHistoryRecords(result.invalidRecords);
      setHistoryRetentionLimit(result.retentionLimit);
      setHistorySelection((selected) => selected.filter((id) => ids.has(id)));
      setHistoryComparison((current) => (
        current && ids.has(current.previous.id) && ids.has(current.current.id) ? current : null
      ));
      setHistoryError(null);
      setHistoryPatch(null);
    } catch (reason) {
      if (historyLoadRevisionRef.current !== revision) return;
      const detail = reason instanceof Error ? reason.message : String(reason);
      if (reportFailure) {
        setHistoryError(detail);
        onLogRef.current(`Build history load failed: ${detail}`, 'warn');
      }
    } finally {
      if (historyLoadRevisionRef.current === revision) setHistoryLoading(false);
    }
  }, [desktop, project?.projectRoot]);

  const refreshBuildPatches = useCallback(async (reportFailure = true) => {
    const revision = patchLoadRevisionRef.current + 1;
    patchLoadRevisionRef.current = revision;
    if (!desktop) {
      setBuildPatches([]);
      setInvalidBuildPatches(0);
      setPatchInventoryError(null);
      setPatchVerification(null);
      return;
    }
    setPatchInventoryLoading(true);
    if (reportFailure) setPatchInventoryError(null);
    try {
      const result = await listPcBuildPatches();
      if (patchLoadRevisionRef.current !== revision) return;
      setBuildPatches(result.entries);
      setInvalidBuildPatches(result.invalidPatches);
      setPatchInventoryError(null);
      setPatchVerification((current) => (
        current && result.entries.some((entry) => entry.id === current.patchId) ? current : null
      ));
    } catch (reason) {
      if (patchLoadRevisionRef.current !== revision) return;
      const detail = reason instanceof Error ? reason.message : String(reason);
      if (reportFailure) {
        setPatchInventoryError(detail);
        onLogRef.current(`Build patch inventory load failed: ${detail}`, 'warn');
      }
    } finally {
      if (patchLoadRevisionRef.current === revision) setPatchInventoryLoading(false);
    }
  }, [desktop, project?.projectRoot]);

  useEffect(() => {
    void refreshBuildHistory();
    return () => {
      historyLoadRevisionRef.current += 1;
    };
  }, [refreshBuildHistory]);

  useEffect(() => {
    void refreshBuildPatches();
    return () => {
      patchLoadRevisionRef.current += 1;
    };
  }, [refreshBuildPatches]);

  useEffect(() => {
    let cancelled = false;
    setSettingsError(null);
    void getProjectBuildSettings()
      .then((value) => {
        if (!cancelled) {
          const preserveDraft = Boolean(
            settingsRef.current
            && buildAssetPathsDirty(
              alwaysIncludeDraftRef.current,
              settingsRef.current.alwaysInclude,
            ),
          );
          settingsRef.current = value;
          setSettings(value);
          if (!preserveDraft) {
            const nextDraft = value.alwaysInclude.join('\n');
            alwaysIncludeDraftRef.current = nextDraft;
            setAlwaysIncludeDraft(nextDraft);
          }
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setSettingsError(reason instanceof Error ? reason.message : String(reason));
        }
      });
    return () => { cancelled = true; };
  }, [props.sceneTick]);

  useEffect(() => {
    props.onDirtyChange(assetSettingsDirty);
  }, [assetSettingsDirty, props.onDirtyChange]);

  useEffect(() => () => props.onDirtyChange(false), [props.onDirtyChange]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    void listenToPcBuildProgress((progress) => {
      if (!disposed) setBuildProgress(progress);
    }).then((dispose) => {
      if (disposed) dispose();
      else unlisten = dispose;
    }).catch((reason: unknown) => {
      if (!disposed) onLogRef.current(`Build progress listener failed: ${reason instanceof Error ? reason.message : String(reason)}`, 'warn');
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const invalidateBuildReport = () => {
    buildReportRevisionRef.current += 1;
    setLastBuild(null);
    setLastVerification(null);
  };

  const save = async () => {
    setMessage(null);
    const ok = await props.onSaveScene();
    setMessageError(!ok);
    setMessage(ok ? 'Scene saved. The project is ready to build.' : 'Scene save failed.');
  };

  const saveAll = async () => {
    if (savingAll) return;
    setSavingAll(true);
    setMessage(null);
    try {
      const ok = await props.onSaveAll();
      setMessageError(!ok);
      setMessage(ok ? 'All open scenes and assets were saved.' : 'Save All completed with errors.');
    } finally {
      setSavingAll(false);
    }
  };

  const persistScenes = async (scenes: string[]) => {
    if (settingsSaving || scenes.length === 0) return;
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      const next = await saveProjectBuildSettings(scenes);
      setSettings(next);
      invalidateBuildReport();
      props.onLog(`Build scenes updated: ${next.scenes.length} scene(s), entry ${sceneLabel(next.scenes[0])}`);
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : String(reason);
      setSettingsError(detail);
      props.onLog(`Build settings save failed: ${detail}`, 'error');
    } finally {
      setSettingsSaving(false);
    }
  };

  const persistAssetSettings = async (
    assetMode: 'all' | 'referenced',
    alwaysInclude: string[],
    shaderVariantLimit: number,
  ): Promise<boolean> => {
    if (settingsSaving) return false;
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      const next = await saveProjectBuildAssetSettings(
        assetMode,
        alwaysInclude,
        shaderVariantLimit,
      );
      settingsRef.current = next;
      setSettings(next);
      const nextDraft = next.alwaysInclude.join('\n');
      alwaysIncludeDraftRef.current = nextDraft;
      setAlwaysIncludeDraft(nextDraft);
      invalidateBuildReport();
      props.onLog(`Build content settings updated: ${next.assetMode}, ${next.alwaysInclude.length} always-included path(s), ${next.shaderVariantLimit} shader variants`);
      return true;
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : String(reason);
      setSettingsError(detail);
      props.onLog(`Build asset settings save failed: ${detail}`, 'error');
      return false;
    } finally {
      setSettingsSaving(false);
    }
  };

  const draftAlwaysInclude = () => parseAlwaysIncludeDraft(alwaysIncludeDraft);

  const saveAlwaysInclude = () => {
    if (settings) {
      void persistAssetSettings(
        settings.assetMode,
        draftAlwaysInclude(),
        settings.shaderVariantLimit,
      );
    }
  };

  useEffect(() => registerSaveAllParticipant('Build Asset Settings', () => {
    if (!assetSettingsDirty) return null;
    return async () => {
      const current = settingsRef.current;
      if (!current) throw new Error('Build settings are not loaded.');
      if (settingsSaving) throw new Error('Build settings are already being saved.');
      const ok = await persistAssetSettings(
        current.assetMode,
        parseAlwaysIncludeDraft(alwaysIncludeDraftRef.current),
        current.shaderVariantLimit,
      );
      if (!ok) throw new Error('Build asset settings could not be saved.');
    };
  }), [assetSettingsDirty, settingsSaving]);

  const toggleScene = (path: string) => {
    if (!settings) return;
    const index = settings.scenes.indexOf(path);
    if (index >= 0) {
      if (settings.scenes.length === 1) {
        setSettingsError('At least one scene must remain enabled.');
        return;
      }
      void persistScenes(settings.scenes.filter((scene) => scene !== path));
    } else {
      void persistScenes([...settings.scenes, path]);
    }
  };

  const moveScene = (index: number, direction: -1 | 1) => {
    if (!settings) return;
    const target = index + direction;
    if (target < 0 || target >= settings.scenes.length) return;
    const scenes = [...settings.scenes];
    [scenes[index], scenes[target]] = [scenes[target], scenes[index]];
    void persistScenes(scenes);
  };

  const addOpenScene = () => {
    if (!props.sceneName || !settings) return;
    const path = scenePath(props.sceneName);
    if (!settings.scenes.includes(path)) void persistScenes([...settings.scenes, path]);
  };

  const launch = async (result: BuildPlayerResult) => {
    if (launching) return;
    setLaunching(true);
    setMessage(null);
    setMessageError(false);
    try {
      const launched = await runPcPlayer(result.executable);
      setMessage(`Player started (process ${launched.processId}).`);
      props.onLog(`Started player process ${launched.processId} -> ${launched.executable}`);
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : String(reason);
      setMessageError(true);
      setMessage(detail);
      props.onLog(`Player launch failed: ${detail}`, 'error');
    } finally {
      setLaunching(false);
    }
  };

  const verify = async (result: BuildPlayerResult) => {
    if (verifying || building || launching) return;
    const reportRevision = buildReportRevisionRef.current;
    setVerifying(true);
    setLastVerification(null);
    setMessage(null);
    setMessageError(false);
    try {
      const verification = await verifyPcPlayer(result.executable, result.contentHash);
      if (buildReportRevisionRef.current !== reportRevision) {
        props.onLog(`Verified superseded published player -> ${verification.executable}`, 'warn');
        return;
      }
      setLastVerification(verification);
      setMessage(`Published build verified: ${verification.fileCount} files · ${verification.contentHash.slice(0, 12)}.`);
      props.onLog(`Verified published player -> ${verification.executable}`);
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : String(reason);
      if (buildReportRevisionRef.current !== reportRevision) {
        props.onLog(`Superseded published player verification failed: ${detail}`, 'warn');
        return;
      }
      setMessageError(true);
      setMessage(`Published build verification failed: ${detail}`);
      props.onLog(`Published player verification failed: ${detail}`, 'error');
    } finally {
      setVerifying(false);
    }
  };

  const cancelBuild = async () => {
    if (!building || cancelRequested) return;
    setCancelRequested(true);
    setMessage(null);
    try {
      const requested = await cancelPcBuild();
      if (!requested) {
        setCancelRequested(false);
        setMessageError(true);
        setMessage('No active Player build accepted the cancellation request.');
        return;
      }
      setMessageError(false);
      setMessage('Cancellation requested. Waiting for the current safe build step to finish...');
      props.onLog('Player build cancellation requested.', 'warn');
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : String(reason);
      setCancelRequested(false);
      setMessageError(true);
      setMessage(detail);
      props.onLog(`Player build cancellation failed: ${detail}`, 'error');
    }
  };

  const toggleHistoryEntry = (id: string) => {
    setHistorySelection((selected) => (
      selected.includes(id)
        ? selected.filter((entryId) => entryId !== id)
        : selected.length < 2 ? [...selected, id] : selected
    ));
    setHistoryComparison(null);
    setHistoryPatch(null);
  };

  const compareSelectedHistory = async () => {
    if (historySelection.length !== 2 || historyComparing || historyPatching) return;
    const selected = selectedHistoryEntries;
    if (selected.length !== 2) return;
    setHistoryComparing(true);
    setHistoryError(null);
    try {
      const comparison = await comparePcBuildHistory(selected[0].id, selected[1].id);
      setHistoryComparison({ previous: selected[0], current: selected[1], comparison });
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : String(reason);
      setHistoryComparison(null);
      setHistoryError(detail);
      props.onLog(`Build history comparison failed: ${detail}`, 'error');
    } finally {
      setHistoryComparing(false);
    }
  };

  const createSelectedHistoryPatch = async () => {
    if (!historyPatchEligible || historyPatching) return;
    const [previous, current] = selectedHistoryEntries;
    setHistoryPatching(true);
    setHistoryError(null);
    setHistoryPatch(null);
    try {
      const result = await createPcBuildHistoryPatch(previous.id, current.id);
      setHistoryPatch(result);
      setMessageError(false);
      setMessage(`Signed historical patch created: ${byteSize(result.payloadBytes)} payload.`);
      props.onLog(`Built signed historical patch -> ${result.outputDir}`);
      void refreshBuildPatches(false);
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : String(reason);
      setHistoryError(detail);
      setMessageError(true);
      setMessage(detail);
      props.onLog(`Historical patch generation failed: ${detail}`, 'error');
    } finally {
      setHistoryPatching(false);
    }
  };

  const verifyBuildPatch = async (patch: BuildPatchInventoryEntry) => {
    if (patchVerifyingId || historyPatching || !patch.baseAvailable) return;
    const publicKeyPath = await chooseBuildPublicKey();
    if (!publicKeyPath) return;
    setPatchVerifyingId(patch.id);
    setPatchInventoryError(null);
    setPatchVerification(null);
    try {
      const result = await verifyPcBuildPatch(patch.id, publicKeyPath);
      setPatchVerification(result);
      setMessageError(false);
      setMessage(`Trusted patch verification passed: ${patch.fromContentHash.slice(0, 12)} → ${patch.toContentHash.slice(0, 12)}.`);
      props.onLog(`Verified signed patch with archived base -> ${patch.outputDir}`);
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : String(reason);
      setPatchInventoryError(detail);
      setMessageError(true);
      setMessage(detail);
      props.onLog(`Build patch verification failed: ${detail}`, 'error');
    } finally {
      setPatchVerifyingId(null);
    }
  };

  const build = async (runAfterBuild = false) => {
    if (
      !desktop
      || props.sceneDirty
      || props.resourceDirty
      || assetSettingsDirty
      || settingsSaving
      || savingAll
      || !settings?.scenes.length
      || building
      || historyPatching
      || patchVerifyingId
      || launching
      || verifying
    ) return;
    setBuilding(true);
    setBuildProgress(null);
    setCancelRequested(false);
    invalidateBuildReport();
    setMessage(null);
    setMessageError(false);
    try {
      const result = await buildPcPlayer(profile, clean);
      setLastBuild(result);
      void refreshBuildHistory(false);
      void refreshBuildPatches(false);
      const patchMessage = result.incrementalPatch?.generated
        ? ` Incremental patch: ${byteSize(result.incrementalPatch.payloadBytes ?? 0)}.`
        : '';
      setMessage(`Build completed: ${result.fileCount} packaged files · ${result.contentHash.slice(0, 12)}.${patchMessage}`);
      props.onLog(`Built ${result.profile} player -> ${result.outputDir}`);
      if (result.incrementalPatch?.generated) {
        props.onLog(
          `Built signed incremental patch -> ${result.incrementalPatch.outputDir}`,
        );
      } else if (result.incrementalPatch?.reason === 'failed') {
        props.onLog(
          `Player published, but incremental patch generation failed: ${result.incrementalPatch.error ?? 'unknown error'}`,
          'warn',
        );
      }
      if (runAfterBuild) {
        setBuilding(false);
        await launch(result);
      }
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : String(reason);
      const cancelled = detail.toLowerCase().includes('build cancelled');
      setMessageError(!cancelled);
      setMessage(cancelled ? 'Player build cancelled safely. The previous published build was preserved.' : detail);
      props.onLog(
        cancelled ? 'Player build cancelled safely.' : `Player build failed: ${detail}`,
        cancelled ? 'warn' : 'error',
      );
    } finally {
      setBuilding(false);
      setCancelRequested(false);
    }
  };

  const configured = settings?.scenes ?? [];
  const available = settings?.availableScenes ?? [];
  const missing = configured.filter((path) => !available.includes(path));
  const disabled = available.filter((path) => !configured.includes(path));
  const rows = [...configured, ...disabled];
  const openScenePath = props.sceneName ? scenePath(props.sceneName) : null;

  return (
    <div className="build-settings">
      <div className="build-settings-header">
        <div>
          <strong>PC Build Settings</strong>
          <span>Packages an ordered scene list into a self-validating standalone player.</span>
        </div>
        <span className={`build-status ${building || historyPatching || patchVerifyingId || launching || verifying || settingsSaving || savingAll ? 'busy' : ''}`}>
          {building ? (cancelRequested ? 'CANCELLING' : 'BUILDING') : historyPatching ? 'PATCHING' : patchVerifyingId ? 'VERIFYING PATCH' : launching ? 'LAUNCHING' : verifying ? 'VERIFYING' : settingsSaving || savingAll ? 'SAVING' : lastVerification ? 'VERIFIED' : lastBuild ? 'SUCCEEDED' : 'READY'}
        </span>
      </div>

      {building && buildProgress && (
        <section className="build-progress-panel">
          <div>
            <strong>{cancelRequested ? 'Cancelling after safe step' : buildProgress.label}</strong>
            <span>Stage {buildProgress.stageIndex}/{buildProgress.stageCount} · {durationText(buildProgress.elapsedMs)}</span>
          </div>
          <div className="build-progress-track" aria-label="Player build progress">
            <span style={{ width: `${Math.max(0, Math.min(100, ((buildProgress.stageIndex - (buildProgress.status === 'running' ? 1 : 0)) / buildProgress.stageCount) * 100))}%` }} />
          </div>
        </section>
      )}

      <section className="build-section">
        <div className="build-section-title">
          <h3>Scenes In Build</h3>
          <button
            type="button"
            disabled={!openScenePath || configured.includes(openScenePath) || settingsSaving}
            onClick={addOpenScene}
          >
            Add Open Scene
          </button>
        </div>
        {!settings && !settingsError && <div className="build-empty">Loading project manifest...</div>}
        {rows.map((path) => {
          const index = configured.indexOf(path);
          const enabled = index >= 0;
          const isMissing = missing.includes(path);
          return (
            <div className={`build-scene-row${enabled ? ' enabled' : ''}${isMissing ? ' missing' : ''}`} key={path}>
              <span className="build-scene-index">{enabled ? index : '-'}</span>
              <input
                aria-label={`Include ${sceneLabel(path)}`}
                type="checkbox"
                checked={enabled}
                disabled={settingsSaving || (enabled && configured.length === 1)}
                onChange={() => toggleScene(path)}
              />
              <div>
                <strong>{sceneLabel(path)}</strong>
                <small>{isMissing ? 'Missing scene asset' : index === 0 ? 'Player entry point' : path}</small>
              </div>
              <div className="build-scene-actions">
                <button type="button" title="Move up" disabled={!enabled || index === 0 || settingsSaving} onClick={() => moveScene(index, -1)}>Up</button>
                <button type="button" title="Move down" disabled={!enabled || index === configured.length - 1 || settingsSaving} onClick={() => moveScene(index, 1)}>Down</button>
              </div>
            </div>
          );
        })}
        {settings && rows.length === 0 && <div className="build-empty">No .mscene assets were found under Assets/Scenes.</div>}
        {settingsError && <div className="build-warning error">{settingsError}</div>}
        {props.sceneDirty && (
          <div className="build-warning">
            <span>Current scene has unsaved changes. Save it before building.</span>
            <button type="button" onClick={() => void save()}>Save Scene</button>
          </div>
        )}
        {props.resourceDirty && (
          <div className="build-warning">
            <span>Project assets or settings have unsaved changes.</span>
            <button type="button" disabled={savingAll} onClick={() => void saveAll()}>
              {savingAll ? 'Saving All...' : 'Save All'}
            </button>
          </div>
        )}
      </section>

      <section className="build-section build-options">
        <h3>Content</h3>
        <label>Asset Packaging
          <select
            value={settings?.assetMode ?? 'all'}
            disabled={!settings || settingsSaving || building}
            onChange={(event) => {
              if (settings) {
                void persistAssetSettings(
                  event.target.value as 'all' | 'referenced',
                  draftAlwaysInclude(),
                  settings.shaderVariantLimit,
                );
              }
            }}
          >
            <option value="all">All Assets (compatible)</option>
            <option value="referenced">Referenced Only</option>
          </select>
        </label>
        <label>Shader Variant Budget
          <select
            value={settings?.shaderVariantLimit ?? 256}
            disabled={!settings || settingsSaving || building}
            onChange={(event) => {
              if (settings) {
                void persistAssetSettings(
                  settings.assetMode,
                  draftAlwaysInclude(),
                  Number(event.target.value),
                );
              }
            }}
          >
            {settings && !SHADER_VARIANT_LIMIT_OPTIONS.includes(settings.shaderVariantLimit) && (
              <option value={settings.shaderVariantLimit}>{settings.shaderVariantLimit} variants (custom)</option>
            )}
            {SHADER_VARIANT_LIMIT_OPTIONS.map((limit) => (
              <option key={limit} value={limit}>{limit} variants</option>
            ))}
          </select>
        </label>
        <label className="build-asset-paths">
          <span>Always Include</span>
          <span className="build-asset-path-editor">
            <textarea
              aria-label="Always Include asset paths"
              value={alwaysIncludeDraft}
              disabled={!settings || settingsSaving || building}
              placeholder={'Assets/Prefabs/Dynamic\nAssets/Localization'}
              onChange={(event) => {
                alwaysIncludeDraftRef.current = event.target.value;
                setAlwaysIncludeDraft(event.target.value);
                invalidateBuildReport();
              }}
            />
            <button
              type="button"
              disabled={!settings || settingsSaving || building}
              onClick={saveAlwaysInclude}
            >
              Apply Paths
            </button>
          </span>
        </label>
        {settings?.assetMode === 'referenced' && (
          <div className="build-content-note">
            Dynamic loads must be listed above. Referenced assets, transitive dependencies, sprite metadata and build scenes are included automatically.
          </div>
        )}
        {assetSettingsDirty && (
          <div className="build-warning">
            <span>Always Include has unapplied changes. Apply or Save All before building.</span>
            <button type="button" disabled={settingsSaving || building} onClick={saveAlwaysInclude}>
              {settingsSaving ? 'Applying...' : 'Apply Paths'}
            </button>
          </div>
        )}
      </section>

      <section className="build-section build-options">
        <h3>Player</h3>
        <label>Target Platform <span className="build-readonly">{platform}</span></label>
        <label>Configuration
          <select
            value={profile}
            disabled={building}
            onChange={(event) => setProfile(event.target.value as BuildPlayerProfile)}
          >
            <option value="release">Release</option>
            <option value="debug">Debug / Development</option>
          </select>
        </label>
        <label className="build-checkbox">
          <input
            type="checkbox"
            checked={clean}
            disabled={building}
            onChange={(event) => setClean(event.target.checked)}
          />
          Replace previous platform build
        </label>
        <label>Project <span className="build-readonly" title={project?.projectRoot}>{project?.projectName ?? 'Browser preview'}</span></label>
        <label>Output <span className="build-readonly">{project ? `${project.projectRoot}\\Builds` : 'Desktop editor only'}</span></label>
        <div className="build-content-note">
          When MENGINE_SIGNING_KEY is configured, replacing a compatible signed build also publishes a verified incremental patch under .mengine/build-patches.
        </div>
      </section>

      {!desktop && (
        <div className="build-warning error">
          Browser preview can edit build scenes but cannot execute the Rust toolchain. Open the desktop editor to build.
        </div>
      )}
      {message && <div className={`build-message${messageError ? ' error' : ' success'}`}>{message}</div>}
      {desktop && (
        <section className="build-section build-history-section">
          <div className="build-section-title">
            <h3>Build History</h3>
            <div className="build-history-toolbar">
              <span>{buildHistory.length}/{historyRetentionLimit} retained</span>
              <button
                type="button"
                disabled={historyLoading || historyComparing || historyPatching || Boolean(patchVerifyingId)}
                onClick={() => void refreshBuildHistory()}
              >
                {historyLoading ? 'Refreshing...' : 'Refresh'}
              </button>
              <button
                type="button"
                disabled={historySelection.length !== 2 || historyComparing || historyPatching || Boolean(patchVerifyingId)}
                onClick={() => void compareSelectedHistory()}
              >
                {historyComparing ? 'Comparing...' : 'Compare Selected'}
              </button>
              <button
                type="button"
                disabled={!historyPatchEligible || historyPatching || historyComparing || Boolean(patchVerifyingId)}
                title={historyPatchEligible
                  ? 'Rebuild both archived artifacts, then create and verify a signed patch.'
                  : 'Select two content-archived builds signed by the same key.'}
                onClick={() => void createSelectedHistoryPatch()}
              >
                {historyPatching ? 'Creating Patch...' : 'Create Signed Patch'}
              </button>
            </div>
          </div>
          {buildHistory.length === 0 && !historyLoading && !historyError && (
            <div className="build-empty">Successful Player builds will be retained here for comparison.</div>
          )}
          <div className="build-history-list">
            {buildHistory.map((entry) => {
              const selected = historySelection.includes(entry.id);
              return (
                <label
                  className={`build-history-row${selected ? ' selected' : ''}${entry.published ? ' published' : ''}`}
                  key={entry.id}
                  title={entry.recordPath}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={!selected && historySelection.length >= 2}
                    onChange={() => toggleHistoryEntry(entry.id)}
                  />
                  <span className="build-history-main">
                    <strong>{buildTimestamp(entry.recordedAtMs)}</strong>
                    <small>
                      {entry.platform}-{entry.architecture} · {entry.profile} · MEngine {entry.engineVersion}
                      {' · '}{entry.artifactSigned ? `signed ${entry.artifactSigningKeyId?.slice(0, 12)}` : 'unsigned'}
                    </small>
                  </span>
                  <span className="build-history-size">
                    <strong>{byteSize(entry.packagedBytes)}</strong>
                    <small>
                      {entry.fileCount} files · {durationText(entry.totalDurationMs)} ·{' '}
                      {entry.contentAvailable ? 'content archived' : 'manifest only'}
                    </small>
                  </span>
                  <code>{entry.contentHash.slice(0, 12)}</code>
                  {entry.published && <em>CURRENT</em>}
                </label>
              );
            })}
          </div>
          {invalidHistoryRecords > 0 && (
            <div className="build-warning">
              {invalidHistoryRecords} unreadable build history record{invalidHistoryRecords === 1 ? '' : 's'} ignored. Valid reports remain available.
            </div>
          )}
          {historyError && <div className="build-warning error">{historyError}</div>}
          {historyComparison && (
            <div className="build-history-comparison">
              <h4>
                {historyComparison.previous.contentHash.slice(0, 12)} → {historyComparison.current.contentHash.slice(0, 12)}
              </h4>
              <BuildComparisonReport
                comparison={historyComparison.comparison}
                identicalLabel="The selected build artifacts are byte-identical."
              />
            </div>
          )}
          {historyPatch && (
            <div className="build-history-patch" title={historyPatch.manifestPath}>
              <h4>
                Signed patch {historyPatch.fromContentHash.slice(0, 12)} → {historyPatch.toContentHash.slice(0, 12)}
              </h4>
              <span>
                {historyPatch.changedFiles} payload files · {historyPatch.removedFiles} removed ·{' '}
                {historyPatch.unchangedFiles} reused
              </span>
              <span>
                {byteSize(historyPatch.payloadBytes)} download · {byteSize(historyPatch.reusedBytes)} reused ·{' '}
                key {historyPatch.signingKeyId.slice(0, 12)}
              </span>
              <code>{historyPatch.outputDir}</code>
            </div>
          )}
        </section>
      )}
      {desktop && (
        <section className="build-section build-patch-inventory">
          <div className="build-section-title">
            <h3>Patch Inventory</h3>
            <div className="build-history-toolbar">
              <span>{buildPatches.length} patches</span>
              <button
                type="button"
                disabled={patchInventoryLoading || historyPatching || Boolean(patchVerifyingId)}
                onClick={() => void refreshBuildPatches()}
              >
                {patchInventoryLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>
          {buildPatches.length === 0 && !patchInventoryLoading && !patchInventoryError && (
            <div className="build-empty">Signed automatic and historical patches will remain visible here after reopening the editor.</div>
          )}
          <div className="build-patch-list">
            {buildPatches.map((patch) => {
              const verified = patchVerification?.patchId === patch.id;
              const verifyingPatch = patchVerifyingId === patch.id;
              return (
                <div className="build-patch-row" key={patch.id} title={patch.manifestPath}>
                  <span className="build-patch-main">
                    <strong>{patch.fromContentHash.slice(0, 12)} → {patch.toContentHash.slice(0, 12)}</strong>
                    <small>{buildTimestamp(patch.createdAtMs)} · {patch.source} · key {patch.signingKeyId.slice(0, 12)}</small>
                  </span>
                  <span className="build-patch-size">
                    <strong>{byteSize(patch.payloadBytes)}</strong>
                    <small>{patch.changedFiles} payload · {patch.removedFiles} removed · {byteSize(patch.reusedBytes)} reused</small>
                  </span>
                  <em className={patch.baseAvailable ? 'available' : 'missing'}>
                    {patch.baseAvailable ? 'BASE STORED' : 'BASE PRUNED'}
                  </em>
                  {verified && <em className="verified">VERIFIED</em>}
                  <button
                    type="button"
                    disabled={!patch.baseAvailable || Boolean(patchVerifyingId) || historyPatching}
                    title={patch.baseAvailable
                      ? 'Choose an independent trusted Ed25519 public key and verify the complete patch chain.'
                      : 'The exact archived base is no longer available for verification.'}
                    onClick={() => void verifyBuildPatch(patch)}
                  >
                    {verifyingPatch ? 'Verifying...' : 'Verify...'}
                  </button>
                </div>
              );
            })}
          </div>
          {invalidBuildPatches > 0 && (
            <div className="build-warning">
              {invalidBuildPatches} invalid patch entr{invalidBuildPatches === 1 ? 'y' : 'ies'} ignored.
            </div>
          )}
          {patchInventoryError && <div className="build-warning error">{patchInventoryError}</div>}
          {patchVerification && (
            <div className="build-patch-verification">
              <strong>Trusted Ed25519 verification passed</strong>
              <span>Base history {patchVerification.baseHistoryId}</span>
              <span>{patchVerification.fromContentHash.slice(0, 12)} → {patchVerification.toContentHash.slice(0, 12)}</span>
              {patchVerification.log && <pre>{patchVerification.log}</pre>}
            </div>
          )}
        </section>
      )}
      {lastBuild && (
        <section className="build-result">
          <strong>{lastBuild.executable}</strong>
          <span>
            {lastBuild.platform}-{lastBuild.architecture} · {lastBuild.profile} · MEngine {lastBuild.engineVersion}
          </span>
          <span>
            {lastBuild.sceneCount} scenes · {lastBuild.validatedAssetFiles} validated assets · {lastBuild.assetReferences} references · {lastBuild.assetMode}
          </span>
          <span>
            Authoring audit · {lastBuild.auditedScenes} scenes · {lastBuild.auditedPrefabs} prefabs · {lastBuild.auditedMaterials} materials · {lastBuild.auditedMaterialInstances} instances · {lastBuild.auditedSurfaceShaders} shaders · {lastBuild.shaderVariants}/{lastBuild.shaderVariantLimit} variants
          </span>
          <span>{lastBuild.strippedEditorEntities} EditorOnly entities stripped</span>
          <span>
            {lastBuild.omittedAssetFiles} unused asset files · {byteSize(lastBuild.omittedAssetBytes)} omitted
          </span>
          <span>
            {lastBuild.fileCount} files · {byteSize(lastBuild.packagedBytes)} · {lastBuild.toolchain}
          </span>
          {lastBuild.buildCache && (
            <span>
              Build cache · {lastBuild.buildCache.enabled
                ? `${lastBuild.buildCache.hits}/${lastBuild.buildCache.hits + lastBuild.buildCache.misses} hits · ${byteSize(lastBuild.buildCache.reusedBytes)} reused`
                : 'disabled'}
              {lastBuild.buildCache.recoveredEntries > 0
                ? ` · ${lastBuild.buildCache.recoveredEntries} corrupt entries rebuilt`
                : ''}
              {lastBuild.buildCache.failures > 0
                ? ` · ${lastBuild.buildCache.failures} cache I/O fallbacks`
                : ''}
            </span>
          )}
          {lastBuild.incrementalPatch && (
            <span
              className={lastBuild.incrementalPatch.reason === 'failed' ? 'build-warning' : undefined}
              title={lastBuild.incrementalPatch.manifestPath ?? lastBuild.incrementalPatch.error ?? undefined}
            >
              Incremental patch · {lastBuild.incrementalPatch.generated
                ? `${lastBuild.incrementalPatch.changedFiles ?? 0} changed · ${lastBuild.incrementalPatch.removedFiles ?? 0} removed · ${byteSize(lastBuild.incrementalPatch.payloadBytes ?? 0)} payload · ${byteSize(lastBuild.incrementalPatch.reusedBytes ?? 0)} reused`
                : lastBuild.incrementalPatch.reason === 'identical'
                  ? 'not emitted (artifact is identical)'
                  : lastBuild.incrementalPatch.reason === 'unavailable'
                    ? 'not emitted (no compatible signed previous build)'
                    : `failed (${lastBuild.incrementalPatch.error ?? 'unknown error'})`}
            </span>
          )}
          <span>SHA-256 {lastBuild.contentHash}</span>
          <span className={lastBuild.artifactSigned ? undefined : 'build-warning'}>
            Artifact signature · {lastBuild.artifactSigned
              ? `Ed25519 · key ${lastBuild.artifactSigningKeyId}`
              : 'unsigned (set MENGINE_SIGNING_KEY for release publishing)'}
          </span>
          <div className="build-content-report">
            <h4>Content by Category</h4>
            <div className="build-content-table">
              {lastBuild.contentCategories.map((group) => (
                <div className="build-content-row" key={group.category}>
                  <strong>{group.category}</strong>
                  <span>{group.files} files</span>
                  <span>{byteSize(group.bytes)}</span>
                </div>
              ))}
            </div>
            <h4>Largest Packaged Files</h4>
            <div className="build-content-table largest">
              {lastBuild.largestFiles.map((file) => (
                <div
                  className="build-content-row"
                  key={file.path}
                  title={file.includedBy.join('\n')}
                >
                  <strong>{file.path}</strong>
                  <span>{file.category}</span>
                  <span>{byteSize(file.size)}</span>
                </div>
              ))}
            </div>
            <h4>Surface Shader Variants · {lastBuild.shaderVariants}/{lastBuild.shaderVariantLimit}</h4>
            {lastBuild.surfaceShaderVariants.length > 0
              ? <div className="build-content-table">
                  {lastBuild.surfaceShaderVariants
                    .slice(0, MAX_RENDERED_SHADER_VARIANTS)
                    .map((variant) => (
                    <div
                      className="build-content-row"
                      key={`${variant.shader}\0${variant.enabledKeywords.join('\0')}\0${variant.blend}\0${variant.doubleSided}\0${variant.depthWrite}`}
                    >
                      <strong>{variant.shader}</strong>
                      <span>{variant.blend} · {variant.doubleSided ? 'two-sided' : 'back-face cull'} · depth {variant.depthWrite ? 'write' : 'read'}</span>
                      <span>{variant.enabledKeywords.join(', ') || 'Default keywords'}</span>
                    </div>
                    ))}
                </div>
              : <div className="build-empty">No custom Surface Shader variants were collected.</div>}
            {lastBuild.surfaceShaderVariants.length > MAX_RENDERED_SHADER_VARIANTS && (
              <small>
                Showing the first {MAX_RENDERED_SHADER_VARIANTS} variants. The signed build Manifest contains all {lastBuild.surfaceShaderVariants.length} entries.
              </small>
            )}
            {lastBuild.comparison && <>
              <h4>Changes vs Previous Build</h4>
              <BuildComparisonReport
                comparison={lastBuild.comparison}
                identicalLabel={`Byte-identical to ${lastBuild.comparison.previousContentHash.slice(0, 12)}.`}
              />
            </>}
            <h4>Build Stage Timings · {durationText(lastBuild.totalDurationMs)} total</h4>
            <div className="build-content-table timings">
              {lastBuild.stageTimings.map((stage) => (
                <div className="build-content-row" key={stage.stage}>
                  <strong>{stage.label}</strong>
                  <span>{stage.stage}</span>
                  <span>{durationText(stage.durationMs)}</span>
                </div>
              ))}
            </div>
            <small title={lastBuild.manifestPath}>Report: {lastBuild.manifestPath}</small>
          </div>
          {lastBuild.log && <pre>{lastBuild.log}</pre>}
          {lastVerification && (
            <div className="build-verification">
              <strong>Published artifact verified</strong>
              <span>{lastVerification.fileCount} files · {byteSize(lastVerification.packagedBytes)}</span>
              <span>SHA-256 {lastVerification.contentHash}</span>
              {lastVerification.log && <pre>{lastVerification.log}</pre>}
            </div>
          )}
        </section>
      )}

      <div className="build-actions">
        {building && (
          <button
            type="button"
            className="danger"
            disabled={cancelRequested}
            onClick={() => void cancelBuild()}
          >
            {cancelRequested ? 'Cancelling Safely...' : 'Cancel Build'}
          </button>
        )}
        {lastBuild && (
          <button
            type="button"
            disabled={building || launching || verifying || settingsSaving}
            onClick={() => void verify(lastBuild)}
          >
            {verifying ? 'Verifying Published Build...' : lastVerification ? 'Verify Again' : 'Verify Published Build'}
          </button>
        )}
        {lastBuild && (
          <button
            type="button"
            disabled={building || launching || verifying || settingsSaving}
            onClick={() => void launch(lastBuild)}
          >
            {launching ? 'Starting Player...' : 'Run Player'}
          </button>
        )}
        <button
          type="button"
          disabled={
            !desktop
            || props.sceneDirty
            || props.resourceDirty
            || assetSettingsDirty
            || settingsSaving
            || savingAll
            || building
            || historyPatching
            || Boolean(patchVerifyingId)
            || launching
            || verifying
            || !settings?.scenes.length
            || missing.length > 0
          }
          onClick={() => void build(false)}
        >
          {building ? 'Building Player...' : 'Build Player'}
        </button>
        <button
          type="button"
          className="primary"
          disabled={
            !desktop
            || props.sceneDirty
            || props.resourceDirty
            || assetSettingsDirty
            || settingsSaving
            || savingAll
            || building
            || historyPatching
            || Boolean(patchVerifyingId)
            || launching
            || verifying
            || !settings?.scenes.length
            || missing.length > 0
          }
          onClick={() => void build(true)}
        >
          {building ? 'Building Player...' : launching ? 'Starting Player...' : 'Build & Run'}
        </button>
      </div>
    </div>
  );
}
