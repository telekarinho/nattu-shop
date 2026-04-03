/* ============================================
   Nattu Shop - Product Card Renderer
   ============================================ */

const ProductCard = {
  _placeholderMarkup(product) {
    const category = DataCategories.find(c => c.id === product.categoria);
    const icon = category ? category.icone : '🌿';
    return `
      <div class="product-card__img-fallback" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;text-align:center;background:radial-gradient(circle at top, rgba(40,199,111,.18), rgba(19,51,38,.06));color:var(--verde-escuro);">
        <span style="font-size:2.2rem;line-height:1;margin-bottom:8px;">${icon}</span>
        <span style="font-size:var(--fs-sm);font-weight:var(--fw-bold);line-height:1.25;">${product.nome}</span>
      </div>
    `;
  },

  _salesCount(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = ((h << 5) - h) + id.charCodeAt(i);
    return 12 + Math.abs(h % 95);
  },

  render(product) {
    const defaultVariacao = product.variacoes[1] || product.variacoes[0];
    const hasRecurrence = product.recorrencia && product.recorrencia.elegivel;
    const category = DataCategories.find(c => c.id === product.categoria);
    const marketplaceStore = product._marketplaceStore || null;

    const selosHTML = product.selos.map(selo =>
      `<span class="badge badge-${selo}">${Utils.seloIcon(selo)} ${Utils.seloLabel(selo)}</span>`
    ).join('');

    let urgencyBadge = '';
    const totalStock = product.estoque
      ? Object.values(product.estoque).reduce((a, b) => a + b, 0) : 999;
    if (totalStock <= 15 && totalStock > 0) {
      urgencyBadge = `<span class="product-card__urgency product-card__urgency--low">Ultimas ${totalStock} un.</span>`;
    } else if (product.destaque) {
      urgencyBadge = `<span class="product-card__urgency product-card__urgency--hot">Mais vendido</span>`;
    }

    let recurrenceBadge = '';
    if (hasRecurrence) {
      recurrenceBadge = `<span class="product-card__recurrence">Assine -${product.recorrencia.descontoPercent}%</span>`;
    }

    let subscriptionPrice = '';
    if (hasRecurrence) {
      const savings = Utils.calcSubscriptionSavings(
        defaultVariacao.preco,
        product.recorrencia.descontoPercent,
        product.recorrencia.frequenciaSugerida
      );
      subscriptionPrice = `
        <span class="product-card__price-sub">
          ${Utils.formatBRL(savings.precoAssinatura)}/mes na assinatura
        </span>
      `;
    }

    let marketplaceBadge = '';
    if (marketplaceStore) {
      const stockLabel = Number.isFinite(marketplaceStore.stock)
        ? `Estoque ${marketplaceStore.stock}`
        : 'Disponivel';
      marketplaceBadge = `
        <div style="margin:0 0 var(--space-2);font-size:var(--fs-xs);font-weight:var(--fw-semibold);color:var(--verde-escuro);">
          Loja: ${marketplaceStore.nome} · ${stockLabel}
        </div>
      `;
    }

    const card = document.createElement('div');
    card.className = 'product-card';
    card.dataset.id = product.id;
    card.innerHTML = `
      <div class="product-card__image-wrap">
        ${product.imagem ? `<img class="product-card__img" src="${product.imagem}" alt="${product.nome}" loading="lazy">` : ''}
        ${this._placeholderMarkup(product)}
        <div class="product-card__badges">${selosHTML}</div>
        ${recurrenceBadge}
        ${urgencyBadge}
      </div>
      <div class="product-card__body">
        <span class="product-card__category">${category ? category.icone + ' ' + category.nome : ''}</span>
        <h4 class="product-card__name">${product.nome}</h4>
        ${marketplaceBadge}
        <div class="product-card__price-wrap">
          <span class="product-card__price">${Utils.formatBRL(defaultVariacao.preco)}</span>
          <span style="font-size:var(--fs-xs);color:var(--cinza-500);margin-left:var(--space-1);">${defaultVariacao.peso}</span>
        </div>
        ${subscriptionPrice}
        <button class="product-card__add-btn" data-product-id="${product.id}">
          Adicionar ${Utils.formatBRL(defaultVariacao.preco)}
        </button>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (!e.target.closest('.product-card__add-btn')) {
        ProductDetail.open(product);
      }
    });

    const addBtn = card.querySelector('.product-card__add-btn');
    const img = card.querySelector('.product-card__img');
    const fallback = card.querySelector('.product-card__img-fallback');
    if (img && fallback) {
      fallback.style.display = 'none';
      img.addEventListener('error', () => {
        img.style.display = 'none';
        fallback.style.display = 'flex';
      });
      img.addEventListener('load', () => {
        img.style.display = '';
        fallback.style.display = 'none';
      });
    }

    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      AppState.addToCart(product, defaultVariacao, 1);
      Toast.success(`${product.nome} adicionado ao carrinho!`);

      addBtn.style.transform = 'scale(0.93)';
      addBtn.textContent = 'Adicionado!';
      addBtn.style.background = 'var(--verde-escuro)';
      setTimeout(() => {
        addBtn.style.transform = '';
        addBtn.textContent = `Adicionar ${Utils.formatBRL(defaultVariacao.preco)}`;
        addBtn.style.background = '';
      }, 1200);
    });

    return card;
  },

  renderGrid(products, container) {
    container.innerHTML = '';
    if (products.length === 0) {
      container.innerHTML = `
        <div class="product-grid__empty">
          <span class="product-grid__empty-icon">Busca</span>
          <div class="product-grid__empty-text">Nenhum produto encontrado</div>
          <div class="product-grid__empty-sub">Tente outra busca, outra loja ou limpe os filtros.</div>
        </div>
      `;
      return;
    }

    products.forEach(product => {
      const card = this.render(product);
      card.style.animation = 'fadeIn 0.3s ease forwards';
      container.appendChild(card);
    });
  },
};
