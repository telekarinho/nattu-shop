// =============================================
// Users Admin — Clube do Natural
// =============================================
// Manages user approval, roles, and fine-grained access control via Firebase.

(function () {
  'use strict';

  const ROLE_CONFIG = {
    dono: { label: 'Dono', color: '#C4972A', icon: '👑' },
    gerente: { label: 'Gerente', color: '#2D6A4F', icon: '🏪' },
    atendente: { label: 'Atendente', color: '#52B788', icon: '🛒' },
    caixa: { label: 'Caixa', color: '#40916C', icon: '💰' },
    estoquista: { label: 'Estoquista', color: '#6B705C', icon: '📦' },
    motoboy: { label: 'Motoboy', color: '#3A86FF', icon: '🏍️' },
    pendente: { label: 'Pendente', color: '#E63946', icon: '⏳' }
  };

  const MODULES = [
    { key: 'dashboard', label: 'Dashboard', group: 'Principal' },
    { key: 'pedidos', label: 'Pedidos', group: 'Operação' },
    { key: 'assinaturas', label: 'Assinaturas', group: 'Operação' },
    { key: 'estoque', label: 'Estoque', group: 'Operação' },
    { key: 'caixa', label: 'Caixa', group: 'Operação' },
    { key: 'financeiro', label: 'Financeiro', group: 'Gestão' },
    { key: 'nf', label: 'Notas fiscais', group: 'Gestão' },
    { key: 'restock', label: 'Pedido de compra', group: 'Operação' },
    { key: 'produtos', label: 'Produtos', group: 'Gestão' },
    { key: 'lojas', label: 'Lojas', group: 'Gestão' },
    { key: 'funcionarios', label: 'Funcionários', group: 'Gestão' },
    { key: 'clientes', label: 'Clientes', group: 'Relacionamento' },
    { key: 'relatorios', label: 'Relatórios', group: 'Gestão' },
    { key: 'config', label: 'Configurações', group: 'Sistema' },
    { key: 'usuarios', label: 'Usuários', group: 'Sistema' },
    { key: 'metas', label: 'Metas & Pontos', group: 'Performance' },
    { key: 'afiliados', label: 'Afiliados', group: 'Performance' }
  ];

  const ROLE_PRESETS = {
    dono: MODULES.map(item => item.key),
    gerente: ['dashboard', 'pedidos', 'assinaturas', 'estoque', 'caixa', 'financeiro', 'nf', 'restock', 'metas', 'afiliados', 'produtos', 'clientes', 'relatorios'],
    atendente: ['pedidos', 'assinaturas', 'metas', 'afiliados'],
    caixa: ['pedidos', 'caixa', 'financeiro', 'nf', 'metas'],
    estoquista: ['estoque', 'restock', 'produtos', 'metas'],
    motoboy: ['pedidos'],
    pendente: []
  };

  function uniqPermissions(list) {
    return [...new Set((Array.isArray(list) ? list : []).filter(Boolean))];
  }

  function getRoleMeta(role) {
    return ROLE_CONFIG[role] || ROLE_CONFIG.pendente;
  }

  function getPresetPermissions(role) {
    return uniqPermissions(ROLE_PRESETS[role] || []);
  }

  function getUserPermissions(user) {
    return uniqPermissions(user.permissions && user.permissions.length ? user.permissions : getPresetPermissions(user.role));
  }

  function formatDate(value, withTime) {
    if (!value) return 'N/A';
    const date = value.toDate ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return withTime ? date.toLocaleString('pt-BR') : date.toLocaleDateString('pt-BR');
  }

  function initials(user) {
    const source = user.displayName || user.email || '?';
    return source[0].toUpperCase();
  }

  function groupModules() {
    const grouped = {};
    MODULES.forEach(module => {
      if (!grouped[module.group]) grouped[module.group] = [];
      grouped[module.group].push(module);
    });
    return grouped;
  }

  function getStores() {
    return Array.isArray(window.DataStores) ? window.DataStores : [];
  }

  function getStoreName(storeId) {
    if (!storeId) return 'Rede inteira';
    const store = getStores().find(item => item.id === storeId);
    return store ? (store.nome.split(' - ')[1] || store.nome) : storeId;
  }

  function getStoreScopeLabel(user) {
    if (!user.storeId) {
      return user.role === 'dono' ? 'Acesso em toda a rede' : 'Sem loja vinculada';
    }
    return `Loja: ${getStoreName(user.storeId)}`;
  }

  function storeSelectHtml(user, attrName, includeNetworkOption) {
    const role = user.role || 'atendente';
    const selectedStore = user.storeId || '';
    const stores = getStores();
    const allowNetwork = includeNetworkOption && role === 'dono';
    return `
      <select class="user-card__role-select" ${attrName}="${user.uid}">
        ${allowNetwork ? `<option value="">🌐 Rede inteira</option>` : '<option value="">Selecione a loja</option>'}
        ${stores.map(store => `<option value="${store.id}" ${selectedStore === store.id ? 'selected' : ''}>🏪 ${store.nome.split(' - ')[1] || store.nome}</option>`).join('')}
      </select>
    `;
  }

  window.UsersAdmin = {
    users: [],
    loaded: false,

    async init() {
      if (!CdnFirebase.ready) return;
      if (CdnAuth.userData?.role !== 'dono') {
        document.getElementById('usuarios-content').innerHTML =
          '<p style="color:#E63946;padding:20px">Apenas o Dono pode gerenciar usuários.</p>';
        return;
      }
      await this.refresh();
    },

    async refresh() {
      if (!CdnFirebase.ready) return;

      try {
        const snapshot = await CdnFirebase.db.collection('users')
          .orderBy('createdAt', 'desc')
          .get();

        this.users = [];
        snapshot.forEach(doc => {
          this.users.push({ id: doc.id, ...doc.data() });
        });

        this.render();
        this.updateBadge();
        this.loaded = true;
      } catch (err) {
        console.error('[UsersAdmin] Error loading users:', err);
        document.getElementById('approved-users-list').innerHTML =
          `<p style="color:#E63946">Erro ao carregar usuários: ${err.message}</p>`;
      }
    },

    render() {
      const pending = this.users.filter(u => !u.approved);
      const approved = this.users.filter(u => u.approved);

      const pendingSection = document.getElementById('pending-users-section');
      const pendingList = document.getElementById('pending-users-list');
      const approvedList = document.getElementById('approved-users-list');

      if (pending.length > 0) {
        pendingSection.style.display = 'block';
        pendingList.innerHTML = pending.map(u => this.renderUserCard(u, true)).join('');
      } else {
        pendingSection.style.display = 'none';
      }

      approvedList.innerHTML = approved.length
        ? approved.map(u => this.renderUserCard(u, false)).join('')
        : '<p style="color:#888;padding:20px">Nenhum usuário aprovado ainda.</p>';

      this.bindCardEvents();
    },

    renderUserCard(user, isPending) {
      const role = getRoleMeta(user.role);
      const createdAt = formatDate(user.createdAt, false);
      const lastLogin = formatDate(user.lastLogin, true);
      const isCurrentUser = user.uid === CdnAuth.currentUser?.uid;
      const permissions = getUserPermissions(user);
      const presetPermissions = getPresetPermissions(user.role);
      const groupedModules = groupModules();
      const summary = permissions.length
        ? permissions.map(key => MODULES.find(item => item.key === key)?.label || key).slice(0, 4).join(', ')
        : 'Sem acesso liberado';
      const storeScope = getStoreScopeLabel(user);

      return `
        <div class="user-card ${isPending ? 'user-card--pending' : ''}" data-uid="${user.uid}">
          <div class="user-card__header">
            ${user.photoURL
              ? `<img src="${user.photoURL}" alt="" class="user-card__avatar">`
              : `<div class="user-card__avatar user-card__avatar--placeholder">${initials(user)}</div>`
            }
            <div class="user-card__info">
              <strong class="user-card__name">${user.displayName || 'Sem nome'} ${isCurrentUser ? '<span style="font-size:11px;color:#888">(você)</span>' : ''}</strong>
              <span class="user-card__email">${user.email}</span>
            </div>
          </div>

          <div class="user-card__meta">
            <span class="user-card__role" style="background:${role.color}15;color:${role.color};border:1px solid ${role.color}30">
              ${role.icon} ${role.label}
            </span>
            <span class="user-card__date">${storeScope}</span>
            <span class="user-card__date">Criado: ${createdAt}</span>
            <span class="user-card__date">Último acesso: ${lastLogin}</span>
          </div>

          ${isPending ? `
            <div class="user-card__actions">
              <label style="display:block;width:100%;font-size:12px;font-weight:700;color:#475569;">Cargo inicial</label>
              <select class="user-card__role-select" data-role-select="${user.uid}">
                ${Object.entries(ROLE_CONFIG).filter(([key]) => key !== 'pendente').map(([key, value]) =>
                  `<option value="${key}" ${key === 'atendente' ? 'selected' : ''}>${value.icon} ${value.label}</option>`
                ).join('')}
              </select>
              <label style="display:block;width:100%;font-size:12px;font-weight:700;color:#475569;">Loja / franquia</label>
              ${storeSelectHtml({ ...user, role: 'atendente' }, 'data-store-select', false)}
              <button class="btn btn--sm btn--primary" data-approve-user="${user.uid}">✅ Aprovar</button>
              <button class="btn btn--sm btn--danger" data-reject-user="${user.uid}">❌ Rejeitar</button>
            </div>
          ` : `
            <div style="padding:12px 14px;border:1px solid #E5E7EB;border-radius:12px;background:#FAFAFA;margin-bottom:12px;">
              <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;">
                <div>
                  <div style="font-size:12px;color:#64748B;text-transform:uppercase;font-weight:700;">Perfil de acesso</div>
                  <div style="font-size:13px;color:#334155;margin-top:4px;">${summary}</div>
                </div>
                <span style="font-size:12px;color:${permissions.length === presetPermissions.length && permissions.every(p => presetPermissions.includes(p)) ? '#166534' : '#9A3412'};font-weight:700;">
                  ${permissions.length === presetPermissions.length && permissions.every(p => presetPermissions.includes(p)) ? 'Preset do cargo' : 'Personalizado'}
                </span>
              </div>
            </div>

            <div class="user-card__actions" style="margin-bottom:12px;">
              <select class="user-card__role-select" data-change-role="${user.uid}" ${isCurrentUser ? 'disabled' : ''}>
                ${Object.entries(ROLE_CONFIG).filter(([key]) => key !== 'pendente').map(([key, value]) =>
                  `<option value="${key}" ${user.role === key ? 'selected' : ''}>${value.icon} ${value.label}</option>`
                ).join('')}
              </select>
              ${storeSelectHtml(user, 'data-change-store', user.role === 'dono')}
              <button class="btn btn--sm btn--ghost" data-apply-preset="${user.uid}" ${isCurrentUser ? 'disabled' : ''}>Aplicar padrão do cargo</button>
              ${!isCurrentUser ? `<button class="btn btn--sm btn--danger-ghost" data-revoke-user="${user.uid}">Revogar</button>` : ''}
            </div>

            <details class="user-card__permissions">
              <summary style="cursor:pointer;font-weight:700;color:#1B4332;">Controlar o que esta pessoa pode acessar</summary>
              <div style="margin-top:12px;display:grid;gap:12px;">
                ${Object.entries(groupedModules).map(([group, items]) => `
                  <div style="border:1px solid #E5E7EB;border-radius:12px;padding:12px;">
                    <div style="font-size:12px;text-transform:uppercase;font-weight:800;color:#64748B;margin-bottom:8px;">${group}</div>
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;">
                      ${items.map(module => `
                        <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:#334155;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:8px 10px;">
                          <input type="checkbox" data-permission-toggle="${user.uid}" value="${module.key}" ${permissions.includes(module.key) ? 'checked' : ''} ${isCurrentUser && module.key === 'usuarios' ? 'disabled' : ''}>
                          <span>${module.label}</span>
                        </label>
                      `).join('')}
                    </div>
                  </div>
                `).join('')}
              </div>
            </details>
          `}
        </div>
      `;
    },

    bindCardEvents() {
      document.querySelectorAll('[data-approve-user]').forEach(button => {
        button.addEventListener('click', () => this.approveUser(button.dataset.approveUser));
      });
      document.querySelectorAll('[data-reject-user]').forEach(button => {
        button.addEventListener('click', () => this.rejectUser(button.dataset.rejectUser));
      });
      document.querySelectorAll('[data-change-role]').forEach(select => {
        select.addEventListener('change', () => this.changeRole(select.dataset.changeRole, select.value));
      });
      document.querySelectorAll('[data-change-store]').forEach(select => {
        select.addEventListener('change', () => this.changeStore(select.dataset.changeStore, select.value));
      });
      document.querySelectorAll('[data-apply-preset]').forEach(button => {
        button.addEventListener('click', () => this.applyRolePreset(button.dataset.applyPreset));
      });
      document.querySelectorAll('[data-revoke-user]').forEach(button => {
        button.addEventListener('click', () => this.revokeUser(button.dataset.revokeUser));
      });
      document.querySelectorAll('[data-permission-toggle]').forEach(input => {
        input.addEventListener('change', () => this.savePermissionSelection(input.dataset.permissionToggle));
      });
    },

    async approveUser(uid) {
      const roleSelect = document.querySelector(`[data-role-select="${uid}"]`);
      const storeSelect = document.querySelector(`[data-store-select="${uid}"]`);
      const role = roleSelect ? roleSelect.value : 'atendente';
      const permissions = getPresetPermissions(role);
      const storeId = storeSelect ? storeSelect.value : '';

      if (role !== 'dono' && !storeId) {
        this.toast('Selecione a loja ou franquia desse usuário antes de aprovar.', 'error');
        return;
      }

      if (!confirm(`Aprovar este usuário como ${getRoleMeta(role).label}?`)) return;
      try {
        await CdnFirebase.db.collection('users').doc(uid).update({
          approved: true,
          role,
          permissions,
          storeId: role === 'dono' ? (storeId || null) : storeId,
          approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
          approvedBy: CdnAuth.currentUser.uid
        });
        this.toast(`Usuário aprovado como ${getRoleMeta(role).label}`);
        await this.refresh();
      } catch (err) {
        this.toast('Erro: ' + err.message, 'error');
      }
    },

    async rejectUser(uid) {
      if (!confirm('Rejeitar e remover este usuário? Ele poderá solicitar acesso novamente.')) return;
      try {
        await CdnFirebase.db.collection('users').doc(uid).delete();
        this.toast('Usuário rejeitado.');
        await this.refresh();
      } catch (err) {
        this.toast('Erro: ' + err.message, 'error');
      }
    },

    async changeRole(uid, newRole) {
      const user = this.users.find(item => item.uid === uid);
      if (!user) return;
      if (user.uid === CdnAuth.currentUser?.uid && newRole !== user.role) {
        this.toast('Não altere o próprio cargo por aqui.', 'error');
        this.render();
        return;
      }
      const storeSelect = document.querySelector(`[data-change-store="${uid}"]`);
      const selectedStoreId = storeSelect ? storeSelect.value : (user.storeId || '');
      if (newRole !== 'dono' && !selectedStoreId) {
        this.toast('Defina uma loja para esse usuário antes de trocar o cargo.', 'error');
        this.render();
        return;
      }

      try {
        await CdnFirebase.db.collection('users').doc(uid).update({
          role: newRole,
          storeId: newRole === 'dono' ? (selectedStoreId || null) : selectedStoreId
        });
        user.role = newRole;
        user.storeId = newRole === 'dono' ? (selectedStoreId || null) : selectedStoreId;
        this.toast(`Cargo alterado para ${getRoleMeta(newRole).label}`);
        await this.refresh();
      } catch (err) {
        this.toast('Erro: ' + err.message, 'error');
        this.render();
      }
    },

    async changeStore(uid, storeId) {
      const user = this.users.find(item => item.uid === uid);
      if (!user) return;
      if (user.uid === CdnAuth.currentUser?.uid && !storeId && user.role !== 'dono') {
        this.toast('Seu próprio acesso não pode ficar sem loja vinculada.', 'error');
        await this.refresh();
        return;
      }
      if (user.role !== 'dono' && !storeId) {
        this.toast('Perfis operacionais precisam ter uma loja definida.', 'error');
        await this.refresh();
        return;
      }

      try {
        await CdnFirebase.db.collection('users').doc(uid).update({
          storeId: storeId || null
        });
        this.toast(storeId ? `Loja vinculada: ${getStoreName(storeId)}` : 'Usuário liberado para rede inteira');
        await this.refresh();
      } catch (err) {
        this.toast('Erro: ' + err.message, 'error');
      }
    },

    async applyRolePreset(uid) {
      const user = this.users.find(item => item.uid === uid);
      if (!user) return;
      const permissions = getPresetPermissions(user.role);
      try {
        await CdnFirebase.db.collection('users').doc(uid).update({ permissions });
        this.toast(`Acesso padrão de ${getRoleMeta(user.role).label} aplicado.`);
        await this.refresh();
      } catch (err) {
        this.toast('Erro: ' + err.message, 'error');
      }
    },

    async savePermissionSelection(uid) {
      const inputs = Array.from(document.querySelectorAll(`[data-permission-toggle="${uid}"]`));
      const permissions = uniqPermissions(inputs.filter(input => input.checked).map(input => input.value));
      const user = this.users.find(item => item.uid === uid);
      if (!user) return;
      if (user.uid === CdnAuth.currentUser?.uid && !permissions.includes('usuarios')) {
        this.toast('Seu próprio acesso a usuários não pode ser removido aqui.', 'error');
        await this.refresh();
        return;
      }

      try {
        await CdnFirebase.db.collection('users').doc(uid).update({ permissions });
        this.toast('Permissões atualizadas.');
        const target = this.users.find(item => item.uid === uid);
        if (target) target.permissions = permissions;
        await this.refresh();
      } catch (err) {
        this.toast('Erro: ' + err.message, 'error');
      }
    },

    async revokeUser(uid) {
      if (!confirm('Revogar acesso deste usuário? Ele voltará para pendente.')) return;
      try {
        await CdnFirebase.db.collection('users').doc(uid).update({
          approved: false,
          role: 'pendente',
          permissions: []
        });
        this.toast('Acesso revogado.');
        await this.refresh();
      } catch (err) {
        this.toast('Erro: ' + err.message, 'error');
      }
    },

    updateBadge() {
      const pending = this.users.filter(u => !u.approved).length;
      const badge = document.getElementById('badge-pending-users');
      if (badge) {
        badge.textContent = pending;
        badge.style.display = pending > 0 ? 'inline' : 'none';
      }
    },

    toast(msg, type = 'success') {
      if (typeof Toast !== 'undefined' && Toast.show) {
        Toast.show(msg, type);
      } else {
        alert(msg);
      }
    }
  };

  window.CdnPermissionPresets = ROLE_PRESETS;
})();
