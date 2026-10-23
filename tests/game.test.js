import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, parse } from '../src/index.js';
import { runCapture, runError } from './helpers.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const says = async (src, opts) => (await runCapture(src, opts)).output;

// A fake game host: counts frames, holds keys, delivers taps.
function gameHost({ keys = () => [], taps = () => [], maxFrames = 1000, pointer } = {}) {
  const h = {
    frames: 0,
    said: [],
    say: (t) => h.said.push(t),
    frame: async () => { h.frames++; },
    key: (k) => keys(h.frames).includes(k),
    takeTaps: () => taps(h.frames),
    pointer: () => pointer,
    shouldStop: () => h.frames >= maxFrames,
  };
  return h;
}

test('text with {…} fills in values', async () => {
  assert.deepEqual(await says('score = 3\nname = "Mia"\nsay "{name} has {score * 2} points"\nsay "a \\{b}"'),
    ['Mia has 6 points', 'a {b}']);
});

test('errors inside {…} point at the right column', async () => {
  const e = await runError('say "Hi {nme}"');
  assert.equal(e.line, 1);
  assert.equal(e.col, 10);
});

test('an empty or unclosed {…} is explained', async () => {
  assert.match((await runError('say "a {} b"')).message, /nothing between \{ and \}/);
  assert.match((await runError('say "a {b"')).message, /never closed/);
});

test('+= -= *= /= on names, list items and properties', async () => {
  assert.deepEqual(await says('x = 10\nx += 5\nx -= 1\nx *= 2\nx /= 4\nsay x\nl = [1]\nl[1] += 9\nsay l\nt = "a"\nt += "b"\nsay t'),
    ['7', '[10]', 'ab']);
  assert.deepEqual(await says('s = sprite "⭐", 1, 2\ns.x += 10\ns.size *= 2\nsay s.x\nsay s.size'), ['11', '100']);
  assert.match((await runError('y += 1')).message, /has no value yet/);
});

test('command words still work as names on lines that store something', async () => {
  assert.deepEqual(await says('line = [1, 2]\nline[1] += 5\nsay line\nsay [3, 4]'), ['[6, 2]', '[3, 4]']);
});

test('sprites have x, y, size, angle, hidden and image', async () => {
  const { picture, output } = await runCapture('cat = sprite "🐱", 10, 20\ncat.angle = 45\ncat.hidden = true\ncat.image = "🐶"\nsay cat.y\nsay cat');
  assert.deepEqual(output, ['20', 'sprite "🐶"']);
  assert.equal(picture.sprites.length, 1);
  assert.equal(picture.sprites[0].angle, 45);
  assert.equal(picture.sprites[0].hidden, true);
});

test('wrong sprite properties and values are explained', async () => {
  assert.match((await runError('c = sprite "🐱", 1, 1\nc.sise = 3')).message, /don't have .sise. Did you mean .size\?/);
  assert.match((await runError('c = sprite "🐱", 1, 1\nc.hidden = 1')).message, /must be true or false/);
  assert.match((await runError('c = sprite "🐱", 1, 1\nc.x = "a"')).message, /must be a number/);
  assert.match((await runError('n = 5\nsay n.x')).message, /Only sprites have properties/);
  assert.match((await runError('c = sprite "🐱", 1')).message, /needs 3 values/);
  assert.match((await runError('c = sprite 5, 1, 1')).message, /needs a picture/);
});

test('touches checks overlap, also against a list, and ignores hidden sprites', async () => {
  const src = `a = sprite "🐱", 100, 100
b = sprite "⭐", 140, 100
c = sprite "⭐", 300, 300
say a touches b
say a touches c
say a touches [c, b]
b.hidden = true
say a touches b
say a touches a`;
  assert.deepEqual(await says(src), ['true', 'false', 'true', 'false', 'false']);
  assert.match((await runError('a = sprite "🐱", 1, 1\nsay a touches 5')).message, /right side is a number/);
});

test('repeat forever waits one frame per round', async () => {
  const h = gameHost({ maxFrames: 5 });
  await assert.rejects(run('n = 0\nrepeat forever\n  n += 1\n  say n\nend', h), { name: 'StopSignal' });
  assert.equal(h.frames, 5);
  assert.deepEqual(h.said, ['1', '2', '3', '4', '5']);
});

test('stop ends the program without an error', async () => {
  const h = gameHost();
  await run('n = 0\nrepeat forever\n  n += 1\n  if n == 3\n    say "over"\n    stop\n  end\nend\nsay "never"', h);
  assert.deepEqual(h.said, ['over']);
  assert.equal(h.frames, 2);
});

test('key reads held keys', async () => {
  const h = gameHost({ keys: (f) => (f < 3 ? ['right'] : []) });
  await run('c = sprite "🐱", 0, 0\nrepeat forever\n  if key "right"\n    c.x += 1\n  end\n  if key "Left"\n    c.x -= 100\n  end\n  if c.x >= 3 or touch_x > 0\n    say c.x\n    stop\n  end\nend', h);
  assert.deepEqual(h.said, ['3']);
});

test('unknown keys suggest a close name', async () => {
  assert.match((await runError('say key "lfet"')).message, /Did you mean "left"\?/);
});

test('tapped is true in the frame after a tap inside the sprite', async () => {
  const h = gameHost({ taps: (f) => (f === 2 ? [{ x: 105, y: 95 }, { x: 0, y: 0 }] : []) });
  await run('m = sprite "🐹", 100, 100\nn = 0\nrepeat forever\n  n += 1\n  if m tapped\n    say "tap in round {n}"\n    stop\n  end\nend', h);
  assert.deepEqual(h.said, ['tap in round 3']);
});

test('touch_x, touch_y and touching come from the host', async () => {
  const h = gameHost({ pointer: { x: 12, y: 34, down: true } });
  await run('say "{touch_x} {touch_y} {touching}"', h);
  assert.deepEqual(h.said, ['12 34 true']);
  assert.deepEqual(await says('say touching'), ['false']);
});

test('show puts text on the picture and into the SVG', async () => {
  const { picture } = await runCapture('show "Score: {1 + 1}"\ns = sprite "⭐", 10, 20');
  assert.equal(picture.status, 'Score: 2');
  const svg = picture.toSVG();
  assert.match(svg, />Score: 2<\/text>/);
  assert.match(svg, /<text x="10" y="20" font-size="42.5" text-anchor="middle" dominant-baseline="central">⭐<\/text>/);
});

test('picture files become <image> in the SVG', async () => {
  const { picture } = await runCapture('s = sprite "cat.png", 100, 100');
  assert.match(picture.toSVG(), /<image href="cat.png" x="75" y="75" width="50" height="50"\/>/);
});

test('clear keeps sprites', async () => {
  const { picture } = await runCapture('s = sprite "⭐", 1, 1\nrect 0, 0, 5, 5\nclear');
  assert.equal(picture.shapes.length, 0);
  assert.equal(picture.sprites.length, 1);
});

test('insert and contains', async () => {
  assert.deepEqual(await says('l = [2, 3]\ninsert(l, 1, 1)\ninsert(l, 4, 4)\nsay l\nsay contains(l, 3)\nsay contains([[1, 2]], [1, 2])\nsay contains("hello", "ell")'),
    ['[1, 2, 3, 4]', 'true', 'true', 'true']);
});

// ---- the example games actually play ----

const example = (name) => readFileSync(join(root, 'examples', `${name}.fluff`), 'utf8');

test('catch: holding right moves the cat, and a missed star ends the game', async () => {
  const h = gameHost({ keys: () => ['right'] });
  const { picture } = await run(example('catch'), h, { random: () => 0 });
  const cat = picture.sprites[0];
  assert.equal(cat.x, 375, 'cat stops at the right edge (200 + 25 steps of 7)');
  assert.match(picture.status, /^Game over! You caught \d+ stars\.$/);
});

test('catch: standing under the star catches it', async () => {
  // random() = 0.5 puts every star at x = 200, where the cat is.
  const h = gameHost({ maxFrames: 400 });
  await assert.rejects(run(example('catch'), h, { random: () => 0.5 }), { name: 'StopSignal' });
  assert.equal(h.frames, 400, 'the game never ended, so every star was caught');
});

test('jump: without jumping the dino hits the cactus, jumping scores points', async () => {
  const lazy = gameHost();
  const r1 = await run(example('jump'), lazy);
  assert.equal(r1.picture.status, 'Ouch! You jumped 0 times.');

  const jumper = gameHost({ keys: () => ['space'], maxFrames: 600 });
  try { await run(example('jump'), jumper); } catch (e) { assert.equal(e.name, 'StopSignal'); }
  assert.ok(lazy.frames < jumper.frames);
});

test('tap: tapping the hamster scores', async () => {
  const h = gameHost({ taps: (f) => (f % 10 === 5 ? [{ x: 200, y: 200 }] : []), maxFrames: 2000 });
  const { picture } = await run(example('tap'), h, { random: () => 0.5 });
  assert.match(picture.status, /^Time is up! Score: [1-9]\d*$/);
});

test('snake: without steering it runs into the wall', async () => {
  const h = gameHost();
  const { picture } = await run(example('snake'), h, { random: () => 0 });
  assert.equal(picture.status, 'Game over! Length: 3');
  assert.equal(h.frames, 149, 'head moves from cell 5 to 19 (14 moves of 10 frames), the 15th move hits the wall');
});

test('snake: an apple straight ahead makes it longer', async () => {
  // The first apple lands on cell 15, 10: in the snake's row, 10 cells ahead.
  const rolls = [0.75, 0.5];
  const h = gameHost();
  const { picture } = await run(example('snake'), h, { random: () => (rolls.length ? rolls.shift() : 0) });
  assert.match(picture.status, /^Game over! Length: (\d+)$/);
  assert.ok(Number(picture.status.match(/\d+$/)[0]) > 3, picture.status);
});

test('all examples parse', () => {
  for (const name of ['catch', 'jump', 'tap', 'snake', 'bounce', 'house', 'rainbow', 'guess', 'functions', 'hello']) {
    parse(example(name));
  }
});
