/*
 * Rebuilds every launcher/brand PNG in assets/ from ONE master artwork.
 *
 *   node scripts/generate-icons.js
 *
 * WHY THIS EXISTS. There are six derived icon files (in-app mark, iOS/legacy
 * launcher icon, web favicon, and the three halves of the Android adaptive
 * icon). Hand-cropping them in an image editor is how they drift: the mark
 * ends up a different size in each, and nobody can tell which file is stale.
 * One master plus this script means the geometry below IS the specification,
 * and re-running it after an artwork change regenerates all six identically.
 *
 * NO NEW DEPENDENCY. scripts/lib/png.js is a small PNG reader/writer built on
 * node's own zlib. Adding `sharp` would have been the conventional answer and
 * was rejected because dependencies are a gated change under CLAUDE.md, and a
 * native-binary image library is a heavy thing to install for six files that
 * change roughly never.
 *
 * THE MASTER IS THE TRANSPARENT ONE. design-refs/logo-master-transparent.png
 * holds the mark on nothing; the white square in logo-master-on-white.png is
 * reproduced here as a background fill instead of being cropped out of it, so
 * the mark sits at exactly the same size and position in every output.
 *
 * THE MASTER IS NOT IN GIT. `design-refs/` is gitignored — it is where this
 * project keeps every piece of source artwork, the Figma exports included, and
 * none of it is committed. So this script runs on a machine that has the design
 * folder and not on a bare clone. That is the existing convention and following
 * it beats inventing a second home for artwork; the six OUTPUTS below are
 * committed, which is what actually matters to a build.
 *
 * NOTE ON THE MARK'S KNOCKOUTS. The ECG line through the heart, and the gap
 * between the heart and the V, are TRANSPARENT in the master — they are not
 * painted white. So they take the colour of whatever sits behind them: white
 * on the launcher icon, near-black on the dark splash. That is intentional and
 * matches how the previous mark behaved; it is also why the background of the
 * Android adaptive icon and `android.adaptiveIcon.backgroundColor` in app.json
 * must always agree, or the knockouts show the wrong colour.
 */

const path = require('path');
const { readPNG, writePNG } = require('./lib/png');

const ROOT = path.join(__dirname, '..');
const MASTER = path.join(ROOT, 'design-refs', 'logo-master-transparent.png');
const ASSETS = path.join(ROOT, 'assets');

const TRANSPARENT = [0, 0, 0, 0];
const WHITE = [255, 255, 255, 255];

/** Tightest box containing every pixel that is not effectively transparent. */
function inkBox(img, threshold = 8) {
  const { width: w, height: h, data } = img;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error('master artwork is fully transparent');
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function crop(img, box) {
  const out = Buffer.alloc(box.w * box.h * 4);
  for (let y = 0; y < box.h; y++) {
    const from = ((box.y0 + y) * img.width + box.x0) * 4;
    img.data.copy(out, y * box.w * 4, from, from + box.w * 4);
  }
  return { width: box.w, height: box.h, data: out };
}

/**
 * Area-average downscale.
 *
 * Alpha is premultiplied before averaging and undone afterwards. This is not
 * optional: the transparent parts of the master are stored as (0, 0, 0, 0), so
 * averaging raw RGB would blend pure black into every edge of the mark and
 * leave a visible dark halo all the way round it at small sizes.
 */
function resize(img, tw, th) {
  const { width: sw, height: sh, data } = img;
  const out = Buffer.alloc(tw * th * 4);
  for (let ty = 0; ty < th; ty++) {
    const sy0 = (ty * sh) / th;
    const sy1 = ((ty + 1) * sh) / th;
    for (let tx = 0; tx < tw; tx++) {
      const sx0 = (tx * sw) / tw;
      const sx1 = ((tx + 1) * sw) / tw;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let wsum = 0;
      for (let y = Math.floor(sy0); y < Math.ceil(sy1); y++) {
        const wy = Math.min(y + 1, sy1) - Math.max(y, sy0);
        if (wy <= 0) continue;
        for (let x = Math.floor(sx0); x < Math.ceil(sx1); x++) {
          const wx = Math.min(x + 1, sx1) - Math.max(x, sx0);
          if (wx <= 0) continue;
          const i = (y * sw + x) * 4;
          const wt = wx * wy;
          const al = data[i + 3] / 255;
          r += data[i] * al * wt;
          g += data[i + 1] * al * wt;
          b += data[i + 2] * al * wt;
          a += data[i + 3] * wt;
          wsum += wt;
        }
      }
      const o = (ty * tw + tx) * 4;
      const av = a / wsum;
      const un = av > 0 ? 255 / av : 0;
      out[o] = Math.min(255, Math.round((r / wsum) * un));
      out[o + 1] = Math.min(255, Math.round((g / wsum) * un));
      out[o + 2] = Math.min(255, Math.round((b / wsum) * un));
      out[o + 3] = Math.round(av);
    }
  }
  return { width: tw, height: th, data: out };
}

/** Source-over composite of `fg`, centred on a square canvas filled with `bg`. */
function centreOn(fg, size, bg) {
  const data = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = bg[0];
    data[i * 4 + 1] = bg[1];
    data[i * 4 + 2] = bg[2];
    data[i * 4 + 3] = bg[3];
  }
  const ox = Math.round((size - fg.width) / 2);
  const oy = Math.round((size - fg.height) / 2);
  for (let y = 0; y < fg.height; y++) {
    for (let x = 0; x < fg.width; x++) {
      const s = (y * fg.width + x) * 4;
      const d = ((oy + y) * size + ox + x) * 4;
      const sa = fg.data[s + 3] / 255;
      if (sa === 0) continue;
      const da = data[d + 3] / 255;
      const oa = sa + da * (1 - sa);
      for (let c = 0; c < 3; c++) {
        data[d + c] = Math.round((fg.data[s + c] * sa + data[d + c] * da * (1 - sa)) / oa);
      }
      data[d + 3] = Math.round(oa * 255);
    }
  }
  return { width: size, height: size, data };
}

if (!require('fs').existsSync(MASTER)) {
  process.stderr.write(
    'Cannot find design-refs/logo-master-transparent.png.\n' +
      'design-refs/ is gitignored, so the master artwork lives only on the design machine.\n' +
      'Copy it in before running this, or leave assets/ exactly as committed.\n'
  );
  process.exit(1);
}

const master = readPNG(MASTER);
const mark = crop(master, inkBox(master));
const longestSide = Math.max(mark.width, mark.height);

/** The mark, scaled so its longest side is `fill` of a `size` canvas, centred on `bg`. */
function build(size, fill, bg) {
  const scale = (size * fill) / longestSide;
  const fg = resize(mark, Math.round(mark.width * scale), Math.round(mark.height * scale));
  return centreOn(fg, size, bg);
}

function solid(size, colour) {
  const data = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = colour[0];
    data[i * 4 + 1] = colour[1];
    data[i * 4 + 2] = colour[2];
    data[i * 4 + 3] = colour[3];
  }
  return { width: size, height: size, data };
}

/**
 * Android 13+ themed icon: the launcher keeps only the ALPHA of this file and
 * tints the shape with the wallpaper palette, so the colour written here is
 * never displayed. Flat black is the convention.
 */
function monochrome(size, fill) {
  const img = build(size, fill, TRANSPARENT);
  for (let i = 0; i < size * size; i++) {
    img.data[i * 4] = 0;
    img.data[i * 4 + 1] = 0;
    img.data[i * 4 + 2] = 0;
  }
  return img;
}

/*
 * The fill ratios are the ones the previous artwork used, measured off the old
 * files before they were replaced, so no placement in the app changed optical
 * weight when the mark did. They are not arbitrary:
 *
 *  0.86  in-app mark — nearly edge to edge, because every caller sizes it via
 *        getLogoSize() and expects the box it asks for to be mostly mark.
 *  0.54  launcher icon — iOS and most launchers round the corners off, so the
 *        mark needs real margin or it gets clipped.
 *  0.66  favicon — a 96px tab icon needs the mark bigger to stay recognisable.
 *  0.42  Android adaptive icon — the launcher may mask this to a circle, a
 *        squircle or a teardrop, and animates it during a pull-down. Only the
 *        centre 66% is guaranteed visible, so the mark stays well inside that.
 */
const OUTPUTS = [
  ['logo.png', build(512, 0.86, TRANSPARENT)],
  ['icon.png', build(1024, 0.54, WHITE)],
  ['favicon.png', build(96, 0.66, WHITE)],
  ['android-icon-foreground.png', build(1024, 0.42, TRANSPARENT)],
  // Must stay in step with android.adaptiveIcon.backgroundColor in app.json.
  ['android-icon-background.png', solid(1024, WHITE)],
  ['android-icon-monochrome.png', monochrome(1024, 0.42)],
];

for (const [name, img] of OUTPUTS) {
  const bytes = writePNG(path.join(ASSETS, name), img);
  process.stdout.write(`assets/${name}  ${img.width}x${img.height}  ${(bytes / 1024).toFixed(0)}KB\n`);
}
