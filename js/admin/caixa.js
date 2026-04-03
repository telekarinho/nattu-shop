/* ============================================
   CLUBE DO NATURAL — Admin Caixa (Livro Caixa)
   Controle de caixa com suporte OFFLINE
   ============================================ */

const AdminCaixa = (() => {
  const container = () => document.getElementById('caixa-content');

  let currentStoreFilter = 'todas';
  let activeTab = 'hoje';

  const CATEGORIAS_SAIDA = [
    'Mercadoria', 'Aluguel', 'Energia', '\u00c1gua', 'Internet',
    'Sal\u00e1rios', 'Marketing', 'Manuten\u00e7\u00e3o', 'Impostos', 'Outro',
  ];

  const CATEGORIAS_ENTRADA = ['Venda', 'Recebimento', 'Outro'];

  /* ------------------------------------------
     HELPERS
  ------------------------------------------ */
  function getStoreId() {
    if (currentStoreFilter && currentStoreFilter !== 'todas') return currentStoreFilter;
    return DataStores.length > 0 ? DataStores[0].id : 'default';
  }

  function getStoreLabel(lojaId) {
    const store = DataStores.find(s => s.id === lojaId);
    return store ? store.nome.split(' - ')[1] || store.nome : lojaId;
  }

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function formatTime(isoStr) {
    const d = new Date(isoStr);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function getCaixaData() {
    return Storage.get('caixa') || {};
  }

  function setCaixaData(data) {
    Storage.set('caixa', data);
  }

  function getDayData(storeId, dateKey) {
    const data = getCaixaData();
    return (data[storeId] && data[storeId][dateKey]) || null;
  }

  function setDayData(storeId, dateKey, dayData) {
    const data = getCaixaData();
    if (!data[storeId]) data[storeId] = {};
    data[storeId][dateKey] = dayData;
    setCaixaData(data);

    // Persist to Firestore (non-blocking)
    if (typeof FirestoreService !== 'undefined') {
      try {
        FirestoreService.init();
        FirestoreService.Caixa.save(storeId, dayData).catch(e => {
          console.warn('[Caixa] Firestore save failed:', e.message);
        });
      } catch(e) { console.warn('[Caixa] Firestore save failed:', e.message); }
    }
  }

  function isCaixaAberto(storeId, dateKey) {
    const day = getDayData(storeId, dateKey);
    return day && day.abertura !== undefined && !day.fechamento;
  }

  function isCaixaFechado(storeId, dateKey) {
    const day = getDayData(storeId, dateKey);
    return day && day.fechamento;
  }

  function calcSaldo(day) {
    if (!day) return 0;
    const entradas = (day.entradas || []).reduce((s, e) => s + e.valor, 0);
    const saidas = (day.saidas || []).reduce((s, e) => s + e.valor, 0);
    return (day.abertura || 0) + entradas - saidas;
  }

  function calcTotalEntradas(day) {
    return (day && day.entradas || []).reduce((s, e) => s + e.valor, 0);
  }

  function calcTotalSaidas(day) {
    return (day && day.saidas || []).reduce((s, e) => s + e.valor, 0);
  }

  function queueSync(operation) {
    const queue = Storage.get('sync_queue_caixa') || [];
    queue.push({
      id: 'sync-' + Utils.generateId(),
      timestamp: new Date().toISOString(),
      operation,
      synced: false,
    });
    Storage.set('sync_queue_caixa', queue);
  }

  /* ------------------------------------------
     MODALS
  ------------------------------------------ */
  function createModal(title, bodyHTML, onConfirm) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10001;display:flex;align-items:center;justify-content:center;padding:16px;';

    const modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;border-radius:12px;max-width:480px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);';

    modal.innerHTML = `
      <div style="padding:16px 20px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;">
        <h3 style="margin:0;font-size:18px;color:#1B4332;">${title}</h3>
        <button class="modal-close" style="background:none;border:none;font-size:22px;cursor:pointer;color:#888;padding:4px 8px;">&#10005;</button>
      </div>
      <div style="padding:20px;" class="modal-body">${bodyHTML}</div>
      <div style="padding:12px 20px;border-top:1px solid #eee;display:flex;gap:8px;justify-content:flex-end;">
        <button class="modal-cancel" style="background:#f5f5f5;color:#555;border:1px solid #ddd;padding:8px 20px;border-radius:8px;cursor:pointer;font-size:14px;">Cancelar</button>
        <button class="modal-confirm" style="background:#2D6A4F;color:#fff;border:none;padding:8px 20px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;">Confirmar</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('.modal-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });

    modal.querySelector('.modal-confirm').addEventListener('click', () => {
      if (onConfirm(modal)) close();
    });

    return modal;
  }

  function showAbrirCaixaModal() {
    const storeId = getStoreId();
    const html = `
      <div style="margin-bottom:14px;">
        <label style="font-size:13px;color:#555;display:block;margin-bottom:4px;">Loja</label>
        <div style="font-weight:600;color:#1B4332;">${getStoreLabel(storeId)}</div>
      </div>
      <div style="margin-bottom:14px;">
        <label style="font-size:13px;color:#555;display:block;margin-bottom:4px;">Valor Inicial (troco)</label>
        <input type="number" class="input-abertura" min="0" step="0.01" value="200.00" style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;">
      </div>
    `;

    createModal('Abrir Caixa', html, (modal) => {
      const valor = parseFloat(modal.querySelector('.input-abertura').value) || 0;
      if (valor < 0) { Toast.error('Valor inv\u00e1lido'); return false; }
      const dateKey = todayKey();
      setDayData(storeId, dateKey, {
        abertura: valor,
        entradas: [],
        saidas: [],
        fechamento: null,
        dataAbertura: new Date().toISOString(),
      });
      queueSync({ tipo: 'abertura', storeId, dateKey, valor });
      Toast.success(`Caixa aberto com ${Utils.formatBRL(valor)}`);
      render(currentStoreFilter);
      return true;
    });
  }

  function showNovaEntradaModal() {
    const storeId = getStoreId();
    const html = `
      <div style="margin-bottom:14px;">
        <label style="font-size:13px;color:#555;display:block;margin-bottom:4px;">Tipo</label>
        <select class="input-tipo" style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;">
          ${CATEGORIAS_ENTRADA.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>
      <div style="margin-bottom:14px;">
        <label style="font-size:13px;color:#555;display:block;margin-bottom:4px;">Descri\u00e7\u00e3o</label>
        <input type="text" class="input-desc" placeholder="Ex: Venda #CDN202603180001" style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;">
      </div>
      <div style="margin-bottom:14px;">
        <label style="font-size:13px;color:#555;display:block;margin-bottom:4px;">Valor (R$)</label>
        <input type="number" class="input-valor" min="0.01" step="0.01" placeholder="0.00" style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;">
      </div>
      <div>
        <label style="font-size:13px;color:#555;display:block;margin-bottom:4px;">Vinculado a pedido? (opcional)</label>
        <input type="text" class="input-pedido" placeholder="N\u00famero do pedido" style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;">
      </div>
    `;

    createModal('Nova Entrada', html, (modal) => {
      const tipo = modal.querySelector('.input-tipo').value;
      const desc = modal.querySelector('.input-desc').value.trim();
      const valor = parseFloat(modal.querySelector('.input-valor').value) || 0;
      const pedido = modal.querySelector('.input-pedido').value.trim();

      if (!desc) { Toast.error('Informe uma descri\u00e7\u00e3o'); return false; }
      if (valor <= 0) { Toast.error('Valor deve ser maior que zero'); return false; }

      const dateKey = todayKey();
      const day = getDayData(storeId, dateKey);
      if (!day) { Toast.error('Caixa n\u00e3o est\u00e1 aberto'); return false; }

      day.entradas.push({
        id: 'ent-' + Utils.generateId(),
        timestamp: new Date().toISOString(),
        tipo,
        descricao: desc,
        valor,
        pedido: pedido || null,
      });

      setDayData(storeId, dateKey, day);
      queueSync({ tipo: 'entrada', storeId, dateKey, valor, desc });
      Toast.success(`Entrada de ${Utils.formatBRL(valor)} registrada`);
      render(currentStoreFilter);
      return true;
    });
  }

  function showNovaSaidaModal() {
    const storeId = getStoreId();
    const html = `
      <div style="margin-bottom:14px;">
        <label style="font-size:13px;color:#555;display:block;margin-bottom:4px;">Tipo</label>
        <select class="input-tipo" style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;">
          ${CATEGORIAS_SAIDA.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>
      <div style="margin-bottom:14px;">
        <label style="font-size:13px;color:#555;display:block;margin-bottom:4px;">Descri\u00e7\u00e3o</label>
        <input type="text" class="input-desc" placeholder="Ex: Compra de insumos" style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;">
      </div>
      <div>
        <label style="font-size:13px;color:#555;display:block;margin-bottom:4px;">Valor (R$)</label>
        <input type="number" class="input-valor" min="0.01" step="0.01" placeholder="0.00" style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;">
      </div>
    `;

    createModal('Nova Sa\u00edda', html, (modal) => {
      const tipo = modal.querySelector('.input-tipo').value;
      const desc = modal.querySelector('.input-desc').value.trim();
      const valor = parseFloat(modal.querySelector('.input-valor').value) || 0;

      if (!desc) { Toast.error('Informe uma descri\u00e7\u00e3o'); return false; }
      if (valor <= 0) { Toast.error('Valor deve ser maior que zero'); return false; }

      const dateKey = todayKey();
      const day = getDayData(storeId, dateKey);
      if (!day) { Toast.error('Caixa n\u00e3o est\u00e1 aberto'); return false; }

      day.saidas.push({
        id: 'sai-' + Utils.generateId(),
        timestamp: new Date().toISOString(),
        tipo,
        descricao: desc,
        valor,
      });

      setDayData(storeId, dateKey, day);
      queueSync({ tipo: 'saida', storeId, dateKey, valor, desc });
      Toast.success(`Sa\u00edda de ${Utils.formatBRL(valor)} registrada`);
      render(currentStoreFilter);
      return true;
    });
  }

  function showFecharCaixaModal() {
    const storeId = getStoreId();
    const dateKey = todayKey();
    const day = getDayData(storeId, dateKey);
    if (!day) return;

    const saldoEsperado = calcSaldo(day);

    const html = `
      <div style="margin-bottom:14px;">
        <label style="font-size:13px;color:#555;display:block;margin-bottom:4px;">Saldo Esperado (sistema)</label>
        <div style="font-weight:700;font-size:20px;color:#1B4332;">${Utils.formatBRL(saldoEsperado)}</div>
      </div>
      <div style="margin-bottom:14px;">
        <label style="font-size:13px;color:#555;display:block;margin-bottom:4px;">Valor Real em Caixa (contagem)</label>
        <input type="number" class="input-real" min="0" step="0.01" value="${saldoEsperado.toFixed(2)}" style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;">
      </div>
      <div class="diff-display" style="margin-bottom:14px;padding:10px;border-radius:8px;background:#f8f9fa;text-align:center;font-weight:600;"></div>
      <div>
        <label style="font-size:13px;color:#555;display:block;margin-bottom:4px;">Observa\u00e7\u00f5es</label>
        <textarea class="input-note" rows="2" style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;resize:vertical;"></textarea>
      </div>
    `;

    const modal = createModal('Fechar Caixa', html, (m) => {
      const valorReal = parseFloat(m.querySelector('.input-real').value) || 0;
      const note = m.querySelector('.input-note').value;
      const diff = valorReal - saldoEsperado;

      day.fechamento = {
        timestamp: new Date().toISOString(),
        valorEsperado: saldoEsperado,
        valorReal,
        diferenca: diff,
        nota: note,
        usuario: (AppState.get('user') || {}).nome || 'Admin',
      };

      setDayData(storeId, dateKey, day);
      queueSync({ tipo: 'fechamento', storeId, dateKey, valorReal, diff });
      Toast.success('Caixa fechado com sucesso!');
      render(currentStoreFilter);
      return true;
    });

    // Live difference calc
    const realInput = modal.querySelector('.input-real');
    const diffDisplay = modal.querySelector('.diff-display');
    const updateDiff = () => {
      const real = parseFloat(realInput.value) || 0;
      const diff = real - saldoEsperado;
      if (Math.abs(diff) < 0.01) {
        diffDisplay.textContent = 'Sem diferen\u00e7a (quebra)';
        diffDisplay.style.color = '#2E7D32';
      } else {
        diffDisplay.textContent = `Diferen\u00e7a (quebra): ${Utils.formatBRL(diff)}`;
        diffDisplay.style.color = diff > 0 ? '#1565C0' : '#C62828';
      }
    };
    realInput.addEventListener('input', updateDiff);
    updateDiff();
  }

  /* ------------------------------------------
     EXPORT CSV
  ------------------------------------------ */
  function exportCSV() {
    const storeId = getStoreId();
    const dateKey = todayKey();
    const day = getDayData(storeId, dateKey);
    if (!day) { Toast.error('Nenhum dado para exportar'); return; }

    const lines = ['Hora;Tipo;Categoria;Descricao;Valor'];

    (day.entradas || []).forEach(e => {
      lines.push(`${formatTime(e.timestamp)};Entrada;${e.tipo};${e.descricao};${e.valor.toFixed(2)}`);
    });
    (day.saidas || []).forEach(e => {
      lines.push(`${formatTime(e.timestamp)};Saida;${e.tipo};${e.descricao};-${e.valor.toFixed(2)}`);
    });

    const csv = lines.join('\n');

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(csv).then(() => Toast.success('CSV copiado!')).catch(() => fallbackCopy(csv));
    } else {
      fallbackCopy(csv);
    }
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    Toast.success('CSV copiado!');
  }

  /* ------------------------------------------
     WEEKLY / MONTHLY DATA
  ------------------------------------------ */
  function getWeekDates() {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
    return dates;
  }

  function getMonthDates() {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const dates = [];
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let i = 1; i <= daysInMonth; i++) {
      dates.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`);
    }
    return dates;
  }

  function formatDateLabel(dateKey) {
    const parts = dateKey.split('-');
    return `${parts[2]}/${parts[1]}`;
  }

  /* ------------------------------------------
     RENDER
  ------------------------------------------ */
  function loadFromFirestore(storeId) {
    if (typeof FirestoreService !== 'undefined') {
      try {
        FirestoreService.init();
        FirestoreService.Caixa.getForStore(storeId).then(sessions => {
          if (sessions && sessions.length > 0) {
            const allData = getCaixaData();
            if (!allData[storeId]) allData[storeId] = {};
            let merged = false;
            sessions.forEach(s => {
              const dateKey = s.id || (s.dataAbertura || '').slice(0, 10);
              if (dateKey && !allData[storeId][dateKey]) {
                allData[storeId][dateKey] = s;
                merged = true;
              }
            });
            if (merged) {
              setCaixaData(allData);
              render(currentStoreFilter); // re-render with merged data
            }
          }
        }).catch(() => {});
      } catch(e) {}
    }
  }

  let _firestoreLoaded = {};

  function render(storeFilter) {
    const el = container();
    if (!el) return;

    currentStoreFilter = storeFilter || 'todas';
    const storeId = getStoreId();

    // Load from Firestore once per store per session
    if (!_firestoreLoaded[storeId]) {
      _firestoreLoaded[storeId] = true;
      loadFromFirestore(storeId);
    }
    const dateKey = todayKey();
    const day = getDayData(storeId, dateKey);

    const caixaAberto = isCaixaAberto(storeId, dateKey);
    const caixaFechado = isCaixaFechado(storeId, dateKey);

    const saldoAtual = day ? calcSaldo(day) : 0;
    const totalEntradas = day ? calcTotalEntradas(day) : 0;
    const totalSaidas = day ? calcTotalSaidas(day) : 0;
    const diferenca = day && day.fechamento ? day.fechamento.diferenca : 0;

    el.innerHTML = `
      <style>
        .caixa-tabs { display:flex;gap:0;margin-bottom:20px;border-bottom:2px solid #eee; }
        .caixa-tab {
          padding:10px 20px;cursor:pointer;font-size:14px;font-weight:600;color:#888;
          border-bottom:2px solid transparent;margin-bottom:-2px;transition:all 0.2s;
        }
        .caixa-tab:hover { color:#2D6A4F; }
        .caixa-tab--active { color:#1B4332;border-bottom-color:#2D6A4F; }
        .caixa-kpis { display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px; }
        .caixa-kpi {
          background:#fff;border-radius:10px;padding:16px;text-align:center;
          box-shadow:0 1px 4px rgba(0,0,0,0.06);border-left:4px solid transparent;
        }
        .caixa-kpi__value { font-size:24px;font-weight:700; }
        .caixa-kpi__label { font-size:12px;color:#888;margin-top:4px; }
        .caixa-status-bar {
          display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:16px;
          padding:12px 16px;background:#fff;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,0.06);
        }
        .caixa-btn {
          padding:8px 16px;border-radius:8px;border:none;cursor:pointer;font-size:13px;font-weight:600;
          white-space:nowrap;
        }
        .caixa-btn--primary { background:#2D6A4F;color:#fff; }
        .caixa-btn--primary:hover { background:#1B4332; }
        .caixa-btn--danger { background:#C62828;color:#fff; }
        .caixa-btn--danger:hover { background:#9a1f1f; }
        .caixa-btn--outline { background:#fff;color:#2D6A4F;border:1px solid #2D6A4F; }
        .caixa-btn--outline:hover { background:#E8F5E9; }
        .caixa-btn--success { background:#2E7D32;color:#fff; }
        .caixa-btn--success:hover { background:#1B5E20; }
        .caixa-entry {
          display:flex;align-items:center;gap:12px;padding:10px 14px;
          border-bottom:1px solid #f0f0f0;font-size:13px;
        }
        .caixa-entry:hover { background:#f8fdf9; }
        .caixa-entry__time { color:#999;font-size:12px;min-width:50px; }
        .caixa-entry__desc { flex:1; }
        .caixa-entry__cat { color:#888;font-size:12px; }
        .caixa-entry__valor { font-weight:700;min-width:90px;text-align:right; }
        .caixa-entry__saldo { color:#888;font-size:12px;min-width:90px;text-align:right; }
        .caixa-summary-table {
          width:100%;border-collapse:collapse;font-size:13px;background:#fff;border-radius:10px;
          overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);
        }
        .caixa-summary-table th {
          text-align:left;padding:10px 12px;background:#f8f9fa;font-weight:600;color:#555;
          border-bottom:2px solid #eee;font-size:12px;text-transform:uppercase;
        }
        .caixa-summary-table td { padding:10px 12px;border-bottom:1px solid #f0f0f0; }
        .caixa-summary-table tr:last-child td { font-weight:700;background:#f8f9fa; }
        .caixa-chart { display:flex;align-items:flex-end;gap:4px;height:150px;padding:10px 0;margin-top:16px; }
        .caixa-chart__bar {
          flex:1;min-width:20px;border-radius:4px 4px 0 0;position:relative;transition:height 0.3s;
        }
        .caixa-chart__bar-label {
          position:absolute;bottom:-20px;left:50%;transform:translateX(-50%);font-size:9px;color:#888;
          white-space:nowrap;
        }
        @media (max-width:768px) {
          .caixa-kpis { grid-template-columns:repeat(2,1fr); }
        }
      </style>

      <!-- Status / Open-Close bar -->
      <div class="caixa-status-bar">
        ${!day ? `
          <span style="color:#888;">Caixa n\u00e3o aberto hoje</span>
          <button class="caixa-btn caixa-btn--primary btn-abrir-caixa">Abrir Caixa</button>
        ` : caixaFechado ? `
          <span style="color:#2E7D32;font-weight:600;">&#9679; Caixa Fechado</span>
          <span style="color:#888;font-size:13px;">Fechado em ${formatTime(day.fechamento.timestamp)} por ${day.fechamento.usuario || 'Admin'}</span>
        ` : `
          <span style="color:#2E7D32;font-weight:600;">&#9679; Caixa Aberto</span>
          <span style="color:#888;font-size:13px;">Abertura: ${Utils.formatBRL(day.abertura)} \u00e0s ${formatTime(day.dataAbertura)}</span>
          <div style="flex:1;"></div>
          <button class="caixa-btn caixa-btn--success btn-nova-entrada">+ Nova Entrada</button>
          <button class="caixa-btn caixa-btn--danger btn-nova-saida">+ Nova Sa\u00edda</button>
          <button class="caixa-btn caixa-btn--outline btn-fechar-caixa">Fechar Caixa</button>
        `}
        <button class="caixa-btn caixa-btn--outline btn-export-csv" style="margin-left:auto;">Exportar CSV</button>
      </div>

      <!-- KPIs -->
      <div class="caixa-kpis">
        <div class="caixa-kpi" style="border-left-color:#1B4332;">
          <div class="caixa-kpi__value" style="color:#1B4332;">${Utils.formatBRL(saldoAtual)}</div>
          <div class="caixa-kpi__label">Saldo Atual</div>
        </div>
        <div class="caixa-kpi" style="border-left-color:#2E7D32;">
          <div class="caixa-kpi__value" style="color:#2E7D32;">${Utils.formatBRL(totalEntradas)}</div>
          <div class="caixa-kpi__label">Total Entradas</div>
        </div>
        <div class="caixa-kpi" style="border-left-color:#C62828;">
          <div class="caixa-kpi__value" style="color:#C62828;">${Utils.formatBRL(totalSaidas)}</div>
          <div class="caixa-kpi__label">Total Sa\u00eddas</div>
        </div>
        <div class="caixa-kpi" style="border-left-color:${diferenca >= 0 ? '#1565C0' : '#C62828'};">
          <div class="caixa-kpi__value" style="color:${diferenca >= 0 ? '#1565C0' : '#C62828'};">${caixaFechado ? Utils.formatBRL(diferenca) : '--'}</div>
          <div class="caixa-kpi__label">Diferen\u00e7a (Quebra)</div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="caixa-tabs">
        <div class="caixa-tab ${activeTab === 'hoje' ? 'caixa-tab--active' : ''}" data-tab="hoje">Hoje</div>
        <div class="caixa-tab ${activeTab === 'semanal' ? 'caixa-tab--active' : ''}" data-tab="semanal">Resumo Semanal</div>
        <div class="caixa-tab ${activeTab === 'mensal' ? 'caixa-tab--active' : ''}" data-tab="mensal">Resumo Mensal</div>
      </div>

      <!-- Tab Content -->
      <div class="caixa-tab-content">
        ${activeTab === 'hoje' ? renderTodayTab(day) : ''}
        ${activeTab === 'semanal' ? renderWeeklyTab(storeId) : ''}
        ${activeTab === 'mensal' ? renderMonthlyTab(storeId) : ''}
      </div>

      <!-- Offline indicator -->
      <div style="text-align:center;margin-top:16px;font-size:12px;color:#888;">
        ${!navigator.onLine ? '<span style="color:#C62828;">&#9679; Offline</span> \u2014 Dados salvos localmente' : ''}
        ${(() => {
          const queue = Storage.get('sync_queue_caixa') || [];
          const pending = queue.filter(q => !q.synced).length;
          return pending > 0 ? `<span style="color:#F57F17;">&#9679; ${pending} opera\u00e7\u00e3o(oes) pendente(s) de sync</span>` : '';
        })()}
      </div>
    `;

    bindEvents(el);
  }

  /* ------------------------------------------
     TAB RENDERERS
  ------------------------------------------ */
  function renderTodayTab(day) {
    if (!day) {
      return '<div style="text-align:center;padding:40px;color:#999;">Abra o caixa para come\u00e7ar a registrar movimenta\u00e7\u00f5es.</div>';
    }

    // Merge entries and exits into a timeline
    const timeline = [];
    (day.entradas || []).forEach(e => timeline.push({ ...e, _tipo: 'entrada' }));
    (day.saidas || []).forEach(e => timeline.push({ ...e, _tipo: 'saida' }));
    timeline.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    let runningSaldo = day.abertura || 0;

    return `
      <div style="background:#fff;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,0.06);overflow:hidden;">
        <!-- Opening balance -->
        <div class="caixa-entry" style="background:#f8f9fa;">
          <span class="caixa-entry__time">${day.dataAbertura ? formatTime(day.dataAbertura) : '--:--'}</span>
          <span class="caixa-entry__desc" style="font-weight:600;">Abertura de Caixa</span>
          <span class="caixa-entry__cat">Troco</span>
          <span class="caixa-entry__valor" style="color:#1B4332;">${Utils.formatBRL(day.abertura)}</span>
          <span class="caixa-entry__saldo">${Utils.formatBRL(runningSaldo)}</span>
        </div>

        ${timeline.length === 0 ? '<div style="text-align:center;padding:24px;color:#999;">Nenhuma movimenta\u00e7\u00e3o registrada hoje</div>' :
          timeline.map(entry => {
            if (entry._tipo === 'entrada') runningSaldo += entry.valor;
            else runningSaldo -= entry.valor;
            return `
              <div class="caixa-entry">
                <span class="caixa-entry__time">${formatTime(entry.timestamp)}</span>
                <span class="caixa-entry__desc">${entry.descricao}${entry.pedido ? ` <span style="color:#888;font-size:11px;">(Pedido ${entry.pedido})</span>` : ''}</span>
                <span class="caixa-entry__cat">${entry.tipo}</span>
                <span class="caixa-entry__valor" style="color:${entry._tipo === 'entrada' ? '#2E7D32' : '#C62828'};">
                  ${entry._tipo === 'entrada' ? '+' : '-'}${Utils.formatBRL(entry.valor)}
                </span>
                <span class="caixa-entry__saldo">${Utils.formatBRL(runningSaldo)}</span>
              </div>
            `;
          }).join('')}

        ${day.fechamento ? `
          <div class="caixa-entry" style="background:#f8f9fa;border-top:2px solid #eee;">
            <span class="caixa-entry__time">${formatTime(day.fechamento.timestamp)}</span>
            <span class="caixa-entry__desc" style="font-weight:600;">Fechamento de Caixa</span>
            <span class="caixa-entry__cat">${day.fechamento.nota || ''}</span>
            <span class="caixa-entry__valor" style="color:#1B4332;font-weight:700;">${Utils.formatBRL(day.fechamento.valorReal)}</span>
            <span class="caixa-entry__saldo" style="color:${Math.abs(day.fechamento.diferenca) < 0.01 ? '#2E7D32' : '#C62828'};">
              Quebra: ${Utils.formatBRL(day.fechamento.diferenca)}
            </span>
          </div>
        ` : ''}
      </div>
    `;
  }

  function renderWeeklyTab(storeId) {
    const weekDates = getWeekDates();
    let weekEntradas = 0;
    let weekSaidas = 0;
    let weekSaldo = 0;

    const rowsHTML = weekDates.map(dateKey => {
      const day = getDayData(storeId, dateKey);
      const entradas = day ? calcTotalEntradas(day) : 0;
      const saidas = day ? calcTotalSaidas(day) : 0;
      const saldo = day ? calcSaldo(day) : 0;
      weekEntradas += entradas;
      weekSaidas += saidas;
      weekSaldo += saldo;

      return `
        <tr>
          <td>${formatDateLabel(dateKey)}</td>
          <td style="color:#2E7D32;">${Utils.formatBRL(entradas)}</td>
          <td style="color:#C62828;">${Utils.formatBRL(saidas)}</td>
          <td style="font-weight:600;">${day ? Utils.formatBRL(saldo) : '--'}</td>
        </tr>
      `;
    }).join('');

    return `
      <table class="caixa-summary-table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Entradas</th>
            <th>Sa\u00eddas</th>
            <th>Saldo</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHTML}
          <tr>
            <td>TOTAL SEMANAL</td>
            <td style="color:#2E7D32;">${Utils.formatBRL(weekEntradas)}</td>
            <td style="color:#C62828;">${Utils.formatBRL(weekSaidas)}</td>
            <td>${Utils.formatBRL(weekSaldo)}</td>
          </tr>
        </tbody>
      </table>
    `;
  }

  function renderMonthlyTab(storeId) {
    const monthDates = getMonthDates();

    // Group by week
    const weeks = [];
    let currentWeek = [];
    monthDates.forEach((dateKey, i) => {
      currentWeek.push(dateKey);
      const d = new Date(dateKey);
      if (d.getDay() === 0 || i === monthDates.length - 1) {
        weeks.push([...currentWeek]);
        currentWeek = [];
      }
    });

    let monthEntradas = 0;
    let monthSaidas = 0;
    let monthSaldo = 0;

    const weekRows = weeks.map((week, idx) => {
      let wEntradas = 0, wSaidas = 0, wSaldo = 0;
      week.forEach(dateKey => {
        const day = getDayData(storeId, dateKey);
        if (day) {
          wEntradas += calcTotalEntradas(day);
          wSaidas += calcTotalSaidas(day);
          wSaldo += calcSaldo(day);
        }
      });
      monthEntradas += wEntradas;
      monthSaidas += wSaidas;
      monthSaldo += wSaldo;

      return `
        <tr>
          <td>Semana ${idx + 1} (${formatDateLabel(week[0])} - ${formatDateLabel(week[week.length - 1])})</td>
          <td style="color:#2E7D32;">${Utils.formatBRL(wEntradas)}</td>
          <td style="color:#C62828;">${Utils.formatBRL(wSaidas)}</td>
          <td style="font-weight:600;">${Utils.formatBRL(wSaldo)}</td>
        </tr>
      `;
    }).join('');

    // Bar chart data
    const dailyBalances = monthDates.map(dateKey => {
      const day = getDayData(storeId, dateKey);
      return { date: dateKey, saldo: day ? calcSaldo(day) : 0 };
    });
    const maxBalance = Math.max(1, ...dailyBalances.map(d => Math.abs(d.saldo)));

    return `
      <table class="caixa-summary-table">
        <thead>
          <tr>
            <th>Per\u00edodo</th>
            <th>Entradas</th>
            <th>Sa\u00eddas</th>
            <th>Saldo</th>
          </tr>
        </thead>
        <tbody>
          ${weekRows}
          <tr>
            <td>TOTAL MENSAL</td>
            <td style="color:#2E7D32;">${Utils.formatBRL(monthEntradas)}</td>
            <td style="color:#C62828;">${Utils.formatBRL(monthSaidas)}</td>
            <td>${Utils.formatBRL(monthSaldo)}</td>
          </tr>
        </tbody>
      </table>

      <!-- Bar chart -->
      <div style="margin-top:20px;">
        <h4 style="margin:0 0 8px;font-size:14px;color:#1B4332;">Saldo Di\u00e1rio</h4>
        <div class="caixa-chart" style="border-bottom:1px solid #ddd;padding-bottom:24px;">
          ${dailyBalances.map(d => {
            const height = Math.max(2, (Math.abs(d.saldo) / maxBalance) * 120);
            const color = d.saldo >= 0 ? '#52B788' : '#E63946';
            return `
              <div class="caixa-chart__bar" style="height:${height}px;background:${color};" title="${formatDateLabel(d.date)}: ${Utils.formatBRL(d.saldo)}">
                <span class="caixa-chart__bar-label">${d.date.split('-')[2]}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  /* ------------------------------------------
     BIND EVENTS
  ------------------------------------------ */
  function bindEvents(el) {
    // Tabs
    el.querySelectorAll('.caixa-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        activeTab = tab.dataset.tab;
        render(currentStoreFilter);
      });
    });

    // Abrir Caixa
    const btnAbrir = el.querySelector('.btn-abrir-caixa');
    if (btnAbrir) btnAbrir.addEventListener('click', showAbrirCaixaModal);

    // Nova Entrada
    const btnEntrada = el.querySelector('.btn-nova-entrada');
    if (btnEntrada) btnEntrada.addEventListener('click', showNovaEntradaModal);

    // Nova Saida
    const btnSaida = el.querySelector('.btn-nova-saida');
    if (btnSaida) btnSaida.addEventListener('click', showNovaSaidaModal);

    // Fechar Caixa
    const btnFechar = el.querySelector('.btn-fechar-caixa');
    if (btnFechar) btnFechar.addEventListener('click', showFecharCaixaModal);

    // Export
    const btnExport = el.querySelector('.btn-export-csv');
    if (btnExport) btnExport.addEventListener('click', exportCSV);
  }

  /* ------------------------------------------
     PUBLIC API
  ------------------------------------------ */
  return {
    render,
  };
})();
