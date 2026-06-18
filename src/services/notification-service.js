export function createNotificationService(deps) {
  const {
    Telegraf,
    botRunners,
    readData,
    writeData,
    ensureCollections,
    clientFor,
    now,
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
    const body = [
      notificationHtml(text, client.businessName),
      '',
      '<b>Reply action:</b> Reply directly to this Telegram message. SprintSales will send your reply to the shopper using your shop bot.',
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
    if (!targetChatId) {
      await ctx.reply('This question has no customer chat connected, so I could not forward the reply.');
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
    const targetChatId = question.telegramChatId || (fresh.conversations || []).find(item => item.id === question.conversationId)?.telegramChatId || '';
    if (!targetChatId) {
      await ctx.answerCbQuery('No customer chat is connected.');
      return true;
    }
    await sendCustomerReplyViaClientBot(fresh, client, targetChatId, pending.draftAnswer);
    question.status = 'resolved';
    question.ownerReply = pending.draftAnswer.slice(0, 1800);
    question.repliedAt = now();
    question.updatedAt = now();
    question.repliedByChatId = String(ctx.chat?.id || '');
    setPendingSupportForChat(fresh, ctx.chat?.id, null);
    await writeData(fresh);
    await ctx.answerCbQuery('Sent.');
    await ctx.editMessageText(`Sent to the shopper from ${client.businessName}'s bot.`);
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
        reply_markup: { remove_keyboard: true }
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
      if (await handlePlatformSupportReply(ctx).catch(async error => {
        console.warn('Platform support reply failed:', error.message);
        await ctx.reply('I could not send that support reply. Please try again from the dashboard.');
        return true;
      })) return;
      await ctx.reply('Please tap Share phone number so SprintSales can verify your owner account.', {
        reply_markup: {
          keyboard: [[{ text: 'Share phone number', request_contact: true }]],
          resize_keyboard: true,
          one_time_keyboard: true
        }
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
