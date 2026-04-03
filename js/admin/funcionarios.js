/* ============================================
   CLUBE DO NATURAL — Admin Funcionários
   Gestão de funcionários, permissões, ponto
   ============================================ */

const AdminFuncionarios = (() => {
  const container = () => document.getElementById('funcionarios-content');

  let currentStoreFilter = 'todas';
  let searchTerm = '';
  let cargoFilter = 'todos';
  let statusFilter = 'todos';

  const CARGOS = ['dono', 'gerente', 'atendente', 'caixa', 'estoquista', 'motoboy'];
  const CARGO_LABELS = {
    dono: 'Proprietário',
    gerente: 'Gerente',
    atendente: 'Atendente',
    caixa: 'Caixa',
    estoquista: 'Estoquista',
    motoboy: 'Motoboy',
  };

  const STATUS_BADGES = {
    ativo:  { bg: '#E8F5E9', color: '#2E7D32', label: 'Ativo' },
    inativo: { bg: '#FFEBEE', color: '#C62828', label: 'Inativo' },
    ferias: { bg: '#E3F2FD', color: '#1565C0', label: 'Férias' },
  };

  // Auth PERMISSIONS reference
  const PERMISSIONS = {
    dono: ['dashboard', 'pedidos', 'assinaturas', 'estoque', 'caixa', 'financeiro', 'nf', 'funcionarios', 'produtos', 'lojas', 'clientes', 'relatorios', 'config', 'restock', 'metas', 'afiliados'],
    gerente: ['dashboard', 'pedidos', 'assinaturas', 'estoque', 'caixa', 'financeiro', 'nf', 'produtos', 'clientes', 'relatorios', 'restock', 'metas', 'afiliados'],
    atendente: ['pedidos', 'assinaturas', 'metas'],
    caixa: ['pedidos', 'caixa', 'financeiro', 'nf', 'metas'],
    estoquista: ['estoque', 'produtos', 'restock', 'metas'],
    motoboy: ['pedidos'],
  };

  let _cachedEmployees = null;

  function useFirestore() {
    return typeof FirestoreService !== 'undefined' && FirestoreService.ready;
  }

  /* ------------------------------------------
     DATA
  ------------------------------------------ */
  async function loadEmployees() {
    if (useFirestore()) {
      try {
        _cachedEmployees = await FirestoreService.Employees.getAll();
        return;
      } catch (e) {
        console.warn('[Funcionarios] Firestore load failed:', e.message);
      }
    }
    _cachedEmployees = Storage.get('employees') || [...DataEmployees];
  }

  function getEmployees() {
    let list = _cachedEmployees || [];

    if (currentStoreFilter && currentStoreFilter !== 'todas') {
      list = list.filter(e => e.loja === currentStoreFilter || e.loja === null);
    }
    if (cargoFilter !== 'todos') {
      list = list.filter(e => e.cargo === cargoFilter);
    }
    if (statusFilter !== 'todos') {
      list = list.filter(e => e.status === statusFilter);
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      list = list.filter(e =>
        e.nome.toLowerCase().includes(term) ||
        (e.cpf && e.cpf.includes(term)) ||
        (e.celular && e.celular.includes(term))
      );
    }
    return list;
  }

  async function saveEmployee(employee) {
    if (useFirestore()) {
      try {
        await FirestoreService.Employees.save(employee);
        if (_cachedEmployees) {
          const idx = _cachedEmployees.findIndex(e => e.id === employee.id);
          if (idx !== -1) _cachedEmployees[idx] = employee;
          else _cachedEmployees.push(employee);
        }
        return;
      } catch (e) {
        console.warn('[Funcionarios] Firestore save failed:', e.message);
      }
    }
    const all = getAllEmployees();
    const idx = all.findIndex(e => e.id === employee.id);
    if (idx !== -1) all[idx] = employee;
    else all.push(employee);
    Storage.set('employees', all);
    _cachedEmployees = all;
  }

  function getAllEmployees() {
    return _cachedEmployees || [];
  }

  function getStoreLabel(lojaId) {
    if (!lojaId) return 'Todas';
    const store = DataStores.find(s => s.id === lojaId);
    return store ? store.nome.split(' - ')[1] || store.nome : lojaId;
  }

  /* ------------------------------------------
     PONTO (Time Clock)
  ------------------------------------------ */
  function getPontoData() {
    return Storage.get('ponto') || [];
  }

  function savePontoData(data) {
    Storage.set('ponto', data);
  }

  function registrarPonto(employeeId, tipo) {
    const ponto = getPontoData();
    ponto.push({
      id: Utils.generateId(),
      employeeId,
      tipo, // 'entrada' or 'saida'
      data: new Date().toISOString(),
    });
    savePontoData(ponto);
    Toast.success(`${tipo === 'entrada' ? 'Entrada' : 'Saída'} registrada com sucesso!`);
  }

  /* ------------------------------------------
     RENDER
  ------------------------------------------ */
  async function render(storeFilter) {
    const el = container();
    if (!el) return;

    currentStoreFilter = storeFilter || 'todas';
    el.innerHTML = '<div style="text-align:center;padding:40px;color:#888;">Carregando funcionários...</div>';
    await loadEmployees();
    const employees = getEmployees();

    el.innerHTML = `
      <style>
        .func-action-bar {
          display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:20px;
        }
        .func-action-bar input[type="search"] {
          padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;
          background:#fff;flex:1;min-width:200px;max-width:350px;
        }
        .func-action-bar select {
          padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;
          background:#fff;min-width:130px;
        }
        .func-btn-novo {
          background:#2D6A4F;color:#fff;border:none;padding:10px 20px;border-radius:8px;
          cursor:pointer;font-size:14px;font-weight:600;white-space:nowrap;
        }
        .func-btn-novo:hover { background:#1B4332; }
        .func-status-badge {
          display:inline-block;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:600;
        }
        .func-actions-btn {
          background:none;border:1px solid #ddd;padding:4px 10px;border-radius:6px;
          cursor:pointer;font-size:12px;margin:2px;transition:background 0.2s;
        }
        .func-actions-btn:hover { background:#f0f0f0; }
        .func-actions-btn--danger { color:#C62828;border-color:#FFCDD2; }
        .func-actions-btn--danger:hover { background:#FFEBEE; }
        .func-actions-btn--primary { color:#2D6A4F;border-color:#A5D6A7; }
        .func-actions-btn--primary:hover { background:#E8F5E9; }
      </style>

      <!-- Action Bar -->
      <div class="func-action-bar">
        <input type="search" class="func-search" placeholder="Buscar por nome, CPF, celular..." value="${searchTerm}">
        <select class="func-cargo-filter">
          <option value="todos">Todos os Cargos</option>
          ${CARGOS.map(c => `<option value="${c}" ${cargoFilter === c ? 'selected' : ''}>${CARGO_LABELS[c]}</option>`).join('')}
        </select>
        <select class="func-status-filter">
          <option value="todos" ${statusFilter === 'todos' ? 'selected' : ''}>Todos Status</option>
          <option value="ativo" ${statusFilter === 'ativo' ? 'selected' : ''}>Ativo</option>
          <option value="inativo" ${statusFilter === 'inativo' ? 'selected' : ''}>Inativo</option>
          <option value="ferias" ${statusFilter === 'ferias' ? 'selected' : ''}>Férias</option>
        </select>
        <button class="func-btn-novo">+ Novo Funcionário</button>
      </div>

      <!-- Table -->
      <div class="table-responsive">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>CPF</th>
              <th>Cargo</th>
              <th>Loja</th>
              <th>Celular</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${employees.length === 0 ? `
              <tr><td colspan="7" style="text-align:center;color:#999;padding:24px;">Nenhum funcionário encontrado</td></tr>
            ` : employees.map(e => {
              const badge = STATUS_BADGES[e.status] || STATUS_BADGES.ativo;
              const isActive = e.status === 'ativo';
              return `
                <tr>
                  <td><strong>${e.nome}</strong></td>
                  <td>${e.cpf}</td>
                  <td>${CARGO_LABELS[e.cargo] || e.cargo}</td>
                  <td>${getStoreLabel(e.loja)}</td>
                  <td>${e.celular || '—'}</td>
                  <td>
                    <span class="func-status-badge" style="background:${badge.bg};color:${badge.color};">
                      ${badge.label}
                    </span>
                  </td>
                  <td>
                    <button class="func-actions-btn func-actions-btn--primary" data-action="editar" data-id="${e.id}">Editar</button>
                    <button class="func-actions-btn ${isActive ? 'func-actions-btn--danger' : 'func-actions-btn--primary'}" data-action="toggle-status" data-id="${e.id}">
                      ${isActive ? 'Desativar' : 'Ativar'}
                    </button>
                    <button class="func-actions-btn" data-action="ponto" data-id="${e.id}">Ver Ponto</button>
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
    // Search
    const searchInput = el.querySelector('.func-search');
    if (searchInput) {
      searchInput.addEventListener('input', Utils.debounce((e) => {
        searchTerm = e.target.value;
        render(currentStoreFilter);
      }, 400));
    }

    // Cargo filter
    const cargoSelect = el.querySelector('.func-cargo-filter');
    if (cargoSelect) {
      cargoSelect.addEventListener('change', (e) => {
        cargoFilter = e.target.value;
        render(currentStoreFilter);
      });
    }

    // Status filter
    const statusSelect = el.querySelector('.func-status-filter');
    if (statusSelect) {
      statusSelect.addEventListener('change', (e) => {
        statusFilter = e.target.value;
        render(currentStoreFilter);
      });
    }

    // New button
    const btnNovo = el.querySelector('.func-btn-novo');
    if (btnNovo) {
      btnNovo.addEventListener('click', () => showEmployeeModal(null));
    }

    // Action buttons
    el.querySelectorAll('.func-actions-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        if (action === 'editar') showEmployeeModal(id);
        else if (action === 'toggle-status') toggleEmployeeStatus(id);
        else if (action === 'ponto') showPontoModal(id);
      });
    });
  }

  /* ------------------------------------------
     TOGGLE STATUS
  ------------------------------------------ */
  async function toggleEmployeeStatus(id) {
    const all = getAllEmployees();
    const emp = all.find(e => e.id === id);
    if (!emp) return;

    emp.status = emp.status === 'ativo' ? 'inativo' : 'ativo';
    await saveEmployee(emp);
    Toast.success(`Funcionário ${emp.status === 'ativo' ? 'ativado' : 'desativado'}`);
    render(currentStoreFilter);
  }

  /* ------------------------------------------
     EMPLOYEE MODAL (New / Edit)
  ------------------------------------------ */
  function showEmployeeModal(employeeId) {
    const all = getAllEmployees();
    const employee = employeeId ? all.find(e => e.id === employeeId) : null;
    const isEdit = !!employee;
    const title = isEdit ? 'Editar Funcionário' : 'Novo Funcionário';

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;';

    const modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;border-radius:12px;max-width:700px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);';

    const selectedCargo = employee ? employee.cargo : 'atendente';
    const perms = PERMISSIONS[selectedCargo] || [];

    modal.innerHTML = `
      <div style="padding:20px 24px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;">
        <h2 style="margin:0;font-size:20px;color:#1B4332;">${title}</h2>
        <button class="modal-close" style="background:none;border:none;font-size:24px;cursor:pointer;color:#888;">✕</button>
      </div>
      <div style="padding:20px 24px;">
        <form class="func-form">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div>
              <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;color:#333;">Nome</label>
              <input type="text" name="nome" value="${employee ? employee.nome : ''}" required
                style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;">
            </div>
            <div>
              <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;color:#333;">CPF</label>
              <input type="text" name="cpf" value="${employee ? employee.cpf : ''}" required placeholder="000.000.000-00" maxlength="14"
                style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;">
            </div>
            <div>
              <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;color:#333;">Cargo</label>
              <select name="cargo" required
                style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;">
                ${CARGOS.map(c => `<option value="${c}" ${selectedCargo === c ? 'selected' : ''}>${CARGO_LABELS[c]}</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;color:#333;">Loja</label>
              <select name="loja"
                style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;">
                <option value="">Todas (acesso geral)</option>
                ${DataStores.map(s => `<option value="${s.id}" ${employee && employee.loja === s.id ? 'selected' : ''}>${s.nome}</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;color:#333;">Celular</label>
              <input type="tel" name="celular" value="${employee ? employee.celular : ''}" placeholder="(11) 99999-0000" maxlength="15"
                style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;">
            </div>
            <div>
              <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;color:#333;">Email</label>
              <input type="email" name="email" value="${employee ? employee.email : ''}" placeholder="email@exemplo.com"
                style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;">
            </div>
            <div>
              <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;color:#333;">Senha</label>
              <input type="text" name="senha" value="${employee ? employee.senha : ''}" required
                style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;">
            </div>
            <div>
              <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;color:#333;">Salário (R$)</label>
              <input type="text" name="salario" value="${employee && employee.salario ? employee.salario.toFixed(2) : '0.00'}" placeholder="0.00"
                style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;">
            </div>
            <div>
              <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;color:#333;">Data Admissão</label>
              <input type="date" name="dataAdmissao" value="${employee ? employee.dataAdmissao : new Date().toISOString().slice(0, 10)}"
                style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;box-sizing:border-box;">
            </div>
          </div>

          <!-- Permissions display -->
          <div style="margin-top:20px;background:#f8f9fa;border-radius:8px;padding:14px;">
            <h4 style="margin:0 0 8px;font-size:14px;color:#1B4332;">Permissões do Cargo</h4>
            <div class="func-permissions" style="display:flex;flex-wrap:wrap;gap:6px;">
              ${renderPermissionBadges(selectedCargo)}
            </div>
          </div>

          <div style="display:flex;gap:12px;justify-content:flex-end;margin-top:20px;">
            <button type="button" class="modal-cancel" style="
              background:#f5f5f5;color:#666;border:1px solid #ddd;padding:10px 24px;border-radius:8px;
              cursor:pointer;font-size:14px;">Cancelar</button>
            <button type="submit" style="
              background:#2D6A4F;color:#fff;border:none;padding:10px 24px;border-radius:8px;
              cursor:pointer;font-size:14px;font-weight:600;">${isEdit ? 'Salvar' : 'Criar'}</button>
          </div>
        </form>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Masks
    const cpfInput = modal.querySelector('input[name="cpf"]');
    if (cpfInput) Utils.maskCPF(cpfInput);
    const celInput = modal.querySelector('input[name="celular"]');
    if (celInput) Utils.maskPhone(celInput);
    const salarioInput = modal.querySelector('input[name="salario"]');
    if (salarioInput) Utils.maskMoney(salarioInput);

    // Cargo change updates permissions display
    const cargoSelect = modal.querySelector('select[name="cargo"]');
    const permsContainer = modal.querySelector('.func-permissions');
    cargoSelect.addEventListener('change', () => {
      permsContainer.innerHTML = renderPermissionBadges(cargoSelect.value);
    });

    // Close
    const close = () => overlay.remove();
    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('.modal-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    // Submit
    modal.querySelector('.func-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const data = {
        id: employee ? employee.id : `func-${Utils.generateId()}`,
        nome: form.nome.value.trim(),
        cpf: form.cpf.value.trim(),
        cargo: form.cargo.value,
        loja: form.loja.value || null,
        celular: form.celular.value.trim(),
        email: form.email.value.trim(),
        senha: form.senha.value.trim(),
        salario: parseFloat(form.salario.value.replace(',', '.')) || 0,
        dataAdmissao: form.dataAdmissao.value,
        status: employee ? employee.status : 'ativo',
      };

      await saveEmployee(data);
      close();
      Toast.success(isEdit ? 'Funcionário atualizado!' : 'Funcionário criado!');
      render(currentStoreFilter);
    });
  }

  function renderPermissionBadges(cargo) {
    const perms = PERMISSIONS[cargo] || [];
    const PAGE_LABELS = {
      dashboard: 'Dashboard', pedidos: 'Pedidos', assinaturas: 'Assinaturas',
      estoque: 'Estoque', caixa: 'Caixa', nf: 'Notas Fiscais',
      funcionarios: 'Funcionários', produtos: 'Produtos', lojas: 'Lojas',
      clientes: 'Clientes', relatorios: 'Relatórios', config: 'Configurações',
    };
    if (perms.length === 0) {
      return '<span style="color:#999;font-size:13px;">Sem permissões definidas</span>';
    }
    return perms.map(p =>
      `<span style="display:inline-block;padding:3px 10px;border-radius:10px;font-size:12px;background:#E8F5E9;color:#2E7D32;font-weight:500;">${PAGE_LABELS[p] || p}</span>`
    ).join('');
  }

  /* ------------------------------------------
     PONTO MODAL (Time Clock)
  ------------------------------------------ */
  function showPontoModal(employeeId) {
    const all = getAllEmployees();
    const employee = all.find(e => e.id === employeeId);
    if (!employee) return;

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;';

    const modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;border-radius:12px;max-width:600px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);';

    function renderPontoContent() {
      const ponto = getPontoData().filter(p => p.employeeId === employeeId);

      // Last 7 days
      const now = new Date();
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const recentPonto = ponto
        .filter(p => new Date(p.data) >= sevenDaysAgo)
        .sort((a, b) => new Date(b.data) - new Date(a.data));

      // Check last record to determine next action
      const todayStr = now.toISOString().slice(0, 10);
      const todayRecords = ponto.filter(p => p.data.slice(0, 10) === todayStr).sort((a, b) => new Date(b.data) - new Date(a.data));
      const lastToday = todayRecords[0];
      const canEntrada = !lastToday || lastToday.tipo === 'saida';
      const canSaida = lastToday && lastToday.tipo === 'entrada';

      modal.innerHTML = `
        <div style="padding:20px 24px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;">
          <h2 style="margin:0;font-size:20px;color:#1B4332;">Ponto — ${employee.nome}</h2>
          <button class="modal-close" style="background:none;border:none;font-size:24px;cursor:pointer;color:#888;">✕</button>
        </div>
        <div style="padding:20px 24px;">
          <!-- Action buttons -->
          <div style="display:flex;gap:12px;margin-bottom:20px;">
            <button class="btn-ponto-entrada" ${canEntrada ? '' : 'disabled'} style="
              flex:1;padding:14px;border:none;border-radius:8px;cursor:pointer;font-size:15px;font-weight:600;
              background:${canEntrada ? '#2D6A4F' : '#ccc'};color:#fff;">
              Registrar Entrada
            </button>
            <button class="btn-ponto-saida" ${canSaida ? '' : 'disabled'} style="
              flex:1;padding:14px;border:none;border-radius:8px;cursor:pointer;font-size:15px;font-weight:600;
              background:${canSaida ? '#C62828' : '#ccc'};color:#fff;">
              Registrar Saída
            </button>
          </div>

          <!-- Records -->
          <h4 style="margin:0 0 10px;font-size:14px;color:#1B4332;">Registros dos últimos 7 dias</h4>
          ${recentPonto.length === 0
            ? '<p style="color:#999;text-align:center;padding:20px;">Nenhum registro de ponto</p>'
            : `
              <div class="table-responsive">
                <table class="admin-table admin-table--compact" style="font-size:13px;">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Horário</th>
                      <th>Tipo</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${recentPonto.map(p => {
                      const d = new Date(p.data);
                      const tipoLabel = p.tipo === 'entrada' ? 'Entrada' : 'Saída';
                      const tipoBg = p.tipo === 'entrada' ? '#E8F5E9' : '#FFEBEE';
                      const tipoColor = p.tipo === 'entrada' ? '#2E7D32' : '#C62828';
                      return `
                        <tr>
                          <td>${Utils.formatDate(p.data)}</td>
                          <td>${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}</td>
                          <td><span style="display:inline-block;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:600;background:${tipoBg};color:${tipoColor};">${tipoLabel}</span></td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            `
          }
        </div>
      `;

      // Bind modal events
      modal.querySelector('.modal-close').addEventListener('click', () => overlay.remove());

      const btnEntrada = modal.querySelector('.btn-ponto-entrada');
      if (btnEntrada && canEntrada) {
        btnEntrada.addEventListener('click', () => {
          registrarPonto(employeeId, 'entrada');
          renderPontoContent();
        });
      }

      const btnSaida = modal.querySelector('.btn-ponto-saida');
      if (btnSaida && canSaida) {
        btnSaida.addEventListener('click', () => {
          registrarPonto(employeeId, 'saida');
          renderPontoContent();
        });
      }
    }

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler); }
    });

    renderPontoContent();
  }

  /* ------------------------------------------
     PUBLIC API
  ------------------------------------------ */
  return { render };
})();
