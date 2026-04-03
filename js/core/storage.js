/* ============================================
   CLUBE DO NATURAL — localStorage Wrapper
   Versionamento + JSON auto parse/stringify
   ============================================ */

const Storage = (() => {
  const PREFIX = 'cdn_'; // clube do natural
  const VERSION_KEY = PREFIX + 'version';
  const CURRENT_VERSION = '1.0.0';

  function init() {
    const saved = localStorage.getItem(VERSION_KEY);
    if (saved !== CURRENT_VERSION) {
      // Future: migration logic here
      localStorage.setItem(VERSION_KEY, CURRENT_VERSION);
    }
  }

  return {
    init,

    get(key) {
      try {
        const raw = localStorage.getItem(PREFIX + key);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },

    set(key, value) {
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify(value));
      } catch (e) {
        console.warn('Storage full or error:', e);
      }
    },

    remove(key) {
      localStorage.removeItem(PREFIX + key);
    },

    clear() {
      Object.keys(localStorage)
        .filter(k => k.startsWith(PREFIX))
        .forEach(k => localStorage.removeItem(k));
    },

    // LGPD consent
    getConsent() {
      return this.get('lgpd_consent');
    },

    setConsent(preferences) {
      this.set('lgpd_consent', {
        ...preferences,
        timestamp: new Date().toISOString(),
      });
    },
  };
})();
