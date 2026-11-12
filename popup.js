const $ = (id) => document.getElementById(id);
const T = globalThis.DDM; // textes et langue (shared.js)

let tab = null; // onglet Discord actif
let target = null; // conversation ouverte : { channelId, guildId, name }
let activeTab = 'single'; // 'single' | 'mass'
let dms = null; // liste de mes MP (null = pas encore chargée)
let dmsLoading = false;
const selected = new Set();
let pollTimer = null;
let lastState = null;
let currentView = '';
let infoKey = '';
let massStatusMsg = null; // message { key, p } affiché sous la liste
let breakdownKey = '';
let breakdownCells = new Map();

function showView(view) {
  currentView = view;
  for (const v of ['info', 'setup', 'job']) $('view-' + v).hidden = v !== view;
}

function info(key) {
  infoKey = key;
  $('info-text').textContent = T.t(key);
  showView('info');
}

// Chaque message indique la langue choisie, pour l'encart affiché dans Discord.
function send(message) {
  return chrome.tabs.sendMessage(tab.id, { ...message, lang: T.getLang() }).catch(() => null);
}

// ---------------------------------------------------------------------
// Langue
// ---------------------------------------------------------------------

function applyLang() {
  T.applyDom(document);
  for (const code of ['fr', 'en']) $('lang-' + code).setAttribute('aria-pressed', String(T.getLang() === code));
}

function setLang(code) {
  if (code === T.getLang()) return;
  T.setLang(code);
  chrome.storage.local.set({ ddmLang: code }).catch(() => {});
  applyLang();

  // On redessine l'écran affiché dans la nouvelle langue.
  if (currentView === 'info') info(infoKey);
  else if (currentView === 'job' && lastState) {
    breakdownKey = '';
    renderJob(lastState);
  } else if (currentView === 'setup') {
    if (target) $('conv-name').textContent = targetName();
    if (dms) renderMassList();
    else massStatus(massStatusMsg);
    syncOptions(false);
  }
  if (tab) send({ type: 'ddm:lang' });
}

// ---------------------------------------------------------------------
// Onglet Discord et session
// ---------------------------------------------------------------------

function isDiscord(rawUrl) {
  try {
    const host = new URL(rawUrl).hostname;
    return host === 'discord.com' || host.endsWith('.discord.com');
  } catch (e) {
    return false;
  }
}

// Lit l'adresse de l'onglet : /channels/@me/<id> (privé ou groupe)
// ou /channels/<serveur>/<salon>.
function readTarget() {
  let url;
  try {
    url = new URL(tab.url);
  } catch (e) {
    return null;
  }
  const match = url.pathname.match(/^\/channels\/(@me|\d+)\/(\d+)/);
  if (!match) return null;

  const name = (tab.title || '')
    .replace(/^\(\d+\+?\)\s*/, '')
    .replace(/^•\s*/, '')
    .replace(/^Discord\s*\|\s*/, '')
    .trim();

  return { guildId: match[1] === '@me' ? null : match[1], channelId: match[2], name };
}

const targetName = () => (target && target.name) || T.t('defaultConv');

// Exécutée DANS la page Discord : retrouve la session de l'utilisateur.
// Rien ne sort du navigateur, la valeur ne sert qu'aux appels vers discord.com.
function readPageTokens() {
  const found = [];
  const add = (t) => {
    if (typeof t === 'string' && t.length > 20 && !found.includes(t)) found.push(t);
  };

  try {
    const frame = document.createElement('iframe');
    frame.style.display = 'none';
    document.body.appendChild(frame);
    try {
      const raw = frame.contentWindow.localStorage.getItem('token');
      if (raw) {
        try {
          add(JSON.parse(raw));
        } catch (e) {
          add(raw);
        }
      }
    } finally {
      frame.remove();
    }
  } catch (e) {}

  try {
    const chunks = window.webpackChunkdiscord_app;
    if (chunks) {
      let req = null;
      chunks.push([[Symbol('ddm')], {}, (r) => { req = r; }]);
      chunks.pop();
      const cache = (req && req.c) || {};
      for (const id in cache) {
        try {
          const exp = cache[id].exports;
          for (const cand of [exp, exp && exp.default, exp && exp.Z, exp && exp.ZP]) {
            if (cand && typeof cand.getToken === 'function') add(cand.getToken());
          }
        } catch (e) {}
      }
    }
  } catch (e) {}

  return found;
}

async function collectTokens() {
  const tokens = [];
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: readPageTokens
    });
    if (res && Array.isArray(res.result)) tokens.push(...res.result);
  } catch (e) {}
  try {
    const { ddmToken } = await chrome.storage.session.get('ddmToken');
    if (ddmToken && !tokens.includes(ddmToken)) tokens.push(ddmToken);
  } catch (e) {}
  return tokens;
}

// ---------------------------------------------------------------------
// Avatars
// ---------------------------------------------------------------------

const AVATAR_COLORS = ['#c4383d', '#c2500f', '#8a6a00', '#2f7d42', '#0d7d74', '#1a6fc4', '#5b46b8', '#b0327f'];

function avatarEl(name, key, url) {
  const el = document.createElement('span');
  el.className = 'avatar';
  const clean = String(name || '?').replace(/^[@#\s]+/, '');
  el.textContent = (clean[0] || '?').toUpperCase();
  let hash = 0;
  for (const ch of String(key || name)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  el.style.background = AVATAR_COLORS[hash % AVATAR_COLORS.length];
  if (url) {
    const img = new Image();
    img.alt = '';
    img.addEventListener('load', () => {
      el.textContent = '';
      el.style.background = 'none';
      el.appendChild(img);
    });
    img.src = url;
  }
  return el;
}

// ---------------------------------------------------------------------
// Options (filtres)
// ---------------------------------------------------------------------

const OPTION_IDS = ['opt-period', 'opt-days', 'opt-from', 'opt-to', 'opt-keyword', 'opt-files', 'opt-links', 'opt-keep'];
const OPTION_DEFAULTS = {
  'opt-period': 'all', 'opt-days': '30', 'opt-from': '', 'opt-to': '',
  'opt-keyword': '', 'opt-files': false, 'opt-links': false, 'opt-keep': '0'
};

const valueOf = (id) => ($(id).type === 'checkbox' ? $(id).checked : $(id).value);
function setValue(id, value) {
  if ($(id).type === 'checkbox') $(id).checked = !!value;
  else $(id).value = value;
}

// Traduit le formulaire en filtres pour le script de la page.
// Renvoie { filters, count, error } ; error est une clé de texte.
function readFilters() {
  const filters = {
    keyword: $('opt-keyword').value.trim(),
    withFiles: $('opt-files').checked,
    withLinks: $('opt-links').checked,
    keepLast: Math.max(0, Math.floor(Number($('opt-keep').value) || 0))
  };
  let count = 0;
  let error = '';

  const period = $('opt-period').value;
  if (period === 'older') {
    const days = Math.floor(Number($('opt-days').value) || 0);
    if (days < 1) error = 'errDays';
    else {
      filters.before = Date.now() - days * 86400000;
      filters.olderDays = days;
      count++;
    }
  } else if (period === 'range') {
    const from = $('opt-from').value;
    const to = $('opt-to').value;
    if (from) filters.after = new Date(from + 'T00:00:00').getTime();
    if (to) filters.before = new Date(to + 'T23:59:59.999').getTime();
    if (!from && !to) error = 'errPickDate';
    else if (from && to && filters.after > filters.before) error = 'errDateOrder';
    else count++;
  }

  if (filters.keyword) count++;
  if (filters.withFiles || filters.withLinks) count++;
  if (filters.keepLast) count++;
  return { filters, count, error };
}

function syncOptions(save = true) {
  const period = $('opt-period').value;
  $('row-older').hidden = period !== 'older';
  $('row-range').hidden = period !== 'range';

  const { count, error } = readFilters();
  $('options-error').textContent = error ? T.t(error) : '';
  $('options-badge').hidden = count === 0;
  $('options-badge').textContent = T.t('badge', { n: count });
  if (error) $('options').open = true;

  if (save) {
    const values = { tab: activeTab };
    for (const id of OPTION_IDS) values[id] = valueOf(id);
    chrome.storage.session.set({ ddmOptions: values }).catch(() => {});
  }
  updateStartButton();
}

// Les réglages sont gardés tant que le navigateur reste ouvert.
async function restoreOptions() {
  let saved = null;
  try {
    saved = (await chrome.storage.session.get('ddmOptions')).ddmOptions || null;
  } catch (e) {}
  if (saved) {
    for (const id of OPTION_IDS) if (id in saved) setValue(id, saved[id]);
    if (saved.tab === 'mass' || saved.tab === 'single') activeTab = saved.tab;
  }
  if (!saved || !saved.tab) activeTab = target ? 'single' : 'mass';
  if (!target) activeTab = 'mass';
}

// ---------------------------------------------------------------------
// Écran de réglages
// ---------------------------------------------------------------------

function updateStartButton() {
  const btn = $('btn-start');
  const { error } = readFilters();
  if (activeTab === 'mass') {
    const n = selected.size;
    btn.textContent = n ? T.t('btnDeleteIn', { n }) : T.t('btnPick');
    btn.disabled = n === 0 || !!error;
  } else {
    btn.textContent = T.t('btnDeleteMine');
    btn.disabled = !target || !!error;
  }
}

function renderSetup() {
  clearInterval(pollTimer);
  lastState = null;
  showView('setup');

  for (const name of ['single', 'mass']) {
    $('tab-' + name).setAttribute('aria-selected', String(activeTab === name));
    $('panel-' + name).hidden = activeTab !== name;
  }

  if (activeTab === 'single') {
    $('single-card').hidden = !target;
    $('single-empty').hidden = !!target;
    if (target) {
      $('conv-name').textContent = targetName();
      $('single-avatar').replaceChildren(avatarEl(targetName(), target.channelId));
    }
  } else if (dms === null && !dmsLoading) {
    loadDms();
  }

  syncOptions(false);
}

function massStatus(message) {
  massStatusMsg = message || null;
  $('mass-status').textContent = T.msg(massStatusMsg);
  $('mass-status').hidden = !massStatusMsg;
}

// Nom et sous-titre d'une conversation, dans la langue choisie.
const dmName = (d) => d.name || T.t(d.group ? 'unnamedGroup' : 'unknownUser');
function dmSub(d) {
  if (d.group) return T.t('subGroup', { n: d.members });
  return d.username ? '@' + d.username : T.t('subDm');
}

async function loadDms() {
  dmsLoading = true;
  massStatus({ key: 'massLoading' });
  const tokens = await collectTokens();
  const res = await send({ type: 'ddm:listDms', tokens });
  dmsLoading = false;

  if (!res || !res.ok) {
    massStatus((res && res.error) || { key: 'massLoadFail' });
    return;
  }
  dms = res.list;
  renderMassList();
}

const visibleDms = () => {
  const query = $('mass-search').value.trim().toLowerCase();
  return (dms || []).filter((d) => !query || (dmName(d) + ' ' + dmSub(d)).toLowerCase().includes(query));
};

function renderMassList() {
  const list = $('mass-list');
  const shown = visibleDms();
  list.replaceChildren();

  for (const dm of shown) {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = selected.has(dm.id);
    box.addEventListener('change', () => {
      if (box.checked) selected.add(dm.id);
      else selected.delete(dm.id);
      syncMassHeader();
    });

    const text = document.createElement('span');
    text.className = 'text';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = dmName(dm);
    const sub = document.createElement('span');
    sub.className = 'sub';
    sub.textContent = dmSub(dm);
    text.append(name, sub);

    const label = document.createElement('label');
    label.append(box, avatarEl(dmName(dm), dm.id, dm.avatar), text);
    const li = document.createElement('li');
    li.append(label);
    list.append(li);
  }

  if (!dms.length) massStatus({ key: 'massNone' });
  else if (!shown.length) massStatus({ key: 'massNoMatch' });
  else massStatus(null);
  syncMassHeader();
}

function syncMassHeader() {
  const shown = visibleDms();
  const all = $('mass-all');
  const picked = shown.filter((d) => selected.has(d.id)).length;
  all.checked = shown.length > 0 && picked === shown.length;
  all.indeterminate = picked > 0 && picked < shown.length;
  all.disabled = shown.length === 0;
  $('mass-count').textContent = dms ? T.t('massCount', { a: selected.size, b: dms.length }) : '';
  updateStartButton();
}

async function startJob() {
  const { filters, error } = readFilters();
  if (error) return;

  let targets;
  if (activeTab === 'mass') {
    targets = (dms || [])
      .filter((d) => selected.has(d.id))
      .map((d) => ({ channelId: d.id, guildId: null, name: dmName(d) }));
  } else {
    targets = target ? [{ ...target, name: targetName() }] : [];
  }
  if (!targets.length) return;

  $('btn-start').disabled = true;
  const tokens = await collectTokens();
  await send({ type: 'ddm:start', tokens, targets, filters, mass: activeTab === 'mass' });
  startPolling();
}

// ---------------------------------------------------------------------
// Écran de travail : analyse, confirmation, suppression, résultat
// ---------------------------------------------------------------------

function amountText(t, phase) {
  if (t.status === 'error') return T.t('unreadable');
  if (phase === 'ready') return T.num(t.found);
  return `${T.num(t.deleted + t.skipped)} / ${T.num(t.found)}`;
}

function renderBreakdown(state) {
  const list = $('job-breakdown');
  const rows = state.targets.filter((t) => t.found > 0 || t.status === 'error');
  const show = state.mass && state.phase !== 'scanning' && rows.length > 0;
  list.hidden = !show;
  if (!show) {
    breakdownKey = '';
    return;
  }

  // On ne reconstruit la liste que si elle change, pour garder le défilement.
  const key = rows.map((t) => t.channelId).join(',');
  if (key !== breakdownKey) {
    breakdownKey = key;
    breakdownCells = new Map();
    list.replaceChildren();
    for (const t of rows) {
      const name = document.createElement('span');
      name.className = 'text name';
      name.textContent = t.name;
      const amount = document.createElement('span');
      amount.className = 'amount';
      breakdownCells.set(t.channelId, amount);
      const li = document.createElement('li');
      li.append(avatarEl(t.name, t.channelId), name, amount);
      list.append(li);
    }
  }
  for (const t of rows) breakdownCells.get(t.channelId).textContent = amountText(t, state.phase);
}

function renderJob(state) {
  lastState = state;
  showView('job');

  const busy = state.phase === 'scanning' || state.phase === 'deleting';
  const ready = state.phase === 'ready';

  $('job-title').textContent = ready ? T.t('confirmTitle') : T.title(state);

  // Barre de progression
  const bar = $('bar');
  const fill = $('bar-fill');
  bar.hidden = ready || ((state.phase === 'done' || state.phase === 'error') && !state.toDelete);
  bar.classList.toggle('unknown', state.phase === 'scanning');
  bar.classList.toggle('paused', state.paused);
  fill.style.width = state.phase === 'scanning' ? '' : T.percent(state) + '%';

  // Texte principal
  $('job-big').hidden = !ready;
  if (ready) {
    $('job-big').textContent = T.num(state.toDelete);
    $('job-line').textContent = T.t('bigLine', { n: state.toDelete });
  } else {
    $('job-line').textContent = T.line(state);
  }
  $('job-detail').textContent = T.detail(state);

  // Rappel des options actives
  const chips = $('job-filters');
  chips.replaceChildren();
  if (state.phase === 'scanning' || ready) {
    for (const text of state.filters.length ? state.filters.map(T.msg) : [T.t('allMine')]) {
      const li = document.createElement('li');
      li.textContent = text;
      chips.append(li);
    }
  }

  renderBreakdown(state);

  $('job-note').textContent = T.msg(state.phase === 'error' ? state.error : state.note);
  $('job-hint').textContent = busy ? T.t('hintBusy') : ready ? T.t('hintReady') : '';

  // Boutons
  const primary = $('btn-primary');
  const secondary = $('btn-secondary');
  secondary.hidden = !busy && !ready;
  secondary.textContent = T.t(state.phase === 'deleting' ? 'btnStop' : 'btnCancel');
  secondary.disabled = state.stopping;
  primary.disabled = state.stopping;
  primary.className = ready ? 'danger' : '';
  if (ready) primary.textContent = T.t('btnYesDelete');
  else if (busy) primary.textContent = T.t(state.paused ? 'btnResume' : 'btnPause');
  else primary.textContent = T.t('btnOk');
}

async function tick() {
  const state = await send({ type: 'ddm:status' });
  if (!state) {
    clearInterval(pollTimer);
    info('infoGone');
    return;
  }
  if (state.phase === 'idle') renderSetup();
  else renderJob(state);
}

function startPolling() {
  clearInterval(pollTimer);
  tick();
  pollTimer = setInterval(tick, 500);
}

// ---------------------------------------------------------------------
// Démarrage et événements
// ---------------------------------------------------------------------

async function init() {
  // Langue : celle choisie auparavant, sinon celle du navigateur.
  try {
    const { ddmLang } = await chrome.storage.local.get('ddmLang');
    if (ddmLang) T.setLang(ddmLang);
  } catch (e) {}
  applyLang();

  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !isDiscord(tab.url)) {
    tab = null;
    info('infoNotDiscord');
    return;
  }

  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['shared.js', 'content.js'] });
  } catch (e) {
    info('infoNoAccess');
    return;
  }

  target = readTarget();
  await restoreOptions();

  const state = await send({ type: 'ddm:status' });
  if (state && state.phase !== 'idle') startPolling();
  else renderSetup();
}

function bindEvents() {
  for (const code of ['fr', 'en']) $('lang-' + code).addEventListener('click', () => setLang(code));

  for (const name of ['single', 'mass']) {
    $('tab-' + name).addEventListener('click', () => {
      activeTab = name;
      renderSetup();
      syncOptions();
    });
  }

  for (const id of OPTION_IDS) {
    $(id).addEventListener('input', () => syncOptions());
    $(id).addEventListener('change', () => syncOptions());
  }
  $('opt-reset').addEventListener('click', () => {
    for (const id of OPTION_IDS) setValue(id, OPTION_DEFAULTS[id]);
    syncOptions();
  });

  $('mass-search').addEventListener('input', () => {
    if (dms) renderMassList();
  });
  $('mass-all').addEventListener('change', () => {
    const check = $('mass-all').checked;
    for (const dm of visibleDms()) {
      if (check) selected.add(dm.id);
      else selected.delete(dm.id);
    }
    if (dms) renderMassList();
  });

  $('btn-start').addEventListener('click', startJob);

  $('btn-primary').addEventListener('click', async () => {
    const state = lastState;
    if (!state) return;
    if (state.phase === 'ready') await send({ type: 'ddm:confirm' });
    else if (state.phase === 'scanning' || state.phase === 'deleting') {
      await send({ type: state.paused ? 'ddm:resume' : 'ddm:pause' });
    } else {
      await send({ type: 'ddm:reset' });
    }
    tick();
  });

  $('btn-secondary').addEventListener('click', async () => {
    await send({ type: 'ddm:stop' });
    tick();
  });
}

applyLang();
bindEvents();
init();
