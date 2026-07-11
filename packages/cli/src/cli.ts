#!/usr/bin/env node
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const [cmd, ...rest] = process.argv.slice(2);

function help() {
  console.log(`mengine <command>

Commands:
  new <name>          Create a new game project scaffold
  export-pc <dir>     Emit PC player packaging notes / stub bundle manifest
  codegen             Print codegen hint (run pnpm codegen from repo root)
`);
}

function newProject(name: string) {
  const root = join(process.cwd(), name);
  if (existsSync(root)) {
    console.error(`exists: ${root}`);
    process.exit(1);
  }
  mkdirSync(join(root, 'assets'), { recursive: true });
  mkdirSync(join(root, 'scripts'), { recursive: true });
  writeFileSync(
    join(root, 'project.json'),
    JSON.stringify(
      {
        name,
        version: 1,
        mainScene: 'assets/main.mscene',
        scripts: ['scripts/main.js'],
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(root, 'scripts/main.js'),
    `var t = 0;\nfunction onTick(dt, frame) {\n  t += dt;\n}\n`,
  );
  writeFileSync(
    join(root, 'assets/main.mscene'),
    JSON.stringify(
      {
        version: 1,
        name: 'Main',
        world: {
          entities: [],
          frame: 0,
          sim_frame: 0,
          clear_color: [0.1, 0.1, 0.14, 1],
        },
      },
      null,
      2,
    ),
  );
  console.log(`created ${root}`);
}

function exportPc(dir: string) {
  const out = join(dir, 'export-pc');
  mkdirSync(out, { recursive: true });
  writeFileSync(
    join(out, 'manifest.json'),
    JSON.stringify(
      {
        platform: 'pc',
        runtime: 'mengine-runtime',
        note: 'Build with: cargo build -p mengine-runtime --release',
        androidStub: 'see platforms/android/README.md',
        iosStub: 'see platforms/ios/README.md',
      },
      null,
      2,
    ),
  );
  console.log(`PC export stub → ${out}`);
}

switch (cmd) {
  case 'new':
    if (!rest[0]) {
      help();
      process.exit(1);
    }
    newProject(rest[0]);
    break;
  case 'export-pc':
    exportPc(rest[0] ?? '.');
    break;
  case 'codegen':
    console.log('Run from repo root: pnpm codegen');
    break;
  default:
    help();
}
