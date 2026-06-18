const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const eventTime = item => new Date(item.sentAt || item.createdAt || item.updatedAt || 0).getTime() || 0;

export const quietHoursNow = (date = new Date()) => {
  const eatHour = (date.getUTCHours() + 3) % 24;
  return eatHour < 8 || eatHour >= 21;
};

export const identityValues = item => [
  item?.id,
  item?.customerId,
  item?.telegramUserId,
  item?.telegramChatId,
  item?.phone,
  item?.username,
  item?.conversationId
].filter(Boolean).map(value => String(value).toLowerCase());

export const sameShopper = (a, b) => {
  const left = identityValues(a);
  const right = identityValues(b);
  return left.some(value => right.includes(value));
};

export const marketingOptedOut = (customer = {}, kind = 'marketing') => {
  if (customer.marketingOptOut) return true;
  if (kind === 'recommendation') return Boolean(customer.recommendationsOptOut);
  if (kind === 'intent_recovery') return Boolean(customer.intentRecoveryOptOut || customer.remindersOptOut);
  return Boolean(customer.promotionsOptOut || customer.announcementOptOut);
};

export const activeOrderForCustomer = (data, clientId, customer) => (data.orders || []).find(order => {
  if (order.clientId !== clientId || !sameShopper(customer, order)) return false;
  const status = String(order.status || '').toLowerCase();
  const payment = String(order.paymentStatus || '').toLowerCase();
  if (['delivered', 'cancelled', 'canceled', 'rejected', 'refunded', 'failed'].includes(status)) return false;
  if (['refunded', 'rejected', 'failed'].includes(payment)) return false;
  return ['draft', 'confirmed', 'paid', 'packed', 'out_for_delivery', 'delivery_review_needed', 'pending'].includes(status) ||
    ['awaiting_screenshot', 'pending', 'paid', 'under_review', 'review'].includes(payment);
});

export const activeIntentForCustomer = (data, clientId, customer) => (data.productIntents || []).find(intent => {
  if (intent.clientId !== clientId || !sameShopper(customer, intent)) return false;
  const status = String(intent.status || 'active').toLowerCase();
  return ['active', 'reminded', 'order_resumed', 'viewed_after_reminder'].includes(status);
});

export const ledgerForCustomer = (data, clientId, customer) => (data.shopperMessageLedger || []).filter(item =>
  item.clientId === clientId && sameShopper(customer, item)
);

export const canSendGrowthMessage = (data, client, customer, {
  kind = 'marketing',
  suppressActiveOrder = true,
  respectQuietHours = true,
  dailyLimit = 1,
  weeklyLimit = 2,
  monthlyLimit = 6
} = {}) => {
  data.shopperMessageLedger ||= [];
  if (!customer?.telegramChatId) return { ok: false, reason: 'missing_chat_id' };
  if (respectQuietHours && quietHoursNow()) return { ok: false, reason: 'quiet_hours' };
  if (marketingOptedOut(customer, kind)) return { ok: false, reason: 'opted_out' };
  if (suppressActiveOrder) {
    const activeOrder = activeOrderForCustomer(data, client.id, customer);
    if (activeOrder) return { ok: false, reason: 'active_order', orderId: activeOrder.id || '' };
  }
  if (!['intent_recovery', 'support', 'order_update'].includes(kind)) {
    const activeIntent = activeIntentForCustomer(data, client.id, customer);
    if (activeIntent) return { ok: false, reason: 'active_intent', intentId: activeIntent.id || '' };
  }
  const ledger = ledgerForCustomer(data, client.id, customer)
    .filter(entry => !['support', 'order_update'].includes(entry.kind));
  const now = Date.now();
  const day = ledger.filter(entry => now - eventTime(entry) < DAY_MS).length;
  const week = ledger.filter(entry => now - eventTime(entry) < 7 * DAY_MS).length;
  const month = ledger.filter(entry => now - eventTime(entry) < 30 * DAY_MS).length;
  if (day >= dailyLimit) return { ok: false, reason: 'daily_cap', day, week, month };
  if (week >= weeklyLimit) return { ok: false, reason: 'weekly_cap', day, week, month };
  if (month >= monthlyLimit) return { ok: false, reason: 'monthly_cap', day, week, month };
  return { ok: true, day, week, month };
};

export const recordGrowthMessage = (data, {
  uid,
  now,
  clientId,
  customerId = '',
  telegramChatId = '',
  kind,
  productId = '',
  campaignId = '',
  recommendationId = '',
  intentId = ''
}) => {
  data.shopperMessageLedger ||= [];
  const sentAt = now ? now() : new Date().toISOString();
  data.shopperMessageLedger.push({
    id: uid ? uid('ledger') : `ledger_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    clientId,
    customerId,
    telegramChatId,
    kind,
    productId,
    campaignId,
    recommendationId,
    intentId,
    sentAt
  });
  return sentAt;
};
