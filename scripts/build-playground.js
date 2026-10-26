// Builds the FLUFFSCRIPT ENGINE editor into self-contained HTML files: the
// engine and the examples are inlined, so the page needs no server.
//
//   dist/playground.html  for a claude.ai Artifact (no <html>/<head>, the
//                         Artifact adds its own skeleton and charset)
//   dist/site/index.html  a complete web page, served by Cloudflare
//                         (see wrangler.jsonc)
//
//   node scripts/build-playground.js [artifact-file]
//   (the site goes to site/index.html next to the artifact file)

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || join(root, 'dist/playground.html');
const siteOut = join(dirname(out), 'site/index.html');
// The engine comes from npm (`npm install`), see package.json.
const engine = join(root, 'node_modules/fluffscript-engine/src');
if (!existsSync(engine)) {
  console.error('The FluffScript engine is missing. Run `npm install` first.');
  process.exit(1);
}

// Order matters: every file comes after the files it imports.
const ORDER = ['errors', 'commands', 'lexer', 'parser', 'graphics', 'interpreter'];

function bundle() {
  const parts = ORDER.map((name) => {
    let src = readFileSync(join(engine, `${name}.js`), 'utf8');
    src = src.replace(/^import [^;]+;\n/gm, '');
    src = src.replace(/^export (?=(async )?(function|class|const|let)\b)/gm, '');
    if (/^\s*(import|export)\b/m.test(src)) throw new Error(`fluffscript-engine/src/${name}.js has an import/export the bundler can't handle`);
    return `// ---- fluffscript-engine/src/${name}.js ----\n${src}`;
  });
  return parts.join('\n');
}

function examples() {
  const dir = join(root, 'examples');
  const order = ['catch', 'jump', 'tap', 'snake', 'house', 'rainbow', 'bounce', 'guess', 'functions', 'hello'];
  const files = readdirSync(dir).filter((f) => f.endsWith('.fluff')).map((f) => basename(f, '.fluff'));
  const names = [...order.filter((n) => files.includes(n)), ...files.filter((n) => !order.includes(n)).sort()];
  const data = Object.fromEntries(names.map((n) => [n, readFileSync(join(dir, `${n}.fluff`), 'utf8')]));
  return `const EXAMPLES = ${JSON.stringify(data, null, 2).replace(/</g, '\\u003c')};\nasync function loadExamples() { return EXAMPLES; }`;
}

let html = readFileSync(join(root, 'playground/index.html'), 'utf8');
const fullHead = html.match(/<head>([\s\S]*?)<\/head>/)[1];
const head = fullHead
  .replace(/<meta charset[^>]*>\n?/, '')
  .replace(/<meta name="viewport"[^>]*>\n?/, '');
let body = html.match(/<body>([\s\S]*?)<\/body>/)[1];

const importLine = /^import \{[^}]+\} from '\.\.\/node_modules\/fluffscript-engine\/src\/index\.js';$/m;
if (!importLine.test(body)) throw new Error('playground: import line not found');
body = body.replace(importLine, () => bundle());
const exampleBlock = /\/\* build:examples \*\/[\s\S]*?\/\* end:examples \*\//;
if (!exampleBlock.test(body)) throw new Error('playground: examples block not found');
body = body.replace(exampleBlock, () => examples());

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${head.trim()}\n${body.trim()}\n`);
console.log(`wrote ${out}`);

const lang = (html.match(/<html lang="([^"]+)"/) || [])[1] || 'en';
mkdirSync(dirname(siteOut), { recursive: true });
writeFileSync(siteOut, `<!doctype html>\n<html lang="${lang}">\n<head>\n${fullHead.trim()}\n</head>\n<body>\n${body.trim()}\n</body>\n</html>\n`);
console.log(`wrote ${siteOut}`);
