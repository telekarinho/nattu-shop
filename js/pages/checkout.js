/* ============================================
   CLUBE DO NATURAL — Checkout Page Controller
   4 etapas: Dados → Loja → Entrega → Pagamento
   ============================================ */

const CheckoutPage = {
  currentStep: 1,
  totalSteps: 4,

  init() {
    Storage.init();
    AppState.restore();
    Toast.init();

    // Check if cart is empty
    if (AppState.getCartCount() === 0) {
      window.location.href = 'catalogo.html';
      return;
    }

    this.renderOrderSummary();
    this.bindNavigation();
    this.bindStep1();
    this.bindStep2();
    this.bindStep3();
    this.bindStep4();
    this.showStep(1);

    // Apply masks
    const phoneInput = document.getElementById('checkout-phone');
    const cpfInput = document.getElementById('checkout-cpf');
    if (phoneInput) Utils.maskPhone(phoneInput);
    if (cpfInput) Utils.maskCPF(cpfInput);
  },

  // === NAVIGATION ===
  showStep(step) {
    this.currentStep = step;

    // Update panels
    document.querySelectorAll('.checkout-step').forEach(panel => {
      panel.classList.toggle('active', parseInt(panel.dataset.step) === step);
    });

    // Update stepper
    document.querySelectorAll('.stepper-step').forEach(s => {
      const sStep = parseInt(s.dataset.step);
      s.classList.toggle('active', sStep === step);
      s.classList.toggle('completed', sStep < step);
    });
    document.querySelectorAll('.stepper-line').forEach((line, i) => {
      line.classList.toggle('completed', i + 1 < step);
    });

    // Update buttons
    const backBtn = document.getElementById('checkout-back');
    const nextBtn = document.getElementById('checkout-next');
    const confirmBtn = document.getElementById('checkout-confirm');

    if (backBtn) backBtn.style.display = step > 1 ? 'inline-flex' : 'none';
    if (nextBtn) nextBtn.style.display = step < this.totalSteps ? 'inline-flex' : 'none';
    if (confirmBtn) confirmBtn.style.display = step === this.totalSteps ? 'inline-flex' : 'none';

    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  bindNavigation() {
    const backBtn = document.getElementById('checkout-back');
    const nextBtn = document.getElementById('checkout-next');
    const confirmBtn = document.getElementById('checkout-confirm');

    if (backBtn) backBtn.addEventListener('click', () => {
      if (this.currentStep > 1) this.showStep(this.currentStep - 1);
    });

    if (nextBtn) nextBtn.addEventListener('click', () => {
      if (this.validateStep(this.currentStep)) {
        this.showStep(this.currentStep + 1);
      }
    });

    if (confirmBtn) confirmBtn.addEventListener('click', () => {
      if (this.validateStep(this.currentStep)) {
        this.submitOrder();
      }
    });

    // Stepper click
    document.querySelectorAll('.stepper-step').forEach(s => {
      s.addEventListener('click', () => {
        const targetStep = parseInt(s.dataset.step);
        if (targetStep < this.currentStep) {
          this.showStep(targetStep);
        }
      });
    });
  },

  validateStep(step) {
    switch (step) {
      case 1: return this.validateStep1();
      case 2: return this.validateStep2();
      case 3: return this.validateStep3();
      case 4: return this.validateStep4();
      default: return true;
    }
  },

  // === STEP 1: DADOS ===
  bindStep1() {
    // Auto-fill from saved data
    const saved = AppState.get('checkoutData');
    if (saved && saved.cliente) {
      const nameInput = document.getElementById('checkout-name');
      const phoneInput = document.getElementById('checkout-phone');
      if (nameInput && saved.cliente.nome) nameInput.value = saved.cliente.nome;
      if (phoneInput && saved.cliente.celular) phoneInput.value = saved.cliente.celular;
    }
  },

  validateStep1() {
    const name = document.getElementById('checkout-name');
    const phone = document.getElementById('checkout-phone');

    let valid = true;

    if (!name || !name.value.trim() || name.value.trim().length < 3) {
      name.classList.add('invalid');
      Toast.error('Preencha seu nome completo');
      valid = false;
    } else {
      name.classList.remove('invalid');
    }

    if (!phone || !Utils.isValidPhone(phone.value)) {
      phone.classList.add('invalid');
      if (valid) Toast.error('Preencha um celular válido');
      valid = false;
    } else {
      phone.classList.remove('invalid');
    }

    if (valid) {
      const data = AppState.get('checkoutData');
      data.cliente = {
        nome: name.value.trim(),
        celular: phone.value,
        cpf: document.getElementById('checkout-cpf')?.value || '',
        email: document.getElementById('checkout-email')?.value || '',
      };
      AppState.set('checkoutData', data);
    }

    return valid;
  },

  // === STEP 2: LOJA ===
  bindStep2() {
    // Store cards
    document.querySelectorAll('.store-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.store-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');

        const storeId = card.dataset.storeId;
        const store = DataStores.find(s => s.id === storeId);

        const data = AppState.get('checkoutData');
        data.loja = store;
        AppState.set('checkoutData', data);

        // Update step 3 store info
        const storeInfo = document.getElementById('selected-store-info');
        if (storeInfo && store) {
          storeInfo.textContent = `${store.nome} — ${store.endereco}`;
        }
      });
    });

    // Geolocation button
    const geoBtn = document.getElementById('geo-btn');
    if (geoBtn) {
      geoBtn.addEventListener('click', async () => {
        geoBtn.classList.add('loading');
        geoBtn.textContent = 'Localizando...';
        try {
          const pos = await Utils.getCurrentPosition();
          // Sort stores by distance
          const storesWithDist = DataStores.map(store => ({
            ...store,
            distance: Utils.calcDistance(pos.lat, pos.lng, store.lat, store.lng),
          })).sort((a, b) => a.distance - b.distance);

          // Update distance display on cards
          storesWithDist.forEach(store => {
            const card = document.querySelector(`[data-store-id="${store.id}"]`);
            const distEl = card?.querySelector('.store-distance');
            if (distEl) {
              distEl.textContent = `${store.distance.toFixed(1)} km`;
              distEl.style.display = 'inline';
            }
          });

          // Auto-select nearest
          const nearestCard = document.querySelector(`[data-store-id="${storesWithDist[0].id}"]`);
          if (nearestCard) nearestCard.click();

          Toast.success(`Loja mais próxima: ${storesWithDist[0].nome} (${storesWithDist[0].distance.toFixed(1)}km)`);
        } catch (err) {
          Toast.error('Não foi possível acessar sua localização');
        } finally {
          geoBtn.classList.remove('loading');
          geoBtn.textContent = '📍 Usar minha localização';
        }
      });
    }
  },

  validateStep2() {
    const data = AppState.get('checkoutData');
    if (!data.loja) {
      Toast.error('Selecione uma loja');
      return false;
    }
    return true;
  },

  // === STEP 3: ENTREGA ===
  bindStep3() {
    document.querySelectorAll('input[name="delivery-type"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const deliveryForm = document.getElementById('delivery-address-form');
        const data = AppState.get('checkoutData');

        if (radio.value === 'delivery') {
          if (deliveryForm) deliveryForm.style.display = 'block';
          data.entrega.tipo = 'delivery';
        } else {
          if (deliveryForm) deliveryForm.style.display = 'none';
          data.entrega.tipo = 'retirada';
          data.entrega.taxa = 0;
        }
        AppState.set('checkoutData', data);
        this.renderOrderSummary();
      });
    });

    // CEP auto-calculate fee
    const cepInput = document.getElementById('delivery-cep');
    if (cepInput) {
      cepInput.addEventListener('blur', () => {
        // Simulated fee based on a rough distance
        const data = AppState.get('checkoutData');
        data.entrega.taxa = 7.99; // mockado
        AppState.set('checkoutData', data);

        const feeDisplay = document.getElementById('delivery-fee-display');
        if (feeDisplay) feeDisplay.textContent = Utils.formatBRL(7.99);
        this.renderOrderSummary();
      });
    }
  },

  validateStep3() {
    const data = AppState.get('checkoutData');
    if (data.entrega.tipo === 'delivery') {
      const rua = document.getElementById('delivery-street');
      const numero = document.getElementById('delivery-number');
      const bairro = document.getElementById('delivery-bairro');

      if (!rua?.value?.trim()) {
        Toast.error('Preencha o endereço');
        return false;
      }
      if (!numero?.value?.trim()) {
        Toast.error('Preencha o número');
        return false;
      }
      if (!bairro?.value?.trim()) {
        Toast.error('Preencha o bairro');
        return false;
      }

      data.entrega.endereco = `${rua.value}, ${numero.value}`;
      data.entrega.complemento = document.getElementById('delivery-complement')?.value || '';
      data.entrega.bairro = bairro.value;
      data.entrega.cep = document.getElementById('delivery-cep')?.value || '';
      AppState.set('checkoutData', data);
    }
    return true;
  },

  // === STEP 4: PAGAMENTO ===
  bindStep4() {
    document.querySelectorAll('input[name="payment-type"]').forEach(radio => {
      radio.addEventListener('change', () => {
        document.querySelectorAll('.payment-detail').forEach(d => d.style.display = 'none');
        const detail = document.getElementById(`payment-${radio.value}`);
        if (detail) detail.style.display = 'block';

        const data = AppState.get('checkoutData');
        data.pagamento.tipo = radio.value;
        AppState.set('checkoutData', data);
      });
    });

    // Copy PIX code
    const copyPix = document.getElementById('copy-pix-btn');
    if (copyPix) {
      copyPix.addEventListener('click', () => {
        const code = document.getElementById('pix-code')?.textContent || '';
        navigator.clipboard.writeText(code).then(() => {
          Toast.success('Código PIX copiado!');
        }).catch(() => {
          Toast.info('Selecione e copie o código manualmente');
        });
      });
    }
  },

  validateStep4() {
    const data = AppState.get('checkoutData');
    if (!data.pagamento.tipo) {
      Toast.error('Selecione a forma de pagamento');
      return false;
    }
    return true;
  },

  // === ORDER SUMMARY ===
  renderOrderSummary() {
    const cart = AppState.get('cart');
    const data = AppState.get('checkoutData');

    // Items list
    const itemsList = document.getElementById('summary-items');
    if (itemsList) {
      itemsList.innerHTML = cart.map(item => `
        <div class="summary-item">
          <span>${item.quantidade}x ${item.nome} (${item.peso})
            ${item.isSubscription ? ' 🔄' : ''}
          </span>
          <span>${Utils.formatBRL(item.preco * item.quantidade)}</span>
        </div>
      `).join('');
    }

    // Totals
    const subtotal = AppState.getCartTotal();
    const deliveryFee = data.entrega?.taxa || 0;
    const total = subtotal + deliveryFee;

    const subtotalEl = document.getElementById('summary-subtotal');
    const feeEl = document.getElementById('summary-fee');
    const totalEl = document.getElementById('summary-total');

    if (subtotalEl) subtotalEl.textContent = Utils.formatBRL(subtotal);
    if (feeEl) feeEl.textContent = deliveryFee > 0 ? Utils.formatBRL(deliveryFee) : 'Grátis';
    if (totalEl) totalEl.textContent = Utils.formatBRL(total);

    // Subscription items
    const subItems = AppState.getCartSubscriptionItems();
    const subSection = document.getElementById('summary-subscription');
    if (subSection) {
      if (subItems.length > 0) {
        const monthlyTotal = subItems.reduce((sum, item) => sum + (item.preco * item.quantidade), 0);
        subSection.innerHTML = `
          <div style="margin-top:var(--space-3);padding:var(--space-3);background:linear-gradient(135deg,#E8F5E9,#C8E6C9);border-radius:var(--radius-md);">
            <strong>🔄 Assinatura mensal</strong><br>
            <span style="font-size:var(--fs-sm);color:var(--verde-medio);">
              ${subItems.length} item(ns) — ${Utils.formatBRL(monthlyTotal)}/mês
            </span>
          </div>
        `;
        subSection.style.display = 'block';
      } else {
        subSection.style.display = 'none';
      }
    }
  },

  // === SUBMIT ===
  submitOrder() {
    const data = AppState.get('checkoutData');
    const cart = AppState.get('cart');

    const order = {
      numero: Utils.generateOrderNumber(),
      data: new Date().toISOString(),
      cliente: data.cliente,
      loja: data.loja,
      entrega: data.entrega,
      pagamento: data.pagamento,
      itens: cart,
      subtotal: AppState.getCartTotal(),
      taxaEntrega: data.entrega?.taxa || 0,
      total: AppState.getCartTotal() + (data.entrega?.taxa || 0),
      status: 'novo',
      assinaturas: AppState.getCartSubscriptionItems().map(item => ({
        productId: item.productId,
        nome: item.nome,
        peso: item.peso,
        preco: item.preco,
        frequency: item.frequency,
      })),
    };

    // Save order
    const orders = Storage.get('orders') || [];
    orders.push(order);
    Storage.set('orders', orders);

    // Save subscriptions
    if (order.assinaturas.length > 0) {
      const subs = Storage.get('subscriptions') || [];
      order.assinaturas.forEach(sub => {
        subs.push({
          ...sub,
          id: Utils.generateId(),
          cliente: data.cliente,
          loja: data.loja,
          status: 'ativa',
          proximaEntrega: new Date(Date.now() + sub.frequency * 86400000).toISOString(),
          criadoEm: new Date().toISOString(),
        });
      });
      Storage.set('subscriptions', subs);
    }

    // Clear cart
    AppState.clearCart();

    // Redirect to confirmation
    Storage.set('lastOrder', order);
    window.location.href = `pedido.html?n=${order.numero}`;
  },
};

// Auto-init
document.addEventListener('DOMContentLoaded', () => {
  CheckoutPage.init();
});
