import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import express from 'express';
import multer from 'multer';
import { Input, Telegraf } from 'telegraf';
import { createTelegramBotRuntime } from './src/bot/telegram-bot.js';
import { createAuthMiddleware } from './src/middleware/auth.js';
import { createAdminRoutes } from './src/routes/admin-routes.js';
import { createMiniappRoutes } from './src/routes/miniapp-routes.js';
import { createPublicRoutes } from './src/routes/public-routes.js';
import { createOrderService } from './src/services/order-service.js';
import { createNotificationService } from './src/services/notification-service.js';
import { createProductService } from './src/services/product-service.js';
import { createAiService } from './src/services/ai-service.js';
import { createSalesService } from './src/services/sales-service.js';
import { createStorageService } from './src/services/storage-service.js';
import { createMetricsService } from './src/services/metrics-service.js';
import { createPublishingService } from './src/services/publishing-service.js';
import { createMatchingService } from './src/services/matching-service.js';
import { createRecommendationService } from './src/services/recommendation-service.js';
import { createIntentRecoveryService } from './src/services/intent-recovery-service.js';
import { createAnnouncementService } from './src/services/announcement-service.js';
import { createPaymentVerificationService } from './src/services/payment-verification-service.js';
import { createWatermarkedProductImage, watermarkedPathForOriginal } from './src/services/product-watermark-service.js';
import { createPlatformStore } from './src/store/platform-store.js';
import {
  categoryContextFromSettings,
  cloneRetailTemplateCategories,
  formatCategoryContextForPrompt,
  validateCategorySelection
} from './src/config/retail-templates.js';
import { websiteThemeForClient } from './src/config/retail-themes.js';
import {
  quotas,
  defaultSettings,
  normalizeBusinessType,
  getDefaultCategories,
  inferBusinessType,
  businessMode,
  isProductBusiness,
  isServiceBusiness,
  businessTypeLabel,
  defaultBilling,
  currentAiUsageMonth,
  normalizeAiUsage
} from './src/config/defaults.js';
import {
  createFetchWithTimeout,
  now,
  uid,
  hashPassword,
  verifyPassword,
  directorySize,
  countFiles,
  latestFile,
  mb,
  pct,
  daysAgoIso,
  numberFromMoney,
  csvEscape
} from './src/utils/helpers.js';

// AI provider services
import { resolveProviderKey, hasAnyAiKey, normalizeProvider } from './src/services/ai/provider-resolver.js';
import { extractOrderDetails } from './src/services/ai/deepseek.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isMainModule = Boolean(process.env.pm_id) ||
  (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href);
const require = createRequire(import.meta.url);
const {
  initProductflow,
  generateProductflowGreeting,
  handleProductflowCallback,
  handleProductflowText,
  handleProductflowContact
} = require('./productflow_router.cjs');
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config();

const port = Number(process.env.PORT || 8080);
const listenHost = process.env.LISTEN_HOST || process.env.HOST || '0.0.0.0';
const sessionSecret = process.env.SESSION_SECRET || 'dev-session-secret-change-me';
const databaseUrl = process.env.DATABASE_URL || '';
const dbSsl = process.env.DATABASE_SSL === 'true' || /supabase\.(co|com)|pooler\.supabase\.com/i.test(databaseUrl);
const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const aiRequestTimeoutMs = Number(process.env.AI_REQUEST_TIMEOUT_MS || 25000);
const MB = 1024 * 1024;
const app = express();
const botRunners = new Map();
const accountRunners = new Map();
const execFileAsync = promisify(execFile);
const fetchWithTimeout = createFetchWithTimeout(aiRequestTimeoutMs);
const billingPlanIsPro = client => String(client?.billing?.plan || client?.subscriptionPlan || client?.settings?.subscriptionPlan || 'basic').toLowerCase() === 'pro';
const allowedDashboardHosts = new Set(
  [
    'automation.sprintsales.net',
    'sprintsalestgautomation.netlify.app',
    process.env.PUBLIC_APP_HOST,
    process.env.PUBLIC_DASHBOARD_HOST,
    process.env.NETLIFY_APP_HOST,
    ...(process.env.ALLOWED_DASHBOARD_HOSTS || '').split(',')
  ]
    .map(item => String(item || '').trim().toLowerCase())
    .filter(Boolean)
);

const requestHostAllowed = (sourceHost, requestHost) => {
  const normalizedSource = String(sourceHost || '').toLowerCase();
  const normalizedRequest = String(requestHost || '').toLowerCase();
  if (!normalizedSource) return false;
  if (normalizedSource === normalizedRequest) return true;
  if (allowedDashboardHosts.has(normalizedSource)) return true;
  return normalizedSource.endsWith('--sprintsalestgautomation.netlify.app');
};

const sameOriginGuard = (req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const source = req.get('origin') || req.get('referer') || '';
  if (!source) return next();
  try {
    const sourceUrl = new URL(source);
    if (!requestHostAllowed(sourceUrl.host, req.get('host'))) {
      return res.status(403).json({ error: 'Cross-site request blocked' });
    }
  } catch {
    return res.status(403).json({ error: 'Invalid request origin' });
  }
  next();
};

const securityHeaders = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
};

const loadGramJs = async () => {
  const [{ Api, TelegramClient }, { StringSession }, { NewMessage }] = await Promise.all([
    import('telegram'),
    import('telegram/sessions/index.js'),
    import('telegram/events/index.js')
  ]);
  return { Api, TelegramClient, StringSession, NewMessage };
};
const store = createPlatformStore({
  rootDir: __dirname,
  databaseUrl,
  dbSsl,
  defaultSettings,
  defaultBilling,
  hashPassword,
  uid,
  now,
  normalizeAiUsage
});
const {
  readData,
  writeData,
  readLocalData,
  ensureCollections,
  ensureDatabase,
  databaseStatus,
  seedData,
  clientFor,
  addAuditLog,
  addBotError,
  recordBotError,
  getPaths
} = store;
const {
  dataDir,
  uploadDir,
  productImageDir,
  telegramMediaDir,
  dataFile,
  backupDir,
  jsonBackupDir,
  fullBackupDir,
  publicDir
} = getPaths();

app.use(securityHeaders);
app.use(sameOriginGuard);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser(sessionSecret));
app.use(express.static(publicDir, {
  index: false,
  setHeaders(res, servedPath) {
    const name = path.basename(servedPath);
    if (name === 'index.html' || name === 'dashboard.js') {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));
app.use('/uploads/products', express.static(productImageDir));

const recordBotEvent = (data, client, type, message, severity = 'info') => {
  addBotError(data, {
    clientId: client?.id || '',
    businessName: client?.businessName || '',
    type,
    message,
    severity
  });
};


const {
  sendAdminAlert,
  sendClientNotification,
  sendPlatformAdminBotMessage,
  startPlatformAdminBot
} = createNotificationService({
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
});

const {
  signedSession,
  makeSession,
  parseSession,
  requireAuth,
  requireProductBusiness,
  clientCanAct,
  requireActiveClient
} = createAuthMiddleware({
  sessionSecret,
  readData,
  clientFor,
  isProductBusiness
});

const {
  storage,
  upload,
  productUpload,
  cleanupUploadedFiles,
  extractText,
  downloadTelegramFile
} = createStorageService({
  multer,
  path,
  fs,
  crypto,
  fetchWithTimeout,
  uploadDir,
  productImageDir,
  telegramMediaDir,
  quotas,
  MB
});

const {
  orderQuantity,
  orderUnitPrice,
  orderLineTotal,
  orderRevenue,
  orderCost,
  orderGuardrails,
  orderPayload
} = createOrderService({ numberFromMoney });


const effectiveAi = settings => {
  normalizeAiUsage(settings);
  const adminManaged = settings.aiKeyMode === 'admin' && Boolean(settings.adminAiApiKey);
  const provider = adminManaged ? settings.adminAiProvider : settings.aiProvider;
  return {
    provider: normalizeProvider(provider || 'deepseek'),
    apiKey: adminManaged ? settings.adminAiApiKey : settings.aiApiKey,
    mode: adminManaged ? 'admin' : 'client'
  };
};

const legacyClientAiKeyConfigured = settings => Boolean(
  settings?.deepseekKey ||
  settings?.geminiKey ||
  settings?.openaiKey ||
  settings?.grokKey ||
  settings?.anthropicKey
);

const legacyAdminAiKeyConfigured = settings => Boolean(
  settings?.adminDeepseekKey ||
  settings?.adminGeminiKey ||
  settings?.adminOpenaiKey ||
  settings?.adminGrokKey ||
  settings?.adminAnthropicKey
);

const aiUsageStatus = settings => {
  normalizeAiUsage(settings);
  const limit = Number(settings.aiMonthlyReplyLimit || 0);
  const used = Number(settings.aiRepliesThisMonth || 0);
  return {
    month: settings.aiUsageMonth,
    used,
    limit,
    remaining: limit > 0 ? Math.max(0, limit - used) : null,
    percent: limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0,
    limitReached: limit > 0 && used >= limit
  };
};

const trackManagedAiReply = settings => {
  const ai = effectiveAi(settings);
  if (ai.mode !== 'admin') return;
  normalizeAiUsage(settings);
  settings.aiRepliesThisMonth = Number(settings.aiRepliesThisMonth || 0) + 1;
};

const {
  clientStorageStats,
  storageReport,
  systemStatus,
  serviceAllowsAutomation,
  automationBlockReason,
  botDebugReason,
  goLiveStatusForClient,
  clientActivity,
  botDebugForClient,
  previewStatsForClient,
  customerRecords,
  customerMatches,
  customerNoteRecord,
  customerConversation,
  customerTimeline,
  clientAnalytics,
  readinessForClient,
  clientHealthWarnings,
  clientQualityScore,
  clientQualityEvents
} = createMetricsService({
  path,
  uploadDir,
  productImageDir,
  backupDir,
  dataDir,
  dataFile,
  jsonBackupDir,
  fullBackupDir,
  quotas,
  directorySize,
  countFiles,
  latestFile,
  mb,
  pct,
  daysAgoIso,
  now,
  databaseStatus,
  botRunners,
  accountRunners,
  effectiveAi,
  aiUsageStatus,
  orderRevenue,
  orderCost,
  isProductBusiness,
  isServiceBusiness
});

const safeClient = client => {
  const websiteTheme = websiteThemeForClient(client);
  return ({
  id: client.id,
  identity: {
    clientId: client.identity?.clientId || client.id,
    createdAt: client.identity?.createdAt || client.createdAt || '',
    originalBusinessName: client.identity?.originalBusinessName || client.businessName || '',
    originalOwnerName: client.identity?.originalOwnerName || client.ownerName || '',
    originalPhone: client.identity?.originalPhone || client.phone || '',
    originalEmail: client.identity?.originalEmail || client.email || ''
  },
  businessName: client.businessName,
  ownerName: client.ownerName || '',
  phone: client.phone || '',
  email: client.email || '',
  status: client.status,
  approvalRequestedAt: client.approvalRequestedAt || '',
  approvalRequestNote: client.approvalRequestNote || '',
  businessTypeLabel: businessTypeLabel(client),
  billing: {
    ...defaultBilling(),
    ...(client.billing || {})
  },
  createdAt: client.createdAt,
  settings: {
    ...client.settings,
    miniapp: {
      ...defaultSettings().miniapp,
      ...(client.settings.miniapp || {}),
      themeColor: websiteTheme.themeColor,
      accentColor: websiteTheme.accentColor,
      themeCustomized: websiteTheme.themeCustomized,
      recommendedTheme: websiteTheme.recommendedTheme
    },
    botToken: client.settings.botToken ? 'configured' : '',
    aiProvider: normalizeProvider(client.settings.aiProvider || 'deepseek'),
    adminAiProvider: normalizeProvider(client.settings.adminAiProvider || 'deepseek'),
    aiApiKey: (client.settings.aiApiKey || legacyClientAiKeyConfigured(client.settings)) ? 'configured' : '',
    adminAiApiKey: (client.settings.adminAiApiKey || legacyAdminAiKeyConfigured(client.settings)) ? 'configured' : '',
    deepseekKey: '',
    geminiKey: '',
    openaiKey: '',
    grokKey: '',
    anthropicKey: '',
    adminDeepseekKey: '',
    adminGeminiKey: '',
    adminOpenaiKey: '',
    adminGrokKey: '',
    adminAnthropicKey: '',
    accountApiHash: client.settings.accountApiHash ? 'configured' : '',
    accountSessionString: client.settings.accountSessionString ? 'configured' : '',
    accountPhoneCodeHash: client.settings.accountPhoneCodeHash ? 'configured' : '',
    aiUsage: aiUsageStatus(client.settings),
    paymentVerification: paymentVerificationService?.publicStatus?.(client) || {
      mode: client.settings.paymentVerificationMode || 'manual',
      automaticAvailable: false,
      apiConfigured: false,
      requiresPro: true
    },
    delivery: {
      ...defaultSettings().delivery,
      ...(client.settings.delivery || {})
    }
  }
  });
};


const getConversation = (data, clientId, telegramChatId) => {
  let conversation = data.conversations.find(item =>
    item.clientId === clientId && item.telegramChatId === String(telegramChatId)
  );
  if (!conversation) {
    conversation = {
      id: uid('conv'),
      clientId,
      telegramChatId: String(telegramChatId),
      title: `Telegram chat ${telegramChatId}`,
      leadScore: 0,
      salesStage: 'new',
      salesStageUpdatedAt: now(),
      salesStageHistory: [{ stage: 'new', at: now() }],
      summary: null,
      messageCount: 0,
      createdAt: now(),
      updatedAt: now()
    };
    data.conversations.push(conversation);
  }
  // Clear any stale order/booking state if conversation was idle > 30 min
  if (clearStaleConversationState(conversation)) {
    cancelStaleOrdersForConversation(data, conversation);
  }
  return conversation;
};

// === CONVERSATION STALENESS (prevents old orders/contexts from leaking) ===
const conversationStaleMinutes = 30; // 30 minutes — orders/bookings older than this are auto-cancelled
const clearStaleConversationState = conversation => {
  if (!conversation) return false;
  const lastActivity = conversation.updatedAt || conversation.createdAt || '';
  if (!lastActivity) return false;
  const minutesSinceActivity = (Date.now() - new Date(lastActivity).getTime()) / 60000;
  if (minutesSinceActivity > conversationStaleMinutes) {
    const wasStale = conversation.orderStage || conversation.lastOrderId || conversation.lastBookingId || conversation.stage;
    conversation.orderStage = '';
    conversation.lastOrderId = '';
    conversation.lastOrderProductId = '';
    conversation.lastBookingId = '';
    conversation.stage = '';
    conversation.salesStage = 'new';
    conversation.pendingReplyToken = '';
    if (wasStale) conversation.staleClearedAt = now();
    return true;
  }
  return false;
};

// Cancel any draft/confirmed orders linked to a stale conversation
const cancelStaleOrdersForConversation = (data, conversation) => {
  if (!data?.orders?.length || !conversation) return;
  const staleOrders = data.orders.filter(
    order => order.conversationId === conversation.id && ['draft', 'confirmed'].includes(order.status || '')
  );
  for (const order of staleOrders) {
    order.status = 'cancelled';
    order.cancelledReason = 'Stale conversation — customer inactive > 30 minutes';
    order.updatedAt = now();
  }
  if (staleOrders.length) console.log(`Cancelled ${staleOrders.length} stale orders for conversation ${conversation.id}`);
};

const orderStages = new Set(['ordering', 'waiting_for_size', 'waiting_for_color', 'waiting_for_phone', 'waiting_for_delivery']);

const setConversationStage = (conversation, stage, meta = {}) => {
  if (!conversation || !stage) return;
  conversation.stage = stage;
  conversation.stageUpdatedAt = now();
  conversation.stageMeta = {
    ...(conversation.stageMeta || {}),
    ...Object.fromEntries(Object.entries(meta).filter(([, value]) => value !== undefined && value !== null && value !== ''))
  };
};

const orderStageFromOrder = order => {
  const missing = order?.missingDetails || [];
  if (missing.includes('size')) return 'waiting_for_size';
  if (missing.includes('color')) return 'waiting_for_color';
  if (missing.includes('phone')) return 'waiting_for_phone';
  if (missing.includes('delivery location')) return 'waiting_for_delivery';
  return order ? 'ordering' : 'viewing_product';
};

const applyConversationStage = (conversation, route, { product, order } = {}) => {
  if (!conversation || !route?.route) return;
  if (route.route === 'product_search' || route.route === 'product_samples' || route.route === 'product_samples_done') {
    setConversationStage(conversation, 'browsing_products', { lastRoute: route.route });
    return;
  }
  if (route.route === 'product_detail' && product) {
    setConversationStage(conversation, 'viewing_product', { productId: product.id, lastRoute: route.route });
    return;
  }
  if (route.route === 'order_flow') {
    setConversationStage(conversation, orderStageFromOrder(order), { productId: product?.id, orderId: order?.id, lastRoute: route.route });
    return;
  }
  if (route.route === 'service_question') {
    setConversationStage(conversation, 'service_consultation', { lastRoute: route.route });
    return;
  }
  if (route.route === 'contact_info') {
    setConversationStage(conversation, 'contact_request', { lastRoute: route.route });
  }
};


const businessProfileText = settings => {
  const profile = settings.businessProfile || {};
  return [
    ['Priority source - Business summary', profile.summary],
    ['Priority source - Business reference knowledge', profile.referenceKnowledge],
    ['Priority source - Basic services', profile.services],
    ['Priority source - Basic products', profile.products],
    ['Priority source - Pricing and packages', profile.pricing],
    ['Priority source - Project timeline', profile.timeline],
    ['Priority source - Contact information', profile.contact],
    ['Priority source - Address and service area', profile.address],
    ['Priority source - Delivery and shipping', profile.delivery],
    ['Priority source - Payment instructions', profile.paymentInstructions],
    ['Priority source - Policies, guarantees, and rules', profile.policies],
    ['Priority source - Frequently asked questions', profile.faq],
    ['Priority source - The assistant must say', profile.mustSay],
    ['Priority source - The assistant must never say', profile.neverSay]
  ]
    .filter(([, value]) => String(value || '').trim())
    .map(([label, value]) => `${label}:\n${value}`)
    .join('\n\n');
};

const activeProductText = (data, clientId) => {
  return (data.products || [])
    .filter(product => product.clientId === clientId && product.isActive !== false)
    .map(product => [
      `Product code: ${product.code}`,
      `Product name: ${product.name}`,
      product.price ? `Price: ${product.price}` : '',
      product.sellingPrice ? `Selling price: ${product.sellingPrice}` : '',
      product.costPrice ? `Cost price: ${product.costPrice}` : '',
      Number.isFinite(Number(product.stockQuantity)) ? `Stock quantity: ${Number(product.stockQuantity)}` : '',
      Number.isFinite(Number(product.lowStockThreshold)) ? `Low stock threshold: ${Number(product.lowStockThreshold)}` : '',
      product.sizes ? `Sizes: ${product.sizes}` : '',
      product.colors ? `Colors: ${product.colors}` : '',
      product.variantNote ? `Variant note: ${product.variantNote}` : '',
      product.stockNote ? `Stock note: ${product.stockNote}` : '',
      product.material ? `Material: ${product.material}` : '',
      product.availability ? `Availability: ${product.availability}` : '',
      product.imageDescription ? `Image description: ${product.imageDescription}` : '',
      product.description ? `Description: ${product.description}` : '',
      product.notes ? `Notes: ${product.notes}` : ''
    ].filter(Boolean).join('\n'))
    .join('\n\n');
};

const {
  productStock,
  productLowStockThreshold,
  productAvailability,
  productPrice,
  broadProductAvailabilityIntent,
  productSearchTerms,
  genericProductWords,
  productWordVariants,
  productCategoryQuery,
  activeClientProducts,
  getPopulatedCategories,
  selectedChoiceLabel,
  findProductCategoryMatches,
  productCategoryLabel,
  findProductMention,
  findExactProductCode,
  productFromTelegramReply,
  productPostingSettings
} = createProductService({
  clientFor,
  isProductBusiness,
  defaultSettings
});

const paymentVerificationService = createPaymentVerificationService({
  fetchWithTimeout,
  now,
  isProClient: billingPlanIsPro
});

const {
  orderStatusCustomerMessage,
  bookingStatusCustomerMessage,
  productImageIntent,
  paymentProofEvidence,
  paymentEvidenceScore,
  productEvidenceScore,
  recentIsoWithin,
  shouldTreatImageAsPaymentProof,
  tokenizeSearch,
  productVisualMatchScore,
  findProductByImageDescription,
  activeKnowledgeText,
  missingKnowledgeReply,
  isMissingKnowledgeReply,
  helpfulMissingReply,
  missingTopic,
  recordUnansweredQuestion,
  extractSensitiveFacts,
  detectHotLead,
  detectLeadIntents,
  detectLeadSource,
  leadSourceIntent,
  orderIntent,
  productOrderStartIntent,
  orderDetailIntent,
  orderAnswerIntent,
  orderDetailsClarificationIntent,
  businessFitIntent,
  realProductOrderIntent,
  serviceCloseIntent,
  serviceClarificationIntent,
  bookingDetailAnswerIntent,
  contactInfoRequestIntent,
  shouldContinueServiceBooking,
  serviceBookingIntent,
  serviceTopicIntent,
  hasQuantitySignal,
  extractChoice,
  cleanLocationHint,
  extractLocation,
  isAddisAbabaLocation,
  extractDateTimeHint,
  extractQuantity,
  extractPhoneNumber,
  extractBudgetHint,
  extractServiceSummary,
  serviceLabel,
  missingOrderQuestion,
  orderDetailsChecklist,
  orderProgressReply,
  orderStartReply,
  deliveryAreaStatus,
  deliveryFollowUpReply,
  businessDeliveryReply,
  businessContactReply,
  orderNextAction,
  asksPayment,
  orderConfirmationReply,
  paymentInstructionsReply,
  parsePaymentSms,
  paymentMatchSummary,
  likelyOrderForProof,
  upsertServiceBooking,
  bookingQuestion,
  serviceSalesReply,
  bookingNextAction,
  activeServiceBooking,
  bookingFlowActive,
  notifyServiceBooking,
  recordPaymentProof,
  telegramCustomer,
  extractCustomerNameFromText,
  leadCustomerLabel,
  notifyHotLead,
  notifyDraftOrder,
  notifyLowStock,
  upsertHotLead,
  customerFromConversation,
  activeConversationOrder,
  productFromOrder,
  orderFlowActive,
  conversationProductForMessage,
  upsertDraftOrder,
  findConversationProduct,
  asksAboutCurrentProduct,
  productCommercialDetailIntent,
  shortProductDealFollowUp,
  shouldUseRememberedProduct,
  findRecentProductFromMessages,
  productQuestionType,
  classifyCustomerMessage,
  routeCustomerIntent,
  routeNeedsProductContext,
  routeFallbackReply,
  validateRoutedReply,
  recoverConversationContext,
  productReplyText,
  productCatalogReply,
  productChoiceReply,
  productSampleIntent,
  productGalleryMoreIntent,
  productGalleryRequestIntent,
  productBrowseConfirmationIntent,
  rememberProductChoices,
  productChoicesFromMemory,
  productSampleReply,
  productSamplesDoneReply,
  advanceProductGallery,
  packageQuestionIntent,
  textToKeywordSet,
  sourceBlocks,
  businessBrainText,
  servicePackageReply,
  humanList,
  serviceCapabilityReply,
  salesObjectionIntent,
  salesObjectionReply,
  serviceFollowUpReply,
  safeFallbackReply,
  leadSourceReply,
  prepareCustomerReply,
  formatFollowUpMessage,
  shouldSendFollowUp,
  sendDueFollowUps,
  salesStages,
  classifySalesStage,
  updateSalesStage,
  salesStageLabel,
  updateConversationSummary,
  extractTopic,
  extractInterests
} = createSalesService({
  uid,
  now,
  defaultSettings,
  readData,
  writeData,
  botRunners,
  sendClientNotification,
  sendAdminAlert,
  numberFromMoney,
  orderRevenue,
  orderLineTotal,
  productPrice,
  productStock,
  productLowStockThreshold,
  isServiceBusiness,
  isProductBusiness,
  businessMode,
  productAvailability,
  productCategoryLabel,
  activeClientProducts,
  findExactProductCode,
  findProductMention,
  findProductCategoryMatches,
  resolveProviderKey,
  extractOrderDetails,
  paymentVerificationService,
  clientQualityScore,
  clientQualityEvents
});

const {
  analyzeProductImage,
  describeProductImage,
  generateProductCaption,
  fallbackProductCaption,
  describeCustomerImage,
  transcribeVoiceMessage,
  buildReply
} = createAiService({
  fs,
  fetchWithTimeout,
  geminiModel,
  effectiveAi,
  productPrice,
  productAvailability,
  productPostingSettings,
  businessProfileText,
  businessBrainText,
  activeKnowledgeText,
  activeProductText,
  isServiceBusiness,
  isProductBusiness,
  serviceTopicIntent,
  aiUsageStatus,
  sendAdminAlert,
  sendClientNotification,
  trackManagedAiReply,
  addBotError,
  missingKnowledgeReply,
  isMissingKnowledgeReply,
  salesStageLabel
});


const {
  createProductPost,
  sendProductPost,
  sendCustomerTelegramMessage,
  renewalAlertStage,
  sendRenewalAlerts
} = createPublishingService({
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
});

const {
  isProClient,
  findCheckoutMatch
} = createMatchingService({
  productPrice
});

const {
  sendDueRecommendations
} = createRecommendationService({
  Telegraf,
  botRunners,
  readData,
  writeData,
  ensureCollections,
  clientFor,
  now,
  uid,
  productPrice,
  isProductBusiness
});

const {
  sendDueIntentRecoveries
} = createIntentRecoveryService({
  Telegraf,
  botRunners,
  readData,
  writeData,
  ensureCollections,
  now,
  uid,
  productPrice,
  isProductBusiness
});

const {
  createCampaign,
  sendCampaign,
  sendDueCampaignWaves,
  buildAudience: buildCampaignAudience,
  campaignQuotaStatus,
  ensureCampaignCollections
} = createAnnouncementService({
  Telegraf,
  botRunners,
  now,
  uid,
  productPrice,
  isProductBusiness
});


const {
  stopBot,
  sendTelegramReply,
  gramCustomer,
  sendAccountReply,
  startAccount,
  startBot,
  syncBots
} = createTelegramBotRuntime({
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
  describeCustomerImage,
  findProductByImageDescription,
  shouldTreatImageAsPaymentProof,
  recordPaymentProof,
  paymentVerificationService,
  sendClientNotification,
  transcribeVoiceMessage,
  orderIntent,
  extractCustomerNameFromText,
  sendAdminAlert,
  addAuditLog
});

const routeDeps = {
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
    clientQualityEvents,
    clientStorageStats,
    createProductPost,
    createCampaign,
    createWatermarkedProductImage,
    categoryContextFromSettings,
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
    cloneRetailTemplateCategories,
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
    normalizeProvider,
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
    paymentVerificationService,
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
    sendProductPost,
    buildCampaignAudience,
    campaignQuotaStatus,
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
};
app.use('/api', createAdminRoutes(routeDeps));
app.use('/', createMiniappRoutes(routeDeps));
app.use('/', createPublicRoutes(routeDeps));

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: error.message || 'Upload failed.' });
  }
  if (/Unsupported upload type/i.test(error?.message || '')) {
    return res.status(400).json({ error: error.message });
  }
  console.error('Request failed:', error);
  res.status(500).json({ error: 'Request failed. Please try again.' });
});

process.once('SIGINT', async () => {
  await Promise.all([...new Set([...botRunners.keys(), ...accountRunners.keys()])].map(stopBot));
  process.exit(0);
});

export const __test = {
  classifyCustomerMessage,
  routeCustomerIntent,
  applyConversationStage,
  setConversationStage,
  productQuestionType,
  productChoiceReply,
  productSampleReply,
  findProductCategoryMatches,
  findExactProductCode,
  activeClientProducts,
  orderStartReply,
  businessDeliveryReply,
  businessContactReply,
  upsertDraftOrder,
  activeConversationOrder,
  orderProgressReply,
  productReplyText,
  isAddisAbabaLocation,
  extractLocation,
  orderDetailsChecklist,
  missingOrderQuestion,
  orderDetailsClarificationIntent,
  cleanLocationHint,
  safeClient
};

initProductflow({
  sendClientNotification,
  sendPlatformAdminBotMessage,
  getBot: clientId => botRunners.get(clientId),
  isProClient,
  findCheckoutMatch,
  paymentVerificationService
});

const processAlertMessage = (label, error) => {
  const message = error?.stack || error?.message || String(error || 'Unknown process error');
  return `${label}: ${message}`.slice(0, 3500);
};

const notifyProcessProblem = (key, label, error) => {
  recordBotError(null, {
    type: key,
    message: processAlertMessage(label, error),
    severity: 'error'
  }).catch(() => null);
  sendAdminAlert(null, key, processAlertMessage(label, error), 0).catch(() => null);
};

process.on('unhandledRejection', reason => {
  notifyProcessProblem('process-unhandled-rejection', 'Unhandled promise rejection', reason);
});

process.on('uncaughtExceptionMonitor', error => {
  notifyProcessProblem('process-uncaught-exception', 'Uncaught exception', error);
});

if (isMainModule && process.env.NODE_ENV !== 'test') app.listen(port, listenHost, () => {
  console.log(`Telegram automation dashboard running on http://${listenHost}:${port}`);
  readData()
    .then(async data => {
      await startPlatformAdminBot().catch(error => console.warn('SprintSales Admin bot listener failed:', error.message));
      await sendAdminAlert(data, 'app-started', `App started. Active bots: ${botRunners.size}`, 15);
      await sendRenewalAlerts();
      await sendDueRecommendations();
      await sendDueIntentRecoveries();
      await sendDueCampaignWaves({ data, clientsById: id => clientFor(data, id), writeData });
    })
    .catch(() => null);
  syncBots().catch(error => {
    console.error('Bot sync failed:', error);
    recordBotError(null, {
      type: 'bot-sync',
      message: `Bot sync failed: ${error.message}`,
      severity: 'error'
    }).catch(() => null);
    sendAdminAlert(null, 'bot-sync-failed', `Bot sync failed: ${error.message}`, 15).catch(() => null);
  });
  setInterval(() => {
    sendDueFollowUps().catch(error => {
      console.error('Follow-up scheduler failed:', error.message);
      recordBotError(null, {
        type: 'follow-up-scheduler',
        message: `Follow-up scheduler failed: ${error.message}`,
        severity: 'error'
      }).catch(() => null);
      sendAdminAlert(null, 'follow-up-scheduler-failed', `Follow-up scheduler failed: ${error.message}`, 30).catch(() => null);
    });
  }, 5 * 60 * 1000);
  setInterval(() => {
    sendRenewalAlerts().catch(error => {
      console.error('Renewal alert scheduler failed:', error.message);
      recordBotError(null, {
        type: 'renewal-scheduler',
        message: `Renewal alert scheduler failed: ${error.message}`,
        severity: 'error'
      }).catch(() => null);
      sendAdminAlert(null, 'renewal-scheduler-failed', `Renewal alert scheduler failed: ${error.message}`, 30).catch(() => null);
    });
  }, 6 * 60 * 60 * 1000);
  setInterval(() => {
    sendDueRecommendations().catch(error => {
      console.error('Recommendation scheduler failed:', error.message);
      recordBotError(null, {
        type: 'recommendation-scheduler',
        message: `Recommendation scheduler failed: ${error.message}`,
        severity: 'error'
      }).catch(() => null);
      sendAdminAlert(null, 'recommendation-scheduler-failed', `Recommendation scheduler failed: ${error.message}`, 30).catch(() => null);
    });
  }, 6 * 60 * 60 * 1000);
  setInterval(() => {
    sendDueIntentRecoveries().catch(error => {
      console.error('Intent recovery scheduler failed:', error.message);
      recordBotError(null, {
        type: 'intent-recovery-scheduler',
        message: `Intent recovery scheduler failed: ${error.message}`,
        severity: 'error'
      }).catch(() => null);
      sendAdminAlert(null, 'intent-recovery-scheduler-failed', `Intent recovery scheduler failed: ${error.message}`, 30).catch(() => null);
    });
  }, 30 * 60 * 1000);
  setInterval(() => {
    readData()
      .then(data => sendDueCampaignWaves({ data, clientsById: id => clientFor(data, id), writeData }))
      .catch(error => {
        console.error('Campaign wave scheduler failed:', error.message);
        recordBotError(null, {
          type: 'campaign-wave-scheduler',
          message: `Campaign wave scheduler failed: ${error.message}`,
          severity: 'error'
        }).catch(() => null);
        sendAdminAlert(null, 'campaign-wave-scheduler-failed', `Campaign wave scheduler failed: ${error.message}`, 30).catch(() => null);
      });
  }, 60 * 60 * 1000);
});
