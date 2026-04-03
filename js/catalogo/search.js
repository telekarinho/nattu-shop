/* ============================================
   CLUBE DO NATURAL — Search & Sort
   ============================================ */

const Search = {
  init() {
    const searchInput = document.getElementById('search-input');
    const sortSelect = document.getElementById('sort-select');

    if (searchInput) {
      searchInput.addEventListener('input', Utils.debounce(() => {
        AppState.set('searchQuery', searchInput.value.trim().toLowerCase());
        CatalogoPage.filterAndRender();
      }, 250));
    }

    if (sortSelect) {
      sortSelect.addEventListener('change', () => {
        AppState.set('sortBy', sortSelect.value);
        CatalogoPage.filterAndRender();
      });
    }
  },
};
