// =============================================
// Firebase Configuration — Clube do Natural
// =============================================
// This file initializes Firebase App, Auth and Firestore.
// Config is loaded from localStorage (set via admin/setup) or defaults.

(function () {
  'use strict';

  const DEFAULT_CONFIG = {
    apiKey: "AIzaSyBjZEQHSbckyxyNWZp-g3OMGHpR2M1fS1M",
    authDomain: "clube-do-natural.firebaseapp.com",
    projectId: "clube-do-natural",
    storageBucket: "clube-do-natural.firebasestorage.app",
    messagingSenderId: "940466691658",
    appId: "1:940466691658:web:2fe4effb0b63523a2f10b3"
  };

  // Try to load saved config
  let config;
  try {
    const saved = localStorage.getItem('cdn_firebase_config');
    config = saved ? JSON.parse(saved) : DEFAULT_CONFIG;
  } catch (e) {
    config = DEFAULT_CONFIG;
  }

  // Only initialize if config has real values
  window.CdnFirebase = {
    ready: false,
    app: null,
    auth: null,
    db: null,
    storage: null,
    config: config,

    init() {
      if (this.ready) return true;

      if (!config.apiKey || !config.projectId) {
        console.warn('[Firebase] Config não encontrada. Acesse /admin/setup.html para configurar.');
        return false;
      }

      try {
        if (!firebase.apps.length) {
          this.app = firebase.initializeApp(config);
        } else {
          this.app = firebase.apps[0];
        }
        this.auth = firebase.auth();
        this.db = firebase.firestore();
        this.storage = firebase.storage();

        // Enable offline persistence (must be called before any other Firestore call)
        this.db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

        this.ready = true;
        console.log('[Firebase] Initialized OK — project:', config.projectId);
        return true;
      } catch (err) {
        console.error('[Firebase] Init error:', err);
        return false;
      }
    },

    saveConfig(newConfig) {
      localStorage.setItem('cdn_firebase_config', JSON.stringify(newConfig));
      this.config = newConfig;
    },

    isConfigured() {
      return !!(config.apiKey && config.projectId);
    }
  };

  // Auto-init if configured
  if (CdnFirebase.isConfigured()) {
    // Wait for Firebase SDK to load
    if (typeof firebase !== 'undefined') {
      CdnFirebase.init();
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        if (typeof firebase !== 'undefined') CdnFirebase.init();
      });
    }
  }
})();
