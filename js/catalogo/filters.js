/* ============================================
   CLUBE DO NATURAL — Filters (Category + Selos)
   Selectors match catalogo.css classes
   ============================================ */

const Filters = {
  init() {
    // Category bar pills
    document.querySelectorAll('.category-bar__pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.category-bar__pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        AppState.set('currentCategory', pill.dataset.category);
        CatalogoPage.filterAndRender();
      });
    });

    // Selo filter pills
    document.querySelectorAll('.search-section__filter-pill').forEach(toggle => {
      toggle.addEventListener('click', () => {
        toggle.classList.toggle('active');
        const filters = AppState.get('filters') || {};
        const selo = toggle.dataset.selo;
        filters[selo] = !filters[selo];
        AppState.set('filters', { ...filters });
        CatalogoPage.filterAndRender();
      });
    });

    // Check URL params for initial category
    const urlParams = new URLSearchParams(window.location.search);
    const cat = urlParams.get('cat');
    if (cat) {
      AppState.set('currentCategory', cat);
      document.querySelectorAll('.category-bar__pill').forEach(p => {
        p.classList.toggle('active', p.dataset.category === cat);
      });
    }
  },
};
