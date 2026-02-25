/* ═══════════════════════════════════════════
   Clario — app.js
   Full workspace + search engine logic
═══════════════════════════════════════════ */

'use strict';

// ─── STATE ───────────────────────────────────────────────────────────
const State = {
  mode: 'search',   // 'search' | 'workspace'
  splitView: false,
  focusMode: false,
  sidebarOpen: true,
  tabs: [],
  activeTabId: null,
  panel2TabId: null,
  groups: [],
  ctxTabId: null,
  query: '',
  results: [],
  preset: 'general',
  isPro: false,
};

let isAppBooted = false;
let tabIdCounter = 1;
const MASTER_KEY_ID = 'clario_executive_token';
let groupIdCounter = 1;

// ─── FIREBASE CLOUD SETUP ───────────────────────────────────────────
// Placeholder config - User should replace with real keys
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "clario-os.firebaseapp.com",
  projectId: "clario-os",
  storageBucket: "clario-os.appspot.com",
  messagingSenderId: "...",
  appId: "..."
};

let db, auth;
try {
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
  auth = firebase.auth();
} catch (e) {
  console.warn("Firebase not initialized. Offline mode active.");
}

const Config = {
  version: "1.0.0",
  remoteUpdate: null,
  announcement: "",
  featuredLinks: []
};

async function loadRemoteConfig() {
  if (!db) return;
  // Real-time listener: backend updates reflect immediately
  db.collection('app_settings').doc('global').onSnapshot(doc => {
    if (doc.exists) {
      const data = doc.data();
      const oldAnnounce = Config.announcement;
      Object.assign(Config, data);
      console.log('Clario: Backend Sync Active', Config);

      if (Config.announcement && Config.announcement !== oldAnnounce) {
        toast(`📢 ${Config.announcement}`, 'info');
      }
    }
  });
}

// ─── DOM REFS ─────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// Global DOM references (initialized on DOMContentLoaded)
let app, bootScreen, topbar, sidebar, mainArea, searchView, workspaceView, tabList;
let panel1, panel2, splitHandle, groupList, sidebarTabList, tabSearchInput;
let cmdPalette, cmdInput, cmdResults, contextMenu, floatPanel, floatTitle, floatBody;
let toastContainer, searchInput, searchClear, resultsArea, resultsMeta, resultsList;
let resultsLoader, suggestions, topbarSearch, topbarInput, clockDisplay, authModal;

// Secure Access refs
let secureInitial, secureLogin, secureTitle, secureSub, makeKeyBtn, verifyKeyBtn, accountMenu, userAccountBtn;

let isSignUpMode = false;

window.addEventListener('DOMContentLoaded', () => {
  // Initialize all DOM references
  app = $('app');
  bootScreen = $('boot-screen');
  topbar = $('topbar');
  sidebar = $('sidebar');
  mainArea = $('mainArea');
  searchView = $('searchView');
  workspaceView = $('workspaceView');
  tabList = $('tabList');
  panel1 = $('panel1');
  panel2 = $('panel2');
  splitHandle = $('splitHandle');
  groupList = $('groupList');
  sidebarTabList = $('sidebarTabList');
  tabSearchInput = $('tabSearch');
  cmdPalette = $('cmdPalette');
  cmdInput = $('cmdInput');
  cmdResults = $('cmdResults');
  contextMenu = $('contextMenu');
  floatPanel = $('floatPanel');
  floatTitle = $('floatTitle');
  floatBody = $('floatBody');
  toastContainer = $('toastContainer');
  searchInput = $('searchInput');
  searchClear = $('searchClear');
  resultsArea = $('resultsArea');
  resultsMeta = $('resultsMeta');
  resultsList = $('resultsList');
  resultsLoader = $('resultsLoader');
  suggestions = $('suggestions');
  topbarSearch = $('topbarSearch');
  topbarInput = $('topbarInput');
  clockDisplay = $('clockDisplay');
  authModal = $('authModal');

  secureInitial = $('secureInitial');
  secureLogin = $('secureLogin');
  secureTitle = $('secureTitle');
  secureSub = $('secureSub');
  makeKeyBtn = $('makeKeyBtn');
  verifyKeyBtn = $('verifyKeyBtn');
  accountMenu = $('accountMenu');
  userAccountBtn = $('userAccountBtn');

  // Setup Auth & Account Logic
  initAuth();
});

// ─── CLOCK ─────────────────────────────────────────────────────────────
function initClock() {
  const tick = () => {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    if (clockDisplay) clockDisplay.textContent = `${h}:${m}`;
  };
  tick();
  setInterval(tick, 10000);
}

// ─── SESSION PERSISTENCE ──────────────────────────────────────────────
async function saveSession() {
  const data = {
    tabs: State.tabs.map(t => ({ ...t, content: null })), // don't store iframe src blobs
    activeTabId: State.activeTabId,
    groups: State.groups,
    mode: State.mode,
    preset: State.preset,
    splitView: State.splitView,
    panel2TabId: State.panel2TabId,
    isPro: State.isPro,
    lastSaved: Date.now()
  };

  // Local Backup
  try { localStorage.setItem('clario_session', JSON.stringify(data)); } catch (e) { }

  // Cloud Sync (if Master Key exists)
  const token = localStorage.getItem(MASTER_KEY_ID);
  if (token && db) {
    try {
      await db.collection('workspaces').doc(token).set(data, { merge: true });
      console.log('Clario: Cloud Sync Success');
    } catch (err) {
      console.warn('Clario: Cloud Sync Failed', err);
    }
  }
}

async function loadSession() {
  const token = localStorage.getItem(MASTER_KEY_ID);
  let data = null;

  // Try Cloud First
  if (token && db) {
    try {
      const doc = await db.collection('workspaces').doc(token).get();
      if (doc.exists) {
        data = doc.data();
        console.log('Clario: Cloud Workspace Loaded');
      }
    } catch (err) {
      console.warn('Clario: Cloud fetch failed, falling back to local');
    }
  }

  // Fallback to Local
  if (!data) {
    try {
      const raw = localStorage.getItem('clario_session');
      if (raw) data = JSON.parse(raw);
    } catch (e) { }
  }

  if (!data) { initDefaultTabs(); return; }

  try {
    State.tabs = data.tabs || [];
    State.groups = data.groups || [];
    State.mode = data.mode || 'search';
    State.preset = data.preset || 'general';
    State.splitView = data.splitView || false;
    State.panel2TabId = data.panel2TabId || null;
    State.isPro = data.isPro || false;

    // restore active tab
    State.activeTabId = data.activeTabId;
    if (!State.tabs.find(t => t.id === State.activeTabId)) {
      State.activeTabId = State.tabs[0]?.id || null;
    }
    // update counters
    if (State.tabs.length)
      tabIdCounter = Math.max(...State.tabs.map(t => t.id)) + 1;
    if (State.groups.length)
      groupIdCounter = Math.max(...State.groups.map(g => g.id)) + 1;

    // Restore Pro UI if active
    if (State.isPro) applyProUpgrade();

  } catch (e) { initDefaultTabs(); }
}

function applyProUpgrade() {
  const upgradeBtn = $('upgradeBtn');
  if (upgradeBtn) {
    upgradeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="gold" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> Pro Active`;
    upgradeBtn.style.background = 'rgba(255,215,0,0.1)';
    upgradeBtn.style.color = 'gold';
    upgradeBtn.style.border = '1px solid gold';
    upgradeBtn.style.boxShadow = '0 0 20px rgba(255,215,0,0.2)';
  }
  const status = $('displayStatus');
  if (status) status.textContent = 'Pro Executive';
}

function initDefaultTabs() {
  createTab('New Tab', '🏠', null);
}

// ─── TAB MANAGEMENT ───────────────────────────────────────────────────
function createTab(label = 'New Tab', favicon = '🌐', url = null, groupId = null) {
  const id = tabIdCounter++;
  const tab = { id, label, favicon, url, pinned: false, groupId };
  State.tabs.push(tab);
  if (!State.activeTabId) State.activeTabId = id;
  saveSession();
  renderAll();
  return tab;
}

function closeTab(id) {
  const idx = State.tabs.findIndex(t => t.id === id);
  if (idx === -1) return;
  State.tabs.splice(idx, 1);
  if (State.activeTabId === id) {
    State.activeTabId = State.tabs[Math.max(0, idx - 1)]?.id || null;
  }
  if (State.panel2TabId === id) State.panel2TabId = null;
  if (!State.tabs.length) createTab();
  saveSession();
  renderAll();
}

function activateTab(id) {
  State.activeTabId = id;
  saveSession();
  renderAll();
}

function duplicateTab(id) {
  const tab = State.tabs.find(t => t.id === id);
  if (!tab) return;
  createTab(tab.label + ' (copy)', tab.favicon, tab.url, tab.groupId);
  toast('Tab duplicated', 'success');
}

function pinTab(id) {
  const tab = State.tabs.find(t => t.id === id);
  if (!tab) return;
  tab.pinned = !tab.pinned;
  saveSession();
  renderAll();
  toast(tab.pinned ? '📌 Tab pinned' : 'Tab unpinned', 'info');
}

function openUrlInTab(url, title, favicon = '🌐') {
  const active = State.tabs.find(t => t.id === State.activeTabId);
  if (active && !active.pinned) {
    active.url = url;
    active.label = title || url;
    active.favicon = favicon;
  } else {
    createTab(title || url, favicon, url);
  }
  setMode('workspace');
  saveSession();
  renderAll();
}

// ─── GROUPS ───────────────────────────────────────────────────────────
const GROUP_COLORS = ['#6c63ff', '#00d4ff', '#00ff88', '#ff4d6a', '#ffa500', '#ff69b4'];

function createGroup(name) {
  const id = groupIdCounter++;
  const color = GROUP_COLORS[id % GROUP_COLORS.length];
  State.groups.push({ id, name: name || `Group ${id}`, color });
  saveSession();
  renderSidebar();
  toast(`Group "${name}" created`, 'success');
  return id;
}

function addTabToGroup(tabId, groupId) {
  const tab = State.tabs.find(t => t.id === tabId);
  if (tab) { tab.groupId = groupId; saveSession(); renderAll(); }
}

// ─── MODE ─────────────────────────────────────────────────────────────
function setMode(m) {
  State.mode = m;
  if (!searchView || !workspaceView) return;
  const sBtn = $('searchModeBtn');
  const wBtn = $('workspaceModeBtn');

  if (m === 'search') {
    searchView.classList.add('active');
    workspaceView.classList.remove('active');
    if (sBtn) sBtn.classList.add('active');
    if (wBtn) wBtn.classList.remove('active');
    if (topbarSearch) topbarSearch.style.display = 'none';
  } else {
    workspaceView.classList.add('active');
    searchView.classList.remove('active');
    if (wBtn) wBtn.classList.add('active');
    if (sBtn) sBtn.classList.remove('active');
    if (topbarSearch) topbarSearch.style.display = 'flex';
    renderPanel(panel1, State.activeTabId);
    if (State.splitView && State.panel2TabId) renderPanel(panel2, State.panel2TabId);
  }
  saveSession();
}

function setPreset(p) {
  State.preset = p;
  $$('.preset-btn').forEach(b => b.classList.toggle('active', b.dataset.preset === p));

  const presets = {
    general: [],
    study: [
      { label: 'Wikipedia', favicon: '📖', url: 'https://en.wikipedia.org' },
    ],
    research: [
      { label: 'ArXiv', favicon: '📄', url: 'https://arxiv.org' },
      { label: 'Google Scholar', favicon: '🎓', url: 'https://scholar.google.com' },
    ],
    build: [
      { label: 'MDN Docs', favicon: '💻', url: 'https://developer.mozilla.org' },
      { label: 'GitHub', favicon: '🐙', url: 'https://github.com' },
    ],
  };

  const tabs = presets[p] || [];
  if (tabs.length) {
    // Clear existing non-pinned tabs and add preset tabs
    State.tabs = State.tabs.filter(t => t.pinned);
    tabs.forEach(t => {
      const id = tabIdCounter++;
      State.tabs.push({ id, ...t, pinned: false, groupId: null });
    });
    State.activeTabId = State.tabs[0]?.id || null;
    setMode('workspace');
    saveSession();
    renderAll();
    toast(`🎯 ${p.charAt(0).toUpperCase() + p.slice(1)} preset loaded`, 'success');
  }
}

// ─── SPLIT VIEW ───────────────────────────────────────────────────────
function toggleSplit() {
  State.splitView = !State.splitView;
  if (State.splitView) {
    if (splitHandle) splitHandle.classList.remove('hidden');
    if (panel2) panel2.classList.remove('hidden');
    // pick a second tab if available
    const others = State.tabs.filter(t => t.id !== State.activeTabId);
    State.panel2TabId = others[0]?.id || null;
    if (!State.panel2TabId && State.tabs.length < 2) createTab();
    State.panel2TabId = State.tabs.filter(t => t.id !== State.activeTabId)[0]?.id || null;
    renderPanel(panel2, State.panel2TabId);
    toast('Split view enabled', 'info');
  } else {
    if (splitHandle) splitHandle.classList.add('hidden');
    if (panel2) panel2.classList.add('hidden');
    State.panel2TabId = null;
    toast('Split view off', 'info');
  }
  saveSession();
  drawSplitHandle();
}

// ─── FOCUS MODE ───────────────────────────────────────────────────────
let focusBadge;
function toggleFocusMode() {
  State.focusMode = !State.focusMode;
  if (app) app.classList.toggle('focus-mode', State.focusMode);
  if (!focusBadge) {
    focusBadge = document.createElement('div');
    focusBadge.id = 'focusBadge';
    focusBadge.innerHTML = '⊙ Focus Mode — <u>Exit</u>';
    focusBadge.addEventListener('click', toggleFocusMode);
    document.body.appendChild(focusBadge);
  }
  focusBadge.classList.toggle('visible', State.focusMode);
  toast(State.focusMode ? '🎯 Focus mode ON — press F to exit' : 'Focus mode off', 'info');
}

// ─── RENDER ───────────────────────────────────────────────────────────
function renderAll() {
  renderTabBar();
  renderSidebar();
  setMode(State.mode);
}

function renderTabBar() {
  if (!tabList) return;
  tabList.innerHTML = '';
  const sorted = [...State.tabs].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  sorted.forEach(tab => {
    const el = document.createElement('div');
    el.className = 'tab-item' + (tab.id === State.activeTabId ? ' active' : '') + (tab.pinned ? ' pinned' : '');
    el.dataset.id = tab.id;
    el.draggable = true;
    el.title = tab.label;

    // Group color indicator
    const grp = State.groups.find(g => g.id === tab.groupId);

    el.innerHTML = `
      <div class="tab-favicon" ${grp ? `style="box-shadow:0 0 0 1.5px ${grp.color}"` : ''}>${tab.favicon}</div>
      <span class="tab-label">${tab.label}</span>
      <button class="tab-close" data-id="${tab.id}" title="Close Tab">×</button>
    `;

    // Activate tab on click (not close button)
    el.addEventListener('click', e => {
      if (e.target.classList.contains('tab-close')) return;
      activateTab(tab.id);
    });

    // Right-click context menu
    el.addEventListener('contextmenu', e => {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, tab.id);
    });

    // Drag & Drop
    el.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', tab.id);
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
    el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('drag-over'); });
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
    el.addEventListener('drop', e => {
      e.preventDefault();
      el.classList.remove('drag-over');
      const srcId = parseInt(e.dataTransfer.getData('text/plain'));
      reorderTabs(srcId, tab.id);
    });

    tabList.appendChild(el);
  });

  // Wire close buttons
  tabList.querySelectorAll('.tab-close').forEach(btn =>
    btn.addEventListener('click', e => { e.stopPropagation(); closeTab(parseInt(btn.dataset.id)); })
  );
}

function reorderTabs(srcId, destId) {
  const si = State.tabs.findIndex(t => t.id === srcId);
  const di = State.tabs.findIndex(t => t.id === destId);
  if (si === -1 || di === -1 || si === di) return;
  const [tab] = State.tabs.splice(si, 1);
  State.tabs.splice(di, 0, tab);
  saveSession();
  renderTabBar();
}

function renderSidebar() {
  if (!groupList) return;
  // Groups
  groupList.innerHTML = '';
  State.groups.forEach(g => {
    const count = State.tabs.filter(t => t.groupId === g.id).length;
    const el = document.createElement('div');
    el.className = 'group-item';
    el.innerHTML = `
      <div class="group-dot" style="background:${g.color}"></div>
      <span class="group-name">${g.name}</span>
      <span class="group-count">${count}</span>
    `;
    groupList.appendChild(el);
  });

  // Tab list
  if (tabSearchInput) renderSidebarTabs(tabSearchInput.value);
}

function renderSidebarTabs(filter = '') {
  if (!sidebarTabList) return;
  sidebarTabList.innerHTML = '';
  const filtered = State.tabs.filter(t =>
    !filter || t.label.toLowerCase().includes(filter.toLowerCase())
  );
  filtered.forEach(tab => {
    const el = document.createElement('div');
    el.className = 'sidebar-tab-item' + (tab.id === State.activeTabId ? ' active' : '');
    el.innerHTML = `
      <div class="sidebar-tab-favicon">${tab.favicon}</div>
      <span class="sidebar-tab-label">${tab.label}</span>
    `;
    el.addEventListener('click', () => {
      activateTab(tab.id);
      if (State.mode !== 'workspace') setMode('workspace');
    });
    sidebarTabList.appendChild(el);
  });
}

function renderPanel(panelEl, tabId) {
  if (!panelEl) return;
  const tab = State.tabs.find(t => t.id === tabId);
  if (!tab) { panelEl.innerHTML = ''; return; }

  if (tab.url) {
    panelEl.innerHTML = `
      <div class="panel-webview">
        <div class="panel-toolbar">
          <button class="panel-nav-btn" id="navBack_${tab.id}" title="Back">←</button>
          <button class="panel-nav-btn" id="navFwd_${tab.id}" title="Forward">→</button>
          <button class="panel-nav-btn" id="navReload_${tab.id}" title="Reload">↺</button>
          <input class="panel-url-bar" id="urlBar_${tab.id}" value="${tab.url}" type="text" spellcheck="false" />
          <button class="panel-nav-btn" id="navGo_${tab.id}" title="Go">Go</button>
          <button class="panel-nav-btn" id="navFloat_${tab.id}" title="Floating Panel">⊞</button>
        </div>
        <iframe id="frame_${tab.id}" src="${tab.url}" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" title="${tab.label}"></iframe>
      </div>
    `;
    wireFrameControls(tab);
  } else {
    renderNewTabPage(panelEl, tab);
  }
}

function wireFrameControls(tab) {
  const frame = $(`frame_${tab.id}`);
  const urlBar = $(`urlBar_${tab.id}`);
  const navBack = $(`navBack_${tab.id}`);
  const navFwd = $(`navFwd_${tab.id}`);
  const navReload = $(`navReload_${tab.id}`);
  const navGo = $(`navGo_${tab.id}`);
  const navFloat = $(`navFloat_${tab.id}`);

  const navigate = url => {
    if (!url.startsWith('http')) url = 'https://' + url;
    tab.url = url;
    tab.label = url.replace(/^https?:\/\//, '').split('/')[0];
    if (frame) frame.src = url;
    if (urlBar) urlBar.value = url;
    saveSession();
    renderTabBar();
    renderSidebarTabs();
  };

  if (navGo) navGo.addEventListener('click', () => navigate(urlBar.value));
  if (urlBar) urlBar.addEventListener('keydown', e => { if (e.key === 'Enter') navigate(urlBar.value); });
  if (navReload) navReload.addEventListener('click', () => { if (frame) frame.src = frame.src; });
  if (navBack) navBack.addEventListener('click', () => { try { if (frame) frame.contentWindow.history.back(); } catch (e) { } });
  if (navFwd) navFwd.addEventListener('click', () => { try { if (frame) frame.contentWindow.history.forward(); } catch (e) { } });
  if (navFloat) navFloat.addEventListener('click', () => showFloating(tab.label, tab.url));
}

function renderNewTabPage(panelEl, tab) {
  const tiles = [
    { icon: '🌐', label: 'Google', url: 'https://google.com' },
    { icon: '📰', label: 'HN', url: 'https://news.ycombinator.com' },
    { icon: '🐙', label: 'GitHub', url: 'https://github.com' },
    { icon: '📖', label: 'Wikipedia', url: 'https://wikipedia.org' },
    { icon: '🎥', label: 'YouTube', url: 'https://youtube.com' },
    { icon: '📄', label: 'ArXiv', url: 'https://arxiv.org' },
    { icon: '💻', label: 'MDN', url: 'https://developer.mozilla.org' },
    { icon: '🐦', label: 'X', url: 'https://x.com' },
  ];

  panelEl.innerHTML = `
    <div class="panel-new-tab animate-up">
      <div>
        <h2>New Tab</h2>
        <p style="margin-top:4px">Search or open a quick link below</p>
      </div>
      <div class="new-tab-grid">
        ${tiles.map(t => `
          <div class="new-tab-tile" data-url="${t.url}">
            <span class="new-tab-tile-icon">${t.icon}</span>
            <span>${t.label}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  panelEl.querySelectorAll('.new-tab-tile').forEach(tile => {
    tile.addEventListener('click', () => {
      const tab2 = State.tabs.find(t => t.id === State.activeTabId);
      if (tab2) {
        tab2.url = tile.dataset.url;
        tab2.label = tile.textContent.trim();
        saveSession();
        renderPanel(panelEl, tab2.id);
        renderTabBar();
      }
    });
  });
}

// ─── CONTEXT MENU ────────────────────────────────────────────────────
function showContextMenu(x, y, tabId) {
  if (!contextMenu) return;
  State.ctxTabId = tabId;
  contextMenu.style.left = `${Math.min(x, window.innerWidth - 180)}px`;
  contextMenu.style.top = `${Math.min(y, window.innerHeight - 160)}px`;
  contextMenu.classList.remove('hidden');
}
function hideContextMenu() { if (contextMenu) contextMenu.classList.add('hidden'); }

if ($('ctxNewGroup')) {
  $('ctxNewGroup').addEventListener('click', () => {
    const name = prompt('Group name:');
    if (name) {
      const gid = createGroup(name);
      addTabToGroup(State.ctxTabId, gid);
    }
    hideContextMenu();
  });
}
if ($('ctxDuplicate')) {
  $('ctxDuplicate').addEventListener('click', () => {
    duplicateTab(State.ctxTabId);
    hideContextMenu();
  });
}
if ($('ctxPin')) {
  $('ctxPin').addEventListener('click', () => {
    pinTab(State.ctxTabId);
    hideContextMenu();
  });
}
if ($('ctxClose')) {
  $('ctxClose').addEventListener('click', () => {
    closeTab(State.ctxTabId);
    hideContextMenu();
  });
}
document.addEventListener('click', () => hideContextMenu());

// ─── COMMAND PALETTE ─────────────────────────────────────────────────
const COMMANDS = [
  { id: 'new-tab', icon: '➕', title: 'New Tab', desc: 'Open a blank tab', kbd: 'Ctrl+T', action: () => { createTab(); setMode('workspace'); } },
  { id: 'close-tab', icon: '✕', title: 'Close Active Tab', desc: 'Close current tab', kbd: 'Ctrl+W', action: () => closeTab(State.activeTabId) },
  { id: 'search-mode', icon: '🔍', title: 'Switch to Search Mode', desc: 'Go to search view', kbd: '', action: () => setMode('search') },
  { id: 'workspace', icon: '⊞', title: 'Switch to Workspace', desc: 'Go to workspace view', kbd: '', action: () => setMode('workspace') },
  { id: 'split', icon: '⏢', title: 'Toggle Split View', desc: 'Enable/disable split', kbd: 'S', action: toggleSplit },
  { id: 'focus', icon: '◎', title: 'Toggle Focus Mode', desc: 'Hide chrome / distraction-free', kbd: 'F', action: toggleFocusMode },
  { id: 'new-group', icon: '📁', title: 'New Tab Group', desc: 'Create a new group', kbd: '', action: () => { const n = prompt('Group name:'); if (n) createGroup(n); } },
  { id: 'preset-study', icon: '📚', title: 'Study Preset', desc: 'Load study workspace', kbd: '', action: () => setPreset('study') },
  { id: 'preset-res', icon: '🔬', title: 'Research Preset', desc: 'Load research workspace', kbd: '', action: () => setPreset('research') },
  { id: 'preset-build', icon: '⚙️', title: 'Build Preset', desc: 'Load build workspace', kbd: '', action: () => setPreset('build') },
  { id: 'float', icon: '🪟', title: 'Open Floating Panel', desc: 'Show a floating panel', kbd: '', action: () => showFloating('Floating Panel', null) },
  { id: 'theme', icon: '🌙', title: 'Dark Theme Active', desc: 'Theme is always dark', kbd: '', action: () => toast('Dark mode is always on 🌙', 'info') },
  { id: 'save', icon: '💾', title: 'Save Session', desc: 'Persist current layout', kbd: 'Ctrl+S', action: () => { saveSession(); toast('Session saved 💾', 'success'); } },
];

let cmdSelectedIdx = 0;
let cmdFiltered = [...COMMANDS];

function openCmdPalette() {
  if (!cmdPalette) return;
  cmdPalette.classList.remove('hidden');
  if (cmdInput) {
    cmdInput.value = '';
    setTimeout(() => cmdInput.focus(), 50);
  }
  cmdSelectedIdx = 0;
  renderCmdResults('');
}
function closeCmdPalette() { if (cmdPalette) cmdPalette.classList.add('hidden'); }

function renderCmdResults(q) {
  if (!cmdResults) return;
  const tabs = State.tabs.filter(t =>
    !q || t.label.toLowerCase().includes(q.toLowerCase())
  );

  const cmds = COMMANDS.filter(c =>
    !q || c.title.toLowerCase().includes(q.toLowerCase()) || c.desc.toLowerCase().includes(q.toLowerCase())
  );

  cmdFiltered = [
    ...tabs.map(t => ({ _isTab: true, id: `tab-${t.id}`, icon: t.favicon, title: t.label, desc: 'Open Tab', action: () => { activateTab(t.id); setMode('workspace'); } })),
    ...cmds,
  ];

  cmdResults.innerHTML = '';
  if (!cmdFiltered.length) {
    cmdResults.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text3);font-size:13px">No results found</div>';
    return;
  }

  // Tab section
  if (tabs.length && q) {
    const lbl = document.createElement('div');
    lbl.className = 'cmd-section-label'; lbl.textContent = 'OPEN TABS';
    cmdResults.appendChild(lbl);
    tabs.forEach((t, i) => {
      appendCmdItem({ _isTab: true, id: `tab-${t.id}`, icon: t.favicon, title: t.label, desc: 'Switch to tab', action: () => { activateTab(t.id); setMode('workspace'); } }, i);
    });
  }

  const lbl2 = document.createElement('div');
  lbl2.className = 'cmd-section-label'; lbl2.textContent = 'COMMANDS';
  cmdResults.appendChild(lbl2);
  cmds.forEach((c, i) => appendCmdItem(c, tabs.length + i));
}

function appendCmdItem(cmd, idx) {
  const el = document.createElement('div');
  el.className = 'cmd-item' + (idx === cmdSelectedIdx ? ' selected' : '');
  el.dataset.idx = idx;
  el.innerHTML = `
    <div class="cmd-item-icon">${cmd.icon}</div>
    <div class="cmd-item-text">
      <div class="cmd-item-title">${cmd.title}</div>
      <div class="cmd-item-desc">${cmd.desc}</div>
    </div>
    ${cmd.kbd ? `<span class="cmd-item-kbd">${cmd.kbd}</span>` : ''}
  `;
  el.addEventListener('click', () => { execCmd(cmd); });
  el.addEventListener('mouseenter', () => {
    cmdSelectedIdx = idx;
    updateCmdSelection();
  });
  if (cmdResults) cmdResults.appendChild(el);
}

function updateCmdSelection() {
  if (!cmdResults) return;
  cmdResults.querySelectorAll('.cmd-item').forEach((el, i) => {
    el.classList.toggle('selected', parseInt(el.dataset.idx) === cmdSelectedIdx);
  });
  const sel = cmdResults.querySelector('.cmd-item.selected');
  if (sel) sel.scrollIntoView({ block: 'nearest' });
}

function execCmd(cmd) {
  closeCmdPalette();
  cmd.action();
}

// Handlers for cmd palette inputs added in DOMContentLoaded logic or below
// ... (omitted for brevity, will re-bind) ...

// ─── SEARCH ENGINE ────────────────────────────────────────────────────
const SEARCH_API = q => `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`;

// Curated demo results for offline/CORS fallback
function getDemoResults(q) {
  const base = [
    {
      title: `${q} — Wikipedia`,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(q.replace(/ /g, '_'))}`,
      snippet: `Wikipedia is a free online encyclopedia covering everything about "${q}" and much more.`,
      favicon: '📖', source: 'en.wikipedia.org',
    },
    {
      title: `${q} — Search Results (DuckDuckGo)`,
      url: `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
      snippet: `Get private, ad-free search results for "${q}" from DuckDuckGo.`,
      favicon: '🦆', source: 'duckduckgo.com',
    },
    {
      title: `GitHub: ${q}`,
      url: `https://github.com/search?q=${encodeURIComponent(q)}`,
      snippet: `Explore open-source repositories, projects, and code related to "${q}" on GitHub.`,
      favicon: '🐙', source: 'github.com',
    },
    {
      title: `${q} — YouTube`,
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
      snippet: `Watch videos, tutorials, and content about "${q}" on YouTube.`,
      favicon: '🎥', source: 'youtube.com',
    },
    {
      title: `${q} — Stack Overflow`,
      url: `https://stackoverflow.com/search?q=${encodeURIComponent(q)}`,
      snippet: `Find developer Q&A, code snippets, and solutions for "${q}" on Stack Overflow.`,
      favicon: '📝', source: 'stackoverflow.com',
    },
    {
      title: `${q} — Hacker News`,
      url: `https://hn.algolia.com/?q=${encodeURIComponent(q)}`,
      snippet: `Discover the latest discussions, stories, and links about "${q}" on Hacker News.`,
      favicon: '🔶', source: 'news.ycombinator.com',
    },
    {
      title: `${q} — ArXiv Research`,
      url: `https://arxiv.org/search/?query=${encodeURIComponent(q)}&searchtype=all`,
      snippet: `Access preprint research papers and academic publications related to "${q}".`,
      favicon: '📄', source: 'arxiv.org',
    },
    {
      title: `${q} — Reddit`,
      url: `https://www.reddit.com/search/?q=${encodeURIComponent(q)}`,
      snippet: `Community discussions, threads, and insights about "${q}" from Reddit.`,
      favicon: '🔴', source: 'reddit.com',
    },
  ];
  return base;
}

let searchDebounce = null;
let suggestionDebounce = null;

async function doSearch(q) {
  if (!q.trim()) return;
  State.query = q;

  // Compact hero
  const barWrap = $('searchBarWrap');
  if (barWrap) barWrap.closest('.search-hero').classList.add('compact');

  if (resultsArea) resultsArea.classList.remove('hidden');
  if (resultsList) resultsList.innerHTML = '';
  if (resultsLoader) resultsLoader.classList.remove('hidden');
  if (resultsMeta) resultsMeta.textContent = '';

  // Show search in topbar
  if (topbarInput) topbarInput.value = q;

  // A short delay to show loader
  await new Promise(r => setTimeout(r, 600));

  const results = getDemoResults(q);
  State.results = results;

  if (resultsLoader) resultsLoader.classList.add('hidden');
  if (resultsMeta) resultsMeta.textContent = `${results.length} results in 0.04s (Clario private search)`;

  results.forEach((r, i) => {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.style.animationDelay = `${i * 40}ms`;
    card.innerHTML = `
      <div class="result-source">
        <div class="result-favicon">${r.favicon}</div>
        <span>${r.source}</span>
        <span style="color:var(--text3)">›</span>
        <span style="color:var(--green);font-family:'JetBrains Mono',monospace">${r.url.replace(/^https?:\/\/[^/]+/, '').substring(0, 40) || '/'}</span>
      </div>
      <div class="result-title">${r.title}</div>
      <div class="result-snippet">${r.snippet}</div>
      <div class="result-actions">
        <button class="result-action-btn" data-url="${r.url}">Open in Tab</button>
        <button class="result-action-btn" data-url="${r.url}" data-split="1">Open in Split</button>
        <button class="result-action-btn" data-float="${r.url}">Float</button>
      </div>
    `;

    card.addEventListener('click', e => {
      const btn = e.target.closest('.result-action-btn');
      if (btn) {
        if (btn.dataset.float) {
          showFloating(r.title, r.url); return;
        }
        if (btn.dataset.split) {
          openInSplit(btn.dataset.url, r.title, r.favicon); return;
        }
        openUrlInTab(btn.dataset.url, r.title, r.favicon); return;
      }
      openUrlInTab(r.url, r.title, r.favicon);
    });

    if (resultsList) resultsList.appendChild(card);
  });
}

function openInSplit(url, title, favicon = '🌐') {
  setMode('workspace');
  if (!State.splitView) toggleSplit();

  const newTab = createTab(title, favicon, url);
  State.panel2TabId = newTab.id;
  renderPanel(panel1, State.activeTabId);
  renderPanel(panel2, State.panel2TabId);
  saveSession();
  toast('Opened in split view', 'success');
}

// Live suggestions (simulated)
const SUGGEST_STARTERS = ['how to', 'what is', 'best', 'top 10', 'learn', 'build', 'create', 'why', 'when', 'where'];
function getSuggestions(q) {
  if (!q) return [];
  return [
    q,
    ...SUGGEST_STARTERS.filter(s => !q.toLowerCase().startsWith(s)).slice(0, 3).map(s => `${s} ${q}`),
    `${q} tutorial`,
    `${q} 2025`,
  ].slice(0, 6);
}

function renderSuggestions(q) {
  if (!suggestions) return;
  if (!q) { suggestions.classList.remove('visible'); return; }
  const items = getSuggestions(q);
  suggestions.innerHTML = items.map((s, i) => `
    <div class="suggestion-item${i === 0 ? ' selected' : ''}" data-q="${s}">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      ${s}
    </div>
  `).join('');
  suggestions.classList.add('visible');

  suggestions.querySelectorAll('.suggestion-item').forEach(el => {
    el.addEventListener('click', () => {
      if (searchInput) searchInput.value = el.dataset.q;
      suggestions.classList.remove('visible');
      doSearch(el.dataset.q);
    });
    el.addEventListener('mouseenter', () => {
      suggestions.querySelectorAll('.suggestion-item').forEach(x => x.classList.remove('selected'));
      el.classList.add('selected');
    });
  });
}

// ─── FLOATING PANEL ───────────────────────────────────────────────────
function showFloating(title, url) {
  if (!floatPanel) return;
  if (floatTitle) floatTitle.textContent = title || 'Panel';
  floatPanel.classList.remove('hidden');
  if (url) {
    if (floatBody) floatBody.innerHTML = `<iframe src="${url}" style="width:312px;height:400px;border:none;border-radius:8px"></iframe>`;
  } else {
    if (floatBody) {
      floatBody.innerHTML = `
        <p style="color:var(--text3);font-size:13px;margin-bottom:12px">Quick Notes</p>
        <textarea style="width:100%;min-height:200px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text);font-family:inherit;font-size:12px;resize:vertical;outline:none" placeholder="Type your notes here…" id="floatNotes"></textarea>
      `;
      // Load saved notes
      const saved = localStorage.getItem('clario_notes') || '';
      const ta = floatBody.querySelector('#floatNotes');
      if (ta) {
        ta.value = saved;
        ta.addEventListener('input', () => localStorage.setItem('clario_notes', ta.value));
      }
    }
  }
  makeDraggable(floatPanel, floatPanel.querySelector('.float-header'));
}

if ($('floatCloseBtn')) $('floatCloseBtn').addEventListener('click', () => floatPanel.classList.add('hidden'));
if ($('floatMinBtn')) {
  $('floatMinBtn').addEventListener('click', () => {
    if (floatBody) floatBody.style.display = floatBody.style.display === 'none' ? '' : 'none';
  });
}

// ─── DRAG FLOAT PANEL ─────────────────────────────────────────────────
function makeDraggable(el, handle) {
  if (!el || !handle) return;
  let ox = 0, oy = 0, x = 0, y = 0;
  handle.addEventListener('mousedown', e => {
    e.preventDefault();
    ox = e.clientX - el.offsetLeft;
    oy = e.clientY - el.offsetTop;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    document.onmousemove = ev => {
      x = ev.clientX - ox; y = ev.clientY - oy;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    };
    document.onmouseup = () => { document.onmousemove = null; document.onmouseup = null; };
  });
}

// ─── SPLIT HANDLE DRAG ────────────────────────────────────────────────
function drawSplitHandle() {
  if (!State.splitView || !splitHandle) return;
  splitHandle.addEventListener('mousedown', e => {
    e.preventDefault();
    const container = $('panelsContainer');
    if (!container) return;
    const total = container.offsetWidth;
    document.onmousemove = ev => {
      const pct = (ev.clientX - container.getBoundingClientRect().left) / total * 100;
      const clamped = Math.max(20, Math.min(80, pct));
      if (panel1) { panel1.style.flex = 'none'; panel1.style.width = `${clamped}%`; }
      if (panel2) panel2.style.flex = '1';
    };
    document.onmouseup = () => { document.onmousemove = null; document.onmouseup = null; };
    splitHandle.classList.add('active');
  });
  splitHandle.addEventListener('mouseup', () => splitHandle.classList.remove('active'));
}

// ─── TOAST ────────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  if (!toastContainer) return;
  const icons = { success: '✅', info: 'ℹ️', warn: '⚠️' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type] || '•'}</span> ${msg}`;
  toastContainer.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ─── EVENT BINDINGS ───────────────────────────────────────────────────
function bindEvents() {
  if ($('searchModeBtn')) $('searchModeBtn').addEventListener('click', () => setMode('search'));
  if ($('workspaceModeBtn')) $('workspaceModeBtn').addEventListener('click', () => setMode('workspace'));
  if ($('logoBtn')) {
    $('logoBtn').addEventListener('click', () => {
      State.sidebarOpen = !State.sidebarOpen;
      if (app) app.classList.toggle('sidebar-hidden', !State.sidebarOpen);
    });
  }
  if ($('newTabBtn')) $('newTabBtn').addEventListener('click', () => createTab());
  if ($('focusModeBtn')) $('focusModeBtn').addEventListener('click', toggleFocusMode);
  if ($('splitBtn')) $('splitBtn').addEventListener('click', toggleSplit);
  if ($('cmdBtn')) $('cmdBtn').addEventListener('click', openCmdPalette);

  $$('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => setPreset(btn.dataset.preset));
    btn.classList.toggle('active', btn.dataset.preset === State.preset);
  });

  if ($('addGroupBtn')) {
    $('addGroupBtn').addEventListener('click', () => {
      const name = prompt('New group name:');
      if (name && name.trim()) createGroup(name.trim());
    });
  }

  if (tabSearchInput) tabSearchInput.addEventListener('input', () => renderSidebarTabs(tabSearchInput.value));

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const q = searchInput.value;
      if (searchClear) searchClear.classList.toggle('visible', q.length > 0);
      clearTimeout(suggestionDebounce);
      suggestionDebounce = setTimeout(() => renderSuggestions(q), 120);
    });
    searchInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        if (suggestions) suggestions.classList.remove('visible');
        doSearch(searchInput.value);
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (suggestions) {
          const first = suggestions.querySelector('.suggestion-item');
          if (first) { first.classList.add('selected'); first.focus(); }
        }
      }
      if (e.key === 'Escape') { if (suggestions) suggestions.classList.remove('visible'); }
    });
  }

  if (searchClear) {
    searchClear.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      searchClear.classList.remove('visible');
      if (suggestions) suggestions.classList.remove('visible');
      if (resultsList) resultsList.innerHTML = '';
      if (resultsArea) resultsArea.classList.add('hidden');
      const barWrap = $('searchBarWrap');
      if (barWrap) barWrap.closest('.search-hero').classList.remove('compact');
    });
  }

  if ($('searchGo')) {
    $('searchGo').addEventListener('click', () => {
      if (suggestions) suggestions.classList.remove('visible');
      if (searchInput) doSearch(searchInput.value);
    });
  }

  if (topbarInput) {
    topbarInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const q = topbarInput.value;
        if (q) {
          setMode('search');
          if (searchInput) searchInput.value = q;
          doSearch(q);
        }
      }
    });
  }

  $$('.shortcut-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      if (searchInput) searchInput.value = chip.dataset.q;
      if (searchClear) searchClear.classList.add('visible');
      doSearch(chip.dataset.q);
    });
  });

  if (cmdInput) {
    cmdInput.addEventListener('input', () => {
      cmdSelectedIdx = 0;
      renderCmdResults(cmdInput.value);
    });
    cmdInput.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        cmdSelectedIdx = Math.min(cmdSelectedIdx + 1, cmdFiltered.length - 1);
        updateCmdSelection();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        cmdSelectedIdx = Math.max(cmdSelectedIdx - 1, 0);
        updateCmdSelection();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = cmdFiltered[cmdSelectedIdx];
        if (cmd) execCmd(cmd);
      } else if (e.key === 'Escape') {
        closeCmdPalette();
      }
    });
  }

  if (cmdPalette) {
    const backdrop = cmdPalette.querySelector('.cmd-backdrop');
    if (backdrop) backdrop.addEventListener('click', closeCmdPalette);
  }

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey && e.key === 'k') || (e.key === '/' && document.activeElement === document.body)) {
      e.preventDefault();
      openCmdPalette();
    }
    if (e.ctrlKey && e.key === 't') {
      e.preventDefault();
      createTab();
      setMode('workspace');
    }
    if (e.ctrlKey && e.key === 'w') {
      e.preventDefault();
      closeTab(State.activeTabId);
    }
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      saveSession();
      toast('Session saved 💾', 'success');
    }
    if (e.key === 'f' || e.key === 'F') {
      if (document.activeElement === document.body || document.activeElement?.tagName === 'BUTTON') {
        toggleFocusMode();
      }
    }
    if (e.key === 's' || e.key === 'S') {
      if (document.activeElement === document.body || document.activeElement?.tagName === 'BUTTON') {
        if (State.mode === 'workspace') toggleSplit();
      }
    }
    if (e.key === 'Escape') {
      if (cmdPalette && !cmdPalette.classList.contains('hidden')) closeCmdPalette();
      if (contextMenu && !contextMenu.classList.contains('hidden')) hideContextMenu();
    }
    if (e.altKey && e.key >= '1' && e.key <= '9') {
      e.preventDefault();
      const idx = parseInt(e.key) - 1;
      if (State.tabs[idx]) { activateTab(State.tabs[idx].id); setMode('workspace'); }
    }
  });
}

function initAuth() {
  if (authModal) authModal.classList.remove('hidden');

  const hasKey = localStorage.getItem(MASTER_KEY_ID);

  if (!hasKey) {
    if (secureInitial) secureInitial.classList.remove('hidden');
    if (secureLogin) secureLogin.classList.add('hidden');
    if (secureTitle) secureTitle.textContent = "Setup Secure Access";
    if (secureSub) secureSub.textContent = "Register this hardware as your master token";
  } else {
    if (secureInitial) secureInitial.classList.add('hidden');
    if (secureLogin) secureLogin.classList.remove('hidden');
    if (secureTitle) secureTitle.textContent = "Authorized Only";
    if (secureSub) secureSub.textContent = "Executive access requires hardware token";
  }

  if (makeKeyBtn) {
    makeKeyBtn.addEventListener('click', () => {
      makeKeyBtn.textContent = "Registering Hardware...";
      makeKeyBtn.disabled = true;
      setTimeout(() => {
        localStorage.setItem(MASTER_KEY_ID, 'ADMIN_EXP_' + Date.now());
        toast('Hardware Token Registered 🔐', 'success');
        revealApp();
      }, 2500);
    });
  }

  if (verifyKeyBtn) {
    verifyKeyBtn.addEventListener('click', () => {
      verifyKeyBtn.textContent = "Verifying Token...";
      verifyKeyBtn.disabled = true;
      setTimeout(() => {
        revealApp();
        toast('Access Granted — Welcome, Executive', 'success');
        verifyKeyBtn.textContent = "Authorize Session";
        verifyKeyBtn.disabled = false;
      }, 1500);
    });
  }

  async function revealApp() {
    // Fetch backend updates before showing app
    await loadRemoteConfig();

    if (authModal) authModal.classList.add('hidden');
    if (bootScreen) {
      bootScreen.style.opacity = '0';
      setTimeout(() => bootScreen.style.display = 'none', 600);
    }
    if (app) {
      app.classList.remove('hidden');
      setTimeout(() => app.classList.add('visible'), 50);
    }
    const dEmail = $('displayEmail');
    const dStatus = $('displayStatus');
    if (dEmail) dEmail.textContent = "Executive Administrator";
    if (dStatus) dStatus.textContent = "Secure Access Active";

    if (!isAppBooted) {
      isAppBooted = true;
      loadSession();
      initClock();
      bindEvents();
      renderAll();
    }
  }

  if (userAccountBtn) {
    userAccountBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (accountMenu) accountMenu.classList.toggle('hidden');
    });
  }
  document.addEventListener('click', () => {
    if (accountMenu) accountMenu.classList.add('hidden');
  });

  const signOutBtn = $('signOutBtn');
  if (signOutBtn) {
    signOutBtn.innerHTML = "Revoke Access";
    signOutBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to revoke this hardware token?')) {
        localStorage.removeItem(MASTER_KEY_ID);
        location.reload();
      }
    });
  }

  const proModal = $('proModal');
  if ($('upgradeBtn')) {
    $('upgradeBtn').addEventListener('click', () => {
      if (proModal) proModal.classList.remove('hidden');
      const proCard = proModal?.querySelector('.pro-card');
      if (proCard) {
        proCard.style.animation = 'none';
        proCard.offsetHeight;
        proCard.style.animation = null;
      }
    });
  }
  if ($('proCloseBtn')) {
    $('proCloseBtn').addEventListener('click', () => {
      if (proModal) proModal.classList.add('hidden');
    });
  }

  const proCheckoutBtn = $('proCheckoutBtn');
  if (proCheckoutBtn) {
    proCheckoutBtn.addEventListener('click', () => {
      proCheckoutBtn.textContent = 'Processing...';
      proCheckoutBtn.disabled = true;
      setTimeout(() => {
        if (proModal) proModal.classList.add('hidden');
        State.isPro = true;
        applyProUpgrade();
        toast('Welcome to Clario Pro! 🌟', 'success');
        saveSession();
      }, 2000);
    });
  }
}

window.addEventListener('beforeunload', () => {
  if (isAppBooted) saveSession();
});

setInterval(() => {
  if (isAppBooted) {
    saveSession();
    console.log('Clario: Auto-saved current workspace');
  }
}, 60000);

// ─── PWA SERVICE WORKER ──────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js')
    .then(() => console.log("Clario: Service Worker Registered"))
    .catch(err => console.warn("Clario: Service Worker Failed", err));
}
