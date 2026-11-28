import { WebEngineHost } from './webEngineHost';

async function boot(): Promise<void> {
  const canvas = document.getElementById('mengine-canvas') as HTMLCanvasElement | null;
  const hud = document.getElementById('mengine-hud');
  if (!canvas) return;

  const host = new WebEngineHost(canvas);
  const identity = await host.init();
  if (hud) {
    hud.textContent = `MEngine Web · JS=${identity.backend} (zero-VM) · GPU=${identity.graphics}`;
  }

  host.setTickHandler((_dt, frame) => {
    const commands = host.drainCommands();
    if (commands.length > 0 && hud) {
      hud.textContent = `MEngine Web · frame ${frame} · ${commands.length} cmds`;
    }
  });
  host.start();
}

void boot();
