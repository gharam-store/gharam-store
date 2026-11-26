'use strict';

const state = {
  products: [],
  categories: [],
  activeCategory: '',
  query: '',
  cart: JSON.parse(localStorage.getItem('gharam_cart') || '[]'),
  config: { whatsapp: '', currency: 'جنيه' }
};

const $ = (sel) => document.querySelector(sel);

async function api(path, options) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'حصل خطأ، حاول تاني');
  return data;
}

function saveCart() {
  localStorage.setItem('gharam_cart', JSON.stringify(state.cart));
}

function cartCount() {
  return state.cart.reduce((sum, i) => sum + i.qty, 0);
}

function cartTotal() {
  return state.cart.reduce((sum, i) => {
    const p = state.products.find((x) => x.id === i.productId);
    return sum + (p ? p.price * i.qty : 0);
  }, 0);
}

function fmt(n) { return n + ' ' + state.config.currency; }

/* ---------- المنتجات ---------- */

async function loadConfig() {
  state.config = await api('/api/config');
  const select = $('#governorate-select');
  for (const gov of state.config.governorates || []) {
    const opt = document.createElement('option');
    opt.value = gov;
    opt.textContent = gov;
    select.appendChild(opt);
  }
}

async function loadCategories() {
  const data = await api('/api/categories');
  state.categories = data.categories;
  renderChips();
}

async function loadProducts() {
  const params = new URLSearchParams();
  if (state.activeCategory) params.set('category', state.activeCategory);
  if (state.query) params.set('q', state.query);
  const data = await api('/api/products?' + params.toString());
  state.products = data.products;
  renderProducts();
}

function renderChips() {
  const wrap = $('#category-chips');
  wrap.innerHTML = '';
  const all = [''].concat(state.categories);
  for (const cat of all) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip' + (state.activeCategory === cat ? ' active' : '');
    btn.textContent = cat || 'الكل';
    btn.addEventListener('click', () => {
      state.activeCategory = cat;
      renderChips();
      loadProducts();
    });
    wrap.appendChild(btn);
  }
}

function renderProducts() {
  const grid = $('#products-grid');
  grid.innerHTML = '';
  $('#empty-msg').hidden = state.products.length > 0;
  for (const p of state.products) {
    const inCart = state.cart.find((i) => i.productId === p.id);
    const remaining = p.stock - (inCart ? inCart.qty : 0);
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML =
      '<div class="card-emoji">' + p.emoji + '</div>' +
      '<span class="card-cat">' + p.category + '</span>' +
      '<h3 class="card-name"></h3>' +
      '<p class="card-desc"></p>' +
      '<div class="card-foot">' +
        '<span class="card-price">' + fmt(p.price) + '</span>' +
        '<span class="stock-badge' + (remaining <= 2 ? ' low' : '') + '">' +
          (remaining > 0 ? 'متاح ' + remaining : 'خلص') + '</span>' +
      '</div>';
    card.querySelector('.card-name').textContent = p.name;
    card.querySelector('.card-desc').textContent = p.description;
    const btn = document.createElement('button');
    btn.className = 'add-btn';
    btn.type = 'button';
    btn.textContent = remaining > 0 ? 'أضف للسلة 🧺' : 'غير متاح';
    btn.disabled = remaining <= 0;
    btn.addEventListener('click', () => addToCart(p.id));
    card.querySelector('.card-foot').appendChild(btn);
    grid.appendChild(card);
  }
}

/* ---------- السلة ---------- */

function addToCart(productId) {
  const item = state.cart.find((i) => i.productId === productId);
  const product = state.products.find((p) => p.id === productId);
  const current = item ? item.qty : 0;
  if (product && current >= product.stock) return;
  if (item) item.qty += 1;
  else state.cart.push({ productId, qty: 1 });
  saveCart();
  refreshCartUI();
  renderProducts();
  openCart();
}

function setQty(productId, qty) {
  const product = state.products.find((p) => p.id === productId);
  if (qty <= 0) {
    state.cart = state.cart.filter((i) => i.productId !== productId);
  } else {
    const item = state.cart.find((i) => i.productId === productId);
    if (item) item.qty = product ? Math.min(qty, product.stock) : qty;
  }
  saveCart();
  refreshCartUI();
  renderProducts();
}

function refreshCartUI() {
  $('#cart-count').textContent = cartCount();
  $('#cart-total').textContent = fmt(cartTotal());
  const wrap = $('#cart-items');
  wrap.innerHTML = '';
  if (state.cart.length === 0) {
    wrap.innerHTML = '<p class="cart-empty">سلتك فاضية لسه 🧺</p>';
    return;
  }
  for (const item of state.cart) {
    const p = state.products.find((x) => x.id === item.productId);
    if (!p) continue;
    const row = document.createElement('div');
    row.className = 'cart-item';
    row.innerHTML =
      '<span class="ci-emoji">' + p.emoji + '</span>' +
      '<div class="ci-info"><div class="ci-name"></div>' +
      '<div class="ci-price">' + fmt(p.price) + ' × ' + item.qty + '</div></div>';
    row.querySelector('.ci-name').textContent = p.name;
    const controls = document.createElement('div');
    controls.className = 'qty-controls';
    const minus = document.createElement('button');
    minus.type = 'button'; minus.textContent = '−';
    minus.addEventListener('click', () => setQty(p.id, item.qty - 1));
    const label = document.createElement('span');
    label.textContent = item.qty;
    const plus = document.createElement('button');
    plus.type = 'button'; plus.textContent = '+';
    plus.addEventListener('click', () => setQty(p.id, item.qty + 1));
    controls.append(minus, label, plus);
    row.appendChild(controls);
    wrap.appendChild(row);
  }
}

function openCart() {
  $('#cart-drawer').hidden = false;
  $('#overlay').hidden = false;
}

function closeCart() {
  $('#cart-drawer').hidden = true;
  $('#overlay').hidden = true;
}

/* ---------- الطلب ---------- */

function buildWhatsappLink(order) {
  const lines = [
    'طلب جديد من متجر غرام 🧶',
    'رقم الطلب: ' + order.id,
    'الاسم: ' + order.customer.name,
    'التليفون: ' + order.customer.phone,
    'المحافظة: ' + (order.customer.governorate || ''),
    'العنوان: ' + order.customer.address,
    'الأصناف:'
  ];
  for (const i of order.items) {
    lines.push('- ' + i.name + ' × ' + i.qty + ' = ' + (i.price * i.qty) + ' جنيه');
  }
  lines.push('الإجمالي: ' + order.total + ' جنيه');
  if (order.customer.notes) lines.push('ملاحظات: ' + order.customer.notes);
  return 'https://wa.me/' + state.config.whatsapp + '?text=' + encodeURIComponent(lines.join('\n'));
}

async function submitOrder(event) {
  event.preventDefault();
  const errEl = $('#form-error');
  errEl.hidden = true;
  const btn = $('#submit-order');
  btn.disabled = true;
  const form = event.target;
  const payload = {
    customer: {
      name: form.name.value.trim(),
      phone: form.phone.value.trim(),
      governorate: form.governorate.value,
      address: form.address.value.trim(),
      notes: form.notes.value.trim()
    },
    items: state.cart.map((i) => ({ productId: i.productId, qty: i.qty }))
  };
  try {
    const data = await api('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const order = data.order;
    $('#order-id').textContent = order.id;
    $('#order-total').textContent = fmt(order.total);
    $('#whatsapp-link').href = buildWhatsappLink(order);
    $('#checkout-form').hidden = true;
    $('#order-success').hidden = true;
    $('#order-success').hidden = false;
    state.cart = [];
    saveCart();
    refreshCartUI();
    await loadProducts();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
  }
}

/* ---------- الإدارة ---------- */

function askAdminKey() {
  return sessionStorage.getItem('gharam_admin_key') || prompt('اكتب كود الإدارة:') || '';
}

async function addProductForm(panel) {
  const key = askAdminKey();
  if (!key) return;
  sessionStorage.setItem('gharam_admin_key', key);
  panel.hidden = false;
  panel.innerHTML =
    '<h4>إضافة منتج جديد</h4>' +
    '<form id="admin-product-form">' +
      '<input name="name" class="full" placeholder="اسم المنتج" required>' +
      '<input name="description" class="full" placeholder="الوصف">' +
      '<input name="category" placeholder="التصنيف (مثال: دمى)">' +
      '<input name="emoji" placeholder="إيموجي (اختياري)">' +
      '<input name="price" type="number" min="1" step="1" placeholder="السعر" required>' +
      '<input name="stock" type="number" min="0" step="1" placeholder="المخزون" required>' +
      '<button class="btn primary full" type="submit">حفظ المنتج</button>' +
    '</form>' +
    '<p id="admin-msg" class="admin-msg"></p>';
  panel.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const msg = panel.querySelector('#admin-msg');
    try {
      await api('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': key },
        body: JSON.stringify({
          name: f.name.value, description: f.description.value,
          category: f.category.value, emoji: f.emoji.value,
          price: Number(f.price.value), stock: Number(f.stock.value)
        })
      });
      msg.textContent = '✅ المنتج اتضاف.';
      f.reset();
      await loadCategories();
      await loadProducts();
    } catch (err) {
      msg.textContent = '❌ ' + err.message;
    }
  });
}

async function showOrders(panel) {
  const key = askAdminKey();
  if (!key) return;
  sessionStorage.setItem('gharam_admin_key', key);
  panel.hidden = false;
  try {
    const data = await api('/api/orders', { headers: { 'x-admin-key': key } });
    if (data.orders.length === 0) {
      panel.innerHTML = '<p>لا توجد طلبات لسه.</p>';
      return;
    }
    let html = '<h4>الطلبات (' + data.count + ')</h4><table class="orders-table">' +
      '<thead><tr><th>رقم</th><th>العميل</th><th>التليفون</th><th>الإجمالي</th><th>التاريخ</th></tr></thead><tbody>';
    for (const o of data.orders.slice().reverse()) {
      html += '<tr><td>' + o.id + '</td><td></td><td>' + o.customer.phone + '</td><td>' +
        o.total + ' جنيه</td><td>' + new Date(o.createdAt).toLocaleString('ar-EG') + '</td></tr>';
    }
    html += '</tbody></table>';
    panel.innerHTML = html;
    const rows = panel.querySelectorAll('tbody tr');
    data.orders.slice().reverse().forEach((o, idx) => {
      rows[idx].children[1].textContent = o.customer.name;
    });
  } catch (err) {
    panel.innerHTML = '<p>❌ ' + err.message + '</p>';
  }
}

/* ---------- تشغيل ---------- */

async function init() {
  $('#cart-btn').addEventListener('click', openCart);
  $('#cart-close').addEventListener('click', closeCart);
  $('#overlay').addEventListener('click', closeCart);
  $('#checkout-form').addEventListener('submit', submitOrder);
  $('#add-product-btn').addEventListener('click', () => addProductForm($('#admin-panel')));
  $('#view-orders-btn').addEventListener('click', () => showOrders($('#admin-panel')));
  let debounce;
  $('#search-input').addEventListener('input', (e) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      state.query = e.target.value.trim();
      loadProducts();
    }, 250);
  });
  await loadConfig();
  await loadCategories();
  await loadProducts();
  refreshCartUI();
}

init().catch((err) => {
  document.body.insertAdjacentHTML('beforeend',
    '<p style="text-align:center;color:#b3261e;padding:20px">حصل خطأ في تحميل المتجر: ' + err.message + '</p>');
});
