import { Router } from 'express';
import { normalizePaymentOptions } from '../config/payment-methods.js';
import { normalizeDeliveryZones } from '../config/addis-delivery-locations.js';

const normalizeDiscountValue = value => Math.max(0, Math.min(100, Number(value || 0) || 0));
const normalizeWeeklyDiscountCap = value => Math.max(0, Math.min(9999, Number(value || 0) || 0));
const normalizeDiscountSettings = (value = {}) => ({
  enabled: value.enabled !== false,
  allowStacking: value.allowStacking === true,
  newBuyer: {
    enabled: value.newBuyer?.enabled === true,
    type: 'percent',
    value: normalizeDiscountValue(value.newBuyer?.value),
    maxPerWeek: normalizeWeeklyDiscountCap(value.newBuyer?.maxPerWeek)
  },
  repeatBuyer: {
    enabled: value.repeatBuyer?.enabled === true,
    type: 'percent',
    value: normalizeDiscountValue(value.repeatBuyer?.value),
    purchaseCount: Math.max(1, Math.min(999, Number(value.repeatBuyer?.purchaseCount || 2) || 2)),
    maxPerWeek: normalizeWeeklyDiscountCap(value.repeatBuyer?.maxPerWeek)
  },
  birthdayWeek: {
    enabled: value.birthdayWeek?.enabled === true,
    type: 'percent',
    value: normalizeDiscountValue(value.birthdayWeek?.value),
    maxPerWeek: normalizeWeeklyDiscountCap(value.birthdayWeek?.maxPerWeek)
  },
  sales: {
    enabled: value.sales?.enabled === true,
    type: 'percent',
    value: normalizeDiscountValue(value.sales?.value),
    maxPerWeek: normalizeWeeklyDiscountCap(value.sales?.maxPerWeek)
  },
  holiday: {
    enabled: value.holiday?.enabled === true,
    type: 'percent',
    value: normalizeDiscountValue(value.holiday?.value),
    maxPerWeek: normalizeWeeklyDiscountCap(value.holiday?.maxPerWeek)
  },
  codes: (Array.isArray(value.codes) ? value.codes : [])
    .map(row => ({
      code: String(row?.code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24),
      enabled: row?.enabled !== false,
      type: 'percent',
      value: normalizeDiscountValue(row?.value),
      expiresAt: String(row?.expiresAt || '').slice(0, 10),
      maxUses: Math.max(0, Math.min(99999, Number(row?.maxUses || 0) || 0)),
      maxUsesPerCustomer: Math.max(1, Math.min(99, Number(row?.maxUsesPerCustomer || 1) || 1)),
      maxPerWeek: normalizeWeeklyDiscountCap(row?.maxPerWeek)
    }))
    .filter(row => row.code && row.value > 0)
    .slice(0, 20)
});

const limitWords = (value, maxWords) => String(value || '')
  .trim()
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, maxWords)
  .join(' ');

const daysUntilRenewal = billing => {
  if (!billing?.renewalDate) return null;
  const renewal = new Date(`${billing.renewalDate}T00:00:00Z`).getTime();
  if (!Number.isFinite(renewal)) return null;
  const today = new Date();
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.ceil((renewal - start) / 86400000);
};

const identityChangeLimit = field => ['email', 'phone'].includes(field) ? 3 : 5;

export function createPublicRoutes(deps) {
  const {
    MB,
    Telegraf,
    addAuditLog,
    bookingNextAction,
    bookingStatusCustomerMessage,
    botDebugForClient,
    buildReply,
    businessMode,
    cleanupUploadedFiles,
    clientActivity,
    clientAnalytics,
    clientFor,
    clientHealthWarnings,
    clientQualityScore,
    clientStorageStats,
    createCampaign,
    createProductPost,
    createWatermarkedProductImage,
    categoryContextFromSettings,
    cloneRetailTemplateCategories,
    formatCategoryContextForPrompt,
    crypto,
    csvEscape,
    customerConversation,
    customerNoteRecord,
    customerRecords,
    customerTimeline,
    dataDir,
    defaultBilling,
    defaultSettings,
    analyzeProductImage,
    describeProductImage,
    directorySize,
    effectiveAi,
    ensureCollections,
    ensureCampaignCollections,
    execFileAsync,
    extractText,
    fetchWithTimeout,
    fs,
    generateProductCaption,
    getDefaultCategories,
    goLiveStatusForClient,
    hashPassword,
    isMissingKnowledgeReply,
    isProductBusiness,
    isServiceBusiness,
    loadGramJs,
    makeSession,
    missingTopic,
    normalizeAiUsage,
    normalizeBusinessType,
    normalizeProvider = provider => String(provider || 'deepseek').toLowerCase().trim(),
    notifyLowStock,
    now,
    orderGuardrails,
    orderLineTotal,
    orderPayload,
    orderQuantity,
    orderUnitPrice,
    orderNextAction,
    orderStatusCustomerMessage,
    os,
    parsePaymentSms,
    path,
    paymentMatchSummary,
    previewStatsForClient,
    productImageDir,
    productPostingSettings,
    productPrice,
    productUpload,
    publicDir,
    quotas,
    readData,
    readinessForClient,
    requireActiveClient,
    requireAuth,
    requireProductBusiness,
    safeClient,
    sendAdminAlert,
    sendPlatformAdminBotMessage,
    sendCustomerTelegramMessage,
    sendCampaign,
    buildCampaignAudience,
    campaignQuotaStatus,
    sendProductPost,
    serviceAllowsAutomation,
    startBot,
    stopBot,
    storage,
    storageReport,
    systemStatus,
    uid,
    upload,
    uploadDir,
    verifyPassword,
    validateCategorySelection,
    watermarkedPathForOriginal,
    writeData
  } = deps;
  const router = Router();

  const passwordCodeTtlMs = 10 * 60 * 1000;
  const passwordCodeMaxAttempts = 5;
  const ownerSecurityChatId = client => [
    client?.settings?.sprintsalesAdminChatId,
    client?.settings?.telegramOwnerChatId,
    client?.settings?.ownerChatId,
    client?.settings?.hotLeadNotifyChatId
  ].map(value => String(value || '').trim()).find(value => /^\d{5,20}$/.test(value)) || '';
  const maskChatId = value => {
    const text = String(value || '');
    if (text.length <= 4) return text ? 'connected' : '';
    return `${text.slice(0, 2)}***${text.slice(-3)}`;
  };
  const passwordCodeText = (client, code) => [
    'SprintSales security code',
    '',
    `Business: ${client?.businessName || 'your account'}`,
    `Code: ${code}`,
    '',
    'Use this code to confirm your password change. It expires in 10 minutes.',
    'If you did not request this, do not share the code and contact SprintSales admin.'
  ].join('\n');
  const identityCodeText = (client, code) => [
    'SprintSales business profile security code',
    '',
    `Business: ${client?.businessName || 'your account'}`,
    `Code: ${code}`,
    '',
    'Use this code to confirm business name, owner, phone, or email changes. It expires in 10 minutes.',
    'If you did not request this, do not share the code and contact SprintSales admin.'
  ].join('\n');
  const forgotPasswordCodeText = (client, code) => [
    'SprintSales password reset code',
    '',
    `Business: ${client?.businessName || 'your account'}`,
    `Code: ${code}`,
    '',
    'Use this code on the SprintSales login page to reset your password. It expires in 10 minutes.',
    'If you did not request this, do not share the code and contact SprintSales admin.'
  ].join('\n');
  const telegramBotTokenError = error => {
    const text = String(error?.description || error?.message || '');
    if (/401|unauthorized/i.test(text)) {
      return 'Telegram rejected this bot token. Paste the fresh token from BotFather and try again.';
    }
    if (/not found|404/i.test(text)) {
      return 'Telegram could not find this bot token. Please copy the full token from BotFather and try again.';
    }
    return `Telegram could not validate this bot token: ${text || 'unknown error'}`;
  };
  const validateTelegramBotToken = async token => {
    const probe = new Telegraf(String(token || '').trim());
    return probe.telegram.getMe();
  };
  const registrationPhoneKey = value => {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('251') && digits.length >= 12) return `0${digits.slice(3, 12)}`;
    if (digits.length === 9 && digits.startsWith('9')) return `0${digits}`;
    if (digits.startsWith('0')) return digits.slice(0, 10);
    return digits;
  };
  const ethiopianMobileKey = value => {
    let digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('251')) digits = digits.slice(3);
    if (digits.startsWith('0')) digits = digits.slice(1);
    if (digits.length > 9) digits = digits.slice(-9);
    return /^[79]\d{8}$/.test(digits) ? digits : '';
  };
  const samePhoneNumber = (left, right) => {
    const a = ethiopianMobileKey(left);
    const b = ethiopianMobileKey(right);
    if (a && b) return a === b;
    return String(left || '').replace(/\D/g, '') === String(right || '').replace(/\D/g, '');
  };
  const verifiedTelegramOwnerForPhone = (data, phone) => {
    const key = registrationPhoneKey(phone);
    if (!key) return null;
    return data.platformSettings?.verifiedTelegramOwners?.[key] || null;
  };
  const findUserByIdentifier = (data, identifier) => {
    const needle = String(identifier || '').trim().toLowerCase();
    if (!needle) return null;
    return (data.users || []).find(item =>
      String(item.email || '').toLowerCase() === needle ||
      samePhoneNumber(item.phone, needle)
    );
  };
  const normalizeBranchLocations = value => {
    if (Array.isArray(value)) {
      return value
        .map(item => ({
          city: String(item?.city || '').trim().slice(0, 80),
          address: String(item?.address || item?.location || '').trim().slice(0, 240)
        }))
        .filter(item => item.city || item.address)
        .slice(0, 3);
    }
    const text = String(value || '').trim();
    return text ? text.split(/\n+/).map(line => ({ city: '', address: line.trim().slice(0, 240) })).filter(item => item.address).slice(0, 3) : [];
  };
  const passwordMatchesUser = (input, user) => {
    const exact = String(input || '');
    if (!exact) return false;
    return verifyPassword(exact, user.passwordHash) ||
      (exact.trim() !== exact && verifyPassword(exact.trim(), user.passwordHash));
  };
  const userSessionPayload = user => ({
    role: user.role,
    name: user.name,
    email: user.email,
    mustChangePassword: Boolean(user.mustChangePassword || user.passwordChangeRequired || user.forcePasswordChange)
  });
  const clearPasswordChangeRequirement = user => {
    delete user.mustChangePassword;
    delete user.passwordChangeRequired;
    delete user.forcePasswordChange;
  };
  const adminBotDeliveryError = error => {
    const message = String(error?.message || error || '');
    if (/chat not found/i.test(message)) {
      return 'SprintSales Admin bot could not find that owner chat. Make sure the owner has started the SprintSales Admin bot, then save the correct owner Telegram chat ID in Telegram Bot settings.';
    }
    if (/bot was blocked|blocked by the user/i.test(message)) {
      return 'SprintSales Admin bot was blocked by this Telegram user. Ask the owner to unblock/start the Admin bot and try again.';
    }
    if (/unauthorized|token/i.test(message)) {
      return 'SprintSales Admin bot token is invalid or not saved correctly. Check Admin Settings > Admin Bot Token.';
    }
    return message || 'Could not send the confirmation code through the SprintSales Admin bot.';
  };

  const firstCleanText = values => values
    .map(value => String(value || '').trim())
    .find(value => value && !/^(undefined|null)$/i.test(value)) || '';

  const normalizeTelegramUsername = value => {
    const text = String(value || '').trim();
    if (!text) return '';
    const match = text.match(/(?:https?:\/\/t\.me\/)?@?([A-Za-z0-9_]{4,})/i);
    return match ? `@${match[1]}` : text;
  };

  const productImageRecords = product => {
    const records = Array.isArray(product?.images) ? product.images : [];
    if (records.length) {
      return records
        .map((item, index) => {
          if (!item) return null;
          if (typeof item === 'string') {
            return { originalPath: item, publicPath: item, watermarkedPath: item, isPrimary: index === 0 };
          }
          const publicPath = item.publicPath || item.publicImagePath || item.watermarkedPath || item.watermarkedImagePath || item.imagePath || item.imageUrl || item.url || '';
          const originalPath = item.originalPath || item.imageOriginalPath || item.originalImagePath || publicPath;
          return {
            ...item,
            originalPath,
            publicPath,
            watermarkedPath: item.watermarkedPath || item.watermarkedImagePath || publicPath,
            isPrimary: item.isPrimary === true || index === 0
          };
        })
        .filter(item => item && (item.originalPath || item.publicPath))
        .slice(0, 3);
    }
    const originalPath = product?.imageOriginalPath || product?.originalImagePath || '';
    const publicPath = product?.publicImagePath || product?.watermarkedImagePath || product?.imagePath || '';
    if (!originalPath && !publicPath) return [];
    return [{
      originalPath: originalPath || publicPath,
      publicPath: publicPath || originalPath,
      watermarkedPath: product?.watermarkedImagePath || publicPath || originalPath,
      originalName: product?.imageOriginalName || '',
      isPrimary: true
    }];
  };

  const productPublicImagePath = product => productImageRecords(product)[0]?.publicPath || product.publicImagePath || product.watermarkedImagePath || product.imagePath || '';

  const productOriginalImagePath = product => productImageRecords(product)[0]?.originalPath || product.imageOriginalPath || product.originalImagePath || product.imagePath || '';

  const productImagePaths = product => [...new Set([
    ...productImageRecords(product).flatMap(image => [image.originalPath, image.watermarkedPath, image.publicPath]),
    product.imageOriginalPath,
    product.originalImagePath,
    product.watermarkedImagePath,
    product.publicImagePath,
    product.imagePath
  ].filter(Boolean))];

  const pathIsInside = (candidate, root) => {
    try {
      const resolved = path.resolve(candidate);
      const resolvedRoot = path.resolve(root);
      return resolved === resolvedRoot || resolved.startsWith(`${resolvedRoot}${path.sep}`);
    } catch (_error) {
      return false;
    }
  };

  const unlinkProductImageRecord = async (clientId, record) => {
    const allowedRoot = path.join(productImageDir, clientId);
    const paths = [...new Set([
      record?.originalPath,
      record?.watermarkedPath,
      record?.publicPath,
      record?.imagePath,
      record?.imageOriginalPath,
      record?.watermarkedImagePath
    ].filter(Boolean))];
    for (const imagePath of paths) {
      if (pathIsInside(imagePath, allowedRoot)) {
        await fs.unlink(imagePath).catch(() => null);
      }
    }
  };

  const setPrimaryProductImageFields = product => {
    const records = productImageRecords(product).map((record, index) => ({ ...record, isPrimary: index === 0 }));
    product.images = records;
    const primary = records[0] || null;
    product.imageOriginalPath = primary?.originalPath || '';
    product.originalImagePath = primary?.originalPath || '';
    product.imageOriginalName = primary?.originalName || '';
    product.watermarkedImagePath = primary?.watermarkedPath || '';
    product.publicImagePath = primary?.publicPath || primary?.watermarkedPath || '';
    product.imagePath = primary?.publicPath || primary?.watermarkedPath || '';
    return records;
  };

  const watermarkCenterText = client => {
    const channel = normalizeTelegramUsername(client?.settings?.telegramChannelLink);
    const watermarkName = normalizeTelegramUsername(client?.settings?.watermarkName);
    return normalizeTelegramUsername(firstCleanText([
      client?.settings?.botUsername,
      client?.settings?.accountUsername,
      watermarkName && watermarkName !== channel ? watermarkName : '',
      client?.businessName,
      defaultSettings().watermarkName,
      'Sprintsales'
    ]));
  };

  const watermarkBottomText = (client, product = {}) => [
    firstCleanText([
    client?.settings?.watermarkName,
    client?.businessName,
    defaultSettings().watermarkName,
    'Sprintsales'
    ]),
    firstCleanText([product?.code, product?.sku, product?.productCode])
  ].filter(Boolean).join(' | ');

  const watermarkLogoPath = client => {
    const logoUrl = String(client?.settings?.businessLogoUrl || '').trim();
    if (!logoUrl || !logoUrl.startsWith('/uploads/products/')) return '';
    try {
      const parts = logoUrl.split('/').filter(Boolean).map(part => decodeURIComponent(part));
      const clientId = parts[2] || '';
      const fileName = parts[3] || '';
      if (!clientId || !fileName) return '';
      const candidate = path.join(productImageDir, clientId, fileName);
      return fs.existsSync(candidate) ? candidate : '';
    } catch (_error) {
      return '';
    }
  };

  const syncCategoryTemplates = (categories, existingTemplates = []) => {
    const existing = Array.isArray(existingTemplates) ? existingTemplates : [];
    return (categories || []).map(name => {
      const current = existing.find(item => item?.name === name);
      return {
        name,
        subcategories: Array.isArray(current?.subcategories) ? current.subcategories : []
      };
    });
  };

  const uploadedProductFiles = req => [
    ...(req.files?.image || []),
    ...(req.files?.images || []),
    ...(req.file ? [req.file] : [])
  ].filter(Boolean).slice(0, 3);

  const booleanField = (value, fallback = false) => {
    if (value === undefined) return fallback;
    if (typeof value === 'boolean') return value;
    return ['true', '1', 'yes', 'on'].includes(String(value).trim().toLowerCase());
  };

  const productStatusFromBody = body => {
    const status = String(body.status || '').trim().toLowerCase();
    if (['active', 'draft', 'hidden', 'out_of_stock'].includes(status)) return status;
    if (body.isActive !== undefined) return booleanField(body.isActive) ? 'active' : 'draft';
    return 'active';
  };

  const deliveryProgressForOrder = order => {
    const maxHours = Math.max(1, Number(order?.deliveryMaxHours || order?.deliveryEtaHours || 24) || 24);
    const startedAt = order?.deliveryStartedAt ? new Date(order.deliveryStartedAt) : new Date();
    const totalMs = maxHours * 60 * 60 * 1000;
    const percent = Math.min(100, Math.floor(Math.max(0, Date.now() - startedAt.getTime()) / totalMs * 100));
    const filled = Math.max(0, Math.min(10, Math.floor(percent / 10)));
    return `${'#'.repeat(filled)}${'-'.repeat(10 - filled)} ${percent}%`;
    return `${'🟩'.repeat(filled)}${'⬜'.repeat(10 - filled)} ${percent}%`;
  };

  const deliveryButtonsForOrder = order => ({
    inline_keyboard: [
      [{ text: 'Copy Tracking Code', copy_text: { text: publicOrderCode(order) } }],
      [{ text: 'Track Order', callback_data: 'productflow:track_order' }]
    ]
  });

  const publicOrderCode = order => {
    const short = String(order?.id || '').slice(-8);
    return short ? `#${short}` : '';
  };

  const paymentConfirmedCustomerMessage = (client, order) => [
    `Payment confirmed. Thank you, ${order.customerName || 'dear customer'}!`,
    '',
    `Tracking code: ${publicOrderCode(order)}.`,
    order.productName ? `We are preparing: ${[order.productName, order.selectedSize, order.selectedColor, order.selectedOption].filter(Boolean).join(' ')}.` : 'We are preparing your order.',
    '',
    `You are always welcome at ${client.businessName}. Any time you need another product, come back here and I will help you quickly.`,
    '',
    'Delivery status',
    deliveryProgressForOrder(order),
    `Maximum delivery time: ${Math.max(1, Number(order.deliveryMaxHours || order.deliveryEtaHours || 24) || 24)} hour(s)`
  ].join('\n');

  const applyProductImagePipeline = async ({ client, product, file, files, appendExisting = false }) => {
    const existingRecords = appendExisting ? productImageRecords(product).slice(0, 3) : [];
    const availableSlots = Math.max(0, 3 - existingRecords.length);
    const allIncomingFiles = (files?.length ? files : file ? [file] : []).filter(Boolean);
    const imageFiles = allIncomingFiles.slice(0, appendExisting ? availableSlots : 3);
    const ignoredFiles = allIncomingFiles.slice(imageFiles.length);
    if (ignoredFiles.length) await cleanupUploadedFiles(ignoredFiles);
    if (!imageFiles.length) return product;
    const primaryFile = imageFiles[0];
    const primaryOriginalPath = primaryFile.path;
    if (!existingRecords.length) {
      product.imageOriginalPath = primaryOriginalPath;
      product.originalImagePath = primaryOriginalPath;
      product.imageOriginalName = primaryFile.originalname || product.imageOriginalName || '';
    }
    product.imageAnalysis = null;
    product.detailedSearchDescription = '';
    product.imageDescription = '';
    product.productAttributes = product.productAttributes || {};
    const imageRecords = existingRecords.map((record, index) => ({ ...record, isPrimary: index === 0 }));
    for (const currentFile of imageFiles) {
      const originalPath = currentFile.path;
      const watermarkedPath = watermarkedPathForOriginal(originalPath);
      await createWatermarkedProductImage({
        inputPath: originalPath,
        outputPath: watermarkedPath,
        centerText: watermarkCenterText(client),
        bottomText: watermarkBottomText(client, product),
        bottomLogoPath: watermarkLogoPath(client)
      });
      imageRecords.push({
        originalPath,
        watermarkedPath,
        publicPath: watermarkedPath,
        originalName: currentFile.originalname || '',
        isPrimary: imageRecords.length === 0
      });
    }
    product.images = imageRecords.slice(0, 3).map((record, index) => ({ ...record, isPrimary: index === 0 }));
    product.watermarkedImagePath = imageRecords[0]?.watermarkedPath || '';
    product.publicImagePath = imageRecords[0]?.publicPath || '';
    product.imagePath = imageRecords[0]?.publicPath || '';
    product.watermark = {
      centerText: watermarkCenterText(client),
      bottomText: watermarkBottomText(client, product),
      bottomLogoPath: watermarkLogoPath(client),
      createdAt: now()
    };
    return product;
  };

  router.post('/api/login', async (req, res) => {
    const data = await readData();
    const identifier = String(req.body.email || req.body.phone || req.body.identifier || '').trim();
    const email = identifier.toLowerCase();
    const phoneKey = ethiopianMobileKey(identifier);
    const key = email || phoneKey || req.ip || 'unknown';
    const failure = data.loginFailures?.[key] || {};
    if (failure.lockedUntil && new Date(failure.lockedUntil).getTime() > Date.now()) {
      return res.status(429).json({ error: `Too many failed attempts. Try again after ${new Date(failure.lockedUntil).toLocaleTimeString()}.` });
    }
    const user = data.users.find(item =>
      item.email?.toLowerCase() === email ||
      samePhoneNumber(item.phone, identifier)
    );
    if (!user || !passwordMatchesUser(String(req.body.password || ''), user)) {
      data.loginFailures ||= {};
      const attempts = Number(failure.attempts || 0) + 1;
      data.loginFailures[key] = {
        attempts,
        lastFailedAt: now(),
        lockedUntil: attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : ''
      };
      await writeData(data);
      return res.status(401).json({ error: 'Invalid login or password' });
    }
    if (data.loginFailures?.[key]) {
      delete data.loginFailures[key];
      await writeData(data);
    }
    // TODO: secure=true requires HTTPS. Use NODE_ENV=development for HTTP testing.
    res.cookie('session', makeSession(user), {
      signed: true,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 12
    });
    const loginClient = user.clientId ? clientFor(data, user.clientId) : null;
    res.json({ user: userSessionPayload(user), client: loginClient ? safeClient(loginClient) : null });
  });

  router.post('/api/register/check-telegram', async (req, res) => {
    const data = await readData();
    ensureCollections(data);
    const body = req.body || {};
    const businessName = String(body.businessName || '').trim();
    const phone = String(body.phone || '').trim();
    const phoneKey = registrationPhoneKey(phone);
    if (!businessName || !phoneKey) return res.status(400).json({ error: 'Business name and phone number are required before checking Telegram verification.' });
    const verifiedOwner = verifiedTelegramOwnerForPhone(data, phone);
    const telegramChatId = String(verifiedOwner?.chatId || '').trim();
    if (!telegramChatId) return res.status(404).json({ error: 'Not verified yet. Open Telegram, start @sprintsalesbot, tap Share phone number, then press Check verification again.' });
    if (data.users.some(user => samePhoneNumber(user.phone, phone))) {
      return res.status(409).json({ error: 'That phone number already has a SprintSales account.' });
    }
    addAuditLog(data, {
      user: null,
      action: 'registration.telegram_verified',
      target: businessName,
      details: `Registration phone matched verified Telegram owner chat ${maskChatId(telegramChatId)}.`
    });
    await writeData(data);
    res.json({
      ok: true,
      verified: true,
      message: `Telegram owner verified for this phone (${maskChatId(telegramChatId)}). You can create the account now.`
    });
  });
  
  router.post('/api/register', async (req, res) => {
    const data = await readData();
    ensureCollections(data);
    const body = req.body || {};
    const businessName = String(body.businessName || '').trim();
    const name = String(body.name || '').trim() || businessName;
    const phone = String(body.phone || '').trim();
    const phoneKey = ethiopianMobileKey(phone) || phone.replace(/\s+/g, '');
    const email = String(body.email || '').trim().toLowerCase() || `${phone.replace(/\D/g, '')}@phone.sprintsales.local`;
    const password = String(body.password || '');
    const retailType = String(body.retailType || body.businessType || '').trim();
    const businessType = normalizeBusinessType(body.businessType) || 'retail';
    const plan = ['basic', 'pro'].includes(String(body.subscriptionPlan || body.plan || '').toLowerCase())
      ? String(body.subscriptionPlan || body.plan).toLowerCase()
      : 'basic';
    const categoryTemplates = cloneRetailTemplateCategories(retailType || businessType);
    if (!businessName || !phone || !password) return res.status(400).json({ error: 'Business name, phone number, and password are required.' });
    if (password.length < 5) return res.status(400).json({ error: 'Password must be at least 5 characters.' });
    const verifiedOwner = verifiedTelegramOwnerForPhone(data, phone);
    const telegramChatId = String(verifiedOwner?.chatId || '').trim();
    if (!telegramChatId) return res.status(400).json({ error: 'Telegram owner verification is required. Start @sprintsalesbot, tap Share phone number, then create the account again.' });
    if ((data.clients || []).length >= quotas.maxClients) return res.status(400).json({ error: 'Client capacity is full. Please contact Sprintsales.' });
    if (data.users.some(user => user.email.toLowerCase() === email)) return res.status(409).json({ error: 'That email already exists.' });
    if (data.users.some(user => samePhoneNumber(user.phone, phone))) return res.status(409).json({ error: 'That phone number already exists.' });
    const client = {
      id: uid('client'),
      businessName,
      ownerName: name,
      status: 'pending',
      businessType,
      billing: { ...defaultBilling(), plan },
      settings: {
        ...defaultSettings(),
        sprintsalesAdminChatId: telegramChatId,
        telegramOwnerChatId: telegramChatId,
        businessProfile: {
          ...defaultSettings().businessProfile,
          businessType,
          retailType,
          ownerName: name,
          summary: `${businessName} created this workspace by self-registration.`
        },
        categories: categoryTemplates.map(category => category.name),
        categoryTemplates
      },
      createdAt: now()
    };
    const user = {
      id: uid('user'),
      clientId: client.id,
      role: 'client',
      name,
      email,
      phone,
      passwordHash: hashPassword(password),
      createdAt: now()
    };
    data.clients.push(client);
    data.users.push(user);
    addAuditLog(data, {
      user,
      action: 'client.self_registered',
      clientId: client.id,
      target: businessName,
      details: `Client self-registered as ${retailType || businessType} after Telegram phone verification.`
    });
    await writeData(data);
    // TODO: secure=true requires HTTPS. Use NODE_ENV=development for HTTP testing.
    res.cookie('session', makeSession(user), {
      signed: true,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 12
    });
    res.json({ user: userSessionPayload(user), client: safeClient(client) });
  });
  
  router.post('/api/logout', (req, res) => {
    res.clearCookie('session', {
      signed: true,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    });
    res.json({ ok: true });
  });
  
  router.get('/api/health', async (req, res) => {
    res.json(await systemStatus(await readData()));
  });
  
  router.get('/api/me', requireAuth(), (req, res) => {
    const client = req.user.clientId ? clientFor(req.data, req.user.clientId) : null;
    res.json({
      user: userSessionPayload(req.user),
      client: client ? safeClient(client) : null
    });
  });

  router.post('/api/forgot-password/request', async (req, res) => {
    const data = await readData();
    const body = req.body || {};
    const identifier = String(body.identifier || '').trim();
    const newPassword = String(body.newPassword || '');
    if (!identifier || !newPassword) return res.status(400).json({ error: 'Email/phone and new password are required.' });
    if (newPassword.length < 5) return res.status(400).json({ error: 'New password must be at least 5 characters.' });
    const targetUser = findUserByIdentifier(data, identifier);
    if (!targetUser || targetUser.role === 'admin') {
      return res.json({ ok: true, message: 'If this account can be verified, a reset code will be sent to the owner Telegram chat.' });
    }
    const client = targetUser.clientId ? clientFor(data, targetUser.clientId) : null;
    const chatId = ownerSecurityChatId(client);
    if (!chatId) return res.status(400).json({ error: 'This account has no owner Telegram chat ID connected yet. Contact SprintSales admin for recovery.' });
    const code = String(crypto.randomInt(100000, 1000000));
    targetUser.pendingPasswordReset = {
      codeHash: hashPassword(code),
      newPasswordHash: hashPassword(newPassword),
      requestedAt: now(),
      expiresAt: new Date(Date.now() + passwordCodeTtlMs).toISOString(),
      attempts: 0,
      delivery: 'sprintsales-admin-bot',
      targetChatId: chatId
    };
    try {
      await sendPlatformAdminBotMessage(data, chatId, forgotPasswordCodeText(client, code));
    } catch (error) {
      delete targetUser.pendingPasswordReset;
      return res.status(503).json({ error: adminBotDeliveryError(error) });
    }
    addAuditLog(data, {
      user: null,
      action: 'password.reset.requested',
      clientId: targetUser.clientId,
      target: targetUser.email || targetUser.phone || targetUser.id,
      details: `Forgot-password reset code sent to owner Telegram chat ${maskChatId(chatId)}.`
    });
    await writeData(data);
    res.json({ ok: true, requiresVerification: true, message: `A reset code was sent to the connected owner Telegram chat (${maskChatId(chatId)}).` });
  });

  router.post('/api/forgot-password/confirm', async (req, res) => {
    const data = await readData();
    const body = req.body || {};
    const identifier = String(body.identifier || '').trim();
    const code = String(body.code || '').trim();
    const targetUser = findUserByIdentifier(data, identifier);
    const pending = targetUser?.pendingPasswordReset || null;
    if (!targetUser || !pending?.codeHash || !pending?.newPasswordHash) {
      return res.status(400).json({ error: 'No password reset request is waiting for confirmation.' });
    }
    if (new Date(pending.expiresAt || 0).getTime() < Date.now()) {
      delete targetUser.pendingPasswordReset;
      await writeData(data);
      return res.status(400).json({ error: 'The reset code has expired. Request a new code.' });
    }
    if ((Number(pending.attempts || 0)) >= passwordCodeMaxAttempts) {
      delete targetUser.pendingPasswordReset;
      await writeData(data);
      return res.status(429).json({ error: 'Too many wrong code attempts. Request a new reset code.' });
    }
    if (!/^\d{6}$/.test(code) || !verifyPassword(code, pending.codeHash)) {
      pending.attempts = Number(pending.attempts || 0) + 1;
      await writeData(data);
      return res.status(400).json({ error: 'Wrong reset code. Please check the Telegram message and try again.' });
    }
    targetUser.passwordHash = pending.newPasswordHash;
    targetUser.passwordChangedAt = now();
    clearPasswordChangeRequirement(targetUser);
    delete targetUser.pendingPasswordReset;
    addAuditLog(data, {
      user: null,
      action: 'password.reset.completed',
      clientId: targetUser.clientId,
      target: targetUser.email || targetUser.phone || targetUser.id,
      details: 'User reset password with owner Telegram confirmation.'
    });
    await writeData(data);
    const client = targetUser.clientId ? clientFor(data, targetUser.clientId) : null;
    res.cookie('session', makeSession(targetUser), {
      signed: true,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 12
    });
    res.json({
      ok: true,
      message: 'Password reset successfully. Opening your dashboard...',
      user: userSessionPayload(targetUser),
      client: client ? safeClient(client) : null
    });
  });
  
  router.post('/api/account/password/request', requireAuth(), async (req, res) => {
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');
    if (!passwordMatchesUser(currentPassword, req.user)) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }
    if (newPassword.length < 5) {
      return res.status(400).json({ error: 'New password must be at least 5 characters.' });
    }
    if (passwordMatchesUser(newPassword, req.user)) {
      return res.status(400).json({ error: 'New password must be different from your current password.' });
    }
    const client = req.user.clientId ? clientFor(req.data, req.user.clientId) : null;
    const chatId = ownerSecurityChatId(client);
    if (!chatId) {
      return res.status(400).json({ error: 'No owner Telegram chat ID is connected yet. Add the owner chat ID in Telegram Bot settings before changing the password.' });
    }
    const code = String(crypto.randomInt(100000, 1000000));
    req.user.pendingPasswordChange = {
      codeHash: hashPassword(code),
      newPasswordHash: hashPassword(newPassword),
      requestedAt: now(),
      expiresAt: new Date(Date.now() + passwordCodeTtlMs).toISOString(),
      attempts: 0,
      delivery: 'sprintsales-admin-bot',
      targetChatId: chatId
    };
    try {
      await sendPlatformAdminBotMessage(req.data, chatId, passwordCodeText(client, code));
    } catch (error) {
      delete req.user.pendingPasswordChange;
      return res.status(503).json({ error: adminBotDeliveryError(error) });
    }
    addAuditLog(req.data, {
      user: req.user,
      action: 'password.change.requested',
      clientId: req.user.clientId,
      target: req.user.email,
      details: `Password change confirmation code sent to owner Telegram chat ${maskChatId(chatId)}.`
    });
    await writeData(req.data);
    res.json({ ok: true, requiresVerification: true, message: `A confirmation code was sent to the connected owner Telegram chat (${maskChatId(chatId)}).` });
  });

  router.post('/api/account/password/confirm', requireAuth(), async (req, res) => {
    const code = String(req.body.code || '').trim();
    const pending = req.user.pendingPasswordChange || null;
    if (!pending?.codeHash || !pending?.newPasswordHash) {
      return res.status(400).json({ error: 'No password change request is waiting for confirmation.' });
    }
    if (new Date(pending.expiresAt || 0).getTime() < Date.now()) {
      delete req.user.pendingPasswordChange;
      await writeData(req.data);
      return res.status(400).json({ error: 'The confirmation code has expired. Request a new code.' });
    }
    if ((Number(pending.attempts || 0)) >= passwordCodeMaxAttempts) {
      delete req.user.pendingPasswordChange;
      await writeData(req.data);
      return res.status(429).json({ error: 'Too many wrong code attempts. Request a new password code.' });
    }
    if (!/^\d{6}$/.test(code) || !verifyPassword(code, pending.codeHash)) {
      pending.attempts = Number(pending.attempts || 0) + 1;
      await writeData(req.data);
      return res.status(400).json({ error: 'Wrong confirmation code. Please check the Telegram message and try again.' });
    }
    req.user.passwordHash = pending.newPasswordHash;
    req.user.passwordChangedAt = now();
    clearPasswordChangeRequirement(req.user);
    delete req.user.pendingPasswordChange;
    addAuditLog(req.data, {
      user: req.user,
      action: 'password.changed',
      clientId: req.user.clientId,
      target: req.user.email,
      details: 'User changed their own password after Telegram confirmation.'
    });
    await writeData(req.data);
    res.json({ ok: true, message: 'Password changed successfully.' });
  });

  router.post('/api/account/password/forced', requireAuth('client'), async (req, res) => {
    if (!req.user.mustChangePassword && !req.user.passwordChangeRequired && !req.user.forcePasswordChange) {
      return res.status(409).json({ error: 'No required password change is pending for this account.' });
    }
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');
    if (!passwordMatchesUser(currentPassword, req.user)) {
      return res.status(400).json({ error: 'Temporary password is incorrect.' });
    }
    if (newPassword.length < 5) {
      return res.status(400).json({ error: 'New password must be at least 5 characters.' });
    }
    if (passwordMatchesUser(newPassword, req.user)) {
      return res.status(400).json({ error: 'New password must be different from the temporary password.' });
    }
    req.user.passwordHash = hashPassword(newPassword);
    req.user.passwordChangedAt = now();
    req.user.passwordChangedAfterAdminResetAt = now();
    clearPasswordChangeRequirement(req.user);
    addAuditLog(req.data, {
      user: req.user,
      action: 'password.changed_after_admin_reset',
      clientId: req.user.clientId,
      target: req.user.email,
      details: 'Client changed password after admin reset.'
    });
    await writeData(req.data);
    res.json({ ok: true, message: 'Password changed successfully.', user: userSessionPayload(req.user) });
  });

  router.post('/api/account/password', requireAuth(), async (req, res) => {
    return res.status(409).json({ error: 'Password changes now require Telegram confirmation. Please request a confirmation code first.' });
  });

  router.post('/api/client/settings/identity-code', requireAuth('client'), requireActiveClient(), async (req, res) => {
    const client = clientFor(req.data, req.user.clientId);
    const chatId = ownerSecurityChatId(client);
    if (!chatId) {
      return res.status(400).json({ error: 'No owner Telegram chat ID is connected yet. Add the owner chat ID in Telegram Bot settings before changing business identity fields.' });
    }
    const code = String(crypto.randomInt(100000, 1000000));
    req.user.pendingIdentityConfirmation = {
      codeHash: hashPassword(code),
      requestedAt: now(),
      expiresAt: new Date(Date.now() + passwordCodeTtlMs).toISOString(),
      attempts: 0,
      delivery: 'sprintsales-admin-bot',
      targetChatId: chatId
    };
    try {
      await sendPlatformAdminBotMessage(req.data, chatId, identityCodeText(client, code));
    } catch (error) {
      delete req.user.pendingIdentityConfirmation;
      return res.status(503).json({ error: adminBotDeliveryError(error) });
    }
    addAuditLog(req.data, {
      user: req.user,
      action: 'client.identity.code.requested',
      clientId: client.id,
      target: client.businessName,
      details: `Business identity confirmation code sent to owner Telegram chat ${maskChatId(chatId)}.`
    });
    await writeData(req.data);
    res.json({ ok: true, message: `A confirmation code was sent to the connected owner Telegram chat (${maskChatId(chatId)}).` });
  });
  
  router.get('/api/client/dashboard', requireAuth('client'), async (req, res) => {
    const client = clientFor(req.data, req.user.clientId);
    const productMode = isProductBusiness(client);
    const serviceMode = isServiceBusiness(client);
    const conversations = req.data.conversations.filter(item => item.clientId === client.id);
    const leads = req.data.leads.filter(item => item.clientId === client.id);
    const files = serviceMode ? req.data.knowledgeFiles.filter(item => item.clientId === client.id) : [];
    const products = productMode ? (req.data.products || []).filter(item => item.clientId === client.id) : [];
    const productPosts = productMode ? (req.data.productPosts || []).filter(item => item.clientId === client.id) : [];
    const productRecommendations = productMode ? (req.data.productRecommendations || []).filter(item => item.clientId === client.id) : [];
    const productIntents = productMode ? (req.data.productIntents || []).filter(item => item.clientId === client.id) : [];
    const announcementCampaigns = productMode ? (req.data.announcementCampaigns || []).filter(item => item.clientId === client.id) : [];
    const campaignRecipients = productMode ? (req.data.campaignRecipients || []).filter(item => item.clientId === client.id) : [];
    const orders = productMode ? (req.data.orders || []).filter(item => item.clientId === client.id) : [];
    const stockMovements = productMode ? (req.data.stockMovements || []).filter(item => item.clientId === client.id) : [];
    const reminders = (req.data.reminders || []).filter(item => item.clientId === client.id);
    const bookings = serviceMode ? (req.data.bookings || []).filter(item => item.clientId === client.id) : [];
    const paymentProofs = (req.data.paymentProofs || []).filter(item => item.clientId === client.id);
    const customers = customerRecords(req.data, client);
    const unansweredQuestions = (req.data.unansweredQuestions || []).filter(item => item.clientId === client.id);
    const botTests = (req.data.botTests || []).filter(item => item.clientId === client.id);
    const orderActions = orders
      .filter(order => !['delivered', 'cancelled'].includes(order.status || 'draft'))
      .map(order => ({ type: 'order', id: order.id, customer: order.customerName || order.username || order.phone || 'Telegram customer', product: [order.productCode, order.productName].filter(Boolean).join(' - '), ...orderNextAction(order) }));
    const bookingActions = bookings
      .filter(booking => !['done', 'cancelled'].includes(booking.status || 'requested'))
      .map(booking => ({ type: 'booking', id: booking.id, customer: booking.customerName || booking.username || booking.phone || 'Telegram customer', product: booking.requestedService || 'Service request', ...bookingNextAction(booking) }));
    const nextActions = [...orderActions, ...bookingActions]
      .sort((a, b) => ({ bad: 0, warn: 1, good: 2 }[a.priority] - { bad: 0, warn: 1, good: 2 }[b.priority]))
      .slice(0, 8);
    const clientNotices = (req.data.clientNotices || [])
      .filter(notice => notice.active !== false)
      .filter(notice => !notice.expiresAt || new Date(notice.expiresAt).getTime() >= Date.now())
      .filter(notice => notice.global || (notice.clientIds || []).includes(client.id))
      .filter(notice => notice.type === 'warning' || !(notice.seenBy || []).includes(client.id))
      .slice(-20)
      .reverse();
    res.json({
      client: safeClient(client),
      clientNotices,
      conversations,
      leads,
      files,
      products,
      productPosts,
      productRecommendations,
      productIntents,
      announcementCampaigns,
      campaignRecipients,
      orders: orders.map(order => ({ ...order, nextAction: orderNextAction(order) })),
      stockMovements,
      reminders,
      bookings: bookings.map(booking => ({ ...booking, nextAction: bookingNextAction(booking) })),
      paymentProofs,
      customers,
      unansweredQuestions,
      botTests,
      nextActions,
      botDebug: botDebugForClient(req.data, client),
      goLive: goLiveStatusForClient(req.data, client),
      previewStats: previewStatsForClient(req.data, client),
      readiness: readinessForClient(req.data, client),
      quality: clientQualityScore(req.data, client),
      analytics: clientAnalytics(req.data, client),
      storage: await clientStorageStats(req.data, client),
      quotas
    });
  });

  router.patch('/api/client/notices/:id/seen', requireAuth('client'), async (req, res) => {
    const client = clientFor(req.data, req.user.clientId);
    const notice = (req.data.clientNotices || []).find(item =>
      item.id === req.params.id &&
      item.active !== false &&
      (item.global || (item.clientIds || []).includes(client.id))
    );
    if (notice && notice.type !== 'warning') {
      notice.seenBy = Array.from(new Set([...(Array.isArray(notice.seenBy) ? notice.seenBy : []), client.id]));
      notice.lastSeenAt = now();
      await writeData(req.data);
    }
    res.json({ ok: true });
  });
  
  router.get('/api/client/customers/:id/timeline', requireAuth('client'), (req, res) => {
    const client = clientFor(req.data, req.user.clientId);
    const result = customerTimeline(req.data, client, req.params.id);
    if (!result) return res.status(404).json({ error: 'Customer not found' });
    res.json(result);
  });
  
  router.patch('/api/client/customers/:id/note', requireAuth('client'), requireActiveClient(), async (req, res) => {
    const client = clientFor(req.data, req.user.clientId);
    const customer = customerRecords(req.data, client).find(item => String(item.id) === String(req.params.id));
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    req.data.customerNotes ||= [];
    let record = customerNoteRecord(req.data, client, customer);
    if (!record) {
      record = {
        id: uid('customer_note'),
        clientId: client.id,
        customerId: customer.id,
        telegramUserId: customer.telegramUserId || '',
        telegramChatId: customer.telegramChatId || '',
        username: customer.username || '',
        phone: customer.phone || '',
        name: customer.name || '',
        note: '',
        createdAt: now(),
        updatedAt: now()
      };
      req.data.customerNotes.push(record);
    }
    record.note = String(req.body.note || '').slice(0, 2000);
    record.updatedAt = now();
    addAuditLog(req.data, {
      user: req.user,
      action: 'customer.note_updated',
      clientId: req.user.clientId,
      target: customer.name || customer.username || customer.phone || customer.id,
      details: 'Client updated a private customer note.'
    });
    await writeData(req.data);
    res.json({ note: record });
  });
  
  router.post('/api/client/customers/:id/message', requireAuth('client'), requireActiveClient(), async (req, res) => {
    const client = clientFor(req.data, req.user.clientId);
    const customer = customerRecords(req.data, client).find(item => String(item.id) === String(req.params.id));
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    const text = String(req.body.text || '').trim().slice(0, 1000);
    if (text.length < 2) return res.status(400).json({ error: 'Write a message first.' });
    const conversation = customerConversation(req.data, client, customer);
    const chatId = customer.telegramChatId || conversation?.telegramChatId || '';
    if (!chatId) return res.status(400).json({ error: 'This customer has no Telegram chat ID yet.' });
    await sendCustomerTelegramMessage(client, chatId, text);
    req.data.messages.push({
      id: uid('msg'),
      clientId: req.user.clientId,
      conversationId: conversation?.id || '',
      direction: 'outbound',
      text,
      createdAt: now()
    });
    addAuditLog(req.data, {
      user: req.user,
      action: 'customer.manual_message_sent',
      clientId: req.user.clientId,
      target: customer.name || customer.username || customer.phone || customer.id,
      details: 'Client sent a manual Telegram message from the customer timeline.'
    });
    await writeData(req.data);
    res.json({ ok: true });
  });

  router.post('/api/client/logo', requireAuth('client'), requireActiveClient(), productUpload.single('logo'), async (req, res) => {
    try {
      const client = clientFor(req.data, req.user.clientId);
      if (!client) return res.status(404).json({ error: 'Client not found' });
      if (!req.file) return res.status(400).json({ error: 'Choose a PNG, JPG, or WEBP logo file first.' });
      client.settings ||= defaultSettings();
      const logoUrl = `/uploads/products/${encodeURIComponent(req.user.clientId)}/${encodeURIComponent(path.basename(req.file.path))}`;
      client.settings.businessLogoUrl = logoUrl;
      client.settings.businessLogoUploadedAt = now();
      addAuditLog(req.data, {
        user: req.user,
        action: 'client.logo_uploaded',
        clientId: client.id,
        target: client.businessName,
        details: 'Client uploaded a business logo.'
      });
      await writeData(req.data);
      res.json({ logoUrl, client: safeClient(client) });
    } catch (error) {
      await cleanupUploadedFiles(req.file ? [req.file] : []);
      res.status(500).json({ error: 'Logo upload failed. Please try another image.' });
    }
  });
  
  router.put('/api/client/settings', requireAuth('client'), requireActiveClient(), async (req, res) => {
    const client = clientFor(req.data, req.user.clientId);
    const previousActive = Boolean(client.settings.isActive);
    const previousToken = client.settings.botToken;
    const previousType = client.settings.automationType || 'bot';
    // Partial-update helper: only override a field when it was actually sent in the request body
    const b = req.body;
    const has = key => b[key] !== undefined;
    const s = client.settings;
    const bp = s.businessProfile || {};
    const dl = s.delivery || {};
    const maskedStr = (key, fallback) => {
      if (!has(key)) return fallback;
      return b[key] === 'configured' ? fallback : String(b[key] || '');
    };
    const botTokenIncoming = has('botToken') && b.botToken !== 'configured' && String(b.botToken || '').trim();
    const nextAiProvider = has('aiProvider') ? normalizeProvider(b.aiProvider) : normalizeProvider(s.aiProvider || 'deepseek');
    const legacyProviderKeyField = {
      deepseek: 'deepseekKey',
      gemini: 'geminiKey',
      openai: 'openaiKey',
      grok: 'grokKey',
      anthropic: 'anthropicKey'
    }[nextAiProvider];
    const aiApiKeyInput = has('aiApiKey')
      ? b.aiApiKey
      : (legacyProviderKeyField && has(legacyProviderKeyField) ? b[legacyProviderKeyField] : undefined);
    const nextAiApiKey = aiApiKeyInput === undefined
      ? s.aiApiKey
      : ((aiApiKeyInput === 'configured' || (aiApiKeyInput === '' && s.aiApiKey)) ? s.aiApiKey : String(aiApiKeyInput || ''));
  
    const requestedDeliveryMode = has('deliveryMode') ? String(b.deliveryMode || '') : (dl.mode || 'fixed_addis');
    const nextDeliveryMode = ['fixed_addis', 'location_zones', 'manual', 'distance_later'].includes(requestedDeliveryMode)
      ? requestedDeliveryMode
      : (dl.mode || 'fixed_addis');
    const nextDeliveryZones = has('deliveryZones')
      ? (nextDeliveryMode === 'location_zones' ? normalizeDeliveryZones(b.deliveryZones) : [])
      : (nextDeliveryMode === 'location_zones' ? normalizeDeliveryZones(dl.zones || []) : []);
    const cleanEmail = has('email') ? String(b.email || '').trim().toLowerCase() : '';
    if (has('email') && cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (cleanEmail && (req.data.users || []).some(user => user.id !== req.user.id && String(user.email || '').toLowerCase() === cleanEmail)) {
      return res.status(409).json({ error: 'That email is already used by another account.' });
    }
    client.identity = {
      clientId: client.identity?.clientId || client.id,
      createdAt: client.identity?.createdAt || client.createdAt || now(),
      originalBusinessName: client.identity?.originalBusinessName || client.businessName || '',
      originalOwnerName: client.identity?.originalOwnerName || client.ownerName || '',
      originalPhone: client.identity?.originalPhone || client.phone || '',
      originalEmail: client.identity?.originalEmail || client.email || '',
      changeHistory: Array.isArray(client.identity?.changeHistory) ? client.identity.changeHistory : []
    };
    const identityDraft = {
      businessName: has('businessName') ? String(b.businessName || '').trim().slice(0, 120) : client.businessName,
      ownerName: has('ownerName') ? String(b.ownerName || '').trim().slice(0, 120) : (client.ownerName || ''),
      phone: has('phone') ? String(b.phone || '').trim().slice(0, 40) : (client.phone || ''),
      email: has('email') ? cleanEmail : (client.email || '')
    };
    const identityChanges = ['businessName', 'ownerName', 'phone', 'email']
      .filter(field => has(field) && String(identityDraft[field] || '') !== String(client[field] || ''))
      .map(field => ({ field, from: String(client[field] || ''), to: String(identityDraft[field] || '') }));
    if (identityChanges.length) {
      const confirmPassword = String(b.identityConfirmPassword || '');
      const confirmCode = String(b.identityConfirmCode || '').trim();
      let identityConfirmed = false;
      if (confirmPassword && passwordMatchesUser(confirmPassword, req.user)) {
        identityConfirmed = true;
      } else if (confirmCode) {
        const pending = req.user.pendingIdentityConfirmation || null;
        if (!pending?.codeHash) {
          return res.status(400).json({ error: 'No business profile confirmation code is waiting. Request a new code.' });
        }
        if (new Date(pending.expiresAt || 0).getTime() < Date.now()) {
          delete req.user.pendingIdentityConfirmation;
          await writeData(req.data);
          return res.status(400).json({ error: 'The business profile confirmation code has expired. Request a new code.' });
        }
        if ((Number(pending.attempts || 0)) >= passwordCodeMaxAttempts) {
          delete req.user.pendingIdentityConfirmation;
          await writeData(req.data);
          return res.status(429).json({ error: 'Too many wrong code attempts. Request a new business profile code.' });
        }
        if (!/^\d{6}$/.test(confirmCode) || !verifyPassword(confirmCode, pending.codeHash)) {
          pending.attempts = Number(pending.attempts || 0) + 1;
          await writeData(req.data);
          return res.status(400).json({ error: 'Wrong confirmation code. Please check the Telegram message and try again.' });
        }
        delete req.user.pendingIdentityConfirmation;
        identityConfirmed = true;
      }
      if (!identityConfirmed) {
        return res.status(confirmPassword ? 403 : 400).json({
          error: confirmPassword
            ? 'Wrong password. Please try again or request a Telegram confirmation code.'
            : 'Enter your account password or request a Telegram confirmation code to save business name, owner, phone, or email changes.',
          canRequestIdentityCode: true
        });
      }
      const since30 = Date.now() - 30 * 86400000;
      for (const change of identityChanges) {
        const recentCount = client.identity.changeHistory.filter(item =>
          item.field === change.field &&
          new Date(item.changedAt || 0).getTime() >= since30
        ).length;
        if (recentCount >= identityChangeLimit(change.field)) {
          return res.status(429).json({ error: `${change.field} can only be changed ${identityChangeLimit(change.field)} times per 30 days. Please contact admin if this is urgent.` });
        }
      }
    }

    const incomingRetailType = has('retailType')
      ? String(b.retailType || '').trim()
      : (has('businessType') && !normalizeBusinessType(b.businessType) ? String(b.businessType || '').trim() : (bp.retailType || ''));
    const categoryResetRequested = Boolean(b.replaceCategoriesWithDefaults);
    const resetTemplates = categoryResetRequested
      ? cloneRetailTemplateCategories(incomingRetailType || b.businessType || bp.retailType || 'retail')
      : null;
    const nextCategories = resetTemplates
      ? resetTemplates.map(category => category.name).filter(Boolean)
      : (Array.isArray(b.categories) ? b.categories : (s.categories || []));
    const nextCategoryTemplates = resetTemplates
      ? resetTemplates
      : (Array.isArray(b.categoryTemplates)
        ? b.categoryTemplates
        : (Array.isArray(b.categories) ? syncCategoryTemplates(b.categories, s.categoryTemplates || []) : (s.categoryTemplates || [])));
    const previousRetailType = String(bp.retailType || s.retailType || '').trim();

    const nextSettings = {
      ...s,
      botName: has('botName') ? String(b.botName || s.botName) : s.botName,
      automationType: has('automationType') ? (b.automationType === 'account' ? 'account' : 'bot') : (s.automationType || 'bot'),
      botToken: maskedStr('botToken', s.botToken),
      accountApiId: has('accountApiId') ? String(b.accountApiId || '') : (s.accountApiId || ''),
      accountApiHash: maskedStr('accountApiHash', s.accountApiHash),
      accountPhone: has('accountPhone') ? String(b.accountPhone || '') : (s.accountPhone || ''),
      accountSessionStatus: has('automationType') ? (b.automationType === 'account' ? (s.accountSessionStatus || 'not_connected') : 'not_connected') : s.accountSessionStatus,
      isActive: has('isActive') ? Boolean(b.isActive) : (botTokenIncoming ? true : s.isActive),
      botLastError: botTokenIncoming ? '' : (s.botLastError || ''),
      botLastErrorAt: botTokenIncoming ? '' : (s.botLastErrorAt || ''),
      replyDelayMinutes: has('replyDelayMinutes') ? Math.min(60, Math.max(0, Number(b.replyDelayMinutes || 0))) : s.replyDelayMinutes,
      tone: has('tone') ? String(b.tone || s.tone).slice(0, 500) : s.tone,
      historyLimit: has('historyLimit') ? Math.min(50, Math.max(2, Number(b.historyLimit || 12))) : s.historyLimit,
      hotLeadNotifyChatId: has('hotLeadNotifyChatId')
        ? (/^\d{5,20}$/.test(String(b.hotLeadNotifyChatId || '').trim()) ? String(b.hotLeadNotifyChatId || '').trim() : '')
        : (s.hotLeadNotifyChatId || ''),
      notificationPrefs: {
        ...defaultSettings().notificationPrefs,
        ...(s.notificationPrefs || {}),
        ...(has('notifyHotLeads') ? { hotLeads: Boolean(b.notifyHotLeads) } : {}),
        ...(has('notifyUnanswered') ? { unanswered: Boolean(b.notifyUnanswered) } : {}),
        ...(has('notifyRenewals') ? { renewals: Boolean(b.notifyRenewals) } : {}),
        ...(has('notifyAiUsage') ? { aiUsage: Boolean(b.notifyAiUsage) } : {}),
        ...(has('notifyDraftOrders') ? { draftOrders: Boolean(b.notifyDraftOrders) } : {}),
        ...(has('notifyLowStock') ? { lowStock: Boolean(b.notifyLowStock) } : {})
      },
      followUpsEnabled: has('followUpsEnabled') ? Boolean(b.followUpsEnabled) : s.followUpsEnabled,
      followUpDelayHours: has('followUpDelayHours') ? Math.min(168, Math.max(1, Number(b.followUpDelayHours || 24))) : s.followUpDelayHours,
      maxFollowUps: has('maxFollowUps') ? Math.min(3, Math.max(1, Number(b.maxFollowUps || 1))) : s.maxFollowUps,
      followUpMessage: has('followUpMessage') ? String(b.followUpMessage || defaultSettings().followUpMessage).slice(0, 900) : s.followUpMessage,
      followUpsStartedAt: (has('followUpsEnabled') && Boolean(b.followUpsEnabled) && !s.followUpsEnabled) ? now() : (s.followUpsStartedAt || ''),
      city: has('city') ? String(b.city || '') : (s.city || ''),
      businessLogoUrl: has('businessLogoUrl') ? String(b.businessLogoUrl || '') : (s.businessLogoUrl || ''),
      watermarkName: has('watermarkName') ? String(b.watermarkName || '') : (s.watermarkName || ''),
      watermarkPhone: has('watermarkPhone') ? String(b.watermarkPhone || '') : (s.watermarkPhone || ''),
      telegramChannelLink: has('telegramChannelLink') ? String(b.telegramChannelLink || '') : (s.telegramChannelLink || ''),
      businessWebsite: has('businessWebsite') ? String(b.businessWebsite || '') : (s.businessWebsite || ''),
      businessSocialMedia: has('businessSocialMedia') ? String(b.businessSocialMedia || '') : (s.businessSocialMedia || ''),
      businessBranches: has('businessBranches') ? normalizeBranchLocations(b.businessBranches) : (Array.isArray(s.businessBranches) ? s.businessBranches : normalizeBranchLocations(s.businessBranches || '')),
      categories: nextCategories,
      categoryTemplates: nextCategoryTemplates,
      botUsername: has('botUsername') ? String(b.botUsername || s.botUsername || '') : (s.botUsername || ''),
      telegramOwnerChatId: has('telegramOwnerChatId') ? String(b.telegramOwnerChatId || s.telegramOwnerChatId || '') : (s.telegramOwnerChatId || ''),
      aiMonthlyReplyLimit: has('aiMonthlyReplyLimit') ? Math.min(100000, Math.max(0, Number(b.aiMonthlyReplyLimit || 1000))) : s.aiMonthlyReplyLimit,
      aiRepliesThisMonth: has('aiRepliesThisMonth') ? Number(b.aiRepliesThisMonth || 0) : s.aiRepliesThisMonth,
      aiKeyMode: has('aiKeyMode') ? (b.aiKeyMode === 'admin' && s.adminAiApiKey ? 'admin' : 'client') : s.aiKeyMode,
      aiProvider: nextAiProvider,
      aiApiKey: nextAiApiKey,
      // Legacy per-provider client keys are read-only migration fallback now.
      deepseekKey: s.deepseekKey || '',
      geminiKey: s.geminiKey || '',
      openaiKey: s.openaiKey || '',
      grokKey: s.grokKey || '',
      anthropicKey: s.anthropicKey || '',
      visionProvider: has('visionProvider') ? (['gemini', 'openai', 'claude'].includes(b.visionProvider) ? b.visionProvider : s.visionProvider) : s.visionProvider,
      visionApiKey: maskedStr('visionApiKey', s.visionApiKey),
      voiceProvider: has('voiceProvider') ? (['gemini', 'openai'].includes(b.voiceProvider) ? b.voiceProvider : s.voiceProvider) : s.voiceProvider,
      voiceApiKey: maskedStr('voiceApiKey', s.voiceApiKey),
      strictKnowledgeMode: has('strictKnowledgeMode') ? b.strictKnowledgeMode !== false : s.strictKnowledgeMode,
      businessProfile: {
        ...bp,
        businessType: has('businessType') ? (normalizeBusinessType(b.businessType) || 'retail') : (bp.businessType || 'retail'),
        retailType: incomingRetailType || bp.retailType || '',
        ownerName: has('ownerName') ? String(identityDraft.ownerName || '') : (bp.ownerName || client.ownerName || ''),
        summary: has('businessSummary') ? String(b.businessSummary || '') : bp.summary,
        firstTimeWelcomeMessage: has('businessFirstTimeWelcome') ? limitWords(b.businessFirstTimeWelcome, 160) : (bp.firstTimeWelcomeMessage || ''),
        referenceKnowledge: has('businessReferenceKnowledge') ? limitWords(b.businessReferenceKnowledge, 1000) : (bp.referenceKnowledge || ''),
        services: has('businessServices') ? String(b.businessServices || '') : bp.services,
        products: has('businessProducts') ? String(b.businessProducts || '') : bp.products,
        pricing: has('businessPricing') ? String(b.businessPricing || '') : bp.pricing,
        timeline: has('businessTimeline') ? String(b.businessTimeline || '') : bp.timeline,
        contact: has('businessContact') ? String(b.businessContact || '') : bp.contact,
        address: has('businessAddress') ? String(b.businessAddress || '') : bp.address,
        delivery: has('businessDelivery') ? String(b.businessDelivery || '') : bp.delivery,
        paymentInstructions: has('businessPaymentInstructions') ? String(b.businessPaymentInstructions || '') : bp.paymentInstructions,
        policies: has('businessPolicies') ? String(b.businessPolicies || '') : bp.policies,
        faq: has('businessFaq') ? String(b.businessFaq || '') : bp.faq,
        mustSay: has('businessMustSay') ? String(b.businessMustSay || '') : bp.mustSay,
        neverSay: has('businessNeverSay') ? String(b.businessNeverSay || '') : bp.neverSay
      },
      delivery: {
        ...defaultSettings().delivery,
        ...dl,
        mode: nextDeliveryMode,
        addis_delivery_fee: has('addisDeliveryFee') ? Math.max(0, Math.min(99999, Number(b.addisDeliveryFee || 300))) : (dl.addis_delivery_fee ?? 300),
        outside_addis_behavior: has('outsideAddisBehavior') ? (b.outsideAddisBehavior === 'reject' ? 'reject' : 'manual_confirmation') : (dl.outside_addis_behavior || 'manual_confirmation'),
        shop_address: has('shopAddress') ? String(b.shopAddress || '') : (dl.shop_address || ''),
        shop_latitude: has('shopLatitude') ? (Number(b.shopLatitude) || null) : (dl.shop_latitude || null),
        shop_longitude: has('shopLongitude') ? (Number(b.shopLongitude) || null) : (dl.shop_longitude || null),
        zones: nextDeliveryZones
      },
      discounts: has('discounts') ? normalizeDiscountSettings(b.discounts) : normalizeDiscountSettings(s.discounts || defaultSettings().discounts),
      paymentOptions: has('paymentOptions') ? normalizePaymentOptions(b.paymentOptions) : normalizePaymentOptions(s.paymentOptions || []),
      paymentVerificationMode: has('paymentVerificationMode')
        ? (String(b.paymentVerificationMode || '').toLowerCase() === 'automatic' ? 'automatic' : 'manual')
        : (String(s.paymentVerificationMode || s.paymentVerification?.mode || 'manual').toLowerCase() === 'automatic' ? 'automatic' : 'manual')
    };
    if (botTokenIncoming) {
      try {
        const botInfo = await validateTelegramBotToken(nextSettings.botToken);
        if (botInfo?.username && !String(nextSettings.botUsername || '').trim()) {
          nextSettings.botUsername = `@${botInfo.username}`;
        }
      } catch (error) {
        return res.status(400).json({ error: telegramBotTokenError(error) });
      }
    }
    if (has('businessName')) client.businessName = identityDraft.businessName || client.businessName;
    if (has('ownerName')) {
      const ownerName = identityDraft.ownerName;
      client.ownerName = ownerName || client.ownerName || '';
      const user = (req.data.users || []).find(item => item.id === req.user.id);
      if (user) user.name = ownerName || user.name;
      if (req.user) req.user.name = ownerName || req.user.name;
    }
    if (has('phone')) {
      const phone = identityDraft.phone;
      client.phone = phone;
      const user = (req.data.users || []).find(item => item.id === req.user.id);
      if (user) user.phone = phone;
      if (req.user) req.user.phone = phone;
    }
    if (has('email')) {
      client.email = identityDraft.email;
      const user = (req.data.users || []).find(item => item.id === req.user.id);
      if (user) user.email = identityDraft.email;
      if (req.user) req.user.email = identityDraft.email;
    }
    if (identityChanges.length) {
      const changedAt = now();
      const entries = identityChanges.map(change => ({
        ...change,
        changedAt,
        changedByUserId: req.user.id || '',
        changedByEmail: req.user.email || ''
      }));
      client.identity.changeHistory.push(...entries);
      client.identity.changeHistory = client.identity.changeHistory.slice(-100);
      addAuditLog(req.data, {
        user: req.user,
        action: 'client.identity.updated',
        clientId: client.id,
        target: client.identity.clientId,
        details: entries.map(item => `${item.field}: "${item.from}" -> "${item.to}"`).join('; ')
      });
      const renewalDays = daysUntilRenewal(client.billing || {});
      const nearRenewal = renewalDays !== null && renewalDays <= 7;
      const overdue = renewalDays !== null && renewalDays < 0;
      if (nearRenewal || overdue || client.billing?.status === 'overdue') {
        await sendAdminAlert(req.data, `identity-change-${client.id}-${changedAt.slice(0, 10)}`, [
          `Client identity changed ${overdue ? 'while overdue' : 'near renewal'}.`,
          `Billing identity: ${client.identity.clientId}`,
          `Current business: ${client.businessName}`,
          client.billing?.renewalDate ? `Renewal date: ${client.billing.renewalDate}` : '',
          entries.map(item => `${item.field}: ${item.from || '(empty)'} -> ${item.to || '(empty)'}`).join('\n')
        ].filter(Boolean).join('\n'), 0);
      }
    }
    const nextRetailType = String(nextSettings.businessProfile?.retailType || '').trim();
    if ((has('businessType') || has('retailType')) && nextRetailType && nextRetailType !== previousRetailType) {
      addAuditLog(req.data, {
        user: req.user,
        action: 'client.retail_type_changed',
        clientId: client.id,
        target: client.businessName,
        details: `Retail type changed from ${previousRetailType || '(empty)'} to ${nextRetailType}.`
      });
      await sendAdminAlert(req.data, `retail-type-change-${client.id}-${now().slice(0, 10)}`, [
        `Client changed retail category: ${client.businessName}`,
        `From: ${previousRetailType || '(empty)'}`,
        `To: ${nextRetailType}`,
        categoryResetRequested ? 'Category templates were replaced with the selected retail type defaults.' : 'Existing product categories were kept.'
      ].join('\n'), 0).catch(() => null);
    }
    client.settings = nextSettings;
    addAuditLog(req.data, {
      user: req.user,
      action: 'settings.updated',
      clientId: client.id,
      target: client.businessName,
      details: `Settings saved. Automation ${nextSettings.isActive ? 'active' : 'paused'}, AI mode ${nextSettings.aiKeyMode}, AI provider ${effectiveAi(nextSettings).provider}.`
    });
    await writeData(req.data);
    const shouldRestart = previousActive !== nextSettings.isActive ||
      previousToken !== nextSettings.botToken ||
      previousType !== nextSettings.automationType;
    if (shouldRestart) {
      if (serviceAllowsAutomation(client)) {
        startBot(client).catch(error => console.error(`Bot restart failed for ${client.businessName}:`, error.message));
      } else {
        await stopBot(client.id);
      }
    }
    res.json({ client: safeClient(client) });
  });
  
  router.post('/api/client/request-approval', requireAuth('client'), async (req, res) => {
    const client = clientFor(req.data, req.user.clientId);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    const goLive = goLiveStatusForClient(req.data, client);
    client.approvalRequestedAt = now();
    client.approvalRequestNote = String(req.body.note || '').slice(0, 500);
    addAuditLog(req.data, {
      user: req.user,
      action: 'client.approval_requested',
      clientId: client.id,
      target: client.businessName,
      details: `Client requested admin approval. ${goLive.blockers.length ? `Blockers: ${goLive.blockers.join(', ')}` : 'No major blockers.'}`
    });
    await sendAdminAlert(req.data, `approval-request-${client.id}`, [
      `Approval requested: ${client.businessName}`,
      `Setup: ${goLive.label}`,
      goLive.blockers.length ? `Blockers: ${goLive.blockers.join(', ')}` : 'No major blockers listed.',
      client.approvalRequestNote ? `Note: ${client.approvalRequestNote}` : ''
    ].filter(Boolean).join('\n'), 0).catch(() => null);
    await writeData(req.data);
    res.json({ ok: true, goLive });
  });
  
  router.post('/api/client/account/send-code', requireAuth('client'), requireActiveClient(), async (req, res) => {
    const client = clientFor(req.data, req.user.clientId);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    const apiId = Number(req.body.accountApiId || client.settings.accountApiId);
    const apiHash = req.body.accountApiHash === 'configured'
      ? client.settings.accountApiHash
      : String(req.body.accountApiHash || client.settings.accountApiHash || '');
    const phone = String(req.body.accountPhone || client.settings.accountPhone || '').trim();
    if (!apiId || !apiHash || !phone) return res.status(400).json({ error: 'API ID, API hash, and phone number are required before sending the login code.' });
    try {
      const { TelegramClient, StringSession } = await loadGramJs();
      const session = new StringSession(client.settings.accountSessionString || '');
      const telegram = new TelegramClient(session, apiId, apiHash, { connectionRetries: 5 });
      await telegram.connect();
      const result = await telegram.sendCode({ apiId, apiHash }, phone);
      client.settings.accountApiId = String(apiId);
      client.settings.accountApiHash = apiHash;
      client.settings.accountPhone = phone;
      client.settings.accountPhoneCodeHash = result.phoneCodeHash;
      client.settings.accountSessionStatus = 'code_sent';
      client.settings.accountLastCodeRequestAt = now();
      client.settings.accountSessionString = session.save();
      await telegram.disconnect();
      addAuditLog(req.data, {
        user: req.user,
        action: 'account.code_requested',
        clientId: client.id,
        target: client.businessName,
        details: 'Client requested a dedicated account Telegram verification code.'
      });
      await writeData(req.data);
      res.json({ client: safeClient(client), isCodeViaApp: Boolean(result.isCodeViaApp) });
    } catch (error) {
      client.settings.accountSessionStatus = 'code_failed';
      client.settings.accountLastError = error.message;
      await writeData(req.data);
      res.status(400).json({ error: `Telegram could not send the code: ${error.message}` });
    }
  });
  
  router.post('/api/client/account/connect', requireAuth('client'), requireActiveClient(), async (req, res) => {
    const client = clientFor(req.data, req.user.clientId);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    const apiId = Number(req.body.accountApiId || client.settings.accountApiId);
    const apiHash = req.body.accountApiHash === 'configured'
      ? client.settings.accountApiHash
      : String(req.body.accountApiHash || client.settings.accountApiHash || '');
    const phone = String(req.body.accountPhone || client.settings.accountPhone || '').trim();
    const code = String(req.body.accountVerificationCode || '').replace(/\s+/g, '');
    const password = String(req.body.accountPassword || '');
    const phoneCodeHash = client.settings.accountPhoneCodeHash;
    if (!apiId || !apiHash || !phone) return res.status(400).json({ error: 'API ID, API hash, and phone number are required.' });
    if (!phoneCodeHash) return res.status(400).json({ error: 'Press Send code first, then paste the Telegram verification code.' });
    if (!code) return res.status(400).json({ error: 'Paste the Telegram verification code before connecting.' });
    try {
      const { Api, TelegramClient, StringSession } = await loadGramJs();
      const session = new StringSession(client.settings.accountSessionString || '');
      const telegram = new TelegramClient(session, apiId, apiHash, { connectionRetries: 5 });
      await telegram.connect();
      try {
        await telegram.invoke(new Api.auth.SignIn({
          phoneNumber: phone,
          phoneCodeHash,
          phoneCode: code
        }));
      } catch (signInError) {
        if (signInError.errorMessage === 'SESSION_PASSWORD_NEEDED' || /PASSWORD/i.test(signInError.message || '')) {
          if (!password) {
            await telegram.disconnect();
            client.settings.accountSessionStatus = 'password_required';
            client.settings.accountLastConnectAttemptAt = now();
            await writeData(req.data);
            return res.status(400).json({ error: 'This Telegram account has two-step verification. Enter the Telegram cloud password and press Connect account again.' });
          }
          await telegram.signInWithPassword({ apiId, apiHash }, {
            password: async () => password,
            onError: () => true
          });
        } else {
          throw signInError;
        }
      }
      const me = await telegram.getMe();
      client.settings.accountApiId = String(apiId);
      client.settings.accountApiHash = apiHash;
      client.settings.accountPhone = phone;
      client.settings.accountSessionString = session.save();
      client.settings.accountPhoneCodeHash = '';
      client.settings.accountSessionStatus = 'connected';
      client.settings.accountLastConnectAttemptAt = now();
      client.settings.accountUserId = me?.id ? String(me.id) : '';
      client.settings.accountUsername = me?.username ? `@${me.username}` : '';
      await telegram.disconnect();
      addAuditLog(req.data, {
        user: req.user,
        action: 'account.connected',
        clientId: client.id,
        target: client.businessName,
        details: `Dedicated Telegram account connected${client.settings.accountUsername ? ` as ${client.settings.accountUsername}` : ''}.`
      });
      await writeData(req.data);
      startBot(client).catch(error => console.error(`Account automation start failed for ${client.businessName}:`, error.message));
      res.json({ client: safeClient(client) });
    } catch (error) {
      client.settings.accountSessionStatus = 'connect_failed';
      client.settings.accountLastError = error.message;
      await writeData(req.data);
      res.status(400).json({ error: `Telegram account connection failed: ${error.message}` });
    }
  });
  
  router.post('/api/client/account/disconnect', requireAuth('client'), requireActiveClient(), async (req, res) => {
    const client = clientFor(req.data, req.user.clientId);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    await stopBot(client.id);
    client.settings.accountSessionStatus = 'not_connected';
    client.settings.accountSessionString = '';
    client.settings.accountPhoneCodeHash = '';
    client.settings.accountLastDisconnectAt = now();
    addAuditLog(req.data, {
      user: req.user,
      action: 'account.disconnected',
      clientId: client.id,
      target: client.businessName,
      details: 'Client reset dedicated account session status.'
    });
    await writeData(req.data);
    res.json({ client: safeClient(client) });
  });
  
  router.post('/api/client/bot/restart', requireAuth('client'), requireActiveClient(), async (req, res) => {
    const client = clientFor(req.data, req.user.clientId);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (!client.settings?.botToken) return res.status(400).json({ error: 'Telegram bot token is missing.' });
    try {
      await validateTelegramBotToken(client.settings.botToken);
    } catch (error) {
      client.settings.isActive = false;
      client.settings.botLastError = telegramBotTokenError(error);
      client.settings.botLastErrorAt = now();
      await writeData(req.data);
      return res.status(400).json({ error: client.settings.botLastError });
    }
    client.settings.isActive = true;
    client.settings.botLastError = '';
    client.settings.botLastErrorAt = '';
    await writeData(req.data);
    await stopBot(client.id);
    await startBot(client);
    const debug = botDebugForClient(await readData(), client);
    res.json({ ok: true, debug });
  });
  
  
  // Bot health status endpoint (for dashboard Bot tab)
  router.get('/api/client/bot/status', requireAuth('client'), async (req, res) => {
    const client = clientFor(req.data, req.user.clientId);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    const debug = botDebugForClient(req.data, client);
    res.json({
      tokenConfigured: Boolean(client.settings?.botToken),
      automationActive: Boolean(client.settings?.isActive),
      runnerActive: debug.runnerActive,
      blockReason: debug.blockReason,
      canRun: debug.canRun,
      activity: debug.activity,
      recentErrors: debug.recentErrors,
      lastCheckedAt: debug.lastCheckedAt,
      status: client.status,
      businessName: client.businessName
    });
  });
  
  router.post('/api/client/bot/clear-webhook', requireAuth('client'), requireActiveClient(), async (req, res) => {
    const client = clientFor(req.data, req.user.clientId);
    if (!client?.settings?.botToken) return res.status(400).json({ error: 'Telegram bot token is missing.' });
    const bot = new Telegraf(client.settings.botToken);
    await bot.telegram.deleteWebhook({ drop_pending_updates: true });
    addAuditLog(req.data, {
      user: req.user,
      action: 'bot.webhook_cleared',
      clientId: client.id,
      target: client.businessName,
      details: 'Client cleared Telegram webhook and dropped pending updates.'
    });
    await writeData(req.data);
    res.json({ ok: true });
  });
  
  router.post('/api/client/bot/test-connection', requireAuth('client'), requireActiveClient(), async (req, res) => {
    const client = clientFor(req.data, req.user.clientId);
    if (!client?.settings?.botToken) return res.status(400).json({ error: 'Telegram bot token is missing.' });
    try {
      const me = await validateTelegramBotToken(client.settings.botToken);
      res.json({ ok: true, bot: { id: me.id, username: me.username, firstName: me.first_name } });
    } catch (error) {
      res.status(400).json({ error: telegramBotTokenError(error) });
    }
  });
  
  router.post('/api/client/bot-tests', requireAuth('client'), requireActiveClient(), async (req, res) => {
    const question = String(req.body.question || '').trim();
    const expected = String(req.body.expected || '').trim();
    if (!question) return res.status(400).json({ error: 'Test question is required.' });
    const tests = req.data.botTests.filter(test => test.clientId === req.user.clientId);
    if (tests.length >= 25) return res.status(400).json({ error: 'Each client can save up to 25 bot tests.' });
    const test = {
      id: uid('test'),
      clientId: req.user.clientId,
      question: question.slice(0, 700),
      expected: expected.slice(0, 700),
      status: 'not-run',
      lastAnswer: '',
      lastRunAt: '',
      createdAt: now()
    };
    req.data.botTests.push(test);
    addAuditLog(req.data, {
      user: req.user,
      action: 'bot-test.created',
      clientId: req.user.clientId,
      target: test.question,
      details: 'Client added a saved bot test.'
    });
    await writeData(req.data);
    res.json({ test });
  });
  
  router.post('/api/client/bot-tests/:id/run', requireAuth('client'), requireActiveClient(), async (req, res) => {
    const client = clientFor(req.data, req.user.clientId);
    const test = (req.data.botTests || []).find(item => item.id === req.params.id && item.clientId === client.id);
    if (!test) return res.status(404).json({ error: 'Bot test not found.' });
    const conversation = {
      id: `test_${test.id}`,
      clientId: client.id,
      telegramChatId: `test_${test.id}`,
      leadScore: 0
    };
    const answer = await buildReply(req.data, client, conversation, test.question);
    test.lastAnswer = answer;
    test.lastRunAt = now();
    test.status = isMissingKnowledgeReply(answer) ? 'failed' : 'passed';
    test.statusDetail = test.status === 'failed'
      ? 'The bot said it does not have enough approved knowledge to answer this.'
      : 'The bot returned an answer. Review the answer for accuracy before going live.';
    if (test.expected) {
      const expectedWords = String(test.expected).toLowerCase().split(/\s+/).filter(word => word.length >= 4).slice(0, 12);
      const answerLower = String(answer).toLowerCase();
      const matches = expectedWords.filter(word => answerLower.includes(word)).length;
      if (expectedWords.length && matches < Math.min(3, expectedWords.length)) {
        test.status = 'review';
        test.statusDetail = `Only ${matches} expected keyword(s) appeared in the answer. Add more knowledge or edit the expected notes if needed.`;
      } else if (expectedWords.length) {
        test.statusDetail = `Matched ${matches} expected keyword(s). Still review the wording for safety.`;
      }
    }
    test.updatedAt = now();
    await writeData(req.data);
    res.json({ test });
  });
  
  router.post('/api/client/bot-tests/:id/add-unanswered', requireAuth('client'), requireActiveClient(), async (req, res) => {
    const client = clientFor(req.data, req.user.clientId);
    const test = (req.data.botTests || []).find(item => item.id === req.params.id && item.clientId === client.id);
    if (!test) return res.status(404).json({ error: 'Bot test not found.' });
    req.data.unansweredQuestions ||= [];
    let question = req.data.unansweredQuestions.find(item =>
      item.clientId === client.id &&
      item.status !== 'resolved' &&
      item.question.toLowerCase() === test.question.toLowerCase()
    );
    if (!question) {
      question = {
        id: uid('unanswered'),
        clientId: client.id,
        conversationId: '',
        question: test.question,
        suggestedTopic: missingTopic(test.question),
        status: 'open',
        count: 1,
        customerName: 'Bot test suite',
        username: '',
        telegramChatId: '',
        createdAt: now(),
        lastAskedAt: now()
      };
      req.data.unansweredQuestions.push(question);
    }
    question.approvedAnswer = test.expected || question.approvedAnswer || '';
    question.testAnswer = test.lastAnswer || '';
    question.updatedAt = now();
    addAuditLog(req.data, {
      user: req.user,
      action: 'bot-test.sent-to-unanswered',
      clientId: client.id,
      target: test.question,
      details: 'Client copied a bot test into unanswered questions for knowledge repair.'
    });
    await writeData(req.data);
    res.json({ question });
  });
  
  router.delete('/api/client/bot-tests/:id', requireAuth('client'), requireActiveClient(), async (req, res) => {
    const test = (req.data.botTests || []).find(item => item.id === req.params.id && item.clientId === req.user.clientId);
    if (!test) return res.status(404).json({ error: 'Bot test not found.' });
    req.data.botTests = (req.data.botTests || []).filter(item => item.id !== test.id);
    addAuditLog(req.data, {
      user: req.user,
      action: 'bot-test.deleted',
      clientId: req.user.clientId,
      target: test.question,
      details: 'Client deleted a saved bot test.'
    });
    await writeData(req.data);
    res.json({ ok: true });
  });
  
  router.post('/api/client/knowledge', requireAuth('client'), requireActiveClient(), upload.array('files', 10), async (req, res) => {
    const client = clientFor(req.data, req.user.clientId);
    if (isProductBusiness(client)) {
      await cleanupUploadedFiles(req.files || []);
      return res.status(400).json({ error: 'Product-selling workspaces use the structured settings and product catalog instead of document uploads. Switch this client to Service business if you need PDF/Word service knowledge.' });
    }
    const existingFiles = req.data.knowledgeFiles.filter(file => file.clientId === req.user.clientId);
    const incomingFiles = req.files || [];
    const currentUploadBytes = await directorySize(path.join(uploadDir, req.user.clientId));
    const incomingBytes = incomingFiles.reduce((sum, file) => sum + (file.size || 0), 0);
    const existingUploadBytes = Math.max(0, currentUploadBytes - incomingBytes);
    if (existingFiles.length + incomingFiles.length > quotas.maxKnowledgeFilesPerClient) {
      await cleanupUploadedFiles(incomingFiles);
      return res.status(400).json({ error: `Knowledge file limit reached. Each client can upload up to ${quotas.maxKnowledgeFilesPerClient} files.` });
    }
    if (existingUploadBytes + incomingBytes > quotas.maxKnowledgeStorageMbPerClient * MB) {
      await cleanupUploadedFiles(incomingFiles);
      return res.status(400).json({ error: `Knowledge storage limit reached. Each client can use up to ${quotas.maxKnowledgeStorageMbPerClient} MB for knowledge uploads.` });
    }
    const saved = [];
    for (const file of incomingFiles) {
      const extractedText = await extractText(file);
      const record = {
        id: uid('file'),
        clientId: req.user.clientId,
        originalName: file.originalname,
        path: file.path,
        mimeType: file.mimetype,
        size: file.size,
        extractedText,
        isActive: true,
        createdAt: now()
      };
      req.data.knowledgeFiles.push(record);
      saved.push({ ...record, extractedText: extractedText.slice(0, 280) });
    }
    if (saved.length) {
      addAuditLog(req.data, {
        user: req.user,
        action: 'knowledge.uploaded',
        clientId: req.user.clientId,
        target: `${saved.length} file(s)`,
        details: saved.map(file => file.originalName).join(', ')
      });
    }
    await writeData(req.data);
    res.json({ files: saved });
  });
  
  router.patch('/api/client/knowledge/:id', requireAuth('client'), requireActiveClient(), async (req, res) => {
    const file = req.data.knowledgeFiles.find(item => item.id === req.params.id && item.clientId === req.user.clientId);
    if (!file) return res.status(404).json({ error: 'Knowledge file not found' });
    file.isActive = Boolean(req.body.isActive);
    addAuditLog(req.data, {
      user: req.user,
      action: file.isActive ? 'knowledge.enabled' : 'knowledge.paused',
      clientId: req.user.clientId,
      target: file.originalName,
      details: `Knowledge file ${file.isActive ? 'enabled' : 'paused'}.`
    });
    await writeData(req.data);
    res.json({ file });
  });
  
  router.get('/api/client/knowledge/:id/preview', requireAuth('client'), (req, res) => {
    const file = req.data.knowledgeFiles.find(item => item.id === req.params.id && item.clientId === req.user.clientId);
    if (!file) return res.status(404).json({ error: 'Knowledge file not found' });
    res.json({
      file: {
        id: file.id,
        originalName: file.originalName,
        mimeType: file.mimeType,
        size: file.size,
        isActive: file.isActive,
        createdAt: file.createdAt,
        extractedText: file.extractedText || ''
      }
    });
  });
  
  router.delete('/api/client/knowledge/:id', requireAuth('client'), requireActiveClient(), async (req, res) => {
    const file = req.data.knowledgeFiles.find(item => item.id === req.params.id && item.clientId === req.user.clientId);
    if (!file) return res.status(404).json({ error: 'Knowledge file not found' });
    req.data.knowledgeFiles = req.data.knowledgeFiles.filter(item => item.id !== file.id);
    await fs.unlink(file.path).catch(() => null);
    addAuditLog(req.data, {
      user: req.user,
      action: 'knowledge.deleted',
      clientId: req.user.clientId,
      target: file.originalName,
      details: 'Client deleted a knowledge file.'
    });
    await writeData(req.data);
    res.json({ ok: true });
  });
  
  router.get('/api/client/products/:id/image', requireAuth('client'), (req, res) => {
    const product = (req.data.products || []).find(item => item.id === req.params.id && item.clientId === req.user.clientId);
    const imagePath = productPublicImagePath(product);
    if (!imagePath) return res.status(404).send('Image not found');
    res.sendFile(path.resolve(imagePath));
  });
  
  router.put('/api/client/product-posting/settings', requireAuth('client'), requireActiveClient(), requireProductBusiness, async (req, res) => {
    const client = clientFor(req.data, req.user.clientId);
    const next = {
      ...productPostingSettings(client.settings),
      destination: String(req.body.destination || '').trim().slice(0, 120),
      autoPostEnabled: Boolean(req.body.autoPostEnabled),
      autoPostWarningAccepted: Boolean(req.body.autoPostWarningAccepted),
      language: ['english', 'amharic', 'mixed'].includes(req.body.language) ? req.body.language : 'mixed',
      style: ['friendly-sales', 'luxury', 'simple', 'urgent'].includes(req.body.style) ? req.body.style : 'friendly-sales',
      includePrice: Boolean(req.body.includePrice),
      includeSizesColors: Boolean(req.body.includeSizesColors),
      includeMaterial: Boolean(req.body.includeMaterial),
      includeAvailability: Boolean(req.body.includeAvailability),
      includeHashtags: Boolean(req.body.includeHashtags),
      includeOrderInstruction: Boolean(req.body.includeOrderInstruction)
    };
    if (next.autoPostEnabled && !next.autoPostWarningAccepted) {
      return res.status(400).json({ error: 'Accept the auto-post warning before turning on automatic posting.' });
    }
    client.settings.productPosting = next;
    addAuditLog(req.data, {
      user: req.user,
      action: 'product-posting.settings_updated',
      clientId: client.id,
      target: next.destination || 'No destination',
      details: `Product posting ${next.autoPostEnabled ? 'auto-post enabled' : 'manual review mode'}.`
    });
    await writeData(req.data);
    res.json({ settings: productPostingSettings(client.settings), client: safeClient(client) });
  });
  
  router.post('/api/client/product-posting/test', requireAuth('client'), requireActiveClient(), requireProductBusiness, async (req, res) => {
    const client = clientFor(req.data, req.user.clientId);
    const settings = productPostingSettings(client.settings);
    const destination = String(req.body.destination || settings.destination || '').trim();
    if (!destination) return res.status(400).json({ error: 'Add a Telegram destination first.' });
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
        await telegram.sendMessage(destination, { message: `Sprintsales test post for ${client.businessName}. Product posting is connected.` });
        await telegram.disconnect();
      } else {
        if (!client.settings.botToken) return res.status(400).json({ error: 'Telegram bot token is missing.' });
        const bot = new Telegraf(client.settings.botToken);
        await bot.telegram.sendMessage(destination, `Sprintsales test post for ${client.businessName}. Product posting is connected.`);
      }
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ error: `Test post failed: ${error.message}` });
    }
  });

  router.post('/api/client/announcements/preview', requireAuth('client'), requireActiveClient(), requireProductBusiness, async (req, res) => {
    try {
      const client = clientFor(req.data, req.user.clientId);
      ensureCampaignCollections(req.data);
      const quota = campaignQuotaStatus(req.data, client, String(req.body.type || 'sales').toLowerCase());
      if (!quota.ok) return res.status(429).json({ error: `Monthly announcement limit reached (${quota.used}/${quota.limit}).`, quota });
      const { campaign, audiencePreview } = createCampaign({ data: req.data, client, body: req.body || {} });
      await writeData(req.data);
      res.json({ campaign, audience: audiencePreview.counts, quota });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/api/client/announcements/:id/send', requireAuth('client'), requireActiveClient(), requireProductBusiness, async (req, res) => {
    try {
      const client = clientFor(req.data, req.user.clientId);
      const result = await sendCampaign({
        data: req.data,
        client,
        campaignId: req.params.id,
        message: req.body.message
      });
      addAuditLog(req.data, {
        user: req.user,
        action: 'announcement.sent',
        clientId: client.id,
        target: result.campaign.title,
        details: `Announcement sent to ${result.sent} shopper(s).`
      });
      await writeData(req.data);
      res.json({ campaign: result.campaign, sent: result.sent, audience: result.audience.counts });
    } catch (error) {
      await writeData(req.data).catch(() => null);
      res.status(400).json({ error: error.message });
    }
  });

  router.get('/api/client/announcements/:id/audience', requireAuth('client'), requireActiveClient(), requireProductBusiness, (req, res) => {
    const client = clientFor(req.data, req.user.clientId);
    ensureCampaignCollections(req.data);
    const campaign = (req.data.announcementCampaigns || []).find(item => item.id === req.params.id && item.clientId === client.id);
    if (!campaign) return res.status(404).json({ error: 'Announcement not found.' });
    const audience = buildCampaignAudience(req.data, client, campaign);
    res.json({ counts: audience.counts, eligible: audience.eligible.slice(0, 50) });
  });
  
  router.post('/api/client/products', requireAuth('client'), requireActiveClient(), requireProductBusiness, productUpload.fields([{ name: 'image', maxCount: 3 }, { name: 'images', maxCount: 6 }]), async (req, res) => {
    try {
      const uploadedFiles = uploadedProductFiles(req);
      const client = clientFor(req.data, req.user.clientId);
      if (!isProductBusiness(client)) {
        await cleanupUploadedFiles(uploadedFiles);
        return res.status(400).json({ error: 'Product catalog is available only for product-selling businesses. Service businesses should describe services in Settings.' });
      }
      const products = req.data.products || [];
      const clientProducts = products.filter(product => product.clientId === req.user.clientId);
      if (clientProducts.length >= quotas.maxProductsPerClient) {
        await cleanupUploadedFiles(uploadedFiles);
        return res.status(400).json({ error: `Product limit reached. Each client can add up to ${quotas.maxProductsPerClient} products.` });
      }
      const currentProductImageBytes = await directorySize(path.join(productImageDir, req.user.clientId));
      const incomingImageBytes = uploadedFiles.reduce((sum, file) => sum + (file.size || 0), 0);
      const existingProductImageBytes = Math.max(0, currentProductImageBytes - incomingImageBytes);
      const estimatedStoredImageBytes = incomingImageBytes ? incomingImageBytes * 2 : 0;
      if (existingProductImageBytes + estimatedStoredImageBytes > quotas.maxProductImageStorageMbPerClient * MB) {
        await cleanupUploadedFiles(uploadedFiles);
        return res.status(400).json({ error: `Product image storage limit reached. Each client can use up to ${quotas.maxProductImageStorageMbPerClient} MB for product images.` });
      }
      const code = String(req.body.code || '').trim().toUpperCase();
      const name = String(req.body.name || '').trim();
      if (!code || !name) {
        await cleanupUploadedFiles(uploadedFiles);
        return res.status(400).json({ error: 'Product code and product name are required.' });
      }
      if (clientProducts.some(product => product.code.toUpperCase() === code)) {
        await cleanupUploadedFiles(uploadedFiles);
        return res.status(409).json({ error: 'That product code already exists.' });
      }
      const price = String(req.body.price || '').trim();
      if (!price || Number.isNaN(Number(price)) || Number(price) < 0) {
        await cleanupUploadedFiles(uploadedFiles);
        return res.status(400).json({ error: 'Product price must be a valid positive number.' });
      }
      const category = String(req.body.category || '').trim();
      if (!category) {
        await cleanupUploadedFiles(uploadedFiles);
        return res.status(400).json({ error: 'Please choose a product category before saving.' });
      }
      // Validate category exists in client's allowed categories
      const clientSettings = client?.settings || {};
      const validCategories = clientSettings.categories || [];
      if (category && validCategories.length > 0 && !validCategories.includes(category)) {
        await cleanupUploadedFiles(uploadedFiles);
        return res.status(400).json({ error: `Category "${category}" does not exist in your category list. Add it first in Settings.`, validCategories });
      }
      const productStatus = productStatusFromBody(req.body);
      const isActive = productStatus !== 'draft' && productStatus !== 'hidden';
      const availability = productStatus === 'out_of_stock' ? 'out_of_stock' : String(req.body.availability || '');
      const product = {
        id: uid('product'),
        clientId: req.user.clientId,
        code,
        name,
        price,
        costPrice: String(req.body.costPrice || ''),
        sellingPrice: String(req.body.sellingPrice || price || ''),
        stockQuantity: Math.max(0, Number(req.body.stockQuantity || 0)),
        lowStockThreshold: Math.max(0, Number(req.body.lowStockThreshold || 0)),
        sizes: String(req.body.sizes || ''),
        colors: String(req.body.colors || ''),
        options: String(req.body.options || ''),
        variantNote: String(req.body.variantNote || ''),
        stockNote: String(req.body.stockNote || ''),
        material: String(req.body.material || ''),
        category,
        subcategory: String(req.body.subcategory || ''),
        selectedCategory: category || '',
        selectedSubcategory: String(req.body.subcategory || ''),
        tags: Array.isArray(req.body.tags) ? req.body.tags : [],
        availability,
        description: String(req.body.description || ''),
        notes: String(req.body.notes || ''),
        imagePath: '',
        images: [],
        imageOriginalPath: '',
        originalImagePath: '',
        watermarkedImagePath: '',
        publicImagePath: '',
        imageOriginalName: uploadedFiles[0]?.originalname || '',
        imageDescription: '',
        detailedSearchDescription: '',
        salesPostCaption: '',
        productAttributes: {},
        imageAnalysis: null,
        discounts: {
          newBuyer: req.body.discountNewBuyer !== 'false',
          repeatBuyer: req.body.discountRepeatBuyer !== 'false',
          birthdayWeek: req.body.discountBirthdayWeek !== 'false',
          sales: req.body.discountSales !== 'false',
          holiday: req.body.discountHoliday !== 'false',
          promoCodes: req.body.discountPromoCodes !== 'false'
        },
        excludeFromDiscounts: req.body.excludeFromDiscounts === 'true',
        isActive,
        createdAt: now()
      };
      if (uploadedFiles.length) {
        try {
          await applyProductImagePipeline({ client, product, files: uploadedFiles, appendExisting: true });
        } catch (imgErr) {
          console.error(`Product image pipeline failed: ${imgErr.message}`);
          await cleanupUploadedFiles(uploadedFiles);
          return res.status(500).json({ error: 'Product image processing failed. Please try another image.' });
        }
      }
      if (!product.category) {
        await cleanupUploadedFiles(productImagePaths(product).map(imagePath => ({ path: imagePath })));
        return res.status(400).json({ error: 'Please choose a product category before saving.' });
      }
      req.data.products = products;
      req.data.products.push(product);
      const posting = productPostingSettings(client.settings);
      if (posting.autoPostEnabled && posting.autoPostWarningAccepted && posting.destination) {
        try {
          const caption = product.salesPostCaption || await generateProductCaption(req.data, client, product, posting);
          const post = createProductPost({
            data: req.data,
            client,
            product,
            caption,
            destination: posting.destination,
            status: 'draft',
            auto: true
          });
          await sendProductPost({ data: req.data, client, post });
          product.lastAutoPostStatus = 'posted';
        } catch (error) {
          console.error(`Auto product post failed for ${client.businessName}:`, error.message);
          product.lastAutoPostStatus = 'failed';
          product.lastAutoPostError = error.message;
          addAuditLog(req.data, {
            user: req.user,
            action: 'product-post.auto_failed',
            clientId: req.user.clientId,
            target: `${product.code} ${product.name}`,
            details: `Auto-posting failed: ${error.message}`
          });
        }
      }
      addAuditLog(req.data, {
        user: req.user,
        action: 'product.created',
        clientId: req.user.clientId,
        target: `${product.code} ${product.name}`,
        details: `Client added product ${product.code}.`
      });
      await writeData(req.data);
      res.json({ product });
    } catch (error) {
      console.error('Product create error:', error);
      await cleanupUploadedFiles(uploadedProductFiles(req));
      res.status(500).json({ error: 'Failed to save product. Please try again.' });
    }
  });
  
  router.post('/api/client/products/:id/post/generate', requireAuth('client'), requireActiveClient(), requireProductBusiness, async (req, res) => {
    const client = clientFor(req.data, req.user.clientId);
    const product = (req.data.products || []).find(item => item.id === req.params.id && item.clientId === client.id);
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    const generationLimit = 2;
    const existingGenerationCount = (req.data.productPosts || []).filter(item =>
      item.clientId === client.id &&
      (item.productId === product.id || (product.code && item.productCode && String(item.productCode).toUpperCase() === String(product.code).toUpperCase()))
    ).length;
    const storedGenerationCount = Math.max(0, Number(product.postGenerationCount || product.postDraftGenerationCount || 0));
    const generationCount = Math.max(existingGenerationCount, storedGenerationCount);
    if (generationCount >= generationLimit) {
      product.postGenerationCount = generationCount;
      await writeData(req.data);
      return res.status(429).json({ error: 'You can generate up to 2 post drafts for each product. Edit one of the saved drafts, or post the best one.' });
    }
    const posting = {
      ...productPostingSettings(client.settings),
      ...(req.body || {}),
      forceRegenerate: generationCount > 0,
      variantNumber: generationCount + 1
    };
    const caption = await generateProductCaption(req.data, client, product, posting);
    const post = createProductPost({
      data: req.data,
      client,
      product,
      caption,
      destination: posting.destination || productPostingSettings(client.settings).destination,
      status: 'draft',
      auto: false
    });
    product.postGenerationCount = generationCount + 1;
    product.lastPostDraftAt = now();
    addAuditLog(req.data, {
      user: req.user,
      action: 'product-post.draft_created',
      clientId: client.id,
      target: `${product.code} ${product.name}`,
      details: `Client generated Telegram product post draft ${product.postGenerationCount}/${generationLimit}.`
    });
    await writeData(req.data);
    res.json({ post, remainingGenerations: Math.max(0, generationLimit - product.postGenerationCount) });
  });
  
  router.patch('/api/client/product-posts/:id', requireAuth('client'), requireActiveClient(), requireProductBusiness, async (req, res) => {
    const post = (req.data.productPosts || []).find(item => item.id === req.params.id && item.clientId === req.user.clientId);
    if (!post) return res.status(404).json({ error: 'Product post not found.' });
    if (post.status === 'posted') return res.status(400).json({ error: 'Posted captions cannot be edited here. Generate a new draft instead.' });
    post.caption = String(req.body.caption || post.caption || '').slice(0, 1000);
    post.destination = String(req.body.destination || post.destination || '').trim().slice(0, 120);
    post.updatedAt = now();
    await writeData(req.data);
    res.json({ post });
  });
  
  router.post('/api/client/product-posts/:id/post', requireAuth('client'), requireActiveClient(), requireProductBusiness, async (req, res) => {
    const client = clientFor(req.data, req.user.clientId);
    const post = (req.data.productPosts || []).find(item => item.id === req.params.id && item.clientId === client.id);
    if (!post) return res.status(404).json({ error: 'Product post not found.' });
    post.caption = String(req.body.caption || post.caption || '').slice(0, 1000);
    post.destination = String(req.body.destination || post.destination || productPostingSettings(client.settings).destination || '').trim().slice(0, 120);
    try {
      await sendProductPost({ data: req.data, client, post });
      await writeData(req.data);
      res.json({ post });
    } catch (error) {
      await writeData(req.data);
      res.status(400).json({ error: error.message, post });
    }
  });
  
  router.delete('/api/client/product-posts/:id', requireAuth('client'), requireActiveClient(), requireProductBusiness, async (req, res) => {
    const post = (req.data.productPosts || []).find(item => item.id === req.params.id && item.clientId === req.user.clientId);
    if (!post) return res.status(404).json({ error: 'Product post not found.' });
    req.data.productPosts = (req.data.productPosts || []).filter(item => item.id !== post.id);
    await writeData(req.data);
    res.json({ ok: true });
  });
  
  router.patch('/api/client/products/:id', requireAuth('client'), requireActiveClient(), requireProductBusiness, async (req, res) => {
    const product = (req.data.products || []).find(item => item.id === req.params.id && item.clientId === req.user.clientId);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    product.isActive = booleanField(req.body.isActive, product.isActive !== false);
    addAuditLog(req.data, {
      user: req.user,
      action: product.isActive ? 'product.enabled' : 'product.paused',
      clientId: req.user.clientId,
      target: `${product.code} ${product.name}`,
      details: `Product ${product.isActive ? 'enabled' : 'paused'}.`
    });
    await writeData(req.data);
    res.json({ product });
  });

  router.delete('/api/client/products/:id/images/:index', requireAuth('client'), requireActiveClient(), requireProductBusiness, async (req, res) => {
    const product = (req.data.products || []).find(item => item.id === req.params.id && item.clientId === req.user.clientId);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const index = Number(req.params.index);
    const records = productImageRecords(product);
    if (!Number.isInteger(index) || index < 0 || index >= records.length) {
      return res.status(400).json({ error: 'Choose a valid product image to remove.' });
    }
    const removed = records[index];
    const remaining = records.filter((_record, recordIndex) => recordIndex !== index);
    product.images = remaining.map((record, recordIndex) => ({ ...record, isPrimary: recordIndex === 0 }));
    setPrimaryProductImageFields(product);
    product.updatedAt = now();
    await unlinkProductImageRecord(req.user.clientId, removed);
    addAuditLog(req.data, {
      user: req.user,
      action: 'product.image.deleted',
      clientId: req.user.clientId,
      target: `${product.code} ${product.name}`,
      details: `Client removed image ${index + 1} from product ${product.code}.`
    });
    await writeData(req.data);
    res.json({ ok: true, product });
  });
  
  router.put('/api/client/products/:id', requireAuth('client'), requireActiveClient(), requireProductBusiness, productUpload.fields([{ name: 'image', maxCount: 3 }, { name: 'images', maxCount: 6 }]), async (req, res) => {
    try {
      const uploadedFiles = uploadedProductFiles(req);
      const product = (req.data.products || []).find(item => item.id === req.params.id && item.clientId === req.user.clientId);
      if (!product) {
        await cleanupUploadedFiles(uploadedFiles);
        return res.status(404).json({ error: 'Product not found' });
      }
      const code = String(req.body.code || '').trim().toUpperCase();
      const name = String(req.body.name || '').trim();
      if (!code || !name) {
        await cleanupUploadedFiles(uploadedFiles);
        return res.status(400).json({ error: 'Product code and product name are required.' });
      }
      const duplicate = (req.data.products || []).find(item =>
        item.clientId === req.user.clientId &&
        item.id !== product.id &&
        String(item.code || '').toUpperCase() === code
      );
      if (duplicate) {
        await cleanupUploadedFiles(uploadedFiles);
        return res.status(409).json({ error: 'That product code already exists.' });
      }
      const price = String(req.body.price || '').trim();
      if (!price) {
        await cleanupUploadedFiles(uploadedFiles);
        return res.status(400).json({ error: 'Product price is required.' });
      }
      const category = String(req.body.category || '').trim();
      if (!category) {
        await cleanupUploadedFiles(uploadedFiles);
        return res.status(400).json({ error: 'Please choose a product category before saving.' });
      }
      const client = clientFor(req.data, req.user.clientId);
      const validCategories = client?.settings?.categories || [];
      if (category && validCategories.length > 0 && !validCategories.includes(category)) {
        await cleanupUploadedFiles(uploadedFiles);
        return res.status(400).json({ error: `Category "${category}" does not exist in your category list. Add it first in Settings.`, validCategories });
      }
      const oldImagePaths = productImagePaths(product);
      if (uploadedFiles.length) {
        if (productImageRecords(product).length >= 3) {
          await cleanupUploadedFiles(uploadedFiles);
          return res.status(400).json({ error: 'This product already has 3 images. Remove an old image before adding another one.' });
        }
        const currentProductImageBytes = await directorySize(path.join(productImageDir, req.user.clientId));
        let previousImageBytes = 0;
        for (const imagePath of oldImagePaths) {
          previousImageBytes += (await fs.stat(imagePath).catch(() => null))?.size || 0;
        }
        const incomingImageBytes = uploadedFiles.reduce((sum, file) => sum + (file.size || 0), 0);
        const existingProductImageBytes = Math.max(0, currentProductImageBytes - previousImageBytes - incomingImageBytes);
        if (existingProductImageBytes + (incomingImageBytes * 2) > quotas.maxProductImageStorageMbPerClient * MB) {
          await cleanupUploadedFiles(uploadedFiles);
          return res.status(400).json({ error: `Product image storage limit reached. Each client can use up to ${quotas.maxProductImageStorageMbPerClient} MB for product images.` });
        }
      }
      const productStatus = productStatusFromBody(req.body);
      const isActive = productStatus !== 'draft' && productStatus !== 'hidden';
      product.code = code;
      product.name = name;
      product.price = price;
      product.costPrice = String(req.body.costPrice || '');
      product.sellingPrice = String(req.body.sellingPrice || price || '');
      product.stockQuantity = Math.max(0, Number(req.body.stockQuantity || 0));
      product.lowStockThreshold = Math.max(0, Number(req.body.lowStockThreshold || 0));
      product.sizes = String(req.body.sizes || '');
      product.colors = String(req.body.colors || '');
      product.options = String(req.body.options || '');
      product.variantNote = String(req.body.variantNote || '');
      product.stockNote = String(req.body.stockNote || '');
      product.material = String(req.body.material || '');
      product.category = category;
      product.subcategory = String(req.body.subcategory || product.subcategory || '');
      product.selectedCategory = category || product.selectedCategory || '';
      product.selectedSubcategory = product.subcategory || product.selectedSubcategory || '';
      product.tags = Array.isArray(req.body.tags) ? req.body.tags : product.tags || [];
      product.availability = productStatus === 'out_of_stock' ? 'out_of_stock' : String(req.body.availability || '');
      product.description = String(req.body.description || '');
      product.notes = String(req.body.notes || '');
      product.discounts = {
        ...(product.discounts || {}),
        newBuyer: req.body.discountNewBuyer !== 'false',
        repeatBuyer: req.body.discountRepeatBuyer !== 'false',
        birthdayWeek: req.body.discountBirthdayWeek !== 'false',
        sales: req.body.discountSales !== 'false',
        holiday: req.body.discountHoliday !== 'false',
        promoCodes: req.body.discountPromoCodes !== 'false'
      };
      product.excludeFromDiscounts = req.body.excludeFromDiscounts === 'true';
      product.isActive = isActive;
      if (uploadedFiles.length) {
        try {
          await applyProductImagePipeline({ client, product, files: uploadedFiles, appendExisting: true });
          for (const imagePath of oldImagePaths) {
            if (!productImagePaths(product).includes(imagePath)) await fs.unlink(imagePath).catch(() => null);
          }
        } catch (imgErr) {
          console.error(`Product image pipeline failed: ${imgErr.message}`);
          await cleanupUploadedFiles(uploadedFiles);
          return res.status(500).json({ error: 'Product image processing failed. Please try another image.' });
        }
      }
      if (!product.category) {
        await cleanupUploadedFiles(uploadedFiles);
        return res.status(400).json({ error: 'Please choose a product category before saving.' });
      }
      if (!uploadedFiles.length && productOriginalImagePath(product)) {
        try {
          const refreshedImages = [];
          for (const imageRecord of productImageRecords(product)) {
            const originalPath = imageRecord.originalPath || imageRecord.publicPath;
            if (!originalPath) continue;
            const currentPublicPath = imageRecord.publicPath || imageRecord.watermarkedPath || '';
            const publicPath = currentPublicPath && path.resolve(currentPublicPath) !== path.resolve(originalPath)
              ? currentPublicPath
              : watermarkedPathForOriginal(originalPath);
            await createWatermarkedProductImage({
              inputPath: originalPath,
              outputPath: publicPath,
              centerText: watermarkCenterText(client),
              bottomText: watermarkBottomText(client, product),
              bottomLogoPath: watermarkLogoPath(client)
            });
            refreshedImages.push({
              ...imageRecord,
              originalPath,
              watermarkedPath: publicPath,
              publicPath,
              isPrimary: refreshedImages.length === 0
            });
          }
          if (refreshedImages.length) {
            product.images = refreshedImages;
            product.watermarkedImagePath = refreshedImages[0].watermarkedPath;
            product.publicImagePath = refreshedImages[0].publicPath;
            product.imagePath = refreshedImages[0].publicPath;
          }
          product.watermark = {
            centerText: watermarkCenterText(client),
            bottomText: watermarkBottomText(client, product),
            bottomLogoPath: watermarkLogoPath(client),
            updatedAt: now()
          };
        } catch (wmErr) {
          console.error(`Product watermark refresh failed: ${wmErr.message}`);
        }
      }
      product.updatedAt = now();
      addAuditLog(req.data, {
        user: req.user,
        action: 'product.updated',
        clientId: req.user.clientId,
        target: `${product.code} ${product.name}`,
        details: `Client edited product ${product.code}.`
      });
      await writeData(req.data);
      res.json({ product });
    } catch (error) {
      console.error('Product update error:', error);
      await cleanupUploadedFiles(uploadedProductFiles(req));
      res.status(500).json({ error: 'Failed to update product. Please try again.' });
    }
  });
  
  router.delete('/api/client/products/:id', requireAuth('client'), requireActiveClient(), requireProductBusiness, async (req, res) => {
    const product = (req.data.products || []).find(item => item.id === req.params.id && item.clientId === req.user.clientId);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    req.data.products = (req.data.products || []).filter(item => item.id !== product.id);
    req.data.productPosts = (req.data.productPosts || []).filter(item => item.productId !== product.id);
    for (const imagePath of productImagePaths(product)) {
      await fs.unlink(imagePath).catch(() => null);
    }
    addAuditLog(req.data, {
      user: req.user,
      action: 'product.deleted',
      clientId: req.user.clientId,
      target: `${product.code} ${product.name}`,
      details: 'Client deleted a product catalog item.'
    });
    await writeData(req.data);
    res.json({ ok: true });
  });
  
  router.post('/api/client/orders', requireAuth('client'), requireActiveClient(), requireProductBusiness, async (req, res) => {
    const product = (req.data.products || []).find(item => item.id === req.body.productId && item.clientId === req.user.clientId);
    const productCode = product?.code || String(req.body.productCode || '').trim();
    const productName = product?.name || String(req.body.productName || '').trim();
    
    // Validate product reference
    if (!product && !productCode && !productName) {
      return res.status(400).json({ error: 'Product is required. Select a valid product from your catalog.' });
    }
    
    if (!product && (productCode || productName)) {
      return res.status(400).json({ error: 'Product not found in your catalog. Please select a valid product.' });
    }
    
    const quantity = orderQuantity(req.body.quantity);
    const unitPrice = String(req.body.unitPrice || productPrice(product || {}) || orderUnitPrice(req.body, product || {}));
    
    // Validate unit price is numeric
    if (unitPrice && Number.isNaN(Number(unitPrice))) {
      return res.status(400).json({ error: 'Unit price must be a valid number.' });
    }
    
    // Validate total if provided
    if (req.body.total && Number.isNaN(Number(req.body.total))) {
      return res.status(400).json({ error: 'Order total must be a valid number.' });
    }
    
    const statuses = orderPayload(req.body);
    const order = {
      id: uid('order'),
      clientId: req.user.clientId,
      conversationId: '',
      leadId: String(req.body.leadId || ''),
      productId: product?.id || '',
      productCode,
      productName,
      quantity,
      unitPrice,
      total: orderLineTotal({ unitPrice, quantity, fallbackTotal: req.body.total }),
      customerName: String(req.body.customerName || ''),
      username: String(req.body.username || ''),
      telegramUserId: '',
      telegramChatId: '',
      phone: String(req.body.phone || ''),
      deliveryNote: String(req.body.deliveryNote || ''),
      dueDate: String(req.body.dueDate || ''),
      productionStageNote: String(req.body.productionStageNote || ''),
      notes: String(req.body.notes || ''),
      // Track missing order details for completion workflow
      selectedSize: String(req.body.selectedSize || ''),
      selectedColor: String(req.body.selectedColor || ''),
      missingDetails: [],
      customerConfirmedOrder: Boolean(req.body.customerConfirmedOrder),
      confirmationPromptSentAt: '',
      paymentPromptSentAt: '',
      awaitingPaymentProof: false,
      stockReducedAt: '',
      cancelledReason: '',
      ...statuses,
      createdAt: now(),
      updatedAt: now()
    };
    
    // Initialize missing details based on current data
    if (!order.productId || !order.productCode) order.missingDetails.push('product');
    if (!order.phone && !order.telegramChatId && !order.username) order.missingDetails.push('contact');
    if (!order.selectedSize && product?.sizes) order.missingDetails.push('size');
    if (!order.selectedColor && product?.colors) order.missingDetails.push('color');
    
    req.data.orders.push(order);
    addAuditLog(req.data, {
      user: req.user,
      action: 'order.created',
      clientId: req.user.clientId,
      target: `${order.productCode} ${order.productName}`,
      details: `Client created order ${order.id}.`
    });
    await writeData(req.data);
    res.json({ order });
  });
  
  router.patch('/api/client/orders/:id', requireAuth('client'), requireActiveClient(), async (req, res) => {
    const order = (req.data.orders || []).find(item => item.id === req.params.id && item.clientId === req.user.clientId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const product = (req.data.products || []).find(item => item.id === req.body.productId && item.clientId === req.user.clientId) || null;
    const statuses = orderPayload(req.body, order);
    if (product) {
      order.productId = product.id;
      order.productCode = product.code;
      order.productName = product.name;
    }
    order.quantity = orderQuantity(req.body.quantity || order.quantity);
    order.unitPrice = String(req.body.unitPrice || order.unitPrice || '');
    order.total = orderLineTotal({ unitPrice: order.unitPrice, quantity: order.quantity, fallbackTotal: req.body.total || order.total });
    order.customerName = String(req.body.customerName || order.customerName || '');
    order.phone = String(req.body.phone || order.phone || '');
    order.deliveryNote = String(req.body.deliveryNote || order.deliveryNote || '');
    order.dueDate = String(req.body.dueDate || order.dueDate || '');
    order.productionStageNote = String(req.body.productionStageNote || order.productionStageNote || '');
    order.notes = String(req.body.notes || order.notes || '');
    Object.assign(order, statuses);
    const completionRequested = Boolean(req.body.reduceStock) || order.status === 'delivered' || order.deliveryStatus === 'delivered';
    if (completionRequested) {
      const guardProduct = (req.data.products || []).find(item => item.id === order.productId && item.clientId === req.user.clientId) || product;
      const guardrails = orderGuardrails(order, guardProduct, { reducingStock: Boolean(req.body.reduceStock) });
      const blockers = guardrails.filter(item => item.severity === 'blocker');
      if (blockers.length) return res.status(400).json({ error: blockers[0].message, guardrails });
    }
    if (req.body.reduceStock && order.stockReducedAt) return res.status(400).json({ error: 'Stock was already reduced for this order.' });
    if (req.body.reduceStock && !order.stockReducedAt) {
      const stockProduct = (req.data.products || []).find(item => item.id === order.productId && item.clientId === req.user.clientId);
      if (!stockProduct) return res.status(400).json({ error: 'Product is required before stock can be reduced.' });
      const currentStock = Math.max(0, Number(stockProduct.stockQuantity || 0));
      const quantity = Math.max(1, Number(order.quantity || 1));
      if (currentStock < quantity) return res.status(400).json({ error: `Not enough stock. Available: ${currentStock}, Requested: ${quantity}.` });
      
      // Atomic double-check to prevent race conditions with concurrent orders
      const latestProduct = (req.data.products || []).find(item => item.id === order.productId && item.clientId === req.user.clientId);
      const latestStock = Math.max(0, Number(latestProduct?.stockQuantity || 0));
      if (latestStock < quantity) {
        return res.status(400).json({ error: `Stock was modified by another order. Available now: ${latestStock}, Requested: ${quantity}. Please retry.` });
      }
      
      const nextStock = latestStock - quantity;
      stockProduct.stockQuantity = nextStock;
      stockProduct.updatedAt = now();
      order.stockReducedAt = now();
      order.status = 'delivered';
      order.deliveryStatus = 'delivered';
      const reviewDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
      req.data.reminders ||= [];
      req.data.reminders.push({
        id: uid('reminder'),
        clientId: req.user.clientId,
        title: `Ask for review: ${order.customerName || order.username || order.phone || order.productName}`,
        type: 'customer',
        dueDate: reviewDate,
        status: 'open',
        linkedOrderId: order.id,
        notes: `Order delivered. Ask the customer for a review/testimonial in 3 days.`,
        createdAt: now(),
        updatedAt: now()
      });
      req.data.stockMovements ||= [];
      req.data.stockMovements.push({
        id: uid('stock'),
        clientId: req.user.clientId,
        productId: stockProduct.id,
        productCode: stockProduct.code || '',
        productName: stockProduct.name || '',
        orderId: order.id,
        type: 'order-delivered',
        quantityChange: -quantity,
        oldStock: currentStock,
        newStock: nextStock,
        note: `Stock reduced after delivering order ${order.id}.`,
        createdAt: now()
      });
      await notifyLowStock({ data: req.data, client: clientFor(req.data, req.user.clientId), product: stockProduct });
    }
    order.updatedAt = now();
    let customerNotified = false;
    if (req.body.notifyCustomer) {
      const chatId = order.telegramChatId || (order.conversationId ? req.data.conversations.find(item => item.id === order.conversationId)?.telegramChatId : '');
      if (!chatId) return res.status(400).json({ error: 'This order has no Telegram chat ID to notify.' });
      const client = clientFor(req.data, req.user.clientId);
      await sendCustomerTelegramMessage(client, chatId, req.body.customerMessage || orderStatusCustomerMessage(client, order));
      customerNotified = true;
      req.data.messages.push({
        id: uid('msg'),
        clientId: req.user.clientId,
        conversationId: order.conversationId || '',
        direction: 'outbound',
        text: req.body.customerMessage || orderStatusCustomerMessage(client, order),
        createdAt: now()
      });
    }
    addAuditLog(req.data, {
      user: req.user,
      action: 'order.updated',
      clientId: req.user.clientId,
      target: `${order.productCode} ${order.productName}`,
      details: `Order status ${order.status}, payment ${order.paymentStatus}, delivery ${order.deliveryStatus}.${customerNotified ? ' Customer notified.' : ''}`
    });
    await writeData(req.data);
    res.json({ order, customerNotified, guardrails: orderGuardrails(order, (req.data.products || []).find(item => item.id === order.productId && item.clientId === req.user.clientId) || null) });
  });
  
  router.patch('/api/client/bookings/:id', requireAuth('client'), requireActiveClient(), async (req, res) => {
    const booking = (req.data.bookings || []).find(item => item.id === req.params.id && item.clientId === req.user.clientId);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    const allowed = ['requested', 'contacted', 'confirmed', 'done', 'cancelled'];
    booking.status = allowed.includes(req.body.status) ? req.body.status : (booking.status || 'requested');
    booking.requestedService = String(req.body.requestedService || booking.requestedService || '');
    booking.phone = String(req.body.phone || booking.phone || '');
    booking.preferredDateTime = String(req.body.preferredDateTime || booking.preferredDateTime || '');
    booking.locationPreference = String(req.body.locationPreference || booking.locationPreference || '');
    booking.budget = String(req.body.budget || booking.budget || '');
    booking.internalNote = String(req.body.internalNote || booking.internalNote || '');
    booking.missingDetails = [
      !booking.phone ? 'phone number' : '',
      !booking.preferredDateTime ? 'preferred date/time' : '',
      !booking.locationPreference ? 'location or online preference' : '',
      !booking.requestedService ? 'service needed' : ''
    ].filter(Boolean);
    booking.updatedAt = now();
    let customerNotified = false;
    if (req.body.notifyCustomer) {
      const client = clientFor(req.data, req.user.clientId);
      const chatId = booking.telegramChatId || (booking.conversationId ? req.data.conversations.find(item => item.id === booking.conversationId)?.telegramChatId : '');
      if (!chatId) return res.status(400).json({ error: 'This booking has no Telegram chat ID to notify.' });
      const message = req.body.customerMessage || bookingStatusCustomerMessage(client, booking);
      await sendCustomerTelegramMessage(client, chatId, message);
      customerNotified = true;
      req.data.messages.push({
        id: uid('msg'),
        clientId: req.user.clientId,
        conversationId: booking.conversationId || '',
        direction: 'outbound',
        text: message,
        createdAt: now()
      });
    }
    addAuditLog(req.data, {
      user: req.user,
      action: 'booking.updated',
      clientId: req.user.clientId,
      target: booking.requestedService || booking.id,
      details: `Booking status ${booking.status}.${customerNotified ? ' Customer notified.' : ''}`
    });
    await writeData(req.data);
    res.json({ booking, customerNotified });
  });
  
  router.delete('/api/client/orders/:id', requireAuth('client'), requireActiveClient(), async (req, res) => {
    const order = (req.data.orders || []).find(item => item.id === req.params.id && item.clientId === req.user.clientId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    req.data.orders = (req.data.orders || []).filter(item => item.id !== order.id);
    addAuditLog(req.data, {
      user: req.user,
      action: 'order.deleted',
      clientId: req.user.clientId,
      target: `${order.productCode} ${order.productName}`,
      details: 'Client deleted an order.'
    });
    await writeData(req.data);
    res.json({ ok: true });
  });
  
  router.get('/api/client/orders/export.csv', requireAuth('client'), (req, res) => {
    const orders = (req.data.orders || [])
      .filter(item => item.clientId === req.user.clientId)
      .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
    const proofs = req.data.paymentProofs || [];
    const headers = [
      'created_at',
      'updated_at',
      'status',
      'payment_status',
      'delivery_status',
      'product_code',
      'product_name',
      'quantity',
      'unit_price',
      'total',
      'customer_name',
      'username',
      'phone',
      'delivery_note',
      'notes',
      'payment_proof_status',
      'payer_name',
      'transaction_id',
      'proof_amount',
      'payment_date',
      'payment_provider',
      'stock_reduced_at',
      'last_customer_message'
    ];
    const rows = orders.map(order => {
      const proof = proofs.find(item => item.id === order.paymentProofId || item.orderId === order.id) || {};
      return [
        order.createdAt,
        order.updatedAt,
        order.status,
        order.paymentStatus,
        order.deliveryStatus,
        order.productCode,
        order.productName,
        order.quantity,
        order.unitPrice,
        order.total,
        order.customerName,
        order.username,
        order.phone,
        order.deliveryNote,
        order.notes,
        proof.status,
        proof.extracted?.payerName,
        proof.extracted?.transactionId,
        proof.extracted?.amount,
        proof.extracted?.paymentDate,
        proof.extracted?.provider,
        order.stockReducedAt,
        order.lastMessage
      ];
    });
    const csv = [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\n');
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="sprintsales-orders-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  });
  
  router.get('/api/client/stock-movements/export.csv', requireAuth('client'), (req, res) => {
    const movements = (req.data.stockMovements || [])
      .filter(item => item.clientId === req.user.clientId)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const headers = ['created_at', 'product_code', 'product_name', 'type', 'quantity_change', 'old_stock', 'new_stock', 'order_id', 'note'];
    const rows = movements.map(item => [
      item.createdAt,
      item.productCode,
      item.productName,
      item.type,
      item.quantityChange,
      item.oldStock,
      item.newStock,
      item.orderId,
      item.note
    ]);
    const csv = [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\n');
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="sprintsales-stock-movements-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  });
  
  router.get('/api/client/payment-proofs/:id/image', requireAuth('client'), async (req, res) => {
    const proof = (req.data.paymentProofs || []).find(item => item.id === req.params.id && item.clientId === req.user.clientId);
    if (!proof?.telegramFileId) return res.status(404).send('Payment screenshot not found');
    const client = clientFor(req.data, req.user.clientId);
    const token = client?.settings?.botToken;
    if (!token) return res.status(400).send('Telegram bot token is not configured');
    try {
      const response = await fetchWithTimeout(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(proof.telegramFileId)}`);
      const result = await response.json();
      if (!result.ok || !result.result?.file_path) return res.status(404).send('Telegram screenshot file is not available');
      res.redirect(`https://api.telegram.org/file/bot${token}/${result.result.file_path}`);
    } catch (error) {
      res.status(500).send(`Could not open payment screenshot: ${error.message}`);
    }
  });
  
  router.patch('/api/client/payment-proofs/:id', requireAuth('client'), requireActiveClient(), async (req, res) => {
    const proof = (req.data.paymentProofs || []).find(item => item.id === req.params.id && item.clientId === req.user.clientId);
    if (!proof) return res.status(404).json({ error: 'Payment proof not found' });
    const linkedOrder = req.body.orderId
      ? (req.data.orders || []).find(item => item.id === req.body.orderId && item.clientId === req.user.clientId)
      : null;
    if (req.body.orderId && !linkedOrder) return res.status(404).json({ error: 'Linked order not found' });
    if (req.body.orderId !== undefined) proof.orderId = linkedOrder?.id || '';
    if (['pending', 'verified', 'rejected'].includes(req.body.status)) proof.status = req.body.status;
    const manualSmsText = String(req.body.manualSmsText || proof.manualSmsText || '').slice(0, 2000);
    const smsExtracted = parsePaymentSms(manualSmsText);
    proof.verificationNote = String(req.body.verificationNote || proof.verificationNote || '');
    proof.manualSmsText = manualSmsText;
    proof.extracted = {
      ...(proof.extracted || {}),
      payerName: String(req.body.payerName || proof.extracted?.payerName || ''),
      transactionId: String(req.body.transactionId || smsExtracted.transactionId || proof.extracted?.transactionId || ''),
      amount: String(req.body.amount || smsExtracted.amount || proof.extracted?.amount || ''),
      paymentDate: String(req.body.paymentDate || smsExtracted.paymentDate || proof.extracted?.paymentDate || ''),
      provider: String(req.body.provider || smsExtracted.provider || proof.extracted?.provider || ''),
      note: String(req.body.extractionNote || proof.extracted?.note || (manualSmsText ? 'Payment details assisted by manual SMS text.' : 'AI extraction not enabled yet.'))
    };
    const order = linkedOrder || (proof.orderId
      ? (req.data.orders || []).find(item => item.id === proof.orderId && item.clientId === req.user.clientId)
      : null);
    proof.match = paymentMatchSummary(proof, order);
    proof.updatedAt = now();
    if (proof.status === 'verified' && proof.orderId) {
      const order = (req.data.orders || []).find(item => item.id === proof.orderId && item.clientId === req.user.clientId);
      if (order) {
        const client = clientFor(req.data, req.user.clientId);
        const verifiedAt = now();
        order.status = 'confirmed';
        order.paymentStatus = 'paid';
        order.paymentVerifiedAt = verifiedAt;
        order.ownerVerifiedAt = verifiedAt;
        order.paymentVerifiedBy = req.user.email || req.user.name || 'dashboard';
        order.paymentProofId = proof.id;
        order.customerConfirmedOrder = true;
        order.deliveryStatus = order.deliveryStatus === 'delivered' ? order.deliveryStatus : (order.deliveryStatus || 'not-started');
        order.deliveryStartedAt = order.deliveryStartedAt || verifiedAt;
        order.deliveryMaxHours = Math.max(1, Number(order.deliveryMaxHours || order.deliveryEtaHours || 24) || 24);
        order.deliveryFeedbackAvailableAt = order.deliveryFeedbackAvailableAt || new Date(new Date(order.deliveryStartedAt).getTime() + (order.deliveryMaxHours * 60 * 60 * 1000 / 3)).toISOString();
        order.updatedAt = verifiedAt;
        if (order.telegramChatId) {
          await sendCustomerTelegramMessage(client, order.telegramChatId, paymentConfirmedCustomerMessage(client, order), {
            reply_markup: deliveryButtonsForOrder(order)
          }).catch(error => {
            addAuditLog(req.data, {
              user: req.user,
              action: 'payment-proof.customer_notify_failed',
              clientId: req.user.clientId,
              target: order.id,
              details: `Payment confirmation was saved but Telegram notify failed: ${error.message}`
            });
          });
        }
      }
    } else if (proof.status === 'rejected' && proof.orderId) {
      const order = (req.data.orders || []).find(item => item.id === proof.orderId && item.clientId === req.user.clientId);
      if (order) {
        order.paymentStatus = 'rejected';
        order.paymentRejectedAt = now();
        order.paymentProofId = proof.id;
        order.updatedAt = order.paymentRejectedAt;
        if (order.telegramChatId) {
          await sendCustomerTelegramMessage(
            clientFor(req.data, req.user.clientId),
            order.telegramChatId,
            `We could not confirm the payment for order ${order.id}. Please check the screenshot and send the correct payment proof, or talk to support.`
          ).catch(error => {
            addAuditLog(req.data, {
              user: req.user,
              action: 'payment-proof.reject_notify_failed',
              clientId: req.user.clientId,
              target: order.id,
              details: `Payment rejection was saved but Telegram notify failed: ${error.message}`
            });
          });
        }
      }
    }
    addAuditLog(req.data, {
      user: req.user,
      action: 'payment-proof.updated',
      clientId: req.user.clientId,
      target: proof.orderId || proof.telegramChatId || proof.id,
      details: `Payment proof marked ${proof.status}.`
    });
    await writeData(req.data);
    res.json({ proof });
  });
  
  router.post('/api/client/stock-adjustments', requireAuth('client'), requireActiveClient(), requireProductBusiness, async (req, res) => {
    const product = (req.data.products || []).find(item => item.id === req.body.productId && item.clientId === req.user.clientId);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const type = ['received', 'damaged', 'lost', 'correction'].includes(req.body.type) ? req.body.type : 'correction';
    const amount = Math.max(0, Number(req.body.quantity || 0));
    if (!amount) return res.status(400).json({ error: 'Quantity is required.' });
    const oldStock = Math.max(0, Number(product.stockQuantity || 0));
    const change = type === 'received' ? amount : type === 'correction' ? amount - oldStock : -amount;
    const newStock = Math.max(0, oldStock + change);
    product.stockQuantity = newStock;
    if (type === 'received') {
      product.restockStatus = '';
      product.restockQuantity = '';
      product.restockDueDate = '';
    }
    product.updatedAt = now();
    req.data.stockMovements ||= [];
    const movement = {
      id: uid('stock'),
      clientId: req.user.clientId,
      productId: product.id,
      productCode: product.code || '',
      productName: product.name || '',
      orderId: '',
      type: `manual-${type}`,
      quantityChange: newStock - oldStock,
      oldStock,
      newStock,
      note: String(req.body.note || ''),
      createdAt: now()
    };
    req.data.stockMovements.push(movement);
    addAuditLog(req.data, {
      user: req.user,
      action: 'stock.adjusted',
      clientId: req.user.clientId,
      target: `${product.code} ${product.name}`,
      details: `Stock changed from ${oldStock} to ${newStock}.`
    });
    await notifyLowStock({ data: req.data, client: clientFor(req.data, req.user.clientId), product });
    await writeData(req.data);
    res.json({ product, movement });
  });
  
  router.post('/api/client/products/:id/restock-reminder', requireAuth('client'), requireActiveClient(), requireProductBusiness, async (req, res) => {
    const product = (req.data.products || []).find(item => item.id === req.params.id && item.clientId === req.user.clientId);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const quantity = Math.max(1, Number(req.body.quantity || 1));
    const dueDate = String(req.body.dueDate || '');
    const note = String(req.body.note || '').slice(0, 1000);
    product.restockStatus = 'ordered';
    product.restockQuantity = quantity;
    product.restockDueDate = dueDate;
    product.restockNote = note;
    product.updatedAt = now();
    req.data.reminders ||= [];
    const reminder = {
      id: uid('reminder'),
      clientId: req.user.clientId,
      title: `Restock ${[product.code, product.name].filter(Boolean).join(' - ')}`,
      type: 'production',
      dueDate,
      status: 'open',
      linkedOrderId: '',
      notes: [`Restock quantity: ${quantity}`, note].filter(Boolean).join('\n'),
      createdAt: now(),
      updatedAt: now()
    };
    req.data.reminders.push(reminder);
    addAuditLog(req.data, {
      user: req.user,
      action: 'product.restock_reminder_created',
      clientId: req.user.clientId,
      target: `${product.code} ${product.name}`,
      details: `Restock reminder created for ${quantity} item(s).`
    });
    await writeData(req.data);
    res.json({ product, reminder });
  });
  
  router.post('/api/client/reminders', requireAuth('client'), requireActiveClient(), async (req, res) => {
    const title = String(req.body.title || '').trim();
    if (!title) return res.status(400).json({ error: 'Reminder title is required.' });
    const reminder = {
      id: uid('reminder'),
      clientId: req.user.clientId,
      title,
      type: ['order', 'payment', 'production', 'customer', 'general'].includes(req.body.type) ? req.body.type : 'general',
      dueDate: String(req.body.dueDate || ''),
      status: ['open', 'done'].includes(req.body.status) ? req.body.status : 'open',
      linkedOrderId: String(req.body.linkedOrderId || ''),
      notes: String(req.body.notes || ''),
      createdAt: now(),
      updatedAt: now()
    };
    req.data.reminders.push(reminder);
    await writeData(req.data);
    res.json({ reminder });
  });
  
  router.patch('/api/client/reminders/:id', requireAuth('client'), requireActiveClient(), async (req, res) => {
    const reminder = (req.data.reminders || []).find(item => item.id === req.params.id && item.clientId === req.user.clientId);
    if (!reminder) return res.status(404).json({ error: 'Reminder not found' });
    if (req.body.title !== undefined) reminder.title = String(req.body.title || reminder.title);
    if (['order', 'payment', 'production', 'customer', 'general'].includes(req.body.type)) reminder.type = req.body.type;
    if (req.body.dueDate !== undefined) reminder.dueDate = String(req.body.dueDate || '');
    if (['open', 'done'].includes(req.body.status)) reminder.status = req.body.status;
    if (req.body.notes !== undefined) reminder.notes = String(req.body.notes || '');
    reminder.updatedAt = now();
    await writeData(req.data);
    res.json({ reminder });
  });
  
  router.delete('/api/client/reminders/:id', requireAuth('client'), requireActiveClient(), async (req, res) => {
    const reminder = (req.data.reminders || []).find(item => item.id === req.params.id && item.clientId === req.user.clientId);
    if (!reminder) return res.status(404).json({ error: 'Reminder not found' });
    req.data.reminders = (req.data.reminders || []).filter(item => item.id !== reminder.id);
    await writeData(req.data);
    res.json({ ok: true });
  });
  
  router.patch('/api/client/leads/:id', requireAuth('client'), requireActiveClient(), async (req, res) => {
    const lead = req.data.leads.find(item => item.id === req.params.id && item.clientId === req.user.clientId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const allowedStatuses = ['new', 'contacted', 'won', 'lost', 'archived'];
    const allowedPriorities = ['hot', 'warm', 'cold'];
    if (allowedStatuses.includes(req.body.status)) lead.status = req.body.status;
    if (allowedPriorities.includes(req.body.priority)) lead.priority = req.body.priority;
    if (typeof req.body.notes === 'string') lead.notes = req.body.notes.slice(0, 1000);
    lead.updatedAt = now();
    addAuditLog(req.data, {
      user: req.user,
      action: 'lead.updated',
      clientId: req.user.clientId,
      target: lead.name || lead.username || lead.telegramUserId || lead.id,
      details: `Lead updated. Status ${lead.status}, priority ${lead.priority || 'hot'}.`
    });
    await writeData(req.data);
    res.json({ lead });
  });
  
  router.delete('/api/client/leads/:id', requireAuth('client'), requireActiveClient(), async (req, res) => {
    const lead = req.data.leads.find(item => item.id === req.params.id && item.clientId === req.user.clientId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    req.data.leads = req.data.leads.filter(item => item.id !== lead.id);
    addAuditLog(req.data, {
      user: req.user,
      action: 'lead.deleted',
      clientId: req.user.clientId,
      target: lead.name || lead.username || lead.telegramUserId || lead.id,
      details: 'Client deleted a lead.'
    });
    await writeData(req.data);
    res.json({ ok: true });
  });
  
  router.get('/api/client/leads/export.csv', requireAuth('client'), (req, res) => {
    const leads = req.data.leads.filter(item => item.clientId === req.user.clientId);
    const headers = [
      'name',
      'username',
      'phone',
      'telegramUserId',
      'telegramChatId',
      'status',
      'priority',
      'score',
      'interests',
      'notes',
      'lastMessage',
      'createdAt',
      'updatedAt'
    ];
    const rows = leads.map(lead => [
      lead.name || '',
      lead.username || '',
      lead.phone || '',
      lead.telegramUserId || '',
      lead.telegramChatId || '',
      lead.status || 'new',
      lead.priority || 'hot',
      lead.score || 0,
      (lead.intents || []).join('; '),
      lead.notes || '',
      lead.lastMessage || lead.summary || '',
      lead.createdAt || '',
      lead.updatedAt || ''
    ]);
    const csv = [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\n');
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="sprintsales-leads-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  });
  
  router.patch('/api/client/unanswered/:id', requireAuth('client'), requireActiveClient(), async (req, res) => {
    const question = (req.data.unansweredQuestions || []).find(item => item.id === req.params.id && item.clientId === req.user.clientId);
    if (!question) return res.status(404).json({ error: 'Question not found' });
    question.status = req.body.status === 'resolved' ? 'resolved' : 'open';
    question.updatedAt = now();
    addAuditLog(req.data, {
      user: req.user,
      action: question.status === 'resolved' ? 'unanswered.resolved' : 'unanswered.reopened',
      clientId: req.user.clientId,
      target: question.suggestedTopic || question.question || question.id,
      details: `Unanswered question marked ${question.status}.`
    });
    await writeData(req.data);
    res.json({ question });
  });
  
  router.post('/api/client/unanswered/:id/add-faq', requireAuth('client'), requireActiveClient(), async (req, res) => {
    const question = (req.data.unansweredQuestions || []).find(item => item.id === req.params.id && item.clientId === req.user.clientId);
    if (!question) return res.status(404).json({ error: 'Question not found' });
    const answer = String(req.body.answer || '').trim();
    if (answer.length < 3) return res.status(400).json({ error: 'Write the approved answer first.' });
    const client = clientFor(req.data, req.user.clientId);
    client.settings.businessProfile ||= defaultSettings().businessProfile;
    const sectionMap = {
      faq: 'faq',
      services: 'services',
      products: 'products',
      pricing: 'pricing',
      timeline: 'timeline',
      contact: 'contact',
      address: 'address',
      delivery: 'delivery',
      paymentInstructions: 'paymentInstructions',
      policies: 'policies',
      mustSay: 'mustSay',
      neverSay: 'neverSay'
    };
    const targetSection = sectionMap[req.body.section] || 'faq';
    const currentFaq = String(client.settings.businessProfile[targetSection] || '').trim();
    const entry = `Q: ${question.question}\nA: ${answer}`;
    client.settings.businessProfile[targetSection] = [currentFaq, entry].filter(Boolean).join('\n\n');
    question.status = 'resolved';
    question.approvedAnswer = answer.slice(0, 1000);
    question.approvedSection = targetSection;
    question.updatedAt = now();
    addAuditLog(req.data, {
      user: req.user,
      action: 'unanswered.added-to-faq',
      clientId: req.user.clientId,
      target: question.suggestedTopic || question.question || question.id,
      details: `Client added an approved answer to ${targetSection} and resolved the unanswered question.`
    });
    await writeData(req.data);
    res.json({ question, client: safeClient(client) });
  });
  
  router.get('/api/client/unanswered/export.csv', requireAuth('client'), (req, res) => {
    const questions = (req.data.unansweredQuestions || []).filter(item => item.clientId === req.user.clientId);
    const headers = ['topic', 'question', 'status', 'count', 'customerName', 'username', 'telegramChatId', 'approvedAnswer', 'approvedSection', 'createdAt', 'lastAskedAt', 'updatedAt'];
    const rows = questions.map(question => [
      question.suggestedTopic || '',
      question.question || '',
      question.status || 'open',
      question.count || 1,
      question.customerName || '',
      question.username || '',
      question.telegramChatId || '',
      question.approvedAnswer || '',
      question.approvedSection || '',
      question.createdAt || '',
      question.lastAskedAt || '',
      question.updatedAt || ''
    ]);
    const csv = [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\n');
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="sprintsales-unanswered-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  });
  
  router.delete('/api/client/unanswered/:id', requireAuth('client'), requireActiveClient(), async (req, res) => {
    const question = (req.data.unansweredQuestions || []).find(item => item.id === req.params.id && item.clientId === req.user.clientId);
    if (!question) return res.status(404).json({ error: 'Question not found' });
    req.data.unansweredQuestions = (req.data.unansweredQuestions || []).filter(item => item.id !== question.id);
    addAuditLog(req.data, {
      user: req.user,
      action: 'unanswered.deleted',
      clientId: req.user.clientId,
      target: question.suggestedTopic || question.question || question.id,
      details: 'Client deleted an unanswered question record.'
    });
    await writeData(req.data);
    res.json({ ok: true });
  });
  
  router.get('/api/client/conversations/:id/messages', requireAuth('client'), (req, res) => {
    const conversation = req.data.conversations.find(item => item.id === req.params.id && item.clientId === req.user.clientId);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    const lead = req.data.leads.find(item => item.conversationId === conversation.id && item.clientId === req.user.clientId) || null;
    res.json({ conversation, lead, messages: req.data.messages.filter(item => item.conversationId === conversation.id) });
  });
  
  router.patch('/api/client/conversations/:id/handoff', requireAuth('client'), requireActiveClient(), async (req, res) => {
    const conversation = req.data.conversations.find(item => item.id === req.params.id && item.clientId === req.user.clientId);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    conversation.handoffMode = req.body.handoffMode === 'human' ? 'human' : 'bot';
    conversation.handoffUpdatedAt = now();
    conversation.handoffNote = String(req.body.note || '').slice(0, 500);
    addAuditLog(req.data, {
      user: req.user,
      action: 'conversation.handoff_updated',
      clientId: req.user.clientId,
      target: conversation.title || conversation.telegramChatId || conversation.id,
      details: `Conversation handoff set to ${conversation.handoffMode}.`
    });
    await writeData(req.data);
    res.json({ conversation });
  });
  
  router.get(/.*/, (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
  
  
  return router;
}
