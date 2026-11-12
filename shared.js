// Langues et textes communs au menu et à l'encart affiché dans Discord.
// Chargé avant popup.js et avant content.js.

globalThis.DDM = globalThis.DDM || (() => {
  const LOCALE = { fr: 'fr-FR', en: 'en-US' };
  const browserLang = () => ((navigator.language || '').toLowerCase().startsWith('fr') ? 'fr' : 'en');
  let lang = browserLang();

  const num = (v) => Number(v || 0).toLocaleString(LOCALE[lang]);
  // En français 0 et 1 sont au singulier ; en anglais seul 1 l'est.
  const isMany = (n) => (lang === 'fr' ? n > 1 : n !== 1);
  const pl = (n, one, other) => `${num(n)} ${isMany(n) ? other : one}`;
  const day = (ms) => new Date(ms).toLocaleDateString(LOCALE[lang]);
  const pad = (n) => String(n).padStart(2, '0');

  const STR = {
    fr: {
      // Menu : réglages
      appTitle: 'Oblivio',
      tabSingle: 'Cette conversation',
      tabMass: 'Tous mes MP',
      openConv: 'Conversation ouverte',
      singleEmpty: "Ouvre une conversation privée ou un groupe dans Discord pour la nettoyer ici, ou passe par l'onglet « Tous mes MP ».",
      searchPh: 'Rechercher une conversation',
      selectAll: 'Tout sélectionner',
      options: 'Options',
      period: 'Période',
      periodAll: 'Toutes les dates',
      periodOlder: 'Plus anciens que…',
      periodRange: 'Dates précises',
      days: 'jours',
      ariaDays: 'Nombre de jours',
      rangeTo: 'au',
      ariaFrom: 'À partir du',
      ariaTo: "Jusqu'au",
      containing: 'Contenant',
      keywordPh: 'un mot (vide = tout)',
      onlyWith: 'Seulement avec',
      attachment: 'pièce jointe',
      link: 'lien',
      keepMy: 'Garder mes',
      lastMessages: 'derniers messages',
      resetOptions: 'Réinitialiser les options',
      startHint: "L'extension compte d'abord les messages, puis te demande de confirmer. Seuls tes propres messages sont concernés.",
      infoNotDiscord: "Ouvre Discord dans cet onglet (discord.com), puis reclique sur l'extension.",
      infoNoAccess: "Impossible d'accéder à l'onglet Discord. Recharge la page (F5) puis réessaie.",
      infoGone: "L'onglet Discord ne répond plus (page rechargée ou fermée). Rouvre l'extension depuis Discord.",
      btnDeleteMine: 'Supprimer mes messages',
      btnDeleteIn: (p) => `Supprimer dans ${pl(p.n, 'conversation', 'conversations')}`,
      btnPick: 'Sélectionne des conversations',
      badge: (p) => (p.n > 1 ? `${p.n} actives` : '1 active'),
      errDays: 'Indique un nombre de jours (1 ou plus).',
      errPickDate: 'Choisis au moins une date.',
      errDateOrder: 'La date de début est après la date de fin.',
      massLoading: 'Chargement de tes conversations…',
      massLoadFail: 'Impossible de lire tes conversations. Recharge la page Discord (F5) puis réessaie.',
      massNone: 'Aucune conversation privée dans ta liste Discord.',
      massNoMatch: 'Aucune conversation ne correspond à cette recherche.',
      massCount: (p) => `${p.a} sur ${p.b}`,
      subGroup: (p) => `Groupe · ${pl(p.n, 'membre', 'membres')}`,
      subDm: 'Message privé',
      unknownUser: 'Utilisateur inconnu',
      unnamedGroup: 'Groupe sans nom',
      defaultConv: 'Conversation ouverte',

      // Menu : travail en cours
      confirmTitle: 'Confirmer la suppression',
      bigLine: (p) => (p.n > 1 ? 'messages vont être supprimés définitivement.' : 'message va être supprimé définitivement.'),
      allMine: 'Tous mes messages',
      hintBusy: "Tu peux fermer ce menu : le travail continue tant que l'onglet Discord reste ouvert.",
      hintReady: 'Les messages supprimés ne peuvent pas être récupérés.',
      btnCancel: 'Annuler',
      btnStop: 'Arrêter',
      btnPause: 'Pause',
      btnResume: 'Reprendre',
      btnOk: 'OK',
      btnYesDelete: 'Oui, supprimer',
      btnDelete: 'Supprimer',
      btnClose: 'Fermer',
      unreadable: 'illisible',

      // États
      tStopping: 'Arrêt en cours…',
      tScanning: 'Analyse en cours…',
      tScanPaused: 'Analyse en pause',
      tReady: 'Analyse terminée',
      tDeleting: 'Suppression en cours…',
      tDeletePaused: 'Suppression en pause',
      tDone: 'Suppression terminée',
      tNothing: 'Rien à supprimer',
      tStopped: 'Suppression arrêtée',
      tError: 'Suppression interrompue',
      lineScanning: (p) => `${pl(p.scanned, 'message parcouru', 'messages parcourus')} · ${num(p.toDelete)} à supprimer`,
      lineReady: (p) => `${pl(p.n, 'message', 'messages')} à supprimer`,
      lineProgress: (p) => `${num(p.done)} sur ${pl(p.n, 'message supprimé', 'messages supprimés')}`,
      lineDone: (p) => pl(p.n, 'message supprimé', 'messages supprimés'),
      skipped: (p) => ` · ${num(p.n)} non supprimable${p.n > 1 ? 's' : ''}`,
      inConvs: (p) => `dans ${pl(p.n, 'conversation', 'conversations')}`,
      etaTotal: (p) => `durée estimée : environ ${p.d}`,
      etaLeft: (p) => `temps restant : environ ${p.d}`,
      durShort: "moins d'une minute",
      durMin: (p) => `${p.m} min`,
      durHour: (p) => (p.m ? `${p.h} h ${pad(p.m)}` : `${p.h} h`),

      // Messages venant du moteur
      nReconnect: 'Connexion perdue, nouvelle tentative…',
      nSlow: (p) => `Discord demande de ralentir, pause de ${p.s} s…`,
      nNoMatch: 'Aucun message ne correspond à ces réglages.',
      eOffline: 'Connexion à Discord impossible. Vérifie ta connexion internet.',
      eExpired: 'Session Discord expirée. Recharge la page (F5) puis réessaie.',
      eNoSession: 'Session Discord introuvable. Recharge la page Discord (F5) puis réessaie.',
      eUnreadable: 'Impossible de lire cette conversation.',
      eDiscord: (p) => `Erreur Discord (${p.status}). Réessaie dans quelques minutes.`,
      eNoTarget: 'Aucune conversation sélectionnée.',
      eListFail: (p) => `Impossible de lire tes conversations (erreur ${p.status}).`,
      eBusy: 'Un travail est déjà en cours.',
      eUnknown: 'Erreur inconnue.',

      // Rappel des options actives
      fOlder: (p) => `Plus anciens que ${pl(p.n, 'jour', 'jours')}`,
      fRange: (p) => `Du ${day(p.a)} au ${day(p.b)}`,
      fUntil: (p) => `Jusqu'au ${day(p.b)}`,
      fFrom: (p) => `À partir du ${day(p.a)}`,
      fKeyword: (p) => `Contenant « ${p.w} »`,
      fFilesOrLinks: 'Avec pièce jointe ou lien',
      fFiles: 'Avec pièce jointe',
      fLinks: 'Avec lien',
      fKeep: (p) => `En gardant mes ${pl(p.n, 'dernier message', 'derniers messages')}`
    },

    en: {
      appTitle: 'Oblivio',
      tabSingle: 'This conversation',
      tabMass: 'All my DMs',
      openConv: 'Open conversation',
      singleEmpty: 'Open a DM or group chat in Discord to clean it here, or use the “All my DMs” tab.',
      searchPh: 'Search conversations',
      selectAll: 'Select all',
      options: 'Options',
      period: 'Period',
      periodAll: 'Any date',
      periodOlder: 'Older than…',
      periodRange: 'Date range',
      days: 'days',
      ariaDays: 'Number of days',
      rangeTo: 'to',
      ariaFrom: 'From',
      ariaTo: 'Until',
      containing: 'Containing',
      keywordPh: 'a word (empty = all)',
      onlyWith: 'Only with',
      attachment: 'attachment',
      link: 'link',
      keepMy: 'Keep my',
      lastMessages: 'latest messages',
      resetOptions: 'Reset options',
      startHint: 'The extension counts the messages first, then asks you to confirm. Only your own messages are affected.',
      infoNotDiscord: 'Open Discord in this tab (discord.com), then click the extension again.',
      infoNoAccess: "Can't access the Discord tab. Reload the page (F5) and try again.",
      infoGone: 'The Discord tab stopped responding (page reloaded or closed). Reopen the extension from Discord.',
      btnDeleteMine: 'Delete my messages',
      btnDeleteIn: (p) => `Delete in ${pl(p.n, 'conversation', 'conversations')}`,
      btnPick: 'Select conversations',
      badge: (p) => `${p.n} active`,
      errDays: 'Enter a number of days (1 or more).',
      errPickDate: 'Pick at least one date.',
      errDateOrder: 'The start date is after the end date.',
      massLoading: 'Loading your conversations…',
      massLoadFail: "Couldn't read your conversations. Reload the Discord page (F5) and try again.",
      massNone: 'No direct messages in your Discord list.',
      massNoMatch: 'No conversation matches this search.',
      massCount: (p) => `${p.a} of ${p.b}`,
      subGroup: (p) => `Group · ${pl(p.n, 'member', 'members')}`,
      subDm: 'Direct message',
      unknownUser: 'Unknown user',
      unnamedGroup: 'Unnamed group',
      defaultConv: 'Open conversation',

      confirmTitle: 'Confirm deletion',
      bigLine: (p) => (p.n === 1 ? 'message will be permanently deleted.' : 'messages will be permanently deleted.'),
      allMine: 'All my messages',
      hintBusy: 'You can close this menu: the job keeps running as long as the Discord tab stays open.',
      hintReady: "Deleted messages can't be recovered.",
      btnCancel: 'Cancel',
      btnStop: 'Stop',
      btnPause: 'Pause',
      btnResume: 'Resume',
      btnOk: 'OK',
      btnYesDelete: 'Yes, delete',
      btnDelete: 'Delete',
      btnClose: 'Close',
      unreadable: 'unreadable',

      tStopping: 'Stopping…',
      tScanning: 'Scanning…',
      tScanPaused: 'Scan paused',
      tReady: 'Scan complete',
      tDeleting: 'Deleting…',
      tDeletePaused: 'Deletion paused',
      tDone: 'Deletion complete',
      tNothing: 'Nothing to delete',
      tStopped: 'Deletion stopped',
      tError: 'Deletion interrupted',
      lineScanning: (p) => `${pl(p.scanned, 'message scanned', 'messages scanned')} · ${num(p.toDelete)} to delete`,
      lineReady: (p) => `${pl(p.n, 'message', 'messages')} to delete`,
      lineProgress: (p) => `${num(p.done)} of ${pl(p.n, 'message deleted', 'messages deleted')}`,
      lineDone: (p) => pl(p.n, 'message deleted', 'messages deleted'),
      skipped: (p) => ` · ${num(p.n)} not deletable`,
      inConvs: (p) => `in ${pl(p.n, 'conversation', 'conversations')}`,
      etaTotal: (p) => `estimated time: about ${p.d}`,
      etaLeft: (p) => `time left: about ${p.d}`,
      durShort: 'less than a minute',
      durMin: (p) => `${p.m} min`,
      durHour: (p) => (p.m ? `${p.h} h ${pad(p.m)}` : `${p.h} h`),

      nReconnect: 'Connection lost, retrying…',
      nSlow: (p) => `Discord asked to slow down, pausing for ${p.s} s…`,
      nNoMatch: 'No message matches these settings.',
      eOffline: "Can't reach Discord. Check your internet connection.",
      eExpired: 'Discord session expired. Reload the page (F5) and try again.',
      eNoSession: 'Discord session not found. Reload the Discord page (F5) and try again.',
      eUnreadable: "Can't read this conversation.",
      eDiscord: (p) => `Discord error (${p.status}). Try again in a few minutes.`,
      eNoTarget: 'No conversation selected.',
      eListFail: (p) => `Couldn't read your conversations (error ${p.status}).`,
      eBusy: 'A job is already running.',
      eUnknown: 'Unknown error.',

      fOlder: (p) => `Older than ${pl(p.n, 'day', 'days')}`,
      fRange: (p) => `From ${day(p.a)} to ${day(p.b)}`,
      fUntil: (p) => `Until ${day(p.b)}`,
      fFrom: (p) => `From ${day(p.a)}`,
      fKeyword: (p) => `Containing “${p.w}”`,
      fFilesOrLinks: 'With attachment or link',
      fFiles: 'With attachment',
      fLinks: 'With link',
      fKeep: (p) => `Keeping my ${pl(p.n, 'latest message', 'latest messages')}`
    }
  };

  function t(key, params) {
    const value = key in STR[lang] ? STR[lang][key] : STR.en[key];
    if (typeof value === 'function') return value(params || {});
    return value == null ? String(key) : value;
  }

  // Traduit un message { key, p } produit par le moteur.
  const msg = (m) => (!m ? '' : typeof m === 'string' ? m : t(m.key, m.p));

  function duration(seconds) {
    if (seconds == null) return '';
    if (seconds < 60) return t('durShort');
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return t('durMin', { m: minutes });
    return t('durHour', { h: Math.floor(minutes / 60), m: minutes % 60 });
  }

  const skipped = (s) => (s.skipped ? t('skipped', { n: s.skipped }) : '');

  function title(s) {
    if (s.stopping) return t('tStopping');
    switch (s.phase) {
      case 'scanning': return t(s.paused ? 'tScanPaused' : 'tScanning');
      case 'ready': return t('tReady');
      case 'deleting': return t(s.paused ? 'tDeletePaused' : 'tDeleting');
      case 'done': return t(s.toDelete ? 'tDone' : 'tNothing');
      case 'stopped': return t('tStopped');
      case 'error': return t('tError');
      default: return '';
    }
  }

  function line(s) {
    switch (s.phase) {
      case 'scanning':
        return t('lineScanning', { scanned: s.scanned, toDelete: s.toDelete });
      case 'ready':
        return t('lineReady', { n: s.toDelete });
      case 'deleting':
        return t('lineProgress', { done: s.deleted, n: s.toDelete }) + skipped(s);
      case 'done':
        return s.toDelete ? t('lineDone', { n: s.deleted }) + skipped(s) : '';
      case 'stopped':
      case 'error':
        return (
          (s.toDelete ? t('lineProgress', { done: s.deleted, n: s.toDelete }) : t('lineDone', { n: s.deleted })) +
          skipped(s)
        );
      default:
        return '';
    }
  }

  function detail(s) {
    const parts = [];
    const busy = s.phase === 'scanning' || s.phase === 'deleting';
    const current = s.mass && busy && s.current >= 0 ? s.targets[s.current] : null;
    if (current) parts.push(`${current.name} (${s.current + 1}/${s.targets.length})`);
    if (s.mass && s.phase === 'ready') {
      parts.push(t('inConvs', { n: s.targets.filter((x) => x.found > 0).length }));
    }
    if (s.etaSeconds != null) {
      if (s.phase === 'ready') parts.push(t('etaTotal', { d: duration(s.etaSeconds) }));
      if (s.phase === 'deleting' && !s.paused && !s.stopping) {
        parts.push(t('etaLeft', { d: duration(s.etaSeconds) }));
      }
    }
    const text = parts.join(' · ');
    // Majuscule en début de phrase, sauf si elle commence par un nom de conversation.
    return text && !current ? text[0].toUpperCase() + text.slice(1) : text;
  }

  const percent = (s) =>
    s.toDelete ? Math.min(100, Math.round(((s.deleted + s.skipped) / s.toDelete) * 100)) : 0;

  // Applique la langue aux éléments marqués data-i18n dans une page.
  function applyDom(doc) {
    doc.documentElement.lang = lang;
    for (const el of doc.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    for (const el of doc.querySelectorAll('[data-i18n-ph]')) el.placeholder = t(el.dataset.i18nPh);
    for (const el of doc.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  }

  return {
    t, msg, num, duration, title, line, detail, percent, applyDom, browserLang,
    getLang: () => lang,
    setLang: (value) => { lang = value === 'fr' || value === 'en' ? value : browserLang(); }
  };
})();
