// ────────────────────────────────────────────────────────────
// productflow_router.cjs – Button-first product sales flow
// Applies ONLY to product-selling tenants (not services).
// Callbacks use the `productflow:` namespace.
// CJS conversion for VM server.js integration
// ────────────────────────────────────────────────────────────
const { Markup, Input } = require('telegraf');
const fs = require('fs');
const path = require('path');
const { shopperText, localizeButtons, localizeResult, setShopperLanguageContext } = require('./src/config/shopper-i18n.cjs');

// Will be set by server.js after import
let deps = {};
const productflowDebug = process.env.PRODUCTFLOW_DEBUG === 'true';
const debugLog = (...args) => {
  if (productflowDebug) console.log(...args);
};
const PAGE_SIZE = 4;
const PRODUCT_SEND_DELAY_MS = 150;
const PRODUCT_CLIENTS = new WeakMap();

function watermarkedCandidate(imagePath) {
  if (!imagePath || /^https?:\/\//i.test(String(imagePath))) return imagePath || '';
  const parsed = path.parse(String(imagePath));
  if (/\.watermarked$/i.test(parsed.name)) return String(imagePath);
  const candidate = path.join(parsed.dir, `${parsed.name}.watermarked${parsed.ext || '.jpg'}`);
  return fs.existsSync(candidate) ? candidate : String(imagePath);
}

function initProductflow(dependencies) {
  deps = dependencies;
}

const cleanShopperText = value => String(value || '')
  .replace(/\*\*/g, '')
  .replace(/`/g, '');

const t = (client, key, vars = {}, fallback = '') => shopperText(client, key, vars, fallback);

const privateOwnerChatId = client => {
  const settings = client?.settings || {};
  const candidates = [
    settings.sprintsalesAdminChatId,
    settings.telegramOwnerChatId,
    settings.ownerChatId,
    // Legacy fallback only: this field was previously used for owner alerts.
    // It must be a private positive Telegram chat id, never a channel/group id.
    settings.hotLeadNotifyChatId
  ];
  return candidates
    .map(value => String(value || '').trim())
    .find(value => /^\d{5,20}$/.test(value)) || '';
};

const preferredShopperLanguage = (conversation = {}) => {
  const raw = String(conversation?.shopperLanguage || conversation?.languagePreference || '').toLowerCase();
  if (raw.includes('amharic') || raw === 'am') return 'amharic';
  return 'english';
};

const applyShopperLanguage = (client, conversation = {}) => {
  conversation.shopperLanguage ||= preferredShopperLanguage(conversation);
  setShopperLanguageContext(client, conversation.shopperLanguage);
  return client;
};

// ════════════════════════════════════════════════════════════
// PRODUCT NORMALIZER — maps any platform product schema to router fields
// ════════════════════════════════════════════════════════════

function normalizeProductImages(raw) {
  const records = Array.isArray(raw?.images) ? raw.images : [];
  const normalized = records
    .map((item, index) => {
      if (!item) return null;
      if (typeof item === 'string') {
        const publicPath = watermarkedCandidate(item);
        return {
          originalPath: item,
          publicPath,
          watermarkedPath: publicPath,
          isPrimary: index === 0
        };
      }
      const publicPath = watermarkedCandidate(item.watermarkedPath ||
        item.watermarkedPath ||
        item.watermarkedImagePath ||
        item.publicPath ||
        item.publicImagePath ||
        item.imagePath ||
        item.imageUrl ||
        item.url ||
        '');
      const originalPath = item.originalPath ||
        item.imageOriginalPath ||
        item.originalImagePath ||
        publicPath;
      return {
        ...item,
        originalPath,
        publicPath,
        watermarkedPath: watermarkedCandidate(item.watermarkedPath || item.watermarkedImagePath || publicPath),
        isPrimary: item.isPrimary === true || index === 0
      };
    })
    .filter(item => item && (item.publicPath || item.originalPath));

  if (!normalized.length) {
    const legacy = raw?.watermarkedImageUrl ||
      raw?.imageWatermarked ||
      raw?.watermarkedImagePath ||
      raw?.publicImageUrl ||
      raw?.publicImagePath ||
      raw?.imagePath ||
      raw?.imageUrl ||
      raw?.image ||
      raw?.image_url ||
      '';
    if (legacy) {
      const publicPath = watermarkedCandidate(legacy);
      normalized.push({
        originalPath: raw?.imageOriginalPath || raw?.originalImagePath || legacy,
        publicPath,
        watermarkedPath: watermarkedCandidate(raw?.watermarkedImagePath || publicPath),
        isPrimary: true
      });
    }
  }

  return normalized.slice(0, 3);
}

function normalizeProduct(raw) {
  if (!raw) return null;
  const images = normalizeProductImages(raw);
  const image = images[0]?.watermarkedPath || images[0]?.publicPath || images[0]?.originalPath || '';
  const status = String(raw.status || '').trim().toLowerCase();
  const stockStatus = raw.stockStatus || raw.stock_status || raw.availability || '';
  const isExplicitlyActive = status === 'active' || raw.isActive === true || raw.is_active === true;
  const isExplicitlyInactive = ['inactive', 'draft', 'hidden', 'disabled', 'archived'].includes(status) ||
    raw.isActive === false ||
    raw.is_active === false;
  return {
    ...raw,
    id: raw.id || '',
    name: raw.name || '',
    code: raw.code || raw.productCode || raw.product_code || '',
    category: raw.category || raw.category_id || 'Other',
    price: raw.sellingPrice || raw.price || '',
    sellingPrice: raw.sellingPrice || raw.price || '',
    images,
    imageUrl: image,
    imagePath: image || raw.imagePath || '',
    status: status || (isExplicitlyActive && !isExplicitlyInactive ? 'active' : ''),
    stockStatus,
    sizes: Array.isArray(raw.sizes) ? raw.sizes.join(', ') : (raw.sizes || ''),
    options: Array.isArray(raw.options) ? raw.options.join(', ') : (raw.options || raw.variants || ''),
    colors: Array.isArray(raw.colors) ? raw.colors.join(', ') : (raw.colors || ''),
    isActive: isExplicitlyActive || !isExplicitlyInactive,
    description: raw.description || '',
  };
}

function isProductVisible(p) {
  if (!p.name) return 'no_name';
  const price = p.sellingPrice || p.price;
  if (!price && price !== 0) return 'no_price';
  const status = String(p.status || '').trim().toLowerCase();
  const activeByStatus = status === 'active';
  const activeByFlag = p.isActive === true || p.is_active === true;
  const inactiveStatus = ['inactive', 'draft', 'hidden', 'disabled', 'archived'].includes(status);
  if (!activeByStatus && !activeByFlag) return 'inactive';
  if (inactiveStatus && !activeByFlag) return 'status_inactive';
  const stock = (p.stockStatus || p.stock_status || p.availability || '').toLowerCase();
  if (stock === 'out_of_stock' || stock === 'out of stock') return 'out_of_stock';
  return true; // visible
}

function enrichClientProducts(data, client) {
  if (!client || !data) return;
  // Products are stored at data.products[] with clientId, NOT on client.products
  const allProducts = data.products || data.Products || [];
  const clientProducts = allProducts.filter(p => p.clientId === client.id);
  const normalized = clientProducts.map(normalizeProduct).filter(Boolean);
  normalized.forEach(product => PRODUCT_CLIENTS.set(product, client));
  client.products = normalized;

  // Debug logging
  const visible = normalized.filter(p => isProductVisible(p) === true);
  const filtered = normalized.filter(p => isProductVisible(p) !== true);
  debugLog(`[ProductFlow DEBUG] clientId=${client.id}, businessName=${client.businessName}`);
  debugLog(`[ProductFlow DEBUG] raw product count: ${clientProducts.length}`);
  debugLog(`[ProductFlow DEBUG] normalized count: ${normalized.length}`);
  debugLog(`[ProductFlow DEBUG] visible count: ${visible.length}`);
  if (filtered.length > 0) {
    filtered.forEach(p => {
      debugLog(`[ProductFlow DEBUG] FILTERED OUT: "${p.name||p.id}" reason=${isProductVisible(p)}`);
    });
  }
  if (visible.length > 0) {
    visible.forEach(p => {
      debugLog(`[ProductFlow DEBUG] VISIBLE: "${p.name}" cat=${p.category} price=${p.price} active=${p.isActive}`);
    });
  }
}

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════

const uid = (prefix = '') =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const productPrice = p => p.sellingPrice || p.price || '';
const productStock = p => Math.max(0, Number(p.stockQuantity || 0));
const productAvailability = p => {
  if (Number.isFinite(Number(p.stockQuantity))) {
    const s = productStock(p);
    if (s <= 0) return 'Out of stock';
    return `In stock (${s} left)`;
  }
  return p.availability || '';
};

const activeProducts = client => {
  const raw = client?.products || [];
  return raw.filter(p => isProductVisible(p) === true);
};

const slug = value => (value || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
const normalizeKey = value => String(value || '')
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const truncateText = (value, maxLength = 140) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
};

const customerIdentityKey = (item = {}) =>
  item.telegramUserId || item.telegramChatId || item.phone || item.username || item.conversationId || item.id || '';

const customerMatchesIdentity = (customer = {}, item = {}) => {
  const values = [
    customer.id,
    customer.telegramUserId,
    customer.telegramChatId,
    customer.phone,
    customer.username,
    customer.conversationId
  ].filter(Boolean).map(value => String(value).toLowerCase());
  const itemValues = [
    item.id,
    item.telegramUserId,
    item.telegramChatId,
    item.phone,
    item.username,
    item.conversationId
  ].filter(Boolean).map(value => String(value).toLowerCase());
  return values.some(value => itemValues.includes(value));
};

const findCustomerProfile = (data, client, conversation = {}) => {
  data.customers ||= [];
  const seed = {
    clientId: client.id,
    conversationId: conversation.id || '',
    telegramUserId: conversation.customer?.telegramUserId || conversation.telegramUserId || '',
    telegramChatId: conversation.telegramChatId || conversation.chatId || conversation.customer?.telegramChatId || '',
    username: conversation.customer?.username || conversation.username || ''
  };
  const explicit = data.customers.find(item => item.clientId === client.id && customerMatchesIdentity(item, seed));
  if (explicit) return explicit;

  const priorOrder = (data.orders || [])
    .filter(order => order.clientId === client.id && customerMatchesIdentity(seed, order) && (order.customerName || order.phone || order.deliveryLocation))
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))[0];
  if (!priorOrder) return null;
  return {
    id: customerIdentityKey(seed) || customerIdentityKey(priorOrder),
    clientId: client.id,
    conversationId: seed.conversationId,
    telegramUserId: seed.telegramUserId || priorOrder.telegramUserId || '',
    telegramChatId: seed.telegramChatId || priorOrder.telegramChatId || '',
    username: seed.username || priorOrder.username || '',
    name: priorOrder.customerName || '',
    phone: priorOrder.phone || '',
    address: priorOrder.deliveryLocation || '',
    birthdate: conversation.customer?.birthdate || null
  };
};

const upsertCustomerProfile = (data, client, conversation = {}, order = {}) => {
  data.customers ||= [];
  const identity = {
    clientId: client.id,
    conversationId: conversation.id || order.conversationId || '',
    telegramUserId: order.telegramUserId || conversation.customer?.telegramUserId || conversation.telegramUserId || '',
    telegramChatId: order.telegramChatId || conversation.telegramChatId || conversation.customer?.telegramChatId || '',
    username: order.username || conversation.customer?.username || '',
    phone: order.phone || ''
  };
  const key = customerIdentityKey(identity) || uid('customer');
  let customer = data.customers.find(item => item.clientId === client.id && customerMatchesIdentity(item, identity));
  if (!customer) {
    customer = { id: key, clientId: client.id, createdAt: new Date().toISOString(), totalPaidOrders: 0, totalSpent: 0 };
    data.customers.push(customer);
  }
  customer.conversationId ||= identity.conversationId;
  customer.telegramUserId ||= identity.telegramUserId;
  customer.telegramChatId ||= identity.telegramChatId;
  customer.username ||= identity.username;
  customer.name = order.customerName || customer.name || conversation.customer?.name || '';
  customer.phone = order.phone || customer.phone || '';
  customer.address = order.deliveryLocation || customer.address || '';
  customer.birthdate = customer.birthdate || conversation.customer?.birthdate || null;
  customer.shopperLanguage = conversation.shopperLanguage || customer.shopperLanguage || 'english';
  customer.lastOrderId = order.id || customer.lastOrderId || '';
  customer.lastSeenAt = new Date().toISOString();
  customer.updatedAt = customer.lastSeenAt;
  if (order.paymentStatus === 'paid') {
    customer.totalPaidOrders = (data.orders || []).filter(item =>
      item.clientId === client.id &&
      item.paymentStatus === 'paid' &&
      customerMatchesIdentity(customer, item)
    ).length;
    customer.totalSpent = (data.orders || []).filter(item =>
      item.clientId === client.id &&
      item.paymentStatus === 'paid' &&
      customerMatchesIdentity(customer, item)
    ).reduce((sum, item) => sum + Number(item.total || 0), 0);
    customer.lastPaidOrderAt = order.paymentVerifiedAt || order.updatedAt || customer.lastSeenAt;
  }
  return customer;
};

const paidPurchaseCount = (data, client, customer) => (data.orders || []).filter(order =>
  order.clientId === client.id &&
  order.paymentStatus === 'paid' &&
  customerMatchesIdentity(customer, order)
).length;

const intentIdentity = (conversation = {}, order = {}) => ({
  conversationId: conversation.id || order.conversationId || '',
  telegramUserId: order.telegramUserId || conversation.customer?.telegramUserId || conversation.telegramUserId || '',
  telegramChatId: order.telegramChatId || conversation.telegramChatId || conversation.customer?.telegramChatId || '',
  username: order.username || conversation.customer?.username || '',
  phone: order.phone || '',
  customerName: order.customerName || conversation.customer?.name || conversation.customer?.first_name || ''
});

const findProductIntent = (data, client, conversation, product) => {
  const identity = intentIdentity(conversation);
  return (data.productIntents || []).find(item =>
    item.clientId === client.id &&
    item.productId === product.id &&
    ['watching', 'active', 'reminded', 'viewed_after_reminder', 'order_resumed'].includes(item.status || 'watching') &&
    (
      (identity.telegramChatId && item.telegramChatId === identity.telegramChatId) ||
      (identity.telegramUserId && item.telegramUserId === identity.telegramUserId) ||
      (identity.conversationId && item.conversationId === identity.conversationId)
    )
  );
};

const recordProductIntent = (data, client, conversation, product, source = 'viewed') => {
  if (!data || !client?.id || !product?.id) return null;
  data.productIntents ||= [];
  const identity = intentIdentity(conversation);
  if (!identity.telegramChatId && !identity.telegramUserId && !identity.conversationId) return null;
  let intent = findProductIntent(data, client, conversation, product);
  if (!intent) {
    intent = {
      id: uid('intent'),
      clientId: client.id,
      conversationId: identity.conversationId,
      telegramUserId: identity.telegramUserId,
      telegramChatId: identity.telegramChatId,
      username: identity.username,
      customerName: identity.customerName,
      productId: product.id,
      productCode: product.code || product.productCode || '',
      productName: product.name || product.code || '',
      source,
      status: source === 'order_started' ? 'active' : 'watching',
      viewCount: 0,
      remindersSent: 0,
      createdAt: new Date().toISOString()
    };
    data.productIntents.push(intent);
  }
  intent.lastActivityAt = new Date().toISOString();
  intent.updatedAt = intent.lastActivityAt;
  intent.shopperLanguage = conversation.shopperLanguage || intent.shopperLanguage || 'english';
  intent.productCode = product.code || product.productCode || intent.productCode || '';
  intent.productName = product.name || product.code || intent.productName || '';
  intent.customerName ||= identity.customerName;
  if (source === 'viewed') {
    intent.viewCount = Number(intent.viewCount || 0) + 1;
    if (Number(intent.viewCount || 0) >= 2 && intent.status === 'watching') {
      intent.status = 'active';
      intent.source = 'repeat_view';
      intent.startedAt = intent.startedAt || intent.lastActivityAt;
    }
  }
  if (source === 'order_started') {
    intent.source = 'order_started';
    intent.status = 'active';
    intent.startedAt = intent.startedAt || intent.lastActivityAt;
    intent.orderStartedAt = intent.lastActivityAt;
  }
  return intent;
};

const closeProductIntent = (data, client, conversation, productId, status = 'completed', orderId = '') => {
  const identity = intentIdentity(conversation);
  for (const intent of data.productIntents || []) {
    if (intent.clientId !== client.id || (productId && intent.productId !== productId)) continue;
    const same = (identity.telegramChatId && intent.telegramChatId === identity.telegramChatId) ||
      (identity.telegramUserId && intent.telegramUserId === identity.telegramUserId) ||
      (identity.conversationId && intent.conversationId === identity.conversationId);
    if (!same) continue;
    if (intent.status === 'ordered' && status === 'completed') continue;
    intent.status = status;
    intent.orderId = orderId || intent.orderId || '';
    intent.closedAt = new Date().toISOString();
    intent.updatedAt = intent.closedAt;
  }
};

const discountAmount = (subtotal, rule) => Math.min(Number(subtotal || 0), Math.round(Number(subtotal || 0) * (Number(rule?.value || 0) / 100)));

const weekStartUtc = (date = new Date()) => {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = start.getUTCDay() || 7;
  start.setUTCDate(start.getUTCDate() - day + 1);
  return start;
};

const discountUseCountThisWeek = (data, client, reason, code = '') => {
  const start = weekStartUtc().getTime();
  const normalizedCode = String(code || '').toUpperCase();
  return (data.orders || []).filter(order => {
    if (order.clientId !== client.id || order.status === 'cancelled') return false;
    if (Number(order.discountAmount || 0) <= 0) return false;
    const at = new Date(order.confirmedAt || order.createdAt || order.updatedAt || 0).getTime();
    if (!Number.isFinite(at) || at < start) return false;
    if (reason === 'promo_code') return normalizedCode && String(order.discountCode || '').toUpperCase() === normalizedCode;
    return String(order.discountReason || '').split('+').includes(reason);
  }).length;
};

const weeklyDiscountCapReached = (data, client, reason, rule, code = '') => {
  const cap = Math.max(0, Number(rule?.maxPerWeek || 0) || 0);
  return cap > 0 && discountUseCountThisWeek(data, client, reason, code) >= cap;
};

const birthWeekYearIfEligible = (birthdate, nowDate = new Date()) => {
  if (!birthdate) return '';
  const month = Number(birthdate.month || birthdate.birthdateMonth || birthdate.month_number || 0);
  const day = Number(birthdate.day || birthdate.birthdateDay || 0);
  if (!month || !day) return '';
  const currentYear = nowDate.getFullYear();
  const birthday = new Date(Date.UTC(currentYear, month - 1, day));
  const today = new Date(Date.UTC(currentYear, nowDate.getMonth(), nowDate.getDate()));
  const diffDays = Math.round((birthday.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  return Math.abs(diffDays) <= 4 ? String(currentYear) : '';
};

const calculateDiscount = (data, client, conversation, product, subtotal, state = {}) => {
  const settings = client?.settings?.discounts || {};
  if (settings.enabled === false || product?.excludeFromDiscounts === true) return { amount: 0, label: '', reason: '', rate: 0 };
  const customer = findCustomerProfile(data, client, conversation) || {};
  const paidCount = paidPurchaseCount(data, client, customer);
  const candidates = [];
  if (settings.newBuyer?.enabled && Number(settings.newBuyer.value || 0) > 0 && paidCount === 0 && !weeklyDiscountCapReached(data, client, 'new_buyer', settings.newBuyer)) {
    if (product?.discounts?.newBuyer !== false) candidates.push({ reason: 'new_buyer', label: 'New buyer discount', rate: Number(settings.newBuyer.value), amount: discountAmount(subtotal, settings.newBuyer) });
  }
  if (settings.repeatBuyer?.enabled && Number(settings.repeatBuyer.value || 0) > 0 && paidCount >= Number(settings.repeatBuyer.purchaseCount || 2) && !weeklyDiscountCapReached(data, client, 'repeat_buyer', settings.repeatBuyer)) {
    if (product?.discounts?.repeatBuyer !== false) candidates.push({ reason: 'repeat_buyer', label: 'Repeat buyer discount', rate: Number(settings.repeatBuyer.value), amount: discountAmount(subtotal, settings.repeatBuyer) });
  }
  const birthYear = birthWeekYearIfEligible(customer.birthdate || conversation.customer?.birthdate);
  const usedBirthdayYears = Array.isArray(customer.birthdayDiscountYears) ? customer.birthdayDiscountYears.map(String) : [];
  if (settings.birthdayWeek?.enabled && Number(settings.birthdayWeek.value || 0) > 0 && birthYear && !usedBirthdayYears.includes(birthYear) && !weeklyDiscountCapReached(data, client, 'birthday_week', settings.birthdayWeek)) {
    if (product?.discounts?.birthdayWeek !== false) candidates.push({ reason: 'birthday_week', label: 'Birthday week discount', rate: Number(settings.birthdayWeek.value), amount: discountAmount(subtotal, settings.birthdayWeek), birthYear });
  }
  const productDiscounts = product?.discounts || {};
  if (settings.sales?.enabled && productDiscounts.sales !== false && Number(settings.sales.value || 0) > 0 && !weeklyDiscountCapReached(data, client, 'sales', settings.sales)) {
    candidates.push({ reason: 'sales', label: 'Sales discount', rate: Number(settings.sales.value), amount: discountAmount(subtotal, settings.sales) });
  }
  if (settings.holiday?.enabled && productDiscounts.holiday !== false && Number(settings.holiday.value || 0) > 0 && !weeklyDiscountCapReached(data, client, 'holiday', settings.holiday)) {
    candidates.push({ reason: 'holiday', label: 'Holiday discount', rate: Number(settings.holiday.value), amount: discountAmount(subtotal, settings.holiday) });
  }
  const promoCode = String(state.promoCode || '').trim().toUpperCase();
  if (promoCode) {
    const code = (Array.isArray(settings.codes) ? settings.codes : []).find(item => item.enabled !== false && String(item.code || '').toUpperCase() === promoCode);
    const expired = code?.expiresAt && new Date(`${code.expiresAt}T23:59:59Z`) < new Date();
    const totalUses = (data.orders || []).filter(order => order.clientId === client.id && String(order.discountCode || '').toUpperCase() === promoCode).length;
    const customerUses = (data.orders || []).filter(order => order.clientId === client.id && String(order.discountCode || '').toUpperCase() === promoCode && customerMatchesIdentity(customer, order)).length;
    if (product?.discounts?.promoCodes !== false && code && !expired && (!code.maxUses || totalUses < Number(code.maxUses)) && customerUses < Number(code.maxUsesPerCustomer || 1) && !weeklyDiscountCapReached(data, client, 'promo_code', code, promoCode)) {
      candidates.push({ reason: 'promo_code', label: `Promo code ${promoCode}`, rate: Number(code.value), amount: discountAmount(subtotal, code), code: promoCode });
    }
  }
  if (!candidates.length) return { amount: 0, label: '', reason: '', rate: 0 };
  if (settings.allowStacking) {
    const amount = Math.min(Number(subtotal || 0), candidates.reduce((sum, item) => sum + item.amount, 0));
    return { amount, label: candidates.map(item => item.label).join(' + '), reason: candidates.map(item => item.reason).join('+'), rate: 0, birthYear: candidates.find(item => item.birthYear)?.birthYear || '' };
  }
  return candidates.sort((a, b) => b.amount - a.amount)[0];
};

const availablePromoCodes = (client, product = {}) => {
  const settings = client?.settings?.discounts || {};
  if (settings.enabled === false || product?.excludeFromDiscounts === true || product?.discounts?.promoCodes === false) return [];
  return (Array.isArray(settings.codes) ? settings.codes : [])
    .filter(code => code?.enabled !== false && String(code.code || '').trim() && Number(code.value || 0) > 0)
    .filter(code => !code.expiresAt || new Date(`${code.expiresAt}T23:59:59Z`) >= new Date());
};

const canOfferPromoCode = (client, product = {}) => availablePromoCodes(client, product).length > 0;

const searchStopWords = new Set([
  'a', 'an', 'and', 'are', 'can', 'do', 'for', 'have', 'hay', 'hello', 'hey',
  'hi', 'i', 'in', 'is', 'it', 'me', 'need', 'please', 'product', 'send',
  'show', 'stock', 'the', 'this', 'to', 'want', 'what', 'with', 'you'
]);

const tokenizeProductSearch = value => String(value || '')
  .toLowerCase()
  .replace(/women'?s|womens|woman|female/gi, ' women womens female ')
  .replace(/men'?s|mens|man|male/gi, ' men mens male ')
  .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
  .split(/\s+/)
  .map(term => term.trim())
  .map(term => {
    if (term === 'mens') return 'men';
    if (term === 'womens') return 'women';
    return term.replace(/s$/i, '');
  })
  .filter(term => term.length >= 2 && !searchStopWords.has(term))
  .slice(0, 12);

const normalizeSearchText = value => tokenizeProductSearch(value).join(' ');

const productCategories = client => {
  return activeProducts(client)
    .map(p => (p.category || 'Other').trim())
    .filter((v, i, a) => v && a.indexOf(v) === i)
    .sort();
};

const populatedCategories = client => {
  const byCategory = new Map();
  for (const product of activeProducts(client)) {
    const category = (product.category || product.selectedCategory || 'Other').trim();
    if (!category) continue;
    if (!byCategory.has(category)) byCategory.set(category, { name: category, productCount: 0, subcategories: new Map() });
    const record = byCategory.get(category);
    record.productCount += 1;
    const subcategory = (product.subcategory || product.selectedSubcategory || '').trim();
    if (subcategory) record.subcategories.set(subcategory, (record.subcategories.get(subcategory) || 0) + 1);
  }
  return [...byCategory.values()]
    .map(record => ({
      name: record.name,
      productCount: record.productCount,
      subcategories: [...record.subcategories.entries()]
        .map(([name, productCount]) => ({ name, productCount }))
        .sort((a, b) => a.name.localeCompare(b.name))
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

const findPopulatedCategory = (client, categorySlug) =>
  populatedCategories(client).find(category => slug(category.name) === slug(categorySlug));

const findPopulatedSubcategory = (category, subcategorySlug) =>
  (category?.subcategories || []).find(subcategory => slug(subcategory.name) === slug(subcategorySlug));

const productsInCategory = (client, category, subcategory = '') => {
  const target = slug(category);
  const subTarget = slug(subcategory);
  return activeProducts(client).filter(p => {
    const categoryMatch = slug(p.category || p.selectedCategory || 'Other') === target;
    if (!categoryMatch) return false;
    if (!subTarget) return true;
    return slug(p.subcategory || p.selectedSubcategory || '') === subTarget;
  });
};

const ADDIS_AREA_WORDS = [
  'addis', 'addis ababa', 'piassa', 'piazza', 'mexico', 'kazanchis', 'arat killo', '4 kilo',
  'amist killo', 'sidist killo', '6 kilo', 'churchill', 'legehar', 'stadium', 'meskel',
  'bambis', 'bamis', 'filwoha', 'sengatera', 'teklehaimanot', 'sebategna', 'merkato',
  'bole', 'atlas', 'medhanialem', 'rwanda', 'bulbula', 'arabsa', 'gerji', 'imperial',
  '22', 'hayahulet', 'haya hulet', 'haya arat', 'megenagna', 'ayat', 'cmc', 'summit',
  'gurd shola', 'salite', 'figa', 'jakros', 'unity park', 'shola', 'kotebe', 'kara',
  'ferensay', 'gurara', 'kebena', 'jan meda', 'shiromeda', 'entoto', 'gullele',
  'kechene', 'wingate', 'addisu gebeya', 'semen mazoria', 'lideta', 'abnet', 'geja',
  'kocher', 'tor hailoch', 'keraniyo', 'bethel', 'ayer tena', 'kolfe', 'total',
  'zenebework', 'alem bank', 'repi', 'koshe', 'karakore', 'saris', 'gotera', 'kera',
  'bulgaria', 'bisrate', 'old airport', 'mekanisa', 'jemo', 'lebu', 'mebrat hail',
  'hana mariam', 'lafto', 'gofa', 'kality', 'kaliti', 'gelan', 'tulu dimtu', 'akaki',
  'furi', 'burayu', 'sululta', 'sendafa', 'dukem', 'raguel', 'bomb tera', 'dubai tera',
  'ehil berenda'
];

const OUTSIDE_ADDIS_WORDS = [
  'adama', 'nazret', 'hawassa', 'bahir dar', 'gondar', 'mekelle', 'dire dawa', 'harar',
  'jimma', 'dessie', 'debre', 'bishoftu', 'mojo', 'shashemene', 'nekemte', 'ambo',
  'wolkite', 'butajira', 'assela', 'jijiga', 'axum', 'arbaminch'
];

const areaWordRegex = words => new RegExp(`\\b(${words
  .map(word => String(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'))
  .join('|')})\\b`, 'i');

const ADDIS_AREA_RE = areaWordRegex(ADDIS_AREA_WORDS);
const OUTSIDE_ADDIS_RE = areaWordRegex(OUTSIDE_ADDIS_WORDS);

const isInAddis = (address = '') => ADDIS_AREA_RE.test(String(address || ''));
const isClearlyOutsideAddis = (address = '') => OUTSIDE_ADDIS_RE.test(String(address || ''));

const normalizeDeliveryArea = normalizeKey;

const findDeliveryZoneForAddress = (delivery, address = '') => {
  const zones = Array.isArray(delivery?.zones) ? delivery.zones : [];
  const addressKey = normalizeDeliveryArea(address);
  if (!addressKey) return null;
  const directMatch = zones.find(zone => {
    if (!zone || zone.enabled === false) return false;
    const areaKey = normalizeDeliveryArea(zone.area || zone.name);
    if (!areaKey) return false;
    return addressKey === areaKey ||
      addressKey.includes(areaKey) ||
      areaKey.includes(addressKey);
  });
  if (directMatch) return directMatch;

  const addressTokens = new Set(addressKey.split(' ').filter(Boolean));
  const tokenMatches = zones.filter(zone => {
    if (!zone || zone.enabled === false) return false;
    const firstToken = normalizeDeliveryArea(zone.area || zone.name).split(' ')[0];
    return firstToken && addressTokens.has(firstToken);
  });
  return tokenMatches.length === 1 ? tokenMatches[0] : null;
};

const deliveryZoneCandidatesForAddress = (delivery, address = '') => {
  const zones = (Array.isArray(delivery?.zones) ? delivery.zones : []).filter(zone => zone && zone.enabled !== false);
  const addressKey = normalizeDeliveryArea(address);
  if (!addressKey || zones.length < 2) return [];
  const addressTokens = new Set(addressKey.split(' ').filter(token => token.length >= 3));
  return zones
    .map(zone => {
      const area = zone.area || zone.name || '';
      const areaKey = normalizeDeliveryArea(area);
      if (!areaKey) return null;
      const areaTokens = areaKey.split(' ').filter(Boolean);
      let score = 0;
      if (addressKey === areaKey) score += 100;
      else if (addressKey.includes(areaKey) || areaKey.includes(addressKey)) score += 60;
      for (const token of areaTokens) {
        if (addressTokens.has(token)) score += token === areaTokens[0] ? 24 : 12;
      }
      return score > 0 ? { zone, score } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
};

const deliveryClarificationForAddress = (client, address = '') => {
  const delivery = client?.settings?.delivery || {};
  const mode = delivery.mode || (Array.isArray(delivery.zones) && delivery.zones.length ? 'location_zones' : 'fixed_addis');
  if (mode !== 'location_zones') return null;
  if (findDeliveryZoneForAddress(delivery, address)) return null;
  const candidates = deliveryZoneCandidatesForAddress(delivery, address);
  if (candidates.length < 2) return null;
  const topScore = candidates[0]?.score || 0;
  const close = candidates.filter(item => topScore - item.score <= 18).slice(0, 4);
  return close.length >= 2 ? close.map(item => item.zone) : null;
};

const deliveryClarificationButtons = (state = {}) => {
  const candidates = Array.isArray(state.deliveryCandidates) ? state.deliveryCandidates : [];
  const rows = candidates.slice(0, 4).map((zone, index) => ([{
    text: zone.area || zone.name || `Area ${index + 1}`,
    callback_data: `productflow:delivery_area:${index}`
  }]));
  rows.push([{ text: 'I will type more detail', callback_data: 'productflow:delivery_area:more' }]);
  rows.push([{ text: 'Cancel Order', callback_data: `productflow:cancel_order:${state.orderId}` }]);
  rows.push([{ text: '🏠 Main Menu', callback_data: 'productflow:main_menu' }]);
  return rows;
};

const deliveryClarificationText = (state = {}) => {
  const address = state.address ? `\n\nAddress you sent: ${state.address}` : '';
  return `I found more than one possible delivery area.${address}\n\nPlease choose the closest area below, or send a more specific address with building name, nearby landmark, shop name, or house number.`;
};

const applyDeliveryClarificationIfNeeded = (client, state = {}) => {
  const candidates = deliveryClarificationForAddress(client, state.address);
  if (!candidates?.length) {
    delete state.awaitingDeliveryClarification;
    delete state.deliveryCandidates;
    return false;
  }
  state.awaitingDeliveryClarification = true;
  state.deliveryCandidates = candidates.map(zone => ({
    area: zone.area || zone.name || '',
    name: zone.name || zone.area || '',
    fee: zone.fee,
    maxHours: zone.maxHours,
    enabled: zone.enabled
  }));
  return true;
};

const deliveryZoneByArea = (client, area = '') => {
  const areaKey = normalizeDeliveryArea(area);
  const zones = Array.isArray(client?.settings?.delivery?.zones) ? client.settings.delivery.zones : [];
  return zones.find(zone => normalizeDeliveryArea(zone?.area || zone?.name) === areaKey) || null;
};

const deliveryQuoteForOrder = (client, address, subtotal, preferredArea = '') => {
  const delivery = client?.settings?.delivery || {};
  const hasLegacyZones = !delivery.mode && Array.isArray(delivery.zones) && delivery.zones.length > 0;
  const mode = hasLegacyZones ? 'location_zones' : (delivery.mode || 'fixed_addis');
  const zone = preferredArea ? deliveryZoneByArea(client, preferredArea) : findDeliveryZoneForAddress(delivery, address);
  if (mode === 'location_zones' && zone) {
    const fee = Math.max(0, Number(zone.fee || 0) || 0);
    const maxHours = Math.max(1, Number(zone.maxHours || 24) || 24);
    return {
      inAddis: true,
      fee,
      status: 'not-started',
      source: 'delivery_zone',
      area: zone.area || zone.name || '',
      maxHours,
      total: Number(subtotal || 0) + fee,
      note: fee
        ? `Delivery to ${zone.area || zone.name}: ${fee} ETB, max ${maxHours} hour${maxHours === 1 ? '' : 's'}`
        : `Free delivery to ${zone.area || zone.name}, max ${maxHours} hour${maxHours === 1 ? '' : 's'}`
    };
  }
  const inAddis = isInAddis(address);
  if (mode === 'fixed_addis' && inAddis) {
    const fee = Math.max(0, Number(delivery.addis_delivery_fee ?? 300) || 0);
    const maxHours = Math.max(1, Number(delivery.maxHours || delivery.defaultMaxHours || 24) || 24);
    return {
      inAddis,
      fee,
      status: 'not-started',
      source: 'fixed_addis',
      maxHours,
      total: Number(subtotal || 0) + fee,
      note: fee ? `Includes ${fee} ETB delivery fee (Addis Ababa area)` : 'Free delivery in Addis Ababa area'
    };
  }
  if (mode === 'fixed_addis' && !isClearlyOutsideAddis(address)) {
    const fee = Math.max(0, Number(delivery.addis_delivery_fee ?? 300) || 0);
    const maxHours = Math.max(1, Number(delivery.maxHours || delivery.defaultMaxHours || 24) || 24);
    return {
      inAddis: true,
      fee,
      status: 'not-started',
      source: 'fixed_addis_fallback',
      maxHours,
      total: Number(subtotal || 0) + fee,
      note: fee
        ? `Includes ${fee} ETB delivery fee. The address was treated under the shop's fixed Addis Ababa delivery setting.`
        : 'Free delivery under the shop fixed Addis Ababa delivery setting.'
    };
  }
  return {
    inAddis,
    fee: 0,
    status: delivery.outside_addis_behavior === 'reject' ? 'delivery_rejected' : 'delivery_review_needed',
    source: 'manual',
    total: Number(subtotal || 0),
    note: 'Delivery fee needs owner confirmation (outside Addis Ababa area)'
  };
};

const validPaymentOptions = client => {
  const methods = client?.settings?.paymentOptions || client?.settings?.paymentMethods || [];
  return (Array.isArray(methods) ? methods : [])
    .slice(0, 3)
    .map(item => typeof item === 'string'
      ? { method: item, accountNumber: '', accountName: '' }
      : {
          method: String(item?.method || '').trim(),
          accountNumber: String(item?.accountNumber || '').trim(),
          accountName: String(item?.accountName || '').trim()
        })
    .filter(item => item.method && item.accountNumber && item.accountName);
};

const paymentInstructionsText = (client, order) => {
  const options = validPaymentOptions(client);
  if (!options.length) {
    return t(client, 'PAYMENT_NO_ACCOUNTS', {}, 'Payment options are not configured yet. The team will contact you with payment details.');
  }
  const lines = [
    t(client, 'PAYMENT_AMOUNT', { total: order.total }, `Amount to pay: ${order.total} Birr`),
    t(client, 'PAYMENT_OPTIONS', {}, 'Payment options:'),
    ''
  ];
  const addOnLines = orderAddOnLines(order);
  lines.push(...addOnLines);
  if (addOnLines.length) lines.push('');
  options.forEach((option, index) => {
    lines.push(`${index + 1}. ${option.method}`);
    lines.push(`   ${t(client, 'PAYMENT_ACCOUNT', { accountNumber: option.accountNumber }, `Account: ${option.accountNumber}`)}`);
    lines.push(`   ${t(client, 'PAYMENT_NAME', { accountName: option.accountName }, `Name: ${option.accountName}`)}`);
  });
  lines.push('');
  lines.push(t(client, 'PAYMENT_AFTER_PAY', {}, 'After payment, send your screenshot, transfer SMS, or copied bank/Telebirr message here.'));
  return lines.join('\n');
};

const paymentCopyButtons = client => validPaymentOptions(client).slice(0, 3).map((option, index) => ([{
  text: `Copy ${option.method} account`,
  copy_text: { text: option.accountNumber }
}]));

const moneyNumber = value => {
  const n = Number(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const orderAddOnTotal = order => (Array.isArray(order?.addOns) ? order.addOns : [])
  .reduce((sum, item) => sum + (moneyNumber(item.unitPrice) * Math.max(1, Number(item.quantity || 1))), 0);

const recalculateOrderTotal = order => {
  if (!order) return order;
  const mainSubtotal = moneyNumber(order.mainSubtotal || order.subtotal);
  const addOnSubtotal = orderAddOnTotal(order);
  const discountAmount = moneyNumber(order.discountAmount);
  const deliveryFee = moneyNumber(order.deliveryFee);
  const discountedSubtotal = Math.max(0, mainSubtotal - discountAmount) + addOnSubtotal;
  order.addOnSubtotal = String(addOnSubtotal);
  order.subtotal = String(mainSubtotal + addOnSubtotal);
  order.discountedSubtotal = String(discountedSubtotal);
  order.total = String(discountedSubtotal + deliveryFee);
  return order;
};

const orderAddOnLines = order => {
  const addOns = Array.isArray(order?.addOns) ? order.addOns : [];
  if (!addOns.length) return [];
  return [
    '',
    'Included add-on:',
    ...addOns.map(item => {
      const details = [
        item.selectedSize ? `Size: ${item.selectedSize}` : '',
        item.selectedColor ? `Color: ${item.selectedColor}` : '',
        item.selectedOption ? `Option: ${item.selectedOption}` : ''
      ].filter(Boolean).join(', ');
      return `- ${item.productName || item.productCode || 'Matched product'}${item.productCode ? ` (${item.productCode})` : ''}: ${item.unitPrice} Birr${details ? ` - ${details}` : ''}`;
    })
  ];
};

const checkoutMatchFields = product => {
  const fields = [];
  if (productSpecValues(product, 'size').length) fields.push('size');
  if (productSpecValues(product, 'color').length) fields.push('color');
  if (productSpecValues(product, 'option').length) fields.push('option');
  return fields;
};

const checkoutMatchButtons = (product, orderId, selected = {}) => {
  const rows = [];
  for (const field of checkoutMatchFields(product)) {
    const values = productSpecValues(product, field).slice(0, 8);
    const label = field === 'size' ? 'Size' : field === 'color' ? 'Color' : 'Option';
    rows.push([{ text: `${label}: ${selected[field] || 'choose'}`, callback_data: 'productflow:noop' }]);
    for (let i = 0; i < values.length; i += 2) {
      rows.push(values.slice(i, i + 2).map((value, offset) => ({
        text: `${selected[field] === value ? '✓ ' : ''}${value}`.slice(0, 40),
        callback_data: `productflow:match_spec:${field}:${i + offset}`
      })));
    }
  }
  rows.push([{ text: 'Include this in my order', callback_data: `productflow:match_add:${orderId}` }]);
  rows.push([{ text: 'No thanks, continue to payment', callback_data: `productflow:match_skip:${orderId}` }]);
  return rows;
};

const checkoutMatchPrompt = (order, match, selected = {}) => {
  const product = match?.product || {};
  const missing = checkoutMatchFields(product).filter(field => !selected[field]);
  let reply = `${match.uiHeadline || 'This may match your order'}\n\n`;
  reply += `${product.name || product.code || 'Matched product'}\n`;
  if (product.code) reply += `Code: ${product.code}\n`;
  reply += `Price: ${match.price} Birr\n`;
  reply += `Delivery: no extra delivery fee.\n`;
  if (product.description) reply += `\n${truncateText(product.description, 120)}\n`;
  if (missing.length) reply += `\nChoose ${missing.join(', ')} if you want to include it.`;
  else reply += `\nReady to include it in this order?`;
  return {
    handled: true,
    reply,
    buttons: checkoutMatchButtons(product, order.id, selected),
    stage: 'checkout_match',
    product
  };
};

const catEmoji = (cat) => {
  return labelIcon(cat);
  const m = {
    dress: '👗', dresses: '👗', clothing: '👚', clothes: '👚',
    shoe: '👟', shoes: '👟', sneakers: '👟',
    bag: '👜', bags: '👜', handbag: '👜',
    beauty: '💄', cosmetics: '💄', makeup: '💄',
    electronics: '📱', phone: '📱', phones: '📱',
    jewelry: '💍', jewellery: '💍',
    food: '🍕', drink: '🥤', drinks: '🥤',
    home: '🏠', furniture: '🪑', decor: '🏠',
    sports: '⚽', fitness: '💪',
    book: '📚', books: '📚',
    kid: '🧸', kids: '🧸', toy: '🧸', toys: '🧸',
  };
  return m[(cat || '').toLowerCase()] || '📦';
};

const labelIcon = (value = '') => {
  const text = String(value).toLowerCase();
  const cleanRules = [
    [/iphone|ios|apple phone/, 'iPhone'],
    [/samsung|galaxy/, 'Samsung'],
    [/tecno/, 'TECNO'],
    [/infinix/, 'Infinix'],
    [/redmi|xiaomi/, 'Xiaomi'],
    [/itel/, 'itel'],
    [/feature phone|used phone|mobile|smartphone|phone/, '\uD83D\uDCF1'],
    [/phone cases?|covers?|screen protectors?|holders?/, '\uD83D\uDEE1\uFE0F'],
    [/chargers?|cables?|type-c|power banks?|extension cords?/, '\u26A1'],
    [/earphones?|earbuds?|headphones?|audio/, '\uD83C\uDFA7'],
    [/selfie|memory card|sim adapter/, '\uD83D\uDCF8'],
    [/laptop|notebook|desktop|computer|pc|monitor/, '\uD83D\uDCBB'],
    [/keyboard|mouse|webcam|stand|peripheral/, '\u2328\uFE0F'],
    [/ssd|hard drive|flash disk|ram|storage/, '\uD83D\uDCBE'],
    [/printer|scanner|photocopy|barcode|pos|cash register|toner|ink|laminating|binding|shredder/, '\uD83D\uDDA8\uFE0F'],
    [/smart tv|led tv|android tv|tv box|receiver|remote|television/, '\uD83D\uDCFA'],
    [/soundbar|home theater|speaker|projector|microphone/, '\uD83D\uDD0A'],
    [/camera|cctv|security|doorbell|alarm|tripod|ring light|studio light/, '\uD83D\uDCF7'],
    [/router|wi-?fi|ethernet|network|modem|access point|fiber|switch/, '\uD83D\uDCF6'],
    [/solar|inverter|ups|battery|generator|stabilizer|power/, '\uD83D\uDD0B'],
    [/gaming|playstation|xbox|controller|console|gamepad/, '\uD83C\uDFAE'],
    [/jeans?|denim|trouser|pants?|leggings|cargo|wide-leg|skinny|high-waist/, '\uD83D\uDC56'],
    [/dress|habesha|kemis|gown|party dress|office dress|casual dress/, '\uD83D\uDC57'],
    [/skirt/, '\uD83E\uDE71'],
    [/t-shirt|tee|polo|shirt|crop top|tank top|bodysuit|blouse/, '\uD83D\uDC5A'],
    [/hoodie|sweatshirt|sweater|cardigan|jacket|coat|blazer|suit|vest|tracksuit|outerwear|knitwear/, '\uD83E\uDDE5'],
    [/maternity/, '\uD83E\uDD30'],
    [/baby|newborn/, '\uD83C\uDF7C'],
    [/kids?|boys|girls|school|pajama|toy/, '\uD83E\uDDD2'],
    [/heel/, '\uD83D\uDC60'],
    [/flat shoe|sandal|slipper/, '\uD83D\uDC61'],
    [/sneaker|sports shoe|shoe/, '\uD83D\uDC5F'],
    [/boot/, '\uD83E\uDD7E'],
    [/handbag|shoulder bag|crossbody|tote|clutch|bag/, '\uD83D\uDC5C'],
    [/backpack|school bag/, '\uD83C\uDF92'],
    [/laptop bag|travel bag|wallet|purse/, '\uD83D\uDCBC'],
    [/belt|tie|bow tie/, '\uD83D\uDC54'],
    [/sunglass/, '\uD83D\uDD76\uFE0F'],
    [/watch/, '\u231A'],
    [/scarf|hat|cap|sock/, '\uD83E\uDDE3'],
    [/jewelry|earring|necklace|bracelet|ring|anklet/, '\uD83D\uDC8D'],
    [/sofa|living room|recliner|ottoman|seating/, '\uD83D\uDECB\uFE0F'],
    [/coffee table|side table|console|tv stand|wardrobe|drawer|cabinet|shelf|storage|rack/, '\uD83D\uDDC4\uFE0F'],
    [/bed|mattress|bedroom|crib|bunk/, '\uD83D\uDECF\uFE0F'],
    [/desk|office|workstation/, '\uD83C\uDFE2'],
    [/chair|stool/, '\uD83E\uDE91'],
    [/dining|kitchen table/, '\uD83C\uDF7D\uFE0F'],
    [/outdoor|garden|patio|balcony|bench|shade/, '\uD83C\uDFE1'],
    [/wood|mdf|metal|plastic|leather|custom/, '\uD83D\uDD28'],
    [/makeup|lipstick|mascara|eyeliner|foundation|concealer|powder|blush|nail/, '\uD83D\uDC84'],
    [/skincare|cream|serum|sunscreen|cleanser|lotion|mask|scrub|toner|retinol|acne/, '\uD83E\uDDF4'],
    [/wig|hair extension|braiding|crochet|bundle|hair|shampoo|conditioner|salon|barber|clipper|dryer|straightener|shaver/, '\uD83D\uDC87\u200D\u2640\uFE0F'],
    [/perfume|fragrance|deodorant|body spray|arabic perfume|oil/, '\u2728'],
    [/soap|shower|tooth|mouthwash|razor|personal care|hygiene|feminine|cotton/, '\uD83E\uDDFC'],
    [/beauty tool|facial steamer|manicure|pedicure|mirror|tweezer/, '\uD83E\uDE9E'],
    [/blender|juicer|kettle|coffee|toaster|cooker|air fryer|microwave|oven|stove|mitad|kitchen appliance/, '\uD83C\uDF73'],
    [/refrigerator|freezer|washing machine|dryer|dishwasher|dispenser|large appliance/, '\u2744\uFE0F'],
    [/vacuum|iron|fan|air conditioner|heater|humidifier|home appliance/, '\uD83E\uDDF9'],
    [/pot|pan|plate|bowl|cup|glass|mug|spoon|fork|knife|kitchenware|cookware|tableware/, '\uD83C\uDF7D\uFE0F'],
    [/jebena|rekebot|sini|injera|mesob|clay|spice|berbere|ethiopian/, '\u2615'],
    [/mop|broom|cleaning|bucket|dustbin|laundry|detergent|glove/, '\uD83E\uDDFD'],
    [/bedsheet|blanket|pillow|towel|curtain|carpet|rug|textile|bedding/, '\uD83D\uDECF\uFE0F'],
    [/light|bulb|lamp|chandelier|lighting/, '\uD83D\uDCA1'],
    [/new arrival/, '\u2728'],
    [/best seller/, '\uD83D\uDD25'],
    [/discount|sale|promo/, '\uD83C\uDFF7\uFE0F'],
    [/accessor/, '\uD83E\uDDE9']
  ];
  return cleanRules.find(([pattern]) => pattern.test(text))?.[1] || '\uD83D\uDCE6';
  const modernRules = [
    [/iphone|ios|apple phone/, ''],
    [/samsung|galaxy/, 'SAMSUNG'],
    [/tecno/, 'TECNO'],
    [/infinix/, 'Infinix'],
    [/redmi|xiaomi/, 'Mi'],
    [/itel/, 'itel'],
    [/feature phone|used phone|mobile|smartphone|phone/, '📱'],
    [/jean|denim|trouser|pants?|leggings|cargo|wide-leg|skinny|high-waist/, '👖'],
    [/t-shirt|tee|polo|shirt|crop top|tank top|bodysuit|blouse/, '👕'],
    [/hoodie|sweatshirt|sweater|cardigan|jacket|coat|blazer|suit|vest|tracksuit|gym wear/, '🧥'],
    [/dress|skirt|habesha|kemis|jumpsuit|two-piece|maternity|plus-size|women/, '👗'],
    [/men|shorts|traditional men/, '👔'],
    [/baby|kids?|boys|girls|newborn|school|pajama|toy/, '🧸'],
    [/shoe|heel|sandal|sneaker|boot|slipper/, '👟'],
    [/bag|handbag|backpack|wallet|purse|clutch|tote/, '👜'],
    [/watch|sunglass|jewelry|earring|necklace|bracelet|ring|belt|hat|cap|scarf|tie/, '💍'],
    [/case|charger|cable|power bank|earphone|earbud|headphone|screen protector/, '🔌'],
    [/laptop|computer|desktop|monitor|keyboard|mouse|ssd|flash|ram|webcam/, '💻'],
    [/printer|scanner|photocopy|barcode|pos|cash register|toner|ink/, '🖨️'],
    [/tv|speaker|soundbar|projector|microphone|decoder|remote/, '📺'],
    [/camera|cctv|security|doorbell|alarm|tripod|ring light/, '📷'],
    [/router|wi-?fi|ethernet|network|modem|fiber/, '🌐'],
    [/solar|inverter|ups|battery|generator|power/, '🔋'],
    [/gaming|playstation|xbox|controller|console/, '🎮'],
    [/sofa|living room|recliner|coffee table|ottoman/, '🛋️'],
    [/bed|mattress|wardrobe|bedroom|crib|bunk/, '🛏️'],
    [/office|desk|chair|filing|conference|workstation/, '🪑'],
    [/dining|kitchen table|bar stool/, '🍽️'],
    [/outdoor|garden|patio|balcony|bench/, '🏡'],
    [/storage|shelf|rack|cabinet|drawer/, '🗄️'],
    [/makeup|lipstick|mascara|eyeliner|foundation|powder|nail/, '💄'],
    [/skincare|cream|serum|sunscreen|cleanser|lotion|mask|scrub/, '🧴'],
    [/wig/, '💁'],
    [/hair|shampoo|conditioner|salon|barber|clipper/, '💇'],
    [/perfume|fragrance|deodorant|body spray/, '🌸'],
    [/soap|shower|tooth|mouthwash|razor|personal care/, '🧼'],
    [/blender|juicer|kettle|toaster|cooker|air fryer|microwave|oven|stove|mitad/, '🍳'],
    [/refrigerator|freezer|washing|dishwasher|dispenser/, '🧊'],
    [/pot|pan|plate|bowl|cup|glass|mug|spoon|fork|knife|kitchenware/, '🥘'],
    [/jebena|rekebot|sini|injera|mesob|clay|spice|berbere/, '☕'],
    [/mop|broom|cleaning|bucket|dustbin|laundry|detergent/, '🧹'],
    [/bedsheet|blanket|pillow|towel|curtain|carpet|rug|textile/, '🛌'],
    [/light|bulb|lamp|chandelier/, '💡'],
    [/new arrival/, '✨'],
    [/best seller/, '🔥'],
    [/discount/, '🏷️']
  ];
  return modernRules.find(([pattern]) => pattern.test(text))?.[1] || '📦';
  const rules = [
    [/iphone|ios|apple phone/, '🍎'],
    [/samsung|galaxy/, '📱'],
    [/tecno|infinix|redmi|xiaomi|itel|mobile|phone/, '📱'],
    [/jean|denim|trouser|pants?|leggings|cargo pants?|formal pants?|wide-leg|skinny|high-waist/, '👖'],
    [/t-shirt|tee|polo|shirt|crop top|tank top|bodysuit|blouse/, '👕'],
    [/hoodie|sweatshirt|sweater|cardigan|jacket|coat|blazer|suit|vest|tracksuit|gym wear/, '🧥'],
    [/iphone|samsung|tecno|infinix|redmi|xiaomi|itel|mobile|phone/, '📱'],
    [/case|charger|cable|power bank|earphone|earbud|headphone|screen protector/, '🔌'],
    [/laptop|computer|desktop|monitor|keyboard|mouse|ssd|flash|ram|webcam/, '💻'],
    [/printer|scanner|photocopy|barcode|pos|cash register|toner|ink/, '🖨️'],
    [/tv|speaker|soundbar|projector|microphone|decoder|remote/, '📺'],
    [/camera|cctv|security|doorbell|alarm|tripod|ring light/, '📷'],
    [/router|wi-?fi|ethernet|network|modem|fiber/, '🌐'],
    [/solar|inverter|ups|battery|generator|power/, '🔋'],
    [/gaming|playstation|xbox|controller|console/, '🎮'],
    [/dress|skirt|habesha|kemis|women/, '👗'],
    [/men|shirt|t-shirt|hoodie|jacket|blazer|suit|trouser|jean|pants?/, '👕'],
    [/baby|kids?|boys|girls|newborn|school/, '🧸'],
    [/shoe|heel|sandal|sneaker|boot|slipper/, '👟'],
    [/bag|handbag|backpack|wallet|purse|clutch|tote/, '👜'],
    [/watch|sunglass|jewelry|earring|necklace|bracelet|ring|belt|hat|cap|scarf|tie/, '🕶️'],
    [/sofa|living room|recliner|coffee table|ottoman/, '🛋️'],
    [/bed|mattress|wardrobe|bedroom|crib|bunk/, '🛏️'],
    [/office|desk|chair|filing|conference|workstation/, '🪑'],
    [/dining|kitchen table|bar stool/, '🍽️'],
    [/outdoor|garden|patio|balcony|bench/, '🏡'],
    [/storage|shelf|rack|cabinet|drawer/, '🗄️'],
    [/makeup|lipstick|mascara|eyeliner|foundation|powder|nail/, '💄'],
    [/skincare|cream|serum|sunscreen|cleanser|lotion|mask|scrub/, '🧴'],
    [/hair|wig|shampoo|conditioner|salon|barber|clipper/, '💇'],
    [/perfume|fragrance|deodorant|body spray/, '🌸'],
    [/soap|shower|tooth|mouthwash|razor|personal care/, '🧼'],
    [/blender|juicer|kettle|toaster|cooker|air fryer|microwave|oven|stove|mitad/, '🍳'],
    [/refrigerator|freezer|washing|dishwasher|dispenser/, '🧊'],
    [/vacuum|iron|fan|air conditioner|heater|humidifier/, '🏠'],
    [/pot|pan|plate|bowl|cup|glass|mug|spoon|fork|knife|kitchenware/, '🥘'],
    [/jebena|rekebot|sini|injera|mesob|clay|spice|berbere/, '☕'],
    [/mop|broom|cleaning|bucket|dustbin|laundry|detergent/, '🧹'],
    [/bedsheet|blanket|pillow|towel|curtain|carpet|rug|textile/, '🛌'],
    [/light|bulb|lamp|chandelier/, '💡'],
    [/new arrival/, '✨'],
    [/best seller/, '🔥'],
    [/discount/, '🏷️']
  ];
  return rules.find(([pattern]) => pattern.test(text))?.[1] || '📦';
};

const extractField = (text, type) => {
  const t = (text || '').trim();
  if (!t) return '';
  switch (type) {
    case 'name':
      const nameM = t.match(/^(?:my name is |i am |i'm |name[: ]*)(.+)/i);
      return nameM ? nameM[1].trim() : t.replace(/^(?:hi|hello|hey|ok|okay|yes|yeah|no|thanks|thank you)\b[,\s]*/i, '').trim().slice(0, 60);
    case 'phone':
      const pm = t.match(/(?:\+251|0)[\d\s\-()]{7,12}/);
      return pm ? pm[0].trim() : '';
    case 'address':
      return t.replace(/^(?:my address is |address[: ]*|deliver to |send to |location[: ]*)/i, '').trim().slice(0, 200);
    case 'size':
      return t.replace(/^(?:size |i need size |my size is |i want size )/i, '').trim().slice(0, 30);
    case 'color':
      return t.replace(/^(?:color |i want |i need |the |in )/i, '').trim().slice(0, 30);
    default:
      return t.slice(0, 200);
  }
};

const productSpecContext = product => String([
  product?.category,
  product?.subcategory,
  product?.name,
  product?.productType,
  product?.code,
  product?.productCode
].filter(Boolean).join(' ')).toLowerCase();

const productSpecFamily = product => {
  const text = productSpecContext(product);
  if (/\b(phone|smartphone|iphone|samsung|tecno|infinix|redmi|xiaomi|laptop|computer|tablet|electronics?|device|charger|cable|power bank|router|tv|camera|printer|gaming|playstation|xbox)\b/.test(text)) return 'electronics';
  if (/\b(shoe|sneaker|boot|sandal|heel|slipper)\b/.test(text)) return 'shoes';
  if (/\b(jeans?|denim|pants?|trousers?|bottoms?)\b/.test(text)) return 'jeans';
  if (/\b(dress|shirt|t.?shirt|top|crop|skirt|shurab|sweater|hoodie|jacket|coat|blazer|suit|clothing|fashion|boutique|habesha|kemis)\b/.test(text)) return 'fashion';
  if (/\b(makeup|cosmetic|beauty|cream|lotion|perfume|fragrance|skin|hair|wig|extension|lipstick|mascara|sunscreen)\b/.test(text)) return 'beauty';
  if (/\b(furniture|sofa|chair|table|bed|mattress|cabinet|wardrobe|shelf|desk)\b/.test(text)) return 'furniture';
  if (/\b(kitchen|appliance|cookware|pot|pan|plate|cup|kettle|blender|mitad|jebena|mesob|home)\b/.test(text)) return 'home';
  return 'general';
};

const labelWithIcon = (label = '', suffix = '') => {
  const text = String(label || '').trim();
  const icon = labelIcon(text);
  const duplicateBrand = icon && /^[A-Za-z0-9 ]+$/.test(icon) && text.toLowerCase().includes(icon.toLowerCase());
  return `${duplicateBrand ? '' : `${icon} `}${text}${suffix}`.trim();
};

const inappropriateSpecValue = (product, field, value) => {
  const family = productSpecFamily(product);
  const item = String(value || '').toLowerCase();
  const electronicsOnly = /\b(?:\d+\s*(?:gb|tb)\b|ram|storage|ssd|hdd|usb|type-c|micro usb|mah|watt|hz|inch|sim|lte|5g|4g|playstation|xbox)\b/;
  const fashionOnly = /\b(?:xs|xxs|s|m|l|xl|xxl|xxxl|skinny|slim|straight|regular|relaxed|wide leg|high waist|low waist|omo|washed blue)\b/;
  const shoeSizeOnly = /^(?:3[5-9]|4[0-6])$/;

  if (family !== 'electronics' && electronicsOnly.test(item)) return true;
  if (family === 'electronics' && field === 'size' && fashionOnly.test(item) && !/\d+\s*(?:gb|tb)/.test(item)) return true;
  if (family !== 'shoes' && shoeSizeOnly.test(item)) return true;
  if (family === 'fashion' && field === 'option' && /\b(?:brand new|used|imported|local|single item|set bundle)\b/.test(item)) return true;
  return false;
};

const productSpecValues = (product, field) => {
  const raw = field === 'size' ? product?.sizes : field === 'color' ? product?.colors : product?.options;
  const values = (Array.isArray(raw) ? raw : String(raw || '').split(/[,|/;\n]+/))
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .slice(0, 12);
  return values.filter(value => !inappropriateSpecValue(product, field, value));
};

const requiredOrderFields = (state, product) => {
  const fields = [];
  if (!state.customerName || !state.phone || !state.address) fields.push('contact');
  if (state.awaitingDeliveryClarification) fields.push('delivery_area');
  if (!state.quantity) fields.push('quantity');
  if (productSpecValues(product, 'size').length && !state.size) fields.push('size');
  if (productSpecValues(product, 'color').length && !state.color) fields.push('color');
  if (productSpecValues(product, 'option').length && !state.option) fields.push('option');
  return fields;
};

const orderStartPhrase = (product, customerName = '', seed = '') => {
  const firstName = String(customerName || '').trim().split(/\s+/)[0] || 'friend';
  const family = productSpecFamily(product);
  const client = product && PRODUCT_CLIENTS.get(product);
  const options = family === 'electronics'
    ? [
      t(client, 'ORDER_START_ELECTRONICS_1', { firstName }, `Nice pick, ${firstName}. I will prepare this device order carefully.`),
      t(client, 'ORDER_START_ELECTRONICS_2', { firstName }, `Solid choice, ${firstName}. Let us get the details right for this product.`),
      t(client, 'ORDER_START_ELECTRONICS_3', { firstName }, `Good pick, ${firstName}. I will help you place this order smoothly.`)
    ]
    : family === 'fashion' || family === 'jeans' || family === 'shoes'
      ? [
        t(client, 'ORDER_START_FASHION_1', { firstName }, `Lovely choice, ${firstName}. I will prepare this order for you.`),
        t(client, 'ORDER_START_FASHION_2', { firstName }, `That looks like a good fit, ${firstName}. Let us finish the order.`),
        t(client, 'ORDER_START_FASHION_3', { firstName }, `Nice choice, ${firstName}. I will help you choose the right details.`)
      ]
      : [
        t(client, 'ORDER_START_1', { firstName }, `Nice choice, ${firstName}. I will prepare this order for you.`),
        t(client, 'ORDER_START_2', { firstName }, `Perfect, ${firstName}. Let us collect the details for this order.`),
        t(client, 'ORDER_START_3', { firstName }, `Good pick, ${firstName}. I will help you finish this order.`)
      ];
  const index = Math.abs(String(seed || product?.id || product?.code || firstName).split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0)) % options.length;
  return options[index];
};
const orderFieldPrompt = (field, product, customerName = '') => {
  const firstName = String(customerName || '').trim().split(/\s+/)[0] || 'friend';
  const client = product && PRODUCT_CLIENTS.get(product);
  if (field === 'contact') {
    return `${orderStartPhrase(product, firstName)}\n\n${t(client, 'ORDER_SHARE_PHONE_PROMPT', {}, 'Please tap Share Phone Number so I can get your phone correctly. You can also type your full name, phone number, and delivery address in one message.')}`;
  }
  if (field === 'delivery_area') return deliveryClarificationText({});
  if (field === 'quantity') return `${t(client, 'ORDER_QUANTITY_PROMPT')}\n\n${t(client, 'ORDER_QUANTITY_HELP')}`;
  const values = productSpecValues(product, field);
  const label = field === 'size' ? 'size' : field === 'color' ? 'color' : 'option';
  return `${t(client, 'ORDER_OPTION_PROMPT', { optionType: label, productName: product?.name || product?.code || 'this product' })}\n\n${values.join(', ')}`;
};
const orderFieldSequence = product => [
  'contact',
  'quantity',
  ...(productSpecValues(product, 'size').length ? ['size'] : []),
  ...(productSpecValues(product, 'color').length ? ['color'] : []),
  ...(productSpecValues(product, 'option').length ? ['option'] : [])
];

const orderFieldHasValue = (state = {}, field) => {
  if (field === 'contact') return Boolean(state.customerName || state.phone || state.address);
  return Boolean(state[field]);
};

const previousOrderField = (state = {}, product = {}) => {
  const sequence = orderFieldSequence(product);
  const current = requiredOrderFields(state, product)[0] || 'confirmation';
  const currentIndex = current === 'confirmation' ? sequence.length : sequence.indexOf(current);
  for (let i = currentIndex - 1; i >= 0; i -= 1) {
    if (orderFieldHasValue(state, sequence[i])) return sequence[i];
  }
  return '';
};

const clearOrderField = (state = {}, field) => {
  if (field === 'contact') {
    state.customerName = '';
    state.phone = '';
    state.address = '';
    delete state.awaitingNameConfirmation;
    delete state.awaitingAddressOnly;
    delete state.deliveryAreaHint;
    delete state.awaitingDeliveryClarification;
    delete state.deliveryCandidates;
  } else if (field) {
    state[field] = '';
  }
  return state;
};

const addOrderNavRows = (rows, state = {}, product = {}, orderId = '') => {
  if (previousOrderField(state, product)) {
    rows.push([{ text: 'Back', callback_data: `productflow:back_order:${orderId}` }]);
  }
  rows.push([{ text: 'Cancel Order', callback_data: `productflow:cancel_order:${orderId}` }]);
  rows.push([{ text: 'Main Menu', callback_data: 'productflow:main_menu' }]);
  return rows;
};

const specButtons = (field, product, orderId, state = {}) => {
  const values = productSpecValues(product, field);
  if (!values.length) return [];
  const rows = values.map((value, index) => ([{
    text: value.slice(0, 40),
    callback_data: `productflow:spec:${field}:${index}`
  }]));
  return addOrderNavRows(rows, state, product, orderId);
};

const orderPromptButtons = (field, product, orderId, state = {}) => {
  if (field === 'quantity') {
    return addOrderNavRows([
      [
        { text: '1', callback_data: 'productflow:spec:quantity:1' },
        { text: '2', callback_data: 'productflow:spec:quantity:2' },
        { text: '3', callback_data: 'productflow:spec:quantity:3' }
      ]
    ], state, product, orderId);
  }
  if (field === 'delivery_area') return deliveryClarificationButtons(product || {});
  if (field === 'contact') return addOrderNavRows([], state, product, orderId);
  return specButtons(field, product, orderId, state);
};

const orderContactReplyKeyboard = client => ({
  keyboard: [
    [{ text: t(client, 'ORDER_SHARE_PHONE_BUTTON', {}, '📱 Share Phone Number'), request_contact: true }],
    [{ text: t(client, 'ORDER_TYPE_MANUALLY_BUTTON', {}, '✍️ Type Manually') }]
  ],
  resize_keyboard: true,
  one_time_keyboard: true
});

const parseContactDetails = text => {
  const raw = String(text || '').trim();
  const phoneMatch = raw.match(/(?:\+251|0)[\d\s\-()]{7,14}/);
  const phone = phoneMatch ? phoneMatch[0].replace(/[^\d+]/g, '') : '';
  const withoutPhone = phoneMatch ? raw.replace(phoneMatch[0], ' ') : raw;
  const lines = withoutPhone
    .split(/\n|,/)
    .map(line => line.trim())
    .filter(Boolean);
  const cleaned = withoutPhone.replace(/\s+/g, ' ').trim();
  let customerName = '';
  let address = '';

  if (lines.length >= 2) {
    customerName = extractField(lines[0], 'name');
    address = extractField(lines.slice(1).join(', '), 'address');
  } else {
    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length >= 4) {
      customerName = words.slice(0, 2).join(' ');
      address = words.slice(2).join(' ');
    } else {
      customerName = extractField(cleaned, 'name');
    }
  }

  return {
    customerName: customerName.slice(0, 60),
    phone,
    address: address.slice(0, 200)
  };
};

// ════════════════════════════════════════════════════════════
// STAGE HANDLERS
// ════════════════════════════════════════════════════════════

async function generateProductflowGreeting(client, conversation = {}, data = null) {
  applyShopperLanguage(client, conversation);
  // Enrich client with products from data if available
  if (data) enrichClientProducts(data, client);
  const bizName = client?.businessName || 'our store';
  const cats = productCategories(client);
  debugLog(`[ProductFlow Greeting] bizName=${bizName}, categories found: [${cats.join(', ')}], product count: ${activeProducts(client).length}`);
  const firstName = conversation?.customer?.firstName || conversation?.customer?.first_name || conversation?.customer?.name || 'friend';
  const isReturning = conversation?.lastSeenAt && Date.now() - new Date(conversation.lastSeenAt).getTime() < 6 * 60 * 60 * 1000;
  const profile = client?.settings?.businessProfile || {};
  const firstTimeExtra = String(profile.welcomeMessage || '').trim() || t(client, 'WELCOME_FIRST_TIME_EXTRA', { businessName: bizName });
  const reply = [
    t(client, isReturning ? 'WELCOME_BACK' : 'WELCOME_TITLE', { firstName, businessName: bizName }, `Welcome to ${bizName}!`),
    t(client, 'WELCOME_HELP'),
    isReturning ? '' : firstTimeExtra
  ].filter(Boolean).join('\n\n');

  const buttons = [];
  buttons.push([{ text: t(client, 'BTN_BROWSE_PRODUCTS'), callback_data: 'productflow:explore' }]);
  buttons.push([{ text: t(client, preferredShopperLanguage(conversation) === 'english' ? 'BTN_LANGUAGE_AMHARIC' : 'BTN_LANGUAGE_ENGLISH'), callback_data: `productflow:language:${preferredShopperLanguage(conversation) === 'english' ? 'amharic' : 'english'}` }]);
  if (cats.length > 0) {
    const top = cats.slice(0, 3).map(c => ({
      text: labelWithIcon(c.charAt(0).toUpperCase() + c.slice(1)),
      callback_data: `productflow:category:${c.toLowerCase().replace(/\s+/g, '_')}`
    }));
    buttons.push(top);
  }
  buttons.push([
    { text: t(client, 'BTN_SEARCH'), callback_data: 'productflow:search' },
    { text: t(client, 'BTN_TRACK_ORDER'), callback_data: 'productflow:track_order' }
  ]);
  buttons.push([{ text: t(client, 'BTN_TALK_SUPPORT'), callback_data: 'productflow:support' }]);

  return { reply, buttons, stage: 'greeting' };
}
async function handleExplore(client, conversation) {
  const cats = populatedCategories(client);
  const prods = activeProducts(client);
  debugLog(`[ProductFlow Explore] categories: [${cats.map(c => c.name).join(', ')}], visible products: ${prods.length}`);
  prods.forEach(p => debugLog(`[ProductFlow Explore]   - "${p.name}" cat=${p.category} price=${p.price}`));
  if (cats.length === 0) {
    debugLog(`[ProductFlow Explore] NO CATEGORIES - client.products length: ${(client?.products||[]).length}`);
    conversation.conversationState = 'shopping_mode';
    return {
      reply: t(client, 'CATALOG_EMPTY', {}, 'We are restocking our catalog right now. Please check back soon.'),
      buttons: [[{ text: 'Main Menu', callback_data: 'productflow:main_menu' }]],
      stage: 'category_browsing'
    };
  }
  const bizName = client?.businessName || 'our store';
  const buttons = [];
  const row = (arr) => buttons.push(arr);
  const display = cats.slice(0, 12);
  const chunks = [];
  while (display.length) chunks.push(display.splice(0, 2));
  for (const chunk of chunks) {
    row(chunk.map(c => ({
      text: labelWithIcon(c.name, ` (${c.productCount})`),
      callback_data: `productflow:category:${slug(c.name)}`
    })));
  }
  row([{ text: 'Main Menu', callback_data: 'productflow:main_menu' }]);

  conversation.stageState = { stage: 'category_browsing' };
  conversation.conversationState = 'shopping_mode';

  return {
    reply: `${t(client, 'CATALOG_TITLE', { businessName: bizName })}\n\n${t(client, 'CATALOG_CHOOSE_CATEGORY')}`,
    buttons,
    stage: 'category_browsing'
  };
}
async function handleCategoryBrowse(client, conversation, param) {
  const category = (param || '').replace(/_/g, ' ');
  const categoryRecord = findPopulatedCategory(client, param);
  if (categoryRecord?.subcategories?.length) {
    const buttons = categoryRecord.subcategories.slice(0, 18).map(subcategory => ([{
      text: labelWithIcon(subcategory.name, ` (${subcategory.productCount})`),
      callback_data: `productflow:subcategory:${slug(categoryRecord.name)}:${slug(subcategory.name)}`
    }]));
    buttons.push([{ text: t(client, 'CATALOG_ALL_CATEGORY', { categoryName: categoryRecord.name }, `All ${categoryRecord.name}`), callback_data: `productflow:subcategory:${slug(categoryRecord.name)}:all` }]);
    buttons.push([{ text: t(client, 'CATALOG_BACK_CATEGORIES', {}, 'Back to Categories'), callback_data: 'productflow:explore' }]);
    conversation.stageState = { stage: 'subcategory_browsing', category: categoryRecord.name };
    conversation.conversationState = 'shopping_mode';
    return {
      reply: t(client, 'CATALOG_CHOOSE_SUBCATEGORY', { categoryName: categoryRecord.name }, `Choose a ${categoryRecord.name} subcategory:`),
      buttons,
      stage: 'subcategory_browsing'
    };
  }
  const products = productsInCategory(client, categoryRecord?.name || category);
  if (products.length === 0) {
    return {
      reply: t(client, 'CATALOG_NO_PRODUCTS', { categoryName: category }, `No products available in ${category} right now.`),
      buttons: [
        [{ text: t(client, 'CATALOG_BACK_CATEGORIES', {}, 'Back to Categories'), callback_data: 'productflow:explore' }],
        [{ text: '🏠 Main Menu', callback_data: 'productflow:main_menu' }]
      ],
      stage: 'category_browsing'
    };
  }
  return await showProductPage(client, conversation, category, products, 0);
}

async function handleSubcategoryBrowse(client, conversation, param) {
  const [categorySlug, subcategorySlug] = String(param || '').split(':');
  const categoryRecord = findPopulatedCategory(client, categorySlug);
  if (!categoryRecord) return await handleExplore(client, conversation);
  const subcategoryRecord = subcategorySlug === 'all' ? null : findPopulatedSubcategory(categoryRecord, subcategorySlug);
  const products = productsInCategory(client, categoryRecord.name, subcategoryRecord?.name || '');
  return await showProductPage(client, conversation, categoryRecord.name, products, 0, subcategoryRecord?.name || '');
}

function productBrowseCaption(product, itemNumber, total) {
  const client = product && PRODUCT_CLIENTS.get(product);
  const price = productPrice(product);
  const desc = truncateText(product.shortDescription || product.description || '', 120);

  let caption = `${product.name || product.code || 'Product'}\n`;
  if (product.code) caption += `${t(client, 'PRODUCT_CODE', { productCode: product.code })}\n`;
  caption += `${price ? t(client, 'PRODUCT_PRICE', { price }) : t(client, 'PRODUCT_PRICE_CONTACT')}\n`;
  if (desc) caption += `\n${desc}\n`;
  caption += `\n${t(client, 'PRODUCT_POSITION', { current: itemNumber, total })}`;
  return caption;
}
function productGalleryPaths(product) {
  const paths = normalizeProductImages(product)
    .map(image => image.publicPath || image.watermarkedPath || image.originalPath)
    .filter(Boolean);
  const legacy = [
    product?.watermarkedImageUrl,
    product?.publicImageUrl,
    product?.imageWatermarked,
    product?.publicImagePath,
    product?.watermarkedImagePath,
    product?.imagePath,
    product?.imageUrl,
    product?.image
  ].filter(Boolean);
  return [...new Set([...paths, ...legacy])].slice(0, 3);
}

function productImagePath(product) {
  return productGalleryPaths(product)[0] ||
    product?.watermarkedImageUrl ||
    product?.publicImageUrl ||
    product?.imageWatermarked ||
    product?.imagePath ||
    product?.imageUrl ||
    product?.image ||
    '';
}

async function sendProductMedia(ctx, product, reply, buttons = []) {
  const galleryPaths = productGalleryPaths(product);
  if (!galleryPaths.length) return false;
  const markup = buttons?.length ? Markup.inlineKeyboard(buttons) : {};
  if (galleryPaths.length > 1 && typeof ctx?.replyWithMediaGroup === 'function') {
    try {
      const media = galleryPaths.slice(0, 3).map((imgPath, index) => ({
        type: 'photo',
        media: imgPath.startsWith('http') ? imgPath : Input.fromLocalFile(imgPath),
        caption: index === 0 ? cleanShopperText(reply) : undefined
      }));
      await ctx.replyWithMediaGroup(media);
      if (buttons?.length) {
        await ctx.reply(`Choose an action for ${product.name || product.code || 'this product'}:`, markup);
      }
      return true;
    } catch (error) {
      console.log(`[ProductFlow] Album send failed for "${product?.name}", falling back to one photo: ${error.message}`);
    }
  }
  const imgPath = galleryPaths[0];
  const photoSource = imgPath.startsWith('http') ? imgPath : Input.fromLocalFile(imgPath);
  await ctx.replyWithPhoto(photoSource, {
    caption: cleanShopperText(reply),
    reply_markup: buttons?.length ? markup.reply_markup : undefined
  });
  return true;
}

function productSearchHaystack(product) {
  return [
    product?.code,
    product?.productCode,
    product?.name,
    product?.category,
    product?.subcategory,
    product?.selectedCategory,
    product?.selectedSubcategory,
    product?.description,
    product?.shortDescription,
    product?.salesPostCaption,
    product?.detailedSearchDescription,
    product?.material,
    product?.sizes,
    product?.colors,
    product?.options,
    product?.variantNote,
    Array.isArray(product?.tags) ? product.tags.join(' ') : product?.tags,
    product?.productAttributes ? JSON.stringify(product.productAttributes) : ''
  ].filter(Boolean).join(' ').toLowerCase();
}

function searchProducts(client, text, limit = 30) {
  const value = String(text || '').trim().toLowerCase();
  const normalizedValue = normalizeSearchText(text);
  const products = activeProducts(client);
  const exactCode = products.find(product => {
    const code = String(product.code || product.productCode || '').trim().toLowerCase();
    return code && code === value;
  }) || products.find(product => {
    const code = String(product.code || product.productCode || '').trim().toLowerCase();
    return code && new RegExp(`(^|[^\\p{L}\\p{N}])${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}\\p{N}]|$)`, 'iu').test(value);
  });
  if (exactCode) return [exactCode];

  const query = tokenizeProductSearch(text);
  if (!query.length) return [];
  return products
    .map(product => {
      const rawHaystack = productSearchHaystack(product);
      const haystack = normalizeSearchText(rawHaystack);
      const name = normalizeSearchText(product.name || '');
      const category = normalizeSearchText([product.category, product.subcategory, product.selectedCategory, product.selectedSubcategory].filter(Boolean).join(' '));
      const code = String(product.code || product.productCode || '').trim().toLowerCase();
      const rawName = String(product.name || '').toLowerCase();
      const score = query.reduce((sum, term) => {
        const haystackTerms = haystack.split(/\s+/);
        const termMatches = haystackTerms.includes(term) || (term.length >= 4 && haystack.includes(term));
        if (!termMatches) return sum;
        return sum + (name.split(/\s+/).includes(term) ? 6 : category.split(/\s+/).includes(term) ? 4 : 2);
      }, 0);
      const phraseBoost = normalizedValue && haystack.includes(normalizedValue) ? 8 : 0;
      const codeBoost = code && value.includes(code) ? 20 : 0;
      const nameBoost = rawName && value && rawName.includes(value) ? 8 : 0;
      return { product, score: score + phraseBoost + codeBoost + nameBoost };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.product)
    .slice(0, limit);
}

async function productSearchResult(client, conversation, text, page = 0) {
  const query = String(text || conversation.stageState?.searchQuery || '').trim();
  const matches = searchProducts(client, query, 40);
  if (!matches.length) return null;
  return await showSearchPage(client, conversation, matches, page, query);
}

function looksLikeProductSearchText(text) {
  const value = String(text || '').trim();
  if (value.length < 2) return false;
  if (/^\/|^(yes|no|ok|okay|thanks|thank you|hello|hi|hey|selam|salam)$/i.test(value)) return false;
  if (/\b(support|help|track|delivery|payment|paid|receipt|screenshot|cancel|stop)\b/i.test(value)) return false;
  if (/\b(show|find|search|need|want|looking for|available|stock|price|code|product|item|dress|jeans|shirt|shoe|phone|laptop|bag|watch|makeup|cream|perfume)\b/i.test(value)) return true;
  return tokenizeProductSearch(value).length >= 1 && value.length <= 80;
}

async function showProductPage(client, conversation, category, products, page, subcategory = '', options = {}) {
  const total = products.length;
  const safePage = Math.max(0, parseInt(page, 10) || 0);
  const startIndex = safePage * PAGE_SIZE;
  const batch = products.slice(startIndex, startIndex + PAGE_SIZE);
  if (!batch.length) {
    return {
      reply: `That's all in **${category ? category.charAt(0).toUpperCase() + category.slice(1) : 'this category'}**. Choose another:`,
      buttons: [
        [{ text: t(client, 'CATALOG_BACK_CATEGORIES', {}, 'Back to Categories'), callback_data: 'productflow:explore' }],
        [{ text: '🏠 Main Menu', callback_data: 'productflow:main_menu' }]
      ],
      stage: 'category_browsing'
    };
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const subSlug = subcategory ? slug(subcategory) : 'all';
  const isSearch = options.mode === 'search';
  const batchProducts = batch.map((product, index) => {
    const isLastInBatch = index === batch.length - 1;
    const itemNumber = startIndex + index + 1;
    const buttons = [[{ text: '🛒 Order This', callback_data: `productflow:order:${product.id}` }]];
    if (isLastInBatch) {
      const navRow = [];
      if (safePage > 0) {
        navRow.push({ text: '⬅️ Prev Page', callback_data: `productflow:page:${slug(category)}:${subSlug}:${safePage - 1}` });
      }
      if (safePage < totalPages - 1) {
        navRow.push({ text: 'Next Page ➡️', callback_data: `productflow:page:${slug(category)}:${subSlug}:${safePage + 1}` });
      }
      if (navRow.length) buttons.push(navRow);
      buttons.push([{ text: '🛍️ Browse Categories', callback_data: 'productflow:explore' }]);
      buttons.push([{ text: '🏠 Main Menu', callback_data: 'productflow:main_menu' }]);
    }
    return {
      product,
      reply: productBrowseCaption(product, itemNumber, total),
      buttons
    };
  });

  conversation.stageState = {
    stage: 'product_display',
    category,
    subcategory,
    page: safePage,
    pageSize: PAGE_SIZE,
    total,
    totalPages,
    productIds: batch.map(product => product.id),
    productId: batch[0]?.id
  };

  return {
    reply: null,
    buttons: [],
    stage: 'product_display',
    batchProducts
  };
}

async function showSearchPage(client, conversation, products, page, query = '') {
  const total = products.length;
  const safePage = Math.max(0, parseInt(page, 10) || 0);
  const startIndex = safePage * PAGE_SIZE;
  const batch = products.slice(startIndex, startIndex + PAGE_SIZE);
  if (!batch.length) {
    return {
      handled: true,
      reply: t(client, 'SEARCH_NO_MORE', {}, 'I could not find more matching products. Try another search or browse the catalog.'),
      buttons: [
        [{ text: 'Search Again', callback_data: 'productflow:search' }],
        [{ text: 'Browse Products', callback_data: 'productflow:explore' }],
        [{ text: 'Main Menu', callback_data: 'productflow:main_menu' }]
      ],
      stage: 'product_search'
    };
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const batchProducts = batch.map((product, index) => {
    const isLastInBatch = index === batch.length - 1;
    const itemNumber = startIndex + index + 1;
    const buttons = [[{ text: 'Order This', callback_data: `productflow:order:${product.id}` }]];
    if (isLastInBatch) {
      const navRow = [];
      if (safePage > 0) navRow.push({ text: 'Prev Page', callback_data: `productflow:search_page:${safePage - 1}` });
      if (safePage < totalPages - 1) navRow.push({ text: 'Next Page', callback_data: `productflow:search_page:${safePage + 1}` });
      if (navRow.length) buttons.push(navRow);
      buttons.push([{ text: 'Search Again', callback_data: 'productflow:search' }]);
      buttons.push([{ text: 'Browse Categories', callback_data: 'productflow:explore' }]);
      buttons.push([{ text: 'Main Menu', callback_data: 'productflow:main_menu' }]);
    }
    return {
      product,
      reply: productBrowseCaption(product, itemNumber, total),
      buttons
    };
  });

  conversation.stage = 'product_search';
  conversation.conversationState = 'shopping_mode';
  conversation.stageState = {
    stage: 'product_search',
    searchQuery: query,
    page: safePage,
    pageSize: PAGE_SIZE,
    total,
    totalPages,
    productIds: batch.map(product => product.id),
    productId: batch[0]?.id
  };

  return {
    handled: true,
    reply: null,
    buttons: [],
    stage: 'product_search',
    batchProducts
  };
}

async function handleProductGallery(client, conversation, productId, ctx) {
  const product = activeProducts(client).find(p => p.id === productId);
  if (!product) {
    return {
      reply: t(client, 'PRODUCT_UNAVAILABLE', {}, 'Sorry, this product is no longer available.'),
      buttons: [[{ text: 'Browse Products', callback_data: 'productflow:explore' }]],
      stage: 'product_display'
    };
  }

  const galleryPaths = productGalleryPaths(product);
  const buttons = [
    [{ text: '🛒 Order This', callback_data: `productflow:order:${product.id}` }],
    [{ text: '🛍️ Browse Categories', callback_data: 'productflow:explore' }],
    [{ text: '🏠 Main Menu', callback_data: 'productflow:main_menu' }]
  ];

  conversation.stageState = {
    ...(conversation.stageState || {}),
    stage: 'product_display',
    productId: product.id
  };

  if (galleryPaths.length <= 1) {
    return {
      reply: t(client, 'PRODUCT_UNAVAILABLE', {}, 'This product has one photo available right now.'),
      buttons,
      stage: 'product_display'
    };
  }

  if (typeof ctx?.replyWithMediaGroup === 'function') {
    try {
      const media = galleryPaths.map((imgPath, index) => ({
        type: 'photo',
        media: imgPath.startsWith('http') ? imgPath : Input.fromLocalFile(imgPath),
        caption: index === 0
          ? `${product.name || product.code || 'Product'}\n${product.code ? `Code: ${product.code}\n` : ''}${productPrice(product) ? `Price: ${productPrice(product)} Birr` : ''}`.trim()
          : undefined
      }));
      await ctx.replyWithMediaGroup(media);
      return {
        reply: 'Here are the extra photos. Want to order this one?',
        buttons,
        stage: 'product_display'
      };
    } catch (error) {
      console.log(`[ProductFlow] Gallery send failed for "${product?.name}", falling back to text: ${error.message}`);
    }
  }

  return {
    reply: `I found ${galleryPaths.length} photos for **${product.name || product.code || 'this product'}**, but I could not open the album here. You can still order from the main product card.`,
    buttons,
    stage: 'product_display'
  };
}

async function handleOrder(data, client, conversation, productId) {
  const products = activeProducts(client);
  const product = products.find(p => p.id === productId);
  if (!product) {
    return {
      reply: t(client, 'PRODUCT_UNAVAILABLE', {}, 'Sorry, this product is no longer available.'),
      buttons: [[{ text: t(client, 'CATALOG_BACK_CATEGORIES', {}, 'Back to Categories'), callback_data: 'productflow:explore' }]],
      stage: 'category_browsing'
    };
  }

  const hasStockQuantity = product.stockQuantity !== undefined &&
    product.stockQuantity !== null &&
    String(product.stockQuantity).trim() !== '';
  const stock = productStock(product);
  if (hasStockQuantity && stock <= 0) {
    const similar = products
      .filter(p => {
        const candidateHasStock = p.stockQuantity !== undefined && p.stockQuantity !== null && String(p.stockQuantity).trim() !== '';
        return p.category === product.category && p.id !== product.id && (!candidateHasStock || productStock(p) > 0);
      })
      .slice(0, 3);
    let reply = `**${product.name || product.code}** is currently out of stock.\n\n`;
    if (similar.length) {
      reply += 'Similar products available:';
      const btns = similar.map(p => [{
        text: `${p.name || p.code}`,
        callback_data: `productflow:order:${p.id}`
      }]);
      btns.push([{ text: t(client, 'CATALOG_BACK_CATEGORIES', {}, 'Back to Categories'), callback_data: 'productflow:explore' }]);
      return { reply, buttons: btns, stage: 'product_display' };
    }
    return { reply, buttons: [[{ text: t(client, 'CATALOG_BACK_CATEGORIES', {}, 'Back to Categories'), callback_data: 'productflow:explore' }]], stage: 'product_display' };
  }

  recordProductIntent(data, client, conversation, product, 'order_started');

  const orderId = uid('order');
  const existingCustomer = conversation.customer || {};
  const savedCustomer = findCustomerProfile(data, client, conversation);
  const firstName = existingCustomer.firstName || existingCustomer.first_name || existingCustomer.name || '';

  conversation.stageState = {
    stage: 'order_collection',
    productId: product.id,
    orderId,
    productName: product.name || product.code,
    productPrice: productPrice(product),
    productCode: product.code || '',
    customerName: savedCustomer?.name || existingCustomer.name || '',
    phone: savedCustomer?.phone || existingCustomer.phone || '',
    address: savedCustomer?.address || '',
    contactChoicePending: Boolean(savedCustomer?.name && savedCustomer?.phone && savedCustomer?.address),
    savedCustomerId: savedCustomer?.id || '',
    quantity: '',
    size: '',
    color: '',
    option: '',
    collected: {}
  };

  if (conversation.stageState.contactChoicePending) {
    const saved = conversation.stageState;
    return {
      reply: `${orderStartPhrase(product, firstName, conversation.id)}\n\nProduct: ${product.name || product.code}\n${product.code ? `Code: ${product.code}\n` : ''}Price: ${productPrice(product)} Birr\n\nI found your saved delivery details:\nName: ${saved.customerName}\nPhone: ${saved.phone}\nAddress: ${saved.address}\n\nShould I use these details for this order?`,
      buttons: [
        [{ text: 'Use Saved Details', callback_data: `productflow:use_saved_contact:${orderId}` }],
        [{ text: 'Update Details', callback_data: `productflow:update_contact:${orderId}` }],
        [{ text: 'Cancel Order', callback_data: `productflow:cancel_order:${orderId}` }]
      ],
      stage: 'order_collection'
    };
  }

  const firstMissing = requiredOrderFields(conversation.stageState, product)[0];
  const price = productPrice(product);
  let reply = `${orderStartPhrase(product, firstName, conversation.id)}\n\n`;
  reply += `Product: ${product.name || product.code}\n`;
  if (product.code) reply += `Code: ${product.code}\n`;
  reply += `Price: ${price} Birr\n\n`;
  if (firstMissing) reply += orderFieldPrompt(firstMissing, product, firstName);

  return {
    reply,
    buttons: orderPromptButtons(firstMissing, product, orderId, conversation.stageState),
    replyKeyboard: firstMissing === 'contact' ? orderContactReplyKeyboard(client) : null,
    stage: 'order_collection'
  };
}

async function handleProductflowMessage(data, client, conversation, ctx, text) {
  if (conversation.stage !== 'order_collection') return { handled: false };

  const state = conversation.stageState || {};
  const productId = state.productId;
  const product = activeProducts(client).find(p => p.id === productId);
  const orderId = state.orderId;

  if (!product || !orderId) {
    conversation.stage = 'greeting';
    return {
      handled: true,
      reply: 'Something went wrong with your order. Please start again.',
      buttons: [[{ text: 'Explore Products', callback_data: 'productflow:explore' }]]
    };
  }

  if (/\b(cancel|stop|never mind|nevermind|forget|no thanks)\b/i.test(text)) {
    conversation.stage = 'greeting';
    conversation.stageState = {};
    return {
      handled: true,
      reply: t(client, 'ORDER_CANCELLED', {}, 'Order cancelled. How else can I help you?'),
      buttons: [
        [{ text: 'Explore Products', callback_data: 'productflow:explore' }],
        [{ text: 'Track Order', callback_data: 'productflow:track_order' }],
        [{ text: 'Talk to Support', callback_data: 'productflow:support' }]
      ]
    };
  }

  const needs = requiredOrderFields(state, product);
  if (needs.length === 0) return await showOrderConfirmation(data, client, conversation, state);

  const field = needs[0];
  let value = '';

  if (state.awaitingNameConfirmation) {
    const name = extractField(text, 'name') || String(text || '').replace(/\s+/g, ' ').trim();
    if (!name || name.length < 2) {
      return {
        handled: true,
        reply: t(client, 'ORDER_NAME_PROMPT', {}, 'Please send the correct full name we should use for delivery.'),
        buttons: orderPromptButtons('contact', product, orderId, state)
      };
    }
    state.customerName = name.slice(0, 60);
    delete state.awaitingNameConfirmation;
    state.awaitingAddressOnly = true;
    conversation.stageState = state;
    return {
      handled: true,
      reply: t(client, 'ORDER_ADDRESS_PROMPT', {}, 'Please send your clear delivery address. Include the area, building name, nearby landmark, shop name, or house/office details if possible.'),
      buttons: orderPromptButtons('contact', product, orderId, state),
      removeReplyKeyboard: true
    };
  }

  if (state.awaitingAddressOnly) {
    const address = extractField(text, 'address') || String(text || '').replace(/\s+/g, ' ').trim();
    if (!address || address.length < 4) {
      return {
        handled: true,
        reply: t(client, 'ORDER_ADDRESS_PROMPT', {}, 'Please send your clear delivery address. Include the area, building name, nearby landmark, shop name, or house/office details if possible.'),
        buttons: orderPromptButtons('contact', product, orderId, state)
      };
    }
    state.address = address.slice(0, 200);
    delete state.awaitingAddressOnly;
    if (applyDeliveryClarificationIfNeeded(client, state)) {
      conversation.stageState = state;
      return {
        handled: true,
        reply: deliveryClarificationText(state),
        buttons: deliveryClarificationButtons(state)
      };
    }
    conversation.stageState = state;
    const remainingAfterAddress = requiredOrderFields(state, product);
    if (remainingAfterAddress.length === 0) return await showOrderConfirmation(data, client, conversation, state);
    const nextAfterAddress = remainingAfterAddress[0];
    return {
      handled: true,
      reply: t(client, 'ORDER_GOT_IT', { nextPrompt: orderFieldPrompt(nextAfterAddress, product, state.customerName) }, `Got it. ${orderFieldPrompt(nextAfterAddress, product, state.customerName)}`),
      buttons: orderPromptButtons(nextAfterAddress, product, orderId, state)
    };
  }

  if (field === 'contact') {
    if (contactManualRequested(text)) {
      state.manualContactMode = true;
      conversation.stageState = state;
      return {
        handled: true,
        reply: `${t(client, 'ORDER_CONTACT_MANUAL_PROMPT', {}, 'Please send your full name, phone number, and clear delivery address in one message.')}\n\n${t(client, 'ORDER_ADDRESS_HELP')}`,
        buttons: orderPromptButtons('contact', product, orderId, state),
        removeReplyKeyboard: true
      };
    }
    const details = parseContactDetails(text);
    if (details.customerName) state.customerName = details.customerName;
    if (details.phone) state.phone = details.phone;
    if (details.address) state.address = details.address;
    const stillMissing = [];
    if (!state.customerName) stillMissing.push('full name');
    if (!state.address) stillMissing.push('specific delivery address');
    if (!state.phone) stillMissing.push('phone number');
    if (stillMissing.length) {
      conversation.stageState = state;
      return {
        handled: true,
        reply: t(client, 'ORDER_STILL_NEED', { missing: stillMissing.join(', ') }, `Thanks. I still need your ${stillMissing.join(', ')}. Please send them together so I can prepare the order correctly.`),
        buttons: orderPromptButtons('contact', product, orderId, state),
        replyKeyboard: state.manualContactMode || state.phone ? null : orderContactReplyKeyboard(client),
        removeReplyKeyboard: Boolean(state.manualContactMode || state.phone)
      };
    }
    if (applyDeliveryClarificationIfNeeded(client, state)) {
      conversation.stageState = state;
      return {
        handled: true,
        reply: deliveryClarificationText(state),
        buttons: deliveryClarificationButtons(state),
        removeReplyKeyboard: true
      };
    }
  } else if (field === 'delivery_area') {
    const moreDetail = extractField(text, 'address');
    if (moreDetail) state.address = [state.address, moreDetail].filter(Boolean).join(', ');
    if (applyDeliveryClarificationIfNeeded(client, state)) {
      conversation.stageState = state;
      return {
        handled: true,
        reply: deliveryClarificationText(state),
        buttons: deliveryClarificationButtons(state)
      };
    }
  } else if (field === 'quantity') {
    const qty = parseInt(String(text || '').match(/\d+/)?.[0] || '', 10);
    if (Number.isFinite(qty) && qty > 0 && qty <= 99) value = String(qty);
    if (!value) {
      return {
        handled: true,
        reply: t(client, 'ORDER_QUANTITY_INVALID', {}, 'Please send the quantity as a number, like 1, 2, or 3.'),
        buttons: orderPromptButtons('quantity', product, orderId, state)
      };
    }
    state.quantity = value;
  } else {
    value = extractField(text, field);
    if (!value) {
      return {
        handled: true,
        reply: orderFieldPrompt(field, product, state.customerName),
        buttons: orderPromptButtons(field, product, orderId, state)
      };
    }
    if (field === 'size') state.size = value;
    if (field === 'color') state.color = value;
    if (field === 'option') state.option = value;
  }

  conversation.stageState = state;
  const remaining = requiredOrderFields(state, product);
  if (remaining.length === 0) return await showOrderConfirmation(data, client, conversation, state);

  const nextField = remaining[0];
  if (nextField === 'delivery_area') {
    return {
      handled: true,
      reply: deliveryClarificationText(state),
      buttons: deliveryClarificationButtons(state)
    };
  }
  return {
    handled: true,
    reply: `Got it. ${orderFieldPrompt(nextField, product, state.customerName)}`,
    buttons: orderPromptButtons(nextField, product, orderId, state),
    replyKeyboard: nextField === 'contact' ? orderContactReplyKeyboard(client) : null,
    removeReplyKeyboard: nextField !== 'contact'
  };
}

async function handleSpecChoice(data, client, conversation, param) {
  const state = conversation.stageState || {};
  const product = activeProducts(client).find(p => p.id === state.productId);
  if (conversation.stage !== 'order_collection' || !product) {
    return {
      reply: 'Please start the order again.',
      buttons: [[{ text: 'Explore Products', callback_data: 'productflow:explore' }]],
      stage: 'greeting'
    };
  }

  const [field, rawValue] = String(param || '').split(':');
  if (field === 'quantity') {
    const qty = parseInt(rawValue, 10);
    if (Number.isFinite(qty) && qty > 0 && qty <= 99) state.quantity = String(qty);
  } else if (['size', 'color', 'option'].includes(field)) {
    const values = productSpecValues(product, field);
    const selected = values[parseInt(rawValue, 10)];
    if (selected) state[field] = selected;
  }

  conversation.stageState = state;
  const remaining = requiredOrderFields(state, product);
  if (!remaining.length) return await showOrderConfirmation(data, client, conversation, state);

  const nextField = remaining[0];
  if (nextField === 'delivery_area') {
    return {
      reply: deliveryClarificationText(state),
      buttons: deliveryClarificationButtons(state),
      stage: 'order_collection'
    };
  }
  return {
    reply: `Got it. ${orderFieldPrompt(nextField, product, state.customerName)}`,
    buttons: orderPromptButtons(nextField, product, state.orderId, state),
    replyKeyboard: nextField === 'contact' ? orderContactReplyKeyboard(client) : null,
    stage: 'order_collection'
  };
}

async function handleSavedContactChoice(client, conversation, useSaved) {
  const state = conversation.stageState || {};
  const product = activeProducts(client).find(p => p.id === state.productId);
  if (conversation.stage !== 'order_collection' || !product || !state.orderId) {
    return {
      reply: 'Please start the order again.',
      buttons: [[{ text: 'Explore Products', callback_data: 'productflow:explore' }]],
      stage: 'greeting'
    };
  }
  state.contactChoicePending = false;
  if (!useSaved) {
    state.customerName = '';
    state.phone = '';
    state.address = '';
    delete state.deliveryAreaHint;
    delete state.awaitingDeliveryClarification;
    delete state.deliveryCandidates;
  } else if (applyDeliveryClarificationIfNeeded(client, state)) {
    conversation.stageState = state;
    return {
      reply: deliveryClarificationText(state),
      buttons: deliveryClarificationButtons(state),
      stage: 'order_collection'
    };
  }
  conversation.stageState = state;
  const nextField = requiredOrderFields(state, product)[0];
  return {
    reply: useSaved
      ? `Perfect. ${orderFieldPrompt(nextField, product, state.customerName)}`
      : orderFieldPrompt('contact', product, state.customerName),
    buttons: orderPromptButtons(useSaved ? nextField : 'contact', product, state.orderId, state),
    replyKeyboard: !useSaved ? orderContactReplyKeyboard(client) : null,
    stage: 'order_collection'
  };
}

async function handleDeliveryAreaChoice(data, client, conversation, param) {
  const state = conversation.stageState || {};
  const product = activeProducts(client).find(p => p.id === state.productId);
  if (conversation.stage !== 'order_collection' || !product || !state.orderId) {
    return {
      reply: 'Please start the order again.',
      buttons: [[{ text: 'Explore Products', callback_data: 'productflow:explore' }]],
      stage: 'greeting'
    };
  }

  if (param === 'more') {
    return {
      reply: 'Please send a more specific delivery address. Include the area, building name, nearby landmark, shop name, or house number if possible.',
      buttons: [
        [{ text: 'Cancel Order', callback_data: `productflow:cancel_order:${state.orderId}` }],
        [{ text: 'Main Menu', callback_data: 'productflow:main_menu' }]
      ],
      stage: 'order_collection'
    };
  }

  const selected = (state.deliveryCandidates || [])[parseInt(param, 10)];
  if (!selected) {
    return {
      reply: deliveryClarificationText(state),
      buttons: deliveryClarificationButtons(state),
      stage: 'order_collection'
    };
  }

  state.deliveryAreaHint = selected.area || selected.name || '';
  state.address = state.address && !normalizeDeliveryArea(state.address).includes(normalizeDeliveryArea(state.deliveryAreaHint))
    ? `${state.deliveryAreaHint}, ${state.address}`
    : (state.address || state.deliveryAreaHint);
  delete state.awaitingDeliveryClarification;
  delete state.deliveryCandidates;
  conversation.stageState = state;

  const remaining = requiredOrderFields(state, product);
  if (!remaining.length) return await showOrderConfirmation(data, client, conversation, state);
  const nextField = remaining[0];
  return {
    reply: `Perfect. ${orderFieldPrompt(nextField, product, state.customerName)}`,
    buttons: orderPromptButtons(nextField, product, state.orderId, state),
    stage: 'order_collection'
  };
}

async function handleOrderBack(client, conversation, orderId) {
  const state = conversation.stageState || {};
  const product = activeProducts(client).find(p => p.id === state.productId);
  if (conversation.stage !== 'order_collection' || !product || !state.orderId || state.orderId !== orderId) {
    return {
      reply: t(client, 'ORDER_NOT_FOUND', {}, 'Order not found. Please start again.'),
      buttons: [[{ text: 'Explore Products', callback_data: 'productflow:explore' }]],
      stage: 'greeting'
    };
  }
  const previous = previousOrderField(state, product);
  if (!previous) {
    return {
      reply: orderFieldPrompt(requiredOrderFields(state, product)[0] || 'contact', product, state.customerName),
      buttons: orderPromptButtons(requiredOrderFields(state, product)[0] || 'contact', product, state.orderId, state),
      replyKeyboard: requiredOrderFields(state, product)[0] === 'contact' ? orderContactReplyKeyboard(client) : null,
      stage: 'order_collection'
    };
  }
  clearOrderField(state, previous);
  conversation.stage = 'order_collection';
  conversation.stageState = state;
  return {
    reply: orderFieldPrompt(previous, product, state.customerName),
    buttons: orderPromptButtons(previous, product, state.orderId, state),
    replyKeyboard: previous === 'contact' ? orderContactReplyKeyboard(client) : null,
    removeReplyKeyboard: previous !== 'contact',
    stage: 'order_collection'
  };
}

async function handlePromoCodePrompt(client, conversation, orderId) {
  const state = conversation.stageState || {};
  if (!state.order || state.order.id !== orderId) {
    return { reply: t(client, 'ORDER_NOT_FOUND', {}, 'Order not found. Please start a new order.'), buttons: [[{ text: 'Explore Products', callback_data: 'productflow:explore' }]], stage: 'greeting' };
  }
  conversation.stage = 'promo_code';
  conversation.stageState = { ...state, stage: 'promo_code' };
  return {
    reply: t(client, 'PROMO_PROMPT', {}, 'Please send your promo code. Send "skip" if you do not have one.'),
    buttons: [[{ text: 'Skip Promo Code', callback_data: `productflow:skip_promo:${orderId}` }]],
    stage: 'promo_code'
  };
}

async function showOrderConfirmation(data, client, conversation, state) {
  const product = activeProducts(client).find(p => p.id === state.productId);
  const unitPrice = Number(state.productPrice || productPrice(product || {}));
  const quantity = Math.max(1, parseInt(state.quantity, 10) || 1);
  const subtotal = unitPrice * quantity;
  const deliveryQuote = deliveryQuoteForOrder(client, state.address, subtotal, state.deliveryAreaHint);
  const deliveryFee = deliveryQuote.fee;
  const discount = calculateDiscount(data, client, conversation, product, subtotal, state);
  const discountedSubtotal = Math.max(0, subtotal - Number(discount.amount || 0));
  const total = discountedSubtotal + deliveryFee;

  const order = {
    id: state.orderId,
    clientId: client.id,
    conversationId: conversation.id,
    status: 'draft',
    paymentStatus: 'unpaid',
    deliveryStatus: deliveryQuote.status,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    productId: state.productId,
    productCode: state.productCode,
    productName: state.productName,
    quantity,
    selectedSize: state.size || '',
    selectedColor: state.color || '',
    selectedOption: state.option || '',
    unitPrice: String(unitPrice),
    mainSubtotal: String(subtotal),
    addOns: Array.isArray(state.order?.addOns) ? state.order.addOns : [],
    addOnSubtotal: String(orderAddOnTotal(state.order || {})),
    subtotal: String(subtotal),
    discountedSubtotal: String(discountedSubtotal),
    discountAmount: String(discount.amount || 0),
    discountReason: discount.reason || '',
    discountLabel: discount.label || '',
    discountRate: discount.rate || 0,
    discountCode: discount.code || state.promoCode || '',
    birthdayDiscountYear: discount.birthYear || '',
    total: String(total),
    deliveryFee: String(deliveryFee),
    delivery_fee_source: deliveryQuote.source,
    deliveryArea: deliveryQuote.area || '',
    deliveryMaxHours: deliveryQuote.maxHours || '',
    deliveryEtaHours: deliveryQuote.maxHours || '',
    customerName: state.customerName || '',
    phone: state.phone || '',
    deliveryLocation: state.address || '',
    deliveryNote: deliveryQuote.note,
    awaitingDeliveryFee: !deliveryQuote.inAddis,
    customerConfirmedOrder: false,
  };

  conversation.stageState = { ...state, quantity: String(quantity), order };
  conversation.stage = 'order_confirmation';

  let reply = `${t(client, 'CONFIRM_TITLE')}\n\n`;
  reply += `${t(client, 'CONFIRM_PRODUCT', { productName: order.productName })}\n`;
  if (order.productCode) reply += `${t(client, 'PRODUCT_CODE', { productCode: order.productCode })}\n`;
  reply += `${t(client, 'CONFIRM_UNIT_PRICE', { unitPrice })}\n`;
  reply += `${t(client, 'CONFIRM_QUANTITY', { quantity })}\n`;
  if (order.selectedSize) reply += `${t(client, 'CONFIRM_SIZE', { size: order.selectedSize })}\n`;
  if (order.selectedColor) reply += `${t(client, 'CONFIRM_COLOR', { color: order.selectedColor })}\n`;
  if (order.selectedOption) reply += `${t(client, 'CONFIRM_OPTION', { option: order.selectedOption })}\n`;
  reply += `\n${t(client, 'CONFIRM_CUSTOMER')}\n`;
  reply += `${t(client, 'CONFIRM_NAME', { customerName: order.customerName })}\n`;
  reply += `${t(client, 'CONFIRM_PHONE', { phone: order.phone })}\n`;
  reply += `${t(client, 'CONFIRM_ADDRESS', { address: order.deliveryLocation })}\n\n`;
  reply += `${t(client, 'CONFIRM_SUBTOTAL', { subtotal })}\n`;
  if (discount.amount) reply += `${t(client, 'CONFIRM_DISCOUNT', { discountLabel: discount.label, discountAmount: discount.amount })}\n`;
  reply += `${t(client, 'CONFIRM_DELIVERY', { deliveryFee })}\n`;
  if (order.deliveryArea) reply += `${t(client, 'CONFIRM_AREA', { deliveryArea: order.deliveryArea })}\n`;
  if (order.deliveryMaxHours) reply += `${t(client, 'CONFIRM_MAX_TIME', { hours: order.deliveryMaxHours })}\n`;
  reply += `${t(client, 'CONFIRM_TOTAL', { total })}\n\n`;
  if (!deliveryQuote.inAddis) reply += `${t(client, 'CONFIRM_OUTSIDE_ADDIS')}\n\n`;
  reply += t(client, 'CONFIRM_QUESTION');

  const buttons = [
    [{ text: '✅ Confirm Order', callback_data: `productflow:confirm_order:${state.orderId}` }]
  ];
  if (canOfferPromoCode(client, product)) {
    buttons.push([{ text: '🏷️ Add Promo Code', callback_data: `productflow:promo_code:${state.orderId}` }]);
  }
  buttons.push(
    [{ text: 'Edit Information', callback_data: `productflow:edit_order:${state.orderId}` }],
    [{ text: 'Cancel Order', callback_data: `productflow:cancel_order:${state.orderId}` }]
  );

  return {
    handled: true,
    reply,
    buttons,
    stage: 'order_confirmation',
    product
  };
}

const persistOrder = (data, order) => {
  data.orders ||= [];
  const existing = data.orders.find(item => item.id === order.id);
  if (existing) Object.assign(existing, order);
  else data.orders.push(order);
  return order;
};

const normalizeContactPhone = value => String(value || '')
  .replace(/[^\d+]/g, '')
  .replace(/^\+?251/, '0')
  .slice(0, 16);

const contactManualRequested = text => /type\s*manually|manual|write|በመጻፍ|ጻፍ|አስገባ/i.test(String(text || ''));

async function continueToPayment(client, conversation, order) {
  conversation.stage = 'completed';
  conversation.lastOrderId = order.id;

  if (order.awaitingDeliveryFee || order.deliveryStatus === 'delivery_review_needed') {
    conversation.stageState = {};
    return {
      reply: `${t(client, 'PAYMENT_ORDER_CONFIRMED', { trackingCode: publicOrderCode(order) })}\n\n${t(client, 'CONFIRM_OUTSIDE_ADDIS')}`,
      buttons: [
        [{ text: 'Track Order', callback_data: 'productflow:track_order' }],
        [{ text: 'Main Menu', callback_data: 'productflow:main_menu' }]
      ],
      stage: 'completed'
    };
  }

  if (!validPaymentOptions(client).length) {
    conversation.stageState = {};
    return {
      reply: `${t(client, 'PAYMENT_ORDER_CONFIRMED', { trackingCode: publicOrderCode(order) })}\n\n${t(client, 'PAYMENT_NO_ACCOUNTS')}`,
      buttons: [
        [{ text: 'Track Order', callback_data: 'productflow:track_order' }],
        [{ text: 'Main Menu', callback_data: 'productflow:main_menu' }]
      ],
      stage: 'completed'
    };
  }

  conversation.stage = 'awaiting_payment_proof';
  conversation.stageState = { stage: 'awaiting_payment_proof', orderId: order.id };

  return {
    reply: `${t(client, 'PAYMENT_ORDER_CONFIRMED', { trackingCode: publicOrderCode(order) })}\n\n${paymentInstructionsText(client, order)}`,
    buttons: [
      ...paymentCopyButtons(client),
      [{ text: 'Submit Payment Proof', callback_data: 'productflow:payment_proof' }],
      [{ text: 'Track Order', callback_data: 'productflow:track_order' }],
      [{ text: 'Main Menu', callback_data: 'productflow:main_menu' }]
    ],
    stage: 'awaiting_payment_proof'
  };
}

async function handleConfirmOrder(data, client, conversation, orderId) {
  const state = conversation.stageState || {};
  const order = state.order;

  if (!order || order.id !== orderId) {
    return {
      reply: t(client, 'ORDER_NOT_FOUND', {}, 'Order not found. Please start a new order.'),
      buttons: [[{ text: 'Explore Products', callback_data: 'productflow:explore' }]],
      stage: 'greeting'
    };
  }

  order.status = 'confirmed';
  order.paymentStatus = order.awaitingDeliveryFee ? 'not_requested' : 'awaiting_screenshot';
  order.customerConfirmedOrder = true;
  order.confirmedAt = new Date().toISOString();
  order.updatedAt = new Date().toISOString();
  order.telegramChatId = conversation.telegramChatId || conversation.chatId || '';
  order.telegramUserId = conversation.telegramUserId || '';
  order.username = conversation.customer?.username || '';
  const customerProfile = upsertCustomerProfile(data, client, conversation, order);
  order.customerId = customerProfile.id || '';
  if (conversation.recommendationId) {
    const recommendation = recommendationRecord(data, client, conversation.recommendationId);
    if (recommendation) {
      recommendation.status = 'ordered';
      recommendation.orderId = order.id;
      recommendation.orderedAt = new Date().toISOString();
      recommendation.updatedAt = recommendation.orderedAt;
      customerProfile.recommendationProfile ||= {};
      customerProfile.recommendationProfile.acceptedCount = Number(customerProfile.recommendationProfile.acceptedCount || 0) + 1;
    }
    conversation.recommendationId = '';
  }
  if (conversation.intentId) {
    const intent = intentRecord(data, client, conversation.intentId);
    if (intent) {
      intent.status = 'ordered';
      intent.orderId = order.id;
      intent.orderedAt = new Date().toISOString();
      intent.updatedAt = intent.orderedAt;
    }
    conversation.intentId = '';
  }
  if (conversation.campaignId) {
    const campaign = (data.announcementCampaigns || []).find(item => item.id === conversation.campaignId && item.clientId === client.id);
    const recipient = (data.campaignRecipients || []).find(item =>
      item.campaignId === conversation.campaignId &&
      item.clientId === client.id &&
      item.telegramChatId === (conversation.telegramChatId || '')
    );
    if (campaign) {
      campaign.orderCount = Number(campaign.orderCount || 0) + 1;
      campaign.updatedAt = new Date().toISOString();
    }
    if (recipient) {
      recipient.status = 'ordered';
      recipient.orderId = order.id;
      recipient.orderedAt = new Date().toISOString();
      recipient.updatedAt = recipient.orderedAt;
    }
    order.campaignId = conversation.campaignId;
    conversation.campaignId = '';
  }
  closeProductIntent(data, client, conversation, order.productId, 'completed', order.id);

  recalculateOrderTotal(order);
  persistOrder(data, order);

  try {
    const ownerLines = [
      'New Telegram order confirmed',
      `Order: ${order.id}`,
      `Product: ${order.productName}${order.productCode ? ` (${order.productCode})` : ''}`,
      `Quantity: ${order.quantity}`,
      `Customer: ${order.customerName}`,
      `Phone: ${order.phone}`,
      order.selectedSize ? `Size/option: ${order.selectedSize}` : '',
      order.selectedColor ? `Color: ${order.selectedColor}` : '',
      order.selectedOption ? `Option: ${order.selectedOption}` : '',
      `Address: ${order.deliveryLocation}`,
      order.awaitingDeliveryFee ? 'Action: confirm/set delivery fee before customer payment.' : '',
      order.deliveryArea ? `Delivery area: ${order.deliveryArea}` : '',
      order.deliveryMaxHours ? `Max delivery time: ${order.deliveryMaxHours} hours` : '',
      `Total: ${order.total} Birr`
    ].filter(Boolean);
    await deps.sendClientNotification?.(
      data,
      client,
      `new-order-${order.id}`,
      ownerLines.join('\n'),
      'draftOrders',
      0
    );
  } catch (e) {
    console.error('Owner notification failed:', e.message);
  }

  conversation.lastOrderId = order.id;

  if (order.awaitingDeliveryFee || order.deliveryStatus === 'delivery_review_needed') {
    return continueToPayment(client, conversation, order);
  }

  if (!validPaymentOptions(client).length) {
    return continueToPayment(client, conversation, order);
  }

  const mainProduct = activeProducts(client).find(item => item.id === order.productId || (order.productCode && item.code === order.productCode));
  const match = deps.findCheckoutMatch?.({ data, client, order, mainProduct });
  if (match?.trigger && match.product && order.matchOfferStatus !== 'accepted' && order.matchOfferStatus !== 'skipped') {
    order.matchOfferStatus = 'offered';
    order.matchOffer = {
      productId: match.product.id || '',
      productCode: match.product.code || match.product.productCode || '',
      productName: match.product.name || match.product.code || '',
      price: String(match.price || productPrice(match.product)),
      offeredAt: new Date().toISOString(),
      reason: match.reason || ''
    };
    persistOrder(data, order);
    conversation.stage = 'checkout_match';
    conversation.stageState = {
      stage: 'checkout_match',
      orderId: order.id,
      order,
      matchProductId: match.product.id,
      match,
      matchSelection: {}
    };
    return checkoutMatchPrompt(order, match, {});
  }

  return continueToPayment(client, conversation, order);
}

async function handleMatchSpecChoice(client, conversation, field, rawIndex) {
  const state = conversation.stageState || {};
  if (state.stage !== 'checkout_match' || !state.matchProductId || !state.match) {
    return { reply: 'That match offer expired. Please continue to payment.', buttons: [[{ text: 'Continue to Payment', callback_data: `productflow:match_skip:${state.orderId || ''}` }]], stage: 'checkout_match' };
  }
  const product = activeProducts(client).find(item => item.id === state.matchProductId) || state.match.product;
  const values = productSpecValues(product, field);
  const value = values[parseInt(rawIndex, 10)];
  if (!value) {
    return checkoutMatchPrompt(state.order, state.match, state.matchSelection || {});
  }
  const selected = { ...(state.matchSelection || {}), [field]: value };
  conversation.stageState = { ...state, matchSelection: selected };
  return checkoutMatchPrompt(state.order, state.match, selected);
}

async function handleMatchAdd(data, client, conversation, orderId) {
  const state = conversation.stageState || {};
  const order = state.order || (data.orders || []).find(item => item.id === orderId);
  const product = activeProducts(client).find(item => item.id === state.matchProductId) || state.match?.product;
  if (!order || order.id !== orderId || !product) {
    return { reply: t(client, 'MATCH_EXPIRED', {}, 'That match offer expired. Please continue with your order.'), buttons: [[{ text: 'Track Order', callback_data: 'productflow:track_order' }]], stage: 'completed' };
  }

  const selected = state.matchSelection || {};
  const missing = checkoutMatchFields(product).filter(field => !selected[field]);
  if (missing.length) {
    return {
      ...checkoutMatchPrompt(order, state.match, selected),
      reply: `Please choose ${missing.join(', ')} before including this item.\n\n${checkoutMatchPrompt(order, state.match, selected).reply}`
    };
  }

  const unitPrice = String(state.match?.price || productPrice(product));
  order.addOns = Array.isArray(order.addOns) ? order.addOns : [];
  if (!order.addOns.some(item => item.productId === product.id)) {
    order.addOns.push({
      productId: product.id || '',
      productCode: product.code || product.productCode || '',
      productName: product.name || product.code || 'Matched product',
      unitPrice,
      quantity: 1,
      selectedSize: selected.size || '',
      selectedColor: selected.color || '',
      selectedOption: selected.option || '',
      addedAt: new Date().toISOString()
    });
  }
  order.matchOfferStatus = 'accepted';
  order.updatedAt = new Date().toISOString();
  recalculateOrderTotal(order);
  persistOrder(data, order);
  try {
    await deps.sendClientNotification?.(
      data,
      client,
      `match-added-${order.id}`,
      [
        'Matched product added to an order',
        `Order: ${order.id}`,
        `Customer: ${order.customerName || order.phone || 'Customer'}`,
        `Main product: ${order.productName}${order.productCode ? ` (${order.productCode})` : ''}`,
        `Added: ${product.name || product.code}${product.code ? ` (${product.code})` : ''}`,
        `New total: ${order.total} Birr`
      ].filter(Boolean).join('\n'),
      'orders',
      0
    );
  } catch (e) {
    console.error('Matched add-on owner notification failed:', e.message);
  }
  return continueToPayment(client, conversation, order);
}

async function handleMatchSkip(data, client, conversation, orderId) {
  const state = conversation.stageState || {};
  const order = state.order || (data.orders || []).find(item => item.id === orderId);
  if (!order) {
    return {
      reply: t(client, 'ORDER_NOT_FOUND', {}, 'Order not found. Please track your order or start again.'),
      buttons: [[{ text: 'Main Menu', callback_data: 'productflow:main_menu' }]],
      stage: 'completed'
    };
  }
  order.matchOfferStatus = 'skipped';
  order.updatedAt = new Date().toISOString();
  persistOrder(data, order);
  return continueToPayment(client, conversation, order);
}

const recommendationRecord = (data, client, recommendationId) => (data.productRecommendations || [])
  .find(item => item.id === recommendationId && item.clientId === client.id);

const recommendationCustomer = (data, record) => (data.customers || [])
  .find(item => item.id === record?.customerId && item.clientId === record?.clientId);

async function handleRecommendationView(data, client, conversation, recommendationId) {
  const record = recommendationRecord(data, client, recommendationId);
  if (!record) {
    return { reply: t(client, 'SUGGESTION_UNAVAILABLE', {}, 'That suggestion is no longer available.'), buttons: [[{ text: 'Browse Products', callback_data: 'productflow:explore' }]], stage: 'greeting' };
  }
  const product = activeProducts(client).find(item => item.id === record.productId || (record.productCode && item.code === record.productCode));
  if (!product) {
    record.status = 'expired';
    record.updatedAt = new Date().toISOString();
    return { reply: t(client, 'PRODUCT_NOT_AVAILABLE', {}, 'That suggested product is not available right now.'), buttons: [[{ text: 'Browse Products', callback_data: 'productflow:explore' }]], stage: 'greeting' };
  }
  record.status = record.status === 'order_started' ? record.status : 'viewed';
  record.viewedAt ||= new Date().toISOString();
  record.updatedAt = record.viewedAt;
  conversation.stage = 'product_display';
  conversation.stageState = {
    ...(conversation.stageState || {}),
    stage: 'product_display',
    productId: product.id,
    recommendationId: record.id
  };
  return {
    reply: productBrowseCaption(product, 1, 1),
    buttons: [
      [{ text: 'Order This', callback_data: `productflow:recommend_order:${record.id}` }],
      [{ text: 'Not Now', callback_data: `productflow:recommend_later:${record.id}` }],
      [{ text: 'Browse Products', callback_data: 'productflow:explore' }],
      [{ text: 'Main Menu', callback_data: 'productflow:main_menu' }]
    ],
    product,
    stage: 'product_display'
  };
}

async function handleRecommendationOrder(data, client, conversation, recommendationId) {
  const record = recommendationRecord(data, client, recommendationId);
  if (!record) {
    return { reply: t(client, 'SUGGESTION_UNAVAILABLE', {}, 'That suggestion is no longer available.'), buttons: [[{ text: 'Browse Products', callback_data: 'productflow:explore' }]], stage: 'greeting' };
  }
  const product = activeProducts(client).find(item => item.id === record.productId || (record.productCode && item.code === record.productCode));
  if (!product) {
    record.status = 'expired';
    record.updatedAt = new Date().toISOString();
    return { reply: t(client, 'PRODUCT_NOT_AVAILABLE', {}, 'That suggested product is not available right now.'), buttons: [[{ text: 'Browse Products', callback_data: 'productflow:explore' }]], stage: 'greeting' };
  }
  record.status = 'order_started';
  record.orderStartedAt = new Date().toISOString();
  record.updatedAt = record.orderStartedAt;
  conversation.recommendationId = record.id;
  return handleOrder(data, client, conversation, product.id);
}

async function handleRecommendationLater(data, client, conversation, recommendationId) {
  const record = recommendationRecord(data, client, recommendationId);
  if (record) {
    record.status = 'dismissed';
    record.dismissedAt = new Date().toISOString();
    record.updatedAt = record.dismissedAt;
    const customer = recommendationCustomer(data, record);
    if (customer) {
      customer.recommendationProfile ||= {};
      customer.recommendationProfile.ignoredCount = Number(customer.recommendationProfile.ignoredCount || 0) + 1;
      customer.recommendationProfile.lastIgnoredAt = record.dismissedAt;
      customer.updatedAt = record.dismissedAt;
    }
  }
  conversation.stage = 'greeting';
  conversation.stageState = {};
  return {
    reply: t(client, 'REC_NOT_NOW_ACK', {}, 'No problem. I will keep suggestions quiet for now.'),
    buttons: [[{ text: 'Main Menu', callback_data: 'productflow:main_menu' }]],
    stage: 'greeting'
  };
}

async function handleRecommendationStop(data, client, conversation, recommendationId) {
  const record = recommendationRecord(data, client, recommendationId);
  const customer = recommendationCustomer(data, record) || findCustomerProfile(data, client, conversation);
  if (record) {
    record.status = 'stopped';
    record.stoppedAt = new Date().toISOString();
    record.updatedAt = record.stoppedAt;
  }
  if (customer) {
    customer.recommendationsOptOut = true;
    customer.recommendationOptOutAt = new Date().toISOString();
    customer.updatedAt = customer.recommendationOptOutAt;
  }
  conversation.stage = 'greeting';
  conversation.stageState = {};
  return {
    reply: t(client, 'STOP_SUGGESTIONS_DONE', {}, 'Done. I will stop sending product suggestions. You can still browse or search any time.'),
    buttons: [[{ text: 'Main Menu', callback_data: 'productflow:main_menu' }]],
    stage: 'greeting'
  };
}

const intentRecord = (data, client, intentId) => (data.productIntents || [])
  .find(item => item.id === intentId && item.clientId === client.id);

const cheaperSimilarProduct = (client, product) => {
  if (!product) return null;
  const basePrice = moneyNumber(productPrice(product));
  const sourceCategory = normalizeKey([product.category, product.subcategory, product.selectedCategory, product.selectedSubcategory].filter(Boolean).join(' '));
  const sourceTerms = normalizeKey([product.name, product.category, product.subcategory, product.colors, product.sizes].filter(Boolean).join(' ')).split(/\s+/).filter(term => term.length >= 4);
  return activeProducts(client)
    .filter(item => item.id !== product.id)
    .map(item => {
      const price = moneyNumber(productPrice(item));
      if (!price || !basePrice || price > basePrice * 0.9) return null;
      const category = normalizeKey([item.category, item.subcategory, item.selectedCategory, item.selectedSubcategory].filter(Boolean).join(' '));
      const text = normalizeKey([item.name, item.category, item.subcategory, item.colors, item.sizes].filter(Boolean).join(' '));
      let score = sourceCategory && category === sourceCategory ? 60 : 0;
      sourceTerms.slice(0, 8).forEach(term => { if (text.includes(term)) score += 6; });
      return score >= 40 ? { product: item, score, price } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.price - b.price)[0]?.product || null;
};

async function handleIntentView(data, client, conversation, intentId, useSimilar = false) {
  const intent = intentRecord(data, client, intentId);
  if (!intent) return { reply: t(client, 'SUGGESTION_UNAVAILABLE', {}, 'That reminder is no longer available.'), buttons: [[{ text: 'Browse Products', callback_data: 'productflow:explore' }]], stage: 'greeting' };
  const original = activeProducts(client).find(item => item.id === intent.productId || (intent.productCode && item.code === intent.productCode));
  const product = useSimilar
    ? activeProducts(client).find(item => item.id === intent.alternativeProductId) || cheaperSimilarProduct(client, original)
    : original;
  if (!product) {
    intent.status = 'expired';
    intent.updatedAt = new Date().toISOString();
    return { reply: t(client, 'PRODUCT_NOT_AVAILABLE', {}, 'That product is not available right now.'), buttons: [[{ text: 'Browse Products', callback_data: 'productflow:explore' }]], stage: 'greeting' };
  }
  intent.status = 'viewed_after_reminder';
  intent.viewedAfterReminderAt = new Date().toISOString();
  intent.updatedAt = intent.viewedAfterReminderAt;
  conversation.stage = 'product_display';
  conversation.stageState = {
    ...(conversation.stageState || {}),
    stage: 'product_display',
    productId: product.id,
    intentId: intent.id
  };
  return {
    reply: productBrowseCaption(product, 1, 1),
    buttons: [
      [{ text: 'Order This', callback_data: `productflow:intent_continue:${intent.id}:${product.id}` }],
      [{ text: 'Browse Products', callback_data: 'productflow:explore' }],
      [{ text: 'Main Menu', callback_data: 'productflow:main_menu' }]
    ],
    product,
    stage: 'product_display'
  };
}

async function handleIntentContinue(data, client, conversation, param) {
  const [intentId, productIdFromButton] = String(param || '').split(':');
  const intent = intentRecord(data, client, intentId);
  if (!intent) return { reply: t(client, 'SUGGESTION_UNAVAILABLE', {}, 'That reminder is no longer available.'), buttons: [[{ text: 'Browse Products', callback_data: 'productflow:explore' }]], stage: 'greeting' };
  const productId = productIdFromButton || intent.productId;
  const product = activeProducts(client).find(item => item.id === productId) || activeProducts(client).find(item => item.id === intent.productId);
  if (!product) return { reply: t(client, 'PRODUCT_NOT_AVAILABLE', {}, 'That product is not available right now.'), buttons: [[{ text: 'Browse Products', callback_data: 'productflow:explore' }]], stage: 'greeting' };
  intent.status = 'order_resumed';
  intent.resumedAt = new Date().toISOString();
  intent.updatedAt = intent.resumedAt;
  conversation.intentId = intent.id;
  return handleOrder(data, client, conversation, product.id);
}

async function handleIntentLater(data, client, conversation, intentId) {
  const intent = intentRecord(data, client, intentId);
  if (intent) {
    intent.status = 'dismissed';
    intent.dismissedAt = new Date().toISOString();
    intent.updatedAt = intent.dismissedAt;
  }
  conversation.stage = 'greeting';
  conversation.stageState = {};
  return {
    reply: t(client, 'REMINDER_NOT_NOW_ACK', {}, 'No problem. I will leave it for now.'),
    buttons: [[{ text: 'Main Menu', callback_data: 'productflow:main_menu' }]],
    stage: 'greeting'
  };
}

async function handleIntentStop(data, client, conversation, intentId) {
  const intent = intentRecord(data, client, intentId);
  if (intent) {
    intent.status = 'stopped';
    intent.optedOut = true;
    intent.stoppedAt = new Date().toISOString();
    intent.updatedAt = intent.stoppedAt;
  }
  conversation.intentRecoveryOptOut = true;
  conversation.stage = 'greeting';
  conversation.stageState = {};
  return {
    reply: t(client, 'STOP_REMINDERS_DONE', {}, 'Done. I will stop reminders for this product.'),
    buttons: [[{ text: 'Main Menu', callback_data: 'productflow:main_menu' }]],
    stage: 'greeting'
  };
}

const campaignRecord = (data, client, campaignId) => (data.announcementCampaigns || [])
  .find(item => item.id === campaignId && item.clientId === client.id);

async function handleCampaignView(data, client, conversation, campaignId) {
  const campaign = campaignRecord(data, client, campaignId);
  if (!campaign) return { reply: t(client, 'OFFER_UNAVAILABLE', {}, 'That offer is no longer available.'), buttons: [[{ text: 'Browse Products', callback_data: 'productflow:explore' }]], stage: 'greeting' };
  const audience = campaign.audience || {};
  let products = activeProducts(client);
  if (audience.scope === 'product' && audience.productId) {
    products = products.filter(product => product.id === audience.productId);
  } else if (audience.scope === 'category' && audience.category) {
    const key = normalizeKey(audience.category);
    products = products.filter(product => normalizeKey([product.category, product.subcategory, product.selectedCategory, product.selectedSubcategory].filter(Boolean).join(' ')).includes(key));
  }
  if (!products.length) {
    return { reply: t(client, 'PROMOTED_PRODUCTS_EMPTY', {}, 'The promoted products are not available right now. You can browse the shop instead.'), buttons: [[{ text: 'Browse Products', callback_data: 'productflow:explore' }]], stage: 'greeting' };
  }
  const recipient = (data.campaignRecipients || []).find(item =>
    item.campaignId === campaign.id &&
    item.clientId === client.id &&
    item.telegramChatId === (conversation.telegramChatId || '')
  );
  if (recipient) {
    recipient.status = 'clicked';
    recipient.clickedAt = new Date().toISOString();
    recipient.updatedAt = recipient.clickedAt;
  }
  campaign.clickCount = Number(campaign.clickCount || 0) + 1;
  campaign.updatedAt = new Date().toISOString();
  conversation.campaignId = campaign.id;
  return showProductPage(client, conversation, campaign.title || 'Offers', products, 0, '', { mode: 'campaign' });
}

async function handleCampaignStop(data, client, conversation, campaignId) {
  const customer = findCustomerProfile(data, client, conversation) || upsertCustomerProfile(data, client, conversation, {});
  if (customer) {
    customer.promotionsOptOut = true;
    customer.announcementOptOut = true;
    customer.promotionsOptOutAt = new Date().toISOString();
    customer.updatedAt = customer.promotionsOptOutAt;
  }
  const recipient = (data.campaignRecipients || []).find(item =>
    item.campaignId === campaignId &&
    item.clientId === client.id &&
    item.telegramChatId === (conversation.telegramChatId || '')
  );
  if (recipient) {
    recipient.status = 'stopped';
    recipient.stoppedAt = new Date().toISOString();
    recipient.updatedAt = recipient.stoppedAt;
  }
  return {
    reply: t(client, 'STOP_PROMOTIONS_DONE', {}, 'Done. I will stop promotional announcements. You can still browse, order, and get order updates here.'),
    buttons: [[{ text: 'Main Menu', callback_data: 'productflow:main_menu' }]],
    stage: 'greeting'
  };
}

async function handlePayment(client, conversation, orderId) {
  const state = conversation.stageState || {};
  const order = state.order;

  if (!order || order.id !== orderId) {
    return {
      reply: t(client, 'ORDER_NOT_FOUND', {}, 'Order not found. Please start a new order.'),
      buttons: [[{ text: '🛍 Explore Products', callback_data: 'productflow:explore' }]],
      stage: 'greeting'
    };
  }

  const paymentMethods = client?.settings?.paymentMethods ||
    client?.settings?.businessProfile?.paymentMethods || [];
  const methodsText = paymentMethods.length
    ? `Available methods: ${paymentMethods.join(', ')}`
    : 'Pay via Telebirr or CBE bank transfer.';

  const total = Number(order.total || 0);
  const deliveryFee = Number(order.deliveryFee || 0);
  const productPrice = Number(order.unitPrice || 0);

  let reply = `💳 **Payment**\n━━━━━━━━━━━━━━━━\n\n`;
  reply += `📦 ${order.productName}\n`;
  reply += `💰 Product: ${productPrice} Birr\n`;
  reply += `🚚 Delivery: ${deliveryFee} Birr\n`;
  reply += `**Total: ${total} Birr**\n\n`;
  reply += `${methodsText}\n\n`;
  reply += `Please complete payment and send the **payment screenshot** here.`;

  conversation.stageState = { ...state, order };
  conversation.stage = 'payment';

  return {
    reply,
    buttons: [
      [{ text: '❌ Cancel Order', callback_data: `productflow:cancel_order:${state.orderId}` }],
      [{ text: '🏠 Main Menu', callback_data: 'productflow:main_menu' }]
    ],
    stage: 'payment'
  };
}

async function handlePaymentScreenshot(data, client, conversation, ctx, photoFileId, filePath) {
  if (conversation.stage !== 'payment') return { handled: false };

  const state = conversation.stageState || {};
  const order = state.order;
  if (!order) return { handled: false };

  order.paymentScreenshotFileId = photoFileId;
  order.extractedPaymentAmount = '';
  order.extractedSenderName = '';
  order.paymentReference = '';
  order.paymentMethod = '';
  order.paymentStatus = 'pending_verification';
  order.paymentSubmittedAt = new Date().toISOString();

  conversation.stageState = { ...state, order };
  conversation.stage = 'owner_verification';

  const total = Number(order.total || 0);
  const deliveryFee = Number(order.deliveryFee || 0);
  const productPrice = Number(order.unitPrice || 0);

  let alertText = `🔔 **New Order — Payment Received**\n━━━━━━━━━━━━━━━━\n\n`;
  alertText += `🆔 Order: \`${order.id}\`\n`;
  alertText += `📦 Product: ${order.productName}\n`;
  alertText += `🔢 Code: ${order.productCode}\n`;
  alertText += `💰 Product: ${productPrice} Birr\n`;
  alertText += `🚚 Delivery: ${deliveryFee} Birr\n`;
  alertText += `**Total Expected: ${total} Birr**\n\n`;
  alertText += `👤 Customer: ${order.customerName}\n`;
  alertText += `📱 Phone: ${order.phone}\n`;
  if (order.selectedSize) alertText += `📏 Size: ${order.selectedSize}\n`;
  if (order.selectedColor) alertText += `🎨 Color: ${order.selectedColor}\n`;
  alertText += `📍 Address: ${order.deliveryLocation}\n\n`;
  alertText += `💳 **Payment Received:**\n`;
  alertText += `Owner review required. No AI/OCR decision was made.\n`;

  try {
    await deps.sendClientNotification?.(
      data, client,
      `new-order-${order.id}`,
      alertText,
      'orders',
      0
    );
  } catch (e) {
    console.error('Owner notification failed:', e.message);
  }

  return {
    handled: true,
    reply: '✅ **Payment screenshot received!**\n\nYour payment is being verified. We\'ll update you shortly.',
    buttons: [[{ text: '🏠 Main Menu', callback_data: 'productflow:main_menu' }]],
    stage: 'owner_verification'
  };
}

const paymentProofOrderForConversation = (data, client, conversation) => {
  const orderId = conversation.lastOrderId || conversation.stageState?.orderId || conversation.stageState?.order?.id || '';
  const chatId = chatIdString(conversation.telegramChatId);
  return (data.orders || []).find(item =>
    item.clientId === client.id &&
    (
      (orderId && item.id === orderId) ||
      (item.telegramChatId && chatId && chatIdString(item.telegramChatId) === chatId && ['awaiting_screenshot', 'pending_verification'].includes(String(item.paymentStatus || '')))
    )
  ) || null;
};

const extractPaymentTextHints = text => {
  const value = String(text || '');
  const amount = (value.match(/(?:etb|birr)?\s*([0-9][0-9,]*(?:\.\d{1,2})?)\s*(?:etb|birr)?/i) || [])[1] || '';
  const transactionId = (value.match(/\b(?:trx|txn|transaction|ref|reference|id)[:\s#-]*([A-Z0-9-]{5,})\b/i) || [])[1] || '';
  const provider = (value.match(/\b(telebirr|cbe|awash|dashen|abyssinia|boa|coop|hibret|wegagen|nib|zemen|bank)\b/i) || [])[1] || '';
  return { amount: amount.replace(/,/g, ''), transactionId, provider };
};

async function notifyOwnerPaymentProof(data, client, order, proof, ctx, proofKind = 'payment proof') {
  const ownerChatId = privateOwnerChatId(client);
  const product = activeProducts(client).find(item => item.id === order?.productId || (order?.productCode && item.code === order.productCode));
  const details = [
    '<b>SprintSales Automation</b>',
    `<b>Business:</b> ${client.businessName || client.id}`,
    '',
    `<b>Payment proof received</b>`,
    `Proof type: ${proofKind}`,
    order ? `Order: ${publicOrderCode(order)} (${order.id})` : 'Order: not matched',
    order ? `Product: ${[order.productName, order.productCode].filter(Boolean).join(' | ')}` : '',
    order?.quantity ? `Quantity: ${order.quantity}` : '',
    order?.selectedSize ? `Size: ${order.selectedSize}` : '',
    order?.selectedColor ? `Color: ${order.selectedColor}` : '',
    order?.selectedOption ? `Option: ${order.selectedOption}` : '',
    order?.discountAmount && Number(order.discountAmount) ? `Discount: ${order.discountLabel || order.discountReason} (-${order.discountAmount} Birr)` : '',
    order?.total ? `Expected total: ${order.total} Birr` : '',
    '',
    order ? `Customer: ${order.customerName || proof.customerName || 'Customer'}` : `Customer: ${proof.customerName || 'Customer'}`,
    order?.phone ? `Phone: ${order.phone}` : '',
    order?.deliveryLocation ? `Address: ${order.deliveryLocation}` : '',
    proof.extracted?.amount ? `Proof amount: ${proof.extracted.amount}` : '',
    proof.extracted?.transactionId ? `Transaction/ref: ${proof.extracted.transactionId}` : '',
    proof.manualSmsText ? `SMS/text:\n${String(proof.manualSmsText).slice(0, 900)}` : ''
  ].filter(Boolean).join('\n');
  const buttons = order ? {
    inline_keyboard: [
      [{ text: 'Confirm Payment', callback_data: `productflow:owner_confirm:${order.id}` }],
      [{ text: 'Ask Customer to Resend', callback_data: `productflow:owner_reject:${order.id}` }]
    ]
  } : undefined;

  if (ownerChatId && ctx?.telegram) {
    try {
      await ctx.telegram.sendMessage(ownerChatId, details, { parse_mode: 'HTML', reply_markup: buttons });
      if (product?.imagePath || product?.publicImagePath || product?.watermarkedImagePath) {
        await ctx.telegram.sendPhoto(ownerChatId, product.publicImagePath || product.watermarkedImagePath || product.imagePath, {
          caption: `Ordered product: ${[order.productName, order.productCode].filter(Boolean).join(' | ')}`
        }).catch(() => null);
      }
      return true;
    } catch (error) {
      console.warn(`Payment proof owner notify failed for ${client.businessName}:`, error.message);
    }
  }
  await deps.sendClientNotification?.(data, client, `payment-proof-${proof.id}`, details.replace(/<[^>]+>/g, ''), 'orders', 0);
  return false;
}

async function handlePaymentProofText(data, client, conversation, ctx, text) {
  const order = paymentProofOrderForConversation(data, client, conversation);
  if (!order) {
    return {
      handled: true,
      reply: t(client, 'PAYMENT_PROOF_PROMPT', {}, 'Please confirm an order first, then send the payment screenshot, transfer SMS, or copied bank message here.'),
      buttons: [
        [{ text: 'Browse Products', callback_data: 'productflow:explore' }],
        [{ text: 'Main Menu', callback_data: 'productflow:main_menu' }]
      ]
    };
  }
  data.paymentProofs ||= [];
  const hints = extractPaymentTextHints(text);
  const proof = {
    id: uid('proof'),
    clientId: client.id,
    conversationId: conversation.id,
    orderId: order.id,
    telegramFileId: '',
    manualSmsText: String(text || '').slice(0, 2000),
    customerName: conversation.customer?.name || order.customerName || '',
    username: conversation.customer?.username || order.username || '',
    telegramChatId: conversation.telegramChatId || order.telegramChatId || '',
    status: 'pending',
    extracted: {
      payerName: '',
      transactionId: hints.transactionId,
      amount: hints.amount,
      paymentDate: '',
      provider: hints.provider,
      note: 'Payment proof was submitted as customer text/SMS. Owner confirmation is required.'
    },
    createdAt: new Date().toISOString()
  };
  data.paymentProofs.push(proof);
  order.paymentProofId = proof.id;
  order.paymentStatus = 'pending_verification';
  order.status = order.status === 'draft' ? 'confirmed' : order.status;
  order.awaitingPaymentProof = false;
  order.updatedAt = new Date().toISOString();
  conversation.stage = 'owner_verification';
  conversation.stageState = { stage: 'owner_verification', orderId: order.id };
  await notifyOwnerPaymentProof(data, client, order, proof, ctx, 'transfer SMS/text');
  return {
    handled: true,
    reply: `${t(client, 'PAYMENT_PROOF_RECEIVED')}\n\n${t(client, 'PAYMENT_WAIT_REVIEW')}`,
    buttons: [[{ text: 'Main Menu', callback_data: 'productflow:main_menu' }]],
    stage: 'owner_verification'
  };
}

const deliveryProgressForOrder = (order, at = new Date()) => {
  const maxHours = Math.max(1, Number(order.deliveryMaxHours || order.deliveryEtaHours || 24) || 24);
  const startedAt = order.deliveryStartedAt ? new Date(order.deliveryStartedAt) : at;
  const elapsedMs = Math.max(0, at.getTime() - startedAt.getTime());
  const totalMs = maxHours * 60 * 60 * 1000;
  const percent = Math.min(100, Math.floor((elapsedMs / totalMs) * 100));
  const filled = Math.max(0, Math.min(10, Math.floor(percent / 10)));
  const bar = `${'🟩'.repeat(filled)}${'⬜'.repeat(10 - filled)} ${percent}%`;
  const dueAt = new Date(startedAt.getTime() + totalMs);
  const feedbackAt = new Date(startedAt.getTime() + Math.max(1, totalMs / 3));
  return { maxHours, percent, bar, dueAt, feedbackAt, isDue: percent >= 100, feedbackReady: at.getTime() >= feedbackAt.getTime() };
};

const deliveryProgressText = (order, client = {}) => {
  const progress = deliveryProgressForOrder(order);
  const area = order.deliveryArea || order.deliveryLocation || 'your address';
  const deadline = progress.dueAt.toLocaleString('en-US', { timeZone: 'Africa/Nairobi' });
  const feedbackTime = progress.feedbackAt.toLocaleString('en-US', { timeZone: 'Africa/Nairobi' });
  return [
    t(client, 'DELIVERY_STATUS', {}, 'Delivery status'),
    t(client, 'DELIVERY_PROGRESS', { progressBar: progress.bar }, `Progress: ${progress.bar}`),
    t(client, 'TRACK_AREA', { deliveryArea: area }, `Area: ${area}`),
    t(client, 'TRACK_MAX_TIME', { hours: progress.maxHours }, `Maximum delivery time: ${progress.maxHours} hours`),
    t(client, 'DELIVERY_DEADLINE', { deadline }, `Estimated deadline: ${deadline}`),
    progress.feedbackReady
      ? t(client, 'DELIVERY_FEEDBACK_READY', {}, 'You can now confirm if you received the order.')
      : t(client, 'DELIVERY_FEEDBACK_LATER', { feedbackTime }, `Delivery feedback buttons open around ${feedbackTime}.`)
  ].join('\n');
};

const trackingCopyButton = order => [{ text: 'Copy Tracking Code', copy_text: { text: publicOrderCode(order) } }];

const deliveryProgressButtons = order => {
  const rows = [trackingCopyButton(order), [{ text: 'Track Order', callback_data: 'productflow:track_order' }]];
  if (deliveryProgressForOrder(order).feedbackReady) {
    rows.unshift(
      [{ text: 'I received it', callback_data: `productflow:delivery_received:${order.id}` }],
      [{ text: 'I have not received it', callback_data: `productflow:delivery_not_received:${order.id}` }]
    );
  }
  return rows;
};

const chatIdString = value => String(value || '').trim();
const isOwnerChat = (client, ctx) => {
  const chatId = chatIdString(ctx?.chat?.id || ctx?.callbackQuery?.message?.chat?.id);
  return Boolean(chatId && chatId === privateOwnerChatId(client));
};

const isOrderCustomerChat = (order, conversation, ctx) => {
  const chatId = chatIdString(ctx?.chat?.id || ctx?.callbackQuery?.message?.chat?.id || conversation?.telegramChatId);
  return Boolean(!order?.telegramChatId || chatId === chatIdString(order.telegramChatId));
};

async function handleOwnerConfirm(data, client, conversation, orderId, ctx) {
  if (!isOwnerChat(client, ctx)) {
    return { reply: 'Only the configured shop owner can confirm payments.', stage: conversation.stage || 'greeting' };
  }
  const order = (data.orders || []).find(item => item.clientId === client.id && item.id === orderId);
  if (!order) return { reply: 'Order not found.', stage: 'greeting' };

  order.status = 'confirmed';
  order.paymentStatus = 'paid';
  order.ownerVerifiedAt = new Date().toISOString();
  order.paymentVerifiedAt = order.ownerVerifiedAt;
  order.paymentVerifiedByChatId = String(ctx?.chat?.id || '');
  order.customerConfirmedOrder = true;
  order.deliveryStatus = order.deliveryStatus === 'delivered' ? order.deliveryStatus : 'not-started';
  order.deliveryStartedAt = order.deliveryStartedAt || order.paymentVerifiedAt;
  order.deliveryMaxHours = Math.max(1, Number(order.deliveryMaxHours || order.deliveryEtaHours || 24) || 24);
  const started = new Date(order.deliveryStartedAt);
  order.deliveryFeedbackAvailableAt = new Date(started.getTime() + (order.deliveryMaxHours * 60 * 60 * 1000 / 3)).toISOString();
  order.updatedAt = new Date().toISOString();

  const proof = (data.paymentProofs || []).find(item => item.id === order.paymentProofId || item.orderId === order.id);
  if (proof) {
    proof.status = 'verified';
    proof.verifiedAt = order.ownerVerifiedAt;
  }
  const customerProfile = upsertCustomerProfile(data, client, conversation, order);
  if (order.discountReason === 'birthday_week' && order.birthdayDiscountYear && customerProfile) {
    customerProfile.birthdayDiscountYears = Array.from(new Set([
      ...(Array.isArray(customerProfile.birthdayDiscountYears) ? customerProfile.birthdayDiscountYears : []),
      String(order.birthdayDiscountYear)
    ]));
  }

  conversation.stageState = {};
  conversation.stage = 'completed';

  if (order.telegramChatId && ctx?.telegram) {
    const productHint = [order.productName, order.selectedSize, order.selectedColor, order.selectedOption].filter(Boolean).join(' ');
    const message = [
      t(client, 'PAYMENT_CONFIRMED', { customerName: order.customerName || 'dear customer' }),
      '',
      t(client, 'PAYMENT_TRACKING_CODE', { trackingCode: publicOrderCode(order) }),
      productHint ? t(client, 'PAYMENT_PREPARING', { productHint }) : t(client, 'PAYMENT_PREPARING', { productHint: 'your order' }),
      '',
      t(client, 'PAYMENT_THANK_YOU', { businessName: client.businessName }),
      '',
      deliveryProgressText(order, client)
    ].join('\n');
    await ctx.telegram.sendMessage(order.telegramChatId, message, {
      reply_markup: {
        inline_keyboard: localizeButtons(client, [
          trackingCopyButton(order),
          [{ text: 'Track Delivery', callback_data: 'productflow:track_order' }],
          [{ text: 'Main Menu', callback_data: 'productflow:main_menu' }]
        ])
      }
    }).catch(error => {
      console.warn('Customer payment confirmation failed:', error.message);
    });
  }

  return {
    reply: [
      `✅ Payment confirmed for ${publicOrderCode(order)}.`,
      `Customer: ${order.customerName || 'Customer'}`,
      `Product: ${[order.productName, order.productCode].filter(Boolean).join(' | ')}`,
      order.quantity ? `Quantity: ${order.quantity}` : '',
      order.selectedSize ? `Size: ${order.selectedSize}` : '',
      order.selectedColor ? `Color: ${order.selectedColor}` : '',
      order.selectedOption ? `Option: ${order.selectedOption}` : '',
      order.discountAmount && Number(order.discountAmount) ? `Discount: ${order.discountLabel || order.discountReason} (-${order.discountAmount} Birr)` : '',
      `Total: ${order.total || 0} Birr`,
      `Delivery: ${order.deliveryArea || order.deliveryLocation || 'not set'} (${order.deliveryMaxHours} hours max)`,
      '',
      'The customer has been notified.'
    ].filter(Boolean).join('\n'),
    buttons: [[{ text: 'Main Menu', callback_data: 'productflow:main_menu' }]],
    product: activeProducts(client).find(item => item.id === order.productId || (order.productCode && item.code === order.productCode)),
    stage: 'completed'
  };
}

async function handleOwnerReject(data, client, conversation, orderId, ctx) {
  if (!isOwnerChat(client, ctx)) {
    return { reply: 'Only the configured shop owner can reject payments.', stage: conversation.stage || 'greeting' };
  }
  const order = (data.orders || []).find(item => item.clientId === client.id && item.id === orderId);
  if (!order) return { reply: 'Order not found.', stage: 'greeting' };

  order.paymentStatus = 'rejected';
  order.ownerVerifiedAt = new Date().toISOString();
  order.updatedAt = new Date().toISOString();

  const proof = (data.paymentProofs || []).find(item => item.id === order.paymentProofId || item.orderId === order.id);
  if (proof) {
    proof.status = 'rejected';
    proof.verifiedAt = order.ownerVerifiedAt;
  }

  conversation.stageState = {};
  conversation.stage = 'completed';

  if (order.telegramChatId && ctx?.telegram) {
    await ctx.telegram.sendMessage(
      order.telegramChatId,
      `We could not confirm the payment for order ${order.id}. Please check the screenshot and send the correct payment proof, or talk to support.`
    ).catch(error => console.warn('Customer payment rejection notice failed:', error.message));
  }

  return {
    reply: `Payment rejected for order ${order.id}. The customer has been asked to resend proof or contact support.`,
    buttons: [[{ text: 'Main Menu', callback_data: 'productflow:main_menu' }]],
    stage: 'completed'
  };
}

async function handleOwnerReview(client, conversation, orderId) {
  const state = conversation.stageState || {};
  const order = state.order;
  if (!order || order.id !== orderId) {
    return { reply: 'Order not found.', stage: 'greeting' };
  }

  order.paymentStatus = 'review';
  order.ownerVerifiedAt = new Date().toISOString();

  conversation.stageState = { ...state, order };
  conversation.stage = 'completed';

  return {
    reply: '🔍 Your payment is being reviewed. We\'ll update you shortly.',
    buttons: [[{ text: '🏠 Main Menu', callback_data: 'productflow:main_menu' }]],
    stage: 'completed'
  };
}

async function handleSupport(client, conversation) {
  const state = conversation.stageState || {};
  conversation.stage = 'human_support';
  conversation.stageState = { ...state, stage: 'human_support', supportStartedAt: new Date().toISOString() };

  return {
    reply: 'Ask me anything about products, prices, delivery, discounts, payment, or the shop. I’ll check the shop information first and answer here. If it needs the team, I’ll pass it to them.',
    buttons: [
      [{ text: 'Browse Products', callback_data: 'productflow:explore' }],
      [{ text: 'Main Menu', callback_data: 'productflow:main_menu' }]
    ],
    stage: 'human_support'
  };
}

const supportQuestionButtons = () => [
  [{ text: 'Ask Another Question', callback_data: 'productflow:support' }],
  [{ text: 'Browse Products', callback_data: 'productflow:explore' }],
  [{ text: 'Main Menu', callback_data: 'productflow:main_menu' }]
];

const mentionsAny = (text, words) => words.some(word => new RegExp(`\\b${word}\\b`, 'i').test(text));

function supportDeliveryAnswer(client, text) {
  const value = String(text || '');
  if (!mentionsAny(value, ['delivery', 'deliver', 'fee', 'shipping', 'transport', 'area', 'location'])) return null;
  const delivery = client?.settings?.delivery || {};
  const zone = findDeliveryZoneForAddress(delivery, value);
  if (zone) {
    const area = zone.area || zone.name || 'that area';
    const fee = Math.max(0, Number(zone.fee || 0) || 0);
    const maxHours = Math.max(1, Number(zone.maxHours || 24) || 24);
    return fee
      ? `Delivery to ${area} is ${fee} Birr. Maximum delivery time is ${maxHours} hour${maxHours === 1 ? '' : 's'}.`
      : `Delivery to ${area} is free. Maximum delivery time is ${maxHours} hour${maxHours === 1 ? '' : 's'}.`;
  }
  const candidates = deliveryZoneCandidatesForAddress(delivery, value);
  if (candidates.length === 1) {
    const item = candidates[0].zone;
    const fee = Math.max(0, Number(item.fee || 0) || 0);
    const maxHours = Math.max(1, Number(item.maxHours || 24) || 24);
    return `Delivery to ${item.area || item.name} is ${fee} Birr. Maximum delivery time is ${maxHours} hour${maxHours === 1 ? '' : 's'}.`;
  }
  const mode = delivery.mode || (Array.isArray(delivery.zones) && delivery.zones.length ? 'location_zones' : 'fixed_addis');
  if (mode === 'fixed_addis' && /\b(addis|addis ababa)\b/i.test(value)) {
    const fee = Math.max(0, Number(delivery.addis_delivery_fee ?? 300) || 0);
    const maxHours = Math.max(1, Number(delivery.maxHours || delivery.defaultMaxHours || 24) || 24);
    return fee
      ? `Delivery inside Addis Ababa is ${fee} Birr. Maximum delivery time is ${maxHours} hour${maxHours === 1 ? '' : 's'}.`
      : `Delivery inside Addis Ababa is free. Maximum delivery time is ${maxHours} hour${maxHours === 1 ? '' : 's'}.`;
  }
  if (mode === 'location_zones') return 'Please send the delivery area name, for example Ayat, Bole, CMC, or the nearest known location, and I will check the delivery fee.';
  return null;
}

function supportPaymentAnswer(client, text) {
  const value = String(text || '');
  if (!mentionsAny(value, ['payment', 'pay', 'bank', 'account', 'telebirr', 'transfer'])) return null;
  const options = validPaymentOptions(client);
  if (!options.length) return 'Payment options are not configured yet. The team will share payment details when you confirm an order.';
  return [
    'You can pay using one of these options:',
    '',
    ...options.map((option, index) => `${index + 1}. ${option.method}\nAccount: ${option.accountNumber}\nName: ${option.accountName}`)
  ].join('\n');
}

function supportDiscountAnswer(client, text) {
  const value = String(text || '');
  if (!mentionsAny(value, ['discount', 'promo', 'coupon', 'sale', 'holiday', 'offer', 'birthday', 'loyal', 'new buyer', 'repeat'])) return null;
  const discounts = client?.settings?.discounts || {};
  if (discounts.enabled === false) return 'Discounts are currently turned off for this shop.';
  const askedBirthday = /\bbirth(day| week)?\b/i.test(value);
  const askedPromo = /\b(promo|coupon|code)\b/i.test(value);
  const askedNew = /\b(new buyer|new customer|first time)\b/i.test(value);
  const askedLoyal = /\b(loyal|repeat|repetitive|returning)\b/i.test(value);
  const rows = [];
  const statusLine = (label, setting, extra = '') => {
    const enabled = setting?.enabled && Number(setting.value) > 0;
    return enabled ? `${label}: ${setting.value}%${extra}` : `${label}: not active right now`;
  };
  if (askedBirthday) return statusLine('Birthday week discount', discounts.birthdayWeek, '. It only works if Telegram provides birthday data; we do not ask customers to type birthdays.');
  if (askedNew) return statusLine('New buyer discount', discounts.newBuyer);
  if (askedLoyal) return statusLine('Repeat buyer discount', discounts.repeatBuyer, ` after ${discounts.repeatBuyer?.purchaseCount || 2} paid orders`);
  if (discounts.sales?.enabled && Number(discounts.sales.value) > 0) rows.push(`Sales discount: ${discounts.sales.value}%`);
  if (discounts.holiday?.enabled && Number(discounts.holiday.value) > 0) rows.push(`Holiday discount: ${discounts.holiday.value}%`);
  if (discounts.newBuyer?.enabled && Number(discounts.newBuyer.value) > 0) rows.push(`New buyer discount: ${discounts.newBuyer.value}%`);
  if (discounts.repeatBuyer?.enabled && Number(discounts.repeatBuyer.value) > 0) rows.push(`Repeat buyer discount: ${discounts.repeatBuyer.value}% after ${discounts.repeatBuyer.purchaseCount || 2} purchases`);
  if (discounts.birthdayWeek?.enabled && Number(discounts.birthdayWeek.value) > 0) rows.push(`Birthday week discount: ${discounts.birthdayWeek.value}% when Telegram birthday data is available`);
  const codes = (discounts.codes || []).filter(code => code?.enabled !== false && Number(code.value) > 0).slice(0, 3);
  codes.forEach(code => rows.push(`Promo code ${code.code}: ${code.value}%`));
  if (askedPromo && !codes.length) return 'Promo-code discounts are not active right now.';
  return rows.length ? `Current active offers:\n${rows.map(row => `- ${row}`).join('\n')}` : 'There are no active discounts right now.';
}

function supportBusinessAnswer(client, text) {
  const value = String(text || '');
  const profile = client?.settings?.businessProfile || {};
  if (mentionsAny(value, ['address', 'location', 'branch', 'where'])) {
    const branches = Array.isArray(client?.settings?.businessBranches) ? client.settings.businessBranches : [];
    const branchLines = branches.map(branch => [branch.city, branch.address || branch.location].filter(Boolean).join(': ')).filter(Boolean);
    const main = [client?.settings?.city, profile.address].filter(Boolean).join(', ');
    const lines = [main, ...branchLines].filter(Boolean);
    return lines.length ? `Our location information:\n${lines.map(line => `- ${line}`).join('\n')}` : null;
  }
  if (mentionsAny(value, ['contact', 'phone', 'call', 'telegram', 'website'])) {
    const rows = [];
    if (client?.phone) rows.push(`Phone: ${client.phone}`);
    if (client?.settings?.telegramChannelLink) rows.push(`Telegram: ${client.settings.telegramChannelLink}`);
    if (client?.settings?.businessWebsite) rows.push(`Website: ${client.settings.businessWebsite}`);
    return rows.length ? rows.join('\n') : null;
  }
  if (/about|what do you sell|business|shop|store/i.test(value)) {
    const summary = [profile.summary, profile.products, profile.services, profile.referenceKnowledge]
      .map(item => String(item || '').trim())
      .filter(Boolean)[0];
    return summary ? `${client.businessName || 'This shop'}: ${summary.slice(0, 700)}` : null;
  }
  return null;
}

function supportKnowledgeAnswer(client, text) {
  const profile = client?.settings?.businessProfile || {};
  const knowledge = [
    profile.referenceKnowledge,
    profile.faq,
    profile.policies,
    profile.paymentInstructions,
    profile.delivery,
    profile.mustSay
  ].map(item => String(item || '').trim()).filter(Boolean).join('\n');
  if (!knowledge) return null;
  const queryTokens = tokenizeProductSearch(text).filter(token => token.length >= 4);
  if (!queryTokens.length) return null;
  const lower = knowledge.toLowerCase();
  const matches = queryTokens.filter(token => lower.includes(token));
  if (!matches.length) return null;
  const sentences = knowledge
    .split(/(?<=[.!?])\s+|\n+/)
    .map(sentence => sentence.trim())
    .filter(Boolean)
    .filter(sentence => matches.some(token => sentence.toLowerCase().includes(token)))
    .slice(0, 3);
  return sentences.length ? sentences.join('\n') : knowledge.slice(0, 700);
}

async function supportLocalAnswer(client, conversation, text) {
  if (looksLikeProductSearchText(text)) {
    const productResult = await productSearchResult(client, conversation, text, 0);
    if (productResult) return productResult;
  }
  const answer = supportDeliveryAnswer(client, text) ||
    supportPaymentAnswer(client, text) ||
    supportDiscountAnswer(client, text) ||
    supportBusinessAnswer(client, text) ||
    supportKnowledgeAnswer(client, text);
  return answer ? { handled: true, reply: answer, buttons: supportQuestionButtons(), stage: 'human_support' } : null;
}

async function handleSupportText(data, client, conversation, text) {
  const local = await supportLocalAnswer(client, conversation, text);
  if (local) return local;
  const customerName = conversation.customer?.name || conversation.customer?.username || 'Customer';
  data.unansweredQuestions ||= [];
  const questionText = String(text || '').slice(0, 1000);
  const supportQuestion = {
    id: `unanswered_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    clientId: client.id,
    conversationId: conversation.id,
    question: questionText,
    suggestedTopic: 'Support',
    status: 'open',
    count: 1,
    customerName,
    username: conversation.customer?.username || '',
    telegramChatId: conversation.telegramChatId || '',
    createdAt: new Date().toISOString(),
    lastAskedAt: new Date().toISOString()
  };
  data.unansweredQuestions.push(supportQuestion);
  try {
    await deps.sendClientNotification?.(
      data,
      client,
      `support-${supportQuestion.id}`,
      `Support question needs owner reply\n\nBusiness: ${client.businessName || client.id}\nCustomer: ${customerName}\nChat ID: ${conversation.telegramChatId || conversation.id}\n\nQuestion:\n${String(text || '').slice(0, 1000)}`,
      'support',
      0,
      { supportReply: { questionId: supportQuestion.id, conversationId: conversation.id, telegramChatId: conversation.telegramChatId || '' } }
    );
  } catch (e) {
    console.error('Support notification failed:', e.message);
  }
  conversation.stageState = {
    ...(conversation.stageState || {}),
    stage: 'human_support',
    handoffAt: new Date().toISOString(),
    lastSupportQuestion: String(text || '').slice(0, 1000)
  };
  return {
    handled: true,
    reply: 'I am not fully sure about that, so I sent your question to the team. They will reply here as soon as possible.',
    buttons: supportQuestionButtons(),
    stage: 'human_support'
  };
}

function publicOrderCode(orderOrId) {
  const id = typeof orderOrId === 'string' ? orderOrId : orderOrId?.id;
  const short = String(id || '').slice(-8);
  return short ? `#${short}` : '';
}

function normalizeOrderLookup(value) {
  return String(value || '').trim().replace(/^#+/, '').replace(/^order[-_\s]*/i, '').toLowerCase();
}

function orderMatchesTrackingQuery(order, query) {
  const normalizedQuery = normalizeOrderLookup(query);
  const queryPhone = normalizedQuery.replace(/\D/g, '');
  const id = String(order?.id || '');
  const phone = normalizeOrderLookup(order?.phone).replace(/\D/g, '');
  const productCode = normalizeOrderLookup(order?.productCode);
  return id.toLowerCase() === String(query || '').trim().toLowerCase() ||
    normalizeOrderLookup(id) === normalizedQuery ||
    normalizeOrderLookup(id.slice(-8)) === normalizedQuery ||
    (queryPhone && phone === queryPhone) ||
    (productCode && productCode === normalizedQuery);
}

function trackingStatusLabel(order, client = {}) {
  const status = String(order?.status || 'draft');
  const delivery = String(order?.deliveryStatus || '');
  if (status === 'cancelled' || delivery === 'cancelled') return t(client, 'STATUS_CANCELLED', {}, 'Cancelled');
  if (status === 'delivered' || delivery === 'delivered') return t(client, 'STATUS_DELIVERED', {}, 'Delivered');
  if (delivery === 'out-for-delivery') return t(client, 'STATUS_OUT_FOR_DELIVERY', {}, 'Out for delivery');
  if (status === 'packed' || delivery === 'packed') return t(client, 'STATUS_PACKED', {}, 'Packed and preparing delivery');
  if (status === 'paid') return t(client, 'STATUS_PAID', {}, 'Paid and preparing');
  if (status === 'confirmed') return t(client, 'STATUS_CONFIRMED', {}, 'Confirmed');
  if (status === 'draft') return t(client, 'STATUS_DRAFT', {}, 'Draft');
  return status.replace(/[-_]/g, ' ');
}
function trackingPaymentLabel(order, client = {}) {
  const status = String(order?.paymentStatus || 'unpaid');
  return {
    unpaid: t(client, 'PAYMENT_STATUS_UNPAID', {}, 'Unpaid'),
    partial: t(client, 'PAYMENT_STATUS_PARTIAL', {}, 'Partially paid'),
    paid: t(client, 'PAYMENT_STATUS_PAID', {}, 'Paid'),
    confirmed: t(client, 'PAYMENT_STATUS_PAID', {}, 'Confirmed'),
    pending_verification: t(client, 'PAYMENT_STATUS_REVIEW', {}, 'Payment proof under review'),
    awaiting_screenshot: t(client, 'PAYMENT_STATUS_WAITING', {}, 'Waiting for payment screenshot'),
    rejected: t(client, 'PAYMENT_STATUS_REJECTED', {}, 'Payment proof rejected'),
    refunded: t(client, 'PAYMENT_STATUS_REFUNDED', {}, 'Refunded')
  }[status] || status.replace(/[-_]/g, ' ');
}
function formatTrackedOrder(order, client = {}) {
  const lines = [
    t(client, 'PAYMENT_TRACKING_CODE', { trackingCode: publicOrderCode(order) }, `Tracking code: ${publicOrderCode(order)}`),
    order.productCode ? t(client, 'TRACK_PRODUCT', { productName: order.productName || 'Product', productCode: order.productCode }) : t(client, 'CONFIRM_PRODUCT', { productName: order.productName || 'Product' }),
    t(client, 'TRACK_STATUS', { status: trackingStatusLabel(order, client) }),
    t(client, 'TRACK_PAYMENT', { paymentStatus: trackingPaymentLabel(order, client) }),
    order.selectedSize ? t(client, 'CONFIRM_SIZE', { size: order.selectedSize }) : '',
    order.selectedColor ? t(client, 'CONFIRM_COLOR', { color: order.selectedColor }) : '',
    order.selectedOption ? t(client, 'CONFIRM_OPTION', { option: order.selectedOption }) : '',
    order.quantity ? t(client, 'CONFIRM_QUANTITY', { quantity: order.quantity }) : '',
    order.total ? t(client, 'TRACK_TOTAL', { total: order.total }) : '',
    order.deliveryArea ? t(client, 'TRACK_AREA', { deliveryArea: order.deliveryArea }) : '',
    order.deliveryMaxHours || order.deliveryEtaHours ? t(client, 'TRACK_MAX_TIME', { hours: order.deliveryMaxHours || order.deliveryEtaHours }) : ''
  ].filter(Boolean);
  if (['paid', 'confirmed'].includes(String(order.paymentStatus || '')) && order.deliveryStartedAt) {
    lines.push('', deliveryProgressText(order, client));
  }
  return lines.join('\n');
}
const trackedOrderButtons = order => {
  if (['delivered', 'cancelled'].includes(String(order.deliveryStatus || order.status || ''))) {
    return [[{ text: 'Main Menu', callback_data: 'productflow:main_menu' }]];
  }
  if (order.deliveryStartedAt) {
    return [
      ...deliveryProgressButtons(order).filter(row => !row.some(button => button.copy_text)),
      [{ text: 'Main Menu', callback_data: 'productflow:main_menu' }]
    ];
  }
  return [[{ text: 'Main Menu', callback_data: 'productflow:main_menu' }]];
};

function findOwnedTrackedOrderForText(data, client, conversation, text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const normalized = normalizeOrderLookup(raw);
  const looksLikeCode = /^#/.test(raw) ||
    /^order[-_\s]/i.test(raw) ||
    /^[a-z0-9_-]{6,16}$/i.test(normalized);
  if (!looksLikeCode) return null;
  return (data?.orders || []).find(order =>
    order.clientId === client.id &&
    (
      String(order.id || '').toLowerCase() === raw.toLowerCase() ||
      normalizeOrderLookup(order.id) === normalized ||
      normalizeOrderLookup(String(order.id || '').slice(-8)) === normalized
    ) &&
    order.telegramChatId &&
    chatIdString(order.telegramChatId) === chatIdString(conversation.telegramChatId)
  ) || null;
}

const autoTrackOrderResult = (data, client, conversation, text) => {
  const order = findOwnedTrackedOrderForText(data, client, conversation, text);
  if (!order) return null;
  conversation.stage = 'greeting';
  conversation.stageState = {};
  return {
    handled: true,
    reply: formatTrackedOrder(order, client),
    buttons: trackedOrderButtons(order),
    stage: 'greeting'
  };
};

async function handleTrackOrder(client, conversation) {
  conversation.stage = 'track_order';
  return {
    reply: t(client, 'TRACK_PROMPT', {}, 'Please send your order number or the phone number you used when ordering.'),
    buttons: [[{ text: t(client, 'BTN_MAIN_MENU'), callback_data: 'productflow:main_menu' }]],
    stage: 'track_order'
  };
  return {
    reply: '📦 Please send your **order number** or the **phone number** you used when ordering.',
    buttons: [[{ text: '🏠 Main Menu', callback_data: 'productflow:main_menu' }]],
    stage: 'track_order'
  };
}

async function handleTrackOrderText(data, client, conversation, text) {
  const query = (text || '').trim();
  if (!query) return { handled: false };

  const orders = (data?.orders || []).filter(o =>
    o.clientId === client.id &&
    (
      o.conversationId === conversation.id ||
      (o.telegramChatId && chatIdString(o.telegramChatId) === chatIdString(conversation.telegramChatId))
    )
  );

  const match = orders.find(o => orderMatchesTrackingQuery(o, query));

  if (!match) {
    const phoneOrders = (data?.orders || []).filter(o =>
      o.clientId === client.id &&
      orderMatchesTrackingQuery(o, query) &&
      o.telegramChatId &&
      chatIdString(o.telegramChatId) === chatIdString(conversation.telegramChatId)
    );
    if (phoneOrders.length > 0) {
      const o = phoneOrders[0];
      return {
        handled: true,
        reply: formatTrackedOrder(o, client),
        buttons: [[{ text: 'Main Menu', callback_data: 'productflow:main_menu' }]],
        stage: 'greeting'
      };
      let reply = `📦 **Order: \`${o.id}\`**\n`;
      reply += `📦 Product: ${o.productName}\n`;
      reply += `📊 Status: ${o.status === 'confirmed' ? '✅ Confirmed' : o.status === 'draft' ? '📝 Draft' : '❌ Cancelled'}\n`;
      reply += `💳 Payment: ${o.paymentStatus === 'paid' ? '✅ Paid' : o.paymentStatus === 'pending_verification' ? '⏳ Pending' : '❌ Unpaid'}\n`;
      return {
        handled: true,
        reply,
        buttons: [[{ text: '🏠 Main Menu', callback_data: 'productflow:main_menu' }]],
        stage: 'greeting'
      };
    }
    return {
      handled: true,
      reply: t(client, 'TRACK_NOT_FOUND', {}, 'No order found with that number. Please double-check and try again.'),
      buttons: [[{ text: 'Main Menu', callback_data: 'productflow:main_menu' }]],
      stage: 'greeting'
    };
  }

  let reply = `📦 **Order: \`${match.id}\`**\n`;
  reply += `📦 Product: ${match.productName}\n`;
  const statusMap = { draft: '📝 Draft', confirmed: '✅ Confirmed', cancelled: '❌ Cancelled' };
  const payMap = { unpaid: '❌ Unpaid', paid: '✅ Paid', pending_verification: '⏳ Pending', rejected: '⚠️ Rejected' };
  reply += `📊 Status: ${statusMap[match.status] || match.status}\n`;
  reply += `💳 Payment: ${payMap[match.paymentStatus] || match.paymentStatus}\n`;
  if (match.selectedSize) reply += `📏 Size: ${match.selectedSize}\n`;
  if (match.selectedColor) reply += `🎨 Color: ${match.selectedColor}\n`;

  conversation.stage = 'greeting';
  return {
    handled: true,
    reply: formatTrackedOrder(match, client),
    buttons: [[{ text: 'Main Menu', callback_data: 'productflow:main_menu' }]],
    stage: 'greeting'
  };
}

async function handleDeliveryReceived(data, client, conversation, orderId, ctx) {
  const order = (data.orders || []).find(item => item.clientId === client.id && item.id === orderId);
  if (!order) return { reply: 'Order not found.', stage: 'greeting' };
  if (!isOrderCustomerChat(order, conversation, ctx)) {
    return { reply: 'This delivery button belongs to another customer chat.', stage: conversation.stage || 'greeting' };
  }

  order.deliveryStatus = 'delivered';
  order.deliveredAt = new Date().toISOString();
  order.reviewStatus = order.reviewStatus || 'pending';
  order.reviewDueAt = order.reviewDueAt || new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
  order.updatedAt = order.deliveredAt;
  conversation.stage = 'completed';
  conversation.stageState = {};

  try {
    await deps.sendClientNotification?.(
      data,
      client,
      `delivery-received-${order.id}`,
      `Delivery received\nOrder: ${order.id}\nCustomer: ${order.customerName || 'Customer'}\nProduct: ${order.productName}`,
      'orders',
      0
    );
  } catch (e) {
    console.error('Delivery received notification failed:', e.message);
  }

  return {
    reply: t(client, 'DELIVERY_RECEIVED_THANKS', { orderId: order.id }, `Thank you for confirming. Order ${order.id} is marked as delivered.`),
    buttons: [[{ text: 'Main Menu', callback_data: 'productflow:main_menu' }]],
    stage: 'completed'
  };
}

async function handleDeliveryNotReceived(data, client, conversation, orderId, ctx) {
  const order = (data.orders || []).find(item => item.clientId === client.id && item.id === orderId);
  if (!order) return { reply: 'Order not found.', stage: 'greeting' };
  if (!isOrderCustomerChat(order, conversation, ctx)) {
    return { reply: 'This delivery button belongs to another customer chat.', stage: conversation.stage || 'greeting' };
  }

  const progress = deliveryProgressForOrder(order);
  if (!progress.isDue) {
    return {
      reply: `${t(client, 'DELIVERY_TOO_EARLY', {}, 'The maximum delivery time has not passed yet.')}\n\n${deliveryProgressText(order, client)}`,
      buttons: deliveryProgressButtons(order),
      stage: conversation.stage || 'completed'
    };
  }

  order.deliveryStatus = 'late_reported';
  order.deliveryIssueReportedAt = new Date().toISOString();
  order.updatedAt = order.deliveryIssueReportedAt;
  conversation.stage = 'delivery_support';
  conversation.stageState = { stage: 'delivery_support', orderId: order.id };

  try {
    await deps.sendClientNotification?.(
      data,
      client,
      `delivery-late-${order.id}`,
      `Delivery issue reported\nOrder: ${order.id}\nCustomer: ${order.customerName || 'Customer'}\nPhone: ${order.phone || ''}\nAddress: ${order.deliveryLocation || ''}`,
      'orders',
      0
    );
  } catch (e) {
    console.error('Delivery issue notification failed:', e.message);
  }

  return {
    reply: t(client, 'DELIVERY_NOT_RECEIVED', { orderId: order.id }, `I'm sorry the order has not arrived yet. I notified the team about order ${order.id}; they should follow up with you shortly.`),
    buttons: [[{ text: 'Main Menu', callback_data: 'productflow:main_menu' }]],
    stage: 'delivery_support'
  };
}

async function handleReviewRating(data, client, conversation, param, ctx) {
  const [orderId, ratingRaw] = String(param || '').split(':');
  const rating = Math.max(1, Math.min(5, parseInt(ratingRaw, 10) || 0));
  const order = (data.orders || []).find(item => item.clientId === client.id && item.id === orderId);
  if (!order || !rating) return { reply: t(client, 'REVIEW_NOT_FOUND', {}, 'Review not found. Please use Track Order or talk to support.'), stage: 'greeting' };
  if (!isOrderCustomerChat(order, conversation, ctx)) {
    return { reply: t(client, 'REVIEW_WRONG_CHAT', {}, 'This review button belongs to another customer chat.'), stage: conversation.stage || 'greeting' };
  }

  order.reviewRating = rating;
  order.reviewStatus = rating >= 5 ? 'rated_5' : 'rated';
  order.reviewSubmittedAt = new Date().toISOString();
  order.updatedAt = order.reviewSubmittedAt;
  conversation.stage = rating >= 5 ? 'review_photo_request' : 'completed';
  conversation.stageState = rating >= 5 ? { stage: 'review_photo_request', orderId: order.id } : {};

  if (rating >= 5) {
    return {
      reply: t(client, 'REVIEW_5_STAR', {}, 'Thank you for the 5-star rating. If you would like, you can send a photo review here. The team may give you a small discount on your next order as a thank-you.'),
      buttons: [
        [{ text: 'Maybe Later', callback_data: 'productflow:main_menu' }]
      ],
      stage: 'review_photo_request'
    };
  }

  try {
    await deps.sendClientNotification?.(
      data,
      client,
      `review-rating-${order.id}`,
      `Customer review received\nOrder: ${order.id}\nRating: ${rating}/5\nCustomer: ${order.customerName || 'Customer'}\nProduct: ${order.productName}`,
      'orders',
      0
    );
  } catch (e) {
    console.error('Review notification failed:', e.message);
  }

  return {
    reply: t(client, 'REVIEW_THANKS', { rating }, `Thank you for rating your order ${rating}/5. We appreciate the feedback and will use it to improve.`),
    buttons: [[{ text: 'Main Menu', callback_data: 'productflow:main_menu' }]],
    stage: 'completed'
  };
}

async function handleCancelOrder(data, client, conversation, orderId) {
  const state = conversation.stageState || {};
  if (state.order && state.order.id === orderId) {
    state.order.status = 'cancelled';
  }
  closeProductIntent(data, client, conversation, state.productId || state.order?.productId || '', 'cancelled', orderId);
  conversation.stage = 'greeting';
  conversation.stageState = {};
  return {
    reply: t(client, 'ORDER_CANCELLED', {}, 'Order cancelled. How else can I help you?'),
    buttons: [
      [{ text: 'Browse Products', callback_data: 'productflow:explore' }],
      [{ text: 'Track Order', callback_data: 'productflow:track_order' }],
      [{ text: 'Main Menu', callback_data: 'productflow:main_menu' }]
    ],
    stage: 'greeting'
  };
}

async function handleEditOrder(client, conversation, orderId) {
  const state = conversation.stageState || {};
  const order = state.order;
  if (!order || order.id !== orderId) {
    return {
      reply: t(client, 'ORDER_NOT_FOUND', {}, 'Order not found. Please start again.'),
      buttons: [[{ text: 'Explore Products', callback_data: 'productflow:explore' }]],
      stage: 'greeting'
    };
  }

  const product = activeProducts(client).find(p => p.id === state.productId);
  conversation.stageState = {
    stage: 'order_collection',
    productId: state.productId,
    orderId: state.orderId,
    productName: state.productName,
    productPrice: state.productPrice,
    productCode: state.productCode,
    customerName: '',
    phone: '',
    address: '',
    quantity: '',
    size: '',
    color: '',
    option: '',
    collected: {}
  };
  conversation.stage = 'order_collection';

  const firstMissing = requiredOrderFields(conversation.stageState, product || {})[0];
  return {
    reply: `Let's update your order for **${state.productName}**.\n\n${orderFieldPrompt(firstMissing, product || {}, state.customerName)}`,
    buttons: orderPromptButtons(firstMissing, product || {}, state.orderId, state),
    stage: 'order_collection'
  };
}

// ????????????????????????????????????????????????????????????????????????
// MAIN ROUTER
// ????????????????????????????????????????????????????????????????????????


async function handleProductflowCallback(data, client, conversation, ctx, rawCallback) {
  applyShopperLanguage(client, conversation);
  // CRITICAL: Enrich client with products from data.products[]
  enrichClientProducts(data, client);

  const parts = (rawCallback || '').split(':');
  const action = parts[0] || '';
  const param = parts.slice(1).join(':') || '';

  const bot = deps.getBot?.(client.id);

  try {
    let result;

    switch (action) {
      case 'explore':
        result = await handleExplore(client, conversation);
        break;

      case 'category':
        result = await handleCategoryBrowse(client, conversation, param);
        break;

      case 'subcategory':
        result = await handleSubcategoryBrowse(client, conversation, param);
        break;

      case 'gallery':
        result = await handleProductGallery(client, conversation, param, ctx);
        break;

      case 'search':
        conversation.stage = 'product_search';
        conversation.conversationState = 'shopping_mode';
        conversation.stageState = { stage: 'product_search' };
        result = {
          reply: `${t(client, 'SEARCH_PROMPT')}\n\n${t(client, 'SEARCH_HELP')}`,
          buttons: [
            [{ text: 'Browse Products', callback_data: 'productflow:explore' }],
            [{ text: 'Main Menu', callback_data: 'productflow:main_menu' }]
          ],
          stage: 'product_search'
        };
        break;

      case 'payment_proof':
        {
          const orderId = conversation.lastOrderId || conversation.stageState?.orderId || '';
          const order = (data.orders || []).find(item =>
            item.clientId === client.id &&
            item.id === orderId &&
            (item.telegramChatId ? chatIdString(item.telegramChatId) === chatIdString(conversation.telegramChatId) : true)
          );
          if (!order) {
            result = {
              reply: t(client, 'PAYMENT_PROOF_PROMPT', {}, 'Please confirm an order first, then send the payment screenshot here.'),
              buttons: [
                [{ text: 'Browse Products', callback_data: 'productflow:explore' }],
                [{ text: 'Track Order', callback_data: 'productflow:track_order' }],
                [{ text: 'Main Menu', callback_data: 'productflow:main_menu' }]
              ],
              stage: conversation.stage || 'greeting'
            };
            break;
          }
        }
        conversation.stage = 'awaiting_payment_proof';
        conversation.stageState = { stage: 'awaiting_payment_proof', orderId: conversation.lastOrderId || conversation.stageState?.orderId || '' };
        result = {
          reply: `${t(client, 'PAYMENT_PROOF_PROMPT')}\n\n${t(client, 'PAYMENT_REVIEW_NOTE')}`,
          buttons: [[{ text: '🏠 Main Menu', callback_data: 'productflow:main_menu' }]],
          stage: 'awaiting_payment_proof'
        };
        break;

      case 'next':
      case 'prev': {
        await ctx.deleteMessage?.().catch(() => null);
        const [catName, pageStr] = param.split(':');
        const itemIndex = Math.max(0, parseInt(pageStr, 10) || 0);
        const page = Math.floor(itemIndex / PAGE_SIZE);
        const category = (catName || '').replace(/_/g, ' ');
        const products = productsInCategory(client, category);
        result = await showProductPage(client, conversation, category, products, page);
        break;
      }

      case 'page': {
        await ctx.deleteMessage?.().catch(() => null);
        const [categorySlug, subcategorySlug, pageStr] = param.split(':');
        const page = Math.max(0, parseInt(pageStr, 10) || 0);
        const categoryRecord = findPopulatedCategory(client, categorySlug);
        if (!categoryRecord) {
          result = await handleExplore(client, conversation);
          break;
        }
        const subcategoryRecord = subcategorySlug && subcategorySlug !== 'all'
          ? findPopulatedSubcategory(categoryRecord, subcategorySlug)
          : null;
        const products = productsInCategory(client, categoryRecord.name, subcategoryRecord?.name || '');
        result = await showProductPage(client, conversation, categoryRecord.name, products, page, subcategoryRecord?.name || '');
        break;
      }

      case 'search_page': {
        await ctx.deleteMessage?.().catch(() => null);
        const query = conversation.stageState?.searchQuery || '';
        const page = Math.max(0, parseInt(param, 10) || 0);
        result = query ? await productSearchResult(client, conversation, query, page) : {
          reply: t(client, 'SEARCH_AGAIN_PROMPT', {}, 'Please search again so I can find the right products.'),
          buttons: [
            [{ text: 'Search Again', callback_data: 'productflow:search' }],
            [{ text: 'Main Menu', callback_data: 'productflow:main_menu' }]
          ],
          stage: 'product_search'
        };
        break;
      }

      case 'order':
        result = await handleOrder(data, client, conversation, param);
        break;

      case 'spec':
        result = await handleSpecChoice(data, client, conversation, param);
        break;

      case 'language': {
        const selected = String(param || '').toLowerCase().includes('english') ? 'english' : 'amharic';
        conversation.shopperLanguage = selected;
        applyShopperLanguage(client, conversation);
        conversation.stage = 'greeting';
        conversation.stageState = {};
        conversation.conversationState = 'welcome';
        result = {
          reply: t(client, 'LANGUAGE_CHANGED', {}, 'Language changed. How can I help you?'),
          buttons: [
            [{ text: t(client, 'BTN_MAIN_MENU'), callback_data: 'productflow:main_menu' }]
          ],
          stage: 'greeting'
        };
        break;
      }

      case 'match_spec': {
        const [field, index] = param.split(':');
        result = await handleMatchSpecChoice(client, conversation, field, index);
        break;
      }

      case 'match_add':
        result = await handleMatchAdd(data, client, conversation, param);
        break;

      case 'match_skip':
        result = await handleMatchSkip(data, client, conversation, param);
        break;

      case 'recommend_view':
        result = await handleRecommendationView(data, client, conversation, param);
        break;

      case 'recommend_order':
        result = await handleRecommendationOrder(data, client, conversation, param);
        break;

      case 'recommend_later':
        result = await handleRecommendationLater(data, client, conversation, param);
        break;

      case 'recommend_stop':
        result = await handleRecommendationStop(data, client, conversation, param);
        break;

      case 'intent_view':
        result = await handleIntentView(data, client, conversation, param, false);
        break;

      case 'intent_similar':
        result = await handleIntentView(data, client, conversation, param, true);
        break;

      case 'intent_continue':
        result = await handleIntentContinue(data, client, conversation, param);
        break;

      case 'intent_later':
        result = await handleIntentLater(data, client, conversation, param);
        break;

      case 'intent_stop':
        result = await handleIntentStop(data, client, conversation, param);
        break;

      case 'campaign_view':
        result = await handleCampaignView(data, client, conversation, param);
        break;

      case 'campaign_stop':
        result = await handleCampaignStop(data, client, conversation, param);
        break;

      case 'noop':
        result = { reply: null, buttons: [], stage: conversation.stage };
        break;

      case 'delivery_area':
        result = await handleDeliveryAreaChoice(data, client, conversation, param);
        break;

      case 'use_saved_contact':
        result = await handleSavedContactChoice(client, conversation, true);
        break;

      case 'update_contact':
        result = await handleSavedContactChoice(client, conversation, false);
        break;

      case 'confirm_order':
        result = await handleConfirmOrder(data, client, conversation, param);
        break;

      case 'promo_code':
        result = await handlePromoCodePrompt(client, conversation, param);
        break;

      case 'skip_promo':
        conversation.stage = 'order_confirmation';
        conversation.stageState = { ...(conversation.stageState || {}), promoCode: '' };
        result = await showOrderConfirmation(data, client, conversation, conversation.stageState);
        break;

      case 'continue_payment':
        // Legacy button from the previous payment experiment; keep it non-payment.
        result = await handleConfirmOrder(data, client, conversation, param);
        break;

      case 'edit_order':
        result = await handleEditOrder(client, conversation, param);
        break;

      case 'back_order':
        result = await handleOrderBack(client, conversation, param);
        break;

      case 'cancel_order':
        result = await handleCancelOrder(data, client, conversation, param);
        break;

      case 'owner_confirm':
        result = await handleOwnerConfirm(data, client, conversation, param, ctx);
        break;

      case 'owner_reject':
        result = await handleOwnerReject(data, client, conversation, param, ctx);
        break;

      case 'owner_review':
        result = await handleOwnerReview(client, conversation, param);
        break;

      case 'support':
        result = await handleSupport(client, conversation);
        break;

      case 'track_order':
        result = await handleTrackOrder(client, conversation);
        break;

      case 'delivery_received':
        result = await handleDeliveryReceived(data, client, conversation, param, ctx);
        break;

      case 'delivery_not_received':
        result = await handleDeliveryNotReceived(data, client, conversation, param, ctx);
        break;

      case 'review_rating':
        result = await handleReviewRating(data, client, conversation, param, ctx);
        break;

      case 'main_menu':
      case 'greeting':
        conversation.stage = 'greeting';
        conversation.stageState = {};
        conversation.conversationState = 'welcome';
        result = { reply: null, buttons: [], stage: 'greeting' };
        break;

      case 'back_categories':
        result = await handleExplore(client, conversation);
        break;

      default:
        return { handled: false };
    }

    if (!result) return { handled: false };
    result = localizeResult(client, result);

    if (result.stage) conversation.stage = result.stage;

    if (Array.isArray(result.batchProducts) && result.batchProducts.length) {
      for (const item of result.batchProducts) {
        const product = activeProducts(client).find(p => p.id === item.product?.id) || item.product;
        recordProductIntent(data, client, conversation, product, 'viewed');
        let sent = false;
        if (bot) {
          try {
            sent = await sendProductMedia(ctx, product, item.reply, item.buttons);
          } catch (photoErr) {
            console.log(`[ProductFlow] Image send failed for "${product?.name}", falling back to text: ${photoErr.message}`);
          }
        }
        if (!sent) {
          const markup = item.buttons?.length ? Markup.inlineKeyboard(item.buttons) : {};
          await ctx.reply(cleanShopperText(item.reply), markup);
        }
        await wait(PRODUCT_SEND_DELAY_MS);
      }
      return { handled: true, batchCount: result.batchProducts.length };
    }

    if (result.product && result.reply) {
      try {
        const product = activeProducts(client).find(p => p.id === result.product.id);
        if (result.stage === 'product_display') recordProductIntent(data, client, conversation, product, 'viewed');
        if (bot) {
          try {
            const sent = await sendProductMedia(ctx, product, result.reply, result.buttons);
            if (sent) return { handled: true, usedPhoto: true };
          } catch (photoErr) {
            console.log(`[ProductFlow] Image send failed for "${product?.name}", falling back to text: ${photoErr.message}`);
            // Fall through to text reply
          }
        }
      } catch (imgErr) {
        console.error('Product image lookup failed:', imgErr.message);
      }
    }

    if (result.reply && result.reply !== null) {
      if (result.removeReplyKeyboard) {
        await ctx.reply(t(client, 'ORDER_REMOVE_KEYBOARD', {}, 'Got it.'), Markup.removeKeyboard()).catch(() => null);
      }
      const markup = result.replyKeyboard
        ? { reply_markup: result.replyKeyboard }
        : (result.buttons?.length ? Markup.inlineKeyboard(result.buttons) : {});
      await ctx.reply(cleanShopperText(result.reply), markup);
      return { handled: true };
    }

    return result.reply === null ? { handled: true, needsGreetingRegen: true } : { handled: true };
  } catch (error) {
    console.error('Productflow callback error:', error.message);
    try {
      await ctx.reply('Something went wrong. Please try again.', Markup.inlineKeyboard([
        [{ text: '🏠 Main Menu', callback_data: 'productflow:main_menu' }]
      ]));
    } catch (e) { /* ignore */ }
    return { handled: true };
  }
}

async function handleProductflowText(data, client, conversation, ctx, text) {
  applyShopperLanguage(client, conversation);
  // CRITICAL: Enrich client with products from data.products[]
  enrichClientProducts(data, client);

  const trackedOrder = autoTrackOrderResult(data, client, conversation, text);
  if (trackedOrder) return localizeResult(client, trackedOrder);

  if (conversation.stage === 'awaiting_payment_proof' || conversation.stage === 'payment') {
    return localizeResult(client, await handlePaymentProofText(data, client, conversation, ctx, text));
  }

  if (conversation.stage === 'promo_code') {
    const state = conversation.stageState || {};
    const code = /\b(skip|no|none)\b/i.test(text) ? '' : String(text || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24);
    conversation.stage = 'order_confirmation';
    conversation.stageState = { ...state, promoCode: code };
    return localizeResult(client, await showOrderConfirmation(data, client, conversation, conversation.stageState));
  }

  if (conversation.stage === 'order_collection') {
    return localizeResult(client, await handleProductflowMessage(data, client, conversation, ctx, text));
  }
  if (conversation.stage === 'track_order') {
    return localizeResult(client, await handleTrackOrderText(data, client, conversation, text));
  }
  if (conversation.stage === 'human_support') {
    return localizeResult(client, await handleSupportText(data, client, conversation, text));
  }
  if (conversation.stage === 'product_search') {
    const result = await productSearchResult(client, conversation, text, 0);
    if (result) return localizeResult(client, result);
    return localizeResult(client, {
      handled: true,
      reply: t(client, 'SEARCH_NO_MATCH', {}, 'I could not spot that in stock yet. Try a product code, describe it with a few more details, or browse the catalog.'),
      buttons: [
        [{ text: 'Search Again', callback_data: 'productflow:search' }],
        [{ text: 'Browse Products', callback_data: 'productflow:explore' }],
        [{ text: 'Main Menu', callback_data: 'productflow:main_menu' }]
      ]
    });
  }
  if (looksLikeProductSearchText(text)) {
    const result = await productSearchResult(client, conversation, text, 0);
    if (result) {
      conversation.stage = 'product_search';
      conversation.conversationState = 'shopping_mode';
      conversation.stageState = { stage: 'product_search' };
      return localizeResult(client, result);
    }
  }
  return { handled: false };
}

// ════════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════════
async function handleProductflowContact(data, client, conversation, ctx, contact = {}) {
  applyShopperLanguage(client, conversation);
  enrichClientProducts(data, client);
  if (conversation.stage !== 'order_collection') return { handled: false };

  const state = conversation.stageState || {};
  const product = activeProducts(client).find(p => p.id === state.productId);
  const orderId = state.orderId;
  if (!product || !orderId) return { handled: false };

  const sharedUserId = String(contact.user_id || '');
  const senderId = String(ctx?.from?.id || '');
  if (sharedUserId && senderId && sharedUserId !== senderId) {
    return localizeResult(client, {
      handled: true,
      reply: t(client, 'ORDER_SHARE_PHONE_PROMPT', {}, 'Please share your own phone number, or type your full name, phone number, and delivery address in one message.'),
      replyKeyboard: orderContactReplyKeyboard(client),
      stage: 'order_collection'
    });
  }

  const phone = normalizeContactPhone(contact.phone_number || '');
  if (!phone) {
    return localizeResult(client, {
      handled: true,
      reply: t(client, 'ORDER_CONTACT_MANUAL_PROMPT', {}, 'Please send your full name, phone number, and clear delivery address in one message.'),
      buttons: orderPromptButtons('contact', product, orderId, state),
      stage: 'order_collection'
    });
  }

  state.phone = phone;
  state.phoneSharedFromTelegram = true;
  state.awaitingNameConfirmation = true;
  state.customerName = '';
  state.customerTelegramName = [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim() || conversation.customer?.name || '';
  conversation.stageState = state;

  return localizeResult(client, {
    handled: true,
    reply: t(client, 'ORDER_NAME_PROMPT', {}, 'I received your phone number. Please send the correct full name we should use for delivery.'),
    buttons: orderPromptButtons('contact', product, orderId, state),
    removeReplyKeyboard: true,
    stage: 'order_collection'
  });
}

module.exports = {
  initProductflow,
  normalizeProduct,
  normalizeProductImages,
  isProductVisible,
  generateProductflowGreeting,
  handleProductflowCallback,
  handleProductflowText,
  handleProductflowContact,
  handleProductflowMessage,
  handlePaymentScreenshot,
};
