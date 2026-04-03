/* ============================================
   Nattu Shop - Catalogo Marketplace
   ============================================ */

const CatalogoPage = {
  _allProducts: [],
  _selectedStore: 'todas',

  async init() {
    Search.init();
    Filters.init();
    this.initStoreSelector();
    this._allProducts = await CatalogLoader.getActiveProducts();
    this.filterAndRender();
  },

  initStoreSelector() {
    const params = new URLSearchParams(window.location.search);
    const storeFromUrl = params.get('loja');
    const select = document.getElementById('marketplace-store-select');
    if (!select) return;

    const options = ['<option value="todas">Todas as lojas do marketplace</option>']
      .concat((window.DataStores || []).map(store => `<option value="${store.id}">${store.nome}</option>`));
    select.innerHTML = options.join('');

    if (storeFromUrl && (window.DataStores || []).some(store => store.id === storeFromUrl)) {
      this._selectedStore = storeFromUrl;
      select.value = storeFromUrl;
    }

    select.addEventListener('change', () => {
      this._selectedStore = select.value || 'todas';
      const nextUrl = new URL(window.location.href);
      if (this._selectedStore === 'todas') nextUrl.searchParams.delete('loja');
      else nextUrl.searchParams.set('loja', this._selectedStore);
      window.history.replaceState({}, '', nextUrl);
      this.filterAndRender();
    });
  },

  getFilteredProducts() {
    let products = this._allProducts.slice();

    const category = AppState.get('currentCategory');
    if (category && category !== 'todos') {
      products = products.filter(p => p.categoria === category);
    }

    const query = AppState.get('searchQuery');
    if (query) {
      products = products.filter(p =>
        p.nome.toLowerCase().includes(query) ||
        (p.descricao && p.descricao.toLowerCase().includes(query)) ||
        (p.beneficios && p.beneficios.some(b => b.toLowerCase().includes(query)))
      );
    }

    const filters = AppState.get('filters') || {};
    if (filters.organico) products = products.filter(p => p.selos && p.selos.includes('organico'));
    if (filters.vegano) products = products.filter(p => p.selos && p.selos.includes('vegano'));
    if (filters.sem_gluten) products = products.filter(p => p.selos && p.selos.includes('sem_gluten'));
    if (filters.sem_lactose) products = products.filter(p => p.selos && p.selos.includes('sem_lactose'));
    if (filters.integral) products = products.filter(p => p.selos && p.selos.includes('integral'));
    if (filters.sem_acucar) products = products.filter(p => p.selos && p.selos.includes('sem_acucar'));

    if (this._selectedStore !== 'todas') {
      products = products
        .filter(product => product.estoque && (product.estoque[this._selectedStore] || 0) > 0)
        .map(product => {
          const store = (window.DataStores || []).find(item => item.id === this._selectedStore);
          return {
            ...product,
            _marketplaceStore: store ? {
              id: store.id,
              nome: store.nome,
              stock: product.estoque[this._selectedStore] || 0,
            } : null,
          };
        });
    } else {
      products = products.map(product => {
        const entries = Object.entries(product.estoque || {}).filter(([, qty]) => qty > 0);
        const firstAvailable = entries.find(([storeId]) =>
          (window.DataStores || []).some(store => store.id === storeId)
        );
        const store = firstAvailable
          ? (window.DataStores || []).find(item => item.id === firstAvailable[0])
          : null;
        return {
          ...product,
          _marketplaceStore: store ? {
            id: store.id,
            nome: store.nome,
            stock: firstAvailable[1],
          } : null,
        };
      });
    }

    const sortBy = AppState.get('sortBy');
    switch (sortBy) {
      case 'menor_preco':
        products.sort((a, b) => (a.variacoes?.[0]?.preco || 0) - (b.variacoes?.[0]?.preco || 0));
        break;
      case 'maior_preco':
        products.sort((a, b) => (b.variacoes?.[0]?.preco || 0) - (a.variacoes?.[0]?.preco || 0));
        break;
      case 'az':
        products.sort((a, b) => a.nome.localeCompare(b.nome));
        break;
      default:
        products.sort((a, b) => (b.destaque ? 1 : 0) - (a.destaque ? 1 : 0));
    }

    return products;
  },

  filterAndRender() {
    const products = this.getFilteredProducts();
    const grid = document.getElementById('product-grid');
    const count = document.getElementById('results-count');
    const storeMeta = document.getElementById('marketplace-store-meta');
    const selectedStore = (window.DataStores || []).find(store => store.id === this._selectedStore);

    if (grid) ProductCard.renderGrid(products, grid);
    if (count) {
      count.textContent = selectedStore
        ? `${products.length} produto${products.length !== 1 ? 's' : ''} em ${selectedStore.nome}`
        : `${products.length} produto${products.length !== 1 ? 's' : ''} no marketplace`;
    }
    if (storeMeta) {
      storeMeta.textContent = selectedStore
        ? `${selectedStore.nome} · Plano ${selectedStore.plano.toUpperCase()} · Mensalidade ${Utils.formatBRL(selectedStore.mensalidade)}`
        : 'Compare catalogos, disponibilidade e operacao das lojas parceiras.';
    }
  },
};

document.addEventListener('DOMContentLoaded', () => {
  Storage.init();
  AppState.restore();
  Toast.init();
  Cart.init();

  const hamburgerBtn = document.getElementById('btn-hamburger');
  const mainNav = document.getElementById('main-nav');
  if (hamburgerBtn && mainNav) {
    hamburgerBtn.addEventListener('click', () => {
      const isOpen = mainNav.classList.toggle('open');
      hamburgerBtn.textContent = isOpen ? 'X' : 'Menu';
      hamburgerBtn.setAttribute('aria-expanded', isOpen);
    });
    mainNav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        mainNav.classList.remove('open');
        hamburgerBtn.textContent = 'Menu';
        hamburgerBtn.setAttribute('aria-expanded', 'false');
      });
    });
    document.addEventListener('click', (e) => {
      if (!mainNav.contains(e.target) && !hamburgerBtn.contains(e.target)) {
        mainNav.classList.remove('open');
        hamburgerBtn.textContent = 'Menu';
        hamburgerBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  if (!Storage.getConsent()) {
    const banner = document.getElementById('cookie-banner');
    if (banner) banner.classList.add('active');
  }

  const acceptCookies = document.getElementById('cookie-accept');
  if (acceptCookies) {
    acceptCookies.addEventListener('click', () => {
      Storage.setConsent({ analytics: true, marketing: true });
      const b = document.getElementById('cookie-banner');
      if (b) b.classList.remove('active');
    });
  }

  const rejectCookies = document.getElementById('cookie-reject');
  if (rejectCookies) {
    rejectCookies.addEventListener('click', () => {
      Storage.setConsent({ analytics: false, marketing: false });
      const b = document.getElementById('cookie-banner');
      if (b) b.classList.remove('active');
    });
  }

  CatalogoPage.init();
});
