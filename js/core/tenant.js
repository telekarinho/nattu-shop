/* ============================================
   Nattu Shop - Tenant / Subdomain Resolver
   ============================================ */

const TenantResolver = (() => {
  const PRIMARY_DOMAIN = 'nattu.shop';

  function getStores() {
    return Array.isArray(window.DataStores) ? window.DataStores : [];
  }

  function normalizeIdentifier(value) {
    return String(value || '').trim().toLowerCase();
  }

  function findStore(identifier, stores = getStores()) {
    const needle = normalizeIdentifier(identifier);
    if (!needle) return null;
    return stores.find(store => (
      normalizeIdentifier(store.id) === needle ||
      normalizeIdentifier(store.slug) === needle ||
      normalizeIdentifier(store.subdomain) === needle
    )) || null;
  }

  function getSubdomain(hostname = window.location.hostname) {
    const host = normalizeIdentifier(hostname);
    if (!host || host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      return '';
    }
    if (host === PRIMARY_DOMAIN || host === `www.${PRIMARY_DOMAIN}`) {
      return '';
    }
    const suffix = `.${PRIMARY_DOMAIN}`;
    if (!host.endsWith(suffix)) return '';
    return host.slice(0, -suffix.length);
  }

  function resolveCurrentStore(stores = getStores()) {
    const params = new URLSearchParams(window.location.search);
    const byQuery = findStore(params.get('loja'), stores);
    if (byQuery) {
      return { store: byQuery, source: 'query', locked: false };
    }

    const bySubdomain = findStore(getSubdomain(), stores);
    if (bySubdomain) {
      return { store: bySubdomain, source: 'subdomain', locked: true };
    }

    return { store: null, source: null, locked: false };
  }

  function getStoreUrl(store, path = '/catalogo.html', searchParams = null) {
    if (!store) return path;

    const hasAbsolutePath = /^https?:\/\//i.test(path);
    if (hasAbsolutePath) return path;

    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = store.subdomain
      ? new URL(`https://${store.subdomain}.${PRIMARY_DOMAIN}${normalizedPath}`)
      : new URL(normalizedPath, `https://${PRIMARY_DOMAIN}`);

    if (searchParams) {
      Object.entries(searchParams).forEach(([key, value]) => {
        if (value == null || value === '') return;
        url.searchParams.set(key, value);
      });
    }

    return url.toString();
  }

  function getStorePaymentSettings(store) {
    const base = {
      methods: {
        pix: true,
        mercadoPago: true,
        boleto: false,
        dinheiro: true,
      },
      pixKey: '',
      pixKeyType: 'email',
      pixReceiverName: store ? (store.razaoSocial || store.nome || 'Nattu Shop') : 'Nattu Shop',
      pixCity: store ? (store.cidade || 'SAO PAULO') : 'SAO PAULO',
      mercadoPagoEmail: '',
      statementDescriptor: store ? (store.nome || 'Nattu Shop') : 'Nattu Shop',
      instructions: '',
    };

    const storeSettings = store && store.paymentSettings ? store.paymentSettings : {};
    return {
      ...base,
      ...storeSettings,
      methods: {
        ...base.methods,
        ...(storeSettings.methods || {}),
      },
    };
  }

  return {
    PRIMARY_DOMAIN,
    getSubdomain,
    findStore,
    resolveCurrentStore,
    getStoreUrl,
    getStorePaymentSettings,
  };
})();
