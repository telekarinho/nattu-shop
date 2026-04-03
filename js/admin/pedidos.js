/* ============================================
   CLUBE DO NATURAL — Admin Pedidos (Kanban)
   Gestão de pedidos com quadro Kanban
   ============================================ */

const AdminPedidos = (() => {
  const container = () => document.getElementById('pedidos-content');

  // Status config
  const STATUS_CONFIG = {
    novo:       { label: 'Novo',             color: '#E3F2FD', textColor: '#1565C0', icon: '🆕' },
    preparando: { label: 'Preparando',       color: '#FFF3E0', textColor: '#E65100', icon: '👨‍🍳' },
    pronto:     { label: 'Pronto',           color: '#E8F5E9', textColor: '#2E7D32', icon: '✅' },
    entrega:    { label: 'Saiu p/ Entrega',  color: '#F3E5F5', textColor: '#7B1FA2', icon: '🛵' },
    entregue:   { label: 'Entregue',         color: '#E0F2F1', textColor: '#00695C', icon: '📦' },
    cancelado:  { label: 'Cancelado',        color: '#FFEBEE', textColor: '#C62828', icon: '❌' },
  };

  // Map legacy status names
  const STATUS_ALIAS = {
    pendente: 'novo',
  };

  const STATUS_FLOW = ['novo', 'preparando', 'pronto', 'entrega', 'entregue', 'cancelado'];

  let currentStoreFilter = 'todas';
  let searchTerm = '';
  let dateFrom = '';
  let dateTo = '';
  let audioCtx = null;
  let lastOrderCount = 0;
  let pollInterval = null;
  let _cachedOrders = null;

  function useFirestore() {
    return typeof FirestoreService !== 'undefined' && FirestoreService.ready;
  }

  /* ------------------------------------------
     INIT
  ------------------------------------------ */
  function init() {
    // Nothing extra needed; render handles everything
  }

  async function loadOrders() {
    if (useFirestore()) {
      try {
        if (currentStoreFilter && currentStoreFilter !== 'todas') {
          _cachedOrders = await FirestoreService.Orders.getForStore(currentStoreFilter);
        } else {
          _cachedOrders = await FirestoreService.Orders.getAll();
        }
        if (_cachedOrders.length > 0) return;
      } catch (e) {
        console.warn('[Pedidos] Firestore load failed:', e.message);
      }
    }
    _cachedOrders = null; // Will use localStorage fallback
  }

  /* ------------------------------------------
     DATA HELPERS
  ------------------------------------------ */
  function getOrders() {
    let orders = _cachedOrders || Storage.get('orders') || [];

    orders = orders.map(normalizeOrder);

    // Store filter (only if not already filtered by Firestore query)
    if (!_cachedOrders && currentStoreFilter && currentStoreFilter !== 'todas') {
      orders = orders.filter(o => o.loja === currentStoreFilter);
    }

    // Date filter
    if (dateFrom) {
      const from = new Date(dateFrom + 'T00:00:00');
      orders = orders.filter(o => new Date(o.data) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo + 'T23:59:59');
      orders = orders.filter(o => new Date(o.data) <= to);
    }

    // Search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      orders = orders.filter(o =>
        o.numero.toLowerCase().includes(term) ||
        o.cliente.nome.toLowerCase().includes(term) ||
        o.items.some(it => it.nome.toLowerCase().includes(term))
      );
    }

    return orders;
  }

  function timeAgo(dateStr) {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'agora';
    if (diffMin < 60) return `há ${diffMin}min`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `há ${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    return `há ${diffDays}d`;
  }

  function getStatusLabel(status) {
    return STATUS_CONFIG[status] ? STATUS_CONFIG[status].label : status;
  }

  function getPaymentLabel(pag) {
    const labels = { pix: 'PIX', credito: 'Cartão Crédito', debito: 'Cartão Débito', dinheiro: 'Dinheiro' };
    return labels[pag] || pag;
  }

  function getStoreLabel(lojaId) {
    const store = DataStores.find(s => s.id === lojaId);
    return store ? store.nome.split(' - ')[1] || store.nome : lojaId;
  }

  function normalizeOrder(order) {
    const rawItems = Array.isArray(order.items) ? order.items : (Array.isArray(order.itens) ? order.itens : []);
    const items = rawItems.map(it => ({
      ...it,
      quantidade: Number(it.quantidade || it.qty || 1),
      preco: Number(it.preco || it.precoUnit || it.price || 0),
      peso: it.peso || it.variacao || '',
      productId: it.productId || it.produtoId || null,
    }));

    const rawClient = typeof order.cliente === 'object' && order.cliente !== null
      ? order.cliente
      : { nome: order.cliente || order.clienteNome || 'Consumidor Final' };

    return {
      ...order,
      numero: order.numero || order.id || order._id || 'SEM-ID',
      cliente: {
        nome: rawClient.nome || 'Consumidor Final',
        celular: rawClient.celular || rawClient.telefone || '',
        endereco: rawClient.endereco || '',
        email: rawClient.email || '',
      },
      items,
      subtotal: Number(order.subtotal != null ? order.subtotal : order.total || 0),
      total: Number(order.total || 0),
      pagamento: order.pagamento || order.formaPagamento || 'pix',
      entrega: order.entrega || 'retirada',
      taxaEntrega: Number(order.taxaEntrega || 0),
      status: STATUS_ALIAS[order.status] || order.status || 'entregue',
      loja: order.loja || null,
      observacoes: order.observacoes || '',
    };
  }

  /* ------------------------------------------
     SOUND NOTIFICATION
  ------------------------------------------ */
  function playBeep() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.value = 0.3;
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
      setTimeout(() => {
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.type = 'sine';
        osc2.frequency.value = 1100;
        gain2.gain.value = 0.3;
        osc2.start();
        osc2.stop(audioCtx.currentTime + 0.2);
      }, 180);
    } catch (e) {
      // Audio not available
    }
  }

  function checkForNewOrders() {
    const orders = Storage.get('orders') || [];
    const newCount = orders.filter(o => (STATUS_ALIAS[o.status] || o.status) === 'novo').length;
    if (newCount > lastOrderCount && lastOrderCount > 0) {
      playBeep();
    }
    lastOrderCount = newCount;
  }

  /* ------------------------------------------
     STATUS CHANGE
  ------------------------------------------ */
  function changeOrderStatus(orderId, newStatus) {
    const orders = Storage.get('orders') || [];
    const orderIdx = orders.findIndex(o => o.id === orderId);
    if (orderIdx === -1) return;

    const order = orders[orderIdx];
    const oldStatus = STATUS_ALIAS[order.status] || order.status;

    // Check for recurrence popup before changing to "entregue"
    if (newStatus === 'entregue') {
      const eligibleItems = order.items.filter(it => it.recorrenciaElegivel);
      if (eligibleItems.length > 0) {
        // Check if customer already has subscriptions for these products
        const subs = Storage.get('subscriptions') || [];
        const customerSubs = subs.filter(s =>
          s.cliente.nome === order.cliente.nome && s.status === 'ativa'
        );
        const unsubscribedItems = eligibleItems.filter(item =>
          !customerSubs.some(s => s.produto.id === item.productId)
        );

        if (unsubscribedItems.length > 0) {
          showRecurrencePopup(order, unsubscribedItems, () => {
            // After popup, actually change status
            doChangeStatus(orders, orderIdx, newStatus);
          });
          return;
        }
      }
    }

    doChangeStatus(orders, orderIdx, newStatus);
  }

  async function doChangeStatus(orders, orderIdx, newStatus) {
    const order = orders[orderIdx];
    order.status = newStatus;
    if (newStatus === 'entregue') {
      order.dataEntrega = new Date().toISOString();
    }

    // Save to Firestore if available
    if (useFirestore() && order.loja) {
      try {
        await FirestoreService.Orders.updateStatus(order.loja, order.id || order._id, newStatus);
      } catch (e) {
        console.warn('[Pedidos] Firestore status update failed:', e.message);
      }
    }

    // Always save to localStorage too
    Storage.set('orders', orders);

    if (typeof AdminApp !== 'undefined') AdminApp.updatePedidosBadge();
    render(currentStoreFilter);
    const normalizedOrder = normalizeOrder(order);
    Toast.success(`Pedido ${normalizedOrder.numero} → ${getStatusLabel(newStatus)}`);
  }

  /* ------------------------------------------
     RECURRENCE POPUP
  ------------------------------------------ */
  function showRecurrencePopup(order, eligibleItems, onContinue) {
    const overlay = document.createElement('div');
    overlay.className = 'pedidos-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10001;display:flex;align-items:center;justify-content:center;';

    const item = eligibleItems[0]; // Show first eligible
    const popup = document.createElement('div');
    popup.style.cssText = 'background:#fff;border-radius:12px;padding:28px;max-width:440px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);text-align:center;';

    popup.innerHTML = `
      <div style="font-size:48px;margin-bottom:12px;">💡</div>
      <h3 style="margin:0 0 8px;color:#1B4332;font-size:18px;">Ofereça assinatura ao cliente!</h3>
      <p style="color:#555;margin:0 0 16px;font-size:14px;line-height:1.5;">
        <strong>${order.cliente.nome}</strong> comprou <strong>${item.nome}</strong>.<br>
        Esse produto é elegível para assinatura recorrente com
        <strong style="color:#2D6A4F;">${item.descontoRecorrencia}% de desconto</strong>!
      </p>
      ${eligibleItems.length > 1 ? `<p style="color:#888;font-size:12px;margin:0 0 16px;">+ ${eligibleItems.length - 1} outro(s) produto(s) elegível(is)</p>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
        <button class="btn-recurrence-whatsapp" style="
          background:#25D366;color:#fff;border:none;padding:10px 18px;border-radius:8px;
          cursor:pointer;font-size:14px;font-weight:600;display:flex;align-items:center;gap:6px;
        ">📱 Oferecer via WhatsApp</button>
        <button class="btn-recurrence-create" style="
          background:#2D6A4F;color:#fff;border:none;padding:10px 18px;border-radius:8px;
          cursor:pointer;font-size:14px;font-weight:600;
        ">Criar Assinatura</button>
        <button class="btn-recurrence-skip" style="
          background:#f5f5f5;color:#666;border:1px solid #ddd;padding:10px 18px;border-radius:8px;
          cursor:pointer;font-size:14px;
        ">Pular</button>
      </div>
    `;

    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    // WhatsApp offer
    popup.querySelector('.btn-recurrence-whatsapp').addEventListener('click', () => {
      const phone = order.cliente.celular.replace(/\D/g, '');
      const msg = `Olá ${order.cliente.nome.split(' ')[0]}! 🌿\n\n` +
        `Que bom que você gostou do(a) ${item.nome}!\n\n` +
        `Sabia que você pode receber esse produto todo mês com ${item.descontoRecorrencia}% de desconto? ` +
        `É a nossa assinatura Clube do Natural — sem compromisso, cancele quando quiser!\n\n` +
        `Quer que eu ative para você? 😊`;
      const link = Utils.whatsappLink(phone, msg);
      window.open(link, '_blank');
      overlay.remove();
      onContinue();
    });

    // Create subscription directly
    popup.querySelector('.btn-recurrence-create').addEventListener('click', () => {
      const product = DataProducts.find(p => p.id === item.productId);
      if (product) {
        const subs = Storage.get('subscriptions') || [];
        subs.push({
          id: `sub-${Utils.generateId()}`,
          cliente: { ...order.cliente },
          produto: {
            id: product.id,
            nome: product.nome,
            peso: item.peso,
            preco: item.preco,
          },
          desconto: item.descontoRecorrencia,
          precoFinal: item.preco * (1 - item.descontoRecorrencia / 100),
          frequenciaDias: product.recorrencia.frequenciaSugerida || 30,
          dataInicio: new Date().toISOString(),
          proximaEntrega: new Date(Date.now() + (product.recorrencia.frequenciaSugerida || 30) * 86400000).toISOString(),
          loja: order.loja,
          status: 'ativa',
        });
        Storage.set('subscriptions', subs);
        Toast.success(`Assinatura de ${product.nome} criada para ${order.cliente.nome}!`);
      }
      overlay.remove();
      onContinue();
    });

    // Skip
    popup.querySelector('.btn-recurrence-skip').addEventListener('click', () => {
      overlay.remove();
      onContinue();
    });

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
        onContinue();
      }
    });
  }

  /* ------------------------------------------
     ORDER DETAIL MODAL
  ------------------------------------------ */
  function showOrderModal(orderId) {
    const orders = getOrders();
    const order = orders.find(o => o.id === orderId || o._id === orderId);
    if (!order) return;

    const normalizedStatus = STATUS_ALIAS[order.status] || order.status;
    const config = STATUS_CONFIG[normalizedStatus] || STATUS_CONFIG.novo;

    const overlay = document.createElement('div');
    overlay.className = 'pedidos-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;';

    const modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;border-radius:12px;max-width:600px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);';

    // Next possible statuses
    const currentIdx = STATUS_FLOW.indexOf(normalizedStatus);
    const nextStatuses = STATUS_FLOW.filter((s, i) => i !== currentIdx && s !== normalizedStatus);

    modal.innerHTML = `
      <div style="padding:20px 24px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <h2 style="margin:0;font-size:20px;color:#1B4332;">Pedido ${order.numero}</h2>
          <span style="font-size:13px;color:#888;">${Utils.formatDateTime(order.data)} (${timeAgo(order.data)})</span>
        </div>
        <button class="modal-close-btn" style="background:none;border:none;font-size:24px;cursor:pointer;color:#888;padding:4px 8px;">✕</button>
      </div>

      <div style="padding:20px 24px;">
        <!-- Status Badge -->
        <div style="margin-bottom:16px;">
          <span style="
            display:inline-block;padding:6px 16px;border-radius:20px;font-weight:600;font-size:14px;
            background:${config.color};color:${config.textColor};
          ">${config.icon} ${config.label}</span>
          <span style="
            display:inline-block;padding:6px 12px;border-radius:20px;font-size:13px;margin-left:8px;
            background:${order.entrega === 'delivery' ? '#F3E5F5' : '#E8F5E9'};
            color:${order.entrega === 'delivery' ? '#7B1FA2' : '#2E7D32'};
          ">${order.entrega === 'delivery' ? '🛵 Delivery' : '🏪 Retirada'}</span>
        </div>

        <!-- Customer Info -->
        <div style="background:#f8f9fa;border-radius:8px;padding:14px;margin-bottom:16px;">
          <h4 style="margin:0 0 8px;font-size:14px;color:#1B4332;">👤 Cliente</h4>
          <p style="margin:2px 0;font-size:14px;"><strong>${order.cliente.nome}</strong></p>
          <p style="margin:2px 0;font-size:13px;color:#555;">📱 ${order.cliente.celular}</p>
          ${order.cliente.endereco ? `<p style="margin:2px 0;font-size:13px;color:#555;">📍 ${order.cliente.endereco}</p>` : ''}
          ${order.cliente.email ? `<p style="margin:2px 0;font-size:13px;color:#555;">📧 ${order.cliente.email}</p>` : ''}
        </div>

        <!-- Items -->
        <div style="margin-bottom:16px;">
          <h4 style="margin:0 0 10px;font-size:14px;color:#1B4332;">📋 Itens do Pedido</h4>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead>
              <tr style="border-bottom:2px solid #eee;">
                <th style="text-align:left;padding:6px 4px;">Produto</th>
                <th style="text-align:center;padding:6px 4px;">Qtd</th>
                <th style="text-align:right;padding:6px 4px;">Unit.</th>
                <th style="text-align:right;padding:6px 4px;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${order.items.map(it => `
                <tr style="border-bottom:1px solid #f0f0f0;">
                  <td style="padding:8px 4px;">${it.nome} <span style="color:#888;font-size:12px;">(${it.peso})</span></td>
                  <td style="text-align:center;padding:8px 4px;">${it.quantidade}</td>
                  <td style="text-align:right;padding:8px 4px;">${Utils.formatBRL(it.preco)}</td>
                  <td style="text-align:right;padding:8px 4px;font-weight:600;">${Utils.formatBRL(it.preco * it.quantidade)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div style="border-top:2px solid #eee;padding-top:8px;margin-top:4px;font-size:14px;">
            <div style="display:flex;justify-content:space-between;margin:4px 0;">
              <span>Subtotal</span><span>${Utils.formatBRL(order.subtotal)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin:4px 0;">
              <span>Taxa de Entrega</span><span>${order.taxaEntrega > 0 ? Utils.formatBRL(order.taxaEntrega) : 'Grátis'}</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin:4px 0;font-size:16px;font-weight:700;color:#1B4332;">
              <span>Total</span><span>${Utils.formatBRL(order.total)}</span>
            </div>
          </div>
        </div>

        <!-- Payment -->
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px;font-size:13px;">
          <div style="background:#f8f9fa;border-radius:8px;padding:10px 14px;flex:1;min-width:140px;">
            <span style="color:#888;">Pagamento</span><br>
            <strong>${getPaymentLabel(order.pagamento)}</strong>
          </div>
          <div style="background:#f8f9fa;border-radius:8px;padding:10px 14px;flex:1;min-width:140px;">
            <span style="color:#888;">Loja</span><br>
            <strong>${getStoreLabel(order.loja)}</strong>
          </div>
        </div>

        ${order.observacoes ? `
        <div style="background:#FFF8E1;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:13px;">
          <strong>📝 Observações:</strong> ${order.observacoes}
        </div>` : ''}

        ${order.dataEntrega ? `
        <div style="font-size:13px;color:#888;margin-bottom:16px;">
          Entregue em: ${Utils.formatDateTime(order.dataEntrega)}
        </div>` : ''}

        <!-- Actions -->
        <div style="border-top:1px solid #eee;padding-top:16px;display:flex;gap:8px;flex-wrap:wrap;">
          <div style="flex:1;min-width:150px;">
            <label style="font-size:12px;color:#888;display:block;margin-bottom:4px;">Alterar Status</label>
            <select class="modal-status-select" style="
              width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;
              background:#fff;cursor:pointer;
            ">
              <option value="">-- Alterar --</option>
              ${nextStatuses.map(s => `<option value="${s}">${STATUS_CONFIG[s].icon} ${STATUS_CONFIG[s].label}</option>`).join('')}
            </select>
          </div>
          <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;">
            <button class="modal-btn-whatsapp" style="
              background:#25D366;color:#fff;border:none;padding:8px 14px;border-radius:8px;
              cursor:pointer;font-size:13px;font-weight:600;white-space:nowrap;
            ">📱 WhatsApp</button>
            <button class="modal-btn-print" style="
              background:#1B4332;color:#fff;border:none;padding:8px 14px;border-radius:8px;
              cursor:pointer;font-size:13px;font-weight:600;white-space:nowrap;
            ">🖨️ Imprimir</button>
            <button class="modal-btn-nfce" style="
              background:#0D47A1;color:#fff;border:none;padding:8px 14px;border-radius:8px;
              cursor:pointer;font-size:13px;font-weight:600;white-space:nowrap;
            ">🧾 NFC-e</button>
          </div>
        </div>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Close button
    modal.querySelector('.modal-close-btn').addEventListener('click', () => overlay.remove());

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    // Escape key
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    // Status change
    modal.querySelector('.modal-status-select').addEventListener('change', (e) => {
      const newStatus = e.target.value;
      if (newStatus) {
        overlay.remove();
        changeOrderStatus(order.id, newStatus);
      }
    });

    // WhatsApp
    modal.querySelector('.modal-btn-whatsapp').addEventListener('click', () => {
      const phone = order.cliente.celular.replace(/\D/g, '');
      const msg = `Olá ${order.cliente.nome.split(' ')[0]}! 🌿\n\n` +
        `Seu pedido *${order.numero}* está com status: *${getStatusLabel(normalizedStatus)}*.\n\n` +
        `Itens:\n${order.items.map(it => `• ${it.quantidade}x ${it.nome} (${it.peso})`).join('\n')}\n\n` +
        `Total: *${Utils.formatBRL(order.total)}*\n\n` +
        `Clube do Natural 🌿`;
      window.open(Utils.whatsappLink(phone, msg), '_blank');
    });

    // Print receipt
    modal.querySelector('.modal-btn-print').addEventListener('click', () => {
      printReceipt(order, normalizedStatus);
    });

    // NFC-e link
    modal.querySelector('.modal-btn-nfce').addEventListener('click', () => {
      Toast.info('Emissão de NFC-e: funcionalidade integrada com módulo fiscal.');
    });
  }

  /* ------------------------------------------
     PRINT RECEIPT (non-fiscal)
  ------------------------------------------ */
  function printReceipt(order, normalizedStatus) {
    const receiptWindow = window.open('', '_blank', 'width=320,height=600');
    if (!receiptWindow) {
      Toast.error('Popup bloqueado. Permita popups para imprimir.');
      return;
    }

    const store = DataStores.find(s => s.id === order.loja);
    const storeName = store ? store.nome : 'Clube do Natural';

    receiptWindow.document.write(`
      <!DOCTYPE html>
      <html><head><title>Cupom ${order.numero}</title>
      <style>
        body { font-family: 'Courier New', monospace; font-size: 12px; width: 280px; margin: 0 auto; padding: 10px; }
        .center { text-align: center; }
        .line { border-top: 1px dashed #000; margin: 6px 0; }
        .row { display: flex; justify-content: space-between; }
        .bold { font-weight: bold; }
        .big { font-size: 16px; }
        @media print { body { margin: 0; } }
      </style></head><body>
        <div class="center bold big">${storeName}</div>
        <div class="center">CUPOM NÃO FISCAL</div>
        <div class="line"></div>
        <div class="row"><span>Pedido:</span><span class="bold">${order.numero}</span></div>
        <div class="row"><span>Data:</span><span>${Utils.formatDateTime(order.data)}</span></div>
        <div class="row"><span>Cliente:</span><span>${order.cliente.nome}</span></div>
        <div class="row"><span>Tipo:</span><span>${order.entrega === 'delivery' ? 'Delivery' : 'Retirada'}</span></div>
        <div class="line"></div>
        <div class="bold">ITENS:</div>
        ${order.items.map(it => `
          <div>${it.quantidade}x ${it.nome} (${it.peso})</div>
          <div class="row"><span></span><span>${Utils.formatBRL(it.preco * it.quantidade)}</span></div>
        `).join('')}
        <div class="line"></div>
        <div class="row"><span>Subtotal:</span><span>${Utils.formatBRL(order.subtotal)}</span></div>
        <div class="row"><span>Entrega:</span><span>${order.taxaEntrega > 0 ? Utils.formatBRL(order.taxaEntrega) : 'Grátis'}</span></div>
        <div class="row bold big"><span>TOTAL:</span><span>${Utils.formatBRL(order.total)}</span></div>
        <div class="line"></div>
        <div class="row"><span>Pagamento:</span><span>${getPaymentLabel(order.pagamento)}</span></div>
        <div class="line"></div>
        <div class="center" style="margin-top:8px;">Obrigado pela preferência!</div>
        <div class="center">🌿 Clube do Natural</div>
        <script>window.print();</script>
      </body></html>
    `);
    receiptWindow.document.close();
  }

  /* ------------------------------------------
     RENDER
  ------------------------------------------ */
  async function render(storeFilter) {
    const el = container();
    if (!el) return;

    currentStoreFilter = storeFilter || 'todas';

    await loadOrders();

    const orders = getOrders();

    // Group by status
    const grouped = {};
    STATUS_FLOW.forEach(s => grouped[s] = []);
    orders.forEach(o => {
      const s = STATUS_ALIAS[o.status] || o.status;
      if (grouped[s]) grouped[s].push(o);
      else grouped.novo.push(o);
    });

    // Track new order count for sound
    lastOrderCount = grouped.novo.length;

    el.innerHTML = `
      <style>
        .pedidos-action-bar {
          display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:20px;
        }
        .pedidos-action-bar input[type="date"],
        .pedidos-action-bar input[type="search"] {
          padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;
          background:#fff;min-width:130px;
        }
        .pedidos-action-bar input[type="search"] { flex:1;min-width:200px;max-width:350px; }
        .pedidos-btn-novo {
          background:#2D6A4F;color:#fff;border:none;padding:10px 20px;border-radius:8px;
          cursor:pointer;font-size:14px;font-weight:600;white-space:nowrap;
        }
        .pedidos-btn-novo:hover { background:#1B4332; }
        .kanban-board {
          display:grid;
          grid-template-columns:repeat(6, 1fr);
          gap:12px;
          overflow-x:auto;
          padding-bottom:8px;
          min-height:400px;
        }
        @media (max-width: 1200px) {
          .kanban-board { grid-template-columns:repeat(3, minmax(220px, 1fr)); }
        }
        @media (max-width: 768px) {
          .kanban-board { grid-template-columns:repeat(2, minmax(200px, 1fr)); }
        }
        @media (max-width: 480px) {
          .kanban-board { grid-template-columns:1fr; }
        }
        .kanban-col {
          background:#f8f9fa;border-radius:10px;min-height:300px;display:flex;flex-direction:column;
        }
        .kanban-col__header {
          padding:12px 14px;border-radius:10px 10px 0 0;display:flex;justify-content:space-between;
          align-items:center;font-weight:700;font-size:13px;letter-spacing:0.3px;
        }
        .kanban-col__count {
          background:rgba(0,0,0,0.12);border-radius:12px;padding:2px 10px;font-size:12px;
          min-width:24px;text-align:center;
        }
        .kanban-col__cards { padding:8px;flex:1;display:flex;flex-direction:column;gap:8px; }
        .kanban-card {
          background:#fff;border-radius:8px;padding:12px;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.08);
          transition:box-shadow 0.2s,transform 0.15s;border-left:3px solid transparent;
        }
        .kanban-card:hover { box-shadow:0 4px 12px rgba(0,0,0,0.12);transform:translateY(-1px); }
        .kanban-card__header { display:flex;justify-content:space-between;align-items:center;margin-bottom:6px; }
        .kanban-card__numero { font-weight:700;font-size:13px;color:#1B4332; }
        .kanban-card__time { font-size:11px;color:#999; }
        .kanban-card__cliente { font-size:13px;color:#333;margin-bottom:4px; }
        .kanban-card__footer { display:flex;justify-content:space-between;align-items:center;margin-top:6px; }
        .kanban-card__total { font-weight:700;font-size:14px;color:#2D6A4F; }
        .kanban-card__items { font-size:11px;color:#888; }
        .kanban-card__badge {
          display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;
        }
        .kanban-card__badge--delivery { background:#F3E5F5;color:#7B1FA2; }
        .kanban-card__badge--retirada { background:#E8F5E9;color:#2E7D32; }
        .kanban-empty { text-align:center;color:#bbb;font-size:13px;padding:24px 8px; }
      </style>

      <!-- Action Bar -->
      <div class="pedidos-action-bar">
        <input type="date" class="pedidos-date-from" value="${dateFrom}" title="Data início">
        <input type="date" class="pedidos-date-to" value="${dateTo}" title="Data fim">
        <input type="search" class="pedidos-search" placeholder="Buscar pedido, cliente..." value="${searchTerm}">
        <button class="pedidos-btn-novo">+ Novo Pedido</button>
      </div>

      <!-- Kanban Board -->
      <div class="kanban-board">
        ${STATUS_FLOW.map(status => {
          const cfg = STATUS_CONFIG[status];
          const colOrders = grouped[status] || [];
          return `
            <div class="kanban-col">
              <div class="kanban-col__header" style="background:${cfg.color};color:${cfg.textColor};">
                <span>${cfg.icon} ${cfg.label}</span>
                <span class="kanban-col__count">${colOrders.length}</span>
              </div>
              <div class="kanban-col__cards">
                ${colOrders.length === 0 ? '<div class="kanban-empty">Nenhum pedido</div>' :
                  colOrders.map(o => renderOrderCard(o, status, cfg)).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // Bind events
    bindRenderEvents(el);

    // Start polling for new orders
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(checkForNewOrders, 15000);
  }

  function renderOrderCard(order, status, cfg) {
    const itemCount = order.items.reduce((s, it) => s + it.quantidade, 0);
    return `
      <div class="kanban-card" data-order-id="${order.id}" style="border-left-color:${cfg.textColor};">
        <div class="kanban-card__header">
          <span class="kanban-card__numero">${order.numero}</span>
          <span class="kanban-card__time">${timeAgo(order.data)}</span>
        </div>
        <div class="kanban-card__cliente">${order.cliente.nome}</div>
        <div class="kanban-card__footer">
          <span class="kanban-card__total">${Utils.formatBRL(order.total)}</span>
          <span class="kanban-card__items">${itemCount} ${itemCount === 1 ? 'item' : 'itens'}</span>
        </div>
        <div style="margin-top:6px;">
          <span class="kanban-card__badge kanban-card__badge--${order.entrega}">
            ${order.entrega === 'delivery' ? '🛵 Delivery' : '🏪 Retirada'}
          </span>
        </div>
      </div>
    `;
  }

  function bindRenderEvents(el) {
    // Date filters
    const dateFromInput = el.querySelector('.pedidos-date-from');
    const dateToInput = el.querySelector('.pedidos-date-to');
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

    // Search
    const searchInput = el.querySelector('.pedidos-search');
    if (searchInput) {
      searchInput.addEventListener('input', Utils.debounce((e) => {
        searchTerm = e.target.value;
        render(currentStoreFilter);
      }, 400));
    }

    // New order button
    const btnNovo = el.querySelector('.pedidos-btn-novo');
    if (btnNovo) {
      btnNovo.addEventListener('click', () => {
        Toast.info('Funcionalidade de novo pedido: use o catálogo ou PDV.');
      });
    }

    // Card clicks
    el.querySelectorAll('.kanban-card').forEach(card => {
      card.addEventListener('click', () => {
        const orderId = card.dataset.orderId;
        showOrderModal(orderId);
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
