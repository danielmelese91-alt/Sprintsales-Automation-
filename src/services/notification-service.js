import path from 'node:path';
import {
  categoryContextFromSettings,
  iconForRetailLabel
} from '../config/retail-templates.js';
import { productSpecGroupsProfile } from '../config/product-spec-presets.js';

export function createNotificationService(deps) {
  const {
    Telegraf,
    botRunners,
    fs,
    crypto,
    fetchWithTimeout,
    readData,
    writeData,
    ensureCollections,
    clientFor,
    now,
    uid,
    productImageDir,
    createWatermarkedProductImage,
    watermarkedPathForOriginal,
    defaultSettings,
    quotas,
    addAuditLog,
    isProductBusiness,
    recordBotError,
    addBotError
  } = deps;
  let platformAdminBot = null;

  const phoneKey = value => {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('251') && digits.length >= 12) return `0${digits.slice(3, 12)}`;
    if (digits.length === 9 && digits.startsWith('9')) return `0${digits}`;
    if (digits.startsWith('0')) return digits.slice(0, 10);
    return digits;
  };

  const escapeHtml = value => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const platformHeader = businessName => [
    '<b>SprintSales Automation</b>',
    businessName ? `<b>Business:</b> ${escapeHtml(businessName)}` : ''
  ].filter(Boolean).join('\n');

  const notificationHtml = (text, businessName = '') => `${platformHeader(businessName)}\n\n${escapeHtml(text)}`;
  const privateOwnerChatId = settings => {
    const candidates = [
      settings?.sprintsalesAdminChatId,
      settings?.telegramOwnerChatId,
      settings?.ownerChatId,
      settings?.hotLeadNotifyChatId
    ];
    for (const candidate of candidates) {
      const value = String(candidate || '').trim();
      if (/^\d{5,20}$/.test(value)) return value;
    }
    return '';
  };

  const supportReplyIdFromText = text => {
    const value = String(text || '');
    const match = value.match(/Support Reply ID:\s*([A-Za-z0-9_-]+)/i) || value.match(/^\/reply\s+([A-Za-z0-9_-]+)/i);
    return match ? match[1] : '';
  };

  const pendingSupportForChat = (data, chatId) => {
    const key = String(chatId || '').trim();
    if (!key) return null;
    data.platformSettings ||= {};
    data.platformSettings.pendingSupportReplies ||= {};
    return data.platformSettings.pendingSupportReplies[key] || null;
  };

  const setPendingSupportForChat = (data, chatId, value) => {
    const key = String(chatId || '').trim();
    if (!key) return;
    data.platformSettings ||= {};
    data.platformSettings.pendingSupportReplies ||= {};
    if (value) data.platformSettings.pendingSupportReplies[key] = { ...value, updatedAt: now() };
    else delete data.platformSettings.pendingSupportReplies[key];
  };

  const sendCustomerReplyViaClientBot = async (data, client, chatId, text) => {
    const target = String(chatId || '').trim();
    const message = String(text || '').trim().slice(0, 1800);
    if (!target || !message || !client?.settings?.botToken) return false;
    const runner = botRunners.get(client.id);
    const telegram = runner?.telegram || new Telegraf(client.settings.botToken).telegram;
    await telegram.sendMessage(target, message);
    data.messages ||= [];
    const conversation = (data.conversations || []).find(item =>
      item.clientId === client.id && String(item.telegramChatId || '') === target
    );
    if (conversation) {
      conversation.stage = conversation.stage === 'human_support' ? 'greeting' : conversation.stage;
      conversation.updatedAt = now();
      data.messages.push({
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        clientId: client.id,
        conversationId: conversation.id,
        direction: 'outbound',
        text: message,
        createdAt: now(),
        source: 'owner-support-reply'
      });
    }
    return true;
  };

  const sendSupportReplyPrompt = async (data, client, ownerChatId, text, supportReply = {}) => {
    const settings = data.platformSettings || {};
    const token = String(settings.adminBotToken || process.env.SPRINTSALES_ADMIN_BOT_TOKEN || '').trim();
    if (!token || !ownerChatId || !supportReply.questionId) return false;
    const bot = new Telegraf(token);
    const questionId = String(supportReply.questionId || '').trim();
    const websiteReply = supportReply.deliveryMode === 'website' || Boolean(supportReply.shopperSessionId);
    const body = [
      notificationHtml(text, client.businessName),
      '',
      websiteReply
        ? '<b>Reply action:</b> Reply directly to this Telegram message. SprintSales will show your confirmed reply in the shopper’s website support chat.'
        : '<b>Reply action:</b> Reply directly to this Telegram message. SprintSales will send your reply to the shopper using your shop bot.',
      `<b>Support Reply ID:</b> ${escapeHtml(questionId)}`
    ].join('\n');
    await bot.telegram.sendMessage(ownerChatId, body, {
      parse_mode: 'HTML',
      reply_markup: {
        force_reply: true,
        input_field_placeholder: 'Write the answer for the shopper...'
      }
    });
    setPendingSupportForChat(data, ownerChatId, {
      questionId,
      conversationId: supportReply.conversationId || '',
      telegramChatId: supportReply.telegramChatId || '',
      shopperSessionId: supportReply.shopperSessionId || '',
      deliveryMode: supportReply.deliveryMode || '',
      mode: 'awaiting_answer',
      createdAt: now()
    });
    return true;
  };

  const supportPreviewMessage = (client, question, answer) => [
    '<b>Review your reply before sending</b>',
    '',
    `<b>Business:</b> ${escapeHtml(client.businessName)}`,
    `<b>Customer question:</b> ${escapeHtml(question.question || '')}`,
    '',
    '<b>Your answer:</b>',
    escapeHtml(answer),
    '',
    'If this looks right, tap Confirm & Send. If not, tap Edit Message and type the corrected answer.'
  ].join('\n');

  const queueSupportReplyPreview = async (ctx, data, client, question, answer) => {
    const chatId = String(ctx.chat?.id || '');
    setPendingSupportForChat(data, chatId, {
      questionId: question.id,
      conversationId: question.conversationId || '',
      telegramChatId: question.telegramChatId || '',
      mode: 'awaiting_confirm',
      draftAnswer: String(answer || '').trim().slice(0, 1800),
      createdAt: pendingSupportForChat(data, chatId)?.createdAt || now()
    });
    await writeData(data);
    await ctx.reply(supportPreviewMessage(client, question, answer), {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Confirm & Send', callback_data: `support_confirm:${question.id}` }],
          [{ text: 'Edit Message', callback_data: `support_edit:${question.id}` }]
        ]
      }
    });
    return true;
  };

  const resolveSupportQuestion = (data, questionId) => {
    const question = (data.unansweredQuestions || []).find(item => item.id === questionId);
    if (!question) return { question: null, client: null };
    return { question, client: clientFor(data, question.clientId) };
  };

  const handlePlatformSupportReply = async ctx => {
    const text = String(ctx.message?.text || '').trim();
    const repliedText = String(ctx.message?.reply_to_message?.text || '').trim();
    const fresh = ensureCollections(await readData());
    const pending = pendingSupportForChat(fresh, ctx.chat?.id);
    const questionId = supportReplyIdFromText(repliedText) || supportReplyIdFromText(text) || pending?.questionId || '';
    if (!questionId) return false;
    const answer = supportReplyIdFromText(text)
      ? text.replace(/^\/reply\s+[A-Za-z0-9_-]+\s*/i, '').trim()
      : text;
    if (!answer) {
      await ctx.reply('Please write the answer after replying to the support notification.');
      return true;
    }
    const { question, client } = resolveSupportQuestion(fresh, questionId);
    if (!question) {
      setPendingSupportForChat(fresh, ctx.chat?.id, null);
      await writeData(fresh);
      await ctx.reply('I could not find that support question. It may have been deleted or already moved.');
      return true;
    }
    if (!client) {
      await ctx.reply('I could not find the shop connected to this support question.');
      return true;
    }
    const ownerChatId = privateOwnerChatId(client.settings || {});
    if (ownerChatId && ownerChatId !== String(ctx.chat?.id || '')) {
      await ctx.reply('This support reply must come from the configured owner Telegram account.');
      return true;
    }
    const targetChatId = question.telegramChatId || (fresh.conversations || []).find(item => item.id === question.conversationId)?.telegramChatId || '';
    const websiteSessionId = question.shopperSessionId || pending?.shopperSessionId || '';
    if (!targetChatId && !websiteSessionId) {
      await ctx.reply('This question has no customer chat or website session connected, so I could not forward the reply.');
      return true;
    }
    return queueSupportReplyPreview(ctx, fresh, client, question, answer);
  };

  const confirmSupportReply = async ctx => {
    const questionId = String(ctx.match?.[1] || '').trim();
    const fresh = ensureCollections(await readData());
    const pending = pendingSupportForChat(fresh, ctx.chat?.id);
    if (!pending || pending.questionId !== questionId || !pending.draftAnswer) {
      await ctx.answerCbQuery('No reply is waiting for confirmation.');
      return true;
    }
    const { question, client } = resolveSupportQuestion(fresh, questionId);
    if (!question || !client) {
      setPendingSupportForChat(fresh, ctx.chat?.id, null);
      await writeData(fresh);
      await ctx.answerCbQuery('Question not found.');
      return true;
    }
    const ownerChatId = privateOwnerChatId(client.settings || {});
    if (ownerChatId && ownerChatId !== String(ctx.chat?.id || '')) {
      await ctx.answerCbQuery('This must come from the configured owner account.');
      return true;
    }
    const conversation = (fresh.conversations || []).find(item => item.id === question.conversationId);
    const targetChatId = question.telegramChatId || conversation?.telegramChatId || '';
    const websiteSessionId = question.shopperSessionId || conversation?.supportSessionId || pending?.shopperSessionId || '';
    if (!targetChatId && !websiteSessionId) {
      await ctx.answerCbQuery('No customer chat or website session is connected.');
      return true;
    }
    if (targetChatId) {
      await sendCustomerReplyViaClientBot(fresh, client, targetChatId, pending.draftAnswer);
    } else {
      fresh.messages ||= [];
      fresh.messages.push({
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        clientId: client.id,
        conversationId: question.conversationId,
        direction: 'outbound',
        text: pending.draftAnswer,
        createdAt: now(),
        source: 'owner-support-reply'
      });
      if (conversation) {
        conversation.stage = conversation.stage === 'human_support' ? 'greeting' : conversation.stage;
        conversation.updatedAt = now();
      }
    }
    question.status = 'resolved';
    question.ownerReply = pending.draftAnswer.slice(0, 1800);
    question.repliedAt = now();
    question.updatedAt = now();
    question.repliedByChatId = String(ctx.chat?.id || '');
    setPendingSupportForChat(fresh, ctx.chat?.id, null);
    await writeData(fresh);
    await ctx.answerCbQuery('Sent.');
    await ctx.editMessageText(
      targetChatId
        ? `Sent to the shopper from ${client.businessName}'s bot.`
        : `Sent to the shopper in ${client.businessName}'s website support chat.`
    );
    return true;
  };

  const editSupportReply = async ctx => {
    const questionId = String(ctx.match?.[1] || '').trim();
    const fresh = ensureCollections(await readData());
    const pending = pendingSupportForChat(fresh, ctx.chat?.id);
    if (!pending || pending.questionId !== questionId) {
      await ctx.answerCbQuery('No reply is waiting to edit.');
      return true;
    }
    setPendingSupportForChat(fresh, ctx.chat?.id, {
      ...pending,
      mode: 'awaiting_edit',
      draftAnswer: ''
    });
    await writeData(fresh);
    await ctx.answerCbQuery('Edit mode opened.');
    await ctx.reply('Please type the corrected answer. I will show it again for confirmation before sending.');
    return true;
  };

  const ownerProductStore = data => {
    data.platformSettings ||= {};
    data.platformSettings.pendingOwnerProductUploads ||= {};
    return data.platformSettings.pendingOwnerProductUploads;
  };

  const ownerPhotoBatchTimers = new Map();
  const ownerPhotoAppendQueues = new Map();

  const ownerProductState = (data, chatId) => ownerProductStore(data)[String(chatId || '').trim()] || null;

  const setOwnerProductState = (data, chatId, state) => {
    const key = String(chatId || '').trim();
    if (!key) return;
    const store = ownerProductStore(data);
    if (state) store[key] = { ...state, updatedAt: now() };
    else delete store[key];
  };

  const ownerClientsForChat = (data, chatId) => {
    const key = String(chatId || '').trim();
    if (!key) return [];
    return (data.clients || []).filter(client => privateOwnerChatId(client.settings || {}) === key);
  };

  const cleanText = (value, max = 120) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);

  const cleanMoney = value => {
    const number = Number(String(value || '').replace(/[^0-9.]/g, ''));
    return Number.isFinite(number) && number > 0 ? number : 0;
  };

  const specKey = value => String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'option';

  const categoryContextForClient = client => {
    const categories = categoryContextFromSettings(client?.settings || {});
    return categories.length ? categories : [{ name: 'Other Products', icon: iconForRetailLabel('Other Products'), subcategories: [], subcategoryIcons: {} }];
  };

  const buttonRows = (items, mapper, columns = 2) => {
    const rows = [];
    for (let index = 0; index < items.length; index += columns) {
      rows.push(items.slice(index, index + columns).map((item, localIndex) => mapper(item, index + localIndex)));
    }
    return rows;
  };

  const ownerMainKeyboard = () => ({
    keyboard: [
      [{ text: 'Add Product' }],
      [{ text: 'Share phone number', request_contact: true }]
    ],
    resize_keyboard: true
  });

  const ownerProductCancelRow = [{ text: 'Cancel', callback_data: 'op:cancel' }];

  const ownerPhotoDoneKeyboard = (includeSkip, state = {}) => {
    const featured = Boolean(state?.draft?.featured);
    const hasPhotos = (state?.photos || []).length > 0;
    if (!hasPhotos) {
      return {
        inline_keyboard: [
          ...(includeSkip ? [[{ text: 'Skip Photos', callback_data: 'op:photosskip' }]] : []),
          ownerProductCancelRow
        ]
      };
    }
    return {
      inline_keyboard: [
        [{ text: `${featured ? '[x]' : '[ ]'} Feature on MiniApp homepage`, callback_data: 'op:photofeature' }],
        [{ text: 'Done Photos', callback_data: 'op:photosdone' }],
        ownerProductCancelRow
      ]
    };
  };

  const sendOrEditInline = async (ctx, text, replyMarkup, preferEdit = false) => {
    const extra = { reply_markup: replyMarkup };
    if (preferEdit && ctx.callbackQuery?.message) {
      try {
        await ctx.editMessageText(text, extra);
        return true;
      } catch (error) {
        if (!/message is not modified/i.test(error.message || '')) {
          await ctx.reply(text, extra);
        }
        return true;
      }
    }
    await ctx.reply(text, extra);
    return true;
  };

  const cleanupOwnerProductPhotos = async state => {
    if (state?.photoBatchId) {
      const timerKey = `${state.chatId || ''}:${state.photoBatchId}`;
      if (ownerPhotoBatchTimers.has(timerKey)) {
        clearTimeout(ownerPhotoBatchTimers.get(timerKey));
        ownerPhotoBatchTimers.delete(timerKey);
      }
    }
    const paths = (state?.photos || [])
      .flatMap(record => [record.originalPath, record.watermarkedPath, record.publicPath])
      .filter(Boolean);
    for (const filePath of [...new Set(paths)]) {
      await fs?.unlink?.(filePath).catch(() => null);
    }
  };

  const replyOwnerMenu = async (ctx, client = null) => {
    const name = client?.businessName ? ` for ${client.businessName}` : '';
    await ctx.reply([
      `Welcome to SprintSales${name}.`,
      '',
      'You can add products from here or use the dashboard when you need deeper editing.',
      'Tap Add Product or send /addproduct.'
    ].join('\n'), { reply_markup: ownerMainKeyboard() });
  };

  const chooseOwnerClient = async (ctx, data, clients) => {
    const chatId = String(ctx.chat?.id || '');
    setOwnerProductState(data, chatId, {
      mode: 'add_product',
      step: 'choose_client',
      clientIds: clients.map(client => client.id),
      draft: {},
      photos: []
    });
    await writeData(data);
    await ctx.reply('Which business should this product be added to?', {
      reply_markup: {
        inline_keyboard: [
          ...buttonRows(clients, (client, index) => ({ text: cleanText(client.businessName || `Business ${index + 1}`, 40), callback_data: `op:client:${index}` }), 1),
          ownerProductCancelRow
        ]
      }
    });
    return true;
  };

  const activeOwnerClients = (data, chatId) => ownerClientsForChat(data, chatId)
    .filter(client => client.status === 'active' && (!isProductBusiness || isProductBusiness(client)));

  const startOwnerProductUpload = async ctx => {
    const fresh = ensureCollections(await readData());
    const chatId = String(ctx.chat?.id || '');
    await cleanupOwnerProductPhotos(ownerProductState(fresh, chatId));
    const clients = activeOwnerClients(fresh, chatId);
    if (!clients.length) {
      await ctx.reply([
        'I could not find an active product-selling business connected to this Telegram account.',
        '',
        'If you are registering, tap Share phone number first. If your account is pending, wait for SprintSales approval.'
      ].join('\n'), { reply_markup: ownerMainKeyboard() });
      return true;
    }
    if (clients.length > 1) return chooseOwnerClient(ctx, fresh, clients);
    setOwnerProductState(fresh, chatId, {
      mode: 'add_product',
      step: 'category',
      clientId: clients[0].id,
      draft: {},
      photos: []
    });
    await writeData(fresh);
    return askOwnerProductCategory(ctx, fresh, clients[0]);
  };

  const askOwnerProductCategory = async (ctx, data, client) => {
    const categories = categoryContextForClient(client);
    await ctx.reply(`Add product to ${client.businessName}\n\nChoose the product category:`, {
      reply_markup: {
        inline_keyboard: [
          ...buttonRows(categories, (category, index) => ({
            text: `${category.icon || iconForRetailLabel(category.name)} ${category.name}`.slice(0, 60),
            callback_data: `op:cat:${index}`
          }), 1),
          ownerProductCancelRow
        ]
      }
    });
    return true;
  };

  const askOwnerProductSubcategory = async (ctx, data, client, state, page = 0) => {
    const categories = categoryContextForClient(client);
    const category = categories[state.categoryIndex] || null;
    const subs = category?.subcategories || [];
    if (!category || !subs.length) {
      state.step = 'name';
      setOwnerProductState(data, ctx.chat?.id, state);
      await writeData(data);
      await ctx.reply('Now send the product name.');
      return true;
    }
    const pageSize = 12;
    const safePage = Math.max(0, Math.min(page, Math.ceil(subs.length / pageSize) - 1));
    state.subPage = safePage;
    setOwnerProductState(data, ctx.chat?.id, state);
    await writeData(data);
    const start = safePage * pageSize;
    const visible = subs.slice(start, start + pageSize);
    const nav = [];
    if (safePage > 0) nav.push({ text: 'Previous', callback_data: `op:subpage:${safePage - 1}` });
    if (start + pageSize < subs.length) nav.push({ text: 'Next', callback_data: `op:subpage:${safePage + 1}` });
    await ctx.reply(`Category: ${category.name}\n\nChoose the exact product type:`, {
      reply_markup: {
        inline_keyboard: [
          ...buttonRows(visible, (subcategory, localIndex) => ({
            text: `${category.subcategoryIcons?.[subcategory] || iconForRetailLabel(subcategory)} ${subcategory}`.slice(0, 60),
            callback_data: `op:sub:${start + localIndex}`
          }), 1),
          ...(nav.length ? [nav] : []),
          [{ text: `Use ${category.name} only`, callback_data: 'op:sub:none' }],
          ownerProductCancelRow
        ]
      }
    });
    return true;
  };

  const generateProductCode = (data, client, draft) => {
    const base = cleanText(draft.subcategory || draft.category || draft.name || 'PRD', 30)
      .replace(/[^A-Za-z0-9]+/g, '')
      .slice(0, 3)
      .toUpperCase() || 'PRD';
    const used = new Set((data.products || [])
      .filter(product => product.clientId === client.id)
      .map(product => String(product.code || '').toUpperCase()));
    for (let index = 1; index < 10000; index += 1) {
      const code = `${base}-${String(index).padStart(3, '0')}`;
      if (!used.has(code)) return code;
    }
    return `${base}-${Date.now().toString().slice(-5)}`;
  };

  const askOwnerProductCode = async (ctx, data, client, state) => {
    await ctx.reply([
      `Product name: ${state.draft.name}`,
      '',
      'Send the product code/SKU, or tap Auto Code.'
    ].join('\n'), {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Auto Code', callback_data: 'op:autocode' }],
          ownerProductCancelRow
        ]
      }
    });
  };

  const askOwnerProductSpec = async (ctx, data, client, state, options = {}) => {
    const group = state.specGroups?.[state.specIndex];
    if (!group) {
      state.step = 'description';
      setOwnerProductState(data, ctx.chat?.id, state);
      await writeData(data);
      await ctx.reply('Now send a short product description. You can send "skip" if you do not want one.');
      return true;
    }
    const selected = new Set(state.specSelections?.[group.key] || []);
    const rows = buttonRows(group.values || [], (value, index) => ({
      text: `${selected.has(value) ? '[x]' : '[ ]'} ${value}`.slice(0, 60),
      callback_data: `op:spec:${state.specIndex}:${index}`
    }), 2);
    const message = [
      `Choose ${group.label} for ${state.draft.name}.`,
      'You can select more than one, then tap Done.',
      '',
      selected.size ? `Selected: ${[...selected].join(', ')}` : 'Nothing selected yet.'
    ].join('\n');
    await sendOrEditInline(
      ctx,
      message,
      {
        inline_keyboard: [
          ...rows,
          [{ text: 'Custom value', callback_data: 'op:speccustom' }],
          [{ text: 'Done', callback_data: 'op:specdone' }, { text: 'Skip', callback_data: 'op:specskip' }],
          ownerProductCancelRow
        ]
      },
      options.edit === true
    );
    return true;
  };

  const askOwnerProductPhotos = async (ctx, state) => {
    const hasPhotos = (state.photos || []).length > 0;
    await ctx.reply([
      hasPhotos ? 'You can send more product photos now.' : 'Send product photos now.',
      '',
      `You can send up to ${Math.max(1, 5 - (state.photos?.length || 0))} more photo(s).`,
      'Send them one by one or as an album.',
      hasPhotos
        ? 'Optional: tick Featured if this product should appear on the MiniApp homepage. When finished, tap Done Photos.'
        : 'If you do not want to add photos, tap Skip Photos.'
    ].join('\n'), {
      reply_markup: ownerPhotoDoneKeyboard(true, state)
    });
  };

  const ownerPhotoProgressText = (state, savedNow = 0) => [
    savedNow > 1 ? `${savedNow} photos saved from this album.` : 'Photo saved.',
    '',
    `Saved photos: ${(state.photos || []).length}/5`,
    `Featured: ${state.draft?.featured ? 'Yes' : 'No'}`,
    (state.photos || []).length >= 5
      ? 'Maximum reached. Tap Done Photos to review and save the product.'
      : 'You can send more photos or tap Done Photos.'
  ].join('\n');

  const queueOwnerPhotoAppend = (chatId, task) => {
    const key = String(chatId || '');
    const previous = ownerPhotoAppendQueues.get(key) || Promise.resolve();
    const next = previous
      .catch(() => null)
      .then(task)
      .finally(() => {
        if (ownerPhotoAppendQueues.get(key) === next) ownerPhotoAppendQueues.delete(key);
      });
    ownerPhotoAppendQueues.set(key, next);
    return next;
  };

  const scheduleOwnerPhotoBatchPrompt = (ctx, chatId, mediaGroupId) => {
    if (!mediaGroupId) return;
    const timerKey = `${chatId}:${mediaGroupId}`;
    if (ownerPhotoBatchTimers.has(timerKey)) clearTimeout(ownerPhotoBatchTimers.get(timerKey));
    const timer = setTimeout(async () => {
      ownerPhotoBatchTimers.delete(timerKey);
      try {
        const fresh = ensureCollections(await readData());
        const state = ownerProductState(fresh, chatId);
        if (!state || state.mode !== 'add_product' || state.step !== 'photos') return;
        const batchCount = state.lastPhotoBatch?.id === mediaGroupId ? Number(state.lastPhotoBatch.count || 0) : 0;
        await ctx.telegram.sendMessage(
          chatId,
          ownerPhotoProgressText(state, batchCount),
          { reply_markup: ownerPhotoDoneKeyboard(false, state) }
        );
      } catch (error) {
        console.warn('Owner product photo batch prompt failed:', error.message);
      }
    }, 1200);
    ownerPhotoBatchTimers.set(timerKey, timer);
  };

  const watermarkCenterText = client => cleanText(
    client?.settings?.botUsername ||
    client?.settings?.accountUsername ||
    client?.settings?.watermarkName ||
    client?.businessName ||
    defaultSettings?.().watermarkName ||
    'SprintSales',
    60
  );

  const isCakeClient = client => {
    const settings = client?.settings || {};
    const profile = settings.businessProfile || {};
    return /cake|bakery|pastr|dessert/.test([
      settings.retailType,
      settings.businessType,
      profile.retailType,
      profile.businessType,
      client?.businessType
    ].filter(Boolean).join(' ').toLowerCase());
  };

  const isCakeProduct = (client, product = {}) => {
    if (isCakeClient(client)) return true;
    return /cake|bakery|pastr|dessert|birthday|wedding|fondant|bento|cupcake/.test([
      product.category,
      product.subcategory,
      product.name,
      product.productType
    ].filter(Boolean).join(' ').toLowerCase());
  };

  const watermarkBottomText = (client, product) => [
    cleanText(client?.settings?.watermarkName || client?.businessName || 'SprintSales', 40),
    cleanText(product?.code, 30)
  ].filter(Boolean).join(' | ');

  const watermarkLogoPath = client => {
    const logoUrl = String(client?.settings?.businessLogoUrl || '').trim();
    if (!logoUrl || !logoUrl.startsWith('/uploads/products/')) return '';
    try {
      const parts = logoUrl.split('/').filter(Boolean).map(part => decodeURIComponent(part));
      const clientId = parts[2] || '';
      const fileName = parts[3] || '';
      if (!clientId || !fileName) return '';
      return path.join(productImageDir, clientId, fileName);
    } catch (_error) {
      return '';
    }
  };

  const watermarkBottomTextForProduct = (client, product = {}) => isCakeProduct(client, product)
    ? ''
    : watermarkBottomText(client, product);

  const watermarkLogoPathForProduct = (client, product = {}) => isCakeProduct(client, product)
    ? ''
    : watermarkLogoPath(client);

  const downloadOwnerProductPhoto = async (ctx, client, product) => {
    const photos = ctx.message?.photo || [];
    const photo = photos[photos.length - 1];
    if (!photo?.file_id) throw new Error('No photo found.');
    const link = await ctx.telegram.getFileLink(photo.file_id);
    const response = await (fetchWithTimeout || fetch)(link.href);
    if (!response.ok) throw new Error(`Telegram photo download failed: ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const ext = path.extname(new URL(link.href).pathname) || '.jpg';
    const dir = path.join(productImageDir, client.id);
    await fs.mkdir(dir, { recursive: true });
    const safeCode = cleanText(product.code || 'product', 40).replace(/[^A-Za-z0-9_-]+/g, '_') || 'product';
    const random = crypto.randomBytes(5).toString('hex');
    const originalPath = path.join(dir, `${Date.now()}-${safeCode}-${random}${ext}`);
    await fs.writeFile(originalPath, buffer);
    const cakeProduct = isCakeProduct(client, product);
    let watermarkedPath = '';
    let publicPath = originalPath;
    if (!cakeProduct) {
      watermarkedPath = watermarkedPathForOriginal(originalPath);
      await createWatermarkedProductImage({
        inputPath: originalPath,
        outputPath: watermarkedPath,
        centerText: watermarkCenterText(client),
        bottomText: watermarkBottomTextForProduct(client, product),
        bottomLogoPath: watermarkLogoPathForProduct(client, product)
      });
      publicPath = watermarkedPath;
    }
    return {
      originalPath,
      watermarkedPath,
      publicPath,
      originalName: `telegram-${photo.file_unique_id || random}${ext}`,
      isPrimary: false
    };
  };

  const ownerProductSummary = (client, product) => [
    `Business: ${client.businessName}`,
    `Name: ${product.name}`,
    `Code: ${product.code}`,
    `Category: ${product.category}${product.subcategory ? ` / ${product.subcategory}` : ''}`,
    `Price: ${product.price} Birr`,
    product.stockQuantity !== '' ? `Stock: ${product.stockQuantity}` : '',
    product.specGroups?.length ? `Specs: ${product.specGroups.map(group => `${group.label}: ${group.values.join(', ')}`).join(' | ')}` : '',
    product.description ? `Description: ${product.description}` : '',
    product.featured ? 'Featured: Yes' : '',
    `Photos: ${product.images?.length || 0}`
  ].filter(Boolean).join('\n');

  const buildOwnerProduct = (state, client) => {
    const draft = state.draft || {};
    const specGroups = (state.specGroups || [])
      .map(group => ({
        key: specKey(group.key),
        label: cleanText(group.label || group.key || 'Option', 50),
        field: ['size', 'color', 'option'].includes(group.field) ? group.field : 'option',
        values: [...new Set(state.specSelections?.[group.key] || [])].slice(0, 20)
      }))
      .filter(group => group.values.length);
    const sizes = [];
    const colors = [];
    const options = [];
    specGroups.forEach(group => {
      if (group.field === 'size') sizes.push(...group.values);
      else if (group.field === 'color') colors.push(...group.values);
      else options.push(...group.values);
    });
    const photos = (state.photos || []).slice(0, 5).map((record, index) => ({ ...record, isPrimary: index === 0 }));
    const primary = photos[0] || {};
    return {
      id: uid('product'),
      clientId: client.id,
      code: cleanText(draft.code, 40).toUpperCase(),
      productCode: cleanText(draft.code, 40).toUpperCase(),
      name: cleanText(draft.name, 120),
      category: cleanText(draft.category, 80),
      subcategory: cleanText(draft.subcategory, 100),
      selectedCategory: cleanText(draft.category, 80),
      selectedSubcategory: cleanText(draft.subcategory, 100),
      price: String(draft.price || ''),
      sellingPrice: String(draft.price || ''),
      description: cleanText(draft.description, 700),
      stockQuantity: draft.stockQuantity === '' ? '' : Math.max(0, Number(draft.stockQuantity || 0)),
      lowStockThreshold: 0,
      availability: 'In stock',
      stockStatus: 'in_stock',
      status: 'active',
      isActive: true,
      readyForTelegram: true,
      ready_for_telegram: true,
      featured: Boolean(draft.featured),
      sizes: [...new Set(sizes)],
      colors: [...new Set(colors)],
      options: [...new Set(options)],
      specGroups,
      images: photos,
      imageOriginalPath: primary.originalPath || '',
      originalImagePath: primary.originalPath || '',
      imageOriginalName: primary.originalName || '',
      watermarkedImagePath: isCakeProduct(client, draft) ? '' : (primary.watermarkedPath || ''),
      publicImagePath: primary.publicPath || primary.originalPath || primary.watermarkedPath || '',
      imagePath: primary.publicPath || primary.originalPath || primary.watermarkedPath || '',
      source: 'sprintsales-admin-bot',
      createdAt: now(),
      updatedAt: now()
    };
  };

  const saveOwnerProduct = async (ctx, data, client, state) => {
    data.products ||= [];
    const clientProducts = data.products.filter(product => product.clientId === client.id);
    if (quotas?.maxProductsPerClient && clientProducts.length >= quotas.maxProductsPerClient) {
      await ctx.reply(`Product limit reached. This client can add up to ${quotas.maxProductsPerClient} products.`);
      return true;
    }
    const product = buildOwnerProduct(state, client);
    if (!product.name || !product.code || !product.price || !product.category) {
      await ctx.reply('Some required product details are missing. Please start again with /addproduct.');
      setOwnerProductState(data, ctx.chat?.id, null);
      await writeData(data);
      return true;
    }
    const duplicate = data.products.find(item => item.clientId === client.id && String(item.code || '').toUpperCase() === product.code);
    if (duplicate) {
      await ctx.reply('That product code already exists. Please start again and use a different code.');
      return true;
    }
    data.products.push(product);
    addAuditLog?.(data, {
      user: { role: 'client', email: 'sprintsales-admin-bot' },
      action: 'product.created.from_admin_bot',
      clientId: client.id,
      target: `${product.code} ${product.name}`,
      details: `Owner added product ${product.code} from the SprintSales bot.`
    });
    setOwnerProductState(data, ctx.chat?.id, null);
    await writeData(data);
    await ctx.reply([
      'Product saved successfully.',
      '',
      ownerProductSummary(client, product),
      '',
      'It is now available in the dashboard and MiniApp shop.'
    ].join('\n'), { reply_markup: ownerMainKeyboard() });
    return true;
  };

  const handleOwnerProductCallback = async ctx => {
    const actionText = String(ctx.match?.[1] || '');
    const parts = actionText.split(':');
    const action = parts[0];
    const fresh = ensureCollections(await readData());
    const chatId = String(ctx.chat?.id || '');
    let state = ownerProductState(fresh, chatId);
    if (action === 'cancel') {
      await cleanupOwnerProductPhotos(state);
      setOwnerProductState(fresh, chatId, null);
      await writeData(fresh);
      await ctx.answerCbQuery('Cancelled.');
      await ctx.reply('Product upload cancelled.', { reply_markup: ownerMainKeyboard() });
      return true;
    }
    if (!state || state.mode !== 'add_product') {
      await ctx.answerCbQuery('No product upload is active.');
      return true;
    }
    let client = clientFor(fresh, state.clientId);
    if (action === 'client') {
      const index = Number(parts[1] || 0);
      const clientId = state.clientIds?.[index];
      client = clientFor(fresh, clientId);
      if (!client) {
        await ctx.answerCbQuery('Business not found.');
        return true;
      }
      state = { mode: 'add_product', step: 'category', clientId: client.id, draft: {}, photos: [] };
      setOwnerProductState(fresh, chatId, state);
      await writeData(fresh);
      await ctx.answerCbQuery('Selected.');
      return askOwnerProductCategory(ctx, fresh, client);
    }
    if (!client) {
      setOwnerProductState(fresh, chatId, null);
      await writeData(fresh);
      await ctx.answerCbQuery('Business not found.');
      await ctx.reply('I could not find this business. Please start again with /addproduct.');
      return true;
    }
    if (action === 'cat') {
      const index = Number(parts[1] || 0);
      const categories = categoryContextForClient(client);
      const category = categories[index];
      if (!category) {
        await ctx.answerCbQuery('Category not found.');
        return true;
      }
      state.categoryIndex = index;
      state.draft ||= {};
      state.draft.category = category.name;
      state.draft.subcategory = '';
      state.step = 'subcategory';
      setOwnerProductState(fresh, chatId, state);
      await writeData(fresh);
      await ctx.answerCbQuery('Category selected.');
      return askOwnerProductSubcategory(ctx, fresh, client, state, 0);
    }
    if (action === 'subpage') {
      await ctx.answerCbQuery();
      return askOwnerProductSubcategory(ctx, fresh, client, state, Number(parts[1] || 0));
    }
    if (action === 'sub') {
      const categories = categoryContextForClient(client);
      const category = categories[state.categoryIndex] || {};
      const value = parts[1] === 'none' ? '' : (category.subcategories || [])[Number(parts[1] || 0)] || '';
      state.draft ||= {};
      state.draft.subcategory = value;
      state.step = 'name';
      setOwnerProductState(fresh, chatId, state);
      await writeData(fresh);
      await ctx.answerCbQuery('Selected.');
      await ctx.reply('Now send the product name.');
      return true;
    }
    if (action === 'autocode') {
      state.draft ||= {};
      state.draft.code = generateProductCode(fresh, client, state.draft);
      state.step = 'price';
      setOwnerProductState(fresh, chatId, state);
      await writeData(fresh);
      await ctx.answerCbQuery('Code created.');
      await ctx.reply(`Product code: ${state.draft.code}\n\nNow send the price in Birr.`);
      return true;
    }
    if (action === 'spec') {
      const groupIndex = Number(parts[1] || 0);
      const valueIndex = Number(parts[2] || 0);
      const group = state.specGroups?.[groupIndex];
      const value = group?.values?.[valueIndex];
      if (!group || !value) {
        await ctx.answerCbQuery('Option not found.');
        return true;
      }
      state.specSelections ||= {};
      const list = new Set(state.specSelections[group.key] || []);
      if (list.has(value)) list.delete(value);
      else list.add(value);
      state.specSelections[group.key] = [...list];
      setOwnerProductState(fresh, chatId, state);
      await writeData(fresh);
      await ctx.answerCbQuery(list.has(value) ? 'Selected.' : 'Removed.');
      return askOwnerProductSpec(ctx, fresh, client, state, { edit: true });
    }
    if (action === 'speccustom') {
      state.step = 'custom_spec';
      setOwnerProductState(fresh, chatId, state);
      await writeData(fresh);
      await ctx.answerCbQuery('Custom opened.');
      const group = state.specGroups?.[state.specIndex];
      await ctx.reply(`Type custom ${group?.label || 'option'} values separated by comma.`);
      return true;
    }
    if (action === 'specskip' || action === 'specdone') {
      if (action === 'specskip') {
        const group = state.specGroups?.[state.specIndex];
        if (group?.key && state.specSelections) delete state.specSelections[group.key];
      }
      state.specIndex = Number(state.specIndex || 0) + 1;
      state.step = 'specs';
      setOwnerProductState(fresh, chatId, state);
      await writeData(fresh);
      await ctx.answerCbQuery(action === 'specskip' ? 'Skipped.' : 'Saved.');
      return askOwnerProductSpec(ctx, fresh, client, state, { edit: true });
    }
    if (action === 'photofeature') {
      state.draft ||= {};
      state.draft.featured = !Boolean(state.draft.featured);
      setOwnerProductState(fresh, chatId, state);
      await writeData(fresh);
      await ctx.answerCbQuery(state.draft.featured ? 'Featured enabled.' : 'Featured disabled.');
      try {
        await ctx.editMessageReplyMarkup(ownerPhotoDoneKeyboard(!(state.photos || []).length, state));
      } catch (error) {
        if (!/message is not modified/i.test(error.message || '')) {
          await ctx.reply(ownerPhotoProgressText(state), { reply_markup: ownerPhotoDoneKeyboard(!(state.photos || []).length, state) });
        }
      }
      return true;
    }
    if (action === 'photosdone' || action === 'photosskip') {
      await (ownerPhotoAppendQueues.get(chatId) || Promise.resolve());
      const latest = ensureCollections(await readData());
      state = ownerProductState(latest, chatId) || state;
      client = clientFor(latest, state.clientId) || client;
      await ctx.answerCbQuery('Preparing summary.');
      const product = buildOwnerProduct(state, client);
      await ctx.reply([
        'Review product before saving:',
        '',
        ownerProductSummary(client, product),
        '',
        'Save this product?'
      ].join('\n'), {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Save Product', callback_data: 'op:save' }],
            ownerProductCancelRow
          ]
        }
      });
      return true;
    }
    if (action === 'save') {
      await ctx.answerCbQuery('Saving...');
      return saveOwnerProduct(ctx, fresh, client, state);
    }
    await ctx.answerCbQuery('Unknown action.');
    return true;
  };

  const handleOwnerProductMessage = async ctx => {
    const fresh = ensureCollections(await readData());
    const chatId = String(ctx.chat?.id || '');
    const state = ownerProductState(fresh, chatId);
    if (!state || state.mode !== 'add_product') return false;
    const client = clientFor(fresh, state.clientId);
    if (!client) {
      setOwnerProductState(fresh, chatId, null);
      await writeData(fresh);
      await ctx.reply('Business not found. Please start again with /addproduct.');
      return true;
    }
    const text = String(ctx.message?.text || '').trim();
    if (/^\/cancel$/i.test(text)) {
      await cleanupOwnerProductPhotos(state);
      setOwnerProductState(fresh, chatId, null);
      await writeData(fresh);
      await ctx.reply('Product upload cancelled.', { reply_markup: ownerMainKeyboard() });
      return true;
    }
    state.draft ||= {};
    if (state.step === 'name') {
      if (!text || text.startsWith('/')) {
        await ctx.reply('Please send the product name as text.');
        return true;
      }
      state.draft.name = cleanText(text, 120);
      if (isCakeProduct(client, state.draft)) {
        state.draft.code = generateProductCode(fresh, client, state.draft);
        state.step = 'price';
        setOwnerProductState(fresh, chatId, state);
        await writeData(fresh);
        await ctx.reply('Now send the price in Birr.');
        return true;
      }
      state.step = 'code';
      setOwnerProductState(fresh, chatId, state);
      await writeData(fresh);
      await askOwnerProductCode(ctx, fresh, client, state);
      return true;
    }
    if (state.step === 'code') {
      if (!text || text.startsWith('/')) {
        await askOwnerProductCode(ctx, fresh, client, state);
        return true;
      }
      const code = cleanText(text, 40).toUpperCase();
      const duplicate = (fresh.products || []).find(product => product.clientId === client.id && String(product.code || '').toUpperCase() === code);
      if (duplicate) {
        await ctx.reply('That product code already exists. Send another code or tap Auto Code.');
        return true;
      }
      state.draft.code = code;
      state.step = 'price';
      setOwnerProductState(fresh, chatId, state);
      await writeData(fresh);
      await ctx.reply('Now send the price in Birr.');
      return true;
    }
    if (state.step === 'price') {
      const price = cleanMoney(text);
      if (!price) {
        await ctx.reply('Please send a valid price, for example 2500.');
        return true;
      }
      state.draft.price = price;
      state.specGroups = productSpecGroupsProfile(state.draft.category, state.draft.subcategory, state.draft.name);
      state.specGroups = [
        ...state.specGroups.filter(group => group.field === 'color'),
        ...state.specGroups.filter(group => group.field === 'size'),
        ...state.specGroups.filter(group => group.field !== 'color' && group.field !== 'size')
      ];
      state.specIndex = 0;
      state.specSelections = {};
      state.step = 'specs';
      setOwnerProductState(fresh, chatId, state);
      await writeData(fresh);
      return askOwnerProductSpec(ctx, fresh, client, state);
    }
    if (state.step === 'custom_spec') {
      const group = state.specGroups?.[state.specIndex];
      if (!group) return askOwnerProductSpec(ctx, fresh, client, state);
      const values = text.split(/[,|/;\n]+/).map(item => cleanText(item, 50)).filter(Boolean);
      state.specSelections ||= {};
      state.specSelections[group.key] = [...new Set([...(state.specSelections[group.key] || []), ...values])].slice(0, 20);
      state.step = 'specs';
      setOwnerProductState(fresh, chatId, state);
      await writeData(fresh);
      return askOwnerProductSpec(ctx, fresh, client, state);
    }
    if (state.step === 'description') {
      state.draft.description = /^skip$/i.test(text) ? '' : cleanText(text, 700);
      state.step = 'stock';
      setOwnerProductState(fresh, chatId, state);
      await writeData(fresh);
      await ctx.reply('Send stock quantity, or send "skip" if you do not want to track stock.');
      return true;
    }
    if (state.step === 'stock') {
      state.draft.stockQuantity = /^skip$/i.test(text) ? '' : Math.max(0, Number(String(text).replace(/\D/g, '')) || 0);
      state.step = 'photos';
      setOwnerProductState(fresh, chatId, state);
      await writeData(fresh);
      await askOwnerProductPhotos(ctx, state);
      return true;
    }
    if (state.step === 'photos') {
      if (ctx.message?.photo?.length) {
        const mediaGroupId = String(ctx.message.media_group_id || '');
        let latestState = state;
        try {
          latestState = await queueOwnerPhotoAppend(chatId, async () => {
            const latest = ensureCollections(await readData());
            const currentState = ownerProductState(latest, chatId);
            if (!currentState || currentState.mode !== 'add_product' || currentState.step !== 'photos') return null;
            if ((currentState.photos || []).length >= 5) return currentState;
            const latestClient = clientFor(latest, currentState.clientId) || client;
            const productPreview = { code: currentState.draft?.code, name: currentState.draft?.name };
            const record = await downloadOwnerProductPhoto(ctx, latestClient, productPreview);
            currentState.photos ||= [];
            currentState.photos.push({ ...record, isPrimary: currentState.photos.length === 0 });
            if (mediaGroupId) {
              currentState.lastPhotoBatch = {
                id: mediaGroupId,
                count: currentState.lastPhotoBatch?.id === mediaGroupId ? Number(currentState.lastPhotoBatch.count || 0) + 1 : 1,
                updatedAt: now()
              };
            } else {
              currentState.lastPhotoBatch = null;
            }
            setOwnerProductState(latest, chatId, currentState);
            await writeData(latest);
            return currentState;
          });
          if (!latestState) return true;
          if ((latestState.photos || []).length >= 5 && (!mediaGroupId || latestState.lastPhotoBatch?.count <= 1)) {
            await ctx.reply(ownerPhotoProgressText(latestState), { reply_markup: ownerPhotoDoneKeyboard(false, latestState) });
            return true;
          }
          if (mediaGroupId) {
            scheduleOwnerPhotoBatchPrompt(ctx, chatId, mediaGroupId);
            return true;
          }
          await ctx.reply(ownerPhotoProgressText(latestState), { reply_markup: ownerPhotoDoneKeyboard(false, latestState) });
        } catch (error) {
          await ctx.reply(`I could not save that photo: ${error.message}`);
        }
        return true;
      }
      if (/^(done|save|finish)$/i.test(text)) {
        await (ownerPhotoAppendQueues.get(chatId) || Promise.resolve());
        const latest = ensureCollections(await readData());
        const latestState = ownerProductState(latest, chatId) || state;
        const latestClient = clientFor(latest, latestState.clientId) || client;
        const product = buildOwnerProduct(latestState, latestClient);
        await ctx.reply([
          'Review product before saving:',
          '',
          ownerProductSummary(latestClient, product),
          '',
          'Save this product?'
        ].join('\n'), {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Save Product', callback_data: 'op:save' }],
              ownerProductCancelRow
            ]
          }
        });
        return true;
      }
      await askOwnerProductPhotos(ctx, state);
      return true;
    }
    return false;
  };

  const sendAdminAlert = async (data, key, text, minMinutes = 30) => {
    data = ensureCollections(data || await readData());
    const settings = data.platformSettings || {};
    if (!settings.adminAlertsEnabled || !settings.adminAlertChatId) return false;
    const token = String(settings.adminBotToken || process.env.SPRINTSALES_ADMIN_BOT_TOKEN || '').trim();
    if (!token) return false;
    const last = settings.lastAlertAt?.[key] ? new Date(settings.lastAlertAt[key]).getTime() : 0;
    if (last && Date.now() - last < minMinutes * 60 * 1000) return false;
    try {
      const bot = new Telegraf(token);
      await bot.telegram.sendMessage(settings.adminAlertChatId, notificationHtml(text), { parse_mode: 'HTML' });
      settings.lastAlertAt ||= {};
      settings.lastAlertAt[key] = now();
      await writeData(data);
      return true;
    } catch (error) {
      console.warn('Admin alert failed:', error.message);
      await recordBotError(data, {
        type: 'admin-alert',
        message: `Admin Telegram alert failed: ${error.message}`,
        severity: 'warn'
      }).catch(() => null);
      return false;
    }
  };

  const sendClientNotification = async (data, client, key, text, preference = 'hotLeads', minMinutes = 30, options = {}) => {
    data = ensureCollections(data || await readData());
    if (!client?.id) return false;
    client = clientFor(data, client.id);
    const settings = client?.settings || {};
    const ownerChatId = privateOwnerChatId(settings);
    if (!client || client.status !== 'active' || !settings.botToken || !ownerChatId) return false;
    if (settings.notificationPrefs?.[preference] === false) return false;
    data.platformSettings ||= {};
    data.platformSettings.lastAlertAt ||= {};
    const alertKey = `client-${key}`;
    const last = data.platformSettings.lastAlertAt?.[alertKey] ? new Date(data.platformSettings.lastAlertAt[alertKey]).getTime() : 0;
    if (last && Date.now() - last < minMinutes * 60 * 1000) return false;
    try {
      if (options.supportReply) {
        const sentSupportPrompt = await sendSupportReplyPrompt(data, client, ownerChatId, text, options.supportReply).catch(error => {
          console.warn(`Support reply prompt failed for ${client.businessName}:`, error.message);
          return false;
        });
        if (sentSupportPrompt) {
          data.platformSettings.lastAlertAt[alertKey] = now();
          await writeData(data);
          return true;
        }
      }
      const runner = botRunners.get(client.id);
      const telegram = runner?.telegram || new Telegraf(settings.botToken).telegram;
      await telegram.sendMessage(ownerChatId, notificationHtml(text, client.businessName), { parse_mode: 'HTML' });
      data.platformSettings.lastAlertAt[alertKey] = now();
      await writeData(data);
      return true;
    } catch (error) {
      console.warn(`Client notification failed for ${client.businessName}:`, error.message);
      addBotError(data, {
        clientId: client.id,
        businessName: client.businessName,
        type: 'client-notification',
        message: `Client Telegram notification failed: ${error.message}`,
        severity: 'warn'
      });
      await writeData(data).catch(() => null);
      return false;
    }
  };

  const sendPlatformAdminBotMessage = async (data, chatId, text, extra = {}) => {
    data = ensureCollections(data || await readData());
    const settings = data.platformSettings || {};
    const token = String(settings.adminBotToken || process.env.SPRINTSALES_ADMIN_BOT_TOKEN || '').trim();
    const target = String(chatId || '').trim();
    if (!token) {
      throw new Error('SprintSales Admin bot is not configured yet. Add the admin bot token in the admin settings.');
    }
    if (!target) {
      throw new Error('No Telegram chat ID is connected for this account.');
    }
    const bot = new Telegraf(token);
    await bot.telegram.sendMessage(target, text, extra);
    return true;
  };

  const startPlatformAdminBot = async () => {
    const data = ensureCollections(await readData());
    const settings = data.platformSettings || {};
    const token = String(settings.adminBotToken || process.env.SPRINTSALES_ADMIN_BOT_TOKEN || '').trim();
    if (!token) return false;
    if (platformAdminBot) return true;
    const bot = new Telegraf(token);
    bot.start(async ctx => {
      const fresh = ensureCollections(await readData());
      const ownerClients = activeOwnerClients(fresh, ctx.chat?.id);
      if (ownerClients.length) {
        await replyOwnerMenu(ctx, ownerClients[0]);
        return;
      }
      await ctx.reply([
        'Welcome to SprintSales.',
        '',
        'To verify your business owner account, please tap Share phone number below.',
        'We will use it only to connect your Telegram account with your SprintSales registration and security codes.'
      ].join('\n'), {
        reply_markup: {
          keyboard: [[{ text: 'Share phone number', request_contact: true }]],
          resize_keyboard: true,
          one_time_keyboard: true
        }
      });
    });
    bot.command('addproduct', async ctx => {
      await startOwnerProductUpload(ctx).catch(async error => {
        console.warn('Owner product upload command failed:', error.message);
        await ctx.reply('I could not start product upload. Please try again from the dashboard or send /addproduct again.');
      });
    });
    bot.hears(/(?:^|\s)add\s+product(?:\s|$)/i, async ctx => {
      await startOwnerProductUpload(ctx).catch(async error => {
        console.warn('Owner product upload button failed:', error.message);
        await ctx.reply('I could not start product upload. Please try again from the dashboard or send /addproduct again.');
      });
    });
    bot.on('contact', async ctx => {
      const contact = ctx.message?.contact || {};
      const sharedPhone = contact.phone_number || '';
      const key = phoneKey(sharedPhone);
      if (!key) {
        await ctx.reply('I could not read the phone number. Please tap the Share phone number button again.');
        return;
      }
      const fresh = ensureCollections(await readData());
      fresh.platformSettings ||= {};
      fresh.platformSettings.verifiedTelegramOwners ||= {};
      fresh.platformSettings.verifiedTelegramOwners[key] = {
        phone: sharedPhone,
        chatId: String(ctx.chat?.id || ''),
        telegramUserId: String(ctx.from?.id || ''),
        username: ctx.from?.username || '',
        firstName: ctx.from?.first_name || '',
        lastName: ctx.from?.last_name || '',
        verifiedAt: now()
      };
      await writeData(fresh);
      await ctx.reply('You have verified your phone number. You can go and finish your SprintSales registration with this phone number.', {
        reply_markup: ownerMainKeyboard()
      });
    });
    bot.action(/^op:(.+)$/, async ctx => {
      await handleOwnerProductCallback(ctx).catch(async error => {
        console.warn('Owner product callback failed:', error.message);
        await ctx.answerCbQuery('Could not process that action.').catch(() => null);
        await ctx.reply('I could not process that product step. Please try again or send /cancel.');
      });
    });
    bot.action(/^support_confirm:([A-Za-z0-9_-]+)$/, async ctx => {
      await confirmSupportReply(ctx).catch(async error => {
        console.warn('Support confirm failed:', error.message);
        await ctx.answerCbQuery('Could not send. Please try again.');
      });
    });
    bot.action(/^support_edit:([A-Za-z0-9_-]+)$/, async ctx => {
      await editSupportReply(ctx).catch(async error => {
        console.warn('Support edit failed:', error.message);
        await ctx.answerCbQuery('Could not open edit mode.');
      });
    });
    bot.on('message', async ctx => {
      if (ctx.message?.contact) return;
      if (await handleOwnerProductMessage(ctx).catch(async error => {
        console.warn('Owner product message failed:', error.message);
        await ctx.reply('I could not process that product detail. Please try again or send /cancel.');
        return true;
      })) return;
      if (await handlePlatformSupportReply(ctx).catch(async error => {
        console.warn('Platform support reply failed:', error.message);
        await ctx.reply('I could not send that support reply. Please try again from the dashboard.');
        return true;
      })) return;
      const fresh = ensureCollections(await readData());
      const ownerClients = activeOwnerClients(fresh, ctx.chat?.id);
      if (ownerClients.length) {
        await replyOwnerMenu(ctx, ownerClients[0]);
        return;
      }
      await ctx.reply('Please tap Share phone number so SprintSales can verify your owner account.', {
        reply_markup: ownerMainKeyboard()
      });
    });
    await bot.launch({ dropPendingUpdates: true });
    platformAdminBot = bot;
    return true;
  };

  return {
    sendAdminAlert,
    sendClientNotification,
    sendPlatformAdminBotMessage,
    startPlatformAdminBot
  };
}
