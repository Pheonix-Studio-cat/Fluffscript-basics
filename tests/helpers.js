import { run } from '../src/index.js';

// Runs a program and collects everything it says.
export async function runCapture(source, { answers = [], ...options } = {}) {
  const output = [];
  const asked = [];
  const host = {
    say: (t) => output.push(t),
    ask: async (q) => { asked.push(q); return answers.shift() ?? ''; },
    wait: async () => {},
  };
  const { picture } = await run(source, host, { maxSteps: 100000, ...options });
  return { output, asked, picture };
}

// Runs a program that must fail and returns the error.
export async function runError(source, options) {
  try {
    await runCapture(source, options);
  } catch (e) {
    return e;
  }
  throw new Error('expected the program to fail, but it ran');
}
