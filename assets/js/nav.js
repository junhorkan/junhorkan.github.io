// Shared header + footer, injected so there's one place to edit them.
//
// The site is a single scrolling page: the nav links are anchors into sections
// of index.html, not separate documents. Post pages under writing/ are the one
// exception — they're standalone, and their nav links point back at the
// index's anchors.
//
// Each page declares <body data-page="..." data-root="./">; posts pass "../".

const SECTIONS = [
  ['projects', 'Projects'],
  ['writing', 'Writing'],
  ['about', 'About'],
  ['contact', 'Contact'],
];

// Split so the address isn't sitting in the HTML as one scrapable string.
const MAIL_USER = 'junhorkan';
const MAIL_HOST = 'gmail.com';

const root = document.body.dataset.root || './';
const page = document.body.dataset.page || '';
const onIndex = page === 'home';

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

// Real whitespace either side, so the footer has somewhere to wrap. Adjacent
// elements with no text node between them give the line no break opportunity,
// and the last item runs off the edge on a narrow screen.
function sep() {
  const f = document.createDocumentFragment();
  f.append(' ', el('span', 'sep', '·'), ' ');
  return f;
}

function mailLink(text) {
  const a = el('a', null, text || MAIL_USER + '@' + MAIL_HOST);
  a.href = 'mailto:' + MAIL_USER + '@' + MAIL_HOST;
  return a;
}

function buildHeader() {
  const head = el('header', 'site-head');

  const mark = el('a', 'wordmark', 'Jun Horkan');
  mark.href = onIndex ? '#top' : root + 'index.html';
  head.appendChild(mark);

  const nav = el('nav', 'site-nav');
  nav.setAttribute('aria-label', 'Sections');
  for (const [id, text] of SECTIONS) {
    const a = el('a', null, text);
    a.href = (onIndex ? '' : root + 'index.html') + '#' + id;
    a.dataset.section = id;
    // A post page belongs to Writing, and says so even though it can't
    // participate in the scroll-spy below.
    if (!onIndex && page === id) a.setAttribute('aria-current', 'true');
    nav.appendChild(a);
  }
  head.appendChild(nav);
  return head;
}

function buildFooter() {
  const foot = el('footer', 'site-foot');
  foot.appendChild(el('span', 'nowrap', 'Jun Horkan'));
  foot.appendChild(sep());
  foot.appendChild(mailLink());
  foot.appendChild(sep());

  const gh = el('a', null, 'GitHub');
  gh.href = 'https://github.com/junhorkan';
  gh.rel = 'me noopener';
  foot.appendChild(gh);

  foot.appendChild(sep());
  foot.appendChild(el('span', 'nowrap', '© ' + new Date().getFullYear()));
  return foot;
}

// Scroll-spy: mark the section the reader is actually in, so the nav doubles
// as a position indicator rather than a static list.
//
// This reads geometry on scroll rather than using IntersectionObserver. IO only
// fires on threshold crossings, and a fast jump down the page can leave its
// cached state stale — which showed up here as sections that never highlighted.
// Reading geometry is deterministic and costs nothing at this scale.
function initScrollSpy(links) {
  const sections = SECTIONS
    .map(([id]) => document.getElementById(id))
    .filter(Boolean);
  if (!sections.length) return;

  const paint = () => {
    // The anchor line: a section becomes current once its top edge rises past
    // this point, which is roughly where the eye sits.
    const line = innerHeight * 0.35;
    let active = null;

    for (const s of sections) {
      if (s.getBoundingClientRect().top <= line) active = s.id;
    }

    // At the very end of the page the last section may never reach the anchor
    // line — there is nothing left to scroll. Claim it explicitly.
    const max = document.documentElement.scrollHeight - innerHeight;
    if (max - window.scrollY <= 2) active = sections[sections.length - 1].id;

    for (const a of links) {
      if (a.dataset.section === active) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    }
  };

  // Called straight from the scroll handler rather than through
  // requestAnimationFrame: rAF is throttled in a hidden or backgrounded tab, and
  // a "already queued" guard around a frame that never arrives stops the spy
  // permanently. Four getBoundingClientRect calls per scroll event is cheap.
  addEventListener('scroll', paint, { passive: true });
  addEventListener('resize', paint);
  paint();
}

const header = buildHeader();
document.body.prepend(header);
document.body.appendChild(buildFooter());

if (onIndex) {
  initScrollSpy([...header.querySelectorAll('.site-nav a')]);
}

// The contact section asks for the address inline too.
for (const slot of document.querySelectorAll('[data-mail-slot]')) {
  slot.replaceChildren(mailLink());
}
