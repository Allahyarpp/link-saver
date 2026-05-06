const STORAGE_KEY = 'ls_links';
const SORT_KEY = 'ls_sort';

const TAG_COLORS = [
  'tag-violet', 'tag-pink', 'tag-cyan', 'tag-amber',
  'tag-green', 'tag-orange', 'tag-indigo', 'tag-teal',
];

let links = [];
let activeTag = 'all';
let searchQuery = '';
let sortOrder = localStorage.getItem(SORT_KEY) || 'newest';
let modalTags = [];
let editingId = null;
const tagColorMap = new Map();

// ── Storage ──────────────────────────────────────────────
function loadLinks() {
  try {
    links = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    links = [];
  }
  migrateLegacyTimestamps();
}

function persistLinks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
}

function migrateLegacyTimestamps() {
  const missing = links.some(l => !l.createdAt);
  if (!missing) return;
  const base = Date.now();
  links.forEach((l, i) => {
    if (!l.createdAt) {
      // older index → older timestamp; space them 1 minute apart
      l.createdAt = base - (links.length - 1 - i) * 60_000;
    }
  });
  persistLinks();
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

function updateLink(id, { url, title, note, tags }) {
  const normalized = normalizeUrl(url);
  const idx = links.findIndex(l => l.id === id);
  if (idx === -1) return;
  links[idx] = { ...links[idx], url: normalized, title: title.trim() || getHostname(normalized), note: note.trim(), tags };
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

function getSortedLinks(arr) {
  const sorted = [...arr];
  switch (sortOrder) {
    case 'oldest': return sorted.sort((a, b) => a.createdAt - b.createdAt);
    case 'title-az': return sorted.sort((a, b) => a.title.localeCompare(b.title));
    case 'title-za': return sorted.sort((a, b) => b.title.localeCompare(a.title));
    case 'custom': return sorted; // preserves links array order (set by drag-and-drop)
    default: return sorted.sort((a, b) => b.createdAt - a.createdAt); // newest
  }
}

function renderLinks() {
  const grid = document.getElementById('linksGrid');
  const emptyState = document.getElementById('emptyState');
  const q = searchQuery.toLowerCase();

  const filtered = getSortedLinks(links.filter(l => {
    const tagMatch = activeTag === 'all' || l.tags.includes(activeTag);
    const searchMatch = !q ||
      l.title.toLowerCase().includes(q) ||
      l.url.toLowerCase().includes(q) ||
      l.tags.some(t => t.toLowerCase().includes(q));
    return tagMatch && searchMatch;
  }));

  if (filtered.length === 0) {
    grid.replaceChildren();
    const addBtn = emptyState.querySelector('#emptyStateAdd');
    if (q) {
      emptyState.querySelector('h2').textContent = `No results for "${searchQuery}"`;
      emptyState.querySelector('p').textContent = 'Try a different search term or clear the search.';
      if (addBtn) addBtn.hidden = true;
    } else if (activeTag !== 'all') {
      emptyState.querySelector('h2').textContent = `No links tagged "#${activeTag}"`;
      emptyState.querySelector('p').textContent = 'Try a different tag or clear the filter.';
      if (addBtn) addBtn.hidden = true;
    } else {
      emptyState.querySelector('h2').textContent = 'Your link library is empty';
      emptyState.querySelector('p').innerHTML = 'Start building your collection — click <strong>+ Add Link</strong> to save your first URL.';
      if (addBtn) addBtn.hidden = false;
    }
    emptyState.classList.remove('hiding');
    emptyState.hidden = false;
    return;
  }

  if (!emptyState.hidden) {
    emptyState.classList.add('hiding');
    emptyState.addEventListener('animationend', () => {
      emptyState.hidden = true;
      emptyState.classList.remove('hiding');
    }, { once: true });
  }

  const isTouchOnly = window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches;

  const cards = filtered.map((link, i) => {
    const article = document.createElement('article');
    article.className = 'link-card';
    article.dataset.id = link.id;
    article.style.animationDelay = `${i * 0.045}s`;

    if (!isTouchOnly) {
      article.draggable = true;
      if (sortOrder !== 'custom') {
        article.classList.add('drag-disabled');
        article.title = 'Switch to Custom order to reorder';
      }
    }

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
        <div class="card-actions" draggable="false">
          <button class="edit-btn" draggable="false" aria-label="Edit link">
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M13.586 3.586a2 2 0 1 1 2.828 2.828l-.793.793-2.828-2.828.793-.793ZM11.379 5.793 3 14.172V17h2.828l8.38-8.379-2.83-2.828Z"/>
            </svg>
          </button>
          <button class="delete-btn" draggable="false" aria-label="Delete link">✕</button>
        </div>
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

    article.addEventListener('click', () => window.open(link.url, '_blank', 'noopener,noreferrer'));
    article.querySelector('.card-title a').addEventListener('click', e => e.stopPropagation());
    article.querySelector('.edit-btn').addEventListener('click', e => { e.stopPropagation(); openEditModal(link); });
    article.querySelector('.delete-btn').addEventListener('click', e => { e.stopPropagation(); deleteLink(link.id); });

    if (!isTouchOnly) {
      article.addEventListener('dragstart', onDragStart);
      article.addEventListener('dragend', onDragEnd);
      article.addEventListener('dragover', onDragOver);
      article.addEventListener('dragleave', onDragLeave);
      article.addEventListener('drop', onDrop);
    }

    return article;
  });

  grid.replaceChildren(...cards);
}

function renderSortSelect() {
  const dropdown = document.getElementById('sortDropdown');
  const existingCustom = dropdown.querySelector('[data-sort="custom"]');

  if (!existingCustom) {
    const btn = document.createElement('button');
    btn.className = 'settings-item sort-item';
    btn.dataset.sort = 'custom';
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M3 4a1 1 0 0 0 0 2h14a1 1 0 1 0 0-2H3Zm0 5a1 1 0 0 0 0 2h8a1 1 0 1 0 0-2H3Zm0 5a1 1 0 1 0 0 2h4a1 1 0 1 0 0-2H3Z"/></svg>Custom order`;
    dropdown.appendChild(btn);
  }

  dropdown.querySelectorAll('.sort-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sort === sortOrder);
  });

  const toggle = document.getElementById('sortToggle');
  toggle.classList.toggle('active', sortOrder !== 'newest');
}

// ── Drag-and-drop reordering ──────────────────────────────
let dragSrcId = null;
let pendingReorder = false;

function onDragStart(e) {
  dragSrcId = this.dataset.id;
  pendingReorder = false;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragSrcId);
  this.classList.add('dragging');
  if (sortOrder !== 'custom') {
    sortOrder = 'custom';
    localStorage.setItem(SORT_KEY, sortOrder);
  }
}

function onDragEnd() {
  this.classList.remove('dragging');
  document.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el => {
    el.classList.remove('drag-over-top', 'drag-over-bottom');
  });
  if (pendingReorder) {
    pendingReorder = false;
    render();
  }
  dragSrcId = null;
}

function getDropPosition(e, target) {
  const rect = target.getBoundingClientRect();
  return e.clientY < rect.top + rect.height / 2 ? 'top' : 'bottom';
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  if (this.dataset.id === dragSrcId) return;
  document.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el => {
    el.classList.remove('drag-over-top', 'drag-over-bottom');
  });
  const pos = getDropPosition(e, this);
  this.classList.add(pos === 'top' ? 'drag-over-top' : 'drag-over-bottom');
}

function onDragLeave(e) {
  if (!this.contains(e.relatedTarget)) {
    this.classList.remove('drag-over-top', 'drag-over-bottom');
  }
}

function onDrop(e) {
  e.preventDefault();
  this.classList.remove('drag-over-top', 'drag-over-bottom');
  const targetId = this.dataset.id;
  if (!dragSrcId || dragSrcId === targetId) return;

  const srcIdx = links.findIndex(l => l.id === dragSrcId);
  if (srcIdx === -1) return;
  const pos = getDropPosition(e, this);
  const [removed] = links.splice(srcIdx, 1);
  const insertAt = links.findIndex(l => l.id === targetId);
  if (insertAt === -1) { links.push(removed); } else {
    links.splice(pos === 'top' ? insertAt : insertAt + 1, 0, removed);
  }

  persistLinks();
  pendingReorder = true;
}

function renderLinkCounter() {
  const numEl = document.getElementById('linkCountNum');
  const next = links.length;
  const prev = parseInt(numEl.textContent, 10);
  if (next !== prev) {
    numEl.textContent = next;
    numEl.classList.remove('bump');
    void numEl.offsetWidth; // reflow to restart animation
    numEl.classList.add('bump');
  }
}

function render() {
  renderTagBar();
  renderSortSelect();
  renderLinks();
  renderLinkCounter();
}

// ── Modal ─────────────────────────────────────────────────
function openModal() {
  document.getElementById('modalOverlay').classList.add('open');
  setTimeout(() => document.getElementById('inputUrl').focus(), 50);
}

function closeModal() {
  clearTimeout(titleFetchTimer);
  document.getElementById('inputTitle').placeholder = '';
  editingId = null;
  document.getElementById('modalTitle').textContent = 'Add Link';
  document.getElementById('saveBtn').textContent = 'Save Link';
  document.getElementById('modalOverlay').classList.remove('open');
  document.getElementById('linkForm').reset();
  clearUrlError();
  modalTags = [];
  renderModalTagPills();
}

function openEditModal(link) {
  editingId = link.id;
  document.getElementById('modalTitle').textContent = 'Edit Link';
  document.getElementById('saveBtn').textContent = 'Update';
  document.getElementById('inputUrl').value = link.url;
  document.getElementById('inputTitle').value = link.title;
  document.getElementById('inputNote').value = link.note;
  modalTags = [...link.tags];
  renderModalTagPills();
  document.getElementById('modalOverlay').classList.add('open');
  setTimeout(() => document.getElementById('inputUrl').focus(), 50);
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

// ── URL title fetch ───────────────────────────────────────
let titleFetchTimer = null;

async function fetchAndFillTitle(url) {
  const titleInput = document.getElementById('inputTitle');
  if (titleInput.value.trim()) return;

  titleInput.placeholder = 'Fetching title…';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(
      `https://api.microlink.io/?url=${encodeURIComponent(url)}`,
      { signal: controller.signal }
    );
    const data = await res.json();
    if (data?.data?.title && !titleInput.value.trim()) {
      titleInput.value = data.data.title;
    }
  } catch {
    // silently give up on network errors or timeouts
  } finally {
    clearTimeout(timeout);
    titleInput.placeholder = '';
  }
}

function onUrlInput() {
  if (editingId) return;
  clearTimeout(titleFetchTimer);
  const raw = document.getElementById('inputUrl').value.trim();
  if (!raw) return;
  let url;
  try { url = new URL(normalizeUrl(raw)); } catch { return; }
  titleFetchTimer = setTimeout(() => fetchAndFillTitle(url.href), 600);
}

// ── Toast ─────────────────────────────────────────────────
function showToast(message, isError = false) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast' + (isError ? ' toast-error' : '');
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toastOut 0.22s ease both';
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, 2800);
}

// ── Export ────────────────────────────────────────────────
function exportLinks() {
  const json = JSON.stringify(links, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `linkvault-backup-${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Import ────────────────────────────────────────────────
function importLinks(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    let parsed;
    try {
      parsed = JSON.parse(e.target.result);
    } catch {
      showToast('Invalid backup file', true);
      return;
    }

    if (
      !Array.isArray(parsed) ||
      parsed.some(item => typeof item !== 'object' || item === null || !item.id || !item.url)
    ) {
      showToast('Invalid backup file', true);
      return;
    }

    const confirmed = confirm(
      `Import ${parsed.length} link${parsed.length !== 1 ? 's' : ''}? This will REPLACE your current ${links.length} link${links.length !== 1 ? 's' : ''}. Continue?`
    );
    if (!confirmed) return;

    links = parsed;
    persistLinks();
    render();
    showToast(`Imported ${parsed.length} link${parsed.length !== 1 ? 's' : ''}`);
  };
  reader.readAsText(file);
}

// ── Init ─────────────────────────────────────────────────
function init() {
  loadLinks();
  render();

  document.getElementById('openModal').addEventListener('click', openModal);
  document.getElementById('emptyStateAdd').addEventListener('click', openModal);
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

  document.getElementById('inputUrl').addEventListener('input', () => { clearUrlError(); onUrlInput(); });

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

  const sortToggle = document.getElementById('sortToggle');
  const sortDropdown = document.getElementById('sortDropdown');

  sortToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !sortDropdown.hidden;
    sortDropdown.hidden = isOpen;
    sortToggle.setAttribute('aria-expanded', String(!isOpen));
    sortToggle.classList.toggle('active', !isOpen || sortOrder !== 'newest');
  });

  sortDropdown.addEventListener('click', (e) => {
    const btn = e.target.closest('.sort-item');
    if (!btn) return;
    sortOrder = btn.dataset.sort;
    localStorage.setItem(SORT_KEY, sortOrder);
    sortDropdown.hidden = true;
    sortToggle.setAttribute('aria-expanded', 'false');
    render();
  });

  document.addEventListener('click', (e) => {
    if (!document.getElementById('sortMenu').contains(e.target)) {
      sortDropdown.hidden = true;
      sortToggle.setAttribute('aria-expanded', 'false');
    }
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

  // Settings dropdown
  const settingsToggle = document.getElementById('settingsToggle');
  const settingsDropdown = document.getElementById('settingsDropdown');

  settingsToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !settingsDropdown.hidden;
    settingsDropdown.hidden = isOpen;
    settingsToggle.setAttribute('aria-expanded', String(!isOpen));
    settingsToggle.classList.toggle('active', !isOpen);
  });

  document.addEventListener('click', (e) => {
    if (!document.getElementById('settingsMenu').contains(e.target)) {
      settingsDropdown.hidden = true;
      settingsToggle.setAttribute('aria-expanded', 'false');
      settingsToggle.classList.remove('active');
    }
  });

  document.getElementById('exportBtn').addEventListener('click', () => {
    settingsDropdown.hidden = true;
    settingsToggle.setAttribute('aria-expanded', 'false');
    settingsToggle.classList.remove('active');
    exportLinks();
  });

  const importFileInput = document.getElementById('importFileInput');

  document.getElementById('importBtn').addEventListener('click', () => {
    settingsDropdown.hidden = true;
    settingsToggle.setAttribute('aria-expanded', 'false');
    settingsToggle.classList.remove('active');
    importFileInput.value = '';
    importFileInput.click();
  });

  importFileInput.addEventListener('change', () => {
    if (importFileInput.files.length > 0) {
      importLinks(importFileInput.files[0]);
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

    const payload = {
      url: rawUrl,
      title: document.getElementById('inputTitle').value,
      note: document.getElementById('inputNote').value,
      tags: [...modalTags],
    };

    if (editingId) {
      updateLink(editingId, payload);
    } else {
      addLink(payload);
    }

    closeModal();
  });
}

document.addEventListener('DOMContentLoaded', init);
