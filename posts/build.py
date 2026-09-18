#!/usr/bin/env python3
"""Build writing/*.html from posts/*.md, and regenerate the list in index.html.

Run it from anywhere:  python3 posts/build.py

No dependencies. The Markdown subset covers what a personal blog post needs:
headings, paragraphs, bold/italic, inline and fenced code, links, lists,
blockquotes, and rules. Posts with `draft: true` are skipped.
"""

import html
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
POSTS_DIR = ROOT / "posts"
OUT_DIR = ROOT / "writing"
INDEX = ROOT / "index.html"   # the single page; posts list into its #writing band

START = "<!-- POSTS:START -->"
END = "<!-- POSTS:END -->"

FAVICON = (
    "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>"
    "<rect width='32' height='32' fill='%230a0a0c'/><text x='16' y='22' "
    "font-family='monospace' font-size='16' font-weight='700' fill='%237dd3fc' "
    "text-anchor='middle'>J</text></svg>"
)

PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} &mdash; Jun Horkan</title>
<meta name="description" content="{summary}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{summary}">
<meta property="og:type" content="article">
<link rel="icon" href="{favicon}">
<link rel="stylesheet" href="../assets/css/site.css?v=13">
</head>
<body data-page="writing" data-root="../">
  <main class="prose post-body">
    <h1>{title}</h1>
    <p class="post-date">{datestr}</p>
{body}
    <a class="back-link" href="../index.html#writing">&larr; All writing</a>
  </main>
  <script src="../assets/js/nav.js?v=13"></script>
</body>
</html>
"""


# ------------------------------------------------------------------ parsing

def split_front_matter(text):
    """Return (meta dict, body). Front matter is an optional leading --- block."""
    meta = {}
    if not text.startswith("---"):
        return meta, text
    end = text.find("\n---", 3)
    if end == -1:
        return meta, text
    for line in text[3:end].strip().splitlines():
        if ":" not in line:
            continue
        k, v = line.split(":", 1)
        meta[k.strip().lower()] = v.strip().strip('"').strip("'")
    rest = text[end + 4:]
    return meta, rest.lstrip("\n")


def inline(text):
    """Inline formatting. Input is already HTML-escaped."""
    # Code spans first, so their contents are not touched by the other rules.
    spans = []

    def stash(m):
        spans.append(m.group(1))
        return "\x00%d\x00" % (len(spans) - 1)

    text = re.sub(r"`([^`]+)`", stash, text)
    text = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", r'<a href="\2">\1</a>', text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<![*\w])\*([^*]+)\*(?!\*)", r"<em>\1</em>", text)
    text = re.sub(r"\x00(\d+)\x00", lambda m: "<code>%s</code>" % spans[int(m.group(1))], text)
    return text


def render(md):
    """Markdown subset -> HTML. Returns an indented HTML fragment."""
    out = []
    lines = md.replace("\r\n", "\n").split("\n")
    i = 0
    n = len(lines)

    while i < n:
        line = lines[i]
        stripped = line.strip()

        if not stripped:
            i += 1
            continue

        # fenced code
        if stripped.startswith("```"):
            i += 1
            buf = []
            while i < n and not lines[i].strip().startswith("```"):
                buf.append(lines[i])
                i += 1
            i += 1  # closing fence
            out.append("<pre><code>%s</code></pre>" % html.escape("\n".join(buf)))
            continue

        # rule
        if re.fullmatch(r"-{3,}|\*{3,}", stripped):
            out.append("<hr>")
            i += 1
            continue

        # heading — h1 is the page title, so ## is the top level in a body
        m = re.match(r"(#{1,6})\s+(.*)", stripped)
        if m:
            level = min(max(len(m.group(1)), 2), 4)
            out.append("<h%d>%s</h%d>" % (level, inline(html.escape(m.group(2))), level))
            i += 1
            continue

        # blockquote
        if stripped.startswith(">"):
            buf = []
            while i < n and lines[i].strip().startswith(">"):
                buf.append(lines[i].strip().lstrip(">").strip())
                i += 1
            out.append("<blockquote><p>%s</p></blockquote>" % inline(html.escape(" ".join(buf))))
            continue

        # lists
        bullet = re.match(r"[-*+]\s+(.*)", stripped)
        number = re.match(r"\d+[.)]\s+(.*)", stripped)
        if bullet or number:
            tag = "ul" if bullet else "ol"
            pat = r"[-*+]\s+(.*)" if bullet else r"\d+[.)]\s+(.*)"
            items = []
            while i < n and lines[i].strip():
                m2 = re.match(pat, lines[i].strip())
                if not m2:
                    break
                items.append("<li>%s</li>" % inline(html.escape(m2.group(1))))
                i += 1
            out.append("<%s>\n%s\n</%s>" % (tag, "\n".join("  " + x for x in items), tag))
            continue

        # paragraph — consume until a blank line or a block-level marker
        buf = []
        while i < n and lines[i].strip():
            s = lines[i].strip()
            if s.startswith(("```", ">", "#")) or re.match(r"([-*+]|\d+[.)])\s+", s):
                break
            buf.append(s)
            i += 1
        out.append("<p>%s</p>" % inline(html.escape(" ".join(buf))))

    return "\n".join("    " + block.replace("\n", "\n    ") for block in out)


def pretty_date(raw):
    try:
        y, m, d = (int(x) for x in str(raw).split("-")[:3])
        return date(y, m, d).strftime("%b %d, %Y").replace(" 0", " ")
    except Exception:
        return str(raw)


# ------------------------------------------------------------------- build

def main():
    if not POSTS_DIR.is_dir():
        sys.exit("no posts/ directory at %s" % POSTS_DIR)
    OUT_DIR.mkdir(exist_ok=True)

    published = []
    skipped = 0

    for path in sorted(POSTS_DIR.glob("*.md")):
        meta, body = split_front_matter(path.read_text(encoding="utf-8"))
        if str(meta.get("draft", "")).lower() in ("true", "yes", "1"):
            skipped += 1
            continue

        slug = meta.get("slug") or path.stem
        title = meta.get("title") or slug.replace("-", " ").title()
        raw_date = meta.get("date", "")
        summary = meta.get("summary", "")

        out_path = OUT_DIR / (slug + ".html")
        out_path.write_text(
            PAGE.format(
                title=html.escape(title),
                summary=html.escape(summary, quote=True),
                datestr=html.escape(pretty_date(raw_date)),
                body=render(body),
                favicon=FAVICON,
            ),
            encoding="utf-8",
        )
        published.append(
            {"slug": slug, "title": title, "date": raw_date,
             "pretty": pretty_date(raw_date), "summary": summary}
        )
        print("  wrote writing/%s.html" % slug)

    published.sort(key=lambda p: str(p["date"]), reverse=True)

    # Rebuild the post list inside index.html's #writing band.
    if published:
        rows = []
        for p in published:
            rows.append(
                '        <li class="entry">\n'
                '          <div class="entry-head">\n'
                '            <a class="entry-name" href="writing/{slug}.html">{title}</a>\n'
                '            <span class="entry-year">{pretty}</span>\n'
                '          </div>\n'
                '{summary}'
                '        </li>'.format(
                    slug=p["slug"],
                    title=html.escape(p["title"]),
                    pretty=html.escape(p["pretty"]),
                    summary=('          <p class="entry-blurb">%s</p>\n' % html.escape(p["summary"]))
                    if p["summary"] else "",
                )
            )
        block = '      <ul class="entry-list">\n' + "\n".join(rows) + "\n      </ul>"
    else:
        block = '      <p class="empty">Nothing published yet.</p>'

    index_html = INDEX.read_text(encoding="utf-8")
    pattern = re.compile(re.escape(START) + r".*?" + re.escape(END), re.S)
    if not pattern.search(index_html):
        sys.exit("markers %s / %s not found in index.html" % (START, END))
    INDEX.write_text(
        pattern.sub(lambda _: START + "\n" + block + "\n      " + END, index_html),
        encoding="utf-8",
    )

    print("%d published, %d draft%s" % (len(published), skipped, "" if skipped == 1 else "s"))


if __name__ == "__main__":
    main()
