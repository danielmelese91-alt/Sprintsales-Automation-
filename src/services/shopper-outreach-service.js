const HOUR_MS = 60 * 60 * 1000;

const slugify = value => String(value || '')
  .toLowerCase()
  .trim()
  .replace(/['"]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80);

const cleanHost = value => String(value || '')
  .trim()
  .replace(/^https?:\/\//i, '')
  .replace(/\/.*$/, '')
  .replace(/^www\./i, '');

const cleanUsername = value => String(value || '')
  .trim()
  .replace(/^https?:\/\/t\.me\//i, '')
  .replace(/^@/, '')
  .split(/[/?#]/)[0];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export const createShopperOutreachService = (deps = {}) => {
  const {
    Telegraf,
    loadGramJs,
    botRunners = new Map(),
    accountRunners = new Map(),
    recordBotError = async () => {},
    platformDomain = process.env.PUBLIC_PLATFORM_DOMAIN || 'sprintsales.net',
    personalHourlyLimit = 35,
    personalSendGapMs = 900
  } = deps;

  const outreachClients = new Map();
  const personalSendTimes = new Map();
  const personalCircuitUntil = new Map();
  const accountQueues = new Map();

  const clientSettings = client => client?.settings || {};

  const storefrontBaseUrl = client => {
    const settings = clientSettings(client);
    const customDomain = cleanHost(settings.miniapp?.customDomain || settings.miniappDomain || '');
    if (customDomain) return `https://${customDomain}`;
    const slug = slugify(settings.miniapp?.slug || settings.storeSlug || client?.businessName || client?.id || 'shop');
    return `https://${slug}.${cleanHost(platformDomain) || 'sprintsales.net'}`;
  };

  const storefrontUrlForClient = (client, product = null) => {
    const base = storefrontBaseUrl(client);
    const key = String(product?.code || product?.productCode || product?.id || '').trim();
    return key ? `${base}/product/${encodeURIComponent(key)}` : `${base}/`;
  };

  const botDeepLink = (client, payload = '') => {
    const username = cleanUsername(
      clientSettings(client).botUsername ||
      clientSettings(client).telegramBotUsername ||
      clientSettings(client).connectedBotUsername
    );
    if (!username) return '';
    return `https://t.me/${username}${payload ? `?start=${encodeURIComponent(payload)}` : ''}`;
  };

  const optOutPayloadForKind = kind => {
    if (kind === 'recommendation') return 'stop_suggestions';
    if (kind === 'intent_recovery') return 'stop_reminders';
    return 'stop_promotions';
  };

  const personalTargetFor = recipient => {
    const username = cleanUsername(recipient?.telegramUsername || recipient?.username || '');
    if (username) return username;
    return String(recipient?.telegramUserId || recipient?.telegramChatId || '').trim();
  };

  const personalAccountConfigured = client => {
    const settings = clientSettings(client);
    return settings.accountSessionStatus === 'connected' &&
      Boolean(settings.accountSessionString) &&
      Boolean(Number(settings.accountApiId)) &&
      Boolean(settings.accountApiHash);
  };

  const personalQuotaAvailable = clientId => {
    const now = Date.now();
    const recent = (personalSendTimes.get(clientId) || []).filter(time => now - time < HOUR_MS);
    personalSendTimes.set(clientId, recent);
    return recent.length < Math.max(1, Number(personalHourlyLimit) || 35);
  };

  const markPersonalSent = clientId => {
    const recent = personalSendTimes.get(clientId) || [];
    recent.push(Date.now());
    personalSendTimes.set(clientId, recent);
  };

  const personalCircuitOpen = clientId => Number(personalCircuitUntil.get(clientId) || 0) > Date.now();

  const isFloodError = error => /PEER_FLOOD|FLOOD_WAIT|USER_PRIVACY_RESTRICTED|CHAT_WRITE_FORBIDDEN|INPUT_USER_DEACTIVATED/i.test(
    `${error?.errorMessage || ''} ${error?.message || ''}`
  );

  const getPersonalClient = async client => {
    const running = accountRunners.get(client.id);
    if (running) return running;
    const cached = outreachClients.get(client.id);
    const settings = clientSettings(client);
    if (cached?.sessionString === settings.accountSessionString) return cached.telegram;
    if (cached?.telegram) {
      await cached.telegram.disconnect().catch(() => {});
      outreachClients.delete(client.id);
    }
    const { TelegramClient, StringSession } = await loadGramJs();
    const telegram = new TelegramClient(
      new StringSession(settings.accountSessionString),
      Number(settings.accountApiId),
      settings.accountApiHash,
      { connectionRetries: 5 }
    );
    await telegram.connect();
    const authorized = typeof telegram.checkAuthorization === 'function'
      ? await telegram.checkAuthorization()
      : true;
    if (!authorized) {
      await telegram.disconnect().catch(() => {});
      throw new Error('Personal Telegram account session is no longer authorized.');
    }
    outreachClients.set(client.id, {
      telegram,
      sessionString: settings.accountSessionString
    });
    return telegram;
  };

  const queuePersonalSend = (clientId, task) => {
    const previous = accountQueues.get(clientId) || Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(async () => {
        await sleep(Math.max(0, Number(personalSendGapMs) || 0));
        return task();
      });
    const tracked = next.finally(() => {
      if (accountQueues.get(clientId) === tracked) accountQueues.delete(clientId);
    });
    accountQueues.set(clientId, tracked);
    return tracked;
  };

  const personalMessage = ({ client, text, product, kind }) => {
    const productUrl = storefrontUrlForClient(client, product);
    const stopUrl = botDeepLink(client, optOutPayloadForKind(kind));
    return [
      String(text || '').trim(),
      '',
      product ? `View product: ${productUrl}` : `Open shop: ${productUrl}`,
      stopUrl ? `Stop these messages: ${stopUrl}` : ''
    ].filter(Boolean).join('\n').slice(0, 4000);
  };

  const sendByPersonalAccount = async ({ client, recipient, text, product, kind }) => {
    const target = personalTargetFor(recipient);
    if (!target) throw new Error('Shopper Telegram identity is unavailable.');
    if (!personalQuotaAvailable(client.id)) throw new Error('Personal outreach hourly safety limit reached.');
    if (personalCircuitOpen(client.id)) throw new Error('Personal outreach is temporarily paused after a Telegram delivery error.');
    return queuePersonalSend(client.id, async () => {
      const telegram = await getPersonalClient(client);
      await telegram.sendMessage(target, {
        message: personalMessage({ client, text, product, kind }),
        linkPreview: true
      });
      markPersonalSent(client.id);
      return true;
    });
  };

  const sendByBot = async ({ client, recipient, text, botExtra = {} }) => {
    const chatId = String(recipient?.telegramChatId || recipient?.telegramUserId || '').trim();
    const token = clientSettings(client).botToken;
    if (!chatId || !token) return false;
    const runner = botRunners.get(client.id);
    const telegram = runner?.telegram || new Telegraf(token).telegram;
    await telegram.sendMessage(chatId, String(text || '').trim().slice(0, 4000), botExtra);
    return true;
  };

  const sendShopperOutreach = async ({
    client,
    recipient,
    text,
    product = null,
    kind = 'promotion',
    botExtra = {}
  }) => {
    if (!client || !recipient || !String(text || '').trim()) {
      return { sent: false, channel: 'none', reason: 'missing_message_data' };
    }

    if (personalAccountConfigured(client) && !personalCircuitOpen(client.id) && personalQuotaAvailable(client.id)) {
      try {
        await sendByPersonalAccount({ client, recipient, text, product, kind });
        return { sent: true, channel: 'personal_account', url: storefrontUrlForClient(client, product) };
      } catch (error) {
        personalCircuitUntil.set(client.id, Date.now() + (isFloodError(error) ? HOUR_MS : 10 * 60 * 1000));
        await recordBotError(null, {
          clientId: client.id,
          businessName: client.businessName,
          type: 'personal-outreach-fallback',
          message: `Personal outreach failed; bot fallback used: ${error.message}`,
          severity: 'warn'
        }).catch(() => {});
      }
    }

    const sent = await sendByBot({ client, recipient, text, botExtra });
    return {
      sent,
      channel: sent ? 'bot' : 'none',
      reason: sent ? '' : 'no_available_telegram_sender',
      url: storefrontUrlForClient(client, product)
    };
  };

  return {
    sendShopperOutreach,
    storefrontUrlForClient,
    personalAccountConfigured
  };
};
