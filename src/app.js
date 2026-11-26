'use strict';

const express = require('express');
const path = require('path');

const ADMIN_KEY = process.env.ADMIN_KEY || 'gharam-admin';
const SELLER_WHATSAPP = process.env.SELLER_WHATSAPP || '201550894660';

// محافظات مصر الـ 27 — التوصيل متاح لكل المحافظات
const GOVERNORATES = [
  'القاهرة', 'الجيزة', 'الإسكندرية', 'القليوبية', 'الدقهلية', 'الشرقية',
  'الغربية', 'المنوفية', 'البحيرة', 'كفر الشيخ', 'دمياط', 'بورسعيد',
  'الإسماعيلية', 'السويس', 'الفيوم', 'بني سويف', 'المنيا', 'أسيوط',
  'سوهاج', 'قنا', 'الأقصر', 'أسوان', 'البحر الأحمر', 'الوادي الجديد',
  'مطروح', 'شمال سيناء', 'جنوب سيناء'
];

function normalizePhone(p) {
  return String(p || '').replace(/[\s\-()]/g, '');
}

function isValidPhone(p) {
  return /^\+?\d{9,15}$/.test(normalizePhone(p));
}

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // إعدادات عامة للواجهة
  app.get('/api/config', (req, res) => {
    res.json({ storeName: 'غرام', whatsapp: SELLER_WHATSAPP, currency: 'جنيه', governorates: GOVERNORATES });
  });

  // المنتجات: بحث + فلترة بالتصنيف
  app.get('/api/products', (req, res) => {
    const q = String(req.query.q || '').trim();
    const category = String(req.query.category || '').trim();
    let list = db.products;
    if (category) list = list.filter((p) => p.category === category);
    if (q) {
      list = list.filter((p) => p.name.includes(q) || p.description.includes(q));
    }
    res.json({ products: list, count: list.length });
  });

  app.get('/api/categories', (req, res) => {
    const cats = [...new Set(db.products.map((p) => p.category))];
    res.json({ categories: cats });
  });

  app.get('/api/products/:id', (req, res) => {
    const p = db.findProduct(req.params.id);
    if (!p) return res.status(404).json({ error: 'المنتج غير موجود' });
    res.json({ product: p });
  });

  // إنشاء طلب — التحقق والحساب كله على السيرفر
  app.post('/api/orders', (req, res) => {
    const body = req.body || {};
    const customer = body.customer || {};
    const name = String(customer.name || '').trim();
    const phone = String(customer.phone || '').trim();
    const governorate = String(customer.governorate || '').trim();
    const address = String(customer.address || '').trim();
    const notes = String(customer.notes || '').trim();
    const items = Array.isArray(body.items) ? body.items : [];

    if (name.length < 2) return res.status(400).json({ error: 'اكتب اسم صحيح' });
    if (!isValidPhone(phone)) return res.status(400).json({ error: 'اكتب رقم تليفون صحيح' });
    if (!GOVERNORATES.includes(governorate)) return res.status(400).json({ error: 'اختار المحافظة' });
    if (address.length < 5) return res.status(400).json({ error: 'اكتب عنوان واضح' });
    if (items.length === 0) return res.status(400).json({ error: 'السلة فاضية' });
    if (items.length > 50) return res.status(400).json({ error: 'عدد الأصناف كبير جدا' });

    const orderItems = [];
    let total = 0;
    for (const item of items) {
      const product = db.findProduct(String(item.productId));
      const qty = Number(item.qty);
      if (!product) return res.status(400).json({ error: 'منتج غير موجود في الطلب' });
      if (!Number.isInteger(qty) || qty < 1 || qty > 20) {
        return res.status(400).json({ error: 'كمية غير صحيحة للمنتج: ' + product.name });
      }
      if (product.stock < qty) {
        return res.status(400).json({ error: 'الكمية المتاحة من ' + product.name + ' هي ' + product.stock });
      }
      orderItems.push({ productId: product.id, name: product.name, price: product.price, qty });
      total += product.price * qty;
    }

    for (const item of orderItems) {
      db.findProduct(item.productId).stock -= item.qty;
    }

    const order = {
      id: db.nextOrderId(),
      customer: { name, phone: normalizePhone(phone), governorate, address, notes },
      items: orderItems,
      total,
      status: 'جديد',
      createdAt: new Date().toISOString()
    };
    db.orders.push(order);
    db.persist();
    res.status(201).json({ order });
  });

  app.get('/api/orders/:id', (req, res) => {
    const order = db.orders.find((o) => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
    res.json({ order });
  });

  // الإدارة — بكود بسيط (مناسب للتجربة، مش حماية إنتاجية)
  function adminOnly(req, res, next) {
    if (req.get('x-admin-key') !== ADMIN_KEY) {
      return res.status(401).json({ error: 'ممنوع: كود الإدارة غير صحيح' });
    }
    next();
  }

  app.get('/api/orders', adminOnly, (req, res) => {
    res.json({ orders: db.orders, count: db.orders.length });
  });

  app.post('/api/products', adminOnly, (req, res) => {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    const description = String(body.description || '').trim();
    const category = String(body.category || '').trim();
    const price = Number(body.price);
    const stock = Number(body.stock);
    const emoji = String(body.emoji || '🧵').slice(0, 8);
    if (name.length < 2) return res.status(400).json({ error: 'اسم المنتج قصير' });
    if (!Number.isFinite(price) || price <= 0) return res.status(400).json({ error: 'السعر غير صحيح' });
    if (!Number.isInteger(stock) || stock < 0) return res.status(400).json({ error: 'المخزون غير صحيح' });
    const product = {
      id: 'p' + Date.now().toString(36),
      name, description, category: category || 'متنوع', price, stock, emoji
    };
    db.products.push(product);
    db.persist();
    res.status(201).json({ product });
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'مسار غير موجود' }));

  return app;
}

module.exports = { createApp, GOVERNORATES };
