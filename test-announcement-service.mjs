import assert from 'node:assert/strict';
import { createAnnouncementService } from './src/services/announcement-service.js';

const sent = [];
const service = createAnnouncementService({
  Telegraf: function FakeTelegraf() {
    return {
      telegram: {
        sendMessage: async (...args) => {
          sent.push(args);
        }
      }
    };
  },
  botRunners: new Map(),
  now: () => new Date().toISOString(),
  uid: prefix => `${prefix}_${Math.random().toString(36).slice(2, 8)}`,
  productPrice: product => Number(product.price || 0),
  isProductBusiness: () => true
});

const data = {
  announcementCampaigns: [],
  campaignRecipients: [],
  shopperMessageLedger: [],
  conversations: [
    { id: 'conv1', clientId: 'c1', telegramChatId: '100', customer: { name: 'Dani' }, username: 'dan' }
  ],
  customers: [
    { id: 'cust1', clientId: 'c1', telegramChatId: '100' }
  ],
  orders: [],
  products: [
    { id: 'p1', clientId: 'c1', name: 'Jeans', code: 'J1', category: 'Fashion', price: 500, isActive: true }
  ],
  productIntents: [],
  productRecommendations: []
};

const client = {
  id: 'c1',
  businessName: 'AdisMart',
  settings: { botToken: 'fake-token' },
  billing: { plan: 'pro' }
};

const created = service.createCampaign({
  data,
  client,
  body: { type: 'sales', scope: 'all', discountPercent: 30 }
});

assert.equal(created.audiencePreview.counts.eligible, 1, 'same shopper should not be counted twice');

const result = await service.sendCampaign({
  data,
  client,
  campaignId: created.campaign.id,
  message: created.campaign.message
});

assert.equal(result.sent, 1, 'campaign should send to one eligible shopper');
assert.equal(data.campaignRecipients.length, 1, 'recipient should be recorded');
assert.equal(data.shopperMessageLedger.length, 1, 'message cap ledger should be recorded');
assert.match(sent[0][1], /30% off|Sales discount|special offer/i, 'message should include campaign content');

await assert.rejects(
  () => service.sendCampaign({ data, client, campaignId: created.campaign.id, message: created.campaign.message }),
  /already sent|cap|eligible/i,
  'manual duplicate send should be blocked'
);

const basicClient = { ...client, id: 'c2', billing: { plan: 'basic' } };
assert.throws(
  () => service.createCampaign({ data, client: basicClient, body: { type: 'product' } }),
  /Pro feature/,
  'campaigns should be reserved for Pro clients'
);

console.log('announcement service tests passed');
