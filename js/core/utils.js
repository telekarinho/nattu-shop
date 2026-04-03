/* ============================================
   CLUBE DO NATURAL — Utilitários
   Formatação, cálculos, helpers
   ============================================ */

const Utils = {
  // === FORMATAÇÃO ===
  formatBRL(value) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  },

  formatDate(date) {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(date));
  },

  formatDateTime(date) {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  },

  formatPhone(phone) {
    const clean = phone.replace(/\D/g, '');
    if (clean.length === 11) {
      return `(${clean.slice(0,2)}) ${clean.slice(2,7)}-${clean.slice(7)}`;
    }
    return phone;
  },

  formatCPF(cpf) {
    const clean = cpf.replace(/\D/g, '');
    if (clean.length === 11) {
      return `${clean.slice(0,3)}.${clean.slice(3,6)}.${clean.slice(6,9)}-${clean.slice(9)}`;
    }
    return cpf;
  },

  formatCNPJ(cnpj) {
    const clean = cnpj.replace(/\D/g, '');
    if (clean.length === 14) {
      return `${clean.slice(0,2)}.${clean.slice(2,5)}.${clean.slice(5,8)}/${clean.slice(8,12)}-${clean.slice(12)}`;
    }
    return cnpj;
  },

  // === VALIDAÇÃO ===
  isValidCPF(cpf) {
    const clean = cpf.replace(/\D/g, '');
    if (clean.length !== 11 || /^(\d)\1+$/.test(clean)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(clean[i]) * (10 - i);
    let check = 11 - (sum % 11);
    if (check >= 10) check = 0;
    if (parseInt(clean[9]) !== check) return false;
    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(clean[i]) * (11 - i);
    check = 11 - (sum % 11);
    if (check >= 10) check = 0;
    return parseInt(clean[10]) === check;
  },

  isValidPhone(phone) {
    return /^\d{10,11}$/.test(phone.replace(/\D/g, ''));
  },

  isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  },

  // === CÁLCULOS ===
  calcDeliveryFee(distance) {
    if (distance <= 2) return 0;
    if (distance <= 5) return 5.99;
    if (distance <= 10) return 9.99;
    return 14.99;
  },

  calcSubscriptionSavings(preco, descontoPercent, frequenciaDias) {
    const precoAssinatura = preco * (1 - descontoPercent / 100);
    const economiaAnual = (preco - precoAssinatura) * (365 / frequenciaDias);
    return {
      precoAssinatura,
      economiaPorCompra: preco - precoAssinatura,
      economiaAnual,
      comprasAno: Math.floor(365 / frequenciaDias),
    };
  },

  // === GEOLOCALIZAÇÃO ===
  async getCurrentPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocalização não suportada'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        err => reject(err),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  },

  calcDistance(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) ** 2 + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  },

  // === DOM ===
  $(selector, parent = document) {
    return parent.querySelector(selector);
  },

  $$(selector, parent = document) {
    return [...parent.querySelectorAll(selector)];
  },

  createElement(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'className') el.className = v;
      else if (k === 'innerHTML') el.innerHTML = v;
      else if (k === 'textContent') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset') Object.entries(v).forEach(([dk, dv]) => el.dataset[dk] = dv);
      else el.setAttribute(k, v);
    });
    children.forEach(child => {
      if (typeof child === 'string') el.appendChild(document.createTextNode(child));
      else if (child) el.appendChild(child);
    });
    return el;
  },

  // === HELPERS ===
  debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  },

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  },

  generateOrderNumber() {
    const now = new Date();
    const prefix = 'CDN';
    const date = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    const seq = String(Math.floor(Math.random() * 9999)).padStart(4, '0');
    return `${prefix}${date}${seq}`;
  },

  slugify(text) {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  },

  whatsappLink(phone, message) {
    const clean = phone.replace(/\D/g, '');
    const num = clean.startsWith('55') ? clean : '55' + clean;
    return `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
  },

  // Confetti simples
  confetti(container = document.body) {
    const colors = ['#52B788', '#C4972A', '#E63946', '#457B9D', '#F4A261', '#2D6A4F'];
    const pieces = 50;
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden;';

    for (let i = 0; i < pieces; i++) {
      const piece = document.createElement('div');
      const size = Math.random() * 8 + 4;
      piece.style.cssText = `
        position:absolute;
        width:${size}px;height:${size * 1.5}px;
        background:${colors[Math.floor(Math.random() * colors.length)]};
        left:${Math.random() * 100}%;
        top:-20px;
        border-radius:${Math.random() > 0.5 ? '50%' : '2px'};
        animation:confetti-fall ${Math.random() * 2 + 1.5}s ease-in forwards;
        animation-delay:${Math.random() * 0.5}s;
      `;
      wrapper.appendChild(piece);
    }

    container.appendChild(wrapper);
    setTimeout(() => wrapper.remove(), 4000);
  },

  // Selo label
  seloLabel(selo) {
    const labels = {
      organico: 'Org\u00e2nico',
      vegano: 'Vegano',
      sem_gluten: 'Sem Gl\u00faten',
      integral: 'Integral',
      premium: 'Premium',
      sem_lactose: 'Sem Lactose',
      sem_acucar: 'Sem A\u00e7\u00facar',
    };
    return labels[selo] || selo;
  },

  seloIcon(selo) {
    const icons = {
      organico: '\uD83C\uDF3F',
      vegano: '\uD83E\uDD6C',
      sem_gluten: '\uD83C\uDF3E',
      integral: '\uD83E\uDD5C',
      premium: '\u2B50',
      sem_lactose: '\uD83E\uDD5B',
      sem_acucar: '\uD83D\uDEAB',
    };
    return icons[selo] || '\u2705';
  },

  // Input masks
  maskPhone(input) {
    input.addEventListener('input', () => {
      let v = input.value.replace(/\D/g, '').slice(0, 11);
      if (v.length > 6) v = `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
      else if (v.length > 2) v = `(${v.slice(0,2)}) ${v.slice(2)}`;
      input.value = v;
    });
  },

  maskCPF(input) {
    input.addEventListener('input', () => {
      let v = input.value.replace(/\D/g, '').slice(0, 11);
      if (v.length > 9) v = `${v.slice(0,3)}.${v.slice(3,6)}.${v.slice(6,9)}-${v.slice(9)}`;
      else if (v.length > 6) v = `${v.slice(0,3)}.${v.slice(3,6)}.${v.slice(6)}`;
      else if (v.length > 3) v = `${v.slice(0,3)}.${v.slice(3)}`;
      input.value = v;
    });
  },

  maskMoney(input) {
    input.addEventListener('input', () => {
      let v = input.value.replace(/\D/g, '');
      v = (parseInt(v || '0') / 100).toFixed(2);
      input.value = v;
    });
  },
};
