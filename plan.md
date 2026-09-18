# Jun Horkan — personal site · design document

**Status:** built and verified locally. Not yet deployed.
**Last updated:** 2026-09-18

---

## Context

A personal site in the spirit of [coreatcu.com](https://coreatcu.com): dark, monospace,
minimal chrome, with an animated ASCII centerpiece — carrying Jun's own identity and
projects. `/Users/junhorkan/Jun Website` was an empty directory; this is greenfield.

The reference site's signature effect (`core.js`) is a **3D ASCII point cloud**: sample a
logo's alpha channel → extrude into a hollow 3D point cloud → scatter/assemble intro →
rotate → perspective-project → z-buffer at character-cell resolution → paint each cell with
a glyph from a density ramp, shaded by depth. That pipeline is rebuilt here from scratch,
**sourcing the cloud from rendered glyphs rather than an image file**, so there is no
artwork asset to produce or maintain.

### Confirmed decisions

| | |
|---|---|
| Hero subject | The four card suits ♠ ♥ ♦ ♣, laid out 2×2 |
| Pages | Home, Projects, About, Writing, Contact |
| Projects data | Curated `data/projects.json` + live GitHub stats overlay |
| Stack | Static HTML/CSS/JS. No framework, no build step for pages |
| Page palette | Near-black `#0a0a0c`, text `#e8e8ea`, blue accent `#7dd3fc` for links |
| Hero palette | Greyscale gradient, white at the front → near-black at the back |
| Writing | Markdown sources + a small zero-dependency **Python** build script |

GitHub is `github.com/junhorkan` — 3 public repos (`got-poker` / Rust,
`prizepicks-scraper` / Python, `yahtzee` / Python), none with descriptions or stars. This is
exactly why projects are curated locally: a raw API feed would render as three blank rows.

---

## Changes from the original plan

Kept here deliberately — each was a course correction worth remembering.

| # | Change | Why |
|---|---|---|
| 1 | Hero draws **card suits**, not the name `JUN` | Jun's call mid-build; fits the poker/yahtzee projects far better than a wordmark |
| 2 | Hero is **greyscale**, not the blue depth ramp | Jun's call; black→white gradients suit the theme. Each suit sits on its own slice of the ramp so four overlapping clouds stay legible |
| 3 | Suits laid out **2×2**, not in a row | A row left most of the stage empty and gave each suit ~12 cells; 2×2 roughly doubles the resolution at the same cell size |
| 4 | Layout uses **measured ink boxes**, not advance widths | Glyph boxes carry heavy leading, which pushed the suits into the corners with a hole in the middle |
| 5 | Post builder is **Python**, not Node | Node is not installed on this machine; Python 3.14 is. `python3 posts/build.py` |
| 6 | Depth normalised **per frame**, not against a constant | Yaw folds the x extent into z; a fixed range wasted most of the ramp and collapsed the render into two or three glyphs |
| 7 | Yaw **oscillates ±0.34 rad** rather than spinning | A full spin turns the shapes into unreadable edges |
| 8 | Assets carry a `?v=N` query | Browsers held stale CSS through hard reloads during the build. Bump N on deploy when CSS/JS changes |
| 9 | Colophon post rewritten | It described the old name-based blue hero, which no longer existed. Shipped content must not be stale |

---

## File layout

```
index.html              hero — the ASCII suits + nav
projects.html
writing.html            post index (list block is generated)
about.html
contact.html
404.html
plan.md                 this document
data/projects.json      curated project entries — the file Jun edits most
assets/css/site.css     single stylesheet, design tokens on :root
assets/js/ascii.js      the point-cloud hero (~420 lines, no dependencies)
assets/js/projects.js   renders projects.json + GitHub stats overlay
assets/js/nav.js        shared header/footer injection, active-link state
posts/*.md              Markdown post sources
posts/build.py          Markdown → HTML generator (python3, no pip install)
writing/*.html          generated output (committed)
.nojekyll               so GitHub Pages serves paths beginning with _
.claude/launch.json     dev server config (python3 -m http.server 4173)
```

---

## 1. Design system — `assets/css/site.css`

Tokens on `:root`; no light mode (the site is dark by design).

```
--bg #0a0a0c   --surface #131317   --text #e8e8ea   --muted #8b8b93
--rule #26262c --near #7dd3fc      --mid #3b82f6    --far #1e3a8a
--ascii-hi 96%  --ascii-lo 22%     (hero gradient endpoints, read by ascii.js)
--mono "Berkeley Mono", "SF Mono", ui-monospace, Menlo, Consolas, monospace
```

Everything monospace. Nav and small labels are uppercase, `letter-spacing: .14em`, 11–12px.
Body prose sits at 14px/1.75 in a 68ch column. Rules are 1px `--rule`; never boxes inside
boxes. Links underline on hover only.

`nav.js` injects the header and footer on every page, so there is one place to edit them.
Home stacks the nav under the wordmark; interior pages run it inline-right. The footer email
is assembled in JS from split user/host strings, so it is not sitting in the HTML as one
scrapable address.

**Open question for Jun:** links and the live GitHub stats are still blue (`--near`) while
the hero is now greyscale. Switching those to white/grey is a two-token edit if a fully
monochrome site is wanted.

## 2. The ASCII hero — `assets/js/ascii.js`

`<canvas id="cloud">` inside `<section id="stage">`, filling the viewport between header and
footer.

1. **Sample from glyphs.** Offscreen canvas draws `♠ ♥ ♦ ♣` at 400px; `getImageData`
   thresholds alpha > 60 onto a grid. Laid out 2×2 on measured ink boxes
   (`actualBoundingBoxAscent` and friends) with each suit's ink centred on its quadrant.
   The grid is then cropped to ink so the block centres on its own bounds.
2. **Extrude to a hollow cloud.** Front face at `z = -DEPTH`, back at `z = +DEPTH`, plus
   walls every 2 units along outline cells (any cell missing a 4-neighbour). Hollow, so the
   form stays readable edge-on.
3. **Scatter positions.** Polar-quantised rings and spokes plus hashed jitter —
   `frac(sin(dot(p, magic)))`, deterministic per point, nothing stored between frames.
4. **Intro.** Tight blob → dispersed debris (~1.3s) → assembled over 2s on `easeOutCubic`.
5. **Per frame.** Yaw oscillates ±0.34 rad over 15s with a ±0.1 rad pitch wobble →
   perspective divide at camera distance 120 grid units → z-buffer into 12px character cells,
   nearest point per cell wins.
6. **Paint.** Depth normalised against the frame's real min/max. The nearest 44% draws each
   particle's own suit; the rest steps through `{ } < > 1 0 ; : ·`. Colour is a 7-step
   greyscale ramp between `--ascii-hi` and `--ascii-lo`, with a per-suit lightness factor.
   Cells are bucketed by (suit, shade), so `fillStyle` changes ~28 times a frame, not ~2000.
7. **Hover.** Cells within 120px of the cursor are shoved outward with hashed jitter and
   spring back. Fine pointers only.

Sizing and hygiene, all of which were needed in practice:

- The canvas is `position: absolute; inset: 0` **and** `width/height: 100%`. With an auto
  height a canvas falls back to its own width/height attributes — which this script sets
  from the measured box — and the two chase each other. This cost a real debugging pass.
- `pxScale` shrinks the cloud below one cell per grid unit when it would overrun the canvas,
  with a 1.42× allowance for the perspective divide and yaw swing. This is what keeps the
  spade and diamond from clipping off the left edge on a phone.
- Backing store scaled by `devicePixelRatio` (capped at 2).
- Resize debounced 150ms; the intro does not replay on every nudge.
- The rAF loop stops on `visibilitychange`.
- Coarse pointers: no hover pass, cells raised to 14px.
- `prefers-reduced-motion: reduce` paints one static assembled frame and never starts the
  loop.

## 3. Projects — `data/projects.json` + `assets/js/projects.js`

Curated entries render immediately; **one** `GET /users/junhorkan/repos?per_page=100` then
overlays `language`, `stargazers_count` and `pushed_at`, matched by repo name. One request,
not one per project — unauthenticated GitHub allows 60/hr per IP.

The curated list is the source of truth. If the request 403s (rate limit) or the user is
offline, the page renders identically minus the live stats — no spinner, no error banner,
just a `console.info`. The response is cached in `sessionStorage` for 10 minutes.

The live language is suppressed when the curated `stack` already names it, or every
single-language repo reads `RUST · RUST · UPDATED SEP 2026`.

Entry shape:

```json
{
  "name": "got-poker",
  "repo": "junhorkan/got-poker",
  "blurb": "What it does and why you built it.",
  "stack": ["Rust"],
  "year": "2026",
  "status": "active",
  "featured": true,
  "links": { "demo": null, "writeup": null }
}
```

Featured entries sort first, then by year. Layout is a list, not a card grid.

## 4. Writing — `posts/build.py`

Posts are Markdown with front matter (`title`, `date`, `summary`, `slug`, `draft`).
`python3 posts/build.py` converts each to HTML, wraps it in the site shell, writes
`writing/<slug>.html`, and regenerates the index list in `writing.html` between
`<!-- POSTS:START -->` / `<!-- POSTS:END -->`. `draft: true` is skipped. Re-running is
idempotent (verified).

No pip install: the Markdown subset — headings, paragraphs, bold/italic, inline and fenced
code, links, lists, blockquotes, rules — is implemented directly in the script.

Ships with one real post, `posts/colophon.md`, describing the hero pipeline.

## 5. About / Contact

`about.html` carries clearly-marked placeholder copy for Jun to replace — structure, not an
invented biography. `contact.html` lists the email (JS-assembled `mailto:`) and GitHub, with
commented-out rows for LinkedIn and X awaiting handles.

---

## Verification performed

| Check | Result |
|---|---|
| Hero intro: disperse → assemble → rotate | Passes; console clean |
| Hero at 375px | No clipping, no horizontal overflow (`scrollWidth === clientWidth`) |
| `prefers-reduced-motion` | Ink present, pixel-identical across 1.5s, **0** rAF calls in one second |
| Projects, happy path | Live language / date on all three repos, no duplication |
| Projects, GitHub unreachable | Full curated list renders; no spinner, no error banner |
| `posts/build.py` | Generates `writing/colophon.html`, links it from the index, idempotent on re-run |
| All pages + 404 | Render in the shell, nav active state correct |

Run the site locally:

```bash
python3 -m http.server 4173
```

---

## Deploy

Not yet done. GitHub Pages serves this as-is with `.nojekyll`. `gh` is **not** installed on
this machine, so the repo needs creating either via `brew install gh` or by hand in the
browser. Publishing is outward-facing and awaits Jun's go-ahead.

## Out of scope

Analytics, a CMS, a contact form, light mode, a custom domain.

## Open items for Jun

1. Replace the `TODO` blurbs in `data/projects.json` with real descriptions.
2. Replace the placeholder copy in `about.html`.
3. Add LinkedIn / X handles to `contact.html` (rows are commented out).
4. Decide whether links should go greyscale to match the now-monochrome hero.
5. Confirm the footer should publish the email address in plain text.
