// Author: MiYu. Apply validated input phases in order and await every native frame.
import type { CommandContext, CommandResult } from './commands.ts';
import { BridgeError } from './protocol.ts';

export async function runPlaybackSequence(ctx: CommandContext, args: Record<string, unknown>): Promise<CommandResult> {
  const phases = args.phases as { input?: Parameters<CommandContext['store']['setPlayInput']>[0]; steps?: number; deltaTime?: number }[];
  const steps = phases.reduce((total, phase) => total + (phase.steps ?? 1), 0);
  if (steps > 600) throw new BridgeError('INVALID_ARGS', 'A playback sequence may advance at most 600 steps');
  const generation = ctx.store.playGeneration;
  const requireSameSession = () => { if (ctx.store.playGeneration !== generation) throw new BridgeError('READONLY', 'Playback sequence interrupted by a changed Play session'); };
  await ctx.store.waitForPlayRuntime();
  requireSameSession();
  if (ctx.store.mode !== 'pause') throw new BridgeError('READONLY', 'Playback sequences require paused Play Mode');
  let completedSteps = 0;
  for (let index = 0; index < phases.length; index++) {
    const phase = phases[index];
    requireSameSession();
    if (ctx.store.mode !== 'pause') throw new BridgeError('READONLY', `Playback sequence interrupted before phase ${index}; completed ${completedSteps} of ${steps} steps`);
    if (phase.input) ctx.store.setPlayInput(phase.input);
    for (let step = 0; step < (phase.steps ?? 1); step++) {
      if (ctx.store.mode !== 'pause' || !ctx.store.step(phase.deltaTime ?? 1 / 60)) throw new BridgeError('READONLY', `Playback sequence interrupted in phase ${index}; completed ${completedSteps} of ${steps} steps`);
      await ctx.store.waitForPlayRuntime();
      requireSameSession();
      completedSteps++;
    }
  }
  if (ctx.store.mode !== 'pause') throw new BridgeError('READONLY', `Playback sequence ended outside paused Play Mode after ${completedSteps} steps`);
  return { ok: true, data: { mode: ctx.store.mode, frame: ctx.store.frame, steps, phases: phases.length } };
}
