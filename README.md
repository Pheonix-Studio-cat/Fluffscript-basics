# FluffScript

An easy programming language for beginners and kids — simpler than Python,
with drawing and games built in. Still in development.

```
cat = sprite "🐱", 200, 540
star = sprite "⭐", 100, 0
score = 0

repeat forever
  if key "left"
    cat.x -= 5
  end
  if key "right"
    cat.x += 5
  end

  star.y += 3
  if cat touches star
    score += 1
    star.y = 0
  end

  show "Score: {score}"
end
```

- Reads like English: `repeat 3 times`, `for each fruit in fruits`, `if cat touches star`
- No `{ }` blocks, no `;`, no imports, no setup — blocks end with `end`
- Friendly errors: *Line 3: I don't know `nmae`. Did you mean `name`?*
- Games: sprites, keys, taps, collisions, a game loop at 60 frames per second
- On phones the FLUFFSCRIPT ENGINE shows arrow buttons automatically

**Language reference:** [SPEC.md](SPEC.md) · **Examples:** [examples/](examples/)

## Run it

First, once (Node 18+):

```
npm install          # fetches the FluffScript engine
```

**FLUFFSCRIPT ENGINE** — the editor in the browser, laid out like a game engine (project, hierarchy, script, game view, console; **New / Open / Save**
work with `.fluff` files):

```
npm run build        # writes dist/playground.html — open it in a browser
```

Command line:

```
node bin/fluff.js examples/hello.fluff
node bin/fluff.js examples/house.fluff      # saves the picture as examples/house.svg
```

Tests:

```
npm test
```

## How it works

The language runs on the **[FluffScript engine](https://github.com/Pheonix-Studio-cat/Fluffscript-engine)**
(lexer, parser, interpreter, graphics). This repo is everything around it:

| File | Job |
| --- | --- |
| `SPEC.md` | the language reference |
| `examples/` | example programs and games |
| `bin/fluff.js` | command line |
| `playground/` | the FLUFFSCRIPT ENGINE editor in the browser |
| `scripts/build-playground.js` | packs the editor, the engine and the examples into one HTML file |

## Status

Version 0.2 — in development. Next: modules and a standard library (files, web) for tools and servers.

## License

[AGPL-3.0](LICENSE)
