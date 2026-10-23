import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('the playground builds into one file without imports, and its script is valid', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fluff-build-'));
  const out = join(dir, 'playground.html');
  const r = spawnSync(process.execPath, [join(root, 'scripts/build-playground.js'), out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const html = readFileSync(out, 'utf8');
  assert.match(html, /<title>FluffScript Playground<\/title>/);
  assert.doesNotMatch(html, /<!doctype|<html|<body/i);
  assert.doesNotMatch(html, /from '\.\.\/src/);
  assert.match(html, /const EXAMPLES = /);
  assert.match(html, /class Interpreter/);
  const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  const file = join(dir, 'script.mjs');
  writeFileSync(file, script);
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr);
});
