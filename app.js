const STORAGE_KEY = 'ls_links';

const TAG_COLORS = [
  'tag-violet', 'tag-pink', 'tag-cyan', 'tag-amber',
  'tag-green', 'tag-orange', 'tag-indigo', 'tag-teal',
];

let links = [];
let activeTag = 'all';
let searchQuery = '';
let modalTags = [];
const tagColorMap = new Map();

// ── Storage ──────────────────────────────────────────────
function loadLinks() {
  try {
    links = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    links = [];
  }
}

function persistLinks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
}

// ── Helpers ──────────────────────────────────────────────
function normalizeUrl(raw) {
  const trimmed = raw.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : 'https://' + trimmed;
}

function getHostname(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function getFaviconUrl(url) {
  return `https://www.google.com/s2/favicons?sz=32&domain=${getHostname(url)}`;
}

function formatDate(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30)  return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function getTagColor(tag) {
  if (!tagColorMap.has(tag)) {
    tagColorMap.set(tag, TAG_COLORS[tagColorMap.size % TAG_COLORS.length]);
  }
  return tagColorMap.get(tag);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getAllTags() {
  const set = new Set();
  links.forEach(l => l.tags.forEach(t => set.add(t)));
  return [...set];
}

// ── CRUD ─────────────────────────────────────────────────
function addLink({ url, title, note, tags }) {
  const normalized = normalizeUrl(url);
  links.unshift({
    id: crypto.randomUUID(),
    url: normalized,
    title: title.trim() || getHostname(normalized),
    note: note.trim(),
    tags,
    createdAt: Date.now(),
  });
  persistLinks();
  render();
}

function deleteLink(id) {
  const card = document.querySelector(`.link-card[data-id="${id}"]`);
  if (!card) return;
  card.classList.add('deleting');
  card.addEventListener('animationend', () => {
    links = links.filter(l => l.id !== id);
    persistLinks();
    render();
  }, { once: true });
}

// ── Render ───────────────────────────────────────────────
function renderTagBar() {
  const bar = document.getElementById('tagBar');
  const allTags = getAllTags();

  if (allTags.length === 0) {
    bar.hidden = true;
    return;
  }

  bar.hidden = false;
  bar.replaceChildren(
    ...['all', ...allTags].map(tag => {
      const btn = document.createElement('button');
      btn.className = `filter-pill${tag === activeTag ? ' active' : ''}`;
      btn.textContent = tag === 'all' ? 'All' : `#${tag}`;
      btn.addEventListener('click', () => { activeTag = tag; render(); });
      return btn;
    })
  );
}

function renderLinks() {
  const grid = document.getElementById('linksGrid');
  const emptyState = document.getElementById('emptyState');
  const q = searchQuery.toLowerCase();

  const filtered = links.filter(l => {
    const tagMatch = activeTag === 'all' || l.tags.includes(activeTag);
    const searchMatch = !q ||
      l.title.toLowerCase().includes(q) ||
      l.url.toLowerCase().includes(q) ||
      l.tags.some(t => t.toLowerCase().includes(q));
    return tagMatch && searchMatch;
  });

  if (filtered.length === 0) {
    grid.replaceChildren();
    emptyState.hidden = false;
    if (q) {
      emptyState.querySelector('h2').textContent = `No results for "${searchQuery}"`;
      emptyState.querySelector('p').textContent = 'Try a different search term or clear the search.';
    } else if (activeTag !== 'all') {
      emptyState.querySelector('h2').textContent = `No links tagged "#${activeTag}"`;
      emptyState.querySelector('p').textContent = 'Try a different tag or clear the filter.';
    } else {
      emptyState.querySelector('h2').textContent = 'No links saved yet';
      emptyState.querySelector('p').innerHTML = 'Click <strong>+ Add Link</strong> to save your first URL.';
    }
    return;
  }

  emptyState.hidden = true;

  const cards = filtered.map((link, i) => {
    const article = document.createElement('article');
    article.className = 'link-card';
    article.dataset.id = link.id;
    article.style.animationDelay = `${i * 0.045}s`;

    const tagsHtml = link.tags.map(t =>
      `<span class="tag ${getTagColor(t)}">#${escHtml(t)}</span>`
    ).join('');

    const fallbackSvg = encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" fill="rgba(255,255,255,0.25)"/><text x="8" y="12" text-anchor="middle" font-size="10" fill="white">🔗</text></svg>`
    );

    article.innerHTML = `
      <div class="card-top">
        <img class="favicon" src="${getFaviconUrl(link.url)}" alt=""
             onerror="this.src='data:image/svg+xml,${fallbackSvg}'" loading="lazy">
        <button class="delete-btn" data-id="${escHtml(link.id)}" aria-label="Delete link">✕</button>
      </div>
      <div class="card-body">
        <h3 class="card-title">
          <a href="${escHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escHtml(link.title)}</a>
        </h3>
        <span class="card-url">${escHtml(getHostname(link.url))}</span>
        ${link.note ? `<p class="card-note">${escHtml(link.note)}</p>` : ''}
      </div>
      ${tagsHtml ? `<div class="card-tags">${tagsHtml}</div>` : ''}
      <time class="card-date">${formatDate(link.createdAt)}</time>
    `;

    article.querySelector('.delete-btn').addEventListener('click', () => deleteLink(link.id));
    return article;
  });

  grid.replaceChildren(...cards);
}

function render() {
  renderTagBar();
  renderLinks();
}

// ── Modal ─────────────────────────────────────────────────
function openModal() {
  document.getElementById('modalOverlay').classList.add('open');
  setTimeout(() => document.getElementById('inputUrl').focus(), 50);
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.getElementById('linkForm').reset();
  clearUrlError();
  modalTags = [];
  renderModalTagPills();
}

function clearUrlError() {
  document.getElementById('inputUrl').classList.remove('invalid');
  document.getElementById('urlError').classList.remove('visible');
}

function showUrlError() {
  document.getElementById('inputUrl').classList.add('invalid');
  document.getElementById('urlError').classList.add('visible');
}

// ── Modal tag input ───────────────────────────────────────
function renderModalTagPills() {
  const container = document.getElementById('tagPillsInput');
  container.replaceChildren(
    ...modalTags.map(tag => {
      const span = document.createElement('span');
      span.className = 'modal-tag-pill';
      span.innerHTML = `${escHtml(tag)} <button type="button" aria-label="Remove ${escHtml(tag)}">✕</button>`;
      span.querySelector('button').addEventListener('click', () => {
        modalTags = modalTags.filter(t => t !== tag);
        renderModalTagPills();
      });
      return span;
    })
  );
}

function commitTagInput() {
  const input = document.getElementById('inputTag');
  const val = input.value.replace(/,/g, '').trim().toLowerCase();
  if (val && !modalTags.includes(val)) {
    modalTags.push(val);
    renderModalTagPills();
  }
  input.value = '';
}

// ── Init ─────────────────────────────────────────────────
function init() {
  loadLinks();
  render();

  document.getElementById('openModal').addEventListener('click', openModal);
  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('cancelModal').addEventListener('click', closeModal);

  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  document.getElementById('inputTag').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitTagInput();
    }
  });

  document.getElementById('inputUrl').addEventListener('input', clearUrlError);

  const searchInput = document.getElementById('searchInput');
  const searchClear = document.getElementById('searchClear');

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    searchClear.hidden = !searchQuery;
    render();
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    searchClear.hidden = true;
    searchInput.focus();
    render();
  });

  const searchWrapper = document.getElementById('searchWrapper');
  const searchToggleBtn = document.getElementById('searchToggle');

  searchToggleBtn.addEventListener('click', () => {
    const isOpen = !searchWrapper.hidden;
    if (isOpen) {
      searchWrapper.hidden = true;
      searchToggleBtn.classList.remove('active');
      searchInput.value = '';
      searchQuery = '';
      searchClear.hidden = true;
      render();
    } else {
      searchWrapper.hidden = false;
      searchToggleBtn.classList.add('active');
      searchInput.focus();
    }
  });

  document.getElementById('tagInputWrapper').addEventListener('click', () => {
    document.getElementById('inputTag').focus();
  });

  document.getElementById('linkForm').addEventListener('submit', e => {
    e.preventDefault();
    const urlInput = document.getElementById('inputUrl');
    const rawUrl = urlInput.value.trim();

    if (!rawUrl) { showUrlError(); urlInput.focus(); return; }

    try { new URL(normalizeUrl(rawUrl)); } catch {
      showUrlError();
      urlInput.focus();
      return;
    }

    commitTagInput();

    addLink({
      url: rawUrl,
      title: document.getElementById('inputTitle').value,
      note: document.getElementById('inputNote').value,
      tags: [...modalTags],
    });

    closeModal();
  });
}

document.addEventListener('DOMContentLoaded', init);
