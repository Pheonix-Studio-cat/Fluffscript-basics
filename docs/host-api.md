# Host API — running FluffScript inside your own program

The interpreter never touches a screen, keyboard or console itself. Everything
that leaves or enters a program goes through a **host**: a plain object you
pass in. The command line (`bin/fluff.js`), the playground and the tests are
all just hosts. A game engine is another one.

This file is the contract. `tests/host-api.test.js` checks every statement in
it, and fails if the interpreter calls a host function that is not listed here.

## Running a program

```js
import { run, FluffError, formatError, StopSignal } from './src/index.js';

const host = { say: (text) => console.log(text) };
try {
  const { picture } = await run('say "Hi"', host);
} catch (error) {
  if (error instanceof FluffError) console.error(formatError(error, source));
  else if (error instanceof StopSignal) { /* the host asked to stop */ }
  else throw error; // a bug in FluffScript itself
}
```

`run(source, host, options)` returns a promise:

| Outcome | Result |
| --- | --- |
| the program ends, or runs `stop` | resolves `{ picture }` |
| a mistake in the program | rejects with a `FluffError` (`message`, `line`, `col`); `formatError(error, source)` adds the code line and a `^` |
| `host.shouldStop()` returned `true` | rejects with a `StopSignal` |

`source` may also be a tree from `parse(source)`. `new Interpreter(host,
options).run(source)` does the same as `run` and keeps the interpreter around.

### Options

| Option | Default | Meaning |
| --- | --- | --- |
| `maxSteps` | `Infinity` | stop with a `FluffError` ("ran for too long") after this many steps |
| `yieldEvery` | `1000` | give the event loop a turn (`setTimeout 0`) every this many steps, so a UI stays responsive and `shouldStop` can be clicked |
| `random` | `Math.random` | number source for `random(a, b)`; pass a fixed function for repeatable tests |

## The host

Every function is optional. The table says what happens without it.

| Function | Called when | Without it |
| --- | --- | --- |
| `say(text)` | `say` runs; `text` is already a string. May return a promise, which is awaited. | the text is dropped |
| `ask(question)` | `ask` runs. Return the answer as a string, or a promise of one. An answer that looks like a number becomes a number. | `ask` is a `FluffError` |
| `wait(seconds)` | `wait` runs (after `render`). Return a promise. | no pause |
| `frame()` | after every round of `repeat forever`, after `render`. Return a promise that resolves at the next screen frame (about 60 per second). | `wait(1 / 60)`, or no pause if `wait` is missing too |
| `render(picture)` | after a drawing command, `show`, a new sprite, before `wait`, every frame and at `stop`. Property changes like `cat.x += 5` are not rendered by themselves; they appear at the next render. Called often: draw on the next animation frame, not every time. It can come before anything is drawn (after `color`, say); `picture.used` tells. | nothing is shown |
| `key(name)` | `key "..."` is evaluated. `name` is lower case and one of `KEY_NAMES`. Return `true` while the key is held. | always `false` |
| `usesKeys()` | every time a program evaluates `key "..."`. A host can show on-screen buttons. | — |
| `takeTaps()` | once per frame. Return the taps since the last call, as `[{ x, y }]` in picture coordinates. `sprite tapped` checks this list. | no taps |
| `pointer()` | `touch_x`, `touch_y` or `touching` is read. Return `{ x, y, down }` in picture coordinates. | `{ x: 0, y: 0, down: false }` |
| `shouldStop()` | before every statement and after every `ask`, `wait` and `frame`. Return `true` to stop the program. | runs until it ends |

`KEY_NAMES` lists the key names: `left right up down space enter`, `a`–`z`,
`0`–`9`.

## The picture

`render` receives the interpreter's live `Picture`. Read it, don't change it.

| Field | Meaning |
| --- | --- |
| `width`, `height` | size in pixels (starts 400 × 400) |
| `background` | color of the whole picture |
| `shapes` | drawn shapes in order: `{ type, …, color, thickness }` with `type` `circle` (`x y radius`), `rect` (`x y width height`), `line` (`x1 y1 x2 y2`), `triangle` (`x1 y1 x2 y2 x3 y3`) or `text` (`words x y size`) |
| `sprites` | `Sprite` objects in creation order |
| `status` | the text from `show`, drawn top left (empty: nothing) |
| `used` | `true` once the program drew anything; a host can hide the picture until then |

`picture.toSVG()` returns the whole picture as SVG text.
`paint(picture, ctx, getImage)` draws it on a canvas 2D context; `getImage(name)`
returns a loaded image for a picture file, or `null` while it loads.

A `Sprite` has `image`, `x`, `y` (its middle), `size`, `angle` (degrees) and
`hidden`. `box()` gives `[left, top, right, bottom]`, `touches(other)` and
`contains(x, y)` are the checks the language uses. `isImageFile(name)` tells a
picture file (`.png` … or a web address) from an emoji.

Colors in the picture are already normalized: a CSS color name in lower case
or a `#` code (`normalizeColor` does this).
