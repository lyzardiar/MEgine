/**
 * Compile sample TypeScript scripts → adjacent main.js for mengine-runtime.
 * Uses TypeScript transpileModule (no esbuild binary required).
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function resolveTypescript() {
  const candidates = [
    path.join(root, 'packages/editor/node_modules/typescript'),
    path.join(root, 'node_modules/typescript'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'lib/typescript.js'))) return require(c);
  }
  // pnpm nested
  const pnpm = path.join(root, 'node_modules/.pnpm');
  if (fs.existsSync(pnpm)) {
    for (const name of fs.readdirSync(pnpm)) {
      if (!name.startsWith('typescript@')) continue;
      const p = path.join(pnpm, name, 'node_modules/typescript');
      if (fs.existsSync(path.join(p, 'lib/typescript.js'))) return require(p);
    }
  }
  throw new Error('typescript not found — install editor deps first');
}

const ts = resolveTypescript();
const samplesDir = path.join(root, 'samples');

const entries = [];
for (const name of fs.readdirSync(samplesDir)) {
  const input = path.join(samplesDir, name, 'main.ts');
  if (fs.existsSync(input)) {
    entries.push({
      name,
      input,
      output: path.join(samplesDir, name, 'main.js'),
    });
  }
}

if (entries.length === 0) {
  console.error('no samples/*/main.ts found');
  process.exit(1);
}

for (const e of entries) {
  const source = fs.readFileSync(e.input, 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2019,
      module: ts.ModuleKind.None,
      strict: true,
      removeComments: false,
    },
    fileName: e.input,
  });
  if (result.diagnostics?.length) {
    for (const d of result.diagnostics) {
      const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n');
      console.error(`${e.name}: ${msg}`);
    }
    process.exit(1);
  }
  const banner =
    '/** Generated from main.ts — do not edit. Run: npm run build:samples */\n';
  fs.writeFileSync(e.output, banner + result.outputText);
  console.log('built', path.relative(root, e.output));
}
