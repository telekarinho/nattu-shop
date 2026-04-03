/* ============================================
   CLUBE DO NATURAL - Admin Fiscal
   Configuracao fiscal por loja + emissao de PDF
   ============================================ */

const AdminNF = (() => {
  const FALLBACK_CONFIG_KEY = 'nf_fiscal_configs';
  const FALLBACK_NOTAS_KEY = 'notas_fiscais';

  let currentStoreFilter = 'todas';
  let activeTab = 'overview';
  let cachedStores = [];
  let cachedConfigs = [];
  let cachedNotas = [];

  function container() {
    return document.getElementById('nf-content');
  }

  function useFirestore() {
    return typeof FirestoreService !== 'undefined' && FirestoreService.ready;
  }

  function getStores() {
    return Array.isArray(cachedStores) && cachedStores.length
      ? cachedStores
      : (Array.isArray(window.DataStores) ? window.DataStores : []);
  }

  function getStore(storeId) {
    return getStores().find(store => store.id === storeId) || null;
  }

  async function loadStores() {
    if (useFirestore()) {
      try {
        cachedStores = await FirestoreService.Stores.getAll();
        return;
      } catch (error) {
        console.warn('[AdminNF] Falha ao carregar lojas no Firestore:', error.message);
      }
    }
    cachedStores = Array.isArray(window.DataStores) ? [...window.DataStores] : [];
  }

  async function loadConfigs() {
    if (useFirestore()) {
      try {
        cachedConfigs = await FirestoreService.FiscalConfig.getAll();
        return;
      } catch (error) {
        console.warn('[AdminNF] Falha ao carregar configuracoes fiscais:', error.message);
      }
    }
    const local = Storage.get(FALLBACK_CONFIG_KEY) || {};
    cachedConfigs = Object.entries(local).map(([storeId, data]) => ({
      ...data,
      storeId,
      id: 'default',
    }));
  }

  async function loadNotas() {
    if (useFirestore()) {
      try {
        cachedNotas = currentStoreFilter && currentStoreFilter !== 'todas'
          ? await FirestoreService.NotasFiscais.getForStore(currentStoreFilter)
          : await FirestoreService.NotasFiscais.getAll(80);
        return;
      } catch (error) {
        console.warn('[AdminNF] Falha ao carregar notas no Firestore:', error.message);
      }
    }
    const notas = Storage.get(FALLBACK_NOTAS_KEY) || [];
    cachedNotas = currentStoreFilter && currentStoreFilter !== 'todas'
      ? notas.filter(nota => nota.loja === currentStoreFilter)
      : notas;
  }

  function localSaveConfig(storeId, config) {
    const saved = Storage.get(FALLBACK_CONFIG_KEY) || {};
    saved[storeId] = {
      ...(saved[storeId] || {}),
      ...config,
      storeId,
      id: 'default',
      updatedAt: new Date().toISOString(),
    };
    Storage.set(FALLBACK_CONFIG_KEY, saved);
  }

  function localSaveNota(storeId, nota) {
    const notas = Storage.get(FALLBACK_NOTAS_KEY) || [];
    const index = notas.findIndex(item => item.id === nota.id);
    const payload = {
      ...nota,
      loja: storeId,
      updatedAt: new Date().toISOString(),
    };
    if (index >= 0) notas[index] = payload;
    else notas.unshift(payload);
    Storage.set(FALLBACK_NOTAS_KEY, notas);
  }

  function localReserveNumber(storeId, fieldName, startAt = 1) {
    const saved = Storage.get(FALLBACK_CONFIG_KEY) || {};
    const config = saved[storeId] || {};
    const current = Number(config[fieldName] || startAt);
    config[fieldName] = current + 1;
    saved[storeId] = config;
    Storage.set(FALLBACK_CONFIG_KEY, saved);
    return current;
  }

  async function getConfigForStore(storeId) {
    const store = getStore(storeId);
    let remote = null;
    if (useFirestore()) {
      try {
        remote = await FirestoreService.FiscalConfig.get(storeId);
      } catch (error) {
        console.warn('[AdminNF] Falha ao carregar config da loja:', error.message);
      }
    } else {
      const saved = Storage.get(FALLBACK_CONFIG_KEY) || {};
      remote = saved[storeId] || null;
    }
    return applyFiscalDefaults(store, remote || {});
  }

  function applyFiscalDefaults(store, config) {
    const addressParts = parseAddress(store);
    return {
      id: 'default',
      storeId: store ? store.id : null,
      emitenteNome: store ? store.nome : '',
      nomeFantasia: store ? store.nome : '',
      cnpj: cleanDoc(store && store.cnpj ? store.cnpj : ''),
      ie: cleanDoc(store && store.ie ? store.ie : ''),
      inscricaoMunicipal: '',
      crt: '1',
      ambiente: 'homologacao',
      serieNfce: '1',
      serieNfe: '1',
      nextCupomNumber: 1,
      nextNfceNumber: 1,
      cscId: '',
      cscToken: '',
      municipio: store && store.cidade ? store.cidade : 'Londrina',
      uf: store && store.estado ? store.estado : 'PR',
      codigoMunicipioIbge: inferMunicipioIbge(store && store.cidade ? store.cidade : 'Londrina', store && store.estado ? store.estado : 'PR'),
      cep: cleanDoc(store && store.cep ? store.cep : ''),
      logradouro: addressParts.logradouro,
      numero: addressParts.numero,
      complemento: addressParts.complemento,
      bairro: addressParts.bairro,
      telefone: cleanDoc(store && store.telefone ? store.telefone : ''),
      emailFiscal: '',
      modalidadeVarejo: 'cupom_nao_fiscal',
      nfseProvider: 'notaas',
      codigoTributacaoMunicipal: '',
      aliquotaIss: '0.00',
      descricaoServicoPadrao: '',
      observacoesPadrao: '',
      certificadoA1: null,
      certificadoStatus: 'nao_enviado',
      certificadoSenhaCadastrada: false,
      updatedAt: null,
      ...config,
    };
  }

  function inferMunicipioIbge(city, uf) {
    const key = `${String(city || '').trim().toUpperCase()}-${String(uf || '').trim().toUpperCase()}`;
    const map = {
      'LONDRINA-PR': '4113700',
      'CAMBÉ-PR': '4103700',
      'CAMBE-PR': '4103700',
      'IBIPORÃ-PR': '4110508',
      'IBIPORA-PR': '4110508',
      'ROLÂNDIA-PR': '4122404',
      'ROLANDIA-PR': '4122404',
      'APUCARANA-PR': '4101407',
      'MARINGÁ-PR': '4115200',
      'MARINGA-PR': '4115200',
      'CURITIBA-PR': '4106902',
      'SÃO PAULO-SP': '3550308',
      'SAO PAULO-SP': '3550308',
      'RIO DE JANEIRO-RJ': '3304557',
      'BELO HORIZONTE-MG': '3106200',
      'PORTO ALEGRE-RS': '4314902',
      'FLORIANÓPOLIS-SC': '4205407',
      'FLORIANOPOLIS-SC': '4205407',
      'GOIÂNIA-GO': '5208707',
      'GOIANIA-GO': '5208707',
      'BRASÍLIA-DF': '5300108',
      'BRASILIA-DF': '5300108',
      'SALVADOR-BA': '2927408',
      'FORTALEZA-CE': '2304400',
      'RECIFE-PE': '2611606',
    };
    return map[key] || '';
  }

  function buildStoreAutofill(store, currentConfig = {}) {
    const defaults = applyFiscalDefaults(store, currentConfig);
    return {
      emitenteNome: defaults.emitenteNome || '',
      nomeFantasia: defaults.nomeFantasia || '',
      cnpj: defaults.cnpj || '',
      ie: defaults.ie || '',
      cep: defaults.cep || '',
      logradouro: defaults.logradouro || '',
      numero: defaults.numero || '',
      complemento: defaults.complemento || '',
      bairro: defaults.bairro || '',
      municipio: defaults.municipio || '',
      uf: defaults.uf || 'PR',
      codigoMunicipioIbge: defaults.codigoMunicipioIbge || inferMunicipioIbge(defaults.municipio, defaults.uf),
      telefone: defaults.telefone || '',
      ambiente: currentConfig.ambiente || 'homologacao',
      crt: currentConfig.crt || '1',
      modalidadeVarejo: currentConfig.modalidadeVarejo || 'nfce_futura',
      nfseProvider: currentConfig.nfseProvider || 'notaas',
      serieNfce: currentConfig.serieNfce || '1',
      serieNfe: currentConfig.serieNfe || '1',
      nextCupomNumber: String(Number(currentConfig.nextCupomNumber || 1)),
      nextNfceNumber: String(Number(currentConfig.nextNfceNumber || 1)),
    };
  }

  function getNfceSetupStatus(config) {
    const checks = [
      { label: 'Dados do emitente', ok: !!config.emitenteNome && cleanDoc(config.cnpj).length === 14 },
      { label: 'Inscricao estadual', ok: !!config.ie },
      { label: 'Endereco fiscal + IBGE', ok: !!config.logradouro && !!config.municipio && !!config.uf && !!config.codigoMunicipioIbge },
      { label: 'Serie e numeracao', ok: !!config.serieNfce && Number(config.nextNfceNumber || 0) > 0 },
      { label: 'CSC ID e CSC Token', ok: !!config.cscId && !!config.cscToken },
      { label: 'Certificado A1', ok: !!config.certificadoA1 },
    ];
    const done = checks.filter(item => item.ok).length;
    return {
      checks,
      done,
      total: checks.length,
      ready: done === checks.length,
    };
  }

  function parseAddress(store) {
    const fallback = { logradouro: '', numero: '', complemento: '', bairro: '' };
    if (!store || !store.endereco) return fallback;
    const [streetPart, rest] = String(store.endereco).split(' - ');
    let logradouro = streetPart || '';
    let numero = '';
    const numberMatch = logradouro.match(/^(.*?)(?:,\s*|\s+)(\d+[A-Za-z\-\/]*)$/);
    if (numberMatch) {
      logradouro = numberMatch[1].trim();
      numero = numberMatch[2].trim();
    }
    const restParts = String(rest || '').split(',').map(part => part.trim()).filter(Boolean);
    return {
      logradouro,
      numero,
      complemento: restParts[0] || '',
      bairro: restParts[1] || restParts[0] || '',
    };
  }

  function cleanDoc(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function storeLabel(storeId) {
    const store = getStore(storeId);
    return store ? (store.nome.split(' - ')[1] || store.nome) : storeId;
  }

  function statusChip(label, bg, color) {
    return `<span style="display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;background:${bg};color:${color};font-size:12px;font-weight:700;">${label}</span>`;
  }

  function configHealth(config) {
    const checklist = [
      !!cleanDoc(config.cnpj),
      !!config.emitenteNome,
      !!config.municipio,
      !!config.uf,
      !!config.modalidadeVarejo,
      !!config.certificadoA1,
    ];
    const done = checklist.filter(Boolean).length;
    if (done === checklist.length) return { label: 'Pronta', bg: '#E8F5E9', color: '#2E7D32' };
    if (done >= 4) return { label: 'Parcial', bg: '#FFF8E1', color: '#F57F17' };
    return { label: 'Pendente', bg: '#FFEBEE', color: '#C62828' };
  }

  function noteStatusChip(nota) {
    const map = {
      emitida: ['Emitida', '#E8F5E9', '#2E7D32'],
      preview: ['Preview', '#E3F2FD', '#1565C0'],
      cancelada: ['Cancelada', '#FFEBEE', '#C62828'],
    };
    const status = map[nota.status] || ['Rascunho', '#F3F4F6', '#4B5563'];
    return statusChip(status[0], status[1], status[2]);
  }

  function noteTypeLabel(nota) {
    const map = {
      cupom_nao_fiscal: 'Cupom nao fiscal',
      nfce_preview: 'Pre-DANFE NFC-e',
    };
    return map[nota.tipo] || (nota.tipo || 'Documento');
  }

  function normalizeOrder(order) {
    const rawItems = Array.isArray(order.items) ? order.items : (Array.isArray(order.itens) ? order.itens : []);
    const items = rawItems.map(item => ({
      productId: item.productId || item.id || '',
      nome: item.nome || item.name || 'Item',
      peso: item.peso || item.variacao || item.unidade || '',
      quantidade: Number(item.quantidade || item.qty || 1),
      preco: Number(item.preco != null ? item.preco : (item.precoUnit != null ? item.precoUnit : item.valorUnitario || 0)),
      total: Number(item.total != null ? item.total : ((item.preco != null ? item.preco : (item.precoUnit || 0)) * Number(item.quantidade || item.qty || 1))),
    }));
    const client = typeof order.cliente === 'object' && order.cliente
      ? order.cliente
      : { nome: order.clienteNome || order.cliente || 'Consumidor Final' };
    return {
      id: order.id || order._id || order.numero,
      numero: order.numero || order.id || order._id || 'SEM-NUMERO',
      loja: order.loja || currentStoreFilter,
      cliente: {
        nome: client.nome || 'Consumidor Final',
        celular: client.celular || client.telefone || '',
        cpf: client.cpf || '',
        email: client.email || '',
      },
      subtotal: Number(order.subtotal != null ? order.subtotal : order.total || 0),
      desconto: Number(order.desconto || 0),
      total: Number(order.total || 0),
      pagamento: order.pagamento || order.formaPagamento || 'pix',
      taxaEntrega: Number(order.taxaEntrega || 0),
      items,
      data: order.data || order.criadoEm || new Date().toISOString(),
    };
  }

  async function loadOrdersForStore(storeId) {
    if (useFirestore()) {
      try {
        const orders = await FirestoreService.Orders.getForStore(storeId, 200);
        return orders.map(normalizeOrder);
      } catch (error) {
        console.warn('[AdminNF] Falha ao carregar pedidos:', error.message);
      }
    }
    return (Storage.get('orders') || []).filter(order => order.loja === storeId).map(normalizeOrder);
  }

  async function findOrder(storeId, search) {
    const value = String(search || '').trim().toLowerCase();
    if (!value) return null;
    const orders = await loadOrdersForStore(storeId);
    return orders.find(order =>
      String(order.numero || '').toLowerCase() === value ||
      String(order.id || '').toLowerCase() === value
    ) || null;
  }

  function aggregateMonthNotas(storeId) {
    const monthKey = new Date().toISOString().slice(0, 7);
    return cachedNotas.filter(nota => {
      if (storeId && nota.loja !== storeId) return false;
      return String(nota.data || nota.createdAt || '').slice(0, 7) === monthKey;
    });
  }

  function createAccessKey(store, number) {
    const uf = (store && store.estado ? store.estado : 'PR') === 'PR' ? '41' : '35';
    const date = new Date();
    const yymm = `${String(date.getFullYear()).slice(2)}${String(date.getMonth() + 1).padStart(2, '0')}`;
    const cnpj = cleanDoc(store && store.cnpj ? store.cnpj : '').padStart(14, '0').slice(0, 14);
    const model = '65';
    const series = '001';
    const n = String(number).padStart(9, '0');
    const random = String(Math.floor(Math.random() * 99999999)).padStart(8, '0');
    return `${uf}${yymm}${cnpj}${model}${series}${n}${random}1`;
  }

  function formatAccessKey(key) {
    return String(key || '').replace(/(\d{4})/g, '$1 ').trim();
  }

  function getPaymentLabel(method) {
    const map = {
      pix: 'PIX',
      dinheiro: 'Dinheiro',
      credito: 'Cartao de credito',
      debito: 'Cartao de debito',
      assinatura: 'Assinatura',
    };
    return map[method] || method || 'Nao informado';
  }

  function render(storeFilter) {
    currentStoreFilter = storeFilter || 'todas';
    const el = container();
    if (!el) return;
    el.innerHTML = '<div style="padding:40px;text-align:center;color:#6B7280;">Carregando fiscal...</div>';
    Promise.all([loadStores(), loadConfigs(), loadNotas()]).then(() => {
      if (currentStoreFilter === 'todas') renderNetworkView();
      else renderStoreView(currentStoreFilter);
    }).catch((error) => {
      el.innerHTML = `<div style="padding:24px;background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;color:#991B1B;">Falha ao carregar o modulo fiscal: ${error.message}</div>`;
    });
  }

  function renderNetworkView() {
    const el = container();
    const stores = getStores();
    const cards = stores.map(store => {
      const config = applyFiscalDefaults(store, cachedConfigs.find(item => item.storeId === store.id) || {});
      const health = configHealth(config);
      const monthNotas = aggregateMonthNotas(store.id);
      return `
        <div class="nf-network-card" data-store-id="${store.id}" style="background:#fff;border:1px solid #E5E7EB;border-radius:16px;padding:18px;box-shadow:0 2px 10px rgba(15,23,42,.04);cursor:pointer;">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;">
            <div>
              <div style="font-size:17px;font-weight:800;color:#1B4332;">${store.nome}</div>
              <div style="font-size:12px;color:#6B7280;margin-top:4px;">${store.cidade || ''}/${store.estado || ''} · ${Utils.formatCNPJ(store.cnpj || '')}</div>
            </div>
            ${statusChip(health.label, health.bg, health.color)}
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:16px;">
            <div style="background:#F8FAFC;border-radius:12px;padding:12px;">
              <div style="font-size:11px;color:#64748B;text-transform:uppercase;font-weight:700;">Certificado</div>
              <div style="font-size:14px;font-weight:700;color:#0F172A;margin-top:4px;">${config.certificadoA1 ? 'Enviado' : 'Pendente'}</div>
            </div>
            <div style="background:#F8FAFC;border-radius:12px;padding:12px;">
              <div style="font-size:11px;color:#64748B;text-transform:uppercase;font-weight:700;">Cupom atual</div>
              <div style="font-size:14px;font-weight:700;color:#0F172A;margin-top:4px;">${String(Number(config.nextCupomNumber || 1)).padStart(6, '0')}</div>
            </div>
            <div style="background:#F8FAFC;border-radius:12px;padding:12px;">
              <div style="font-size:11px;color:#64748B;text-transform:uppercase;font-weight:700;">Docs no mes</div>
              <div style="font-size:14px;font-weight:700;color:#0F172A;margin-top:4px;">${monthNotas.length}</div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    const recent = cachedNotas.slice(0, 12).map(nota => `
      <tr>
        <td style="padding:10px 12px;">${storeLabel(nota.loja)}</td>
        <td style="padding:10px 12px;">${noteTypeLabel(nota)}</td>
        <td style="padding:10px 12px;">${nota.numero || '-'}</td>
        <td style="padding:10px 12px;">${Utils.formatBRL(Number(nota.total || nota.valor || 0))}</td>
        <td style="padding:10px 12px;">${Utils.formatDateTime(nota.data || nota.createdAt || new Date().toISOString())}</td>
        <td style="padding:10px 12px;">${noteStatusChip(nota)}</td>
      </tr>
    `).join('');

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:20px;">
        <div>
          <h2 style="margin:0;color:#1B4332;">Fiscal da Rede</h2>
          <p style="margin:6px 0 0;color:#64748B;font-size:14px;">Cada loja possui sua propria configuracao, certificado e numeracao.</p>
        </div>
        <div style="padding:10px 14px;background:#ECFDF5;border:1px solid #A7F3D0;border-radius:12px;color:#065F46;font-size:13px;font-weight:700;">Selecione uma loja no topo para configurar ou emitir documentos</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-bottom:24px;">
        ${cards || '<div style="background:#fff;border-radius:16px;padding:20px;border:1px solid #E5E7EB;">Nenhuma loja encontrada.</div>'}
      </div>
      <div style="background:#fff;border:1px solid #E5E7EB;border-radius:16px;overflow:hidden;">
        <div style="padding:18px 20px;border-bottom:1px solid #E5E7EB;">
          <h3 style="margin:0;color:#1B4332;">Ultimos documentos da rede</h3>
        </div>
        <div style="overflow:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <thead style="background:#F8FAFC;color:#475569;text-transform:uppercase;font-size:11px;letter-spacing:.04em;">
              <tr>
                <th style="padding:12px;text-align:left;">Loja</th>
                <th style="padding:12px;text-align:left;">Tipo</th>
                <th style="padding:12px;text-align:left;">Numero</th>
                <th style="padding:12px;text-align:left;">Valor</th>
                <th style="padding:12px;text-align:left;">Data</th>
                <th style="padding:12px;text-align:left;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${recent || '<tr><td colspan="6" style="padding:20px;text-align:center;color:#94A3B8;">Nenhum documento emitido ainda.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;

    el.querySelectorAll('.nf-network-card').forEach(card => {
      card.addEventListener('click', () => {
        const selector = document.getElementById('store-selector');
        if (selector) selector.value = card.dataset.storeId;
        currentStoreFilter = card.dataset.storeId;
        render(currentStoreFilter);
      });
    });
  }

  async function renderStoreView(storeId) {
    const el = container();
    const store = getStore(storeId);
    if (!store) {
      el.innerHTML = '<div style="padding:24px;background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;color:#991B1B;">Loja nao encontrada.</div>';
      return;
    }

    const config = await getConfigForStore(storeId);
    const monthNotas = aggregateMonthNotas(storeId);
    const health = configHealth(config);
    const nextCupom = String(Number(config.nextCupomNumber || 1)).padStart(6, '0');
    const nextNfce = String(Number(config.nextNfceNumber || 1)).padStart(9, '0');

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:20px;">
        <div>
          <h2 style="margin:0;color:#1B4332;">Fiscal - ${store.nome}</h2>
          <p style="margin:6px 0 0;color:#64748B;font-size:14px;">Configuracao fiscal individual da unidade, com certificado e numeracao proprios.</p>
        </div>
        ${statusChip(health.label, health.bg, health.color)}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:24px;">
        ${metricCard('Certificado', config.certificadoA1 ? 'Enviado' : 'Pendente', config.certificadoA1 ? '#E8F5E9' : '#FFF8E1', config.certificadoA1 ? '#2E7D32' : '#F57F17')}
        ${metricCard('Cupom atual', nextCupom, '#F8FAFC', '#0F172A')}
        ${metricCard('Prox. NFC-e', nextNfce, '#F8FAFC', '#0F172A')}
        ${metricCard('Docs no mes', String(monthNotas.length), '#F8FAFC', '#0F172A')}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px;">
        ${tabButton('overview', 'Visao geral')}
        ${tabButton('config', 'Configuracao fiscal')}
        ${tabButton('cupom', 'Cupom nao fiscal')}
        ${tabButton('nfce', 'Pre-DANFE NFC-e')}
        ${tabButton('history', 'Historico')}
      </div>
      <div id="nf-tab-panel"></div>
    `;

    bindTabButtons(storeId);
    renderStoreTab(storeId, config);
  }

  function metricCard(label, value, bg, color) {
    return `
      <div style="background:#fff;border:1px solid #E5E7EB;border-radius:16px;padding:16px;">
        <div style="font-size:11px;color:#64748B;text-transform:uppercase;font-weight:800;letter-spacing:.04em;">${label}</div>
        <div style="display:inline-flex;margin-top:8px;padding:6px 12px;border-radius:999px;background:${bg};color:${color};font-size:20px;font-weight:800;">${value}</div>
      </div>
    `;
  }

  function tabButton(id, label) {
    const active = activeTab === id;
    return `
      <button type="button" class="nf-tab-btn" data-tab="${id}" style="padding:10px 16px;border-radius:999px;border:${active ? '1px solid #2D6A4F' : '1px solid #D1D5DB'};background:${active ? '#2D6A4F' : '#fff'};color:${active ? '#fff' : '#374151'};cursor:pointer;font-size:13px;font-weight:700;">
        ${label}
      </button>
    `;
  }

  function bindTabButtons(storeId) {
    const el = container();
    el.querySelectorAll('.nf-tab-btn').forEach(button => {
      button.addEventListener('click', () => {
        activeTab = button.dataset.tab;
        renderStoreView(storeId);
      });
    });
  }

  function renderStoreTab(storeId, config) {
    const panel = document.getElementById('nf-tab-panel');
    if (!panel) return;
    if (activeTab === 'config') {
      panel.innerHTML = renderConfigTab(storeId, config);
      bindConfigActions(storeId, config);
      return;
    }
    if (activeTab === 'cupom') {
      panel.innerHTML = renderEmissionTab(storeId, config, 'cupom_nao_fiscal');
      bindEmissionActions(storeId, config, 'cupom_nao_fiscal');
      return;
    }
    if (activeTab === 'nfce') {
      panel.innerHTML = renderEmissionTab(storeId, config, 'nfce_preview');
      bindEmissionActions(storeId, config, 'nfce_preview');
      return;
    }
    if (activeTab === 'history') {
      panel.innerHTML = renderHistoryTab(storeId);
      bindHistoryActions(storeId);
      return;
    }
    panel.innerHTML = renderOverviewTab(storeId, config);
  }

  function renderOverviewTab(storeId, config) {
    const store = getStore(storeId);
    const notas = aggregateMonthNotas(storeId).slice(0, 8);
    const nfceSetup = getNfceSetupStatus(config);
    const checks = [
      { label: 'CNPJ do emitente', ok: !!cleanDoc(config.cnpj) },
      { label: 'Endereco fiscal', ok: !!config.logradouro && !!config.municipio && !!config.uf },
      { label: 'Inscricao municipal para NFS-e', ok: !!config.inscricaoMunicipal },
      { label: 'Certificado A1 da loja', ok: !!config.certificadoA1 },
      { label: 'Numeracao fiscal', ok: Number(config.nextCupomNumber || 0) > 0 && Number(config.nextNfceNumber || 0) > 0 },
      { label: 'Modalidade do PDV', ok: !!config.modalidadeVarejo },
    ];

    return `
      <div style="display:grid;grid-template-columns:1.15fr .85fr;gap:18px;">
        <div style="background:#fff;border:1px solid #E5E7EB;border-radius:16px;padding:20px;">
          <h3 style="margin:0 0 14px;color:#1B4332;">Prontidao fiscal da unidade</h3>
          <div style="display:grid;gap:10px;">
            ${checks.map(item => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-radius:12px;background:${item.ok ? '#F0FDF4' : '#FEF2F2'};border:1px solid ${item.ok ? '#BBF7D0' : '#FECACA'};">
                <span style="font-size:14px;color:#0F172A;font-weight:600;">${item.label}</span>
                ${statusChip(item.ok ? 'OK' : 'Falta', item.ok ? '#DCFCE7' : '#FEE2E2', item.ok ? '#166534' : '#991B1B')}
              </div>
            `).join('')}
          </div>
          <div style="margin-top:18px;padding:14px;border-radius:12px;background:#F8FAFC;border:1px solid #E2E8F0;">
            <div style="font-size:12px;color:#64748B;text-transform:uppercase;font-weight:800;">Loja</div>
            <div style="margin-top:4px;font-size:15px;font-weight:800;color:#0F172A;">${store.nome}</div>
            <div style="margin-top:6px;font-size:13px;color:#475569;">${store.endereco || ''} · ${store.cidade || ''}/${store.estado || ''}</div>
          </div>
        </div>
        <div style="background:#fff;border:1px solid #E5E7EB;border-radius:16px;padding:20px;">
          <div style="padding:14px;border-radius:14px;background:${nfceSetup.ready ? '#ECFDF5' : '#FFF7ED'};border:1px solid ${nfceSetup.ready ? '#A7F3D0' : '#FED7AA'};margin-bottom:14px;">
            <div style="font-size:12px;color:${nfceSetup.ready ? '#166534' : '#9A3412'};text-transform:uppercase;font-weight:800;">NFC-e real</div>
            <div style="margin-top:4px;font-size:20px;font-weight:800;color:#0F172A;">${nfceSetup.done}/${nfceSetup.total} itens prontos</div>
            <div style="margin-top:6px;font-size:13px;color:#475569;">${nfceSetup.ready ? 'A unidade ja tem o basico para homologar a NFC-e.' : 'Falta completar os campos fiscais que a SEFAZ exige.'}</div>
          </div>
          <div style="display:grid;gap:8px;margin-bottom:14px;">
            ${nfceSetup.checks.map(item => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-radius:12px;background:${item.ok ? '#F0FDF4' : '#F8FAFC'};border:1px solid ${item.ok ? '#BBF7D0' : '#E2E8F0'};">
                <span style="font-size:13px;color:#0F172A;">${item.label}</span>
                ${statusChip(item.ok ? 'OK' : 'Falta', item.ok ? '#DCFCE7' : '#FFF7ED', item.ok ? '#166534' : '#9A3412')}
              </div>
            `).join('')}
          </div>
          <h3 style="margin:0 0 14px;color:#1B4332;">Ultimos documentos</h3>
          <div style="display:grid;gap:10px;">
            ${notas.length ? notas.map(nota => `
              <div style="padding:12px 14px;border:1px solid #E5E7EB;border-radius:12px;">
                <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;">
                  <strong style="color:#0F172A;">${noteTypeLabel(nota)} #${nota.numero || '-'}</strong>
                  ${noteStatusChip(nota)}
                </div>
                <div style="margin-top:6px;font-size:13px;color:#64748B;">${Utils.formatDateTime(nota.data || nota.createdAt || new Date().toISOString())}</div>
                <div style="margin-top:4px;font-size:14px;font-weight:700;color:#1B4332;">${Utils.formatBRL(Number(nota.total || nota.valor || 0))}</div>
              </div>
            `).join('') : '<div style="padding:18px;text-align:center;color:#94A3B8;border:1px dashed #CBD5E1;border-radius:12px;">Nenhum documento emitido nesta loja ainda.</div>'}
          </div>
        </div>
      </div>
    `;
  }

  function renderConfigTab(storeId, config) {
    const cert = config.certificadoA1 || null;
    const store = getStore(storeId);
    const nfceSetup = getNfceSetupStatus(config);
    const certStatus = cert
      ? `<div style="padding:12px 14px;border-radius:12px;background:#ECFDF5;border:1px solid #A7F3D0;color:#065F46;font-size:13px;"><strong>Certificado atual:</strong> ${cert.nomeArquivo || 'arquivo enviado'}<br><span>Enviado em ${cert.enviadoEm ? Utils.formatDateTime(cert.enviadoEm) : '-'} por ${cert.enviadoPor || 'usuario'}</span></div>`
      : `<div style="padding:12px 14px;border-radius:12px;background:#FFF7ED;border:1px solid #FED7AA;color:#9A3412;font-size:13px;">Nenhum certificado A1 foi enviado para esta loja.</div>`;

    return `
      <div style="display:grid;grid-template-columns:1.1fr .9fr;gap:18px;">
        <form id="nf-config-form" style="background:#fff;border:1px solid #E5E7EB;border-radius:16px;padding:20px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
            <div>
              <h3 style="margin:0;color:#1B4332;">Emitente por loja</h3>
              <div style="margin-top:6px;font-size:13px;color:#64748B;">Ja puxamos o maximo possivel do cadastro da unidade para reduzir suporte.</div>
            </div>
            <button type="button" id="nf-auto-fill" style="${secondaryButtonStyle()}padding:10px 14px;">Auto preencher da loja</button>
          </div>
          <div style="padding:12px 14px;border-radius:12px;background:#F8FAFC;border:1px solid #E2E8F0;color:#475569;font-size:13px;margin-bottom:14px;">
            O franqueado so precisa revisar o que a SEFAZ exige e completar o que nao existe no cadastro da loja, como CSC e certificado.
          </div>
          ${formGrid([
            textField('emitenteNome', 'Razao social', config.emitenteNome),
            textField('nomeFantasia', 'Nome fantasia', config.nomeFantasia),
            textField('cnpj', 'CNPJ', Utils.formatCNPJ(config.cnpj || ''), '00.000.000/0000-00'),
            textField('ie', 'Inscricao estadual', config.ie),
            textField('inscricaoMunicipal', 'Inscricao municipal', config.inscricaoMunicipal),
            selectField('crt', 'CRT', config.crt, [['1', '1 - Simples Nacional'], ['2', '2 - Simples Excesso'], ['3', '3 - Regime normal']]),
            selectField('ambiente', 'Ambiente', config.ambiente, [['homologacao', 'Homologacao'], ['producao', 'Producao']]),
            selectField('modalidadeVarejo', 'Documento do PDV', config.modalidadeVarejo, [['cupom_nao_fiscal', 'Cupom nao fiscal'], ['nfce_futura', 'NFC-e (quando integrar SEFAZ)']]),
          ])}
          <h4 style="margin:20px 0 12px;color:#1F2937;">Endereco fiscal</h4>
          ${formGrid([
            textField('cep', 'CEP', formatCep(config.cep)),
            textField('logradouro', 'Logradouro', config.logradouro),
            textField('numero', 'Numero', config.numero),
            textField('complemento', 'Complemento', config.complemento),
            textField('bairro', 'Bairro', config.bairro),
            textField('municipio', 'Municipio', config.municipio),
            textField('uf', 'UF', config.uf),
            textField('codigoMunicipioIbge', 'Codigo municipio IBGE', config.codigoMunicipioIbge),
            textField('telefone', 'Telefone', Utils.formatPhone(config.telefone || '')),
            textField('emailFiscal', 'E-mail fiscal', config.emailFiscal),
          ])}
          <h4 style="margin:20px 0 12px;color:#1F2937;">NFS-e / Prefeitura</h4>
          ${formGrid([
            selectField('nfseProvider', 'Provedor', config.nfseProvider, [['notaas', 'Notaas (Londrina)'], ['manual', 'Manual / outro'], ['desativado', 'Nao emitir NFS-e']]),
            textField('codigoTributacaoMunicipal', 'Codigo tributacao servico', config.codigoTributacaoMunicipal),
            textField('aliquotaIss', 'Aliquota ISS', config.aliquotaIss),
            textField('descricaoServicoPadrao', 'Descricao servico padrao', config.descricaoServicoPadrao),
            textField('serieNfce', 'Serie NFC-e', config.serieNfce),
            textField('serieNfe', 'Serie NF-e', config.serieNfe),
            textField('nextCupomNumber', 'Proximo cupom', String(config.nextCupomNumber || 1)),
            textField('nextNfceNumber', 'Proxima NFC-e', String(config.nextNfceNumber || 1)),
          ])}
          <h4 style="margin:20px 0 12px;color:#1F2937;">NFC-e / SEFAZ</h4>
          ${formGrid([
            textField('cscId', 'CSC ID', config.cscId, 'Ex: 1'),
            textField('cscToken', 'CSC Token', config.cscToken, 'Cole o token sem espacos'),
          ])}
          <div style="margin-top:18px;">
            <label style="display:block;font-size:12px;font-weight:800;color:#475569;text-transform:uppercase;margin-bottom:6px;">Observacoes padrao</label>
            <textarea name="observacoesPadrao" rows="4" style="${textAreaStyle()}">${escapeHtml(config.observacoesPadrao || '')}</textarea>
          </div>
          <div style="display:flex;justify-content:flex-end;margin-top:18px;">
            <button type="submit" style="${primaryButtonStyle()}">Salvar configuracao da loja</button>
          </div>
        </form>

        <div style="display:grid;gap:18px;">
          <div style="background:#fff;border:1px solid #E5E7EB;border-radius:16px;padding:20px;">
            <h3 style="margin:0 0 12px;color:#1B4332;">Checklist sem suporte</h3>
            <div style="display:grid;gap:8px;">
              ${nfceSetup.checks.map(item => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-radius:12px;background:${item.ok ? '#F0FDF4' : '#FFF7ED'};border:1px solid ${item.ok ? '#BBF7D0' : '#FED7AA'};">
                  <span style="font-size:13px;color:#0F172A;">${item.label}</span>
                  ${statusChip(item.ok ? 'Pronto' : 'Completar', item.ok ? '#DCFCE7' : '#FFEDD5', item.ok ? '#166534' : '#9A3412')}
                </div>
              `).join('')}
            </div>
            <div style="margin-top:12px;font-size:13px;color:#64748B;">Quando tudo ficar verde, a loja ja consegue testar em homologacao com menos risco de travar.</div>
          </div>
          <div style="background:#fff;border:1px solid #E5E7EB;border-radius:16px;padding:20px;">
            <h3 style="margin:0 0 16px;color:#1B4332;">Certificado digital A1</h3>
            ${certStatus}
            <div style="margin-top:14px;padding:12px 14px;border-radius:12px;background:#F8FAFC;border:1px solid #E2E8F0;color:#475569;font-size:13px;">O fallback da Hostinger guarda o certificado fora do site publico e salva a senha criptografada no servidor para uso fiscal futuro da loja. O CNPJ do certificado deve bater com o CNPJ fiscal da unidade.</div>
            <form id="nf-cert-form" style="margin-top:14px;display:grid;gap:12px;">
              <div>
                <label style="display:block;font-size:12px;font-weight:800;color:#475569;text-transform:uppercase;margin-bottom:6px;">Arquivo .pfx ou .p12</label>
                <input type="file" name="certificado" accept=".pfx,.p12" style="${inputStyle()}">
              </div>
              <div>
                <label style="display:block;font-size:12px;font-weight:800;color:#475569;text-transform:uppercase;margin-bottom:6px;">Senha do certificado</label>
                <input type="password" name="certificadoSenha" placeholder="Informada so para validacao local" style="${inputStyle()}">
              </div>
              <button type="submit" style="${secondaryButtonStyle()}">Enviar certificado da loja</button>
            </form>
          </div>
          <div style="background:#fff;border:1px solid #E5E7EB;border-radius:16px;padding:20px;">
            <h3 style="margin:0 0 12px;color:#1B4332;">Guia rapido de producao</h3>
            <ul style="margin:0;padding-left:18px;color:#475569;font-size:14px;line-height:1.6;">
              <li>Use "Auto preencher da loja" para puxar CNPJ, endereco, telefone e cidade.</li>
              <li>Cada franquia deve ter CNPJ, IE/IM, CSC e certificado proprios.</li>
              <li>Selecione ambiente de homologacao antes de ir para producao.</li>
              <li>Para Londrina, normalmente o codigo IBGE entra automatico como 4113700.</li>
              <li>Para Londrina, preencha inscricao municipal e codigo do servico de NFS-e.</li>
              <li>O PDV usa esta configuracao da loja para gerar o PDF e reservar numeracao.</li>
            </ul>
          </div>
        </div>
      </div>
    `;
  }

  function renderEmissionTab(storeId, config, type) {
    const isNfce = type === 'nfce_preview';
    return `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;">
        <div style="background:#fff;border:1px solid #E5E7EB;border-radius:16px;padding:20px;">
          <h3 style="margin:0 0 12px;color:#1B4332;">${isNfce ? 'Gerar pre-DANFE NFC-e' : 'Gerar cupom nao fiscal'}</h3>
          <p style="margin:0 0 16px;color:#64748B;font-size:14px;">Busca uma venda da loja, monta o documento e salva o historico fiscal da unidade.</p>
          ${isNfce ? `<div style="margin-bottom:14px;padding:12px 14px;border-radius:12px;background:#EFF6FF;border:1px solid #BFDBFE;color:#1D4ED8;font-size:13px;">Esta tela gera o PDF/preview operacional da NFC-e. A transmissao real para SEFAZ depende da integracao server-side do certificado.</div>` : ''}
          <form id="nf-emission-form" data-type="${type}" style="display:grid;gap:12px;">
            <div>
              <label style="display:block;font-size:12px;font-weight:800;color:#475569;text-transform:uppercase;margin-bottom:6px;">Numero do pedido ou ID da venda</label>
              <div style="display:flex;gap:8px;">
                <input type="text" name="pedidoBusca" placeholder="Ex: PDV202604020001" style="${inputStyle()}flex:1;">
                <button type="button" data-action="buscar-pedido" style="${secondaryButtonStyle()}white-space:nowrap;">Buscar</button>
              </div>
            </div>
            <div>
              <label style="display:block;font-size:12px;font-weight:800;color:#475569;text-transform:uppercase;margin-bottom:6px;">CPF/CNPJ do cliente</label>
              <input type="text" name="clienteDoc" placeholder="Opcional" style="${inputStyle()}">
            </div>
            <div>
              <label style="display:block;font-size:12px;font-weight:800;color:#475569;text-transform:uppercase;margin-bottom:6px;">Observacoes do documento</label>
              <textarea name="observacoes" rows="3" style="${textAreaStyle()}">${escapeHtml(config.observacoesPadrao || '')}</textarea>
            </div>
            <button type="submit" style="${primaryButtonStyle()}">${isNfce ? 'Gerar PDF operacional NFC-e' : 'Gerar cupom da venda'}</button>
          </form>
        </div>
        <div style="background:#fff;border:1px solid #E5E7EB;border-radius:16px;padding:20px;">
          <h3 style="margin:0 0 12px;color:#1B4332;">Preview do documento</h3>
          <div id="nf-order-preview" style="min-height:420px;padding:18px;border:1px dashed #CBD5E1;border-radius:16px;background:#F8FAFC;color:#64748B;">Busque um pedido para visualizar o documento antes de salvar.</div>
        </div>
      </div>
    `;
  }

  function renderHistoryTab(storeId) {
    const notas = cachedNotas.filter(nota => nota.loja === storeId).sort((a, b) => new Date(b.data || b.createdAt || 0) - new Date(a.data || a.createdAt || 0));
    return `
      <div style="background:#fff;border:1px solid #E5E7EB;border-radius:16px;overflow:hidden;">
        <div style="padding:18px 20px;border-bottom:1px solid #E5E7EB;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
          <h3 style="margin:0;color:#1B4332;">Historico da unidade</h3>
          <span style="font-size:13px;color:#64748B;">${notas.length} documento(s)</span>
        </div>
        <div style="overflow:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <thead style="background:#F8FAFC;color:#475569;text-transform:uppercase;font-size:11px;letter-spacing:.04em;">
              <tr>
                <th style="padding:12px;text-align:left;">Tipo</th>
                <th style="padding:12px;text-align:left;">Numero</th>
                <th style="padding:12px;text-align:left;">Pedido</th>
                <th style="padding:12px;text-align:left;">Cliente</th>
                <th style="padding:12px;text-align:left;">Valor</th>
                <th style="padding:12px;text-align:left;">Status</th>
                <th style="padding:12px;text-align:left;">Acao</th>
              </tr>
            </thead>
            <tbody>
              ${notas.length ? notas.map(nota => `
                <tr>
                  <td style="padding:12px;">${noteTypeLabel(nota)}</td>
                  <td style="padding:12px;font-weight:700;color:#1B4332;">${nota.numero || '-'}</td>
                  <td style="padding:12px;">${nota.pedidoNumero || nota.pedidoId || '-'}</td>
                  <td style="padding:12px;">${escapeHtml(nota.clienteNome || 'Consumidor Final')}</td>
                  <td style="padding:12px;">${Utils.formatBRL(Number(nota.total || nota.valor || 0))}</td>
                  <td style="padding:12px;">${noteStatusChip(nota)}</td>
                  <td style="padding:12px;"><button type="button" class="nf-history-print" data-id="${nota.id}" style="${secondaryButtonStyle()}padding:8px 12px;">Abrir PDF</button></td>
                </tr>
              `).join('') : '<tr><td colspan="7" style="padding:20px;text-align:center;color:#94A3B8;">Nenhum documento salvo para esta loja.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function bindConfigActions(storeId, config) {
    const configForm = document.getElementById('nf-config-form');
    const certForm = document.getElementById('nf-cert-form');
    const autofillButton = document.getElementById('nf-auto-fill');

    if (autofillButton) {
      autofillButton.addEventListener('click', () => {
        const store = getStore(storeId);
        const values = buildStoreAutofill(store, config);
        Object.entries(values).forEach(([name, value]) => {
          const field = configForm ? configForm.elements.namedItem(name) : null;
          if (field) field.value = name === 'cnpj' ? Utils.formatCNPJ(value || '') : value;
        });
        Toast.success('Campos base da loja preenchidos automaticamente');
      });
    }

    if (configForm) {
      configForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(configForm);
        const payload = {
          ...config,
          emitenteNome: String(formData.get('emitenteNome') || '').trim(),
          nomeFantasia: String(formData.get('nomeFantasia') || '').trim(),
          cnpj: cleanDoc(formData.get('cnpj')),
          ie: cleanDoc(formData.get('ie')),
          inscricaoMunicipal: String(formData.get('inscricaoMunicipal') || '').trim(),
          crt: String(formData.get('crt') || '1'),
          ambiente: String(formData.get('ambiente') || 'homologacao'),
          serieNfce: String(formData.get('serieNfce') || '1').trim(),
          serieNfe: String(formData.get('serieNfe') || '1').trim(),
          nextCupomNumber: Number(formData.get('nextCupomNumber') || 1),
          nextNfceNumber: Number(formData.get('nextNfceNumber') || 1),
          cscId: String(formData.get('cscId') || '').trim(),
          cscToken: String(formData.get('cscToken') || '').trim(),
          municipio: String(formData.get('municipio') || '').trim(),
          uf: String(formData.get('uf') || '').trim().toUpperCase(),
          codigoMunicipioIbge: String(formData.get('codigoMunicipioIbge') || '').trim() || inferMunicipioIbge(formData.get('municipio'), formData.get('uf')),
          cep: cleanDoc(formData.get('cep')),
          logradouro: String(formData.get('logradouro') || '').trim(),
          numero: String(formData.get('numero') || '').trim(),
          complemento: String(formData.get('complemento') || '').trim(),
          bairro: String(formData.get('bairro') || '').trim(),
          telefone: cleanDoc(formData.get('telefone')),
          emailFiscal: String(formData.get('emailFiscal') || '').trim(),
          modalidadeVarejo: String(formData.get('modalidadeVarejo') || 'cupom_nao_fiscal'),
          nfseProvider: String(formData.get('nfseProvider') || 'notaas'),
          codigoTributacaoMunicipal: String(formData.get('codigoTributacaoMunicipal') || '').trim(),
          aliquotaIss: String(formData.get('aliquotaIss') || '0.00').trim(),
          descricaoServicoPadrao: String(formData.get('descricaoServicoPadrao') || '').trim(),
          observacoesPadrao: String(formData.get('observacoesPadrao') || '').trim(),
        };

        if (!payload.emitenteNome || !payload.cnpj) {
          Toast.error('Preencha ao menos a razao social e o CNPJ da loja');
          return;
        }
        if (payload.cnpj.length !== 14) {
          Toast.error('Informe um CNPJ valido da unidade');
          return;
        }
        if (payload.modalidadeVarejo === 'nfce_futura' && (!payload.cscId || !payload.cscToken)) {
          Toast.error('Para NFC-e, preencha CSC ID e CSC Token da loja');
          return;
        }
        if (payload.modalidadeVarejo === 'nfce_futura' && !payload.codigoMunicipioIbge) {
          Toast.error('Informe o codigo do municipio IBGE para a NFC-e');
          return;
        }

        try {
          if (useFirestore()) {
            await FirestoreService.FiscalConfig.save(storeId, payload);
            await FirestoreService.FiscalAudit.add(storeId, {
              acao: 'config_atualizada',
              modulo: 'fiscal',
              resumo: 'Configuracao fiscal da loja atualizada',
            });
          } else {
            localSaveConfig(storeId, payload);
          }
          Toast.success('Configuracao fiscal salva para a loja');
          render(storeId);
        } catch (error) {
          Toast.error(`Nao foi possivel salvar a configuracao: ${error.message}`);
        }
      });
    }

    if (certForm) {
      certForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(certForm);
        const file = formData.get('certificado');
        const password = String(formData.get('certificadoSenha') || '').trim();
        if (!(file instanceof File) || !file.name) {
          Toast.error('Selecione um certificado .pfx ou .p12');
          return;
        }
        if (!/\.(pfx|p12)$/i.test(file.name)) {
          Toast.error('Use um certificado A1 no formato .pfx ou .p12');
          return;
        }
        if (!password) {
          Toast.error('Informe a senha do certificado para validacao local');
          return;
        }

        const updatedConfig = { ...config };
        try {
          const metadata = await validateCertificateUpload(storeId, file, password);
          updatedConfig.certificadoA1 = metadata;
          updatedConfig.certificadoStatus = 'enviado';
          updatedConfig.certificadoSenhaCadastrada = false;
          if (useFirestore()) {
            await FirestoreService.FiscalConfig.save(storeId, updatedConfig);
            await FirestoreService.FiscalAudit.add(storeId, {
              acao: 'certificado_enviado',
              modulo: 'fiscal',
              resumo: `Certificado ${metadata.nomeArquivo} enviado para a loja`,
            });
          } else {
            localSaveConfig(storeId, updatedConfig);
          }
          Toast.success('Certificado vinculado a esta loja');
          render(storeId);
        } catch (error) {
          Toast.error(error.message || 'Falha ao enviar certificado');
        }
      });
    }
  }

  async function validateCertificateUpload(storeId, file, password) {
    if (useFirestore()) {
      try {
        return await FirestoreService.FiscalConfig.uploadCertificate(storeId, file);
      } catch (error) {
        console.warn('[AdminNF] Firebase Storage indisponivel, tentando Hostinger:', error.message);
      }
    }

    const remote = await uploadCertificateViaHostinger(storeId, file, password);
    if (remote) return remote;

    return {
      nomeArquivo: file.name,
      tamanho: file.size,
      contentType: file.type || 'application/x-pkcs12',
      enviadoEm: new Date().toISOString(),
      enviadoPor: AppState.get('user') ? AppState.get('user').nome : 'Admin',
      storagePath: 'local-fallback',
      downloadURL: null,
      storageProvider: 'local-fallback',
    };
  }

  async function uploadCertificateViaHostinger(storeId, file, password) {
    if (!navigator.onLine) {
      throw new Error('Sem internet para enviar o certificado ao fallback da Hostinger.');
    }
    if (!(CdnFirebase && CdnFirebase.auth && CdnFirebase.auth.currentUser)) {
      throw new Error('Sessao Firebase nao encontrada para autenticar o upload.');
    }

    const idToken = await CdnFirebase.auth.currentUser.getIdToken();
    const formData = new FormData();
    formData.append('storeId', storeId);
    formData.append('certificatePassword', password || '');
    formData.append('certificate', file);

    const response = await fetch('https://api.clubedonatural.com/fiscal/upload-certificate.php', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      body: formData,
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch (error) {
      throw new Error('Resposta invalida do fallback da Hostinger.');
    }

    if (!response.ok || !payload || payload.ok !== true) {
      throw new Error(payload && payload.error ? payload.error : 'Falha no fallback da Hostinger.');
    }

    return {
      nomeArquivo: payload.fileName || file.name,
      tamanho: Number(payload.size || file.size || 0),
      contentType: payload.contentType || file.type || 'application/x-pkcs12',
      enviadoEm: payload.uploadedAt || new Date().toISOString(),
      enviadoPor: AppState.get('user') ? AppState.get('user').nome : 'Admin',
      enviadoPorId: AppState.get('user') ? AppState.get('user').id : null,
      storagePath: payload.storagePath || '',
      downloadURL: null,
      storageProvider: 'hostinger',
      validade: payload.validUntil || '',
      cnpjCertificado: payload.cnpj || '',
    };
  }

  function bindEmissionActions(storeId, config, type) {
    const form = document.getElementById('nf-emission-form');
    const preview = document.getElementById('nf-order-preview');
    if (!form || !preview) return;
    const nfceSetup = getNfceSetupStatus(config);

    let loadedOrder = null;

    const drawPreview = async () => {
      const pedidoBusca = String(form.querySelector('[name="pedidoBusca"]').value || '').trim();
      if (!pedidoBusca) {
        Toast.error('Informe o pedido para buscar');
        return;
      }
      loadedOrder = await findOrder(storeId, pedidoBusca);
      if (!loadedOrder) {
        preview.innerHTML = '<div style="text-align:center;color:#991B1B;">Pedido nao encontrado para esta loja.</div>';
        Toast.error('Pedido nao encontrado');
        return;
      }
      preview.innerHTML = renderDocumentPreview(storeId, config, loadedOrder, type);
    };

    form.querySelector('[data-action="buscar-pedido"]').addEventListener('click', drawPreview);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (type === 'nfce_preview' && !nfceSetup.ready) {
        Toast.error('Complete o checklist fiscal da loja antes de gerar a NFC-e');
        return;
      }
      if (!loadedOrder) {
        await drawPreview();
        if (!loadedOrder) return;
      }

      const numberField = type === 'cupom_nao_fiscal' ? 'nextCupomNumber' : 'nextNfceNumber';
      const documentNumber = useFirestore()
        ? await FirestoreService.FiscalConfig.reserveNumber(storeId, numberField, 1)
        : localReserveNumber(storeId, numberField, 1);

      const customerDoc = cleanDoc(form.querySelector('[name="clienteDoc"]').value || loadedOrder.cliente.cpf || '');
      const observacoes = String(form.querySelector('[name="observacoes"]').value || '').trim();
      const store = getStore(storeId);
      const numberLabel = type === 'cupom_nao_fiscal' ? String(documentNumber).padStart(6, '0') : String(documentNumber).padStart(9, '0');
      const accessKey = type === 'nfce_preview' ? createAccessKey(store, documentNumber) : null;

      const nota = {
        id: `NF-${Utils.generateId()}`,
        tipo: type,
        numero: numberLabel,
        serie: type === 'nfce_preview' ? (config.serieNfce || '1') : '0',
        pedidoId: loadedOrder.id,
        pedidoNumero: loadedOrder.numero,
        clienteNome: loadedOrder.cliente.nome,
        clienteDocumento: customerDoc,
        pagamento: loadedOrder.pagamento,
        subtotal: loadedOrder.subtotal,
        desconto: loadedOrder.desconto || 0,
        total: loadedOrder.total,
        valor: loadedOrder.total,
        items: loadedOrder.items,
        status: type === 'nfce_preview' ? 'preview' : 'emitida',
        loja: storeId,
        data: new Date().toISOString(),
        observacoes,
        accessKey,
        pdfHtml: buildPrintableDocument(store, config, loadedOrder, {
          tipo: type,
          numero: numberLabel,
          accessKey,
          clienteDocumento: customerDoc,
          observacoes,
        }),
      };

      try {
        if (useFirestore()) {
          await FirestoreService.NotasFiscais.save(storeId, nota);
          await FirestoreService.FiscalAudit.add(storeId, {
            acao: 'documento_emitido',
            modulo: 'fiscal',
            resumo: `${noteTypeLabel(nota)} ${nota.numero} gerado para o pedido ${loadedOrder.numero}`,
            notaId: nota.id,
            pedidoId: loadedOrder.id,
          });
        } else {
          localSaveNota(storeId, nota);
        }
        Toast.success(`${noteTypeLabel(nota)} ${nota.numero} salvo com sucesso`);
        openPrintableWindow(nota.pdfHtml, `${noteTypeLabel(nota)} ${nota.numero}`);
        activeTab = 'history';
        render(storeId);
      } catch (error) {
        Toast.error(`Falha ao salvar documento: ${error.message}`);
      }
    });
  }

  function bindHistoryActions(storeId) {
    document.querySelectorAll('.nf-history-print').forEach(button => {
      button.addEventListener('click', () => {
        const nota = cachedNotas.find(item => item.id === button.dataset.id && item.loja === storeId);
        if (!nota) {
          Toast.error('Documento nao encontrado');
          return;
        }
        openPrintableWindow(nota.pdfHtml || '<div>Documento sem preview.</div>', `${noteTypeLabel(nota)} ${nota.numero || ''}`);
      });
    });
  }

  function renderDocumentPreview(storeId, config, order, type) {
    const store = getStore(storeId);
    const customerDoc = order.cliente.cpf ? Utils.formatCPF(order.cliente.cpf) : '';
    const items = order.items.map(item => `
      <tr>
        <td style="padding:6px 0;">${item.quantidade}</td>
        <td style="padding:6px 8px;">${escapeHtml(item.nome)} ${item.peso ? `<span style="color:#64748B;">(${escapeHtml(item.peso)})</span>` : ''}</td>
        <td style="padding:6px 0;text-align:right;">${Utils.formatBRL(item.preco)}</td>
        <td style="padding:6px 0;text-align:right;font-weight:700;">${Utils.formatBRL(item.total)}</td>
      </tr>
    `).join('');

    return `
      <div style="background:#fff;border:1px solid #E5E7EB;border-radius:14px;padding:18px;max-width:100%;">
        <div style="text-align:center;border-bottom:1px dashed #CBD5E1;padding-bottom:12px;margin-bottom:12px;">
          <div style="font-size:18px;font-weight:800;color:#1B4332;">${store.nome}</div>
          <div style="font-size:12px;color:#64748B;margin-top:4px;">${store.endereco || ''}</div>
          <div style="font-size:12px;color:#64748B;">CNPJ ${Utils.formatCNPJ(config.cnpj || store.cnpj || '')}${config.ie ? ` · IE ${config.ie}` : ''}</div>
          <div style="font-size:13px;font-weight:700;color:#0F172A;margin-top:10px;">${type === 'nfce_preview' ? 'PRE-DANFE NFC-e' : 'CUPOM NAO FISCAL'}</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;color:#334155;margin-bottom:12px;">
          <div><strong>Pedido:</strong> ${order.numero}</div>
          <div><strong>Pagamento:</strong> ${getPaymentLabel(order.pagamento)}</div>
          <div><strong>Cliente:</strong> ${escapeHtml(order.cliente.nome)}</div>
          <div><strong>Documento:</strong> ${customerDoc || 'Consumidor final'}</div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="border-bottom:1px solid #E5E7EB;color:#64748B;text-transform:uppercase;font-size:11px;">
              <th style="padding:6px 0;text-align:left;">Qtd</th>
              <th style="padding:6px 8px;text-align:left;">Item</th>
              <th style="padding:6px 0;text-align:right;">Unit</th>
              <th style="padding:6px 0;text-align:right;">Total</th>
            </tr>
          </thead>
          <tbody>${items}</tbody>
        </table>
        <div style="border-top:1px dashed #CBD5E1;margin-top:12px;padding-top:12px;">
          <div style="display:flex;justify-content:space-between;font-size:13px;color:#475569;"><span>Subtotal</span><strong>${Utils.formatBRL(order.subtotal)}</strong></div>
          ${Number(order.desconto || 0) > 0 ? `<div style="display:flex;justify-content:space-between;font-size:13px;color:#475569;"><span>Desconto</span><strong>- ${Utils.formatBRL(order.desconto)}</strong></div>` : ''}
          <div style="display:flex;justify-content:space-between;font-size:16px;color:#1B4332;font-weight:800;margin-top:6px;"><span>Total</span><strong>${Utils.formatBRL(order.total)}</strong></div>
        </div>
      </div>
    `;
  }

  function buildPrintableDocument(store, config, order, meta) {
    const title = meta.tipo === 'nfce_preview' ? 'PRE-DANFE NFC-e' : 'CUPOM NAO FISCAL';
    const itemsRows = order.items.map(item => `
      <tr>
        <td>${item.quantidade}</td>
        <td>${escapeHtml(item.nome)}${item.peso ? ` <span style="color:#64748B;">(${escapeHtml(item.peso)})</span>` : ''}</td>
        <td class="right">${Utils.formatBRL(item.preco)}</td>
        <td class="right">${Utils.formatBRL(item.total)}</td>
      </tr>
    `).join('');

    return `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>${title} ${meta.numero}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #0F172A; margin: 24px; }
          .sheet { max-width: 820px; margin: 0 auto; border: 1px solid #CBD5E1; border-radius: 18px; padding: 24px; }
          .center { text-align: center; }
          .muted { color: #64748B; }
          .title { font-size: 24px; font-weight: 800; color: #1B4332; }
          .subtitle { margin-top: 6px; font-size: 13px; }
          .badge { display: inline-block; padding: 6px 10px; border-radius: 999px; background: #E8F5E9; color: #2E7D32; font-size: 11px; font-weight: 800; }
          .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 18px 0; }
          .card { border: 1px solid #E5E7EB; border-radius: 12px; padding: 12px 14px; }
          .label { display: block; color: #64748B; font-size: 11px; text-transform: uppercase; font-weight: 800; margin-bottom: 4px; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th, td { padding: 10px 6px; border-bottom: 1px solid #E5E7EB; font-size: 13px; text-align: left; }
          .right { text-align: right; }
          .totals { margin-top: 16px; margin-left: auto; max-width: 320px; }
          .totals-row { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 14px; }
          .totals-row.total { font-size: 18px; font-weight: 800; color: #1B4332; border-top: 2px solid #0F172A; padding-top: 8px; margin-top: 8px; }
          .footer { margin-top: 24px; padding-top: 18px; border-top: 1px dashed #CBD5E1; font-size: 12px; color: #64748B; }
        </style>
      </head>
      <body>
        <div class="sheet">
          <div class="center">
            <div class="title">${escapeHtml(store.nome || 'Clube do Natural')}</div>
            <div class="subtitle muted">${escapeHtml(store.endereco || '')}</div>
            <div class="subtitle muted">CNPJ ${Utils.formatCNPJ(config.cnpj || store.cnpj || '')}${config.ie ? ` · IE ${escapeHtml(config.ie)}` : ''}</div>
            <div style="margin-top: 14px;"><span class="badge">${title}</span></div>
          </div>
          <div class="grid">
            <div class="card"><span class="label">Numero</span><strong>${meta.numero}</strong></div>
            <div class="card"><span class="label">Serie</span><strong>${escapeHtml(meta.tipo === 'nfce_preview' ? (config.serieNfce || '1') : '0')}</strong></div>
            <div class="card"><span class="label">Pedido</span><strong>${escapeHtml(order.numero)}</strong></div>
            <div class="card"><span class="label">Pagamento</span><strong>${escapeHtml(getPaymentLabel(order.pagamento))}</strong></div>
            <div class="card"><span class="label">Cliente</span><strong>${escapeHtml(order.cliente.nome || 'Consumidor Final')}</strong></div>
            <div class="card"><span class="label">CPF/CNPJ</span><strong>${meta.clienteDocumento ? escapeHtml(meta.clienteDocumento) : 'Consumidor final'}</strong></div>
          </div>
          ${meta.accessKey ? `<div class="card"><span class="label">Chave de acesso de referencia</span><strong>${formatAccessKey(meta.accessKey)}</strong></div>` : ''}
          <table>
            <thead>
              <tr>
                <th>Qtd</th>
                <th>Item</th>
                <th class="right">Unitario</th>
                <th class="right">Total</th>
              </tr>
            </thead>
            <tbody>${itemsRows}</tbody>
          </table>
          <div class="totals">
            <div class="totals-row"><span>Subtotal</span><strong>${Utils.formatBRL(order.subtotal)}</strong></div>
            ${Number(order.desconto || 0) > 0 ? `<div class="totals-row"><span>Desconto</span><strong>- ${Utils.formatBRL(order.desconto)}</strong></div>` : ''}
            ${Number(order.taxaEntrega || 0) > 0 ? `<div class="totals-row"><span>Entrega</span><strong>${Utils.formatBRL(order.taxaEntrega)}</strong></div>` : ''}
            <div class="totals-row total"><span>Total</span><strong>${Utils.formatBRL(order.total)}</strong></div>
          </div>
          ${meta.observacoes ? `<div class="footer"><strong>Observacoes:</strong> ${escapeHtml(meta.observacoes)}</div>` : '<div class="footer">Documento gerado pelo modulo fiscal da loja para controle operacional e impressao em PDF.</div>'}
        </div>
        <script>window.print();<\/script>
      </body>
      </html>
    `;
  }

  function openPrintableWindow(html, title) {
    const win = window.open('', '_blank', 'width=960,height=720');
    if (!win) {
      Toast.error('Popup bloqueado. Permita popups para abrir o PDF.');
      return;
    }
    win.document.open();
    win.document.write(html.replace(/<title>.*?<\/title>/, `<title>${escapeHtml(title)}</title>`));
    win.document.close();
  }

  function formGrid(fields) {
    return `<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;">${fields.join('')}</div>`;
  }

  function textField(name, label, value, placeholder = '') {
    return `<div><label style="display:block;font-size:12px;font-weight:800;color:#475569;text-transform:uppercase;margin-bottom:6px;">${label}</label><input type="text" name="${name}" value="${escapeHtml(value || '')}" placeholder="${escapeHtml(placeholder)}" style="${inputStyle()}"></div>`;
  }

  function selectField(name, label, current, options) {
    return `<div><label style="display:block;font-size:12px;font-weight:800;color:#475569;text-transform:uppercase;margin-bottom:6px;">${label}</label><select name="${name}" style="${inputStyle()}">${options.map(([value, optionLabel]) => `<option value="${value}" ${String(current) === String(value) ? 'selected' : ''}>${optionLabel}</option>`).join('')}</select></div>`;
  }

  function inputStyle() {
    return 'width:100%;padding:12px 14px;border:1px solid #D1D5DB;border-radius:12px;font-size:14px;box-sizing:border-box;background:#fff;';
  }

  function textAreaStyle() {
    return 'width:100%;padding:12px 14px;border:1px solid #D1D5DB;border-radius:12px;font-size:14px;box-sizing:border-box;background:#fff;resize:vertical;';
  }

  function primaryButtonStyle() {
    return 'background:#2D6A4F;color:#fff;border:none;padding:12px 18px;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;';
  }

  function secondaryButtonStyle() {
    return 'background:#fff;color:#2D6A4F;border:1px solid #2D6A4F;padding:12px 18px;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;';
  }

  function formatCep(value) {
    const clean = cleanDoc(value);
    if (clean.length !== 8) return value || '';
    return `${clean.slice(0, 5)}-${clean.slice(5)}`;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  return {
    render,
  };
})();
