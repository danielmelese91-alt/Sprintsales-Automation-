import { canSendGrowthMessage, quietHoursNow, recordGrowthMessage, sameShopper as sameCustomer } from './shopper-message-policy.js';
import i18n from '../config/shopper-i18n.cjs';
import {
  includesAny,
  isVisibleProduct,
  normalizeProductText as normalizeText,
  optionValues,
  priceNumber,
  productFamily,
  productText
} from './product-taxonomy-service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const { shopperText, localizeButtons, setShopperLanguageContext } = i18n;
const tr = (client, key, vars = {}, fallback = '') => shopperText(client, key, vars, fallback);
const shopperLanguageFor = (data, customer = {}) => customer.shopperLanguage ||
  (data.conversations || []).find(conversation => sameCustomer(conversation, customer))?.shopperLanguage ||
  'amharic';
const applyCustomerLanguage = (data, client, customer = {}) => {
  setShopperLanguageContext(client, shopperLanguageFor(data, customer));
  return client;
};

const familyCooldownDays = {
  phone: 365,
  laptop: 365,
  tablet: 180,
  console: 180,
  shoes: 60,
  fashion: 35,
  beauty: 21,
  home_kitchen: 45,
  furniture: 180,
  general: 45
};

const complementaryRules = {
  phone: ['case', 'cover', 'screen protector', 'tempered glass', 'charger', 'cable', 'power bank', 'earbud', 'earphone', 'headphone'],
  laptop: ['laptop bag', 'sleeve', 'mouse', 'keyboard', 'stand', 'cooling pad', 'charger'],
  tablet: ['case', 'cover', 'screen protector', 'stylus', 'pen'],
  console: ['controller', 'headset', 'gamepad', 'charging dock'],
  shoes: ['sock', 'shoe cleaner', 'belt', 'bag'],
  fashion: ['belt', 'bag', 'handbag', 'clutch', 'scarf', 'watch', 'jewelry', 'necklace', 'earring', 'bracelet', 'sunglasses'],
  beauty: ['brush', 'sponge', 'blender', 'liner', 'cleanser', 'toner', 'cotton', 'wipes'],
  home_kitchen: ['cup', 'container', 'tray', 'spoon', 'rack', 'cleaner', 'brush', 'glove'],
  furniture: ['pillow', 'cover', 'cushion', 'rug', 'carpet', 'mat', 'lamp'],
  general: []
};

const daysSince = value => {
  const time = new Date(value || 0).getTime();
  if (!time) return Infinity;
  return (Date.now() - time) / DAY_MS;
};

const medianGapDays = orders => {
  const times = orders
    .map(order => new Date(order.paymentVerifiedAt || order.deliveredAt || order.updatedAt || order.createdAt || 0).getTime())
    .filter(Boolean)
    .sort((a, b) => a - b);
  if (times.length < 2) return 0;
  const gaps = [];
  for (let i = 1; i < times.length; i += 1) gaps.push((times[i] - times[i - 1]) / DAY_MS);
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)] || 0;
};

const intersectScore = (a = [], b = []) => {
  const bSet = new Set(b.map(item => normalizeText(item)));
  return a.map(item => normalizeText(item)).filter(item => bSet.has(item)).length;
};

const shortProduct = product => String(product?.name || product?.code || 'this product').replace(/\s+/g, ' ').trim().slice(0, 45);

export const createRecommendationService = (deps = {}) => {
  const {
    Telegraf,
    botRunners,
    readData,
    writeData,
    ensureCollections,
    clientFor,
    now,
    uid,
    productPrice,
    isProductBusiness,
    sendShopperOutreach,
    storefrontUrlForClient
  } = deps;

  const isProClient = client => String(client?.billing?.plan || client?.subscriptionPlan || client?.settings?.subscriptionPlan || 'basic').toLowerCase() === 'pro';

  const paidOrdersForCustomer = (data, client, customer) => (data.orders || [])
    .filter(order => order.clientId === client.id && order.paymentStatus === 'paid' && sameCustomer(customer, order))
    .sort((a, b) => new Date(b.paymentVerifiedAt || b.deliveredAt || b.updatedAt || 0) - new Date(a.paymentVerifiedAt || a.deliveredAt || a.updatedAt || 0));

  const productForOrder = (products, order) => products.find(product =>
    product.id === order.productId ||
    (order.productCode && [product.code, product.productCode].filter(Boolean).includes(order.productCode))
  ) || null;

  const buildProfile = (orders, products) => {
    const purchasedProducts = orders.map(order => productForOrder(products, order)).filter(Boolean);
    const families = {};
    const colors = {};
    const sizes = {};
    const priceSamples = [];
    for (const order of orders) {
      const product = productForOrder(products, order);
      if (!product) continue;
      const family = productFamily(product);
      families[family] = (families[family] || 0) + 1;
      optionValues(order.selectedColor || product.colors).forEach(color => { colors[color] = (colors[color] || 0) + 1; });
      optionValues(order.selectedSize || product.sizes).forEach(size => { sizes[size] = (sizes[size] || 0) + 1; });
      const price = priceNumber(order.unitPrice || productPrice?.(product) || product.price);
      if (price) priceSamples.push(price);
    }
    const topFamily = Object.entries(families).sort((a, b) => b[1] - a[1])[0]?.[0] || 'general';
    return {
      topFamily,
      families,
      colors,
      sizes,
      averagePrice: priceSamples.length ? Math.round(priceSamples.reduce((sum, value) => sum + value, 0) / priceSamples.length) : 0,
      medianGapDays: Math.round(medianGapDays(orders)),
      purchaseCount: orders.length,
      lastPurchaseAt: orders[0]?.paymentVerifiedAt || orders[0]?.deliveredAt || orders[0]?.updatedAt || '',
      lastProductId: purchasedProducts[0]?.id || orders[0]?.productId || ''
    };
  };

  const recommendationCooldown = (profile, sourceFamily) => {
    const base = familyCooldownDays[sourceFamily] || familyCooldownDays.general;
    if (profile.purchaseCount >= 3 && profile.medianGapDays > 0) {
      return Math.max(14, Math.min(base, Math.round(profile.medianGapDays * 0.9)));
    }
    return base;
  };

  const sourceOrderDue = (profile, sourceFamily) => daysSince(profile.lastPurchaseAt) >= recommendationCooldown(profile, sourceFamily);

  const recentlyRecommended = (data, customer) => {
    const last = customer.recommendationProfile?.lastRecommendedAt || customer.lastRecommendedAt || '';
    if (daysSince(last) < 7) return true;
    const recent = (data.productRecommendations || []).some(item =>
      item.customerId === customer.id &&
      ['sent', 'viewed', 'order_started'].includes(item.status) &&
      daysSince(item.sentAt || item.createdAt) < 7
    );
    return recent;
  };

  const recommendationPaused = customer => {
    if (customer.recommendationsOptOut) return true;
    const profile = customer.recommendationProfile || {};
    if (Number(profile.ignoredCount || 0) >= 2 && daysSince(profile.lastIgnoredAt) < 30) return true;
    return false;
  };

  const scoreCandidate = ({ product, sourceProduct, sourceFamily, profile, purchasedIds }) => {
    if (!isVisibleProduct(product)) return null;
    if (purchasedIds.has(product.id)) return null;
    const price = priceNumber(productPrice?.(product) || product.sellingPrice || product.price);
    if (!price) return null;
    const average = Number(profile.averagePrice || price) || price;
    if (price > Math.max(average * 1.15, average + 500)) return null;

    const text = productText(product);
    const candidateFamily = productFamily(product);
    let score = 0;
    const complementaryTerms = complementaryRules[sourceFamily] || [];
    if (complementaryTerms.length && includesAny(text, complementaryTerms)) score += 80;
    if (candidateFamily === profile.topFamily && sourceFamily !== 'phone' && sourceFamily !== 'laptop' && sourceFamily !== 'furniture') score += 35;
    if (candidateFamily === sourceFamily && ['phone', 'laptop', 'tablet', 'console', 'furniture'].includes(sourceFamily)) return null;
    score += intersectScore(optionValues(sourceProduct?.colors), optionValues(product.colors)) * 8;
    score += intersectScore(Object.keys(profile.colors || {}), optionValues(product.colors)) * 6;
    score += intersectScore(Object.keys(profile.sizes || {}), optionValues(product.sizes)) * 6;
    score += Math.max(0, 20 - Math.round(Math.abs(price - average) / Math.max(100, average) * 20));
    if (score < 45) return null;
    return { product, price, score, candidateFamily };
  };

  const findRecommendationForCustomer = (data, client, customer) => {
    const products = (data.products || []).filter(product => product.clientId === client.id);
    const orders = paidOrdersForCustomer(data, client, customer);
    if (!orders.length || !products.length) return null;
    const sourceOrder = orders[0];
    const sourceProduct = productForOrder(products, sourceOrder);
    if (!sourceProduct) return null;
    const profile = buildProfile(orders, products);
    const sourceFamily = productFamily(sourceProduct);
    if (!sourceOrderDue(profile, sourceFamily)) return null;
    const purchasedIds = new Set(orders.map(order => order.productId).filter(Boolean));
    const best = products
      .map(product => scoreCandidate({ product, sourceProduct, sourceFamily, profile, purchasedIds }))
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || a.price - b.price)[0];
    if (!best) return null;
    return {
      customer,
      sourceOrder,
      sourceProduct,
      profile,
      product: best.product,
      score: best.score,
      price: best.price,
      reason: best.candidateFamily === sourceFamily ? 'similar_taste' : 'complementary'
    };
  };

  const recommendationText = (client, match) => {
    const firstName = String(match.customer.name || match.customer.username || 'there').trim().split(/\s+/)[0] || 'there';
    const product = match.product;
    const lines = [
      tr(client, 'REC_INTRO', { firstName, businessName: client.businessName }, `Hi ${firstName}, ${client.businessName} found something that may fit your style.`),
      '',
      `${shortProduct(product)}`,
      product.code ? tr(client, 'PRODUCT_CODE', { productCode: product.code }, `Code: ${product.code}`) : '',
      match.price ? tr(client, 'PRODUCT_PRICE', { price: match.price }, `Price: ${match.price} Birr`) : '',
      '',
      match.reason === 'complementary'
        ? tr(client, 'REC_PREVIOUS_ORDER', { sourceProductName: shortProduct(match.sourceProduct) }, `It can go well with your previous ${shortProduct(match.sourceProduct)} order.`)
        : tr(client, 'REC_STYLE_MATCH', {}, `It matches the kind of products you have liked before.`),
      '',
      tr(client, 'REC_WANT_SEE', {}, 'Want to see it?')
    ].filter(Boolean);
    return lines.join('\n');
  };

  const sendRecommendationMessage = async (client, customer, recommendation, product, text) => {
    const chatId = String(customer.telegramChatId || recommendation.telegramChatId || '').trim();
    if (!chatId || typeof sendShopperOutreach !== 'function') return { sent: false, channel: 'none' };
    const productUrl = storefrontUrlForClient(client, product);
    return sendShopperOutreach({
      client,
      recipient: customer,
      text,
      product,
      kind: 'recommendation',
      botExtra: {
        reply_markup: {
          inline_keyboard: localizeButtons(client, [
            [{ text: 'View Product', url: productUrl }],
            [{ text: 'Not Now', callback_data: `productflow:recommend_later:${recommendation.id}` }],
            [{ text: 'Stop Suggestions', callback_data: `productflow:recommend_stop:${recommendation.id}` }]
          ])
        }
      }
    });
  };

  const sendDueRecommendations = async () => {
    if (quietHoursNow()) return { sent: 0, skipped: 'quiet_hours' };
    const data = ensureCollections(await readData());
    data.productRecommendations ||= [];
    data.shopperMessageLedger ||= [];
    let sent = 0;
    let changed = false;
    for (const client of data.clients || []) {
      if (!client || client.status !== 'active' || !isProductBusiness(client) || !isProClient(client)) continue;
      if (client.settings?.recommendationsEnabled === false) continue;
      const customers = (data.customers || []).filter(customer => customer.clientId === client.id && customer.telegramChatId);
      for (const customer of customers) {
        if (sent >= 20) break;
        if (recommendationPaused(customer) || recentlyRecommended(data, customer)) continue;
        const policy = canSendGrowthMessage(data, client, customer, {
          kind: 'recommendation',
          suppressActiveOrder: true,
          respectQuietHours: false
        });
        if (!policy.ok) continue;
        const match = findRecommendationForCustomer(data, client, customer);
        if (!match) continue;
        applyCustomerLanguage(data, client, customer);
        const id = uid ? uid('rec') : `rec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
        const record = {
          id,
          clientId: client.id,
          customerId: customer.id,
          telegramChatId: customer.telegramChatId,
          sourceOrderId: match.sourceOrder.id || '',
          sourceProductId: match.sourceProduct.id || '',
          productId: match.product.id || '',
          productCode: match.product.code || match.product.productCode || '',
          productName: match.product.name || match.product.code || '',
          reason: match.reason,
          score: match.score,
          status: 'created',
          createdAt: now()
        };
        const text = recommendationText(client, match);
        try {
          const delivery = await sendRecommendationMessage(client, customer, record, match.product, text);
          if (!delivery.sent) throw new Error(delivery.reason || 'No Telegram sender is available.');
          record.status = 'sent';
          record.sentAt = now();
          record.deliveryChannel = delivery.channel;
          customer.recommendationProfile = {
            ...(customer.recommendationProfile || {}),
            ...match.profile,
            lastRecommendedAt: record.sentAt
          };
          data.productRecommendations.push(record);
          recordGrowthMessage(data, {
            uid,
            now,
            clientId: client.id,
            customerId: customer.id,
            telegramChatId: customer.telegramChatId,
            kind: 'recommendation',
            productId: match.product.id || '',
            recommendationId: record.id,
            deliveryChannel: delivery.channel
          });
          sent += 1;
          changed = true;
        } catch (error) {
          record.status = 'failed';
          record.error = error.message;
          record.failedAt = now();
          data.productRecommendations.push(record);
          changed = true;
        }
      }
    }
    if (changed) await writeData(data);
    return { sent };
  };

  return {
    findRecommendationForCustomer,
    sendDueRecommendations,
    buildProfile,
    productFamily
  };
};
