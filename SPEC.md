# FluffScript language reference (v0.1)

FluffScript is a programming language for beginners and kids. It reads close
to plain English, has friendly error messages, and can draw pictures.

```
say "Hello, world!"
```

## Design goals

1. **Readable.** `repeat 3 times`, `for each fruit in fruits`.
2. **Few symbols.** No `{ }`, no `;`, no `var`. Blocks end with `end`.
3. **Friendly errors.** Every error says where it happened, what went wrong
   and, where possible, how to fix it ("Did you mean `name`?").
4. **Pictures from the first lesson.** Drawing is built in.

## Programs and lines

Every statement goes on its own line. Indentation is optional but makes
programs easier to read. `#` starts a comment that runs to the end of the line.

## Values

| Kind | Examples |
| --- | --- |
| number | `5`, `-2`, `3.14` |
| text | `"Hello"`, `'it is "fun"'` — `\n` is a line break, `\"` a quote |
| true / false | `true`, `false` |
| list | `[1, 2, 3]`, `["red", "green"]`, `[]` |
| nothing | `nothing` |

Lists can span several lines.

## Names

```
age = 10
age = age + 1
```

`=` stores a value in a name. A name starts with a letter or `_` and may
contain letters, digits and `_`. Names are case-sensitive.

Reserved words: `if else end repeat times forever while for each in function
return and or not true false nothing ask`.

Command words (`say`, `color`, `line`, …) are *not* reserved: `color = "red"`
is allowed. A line that starts with a command word and no `=` is a command.

## Operators

From loosest to tightest:

| Operators | Meaning |
| --- | --- |
| `or` | either side is true |
| `and` | both sides are true |
| `not` | the opposite |
| `== != < > <= >=` | compare |
| `+ -` | add, subtract |
| `* / %` | multiply, divide, remainder |
| `-x` | minus |
| `f(x)`, `list[i]` | call, item |

- `+` with a text on either side joins as text: `"Age: " + 10` → `Age: 10`.
- `+` on two lists joins the lists.
- `"ha" * 3` → `hahaha`.
- `==` compares values, lists item by item. A number is never equal to a text.
- `<`, `>` etc. compare two numbers or two texts.
- `%` always gives a result between 0 and the divisor.
- Dividing by zero is an error.

**Truth:** `false`, `nothing`, `0` and `""` count as false; everything else
counts as true.

## Output and input

```
say "Hi"            # prints a line
say                 # prints an empty line
name = ask "Name?"  # asks, waits for the answer
```

`ask` gives back a number if the answer looks like a number (`"12"` → `12`),
otherwise a text. So `guess = ask "Guess?"` can be compared with a number
directly.

## Decisions

```
if score > 10
  say "Great!"
else if score > 5
  say "Good."
else
  say "Keep going."
end
```

`else if` chains share one `end`.

## Loops

```
repeat 3 times
  say "Hip hip hooray!"
end

repeat forever       # until the program is stopped
  ...
end

while lives > 0
  ...
end

for each fruit in ["apple", "pear"]
  say fruit
end

for each letter in "cat"   # texts work too
  say letter
end

for each i from 1 to 10    # counts down if the first number is bigger
  say i
end
```

## Functions

```
function greet(who)
  say "Hello " + who
end

function square(n)
  return n * n
end

greet("Mia")
say square(4)
```

- Functions written at the top level can be used anywhere, even above them.
- A function without `return` gives back `nothing`.
- Inside a function, storing into a name that already exists outside changes
  that outer name. A new name stays inside the function.
- A function may call itself; after 1000 nested calls FluffScript stops with
  an error.

## Lists

```
fruits = ["apple", "pear"]
say fruits[1]          # apple — the first item is number 1
fruits[2] = "plum"
add(fruits, "kiwi")
say length(fruits)     # 3
remove(fruits, 1)      # removes and gives back the item
```

Texts have items too: `"cat"[1]` is `"c"`.

## Built-in functions

| Function | Result |
| --- | --- |
| `length(x)` | number of items in a list or letters in a text |
| `random(a, b)` | a whole number from `a` to `b`, both included |
| `round(n)`, `sqrt(n)`, `abs(n)` | rounded, square root, without minus |
| `add(list, item)` | puts the item at the end of the list |
| `remove(list, position)` | takes the item out and gives it back |

## Drawing

The picture starts 400 × 400 pixels, white, with black as the color.
Coordinates start in the **top left corner**: `x` grows to the right, `y`
grows downwards.

| Command | Does |
| --- | --- |
| `canvas width, height` | sets the picture size (1–2000) |
| `background color` | paints the whole picture |
| `color color` | picks the color for everything drawn next |
| `thickness size` | line thickness (starts at 2) |
| `circle x, y, radius` | filled circle around `x, y` |
| `rect x, y, width, height` | filled rectangle, top left corner at `x, y` |
| `line x1, y1, x2, y2` | line |
| `triangle x1, y1, x2, y2, x3, y3` | filled triangle |
| `text words, x, y` | writes text (20 px), `x, y` is the start of the baseline |
| `clear` | removes everything drawn, keeps the background |
| `wait seconds` | shows the picture and pauses, for animations |

Colors are CSS color names (`"red"`, `"skyblue"`, `"tomato"`, …) or codes like
`"#ff8800"`. Upper/lower case doesn't matter.

`circle(10, 20, 5)` with brackets is accepted and means the same as
`circle 10, 20, 5`.

## Errors

An error stops the program and shows the line:

```
Line 3: I don't know `nmae`. Did you mean `name`?
  say nmae
      ^
```

Hosts may stop a program that runs too long (the command line doesn't; the
playground has a Stop button).
