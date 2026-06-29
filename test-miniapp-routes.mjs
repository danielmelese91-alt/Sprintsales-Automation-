import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMiniappRoutes } from './src/routes/miniapp-routes.js';
import { createProductService } from './src/services/product-service.js';
import { createWebsiteSupportService } from './src/services/website-support-service.js';
import { defaultSettings, isProductBusiness } from './src/config/defaults.js';
import {
  MINIAPP_TEMPLATE_IDS,
  normalizeMiniappTemplate
} from './src/config/miniapp-templates.js';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sprintsales-miniapp-'));
const publicDir = path.join(tmp, 'public');
await fs.mkdir(path.join(publicDir, 'miniapp'), { recursive: true });
await fs.writeFile(
  path.join(publicDir, 'miniapp', 'index.html'),
  '<!doctype html><title>__SS_TITLE__</title><meta name="description" content="__SS_DESCRIPTION__"><meta property="og:image" content="__SS_IMAGE__"><link rel="canonical" href="__SS_CANONICAL__">'
);

const client = {
  id: 'client_1',
  businessName: 'Demo Retail Shop',
  phone: '0911223344',
  email: 'shop@example.com',
  status: 'active',
  settings: {
    ...defaultSettings(),
    botUsername: '@DemoShopBot',
    businessLogoUrl: '/uploads/products/client_1/logo.png',
    businessProfile: {
      ...defaultSettings().businessProfile,
      businessType: 'retail',
      retailType: 'electronics',
      summary: 'A test shop',
      address: 'Bole Atlas',
      mapUrl: 'https://maps.app.goo.gl/examplePin'
    },
    miniapp: {
      enabled: true,
      slug: '',
      customDomain: 'shop.example.com',
      template: 'editorial-boutique',
      themeColor: '#0f2a52',
      accentColor: '#14b8a6',
      themeCustomized: false
    },
    delivery: {
      mode: 'location_zones',
      addis_delivery_fee: 0,
      zones: [
        { area: 'Bole', fee: 80, maxHours: 5, enabled: true }
      ]
    },
    paymentOptions: [
      { method: 'CBE', accountNumber: '1000123456789', accountName: 'Demo Retail Shop' }
    ],
    paymentVerificationMode: 'automatic'
  }
};

const cakeClient = {
  id: 'client_cake',
  businessName: 'Sweet Demo Cakes',
  status: 'active',
  billing: { plan: 'pro' },
  settings: {
    ...defaultSettings(),
    botUsername: '@SweetDemoBot',
    businessProfile: {
      ...defaultSettings().businessProfile,
      businessType: 'retail',
      retailType: 'cakes',
      summary: 'Custom cakes for birthdays and weddings',
      address: 'Bole'
    },
    miniapp: {
      enabled: true,
      slug: 'sweet-demo-cakes',
      customDomain: '',
      template: 'clean-retail',
      themeColor: '#5b2b42',
      accentColor: '#e25588'
    },
    cakeOrderSettings: {
      paymentMode: 'deposit',
      depositType: 'percent',
      depositValue: 30,
      writingRequired: true
    },
    delivery: {
      mode: 'fixed_addis',
      addis_delivery_fee: 0,
      outside_addis_behavior: 'manual_confirmation',
      zones: []
    },
    paymentOptions: [
      { method: 'CBE', accountNumber: '1000123456000', accountName: 'Sweet Demo Cakes' }
    ],
    paymentVerificationMode: 'automatic'
  }
};

let data = {
  clients: [
    client,
    cakeClient,
    { id: 'client_pending', businessName: 'Pending Shop', status: 'pending', settings: defaultSettings() }
  ],
  products: [
    {
      id: 'p_active',
      clientId: 'client_1',
      name: 'Smart Fitness Watch',
      code: 'SW-200',
      createdAt: '2026-01-02T10:00:00.000Z',
      price: 4500,
      category: 'Electronics',
      subcategory: 'Wearables',
      isActive: true,
      featured: true,
      images: [
        { publicPath: 'watch.watermarked-1.jpg' },
        { publicPath: 'watch.watermarked-2.jpg' },
        { publicPath: 'watch.watermarked-3.jpg' },
        { publicPath: 'watch.watermarked-4.jpg' },
        { publicPath: 'watch.watermarked-5.jpg' },
        { publicPath: 'watch.watermarked-6-ignored.jpg' }
      ],
      colorImages: [
        { color: 'Black', publicPath: 'watch.black.watermarked.jpg' }
      ],
      colors: ['Black'],
      specGroups: [
        { key: 'color', label: 'Color', field: 'color', values: ['Black'] },
        { key: 'strap', label: 'Strap', field: 'option', values: ['Silicone', 'Leather'] }
      ]
    },
    {
      id: 'p_inactive',
      clientId: 'client_1',
      name: 'Hidden Product',
      code: 'HP-1',
      price: 1,
      category: 'Electronics',
      isActive: false
    },
    {
      id: 'p_laptop_legacy',
      clientId: 'client_1',
      name: 'Business Laptop',
      code: 'BL-1',
      price: 35000,
      category: 'Electronics',
      subcategory: 'Laptops',
      isActive: true,
      specGroups: [
        { key: 'memory', label: 'Storage / Memory', field: 'size', values: ['512GB', '16GB RAM', '15.6 inch'] },
        { key: 'condition', label: 'Condition', field: 'option', values: ['Brand new'] }
      ],
      sizes: ['512GB', '16GB RAM', '15.6 inch'],
      options: ['Brand new']
    },
    {
      id: 'p_cake',
      clientId: 'client_cake',
      name: 'Chocolate Birthday Cake',
      code: 'CAKE-001',
      price: 1000,
      category: 'Birthday Cakes',
      subcategory: 'Chocolate birthday cakes',
      description: 'Fresh chocolate birthday cake with custom writing.',
      isActive: true,
      images: [
        { publicPath: 'cake.watermarked.jpg' }
      ],
      specGroups: [
        { key: 'cake_size', label: 'Cake Size', field: 'size', values: ['1 kg'] },
        { key: 'flavor', label: 'Flavor', field: 'option', values: ['Chocolate'] },
        { key: 'theme_color', label: 'Theme Color', field: 'color', values: ['Pink', 'Gold'] }
      ]
    }
  ],
  orders: [],
  customers: [],
  productIntents: [],
  miniappEvents: [],
  conversations: [],
  messages: [],
  unansweredQuestions: [],
  auditLogs: []
};
const customerTelegramMessages = [];
const clientNotifications = [];

const { activeClientProducts } = createProductService({
  clientFor: (fresh, id) => fresh.clients.find(item => item.id === id),
  isProductBusiness,
  defaultSettings
});

const { answerCommerceQuestion: answerWebsiteCommerceQuestion } = createWebsiteSupportService({
  answerProductflowSupportQuestion: async (_data, _client, _conversation, question) => (
    /delivery to bole/i.test(question)
      ? { reply: 'Delivery to Bole is 80 Birr. Maximum delivery time is 5 hours.' }
      : null
  )
});

const app = express();
app.use(express.json());
const uidCounts = {};
app.use(createMiniappRoutes({
  publicDir,
  readData: async () => structuredClone(data),
  writeData: async next => { data = structuredClone(next); },
  uid: prefix => {
    uidCounts[prefix] = (uidCounts[prefix] || 0) + 1;
    if (prefix === 'order' && uidCounts[prefix] === 1) return 'order_test12345678';
    return `${prefix}_test${String(uidCounts[prefix]).padStart(8, '0')}`;
  },
  now: () => '2026-01-01T00:00:00.000Z',
  addAuditLog: (target, entry) => target.auditLogs.push(entry),
  sendClientNotification: async (...args) => {
    clientNotifications.push(args);
    return true;
  },
  sendCustomerTelegramMessage: async (clientArg, chatId, text, extra) => {
    customerTelegramMessages.push({ clientId: clientArg.id, chatId, text, extra });
    return true;
  },
  paymentVerificationService: {
    verifyPaymentProof: async ({ proof, order }) => {
      proof.extracted.transactionId = 'FT123456789';
      return { action: 'verified', reason: 'Verified in test.', reference: 'FT123456789', amount: Number(order.paymentDueNow || order.total || 0), verifyRequestId: 'verify_1' };
    }
  },
  answerWebsiteCommerceQuestion,
  answerProductflowSupportQuestion: async (_data, _client, _conversation, question) => (
    /delivery to bole/i.test(question)
      ? { reply: 'Delivery to Bole is 80 Birr. Maximum delivery time is 5 hours.' }
      : null
  ),
  buildReply: async (_data, _client, _conversation, question) => (
    /return policy/i.test(question)
      ? 'Returns are accepted according to the saved shop policy.'
      : 'I do not have that information yet. Please contact the business team directly, or share your question and I can ask the team to follow up.'
  ),
  isMissingKnowledgeReply: text => /^I do not have that information yet\./.test(String(text || '')),
  prepareCustomerReply: text => String(text || '').replace(/\*\*/g, ''),
  isProductBusiness,
  activeClientProducts
}));

const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

try {
  const catalogResponse = await fetch(`${base}/api/miniapp/shop/demo-retail-shop`);
  assert.equal(catalogResponse.status, 200);
  const catalog = await catalogResponse.json();
  assert.equal(catalog.shop.businessName, 'Demo Retail Shop');
  assert.equal(catalog.shop.template, MINIAPP_TEMPLATE_IDS.EDITORIAL_BOUTIQUE);
  assert.equal(catalog.shop.themeColor, '#123c73');
  assert.equal(catalog.shop.accentColor, '#087f8c');
  assert.equal(normalizeMiniappTemplate('not-a-real-template'), MINIAPP_TEMPLATE_IDS.CLEAN_RETAIL);
  assert.equal(catalog.shop.slug, 'demo-retail-shop');
  assert.equal(catalog.shop.botUsername, 'DemoShopBot');
  assert.equal(catalog.shop.mapUrl, 'https://maps.app.goo.gl/examplePin');
  assert.equal(catalog.shop.contactPhone, '0911223344');
  assert.equal(catalog.products.length, 2);
  assert.equal(catalog.products[0].id, 'p_active');
  assert.equal(catalog.products[0].featured, true);
  assert.equal(catalog.products[0].createdAt, '2026-01-02T10:00:00.000Z');
  assert.equal(catalog.products[0].images.length, 5);
  assert.equal(catalog.products[0].images[0], '/uploads/products/client_1/watch.watermarked-1.jpg');
  assert.equal(catalog.products[0].images[4], '/uploads/products/client_1/watch.watermarked-5.jpg');
  assert.deepEqual(catalog.products[0].colorImages, [
    { color: 'Black', image: '/uploads/products/client_1/watch.black.watermarked.jpg' }
  ]);
  assert.equal(catalog.products[0].specGroups.length, 2);
  const laptop = catalog.products.find(product => product.id === 'p_laptop_legacy');
  assert.ok(laptop);
  assert.deepEqual(laptop.specGroups.map(group => group.label), ['Storage', 'RAM', 'Screen Size', 'Condition']);
  assert.equal(laptop.specGroups.find(group => group.label === 'Storage').values[0], '512GB');
  assert.equal(laptop.specGroups.find(group => group.label === 'RAM').values[0], '16GB RAM');
  assert.equal(laptop.specGroups.find(group => group.label === 'Screen Size').values[0], '15.6 inch');
  assert.equal(catalog.categories[0].name, 'Electronics');

  const hostCatalogResponse = await fetch(`${base}/api/miniapp/shop/_host`, {
    headers: { 'X-Forwarded-Host': 'shop.example.com' }
  });
  assert.equal(hostCatalogResponse.status, 200);
  const hostCatalog = await hostCatalogResponse.json();
  assert.equal(hostCatalog.shop.businessName, 'Demo Retail Shop');

  const platformSubdomainResponse = await fetch(`${base}/api/miniapp/shop/_host`, {
    headers: { 'X-Forwarded-Host': 'demo-retail-shop.sprintsales.net' }
  });
  assert.equal(platformSubdomainResponse.status, 200);
  const platformSubdomainCatalog = await platformSubdomainResponse.json();
  assert.equal(platformSubdomainCatalog.shop.businessName, 'Demo Retail Shop');

  const productPageResponse = await fetch(`${base}/shop/demo-retail-shop/product/SW-200`);
  assert.equal(productPageResponse.status, 200);
  const productPageHtml = await productPageResponse.text();
  assert.match(productPageHtml, /<title>Smart Fitness Watch \| Demo Retail Shop<\/title>/);
  assert.match(productPageHtml, /View details and order online/);
  assert.match(productPageHtml, /watch\.watermarked-1\.jpg/);
  assert.match(productPageHtml, /\/shop\/demo-retail-shop\/product\/SW-200/);

  const hostProductPageResponse = await fetch(`${base}/product/SW-200`, {
    headers: {
      'X-Forwarded-Host': 'shop.example.com',
      'X-Forwarded-Proto': 'https'
    }
  });
  assert.equal(hostProductPageResponse.status, 200);
  const hostProductPageHtml = await hostProductPageResponse.text();
  assert.match(hostProductPageHtml, /https:\/\/shop\.example\.com\/product\/SW-200/);

  const cakeCatalogResponse = await fetch(`${base}/api/miniapp/shop/sweet-demo-cakes`);
  assert.equal(cakeCatalogResponse.status, 200);
  const cakeCatalog = await cakeCatalogResponse.json();
  assert.equal(cakeCatalog.shop.template, MINIAPP_TEMPLATE_IDS.CLEAN_RETAIL);
  assert.equal(cakeCatalog.shop.businessName, 'Sweet Demo Cakes');
  assert.equal(cakeCatalog.shop.isCakeShop, true);
  assert.equal(cakeCatalog.shop.cakeOrderSettings.paymentMode, 'deposit');
  assert.equal(cakeCatalog.products.length, 1);
  assert.equal(cakeCatalog.products[0].specGroups.find(group => group.key === 'cake_size').values[0], '1 kg');

  const customDomainPage = await fetch(`${base}/`, {
    headers: { 'X-Forwarded-Host': 'shop.example.com' }
  });
  assert.equal(customDomainPage.status, 200);
  assert.match(await customDomainPage.text(), /doctype html/i);

  const platformSubdomainPage = await fetch(`${base}/`, {
    headers: { 'X-Forwarded-Host': 'demo-retail-shop.sprintsales.net' }
  });
  assert.equal(platformSubdomainPage.status, 200);
  assert.match(await platformSubdomainPage.text(), /doctype html/i);

  const accountResponse = await fetch(`${base}/api/miniapp/shop/demo-retail-shop/account`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Daniel MiniApp',
      phone: '0911223344',
      address: 'Bole Atlas near test building',
      telegramChatId: '12345',
      telegramUserId: '12345',
      telegramUsername: 'daniel_test',
      shopperSessionId: 'ss_test_device'
    })
  });
  assert.equal(accountResponse.status, 200);
  const accountResult = await accountResponse.json();
  assert.equal(accountResult.customer.name, 'Daniel MiniApp');
  assert.equal(data.customers.length, 1);
  assert.equal(data.customers[0].address, 'Bole Atlas near test building');
  assert.equal(data.customers[0].telegramChatId, '12345');
  assert.equal(data.customers[0].shopperSessionId, 'ss_test_device');

  const localSupportResponse = await fetch(`${base}/api/miniapp/shop/demo-retail-shop/support`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'How much is delivery to Bole?',
      fullName: 'Daniel MiniApp',
      shopperSessionId: 'ss_test_device'
    })
  });
  assert.equal(localSupportResponse.status, 200);
  const localSupport = await localSupportResponse.json();
  assert.equal(localSupport.source, 'shop_info');
  assert.match(localSupport.reply, /80 Birr/);
  assert.equal(data.unansweredQuestions.length, 0);

  const productSupportResponse = await fetch(`${base}/api/miniapp/shop/demo-retail-shop/support`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Do you have a black watch?',
      fullName: 'Daniel MiniApp',
      shopperSessionId: 'ss_test_device'
    })
  });
  assert.equal(productSupportResponse.status, 200);
  const productSupport = await productSupportResponse.json();
  assert.equal(productSupport.source, 'shop_info');
  assert.match(productSupport.reply, /Smart Fitness Watch/i);
  assert.match(productSupport.reply, /4,500 Birr/i);
  assert.equal(productSupport.messages.at(-1).products.length, 1);
  assert.equal(productSupport.messages.at(-1).products[0].id, 'p_active');

  const laptopSupportResponse = await fetch(`${base}/api/miniapp/shop/demo-retail-shop/support`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Do you have a business laptop?',
      fullName: 'Daniel MiniApp',
      shopperSessionId: 'ss_test_device'
    })
  });
  assert.equal(laptopSupportResponse.status, 200);
  const laptopSupport = await laptopSupportResponse.json();
  assert.equal(laptopSupport.source, 'shop_info');
  assert.match(laptopSupport.reply, /Business Laptop/i);
  assert.equal(laptopSupport.messages.at(-1).products[0].id, 'p_laptop_legacy');

  const laptopRamResponse = await fetch(`${base}/api/miniapp/shop/demo-retail-shop/support`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Do you have 16GB RAM?',
      fullName: 'Daniel MiniApp',
      shopperSessionId: 'ss_test_device'
    })
  });
  assert.equal(laptopRamResponse.status, 200);
  const laptopRamSupport = await laptopRamResponse.json();
  assert.equal(laptopRamSupport.source, 'shop_info');
  assert.match(laptopRamSupport.reply, /16GB/i);
  assert.equal(laptopRamSupport.waitingForTeam, false);
  assert.equal(laptopRamSupport.messages.at(-1).products[0].id, 'p_laptop_legacy');

  const laptopMissingRamResponse = await fetch(`${base}/api/miniapp/shop/demo-retail-shop/support`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Do you have 32GB RAM?',
      fullName: 'Daniel MiniApp',
      shopperSessionId: 'ss_test_device'
    })
  });
  assert.equal(laptopMissingRamResponse.status, 200);
  const laptopMissingRamSupport = await laptopMissingRamResponse.json();
  assert.equal(laptopMissingRamSupport.source, 'shop_info');
  assert.equal(laptopMissingRamSupport.waitingForTeam, false);
  assert.match(laptopMissingRamSupport.reply, /could not find that exact option/i);
  assert.match(laptopMissingRamSupport.reply, /16GB RAM/i);

  const aiSupportResponse = await fetch(`${base}/api/miniapp/shop/demo-retail-shop/support`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'What is your return policy?',
      fullName: 'Daniel MiniApp',
      shopperSessionId: 'ss_test_device'
    })
  });
  assert.equal(aiSupportResponse.status, 200);
  const aiSupport = await aiSupportResponse.json();
  assert.equal(aiSupport.source, 'ai');
  assert.match(aiSupport.reply, /saved shop policy/);

  const handoffSupportResponse = await fetch(`${base}/api/miniapp/shop/demo-retail-shop/support`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Can you make a custom midnight delivery exception?',
      fullName: 'Daniel MiniApp',
      shopperSessionId: 'ss_test_device',
      telegramChatId: '999999999'
    })
  });
  assert.equal(handoffSupportResponse.status, 200);
  const handoffSupport = await handoffSupportResponse.json();
  assert.equal(handoffSupport.source, 'human_handoff');
  assert.equal(handoffSupport.waitingForTeam, true);
  assert.equal(data.unansweredQuestions.length, 1);
  assert.equal(data.unansweredQuestions[0].source, 'miniapp_support');
  assert.equal(data.unansweredQuestions[0].shopperSessionId, 'ss_test_device');
  assert.equal(data.unansweredQuestions[0].telegramChatId, '');
  assert.equal(clientNotifications.length, 1);

  const supportHistoryResponse = await fetch(`${base}/api/miniapp/shop/demo-retail-shop/support?sessionId=ss_test_device`);
  assert.equal(supportHistoryResponse.status, 200);
  const supportHistory = await supportHistoryResponse.json();
  assert.equal(supportHistory.waitingForTeam, true);
  assert.equal(supportHistory.messages.length, 14);
  assert.equal(supportHistory.messages.at(-1).source, 'miniapp_support_handoff');

  const viewEventBody = {
    type: 'product_view',
    productId: 'p_active',
    fullName: 'Daniel MiniApp',
    telegramChatId: '12345',
    telegramUserId: '12345',
    telegramUsername: 'daniel_test',
    shopperSessionId: 'ss_test_device'
  };
  const firstViewResponse = await fetch(`${base}/api/miniapp/shop/demo-retail-shop/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(viewEventBody)
  });
  assert.equal(firstViewResponse.status, 200);
  assert.equal(data.productIntents.length, 1);
  assert.equal(data.productIntents[0].source, 'repeat_view');
  assert.equal(data.productIntents[0].viewCount, 1);
  assert.equal(data.miniappEvents.filter(event => event.type === 'product_view').length, 1);

  const secondViewResponse = await fetch(`${base}/api/miniapp/shop/demo-retail-shop/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(viewEventBody)
  });
  assert.equal(secondViewResponse.status, 200);
  assert.equal(data.productIntents.length, 1);
  assert.equal(data.productIntents[0].status, 'active');
  assert.equal(data.productIntents[0].viewCount, 2);
  assert.equal(data.miniappEvents.filter(event => event.type === 'product_view').length, 2);

  const orderStartedResponse = await fetch(`${base}/api/miniapp/shop/demo-retail-shop/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...viewEventBody, type: 'order_started' })
  });
  assert.equal(orderStartedResponse.status, 200);
  assert.equal(data.productIntents.length, 1);
  assert.equal(data.productIntents[0].source, 'order_started');
  assert.equal(data.productIntents[0].status, 'active');
  assert.equal(data.productIntents[0].telegramChatId, '12345');

  const cakeOrderResponse = await fetch(`${base}/api/miniapp/shop/sweet-demo-cakes/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      productId: 'p_cake',
      quantity: 1,
      customerName: 'Cake Buyer',
      phone: '0911333444',
      address: 'Bole near bakery test',
      shopperSessionId: 'ss_cake_device',
      cakeWritingText: 'Happy Birthday Hana',
      cakeNeededDate: '2026-01-05',
      cakeNeededTime: '15:30',
      specs: { theme_color: 'Gold' }
    })
  });
  assert.equal(cakeOrderResponse.status, 200);
  const cakeOrderResult = await cakeOrderResponse.json();
  assert.equal(cakeOrderResult.order.total, '1000');
  assert.equal(cakeOrderResult.order.paymentMode, 'deposit');
  assert.equal(cakeOrderResult.order.paymentDueNow, '300');
  assert.equal(cakeOrderResult.order.paymentBalanceAmount, '700');
  assert.equal(cakeOrderResult.order.cakeWritingText, 'Happy Birthday Hana');
  assert.equal(cakeOrderResult.payment.amount, '300');
  assert.equal(cakeOrderResult.payment.balanceAmount, '700');
  const savedCakeOrder = data.orders.find(order => order.clientId === 'client_cake');
  assert.equal(savedCakeOrder.cakeWritingText, 'Happy Birthday Hana');
  assert.equal(savedCakeOrder.paymentDueNow, '300');

  const cakeProduct = data.products.find(product => product.id === 'p_cake');
  cakeProduct.cakePaymentSettings = { paymentMode: 'delivery', depositType: 'percent', depositValue: 0 };
  const payOnDeliveryCakeResponse = await fetch(`${base}/api/miniapp/shop/sweet-demo-cakes/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      productId: 'p_cake',
      customerName: 'Delivery Cake Buyer',
      phone: '0911444555',
      address: 'Bole Atlas',
      quantity: 1,
      specs: { cake_size: '1 kg', flavor: 'Chocolate', theme_color: 'Pink' },
      shopperSessionId: 'ss_cake_delivery'
    })
  });
  assert.equal(payOnDeliveryCakeResponse.status, 200);
  const payOnDeliveryCake = await payOnDeliveryCakeResponse.json();
  assert.equal(payOnDeliveryCake.order.paymentMode, 'delivery');
  assert.equal(payOnDeliveryCake.order.paymentDueNow, '0');
  assert.equal(payOnDeliveryCake.payment.ready, false);
  assert.equal(payOnDeliveryCake.payment.amount, '');

  const orderResponse = await fetch(`${base}/api/miniapp/shop/demo-retail-shop/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      productId: 'p_active',
      quantity: 2,
      customerName: 'Daniel Test',
      phone: '0911000000',
      address: 'Bole near Atlas',
      telegramChatId: '12345',
      telegramUserId: '12345',
      telegramUsername: 'daniel_test',
      shopperSessionId: 'ss_test_device',
      specs: { strap: 'Leather' }
    })
  });
  assert.equal(orderResponse.status, 200);
  const orderResult = await orderResponse.json();
  const retailTrackingCode = orderResult.order.trackingCode;
  assert.match(retailTrackingCode, /^#[A-Za-z0-9]{8}$/);
  assert.equal(orderResult.order.deliveryFee, '80');
  assert.equal(orderResult.order.total, '9080');
  assert.equal(orderResult.payment.mode, 'automatic');
  assert.equal(orderResult.payment.options[0].accountNumber, '1000123456789');
  assert.equal(data.orders.length, 3);
  const retailOrder = data.orders.find(order => order.clientId === 'client_1' && order.productId === 'p_active');
  assert.ok(retailOrder);
  assert.equal(retailOrder.customerId, data.customers[0].id);
  assert.equal(retailOrder.telegramChatId, '12345');
  assert.equal(retailOrder.shopperSessionId, 'ss_test_device');
  assert.equal(retailOrder.selectedColor, 'Black');
  assert.equal(retailOrder.selectedOption, 'Leather');
  assert.equal(data.productIntents[0].status, 'ordered');
  assert.equal(data.productIntents[0].orderId, retailOrder.id);

  const myOrdersResponse = await fetch(`${base}/api/miniapp/shop/demo-retail-shop/my-orders?sessionId=ss_test_device`);
  assert.equal(myOrdersResponse.status, 200);
  const myOrders = await myOrdersResponse.json();
  assert.equal(myOrders.orders.length, 1);
  assert.equal(myOrders.orders[0].trackingCode, retailTrackingCode);
  assert.equal(myOrders.orders[0].productImageUrl, '/uploads/products/client_1/watch.watermarked-1.jpg');

  const resumeResponse = await fetch(`${base}/api/miniapp/shop/demo-retail-shop/orders/${encodeURIComponent(retailOrder.id)}/resume-payment?sessionId=ss_test_device`);
  assert.equal(resumeResponse.status, 200);
  const resumeResult = await resumeResponse.json();
  assert.equal(resumeResult.order.id, retailOrder.id);
  assert.equal(resumeResult.payment.options[0].accountNumber, '1000123456789');

  const trackResponse = await fetch(`${base}/api/miniapp/shop/demo-retail-shop/orders/track?code=${encodeURIComponent(orderResult.order.trackingCode)}&phone=${encodeURIComponent('+251911000000')}`);
  assert.equal(trackResponse.status, 200);
  const trackResult = await trackResponse.json();
  assert.equal(trackResult.order.trackingCode, retailTrackingCode);
  assert.equal(trackResult.order.productName, 'Smart Fitness Watch');
  assert.match(trackResult.order.nextStep, /Payment proof|paid|delivery|payment/i);

  const wrongPhoneTrack = await fetch(`${base}/api/miniapp/shop/demo-retail-shop/orders/track?code=${encodeURIComponent(orderResult.order.trackingCode)}&phone=0922000000`);
  assert.equal(wrongPhoneTrack.status, 404);

  const sessionTrack = await fetch(`${base}/api/miniapp/shop/demo-retail-shop/orders/track?code=${encodeURIComponent(orderResult.order.trackingCode)}&sessionId=ss_test_device`);
  assert.equal(sessionTrack.status, 200);
  const sessionTrackResult = await sessionTrack.json();
  assert.equal(sessionTrackResult.order.trackingCode, retailTrackingCode);

  const proofResponse = await fetch(`${base}/api/miniapp/shop/demo-retail-shop/orders/${encodeURIComponent(retailOrder.id)}/payment-proof`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proofText: 'CBE payment successful. Ref FT123456789 amount 9080', shopperSessionId: 'ss_test_device', telegramChatId: '12345' })
  });
  assert.equal(proofResponse.status, 200);
  const proofResult = await proofResponse.json();
  assert.equal(proofResult.status, 'verified');
  assert.equal(data.paymentProofs.length, 1);
  const paidRetailOrder = data.orders.find(order => order.id === retailOrder.id);
  assert.equal(paidRetailOrder.paymentStatus, 'paid');
  assert.equal(paidRetailOrder.paymentVerificationReference, 'FT123456789');
  assert.equal(customerTelegramMessages.length, 1);
  assert.equal(customerTelegramMessages[0].chatId, '12345');
  assert.match(customerTelegramMessages[0].text, /Payment confirmed/);
  assert.ok(customerTelegramMessages[0].text.includes(retailTrackingCode));

  const cakeProofResponse = await fetch(`${base}/api/miniapp/shop/sweet-demo-cakes/orders/${encodeURIComponent(savedCakeOrder.id)}/payment-proof`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proofText: 'CBE payment successful. Ref FTCAKE123 amount 300', shopperSessionId: 'ss_cake_device' })
  });
  assert.equal(cakeProofResponse.status, 200);
  const cakeProofResult = await cakeProofResponse.json();
  assert.equal(cakeProofResult.status, 'verified');
  const paidCakeOrder = data.orders.find(order => order.id === savedCakeOrder.id);
  assert.equal(paidCakeOrder.paymentStatus, 'deposit_paid');
  assert.equal(paidCakeOrder.paymentBalanceAmount, '700');

  const stolenProofResponse = await fetch(`${base}/api/miniapp/shop/demo-retail-shop/orders/${encodeURIComponent(retailOrder.id)}/payment-proof`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proofText: 'Ref OTHER', shopperSessionId: 'someone_else' })
  });
  assert.equal(stolenProofResponse.status, 403);

  const inactiveOrder = await fetch(`${base}/api/miniapp/shop/demo-retail-shop/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      productId: 'p_inactive',
      customerName: 'Daniel Test',
      phone: '0911000000',
      address: 'Bole'
    })
  });
  assert.equal(inactiveOrder.status, 404);

  const pendingResponse = await fetch(`${base}/api/miniapp/shop/pending-shop`);
  assert.equal(pendingResponse.status, 404);

  const pageResponse = await fetch(`${base}/shop/demo-retail-shop`);
  assert.equal(pageResponse.status, 200);
  assert.match(await pageResponse.text(), /doctype html/i);
} finally {
  server.close();
  await fs.rm(tmp, { recursive: true, force: true });
}

console.log('miniapp route tests passed');
