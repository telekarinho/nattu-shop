/* ============================================
   CLUBE DO NATURAL — Admin Relatórios
   Vendas, Financeiro, Estoque, Clientes, Ranking
   ============================================ */

const AdminRelatorios = (() => {
  const container = () => document.getElementById('relatorios-content');

  let currentStoreFilter = 'todas';
  let activeTab = 'vendas';
  let dateFrom = '';
  let dateTo = '';

  const TABS = [
    { id: 'vendas', label: 'Vendas', icon: '💰' },
    { id: 'financeiro', label: 'Financeiro', icon: '📊' },
    { id: 'estoque', label: 'Estoque', icon: '📦' },
    { id: 'clientes', label: 'Clientes', icon: '👤' },
    { id: 'ranking', label: 'Ranking', icon: '🏆' },
  ];

  /* ------------------------------------------
     DATA HELPERS
  ------------------------------------------ */
  function getOrders() {
    let orders = Storage.get('orders') || [];
    if (currentStoreFilter && currentStoreFilter !== 'todas') {
      orders = orders.filter(o => o.loja === currentStoreFilter);
    }
    if (dateFrom) {
      const from = new Date(dateFrom + 'T00:00:00');
      orders = orders.filter(o => new Date(o.data) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo + 'T23:59:59');
      orders = orders.filter(o => new Date(o.data) <= to);
    }
    return orders;
  }

  function getCaixaData() {
    return Storage.get('caixa') || {};
  }

  function getStoreLabel(lojaId) {
    const store = DataStores.find(s => s.id === lojaId);
    return store ? store.nome.split(' - ')[1] || store.nome : lojaId;
  }

  function exportCSV(headers, rows, filename) {
    const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    navigator.clipboard.writeText(csv).then(() => {
      Toast.success(`${filename} copiado para a área de transferência (CSV)`);
    }).catch(() => {
      // Fallback: download
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename + '.csv';
      a.click();
      URL.revokeObjectURL(url);
      Toast.success(`${filename}.csv baixado`);
    });
  }

  /* ------------------------------------------
     RENDER
  ------------------------------------------ */
  function render(storeFilter) {
    const el = container();
    if (!el) return;

    currentStoreFilter = storeFilter || 'todas';

    // Set default date range if empty (last 30 days)
    if (!dateFrom) {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      dateFrom = d.toISOString().slice(0, 10);
    }
    if (!dateTo) {
      dateTo = new Date().toISOString().slice(0, 10);
    }

    el.innerHTML = `
      <style>
        .rel-tabs {
          display:flex;gap:4px;margin-bottom:16px;flex-wrap:wrap;
        }
        .rel-tab {
          padding:10px 20px;border:1px solid #ddd;border-radius:8px;background:#fff;
          cursor:pointer;font-size:14px;font-weight:500;transition:all 0.2s;
        }
        .rel-tab:hover { background:#f0f0f0; }
        .rel-tab--active {
          background:#2D6A4F;color:#fff;border-color:#2D6A4F;
        }
        .rel-filters {
          display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:20px;
        }
        .rel-filters input[type="date"] {
          padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;background:#fff;
        }
        .rel-export-btn {
          background:#1B4332;color:#fff;border:none;padding:8px 16px;border-radius:8px;
          cursor:pointer;font-size:13px;font-weight:600;white-space:nowrap;
        }
        .rel-export-btn:hover { background:#0d2b1f; }
        .rel-summary {
          display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px;
        }
        .rel-summary-card {
          background:#fff;border-radius:10px;padding:14px;box-shadow:0 2px 6px rgba(0,0,0,0.06);text-align:center;
        }
        .rel-summary-value { font-size:22px;font-weight:700;color:#2D6A4F; }
        .rel-summary-label { font-size:12px;color:#888;margin-top:2px; }
        .rel-bar-chart {
          display:flex;align-items:flex-end;gap:6px;height:200px;padding:10px 0;margin-bottom:16px;
        }
        .rel-bar-col { flex:1;display:flex;flex-direction:column;align-items:center; }
        .rel-bar-value { font-size:10px;color:#888;margin-bottom:4px;white-space:nowrap; }
        .rel-bar-bar { width:100%;max-width:50px;background:#2D6A4F;border-radius:4px 4px 0 0;min-height:2px;transition:height 0.3s; }
        .rel-bar-label { font-size:10px;color:#666;margin-top:4px;text-align:center; }
      </style>

      <!-- Tabs -->
      <div class="rel-tabs">
        ${TABS.map(t => `
          <button class="rel-tab ${activeTab === t.id ? 'rel-tab--active' : ''}" data-tab="${t.id}">
            ${t.icon} ${t.label}
          </button>
        `).join('')}
      </div>

      <!-- Filters -->
      <div class="rel-filters">
        <label style="font-size:13px;color:#555;">De:</label>
        <input type="date" class="rel-date-from" value="${dateFrom}">
        <label style="font-size:13px;color:#555;">Até:</label>
        <input type="date" class="rel-date-to" value="${dateTo}">
        <button class="rel-export-btn" id="btn-export">Exportar CSV</button>
      </div>

      <!-- Report Content -->
      <div id="rel-report-content"></div>
    `;

    // Bind tab clicks
    el.querySelectorAll('.rel-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        activeTab = tab.dataset.tab;
        render(currentStoreFilter);
      });
    });

    // Date filters
    el.querySelector('.rel-date-from').addEventListener('change', (e) => {
      dateFrom = e.target.value;
      renderReport();
    });
    el.querySelector('.rel-date-to').addEventListener('change', (e) => {
      dateTo = e.target.value;
      renderReport();
    });

    // Export
    el.querySelector('#btn-export').addEventListener('click', () => handleExport());

    renderReport();
  }

  function renderReport() {
    const reportEl = document.getElementById('rel-report-content');
    if (!reportEl) return;

    switch (activeTab) {
      case 'vendas': renderVendas(reportEl); break;
      case 'financeiro': renderFinanceiro(reportEl); break;
      case 'estoque': renderEstoque(reportEl); break;
      case 'clientes': renderClientes(reportEl); break;
      case 'ranking': renderRanking(reportEl); break;
    }
  }

  /* ------------------------------------------
     VENDAS REPORT
  ------------------------------------------ */
  function renderVendas(el) {
    const orders = getOrders();

    // Group by date
    const byDate = {};
    orders.forEach(o => {
      const day = o.data.slice(0, 10);
      if (!byDate[day]) byDate[day] = { count: 0, total: 0 };
      byDate[day].count++;
      byDate[day].total += o.total;
    });

    const dates = Object.keys(byDate).sort();
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((s, o) => s + o.total, 0);
    const ticketMedio = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Chart data (last entries or all)
    const chartDates = dates.slice(-15);
    const maxVal = Math.max(...chartDates.map(d => byDate[d].total), 1);

    el.innerHTML = `
      <!-- Summary -->
      <div class="rel-summary">
        <div class="rel-summary-card">
          <div class="rel-summary-value">${totalOrders}</div>
          <div class="rel-summary-label">Total Pedidos</div>
        </div>
        <div class="rel-summary-card">
          <div class="rel-summary-value">${Utils.formatBRL(totalRevenue)}</div>
          <div class="rel-summary-label">Receita Total</div>
        </div>
        <div class="rel-summary-card">
          <div class="rel-summary-value">${Utils.formatBRL(ticketMedio)}</div>
          <div class="rel-summary-label">Ticket Médio</div>
        </div>
      </div>

      <!-- Bar Chart -->
      <div style="background:#fff;border-radius:10px;padding:16px;box-shadow:0 2px 6px rgba(0,0,0,0.06);margin-bottom:20px;">
        <h4 style="margin:0 0 12px;font-size:14px;color:#1B4332;">Vendas por Dia</h4>
        <div class="rel-bar-chart">
          ${chartDates.map(d => {
            const heightPct = (byDate[d].total / maxVal * 100).toFixed(1);
            return `
              <div class="rel-bar-col">
                <div class="rel-bar-value">${Utils.formatBRL(byDate[d].total)}</div>
                <div class="rel-bar-bar" style="height:${heightPct}%"></div>
                <div class="rel-bar-label">${d.slice(5)}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Table -->
      <div style="background:#fff;border-radius:10px;padding:16px;box-shadow:0 2px 6px rgba(0,0,0,0.06);">
        <div class="table-responsive">
          <table class="admin-table admin-table--compact" style="font-size:13px;">
            <thead>
              <tr><th>Data</th><th>Pedidos</th><th>Valor Total</th><th>Ticket Médio</th></tr>
            </thead>
            <tbody>
              ${dates.map(d => `
                <tr>
                  <td>${Utils.formatDate(d)}</td>
                  <td>${byDate[d].count}</td>
                  <td>${Utils.formatBRL(byDate[d].total)}</td>
                  <td>${Utils.formatBRL(byDate[d].count > 0 ? byDate[d].total / byDate[d].count : 0)}</td>
                </tr>
              `).join('')}
              <tr style="font-weight:700;border-top:2px solid #1B4332;">
                <td>TOTAL</td>
                <td>${totalOrders}</td>
                <td>${Utils.formatBRL(totalRevenue)}</td>
                <td>${Utils.formatBRL(ticketMedio)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  /* ------------------------------------------
     FINANCEIRO REPORT
  ------------------------------------------ */
  function renderFinanceiro(el) {
    const orders = getOrders();
    const caixaData = getCaixaData();

    // Revenue from orders
    const receita = orders.reduce((s, o) => s + o.total, 0);

    // Expenses from caixa
    let despesas = 0;
    const storeIds = (currentStoreFilter && currentStoreFilter !== 'todas')
      ? [currentStoreFilter]
      : DataStores.map(s => s.id);

    const expensesByCategory = {};
    storeIds.forEach(storeId => {
      const storeData = caixaData[storeId] || {};
      Object.entries(storeData).forEach(([dateKey, dayData]) => {
        if (dateFrom && dateKey < dateFrom) return;
        if (dateTo && dateKey > dateTo) return;
        (dayData.movimentos || []).forEach(m => {
          if (m.tipo === 'saida') {
            despesas += m.valor;
            const cat = m.categoria || 'Outro';
            expensesByCategory[cat] = (expensesByCategory[cat] || 0) + m.valor;
          }
        });
      });
    });

    const lucro = receita - despesas;

    // Average margin from products in orders
    let totalMarginWeighted = 0;
    let totalRevenueForMargin = 0;
    orders.forEach(o => {
      o.items.forEach(item => {
        const product = DataProducts.find(p => p.id === item.productId);
        if (product && product.custoUnitario) {
          const itemRevenue = item.preco * item.quantidade;
          const itemCost = product.custoUnitario * item.quantidade;
          totalMarginWeighted += (itemRevenue - itemCost);
          totalRevenueForMargin += itemRevenue;
        }
      });
    });
    const margemMedia = totalRevenueForMargin > 0 ? (totalMarginWeighted / totalRevenueForMargin * 100) : 0;

    el.innerHTML = `
      <div class="rel-summary">
        <div class="rel-summary-card">
          <div class="rel-summary-value" style="color:#2E7D32;">${Utils.formatBRL(receita)}</div>
          <div class="rel-summary-label">Receita</div>
        </div>
        <div class="rel-summary-card">
          <div class="rel-summary-value" style="color:#C62828;">${Utils.formatBRL(despesas)}</div>
          <div class="rel-summary-label">Despesas</div>
        </div>
        <div class="rel-summary-card">
          <div class="rel-summary-value" style="color:${lucro >= 0 ? '#2E7D32' : '#C62828'};">${Utils.formatBRL(lucro)}</div>
          <div class="rel-summary-label">Lucro Líquido</div>
        </div>
        <div class="rel-summary-card">
          <div class="rel-summary-value">${margemMedia.toFixed(1)}%</div>
          <div class="rel-summary-label">Margem Média</div>
        </div>
      </div>

      <!-- Expenses by category -->
      <div style="background:#fff;border-radius:10px;padding:16px;box-shadow:0 2px 6px rgba(0,0,0,0.06);margin-bottom:20px;">
        <h4 style="margin:0 0 12px;font-size:14px;color:#1B4332;">Despesas por Categoria</h4>
        ${Object.keys(expensesByCategory).length === 0
          ? '<p style="color:#999;text-align:center;padding:16px;">Nenhuma despesa registrada no período</p>'
          : `
            <div class="table-responsive">
              <table class="admin-table admin-table--compact" style="font-size:13px;">
                <thead><tr><th>Categoria</th><th>Valor</th><th>% do Total</th></tr></thead>
                <tbody>
                  ${Object.entries(expensesByCategory)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cat, val]) => `
                      <tr>
                        <td>${cat}</td>
                        <td>${Utils.formatBRL(val)}</td>
                        <td>${despesas > 0 ? (val / despesas * 100).toFixed(1) : 0}%</td>
                      </tr>
                    `).join('')}
                  <tr style="font-weight:700;border-top:2px solid #C62828;">
                    <td>TOTAL</td>
                    <td>${Utils.formatBRL(despesas)}</td>
                    <td>100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          `
        }
      </div>

      <!-- Revenue vs Expenses summary -->
      <div style="background:#fff;border-radius:10px;padding:16px;box-shadow:0 2px 6px rgba(0,0,0,0.06);">
        <h4 style="margin:0 0 12px;font-size:14px;color:#1B4332;">Resumo Financeiro</h4>
        <div class="table-responsive">
          <table class="admin-table admin-table--compact" style="font-size:13px;">
            <tbody>
              <tr><td>Receita de Vendas</td><td style="text-align:right;color:#2E7D32;font-weight:700;">+ ${Utils.formatBRL(receita)}</td></tr>
              <tr><td>Despesas Operacionais</td><td style="text-align:right;color:#C62828;font-weight:700;">- ${Utils.formatBRL(despesas)}</td></tr>
              <tr style="border-top:2px solid #333;font-size:15px;">
                <td><strong>Lucro Líquido</strong></td>
                <td style="text-align:right;font-weight:700;color:${lucro >= 0 ? '#2E7D32' : '#C62828'};">${Utils.formatBRL(lucro)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  /* ------------------------------------------
     ESTOQUE REPORT
  ------------------------------------------ */
  function renderEstoque(el) {
    const orders = getOrders();

    // Stock status counts
    let ok = 0, baixo = 0, zerado = 0;
    const productStock = [];

    DataProducts.filter(p => p.ativo !== false).forEach(p => {
      if (!p.estoque) return;

      let totalStock;
      if (currentStoreFilter && currentStoreFilter !== 'todas') {
        totalStock = p.estoque[currentStoreFilter] || 0;
      } else {
        totalStock = Object.values(p.estoque).reduce((s, v) => s + v, 0);
      }

      const min = p.estoqueMinimo || 0;
      let status = 'ok';
      if (totalStock === 0) { zerado++; status = 'zerado'; }
      else if (totalStock <= min) { baixo++; status = 'baixo'; }
      else { ok++; }

      // Sales in period
      let salesQty = 0;
      orders.forEach(o => {
        o.items.forEach(it => {
          if (it.productId === p.id) salesQty += it.quantidade;
        });
      });

      // Giro = sales / stock
      const giro = totalStock > 0 ? (salesQty / totalStock) : 0;

      productStock.push({
        id: p.id,
        nome: p.nome,
        estoque: totalStock,
        minimo: min,
        vendas: salesQty,
        giro,
        status,
      });
    });

    // Products with 0 sales
    const parados = productStock.filter(p => p.vendas === 0);

    // Sort by giro desc
    productStock.sort((a, b) => b.giro - a.giro);

    const statusColors = {
      ok: { bg: '#E8F5E9', color: '#2E7D32' },
      baixo: { bg: '#FFF8E1', color: '#F57F17' },
      zerado: { bg: '#FFEBEE', color: '#C62828' },
    };

    el.innerHTML = `
      <div class="rel-summary">
        <div class="rel-summary-card">
          <div class="rel-summary-value" style="color:#2E7D32;">${ok}</div>
          <div class="rel-summary-label">Estoque OK</div>
        </div>
        <div class="rel-summary-card">
          <div class="rel-summary-value" style="color:#F57F17;">${baixo}</div>
          <div class="rel-summary-label">Estoque Baixo</div>
        </div>
        <div class="rel-summary-card">
          <div class="rel-summary-value" style="color:#C62828;">${zerado}</div>
          <div class="rel-summary-label">Estoque Zerado</div>
        </div>
        <div class="rel-summary-card">
          <div class="rel-summary-value">${parados.length}</div>
          <div class="rel-summary-label">Produtos Parados</div>
        </div>
      </div>

      <!-- Giro de Estoque -->
      <div style="background:#fff;border-radius:10px;padding:16px;box-shadow:0 2px 6px rgba(0,0,0,0.06);margin-bottom:20px;">
        <h4 style="margin:0 0 12px;font-size:14px;color:#1B4332;">Giro de Estoque (Vendas / Estoque)</h4>
        <div class="table-responsive">
          <table class="admin-table admin-table--compact" style="font-size:13px;">
            <thead>
              <tr><th>Produto</th><th>Estoque</th><th>Mínimo</th><th>Vendas no Período</th><th>Giro</th><th>Status</th></tr>
            </thead>
            <tbody>
              ${productStock.slice(0, 20).map(p => {
                const sc = statusColors[p.status];
                return `
                  <tr>
                    <td><strong>${p.nome}</strong></td>
                    <td>${p.estoque}</td>
                    <td>${p.minimo}</td>
                    <td>${p.vendas}</td>
                    <td>${p.giro.toFixed(2)}</td>
                    <td><span style="display:inline-block;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:600;background:${sc.bg};color:${sc.color};">${p.status.toUpperCase()}</span></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      ${parados.length > 0 ? `
        <div style="background:#fff;border-radius:10px;padding:16px;box-shadow:0 2px 6px rgba(0,0,0,0.06);">
          <h4 style="margin:0 0 12px;font-size:14px;color:#C62828;">Produtos Parados (0 vendas no período)</h4>
          <div style="display:flex;flex-wrap:wrap;gap:6px;">
            ${parados.map(p => `
              <span style="display:inline-block;padding:4px 12px;border-radius:8px;font-size:12px;background:#FFEBEE;color:#C62828;">${p.nome} (${p.estoque} un)</span>
            `).join('')}
          </div>
        </div>
      ` : ''}
    `;
  }

  /* ------------------------------------------
     CLIENTES REPORT
  ------------------------------------------ */
  function renderClientes(el) {
    const orders = getOrders();
    const customerMap = {};

    orders.forEach(o => {
      const phone = o.cliente.celular.replace(/\D/g, '');
      if (!phone) return;
      if (!customerMap[phone]) {
        customerMap[phone] = { nome: o.cliente.nome, pedidos: 0, total: 0, firstOrder: o.data };
      }
      customerMap[phone].pedidos++;
      customerMap[phone].total += o.total;
      if (new Date(o.data) < new Date(customerMap[phone].firstOrder)) {
        customerMap[phone].firstOrder = o.data;
      }
    });

    const customers = Object.values(customerMap);
    const total = customers.length;
    const returning = customers.filter(c => c.pedidos >= 2).length;
    const newOnes = total - returning;
    const topCustomers = [...customers].sort((a, b) => b.total - a.total).slice(0, 10);

    // Frequency analysis
    const freq1 = customers.filter(c => c.pedidos === 1).length;
    const freq2_3 = customers.filter(c => c.pedidos >= 2 && c.pedidos <= 3).length;
    const freq4_6 = customers.filter(c => c.pedidos >= 4 && c.pedidos <= 6).length;
    const freq7plus = customers.filter(c => c.pedidos >= 7).length;

    el.innerHTML = `
      <div class="rel-summary">
        <div class="rel-summary-card">
          <div class="rel-summary-value" style="color:#1B4332;">${total}</div>
          <div class="rel-summary-label">Total Clientes</div>
        </div>
        <div class="rel-summary-card">
          <div class="rel-summary-value" style="color:#1565C0;">${newOnes}</div>
          <div class="rel-summary-label">Compraram 1x</div>
        </div>
        <div class="rel-summary-card">
          <div class="rel-summary-value" style="color:#2E7D32;">${returning}</div>
          <div class="rel-summary-label">Recorrentes (2+)</div>
        </div>
        <div class="rel-summary-card">
          <div class="rel-summary-value">${total > 0 ? (returning / total * 100).toFixed(1) : 0}%</div>
          <div class="rel-summary-label">Taxa de Retorno</div>
        </div>
      </div>

      <!-- Frequency Analysis -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
        <div style="background:#fff;border-radius:10px;padding:16px;box-shadow:0 2px 6px rgba(0,0,0,0.06);">
          <h4 style="margin:0 0 12px;font-size:14px;color:#1B4332;">Frequência de Compra</h4>
          <div style="font-size:13px;">
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f0f0;">
              <span>1 pedido</span>
              <strong>${freq1} clientes</strong>
            </div>
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f0f0;">
              <span>2-3 pedidos</span>
              <strong>${freq2_3} clientes</strong>
            </div>
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f0f0;">
              <span>4-6 pedidos</span>
              <strong>${freq4_6} clientes</strong>
            </div>
            <div style="display:flex;justify-content:space-between;padding:8px 0;">
              <span>7+ pedidos</span>
              <strong>${freq7plus} clientes</strong>
            </div>
          </div>
        </div>

        <!-- Top Customers -->
        <div style="background:#fff;border-radius:10px;padding:16px;box-shadow:0 2px 6px rgba(0,0,0,0.06);">
          <h4 style="margin:0 0 12px;font-size:14px;color:#1B4332;">Top 10 Clientes por Valor</h4>
          <div class="table-responsive">
            <table class="admin-table admin-table--compact" style="font-size:12px;">
              <thead><tr><th>#</th><th>Nome</th><th>Pedidos</th><th>Total</th></tr></thead>
              <tbody>
                ${topCustomers.map((c, i) => `
                  <tr>
                    <td>${i + 1}</td>
                    <td>${c.nome}</td>
                    <td>${c.pedidos}</td>
                    <td>${Utils.formatBRL(c.total)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  /* ------------------------------------------
     RANKING REPORT
  ------------------------------------------ */
  function renderRanking(el) {
    const orders = getOrders();

    // Top products by revenue
    const productRevenue = {};
    const productQty = {};
    orders.forEach(o => {
      o.items.forEach(item => {
        if (!productRevenue[item.nome]) { productRevenue[item.nome] = 0; productQty[item.nome] = 0; }
        productRevenue[item.nome] += item.preco * item.quantidade;
        productQty[item.nome] += item.quantidade;
      });
    });

    const topProducts = Object.entries(productRevenue)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([nome, revenue], i) => ({ pos: i + 1, nome, revenue, qty: productQty[nome] }));

    // Top stores by revenue
    const storeRevenue = {};
    orders.forEach(o => {
      if (!storeRevenue[o.loja]) storeRevenue[o.loja] = 0;
      storeRevenue[o.loja] += o.total;
    });

    const topStores = Object.entries(storeRevenue)
      .sort((a, b) => b[1] - a[1])
      .map(([lojaId, revenue], i) => ({ pos: i + 1, loja: getStoreLabel(lojaId), revenue }));

    // Top employees (by orders if tracking exists)
    const employeeData = [];
    const allEmployees = Storage.get('employees') || DataEmployees;
    // Basic: count orders per store and attribute to employees at that store
    allEmployees.forEach(emp => {
      if (emp.cargo === 'atendente' || emp.cargo === 'gerente') {
        const empOrders = emp.loja
          ? orders.filter(o => o.loja === emp.loja).length
          : orders.length;
        employeeData.push({ nome: emp.nome, cargo: emp.cargo, pedidos: empOrders });
      }
    });
    employeeData.sort((a, b) => b.pedidos - a.pedidos);

    el.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <!-- Top Products -->
        <div style="background:#fff;border-radius:10px;padding:16px;box-shadow:0 2px 6px rgba(0,0,0,0.06);">
          <h4 style="margin:0 0 12px;font-size:14px;color:#1B4332;">Top 10 Produtos por Receita</h4>
          ${topProducts.length === 0
            ? '<p style="color:#999;text-align:center;padding:16px;">Sem dados</p>'
            : `
              <div class="table-responsive">
                <table class="admin-table admin-table--compact" style="font-size:12px;">
                  <thead><tr><th>#</th><th>Produto</th><th>Qtd</th><th>Receita</th></tr></thead>
                  <tbody>
                    ${topProducts.map(p => `
                      <tr>
                        <td style="font-weight:700;color:${p.pos <= 3 ? '#F57F17' : '#555'};">${p.pos}</td>
                        <td>${p.nome}</td>
                        <td>${p.qty}</td>
                        <td>${Utils.formatBRL(p.revenue)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `
          }
        </div>

        <!-- Top Stores -->
        <div style="background:#fff;border-radius:10px;padding:16px;box-shadow:0 2px 6px rgba(0,0,0,0.06);">
          <h4 style="margin:0 0 12px;font-size:14px;color:#1B4332;">Ranking de Lojas</h4>
          ${topStores.length === 0
            ? '<p style="color:#999;text-align:center;padding:16px;">Sem dados</p>'
            : `
              <div class="table-responsive">
                <table class="admin-table admin-table--compact" style="font-size:12px;">
                  <thead><tr><th>#</th><th>Loja</th><th>Receita</th></tr></thead>
                  <tbody>
                    ${topStores.map(s => `
                      <tr>
                        <td style="font-weight:700;color:${s.pos <= 3 ? '#F57F17' : '#555'};">${s.pos}</td>
                        <td>${s.loja}</td>
                        <td>${Utils.formatBRL(s.revenue)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `
          }
        </div>

        <!-- Top Employees -->
        <div style="grid-column:1/-1;background:#fff;border-radius:10px;padding:16px;box-shadow:0 2px 6px rgba(0,0,0,0.06);">
          <h4 style="margin:0 0 12px;font-size:14px;color:#1B4332;">Funcionários (por pedidos da loja)</h4>
          ${employeeData.length === 0
            ? '<p style="color:#999;text-align:center;padding:16px;">Sem dados</p>'
            : `
              <div class="table-responsive">
                <table class="admin-table admin-table--compact" style="font-size:12px;">
                  <thead><tr><th>#</th><th>Nome</th><th>Cargo</th><th>Pedidos</th></tr></thead>
                  <tbody>
                    ${employeeData.slice(0, 10).map((e, i) => `
                      <tr>
                        <td style="font-weight:700;">${i + 1}</td>
                        <td>${e.nome}</td>
                        <td>${e.cargo}</td>
                        <td>${e.pedidos}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `
          }
        </div>
      </div>
    `;
  }

  /* ------------------------------------------
     EXPORT HANDLER
  ------------------------------------------ */
  function handleExport() {
    const orders = getOrders();

    switch (activeTab) {
      case 'vendas': {
        const byDate = {};
        orders.forEach(o => {
          const day = o.data.slice(0, 10);
          if (!byDate[day]) byDate[day] = { count: 0, total: 0 };
          byDate[day].count++;
          byDate[day].total += o.total;
        });
        const headers = ['Data', 'Pedidos', 'Valor Total', 'Ticket Médio'];
        const rows = Object.keys(byDate).sort().map(d => [
          d, byDate[d].count, byDate[d].total.toFixed(2),
          (byDate[d].count > 0 ? byDate[d].total / byDate[d].count : 0).toFixed(2),
        ]);
        exportCSV(headers, rows, 'relatorio-vendas');
        break;
      }
      case 'financeiro': {
        const receita = orders.reduce((s, o) => s + o.total, 0);
        const headers = ['Tipo', 'Valor'];
        const rows = [['Receita', receita.toFixed(2)]];
        exportCSV(headers, rows, 'relatorio-financeiro');
        break;
      }
      case 'estoque': {
        const headers = ['Produto', 'Estoque', 'Mínimo', 'Status'];
        const rows = DataProducts.filter(p => p.ativo !== false && p.estoque).map(p => {
          let total;
          if (currentStoreFilter && currentStoreFilter !== 'todas') {
            total = p.estoque[currentStoreFilter] || 0;
          } else {
            total = Object.values(p.estoque).reduce((s, v) => s + v, 0);
          }
          const min = p.estoqueMinimo || 0;
          const status = total === 0 ? 'ZERADO' : total <= min ? 'BAIXO' : 'OK';
          return [p.nome, total, min, status];
        });
        exportCSV(headers, rows, 'relatorio-estoque');
        break;
      }
      case 'clientes': {
        const map = {};
        orders.forEach(o => {
          const phone = o.cliente.celular.replace(/\D/g, '');
          if (!phone) return;
          if (!map[phone]) map[phone] = { nome: o.cliente.nome, celular: o.cliente.celular, pedidos: 0, total: 0 };
          map[phone].pedidos++;
          map[phone].total += o.total;
        });
        const headers = ['Nome', 'Celular', 'Pedidos', 'Total Gasto'];
        const rows = Object.values(map)
          .sort((a, b) => b.total - a.total)
          .map(c => [c.nome, c.celular, c.pedidos, c.total.toFixed(2)]);
        exportCSV(headers, rows, 'relatorio-clientes');
        break;
      }
      case 'ranking': {
        const productRevenue = {};
        orders.forEach(o => {
          o.items.forEach(item => {
            if (!productRevenue[item.nome]) productRevenue[item.nome] = 0;
            productRevenue[item.nome] += item.preco * item.quantidade;
          });
        });
        const headers = ['Posição', 'Produto', 'Receita'];
        const rows = Object.entries(productRevenue)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([nome, revenue], i) => [i + 1, nome, revenue.toFixed(2)]);
        exportCSV(headers, rows, 'relatorio-ranking');
        break;
      }
    }
  }

  /* ------------------------------------------
     PUBLIC API
  ------------------------------------------ */
  return { render };
})();
