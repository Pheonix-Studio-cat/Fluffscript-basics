// The parser turns the tokens into a tree (the AST) that the interpreter can
// walk. Every node keeps its line and column, so errors can point at it.

import { FluffError } from './errors.js';
import { tokenize } from './lexer.js';
import { COMMANDS, usage } from './commands.js';

export function parse(source) {
  return new Parser(tokenize(source)).program();
}

const ASSIGN_OPS = ['=', '+=', '-=', '*=', '/='];

const describe = (t) => {
  if (t.type === 'newline') return 'the end of the line';
  if (t.type === 'eof') return 'the end of the program';
  if (t.type === 'string') return `the text "${t.value}"`;
  if (t.type === 'template') return 'a text';
  return `\`${t.value}\``;
};

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
    this.functionDepth = 0;
  }

  // ---- token helpers ----

  peek(offset = 0) { return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)]; }
  next() { return this.tokens[this.pos++]; }
  is(type, value, offset = 0) {
    const t = this.peek(offset);
    return t.type === type && (value === undefined || t.value === value);
  }
  isKeyword(value) { return this.is('keyword', value); }
  isSymbol(value) { return this.is('symbol', value); }
  accept(type, value) {
    if (this.is(type, value)) return this.next();
    return null;
  }
  expect(type, value, message) {
    if (this.is(type, value)) return this.next();
    const t = this.peek();
    throw new FluffError(message || `I expected \`${value}\` here, but found ${describe(t)}.`, t.line, t.col);
  }
  skipNewlines() { while (this.is('newline')) this.next(); }
  endOfLine() {
    if (this.is('newline') || this.is('eof')) { this.accept('newline'); return; }
    const t = this.peek();
    if (t.type === 'symbol' && t.value === '=') {
      throw new FluffError('To compare two values, use `==`. A single `=` stores a value in a name.', t.line, t.col);
    }
    throw new FluffError(`I expected the line to end here, but found ${describe(t)}.`, t.line, t.col);
  }

  // ---- statements ----

  program() {
    const body = [];
    this.skipNewlines();
    while (!this.is('eof')) {
      body.push(this.statement());
      this.skipNewlines();
    }
    return { type: 'Program', body };
  }

  block(opener, terminators) {
    const body = [];
    this.skipNewlines();
    while (!terminators.some((k) => this.isKeyword(k))) {
      if (this.is('eof')) {
        throw new FluffError(`This \`${opener.value}\` never got its \`end\`.`, opener.line, opener.col);
      }
      body.push(this.statement());
      this.skipNewlines();
    }
    return body;
  }

  statement() {
    const t = this.peek();
    if (t.type === 'keyword') {
      switch (t.value) {
        case 'if': return this.ifStatement();
        case 'repeat': return this.repeatStatement();
        case 'while': return this.whileStatement();
        case 'for': return this.forStatement();
        case 'function': return this.functionStatement();
        case 'return': return this.returnStatement();
        case 'end':
          throw new FluffError('There is an `end` here, but nothing to end.', t.line, t.col);
        case 'else':
          throw new FluffError('There is an `else` here without an `if` before it.', t.line, t.col);
        default: break;
      }
    }

    const isAssignOp = (offset) => {
      const n = this.peek(offset);
      return n.type === 'symbol' && ASSIGN_OPS.includes(n.value);
    };

    if (t.type === 'name' && isAssignOp(1)) {
      this.next();
      const op = this.next().value;
      const value = this.expression();
      this.endOfLine();
      return { type: 'Assign', name: t.value, op, value, line: t.line, col: t.col };
    }

    // A command word starts a command, unless the line stores something:
    // `color = "red"`, `line[1] = 5`, `text.size += 1`.
    const usedAsName = (this.is('symbol', '.', 1) || this.is('symbol', '[', 1)) && this.lineAssigns();
    if (t.type === 'name' && Object.hasOwn(COMMANDS, t.value) && !usedAsName) {
      return this.command();
    }

    const expr = this.expression();
    if (isAssignOp(0)) {
      const eq = this.next();
      if (expr.type !== 'Index' && expr.type !== 'Member') {
        throw new FluffError('You can only store a value in a name, a list item or a property like cat.x.', eq.line, eq.col);
      }
      const value = this.expression();
      this.endOfLine();
      if (expr.type === 'Member') {
        return { type: 'SetMember', target: expr.target, name: expr.name, op: eq.value, value, line: eq.line, col: eq.col };
      }
      return { type: 'SetIndex', target: expr.target, index: expr.index, op: eq.value, value, line: eq.line, col: eq.col };
    }
    this.endOfLine();
    if (expr.type !== 'Call' && expr.type !== 'Ask' && expr.type !== 'Sprite') {
      throw new FluffError('This line doesn\'t do anything. Did you want to `say` it?', t.line, t.col);
    }
    return { type: 'ExprStatement', expr, line: t.line, col: t.col };
  }

  command() {
    const t = this.next();
    const spec = COMMANDS[t.value];
    let args = [];

    if (!this.is('newline') && !this.is('eof')) {
      // `circle(10, 20, 5)` is forgiven: it means the same as `circle 10, 20, 5`.
      const bracketed = t.value !== 'say' && this.isSymbol('(') ? this.tryBracketedArgs() : null;
      if (bracketed) {
        args = bracketed;
      } else {
        args.push(this.argument());
        while (this.accept('symbol', ',')) args.push(this.argument());
      }
    }
    this.endOfLine();

    const max = spec.params.length;
    const min = spec.min ?? max;
    if (args.length < min || args.length > max) {
      const got = args.length === 0 ? 'nothing' : `${args.length}`;
      const want = max === 0 ? 'nothing' : `${max} value${max === 1 ? '' : 's'}`;
      throw new FluffError(`\`${t.value}\` needs ${want}, but got ${got}. Write it like this: ${usage(t.value)}`, t.line, t.col);
    }
    return { type: 'Command', name: t.value, args, line: t.line, col: t.col };
  }

  // Does the current line contain `=` (or `+=` …) outside of brackets?
  lineAssigns() {
    let depth = 0;
    for (let k = this.pos; k < this.tokens.length; k++) {
      const t = this.tokens[k];
      if (t.type === 'newline' || t.type === 'eof') return false;
      if (t.type !== 'symbol') continue;
      if (t.value === '(' || t.value === '[') depth++;
      else if (t.value === ')' || t.value === ']') depth--;
      else if (depth === 0 && ASSIGN_OPS.includes(t.value)) return true;
    }
    return false;
  }

  commaArgs() {
    const args = [this.argument()];
    while (this.accept('symbol', ',')) args.push(this.argument());
    return args;
  }

  tryBracketedArgs(anywhere = false) {
    const start = this.pos;
    try {
      this.next();
      const args = [];
      if (!this.isSymbol(')')) {
        args.push(this.argument());
        while (this.accept('symbol', ',')) args.push(this.argument());
      }
      this.expect('symbol', ')');
      if (anywhere || this.is('newline') || this.is('eof')) return args;
    } catch (e) {
      if (!(e instanceof FluffError)) throw e;
    }
    this.pos = start;
    return null;
  }

  // A value given to a command or function. A stray `=` here almost always
  // means the writer wanted to compare.
  argument() {
    const expr = this.expression();
    if (this.isSymbol('=')) {
      const t = this.peek();
      throw new FluffError('To compare two values, use `==`. A single `=` stores a value in a name.', t.line, t.col);
    }
    return expr;
  }

  condition() {
    return this.argument();
  }

  ifStatement() {
    const opener = this.next();
    const test = this.condition();
    this.endOfLine();
    const then = this.block(opener, ['else', 'end']);
    let otherwise = null;
    if (this.accept('keyword', 'else')) {
      if (this.isKeyword('if')) {
        // `else if` shares the `end` of the whole chain.
        otherwise = [this.ifStatement()];
        return { type: 'If', test, then, otherwise, line: opener.line, col: opener.col };
      }
      this.endOfLine();
      otherwise = this.block(opener, ['end']);
    }
    this.expect('keyword', 'end');
    this.endOfLine();
    return { type: 'If', test, then, otherwise, line: opener.line, col: opener.col };
  }

  repeatStatement() {
    const opener = this.next();
    let count = null;
    if (!this.accept('keyword', 'forever')) {
      if (this.is('newline')) {
        const t = this.peek();
        throw new FluffError('How often should I repeat? Write `repeat 3 times` or `repeat forever`.', t.line, t.col);
      }
      count = this.argument();
      this.expect('keyword', 'times', `After \`repeat ...\` I expected \`times\`, like this: repeat 3 times`);
    }
    this.endOfLine();
    const body = this.block(opener, ['end']);
    this.expect('keyword', 'end');
    this.endOfLine();
    return { type: 'Repeat', count, body, line: opener.line, col: opener.col };
  }

  whileStatement() {
    const opener = this.next();
    const test = this.condition();
    this.endOfLine();
    const body = this.block(opener, ['end']);
    this.expect('keyword', 'end');
    this.endOfLine();
    return { type: 'While', test, body, line: opener.line, col: opener.col };
  }

  forStatement() {
    const opener = this.next();
    this.expect('keyword', 'each', 'After `for` comes `each`, like this: for each fruit in fruits');
    const name = this.expect('name', undefined, 'After `for each` I expected a name, like this: for each fruit in fruits');
    let node;
    if (this.accept('keyword', 'in')) {
      const list = this.argument();
      node = { type: 'ForEach', name: name.value, list };
    } else if (this.accept('name', 'from')) {
      const from = this.argument();
      this.expect('name', 'to', 'After `for each i from ...` I expected `to`, like this: for each i from 1 to 10');
      const to = this.argument();
      node = { type: 'ForRange', name: name.value, from, to };
    } else {
      const t = this.peek();
      throw new FluffError('I expected `in` or `from` here, like this: for each fruit in fruits — or: for each i from 1 to 10', t.line, t.col);
    }
    this.endOfLine();
    node.body = this.block(opener, ['end']);
    this.expect('keyword', 'end');
    this.endOfLine();
    return { ...node, line: opener.line, col: opener.col };
  }

  functionStatement() {
    const opener = this.next();
    const name = this.expect('name', undefined, 'After `function` I expected its name, like this: function greet(who)');
    if (Object.hasOwn(COMMANDS, name.value)) {
      throw new FluffError(`\`${name.value}\` is already a FluffScript command. Pick another name for your function.`, name.line, name.col);
    }
    this.expect('symbol', '(', `After the function name I expected \`(\`, like this: function ${name.value}()`);
    const params = [];
    if (!this.isSymbol(')')) {
      do {
        const p = this.expect('name', undefined, 'I expected the name of a value the function takes.');
        params.push(p.value);
      } while (this.accept('symbol', ','));
    }
    this.expect('symbol', ')');
    this.endOfLine();
    this.functionDepth++;
    const body = this.block(opener, ['end']);
    this.functionDepth--;
    this.expect('keyword', 'end');
    this.endOfLine();
    return { type: 'Function', name: name.value, params, body, line: opener.line, col: opener.col };
  }

  returnStatement() {
    const t = this.next();
    if (this.functionDepth === 0) {
      throw new FluffError('`return` only works inside a function.', t.line, t.col);
    }
    let value = null;
    if (!this.is('newline') && !this.is('eof')) value = this.expression();
    this.endOfLine();
    return { type: 'Return', value, line: t.line, col: t.col };
  }

  // ---- expressions, from loosest to tightest ----

  expression() { return this.or(); }

  or() {
    let left = this.and();
    while (this.isKeyword('or')) {
      const op = this.next();
      left = { type: 'Logical', op: 'or', left, right: this.and(), line: op.line, col: op.col };
    }
    return left;
  }

  and() {
    let left = this.not();
    while (this.isKeyword('and')) {
      const op = this.next();
      left = { type: 'Logical', op: 'and', left, right: this.not(), line: op.line, col: op.col };
    }
    return left;
  }

  not() {
    if (this.isKeyword('not')) {
      const op = this.next();
      return { type: 'Not', value: this.not(), line: op.line, col: op.col };
    }
    return this.comparison();
  }

  comparison() {
    let left = this.additive();
    const ops = ['==', '!=', '<', '>', '<=', '>='];
    if (this.is('symbol') && ops.includes(this.peek().value)) {
      const op = this.next();
      left = { type: 'Binary', op: op.value, left, right: this.additive(), line: op.line, col: op.col };
    } else if (this.isKeyword('touches')) {
      const op = this.next();
      left = { type: 'Touches', left, right: this.additive(), line: op.line, col: op.col };
    }
    return left;
  }

  additive() {
    let left = this.multiplicative();
    while (this.isSymbol('+') || this.isSymbol('-')) {
      const op = this.next();
      left = { type: 'Binary', op: op.value, left, right: this.multiplicative(), line: op.line, col: op.col };
    }
    return left;
  }

  multiplicative() {
    let left = this.unary();
    while (this.isSymbol('*') || this.isSymbol('/') || this.isSymbol('%')) {
      const op = this.next();
      left = { type: 'Binary', op: op.value, left, right: this.unary(), line: op.line, col: op.col };
    }
    return left;
  }

  unary() {
    if (this.isSymbol('-')) {
      const op = this.next();
      return { type: 'Negate', value: this.unary(), line: op.line, col: op.col };
    }
    return this.postfix();
  }

  postfix() {
    let expr = this.primary();
    while (true) {
      if (this.isSymbol('(')) {
        const open = this.next();
        const args = [];
        if (!this.isSymbol(')')) {
          args.push(this.argument());
          while (this.accept('symbol', ',')) args.push(this.argument());
        }
        this.expect('symbol', ')', 'I expected `)` to close the brackets of this call.');
        expr = { type: 'Call', callee: expr, args, line: open.line, col: open.col };
      } else if (this.isSymbol('[')) {
        const open = this.next();
        const index = this.argument();
        this.expect('symbol', ']', 'I expected `]` here.');
        expr = { type: 'Index', target: expr, index, line: open.line, col: open.col };
      } else if (this.isSymbol('.')) {
        const dot = this.next();
        const name = this.peek();
        if (name.type !== 'name' && name.type !== 'keyword') {
          throw new FluffError('After the . I expected the name of a property, like cat.x', name.line, name.col);
        }
        this.next();
        expr = { type: 'Member', target: expr, name: name.value, line: dot.line, col: dot.col };
      } else if (this.isKeyword('tapped')) {
        const t = this.next();
        expr = { type: 'Tapped', target: expr, line: t.line, col: t.col };
      } else {
        return expr;
      }
    }
  }

  primary() {
    const t = this.peek();
    if (t.type === 'number' || t.type === 'string') {
      this.next();
      return { type: 'Literal', value: t.value, line: t.line, col: t.col };
    }
    if (t.type === 'template') {
      this.next();
      const parts = t.value.map((part) => {
        if (typeof part === 'string') return part;
        const inner = new Parser(tokenize(part.code, part.line, part.col));
        const expr = inner.argument();
        if (!inner.is('newline') && !inner.is('eof')) {
          const bad = inner.peek();
          throw new FluffError(`Inside { } I expected one value, but found ${describe(bad)}.`, bad.line, bad.col);
        }
        return expr;
      });
      return { type: 'Template', parts, line: t.line, col: t.col };
    }
    if (t.type === 'name') {
      this.next();
      return { type: 'Name', name: t.value, line: t.line, col: t.col };
    }
    if (t.type === 'keyword') {
      if (t.value === 'true' || t.value === 'false') {
        this.next();
        return { type: 'Literal', value: t.value === 'true', line: t.line, col: t.col };
      }
      if (t.value === 'nothing') {
        this.next();
        return { type: 'Literal', value: null, line: t.line, col: t.col };
      }
      if (t.value === 'sprite') {
        this.next();
        const start = this.pos;
        let args = this.isSymbol('(') ? this.tryBracketedArgs(true) : null;
        if (!args || args.length !== 3) {
          this.pos = start;
          args = this.commaArgs();
        }
        if (args.length !== 3) {
          throw new FluffError(`\`sprite\` needs 3 values (picture, x, y), but got ${args.length}. Write it like this: sprite "⭐", 100, 50`, t.line, t.col);
        }
        return { type: 'Sprite', args, line: t.line, col: t.col };
      }
      if (t.value === 'key') {
        this.next();
        if (this.is('newline') || this.is('eof')) {
          throw new FluffError('Which key? Write it like this: key "left"', t.line, t.col);
        }
        return { type: 'Key', name: this.additive(), line: t.line, col: t.col };
      }
      if (t.value === 'ask') {
        this.next();
        let question = null;
        if (!this.is('newline') && !this.is('eof') && !this.isSymbol(')') && !this.isSymbol(',')) {
          question = this.additive();
        }
        return { type: 'Ask', question, line: t.line, col: t.col };
      }
    }
    if (t.type === 'symbol' && t.value === '(') {
      this.next();
      const expr = this.argument();
      this.expect('symbol', ')', 'I expected `)` to close the brackets.');
      return expr;
    }
    if (t.type === 'symbol' && t.value === '[') {
      this.next();
      const items = [];
      this.skipNewlines();
      if (!this.isSymbol(']')) {
        items.push(this.argument());
        this.skipNewlines();
        while (this.accept('symbol', ',')) {
          this.skipNewlines();
          items.push(this.argument());
          this.skipNewlines();
        }
      }
      this.expect('symbol', ']', 'I expected `]` to close the list.');
      return { type: 'List', items, line: t.line, col: t.col };
    }
    if (t.type === 'keyword') {
      throw new FluffError(`\`${t.value}\` is a FluffScript word and can't be used here.`, t.line, t.col);
    }
    throw new FluffError(`I expected a value here, but found ${describe(t)}.`, t.line, t.col);
  }
}
