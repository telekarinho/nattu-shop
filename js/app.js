/* ============================================
   CLUBE DO NATURAL — App Bootstrap
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  // Init storage
  Storage.init();
  AppState.restore();
  Toast.init();

  // Init cart on all pages
  Cart.init();

  // Init checkout & subscriptions
  if (typeof Checkout !== 'undefined') Checkout.init();
  if (typeof Subscriptions !== 'undefined') Subscriptions.init();

  // === Hamburger Menu Toggle ===
  const hamburgerBtn = document.getElementById('btn-hamburger');
  const mainNav = document.getElementById('main-nav');
  if (hamburgerBtn && mainNav) {
    hamburgerBtn.addEventListener('click', () => {
      const isOpen = mainNav.classList.toggle('open');
      hamburgerBtn.textContent = isOpen ? '✕' : '☰';
      hamburgerBtn.setAttribute('aria-expanded', isOpen);
    });

    // Close menu when clicking a link
    mainNav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        mainNav.classList.remove('open');
        hamburgerBtn.textContent = '☰';
        hamburgerBtn.setAttribute('aria-expanded', 'false');
      });
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!mainNav.contains(e.target) && !hamburgerBtn.contains(e.target)) {
        mainNav.classList.remove('open');
        hamburgerBtn.textContent = '☰';
        hamburgerBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // LGPD Cookie Banner
  if (!Storage.getConsent()) {
    const banner = document.getElementById('cookie-banner');
    if (banner) banner.classList.add('active');
  }

  const acceptCookies = document.getElementById('cookie-accept');
  if (acceptCookies) {
    acceptCookies.addEventListener('click', () => {
      Storage.setConsent({ analytics: true, marketing: true });
      const banner = document.getElementById('cookie-banner');
      if (banner) banner.classList.remove('active');
    });
  }

  const rejectCookies = document.getElementById('cookie-reject');
  if (rejectCookies) {
    rejectCookies.addEventListener('click', () => {
      Storage.setConsent({ analytics: false, marketing: false });
      const banner = document.getElementById('cookie-banner');
      if (banner) banner.classList.remove('active');
    });
  }

  // Render featured products on landing page (async — Firestore first, fallback to DataProducts)
  const featuredContainer = document.getElementById('featured-products');
  if (featuredContainer) {
    (async () => {
      try {
        const featured = await CatalogLoader.getFeaturedProducts(8);
        featured.forEach(product => {
          const card = ProductCard.render(product);
          featuredContainer.appendChild(card);
        });
      } catch (err) {
        console.warn('[App] Featured products load failed, using DataProducts:', err.message);
        const featured = DataProducts.filter(p => p.destaque && p.ativo).slice(0, 8);
        featured.forEach(product => {
          const card = ProductCard.render(product);
          featuredContainer.appendChild(card);
        });
      }
    })();
  }

  // PWA install prompt
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    setTimeout(() => {
      const installBtn = document.getElementById('pwa-install-btn');
      if (installBtn) {
        installBtn.style.display = 'inline-flex';
        installBtn.addEventListener('click', async () => {
          if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') Toast.success('App instalado com sucesso!');
            deferredPrompt = null;
            installBtn.style.display = 'none';
          }
        });
      }
    }, 10000);
  });

  // Register Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
});
