const assert = require('node:assert/strict');
const {
  initProductflow,
  normalizeProduct,
  normalizeProductImages,
  isProductVisible,
  generateProductflowGreeting,
  handleProductflowCallback,
  handleProductflowText,
  handlePaymentScreenshot
} = require('./productflow_router.cjs');

const sentNotifications = [];
let visionCalls = 0;
initProductflow({
  sendClientNotification: async (...args) => sentNotifications.push(args),
  getBot: () => null,
  getVisionApiKey: () => 'test-key',
  askGeminiMedia: async () => {
    visionCalls += 1;
    return 'Amount: 690\nSender: Test Buyer\nReference: ABC';
  },
  findCheckoutMatch: ({ client, mainProduct }) => {
    if (mainProduct?.id !== 'p7') return null;
    const product = (client.products || []).find(item => item.id === 'p11');
    return product ? {
      trigger: true,
      product,
      price: 1200,
      reason: 'case',
      uiHeadline: 'People also buy for their Samsung Galaxy S24 Ultra'
    } : null;
  }
});

const data = {
  orders: [],
  products: [
    {
      id: 'p1',
      clientId: 'client1',
      name: 'Premium Phone Case',
      code: 'PC-300',
      category: 'Accessories',
      price: 350,
      status: 'active',
      sizes: ['Small', 'Medium'],
      colors: ['Black', 'Blue']
    },
    {
      id: 'p2',
      clientId: 'client1',
      name: 'Text Only Item',
      productCode: 'TXT-1',
      category: 'Accessories',
      sellingPrice: 100,
      isActive: true
    },
    {
      id: 'p4',
      clientId: 'client1',
      name: 'Batch Product Three',
      code: 'B-3',
      category: 'Accessories',
      price: 200,
      status: 'active'
    },
    {
      id: 'p5',
      clientId: 'client1',
      name: 'Batch Product Four',
      code: 'B-4',
      category: 'Accessories',
      price: 250,
      status: 'active'
    },
    {
      id: 'p6',
      clientId: 'client1',
      name: 'Batch Product Five',
      code: 'B-5',
      category: 'Accessories',
      price: 300,
      status: 'active'
    },
    {
      id: 'p7',
      clientId: 'client1',
      name: 'Samsung Galaxy S24 Ultra Smart Phone',
      code: 'PH-1',
      category: 'Electronics',
      price: 15000,
      status: 'active',
      options: '128GB, 256GB',
      colors: 'Black, Blue',
      detailedSearchDescription: 'black smartphone mobile phone with large screen and 256GB storage option',
      images: [
        { originalPath: 'C:\\tmp\\phone-original-1.jpg', publicPath: 'C:\\tmp\\phone-public-1.jpg', isPrimary: true },
        { originalPath: 'C:\\tmp\\phone-original-2.jpg', publicPath: 'C:\\tmp\\phone-public-2.jpg' },
        { originalPath: 'C:\\tmp\\phone-original-3.jpg', publicPath: 'C:\\tmp\\phone-public-3.jpg' }
      ]
    },
    {
      id: 'p11',
      clientId: 'client1',
      name: 'Shockproof Case for Samsung Galaxy S24 Ultra',
      code: 'CASE-S24',
      category: 'Phone Accessories',
      price: 1200,
      status: 'active',
      colors: ['Black', 'Clear']
    },
    {
      id: 'p8',
      clientId: 'client1',
      name: "Men's Jeans",
      code: 'MJ-1',
      category: "Men's Clothing",
      subcategory: "Men's jeans",
      price: 1200,
      status: 'active',
      sizes: ['30', '32', '34'],
      colors: ['Blue', 'Black']
    },
    {
      id: 'p9',
      clientId: 'client1',
      name: "Women's Jeans",
      code: 'WJ-1',
      category: "Women's Clothing",
      subcategory: "Women's jeans",
      price: 1300,
      status: 'active',
      sizes: ['28', '30', '32'],
      colors: ['Blue', 'Black']
    },
    {
      id: 'p10',
      clientId: 'client1',
      name: "Women's Shurab",
      code: 'SH-1',
      category: "Women's Clothing",
      subcategory: 'Shirts / T-Shirts / Tops',
      price: 900,
      status: 'active',
      sizes: ['Small', 'Medium', 'Large'],
      colors: ['Black', 'White'],
      options: '4GB RAM, 6GB RAM'
    },
    {
      id: 'p3',
      clientId: 'client1',
      name: 'Hidden Item',
      code: 'HID-1',
      category: 'Accessories',
      price: 10,
      status: 'hidden',
      isActive: false
    }
  ]
};

const client = {
  id: 'client1',
  businessName: 'Sprint Test Shop',
  billing: { plan: 'pro' },
  settings: {
    shopperLanguage: 'english',
    delivery: {
      addis_delivery_fee: 120,
      outside_addis_behavior: 'manual_confirmation',
      zones: [
        { area: 'Bole Atlas', fee: 60, maxHours: 3, enabled: true },
        { area: 'Bole Rwanda', fee: 70, maxHours: 4, enabled: true }
      ]
    },
    discounts: {
      enabled: true,
      allowStacking: false,
      newBuyer: { enabled: true, type: 'percent', value: 10 },
      repeatBuyer: { enabled: true, type: 'percent', value: 5, purchaseCount: 1 },
      birthdayWeek: { enabled: true, type: 'percent', value: 15 },
      codes: [{ code: 'SAVE20', enabled: true, type: 'percent', value: 20, maxUses: 0, maxUsesPerCustomer: 1 }]
    },
    paymentOptions: [{ method: 'Telebirr', accountNumber: '0911000000', accountName: 'Sprint Test Shop' }],
    telegramOwnerChatId: '123456789'
  }
};
const conversation = {
  id: 'conv1',
  telegramChatId: 'chat1',
  customer: { name: '', username: 'buyer' },
  shopperLanguage: 'english',
  stage: 'greeting',
  stageState: {}
};

const ctx = {
  sent: [],
  mediaGroups: [],
  telegramMessages: [],
  chat: { id: 'chat1' },
  telegram: {
    sendMessage: async function (chatId, text, extra = {}) {
      ctx.telegramMessages.push({ chatId, text, extra });
    }
  },
  reply: async function (text, extra = {}) {
    this.sent.push({ type: 'text', text, extra });
  },
  replyWithPhoto: async function (photo, extra = {}) {
    this.sent.push({ type: 'photo', photo, ...extra });
  },
  replyWithMediaGroup: async function (media) {
    this.mediaGroups.push(media);
  }
};

const sendTextThroughRouter = async text => {
  const result = await handleProductflowText(data, client, conversation, ctx, text);
  if (Array.isArray(result?.batchProducts)) {
    for (const item of result.batchProducts) {
      await ctx.reply(item.reply, item.buttons?.length ? { reply_markup: { inline_keyboard: item.buttons } } : {});
    }
    return result;
  }
  if (result?.reply) await ctx.reply(result.reply, result.buttons?.length ? { reply_markup: { inline_keyboard: result.buttons } } : {});
  return result;
};

const sendTextForConversation = async (conv, text) => {
  const result = await handleProductflowText(data, client, conv, ctx, text);
  if (Array.isArray(result?.batchProducts)) {
    for (const item of result.batchProducts) {
      await ctx.reply(item.reply, item.buttons?.length ? { reply_markup: { inline_keyboard: item.buttons } } : {});
    }
    return result;
  }
  if (result?.reply) await ctx.reply(result.reply, result.buttons?.length ? { reply_markup: { inline_keyboard: result.buttons } } : {});
  return result;
};

(async () => {
  const normalized = normalizeProduct({
    id: 'x',
    name: 'Current Schema Product',
    productCode: 'CSP-1',
    category: 'Shoes',
    price: 1,
    imageUrl: '',
    status: 'active'
  });
  assert.equal(normalized.code, 'CSP-1');
  assert.equal(isProductVisible(normalized), true);
  assert.deepEqual(
    normalizeProductImages({ images: [{ publicPath: 'public-a.jpg' }, 'legacy-b.jpg'] }).map(item => item.publicPath),
    ['public-a.jpg', 'legacy-b.jpg']
  );
  assert.equal(isProductVisible(normalizeProduct({ name: 'No image', price: 1, status: 'active' })), true);
  assert.notEqual(isProductVisible(normalizeProduct({ name: 'No price', status: 'active' })), true);
  assert.notEqual(isProductVisible(normalizeProduct({ name: 'Gone', price: 1, status: 'active', availability: 'out_of_stock' })), true);

  const greeting = await generateProductflowGreeting(client, conversation, data);
  assert.match(greeting.reply, /Welcome/);
  assert.equal(greeting.buttons[0][0].callback_data, 'productflow:explore');

  await handleProductflowCallback(data, client, conversation, ctx, 'explore');
  const exploreReply = ctx.sent.at(-1);
  assert.match(exploreReply.text, /Product Categories/);
  assert.ok(exploreReply.extra.reply_markup.inline_keyboard.some(row => row.some(btn => btn.callback_data === 'productflow:category:accessories')));

  await handleProductflowCallback(data, client, conversation, ctx, 'category:accessories');
  const firstBatch = ctx.sent.slice(-4);
  assert.equal(firstBatch.length, 4);
  assert.match(firstBatch[0].text, /Premium Phone Case/);
  assert.match(firstBatch[3].text, /Batch Product Four/);
  assert.ok(firstBatch[0].extra.reply_markup.inline_keyboard.some(row => row.some(btn => btn.callback_data === 'productflow:order:p1')));
  assert.ok(firstBatch[3].extra.reply_markup.inline_keyboard.some(row => row.some(btn => btn.callback_data === 'productflow:page:accessories:all:1')));

  await handleProductflowCallback(data, client, conversation, ctx, 'category:accessories');
  const p1Intent = data.productIntents.find(item => item.productId === 'p1' && item.telegramChatId === conversation.telegramChatId);
  assert.equal(p1Intent.viewCount, 2);
  assert.equal(p1Intent.status, 'active');

  await handleProductflowCallback(data, client, conversation, ctx, 'page:accessories:all:1');
  assert.match(ctx.sent.at(-1).text, /Batch Product Five/);
  assert.ok(ctx.sent.at(-1).extra.reply_markup.inline_keyboard.some(row => row.some(btn => btn.callback_data === 'productflow:page:accessories:all:0')));

  await handleProductflowCallback(data, client, conversation, ctx, 'search');
  assert.match(ctx.sent.at(-1).text, /product code/);
  assert.doesNotMatch(ctx.sent.at(-1).text, /screenshot|photo/i);
  await sendTextThroughRouter('PH-1');
  assert.match(ctx.sent.at(-1).text, /Smart Phone/);
  assert.ok(ctx.sent.at(-1).extra.reply_markup.inline_keyboard.some(row => row.some(btn => btn.callback_data === 'productflow:order:p7')));
  assert.ok(!ctx.sent.at(-1).extra.reply_markup.inline_keyboard.some(row => row.some(btn => btn.callback_data === 'productflow:gallery:p7')));
  await handleProductflowCallback(data, client, conversation, ctx, 'search');
  await sendTextThroughRouter('large screen 256gb mobile');
  assert.match(ctx.sent.at(-1).text, /Smart Phone/);
  conversation.stage = 'greeting';
  conversation.stageState = {};
  await sendTextThroughRouter('do you have 256gb smartphone');
  assert.match(ctx.sent.at(-1).text, /Smart Phone/);
  conversation.stage = 'greeting';
  conversation.stageState = {};
  const jeansResult = await sendTextThroughRouter('Jeans men');
  assert.match(jeansResult.batchProducts[0].reply, /Men's Jeans|Men.*Jeans/i);
  assert.ok(jeansResult.batchProducts[0].buttons.some(row => row.some(btn => btn.callback_data === 'productflow:order:p8')));

  await handleProductflowCallback(data, client, conversation, ctx, 'support');
  assert.match(ctx.sent.at(-1).text, /shop information/i);
  const notificationCountBeforeSupportAnswer = sentNotifications.length;
  await sendTextThroughRouter('How much is delivery to Bole Atlas?');
  assert.match(ctx.sent.at(-1).text, /Bole Atlas is 60 Birr/);
  assert.equal(sentNotifications.length, notificationCountBeforeSupportAnswer);
  conversation.stage = 'greeting';
  conversation.stageState = {};

  await handleProductflowCallback(data, client, conversation, ctx, 'order:p1');
  assert.equal(conversation.stage, 'order_collection');
  assert.match(ctx.sent.at(-1).text, /choice|pick|fit/i);
  assert.match(ctx.sent.at(-1).text, /full name/);

  await sendTextThroughRouter('Abebe Kebede, Bole Atlas, Addis Ababa, 0911223344');
  assert.match(ctx.sent.at(-1).text, /How many/i);
  await sendTextThroughRouter('2');
  assert.match(ctx.sent.at(-1).text, /size/i);
  assert.ok(ctx.sent.at(-1).extra.reply_markup.inline_keyboard.some(row => row.some(btn => btn.callback_data === 'productflow:spec:size:1')));
  await handleProductflowCallback(data, client, conversation, ctx, 'spec:size:1');
  assert.match(ctx.sent.at(-1).text, /color/i);
  await handleProductflowCallback(data, client, conversation, ctx, 'spec:color:0');
  const summary = ctx.sent.at(-1);
  assert.match(summary.text, /Order Confirmation/);
  assert.match(summary.text, /Quantity: 2/);
  assert.match(summary.text, /Size: Medium/);
  assert.match(summary.text, /Color: Black/);
  assert.match(summary.text, /New buyer discount: -70 Birr/);
  assert.ok(summary.extra.reply_markup.inline_keyboard.some(row => row.some(btn => btn.callback_data.startsWith('productflow:confirm_order:'))));

  const orderId = conversation.stageState?.order?.id;
  await handleProductflowCallback(data, client, conversation, ctx, `confirm_order:${orderId}`);
  assert.equal(data.orders.length, 1);
  assert.equal(data.orders[0].status, 'confirmed');
  assert.equal(data.orders[0].quantity, 2);
  assert.equal(data.orders[0].deliveryFee, '60');
  assert.equal(data.orders[0].deliveryArea, 'Bole Atlas');
  assert.equal(data.orders[0].deliveryMaxHours, 3);
  assert.equal(data.orders[0].discountAmount, '70');
  assert.equal(data.orders[0].discountReason, 'new_buyer');
  assert.equal(data.orders[0].total, '690');
  assert.ok((data.customers || []).some(customer => customer.phone === '0911223344' && customer.address.includes('Bole Atlas')));
  assert.equal(data.orders[0].paymentStatus, 'awaiting_screenshot');
  assert.match(ctx.sent.at(-1).text, /Telebirr/);
  assert.match(ctx.sent.at(-1).text, /payment screenshot/i);
  assert.equal(sentNotifications.length, 1);
  assert.ok(data.productIntents.some(item => item.productId === 'p1' && item.status === 'completed' && item.orderId === orderId));

  data.paymentProofs = [{ id: 'proof1', clientId: client.id, orderId, status: 'pending' }];
  data.orders[0].paymentProofId = 'proof1';
  data.orders[0].paymentStatus = 'pending_verification';
  const ownerConversation = { id: 'owner-conv', telegramChatId: '123456789', customer: {}, shopperLanguage: 'english', stage: 'greeting', stageState: {} };
  const ownerCtx = {
    ...ctx,
    sent: [],
    chat: { id: '123456789' },
    reply: async function (text, extra = {}) { this.sent.push({ type: 'text', text, extra }); }
  };
  await handleProductflowCallback(data, client, ownerConversation, ownerCtx, `owner_confirm:${orderId}`);
  assert.equal(data.orders[0].paymentStatus, 'paid');
  assert.equal(data.orders[0].deliveryMaxHours, 3);
  assert.ok(data.orders[0].deliveryStartedAt);
  assert.equal(data.paymentProofs[0].status, 'verified');
  assert.ok(ctx.telegramMessages.some(message => message.chatId === 'chat1' && /Payment confirmed/.test(message.text)));
  assert.ok(ctx.telegramMessages.some(message => message.chatId === 'chat1' && /Delivery status/.test(message.text)));
  assert.ok(ctx.telegramMessages.some(message => message.extra?.reply_markup?.inline_keyboard?.some(row => row.some(btn => btn.copy_text?.text === `#${orderId.slice(-8)}`))));
  assert.ok(!ctx.telegramMessages.some(message => message.extra?.reply_markup?.inline_keyboard?.some(row => row.some(btn => btn.callback_data === `productflow:delivery_received:${orderId}`))));
  await handleProductflowCallback(data, client, conversation, ctx, 'track_order');
  await sendTextThroughRouter(`#${orderId.slice(-8)}`);
  assert.ok(!ctx.sent.at(-1).extra.reply_markup.inline_keyboard.some(row => row.some(btn => btn.copy_text?.text === `#${orderId.slice(-8)}`)));
  assert.ok(ctx.sent.at(-1).extra.reply_markup.inline_keyboard.some(row => row.some(btn => btn.callback_data === 'productflow:main_menu')));
  conversation.stage = 'product_search';
  await sendTextThroughRouter(`#${orderId.slice(-8)}`);
  assert.match(ctx.sent.at(-1).text, new RegExp(`#${orderId.slice(-8)}`));
  assert.ok(ctx.sent.at(-1).extra.reply_markup.inline_keyboard.some(row => row.some(btn => btn.callback_data === 'productflow:main_menu')));

  await handleProductflowCallback(data, client, conversation, ctx, `delivery_not_received:${orderId}`);
  assert.match(ctx.sent.at(-1).text, /maximum delivery time has not passed/i);
  await handleProductflowCallback(data, client, conversation, ctx, `delivery_received:${orderId}`);
  assert.equal(data.orders[0].deliveryStatus, 'delivered');
  assert.equal(data.orders[0].reviewStatus, 'pending');
  assert.ok(data.orders[0].reviewDueAt);
  await handleProductflowCallback(data, client, conversation, ctx, `review_rating:${orderId}:5`);
  assert.equal(data.orders[0].reviewRating, 5);
  assert.equal(data.orders[0].reviewStatus, 'rated_5');
  assert.match(ctx.sent.at(-1).text, /photo review/i);

  const returningConversation = {
    id: 'conv-return',
    telegramChatId: 'chat1',
    customer: { name: 'Abebe Kebede', username: 'buyer', telegramChatId: 'chat1' },
    shopperLanguage: 'english',
    stage: 'greeting',
    stageState: {}
  };
  await handleProductflowCallback(data, client, returningConversation, ctx, 'order:p2');
  assert.match(ctx.sent.at(-1).text, /saved delivery details/i);
  await handleProductflowCallback(data, client, returningConversation, ctx, `use_saved_contact:${returningConversation.stageState.orderId}`);
  assert.match(ctx.sent.at(-1).text, /How many/i);

  const promoConversation = {
    id: 'conv-promo',
    telegramChatId: 'chat-promo',
    customer: { name: 'Sara' },
    shopperLanguage: 'english',
    stage: 'greeting',
    stageState: {}
  };
  await handleProductflowCallback(data, client, promoConversation, ctx, 'order:p2');
  await sendTextForConversation(promoConversation, 'Sara Tesfaye, Bole Atlas, Addis Ababa, 0911445566');
  await sendTextForConversation(promoConversation, '1');
  const promoOrderId = promoConversation.stageState?.order?.id;
  await handleProductflowCallback(data, client, promoConversation, ctx, `promo_code:${promoOrderId}`);
  await sendTextForConversation(promoConversation, 'SAVE20');
  assert.match(ctx.sent.at(-1).text, /Promo code SAVE20: -20 Birr/);

  const electronicsConversation = {
    id: 'conv2',
    telegramChatId: 'chat2',
    customer: { name: 'Mimi' },
    shopperLanguage: 'english',
    stage: 'greeting',
    stageState: {}
  };
  await handleProductflowCallback(data, client, electronicsConversation, ctx, 'order:p7');
  await sendTextForConversation(electronicsConversation, 'Mimi Tesfaye, Bole, Addis Ababa, 0911556677');
  assert.match(ctx.sent.at(-1).text, /more than one possible delivery area/i);
  assert.ok(ctx.sent.at(-1).extra.reply_markup.inline_keyboard.some(row => row.some(btn => btn.callback_data === 'productflow:delivery_area:0')));
  await handleProductflowCallback(data, client, electronicsConversation, ctx, 'delivery_area:0');
  await sendTextForConversation(electronicsConversation, '1');
  assert.match(ctx.sent.at(-1).text, /color/i);
  await handleProductflowCallback(data, client, electronicsConversation, ctx, 'spec:color:0');
  assert.match(ctx.sent.at(-1).text, /option/i);
  await handleProductflowCallback(data, client, electronicsConversation, ctx, 'spec:option:1');
  assert.match(ctx.sent.at(-1).text, /Option: 256GB/);
  const electronicsOrderId = electronicsConversation.stageState?.order?.id;
  await handleProductflowCallback(data, client, electronicsConversation, ctx, `confirm_order:${electronicsOrderId}`);
  assert.match(ctx.sent.at(-1).text, /People also buy/);
  assert.match(ctx.sent.at(-1).text, /Shockproof Case/);
  assert.ok(ctx.sent.at(-1).extra.reply_markup.inline_keyboard.some(row => row.some(btn => btn.callback_data === 'productflow:match_spec:color:0')));
  await handleProductflowCallback(data, client, electronicsConversation, ctx, 'match_spec:color:0');
  assert.match(ctx.sent.at(-1).text, /Ready to include/);
  await handleProductflowCallback(data, client, electronicsConversation, ctx, `match_add:${electronicsOrderId}`);
  const electronicsOrder = data.orders.find(item => item.id === electronicsOrderId);
  assert.equal(electronicsOrder.addOns.length, 1);
  assert.equal(electronicsOrder.addOns[0].productCode, 'CASE-S24');
  assert.equal(electronicsOrder.deliveryFee, '60');
  assert.equal(electronicsOrder.addOnSubtotal, '1200');
  assert.match(ctx.sent.at(-1).text, /Included add-on/);
  assert.match(ctx.sent.at(-1).text, /Please pay/);

  const fashionSpecConversation = {
    id: 'conv-fashion-spec',
    telegramChatId: 'chat-fashion-spec',
    customer: { name: 'Hana' },
    shopperLanguage: 'english',
    stage: 'greeting',
    stageState: {}
  };
  await handleProductflowCallback(data, client, fashionSpecConversation, ctx, 'order:p10');
  await sendTextForConversation(fashionSpecConversation, 'Hana Tadesse, Bole Atlas, Addis Ababa, 0911887766');
  await sendTextForConversation(fashionSpecConversation, '1');
  assert.match(ctx.sent.at(-1).text, /size/i);
  await handleProductflowCallback(data, client, fashionSpecConversation, ctx, 'spec:size:1');
  assert.match(ctx.sent.at(-1).text, /color/i);
  await handleProductflowCallback(data, client, fashionSpecConversation, ctx, 'spec:color:0');
  assert.match(ctx.sent.at(-1).text, /Order Confirmation/);
  assert.doesNotMatch(ctx.sent.at(-1).text, /RAM|Option:/i);

  data.customers.push({ id: 'cust-rec', clientId: client.id, telegramChatId: 'chat-rec', name: 'Rec Buyer' });
  data.productRecommendations = [{
    id: 'rec-test-1',
    clientId: client.id,
    customerId: 'cust-rec',
    telegramChatId: 'chat-rec',
    productId: 'p2',
    productCode: 'TXT-1',
    productName: 'Text Only Item',
    status: 'sent',
    sentAt: new Date().toISOString()
  }];
  const recConversation = {
    id: 'conv-rec',
    telegramChatId: 'chat-rec',
    customer: { name: 'Rec Buyer' },
    shopperLanguage: 'english',
    stage: 'greeting',
    stageState: {}
  };
  await handleProductflowCallback(data, client, recConversation, ctx, 'recommend_view:rec-test-1');
  assert.equal(data.productRecommendations[0].status, 'viewed');
  assert.match(ctx.sent.at(-1).text, /Text Only Item/);
  assert.ok(ctx.sent.at(-1).extra.reply_markup.inline_keyboard.some(row => row.some(btn => btn.callback_data === 'productflow:recommend_order:rec-test-1')));
  await handleProductflowCallback(data, client, recConversation, ctx, 'recommend_order:rec-test-1');
  assert.equal(data.productRecommendations[0].status, 'order_started');
  assert.equal(recConversation.stage, 'order_collection');

  data.productIntents.push({
    id: 'intent-test-1',
    clientId: client.id,
    conversationId: 'conv-intent',
    telegramChatId: 'chat-intent',
    productId: 'p8',
    productCode: 'MJ-1',
    productName: "Men's Jeans",
    status: 'reminded',
    remindersSent: 1,
    createdAt: new Date().toISOString()
  });
  const intentConversation = {
    id: 'conv-intent',
    telegramChatId: 'chat-intent',
    customer: { name: 'Intent Buyer' },
    shopperLanguage: 'english',
    stage: 'greeting',
    stageState: {}
  };
  await handleProductflowCallback(data, client, intentConversation, ctx, 'intent_view:intent-test-1');
  assert.match(ctx.sent.at(-1).text, /Men's Jeans/);
  assert.ok(ctx.sent.at(-1).extra.reply_markup.inline_keyboard.some(row => row.some(btn => btn.callback_data === 'productflow:intent_continue:intent-test-1:p8')));
  await handleProductflowCallback(data, client, intentConversation, ctx, 'intent_later:intent-test-1');
  assert.equal(data.productIntents.find(item => item.id === 'intent-test-1').status, 'dismissed');

  const paymentConversation = {
    id: 'conv-payment',
    telegramChatId: 'chat-payment',
    customer: { name: 'Payment Tester' },
    shopperLanguage: 'english',
    stage: 'payment',
    stageState: {
      order: {
        id: 'order_payment_test',
        productName: 'Premium Phone Case',
        productCode: 'PC-300',
        unitPrice: '350',
        deliveryFee: '60',
        total: '410',
        customerName: 'Payment Tester',
        phone: '0911000001',
        deliveryLocation: 'Bole Atlas'
      }
    }
  };
  await handlePaymentScreenshot(data, client, paymentConversation, ctx, 'photo-file-id', 'local-proof.jpg');
  assert.equal(visionCalls, 0);
  assert.equal(paymentConversation.stageState.order.paymentStatus, 'pending_verification');
  assert.equal(paymentConversation.stageState.order.paymentReference, '');

  console.log('productflow router tests passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
