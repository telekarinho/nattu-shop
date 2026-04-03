/* ============================================
   CLUBE DO NATURAL — Metas & Gamificação
   Sistema de pontos para funcionários com:
   - Pontos por vendas (automático via sistema)
   - Pontos por conteúdo (foto/vídeo com prova)
   - Pontos por avaliações Google (screenshot)
   - Dashboard do funcionário com ranking
   - Admin configura regras e aprova provas
   ============================================ */

const AdminMetas = (() => {
  'use strict';

  const container = () => document.getElementById('metas-content');

  // Defaults
  const DEFAULT_CONFIG = {
    pontosPorRealVendido: 1,        // 1 ponto por R$1 vendido
    pontosPorVenda: 5,              // 5 pontos por pedido completado
    pontosPorFotoSite: 15,          // 15 pontos por foto publicada no site
    pontosPorVideoSite: 25,         // 25 pontos por vídeo publicado no site
    pontosPorPostInstagram: 20,     // 20 pontos por post no Instagram
    pontosPorReelsInstagram: 30,    // 30 pontos por Reels no Instagram
    pontosPorVideoTikTok: 30,       // 30 pontos por vídeo no TikTok
    pontosPorAvaliacaoGoogle: 40,   // 40 pontos por avaliação no Google
    pontosPorIndicacaoCliente: 10,  // 10 pontos por indicação
    metaMensal: 500,                // meta mensal de pontos
    premios: [
      { pontos: 100, nome: 'Vale Lanche R$20', icone: '🍔' },
      { pontos: 300, nome: 'Day Off Extra', icone: '🏖️' },
      { pontos: 500, nome: 'Bônus R$100', icone: '💰' },
      { pontos: 1000, nome: 'Bônus R$300', icone: '🏆' },
    ],
    badges: [
      { id: 'primeira_venda', nome: 'Primeira Venda', icone: '⭐', condicao: 'vendas >= 1' },
      { id: 'vendedor_10', nome: '10 Vendas', icone: '🔥', condicao: 'vendas >= 10' },
      { id: 'vendedor_50', nome: '50 Vendas', icone: '💎', condicao: 'vendas >= 50' },
      { id: 'influencer', nome: 'Influencer', icone: '📸', condicao: 'posts >= 5' },
      { id: 'review_hunter', nome: 'Caçador de Reviews', icone: '⭐', condicao: 'reviews >= 5' },
      { id: 'meta_batida', nome: 'Meta Batida!', icone: '🏆', condicao: 'pontosMes >= metaMensal' },
      { id: 'top1', nome: 'Top 1 do Mês', icone: '👑', condicao: 'ranking === 1' },
    ],
  };

  // Proof types
  const PROOF_TYPES = {
    foto_site: { label: 'Foto no Site', icon: '📸', needsLink: true, needsImage: true },
    video_site: { label: 'Vídeo no Site', icon: '🎬', needsLink: true, needsImage: false },
    post_instagram: { label: 'Post Instagram', icon: '📷', needsLink: true, needsImage: true },
    reels_instagram: { label: 'Reels Instagram', icon: '🎞️', needsLink: true, needsImage: true },
    video_tiktok: { label: 'Vídeo TikTok', icon: '🎵', needsLink: true, needsImage: true },
    avaliacao_google: { label: 'Avaliação Google', icon: '⭐', needsLink: false, needsImage: true },
    indicacao_cliente: { label: 'Indicação de Cliente', icon: '🤝', needsLink: false, needsImage: false },
    outro: { label: 'Outro', icon: '📋', needsLink: false, needsImage: false },
  };

  const STATUS_LABELS = {
    pendente: { label: 'Pendente', color: '#F59E0B', icon: '⏳' },
    aprovado: { label: 'Aprovado', color: '#10B981', icon: '✅' },
    rejeitado: { label: 'Rejeitado', color: '#EF4444', icon: '❌' },
  };

  let _config = null;
  let _proofs = [];
  let _points = {};   // { empId: { total, vendas, conteudo, reviews, badges[] } }
  let _employees = [];
  let _currentView = 'dashboard'; // dashboard | proofs | config | employee
  let _selectedEmployee = null;
  let _filterStatus = 'all';

  /* ------------------------------------------
     DATA LOADING
  ------------------------------------------ */
  function loadConfig() {
    _config = Storage.get('metas_config') || { ...DEFAULT_CONFIG };
    // Sync from Firestore
    if (typeof FirestoreService !== 'undefined') {
      try {
        FirestoreService.init();
        FirestoreService.Metas.getConfig().then(cfg => {
          if (cfg) { _config = { ...DEFAULT_CONFIG, ...cfg }; Storage.set('metas_config', _config); }
        }).catch(() => {});
      } catch(e) {}
    }
    return _config;
  }

  function saveConfig(config) {
    _config = config;
    Storage.set('metas_config', config);
    if (typeof FirestoreService !== 'undefined') {
      try { FirestoreService.Metas.saveConfig(_config); } catch(e) {}
    }
  }

  function loadProofs() {
    _proofs = Storage.get('metas_provas') || [];
    return _proofs;
  }

  function saveProofs() {
    Storage.set('metas_provas', _proofs);
  }

  function loadPoints() {
    _points = Storage.get('metas_pontos') || {};
    return _points;
  }

  function savePoints() {
    Storage.set('metas_pontos', _points);
  }

  function loadEmployees() {
    if (typeof DataEmployees !== 'undefined') {
      _employees = DataEmployees.filter(e => e.ativo);
    }
    const stored = Storage.get('employees');
    if (stored && stored.length > 0) {
      _employees = stored.filter(e => e.ativo !== false);
    }
    return _employees;
  }

  function getEmployeeName(empId) {
    const emp = _employees.find(e => e.id === empId);
    return emp ? emp.nome : empId;
  }

  function getEmployeeStore(empId) {
    const emp = _employees.find(e => e.id === empId);
    return emp ? emp.loja : '—';
  }

  function getEmployeePhoto(empId) {
    const emp = _employees.find(e => e.id === empId);
    return emp && emp.foto ? emp.foto : null;
  }

  /* ------------------------------------------
     POINTS CALCULATION
  ------------------------------------------ */
  function getEmployeePoints(empId) {
    if (!_points[empId]) {
      _points[empId] = { total: 0, vendas: 0, conteudo: 0, reviews: 0, indicacoes: 0, badges: [], historico: [] };
    }
    return _points[empId];
  }

  function addPoints(empId, amount, tipo, descricao) {
    const pts = getEmployeePoints(empId);
    pts.total += amount;
    if (tipo === 'venda') pts.vendas += amount;
    else if (tipo === 'review') pts.reviews += amount;
    else if (tipo === 'indicacao') pts.indicacoes += amount;
    else pts.conteudo += amount;

    pts.historico.push({
      data: new Date().toISOString(),
      pontos: amount,
      tipo,
      descricao,
    });

    // Check badges
    checkBadges(empId);
    savePoints();
    if (typeof FirestoreService !== 'undefined') {
      try { FirestoreService.Metas.savePoints(empId, _points[empId]); } catch(e) {}
    }
  }

  function checkBadges(empId) {
    const pts = getEmployeePoints(empId);
    const approvedProofs = _proofs.filter(p => p.empId === empId && p.status === 'aprovado');
    const vendas = pts.historico.filter(h => h.tipo === 'venda').length;
    const posts = approvedProofs.filter(p =>
      ['foto_site', 'video_site', 'post_instagram', 'reels_instagram', 'video_tiktok'].includes(p.tipo)
    ).length;
    const reviews = approvedProofs.filter(p => p.tipo === 'avaliacao_google').length;
    const pontosMes = getMonthlyPoints(empId);
    const ranking = getRanking().findIndex(r => r.empId === empId) + 1;
    const metaMensal = _config.metaMensal;

    _config.badges.forEach(badge => {
      if (pts.badges.includes(badge.id)) return;
      try {
        // Safe eval of condition
        const check = new Function('vendas', 'posts', 'reviews', 'pontosMes', 'ranking', 'metaMensal',
          `return ${badge.condicao};`);
        if (check(vendas, posts, reviews, pontosMes, ranking, metaMensal)) {
          pts.badges.push(badge.id);
        }
      } catch (e) { /* skip bad condition */ }
    });
  }

  function getMonthlyPoints(empId) {
    const pts = getEmployeePoints(empId);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    return pts.historico
      .filter(h => h.data >= monthStart)
      .reduce((sum, h) => sum + h.pontos, 0);
  }

  function getRanking() {
    const ranking = _employees.map(emp => {
      const pts = getEmployeePoints(emp.id);
      return {
        empId: emp.id,
        nome: emp.nome,
        loja: emp.loja,
        foto: emp.foto,
        cargo: emp.cargo,
        totalMes: getMonthlyPoints(emp.id),
        totalGeral: pts.total,
        badges: pts.badges,
      };
    });
    ranking.sort((a, b) => b.totalMes - a.totalMes);
    return ranking;
  }

  /* ------------------------------------------
     PROOFS (COMPROVANTES)
  ------------------------------------------ */
  function submitProof(proof) {
    proof.id = 'PRF-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4);
    proof.status = 'pendente';
    proof.createdAt = new Date().toISOString();
    _proofs.unshift(proof);
    saveProofs();
    if (typeof FirestoreService !== 'undefined') {
      try { FirestoreService.Metas.addProof(proof); } catch(e) {}
    }
    Toast.success('Comprovante enviado! Aguardando aprovação.');
  }

  function approveProof(proofId) {
    const proof = _proofs.find(p => p.id === proofId);
    if (!proof || proof.status !== 'pendente') return;

    proof.status = 'aprovado';
    proof.reviewedAt = new Date().toISOString();
    proof.reviewedBy = AppState.get('user')?.nome || 'Admin';

    // Calculate points based on type
    const pointsMap = {
      foto_site: _config.pontosPorFotoSite,
      video_site: _config.pontosPorVideoSite,
      post_instagram: _config.pontosPorPostInstagram,
      reels_instagram: _config.pontosPorReelsInstagram,
      video_tiktok: _config.pontosPorVideoTikTok,
      avaliacao_google: _config.pontosPorAvaliacaoGoogle,
      indicacao_cliente: _config.pontosPorIndicacaoCliente,
    };

    const pts = pointsMap[proof.tipo] || 10;
    const tipoCategoria = proof.tipo === 'avaliacao_google' ? 'review'
      : proof.tipo === 'indicacao_cliente' ? 'indicacao' : 'conteudo';

    addPoints(proof.empId, pts, tipoCategoria, `${PROOF_TYPES[proof.tipo]?.label || proof.tipo}: ${proof.descricao}`);
    proof.pontosGanhos = pts;
    saveProofs();
    Toast.success(`Aprovado! +${pts} pontos para ${getEmployeeName(proof.empId)}`);
  }

  function rejectProof(proofId, motivo) {
    const proof = _proofs.find(p => p.id === proofId);
    if (!proof || proof.status !== 'pendente') return;

    proof.status = 'rejeitado';
    proof.motivo = motivo || 'Não atende aos critérios';
    proof.reviewedAt = new Date().toISOString();
    proof.reviewedBy = AppState.get('user')?.nome || 'Admin';
    saveProofs();
    Toast.warning('Comprovante rejeitado.');
  }

  /* ------------------------------------------
     RENDER — MAIN
  ------------------------------------------ */
  function render(storeFilter) {
    loadConfig();
    loadProofs();
    loadPoints();
    loadEmployees();

    const c = container();
    if (!c) return;

    const user = AppState.get('user');
    const isAdmin = user && (user.cargo === 'dono' || user.cargo === 'gerente');
    const isEmployee = user && !isAdmin;

    // If employee, show their own dashboard
    if (isEmployee) {
      _selectedEmployee = user.id;
      renderEmployeeView(c, user.id);
      return;
    }

    // Admin view
    const pendingCount = _proofs.filter(p => p.status === 'pendente').length;

    c.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:24px;">
        <div>
          <h2 style="margin:0;color:#1B4332;">🏆 Metas & Gamificação</h2>
          <p style="margin:4px 0 0;color:#666;font-size:14px;">Sistema de pontos e recompensas para funcionários</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn--sm ${_currentView === 'dashboard' ? 'btn--primary' : 'btn--ghost'}" onclick="AdminMetas.setView('dashboard')">
            📊 Ranking
          </button>
          <button class="btn btn--sm ${_currentView === 'proofs' ? 'btn--primary' : 'btn--ghost'}" onclick="AdminMetas.setView('proofs')" style="position:relative;">
            📋 Comprovantes
            ${pendingCount > 0 ? `<span style="position:absolute;top:-6px;right:-6px;background:#EF4444;color:#fff;font-size:10px;padding:2px 6px;border-radius:10px;">${pendingCount}</span>` : ''}
          </button>
          <button class="btn btn--sm ${_currentView === 'config' ? 'btn--primary' : 'btn--ghost'}" onclick="AdminMetas.setView('config')">
            ⚙️ Configurar
          </button>
        </div>
      </div>

      <div id="metas-view-container"></div>
    `;

    const viewContainer = document.getElementById('metas-view-container');

    switch (_currentView) {
      case 'dashboard': renderRankingView(viewContainer); break;
      case 'proofs': renderProofsView(viewContainer); break;
      case 'config': renderConfigView(viewContainer); break;
      case 'employee': renderEmployeeView(viewContainer, _selectedEmployee); break;
    }
  }

  /* ------------------------------------------
     RENDER — RANKING / LEADERBOARD
  ------------------------------------------ */
  function renderRankingView(el) {
    const ranking = getRanking();
    const now = new Date();
    const mesLabel = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    let html = `
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px;margin-bottom:20px;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <div>
            <span style="font-size:18px;font-weight:700;color:#1B4332;">🏅 Ranking — ${mesLabel}</span>
            <span style="display:block;font-size:13px;color:#666;margin-top:2px;">Meta mensal: ${_config.metaMensal} pontos</span>
          </div>
          <button class="btn btn--sm btn--ghost" onclick="AdminMetas.showAddPointsModal()">
            ➕ Adicionar Pontos Manual
          </button>
        </div>
      </div>
    `;

    if (ranking.length === 0) {
      html += '<p style="text-align:center;color:#999;padding:40px;">Nenhum funcionário cadastrado.</p>';
      el.innerHTML = html;
      return;
    }

    // Top 3 podium
    if (ranking.length >= 1) {
      html += '<div style="display:flex;justify-content:center;gap:16px;margin-bottom:24px;flex-wrap:wrap;">';
      const podiumOrder = ranking.length >= 3 ? [ranking[1], ranking[0], ranking[2]] : ranking.slice(0, 3);
      const podiumLabels = ranking.length >= 3 ? ['🥈 2º', '🥇 1º', '🥉 3º'] : ['🥇 1º', '🥈 2º', '🥉 3º'];
      const podiumHeights = ranking.length >= 3 ? ['120px', '160px', '100px'] : ['160px', '120px', '100px'];

      podiumOrder.forEach((r, i) => {
        if (!r) return;
        const pct = _config.metaMensal > 0 ? Math.min(100, Math.round((r.totalMes / _config.metaMensal) * 100)) : 0;
        html += `
          <div style="text-align:center;cursor:pointer;" onclick="AdminMetas.viewEmployee('${r.empId}')">
            <div style="background:linear-gradient(135deg,#1B4332,#2D6A4F);color:#fff;border-radius:16px;padding:16px;min-width:140px;height:${podiumHeights[i]};display:flex;flex-direction:column;justify-content:flex-end;align-items:center;">
              <div style="font-size:28px;margin-bottom:4px;">
                ${r.foto ? `<img src="${r.foto}" style="width:48px;height:48px;border-radius:50%;border:3px solid #fff;">` : podiumLabels[i]}
              </div>
              <div style="font-weight:700;font-size:14px;margin-bottom:2px;">${r.nome.split(' ')[0]}</div>
              <div style="font-size:24px;font-weight:800;">${r.totalMes}</div>
              <div style="font-size:11px;opacity:0.8;">pontos (${pct}%)</div>
            </div>
          </div>
        `;
      });
      html += '</div>';
    }

    // Full ranking table
    html += `
      <div style="background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <thead>
            <tr style="background:#f9fafb;">
              <th style="padding:12px;text-align:left;font-weight:600;color:#374151;">#</th>
              <th style="padding:12px;text-align:left;font-weight:600;color:#374151;">Funcionário</th>
              <th style="padding:12px;text-align:center;font-weight:600;color:#374151;">Loja</th>
              <th style="padding:12px;text-align:center;font-weight:600;color:#374151;">Pts Mês</th>
              <th style="padding:12px;text-align:center;font-weight:600;color:#374151;">Meta</th>
              <th style="padding:12px;text-align:center;font-weight:600;color:#374151;">Badges</th>
              <th style="padding:12px;text-align:center;font-weight:600;color:#374151;">Total Geral</th>
              <th style="padding:12px;text-align:center;font-weight:600;color:#374151;"></th>
            </tr>
          </thead>
          <tbody>
    `;

    ranking.forEach((r, i) => {
      const pct = _config.metaMensal > 0 ? Math.min(100, Math.round((r.totalMes / _config.metaMensal) * 100)) : 0;
      const medalha = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1);
      const metaCor = pct >= 100 ? '#10B981' : pct >= 50 ? '#F59E0B' : '#EF4444';
      const badgeIcons = r.badges.map(bId => {
        const badge = _config.badges.find(b => b.id === bId);
        return badge ? `<span title="${badge.nome}">${badge.icone}</span>` : '';
      }).join('');

      html += `
        <tr style="border-top:1px solid #f3f4f6;cursor:pointer;" onclick="AdminMetas.viewEmployee('${r.empId}')">
          <td style="padding:12px;font-weight:700;font-size:16px;">${medalha}</td>
          <td style="padding:12px;">
            <div style="font-weight:600;color:#1B4332;">${r.nome}</div>
            <div style="font-size:12px;color:#999;">${r.cargo || 'atendente'}</div>
          </td>
          <td style="padding:12px;text-align:center;font-size:13px;">${r.loja || '—'}</td>
          <td style="padding:12px;text-align:center;font-weight:700;font-size:16px;color:#1B4332;">${r.totalMes}</td>
          <td style="padding:12px;text-align:center;">
            <div style="background:#e5e7eb;border-radius:6px;height:8px;width:80px;display:inline-block;overflow:hidden;">
              <div style="background:${metaCor};height:100%;width:${pct}%;border-radius:6px;transition:width 0.3s;"></div>
            </div>
            <div style="font-size:11px;color:${metaCor};font-weight:600;">${pct}%</div>
          </td>
          <td style="padding:12px;text-align:center;font-size:16px;">${badgeIcons || '—'}</td>
          <td style="padding:12px;text-align:center;font-weight:600;">${r.totalGeral}</td>
          <td style="padding:12px;text-align:center;">
            <button class="btn btn--sm btn--ghost" onclick="event.stopPropagation(); AdminMetas.viewEmployee('${r.empId}')">Ver →</button>
          </td>
        </tr>
      `;
    });

    html += '</tbody></table></div>';

    // Prizes section
    html += `
      <div style="margin-top:24px;background:#fff;border-radius:12px;border:1px solid #e5e7eb;padding:16px;">
        <h3 style="margin:0 0 12px;color:#1B4332;font-size:16px;">🎁 Prêmios Disponíveis</h3>
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          ${_config.premios.map(p => `
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:12px 16px;text-align:center;min-width:120px;">
              <div style="font-size:24px;">${p.icone}</div>
              <div style="font-weight:600;font-size:13px;color:#1B4332;margin:4px 0;">${p.nome}</div>
              <div style="font-size:12px;color:#666;">${p.pontos} pontos</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    el.innerHTML = html;
  }

  /* ------------------------------------------
     RENDER — PROOFS LIST (Admin)
  ------------------------------------------ */
  function renderProofsView(el) {
    const statusFilter = _filterStatus;
    let filtered = _proofs;
    if (statusFilter !== 'all') {
      filtered = filtered.filter(p => p.status === statusFilter);
    }

    let html = `
      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
        <button class="btn btn--sm ${statusFilter === 'all' ? 'btn--primary' : 'btn--ghost'}" onclick="AdminMetas.filterProofs('all')">
          Todos (${_proofs.length})
        </button>
        <button class="btn btn--sm ${statusFilter === 'pendente' ? 'btn--primary' : 'btn--ghost'}" onclick="AdminMetas.filterProofs('pendente')" style="position:relative;">
          ⏳ Pendentes (${_proofs.filter(p => p.status === 'pendente').length})
        </button>
        <button class="btn btn--sm ${statusFilter === 'aprovado' ? 'btn--primary' : 'btn--ghost'}" onclick="AdminMetas.filterProofs('aprovado')">
          ✅ Aprovados (${_proofs.filter(p => p.status === 'aprovado').length})
        </button>
        <button class="btn btn--sm ${statusFilter === 'rejeitado' ? 'btn--primary' : 'btn--ghost'}" onclick="AdminMetas.filterProofs('rejeitado')">
          ❌ Rejeitados (${_proofs.filter(p => p.status === 'rejeitado').length})
        </button>
      </div>
    `;

    if (filtered.length === 0) {
      html += '<p style="text-align:center;color:#999;padding:40px;">Nenhum comprovante encontrado.</p>';
      el.innerHTML = html;
      return;
    }

    html += '<div style="display:flex;flex-direction:column;gap:12px;">';

    filtered.forEach(proof => {
      const typeInfo = PROOF_TYPES[proof.tipo] || { label: proof.tipo, icon: '📋' };
      const statusInfo = STATUS_LABELS[proof.status] || STATUS_LABELS.pendente;
      const date = new Date(proof.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

      html += `
        <div style="background:#fff;border:1px solid ${proof.status === 'pendente' ? '#F59E0B' : '#e5e7eb'};border-radius:12px;padding:16px;${proof.status === 'pendente' ? 'border-width:2px;' : ''}">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
            <div style="flex:1;min-width:200px;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                <span style="font-size:20px;">${typeInfo.icon}</span>
                <span style="font-weight:700;color:#1B4332;">${typeInfo.label}</span>
                <span style="background:${statusInfo.color}22;color:${statusInfo.color};font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px;">${statusInfo.icon} ${statusInfo.label}</span>
              </div>
              <div style="font-size:13px;color:#555;margin-bottom:4px;">
                <strong>${getEmployeeName(proof.empId)}</strong> · ${getEmployeeStore(proof.empId)} · ${date}
              </div>
              <div style="font-size:14px;color:#333;margin-bottom:8px;">${proof.descricao || '—'}</div>
              ${proof.link ? `<a href="${proof.link}" target="_blank" style="font-size:13px;color:#2D6A4F;text-decoration:underline;">🔗 Ver link</a>` : ''}
              ${proof.pontosGanhos ? `<div style="font-size:13px;color:#10B981;font-weight:600;margin-top:4px;">+${proof.pontosGanhos} pontos</div>` : ''}
              ${proof.motivo ? `<div style="font-size:13px;color:#EF4444;margin-top:4px;">Motivo: ${proof.motivo}</div>` : ''}
              ${proof.reviewedBy ? `<div style="font-size:11px;color:#999;margin-top:4px;">Revisado por: ${proof.reviewedBy}</div>` : ''}
            </div>
            ${proof.imageData ? `
              <div style="flex-shrink:0;">
                <img src="${proof.imageData}" style="width:120px;height:120px;object-fit:cover;border-radius:8px;border:1px solid #e5e7eb;cursor:pointer;" onclick="window.open('${proof.imageData}', '_blank')">
              </div>
            ` : ''}
          </div>
          ${proof.status === 'pendente' ? `
            <div style="display:flex;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid #f3f4f6;">
              <button class="btn btn--sm btn--primary" onclick="AdminMetas.approve('${proof.id}')">✅ Aprovar</button>
              <button class="btn btn--sm btn--ghost" onclick="AdminMetas.showRejectModal('${proof.id}')" style="color:#EF4444;border-color:#EF4444;">❌ Rejeitar</button>
            </div>
          ` : ''}
        </div>
      `;
    });

    html += '</div>';
    el.innerHTML = html;
  }

  /* ------------------------------------------
     RENDER — EMPLOYEE VIEW
  ------------------------------------------ */
  function renderEmployeeView(el, empId) {
    const emp = _employees.find(e => e.id === empId);
    const pts = getEmployeePoints(empId);
    const monthlyPts = getMonthlyPoints(empId);
    const ranking = getRanking();
    const myRank = ranking.findIndex(r => r.empId === empId) + 1;
    const pct = _config.metaMensal > 0 ? Math.min(100, Math.round((monthlyPts / _config.metaMensal) * 100)) : 0;
    const myProofs = _proofs.filter(p => p.empId === empId);
    const pendingProofs = myProofs.filter(p => p.status === 'pendente').length;
    const approvedProofs = myProofs.filter(p => p.status === 'aprovado').length;

    const user = AppState.get('user');
    const isAdmin = user && (user.cargo === 'dono' || user.cargo === 'gerente');

    // Motivational banner (employee only, once per day)
    const motivationHtml = (!isAdmin && typeof MetasExtra !== 'undefined') ? MetasExtra.renderMotivationBanner(empId) : '';

    let html = `
      ${isAdmin ? `<button class="btn btn--sm btn--ghost" onclick="AdminMetas.setView('dashboard')" style="margin-bottom:16px;">← Voltar ao Ranking</button>` : ''}

      ${motivationHtml}

      <!-- Stats Cards -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px;">
        <div style="background:linear-gradient(135deg,#1B4332,#2D6A4F);color:#fff;border-radius:12px;padding:16px;text-align:center;">
          <div style="font-size:32px;font-weight:800;">${monthlyPts}</div>
          <div style="font-size:12px;opacity:0.8;">Pontos este mês</div>
          <div style="background:rgba(255,255,255,0.2);border-radius:6px;height:6px;margin-top:8px;overflow:hidden;">
            <div style="background:#00E676;height:100%;width:${pct}%;border-radius:6px;"></div>
          </div>
          <div style="font-size:11px;opacity:0.7;margin-top:4px;">${pct}% da meta (${_config.metaMensal})</div>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;text-align:center;">
          <div style="font-size:32px;font-weight:800;color:#1B4332;">#${myRank || '—'}</div>
          <div style="font-size:12px;color:#666;">Posição no ranking</div>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;text-align:center;">
          <div style="font-size:32px;font-weight:800;color:#1B4332;">${pts.total}</div>
          <div style="font-size:12px;color:#666;">Pontos totais</div>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;text-align:center;">
          <div style="font-size:32px;font-weight:800;color:#1B4332;">${approvedProofs}</div>
          <div style="font-size:12px;color:#666;">Comprovantes aprovados</div>
        </div>
      </div>

      <!-- Badges -->
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:20px;">
        <h3 style="margin:0 0 12px;font-size:15px;color:#1B4332;">🏅 Conquistas</h3>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          ${_config.badges.map(b => {
            const earned = pts.badges.includes(b.id);
            return `
              <div style="text-align:center;padding:8px 12px;border-radius:10px;min-width:70px;
                ${earned ? 'background:#f0fdf4;border:1px solid #bbf7d0;' : 'background:#f9fafb;border:1px solid #e5e7eb;opacity:0.4;'}">
                <div style="font-size:24px;">${b.icone}</div>
                <div style="font-size:11px;font-weight:600;color:${earned ? '#1B4332' : '#999'};">${b.nome}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Points breakdown -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:20px;">
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">
          <div style="font-size:13px;color:#666;margin-bottom:4px;">💰 Vendas</div>
          <div style="font-size:24px;font-weight:700;color:#1B4332;">${pts.vendas} pts</div>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">
          <div style="font-size:13px;color:#666;margin-bottom:4px;">📸 Conteúdo</div>
          <div style="font-size:24px;font-weight:700;color:#1B4332;">${pts.conteudo} pts</div>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">
          <div style="font-size:13px;color:#666;margin-bottom:4px;">⭐ Avaliações</div>
          <div style="font-size:24px;font-weight:700;color:#1B4332;">${pts.reviews} pts</div>
        </div>
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">
          <div style="font-size:13px;color:#666;margin-bottom:4px;">🤝 Indicações</div>
          <div style="font-size:24px;font-weight:700;color:#1B4332;">${pts.indicacoes} pts</div>
        </div>
      </div>

      <!-- Attendance (Ponto Eletrônico) -->
      ${typeof MetasExtra !== 'undefined' ? MetasExtra.renderAttendanceWidget(empId) : ''}

      <!-- Daily Tasks -->
      ${typeof MetasExtra !== 'undefined' ? MetasExtra.renderTasksWidget(empId) : ''}

      <!-- Submit proof button -->
      <div style="margin-bottom:20px;">
        <button class="btn btn--primary" onclick="AdminMetas.showSubmitProofModal('${empId}')">
          📤 Enviar Comprovante
        </button>
        ${pendingProofs > 0 ? `<span style="margin-left:8px;font-size:13px;color:#F59E0B;">⏳ ${pendingProofs} pendente(s)</span>` : ''}
      </div>

      <!-- Rewards -->
      ${typeof MetasExtra !== 'undefined' ? MetasExtra.renderRewardsWidget(empId) : ''}

      <!-- Proof history -->
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">
        <h3 style="margin:0 0 12px;font-size:15px;color:#1B4332;">📋 Meus Comprovantes</h3>
        ${myProofs.length === 0 ? '<p style="color:#999;font-size:14px;">Nenhum comprovante enviado ainda.</p>' : ''}
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${myProofs.slice(0, 20).map(p => {
            const typeInfo = PROOF_TYPES[p.tipo] || { label: p.tipo, icon: '📋' };
            const statusInfo = STATUS_LABELS[p.status];
            const date = new Date(p.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            return `
              <div style="display:flex;align-items:center;gap:8px;padding:8px;border-radius:8px;background:#f9fafb;">
                <span>${typeInfo.icon}</span>
                <span style="flex:1;font-size:13px;color:#333;">${typeInfo.label}${p.descricao ? ' — ' + p.descricao.substring(0, 40) : ''}</span>
                <span style="font-size:12px;color:#999;">${date}</span>
                <span style="background:${statusInfo.color}22;color:${statusInfo.color};font-size:11px;padding:2px 8px;border-radius:10px;font-weight:600;">${statusInfo.icon} ${statusInfo.label}</span>
                ${p.pontosGanhos ? `<span style="font-size:12px;color:#10B981;font-weight:600;">+${p.pontosGanhos}</span>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Points history -->
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-top:16px;">
        <h3 style="margin:0 0 12px;font-size:15px;color:#1B4332;">📈 Histórico de Pontos</h3>
        ${pts.historico.length === 0 ? '<p style="color:#999;font-size:14px;">Nenhum ponto registrado.</p>' : ''}
        <div style="display:flex;flex-direction:column;gap:4px;">
          ${pts.historico.slice(-15).reverse().map(h => {
            const date = new Date(h.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
            return `
              <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;font-size:13px;">
                <span style="color:${h.pontos >= 0 ? '#10B981' : '#EF4444'};font-weight:700;min-width:50px;">${h.pontos >= 0 ? '+' : ''}${h.pontos}</span>
                <span style="flex:1;color:#333;">${h.descricao}</span>
                <span style="color:#999;font-size:12px;">${date}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Admin-only: detailed reports -->
      ${isAdmin && typeof MetasExtra !== 'undefined' ? `
        <h3 style="margin:24px 0 12px;font-size:16px;color:#1B4332;border-top:2px solid #e5e7eb;padding-top:20px;">📊 Relatório Detalhado do Funcionário</h3>
        ${MetasExtra.renderAdminAttendanceReport(empId)}
        ${MetasExtra.renderAdminTaskReport(empId)}
        ${MetasExtra.renderAdminRewardsReport(empId)}
      ` : ''}
    `;

    el.innerHTML = html;
  }

  /* ------------------------------------------
     RENDER — CONFIG
  ------------------------------------------ */
  function renderConfigView(el) {
    el.innerHTML = `
      <form id="metas-config-form" style="max-width:600px;">
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:16px;">
          <h3 style="margin:0 0 16px;font-size:16px;color:#1B4332;">💰 Pontos por Atividade</h3>

          <div style="display:grid;grid-template-columns:1fr 80px;gap:8px;align-items:center;">
            <label style="font-size:14px;">Por R$1 vendido:</label>
            <input type="number" name="pontosPorRealVendido" value="${_config.pontosPorRealVendido}" min="0" step="0.1"
              style="padding:8px;border:1px solid #ddd;border-radius:8px;text-align:center;">

            <label style="font-size:14px;">Por pedido completado:</label>
            <input type="number" name="pontosPorVenda" value="${_config.pontosPorVenda}" min="0"
              style="padding:8px;border:1px solid #ddd;border-radius:8px;text-align:center;">

            <label style="font-size:14px;">📸 Foto no site:</label>
            <input type="number" name="pontosPorFotoSite" value="${_config.pontosPorFotoSite}" min="0"
              style="padding:8px;border:1px solid #ddd;border-radius:8px;text-align:center;">

            <label style="font-size:14px;">🎬 Vídeo no site:</label>
            <input type="number" name="pontosPorVideoSite" value="${_config.pontosPorVideoSite}" min="0"
              style="padding:8px;border:1px solid #ddd;border-radius:8px;text-align:center;">

            <label style="font-size:14px;">📷 Post Instagram:</label>
            <input type="number" name="pontosPorPostInstagram" value="${_config.pontosPorPostInstagram}" min="0"
              style="padding:8px;border:1px solid #ddd;border-radius:8px;text-align:center;">

            <label style="font-size:14px;">🎞️ Reels Instagram:</label>
            <input type="number" name="pontosPorReelsInstagram" value="${_config.pontosPorReelsInstagram}" min="0"
              style="padding:8px;border:1px solid #ddd;border-radius:8px;text-align:center;">

            <label style="font-size:14px;">🎵 Vídeo TikTok:</label>
            <input type="number" name="pontosPorVideoTikTok" value="${_config.pontosPorVideoTikTok}" min="0"
              style="padding:8px;border:1px solid #ddd;border-radius:8px;text-align:center;">

            <label style="font-size:14px;">⭐ Avaliação Google:</label>
            <input type="number" name="pontosPorAvaliacaoGoogle" value="${_config.pontosPorAvaliacaoGoogle}" min="0"
              style="padding:8px;border:1px solid #ddd;border-radius:8px;text-align:center;">

            <label style="font-size:14px;">🤝 Indicação de cliente:</label>
            <input type="number" name="pontosPorIndicacaoCliente" value="${_config.pontosPorIndicacaoCliente}" min="0"
              style="padding:8px;border:1px solid #ddd;border-radius:8px;text-align:center;">
          </div>
        </div>

        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:16px;">
          <h3 style="margin:0 0 16px;font-size:16px;color:#1B4332;">🎯 Meta Mensal</h3>
          <div style="display:grid;grid-template-columns:1fr 100px;gap:8px;align-items:center;">
            <label style="font-size:14px;">Pontos necessários:</label>
            <input type="number" name="metaMensal" value="${_config.metaMensal}" min="0"
              style="padding:8px;border:1px solid #ddd;border-radius:8px;text-align:center;">
          </div>
        </div>

        <button type="submit" class="btn btn--primary btn--lg" style="width:100%;">💾 Salvar Configurações</button>
      </form>

      <!-- Rewards Catalog Config -->
      ${typeof MetasExtra !== 'undefined' ? MetasExtra.renderRewardsCatalogConfig() : ''}

      <!-- Task Templates Config -->
      ${typeof MetasExtra !== 'undefined' ? MetasExtra.renderTaskTemplatesConfig() : ''}

      <!-- Pending Reward Deliveries -->
      ${typeof MetasExtra !== 'undefined' ? MetasExtra.renderAdminRewardsReport() : ''}
    `;

    document.getElementById('metas-config-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.target;
      const fields = ['pontosPorRealVendido', 'pontosPorVenda', 'pontosPorFotoSite', 'pontosPorVideoSite',
        'pontosPorPostInstagram', 'pontosPorReelsInstagram', 'pontosPorVideoTikTok',
        'pontosPorAvaliacaoGoogle', 'pontosPorIndicacaoCliente', 'metaMensal'];

      fields.forEach(f => {
        _config[f] = parseFloat(form[f].value) || 0;
      });

      saveConfig(_config);
      Toast.success('Configurações salvas!');
    });
  }

  /* ------------------------------------------
     MODALS
  ------------------------------------------ */
  function showSubmitProofModal(empId) {
    const typeOptions = Object.entries(PROOF_TYPES).map(([key, val]) =>
      `<option value="${key}">${val.icon} ${val.label}</option>`
    ).join('');

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:24px;max-width:500px;width:100%;max-height:90vh;overflow-y:auto;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
          <h3 style="margin:0;color:#1B4332;">📤 Enviar Comprovante</h3>
          <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:24px;cursor:pointer;color:#999;">✕</button>
        </div>

        <form id="proof-form">
          <div style="margin-bottom:12px;">
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Tipo de atividade *</label>
            <select name="tipo" required style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:14px;" onchange="AdminMetas._onTypeChange(this)">
              ${typeOptions}
            </select>
          </div>

          <div style="margin-bottom:12px;">
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Descrição *</label>
            <textarea name="descricao" required placeholder="Descreva o que você fez..." rows="3"
              style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:14px;resize:vertical;box-sizing:border-box;"></textarea>
          </div>

          <div id="proof-link-field" style="margin-bottom:12px;">
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">🔗 Link (URL do post/vídeo)</label>
            <input type="url" name="link" placeholder="https://..."
              style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;">
          </div>

          <div style="margin-bottom:16px;">
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">📷 Prova (screenshot/foto) *</label>
            <div id="proof-image-preview" style="display:none;margin-bottom:8px;text-align:center;">
              <img id="proof-preview-img" style="max-width:100%;max-height:200px;border-radius:8px;border:1px solid #ddd;">
            </div>
            <input type="file" id="proof-image-input" accept="image/*" capture="environment"
              style="width:100%;padding:10px;border:1px dashed #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;cursor:pointer;">
            <p style="font-size:11px;color:#999;margin:4px 0 0;">Tire uma foto ou faça upload de um screenshot como prova.</p>
          </div>

          <button type="submit" class="btn btn--primary btn--lg" style="width:100%;">
            📤 Enviar para Aprovação
          </button>
        </form>
      </div>
    `;

    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    // Image preview
    document.getElementById('proof-image-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        document.getElementById('proof-preview-img').src = ev.target.result;
        document.getElementById('proof-image-preview').style.display = 'block';
      };
      reader.readAsDataURL(file);
    });

    // Form submit
    document.getElementById('proof-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.target;
      const tipo = form.tipo.value;
      const descricao = form.descricao.value.trim();
      const link = form.link?.value?.trim() || '';
      const imgEl = document.getElementById('proof-preview-img');
      const imageData = imgEl && imgEl.src ? imgEl.src : null;

      if (!descricao) {
        Toast.error('Preencha a descrição.');
        return;
      }

      // Image is required for most types
      const typeInfo = PROOF_TYPES[tipo];
      if (typeInfo && typeInfo.needsImage && !imageData) {
        Toast.error('Foto/screenshot é obrigatório como prova.');
        return;
      }

      submitProof({
        empId,
        tipo,
        descricao,
        link,
        imageData,
      });

      modal.remove();
      render();
    });
  }

  function showRejectModal(proofId) {
    const motivo = prompt('Motivo da rejeição:');
    if (motivo !== null) {
      rejectProof(proofId, motivo);
      render();
    }
  }

  function showAddPointsModal() {
    const empOptions = _employees.map(e =>
      `<option value="${e.id}">${e.nome} (${e.loja || '—'})</option>`
    ).join('');

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:24px;max-width:400px;width:100%;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
          <h3 style="margin:0;color:#1B4332;">➕ Adicionar Pontos</h3>
          <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:24px;cursor:pointer;color:#999;">✕</button>
        </div>
        <form id="add-points-form">
          <div style="margin-bottom:12px;">
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Funcionário</label>
            <select name="empId" required style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;">${empOptions}</select>
          </div>
          <div style="margin-bottom:12px;">
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Pontos</label>
            <input type="number" name="pontos" required min="1" value="10" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;box-sizing:border-box;">
          </div>
          <div style="margin-bottom:12px;">
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Tipo</label>
            <select name="tipo" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;">
              <option value="venda">Venda</option>
              <option value="conteudo">Conteúdo</option>
              <option value="review">Avaliação</option>
              <option value="indicacao">Indicação</option>
              <option value="bonus">Bônus</option>
            </select>
          </div>
          <div style="margin-bottom:16px;">
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Descrição</label>
            <input type="text" name="descricao" required placeholder="Motivo dos pontos" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;box-sizing:border-box;">
          </div>
          <button type="submit" class="btn btn--primary" style="width:100%;">Adicionar</button>
        </form>
      </div>
    `;

    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    document.getElementById('add-points-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.target;
      addPoints(form.empId.value, parseInt(form.pontos.value), form.tipo.value, form.descricao.value);
      Toast.success(`+${form.pontos.value} pontos adicionados!`);
      modal.remove();
      render();
    });
  }

  function _onTypeChange(select) {
    const tipo = select.value;
    const typeInfo = PROOF_TYPES[tipo];
    const linkField = document.getElementById('proof-link-field');
    if (linkField) {
      linkField.style.display = typeInfo && typeInfo.needsLink ? 'block' : 'none';
    }
  }

  /* ------------------------------------------
     PUBLIC API
  ------------------------------------------ */
  function setView(view) {
    _currentView = view;
    render();
  }

  function viewEmployee(empId) {
    _selectedEmployee = empId;
    _currentView = 'employee';
    render();
  }

  function filterProofs(status) {
    _filterStatus = status;
    _currentView = 'proofs';
    render();
  }

  function approve(proofId) {
    approveProof(proofId);
    render();
  }

  return {
    render,
    setView,
    viewEmployee,
    filterProofs,
    approve,
    showRejectModal,
    showSubmitProofModal,
    showAddPointsModal,
    addPoints,
    getEmployeePoints,
    _onTypeChange,
  };
})();
