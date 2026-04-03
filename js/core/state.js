/* ============================================
   CLUBE DO NATURAL — Estado Global Reativo
   Proxy-based state management
   ============================================ */

const AppState = (() => {
  const listeners = new Map();

  const state = {
    // Carrinho
    cart: [],
    cartOpen: false,

    // Catálogo
    currentCategory: 'todos',
    searchQuery: '',
    filters: {
      organico: false,
      vegano: false,
      semGluten: false,
      integral: false,
    },
    sortBy: 'relevancia', // relevancia | menor-preco | maior-preco | a-z
    selectedProduct: null,

    // Checkout
    checkoutStep: 1,
    checkoutData: {
      cliente: { nome: '', celular: '', cpf: '', email: '' },
      loja: null,
      entrega: { tipo: 'retirada', endereco: '', bairro: '', taxa: 0 },
      pagamento: { tipo: 'pix' },
    },

    // Assinaturas (cliente)
    subscriptions: [],

    // Auth
    user: null,
    isAdmin: false,

    // Admin
    activeAdminPage: 'dashboard',
    userStoreId: null,

    // UI
    loading: false,
    toasts: [],
  };

  function createReactiveState(obj) {
    return new Proxy(obj, {
      set(target, key, value) {
        const old = target[key];
        target[key] = value;
        if (old !== value) {
          notify(key, value, old);
        }
        return true;
      },
    });
  }

  function notify(key, value, old) {
    const callbacks = listeners.get(key) || [];
    callbacks.forEach(cb => {
      try { cb(value, old, key); } catch(e) { console.error('State listener error:', e); }
    });
    // Wildcard listeners
    const wildcards = listeners.get('*') || [];
    wildcards.forEach(cb => {
      try { cb(value, old, key); } catch(e) { console.error('State listener error:', e); }
    });
  }

  const reactiveState = createReactiveState(state);

  return {
    get(key) {
      return reactiveState[key];
    },

    set(key, value) {
      reactiveState[key] = value;
    },

    // Subscribe to state changes
    on(key, callback) {
      if (!listeners.has(key)) listeners.set(key, []);
      listeners.get(key).push(callback);
      return () => {
        const cbs = listeners.get(key);
        const idx = cbs.indexOf(callback);
        if (idx > -1) cbs.splice(idx, 1);
      };
    },

    // Cart helpers
    addToCart(product, variacao, quantidade = 1, isSubscription = false, frequency = null) {
      const cart = [...reactiveState.cart];
      const key = `${product.id}-${variacao.peso}-${isSubscription ? 'sub' : 'avulso'}`;
      const existing = cart.find(item => item.key === key);

      if (existing) {
        existing.quantidade += quantidade;
      } else {
        cart.push({
          key,
          productId: product.id,
          nome: product.nome,
          imagem: product.imagem,
          peso: variacao.peso,
          preco: isSubscription && product.recorrencia
            ? variacao.preco * (1 - product.recorrencia.descontoPercent / 100)
            : variacao.preco,
          precoOriginal: variacao.preco,
          quantidade,
          isSubscription,
          frequency,
          selos: product.selos,
        });
      }

      reactiveState.cart = cart;
      Storage.set('cart', cart);
    },

    removeFromCart(key) {
      const cart = reactiveState.cart.filter(item => item.key !== key);
      reactiveState.cart = cart;
      Storage.set('cart', cart);
    },

    updateCartQty(key, delta) {
      const cart = [...reactiveState.cart];
      const item = cart.find(i => i.key === key);
      if (!item) return;

      item.quantidade += delta;
      if (item.quantidade <= 0) {
        reactiveState.cart = cart.filter(i => i.key !== key);
      } else {
        reactiveState.cart = cart;
      }
      Storage.set('cart', reactiveState.cart);
    },

    clearCart() {
      reactiveState.cart = [];
      Storage.set('cart', []);
    },

    getCartTotal() {
      return reactiveState.cart.reduce((sum, item) => sum + (item.preco * item.quantidade), 0);
    },

    getCartCount() {
      return reactiveState.cart.reduce((sum, item) => sum + item.quantidade, 0);
    },

    getCartSubscriptionItems() {
      return reactiveState.cart.filter(item => item.isSubscription);
    },

    // Restore from localStorage
    restore() {
      const savedCart = Storage.get('cart');
      if (savedCart) reactiveState.cart = savedCart;

      const savedSubs = Storage.get('subscriptions');
      if (savedSubs) reactiveState.subscriptions = savedSubs;

      const savedUser = Storage.get('user');
      if (savedUser) {
        reactiveState.user = savedUser;
        reactiveState.userStoreId = savedUser.storeId || reactiveState.userStoreId || null;
        reactiveState.isAdmin = ['dono', 'gerente', 'caixa', 'atendente', 'estoquista'].includes(savedUser.cargo);
      }
    },

    getUserStoreId() {
      return reactiveState.userStoreId || (reactiveState.user && reactiveState.user.storeId) || null;
    },

    isNetworkAdmin() {
      return !!reactiveState.user && reactiveState.user.cargo === 'dono' && !this.getUserStoreId();
    },

    getAccessibleStoreIds() {
      if (this.isNetworkAdmin()) {
        return Array.isArray(window.DataStores) ? window.DataStores.map(store => store.id) : [];
      }
      const storeId = this.getUserStoreId();
      return storeId ? [storeId] : [];
    },

    canAccessStore(storeId) {
      if (!storeId || storeId === 'todas') return this.isNetworkAdmin();
      if (this.isNetworkAdmin()) return true;
      return this.getUserStoreId() === storeId;
    },
  };
})();
