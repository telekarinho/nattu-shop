/* ============================================
   CLUBE DO NATURAL — Admin Restock (Pedido de Compra)
   Easy ordering page with full stock visibility.
   Shows: what to buy, how much, for which store.
   ============================================ */

const AdminRestock = (() => {
  const container = () => document.getElementById('restock-content');

  let currentStoreFilter = 'todas';
  let _products = [];
  let _stores = [];
  let _stockData = {}; // { storeId: { productId: { quantidade, estoqueMinimo } } }
  let _cart = []; // Restock cart: [{ productId, productName, storeId, quantidade, custoUnitario }]

  function useFirestore() {
    return typeof FirestoreService !== 'undefined' && FirestoreService.ready;
  }

  /* ------------------------------------------
     DATA LOADING
  ------------------------------------------ */
  async function loadData() {
    if (useFirestore()) {
      try {
        _products = await FirestoreService.Products.getAll();
        _stores = await FirestoreService.Stores.getAll();
        const storesToLoad = _stores.map(s => s.id);
        await Promise.all(storesToLoad.map(async (storeId) => {
          const stockDocs = await FirestoreService.Stock.getForStore(storeId);
          _stockData[storeId] = {};
          stockDocs.forEach(s => {
            _stockData[storeId][s.productId || s._id] = {
              quantidade: s.quantidade || 0,
              estoqueMinimo: s.estoqueMinimo || 10,
            };
          });
        }));
        return;
      } catch (e) {
        console.warn('[Restock] Firestore load failed:', e.message);
      }
    }
    // Fallback
    _products = typeof DataProducts !== 'undefined' ? DataProducts.filter(p => p.ativo !== false) : [];
    _stores = typeof DataStores !== 'undefined' ? DataStores : [];
    const overrides = Storage.get('product_stock_overrides') || {};
    _stores.forEach(store => {
      _stockData[store.id] = {};
      _products.forEach(p => {
        const override = overrides[p.id] && overrides[p.id][store.id];
        _stockData[store.id][p.id] = {
          quantidade: override !== undefined ? override : ((p.estoque && p.estoque[store.id]) || 0),
          estoqueMinimo: p.estoqueMinimo || 10,
        };
      });
    });
  }

  function getStockQty(productId, storeId) {
    return (_stockData[storeId] && _stockData[storeId][productId])
      ? _stockData[storeId][productId].quantidade : 0;
  }

  function getMinStock(productId, storeId) {
    return (_stockData[storeId] && _stockData[storeId][productId])
      ? _stockData[storeId][productId].estoqueMinimo : 10;
  }

  function getTotalStock(productId) {
    let total = 0;
    _stores.forEach(s => { total += getStockQty(productId, s.id); });
    return total;
  }

  function getStoreLabel(storeId) {
    const s = _stores.find(st => st.id === storeId);
    return s ? (s.nome.split(' - ')[1] || s.nome) : storeId;
  }

  function getCategoryLabel(catId) {
    const cat = typeof DataCategories !== 'undefined' ? DataCategories.find(c => c.id === catId) : null;
    return cat ? cat.nome : catId;
  }

  /* ------------------------------------------
     BUILD RESTOCK SUGGESTIONS
     Products below minimum stock in any store.
  ------------------------------------------ */
  function buildSuggestions() {
    const suggestions = [];

    _products.forEach(p => {
      const storesToCheck = currentStoreFilter !== 'todas'
        ? [currentStoreFilter]
        : _stores.map(s => s.id);

      storesToCheck.forEach(storeId => {
        const qty = getStockQty(p.id, storeId);
        const min = getMinStock(p.id, storeId);

        if (qty <= min) {
          const suggestedQty = Math.max(min * 2 - qty, min); // Order enough to reach 2x minimum
          suggestions.push({
            productId: p.id,
            productName: p.nome,
            categoria: p.categoria,
            storeId,
            currentQty: qty,
            minQty: min,
            suggestedQty,
            custoUnitario: p.custoUnitario || 0,
            fornecedor: p.fornecedor || '',
            codigoBarras: p.codigoBarras || '',
            status: qty === 0 ? 'zerado' : 'baixo',
          });
        }
      });
    });

    // Sort: zerado first, then baixo, then by name
    suggestions.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'zerado' ? -1 : 1;
      return a.productName.localeCompare(b.productName);
    });

    return suggestions;
  }

  /* ------------------------------------------
     CART OPERATIONS
  ------------------------------------------ */
  function addToCart(productId, productName, storeId, quantidade, custoUnitario) {
    const existing = _cart.find(c => c.productId === productId && c.storeId === storeId);
    if (existing) {
      existing.quantidade += quantidade;
    } else {
      _cart.push({ productId, productName, storeId, quantidade, custoUnitario });
    }
  }

  function removeFromCart(idx) {
    _cart.splice(idx, 1);
  }

  function clearCart() {
    _cart = [];
  }

  function getCartTotal() {
    return _cart.reduce((s, c) => s + c.quantidade * c.custoUnitario, 0);
  }

  /* ------------------------------------------
     PROCESS ORDER (entrada de estoque)
  ------------------------------------------ */
  async function processRestockOrder() {
    if (_cart.length === 0) {
      Toast.error('Carrinho vazio');
      return;
    }

    let processed = 0;
    for (const item of _cart) {
      try {
        if (useFirestore()) {
          await FirestoreService.StockOps.entrada(
            item.storeId, item.productId, item.productName,
            item.quantidade, 'Pedido de compra (restock)',
            `Custo unit.: R$ ${item.custoUnitario.toFixed(2)}`
          );
        } else {
          const overrides = Storage.get('product_stock_overrides') || {};
          if (!overrides[item.productId]) overrides[item.productId] = {};
          const currentQty = getStockQty(item.productId, item.storeId);
          overrides[item.productId][item.storeId] = currentQty + item.quantidade;
          Storage.set('product_stock_overrides', overrides);
        }
        processed++;
      } catch (e) {
        Toast.error(`Erro em ${item.productName}: ${e.message}`);
      }
    }

    Toast.success(`${processed} itens processados! Estoque atualizado.`);
    clearCart();
    _stockData = {};
    render(currentStoreFilter);
  }

  /* ------------------------------------------
     RENDER
  ------------------------------------------ */
  async function render(storeFilter) {
    const el = container();
    if (!el) return;

    currentStoreFilter = storeFilter || 'todas';
    el.innerHTML = '<div style="text-align:center;padding:40px;color:#888;">Carregando dados de estoque...</div>';

    _stockData = {};
    await loadData();

    const suggestions = buildSuggestions();
    const allProducts = _products.filter(p => p.ativo !== false);

    el.innerHTML = `
      <style>
        .restock-layout { display:grid;grid-template-columns:1fr 340px;gap:20px; }
        @media (max-width:900px) { .restock-layout { grid-template-columns:1fr; } }
        .restock-alerts {
          background:#FFF8E1;border:1px solid #FFE082;border-radius:10px;padding:16px;margin-bottom:20px;
        }
        .restock-alerts__title { font-weight:700;color:#F57F17;font-size:15px;margin:0 0 10px; }
        .restock-suggestions { background:#fff;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,0.06);overflow:hidden; }
        .restock-table { width:100%;border-collapse:collapse;font-size:13px; }
        .restock-table th {
          text-align:left;padding:10px 12px;background:#f8f9fa;font-weight:600;color:#555;
          border-bottom:2px solid #eee;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;
        }
        .restock-table td { padding:10px 12px;border-bottom:1px solid #f0f0f0; }
        .restock-table tr:hover td { background:#f8fdf9; }
        .restock-badge { display:inline-block;padding:3px 10px;border-radius:10px;font-size:11px;font-weight:600; }
        .restock-badge--zerado { background:#FFEBEE;color:#C62828; }
        .restock-badge--baixo { background:#FFF8E1;color:#F57F17; }
        .restock-add-btn {
          background:#2D6A4F;color:#fff;border:none;padding:4px 12px;border-radius:6px;
          cursor:pointer;font-size:12px;font-weight:600;
        }
        .restock-add-btn:hover { background:#1B4332; }
        .restock-cart {
          background:#fff;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,0.06);
          position:sticky;top:20px;
        }
        .restock-cart__header {
          padding:16px;border-bottom:1px solid #eee;font-weight:700;color:#1B4332;font-size:16px;
        }
        .restock-cart__items { padding:8px 16px;max-height:400px;overflow-y:auto; }
        .restock-cart__item {
          display:flex;justify-content:space-between;align-items:center;padding:8px 0;
          border-bottom:1px solid #f5f5f5;font-size:13px;
        }
        .restock-cart__item-remove {
          background:none;border:none;color:#C62828;cursor:pointer;font-size:16px;padding:0 4px;
        }
        .restock-cart__footer {
          padding:16px;border-top:1px solid #eee;
        }
        .restock-cart__total {
          display:flex;justify-content:space-between;font-weight:700;font-size:16px;color:#1B4332;
          margin-bottom:12px;
        }
        .restock-process-btn {
          width:100%;padding:12px;background:#2D6A4F;color:#fff;border:none;border-radius:8px;
          cursor:pointer;font-size:15px;font-weight:700;
        }
        .restock-process-btn:hover { background:#1B4332; }
        .restock-process-btn:disabled { background:#ccc;cursor:not-allowed; }

        .restock-all-products { margin-top:20px; }
        .restock-search {
          padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;
          width:100%;max-width:400px;margin-bottom:12px;box-sizing:border-box;
        }
      </style>

      <!-- Alerts -->
      ${suggestions.length > 0 ? `
      <div class="restock-alerts">
        <h3 class="restock-alerts__title">
          ⚠️ ${suggestions.filter(s => s.status === 'zerado').length} produtos zerados,
          ${suggestions.filter(s => s.status === 'baixo').length} com estoque baixo
        </h3>
        <div style="font-size:13px;color:#555;">
          Estes produtos precisam de reposição. Adicione ao pedido de compra abaixo.
        </div>
      </div>
      ` : '<div style="background:#E8F5E9;border-radius:10px;padding:16px;margin-bottom:20px;color:#2E7D32;font-weight:600;">✅ Todos os produtos com estoque adequado!</div>'}

      <div class="restock-layout">
        <!-- Left: Suggestions + All Products -->
        <div>
          ${suggestions.length > 0 ? `
          <div class="restock-suggestions" style="margin-bottom:20px;">
            <div style="padding:14px 16px;border-bottom:1px solid #eee;font-weight:700;color:#C62828;font-size:15px;">
              Precisam de Reposição
            </div>
            <div style="overflow-x:auto;">
              <table class="restock-table">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Loja</th>
                    <th>Atual</th>
                    <th>Mínimo</th>
                    <th>Status</th>
                    <th>Sugestão</th>
                    <th>Custo</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${suggestions.map((s, idx) => `
                    <tr>
                      <td style="font-weight:600;color:#1B4332;">${s.productName}</td>
                      <td>${getStoreLabel(s.storeId)}</td>
                      <td style="font-weight:600;color:${s.status === 'zerado' ? '#C62828' : '#F57F17'};">${s.currentQty}</td>
                      <td>${s.minQty}</td>
                      <td><span class="restock-badge restock-badge--${s.status}">${s.status === 'zerado' ? 'Zerado' : 'Baixo'}</span></td>
                      <td>
                        <input type="number" class="restock-qty" data-idx="${idx}" value="${s.suggestedQty}" min="1"
                          style="width:60px;padding:4px 6px;border:1px solid #ddd;border-radius:6px;font-size:13px;text-align:center;">
                      </td>
                      <td style="font-size:12px;color:#888;">${s.custoUnitario > 0 ? Utils.formatBRL(s.custoUnitario) : '—'}</td>
                      <td>
                        <button class="restock-add-btn" data-idx="${idx}">+ Pedido</button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
            <div style="padding:12px 16px;border-top:1px solid #eee;">
              <button class="restock-add-all-btn" style="background:#1565C0;color:#fff;border:none;padding:8px 20px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;">
                Adicionar Todos ao Pedido
              </button>
            </div>
          </div>
          ` : ''}

          <!-- All Products for manual ordering -->
          <div class="restock-all-products">
            <h3 style="margin:0 0 12px;color:#1B4332;font-size:16px;">Todos os Produtos</h3>
            <input type="search" class="restock-search" placeholder="Buscar produto para pedir...">
            <div class="restock-suggestions">
              <div style="overflow-x:auto;">
                <table class="restock-table" id="restock-all-table">
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Categoria</th>
                      <th>Estoque Total</th>
                      ${_stores.map(s => `<th>${getStoreLabel(s.id)}</th>`).join('')}
                      <th>Custo</th>
                      <th>Fornecedor</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    ${allProducts.map(p => {
                      const total = getTotalStock(p.id);
                      return `
                      <tr class="restock-product-row" data-name="${p.nome.toLowerCase()}">
                        <td style="font-weight:600;color:#1B4332;">${p.nome}</td>
                        <td style="font-size:12px;">${getCategoryLabel(p.categoria)}</td>
                        <td style="font-weight:600;">${total}</td>
                        ${_stores.map(s => {
                          const qty = getStockQty(p.id, s.id);
                          const min = getMinStock(p.id, s.id);
                          const color = qty === 0 ? '#C62828' : qty <= min ? '#F57F17' : '#2E7D32';
                          return `<td style="color:${color};font-weight:600;">${qty}</td>`;
                        }).join('')}
                        <td style="font-size:12px;">${p.custoUnitario ? Utils.formatBRL(p.custoUnitario) : '—'}</td>
                        <td style="font-size:12px;color:#888;">${p.fornecedor || '—'}</td>
                        <td>
                          <button class="restock-manual-add" data-pid="${p.id}" data-name="${p.nome}" data-custo="${p.custoUnitario || 0}"
                            style="background:#E8F5E9;color:#2D6A4F;border:1px solid #A5D6A7;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:12px;">
                            + Pedir
                          </button>
                        </td>
                      </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <!-- Right: Cart -->
        <div class="restock-cart">
          <div class="restock-cart__header">🛒 Pedido de Compra (${_cart.length})</div>
          <div class="restock-cart__items">
            ${_cart.length === 0
              ? '<div style="text-align:center;color:#999;padding:24px;font-size:13px;">Nenhum item no pedido</div>'
              : _cart.map((item, idx) => `
                <div class="restock-cart__item">
                  <div>
                    <div style="font-weight:600;color:#1B4332;">${item.productName}</div>
                    <div style="font-size:11px;color:#888;">${getStoreLabel(item.storeId)} • ${item.quantidade} un</div>
                  </div>
                  <div style="display:flex;align-items:center;gap:6px;">
                    <span style="font-weight:600;">${Utils.formatBRL(item.quantidade * item.custoUnitario)}</span>
                    <button class="restock-cart__item-remove" data-idx="${idx}">✕</button>
                  </div>
                </div>
              `).join('')
            }
          </div>
          <div class="restock-cart__footer">
            <div class="restock-cart__total">
              <span>Total Estimado</span>
              <span>${Utils.formatBRL(getCartTotal())}</span>
            </div>
            <button class="restock-process-btn" ${_cart.length === 0 ? 'disabled' : ''}>
              Confirmar Entrada no Estoque
            </button>
            ${_cart.length > 0 ? `
            <button class="restock-export-btn" style="width:100%;padding:8px;background:#fff;color:#1565C0;border:1px solid #1565C0;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;margin-top:8px;">
              Exportar Lista de Compras
            </button>
            <button class="restock-clear-btn" style="width:100%;padding:8px;background:#fff;color:#C62828;border:1px solid #FFCDD2;border-radius:8px;cursor:pointer;font-size:13px;margin-top:8px;">
              Limpar Pedido
            </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;

    bindEvents(el, suggestions);
  }

  function bindEvents(el, suggestions) {
    // Add suggestion items to cart
    el.querySelectorAll('.restock-add-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        const s = suggestions[idx];
        const qtyInput = el.querySelector(`.restock-qty[data-idx="${idx}"]`);
        const qty = parseInt(qtyInput.value) || s.suggestedQty;
        addToCart(s.productId, s.productName, s.storeId, qty, s.custoUnitario);
        Toast.success(`${s.productName} adicionado ao pedido`);
        render(currentStoreFilter);
      });
    });

    // Add all suggestions
    const btnAddAll = el.querySelector('.restock-add-all-btn');
    if (btnAddAll) {
      btnAddAll.addEventListener('click', () => {
        suggestions.forEach((s, idx) => {
          const qtyInput = el.querySelector(`.restock-qty[data-idx="${idx}"]`);
          const qty = parseInt(qtyInput.value) || s.suggestedQty;
          addToCart(s.productId, s.productName, s.storeId, qty, s.custoUnitario);
        });
        Toast.success(`${suggestions.length} itens adicionados ao pedido`);
        render(currentStoreFilter);
      });
    }

    // Manual add from all products
    el.querySelectorAll('.restock-manual-add').forEach(btn => {
      btn.addEventListener('click', () => {
        const pid = btn.dataset.pid;
        const name = btn.dataset.name;
        const custo = parseFloat(btn.dataset.custo) || 0;
        const storeId = currentStoreFilter !== 'todas' ? currentStoreFilter : (_stores[0] ? _stores[0].id : 'centro');
        showManualAddModal(pid, name, custo, storeId);
      });
    });

    // Search filter
    const searchInput = el.querySelector('.restock-search');
    if (searchInput) {
      searchInput.addEventListener('input', Utils.debounce((e) => {
        const term = e.target.value.toLowerCase();
        el.querySelectorAll('.restock-product-row').forEach(row => {
          row.style.display = row.dataset.name.includes(term) ? '' : 'none';
        });
      }, 300));
    }

    // Cart remove
    el.querySelectorAll('.restock-cart__item-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        removeFromCart(parseInt(btn.dataset.idx));
        render(currentStoreFilter);
      });
    });

    // Process order
    const processBtn = el.querySelector('.restock-process-btn');
    if (processBtn) {
      processBtn.addEventListener('click', async () => {
        if (!confirm(`Confirmar entrada de ${_cart.length} itens no estoque?\n\nTotal estimado: ${Utils.formatBRL(getCartTotal())}`)) return;
        processBtn.disabled = true;
        processBtn.textContent = 'Processando...';
        await processRestockOrder();
      });
    }

    // Export
    const exportBtn = el.querySelector('.restock-export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const header = 'Produto;Loja;Quantidade;Custo Unit.;Total';
        const lines = _cart.map(c =>
          `${c.productName};${getStoreLabel(c.storeId)};${c.quantidade};${c.custoUnitario.toFixed(2)};${(c.quantidade * c.custoUnitario).toFixed(2)}`
        );
        lines.push(`;;TOTAL;;${getCartTotal().toFixed(2)}`);
        const csv = [header, ...lines].join('\n');
        navigator.clipboard.writeText(csv).then(() => Toast.success('Lista copiada!'));
      });
    }

    // Clear
    const clearBtn = el.querySelector('.restock-clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (!confirm('Limpar o pedido de compra?')) return;
        clearCart();
        render(currentStoreFilter);
      });
    }
  }

  function showManualAddModal(productId, productName, custoUnitario, defaultStoreId) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10001;display:flex;align-items:center;justify-content:center;padding:16px;';

    const modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;border-radius:12px;max-width:400px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.3);';

    modal.innerHTML = `
      <div style="padding:16px 20px;border-bottom:1px solid #eee;">
        <h3 style="margin:0;font-size:16px;color:#1B4332;">Pedir: ${productName}</h3>
      </div>
      <div style="padding:20px;">
        <div style="margin-bottom:14px;">
          <label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Loja</label>
          <select class="modal-store" style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;">
            ${_stores.map(s => `<option value="${s.id}" ${s.id === defaultStoreId ? 'selected' : ''}>${s.nome}</option>`).join('')}
          </select>
        </div>
        <div style="margin-bottom:14px;">
          <label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Quantidade</label>
          <input type="number" class="modal-qty" value="10" min="1" style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;">
        </div>
      </div>
      <div style="padding:12px 20px;border-top:1px solid #eee;display:flex;gap:8px;justify-content:flex-end;">
        <button class="modal-cancel" style="background:#f5f5f5;color:#666;border:1px solid #ddd;padding:8px 20px;border-radius:8px;cursor:pointer;">Cancelar</button>
        <button class="modal-confirm" style="background:#2D6A4F;color:#fff;border:none;padding:8px 20px;border-radius:8px;cursor:pointer;font-weight:600;">Adicionar</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    modal.querySelector('.modal-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    modal.querySelector('.modal-confirm').addEventListener('click', () => {
      const storeId = modal.querySelector('.modal-store').value;
      const qty = parseInt(modal.querySelector('.modal-qty').value) || 10;
      addToCart(productId, productName, storeId, qty, custoUnitario);
      Toast.success(`${productName} adicionado ao pedido`);
      close();
      render(currentStoreFilter);
    });
  }

  /* ------------------------------------------
     PUBLIC API
  ------------------------------------------ */
  return { render };
})();
