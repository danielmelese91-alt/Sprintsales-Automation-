import { Input, Telegraf } from 'telegraf';
import i18n from '../config/shopper-i18n.cjs';

const { shopperText, setShopperLanguageContext } = i18n;
const t = (client, key, vars = {}, fallback = '') => shopperText(client, key, vars, fallback);
const applyBotShopperLanguage = (client, conversation = {}) => {
  setShopperLanguageContext?.(client, conversation.shopperLanguage || conversation.languagePreference || 'amharic');
  return client;
};

export function createTelegramBotRuntime(deps) {
  const {
    botRunners,
    accountRunners,
    fs,
    loadGramJs,
    readData,
    writeData,
    uid,
    now,
    clientFor,
    serviceAllowsAutomation,
    isProductBusiness,
    isServiceBusiness,
    getConversation,
    telegramCustomer,
    cancelStaleOrdersForConversation,
    generateProductflowGreeting,
    handleProductflowCallback,
    handleProductflowText,
    handleProductflowContact,
    prepareCustomerReply,
    productReplyText,
    recordBotError,
    recordBotEvent,
    productFromTelegramReply,
    findProductMention,
    classifyCustomerMessage,
    recoverConversationContext,
    orderFlowActive,
    conversationProductForMessage,
    routeCustomerIntent,
    detectHotLead,
    updateSalesStage,
    updateConversationSummary,
    upsertHotLead,
    upsertDraftOrder,
    notifyDraftOrder,
    upsertServiceBooking,
    notifyServiceBooking,
    activeConversationOrder,
    activeServiceBooking,
    deliveryFollowUpReply,
    businessDeliveryReply,
    orderProgressReply,
    orderStartReply,
    paymentInstructionsReply,
    orderConfirmationReply,
    businessContactReply,
    serviceCloseIntent,
    serviceFollowUpReply,
    salesObjectionReply,
    leadSourceReply,
    buildReply,
    shouldContinueServiceBooking,
    serviceBookingIntent,
    serviceSalesReply,
    bookingQuestion,
    productQuestionType,
    activeClientProducts,
    getPopulatedCategories,
    rememberProductChoices,
    productSampleReply,
    productSamplesDoneReply,
    productChoiceReply,
    productCatalogReply,
    servicePackageReply,
    safeFallbackReply,
    validateRoutedReply,
    isMissingKnowledgeReply,
    recordUnansweredQuestion,
    helpfulMissingReply,
    advanceProductGallery,
    applyConversationStage,
    downloadTelegramFile,
    shouldTreatImageAsPaymentProof,
    recordPaymentProof,
    paymentVerificationService,
    sendClientNotification,
    transcribeVoiceMessage,
    orderIntent,
    extractCustomerNameFromText,
    sendAdminAlert,
    addAuditLog
  } = deps;

  const stopBot = async clientId => {
    const runner = botRunners.get(clientId);
    if (runner) {
      botRunners.delete(clientId);
      try {
        runner.stop('settings changed');
      } catch (error) {
        console.error('Bot stop failed:', error.message);
      }
    }
    const accountRunner = accountRunners.get(clientId);
    if (accountRunner) {
      accountRunners.delete(clientId);
      try {
        await accountRunner.disconnect();
      } catch (error) {
        console.error('Account automation stop failed:', error.message);
      }
    }
  };
  
  const sendTelegramReply = async ({ ctx, client, conversation, product, products, reply }) => {
    try {
      const customerReply = prepareCustomerReply(reply, client);
      const sampleProducts = (products || []).filter(item => item?.imagePath).slice(0, 4);
      if (sampleProducts.length) {
        // Send photos with captions directly â€” skip redundant initial text message
        const sentProductMessages = [];
        for (const item of sampleProducts) {
          const caption = prepareCustomerReply(productReplyText(item, 'details'), client);
          const sentPhoto = await ctx.replyWithPhoto(Input.fromLocalFile(item.imagePath), { caption });
          if (sentPhoto?.message_id) sentProductMessages.push({ messageId: String(sentPhoto.message_id), productId: item.id, sentAt: now() });
        }
        if (sentProductMessages.length) {
          conversation.lastProductMessageMap = [
            ...(conversation.lastProductMessageMap || []),
            ...sentProductMessages
          ].slice(-40);
        }
        return true;
      }
      if (product?.imagePath) {
        const sentPhoto = await ctx.replyWithPhoto(Input.fromLocalFile(product.imagePath), { caption: customerReply });
        if (sentPhoto?.message_id) {
          conversation.lastProductMessageMap = [
            ...(conversation.lastProductMessageMap || []),
            { messageId: String(sentPhoto.message_id), productId: product.id, sentAt: now() }
          ].slice(-40);
        }
      } else {
        await ctx.reply(customerReply);
      }
      return true;
    } catch (error) {
      if (product?.imagePath) {
        try {
          await ctx.reply(prepareCustomerReply(reply, client));
          await recordBotError(null, {
            clientId: client.id,
            businessName: client.businessName,
            type: 'product-image-reply',
            message: `Product image failed, text fallback sent: ${error.message}`,
            severity: 'warn'
          });
          return true;
        } catch (fallbackError) {
          await recordBotError(null, {
            clientId: client.id,
            businessName: client.businessName,
            type: 'telegram-reply',
            message: `Product image and fallback reply failed: ${fallbackError.message}`,
            severity: 'error'
          });
          return false;
        }
      }
      await recordBotError(null, {
        clientId: client.id,
        businessName: client.businessName,
        type: 'telegram-reply',
        message: `Telegram reply failed for conversation ${conversation.id}: ${error.message}`,
        severity: 'error'
      });
      return false;
    }
  };
  
  const gramCustomer = async event => {
    const sender = await event.message?.getSender?.().catch(() => null);
    const senderId = event.message?.senderId ? String(event.message.senderId) : '';
    const name = [sender?.firstName, sender?.lastName].filter(Boolean).join(' ').trim();
    return {
      telegramUserId: senderId,
      telegramChatId: senderId,
      name,
      username: sender?.username ? `@${sender.username}` : ''
    };
  };
  
  const sendAccountReply = async ({ accountClient, peer, client, product, products, reply }) => {
    try {
      const customerReply = prepareCustomerReply(reply, client);
      const sampleProducts = (products || []).filter(item => item?.imagePath).slice(0, 4);
      if (sampleProducts.length) {
        await accountClient.sendMessage(peer, { message: customerReply });
        for (const item of sampleProducts) {
          await accountClient.sendFile(peer, { file: item.imagePath, caption: prepareCustomerReply(productReplyText(item, 'details'), client) });
        }
        return true;
      }
      if (product?.imagePath) {
        await accountClient.sendFile(peer, { file: product.imagePath, caption: customerReply });
      } else {
        await accountClient.sendMessage(peer, { message: customerReply });
      }
      return true;
    } catch (error) {
      if (product?.imagePath) {
        try {
          await accountClient.sendMessage(peer, { message: prepareCustomerReply(reply, client) });
          await recordBotError(null, {
            clientId: client.id,
            businessName: client.businessName,
            type: 'account-product-image-reply',
            message: `Account product image failed, text fallback sent: ${error.message}`,
            severity: 'warn'
          });
          return true;
        } catch (fallbackError) {
          await recordBotError(null, {
            clientId: client.id,
            businessName: client.businessName,
            type: 'account-reply',
            message: `Account reply failed: ${fallbackError.message}`,
            severity: 'error'
          });
          return false;
        }
      }
      await recordBotError(null, {
        clientId: client.id,
        businessName: client.businessName,
        type: 'account-reply',
        message: `Account reply failed: ${error.message}`,
        severity: 'error'
      });
      return false;
    }
  };
  
  const startAccount = async client => {
    await stopBot(client.id);
    if (!serviceAllowsAutomation(client) || !client.settings.isActive || client.settings.automationType !== 'account') return;
    if (client.settings.accountSessionStatus !== 'connected' || !client.settings.accountSessionString) return;
    const apiId = Number(client.settings.accountApiId);
    const apiHash = String(client.settings.accountApiHash || '');
    if (!apiId || !apiHash) return;
    const { TelegramClient, StringSession, NewMessage } = await loadGramJs();
    const accountClient = new TelegramClient(new StringSession(client.settings.accountSessionString), apiId, apiHash, {
      connectionRetries: 5
    });
    await accountClient.connect();
    const authorized = await accountClient.checkAuthorization();
    if (!authorized) {
      await recordBotError(null, {
        clientId: client.id,
        businessName: client.businessName,
        type: 'account-session',
        message: 'Dedicated account session is no longer authorized. Reconnect it from Settings.',
        severity: 'error'
      });
      return;
    }
  
    accountClient.addEventHandler(async event => {
      if (!event.isPrivate || !event.message || event.message.out) return;
      const text = String(event.message.message || '').trim();
      if (!text) return;
      const data = await readData();
      const currentClient = clientFor(data, client.id);
      if (!currentClient?.settings?.isActive || !serviceAllowsAutomation(currentClient)) return;
      const customer = await gramCustomer(event);
      const conversation = getConversation(data, currentClient.id, customer.telegramChatId);
      if (conversation.handoffMode === 'human') {
        conversation.updatedAt = now();
        data.messages.push({
          id: uid('msg'),
          clientId: currentClient.id,
          conversationId: conversation.id,
          direction: 'inbound',
          text,
          createdAt: now()
        });
        await writeData(data);
        return;
      }
      const replyToken = uid('reply');
      conversation.pendingReplyToken = replyToken;
      conversation.pendingReplyStartedAt = now();
      conversation.customer = customer;
      conversation.title = customer.username || customer.name || conversation.title;
      const repliedProduct = null;
      const preMentionedProduct = findProductMention(data, currentClient.id, text);
      const classification = classifyCustomerMessage(text, { conversation, currentProduct: preMentionedProduct });
      recoverConversationContext(conversation, classification, text);
      if (classification.resetStaleProduct && !orderFlowActive(data, currentClient, conversation)) conversation.lastProductId = '';
      const currentProduct = repliedProduct || conversationProductForMessage(data, currentClient, conversation, text, classification);
      if (currentProduct) conversation.lastProductId = currentProduct.id;
      // AGGRESSIVE PRODUCT SWITCH: cancel orders for different products when customer picks a new one
      if (currentProduct && data.orders) {
        const staleProductOrders = data.orders.filter(
          order => order.conversationId === conversation.id &&
            ['draft', 'confirmed'].includes(order.status || '') &&
            order.productId && order.productId !== currentProduct.id
        );
        for (const order of staleProductOrders) {
          order.status = 'cancelled';
          order.cancelledReason = `Customer switched to product ${currentProduct.code || currentProduct.id}`;
          order.updatedAt = now();
        }
        if (staleProductOrders.length) console.log(`Cancelled ${staleProductOrders.length} stale orders (product switch) for conversation ${conversation.id}`);
      }
      const customerRoute = routeCustomerIntent({ data, client: currentClient, conversation, text, classification, currentProduct });
      data.messages.push({
        id: uid('msg'),
        clientId: currentClient.id,
        conversationId: conversation.id,
        direction: 'inbound',
        text,
        createdAt: now()
      });
      const leadScore = detectHotLead(text);
      conversation.leadScore += leadScore;
      conversation.updatedAt = now();
  
      // Track sales stage and conversation context
      updateSalesStage(conversation, text);
      updateConversationSummary(conversation, text);
  
      const ctxLike = {
        from: {
          id: customer.telegramUserId,
          first_name: customer.name,
          username: customer.username.replace(/^@/, '')
        },
        chat: { id: customer.telegramChatId }
      };
      await upsertHotLead({ data, client: currentClient, conversation, ctx: ctxLike, text, leadScore });
      const draftOrder = customerRoute.route === 'order_flow' && currentProduct ? await upsertDraftOrder({ data, client: currentClient, conversation, product: currentProduct, text }) : null;
      if (draftOrder?.shouldNotify) await notifyDraftOrder({ data, client: currentClient, order: draftOrder.order, reason: draftOrder.notifyReason });
      const booking = upsertServiceBooking({ data, client: currentClient, conversation, text });
      if (booking?.shouldNotify) await notifyServiceBooking({ data, client: currentClient, booking: booking.booking, reason: booking.notifyReason });
      await writeData(data);
      const delayMs = Math.max(0, Number(currentClient.settings.replyDelayMinutes || 0)) * 60 * 1000;
      setTimeout(async () => {
        try {
          const fresh = await readData();
          const freshClient = clientFor(fresh, currentClient.id);
          if (!freshClient?.settings?.isActive || !serviceAllowsAutomation(freshClient)) return;
          const freshConversation = fresh.conversations.find(item => item.id === conversation.id) || conversation;
          if (freshConversation.pendingReplyToken && freshConversation.pendingReplyToken !== replyToken) return;
          let freshProduct = currentProduct
            ? (fresh.products || []).find(product => product.id === currentProduct.id && product.isActive !== false)
            : conversationProductForMessage(fresh, freshClient, freshConversation, text, classification);
          const freshRoute = routeCustomerIntent({ data: fresh, client: freshClient, conversation: freshConversation, text, classification, currentProduct: freshProduct });
          const productQuestion = productQuestionType(text);
          const freshOrder = activeConversationOrder(fresh, freshClient, freshConversation);
          const freshBooking = activeServiceBooking(fresh, freshClient, freshConversation) || (freshConversation.lastBookingId ? (fresh.bookings || []).find(item => item.id === freshConversation.lastBookingId) : null);
          const deliveryReply = freshRoute.route === 'order_flow' && /\b(deliver|delivery|send|ship|location|address|deliver to|send to|ship to|bole|megenagna|piassa|mexico|ayat|summit|cmc)\b/i.test(text)
            ? (deliveryFollowUpReply(freshClient, freshOrder, text) || businessDeliveryReply(freshClient, text))
            : '';
          const orderExitReply = /\b(cancel|stop|never mind|nevermind|forget|no thanks|no thank|don't want|not buying|not ordering|change my mind|i'm done|that's all|leave me|stop asking|i said|enough|hello|hi |hey|good morning|good afternoon|good evening)\b/i.test(text);
          const orderQuestion = freshRoute.route === 'order_flow' && !orderExitReply ? (deliveryReply || orderProgressReply(freshClient, freshOrder, text) || orderStartReply(freshClient, freshProduct)) : '';
          const paymentReply = ['order_flow', 'payment'].includes(freshRoute.route) ? paymentInstructionsReply(freshClient, freshOrder) : '';
          // Detect customer confirming order details
          if (freshOrder && /\b(yes|yeah|correct|right|confirmed|continue|proceed|go ahead|looks good|perfect|sounds good|ok|okay)\b/i.test(text) && freshOrder.confirmationPromptSentAt && !freshOrder.customerConfirmedOrder) {
            freshOrder.customerConfirmedOrder = true;
            freshOrder.updatedAt = now();
          }
          const orderConfirmReply = ['order_flow', 'payment'].includes(freshRoute.route) ? orderConfirmationReply(freshClient, freshOrder) : '';
          if (paymentReply) freshConversation.lastPaymentPromptAt = now();
          const contactReply = freshRoute.route === 'contact_info' ? businessContactReply(freshClient) : '';
          const freshTopicQuestion = classification.type === 'lead_source' || classification.type === 'service_question' || classification.type === 'business_general';
          const serviceMemoryReply = freshTopicQuestion && !serviceCloseIntent(text) ? '' : serviceFollowUpReply(fresh, freshClient, freshConversation, text);
          const objectionReply = !freshProduct && !orderQuestion ? salesObjectionReply(fresh, freshClient, text) : '';
          const leadSourceAnswer = freshRoute.route === 'lead_source' ? leadSourceReply(freshClient, text) : '';
          const knowledgeAnswer = freshRoute.route === 'service_question'
            ? await buildReply(fresh, freshClient, freshConversation, text)
            : '';
          const continueBooking = shouldContinueServiceBooking(freshBooking || booking?.booking, text, classification);
          const serviceQuestion = !serviceMemoryReply && !knowledgeAnswer && (serviceCloseIntent(text) || serviceBookingIntent(freshClient, text))
            ? serviceSalesReply(fresh, freshClient, freshBooking || booking?.booking, text)
            : (continueBooking ? bookingQuestion(freshBooking || booking?.booking) : '');
          // Detect price inquiry â€” suppress product image but KEEP product context for reply
          const priceInquiry = /\b(?:what('s| is)|how much|last price|final price|best price|lowest price|discount|price|[Hh]ow much is|[Hh]ow much does it cost)\b/i.test(text) || productQuestionType(text) === 'price';
          // priceInquiry flag set above â€” product image suppressed at send stage, product context preserved
          const productAnswer = freshRoute.route === 'product_detail' && freshProduct
            ? productReplyText(freshProduct, productQuestion)
            : '';
          let sampleProducts = freshRoute.route === 'product_samples' && !priceInquiry ? freshRoute.sampleProducts : [];
          const categoryProducts = freshRoute.route === 'product_search' ? freshRoute.categoryProducts : [];
          const catalogProducts = !categoryProducts.length && classification.type === 'product_browse'
            ? activeClientProducts(fresh, freshClient.id).slice(0, 6)
            : [];
          if (categoryProducts.length) rememberProductChoices(freshConversation, categoryProducts);
          else if (catalogProducts.length) rememberProductChoices(freshConversation, catalogProducts);
          const sampleReply = sampleProducts.length ? productSampleReply(sampleProducts) : '';
          const samplesDoneReply = freshRoute.route === 'product_samples_done' ? productSamplesDoneReply() : '';
          const categoryReply = categoryProducts.length ? productChoiceReply(categoryProducts, text) : '';
          const catalogReply = !categoryReply && catalogProducts.length ? productCatalogReply(fresh, freshClient.id) : '';
          const packageReply = isServiceBusiness(freshClient) && !freshProduct && !orderQuestion && !knowledgeAnswer && !serviceQuestion ? servicePackageReply(fresh, freshClient, text) : '';
          let reply = leadSourceAnswer || contactReply || orderQuestion || orderConfirmReply || paymentReply || productAnswer || sampleReply || samplesDoneReply || serviceMemoryReply || knowledgeAnswer || serviceQuestion || categoryReply || catalogReply || objectionReply || packageReply || (freshProduct ? productReplyText(freshProduct, productQuestion) : await buildReply(fresh, freshClient, freshConversation, text)) || safeFallbackReply(fresh, freshClient, classification);
          reply = validateRoutedReply({ data: fresh, client: freshClient, route: freshRoute, text, reply }) || safeFallbackReply(fresh, freshClient, classification);
          if (isMissingKnowledgeReply(reply)) {
            await recordUnansweredQuestion({
              data: fresh,
              client: freshClient,
              conversation: freshConversation,
              customer: freshConversation.customer,
              question: text
            });
            reply = helpfulMissingReply(freshClient, text, classification);
          }
          const sent = await sendAccountReply({ accountClient, peer: event.message.senderId, client: freshClient, product: freshProduct, products: sampleProducts, reply });
          if (!sent) {
            freshConversation.pendingReplyToken = '';
            freshConversation.updatedAt = now();
            await writeData(fresh);
            return;
          }
          freshConversation.pendingReplyToken = '';
          freshConversation.lastReplyToken = replyToken;
          if (sampleProducts.length) advanceProductGallery(freshConversation, sampleProducts);
          applyConversationStage(freshConversation, freshRoute, { product: freshProduct, order: freshOrder });
          freshConversation.updatedAt = now();
          fresh.messages.push({
            id: uid('msg'),
            clientId: freshClient.id,
            conversationId: freshConversation.id,
            direction: 'outbound',
            text: reply,
            createdAt: now()
          });
          await writeData(fresh);
        } catch (error) {
          const failed = await readData().catch(() => null);
          const failedConversation = failed?.conversations?.find(item => item.id === conversation.id);
          if (failedConversation?.pendingReplyToken === replyToken) {
            failedConversation.pendingReplyToken = '';
            failedConversation.lastReplyErrorAt = now();
            await writeData(failed).catch(() => null);
          }
          await recordBotError(null, {
            clientId: currentClient.id,
            businessName: currentClient.businessName,
            type: 'account-delayed-reply',
            message: `Dedicated account delayed reply failed: ${error.message}`,
            severity: 'error'
          });
        }
      }, delayMs);
    }, new NewMessage({ incoming: true }));
  
    accountRunners.set(client.id, accountClient);
  };
  
  const startBot = async client => {
    await stopBot(client.id);
    if (client.settings.automationType === 'account') return startAccount(client);
    if (!serviceAllowsAutomation(client) || client.settings.isActive !== true) return;
    if (!client.settings.botToken) return;
    const bot = new Telegraf(client.settings.botToken);
    const inlineKeyboard = buttons => buttons?.length ? { reply_markup: { inline_keyboard: buttons } } : {};
    const productflowReplyExtra = result => result?.replyKeyboard
      ? { reply_markup: result.replyKeyboard }
      : inlineKeyboard(result?.buttons);
    const removeProductflowReplyKeyboard = async (ctx, currentClient, result) => {
      if (!result?.removeReplyKeyboard) return;
      const text = t(currentClient, 'ORDER_REMOVE_KEYBOARD', {}, 'Got it.');
      await ctx.reply(text, { reply_markup: { remove_keyboard: true } }).catch(() => null);
    };
    const cleanShopperText = value => String(value || '').replace(/\*\*/g, '').replace(/`/g, '');
    const premiumWelcome = (currentClient, conversation) => {
      const name = String(conversation.customer?.name || '').split(/\s+/).filter(Boolean)[0] || 'there';
      const businessName = currentClient.businessName || 'our store';
      const lastWelcomeAt = conversation.lastWelcomeAt ? new Date(conversation.lastWelcomeAt).getTime() : 0;
      const returningSoon = Boolean(conversation.firstWelcomeAt && lastWelcomeAt && Date.now() - lastWelcomeAt <= 6 * 60 * 60 * 1000);
      const firstTime = !conversation.firstWelcomeAt;
      const intro = String(currentClient.settings?.businessProfile?.firstTimeWelcomeMessage || '').trim();
      const reply = [
        returningSoon
          ? `Welcome back ${name}! 😊 This is ${businessName}. How can we help you today?`
          : `Hello ${name}! 😊 Welcome to ${businessName}. How can we help you today?`,
        firstTime && intro ? intro : ''
      ].filter(Boolean).join('\n\n');
      return {
        reply,
        buttons: [
          [{ text: '🛍️ Browse Products', callback_data: 'productflow:explore' }],
          [
            { text: '🔍 Search', callback_data: 'productflow:search' },
            { text: '📦 Track Delivery', callback_data: 'productflow:track_order' }
          ],
          [{ text: '💬 Talk to Support', callback_data: 'productflow:support' }],
          [{ text: '💳 Submit Payment Proof', callback_data: 'productflow:payment_proof' }]
        ],
        stage: 'greeting'
      };
    };
    const productImageForTelegram = product => {
      const images = Array.isArray(product?.images) ? product.images : [];
      const first = images.find(item => item?.publicPath || item?.watermarkedPath || item?.originalPath) || {};
      return first.publicPath ||
        first.watermarkedPath ||
        product?.watermarkedImageUrl ||
        product?.publicImageUrl ||
        product?.imageWatermarked ||
        product?.imagePath ||
        product?.imageUrl ||
        product?.image ||
        first.originalPath ||
        '';
    };
    const sendProductflowCard = async (ctx, item) => {
      const cleanReply = cleanShopperText(item.reply || '');
      const extra = inlineKeyboard(item.buttons);
      const imagePath = productImageForTelegram(item.product);
      if (imagePath) {
        try {
          const source = /^https?:\/\//i.test(String(imagePath)) ? imagePath : Input.fromLocalFile(imagePath);
          await ctx.replyWithPhoto(source, {
            caption: cleanReply,
            reply_markup: extra.reply_markup
          });
          return cleanReply;
        } catch (error) {
          console.warn(`Product search image send failed for ${item.product?.name || item.product?.id || 'product'}:`, error.message);
        }
      }
      await ctx.reply(cleanReply, extra);
      return cleanReply;
    };
    const sendProductflowGreeting = async (data, currentClient, conversation, ctx) => {
      const greeting = await generateProductflowGreeting(currentClient, conversation, data);
      conversation.stage = greeting.stage || 'greeting';
      conversation.stageState = {};
      conversation.conversationState = 'welcome';
      conversation.firstWelcomeAt ||= now();
      conversation.lastWelcomeAt = now();
      await ctx.reply(greeting.reply, inlineKeyboard(greeting.buttons));
      data.messages.push({
        id: uid('msg'),
        clientId: currentClient.id,
        conversationId: conversation.id,
        direction: 'outbound',
        text: greeting.reply,
        createdAt: now()
      });
      addAuditLog?.(data, {
        user: null,
        action: 'bot.welcome',
        clientId: currentClient.id,
        target: conversation.customer?.username || conversation.customer?.name || conversation.telegramChatId,
        details: `Welcome menu shown to ${conversation.customer?.name || conversation.customer?.username || 'Telegram customer'}.`
      });
      conversation.updatedAt = now();
    };
    const recordProductflowEvent = (data, currentClient, conversation, callbackData, ctx) => {
      data.customerEvents ||= [];
      const action = String(callbackData || '').split(':')[0] || 'unknown';
      data.customerEvents.push({
        id: uid('event'),
        clientId: currentClient.id,
        conversationId: conversation.id,
        telegramChatId: String(ctx.chat?.id || ctx.callbackQuery?.message?.chat?.id || ''),
        type: 'productflow_callback',
        action,
        callback: String(callbackData || '').slice(0, 200),
        customerName: conversation.customer?.name || '',
        username: conversation.customer?.username || '',
        createdAt: now()
      });
      if (data.customerEvents.length > 5000) data.customerEvents = data.customerEvents.slice(-5000);
    };
    bot.on('callback_query', async ctx => {
      const cbData = String(ctx.callbackQuery?.data || '');
      if (!cbData.startsWith('productflow:')) return;
      await ctx.answerCbQuery().catch(() => null);
      const data = await readData();
      const currentClient = clientFor(data, client.id);
      if (!currentClient?.settings?.isActive || !serviceAllowsAutomation(currentClient) || !isProductBusiness(currentClient)) return;
      const conversation = getConversation(data, currentClient.id, ctx.chat?.id || ctx.callbackQuery?.message?.chat?.id);
      conversation.customer = telegramCustomer(ctx);
      conversation.title = conversation.customer.username || conversation.customer.name || conversation.title;
      conversation.updatedAt = now();
      const rawProductflowCallback = cbData.replace('productflow:', '');
      recordProductflowEvent(data, currentClient, conversation, rawProductflowCallback, ctx);
      const result = await handleProductflowCallback(data, currentClient, conversation, ctx, rawProductflowCallback);
      if (result?.needsGreetingRegen) {
        await sendProductflowGreeting(data, currentClient, conversation, ctx);
      }
      await writeData(data);
    });
    bot.on('contact', async ctx => {
      const data = await readData();
      const currentClient = clientFor(data, client.id);
      if (!currentClient?.settings?.isActive || !serviceAllowsAutomation(currentClient) || !isProductBusiness(currentClient)) return;
      const conversation = getConversation(data, currentClient.id, ctx.chat.id);
      const customer = telegramCustomer(ctx);
      conversation.customer = customer;
      conversation.title = customer.username || customer.name || conversation.title;
      conversation.updatedAt = now();
      const productflowContact = handleProductflowContact
        ? await handleProductflowContact(data, currentClient, conversation, ctx, ctx.message?.contact || {})
        : { handled: false };
      if (productflowContact?.handled) {
        if (productflowContact.reply) {
          const cleanReply = cleanShopperText(productflowContact.reply);
          await removeProductflowReplyKeyboard(ctx, currentClient, productflowContact);
          await ctx.reply(cleanReply, productflowReplyExtra(productflowContact));
          data.messages.push({
            id: uid('msg'),
            clientId: currentClient.id,
            conversationId: conversation.id,
            direction: 'outbound',
            text: cleanReply,
            createdAt: now()
          });
        }
        await writeData(data);
      }
    });
    bot.on('text', async ctx => {
      const data = await readData();
      const currentClient = clientFor(data, client.id);
      if (!currentClient?.settings?.isActive || !serviceAllowsAutomation(currentClient)) return;
      const text = ctx.message.text;
      const conversation = getConversation(data, currentClient.id, ctx.chat.id);
      const customer = telegramCustomer(ctx);
      conversation.customer = customer;
      conversation.title = customer.username || customer.name || conversation.title;
      if (isProductBusiness(currentClient)) {
        data.messages.push({
          id: uid('msg'),
          clientId: currentClient.id,
          conversationId: conversation.id,
          direction: 'inbound',
          text,
          createdAt: now()
        });
        if (/^\/start\b/i.test(text) || /^\s*(hi|hello|hey|selam|salam)\s*$/i.test(text)) {
          cancelStaleOrdersForConversation(data, conversation);
          await sendProductflowGreeting(data, currentClient, conversation, ctx);
          await writeData(data);
          return;
        }
        const productflowText = await handleProductflowText(data, currentClient, conversation, ctx, text);
        if (productflowText?.handled) {
          if (Array.isArray(productflowText.batchProducts) && productflowText.batchProducts.length) {
            for (const item of productflowText.batchProducts) {
              const sentText = await sendProductflowCard(ctx, item);
              data.messages.push({
                id: uid('msg'),
                clientId: currentClient.id,
                conversationId: conversation.id,
                direction: 'outbound',
                text: sentText,
                createdAt: now()
              });
              await new Promise(resolve => setTimeout(resolve, 150));
            }
          } else if (productflowText.product) {
            const sentText = await sendProductflowCard(ctx, productflowText);
            data.messages.push({
              id: uid('msg'),
              clientId: currentClient.id,
              conversationId: conversation.id,
              direction: 'outbound',
              text: sentText,
              createdAt: now()
            });
          } else
          if (productflowText.reply) {
            const cleanReply = cleanShopperText(productflowText.reply);
            await removeProductflowReplyKeyboard(ctx, currentClient, productflowText);
            await ctx.reply(cleanReply, productflowReplyExtra(productflowText));
            data.messages.push({
              id: uid('msg'),
              clientId: currentClient.id,
              conversationId: conversation.id,
              direction: 'outbound',
              text: cleanReply,
              createdAt: now()
            });
          }
          conversation.updatedAt = now();
          await writeData(data);
          return;
        }
        data.messages.pop();
      }
      if (conversation.handoffMode === 'human') {
        conversation.updatedAt = now();
        data.messages.push({
          id: uid('msg'),
          clientId: currentClient.id,
          conversationId: conversation.id,
          direction: 'inbound',
          text,
          createdAt: now()
        });
        recordBotEvent(data, currentClient, 'human-handoff-skip', `Bot skipped reply for ${conversation.title || conversation.telegramChatId} because human handoff is active.`, 'info');
        await writeData(data);
        return;
      }
      const replyToken = uid('reply');
      conversation.pendingReplyToken = replyToken;
      conversation.pendingReplyStartedAt = now();
      const repliedProduct = productFromTelegramReply(data, currentClient.id, ctx.message?.reply_to_message, conversation);
      const preMentionedProduct = repliedProduct || findProductMention(data, currentClient.id, text);
      const classification = classifyCustomerMessage(text, { conversation, currentProduct: preMentionedProduct });
      recoverConversationContext(conversation, classification, text);
      if (classification.resetStaleProduct && !orderFlowActive(data, currentClient, conversation)) conversation.lastProductId = '';
      const currentProduct = repliedProduct || conversationProductForMessage(data, currentClient, conversation, text, classification);
      if (currentProduct) conversation.lastProductId = currentProduct.id;
      // AGGRESSIVE PRODUCT SWITCH: cancel orders for different products when customer picks a new one
      if (currentProduct && data.orders) {
        const staleProductOrders = data.orders.filter(
          order => order.conversationId === conversation.id &&
            ['draft', 'confirmed'].includes(order.status || '') &&
            order.productId && order.productId !== currentProduct.id
        );
        for (const order of staleProductOrders) {
          order.status = 'cancelled';
          order.cancelledReason = `Customer switched to product ${currentProduct.code || currentProduct.id}`;
          order.updatedAt = now();
        }
        if (staleProductOrders.length) console.log(`Cancelled ${staleProductOrders.length} stale orders (product switch) for conversation ${conversation.id}`);
      }
      const customerRoute = routeCustomerIntent({ data, client: currentClient, conversation, text, classification, currentProduct });
      // Greeting â†’ immediately cancel any stale orders so bot starts fresh
      if (classification.type === 'greeting') {
        cancelStaleOrdersForConversation(data, conversation);
        conversation.salesStage = 'new';
      }
      conversation.customer = customer;
      conversation.title = customer.username || customer.name || conversation.title;
      // Extract customer name from text for personalized replies
      const extractedName = extractCustomerNameFromText(text);
      if (extractedName && !conversation.customerName) conversation.customerName = extractedName;
      data.messages.push({
        id: uid('msg'),
        clientId: currentClient.id,
        conversationId: conversation.id,
        direction: 'inbound',
        text,
        createdAt: now()
      });
      const leadScore = detectHotLead(text);
      conversation.leadScore += leadScore;
      conversation.updatedAt = now();
  
      // Track sales stage and conversation context
      updateSalesStage(conversation, text);
      updateConversationSummary(conversation, text);
  
      await upsertHotLead({ data, client: currentClient, conversation, ctx, text, leadScore });
      const draftOrder = customerRoute.route === 'order_flow' && currentProduct ? await upsertDraftOrder({ data, client: currentClient, conversation, product: currentProduct, text }) : null;
      if (draftOrder?.shouldNotify) await notifyDraftOrder({ data, client: currentClient, order: draftOrder.order, reason: draftOrder.notifyReason });
      const booking = upsertServiceBooking({ data, client: currentClient, conversation, text });
      if (booking?.shouldNotify) await notifyServiceBooking({ data, client: currentClient, booking: booking.booking, reason: booking.notifyReason });
      if (booking?.isNewBooking) {
        data.reminders.push({
          id: uid('reminder'),
          clientId: currentClient.id,
          title: `Confirm booking: ${booking.booking.customerName || booking.booking.username || 'Telegram customer'}`,
          type: 'production',
          dueDate: '',
          status: 'open',
          linkedOrderId: '',
          notes: booking.booking.lastMessage || '',
          createdAt: now(),
          updatedAt: now()
        });
      }
      await writeData(data);
      const delayMs = Math.max(0, Number(currentClient.settings.replyDelayMinutes || 0)) * 60 * 1000;
      setTimeout(async () => {
        try {
          const fresh = await readData();
          const freshClient = clientFor(fresh, currentClient.id);
          if (!freshClient?.settings?.isActive || !serviceAllowsAutomation(freshClient)) {
            if (freshClient) recordBotEvent(fresh, freshClient, 'reply-skipped', 'Reply skipped because automation became inactive before the delay finished.', 'info');
            await writeData(fresh);
            return;
          }
          const freshConversation = fresh.conversations.find(item => item.id === conversation.id) || conversation;
          if (freshConversation.pendingReplyToken && freshConversation.pendingReplyToken !== replyToken) {
            recordBotEvent(fresh, freshClient, 'stale-reply-skipped', 'Older delayed reply skipped because a newer customer message arrived.', 'info');
            await writeData(fresh);
            return;
          }
          let freshProduct = currentProduct
            ? (fresh.products || []).find(product => product.id === currentProduct.id && product.isActive !== false)
            : conversationProductForMessage(fresh, freshClient, freshConversation, text, classification);
          const freshRoute = routeCustomerIntent({ data: fresh, client: freshClient, conversation: freshConversation, text, classification, currentProduct: freshProduct });
          const productQuestion = productQuestionType(text);
          const freshOrder = activeConversationOrder(fresh, freshClient, freshConversation);
          const freshBooking = activeServiceBooking(fresh, freshClient, freshConversation) || (freshConversation.lastBookingId ? (fresh.bookings || []).find(booking => booking.id === freshConversation.lastBookingId) : null);
          const deliveryReply = freshRoute.route === 'order_flow' && /\b(deliver|delivery|send|ship|location|address|deliver to|send to|ship to|bole|megenagna|piassa|mexico|ayat|summit|cmc)\b/i.test(text)
            ? (deliveryFollowUpReply(freshClient, freshOrder, text) || businessDeliveryReply(freshClient, text))
            : '';
          const orderExitReply = /\b(cancel|stop|never mind|nevermind|forget|no thanks|no thank|don't want|not buying|not ordering|change my mind|i'm done|that's all|leave me|stop asking|i said|enough|hello|hi |hey|good morning|good afternoon|good evening)\b/i.test(text);
          const orderQuestion = freshRoute.route === 'order_flow' && !orderExitReply ? (deliveryReply || orderProgressReply(freshClient, freshOrder, text) || orderStartReply(freshClient, freshProduct)) : '';
          const paymentReply = ['order_flow', 'payment'].includes(freshRoute.route) ? paymentInstructionsReply(freshClient, freshOrder) : '';
          // Detect customer confirming order details
          if (freshOrder && /\b(yes|yeah|correct|right|confirmed|continue|proceed|go ahead|looks good|perfect|sounds good|ok|okay)\b/i.test(text) && freshOrder.confirmationPromptSentAt && !freshOrder.customerConfirmedOrder) {
            freshOrder.customerConfirmedOrder = true;
            freshOrder.updatedAt = now();
          }
          const orderConfirmReply = ['order_flow', 'payment'].includes(freshRoute.route) ? orderConfirmationReply(freshClient, freshOrder) : '';
          if (paymentReply) freshConversation.lastPaymentPromptAt = now();
          const contactReply = freshRoute.route === 'contact_info' ? businessContactReply(freshClient) : '';
          const freshTopicQuestion = classification.type === 'lead_source' || classification.type === 'service_question' || classification.type === 'business_general';
          const serviceMemoryReply = freshTopicQuestion && !serviceCloseIntent(text) ? '' : serviceFollowUpReply(fresh, freshClient, freshConversation, text);
          const objectionReply = !freshProduct && !orderQuestion ? salesObjectionReply(fresh, freshClient, text) : '';
          const leadSourceAnswer = freshRoute.route === 'lead_source' ? leadSourceReply(freshClient, text) : '';
          const knowledgeAnswer = freshRoute.route === 'service_question'
            ? await buildReply(fresh, freshClient, freshConversation, text)
            : '';
          const continueBooking = shouldContinueServiceBooking(freshBooking || booking?.booking, text, classification);
          const serviceQuestion = !serviceMemoryReply && !knowledgeAnswer && (serviceCloseIntent(text) || serviceBookingIntent(freshClient, text))
            ? serviceSalesReply(fresh, freshClient, freshBooking || booking?.booking, text)
            : (continueBooking ? bookingQuestion(freshBooking) : '');
          // Detect price inquiry â€” suppress product image but KEEP product context for reply
          const priceInquiry = /\b(?:what('s| is)|how much|last price|final price|best price|lowest price|discount|price|[Hh]ow much is|[Hh]ow much does it cost)\b/i.test(text) || productQuestionType(text) === 'price';
          // priceInquiry flag set above â€” product image suppressed at send stage, product context preserved
          const productAnswer = freshRoute.route === 'product_detail' && freshProduct
            ? productReplyText(freshProduct, productQuestion)
            : '';
          let sampleProducts = freshRoute.route === 'product_samples' && !priceInquiry ? freshRoute.sampleProducts : [];
          const categoryProducts = freshRoute.route === 'product_search' ? freshRoute.categoryProducts : [];
          const catalogProducts = !categoryProducts.length && classification.type === 'product_browse'
            ? activeClientProducts(fresh, freshClient.id).slice(0, 6)
            : [];
          if (categoryProducts.length) rememberProductChoices(freshConversation, categoryProducts);
          else if (catalogProducts.length) rememberProductChoices(freshConversation, catalogProducts);
          const sampleReply = sampleProducts.length ? productSampleReply(sampleProducts) : '';
          const samplesDoneReply = freshRoute.route === 'product_samples_done' ? productSamplesDoneReply() : '';
          const categoryReply = categoryProducts.length ? productChoiceReply(categoryProducts, text) : '';
          const catalogReply = !categoryReply && catalogProducts.length ? productCatalogReply(fresh, freshClient.id) : '';
          const packageReply = isServiceBusiness(freshClient) && !freshProduct && !orderQuestion && !knowledgeAnswer && !serviceQuestion ? servicePackageReply(fresh, freshClient, text) : '';
          let reply = leadSourceAnswer || contactReply || orderQuestion || orderConfirmReply || paymentReply || productAnswer || sampleReply || samplesDoneReply || serviceMemoryReply || knowledgeAnswer || serviceQuestion || categoryReply || catalogReply || objectionReply || packageReply || (freshProduct ? productReplyText(freshProduct, productQuestion) : await buildReply(fresh, freshClient, freshConversation, text)) || safeFallbackReply(fresh, freshClient, classification);
          reply = validateRoutedReply({ data: fresh, client: freshClient, route: freshRoute, text, reply }) || safeFallbackReply(fresh, freshClient, classification);
          if (isMissingKnowledgeReply(reply)) {
            await recordUnansweredQuestion({
              data: fresh,
              client: freshClient,
              conversation: freshConversation,
              customer: freshConversation.customer,
              question: text
            });
            reply = helpfulMissingReply(freshClient, text, classification);
          }
          // Debounce guard: skip if a reply was already sent within the last 5 seconds (prevents double replies)
          const duplicateReplyWindow = 5000;
          if (freshConversation.lastReplySentAt) {
            const lastReplyAgo = Date.now() - new Date(freshConversation.lastReplySentAt).getTime();
            if (lastReplyAgo < duplicateReplyWindow) {
              console.log(`Skipping duplicate reply for conversation ${freshConversation.id} (last reply was ${Math.round(lastReplyAgo/1000)}s ago)`);
              freshConversation.pendingReplyToken = '';
              freshConversation.updatedAt = now();
              await writeData(fresh);
              return;
            }
          }
          const replyProduct = (!priceInquiry && freshProduct) ? freshProduct : null;
          const sent = await sendTelegramReply({ ctx, client: freshClient, conversation: freshConversation, product: replyProduct, products: sampleProducts, reply });
          if (!sent) {
            freshConversation.pendingReplyToken = '';
            freshConversation.updatedAt = now();
            await writeData(fresh);
            return;
          }
          freshConversation.pendingReplyToken = '';
          freshConversation.lastReplyToken = replyToken;
          freshConversation.lastReplySentAt = now();
          if (sampleProducts.length) advanceProductGallery(freshConversation, sampleProducts);
          applyConversationStage(freshConversation, freshRoute, { product: freshProduct, order: freshOrder });
          freshConversation.updatedAt = now();
          fresh.messages.push({
            id: uid('msg'),
            clientId: freshClient.id,
            conversationId: freshConversation.id,
            direction: 'outbound',
            text: reply,
            createdAt: now()
          });
          await writeData(fresh);
        } catch (error) {
          const failed = await readData().catch(() => null);
          const failedConversation = failed?.conversations?.find(item => item.id === conversation.id);
          if (failedConversation?.pendingReplyToken === replyToken) {
            failedConversation.pendingReplyToken = '';
            failedConversation.lastReplyErrorAt = now();
            await writeData(failed).catch(() => null);
          }
          await recordBotError(null, {
            clientId: currentClient.id,
            businessName: currentClient.businessName,
            type: 'delayed-reply',
            message: `Delayed reply failed: ${error.message}`,
            severity: 'error'
          });
        }
      }, delayMs);
    });
    bot.on('photo', async ctx => {
      const data = await readData();
      const currentClient = clientFor(data, client.id);
      if (!currentClient?.settings?.isActive || !serviceAllowsAutomation(currentClient)) return;
      const conversation = getConversation(data, currentClient.id, ctx.chat.id);
      applyBotShopperLanguage(currentClient, conversation);
      if (conversation.handoffMode === 'human') return;
      const customer = telegramCustomer(ctx);
      conversation.customer = customer;
      conversation.title = customer.username || customer.name || conversation.title;
      conversation.updatedAt = now();
      const caption = String(ctx.message.caption || '');
      const photos = ctx.message?.photo || [];
      const photo = photos[photos.length - 1];
      const activeOrder = activeConversationOrder(data, currentClient, conversation);
      const likelyPaymentContext = conversation.stage === 'awaiting_payment_proof' ||
        ['awaiting_screenshot', 'under_review', 'pending_verification'].includes(String(activeOrder?.paymentStatus || '')) ||
        /\b(payment|paid|receipt|transfer|transaction|reference|ref|telebirr|cbe|bank|birr|etb|proof)\b/i.test(caption);
      const treatAsPaymentProof = conversation.stage === 'awaiting_payment_proof' ||
        likelyPaymentContext ||
        shouldTreatImageAsPaymentProof({ caption, analysis: { description: '', isPaymentProof: false, confidence: 0, type: 'unclear' }, productMatch: null, conversation, activeOrder });
      if (treatAsPaymentProof && paymentVerificationService?.canUseAutomatic?.(currentClient)) {
        data.messages.push({
          id: uid('msg'),
          clientId: currentClient.id,
          conversationId: conversation.id,
          direction: 'inbound',
          text: `[Payment proof image ignored in automatic mode] ${caption || ''}`.trim(),
          createdAt: now()
        });
        conversation.pendingReplyToken = '';
        await writeData(data);
        await ctx.reply('For automatic payment verification, please paste the bank/Telebirr SMS you received or the transaction/reference number as text. Screenshots are not used for automatic verification.').catch(console.error);
        return;
      }
      const proof = treatAsPaymentProof
        ? await recordPaymentProof({ data, client: currentClient, conversation, ctx })
        : null;
      data.messages.push({
        id: uid('msg'),
        clientId: currentClient.id,
        conversationId: conversation.id,
        direction: 'inbound',
        text: proof ? `[Payment proof image] ${proof.caption || ''}`.trim() : `[Image received] ${caption || ''}`.trim(),
        createdAt: now()
      });
      if (proof) {
        conversation.pendingReplyToken = '';
        await writeData(data);
        if (proof.status === 'verified' && proof.verifiedBy === 'verify.et') {
          return;
        }
        if (proof.status === 'rejected' && /duplicate payment/i.test(String(proof.verificationNote || ''))) {
          return;
        }
        await ctx.reply(`${t(currentClient, 'PAYMENT_PROOF_RECEIVED')}\n\n${t(currentClient, 'PAYMENT_WAIT_REVIEW')}`).catch(console.error);
        return;
      }
      const reply = `${t(currentClient, 'SEARCH_HELP')}\n\n${t(currentClient, 'SEARCH_SCREENSHOT_DISABLED', {}, 'Screenshot search is not available in this version.')}`;
      conversation.lastProductId = '';
      conversation.pendingReplyToken = '';
      await ctx.reply(reply).catch(console.error);
      data.messages.push({
        id: uid('msg'),
        clientId: currentClient.id,
        conversationId: conversation.id,
        direction: 'outbound',
        text: reply,
        createdAt: now()
      });
      conversation.pendingReplyToken = '';
      await writeData(data);
    });
    bot.on('voice', async ctx => {
      const data = await readData();
      const currentClient = clientFor(data, client.id);
      if (!currentClient?.settings?.isActive || !serviceAllowsAutomation(currentClient)) return;
      const conversation = getConversation(data, currentClient.id, ctx.chat.id);
      if (conversation.handoffMode === 'human') return;
      const customer = telegramCustomer(ctx);
      conversation.customer = customer;
      conversation.title = customer.username || customer.name || conversation.title;
      conversation.updatedAt = now();
      const fileId = ctx.message?.voice?.file_id;
      const filePath = fileId ? await downloadTelegramFile(ctx, fileId, 'telegram-voice.oga').catch(error => {
        console.error(`Telegram voice download failed for ${currentClient.businessName}:`, error.message);
        return '';
      }) : '';
      const transcript = filePath ? await transcribeVoiceMessage(currentClient, filePath) : '';
      if (filePath) await fs.unlink(filePath).catch(() => null);
      const text = transcript.trim();
      if (!text) {
        const reply = 'I could not understand the voice message clearly. Please type your question or send a clearer voice note.';
        data.messages.push({
          id: uid('msg'),
          clientId: currentClient.id,
          conversationId: conversation.id,
          direction: 'inbound',
          text: '[Voice message: transcription failed]',
          createdAt: now()
        });
        data.messages.push({
          id: uid('msg'),
          clientId: currentClient.id,
          conversationId: conversation.id,
          direction: 'outbound',
          text: reply,
          createdAt: now()
        });
        await writeData(data);
        await ctx.reply(reply).catch(console.error);
        return;
      }
      const preMentionedProduct = findProductMention(data, currentClient.id, text);
      const classification = classifyCustomerMessage(text, { conversation, currentProduct: preMentionedProduct });
      recoverConversationContext(conversation, classification, text);
      if (classification.resetStaleProduct && !orderFlowActive(data, currentClient, conversation)) conversation.lastProductId = '';
      const currentProduct = conversationProductForMessage(data, currentClient, conversation, text, classification);
      if (currentProduct) conversation.lastProductId = currentProduct.id;
      // AGGRESSIVE PRODUCT SWITCH: cancel orders for different products when customer picks a new one
      if (currentProduct && data.orders) {
        const staleProductOrders = data.orders.filter(
          order => order.conversationId === conversation.id &&
            ['draft', 'confirmed'].includes(order.status || '') &&
            order.productId && order.productId !== currentProduct.id
        );
        for (const order of staleProductOrders) {
          order.status = 'cancelled';
          order.cancelledReason = `Customer switched to product ${currentProduct.code || currentProduct.id}`;
          order.updatedAt = now();
        }
        if (staleProductOrders.length) console.log(`Cancelled ${staleProductOrders.length} stale orders (product switch) for conversation ${conversation.id}`);
      }
      const customerRoute = routeCustomerIntent({ data, client: currentClient, conversation, text, classification, currentProduct });
      data.messages.push({
        id: uid('msg'),
        clientId: currentClient.id,
        conversationId: conversation.id,
        direction: 'inbound',
        text: `[Voice transcript] ${text}`,
        createdAt: now()
      });
      const leadScore = detectHotLead(text);
      conversation.leadScore += leadScore;
      await upsertHotLead({ data, client: currentClient, conversation, ctx, text, leadScore });
      const draftOrder = customerRoute.route === 'order_flow' && currentProduct ? await upsertDraftOrder({ data, client: currentClient, conversation, product: currentProduct, text }) : null;
      if (draftOrder?.shouldNotify) await notifyDraftOrder({ data, client: currentClient, order: draftOrder.order, reason: draftOrder.notifyReason });
      const booking = upsertServiceBooking({ data, client: currentClient, conversation, text });
      if (booking?.shouldNotify) await notifyServiceBooking({ data, client: currentClient, booking: booking.booking, reason: booking.notifyReason });
      await writeData(data);
  
      const fresh = await readData();
      const freshClient = clientFor(fresh, currentClient.id);
      const freshConversation = fresh.conversations.find(item => item.id === conversation.id) || conversation;
      let freshProduct = currentProduct
        ? (fresh.products || []).find(product => product.id === currentProduct.id && product.isActive !== false)
        : conversationProductForMessage(fresh, freshClient, freshConversation, text, classification);
      const freshRoute = routeCustomerIntent({ data: fresh, client: freshClient, conversation: freshConversation, text, classification, currentProduct: freshProduct });
      const productQuestion = productQuestionType(text);
      const freshOrder = activeConversationOrder(fresh, freshClient, freshConversation);
      const deliveryReply = freshRoute.route === 'order_flow' && /\b(deliver|delivery|send|ship|location|address|deliver to|send to|ship to|bole|megenagna|piassa|mexico|ayat|summit|cmc)\b/i.test(text)
        ? (deliveryFollowUpReply(freshClient, freshOrder, text) || businessDeliveryReply(freshClient, text))
        : '';
      const orderExitReply = /\b(cancel|stop|never mind|nevermind|forget|no thanks|no thank|don't want|not buying|not ordering|change my mind|i'm done|that's all|leave me|stop asking|i said|enough|hello|hi |hey|good morning|good afternoon|good evening)\b/i.test(text);
      const orderReply = freshRoute.route === 'order_flow' && !orderExitReply ? (deliveryReply || orderProgressReply(freshClient, freshOrder, text) || orderStartReply(freshClient, freshProduct)) : '';
      const freshBooking = activeServiceBooking(fresh, freshClient, freshConversation);
      const freshTopicQuestion = classification.type === 'lead_source' || classification.type === 'service_question' || classification.type === 'business_general';
      const serviceMemoryReply = freshTopicQuestion && !serviceCloseIntent(text) ? '' : serviceFollowUpReply(fresh, freshClient, freshConversation, text);
      const objectionReply = !freshProduct && !orderReply ? salesObjectionReply(fresh, freshClient, text) : '';
      const leadSourceAnswer = freshRoute.route === 'lead_source' ? leadSourceReply(freshClient, text) : '';
      const contactReply = freshRoute.route === 'contact_info' ? businessContactReply(freshClient) : '';
      const knowledgeAnswer = freshRoute.route === 'service_question'
        ? await buildReply(fresh, freshClient, freshConversation, text)
        : '';
      const continueBooking = shouldContinueServiceBooking(freshBooking || booking?.booking, text, classification);
      const serviceReply = !serviceMemoryReply && !knowledgeAnswer && (serviceCloseIntent(text) || serviceBookingIntent(freshClient, text))
        ? serviceSalesReply(fresh, freshClient, freshBooking || booking?.booking, text)
        : (continueBooking ? bookingQuestion(freshBooking || booking?.booking) : '');
      const productAnswer = freshRoute.route === 'product_detail' && freshProduct
        ? productReplyText(freshProduct, productQuestion)
        : '';
      const sampleProducts = freshRoute.route === 'product_samples' ? freshRoute.sampleProducts : [];
      const categoryProducts = freshRoute.route === 'product_search' ? freshRoute.categoryProducts : [];
      const catalogProducts = !categoryProducts.length && classification.type === 'product_browse'
        ? activeClientProducts(fresh, freshClient.id).slice(0, 6)
        : [];
      if (categoryProducts.length) rememberProductChoices(freshConversation, categoryProducts);
      else if (catalogProducts.length) rememberProductChoices(freshConversation, catalogProducts);
      const sampleReply = sampleProducts.length ? productSampleReply(sampleProducts) : '';
      const samplesDoneReply = freshRoute.route === 'product_samples_done' ? productSamplesDoneReply() : '';
      const categoryReply = categoryProducts.length ? productChoiceReply(categoryProducts, text) : '';
      const packageReply = isServiceBusiness(freshClient) && !freshProduct && !orderReply && !knowledgeAnswer && !serviceReply ? servicePackageReply(fresh, freshClient, text) : '';
      let reply = leadSourceAnswer || contactReply || orderReply || productAnswer || sampleReply || samplesDoneReply || serviceMemoryReply || knowledgeAnswer || serviceReply || categoryReply || objectionReply || packageReply || (freshProduct ? productReplyText(freshProduct, productQuestion) : await buildReply(fresh, freshClient, freshConversation, text));
      reply = validateRoutedReply({ data: fresh, client: freshClient, route: freshRoute, text, reply }) || safeFallbackReply(fresh, freshClient, classification);
      if (isMissingKnowledgeReply(reply)) {
        await recordUnansweredQuestion({
          data: fresh,
          client: freshClient,
          conversation: freshConversation,
          customer: freshConversation.customer,
          question: `[Voice] ${text}`
        });
        reply = helpfulMissingReply(freshClient, text, classification);
      }
      const replyProduct = (!priceInquiry && freshProduct) ? freshProduct : null;
      const sent = await sendTelegramReply({ ctx, client: freshClient, conversation: freshConversation, product: replyProduct, products: sampleProducts, reply });
      if (!sent) return;
      if (sampleProducts.length) advanceProductGallery(freshConversation, sampleProducts);
      applyConversationStage(freshConversation, freshRoute, { product: freshProduct, order: freshOrder });
      fresh.messages.push({
        id: uid('msg'),
        clientId: freshClient.id,
        conversationId: freshConversation.id,
        direction: 'outbound',
        text: reply,
        createdAt: now()
      });
      freshConversation.updatedAt = now();
      await writeData(fresh);
    });
    bot.on('location', async ctx => {
      const data = await readData();
      const currentClient = clientFor(data, client.id);
      if (!currentClient?.settings?.isActive || !serviceAllowsAutomation(currentClient)) return;
      const location = ctx.message.location;
      if (!location) return;
      const conversation = getConversation(data, currentClient.id, ctx.chat.id);
      if (conversation.handoffMode === 'human') return;
      const customer = telegramCustomer(ctx);
      conversation.customer = customer;
      conversation.title = customer.username || customer.name || conversation.title;
      conversation.updatedAt = now();
  
      const chatId = String(ctx.chat.id);
      const latitude = location.latitude;
      const longitude = location.longitude;
  
      // Store location in conversation
      conversation.customerLatitude = latitude;
      conversation.customerLongitude = longitude;
  
      // Try to store in active order if exists
      const activeOrder = activeConversationOrder(data, currentClient, conversation);
      if (activeOrder) {
        activeOrder.customer_latitude = latitude;
        activeOrder.customer_longitude = longitude;
        // If delivery location was empty, set it from coordinates
        if (!activeOrder.deliveryLocation) {
          activeOrder.deliveryLocation = `Location pin: ${latitude}, ${longitude}`;
        }
        activeOrder.updatedAt = now();
      }
  
      // Update lead if exists
      const lead = (data.leads || []).find(item => item.conversationId === conversation.id);
      if (lead) {
        lead.customerLatitude = latitude;
        lead.customerLongitude = longitude;
        lead.updatedAt = now();
      }
  
      data.messages.push({
        id: uid('msg'),
        clientId: currentClient.id,
        conversationId: conversation.id,
        direction: 'inbound',
        text: `Customer shared live location (${latitude}, ${longitude})`,
        createdAt: now()
      });
  
      await writeData(data);
  
      // Notify owner about location pin
      const lines = [
        `Location pin received for ${currentClient.businessName}`,
        `Customer: ${customer.name || customer.username || chatId}`,
        `Coordinates: ${latitude}, ${longitude}`,
        `https://www.google.com/maps?q=${latitude},${longitude}`,
        activeOrder ? `Active order: ${activeOrder.productName || activeOrder.productCode || activeOrder.id}` : '',
        `Note: Distance calculation is not yet available. Please review delivery manually if outside Addis Ababa.`
      ].filter(Boolean);
      await sendClientNotification(data, currentClient, `location-${chatId}-${Date.now()}`, lines.join('\n'), 'draftOrders', 0);
  
      // Reply to customer
      await ctx.reply('Thank you for sharing your location. I will include this with your order details.').catch(console.error);
    });
    botRunners.set(client.id, bot);
    bot.telegram.deleteWebhook({ drop_pending_updates: true }).catch(() => null);
    bot.launch({ dropPendingUpdates: true }).catch(async error => {
      console.error(`Bot launch failed for ${client.businessName}:`, error.message);
      const unauthorized = /401|unauthorized/i.test(String(error.message || ''));
      if (unauthorized) {
        try {
          const data = await readData();
          const freshClient = clientFor(data, client.id);
          if (freshClient?.settings) {
            freshClient.settings.isActive = false;
            freshClient.settings.botLastError = 'Bot token was rejected by Telegram. Paste a fresh token from BotFather and restart the bot.';
            freshClient.settings.botLastErrorAt = now();
            addAuditLog?.(data, {
              user: null,
              action: 'bot.disabled_invalid_token',
              clientId: client.id,
              target: client.businessName,
              details: 'Bot automation was disabled because Telegram rejected the saved bot token.'
            });
            await writeData(data);
          }
        } catch (_error) {
          // Keep launch error handling best-effort; the original error is still recorded below.
        }
      }
      recordBotError(null, {
        clientId: client.id,
        businessName: client.businessName,
        type: 'bot-launch',
        message: `Bot launch failed: ${error.message}`,
        severity: 'error'
      }).catch(() => null);
      sendAdminAlert(null, `bot-launch-${client.id}`, unauthorized
        ? `Bot token problem for ${client.businessName}: Telegram rejected the saved bot token. Automation has been paused for this shop. Paste a fresh token from BotFather in Telegram Bot settings, then restart the bot.`
        : `Bot launch failed for ${client.businessName}: ${error.message}`, 15).catch(() => null);
      botRunners.delete(client.id);
    });
  };
  
  const syncBots = async () => {
    const data = await readData();
    await Promise.all(data.clients.map(startBot));
  };
  
  
  return {
    stopBot,
    sendTelegramReply,
    gramCustomer,
    sendAccountReply,
    startAccount,
    startBot,
    syncBots
  };
}
