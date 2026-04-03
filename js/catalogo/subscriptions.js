/* ============================================
   CLUBE DO NATURAL — Subscription Manager
   Manage recurring orders (pause, cancel, change)
   ============================================ */

const Subscriptions = (() => {
  const FREQUENCIES = {
    'semanal': { label: 'Semanal', days: 7 },
    'quinzenal': { label: 'Quinzenal', days: 15 },
    'mensal': { label: 'Mensal', days: 30 },
    'bimestral': { label: 'Bimestral', days: 60 },
  };

  const API_BASE = '/api';

  function getAll() {
    // Try Firestore in background and merge into localStorage
    if (typeof FirestoreService !== 'undefined') {
      try {
        FirestoreService.init();
        FirestoreService.Subscriptions.getAll().then(fsSubs => {
          if (fsSubs && fsSubs.length > 0) {
            Storage.set('subscriptions', fsSubs);
            AppState.set('subscriptions', fsSubs);
          }
        }).catch(() => {});
      } catch(e) {}
    }
    // Return localStorage immediately
    return Storage.get('subscriptions') || [];
  }

  function save(subs) {
    Storage.set('subscriptions', subs);
    AppState.set('subscriptions', subs);
  }

  // Create subscriptions from checkout order
  function createFromOrder(subItems, customer) {
    const subs = getAll();

    subItems.forEach(item => {
      const freq = item.frequency || 'mensal';
      const freqDays = FREQUENCIES[freq] ? FREQUENCIES[freq].days : 30;
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + freqDays);

      const sub = {
        id: Utils.generateId(),
        productId: item.productId,
        nome: item.nome,
        peso: item.peso,
        preco: item.preco,
        precoOriginal: item.precoOriginal,
        quantidade: item.quantidade,
        frequency: freq,
        frequencyDays: freqDays,
        status: 'ativa', // ativa | pausada | cancelada
        createdAt: new Date().toISOString(),
        nextDelivery: nextDate.toISOString(),
        customer: {
          nome: customer.nome,
          email: customer.email,
          telefone: customer.telefone,
        },
        deliveryCount: 0,
        totalSaved: 0,
      };

      subs.push(sub);

      // Save to Firestore
      if (typeof FirestoreService !== 'undefined') {
        try {
          FirestoreService.init();
          FirestoreService.Subscriptions.save(sub).catch(e => console.warn('[Subscriptions] Firestore save failed:', e.message));
        } catch(e) { console.warn('[Subscriptions] Firestore save failed:', e.message); }
      }
    });

    save(subs);
    syncToAPI(subs);
  }

  // Pause a subscription
  function pause(id) {
    const subs = getAll();
    const sub = subs.find(s => s.id === id);
    if (sub && sub.status === 'ativa') {
      sub.status = 'pausada';
      sub.pausedAt = new Date().toISOString();
      save(subs);
      syncToAPI(subs);
      if (typeof FirestoreService !== 'undefined') {
        try { FirestoreService.init(); FirestoreService.Subscriptions.save(sub).catch(()=>{}); } catch(e) {}
      }
      Toast.info(`Assinatura de ${sub.nome} pausada`);
    }
    renderPanel();
  }

  // Resume a paused subscription
  function resume(id) {
    const subs = getAll();
    const sub = subs.find(s => s.id === id);
    if (sub && sub.status === 'pausada') {
      sub.status = 'ativa';
      delete sub.pausedAt;
      // Recalculate next delivery
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + sub.frequencyDays);
      sub.nextDelivery = nextDate.toISOString();
      save(subs);
      syncToAPI(subs);
      if (typeof FirestoreService !== 'undefined') {
        try { FirestoreService.init(); FirestoreService.Subscriptions.save(sub).catch(()=>{}); } catch(e) {}
      }
      Toast.success(`Assinatura de ${sub.nome} reativada`);
    }
    renderPanel();
  }

  // Cancel a subscription
  function cancel(id) {
    const subs = getAll();
    const sub = subs.find(s => s.id === id);
    if (sub) {
      sub.status = 'cancelada';
      sub.cancelledAt = new Date().toISOString();
      save(subs);
      syncToAPI(subs);
      if (typeof FirestoreService !== 'undefined') {
        try { FirestoreService.init(); FirestoreService.Subscriptions.save(sub).catch(()=>{}); } catch(e) {}
      }
      Toast.info(`Assinatura de ${sub.nome} cancelada`);
    }
    renderPanel();
  }

  // Change frequency
  function changeFrequency(id, newFreq) {
    const subs = getAll();
    const sub = subs.find(s => s.id === id);
    if (sub && FREQUENCIES[newFreq]) {
      sub.frequency = newFreq;
      sub.frequencyDays = FREQUENCIES[newFreq].days;
      // Recalculate next delivery
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + sub.frequencyDays);
      sub.nextDelivery = nextDate.toISOString();
      save(subs);
      syncToAPI(subs);
      if (typeof FirestoreService !== 'undefined') {
        try { FirestoreService.init(); FirestoreService.Subscriptions.save(sub).catch(()=>{}); } catch(e) {}
      }
      Toast.success(`Frequencia alterada para ${FREQUENCIES[newFreq].label}`);
    }
    renderPanel();
  }

  // Sync to backend
  async function syncToAPI(subs) {
    try {
      await fetch(`${API_BASE}/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptions: subs }),
      });
    } catch (e) {
      console.warn('Subscription sync failed (offline mode):', e.message);
    }
  }

  // Calculate next delivery date display
  function formatNextDelivery(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.ceil((date - now) / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return 'Hoje';
    if (diffDays === 1) return 'Amanha';
    if (diffDays <= 7) return `Em ${diffDays} dias`;
    return Utils.formatDate(dateStr);
  }

  // ======= PANEL RENDERING =======

  function renderPanel() {
    const container = document.getElementById('subscriptions-panel');
    if (!container) return;

    const subs = getAll();
    const activeSubs = subs.filter(s => s.status !== 'cancelada');

    if (activeSubs.length === 0) {
      container.innerHTML = `
        <div class="sub-panel__empty">
          <div style="font-size:2.5rem;margin-bottom:var(--space-3);">&#128230;</div>
          <p style="color:var(--cinza-600);font-size:var(--fs-sm);">Nenhuma assinatura ativa.</p>
          <p style="color:var(--cinza-500);font-size:var(--fs-xs);margin-top:var(--space-2);">
            Adicione produtos com recorrencia no catalogo para economizar!
          </p>
        </div>
      `;
      return;
    }

    container.innerHTML = activeSubs.map(sub => {
      const statusClass = sub.status === 'ativa' ? 'sub-status--ativa' : 'sub-status--pausada';
      const statusLabel = sub.status === 'ativa' ? 'Ativa' : 'Pausada';
      const savings = (sub.precoOriginal - sub.preco) * sub.quantidade;

      return `
        <div class="sub-card" data-id="${sub.id}">
          <div class="sub-card__header">
            <div class="sub-card__name">${sub.nome}</div>
            <span class="sub-card__status ${statusClass}">${statusLabel}</span>
          </div>
          <div class="sub-card__details">
            <div class="sub-card__detail">
              <span class="sub-card__detail-label">Quantidade</span>
              <span>${sub.quantidade}x ${sub.peso}</span>
            </div>
            <div class="sub-card__detail">
              <span class="sub-card__detail-label">Valor/entrega</span>
              <span>${Utils.formatBRL(sub.preco * sub.quantidade)}</span>
            </div>
            <div class="sub-card__detail">
              <span class="sub-card__detail-label">Economia/entrega</span>
              <span style="color:var(--verde-claro);font-weight:var(--fw-bold);">${Utils.formatBRL(savings)}</span>
            </div>
            ${sub.status === 'ativa' ? `
              <div class="sub-card__detail">
                <span class="sub-card__detail-label">Proxima entrega</span>
                <span style="font-weight:var(--fw-semibold);">${formatNextDelivery(sub.nextDelivery)}</span>
              </div>
            ` : ''}
            <div class="sub-card__detail">
              <span class="sub-card__detail-label">Frequencia</span>
              <select class="sub-card__freq-select" data-id="${sub.id}" ${sub.status !== 'ativa' ? 'disabled' : ''}>
                ${Object.entries(FREQUENCIES).map(([key, val]) =>
                  `<option value="${key}" ${sub.frequency === key ? 'selected' : ''}>${val.label}</option>`
                ).join('')}
              </select>
            </div>
          </div>
          <div class="sub-card__actions">
            ${sub.status === 'ativa' ? `
              <button class="btn btn-ghost btn-sm sub-action-btn" data-action="pause" data-id="${sub.id}">
                &#9208; Pausar
              </button>
            ` : `
              <button class="btn btn-primary btn-sm sub-action-btn" data-action="resume" data-id="${sub.id}">
                &#9654; Reativar
              </button>
            `}
            <button class="btn btn-ghost btn-sm sub-action-btn" data-action="cancel" data-id="${sub.id}"
              style="color:var(--vermelho);">
              &#10005; Cancelar
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Bind events
    container.querySelectorAll('.sub-action-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        if (action === 'pause') pause(id);
        else if (action === 'resume') resume(id);
        else if (action === 'cancel') {
          if (confirm('Tem certeza que deseja cancelar esta assinatura?')) cancel(id);
        }
      });
    });

    container.querySelectorAll('.sub-card__freq-select').forEach(sel => {
      sel.addEventListener('change', () => {
        changeFrequency(sel.dataset.id, sel.value);
      });
    });
  }

  // Toggle subscriptions panel
  function togglePanel() {
    const modal = document.getElementById('subscriptions-modal');
    const backdrop = document.getElementById('subscriptions-backdrop');
    if (!modal) return;

    const isOpen = modal.classList.contains('active');
    if (isOpen) {
      modal.classList.remove('active');
      if (backdrop) backdrop.classList.remove('active');
      document.body.style.overflow = '';
    } else {
      modal.classList.add('active');
      if (backdrop) backdrop.classList.add('active');
      document.body.style.overflow = 'hidden';
      renderPanel();
    }
  }

  function closePanel() {
    const modal = document.getElementById('subscriptions-modal');
    const backdrop = document.getElementById('subscriptions-backdrop');
    if (modal) modal.classList.remove('active');
    if (backdrop) backdrop.classList.remove('active');
    document.body.style.overflow = '';
  }

  function init() {
    const closeBtn = document.getElementById('sub-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', closePanel);

    const backdrop = document.getElementById('subscriptions-backdrop');
    if (backdrop) backdrop.addEventListener('click', closePanel);

    // Check for active subs count to show badge
    const subs = getAll().filter(s => s.status === 'ativa');
    const badge = document.getElementById('sub-badge');
    if (badge) {
      if (subs.length > 0) {
        badge.textContent = subs.length;
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    }
  }

  function getActiveCount() {
    return getAll().filter(s => s.status === 'ativa').length;
  }

  return {
    init,
    createFromOrder,
    pause,
    resume,
    cancel,
    changeFrequency,
    togglePanel,
    closePanel,
    renderPanel,
    getAll,
    getActiveCount,
  };
})();
