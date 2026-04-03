/* ============================================
   CLUBE DO NATURAL — Sistema de Afiliados
   Links de indicação para funcionários e influencers
   - Funcionário: ?ref=f-{loja}-{codigo}
   - Influencer:  ?ref=i-{codigo}
   - Dashboard com links (geral e por produto)
   - Comissão/pontos por venda via link
   - Admin gerencia tudo
   ============================================ */

const AdminAfiliados = (() => {
  'use strict';

  const AFFILIATES_KEY = 'metas_affiliates';
  const AFFILIATE_SALES_KEY = 'metas_affiliate_sales';
  const AFFILIATE_CONFIG_KEY = 'metas_affiliate_config';

  const DEFAULT_CONFIG = {
    comissaoFuncionarioPct: 3,    // 3% commission for employees
    comissaoInfluencerPct: 5,     // 5% commission for influencers
    pontosPorVendaAfiliado: 15,   // points per referred sale (employee)
    cookieDays: 30,               // how long the referral cookie lasts
    ativo: true,                  // system active
  };

  let _affiliates = [];
  let _sales = [];
  let _config = null;
  let _currentView = 'list';
  let _selectedAffiliate = null;

  /* ------------------------------------------
     DATA
  ------------------------------------------ */
  function loadConfig() {
    _config = Storage.get(AFFILIATE_CONFIG_KEY) || { ...DEFAULT_CONFIG };
    return _config;
  }

  function saveConfig() {
    Storage.set(AFFILIATE_CONFIG_KEY, _config);
    if (typeof FirestoreService !== 'undefined') {
      try { FirestoreService.Afiliados.saveConfig(_config); } catch(e) {}
    }
  }

  function loadAffiliates() {
    _affiliates = Storage.get(AFFILIATES_KEY) || [];
    // Sync from Firestore
    if (typeof FirestoreService !== 'undefined') {
      try {
        FirestoreService.init();
        FirestoreService.Afiliados.getAll().then(afs => {
          if (afs && afs.length > 0) { _affiliates = afs; Storage.set(AFFILIATES_KEY, afs); }
        }).catch(() => {});
      } catch(e) {}
    }
    return _affiliates;
  }

  function saveAffiliates() {
    Storage.set(AFFILIATES_KEY, _affiliates);
  }

  function loadSales() {
    _sales = Storage.get(AFFILIATE_SALES_KEY) || [];
    return _sales;
  }

  function saveSales() {
    Storage.set(AFFILIATE_SALES_KEY, _sales);
  }

  function generateCode(nome) {
    // Generate a short unique code from name
    const base = nome.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 8);

    // Check uniqueness
    const existing = _affiliates.map(a => a.codigo);
    let code = base;
    let counter = 2;
    while (existing.includes(code)) {
      code = base + counter;
      counter++;
    }
    return code;
  }

  function createAffiliate(data) {
    const affiliate = {
      id: 'AFL-' + Date.now(),
      tipo: data.tipo, // 'funcionario' | 'influencer'
      nome: data.nome,
      codigo: data.codigo || generateCode(data.nome),
      empId: data.empId || null,   // linked employee ID (for funcionarios)
      lojaId: data.lojaId || null, // linked store (for funcionarios)
      email: data.email || '',
      telefone: data.telefone || '',
      instagram: data.instagram || '',
      comissaoPct: data.comissaoPct || (data.tipo === 'influencer' ? _config.comissaoInfluencerPct : _config.comissaoFuncionarioPct),
      ativo: true,
      criadoEm: new Date().toISOString(),
      totalVendas: 0,
      totalComissao: 0,
      totalPedidos: 0,
    };

    _affiliates.push(affiliate);
    saveAffiliates();
    if (typeof FirestoreService !== 'undefined') {
      try { FirestoreService.Afiliados.save(affiliate); } catch(e) {}
    }
    return affiliate;
  }

  function getAffiliateByCode(code) {
    return _affiliates.find(a => a.codigo === code && a.ativo);
  }

  function getAffiliateByEmpId(empId) {
    return _affiliates.find(a => a.empId === empId && a.ativo);
  }

  /* ------------------------------------------
     REFERRAL LINK GENERATION
  ------------------------------------------ */
  function getBaseUrl() {
    return window.location.origin;
  }

  function getGeneralLink(affiliate) {
    const prefix = affiliate.tipo === 'funcionario' ? 'f' : 'i';
    const lojaSlug = affiliate.lojaId || '';
    if (affiliate.tipo === 'funcionario' && lojaSlug) {
      return `${getBaseUrl()}/catalogo.html?ref=${prefix}-${lojaSlug}-${affiliate.codigo}`;
    }
    return `${getBaseUrl()}/catalogo.html?ref=${prefix}-${affiliate.codigo}`;
  }

  function getProductLink(affiliate, productId) {
    const base = getGeneralLink(affiliate);
    return `${base}#/produto/${productId}`;
  }

  /* ------------------------------------------
     REFERRAL TRACKING (called from public pages)
  ------------------------------------------ */
  function detectReferral() {
    // Check URL for ?ref= parameter
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');
    if (ref) {
      Storage.set('affiliate_ref', {
        code: ref,
        timestamp: new Date().toISOString(),
        landingPage: window.location.href,
      });
      // Clean URL without refresh
      if (window.history.replaceState) {
        const cleanUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, '', cleanUrl);
      }
    }
  }

  function getActiveReferral() {
    const ref = Storage.get('affiliate_ref');
    if (!ref) return null;

    // Check expiry (default 30 days)
    const config = Storage.get(AFFILIATE_CONFIG_KEY) || DEFAULT_CONFIG;
    const maxAge = (config.cookieDays || 30) * 24 * 60 * 60 * 1000;
    if (new Date() - new Date(ref.timestamp) > maxAge) {
      Storage.remove('affiliate_ref');
      return null;
    }

    return ref;
  }

  function parseRefCode(refString) {
    // Parse: f-{loja}-{codigo} or i-{codigo}
    const parts = refString.split('-');
    if (parts.length >= 2) {
      const tipo = parts[0] === 'f' ? 'funcionario' : parts[0] === 'i' ? 'influencer' : null;
      if (!tipo) return null;
      const codigo = parts[parts.length - 1];
      const lojaId = parts.length >= 3 ? parts.slice(1, -1).join('-') : null;
      return { tipo, codigo, lojaId };
    }
    return null;
  }

  // Called after a successful order in checkout
  function recordAffiliateSale(order) {
    const ref = getActiveReferral();
    if (!ref) return;

    const parsed = parseRefCode(ref.code);
    if (!parsed) return;

    const affiliates = Storage.get(AFFILIATES_KEY) || [];
    const affiliate = affiliates.find(a => a.codigo === parsed.codigo && a.ativo);
    if (!affiliate) return;

    const config = Storage.get(AFFILIATE_CONFIG_KEY) || DEFAULT_CONFIG;
    const comissao = +(order.total * (affiliate.comissaoPct / 100)).toFixed(2);

    const sale = {
      id: 'ASALE-' + Date.now(),
      affiliateId: affiliate.id,
      affiliateCodigo: affiliate.codigo,
      affiliateNome: affiliate.nome,
      affiliateTipo: affiliate.tipo,
      orderNumero: order.numero,
      orderTotal: order.total,
      comissao,
      comissaoPct: affiliate.comissaoPct,
      data: new Date().toISOString(),
      status: 'pendente', // pendente | pago
    };

    const sales = Storage.get(AFFILIATE_SALES_KEY) || [];
    sales.push(sale);
    Storage.set(AFFILIATE_SALES_KEY, sales);

    // Update affiliate totals
    affiliate.totalVendas += order.total;
    affiliate.totalComissao += comissao;
    affiliate.totalPedidos += 1;
    Storage.set(AFFILIATES_KEY, affiliates);

    // Award points to employee
    if (affiliate.tipo === 'funcionario' && affiliate.empId) {
      if (typeof AdminMetas !== 'undefined' && AdminMetas.addPoints) {
        AdminMetas.addPoints(affiliate.empId, config.pontosPorVendaAfiliado || 15, 'indicacao',
          `Venda via link: Pedido #${order.numero} (R$${order.total.toFixed(2)})`);
      }
    }

    // Clear referral after conversion
    Storage.remove('affiliate_ref');
  }

  /* ------------------------------------------
     RENDER — MAIN (Admin view)
  ------------------------------------------ */
  function render(storeFilter) {
    loadConfig();
    loadAffiliates();
    loadSales();

    const c = document.getElementById('afiliados-content');
    if (!c) return;

    const user = AppState.get('user');
    const isAdmin = user && (user.cargo === 'dono' || user.cargo === 'gerente');

    // If employee, show their own affiliate dashboard
    if (!isAdmin) {
      const myAffiliate = _affiliates.find(a => a.empId === user.id);
      if (myAffiliate) {
        renderAffiliateDashboard(c, myAffiliate);
      } else {
        c.innerHTML = `
          <div style="text-align:center;padding:60px 20px;">
            <div style="font-size:48px;margin-bottom:12px;">🔗</div>
            <h2 style="color:#1B4332;margin-bottom:8px;">Link de Indicação</h2>
            <p style="color:#666;">Peça ao administrador para ativar seu link de indicação.</p>
          </div>
        `;
      }
      return;
    }

    // Admin view
    const totalAfiliados = _affiliates.filter(a => a.ativo).length;
    const totalVendas = _sales.reduce((s, v) => s + v.orderTotal, 0);
    const totalComissao = _sales.reduce((s, v) => s + v.comissao, 0);
    const pendingComissao = _sales.filter(s => s.status === 'pendente').reduce((s, v) => s + v.comissao, 0);

    c.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:24px;">
        <div>
          <h2 style="margin:0;color:#1B4332;">🔗 Afiliados & Indicações</h2>
          <p style="margin:4px 0 0;color:#666;font-size:14px;">Links de funcionários e influenciadores</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn--sm ${_currentView === 'list' ? 'btn--primary' : 'btn--ghost'}" onclick="AdminAfiliados.setView('list')">
            📋 Afiliados
          </button>
          <button class="btn btn--sm ${_currentView === 'sales' ? 'btn--primary' : 'btn--ghost'}" onclick="AdminAfiliados.setView('sales')">
            💰 Vendas
          </button>
          <button class="btn btn--sm ${_currentView === 'config' ? 'btn--primary' : 'btn--ghost'}" onclick="AdminAfiliados.setView('config')">
            ⚙️ Configurar
          </button>
        </div>
      </div>

      <!-- Stats -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px;">
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;text-align:center;">
          <div style="font-size:28px;font-weight:800;color:#1B4332;">${totalAfiliados}</div>
          <div style="font-size:12px;color:#666;">Afiliados ativos</div>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;text-align:center;">
          <div style="font-size:28px;font-weight:800;color:#1B4332;">${_sales.length}</div>
          <div style="font-size:12px;color:#666;">Vendas indicadas</div>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;text-align:center;">
          <div style="font-size:28px;font-weight:800;color:#1B4332;">R$${totalVendas.toFixed(2)}</div>
          <div style="font-size:12px;color:#666;">Total vendido</div>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;text-align:center;">
          <div style="font-size:28px;font-weight:800;color:#F59E0B;">R$${pendingComissao.toFixed(2)}</div>
          <div style="font-size:12px;color:#666;">Comissão pendente</div>
        </div>
      </div>

      <div id="afiliados-view-container"></div>
    `;

    const viewContainer = document.getElementById('afiliados-view-container');
    switch (_currentView) {
      case 'list': renderAffiliatesList(viewContainer); break;
      case 'sales': renderSalesList(viewContainer); break;
      case 'config': renderConfigView(viewContainer); break;
      case 'detail': renderAffiliateDashboard(viewContainer, _selectedAffiliate); break;
    }
  }

  /* ------------------------------------------
     RENDER — AFFILIATES LIST
  ------------------------------------------ */
  function renderAffiliatesList(el) {
    const funcionarios = _affiliates.filter(a => a.tipo === 'funcionario');
    const influencers = _affiliates.filter(a => a.tipo === 'influencer');

    let html = `
      <div style="display:flex;gap:8px;margin-bottom:16px;">
        <button class="btn btn--sm btn--primary" onclick="AdminAfiliados.showAddAffiliateModal('funcionario')">
          + Funcionário
        </button>
        <button class="btn btn--sm btn--ghost" onclick="AdminAfiliados.showAddAffiliateModal('influencer')">
          + Influencer
        </button>
      </div>
    `;

    if (_affiliates.length === 0) {
      html += '<p style="text-align:center;color:#999;padding:40px;">Nenhum afiliado cadastrado. Adicione funcionários ou influencers.</p>';
      el.innerHTML = html;
      return;
    }

    // Funcionarios section
    if (funcionarios.length > 0) {
      html += '<h3 style="font-size:15px;color:#1B4332;margin-bottom:12px;">👥 Funcionários</h3>';
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;margin-bottom:20px;">';
      funcionarios.forEach(a => { html += renderAffiliateCard(a); });
      html += '</div>';
    }

    // Influencers section
    if (influencers.length > 0) {
      html += '<h3 style="font-size:15px;color:#1B4332;margin-bottom:12px;">📢 Influencers</h3>';
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;margin-bottom:20px;">';
      influencers.forEach(a => { html += renderAffiliateCard(a); });
      html += '</div>';
    }

    el.innerHTML = html;
  }

  function renderAffiliateCard(a) {
    const link = getGeneralLink(a);
    const mySales = _sales.filter(s => s.affiliateId === a.id);
    const monthSales = mySales.filter(s => {
      const d = new Date(s.data);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const monthTotal = monthSales.reduce((sum, s) => sum + s.orderTotal, 0);

    return `
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;cursor:pointer;" onclick="AdminAfiliados.viewDetail('${a.id}')">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
          <div style="width:40px;height:40px;border-radius:50%;background:${a.tipo === 'influencer' ? '#7C3AED' : '#2D6A4F'};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;">
            ${a.nome.charAt(0).toUpperCase()}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;color:#1B4332;font-size:14px;">${a.nome}</div>
            <div style="font-size:12px;color:#666;">${a.tipo === 'influencer' ? 'Influencer' : 'Funcionário'} · ${a.codigo}</div>
          </div>
          <span style="font-size:11px;padding:2px 8px;border-radius:10px;background:${a.ativo ? '#10B98122' : '#EF444422'};color:${a.ativo ? '#10B981' : '#EF4444'};font-weight:600;">
            ${a.ativo ? 'Ativo' : 'Inativo'}
          </span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px;">
          <div style="text-align:center;">
            <div style="font-weight:700;color:#1B4332;">${a.totalPedidos}</div>
            <div style="font-size:10px;color:#999;">Vendas</div>
          </div>
          <div style="text-align:center;">
            <div style="font-weight:700;color:#1B4332;">R$${monthTotal.toFixed(0)}</div>
            <div style="font-size:10px;color:#999;">Este mês</div>
          </div>
          <div style="text-align:center;">
            <div style="font-weight:700;color:#F59E0B;">R$${a.totalComissao.toFixed(2)}</div>
            <div style="font-size:10px;color:#999;">Comissão</div>
          </div>
        </div>
        <div style="background:#f9fafb;border-radius:8px;padding:6px 8px;font-size:11px;color:#666;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          🔗 ${link}
        </div>
      </div>
    `;
  }

  /* ------------------------------------------
     RENDER — AFFILIATE DASHBOARD (employee/influencer view)
  ------------------------------------------ */
  function renderAffiliateDashboard(el, affiliate) {
    if (typeof affiliate === 'string') {
      affiliate = _affiliates.find(a => a.id === affiliate);
    }
    if (!affiliate) {
      el.innerHTML = '<p style="color:#999;text-align:center;padding:40px;">Afiliado não encontrado.</p>';
      return;
    }

    const user = AppState.get('user');
    const isAdmin = user && (user.cargo === 'dono' || user.cargo === 'gerente');
    const generalLink = getGeneralLink(affiliate);
    const mySales = _sales.filter(s => s.affiliateId === affiliate.id);
    const pendingComissao = mySales.filter(s => s.status === 'pendente').reduce((sum, s) => sum + s.comissao, 0);

    // Get some products for product-specific links
    const products = typeof DataProducts !== 'undefined' ? DataProducts.filter(p => p.ativo).slice(0, 8) : [];

    let html = `
      ${isAdmin ? `<button class="btn btn--sm btn--ghost" onclick="AdminAfiliados.setView('list')" style="margin-bottom:16px;">← Voltar</button>` : ''}

      <div style="background:linear-gradient(135deg,${affiliate.tipo === 'influencer' ? '#5B21B6,#7C3AED' : '#1B4332,#2D6A4F'});color:#fff;border-radius:16px;padding:24px;margin-bottom:20px;">
        <div style="font-size:24px;font-weight:800;margin-bottom:4px;">${affiliate.nome}</div>
        <div style="font-size:14px;opacity:0.8;">${affiliate.tipo === 'influencer' ? 'Influencer' : 'Funcionário'} · Código: ${affiliate.codigo}</div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-top:16px;">
          <div style="background:rgba(255,255,255,0.15);border-radius:10px;padding:12px;text-align:center;">
            <div style="font-size:28px;font-weight:800;">${affiliate.totalPedidos}</div>
            <div style="font-size:12px;opacity:0.8;">Vendas</div>
          </div>
          <div style="background:rgba(255,255,255,0.15);border-radius:10px;padding:12px;text-align:center;">
            <div style="font-size:28px;font-weight:800;">R$${affiliate.totalVendas.toFixed(0)}</div>
            <div style="font-size:12px;opacity:0.8;">Total Vendido</div>
          </div>
          <div style="background:rgba(255,255,255,0.15);border-radius:10px;padding:12px;text-align:center;">
            <div style="font-size:28px;font-weight:800;">R$${affiliate.totalComissao.toFixed(2)}</div>
            <div style="font-size:12px;opacity:0.8;">Comissão Total</div>
          </div>
          <div style="background:rgba(255,255,255,0.15);border-radius:10px;padding:12px;text-align:center;">
            <div style="font-size:28px;font-weight:800;color:#F59E0B;">R$${pendingComissao.toFixed(2)}</div>
            <div style="font-size:12px;opacity:0.8;">Pendente</div>
          </div>
        </div>
      </div>

      <!-- General Link -->
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:20px;">
        <h3 style="margin:0 0 12px;font-size:15px;color:#1B4332;">🔗 Seu Link Geral</h3>
        <div style="display:flex;gap:8px;align-items:center;">
          <input type="text" value="${generalLink}" readonly id="afl-general-link"
            style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:13px;background:#f9fafb;">
          <button class="btn btn--sm btn--primary" onclick="AdminAfiliados.copyLink('afl-general-link')">📋 Copiar</button>
        </div>
        <p style="font-size:12px;color:#666;margin:8px 0 0;">Compartilhe este link. Qualquer compra feita por ele será vinculada a você!</p>
      </div>

      <!-- Product-specific Links -->
      ${products.length > 0 ? `
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:20px;">
          <h3 style="margin:0 0 12px;font-size:15px;color:#1B4332;">📦 Links por Produto</h3>
          <p style="font-size:12px;color:#666;margin-bottom:12px;">Divulgue um produto específico com seu link:</p>
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${products.map(p => {
              const pLink = getProductLink(affiliate, p.id);
              return `
                <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;background:#f9fafb;">
                  <span style="font-size:13px;flex:1;color:#333;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.nome}</span>
                  <button class="btn btn--sm btn--ghost" style="font-size:11px;white-space:nowrap;" onclick="navigator.clipboard.writeText('${pLink}'); Toast.success('Link copiado!')">📋 Copiar</button>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Sales History -->
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">
        <h3 style="margin:0 0 12px;font-size:15px;color:#1B4332;">💰 Histórico de Vendas</h3>
        ${mySales.length === 0 ? '<p style="color:#999;font-size:14px;">Nenhuma venda registrada ainda. Compartilhe seu link!</p>' : ''}
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${mySales.slice(-15).reverse().map(s => {
            const date = new Date(s.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
            const isPaid = s.status === 'pago';
            return `
              <div style="display:flex;align-items:center;gap:8px;padding:8px;border-radius:8px;background:#f9fafb;">
                <span style="font-size:13px;color:#1B4332;font-weight:600;">Pedido #${s.orderNumero}</span>
                <span style="flex:1;font-size:13px;color:#666;">R$${s.orderTotal.toFixed(2)}</span>
                <span style="font-size:12px;color:#10B981;font-weight:600;">+R$${s.comissao.toFixed(2)}</span>
                <span style="font-size:12px;color:#999;">${date}</span>
                <span style="font-size:11px;padding:2px 8px;border-radius:10px;background:${isPaid ? '#10B98122' : '#F59E0B22'};color:${isPaid ? '#10B981' : '#F59E0B'};font-weight:600;">
                  ${isPaid ? 'Pago' : 'Pendente'}
                </span>
                ${isAdmin && !isPaid ? `<button class="btn btn--sm btn--ghost" style="font-size:11px;" onclick="AdminAfiliados.markPaid('${s.id}')">Pagar</button>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    el.innerHTML = html;
  }

  /* ------------------------------------------
     RENDER — SALES LIST (Admin)
  ------------------------------------------ */
  function renderSalesList(el) {
    const sorted = [..._sales].sort((a, b) => new Date(b.data) - new Date(a.data));

    let html = '<div style="display:flex;flex-direction:column;gap:8px;">';

    if (sorted.length === 0) {
      html += '<p style="text-align:center;color:#999;padding:40px;">Nenhuma venda via afiliado registrada.</p>';
    }

    sorted.forEach(s => {
      const date = new Date(s.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const isPaid = s.status === 'pago';
      html += `
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:12px 16px;">
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
            <div style="flex:1;min-width:150px;">
              <div style="font-weight:600;color:#1B4332;">${s.affiliateNome}</div>
              <div style="font-size:12px;color:#666;">${s.affiliateTipo === 'influencer' ? 'Influencer' : 'Funcionário'} · ${s.affiliateCodigo}</div>
            </div>
            <div style="text-align:center;">
              <div style="font-weight:600;">Pedido #${s.orderNumero}</div>
              <div style="font-size:12px;color:#999;">${date}</div>
            </div>
            <div style="text-align:center;">
              <div style="font-weight:700;color:#1B4332;">R$${s.orderTotal.toFixed(2)}</div>
              <div style="font-size:11px;color:#666;">Venda</div>
            </div>
            <div style="text-align:center;">
              <div style="font-weight:700;color:#10B981;">R$${s.comissao.toFixed(2)}</div>
              <div style="font-size:11px;color:#666;">Comissão (${s.comissaoPct}%)</div>
            </div>
            <span style="font-size:11px;padding:4px 10px;border-radius:10px;background:${isPaid ? '#10B98122' : '#F59E0B22'};color:${isPaid ? '#10B981' : '#F59E0B'};font-weight:600;">
              ${isPaid ? 'Pago' : 'Pendente'}
            </span>
            ${!isPaid ? `<button class="btn btn--sm btn--ghost" onclick="AdminAfiliados.markPaid('${s.id}')">Pagar</button>` : ''}
          </div>
        </div>
      `;
    });

    html += '</div>';
    el.innerHTML = html;
  }

  /* ------------------------------------------
     RENDER — CONFIG
  ------------------------------------------ */
  function renderConfigView(el) {
    el.innerHTML = `
      <form id="afiliados-config-form" style="max-width:500px;">
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:16px;">
          <h3 style="margin:0 0 16px;font-size:16px;color:#1B4332;">⚙️ Configuração de Afiliados</h3>
          <div style="display:grid;grid-template-columns:1fr 80px;gap:8px;align-items:center;">
            <label style="font-size:14px;">Comissão funcionário (%):</label>
            <input type="number" name="comissaoFuncionarioPct" value="${_config.comissaoFuncionarioPct}" min="0" max="50" step="0.5"
              style="padding:8px;border:1px solid #ddd;border-radius:8px;text-align:center;">

            <label style="font-size:14px;">Comissão influencer (%):</label>
            <input type="number" name="comissaoInfluencerPct" value="${_config.comissaoInfluencerPct}" min="0" max="50" step="0.5"
              style="padding:8px;border:1px solid #ddd;border-radius:8px;text-align:center;">

            <label style="font-size:14px;">Pontos por venda (func.):</label>
            <input type="number" name="pontosPorVendaAfiliado" value="${_config.pontosPorVendaAfiliado}" min="0"
              style="padding:8px;border:1px solid #ddd;border-radius:8px;text-align:center;">

            <label style="font-size:14px;">Duração do cookie (dias):</label>
            <input type="number" name="cookieDays" value="${_config.cookieDays}" min="1" max="365"
              style="padding:8px;border:1px solid #ddd;border-radius:8px;text-align:center;">
          </div>
        </div>
        <button type="submit" class="btn btn--primary btn--lg" style="width:100%;">💾 Salvar</button>
      </form>
    `;

    document.getElementById('afiliados-config-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.target;
      _config.comissaoFuncionarioPct = parseFloat(form.comissaoFuncionarioPct.value) || 3;
      _config.comissaoInfluencerPct = parseFloat(form.comissaoInfluencerPct.value) || 5;
      _config.pontosPorVendaAfiliado = parseInt(form.pontosPorVendaAfiliado.value) || 15;
      _config.cookieDays = parseInt(form.cookieDays.value) || 30;
      saveConfig();
      Toast.success('Configurações de afiliados salvas!');
    });
  }

  /* ------------------------------------------
     MODALS
  ------------------------------------------ */
  function showAddAffiliateModal(tipo) {
    // Get employees list for funcionario type
    const employees = typeof DataEmployees !== 'undefined' ? DataEmployees.filter(e => e.ativo) : [];
    const storedEmps = Storage.get('employees');
    const empList = (storedEmps && storedEmps.length > 0) ? storedEmps.filter(e => e.ativo !== false) : employees;
    const stores = typeof DataStores !== 'undefined' ? DataStores : [];

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:24px;max-width:460px;width:100%;max-height:90vh;overflow-y:auto;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
          <h3 style="margin:0;color:#1B4332;">${tipo === 'influencer' ? '📢 Novo Influencer' : '👤 Novo Afiliado Funcionário'}</h3>
          <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:24px;cursor:pointer;color:#999;">✕</button>
        </div>
        <form id="add-affiliate-form">
          ${tipo === 'funcionario' ? `
            <div style="margin-bottom:12px;">
              <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Funcionário *</label>
              <select name="empId" required style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;" onchange="document.querySelector('[name=nome]').value=this.options[this.selectedIndex].text.split(' (')[0]">
                <option value="">Selecione...</option>
                ${empList.map(e => `<option value="${e.id}">${e.nome} (${e.loja || '—'})</option>`).join('')}
              </select>
            </div>
            <div style="margin-bottom:12px;">
              <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Loja</label>
              <select name="lojaId" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;">
                ${stores.map(s => `<option value="${s.id}">${s.nome}</option>`).join('')}
              </select>
            </div>
          ` : ''}
          <div style="margin-bottom:12px;">
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Nome *</label>
            <input type="text" name="nome" required placeholder="Nome completo" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;box-sizing:border-box;">
          </div>
          <div style="margin-bottom:12px;">
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Código (slug do link)</label>
            <input type="text" name="codigo" placeholder="Auto-gerado se vazio" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;box-sizing:border-box;">
            <p style="font-size:11px;color:#999;margin:4px 0 0;">Ex: "leticia" gera link ...?ref=${tipo === 'funcionario' ? 'f-cafezal-leticia' : 'i-leticia'}</p>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
            <div>
              <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Email</label>
              <input type="email" name="email" placeholder="email@..." style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;box-sizing:border-box;">
            </div>
            <div>
              <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Instagram</label>
              <input type="text" name="instagram" placeholder="@usuario" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;box-sizing:border-box;">
            </div>
          </div>
          <div style="margin-bottom:16px;">
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Comissão (%)</label>
            <input type="number" name="comissaoPct" value="${tipo === 'influencer' ? _config.comissaoInfluencerPct : _config.comissaoFuncionarioPct}" min="0" max="50" step="0.5"
              style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;box-sizing:border-box;">
          </div>
          <input type="hidden" name="tipo" value="${tipo}">
          <button type="submit" class="btn btn--primary" style="width:100%;">Criar Afiliado</button>
        </form>
      </div>
    `;

    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    document.getElementById('add-affiliate-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      const nome = f.nome.value.trim();
      if (!nome) { Toast.error('Nome obrigatório'); return; }

      createAffiliate({
        tipo: f.tipo.value,
        nome,
        codigo: f.codigo.value.trim().toLowerCase().replace(/[^a-z0-9]/g, '') || undefined,
        empId: f.empId ? f.empId.value : null,
        lojaId: f.lojaId ? f.lojaId.value : null,
        email: f.email.value.trim(),
        instagram: f.instagram.value.trim(),
        comissaoPct: parseFloat(f.comissaoPct.value) || 0,
      });

      Toast.success('Afiliado criado com sucesso!');
      modal.remove();
      render();
    });
  }

  /* ------------------------------------------
     ACTIONS
  ------------------------------------------ */
  function markPaid(saleId) {
    const sale = _sales.find(s => s.id === saleId);
    if (!sale) return;
    sale.status = 'pago';
    sale.paidAt = new Date().toISOString();
    sale.paidBy = AppState.get('user')?.nome || 'Admin';
    saveSales();
    if (typeof FirestoreService !== 'undefined') {
      try { FirestoreService.Afiliados.save(sale); } catch(e) {}
    }
    Toast.success('Comissão marcada como paga!');
    render();
  }

  function setView(view) {
    _currentView = view;
    render();
  }

  function viewDetail(affiliateId) {
    _selectedAffiliate = affiliateId;
    _currentView = 'detail';
    render();
  }

  function copyLink(inputId) {
    const input = document.getElementById(inputId);
    if (input) {
      navigator.clipboard.writeText(input.value)
        .then(() => Toast.success('Link copiado!'))
        .catch(() => {
          input.select();
          document.execCommand('copy');
          Toast.success('Link copiado!');
        });
    }
  }

  function toggleActive(affiliateId) {
    const a = _affiliates.find(af => af.id === affiliateId);
    if (a) {
      a.ativo = !a.ativo;
      saveAffiliates();
      if (typeof FirestoreService !== 'undefined') {
        try { FirestoreService.Afiliados.save(a); } catch(e) {}
      }
      render();
    }
  }

  /* ------------------------------------------
     PUBLIC API
  ------------------------------------------ */
  return {
    render,
    setView,
    viewDetail,
    copyLink,
    markPaid,
    toggleActive,
    showAddAffiliateModal,

    // Public page helpers
    detectReferral,
    getActiveReferral,
    recordAffiliateSale,
    getAffiliateByCode,
    getAffiliateByEmpId,
  };
})();
