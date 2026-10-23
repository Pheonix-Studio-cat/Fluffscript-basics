# FluffScript

An easy programming language for beginners and kids — with simple graphics
built in.

```
say "Hello, world!"

name = ask "What's your name?"
say "Hi " + name

repeat 3 times
  say "Fluff!"
end

canvas 400, 300
background "skyblue"
color "gold"
circle 340, 60, 35
```

- Reads like English: `repeat 3 times`, `for each fruit in fruits`
- No `{ }`, no `;` — blocks end with `end`
- Friendly errors: *Line 3: I don't know `nmae`. Did you mean `name`?*
- Draw circles, rectangles, lines, triangles and text, and animate them

**Language reference:** [SPEC.md](SPEC.md) · **Examples:** [examples/](examples/)

## Run it

Playground (editor, picture and console in the browser):

```
npm run build        # writes dist/playground.html — open it in a browser
```

Command line (Node 18+):

```
node bin/fluff.js examples/hello.fluff
node bin/fluff.js examples/house.fluff      # saves the picture as examples/house.svg
```

Tests:

```
npm test
```

## How it works

| File | Job |
| --- | --- |
| `src/lexer.js` | cuts the text into tokens |
| `src/parser.js` | builds a tree from the tokens |
| `src/interpreter.js` | runs the tree |
| `src/graphics.js` | the picture, as SVG or on a canvas |
| `src/errors.js` | friendly errors and "Did you mean …?" |
| `bin/fluff.js` | command line |
| `playground/` | the browser playground |

## Status

Version 0.1 — work in progress.

## License

[AGPL-3.0](LICENSE)
