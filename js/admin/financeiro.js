/* ============================================
   CLUBE DO NATURAL - Admin Financeiro
   Fase 1: DRE gerencial, custos, break-even
   ============================================ */

const FinanceEngine = (() => {
  const FIXED_CATEGORIES = [
    { id: 'aluguel', label: 'Aluguel', mandatory: true },
    { id: 'condominio', label: 'Condominio', mandatory: false },
    { id: 'energia', label: 'Energia', mandatory: true },
    { id: 'agua', label: 'Agua', mandatory: true },
    { id: 'internet', label: 'Internet', mandatory: true },
    { id: 'folha_adm', label: 'Folha administrativa', mandatory: true },
    { id: 'pro_labore', label: 'Pro-labore', mandatory: true },
    { id: 'marketing', label: 'Marketing local', mandatory: true },
    { id: 'contador', label: 'Contador', mandatory: true },
    { id: 'manutencao', label: 'Manutencao', mandatory: true },
    { id: 'seguros', label: 'Seguros', mandatory: false },
    { id: 'royalties', label: 'Royalties / taxa franquia', mandatory: true },
    { id: 'software', label: 'Software', mandatory: false },
    { id: 'juros', label: 'Juros / parcelamentos', mandatory: false },
  ];

  const VARIABLE_CATEGORIES = [
    { id: 'compras_mercadoria', label: 'Compras de mercadoria', mandatory: true },
    { id: 'taxas_financeiras', label: 'Taxas financeiras', mandatory: true },
    { id: 'apps_delivery', label: 'Apps / delivery', mandatory: true },
    { id: 'comissoes', label: 'Comissoes', mandatory: false },
    { id: 'embalagens', label: 'Embalagens', mandatory: true },
    { id: 'impostos_variaveis', label: 'Impostos variaveis', mandatory: true },
    { id: 'frete', label: 'Frete / entregadores', mandatory: false },
    { id: 'perdas', label: 'Perdas e estornos', mandatory: true },
    { id: 'despesa_esporadica', label: 'Despesa esporadica', mandatory: false },
    { id: 'outros_variaveis', label: 'Outros variaveis', mandatory: false },
  ];

  const FIXED_CATEGORY_MAP = Object.fromEntries(FIXED_CATEGORIES.map(cat => [cat.id, cat]));
  const VARIABLE_CATEGORY_MAP = Object.fromEntries(VARIABLE_CATEGORIES.map(cat => [cat.id, cat]));

  function getCurrentPeriodKey(referenceDate = new Date()) {
    const year = referenceDate.getFullYear();
    const month = String(referenceDate.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  function getPeriodLabel(periodKey) {
    const [year, month] = periodKey.split('-').map(Number);
    return new Intl.DateTimeFormat('pt-BR', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(year, month - 1, 1));
  }

  function getPeriodRange(periodKey) {
    const [year, month] = periodKey.split('-').map(Number);
    const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const end = new Date(year, month, 0, 23, 59, 59, 999);
    return { start, end };
  }

  function listRecentPeriods(count = 12) {
    const periods = [];
    const base = new Date();
    base.setDate(1);
    for (let i = 0; i < count; i++) {
      const current = new Date(base.getFullYear(), base.getMonth() - i, 1);
      periods.push(getCurrentPeriodKey(current));
    }
    return periods;
  }

  function normalizeOrders(orders) {
    return (orders || []).map(order => {
      const items = Array.isArray(order.items) ? order.items : (Array.isArray(order.itens) ? order.itens : []);
      const status = order.status === 'pendente' ? 'novo' : (order.status || 'novo');
      const subtotal = typeof order.subtotal === 'number'
        ? order.subtotal
        : items.reduce((sum, item) => sum + ((item.preco || item.precoUnit || 0) * (item.quantidade || item.qty || 0)), 0);
      const taxaEntrega = typeof order.taxaEntrega === 'number'
        ? order.taxaEntrega
        : (order.entrega && typeof order.entrega.taxa === 'number' ? order.entrega.taxa : 0);
      const total = typeof order.total === 'number' ? order.total : subtotal + taxaEntrega;
      return {
        ...order,
        items,
        status,
        subtotal,
        taxaEntrega,
        total,
      };
    });
  }

  function filterOrdersForPeriod(orders, periodKey, storeId) {
    const { start, end } = getPeriodRange(periodKey);
    return normalizeOrders(orders).filter(order => {
      if (!order.data) return false;
      const orderDate = new Date(order.data);
      if (Number.isNaN(orderDate.getTime())) return false;
      if (order.status === 'cancelado') return false;
      if (storeId && storeId !== 'todas' && order.loja !== storeId) return false;
      return orderDate >= start && orderDate <= end;
    });
  }

  function filterEntries(entries, periodKey, storeId) {
    return (entries || []).filter(entry => {
      if (periodKey && entry.periodKey !== periodKey) return false;
      if (storeId && storeId !== 'todas' && entry.storeId !== storeId) return false;
      return true;
    });
  }

  function getStoreName(storeId, stores) {
    const store = (stores || []).find(item => item.id === storeId);
    if (!store) return storeId || 'Rede';
    const parts = String(store.nome || '').split(' - ');
    return parts[1] || parts[0] || storeId;
  }

  function buildProductMaps(products) {
    const byId = new Map();
    const bySlug = new Map();
    (products || []).forEach(product => {
      byId.set(product.id, product);
      bySlug.set(Utils.slugify(product.nome || product.id), product);
    });
    return { byId, bySlug };
  }

  function resolveProduct(item, productMaps) {
    if (!item) return null;
    if (item.productId && productMaps.byId.has(item.productId)) return productMaps.byId.get(item.productId);
    const slug = Utils.slugify(item.nome || '');
    return productMaps.bySlug.get(slug) || null;
  }

  function getCashBalance(caixaSessions, storeId) {
    const filtered = (caixaSessions || []).filter(session => !storeId || storeId === 'todas' || session.loja === storeId);
    if (filtered.length === 0) return 0;
    return filtered.reduce((sum, session) => {
      const entradas = (session.entradas || []).reduce((acc, item) => acc + (item.valor || 0), 0);
      const saidas = (session.saidas || []).reduce((acc, item) => acc + (item.valor || 0), 0);
      const saldo = session.fechamento && typeof session.fechamento.valorReal === 'number'
        ? session.fechamento.valorReal
        : (session.abertura || 0) + entradas - saidas;
      return sum + saldo;
    }, 0);
  }

  function computeMetrics(params) {
    const orders = filterOrdersForPeriod(params.orders, params.periodKey, params.storeId);
    const fixedEntries = filterEntries(params.fixedCosts, params.periodKey, params.storeId);
    const variableEntries = filterEntries(params.variableCosts, params.periodKey, params.storeId);
    const productMaps = buildProductMaps(params.products || []);

    let receitaLiquida = 0;
    let cmvEstimado = 0;
    let itensSemCusto = 0;
    let itensVendidos = 0;

    orders.forEach(order => {
      receitaLiquida += Math.max(0, (order.total || 0) - (order.taxaEntrega || 0));
      order.items.forEach(item => {
        const qty = item.quantidade || item.qty || 0;
        itensVendidos += qty;
        const product = resolveProduct(item, productMaps);
        if (product && typeof product.custoUnitario === 'number') {
          cmvEstimado += product.custoUnitario * qty;
        } else {
          itensSemCusto += qty;
        }
      });
    });

    const despesasFixas = fixedEntries.reduce((sum, entry) => sum + (entry.valor || 0), 0);
    const despesasVariaveis = variableEntries.reduce((sum, entry) => sum + (entry.valor || 0), 0);
    const margemBruta = receitaLiquida - cmvEstimado;
    const margemContribuicao = receitaLiquida - cmvEstimado - despesasVariaveis;
    const mcPercent = receitaLiquida > 0 ? margemContribuicao / receitaLiquida : 0;
    const resultadoOperacional = margemContribuicao - despesasFixas;
    const breakEven = mcPercent > 0 ? despesasFixas / mcPercent : 0;

    const { start, end } = getPeriodRange(params.periodKey);
    const now = new Date();
    const isCurrentPeriod = now >= start && now <= end;
    const operatingDays = isCurrentPeriod ? Math.max(1, now.getDate()) : end.getDate();
    const vendaMinimaDiaria = breakEven > 0 ? breakEven / operatingDays : 0;
    const ticketMedio = orders.length > 0 ? receitaLiquida / orders.length : 0;
    const cashBalance = getCashBalance(params.caixaSessions, params.storeId);

    const totalRequired = FIXED_CATEGORIES.filter(cat => cat.mandatory).length + VARIABLE_CATEGORIES.filter(cat => cat.mandatory).length;
    const completedRequired =
      FIXED_CATEGORIES.filter(cat => cat.mandatory && fixedEntries.some(entry => entry.categoria === cat.id)).length +
      VARIABLE_CATEGORIES.filter(cat => cat.mandatory && variableEntries.some(entry => entry.categoria === cat.id)).length;
    const mandatoryCoverage = totalRequired > 0 ? completedRequired / totalRequired : 1;

    const profitabilityScore = receitaLiquida <= 0 ? 0
      : resultadoOperacional / receitaLiquida >= 0.12 ? 100
      : resultadoOperacional / receitaLiquida >= 0.06 ? 82
      : resultadoOperacional / receitaLiquida >= 0 ? 65
      : resultadoOperacional / receitaLiquida >= -0.05 ? 35
      : 10;
    const efficiencyRatio = receitaLiquida > 0 ? (cmvEstimado + despesasVariaveis) / receitaLiquida : 1;
    const efficiencyScore = receitaLiquida <= 0 ? 0
      : efficiencyRatio <= 0.55 ? 100
      : efficiencyRatio <= 0.68 ? 78
      : efficiencyRatio <= 0.8 ? 55
      : 25;
    const liquidityCoverage = despesasFixas > 0 ? cashBalance / despesasFixas : 0;
    const liquidityScore = liquidityCoverage >= 1.2 ? 100
      : liquidityCoverage >= 0.8 ? 78
      : liquidityCoverage >= 0.4 ? 55
      : cashBalance > 0 ? 30
      : 10;
    const predictabilityScore = mandatoryCoverage >= 0.95 && itensSemCusto === 0 ? 88
      : mandatoryCoverage >= 0.75 ? 65
      : mandatoryCoverage >= 0.5 ? 42
      : 20;
    const disciplineScore = Math.round(mandatoryCoverage * 100);

    const score = Math.round(
      (liquidityScore * 0.25) +
      (profitabilityScore * 0.25) +
      (efficiencyScore * 0.20) +
      (predictabilityScore * 0.15) +
      (disciplineScore * 0.15)
    );

    const pendingItems = [];
    FIXED_CATEGORIES.filter(cat => cat.mandatory).forEach(cat => {
      if (!fixedEntries.some(entry => entry.categoria === cat.id)) pendingItems.push(`Cadastrar custo fixo: ${cat.label}`);
    });
    VARIABLE_CATEGORIES.filter(cat => cat.mandatory).forEach(cat => {
      if (!variableEntries.some(entry => entry.categoria === cat.id)) pendingItems.push(`Cadastrar custo variavel: ${cat.label}`);
    });
    if (itensSemCusto > 0) pendingItems.push(`${itensSemCusto} item(ns) vendido(s) sem custo unitario cadastrado`);
    if (cashBalance <= 0) pendingItems.push('Caixa atual sem saldo de reserva suficiente');

    return {
      receitaLiquida,
      cmvEstimado,
      margemBruta,
      despesasVariaveis,
      margemContribuicao,
      mcPercent,
      despesasFixas,
      resultadoOperacional,
      breakEven,
      vendaMinimaDiaria,
      ticketMedio,
      ordersCount: orders.length,
      itensVendidos,
      itensSemCusto,
      cashBalance,
      score,
      scoreBreakdown: {
        liquidez: liquidityScore,
        rentabilidade: profitabilityScore,
        eficiencia: efficiencyScore,
        previsibilidade: predictabilityScore,
        disciplina: disciplineScore,
      },
      mandatoryCoverage,
      pendingItems,
      fixedEntries,
      variableEntries,
    };
  }

  function getScoreLabel(score) {
    if (score >= 90) return 'Operacao forte';
    if (score >= 75) return 'Saudavel com atencao';
    if (score >= 60) return 'Risco moderado';
    if (score >= 40) return 'Risco alto';
    return 'Intervencao imediata';
  }

  function getScoreTone(score) {
    if (score >= 75) return 'good';
    if (score >= 60) return 'warn';
    return 'danger';
  }

  function createSnapshot(storeId, periodKey, metrics) {
    return {
      storeId,
      periodKey,
      receitaLiquida: metrics.receitaLiquida,
      cmvEstimado: metrics.cmvEstimado,
      despesasVariaveis: metrics.despesasVariaveis,
      margemContribuicao: metrics.margemContribuicao,
      mcPercent: metrics.mcPercent,
      despesasFixas: metrics.despesasFixas,
      resultadoOperacional: metrics.resultadoOperacional,
      breakEven: metrics.breakEven,
      vendaMinimaDiaria: metrics.vendaMinimaDiaria,
      cashBalance: metrics.cashBalance,
      updatedAt: new Date().toISOString(),
    };
  }

  function createHealthScore(storeId, periodKey, metrics) {
    return {
      storeId,
      periodKey,
      score: metrics.score,
      pendingItems: metrics.pendingItems,
      scoreBreakdown: metrics.scoreBreakdown,
      updatedAt: new Date().toISOString(),
    };
  }

  return {
    FIXED_CATEGORIES,
    VARIABLE_CATEGORIES,
    FIXED_CATEGORY_MAP,
    VARIABLE_CATEGORY_MAP,
    getCurrentPeriodKey,
    getPeriodLabel,
    getPeriodRange,
    listRecentPeriods,
    getStoreName,
    normalizeOrders,
    computeMetrics,
    getScoreLabel,
    getScoreTone,
    createSnapshot,
    createHealthScore,
  };
})();

const AdminFinanceiro = (() => {
  const STORAGE_KEYS = {
    fixed: 'finance_fixed_costs',
    variable: 'finance_variable_costs',
    periods: 'finance_periods',
    snapshots: 'finance_snapshots',
    scores: 'finance_health_scores',
  };

  let currentStoreFilter = 'todas';
  let currentPeriod = FinanceEngine.getCurrentPeriodKey();
  let dataCache = {
    stores: [],
    products: [],
    orders: [],
    caixaSessions: [],
    notas: [],
    fixedCosts: [],
    variableCosts: [],
    periods: [],
    snapshots: [],
    scores: [],
  };

  function container() {
    return document.getElementById('financeiro-content');
  }

  function capitalize(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function canEditFinancials() {
    const user = AppState.get('user');
    return !!user && ['dono', 'gerente'].includes(user.cargo);
  }

  function getStoredArray(key) {
    return Storage.get(key) || [];
  }

  function setStoredArray(key, value) {
    Storage.set(key, value);
  }

  function upsertStoredDoc(key, doc, uniqueField) {
    const current = getStoredArray(key);
    return [
      ...current.filter(item => !(item.storeId === doc.storeId && item[uniqueField] === doc[uniqueField])),
      { ...doc, id: doc.id || `${doc.storeId}-${doc[uniqueField]}` },
    ];
  }

  async function loadStores() {
    if (typeof FirestoreService !== 'undefined' && FirestoreService.ready) {
      try {
        const stores = await FirestoreService.Stores.getAll();
        if (stores && stores.length > 0) return stores;
      } catch (error) {
        console.warn('[Financeiro] Falha ao carregar lojas:', error.message);
      }
    }
    return Array.isArray(DataStores) ? DataStores : [];
  }

  async function loadProducts() {
    if (typeof FirestoreService !== 'undefined' && FirestoreService.ready) {
      try {
        const products = await FirestoreService.Products.getAll();
        if (products && products.length > 0) return products;
      } catch (error) {
        console.warn('[Financeiro] Falha ao carregar produtos:', error.message);
      }
    }
    return Array.isArray(DataProducts) ? DataProducts : [];
  }

  async function loadOrders() {
    if (typeof FirestoreService !== 'undefined' && FirestoreService.ready) {
      try {
        if (currentStoreFilter && currentStoreFilter !== 'todas') {
          return await FirestoreService.Orders.getForStore(currentStoreFilter);
        }
        return await FirestoreService.Orders.getAll();
      } catch (error) {
        console.warn('[Financeiro] Falha ao carregar pedidos:', error.message);
      }
    }

    const orders = Storage.get('orders') || [];
    return currentStoreFilter === 'todas'
      ? orders
      : orders.filter(order => order.loja === currentStoreFilter);
  }

  async function loadCaixaSessions() {
    if (typeof FirestoreService !== 'undefined' && FirestoreService.ready && FirestoreService.Caixa) {
      try {
        if (currentStoreFilter && currentStoreFilter !== 'todas' && FirestoreService.Caixa.getForStore) {
          return await FirestoreService.Caixa.getForStore(currentStoreFilter);
        }
        if (FirestoreService.Caixa.getAll) {
          return await FirestoreService.Caixa.getAll();
        }
      } catch (error) {
        console.warn('[Financeiro] Falha ao carregar caixa:', error.message);
      }
    }

    const caixaData = Storage.get('caixa') || {};
    const sessions = [];
    Object.entries(caixaData).forEach(([storeId, days]) => {
      Object.entries(days || {}).forEach(([dateKey, session]) => {
        sessions.push({ ...session, loja: storeId, dateKey });
      });
    });
    return currentStoreFilter === 'todas'
      ? sessions
      : sessions.filter(session => session.loja === currentStoreFilter);
  }

  async function loadNotas() {
    if (typeof FirestoreService !== 'undefined' && FirestoreService.ready && FirestoreService.NotasFiscais) {
      try {
        if (currentStoreFilter && currentStoreFilter !== 'todas') {
          return await FirestoreService.NotasFiscais.getForStore(currentStoreFilter);
        }
      } catch (error) {
        console.warn('[Financeiro] Falha ao carregar notas:', error.message);
      }
    }

    const notas = Storage.get('notas_fiscais') || [];
    return currentStoreFilter === 'todas'
      ? notas
      : notas.filter(nota => nota.loja === currentStoreFilter);
  }

  async function loadFinancialData() {
    if (typeof FirestoreService !== 'undefined' && FirestoreService.ready && FirestoreService.FixedCosts) {
      try {
        const storeId = currentStoreFilter === 'todas' ? null : currentStoreFilter;
        const [fixedCosts, variableCosts, periods, snapshots, scores] = await Promise.all([
          FirestoreService.FixedCosts.getByFilter(storeId, currentPeriod),
          FirestoreService.VariableCosts.getByFilter(storeId, currentPeriod),
          FirestoreService.FinancialPeriods.getByFilter(storeId, currentPeriod),
          FirestoreService.FinancialSnapshots.getByFilter(storeId, currentPeriod),
          FirestoreService.HealthScores.getByFilter(storeId, currentPeriod),
        ]);
        return { fixedCosts, variableCosts, periods, snapshots, scores };
      } catch (error) {
        console.warn('[Financeiro] Falha ao carregar dados financeiros:', error.message);
      }
    }

    return {
      fixedCosts: getStoredArray(STORAGE_KEYS.fixed).filter(entry => entry.periodKey === currentPeriod),
      variableCosts: getStoredArray(STORAGE_KEYS.variable).filter(entry => entry.periodKey === currentPeriod),
      periods: getStoredArray(STORAGE_KEYS.periods).filter(entry => entry.periodKey === currentPeriod),
      snapshots: getStoredArray(STORAGE_KEYS.snapshots).filter(entry => entry.periodKey === currentPeriod),
      scores: getStoredArray(STORAGE_KEYS.scores).filter(entry => entry.periodKey === currentPeriod),
    };
  }

  async function loadData() {
    const [stores, products, orders, caixaSessions, notas, financeData] = await Promise.all([
      loadStores(),
      loadProducts(),
      loadOrders(),
      loadCaixaSessions(),
      loadNotas(),
      loadFinancialData(),
    ]);
    dataCache = {
      stores,
      products,
      orders,
      caixaSessions,
      notas,
      fixedCosts: financeData.fixedCosts,
      variableCosts: financeData.variableCosts,
      periods: financeData.periods,
      snapshots: financeData.snapshots,
      scores: financeData.scores,
    };
  }

  function createModal(title, bodyHTML, onConfirm) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10001;display:flex;align-items:center;justify-content:center;padding:16px;';

    const modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;border-radius:16px;max-width:560px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);';
    modal.innerHTML = `
      <div style="padding:18px 22px;border-bottom:1px solid #edf2ef;display:flex;justify-content:space-between;align-items:center;">
        <h3 style="margin:0;font-size:20px;color:#1B4332;">${title}</h3>
        <button class="modal-close" style="background:none;border:none;font-size:24px;cursor:pointer;color:#6b7280;">&times;</button>
      </div>
      <div style="padding:22px;" class="modal-body">${bodyHTML}</div>
      <div style="padding:16px 22px;border-top:1px solid #edf2ef;display:flex;justify-content:flex-end;gap:10px;">
        <button class="modal-cancel btn btn--ghost" type="button">Cancelar</button>
        <button class="modal-confirm btn btn--primary" type="button">Salvar</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('.modal-cancel').addEventListener('click', close);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) close();
    });
    modal.querySelector('.modal-confirm').addEventListener('click', async () => {
      const shouldClose = await onConfirm(modal);
      if (shouldClose) close();
    });
  }

  function buildEntryForm(entryType) {
    const categories = entryType === 'fixed' ? FinanceEngine.FIXED_CATEGORIES : FinanceEngine.VARIABLE_CATEGORIES;
    const storeName = FinanceEngine.getStoreName(currentStoreFilter, dataCache.stores);
    return `
      <div class="finance-modal-grid">
        <div class="finance-field">
          <label>Loja</label>
          <div class="finance-static-value">${storeName}</div>
        </div>
        <div class="finance-field">
          <label>Competencia</label>
          <div class="finance-static-value">${FinanceEngine.getPeriodLabel(currentPeriod)}</div>
        </div>
        <div class="finance-field finance-field--full">
          <label>Categoria</label>
          <select class="finance-input js-category">
            ${categories.map(cat => `<option value="${cat.id}">${cat.label}</option>`).join('')}
          </select>
        </div>
        <div class="finance-field finance-field--full">
          <label>Descricao</label>
          <input class="finance-input js-description" type="text" placeholder="Ex: aluguel da unidade / taxa das maquininhas">
        </div>
        <div class="finance-field">
          <label>Valor (R$)</label>
          <input class="finance-input js-value" type="number" min="0.01" step="0.01" placeholder="0.00">
        </div>
        <div class="finance-field">
          <label>Dia de vencimento</label>
          <input class="finance-input js-due-day" type="number" min="1" max="31" placeholder="10">
        </div>
        <div class="finance-field finance-field--full">
          <label>Observacoes</label>
          <textarea class="finance-input js-notes" rows="3" placeholder="Opcional"></textarea>
        </div>
      </div>
    `;
  }

  async function persistEntry(entryType, entry) {
    const key = entryType === 'fixed' ? STORAGE_KEYS.fixed : STORAGE_KEYS.variable;
    const id = entry.id || Utils.generateId();
    const updatedEntry = { ...entry, id };
    const current = getStoredArray(key);
    const updated = [...current.filter(item => item.id !== id), updatedEntry];
    setStoredArray(key, updated);

    if (typeof FirestoreService !== 'undefined' && FirestoreService.ready) {
      const service = entryType === 'fixed' ? FirestoreService.FixedCosts : FirestoreService.VariableCosts;
      if (service && service.save) {
        await service.save(entry.storeId, updatedEntry);
        return updatedEntry;
      }
    }

    return updatedEntry;
  }

  async function deleteEntry(entryType, entryId) {
    if (!entryId) return;
    if (typeof FirestoreService !== 'undefined' && FirestoreService.ready) {
      const service = entryType === 'fixed' ? FirestoreService.FixedCosts : FirestoreService.VariableCosts;
      if (service && service.delete) {
        try {
          await service.delete(currentStoreFilter, entryId);
        } catch (error) {
          console.warn('[Financeiro] Falha ao remover entrada:', error.message);
        }
      }
    }

    const key = entryType === 'fixed' ? STORAGE_KEYS.fixed : STORAGE_KEYS.variable;
    setStoredArray(key, getStoredArray(key).filter(item => item.id !== entryId));
  }

  async function persistDerivedArtifacts(metrics) {
    if (currentStoreFilter === 'todas') return;

    const snapshot = FinanceEngine.createSnapshot(currentStoreFilter, currentPeriod, metrics);
    const health = FinanceEngine.createHealthScore(currentStoreFilter, currentPeriod, metrics);
    const periodDoc = {
      storeId: currentStoreFilter,
      periodKey: currentPeriod,
      status: 'aberto',
      confiabilidade: Math.round(metrics.mandatoryCoverage * 100),
      pendencias: metrics.pendingItems,
      updatedAt: new Date().toISOString(),
    };

    if (typeof FirestoreService !== 'undefined' && FirestoreService.ready) {
      try {
        await Promise.all([
          FirestoreService.FinancialSnapshots.save(currentStoreFilter, snapshot),
          FirestoreService.HealthScores.save(currentStoreFilter, health),
          FirestoreService.FinancialPeriods.save(currentStoreFilter, periodDoc),
        ]);
        return;
      } catch (error) {
        console.warn('[Financeiro] Falha ao salvar resumo financeiro:', error.message);
      }
    }

    setStoredArray(STORAGE_KEYS.snapshots, upsertStoredDoc(STORAGE_KEYS.snapshots, snapshot, 'periodKey'));
    setStoredArray(STORAGE_KEYS.scores, upsertStoredDoc(STORAGE_KEYS.scores, health, 'periodKey'));
    setStoredArray(STORAGE_KEYS.periods, upsertStoredDoc(STORAGE_KEYS.periods, periodDoc, 'periodKey'));
  }

  function getAutomaticRevenueSummary() {
    const orders = FinanceEngine.normalizeOrders(dataCache.orders).filter(order => {
      if (currentStoreFilter !== 'todas' && order.loja !== currentStoreFilter) return false;
      const { start, end } = FinanceEngine.getPeriodRange(currentPeriod);
      const orderDate = new Date(order.data);
      return orderDate >= start && orderDate <= end && order.status !== 'cancelado';
    });

    const summary = {
      total: 0,
      retirada: 0,
      delivery: 0,
      pix: 0,
      cartao: 0,
      dinheiro: 0,
      pedidos: orders.length,
    };

    orders.forEach(order => {
      const value = Math.max(0, (order.total || 0) - (order.taxaEntrega || 0));
      summary.total += value;
      if ((order.entrega && order.entrega.tipo === 'delivery') || order.entrega === 'delivery') summary.delivery += value;
      else summary.retirada += value;

      const payment = order.pagamento?.tipo || order.pagamento || order.formaPagamento;
      if (payment === 'pix') summary.pix += value;
      else if (payment === 'dinheiro') summary.dinheiro += value;
      else summary.cartao += value;
    });

    const notasEntrada = (dataCache.notas || []).filter(nota => nota.tipo === 'entrada');
    summary.comprasImportadas = notasEntrada.reduce((sum, nota) => sum + ((nota.items || []).reduce((acc, item) => acc + (item.valorTotal || 0), 0)), 0);
    summary.notasEntrada = notasEntrada.length;

    return summary;
  }

  function renderAutomaticSection() {
    const summary = getAutomaticRevenueSummary();
    return `
      <section class="finance-grid finance-grid--top">
        <article class="finance-card">
          <div class="finance-card__header">
            <h3 class="finance-card__title">Entradas Automaticas</h3>
            <span class="finance-card__tag">${summary.pedidos} pedido(s)</span>
          </div>
          <div class="finance-auto-grid">
            <div><span>Receita automatica</span><strong>${Utils.formatBRL(summary.total)}</strong></div>
            <div><span>Retirada / balcão</span><strong>${Utils.formatBRL(summary.retirada)}</strong></div>
            <div><span>Delivery</span><strong>${Utils.formatBRL(summary.delivery)}</strong></div>
            <div><span>PIX</span><strong>${Utils.formatBRL(summary.pix)}</strong></div>
            <div><span>Cartao</span><strong>${Utils.formatBRL(summary.cartao)}</strong></div>
            <div><span>Dinheiro</span><strong>${Utils.formatBRL(summary.dinheiro)}</strong></div>
          </div>
          <p class="finance-empty">PDV, checkout e pedidos integrados ja alimentam automaticamente a entrada de vendas do modulo.</p>
        </article>
        <article class="finance-card">
          <div class="finance-card__header">
            <h3 class="finance-card__title">Compras por Nota</h3>
            <span class="finance-card__tag">${summary.notasEntrada} NF-e</span>
          </div>
          <div class="finance-auto-grid">
            <div><span>Total importado via NF-e</span><strong>${Utils.formatBRL(summary.comprasImportadas || 0)}</strong></div>
          </div>
          <p class="finance-empty">Use "Importar NF-e XML" para jogar compra no estoque e no financeiro de uma vez.</p>
        </article>
      </section>
    `;
  }

  function renderKpi(label, value, helper) {
    return `
      <article class="finance-kpi">
        <span class="finance-kpi__label">${label}</span>
        <strong class="finance-kpi__value">${value}</strong>
        <span class="finance-kpi__helper">${helper}</span>
      </article>
    `;
  }

  function renderDreRow(label, value, tone) {
    return `
      <div class="finance-dre__row ${tone ? `finance-dre__row--${tone}` : ''}">
        <span>${label}</span>
        <strong>${Utils.formatBRL(value)}</strong>
      </div>
    `;
  }

  function renderHeader(metrics) {
    const scoreTone = FinanceEngine.getScoreTone(metrics.score);
    return `
      <section class="finance-hero finance-hero--${scoreTone}">
        <div>
          <span class="finance-eyebrow">Finance OS / Saude da Franquia</span>
          <h2 class="finance-hero__title">Fechamento gerencial de ${FinanceEngine.getPeriodLabel(currentPeriod)}</h2>
          <p class="finance-hero__subtitle">
            ${currentStoreFilter === 'todas'
              ? 'Visao consolidada da rede, com comparativo por unidade e pendencias do mes.'
              : `Unidade ${FinanceEngine.getStoreName(currentStoreFilter, dataCache.stores)} com foco em DRE, custos obrigatorios e risco operacional.`}
          </p>
        </div>
        <div class="finance-score-card">
          <span class="finance-score-card__label">Score</span>
          <strong class="finance-score-card__value">${metrics.score}</strong>
          <span class="finance-score-card__meta">${FinanceEngine.getScoreLabel(metrics.score)}</span>
        </div>
      </section>
    `;
  }

  function renderActionBar() {
    const periods = FinanceEngine.listRecentPeriods(12);
    return `
      <section class="finance-toolbar">
        <div class="finance-toolbar__left">
          <label class="finance-toolbar__group">
            <span>Competencia</span>
            <select id="finance-period-select" class="finance-input">
              ${periods.map(period => `<option value="${period}" ${period === currentPeriod ? 'selected' : ''}>${FinanceEngine.getPeriodLabel(period)}</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="finance-toolbar__right">
          ${canEditFinancials() && currentStoreFilter !== 'todas'
            ? `
              <button class="btn btn--ghost" type="button" data-finance-action="import-nfe">Importar NF-e XML</button>
              <button class="btn btn--ghost" type="button" data-finance-action="batch-fixed">Cadastrar fixos do mes</button>
              <button class="btn btn--ghost" type="button" data-finance-action="add-variable">Novo custo variavel</button>
              <button class="btn btn--primary" type="button" data-finance-action="add-fixed">Novo custo fixo</button>
              <button class="btn btn--ghost" type="button" data-finance-action="close-period">Fechar mes</button>
            `
            : '<span class="finance-toolbar__hint">Selecione uma loja especifica para lancar custos e fechar o periodo.</span>'}
        </div>
      </section>
    `;
  }

  function renderKpiCards(metrics) {
    return `
      <section class="finance-kpis">
        ${renderKpi('Receita liquida', Utils.formatBRL(metrics.receitaLiquida), 'Pedidos validos do periodo')}
        ${renderKpi('CMV estimado', Utils.formatBRL(metrics.cmvEstimado), metrics.itensSemCusto > 0 ? `${metrics.itensSemCusto} item(ns) sem custo` : 'Baseado no custo unitario dos produtos')}
        ${renderKpi('Margem contribuicao', Utils.formatBRL(metrics.margemContribuicao), `${(metrics.mcPercent * 100).toFixed(1)}% da receita`)}
        ${renderKpi('Break-even mensal', Utils.formatBRL(metrics.breakEven), 'Venda minima para empatar o mes')}
        ${renderKpi('Venda minima diaria', Utils.formatBRL(metrics.vendaMinimaDiaria), 'Meta diaria para nao fechar no prejuizo')}
        ${renderKpi('Caixa de reserva', Utils.formatBRL(metrics.cashBalance), 'Saldo conhecido no livro caixa')}
      </section>
    `;
  }

  function renderSummary(metrics) {
    return `
      <section class="finance-grid finance-grid--top">
        <article class="finance-card">
          <div class="finance-card__header">
            <h3 class="finance-card__title">DRE Gerencial</h3>
            <span class="finance-card__tag">Fase 1</span>
          </div>
          <div class="finance-dre">
            ${renderDreRow('Receita liquida', metrics.receitaLiquida)}
            ${renderDreRow('(-) CMV estimado', -metrics.cmvEstimado)}
            ${renderDreRow('(=) Margem bruta', metrics.margemBruta, 'strong')}
            ${renderDreRow('(-) Despesas variaveis', -metrics.despesasVariaveis)}
            ${renderDreRow('(=) Margem contribuicao', metrics.margemContribuicao, 'strong')}
            ${renderDreRow('(-) Custos fixos', -metrics.despesasFixas)}
            ${renderDreRow('(=) Resultado operacional', metrics.resultadoOperacional, metrics.resultadoOperacional >= 0 ? 'good' : 'danger')}
          </div>
        </article>
        <article class="finance-card">
          <div class="finance-card__header">
            <h3 class="finance-card__title">Pendencias e Confiabilidade</h3>
            <span class="finance-card__tag">${Math.round(metrics.mandatoryCoverage * 100)}% completo</span>
          </div>
          ${metrics.pendingItems.length > 0
            ? `<ul class="finance-pending-list">${metrics.pendingItems.map(item => `<li>${item}</li>`).join('')}</ul>`
            : '<p class="finance-empty">Nenhuma pendencia obrigatoria neste periodo.</p>'}
        </article>
        <article class="finance-card">
          <div class="finance-card__header">
            <h3 class="finance-card__title">Blocos do Score</h3>
            <span class="finance-card__tag">0 a 100</span>
          </div>
          <div class="finance-score-breakdown">
            ${Object.entries(metrics.scoreBreakdown).map(([key, value]) => `
              <div class="finance-score-breakdown__row">
                <span>${capitalize(key)}</span>
                <div class="finance-score-breakdown__bar">
                  <span style="width:${value}%"></span>
                </div>
                <strong>${value}</strong>
              </div>
            `).join('')}
          </div>
        </article>
      </section>
    `;
  }

  function renderEntriesTable(entries, entryType, map) {
    if (!entries.length) {
      return '<p class="finance-empty">Nenhum lancamento registrado neste periodo.</p>';
    }

    return `
      <div class="table-responsive">
        <table class="admin-table admin-table--compact">
          <thead>
            <tr>
              <th>Categoria</th>
              <th>Descricao</th>
              <th>Venc.</th>
              <th>Valor</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${entries
              .sort((a, b) => (a.dueDay || 99) - (b.dueDay || 99))
              .map(entry => `
                <tr>
                  <td>${(map[entry.categoria] && map[entry.categoria].label) || entry.categoria}</td>
                  <td>${entry.descricao || '-'}</td>
                  <td>${entry.dueDay ? `${String(entry.dueDay).padStart(2, '0')}` : '-'}</td>
                  <td><strong>${Utils.formatBRL(entry.valor || 0)}</strong></td>
                  <td class="finance-table-actions">
                    ${canEditFinancials() && currentStoreFilter !== 'todas'
                      ? `<button class="finance-link-btn" type="button" data-finance-delete="${entryType}:${entry.id}">Remover</button>`
                      : ''}
                  </td>
                </tr>
              `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderEntriesTables(metrics) {
    return `
      <section class="finance-grid finance-grid--tables">
        <article class="finance-card">
          <div class="finance-card__header">
            <h3 class="finance-card__title">Custos Fixos</h3>
            <span class="finance-card__tag">${metrics.fixedEntries.length} lancamento(s)</span>
          </div>
          ${renderEntriesTable(metrics.fixedEntries, 'fixed', FinanceEngine.FIXED_CATEGORY_MAP)}
        </article>
        <article class="finance-card">
          <div class="finance-card__header">
            <h3 class="finance-card__title">Custos Variaveis</h3>
            <span class="finance-card__tag">${metrics.variableEntries.length} lancamento(s)</span>
          </div>
          ${renderEntriesTable(metrics.variableEntries, 'variable', FinanceEngine.VARIABLE_CATEGORY_MAP)}
        </article>
      </section>
    `;
  }

  function renderNetworkTable() {
    if (currentStoreFilter !== 'todas') return '';
    const rows = dataCache.stores.map(store => {
      const metrics = FinanceEngine.computeMetrics({
        storeId: store.id,
        periodKey: currentPeriod,
        orders: dataCache.orders,
        products: dataCache.products,
        caixaSessions: dataCache.caixaSessions,
        fixedCosts: dataCache.fixedCosts,
        variableCosts: dataCache.variableCosts,
      });
      return {
        storeId: store.id,
        nome: FinanceEngine.getStoreName(store.id, dataCache.stores),
        score: metrics.score,
        receitaLiquida: metrics.receitaLiquida,
        resultadoOperacional: metrics.resultadoOperacional,
        breakEven: metrics.breakEven,
      };
    }).sort((a, b) => b.score - a.score);

    return `
      <section class="finance-card">
        <div class="finance-card__header">
          <h3 class="finance-card__title">Comparativo entre Franquias</h3>
          <span class="finance-card__tag">Visao da rede</span>
        </div>
        <div class="table-responsive">
          <table class="admin-table admin-table--compact">
            <thead>
              <tr>
                <th>Loja</th>
                <th>Score</th>
                <th>Receita liquida</th>
                <th>Resultado</th>
                <th>Break-even</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(row => `
                <tr>
                  <td><strong>${row.nome}</strong></td>
                  <td><span class="finance-score-chip finance-score-chip--${FinanceEngine.getScoreTone(row.score)}">${row.score}</span></td>
                  <td>${Utils.formatBRL(row.receitaLiquida)}</td>
                  <td>${Utils.formatBRL(row.resultadoOperacional)}</td>
                  <td>${Utils.formatBRL(row.breakEven)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function buildInsights(metrics) {
    const insights = [];
    if (metrics.breakEven > 0) {
      insights.push(`Sua unidade precisa vender ${Utils.formatBRL(metrics.vendaMinimaDiaria)} por dia para nao fechar o mes no prejuizo.`);
    }
    if (metrics.resultadoOperacional < 0) {
      insights.push(`O resultado operacional atual esta em ${Utils.formatBRL(metrics.resultadoOperacional)}. Priorize custos variaveis e despesas fixas obrigatorias.`);
    } else {
      insights.push(`A operacao esta gerando ${Utils.formatBRL(metrics.resultadoOperacional)} no periodo, com margem de contribuicao de ${(metrics.mcPercent * 100).toFixed(1)}%.`);
    }
    if (metrics.itensSemCusto > 0) {
      insights.push(`Existem ${metrics.itensSemCusto} item(ns) vendidos sem custo unitario, reduzindo a confiabilidade do CMV.`);
    }
    return insights;
  }

  function bindEvents(metrics) {
    const root = container();
    if (!root) return;

    const periodSelect = document.getElementById('finance-period-select');
    if (periodSelect) {
      periodSelect.addEventListener('change', async event => {
        currentPeriod = event.target.value;
        await render(currentStoreFilter);
      });
    }

    root.querySelectorAll('[data-finance-action]').forEach(button => {
      button.addEventListener('click', async () => {
        const action = button.dataset.financeAction;
        if (action === 'add-fixed') {
          openEntryModal('fixed');
        } else if (action === 'add-variable') {
          openEntryModal('variable');
        } else if (action === 'import-nfe') {
          openNFeImportModal();
        } else if (action === 'batch-fixed') {
          openFixedBatchModal();
        } else if (action === 'close-period') {
          await closePeriod(metrics);
        }
      });
    });

    root.querySelectorAll('[data-finance-delete]').forEach(button => {
      button.addEventListener('click', async () => {
        const [entryType, entryId] = button.dataset.financeDelete.split(':');
        await deleteEntry(entryType, entryId);
        Toast.success('Lancamento removido.');
        await render(currentStoreFilter);
      });
    });
  }

  function openFixedBatchModal() {
    if (currentStoreFilter === 'todas') {
      Toast.error('Selecione uma loja especifica para cadastrar custos fixos.');
      return;
    }
    const body = `
      <div class="finance-batch-list">
        ${FinanceEngine.FIXED_CATEGORIES.map(cat => `
          <label class="finance-batch-row">
            <span>${cat.label}${cat.mandatory ? ' *' : ''}</span>
            <input class="finance-input js-batch-fixed" type="number" min="0" step="0.01" data-category="${cat.id}" placeholder="0.00">
          </label>
        `).join('')}
      </div>
    `;

    createModal('Cadastrar custos fixos do mes', body, async modal => {
      const inputs = [...modal.querySelectorAll('.js-batch-fixed')];
      const entries = inputs
        .map(input => ({
          categoria: input.dataset.category,
          valor: parseFloat(input.value) || 0,
        }))
        .filter(item => item.valor > 0);

      if (!entries.length) {
        Toast.error('Informe pelo menos um custo fixo.');
        return false;
      }

      for (const item of entries) {
        const category = FinanceEngine.FIXED_CATEGORY_MAP[item.categoria];
        await persistEntry('fixed', {
          id: Utils.generateId(),
          storeId: currentStoreFilter,
          periodKey: currentPeriod,
          categoria: item.categoria,
          descricao: category ? category.label : item.categoria,
          valor: item.valor,
          dueDay: null,
          notes: 'Cadastro rapido mensal',
          mandatory: !!category?.mandatory,
          createdAt: new Date().toISOString(),
        });
      }

      Toast.success('Custos fixos cadastrados.');
      await render(currentStoreFilter);
      return true;
    });
  }

  function openNFeImportModal() {
    if (currentStoreFilter === 'todas') {
      Toast.error('Selecione uma loja especifica para importar uma NF-e.');
      return;
    }
    const body = `
      <div class="finance-field finance-field--full">
        <label>Arquivo XML da NF-e</label>
        <input class="finance-input js-nfe-file" type="file" accept=".xml,text/xml,application/xml">
      </div>
      <div class="finance-field finance-field--full">
        <label>Ou cole o XML aqui</label>
        <textarea class="finance-input js-nfe-xml" rows="10" placeholder="<nfeProc>..."></textarea>
      </div>
      <p class="finance-empty">Melhor caminho no celular: baixe o XML da nota ou compartilhe para o navegador e importe aqui. Isso atualiza estoque e cria a saída de compra automaticamente.</p>
    `;

    createModal('Importar NF-e XML', body, async modal => {
      let xml = modal.querySelector('.js-nfe-xml').value.trim();
      const file = modal.querySelector('.js-nfe-file').files[0];
      if (!xml && file) {
        xml = await file.text();
      }
      if (!xml) {
        Toast.error('Selecione ou cole um XML de NF-e.');
        return false;
      }
      await importNFeXml(xml);
      await render(currentStoreFilter);
      return true;
    });
  }

  async function importNFeXml(xml) {
    try {
      let result = null;
      if (typeof FirestoreService !== 'undefined' && FirestoreService.ready && FirestoreService.StockOps) {
        result = await FirestoreService.StockOps.entradaFromNFe(currentStoreFilter, xml);
      } else if (typeof FirestoreService !== 'undefined' && FirestoreService.parseNFeXML) {
        const parsed = FirestoreService.parseNFeXML(xml);
        result = { nfInfo: parsed.nfInfo, results: parsed.items };
      } else {
        throw new Error('Importacao de NF-e indisponivel no momento');
      }

      const totalNota = (result.results || []).reduce((sum, item) => sum + (item.valorTotal || 0), 0);
      await persistEntry('variable', {
        id: Utils.generateId(),
        storeId: currentStoreFilter,
        periodKey: currentPeriod,
        categoria: 'compras_mercadoria',
        descricao: `NF-e ${result.nfInfo.numero} - ${result.nfInfo.fornecedor || 'Fornecedor'}`,
        valor: totalNota,
        dueDay: null,
        notes: `Importado por XML | Serie ${result.nfInfo.serie || '-'} | CNPJ ${result.nfInfo.cnpjFornecedor || '-'}`,
        mandatory: true,
        createdAt: new Date().toISOString(),
        source: 'nfe_xml',
      });

      Toast.success(`NF-e ${result.nfInfo.numero} importada. Estoque e financeiro atualizados.`);
    } catch (error) {
      console.error('[Financeiro] Falha ao importar NF-e:', error);
      Toast.error(`Erro ao importar NF-e: ${error.message}`);
    }
  }

  function openEntryModal(entryType) {
    createModal(entryType === 'fixed' ? 'Novo custo fixo' : 'Novo custo variavel', buildEntryForm(entryType), async modal => {
      const categoria = modal.querySelector('.js-category').value;
      const descricao = modal.querySelector('.js-description').value.trim();
      const valor = parseFloat(modal.querySelector('.js-value').value) || 0;
      const dueDayValue = modal.querySelector('.js-due-day').value.trim();
      const dueDay = dueDayValue ? parseInt(dueDayValue, 10) : null;
      const notes = modal.querySelector('.js-notes').value.trim();

      if (!descricao) {
        Toast.error('Informe uma descricao para o lancamento.');
        return false;
      }
      if (valor <= 0) {
        Toast.error('Informe um valor maior que zero.');
        return false;
      }

      const entry = {
        id: Utils.generateId(),
        storeId: currentStoreFilter,
        periodKey: currentPeriod,
        categoria,
        descricao,
        valor,
        dueDay,
        notes,
        mandatory: entryType === 'fixed'
          ? !!FinanceEngine.FIXED_CATEGORY_MAP[categoria]?.mandatory
          : !!FinanceEngine.VARIABLE_CATEGORY_MAP[categoria]?.mandatory,
        createdAt: new Date().toISOString(),
      };

      await persistEntry(entryType, entry);
      Toast.success('Lancamento salvo com sucesso.');
      await render(currentStoreFilter);
      return true;
    });
  }

  async function closePeriod(metrics) {
    if (currentStoreFilter === 'todas') {
      Toast.error('Selecione uma loja especifica para fechar o periodo.');
      return;
    }

    const periodDoc = {
      storeId: currentStoreFilter,
      periodKey: currentPeriod,
      status: 'fechado',
      fechadoEm: new Date().toISOString(),
      confiabilidade: Math.round(metrics.mandatoryCoverage * 100),
      pendencias: metrics.pendingItems,
    };

    if (typeof FirestoreService !== 'undefined' && FirestoreService.ready) {
      try {
        await Promise.all([
          FirestoreService.FinancialPeriods.save(currentStoreFilter, periodDoc),
          FirestoreService.FinancialSnapshots.save(currentStoreFilter, FinanceEngine.createSnapshot(currentStoreFilter, currentPeriod, metrics)),
          FirestoreService.HealthScores.save(currentStoreFilter, FinanceEngine.createHealthScore(currentStoreFilter, currentPeriod, metrics)),
        ]);
      } catch (error) {
        console.warn('[Financeiro] Falha ao fechar periodo:', error.message);
      }
    }

    setStoredArray(STORAGE_KEYS.periods, upsertStoredDoc(STORAGE_KEYS.periods, periodDoc, 'periodKey'));
    setStoredArray(STORAGE_KEYS.snapshots, upsertStoredDoc(STORAGE_KEYS.snapshots, FinanceEngine.createSnapshot(currentStoreFilter, currentPeriod, metrics), 'periodKey'));
    setStoredArray(STORAGE_KEYS.scores, upsertStoredDoc(STORAGE_KEYS.scores, FinanceEngine.createHealthScore(currentStoreFilter, currentPeriod, metrics), 'periodKey'));

    Toast.success('Periodo fechado e snapshot financeiro salvo.');
    await render(currentStoreFilter);
  }

  async function render(storeFilter = 'todas') {
    currentStoreFilter = storeFilter || 'todas';
    const el = container();
    if (!el) return;

    el.innerHTML = '<p class="admin-page__placeholder">Carregando financeiro...</p>';
    await loadData();

    const metrics = FinanceEngine.computeMetrics({
      storeId: currentStoreFilter,
      periodKey: currentPeriod,
      orders: dataCache.orders,
      products: dataCache.products,
      caixaSessions: dataCache.caixaSessions,
      fixedCosts: dataCache.fixedCosts,
      variableCosts: dataCache.variableCosts,
    });

    const insights = buildInsights(metrics);
    el.innerHTML = `
      ${renderHeader(metrics)}
      ${renderActionBar()}
      ${renderAutomaticSection()}
      <section class="finance-insights">
        ${insights.map(item => `<article class="finance-insight">${item}</article>`).join('')}
      </section>
      ${renderKpiCards(metrics)}
      ${renderSummary(metrics)}
      ${renderEntriesTables(metrics)}
      ${renderNetworkTable()}
    `;

    bindEvents(metrics);
  }

  function getMetricsForStore(storeId) {
    return FinanceEngine.computeMetrics({
      storeId,
      periodKey: currentPeriod,
      orders: dataCache.orders,
      products: dataCache.products,
      caixaSessions: dataCache.caixaSessions,
      fixedCosts: dataCache.fixedCosts,
      variableCosts: dataCache.variableCosts,
    });
  }

  return {
    render,
    getMetricsForStore,
  };
})();
