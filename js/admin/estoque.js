/* ============================================
   CLUBE DO NATURAL — Admin Estoque
   Gestão de inventário multi-loja com Firestore.
   Supports: entrada, saída, transferência, ajuste,
   NF-e XML import, CSV export, movement history.
   ============================================ */

const AdminEstoque = (() => {
  const container = () => document.getElementById('estoque-content');

  let currentStoreFilter = 'todas';
  let searchTerm = '';
  let statusFilter = 'todos';
  let categoryFilter = 'todas';

  // Cached data loaded async
  let _products = [];
  let _stores = [];
  let _stockData = {}; // { storeId: { productId: { quantidade, estoqueMinimo } } }

  const STATUS_COLORS = {
    ok:     { bg: '#E8F5E9', text: '#2E7D32', label: 'OK' },
    baixo:  { bg: '#FFF8E1', text: '#F57F17', label: 'Baixo' },
    zerado: { bg: '#FFEBEE', text: '#C62828', label: 'Zerado' },
  };

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

        // Load stock for relevant stores
        const storesToLoad = currentStoreFilter !== 'todas'
          ? [currentStoreFilter]
          : _stores.map(s => s.id);

        await Promise.all(storesToLoad.map(async (storeId) => {
          if (!_stockData[storeId]) {
            const stockDocs = await FirestoreService.Stock.getForStore(storeId);
            _stockData[storeId] = {};
            stockDocs.forEach(s => {
              _stockData[storeId][s.productId || s._id] = {
                quantidade: s.quantidade || 0,
                estoqueMinimo: s.estoqueMinimo || 10,
              };
            });
          }
        }));
        return;
      } catch (e) {
        console.warn('[Estoque] Firestore load failed, using fallback:', e.message);
      }
    }

    // Fallback
    _products = DataProducts.filter(p => p.ativo !== false);
    _stores = DataStores;
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

  /* ------------------------------------------
     HELPERS
  ------------------------------------------ */
  function getStoreLabel(lojaId) {
    const store = _stores.find(s => s.id === lojaId) || DataStores.find(s => s.id === lojaId);
    return store ? (store.nome.split(' - ')[1] || store.nome) : lojaId;
  }

  function getStockStatus(qty, min) {
    if (qty === 0) return 'zerado';
    if (qty <= min) return 'baixo';
    return 'ok';
  }

  function getStockQty(productId, storeId) {
    if (_stockData[storeId] && _stockData[storeId][productId]) {
      return _stockData[storeId][productId].quantidade;
    }
    return 0;
  }

  function getCategoryLabel(catId) {
    const cat = DataCategories.find(c => c.id === catId);
    return cat ? cat.nome : catId;
  }

  function buildStockRows() {
    const rows = [];
    const activeProducts = _products.filter(p => p.ativo !== false);

    activeProducts.forEach(p => {
      const storesToShow = currentStoreFilter && currentStoreFilter !== 'todas'
        ? [currentStoreFilter]
        : _stores.map(s => s.id);

      storesToShow.forEach(storeId => {
        const stockInfo = (_stockData[storeId] && _stockData[storeId][p.id]) || { quantidade: 0, estoqueMinimo: p.estoqueMinimo || 10 };
        const qty = stockInfo.quantidade;
        const min = stockInfo.estoqueMinimo;
        const status = getStockStatus(qty, min);

        if (statusFilter !== 'todos' && status !== statusFilter) return;
        if (categoryFilter !== 'todas' && p.categoria !== categoryFilter) return;
        if (searchTerm) {
          const term = searchTerm.toLowerCase();
          if (!p.nome.toLowerCase().includes(term) &&
              !p.categoria.toLowerCase().includes(term) &&
              !storeId.toLowerCase().includes(term)) return;
        }

        rows.push({
          productId: p.id,
          nome: p.nome,
          categoria: p.categoria,
          loja: storeId,
          quantidade: qty,
          minimo: min,
          status,
          ncm: p.ncm || '',
          unidade: p.unidadeMedida || 'UN',
        });
      });
    });

    return rows;
  }

  /* ------------------------------------------
     STOCK OPERATIONS (Firestore or fallback)
  ------------------------------------------ */
  async function doEntrada(productId, storeId, productName, qty, motivo, nota) {
    if (useFirestore()) {
      const newQty = await FirestoreService.StockOps.entrada(storeId, productId, productName, qty, motivo, nota);
      if (!_stockData[storeId]) _stockData[storeId] = {};
      _stockData[storeId][productId] = { quantidade: newQty, estoqueMinimo: (_stockData[storeId][productId] || {}).estoqueMinimo || 10 };
      return;
    }
    // Fallback
    const currentQty = getStockQty(productId, storeId);
    const newQty = currentQty + qty;
    saveStockOverrideFallback(productId, storeId, newQty);
    addMovementFallback({ tipo: 'entrada', productId, productName, loja: storeId, quantidade: qty, motivo, nota, estoqueAnterior: currentQty, estoqueNovo: newQty });
  }

  async function doSaida(productId, storeId, productName, qty, motivo, nota) {
    const currentQty = getStockQty(productId, storeId);
    if (qty > currentQty) throw new Error('Quantidade excede estoque atual');

    if (useFirestore()) {
      const newQty = await FirestoreService.StockOps.saida(storeId, productId, productName, qty, motivo, nota);
      if (_stockData[storeId]) _stockData[storeId][productId] = { quantidade: newQty, estoqueMinimo: (_stockData[storeId][productId] || {}).estoqueMinimo || 10 };
      return;
    }
    const newQty = currentQty - qty;
    saveStockOverrideFallback(productId, storeId, newQty);
    addMovementFallback({ tipo: 'saida', productId, productName, loja: storeId, quantidade: qty, motivo, nota, estoqueAnterior: currentQty, estoqueNovo: newQty });
  }

  async function doTransferir(productId, fromStore, toStore, productName, qty) {
    if (useFirestore()) {
      await FirestoreService.StockOps.transferir(fromStore, toStore, productId, productName, qty);
      // Refresh stock data for both stores
      delete _stockData[fromStore];
      delete _stockData[toStore];
      return;
    }
    const fromQty = getStockQty(productId, fromStore);
    const toQty = getStockQty(productId, toStore);
    if (qty > fromQty) throw new Error('Quantidade excede estoque de origem');
    saveStockOverrideFallback(productId, fromStore, fromQty - qty);
    saveStockOverrideFallback(productId, toStore, toQty + qty);
    addMovementFallback({ tipo: 'transferencia', productId, productName, loja: fromStore, lojaDestino: toStore, quantidade: qty, motivo: 'Transferência', estoqueAnterior: fromQty, estoqueNovo: fromQty - qty });
  }

  async function doAjustar(productId, storeId, productName, newQty, nota) {
    if (useFirestore()) {
      await FirestoreService.StockOps.ajustar(storeId, productId, productName, newQty, nota);
      if (_stockData[storeId]) _stockData[storeId][productId] = { quantidade: newQty, estoqueMinimo: (_stockData[storeId][productId] || {}).estoqueMinimo || 10 };
      return;
    }
    const currentQty = getStockQty(productId, storeId);
    saveStockOverrideFallback(productId, storeId, newQty);
    addMovementFallback({ tipo: 'ajuste', productId, productName, loja: storeId, quantidade: newQty - currentQty, motivo: 'Ajuste', nota, estoqueAnterior: currentQty, estoqueNovo: newQty });
  }

  // Fallback helpers
  function saveStockOverrideFallback(productId, storeId, newQty) {
    const overrides = Storage.get('product_stock_overrides') || {};
    if (!overrides[productId]) overrides[productId] = {};
    overrides[productId][storeId] = Math.max(0, newQty);
    Storage.set('product_stock_overrides', overrides);
    if (_stockData[storeId]) _stockData[storeId][productId] = { quantidade: Math.max(0, newQty), estoqueMinimo: (_stockData[storeId][productId] || {}).estoqueMinimo || 10 };
  }

  function addMovementFallback(movement) {
    const movements = Storage.get('stock_movements') || [];
    movements.unshift({ id: 'mov-' + Utils.generateId(), timestamp: new Date().toISOString(), usuario: (AppState.get('user') || {}).nome || 'Admin', ...movement });
    Storage.set('stock_movements', movements);
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
    const escHandler = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); } };
    document.addEventListener('keydown', escHandler);

    modal.querySelector('.modal-confirm').addEventListener('click', async () => {
      const result = await onConfirm(modal);
      if (result) close();
    });

    return modal;
  }

  function showEntradaModal(productId, storeId, productName) {
    const html = `
      <div style="margin-bottom:14px;">
        <label style="font-size:13px;color:#555;display:block;margin-bottom:4px;">Produto</label>
        <div style="font-weight:600;color:#1B4332;">${productName} (${getStoreLabel(storeId)})</div>
      </div>
      <div style="margin-bottom:14px;">
        <label style="font-size:13px;color:#555;display:block;margin-bottom:4px;">Quantidade</label>
        <input type="number" class="input-qty" min="1" value="1" style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;">
      </div>
      <div style="margin-bottom:14px;">
        <label style="font-size:13px;color:#555;display:block;margin-bottom:4px;">Motivo</label>
        <select class="input-reason" style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;">
          <option value="Compra Fornecedor">Compra Fornecedor</option>
          <option value="Devolução">Devolução</option>
          <option value="Ajuste">Ajuste</option>
        </select>
      </div>
      <div>
        <label style="font-size:13px;color:#555;display:block;margin-bottom:4px;">Observação</label>
        <textarea class="input-note" rows="2" style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;resize:vertical;"></textarea>
      </div>
    `;

    createModal('+Entrada de Estoque', html, async (modal) => {
      const qty = parseInt(modal.querySelector('.input-qty').value) || 0;
      if (qty <= 0) { Toast.error('Quantidade deve ser maior que zero'); return false; }
      try {
        await doEntrada(productId, storeId, productName, qty, modal.querySelector('.input-reason').value, modal.querySelector('.input-note').value);
        Toast.success(`+${qty} unidades de ${productName}`);
        render(currentStoreFilter);
        return true;
      } catch (e) { Toast.error(e.message); return false; }
    });
  }

  function showSaidaModal(productId, storeId, productName) {
    const currentQty = getStockQty(productId, storeId);
    const html = `
      <div style="margin-bottom:14px;">
        <label style="font-size:13px;color:#555;display:block;margin-bottom:4px;">Produto</label>
        <div style="font-weight:600;color:#1B4332;">${productName} (${getStoreLabel(storeId)})</div>
        <div style="font-size:12px;color:#888;margin-top:2px;">Estoque atual: ${currentQty}</div>
      </div>
      <div style="margin-bottom:14px;">
        <label style="font-size:13px;color:#555;display:block;margin-bottom:4px;">Quantidade</label>
        <input type="number" class="input-qty" min="1" max="${currentQty}" value="1" style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;">
      </div>
      <div style="margin-bottom:14px;">
        <label style="font-size:13px;color:#555;display:block;margin-bottom:4px;">Motivo</label>
        <select class="input-reason" style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;">
          <option value="Venda">Venda</option>
          <option value="Perda">Perda</option>
          <option value="Vencimento">Vencimento</option>
          <option value="Uso Interno">Uso Interno</option>
        </select>
      </div>
      <div>
        <label style="font-size:13px;color:#555;display:block;margin-bottom:4px;">Observação</label>
        <textarea class="input-note" rows="2" style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;resize:vertical;"></textarea>
      </div>
    `;

    createModal('-Saída de Estoque', html, async (modal) => {
      const qty = parseInt(modal.querySelector('.input-qty').value) || 0;
      if (qty <= 0) { Toast.error('Quantidade deve ser maior que zero'); return false; }
      try {
        await doSaida(productId, storeId, productName, qty, modal.querySelector('.input-reason').value, modal.querySelector('.input-note').value);
        Toast.success(`-${qty} unidades de ${productName}`);
        render(currentStoreFilter);
        return true;
      } catch (e) { Toast.error(e.message); return false; }
    });
  }

  function showTransferirModal(productId, storeId, productName) {
    const currentQty = getStockQty(productId, storeId);
    const otherStores = _stores.filter(s => s.id !== storeId);
    const html = `
      <div style="margin-bottom:14px;">
        <label style="font-size:13px;color:#555;display:block;margin-bottom:4px;">Produto</label>
        <div style="font-weight:600;color:#1B4332;">${productName}</div>
        <div style="font-size:12px;color:#888;margin-top:2px;">Origem: ${getStoreLabel(storeId)} (estoque: ${currentQty})</div>
      </div>
      <div style="margin-bottom:14px;">
        <label style="font-size:13px;color:#555;display:block;margin-bottom:4px;">Loja Destino</label>
        <select class="input-dest" style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;">
          ${otherStores.map(s => `<option value="${s.id}">${s.nome.split(' - ')[1] || s.nome}</option>`).join('')}
        </select>
      </div>
      <div style="margin-bottom:14px;">
        <label style="font-size:13px;color:#555;display:block;margin-bottom:4px;">Quantidade</label>
        <input type="number" class="input-qty" min="1" max="${currentQty}" value="1" style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;">
      </div>
    `;

    createModal('Transferir Estoque', html, async (modal) => {
      const qty = parseInt(modal.querySelector('.input-qty').value) || 0;
      const destId = modal.querySelector('.input-dest').value;
      if (qty <= 0) { Toast.error('Quantidade deve ser maior que zero'); return false; }
      try {
        await doTransferir(productId, storeId, destId, productName, qty);
        Toast.success(`${qty}x ${productName} transferido para ${getStoreLabel(destId)}`);
        render(currentStoreFilter);
        return true;
      } catch (e) { Toast.error(e.message); return false; }
    });
  }

  function showAjustarModal(productId, storeId, productName) {
    const currentQty = getStockQty(productId, storeId);
    const html = `
      <div style="margin-bottom:14px;">
        <label style="font-size:13px;color:#555;display:block;margin-bottom:4px;">Produto</label>
        <div style="font-weight:600;color:#1B4332;">${productName} (${getStoreLabel(storeId)})</div>
        <div style="font-size:12px;color:#888;margin-top:2px;">Estoque atual (sistema): ${currentQty}</div>
      </div>
      <div style="margin-bottom:14px;">
        <label style="font-size:13px;color:#555;display:block;margin-bottom:4px;">Quantidade Real (contagem física)</label>
        <input type="number" class="input-qty" min="0" value="${currentQty}" style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;">
      </div>
      <div>
        <label style="font-size:13px;color:#555;display:block;margin-bottom:4px;">Observação</label>
        <textarea class="input-note" rows="2" placeholder="Ex: Contagem física do inventário" style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;resize:vertical;"></textarea>
      </div>
    `;

    createModal('Ajuste de Inventário', html, async (modal) => {
      const newQty = parseInt(modal.querySelector('.input-qty').value);
      if (isNaN(newQty) || newQty < 0) { Toast.error('Quantidade inválida'); return false; }
      try {
        await doAjustar(productId, storeId, productName, newQty, modal.querySelector('.input-note').value);
        Toast.success(`Estoque de ${productName} ajustado para ${newQty}`);
        render(currentStoreFilter);
        return true;
      } catch (e) { Toast.error(e.message); return false; }
    });
  }

  /* ------------------------------------------
     NF-e XML IMPORT MODAL
  ------------------------------------------ */
  function showNFeImportModal(storeId) {
    if (!storeId || storeId === 'todas') {
      Toast.error('Selecione uma loja específica para importar NF-e');
      return;
    }

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10001;display:flex;align-items:center;justify-content:center;padding:16px;';

    const modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;border-radius:12px;max-width:700px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);';

    modal.innerHTML = `
      <div style="padding:16px 20px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;">
        <h3 style="margin:0;font-size:18px;color:#1B4332;">Importar NF-e XML — ${getStoreLabel(storeId)}</h3>
        <button class="modal-close" style="background:none;border:none;font-size:22px;cursor:pointer;color:#888;padding:4px 8px;">&#10005;</button>
      </div>
      <div style="padding:20px;">
        <div class="nfe-upload-area" style="border:2px dashed #ddd;border-radius:12px;padding:40px;text-align:center;cursor:pointer;transition:border-color 0.2s;">
          <div style="font-size:48px;margin-bottom:12px;">📄</div>
          <div style="font-size:16px;font-weight:600;color:#1B4332;margin-bottom:8px;">Arraste o XML aqui ou clique para selecionar</div>
          <div style="font-size:13px;color:#888;">Aceita arquivos .xml de NF-e</div>
          <input type="file" class="nfe-file-input" accept=".xml" style="display:none;">
        </div>
        <div class="nfe-paste-area" style="margin-top:16px;">
          <label style="font-size:13px;font-weight:600;color:#555;display:block;margin-bottom:4px;">Ou cole o XML aqui:</label>
          <textarea class="nfe-xml-text" rows="4" placeholder="Cole o conteúdo XML da NF-e..." style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:13px;resize:vertical;box-sizing:border-box;font-family:monospace;"></textarea>
        </div>
        <div class="nfe-results" style="display:none;margin-top:20px;">
          <h4 style="margin:0 0 10px;color:#1B4332;">Itens encontrados:</h4>
          <div class="nfe-items-list"></div>
        </div>
      </div>
      <div style="padding:12px 20px;border-top:1px solid #eee;display:flex;gap:8px;justify-content:flex-end;">
        <button class="modal-cancel" style="background:#f5f5f5;color:#555;border:1px solid #ddd;padding:8px 20px;border-radius:8px;cursor:pointer;font-size:14px;">Cancelar</button>
        <button class="nfe-process-btn" style="background:#2D6A4F;color:#fff;border:none;padding:8px 20px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;">Processar XML</button>
        <button class="nfe-import-btn" style="background:#1565C0;color:#fff;border:none;padding:8px 20px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;display:none;">Importar Estoque</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('.modal-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    // File upload
    const uploadArea = modal.querySelector('.nfe-upload-area');
    const fileInput = modal.querySelector('.nfe-file-input');

    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.style.borderColor = '#2D6A4F'; });
    uploadArea.addEventListener('dragleave', () => { uploadArea.style.borderColor = '#ddd'; });
    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.style.borderColor = '#ddd';
      const file = e.dataTransfer.files[0];
      if (file) readXmlFile(file, modal);
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) readXmlFile(fileInput.files[0], modal);
    });

    // Process button (for pasted XML)
    modal.querySelector('.nfe-process-btn').addEventListener('click', () => {
      const xmlText = modal.querySelector('.nfe-xml-text').value.trim();
      if (!xmlText) { Toast.error('Cole ou faça upload de um XML'); return; }
      processXml(xmlText, storeId, modal);
    });

    // Import button
    let _parsedResults = null;
    modal.querySelector('.nfe-import-btn').addEventListener('click', async () => {
      if (!_parsedResults) return;
      try {
        const { results } = _parsedResults;
        let imported = 0;
        for (const item of results) {
          if (item.matchedProduct) {
            await doEntrada(
              item.matchedProduct.id, storeId, item.matchedProduct.nome,
              Math.round(item.quantidade),
              `NF-e ${item.nfNumero} - ${item.fornecedor}`,
              `Item: ${item.nome} | Cód: ${item.codigo}`
            );
            imported++;
          }
        }
        Toast.success(`${imported} itens importados com sucesso!`);
        close();
        render(currentStoreFilter);
      } catch (e) {
        Toast.error('Erro na importação: ' + e.message);
      }
    });

    function readXmlFile(file, modal) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const xmlText = e.target.result;
        modal.querySelector('.nfe-xml-text').value = xmlText;
        processXml(xmlText, storeId, modal);
      };
      reader.readAsText(file);
    }

    function processXml(xmlString, stId, mdl) {
      try {
        const parseFunc = useFirestore() ? FirestoreService.parseNFeXML : parseNFeXMLFallback;
        const { nfInfo, items } = parseFunc(xmlString);

        // Match products
        const results = items.map(item => {
          const matched = _products.find(p => p.codigoBarras && p.codigoBarras === item.ean) ||
                          _products.find(p => p.nome.toLowerCase().includes(item.nome.toLowerCase().slice(0, 10)));
          return { ...item, matchedProduct: matched ? { id: matched.id, nome: matched.nome } : null, nfNumero: nfInfo.numero, fornecedor: nfInfo.fornecedor };
        });

        _parsedResults = { nfInfo, results };

        const resultsDiv = mdl.querySelector('.nfe-results');
        const itemsList = mdl.querySelector('.nfe-items-list');
        resultsDiv.style.display = 'block';
        mdl.querySelector('.nfe-import-btn').style.display = '';
        mdl.querySelector('.nfe-process-btn').style.display = 'none';

        itemsList.innerHTML = `
          <div style="margin-bottom:12px;padding:10px;background:#f8f9fa;border-radius:8px;font-size:13px;">
            <strong>NF-e ${nfInfo.numero}</strong> — ${nfInfo.fornecedor} — ${nfInfo.dataEmissao ? new Date(nfInfo.dataEmissao).toLocaleDateString('pt-BR') : ''}
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead>
              <tr style="border-bottom:2px solid #eee;">
                <th style="text-align:left;padding:6px;">Item NF</th>
                <th style="text-align:right;padding:6px;">Qtd</th>
                <th style="text-align:right;padding:6px;">Valor Unit.</th>
                <th style="text-align:left;padding:6px;">Produto Correspondente</th>
              </tr>
            </thead>
            <tbody>
              ${results.map(r => `
                <tr style="border-bottom:1px solid #f0f0f0;">
                  <td style="padding:6px;">${r.nome}</td>
                  <td style="padding:6px;text-align:right;">${r.quantidade}</td>
                  <td style="padding:6px;text-align:right;">${Utils.formatBRL(r.valorUnitario)}</td>
                  <td style="padding:6px;">
                    ${r.matchedProduct
                      ? `<span style="color:#2E7D32;font-weight:600;">${r.matchedProduct.nome}</span>`
                      : '<span style="color:#C62828;">Não encontrado</span>'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div style="margin-top:8px;font-size:12px;color:#888;">
            ${results.filter(r => r.matchedProduct).length} de ${results.length} itens correspondem a produtos cadastrados
          </div>
        `;
      } catch (e) {
        Toast.error('Erro ao processar XML: ' + e.message);
      }
    }
  }

  // Fallback XML parser (same logic as FirestoreService)
  function parseNFeXMLFallback(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
    if (xmlDoc.querySelector('parsererror')) throw new Error('XML inválido');

    const ns = 'http://www.portalfiscal.inf.br/nfe';
    function getText(parent, tag) {
      let el = parent.getElementsByTagNameNS(ns, tag)[0];
      if (!el) el = parent.getElementsByTagName(tag)[0];
      return el ? el.textContent.trim() : '';
    }

    const ide = xmlDoc.getElementsByTagNameNS(ns, 'ide')[0] || xmlDoc.getElementsByTagName('ide')[0];
    const emit = xmlDoc.getElementsByTagNameNS(ns, 'emit')[0] || xmlDoc.getElementsByTagName('emit')[0];
    const nfInfo = {
      numero: ide ? getText(ide, 'nNF') : '',
      serie: ide ? getText(ide, 'serie') : '',
      dataEmissao: ide ? getText(ide, 'dhEmi') : '',
      fornecedor: emit ? getText(emit, 'xNome') : '',
      cnpjFornecedor: emit ? getText(emit, 'CNPJ') : '',
    };

    const detElements = xmlDoc.getElementsByTagNameNS(ns, 'det');
    const detFallback = detElements.length ? detElements : xmlDoc.getElementsByTagName('det');
    const items = [];
    for (let i = 0; i < detFallback.length; i++) {
      const det = detFallback[i];
      const prod = det.getElementsByTagNameNS(ns, 'prod')[0] || det.getElementsByTagName('prod')[0];
      if (!prod) continue;
      items.push({
        nItem: det.getAttribute('nItem') || (i + 1),
        codigo: getText(prod, 'cProd'),
        ean: getText(prod, 'cEAN') || getText(prod, 'cEANTrib'),
        nome: getText(prod, 'xProd'),
        ncm: getText(prod, 'NCM'),
        unidade: getText(prod, 'uCom') || getText(prod, 'uTrib'),
        quantidade: parseFloat(getText(prod, 'qCom') || getText(prod, 'qTrib')) || 0,
        valorUnitario: parseFloat(getText(prod, 'vUnCom') || getText(prod, 'vUnTrib')) || 0,
        valorTotal: parseFloat(getText(prod, 'vProd')) || 0,
      });
    }
    return { nfInfo, items };
  }

  /* ------------------------------------------
     MOVEMENT HISTORY MODAL
  ------------------------------------------ */
  async function showHistoryModal(productId, storeId, productName) {
    let movements = [];
    if (useFirestore()) {
      try {
        movements = await FirestoreService.Movements.getForProduct(storeId, productId);
      } catch (e) {
        movements = (Storage.get('stock_movements') || []).filter(m => m.productId === productId && m.loja === storeId);
      }
    } else {
      movements = (Storage.get('stock_movements') || []).filter(m => m.productId === productId && m.loja === storeId);
    }

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10001;display:flex;align-items:center;justify-content:center;padding:16px;';

    const modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;border-radius:12px;max-width:700px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);';

    const tipoColors = {
      entrada: '#2E7D32', saida: '#C62828', transferencia: '#1565C0',
      transferencia_entrada: '#1565C0', ajuste: '#F57F17', auto_deducao: '#7B1FA2',
    };

    modal.innerHTML = `
      <div style="padding:16px 20px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;">
        <h3 style="margin:0;font-size:18px;color:#1B4332;">Histórico - ${productName} (${getStoreLabel(storeId)})</h3>
        <button class="modal-close" style="background:none;border:none;font-size:22px;cursor:pointer;color:#888;padding:4px 8px;">&#10005;</button>
      </div>
      <div style="padding:20px;overflow-x:auto;">
        ${movements.length === 0 ? '<p style="text-align:center;color:#999;">Nenhuma movimentação registrada</p>' : `
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="border-bottom:2px solid #eee;">
              <th style="text-align:left;padding:8px 6px;">Data/Hora</th>
              <th style="text-align:left;padding:8px 6px;">Tipo</th>
              <th style="text-align:right;padding:8px 6px;">Qtd</th>
              <th style="text-align:left;padding:8px 6px;">Motivo</th>
              <th style="text-align:left;padding:8px 6px;">Usuário</th>
              <th style="text-align:left;padding:8px 6px;">Obs</th>
            </tr>
          </thead>
          <tbody>
            ${movements.map(m => {
              const ts = m.createdAt && m.createdAt.toDate ? m.createdAt.toDate().toISOString() : (m.timestamp || m.createdAt || '');
              return `
              <tr style="border-bottom:1px solid #f0f0f0;">
                <td style="padding:8px 6px;white-space:nowrap;">${ts ? Utils.formatDateTime(ts) : '—'}</td>
                <td style="padding:8px 6px;">
                  <span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;color:#fff;background:${tipoColors[m.tipo] || '#888'};">
                    ${m.tipo}
                  </span>
                </td>
                <td style="padding:8px 6px;text-align:right;font-weight:600;color:${m.tipo === 'entrada' || m.tipo === 'transferencia_entrada' ? '#2E7D32' : m.tipo === 'saida' || m.tipo === 'auto_deducao' ? '#C62828' : '#333'};">
                  ${m.tipo === 'entrada' || m.tipo === 'transferencia_entrada' ? '+' : m.tipo === 'saida' || m.tipo === 'auto_deducao' ? '-' : ''}${Math.abs(m.quantidade)}
                </td>
                <td style="padding:8px 6px;">${m.motivo || '—'}</td>
                <td style="padding:8px 6px;">${m.usuario || '—'}</td>
                <td style="padding:8px 6px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${(m.nota || '').replace(/"/g, '&quot;')}">${m.nota || '—'}</td>
              </tr>
            `;}).join('')}
          </tbody>
        </table>
        `}
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    modal.querySelector('.modal-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  }

  /* ------------------------------------------
     EXPORT CSV
  ------------------------------------------ */
  function exportCSV() {
    const rows = buildStockRows();
    const header = 'Produto;Categoria;Loja;Quantidade;Minimo;Status';
    const lines = rows.map(r =>
      `${r.nome};${getCategoryLabel(r.categoria)};${getStoreLabel(r.loja)};${r.quantidade};${r.minimo};${STATUS_COLORS[r.status].label}`
    );
    const csv = [header, ...lines].join('\n');

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(csv).then(() => {
        Toast.success('CSV copiado para a área de transferência!');
      }).catch(() => fallbackCopy(csv));
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
     RENDER
  ------------------------------------------ */
  async function render(storeFilter) {
    const el = container();
    if (!el) return;

    currentStoreFilter = storeFilter || 'todas';

    el.innerHTML = '<div style="text-align:center;padding:40px;color:#888;">Carregando estoque...</div>';

    // Clear cached stock to force reload
    if (currentStoreFilter !== 'todas') {
      delete _stockData[currentStoreFilter];
    } else {
      _stockData = {};
    }

    await loadData();
    const rows = buildStockRows();

    // KPI counts (unfiltered)
    const saved = { searchTerm, statusFilter, categoryFilter };
    searchTerm = ''; statusFilter = 'todos'; categoryFilter = 'todas';
    const allRows = buildStockRows();
    searchTerm = saved.searchTerm; statusFilter = saved.statusFilter; categoryFilter = saved.categoryFilter;

    const totalProdutos = new Set(allRows.map(r => r.productId)).size;
    const estoqueOk = allRows.filter(r => r.status === 'ok').length;
    const estoqueBaixo = allRows.filter(r => r.status === 'baixo').length;
    const estoqueZerado = allRows.filter(r => r.status === 'zerado').length;

    const categories = [...new Set(_products.map(p => p.categoria))];

    el.innerHTML = `
      <style>
        .estoque-kpis { display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px; }
        .estoque-kpi {
          background:#fff;border-radius:10px;padding:16px;text-align:center;
          box-shadow:0 1px 4px rgba(0,0,0,0.06);border-left:4px solid transparent;
        }
        .estoque-kpi__value { font-size:28px;font-weight:700;color:#1B4332; }
        .estoque-kpi__label { font-size:12px;color:#888;margin-top:4px; }
        .estoque-action-bar { display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:16px; }
        .estoque-action-bar input, .estoque-action-bar select {
          padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;background:#fff;
        }
        .estoque-action-bar input[type="search"] { flex:1;min-width:200px;max-width:350px; }
        .estoque-btn {
          background:#2D6A4F;color:#fff;border:none;padding:8px 16px;border-radius:8px;
          cursor:pointer;font-size:13px;font-weight:600;white-space:nowrap;
        }
        .estoque-btn:hover { background:#1B4332; }
        .estoque-btn--outline { background:#fff;color:#2D6A4F;border:1px solid #2D6A4F; }
        .estoque-btn--outline:hover { background:#E8F5E9; }
        .estoque-btn--blue { background:#1565C0; }
        .estoque-btn--blue:hover { background:#0D47A1; }
        .estoque-table-wrap { overflow-x:auto; }
        .estoque-table {
          width:100%;border-collapse:collapse;font-size:13px;background:#fff;border-radius:10px;overflow:hidden;
          box-shadow:0 1px 4px rgba(0,0,0,0.06);
        }
        .estoque-table th {
          text-align:left;padding:10px 12px;background:#f8f9fa;font-weight:600;color:#555;
          border-bottom:2px solid #eee;white-space:nowrap;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;
        }
        .estoque-table td { padding:10px 12px;border-bottom:1px solid #f0f0f0;vertical-align:middle; }
        .estoque-table tr:hover td { background:#f8fdf9; }
        .estoque-badge { display:inline-block;padding:3px 10px;border-radius:10px;font-size:11px;font-weight:600; }
        .estoque-actions { display:flex;gap:4px;flex-wrap:wrap; }
        .estoque-actions button {
          padding:4px 8px;border-radius:6px;border:1px solid #ddd;background:#fff;
          cursor:pointer;font-size:11px;white-space:nowrap;transition:background 0.15s;
        }
        .estoque-actions button:hover { background:#f0f0f0; }
        .estoque-actions .btn-entrada { color:#2E7D32;border-color:#2E7D32; }
        .estoque-actions .btn-entrada:hover { background:#E8F5E9; }
        .estoque-actions .btn-saida { color:#C62828;border-color:#C62828; }
        .estoque-actions .btn-saida:hover { background:#FFEBEE; }
        .estoque-actions .btn-transferir { color:#1565C0;border-color:#1565C0; }
        .estoque-actions .btn-transferir:hover { background:#E3F2FD; }
        .estoque-actions .btn-ajustar { color:#F57F17;border-color:#F57F17; }
        .estoque-actions .btn-ajustar:hover { background:#FFF8E1; }
        .estoque-actions .btn-historico { color:#555; }
        @media (max-width:768px) {
          .estoque-kpis { grid-template-columns:repeat(2,1fr); }
          .estoque-actions { flex-direction:column; }
        }
      </style>

      <!-- KPI Cards -->
      <div class="estoque-kpis">
        <div class="estoque-kpi" style="border-left-color:#1B4332;">
          <div class="estoque-kpi__value">${totalProdutos}</div>
          <div class="estoque-kpi__label">Total Produtos</div>
        </div>
        <div class="estoque-kpi" style="border-left-color:#2E7D32;">
          <div class="estoque-kpi__value" style="color:#2E7D32;">${estoqueOk}</div>
          <div class="estoque-kpi__label">Estoque OK</div>
        </div>
        <div class="estoque-kpi" style="border-left-color:#F57F17;">
          <div class="estoque-kpi__value" style="color:#F57F17;">${estoqueBaixo}</div>
          <div class="estoque-kpi__label">Estoque Baixo</div>
        </div>
        <div class="estoque-kpi" style="border-left-color:#C62828;">
          <div class="estoque-kpi__value" style="color:#C62828;">${estoqueZerado}</div>
          <div class="estoque-kpi__label">Estoque Zerado</div>
        </div>
      </div>

      <!-- Action Bar -->
      <div class="estoque-action-bar">
        <input type="search" class="estoque-search" placeholder="Buscar produto..." value="${searchTerm}">
        <select class="estoque-status-filter">
          <option value="todos"${statusFilter === 'todos' ? ' selected' : ''}>Todos</option>
          <option value="ok"${statusFilter === 'ok' ? ' selected' : ''}>OK</option>
          <option value="baixo"${statusFilter === 'baixo' ? ' selected' : ''}>Baixo</option>
          <option value="zerado"${statusFilter === 'zerado' ? ' selected' : ''}>Zerado</option>
        </select>
        <select class="estoque-cat-filter">
          <option value="todas"${categoryFilter === 'todas' ? ' selected' : ''}>Todas Categorias</option>
          ${categories.map(c => `<option value="${c}"${categoryFilter === c ? ' selected' : ''}>${getCategoryLabel(c)}</option>`).join('')}
        </select>
        <button class="estoque-btn estoque-btn--blue btn-nfe-import">Importar NF-e XML</button>
        <button class="estoque-btn estoque-btn--outline btn-export">Exportar CSV</button>
      </div>

      <!-- Table -->
      <div class="estoque-table-wrap">
        <table class="estoque-table">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Categoria</th>
              <th>Loja</th>
              <th>Quantidade</th>
              <th>Mínimo</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length === 0 ? `<tr><td colspan="7" style="text-align:center;padding:24px;color:#999;">Nenhum produto encontrado</td></tr>` :
              rows.map(r => {
                const sc = STATUS_COLORS[r.status];
                return `
                <tr>
                  <td style="font-weight:600;color:#1B4332;">${r.nome}</td>
                  <td>${getCategoryLabel(r.categoria)}</td>
                  <td>${getStoreLabel(r.loja)}</td>
                  <td style="font-weight:600;">${r.quantidade}</td>
                  <td>${r.minimo}</td>
                  <td>
                    <span class="estoque-badge" style="background:${sc.bg};color:${sc.text};">${sc.label}</span>
                  </td>
                  <td>
                    <div class="estoque-actions">
                      <button class="btn-entrada" data-pid="${r.productId}" data-store="${r.loja}" data-name="${r.nome}">+Entrada</button>
                      <button class="btn-saida" data-pid="${r.productId}" data-store="${r.loja}" data-name="${r.nome}">-Saída</button>
                      <button class="btn-transferir" data-pid="${r.productId}" data-store="${r.loja}" data-name="${r.nome}">Transferir</button>
                      <button class="btn-ajustar" data-pid="${r.productId}" data-store="${r.loja}" data-name="${r.nome}">Ajustar</button>
                      <button class="btn-historico" data-pid="${r.productId}" data-store="${r.loja}" data-name="${r.nome}" title="Histórico">&#128196;</button>
                    </div>
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

  function bindEvents(el) {
    const searchInput = el.querySelector('.estoque-search');
    if (searchInput) {
      searchInput.addEventListener('input', Utils.debounce((e) => {
        searchTerm = e.target.value;
        render(currentStoreFilter);
      }, 400));
    }

    const statusSelect = el.querySelector('.estoque-status-filter');
    if (statusSelect) statusSelect.addEventListener('change', (e) => { statusFilter = e.target.value; render(currentStoreFilter); });

    const catSelect = el.querySelector('.estoque-cat-filter');
    if (catSelect) catSelect.addEventListener('change', (e) => { categoryFilter = e.target.value; render(currentStoreFilter); });

    const btnExport = el.querySelector('.btn-export');
    if (btnExport) btnExport.addEventListener('click', exportCSV);

    const btnNfe = el.querySelector('.btn-nfe-import');
    if (btnNfe) btnNfe.addEventListener('click', () => showNFeImportModal(currentStoreFilter));

    el.querySelectorAll('.btn-entrada').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); showEntradaModal(btn.dataset.pid, btn.dataset.store, btn.dataset.name); }));
    el.querySelectorAll('.btn-saida').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); showSaidaModal(btn.dataset.pid, btn.dataset.store, btn.dataset.name); }));
    el.querySelectorAll('.btn-transferir').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); showTransferirModal(btn.dataset.pid, btn.dataset.store, btn.dataset.name); }));
    el.querySelectorAll('.btn-ajustar').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); showAjustarModal(btn.dataset.pid, btn.dataset.store, btn.dataset.name); }));
    el.querySelectorAll('.btn-historico').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); showHistoryModal(btn.dataset.pid, btn.dataset.store, btn.dataset.name); }));
  }

  /* ------------------------------------------
     AUTO-DEDUCT (called externally by orders)
  ------------------------------------------ */
  async function autoDeductStock(order) {
    if (!order || !order.items || !order.loja) return;
    if (useFirestore()) {
      await FirestoreService.StockOps.autoDeduct(order.loja, order);
    } else {
      order.items.forEach(item => {
        const currentQty = getStockQty(item.productId, order.loja);
        const deductQty = item.quantidade || 1;
        saveStockOverrideFallback(item.productId, order.loja, Math.max(0, currentQty - deductQty));
        addMovementFallback({ tipo: 'auto_deducao', productId: item.productId, productName: item.nome, loja: order.loja, quantidade: deductQty, motivo: 'Dedução automática - Pedido ' + (order.numero || '') });
      });
    }
  }

  /* ------------------------------------------
     PUBLIC API
  ------------------------------------------ */
  return {
    render,
    autoDeductStock,
  };
})();
