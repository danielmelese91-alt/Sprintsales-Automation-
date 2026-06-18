import path from 'node:path';

export const createAiService = (deps = {}) => {
  const {
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
  } = deps;

const mediaApiKey = (settings, kind = 'vision') => {
  const direct = kind === 'voice' ? settings.voiceApiKey : settings.visionApiKey;
  if (direct) return direct;
  if (kind === 'voice' && settings.visionApiKey) return settings.visionApiKey;
  if ((settings.aiProvider || '').toLowerCase() === 'gemini' && settings.aiApiKey) return settings.aiApiKey;
  if ((settings.adminAiProvider || '').toLowerCase() === 'gemini' && settings.adminAiApiKey) return settings.adminAiApiKey;
  return '';
};

const mimeFromPath = filePath => {
  const ext = path.extname(filePath || '').toLowerCase();
  if (['.jpg', '.jpeg'].includes(ext)) return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.oga' || ext === '.ogg') return 'audio/ogg';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.m4a') return 'audio/mp4';
  return 'application/octet-stream';
};

const askGeminiMedia = async ({ apiKey, filePath, mimeType, prompt }) => {
  if (!apiKey || !filePath) return '';
  const bytes = await fs.readFile(filePath);
  const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inlineData: { mimeType: mimeType || mimeFromPath(filePath), data: bytes.toString('base64') } }
        ]
      }]
    })
  });
  if (!response.ok) throw new Error(`Gemini media request failed: ${response.status}`);
  const json = await response.json();
  return json.candidates?.[0]?.content?.parts?.map(part => part.text).join('\n').trim() || '';
};

const productSeedDescription = product => [
  product.code,
  product.name,
  product.colors,
  product.sizes,
  product.material,
  product.variantNote,
  product.description,
  product.notes
].filter(Boolean).join(' ');

const defaultProductImageAnalysis = (product = {}) => ({
  detailedSearchDescription: '',
  salesPostCaption: '',
  selectedCategory: product.category || null,
  selectedSubcategory: product.subcategory || null,
  productAttributes: {}
});

const normalizeProductImageAnalysis = (value, product = {}) => {
  const fallback = defaultProductImageAnalysis(product);
  const fallbackAttrs = fallback.productAttributes || {};
  const fallbackMaterial = fallbackAttrs.materialGuess || {};
  const source = value && typeof value === 'object' ? value : {};
  const attrs = source.productAttributes && typeof source.productAttributes === 'object' ? source.productAttributes : {};
  const material = attrs.materialGuess && typeof attrs.materialGuess === 'object' ? attrs.materialGuess : {};
  return {
    detailedSearchDescription: String(source.detailedSearchDescription || fallback.detailedSearchDescription || '').slice(0, 3500),
    salesPostCaption: String(source.salesPostCaption || '').trim().slice(0, 1000),
    selectedCategory: source.selectedCategory == null && !attrs.category ? null : String(source.selectedCategory || attrs.category || '').trim().slice(0, 120),
    selectedSubcategory: source.selectedSubcategory == null && !attrs.subcategory ? null : String(source.selectedSubcategory || attrs.subcategory || '').trim().slice(0, 120),
    productAttributes: {
      category: String(attrs.category || fallbackAttrs.category || '').slice(0, 80),
      productType: String(attrs.productType || fallbackAttrs.productType || '').slice(0, 120),
      mainColors: Array.isArray(attrs.mainColors) ? attrs.mainColors.map(String).slice(0, 8) : (fallbackAttrs.mainColors || []),
      secondaryColors: Array.isArray(attrs.secondaryColors) ? attrs.secondaryColors.map(String).slice(0, 8) : [],
      style: String(attrs.style || '').slice(0, 120),
      genderTarget: String(attrs.genderTarget || '').slice(0, 80),
      materialGuess: {
        value: String(material.value || fallbackMaterial.value || '').slice(0, 160),
        certainty: ['certain', 'uncertain'].includes(material.certainty) ? material.certainty : (material.value ? 'uncertain' : '')
      },
      pattern: String(attrs.pattern || '').slice(0, 120),
      visibleText: Array.isArray(attrs.visibleText) ? attrs.visibleText.map(String).slice(0, 12) : [],
      confidenceScore: Math.max(0, Math.min(1, Number(attrs.confidenceScore || 0)))
    }
  };
};

const parseJsonObject = raw => {
  const text = String(raw || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  }
};

const analyzeProductImage = async (client, product, options = {}) => {
  return defaultProductImageAnalysis(product);
};

const describeProductImage = async (client, product) => {
  return '';
};

const productMarketingFacts = product => [
  product.code ? `Code: ${product.code}` : '',
  product.name ? `Name: ${product.name}` : '',
  productPrice(product) ? `Price: ${productPrice(product)}` : '',
  product.sizes ? `Sizes: ${product.sizes}` : '',
  product.colors ? `Colors: ${product.colors}` : '',
  product.material ? `Material: ${product.material}` : '',
  product.variantNote ? `Variant note: ${product.variantNote}` : '',
  product.stockNote ? `Stock note: ${product.stockNote}` : '',
  productAvailability(product) ? `Availability: ${productAvailability(product)}` : '',
  product.description ? `Description: ${product.description}` : '',
  product.notes ? `Notes: ${product.notes}` : ''
].filter(Boolean).join('\n');

const normalizeBotAddress = client => {
  const settings = client?.settings || {};
  const raw = String(settings.botUsername || settings.accountUsername || settings.telegramBotUsername || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `@${raw.replace(/^@+/, '').replace(/[^\w_]/g, '')}`;
};

const botOrderInstruction = (client, product) => {
  const botAddress = normalizeBotAddress(client);
  const code = String(product?.code || '').trim();
  if (botAddress && code) return `To order, open ${botAddress} and send product code ${code}, or browse products from the bot menu.`;
  if (botAddress) return `To order, open ${botAddress} and browse products from the bot menu.`;
  if (code) return `To order, send product code ${code} to our Telegram bot, or browse products from the bot menu.`;
  return 'To order, open our Telegram bot and browse products from the menu.';
};

const withBotOrderInstruction = (caption, client, product, posting) => {
  const text = String(caption || '').trim();
  if (!posting.includeOrderInstruction) return text.slice(0, 1000);
  const instruction = botOrderInstruction(client, product);
  if (!instruction) return text.slice(0, 1000);
  const botAddress = normalizeBotAddress(client);
  const code = String(product?.code || '').trim();
  const alreadyMentionsBot = botAddress && text.toLowerCase().includes(botAddress.toLowerCase());
  const alreadyMentionsCode = code && text.toLowerCase().includes(code.toLowerCase());
  if (alreadyMentionsBot && (!code || alreadyMentionsCode)) return text.slice(0, 1000);
  return [text, instruction].filter(Boolean).join('\n\n').slice(0, 1000);
};

const fallbackProductCaption = (client, product, posting = productPostingSettings(client.settings)) => {
  const discountFacts = productDiscountFacts(client, product);
  const lines = [
    product.name || product.code,
    posting.includePrice && productPrice(product) ? `Price: ${productPrice(product)}` : '',
    discountFacts.publicLine,
    posting.includeSizesColors && product.sizes ? `Sizes: ${product.sizes}` : '',
    posting.includeSizesColors && product.colors ? `Colors: ${product.colors}` : '',
    posting.includeMaterial && product.material ? `Material: ${product.material}` : '',
    posting.includeAvailability && productAvailability(product) ? `Availability: ${productAvailability(product)}` : '',
    product.description ? product.description : '',
    posting.includeOrderInstruction ? botOrderInstruction(client, product) : '',
    posting.includeHashtags ? `#${String(client.businessName || 'Sprintsales').replace(/[^\p{L}\p{N}]+/gu, '')} #${String(product.name || 'Product').replace(/[^\p{L}\p{N}]+/gu, '')}` : ''
  ].filter(Boolean);
  return lines.join('\n').slice(0, 1000);
};

const productDiscountFacts = (client, product) => {
  if (product?.excludeFromDiscounts === true) return { lines: '', publicLine: '' };
  const discounts = client?.settings?.discounts || {};
  const productRules = product?.discounts || {};
  const active = [];
  if (discounts.newBuyer?.enabled && productRules.newBuyer !== false && Number(discounts.newBuyer.value || 0) > 0) active.push(`New buyer discount: ${Number(discounts.newBuyer.value)}% off`);
  if (discounts.repeatBuyer?.enabled && productRules.repeatBuyer !== false && Number(discounts.repeatBuyer.value || 0) > 0) active.push(`Loyal customer discount: ${Number(discounts.repeatBuyer.value)}% off`);
  if (discounts.birthdayWeek?.enabled && productRules.birthdayWeek !== false && Number(discounts.birthdayWeek.value || 0) > 0) active.push(`Birthday week discount: ${Number(discounts.birthdayWeek.value)}% off for eligible customers`);
  if (discounts.sales?.enabled && productRules.sales !== false && Number(discounts.sales.value || 0) > 0) active.push(`Sales discount: ${Number(discounts.sales.value)}% off`);
  if (discounts.holiday?.enabled && productRules.holiday !== false && Number(discounts.holiday.value || 0) > 0) active.push(`Holiday discount: ${Number(discounts.holiday.value)}% off`);
  const codes = (Array.isArray(discounts.codes) ? discounts.codes : []).filter(code => code?.enabled !== false && productRules.promoCodes !== false && Number(code?.value || 0) > 0).slice(0, 2);
  codes.forEach(code => active.push(`Promo code ${String(code.code || '').toUpperCase()}: ${Number(code.value)}% off`));
  return {
    lines: active.length ? active.join('\n') : '',
    publicLine: active.length ? active[0] : ''
  };
};

const generateProductCaption = async (data, client, product, overrides = {}) => {
  const posting = { ...productPostingSettings(client.settings), ...overrides };
  const discountFacts = productDiscountFacts(client, product);
  if (!discountFacts.lines && !overrides.forceRegenerate && product?.salesPostCaption) return withBotOrderInstruction(product.salesPostCaption, client, product, posting);
  if (!discountFacts.lines && !overrides.forceRegenerate && product?.imageAnalysis?.salesPostCaption) return withBotOrderInstruction(product.imageAnalysis.salesPostCaption, client, product, posting);
  const ai = effectiveAi(client.settings || {});
  const fallback = fallbackProductCaption(client, product, posting);
  if (!ai.apiKey) return fallback;
  const includeRules = [
    posting.includePrice ? 'include saved price if available' : 'do not include price',
    posting.includeSizesColors ? 'include saved sizes/colors if available' : 'do not include sizes/colors',
    posting.includeMaterial ? 'include saved material if available' : 'do not include material',
    posting.includeAvailability ? 'include saved availability if available' : 'do not include availability',
    posting.includeHashtags ? 'include 3 to 6 useful hashtags' : 'do not include hashtags',
    posting.includeOrderInstruction ? 'include a short order instruction using product code' : 'do not include order instruction'
  ].join('; ');
  try {
    const caption = await askAi({
      provider: ai.provider,
      apiKey: ai.apiKey,
      tone: 'Warm, concise, trustworthy product marketing. Do not invent facts.',
      history: '',
      businessProfile: businessProfileText(client.settings || {}),
      products: [productMarketingFacts(product), discountFacts.lines ? `Active discounts:\n${discountFacts.lines}` : ''].filter(Boolean).join('\n'),
      knowledge: '',
      message: `Create a Telegram product post caption for this product.
Language preference: ${posting.language}.
Style: ${posting.style}.
Draft version: ${Number(overrides.variantNumber || 1)}${Number(overrides.variantNumber || 1) > 1 ? ' of 2. Make this version meaningfully different from the first draft while staying factual.' : ''}.
Rules: ${includeRules}.
Use only the saved product facts. Do not invent price, size, color, material, stock, address, discount, or delivery.
If an active discount is listed, mention it clearly and professionally without fake scarcity.
If order instructions are enabled, include this exact buying path naturally: "${botOrderInstruction(client, product)}"
Keep it under 900 characters because Telegram photo captions are limited.
Return only the caption text.`,
      strictKnowledgeMode: true,
      synthesisMode: true
    });
    const cleaned = String(caption || '').trim();
    if (!cleaned || isMissingKnowledgeReply(cleaned)) return fallback;
    return withBotOrderInstruction(cleaned, client, product, posting);
  } catch (error) {
    console.error(`Product caption generation failed for ${client.businessName}:`, error.message);
    return fallback;
  }
};

const describeCustomerImage = async (client, filePath, caption = '') => {
  const apiKey = mediaApiKey(client.settings || {}, 'vision');
  if (!apiKey) return { description: '', isPaymentProof: false };
  const prompt = `Analyze this customer image for a Telegram business assistant.
Caption/context: ${caption || 'none'}
Return JSON only with:
{
  "type": "payment_proof" | "unclear",
  "description": "short factual receipt/payment description and any transaction text extracted from the image",
  "confidence": 0-100
}
Payment proof means bank receipt, Telebirr/CBE/bank screenshot, transaction reference, amount paid, or receipt-like image.
If the image is a product photo, catalog screenshot, selfie, or anything that is not payment proof, return type "unclear".`;
  try {
    const raw = await askGeminiMedia({ apiKey, filePath, mimeType: mimeFromPath(filePath), prompt });
    const jsonText = raw.match(/\{[\s\S]*\}/)?.[0] || '';
    const parsed = jsonText ? JSON.parse(jsonText) : null;
    return {
      description: String(parsed?.description || raw || '').slice(0, 1500),
      isPaymentProof: parsed?.type === 'payment_proof',
      confidence: Math.max(0, Math.min(100, Number(parsed?.confidence || 0))),
      type: parsed?.type || 'unclear'
    };
  } catch (error) {
    console.error(`Customer image analysis failed for ${client.businessName}:`, error.message);
    return { description: '', isPaymentProof: false, confidence: 0, type: 'unclear' };
  }
};


const transcribeVoiceMessage = async (client, filePath) => {
  const apiKey = mediaApiKey(client.settings || {}, 'voice');
  if (!apiKey) return '';
  try {
    return await askGeminiMedia({
      apiKey,
      filePath,
      mimeType: mimeFromPath(filePath),
      prompt: `Transcribe this Telegram voice note as accurately as possible.
The speaker may use Amharic, English, or mixed Amharic-English.
Return only the transcription text. Do not answer the customer.`
    });
  } catch (error) {
    console.error(`Voice transcription failed for ${client.businessName}:`, error.message);
    return '';
  }
};


const classifySalesIntent = async (text, provider, apiKey) => {
  // AI-based intent classification for deeper understanding
  // Falls back to regex-based classification if AI fails
  if (!apiKey || !provider) {
    return classifySalesIntentFallback(text);
  }
  try {
    const system = 'You are an intent classifier for a sales chatbot. Classify the customer message into exactly one category: "greeting", "product_inquiry", "delivery_request", "order_placement", "pricing_concern", "comparison", "objection", "ready_to_buy", "needs_info", "not_interested", "budget_constraint", "trust_concern", or "other". Return ONLY the category slug, nothing else. No explanation, no punctuation.';
    const response = await fetchWithTimeout(
      provider === 'openai'
        ? 'https://api.openai.com/v1/chat/completions'
        : 'https://api.deepseek.com/chat/completions',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: provider === 'openai' ? (process.env.OPENAI_MODEL || 'gpt-4o-mini') : (process.env.DEEPSEEK_MODEL || 'deepseek-chat'),
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: text }
          ],
          temperature: 0.0,
          max_tokens: 15
        })
      },
      6000
    );
    if (response.ok) {
      const json = await response.json();
      const category = json.choices?.[0]?.message?.content?.trim().toLowerCase().replace(/[^a-z_]/g, '');
      const valid = ['greeting', 'product_inquiry', 'delivery_request', 'order_placement', 'pricing_concern', 'comparison', 'objection', 'ready_to_buy', 'needs_info', 'not_interested', 'budget_constraint', 'trust_concern', 'other'];
      if (valid.includes(category)) {
        return category;
      }
    }
  } catch (error) {
    console.error('AI intent classification failed, using fallback:', error.message?.slice(0, 80));
  }
  return classifySalesIntentFallback(text);
};

const classifySalesIntentFallback = text => {
  const lower = String(text || '').toLowerCase();
  // Order: check most specific intents first
  if (/^(hi|hello|hey|selam|salam|good morning|good afternoon|good evening|ሰላም|yo|hey there|what's up|howdy)[\s!.?]*$/i.test(String(text || '').trim())) return 'greeting';
  if (/\b(deliver|delivery|shipping|send it|courier|transport|bring it|take it|pick.?up)\b/i.test(lower) && /\b(to|in|at|near|around)\b/i.test(lower)) return 'delivery_request';
  if (/\b(order|buy|purchase|book|place|get (this|that|it|one)|i want (this|that|it|the)|i.ll take|sign me|checkout)\b/i.test(lower) && !/\b(not|don.t|cancel|change my mind)\b/i.test(lower)) return 'order_placement';
  if (/\b(size|color|material|fabric|dimension|weight|detail|spec|specific|tell me about|describe|description|more (about|info)|what is|what are|does it|do you have)\b/i.test(lower)) return 'product_inquiry';
  if (/\b(expensive|too much|costly|overpriced|pricey|can't afford|too pricey|out of (my|our) budget)\b/i.test(lower)) return 'pricing_concern';
  if (/\b(budget|installment|payment plan|can you do|how much for|afford|cost|price)\b/i.test(lower)) return 'budget_constraint';
  if (/\b(compare|competitor|someone else|other (company|shop|provider)|they have|they offer)\b/i.test(lower)) return 'comparison';
  if (/\b(trust|why you|why should|guarantee|scam|legit|reliable|experience|proof|portfolio)\b/i.test(lower)) return 'trust_concern';
  if (/\b(not sure|not interested|no thanks|maybe later|i'll get back|let me think|think about it)\b/i.test(lower)) return 'objection';
  if (/\b(hurry|quick|urgent|today|now|asap|immediately|ready|let's do|let's start|sign me|order|buy|purchase|book|schedule)\b/i.test(lower)) return 'ready_to_buy';
  if (/\b(time|timeline|how long|when|delivery|ready|ETA|duration|days|weeks|months)\b/i.test(lower)) return 'timeline_concern';
  if (/\b(tell me|explain|detail|more about|what is|how does|how it works|describe|info|information)\b/i.test(lower)) return 'needs_info';
  return 'other';
};

const extractSensitiveFacts = text => {
  const value = String(text || '');
  const emails = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  const phones = value.match(/(?:\+?\d[\d\s().-]{7,}\d)/g) || [];
  const money = value.match(/(?:[$€£]\s?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s?(?:usd|birr|etb|dollars?)\b)/gi) || [];
  return [...emails, ...phones, ...money]
    .map(item => item.toLowerCase().replace(/\s+/g, ' ').trim())
    .filter(Boolean);
};

const replyInventsSensitiveFacts = (reply, allowedKnowledge) => {
  const knowledgeText = String(allowedKnowledge || '').toLowerCase();
  return extractSensitiveFacts(reply).some(fact => !knowledgeText.includes(fact));
};

const removeSensitiveFacts = text => {
  return String(text || '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[contact detail not listed here]')
    .replace(/(?:[$€£]\s?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s?(?:usd|birr|etb|dollars?)\b)/gi, '[price not listed here]')
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, '[phone not listed here]');
};

const isBroadBusinessQuestion = text => {
  return /\b(services?|packages?|plans?|solutions?|offer|offers|what do you do|what can you do|for my business|for my shop|for my store|retail|restaurant|clinic|salon|hotel|agency|company|business)\b/i
    .test(String(text || ''));
};

const detectLocalLanguage = text => {
  const value = String(text || '').toLowerCase();
  const hasEthiopic = /[\u1200-\u137F]/.test(value);
  const latinAmharic = /\b(selam|salam|endet|endemin|eshi|yene|ante|anchi|ene|egna|ale|alew|alchlm|ynoral|yhon|sint|wede|betam|ameseginalehu|mekina|yemit|new|naw|neh|nesh|nachihu|beka|min|mndn|demo|keza|bekelal|ewnet|wedaje)\b/i.test(value);
  const oromoSomaliTigrinya = /\b(akkam|galatoomi|meeqa|jira|jirtu|maal|waan|maqa|nagaa|isin|ani|ati|mahadsanid|haye|maya|haa|imisa|xagee|sidee|waad|salaan|kemey|yekenyeley|hadami)\b/i.test(value);
  if (hasEthiopic || latinAmharic || oromoSomaliTigrinya) {
    return {
      isLocal: true,
      script: hasEthiopic ? 'ethiopic' : 'latin',
      hint: hasEthiopic ? 'Ethiopic script' : latinAmharic ? 'Latin Amharic / Ethiopian local language style' : 'Oromo/Somali/Tigrinya-style local language'
    };
  }
  return { isLocal: false, script: 'latin', hint: 'English or unknown' };
};

const localLanguageAi = settings => {
  const apiKey = mediaApiKey(settings || {}, 'voice');
  return apiKey ? { provider: 'gemini', apiKey, mode: 'local-language' } : null;
};

const aiPrompt = ({ tone, history, businessProfile, businessBrain, products, knowledge, message, strictKnowledgeMode, synthesisMode = false, localLanguageMode = null, salesStage = null, conversationSummary = null }) => {
  const strictRules = strictKnowledgeMode
    ? `KNOWLEDGE RULES (always follow):
- Use only the business information below. Never invent prices, contacts, addresses, discounts, guarantees, or timelines.
- Look up info in this order: 1) Business profile, 2) Business brain, 3) Product catalog, 4) Knowledge files, 5) Recent conversation.
- You CAN synthesize, compare, group, and summarize across sources. If a customer asks "what services do you have" and there are multiple, list them as options.
- For contact questions: answer from sources if available. If missing, say the exact detail isn't listed and ask them to share their number so the team follows up.
- For fit questions: infer from the sources if the business type or industry matches. Say "Based on our services..." for supported inferences.
- If a price, phone, email, timeline, address, or policy is not in the sources, say that exact detail isn't listed yet and offer team follow-up.
- If nothing relevant exists in any source, reply exactly: "${missingKnowledgeReply}"
- Do NOT use outside knowledge or the internet.`
    : 'Use the business information when relevant. If details are missing, be honest and offer team follow-up.';
  const synthesisRules = synthesisMode
    ? `\n\nBroad-question synthesis mode is ON.
The customer is asking a general services, package, or business-fit question.
Do not reply with "${missingKnowledgeReply}" if the approved sources contain any relevant service, package, industry, retail, sales, marketing, website, automation, or growth information.
Summarize the relevant options from the approved sources in simple customer language.
For package questions, group the uploaded package/source information into clear options using the source names and content.
For fit questions, explain the fit as a supported inference, for example: "Based on the services described, this can fit a retail shop because..."
Do not include exact prices, emails, phone numbers, addresses, or exact timelines in broad summaries unless the customer specifically asks for those details.
If an exact price or timeline is missing, say that exact detail is not listed instead of refusing the whole answer.`
    : '';
  const languageRules = localLanguageMode?.isLocal
    ? `\n\nLocal-language mode is ON.
The customer appears to use ${localLanguageMode.hint}.
Reply in the same style and script the customer used.
If the customer writes Amharic/Oromo/Somali/Tigrinya using Latin letters, reply using simple Latin transliteration, not Ethiopic script.
Keep business facts strictly from the approved sources.
Use simple words and short sentences.`
    : '\n\nReply in the same language/style as the customer when it is clear.';

  // Inject customer buying stage and interests into context
  const nameContext = conversationSummary?.customerName ? `\n- Customer's name: ${conversationSummary.customerName} (use this naturally, not every message)` : '';
  const intentContext = conversationSummary?.aiIntent && conversationSummary.aiIntent !== 'other'
    ? `\n- CUSTOMER INTENT (detected): ${conversationSummary.aiIntent.replace(/_/g, ' ')} — YOU MUST adjust your reply to address this directly.`
    : '';

  // Detect if customer is just greeting — force fresh start, no old order references
  const isGreeting = /^(hi|hello|hey|selam|salam|good morning|good afternoon|good evening|ሰላም|yo|hey there|what's up|howdy)[\s!.?]*$/i.test(String(message || '').trim());
  const freshStartDirective = isGreeting
    ? `\n\n⚠️ FRESH CONVERSATION START: The customer just greeted you. Treat this as a BRAND NEW conversation.\n- DO NOT mention any previous orders, sizes, colors, phone numbers, addresses, or products from earlier chats.\n- DO NOT say "Welcome back" or "Were you ready to finalize" or reference past topics.\n- Give a warm, genuine greeting and ask ONE discovery question to learn what they're looking for today.\n- Example: "Hello! 👋 Welcome to [business name]. Are you looking for something specific today, or just browsing?"`
    : '';
  const stageContext = salesStage
    ? `

CUSTOMER STATUS:
- Buying stage: ${salesStageLabel(salesStage)}${nameContext}${intentContext}
${conversationSummary?.interests?.length ? `- Topics they have shown interest in: ${conversationSummary.interests.join(', ')}` : ''}
${conversationSummary?.lastTopic ? `- Current topic: ${conversationSummary.lastTopic}` : ''}
- Use this context to tailor your tone: if exploring, educate. If objecting, reassure. If ready to buy, guide to next step.`
    : '';

  return {
    system: `${tone}

You are a professional sales consultant representing the business. Your goal: understand what the customer needs and help them find the right solution.${stageContext}

${strictRules}${synthesisRules}${languageRules}${freshStartDirective}

SALES PSYCHOLOGY (master these techniques):

1. BUILD RAPPORT FIRST — Don't jump straight to selling. Use the customer's name if you know it. Mirror their language style (formal/casual). Acknowledge what they said with a SHORT confirmation ("Sure!", "Of course!", "Great choice!", "No problem!") — never repeat their full sentence back.
   If they say "I'm just looking", say "Take your time! What kind of styles do you usually like?" — keep them engaged without pressure.

2. VALIDATE INTEREST WARMLY — When a customer shows interest ("this is nice", "I like this", "beautiful", "cool"), match their excitement first before asking any next step:
   "Great eye! That one's really popular." or "It's even better in person — the fabric is gorgeous."
   Then naturally offer the next step: "Want to know the available sizes?" — warm support, never forced.

   CRITICAL: If you just told them a color/size is unavailable and they accept the alternative ("ok brown is nice", "fine, brown works", "brown is good too"), AFFIRM their choice and continue — do NOT restart the product flow or re-send the product image.
   RIGHT: "Yes, brown is really nice too! It's a classic color. What size do you need?"
   WRONG: Re-sending product images or restarting from "Here's the product..."

3. ASK BEFORE YOU PITCH — Never list products until you understand their need. If they say "show me what you have", respond with ONE discovery question: "Sure! Are you shopping for yourself or as a gift?" Then show only 2-3 relevant items, not the whole catalog.

4. HANDLE OBJECTIONS WITH EMPATHY — When a customer hesitates about price, validate their concern first: "I completely understand. Quality pieces are an investment." Then pivot to value. Never get defensive. Never offer unsolicited discounts.

5. CREATE GENTLE URGENCY — Mention availability naturally only if true: "This is one of our last pieces in this size." Never manufacture false scarcity.

6. USE SOCIAL PROOF — Reference popularity when genuine: "This has been our most requested style this season."

7. EARN THE NEXT STEP — Every reply should invite engagement with a natural question.

PRICE INQUIRY RULES:
- When a customer asks "what's the last price", "how much is it", "final price", or "discount", just state the price clearly. Do NOT re-send the product image.
- Say "That IS the selling price" or "This is already the final price" — be direct, not apologetic.
- Example: "It's 3,500 Birr — that's the selling price already. It's a quality piece that holds up really well."
- Never suggest a discount or negotiate. If they push, say "Our prices are fixed based on quality and sourcing."

HOW TO ORDER RULES:
- When a customer asks "how do I order", "how can I buy", "ordering process", or similar, explain the steps clearly:
  1. You tell me which product and color/size you want
  2. I'll confirm the details with you
  3. I'll ask for payment (Telebirr, CBE, or delivery payment depending on our options)
  4. You send the payment screenshot
  5. We arrange delivery or pickup
- Do NOT just show the product again. Answer what they actually asked.

STRICT KNOWLEDGE RULES:
- ONLY answer from the client's product catalog and knowledge base. Never invent products, features, prices, payment methods, or policies.
- If the answer is not in the catalog or knowledge base, say "Let me check with the team on that and get back to you."
- Payment methods MUST come from the client's dashboard settings. Never suggest payment options you're not sure about.
- If you don't know something, admit it and offer to connect them with the team.

TONE RULES:
- Be concise: 2-4 sentences for normal replies. Bullet lists only when comparing 2+ options.
- Sound human: Like a helpful shop assistant, not a form letter. Use natural language, contractions, and warmth.
- Match their energy: If they're brief, be brief. If they're chatty, be warmer.
- Names matter: If the customer has shared their name, use it occasionally (not every message).

CRITICAL SPEECH RULES:
- NEVER echo or repeat the customer's exact words back at them. This sounds robotic and annoying.
  WRONG: "Yes, can you send it to me to piassa? Let me know your order details..."
  RIGHT: "Yes, we deliver to Piassa. To process your order, I just need:"
- Answer questions directly. Don't parrot their question in your reply.
- NEVER pre-fill old order details (product, size, color, phone, address) from previous conversations.
  If the customer is starting a new topic or hasn't explicitly said "continue my order," ask for fresh details.
  WRONG: "Product: DRESS 007, Size: M, Color: needed, Phone: 0927668219" (from old chat)
  RIGHT: "Sure! I'll need: Name, Phone number, Delivery address, Size, Color. Any special notes?"
- When collecting order details, use a FRESH, clean form based on the product type. Never copy-paste old form fields.
  For physical products ask: Name, Phone, Delivery address, Size (if clothing), Color (if relevant), Quantity, Note.
  If the customer previously mentioned a location, confirm it: "Should I deliver to Piassa or a different address?"

ORDER CONFIRMATION RULES:
- After the customer provides ALL their order details (name, phone, size, color, address), ALWAYS confirm before proceeding:
  "Here's what I have for your order:
  Product: [name]
  Size: [size] | Color: [color]
  Phone: [number]
  Delivery: [address]
  Total: [price]
  Is this correct? Should I continue with payment?"
- Wait for the customer to confirm before moving to payment. Do NOT send payment instructions until they confirm.

PAYMENT FLOW RULES:
- After the customer confirms order details, ask how they want to pay. ONLY offer payment methods from the business profile/payment settings.
  Example: "How would you like to pay? We accept: Telebirr, CBE transfer, or payment on delivery."
- If they choose Telebirr/CBE/bank transfer, give the payment number from the business payment instructions.
- Always mention the EXACT product price when asking for payment.
- Say: "Please transfer [EXACT PRICE] Birr to [payment number]. After paying, send the screenshot here so we can verify."
- When they send the screenshot, confirm: "Received! The team will verify your payment and confirm delivery shortly."
- NEVER invent payment numbers. Only use what's in the client's payment instructions.
- If the business supports payment on delivery, offer it as an option: "Or you can pay when we deliver."

SAFETY RULES:
- Never mention internal words like "knowledge base", "uploaded files", "settings", "approved sources", "dashboard", "prompt", "retrieval", "document names", or "system". Just answer naturally.
- Don't say "based on my data", "according to the settings", "general knowledge detail", "saved yet", or "source-of-truth".
- If a customer says they saw an ad, video, post, reel, TikTok, Facebook, Instagram, YouTube, or Google — welcome them warmly from that source.
- If the latest message introduces a completely new topic, answer that directly. Don't force the old flow.
- Only try to collect contact details or close if the customer clearly asks to start, book, quote, or schedule.
- Use "you", "your business", "your shop" when referring to the customer.
- Sound helpful and professional. Be a consultant, not a database.`,
    user: `Business profile and rules:\n${businessProfile || 'No business profile saved.'}\n\nBusiness brain summary:\n${businessBrain || 'No business brain summary available.'}\n\nProduct catalog:\n${products || 'No active products saved.'}\n\nKnowledge base files:\n${knowledge || 'No matching knowledge files.'}\n\nRecent conversation:\n${history}\n\nLatest customer message:\n${message}`
  };
};

const askClaude = async ({ apiKey, tone, history, businessProfile, businessBrain, products, knowledge, message, strictKnowledgeMode, synthesisMode, localLanguageMode, salesStage, conversationSummary }) => {
  if (!apiKey) return '';
  const prompt = aiPrompt({ tone, history, businessProfile, businessBrain, products, knowledge, message, strictKnowledgeMode, synthesisMode, localLanguageMode, salesStage, conversationSummary });
  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest',
      max_tokens: 600,
      temperature: strictKnowledgeMode ? 0.6 : 0.8,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }]
    })
  });
  if (!response.ok) throw new Error(`Claude request failed: ${response.status}`);
  const json = await response.json();
  return json.content?.map(part => part.text).join('\n').trim() || '';
};

const askOpenAiCompatible = async ({ apiKey, baseUrl, model, tone, history, businessProfile, businessBrain, products, knowledge, message, strictKnowledgeMode, synthesisMode, localLanguageMode, salesStage, conversationSummary }) => {
  if (!apiKey) return '';
  const prompt = aiPrompt({ tone, history, businessProfile, businessBrain, products, knowledge, message, strictKnowledgeMode, synthesisMode, localLanguageMode, salesStage, conversationSummary });
  console.log('ai request stage:', salesStage);
// Adaptive temperature: factual → lower, creative sales → higher
const adaptiveTemperature = (() => {
  if (!salesStage) return 0.7;
  const map = {
    'new': 0.85,        // Warm, varied greetings
    'exploring': 0.8,    // Creative discovery
    'interested': 0.75,  // Engaging but controlled
    'objection': 0.8,    // Flexible objection handling
    'negotiating': 0.7,  // Precise pricing/value
    'ready_to_buy': 0.5, // Factual, no surprises
    'closed': 0.6,
    'lost': 0.6
  };
  return map[salesStage] || 0.75;
})();
console.log('adaptive temperature:', adaptiveTemperature);

const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    authorization: `Bearer ${apiKey}`
  },
  body: JSON.stringify({
    model,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user }
    ],
    temperature: adaptiveTemperature
    })
  });
  if (!response.ok) throw new Error(`AI request failed: ${response.status}`);
  const json = await response.json();
  return json.choices?.[0]?.message?.content?.trim() || '';
};

const askGemini = async ({ apiKey, tone, history, businessProfile, businessBrain, products, knowledge, message, strictKnowledgeMode, synthesisMode, localLanguageMode, salesStage, conversationSummary }) => {
  if (!apiKey) return '';
  const prompt = aiPrompt({ tone, history, businessProfile, businessBrain, products, knowledge, message, strictKnowledgeMode, synthesisMode, localLanguageMode, salesStage, conversationSummary });
  const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${prompt.system}\n\n${prompt.user}` }] }]
    })
  });
  if (!response.ok) throw new Error(`Gemini request failed: ${response.status}`);
  const json = await response.json();
  return json.candidates?.[0]?.content?.parts?.map(part => part.text).join('\n').trim() || '';
};

const askAi = async ({ provider, apiKey, tone, history, businessProfile, businessBrain, products, knowledge, message, strictKnowledgeMode, synthesisMode = false, localLanguageMode = null, salesStage = null, conversationSummary = null }) => {
  const shared = { apiKey, tone, history, businessProfile, businessBrain, products, knowledge, message, strictKnowledgeMode, synthesisMode, localLanguageMode, salesStage, conversationSummary };
  if (provider === 'claude') return askClaude(shared);
  if (provider === 'openai') {
    return askOpenAiCompatible({
      ...shared,
      baseUrl: 'https://api.openai.com/v1',
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini'
    });
  }
  if (provider === 'gemini') return askGemini(shared);
  return askOpenAiCompatible({
    ...shared,
    baseUrl: 'https://api.deepseek.com',
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat'
  });
};

const buildReply = async (data, client, conversation, incomingText) => {
  const settings = client.settings;
  const ai = effectiveAi(settings);
  const localLanguageMode = detectLocalLanguage(incomingText);
  const routedAi = localLanguageMode.isLocal ? (localLanguageAi(settings) || ai) : ai;
  const recent = data.messages
    .filter(message => message.conversationId === conversation.id)
    .slice(-Number(settings.historyLimit || 12))
    .map(message => `${message.direction === 'inbound' ? 'Customer' : 'Assistant'}: ${message.text}`)
    .join('\n');
  const brain = businessBrainText(data, client);
  const knowledge = isServiceBusiness(client) ? activeKnowledgeText(data, client.id) : '';
  const profile = businessProfileText(settings);
  const products = isProductBusiness(client) ? activeProductText(data, client.id) : '';
  const allowedKnowledge = [profile, brain, products, knowledge].filter(Boolean).join('\n\n');
  const strictKnowledgeMode = settings.strictKnowledgeMode !== false;
  const broadBusinessQuestion = isBroadBusinessQuestion(incomingText) || serviceTopicIntent(incomingText);
  const usage = aiUsageStatus(settings);
  if (strictKnowledgeMode && !allowedKnowledge) return missingKnowledgeReply;
  if (ai.mode === 'admin' && usage.limitReached) {
    sendAdminAlert(data, `ai-limit-${client.id}`, `AI monthly reply limit reached for ${client.businessName}. Used ${usage.used}/${usage.limit} managed AI replies.`, 120).catch(() => null);
    await sendClientNotification(data, client, `ai-limit-${client.id}-${settings.aiUsageMonth}`, `Your managed AI reply limit has been reached for this month (${usage.used}/${usage.limit}). Please contact Sprintsales so customers are not left waiting.`, 'aiUsage', 60 * 24 * 30);
    return 'Thanks for your message. The team will review this and get back to you soon.';
  }
  // Update sales stage and conversation summary for context-aware replies
  const salesStage = conversation.salesStage || 'new';
  const conversationSummary = conversation.summary || null;

  // AI-based intent classification for accurate customer understanding
  let aiClassifiedIntent = null;
  if (ai.provider && ai.apiKey && incomingText) {
    aiClassifiedIntent = await classifySalesIntent(incomingText, ai.provider, ai.apiKey).catch(() => null);
    if (aiClassifiedIntent && conversationSummary) {
      conversationSummary.aiIntent = aiClassifiedIntent;
    }
  }

  try {
    let aiReply = await askAi({
      provider: routedAi.provider,
      apiKey: routedAi.apiKey,
      tone: settings.tone,
      history: recent,
      businessProfile: profile,
      businessBrain: brain,
      products,
      knowledge,
      message: incomingText,
      strictKnowledgeMode,
      synthesisMode: broadBusinessQuestion,
      localLanguageMode,
      salesStage,
      conversationSummary
    });
    if (broadBusinessQuestion && aiReply.trim() === missingKnowledgeReply && allowedKnowledge) {
      aiReply = await askAi({
        provider: routedAi.provider,
        apiKey: routedAi.apiKey,
        tone: settings.tone,
        history: recent,
        businessProfile: profile,
        businessBrain: brain,
        products,
        knowledge,
        message: `The customer asked a broad business question: "${incomingText}". Summarize and infer only from the approved sources. Do not refuse unless there is no relevant service/package/business-fit information at all.`,
        strictKnowledgeMode,
        synthesisMode: true,
        localLanguageMode,
        salesStage,
        conversationSummary
      });
    }
    if (aiReply) {
      if (strictKnowledgeMode && replyInventsSensitiveFacts(aiReply, allowedKnowledge)) {
        if (broadBusinessQuestion) {
          const sanitizedReply = removeSensitiveFacts(aiReply);
          if (sanitizedReply.trim() && sanitizedReply.trim() !== missingKnowledgeReply) return sanitizedReply;
        }
        console.warn(`Safety guard blocked unsupported sensitive fact for ${client.businessName}`);
        return missingKnowledgeReply;
      }
      trackManagedAiReply(settings);
      const updatedUsage = aiUsageStatus(settings);
      if (ai.mode === 'admin' && updatedUsage.limit > 0 && updatedUsage.percent >= 80) {
        await sendClientNotification(data, client, `ai-usage-${client.id}-${settings.aiUsageMonth}-80`, `Managed AI usage warning: ${updatedUsage.used}/${updatedUsage.limit} replies used this month (${updatedUsage.percent}%). Please contact Sprintsales if you expect high traffic.`, 'aiUsage', 60 * 24 * 30);
      }
      return aiReply;
    }
  } catch (error) {
    if (localLanguageMode.isLocal && routedAi.provider === 'gemini' && ai.apiKey && ai.provider !== 'gemini') {
      try {
        const fallbackReply = await askAi({
          provider: ai.provider,
          apiKey: ai.apiKey,
          tone: settings.tone,
          history: recent,
          businessProfile: profile,
          businessBrain: brain,
          products,
          knowledge,
          message: incomingText,
          strictKnowledgeMode,
          synthesisMode: broadBusinessQuestion,
          localLanguageMode
        });
        if (fallbackReply) return fallbackReply;
      } catch (fallbackError) {
        console.error(`Local-language fallback failed for ${client.businessName}:`, fallbackError.message);
      }
    }
    console.error(`AI reply failed for ${client.businessName}:`, error.message);
    addBotError(data, {
      clientId: client.id,
      businessName: client.businessName,
      type: 'ai-reply',
      message: `AI reply failed: ${error.message}`,
      severity: 'error'
    });
    sendAdminAlert(null, `ai-error-${client.id}`, `AI reply failed for ${client.businessName}: ${error.message}`, 60).catch(() => null);
  }
  const sourceLine = 'I can help with that.';
  return strictKnowledgeMode
    ? missingKnowledgeReply
    : `${sourceLine} ${settings.tone.includes('concise') ? '' : 'Please share a little more detail so I can guide you properly.'}`.trim();
};

  return {
    mediaApiKey,
    mimeFromPath,
    askGeminiMedia,
    productSeedDescription,
    defaultProductImageAnalysis,
    normalizeProductImageAnalysis,
    analyzeProductImage,
    describeProductImage,
    productMarketingFacts,
    fallbackProductCaption,
    generateProductCaption,
    describeCustomerImage,
    transcribeVoiceMessage,
    classifySalesIntent,
    classifySalesIntentFallback,
    replyInventsSensitiveFacts,
    removeSensitiveFacts,
    isBroadBusinessQuestion,
    detectLocalLanguage,
    localLanguageAi,
    aiPrompt,
    askClaude,
    askOpenAiCompatible,
    askGemini,
    askAi,
    buildReply
  };
};
