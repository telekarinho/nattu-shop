/* ============================================
   CLUBE DO NATURAL — Auth Simples
   Login por celular + senha, perfis de acesso
   ============================================ */

const Auth = (() => {
  const PERMISSIONS = {
    dono: ['dashboard', 'pedidos', 'assinaturas', 'estoque', 'caixa', 'nf', 'funcionarios', 'produtos', 'lojas', 'clientes', 'relatorios', 'config', 'usuarios'],
    gerente: ['dashboard', 'pedidos', 'assinaturas', 'estoque', 'caixa', 'nf', 'produtos', 'clientes', 'relatorios'],
    atendente: ['pedidos', 'assinaturas'],
    caixa: ['pedidos', 'caixa', 'nf'],
    estoquista: ['estoque', 'produtos'],
    motoboy: ['pedidos'],
  };

  return {
    login(celular, senha) {
      // Em produção: chamaria API. Agora: checa nos dados mockados
      const employee = DataEmployees.find(e =>
        e.celular.replace(/\D/g, '') === celular.replace(/\D/g, '') &&
        e.senha === senha &&
        e.status === 'ativo'
      );

      if (!employee) return { success: false, error: 'Celular ou senha incorretos' };

      const user = {
        id: employee.id,
        nome: employee.nome,
        cargo: employee.cargo,
        loja: employee.loja,
        permissions: PERMISSIONS[employee.cargo] || [],
      };

      Storage.set('user', user);
      AppState.set('user', user);
      AppState.set('isAdmin', true);

      return { success: true, user };
    },

    logout() {
      Storage.remove('user');
      AppState.set('user', null);
      AppState.set('isAdmin', false);
      window.location.hash = '#/';
    },

    isLoggedIn() {
      return !!AppState.get('user');
    },

    hasPermission(page) {
      const user = AppState.get('user');
      if (!user) return false;
      return user.permissions.includes(page);
    },

    getUser() {
      return AppState.get('user');
    },

    requireAuth(page) {
      if (!this.isLoggedIn()) {
        window.location.hash = '#/login';
        return false;
      }
      if (page && !this.hasPermission(page)) {
        Toast.show('Sem permissão para acessar esta página', 'error');
        return false;
      }
      return true;
    },
  };
})();
