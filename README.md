# junhorkan.github.io

My personal site. Live at **<https://junhorkan.github.io>**.

A single scrolling page — hero, projects, about, contact — with a 3D ASCII
rendering of the four card suits as the centrepiece. No framework, no build
step, no dependencies.

## Running it locally

Any static file server works. There is nothing to install and nothing to compile.

```bash
python3 -m http.server 4173
```

Then open <http://localhost:4173>.

## Deploying

The repo is a GitHub Pages *user site*, so pushing `main` is the deploy. There is
no publish step.

```bash
git add -A && git commit -m "what changed" && git push
```

The site rebuilds in about a minute.

**If you changed CSS or JS, bump the `?v=N` on the `<link>` and `<script>` tags in
`index.html` and `404.html`.** Pages sets a cache header, so without it returning
visitors keep the old copy and it looks like the deploy failed.

## Adding a project

Edit `data/projects.json`. One object per project:

```json
{
  "name": "got-poker",
  "repo": "junhorkan/got-poker",
  "blurb": "What it does, and why you built it.",
  "stack": ["Rust"],
  "year": "2026",
  "status": "active",
  "featured": true,
  "links": { "demo": null, "writeup": null }
}
```

`featured` entries sort first; the rest by how recently they were pushed. Stars and
the last-updated date come live from the GitHub API at page load — you don't write
those. If the API is rate-limited or unreachable the page renders exactly the same
minus those two figures, so the file is always the source of truth.

Set `repo` to `null` for something that isn't on GitHub; `links.demo` then becomes
the entry's main link.

## Layout

```
index.html              the whole site
404.html
data/projects.json      project entries — the file most likely to change
assets/css/site.css     one stylesheet, design tokens on :root
assets/js/ascii.js      the ASCII point-cloud hero
assets/js/projects.js   renders projects.json, overlays GitHub stats
assets/js/nav.js        header, footer, and the scroll-spy nav
assets/img/og.png       link-preview image
```

## The hero

`assets/js/ascii.js` samples the suit glyphs off an offscreen canvas, extrudes the
result into a hollow 3D point cloud, scatters and reassembles it on load, then
renders it through a z-buffer at character-cell resolution with a Columbia-blue
depth gradient. It honours `prefers-reduced-motion` by painting a single static
frame and never starting the animation loop.

The three gradient stops are CSS custom properties (`--ascii-near`, `--ascii-mid`,
`--ascii-far`), so the hero can be recoloured without touching the JavaScript.

## Design notes

[`DESIGN.md`](DESIGN.md) records how the site is put together and, more usefully,
the decisions that changed along the way and why.
