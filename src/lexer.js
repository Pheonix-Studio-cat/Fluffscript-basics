// The lexer cuts the program text into tokens: numbers, texts, names,
// symbols and line breaks. Line breaks matter in FluffScript because every
// statement sits on its own line.

import { FluffError } from './errors.js';

export const KEYWORDS = new Set([
  'if', 'else', 'end', 'repeat', 'times', 'forever', 'while', 'for', 'each', 'in',
  'function', 'return', 'and', 'or', 'not', 'true', 'false', 'nothing', 'ask',
]);

const SYMBOLS = ['==', '!=', '<=', '>=', '+', '-', '*', '/', '%', '<', '>', '=', '(', ')', '[', ']', ','];

export function tokenize(source) {
  const tokens = [];
  let i = 0;
  let line = 1;
  let col = 1;

  const push = (type, value, l, c) => tokens.push({ type, value, line: l, col: c });
  const advance = (n = 1) => {
    for (let k = 0; k < n; k++) {
      if (source[i] === '\n') { line++; col = 1; } else { col++; }
      i++;
    }
  };

  while (i < source.length) {
    const ch = source[i];

    if (ch === ' ' || ch === '\t' || ch === '\r') { advance(); continue; }

    if (ch === '#') {
      while (i < source.length && source[i] !== '\n') advance();
      continue;
    }

    if (ch === '\n') {
      push('newline', '\n', line, col);
      advance();
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(source[i + 1] || ''))) {
      const l = line, c = col;
      let text = '';
      while (i < source.length && /[0-9]/.test(source[i])) { text += source[i]; advance(); }
      if (source[i] === '.' && /[0-9]/.test(source[i + 1] || '')) {
        text += '.'; advance();
        while (i < source.length && /[0-9]/.test(source[i])) { text += source[i]; advance(); }
      }
      if (/[A-Za-z_]/.test(source[i] || '')) {
        throw new FluffError('A name can\'t start with a number.', l, c);
      }
      push('number', Number(text), l, c);
      continue;
    }

    if (ch === '"' || ch === '\'') {
      const quote = ch;
      const l = line, c = col;
      advance();
      let text = '';
      while (true) {
        if (i >= source.length || source[i] === '\n') {
          throw new FluffError(`This text never ends. Add a closing ${quote} at the end.`, l, c);
        }
        const s = source[i];
        if (s === quote) { advance(); break; }
        if (s === '\\') {
          const next = source[i + 1];
          if (next === 'n') text += '\n';
          else if (next === 't') text += '\t';
          else if (next === undefined) text += '\\';
          else text += next;
          advance(next === undefined ? 1 : 2);
          continue;
        }
        text += s;
        advance();
      }
      push('string', text, l, c);
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      const l = line, c = col;
      let word = '';
      while (i < source.length && /[A-Za-z0-9_]/.test(source[i])) { word += source[i]; advance(); }
      push(KEYWORDS.has(word) ? 'keyword' : 'name', word, l, c);
      continue;
    }

    const symbol = SYMBOLS.find((s) => source.startsWith(s, i));
    if (symbol) {
      push('symbol', symbol, line, col);
      advance(symbol.length);
      continue;
    }

    if (ch === '{' || ch === '}' || ch === ';') {
      throw new FluffError(`FluffScript doesn't need \`${ch}\`. Blocks end with \`end\`, and every statement goes on its own line.`, line, col);
    }
    throw new FluffError(`I don't understand the character \`${ch}\`.`, line, col);
  }

  push('newline', '\n', line, col);
  push('eof', null, line, col);
  return tokens;
}
