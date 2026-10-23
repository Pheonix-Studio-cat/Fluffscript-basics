import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, FluffError } from '../src/index.js';

const kinds = (src) => tokenize(src).map((t) => `${t.type}:${t.value}`);

test('numbers, texts, names, keywords and symbols', () => {
  assert.deepEqual(kinds('x = 3.5 + "hi"'), [
    'name:x', 'symbol:=', 'number:3.5', 'symbol:+', 'string:hi', 'newline:\n', 'eof:null',
  ]);
  assert.deepEqual(kinds('if a >= 2'), ['keyword:if', 'name:a', 'symbol:>=', 'number:2', 'newline:\n', 'eof:null']);
});

test('comments are skipped, line breaks are kept', () => {
  assert.deepEqual(kinds('# hello\nsay 1 # one'), ['newline:\n', 'name:say', 'number:1', 'newline:\n', 'eof:null']);
});

test('both quote styles and escapes work', () => {
  const t = tokenize(`'it"s' "a\\nb" "say \\"hi\\""`);
  assert.deepEqual(t.slice(0, 3).map((x) => x.value), ['it"s', 'a\nb', 'say "hi"']);
});

test('tokens know their line and column', () => {
  const t = tokenize('say 1\n  say 2');
  const second = t.filter((x) => x.value === 'say')[1];
  assert.equal(second.line, 2);
  assert.equal(second.col, 3);
});

test('an unfinished text is a friendly error', () => {
  assert.throws(() => tokenize('say "hello'), (e) => e instanceof FluffError && /never ends/.test(e.message) && e.line === 1);
});

test('curly braces and semicolons get an explanation', () => {
  assert.throws(() => tokenize('if x {'), /Blocks end with `end`/);
  assert.throws(() => tokenize('say 1;'), /own line/);
});
