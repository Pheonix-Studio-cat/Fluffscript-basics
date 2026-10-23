// Commands are the words that start a line and do something: `say`, and the
// drawing commands. They are not reserved — a program may still use `color`
// or `line` as a name, as long as the line stores something in it
// (`color = "red"`).

export const COMMANDS = {
  say: { params: ['value'], min: 0 },
  wait: { params: ['seconds'] },
  canvas: { params: ['width', 'height'] },
  background: { params: ['color'] },
  color: { params: ['color'] },
  thickness: { params: ['size'] },
  clear: { params: [] },
  circle: { params: ['x', 'y', 'radius'] },
  rect: { params: ['x', 'y', 'width', 'height'] },
  line: { params: ['x1', 'y1', 'x2', 'y2'] },
  triangle: { params: ['x1', 'y1', 'x2', 'y2', 'x3', 'y3'] },
  text: { params: ['words', 'x', 'y'] },
};

export function usage(name) {
  const { params } = COMMANDS[name];
  return params.length ? `${name} ${params.join(', ')}` : name;
}
