'use strict';

const fs = require('fs');
const path = require('path');

// منتجات البداية — كروشيه وهاند ميد. الأسعار بالجنيه المصري.
const seedProducts = [
  { id: 'p1', name: 'دمية أرنب أميجورومي', description: 'أرنب كروشيه معمول بخيط قطن ناعم، آمن للأطفال، ارتفاعه حوالي 25 سم.', price: 350, category: 'دمى', stock: 5, emoji: '🐰' },
  { id: 'p2', name: 'شنطة كروشيه صيفية', description: 'شنطة يد بغرزة صلبة وشكل مودرن، تناسب الخروج والمصيف.', price: 480, category: 'شنط', stock: 3, emoji: '👜' },
  { id: 'p3', name: 'طاقية كروشيه شتوية', description: 'طاقية صوف دافية بألوان ثابتة، مقاس واحد يناسب أغلب الناس.', price: 220, category: 'ملابس', stock: 10, emoji: '🧶' },
  { id: 'p4', name: 'مفرش طاولة كروشيه', description: 'مفرش طاولة دائري بغرز مفتوحة كلاسيكية، قطره 90 سم.', price: 600, category: 'مفروشات', stock: 2, emoji: '🕸️' },
  { id: 'p5', name: 'سكارف صوف طويل', description: 'سكارف شتوي بغرزة بسيطة وألوان هادئة، طوله متر ونص.', price: 300, category: 'ملابس', stock: 8, emoji: '🧣' },
  { id: 'p6', name: 'ميدالية وردة كروشيه', description: 'ميدالية مفاتيح على شكل وردة، هدية صغيرة حلوة.', price: 90, category: 'إكسسوارات', stock: 20, emoji: '🌹' },
  { id: 'p7', name: 'بطانية بيبي كروشيه', description: 'بطانية مواليد بخيط قطن مضاد للحساسية، مقاس 100×120 سم.', price: 850, category: 'مفروشات', stock: 2, emoji: '🍼' },
  { id: 'p8', name: 'شبشب بيبي كروشيه', description: 'شبشب مواليد ناعم، متاح بمقاسات من 0 لـ 12 شهر.', price: 150, category: 'ملابس', stock: 12, emoji: '👶' }
];

function createDb(filePath) {
  let data = null;

  function load() {
    if (fs.existsSync(filePath)) {
      data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } else {
      data = {
        products: seedProducts.map((p) => ({ ...p })),
        orders: [],
        nextOrderNumber: 1001
      };
      persist();
    }
  }

  function persist() {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, filePath);
  }

  return {
    load,
    persist,
    get products() { return data.products; },
    get orders() { return data.orders; },
    nextOrderId() { return 'G-' + data.nextOrderNumber++; },
    findProduct(id) { return data.products.find((p) => p.id === id); }
  };
}

module.exports = { createDb, seedProducts };
