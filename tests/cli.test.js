import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fluff = (args, input = '') => spawnSync(process.execPath, [join(root, 'bin/fluff.js'), ...args], { input, encoding: 'utf8' });

test('runs a program and prints what it says', () => {
  const r = fluff([join(root, 'examples/hello.fluff')]);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, 'Hello, world!\n');
});

test('reads answers from piped input', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fluff-'));
  const file = join(dir, 'ask.fluff');
  writeFileSync(file, 'a = ask "A?"\nb = ask "B?"\nsay a + b');
  const r = fluff([file], '2\n3\n');
  assert.equal(r.status, 0);
  assert.equal(r.stdout, 'A? B? 5\n');
});

test('errors are shown with the line and exit with 1', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fluff-'));
  const file = join(dir, 'bad.fluff');
  writeFileSync(file, 'say 1\nsay nope');
  const r = fluff([file]);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '1\n');
  assert.equal(r.stderr, "Line 2: I don't know `nope`. Give it a value first, like this: nope = 5\n  say nope\n      ^\n");
});

test('a drawing program saves an SVG', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fluff-'));
  const out = join(dir, 'house.svg');
  const r = fluff([join(root, 'examples/house.fluff'), '--svg', out]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(out));
  assert.match(readFileSync(out, 'utf8'), /<polygon points="100 140 300 140 200 70"/);
});

test('without a file it shows how to use it', () => {
  const r = fluff([]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Usage: fluff/);
});

// Games (`repeat forever`) run in real time here, so they are played in
// game.test.js with a fake clock instead.
test('every example that is not a game runs without error', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fluff-'));
  const examples = readdirSync(join(root, 'examples'))
    .filter((f) => f.endsWith('.fluff'))
    .filter((f) => !readFileSync(join(root, 'examples', f), 'utf8').includes('repeat forever'));
  assert.ok(examples.length >= 4);
  const answers = Array.from({ length: 20 }, (_, i) => i + 1).join('\n') + '\n';
  for (const f of examples) {
    const r = fluff([join(root, 'examples', f), '--svg', join(dir, f + '.svg')], answers);
    assert.equal(r.status, 0, `${f}: ${r.stderr}`);
  }
});
