// Projects list: curated entries from data/projects.json render immediately,
// then a single GitHub request overlays live language / stars / last-pushed.
//
// The curated list is the source of truth. If GitHub is rate-limited (60/hr
// unauthenticated) or unreachable, the page looks the same minus the live
// stats — never a spinner, never an error banner.

const ROOT = document.body.dataset.root || './';
const mount = document.getElementById('projects');
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

  const head = el('div', 'entry-head');
  const repoUrl = p.repo ? 'https://github.com/' + p.repo : (p.links && p.links.demo);
  const name = el(repoUrl ? 'a' : 'span', 'entry-name', p.name);
  if (repoUrl) { name.href = repoUrl; name.rel = 'noopener'; }
  head.appendChild(name);
  if (p.year) head.appendChild(el('span', 'entry-year', p.year));
  li.appendChild(head);

  if (p.blurb) li.appendChild(el('p', 'entry-blurb', p.blurb));

  // Curated stack renders now; the live row is filled in later if GitHub answers.
  const meta = el('div', 'entry-meta');
  meta.dataset.repo = p.repo ? shortRepo(p.repo) : '';
  meta.dataset.stack = (p.stack || []).join('|').toLowerCase();
  if (p.stack && p.stack.length) meta.appendChild(el('span', null, p.stack.join(' / ')));
  li.appendChild(meta);

  const links = el('div', 'entry-links');
  if (p.repo) {
    const a = el('a', null, 'Source');
    a.href = 'https://github.com/' + p.repo;
    a.rel = 'noopener';
    links.appendChild(a);
  }
  if (p.links && p.links.demo) {
    const a = el('a', null, 'Live');
    a.href = p.links.demo; a.rel = 'noopener';
    links.appendChild(a);
  }
  if (p.links && p.links.writeup) {
    const a = el('a', null, 'Write-up');
    a.href = p.links.writeup;
    links.appendChild(a);
  }
  if (links.children.length) li.appendChild(links);

  return li;
}

function applyStats(repos) {
  const byName = new Map(repos.map((r) => [r.name.toLowerCase(), r]));
  for (const meta of document.querySelectorAll('.entry-meta[data-repo]')) {
    const r = byName.get((meta.dataset.repo || '').toLowerCase());
    if (!r) continue;

    const live = el('span', 'live');
    const bits = [];
    // Skip the language when the curated stack already names it — otherwise
    // every single-language repo reads "RUST · RUST · UPDATED …".
    const stack = (meta.dataset.stack || '').split('|').filter(Boolean);
    if (r.language && !stack.includes(r.language.toLowerCase())) bits.push(r.language);
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
