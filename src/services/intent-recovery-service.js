import { canSendGrowthMessage, quietHoursNow, recordGrowthMessage, sameShopper as sameCustomer } from './shopper-message-policy.js';
import i18n from '../config/shopper-i18n.cjs';
import {
  isVisibleProduct,
  normalizeProductText as normalizeText,
  priceNumber,
  productText
} from './product-taxonomy-service.js';

const HOUR_MS = 60 * 60 * 1000;
const { shopperText, localizeButtons, setShopperLanguageContext } = i18n;
const tr = (client, key, vars = {}, fallback = '') => shopperText(client, key, vars, fallback);
const shopperLanguageFor = (data, intent = {}) => intent.shopperLanguage ||
  (data.customers || []).find(customer => sameCustomer(customer, intent))?.shopperLanguage ||
  (data.conversations || []).find(conversation => sameCustomer(conversation, intent))?.shopperLanguage ||
  'amharic';
const applyIntentLanguage = (data, client, intent = {}) => {
  setShopperLanguageContext(client, shopperLanguageFor(data, intent));
  return client;
};

const dueDelayMs = intent => {
  const sent = Number(intent.remindersSent || 0);
  if (sent === 0) return intent.source === 'order_started' ? 3 * HOUR_MS : 6 * HOUR_MS;
  return 24 * HOUR_MS;
};

const lastTouchTime = intent => new Date(intent.lastReminderAt || intent.lastActivityAt || intent.startedAt || intent.createdAt || 0).getTime();

const shortProduct = product => String(product?.name || product?.code || 'this product')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 45);

export const createIntentRecoveryService = (deps = {}) => {
  const {
    Telegraf,
    botRunners,
    readData,
    writeData,
    ensureCollections,
    now,
    uid,
    productPrice,
    isProductBusiness
  } = deps;

  const isProClient = client => String(client?.billing?.plan || client?.subscriptionPlan || client?.settings?.subscriptionPlan || 'basic').toLowerCase() === 'pro';

  const productForIntent = (data, intent) => (data.products || []).find(product =>
    product.clientId === intent.clientId &&
    (product.id === intent.productId || (intent.productCode && [product.code, product.productCode].filter(Boolean).includes(intent.productCode)))
  ) || null;

  const completedByOrder = (data, intent) => (data.orders || []).some(order =>
    order.clientId === intent.clientId &&
    ['confirmed', 'paid', 'delivered'].includes(String(order.status || '').toLowerCase()) &&
    String(order.productId || '') === String(intent.productId || '') &&
    sameCustomer(intent, order)
  );

  const cheaperSimilar = (data, product) => {
    if (!product) return null;
    const basePrice = priceNumber(productPrice?.(product) || product.sellingPrice || product.price);
    if (!basePrice) return null;
    const source = productText(product);
    const sourceCategory = normalizeText([product.category, product.subcategory, product.selectedCategory, product.selectedSubcategory].filter(Boolean).join(' '));
    return (data.products || [])
      .filter(item => item.clientId === product.clientId && item.id !== product.id && isVisibleProduct(item))
      .map(item => {
        const price = priceNumber(productPrice?.(item) || item.sellingPrice || item.price);
        if (!price || price > basePrice * 0.9) return null;
        const text = productText(item);
        const category = normalizeText([item.category, item.subcategory, item.selectedCategory, item.selectedSubcategory].filter(Boolean).join(' '));
        let score = 0;
        if (sourceCategory && category && sourceCategory === category) score += 60;
        for (const token of source.split(/\s+/).filter(t => t.length >= 4).slice(0, 8)) {
          if (text.includes(token)) score += 6;
        }
        return score >= 40 ? { product: item, price, score } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || a.price - b.price)[0]?.product || null;
  };

  const messageForIntent = (client, intent, product, alternative) => {
    const name = String(intent.customerName || intent.username || 'there').trim().split(/\s+/)[0] || 'there';
    const sent = Number(intent.remindersSent || 0);
    if (sent === 0) {
      return [
        tr(client, 'REMINDER_INTRO', { firstName: name, productName: shortProduct(product), businessName: client.businessName }, `Hi ${name}, still interested in ${shortProduct(product)} from ${client.businessName}?`),
        '',
        tr(client, 'REMINDER_CONTINUE', {}, 'I can help you continue the order when you are ready.')
      ].join('\n');
    }
    return [
      tr(client, 'REMINDER_AVAILABLE', { businessName: client.businessName, productName: shortProduct(product) }, `Quick reminder from ${client.businessName}: ${shortProduct(product)} is still available.`),
      alternative ? tr(client, 'REMINDER_ALT', { alternativeProductName: shortProduct(alternative) }, `I also found a similar lower-price option: ${shortProduct(alternative)}.`) : '',
      '',
      tr(client, 'REMINDER_NO_PRESSURE', {}, 'No pressure. You can continue, view it again, or stop reminders.')
    ].filter(Boolean).join('\n');
  };

  const buttonsForIntent = (client, intent, alternative) => {
    const rows = [
      [{ text: 'Continue Order', callback_data: `productflow:intent_continue:${intent.id}` }],
      [{ text: 'View Product', callback_data: `productflow:intent_view:${intent.id}` }],
    ];
    if (alternative) rows.push([{ text: 'See Similar Lower Price', callback_data: `productflow:intent_similar:${intent.id}` }]);
    rows.push([{ text: 'Not Now', callback_data: `productflow:intent_later:${intent.id}` }]);
    if (Number(intent.remindersSent || 0) >= 1) rows.push([{ text: 'Stop Reminders', callback_data: `productflow:intent_stop:${intent.id}` }]);
    return localizeButtons(client, rows);
  };

  const sendIntentMessage = async (client, intent, text, buttons) => {
    const runner = botRunners.get(client.id);
    const telegram = runner?.telegram || new Telegraf(client.settings.botToken).telegram;
    await telegram.sendMessage(intent.telegramChatId, text, {
      reply_markup: { inline_keyboard: buttons }
    });
  };

  const sendDueIntentRecoveries = async () => {
    if (quietHoursNow()) return { sent: 0, skipped: 'quiet_hours' };
    const data = ensureCollections(await readData());
    data.productIntents ||= [];
    data.shopperMessageLedger ||= [];
    let sent = 0;
    let changed = false;
    for (const client of data.clients || []) {
      if (!client || client.status !== 'active' || !isProductBusiness(client) || !isProClient(client) || client.settings?.intentRecoveryEnabled === false) continue;
      if (!client.settings?.botToken) continue;
      const intents = data.productIntents.filter(intent =>
        intent.clientId === client.id &&
        intent.telegramChatId &&
        ['active', 'reminded'].includes(intent.status || 'active') &&
        Number(intent.remindersSent || 0) < 2 &&
        !intent.optedOut
      );
      for (const intent of intents) {
        if (sent >= 30) break;
        const product = productForIntent(data, intent);
        if (!product || !isVisibleProduct(product)) {
          intent.status = 'expired';
          intent.updatedAt = now();
          changed = true;
          continue;
        }
        if (completedByOrder(data, intent)) {
          intent.status = 'completed';
          intent.updatedAt = now();
          changed = true;
          continue;
        }
        const last = lastTouchTime(intent);
        if (!last || Date.now() - last < dueDelayMs(intent)) continue;
        const alternative = Number(intent.remindersSent || 0) >= 1 ? cheaperSimilar(data, product) : null;
        const policy = canSendGrowthMessage(data, client, intent, {
          kind: 'intent_recovery',
          suppressActiveOrder: false,
          respectQuietHours: false
        });
        if (!policy.ok) continue;
        applyIntentLanguage(data, client, intent);
        try {
          await sendIntentMessage(client, intent, messageForIntent(client, intent, product, alternative), buttonsForIntent(client, intent, alternative));
          intent.remindersSent = Number(intent.remindersSent || 0) + 1;
          intent.lastReminderAt = now();
          intent.status = 'reminded';
          intent.alternativeProductId = alternative?.id || intent.alternativeProductId || '';
          intent.updatedAt = intent.lastReminderAt;
          data.messages ||= [];
          data.messages.push({
            id: uid('msg'),
            clientId: client.id,
            conversationId: intent.conversationId || '',
            direction: 'outbound',
            text: `Intent recovery reminder for ${intent.productName || intent.productCode || 'product'}`,
            createdAt: now(),
            source: 'intent_recovery'
          });
          recordGrowthMessage(data, {
            uid,
            now,
            clientId: client.id,
            customerId: intent.customerId || '',
            telegramChatId: intent.telegramChatId,
            kind: 'intent_recovery',
            productId: intent.productId || '',
            intentId: intent.id
          });
          sent += 1;
          changed = true;
        } catch (error) {
          intent.lastError = error.message;
          intent.updatedAt = now();
          changed = true;
        }
      }
    }
    if (changed) await writeData(data);
    return { sent };
  };

  return {
    sendDueIntentRecoveries,
    cheaperSimilar
  };
};
