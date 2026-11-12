// 1. Méthode de secours pour retrouver la session Discord : on note l'en-tête
//    "Authorization" que Discord envoie lui-même à sa propre API.
//    La valeur reste en mémoire dans le navigateur (storage.session) et n'est
//    jamais envoyée ailleurs que sur discord.com.

let lastSeen = null;

chrome.webRequest.onSendHeaders.addListener(
  (details) => {
    const header = (details.requestHeaders || []).find(
      (h) => h.name.toLowerCase() === 'authorization'
    );
    if (!header || !header.value || header.value === lastSeen) return;
    lastSeen = header.value;
    chrome.storage.session.set({ ddmToken: header.value });
  },
  { urls: ['https://discord.com/api/*', 'https://*.discord.com/api/*'] },
  ['requestHeaders', 'extraHeaders']
);

// 2. Notification du navigateur quand une suppression se termine.

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== 'ddm:notify') return;
  chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: String(msg.title || chrome.i18n.getMessage('extName')).slice(0, 80),
    message: String(msg.message || '').slice(0, 200)
  });
});
