/* ============================================
   CLUBE DO NATURAL — Admin Dashboard
   KPIs, gráficos CSS, pedidos recentes, alertas
   ============================================ */

const AdminDashboard = (() => {
  const container = () => document.getElementById('dashboard-content');

  /* ------------------------------------------
     DATA HELPERS
  ------------------------------------------ */
  function getOrders(storeFilter) {
    const orders = Storage.get('orders') || [];
    if (storeFilter && storeFilter !== 'todas') {
      return orders.filter(o => o.loja === storeFilter);
    }
    return orders;
  }

  function getSubscriptions(storeFilter) {
    const subs = Storage.get('subscriptions') || [];
    if (storeFilter && storeFilter !== 'todas') {
      return subs.filter(s => s.loja === storeFilter);
    }
    return subs;
  }

  function isToday(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    return d.getDate() === now.getDate() &&
           d.getMonth() === now.getMonth() &&
           d.getFullYear() === now.getFullYear();
  }

  function daysAgoLabel(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' });
  }

  /* ------------------------------------------
     KPI CALCULATIONS
  ------------------------------------------ */
  function calcKPIs(storeFilter) {
    const orders = getOrders(storeFilter);
    const subs = getSubscriptions(storeFilter);

    // Vendas hoje
    const todayOrders = orders.filter(o => isToday(o.data));
    const vendasHoje = todayOrders.reduce((s, o) => s + o.total, 0);
    const pedidosHoje = todayOrders.length;
    const ticketMedio = pedidosHoje > 0 ? vendasHoje / pedidosHoje : 0;

    // Estoque baixo
    let estoqueBaixo = 0;
    DataProducts.forEach(p => {
      if (!p.estoque || !p.estoqueMinimo) return;
      if (storeFilter && storeFilter !== 'todas') {
        if ((p.estoque[storeFilter] || 0) < p.estoqueMinimo) estoqueBaixo++;
      } else {
        // Sum across all stores
        const total = Object.values(p.estoque).reduce((s, v) => s + v, 0);
        const storeCount = Object.keys(p.estoque).length;
        if (total < p.estoqueMinimo * storeCount) estoqueBaixo++;
      }
    });

    // MRR
    const activeSubs = subs.filter(s => s.status === 'ativa');
    const mrr = activeSubs.reduce((s, sub) => {
      const monthlyMultiplier = 30 / sub.frequenciaDias;
      return s + sub.precoFinal * monthlyMultiplier;
    }, 0);

    const assinaturasAtivas = activeSubs.length;
    const finance = getFinanceKPIs(storeFilter, orders);

    return {
      vendasHoje,
      pedidosHoje,
      ticketMedio,
      estoqueBaixo,
      mrr,
      assinaturasAtivas,
      vendaMinimaDiaria: finance.vendaMinimaDiaria,
      scoreFinanceiro: finance.score,
    };
  }

  function getFinanceKPIs(storeFilter, orders) {
    if (typeof FinanceEngine === 'undefined') {
      return { vendaMinimaDiaria: 0, score: 0 };
    }

    const periodKey = FinanceEngine.getCurrentPeriodKey();
    const fixedCosts = (Storage.get('finance_fixed_costs') || []).filter(entry => entry.periodKey === periodKey);
    const variableCosts = (Storage.get('finance_variable_costs') || []).filter(entry => entry.periodKey === periodKey);
    const caixaData = Storage.get('caixa') || {};
    const caixaSessions = [];

    Object.entries(caixaData).forEach(([storeId, days]) => {
      Object.entries(days || {}).forEach(([dateKey, session]) => {
        caixaSessions.push({ ...session, loja: storeId, dateKey });
      });
    });

    const metrics = FinanceEngine.computeMetrics({
      storeId: storeFilter,
      periodKey,
      orders,
      products: typeof DataProducts !== 'undefined' ? DataProducts : [],
      caixaSessions,
      fixedCosts,
      variableCosts,
    });

    return {
      vendaMinimaDiaria: metrics.vendaMinimaDiaria,
      score: metrics.score,
    };
  }

  /* ------------------------------------------
     SALES CHART DATA (last 7 days)
  ------------------------------------------ */
  function getSalesChartData(storeFilter) {
    const orders = getOrders(storeFilter);
    const days = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayStr = d.toISOString().slice(0, 10);

      const dayOrders = orders.filter(o => o.data.slice(0, 10) === dayStr);
      const total = dayOrders.reduce((s, o) => s + o.total, 0);

      days.push({
        label: d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' }),
        value: total,
      });
    }

    return days;
  }

  /* ------------------------------------------
     TOP 5 PRODUCTS
  ------------------------------------------ */
  function getTop5Products(storeFilter) {
    const orders = getOrders(storeFilter);
    const productCounts = {};

    orders.forEach(o => {
      o.items.forEach(item => {
        if (!productCounts[item.nome]) productCounts[item.nome] = 0;
        productCounts[item.nome] += item.quantidade;
      });
    });

    const sorted = Object.entries(productCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const total = sorted.reduce((s, [, v]) => s + v, 0);
    const colors = ['#2D6A4F', '#40916C', '#52B788', '#74C69D', '#95D5B2'];

    return sorted.map(([nome, count], i) => ({
      nome,
      count,
      percent: total > 0 ? (count / total * 100).toFixed(1) : 0,
      color: colors[i],
    }));
  }

  /* ------------------------------------------
     LOW STOCK ALERTS
  ------------------------------------------ */
  function getLowStockAlerts(storeFilter) {
    const alerts = [];

    DataProducts.forEach(p => {
      if (!p.estoque || !p.estoqueMinimo) return;

      if (storeFilter && storeFilter !== 'todas') {
        const qty = p.estoque[storeFilter] || 0;
        if (qty < p.estoqueMinimo) {
          const storeObj = DataStores.find(s => s.id === storeFilter);
          alerts.push({
            produto: p.nome,
            loja: storeObj ? storeObj.nome.split(' - ')[1] : storeFilter,
            atual: qty,
            minimo: p.estoqueMinimo,
          });
        }
      } else {
        Object.entries(p.estoque).forEach(([lojaId, qty]) => {
          if (qty < p.estoqueMinimo) {
            const storeObj = DataStores.find(s => s.id === lojaId);
            alerts.push({
              produto: p.nome,
              loja: storeObj ? storeObj.nome.split(' - ')[1] : lojaId,
              atual: qty,
              minimo: p.estoqueMinimo,
            });
          }
        });
      }
    });

    // Sort by most critical first
    alerts.sort((a, b) => (a.atual / a.minimo) - (b.atual / b.minimo));
    return alerts.slice(0, 8);
  }

  /* ------------------------------------------
     SUBSCRIPTIONS RENEWING SOON
  ------------------------------------------ */
  function getSubsRenewingSoon(storeFilter) {
    const subs = getSubscriptions(storeFilter).filter(s => s.status === 'ativa');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);
    const dayAfter = new Date();
    dayAfter.setDate(dayAfter.getDate() + 2);
    const dayAfterStr = dayAfter.toISOString().slice(0, 10);

    return subs.filter(s => {
      const next = s.proximaEntrega.slice(0, 10);
      return next === tomorrowStr || next === dayAfterStr;
    });
  }

  /* ------------------------------------------
     RENDER
  ------------------------------------------ */
  async function render(storeFilter) {
    const el = container();
    if (!el) return;

    // Load from Firestore first, fallback to localStorage
    if (typeof FirestoreService !== 'undefined') {
      try {
        FirestoreService.init();
        const fsOrders = await FirestoreService.Orders.getAll();
        if (fsOrders && fsOrders.length > 0) {
          Storage.set('orders', fsOrders);
        }
        const fsSubs = await FirestoreService.Subscriptions.getAll();
        if (fsSubs && fsSubs.length > 0) {
          Storage.set('subscriptions', fsSubs);
        }
      } catch(e) { console.warn('[Dashboard] Firestore load failed:', e.message); }
    }

    const kpis = calcKPIs(storeFilter);
    const chartData = getSalesChartData(storeFilter);
    const top5 = getTop5Products(storeFilter);
    const recentOrders = getOrders(storeFilter).slice(0, 10);
    const lowStock = getLowStockAlerts(storeFilter);
    const renewingSubs = getSubsRenewingSoon(storeFilter);

    el.innerHTML = `
      <!-- KPI Cards -->
      <div class="dashboard-kpis">
        ${renderKPICard('💰', 'Vendas Hoje', Utils.formatBRL(kpis.vendasHoje), 'kpi--vendas')}
        ${renderKPICard('📋', 'Pedidos Hoje', kpis.pedidosHoje, 'kpi--pedidos')}
        ${renderKPICard('🎫', 'Ticket Médio', Utils.formatBRL(kpis.ticketMedio), 'kpi--ticket')}
        ${renderKPICard('⚠️', 'Estoque Baixo', kpis.estoqueBaixo, 'kpi--estoque')}
        ${renderKPICard('🔄', 'MRR', Utils.formatBRL(kpis.mrr), 'kpi--mrr')}
        ${renderKPICard('📦', 'Assinaturas Ativas', kpis.assinaturasAtivas, 'kpi--subs')}
      </div>

      <div class="dashboard-kpis">
        ${renderKPICard('🧮', 'Venda Mín. Dia', Utils.formatBRL(kpis.vendaMinimaDiaria), 'kpi--ticket')}
        ${renderKPICard('🩺', 'Score Financeiro', kpis.scoreFinanceiro, 'kpi--subs')}
      </div>

      <!-- Charts Row -->
      <div class="dashboard-charts">
        <!-- Bar Chart: Sales Last 7 Days -->
        <section class="dashboard-card dashboard-card--chart">
          <h3 class="dashboard-card__title">Vendas nos Últimos 7 Dias</h3>
          <div class="bar-chart">
            ${renderBarChart(chartData)}
          </div>
        </section>

        <!-- Donut: Top 5 Products -->
        <section class="dashboard-card dashboard-card--donut">
          <h3 class="dashboard-card__title">Top 5 Produtos</h3>
          ${renderDonutChart(top5)}
        </section>
      </div>

      <!-- Bottom Row -->
      <div class="dashboard-bottom">
        <!-- Recent Orders -->
        <section class="dashboard-card dashboard-card--orders">
          <h3 class="dashboard-card__title">Pedidos Recentes</h3>
          ${renderRecentOrders(recentOrders)}
        </section>

        <!-- Alerts -->
        <section class="dashboard-card dashboard-card--alerts">
          <h3 class="dashboard-card__title">Alertas</h3>
          ${renderAlerts(lowStock, renewingSubs)}
        </section>
      </div>
    `;
  }

  /* ------------------------------------------
     RENDER HELPERS
  ------------------------------------------ */
  function renderKPICard(icon, label, value, extraClass) {
    return `
      <article class="kpi-card ${extraClass || ''}">
        <div class="kpi-card__icon">${icon}</div>
        <div class="kpi-card__info">
          <span class="kpi-card__value">${value}</span>
          <span class="kpi-card__label">${label}</span>
        </div>
      </article>
    `;
  }

  function renderBarChart(data) {
    const maxVal = Math.max(...data.map(d => d.value), 1);

    return `
      <div class="bar-chart__bars">
        ${data.map(d => {
          const heightPercent = (d.value / maxVal * 100).toFixed(1);
          return `
            <div class="bar-chart__col">
              <div class="bar-chart__value">${Utils.formatBRL(d.value)}</div>
              <div class="bar-chart__bar" style="height: ${heightPercent}%"></div>
              <div class="bar-chart__label">${d.label}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderDonutChart(top5) {
    if (top5.length === 0) {
      return '<p class="dashboard-empty">Sem dados de vendas ainda</p>';
    }

    // Build conic-gradient
    let gradientParts = [];
    let cumulative = 0;
    top5.forEach(item => {
      const start = cumulative;
      cumulative += parseFloat(item.percent);
      gradientParts.push(`${item.color} ${start}% ${cumulative}%`);
    });
    // Fill remainder with light gray
    if (cumulative < 100) {
      gradientParts.push(`#e0e0e0 ${cumulative}% 100%`);
    }

    const gradient = `conic-gradient(${gradientParts.join(', ')})`;

    return `
      <div class="donut-chart">
        <div class="donut-chart__ring" style="background: ${gradient}">
          <div class="donut-chart__hole"></div>
        </div>
        <ul class="donut-chart__legend">
          ${top5.map(item => `
            <li class="donut-chart__legend-item">
              <span class="donut-chart__legend-color" style="background: ${item.color}"></span>
              <span class="donut-chart__legend-name">${item.nome}</span>
              <span class="donut-chart__legend-value">${item.count} un (${item.percent}%)</span>
            </li>
          `).join('')}
        </ul>
      </div>
    `;
  }

  function renderRecentOrders(orders) {
    if (orders.length === 0) {
      return '<p class="dashboard-empty">Nenhum pedido encontrado</p>';
    }

    const statusLabels = {
      pendente: 'Pendente',
      preparando: 'Preparando',
      pronto: 'Pronto',
      entregue: 'Entregue',
      cancelado: 'Cancelado',
    };

    const statusClasses = {
      pendente: 'status--pendente',
      preparando: 'status--preparando',
      pronto: 'status--pronto',
      entregue: 'status--entregue',
      cancelado: 'status--cancelado',
    };

    return `
      <div class="table-responsive">
        <table class="admin-table admin-table--compact">
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Cliente</th>
              <th>Total</th>
              <th>Status</th>
              <th>Data</th>
            </tr>
          </thead>
          <tbody>
            ${orders.map(o => `
              <tr>
                <td><strong>${o.numero}</strong></td>
                <td>${o.cliente.nome}</td>
                <td>${Utils.formatBRL(o.total)}</td>
                <td><span class="status-badge ${statusClasses[o.status] || ''}">${statusLabels[o.status] || o.status}</span></td>
                <td>${Utils.formatDateTime(o.data)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderAlerts(lowStock, renewingSubs) {
    let html = '';

    // Low stock alerts
    if (lowStock.length > 0) {
      html += `
        <div class="alert-section">
          <h4 class="alert-section__title">⚠️ Estoque Baixo</h4>
          <ul class="alert-list">
            ${lowStock.map(a => `
              <li class="alert-item alert-item--warning">
                <span class="alert-item__text">
                  <strong>${a.produto}</strong> — ${a.loja}:
                  ${a.atual} un (mín. ${a.minimo})
                </span>
              </li>
            `).join('')}
          </ul>
        </div>
      `;
    }

    // Subscriptions renewing tomorrow
    if (renewingSubs.length > 0) {
      html += `
        <div class="alert-section">
          <h4 class="alert-section__title">🔄 Assinaturas Renovando em Breve</h4>
          <ul class="alert-list">
            ${renewingSubs.map(s => `
              <li class="alert-item alert-item--info">
                <span class="alert-item__text">
                  <strong>${s.cliente.nome}</strong> — ${s.produto.nome} (${s.produto.peso})
                  <br>Próxima entrega: ${Utils.formatDate(s.proximaEntrega)}
                </span>
              </li>
            `).join('')}
          </ul>
        </div>
      `;
    }

    if (!html) {
      html = '<p class="dashboard-empty">Nenhum alerta no momento</p>';
    }

    return html;
  }

  /* ------------------------------------------
     PUBLIC API
  ------------------------------------------ */
  return {
    render,
  };
})();
