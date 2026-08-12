// Author: MiYu

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Map,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  createLevelDefinition,
  createLevelWave,
  createSkillDefinition,
  parseGameplayDataAsset,
  serializeGameplayDataAsset,
  type GameplayDataAsset,
  type LevelDefinition,
  type SkillDefinition,
} from '../gameplayDataAsset';
import {
  readProjectAssetText,
  refreshProjectFiles,
  writeProjectAssetText,
} from '../projectAssets';
import { broadcastProjectAssetsChanged } from '../assetEditorEvents';
import { registerSaveAllParticipant } from '../saveAll';
import './gameplay-data.css';

type EditorMode = 'skills' | 'levels';

export function GameplayDataEditor(props: {
  assetPath: string | null;
  onDirtyChange: (dirty: boolean) => void;
  onLog: (message: string, level?: 'info' | 'warn' | 'error') => void;
}) {
  const [asset, setAsset] = useState<GameplayDataAsset | null>(null);
  const [saved, setSaved] = useState('');
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const mode: EditorMode = asset?.kind === 'level-library'
    || props.assetPath?.toLocaleLowerCase().endsWith('.mlevel')
    ? 'levels'
    : 'skills';
  const serialized = useMemo(() => asset ? serializeGameplayDataAsset(asset) : '', [asset]);
  const dirty = Boolean(asset && serialized !== saved);

  useEffect(() => {
    props.onDirtyChange(dirty);
    return () => props.onDirtyChange(false);
  }, [dirty, props.onDirtyChange]);

  useEffect(() => {
    let cancelled = false;
    setAsset(null);
    setSaved('');
    setSelected(0);
    setError(null);
    if (!props.assetPath) return () => { cancelled = true; };
    setLoading(true);
    void readProjectAssetText(props.assetPath, { replaceWriteBaseline: true })
      .then((source) => {
        if (cancelled) return;
        const parsed = parseGameplayDataAsset(source, props.assetPath!);
        setAsset(parsed);
        setSaved(serializeGameplayDataAsset(parsed));
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [props.assetPath, reload]);

  const save = useCallback(async () => {
    if (!asset || !props.assetPath) return;
    const source = serializeGameplayDataAsset(asset);
    setSaving(true);
    setError(null);
    try {
      const validated = parseGameplayDataAsset(source, props.assetPath);
      const persisted = serializeGameplayDataAsset(validated);
      await writeProjectAssetText(props.assetPath, persisted);
      await refreshProjectFiles();
      setAsset(validated);
      setSaved(persisted);
      broadcastProjectAssetsChanged({ action: 'modified', sourcePath: props.assetPath });
      props.onLog(`Saved ${props.assetPath}`);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      props.onLog(`Gameplay data save failed: ${message}`, 'error');
      throw reason;
    } finally {
      setSaving(false);
    }
  }, [asset, props]);

  useEffect(() => registerSaveAllParticipant(
    'Gameplay Data',
    () => dirty ? async () => save() : null,
  ), [dirty, save]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLocaleLowerCase() !== 's') return;
      event.preventDefault();
      void save();
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [save]);

  if (!props.assetPath) {
    return (
      <div className="gameplay-data-empty">
        <Sparkles size={34} />
        <strong>Gameplay Data</strong>
        <span>Double-click a .mskill or .mlevel asset in Project.</span>
      </div>
    );
  }

  const switchAsset = (next: EditorMode) => {
    if (next === mode) return;
    const path = next === 'skills' ? 'Assets/Data/Skills.mskill' : 'Assets/Data/Levels.mlevel';
    window.dispatchEvent(new CustomEvent('mengine:open-gameplay-data', { detail: path }));
  };

  return (
    <div className="gameplay-data-editor">
      <nav className="gameplay-data-rail" aria-label="Gameplay data editor">
        <button type="button" className={mode === 'skills' ? 'active' : ''} onClick={() => switchAsset('skills')} title="Skill Editor">
          <Sparkles size={20} /><span>Skills</span>
        </button>
        <button type="button" className={mode === 'levels' ? 'active' : ''} onClick={() => switchAsset('levels')} title="Level Editor">
          <Map size={20} /><span>Levels</span>
        </button>
      </nav>
      <section className="gameplay-data-workspace">
        <header className="gameplay-data-header">
          <div>
            <strong>{mode === 'skills' ? 'Skill Editor' : 'Level Editor'}</strong>
            <span>{props.assetPath}{dirty ? '  •  Unsaved' : ''}</span>
          </div>
          <button type="button" disabled={loading || saving} onClick={() => setReload((value) => value + 1)} title="Reload from disk">
            <RotateCcw size={15} /> Reload
          </button>
          <button type="button" className="primary" disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? <RotateCcw className="spin" size={15} /> : dirty ? <Save size={15} /> : <Check size={15} />}
            {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
          </button>
        </header>
        {error && <div className="gameplay-data-error" role="alert">{error}</div>}
        {loading && <div className="gameplay-data-loading">Loading gameplay data…</div>}
        {!loading && asset?.kind === 'skill-library' && (
          <SkillLibraryEditor
            skills={asset.skills}
            selected={selected}
            onSelect={setSelected}
            onChange={(skills) => setAsset({ ...asset, skills })}
          />
        )}
        {!loading && asset?.kind === 'level-library' && (
          <LevelLibraryEditor
            levels={asset.levels}
            selected={selected}
            onSelect={setSelected}
            onChange={(levels) => setAsset({ ...asset, levels })}
          />
        )}
        {!loading && asset?.kind === 'game-balance' && (
          <div className="gameplay-data-empty"><BookOpen size={30} /><span>.mgame editing is available through the JSON asset view.</span></div>
        )}
      </section>
    </div>
  );
}

function LibraryList(props: {
  title: string;
  values: readonly { id: string; name: string; description: string }[];
  selected: number;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onDelete: () => void;
}) {
  return (
    <aside className="gameplay-data-list">
      <div className="gameplay-data-list-title"><span>{props.title}</span><span>{props.values.length}</span></div>
      <div className="gameplay-data-list-items">
        {props.values.map((value, index) => (
          <button key={`${value.id}:${index}`} type="button" className={props.selected === index ? 'active' : ''} onClick={() => props.onSelect(index)}>
            <strong>{value.name || 'Unnamed'}</strong><span>{value.id || 'missing_id'}</span><small>{value.description}</small>
          </button>
        ))}
      </div>
      <div className="gameplay-data-list-actions">
        <button type="button" onClick={props.onAdd}><Plus size={14} /> Add</button>
        <button type="button" disabled={props.values.length === 0} onClick={props.onDelete}><Trash2 size={14} /> Delete</button>
      </div>
    </aside>
  );
}

function Field(props: {
  label: string;
  value: string | number;
  type?: 'text' | 'number' | 'color';
  min?: number;
  step?: number;
  onChange: (value: string) => void;
}) {
  return <label className="gameplay-data-field"><span>{props.label}</span><input type={props.type ?? 'text'} value={props.value} min={props.min} step={props.step} onChange={(event) => props.onChange(event.target.value)} /></label>;
}

function Section(props: { title: string; children: ReactNode }) {
  return <section className="gameplay-data-section"><h3>{props.title}</h3><div className="gameplay-data-fields">{props.children}</div></section>;
}

function SkillLibraryEditor(props: {
  skills: SkillDefinition[];
  selected: number;
  onSelect: (index: number) => void;
  onChange: (skills: SkillDefinition[]) => void;
}) {
  const skill = props.skills[props.selected];
  const update = (patch: Partial<SkillDefinition>) => props.onChange(props.skills.map((entry, index) => index === props.selected ? { ...entry, ...patch } : entry));
  return <div className="gameplay-data-content">
    <LibraryList title="Skills" values={props.skills} selected={props.selected} onSelect={props.onSelect} onAdd={() => { props.onChange([...props.skills, createSkillDefinition(props.skills.length)]); props.onSelect(props.skills.length); }} onDelete={() => { props.onChange(props.skills.filter((_, index) => index !== props.selected)); props.onSelect(Math.max(0, props.selected - 1)); }} />
    {skill ? <main className="gameplay-data-inspector">
      <Section title="Identity">
        <Field label="ID" value={skill.id} onChange={(id) => update({ id })} />
        <Field label="Display Name" value={skill.name} onChange={(name) => update({ name })} />
        <Field label="Icon Asset" value={skill.icon} onChange={(icon) => update({ icon })} />
        <Field label="Accent" type="color" value={skill.color} onChange={(color) => update({ color })} />
        <label className="gameplay-data-field wide"><span>Description</span><textarea value={skill.description} onChange={(event) => update({ description: event.target.value })} /></label>
      </Section>
      <Section title="Combat Pattern">
        <label className="gameplay-data-field"><span>Pattern</span><select value={skill.pattern} onChange={(event) => update({ pattern: event.target.value as SkillDefinition['pattern'] })}><option value="nearest">Nearest Target</option><option value="radial">Radial Burst</option><option value="orbit">Orbit</option><option value="aura">Aura</option></select></label>
        <Field label="Base Damage" type="number" min={0} step={1} value={skill.damage} onChange={(value) => update({ damage: Number(value) })} />
        <Field label="Cooldown (s)" type="number" min={0.05} step={0.05} value={skill.cooldown} onChange={(value) => update({ cooldown: Number(value) })} />
        <Field label="Projectile Speed" type="number" min={0} step={0.1} value={skill.projectileSpeed} onChange={(value) => update({ projectileSpeed: Number(value) })} />
        <Field label="Range" type="number" min={0.1} step={0.1} value={skill.range} onChange={(value) => update({ range: Number(value) })} />
        <Field label="Projectiles" type="number" min={1} step={1} value={skill.count} onChange={(value) => update({ count: Number(value) })} />
        <Field label="Max Level" type="number" min={1} step={1} value={skill.maxLevel} onChange={(value) => update({ maxLevel: Number(value) })} />
        <label className="gameplay-data-field wide"><span>Level Multipliers</span><input value={skill.upgrades.join(', ')} onChange={(event) => update({ upgrades: event.target.value.split(',').map(Number).filter(Number.isFinite) })} /></label>
      </Section>
    </main> : <div className="gameplay-data-empty"><Sparkles /><span>Add a skill to begin.</span></div>}
  </div>;
}

function LevelLibraryEditor(props: {
  levels: LevelDefinition[];
  selected: number;
  onSelect: (index: number) => void;
  onChange: (levels: LevelDefinition[]) => void;
}) {
  const level = props.levels[props.selected];
  const update = (patch: Partial<LevelDefinition>) => props.onChange(props.levels.map((entry, index) => index === props.selected ? { ...entry, ...patch } : entry));
  const updateWave = (index: number, patch: Partial<LevelDefinition['waves'][number]>) => update({ waves: level.waves.map((wave, waveIndex) => waveIndex === index ? { ...wave, ...patch } : wave) });
  const moveWave = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= level.waves.length) return;
    const waves = [...level.waves];
    [waves[index], waves[target]] = [waves[target], waves[index]];
    update({ waves });
  };
  return <div className="gameplay-data-content">
    <LibraryList title="Levels" values={props.levels} selected={props.selected} onSelect={props.onSelect} onAdd={() => { props.onChange([...props.levels, createLevelDefinition(props.levels.length)]); props.onSelect(props.levels.length); }} onDelete={() => { props.onChange(props.levels.filter((_, index) => index !== props.selected)); props.onSelect(Math.max(0, props.selected - 1)); }} />
    {level ? <main className="gameplay-data-inspector">
      <Section title="Arena">
        <Field label="ID" value={level.id} onChange={(id) => update({ id })} />
        <Field label="Display Name" value={level.name} onChange={(name) => update({ name })} />
        <Field label="Duration (s)" type="number" min={10} step={10} value={level.duration} onChange={(value) => update({ duration: Number(value) })} />
        <Field label="Recommended Power" type="number" min={0} step={1} value={level.recommendedPower} onChange={(value) => update({ recommendedPower: Number(value) })} />
        <Field label="Background Asset" value={level.background} onChange={(background) => update({ background })} />
        <Field label="Accent" type="color" value={level.accent} onChange={(accent) => update({ accent })} />
        <label className="gameplay-data-field wide"><span>Description</span><textarea value={level.description} onChange={(event) => update({ description: event.target.value })} /></label>
      </Section>
      <section className="gameplay-data-section"><h3>Wave Timeline <button type="button" onClick={() => update({ waves: [...level.waves, createLevelWave()] })}><Plus size={13} /> Add Wave</button></h3><div className="gameplay-wave-list">
        {level.waves.map((wave, index) => <div className="gameplay-wave" key={index}>
          <div className="gameplay-wave-index"><strong>{index + 1}</strong><button type="button" disabled={index === 0} onClick={() => moveWave(index, -1)}><ChevronUp size={13} /></button><button type="button" disabled={index === level.waves.length - 1} onClick={() => moveWave(index, 1)}><ChevronDown size={13} /></button><button type="button" disabled={level.waves.length === 1} onClick={() => update({ waves: level.waves.filter((_, waveIndex) => waveIndex !== index) })}><Trash2 size={13} /></button></div>
          <Field label="Enemy" value={wave.enemy} onChange={(enemy) => updateWave(index, { enemy })} />
          <Field label="Start" type="number" min={0} step={1} value={wave.start} onChange={(value) => updateWave(index, { start: Number(value) })} />
          <Field label="Duration" type="number" min={1} step={1} value={wave.duration} onChange={(value) => updateWave(index, { duration: Number(value) })} />
          <Field label="Count" type="number" min={1} step={1} value={wave.count} onChange={(value) => updateWave(index, { count: Number(value) })} />
          <Field label="HP" type="number" min={1} step={1} value={wave.hp} onChange={(value) => updateWave(index, { hp: Number(value) })} />
          <Field label="Speed" type="number" min={0.1} step={0.1} value={wave.speed} onChange={(value) => updateWave(index, { speed: Number(value) })} />
          <Field label="Damage" type="number" min={0} step={1} value={wave.damage} onChange={(value) => updateWave(index, { damage: Number(value) })} />
        </div>)}
      </div></section>
      <Section title="Boss Encounter">
        <Field label="Enemy" value={level.boss.enemy} onChange={(enemy) => update({ boss: { ...level.boss, enemy } })} />
        <Field label="Spawn At" type="number" min={0} step={1} value={level.boss.spawnAt} onChange={(value) => update({ boss: { ...level.boss, spawnAt: Number(value) } })} />
        <Field label="HP" type="number" min={1} step={10} value={level.boss.hp} onChange={(value) => update({ boss: { ...level.boss, hp: Number(value) } })} />
        <Field label="Speed" type="number" min={0.1} step={0.1} value={level.boss.speed} onChange={(value) => update({ boss: { ...level.boss, speed: Number(value) } })} />
        <Field label="Damage" type="number" min={0} step={1} value={level.boss.damage} onChange={(value) => update({ boss: { ...level.boss, damage: Number(value) } })} />
      </Section>
    </main> : <div className="gameplay-data-empty"><Map /><span>Add a level to begin.</span></div>}
  </div>;
}
