import { canSendGrowthMessage, quietHoursNow, recordGrowthMessage, sameShopper as sameCustomer } from './shopper-message-policy.js';
import i18n from '../config/shopper-i18n.cjs';

const { shopperText, localizeButtons, setShopperLanguageContext } = i18n;
const tr = (client, key, vars = {}, fallback = '') => shopperText(client, key, vars, fallback);
const shopperLanguageFor = (data, customer = {}) => customer.shopperLanguage ||
  (data.conversations || []).find(conversation => sameCustomer(conversation, customer))?.shopperLanguage ||
  'amharic';
const applyCustomerLanguage = (data, client, customer = {}) => {
  setShopperLanguageContext(client, shopperLanguageFor(data, customer));
  return client;
};

const norm = value => String(value || '')
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

const monthKey = (date = new Date()) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

const productTerms = product => norm([
  product?.name,
  product?.code,
  product?.category,
  product?.subcategory,
  product?.selectedCategory,
  product?.selectedSubcategory,
  product?.description,
  product?.colors,
  product?.sizes,
  product?.tags
].filter(Boolean).join(' '));

const customerKeys = customer => [
  customer?.id,
  customer?.telegramUserId,
  customer?.telegramChatId,
  customer?.phone,
  customer?.username,
  customer?.conversationId
].filter(Boolean).map(value => String(value).toLowerCase());

const orderMatchesCustomer = (customer, order) => {
  const keys = customerKeys(customer);
  const vals = [
    order?.customerId,
    order?.telegramUserId,
    order?.telegramChatId,
    order?.phone,
    order?.username,
    order?.conversationId
  ].filter(Boolean).map(value => String(value).toLowerCase());
  return keys.some(key => vals.includes(key));
};

const productMatchesAudience = (product, audience = {}) => {
  if (!product) return false;
  const text = productTerms(product);
  const category = norm(audience.category || '');
  const productId = String(audience.productId || '');
  const productCode = norm(audience.productCode || '');
  if (productId && String(product.id || '') === productId) return true;
  if (productCode && norm(product.code || product.productCode || '') === productCode) return true;
  if (category && text.includes(category)) return true;
  return false;
};

const campaignTypeLabel = type => ({
  sales: 'Sales discount',
  holiday: 'Holiday discount',
  product: 'Product announcement'
}[type] || 'Announcement');

const isProClient = client => String(client?.billing?.plan || client?.subscriptionPlan || client?.settings?.subscriptionPlan || 'basic').toLowerCase() === 'pro';

export const createAnnouncementService = (deps = {}) => {
  const {
    Telegraf,
    botRunners,
    now,
    uid,
    productPrice,
    isProductBusiness
  } = deps;

  const ensureCampaignCollections = data => {
    data.announcementCampaigns ||= [];
    data.campaignRecipients ||= [];
    data.shopperMessageLedger ||= [];
    data.customers ||= [];
    data.conversations ||= [];
    data.orders ||= [];
    data.products ||= [];
    data.productIntents ||= [];
    data.productRecommendations ||= [];
    data.messages ||= [];
    return data;
  };

  const activeProducts = (data, clientId) => (data.products || []).filter(product => {
    if (product.clientId !== clientId || product.isActive === false) return false;
    const status = norm(product.status || product.availability || product.stockStatus || '');
    return !/(out of stock|out_of_stock|sold out|hidden|inactive|archived)/.test(status);
  });

  const customersFromEngagement = (data, client) => {
    const byKey = new Map();
    const upsert = seed => {
      if (!seed?.telegramChatId) return;
      const key = String(seed.telegramChatId || seed.telegramUserId || seed.id || seed.phone || seed.username || '').toLowerCase();
      if (!key) return;
      byKey.set(key, { ...byKey.get(key), ...seed, clientId: client.id, id: seed.id || key });
    };
    (data.customers || []).filter(item => item.clientId === client.id).forEach(upsert);
    (data.conversations || []).filter(item => item.clientId === client.id && item.telegramChatId).forEach(item => upsert({
      id: item.customerId || item.id,
      conversationId: item.id,
      telegramChatId: item.telegramChatId,
      telegramUserId: item.telegramUserId,
      username: item.customer?.username || item.username || '',
      name: item.customer?.name || item.customer?.first_name || ''
    }));
    return [...byKey.values()];
  };

  const relevantScore = (data, client, customer, audience) => {
    if (!audience || audience.scope === 'all') return 10;
    let score = 0;
    const products = activeProducts(data, client.id);
    const productById = id => products.find(product => product.id === id);
    for (const order of data.orders || []) {
      if (order.clientId !== client.id || !orderMatchesCustomer(customer, order)) continue;
      if (productMatchesAudience(productById(order.productId) || products.find(p => order.productCode && [p.code, p.productCode].includes(order.productCode)), audience)) score += 70;
    }
    for (const intent of data.productIntents || []) {
      if (intent.clientId !== client.id) continue;
      if (intent.telegramChatId !== customer.telegramChatId && intent.customerId !== customer.id) continue;
      if (productMatchesAudience(productById(intent.productId) || products.find(p => intent.productCode && [p.code, p.productCode].includes(intent.productCode)), audience)) score += Number(intent.viewCount || 0) >= 2 ? 55 : 35;
    }
    for (const rec of data.productRecommendations || []) {
      if (rec.clientId !== client.id || rec.customerId !== customer.id) continue;
      if (productMatchesAudience(productById(rec.productId) || products.find(p => rec.productCode && [p.code, p.productCode].includes(rec.productCode)), audience)) score += 25;
    }
    return score;
  };

  const campaignQuotaStatus = (data, client, type) => {
    const current = monthKey();
    const sentThisMonth = (data.announcementCampaigns || []).filter(campaign =>
      campaign.clientId === client.id &&
      campaign.type === type &&
      campaign.monthKey === current &&
      (['sent', 'completed'].includes(campaign.status) || Number(campaign.sentCount || 0) > 0)
    ).length;
    const limit = type === 'product' ? 5 : 1;
    return { ok: sentThisMonth < limit, used: sentThisMonth, limit, remaining: Math.max(0, limit - sentThisMonth) };
  };

  const buildAudience = (data, client, campaign) => {
    ensureCampaignCollections(data);
    const customers = customersFromEngagement(data, client);
    const audience = campaign.audience || {};
    const rows = customers.map(customer => {
      const priorFinal = (data.campaignRecipients || []).find(item =>
        item.campaignId === campaign.id &&
        item.clientId === client.id &&
        (item.customerId === customer.id || item.telegramChatId === customer.telegramChatId) &&
        ['clicked', 'stopped'].includes(item.status)
      );
      if (priorFinal) return { customer, eligible: false, reason: priorFinal.status === 'stopped' ? 'opted_out' : 'already_engaged', score: 0 };
      const policy = canSendGrowthMessage(data, client, customer, {
        kind: 'announcement_campaign',
        suppressActiveOrder: true,
        respectQuietHours: false
      });
      if (!policy.ok) return { customer, eligible: false, reason: policy.reason, score: 0 };
      const score = relevantScore(data, client, customer, audience);
      if (audience.scope !== 'all' && score <= 0) return { customer, eligible: false, reason: 'not_relevant', score };
      return { customer, eligible: true, reason: 'eligible', score };
    });
    const eligible = rows.filter(row => row.eligible)
      .sort((a, b) => b.score - a.score)
      .map(row => row.customer);
    return {
      eligible,
      rows,
      counts: rows.reduce((acc, row) => {
        acc.total += 1;
        if (row.eligible) acc.eligible += 1;
        else acc[row.reason] = (acc[row.reason] || 0) + 1;
        return acc;
      }, { total: 0, eligible: 0 })
    };
  };

  const campaignDraftText = (client, campaign, product = null) => {
    const business = client.businessName || 'the shop';
    const discount = Number(campaign.discountPercent || 0);
    const discountLine = discount ? `${discount}% off` : 'a special offer';
    if (campaign.type === 'product' && product) {
      return [
        tr(client, 'CAMPAIGN_NEW_PRODUCT', { businessName: business, productName: product.name || product.code }, `New from ${business}: ${product.name || product.code}.`),
        product.code ? tr(client, 'CAMPAIGN_PRODUCT_CODE', { productCode: product.code }, `Product code: ${product.code}`) : '',
        productPrice?.(product) ? tr(client, 'CAMPAIGN_PRICE', { price: productPrice(product) }, `Price: ${productPrice(product)} Birr`) : '',
        discount ? tr(client, 'CAMPAIGN_SPECIAL_OFFER', { discountPercent: discount }, `Special offer: ${discountLine}.`) : '',
        tr(client, 'CAMPAIGN_TAP_TO_VIEW', {}, 'Tap below to view or order from the bot.')
      ].filter(Boolean).join('\n');
    }
    const target = campaign.audience?.scope === 'category' && campaign.audience?.category ? campaign.audience.category : 'selected products';
    return [
      tr(client, 'CAMPAIGN_GENERAL', { businessName: business, campaignType: campaignTypeLabel(campaign.type).toLowerCase() }, `${business} has a ${campaignTypeLabel(campaign.type).toLowerCase()} available now.`),
      discount
        ? (campaign.audience?.scope === 'all'
          ? tr(client, 'CAMPAIGN_ALL_PRODUCTS', { discountPercent: discount }, `${discountLine} on products in the shop.`)
          : tr(client, 'CAMPAIGN_TARGET', { discountPercent: discount, target }, `${discountLine} on ${target}.`))
        : `${discountLine} on ${campaign.audience?.scope === 'all' ? 'products in the shop' : target}.`,
      tr(client, 'CAMPAIGN_VIEW_OFFERS', {}, 'Tap below to see the available offers in the bot.')
    ].filter(Boolean).join('\n');
  };

  const createCampaign = ({ data, client, body = {} }) => {
    ensureCampaignCollections(data);
    if (!isProductBusiness(client)) throw new Error('Announcements are only available for product-selling businesses.');
    if (!isProClient(client)) throw new Error('Announcement campaigns are a Pro feature.');
    const type = ['sales', 'holiday', 'product'].includes(String(body.type || '').toLowerCase())
      ? String(body.type).toLowerCase()
      : 'sales';
    const product = body.productId ? activeProducts(data, client.id).find(item => item.id === body.productId) : null;
    const audience = {
      scope: body.scope || (type === 'product' ? 'product' : 'all'),
      category: String(body.category || product?.category || '').trim(),
      productId: product?.id || String(body.productId || '').trim(),
      productCode: product?.code || ''
    };
    if (!['all', 'category', 'product'].includes(audience.scope)) audience.scope = 'all';
    const campaign = {
      id: uid('campaign'),
      clientId: client.id,
      type,
      title: String(body.title || campaignTypeLabel(type)).slice(0, 120),
      discountPercent: Math.max(0, Math.min(90, Number(body.discountPercent || client.settings?.discounts?.[type]?.value || 0))),
      audience,
      productId: product?.id || audience.productId || '',
      productCode: product?.code || '',
      status: 'draft',
      wave: 0,
      maxWaves: type === 'product' ? 1 : 2,
      monthKey: monthKey(),
      message: '',
      createdAt: now(),
      updatedAt: now()
    };
    campaign.message = String(body.message || campaignDraftText(client, campaign, product)).slice(0, 1000);
    const audiencePreview = buildAudience(data, client, campaign);
    campaign.preview = {
      counts: audiencePreview.counts,
      generatedAt: now()
    };
    const existingDraft = (data.announcementCampaigns || []).find(item =>
      item.clientId === client.id &&
      item.status === 'draft' &&
      item.type === campaign.type &&
      item.monthKey === campaign.monthKey &&
      item.audience?.scope === campaign.audience.scope &&
      String(item.audience?.category || '') === String(campaign.audience.category || '') &&
      String(item.productId || item.audience?.productId || '') === String(campaign.productId || campaign.audience.productId || '')
    );
    if (existingDraft) {
      Object.assign(existingDraft, {
        ...campaign,
        id: existingDraft.id,
        createdAt: existingDraft.createdAt || campaign.createdAt,
        updatedAt: now()
      });
      return { campaign: existingDraft, audiencePreview };
    }
    data.announcementCampaigns.push(campaign);
    return { campaign, audiencePreview };
  };

  const sendCampaign = async ({ data, client, campaignId, message = '' }) => {
    ensureCampaignCollections(data);
    const campaign = (data.announcementCampaigns || []).find(item => item.id === campaignId && item.clientId === client.id);
    if (!campaign) throw new Error('Campaign not found.');
    if (!isProClient(client)) throw new Error('Announcement campaigns are a Pro feature.');
    const dueWave = campaign.status === 'sent' &&
      campaign.nextWaveAt &&
      Number(campaign.wave || 0) < Number(campaign.maxWaves || 1) &&
      new Date(campaign.nextWaveAt).getTime() <= Date.now();
    if (campaign.status !== 'draft' && !dueWave) {
      throw new Error('This announcement was already sent.');
    }
    const quota = campaignQuotaStatus(data, client, campaign.type);
    if (campaign.status === 'draft' && !quota.ok) throw new Error(`${campaignTypeLabel(campaign.type)} monthly limit reached (${quota.used}/${quota.limit}).`);
    campaign.message = String(message || campaign.message || '').trim().slice(0, 1000);
    if (!campaign.message) throw new Error('Write the announcement message before sending.');
    const audience = buildAudience(data, client, campaign);
    if (!audience.eligible.length) throw new Error('No eligible shoppers after opt-out and message-cap checks.');
    if (!client.settings?.botToken) throw new Error('Telegram bot token is missing.');
    const runner = botRunners.get(client.id);
    const telegram = runner?.telegram || new Telegraf(client.settings.botToken).telegram;
    const wave = Number(campaign.wave || 0) + 1;
    let sent = 0;
    for (const customer of audience.eligible.slice(0, 500)) {
      const policy = canSendGrowthMessage(data, client, customer, {
        kind: 'announcement_campaign',
        suppressActiveOrder: true,
        respectQuietHours: false
      });
      if (!policy.ok) continue;
      applyCustomerLanguage(data, client, customer);
      try {
        await telegram.sendMessage(customer.telegramChatId, campaign.message, {
          reply_markup: {
            inline_keyboard: localizeButtons(client, [
              [{ text: 'View Offers', callback_data: `productflow:campaign_view:${campaign.id}` }],
              [{ text: 'Stop Promotions', callback_data: `productflow:campaign_stop:${campaign.id}` }]
            ])
          }
        });
        const sentAt = now();
        data.campaignRecipients.push({
          id: uid('recipient'),
          campaignId: campaign.id,
          clientId: client.id,
          customerId: customer.id,
          telegramChatId: customer.telegramChatId,
          wave,
          status: 'sent',
          sentAt
        });
        recordGrowthMessage(data, {
          uid,
          now,
          clientId: client.id,
          customerId: customer.id,
          telegramChatId: customer.telegramChatId,
          kind: 'announcement_campaign',
          campaignId: campaign.id
        });
        sent += 1;
      } catch (error) {
        data.campaignRecipients.push({
          id: uid('recipient'),
          campaignId: campaign.id,
          clientId: client.id,
          customerId: customer.id,
          telegramChatId: customer.telegramChatId,
          wave,
          status: 'failed',
          error: error.message,
          sentAt: now()
        });
      }
    }
    campaign.wave = wave;
    campaign.status = sent ? 'sent' : 'failed';
    campaign.sentCount = Number(campaign.sentCount || 0) + sent;
    campaign.lastSentAt = now();
    campaign.updatedAt = campaign.lastSentAt;
    campaign.nextWaveAt = campaign.wave < campaign.maxWaves
      ? new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString()
      : '';
    campaign.preview = { counts: audience.counts, generatedAt: now() };
    return { campaign, sent, audience };
  };

  const sendDueCampaignWaves = async ({ data, clientsById, writeData }) => {
    ensureCampaignCollections(data);
    if (quietHoursNow()) return { changed: false, skipped: 'quiet_hours' };
    let changed = false;
    for (const campaign of data.announcementCampaigns || []) {
      if (!campaign.nextWaveAt || campaign.status !== 'sent') continue;
      if (new Date(campaign.nextWaveAt).getTime() > Date.now()) continue;
      const client = clientsById(campaign.clientId);
      if (!client) continue;
      await sendCampaign({ data, client, campaignId: campaign.id, message: campaign.message }).catch(error => {
        campaign.lastWaveError = error.message;
        campaign.updatedAt = now();
      });
      changed = true;
    }
    if (changed) await writeData(data);
    return { changed };
  };

  return {
    createCampaign,
    sendCampaign,
    sendDueCampaignWaves,
    buildAudience,
    campaignQuotaStatus,
    ensureCampaignCollections
  };
};
