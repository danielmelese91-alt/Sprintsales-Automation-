import assert from 'node:assert/strict';
import { createShopperOutreachService } from './src/services/shopper-outreach-service.js';
import { createAnnouncementService } from './src/services/announcement-service.js';

const client = {
  id: 'client_1',
  businessName: 'Ladies Vibe',
  settings: {
    botToken: 'bot-token',
    botUsername: '@LadiesVibeBot',
    accountSessionStatus: 'connected',
    accountSessionString: 'session',
    accountApiId: '12345',
    accountApiHash: 'hash',
    miniapp: { slug: 'ladies-vibe' }
  }
};
const recipient = {
  telegramChatId: '100200300',
  telegramUserId: '100200300',
  username: '@shopper_one'
};
const product = { id: 'product_1', code: 'SHO-004', name: 'Green Shoe' };

const personalMessages = [];
const botMessages = [];
const personalClient = {
  sendMessage: async (target, payload) => {
    personalMessages.push({ target, payload });
  }
};
const botRunner = {
  telegram: {
    sendMessage: async (target, text, extra) => {
      botMessages.push({ target, text, extra });
    }
  }
};

const preferred = createShopperOutreachService({
  Telegraf: class {},
  loadGramJs: async () => {
    throw new Error('A running account client should be reused.');
  },
  accountRunners: new Map([[client.id, personalClient]]),
  botRunners: new Map([[client.id, botRunner]]),
  personalSendGapMs: 0,
  platformDomain: 'sprintsales.net'
});

const preferredResult = await preferred.sendShopperOutreach({
  client,
  recipient,
  text: 'A product you may like.',
  product,
  kind: 'recommendation',
  botExtra: { reply_markup: { inline_keyboard: [] } }
});
assert.equal(preferredResult.sent, true);
assert.equal(preferredResult.channel, 'personal_account');
assert.equal(personalMessages.length, 1);
assert.equal(botMessages.length, 0);
assert.equal(personalMessages[0].target, 'shopper_one');
assert.match(personalMessages[0].payload.message, /https:\/\/ladies-vibe\.sprintsales\.net\/product\/SHO-004/);
assert.match(personalMessages[0].payload.message, /https:\/\/t\.me\/LadiesVibeBot\?start=stop_suggestions/);

const fallbackBotMessages = [];
const fallbackErrors = [];
const fallback = createShopperOutreachService({
  Telegraf: class {},
  loadGramJs: async () => {
    throw new Error('A running account client should be reused.');
  },
  accountRunners: new Map([[
    client.id,
    {
      sendMessage: async () => {
        const error = new Error('PEER_FLOOD');
        error.errorMessage = 'PEER_FLOOD';
        throw error;
      }
    }
  ]]),
  botRunners: new Map([[
    client.id,
    {
      telegram: {
        sendMessage: async (target, text, extra) => fallbackBotMessages.push({ target, text, extra })
      }
    }
  ]]),
  recordBotError: async (_data, error) => fallbackErrors.push(error),
  personalSendGapMs: 0,
  platformDomain: 'sprintsales.net'
});

const fallbackResult = await fallback.sendShopperOutreach({
  client,
  recipient,
  text: 'New product announcement.',
  product,
  kind: 'announcement_campaign',
  botExtra: { reply_markup: { inline_keyboard: [[{ text: 'View Product', url: 'https://example.com' }]] } }
});
assert.equal(fallbackResult.sent, true);
assert.equal(fallbackResult.channel, 'bot');
assert.equal(fallbackBotMessages.length, 1);
assert.equal(fallbackErrors.length, 1);

const botOnlyClient = {
  ...client,
  id: 'client_2',
  settings: {
    ...client.settings,
    accountSessionStatus: 'not_connected',
    accountSessionString: ''
  }
};
const botOnlyMessages = [];
const botOnly = createShopperOutreachService({
  Telegraf: class {},
  loadGramJs: async () => {
    throw new Error('Personal account should not be loaded.');
  },
  accountRunners: new Map(),
  botRunners: new Map([[
    botOnlyClient.id,
    { telegram: { sendMessage: async (...args) => botOnlyMessages.push(args) } }
  ]]),
  personalSendGapMs: 0
});
const botOnlyResult = await botOnly.sendShopperOutreach({
  client: botOnlyClient,
  recipient,
  text: 'Fallback message.',
  product
});
assert.equal(botOnlyResult.channel, 'bot');
assert.equal(botOnlyMessages.length, 1);

assert.equal(
  preferred.storefrontUrlForClient({
    ...client,
    settings: { ...client.settings, miniapp: { customDomain: 'shop.example.com' } }
  }, product),
  'https://shop.example.com/product/SHO-004'
);

const routedMessages = [];
let sequence = 0;
const announcementService = createAnnouncementService({
  now: () => '2026-06-28T12:00:00.000Z',
  uid: prefix => `${prefix}_${++sequence}`,
  productPrice: item => item.price,
  isProductBusiness: () => true,
  storefrontUrlForClient: preferred.storefrontUrlForClient,
  sendShopperOutreach: async payload => {
    routedMessages.push(payload);
    return { sent: true, channel: 'personal_account' };
  }
});
const campaignData = {
  products: [{ ...product, clientId: client.id, price: 3000, category: 'Shoes', isActive: true }],
  customers: [{ id: 'customer_1', clientId: client.id, telegramChatId: recipient.telegramChatId, username: recipient.username }],
  conversations: [],
  orders: [],
  productIntents: [{
    id: 'intent_1',
    clientId: client.id,
    customerId: 'customer_1',
    telegramChatId: recipient.telegramChatId,
    productId: product.id,
    viewCount: 2,
    status: 'completed'
  }],
  productRecommendations: [],
  announcementCampaigns: [],
  campaignRecipients: [],
  shopperMessageLedger: [],
  messages: []
};
const proClient = { ...client, status: 'active', billing: { plan: 'pro' } };
const draft = announcementService.createCampaign({
  data: campaignData,
  client: proClient,
  body: { type: 'product', productId: product.id, scope: 'product' }
});
const campaignResult = await announcementService.sendCampaign({
  data: campaignData,
  client: proClient,
  campaignId: draft.campaign.id
});
assert.equal(campaignResult.sent, 1);
assert.equal(routedMessages.length, 1);
assert.equal(routedMessages[0].product.id, product.id);
assert.equal(routedMessages[0].kind, 'announcement_campaign');
assert.equal(campaignData.campaignRecipients[0].deliveryChannel, 'personal_account');
assert.equal(campaignData.shopperMessageLedger[0].deliveryChannel, 'personal_account');
assert.equal(
  routedMessages[0].botExtra.reply_markup.inline_keyboard[0][0].url,
  'https://ladies-vibe.sprintsales.net/product/SHO-004'
);

console.log('shopper outreach service tests passed');
