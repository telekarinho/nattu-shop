/* ============================================
   CLUBE DO NATURAL — Metas Extra
   Companion module for metas.js with:
   - GPS Clock-in/Clock-out (Ponto Eletrônico)
   - Daily Task/Checklist System
   - Motivational Messages
   - Configurable Rewards/Prizes
   - Admin Employee Report
   ============================================ */

const MetasExtra = (() => {
  'use strict';

  /* ------------------------------------------
     GPS ATTENDANCE (PONTO ELETRÔNICO)
  ------------------------------------------ */
  const ATTENDANCE_KEY = 'metas_attendance';
  const GPS_RADIUS_METERS = 200; // max distance from store to clock in/out

  function loadAttendance() {
    return Storage.get(ATTENDANCE_KEY) || [];
  }

  function saveAttendance(records) {
    Storage.set(ATTENDANCE_KEY, records);
  }

  function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371e3; // Earth radius in meters
    const toRad = x => x * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function findNearestStore(lat, lng) {
    const stores = typeof DataStores !== 'undefined' ? DataStores : [];
    let nearest = null;
    let minDist = Infinity;
    stores.forEach(s => {
      if (!s.lat || !s.lng) return;
      const d = haversineDistance(lat, lng, s.lat, s.lng);
      if (d < minDist) { minDist = d; nearest = s; }
    });
    return { store: nearest, distance: minDist };
  }

  function getEmployeeTodayRecord(empId) {
    const records = loadAttendance();
    const today = new Date().toISOString().slice(0, 10);
    return records.find(r => r.empId === empId && r.date === today);
  }

  function clockIn(empId, callback) {
    if (!navigator.geolocation) {
      Toast.error('GPS não disponível neste dispositivo.');
      return;
    }

    const existing = getEmployeeTodayRecord(empId);
    if (existing && existing.clockIn) {
      Toast.warning('Você já registrou entrada hoje.');
      if (callback) callback(false);
      return;
    }

    Toast.info('Obtendo localização...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const { store, distance } = findNearestStore(latitude, longitude);

        if (!store || distance > GPS_RADIUS_METERS) {
          Toast.error(`Você precisa estar na loja para bater ponto. Distância: ${Math.round(distance)}m`);
          if (callback) callback(false);
          return;
        }

        const records = loadAttendance();
        const today = new Date().toISOString().slice(0, 10);
        const now = new Date().toISOString();

        records.push({
          empId,
          date: today,
          clockIn: now,
          clockOut: null,
          storeId: store.id,
          storeName: store.nome,
          lat: latitude,
          lng: longitude,
          distanceMeters: Math.round(distance),
        });

        saveAttendance(records);
        if (typeof FirestoreService !== 'undefined') {
          try { FirestoreService.Metas.saveAttendance(empId, records[records.length - 1]); } catch(e) {}
        }

        // Award points for clocking in
        if (typeof AdminMetas !== 'undefined' && AdminMetas.addPoints) {
          AdminMetas.addPoints(empId, 5, 'assiduidade', 'Registro de entrada - ' + store.nome);
        }

        Toast.success(`Entrada registrada! ${store.nome} (${Math.round(distance)}m)`);
        if (callback) callback(true);
      },
      (err) => {
        Toast.error('Erro ao obter localização: ' + (err.message || 'Permissão negada'));
        if (callback) callback(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  function clockOut(empId, callback) {
    if (!navigator.geolocation) {
      Toast.error('GPS não disponível neste dispositivo.');
      return;
    }

    const records = loadAttendance();
    const today = new Date().toISOString().slice(0, 10);
    const record = records.find(r => r.empId === empId && r.date === today && !r.clockOut);

    if (!record) {
      Toast.warning('Nenhuma entrada registrada hoje para fechar.');
      if (callback) callback(false);
      return;
    }

    Toast.info('Obtendo localização...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const { store, distance } = findNearestStore(latitude, longitude);

        if (!store || distance > GPS_RADIUS_METERS) {
          Toast.error(`Você precisa estar na loja para bater ponto. Distância: ${Math.round(distance)}m`);
          if (callback) callback(false);
          return;
        }

        record.clockOut = new Date().toISOString();
        record.clockOutLat = latitude;
        record.clockOutLng = longitude;
        record.clockOutDistance = Math.round(distance);

        // Calculate hours worked
        const diff = new Date(record.clockOut) - new Date(record.clockIn);
        record.hoursWorked = +(diff / 3600000).toFixed(2);

        saveAttendance(records);
        if (typeof FirestoreService !== 'undefined') {
          try { FirestoreService.Metas.saveAttendance(empId, record); } catch(e) {}
        }

        // Award points for full shift
        if (typeof AdminMetas !== 'undefined' && AdminMetas.addPoints) {
          AdminMetas.addPoints(empId, 10, 'assiduidade', `Turno completo: ${record.hoursWorked}h - ${store.nome}`);
        }

        Toast.success(`Saída registrada! Turno: ${record.hoursWorked}h`);
        if (callback) callback(true);
      },
      (err) => {
        Toast.error('Erro ao obter localização: ' + (err.message || 'Permissão negada'));
        if (callback) callback(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  function getAttendanceHistory(empId, days) {
    const records = loadAttendance();
    const filtered = empId ? records.filter(r => r.empId === empId) : records;
    if (days) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      return filtered.filter(r => r.date >= cutoffStr);
    }
    return filtered;
  }

  function getAttendanceStats(empId, days) {
    const history = getAttendanceHistory(empId, days || 30);
    const totalDays = history.length;
    const completeDays = history.filter(r => r.clockIn && r.clockOut).length;
    const totalHours = history.reduce((sum, r) => sum + (r.hoursWorked || 0), 0);
    const avgHours = completeDays > 0 ? (totalHours / completeDays).toFixed(1) : 0;
    const lateDays = history.filter(r => {
      if (!r.clockIn) return false;
      const hour = new Date(r.clockIn).getHours();
      const minute = new Date(r.clockIn).getMinutes();
      return hour > 8 || (hour === 8 && minute > 15); // Late if after 8:15
    }).length;

    return { totalDays, completeDays, totalHours: +totalHours.toFixed(1), avgHours: +avgHours, lateDays };
  }

  /* ------------------------------------------
     DAILY TASKS / CHECKLIST
  ------------------------------------------ */
  const TASKS_KEY = 'metas_tasks';
  const TASK_TEMPLATES_KEY = 'metas_task_templates';

  const DEFAULT_TASK_TEMPLATES = [
    // Store tasks
    { id: 'abrir_loja', category: 'loja', label: 'Abrir a loja (ligar luzes, verificar caixa)', points: 5, icon: '🏪' },
    { id: 'limpeza_manha', category: 'loja', label: 'Limpeza da manhã (balcão, vitrine, chão)', points: 5, icon: '🧹' },
    { id: 'verificar_estoque', category: 'loja', label: 'Verificar estoque e validade dos produtos', points: 5, icon: '📦' },
    { id: 'repor_prateleiras', category: 'loja', label: 'Repor prateleiras e geladeira', points: 5, icon: '🗄️' },
    { id: 'atender_clientes', category: 'loja', label: 'Atendimento ao cliente (personalizado)', points: 3, icon: '😊' },
    { id: 'fechar_caixa', category: 'loja', label: 'Conferir e fechar o caixa do dia', points: 5, icon: '💵' },
    { id: 'limpeza_tarde', category: 'loja', label: 'Limpeza de fim de turno', points: 5, icon: '🧽' },
    { id: 'fechar_loja', category: 'loja', label: 'Fechar a loja (alarme, luzes, chaves)', points: 5, icon: '🔒' },
    // Marketing tasks (requireProof = needs link/screenshot to validate)
    { id: 'foto_produto', category: 'marketing', label: 'Tirar foto de produto para redes', points: 10, icon: '📸', requireProof: true },
    { id: 'story_instagram', category: 'marketing', label: 'Postar story no Instagram da loja', points: 8, icon: '📱', requireProof: true },
    { id: 'pedir_avaliacao', category: 'marketing', label: 'Pedir avaliação Google para cliente', points: 10, icon: '⭐', requireProof: true },
    { id: 'organizar_vitrine', category: 'marketing', label: 'Organizar vitrine/display de produtos', points: 5, icon: '🪟', requireProof: true },
    { id: 'degustacao', category: 'marketing', label: 'Oferecer degustação de produto novo', points: 8, icon: '🥤' },
    // Sales goals
    { id: 'fechar_assinatura', category: 'vendas', label: 'Fechar assinatura recorrente com cliente', points: 20, icon: '🔄' },
  ];

  function loadTaskTemplates() {
    return Storage.get(TASK_TEMPLATES_KEY) || [...DEFAULT_TASK_TEMPLATES];
  }

  function saveTaskTemplates(templates) {
    Storage.set(TASK_TEMPLATES_KEY, templates);
  }

  function loadTasks() {
    return Storage.get(TASKS_KEY) || [];
  }

  function saveTasks(tasks) {
    Storage.set(TASKS_KEY, tasks);
  }

  function getEmployeeTodayTasks(empId) {
    const tasks = loadTasks();
    const today = new Date().toISOString().slice(0, 10);
    return tasks.filter(t => t.empId === empId && t.date === today);
  }

  function initDailyTasks(empId) {
    const today = new Date().toISOString().slice(0, 10);
    const tasks = loadTasks();
    const existing = tasks.filter(t => t.empId === empId && t.date === today);

    if (existing.length > 0) return existing;

    const templates = loadTaskTemplates();
    const newTasks = templates.map(tpl => ({
      id: `TSK-${today}-${tpl.id}-${empId}`,
      templateId: tpl.id,
      empId,
      date: today,
      category: tpl.category,
      label: tpl.label,
      icon: tpl.icon,
      points: tpl.points,
      requireProof: tpl.requireProof || false,
      done: false,
      doneAt: null,
      proofLink: null,
    }));

    tasks.push(...newTasks);
    saveTasks(tasks);
    return newTasks;
  }

  function completeTask(taskId, empId) {
    const tasks = loadTasks();
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.done) return false;

    task.done = true;
    task.doneAt = new Date().toISOString();
    saveTasks(tasks);
    if (typeof FirestoreService !== 'undefined') {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const empTasks = tasks.filter(t => t.empId === empId && t.date === today);
        FirestoreService.Metas.saveDailyTasks(empId, today, empTasks);
      } catch(e) {}
    }

    // Award points
    if (typeof AdminMetas !== 'undefined' && AdminMetas.addPoints) {
      AdminMetas.addPoints(empId, task.points, 'tarefa', `Tarefa: ${task.label}`);
    }

    return true;
  }

  function undoTask(taskId) {
    const tasks = loadTasks();
    const task = tasks.find(t => t.id === taskId);
    if (!task || !task.done) return false;
    task.done = false;
    task.doneAt = null;
    saveTasks(tasks);
    return true;
  }

  function getTaskStats(empId, days) {
    const tasks = loadTasks();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (days || 30));
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const filtered = tasks.filter(t => t.empId === empId && t.date >= cutoffStr);
    const total = filtered.length;
    const done = filtered.filter(t => t.done).length;
    const rate = total > 0 ? Math.round((done / total) * 100) : 0;

    return { total, done, rate };
  }

  /* ------------------------------------------
     MOTIVATIONAL MESSAGES
  ------------------------------------------ */
  const MOTIVATION_KEY = 'metas_motivation_seen';

  const MOTIVATIONAL_MESSAGES = {
    login: [
      { text: 'Bom dia, campeão! Mais um dia para brilhar!', icon: '☀️' },
      { text: 'Você voltou! O time fica mais forte com você aqui.', icon: '💪' },
      { text: 'Novo dia, novas conquistas! Vamos nessa?', icon: '🚀' },
      { text: 'Cada cliente atendido é uma vitória. Bora pra cima!', icon: '🏆' },
      { text: 'A natureza agradece o seu trabalho! Vamos juntos!', icon: '🌿' },
      { text: 'Mais um dia para fazer a diferença! Conta comigo!', icon: '⭐' },
      { text: 'Você é essencial para o time! Bora fazer acontecer!', icon: '🔥' },
      { text: 'O sucesso é feito de pequenas conquistas diárias!', icon: '🎯' },
    ],
    during: [
      { text: 'Você está arrasando hoje! Continue assim!', icon: '🔥', minHour: 10 },
      { text: 'Metade do dia feita! Você está mandando bem!', icon: '⚡', minHour: 12 },
      { text: 'Lembre: cada venda conta pontos! Aproveite!', icon: '💰', minHour: 11 },
      { text: 'Que tal pedir uma avaliação Google pra um cliente?', icon: '⭐', minHour: 13 },
      { text: 'Reta final do dia! Vamos com tudo!', icon: '🏁', minHour: 16 },
      { text: 'Já tirou uma foto legal dos produtos hoje?', icon: '📸', minHour: 14 },
      { text: 'Seu ranking está subindo! Continue focado!', icon: '📈', minHour: 15 },
      { text: 'Falta pouco pra bater a meta! Vai lá!', icon: '🎯', minHour: 11 },
    ],
  };

  function getLoginMessage() {
    const msgs = MOTIVATIONAL_MESSAGES.login;
    return msgs[Math.floor(Math.random() * msgs.length)];
  }

  function getDuringMessage() {
    const hour = new Date().getHours();
    const eligible = MOTIVATIONAL_MESSAGES.during.filter(m => hour >= m.minHour);
    if (eligible.length === 0) return null;

    // Check if we already showed a message this hour
    const seen = Storage.get(MOTIVATION_KEY) || {};
    const key = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
    if (seen[key]) return null;

    seen[key] = true;
    // Clean old keys (keep last 24)
    const keys = Object.keys(seen).sort();
    if (keys.length > 24) {
      keys.slice(0, keys.length - 24).forEach(k => delete seen[k]);
    }
    Storage.set(MOTIVATION_KEY, seen);

    return eligible[Math.floor(Math.random() * eligible.length)];
  }

  function shouldShowLoginMessage(empId) {
    const seen = Storage.get(MOTIVATION_KEY) || {};
    const today = new Date().toISOString().slice(0, 10);
    const loginKey = `login_${empId}_${today}`;
    if (seen[loginKey]) return false;
    seen[loginKey] = true;
    Storage.set(MOTIVATION_KEY, seen);
    return true;
  }

  /* ------------------------------------------
     REWARDS / PRIZES
  ------------------------------------------ */
  const REWARDS_KEY = 'metas_rewards';
  const REWARD_CATALOG_KEY = 'metas_reward_catalog';

  const DEFAULT_REWARD_CATALOG = [
    { id: 'rw_lanche', nome: 'Vale Lanche R$20', descricao: 'Vale para lanche no valor de R$20', icone: '🍔', pontos: 100, tipo: 'vale', ativo: true },
    { id: 'rw_sair_cedo', nome: 'Sair 1h Mais Cedo', descricao: 'Pode sair 1 hora mais cedo em um dia à escolha', icone: '🕐', pontos: 200, tipo: 'beneficio', ativo: true },
    { id: 'rw_folga', nome: 'Folga Extra', descricao: 'Um dia de folga extra no mês', icone: '🏖️', pontos: 500, tipo: 'beneficio', ativo: true },
    { id: 'rw_bonus_50', nome: 'Bônus R$50', descricao: 'Bônus em dinheiro de R$50', icone: '💵', pontos: 300, tipo: 'bonus', ativo: true },
    { id: 'rw_bonus_100', nome: 'Bônus R$100', descricao: 'Bônus em dinheiro de R$100', icone: '💰', pontos: 500, tipo: 'bonus', ativo: true },
    { id: 'rw_bonus_300', nome: 'Bônus R$300', descricao: 'Bônus em dinheiro de R$300', icone: '🏆', pontos: 1000, tipo: 'bonus', ativo: true },
    { id: 'rw_produto', nome: 'Produto Grátis', descricao: 'Escolha um produto da loja como presente', icone: '🎁', pontos: 150, tipo: 'vale', ativo: true },
    { id: 'rw_almoco', nome: 'Almoço Especial', descricao: 'Vale almoço em restaurante até R$40', icone: '🍽️', pontos: 250, tipo: 'vale', ativo: true },
    { id: 'rw_camiseta', nome: 'Camiseta Exclusiva', descricao: 'Camiseta exclusiva do Clube do Natural', icone: '👕', pontos: 350, tipo: 'presente', ativo: false },
    { id: 'rw_curso', nome: 'Curso Online', descricao: 'Acesso a um curso online pago pela empresa', icone: '📚', pontos: 800, tipo: 'desenvolvimento', ativo: false },
  ];

  function loadRewardCatalog() {
    return Storage.get(REWARD_CATALOG_KEY) || [...DEFAULT_REWARD_CATALOG];
  }

  function saveRewardCatalog(catalog) {
    Storage.set(REWARD_CATALOG_KEY, catalog);
  }

  function loadRewards() {
    return Storage.get(REWARDS_KEY) || [];
  }

  function saveRewards(rewards) {
    Storage.set(REWARDS_KEY, rewards);
  }

  function redeemReward(empId, rewardId) {
    const catalog = loadRewardCatalog();
    const reward = catalog.find(r => r.id === rewardId && r.ativo);
    if (!reward) {
      Toast.error('Recompensa não disponível.');
      return false;
    }

    // Check points
    const pts = typeof AdminMetas !== 'undefined' ? AdminMetas.getEmployeePoints(empId) : null;
    if (!pts || pts.total < reward.pontos) {
      Toast.error(`Pontos insuficientes. Você tem ${pts ? pts.total : 0}, precisa de ${reward.pontos}.`);
      return false;
    }

    const rewards = loadRewards();
    rewards.push({
      id: 'RWD-' + Date.now(),
      empId,
      rewardId: reward.id,
      rewardNome: reward.nome,
      rewardIcone: reward.icone,
      pontos: reward.pontos,
      status: 'pendente', // pendente | entregue
      requestedAt: new Date().toISOString(),
      deliveredAt: null,
      deliveredBy: null,
    });
    saveRewards(rewards);

    // Deduct points
    if (typeof AdminMetas !== 'undefined' && AdminMetas.addPoints) {
      AdminMetas.addPoints(empId, -reward.pontos, 'resgate', `Resgate: ${reward.nome}`);
    }

    Toast.success(`Resgate solicitado: ${reward.icone} ${reward.nome}`);
    return true;
  }

  function deliverReward(rewardRequestId) {
    const rewards = loadRewards();
    const rw = rewards.find(r => r.id === rewardRequestId);
    if (!rw) return false;
    rw.status = 'entregue';
    rw.deliveredAt = new Date().toISOString();
    rw.deliveredBy = AppState.get('user')?.nome || 'Admin';
    saveRewards(rewards);
    Toast.success('Recompensa marcada como entregue!');
    return true;
  }

  /* ------------------------------------------
     RENDER HELPERS
  ------------------------------------------ */

  // Attendance widget for employee view
  function renderAttendanceWidget(empId) {
    const today = getEmployeeTodayRecord(empId);
    const stats = getAttendanceStats(empId, 30);

    let statusHtml = '';
    if (!today || !today.clockIn) {
      statusHtml = `
        <div style="text-align:center;padding:16px;">
          <div style="font-size:48px;margin-bottom:8px;">📍</div>
          <p style="color:#666;margin-bottom:12px;">Registre sua entrada ao chegar na loja</p>
          <button class="btn btn--primary btn--lg" onclick="MetasExtra.clockIn('${empId}', function(){ AdminMetas.render(); })">
            🟢 Bater Entrada
          </button>
        </div>
      `;
    } else if (!today.clockOut) {
      const clockInTime = new Date(today.clockIn).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      statusHtml = `
        <div style="text-align:center;padding:16px;">
          <div style="font-size:48px;margin-bottom:8px;">✅</div>
          <p style="color:#10B981;font-weight:600;margin-bottom:4px;">Entrada registrada às ${clockInTime}</p>
          <p style="color:#666;font-size:13px;margin-bottom:12px;">${today.storeName} (${today.distanceMeters}m)</p>
          <button class="btn btn--lg" style="background:#EF4444;color:#fff;border:none;" onclick="MetasExtra.clockOut('${empId}', function(){ AdminMetas.render(); })">
            🔴 Bater Saída
          </button>
        </div>
      `;
    } else {
      const clockInTime = new Date(today.clockIn).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const clockOutTime = new Date(today.clockOut).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      statusHtml = `
        <div style="text-align:center;padding:16px;">
          <div style="font-size:48px;margin-bottom:8px;">🏁</div>
          <p style="color:#1B4332;font-weight:600;">Turno finalizado</p>
          <p style="color:#666;font-size:13px;">${clockInTime} → ${clockOutTime} (${today.hoursWorked}h)</p>
          <p style="color:#666;font-size:12px;">${today.storeName}</p>
        </div>
      `;
    }

    return `
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:20px;">
        <h3 style="margin:0 0 8px;font-size:15px;color:#1B4332;">📍 Ponto Eletrônico</h3>
        ${statusHtml}
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid #f3f4f6;">
          <div style="text-align:center;">
            <div style="font-size:20px;font-weight:700;color:#1B4332;">${stats.totalDays}</div>
            <div style="font-size:11px;color:#666;">Dias (30d)</div>
          </div>
          <div style="text-align:center;">
            <div style="font-size:20px;font-weight:700;color:#1B4332;">${stats.avgHours}h</div>
            <div style="font-size:11px;color:#666;">Média/dia</div>
          </div>
          <div style="text-align:center;">
            <div style="font-size:20px;font-weight:700;color:#1B4332;">${stats.totalHours}h</div>
            <div style="font-size:11px;color:#666;">Total horas</div>
          </div>
          <div style="text-align:center;">
            <div style="font-size:20px;font-weight:700;color:${stats.lateDays > 0 ? '#EF4444' : '#10B981'};">${stats.lateDays}</div>
            <div style="font-size:11px;color:#666;">Atrasos</div>
          </div>
        </div>
      </div>
    `;
  }

  // Tasks widget for employee view
  function renderTasksWidget(empId) {
    const tasks = initDailyTasks(empId);
    const storeTasks = tasks.filter(t => t.category === 'loja');
    const marketingTasks = tasks.filter(t => t.category === 'marketing');
    const salesTasks = tasks.filter(t => t.category === 'vendas');
    const doneCount = tasks.filter(t => t.done).length;
    const totalCount = tasks.length;
    const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

    function renderTaskList(list) {
      return list.map(t => {
        const doneTime = t.doneAt ? new Date(t.doneAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
        const proofBadge = t.requireProof && !t.done ? '<span style="font-size:9px;background:#FEF3C7;color:#92400E;padding:1px 6px;border-radius:4px;font-weight:600;">PROVA</span>' : '';
        const proofLink = t.done && t.proofLink ? `<a href="${t.proofLink}" target="_blank" rel="noopener" style="font-size:10px;color:#2D6A4F;text-decoration:underline;display:block;margin-top:2px;" onclick="event.stopPropagation()">Ver prova</a>` : '';
        return `
          <div style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;background:${t.done ? '#f0fdf4' : '#fff'};border:1px solid ${t.done ? '#bbf7d0' : '#e5e7eb'};cursor:pointer;"
               onclick="MetasExtra.toggleTask('${t.id}', '${empId}')">
            <div style="width:24px;height:24px;border-radius:6px;border:2px solid ${t.done ? '#10B981' : '#d1d5db'};background:${t.done ? '#10B981' : '#fff'};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              ${t.done ? '<span style="color:#fff;font-size:14px;">✓</span>' : ''}
            </div>
            <span style="font-size:16px;flex-shrink:0;">${t.icon}</span>
            <div style="flex:1;min-width:0;">
              <span style="font-size:13px;color:${t.done ? '#6b7280' : '#1B4332'};${t.done ? 'text-decoration:line-through;' : ''}">${t.label}</span> ${proofBadge}
              ${proofLink}
            </div>
            ${t.done ? `<span style="font-size:11px;color:#10B981;font-weight:600;white-space:nowrap;">+${t.points} · ${doneTime}</span>` : `<span style="font-size:11px;color:#999;white-space:nowrap;">+${t.points} pts</span>`}
          </div>
        `;
      }).join('');
    }

    return `
      <div data-widget="tasks" style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:20px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <h3 style="margin:0;font-size:15px;color:#1B4332;">📋 Tarefas do Dia</h3>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:13px;color:#666;">${doneCount}/${totalCount}</span>
            <div style="background:#e5e7eb;border-radius:6px;height:8px;width:60px;overflow:hidden;">
              <div style="background:${pct >= 100 ? '#10B981' : pct >= 50 ? '#F59E0B' : '#EF4444'};height:100%;width:${pct}%;border-radius:6px;"></div>
            </div>
            <span style="font-size:12px;font-weight:600;color:${pct >= 100 ? '#10B981' : pct >= 50 ? '#F59E0B' : '#EF4444'};">${pct}%</span>
          </div>
        </div>

        <div style="margin-bottom:12px;">
          <div style="font-size:12px;font-weight:700;color:#666;text-transform:uppercase;margin-bottom:8px;">🏪 Tarefas da Loja</div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${renderTaskList(storeTasks)}
          </div>
        </div>

        <div style="margin-bottom:12px;">
          <div style="font-size:12px;font-weight:700;color:#666;text-transform:uppercase;margin-bottom:8px;">📱 Marketing & Redes</div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${renderTaskList(marketingTasks)}
          </div>
        </div>

        ${salesTasks.length > 0 ? `
        <div>
          <div style="font-size:12px;font-weight:700;color:#666;text-transform:uppercase;margin-bottom:8px;">💰 Vendas & Assinaturas</div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${renderTaskList(salesTasks)}
          </div>
        </div>
        ` : ''}
      </div>
    `;
  }

  // Rewards widget for employee view
  function renderRewardsWidget(empId) {
    const catalog = loadRewardCatalog().filter(r => r.ativo);
    const myRewards = loadRewards().filter(r => r.empId === empId);
    const pts = typeof AdminMetas !== 'undefined' ? AdminMetas.getEmployeePoints(empId) : { total: 0 };

    let html = `
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:20px;">
        <h3 style="margin:0 0 12px;font-size:15px;color:#1B4332;">🎁 Recompensas Disponíveis</h3>
        <p style="font-size:13px;color:#666;margin-bottom:12px;">Seus pontos: <strong style="color:#1B4332;">${pts.total}</strong></p>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;">
    `;

    catalog.forEach(r => {
      const canRedeem = pts.total >= r.pontos;
      html += `
        <div style="border:1px solid ${canRedeem ? '#bbf7d0' : '#e5e7eb'};border-radius:10px;padding:12px;text-align:center;${canRedeem ? 'background:#f0fdf4;cursor:pointer;' : 'background:#f9fafb;opacity:0.6;'}"
             ${canRedeem ? `onclick="MetasExtra.redeemReward('${empId}', '${r.id}')"` : ''}>
          <div style="font-size:28px;margin-bottom:4px;">${r.icone}</div>
          <div style="font-weight:600;font-size:12px;color:#1B4332;margin-bottom:2px;">${r.nome}</div>
          <div style="font-size:11px;color:#666;">${r.pontos} pts</div>
          ${canRedeem ? '<div style="font-size:10px;color:#10B981;font-weight:600;margin-top:4px;">Resgatar!</div>' : ''}
        </div>
      `;
    });

    html += '</div>';

    // My redeemed rewards
    if (myRewards.length > 0) {
      html += '<h4 style="margin:16px 0 8px;font-size:14px;color:#1B4332;">Meus Resgates</h4>';
      html += '<div style="display:flex;flex-direction:column;gap:6px;">';
      myRewards.slice(-10).reverse().forEach(r => {
        const date = new Date(r.requestedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        const statusColor = r.status === 'entregue' ? '#10B981' : '#F59E0B';
        const statusLabel = r.status === 'entregue' ? 'Entregue' : 'Pendente';
        html += `
          <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;background:#f9fafb;">
            <span>${r.rewardIcone}</span>
            <span style="flex:1;font-size:13px;">${r.rewardNome}</span>
            <span style="font-size:12px;color:#999;">${date}</span>
            <span style="font-size:11px;padding:2px 8px;border-radius:10px;background:${statusColor}22;color:${statusColor};font-weight:600;">${statusLabel}</span>
          </div>
        `;
      });
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  // Motivation banner
  function renderMotivationBanner(empId) {
    if (!shouldShowLoginMessage(empId)) return '';
    const msg = getLoginMessage();
    return `
      <div id="motivation-banner" style="background:linear-gradient(135deg,#1B4332,#2D6A4F);color:#fff;border-radius:12px;padding:20px;margin-bottom:20px;position:relative;overflow:hidden;">
        <button onclick="document.getElementById('motivation-banner').style.display='none'" style="position:absolute;top:8px;right:12px;background:none;border:none;color:rgba(255,255,255,0.6);font-size:18px;cursor:pointer;">✕</button>
        <div style="display:flex;align-items:center;gap:12px;">
          <span style="font-size:40px;">${msg.icon}</span>
          <div>
            <div style="font-size:18px;font-weight:700;">${msg.text}</div>
            <div style="font-size:13px;opacity:0.7;margin-top:4px;">Vamos fazer deste dia incrível!</div>
          </div>
        </div>
      </div>
    `;
  }

  // Periodic motivation toast (call from setInterval)
  function checkPeriodicMotivation() {
    const msg = getDuringMessage();
    if (msg && typeof Toast !== 'undefined') {
      Toast.info(`${msg.icon} ${msg.text}`);
    }
  }

  /* ------------------------------------------
     ADMIN: ATTENDANCE REPORT
  ------------------------------------------ */
  function renderAdminAttendanceReport(empId) {
    const history = getAttendanceHistory(empId, 30).reverse();
    const stats = getAttendanceStats(empId, 30);

    let html = `
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:20px;">
        <h3 style="margin:0 0 12px;font-size:15px;color:#1B4332;">📍 Registro de Ponto (30 dias)</h3>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:16px;">
          <div style="text-align:center;padding:8px;background:#f0fdf4;border-radius:8px;">
            <div style="font-size:20px;font-weight:700;color:#1B4332;">${stats.totalDays}</div>
            <div style="font-size:11px;color:#666;">Dias</div>
          </div>
          <div style="text-align:center;padding:8px;background:#f0fdf4;border-radius:8px;">
            <div style="font-size:20px;font-weight:700;color:#1B4332;">${stats.completeDays}</div>
            <div style="font-size:11px;color:#666;">Completos</div>
          </div>
          <div style="text-align:center;padding:8px;background:#f0fdf4;border-radius:8px;">
            <div style="font-size:20px;font-weight:700;color:#1B4332;">${stats.totalHours}h</div>
            <div style="font-size:11px;color:#666;">Total</div>
          </div>
          <div style="text-align:center;padding:8px;background:#f0fdf4;border-radius:8px;">
            <div style="font-size:20px;font-weight:700;color:#1B4332;">${stats.avgHours}h</div>
            <div style="font-size:11px;color:#666;">Média</div>
          </div>
          <div style="text-align:center;padding:8px;background:${stats.lateDays > 2 ? '#fef2f2' : '#f0fdf4'};border-radius:8px;">
            <div style="font-size:20px;font-weight:700;color:${stats.lateDays > 2 ? '#EF4444' : '#1B4332'};">${stats.lateDays}</div>
            <div style="font-size:11px;color:#666;">Atrasos</div>
          </div>
        </div>
    `;

    if (history.length > 0) {
      html += `
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:#f9fafb;">
              <th style="padding:8px;text-align:left;">Data</th>
              <th style="padding:8px;text-align:center;">Entrada</th>
              <th style="padding:8px;text-align:center;">Saída</th>
              <th style="padding:8px;text-align:center;">Horas</th>
              <th style="padding:8px;text-align:left;">Loja</th>
            </tr>
          </thead>
          <tbody>
      `;
      history.forEach(r => {
        const dateStr = new Date(r.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
        const inTime = r.clockIn ? new Date(r.clockIn).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
        const outTime = r.clockOut ? new Date(r.clockOut).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
        const hours = r.hoursWorked ? r.hoursWorked + 'h' : '—';
        html += `
          <tr style="border-top:1px solid #f3f4f6;">
            <td style="padding:8px;">${dateStr}</td>
            <td style="padding:8px;text-align:center;">${inTime}</td>
            <td style="padding:8px;text-align:center;">${outTime}</td>
            <td style="padding:8px;text-align:center;font-weight:600;">${hours}</td>
            <td style="padding:8px;">${r.storeName || '—'}</td>
          </tr>
        `;
      });
      html += '</tbody></table>';
    } else {
      html += '<p style="color:#999;font-size:13px;">Nenhum registro de ponto.</p>';
    }

    html += '</div>';
    return html;
  }

  // Admin: Task completion report
  function renderAdminTaskReport(empId) {
    const stats = getTaskStats(empId, 30);
    const tasks = loadTasks();
    const today = new Date().toISOString().slice(0, 10);
    const todayTasks = tasks.filter(t => t.empId === empId && t.date === today);
    const todayDone = todayTasks.filter(t => t.done).length;

    // Get last 7 days completion rates
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const dayTasks = tasks.filter(t => t.empId === empId && t.date === dateStr);
      const dayDone = dayTasks.filter(t => t.done).length;
      const dayTotal = dayTasks.length;
      last7.push({
        date: d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' }),
        done: dayDone,
        total: dayTotal,
        rate: dayTotal > 0 ? Math.round((dayDone / dayTotal) * 100) : 0,
      });
    }

    let html = `
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:20px;">
        <h3 style="margin:0 0 12px;font-size:15px;color:#1B4332;">📋 Tarefas (30 dias)</h3>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px;">
          <div style="text-align:center;padding:8px;background:#f0fdf4;border-radius:8px;">
            <div style="font-size:20px;font-weight:700;color:#1B4332;">${stats.done}/${stats.total}</div>
            <div style="font-size:11px;color:#666;">Tarefas Feitas</div>
          </div>
          <div style="text-align:center;padding:8px;background:${stats.rate >= 70 ? '#f0fdf4' : '#fef2f2'};border-radius:8px;">
            <div style="font-size:20px;font-weight:700;color:${stats.rate >= 70 ? '#10B981' : '#EF4444'};">${stats.rate}%</div>
            <div style="font-size:11px;color:#666;">Taxa</div>
          </div>
          <div style="text-align:center;padding:8px;background:#f0fdf4;border-radius:8px;">
            <div style="font-size:20px;font-weight:700;color:#1B4332;">${todayDone}/${todayTasks.length}</div>
            <div style="font-size:11px;color:#666;">Hoje</div>
          </div>
        </div>

        <div style="font-size:12px;font-weight:600;color:#666;margin-bottom:8px;">Últimos 7 dias:</div>
        <div style="display:flex;gap:4px;align-items:end;height:60px;margin-bottom:4px;">
          ${last7.map(d => `
            <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;">
              <div style="width:100%;background:#e5e7eb;border-radius:4px;height:50px;position:relative;overflow:hidden;">
                <div style="position:absolute;bottom:0;width:100%;height:${d.rate}%;background:${d.rate >= 70 ? '#10B981' : d.rate >= 40 ? '#F59E0B' : '#EF4444'};border-radius:4px;"></div>
              </div>
              <span style="font-size:10px;color:#999;">${d.date}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // Today's task detail
    if (todayTasks.length > 0) {
      html += '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:20px;">';
      html += '<h4 style="margin:0 0 8px;font-size:14px;color:#1B4332;">Tarefas de Hoje</h4>';
      html += '<div style="display:flex;flex-direction:column;gap:4px;">';
      todayTasks.forEach(t => {
        const time = t.doneAt ? new Date(t.doneAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
        html += `
          <div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:13px;">
            <span>${t.done ? '✅' : '⬜'}</span>
            <span style="${t.done ? 'text-decoration:line-through;color:#6b7280;' : 'color:#333;'}flex:1;">${t.icon} ${t.label}</span>
            ${time ? `<span style="font-size:11px;color:#10B981;">${time}</span>` : '<span style="font-size:11px;color:#EF4444;">Não feito</span>'}
          </div>
        `;
      });
      html += '</div></div>';
    }

    return html;
  }

  // Admin: Rewards report
  function renderAdminRewardsReport(empId) {
    const rewards = loadRewards();
    const empRewards = empId ? rewards.filter(r => r.empId === empId) : rewards;

    if (empRewards.length === 0) return '';

    let html = `
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:20px;">
        <h3 style="margin:0 0 12px;font-size:15px;color:#1B4332;">🎁 Resgates</h3>
        <div style="display:flex;flex-direction:column;gap:6px;">
    `;

    empRewards.slice(-10).reverse().forEach(r => {
      const date = new Date(r.requestedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      const isPending = r.status === 'pendente';
      html += `
        <div style="display:flex;align-items:center;gap:8px;padding:8px;border-radius:8px;background:#f9fafb;">
          <span style="font-size:20px;">${r.rewardIcone}</span>
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:600;color:#1B4332;">${r.rewardNome}</div>
            <div style="font-size:11px;color:#999;">${date} · ${r.pontos} pts</div>
          </div>
          ${isPending ? `
            <button class="btn btn--sm btn--primary" onclick="MetasExtra.deliverReward('${r.id}'); AdminMetas.render();">Entregar</button>
          ` : `
            <span style="font-size:11px;padding:2px 8px;border-radius:10px;background:#10B98122;color:#10B981;font-weight:600;">Entregue</span>
          `}
        </div>
      `;
    });

    html += '</div></div>';
    return html;
  }

  // Admin: Rewards catalog config
  function renderRewardsCatalogConfig() {
    const catalog = loadRewardCatalog();
    let html = `
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <h3 style="margin:0;font-size:16px;color:#1B4332;">🎁 Catálogo de Recompensas</h3>
          <button class="btn btn--sm btn--ghost" onclick="MetasExtra.showAddRewardModal()">+ Adicionar</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">
    `;

    catalog.forEach(r => {
      html += `
        <div style="display:flex;align-items:center;gap:12px;padding:10px;border-radius:8px;background:#f9fafb;">
          <span style="font-size:24px;">${r.icone}</span>
          <div style="flex:1;">
            <div style="font-weight:600;font-size:14px;color:#1B4332;">${r.nome}</div>
            <div style="font-size:12px;color:#666;">${r.descricao}</div>
          </div>
          <div style="text-align:center;min-width:60px;">
            <div style="font-weight:700;color:#1B4332;">${r.pontos}</div>
            <div style="font-size:10px;color:#999;">pontos</div>
          </div>
          <label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;">
            <input type="checkbox" ${r.ativo ? 'checked' : ''} onchange="MetasExtra.toggleRewardActive('${r.id}', this.checked)">
            Ativo
          </label>
        </div>
      `;
    });

    html += '</div></div>';
    return html;
  }

  // Admin: Task templates config
  function renderTaskTemplatesConfig() {
    const templates = loadTaskTemplates();
    let html = `
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <h3 style="margin:0;font-size:16px;color:#1B4332;">📋 Tarefas Diárias (Templates)</h3>
          <button class="btn btn--sm btn--ghost" onclick="MetasExtra.showAddTaskTemplateModal()">+ Adicionar</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;">
    `;

    templates.forEach((t, i) => {
      html += `
        <div style="display:flex;align-items:center;gap:8px;padding:8px;border-radius:8px;background:#f9fafb;">
          <span>${t.icon}</span>
          <span style="flex:1;font-size:13px;color:#333;">${t.label}</span>
          <span style="font-size:11px;padding:2px 8px;border-radius:10px;background:#e5e7eb;color:#666;">${t.category}</span>
          <span style="font-size:12px;font-weight:600;color:#1B4332;">+${t.points}</span>
          <button style="background:none;border:none;font-size:14px;cursor:pointer;color:#EF4444;" onclick="MetasExtra.removeTaskTemplate(${i})">✕</button>
        </div>
      `;
    });

    html += '</div></div>';
    return html;
  }

  /* ------------------------------------------
     MODALS
  ------------------------------------------ */
  function showAddRewardModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:24px;max-width:420px;width:100%;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
          <h3 style="margin:0;color:#1B4332;">🎁 Nova Recompensa</h3>
          <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:24px;cursor:pointer;color:#999;">✕</button>
        </div>
        <form id="add-reward-form">
          <div style="margin-bottom:12px;">
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Nome *</label>
            <input type="text" name="nome" required placeholder="Ex: Folga Extra" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;box-sizing:border-box;">
          </div>
          <div style="margin-bottom:12px;">
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Descrição</label>
            <input type="text" name="descricao" placeholder="Detalhes da recompensa" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;box-sizing:border-box;">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
            <div>
              <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Pontos *</label>
              <input type="number" name="pontos" required min="1" value="100" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;box-sizing:border-box;">
            </div>
            <div>
              <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Emoji</label>
              <input type="text" name="icone" value="🎁" maxlength="4" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;text-align:center;font-size:20px;box-sizing:border-box;">
            </div>
          </div>
          <div style="margin-bottom:16px;">
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Tipo</label>
            <select name="tipo" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;">
              <option value="beneficio">Benefício (folga, sair cedo)</option>
              <option value="bonus">Bônus em dinheiro</option>
              <option value="vale">Vale/Voucher</option>
              <option value="presente">Presente</option>
              <option value="desenvolvimento">Desenvolvimento</option>
            </select>
          </div>
          <button type="submit" class="btn btn--primary" style="width:100%;">Adicionar Recompensa</button>
        </form>
      </div>
    `;

    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    document.getElementById('add-reward-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      const catalog = loadRewardCatalog();
      catalog.push({
        id: 'rw_' + Date.now(),
        nome: f.nome.value.trim(),
        descricao: f.descricao.value.trim(),
        icone: f.icone.value || '🎁',
        pontos: parseInt(f.pontos.value),
        tipo: f.tipo.value,
        ativo: true,
      });
      saveRewardCatalog(catalog);
      Toast.success('Recompensa adicionada!');
      modal.remove();
      if (typeof AdminMetas !== 'undefined') AdminMetas.render();
    });
  }

  function showAddTaskTemplateModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:24px;max-width:420px;width:100%;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
          <h3 style="margin:0;color:#1B4332;">📋 Nova Tarefa Diária</h3>
          <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:24px;cursor:pointer;color:#999;">✕</button>
        </div>
        <form id="add-task-tpl-form">
          <div style="margin-bottom:12px;">
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Tarefa *</label>
            <input type="text" name="label" required placeholder="Ex: Limpar balcão da loja" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;box-sizing:border-box;">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px;">
            <div>
              <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Categoria</label>
              <select name="category" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;">
                <option value="loja">Loja</option>
                <option value="marketing">Marketing</option>
                <option value="vendas">Vendas</option>
              </select>
            </div>
            <div>
              <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Pontos</label>
              <input type="number" name="points" min="1" value="5" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;box-sizing:border-box;">
            </div>
            <div>
              <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;">Emoji</label>
              <input type="text" name="icon" value="📋" maxlength="4" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;text-align:center;font-size:20px;box-sizing:border-box;">
            </div>
          </div>
          <div style="margin-bottom:16px;">
            <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
              <input type="checkbox" name="requireProof" style="width:16px;height:16px;">
              Exige prova (link/foto) para validar
            </label>
          </div>
          <button type="submit" class="btn btn--primary" style="width:100%;">Adicionar Tarefa</button>
        </form>
      </div>
    `;

    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    document.getElementById('add-task-tpl-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      const templates = loadTaskTemplates();
      templates.push({
        id: 'tsk_' + Date.now(),
        category: f.category.value,
        label: f.label.value.trim(),
        points: parseInt(f.points.value) || 5,
        icon: f.icon.value || '📋',
        requireProof: f.requireProof.checked,
      });
      saveTaskTemplates(templates);
      Toast.success('Tarefa adicionada ao template!');
      modal.remove();
      if (typeof AdminMetas !== 'undefined') AdminMetas.render();
    });
  }

  /* ------------------------------------------
     UTILITY
  ------------------------------------------ */
  function toggleRewardActive(rewardId, active) {
    const catalog = loadRewardCatalog();
    const r = catalog.find(c => c.id === rewardId);
    if (r) {
      r.ativo = active;
      saveRewardCatalog(catalog);
      Toast.info(active ? 'Recompensa ativada' : 'Recompensa desativada');
    }
  }

  function removeTaskTemplate(index) {
    const templates = loadTaskTemplates();
    if (index >= 0 && index < templates.length) {
      templates.splice(index, 1);
      saveTaskTemplates(templates);
      Toast.info('Tarefa removida do template');
      if (typeof AdminMetas !== 'undefined') AdminMetas.render();
    }
  }

  function toggleTask(taskId, empId) {
    const tasks = loadTasks();
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    if (task.done) {
      undoTask(taskId);
      _refreshTasksUI(empId);
    } else if (task.requireProof) {
      _showProofModal(taskId, empId, task);
    } else {
      completeTask(taskId, empId);
      _refreshTasksUI(empId);
    }
  }

  function _refreshTasksUI(empId) {
    if (typeof AdminMetas !== 'undefined') AdminMetas.render();
    // Refresh PDV metas panel if open
    const pdvPanel = document.getElementById('metas-panel-body');
    if (pdvPanel && typeof MetasExtra !== 'undefined') {
      const tasksWidget = document.querySelector('[data-widget="tasks"]');
      if (tasksWidget) tasksWidget.outerHTML = '<div data-widget="tasks">' + renderTasksWidget(empId) + '</div>';
    }
  }

  function _showProofModal(taskId, empId, task) {
    let existing = document.getElementById('proof-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'proof-modal-overlay';
    overlay.innerHTML = `
      <style>
        #proof-modal-overlay{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:16px;}
        #proof-modal{background:#fff;border-radius:16px;max-width:420px;width:100%;padding:24px;box-shadow:0 12px 40px rgba(0,0,0,.2);}
        #proof-modal h3{margin:0 0 4px;font-size:17px;color:#1B4332;}
        #proof-modal .sub{font-size:13px;color:#666;margin-bottom:16px;}
        #proof-modal input{width:100%;padding:12px 14px;border:2px solid #e5e7eb;border-radius:10px;font-size:14px;outline:none;margin-bottom:12px;}
        #proof-modal input:focus{border-color:#2D6A4F;}
        #proof-modal .hint{font-size:11px;color:#999;margin-bottom:16px;line-height:1.4;}
        #proof-modal .btns{display:flex;gap:8px;justify-content:flex-end;}
        #proof-modal .btns button{padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;border:none;}
        #proof-modal .btn-cancel{background:#f3f4f6;color:#666;}
        #proof-modal .btn-confirm{background:#2D6A4F;color:#fff;}
        #proof-modal .btn-confirm:disabled{opacity:.5;cursor:not-allowed;}
      </style>
      <div id="proof-modal">
        <h3>${task.icon} ${task.label}</h3>
        <p class="sub">Cole o link como prova para validar a tarefa</p>
        <input type="url" id="proof-link-input" placeholder="https://instagram.com/stories/... ou link do post" autocomplete="off">
        <div class="hint">Cole o link do story, post, foto, avaliação ou print. Sem o link a tarefa não é validada.</div>
        <div class="btns">
          <button class="btn-cancel" onclick="document.getElementById('proof-modal-overlay').remove()">Cancelar</button>
          <button class="btn-confirm" id="proof-confirm-btn" disabled>Validar +${task.points} pts</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const input = document.getElementById('proof-link-input');
    const confirmBtn = document.getElementById('proof-confirm-btn');

    input.addEventListener('input', () => {
      confirmBtn.disabled = input.value.trim().length < 5;
    });
    input.focus();

    confirmBtn.addEventListener('click', () => {
      const link = input.value.trim();
      if (link.length < 5) return;
      // Save proof link
      const tasks = loadTasks();
      const t = tasks.find(x => x.id === taskId);
      if (t) { t.proofLink = link; saveTasks(tasks); }
      // Complete task
      completeTask(taskId, empId);
      overlay.remove();
      _refreshTasksUI(empId);
      if (typeof Toast !== 'undefined') Toast.success('Tarefa validada com prova! +' + task.points + ' pts');
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  /* ------------------------------------------
     PUBLIC API
  ------------------------------------------ */
  return {
    // Attendance
    clockIn,
    clockOut,
    getAttendanceHistory,
    getAttendanceStats,
    getEmployeeTodayRecord,

    // Tasks
    initDailyTasks,
    completeTask,
    toggleTask,
    getTaskStats,
    loadTaskTemplates,
    saveTaskTemplates,

    // Motivation
    getLoginMessage,
    getDuringMessage,
    checkPeriodicMotivation,
    shouldShowLoginMessage,

    // Rewards
    redeemReward,
    deliverReward,
    loadRewardCatalog,
    saveRewardCatalog,
    toggleRewardActive,
    removeTaskTemplate,

    // Render helpers
    renderAttendanceWidget,
    renderTasksWidget,
    renderRewardsWidget,
    renderMotivationBanner,
    renderAdminAttendanceReport,
    renderAdminTaskReport,
    renderAdminRewardsReport,
    renderRewardsCatalogConfig,
    renderTaskTemplatesConfig,

    // Modals
    showAddRewardModal,
    showAddTaskTemplateModal,
  };
})();
