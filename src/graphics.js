// The picture a program draws. It only records shapes; a host decides how to
// show them (the playground paints a <canvas>, the command line writes SVG).
//
// Coordinates start at the top left corner: x grows to the right, y grows
// downwards.

const NAMED_COLORS = (
  'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue ' +
  'blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk ' +
  'crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki ' +
  'darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen ' +
  'darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue ' +
  'dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite ' +
  'gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki ' +
  'lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan ' +
  'lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen ' +
  'lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen ' +
  'magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen ' +
  'mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream ' +
  'mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid ' +
  'palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum ' +
  'powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown ' +
  'seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen ' +
  'steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'
).split(' ');

export const COLOR_NAMES = new Set(NAMED_COLORS);

// Returns the color in a form canvas and SVG both understand, or null.
export function normalizeColor(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase().replace(/\s+/g, '');
  if (COLOR_NAMES.has(v)) return v;
  if (/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(v)) return v;
  return null;
}

export class Picture {
  constructor() {
    this.width = 400;
    this.height = 400;
    this.background = 'white';
    this.color = 'black';
    this.thickness = 2;
    this.shapes = [];
    this.used = false;
  }

  add(shape) {
    this.used = true;
    this.shapes.push({ ...shape, color: this.color, thickness: this.thickness });
  }

  clear() {
    this.used = true;
    this.shapes = [];
  }

  toSVG() {
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const n = (x) => Number.isInteger(x) ? String(x) : String(Math.round(x * 1000) / 1000);
    const out = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${n(this.width)}" height="${n(this.height)}" viewBox="0 0 ${n(this.width)} ${n(this.height)}">`,
      `<rect x="0" y="0" width="${n(this.width)}" height="${n(this.height)}" fill="${esc(this.background)}"/>`,
    ];
    for (const s of this.shapes) {
      switch (s.type) {
        case 'circle':
          out.push(`<circle cx="${n(s.x)}" cy="${n(s.y)}" r="${n(s.radius)}" fill="${esc(s.color)}"/>`);
          break;
        case 'rect':
          out.push(`<rect x="${n(s.x)}" y="${n(s.y)}" width="${n(s.width)}" height="${n(s.height)}" fill="${esc(s.color)}"/>`);
          break;
        case 'line':
          out.push(`<line x1="${n(s.x1)}" y1="${n(s.y1)}" x2="${n(s.x2)}" y2="${n(s.y2)}" stroke="${esc(s.color)}" stroke-width="${n(s.thickness)}" stroke-linecap="round"/>`);
          break;
        case 'triangle':
          out.push(`<polygon points="${[s.x1, s.y1, s.x2, s.y2, s.x3, s.y3].map(n).join(' ')}" fill="${esc(s.color)}"/>`);
          break;
        case 'text':
          out.push(`<text x="${n(s.x)}" y="${n(s.y)}" fill="${esc(s.color)}" font-family="sans-serif" font-size="${n(s.size)}">${esc(s.words)}</text>`);
          break;
        default:
          break;
      }
    }
    out.push('</svg>');
    return out.join('\n') + '\n';
  }
}

// Paints the picture onto a 2D canvas context. Used by the playground.
export function paint(picture, ctx) {
  ctx.save();
  ctx.fillStyle = picture.background;
  ctx.fillRect(0, 0, picture.width, picture.height);
  for (const s of picture.shapes) {
    ctx.fillStyle = s.color;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.thickness;
    ctx.lineCap = 'round';
    switch (s.type) {
      case 'circle':
        ctx.beginPath();
        ctx.arc(s.x, s.y, Math.max(0, s.radius), 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'rect':
        ctx.fillRect(s.x, s.y, s.width, s.height);
        break;
      case 'line':
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
        ctx.stroke();
        break;
      case 'triangle':
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
        ctx.lineTo(s.x3, s.y3);
        ctx.closePath();
        ctx.fill();
        break;
      case 'text':
        ctx.font = `${s.size}px sans-serif`;
        ctx.fillText(s.words, s.x, s.y);
        break;
      default:
        break;
    }
  }
  ctx.restore();
}
