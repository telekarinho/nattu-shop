/* ============================================
   CLUBE DO NATURAL — Admin Assinaturas
   Gestão de assinaturas recorrentes
   ============================================ */

const AdminAssinaturas = (() => {
  const container = () => document.getElementById('assinaturas-content');

  const STATUS_BADGES = {
    ativa:     { label: 'Ativa',     bg: '#E8F5E9', color: '#2E7D32' },
    pausada:   { label: 'Pausada',   bg: '#FFF8E1', color: '#F9A825' },
    cancelada: { label: 'Cancelada', bg: '#FFEBEE', color: '#C62828' },
    pendente:  { label: 'Pendente',  bg: '#E3F2FD', color: '#1565C0' },
  };

  let currentStoreFilter = 'todas';
  let searchTerm = '';
  let statusFilter = '';
  let dateFrom = '';
  let dateTo = '';

  /* ------------------------------------------
     INIT
  ------------------------------------------ */
  function init() {
    // Nothing extra needed
  }

  /* ------------------------------------------
     DATA HELPERS
  ------------------------------------------ */
  function getSubscriptions() {
    let subs = Storage.get('subscriptions') || [];

    if (currentStoreFilter && currentStoreFilter !== 'todas') {
      subs = subs.filter(s => s.loja === currentStoreFilter);
    }

    if (statusFilter) {
      subs = subs.filter(s => s.status === statusFilter);
    }

    if (dateFrom) {
      const from = new Date(dateFrom + 'T00:00:00');
      subs = subs.filter(s => new Date(s.dataInicio) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo + 'T23:59:59');
      subs = subs.filter(s => new Date(s.dataInicio) <= to);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      subs = subs.filter(s =>
        s.cliente.nome.toLowerCase().includes(term) ||
        s.produto.nome.toLowerCase().includes(term) ||
        s.id.toLowerCase().includes(term)
      );
    }

    return subs;
  }

  function getAllSubscriptions() {
    let subs = Storage.get('subscriptions') || [];
    if (currentStoreFilter && currentStoreFilter !== 'todas') {
      subs = subs.filter(s => s.loja === currentStoreFilter);
    }
    return subs;
  }

  function calcKPIs() {
    const allSubs = getAllSubscriptions();
    const activeSubs = allSubs.filter(s => s.status === 'ativa');

    // Total ativas
    const totalAtivas = activeSubs.length;

    // MRR
    const mrr = activeSubs.reduce((sum, s) => {
      const monthlyMultiplier = 30 / s.frequenciaDias;
      return sum + s.precoFinal * monthlyMultiplier;
    }, 0);

    // Churn (cancelled in last 30 days / total)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const cancelledRecent = allSubs.filter(s =>
      s.status === 'cancelada' && s.dataCancelamento && new Date(s.dataCancelamento) >= thirtyDaysAgo
    ).length;
    const totalForChurn = allSubs.filter(s => s.status !== 'pendente').length;
    const churn = totalForChurn > 0 ? (cancelledRecent / totalForChurn * 100) : 0;

    // Ticket medio recorrente
    const ticketMedio = activeSubs.length > 0
      ? activeSubs.reduce((s, sub) => s + sub.precoFinal, 0) / activeSubs.length
      : 0;

    return { totalAtivas, mrr, churn, ticketMedio };
  }

  function getFrequencyLabel(dias) {
    if (dias === 7) return 'Semanal';
    if (dias === 15) return 'Quinzenal';
    if (dias === 30) return 'Mensal';
    if (dias === 45) return 'A cada 45 dias';
    if (dias === 60) return 'Bimestral';
    if (dias === 90) return 'Trimestral';
    return `A cada ${dias} dias`;
  }

  function getStoreLabel(lojaId) {
    const store = DataStores.find(s => s.id === lojaId);
    return store ? store.nome.split(' - ')[1] || store.nome : lojaId;
  }

  /* ------------------------------------------
     ACTIONS
  ------------------------------------------ */
  async function pauseSubscription(subId) {
    const subs = Storage.get('subscriptions') || [];
    const sub = subs.find(s => s.id === subId);
    if (!sub) return;
    sub.status = 'pausada';
    Storage.set('subscriptions', subs);
    if (typeof FirestoreService !== 'undefined') {
      try { await FirestoreService.Subscriptions.update(subId, { status: 'pausada' }); } catch(e) { console.warn('[Assinaturas] Firestore pause failed:', e.message); }
    }
    Toast.success(`Assinatura de ${sub.produto.nome} pausada.`);
    render(currentStoreFilter);
  }

  async function resumeSubscription(subId) {
    const subs = Storage.get('subscriptions') || [];
    const sub = subs.find(s => s.id === subId);
    if (!sub) return;
    sub.status = 'ativa';
    // Recalculate next delivery
    const next = new Date();
    next.setDate(next.getDate() + sub.frequenciaDias);
    sub.proximaEntrega = next.toISOString();
    Storage.set('subscriptions', subs);
    if (typeof FirestoreService !== 'undefined') {
      try { await FirestoreService.Subscriptions.update(subId, { status: 'ativa', proximaEntrega: sub.proximaEntrega }); } catch(e) { console.warn('[Assinaturas] Firestore resume failed:', e.message); }
    }
    Toast.success(`Assinatura de ${sub.produto.nome} retomada.`);
    render(currentStoreFilter);
  }

  async function cancelSubscription(subId) {
    const subs = Storage.get('subscriptions') || [];
    const sub = subs.find(s => s.id === subId);
    if (!sub) return;

    if (!confirm(`Cancelar assinatura de ${sub.produto.nome} para ${sub.cliente.nome}?`)) return;

    sub.status = 'cancelada';
    sub.dataCancelamento = new Date().toISOString();
    Storage.set('subscriptions', subs);
    if (typeof FirestoreService !== 'undefined') {
      try { await FirestoreService.Subscriptions.update(subId, { status: 'cancelada', dataCancelamento: sub.dataCancelamento }); } catch(e) { console.warn('[Assinaturas] Firestore cancel failed:', e.message); }
    }
    Toast.success(`Assinatura cancelada.`);
    render(currentStoreFilter);
  }

  function remindCustomer(subId) {
    const subs = Storage.get('subscriptions') || [];
    const sub = subs.find(s => s.id === subId);
    if (!sub) return;

    const phone = sub.cliente.celular.replace(/\D/g, '');
    const dataEntrega = Utils.formatDate(sub.proximaEntrega);
    const msg = `Olá ${sub.cliente.nome.split(' ')[0]}! 🌿\n\n` +
      `Passando para lembrar que sua assinatura de *${sub.produto.nome}* (${sub.produto.peso}) ` +
      `tem entrega prevista para *${dataEntrega}*.\n\n` +
      `Valor: *${Utils.formatBRL(sub.precoFinal)}* (${sub.desconto}% de desconto)\n\n` +
      `Precisa alterar algo? Estamos à disposição! 😊\n\n` +
      `Nattu Shop 🌿`;
    window.open(Utils.whatsappLink(phone, msg), '_blank');
  }

  /* ------------------------------------------
     SUBSCRIPTION DETAIL MODAL
  ------------------------------------------ */
  function showDetailModal(subId) {
    const subs = Storage.get('subscriptions') || [];
    const sub = subs.find(s => s.id === subId);
    if (!sub) return;

    const badge = STATUS_BADGES[sub.status] || STATUS_BADGES.pendente;
    const historico = sub.historico || [];

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;';

    const modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;border-radius:12px;max-width:560px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);';

    modal.innerHTML = `
      <div style="padding:20px 24px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <h2 style="margin:0;font-size:18px;color:#1B4332;">Detalhes da Assinatura</h2>
          <span style="font-size:12px;color:#888;">${sub.id}</span>
        </div>
        <button class="modal-close-btn" style="background:none;border:none;font-size:24px;cursor:pointer;color:#888;padding:4px 8px;">✕</button>
      </div>

      <div style="padding:20px 24px;">
        <!-- Status -->
        <span style="display:inline-block;padding:5px 14px;border-radius:16px;font-size:13px;font-weight:600;background:${badge.bg};color:${badge.color};margin-bottom:16px;">
          ${badge.label}
        </span>

        <!-- Customer -->
        <div style="background:#f8f9fa;border-radius:8px;padding:14px;margin-bottom:16px;">
          <h4 style="margin:0 0 8px;font-size:14px;color:#1B4332;">👤 Cliente</h4>
          <p style="margin:2px 0;font-size:14px;"><strong>${sub.cliente.nome}</strong></p>
          <p style="margin:2px 0;font-size:13px;color:#555;">📱 ${sub.cliente.celular}</p>
          ${sub.cliente.email ? `<p style="margin:2px 0;font-size:13px;color:#555;">📧 ${sub.cliente.email}</p>` : ''}
        </div>

        <!-- Product -->
        <div style="background:#f8f9fa;border-radius:8px;padding:14px;margin-bottom:16px;">
          <h4 style="margin:0 0 8px;font-size:14px;color:#1B4332;">🏷️ Produto</h4>
          <p style="margin:2px 0;font-size:14px;"><strong>${sub.produto.nome}</strong> (${sub.produto.peso})</p>
          <p style="margin:2px 0;font-size:13px;color:#555;">
            Preço original: <span style="text-decoration:line-through;">${Utils.formatBRL(sub.produto.preco)}</span>
            → <strong style="color:#2D6A4F;">${Utils.formatBRL(sub.precoFinal)}</strong>
            <span style="color:#2D6A4F;font-size:12px;">(${sub.desconto}% OFF)</span>
          </p>
          <p style="margin:2px 0;font-size:13px;color:#555;">📅 Frequência: ${getFrequencyLabel(sub.frequenciaDias)}</p>
          <p style="margin:2px 0;font-size:13px;color:#555;">🏪 Loja: ${getStoreLabel(sub.loja)}</p>
        </div>

        <!-- Dates -->
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
          <div style="background:#f8f9fa;border-radius:8px;padding:10px 14px;flex:1;min-width:140px;">
            <span style="font-size:12px;color:#888;">Início</span><br>
            <strong style="font-size:14px;">${Utils.formatDate(sub.dataInicio)}</strong>
          </div>
          <div style="background:#f8f9fa;border-radius:8px;padding:10px 14px;flex:1;min-width:140px;">
            <span style="font-size:12px;color:#888;">Próxima Entrega</span><br>
            <strong style="font-size:14px;">${sub.status === 'cancelada' ? '—' : Utils.formatDate(sub.proximaEntrega)}</strong>
          </div>
          ${sub.dataCancelamento ? `
          <div style="background:#FFEBEE;border-radius:8px;padding:10px 14px;flex:1;min-width:140px;">
            <span style="font-size:12px;color:#C62828;">Cancelada em</span><br>
            <strong style="font-size:14px;color:#C62828;">${Utils.formatDate(sub.dataCancelamento)}</strong>
          </div>` : ''}
        </div>

        <!-- Delivery History -->
        <div style="margin-bottom:16px;">
          <h4 style="margin:0 0 10px;font-size:14px;color:#1B4332;">📦 Histórico de Entregas (${historico.length})</h4>
          ${historico.length === 0
            ? '<p style="color:#999;font-size:13px;">Nenhuma entrega realizada ainda.</p>'
            : `<div style="max-height:200px;overflow-y:auto;border:1px solid #eee;border-radius:8px;">
                <table style="width:100%;border-collapse:collapse;font-size:13px;">
                  <thead>
                    <tr style="border-bottom:2px solid #eee;background:#f8f9fa;">
                      <th style="text-align:left;padding:8px 12px;">Data</th>
                      <th style="text-align:center;padding:8px 12px;">Status</th>
                      <th style="text-align:right;padding:8px 12px;">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${historico.slice().reverse().map(h => `
                      <tr style="border-bottom:1px solid #f0f0f0;">
                        <td style="padding:6px 12px;">${Utils.formatDate(h.data)}</td>
                        <td style="text-align:center;padding:6px 12px;">
                          <span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;background:#E8F5E9;color:#2E7D32;">
                            ${h.status === 'entregue' ? 'Entregue' : h.status}
                          </span>
                        </td>
                        <td style="text-align:right;padding:6px 12px;">${Utils.formatBRL(h.valor)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>`
          }
          ${historico.length > 0 ? `
            <p style="font-size:12px;color:#888;margin-top:6px;">
              Total recebido: <strong>${Utils.formatBRL(historico.reduce((s, h) => s + h.valor, 0))}</strong>
            </p>` : ''}
        </div>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    modal.querySelector('.modal-close-btn').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    const escHandler = (e) => {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);
  }

  /* ------------------------------------------
     NEW SUBSCRIPTION MODAL
  ------------------------------------------ */
  function showNewSubscriptionModal() {
    const eligibleProducts = DataProducts.filter(p => p.recorrencia && p.recorrencia.elegivel);

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;';

    const modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;border-radius:12px;max-width:500px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);';

    modal.innerHTML = `
      <div style="padding:20px 24px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;">
        <h2 style="margin:0;font-size:18px;color:#1B4332;">Nova Assinatura</h2>
        <button class="modal-close-btn" style="background:none;border:none;font-size:24px;cursor:pointer;color:#888;padding:4px 8px;">✕</button>
      </div>

      <div style="padding:20px 24px;">
        <div style="margin-bottom:14px;">
          <label style="display:block;font-size:13px;font-weight:600;color:#333;margin-bottom:4px;">Nome do Cliente *</label>
          <input type="text" class="new-sub-cliente-nome" placeholder="Nome completo" style="
            width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;
          ">
        </div>

        <div style="margin-bottom:14px;">
          <label style="display:block;font-size:13px;font-weight:600;color:#333;margin-bottom:4px;">Celular *</label>
          <input type="tel" class="new-sub-cliente-celular" placeholder="(11) 99999-9999" style="
            width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;
          ">
        </div>

        <div style="margin-bottom:14px;">
          <label style="display:block;font-size:13px;font-weight:600;color:#333;margin-bottom:4px;">Produto *</label>
          <select class="new-sub-produto" style="
            width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;background:#fff;
          ">
            <option value="">Selecione um produto...</option>
            ${eligibleProducts.map(p =>
              p.variacoes.map(v =>
                `<option value="${p.id}|${v.peso}|${v.preco}|${p.recorrencia.descontoPercent}|${p.recorrencia.frequenciaSugerida}">
                  ${p.nome} — ${v.peso} (${Utils.formatBRL(v.preco)})
                </option>`
              ).join('')
            ).join('')}
          </select>
        </div>

        <div style="margin-bottom:14px;">
          <label style="display:block;font-size:13px;font-weight:600;color:#333;margin-bottom:4px;">Frequência</label>
          <select class="new-sub-frequencia" style="
            width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;background:#fff;
          ">
            <option value="7">Semanal (7 dias)</option>
            <option value="15">Quinzenal (15 dias)</option>
            <option value="30" selected>Mensal (30 dias)</option>
            <option value="45">A cada 45 dias</option>
            <option value="60">Bimestral (60 dias)</option>
            <option value="90">Trimestral (90 dias)</option>
          </select>
        </div>

        <div style="margin-bottom:14px;">
          <label style="display:block;font-size:13px;font-weight:600;color:#333;margin-bottom:4px;">Loja</label>
          <select class="new-sub-loja" style="
            width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;background:#fff;
          ">
            ${DataStores.map(s => `<option value="${s.id}">${s.nome}</option>`).join('')}
          </select>
        </div>

        <!-- Preview -->
        <div class="new-sub-preview" style="
          background:#f0faf4;border:1px solid #c8e6c9;border-radius:8px;padding:14px;margin-bottom:16px;display:none;
        ">
          <p style="margin:0;font-size:14px;color:#2D6A4F;font-weight:600;">Resumo:</p>
          <p class="preview-text" style="margin:4px 0 0;font-size:13px;color:#333;"></p>
        </div>

        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn-cancel-new-sub" style="
            background:#f5f5f5;color:#666;border:1px solid #ddd;padding:10px 20px;border-radius:8px;
            cursor:pointer;font-size:14px;
          ">Cancelar</button>
          <button class="btn-create-new-sub" style="
            background:#2D6A4F;color:#fff;border:none;padding:10px 20px;border-radius:8px;
            cursor:pointer;font-size:14px;font-weight:600;
          ">Criar Assinatura</button>
        </div>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Mask phone
    const celularInput = modal.querySelector('.new-sub-cliente-celular');
    Utils.maskPhone(celularInput);

    // Product selection updates preview and frequency
    const productSelect = modal.querySelector('.new-sub-produto');
    const freqSelect = modal.querySelector('.new-sub-frequencia');
    const preview = modal.querySelector('.new-sub-preview');
    const previewText = modal.querySelector('.preview-text');

    productSelect.addEventListener('change', () => {
      const val = productSelect.value;
      if (!val) { preview.style.display = 'none'; return; }
      const [, , preco, desconto, freqSugerida] = val.split('|');
      freqSelect.value = freqSugerida;
      updatePreview();
    });

    freqSelect.addEventListener('change', updatePreview);

    function updatePreview() {
      const val = productSelect.value;
      if (!val) { preview.style.display = 'none'; return; }
      const [prodId, peso, preco, desconto] = val.split('|');
      const product = DataProducts.find(p => p.id === prodId);
      const freq = parseInt(freqSelect.value);
      const precoNum = parseFloat(preco);
      const descontoNum = parseFloat(desconto);
      const precoFinal = precoNum * (1 - descontoNum / 100);

      preview.style.display = 'block';
      previewText.innerHTML = `
        <strong>${product ? product.nome : prodId}</strong> (${peso})<br>
        De ${Utils.formatBRL(precoNum)} por <strong style="color:#2D6A4F;">${Utils.formatBRL(precoFinal)}</strong>
        (${descontoNum}% OFF)<br>
        Entrega: ${getFrequencyLabel(freq)}
      `;
    }

    // Close
    modal.querySelector('.modal-close-btn').addEventListener('click', () => overlay.remove());
    modal.querySelector('.btn-cancel-new-sub').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    // Create
    modal.querySelector('.btn-create-new-sub').addEventListener('click', () => {
      const nome = modal.querySelector('.new-sub-cliente-nome').value.trim();
      const celular = celularInput.value.trim();
      const prodVal = productSelect.value;
      const freq = parseInt(freqSelect.value);
      const loja = modal.querySelector('.new-sub-loja').value;

      if (!nome || !celular || !prodVal) {
        Toast.error('Preencha todos os campos obrigatórios.');
        return;
      }

      const [prodId, peso, preco, desconto] = prodVal.split('|');
      const product = DataProducts.find(p => p.id === prodId);
      const precoNum = parseFloat(preco);
      const descontoNum = parseFloat(desconto);
      const precoFinal = precoNum * (1 - descontoNum / 100);

      const nextDelivery = new Date();
      nextDelivery.setDate(nextDelivery.getDate() + freq);

      const subs = Storage.get('subscriptions') || [];
      subs.push({
        id: `sub-${Utils.generateId()}`,
        cliente: {
          nome,
          celular,
          email: '',
        },
        produto: {
          id: prodId,
          nome: product ? product.nome : prodId,
          peso,
          preco: precoNum,
        },
        desconto: descontoNum,
        precoFinal,
        frequenciaDias: freq,
        dataInicio: new Date().toISOString(),
        proximaEntrega: nextDelivery.toISOString(),
        loja,
        status: 'ativa',
        dataCancelamento: null,
        historico: [],
      });
      Storage.set('subscriptions', subs);

      overlay.remove();
      Toast.success(`Assinatura criada para ${nome}!`);
      render(currentStoreFilter);
    });
  }

  /* ------------------------------------------
     RENDER
  ------------------------------------------ */
  async function render(storeFilter) {
    const el = container();
    if (!el) return;

    currentStoreFilter = storeFilter || 'todas';

    // Load from Firestore first, fallback to localStorage
    if (typeof FirestoreService !== 'undefined') {
      try {
        FirestoreService.init();
        const fsSubs = await FirestoreService.Subscriptions.getAll();
        if (fsSubs && fsSubs.length > 0) {
          Storage.set('subscriptions', fsSubs);
        }
      } catch(e) { console.warn('[Assinaturas] Firestore load failed:', e.message); }
    }

    const subs = getSubscriptions();
    const kpis = calcKPIs();

    el.innerHTML = `
      <style>
        .assin-kpis {
          display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:14px;margin-bottom:20px;
        }
        .assin-kpi {
          background:#fff;border-radius:10px;padding:18px 20px;box-shadow:0 1px 4px rgba(0,0,0,0.06);
          border-left:4px solid #2D6A4F;
        }
        .assin-kpi__value { font-size:24px;font-weight:700;color:#1B4332;display:block; }
        .assin-kpi__label { font-size:13px;color:#888;margin-top:2px; }
        .assin-kpi--mrr { border-left-color:#52B788; }
        .assin-kpi--churn { border-left-color:#E63946; }
        .assin-kpi--ticket { border-left-color:#C4972A; }
        .assin-action-bar {
          display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:18px;
        }
        .assin-action-bar input,
        .assin-action-bar select {
          padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;background:#fff;
        }
        .assin-action-bar input[type="search"] { flex:1;min-width:180px;max-width:320px; }
        .assin-btn-nova {
          background:#2D6A4F;color:#fff;border:none;padding:10px 18px;border-radius:8px;
          cursor:pointer;font-size:14px;font-weight:600;white-space:nowrap;
        }
        .assin-btn-nova:hover { background:#1B4332; }
        .assin-table-wrap {
          background:#fff;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,0.06);overflow-x:auto;
        }
        .assin-table {
          width:100%;border-collapse:collapse;font-size:14px;
        }
        .assin-table thead th {
          text-align:left;padding:12px 14px;font-size:13px;font-weight:600;color:#888;
          border-bottom:2px solid #eee;white-space:nowrap;background:#fafafa;
        }
        .assin-table tbody tr { border-bottom:1px solid #f0f0f0;transition:background 0.15s; }
        .assin-table tbody tr:hover { background:#f8faf8; }
        .assin-table td { padding:10px 14px;vertical-align:middle; }
        .assin-status-badge {
          display:inline-block;padding:3px 12px;border-radius:12px;font-size:12px;font-weight:600;
        }
        .assin-actions { display:flex;gap:6px;flex-wrap:wrap; }
        .assin-actions button {
          border:none;padding:5px 10px;border-radius:6px;cursor:pointer;font-size:12px;
          font-weight:600;white-space:nowrap;transition:opacity 0.15s;
        }
        .assin-actions button:hover { opacity:0.85; }
        .btn-pausar { background:#FFF8E1;color:#F9A825; }
        .btn-retomar { background:#E8F5E9;color:#2E7D32; }
        .btn-cancelar-sub { background:#FFEBEE;color:#C62828; }
        .btn-lembrar { background:#E3F2FD;color:#1565C0; }
        .btn-historico { background:#f5f5f5;color:#555; }
        .assin-empty { text-align:center;padding:40px;color:#999;font-size:14px; }
        .assin-cliente-link { color:#1B4332;font-weight:600;cursor:pointer;text-decoration:none; }
        .assin-cliente-link:hover { text-decoration:underline; }
      </style>

      <!-- KPI Cards -->
      <div class="assin-kpis">
        <div class="assin-kpi">
          <span class="assin-kpi__value">${kpis.totalAtivas}</span>
          <span class="assin-kpi__label">Total Assinaturas Ativas</span>
        </div>
        <div class="assin-kpi assin-kpi--mrr">
          <span class="assin-kpi__value">${Utils.formatBRL(kpis.mrr)}</span>
          <span class="assin-kpi__label">MRR (Receita Recorrente Mensal)</span>
        </div>
        <div class="assin-kpi assin-kpi--churn">
          <span class="assin-kpi__value">${kpis.churn.toFixed(1)}%</span>
          <span class="assin-kpi__label">Taxa de Churn (30 dias)</span>
        </div>
        <div class="assin-kpi assin-kpi--ticket">
          <span class="assin-kpi__value">${Utils.formatBRL(kpis.ticketMedio)}</span>
          <span class="assin-kpi__label">Ticket Médio Recorrente</span>
        </div>
      </div>

      <!-- Action Bar -->
      <div class="assin-action-bar">
        <input type="search" class="assin-search" placeholder="Buscar cliente, produto..." value="${searchTerm}">
        <select class="assin-status-filter">
          <option value="">Todos os Status</option>
          <option value="ativa" ${statusFilter === 'ativa' ? 'selected' : ''}>Ativa</option>
          <option value="pausada" ${statusFilter === 'pausada' ? 'selected' : ''}>Pausada</option>
          <option value="cancelada" ${statusFilter === 'cancelada' ? 'selected' : ''}>Cancelada</option>
          <option value="pendente" ${statusFilter === 'pendente' ? 'selected' : ''}>Pendente</option>
        </select>
        <input type="date" class="assin-date-from" value="${dateFrom}" title="Data início">
        <input type="date" class="assin-date-to" value="${dateTo}" title="Data fim">
        <button class="assin-btn-nova">+ Nova Assinatura</button>
      </div>

      <!-- Table -->
      <div class="assin-table-wrap">
        ${subs.length === 0
          ? '<div class="assin-empty">Nenhuma assinatura encontrada.</div>'
          : `
          <table class="assin-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Produto</th>
                <th>Frequência</th>
                <th>Valor</th>
                <th>Próxima Entrega</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${subs.map(s => {
                const badge = STATUS_BADGES[s.status] || STATUS_BADGES.pendente;
                return `
                  <tr>
                    <td>
                      <span class="assin-cliente-link" data-sub-id="${s.id}">${s.cliente.nome}</span>
                      <div style="font-size:11px;color:#999;">${s.cliente.celular}</div>
                    </td>
                    <td>
                      <strong>${s.produto.nome}</strong>
                      <div style="font-size:11px;color:#999;">${s.produto.peso}</div>
                    </td>
                    <td>${getFrequencyLabel(s.frequenciaDias)}</td>
                    <td>
                      <strong style="color:#2D6A4F;">${Utils.formatBRL(s.precoFinal)}</strong>
                      ${s.desconto ? `<div style="font-size:11px;color:#999;text-decoration:line-through;">${Utils.formatBRL(s.produto.preco)}</div>` : ''}
                    </td>
                    <td>${s.status === 'cancelada' ? '<span style="color:#999;">—</span>' : Utils.formatDate(s.proximaEntrega)}</td>
                    <td>
                      <span class="assin-status-badge" style="background:${badge.bg};color:${badge.color};">
                        ${badge.label}
                      </span>
                    </td>
                    <td>
                      <div class="assin-actions">
                        ${s.status === 'ativa' ? `
                          <button class="btn-pausar" data-action="pausar" data-id="${s.id}">Pausar</button>
                          <button class="btn-lembrar" data-action="lembrar" data-id="${s.id}">📱 Lembrar</button>
                        ` : ''}
                        ${s.status === 'pausada' ? `
                          <button class="btn-retomar" data-action="retomar" data-id="${s.id}">Retomar</button>
                        ` : ''}
                        ${s.status !== 'cancelada' ? `
                          <button class="btn-cancelar-sub" data-action="cancelar" data-id="${s.id}">Cancelar</button>
                        ` : ''}
                        <button class="btn-historico" data-action="historico" data-id="${s.id}">Histórico</button>
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>`
        }
      </div>
    `;

    // Bind events
    bindRenderEvents(el);
  }

  function bindRenderEvents(el) {
    // Search
    const searchInput = el.querySelector('.assin-search');
    if (searchInput) {
      searchInput.addEventListener('input', Utils.debounce((e) => {
        searchTerm = e.target.value;
        render(currentStoreFilter);
      }, 400));
    }

    // Status filter
    const statusSelect = el.querySelector('.assin-status-filter');
    if (statusSelect) {
      statusSelect.addEventListener('change', (e) => {
        statusFilter = e.target.value;
        render(currentStoreFilter);
      });
    }

    // Date filters
    const dateFromInput = el.querySelector('.assin-date-from');
    const dateToInput = el.querySelector('.assin-date-to');
    if (dateFromInput) {
      dateFromInput.addEventListener('change', (e) => {
        dateFrom = e.target.value;
        render(currentStoreFilter);
      });
    }
    if (dateToInput) {
      dateToInput.addEventListener('change', (e) => {
        dateTo = e.target.value;
        render(currentStoreFilter);
      });
    }

    // New subscription button
    const btnNova = el.querySelector('.assin-btn-nova');
    if (btnNova) {
      btnNova.addEventListener('click', showNewSubscriptionModal);
    }

    // Action buttons
    el.querySelectorAll('.assin-actions button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        switch (action) {
          case 'pausar': pauseSubscription(id); break;
          case 'retomar': resumeSubscription(id); break;
          case 'cancelar': cancelSubscription(id); break;
          case 'lembrar': remindCustomer(id); break;
          case 'historico': showDetailModal(id); break;
        }
      });
    });

    // Client name clicks open detail
    el.querySelectorAll('.assin-cliente-link').forEach(link => {
      link.addEventListener('click', () => {
        showDetailModal(link.dataset.subId);
      });
    });
  }

  /* ------------------------------------------
     PUBLIC API
  ------------------------------------------ */
  return {
    init,
    render,
  };
})();
