# Jun Horkan — personal site · design document

**Status:** built locally. Content filled in. Deploy is a GitHub user site (`junhorkan.github.io`).
**Last updated:** 2026-09-18 (content, leftovers, live recency sort)

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
| Layout | **Single scrolling page.** The nav tabs are anchors into sections of `index.html`, not separate documents — modelled on [columbiasoftwaresolutions.com](https://www.columbiasoftwaresolutions.com/#cases) |
| Sections | Hero, Projects, About, Contact |
| Projects data | Curated `data/projects.json` + live GitHub stats overlay |
| Stack | Static HTML/CSS/JS. No framework, no build step for pages |
| Page palette | Near-black `#0a0a0c`, text `#e8e8ea`, blue accent `#7dd3fc` for links |
| Hero palette | Columbia-blue depth ramp on the near-black background: `#a8e0ff` → `#3f7fe8` → `#1b3b86` |

GitHub is `github.com/junhorkan` — 3 public repos (`got-poker` / Rust,
`prizepicks-scraper` / Python, `yahtzee` / Python), none with descriptions or stars. This is
exactly why projects are curated locally: a raw API feed would render as three blank rows.

---

## Changes from the original plan

Kept here deliberately — each was a course correction worth remembering.

| # | Change | Why |
|---|---|---|
| 1 | Hero draws **card suits**, not the name `JUN` | Jun's call mid-build; fits the poker/yahtzee projects far better than a wordmark |
| 2 | Hero went **greyscale**, then back to **blue** | Jun tried black→white, then asked for the Columbia-like colour back. Final: a three-stop blue ramp over the same near-black background. Each suit sits on its own slice of it so four clouds stay legible |
| 3 | Suits laid out **2×2**, not in a row | A row left most of the stage empty and gave each suit ~12 cells; 2×2 roughly doubles the resolution at the same cell size |
| 4 | Layout uses **measured ink boxes**, not advance widths | Glyph boxes carry heavy leading, which pushed the suits into the corners with a hole in the middle |
| 5 | Post builder was **Python**, not Node | Node is not installed on this machine; Python 3.14 is. *(Superseded by change 20 — the builder is gone.)* |
| 6 | Depth normalised **per frame**, not against a constant | Yaw folds the x extent into z; a fixed range wasted most of the ramp and collapsed the render into two or three glyphs |
| 7 | Yaw **oscillates ±0.34 rad** rather than spinning | A full spin turns the shapes into unreadable edges |
| 8 | Assets carry a `?v=N` query | Browsers held stale CSS through hard reloads during the build. Bump N on deploy when CSS/JS changes |
| 9 | Colophon post rewritten | It described the old name-based blue hero, which no longer existed. Shipped content must not be stale |
| 10 | **Folded to one scrolling page** | Jun's call. `projects.html`, `writing.html`, `about.html` and `contact.html` were deleted and their content became `<section>` bands in `index.html`. Keeping both would have meant two copies of every piece of content |
| 11 | Scroll-spy reads geometry, not `IntersectionObserver` | IO only fires on threshold crossings; a fast jump down the page left its cached state stale, so sections silently never highlighted |
| 12 | Scroll-spy paints synchronously, not via `requestAnimationFrame` | rAF is throttled in a hidden or backgrounded tab. An "already queued" guard around a frame that never arrives stopped the spy permanently |
| 13 | Responsive block moved to the end of the stylesheet | The new `.band` rules were appended after it, silently killing the mobile overrides at equal specificity |
| 14 | Last band gets `min-height: calc(100svh - 150px)` | Without it the page ran out of scroll and the Contact anchor landed halfway down the viewport, which reads as a broken jump |
| 15 | Hero palette is **three colour stops**, interpolated in RGB | Replaces the two-endpoint lightness scale. All three stops are in the blue family, so RGB interpolation has no hue to travel through and nothing goes muddy between them |
| 16 | **Two-column layout** for section headers and entries | Jun found the stacked single column cluttered. Label left, content right — the rhythm from the reference site's "For students" band, on one shared grid so the columns align all the way down |
| 17 | Page widened to 1060px, prose held to 62ch | A two-column layout cannot breathe inside a 68ch column. The page is wide; the text blocks inside it are not |
| 18 | Stack renders as **pills**, not an inline run | Taken from the reference site's own `/projects` page. It was the single biggest de-clutter — the eye can skip the row entirely |
| 19 | Live GitHub language dropped from the stats row | Once the stack became pills, printing the language again read as "2026 · Rust · Rust" |
| 20 | **Writing section removed** | Jun's call. The `#writing` band, its nav entry, `posts/` (the Markdown pipeline and the colophon post) and `writing/` all went with it — a build script and an orphan post page that nothing links to are dead weight. All recoverable from git history at `d79ea6b` |
| 21 | **Email removed, LinkedIn added** | Jun's call before publishing. The address is gone from the footer, the contact rows and the About copy; `nav.js` lost its `mailto:` assembly entirely. LinkedIn is now the primary contact |

---

## File layout

```
index.html              the whole site: hero + all four sections
404.html
plan.md                 this document
data/projects.json      curated project entries — the file Jun edits most
assets/css/site.css     single stylesheet, design tokens on :root
assets/js/ascii.js      the point-cloud hero (~420 lines, no dependencies)
assets/js/projects.js   renders projects.json + GitHub stats overlay
assets/js/nav.js        shared header/footer injection, active-link state
.nojekyll               so GitHub Pages serves paths beginning with _
.claude/launch.json     dev server config (python3 -m http.server 4173)
```

---

## 1. Design system — `assets/css/site.css`

Tokens on `:root`; no light mode (the site is dark by design).

```
--bg #0a0a0c   --surface #131317   --text #e8e8ea   --muted #8b8b93
--rule #26262c --near #7dd3fc      --mid #3b82f6    --far #1e3a8a
--ascii-near #a8e0ff  --ascii-mid #3f7fe8  --ascii-far #1b3b86   (read by ascii.js)
--page 1060px  --measure 62ch  --split (0.85fr 2fr)  --split-gap 56px
--mono "SF Mono", ui-monospace, Menlo, Consolas, monospace
```

Everything monospace. Nav and small labels are uppercase, `letter-spacing: .14em`, 11–12px.
Body prose sits at 14px/1.75, held to `--measure` (62ch) even though the page itself is
1060px wide. Rules are 1px `--rule`; never boxes inside boxes. Links underline on hover only.

**The grid.** `--split` defines one two-column ratio used by the section headers, the project
and post entries, and the contact rows alike — so the label column and the content column
line up the whole way down the page. It collapses to a single column under 900px, where the
label simply sits above its content. Changing the proportion anywhere means editing that one
token.

Each entry is: **name and dates on the left**; **description, stack pills, then links on the
right**. The stack renders as outlined pills rather than a run of dot-separated text, which is
what stopped the rows reading as clutter.

`nav.js` injects the header and footer on every page, so there is one place to edit them.
The header is `position: fixed` and persists down the page, over a gradient backdrop so the
hero can run underneath it. A scroll cue sits at the bottom of `#stage`. The footer carries GitHub and LinkedIn.

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
   particle's own suit; the rest steps through `{ } < > 1 0 ; : ·`. Colour is a 7-step ramp
   interpolated across the three `--ascii-*` stops, with a per-suit lightness factor. Cells are
   bucketed by (suit, shade), so `fillStyle` changes ~28 times a frame, not ~2000.
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

## 2b. The scrolling layout — `index.html` + `nav.js`

The site is one document. `index.html` holds `#stage` (the hero, a full `100svh`, with a
scroll cue to `#projects`) followed by three `<section class="band">` elements: `#projects`,
`#about`, `#contact`. The nav links are plain `#id` anchors, and `scroll-behavior: smooth` on
`:root` does the animation — turned off under `prefers-reduced-motion`.

Anchors land correctly because each band carries `scroll-margin-top` (84px desktop, 94px
mobile where the header wraps to two rows), which is the one thing a fixed header always
breaks. Each section also opens with a numbered kicker — `01 — WORK` — so position is legible
even without the nav.

**Scroll-spy.** The nav marks the section you are actually in, so it doubles as a position
indicator. The active section is the last one whose top edge has risen past an anchor line at
35% of the viewport, with an explicit claim for the final section once the page can scroll no
further. It reads geometry directly in a passive `scroll` listener — four
`getBoundingClientRect` calls, no observer and no rAF, both of which produced real bugs here
(see changes 11 and 12).

`404.html` is the only standalone page; its nav links point back at `../index.html#…`.

## 3. Projects — `data/projects.json` + `assets/js/projects.js`

Curated entries render immediately; **one** `GET /users/junhorkan/repos?per_page=100` then
overlays `stargazers_count` and `pushed_at`, matched by repo name, and re-sorts the list by
live recency. One request, not one per project — unauthenticated GitHub allows 60/hr per IP.

The curated list is the source of truth. If the request 403s (rate limit) or the user is
offline, the page renders identically minus the live stats — no spinner, no error banner,
just a `console.info`. Order then stays at the curated featured-then-year sort. The response
is cached in `sessionStorage` for 10 minutes.

Live language is not shown. It already sits in the stack pills.

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

Featured entries sort first, then by year, until live `pushed_at` arrives — then the list
reorders newest-first. Layout is a list, not a card grid.

## 4. About / Contact

The `#about` band is three short paragraphs plus a dated **Now** line. `#contact` lists the
LinkedIn and GitHub, with a commented-out row for X awaiting a handle. No email address
appears anywhere on the site.

---

## Verification performed

| Check | Result |
|---|---|
| Hero intro: disperse → assemble → rotate | Passes; console clean |
| Hero at 375px | No clipping, no horizontal overflow (`scrollWidth === clientWidth`) |
| `prefers-reduced-motion` | Ink present, pixel-identical across 1.5s, **0** rAF calls in one second |
| Projects, happy path | Live date on all three repos, list re-sorted by `pushed_at`, no language duplication |
| Projects, GitHub unreachable | Full curated list renders; no spinner, no error banner |
| All pages + 404 | Render in the shell, nav active state correct |
| Anchor jumps, desktop | All land at exactly 84px, clearing the 71px header |
| Anchor jumps, mobile | All land at 94px, clearing the 85px wrapped header |
| Scroll-spy | Correct at every section, at the page bottom, and cleared over the hero |
| Stylesheet | Parses with all media queries live |
| Two-column layout | Verified at 1280px (grid 299px / 705px), at 800px, and collapsed to one column at 375px |
| Entry metadata | No duplicated language between the stack pills and the live stats row |

Run the site locally:

```bash
python3 -m http.server 4173
```

---

## Deploy

GitHub Pages user site: `junhorkan.github.io`. `404.html` uses root-absolute `/assets/` and
`data-root="/"`, which is correct for a user site (and would break on a project site).
`.nojekyll` is in the repo. Bump `?v=N` on deploy when CSS/JS changes.

## Out of scope

Analytics, a CMS, a contact form, light mode, a custom domain.

## Open items for Jun

1. Add an X handle to the Contact rows in `index.html` if you want one (the row is commented out).
2. Update the About **Now** line when the current work changes.
