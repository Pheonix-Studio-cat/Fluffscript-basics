// The interpreter walks the tree from the parser and runs it.
//
// It never talks to the screen directly. Everything that leaves the program
// goes through a `host`: `say`, `ask`, `wait` and drawing. That way the same
// interpreter runs on the command line, in the browser and in the tests.

import { FluffError, suggest } from './errors.js';
import { parse } from './parser.js';
import { Picture, normalizeColor, COLOR_NAMES } from './graphics.js';

const MAX_CALL_DEPTH = 1000;
const TEXT_SIZE = 20;

class ReturnSignal {
  constructor(value) { this.value = value; }
}

export class StopSignal extends Error {
  constructor() { super('Stopped.'); this.name = 'StopSignal'; }
}

class Scope {
  constructor(parent = null) {
    this.vars = new Map();
    this.parent = parent;
  }
  find(name) {
    for (let s = this; s; s = s.parent) if (s.vars.has(name)) return s;
    return null;
  }
  get(name) {
    const s = this.find(name);
    return s ? { found: true, value: s.vars.get(name) } : { found: false };
  }
  // A name that already exists somewhere outside is changed there; a new
  // name is created right here.
  set(name, value) {
    (this.find(name) || this).vars.set(name, value);
  }
  define(name, value) { this.vars.set(name, value); }
  names() {
    const all = new Set();
    for (let s = this; s; s = s.parent) for (const k of s.vars.keys()) all.add(k);
    return all;
  }
}

class FluffFunction {
  constructor(node, scope) {
    this.name = node.name;
    this.params = node.params;
    this.body = node.body;
    this.scope = scope;
  }
}

class Builtin {
  constructor(name, params, fn) {
    this.name = name;
    this.params = params;
    this.fn = fn;
  }
}

// ---- how values look when they are shown ----

export function show(value, nested = false) {
  if (value === null || value === undefined) return 'nothing';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return String(value);
    if (!Number.isFinite(value)) return String(value);
    return String(parseFloat(value.toPrecision(12)));
  }
  if (typeof value === 'string') return nested ? JSON.stringify(value) : value;
  if (Array.isArray(value)) return `[${value.map((v) => show(v, true)).join(', ')}]`;
  if (value instanceof FluffFunction || value instanceof Builtin) return `function ${value.name}`;
  return String(value);
}

function kind(value) {
  if (value === null || value === undefined) return 'nothing';
  if (typeof value === 'number') return 'a number';
  if (typeof value === 'string') return 'a text';
  if (typeof value === 'boolean') return `\`${value}\``;
  if (Array.isArray(value)) return 'a list';
  return 'a function';
}

function describeValue(value) {
  if (typeof value === 'string') return `the text ${JSON.stringify(value)}`;
  if (typeof value === 'number') return `the number ${show(value)}`;
  return kind(value);
}

function truthy(value) {
  return !(value === false || value === null || value === undefined || value === 0 || value === '');
}

function equal(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => equal(x, b[i]));
  }
  return a === b;
}

function readAnswer(text) {
  const s = String(text ?? '');
  return /^\s*-?\d+(\.\d+)?\s*$/.test(s) ? Number(s) : s;
}

// ---- the interpreter ----

export class Interpreter {
  constructor(host = {}, options = {}) {
    this.host = host;
    this.maxSteps = options.maxSteps ?? Infinity;
    this.yieldEvery = options.yieldEvery ?? 1000;
    this.random = options.random ?? Math.random;
    this.steps = 0;
    this.depth = 0;
    this.picture = new Picture();
    this.globals = new Scope();
    this.builtins = this.makeBuiltins();
  }

  async run(source) {
    const program = typeof source === 'string' ? parse(source) : source;
    // Functions written anywhere at the top level can be used from the start.
    for (const stmt of program.body) {
      if (stmt.type === 'Function') this.globals.define(stmt.name, new FluffFunction(stmt, this.globals));
    }
    await this.block(program.body, this.globals);
    return { picture: this.picture };
  }

  async step(node) {
    this.steps++;
    if (this.host.shouldStop && this.host.shouldStop()) throw new StopSignal();
    if (this.steps > this.maxSteps) {
      throw new FluffError('Your program ran for too long, so I stopped it. Is there a loop that never ends?', node.line, node.col);
    }
    if (this.steps % this.yieldEvery === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (this.host.shouldStop && this.host.shouldStop()) throw new StopSignal();
    }
  }

  async block(statements, scope) {
    for (const stmt of statements) await this.execute(stmt, scope);
  }

  async execute(node, scope) {
    await this.step(node);
    switch (node.type) {
      case 'Assign':
        scope.set(node.name, await this.evaluate(node.value, scope));
        return;

      case 'SetIndex': {
        const target = await this.evaluate(node.target, scope);
        const index = await this.evaluate(node.index, scope);
        const value = await this.evaluate(node.value, scope);
        if (!Array.isArray(target)) {
          throw new FluffError(`Only list items can be changed this way, but this is ${kind(target)}.`, node.line, node.col);
        }
        target[this.position(target, index, node) - 1] = value;
        return;
      }

      case 'ExprStatement':
        await this.evaluate(node.expr, scope);
        return;

      case 'Command':
        await this.command(node, scope);
        return;

      case 'If':
        if (truthy(await this.evaluate(node.test, scope))) await this.block(node.then, scope);
        else if (node.otherwise) await this.block(node.otherwise, scope);
        return;

      case 'Repeat': {
        if (node.count === null) {
          while (true) {
            await this.step(node);
            await this.block(node.body, scope);
          }
        }
        const count = await this.evaluate(node.count, scope);
        if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) {
          throw new FluffError(`\`repeat\` needs a number of times, but got ${describeValue(count)}.`, node.line, node.col);
        }
        for (let i = 0; i < Math.floor(count); i++) await this.block(node.body, scope);
        return;
      }

      case 'While':
        while (truthy(await this.evaluate(node.test, scope))) {
          await this.step(node);
          await this.block(node.body, scope);
        }
        return;

      case 'ForEach': {
        const list = await this.evaluate(node.list, scope);
        let items;
        if (Array.isArray(list)) items = [...list];
        else if (typeof list === 'string') items = [...list];
        else throw new FluffError(`\`for each\` needs a list or a text, but got ${describeValue(list)}.`, node.line, node.col);
        for (const item of items) {
          scope.set(node.name, item);
          await this.block(node.body, scope);
        }
        return;
      }

      case 'ForRange': {
        const from = await this.evaluate(node.from, scope);
        const to = await this.evaluate(node.to, scope);
        for (const [label, v] of [['from', from], ['to', to]]) {
          if (typeof v !== 'number' || !Number.isFinite(v)) {
            throw new FluffError(`\`${label}\` needs a number, but got ${describeValue(v)}.`, node.line, node.col);
          }
        }
        const stepBy = from <= to ? 1 : -1;
        for (let i = from; stepBy > 0 ? i <= to : i >= to; i += stepBy) {
          scope.set(node.name, i);
          await this.block(node.body, scope);
        }
        return;
      }

      case 'Function':
        scope.set(node.name, new FluffFunction(node, scope));
        return;

      case 'Return':
        throw new ReturnSignal(node.value ? await this.evaluate(node.value, scope) : null);

      default:
        throw new FluffError(`Unknown statement ${node.type}.`, node.line, node.col);
    }
  }

  async evaluate(node, scope) {
    switch (node.type) {
      case 'Literal':
        return node.value;

      case 'List': {
        const items = [];
        for (const item of node.items) items.push(await this.evaluate(item, scope));
        return items;
      }

      case 'Name': {
        const r = scope.get(node.name);
        if (r.found) return r.value;
        if (Object.hasOwn(this.builtins, node.name)) return this.builtins[node.name];
        throw this.unknownName(node, scope);
      }

      case 'Ask': {
        const question = node.question ? show(await this.evaluate(node.question, scope)) : '';
        if (!this.host.ask) throw new FluffError('`ask` doesn\'t work here, there is no one to answer.', node.line, node.col);
        const answer = await this.host.ask(question);
        if (this.host.shouldStop && this.host.shouldStop()) throw new StopSignal();
        return readAnswer(answer);
      }

      case 'Not':
        return !truthy(await this.evaluate(node.value, scope));

      case 'Negate': {
        const v = await this.evaluate(node.value, scope);
        if (typeof v !== 'number') throw new FluffError(`I can only put a minus in front of a number, not in front of ${describeValue(v)}.`, node.line, node.col);
        return -v;
      }

      case 'Logical': {
        const left = await this.evaluate(node.left, scope);
        if (node.op === 'and') return truthy(left) ? truthy(await this.evaluate(node.right, scope)) : false;
        return truthy(left) ? true : truthy(await this.evaluate(node.right, scope));
      }

      case 'Binary':
        return this.binary(node, await this.evaluate(node.left, scope), await this.evaluate(node.right, scope));

      case 'Index': {
        const target = await this.evaluate(node.target, scope);
        const index = await this.evaluate(node.index, scope);
        if (!Array.isArray(target) && typeof target !== 'string') {
          throw new FluffError(`Only lists and texts have items, but this is ${kind(target)}.`, node.line, node.col);
        }
        const p = this.position(target, index, node);
        return Array.isArray(target) ? target[p - 1] : [...target][p - 1];
      }

      case 'Call':
        return this.call(node, scope);

      default:
        throw new FluffError(`Unknown expression ${node.type}.`, node.line, node.col);
    }
  }

  // Lists start at 1: the first item is list[1].
  position(target, index, node) {
    const size = Array.isArray(target) ? target.length : [...target].length;
    if (typeof index !== 'number' || !Number.isInteger(index)) {
      throw new FluffError(`An item's position must be a whole number, but got ${describeValue(index)}.`, node.line, node.col);
    }
    if (index < 1 || index > size) {
      const what = Array.isArray(target) ? 'list' : 'text';
      const has = size === 0 ? `The ${what} is empty` : `The ${what} has ${size} item${size === 1 ? '' : 's'}`;
      const hint = index === 0 ? ' Positions start at 1.' : '';
      throw new FluffError(`${has}, so there is no item ${index}.${hint}`, node.line, node.col);
    }
    return index;
  }

  binary(node, a, b) {
    const fail = (msg) => { throw new FluffError(msg, node.line, node.col); };
    switch (node.op) {
      case '+':
        if (typeof a === 'number' && typeof b === 'number') return a + b;
        if (typeof a === 'string' || typeof b === 'string') return show(a) + show(b);
        if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
        return fail(`I can't add ${kind(b)} to ${kind(a)}.`);
      case '-':
        if (typeof a === 'number' && typeof b === 'number') return a - b;
        return fail(`I can only subtract numbers, not ${kind(b)} from ${kind(a)}.`);
      case '*':
        if (typeof a === 'number' && typeof b === 'number') return a * b;
        if (typeof a === 'string' && typeof b === 'number' && Number.isInteger(b) && b >= 0) return a.repeat(b);
        return fail(`I can't multiply ${kind(a)} by ${kind(b)}.`);
      case '/':
        if (typeof a === 'number' && typeof b === 'number') {
          if (b === 0) fail('You can\'t divide by zero.');
          return a / b;
        }
        return fail(`I can only divide numbers, not ${kind(a)} by ${kind(b)}.`);
      case '%':
        if (typeof a === 'number' && typeof b === 'number') {
          if (b === 0) fail('You can\'t divide by zero.');
          return ((a % b) + b) % b;
        }
        return fail(`\`%\` only works with numbers, not with ${kind(a)} and ${kind(b)}.`);
      case '==': return equal(a, b);
      case '!=': return !equal(a, b);
      case '<': case '>': case '<=': case '>=': {
        const sameKind = (typeof a === 'number' && typeof b === 'number') || (typeof a === 'string' && typeof b === 'string');
        if (!sameKind) fail(`I can't compare ${kind(a)} with ${kind(b)}.`);
        if (node.op === '<') return a < b;
        if (node.op === '>') return a > b;
        if (node.op === '<=') return a <= b;
        return a >= b;
      }
      default:
        return fail(`Unknown operator ${node.op}.`);
    }
  }

  async call(node, scope) {
    let fn;
    if (node.callee.type === 'Name') {
      const r = scope.get(node.callee.name);
      if (r.found) fn = r.value;
      else if (Object.hasOwn(this.builtins, node.callee.name)) fn = this.builtins[node.callee.name];
      else throw this.unknownName(node.callee, scope, true);
    } else {
      fn = await this.evaluate(node.callee, scope);
    }

    const args = [];
    for (const a of node.args) args.push(await this.evaluate(a, scope));

    if (!(fn instanceof FluffFunction) && !(fn instanceof Builtin)) {
      const name = node.callee.type === 'Name' ? `\`${node.callee.name}\`` : 'This';
      throw new FluffError(`${name} is ${kind(fn)}, not a function, so it can't be called with ( ).`, node.line, node.col);
    }

    if (args.length !== fn.params.length) {
      const n = fn.params.length;
      const want = n === 0 ? 'no values' : `${n} value${n === 1 ? '' : 's'} (${fn.params.join(', ')})`;
      throw new FluffError(`\`${fn.name}\` needs ${want}, but got ${args.length}.`, node.line, node.col);
    }

    if (fn instanceof Builtin) return fn.fn(args, node);

    if (this.depth >= MAX_CALL_DEPTH) {
      throw new FluffError(`\`${fn.name}\` called itself too many times. Does it ever stop?`, node.line, node.col);
    }
    const local = new Scope(fn.scope);
    fn.params.forEach((p, i) => local.define(p, args[i]));
    this.depth++;
    try {
      await this.block(fn.body, local);
      return null;
    } catch (e) {
      if (e instanceof ReturnSignal) return e.value;
      throw e;
    } finally {
      this.depth--;
    }
  }

  unknownName(node, scope, asFunction = false) {
    const candidates = [...scope.names(), ...Object.keys(this.builtins)];
    const guess = suggest(node.name, candidates);
    const what = asFunction ? `a function called \`${node.name}\`` : `\`${node.name}\``;
    let msg = `I don't know ${what}.`;
    if (guess) msg += ` Did you mean \`${guess}\`?`;
    else if (!asFunction) msg += ' Give it a value first, like this: ' + node.name + ' = 5';
    return new FluffError(msg, node.line, node.col);
  }

  // ---- commands ----

  async command(node, scope) {
    const args = [];
    for (const a of node.args) args.push(await this.evaluate(a, scope));
    const pic = this.picture;
    const fail = (msg) => { throw new FluffError(msg, node.line, node.col); };
    const num = (i, label) => {
      const v = args[i];
      if (typeof v !== 'number' || !Number.isFinite(v)) fail(`\`${node.name}\` needs a number for ${label}, but got ${describeValue(v)}.`);
      return v;
    };
    const color = (i) => {
      const c = normalizeColor(args[i]);
      if (c) return c;
      let msg = `I don't know the color ${describeValue(args[i])}.`;
      const guess = typeof args[i] === 'string' ? suggest(args[i].toLowerCase(), COLOR_NAMES) : null;
      msg += guess ? ` Did you mean "${guess}"?` : ' Try a name like "red" or a code like "#ff8800".';
      return fail(msg);
    };

    switch (node.name) {
      case 'say':
        if (this.host.say) await this.host.say(args.length ? show(args[0]) : '');
        return;
      case 'wait': {
        const s = num(0, 'seconds');
        if (s < 0) fail('`wait` can\'t wait less than 0 seconds.');
        if (this.host.render && pic.used) this.host.render(pic);
        if (this.host.wait) await this.host.wait(s);
        if (this.host.shouldStop && this.host.shouldStop()) throw new StopSignal();
        return;
      }
      case 'canvas': {
        const w = num(0, 'width');
        const h = num(1, 'height');
        if (w < 1 || h < 1 || w > 2000 || h > 2000) fail('The canvas must be between 1 and 2000 pixels wide and high.');
        pic.width = w;
        pic.height = h;
        pic.used = true;
        break;
      }
      case 'background':
        pic.background = color(0);
        pic.used = true;
        break;
      case 'color':
        pic.color = color(0);
        break;
      case 'thickness': {
        const t = num(0, 'size');
        if (t < 0) fail('`thickness` can\'t be less than 0.');
        pic.thickness = t;
        break;
      }
      case 'clear':
        pic.clear();
        break;
      case 'circle':
        pic.add({ type: 'circle', x: num(0, 'x'), y: num(1, 'y'), radius: Math.max(0, num(2, 'radius')) });
        break;
      case 'rect':
        pic.add({ type: 'rect', x: num(0, 'x'), y: num(1, 'y'), width: num(2, 'width'), height: num(3, 'height') });
        break;
      case 'line':
        pic.add({ type: 'line', x1: num(0, 'x1'), y1: num(1, 'y1'), x2: num(2, 'x2'), y2: num(3, 'y2') });
        break;
      case 'triangle':
        pic.add({ type: 'triangle', x1: num(0, 'x1'), y1: num(1, 'y1'), x2: num(2, 'x2'), y2: num(3, 'y2'), x3: num(4, 'x3'), y3: num(5, 'y3') });
        break;
      case 'text':
        pic.add({ type: 'text', words: show(args[0]), x: num(1, 'x'), y: num(2, 'y'), size: TEXT_SIZE });
        break;
      default:
        fail(`Unknown command ${node.name}.`);
    }
    if (this.host.render) this.host.render(pic);
  }

  // ---- built-in functions ----

  makeBuiltins() {
    const num = (v, fn, label, node) => {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new FluffError(`\`${fn}\` needs a number for ${label}, but got ${describeValue(v)}.`, node.line, node.col);
      }
      return v;
    };
    const list = (v, fn, node) => {
      if (!Array.isArray(v)) throw new FluffError(`\`${fn}\` needs a list, but got ${describeValue(v)}.`, node.line, node.col);
      return v;
    };
    const b = (name, params, fn) => [name, new Builtin(name, params, fn)];
    return Object.fromEntries([
      b('length', ['value'], ([v], node) => {
        if (Array.isArray(v)) return v.length;
        if (typeof v === 'string') return [...v].length;
        throw new FluffError(`\`length\` needs a list or a text, but got ${describeValue(v)}.`, node.line, node.col);
      }),
      b('random', ['from', 'to'], ([a, z], node) => {
        const lo = Math.ceil(Math.min(num(a, 'random', 'from', node), num(z, 'random', 'to', node)));
        const hi = Math.floor(Math.max(a, z));
        if (hi < lo) throw new FluffError('There is no whole number between these two.', node.line, node.col);
        return lo + Math.floor(this.random() * (hi - lo + 1));
      }),
      b('round', ['number'], ([v], node) => Math.round(num(v, 'round', 'number', node))),
      b('sqrt', ['number'], ([v], node) => {
        if (num(v, 'sqrt', 'number', node) < 0) throw new FluffError('A negative number has no square root.', node.line, node.col);
        return Math.sqrt(v);
      }),
      b('abs', ['number'], ([v], node) => Math.abs(num(v, 'abs', 'number', node))),
      b('add', ['list', 'item'], ([l, item], node) => { list(l, 'add', node).push(item); return null; }),
      b('remove', ['list', 'position'], ([l, p], node) => {
        list(l, 'remove', node);
        return l.splice(this.position(l, p, node) - 1, 1)[0];
      }),
    ]);
  }
}

// Convenience: run a program with a host, return the picture.
export async function run(source, host = {}, options = {}) {
  return new Interpreter(host, options).run(source);
}
