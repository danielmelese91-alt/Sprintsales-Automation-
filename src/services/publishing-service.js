import fs from 'node:fs';

export const createPublishingService = (deps = {}) => {
  const {
    Telegraf,
    Input,
    loadGramJs,
    botRunners,
    readData,
    writeData,
    now,
    uid,
    addAuditLog,
    recordBotError,
    sendAdminAlert,
    sendClientNotification,
    productPostingSettings,
    fallbackProductCaption
  } = deps;

  const isCakeProduct = product => /cake|bakery|pastr|dessert|birthday|wedding|fondant|bento|cupcake/.test([
    product?.category,
    product?.subcategory,
    product?.name,
    product?.productType
  ].filter(Boolean).join(' ').toLowerCase());

  const watermarkedCandidate = product => {
    if (isCakeProduct(product)) {
      const original = product.imageOriginalPath || product.originalImagePath || product.publicImagePath || product.imagePath || product.imageUrl || '';
      if (original) return original;
    }
    const direct = product.publicImagePath || product.watermarkedImagePath || product.imageWatermarked || '';
    if (direct) return direct;
    const imagePath = product.imagePath || '';
    if (!imagePath || /^https?:\/\//i.test(String(imagePath))) return imagePath;
    const parsed = imagePath.match(/^(.*?)(\.[^.\\/]+)?$/);
    const candidate = parsed ? `${parsed[1]}.watermarked${parsed[2] || '.jpg'}` : '';
    return candidate && fs.existsSync(candidate) ? candidate : imagePath;
  };

  const createProductPost = ({ data, client, product, caption, status = 'draft', destination = '', auto = false }) => {
    data.productPosts ||= [];
    const post = {
      id: uid('post'),
      clientId: client.id,
      productId: product.id,
      productCode: product.code || '',
      productName: product.name || '',
      caption: String(caption || '').slice(0, 1000),
      destination: String(destination || '').trim(),
      status,
      auto: Boolean(auto),
      error: '',
      createdAt: now(),
      updatedAt: now(),
      postedAt: ''
    };
    data.productPosts.push(post);
    return post;
  };

  const sendProductPost = async ({ data, client, post }) => {
    const product = (data.products || []).find(item => item.id === post.productId && item.clientId === client.id);
    if (!product) throw new Error('Product not found for this post.');
    const destination = String(post.destination || productPostingSettings(client.settings).destination || '').trim();
    if (!destination) throw new Error('Add a Telegram channel/group username or chat ID first.');
    const caption = String(post.caption || fallbackProductCaption(client, product)).slice(0, 1000);
    const imagePath = watermarkedCandidate(product);
    try {
      if ((client.settings.automationType || 'bot') === 'account' && client.settings.accountSessionString) {
        const { TelegramClient, StringSession } = await loadGramJs();
        const telegram = new TelegramClient(
          new StringSession(client.settings.accountSessionString),
          Number(client.settings.accountApiId),
          client.settings.accountApiHash,
          { connectionRetries: 5 }
        );
        await telegram.connect();
        if (imagePath) await telegram.sendFile(destination, { file: imagePath, caption });
        else await telegram.sendMessage(destination, { message: caption });
        await telegram.disconnect();
      } else {
        if (!client.settings.botToken) throw new Error('Telegram bot token is missing.');
        const bot = new Telegraf(client.settings.botToken);
        if (imagePath) await bot.telegram.sendPhoto(destination, Input.fromLocalFile(imagePath), { caption });
        else await bot.telegram.sendMessage(destination, caption);
      }
      post.status = 'posted';
      post.destination = destination;
      post.postedAt = now();
      post.updatedAt = now();
      post.error = '';
      addAuditLog(data, {
        user: null,
        action: 'product-post.posted',
        clientId: client.id,
        target: `${product.code} ${product.name}`,
        details: `Product post sent to ${destination}.`
      });
      return post;
    } catch (error) {
      post.status = 'failed';
      post.destination = destination;
      post.error = error.message;
      post.updatedAt = now();
      await recordBotError(data, {
        clientId: client.id,
        businessName: client.businessName,
        type: 'product-post',
        message: `Product post failed: ${error.message}`,
        severity: 'warn'
      });
      throw error;
    }
  };

  const sendCustomerTelegramMessage = async (client, chatId, text, extra = {}) => {
    const target = String(chatId || '').trim();
    const message = String(text || '').trim().slice(0, 1000);
    if (!target || !message) return false;
    if ((client.settings?.automationType || 'bot') === 'account' && client.settings.accountSessionString) {
      const { TelegramClient, StringSession } = await loadGramJs();
      const telegram = new TelegramClient(
        new StringSession(client.settings.accountSessionString),
        Number(client.settings.accountApiId),
        client.settings.accountApiHash,
        { connectionRetries: 5 }
      );
      await telegram.connect();
      await telegram.sendMessage(target, { message });
      await telegram.disconnect();
      return true;
    }
    if (!client.settings?.botToken) return false;
    const runner = botRunners.get(client.id);
    const telegram = runner?.telegram || new Telegraf(client.settings.botToken).telegram;
    await telegram.sendMessage(target, message, extra);
    return true;
  };

  const renewalAlertStage = billing => {
    if (!billing?.renewalDate) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const renewal = new Date(`${billing.renewalDate}T00:00:00`);
    const days = Math.round((renewal - today) / 86400000);
    if (days < 0) return { key: 'overdue', label: `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue` };
    if (days === 0) return { key: 'today', label: 'due today' };
    if (days <= 5) return { key: `in-${days}`, label: `due in ${days} day${days === 1 ? '' : 's'}` };
    return null;
  };

  const renewalMessageForAdmin = (client, stage) => [
    'SprintSales Automation',
    '',
    `Renewal reminder: ${client.businessName} is ${stage.label}.`,
    `Plan: ${String(client.billing?.plan || 'basic').toUpperCase()}.`,
    `Renewal date: ${client.billing.renewalDate}.`,
    'Action: check the Billing section and follow up if payment is due.'
  ].join('\n');

  const renewalMessageForClient = (client, stage) => [
    'SprintSales Automation',
    '',
    `Hello ${client.businessName}, your SprintSales service renewal is ${stage.label}.`,
    `Plan: ${String(client.billing?.plan || 'basic').toUpperCase()}.`,
    `Renewal date: ${client.billing.renewalDate}.`,
    'Please contact SprintSales to renew or confirm your service plan.'
  ].join('\n');

  const sendRenewalAlerts = async () => {
    const data = await readData();
    let changed = false;
    for (const client of data.clients || []) {
      if (client.billing?.status === 'suspended') continue;
      const stage = renewalAlertStage(client.billing);
      if (!stage) continue;
      await sendAdminAlert(data, `renewal-${client.id}-${stage.key}`, renewalMessageForAdmin(client, stage), 60 * 24 * 30);
      const sentClient = await sendClientNotification(
        data,
        client,
        `renewal-${client.id}-${stage.key}`,
        renewalMessageForClient(client, stage),
        'renewals',
        60 * 24 * 30
      );
      changed ||= sentClient;
    }
    if (changed) await writeData(data);
  };

  return {
    createProductPost,
    sendProductPost,
    sendCustomerTelegramMessage,
    renewalAlertStage,
    sendRenewalAlerts
  };
};
