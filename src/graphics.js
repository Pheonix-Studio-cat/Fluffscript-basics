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

// A picture file is drawn as an image; any other text (usually an emoji) is
// drawn as letters.
export function isImageFile(name) {
  return /^(https?:|data:image\/)/i.test(name) || /\.(png|jpe?g|gif|svg|webp)$/i.test(name);
}

const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

// A sprite is a figure that stays on the picture until it is hidden. Its x and
// y are its middle; it fills a square of `size` pixels.
export class Sprite {
  constructor(image, x, y) {
    this.image = image;
    this.x = x;
    this.y = y;
    this.size = 50;
    this.angle = 0;
    this.hidden = false;
  }

  // The square the sprite fills: [left, top, right, bottom].
  box() {
    const h = this.size / 2;
    return [this.x - h, this.y - h, this.x + h, this.y + h];
  }

  touches(other) {
    if (this.hidden || other.hidden || this === other) return false;
    const [a1, b1, c1, d1] = this.box();
    const [a2, b2, c2, d2] = other.box();
    return a1 < c2 && a2 < c1 && b1 < d2 && b2 < d1;
  }

  contains(px, py) {
    if (this.hidden) return false;
    const [a, b, c, d] = this.box();
    return px >= a && px <= c && py >= b && py <= d;
  }
}

export const SPRITE_PROPERTIES = ['x', 'y', 'size', 'angle', 'hidden', 'image'];

export class Picture {
  constructor() {
    this.width = 400;
    this.height = 400;
    this.background = 'white';
    this.color = 'black';
    this.thickness = 2;
    this.shapes = [];
    this.sprites = [];
    this.status = '';
    this.used = false;
  }

  addSprite(image, x, y) {
    this.used = true;
    const s = new Sprite(image, x, y);
    this.sprites.push(s);
    return s;
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
    for (const sp of this.sprites) {
      if (sp.hidden) continue;
      const rot = sp.angle ? ` transform="rotate(${n(sp.angle)} ${n(sp.x)} ${n(sp.y)})"` : '';
      if (isImageFile(sp.image)) {
        const h = sp.size / 2;
        out.push(`<image href="${esc(sp.image)}" x="${n(sp.x - h)}" y="${n(sp.y - h)}" width="${n(sp.size)}" height="${n(sp.size)}"${rot}/>`);
      } else {
        out.push(`<text x="${n(sp.x)}" y="${n(sp.y)}" font-size="${n(sp.size * 0.85)}" text-anchor="middle" dominant-baseline="central"${rot}>${esc(sp.image)}</text>`);
      }
    }
    if (this.status) {
      out.push(`<text x="10" y="26" font-family="sans-serif" font-size="20" font-weight="bold" fill="black" stroke="white" stroke-width="4" paint-order="stroke">${esc(this.status)}</text>`);
    }
    out.push('</svg>');
    return out.join('\n') + '\n';
  }
}

// Paints the picture onto a 2D canvas context. Used by the playground.
// `getImage(name)` returns a loaded image for a picture file, or null while
// it is still loading or missing.
export function paint(picture, ctx, getImage = () => null) {
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
  for (const sp of picture.sprites) {
    if (sp.hidden || sp.size <= 0) continue;
    ctx.save();
    ctx.translate(sp.x, sp.y);
    if (sp.angle) ctx.rotate((sp.angle * Math.PI) / 180);
    if (isImageFile(sp.image)) {
      const img = getImage(sp.image);
      if (img && img.width) {
        const scale = sp.size / Math.max(img.width, img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
      } else {
        ctx.strokeStyle = '#999';
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(-sp.size / 2, -sp.size / 2, sp.size, sp.size);
      }
    } else {
      ctx.font = `${sp.size * 0.85}px ${EMOJI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'black';
      ctx.fillText(sp.image, 0, 0);
    }
    ctx.restore();
  }
  if (picture.status) {
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'white';
    ctx.strokeText(picture.status, 10, 26);
    ctx.fillStyle = 'black';
    ctx.fillText(picture.status, 10, 26);
  }
  ctx.restore();
}
