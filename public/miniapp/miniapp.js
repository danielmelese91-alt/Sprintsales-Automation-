(function () {
  var app = document.getElementById('app');
  var state = { shop: null, categories: [], products: [], category: 'All', query: '' };

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
    return index >= 0 ? decodeURIComponent(parts[index + 1] || '') : '';
  }

  function money(value) {
    var n = Number(String(value || '').replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(n) || n <= 0) return 'Contact for price';
    return new Intl.NumberFormat('en-ET', { maximumFractionDigits: 0 }).format(n) + ' Birr';
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

  function productText(product) {
    return [
      product.name,
      product.code,
      product.category,
      product.subcategory,
      product.description,
      (product.colors || []).join(' '),
      (product.sizes || []).join(' '),
      (product.options || []).join(' ')
    ].join(' ').toLowerCase();
  }

  function visibleProducts() {
    var query = state.query.toLowerCase().trim();
    return state.products.filter(function (product) {
      var categoryOk = state.category === 'All' || product.category === state.category;
      var queryOk = !query || productText(product).indexOf(query) >= 0;
      return categoryOk && queryOk;
    });
  }

  function botUrl(product) {
    if (!state.shop || !state.shop.botUsername) return '';
    var start = product && product.code ? '?start=' + encodeURIComponent('code_' + product.code) : '';
    return 'https://t.me/' + encodeURIComponent(state.shop.botUsername) + start;
  }

  function renderHero() {
    var shop = state.shop || {};
    var logo = shop.logoUrl
      ? '<img class="logo" src="' + esc(shop.logoUrl) + '" alt="' + esc(shop.businessName || 'Shop') + ' logo">'
      : '<div class="logo">' + esc(initials(shop.businessName)) + '</div>';
    var subtitle = shop.firstTimeWelcomeMessage || shop.summary || 'Browse available products, compare options, and order from the Telegram shop.';
    return '<header class="hero">' +
      '<div class="brand-row">' + logo + '<div class="brand-text"><p class="eyebrow">SprintSales Mini Shop</p><h1>' + esc(shop.businessName || 'Shop') + '</h1><p class="subtitle">' + esc(subtitle) + '</p></div></div>' +
      '<div class="search"><input id="search-input" value="' + esc(state.query) + '" placeholder="Search product name or code"><a class="bot-link" href="' + esc(botUrl()) + '" target="_blank" rel="noopener">Bot</a></div>' +
      '</header>';
  }

  function renderChips() {
    var chips = ['All'].concat(state.categories.map(function (item) { return item.name; }));
    return '<nav class="chips">' + chips.map(function (category) {
      return '<button class="chip ' + (state.category === category ? 'active' : '') + '" data-category="' + esc(category) + '">' + esc(category) + '</button>';
    }).join('') + '</nav>';
  }

  function renderProduct(product) {
    var images = product.images || [];
    var photo = images[0]
      ? '<img src="' + esc(images[0]) + '" alt="' + esc(product.name) + '" loading="lazy">'
      : '<div class="photo-placeholder">No Image</div>';
    var tags = []
      .concat(product.subcategory ? [product.subcategory] : [])
      .concat((product.colors || []).slice(0, 2))
      .concat((product.sizes || []).slice(0, 2));
    var action = botUrl(product)
      ? '<a class="product-action" href="' + esc(botUrl(product)) + '" target="_blank" rel="noopener">Order in Telegram</a>'
      : '<div class="product-action">Use product code to order</div>';
    return '<article class="product-card">' +
      '<div class="photo-wrap">' + photo + (images.length > 1 ? '<span class="image-count">' + images.length + ' photos</span>' : '') + '</div>' +
      '<div class="product-body">' +
      '<h3 class="product-name">' + esc(product.name) + '</h3>' +
      '<p class="meta">' + esc(product.category || 'Product') + (product.subcategory ? ' - ' + esc(product.subcategory) : '') + '</p>' +
      '<div class="price-row"><span class="price">' + esc(money(product.price)) + '</span><span class="code">' + esc(product.code || '') + '</span></div>' +
      (tags.length ? '<div class="tags">' + tags.map(function (tag) { return '<span class="tag">' + esc(tag) + '</span>'; }).join('') + '</div>' : '') +
      action +
      '</div></article>';
  }

  function bindEvents() {
    var search = document.getElementById('search-input');
    if (search) {
      search.addEventListener('input', function () {
        state.query = search.value;
        render();
      });
    }
    Array.prototype.forEach.call(document.querySelectorAll('.chip'), function (button) {
      button.addEventListener('click', function () {
        state.category = button.getAttribute('data-category') || 'All';
        render();
      });
    });
  }

  function render() {
    var products = visibleProducts();
    app.innerHTML = renderHero() + renderChips() +
      '<section class="section-title"><h2>Products</h2><span class="count">' + products.length + ' available</span></section>' +
      (products.length
        ? '<section class="grid">' + products.map(renderProduct).join('') + '</section>'
        : '<section class="empty-box"><strong>No products found</strong><p>Try another category or search term.</p></section>');
    bindEvents();
  }

  function fail(message) {
    app.innerHTML = '<section class="error-card"><div><h1>Shop unavailable</h1><p>' + esc(message || 'Please try again later.') + '</p></div></section>';
  }

  async function boot() {
    try {
      if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.ready();
        window.Telegram.WebApp.expand();
      }
      var slug = slugFromPath();
      var response = await fetch('/api/miniapp/shop/' + encodeURIComponent(slug), { credentials: 'same-origin' });
      var data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Shop not found');
      state.shop = data.shop || {};
      state.categories = data.categories || [];
      state.products = data.products || [];
      var titleName = state.shop.businessName || 'SprintSales';
      document.title = /\bshop\b/i.test(titleName) ? titleName : titleName + ' Shop';
      document.documentElement.style.setProperty('--navy', state.shop.themeColor || '#0f2a52');
      document.documentElement.style.setProperty('--accent', state.shop.accentColor || '#14b8a6');
      render();
    } catch (error) {
      fail(error.message);
    }
  }

  boot();
})();
