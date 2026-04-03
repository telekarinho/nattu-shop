/* ============================================
   CLUBE DO NATURAL — Admin Clientes
   Base de clientes extraída dos pedidos
   ============================================ */

const AdminClientes = (() => {
  const container = () => document.getElementById('clientes-content');

  let currentStoreFilter = 'todas';
  let searchTerm = '';
  let tagFilter = 'todos';

  const TAG_CONFIG = {
    novo:       { bg: '#E3F2FD', color: '#1565C0', label: 'Novo' },
    recorrente: { bg: '#E8F5E9', color: '#2E7D32', label: 'Recorrente' },
    vip:        { bg: '#FFF8E1', color: '#F57F17', label: 'VIP' },
  };

  /* ------------------------------------------
     FILTERS
  ------------------------------------------ */
  function applyFilters(customers) {
    let filtered = [...customers];
    // Sort by total spent desc
    filtered.sort((a, b) => (b.totalGasto || 0) - (a.totalGasto || 0));

    if (tagFilter !== 'todos') {
      filtered = filtered.filter(c => c.tag === tagFilter);
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(c =>
        (c.nome || '').toLowerCase().includes(term) ||
        (c.celular || '').includes(term) ||
        (c.email && c.email.toLowerCase().includes(term))
      );
    }
    return filtered;
  }

  /* ------------------------------------------
     DATA — aggregate from orders
  ------------------------------------------ */
  async function getCustomers() {
    // Load from Firestore first
    if (typeof FirestoreService !== 'undefined') {
      try {
        FirestoreService.init();
        const fsCustomers = await FirestoreService.Customers.getAll();
        if (fsCustomers && fsCustomers.length > 0) return applyFilters(fsCustomers);
      } catch(e) { console.warn('[Clientes] Firestore load failed:', e.message); }
    }

    // Fallback: aggregate from localStorage orders
    const orders = Storage.get('orders') || [];
    const subs = Storage.get('subscriptions') || [];
    const map = {};

    // Filter orders by store
    const filteredOrders = (currentStoreFilter && currentStoreFilter !== 'todas')
      ? orders.filter(o => o.loja === currentStoreFilter)
      : orders;

    filteredOrders.forEach(o => {
      const phone = o.cliente.celular.replace(/\D/g, '');
      if (!phone) return;

      if (!map[phone]) {
        map[phone] = {
          nome: o.cliente.nome,
          celular: o.cliente.celular,
          email: o.cliente.email || '',
          phone,
          pedidos: 0,
          totalGasto: 0,
          ultimoPedido: null,
          orderList: [],
        };
      }

      map[phone].pedidos++;
      map[phone].totalGasto += o.total;

      if (!map[phone].ultimoPedido || new Date(o.data) > new Date(map[phone].ultimoPedido)) {
        map[phone].ultimoPedido = o.data;
        // update name/email from latest order
        map[phone].nome = o.cliente.nome;
        if (o.cliente.email) map[phone].email = o.cliente.email;
      }
      map[phone].orderList.push(o);
    });

    // Assign tags
    let customers = Object.values(map).map(c => {
      let tag = 'novo';
      if (c.totalGasto > 500) tag = 'vip';
      else if (c.pedidos >= 2) tag = 'recorrente';
      c.tag = tag;

      // Find subscriptions
      c.subscriptions = subs.filter(s =>
        s.cliente.celular.replace(/\D/g, '') === c.phone
      );

      return c;
    });

    // Sort by total spent desc
    customers.sort((a, b) => b.totalGasto - a.totalGasto);

    // Apply filters
    if (tagFilter !== 'todos') {
      customers = customers.filter(c => c.tag === tagFilter);
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      customers = customers.filter(c =>
        c.nome.toLowerCase().includes(term) ||
        c.celular.includes(term) ||
        (c.email && c.email.toLowerCase().includes(term))
      );
    }

    return customers;
  }

  /* ------------------------------------------
     KPIs
  ------------------------------------------ */
  function calcKPIs(customers) {
    const total = customers.length;
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // All customers (unfiltered) for KPIs
    const allCustomers = (() => {
      const orders = Storage.get('orders') || [];
      const filtered = (currentStoreFilter && currentStoreFilter !== 'todas')
        ? orders.filter(o => o.loja === currentStoreFilter)
        : orders;
      const map = {};
      filtered.forEach(o => {
        const phone = o.cliente.celular.replace(/\D/g, '');
        if (!phone) return;
        if (!map[phone]) {
          map[phone] = { pedidos: 0, totalGasto: 0, ultimoPedido: null, primeiroPedido: null };
        }
        map[phone].pedidos++;
        map[phone].totalGasto += o.total;
        if (!map[phone].ultimoPedido || new Date(o.data) > new Date(map[phone].ultimoPedido)) {
          map[phone].ultimoPedido = o.data;
        }
        if (!map[phone].primeiroPedido || new Date(o.data) < new Date(map[phone].primeiroPedido)) {
          map[phone].primeiroPedido = o.data;
        }
      });
      return Object.values(map);
    })();

    const totalAll = allCustomers.length;
    const novos = allCustomers.filter(c => c.primeiroPedido && new Date(c.primeiroPedido) >= thirtyDaysAgo).length;
    const recorrentes = allCustomers.filter(c => c.pedidos >= 2).length;
    const vips = allCustomers.filter(c => c.totalGasto > 500).length;

    return { total: totalAll, novos, recorrentes, vips };
  }

  /* ------------------------------------------
     RENDER
  ------------------------------------------ */
  async function render(storeFilter) {
    const el = container();
    if (!el) return;

    currentStoreFilter = storeFilter || 'todas';
    const customers = await getCustomers();
    const kpis = calcKPIs(customers);

    el.innerHTML = `
      <style>
        .cli-kpis {
          display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:20px;
        }
        .cli-kpi-card {
          background:#fff;border-radius:10px;padding:16px;box-shadow:0 2px 6px rgba(0,0,0,0.06);text-align:center;
        }
        .cli-kpi-value { font-size:28px;font-weight:700;margin-bottom:4px; }
        .cli-kpi-label { font-size:13px;color:#888; }
        .cli-action-bar {
          display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:20px;
        }
        .cli-action-bar input[type="search"] {
          padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;
          background:#fff;flex:1;min-width:200px;max-width:350px;
        }
        .cli-action-bar select {
          padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;
          background:#fff;min-width:130px;
        }
        .cli-tag {
          display:inline-block;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:600;
        }
        .cli-actions-btn {
          background:none;border:1px solid #ddd;padding:4px 10px;border-radius:6px;
          cursor:pointer;font-size:12px;margin:2px;transition:background 0.2s;
        }
        .cli-actions-btn:hover { background:#f0f0f0; }
        .cli-actions-btn--whatsapp { color:#25D366;border-color:#A5D6A7; }
        .cli-actions-btn--whatsapp:hover { background:#E8F5E9; }
      </style>

      <!-- KPI Cards -->
      <div class="cli-kpis">
        <div class="cli-kpi-card">
          <div class="cli-kpi-value" style="color:#1B4332;">${kpis.total}</div>
          <div class="cli-kpi-label">Total Clientes</div>
        </div>
        <div class="cli-kpi-card">
          <div class="cli-kpi-value" style="color:#1565C0;">${kpis.novos}</div>
          <div class="cli-kpi-label">Novos (30 dias)</div>
        </div>
        <div class="cli-kpi-card">
          <div class="cli-kpi-value" style="color:#2E7D32;">${kpis.recorrentes}</div>
          <div class="cli-kpi-label">Recorrentes</div>
        </div>
        <div class="cli-kpi-card">
          <div class="cli-kpi-value" style="color:#F57F17;">${kpis.vips}</div>
          <div class="cli-kpi-label">VIP (> R$500)</div>
        </div>
      </div>

      <!-- Action Bar -->
      <div class="cli-action-bar">
        <input type="search" class="cli-search" placeholder="Buscar por nome, celular, email..." value="${searchTerm}">
        <select class="cli-tag-filter">
          <option value="todos" ${tagFilter === 'todos' ? 'selected' : ''}>Todos</option>
          <option value="novo" ${tagFilter === 'novo' ? 'selected' : ''}>Novo</option>
          <option value="recorrente" ${tagFilter === 'recorrente' ? 'selected' : ''}>Recorrente</option>
          <option value="vip" ${tagFilter === 'vip' ? 'selected' : ''}>VIP</option>
        </select>
      </div>

      <!-- Table -->
      <div class="table-responsive">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Celular</th>
              <th>Email</th>
              <th>Pedidos</th>
              <th>Total Gasto</th>
              <th>Último Pedido</th>
              <th>Tag</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${customers.length === 0 ? `
              <tr><td colspan="8" style="text-align:center;color:#999;padding:24px;">Nenhum cliente encontrado</td></tr>
            ` : customers.map(c => {
              const tag = TAG_CONFIG[c.tag];
              return `
                <tr>
                  <td><strong>${c.nome}</strong></td>
                  <td>${c.celular}</td>
                  <td>${c.email || '—'}</td>
                  <td>${c.pedidos}</td>
                  <td>${Utils.formatBRL(c.totalGasto)}</td>
                  <td>${c.ultimoPedido ? Utils.formatDate(c.ultimoPedido) : '—'}</td>
                  <td><span class="cli-tag" style="background:${tag.bg};color:${tag.color};">${tag.label}</span></td>
                  <td>
                    <button class="cli-actions-btn" data-action="detalhes" data-phone="${c.phone}">Ver Detalhes</button>
                    <button class="cli-actions-btn cli-actions-btn--whatsapp" data-action="whatsapp" data-phone="${c.phone}" data-nome="${c.nome}">WhatsApp</button>
                    ${c.subscriptions.length > 0 ? `<button class="cli-actions-btn" data-action="subs" data-phone="${c.phone}">Assinaturas</button>` : ''}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    bindEvents(el, customers);
  }

  /* ------------------------------------------
     EVENT BINDINGS
  ------------------------------------------ */
  function bindEvents(el, customers) {
    const searchInput = el.querySelector('.cli-search');
    if (searchInput) {
      searchInput.addEventListener('input', Utils.debounce((e) => {
        searchTerm = e.target.value;
        render(currentStoreFilter);
      }, 400));
    }

    el.querySelector('.cli-tag-filter').addEventListener('change', (e) => {
      tagFilter = e.target.value;
      render(currentStoreFilter);
    });

    el.querySelectorAll('.cli-actions-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const phone = btn.dataset.phone;
        const customer = customers.find(c => c.phone === phone);
        if (!customer) return;

        if (action === 'detalhes') showDetailModal(customer);
        else if (action === 'whatsapp') openWhatsApp(customer);
        else if (action === 'subs') showSubsModal(customer);
      });
    });
  }

  /* ------------------------------------------
     WHATSAPP
  ------------------------------------------ */
  function openWhatsApp(customer) {
    const firstName = customer.nome.split(' ')[0];
    const msg = `Olá ${firstName}! 🌿\n\nAqui é do Clube do Natural. Tudo bem?\n\nGostaríamos de saber como foi sua experiência com seus últimos pedidos. Precisa de algo?\n\nEstamos à disposição! 😊`;
    const link = Utils.whatsappLink(customer.phone, msg);
    window.open(link, '_blank');
  }

  /* ------------------------------------------
     DETAIL MODAL
  ------------------------------------------ */
  function showDetailModal(customer) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;';

    const modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;border-radius:12px;max-width:700px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);';

    const tag = TAG_CONFIG[customer.tag];
    const ticketMedio = customer.pedidos > 0 ? customer.totalGasto / customer.pedidos : 0;
    const sortedOrders = customer.orderList.sort((a, b) => new Date(b.data) - new Date(a.data));

    modal.innerHTML = `
      <div style="padding:20px 24px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <h2 style="margin:0;font-size:20px;color:#1B4332;">${customer.nome}</h2>
          <span style="font-size:13px;color:#888;">${customer.celular} ${customer.email ? ' | ' + customer.email : ''}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="cli-tag" style="background:${tag.bg};color:${tag.color};padding:4px 14px;border-radius:12px;font-size:13px;font-weight:600;">${tag.label}</span>
          <button class="modal-close" style="background:none;border:none;font-size:24px;cursor:pointer;color:#888;">✕</button>
        </div>
      </div>
      <div style="padding:20px 24px;">
        <!-- Stats -->
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;">
          <div style="background:#f8f9fa;border-radius:8px;padding:12px;text-align:center;">
            <div style="font-size:22px;font-weight:700;color:#1B4332;">${customer.pedidos}</div>
            <div style="font-size:12px;color:#888;">Pedidos</div>
          </div>
          <div style="background:#f8f9fa;border-radius:8px;padding:12px;text-align:center;">
            <div style="font-size:22px;font-weight:700;color:#2D6A4F;">${Utils.formatBRL(customer.totalGasto)}</div>
            <div style="font-size:12px;color:#888;">Total Gasto</div>
          </div>
          <div style="background:#f8f9fa;border-radius:8px;padding:12px;text-align:center;">
            <div style="font-size:22px;font-weight:700;color:#555;">${Utils.formatBRL(ticketMedio)}</div>
            <div style="font-size:12px;color:#888;">Ticket Médio</div>
          </div>
        </div>

        <!-- Subscriptions -->
        ${customer.subscriptions.length > 0 ? `
          <div style="margin-bottom:20px;">
            <h4 style="margin:0 0 8px;font-size:14px;color:#1B4332;">Assinaturas</h4>
            ${customer.subscriptions.map(sub => `
              <div style="background:#f8f9fa;border-radius:8px;padding:10px;margin-bottom:6px;font-size:13px;display:flex;justify-content:space-between;align-items:center;">
                <span>${sub.produto.nome} (${sub.produto.peso}) — a cada ${sub.frequenciaDias} dias</span>
                <span style="padding:2px 10px;border-radius:10px;font-size:11px;font-weight:600;
                  background:${sub.status === 'ativa' ? '#E8F5E9' : '#FFF8E1'};
                  color:${sub.status === 'ativa' ? '#2E7D32' : '#F57F17'};">
                  ${sub.status === 'ativa' ? 'Ativa' : 'Pausada'}
                </span>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <!-- Order History -->
        <h4 style="margin:0 0 8px;font-size:14px;color:#1B4332;">Histórico de Pedidos</h4>
        <div class="table-responsive">
          <table class="admin-table admin-table--compact" style="font-size:13px;">
            <thead>
              <tr><th>Pedido</th><th>Data</th><th>Itens</th><th>Total</th><th>Status</th></tr>
            </thead>
            <tbody>
              ${sortedOrders.map(o => `
                <tr>
                  <td><strong>${o.numero}</strong></td>
                  <td>${Utils.formatDateTime(o.data)}</td>
                  <td>${o.items.map(it => it.nome).join(', ')}</td>
                  <td>${Utils.formatBRL(o.total)}</td>
                  <td>${o.status}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    modal.querySelector('.modal-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); }
    });
  }

  /* ------------------------------------------
     SUBSCRIPTIONS MODAL
  ------------------------------------------ */
  function showSubsModal(customer) {
    if (customer.subscriptions.length === 0) {
      Toast.info('Este cliente não possui assinaturas');
      return;
    }

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;';

    const modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;border-radius:12px;max-width:600px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);';

    modal.innerHTML = `
      <div style="padding:20px 24px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;">
        <h2 style="margin:0;font-size:20px;color:#1B4332;">Assinaturas — ${customer.nome}</h2>
        <button class="modal-close" style="background:none;border:none;font-size:24px;cursor:pointer;color:#888;">✕</button>
      </div>
      <div style="padding:20px 24px;">
        ${customer.subscriptions.map(sub => `
          <div style="background:#f8f9fa;border-radius:10px;padding:16px;margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <strong style="font-size:15px;color:#1B4332;">${sub.produto.nome}</strong>
              <span style="padding:4px 12px;border-radius:10px;font-size:12px;font-weight:600;
                background:${sub.status === 'ativa' ? '#E8F5E9' : '#FFF8E1'};
                color:${sub.status === 'ativa' ? '#2E7D32' : '#F57F17'};">
                ${sub.status === 'ativa' ? 'Ativa' : 'Pausada'}
              </span>
            </div>
            <div style="font-size:13px;color:#555;">
              <p style="margin:2px 0;">Peso: ${sub.produto.peso} | Preço: ${Utils.formatBRL(sub.precoFinal)} (${sub.desconto}% desc.)</p>
              <p style="margin:2px 0;">Frequência: a cada ${sub.frequenciaDias} dias</p>
              <p style="margin:2px 0;">Início: ${Utils.formatDate(sub.dataInicio)}</p>
              <p style="margin:2px 0;">Próxima entrega: ${Utils.formatDate(sub.proximaEntrega)}</p>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    modal.querySelector('.modal-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  }

  /* ------------------------------------------
     PUBLIC API
  ------------------------------------------ */
  return { render };
})();
