// JUN — ASCII point-cloud wordmark.
//
// Pipeline: render the word to an offscreen canvas → sample its alpha into a
// grid → extrude that grid into a hollow 3D point cloud → disperse/assemble
// intro → oscillating yaw → perspective projection → z-buffer at character-cell
// resolution → glyph density ramp, colored by depth tier.
//
// Everything below works in *grid units*: one unit is one character cell, so
// the sampling step and the projection scale stay consistent at any viewport.

// The four card suits, in play order. Each particle remembers which suit it
// belongs to, so the front of the cloud draws itself in its own glyph.
const GLYPHS = ['♠', '♥', '♦', '♣']; // ♠ ♥ ♦ ♣

const CELL_FINE = 12;      // character cell, px (pointer: fine)
const CELL_COARSE = 14;    // fewer cells on touch devices
const DEPTH = 9;           // half-depth of the extrusion, grid units
const CAM = 120;           // camera distance, grid units — far enough that the
                           // near edge doesn't balloon and JUN stays readable
const YAW = 0.34;          // yaw amplitude, rad. Oscillates rather than spinning —
                           // a full spin turns the name into an unreadable edge
const YAW_PERIOD = 15000;  // ms per full oscillation
const PITCH = 0.1;         // small x wobble so it never looks like a flat card
const PITCH_PERIOD = 9000;

const HOLD_MS = 2400;      // blob → dispersion, before assembly begins
const ASSEMBLE_MS = 2000;
const HOVER_R = 120;       // px — cursor agitation radius
const HOVER_PUSH = 26;     // px — how far an agitated cell is shoved

// The nearest FRONT_SHARE of the depth range draws each particle's own suit —
// the spade is drawn in spades, the heart in hearts. That band is what makes
// the shapes readable. Everything behind it shades through the density ramp.
const FRONT_SHARE = 0.44;
const RAMP = ['{', '}', '<', '>', '1', '0', ';', ':', '·'];

const canvas = document.getElementById('cloud');
const ctx = canvas.getContext('2d');

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const coarse = matchMedia('(pointer: coarse)');

// Depth is painted as a greyscale gradient, quantised into SHADES steps —
// enough to read as a gradient rather than as bands, few enough that fillStyle
// changes a couple of dozen times a frame instead of a couple of thousand.
const SHADES = 7;
// Each suit sits on its own slice of the ramp, so four overlapping clouds stay
// legible as four shapes rather than merging into one grey mass.
const SUIT_LIGHTNESS = [1.0, 0.88, 0.96, 0.82];

const css = getComputedStyle(document.documentElement);
const parsePct = (v, fallback) => {
  const n = parseFloat(css.getPropertyValue(v));
  return Number.isFinite(n) ? n : fallback;
};
const L_HI = parsePct('--ascii-hi', 96);
const L_LO = parsePct('--ascii-lo', 22);

// [suit][shade] → css color, built once.
const PALETTE = SUIT_LIGHTNESS.map((factor) =>
  Array.from({ length: SHADES }, (_, s) => {
    const t = SHADES === 1 ? 0 : s / (SHADES - 1);
    const l = (L_HI + (L_LO - L_HI) * t) * factor;
    return `hsl(240 4% ${l.toFixed(1)}%)`;
  })
);

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const smooth = (t) => { const c = clamp01(t); return c * c * (3 - 2 * c); };

// frac(sin(dot(p, magic))) — deterministic, so per-particle noise is stable
// across frames without storing any state.
function hash3(x, y, z, seed) {
  const s = Math.sin(12.9898 * x + 78.233 * y + 37.719 * z + 19.913 * seed) * 43758.5453;
  return s - Math.floor(s);
}

// ---------------------------------------------------------------- sampling

// Draw the four suits large, read back the alpha channel, and return a boolean
// grid plus the suit index owning each cell.
//
// They're laid out 2×2 rather than in a row: a roughly square block fills the
// stage instead of leaving most of it empty, which buys each suit about twice
// the character resolution at the same cell size.
//
// Suits are solid filled shapes rather than strokes, so they sample densely on
// their own — no stroke pass needed to fatten them. The glyphs painted on top
// are the suits again, at character-cell size.
function sampleWord(targetCols) {
  const FS = 400;
  const off = document.createElement('canvas');
  const c = off.getContext('2d', { willReadFrequently: true });
  const font = `${FS}px "Apple Symbols", "Segoe UI Symbol", "DejaVu Sans", sans-serif`;

  c.font = font;
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';

  // Lay out on measured *ink* boxes, not advance widths and line heights. A
  // glyph box carries a lot of empty leading, and using it spreads the four
  // suits into the corners with a hole in the middle.
  const ink = GLYPHS.map((ch) => {
    const m = c.measureText(ch);
    return {
      l: m.actualBoundingBoxLeft, r: m.actualBoundingBoxRight,
      a: m.actualBoundingBoxAscent, d: m.actualBoundingBoxDescent,
    };
  });
  const cellW = Math.ceil(Math.max(...ink.map((m) => m.l + m.r)));
  const cellH = Math.ceil(Math.max(...ink.map((m) => m.a + m.d)));
  const GAP = Math.round(Math.max(cellW, cellH) * 0.16);

  off.width = cellW * 2 + GAP;
  off.height = cellH * 2 + GAP;
  c.font = font;
  c.fillStyle = '#fff';
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';

  const midX = cellW + GAP / 2;
  const midY = cellH + GAP / 2;
  for (let i = 0; i < GLYPHS.length; i++) {
    const col = i % 2;
    const row = (i / 2) | 0;
    const cx = col * (cellW + GAP) + cellW / 2;
    const cy = row * (cellH + GAP) + cellH / 2;
    const m = ink[i];
    // Offset so the glyph's ink centre, not its origin, lands on (cx, cy).
    c.fillText(GLYPHS[i], cx - (m.r - m.l) / 2, cy - (m.d - m.a) / 2);
  }

  const px = c.getImageData(0, 0, off.width, off.height).data;
  const step = Math.max(1, Math.round(off.width / targetCols));

  const grid = [];
  const owner = [];
  let minR = Infinity, maxR = -Infinity, minQ = Infinity, maxQ = -Infinity;

  for (let y = 0, r = 0; y < off.height; y += step, r++) {
    const row = [];
    const orow = [];
    for (let x = 0, q = 0; x < off.width; x += step, q++) {
      const on = px[(y * off.width + x) * 4 + 3] > 60;
      row.push(on);
      // Quadrant → suit index.
      orow.push((y > midY ? 2 : 0) + (x > midX ? 1 : 0));
      if (on) {
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (q < minQ) minQ = q;
        if (q > maxQ) maxQ = q;
      }
    }
    grid.push(row);
    owner.push(orow);
  }

  if (minR === Infinity) return null; // font never painted — bail to fallback

  // Crop to ink so the wordmark is centred on its own bounds, not the canvas'.
  const cropped = [];
  const croppedOwner = [];
  for (let r = minR; r <= maxR; r++) {
    cropped.push(grid[r].slice(minQ, maxQ + 1));
    croppedOwner.push(owner[r].slice(minQ, maxQ + 1));
  }
  return { grid: cropped, owner: croppedOwner };
}

// Front face, back face, and full-depth walls along the outline — a hollow
// extrusion, so the form stays readable edge-on.
function buildCloud(sampled) {
  const { grid, owner } = sampled;
  const rows = grid.length;
  const cols = grid[0].length;
  const cx = cols / 2;
  const cy = rows / 2;

  const pts = [];
  const letters = [];

  const push = (x, y, z, li) => { pts.push(x, y, z); letters.push(li); };

  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < cols; q++) {
      if (!grid[r][q]) continue;
      const x = q - cx;
      const y = r - cy;
      const li = owner[r][q];
      push(x, y, -DEPTH, li);
      push(x, y, DEPTH, li);

      const edge =
        r === 0 || r === rows - 1 || q === 0 || q === cols - 1 ||
        !grid[r - 1][q] || !grid[r + 1][q] ||
        !grid[r][q - 1] || !grid[r][q + 1];
      if (edge) {
        for (let z = -DEPTH + 2; z < DEPTH; z += 2) push(x, y, z, li);
      }
    }
  }

  return {
    pts: new Float32Array(pts),
    letters: new Uint8Array(letters),
    count: letters.length,
    cols,
    rows,
  };
}

// Scattered "home" position: polar-quantized rings and spokes plus hashed
// jitter — structured debris, not random noise.
function scatterOf(x, y, z) {
  const r = Math.hypot(x, y);
  const ang = Math.atan2(y, x);
  const ring = 9 * Math.round(r / 9);
  const spoke = Math.round(ang / (Math.PI / 10)) * (Math.PI / 10);
  const h1 = hash3(x, y, z, 1);
  const swirl = ang + (hash3(x, y, z, 2) - 0.5) * 1.4 + 0.03 * r;
  const squash = 1 + 0.12 * Math.sin(3 * ang + h1 * Math.PI * 2);
  const rad = ring * (0.5 + 0.22 * h1) + 9;
  const orbit = 7 + 0.1 * r;
  return [
    Math.cos(spoke) * rad * squash + Math.cos(swirl) * orbit,
    Math.sin(spoke) * rad * (2 - squash) + Math.sin(swirl) * orbit * 0.7,
    z * 2.2 + (hash3(x, y, z, 3) - 0.5) * 22,
  ];
}

// ---------------------------------------------------------------- state

let cloud = null;
let scatter = null;    // Float32Array, parallel to cloud.pts
let agitation = null;  // Float32Array, per-point hover response (0..1)
let cell = CELL_FINE;
let pxScale = CELL_FINE; // grid unit → px. Equals `cell` unless the cloud has
                         // to be shrunk to fit a short viewport.
let dpr = 1;
let W = 0, H = 0;      // css px
let zcols = 0, zrows = 0;
let zdepth = null;     // Float32Array z-buffer
let zpoint = null;     // Int32Array — winning point index per cell
let zscreen = null;    // Float32Array — winning point's screen x,y per cell
let start = performance.now();
let raf = 0;
let running = false;
const pointer = { x: -1e4, y: -1e4, active: false };

function fontStack() {
  return getComputedStyle(document.body).fontFamily ||
    'ui-monospace, Menlo, Consolas, monospace';
}

function rebuild() {
  const rect = canvas.getBoundingClientRect();
  W = Math.max(1, Math.round(rect.width));
  H = Math.max(1, Math.round(rect.height));
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  cell = coarse.matches ? CELL_COARSE : CELL_FINE;

  // The block is roughly square, so height constrains it as often as width.
  // Clamped at both ends: legible on a phone, not ballooning on an ultrawide.
  const targetCols = Math.round(
    Math.min(Math.max(Math.min(W * 0.58, H * 1.0) / cell, 17), 72)
  );

  const sampled = sampleWord(targetCols);
  if (!sampled) return;
  cloud = buildCloud(sampled);

  // Shrink if the cloud would run past the canvas on either axis. Scaling below
  // `cell` is safe — points just share cells — whereas scaling above it opens
  // gaps. SWING covers the perspective divide and the yaw swing, which together
  // push the projected block wider than its grid size at rest.
  const SWING = 1.42;
  pxScale = Math.min(
    cell,
    (W * 0.94) / (cloud.cols * SWING),
    (H * 0.92) / (cloud.rows * SWING)
  );

  scatter = new Float32Array(cloud.count * 3);
  agitation = new Float32Array(cloud.count);
  for (let i = 0; i < cloud.count; i++) {
    const x = cloud.pts[i * 3], y = cloud.pts[i * 3 + 1], z = cloud.pts[i * 3 + 2];
    const s = scatterOf(x, y, z);
    scatter[i * 3] = s[0];
    scatter[i * 3 + 1] = s[1];
    scatter[i * 3 + 2] = s[2];
  }

  zcols = Math.ceil(W / cell) + 1;
  zrows = Math.ceil(H / cell) + 1;
  zdepth = new Float32Array(zcols * zrows);
  zpoint = new Int32Array(zcols * zrows);
  zscreen = new Float32Array(zcols * zrows * 2);

  ctx.font = `${cell}px ${fontStack()}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
}

// ---------------------------------------------------------------- frame

function draw(now) {
  if (!cloud) return;

  const elapsed = now - start;
  const still = reduceMotion.matches;

  // Intro: tight blob → dispersed debris → assembled wordmark.
  const disperse = still ? 1 : smooth(elapsed / (HOLD_MS * 0.55));
  const assemble = still ? 1 : easeOutCubic(clamp01((elapsed - HOLD_MS) / ASSEMBLE_MS));

  const yaw = still ? 0 : YAW * Math.sin((now / YAW_PERIOD) * Math.PI * 2);
  const pitch = still ? 0 : PITCH * Math.sin((now / PITCH_PERIOD) * Math.PI * 2);
  const cy_ = Math.cos(yaw), sy_ = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);

  const ox = W / 2, oy = H / 2;

  zdepth.fill(Infinity);
  zpoint.fill(-1);

  // Track the frame's real depth range. Normalising against a fixed constant
  // wastes most of the ramp once yaw pushes x into z — the wordmark ends up
  // shaded almost entirely by two or three glyphs.
  let zmin = Infinity, zmax = -Infinity;

  const n = cloud.count;
  for (let i = 0; i < n; i++) {
    const i3 = i * 3;
    // blob → scatter → home
    const sx0 = scatter[i3] * disperse;
    const sy0 = scatter[i3 + 1] * disperse;
    const sz0 = scatter[i3 + 2] * disperse;

    let x = sx0 + (cloud.pts[i3] - sx0) * assemble;
    let y = sy0 + (cloud.pts[i3 + 1] - sy0) * assemble;
    let z = sz0 + (cloud.pts[i3 + 2] - sz0) * assemble;

    // yaw about Y, then pitch about X
    const xr = x * cy_ + z * sy_;
    let zr = -x * sy_ + z * cy_;
    const yr = y * cp - zr * sp;
    zr = y * sp + zr * cp;

    const p = CAM / (CAM + zr);
    let px = ox + xr * p * pxScale;
    let py = oy + yr * p * pxScale;

    // Hover agitation, in screen space: shove cells away from the cursor and
    // let them settle back once it leaves.
    if (pointer.active) {
      const dx = px - pointer.x, dy = py - pointer.y;
      const d = Math.hypot(dx, dy);
      const target = d < HOVER_R ? 1 - d / HOVER_R : 0;
      agitation[i] += (target - agitation[i]) * 0.18;
      const a = agitation[i];
      if (a > 0.004) {
        const inv = d > 0.001 ? 1 / d : 0;
        const j = hash3(cloud.pts[i3], cloud.pts[i3 + 1], cloud.pts[i3 + 2], 7);
        px += dx * inv * a * HOVER_PUSH + (j - 0.5) * a * 14;
        py += dy * inv * a * HOVER_PUSH + (hash3(px, py, i, 8) - 0.5) * a * 14;
      }
    } else if (agitation[i] > 0.004) {
      agitation[i] *= 0.86;
    }

    const q = (px / cell) | 0;
    const r = (py / cell) | 0;
    if (q < 0 || r < 0 || q >= zcols || r >= zrows) continue;

    const idx = r * zcols + q;
    if (zr < zdepth[idx]) {
      zdepth[idx] = zr;
      zpoint[idx] = i;
      zscreen[idx * 2] = px;
      zscreen[idx * 2 + 1] = py;
      if (zr < zmin) zmin = zr;
      if (zr > zmax) zmax = zr;
    }
  }

  // Paint, bucketed by (suit, shade) so fillStyle changes a couple of dozen
  // times per frame rather than once per cell.
  ctx.clearRect(0, 0, W, H);
  const span = Math.max(zmax - zmin, 1e-3);
  const buckets = [];

  for (let idx = 0; idx < zpoint.length; idx++) {
    const i = zpoint[idx];
    if (i < 0) continue;
    const t = clamp01((zdepth[idx] - zmin) / span);
    const suit = cloud.letters[i];
    const shade = Math.min(SHADES - 1, (t * SHADES) | 0);

    let ch;
    if (t < FRONT_SHARE) {
      ch = GLYPHS[suit];
    } else {
      const u = (t - FRONT_SHARE) / (1 - FRONT_SHARE);
      ch = RAMP[Math.min(RAMP.length - 1, (u * RAMP.length) | 0)];
    }

    const key = suit * SHADES + shade;
    (buckets[key] || (buckets[key] = [])).push(
      zscreen[idx * 2], zscreen[idx * 2 + 1], ch
    );
  }

  for (let key = 0; key < buckets.length; key++) {
    const b = buckets[key];
    if (!b || !b.length) continue;
    ctx.fillStyle = PALETTE[(key / SHADES) | 0][key % SHADES];
    for (let k = 0; k < b.length; k += 3) ctx.fillText(b[k + 2], b[k], b[k + 1]);
  }
}

// ---------------------------------------------------------------- loop

function loop(now) {
  draw(now);
  raf = requestAnimationFrame(loop);
}

function play() {
  if (running || reduceMotion.matches) return;
  running = true;
  raf = requestAnimationFrame(loop);
}

function pause() {
  running = false;
  cancelAnimationFrame(raf);
}

function boot() {
  rebuild();
  if (reduceMotion.matches) {
    pause();
    draw(performance.now()); // one static, assembled frame
  } else {
    start = performance.now();
    play();
  }
}

let resizeTimer = 0;
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const wasIntroDone = performance.now() - start > HOLD_MS + ASSEMBLE_MS;
    rebuild();
    // Don't replay the intro on every resize nudge.
    if (wasIntroDone) start = performance.now() - (HOLD_MS + ASSEMBLE_MS);
    if (reduceMotion.matches) draw(performance.now());
  }, 150);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
  else if (!reduceMotion.matches) play();
});

if (!coarse.matches) {
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.x = e.clientX - r.left;
    pointer.y = e.clientY - r.top;
    pointer.active = true;
  });
  canvas.addEventListener('pointerleave', () => { pointer.active = false; });
}

reduceMotion.addEventListener('change', boot);

if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(boot);
} else {
  boot();
}
