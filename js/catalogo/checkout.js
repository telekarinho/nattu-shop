/* ============================================
   CLUBE DO NATURAL — Checkout Modal
   4-step flow: Carrinho > Dados > Pagamento > Confirmacao
   MercadoPago integration + PIX inline
   ============================================ */

const Checkout = (() => {
  const FRETE_GRATIS_MIN = 89;
  const FRETE_PADRAO = 12.90;
  const COUPON_CODE = 'NATURAL10';
  const COUPON_DISCOUNT = 0.10; // 10%
  const API_BASE = '/api';

  let currentStep = 1;
  let appliedCoupon = null;
  let shippingCost = 0;
  let orderResult = null;
  let isProcessing = false;

  // Restore saved customer data
  function getSavedCustomer() {
    return Storage.get('checkout_customer') || {
      nome: '', email: '', telefone: '', cpf: '',
      cep: '', endereco: '', numero: '', complemento: '',
      bairro: '', cidade: '', estado: ''
    };
  }

  function saveCustomer(data) {
    Storage.set('checkout_customer', data);
  }

  function getCustomerData() {
    const modal = document.getElementById('checkout-modal');
    if (!modal) return {};
    return {
      nome: (modal.querySelector('#ck-nome') || {}).value || '',
      email: (modal.querySelector('#ck-email') || {}).value || '',
      telefone: (modal.querySelector('#ck-telefone') || {}).value || '',
      cpf: (modal.querySelector('#ck-cpf') || {}).value || '',
      cep: (modal.querySelector('#ck-cep') || {}).value || '',
      endereco: (modal.querySelector('#ck-endereco') || {}).value || '',
      numero: (modal.querySelector('#ck-numero') || {}).value || '',
      complemento: (modal.querySelector('#ck-complemento') || {}).value || '',
      bairro: (modal.querySelector('#ck-bairro') || {}).value || '',
      cidade: (modal.querySelector('#ck-cidade') || {}).value || '',
      estado: (modal.querySelector('#ck-estado') || {}).value || '',
    };
  }

  function getPaymentMethod() {
    const selected = document.querySelector('.ck-payment-option.selected');
    return selected ? selected.dataset.method : 'pix';
  }

  // Calculate totals
  function calcTotals() {
    const cart = AppState.get('cart') || [];
    const subtotal = cart.reduce((s, i) => s + i.preco * i.quantidade, 0);
    const couponDiscount = appliedCoupon ? subtotal * COUPON_DISCOUNT : 0;
    const afterCoupon = subtotal - couponDiscount;
    shippingCost = afterCoupon >= FRETE_GRATIS_MIN ? 0 : FRETE_PADRAO;
    const total = afterCoupon + shippingCost;
    return { subtotal, couponDiscount, shippingCost, total, afterCoupon };
  }

  // ======= RENDERING =======

  function renderStepIndicator() {
    const steps = document.querySelectorAll('.ck-step-dot');
    const lines = document.querySelectorAll('.ck-step-line');
    steps.forEach((dot, i) => {
      const stepNum = i + 1;
      dot.classList.toggle('active', stepNum === currentStep);
      dot.classList.toggle('completed', stepNum < currentStep);
    });
    lines.forEach((line, i) => {
      line.classList.toggle('completed', i + 1 < currentStep);
    });
  }

  function renderStep1() {
    const cart = AppState.get('cart') || [];
    const container = document.getElementById('ck-step-1');
    if (!container) return;

    const totals = calcTotals();

    let itemsHTML = cart.map(item => `
      <div class="ck-cart-item" data-key="${item.key}">
        <div class="ck-cart-item__info">
          <div class="ck-cart-item__name">
            ${item.nome}
            ${item.isSubscription ? '<span class="badge badge-recorrente" style="font-size:10px;margin-left:4px;">Assinatura</span>' : ''}
          </div>
          <div class="ck-cart-item__meta">${item.peso} &middot; ${Utils.formatBRL(item.preco)} un.</div>
          <div class="ck-cart-item__qty">
            <button class="ck-qty-btn" data-key="${item.key}" data-delta="-1">-</button>
            <span>${item.quantidade}</span>
            <button class="ck-qty-btn" data-key="${item.key}" data-delta="1">+</button>
            <button class="ck-remove-btn" data-key="${item.key}" title="Remover">&#10005;</button>
          </div>
        </div>
        <div class="ck-cart-item__price">${Utils.formatBRL(item.preco * item.quantidade)}</div>
      </div>
    `).join('');

    if (cart.length === 0) {
      itemsHTML = `
        <div class="ck-empty">
          <div style="font-size:3rem;margin-bottom:var(--space-4);">&#128722;</div>
          <p>Seu carrinho esta vazio.</p>
          <button class="btn btn-primary" onclick="Checkout.close()">Continuar Comprando</button>
        </div>`;
    }

    container.innerHTML = `
      <h3 class="ck-section-title">Revise seu Carrinho</h3>
      <div class="ck-cart-items">${itemsHTML}</div>

      ${cart.length > 0 ? `
        <!-- Cupom -->
        <div class="ck-coupon-row">
          <div class="ck-coupon-input-wrap">
            <input type="text" id="ck-coupon-input" placeholder="Cupom de desconto"
              value="${appliedCoupon || ''}" maxlength="20"
              style="text-transform:uppercase;">
            <button class="btn btn-secondary btn-sm" id="ck-coupon-apply">Aplicar</button>
          </div>
          ${appliedCoupon ? `<div class="ck-coupon-applied">&#9989; Cupom <strong>${appliedCoupon}</strong> aplicado (-10%)</div>` : ''}
        </div>

        <!-- Totais -->
        <div class="ck-totals">
          <div class="ck-totals__row">
            <span>Subtotal</span>
            <span>${Utils.formatBRL(totals.subtotal)}</span>
          </div>
          ${appliedCoupon ? `
            <div class="ck-totals__row ck-totals__row--discount">
              <span>Desconto (${COUPON_CODE})</span>
              <span>- ${Utils.formatBRL(totals.couponDiscount)}</span>
            </div>
          ` : ''}
          <div class="ck-totals__row">
            <span>Frete</span>
            <span>${totals.shippingCost === 0
              ? '<span style="color:var(--verde-claro);font-weight:var(--fw-bold);">GRATIS</span>'
              : Utils.formatBRL(totals.shippingCost)}</span>
          </div>
          ${totals.shippingCost > 0 ? `
            <div style="font-size:var(--fs-xs);color:var(--cinza-500);text-align:right;">
              Falta ${Utils.formatBRL(FRETE_GRATIS_MIN - totals.afterCoupon)} para frete gratis
            </div>
          ` : ''}
          <div class="ck-totals__row ck-totals__row--total">
            <span>Total</span>
            <span>${Utils.formatBRL(totals.total)}</span>
          </div>
        </div>
      ` : ''}
    `;

    // Bind events
    container.querySelectorAll('.ck-qty-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        AppState.updateCartQty(btn.dataset.key, parseInt(btn.dataset.delta));
        renderStep1();
      });
    });

    container.querySelectorAll('.ck-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        AppState.removeFromCart(btn.dataset.key);
        renderStep1();
      });
    });

    const couponBtn = document.getElementById('ck-coupon-apply');
    if (couponBtn) {
      couponBtn.addEventListener('click', applyCoupon);
    }

    updateNavButtons();
  }

  function renderStep2() {
    const container = document.getElementById('ck-step-2');
    if (!container) return;

    const saved = getSavedCustomer();

    container.innerHTML = `
      <h3 class="ck-section-title">Seus Dados</h3>
      <div class="checkout-form">
        <div class="form-group">
          <label>Nome completo <span class="required">*</span></label>
          <input type="text" id="ck-nome" value="${saved.nome}" placeholder="Maria da Silva"
            class="ck-input" required autocomplete="name">
        </div>
        <div class="form-group">
          <label>E-mail <span class="required">*</span></label>
          <input type="email" id="ck-email" value="${saved.email}" placeholder="maria@email.com"
            class="ck-input" required autocomplete="email">
        </div>
        <div class="form-group">
          <label>Telefone <span class="required">*</span></label>
          <input type="tel" id="ck-telefone" value="${saved.telefone}" placeholder="(11) 99999-9999"
            class="ck-input" required autocomplete="tel">
        </div>
        <div class="form-group">
          <label>CPF <span class="required">*</span></label>
          <input type="text" id="ck-cpf" value="${saved.cpf}" placeholder="000.000.000-00"
            class="ck-input" required>
        </div>

        <div class="ck-address-divider">Endereco de Entrega</div>

        <div class="form-group">
          <label>CEP <span class="required">*</span></label>
          <input type="text" id="ck-cep" value="${saved.cep}" placeholder="00000-000"
            class="ck-input" required maxlength="9">
          <div id="ck-cep-status" style="font-size:var(--fs-xs);margin-top:var(--space-1);"></div>
        </div>
        <div class="form-group">
          <label>Endereco <span class="required">*</span></label>
          <input type="text" id="ck-endereco" value="${saved.endereco}" placeholder="Rua das Flores"
            class="ck-input" required autocomplete="street-address">
        </div>
        <div class="form-group" style="max-width:120px;">
          <label>Numero <span class="required">*</span></label>
          <input type="text" id="ck-numero" value="${saved.numero}" placeholder="123"
            class="ck-input" required>
        </div>
        <div class="form-group">
          <label>Complemento</label>
          <input type="text" id="ck-complemento" value="${saved.complemento}" placeholder="Apto 12"
            class="ck-input" autocomplete="address-line2">
        </div>
        <div class="form-group">
          <label>Bairro <span class="required">*</span></label>
          <input type="text" id="ck-bairro" value="${saved.bairro}" placeholder="Centro"
            class="ck-input" required>
        </div>
        <div class="form-group">
          <label>Cidade <span class="required">*</span></label>
          <input type="text" id="ck-cidade" value="${saved.cidade}" placeholder="Sao Paulo"
            class="ck-input" required>
        </div>
        <div class="form-group" style="max-width:80px;">
          <label>UF <span class="required">*</span></label>
          <input type="text" id="ck-estado" value="${saved.estado}" placeholder="SP"
            class="ck-input" required maxlength="2" style="text-transform:uppercase;">
        </div>
      </div>
    `;

    // Apply masks
    const telInput = document.getElementById('ck-telefone');
    const cpfInput = document.getElementById('ck-cpf');
    const cepInput = document.getElementById('ck-cep');
    if (telInput) Utils.maskPhone(telInput);
    if (cpfInput) Utils.maskCPF(cpfInput);
    if (cepInput) maskCEP(cepInput);

    updateNavButtons();
  }

  function renderStep3() {
    const container = document.getElementById('ck-step-3');
    if (!container) return;
    const totals = calcTotals();

    container.innerHTML = `
      <h3 class="ck-section-title">Forma de Pagamento</h3>

      <div class="ck-payment-options">
        <div class="ck-payment-option selected" data-method="pix">
          <div class="radio-card__radio"></div>
          <div class="ck-payment-option__icon">&#128178;</div>
          <div class="ck-payment-option__info">
            <div class="ck-payment-option__title">PIX</div>
            <div class="ck-payment-option__desc">Aprovacao instantanea. Copie o codigo ou escaneie o QR.</div>
          </div>
          <div class="ck-payment-option__badge" style="background:#E8F5E9;color:var(--verde-escuro);padding:2px 8px;border-radius:var(--radius-full);font-size:var(--fs-xs);font-weight:var(--fw-bold);">Recomendado</div>
        </div>

        <div class="ck-payment-option" data-method="credit_card">
          <div class="radio-card__radio"></div>
          <div class="ck-payment-option__icon">&#128179;</div>
          <div class="ck-payment-option__info">
            <div class="ck-payment-option__title">Cartao de Credito</div>
            <div class="ck-payment-option__desc">Parcele em ate 3x sem juros. Visa, Master, Elo.</div>
          </div>
        </div>

        <div class="ck-payment-option" data-method="boleto">
          <div class="radio-card__radio"></div>
          <div class="ck-payment-option__icon">&#128196;</div>
          <div class="ck-payment-option__info">
            <div class="ck-payment-option__title">Boleto Bancario</div>
            <div class="ck-payment-option__desc">Vencimento em 3 dias uteis. Compensacao em ate 2 dias.</div>
          </div>
        </div>
      </div>

      <!-- Resumo do pedido -->
      <div class="ck-order-summary-inline">
        <div class="ck-totals">
          <div class="ck-totals__row">
            <span>Subtotal (${AppState.getCartCount()} itens)</span>
            <span>${Utils.formatBRL(totals.subtotal)}</span>
          </div>
          ${appliedCoupon ? `
            <div class="ck-totals__row ck-totals__row--discount">
              <span>Desconto (${COUPON_CODE})</span>
              <span>- ${Utils.formatBRL(totals.couponDiscount)}</span>
            </div>
          ` : ''}
          <div class="ck-totals__row">
            <span>Frete</span>
            <span>${totals.shippingCost === 0
              ? '<span style="color:var(--verde-claro);font-weight:var(--fw-bold);">GRATIS</span>'
              : Utils.formatBRL(totals.shippingCost)}</span>
          </div>
          <div class="ck-totals__row ck-totals__row--total">
            <span>Total a pagar</span>
            <span>${Utils.formatBRL(totals.total)}</span>
          </div>
        </div>
      </div>

      <div style="font-size:var(--fs-xs);color:var(--cinza-500);text-align:center;margin-top:var(--space-3);">
        &#128274; Pagamento seguro processado via MercadoPago
      </div>
    `;

    // Bind payment option click
    container.querySelectorAll('.ck-payment-option').forEach(opt => {
      opt.addEventListener('click', () => {
        container.querySelectorAll('.ck-payment-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
      });
    });

    updateNavButtons();
  }

  function renderStep4() {
    const container = document.getElementById('ck-step-4');
    if (!container) return;

    if (!orderResult) {
      container.innerHTML = '<div class="ck-empty"><div class="spinner" style="margin:var(--space-8) auto;"></div><p>Processando seu pedido...</p></div>';
      return;
    }

    const customer = getCustomerData();
    const cart = AppState.get('cart') || [];
    const totals = calcTotals();
    const subItems = cart.filter(i => i.isSubscription);

    container.innerHTML = `
      <div class="ck-confirmation">
        <div class="ck-confirmation__icon">&#9989;</div>
        <h3 class="ck-confirmation__title">Pedido Confirmado!</h3>
        <p class="ck-confirmation__order-num">Pedido <strong>#${orderResult.orderNumber}</strong></p>

        ${orderResult.paymentMethod === 'pix' ? `
          <div class="ck-pix-area">
            <div class="ck-pix-qr">
              <div class="pix-qr-placeholder" id="ck-pix-qr-img">
                &#128178;
              </div>
              <p style="font-size:var(--fs-sm);color:var(--cinza-600);margin-bottom:var(--space-3);">
                Escaneie o QR code ou copie o codigo PIX abaixo:
              </p>
              <div class="pix-code-text" id="ck-pix-code">${orderResult.pixCode || 'Gerando codigo PIX...'}</div>
              <button class="pix-copy-btn" id="ck-pix-copy">&#128203; Copiar Codigo PIX</button>
            </div>
            <div style="font-size:var(--fs-xs);color:var(--cinza-500);margin-top:var(--space-3);">
              O pagamento via PIX e aprovado instantaneamente.
            </div>
          </div>
        ` : ''}

        ${orderResult.paymentMethod === 'credit_card' && orderResult.checkoutUrl ? `
          <div style="text-align:center;margin:var(--space-6) 0;">
            <p style="margin-bottom:var(--space-3);">Voce sera redirecionado para o pagamento seguro:</p>
            <a href="${orderResult.checkoutUrl}" target="_blank" class="btn btn-primary btn-lg" rel="noopener">
              &#128179; Pagar com Cartao
            </a>
          </div>
        ` : ''}

        ${orderResult.paymentMethod === 'boleto' ? `
          <div style="text-align:center;margin:var(--space-6) 0;">
            <p style="margin-bottom:var(--space-3);">Seu boleto foi gerado. Pague ate o vencimento:</p>
            ${orderResult.boletoUrl ? `
              <a href="${orderResult.boletoUrl}" target="_blank" class="btn btn-primary btn-lg" rel="noopener">
                &#128196; Abrir Boleto
              </a>
            ` : '<p style="color:var(--cinza-500);">O boleto sera enviado para seu e-mail.</p>'}
          </div>
        ` : ''}

        <div class="ck-confirmation__details">
          <h4>Resumo do Pedido</h4>
          <div class="ck-confirmation__items">
            ${cart.map(item => `
              <div class="ck-confirmation__item">
                <span>${item.quantidade}x ${item.nome} (${item.peso})
                  ${item.isSubscription ? '<span class="badge badge-recorrente" style="font-size:9px;">Assinatura</span>' : ''}
                </span>
                <span>${Utils.formatBRL(item.preco * item.quantidade)}</span>
              </div>
            `).join('')}
          </div>
          <div class="ck-totals" style="margin-top:var(--space-3);">
            <div class="ck-totals__row ck-totals__row--total">
              <span>Total</span>
              <span>${Utils.formatBRL(totals.total)}</span>
            </div>
          </div>

          ${subItems.length > 0 ? `
            <div class="ck-confirmation__subscriptions">
              <h4>Assinaturas Ativadas</h4>
              ${subItems.map(item => `
                <div class="ck-confirmation__item">
                  <span>${item.nome} - ${item.frequency || 'Mensal'}</span>
                  <span>${Utils.formatBRL(item.preco)}/entrega</span>
                </div>
              `).join('')}
              <p style="font-size:var(--fs-xs);color:var(--cinza-500);margin-top:var(--space-2);">
                Gerencie suas assinaturas em "Minhas Assinaturas".
              </p>
            </div>
          ` : ''}
        </div>

        <div class="ck-confirmation__delivery">
          <p><strong>Entrega em:</strong> ${customer.endereco}, ${customer.numero}${customer.complemento ? ' - ' + customer.complemento : ''}<br>
          ${customer.bairro} - ${customer.cidade}/${customer.estado} - CEP ${customer.cep}</p>
          <p style="font-size:var(--fs-xs);color:var(--cinza-500);">Enviaremos atualizacoes para ${customer.email}</p>
        </div>

        <div style="text-align:center;margin-top:var(--space-6);">
          <button class="btn btn-primary btn-lg" onclick="Checkout.close(); AppState.clearCart();">Voltar ao Catalogo</button>
        </div>
      </div>
    `;

    // PIX copy
    const pixCopyBtn = document.getElementById('ck-pix-copy');
    if (pixCopyBtn) {
      pixCopyBtn.addEventListener('click', () => {
        const code = document.getElementById('ck-pix-code');
        if (code) {
          navigator.clipboard.writeText(code.textContent).then(() => {
            Toast.success('Codigo PIX copiado!');
            pixCopyBtn.innerHTML = '&#9989; Copiado!';
            setTimeout(() => { pixCopyBtn.innerHTML = '&#128203; Copiar Codigo PIX'; }, 3000);
          }).catch(() => {
            // Fallback
            const range = document.createRange();
            range.selectNodeContents(code);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            document.execCommand('copy');
            Toast.success('Codigo PIX copiado!');
          });
        }
      });
    }

    // Confetti
    try { Utils.confetti(); } catch(e) {}
  }

  function renderCurrentStep() {
    // Hide all steps
    document.querySelectorAll('.ck-step-panel').forEach(p => p.classList.remove('active'));
    const activePanel = document.getElementById(`ck-step-${currentStep}`);
    if (activePanel) activePanel.classList.add('active');

    renderStepIndicator();

    switch (currentStep) {
      case 1: renderStep1(); break;
      case 2: renderStep2(); break;
      case 3: renderStep3(); break;
      case 4: renderStep4(); break;
    }
  }

  function updateNavButtons() {
    const backBtn = document.getElementById('ck-nav-back');
    const nextBtn = document.getElementById('ck-nav-next');
    if (!backBtn || !nextBtn) return;

    const cart = AppState.get('cart') || [];

    if (currentStep === 1) {
      backBtn.style.display = 'none';
      nextBtn.textContent = cart.length > 0 ? 'Continuar \u2192' : '';
      nextBtn.style.display = cart.length > 0 ? 'inline-flex' : 'none';
    } else if (currentStep === 2) {
      backBtn.style.display = 'inline-flex';
      backBtn.textContent = '\u2190 Carrinho';
      nextBtn.textContent = 'Ir para Pagamento \u2192';
      nextBtn.style.display = 'inline-flex';
    } else if (currentStep === 3) {
      backBtn.style.display = 'inline-flex';
      backBtn.textContent = '\u2190 Meus Dados';
      nextBtn.textContent = 'Finalizar Pedido';
      nextBtn.style.display = 'inline-flex';
      nextBtn.classList.add('btn-confirm-final');
    } else {
      backBtn.style.display = 'none';
      nextBtn.style.display = 'none';
    }
  }

  // ======= VALIDATION =======

  function validateStep2() {
    const data = getCustomerData();
    const errors = [];

    if (!data.nome.trim()) errors.push('Nome e obrigatorio');
    if (!Utils.isValidEmail(data.email)) errors.push('E-mail invalido');
    if (!Utils.isValidPhone(data.telefone)) errors.push('Telefone invalido');
    if (!Utils.isValidCPF(data.cpf)) errors.push('CPF invalido');
    if (!data.cep || data.cep.replace(/\D/g, '').length !== 8) errors.push('CEP invalido');
    if (!data.endereco.trim()) errors.push('Endereco e obrigatorio');
    if (!data.numero.trim()) errors.push('Numero e obrigatorio');
    if (!data.bairro.trim()) errors.push('Bairro e obrigatorio');
    if (!data.cidade.trim()) errors.push('Cidade e obrigatoria');
    if (!data.estado.trim() || data.estado.trim().length !== 2) errors.push('UF invalida');

    if (errors.length > 0) {
      Toast.error(errors[0]);
      // Mark invalid fields
      const fields = ['nome', 'email', 'telefone', 'cpf', 'cep', 'endereco', 'numero', 'bairro', 'cidade', 'estado'];
      fields.forEach(f => {
        const input = document.getElementById(`ck-${f}`);
        if (input) input.classList.remove('invalid');
      });
      if (errors[0].toLowerCase().includes('nome')) markInvalid('ck-nome');
      if (errors[0].toLowerCase().includes('mail')) markInvalid('ck-email');
      if (errors[0].toLowerCase().includes('telefone')) markInvalid('ck-telefone');
      if (errors[0].toLowerCase().includes('cpf')) markInvalid('ck-cpf');
      if (errors[0].toLowerCase().includes('cep')) markInvalid('ck-cep');
      if (errors[0].toLowerCase().includes('endereco')) markInvalid('ck-endereco');
      if (errors[0].toLowerCase().includes('numero')) markInvalid('ck-numero');
      if (errors[0].toLowerCase().includes('bairro')) markInvalid('ck-bairro');
      if (errors[0].toLowerCase().includes('cidade')) markInvalid('ck-cidade');
      if (errors[0].toLowerCase().includes('uf')) markInvalid('ck-estado');
      return false;
    }

    // Save for next time
    saveCustomer(data);
    return true;
  }

  function markInvalid(id) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.add('invalid');
      el.focus();
    }
  }

  // ======= COUPON =======

  function applyCoupon() {
    const input = document.getElementById('ck-coupon-input');
    if (!input) return;
    const code = input.value.trim().toUpperCase();

    if (!code) {
      Toast.warning('Digite um cupom');
      return;
    }

    if (code === COUPON_CODE) {
      // Check if first purchase
      const orders = Storage.get('order_history') || [];
      if (orders.length > 0) {
        Toast.error('Cupom valido apenas para primeira compra');
        return;
      }
      appliedCoupon = code;
      Toast.success('Cupom aplicado! 10% de desconto');
      renderStep1();
    } else {
      Toast.error('Cupom invalido');
      appliedCoupon = null;
      renderStep1();
    }
  }

  // ======= CEP MASK + LOOKUP =======

  function maskCEP(input) {
    input.addEventListener('input', () => {
      let v = input.value.replace(/\D/g, '').slice(0, 8);
      if (v.length > 5) v = `${v.slice(0, 5)}-${v.slice(5)}`;
      input.value = v;

      if (v.replace(/\D/g, '').length === 8) {
        lookupCEP(v.replace(/\D/g, ''));
      }
    });
  }

  async function lookupCEP(cep) {
    const statusEl = document.getElementById('ck-cep-status');
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--azul);">Buscando CEP...</span>';

    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();
      if (data.erro) {
        if (statusEl) statusEl.innerHTML = '<span style="color:var(--vermelho);">CEP nao encontrado</span>';
        return;
      }

      const fields = {
        'ck-endereco': data.logradouro || '',
        'ck-bairro': data.bairro || '',
        'ck-cidade': data.localidade || '',
        'ck-estado': data.uf || '',
      };

      Object.entries(fields).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el && val) el.value = val;
      });

      if (statusEl) statusEl.innerHTML = '<span style="color:var(--verde-claro);">&#9989; CEP encontrado</span>';
    } catch (e) {
      if (statusEl) statusEl.innerHTML = '<span style="color:var(--cinza-500);">Nao foi possivel buscar o CEP</span>';
    }
  }

  // ======= ORDER SUBMISSION =======

  async function submitOrder() {
    if (isProcessing) return;
    isProcessing = true;

    const cart = AppState.get('cart') || [];
    const customer = getCustomerData();
    const paymentMethod = getPaymentMethod();
    const totals = calcTotals();
    const orderNumber = Utils.generateOrderNumber();

    const orderData = {
      orderNumber,
      items: cart.map(item => ({
        productId: item.productId,
        nome: item.nome,
        peso: item.peso,
        preco: item.preco,
        precoOriginal: item.precoOriginal,
        quantidade: item.quantidade,
        isSubscription: item.isSubscription,
        frequency: item.frequency,
      })),
      customer,
      paymentMethod,
      coupon: appliedCoupon,
      subtotal: totals.subtotal,
      discount: totals.couponDiscount,
      shipping: totals.shippingCost,
      total: totals.total,
      createdAt: new Date().toISOString(),
    };

    try {
      // Try API call
      const response = await fetch(`${API_BASE}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData),
      });

      if (response.ok) {
        const apiResult = await response.json();
        orderResult = {
          orderNumber: apiResult.orderNumber || orderNumber,
          paymentMethod,
          pixCode: apiResult.pixCode || null,
          checkoutUrl: apiResult.checkoutUrl || null,
          boletoUrl: apiResult.boletoUrl || null,
        };
      } else {
        throw new Error('API error');
      }
    } catch (e) {
      // Fallback: simulate order locally
      console.warn('API unavailable, processing order locally:', e.message);
      orderResult = {
        orderNumber,
        paymentMethod,
        pixCode: paymentMethod === 'pix' ? generateLocalPixCode(orderNumber, totals.total) : null,
        checkoutUrl: paymentMethod === 'credit_card' ? null : null,
        boletoUrl: paymentMethod === 'boleto' ? null : null,
      };
    }

    // Save order to local history
    const savedOrder = { ...orderData, status: 'pendente', id: orderResult.orderNumber };
    const orders = Storage.get('order_history') || [];
    orders.push(savedOrder);
    Storage.set('order_history', orders);

    // Save last order for pedido.html confirmation page
    Storage.set('lastOrder', savedOrder);

    // ── Save to Firestore (real database) ──
    if (typeof FirestoreService !== 'undefined') {
      try {
        FirestoreService.init();
        // Save order - use 'centro' as default store for online orders
        const storeId = savedOrder.loja || 'centro';
        savedOrder.loja = storeId;
        savedOrder.numero = orderResult.orderNumber;
        savedOrder.data = savedOrder.createdAt;
        await FirestoreService.Orders.save(storeId, savedOrder);
        // Save/update customer
        if (customer.email || customer.telefone) {
          const customerId = (customer.email || customer.telefone).replace(/[^a-zA-Z0-9]/g, '_');
          await FirestoreService.Customers.save({
            id: customerId,
            ...customer,
            ultimoPedido: savedOrder.createdAt,
            totalPedidos: 1,
          });
        }
        console.log('[Checkout] Order saved to Firestore:', orderResult.orderNumber);
      } catch (fsErr) {
        console.warn('[Checkout] Firestore save failed (will sync later):', fsErr.message);
      }
    }

    // Track affiliate referral if present
    if (typeof ReferralTracker !== 'undefined') {
      const ref = ReferralTracker.getActiveReferral();
      if (ref) {
        // Store referral data with the order for admin processing
        savedOrder.referral = ref.code;
        Storage.set('lastOrder', savedOrder);
        // Record the sale for affiliate commission (processed by admin module)
        const affiliateSales = Storage.get('metas_affiliate_sales') || [];
        const parsed = ref.code.split('-');
        const tipo = parsed[0] === 'f' ? 'funcionario' : parsed[0] === 'i' ? 'influencer' : 'unknown';
        const codigo = parsed[parsed.length - 1];
        const affiliates = Storage.get('metas_affiliates') || [];
        const affiliate = affiliates.find(a => a.codigo === codigo && a.ativo);
        if (affiliate) {
          const comissaoPct = affiliate.comissaoPct || (tipo === 'influencer' ? 5 : 3);
          const comissao = +(savedOrder.total * (comissaoPct / 100)).toFixed(2);
          affiliateSales.push({
            id: 'ASALE-' + Date.now(),
            affiliateId: affiliate.id,
            affiliateCodigo: affiliate.codigo,
            affiliateNome: affiliate.nome,
            affiliateTipo: affiliate.tipo,
            orderNumero: savedOrder.id || savedOrder.numero,
            orderTotal: savedOrder.total,
            comissao,
            comissaoPct,
            data: new Date().toISOString(),
            status: 'pendente',
          });
          Storage.set('metas_affiliate_sales', affiliateSales);
          affiliate.totalVendas = (affiliate.totalVendas || 0) + savedOrder.total;
          affiliate.totalComissao = (affiliate.totalComissao || 0) + comissao;
          affiliate.totalPedidos = (affiliate.totalPedidos || 0) + 1;
          Storage.set('metas_affiliates', affiliates);
          // Save affiliate sale to Firestore
          if (typeof FirestoreService !== 'undefined') {
            try {
              const afSaleDoc = affiliateSales[affiliateSales.length - 1];
              await FirestoreService.init();
              const adb = FirestoreService._db || null;
              if (adb) {
                adb.collection('afiliado_sales').doc(afSaleDoc.id).set(afSaleDoc);
                adb.collection('afiliados').doc(affiliate.id).set(affiliate, { merge: true });
              }
            } catch(e) { console.warn('[Checkout] Affiliate Firestore save failed:', e.message); }
          }
        }
        // Clear referral after conversion
        Storage.remove('affiliate_ref');
      }
    }

    // Handle subscription items
    const subItems = cart.filter(i => i.isSubscription);
    if (subItems.length > 0) {
      Subscriptions.createFromOrder(subItems, customer);
    }

    // Save customer for returning visits
    saveCustomer(customer);

    // Clear the cart after successful order
    AppState.clearCart();

    isProcessing = false;
    currentStep = 4;
    renderCurrentStep();
  }

  function generateLocalPixCode(orderNum, total) {
    // Generate a simulated PIX code (copia-e-cola format)
    const cleanTotal = total.toFixed(2).replace('.', '');
    return `00020126580014BR.GOV.BCB.PIX0136clubedonatural-${orderNum}520400005303986540${cleanTotal}5802BR5925CLUBE DO NATURAL LTDA6009SAO PAULO62070503***6304`;
  }

  // ======= PUBLIC API =======

  function open() {
    const modal = document.getElementById('checkout-modal');
    const backdrop = document.getElementById('checkout-backdrop');
    if (!modal) return;

    currentStep = 1;
    orderResult = null;
    isProcessing = false;

    modal.classList.add('active');
    if (backdrop) backdrop.classList.add('active');
    document.body.style.overflow = 'hidden';

    renderCurrentStep();
  }

  function close() {
    const modal = document.getElementById('checkout-modal');
    const backdrop = document.getElementById('checkout-backdrop');
    if (modal) modal.classList.remove('active');
    if (backdrop) backdrop.classList.remove('active');
    document.body.style.overflow = '';
  }

  function goNext() {
    const cart = AppState.get('cart') || [];

    if (currentStep === 1) {
      if (cart.length === 0) {
        Toast.warning('Adicione itens ao carrinho');
        return;
      }
      currentStep = 2;
    } else if (currentStep === 2) {
      if (!validateStep2()) return;
      currentStep = 3;
    } else if (currentStep === 3) {
      submitOrder();
      return; // submitOrder handles the step change
    }

    renderCurrentStep();
  }

  function goBack() {
    if (currentStep > 1) {
      currentStep--;
      renderCurrentStep();
    }
  }

  function init() {
    // Bind modal close
    const closeBtn = document.getElementById('ck-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', close);

    const backdrop = document.getElementById('checkout-backdrop');
    if (backdrop) backdrop.addEventListener('click', close);

    // Navigation
    const backBtn = document.getElementById('ck-nav-back');
    const nextBtn = document.getElementById('ck-nav-next');
    if (backBtn) backBtn.addEventListener('click', goBack);
    if (nextBtn) nextBtn.addEventListener('click', goNext);

    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const modal = document.getElementById('checkout-modal');
        if (modal && modal.classList.contains('active')) close();
      }
    });
  }

  return { init, open, close, goNext, goBack };
})();
