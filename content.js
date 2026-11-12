// Script injecté dans l'onglet Discord. C'est lui qui fait le travail, pour que
// tout continue même quand le menu de l'extension est fermé.
//
// Déroulement d'un travail :
//   1. Analyse  : on parcourt la ou les conversations et on note les messages
//                 à supprimer (les miens, qui passent les filtres).
//   2. Prêt     : on attend la confirmation de l'utilisateur.
//   3. Suppression : on supprime les messages notés, un par un.
//
// API Discord utilisée (https://discord.com/developers/docs) :
//   GET    /users/@me                                   -> mon identifiant
//   GET    /users/@me/channels                          -> mes MP et groupes ouverts
//   GET    /channels/{id}/messages?limit=100&before={id}
//   DELETE /channels/{id}/messages/{message.id}         -> 204
//   429 + { retry_after: secondes } quand on va trop vite.

(() => {
  if (globalThis.__ddmV3) return;
  globalThis.__ddmV3 = true;

  const T = globalThis.DDM; // textes et langue (shared.js)
  const API = location.origin + '/api/v9';
  const DISCORD_EPOCH = 1420070400000;
  const BASE_DELAY = 1000; // pause entre deux suppressions (ms)
  const MAX_DELAY = 4000;
  const SCAN_DELAY = 150; // pause entre deux pages d'analyse (ms)

  class Stopped extends Error {}

  // Erreur destinée à l'utilisateur : on garde une clé de texte plutôt qu'une
  // phrase, pour pouvoir l'afficher dans la langue choisie.
  class JobError extends Error {
    constructor(key, p) {
      super(key);
      this.key = key;
      this.p = p;
    }
  }

  const fresh = () => ({
    phase: 'idle', // idle | scanning | ready | deleting | done | stopped | error
    paused: false,
    stopping: false,
    mass: false,
    targets: [], // { channelId, guildId, name, found, deleted, skipped, status }
    current: -1,
    scanned: 0,
    toDelete: 0,
    deleted: 0,
    skipped: 0,
    etaSeconds: null,
    filters: [], // messages { key, p }
    note: null, // message { key, p } ou null
    error: null
  });

  let state = fresh();
  let stopFlag = false;
  let queue = new Map(); // channelId -> identifiants des messages à supprimer
  let auth = null; // { token, me }
  let deleteDelay = BASE_DELAY;
  let avgRequestMs = 300;
  let ui = null;

  const isBusy = () => state.phase === 'scanning' || state.phase === 'deleting';

  function update(patch) {
    Object.assign(state, patch);
    render();
  }

  // ---------------------------------------------------------------------
  // Attentes, pause et arrêt
  // ---------------------------------------------------------------------

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // Point de contrôle : s'arrête ici si l'utilisateur a demandé l'arrêt,
  // et patiente tant que la pause est active.
  async function checkpoint() {
    if (stopFlag) throw new Stopped();
    while (state.paused) {
      await wait(200);
      if (stopFlag) throw new Stopped();
    }
  }

  async function sleep(ms) {
    for (let left = ms; left > 0; left -= 200) {
      await checkpoint();
      await wait(Math.min(200, left));
    }
    await checkpoint();
  }

  // ---------------------------------------------------------------------
  // Appels à Discord
  // ---------------------------------------------------------------------

  async function api(method, path, token, inJob = true) {
    let failures = 0;
    const pause = (ms) => (inJob ? sleep(ms) : wait(ms));

    for (;;) {
      if (inJob) await checkpoint();

      let res;
      try {
        res = await fetch(API + path, { method, headers: { Authorization: token } });
      } catch (e) {
        if (++failures > 5) throw new JobError('eOffline');
        if (inJob) update({ note: { key: 'nReconnect' } });
        await pause(3000);
        continue;
      }

      if (res.status === 429) {
        let seconds = Number(res.headers.get('Retry-After')) || 5;
        try {
          const body = await res.json();
          if (Number(body.retry_after) > 0) seconds = Number(body.retry_after);
        } catch (e) {}
        if (method === 'DELETE') deleteDelay = Math.min(deleteDelay + 250, MAX_DELAY);
        if (inJob) update({ note: { key: 'nSlow', p: { s: Math.ceil(seconds) } } });
        await pause(seconds * 1000 + 300);
        continue;
      }

      if (res.status >= 500 && ++failures <= 5) {
        await pause(3000);
        continue;
      }

      if (inJob && state.note) update({ note: null });
      return res;
    }
  }

  // Trouve une session valide parmi les candidates et retient qui je suis.
  async function resolveAuth(tokens, inJob) {
    const candidates = [];
    for (const t of [auth && auth.token, ...(Array.isArray(tokens) ? tokens : [])]) {
      if (typeof t === 'string' && t && !candidates.includes(t)) candidates.push(t);
    }
    for (const token of candidates) {
      const res = await api('GET', '/users/@me', token, inJob);
      if (res.ok) {
        auth = { token, me: await res.json() };
        return auth;
      }
    }
    auth = null;
    throw new JobError('eNoSession');
  }

  // Liste de mes conversations privées et groupes ouverts, la plus récente d'abord.
  async function listDms(tokens) {
    const { token } = await resolveAuth(tokens, false);
    const res = await api('GET', '/users/@me/channels', token, false);
    if (!res.ok) throw new JobError('eListFail', { status: res.status });
    const channels = await res.json();

    const last = (c) => {
      try {
        return BigInt(c.last_message_id || c.id || 0);
      } catch (e) {
        return 0n;
      }
    };

    return (Array.isArray(channels) ? channels : [])
      .filter((c) => c && (c.type === 1 || c.type === 3))
      .sort((a, b) => (last(a) < last(b) ? 1 : last(a) > last(b) ? -1 : 0))
      .map((c) => {
        // Données brutes : c'est le menu qui les met en forme dans la bonne langue.
        const people = Array.isArray(c.recipients) ? c.recipients : [];
        const label = (u) => u.global_name || u.username || '';
        if (c.type === 3) {
          return {
            id: c.id,
            group: true,
            name: c.name || people.map(label).filter(Boolean).join(', '),
            members: people.length + 1,
            username: '',
            avatar: c.icon ? `https://cdn.discordapp.com/channel-icons/${c.id}/${c.icon}.png?size=64` : null
          };
        }
        const user = people[0] || {};
        return {
          id: c.id,
          group: false,
          name: label(user),
          members: 2,
          username: user.username || '',
          avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64` : null
        };
      });
  }

  // ---------------------------------------------------------------------
  // Filtres
  // ---------------------------------------------------------------------

  // Les identifiants Discord contiennent la date du message.
  const timeOf = (id) => Number(BigInt(id) >> 22n) + DISCORD_EPOCH;
  const idAt = (ms) => (ms > DISCORD_EPOCH ? String(BigInt(Math.floor(ms) - DISCORD_EPOCH) << 22n) : null);

  // Les messages "système" (appel, ajout d'un membre, changement de nom du
  // groupe…) ne peuvent pas être supprimés : inutile d'essayer.
  const isDeletable = (m) => m.type === 0 || (m.type >= 6 && m.type <= 21);

  function normalizeFilters(raw) {
    const positive = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
    return {
      after: positive(raw.after), // ne garder que les messages à partir de cette date (ms)
      before: positive(raw.before), // … et jusqu'à cette date incluse (ms)
      keyword: String(raw.keyword || '').trim().toLowerCase(),
      withFiles: !!raw.withFiles,
      withLinks: !!raw.withLinks,
      keepLast: Math.max(0, Math.floor(Number(raw.keepLast) || 0))
    };
  }

  // Rappel des options actives, sous forme de messages { key, p } traduits à l'affichage.
  function filterLabels(f, raw) {
    const out = [];
    const olderDays = Math.floor(Number(raw.olderDays) || 0);
    if (f.before && !f.after && olderDays > 0) out.push({ key: 'fOlder', p: { n: olderDays } });
    else if (f.after && f.before) out.push({ key: 'fRange', p: { a: f.after, b: f.before } });
    else if (f.before) out.push({ key: 'fUntil', p: { b: f.before } });
    else if (f.after) out.push({ key: 'fFrom', p: { a: f.after } });
    if (f.keyword) out.push({ key: 'fKeyword', p: { w: f.keyword } });
    if (f.withFiles && f.withLinks) out.push({ key: 'fFilesOrLinks' });
    else if (f.withFiles) out.push({ key: 'fFiles' });
    else if (f.withLinks) out.push({ key: 'fLinks' });
    if (f.keepLast) out.push({ key: 'fKeep', p: { n: f.keepLast } });
    return out;
  }

  function matchesContent(m, f) {
    const content = String(m.content || '');
    if (f.keyword && !content.toLowerCase().includes(f.keyword)) return false;
    if (f.withFiles || f.withLinks) {
      const hasFile = Array.isArray(m.attachments) && m.attachments.length > 0;
      const hasLink = /https?:\/\//i.test(content) || (Array.isArray(m.embeds) && m.embeds.length > 0);
      if (!((f.withFiles && hasFile) || (f.withLinks && hasLink))) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------------
  // Étape 1 : analyse
  // ---------------------------------------------------------------------

  async function scan(f) {
    for (let i = 0; i < state.targets.length; i++) {
      const target = state.targets[i];
      const ids = [];
      queue.set(target.channelId, ids);
      target.status = 'scanning';
      update({ current: i });

      let kept = 0;
      // Sans "garder les N derniers", on peut commencer directement à la date de fin.
      let before = !f.keepLast && f.before ? idAt(f.before + 1) : null;
      let finished = false;

      while (!finished) {
        const res = await api(
          'GET',
          `/channels/${target.channelId}/messages?limit=100` + (before ? `&before=${before}` : ''),
          auth.token
        );
        if (res.status === 401) throw new JobError('eExpired');
        if (!res.ok) {
          if (state.mass) {
            // En masse, une conversation illisible ne bloque pas les autres.
            target.status = 'error';
            break;
          }
          if (res.status === 403 || res.status === 404) throw new JobError('eUnreadable');
          throw new JobError('eDiscord', { status: res.status });
        }

        const batch = await res.json();
        if (!Array.isArray(batch) || batch.length === 0) break;

        // Les messages arrivent du plus récent au plus ancien.
        for (const m of batch) {
          const time = timeOf(m.id);
          if (f.after && time < f.after) {
            finished = true; // tout le reste est encore plus ancien
            break;
          }
          if (!m.author || m.author.id !== auth.me.id || !isDeletable(m)) continue;
          if (kept < f.keepLast) {
            kept++;
            continue;
          }
          if (f.before && time > f.before) continue;
          if (!matchesContent(m, f)) continue;
          ids.push(m.id);
        }

        before = batch[batch.length - 1].id;
        target.found = ids.length;
        update({
          scanned: state.scanned + batch.length,
          toDelete: state.targets.reduce((sum, t) => sum + t.found, 0)
        });
        if (!finished) await sleep(SCAN_DELAY);
      }

      if (target.status !== 'error') target.status = 'scanned';
    }
  }

  function sanitizeTargets(list) {
    const seen = new Set();
    const out = [];
    for (const t of Array.isArray(list) ? list : []) {
      if (!t || !/^\d+$/.test(t.channelId) || seen.has(t.channelId)) continue;
      seen.add(t.channelId);
      out.push({
        channelId: t.channelId,
        guildId: /^\d+$/.test(t.guildId) ? t.guildId : null,
        name: String(t.name || 'Conversation').slice(0, 100),
        found: 0,
        deleted: 0,
        skipped: 0,
        status: 'pending'
      });
    }
    return out;
  }

  async function startJob(msg) {
    stopFlag = false;
    deleteDelay = BASE_DELAY;
    avgRequestMs = 300;
    queue = new Map();
    state = fresh();

    const raw = msg.filters && typeof msg.filters === 'object' ? msg.filters : {};
    const filters = normalizeFilters(raw);
    const targets = sanitizeTargets(msg.targets);
    update({ phase: 'scanning', mass: !!msg.mass, targets, filters: filterLabels(filters, raw) });

    try {
      if (!targets.length) throw new JobError('eNoTarget');
      await resolveAuth(msg.tokens, true);
      await scan(filters);

      if (state.toDelete === 0) {
        update({ phase: 'done', current: -1, note: { key: 'nNoMatch' } });
      } else {
        update({
          phase: 'ready',
          current: -1,
          note: null,
          etaSeconds: Math.round((state.toDelete * (BASE_DELAY + avgRequestMs)) / 1000)
        });
      }
    } catch (e) {
      if (e instanceof Stopped) {
        // Annuler une analyse ne laisse aucune trace : rien n'a été supprimé.
        state = fresh();
        queue = new Map();
        render();
      } else {
        update({ phase: 'error', paused: false, stopping: false, note: null, error: messageOf(e) });
      }
    } finally {
      stopFlag = false;
    }
  }

  // ---------------------------------------------------------------------
  // Étape 3 : suppression (après confirmation)
  // ---------------------------------------------------------------------

  const remainingSeconds = () =>
    Math.round(((state.toDelete - state.deleted - state.skipped) * (deleteDelay + avgRequestMs)) / 1000);

  async function runDelete() {
    update({ phase: 'deleting', current: -1, note: null, etaSeconds: remainingSeconds() });

    try {
      for (let i = 0; i < state.targets.length; i++) {
        const target = state.targets[i];
        const ids = queue.get(target.channelId) || [];
        if (!ids.length) continue;

        target.status = 'deleting';
        update({ current: i });

        for (const id of ids) {
          await checkpoint();
          const started = performance.now();
          const res = await api('DELETE', `/channels/${target.channelId}/messages/${id}`, auth.token);
          avgRequestMs = avgRequestMs * 0.8 + (performance.now() - started) * 0.2;

          if (res.status === 401) throw new JobError('eExpired');
          // 404 = déjà supprimé entre-temps : le résultat voulu est atteint.
          if (res.ok || res.status === 404) {
            target.deleted++;
            state.deleted++;
          } else {
            target.skipped++;
            state.skipped++;
          }
          update({ etaSeconds: remainingSeconds() });

          if (state.deleted + state.skipped < state.toDelete) await sleep(deleteDelay);
        }
        target.status = 'done';
      }

      update({ phase: 'done', current: -1, etaSeconds: null, note: null });
      notify(T.t('tDone'), T.line(state));
    } catch (e) {
      if (e instanceof Stopped) {
        update({ phase: 'stopped', etaSeconds: null, note: null });
      } else {
        update({ phase: 'error', etaSeconds: null, note: null, error: messageOf(e) });
        notify(T.t('tError'), T.msg(state.error));
      }
    } finally {
      stopFlag = false;
      queue = new Map();
      if (state.paused || state.stopping) update({ paused: false, stopping: false });
    }
  }

  const messageOf = (e) => (e instanceof JobError ? { key: e.key, p: e.p } : { key: 'eUnknown' });

  function notify(title, message) {
    try {
      const sent = chrome.runtime.sendMessage({ type: 'ddm:notify', title, message });
      if (sent && sent.catch) sent.catch(() => {});
    } catch (e) {}
  }

  function requestStop() {
    if (state.phase === 'ready') {
      state = fresh();
      queue = new Map();
      render();
    } else if (isBusy() && !state.stopping) {
      stopFlag = true;
      update({ stopping: true, paused: false });
    }
  }

  function act(type, msg) {
    switch (type) {
      case 'start':
        if (!isBusy() && state.phase !== 'ready') startJob(msg || {});
        break;
      case 'confirm':
        if (state.phase === 'ready') runDelete();
        break;
      case 'pause':
        if (isBusy() && !state.stopping) update({ paused: true });
        break;
      case 'resume':
        if (state.paused) update({ paused: false });
        break;
      case 'stop':
        requestStop();
        break;
      case 'reset':
        if (!isBusy()) {
          state = fresh();
          queue = new Map();
          render();
        }
        break;
    }
  }

  // ---------------------------------------------------------------------
  // Encart affiché dans la page Discord
  // ---------------------------------------------------------------------

  function buildUi() {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;';
    const root = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
      .box { font: 13px/1.45 system-ui, "Segoe UI", sans-serif; width: 280px; padding: 14px;
             background: #17181c; color: #f1f2f4; border: 1px solid #33363f; border-radius: 12px;
             box-shadow: 0 10px 30px rgba(0,0,0,.5); }
      p { margin: 0; }
      .title { font-weight: 600; font-size: 14px; }
      .line { margin-top: 4px; color: #d7d9df; }
      .detail { margin-top: 2px; color: #a3a7b3; font-size: 12px; overflow-wrap: anywhere; }
      .note { margin-top: 6px; color: #f5b83d; font-size: 12px; }
      p:empty { display: none; }
      .bar { height: 6px; margin-top: 10px; border-radius: 3px; background: #33363f; overflow: hidden; }
      .bar[hidden] { display: none; }
      .fill { height: 100%; width: 0; border-radius: 3px; background: #e5484d; transition: width .3s ease; }
      .row { display: flex; gap: 8px; margin-top: 12px; }
      button { flex: 1; padding: 8px 10px; border: 0; border-radius: 8px; background: #2a2d35;
               color: #f1f2f4; font: inherit; font-weight: 600; cursor: pointer; }
      button:hover { background: #383c47; }
      button.danger { background: #e5484d; color: #fff; }
      button.danger:hover { background: #f2555a; }
      button:disabled { opacity: .5; cursor: default; }
      button[hidden] { display: none; }
    `;

    const el = (tag, cls) => {
      const node = document.createElement(tag);
      if (cls) node.className = cls;
      return node;
    };

    const box = el('div', 'box');
    const title = el('p', 'title');
    const line = el('p', 'line');
    const detail = el('p', 'detail');
    const note = el('p', 'note');
    const bar = el('div', 'bar');
    const fill = el('div', 'fill');
    bar.append(fill);
    const row = el('div', 'row');
    const secondary = el('button');
    const primary = el('button');
    secondary.type = primary.type = 'button';
    row.append(secondary, primary);

    primary.addEventListener('click', () => {
      if (state.phase === 'ready') act('confirm');
      else if (isBusy()) act(state.paused ? 'resume' : 'pause');
      else act('reset');
    });
    secondary.addEventListener('click', () => act('stop'));

    box.append(title, line, detail, note, bar, row);
    root.append(style, box);
    document.documentElement.appendChild(host);
    return { host, title, line, detail, note, bar, fill, primary, secondary };
  }

  function render() {
    try {
      if (state.phase === 'idle') {
        if (ui) ui.host.remove();
        ui = null;
        return;
      }
      if (!ui) ui = buildUi();

      ui.title.textContent = T.title(state);
      ui.line.textContent = T.line(state);
      ui.detail.textContent = T.detail(state);
      ui.note.textContent = T.msg(state.phase === 'error' ? state.error : state.note);

      ui.bar.hidden = state.phase !== 'deleting' && !(state.phase === 'stopped' && state.toDelete);
      ui.fill.style.width = T.percent(state) + '%';

      const busy = isBusy();
      ui.secondary.hidden = !busy && state.phase !== 'ready';
      ui.secondary.textContent = T.t(state.phase === 'deleting' ? 'btnStop' : 'btnCancel');
      ui.secondary.disabled = state.stopping;

      ui.primary.className = state.phase === 'ready' ? 'danger' : '';
      ui.primary.disabled = state.stopping;
      if (state.phase === 'ready') ui.primary.textContent = T.t('btnDelete');
      else if (busy) ui.primary.textContent = T.t(state.paused ? 'btnResume' : 'btnPause');
      else ui.primary.textContent = T.t('btnClose');
    } catch (e) {
      // L'encart est un confort : s'il casse, le travail continue.
    }
  }

  // Prévenir si on ferme ou recharge l'onglet en plein travail.
  window.addEventListener('beforeunload', (event) => {
    if (!isBusy()) return;
    event.preventDefault();
    event.returnValue = '';
  });

  // ---------------------------------------------------------------------
  // Messages venant du menu de l'extension
  // ---------------------------------------------------------------------

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('ddm:')) return;
    const type = msg.type.slice(4);

    // Le menu indique la langue choisie à chaque message.
    if ((msg.lang === 'fr' || msg.lang === 'en') && msg.lang !== T.getLang()) {
      T.setLang(msg.lang);
      render();
    }

    if (type === 'listDms') {
      if (isBusy()) {
        sendResponse({ ok: false, error: { key: 'eBusy' } });
        return;
      }
      listDms(msg.tokens).then(
        (list) => sendResponse({ ok: true, list }),
        (e) => sendResponse({ ok: false, error: messageOf(e) })
      );
      return true; // réponse asynchrone
    }

    if (type !== 'status') act(type, msg);
    sendResponse(state);
  });
})();
