---
title: How the suits are drawn
date: 2026-09-18
summary: The homepage draws four card suits as rotating clouds of ASCII characters. Here is the whole pipeline, which is shorter than it looks.
draft: false
---

There are no images on the homepage. The four card suits in the middle are a
few thousand characters painted onto a canvas, and they are genuinely
three-dimensional — they rotate, each has a front face and a back face, and the
characters shade from white to near-black as the surface recedes. Here is how
it is put together.

## Start with text, not artwork

Most ASCII-art effects begin with an image file. This one begins with the
glyphs themselves. An offscreen canvas draws `♠ ♥ ♦ ♣` at 400px, and then the
pixels are read straight back out:

```
const px = c.getImageData(0, 0, off.width, off.height).data;
const on = px[(y * off.width + x) * 4 + 3] > 60;
```

That fourth byte is the alpha channel. Anything more than a third opaque counts
as ink. Sampling that on a grid gives a coarse boolean bitmap of all four
suits — and because there is no image asset anywhere, changing the shapes is a
one-line edit.

The suits are laid out two-by-two rather than in a row. That took one
non-obvious fix: laying them out on their *advance widths* and line heights
spread them into the corners with a hole in the middle, because a glyph box
carries a lot of empty leading. Measuring the actual ink box instead —
`actualBoundingBoxAscent` and friends — and centring each suit's ink on its
quadrant closed the gap and roughly doubled the usable resolution.

## Extrude it

A flat bitmap rotated in 3D looks like a rotating sheet of paper. To get a
solid, each filled cell contributes a point at the front of the slab and a
point at the back, and cells on the **outline** — any cell missing one of its
four neighbours — additionally fill in the wall between the two faces.

The inside stays empty. Nothing in the interior is ever visible, so there is no
reason to pay for it, and the shapes still read correctly when they turn
edge-on.

## Scatter, then assemble

On load the cloud does not simply fade in. Every point has a second position, a
"scattered" one, computed from its own coordinates:

```
const ring = 9 * Math.round(r / 9);
const spoke = Math.round(ang / (Math.PI / 10)) * (Math.PI / 10);
```

Snapping each point's radius and angle to quantised rings and spokes produces
debris with visible structure — orbits and spokes rather than television
static. The hash function is `frac(sin(dot(p, magic)))`, the old shader trick,
so every point's jitter is reproducible from its position alone and nothing has
to be stored between frames.

The intro interpolates from scattered to home over two seconds on an ease-out
cubic. That is the entire animation.

## Draw it as characters

Each frame rotates the cloud, projects it through a perspective divide, and
then does the part that makes it ASCII: a z-buffer at *character-cell*
resolution instead of pixel resolution. The canvas is treated as a grid of 12px
cells, and each cell keeps only the nearest point that landed in it.

Depth then picks the glyph. The nearest 44% of the depth range draws each
particle's own suit — the spade in spades, the heart in hearts — and everything
further back steps through a density ramp of `{ } < > 1 0 ; : ·`.

One thing worth getting right: normalise depth against the frame's *actual*
minimum and maximum, not against a fixed constant. Yaw rotation folds the x
extent into z, so a fixed range wastes most of the ramp and the whole thing
collapses into two or three glyphs. Measuring per frame keeps the gradient
spread across its full span.

Colour is greyscale, white at the front to near-black at the back, with each
suit sitting on a slightly different slice of the ramp so four overlapping
clouds stay legible as four shapes. There is no glow and no shadow anywhere;
contrast alone carries the 3D read.

## The unglamorous half

The parts that actually decide whether it feels good:

- The backing store is scaled by `devicePixelRatio`, or the characters are mud
  on a retina screen.
- The canvas is positioned absolutely rather than sized with `height: 100%`.
  A canvas with an auto height falls back to its own width/height attributes —
  which this script sets from the measured box — and the two chase each other.
- The loop stops on `visibilitychange`. A background tab burning a core to
  animate something nobody is looking at is indefensible.
- `prefers-reduced-motion` skips the intro and the rotation entirely and paints
  one static assembled frame. The shapes still read.
- On touch devices the hover response is dropped and the cells get bigger,
  because there is no cursor and there is less GPU.

The whole thing is about 400 lines with no dependencies, and you can read it in
`assets/js/ascii.js`.
