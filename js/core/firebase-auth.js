// =============================================
// Firebase Auth Guard — Clube do Natural
// =============================================
// Handles Google sign-in, user approval check, and page protection.
// Include this AFTER firebase-config.js on every protected page.

(function () {
  'use strict';

  window.CdnAuth = {
    currentUser: null,
    userData: null,
    _readyCallbacks: [],
    _resolved: false,

    // Call this on protected pages
    guard(options = {}) {
      const {
        requireApproval = true,  // user must be approved by admin
        requiredRole = null,     // specific role needed (e.g., 'dono', 'gerente')
        allowedRoles = null,     // array of allowed roles
        redirectTo = '/login.html',
        onReady = null
      } = options;

      if (!CdnFirebase.ready) {
        // Firebase not configured — redirect to setup
        if (!CdnFirebase.isConfigured()) {
          window.location.href = '/admin/setup.html';
          return;
        }
        // Try init again
        CdnFirebase.init();
        if (!CdnFirebase.ready) {
          window.location.href = '/admin/setup.html';
          return;
        }
      }

      // Show loading overlay
      this._showLoading();

      CdnFirebase.auth.onAuthStateChanged(async (user) => {
        if (!user) {
          // Not logged in → redirect to login
          const returnUrl = encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
          window.location.href = `${redirectTo}?r=${returnUrl}`;
          return;
        }

        this.currentUser = user;

        try {
          // Get or create user document in Firestore
          this.userData = await this._ensureUserDoc(user);

          // Check approval
          if (requireApproval && !this.userData.approved) {
            this._showPendingApproval(user);
            return;
          }

          // Check role
          if (requiredRole && this.userData.role !== requiredRole && this.userData.role !== 'dono') {
            this._showAccessDenied('Você não tem permissão para acessar esta página.');
            return;
          }

          if (allowedRoles && !allowedRoles.includes(this.userData.role) && this.userData.role !== 'dono') {
            this._showAccessDenied('Seu cargo não tem acesso a esta seção.');
            return;
          }

          // All good — hide loading, show page
          this._hideLoading();
          this._resolved = true;

          if (onReady) onReady(this.userData);
          this._readyCallbacks.forEach(cb => cb(this.userData));

        } catch (err) {
          console.error('[Auth] Error checking user:', err);
          this._showError('Erro ao verificar permissões. Tente recarregar.');
        }
      });
    },

    // Register callback for when auth is ready
    onReady(cb) {
      if (this._resolved && this.userData) {
        cb(this.userData);
      } else {
        this._readyCallbacks.push(cb);
      }
    },

    // Google sign-in — always try popup first (redirect breaks with 3rd-party cookie blocking)
    async signInWithGoogle() {
      if (!CdnFirebase.ready) throw new Error('Firebase não configurado');
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });

      try {
        // Popup works on both desktop and modern mobile browsers
        return await CdnFirebase.auth.signInWithPopup(provider);
      } catch (err) {
        // If popup is blocked (some mobile browsers), fall back to redirect
        if (err.code === 'auth/popup-blocked' || err.code === 'auth/cancelled-popup-request') {
          console.warn('[Auth] Popup blocked, falling back to redirect');
          return CdnFirebase.auth.signInWithRedirect(provider);
        }
        throw err;
      }
    },

    // Sign out
    async signOut() {
      if (CdnFirebase.auth) {
        await CdnFirebase.auth.signOut();
      }
      window.location.href = '/login.html';
    },

    // Ensure user document exists in Firestore
    async _ensureUserDoc(user) {
      const docRef = CdnFirebase.db.collection('users').doc(user.uid);
      const doc = await docRef.get();

      if (doc.exists) {
        // Update last login
        docRef.update({ lastLogin: firebase.firestore.FieldValue.serverTimestamp() }).catch(() => {});
        return doc.data();
      }

      // First time user — check meta/init to see if system was already initialized
      let isFirstUser = false;
      try {
        const initDoc = await CdnFirebase.db.collection('meta').doc('init').get();
        isFirstUser = !initDoc.exists;
      } catch (e) {
        // If meta/init read fails, assume system not initialized (first user)
        console.warn('[Auth] Cannot read meta/init, assuming first user:', e.code);
        isFirstUser = true;
      }

      const userData = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || '',
        photoURL: user.photoURL || '',
        role: isFirstUser ? 'dono' : 'pendente',
        approved: isFirstUser,  // First user auto-approved as owner
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastLogin: firebase.firestore.FieldValue.serverTimestamp()
      };

      await docRef.set(userData);

      if (isFirstUser) {
        // Mark system as initialized so next users become "pendente"
        try {
          await CdnFirebase.db.collection('meta').doc('init').set({
            dono: user.uid,
            email: user.email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        } catch (e) {
          console.warn('[Auth] Could not create meta/init:', e.code);
        }
        console.log('[Auth] First user — auto-approved as DONO (admin)');
      }

      return userData;
    },

    // === UI Helpers ===

    _showLoading() {
      if (document.getElementById('cdn-auth-overlay')) return;
      const overlay = document.createElement('div');
      overlay.id = 'cdn-auth-overlay';
      overlay.innerHTML = `
        <style>
          #cdn-auth-overlay {
            position: fixed; inset: 0; z-index: 99999;
            background: #F5F0E8; display: flex; align-items: center;
            justify-content: center; flex-direction: column; gap: 16px;
          }
          #cdn-auth-overlay .spinner {
            width: 40px; height: 40px; border: 4px solid #e0d5c0;
            border-top-color: #2D6A4F; border-radius: 50%;
            animation: cdnSpin 0.8s linear infinite;
          }
          @keyframes cdnSpin { to { transform: rotate(360deg); } }
          #cdn-auth-overlay p { color: #1B4332; font-family: system-ui, sans-serif; font-size: 15px; }
        </style>
        <div class="spinner"></div>
        <p>Verificando acesso...</p>
      `;
      const attach = () => { document.body.prepend(overlay); };
      if (document.body) { attach(); }
      else { document.addEventListener('DOMContentLoaded', attach); }
    },

    _hideLoading() {
      const el = document.getElementById('cdn-auth-overlay');
      if (el) el.remove();
    },

    _showPendingApproval(user) {
      const el = document.getElementById('cdn-auth-overlay');
      if (!el) return;
      el.innerHTML = `
        <style>
          #cdn-auth-overlay {
            position: fixed; inset: 0; z-index: 99999;
            background: #F5F0E8; display: flex; align-items: center;
            justify-content: center; flex-direction: column; gap: 20px;
            padding: 20px; text-align: center; font-family: system-ui, sans-serif;
          }
          #cdn-auth-overlay .icon { font-size: 64px; }
          #cdn-auth-overlay h2 { color: #1B4332; margin: 0; font-size: 22px; }
          #cdn-auth-overlay p { color: #555; font-size: 15px; max-width: 400px; margin: 0; line-height: 1.5; }
          #cdn-auth-overlay .user-info {
            display: flex; align-items: center; gap: 12px;
            background: white; padding: 12px 20px; border-radius: 12px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.08);
          }
          #cdn-auth-overlay .user-info img { width: 40px; height: 40px; border-radius: 50%; }
          #cdn-auth-overlay .user-info span { color: #333; font-size: 14px; }
          #cdn-auth-overlay .btn-logout {
            background: none; border: 1px solid #ccc; padding: 10px 24px;
            border-radius: 8px; cursor: pointer; color: #666; font-size: 14px;
            margin-top: 8px;
          }
          #cdn-auth-overlay .btn-logout:hover { background: #f5f5f5; }
        </style>
        <div class="icon">⏳</div>
        <h2>Aguardando Aprovação</h2>
        <p>Sua conta foi registrada com sucesso! O administrador precisa aprovar seu acesso antes de continuar.</p>
        <div class="user-info">
          ${user.photoURL ? `<img src="${user.photoURL}" alt="">` : ''}
          <span>${user.displayName || user.email}</span>
        </div>
        <p style="font-size:13px;color:#888;">Quando aprovado, recarregue esta página.</p>
        <button class="btn-logout" onclick="CdnAuth.signOut()">Sair e trocar conta</button>
      `;
    },

    _showAccessDenied(msg) {
      const el = document.getElementById('cdn-auth-overlay');
      if (!el) return;
      el.innerHTML = `
        <style>
          #cdn-auth-overlay {
            position: fixed; inset: 0; z-index: 99999;
            background: #F5F0E8; display: flex; align-items: center;
            justify-content: center; flex-direction: column; gap: 16px;
            padding: 20px; text-align: center; font-family: system-ui, sans-serif;
          }
          #cdn-auth-overlay .icon { font-size: 64px; }
          #cdn-auth-overlay h2 { color: #E63946; margin: 0; }
          #cdn-auth-overlay p { color: #555; font-size: 15px; max-width: 400px; }
          #cdn-auth-overlay .btn-back {
            background: #2D6A4F; color: white; border: none; padding: 12px 28px;
            border-radius: 8px; cursor: pointer; font-size: 15px;
          }
        </style>
        <div class="icon">🚫</div>
        <h2>Acesso Negado</h2>
        <p>${msg}</p>
        <button class="btn-back" onclick="history.back()">Voltar</button>
        <button style="background:none;border:1px solid #ccc;padding:10px 24px;border-radius:8px;cursor:pointer;color:#666;font-size:14px" onclick="CdnAuth.signOut()">Sair</button>
      `;
    },

    _showError(msg) {
      const el = document.getElementById('cdn-auth-overlay');
      if (!el) return;
      el.innerHTML = `
        <div style="text-align:center;font-family:system-ui;color:#E63946">
          <p style="font-size:48px">⚠️</p>
          <h2>${msg}</h2>
          <button onclick="location.reload()" style="background:#2D6A4F;color:white;border:none;padding:12px 28px;border-radius:8px;cursor:pointer;font-size:15px;margin-top:16px">Recarregar</button>
        </div>
      `;
    },

    // Get user display for nav bars
    getUserBadge() {
      if (!this.currentUser) return '';
      const photo = this.currentUser.photoURL
        ? `<img src="${this.currentUser.photoURL}" alt="" style="width:32px;height:32px;border-radius:50%;object-fit:cover">`
        : `<span style="width:32px;height:32px;border-radius:50%;background:#2D6A4F;color:white;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600">${(this.currentUser.displayName || 'U')[0].toUpperCase()}</span>`;
      return `
        <div class="cdn-user-badge" style="display:flex;align-items:center;gap:8px;cursor:pointer" onclick="document.getElementById('cdn-user-menu').classList.toggle('show')">
          ${photo}
          <span style="font-size:13px;color:#333;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${this.currentUser.displayName || this.currentUser.email}</span>
        </div>
        <div id="cdn-user-menu" style="display:none;position:absolute;right:0;top:100%;background:white;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.15);padding:8px;min-width:180px;z-index:999">
          <div style="padding:8px 12px;font-size:12px;color:#888;border-bottom:1px solid #eee;margin-bottom:4px">${this.currentUser.email}</div>
          ${this.userData?.role ? `<div style="padding:8px 12px;font-size:12px;color:#2D6A4F;font-weight:600">${this.userData.role.toUpperCase()}</div>` : ''}
          <button onclick="CdnAuth.signOut()" style="width:100%;text-align:left;background:none;border:none;padding:8px 12px;cursor:pointer;font-size:14px;color:#E63946;border-radius:4px">Sair</button>
        </div>
      `;
    }
  };

  // Close user menu on outside click
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('cdn-user-menu');
    if (menu && !e.target.closest('.cdn-user-badge') && !e.target.closest('#cdn-user-menu')) {
      menu.classList.remove('show');
    }
  });

  // Style for show class
  const style = document.createElement('style');
  style.textContent = '#cdn-user-menu.show { display: block !important; }';
  document.head.appendChild(style);
})();
