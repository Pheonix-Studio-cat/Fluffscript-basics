import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, parse } from 'fluffscript-engine';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

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
