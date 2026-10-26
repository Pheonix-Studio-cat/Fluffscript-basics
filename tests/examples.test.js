import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, run } from 'fluffscript-engine';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('the bouncing ball parses and draws one ball per frame', async () => {
  const source = readFileSync(join(root, 'examples/bounce.fluff'), 'utf8');
  parse(source);
  let frames = 0;
  let maxShapes = 0;
  const host = {
    render: (pic) => { maxShapes = Math.max(maxShapes, pic.shapes.length); },
    wait: async () => { frames++; },
    shouldStop: () => frames >= 200,
  };
  await assert.rejects(run(source, host), { name: 'StopSignal' });
  assert.equal(frames, 200);
  assert.equal(maxShapes, 1);
});
