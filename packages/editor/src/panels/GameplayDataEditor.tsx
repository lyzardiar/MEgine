// Author: MiYu

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  BarChart3,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
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
      props.onLog(`已保存 ${props.assetPath}`);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      props.onLog(`玩法数据保存失败：${message}`, 'error');
      throw reason;
    } finally {
      setSaving(false);
    }
  }, [asset, props]);

  useEffect(() => registerSaveAllParticipant(
    '技能与关卡数据',
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
    return <div className="gameplay-data-empty">
      <Sparkles size={34} />
      <strong>技能与关卡编辑器</strong>
      <span>点击顶部“技能编辑器”或“关卡编辑器”，也可以在项目窗口双击数据资产。</span>
    </div>;
  }

  const switchAsset = (next: EditorMode) => {
    if (next === mode) return;
    const path = next === 'skills' ? 'Assets/Data/Skills.mskill' : 'Assets/Data/Levels.mlevel';
    window.dispatchEvent(new CustomEvent('mengine:open-gameplay-data', { detail: path }));
  };

  return <div className="gameplay-data-editor">
    <nav className="gameplay-data-rail" aria-label="技能与关卡编辑器">
      <button type="button" className={mode === 'skills' ? 'active' : ''} onClick={() => switchAsset('skills')} title="技能编辑器">
        <Sparkles size={20} /><span>技能</span>
      </button>
      <button type="button" className={mode === 'levels' ? 'active' : ''} onClick={() => switchAsset('levels')} title="关卡编辑器">
        <Map size={20} /><span>关卡</span>
      </button>
    </nav>
    <section className="gameplay-data-workspace">
      <header className="gameplay-data-header">
        <div><strong>{mode === 'skills' ? '技能编辑器' : '关卡编辑器'}</strong><span>{props.assetPath}{dirty ? ' · 未保存' : ''}</span></div>
        <button type="button" disabled={loading || saving} onClick={() => setReload((value) => value + 1)} title="从磁盘重新加载"><RotateCcw size={15} />重新加载</button>
        <button type="button" className="primary" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? <RotateCcw className="spin" size={15} /> : dirty ? <Save size={15} /> : <Check size={15} />}
          {saving ? '保存中…' : dirty ? '保存' : '已保存'}
        </button>
      </header>
      {error && <div className="gameplay-data-error" role="alert">{error}</div>}
      {loading && <div className="gameplay-data-loading">正在加载玩法数据…</div>}
      {!loading && asset?.kind === 'skill-library' && <SkillLibraryEditor skills={asset.skills} selected={selected} onSelect={setSelected} onChange={(skills) => setAsset({ ...asset, skills })} />}
      {!loading && asset?.kind === 'level-library' && <LevelLibraryEditor levels={asset.levels} selected={selected} onSelect={setSelected} onChange={(levels) => setAsset({ ...asset, levels })} />}
      {!loading && asset?.kind === 'game-balance' && <div className="gameplay-data-empty"><BookOpen size={30} /><span>.mgame 平衡数据暂时通过 JSON 资产视图编辑。</span></div>}
    </section>
  </div>;
}

function LibraryList(props: {
  title: string;
  values: readonly { id: string; name: string; description: string }[];
  selected: number;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onDelete: () => void;
}) {
  return <aside className="gameplay-data-list">
    <div className="gameplay-data-list-title"><span>{props.title}</span><span>{props.values.length}</span></div>
    <div className="gameplay-data-list-items">{props.values.map((value, index) => <button key={`${value.id}:${index}`} type="button" className={props.selected === index ? 'active' : ''} onClick={() => props.onSelect(index)}>
      <strong>{value.name || '未命名'}</strong><span>{value.id || 'missing_id'}</span><small>{value.description}</small>
    </button>)}</div>
    <div className="gameplay-data-list-actions">
      <button type="button" onClick={props.onAdd}><Plus size={14} />新增</button>
      <button type="button" disabled={props.values.length === 0} onClick={props.onDelete}><Trash2 size={14} />删除</button>
    </div>
  </aside>;
}

function Field(props: { label: string; value: string | number; type?: 'text' | 'number' | 'color'; min?: number; step?: number; onChange: (value: string) => void }) {
  return <label className="gameplay-data-field"><span>{props.label}</span><input type={props.type ?? 'text'} value={props.value} min={props.min} step={props.step} onChange={(event) => props.onChange(event.target.value)} /></label>;
}

function Section(props: { title: string; children: ReactNode }) {
  return <section className="gameplay-data-section"><h3>{props.title}</h3><div className="gameplay-data-fields">{props.children}</div></section>;
}

function SkillLibraryEditor(props: { skills: SkillDefinition[]; selected: number; onSelect: (index: number) => void; onChange: (skills: SkillDefinition[]) => void }) {
  const skill = props.skills[props.selected];
  const update = (patch: Partial<SkillDefinition>) => props.onChange(props.skills.map((entry, index) => index === props.selected ? { ...entry, ...patch } : entry));
  return <div className="gameplay-data-content">
    <LibraryList title="技能列表" values={props.skills} selected={props.selected} onSelect={props.onSelect} onAdd={() => { props.onChange([...props.skills, createSkillDefinition(props.skills.length)]); props.onSelect(props.skills.length); }} onDelete={() => { props.onChange(props.skills.filter((_, index) => index !== props.selected)); props.onSelect(Math.max(0, props.selected - 1)); }} />
    {skill ? <main className="gameplay-data-inspector">
      <div className="gameplay-summary"><Sparkles size={22} /><div><strong>{skill.name}</strong><span>{skill.description}</span></div><b style={{ color: skill.color }}>Lv.{skill.maxLevel}</b></div>
      <Section title="基础信息">
        <Field label="技能 ID" value={skill.id} onChange={(id) => update({ id })} />
        <Field label="显示名称" value={skill.name} onChange={(name) => update({ name })} />
        <Field label="图标资产" value={skill.icon} onChange={(icon) => update({ icon })} />
        <Field label="主题色" type="color" value={skill.color} onChange={(color) => update({ color })} />
        <label className="gameplay-data-field wide"><span>技能说明</span><textarea value={skill.description} onChange={(event) => update({ description: event.target.value })} /></label>
      </Section>
      <Section title="战斗参数">
        <label className="gameplay-data-field"><span>攻击模式</span><select value={skill.pattern} onChange={(event) => update({ pattern: event.target.value as SkillDefinition['pattern'] })}>
          <option value="nearest">锁定最近目标</option><option value="radial">环形爆发</option><option value="orbit">环绕武器</option><option value="aura">范围光环</option><option value="chain">连锁闪电</option><option value="meteor">陨星轰击</option><option value="boomerang">回旋月刃</option><option value="pulse">冰霜脉冲</option>
        </select></label>
        <Field label="基础伤害" type="number" min={0} step={1} value={skill.damage} onChange={(value) => update({ damage: Number(value) })} />
        <Field label="冷却（秒）" type="number" min={0.05} step={0.05} value={skill.cooldown} onChange={(value) => update({ cooldown: Number(value) })} />
        <Field label="飞行速度" type="number" min={0} step={0.1} value={skill.projectileSpeed} onChange={(value) => update({ projectileSpeed: Number(value) })} />
        <Field label="攻击范围" type="number" min={0.1} step={0.1} value={skill.range} onChange={(value) => update({ range: Number(value) })} />
        <Field label="投射物 / 目标数" type="number" min={1} step={1} value={skill.count} onChange={(value) => update({ count: Number(value) })} />
        <Field label="最高等级" type="number" min={1} step={1} value={skill.maxLevel} onChange={(value) => update({ maxLevel: Number(value) })} />
        <label className="gameplay-data-field wide"><span>各级伤害倍率</span><input value={skill.upgrades.join(', ')} onChange={(event) => update({ upgrades: event.target.value.split(',').map(Number).filter(Number.isFinite) })} /></label>
      </Section>
      <Section title="Effekseer 视觉效果">
        <Field label="施法特效 (.efkefc)" value={skill.castEffect} onChange={(castEffect) => update({ castEffect })} />
        <Field label="命中特效 (.efkefc)" value={skill.impactEffect} onChange={(impactEffect) => update({ impactEffect })} />
        <Field label="特效缩放" type="number" min={0.05} step={0.05} value={skill.effectScale} onChange={(value) => update({ effectScale: Number(value) })} />
        <div className="gameplay-data-field wide"><span>运行时说明</span><small>施法路径、命中路径与缩放会直接写入 .mskill，游戏无需改代码即可替换 Effekseer 效果。</small></div>
      </Section>
    </main> : <div className="gameplay-data-empty"><Sparkles /><span>点击“新增”创建第一个技能。</span></div>}
  </div>;
}

function LevelLibraryEditor(props: { levels: LevelDefinition[]; selected: number; onSelect: (index: number) => void; onChange: (levels: LevelDefinition[]) => void }) {
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
    <LibraryList title="关卡列表" values={props.levels} selected={props.selected} onSelect={props.onSelect} onAdd={() => { props.onChange([...props.levels, createLevelDefinition(props.levels.length)]); props.onSelect(props.levels.length); }} onDelete={() => { props.onChange(props.levels.filter((_, index) => index !== props.selected)); props.onSelect(Math.max(0, props.selected - 1)); }} />
    {level ? <main className="gameplay-data-inspector">
      <div className="gameplay-summary"><Map size={22} /><div><strong>{level.name}</strong><span>{level.description}</span></div><b style={{ color: level.accent }}>{Math.round(level.duration / 60)} 分钟</b></div>
      <Section title="关卡设置">
        <Field label="关卡 ID" value={level.id} onChange={(id) => update({ id })} />
        <Field label="显示名称" value={level.name} onChange={(name) => update({ name })} />
        <Field label="时长（秒）" type="number" min={10} step={10} value={level.duration} onChange={(value) => update({ duration: Number(value) })} />
        <Field label="推荐战力" type="number" min={0} step={1} value={level.recommendedPower} onChange={(value) => update({ recommendedPower: Number(value) })} />
        <Field label="背景资产" value={level.background} onChange={(background) => update({ background })} />
        <Field label="主题色" type="color" value={level.accent} onChange={(accent) => update({ accent })} />
        <label className="gameplay-data-field wide"><span>关卡说明</span><textarea value={level.description} onChange={(event) => update({ description: event.target.value })} /></label>
      </Section>
      <section className="gameplay-data-section"><h3><span><Clock3 size={13} /> 怪物波次时间轴</span><button type="button" onClick={() => update({ waves: [...level.waves, createLevelWave()] })}><Plus size={13} />新增波次</button></h3>
        <div className="gameplay-timeline" aria-label="关卡波次预览">{level.waves.map((wave, index) => <span key={index} title={`${wave.enemy}：${wave.start}s - ${wave.start + wave.duration}s`} style={{ left: `${wave.start / level.duration * 100}%`, width: `${wave.duration / level.duration * 100}%`, background: index % 2 ? '#8559d8' : '#2897b8' }}>{index + 1}</span>)}<i style={{ left: `${level.boss.spawnAt / level.duration * 100}%` }} title="Boss 出现时间" /></div>
        <div className="gameplay-wave-list">{level.waves.map((wave, index) => <div className="gameplay-wave" key={index}>
          <div className="gameplay-wave-index"><strong>{index + 1}</strong><button type="button" disabled={index === 0} onClick={() => moveWave(index, -1)}><ChevronUp size={13} /></button><button type="button" disabled={index === level.waves.length - 1} onClick={() => moveWave(index, 1)}><ChevronDown size={13} /></button><button type="button" disabled={level.waves.length === 1} onClick={() => update({ waves: level.waves.filter((_, waveIndex) => waveIndex !== index) })}><Trash2 size={13} /></button></div>
          <Field label="怪物类型" value={wave.enemy} onChange={(enemy) => updateWave(index, { enemy })} /><Field label="开始" type="number" min={0} step={1} value={wave.start} onChange={(value) => updateWave(index, { start: Number(value) })} /><Field label="持续" type="number" min={1} step={1} value={wave.duration} onChange={(value) => updateWave(index, { duration: Number(value) })} /><Field label="数量" type="number" min={1} step={1} value={wave.count} onChange={(value) => updateWave(index, { count: Number(value) })} /><Field label="生命" type="number" min={1} step={1} value={wave.hp} onChange={(value) => updateWave(index, { hp: Number(value) })} /><Field label="速度" type="number" min={0.1} step={0.1} value={wave.speed} onChange={(value) => updateWave(index, { speed: Number(value) })} /><Field label="伤害" type="number" min={0} step={1} value={wave.damage} onChange={(value) => updateWave(index, { damage: Number(value) })} />
        </div>)}</div>
      </section>
      <Section title="Boss 战">
        <Field label="Boss 类型" value={level.boss.enemy} onChange={(enemy) => update({ boss: { ...level.boss, enemy } })} /><Field label="出现时间" type="number" min={0} step={1} value={level.boss.spawnAt} onChange={(value) => update({ boss: { ...level.boss, spawnAt: Number(value) } })} /><Field label="生命" type="number" min={1} step={10} value={level.boss.hp} onChange={(value) => update({ boss: { ...level.boss, hp: Number(value) } })} /><Field label="速度" type="number" min={0.1} step={0.1} value={level.boss.speed} onChange={(value) => update({ boss: { ...level.boss, speed: Number(value) } })} /><Field label="伤害" type="number" min={0} step={1} value={level.boss.damage} onChange={(value) => update({ boss: { ...level.boss, damage: Number(value) } })} />
      </Section>
      <div className="gameplay-validation"><BarChart3 size={15} />共 {level.waves.length} 组波次，预计生成 {level.waves.reduce((sum, wave) => sum + wave.count, 0)} 只普通怪物，Boss 将在 {level.boss.spawnAt} 秒出现。</div>
    </main> : <div className="gameplay-data-empty"><Map /><span>点击“新增”创建第一个关卡。</span></div>}
  </div>;
}
