// Projects list: curated entries from data/projects.json render immediately,
// then a single GitHub request overlays live language / stars / last-pushed.
//
// The curated list is the source of truth. If GitHub is rate-limited (60/hr
// unauthenticated) or unreachable, the page looks the same minus the live
// stats — never a spinner, never an error banner.

const ROOT = document.body.dataset.root || './';
const mount = document.getElementById('projects-list');
const CACHE_KEY = 'gh-repos';
const CACHE_MS = 10 * 60 * 1000;

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function sep() { return el('span', 'sep', '·'); }

function shortRepo(repo) {
  return repo.includes('/') ? repo.split('/')[1] : repo;
}

function renderEntry(p) {
  const li = el('li', 'entry' + (p.status === 'archived' ? ' status-archived' : ''));
  const repoUrl = p.repo ? 'https://github.com/' + p.repo : (p.links && p.links.demo);

  // Left column: the name, with the year and the live GitHub stats beneath it.
  const left = el('div');
  const name = el(repoUrl ? 'a' : 'span', 'entry-name', p.name);
  if (repoUrl) { name.href = repoUrl; name.rel = 'noopener'; }
  left.appendChild(name);

  const meta = el('div', 'entry-meta');
  meta.dataset.repo = p.repo ? shortRepo(p.repo) : '';
  if (p.year) meta.appendChild(el('span', null, p.year));
  left.appendChild(meta);
  li.appendChild(left);

  // Right column: description, stack, then links.
  const right = el('div');
  if (p.blurb) right.appendChild(el('p', 'entry-blurb', p.blurb));

  if (p.stack && p.stack.length) {
    const stack = el('ul', 'stack');
    for (const tech of p.stack) stack.appendChild(el('li', null, tech));
    right.appendChild(stack);
  }

  const links = el('div', 'entry-links');
  const addLink = (text, href, external) => {
    const a = el('a', null, text);
    a.href = href;
    if (external) a.rel = 'noopener';
    a.appendChild(el('span', 'arrow', external ? '\u2197' : '\u2192'));
    links.appendChild(a);
  };
  if (p.repo) addLink('Source', 'https://github.com/' + p.repo, true);
  if (p.links && p.links.demo) addLink('Live', p.links.demo, true);
  if (p.links && p.links.writeup) addLink('Write-up', p.links.writeup, false);
  if (links.children.length) right.appendChild(links);

  li.appendChild(right);
  return li;
}

function applyStats(repos) {
  const byName = new Map(repos.map((r) => [r.name.toLowerCase(), r]));
  for (const meta of document.querySelectorAll('.entry-meta[data-repo]')) {
    const r = byName.get((meta.dataset.repo || '').toLowerCase());
    if (!r) continue;

    const live = el('span', 'live');
    const bits = [];
    // The language is deliberately absent: it is already a pill in the stack
    // column, and printing it here read as "2026 · Rust · Rust".
    if (r.stargazers_count > 0) bits.push('★ ' + r.stargazers_count);
    if (r.pushed_at) {
      const d = new Date(r.pushed_at);
      bits.push('updated ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear());
    }
    if (!bits.length) continue;

    live.textContent = bits.join(' · ');
    if (meta.children.length) meta.appendChild(sep());
    meta.appendChild(live);

    // Sort key: real recency, when we have it.
    const li = meta.closest('.entry');
    if (li && r.pushed_at) li.dataset.pushed = r.pushed_at;
  }
}

function cached() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { at, repos } = JSON.parse(raw);
    return Date.now() - at < CACHE_MS ? repos : null;
  } catch { return null; }
}

function cache(repos) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), repos }));
  } catch { /* private mode, quota — the page works without it */ }
}

async function fetchRepos(user) {
  const hit = cached();
  if (hit) return hit;
  const res = await fetch(
    `https://api.github.com/users/${encodeURIComponent(user)}/repos?per_page=100&sort=pushed`,
    { headers: { Accept: 'application/vnd.github+json' } }
  );
  if (!res.ok) throw new Error('github ' + res.status);
  const repos = (await res.json()).map(
    ({ name, language, stargazers_count, pushed_at, description }) =>
      ({ name, language, stargazers_count, pushed_at, description })
  );
  cache(repos);
  return repos;
}

async function main() {
  let data;
  try {
    const res = await fetch(ROOT + 'data/projects.json', { cache: 'no-cache' });
    data = await res.json();
  } catch {
    mount.replaceWith(el('p', 'empty', 'Could not load the project list.'));
    return;
  }

  const list = (data.projects || []).slice().sort((a, b) => {
    if (!!b.featured !== !!a.featured) return b.featured ? 1 : -1;
    return String(b.year || '').localeCompare(String(a.year || ''));
  });

  if (!list.length) {
    mount.replaceWith(el('p', 'empty', 'Nothing here yet.'));
    return;
  }

  mount.replaceChildren(...list.map(renderEntry));

  // Live stats are a bonus layer; a failure here leaves the curated page intact.
  try {
    applyStats(await fetchRepos(data.githubUser || 'junhorkan'));
  } catch (err) {
    console.info('GitHub stats unavailable:', err.message);
  }
}

main();
