#!/usr/bin/env node
// Runs a FluffScript program from the command line:
//
//   node bin/fluff.js examples/hello.fluff
//
// `say` prints, `ask` reads a line. If the program draws, the picture is
// saved as an SVG file next to the program (or where --svg says).

import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { run, formatError, FluffError } from 'fluffscript-engine';

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log('Usage: fluff <program.fluff> [--svg picture.svg]');
  process.exit(args.length === 0 ? 1 : 0);
}
let file = null;
let svgPath = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--svg') svgPath = args[++i];
  else file = args[i];
}
if (!file) {
  console.error('Which program should I run? Usage: fluff <program.fluff> [--svg picture.svg]');
  process.exit(1);
}

let source;
try {
  source = readFileSync(file, 'utf8');
} catch {
  console.error(`I can't open the file ${file}.`);
  process.exit(1);
}

// Lines are read through one queue, so piped input works as well as typing.
const rl = createInterface({ input: process.stdin, terminal: false });
const queued = [];
const waiting = [];
let closed = false;
rl.on('line', (line) => (waiting.length ? waiting.shift()(line) : queued.push(line)));
rl.on('close', () => { closed = true; while (waiting.length) waiting.shift()(''); });
rl.pause();

const host = {
  say: (text) => { process.stdout.write(text + '\n'); },
  ask: (question) => {
    if (question) process.stdout.write(question + ' ');
    if (queued.length) return Promise.resolve(queued.shift());
    if (closed) return Promise.resolve('');
    rl.resume();
    return new Promise((resolve) => waiting.push(resolve));
  },
  wait: (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000)),
};

try {
  const { picture } = await run(source, host);
  if (picture.used) {
    const out = svgPath || file.replace(/\.fluff$/i, '') + '.svg';
    writeFileSync(out, picture.toSVG());
    console.log(`(picture saved to ${out})`);
  }
  rl.close();
} catch (error) {
  rl.close();
  if (error instanceof FluffError) {
    console.error(formatError(error, source));
    process.exit(1);
  }
  throw error;
}
