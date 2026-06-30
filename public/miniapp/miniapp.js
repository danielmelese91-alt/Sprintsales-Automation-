(function () {
  var app = document.getElementById('app');
  var state = {
    shop: null,
    categories: [],
    products: [],
    category: 'All',
    subcategory: 'All',
    saleOnly: false,
    sort: 'featured',
    filterSize: '',
    filterColor: '',
    query: '',
    selectedProduct: null,
    selectedImage: 0,
    selectedColor: '',
    orderResult: null,
    paymentProofResult: null,
    view: 'catalog',
    trackResult: null,
    trackError: '',
    searchOpen: false,
    account: null,
    shopperSessionId: '',
    serverOrders: [],
    ordersLoaded: false,
    supportMessages: [],
    supportLoaded: false,
    supportSending: false,
    supportError: '',
    supportWaitingForTeam: false,
    imageViewer: null,
    cakeFeaturedIndex: 0,
    editorialFeaturedIndex: 0,
    navigationReady: false
  };
  var cakeFeaturedTimer = null;
  var editorialFeaturedTimer = null;
  var supportPollTimer = null;

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function slugFromPath() {
    var parts = location.pathname.split('/').filter(Boolean);
    var index = parts.indexOf('shop');
    return index >= 0 ? decodeURIComponent(parts[index + 1] || '') : '_host';
  }

  function baseShopPath() {
    var parts = location.pathname.split('/').filter(Boolean);
    var index = parts.indexOf('shop');
    return index >= 0 ? '/shop/' + encodeURIComponent(parts[index + 1] || slugFromPath()) : '/';
  }

  function productKey(product) {
    return String((product && (product.code || product.id)) || '').trim();
  }

  function productPath(product) {
    var key = encodeURIComponent(productKey(product));
    var base = baseShopPath().replace(/\/$/, '');
    return (base || '') + '/product/' + key;
  }

  function productFromLocation() {
    var parts = location.pathname.split('/').filter(Boolean);
    var index = parts.indexOf('product');
    var token = index >= 0 ? decodeURIComponent(parts[index + 1] || '') : new URLSearchParams(location.search).get('product');
    token = String(token || '').trim().toLowerCase();
    if (!token) return null;
    return state.products.find(function (product) {
      return [product.id, product.code].some(function (value) {
        return String(value || '').trim().toLowerCase() === token;
      });
    }) || null;
  }

  function storefrontUrl() {
    var url = new URL(baseShopPath(), location.origin);
    if (state.selectedProduct) return new URL(productPath(state.selectedProduct), location.origin);
    if (state.view === 'account') url.searchParams.set('view', 'account');
    if (state.view === 'track') url.searchParams.set('view', 'orders');
    if (state.view === 'support') url.searchParams.set('view', 'support');
    if (state.query) url.searchParams.set('search', state.query);
    return url;
  }

  function updateDocumentMetadata() {
    if (!state.shop) return;
    var product = state.selectedProduct;
    var shopName = state.shop.businessName || 'SprintSales Shop';
    var title = product ? product.name + ' | ' + shopName : (/\bshop\b/i.test(shopName) ? shopName : shopName + ' Shop');
    var description = product
      ? shortText(product.description || (product.name + ' is available from ' + shopName + '.'), 180)
      : shortText(state.shop.summary || state.shop.firstTimeWelcomeMessage || ('Browse available items from ' + shopName + '.'), 180);
    var image = product && product.images && product.images[0] ? new URL(product.images[0], location.origin).toString() : (state.shop.logoUrl ? new URL(state.shop.logoUrl, location.origin).toString() : '');
    var canonical = storefrontUrl().toString();
    document.title = title;
    [
      ['meta[name="description"]', 'content', description],
      ['meta[property="og:title"]', 'content', title],
      ['meta[property="og:description"]', 'content', description],
      ['meta[property="og:image"]', 'content', image],
      ['meta[property="og:url"]', 'content', canonical],
      ['meta[name="twitter:title"]', 'content', title],
      ['meta[name="twitter:description"]', 'content', description],
      ['meta[name="twitter:image"]', 'content', image],
      ['link[rel="canonical"]', 'href', canonical]
    ].forEach(function (entry) {
      var node = document.querySelector(entry[0]);
      if (node) node.setAttribute(entry[1], entry[2]);
    });
  }

  function syncHistory(mode) {
    if (!state.navigationReady) return;
    var method = mode === 'replace' ? 'replaceState' : 'pushState';
    history[method]({ sprintSales: true }, '', storefrontUrl());
    updateDocumentMetadata();
  }

  function applyLocationState() {
    var params = new URLSearchParams(location.search);
    var product = productFromLocation();
    state.selectedProduct = product;
    state.selectedImage = 0;
    state.selectedColor = '';
    state.orderResult = null;
    state.paymentProofResult = null;
    state.trackError = '';
    state.trackResult = null;
    state.query = params.get('search') || '';
    state.searchOpen = Boolean(state.query);
    state.filterSize = '';
    state.filterColor = '';
    var view = String(params.get('view') || '').toLowerCase();
    state.view = view === 'account'
      ? 'account'
      : (view === 'orders' || view === 'track' ? 'track' : (view === 'support' ? 'support' : 'catalog'));
    if (product) state.view = 'catalog';
  }

  function openProduct(product, mode) {
    state.selectedProduct = product || null;
    state.selectedImage = 0;
    state.selectedColor = '';
    state.orderResult = null;
    state.paymentProofResult = null;
    state.view = 'catalog';
    syncHistory(mode);
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function storageKey(suffix) {
    var shopId = state.shop && state.shop.id ? state.shop.id : slugFromPath();
    return 'sprintsales-miniapp:' + shopId + ':' + suffix;
  }

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) {}
  }

  function randomToken() {
    try {
      var bytes = new Uint32Array(3);
      window.crypto.getRandomValues(bytes);
      return Array.prototype.map.call(bytes, function (item) { return item.toString(36); }).join('');
    } catch (error) {
      return Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
  }

  function ensureShopperSessionId() {
    var key = storageKey('shopperSessionId');
    var saved = readJson(key, '');
    if (!saved) {
      saved = 'ss_' + Date.now().toString(36) + '_' + randomToken();
      writeJson(key, saved);
    }
    state.shopperSessionId = saved;
    return saved;
  }

  function money(value) {
    var n = Number(String(value || '').replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(n) || n <= 0) return 'Contact for price';
    return new Intl.NumberFormat('en-ET', { maximumFractionDigits: 0 }).format(n) + ' Birr';
  }

  function moneyNumber(value) {
    var n = Number(String(value || '').replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function percentOff(product) {
    var price = moneyNumber(product.price);
    var compare = moneyNumber(product.compareAtPrice);
    if (!price || !compare || compare <= price) return 0;
    return Math.round((1 - price / compare) * 100);
  }

  function initials(name) {
    return String(name || 'Shop')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(function (part) { return part[0]; })
      .join('')
      .toUpperCase();
  }

  function shortText(value, max) {
    var text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.length > max ? text.slice(0, max - 1).trim() + '...' : text;
  }

  function productText(product) {
    return [
      product.name,
      product.code,
      product.category,
      product.subcategory,
      product.description,
      (product.colors || []).join(' '),
      (product.sizes || []).join(' '),
      (product.options || []).join(' '),
      (product.specGroups || []).map(function (group) {
        return [group.label, (group.values || []).join(' ')].join(' ');
      }).join(' ')
    ].join(' ').toLowerCase();
  }

  function queryMatches(product, query) {
    if (!query) return true;
    var tokens = query.split(/\s+/).filter(Boolean);
    var haystack = productText(product);
    return tokens.every(function (token) { return haystack.indexOf(token) >= 0; });
  }

  function categoryInfo(name) {
    return state.categories.find(function (item) { return item.name === name; }) || null;
  }

  function subcategoriesForSelectedCategory() {
    if (state.category === 'All') return [];
    var info = categoryInfo(state.category);
    return (info && info.subcategories) || [];
  }

  function sortedProducts(products) {
    var list = products.slice();
    if (state.sort === 'newest') {
      list.sort(function (a, b) {
        var dateA = Date.parse(a.createdAt || a.updatedAt || '') || 0;
        var dateB = Date.parse(b.createdAt || b.updatedAt || '') || 0;
        return dateB - dateA;
      });
    } else if (state.sort === 'price-low') {
      list.sort(function (a, b) { return moneyNumber(a.price) - moneyNumber(b.price); });
    } else if (state.sort === 'price-high') {
      list.sort(function (a, b) { return moneyNumber(b.price) - moneyNumber(a.price); });
    } else if (state.sort === 'name') {
      list.sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || '')); });
    } else {
      list.sort(function (a, b) {
        var scoreA = (a.featured ? 10 : 0) + (a.images && a.images.length ? 3 : 0) + Math.min((a.images || []).length, 3);
        var scoreB = (b.featured ? 10 : 0) + (b.images && b.images.length ? 3 : 0) + Math.min((b.images || []).length, 3);
        return scoreB - scoreA;
      });
    }
    return list;
  }

  function visibleProducts() {
    var query = state.query.toLowerCase().trim();
    return sortedProducts(state.products.filter(function (product) {
      var categoryOk = state.category === 'All' || product.category === state.category;
      var subcategoryOk = state.subcategory === 'All' || product.subcategory === state.subcategory;
      var saleOk = !state.saleOnly || percentOff(product) > 0;
      var sizeOk = !state.filterSize || productFilterValues(product, 'size').some(function (value) {
        return value.toLowerCase() === state.filterSize.toLowerCase();
      });
      var colorOk = !state.filterColor || productFilterValues(product, 'color').some(function (value) {
        return value.toLowerCase() === state.filterColor.toLowerCase();
      });
      return categoryOk && subcategoryOk && saleOk && sizeOk && colorOk && queryMatches(product, query);
    }));
  }

  function uniqueFilterValues(values) {
    var seen = new Set();
    return values.map(function (value) { return String(value || '').trim(); }).filter(function (value) {
      var key = value.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort(function (a, b) { return a.localeCompare(b, undefined, { numeric: true }); });
  }

  function looksLikeLegacySize(value) {
    var text = String(value || '').trim();
    return /^(\d{1,3}(?:\.\d+)?(?:\s*(?:cm|mm|inch|in|kg|g|ml|l|w|waist))?|(?:xxs|xs|s|m|l|xl|xxl|xxxl|small|medium|large|extra large|free size|one size))$/i.test(text);
  }

  function productFilterValues(product, type) {
    var values = type === 'color' ? (product.colors || []) : [];
    (product.specGroups || []).forEach(function (group) {
      var label = [group.key, group.label].join(' ').toLowerCase();
      var field = String(group.field || '').toLowerCase();
      var matches = type === 'color'
        ? field === 'color' || /colou?r/.test(label)
        : field === 'size' || /(^|[_\s-])(size|waist|dimension)([_\s-]|$)/.test(label);
      if (matches) values = values.concat(group.values || []);
    });
    if (type === 'size' && !values.length) {
      values = (product.sizes || []).filter(looksLikeLegacySize);
    }
    return uniqueFilterValues(values);
  }

  function productColorImages(product) {
    return (product && Array.isArray(product.colorImages) ? product.colorImages : [])
      .map(function (item) {
        return {
          color: String(item && item.color || '').trim(),
          image: String(item && item.image || item.url || '').trim()
        };
      })
      .filter(function (item) { return item.color && item.image; });
  }

  function colorImageFor(product, color) {
    var needle = String(color || '').trim().toLowerCase();
    return productColorImages(product).find(function (item) {
      return item.color.toLowerCase() === needle;
    }) || null;
  }

  function defaultColorImageFor(product) {
    var variants = productColorImages(product);
    if (!variants.length) return null;
    var groups = product && Array.isArray(product.specGroups) ? product.specGroups : [];
    var colorGroup = groups.find(function (group) {
      return String(group.field || '').toLowerCase() === 'color' || /colou?r/i.test([group.key, group.label].join(' '));
    });
    var values = colorGroup && Array.isArray(colorGroup.values) ? colorGroup.values : [];
    return (values.length ? colorImageFor(product, values[0]) : null) || variants[0] || null;
  }

  function catalogProductsBeforeOptionFilters() {
    var query = state.query.toLowerCase().trim();
    return state.products.filter(function (product) {
      return (state.category === 'All' || product.category === state.category) &&
        (state.subcategory === 'All' || product.subcategory === state.subcategory) &&
        (!state.saleOnly || percentOff(product) > 0) &&
        queryMatches(product, query);
    });
  }

  function botUrl(product) {
    if (!state.shop || !state.shop.botUsername) return '';
    var start = product && product.code ? '?start=' + encodeURIComponent('code_' + product.code) : '';
    return 'https://t.me/' + encodeURIComponent(state.shop.botUsername) + start;
  }

  function mapsUrl(address) {
    var text = String(address || '').trim();
    return text ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(text) : '';
  }

  function orderNeedsPayment(order) {
    var payment = String(order && order.paymentStatus || '').toLowerCase();
    var status = String(order && order.status || '').toLowerCase();
    if (/paid|verified|refunded|rejected|failed/.test(payment)) return false;
    if (/delivered|cancelled|canceled/.test(status)) return false;
    return /waiting|proof|not_requested|pending|review|unpaid|requested/.test(payment) || !payment;
  }

  function tgUser() {
    var webApp = window.Telegram && window.Telegram.WebApp;
    return (webApp && webApp.initDataUnsafe && webApp.initDataUnsafe.user) || {};
  }

  function isTelegramOpen() {
    var webApp = window.Telegram && window.Telegram.WebApp;
    return Boolean(webApp && (webApp.initData || (webApp.initDataUnsafe && webApp.initDataUnsafe.user)));
  }

  function isCakeShop() {
    var shop = state.shop || {};
    var text = String(shop.retailType || '').toLowerCase();
    return shop.isCakeShop === true || /cake|bakery|pastry|dessert/.test(text);
  }

  function isEditorialTemplate() {
    return !isCakeShop() && String((state.shop && state.shop.template) || '') === 'editorial-boutique';
  }

  function retailStyleKey() {
    var text = String((state.shop && state.shop.retailType) || '').toLowerCase();
    if (/cake|bakery|pastry|dessert/.test(text)) return 'cakes';
    if (/shoe|sneaker|footwear/.test(text)) return 'shoes';
    if (/bag|accessor|leather/.test(text)) return 'bags';
    if (/fashion|boutique|cloth|apparel/.test(text)) return 'fashion';
    if (/electron|phone|computer|laptop|gadget/.test(text)) return 'electronics';
    if (/beauty|cosmetic|makeup|skincare|perfume|salon/.test(text)) return 'beauty';
    if (/furniture|sofa|bed|chair/.test(text)) return 'furniture';
    if (/home|kitchen|appliance|cookware|household/.test(text)) return 'home';
    return 'general';
  }

  function isCakeProduct(product) {
    var text = [product && product.category, product && product.subcategory, product && product.name].join(' ').toLowerCase();
    return isCakeShop() || /\b(cakes?|bakery|cupcakes?|pastries?|desserts?|birthday|wedding|fondant|bento)\b/.test(text);
  }

  function paymentDueLabel(payment) {
    if (!payment) return 'Amount to pay now';
    return String(payment.label || '').toLowerCase().indexOf('kabd') >= 0 ? 'Kabd to pay now' : 'Amount to pay now';
  }

  function defaultAccount() {
    var user = tgUser();
    return {
      fullName: [user.first_name, user.last_name].filter(Boolean).join(' '),
      phone: '',
      address: '',
      telegramChatId: user.id ? String(user.id) : '',
      telegramUserId: user.id ? String(user.id) : '',
      telegramUsername: user.username || '',
      shopperSessionId: state.shopperSessionId || ''
    };
  }

  function loadAccount() {
    ensureShopperSessionId();
    var base = defaultAccount();
    var saved = readJson(storageKey('account'), {});
    state.account = {
      fullName: saved.fullName || base.fullName || '',
      phone: saved.phone || '',
      address: saved.address || '',
      telegramChatId: saved.telegramChatId || base.telegramChatId || '',
      telegramUserId: saved.telegramUserId || base.telegramUserId || '',
      telegramUsername: saved.telegramUsername || base.telegramUsername || '',
      shopperSessionId: saved.shopperSessionId || base.shopperSessionId || state.shopperSessionId || ''
    };
  }

  function saveAccount(account, sync) {
    state.account = Object.assign(defaultAccount(), state.account || {}, account || {});
    state.account.shopperSessionId = state.shopperSessionId || ensureShopperSessionId();
    writeJson(storageKey('account'), state.account);
    if (sync !== false) syncAccount(state.account);
  }

  function localOrders() {
    return readJson(storageKey('orders'), []);
  }

  function orderKey(order) {
    return String(order.id || order.trackingCode || '').trim();
  }

  function recentOrders() {
    var map = new Map();
    (state.serverOrders || []).forEach(function (order) {
      var key = orderKey(order);
      if (key) map.set(key, order);
    });
    localOrders().forEach(function (order) {
      var key = orderKey(order);
      if (key && !map.has(key)) map.set(key, order);
    });
    return Array.from(map.values()).sort(function (a, b) {
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
  }

  function rememberOrder(order) {
    if (!order) return;
    var orders = localOrders().filter(function (item) { return item.id !== order.id; });
    orders.unshift({
      id: order.id,
      trackingCode: order.trackingCode,
      productName: order.productName,
      productCode: order.productCode,
      productImageUrl: order.productImageUrl,
      quantity: order.quantity,
      total: order.total,
      phone: state.account && state.account.phone,
      status: order.status,
      paymentStatus: order.paymentStatus,
      deliveryStatus: order.deliveryStatus,
      createdAt: new Date().toISOString()
    });
    writeJson(storageKey('orders'), orders.slice(0, 20));
    state.serverOrders = recentOrders();
  }

  async function syncAccount(account) {
    if (!account || (!account.fullName && !account.phone && !account.address && !account.telegramChatId && !account.telegramUserId && !account.telegramUsername)) return;
    try {
      await fetch('/api/miniapp/shop/' + encodeURIComponent(slugFromPath()) + '/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(Object.assign({}, account, { shopperSessionId: state.shopperSessionId || ensureShopperSessionId() }))
      });
    } catch (error) {}
  }

  async function syncOrders(renderAfter) {
    var account = state.account || defaultAccount();
    var params = new URLSearchParams();
    params.set('sessionId', state.shopperSessionId || ensureShopperSessionId());
    if (account.telegramChatId) params.set('telegramChatId', account.telegramChatId);
    if (account.telegramUserId) params.set('telegramUserId', account.telegramUserId);
    if (account.telegramUsername) params.set('telegramUsername', account.telegramUsername);
    try {
      var response = await fetch('/api/miniapp/shop/' + encodeURIComponent(slugFromPath()) + '/my-orders?' + params.toString(), {
        credentials: 'same-origin'
      });
      var result = await response.json();
      if (response.ok) {
        state.serverOrders = result.orders || [];
      }
    } catch (error) {
      // Local order history remains available when the network is unstable.
    }
    state.ordersLoaded = true;
    if (renderAfter) render();
  }

  async function trackMiniappEvent(type, payload) {
    if (!state.shop) return;
    var account = state.account || defaultAccount();
    var body = Object.assign({
      type: type,
      shopperSessionId: state.shopperSessionId || ensureShopperSessionId(),
      fullName: account.fullName || '',
      phone: account.phone || '',
      address: account.address || '',
      telegramChatId: account.telegramChatId || account.telegramUserId || '',
      telegramUserId: account.telegramUserId || '',
      telegramUsername: account.telegramUsername || '',
      source: isTelegramOpen() ? 'telegram_miniapp' : 'web_shop'
    }, payload || {});
    try {
      await fetch('/api/miniapp/shop/' + encodeURIComponent(slugFromPath()) + '/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        keepalive: true,
        body: JSON.stringify(body)
      });
    } catch (error) {}
  }

  function activeClass(view) {
    return state.view === view && !state.selectedProduct && !state.orderResult ? 'active' : '';
  }

  function svgIcon(type) {
    var icons = {
      search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"></circle><path d="M16 16l4 4"></path></svg>',
      user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"></circle><path d="M4 21c1.8-4 14.2-4 16 0"></path></svg>',
      share: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="2.5"></circle><circle cx="6" cy="12" r="2.5"></circle><circle cx="18" cy="19" r="2.5"></circle><path d="M8.3 10.8l7.4-4.4M8.3 13.2l7.4 4.4"></path></svg>',
      home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11l8-7 8 7"></path><path d="M6 10v10h12V10"></path></svg>',
      orders: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v16H7z"></path><path d="M9 8h6M9 12h6M9 16h4"></path></svg>',
      settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M19.1 4.9l-2.8 2.8M7.7 16.3l-2.8 2.8"></path></svg>',
      support: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v11H9l-4 4V5z"></path><path d="M8 9h8M8 12h5"></path></svg>',
      location: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6 7-12a7 7 0 0 0-14 0c0 6 7 12 7 12z"></path><circle cx="12" cy="9" r="2"></circle></svg>',
      tag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12V5h7l9 9-7 7-9-9z"></path><circle cx="8" cy="8" r="1.5"></circle></svg>',
      phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="2" width="8" height="20" rx="2"></rect><path d="M11 18h2"></path></svg>',
      laptop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="14" height="10" rx="1"></rect><path d="M3 20h18l-2-4H5l-2 4z"></path></svg>',
      tv: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="12" rx="2"></rect><path d="M9 21h6M12 17v4"></path></svg>',
      camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h4l2-3h4l2 3h4v11H4z"></path><circle cx="12" cy="13.5" r="3.5"></circle></svg>',
      printer: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8V3h10v5"></path><rect x="5" y="13" width="14" height="8"></rect><path d="M6 8h12a3 3 0 0 1 3 3v5h-2M5 16H3v-5a3 3 0 0 1 3-3"></path></svg>',
      game: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 16l-3 3M5.5 17.5l3 3M15 18h.1M18 15h.1"></path><path d="M7 11h10a4 4 0 0 1 4 4v1a3 3 0 0 1-5.2 2L14 16h-4l-1.8 2A3 3 0 0 1 3 16v-1a4 4 0 0 1 4-4z"></path></svg>',
      power: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L5 14h6l-1 8 8-12h-6l1-8z"></path></svg>',
      headphones: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 14a8 8 0 0 1 16 0"></path><rect x="3" y="13" width="4" height="7" rx="2"></rect><rect x="17" y="13" width="4" height="7" rx="2"></rect></svg>',
      shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3z"></path></svg>',
      storage: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6c0-2 14-2 14 0v12c0 2-14 2-14 0V6z"></path><path d="M5 6c0 2 14 2 14 0M5 12c0 2 14 2 14 0"></path></svg>',
      router: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="13" width="16" height="7" rx="2"></rect><path d="M8 10a6 6 0 0 1 8 0M6 7a9 9 0 0 1 12 0M8 17h.1M12 17h.1"></path></svg>',
      speaker: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9v6h4l6 5V4L9 9H5z"></path><path d="M18 9a5 5 0 0 1 0 6"></path></svg>',
      shirt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4l4 2 4-2 4 4-3 3v9H7v-9L4 8l4-4z"></path></svg>',
      dress: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3h4l1 5 4 12H5L9 8l1-5z"></path><path d="M9 8h6"></path></svg>',
      jeans: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8l1 18h-4l-1-10-1 10H7L8 3z"></path><path d="M8 8h8"></path></svg>',
      shoes: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 15c4 0 6-2 8-6l3 5h4a2 2 0 0 1 2 2v2H4v-3z"></path></svg>',
      bag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8h12l1 13H5L6 8z"></path><path d="M9 8a3 3 0 0 1 6 0"></path></svg>',
      baby: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"></circle><path d="M5 21c1.5-5 12.5-5 14 0"></path></svg>',
      jewelry: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12l3 6-9 12L3 9l3-6z"></path><path d="M3 9h18M9 3l3 6 3-6"></path></svg>',
      watch: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="6" width="8" height="12" rx="4"></rect><path d="M9 2h6l1 4H8l1-4zM8 18h8l-1 4H9l-1-4z"></path></svg>',
      beauty: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 14h8v7H8zM10 3h4v11h-4z"></path><path d="M9 7h6"></path></svg>',
      kitchen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3v18M10 3v18M6 8h4M15 3v8a3 3 0 0 0 3 3v7"></path></svg>',
      furniture: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16v7H4zM7 12V7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v5"></path></svg>',
      bed: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11V5h6a3 3 0 0 1 3 3v3"></path><path d="M4 11h16a2 2 0 0 1 2 2v6M4 19v-8M22 19H4"></path></svg>',
      chair: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 12V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v7"></path><path d="M5 12h14v5H5zM7 17v4M17 17v4"></path></svg>',
      cleaning: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 21h10l-1-8H8l-1 8z"></path><path d="M12 3v10M9 6h6"></path></svg>',
      light: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 22h4"></path><path d="M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 4H9c0-2 0-3-1-4z"></path></svg>',
      shop: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h16l-2-6H6l-2 6zM6 10v10h12V10"></path><path d="M9 20v-6h6v6"></path></svg>',
      cake: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11h10a3 3 0 0 1 3 3v6H4v-6a3 3 0 0 1 3-3z"></path><path d="M8 11V8m4 3V7m4 4V8"></path><path d="M5 15c2 1 3 1 5 0s3-1 5 0 3 1 5 0"></path><path d="M8 6h.1M12 5h.1M16 6h.1"></path></svg>',
      gift: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h16v11H4zM3 6h18v4H3zM12 6v15"></path><path d="M12 6c-3 0-5-1-5-3 3 0 5 1 5 3zm0 0c3 0 5-1 5-3-3 0-5 1-5 3z"></path></svg>'
    };
    return icons[type] || icons.shop;
  }

  function iconFor(name, context) {
    var label = String(name || '').toLowerCase();
    var text = (label + ' ' + String(context || '').toLowerCase()).replace(/&/g, ' and ');
    var rules = [
      [/birthday cake|wedding cake|custom cake|cake|bakery|cupcake|bento|pastry|dessert|fondant/, 'cake'],
      [/candle|topper|gift packaging|cake box/, 'gift'],
      [/sale|discount|offer|promo|holiday/, 'tag'],
      [/phone cases?|covers?|screen protectors?|holders?/, 'shield'],
      [/chargers?|cables?|type-c|power banks?|extension cords?|solar|inverters?|ups|batter(y|ies)|generators?|stabilizers?|power strips?/, 'power'],
      [/earphones?|earbuds?|headphones?|headsets?|audio/, 'headphones'],
      [/speakers?|soundbars?|home theaters?|microphones?/, 'speaker'],
      [/iphone|samsung|galaxy|tecno|infinix|redmi|xiaomi|itel|feature phones?|used phones?|smart\s*phones?|mobile phones?|\bphones?\b/, 'phone'],
      [/selfie|memory cards?|sim adapters?|digital cameras?|tripods?|ring lights?|studio lights?/, 'camera'],
      [/laptop bags?|travel bags?|wallets?|purses?|handbags?|shoulder bags?|crossbody|tote|clutch|backpacks?|school bags?|\bbags?\b/, 'bag'],
      [/laptop chargers?/, 'power'],
      [/hard drives?|ssd|flash disks?|ram|storage drive|external hard/, 'storage'],
      [/keyboards?|mouse|stands?|webcams?|peripherals/, 'laptop'],
      [/laptops?|desktop computers?|computers?|pc\b|monitors?|cooling pads?/, 'laptop'],
      [/printers?|scanners?|inkjet|laser|all-in-one|ink|toner|barcode|pos|cash registers?|laminating|binding|shredders?/, 'printer'],
      [/smart tv|led tv|android tv|\btvs?\b|tv boxes?|receivers?|remotes?|television/, 'tv'],
      [/projectors?|projector screens?/, 'tv'],
      [/cctv|ip cameras?|wi-?fi cameras?|security|dvr|nvr|door cameras?|video doorbells?|alarm systems?|dash cameras?/, 'camera'],
      [/routers?|modems?|wi-?fi|ethernet|network switches?|extenders?|access points?|fiber/, 'router'],
      [/gaming|playstation|xbox|controllers?|consoles?|game cds?|gaming chairs?/, 'game'],
      [/jeans?|denim|trousers?|pants?|leggings|cargo|wide-leg|skinny|high-waist|slim-fit|regular jeans|bottoms?/, 'jeans'],
      [/sneakers?|sports shoes?|shoes?|heels?|sandals?|slippers?|boots?|traditional shoes?/, 'shoes'],
      [/dresses?|habesha|kemis|skirts?|jumpsuits?|two-piece|maternity|plus-size|women.?s clothing|fashion|boutique/, 'dress'],
      [/shirts?|t-shirts?|tshirt|tee\b|polo|crop tops?|tank tops?|bodysuits?|blouses?/, 'shirt'],
      [/hoodies?|sweatshirts?|sweaters?|cardigans?|jackets?|coats?|blazers?|suits?|vests?|tracksuits?|outerwear|knitwear|gym wear|shorts?/, 'shirt'],
      [/baby|newborn|kids?|boys|girls|school clothes?|pajamas?|toy/, 'baby'],
      [/watches?/, 'watch'],
      [/jewelry|earrings?|necklaces?|bracelets?|rings?|anklets?|brooches?|accessor|belts?|ties?|bow ties?|sunglasses?|scarves?|hats?|caps?|socks?/, 'jewelry'],
      [/sofas?|living room|recliners?|ottomans?/, 'furniture'],
      [/beds?|mattresses?|bedroom|cribs?|bunk beds?/, 'bed'],
      [/chairs?|stools?|ergonomic|visitor chairs?/, 'chair'],
      [/desks?|workstations?|office furniture|filing|conference|reception/, 'chair'],
      [/dining|tables?|coffee tables?|side tables?|console|tv stands?|cabinets?|wardrobes?|drawers?|bookshelves?|shelves?|racks?|storage furniture/, 'furniture'],
      [/garden|outdoor|patio|balcony|benches?|shades?/, 'furniture'],
      [/wood|mdf|metal|plastic|leather|fabric|custom-made|furniture/, 'furniture'],
      [/foundation|concealer|powder|blush|makeup|eyeshadow|eyeliner|mascara|lipstick|lip gloss|nail|brushes?|palettes?|beauty blenders?/, 'beauty'],
      [/skincare|cleanser|wash|cream|moisturizer|sunscreen|toner|serums?|retinol|acne|anti-aging|masks?|lotion|lip balm/, 'beauty'],
      [/hair|wigs?|extensions?|braiding|crochet|shampoo|conditioner|gel|spray|dye|salon|barber|clippers?|dryers?|straighteners?|shavers?|trimmers?/, 'beauty'],
      [/perfumes?|fragrances?|deodorant|body spray|roll-on|oils?/, 'beauty'],
      [/soap|body wash|toothpaste|toothbrush|mouthwash|razors?|shaving|personal care|hygiene|cotton|feminine/, 'beauty'],
      [/blenders?|juicers?|processors?|mixers?|kettles?|coffee|toasters?|sandwich|rice cookers?|pressure cookers?|air fryers?|microwaves?|ovens?|stoves?|mitad|grinders?|choppers?|kitchen appliances?/, 'kitchen'],
      [/refrigerators?|freezers?|washing machines?|dryers?|dishwashers?|dispensers?|standing cookers?|large appliances?/, 'kitchen'],
      [/vacuum|steam cleaners?|irons?|fans?|air coolers?|air conditioners?|heaters?|humidifiers?|home appliances?/, 'cleaning'],
      [/pots?|pans?|cookware|plates?|bowls?|cups?|glasses?|mugs?|spoons?|forks?|knives?|cutlery|trays?|flasks?|bottles?|lunch boxes?|containers?|kitchenware|tableware/, 'kitchen'],
      [/jebena|coffee cups?|rekebot|sini|injera|mesob|clay|berbere|spice|ethiopian kitchen/, 'kitchen'],
      [/mops?|brooms?|buckets?|dustbins?|cleaning|dish racks?|laundry|detergent|gloves?|floor wipers?/, 'cleaning'],
      [/storage boxes?|plastic drawers?|hangers?|wall hooks?|organizers?|home organization/, 'storage'],
      [/bedsheets?|blankets?|comforters?|duvets?|pillows?|towels?|curtains?|carpets?|rugs?|textile|bedding/, 'bed'],
      [/bulbs?|ceiling lights?|wall lights?|chandeliers?|desk lamps?|night lights?|lamps?|lighting/, 'light'],
      [/men.?s clothing|men\b/, 'shirt'],
      [/women\b|clothing/, 'dress'],
      [/electronics?/, 'phone'],
      [/home|kitchen/, 'kitchen']
    ];
    var match = rules.find(function (item) { return item[0].test(text); });
    if (match) return svgIcon(match[1]);
    return svgIcon('shop');
  }

  function tileIconHtml(tile) {
    if (tile && tile.iconImageUrl) {
      return '<img src="' + esc(tile.iconImageUrl) + '" alt="' + esc(tile.name || 'Category') + '" loading="lazy">';
    }
    return iconFor(tile && tile.name, tile && tile.category);
  }

  function greetingText() {
    var hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }

  function shopperTiles() {
    var map = new Map();
    state.categories.forEach(function (category) {
      (category.subcategories || []).forEach(function (sub) {
        if (!sub || !sub.name || !sub.count) return;
        map.set(sub.name, {
          name: sub.name,
          count: sub.count || 0,
          category: category.name,
          subcategory: sub.name,
          iconImageUrl: sub.iconImageUrl || category.iconImageUrl || ''
        });
      });
    });
    var tiles = Array.from(map.values()).sort(function (a, b) { return b.count - a.count || a.name.localeCompare(b.name); });
    if (tiles.length < 4) {
      tiles = state.categories.map(function (category) {
        return { name: category.name, count: category.count || 0, category: category.name, subcategory: 'All', iconImageUrl: category.iconImageUrl || '' };
      });
    }
    var discounted = state.products.filter(function (product) { return percentOff(product) > 0; }).length;
    if (discounted) tiles.push({ name: 'Sale', count: discounted, category: 'All', subcategory: 'All', sale: true });
    return tiles.slice(0, 10);
  }

  function latestOrder() {
    return recentOrders()[0] || null;
  }

  function renderAppHeader() {
    if (state.view === 'catalog' && !state.selectedProduct && !state.orderResult) return '';
    var shop = state.shop || {};
    var logo = shop.logoUrl
      ? '<img class="mini-logo" src="' + esc(shop.logoUrl) + '" alt="' + esc(shop.businessName || 'Shop') + ' logo">'
      : '<div class="mini-logo">' + esc(initials(shop.businessName)) + '</div>';
    var telegram = botUrl();
    var showTelegram = telegram && !isTelegramOpen();
    return '<header class="app-header">' +
      '<div class="header-main">' +
        '<button class="brand-button" type="button" data-view="catalog">' + logo + '<span><b>' + esc(shop.businessName || 'Shop') + '</b><small>Online shop</small></span></button>' +
        '<div class="header-icons">' +
          '<button class="icon-btn" type="button" data-toggle-search title="Search" aria-label="Search shop">' + svgIcon('search') + '<span class="desktop-action-label">Search</span></button>' +
          '<button class="icon-btn" type="button" data-view="track" title="My orders" aria-label="View my orders">' + svgIcon('orders') + '<span class="desktop-action-label">Orders</span></button>' +
          '<button class="icon-btn" type="button" data-view="account" title="My account" aria-label="View my account">' + svgIcon('user') + '<span class="desktop-action-label">Account</span></button>' +
        '</div>' +
      '</div>' +
      (state.searchOpen ? '<div class="search-drawer"><input id="search-input" value="' + esc(state.query) + '" placeholder="Search name, code, color, size"><button class="bot-link" type="button" data-search-submit>Search</button></div>' : '') +
    '</header>';
  }

  function renderHomeIntro() {
    var shop = state.shop || {};
    var addressLine = shortText(shop.addressLine || shop.address || '', 56);
    var map = shop.mapUrl || mapsUrl(shop.addressLine || shop.address || '');
    var logo = shop.logoUrl
      ? '<img class="mini-logo" src="' + esc(shop.logoUrl) + '" alt="' + esc(shop.businessName || 'Shop') + ' logo">'
      : '<div class="mini-logo">' + esc(initials(shop.businessName)) + '</div>';
    var telegram = botUrl();
    var showTelegram = telegram && !isTelegramOpen();
    return '<section class="commerce-hero">' +
      '<div class="home-brand-row">' +
        '<button class="brand-button" type="button" data-view="catalog">' + logo + '<span><b>' + esc(shop.businessName || 'Shop') + '</b><small>Online shop</small></span></button>' +
        (addressLine ? '<a class="branch-chip" href="' + esc(map) + '" target="_blank" rel="noopener" title="' + esc(shop.addressLine || addressLine) + '">' + svgIcon('location') + ' <span>' + esc(addressLine) + '</span></a>' : '') +
        '<div class="header-icons">' +
          '<button class="icon-btn" type="button" data-toggle-search title="Search" aria-label="Search shop">' + svgIcon('search') + '<span class="desktop-action-label">Search</span></button>' +
          '<button class="icon-btn" type="button" data-view="track" title="My orders" aria-label="View my orders">' + svgIcon('orders') + '<span class="desktop-action-label">Orders</span></button>' +
          '<button class="icon-btn" type="button" data-view="account" title="My account" aria-label="View my account">' + svgIcon('user') + '<span class="desktop-action-label">Account</span></button>' +
        '</div>' +
      '</div>' +
      (state.searchOpen ? '<div class="search-drawer home-drawer"><input id="search-input" value="' + esc(state.query) + '" placeholder="Search name, code, color, size"><button class="bot-link" type="button" data-search-submit>Search</button></div>' : '') +
      (showTelegram ? '<a class="telegram-soft" href="' + esc(telegram) + '" target="_blank" rel="noopener">For faster support, open with Telegram</a>' : '') +
    '</section>';
  }

  function renderCategoryScroller() {
    var tiles = shopperTiles();
    if (!tiles.length) return '';
    return '<section class="category-browse"><div class="section-title compact"><h2>Browse by Category</h2></div><div class="category-strip">' + tiles.map(function (tile) {
      var active = tile.sale ? false : (state.category === tile.category && state.subcategory === tile.subcategory);
      return '<button class="category-tile ' + (active ? 'active' : '') + '" type="button" data-tile-category="' + esc(tile.category) + '" data-tile-subcategory="' + esc(tile.subcategory) + '" data-tile-sale="' + (tile.sale ? '1' : '') + '">' +
        '<span class="tile-icon">' + tileIconHtml(tile) + '</span><b>' + esc(shortText(tile.name, 18)) + '</b>' +
      '</button>';
    }).join('') + '</div></section>';
  }

  function renderSubcategoryChips() {
    var subcategories = subcategoriesForSelectedCategory();
    if (!subcategories.length) return '';
    return '<nav class="chips subchips"><button class="subchip ' + (state.subcategory === 'All' ? 'active' : '') + '" data-subcategory="All">All</button>' + subcategories.map(function (item) {
        return '<button class="subchip ' + (state.subcategory === item.name ? 'active' : '') + '" data-subcategory="' + esc(item.name) + '">' + esc(item.name) + ' <small>' + esc(item.count || 0) + '</small></button>';
      }).join('') + '</nav>';
  }

  function renderPromoBanner() {
    var discounted = state.products.filter(function (product) { return percentOff(product) > 0; });
    var best = discounted.sort(function (a, b) { return percentOff(b) - percentOff(a); })[0];
    if (!best) return '';
    return '<button class="promo-banner" type="button" data-product-id="' + esc(best.id) + '">' +
      '<span class="promo-icon">' + svgIcon('tag') + '</span><span><small>Special offer</small><b>' + percentOff(best) + '% off</b><em>' + esc(shortText(best.name, 32)) + '</em></span><strong>Shop Now</strong>' +
    '</button>';
  }

  function renderBottomNav() {
    return '<nav class="bottom-nav" aria-label="Shop navigation">' +
      '<button class="' + activeClass('catalog') + '" type="button" data-view="catalog"><span>' + svgIcon('home') + '</span><b>Home</b></button>' +
      '<button class="' + activeClass('support') + '" type="button" data-view="support"><span>' + svgIcon('support') + '</span><b>Support</b></button>' +
      '<button class="' + activeClass('track') + '" type="button" data-view="track"><span>' + svgIcon('orders') + '</span><b>Orders</b></button>' +
      '<button class="' + activeClass('account') + '" type="button" data-view="account"><span>' + svgIcon('user') + '</span><b>Profile</b></button>' +
    '</nav>';
  }

  function renderTrustFooter(hasBottomNav, hasStickyBuy) {
    var shop = state.shop || {};
    var telegram = botUrl();
    var map = shop.mapUrl || mapsUrl(shop.addressLine || '');
    var phone = String(shop.contactPhone || '').trim();
    var businessName = shop.businessName || 'Online shop';
    var year = new Date().getFullYear();
    var links = [
      map ? '<a href="' + esc(map) + '" target="_blank" rel="noopener">' + svgIcon('location') + '<span>Find us</span></a>' : '',
      telegram ? '<a href="' + esc(telegram) + '" target="_blank" rel="noopener">' + svgIcon('shop') + '<span>Telegram</span></a>' : '',
      phone ? '<a href="tel:' + esc(phone.replace(/[^\d+]/g, '')) + '">' + svgIcon('phone') + '<span>Call us</span></a>' : ''
    ].filter(Boolean).join('');
    var footerClass = hasBottomNav ? 'has-bottom-nav' : (hasStickyBuy ? 'has-sticky-buy' : '');
    return '<footer class="storefront-footer ' + footerClass + '">' +
      '<div class="footer-main"><div class="footer-brand"><small class="footer-kicker">About us</small><b>' + esc(businessName) + '</b><p>' +
          esc(shortText(shop.summary || shop.firstTimeWelcomeMessage || 'Browse, order, and follow your purchase from this shop.', 180)) +
        '</p>' + (shop.addressLine ? '<small class="footer-address">' + svgIcon('location') + esc(shop.addressLine) + '</small>' : '') + '</div>' +
        (links ? '<nav class="footer-links" aria-label="Shop contact links">' + links + '</nav>' : '') +
      '</div>' +
      '<div class="footer-bottom"><span>&copy; ' + year + ' ' + esc(businessName) + '. All rights reserved.</span><a href="https://sprintsales.net/" target="_blank" rel="noopener">Powered by <b>SprintSales</b></a></div>' +
    '</footer>';
  }

  function renderCheckoutProgress(step) {
    var steps = [
      { key: 'details', label: 'Details' },
      { key: 'payment', label: 'Payment' },
      { key: 'confirmed', label: 'Confirmed' }
    ];
    var activeIndex = Math.max(0, steps.findIndex(function (item) { return item.key === step; }));
    return '<ol class="checkout-progress" aria-label="Checkout progress">' + steps.map(function (item, index) {
      var status = index < activeIndex ? 'complete' : (index === activeIndex ? 'active' : '');
      return '<li class="' + status + '" ' + (index === activeIndex ? 'aria-current="step"' : '') + '><span>' + (index < activeIndex ? '&#10003;' : (index + 1)) + '</span><b>' + item.label + '</b></li>';
    }).join('') + '</ol>';
  }

  function featuredProducts() {
    return state.products
      .filter(function (product) { return product.featured === true; })
      .slice()
      .sort(function (a, b) { return ((b.images || []).length) - ((a.images || []).length); })
      .slice(0, 10);
  }

  function shouldShowFeaturedRail() {
    return !state.query && state.category === 'All' && state.subcategory === 'All' && !state.saleOnly && featuredProducts().length > 0;
  }

  function renderCakeFeaturedHero(products) {
    var cakeFeatures = products.slice(0, 6);
    var activeIndex = Math.max(0, Math.min(Number(state.cakeFeaturedIndex || 0), cakeFeatures.length - 1));
    return '<section class="cake-featured-section">' +
      '<div class="section-title compact"><h2>Featured cakes</h2>' + (cakeFeatures.length > 1 ? '<span class="count" data-cake-feature-count>' + (activeIndex + 1) + ' / ' + cakeFeatures.length + '</span>' : '<span class="count">Fresh pick</span>') + '</div>' +
      '<div class="cake-feature-hero" data-cake-feature-carousel>' +
        cakeFeatures.map(function (product, index) {
          var image = (product.images || [])[0] || '';
          return '<button class="cake-feature-card hero cake-feature-slide ' + (index === activeIndex ? 'active' : '') + '" type="button" data-cake-feature-slide="' + index + '" data-product-id="' + esc(product.id) + '">' +
            (image ? '<img src="' + esc(image) + '" alt="' + esc(product.name) + '" loading="lazy">' : '<span class="featured-empty">' + esc(initials(product.name)) + '</span>') +
            '<span class="cake-feature-copy"><b>' + esc(shortText(product.name, 54)) + '</b><em>' + esc(money(product.price)) + '</em><strong>View & order</strong></span>' +
          '</button>';
        }).join('') +
        (cakeFeatures.length > 1 ? '<button class="cake-hero-nav prev" type="button" data-cake-feature-prev aria-label="Previous featured cake">‹</button><button class="cake-hero-nav next" type="button" data-cake-feature-next aria-label="Next featured cake">›</button>' : '') +
      '</div>' +
      (cakeFeatures.length > 1 ? '<div class="cake-feature-dots">' + cakeFeatures.map(function (_item, index) {
        return '<button type="button" class="' + (index === activeIndex ? 'active' : '') + '" data-cake-feature-dot="' + index + '" aria-label="Show featured cake ' + (index + 1) + '"></button>';
      }).join('') + '</div>' : '') +
    '</section>';
  }

  function renderFeaturedRail() {
    var products = featuredProducts();
    if (!shouldShowFeaturedRail()) return '';
    if (isCakeShop()) return renderCakeFeaturedHero(products);
    if (isCakeShop()) {
      return '<section class="cake-featured-section">' +
        '<div class="section-title compact"><h2>Featured cakes</h2><div class="cake-carousel-controls">' +
          (products.length > 1 ? '<button type="button" data-cake-feature-prev aria-label="Previous featured cake">‹</button><button type="button" data-cake-feature-pause>' + (state.cakeFeaturedPaused ? 'Play' : 'Pause') + '</button><button type="button" data-cake-feature-next aria-label="Next featured cake">›</button>' : '<span class="count">Fresh pick</span>') +
        '</div></div>' +
        '<div class="cake-featured-carousel" data-cake-feature-carousel><div class="cake-featured-track">' + products.slice(0, 6).map(function (product, index) {
          var image = (product.images || [])[0] || '';
          return '<button class="cake-feature-card ' + (index === 0 ? 'hero' : '') + '" type="button" data-product-id="' + esc(product.id) + '">' +
            (image ? '<img src="' + esc(image) + '" alt="' + esc(product.name) + '" loading="lazy">' : '<span class="featured-empty">' + esc(initials(product.name)) + '</span>') +
            '<span class="cake-feature-copy"><small>Featured cake</small><b>' + esc(shortText(product.name, 48)) + '</b><em>' + esc(money(product.price)) + '</em></span>' +
          '</button>';
        }).join('') + '</div></div></section>';
    }
    if (isEditorialTemplate()) {
      return '<section class="editorial-featured-section">' +
        '<div class="editorial-featured-rail">' + products.slice(0, 6).map(function (product, index) {
          var image = (product.images || [])[0] || '';
          var label = index === 0 ? 'Featured collection' : 'Selected for you';
          return '<button class="editorial-feature-card" type="button" data-product-id="' + esc(product.id) + '">' +
            (image ? '<img src="' + esc(image) + '" alt="' + esc(product.name) + '" loading="' + (index === 0 ? 'eager' : 'lazy') + '">' : '<span class="featured-empty">' + esc(initials(product.name)) + '</span>') +
            '<span class="editorial-feature-shade"></span>' +
            '<span class="editorial-feature-copy"><small>' + label + '</small><b>' + esc(shortText(product.name, 52)) + '</b><em>' + esc(money(product.price)) + '</em><strong>Explore</strong></span>' +
          '</button>';
        }).join('') + '</div>' +
        (products.length > 1 ? '<div class="editorial-feature-dots">' + products.slice(0, 6).map(function (_product, index) {
          return '<button type="button" class="' + (index === Number(state.editorialFeaturedIndex || 0) ? 'active' : '') + '" data-editorial-feature-dot="' + index + '" aria-label="Show featured product ' + (index + 1) + '"></button>';
        }).join('') + '</div>' : '') +
      '</section>';
    }
    return '<section class="featured-section">' +
      '<div class="section-title compact"><h2>Featured picks</h2><span class="count">Swipe sideways</span></div>' +
      '<div class="featured-rail">' + products.map(function (product) {
        var image = (product.images || [])[0] || '';
        return '<button class="featured-card" type="button" data-product-id="' + esc(product.id) + '">' +
          (image ? '<img src="' + esc(image) + '" alt="' + esc(product.name) + '" loading="lazy">' : '<span class="featured-empty">' + esc(initials(product.name)) + '</span>') +
          '<span class="featured-copy"><b>' + esc(shortText(product.name, 34)) + '</b><small>' + esc(money(product.price)) + '</small></span>' +
          '</button>';
      }).join('') + '</div></section>';
  }

  function renderProduct(product) {
    var images = product.images || [];
    var cake = isCakeProduct(product);
    var photo = images[0]
      ? '<img src="' + esc(images[0]) + '" alt="' + esc(product.name) + '" loading="lazy">'
      : '<div class="photo-placeholder">No Image</div>';
    return '<article class="product-card compact-product ' + (cake ? 'cake-product-card' : '') + '">' +
      '<button class="photo-wrap card-open" type="button" data-product-id="' + esc(product.id) + '" aria-label="View ' + esc(product.name) + '">' + photo + (images.length > 1 ? '<span class="image-count">' + images.length + '</span>' : '') + '</button>' +
      '<button class="product-body product-action" type="button" data-product-id="' + esc(product.id) + '">' +
        '<h3 class="product-name">' + esc(shortText(product.name, cake ? 56 : 28)) + '</h3>' +
        '<p class="card-desc">' + esc(shortText(product.description || product.subcategory || product.category || 'Available now', cake ? 118 : 74)) + '</p>' +
        '<div class="price-row"><span class="price">' + esc(money(product.price)) + '</span><span class="add-dot">+</span></div>' +
      '</button></article>';
  }

  function renderToolbar(products) {
    var source = catalogProductsBeforeOptionFilters();
    var sizes = uniqueFilterValues(source.reduce(function (all, product) {
      return all.concat(productFilterValues(product, 'size'));
    }, []));
    var colors = uniqueFilterValues(source.reduce(function (all, product) {
      return all.concat(productFilterValues(product, 'color'));
    }, []));
    var hasFilters = Boolean(state.filterSize || state.filterColor);
    var select = function (id, label, selected, values) {
      if (values.length < 2 && !selected) return '';
      return '<label class="catalog-filter"><span>' + label + '</span><select id="' + id + '">' +
        '<option value="">All ' + label.toLowerCase() + 's</option>' +
        values.map(function (value) {
          return '<option value="' + esc(value) + '" ' + (selected === value ? 'selected' : '') + '>' + esc(value) + '</option>';
        }).join('') +
      '</select></label>';
    };
    return '<section class="catalog-toolbar" aria-label="Sort and filter items">' +
      '<div class="catalog-result-count"><b>' + esc(products.length) + '</b><span>item' + (products.length === 1 ? '' : 's') + '</span></div>' +
      '<div class="catalog-filter-controls">' +
        '<label class="catalog-filter"><span>Sort</span><select id="sort-select">' +
          '<option value="featured" ' + (state.sort === 'featured' ? 'selected' : '') + '>Recommended</option>' +
          '<option value="newest" ' + (state.sort === 'newest' ? 'selected' : '') + '>Newest</option>' +
          '<option value="price-low" ' + (state.sort === 'price-low' ? 'selected' : '') + '>Cheapest</option>' +
          '<option value="price-high" ' + (state.sort === 'price-high' ? 'selected' : '') + '>Most expensive</option>' +
          '<option value="name" ' + (state.sort === 'name' ? 'selected' : '') + '>Name</option>' +
        '</select></label>' +
        select('size-filter', 'Size', state.filterSize, sizes) +
        select('color-filter', 'Color', state.filterColor, colors) +
        (hasFilters ? '<button class="clear-catalog-filters" type="button" data-clear-option-filters>Clear</button>' : '') +
      '</div>' +
    '</section>';
  }

  function renderCatalogBody() {
    var products = visibleProducts();
    var featuredIds = new Set(featuredProducts().map(function (product) { return String(product.id); }));
    var separateFeatured = shouldShowFeaturedRail();
    var gridProducts = separateFeatured
      ? products.filter(function (product) { return !featuredIds.has(String(product.id)); })
      : products;
    var productGrid = gridProducts.length
      ? '<section class="grid">' + gridProducts.map(renderProduct).join('') + '</section>'
      : (separateFeatured ? '' : '<section class="empty-box"><strong>No items found</strong><p>Try another category or search term.</p></section>');
    var order = latestOrder();
    var orderCard = order ? '<button class="mini-order-card" type="button" data-view="track"><span>&#128722;</span><b>My Order<br><small>' + esc(order.trackingCode || order.productName || 'Recent order') + '</small></b><em>' + esc(statusLabel(order.paymentStatus || order.status)) + '</em></button>' : '';
    var title = state.query ? 'Search Results' : (state.category === 'All' ? (separateFeatured ? 'All Items' : 'Popular Items') : esc(state.category));
    var gridTitle = (separateFeatured && !gridProducts.length)
      ? ''
      : '<section class="commerce-section-title"><h2>' + title + '</h2><button type="button" data-clear-filters>See all</button></section>';
    return '<main class="screen catalog-screen commerce-home">' +
      renderHomeIntro() +
      renderFeaturedRail() +
      renderCategoryScroller() +
      renderPromoBanner() +
      renderSubcategoryChips() +
      gridTitle +
      renderToolbar(products) +
      productGrid +
      orderCard +
    '</main>';
  }

  function optionGroupHtml(group, product) {
    var values = group.values || [];
    if (!values.length) return '';
    var isColorGroup = String(group.field || '').toLowerCase() === 'color' || /colou?r/i.test([group.key, group.label].join(' '));
    if (values.length === 1) {
      var singleColorImage = isColorGroup ? colorImageFor(product, values[0]) : null;
      if (singleColorImage) {
        return '<div class="option-group compact-option"><label>' + esc(group.label) + '</label><div class="option-row color-single-row"><button type="button" class="single-option color-single-photo" data-color-preview="' + esc(values[0]) + '" aria-label="Select ' + esc(values[0]) + ' color"><img src="' + esc(singleColorImage.image) + '" alt="' + esc(values[0]) + ' color"><span class="sr-only">' + esc(values[0]) + '</span></button></div><input type="hidden" name="spec-' + esc(group.key) + '" value="' + esc(values[0]) + '"></div>';
      }
      return '<div class="option-group compact-option"><label>' + esc(group.label) + '</label><div class="single-option">' + esc(values[0]) + '</div><input type="hidden" name="spec-' + esc(group.key) + '" value="' + esc(values[0]) + '"></div>';
    }
    return '<div class="option-group"><label>' + esc(group.label) + '</label><div class="option-row">' + values.map(function (value, index) {
      var id = 'spec-' + group.key + '-' + index;
      var checked = isColorGroup && state.selectedColor && String(value).toLowerCase() === state.selectedColor.toLowerCase();
      var colorImage = isColorGroup ? colorImageFor(product, value) : null;
      var optionContent = colorImage
        ? '<span class="color-photo-swatch"><img src="' + esc(colorImage.image) + '" alt="' + esc(value) + ' color"><span class="sr-only">' + esc(value) + '</span></span>'
        : esc(value);
      return '<label class="option-pill ' + (colorImage ? 'color-photo-option' : '') + '" for="' + esc(id) + '"><input id="' + esc(id) + '" type="radio" name="spec-' + esc(group.key) + '" value="' + esc(value) + '" required' + (isColorGroup ? ' data-color-option="' + esc(value) + '"' : '') + (checked ? ' checked' : '') + '><span>' + optionContent + '</span></label>';
    }).join('') + '</div></div>';
  }

  function quantityControlHtml() {
    return '<div class="quantity-control" aria-label="Quantity">' +
      '<button type="button" class="qty-btn" data-qty="-1">-</button>' +
      '<input id="order-quantity" name="quantity" type="number" min="1" max="99" value="1" required>' +
      '<button type="button" class="qty-btn" data-qty="1">+</button>' +
      '</div>';
  }

  function accountValue(name) {
    return esc((state.account && state.account[name]) || '');
  }

  function renderProductPage(product) {
    if (!product) return '';
    var images = product.images || [];
    var selectedColorImage = state.selectedColor ? colorImageFor(product, state.selectedColor) : null;
    var activeImage = selectedColorImage?.image || images[state.selectedImage] || images[0] || '';
    var specGroups = product.specGroups || [];
    var discount = percentOff(product);
    var telegram = botUrl(product);
    var cakeProduct = isCakeProduct(product);
    var codeBadge = (!cakeProduct && product.code) ? '<span class="detail-code">' + esc(product.code) + '</span>' : '';
    var cakeFields = cakeProduct
      ? '<div class="cake-order-box"><h3>Personalize your cake</h3><label>What should we write on the cake?<textarea name="cakeWritingText" rows="2" placeholder="Example: Happy Birthday Hana"></textarea><small>If you do not want writing on the cake, leave this empty.</small></label><div class="form-grid two"><label>Needed date<input name="cakeNeededDate" type="date"></label><label>Preferred time<input name="cakeNeededTime" type="time"></label></div></div>'
      : '';
    return '<main class="screen detail-screen">' +
      '<button class="back-inline" type="button" id="detail-back">Home</button>' +
      '<section class="detail-hero">' +
        '<div class="detail-gallery">' +
          (activeImage ? '<button class="detail-image-button" type="button" data-open-image="' + esc(activeImage) + '"><img class="detail-image" src="' + esc(activeImage) + '" alt="' + esc(product.name) + '"></button>' : '<div class="detail-image empty-image">No Image</div>') +
          (images.length > 1 ? '<div class="thumb-row">' + images.map(function (url, index) {
            return '<button class="thumb ' + (index === state.selectedImage ? 'active' : '') + '" type="button" data-thumb="' + index + '" aria-label="View ' + esc(product.name) + ' photo ' + (index + 1) + '"><img src="' + esc(url) + '" alt="' + esc(product.name) + ' photo ' + (index + 1) + '"></button>';
          }).join('') + '</div>' : '') +
        '</div>' +
      '</section>' +
      '<section class="detail-card">' +
        '<div class="detail-body">' +
          '<p class="eyebrow">' + esc(product.category || 'Item') + (product.subcategory ? ' / ' + esc(product.subcategory) : '') + '</p>' +
          '<div class="detail-title-row"><h2>' + esc(product.name) + '</h2>' +
            '<div class="detail-title-actions"><button class="share-product-btn" type="button" data-share-product aria-label="Share ' + esc(product.name) + '">' + svgIcon('share') + '<span>Share</span></button>' +
            codeBadge + '</div>' +
          '</div>' +
          '<div class="detail-price-row"><div><strong>' + esc(money(product.price)) + '</strong>' + (moneyNumber(product.compareAtPrice) > moneyNumber(product.price) ? '<del>' + esc(money(product.compareAtPrice)) + '</del>' : '') + '</div>' +
            (discount ? '<span class="detail-offer">' + discount + '% off</span>' : '') +
          '</div>' +
          (product.description ? '<p class="detail-desc">' + esc(product.description) + '</p>' : '') +
          (telegram && !isTelegramOpen() ? '<div class="telegram-nudge"><div><b>For a better experience</b><span>Open this item in Telegram for faster support and saved chat history.</span></div><a href="' + esc(telegram) + '" target="_blank" rel="noopener">Open Telegram</a></div>' : '') +
          renderCheckoutProgress('details') +
          '<div class="order-card-title"><h3>Order this item</h3><p>Your saved account details are filled automatically.</p></div>' +
          '<form id="miniapp-order-form" class="checkout-form">' +
            '<div id="order-form-alert" class="form-alert" hidden></div>' +
            specGroups.map(function (group) { return optionGroupHtml(group, product); }).join('') +
            cakeFields +
            '<div class="form-grid two"><label>Quantity' + quantityControlHtml() + '</label><label>Phone number<input name="phone" inputmode="tel" value="' + accountValue('phone') + '" placeholder="09..." required></label></div>' +
            '<label>Full name<input name="customerName" value="' + accountValue('fullName') + '" placeholder="Your full name" required></label>' +
            '<label>Delivery address<textarea name="address" rows="3" placeholder="Area, building name, nearby landmark, shop name, or house number" required>' + accountValue('address') + '</textarea></label>' +
            '<input type="hidden" name="telegramChatId" value="' + accountValue('telegramChatId') + '"><input type="hidden" name="telegramUserId" value="' + accountValue('telegramUserId') + '"><input type="hidden" name="telegramUsername" value="' + accountValue('telegramUsername') + '"><input type="hidden" name="shopperSessionId" value="' + esc(state.shopperSessionId || '') + '">' +
            '<div class="checkout-summary"><div><span>Item total</span><b id="mini-subtotal">' + esc(money(product.price)) + '</b></div><small>Delivery is calculated after your address is submitted.</small></div>' +
            '<button type="button" class="primary-btn full in-form-order" data-submit-order>Order</button>' +
          '</form>' +
        '</div>' +
      '</section>' +
      '<div class="sticky-buy-bar"><div><span>' + esc(product.name) + '</span><b>' + esc(money(product.price)) + '</b></div><button type="button" class="primary-btn" data-submit-order>Order</button></div>' +
    '</main>';
  }

  function renderOrderResultPage() {
    var result = state.orderResult;
    if (!result || !result.order) return '';
    var order = result.order;
    var payment = result.payment || {};
    var options = payment.options || [];
    var proofResult = state.paymentProofResult || null;
    var paymentComplete = proofResult && proofResult.status === 'verified';
    var depositOrder = String(order.paymentMode || '').toLowerCase() === 'deposit' || moneyNumber(order.paymentBalanceAmount) > 0;
    var paymentOnDelivery = String(order.paymentMode || payment.collectionMode || '').toLowerCase() === 'delivery' || (!payment.ready && moneyNumber(payment.amount) <= 0 && !order.awaitingDeliveryFee);
    return '<main class="screen result-page">' +
      '<section class="result-panel">' +
        renderCheckoutProgress(paymentComplete || paymentOnDelivery ? 'confirmed' : 'payment') +
        '<div class="success-mark">' + (paymentComplete || paymentOnDelivery ? '✓' : 'Pay') + '</div>' +
        '<h2>' + (paymentComplete ? (depositOrder ? 'Kabd received' : 'Payment complete') : (paymentOnDelivery ? 'Order received' : 'Complete your payment')) + '</h2>' +
        '<p class="result-lead">' + (paymentComplete
          ? (depositOrder ? 'Thank you. Your advance payment is confirmed and the shop will prepare your cake. The remaining balance is shown below.' : 'Thank you for your purchase. The shop will prepare your product for delivery and may contact you if more information is needed.')
          : (paymentOnDelivery ? 'Your order details are saved. The shop will prepare your item and collect payment on delivery or pickup.' : 'Your item details are ready. Please pay the total below and submit the SMS/reference so the order can be completed.')) + '</p>' +
        '<div class="summary-list">' +
          '<div><span>Item</span><b>' + esc(order.productName) + '</b></div>' +
          '<div><span>Quantity</span><b>' + esc(order.quantity) + '</b></div>' +
          (order.cakeWritingText ? '<div><span>Cake writing</span><b>' + esc(order.cakeWritingText) + '</b></div>' : '') +
          '<div><span>Delivery</span><b>' + esc(money(order.deliveryFee)) + '</b></div>' +
          '<div><span>Total</span><b>' + esc(money(order.total)) + '</b></div>' +
          (!paymentComplete && payment.amount ? '<div><span>' + esc(paymentDueLabel(payment)) + '</span><b>' + esc(money(payment.amount)) + '</b></div>' : '') +
          (payment.balanceAmount && moneyNumber(payment.balanceAmount) > 0 ? '<div><span>Remaining balance</span><b>' + esc(money(payment.balanceAmount)) + '</b></div>' : '') +
          (paymentComplete ? '<div><span>Tracking code</span><b>' + esc(order.trackingCode || proofResult.trackingCode || '') + '</b></div>' : '') +
        '</div>' +
        (!paymentComplete && payment.note ? '<div class="notice-box success">' + esc(payment.note) + '</div>' : '') +
        (paymentComplete ? '' : (paymentOnDelivery ? '<div class="notice-box success">' + esc(payment.instruction || 'No online payment is required now.') + '</div>' : (payment.ready ? '<h3>Payment options</h3><div class="payment-list">' + options.map(function (option) {
          return '<div class="payment-card"><div><b>' + esc(option.method) + '</b><p>' + esc(option.accountName) + '</p><code>' + esc(option.accountNumber) + '</code></div><button type="button" class="copy-btn" data-copy="' + esc(option.accountNumber) + '">Copy</button></div>';
        }).join('') + '</div><p class="form-note">' + esc(payment.instruction || '') + '</p>' +
        '<form id="payment-proof-form" class="proof-form"><label>Payment SMS or reference<textarea name="proofText" rows="3" placeholder="Paste the transfer SMS or transaction/reference number"></textarea></label><button class="primary-btn full" type="submit">Submit Payment Proof</button></form>' : '<div class="notice-box">' + esc(payment.instruction || 'The shop will confirm delivery before payment.') + '</div>'))) +
        (proofResult ? '<div class="notice-box ' + (paymentComplete ? 'success' : '') + '">' + esc(proofResult.message || '') + (proofResult.reason && !paymentComplete ? '<br><small>' + esc(proofResult.reason) + '</small>' : '') + '</div>' : '') +
        '<div class="result-actions">' +
          (result.botUrl && !isTelegramOpen() ? '<a class="primary-btn full" href="' + esc(result.botUrl) + '" target="_blank" rel="noopener">Continue in Telegram</a>' : '') +
          '<button class="ghost-btn full" type="button" data-back-products>Back to shop</button>' +
        '</div>' +
      '</section>' +
    '</main>';
  }

  function renderTrackPage() {
    var result = state.trackResult;
    return '<main class="screen track-page">' +
      '<section class="result-panel track-panel">' +
        '<h2>Track your order</h2>' +
        '<p class="result-lead">Enter your tracking code. Phone is only needed when this device did not place the order.</p>' +
        '<form id="track-form" class="proof-form">' +
          '<label>Tracking code<input name="trackingCode" placeholder="#12345678 or 12345678" required></label>' +
          '<label>Phone number<input name="phone" inputmode="tel" value="' + accountValue('phone') + '" placeholder="09..."></label>' +
          '<button class="primary-btn full" type="submit">Track Order</button>' +
        '</form>' +
        (state.trackError ? '<div class="notice-box">' + esc(state.trackError) + '</div>' : '') +
        (result ? '<div class="tracking-card">' +
          '<div class="tracking-head"><span>' + esc(result.trackingCode || '') + '</span><b>' + esc(statusLabel(result.status)) + '</b></div>' +
          '<div class="summary-list">' +
            '<div><span>Item</span><b>' + esc(result.productName || 'Item') + '</b></div>' +
            '<div><span>Payment</span><b>' + esc(statusLabel(result.paymentStatus)) + '</b></div>' +
            '<div><span>Delivery</span><b>' + esc(statusLabel(result.deliveryStatus)) + '</b></div>' +
            '<div><span>Total</span><b>' + esc(money(result.total)) + '</b></div>' +
            (result.deliveryArea ? '<div><span>Area</span><b>' + esc(result.deliveryArea) + '</b></div>' : '') +
          '</div>' +
          (result.nextStep ? '<div class="notice-box success">' + esc(result.nextStep) + '</div>' : '') +
        '</div>' : '') +
      '</section>' +
    '</main>';
  }

  function renderAccountPage() {
    var account = state.account || defaultAccount();
    var orders = recentOrders();
    return '<main class="screen account-page">' +
      '<section class="account-card">' +
        '<div class="section-title compact"><h2>My account</h2><span class="count">Saved for this shop</span></div>' +
        '<div class="account-note">Your details and order history are remembered on this device. Inside Telegram, they can also follow your Telegram account.</div>' +
        '<form id="account-form" class="checkout-form">' +
          '<label>Full name<input name="fullName" value="' + esc(account.fullName || '') + '" placeholder="Your full name"></label>' +
          '<label>Phone number<input name="phone" inputmode="tel" value="' + esc(account.phone || '') + '" placeholder="09..."></label>' +
          '<label>Delivery address<textarea name="address" rows="3" placeholder="Area, building, landmark, shop name, house number">' + esc(account.address || '') + '</textarea></label>' +
          '<input type="hidden" name="telegramChatId" value="' + esc(account.telegramChatId || account.telegramUserId || '') + '">' +
          '<input type="hidden" name="telegramUserId" value="' + esc(account.telegramUserId || '') + '">' +
          '<input type="hidden" name="telegramUsername" value="' + esc(account.telegramUsername || '') + '">' +
          '<input type="hidden" name="shopperSessionId" value="' + esc(account.shopperSessionId || state.shopperSessionId || '') + '">' +
          '<button class="primary-btn full" type="submit">Save my details</button>' +
        '</form>' +
      '</section>' +
      '<section class="account-card">' +
        '<div class="section-title compact"><h2>My orders</h2><span class="count">' + esc(orders.length) + ' saved</span></div>' +
        (orders.length ? '<div class="order-history">' + orders.map(function (order) {
          return '<button class="history-row" type="button" data-history-track="' + esc(order.trackingCode || '') + '" data-history-order-id="' + esc(order.id || '') + '" data-history-phone="' + esc(order.phone || account.phone || '') + '" data-history-resume="' + (orderNeedsPayment(order) ? '1' : '0') + '">' +
            (order.productImageUrl ? '<img class="history-thumb" src="' + esc(order.productImageUrl) + '" alt="">' : '<span class="history-thumb empty">' + esc(initials(order.productName || 'Order')) + '</span>') +
            '<span><b>' + esc(order.productName || 'Order') + '</b><small>' + esc(order.trackingCode || '') + ' - ' + esc(money(order.total)) + '</small></span>' +
            '<small class="history-status">' + esc(statusLabel(order.paymentStatus || order.status)) + '</small>' +
            '<em>' + (orderNeedsPayment(order) ? 'Pay' : 'Track') + '</em>' +
          '</button>';
        }).join('') + '</div>' : '<div class="empty-box compact-empty"><strong>No orders saved here yet</strong><p>Orders you place from this shop will appear here automatically.</p></div>') +
      '</section>' +
    '</main>';
  }

  function supportIdentity() {
    var account = state.account || defaultAccount();
    var webApp = window.Telegram && window.Telegram.WebApp;
    return {
      shopperSessionId: state.shopperSessionId || ensureShopperSessionId(),
      fullName: account.fullName || '',
      phone: account.phone || '',
      address: account.address || '',
      telegramChatId: account.telegramChatId || account.telegramUserId || '',
      telegramUserId: account.telegramUserId || '',
      telegramUsername: account.telegramUsername || '',
      telegramInitData: webApp && webApp.initData || ''
    };
  }

  function supportMessagesHtml() {
    if (!state.supportMessages.length) {
      return '<div class="support-welcome">' +
        '<span>' + svgIcon('support') + '</span>' +
        '<div><b>How can I help?</b><p>Ask about an item, price, delivery, payment, discount, or the shop. I will check the shop information first. If I am not sure, the shop team can reply here.</p></div>' +
      '</div>';
    }
    function supportProductCards(message) {
      var products = Array.isArray(message.products) ? message.products : [];
      if (!products.length) return '';
      return '<div class="support-products">' + products.map(function (product) {
        var image = product.images && product.images[0] ? '<img src="' + esc(product.images[0]) + '" alt="' + esc(product.name || 'Product') + '">' : '<span class="support-product-fallback">' + esc(initials(product.name || state.shop && state.shop.businessName || 'Shop')) + '</span>';
        var facts = []
          .concat((product.colors || []).slice(0, 2))
          .concat((product.sizes || []).slice(0, 2))
          .slice(0, 3)
          .map(function (value) { return '<span>' + esc(value) + '</span>'; })
          .join('');
        return '<button class="support-product-card" type="button" data-support-product-id="' + esc(String(product.id || '')) + '">' +
          '<span class="support-product-image">' + image + '</span>' +
          '<span class="support-product-copy">' +
            '<b>' + esc(product.name || 'Product') + '</b>' +
            '<small>' + esc(money(product.price)) + '</small>' +
            (facts ? '<span class="support-product-facts">' + facts + '</span>' : '') +
            '<em>View and order</em>' +
          '</span>' +
        '</button>';
      }).join('') + '</div>';
    }
    return state.supportMessages.map(function (message) {
      var customer = message.direction === 'inbound';
      var teamReply = message.source === 'owner-support-reply';
      return '<article class="support-message ' + (customer ? 'from-shopper' : 'from-shop') + '">' +
        '<small>' + (customer ? 'You' : (teamReply ? 'Shop team' : (state.shop.businessName || 'Shop assistant'))) + '</small>' +
        '<p>' + esc(message.text || '') + '</p>' +
        (!customer ? supportProductCards(message) : '') +
        (message.createdAt ? '<time>' + esc(new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) + '</time>' : '') +
      '</article>';
    }).join('');
  }

  function renderSupportPage() {
    return '<main class="screen support-page">' +
      '<section class="support-card">' +
        '<div class="support-heading"><div><span class="support-heading-icon">' + svgIcon('support') + '</span><div><h2>Talk to support</h2><p>Quick answers from ' + esc(state.shop.businessName || 'the shop') + '</p></div></div>' +
          (state.supportWaitingForTeam ? '<em>Waiting for shop reply</em>' : '<em>Online help</em>') +
        '</div>' +
        '<div id="support-thread" class="support-thread" aria-live="polite">' +
          (state.supportLoaded ? supportMessagesHtml() : '<div class="support-loading">Opening your conversation...</div>') +
        '</div>' +
        (state.supportError ? '<p class="support-error" role="alert">' + esc(state.supportError) + '</p>' : '') +
        '<form id="support-form" class="support-composer">' +
          '<textarea name="message" rows="2" maxlength="700" placeholder="Type your question..." aria-label="Your question" required></textarea>' +
          '<button type="submit" aria-label="Send question"' + (state.supportSending ? ' disabled' : '') + '>' +
            (state.supportSending ? '<span class="support-send-spinner"></span>' : '<span>Send</span>') +
          '</button>' +
        '</form>' +
      '</section>' +
    '</main>';
  }

  function updateSupportThread() {
    var thread = document.getElementById('support-thread');
    if (thread) {
      thread.innerHTML = supportMessagesHtml();
      thread.scrollTop = thread.scrollHeight;
    }
    var headingStatus = document.querySelector('.support-heading > em');
    if (headingStatus) headingStatus.textContent = state.supportWaitingForTeam ? 'Waiting for shop reply' : 'Online help';
    bindSupportProductEvents();
  }

  async function loadSupportMessages(renderAfter) {
    if (!state.shop) return;
    try {
      var params = new URLSearchParams({
        sessionId: state.shopperSessionId || ensureShopperSessionId()
      });
      var response = await fetch('/api/miniapp/shop/' + encodeURIComponent(slugFromPath()) + '/support?' + params.toString(), {
        credentials: 'same-origin',
        cache: 'no-store'
      });
      var result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Support conversation could not be loaded.');
      var oldSignature = state.supportMessages.map(function (item) { return item.id; }).join('|');
      state.supportMessages = result.messages || [];
      state.supportWaitingForTeam = Boolean(result.waitingForTeam);
      state.supportLoaded = true;
      state.supportError = '';
      var newSignature = state.supportMessages.map(function (item) { return item.id; }).join('|');
      if (renderAfter) render();
      else if (state.view === 'support' && oldSignature !== newSignature) updateSupportThread();
    } catch (error) {
      state.supportLoaded = true;
      state.supportError = error.message || 'Support conversation could not be loaded.';
      if (renderAfter) render();
    }
  }

  function stopSupportPolling() {
    if (supportPollTimer) clearInterval(supportPollTimer);
    supportPollTimer = null;
  }

  function startSupportPolling() {
    stopSupportPolling();
    if (state.view !== 'support') return;
    supportPollTimer = setInterval(function () {
      if (state.view === 'support' && !document.hidden) void loadSupportMessages(false);
    }, 10000);
  }

  function bindSupportEvents() {
    var form = document.getElementById('support-form');
    if (!form) return;
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (state.supportSending) return;
      var field = form.elements.message;
      var message = String(field && field.value || '').trim();
      if (message.length < 2) {
        state.supportError = 'Please write your question.';
        render();
        return;
      }
      state.supportSending = true;
      state.supportError = '';
      if (field) field.disabled = true;
      var button = form.querySelector('button[type="submit"]');
      if (button) {
        button.disabled = true;
        button.innerHTML = '<span class="support-send-spinner"></span>';
      }
      try {
        var response = await fetch('/api/miniapp/shop/' + encodeURIComponent(slugFromPath()) + '/support', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(Object.assign(supportIdentity(), { message: message }))
        });
        var result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Your question could not be sent.');
        state.supportMessages = result.messages || state.supportMessages;
        state.supportWaitingForTeam = Boolean(result.waitingForTeam);
        state.supportLoaded = true;
        if (field) field.value = '';
      } catch (error) {
        state.supportError = error.message || 'Your question could not be sent.';
      } finally {
        state.supportSending = false;
        render();
        var nextField = document.querySelector('#support-form textarea');
        if (nextField) nextField.focus();
      }
    });
  }

  function bindSupportProductEvents() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-support-product-id]'), function (button) {
      if (button.dataset.bound) return;
      button.dataset.bound = '1';
      button.addEventListener('click', function () {
        var id = button.getAttribute('data-support-product-id');
        var product = state.products.find(function (item) { return String(item.id) === String(id); }) || null;
        if (product) openProduct(product);
      });
    });
  }

  function statusLabel(value) {
    return String(value || 'pending')
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, function (letter) { return letter.toUpperCase(); });
  }

  function currentBody() {
    if (state.view === 'account') return renderAccountPage();
    if (state.view === 'track') return renderTrackPage();
    if (state.view === 'support') return renderSupportPage();
    if (state.orderResult) return renderOrderResultPage();
    if (state.selectedProduct) return renderProductPage(state.selectedProduct);
    return renderCatalogBody();
  }

  function renderImageViewer() {
    if (!state.imageViewer) return '';
    var zoom = Math.max(1, Math.min(3, Number(state.imageViewer.zoom || 1)));
    return '<div class="image-viewer" role="dialog" aria-modal="true">' +
      '<div class="image-viewer-toolbar"><button type="button" data-image-zoom="-0.25">-</button><b>' + Math.round(zoom * 100) + '%</b><button type="button" data-image-zoom="0.25">+</button><button class="image-viewer-close" type="button" data-close-image>Close</button></div>' +
      '<div class="image-viewer-stage" data-close-image>' +
        '<img style="width:' + Math.round(96 * zoom) + 'vw" src="' + esc(state.imageViewer.url) + '" alt="' + esc(state.imageViewer.alt || 'Product image') + '">' +
      '</div>' +
      '<p>Use + / - or pinch to inspect the product image.</p>' +
    '</div>';
  }

  function render() {
    var shouldShowBottomNav = !state.selectedProduct && !state.orderResult;
    app.innerHTML = renderAppHeader() +
      '<div id="storefront-content" tabindex="-1">' + currentBody() + '</div>' +
      renderTrustFooter(shouldShowBottomNav, Boolean(state.selectedProduct)) +
      (shouldShowBottomNav ? renderBottomNav() : '') +
      renderImageViewer();
    updateDocumentMetadata();
    bindEvents();
  }

  function setView(view, historyMode) {
    stopSupportPolling();
    state.view = view || 'catalog';
    state.selectedProduct = null;
    state.orderResult = null;
    state.paymentProofResult = null;
    state.trackError = '';
    state.trackResult = view === 'track' ? state.trackResult : null;
    if (state.view === 'catalog') {
      state.category = 'All';
      state.subcategory = 'All';
      state.saleOnly = false;
      state.query = '';
      state.searchOpen = false;
      state.filterSize = '';
      state.filterColor = '';
    }
    syncHistory(historyMode);
    render();
    if (state.view === 'support') {
      void loadSupportMessages(true);
      startSupportPolling();
      void trackMiniappEvent('support_open');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function refreshCatalogBody() {
    if (state.selectedProduct || state.orderResult || state.view !== 'catalog') return render();
    var catalog = document.querySelector('.catalog-screen');
    if (!catalog) return render();
    catalog.outerHTML = renderCatalogBody();
    bindSearchBoxEvents();
    bindCatalogEvents();
    bindToolbarEvents();
    bindImageFallbacks();
    startCakeFeaturedCarousel();
  }

  function bindSearchBoxEvents() {
    var search = document.getElementById('search-input');
    if (search && !search.dataset.bound) {
      search.dataset.bound = '1';
      search.addEventListener('input', function () {
        state.query = search.value;
      });
      search.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          state.query = search.value;
          search.blur();
          if (state.query) void trackMiniappEvent('search', { query: state.query });
          syncHistory();
          render();
        }
      });
    }
    var searchSubmit = document.querySelector('[data-search-submit]');
    if (searchSubmit && !searchSubmit.dataset.bound) {
      searchSubmit.dataset.bound = '1';
      searchSubmit.addEventListener('click', function () {
        var currentSearch = document.getElementById('search-input');
        if (currentSearch) {
          state.query = currentSearch.value;
          currentSearch.blur();
        }
        if (state.query) void trackMiniappEvent('search', { query: state.query });
        syncHistory();
        render();
      });
    }
  }

  function bindEvents() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-view]'), function (button) {
      button.addEventListener('click', function () {
        setView(button.getAttribute('data-view') || 'catalog');
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-toggle-search]'), function (searchToggle) {
      searchToggle.addEventListener('click', function () {
        state.searchOpen = !state.searchOpen;
        state.view = 'catalog';
        state.selectedProduct = null;
        state.orderResult = null;
        syncHistory();
        render();
        var search = document.getElementById('search-input');
        if (search) setTimeout(function () { search.focus(); }, 50);
      });
    });
    bindSearchBoxEvents();
    bindCatalogEvents();
    bindToolbarEvents();
    bindDetailEvents();
    bindOrderEvents();
    bindAccountEvents();
    bindSupportEvents();
    bindSupportProductEvents();
    bindImageViewerEvents();
    bindShareEvents();
    bindImageFallbacks();
  }

  function bindShareEvents() {
    var button = document.querySelector('[data-share-product]');
    if (!button || !state.selectedProduct) return;
    button.addEventListener('click', async function () {
      var product = state.selectedProduct;
      var url = new URL(productPath(product), location.origin).toString();
      var shareData = {
        title: product.name + ' | ' + (state.shop.businessName || 'Shop'),
        text: product.name + ' - ' + money(product.price),
        url: url
      };
      try {
        if (navigator.share) {
          await navigator.share(shareData);
        } else {
          await navigator.clipboard.writeText(url);
          button.classList.add('copied');
          button.querySelector('span').textContent = 'Link copied';
          setTimeout(function () {
            if (!button.isConnected) return;
            button.classList.remove('copied');
            button.querySelector('span').textContent = 'Share this item';
          }, 1600);
        }
        void trackMiniappEvent('product_shared', { productId: product.id, productCode: product.code });
      } catch (error) {
        if (error && error.name === 'AbortError') return;
        button.querySelector('span').textContent = 'Copy this link: ' + url;
      }
    });
  }

  function bindImageFallbacks() {
    Array.prototype.forEach.call(document.querySelectorAll('img'), function (image) {
      if (image.dataset.fallbackBound) return;
      image.dataset.fallbackBound = '1';
      var showFallback = function () {
        image.classList.add('is-broken');
        var parent = image.parentElement;
        if (!parent || parent.querySelector('.image-fallback')) return;
        var fallback = document.createElement('span');
        fallback.className = image.classList.contains('mini-logo')
          ? 'image-fallback logo-image-fallback mini-logo'
          : 'image-fallback';
        fallback.setAttribute('aria-hidden', 'true');
        fallback.textContent = initials(image.alt || state.shop && state.shop.businessName || 'Shop');
        parent.insertBefore(fallback, image);
      };
      image.addEventListener('error', showFallback, { once: true });
      if (image.complete && image.naturalWidth === 0) showFallback();
    });
  }

  function bindImageViewerEvents() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-open-image]'), function (button) {
      button.addEventListener('click', function () {
        state.imageViewer = {
          url: button.getAttribute('data-open-image') || '',
          alt: state.selectedProduct ? state.selectedProduct.name : 'Product image',
          zoom: 1
        };
        render();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-image-zoom]'), function (button) {
      button.addEventListener('click', function () {
        if (!state.imageViewer) return;
        var delta = Number(button.getAttribute('data-image-zoom') || 0);
        state.imageViewer.zoom = Math.max(1, Math.min(3, Number(state.imageViewer.zoom || 1) + delta));
        render();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-close-image]'), function (target) {
      target.addEventListener('click', function (event) {
        if (event.target !== target && target.classList.contains('image-viewer-stage')) return;
        state.imageViewer = null;
        render();
      });
    });
    document.onkeydown = function (event) {
      if (event.key === 'Escape' && state.imageViewer) {
        state.imageViewer = null;
        render();
      }
    };
  }

  function bindToolbarEvents() {
    var sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', function () {
        state.sort = sortSelect.value || 'featured';
        refreshCatalogBody();
      });
    }
    var sizeFilter = document.getElementById('size-filter');
    if (sizeFilter) sizeFilter.addEventListener('change', function () {
      state.filterSize = sizeFilter.value || '';
      refreshCatalogBody();
    });
    var colorFilter = document.getElementById('color-filter');
    if (colorFilter) colorFilter.addEventListener('change', function () {
      state.filterColor = colorFilter.value || '';
      refreshCatalogBody();
    });
    var clearFilters = document.querySelector('[data-clear-option-filters]');
    if (clearFilters) clearFilters.addEventListener('click', function () {
      state.filterSize = '';
      state.filterColor = '';
      refreshCatalogBody();
    });
  }

  function bindCatalogEvents() {
    Array.prototype.forEach.call(document.querySelectorAll('.chip'), function (button) {
      button.addEventListener('click', function () {
        state.category = button.getAttribute('data-category') || 'All';
        state.subcategory = 'All';
        state.saleOnly = false;
        state.filterSize = '';
        state.filterColor = '';
        void trackMiniappEvent('category_view', { category: state.category });
        refreshCatalogBody();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-tile-category]'), function (button) {
      button.addEventListener('click', function () {
        state.saleOnly = button.getAttribute('data-tile-sale') === '1';
        state.category = state.saleOnly ? 'All' : (button.getAttribute('data-tile-category') || 'All');
        state.subcategory = state.saleOnly ? 'All' : (button.getAttribute('data-tile-subcategory') || 'All');
        state.query = '';
        state.filterSize = '';
        state.filterColor = '';
        void trackMiniappEvent(state.subcategory !== 'All' ? 'subcategory_view' : 'category_view', {
          category: state.category,
          subcategory: state.subcategory
        });
        refreshCatalogBody();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.subchip'), function (button) {
      button.addEventListener('click', function () {
        state.subcategory = button.getAttribute('data-subcategory') || 'All';
        state.saleOnly = false;
        state.filterSize = '';
        state.filterColor = '';
        void trackMiniappEvent('subcategory_view', { category: state.category, subcategory: state.subcategory });
        refreshCatalogBody();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.product-action, .card-open, .featured-card, .cake-feature-card, .editorial-feature-card, .promo-banner'), function (button) {
      button.addEventListener('click', function () {
        var id = button.getAttribute('data-product-id');
        var product = state.products.find(function (item) { return String(item.id) === String(id); }) || null;
        if (product) {
          void trackMiniappEvent('product_view', {
            productId: product.id,
            productCode: product.code,
            category: product.category,
            subcategory: product.subcategory
          });
        }
        openProduct(product);
      });
    });
    bindCakeFeaturedControls();
    bindEditorialFeaturedCarousel();
    Array.prototype.forEach.call(document.querySelectorAll('[data-clear-filters]'), function (button) {
      button.addEventListener('click', function () {
        state.category = 'All';
        state.subcategory = 'All';
        state.saleOnly = false;
        state.query = '';
        state.searchOpen = false;
        state.filterSize = '';
        state.filterColor = '';
        syncHistory();
        render();
      });
    });
  }

  function setCakeFeaturedIndex(nextIndex) {
    var count = Math.min(featuredProducts().length, 6);
    if (count < 1) return;
    state.cakeFeaturedIndex = ((Number(nextIndex) || 0) % count + count) % count;
    updateCakeFeaturedDom();
  }

  function updateCakeFeaturedDom() {
    var count = Math.min(featuredProducts().length, 6);
    var index = Number(state.cakeFeaturedIndex || 0);
    Array.prototype.forEach.call(document.querySelectorAll('[data-cake-feature-slide]'), function (slide) {
      slide.classList.toggle('active', Number(slide.getAttribute('data-cake-feature-slide') || 0) === index);
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-cake-feature-dot]'), function (dot) {
      dot.classList.toggle('active', Number(dot.getAttribute('data-cake-feature-dot') || 0) === index);
    });
    var countLabel = document.querySelector('[data-cake-feature-count]');
    if (countLabel && count > 1) countLabel.textContent = (index + 1) + ' / ' + count;
  }

  function bindCakeFeaturedControls() {
    var carousel = document.querySelector('[data-cake-feature-carousel]');
    if (!carousel) {
      stopCakeFeaturedCarousel();
      return;
    }
    var startX = 0;
    var prev = document.querySelector('[data-cake-feature-prev]');
    var next = document.querySelector('[data-cake-feature-next]');
    if (prev) prev.addEventListener('click', function (event) {
      event.stopPropagation();
      setCakeFeaturedIndex(Number(state.cakeFeaturedIndex || 0) - 1);
    });
    if (next) next.addEventListener('click', function (event) {
      event.stopPropagation();
      setCakeFeaturedIndex(Number(state.cakeFeaturedIndex || 0) + 1);
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-cake-feature-dot]'), function (dot) {
      dot.addEventListener('click', function (event) {
        event.stopPropagation();
        setCakeFeaturedIndex(Number(dot.getAttribute('data-cake-feature-dot') || 0));
      });
    });
    carousel.addEventListener('touchstart', function (event) {
      startX = event.touches && event.touches[0] ? event.touches[0].clientX : 0;
    }, { passive: true });
    carousel.addEventListener('touchend', function (event) {
      var endX = event.changedTouches && event.changedTouches[0] ? event.changedTouches[0].clientX : startX;
      var delta = endX - startX;
      if (Math.abs(delta) > 42) setCakeFeaturedIndex(Number(state.cakeFeaturedIndex || 0) + (delta < 0 ? 1 : -1));
    }, { passive: true });
    startCakeFeaturedCarousel();
  }

  function stopCakeFeaturedCarousel() {
    if (cakeFeaturedTimer) {
      clearInterval(cakeFeaturedTimer);
      cakeFeaturedTimer = null;
    }
  }

  function startCakeFeaturedCarousel() {
    stopCakeFeaturedCarousel();
    var carousel = document.querySelector('[data-cake-feature-carousel]');
    if (!carousel || Math.min(featuredProducts().length, 6) < 2) return;
    cakeFeaturedTimer = setInterval(function () {
      setCakeFeaturedIndex(Number(state.cakeFeaturedIndex || 0) + 1);
    }, 4200);
  }

  function editorialFeaturedCount() {
    return Math.min(featuredProducts().length, 6);
  }

  function setEditorialFeaturedIndex(nextIndex, smooth) {
    var rail = document.querySelector('.editorial-featured-rail');
    var count = editorialFeaturedCount();
    if (!rail || count < 1) return;
    var index = ((Number(nextIndex) || 0) % count + count) % count;
    state.editorialFeaturedIndex = index;
    rail.scrollTo({
      left: index * rail.clientWidth,
      behavior: smooth === false ? 'auto' : 'smooth'
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-editorial-feature-dot]'), function (dot) {
      dot.classList.toggle('active', Number(dot.getAttribute('data-editorial-feature-dot') || 0) === index);
    });
  }

  function stopEditorialFeaturedCarousel() {
    if (editorialFeaturedTimer) {
      clearInterval(editorialFeaturedTimer);
      editorialFeaturedTimer = null;
    }
  }

  function startEditorialFeaturedCarousel() {
    stopEditorialFeaturedCarousel();
    var rail = document.querySelector('.editorial-featured-rail');
    if (!rail || editorialFeaturedCount() < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    editorialFeaturedTimer = setInterval(function () {
      if (document.hidden) return;
      setEditorialFeaturedIndex(Number(state.editorialFeaturedIndex || 0) + 1, true);
    }, 5200);
  }

  function bindEditorialFeaturedCarousel() {
    var rail = document.querySelector('.editorial-featured-rail');
    if (!rail) {
      stopEditorialFeaturedCarousel();
      return;
    }
    var scrollFrame = null;
    var pause = function () { stopEditorialFeaturedCarousel(); };
    var resume = function () { startEditorialFeaturedCarousel(); };
    rail.addEventListener('pointerenter', pause);
    rail.addEventListener('pointerleave', resume);
    rail.addEventListener('touchstart', pause, { passive: true });
    rail.addEventListener('touchend', resume, { passive: true });
    rail.addEventListener('focusin', pause);
    rail.addEventListener('focusout', resume);
    rail.addEventListener('scroll', function () {
      if (scrollFrame) cancelAnimationFrame(scrollFrame);
      scrollFrame = requestAnimationFrame(function () {
        if (!rail.clientWidth) return;
        var nextIndex = Math.max(0, Math.min(editorialFeaturedCount() - 1, Math.round(rail.scrollLeft / rail.clientWidth)));
        state.editorialFeaturedIndex = nextIndex;
        Array.prototype.forEach.call(document.querySelectorAll('[data-editorial-feature-dot]'), function (dot) {
          dot.classList.toggle('active', Number(dot.getAttribute('data-editorial-feature-dot') || 0) === nextIndex);
        });
      });
    }, { passive: true });
    Array.prototype.forEach.call(document.querySelectorAll('[data-editorial-feature-dot]'), function (dot) {
      dot.addEventListener('click', function (event) {
        event.stopPropagation();
        setEditorialFeaturedIndex(Number(dot.getAttribute('data-editorial-feature-dot') || 0), true);
        startEditorialFeaturedCarousel();
      });
    });
    setEditorialFeaturedIndex(state.editorialFeaturedIndex, false);
    startEditorialFeaturedCarousel();
  }

  function bindDetailEvents() {
    var detailBack = document.getElementById('detail-back');
    if (detailBack) detailBack.addEventListener('click', function () {
      setView('catalog');
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-thumb]'), function (button) {
      button.addEventListener('click', function () {
        state.selectedImage = Number(button.getAttribute('data-thumb') || 0);
        state.selectedColor = '';
        render();
      });
    });
  }

  function bindOrderEvents() {
    var form = document.getElementById('miniapp-order-form');
    if (form) {
      form.addEventListener('submit', submitOrder);
      function applyColorPreview(color) {
        var cleanColor = color || '';
        var colorImage = colorImageFor(state.selectedProduct, cleanColor);
        if (!colorImage) return;
        state.selectedColor = cleanColor;
        state.selectedImage = 0;
        var detailButton = document.querySelector('.detail-image-button');
        var detailImage = document.querySelector('.detail-image');
        if (detailImage) {
          detailImage.src = colorImage.image;
          detailImage.alt = (state.selectedProduct && state.selectedProduct.name ? state.selectedProduct.name : 'Product') + ' - ' + cleanColor;
        }
        if (detailButton) detailButton.setAttribute('data-open-image', colorImage.image);
        Array.prototype.forEach.call(form.querySelectorAll('[data-color-option]'), function (input) {
          var active = String(input.value || '').toLowerCase() === String(cleanColor).toLowerCase();
          input.checked = active;
          var pill = input.closest('.option-pill');
          if (pill) pill.classList.toggle('active', active);
        });
        Array.prototype.forEach.call(form.querySelectorAll('[data-color-preview]'), function (button) {
          var active = String(button.getAttribute('data-color-preview') || '').toLowerCase() === String(cleanColor).toLowerCase();
          button.classList.toggle('active', active);
        });
      }
      Array.prototype.forEach.call(form.querySelectorAll('[data-color-option]'), function (input) {
        input.addEventListener('change', function () {
          if (!input.checked) return;
          applyColorPreview(input.getAttribute('data-color-option') || input.value || '');
        });
      });
      Array.prototype.forEach.call(form.querySelectorAll('[data-color-preview]'), function (button) {
        button.addEventListener('click', function () {
          applyColorPreview(button.getAttribute('data-color-preview') || '');
        });
      });
      bindQuantityControls(form);
      updateMiniSubtotal(form);
      bindMissingFieldCleanup(form);
    }
    Array.prototype.forEach.call(document.querySelectorAll('[data-submit-order]'), function (stickySubmit) {
      stickySubmit.addEventListener('click', function () {
      var orderForm = document.getElementById('miniapp-order-form');
      if (!orderForm) return;
      if (state.selectedProduct) {
        void trackMiniappEvent('order_started', {
          productId: state.selectedProduct.id,
          productCode: state.selectedProduct.code,
          category: state.selectedProduct.category,
          subcategory: state.selectedProduct.subcategory
        });
      }
      if (!validateOrderForm(orderForm)) return;
      if (typeof orderForm.requestSubmit === 'function') orderForm.requestSubmit();
      else orderForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-back-products]'), function (button) {
      button.addEventListener('click', function () {
        setView('catalog');
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-track-current]'), function (button) {
      button.addEventListener('click', function () {
        var order = state.orderResult && state.orderResult.order;
        state.trackResult = order ? {
          trackingCode: order.trackingCode,
          status: order.status,
          paymentStatus: order.paymentStatus,
          deliveryStatus: order.deliveryStatus || order.status,
          productName: order.productName,
          total: order.total,
          deliveryArea: order.deliveryArea,
          deliveryMaxHours: order.deliveryMaxHours,
          nextStep: 'Use the same phone number you ordered with if you want to refresh this status later.'
        } : null;
        setView('track');
      });
    });
    var proofForm = document.getElementById('payment-proof-form');
    if (proofForm) proofForm.addEventListener('submit', submitPaymentProof);
    var trackForm = document.getElementById('track-form');
    if (trackForm) trackForm.addEventListener('submit', submitTrackOrder);
    Array.prototype.forEach.call(document.querySelectorAll('[data-copy]'), function (button) {
      button.addEventListener('click', async function () {
        var text = button.getAttribute('data-copy') || '';
        try {
          await navigator.clipboard.writeText(text);
          button.textContent = 'Copied';
          setTimeout(function () { button.textContent = 'Copy'; }, 1400);
        } catch (error) {
          button.textContent = text;
        }
      });
    });
  }

  function bindAccountEvents() {
    var accountForm = document.getElementById('account-form');
    if (accountForm) accountForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var data = new FormData(accountForm);
      saveAccount({
        fullName: data.get('fullName'),
        phone: data.get('phone'),
        address: data.get('address'),
        telegramChatId: data.get('telegramChatId'),
        telegramUserId: data.get('telegramUserId'),
        telegramUsername: data.get('telegramUsername'),
        shopperSessionId: state.shopperSessionId || ensureShopperSessionId()
      });
      var button = accountForm.querySelector('button[type="submit"]');
      if (button) {
        button.textContent = 'Saved';
        setTimeout(function () { button.textContent = 'Save my details'; }, 1200);
      }
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-history-track]'), function (button) {
      button.addEventListener('click', function () {
        if (button.getAttribute('data-history-resume') === '1') {
          resumeOrderPayment(button.getAttribute('data-history-order-id') || button.getAttribute('data-history-track') || '', button.getAttribute('data-history-phone') || '');
          return;
        }
        state.trackResult = null;
        state.trackError = '';
        state.view = 'track';
        syncHistory();
        render();
        var code = button.getAttribute('data-history-track') || '';
        var phone = button.getAttribute('data-history-phone') || '';
        var form = document.getElementById('track-form');
        if (form) {
          form.elements.trackingCode.value = code;
          form.elements.phone.value = phone;
        }
      });
    });
  }

  function updateMiniSubtotal(form) {
    if (!form || !state.selectedProduct) return;
    var quantity = Math.max(1, Math.min(99, Number(form.querySelector('[name="quantity"]')?.value || 1) || 1));
    var target = document.getElementById('mini-subtotal');
    if (target) target.textContent = money(moneyNumber(state.selectedProduct.price) * quantity);
  }

  function fieldLabelFor(control) {
    var label = control.closest('label');
    if (!label) return control.name || 'required field';
    return String(label.childNodes[0]?.textContent || label.textContent || control.name || 'required field').trim().replace(/\s+/g, ' ');
  }

  function markMissing(target) {
    if (!target) return;
    target.classList.add('field-missing');
  }

  function clearMissing(form) {
    Array.prototype.forEach.call(form.querySelectorAll('.field-missing'), function (item) {
      item.classList.remove('field-missing');
    });
    var alert = document.getElementById('order-form-alert');
    if (alert) {
      alert.hidden = true;
      alert.textContent = '';
    }
  }

  function bindMissingFieldCleanup(form) {
    Array.prototype.forEach.call(form.querySelectorAll('input, textarea'), function (control) {
      control.addEventListener('input', function () {
        control.classList.remove('field-missing');
        var group = control.closest('.option-group');
        if (group) group.classList.remove('field-missing');
      });
      control.addEventListener('change', function () {
        control.classList.remove('field-missing');
        var group = control.closest('.option-group');
        if (group) group.classList.remove('field-missing');
      });
    });
  }

  function validateOrderForm(form) {
    clearMissing(form);
    var missing = [];
    Array.prototype.forEach.call(form.querySelectorAll('input[required]:not([type="radio"]), textarea[required]'), function (control) {
      if (!String(control.value || '').trim()) {
        markMissing(control);
        missing.push(fieldLabelFor(control));
      }
    });
    var requiredRadios = Array.prototype.slice.call(form.querySelectorAll('input[type="radio"][required]'));
    var radioNames = Array.from(new Set(requiredRadios.map(function (radio) { return radio.name; })));
    radioNames.forEach(function (name) {
      var radios = requiredRadios.filter(function (radio) { return radio.name === name; });
      if (!radios.some(function (radio) { return radio.checked; })) {
        var group = radios[0] && radios[0].closest('.option-group');
        markMissing(group || radios[0]);
        var groupLabel = group ? String(group.querySelector('label')?.textContent || name).trim() : name;
        missing.push(groupLabel);
      }
    });
    if (!missing.length) return true;
    var alert = document.getElementById('order-form-alert');
    if (alert) {
      alert.hidden = false;
      alert.textContent = 'Please complete: ' + missing.filter(Boolean).join(', ');
    }
    var first = form.querySelector('.field-missing');
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return false;
  }

  function bindQuantityControls(form) {
    var input = form.querySelector('[name="quantity"]');
    Array.prototype.forEach.call(form.querySelectorAll('[data-qty]'), function (button) {
      button.addEventListener('click', function () {
        var delta = Number(button.getAttribute('data-qty') || 0);
        var next = Math.max(1, Math.min(99, (Number(input.value || 1) || 1) + delta));
        input.value = String(next);
        updateMiniSubtotal(form);
      });
    });
    if (input) {
      input.addEventListener('input', function () {
        var next = Math.max(1, Math.min(99, Number(input.value || 1) || 1));
        input.value = String(next);
        updateMiniSubtotal(form);
      });
    }
  }

  async function submitOrder(event) {
    event.preventDefault();
    if (!state.selectedProduct) return;
    var form = event.currentTarget;
    if (!validateOrderForm(form)) return;
    var submitButtons = Array.prototype.slice.call(document.querySelectorAll('[data-submit-order]'));
    var data = new FormData(form);
    var specs = {};
    (state.selectedProduct.specGroups || []).forEach(function (group) {
      specs[group.key] = data.get('spec-' + group.key) || '';
    });
    saveAccount({
      fullName: data.get('customerName'),
      phone: data.get('phone'),
      address: data.get('address'),
      telegramChatId: data.get('telegramChatId'),
      telegramUserId: data.get('telegramUserId'),
      telegramUsername: data.get('telegramUsername'),
      shopperSessionId: state.shopperSessionId || ensureShopperSessionId()
    }, false);
    var payload = {
      productId: state.selectedProduct.id,
      productCode: state.selectedProduct.code,
      quantity: data.get('quantity'),
      customerName: data.get('customerName'),
      phone: data.get('phone'),
      address: data.get('address'),
      telegramChatId: data.get('telegramChatId'),
      telegramUserId: data.get('telegramUserId'),
      telegramUsername: data.get('telegramUsername'),
      shopperSessionId: state.shopperSessionId || ensureShopperSessionId(),
      cakeWritingText: data.get('cakeWritingText') || '',
      cakeNeededDate: data.get('cakeNeededDate') || '',
      cakeNeededTime: data.get('cakeNeededTime') || '',
      specs: specs
    };
    try {
      submitButtons.forEach(function (submit) {
        submit.disabled = true;
        submit.textContent = 'Saving order...';
      });
      var response = await fetch('/api/miniapp/shop/' + encodeURIComponent(slugFromPath()) + '/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      });
      var result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Order failed');
      state.orderResult = result;
      state.paymentProofResult = null;
      rememberOrder(result.order);
      syncAccount(state.account);
      await syncOrders(false);
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      alert(error.message || 'Order failed. Please try again.');
    } finally {
      submitButtons.forEach(function (submit) {
        submit.disabled = false;
        submit.textContent = 'Order';
      });
    }
  }

  async function submitPaymentProof(event) {
    event.preventDefault();
    if (!state.orderResult || !state.orderResult.order) return;
    var form = event.currentTarget;
    var data = new FormData(form);
    var proofText = String(data.get('proofText') || '').trim();
    if (!proofText) {
      alert('Please paste the SMS or reference number.');
      return;
    }
    var button = form.querySelector('button[type="submit"]');
    try {
      if (button) {
        button.disabled = true;
        button.textContent = 'Checking...';
      }
      var orderId = state.orderResult.order.id;
      var account = state.account || defaultAccount();
      var response = await fetch('/api/miniapp/shop/' + encodeURIComponent(slugFromPath()) + '/orders/' + encodeURIComponent(orderId) + '/payment-proof', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          proofText: proofText,
          phone: account.phone || '',
          telegramChatId: account.telegramChatId || account.telegramUserId || '',
          telegramUserId: account.telegramUserId || '',
          telegramUsername: account.telegramUsername || '',
          shopperSessionId: state.shopperSessionId || ensureShopperSessionId()
        })
      });
      var result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Payment proof failed');
      state.paymentProofResult = result;
      if (result.order) {
        state.orderResult.order.paymentStatus = result.order.paymentStatus;
        state.orderResult.order.paymentDueNow = result.order.paymentDueNow || state.orderResult.order.paymentDueNow;
        state.orderResult.order.paymentBalanceAmount = result.order.paymentBalanceAmount || state.orderResult.order.paymentBalanceAmount;
      }
      await syncOrders(false);
      render();
    } catch (error) {
      alert(error.message || 'Payment proof failed. Please try again.');
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Submit Payment Proof';
      }
    }
  }

  async function resumeOrderPayment(orderId, phone) {
    if (!orderId) return;
    var account = state.account || defaultAccount();
    var params = new URLSearchParams({
      phone: phone || account.phone || '',
      sessionId: state.shopperSessionId || ensureShopperSessionId()
    });
    if (account.telegramChatId) params.set('telegramChatId', account.telegramChatId);
    if (account.telegramUserId) params.set('telegramUserId', account.telegramUserId);
    if (account.telegramUsername) params.set('telegramUsername', account.telegramUsername);
    try {
      var response = await fetch('/api/miniapp/shop/' + encodeURIComponent(slugFromPath()) + '/orders/' + encodeURIComponent(orderId) + '/resume-payment?' + params.toString(), {
        credentials: 'same-origin'
      });
      var result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not resume this order.');
      state.orderResult = result;
      state.paymentProofResult = null;
      state.selectedProduct = null;
      state.view = 'catalog';
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      state.trackResult = null;
      state.trackError = error.message || '';
      state.view = 'track';
      render();
    }
  }

  async function submitTrackOrder(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var data = new FormData(form);
    var trackingCode = String(data.get('trackingCode') || '').trim();
    var phone = String(data.get('phone') || '').trim();
    var button = form.querySelector('button[type="submit"]');
    state.trackError = '';
    state.trackResult = null;
    try {
      if (button) {
        button.disabled = true;
        button.textContent = 'Checking...';
      }
      var account = state.account || defaultAccount();
      var params = new URLSearchParams({
        code: trackingCode,
        phone: phone,
        sessionId: state.shopperSessionId || ensureShopperSessionId()
      });
      if (account.telegramChatId) params.set('telegramChatId', account.telegramChatId);
      if (account.telegramUserId) params.set('telegramUserId', account.telegramUserId);
      if (account.telegramUsername) params.set('telegramUsername', account.telegramUsername);
      var response = await fetch('/api/miniapp/shop/' + encodeURIComponent(slugFromPath()) + '/orders/track?' + params.toString(), {
        credentials: 'same-origin'
      });
      var result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Order not found');
      state.trackResult = result.order || null;
      render();
    } catch (error) {
      state.trackError = error.message || 'Order not found. Please check the code and phone number.';
      render();
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Track Order';
      }
    }
  }

  function fail(message) {
    app.innerHTML = '<section class="error-card" role="alert"><div><span class="error-symbol">!</span><h1>Shop unavailable</h1><p>' +
      esc(message || 'Please try again later.') +
      '</p><button class="primary-btn" type="button" id="retry-shop">Try again</button></div></section>';
    var retry = document.getElementById('retry-shop');
    if (retry) retry.addEventListener('click', function () {
      app.innerHTML = '<section class="storefront-skeleton" aria-live="polite" aria-busy="true"><div class="skeleton-header"><span></span><span></span></div><div class="skeleton-hero"></div><div class="skeleton-row"><span></span><span></span><span></span><span></span></div><p>Opening shop...</p></section>';
      void boot();
    });
  }

  async function boot() {
    try {
      if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.ready();
        window.Telegram.WebApp.expand();
      }
      var response = await fetch('/api/miniapp/shop/' + encodeURIComponent(slugFromPath()), { credentials: 'same-origin' });
      var data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Shop not found');
      state.shop = data.shop || {};
      state.categories = data.categories || [];
      state.products = data.products || [];
      applyLocationState();
      loadAccount();
      syncAccount(state.account);
      await syncOrders(false);
      void trackMiniappEvent('shop_open');
      document.body.classList.toggle('cake-shop', isCakeShop());
      document.body.classList.toggle('template-editorial', isEditorialTemplate());
      document.body.classList.add('retail-' + retailStyleKey());
      var websiteMainColor = state.shop.themeColor || '#173b67';
      var websiteAccentColor = state.shop.accentColor || '#20a39e';
      document.documentElement.style.setProperty('--navy', websiteMainColor);
      document.documentElement.style.setProperty('--accent', websiteAccentColor);
      document.body.style.setProperty('--navy', websiteMainColor);
      document.body.style.setProperty('--accent', websiteAccentColor);
      state.navigationReady = true;
      history.replaceState({ sprintSales: true }, '', storefrontUrl());
      render();
      if (state.view === 'support') {
        void loadSupportMessages(true);
        startSupportPolling();
      }
    } catch (error) {
      fail(error.message);
    }
  }

  window.addEventListener('popstate', function () {
    if (!state.shop) return;
    stopSupportPolling();
    applyLocationState();
    render();
    if (state.view === 'support') {
      void loadSupportMessages(true);
      startSupportPolling();
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  });

  boot();
})();
