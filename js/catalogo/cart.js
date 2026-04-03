/* ============================================
   CLUBE DO NATURAL — Cart Sidebar
   Marketing: Free shipping bar, order bump
   ============================================ */

const FRETE_GRATIS_MIN = 89; // R$89 for free shipping

const Cart = {
  init() {
    this.bindEvents();
    AppState.on('cart', () => this.render());
    this.updateBadge();
  },

  bindEvents() {
    document.querySelectorAll('.cart-btn').forEach(btn => {
      btn.addEventListener('click', () => this.toggleSidebar());
    });

    const closeBtn = document.getElementById('cart-close');
    if (closeBtn) closeBtn.addEventListener('click', () => this.closeSidebar());

    const backdrop = document.getElementById('cart-backdrop');
    if (backdrop) backdrop.addEventListener('click', () => this.closeSidebar());

    const checkoutBtn = document.getElementById('cart-checkout-btn');
    if (checkoutBtn) {
      checkoutBtn.addEventListener('click', () => {
        if (AppState.getCartCount() === 0) {
          Toast.warning('Carrinho vazio!');
          return;
        }
        this.closeSidebar();
        if (typeof Checkout !== 'undefined') {
          Checkout.open();
        } else {
          window.location.href = 'checkout.html';
        }
      });
    }

    // Subscriptions button
    const subBtn = document.getElementById('btn-subscriptions');
    if (subBtn) {
      subBtn.addEventListener('click', () => {
        if (typeof Subscriptions !== 'undefined') {
          Subscriptions.togglePanel();
        }
      });
    }
  },

  toggleSidebar() {
    const sidebar = document.getElementById('cart-sidebar');
    if (sidebar && sidebar.classList.contains('open')) {
      this.closeSidebar();
    } else {
      this.openSidebar();
    }
  },

  openSidebar() {
    const sidebar = document.getElementById('cart-sidebar');
    const backdrop = document.getElementById('cart-backdrop');
    if (sidebar) sidebar.classList.add('open');
    if (backdrop) backdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
    this.render();
  },

  closeSidebar() {
    const sidebar = document.getElementById('cart-sidebar');
    const backdrop = document.getElementById('cart-backdrop');
    if (sidebar) sidebar.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
    document.body.style.overflow = '';
  },

  // Free shipping progress bar
  _freeShippingHTML(subtotal) {
    if (subtotal >= FRETE_GRATIS_MIN) {
      return `
        <div style="background:linear-gradient(135deg,#E8F5E9,#C8E6C9);padding:var(--space-3) var(--space-4);text-align:center;">
          <div style="font-size:var(--fs-sm);font-weight:var(--fw-bold);color:var(--verde-escuro);">🚚 Parabéns! Frete GRÁTIS!</div>
        </div>`;
    }

    const remaining = FRETE_GRATIS_MIN - subtotal;
    const progress = Math.min((subtotal / FRETE_GRATIS_MIN) * 100, 100);

    return `
      <div style="background:var(--cinza-100);padding:var(--space-3) var(--space-4);">
        <div style="font-size:var(--fs-xs);color:var(--cinza-700);margin-bottom:var(--space-2);text-align:center;">
          🚚 Falta <strong style="color:var(--verde-medio);">${Utils.formatBRL(remaining)}</strong> para <strong>frete GRÁTIS</strong>
        </div>
        <div style="height:6px;background:var(--cinza-200);border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${progress}%;background:linear-gradient(90deg,var(--verde-claro),var(--verde-medio));border-radius:3px;transition:width 400ms ease;"></div>
        </div>
      </div>`;
  },

  render() {
    const itemsContainer = document.getElementById('cart-items');
    const emptyState = document.getElementById('cart-empty');
    const footer = document.getElementById('cart-footer');
    const cart = AppState.get('cart');

    if (!itemsContainer) return;
    this.updateBadge();

    if (!cart || cart.length === 0) {
      itemsContainer.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      if (footer) footer.style.display = 'none';
      // Hide shipping bar when empty
      const shipBar = document.getElementById('cart-shipping-bar');
      if (shipBar) shipBar.innerHTML = '';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (footer) footer.style.display = 'block';

    itemsContainer.innerHTML = cart.map(item => `
      <div class="cart-sidebar__item" data-key="${item.key}">
        <div class="cart-sidebar__item-img"></div>
        <div class="cart-sidebar__item-info">
          <div class="cart-sidebar__item-name">
            ${item.nome}
            ${item.isSubscription ? '<span class="badge badge-recorrente" style="font-size:10px;margin-left:4px;">🔄</span>' : ''}
          </div>
          <div style="font-size:var(--fs-xs);color:var(--cinza-500);">${item.peso}</div>
          <div class="cart-sidebar__item-price">
            ${item.isSubscription && item.precoOriginal !== item.preco ?
              `<span style="text-decoration:line-through;color:var(--cinza-400);font-weight:400;font-size:var(--fs-xs);margin-right:4px;">${Utils.formatBRL(item.precoOriginal)}</span>` : ''
            }${Utils.formatBRL(item.preco)}
          </div>
          <div style="display:flex;align-items:center;gap:var(--space-2);margin-top:var(--space-1);">
            <button class="cart-qty-btn" data-key="${item.key}" data-delta="-1" style="width:28px;height:28px;border:1px solid var(--cinza-300);border-radius:var(--radius-sm);background:var(--cinza-100);cursor:pointer;font-size:var(--fs-base);">−</button>
            <span style="font-weight:var(--fw-semibold);min-width:20px;text-align:center;">${item.quantidade}</span>
            <button class="cart-qty-btn" data-key="${item.key}" data-delta="1" style="width:28px;height:28px;border:1px solid var(--cinza-300);border-radius:var(--radius-sm);background:var(--cinza-100);cursor:pointer;font-size:var(--fs-base);">+</button>
          </div>
        </div>
        <button class="cart-sidebar__item-remove" data-key="${item.key}" title="Remover">✕</button>
      </div>
    `).join('');

    // Total
    const subtotal = AppState.getCartTotal();
    const shippingCost = subtotal >= FRETE_GRATIS_MIN ? 0 : 12.90;
    const totalWithShipping = subtotal + shippingCost;
    const totalEl = document.getElementById('cart-total');
    if (totalEl) totalEl.textContent = Utils.formatBRL(totalWithShipping);

    // Shipping info
    const shippingInfo = document.getElementById('cart-shipping-info');
    if (shippingInfo) {
      if (subtotal > 0) {
        shippingInfo.style.display = 'block';
        shippingInfo.innerHTML = shippingCost === 0
          ? '<span style="color:var(--verde-claro);font-weight:var(--fw-bold);">&#9989; Frete gratis!</span>'
          : `Frete: ${Utils.formatBRL(shippingCost)}`;
      } else {
        shippingInfo.style.display = 'none';
      }
    }

    // Free shipping progress bar
    const shipBar = document.getElementById('cart-shipping-bar');
    if (shipBar) shipBar.innerHTML = this._freeShippingHTML(subtotal);

    // Subscription summary
    const subItems = AppState.getCartSubscriptionItems();
    const subSummary = document.getElementById('cart-sub-summary');
    if (subSummary) {
      if (subItems.length > 0) {
        const totalSavings = subItems.reduce((sum, item) =>
          sum + (item.precoOriginal - item.preco) * item.quantidade, 0
        );
        subSummary.innerHTML = `
          <div style="background:linear-gradient(135deg,#E8F5E9,#C8E6C9);padding:var(--space-3) var(--space-4);font-size:var(--fs-sm);">
            🔄 <strong>${subItems.length} item(ns) recorrente(s)</strong>
            <span style="color:var(--verde-medio);margin-left:var(--space-2);">Economia: ${Utils.formatBRL(totalSavings)}/entrega</span>
          </div>
        `;
        subSummary.style.display = 'block';
      } else {
        subSummary.style.display = 'none';
      }
    }

    // Bind events
    itemsContainer.querySelectorAll('.cart-qty-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        AppState.updateCartQty(btn.dataset.key, parseInt(btn.dataset.delta));
      });
    });

    itemsContainer.querySelectorAll('.cart-sidebar__item-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        AppState.removeFromCart(btn.dataset.key);
        Toast.info('Item removido do carrinho');
      });
    });
  },

  updateBadge() {
    const count = AppState.getCartCount();
    document.querySelectorAll('.cart-badge').forEach(badge => {
      if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    });
  },
};
