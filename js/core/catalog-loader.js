/* ============================================
   CLUBE DO NATURAL — Catalog Data Loader
   Tries Firestore first, falls back to DataProducts.
   Used by public pages (catalogo, landing, checkout).
   ============================================ */

const CatalogLoader = (() => {
  'use strict';

  let _products = null; // cached after first load
  let _loading = null;  // promise dedup

  /**
   * Load products from Firestore (if available) or DataProducts fallback.
   * Returns array of product objects with `ativo: true`.
   * Caches result so subsequent calls are instant.
   */
  async function loadProducts() {
    if (_products) return _products;
    if (_loading) return _loading;

    _loading = _doLoad();
    _products = await _loading;
    _loading = null;
    return _products;
  }

  async function _doLoad() {
    // Try Firestore
    try {
      if (typeof FirestoreService !== 'undefined') {
        if (!FirestoreService.ready) {
          FirestoreService.init();
        }
        const products = await FirestoreService.Products.getAll();
        if (products && products.length > 0) {
          console.log('[CatalogLoader] Loaded', products.length, 'products from Firestore');
          return products;
        }
      }
    } catch (err) {
      console.warn('[CatalogLoader] Firestore failed, using fallback:', err.message);
    }

    // Fallback to static DataProducts
    if (typeof DataProducts !== 'undefined' && DataProducts.length > 0) {
      console.log('[CatalogLoader] Using DataProducts fallback (' + DataProducts.length + ' products)');
      return DataProducts;
    }

    console.warn('[CatalogLoader] No product data available');
    return [];
  }

  /**
   * Get active products (filtered by ativo flag).
   */
  async function getActiveProducts() {
    const all = await loadProducts();
    return all.filter(p => p.ativo !== false);
  }

  /**
   * Get featured products (destaque + ativo).
   */
  async function getFeaturedProducts(limit = 8) {
    const active = await getActiveProducts();
    return active.filter(p => p.destaque).slice(0, limit);
  }

  /**
   * Force reload from source (bypasses cache).
   */
  function invalidate() {
    _products = null;
    _loading = null;
  }

  /**
   * Find a product by ID from cache (sync).
   * Returns null if not loaded yet — call loadProducts() first.
   */
  function findById(id) {
    if (!_products) return null;
    return _products.find(p => p.id === id || p._id === id) || null;
  }

  return {
    loadProducts,
    getActiveProducts,
    getFeaturedProducts,
    findById,
    invalidate,
  };
})();
