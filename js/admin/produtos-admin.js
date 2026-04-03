/* ============================================
   CLUBE DO NATURAL — Admin Produtos (CRUD)
   Cadastro completo de produtos.
   Uses Firestore via FirestoreService, falls back to localStorage.
   ============================================ */

const AdminProdutos = (() => {
  const container = () => document.getElementById('produtos-content');

  let currentStoreFilter = 'todas';
  let searchTerm = '';
  let categoryFilter = 'todas';
  let statusFilter = 'todos';

  // Cached product list (loaded async from Firestore)
  let _cachedProducts = null;
  let _storeActiveMap = {}; // { storeId: Set(productId) }

  const SELOS_LIST = [
    { key: 'organico', label: 'Orgânico' },
    { key: 'vegano', label: 'Vegano' },
    { key: 'sem_gluten', label: 'Sem Glúten' },
    { key: 'integral', label: 'Integral' },
    { key: 'premium', label: 'Premium' },
    { key: 'sem_lactose', label: 'Sem Lactose' },
    { key: 'sem_acucar', label: 'Sem Açúcar' },
  ];

  function useFirestore() {
    return typeof FirestoreService !== 'undefined' && FirestoreService.ready;
  }

  /* ------------------------------------------
     DATA
  ------------------------------------------ */
  async function loadProducts() {
    if (useFirestore()) {
      try {
        _cachedProducts = await FirestoreService.Products.getAll();
        return;
      } catch (e) {
        console.warn('[Produtos] Firestore load failed, using fallback:', e.message);
      }
    }
    // Fallback to localStorage + mock
    const custom = Storage.get('products_custom') || [];
    const customIds = new Set(custom.map(p => p.id));
    _cachedProducts = [
      ...DataProducts.filter(p => !customIds.has(p.id)),
      ...custom,
    ];
  }

  async function loadStoreActiveProducts(storeId) {
    if (!storeId || storeId === 'todas' || !useFirestore()) return;
    try {
      const active = await FirestoreService.StoreProducts.getForStore(storeId);
      _storeActiveMap[storeId] = new Set(active.map(a => a.productId || a._id));
    } catch (e) {
      console.warn('[Produtos] Failed to load store active products:', e.message);
    }
  }

  function getProducts() {
    let list = _cachedProducts || [];

    // If store filter, show only products active for that store
    if (currentStoreFilter && currentStoreFilter !== 'todas' && _storeActiveMap[currentStoreFilter]) {
      const activeSet = _storeActiveMap[currentStoreFilter];
      list = list.filter(p => activeSet.has(p.id));
    }

    if (categoryFilter !== 'todas') {
      list = list.filter(p => p.categoria === categoryFilter);
    }
    if (statusFilter === 'ativo') {
      list = list.filter(p => p.ativo !== false);
    } else if (statusFilter === 'inativo') {
      list = list.filter(p => p.ativo === false);
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      list = list.filter(p =>
        p.nome.toLowerCase().includes(term) ||
        (p.descricao && p.descricao.toLowerCase().includes(term)) ||
        (p.codigoBarras && p.codigoBarras.includes(term))
      );
    }
    return list;
  }

  function getAllProducts() {
    return _cachedProducts || [];
  }

  async function saveProduct(product) {
    if (useFirestore()) {
      try {
        await FirestoreService.Products.save(product);
        // Refresh cache
        const idx = _cachedProducts ? _cachedProducts.findIndex(p => p.id === product.id) : -1;
        if (idx !== -1) _cachedProducts[idx] = product;
        else if (_cachedProducts) _cachedProducts.push(product);
        return;
      } catch (e) {
        console.warn('[Produtos] Firestore save failed, using localStorage:', e.message);
      }
    }
    // Fallback
    const custom = Storage.get('products_custom') || [];
    const idx = custom.findIndex(p => p.id === product.id);
    if (idx !== -1) custom[idx] = product;
    else custom.push(product);
    Storage.set('products_custom', custom);
    // Update cache
    if (_cachedProducts) {
      const ci = _cachedProducts.findIndex(p => p.id === product.id);
      if (ci !== -1) _cachedProducts[ci] = product;
      else _cachedProducts.push(product);
    }
  }

  function getStockTotal(product) {
    if (!product.estoque) return 0;
    if (currentStoreFilter && currentStoreFilter !== 'todas') {
      return product.estoque[currentStoreFilter] || 0;
    }
    return Object.values(product.estoque).reduce((s, v) => s + v, 0);
  }

  function calcMargin(preco, custo) {
    if (!preco || preco === 0) return 0;
    return ((preco - custo) / preco * 100);
  }

  function getCategoryLabel(catId) {
    const cat = DataCategories.find(c => c.id === catId);
    return cat ? cat.nome : catId;
  }

  /* ------------------------------------------
     RENDER (async — loads data then renders)
  ------------------------------------------ */
  async function render(storeFilter) {
    const el = container();
    if (!el) return;

    currentStoreFilter = storeFilter || 'todas';

    // Show loading
    el.innerHTML = '<div style="text-align:center;padding:40px;color:#888;">Carregando produtos...</div>';

    await loadProducts();
    if (currentStoreFilter !== 'todas') {
      await loadStoreActiveProducts(currentStoreFilter);
    }

    const products = getProducts();
    renderTable(el, products);
  }

  function renderTable(el, products) {
    el.innerHTML = `
      <style>
        .prod-action-bar {
          display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:20px;
        }
        .prod-action-bar input[type="search"] {
          padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;
          background:#fff;flex:1;min-width:200px;max-width:350px;
        }
        .prod-action-bar select {
          padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;
          background:#fff;min-width:130px;
        }
        .prod-btn-novo {
          background:#2D6A4F;color:#fff;border:none;padding:10px 20px;border-radius:8px;
          cursor:pointer;font-size:14px;font-weight:600;white-space:nowrap;
        }
        .prod-btn-novo:hover { background:#1B4332; }
        .prod-btn-ativar {
          background:#fff;color:#1565C0;border:1px solid #1565C0;padding:10px 20px;border-radius:8px;
          cursor:pointer;font-size:14px;font-weight:600;white-space:nowrap;
        }
        .prod-btn-ativar:hover { background:#E3F2FD; }
        .prod-img-thumb {
          width:40px;height:40px;border-radius:6px;object-fit:cover;background:#f0f0f0;
        }
        .prod-status-badge {
          display:inline-block;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:600;
        }
        .prod-actions-btn {
          background:none;border:1px solid #ddd;padding:4px 10px;border-radius:6px;
          cursor:pointer;font-size:12px;margin:2px;transition:background 0.2s;
        }
        .prod-actions-btn:hover { background:#f0f0f0; }
        .prod-store-toggle {
          padding:3px 8px;border-radius:6px;font-size:11px;cursor:pointer;border:1px solid #ddd;
          background:#fff;margin:1px;transition:background 0.15s;
        }
        .prod-store-toggle--active { background:#E8F5E9;color:#2E7D32;border-color:#A5D6A7; }
        .prod-store-toggle--inactive { background:#FFEBEE;color:#C62828;border-color:#FFCDD2; }
      </style>

      <!-- Action Bar -->
      <div class="prod-action-bar">
        <input type="search" class="prod-search" placeholder="Buscar produto..." value="${searchTerm}">
        <select class="prod-cat-filter">
          <option value="todas">Todas Categorias</option>
          ${DataCategories.map(c => `<option value="${c.id}" ${categoryFilter === c.id ? 'selected' : ''}>${c.nome}</option>`).join('')}
        </select>
        <select class="prod-status-filter">
          <option value="todos" ${statusFilter === 'todos' ? 'selected' : ''}>Todos Status</option>
          <option value="ativo" ${statusFilter === 'ativo' ? 'selected' : ''}>Ativo</option>
          <option value="inativo" ${statusFilter === 'inativo' ? 'selected' : ''}>Inativo</option>
        </select>
        <button class="prod-btn-novo">+ Novo Produto</button>
        ${currentStoreFilter !== 'todas' ? '<button class="prod-btn-ativar">Ativar/Desativar Produtos</button>' : ''}
      </div>

      <!-- Table -->
      <div class="table-responsive">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Imagem</th>
              <th>Nome</th>
              <th>Categoria</th>
              <th>Preço</th>
              <th>Estoque Total</th>
              <th>Margem</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${products.length === 0 ? `
              <tr><td colspan="8" style="text-align:center;color:#999;padding:24px;">Nenhum produto encontrado</td></tr>
            ` : products.map(p => {
              const stock = getStockTotal(p);
              const margin = calcMargin(p.preco, p.custoUnitario || 0);
              const isActive = p.ativo !== false;
              return `
                <tr>
                  <td><img src="${p.imagem || ''}" alt="" class="prod-img-thumb" onerror="this.style.display='none'"></td>
                  <td><strong>${p.nome}</strong></td>
                  <td>${getCategoryLabel(p.categoria)}</td>
                  <td>${Utils.formatBRL(p.preco)}</td>
                  <td>${stock}</td>
                  <td style="color:${margin >= 40 ? '#2E7D32' : margin >= 20 ? '#F57F17' : '#C62828'};">${margin.toFixed(1)}%</td>
                  <td>
                    <span class="prod-status-badge" style="background:${isActive ? '#E8F5E9' : '#FFEBEE'};color:${isActive ? '#2E7D32' : '#C62828'};">
                      ${isActive ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td>
                    <button class="prod-actions-btn" data-action="editar" data-id="${p.id}">Editar</button>
                    <button class="prod-actions-btn" data-action="duplicar" data-id="${p.id}">Duplicar</button>
                    <button class="prod-actions-btn" data-action="toggle" data-id="${p.id}">${isActive ? 'Desativar' : 'Ativar'}</button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    bindEvents(el);
  }

  /* ------------------------------------------
     EVENT BINDINGS
  ------------------------------------------ */
  function bindEvents(el) {
    const searchInput = el.querySelector('.prod-search');
    if (searchInput) {
      searchInput.addEventListener('input', Utils.debounce((e) => {
        searchTerm = e.target.value;
        render(currentStoreFilter);
      }, 400));
    }

    el.querySelector('.prod-cat-filter').addEventListener('change', (e) => {
      categoryFilter = e.target.value;
      render(currentStoreFilter);
    });

    el.querySelector('.prod-status-filter').addEventListener('change', (e) => {
      statusFilter = e.target.value;
      render(currentStoreFilter);
    });

    el.querySelector('.prod-btn-novo').addEventListener('click', () => showProductModal(null));

    const btnAtivar = el.querySelector('.prod-btn-ativar');
    if (btnAtivar) {
      btnAtivar.addEventListener('click', () => showStoreActivationModal(currentStoreFilter));
    }

    el.querySelectorAll('.prod-actions-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        if (action === 'editar') showProductModal(id);
        else if (action === 'duplicar') duplicateProduct(id);
        else if (action === 'toggle') toggleProductStatus(id);
      });
    });
  }

  /* ------------------------------------------
     STORE ACTIVATION MODAL
     Toggle which products are active for a specific store
  ------------------------------------------ */
  async function showStoreActivationModal(storeId) {
    if (!storeId || storeId === 'todas') return;
    if (!useFirestore()) {
      Toast.error('Firestore não está disponível');
      return;
    }

    const allProducts = getAllProducts();
    const activeSet = _storeActiveMap[storeId] || new Set();

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;';

    const modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;border-radius:12px;max-width:700px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);';

    const storeLabel = DataStores.find(s => s.id === storeId);
    const storeName = storeLabel ? storeLabel.nome : storeId;

    modal.innerHTML = `
      <div style="padding:20px 24px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;">
        <h2 style="margin:0;font-size:18px;color:#1B4332;">Produtos Ativos — ${storeName}</h2>
        <button class="modal-close" style="background:none;border:none;font-size:24px;cursor:pointer;color:#888;">✕</button>
      </div>
      <div style="padding:12px 24px;background:#f8f9fa;border-bottom:1px solid #eee;display:flex;gap:8px;">
        <button class="btn-select-all" style="padding:6px 14px;border:1px solid #2D6A4F;background:#E8F5E9;color:#2D6A4F;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;">Ativar Todos</button>
        <button class="btn-deselect-all" style="padding:6px 14px;border:1px solid #C62828;background:#FFEBEE;color:#C62828;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;">Desativar Todos</button>
      </div>
      <div style="padding:16px 24px;max-height:60vh;overflow-y:auto;">
        ${allProducts.map(p => {
          const isActive = activeSet.has(p.id);
          return `
            <label style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f5f5f5;cursor:pointer;">
              <input type="checkbox" name="prod_${p.id}" ${isActive ? 'checked' : ''} style="width:18px;height:18px;">
              <img src="${p.imagem || ''}" alt="" style="width:32px;height:32px;border-radius:6px;object-fit:cover;background:#f0f0f0;" onerror="this.style.display='none'">
              <div style="flex:1;">
                <div style="font-weight:600;font-size:14px;color:#1B4332;">${p.nome}</div>
                <div style="font-size:12px;color:#888;">${getCategoryLabel(p.categoria)} • ${Utils.formatBRL(p.preco)}</div>
              </div>
            </label>
          `;
        }).join('')}
      </div>
      <div style="padding:12px 24px;border-top:1px solid #eee;display:flex;justify-content:flex-end;gap:8px;">
        <button class="modal-cancel" style="background:#f5f5f5;color:#666;border:1px solid #ddd;padding:10px 24px;border-radius:8px;cursor:pointer;font-size:14px;">Cancelar</button>
        <button class="modal-save" style="background:#2D6A4F;color:#fff;border:none;padding:10px 24px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;">Salvar</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('.modal-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    modal.querySelector('.btn-select-all').addEventListener('click', () => {
      modal.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
    });
    modal.querySelector('.btn-deselect-all').addEventListener('click', () => {
      modal.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    });

    modal.querySelector('.modal-save').addEventListener('click', async () => {
      const toActivate = [];
      const toDeactivate = [];

      allProducts.forEach(p => {
        const cb = modal.querySelector(`input[name="prod_${p.id}"]`);
        if (cb && cb.checked) toActivate.push(p.id);
        else toDeactivate.push(p.id);
      });

      try {
        // Bulk activate
        if (toActivate.length > 0) {
          await FirestoreService.StoreProducts.bulkActivate(storeId, toActivate);
        }
        // Deactivate individually
        for (const pid of toDeactivate) {
          await FirestoreService.StoreProducts.setActive(storeId, pid, false);
        }

        _storeActiveMap[storeId] = new Set(toActivate);
        Toast.success(`${toActivate.length} produtos ativos para ${storeName}`);
        close();
        render(currentStoreFilter);
      } catch (e) {
        Toast.error('Erro ao salvar: ' + e.message);
      }
    });
  }

  /* ------------------------------------------
     TOGGLE STATUS
  ------------------------------------------ */
  async function toggleProductStatus(id) {
    const all = getAllProducts();
    const product = all.find(p => p.id === id);
    if (!product) return;
    product.ativo = product.ativo === false ? true : false;
    await saveProduct(product);
    Toast.success(product.ativo ? 'Produto ativado' : 'Produto desativado');
    render(currentStoreFilter);
  }

  /* ------------------------------------------
     DUPLICATE
  ------------------------------------------ */
  async function duplicateProduct(id) {
    const all = getAllProducts();
    const original = all.find(p => p.id === id);
    if (!original) return;

    const copy = JSON.parse(JSON.stringify(original));
    copy.id = Utils.slugify('copia-' + original.nome) + '-' + Utils.generateId();
    copy.nome = 'Cópia de ' + original.nome;
    copy.codigoBarras = '';
    delete copy._id;
    await saveProduct(copy);
    Toast.success(`Produto duplicado: ${copy.nome}`);
    render(currentStoreFilter);
  }

  /* ------------------------------------------
     PRODUCT MODAL (New / Edit) — COMPLETE FORM
  ------------------------------------------ */
  function showProductModal(productId) {
    const all = getAllProducts();
    const product = productId ? all.find(p => p.id === productId) : null;
    const isEdit = !!product;
    const title = isEdit ? 'Editar Produto' : 'Novo Produto';

    // Defaults
    const p = product || {
      id: '', nome: '', categoria: '', descricao: '', preco: 0,
      variacoes: [{ peso: '250g', preco: 0 }],
      selos: [], beneficios: [], comoUsar: [], curiosidade: '', contraindicacoes: '',
      combinaCom: [],
      infoNutricional: { porcao: '', calorias: 0, proteinas: '', gorduras: '', carboidratos: '', fibras: '' },
      custoUnitario: 0, fornecedor: '', codigoBarras: '', ncm: '', unidadeMedida: 'KG', estoqueMinimo: 10,
      estoque: {},
      recorrencia: { elegivel: false, frequenciaSugerida: 30, descontoPercent: 10, fraseVenda: '' },
      imagem: '', ativo: true,
    };

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;';

    const modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;border-radius:12px;max-width:900px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);';

    const marginVal = calcMargin(p.preco, p.custoUnitario || 0);

    modal.innerHTML = `
      <div style="padding:20px 24px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;">
        <h2 style="margin:0;font-size:20px;color:#1B4332;">${title}</h2>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="btn-preview" style="background:#F57F17;color:#fff;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;">Preview</button>
          <button class="modal-close" style="background:none;border:none;font-size:24px;cursor:pointer;color:#888;">✕</button>
        </div>
      </div>
      <div style="padding:20px 24px;">
        <form class="prod-form">
          <!-- BÁSICO -->
          <fieldset style="border:1px solid #eee;border-radius:8px;padding:16px;margin-bottom:16px;">
            <legend style="font-weight:700;color:#1B4332;padding:0 8px;font-size:14px;">Básico</legend>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div>
                <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Nome</label>
                <input type="text" name="nome" value="${p.nome}" required style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;">
              </div>
              <div>
                <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Categoria</label>
                <select name="categoria" required style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;">
                  <option value="">Selecione</option>
                  ${DataCategories.map(c => `<option value="${c.id}" ${p.categoria === c.id ? 'selected' : ''}>${c.nome}</option>`).join('')}
                </select>
              </div>
              <div style="grid-column:1/-1;">
                <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Descrição</label>
                <textarea name="descricao" rows="3" style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;resize:vertical;box-sizing:border-box;">${p.descricao || ''}</textarea>
              </div>
              <div>
                <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Preço Base (R$)</label>
                <input type="number" name="preco" value="${p.preco}" step="0.01" min="0" style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;">
              </div>
              <div>
                <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Imagem URL</label>
                <input type="text" name="imagem" value="${p.imagem || ''}" style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;">
              </div>
            </div>
          </fieldset>

          <!-- VARIAÇÕES -->
          <fieldset style="border:1px solid #eee;border-radius:8px;padding:16px;margin-bottom:16px;">
            <legend style="font-weight:700;color:#1B4332;padding:0 8px;font-size:14px;">Variações</legend>
            <div class="variacoes-container">
              ${(p.variacoes || []).map((v, i) => `
                <div class="variacao-row" style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
                  <input type="text" name="var_peso_${i}" value="${v.peso}" placeholder="Ex: 250g" style="flex:1;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;">
                  <input type="number" name="var_preco_${i}" value="${v.preco}" step="0.01" min="0" placeholder="Preço" style="flex:1;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;">
                  <button type="button" class="btn-remove-var" data-idx="${i}" style="background:#FFEBEE;color:#C62828;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:16px;">✕</button>
                </div>
              `).join('')}
            </div>
            <button type="button" class="btn-add-var" style="background:#E8F5E9;color:#2E7D32;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;">+ Adicionar Variação</button>
          </fieldset>

          <!-- SELOS -->
          <fieldset style="border:1px solid #eee;border-radius:8px;padding:16px;margin-bottom:16px;">
            <legend style="font-weight:700;color:#1B4332;padding:0 8px;font-size:14px;">Selos</legend>
            <div style="display:flex;flex-wrap:wrap;gap:12px;">
              ${SELOS_LIST.map(s => `
                <label style="display:flex;align-items:center;gap:4px;font-size:13px;cursor:pointer;">
                  <input type="checkbox" name="selo_${s.key}" ${(p.selos || []).includes(s.key) ? 'checked' : ''}>
                  ${Utils.seloIcon(s.key)} ${s.label}
                </label>
              `).join('')}
            </div>
          </fieldset>

          <!-- INFO INTELIGENTE -->
          <fieldset style="border:1px solid #eee;border-radius:8px;padding:16px;margin-bottom:16px;">
            <legend style="font-weight:700;color:#1B4332;padding:0 8px;font-size:14px;">Info Inteligente</legend>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div>
                <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Benefícios (um por linha)</label>
                <textarea name="beneficios" rows="4" style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:13px;resize:vertical;box-sizing:border-box;">${(p.beneficios || []).join('\n')}</textarea>
              </div>
              <div>
                <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Como Usar (um por linha)</label>
                <textarea name="comoUsar" rows="4" style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:13px;resize:vertical;box-sizing:border-box;">${(p.comoUsar || []).join('\n')}</textarea>
              </div>
              <div>
                <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Curiosidade</label>
                <textarea name="curiosidade" rows="3" style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:13px;resize:vertical;box-sizing:border-box;">${p.curiosidade || ''}</textarea>
              </div>
              <div>
                <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Contraindicações</label>
                <textarea name="contraindicacoes" rows="3" style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:13px;resize:vertical;box-sizing:border-box;">${p.contraindicacoes || ''}</textarea>
              </div>
            </div>
          </fieldset>

          <!-- COMBINA COM -->
          <fieldset style="border:1px solid #eee;border-radius:8px;padding:16px;margin-bottom:16px;">
            <legend style="font-weight:700;color:#1B4332;padding:0 8px;font-size:14px;">Combina Com</legend>
            <div style="display:flex;flex-wrap:wrap;gap:6px;max-height:200px;overflow-y:auto;">
              ${getAllProducts().filter(op => op.id !== p.id).map(op => `
                <label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;padding:4px 8px;background:#f8f9fa;border-radius:6px;">
                  <input type="checkbox" name="combina_${op.id}" ${(p.combinaCom || []).includes(op.id) ? 'checked' : ''}>
                  ${op.nome}
                </label>
              `).join('')}
            </div>
          </fieldset>

          <!-- INFO NUTRICIONAL -->
          <fieldset style="border:1px solid #eee;border-radius:8px;padding:16px;margin-bottom:16px;">
            <legend style="font-weight:700;color:#1B4332;padding:0 8px;font-size:14px;">Info Nutricional</legend>
            <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:12px;">
              <div>
                <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Porção</label>
                <input type="text" name="nut_porcao" value="${(p.infoNutricional || {}).porcao || ''}" style="width:100%;padding:6px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;">
              </div>
              <div>
                <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Calorias (kcal)</label>
                <input type="number" name="nut_calorias" value="${(p.infoNutricional || {}).calorias || 0}" min="0" style="width:100%;padding:6px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;">
              </div>
              <div>
                <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Proteínas</label>
                <input type="text" name="nut_proteinas" value="${(p.infoNutricional || {}).proteinas || ''}" style="width:100%;padding:6px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;">
              </div>
              <div>
                <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Gorduras</label>
                <input type="text" name="nut_gorduras" value="${(p.infoNutricional || {}).gorduras || ''}" style="width:100%;padding:6px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;">
              </div>
              <div>
                <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Carboidratos</label>
                <input type="text" name="nut_carboidratos" value="${(p.infoNutricional || {}).carboidratos || ''}" style="width:100%;padding:6px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;">
              </div>
              <div>
                <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Fibras</label>
                <input type="text" name="nut_fibras" value="${(p.infoNutricional || {}).fibras || ''}" style="width:100%;padding:6px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;">
              </div>
            </div>
          </fieldset>

          <!-- CONTROLE -->
          <fieldset style="border:1px solid #eee;border-radius:8px;padding:16px;margin-bottom:16px;">
            <legend style="font-weight:700;color:#1B4332;padding:0 8px;font-size:14px;">Controle</legend>
            <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:12px;">
              <div>
                <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Custo Unitário (R$)</label>
                <input type="number" name="custoUnitario" value="${p.custoUnitario || 0}" step="0.01" min="0" style="width:100%;padding:6px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;">
              </div>
              <div>
                <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Margem Calculada</label>
                <input type="text" name="margemCalc" value="${marginVal.toFixed(1)}%" readonly style="width:100%;padding:6px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;background:#f8f9fa;box-sizing:border-box;">
              </div>
              <div>
                <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Fornecedor</label>
                <input type="text" name="fornecedor" value="${p.fornecedor || ''}" style="width:100%;padding:6px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;">
              </div>
              <div>
                <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Código de Barras</label>
                <input type="text" name="codigoBarras" value="${p.codigoBarras || ''}" style="width:100%;padding:6px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;">
              </div>
              <div>
                <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">NCM</label>
                <input type="text" name="ncm" value="${p.ncm || ''}" style="width:100%;padding:6px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;">
              </div>
              <div>
                <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Unidade Medida</label>
                <select name="unidadeMedida" style="width:100%;padding:6px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;">
                  ${['KG', 'G', 'UN', 'ML', 'L'].map(u => `<option value="${u}" ${p.unidadeMedida === u ? 'selected' : ''}>${u}</option>`).join('')}
                </select>
              </div>
              <div>
                <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Estoque Mínimo</label>
                <input type="number" name="estoqueMinimo" value="${p.estoqueMinimo || 10}" min="0" style="width:100%;padding:6px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;">
              </div>
            </div>
          </fieldset>

          <!-- RECORRÊNCIA -->
          <fieldset style="border:1px solid #eee;border-radius:8px;padding:16px;margin-bottom:16px;">
            <legend style="font-weight:700;color:#1B4332;padding:0 8px;font-size:14px;">Recorrência</legend>
            <div style="display:grid;grid-template-columns:repeat(2, 1fr);gap:12px;">
              <div>
                <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;">
                  <input type="checkbox" name="rec_elegivel" ${(p.recorrencia && p.recorrencia.elegivel) ? 'checked' : ''}>
                  Elegível para Assinatura
                </label>
              </div>
              <div></div>
              <div>
                <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Frequência Sugerida (dias)</label>
                <input type="number" name="rec_frequencia" value="${(p.recorrencia || {}).frequenciaSugerida || 30}" min="1" style="width:100%;padding:6px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;">
              </div>
              <div>
                <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Desconto (%)</label>
                <input type="number" name="rec_desconto" value="${(p.recorrencia || {}).descontoPercent || 10}" min="0" max="100" style="width:100%;padding:6px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;">
              </div>
              <div style="grid-column:1/-1;">
                <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Frase de Venda</label>
                <input type="text" name="rec_frase" value="${(p.recorrencia || {}).fraseVenda || ''}" placeholder="Ex: Receba todo mês com desconto!" style="width:100%;padding:6px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;">
              </div>
            </div>
          </fieldset>

          <div style="display:flex;gap:12px;justify-content:flex-end;margin-top:20px;">
            <button type="button" class="modal-cancel" style="background:#f5f5f5;color:#666;border:1px solid #ddd;padding:10px 24px;border-radius:8px;cursor:pointer;font-size:14px;">Cancelar</button>
            <button type="submit" style="background:#2D6A4F;color:#fff;border:none;padding:10px 24px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;">${isEdit ? 'Salvar' : 'Criar'}</button>
          </div>
        </form>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Auto-calc margin
    const precoInput = modal.querySelector('input[name="preco"]');
    const custoInput = modal.querySelector('input[name="custoUnitario"]');
    const margemInput = modal.querySelector('input[name="margemCalc"]');
    function updateMargin() {
      const preco = parseFloat(precoInput.value) || 0;
      const custo = parseFloat(custoInput.value) || 0;
      margemInput.value = calcMargin(preco, custo).toFixed(1) + '%';
    }
    precoInput.addEventListener('input', updateMargin);
    custoInput.addEventListener('input', updateMargin);

    // Add/remove variations
    const varContainer = modal.querySelector('.variacoes-container');
    modal.querySelector('.btn-add-var').addEventListener('click', () => {
      const count = varContainer.querySelectorAll('.variacao-row').length;
      const row = document.createElement('div');
      row.className = 'variacao-row';
      row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:8px;';
      row.innerHTML = `
        <input type="text" name="var_peso_${count}" placeholder="Ex: 500g" style="flex:1;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;">
        <input type="number" name="var_preco_${count}" step="0.01" min="0" placeholder="Preço" style="flex:1;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;">
        <button type="button" class="btn-remove-var" style="background:#FFEBEE;color:#C62828;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:16px;">✕</button>
      `;
      varContainer.appendChild(row);
      row.querySelector('.btn-remove-var').addEventListener('click', () => row.remove());
    });
    modal.querySelectorAll('.btn-remove-var').forEach(btn => {
      btn.addEventListener('click', () => btn.closest('.variacao-row').remove());
    });

    // Preview button
    modal.querySelector('.btn-preview').addEventListener('click', () => {
      showPreview(modal);
    });

    // Close
    const close = () => overlay.remove();
    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('.modal-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    // Submit
    modal.querySelector('.prod-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;

      // Gather variations
      const variacoes = [];
      const varRows = varContainer.querySelectorAll('.variacao-row');
      varRows.forEach((row, i) => {
        const pesoInput = row.querySelector('input[type="text"]');
        const precoVarInput = row.querySelector('input[type="number"]');
        if (pesoInput && precoVarInput && pesoInput.value.trim()) {
          variacoes.push({ peso: pesoInput.value.trim(), preco: parseFloat(precoVarInput.value) || 0 });
        }
      });

      // Gather selos
      const selos = SELOS_LIST.filter(s => form.querySelector(`input[name="selo_${s.key}"]`).checked).map(s => s.key);

      // Gather combinaCom
      const combinaCom = [];
      getAllProducts().forEach(op => {
        if (op.id === (product ? product.id : '')) return;
        const cb = form.querySelector(`input[name="combina_${op.id}"]`);
        if (cb && cb.checked) combinaCom.push(op.id);
      });

      const newProduct = {
        ...(product || {}),
        id: product ? product.id : Utils.slugify(form.nome.value) + '-' + Utils.generateId(),
        nome: form.nome.value.trim(),
        categoria: form.categoria.value,
        descricao: form.descricao.value.trim(),
        preco: parseFloat(form.preco.value) || 0,
        imagem: form.imagem.value.trim(),
        variacoes,
        selos,
        beneficios: form.beneficios.value.trim().split('\n').filter(l => l.trim()),
        comoUsar: form.comoUsar.value.trim().split('\n').filter(l => l.trim()),
        curiosidade: form.curiosidade.value.trim(),
        contraindicacoes: form.contraindicacoes.value.trim(),
        combinaCom,
        infoNutricional: {
          porcao: form.nut_porcao.value.trim(),
          calorias: parseInt(form.nut_calorias.value) || 0,
          proteinas: form.nut_proteinas.value.trim(),
          gorduras: form.nut_gorduras.value.trim(),
          carboidratos: form.nut_carboidratos.value.trim(),
          fibras: form.nut_fibras.value.trim(),
        },
        custoUnitario: parseFloat(form.custoUnitario.value) || 0,
        margemLucro: calcMargin(parseFloat(form.preco.value) || 0, parseFloat(form.custoUnitario.value) || 0),
        fornecedor: form.fornecedor.value.trim(),
        codigoBarras: form.codigoBarras.value.trim(),
        ncm: form.ncm.value.trim(),
        unidadeMedida: form.unidadeMedida.value,
        estoqueMinimo: parseInt(form.estoqueMinimo.value) || 10,
        ativo: product ? product.ativo : true,
        recorrencia: {
          elegivel: form.rec_elegivel.checked,
          frequenciaSugerida: parseInt(form.rec_frequencia.value) || 30,
          descontoPercent: parseInt(form.rec_desconto.value) || 0,
          fraseVenda: form.rec_frase.value.trim(),
        },
      };
      delete newProduct._id;

      await saveProduct(newProduct);
      close();
      Toast.success(isEdit ? 'Produto atualizado!' : 'Produto criado!');
      render(currentStoreFilter);
    });
  }

  /* ------------------------------------------
     PREVIEW
  ------------------------------------------ */
  function showPreview(formModal) {
    const form = formModal.querySelector('.prod-form');
    const nome = form.nome.value || 'Sem Nome';
    const preco = parseFloat(form.preco.value) || 0;
    const descricao = form.descricao.value || '';
    const imagem = form.imagem.value || '';

    const selos = SELOS_LIST.filter(s => form.querySelector(`input[name="selo_${s.key}"]`).checked);

    const previewOverlay = document.createElement('div');
    previewOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10002;display:flex;align-items:center;justify-content:center;padding:16px;';

    const card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:16px;max-width:320px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.4);overflow:hidden;';

    card.innerHTML = `
      <div style="height:180px;background:#f0f0f0;display:flex;align-items:center;justify-content:center;overflow:hidden;">
        ${imagem ? `<img src="${imagem}" alt="${nome}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.innerHTML='<span style=font-size:48px>🌿</span>'">` : '<span style="font-size:48px;">🌿</span>'}
      </div>
      <div style="padding:16px;">
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;">
          ${selos.map(s => `<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:#E8F5E9;color:#2E7D32;">${Utils.seloIcon(s.key)} ${s.label}</span>`).join('')}
        </div>
        <h3 style="margin:0 0 4px;font-size:16px;color:#1B4332;">${nome}</h3>
        <p style="margin:0 0 8px;font-size:13px;color:#666;line-height:1.4;">${descricao.slice(0, 100)}${descricao.length > 100 ? '...' : ''}</p>
        <div style="font-size:20px;font-weight:700;color:#2D6A4F;">${Utils.formatBRL(preco)}</div>
      </div>
      <div style="padding:0 16px 16px;text-align:center;">
        <button style="width:100%;padding:10px;background:#2D6A4F;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">Adicionar ao Carrinho</button>
      </div>
    `;

    previewOverlay.appendChild(card);
    document.body.appendChild(previewOverlay);

    previewOverlay.addEventListener('click', (e) => {
      if (e.target === previewOverlay) previewOverlay.remove();
    });
    card.addEventListener('click', (e) => e.stopPropagation());
    card.querySelector('button').addEventListener('click', () => previewOverlay.remove());
  }

  /* ------------------------------------------
     PUBLIC API
  ------------------------------------------ */
  return { render };
})();
