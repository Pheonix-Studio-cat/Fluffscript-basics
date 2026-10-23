import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FluffError, StopSignal, run } from '../src/index.js';
import { runCapture, runError } from './helpers.js';

const says = async (src, opts) => (await runCapture(src, opts)).output;

test('say shows numbers, texts, booleans, lists and nothing', async () => {
  assert.deepEqual(await says('say 1\nsay "a"\nsay true\nsay nothing\nsay [1, "b"]\nsay'),
    ['1', 'a', 'true', 'nothing', '[1, "b"]', '']);
});

test('arithmetic and text joining', async () => {
  assert.deepEqual(await says('say 1 + 2 * 3\nsay (1 + 2) * 3\nsay 7 % 3\nsay 0.1 + 0.2\nsay "n=" + 5\nsay "ha" * 3\nsay -2 + 5'),
    ['7', '9', '1', '0.3', 'n=5', 'hahaha', '3']);
});

test('if / else if / else', async () => {
  const src = (n) => `n = ${n}\nif n > 10\n  say "big"\nelse if n > 5\n  say "medium"\nelse\n  say "small"\nend`;
  assert.deepEqual(await says(src(20)), ['big']);
  assert.deepEqual(await says(src(7)), ['medium']);
  assert.deepEqual(await says(src(1)), ['small']);
});

test('and, or, not', async () => {
  assert.deepEqual(await says('say true and false\nsay true or false\nsay not true\nsay 1 < 2 and 2 < 3'),
    ['false', 'true', 'false', 'true']);
});

test('repeat, while, for each in, for each from to', async () => {
  assert.deepEqual(await says('repeat 3 times\n  say "x"\nend'), ['x', 'x', 'x']);
  assert.deepEqual(await says('i = 0\nwhile i < 3\n  i = i + 1\n  say i\nend'), ['1', '2', '3']);
  assert.deepEqual(await says('for each f in ["a", "b"]\n  say f\nend'), ['a', 'b']);
  assert.deepEqual(await says('for each c in "hi"\n  say c\nend'), ['h', 'i']);
  assert.deepEqual(await says('for each i from 1 to 3\n  say i\nend'), ['1', '2', '3']);
  assert.deepEqual(await says('for each i from 3 to 1\n  say i\nend'), ['3', '2', '1']);
});

test('repeat 0 times does nothing', async () => {
  assert.deepEqual(await says('repeat 0 times\n  say "x"\nend'), []);
});

test('functions, return and recursion', async () => {
  const src = `
function fact(n)
  if n <= 1
    return 1
  end
  return n * fact(n - 1)
end
say fact(5)
function hi()
  say "hi"
end
x = hi()
say x`;
  assert.deepEqual(await says(src), ['120', 'hi', 'nothing']);
});

test('functions can be used before they are written', async () => {
  assert.deepEqual(await says('say double(4)\nfunction double(n)\n  return n * 2\nend'), ['8']);
});

test('a function changes an outer name that exists, and keeps new names local', async () => {
  const src = `
count = 0
function bump()
  count = count + 1
  temp = 5
end
bump()
bump()
say count
say temp`;
  const e = await runError(src);
  assert.match(e.message, /I don't know `temp`/);
  assert.deepEqual(await says(src.replace('say temp', '')), ['2']);
});

test('lists start at 1 and can be changed', async () => {
  assert.deepEqual(await says('x = [10, 20, 30]\nsay x[1]\nx[2] = 99\nsay x\nadd(x, 4)\nsay length(x)\nsay remove(x, 1)\nsay x'),
    ['10', '[10, 99, 30]', '4', '10', '[99, 30, 4]']);
});

test('== compares values, also lists', async () => {
  assert.deepEqual(await says('say [1, 2] == [1, 2]\nsay 1 == "1"\nsay "a" != "b"'), ['true', 'false', 'true']);
});

test('ask turns number answers into numbers', async () => {
  const r = await runCapture('a = ask "Age?"\nsay a + 1\nb = ask "Name?"\nsay b + 1', { answers: ['9', 'Mia'] });
  assert.deepEqual(r.asked, ['Age?', 'Name?']);
  assert.deepEqual(r.output, ['10', 'Mia1']);
});

test('random stays inside its range', async () => {
  const lows = await says('say random(1, 6)', { random: () => 0 });
  const highs = await says('say random(1, 6)', { random: () => 0.9999 });
  assert.deepEqual([lows[0], highs[0]], ['1', '6']);
});

test('built-ins: round, sqrt, abs', async () => {
  assert.deepEqual(await says('say round(2.6)\nsay sqrt(16)\nsay abs(-3)'), ['3', '4', '3']);
});

// ---- friendly errors ----

test('unknown names suggest a close match', async () => {
  const e = await runError('name = "Mia"\nsay nmae');
  assert.ok(e instanceof FluffError);
  assert.equal(e.line, 2);
  assert.match(e.message, /Did you mean `name`\?/);
});

test('unknown functions suggest a close match', async () => {
  const e = await runError('function greet(w)\n  say w\nend\ngret("x")');
  assert.match(e.message, /function called `gret`. Did you mean `greet`\?/);
});

test('list positions out of range explain the size, and that lists start at 1', async () => {
  assert.match((await runError('x = [1, 2]\nsay x[5]')).message, /has 2 items, so there is no item 5/);
  assert.match((await runError('x = [1, 2]\nsay x[0]')).message, /Positions start at 1/);
});

test('type mistakes are explained', async () => {
  assert.match((await runError('say 5 - "a"')).message, /only subtract numbers/);
  assert.match((await runError('say 1 / 0')).message, /divide by zero/);
  assert.match((await runError('say 1 < "a"')).message, /can't compare a number with a text/);
  assert.match((await runError('repeat "x" times\nend')).message, /needs a number of times/);
});

test('wrong number of function values', async () => {
  const e = await runError('function f(a, b)\nend\nf(1)');
  assert.match(e.message, /`f` needs 2 values \(a, b\), but got 1/);
});

test('endless recursion is stopped with a message', async () => {
  const e = await runError('function f()\n  f()\nend\nf()');
  assert.match(e.message, /called itself too many times/);
});

test('an endless loop is stopped when maxSteps is reached', async () => {
  const e = await runError('while true\nend', { maxSteps: 500 });
  assert.match(e.message, /ran for too long/);
});

test('shouldStop stops a running program', async () => {
  let n = 0;
  await assert.rejects(
    run('repeat forever\n  x = 1\nend', { shouldStop: () => ++n > 50 }),
    (e) => e instanceof StopSignal,
  );
});
