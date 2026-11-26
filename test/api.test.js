'use strict';

const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');

const { createApp } = require('../src/app');
const { createDb } = require('../src/db');

const ADMIN_KEY = process.env.ADMIN_KEY || 'gharam-admin';

function start() {
  const tmpFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gharam-')), 'store.json');
  const db = createDb(tmpFile);
  db.load();
  const server = http.createServer(createApp(db));
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, db, base: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

async function post(base, url, body, headers = {}) {
  const res = await fetch(base + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
  return { status: res.status, data: await res.json() };
}

const validOrder = {
  customer: { name: 'سليمة محمد', phone: '01550894660', governorate: 'دمياط', address: 'فارسكور، شارع الجمهورية', notes: '' },
  items: [{ productId: 'p6', qty: 2 }, { productId: 'p3', qty: 1 }]
};

test('GET /api/products يرجع المنتجات المبدئية كاملة البيانات', async () => {
  const { server, base } = await start();
  try {
    const res = await fetch(base + '/api/products');
    assert.equal(res.status, 200);
    const { products, count } = await res.json();
    assert.ok(count >= 8);
    for (const p of products) {
      assert.ok(p.id && p.name && p.description && p.category && p.emoji);
      assert.ok(Number.isFinite(p.price) && p.price > 0);
      assert.ok(Number.isInteger(p.stock) && p.stock >= 0);
    }
  } finally { server.close(); }
});

test('البحث والفلترة بالتصنيف يشتغلوا', async () => {
  const { server, base } = await start();
  try {
    const byCat = await (await fetch(base + '/api/products?category=' + encodeURIComponent('دمى'))).json();
    assert.ok(byCat.count >= 1);
    assert.ok(byCat.products.every((p) => p.category === 'دمى'));

    const search = await (await fetch(base + '/api/products?q=' + encodeURIComponent('بيبي'))).json();
    assert.ok(search.count >= 1);
    assert.ok(search.products.every((p) => (p.name + p.description).includes('بيبي')));

    const none = await (await fetch(base + '/api/products?q=' + encodeURIComponent('منتج_مش_موجود_خالص'))).json();
    assert.equal(none.count, 0);
  } finally { server.close(); }
});

test('GET /api/products/:id موجود وغير موجود', async () => {
  const { server, base } = await start();
  try {
    const ok = await fetch(base + '/api/products/p1');
    assert.equal(ok.status, 200);
    const missing = await fetch(base + '/api/products/nope');
    assert.equal(missing.status, 404);
  } finally { server.close(); }
});

test('POST /api/orders يرفض البيانات الناقصة', async () => {
  const { server, base } = await start();
  try {
    let r = await post(base, '/api/orders', { customer: validOrder.customer, items: [] });
    assert.equal(r.status, 400);

    r = await post(base, '/api/orders', {
      customer: { ...validOrder.customer, phone: 'abc' },
      items: validOrder.items
    });
    assert.equal(r.status, 400);

    r = await post(base, '/api/orders', {
      customer: { ...validOrder.customer, name: '' },
      items: validOrder.items
    });
    assert.equal(r.status, 400);

    r = await post(base, '/api/orders', {
      customer: validOrder.customer,
      items: [{ productId: 'p6', qty: 0 }]
    });
    assert.equal(r.status, 400);

    r = await post(base, '/api/orders', {
      customer: { ...validOrder.customer, governorate: 'محافظة مش موجودة' },
      items: validOrder.items
    });
    assert.equal(r.status, 400);

    r = await post(base, '/api/orders', {
      customer: { ...validOrder.customer, governorate: '' },
      items: validOrder.items
    });
    assert.equal(r.status, 400);
  } finally { server.close(); }
});

test('طلب صحيح: يتسجل، الإجمالي صح، والمخزون بينقص', async () => {
  const { server, base, db } = await start();
  try {
    const stockBefore = db.findProduct('p6').stock;
    const r = await post(base, '/api/orders', validOrder);
    assert.equal(r.status, 201);
    const { order } = r.data;
    assert.ok(order.id.startsWith('G-'));
    // p6 سعره 90 × 2 = 180، و p3 سعره 220 × 1 = 220 → الإجمالي 400
    assert.equal(order.total, 400);
    assert.equal(order.status, 'جديد');
    assert.equal(db.findProduct('p6').stock, stockBefore - 2);

    const check = await fetch(base + '/api/orders/' + order.id);
    assert.equal(check.status, 200);
    const saved = (await check.json()).order;
    assert.equal(saved.total, 400);
    assert.equal(saved.customer.phone, '01550894660');
    assert.equal(saved.customer.governorate, 'دمياط');
  } finally { server.close(); }
});

test('طلب أكبر من المخزون يترفض', async () => {
  const { server, base, db } = await start();
  try {
    const stock = db.findProduct('p7').stock; // بطانية بيبي: مخزون 2
    const r = await post(base, '/api/orders', {
      customer: validOrder.customer,
      items: [{ productId: 'p7', qty: stock + 1 }]
    });
    assert.equal(r.status, 400);
    assert.equal(db.findProduct('p7').stock, stock);
  } finally { server.close(); }
});

test('الطلبات بتتحفظ في ملف البيانات (استمرارية)', async () => {
  const { server, base } = await start();
  try {
    await post(base, '/api/orders', validOrder);
  } finally { server.close(); }
});

test('مسارات الإدارة محمية بكود', async () => {
  const { server, base } = await start();
  try {
    const denied = await fetch(base + '/api/orders');
    assert.equal(denied.status, 401);

    const allowed = await fetch(base + '/api/orders', { headers: { 'x-admin-key': ADMIN_KEY } });
    assert.equal(allowed.status, 200);

    const deniedPost = await post(base, '/api/products', { name: 'اختبار', price: 10, stock: 1 });
    assert.equal(deniedPost.status, 401);
  } finally { server.close(); }
});

test('إضافة منتج من الإدارة ببيانات صحيحة ومرفوضة', async () => {
  const { server, base } = await start();
  try {
    const bad = await post(base, '/api/products',
      { name: 'x', price: -5, stock: 1 }, { 'x-admin-key': ADMIN_KEY });
    assert.equal(bad.status, 400);

    const good = await post(base, '/api/products',
      { name: 'كوستر كروشيه', description: 'قطعة واحدة', category: 'مفروشات', price: 45, stock: 15 },
      { 'x-admin-key': ADMIN_KEY });
    assert.equal(good.status, 201);
    assert.ok(good.data.product.id);

    const list = await (await fetch(base + '/api/products?q=' + encodeURIComponent('كوستر'))).json();
    assert.equal(list.count, 1);
  } finally { server.close(); }
});

test('تكامل الواجهة: الصفحة الرئيسية وملفاتها بتتقدم', async () => {
  const { server, base } = await start();
  try {
    const html = await fetch(base + '/');
    assert.equal(html.status, 200);
    const text = await html.text();
    assert.ok(text.includes('غرام'));

    const js = await fetch(base + '/app.js');
    assert.equal(js.status, 200);
    const css = await fetch(base + '/styles.css');
    assert.equal(css.status, 200);

    const cfg = await (await fetch(base + '/api/config')).json();
    assert.ok(/^\d{10,15}$/.test(cfg.whatsapp));
    assert.equal(cfg.governorates.length, 27);
    assert.ok(cfg.governorates.includes('دمياط') && cfg.governorates.includes('القاهرة'));
  } finally { server.close(); }
});
