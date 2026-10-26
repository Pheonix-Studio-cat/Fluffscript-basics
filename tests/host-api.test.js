// Checks docs/host-api.md: every promise made there is tested here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  run, parse, Interpreter, FluffError, StopSignal, formatError, VERSION, KEY_NAMES,
  Picture, Sprite, SPRITE_PROPERTIES, paint, isImageFile, normalizeColor,
} from '../src/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const doc = readFileSync(join(root, 'docs/host-api.md'), 'utf8');

test('every host function the interpreter calls is documented', () => {
  const src = readFileSync(join(root, 'src/interpreter.js'), 'utf8');
  const used = new Set([...src.matchAll(/this\.host\.(\w+)/g)].map((m) => m[1]));
  assert.ok(used.size >= 10, `found only ${[...used]}`);
  for (const name of used) {
    assert.match(doc, new RegExp(`\\| \`${name}\\(`), `host.${name} is used but not in docs/host-api.md`);
  }
});

test('VERSION matches package.json', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(VERSION, pkg.version);
});

test('everything the doc imports is exported', () => {
  for (const x of [run, parse, Interpreter, FluffError, StopSignal, formatError, Picture, Sprite, paint, isImageFile, normalizeColor]) {
    assert.equal(typeof x, 'function');
  }
  assert.deepEqual(SPRITE_PROPERTIES, ['x', 'y', 'size', 'angle', 'hidden', 'image']);
  assert.ok(KEY_NAMES.includes('left') && KEY_NAMES.includes('space') && KEY_NAMES.includes('z') && KEY_NAMES.includes('0'));
});

// ---- outcomes ----

test('a program that ends, or runs stop, resolves { picture }', async () => {
  const r1 = await run('x = 1', {});
  assert.ok(r1.picture instanceof Picture);
  const r2 = await run('stop\nsay "never"', { say: () => assert.fail('ran past stop') });
  assert.ok(r2.picture instanceof Picture);
});

test('a mistake rejects with a FluffError that formatError can show', async () => {
  const source = 'x = 1\nsay y';
  const e = await run(source, {}).then(() => null, (err) => err);
  assert.ok(e instanceof FluffError);
  assert.equal(e.line, 2);
  assert.equal(e.col, 5);
  assert.match(formatError(e, source), /^Line 2: .*\n  say y\n      \^$/);
});

test('shouldStop rejects with a StopSignal', async () => {
  await assert.rejects(run('while true\nend', { shouldStop: () => true }), (e) => e instanceof StopSignal);
});

test('source may be a parsed tree, and new Interpreter().run works the same', async () => {
  const said = [];
  await run(parse('say 1'), { say: (t) => said.push(t) });
  await new Interpreter({ say: (t) => said.push(t) }).run('say 2');
  assert.deepEqual(said, ['1', '2']);
});

// ---- options ----

test('maxSteps stops a long program with a FluffError', async () => {
  await assert.rejects(run('while true\nend', {}, { maxSteps: 100 }), (e) => e instanceof FluffError && /too long/.test(e.message));
});

test('yieldEvery lets other code run during a long loop', async () => {
  let ranInBetween = false;
  setTimeout(() => { ranInBetween = true; }, 0);
  let sawIt = false;
  await run('for each i from 1 to 5000\n  x = i\nend\nsay "end"', { say: () => { sawIt = ranInBetween; } }, { yieldEvery: 100 });
  assert.equal(sawIt, true);
});

test('random option feeds random(a, b)', async () => {
  const said = [];
  await run('say random(1, 10)', { say: (t) => said.push(t) }, { random: () => 0.99 });
  assert.deepEqual(said, ['10']);
});

// ---- host functions ----

test('say gets a string and is awaited', async () => {
  const log = [];
  await run('say 5\nsay [1, "a"]', {
    say: async (t) => { await new Promise((r) => setTimeout(r, 5)); log.push(typeof t + ':' + t); },
  });
  assert.deepEqual(log, ['string:5', 'string:[1, "a"]']);
});

test('ask: answers that look like numbers become numbers; without ask it is an error', async () => {
  const said = [];
  await run('a = ask "Q?"\nsay a + 1', { ask: async (q) => (q === 'Q?' ? ' 41 ' : ''), say: (t) => said.push(t) });
  assert.deepEqual(said, ['42']);
  await assert.rejects(run('a = ask "Q?"', {}), (e) => e instanceof FluffError && /ask/.test(e.message));
});

test('wait comes after render; without wait there is no pause', async () => {
  const log = [];
  await run('circle 1, 1, 1\nwait 0.5', { render: () => log.push('render'), wait: async (s) => log.push(`wait ${s}`) });
  assert.deepEqual(log.slice(-2), ['render', 'wait 0.5']);
  const t = Date.now();
  await run('wait 5', {});
  assert.ok(Date.now() - t < 1000);
});

test('frame comes after render in every round of repeat forever', async () => {
  const log = [];
  let n = 0;
  await run('s = sprite "⭐", 0, 0\nrepeat forever\n  s.x += 1\n  if s.x == 3\n    stop\n  end\nend', {
    render: () => log.push('render'),
    frame: async () => { n++; log.push('frame'); },
  });
  assert.equal(n, 2);
  assert.deepEqual(log, ['render', 'render', 'frame', 'render', 'frame', 'render']);
});

test('without frame, wait(1/60) is used; without both, no pause', async () => {
  const waits = [];
  await run('n = 0\nrepeat forever\n  n += 1\n  if n == 3\n    stop\n  end\nend', { wait: async (s) => waits.push(s) });
  assert.deepEqual(waits, [1 / 60, 1 / 60]);
  await run('n = 0\nrepeat forever\n  n += 1\n  if n == 3\n    stop\n  end\nend', {});
});

test('render: drawing, show, new sprite, at stop — but not property changes', async () => {
  let renders = 0;
  const host = { render: () => { renders++; } };
  await run('s = sprite "⭐", 0, 0', host);
  assert.equal(renders, 1, 'new sprite');
  renders = 0;
  await run('s = sprite "⭐", 0, 0\ns.x = 5\ns.size = 9', host);
  assert.equal(renders, 1, 'property changes alone do not render');
  renders = 0;
  await run('show "hi"\nrect 0, 0, 1, 1\nstop', host);
  assert.equal(renders, 3, 'show, rect, stop');
});

test('render may come before anything is drawn; picture.used tells', async () => {
  const seen = [];
  await run('color "red"\ncircle 1, 1, 1', { render: (p) => seen.push(p.used) });
  assert.deepEqual(seen, [false, true]);
});

test('key gets lower-case names; without key it is false; usesKeys every time', async () => {
  const asked = [];
  let uses = 0;
  const said = [];
  await run('say key "Left"\nsay key "space"', {
    key: (k) => { asked.push(k); return k === 'left'; },
    usesKeys: () => { uses++; },
    say: (t) => said.push(t),
  });
  assert.deepEqual(asked, ['left', 'space']);
  assert.deepEqual(said, ['true', 'false']);
  assert.equal(uses, 2);
  const said2 = [];
  await run('say key "up"', { say: (t) => said2.push(t) });
  assert.deepEqual(said2, ['false']);
});

test('takeTaps is called once per frame and feeds tapped', async () => {
  let calls = 0;
  const said = [];
  await run('s = sprite "⭐", 50, 50\nn = 0\nrepeat forever\n  n += 1\n  if s tapped\n    say n\n    stop\n  end\nend', {
    frame: async () => {},
    takeTaps: () => { calls++; return calls === 2 ? [{ x: 50, y: 60 }] : []; },
    say: (t) => said.push(t),
  });
  assert.equal(calls, 2);
  assert.deepEqual(said, ['3']);
});

test('pointer: default is 0, 0, not down', async () => {
  const said = [];
  await run('say "{touch_x},{touch_y},{touching}"', { say: (t) => said.push(t) });
  assert.deepEqual(said, ['0,0,false']);
  const said2 = [];
  await run('say "{touch_x},{touch_y},{touching}"', { pointer: () => ({ x: 3, y: 4, down: true }), say: (t) => said2.push(t) });
  assert.deepEqual(said2, ['3,4,true']);
});

test('shouldStop is checked before every statement and after ask, wait and frame', async () => {
  for (const [src, extra] of [
    ['a = ask "?"\nsay "after"', { ask: async () => { stopNow = true; return 'x'; } }],
    ['wait 1\nsay "after"', { wait: async () => { stopNow = true; } }],
    ['repeat forever\n  say "round"\nend', { frame: async () => { stopNow = true; } }],
  ]) {
    var stopNow = false;
    const said = [];
    await assert.rejects(run(src, { ...extra, say: (t) => said.push(t), shouldStop: () => stopNow }), (e) => e instanceof StopSignal);
    assert.ok(!said.includes('after'), src);
    assert.ok(said.filter((s) => s === 'round').length <= 1, src);
  }
  let checks = 0;
  await run('x = 1\ny = 2\nz = 3', { shouldStop: () => { checks++; return false; } });
  assert.ok(checks >= 3);
});

// ---- the picture ----

test('picture fields, shapes and normalized colors', async () => {
  const { picture: p } = await run('canvas 200, 100\nbackground "Navy"\ncolor "#FF0000"\nthickness 4\ncircle 1, 2, 3\nrect 1, 2, 3, 4\nline 1, 2, 3, 4\ntriangle 1, 2, 3, 4, 5, 6\ntext "hi", 7, 8\nshow "s"', {});
  assert.equal(p.width, 200);
  assert.equal(p.height, 100);
  assert.equal(p.background, 'navy');
  assert.equal(p.status, 's');
  assert.equal(p.used, true);
  assert.deepEqual(p.shapes.map((s) => s.type), ['circle', 'rect', 'line', 'triangle', 'text']);
  for (const s of p.shapes) {
    assert.equal(s.color, '#ff0000');
    assert.equal(s.thickness, 4);
  }
  assert.deepEqual(p.shapes[4], { type: 'text', words: 'hi', x: 7, y: 8, size: 20, color: '#ff0000', thickness: 4 });
  assert.match(p.toSVG(), /^<svg /);
  const fresh = new Picture();
  assert.deepEqual([fresh.width, fresh.height, fresh.used], [400, 400, false]);
});

test('sprites: fields, box, touches, contains, isImageFile', async () => {
  const { picture } = await run('a = sprite "⭐", 100, 100\nb = sprite "cat.png", 130, 100', {});
  const [a, b] = picture.sprites;
  assert.ok(a instanceof Sprite);
  assert.deepEqual([a.image, a.x, a.y, a.size, a.angle, a.hidden], ['⭐', 100, 100, 50, 0, false]);
  assert.deepEqual(a.box(), [75, 75, 125, 125]);
  assert.equal(a.touches(b), true);
  assert.equal(a.contains(76, 124), true);
  assert.equal(a.contains(74, 100), false);
  assert.equal(isImageFile(a.image), false);
  assert.equal(isImageFile(b.image), true);
  assert.equal(isImageFile('https://x.org/a'), true);
});

test('paint draws on a canvas-like context and asks getImage for picture files', async () => {
  const { picture } = await run('rect 0, 0, 5, 5\ns = sprite "cat.png", 10, 10\nt = sprite "⭐", 20, 20', {});
  const calls = [];
  const ctx = new Proxy({}, {
    get: (_, k) => (typeof k === 'string' && !['fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'font', 'textAlign', 'textBaseline', 'lineJoin'].includes(k)
      ? (...args) => calls.push(k) : undefined),
    set: () => true,
  });
  const asked = [];
  paint(picture, ctx, (name) => { asked.push(name); return null; });
  assert.deepEqual(asked, ['cat.png']);
  assert.ok(calls.includes('fillRect') && calls.includes('fillText') && calls.includes('strokeRect'));
});

test('normalizeColor', () => {
  assert.equal(normalizeColor(' Sky Blue '), 'skyblue');
  assert.equal(normalizeColor('#ABC'), '#abc');
  assert.equal(normalizeColor('nope'), null);
});
