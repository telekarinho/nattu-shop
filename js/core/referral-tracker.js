/* ============================================
   CLUBE DO NATURAL — Referral Tracker (public pages)
   Detects ?ref= parameter and stores for checkout attribution
   ============================================ */

const ReferralTracker = (() => {
  'use strict';

  function init() {
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');
    if (ref) {
      if (typeof Storage !== 'undefined' && Storage.set) {
        Storage.set('affiliate_ref', {
          code: ref,
          timestamp: new Date().toISOString(),
          landingPage: window.location.href,
        });
      } else {
        localStorage.setItem('cdn_affiliate_ref', JSON.stringify({
          code: ref,
          timestamp: new Date().toISOString(),
          landingPage: window.location.href,
        }));
      }
      // Clean URL without page reload
      if (window.history.replaceState) {
        const cleanUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, '', cleanUrl);
      }
    }
  }

  function getActiveReferral() {
    let ref = null;
    if (typeof Storage !== 'undefined' && Storage.get) {
      ref = Storage.get('affiliate_ref');
    } else {
      try { ref = JSON.parse(localStorage.getItem('cdn_affiliate_ref')); } catch (e) { /* */ }
    }
    if (!ref) return null;

    // Check expiry (30 days default)
    const maxAge = 30 * 24 * 60 * 60 * 1000;
    if (new Date() - new Date(ref.timestamp) > maxAge) {
      if (typeof Storage !== 'undefined' && Storage.remove) Storage.remove('affiliate_ref');
      else localStorage.removeItem('cdn_affiliate_ref');
      return null;
    }
    return ref;
  }

  // Auto-detect on load
  init();

  return { init, getActiveReferral };
})();
