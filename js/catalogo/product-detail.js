/* ============================================
   CLUBE DO NATURAL — Product Detail (Bottom Sheet)
   Subscription = desire-driven, not forced
   ============================================ */

const ProductDetail = {
  currentProduct: null,
  selectedVariacao: null,
  quantidade: 1,
  isSubscription: false,
  selectedFrequency: 30,

  open(product) {
    this.currentProduct = product;
    this.selectedVariacao = product.variacoes[1] || product.variacoes[0];
    this.quantidade = 1;
    this.isSubscription = false;
    this.selectedFrequency = product.recorrencia ? product.recorrencia.frequenciaSugerida : 30;
    this.render();

    const backdrop = document.getElementById('product-detail-backdrop');
    const sheet = document.getElementById('product-detail');
    if (backdrop) backdrop.classList.add('active');
    if (sheet) sheet.classList.add('active');
    document.body.style.overflow = 'hidden';
  },

  close() {
    const backdrop = document.getElementById('product-detail-backdrop');
    const sheet = document.getElementById('product-detail');
    if (backdrop) backdrop.classList.remove('active');
    if (sheet) sheet.classList.remove('active');
    document.body.style.overflow = '';
    this.currentProduct = null;
  },

  _bestValueIdx(variacoes) {
    let best = 0, bestPPK = Infinity;
    variacoes.forEach((v, i) => {
      const w = parseFloat(v.peso);
      const u = v.peso.replace(/[0-9.]/g, '').toLowerCase();
      const kg = u === 'g' ? w / 1000 : u === 'kg' ? w : w / 1000;
      const ppk = kg > 0 ? v.preco / kg : Infinity;
      if (ppk < bestPPK) { bestPPK = ppk; best = i; }
    });
    return best;
  },

  _subscriberCount(productId) {
    let hash = 0;
    for (let i = 0; i < productId.length; i++) hash = ((hash << 5) - hash) + productId.charCodeAt(i);
    return 23 + Math.abs(hash % 180);
  },

  render() {
    const p = this.currentProduct;
    if (!p) return;

    const category = DataCategories.find(c => c.id === p.categoria);
    const hasRecurrence = p.recorrencia && p.recorrencia.elegivel;
    const currentIdx = p.variacoes.indexOf(this.selectedVariacao);
    const bestIdx = this._bestValueIdx(p.variacoes);

    const selosHTML = p.selos.map(selo =>
      `<span class="badge badge-${selo}" style="font-size:var(--fs-xs);">${Utils.seloIcon(selo)} ${Utils.seloLabel(selo)}</span>`
    ).join('');

    const variacoesHTML = p.variacoes.map((v, i) => {
      const isActive = i === currentIdx;
      const isBest = i === bestIdx && p.variacoes.length > 1;
      return `
      <button class="detail-variation ${isActive ? 'active' : ''}" data-index="${i}"
        style="padding:var(--space-2) var(--space-3);border:2px solid ${isActive?'var(--verde-medio)':'var(--cinza-300)'};border-radius:var(--radius-md);background:${isActive?'var(--verde-medio)':'var(--branco)'};color:${isActive?'var(--branco)':'var(--cinza-700)'};cursor:pointer;font-family:inherit;transition:all 150ms ease;position:relative;min-width:72px;">
        ${isBest ? `<span style="position:absolute;top:-9px;right:-4px;background:var(--dourado);color:#fff;font-size:8px;padding:1px 5px;border-radius:8px;font-weight:700;white-space:nowrap;line-height:1.4;">💰 Melhor</span>` : ''}
        <span style="display:block;font-size:var(--fs-xs);font-weight:var(--fw-semibold);">${v.peso}</span>
        <span style="display:block;font-size:var(--fs-sm);font-weight:var(--fw-bold);">${Utils.formatBRL(v.preco)}</span>
      </button>`;
    }).join('');

    const beneficiosHTML = p.beneficios ? p.beneficios.map(b =>
      `<li style="padding:var(--space-2) 0;border-bottom:1px solid var(--cinza-100);font-size:var(--fs-sm);color:var(--cinza-700);">
        <span style="color:var(--verde-claro);font-weight:var(--fw-bold);margin-right:var(--space-2);">✓</span>${b}
      </li>`
    ).join('') : '';

    const comoUsarHTML = p.comoUsar ? p.comoUsar.map(c =>
      `<li style="padding:var(--space-2) 0;border-bottom:1px solid var(--cinza-100);font-size:var(--fs-sm);color:var(--cinza-700);">
        <span style="margin-right:var(--space-2);">👉</span>${c}
      </li>`
    ).join('') : '';

    const combinaHTML = p.combinaCom ? p.combinaCom.map(id => {
      const related = (typeof CatalogLoader !== 'undefined' && CatalogLoader.findById(id)) || DataProducts.find(pr => pr.id === id);
      if (!related) return '';
      return `
        <div class="detail-related-item" data-id="${id}" style="flex-shrink:0;width:100px;text-align:center;cursor:pointer;">
          <div style="width:100%;aspect-ratio:1;border-radius:var(--radius-md);background:linear-gradient(135deg,#a8e6cf,#88d8a8);margin-bottom:var(--space-1);display:flex;align-items:center;justify-content:center;font-size:2rem;">
            ${DataCategories.find(c => c.id === related.categoria)?.icone || '🌿'}
          </div>
          <span style="font-size:var(--fs-xs);color:var(--cinza-700);display:block;line-height:1.2;margin-bottom:2px;">${related.nome}</span>
          <span style="font-size:10px;color:var(--verde-medio);font-weight:600;">${Utils.formatBRL(related.variacoes[0].preco)}</span>
        </div>
      `;
    }).filter(Boolean).join('') : '';

    let nutricionalHTML = '';
    if (p.infoNutricional) {
      const info = p.infoNutricional;
      nutricionalHTML = `
        <table style="width:100%;border-collapse:collapse;font-size:var(--fs-sm);">
          <tr style="background:var(--cinza-100);"><td style="padding:var(--space-2) var(--space-3);font-weight:var(--fw-semibold);">Porção</td><td style="padding:var(--space-2) var(--space-3);">${info.porcao}</td></tr>
          <tr><td style="padding:var(--space-2) var(--space-3);border-bottom:1px solid var(--cinza-200);">Calorias</td><td style="padding:var(--space-2) var(--space-3);border-bottom:1px solid var(--cinza-200);">${info.calorias} kcal</td></tr>
          <tr><td style="padding:var(--space-2) var(--space-3);border-bottom:1px solid var(--cinza-200);">Proteínas</td><td style="padding:var(--space-2) var(--space-3);border-bottom:1px solid var(--cinza-200);">${info.proteinas}</td></tr>
          <tr><td style="padding:var(--space-2) var(--space-3);border-bottom:1px solid var(--cinza-200);">Gorduras</td><td style="padding:var(--space-2) var(--space-3);border-bottom:1px solid var(--cinza-200);">${info.gorduras}</td></tr>
          <tr><td style="padding:var(--space-2) var(--space-3);border-bottom:1px solid var(--cinza-200);">Carboidratos</td><td style="padding:var(--space-2) var(--space-3);border-bottom:1px solid var(--cinza-200);">${info.carboidratos}</td></tr>
          <tr><td style="padding:var(--space-2) var(--space-3);">Fibras</td><td style="padding:var(--space-2) var(--space-3);">${info.fibras}</td></tr>
        </table>
      `;
    }

    // ============================================================
    // SUBSCRIPTION — Desire-driven: duration, savings, social proof
    // The customer FEELS it's worth it, not FORCED to subscribe
    // ============================================================
    let recurrenceHTML = '';
    if (hasRecurrence) {
      const rec = p.recorrencia;
      const savings = Utils.calcSubscriptionSavings(
        this.selectedVariacao.preco,
        rec.descontoPercent,
        rec.frequenciaSugerida
      );
      const subCount = this._subscriberCount(p.id);

      const durationMsg = rec.duracaoMedia
        ? `⏱️ Esse produto dura em média <strong>${rec.duracaoMedia}</strong>. Quando acabar, já chega outro na sua porta!`
        : `⏱️ Receba automaticamente e nunca fique sem seu ${p.nome.split(' ').pop()}.`;

      recurrenceHTML = `
        <div id="recurrence-section" style="margin:var(--space-4) 0;border-radius:var(--radius-lg);overflow:hidden;transition:all 250ms ease;
          ${this.isSubscription
            ? 'border:2px solid var(--verde-claro);background:linear-gradient(135deg,#E8F5E9,#F1F8E9);'
            : 'border:1.5px solid var(--cinza-300);background:var(--branco);'}">

          <!-- Toggle header -->
          <label style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3) var(--space-4);cursor:pointer;user-select:none;">
            <div style="position:relative;width:48px;height:26px;flex-shrink:0;">
              <input type="checkbox" id="detail-sub-toggle" ${this.isSubscription ? 'checked' : ''}
                style="position:absolute;opacity:0;width:100%;height:100%;cursor:pointer;margin:0;z-index:2;">
              <div style="position:absolute;inset:0;background:${this.isSubscription ? 'var(--verde-medio)' : 'var(--cinza-300)'};border-radius:13px;transition:background 200ms ease;"></div>
              <div style="position:absolute;top:2px;left:${this.isSubscription ? '24px' : '2px'};width:22px;height:22px;background:white;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.25);transition:left 200ms ease;"></div>
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:var(--fs-sm);font-weight:var(--fw-bold);color:var(--verde-escuro);line-height:1.3;">
                🔄 Receba sempre com ${rec.descontoPercent}% OFF
              </div>
              <div style="font-size:var(--fs-xs);color:${this.isSubscription ? 'var(--verde-medio)' : 'var(--cinza-500)'};">
                ${Utils.formatBRL(savings.precoAssinatura)}/entrega em vez de ${Utils.formatBRL(this.selectedVariacao.preco)}
              </div>
            </div>
          </label>

          <!-- Expanded content when ON — builds desire -->
          <div id="sub-details" style="max-height:${this.isSubscription ? '500px' : '0'};overflow:hidden;transition:max-height 350ms ease;">
            <div style="padding:0 var(--space-4) var(--space-4);">

              <!-- Duration — makes them realize they'll need it again -->
              <div style="background:rgba(255,255,255,0.7);border-radius:var(--radius-md);padding:var(--space-3);margin-bottom:var(--space-3);font-size:var(--fs-xs);color:var(--cinza-700);line-height:1.5;">
                ${durationMsg}
              </div>

              <!-- Price comparison -->
              <div style="display:flex;gap:var(--space-2);margin-bottom:var(--space-3);">
                <div style="flex:1;text-align:center;padding:var(--space-3);background:var(--cinza-100);border-radius:var(--radius-md);opacity:0.7;">
                  <div style="font-size:10px;color:var(--cinza-500);">Compra avulsa</div>
                  <div style="font-size:var(--fs-lg);font-weight:700;color:var(--cinza-400);text-decoration:line-through;">${Utils.formatBRL(this.selectedVariacao.preco)}</div>
                </div>
                <div style="flex:1;text-align:center;padding:var(--space-3);background:linear-gradient(135deg,#C8E6C9,#A5D6A7);border-radius:var(--radius-md);border:2px solid var(--verde-claro);position:relative;">
                  <div style="position:absolute;top:-8px;left:50%;transform:translateX(-50%);background:var(--verde-medio);color:#fff;font-size:9px;padding:1px 8px;border-radius:8px;font-weight:700;">-${rec.descontoPercent}%</div>
                  <div style="font-size:10px;color:var(--verde-escuro);font-weight:600;">Assinatura</div>
                  <div style="font-size:var(--fs-lg);font-weight:700;color:var(--verde-escuro);">${Utils.formatBRL(savings.precoAssinatura)}</div>
                </div>
              </div>

              <!-- Savings timeline — makes savings feel REAL -->
              <div style="background:rgba(255,255,255,0.8);border-radius:var(--radius-md);padding:var(--space-3);margin-bottom:var(--space-3);">
                <div style="font-size:var(--fs-xs);font-weight:var(--fw-bold);color:var(--verde-escuro);margin-bottom:var(--space-2);">💰 Quanto você economiza:</div>
                <div style="display:flex;justify-content:space-between;font-size:var(--fs-xs);color:var(--cinza-700);">
                  <div style="text-align:center;">
                    <div style="font-weight:700;color:var(--verde-medio);font-size:var(--fs-sm);">${Utils.formatBRL(savings.economiaPorCompra)}</div>
                    <div>por entrega</div>
                  </div>
                  <div style="text-align:center;">
                    <div style="font-weight:700;color:var(--verde-medio);font-size:var(--fs-sm);">${Utils.formatBRL(savings.economiaPorCompra * 6)}</div>
                    <div>em 6 meses</div>
                  </div>
                  <div style="text-align:center;">
                    <div style="font-weight:700;color:var(--verde-escuro);font-size:var(--fs-base);">${Utils.formatBRL(savings.economiaAnual)}</div>
                    <div style="font-weight:600;">por ano 🎉</div>
                  </div>
                </div>
              </div>

              <!-- Frequency selector -->
              <div style="font-size:var(--fs-xs);font-weight:var(--fw-semibold);color:var(--cinza-700);margin-bottom:var(--space-2);">Frequência de entrega:</div>
              <div style="display:flex;gap:var(--space-2);flex-wrap:wrap;margin-bottom:var(--space-3);">
                ${[{f:7,l:'Semanal'},{f:14,l:'Quinzenal'},{f:30,l:'Mensal'},{f:60,l:'Bimestral'}].map(o => {
                  const isActive = this.selectedFrequency === o.f;
                  const isRec = o.f === rec.frequenciaSugerida;
                  return `<button class="detail-freq-btn ${isActive ? 'active' : ''}" data-freq="${o.f}"
                    style="flex:1;min-width:65px;padding:var(--space-2);border:2px solid ${isActive?'var(--verde-medio)':'var(--cinza-300)'};border-radius:var(--radius-md);background:${isActive?'var(--verde-medio)':'var(--branco)'};color:${isActive?'var(--branco)':'var(--cinza-700)'};cursor:pointer;font-family:inherit;font-size:var(--fs-xs);font-weight:var(--fw-semibold);transition:all 150ms ease;position:relative;">
                    ${isRec ? '<span style="position:absolute;top:-7px;left:50%;transform:translateX(-50%);background:var(--dourado);color:#fff;font-size:7px;padding:0 4px;border-radius:4px;font-weight:700;">Ideal</span>' : ''}
                    ${o.l}
                  </button>`;
                }).join('')}
              </div>

              <!-- Social proof + convenience -->
              <div style="display:flex;gap:var(--space-3);font-size:var(--fs-xs);color:var(--cinza-600);">
                <div style="flex:1;display:flex;align-items:center;gap:var(--space-1);">
                  <span>👥</span> <strong>${subCount}</strong> pessoas assinam
                </div>
                <div style="flex:1;display:flex;align-items:center;gap:var(--space-1);">
                  <span>✅</span> Cancele quando quiser
                </div>
              </div>
            </div>
          </div>

          <!-- Teaser when OFF — creates desire to toggle ON -->
          <div id="sub-teaser" style="max-height:${this.isSubscription ? '0' : '80px'};overflow:hidden;transition:max-height 350ms ease;">
            <div style="padding:0 var(--space-4) var(--space-3);display:flex;align-items:center;gap:var(--space-3);font-size:var(--fs-xs);color:var(--cinza-500);">
              <span>💡</span>
              <span>Economize <strong style="color:var(--verde-medio);">${Utils.formatBRL(savings.economiaAnual)}/ano</strong> assinando ·
              <strong>${subCount} pessoas</strong> já assinam · Cancele quando quiser</span>
            </div>
          </div>
        </div>
      `;
    }

    const shareURL = `${window.location.origin}/produto.html?id=${p.id}`;
    const viralText = p.curiosidade
      ? `🤯 Você sabia?! ${p.curiosidade}\n\nConfira *${p.nome}* e muito mais:\n${shareURL}`
      : `Olha esse produto incrível!\n\n*${p.nome}*\n${p.descricao}\n\n${shareURL}`;
    const whatsappShare = Utils.whatsappLink('', viralText);

    const unitPrice = this.isSubscription && hasRecurrence
      ? this.selectedVariacao.preco * (1 - p.recorrencia.descontoPercent / 100)
      : this.selectedVariacao.preco;
    const totalPrice = unitPrice * this.quantidade;

    const sheet = document.getElementById('product-detail');
    if (!sheet) return;

    sheet.innerHTML = `
      <div class="bottom-sheet-handle"></div>
      <div style="flex:1;overflow-y:auto;padding:0 var(--space-4) var(--space-4);-webkit-overflow-scrolling:touch;">
        <div style="width:100%;border-radius:var(--radius-lg);overflow:hidden;margin-bottom:var(--space-4);background:linear-gradient(135deg,#a8e6cf 0%,#88d8a8 50%,#69c98e 100%);aspect-ratio:4/3;display:flex;align-items:center;justify-content:center;font-size:4rem;position:relative;">
          ${p.imagem && p.imagem.startsWith('http') ? `<img src="${p.imagem}" alt="${p.nome}" style="width:100%;height:100%;object-fit:contain;padding:12px;position:absolute;inset:0;" onerror="this.style.display='none';this.nextElementSibling.style.display=''"><span style="display:none">${DataCategories.find(c => c.id === p.categoria)?.icone || '🌿'}</span>` : (DataCategories.find(c => c.id === p.categoria)?.icone || '🌿')}
        </div>

        <div style="display:flex;flex-wrap:wrap;gap:var(--space-2);margin-bottom:var(--space-3);">
          ${selosHTML}
        </div>

        <span style="font-size:var(--fs-sm);color:var(--verde-medio);font-weight:var(--fw-medium);text-transform:uppercase;letter-spacing:0.04em;">
          ${category ? category.icone + ' ' + category.nome : ''}
        </span>

        <h2 style="font-size:var(--fs-xl);font-weight:var(--fw-bold);color:var(--cinza-900);margin:var(--space-1) 0 var(--space-2);">${p.nome}</h2>

        <p style="font-size:var(--fs-base);color:var(--cinza-700);line-height:var(--lh-relaxed);margin-bottom:var(--space-4);">${p.descricao}</p>

        <div style="display:flex;gap:var(--space-2);flex-wrap:wrap;margin-bottom:var(--space-3);">
          ${variacoesHTML}
        </div>

        ${combinaHTML ? `
        <div style="margin-bottom:var(--space-4);">
          <h4 style="font-size:var(--fs-sm);font-weight:var(--fw-bold);color:var(--cinza-800);margin-bottom:var(--space-2);">🤝 Quem leva ${p.nome.split(' ')[0]}, também leva:</h4>
          <div style="display:flex;gap:var(--space-3);overflow-x:auto;padding-bottom:var(--space-2);scrollbar-width:none;">${combinaHTML}</div>
        </div>` : ''}

        ${recurrenceHTML}

        ${beneficiosHTML ? `
        <div style="margin-bottom:var(--space-4);">
          <h4 style="font-size:var(--fs-md);font-weight:var(--fw-bold);color:var(--cinza-900);margin-bottom:var(--space-2);padding-bottom:var(--space-2);border-bottom:2px solid var(--cinza-200);">💪 Benefícios</h4>
          <ul style="list-style:none;padding:0;margin:0;">${beneficiosHTML}</ul>
        </div>` : ''}

        ${comoUsarHTML ? `
        <div style="margin-bottom:var(--space-4);">
          <h4 style="font-size:var(--fs-md);font-weight:var(--fw-bold);color:var(--cinza-900);margin-bottom:var(--space-2);padding-bottom:var(--space-2);border-bottom:2px solid var(--cinza-200);">📖 Como Usar</h4>
          <ul style="list-style:none;padding:0;margin:0;">${comoUsarHTML}</ul>
        </div>` : ''}

        ${nutricionalHTML ? `
        <div style="margin-bottom:var(--space-4);">
          <h4 style="font-size:var(--fs-md);font-weight:var(--fw-bold);color:var(--cinza-900);margin-bottom:var(--space-2);padding-bottom:var(--space-2);border-bottom:2px solid var(--cinza-200);">📊 Informação Nutricional</h4>
          ${nutricionalHTML}
        </div>` : ''}

        ${p.curiosidade ? `
        <div style="background:var(--amarelo-claro);padding:var(--space-4);border-radius:var(--radius-lg);margin-bottom:var(--space-4);">
          <h4 style="font-size:var(--fs-md);font-weight:var(--fw-bold);margin-bottom:var(--space-2);">🤯 Você Sabia?</h4>
          <p style="font-size:var(--fs-sm);color:var(--cinza-800);line-height:var(--lh-relaxed);margin-bottom:var(--space-3);">${p.curiosidade}</p>
          <a href="${whatsappShare}" target="_blank" style="display:flex;align-items:center;justify-content:center;gap:var(--space-2);background:#25D366;color:#fff;padding:var(--space-3);border-radius:var(--radius-md);font-size:var(--fs-sm);font-weight:var(--fw-bold);text-decoration:none;min-height:44px;">
            📲 Enviar para um amigo
          </a>
        </div>` : ''}

        ${p.contraindicacoes ? `
        <div style="background:var(--vermelho-claro);padding:var(--space-3);border-radius:var(--radius-md);margin-bottom:var(--space-4);border-left:4px solid var(--vermelho);">
          <h4 style="font-size:var(--fs-sm);font-weight:var(--fw-bold);margin-bottom:var(--space-1);">⚠️ Contraindicações</h4>
          <p style="font-size:var(--fs-sm);color:var(--cinza-700);">${p.contraindicacoes}</p>
        </div>` : ''}
      </div>

      <div style="flex-shrink:0;padding:var(--space-3) var(--space-4);border-top:1px solid var(--cinza-200);background:var(--branco);">
        ${this.isSubscription ? `<div style="text-align:center;font-size:var(--fs-xs);color:var(--verde-medio);font-weight:var(--fw-semibold);margin-bottom:var(--space-2);">🔄 Assinatura ativa · entrega a cada ${this.selectedFrequency} dias · cancele quando quiser</div>` : ''}
        <div style="display:flex;align-items:center;gap:var(--space-3);">
          <div class="qty-control">
            <button id="detail-qty-minus">−</button>
            <span class="qty-value" id="detail-qty">${this.quantidade}</span>
            <button id="detail-qty-plus">+</button>
          </div>
          <button class="btn btn-primary" id="detail-add-btn" style="flex:1;padding:var(--space-3);font-size:var(--fs-base);min-height:48px;${this.isSubscription ? 'background:linear-gradient(135deg,var(--verde-medio),var(--verde-claro));' : ''}">
            ${this.isSubscription
              ? `🔄 Assinar ${Utils.formatBRL(totalPrice)}/entrega`
              : `🛒 Adicionar ${Utils.formatBRL(totalPrice)}`}
          </button>
        </div>
      </div>
    `;

    this.bindEvents();
  },

  bindEvents() {
    const sheet = document.getElementById('product-detail');
    if (!sheet) return;

    const backdrop = document.getElementById('product-detail-backdrop');
    if (backdrop) backdrop.onclick = () => this.close();

    sheet.querySelectorAll('.detail-variation').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedVariacao = this.currentProduct.variacoes[parseInt(btn.dataset.index)];
        this.render();
      });
    });

    const qtyMinus = sheet.querySelector('#detail-qty-minus');
    const qtyPlus = sheet.querySelector('#detail-qty-plus');
    if (qtyMinus) qtyMinus.onclick = () => { if (this.quantidade > 1) { this.quantidade--; this.updatePrice(); } };
    if (qtyPlus) qtyPlus.onclick = () => { this.quantidade++; this.updatePrice(); };

    const subToggle = sheet.querySelector('#detail-sub-toggle');
    if (subToggle) {
      subToggle.onchange = () => {
        this.isSubscription = subToggle.checked;
        this.render();
      };
    }

    const addBtn = sheet.querySelector('#detail-add-btn');
    if (addBtn) {
      addBtn.onclick = () => {
        const p = this.currentProduct;
        const hasRec = p.recorrencia && p.recorrencia.elegivel;
        if (this.isSubscription && hasRec) {
          AppState.addToCart(p, this.selectedVariacao, this.quantidade, true, this.selectedFrequency);
          Toast.success(`Assinatura de ${p.nome} adicionada! 🔄`);
        } else {
          AppState.addToCart(p, this.selectedVariacao, this.quantidade, false);
          Toast.success(`${p.nome} adicionado ao carrinho! 🛒`);
        }
        this.close();
      };
    }

    sheet.querySelectorAll('.detail-freq-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedFrequency = parseInt(btn.dataset.freq);
        this.render();
      });
    });

    sheet.querySelectorAll('.detail-related-item').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const related = (typeof CatalogLoader !== 'undefined' && CatalogLoader.findById(link.dataset.id)) || DataProducts.find(p => p.id === link.dataset.id);
        if (related) this.open(related);
      });
    });
  },

  updatePrice() {
    const sheet = document.getElementById('product-detail');
    if (!sheet) return;
    const p = this.currentProduct;
    const hasRec = p.recorrencia && p.recorrencia.elegivel;
    const unitPrice = this.isSubscription && hasRec
      ? this.selectedVariacao.preco * (1 - p.recorrencia.descontoPercent / 100)
      : this.selectedVariacao.preco;
    const totalPrice = unitPrice * this.quantidade;
    const qtyEl = sheet.querySelector('#detail-qty');
    const addBtn = sheet.querySelector('#detail-add-btn');
    if (qtyEl) qtyEl.textContent = this.quantidade;
    if (addBtn) {
      addBtn.innerHTML = this.isSubscription
        ? `🔄 Assinar ${Utils.formatBRL(totalPrice)}/entrega`
        : `🛒 Adicionar ${Utils.formatBRL(totalPrice)}`;
    }
  },
};
