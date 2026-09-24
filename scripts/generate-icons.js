/*
 * Rebuilds every launcher/brand PNG in assets/ from ONE master artwork.
 *
 *   node scripts/generate-icons.js
 *
 * WHY THIS EXISTS. There are seven derived icon files (in-app mark, iOS/legacy
 * launcher icon, web favicon, the three halves of the Android adaptive icon,
 * and the Android notification icon). Hand-cropping them in an image editor is
 * how they drift: the mark ends up a different size in each, and nobody can
 * tell which file is stale. One master plus this script means the geometry
 * below IS the specification, and re-running it after an artwork change
 * regenerates all seven identically.
 *
 * NO NEW DEPENDENCY. scripts/lib/png.js is a small PNG reader/writer built on
 * node's own zlib. Adding `sharp` would have been the conventional answer and
 * was rejected because dependencies are a gated change under CLAUDE.md, and a
 * native-binary image library is a heavy thing to install for seven files that
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
 * it beats inventing a second home for artwork; the seven OUTPUTS below are
 * committed, which is what actually matters to a build.
 *
 * NOTE ON THE MARK'S KNOCKOUTS. The ECG line through the heart, and the gap
 * between the heart and the V, are TRANSPARENT in the master — they are not
 * painted white. So they take the colour of whatever sits behind them: white
 * on the launcher icon, near-black on the dark splash. That is intentional and
 * matches how the previous mark behaved; it is also why the background of the
 * Android adaptive icon and `android.adaptiveIcon.backgroundColor` in app.json
 * must always agree, or the knockouts show the wrong colour. On the monochrome
 * and notification icons the knockouts are what stop a flat silhouette reading
 * as a blob, so they matter most exactly where the colour is thrown away.
 */

const path = require('path');
const { readPNG, writePNG } = require('./lib/png');

const ROOT = path.join(__dirname, '..');
const MASTER = path.join(ROOT, 'design-refs', 'logo-master-transparent.png');
const ASSETS = path.join(ROOT, 'assets');

const TRANSPARENT = [0, 0, 0, 0];
const WHITE = [255, 255, 255, 255];
const BLACK_RGB = [0, 0, 0];
const WHITE_RGB = [255, 255, 255];

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
 * The mark's SHAPE only: every pixel forced to one flat colour, the alpha left
 * exactly as it was. Two callers want this and they want different colours.
 *
 *  - The Android 13+ themed launcher icon keeps only the ALPHA and tints the
 *    shape with the wallpaper palette, so the colour written there is never
 *    displayed. Flat black is the convention.
 *  - The notification icon is silhouetted by Android in the same way and then
 *    tinted with `expo-notifications`' `color`. Expo's own plugin documents the
 *    input as "96x96 all-white png with transparency", so white it is.
 *
 * The transparent knockouts survive both, which is the point: the ECG line and
 * the gap between the heart and the V stay cut out, so the silhouette still
 * reads as the mark rather than as a blob.
 */
function flatten(size, fill, [r, g, b]) {
  const img = build(size, fill, TRANSPARENT);
  for (let i = 0; i < size * size; i++) {
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = b;
  }
  return img;
}

/*
 * THE MARK IS EFFECTIVELY CIRCULAR, and every ratio below depends on that.
 * Measured off the master: the ink box is 1203x1122 and the furthest ink pixel
 * sits 607px from its centre, so the mark's longest side and the diameter of
 * the circle enclosing it are within 1% of each other. Its bounding-box corners
 * are empty — a heart has no corners. So a fill of f puts the whole mark inside
 * a circle of diameter 1.009 * f of the canvas, and a circular mask that clears
 * that circle clips nothing.
 *
 *  0.86  in-app mark — nearly edge to edge, because every caller sizes it via
 *        getLogoSize() and expects the box it asks for to be mostly mark.
 *  0.54  launcher icon — iOS and most launchers round the corners off, so the
 *        mark needs real margin or it gets clipped.
 *  0.94  favicon, on TRANSPARENCY — changed 2026-09-24 from 0.66 on white.
 *        A browser draws a tab icon at 16 to 32px on its own tab-bar colour,
 *        so a white square read as "the logo in a box" on every dark tab bar,
 *        and 0.66 wasted a third of the few pixels there are. The mark is
 *        effectively circular (see above), so 0.94 keeps it clear of the edge.
 *  0.55  Android adaptive icon — RAISED FROM 0.42 on 2026-09-23. Android
 *        guarantees the centre 66/108 (0.611) of an adaptive icon is visible
 *        under every launcher mask. Given the circularity above, the largest
 *        fill that fits inside that guarantee is 0.611 / 1.009 = 0.606, and
 *        0.42 was nowhere near it: it was inherited from the previous artwork
 *        rather than derived, and it left the mark floating in a wide empty
 *        ring. 0.55 encloses the mark in a 0.555 circle, a comfortable 5%
 *        inside the guarantee, and is 31% larger on screen. The owner reported
 *        this as "the logo is quite small" in the notification shade, where
 *        Android draws the launcher icon in a white disc.
 *  0.88  notification icon — this one is NOT masked to a circle by anything;
 *        Android draws it at 24dp in the status bar. Google's notification
 *        iconography keeps the artwork inside the central 22 of 24dp, so 0.88
 *        (a 0.888 circle, ~6% margin) is as large as it should go.
 */
const OUTPUTS = [
  ['logo.png', build(512, 0.86, TRANSPARENT)],
  ['icon.png', build(1024, 0.54, WHITE)],
  ['favicon.png', build(96, 0.94, TRANSPARENT)],
  ['android-icon-foreground.png', build(1024, 0.55, TRANSPARENT)],
  // Must stay in step with android.adaptiveIcon.backgroundColor in app.json.
  ['android-icon-background.png', solid(1024, WHITE)],
  // Same fill as the foreground: the themed icon and the normal one are the
  // same mark and must not read as two different sizes on one home screen.
  ['android-icon-monochrome.png', flatten(1024, 0.55, BLACK_RGB)],
  // 96x96 is what expo-notifications' plugin documents as its input; it derives
  // every density below that from this file.
  ['notification-icon.png', flatten(96, 0.88, WHITE_RGB)],
];

for (const [name, img] of OUTPUTS) {
  const bytes = writePNG(path.join(ASSETS, name), img);
  process.stdout.write(`assets/${name}  ${img.width}x${img.height}  ${(bytes / 1024).toFixed(0)}KB\n`);
}
