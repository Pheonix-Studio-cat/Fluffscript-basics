import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, FluffError } from '../src/index.js';

const err = (src) => {
  try { parse(src); } catch (e) { assert.ok(e instanceof FluffError, String(e)); return e; }
  throw new Error('expected a parse error');
};

test('a program is a list of statements', () => {
  const p = parse('x = 1\nsay x\n');
  assert.deepEqual(p.body.map((s) => s.type), ['Assign', 'Command']);
});

test('operator precedence: * before +, comparison before and', () => {
  const p = parse('x = 1 + 2 * 3 == 7 and true');
  const v = p.body[0].value;
  assert.equal(v.type, 'Logical');
  assert.equal(v.left.op, '==');
  assert.equal(v.left.left.op, '+');
  assert.equal(v.left.left.right.op, '*');
});

test('else if shares one end', () => {
  const p = parse('if a\nsay 1\nelse if b\nsay 2\nelse\nsay 3\nend');
  assert.equal(p.body.length, 1);
  assert.equal(p.body[0].otherwise[0].type, 'If');
  assert.equal(p.body[0].otherwise[0].otherwise.length, 1);
});

test('commands can still be used as names when assigned', () => {
  const p = parse('color = "red"\ncolor color');
  assert.deepEqual(p.body.map((s) => s.type), ['Assign', 'Command']);
});

test('circle(1, 2, 3) is forgiven and means circle 1, 2, 3', () => {
  const p = parse('circle(1, 2, 3)');
  assert.equal(p.body[0].type, 'Command');
  assert.equal(p.body[0].args.length, 3);
});

test('a missing end points at the block that is not closed', () => {
  const e = err('say 1\nrepeat 3 times\n  say 2\n');
  assert.match(e.message, /`repeat` never got its `end`/);
  assert.equal(e.line, 2);
});

test('a stray end or else is explained', () => {
  assert.match(err('end').message, /nothing to end/);
  assert.match(err('else').message, /without an `if`/);
});

test('a single = in a condition suggests ==', () => {
  const e = err('if x = 5\nsay 1\nend');
  assert.match(e.message, /use `==`/);
});

test('a line that does nothing asks whether you wanted to say it', () => {
  assert.match(err('5 + 5').message, /Did you want to `say` it/);
});

test('wrong number of command values shows how to write it', () => {
  const e = err('circle 10, 20');
  assert.match(e.message, /needs 3 values, but got 2/);
  assert.match(e.message, /circle x, y, radius/);
});

test('return outside a function is an error', () => {
  assert.match(err('return 1').message, /only works inside a function/);
});

test('repeat needs times', () => {
  assert.match(err('repeat 3\nsay 1\nend').message, /expected `times`/);
});

test('lists may span several lines', () => {
  const p = parse('x = [\n  1,\n  2\n]');
  assert.equal(p.body[0].value.items.length, 2);
});
