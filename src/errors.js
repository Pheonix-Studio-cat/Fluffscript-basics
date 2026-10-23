// Every problem FluffScript reports is a FluffError: a friendly message plus
// the place in the program where it happened.

export class FluffError extends Error {
  constructor(message, line, col) {
    super(message);
    this.name = 'FluffError';
    this.line = line;
    this.col = col;
  }
}

// Shows the error together with the line of code it points to:
//
//   Line 3: I don't know `nme`. Did you mean `name`?
//     say nme
//         ^
export function formatError(error, source) {
  if (!(error instanceof FluffError)) return String(error && error.message || error);
  if (!error.line) return error.message;
  const lines = source.split('\n');
  const code = lines[error.line - 1];
  let out = `Line ${error.line}: ${error.message}`;
  if (code !== undefined && code.trim() !== '') {
    out += `\n  ${code}`;
    if (error.col) out += `\n  ${' '.repeat(Math.max(0, error.col - 1))}^`;
  }
  return out;
}

// Edit distance, used for "Did you mean ...?" hints.
export function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

export function suggest(word, candidates) {
  let best = null;
  let bestScore = Infinity;
  const limit = word.length <= 3 ? 1 : 2;
  for (const c of candidates) {
    const d = distance(word.toLowerCase(), c.toLowerCase());
    if (d < bestScore && d <= limit) {
      best = c;
      bestScore = d;
    }
  }
  return best;
}
