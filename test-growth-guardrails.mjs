import assert from 'node:assert/strict';
import { createMatchingService } from './src/services/matching-service.js';
import { canSendGrowthMessage, recordGrowthMessage } from './src/services/shopper-message-policy.js';

const client = { id: 'client1', billing: { plan: 'pro' }, settings: {} };
const customer = { id: 'cust1', clientId: 'client1', telegramChatId: '100' };

const data = {
  orders: [
    { id: 'order1', clientId: 'client1', customerId: 'cust1', telegramChatId: '100', status: 'paid', paymentStatus: 'paid' }
  ],
  shopperMessageLedger: []
};

assert.equal(
  canSendGrowthMessage(data, client, customer, { kind: 'recommendation', respectQuietHours: false }).reason,
  'active_order',
  'marketing should pause while a shopper has an active order'
);

data.orders[0].status = 'delivered';
assert.equal(
  canSendGrowthMessage(data, client, customer, { kind: 'recommendation', respectQuietHours: false }).ok,
  true,
  'marketing can resume after delivery if other caps allow it'
);

recordGrowthMessage(data, {
  clientId: 'client1',
  customerId: 'cust1',
  telegramChatId: '100',
  kind: 'recommendation',
  now: () => new Date().toISOString()
});

assert.equal(
  canSendGrowthMessage(data, client, customer, { kind: 'announcement_campaign', respectQuietHours: false }).reason,
  'daily_cap',
  'all growth features should share the same daily cap ledger'
);

const matching = createMatchingService({ productPrice: product => product.price });
const mainProduct = {
  id: 'phone1',
  name: 'Samsung Galaxy S24 Ultra',
  category: 'Electronics',
  price: 50000,
  isActive: true
};
const matchClient = {
  ...client,
  products: [
    mainProduct,
    { id: 'wrong', name: 'Samsung Galaxy S23 Ultra shockproof case', category: 'Electronics', price: 5000, isActive: true },
    { id: 'right', name: 'Samsung Galaxy S24 Ultra slim case', category: 'Electronics', price: 5500, isActive: true }
  ]
};
const match = matching.findCheckoutMatch({
  client: matchClient,
  order: { unitPrice: '50000', subtotal: '50000' },
  mainProduct
});

assert.equal(match?.product?.id, 'right', 'phone accessories must match the specific model token');

console.log('growth guardrail tests passed');
