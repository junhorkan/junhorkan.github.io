// Shared header + footer, injected so there's one place to edit them.
// Each page declares <body data-page="..." data-root="./"> — posts under
// writing/ pass "../" so links resolve without depending on a deploy root.

const PAGES = [
  ['projects', 'projects.html', 'Projects'],
  ['writing', 'writing.html', 'Writing'],
  ['about', 'about.html', 'About'],
  ['contact', 'contact.html', 'Contact'],
];

// Split so the address isn't sitting in the HTML as one scrapable string.
const MAIL_USER = 'junhorkan';
const MAIL_HOST = 'gmail.com';

const root = document.body.dataset.root || './';
const current = document.body.dataset.page || '';

function mailLink(text) {
  const a = document.createElement('a');
  a.href = 'mailto:' + MAIL_USER + '@' + MAIL_HOST;
  a.textContent = text || MAIL_USER + '@' + MAIL_HOST;
  return a;
}

function buildHeader() {
  const head = document.createElement('header');
  head.className = 'site-head';
  // Home stacks the nav under the wordmark; interior pages run it inline.
  if (current === 'home') head.dataset.layout = 'stacked';

  const mark = document.createElement('a');
  mark.className = 'wordmark';
  mark.href = root + 'index.html';
  mark.textContent = 'Jun Horkan';
  head.appendChild(mark);

  const nav = document.createElement('nav');
  nav.className = 'site-nav';
  nav.setAttribute('aria-label', 'Primary');
  for (const [key, href, text] of PAGES) {
    const a = document.createElement('a');
    a.href = root + href;
    a.textContent = text;
    if (key === current) a.setAttribute('aria-current', 'page');
    nav.appendChild(a);
  }
  head.appendChild(nav);
  return head;
}

function buildFooter() {
  const foot = document.createElement('footer');
  foot.className = 'site-foot';

  foot.appendChild(el('span', 'nowrap', 'Jun Horkan'));
  foot.appendChild(sep());
  foot.appendChild(mailLink());
  foot.appendChild(sep());

  const gh = document.createElement('a');
  gh.href = 'https://github.com/junhorkan';
  gh.rel = 'me noopener';
  gh.textContent = 'GitHub';
  foot.appendChild(gh);

  foot.appendChild(sep());
  foot.appendChild(el('span', 'nowrap', '© ' + new Date().getFullYear()));
  return foot;
}

// Real whitespace either side, so the footer has somewhere to wrap. Adjacent
// elements with no text node between them give the line no break opportunity,
// and the last item runs off the edge on a narrow screen.
function sep() {
  const f = document.createDocumentFragment();
  f.append(' ', el('span', 'sep', '·'), ' ');
  return f;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

document.body.prepend(buildHeader());
document.body.appendChild(buildFooter());

// contact.html asks for the address inline too.
for (const slot of document.querySelectorAll('[data-mail-slot]')) {
  slot.replaceChildren(mailLink());
}
