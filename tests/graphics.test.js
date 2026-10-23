import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCapture, runError } from './helpers.js';

test('shapes are recorded with the current color and thickness', async () => {
  const { picture } = await runCapture('canvas 200, 100\nbackground "navy"\ncolor "Red"\nthickness 5\ncircle 10, 20, 5\nline 0, 0, 10, 10');
  assert.equal(picture.width, 200);
  assert.equal(picture.height, 100);
  assert.equal(picture.background, 'navy');
  assert.deepEqual(picture.shapes, [
    { type: 'circle', x: 10, y: 20, radius: 5, color: 'red', thickness: 5 },
    { type: 'line', x1: 0, y1: 0, x2: 10, y2: 10, color: 'red', thickness: 5 },
  ]);
});

test('clear removes all shapes', async () => {
  const { picture } = await runCapture('rect 1, 2, 3, 4\nclear\ntriangle 0, 0, 1, 1, 2, 0');
  assert.equal(picture.shapes.length, 1);
  assert.equal(picture.shapes[0].type, 'triangle');
});

test('a program that never draws has an unused picture', async () => {
  const { picture } = await runCapture('say 1');
  assert.equal(picture.used, false);
});

test('SVG output contains every shape', async () => {
  const { picture } = await runCapture('color "#ff8800"\ncircle 1, 2, 3\nrect 0, 0, 5, 5\nline 0, 0, 1, 1\ntriangle 0, 0, 1, 1, 2, 0\ntext "a<b", 5, 5');
  const svg = picture.toSVG();
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="400" height="400"/);
  assert.match(svg, /<circle cx="1" cy="2" r="3" fill="#ff8800"\/>/);
  assert.match(svg, /<polygon points="0 0 1 1 2 0"/);
  assert.match(svg, /<line x1="0"/);
  assert.match(svg, />a&lt;b<\/text>/);
});

test('unknown colors suggest a close name', async () => {
  const e = await runError('color "purpel"');
  assert.match(e.message, /I don't know the color the text "purpel". Did you mean "purple"\?/);
});

test('drawing commands need numbers', async () => {
  const e = await runError('circle "a", 2, 3');
  assert.match(e.message, /`circle` needs a number for x, but got the text "a"/);
});

test('wait asks the host to show the picture first', async () => {
  const events = [];
  const host = {
    render: () => events.push('render'),
    wait: async (s) => events.push(`wait ${s}`),
  };
  const { run } = await import('../src/index.js');
  await run('circle 1, 1, 1\nwait 0.5', host);
  assert.deepEqual(events, ['render', 'render', 'wait 0.5']);
});
