export const createSalesService = (deps = {}) => {
  const {
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
  } = deps;

const ownerPrivateChatId = client => {
  const settings = client?.settings || {};
  const candidates = [
    settings.sprintsalesAdminChatId,
    settings.telegramOwnerChatId,
    settings.ownerChatId,
    settings.hotLeadNotifyChatId
  ];
  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (/^\d{5,20}$/.test(value)) return value;
  }
  return '';
};

const detectHotLead = text => {
  const lower = text.toLowerCase();
  const signals = [
    'price', 'cost', 'buy', 'pay', 'today', 'now', 'deliver', 'delivery',
    'call me', 'phone', 'whatsapp', 'number', 'interested', 'book', 'order',
    'invoice', 'quote', 'available', 'how much'
  ];
  return signals.reduce((score, signal) => score + (lower.includes(signal) ? 1 : 0), 0);
};

const detectLeadIntents = text => {
  const lower = String(text || '').toLowerCase();
  const checks = [
    ['Ad source', /\b(tiktok|tik tok|facebook|instagram|ig|telegram channel|youtube|google|website|ad|advert|advertising|video|reel|post|saw your)\b/],
    ['Pricing', /\b(price|cost|how much|package|fee|quote|invoice|payment)\b/],
    ['Purchase', /\b(buy|order|pay|purchase|checkout|take it|i want)\b/],
    ['Urgent', /\b(today|now|urgent|asap|immediately|this week)\b/],
    ['Availability', /\b(available|in stock|do you have|still have|size|color)\b/],
    ['Delivery', /\b(deliver|delivery|shipping|ship|location|pickup)\b/],
    ['Booking', /\b(book|call|meeting|appointment|consultation|consult|schedule|website|design|marketing|ads|service|quote|proposal|project|audit|strategy|need help|work with you)\b/],
    ['Contact shared', /\b(phone|whatsapp|number|call me|contact me)\b/]
  ];
  return checks.filter(([, pattern]) => pattern.test(lower)).map(([label]) => label);
};

const detectLeadSource = text => {
  const value = String(text || '').toLowerCase();
  if (/\b(tiktok|tik tok)\b/.test(value)) return 'TikTok';
  if (/\b(instagram|ig|reel|reels)\b/.test(value)) return 'Instagram';
  if (/\b(facebook|fb)\b/.test(value)) return 'Facebook';
  if (/\b(telegram channel|telegram group)\b/.test(value)) return 'Telegram';
  if (/\b(youtube)\b/.test(value)) return 'YouTube';
  if (/\b(google)\b/.test(value)) return 'Google';
  if (/\b(website|site)\b/.test(value) && /\b(saw|found|came from|visited)\b/.test(value)) return 'Website';
  if (/\b(ad|advert|advertising|video|post)\b/.test(value)) return 'Advertisement';
  return '';
};

const leadSourceIntent = text => Boolean(detectLeadSource(text)) &&
  /\b(saw|seen|watched|from|came from|found|advert|advertising|ad|video|post|reel|hello|hi|hey)\b/i.test(String(text || ''));

const broadProductAvailabilityIntent = text => {
  const value = String(text || '');
  return /\b(do you have|do u have|any|show me|can i see|looking for|looking to buy|i am looking for|i'm looking for|interested in|i want|i need|need|available|what do you have)\b/i.test(value) &&
    /\b(product|products|item|items|dress|dresses|bag|bags|shoe|shoes|shirt|shirts|shemiz|skirt|skirts|jacket|jackets|cosmetic|cosmetics|watch|watches|phone|phones|laptop|laptops)\b/i.test(value);
};

const orderIntent = text => /\b(buy|order|purchase|take it|i want|want to buy|reserve|hold it|book this|checkout|i will buy|i need this|i will take|i'll take|tomorrow|deliver it|send it|send me this|can i get|confirm it|place order)\b/i
  .test(String(text || ''));

const productOrderStartIntent = text => /\b(i want to order|want to order|order it|order this|place order|buy it|buy this|i will buy|i'll buy|i want this|i need this|take it|i will take|checkout)\b/i
  .test(String(text || ''));

const orderDetailIntent = text => /\b(size|color|phone|number|whatsapp|deliver|delivery|location|address|pickup|pay|payment|bank|telebirr|transfer|tomorrow|today|qty|quantity|pcs|pieces|medium|large|small|bole|megenagna|piassa|mexico|ayat|summit|cmc)\b|\b(?:s|m|l|xl|xxl)\b/i
  .test(String(text || ''));

const orderAnswerIntent = (text, product = {}) => {
  const value = String(text || '');
  return orderDetailIntent(value) ||
    Boolean(extractPhoneNumber(value)) ||
    Boolean(extractLocation(value)) ||
    Boolean(extractChoice(value, product.sizes)) ||
    Boolean(extractChoice(value, product.colors)) ||
    hasQuantitySignal(value);
};

const orderDetailsClarificationIntent = text => /\b(what order details|what details|which details|what do you need|what should i send|what do you want me to tell|what information|which information|what else do you need|remaining details)\b/i
  .test(String(text || ''));

const orderStages = new Set([
  'order_collection',
  'order_confirmation',
  'promo_code',
  'payment',
  'awaiting_payment_proof',
  'owner_verification',
  'order_followup'
]);

const businessFitIntent = text => {
  const value = String(text || '');
  return /\b(for my|for our|my business|our business|my shop|our shop|my store|our store|i have|we have|i run|we run|clothing store|fashion store|retail|wholesale|boutique|salon|beauty|restaurant|clinic|hotel|company|enterprise|business)\b/i.test(value);
};

const realProductOrderIntent = text => {
  const value = String(text || '');
  if (businessFitIntent(value) && !/\b(product|item|dress|bag|shoe|shemiz|code|size|color|pcs|pieces|deliver it|send it|take it|buy this|order this)\b/i.test(value)) return false;
  return orderIntent(value);
};

const serviceCloseIntent = text => {
  const value = String(text || '');
  return /\b(book|book me|call me|contact me|meeting|appointment|consultation|consult|schedule|quote|proposal|start|go ahead|sign me up|hire|work with you|send proposal|send quote|ready to start|let'?s start)\b/i.test(value);
};

const serviceClarificationIntent = text => {
  const value = String(text || '');
  return /\b(package|packages|plan|plans|service|services|separate|separately|included|include|training|train|course|learn|option|options|what about|tell me more|how does it work|can i get|is it|does it)\b/i.test(value);
};

const bookingDetailAnswerIntent = text => {
  const value = String(text || '');
  return /(?:\+?\d[\d\s().-]{7,}\d)|\b(today|tomorrow|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|afternoon|evening|online|phone call|in person|in-person|at my office|location|address|budget|birr|etb|usd)\b/i.test(value);
};

const contactInfoRequestIntent = text => {
  const value = String(text || '');
  if (/(?:\+?\d[\d\s().-]{7,}\d)/.test(value) && /\b(my|mine|this is|here is)\b/i.test(value)) return false;
  return /\b(email or phone|phone or email|contact information|contact info)\b/i.test(value) ||
    /\b(how can i get (them|you)|how do i get (them|you)|how can i reach (them|you)|how do i reach (them|you)|where can i contact|how to contact)\b/i.test(value) ||
    /\b(?:can|could|please|would|do)\b.{0,45}\b(?:give|send|share|tell)\b.{0,45}\b(?:email|phone|number|contact|whatsapp|address)\b/i.test(value) ||
    /\b(?:what is|what's|where is|how can i reach|how do i contact|how can i contact)\b.{0,45}\b(?:email|phone|number|contact|whatsapp|address|you|team)\b/i.test(value);
};

const shouldContinueServiceBooking = (booking, text, classification = {}) => {
  if (!booking || ['done', 'cancelled'].includes(booking.status || 'requested')) return false;
  if (contactInfoRequestIntent(text) || serviceClarificationIntent(text) || businessFitIntent(text) || packageQuestionIntent(text)) return false;
  if (classification.type === 'lead_source' || classification.type === 'service_question' || classification.type === 'business_general') return false;
  return serviceCloseIntent(text) || bookingDetailAnswerIntent(text);
};

const serviceBookingIntent = (client, text) => {
  if (!isServiceBusiness(client)) return false;
  const value = String(text || '');
  const serviceWords = /\b(website|web site|landing page|ecommerce|e-commerce|online store|design|marketing|ads|lead gen|automation|telegram bot|telegram miniapp|telegram mini app|miniapp|mini app|crm|erp|service|quote|proposal|project|audit|strategy|need help|work with you|contact me|call me|interested)\b/i;
  const productBuyingOnly = /\b(size|color|pcs|pieces|stock|dress|bag|shoe|shemiz|deliver it|send it|take it)\b/i.test(value) && !/\b(service|website|consult|call|meeting|project|quote|proposal)\b/i.test(value);
  return serviceWords.test(value) && serviceCloseIntent(value) && !productBuyingOnly;
};

const serviceTopicIntent = text => /\b(website|web site|landing page|ecommerce|e-commerce|online store|design|marketing|ads|lead gen|automation|telegram bot|telegram miniapp|telegram mini app|miniapp|mini app|mini-app|crm|erp|service|project|proposal|quote|strategy|customer service)\b/i
  .test(String(text || ''));

const hasQuantitySignal = text => /\b(?:qty|quantity|x)\s*\d{1,3}\b|\b\d{1,3}\s*(?:pcs|pieces|items?|piece|pc)\b|\b(two|three|four|five|six|seven|eight|nine|ten)\s*(?:pcs|pieces|items?|piece|pc)?\b/i
  .test(String(text || ''));

const extractChoice = (text, options = []) => {
  const value = String(text || '').toLowerCase();
  // Normalize common expressions: "middle size" → "medium", "small size" → "small", etc.
  const normalized = value
    .replace(/\bmiddle\b/g, 'medium')
    .replace(/\bmeduim\b/g, 'medium') // common typo
    .replace(/\bxtra large\b/g, 'extra large')
    .replace(/\blitlle\b/g, 'small') // typo for little
    .replace(/\bnormal\b/g, 'medium') // "normal size" → medium
    .replace(/\bregular\b/g, 'medium'); // "regular size" → medium
  const aliases = {
    s: ['s', 'small', 'tiny', 'petite'],
    m: ['m', 'medium', 'med', 'middle', 'mid'],
    l: ['l', 'large', 'big'],
    xl: ['xl', 'extra large', 'extra large', 'x large', 'xtra large'],
    xxl: ['xxl', '2xl', 'double xl', 'double extra large'],
    '3xl': ['3xl', 'xxxl', 'triple xl']
  };
  return String(options || '')
    .split(/[,/|]+/)
    .map(item => item.trim())
    .filter(Boolean)
    .find(option => {
      const lower = option.toLowerCase();
      const candidates = [lower, ...(aliases[lower] || [])];
      return candidates.some(candidate => {
        const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, 'iu').test(normalized);
      });
    }) || '';
};

const cleanLocationHint = value => String(value || '')
  .replace(/\b(?:me|my place|my address|my area)\s+(?:to|at|in|around|near)\b/ig, ' ')
  .replace(/\b(?:me|my place|my address|my area)\b/ig, ' ')
  .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, ' ')
  .replace(/\b(today|tomorrow|next week|morning|afternoon|evening|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/ig, ' ')
  .replace(/\b(?:qty|quantity|x)\s*\d{1,3}\b/ig, ' ')
  .replace(/\b\d{1,3}\s*(?:pcs|pieces|items?|piece|pc)\b/ig, ' ')
  .replace(/\b(?:size|color|colour)\s*[:=-]?\s*\w+\b/ig, ' ')
  .replace(/[.?!,]+$/g, '')
  .replace(/\s{2,}/g, ' ')
  .trim();

const extractLocation = text => {
  const value = String(text || '');
  // Normalize common location names before extraction
  const normalized = value
    .replace(/\bmexico\b/ig, 'Mexico, Addis Ababa')
    .replace(/\b22\s*mazorea\b/ig, '22 Mazorea, Addis Ababa')
    .replace(/\b22\b(?!\s*(?:mazorea|piassa))/ig, '22 Mazorea, Addis Ababa');
  const direct = normalized.match(/\b(?:deliver(?:y)? to|send(?: it| this)? to|ship to|location is|address is|pickup at)\s+(.{3,90})/i);
  if (direct) return cleanLocationHint(direct[1]);
  // Only extract location when there's a clear delivery context + known area/city
  if (/\b(deliver|delivery|send|ship|area|location|address|bole|megenagna|piassa|mexico|ayat|summit|cmc|addis|ethiopia|around|near)\b/i.test(normalized)) {
    // Known Addis areas (expanded list)
    const knownArea = normalized.match(/\b(bole|megenagna|piassa|mexico|ayat|summit|cmc|kazanchis|sar bet|merkato|piazza|arada|gotera|lideta|kera|meskel|sarbet|22|hayahulet|bole medhanealem|bole atlas|bole edna|bole michael|jemo|betel|gurd shola|kotebe|akaki|kaliti|lebu|keraniyo|addisu gebeya|shiro meda|lancha|tuLudimtu|ildoret|entoto|cocoloco|bisrate gebriel|ferensay legation|warzark|sidist kilo|arbegnoch|higeria|semen mazorea|debremazurea|aberus|fernsay|legation)\b/i);
    if (knownArea) return cleanLocationHint(knownArea[1]);
    const cityMatch = normalized.match(/\b(addis ababa|addis|ethiopia|adama|nazret|bahir dar|gondar|mekelle|hawassa|dire dawa|jimma|dessie|harar)\b/i);
    if (cityMatch) return cleanLocationHint(cityMatch[1]);
    const loose = normalized.match(/\b(?:at|around|near)\s+([A-Za-z][\p{L}\p{N}\s-]{2,50})/iu);
    if (loose) return cleanLocationHint(loose[1]);
  }
  return '';
};

/**
 * Known Addis Ababa area keywords for delivery fee calculation.
 */
const isAddisAbabaLocation = location => {
  if (!location) return false;
  const lower = String(location).toLowerCase().trim();
  // Direct match on city name
  if (/\b(addis ababa|addis|ethiopia)\b/.test(lower)) return true;
  // Known Addis sub-areas (comprehensive list)
  const addisAreas = [
    'bole', 'megenagna', 'piassa', 'mexico', 'ayat', 'summit', 'cmc',
    'kazanchis', 'sar bet', 'merkato', 'piazza', 'arada', 'gotera',
    'lideta', 'kera', 'meskel', 'sarbet', '22', 'hayahulet',
    'bole medhanealem', 'bole atlas', 'bole edna', 'bole michael',
    'jemo', 'betel', 'gurd shola', 'kotebe', 'akaki', 'kaliti',
    'lebu', 'keraniyo', 'addisu gebeya', 'shiro meda', 'lancha',
    'tuludimtu', 'ildoret', 'entoto', 'cocoloco', 'bisrate gebriel',
    'ferensay legation', 'warzark', 'sidist kilo', 'arbegnoch',
    'higeria', 'semen mazorea', 'debre mazorea', 'aberus',
    'fernsay', 'legation', 'mazorea'
  ];
  return addisAreas.some(area => lower.includes(area));
};

const extractDateTimeHint = text => {
  const value = String(text || '');
  const match = value.match(/\b(today|tomorrow|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|afternoon|evening|\d{1,2}[:.]\d{2}|\d{1,2}\s?(?:am|pm))\b/ig);
  return match ? [...new Set(match)].join(', ') : '';
};

const extractQuantity = text => {
  const value = String(text || '').toLowerCase();
  const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const match = value.match(/\b(?:qty|quantity|x)\s*(\d{1,3})\b/) || value.match(/\b(\d{1,3})\s*(?:pcs|pieces|items?|piece|pc)\b/);
  if (match) return Math.max(1, Number(match[1]));
  const wordMatch = value.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:pcs|pieces|items?|piece|pc)?\b/);
  return wordMatch ? words[wordMatch[1]] : 1;
};

const extractPhoneNumber = text => {
  const match = String(text || '').match(/(?:\+?\d[\d\s().-]{7,}\d)/);
  return match ? match[0].replace(/\s+/g, ' ').trim() : '';
};

const extractBudgetHint = text => {
  const value = String(text || '');
  const match = value.match(/\b(?:budget|my budget is|around|about|for)\s*(?:ETB|Birr|Br|USD|\$)?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:ETB|Birr|Br|USD|\$)?/i)
    || value.match(/(?:ETB|Birr|Br|USD|\$)\s*([\d,]+(?:\.\d{1,2})?)/i)
    || value.match(/\b([\d,]+(?:\.\d{1,2})?)\s*(?:ETB|Birr|Br|USD)\b/i);
  return match ? match[0].replace(/\s{2,}/g, ' ').trim() : '';
};

const extractServiceSummary = text => {
  const value = String(text || '').trim();
  const website = value.match(/\b(?:make|build|create|design|develop)\s+(?:me\s+|us\s+|my\s+|our\s+)?(?:a\s+)?(website|web site|landing page|ecommerce|e-commerce|online store)\b/i);
  if (website) return website[1].replace('web site', 'website');
  const direct = value.match(/\b(?:i need|need|want|looking for|interested in|book|schedule)\s+(.{4,140})/i);
  return (direct?.[1] || value)
    .replace(/\b(alright|okay|ok|please|can you guys|can you|could you|do you|guys)\b/ig, ' ')
    .replace(/\b(i want|i need|i am looking for|i'm looking for)\b/ig, ' ')
    .replace(/\bmy customers\b/ig, 'your customers')
    .replace(/\bmy business\b/ig, 'your business')
    .replace(/\bmy shop\b/ig, 'your shop')
    .replace(/\bmy store\b/ig, 'your store')
    .replace(/\bme a\b/ig, 'a')
    .replace(/\s{2,}/g, ' ')
    .replace(/[.?!]+$/g, '')
    .trim()
    .slice(0, 180);
};

const serviceLabel = text => {
  const label = extractServiceSummary(text) || 'that service';
  return label
    .replace(/\bmy customers\b/ig, 'your customers')
    .replace(/\bmy business\b/ig, 'your business')
    .replace(/\bmy shop\b/ig, 'your shop')
    .replace(/\bmy store\b/ig, 'your store')
    .replace(/\bme\b/ig, 'you')
    .replace(/\byou guys\b/ig, 'the team')
    .replace(/\s{2,}/g, ' ')
    .trim();
};

const missingOrderQuestion = (order, latestText = '') => {
  const missing = order?.missingDetails || [];
  if (!missing.length) return '';
  if (orderDetailsClarificationIntent(latestText) || orderDetailsClarificationIntent(order.lastMessage)) return orderDetailsChecklist(order);
  if (missing.includes('size')) return `Great, I can help with this order. Which size would you like for ${order.productName || 'this product'}?`;
  if (missing.includes('color')) return `Great. Which color would you like for ${order.productName || 'this product'}?`;
  if (missing.includes('phone')) return 'Perfect. Please send your phone number so the team can confirm the order.';
  if (missing.includes('delivery location')) return 'Please send your delivery location or pickup preference so the team can arrange it.';
  return `Great, I can help with this order. Please share ${missing.join(', ')} so the team can confirm it.`;
};

const orderDetailsChecklist = order => {
  const missing = order?.missingDetails || [];
  const requested = detail => missing.includes(detail) ? 'needed' : 'received';
  return [
    'To complete the order, please send these details:',
    order.productName ? `Product: ${[order.productCode, order.productName].filter(Boolean).join(' - ')}` : '',
    `Size: ${order.selectedSize || requested('size')}`,
    `Color: ${order.selectedColor || requested('color')}`,
    `Quantity: ${order.quantity || 1}`,
    `Delivery area/specific address: ${order.deliveryLocation || requested('delivery location')}`,
    `Phone number: ${order.phone || requested('phone')}`
  ].filter(Boolean).join('\n');
};

const orderProgressReply = (client, order, latestText = '') => {
  if (!order) return '';
  const missing = missingOrderQuestion(order, latestText);
  if (missing) return missing;
  const payment = paymentInstructionsReply(client, order);
  if (payment) return payment;
  return [
    'Great, I saved this as a draft order and sent it to the team.',
    order.productName ? `Product: ${[order.productCode, order.productName].filter(Boolean).join(' - ')}` : '',
    order.selectedSize ? `Size: ${order.selectedSize}` : '',
    order.selectedColor ? `Color: ${order.selectedColor}` : '',
    order.quantity ? `Quantity: ${order.quantity}` : '',
    order.deliveryLocation ? `Delivery/location: ${order.deliveryLocation}` : '',
    order.phone ? `Phone: ${order.phone}` : '',
    order.total ? `Total: ${order.total}` : '',
    'The team will confirm availability and the next step shortly.'
  ].filter(Boolean).join('\n');
};

const orderStartReply = (client, product) => {
  if (!product) return '';
  const pieces = [
    `Great, I can help you order ${[product.code, product.name].filter(Boolean).join(' - ')}.`,
    productPrice(product) ? `💰 Price: ${productPrice(product)} Birr` : '',
    product.sizes ? `📏 Available sizes: ${product.sizes}` : '',
    product.colors ? `🎨 Available colors: ${product.colors}` : '',
    '',
    'To complete your order, please send:',
    product.sizes ? '• Your size' : '',
    product.colors ? '• Your color preference' : '',
    '• Quantity',
    '• Delivery area / specific address',
    '• Phone number'
  ].filter(Boolean);
  return pieces.join('\n');
};

const deliveryAreaStatus = (client, location) => {
  const delivery = String(client.settings?.businessProfile?.delivery || '').trim();
  const area = String(location || '').trim();
  if (!area) return '';
  if (!delivery) return `I saved the delivery location as ${area}. The team will confirm the delivery fee and timing.`;
  const lower = delivery.toLowerCase();
  const areaLower = area.toLowerCase();
  const unavailablePattern = new RegExp(`\\b(?:no|not|except|outside|do not|don't|cannot|can't)\\b.{0,80}\\b${areaLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  if (unavailablePattern.test(lower)) return `I saved ${area}, but delivery to that area may not be available based on the delivery policy. The team will confirm the best option.`;
  if (lower.includes(areaLower) || /\b(all areas|anywhere|citywide|within the city|addis ababa|addis|nationwide|all ethiopia)\b/i.test(delivery)) {
    return `Yes, we deliver to ${area}.`;
  }
  return `I saved the delivery location as ${area}. The team will confirm whether delivery is available there, including fee and timing.`;
};

const deliveryFollowUpReply = (client, order, text) => {
  if (!order?.deliveryLocation || !/\b(deliver|delivery|send|ship|location|address|deliver to|send to|ship to|bole|megenagna|piassa|mexico|ayat|summit|cmc)\b/i.test(String(text || ''))) return '';
  const delivery = deliveryAreaStatus(client, order.deliveryLocation);
  if ((order.missingDetails || []).length) {
    return `${delivery}\n\n${orderDetailsChecklist(order)}`;
  }
  const payment = paymentInstructionsReply(client, order);
  return payment ? `${delivery}\n\n${payment}` : delivery;
};

const businessDeliveryReply = (client, text) => {
  const delivery = String(client.settings?.businessProfile?.delivery || '').trim();
  const location = extractLocation(text);
  if (location) return `${deliveryAreaStatus(client, location)}\n\nPlease send the product, size/color if needed, quantity, specific address, and phone number so the team can confirm the order.`;
  if (delivery) return `${delivery}\n\nPlease send your delivery area and phone number so the team can confirm timing and fee.`;
  return 'Please send your delivery area and phone number. The team will confirm delivery availability, timing, and fee.';
};

const businessContactReply = client => {
  const profile = client.settings?.businessProfile || {};
  const contact = String(profile.contact || '').trim();
  const address = String(profile.address || '').trim();
  if (contact || address) {
    return [
      contact ? `Contact: ${contact}` : '',
      address ? `Address/service area: ${address}` : '',
      'You can also send your phone number here and the team can follow up.'
    ].filter(Boolean).join('\n');
  }
  return 'Please send your phone number here and the team can contact you directly.';
};

const orderNextAction = order => {
  if (!order) return { priority: 'warn', title: 'No active order', detail: 'No order action is available yet.' };
  if ((order.status || 'draft') === 'cancelled') return { priority: 'bad', title: 'Cancelled', detail: 'No customer action needed unless this was a mistake.' };
  if ((order.status || '') === 'delivered' || (order.deliveryStatus || '') === 'delivered') return { priority: 'good', title: 'Ask for review', detail: 'Order is delivered. Follow up for review/testimonial.' };
  if ((order.missingDetails || []).length) return {
    priority: 'warn',
    title: 'Collect missing details',
    detail: `Ask customer for: ${order.missingDetails.join(', ')}.`
  };
  if (!['paid', 'partial'].includes(order.paymentStatus || 'unpaid')) return {
    priority: 'bad',
    title: 'Send payment instructions',
    detail: 'Order details are ready. Ask customer to pay and send screenshot.'
  };
  if ((order.paymentStatus || '') === 'partial') return {
    priority: 'warn',
    title: 'Confirm remaining payment',
    detail: 'Partial payment is recorded. Verify balance before delivery.'
  };
  if (!['packed', 'out-for-delivery', 'delivered'].includes(order.deliveryStatus || 'not-started')) return {
    priority: 'warn',
    title: 'Prepare delivery or pickup',
    detail: 'Payment is ready. Pack the order and confirm delivery/pickup.'
  };
  if ((order.deliveryStatus || '') === 'packed') return { priority: 'warn', title: 'Send out for delivery', detail: 'Order is packed. Move to delivery/pickup.' };
  if ((order.deliveryStatus || '') === 'out-for-delivery') return { priority: 'warn', title: 'Confirm delivered', detail: 'Check with customer and mark delivered when complete.' };

  return { priority: 'good', title: 'Ready', detail: 'No urgent action detected.' };
};

const asksPayment = text => {
  const value = String(text || '');
  if (/\b(not payment|not a payment|not receipt|not proof|not paid)\b/i.test(value)) return false;
  return /\b(pay|payment|bank|telebirr|transfer|deposit|account|paid|receipt|screenshot)\b/i.test(value);
};

const orderConfirmationReply = (client, order) => {
  if (!order || (order.missingDetails || []).length) return '';
  if (order.customerConfirmedOrder) return ''; // Already confirmed, skip
  if (order.confirmationPromptSentAt) return ''; // Already asked, don't repeat
  order.confirmationPromptSentAt = now();
  return [
    '✅ Here\'s what I have for your order:',
    '',
    order.productName ? `📦 Product: ${[order.productCode, order.productName].filter(Boolean).join(' - ')}` : '',
    order.selectedSize ? `📏 Size: ${order.selectedSize}` : '',
    order.selectedColor ? `🎨 Color: ${order.selectedColor}` : '',
    order.quantity ? `🔢 Quantity: ${order.quantity}` : '',
    order.deliveryLocation ? `📍 Delivery: ${order.deliveryLocation}` : '',
    order.phone ? `📱 Phone: ${order.phone}` : '',
    order.total ? `💰 Total: ${order.total} Birr` : '',
    '',
    'Is this correct? Should I continue with payment?'
  ].filter(Boolean).join('\n');
};

const paymentInstructionsReply = (client, order) => {
  const instructions = String(client.settings?.businessProfile?.paymentInstructions || '').trim();
  if (!instructions || !order) return '';
  if ((order.missingDetails || []).length) return '';
  // Require customer confirmation before showing payment
  if (!order.customerConfirmedOrder) return '';
  if (!asksPayment(order?.lastMessage || '') && order.paymentPromptSentAt) return '';
  order.paymentPromptSentAt ||= now();
  order.status = order.status === 'draft' ? 'confirmed' : order.status;
  order.awaitingPaymentProof = true;
  return [
    'Your order details are ready.',
    order.productName ? `Product: ${[order.productCode, order.productName].filter(Boolean).join(' - ')}` : '',
    order.selectedSize ? `Size: ${order.selectedSize}` : '',
    order.selectedColor ? `Color: ${order.selectedColor}` : '',
    order.quantity ? `Quantity: ${order.quantity}` : '',
    order.total ? `Total: ${order.total}` : '',
    '',
    'Payment instructions:',
    instructions,
    'After paying, please send the payment screenshot here so the team can verify it.'
  ].filter(Boolean).join('\n');
};

const parsePaymentSms = text => {
  const value = String(text || '');
  const amountMatch = value.replace(/,/g, '').match(/(?:ETB|Birr|Br|USD|\$)?\s*(\d+(?:\.\d{1,2})?)\s*(?:ETB|Birr|Br|USD)?/i);
  const txMatch = value.match(/\b(?:txn|trx|transaction|ref|reference|id|receipt)\s*(?:no\.?|number|id)?\s*[:#-]?\s*([A-Z0-9-]{5,})\b/i)
    || value.match(/\b([A-Z0-9]{8,})\b/i);
  const providerMatch = value.match(/\b(telebirr|cbe|commercial bank|dashen|awash|abyssinia|boa|coop|mpesa|bank)\b/i);
  const dateMatch = value.match(/\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/);
  return {
    amount: amountMatch?.[1] || '',
    transactionId: txMatch?.[1] || '',
    provider: providerMatch?.[1] || '',
    paymentDate: dateMatch?.[0] || ''
  };
};

const paymentMatchSummary = (proof, order) => {
  const expected = order ? orderRevenue(order) : 0;
  const paid = numberFromMoney(proof?.extracted?.amount || '');
  const hasSms = Boolean(String(proof?.manualSmsText || '').trim());
  const checks = [];
  if (!order) checks.push('No order is linked yet.');
  if (order && expected && paid) checks.push(Math.abs(expected - paid) < 0.01 ? 'Amount matches the linked order.' : `Amount mismatch: order ${expected}, proof ${paid}.`);
  if (order && expected && !paid) checks.push('Proof amount is missing.');
  if (proof?.extracted?.transactionId) checks.push('Transaction/reference is captured.');
  else checks.push('Transaction/reference is missing.');
  if (hasSms) checks.push('Bank/Telebirr SMS text saved for comparison.');
  else checks.push('No bank/Telebirr SMS text saved yet.');
  const amountMatch = Boolean(order && expected && paid && Math.abs(expected - paid) < 0.01);
  const hasReference = Boolean(proof?.extracted?.transactionId);
  const status = amountMatch && hasReference && hasSms ? 'likely_matched' : order && (amountMatch || hasReference || hasSms) ? 'needs_review' : 'needs_review';
  return { status, checks };
};

const likelyOrderForProof = (data, client, conversation, proof) => {
  const orders = (data.orders || [])
    .filter(order => order.clientId === client.id && !['delivered', 'cancelled'].includes(order.status || 'draft'))
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
  const activeOrder = activeConversationOrder(data, client, conversation);
  if (activeOrder) return activeOrder;
  const chatOrder = orders.find(order => order.conversationId && order.conversationId === conversation?.id);
  if (chatOrder) return chatOrder;
  const customerKey = String(proof?.telegramChatId || proof?.username || proof?.customerName || '').toLowerCase();
  if (customerKey) {
    const customerOrder = orders.find(order => [order.telegramChatId, order.username, order.customerName, order.phone]
      .filter(Boolean)
      .some(value => customerKey.includes(String(value).toLowerCase()) || String(value).toLowerCase().includes(customerKey)));
    if (customerOrder) return customerOrder;
  }
  const amount = numberFromMoney(proof?.extracted?.amount || '');
  if (amount) {
    const amountOrder = orders.find(order => Math.abs(orderRevenue(order) - amount) < 0.01);
    if (amountOrder) return amountOrder;
  }
  return orders[0] || null;
};

const upsertServiceBooking = ({ data, client, conversation, text }) => {
  if (!isServiceBusiness(client) || !serviceBookingIntent(client, text)) return null;
  data.bookings ||= [];
  const customer = customerFromConversation(conversation, text);
  let booking = data.bookings.find(item => item.conversationId === conversation.id && !['done', 'cancelled'].includes(item.status));
  const previous = booking ? {
    phone: booking.phone || '',
    preferredDateTime: booking.preferredDateTime || '',
    locationPreference: booking.locationPreference || '',
    budget: booking.budget || '',
    requestedService: booking.requestedService || ''
  } : null;
  const isNewBooking = !booking;
  if (!booking) {
    booking = {
      id: uid('booking'),
      clientId: client.id,
      conversationId: conversation.id,
      status: 'requested',
      createdAt: now()
    };
    data.bookings.push(booking);
  }
  booking.customerName = customer.name || booking.customerName || '';
  booking.username = customer.username || booking.username || '';
  booking.telegramChatId = customer.telegramChatId || booking.telegramChatId || '';
  booking.phone = customer.phone || booking.phone || '';
  booking.requestedService = extractServiceSummary(text) || booking.requestedService || '';
  booking.budget = extractBudgetHint(text) || booking.budget || '';
  booking.preferredDateTime = extractDateTimeHint(text) || booking.preferredDateTime || '';
  booking.locationPreference = extractLocation(text) || booking.locationPreference || '';
  booking.lastMessage = String(text || '').slice(0, 500);
  booking.missingDetails = [
    !booking.phone ? 'phone number' : '',
    !booking.preferredDateTime ? 'preferred date/time' : '',
    !booking.locationPreference ? 'location or online preference' : '',
    !booking.requestedService ? 'service needed' : ''
  ].filter(Boolean);
  booking.updatedAt = now();
  conversation.lastBookingId = booking.id;
  const gainedPhone = !previous?.phone && Boolean(booking.phone);
  const gainedTime = !previous?.preferredDateTime && Boolean(booking.preferredDateTime);
  const gainedLocation = !previous?.locationPreference && Boolean(booking.locationPreference);
  const gainedBudget = !previous?.budget && Boolean(booking.budget);
  const gainedService = !previous?.requestedService && Boolean(booking.requestedService);
  const becameComplete = Boolean(previous) && [previous.phone, previous.preferredDateTime, previous.locationPreference, previous.requestedService].some(value => !value) && !booking.missingDetails.length;
  const shouldNotify = isNewBooking || gainedPhone || gainedTime || gainedLocation || gainedBudget || gainedService || becameComplete;
  const notifyReason = isNewBooking ? 'new' : becameComplete ? 'ready' : gainedPhone ? 'phone added' : gainedTime ? 'time added' : gainedLocation ? 'location added' : gainedBudget ? 'budget added' : gainedService ? 'service clarified' : 'updated';
  return { booking, isNewBooking, shouldNotify, notifyReason };
};

const bookingQuestion = booking => {
  if (!booking) return '';
  const missing = booking.missingDetails || [];
  if (!missing.length) {
    return [
      'Great, I saved this request and sent it to the team.',
      booking.requestedService ? `Service: ${booking.requestedService}` : '',
      booking.phone ? `Phone: ${booking.phone}` : '',
      booking.preferredDateTime ? `Preferred time: ${booking.preferredDateTime}` : '',
      booking.locationPreference ? `Location/preference: ${booking.locationPreference}` : '',
      booking.budget ? `Budget: ${booking.budget}` : '',
      'The team will confirm the next step shortly.'
    ].filter(Boolean).join('\n');
  }
  if (missing.includes('service needed')) return 'I can help arrange that. What service do you need help with?';
  if (missing.includes('preferred date/time')) return 'What date or time would you prefer for the call, meeting, or consultation?';
  if (missing.includes('location or online preference')) return 'Would you prefer online, phone call, or in-person? If in-person, please share the location.';
  if (missing.includes('phone number')) return 'If you want the team to follow up, please send your phone number. You can also ask me more questions here first.';
  return `Thanks, I can help arrange that. Please share your ${missing.join(', ')} so the team can confirm the booking.`;
};

const serviceSalesReply = (data, client, booking, text) => {
  if (!booking && !serviceTopicIntent(text)) return '';
  const packageHint = servicePackageReply(data, client, text);
  const capabilityHint = !packageHint ? serviceCapabilityReply(data, client, text) : '';
  const service = booking?.requestedService ? serviceLabel(booking.requestedService) : serviceLabel(text);
  const intro = [
    `Yes, ${client.businessName} can help with ${service}.`,
    packageHint || capabilityHint ? '' : 'I can guide you based on the saved services and then the team can confirm the best option.'
  ].filter(Boolean).join(' ');
  const nextQuestion = booking?.missingDetails?.includes('preferred date/time')
    ? 'What kind of result do you want from this project, and when would you like to start?'
    : booking?.missingDetails?.includes('location or online preference')
      ? 'Is this for an online project, in-person work, or both?'
      : booking?.missingDetails?.includes('phone number')
        ? 'What do you want most: a company website, online shop, lead generation, or customer automation?'
        : 'Would you like the team to contact you and prepare the next step?';
  return [
    intro,
    packageHint,
    capabilityHint,
    nextQuestion
  ].filter(Boolean).join('\n\n');
};

const bookingNextAction = booking => {
  if (!booking) return { priority: 'warn', title: 'No booking', detail: 'No service booking action is available yet.' };
  if ((booking.status || 'requested') === 'cancelled') return { priority: 'bad', title: 'Cancelled', detail: 'No action needed unless the request should be reopened.' };
  if ((booking.status || '') === 'done') return { priority: 'good', title: 'Ask for review', detail: 'Service is complete. Ask customer for feedback or testimonial.' };
  if ((booking.missingDetails || []).length) return {
    priority: 'warn',
    title: 'Collect booking details',
    detail: `Ask customer for: ${booking.missingDetails.join(', ')}.`
  };
  if ((booking.status || 'requested') === 'requested') return {
    priority: 'bad',
    title: 'Contact customer',
    detail: 'Service request has enough details. Call/message the customer and mark contacted.'
  };
  if ((booking.status || '') === 'contacted') return {
    priority: 'warn',
    title: 'Confirm appointment',
    detail: 'Customer was contacted. Confirm the schedule, quote, or next meeting.'
  };
  if ((booking.status || '') === 'confirmed') return {
    priority: 'warn',
    title: 'Deliver service',
    detail: 'Booking is confirmed. Complete the work and mark done.'
  };
  return { priority: 'good', title: 'Ready', detail: 'No urgent action detected.' };
};

const activeServiceBooking = (data, client, conversation) => {
  if (!isServiceBusiness(client)) return null;
  const bookings = (data.bookings || [])
    .filter(item => item.clientId === client.id && item.conversationId === conversation.id && !['done', 'cancelled'].includes(item.status || 'requested'))
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
  return conversation.lastBookingId
    ? bookings.find(item => item.id === conversation.lastBookingId) || bookings[0] || null
    : bookings[0] || null;
};

const bookingFlowActive = (data, client, conversation) => Boolean(activeServiceBooking(data, client, conversation));

const notifyServiceBooking = async ({ data, client, booking, reason = 'new' }) => {
  const customer = [booking.customerName, booking.username, booking.phone].filter(Boolean).join(' | ') || 'Customer from Telegram';
  const lines = [
    reason === 'new' ? `New service request for ${client.businessName}` : `Service request updated for ${client.businessName}`,
    reason !== 'new' ? `Update: ${reason}` : '',
    `Customer: ${customer}`,
    booking.requestedService ? `Service: ${booking.requestedService}` : '',
    booking.preferredDateTime ? `Preferred time: ${booking.preferredDateTime}` : '',
    booking.locationPreference ? `Location/preference: ${booking.locationPreference}` : '',
    booking.budget ? `Budget: ${booking.budget}` : '',
    booking.missingDetails?.length ? `Missing: ${booking.missingDetails.join(', ')}` : 'Ready for team follow-up',
    booking.lastMessage ? `Customer said: ${booking.lastMessage}` : ''
  ].filter(Boolean);
  await sendClientNotification(data, client, `service-booking-${booking.id}-${Date.now()}`, lines.join('\n'), 'draftOrders', 0);
};

const publicOrderCode = orderOrId => {
  const id = typeof orderOrId === 'string' ? orderOrId : orderOrId?.id;
  const short = String(id || '').slice(-8);
  return short ? `#${short}` : '';
};

const autoPaymentSelected = client => {
  if (paymentVerificationService?.modeForClient) return paymentVerificationService.modeForClient(client) === 'automatic';
  const settings = client?.settings || {};
  return String(settings.paymentVerificationMode || settings.paymentVerification?.mode || client?.paymentVerificationMode || 'manual').toLowerCase() === 'automatic';
};
const applyAutoVerifiedPayment = async ({ data, client, conversation, order, proof, ctx, result }) => {
  const verifiedAt = now();
  order.status = 'confirmed';
  order.paymentStatus = 'paid';
  order.paymentVerifiedAt = verifiedAt;
  order.paymentVerifiedBy = 'verify.et';
  order.paymentAutoVerified = true;
  order.paymentVerificationReference = result.reference || proof?.extracted?.transactionId || '';
  order.paymentVerificationRequestId = result.verifyRequestId || '';
  order.customerConfirmedOrder = true;
  order.paymentProofId = proof.id;
  order.awaitingPaymentProof = false;
  order.deliveryStatus = order.deliveryStatus === 'delivered' ? order.deliveryStatus : 'not-started';
  order.deliveryStartedAt = order.deliveryStartedAt || verifiedAt;
  order.deliveryMaxHours = Math.max(1, Number(order.deliveryMaxHours || order.deliveryEtaHours || 24) || 24);
  order.deliveryFeedbackAvailableAt = order.deliveryFeedbackAvailableAt || new Date(new Date(order.deliveryStartedAt).getTime() + (order.deliveryMaxHours * 60 * 60 * 1000 / 3)).toISOString();
  order.updatedAt = verifiedAt;

  proof.status = 'verified';
  proof.verifiedAt = verifiedAt;
  proof.verifiedBy = 'verify.et';
  proof.verificationNote = result.reason || 'Payment automatically verified by Verify.et.';
  proof.extracted ||= {};
  if (result.reference) proof.extracted.transactionId = result.reference;
  if (result.amount) proof.extracted.amount = String(result.amount);
  if (result.bank) proof.extracted.provider = result.bank;
  proof.updatedAt = verifiedAt;

  conversation.stage = 'completed';
  conversation.stageState = {};

  if (order.telegramChatId && ctx?.telegram) {
    await ctx.telegram.sendMessage(order.telegramChatId, [
      `Payment confirmed. Thank you, ${order.customerName || 'dear customer'}!`,
      '',
      'Your payment was verified automatically.',
      `Tracking code: ${publicOrderCode(order)}.`,
      `We are preparing: ${[order.productName, order.selectedSize, order.selectedColor, order.selectedOption].filter(Boolean).join(' ') || 'your order'}.`,
      '',
      `You are always welcome at ${client.businessName}.`
    ].join('\n')).catch(error => console.warn('Auto payment customer notice failed:', error.message));
  }

  await sendClientNotification(data, client, `auto-payment-${proof.id}`, [
    `Payment automatically verified for ${client.businessName}.`,
    `Order: ${publicOrderCode(order)} (${order.id})`,
    `Product: ${[order.productCode, order.productName].filter(Boolean).join(' | ')}`,
    `Total: ${order.total || 0} Birr`,
    result.reference ? `Reference: ${result.reference}` : '',
    result.verifyRequestId ? `Verify.et request: ${result.verifyRequestId}` : '',
    `Customer: ${order.customerName || proof.customerName || 'Customer'}`,
    order.phone ? `Phone: ${order.phone}` : ''
  ].filter(Boolean).join('\n'), 'orders', 0);
};

const applyDuplicatePaymentProof = async ({ data, client, conversation, order, proof, ctx, result }) => {
  const rejectedAt = now();
  proof.status = 'rejected';
  proof.verificationNote = result.reason || 'Duplicate payment reference.';
  proof.updatedAt = rejectedAt;
  order.paymentStatus = 'rejected';
  order.paymentRejectedAt = rejectedAt;
  order.paymentProofId = proof.id;
  order.updatedAt = rejectedAt;
  conversation.stage = 'awaiting_payment_proof';
  conversation.stageState = { stage: 'awaiting_payment_proof', orderId: order.id };
  if (order.telegramChatId && ctx?.telegram) {
    await ctx.telegram.sendMessage(
      order.telegramChatId,
      'We could not accept that payment proof because the transaction reference was already used. Please send the correct payment proof or contact support.'
    ).catch(error => console.warn('Duplicate payment notice failed:', error.message));
  }
  await sendClientNotification(data, client, `duplicate-payment-${proof.id}`, [
    `Duplicate payment reference blocked for ${client.businessName}.`,
    `Order: ${publicOrderCode(order)} (${order.id})`,
    result.reference ? `Reference: ${result.reference}` : '',
    result.reason || ''
  ].filter(Boolean).join('\n'), 'orders', 0);
};

const recordPaymentProof = async ({ data, client, conversation, ctx }) => {
  data.paymentProofs ||= [];
  const photos = ctx.message?.photo || [];
  const photo = photos[photos.length - 1];
  if (!photo) return null;
  const customer = telegramCustomer(ctx);
  const proof = {
    id: uid('proof'),
    clientId: client.id,
    conversationId: conversation.id,
    orderId: '',
    telegramFileId: photo.file_id,
    caption: String(ctx.message.caption || ''),
    customerName: customer.name || '',
    username: customer.username || '',
    telegramChatId: customer.telegramChatId || '',
    status: 'pending',
    extracted: {
      payerName: '',
      transactionId: '',
      amount: '',
      paymentDate: '',
      provider: '',
      note: 'AI extraction not enabled yet.'
    },
    verificationNote: '',
    createdAt: now()
  };
  const smsExtracted = parsePaymentSms(`${proof.caption}\n${ctx.message?.text || ''}`);
  proof.extracted = {
    ...proof.extracted,
    ...Object.fromEntries(Object.entries(smsExtracted).filter(([, value]) => value))
  };
  const currentOrder = likelyOrderForProof(data, client, conversation, proof);
  proof.orderId = currentOrder?.id || '';
  proof.match = paymentMatchSummary(proof, currentOrder);
  data.paymentProofs.push(proof);
  if (currentOrder) {
    currentOrder.paymentProofId = proof.id;
    currentOrder.paymentStatus = 'pending_verification';
    currentOrder.status = currentOrder.status === 'draft' ? 'confirmed' : currentOrder.status;
    currentOrder.awaitingPaymentProof = false;
    currentOrder.updatedAt = now();
  }

  if (currentOrder && autoPaymentSelected(client)) {
    const autoResult = paymentVerificationService?.verifyPaymentProof
      ? await paymentVerificationService.verifyPaymentProof({ data, client, order: currentOrder, proof })
      : { action: 'manual_review', reason: 'Payment verifier is not configured.' };
    if (autoResult.action === 'verified') {
      await applyAutoVerifiedPayment({ data, client, conversation, order: currentOrder, proof, ctx, result: autoResult });
      return proof;
    }
    if (autoResult.action === 'duplicate') {
      await applyDuplicatePaymentProof({ data, client, conversation, order: currentOrder, proof, ctx, result: autoResult });
      return proof;
    }
    const updatedAt = now();
    proof.status = 'auto_verification_failed';
    proof.verificationNote = autoResult.reason || proof.verificationNote || 'Automatic payment verification could not complete.';
    proof.updatedAt = updatedAt;
    currentOrder.paymentStatus = 'awaiting_screenshot';
    currentOrder.awaitingPaymentProof = true;
    currentOrder.updatedAt = updatedAt;
    conversation.stage = 'awaiting_payment_proof';
    conversation.stageState = { stage: 'awaiting_payment_proof', orderId: currentOrder.id };
    await sendClientNotification(data, client, `auto-payment-review-${proof.id}`, [
      `Automatic payment verification could not safely verify a payment for ${client.businessName}.`,
      `Order: ${publicOrderCode(currentOrder)} (${currentOrder.id})`,
      autoResult.reason ? `Reason: ${autoResult.reason}` : '',
      'The shopper was asked to resend the SMS/reference or contact support. No manual approval button was sent.'
    ].filter(Boolean).join('\n'), 'orders', 30);
    return proof;
  }

  const ownerChatId = ownerPrivateChatId(client);
  const ownerLines = [
    `SprintSales Automation`,
    `Business: ${client.businessName}`,
    `Payment proof received`,
    currentOrder ? `Order: ${currentOrder.id}` : 'Order: not matched',
    currentOrder ? `Product: ${currentOrder.productCode || ''} ${currentOrder.productName || ''}`.trim() : '',
    currentOrder?.quantity ? `Quantity: ${currentOrder.quantity}` : '',
    currentOrder?.selectedSize ? `Size: ${currentOrder.selectedSize}` : '',
    currentOrder?.selectedColor ? `Color: ${currentOrder.selectedColor}` : '',
    currentOrder?.selectedOption ? `Option: ${currentOrder.selectedOption}` : '',
    currentOrder?.discountAmount && Number(currentOrder.discountAmount) ? `Discount: ${currentOrder.discountLabel || currentOrder.discountReason} (-${currentOrder.discountAmount} Birr)` : '',
    currentOrder?.total ? `Expected total: ${currentOrder.total} Birr` : '',
    proof.extracted?.amount ? `Proof amount: ${proof.extracted.amount}` : '',
    proof.extracted?.transactionId ? `Transaction/ref: ${proof.extracted.transactionId}` : '',
    `Customer: ${[proof.customerName, proof.username].filter(Boolean).join(' | ') || proof.telegramChatId}`,
    currentOrder?.phone ? `Phone: ${currentOrder.phone}` : '',
    currentOrder?.deliveryLocation ? `Address: ${currentOrder.deliveryLocation}` : '',
    proof.caption ? `Caption: ${proof.caption}` : '',
    '',
    'Please review the proof and choose an action.'
  ].filter(Boolean);

  if (ownerChatId && ctx?.telegram && photo?.file_id) {
    try {
      await ctx.telegram.sendPhoto(ownerChatId, photo.file_id, {
        caption: ownerLines.join('\n'),
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Confirm Payment', callback_data: `productflow:owner_confirm:${currentOrder?.id || proof.id}` }],
            [{ text: 'Ask Customer to Resend', callback_data: `productflow:owner_reject:${currentOrder?.id || proof.id}` }]
          ]
        }
      });
    } catch (error) {
      console.warn(`Payment proof photo forward failed for ${client.businessName}:`, error.message);
      await sendClientNotification(data, client, `payment-proof-${proof.id}`, ownerLines.join('\n'), 'hotLeads', 0);
    }
  } else {
    await sendClientNotification(data, client, `payment-proof-${proof.id}`, ownerLines.join('\n'), 'hotLeads', 0);
  }
  return proof;
};

const telegramCustomer = ctx => {
  const from = ctx.from || {};
  const name = [from.first_name, from.last_name].filter(Boolean).join(' ').trim();
  return {
    telegramUserId: from.id ? String(from.id) : '',
    telegramChatId: ctx.chat?.id ? String(ctx.chat.id) : '',
    name,
    username: from.username ? `@${from.username}` : '',
    birthdate: from.birthdate || from.birthday || null
  };
};

// === CUSTOMER NAME EXTRACTION (improves personalization) ===
const extractCustomerNameFromText = text => {
  const lower = String(text || '').toLowerCase();
  // Pattern: "my name is X", "I am X", "I'm X", "this is X", "call me X"
  const namePatterns = [
    /(?:my name(?:'s| is) |i(?:'m| am) |call me |this is )([a-z]{2,20}(?: [a-z]{2,20})?)/i,
    /(?:name(?:'s| is) )([a-z]{2,20}(?: [a-z]{2,20})?)/i
  ];
  for (const pattern of namePatterns) {
    const match = lower.match(pattern);
    if (match) {
      const rawName = match[1].trim();
      // Capitalize first letter of each word
      return rawName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
  }
  return '';
};

const leadCustomerLabel = lead => {
  return [lead.name, lead.username, lead.phone].filter(Boolean).join(' | ') || `Telegram chat ${lead.telegramChatId || ''}`.trim();
};

const notifyHotLead = async ({ data, client, lead, isNewLead }) => {
  const lines = [
    isNewLead ? `New hot lead for ${client.businessName}` : `Hot lead updated for ${client.businessName}`,
    `Customer: ${leadCustomerLabel(lead)}`,
    `Score: ${lead.score}`,
    lead.intents?.length ? `Intent: ${lead.intents.join(', ')}` : '',
    lead.lastMessage ? `Last message: ${lead.lastMessage}` : ''
  ].filter(Boolean);
  await sendClientNotification(data, client, `hot-lead-${lead.id}`, lines.join('\n'), 'hotLeads', isNewLead ? 0 : 30);
};

const notifyDraftOrder = async ({ data, client, order, reason = 'new' }) => {
  const customer = [order.customerName, order.username, order.phone].filter(Boolean).join(' | ') || 'Customer from Telegram';
  const isDeliveryReview = order.deliveryStatus === 'delivery_review_needed';
  const lines = [];

  if (isDeliveryReview) {
    lines.push(`🚚 DELIVERY REVIEW NEEDED — ${client.businessName}`);
    lines.push(`Please confirm delivery fee manually.`);
    lines.push('');
    lines.push(`Customer: ${customer}`);
    lines.push(`Product: ${[order.productCode, order.productName].filter(Boolean).join(' - ')}`);
    lines.push(`Quantity: ${order.quantity || 1}`);
    if (order.selectedSize) lines.push(`Size: ${order.selectedSize}`);
    if (order.selectedColor) lines.push(`Color: ${order.selectedColor}`);
    lines.push(`📍 Delivery location: ${order.deliveryLocation || 'Not provided'}`);
    lines.push(`Reason: Outside Addis Ababa area — standard fee does not apply.`);
    if (order.lastMessage) lines.push(`Customer said: ${order.lastMessage}`);
    if (order.phone) lines.push(`Customer phone: ${order.phone}`);
    lines.push('');
    lines.push(`⚡ Action: Confirm or set a delivery fee manually.`);
  } else {
    lines.push(reason === 'new' ? `🆕 New draft order for ${client.businessName}` : `📝 Draft order updated for ${client.businessName}`);
    if (reason !== 'new') lines.push(`Update: ${reason}`);
    lines.push(`Product: ${[order.productCode, order.productName].filter(Boolean).join(' - ')}`);
    lines.push(`Customer: ${customer}`);
    lines.push(`Quantity: ${order.quantity || 1}`);
    if (order.selectedSize) lines.push(`Size: ${order.selectedSize}`);
    if (order.selectedColor) lines.push(`Color: ${order.selectedColor}`);
    if (order.deliveryLocation) lines.push(`Delivery: ${order.deliveryLocation}`);
    if (order.missingDetails?.length) lines.push(`Missing: ${order.missingDetails.join(', ')}`);
    if (order.unitPrice) lines.push(`Unit price: ${order.unitPrice}`);
    if (order.total) lines.push(`Total: ${order.total}`);
    if (order.status) lines.push(`Order status: ${order.status}`);
    if (order.paymentStatus) lines.push(`Payment: ${order.paymentStatus}`);
    if (order.lastMessage) lines.push(`Customer said: ${order.lastMessage}`);
  }

  await sendClientNotification(data, client, `draft-order-${order.id}-${Date.now()}`, lines.join('\n'), 'draftOrders', 0);
};

const notifyLowStock = async ({ data, client, product }) => {
  const stock = productStock(product);
  const threshold = productLowStockThreshold(product);
  if (!threshold || stock > threshold) return false;
  const lines = [
    `Low stock warning for ${client.businessName}`,
    `Product: ${[product.code, product.name].filter(Boolean).join(' - ')}`,
    `Stock left: ${stock}`,
    `Low-stock alert level: ${threshold}`
  ];
  return sendClientNotification(data, client, `low-stock-${product.id}-${stock}`, lines.join('\n'), 'lowStock', 12 * 60);
};

const upsertHotLead = async ({ data, client, conversation, ctx, text, leadScore }) => {
  const customer = telegramCustomer(ctx);
  const phone = extractPhoneNumber(text);
  const intents = detectLeadIntents(text);
  const leadSource = detectLeadSource(text);
  let lead = data.leads.find(item => item.conversationId === conversation.id);
  const shouldCreate = conversation.leadScore >= 3 || phone || leadSource || intents.includes('Purchase') || intents.includes('Booking') || intents.includes('Ad source');
  if (!lead && !shouldCreate) return;

  const previousPhone = lead?.phone || '';
  const isNewLead = !lead;
  if (!lead) {
    lead = {
      id: uid('lead'),
      clientId: client.id,
      conversationId: conversation.id,
      status: 'new',
      priority: 'hot',
      notes: '',
      createdAt: now()
    };
    data.leads.push(lead);
  }

  lead.name = customer.name || lead.name || '';
  lead.username = customer.username || lead.username || '';
  lead.telegramUserId = customer.telegramUserId || lead.telegramUserId || '';
  lead.telegramChatId = customer.telegramChatId || lead.telegramChatId || '';
  lead.phone = phone || lead.phone || '';
  lead.source = leadSource || lead.source || '';
  lead.intents = [...new Set([...(lead.intents || []), ...intents])];
  lead.lastMessage = String(text || '').slice(0, 500);
  lead.summary = lead.lastMessage.slice(0, 240);
  lead.score = Math.max(Number(lead.score || 0), Number(conversation.leadScore || 0));
  if (!lead.priority) lead.priority = lead.score >= 5 ? 'hot' : lead.score >= 3 ? 'warm' : 'cold';
  lead.lastSignalScore = leadScore;
  lead.updatedAt = now();

  const gainedPhone = !previousPhone && lead.phone;
  if (isNewLead || gainedPhone) await notifyHotLead({ data, client, lead, isNewLead });
};

const customerFromConversation = (conversation, text = '') => ({
  name: conversation.customer?.name || '',
  username: conversation.customer?.username || '',
  telegramUserId: conversation.customer?.telegramUserId || '',
  telegramChatId: conversation.customer?.telegramChatId || conversation.telegramChatId || '',
  phone: extractPhoneNumber(text)
});

const activeConversationOrder = (data, client, conversation) => {
  const orders = (data.orders || [])
    .filter(item =>
      item.clientId === client.id &&
      item.conversationId === conversation.id &&
      ['draft', 'confirmed'].includes(item.status || 'draft')
    )
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
  return conversation.lastOrderId
    ? orders.find(item => item.id === conversation.lastOrderId) || orders[0] || null
    : orders[0] || null;
};

const productFromOrder = (data, order) => {
  if (!order) return null;
  return (data.products || []).find(product =>
    product.id === order.productId ||
    (order.productCode && String(product.code || '').toLowerCase() === String(order.productCode).toLowerCase())
  ) || null;
};

const orderFlowActive = (data, client, conversation) => Boolean(activeConversationOrder(data, client, conversation));

const conversationProductForMessage = (data, client, conversation, text, classification) => {
  const exactProduct = findExactProductCode(data, client.id, text);
  if (exactProduct) return exactProduct;
  if (broadProductAvailabilityIntent(text)) return null;
  // Photo/image requests: prioritize the conversation's current product (lastProductId)
  const photoRequest = /\b(?:photo|image|picture|pic|send (?:me )?(?:the )?(?:photo|image|picture|pic)|show (?:me )?(?:the )?(?:photo|image|picture|pic|item|product)|can (?:i|you) see|let me see|look at|send it)\b/i.test(text);
  const mentionedProduct = findProductMention(data, client.id, text);
  if (mentionedProduct) return mentionedProduct;
  if (photoRequest && conversation.lastProductId) {
    const lastProduct = (data.products || []).find(p => p.id === conversation.lastProductId && p.isActive !== false);
    if (lastProduct) return lastProduct;
  }
  if (productSampleIntent(text) && productChoicesFromMemory(data, client.id, conversation).length > 1) return null;
  const fitQuestion = businessFitIntent(text);
  if (classification?.useProductContext || classification?.useOrderContext || realProductOrderIntent(text) || (orderDetailIntent(text) && !fitQuestion)) {
    return findConversationProduct(data, conversation) ||
      productFromOrder(data, activeConversationOrder(data, client, conversation)) ||
      findRecentProductFromMessages(data, conversation);
  }
  return null;
};

const upsertDraftOrder = async ({ data, client, conversation, product, text }) => {
  const existingOrder = activeConversationOrder(data, client, conversation);
  if (!product || (!realProductOrderIntent(text) && !(existingOrder && orderAnswerIntent(text, product) && !businessFitIntent(text)))) return null;
  data.orders ||= [];
  const customer = customerFromConversation(conversation, text);
  const quantity = extractQuantity(text);
  const hasQuantity = hasQuantitySignal(text);
  const selectedSize = extractChoice(text, product.sizes);
  const selectedColor = extractChoice(text, product.colors);
  const deliveryLocation = extractLocation(text);
  const unitPrice = productPrice(product);
  let order = existingOrder || data.orders.find(item =>
    item.clientId === client.id &&
    item.conversationId === conversation.id &&
    item.productId === product.id &&
    ['draft', 'confirmed'].includes(item.status)
  );
  const previous = order ? {
    phone: order.phone || '',
    selectedSize: order.selectedSize || '',
    selectedColor: order.selectedColor || '',
    deliveryLocation: order.deliveryLocation || '',
    quantity: order.quantity || '',
    missingDetails: [...(order.missingDetails || [])]
  } : null;
  const isNewOrder = !order;
  if (!order) {
    order = {
      id: uid('order'),
      clientId: client.id,
      conversationId: conversation.id,
      leadId: (data.leads || []).find(lead => lead.conversationId === conversation.id)?.id || '',
      status: 'draft',
      paymentStatus: 'unpaid',
      deliveryStatus: 'not-started',
      customer_latitude: null,
      customer_longitude: null,
      delivery_distance_km: null,
      delivery_fee_source: 'unknown',
      createdAt: now()
    };
    data.orders.push(order);
  }
  order.productId = product.id;
  order.productCode = product.code || '';
  order.productName = product.name || '';
  order.quantity = hasQuantity || !order.quantity ? quantity : order.quantity;
  order.selectedSize = selectedSize || order.selectedSize || '';
  order.selectedColor = selectedColor || order.selectedColor || '';
  order.preferredDateTime = extractDateTimeHint(text) || order.preferredDateTime || '';
  order.unitPrice = unitPrice;
  order.total = unitPrice && !Number.isNaN(Number(unitPrice)) ? String(Number(unitPrice) * Number(order.quantity || 1)) : '';
  order.customerName = customer.name || order.customerName || '';
  order.username = customer.username || order.username || '';
  order.telegramUserId = customer.telegramUserId || order.telegramUserId || '';
  order.telegramChatId = customer.telegramChatId || order.telegramChatId || '';
  order.phone = customer.phone || order.phone || '';
  order.deliveryLocation = deliveryLocation || order.deliveryLocation || '';
  order.orderDetails = [
    order.selectedSize ? `Size: ${order.selectedSize}` : '',
    order.selectedColor ? `Color: ${order.selectedColor}` : '',
    order.deliveryLocation ? `Delivery/location: ${order.deliveryLocation}` : '',
    order.preferredDateTime ? `Timing: ${order.preferredDateTime}` : ''
  ].filter(Boolean).join(' | ');
  order.lastMessage = String(text || '').slice(0, 500);

  // Try DeepSeek AI fallback for missing fields
  console.log(`[AI] DeepSeek extraction attempted for order (${client?.businessName || 'unknown'})`);
  if (!order.phone || !order.deliveryLocation || (product.sizes && !order.selectedSize) || (product.colors && !order.selectedColor)) {
    const globalKeys = data?.platformSettings?.aiGlobalKeys || {};
    const deepseekKey = resolveProviderKey(client?.settings, 'deepseek', globalKeys).apiKey;
    if (deepseekKey) {
      try {
        const aiExtraction = await extractOrderDetails({ apiKey: deepseekKey, text, product });
        if (aiExtraction) {
          // Only fill fields still missing from rule-based extraction
          if (!order.phone && aiExtraction.phone) {
            order.phone = aiExtraction.phone;
          }
          if (!order.deliveryLocation && (aiExtraction.address || aiExtraction.city)) {
            order.deliveryLocation = [aiExtraction.address, aiExtraction.city].filter(Boolean).join(', ');
          }
          if (!order.selectedSize && aiExtraction.option) {
            order.selectedSize = aiExtraction.option;
          }
          if (!order.selectedColor && aiExtraction.color) {
            order.selectedColor = aiExtraction.color;
          }
          if (!order.customerName && aiExtraction.name) {
            order.customerName = aiExtraction.name;
          }
          // Log which fields were filled by AI
          const filledFields = [];
          if (!previous?.phone && order.phone) filledFields.push('phone');
          if (!previous?.selectedSize && order.selectedSize) filledFields.push('size');
          if (!previous?.selectedColor && order.selectedColor) filledFields.push('color');
          if (!previous?.deliveryLocation && order.deliveryLocation) filledFields.push('deliveryLocation');
          if (!previous?.customerName && order.customerName) filledFields.push('name');
          if (filledFields.length > 0) {
            console.log(`[AI] DeepSeek extraction filled: ${filledFields.join(', ')} for order ${order.id} (${client?.businessName || 'unknown'})`);
          }
        }
      } catch (aiError) {
        // AI fallback failed silently — keep rule-based result
        console.log(`AI extraction fallback skipped: ${aiError.message}`);
      }
    }
  }

  const missing = [];
  if (product.sizes && !order.selectedSize) missing.push('size');
  if (product.colors && !order.selectedColor) missing.push('color');
  if (!order.phone) missing.push('phone');
  if (!order.deliveryLocation) missing.push('delivery location');
  order.missingDetails = missing;

  // Delivery fee based on client settings
  const deliverySettings = client?.settings?.delivery || defaultSettings().delivery;
  const deliveryInAddis = !!order.deliveryLocation && isAddisAbabaLocation(order.deliveryLocation);
  let deliveryFee = 0;
  let deliveryFeeSource = 'unknown';

  if (deliveryInAddis) {
    // Use client's configured Addis fee or default 300
    deliveryFee = Number.isFinite(Number(deliverySettings.addis_delivery_fee))
      ? Math.max(0, Number(deliverySettings.addis_delivery_fee))
      : 300;
    deliveryFeeSource = 'fixed_addis';
    order.deliveryStatus = deliverySettings.mode === 'fixed_addis' ? 'not-started' : 'pending';
    if (order.total) {
      const subtotal = Number(order.total) || 0;
      order.total = String(subtotal + deliveryFee);
    } else if (unitPrice) {
      const subtotal = Number(unitPrice) * Number(order.quantity || 1);
      order.total = String(subtotal + deliveryFee);
    }
    order.deliveryNote = `Includes ${deliveryFee} ETB delivery fee (Addis Ababa area)`;
  } else if (order.deliveryLocation) {
    // Outside Addis or unclear location → mark for manual review
    deliveryFeeSource = 'manual';
    order.deliveryStatus = 'delivery_review_needed';
    order.deliveryNote = 'Delivery fee needs owner confirmation (outside Addis Ababa area)';
  } else {
    // No location yet
    deliveryFeeSource = 'unknown';
    order.deliveryNote = '';
  }

  order.deliveryFee = deliveryFee;
  order.delivery_fee_source = deliveryFeeSource;
  order.deliveryNote ||= '';
  order.notes ||= '';
  order.updatedAt = now();
  conversation.lastOrderId = order.id;
  const gainedPhone = !previous?.phone && Boolean(order.phone);
  const gainedSize = !previous?.selectedSize && Boolean(order.selectedSize);
  const gainedColor = !previous?.selectedColor && Boolean(order.selectedColor);
  const gainedDelivery = !previous?.deliveryLocation && Boolean(order.deliveryLocation);
  const quantityChanged = previous && String(previous.quantity || '') !== String(order.quantity || '');
  const becameComplete = (previous?.missingDetails || []).length > 0 && order.missingDetails.length === 0;
  const shouldNotify = isNewOrder || gainedPhone || gainedSize || gainedColor || gainedDelivery || quantityChanged || becameComplete || asksPayment(text);
  const notifyReason = isNewOrder ? 'new' : becameComplete ? 'ready' : gainedPhone ? 'phone added' : gainedDelivery ? 'delivery added' : gainedSize || gainedColor ? 'variant added' : quantityChanged ? 'quantity changed' : asksPayment(text) ? 'payment requested' : 'updated';
  return { order, isNewOrder, shouldNotify, notifyReason };
};


const formatFollowUpMessage = (template, client, lead) => {
  const fallback = defaultSettings().followUpMessage;
  const message = String(template || fallback);
  const name = lead.name || lead.username || 'there';
  const interest = lead.intents?.length ? lead.intents.join(', ').toLowerCase() : 'your request';
  return message
    .replaceAll('{name}', name)
    .replaceAll('{business}', client.businessName)
    .replaceAll('{interest}', interest)
    .slice(0, 900);
};

const shouldSendFollowUp = (client, lead) => {
  const settings = client.settings || {};
  if (!settings.followUpsEnabled) return false;
  if (!lead.telegramChatId) return false;
  if (['archived', 'won', 'lost'].includes(lead.status)) return false;
  const maxFollowUps = Math.min(3, Math.max(1, Number(settings.maxFollowUps || 1)));
  if (Number(lead.followUpsSent || 0) >= maxFollowUps) return false;
  const startedAt = settings.followUpsStartedAt ? new Date(settings.followUpsStartedAt).getTime() : 0;
  const leadTime = new Date(lead.updatedAt || lead.createdAt || 0).getTime();
  if (startedAt && leadTime < startedAt) return false;
  const delayMs = Math.min(168, Math.max(1, Number(settings.followUpDelayHours || 24))) * 60 * 60 * 1000;
  const lastRelevantAt = Math.max(
    leadTime || 0,
    lead.lastFollowUpAt ? new Date(lead.lastFollowUpAt).getTime() : 0
  );
  return Date.now() - lastRelevantAt >= delayMs;
};

const recentManualClear = client => {
  const review = client.qualityReview || {};
  if (review.status !== 'cleared' || !review.updatedAt) return false;
  return Date.now() - new Date(review.updatedAt).getTime() < 7 * 24 * 60 * 60 * 1000;
};

const formatQualityWarningMessage = (client, quality, events = []) => {
  const signals = quality.signals || {};
  const status = String(quality.trustStatus || 'watch').replace(/_/g, ' ');
  const topEvents = events.slice(0, 3).map(event => `- ${event.title}: ${event.detail}`).join('\n');
  return [
    `Hello ${client.businessName}, we noticed a quality/control issue that needs your attention.`,
    '',
    `Current review status: ${status}`,
    `Quality score: ${quality.score}/100`,
    '',
    'What happened:',
    `- Low ratings in 30 days: ${signals.lowRatings30d || 0}`,
    `- Delivery issue reports in 30 days: ${signals.lateReports30d || 0}`,
    `- Overdue active deliveries: ${signals.overdueDeliveries || 0}`,
    `- Severe non-delivery risks: ${signals.severeNonDelivery || 0}`,
    `- Open support conversations: ${signals.openSupport || 0}`,
    '',
    topEvents ? `Recent evidence:\n${topEvents}` : '',
    '',
    'What you should do now:',
    '- Review the affected orders.',
    '- Contact customers who are waiting.',
    '- Update delivery status honestly.',
    '- Answer open support questions.',
    '',
    'This is a warning only. No automatic suspension has been applied.'
  ].filter(Boolean).join('\n');
};

const sendQualityNotifications = async (data, client) => {
  if (typeof clientQualityScore !== 'function') return false;
  if (recentManualClear(client)) return false;
  const quality = clientQualityScore(data, client);
  const status = quality.trustStatus || 'healthy';
  if (!['watch', 'under_review', 'restricted_candidate'].includes(status)) return false;
  let events = typeof clientQualityEvents === 'function' ? clientQualityEvents(data, client) : [];
  events = events.filter(event => event.type !== 'unanswered_question' && event.type !== 'open_support');
  if (!events.length && status === 'watch') return false;
  const message = formatQualityWarningMessage(client, quality, events);
  const minMinutes = status === 'watch' ? 72 * 60 : status === 'under_review' ? 24 * 60 : 12 * 60;
  const clientSent = await sendClientNotification(
    data,
    client,
    `quality-${client.id}-${status}`,
    message,
    'qualityAlerts',
    minMinutes
  );
  let adminSent = false;
  if (status !== 'watch') {
    adminSent = await sendAdminAlert(
      data,
      `quality-${client.id}-${status}`,
      `[Quality Review]\n${message}`,
      minMinutes
    );
  }
  return clientSent || adminSent;
};

const sendDueFollowUps = async () => {
  const data = await readData();
  let changed = false;
  for (const client of data.clients) {
    await sendQualityNotifications(data, client).catch(error => console.error(`Quality notification failed for ${client.businessName}:`, error.message));
    if (client.status === 'paused' || !client.settings?.isActive || client.settings.automationType === 'account') continue;
    const bot = botRunners.get(client.id);
    if (!bot) continue;
    const leads = data.leads.filter(lead => lead.clientId === client.id && shouldSendFollowUp(client, lead));
    for (const lead of leads) {
      const conversation = data.conversations.find(item => item.id === lead.conversationId);
      const text = formatFollowUpMessage(client.settings.followUpMessage, client, lead);
      await bot.telegram.sendMessage(lead.telegramChatId, text).then(() => {
        lead.followUpsSent = Number(lead.followUpsSent || 0) + 1;
        lead.lastFollowUpAt = now();
        lead.updatedAt = now();
        data.messages.push({
          id: uid('msg'),
          clientId: client.id,
          conversationId: lead.conversationId,
          direction: 'outbound',
          text,
          createdAt: now(),
          source: 'follow_up'
        });
        changed = true;
      }).catch(error => console.error(`Follow-up failed for ${client.businessName}:`, error.message));
      if (conversation) conversation.updatedAt = now();
    }

    if (client.settings?.legacyCheckoutFollowUpsEnabled === true) {
      const abandonedConversations = (data.conversations || []).filter(conversation =>
        conversation.clientId === client.id &&
        ['order_collection', 'order_confirmation', 'promo_code'].includes(conversation.stage || '') &&
        conversation.telegramChatId &&
        Number(conversation.checkoutFollowUpsSent || 0) < 2
      );
      for (const conversation of abandonedConversations) {
        const lastAt = new Date(conversation.lastCheckoutFollowUpAt || conversation.updatedAt || conversation.createdAt || 0).getTime();
        const sent = Number(conversation.checkoutFollowUpsSent || 0);
        const delayHours = sent === 0 ? 4 : 24;
        if (!lastAt || Date.now() - lastAt < delayHours * 60 * 60 * 1000) continue;
        const productName = conversation.stageState?.productName || conversation.stageState?.order?.productName || 'that item';
        const text = sent === 0
          ? `Still thinking about ${productName}? I can keep helping you with size, color, delivery, or payment questions.`
          : `Quick reminder from ${client.businessName}: your order for ${productName} is still open. No pressure, just tap Browse Products whenever you are ready.`;
        await bot.telegram.sendMessage(conversation.telegramChatId, text, {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Continue Shopping', callback_data: 'productflow:explore' }],
              [{ text: 'Talk to Support', callback_data: 'productflow:support' }]
            ]
          }
        }).then(() => {
          conversation.checkoutFollowUpsSent = sent + 1;
          conversation.lastCheckoutFollowUpAt = now();
          conversation.updatedAt = now();
          data.messages.push({
            id: uid('msg'),
            clientId: client.id,
            conversationId: conversation.id,
            direction: 'outbound',
            text,
            createdAt: now(),
            source: 'checkout_follow_up'
          });
          changed = true;
        }).catch(error => console.error(`Checkout follow-up failed for ${client.businessName}:`, error.message));
      }
    }

    if (client.settings?.paymentFollowUpsEnabled !== false) {
      const unpaidOrders = (data.orders || []).filter(order =>
        order.clientId === client.id &&
        order.telegramChatId &&
        order.status === 'confirmed' &&
        order.paymentStatus === 'awaiting_screenshot' &&
        Number(order.paymentFollowUpsSent || 0) < 2
      );
      for (const order of unpaidOrders) {
        const lastAt = new Date(order.lastPaymentFollowUpAt || order.confirmedAt || order.updatedAt || 0).getTime();
        const sent = Number(order.paymentFollowUpsSent || 0);
        const delayHours = sent === 0 ? 4 : 24;
        if (!lastAt || Date.now() - lastAt < delayHours * 60 * 60 * 1000) continue;
        const text = sent === 0
          ? (autoPaymentSelected(client)
              ? `Your order ${order.id} is ready for payment confirmation. After paying, please paste the bank/Telebirr SMS or transaction reference here so I can verify it automatically.`
              : `Your order ${order.id} is ready for payment confirmation. After paying, please send the payment screenshot here so the team can prepare delivery.`)
          : `Final reminder for order ${order.id}: payment proof is still missing. If you changed your mind, no problem; you can browse again anytime.`;
        await bot.telegram.sendMessage(order.telegramChatId, text, {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Submit Payment Proof', callback_data: 'productflow:payment_proof' }],
              [{ text: 'Talk to Support', callback_data: 'productflow:support' }]
            ]
          }
        }).then(() => {
          order.paymentFollowUpsSent = sent + 1;
          order.lastPaymentFollowUpAt = now();
          order.updatedAt = now();
          data.messages.push({
            id: uid('msg'),
            clientId: client.id,
            conversationId: order.conversationId,
            direction: 'outbound',
            text,
            createdAt: now(),
            source: 'payment_follow_up'
          });
          changed = true;
        }).catch(error => console.error(`Payment follow-up failed for ${client.businessName}:`, error.message));
      }
    }

    if (client.settings?.reviewRequestsEnabled !== false) {
      const reviewOrders = (data.orders || []).filter(order =>
        order.clientId === client.id &&
        order.telegramChatId &&
        (order.deliveryStatus === 'delivered' || order.status === 'delivered') &&
        !order.reviewRequestedAt &&
        !order.reviewSubmittedAt
      );
      for (const order of reviewOrders) {
        const dueAt = order.reviewDueAt
          ? new Date(order.reviewDueAt).getTime()
          : new Date(order.deliveredAt || order.updatedAt || 0).getTime() + Math.max(1, Number(client.settings.reviewRequestDelayHours || 3)) * 60 * 60 * 1000;
        if (!dueAt || Date.now() < dueAt) continue;
        const text = `How would you rate the quality of your order from ${client.businessName}?\n\nOrder: ${order.id}\nProduct: ${order.productName || 'your item'}`;
        await bot.telegram.sendMessage(order.telegramChatId, text, {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '1', callback_data: `productflow:review_rating:${order.id}:1` },
                { text: '2', callback_data: `productflow:review_rating:${order.id}:2` },
                { text: '3', callback_data: `productflow:review_rating:${order.id}:3` },
                { text: '4', callback_data: `productflow:review_rating:${order.id}:4` },
                { text: '5', callback_data: `productflow:review_rating:${order.id}:5` }
              ],
              [{ text: 'Talk to Support', callback_data: 'productflow:support' }]
            ]
          }
        }).then(() => {
          order.reviewRequestedAt = now();
          order.reviewStatus = 'requested';
          order.updatedAt = now();
          data.messages.push({
            id: uid('msg'),
            clientId: client.id,
            conversationId: order.conversationId,
            direction: 'outbound',
            text,
            createdAt: now(),
            source: 'review_request'
          });
          changed = true;
        }).catch(error => console.error(`Review request failed for ${client.businessName}:`, error.message));
      }
    }
  }
  if (changed) await writeData(data);
};

const salesStages = ['new', 'exploring', 'interested', 'objection', 'negotiating', 'ready_to_buy', 'follow_up', 'closed', 'lost'];

const classifySalesStage = (text, conversation) => {
  const lower = String(text || '').toLowerCase();
  const previousStage = conversation?.salesStage || 'new';

  // Detect readiness signals
  if (/\b(order|buy|purchase|sign me|let'(ve)?s (start|do it|go)|start now|book|schedule|i want (to|it)|how do i|send me|pay|payment|deposit)\b/i.test(lower)) return 'ready_to_buy';
  if (/\b(not interested|no thanks|stop|don't contact|leave me|remove)\b/i.test(lower)) return 'lost';
  if (/\b(expensive|too much|costly|discount|cheap|budget|out of (my|our) budget|afford|overpriced|can you reduce|last price|payment plan|installment)\b/i.test(lower)) return 'negotiating';
  if (/\b(why you|why should|trust|guarantee|scam|legit|compare|competitor|someone else|think about it|not sure|maybe later|i'll (get|come) back|let me think|need to (talk|discuss|check|ask)|let me check)\b/i.test(lower)) return 'objection';
  if (/\b(how much|price|cost|what (is|are) the|tell me (more|about)|explain|details|options|packages|services?|pricing|what do you|can you|i need|i want|looking for|interested in)\b/i.test(lower)) return 'exploring';
  if (/\b(yes|yeah|ok|okay|great|sure|tell me|i'm (interested|ready)|that sounds|that works|let's|send|go ahead)\b/i.test(lower)) return 'interested';
  if (/\b(price|cost|how much|pricing|bill|fee|charge|monthly|one.time)\b/i.test(lower)) {
    if (previousStage === 'exploring' || previousStage === 'interested' || previousStage === 'new') return 'interested';
    return 'negotiating';
  }
  if (/\b(hi|hello|hey|good|morning|afternoon|evening)\b/i.test(lower) && previousStage === 'new') return 'new';

  // Maintain existing stage if we can't determine a change
  if (previousStage && previousStage !== 'new') return previousStage;
  return 'new';
};

const updateSalesStage = (conversation, text) => {
  if (!conversation) return;
  const stage = classifySalesStage(text, conversation);
  if (stage !== conversation.salesStage) {
    conversation.salesStage = stage;
    conversation.salesStageUpdatedAt = now();
    conversation.salesStageHistory = [
      ...(conversation.salesStageHistory || []).slice(-10),
      { stage, at: now() }
    ];
    return true; // stage changed
  }
  return false;
};

const salesStageLabel = stage => {
  const labels = {
    'new': 'just started talking',
    'exploring': 'exploring options',
    'interested': 'showing interest',
    'objection': 'has concerns or objections',
    'negotiating': 'discussing price or terms',
    'ready_to_buy': 'ready to purchase',
    'follow_up': 'being followed up',
    'closed': 'converted',
    'lost': 'not interested'
  };
  return labels[stage] || stage;
};

// === CONVERSATION SUMMARY (context memory) ===

const updateConversationSummary = (conversation, text) => {
  if (!conversation) return;
  const msgCount = (conversation.messageCount || 0) + 1;
  conversation.messageCount = msgCount;

  // Every 4 messages, regenerate summary using a simple bucket approach
  if (msgCount % 4 === 0 && msgCount > 0) {
    const interests = extractInterests(text, conversation.summary?.interests || []);
    conversation.summary = {
      interests,
      lastTopic: extractTopic(text),
      customerName: conversation.customerName || conversation.summary?.customerName || '',
      lastUpdated: now()
    };
  } else if (!conversation.summary) {
    // Initialize on first few messages
    conversation.summary = {
      interests: extractInterests(text, []),
      lastTopic: extractTopic(text),
      customerName: conversation.customerName || '',
      lastUpdated: now()
    };
  } else {
    // Keep updating interests incrementally
    conversation.summary.interests = extractInterests(text, conversation.summary.interests || []);
    conversation.summary.lastTopic = extractTopic(text);
    conversation.summary.customerName = conversation.customerName || conversation.summary.customerName || '';
    conversation.summary.lastUpdated = now();
  }
};

const extractTopic = text => {
  const lower = String(text || '').toLowerCase();
  if (/\b(website|web|landing page|ecommerce|online shop|storefront|portal)\b/i.test(lower)) return 'website';
  if (/\b(ai|automation|chatbot|crm|customer (service|support)|follow.up|auto.reply|bot)\b/i.test(lower)) return 'automation';
  if (/\b(ad|ads|facebook|instagram|tiktok|social media|marketing|campaign|lead generation|seo|google)\b/i.test(lower)) return 'marketing';
  if (/\b(price|cost|pricing|package|package|plan|how much|budget|afford)\b/i.test(lower)) return 'pricing';
  if (/\b(delivery|shipping|send|location|address|bole|megenagna|piassa)\b/i.test(lower)) return 'delivery';
  if (/\b(order|buy|purchase|product|item|stock|available|size|color)\b/i.test(lower)) return 'product';
  if (/\b(service|consulting|training|support|maintenance|setup|installation)\b/i.test(lower)) return 'service';
  return 'general';
};

const extractInterests = (text, existing) => {
  const lower = String(text || '').toLowerCase();
  const allInterests = [...existing];
  if (/\b(website|web|landing page|ecommerce|online shop|storefront)\b/i.test(lower) && !allInterests.includes('website')) allInterests.push('website');
  if (/\b(ai|automation|chatbot|crm|follow.up|customer (service|support)|auto.reply)\b/i.test(lower) && !allInterests.includes('automation')) allInterests.push('automation');
  if (/\b(ad|ads|marketing|social media|seo|lead|facebook|instagram|tiktok|campaign)\b/i.test(lower) && !allInterests.includes('marketing')) allInterests.push('marketing');
  if (/\b(order|buy|purchase|product|item|stock)\b/i.test(lower) && !allInterests.includes('products')) allInterests.push('products');
  if (/\b(service|consulting|training|support|setup|installation|maintenance)\b/i.test(lower) && !allInterests.includes('services')) allInterests.push('services');
  return allInterests.slice(-5); // keep last 5 interests max
};


const findConversationProduct = (data, conversation) => {
  if (!conversation?.lastProductId) return null;
  return (data.products || []).find(product => product.id === conversation.lastProductId && product.isActive !== false) || null;
};

const asksAboutCurrentProduct = text => {
  const value = String(text || '');
  const lower = value.toLowerCase();
  const productReference = /\b(it|this|that|the product|this product|that product|the item|this item|that item|the one|this one|that one|same one|shemiz|dress|bag|shoe|shirt|pants|skirt|jacket)\b/i
    .test(value);
  const productDetail = productCommercialDetailIntent(value);
  const deliveryFollowUp = /\b(deliver|delivery|shipping|ship)\b/i.test(lower) && productReference;
  return productReference || productDetail || deliveryFollowUp;
};

const productCommercialDetailIntent = text => {
  const value = String(text || '').toLowerCase();
  return /\b(price|pricing|cost|how much|size|sizes|color|colors|material|fabric|made of|available|availability|stock|in stock|picture|photo|image|send it|show me|details?)\b/i.test(value) ||
    /\b(last|final|lowest|best|better|cash|wholesale|retail)\s+(price|cost|offer|deal)\b/i.test(value) ||
    /\b(price|cost|offer|deal)\s+(last|final|lowest|best|better)\b/i.test(value) ||
    /\b(discount|discounted|nego|negotiable|reduce|lower|cheaper|cheap|make it lower|any reduction|special price)\b/i.test(value) ||
    /\b(waga|wega|mekenes|mekenes|kenes|qenash|qenash|qinat|lastu|sent new)\b/i.test(value) ||
    /[ዋው]ጋ|ቅናሽ|መቀነስ/.test(value);
};

const shortProductDealFollowUp = text => {
  const value = String(text || '').trim().toLowerCase();
  if (!value || value.split(/\s+/).length > 7) return false;
  return /\b(last|final|lowest|discount|nego|negotiable|lower|cheaper|best offer|best price|cash price|special price|mekenes|qenash|waga|wega)\b/i.test(value) ||
    /[ዋው]ጋ|ቅናሽ|መቀነስ/.test(value);
};

const shouldUseRememberedProduct = text => {
  const value = String(text || '');
  const lower = value.toLowerCase();
  const productReference = /\b(it|this|that|the product|this product|that product|the item|this item|that item|the one|this one|that one|same one|shemiz|dress|bag|shoe|shirt|pants|skirt|jacket)\b/i
    .test(value);
  const productSpecificDetail = productCommercialDetailIntent(value) || shortProductDealFollowUp(value);
  const onlyGeneralDelivery = /\b(deliver|delivery|shipping|ship)\b/i.test(lower) && !productReference;
  return !onlyGeneralDelivery && (productReference || productSpecificDetail);
};

const findRecentProductFromMessages = (data, conversation) => {
  const recentText = data.messages
    .filter(message => message.conversationId === conversation.id)
    .slice(-12)
    .reverse()
    .map(message => message.text)
    .join('\n')
    .toLowerCase();
  return (data.products || [])
    .filter(product => product.clientId === conversation.clientId && product.isActive !== false)
    .find(product => {
      const code = String(product.code || '').toLowerCase();
      const name = String(product.name || '').toLowerCase();
      return (code && recentText.includes(code)) || (name && recentText.includes(name));
    }) || null;
};

const productQuestionType = text => {
  const value = String(text || '').toLowerCase();
  if (/\b(price|pricing|cost|how much|last|final|lowest|best price|discount|nego|negotiable|reduce|lower|cheaper|special price|waga|wega|mekenes|qenash)\b/.test(value) || /[ዋው]ጋ|ቅናሽ|መቀነስ/.test(value)) return 'price';
  if (/\b(size|sizes)\b/.test(value)) return 'sizes';
  if (/\b(color|colors)\b/.test(value)) return 'colors';
  if (/\b(material|fabric|made of)\b/.test(value)) return 'material';
  if (/\b(available|availability|stock|in stock)\b/.test(value)) return 'availability';
  if (/\b(deliver|delivery|shipping|ship)\b/.test(value)) return 'delivery';
  if (/\b(picture|photo|image|show me|send (?:me )?(?:some )?(?:picture|pictures|photo|photos|image|images))\b/.test(value)) return 'image';
  if (/\b(how (?:can|do) (?:I|i) (?:order|buy|purchase|get)|order(?:ing)? (?:process|step|instruction|guide)|how (?:does|to) order|place (?:an |a )?order)\b/.test(value)) return 'order_process';
  return 'details';
};

const classifyCustomerMessage = (text, context = {}) => {
  const value = String(text || '').trim();
  const lower = value.toLowerCase();
  const greeting = /^(hi|hello|hey|selam|salam|good morning|good afternoon|good evening|ሰላም)[\s!.?]*$/i.test(value);
  const productBrowse = (broadProductAvailabilityIntent(value) || /\b(another|other|different|more|catalog|products?|items?|what do you have|show me)\b/i.test(value)) &&
    !/\b(this|that|it|same|price|cost|size|color|material)\b/i.test(value);
  const payment = asksPayment(value);
  const fitQuestion = businessFitIntent(value);
  const contactInfoRequest = contactInfoRequestIntent(value);
  const leadSource = leadSourceIntent(value);
  const hasProductContext = Boolean(context.conversation?.lastProductId || context.conversation?.lastProductSearchIds?.length || context.currentProduct || context.activeOrderProduct);
  const productDetailFollowUp = shouldUseRememberedProduct(value) && hasProductContext && !productBrowse && !greeting && !contactInfoRequest;
  const explicitServiceTopic = leadSource || contactInfoRequest || serviceTopicIntent(value) || fitQuestion || serviceClarificationIntent(value);
  const packageTopic = packageQuestionIntent(value) && !productDetailFollowUp;
  const order = !contactInfoRequest && (realProductOrderIntent(value) || (orderAnswerIntent(value, context.currentProduct || context.activeOrderProduct || {}) && !fitQuestion));
  const serviceTopic = !productDetailFollowUp && (explicitServiceTopic || packageTopic);
  const productFollowUp = productDetailFollowUp || (shouldUseRememberedProduct(value) && !productBrowse && !greeting && !serviceTopic);
  const businessGeneral = !productFollowUp && !order && !payment;
  return {
    type: leadSource ? 'lead_source' : greeting ? 'greeting' : productBrowse ? 'product_browse' : serviceTopic ? 'service_question' : payment ? 'payment' : order ? 'order' : productFollowUp ? 'product_followup' : 'business_general',
    useProductContext: productFollowUp || order,
    useOrderContext: order || payment,
    resetStaleProduct: leadSource || greeting || productBrowse || businessGeneral || serviceTopic
  };
};

const routeCustomerIntent = ({ data, client, conversation, text, classification, currentProduct = null }) => {
  const mode = businessMode(client);
  if (mode === 'service') {
    if (contactInfoRequestIntent(text)) return { route: 'contact_info', categoryProducts: [], sampleProducts: [], reason: 'service business contact request' };
    if (classification.type === 'payment') return { route: 'payment', categoryProducts: [], sampleProducts: [], reason: 'service business payment question' };
    if (classification.type === 'lead_source') return { route: 'lead_source', categoryProducts: [], sampleProducts: [], reason: 'service business lead source' };
    if (classification.type === 'greeting') return { route: 'greeting', categoryProducts: [], sampleProducts: [], reason: 'service business greeting' };
    return { route: 'service_question', categoryProducts: [], sampleProducts: [], reason: 'service business only' };
  }
  const activeOrder = activeConversationOrder(data, client, conversation);
  const exactProduct = findExactProductCode(data, client.id, text);
  const rememberedProducts = productChoicesFromMemory(data, client.id, conversation);
  const stage = conversation?.stage || '';
  const activeProduct = currentProduct || productFromOrder(data, activeOrder);
  const wantsProductGallery = productGalleryRequestIntent(text) ||
    (rememberedProducts.length && productBrowseConfirmationIntent(text) && !productOrderStartIntent(text) && !orderDetailIntent(text));
  const sampleStart = productGalleryMoreIntent(text) ? Number(conversation?.lastProductSampleIndex || 0) : 0;
  const sampleProducts = wantsProductGallery ? rememberedProducts.slice(sampleStart, sampleStart + 4) : [];
  const categoryProducts = !sampleProducts.length && !currentProduct ? findProductCategoryMatches(data, client.id, text) : [];
  const contactRequest = contactInfoRequestIntent(text);
  const serviceTopic = false;

  if (!exactProduct && (broadProductAvailabilityIntent(text) || ((classification.type === 'product_browse' || classification.type === 'lead_source') && categoryProducts.length))) {
    return {
      route: 'product_search',
      categoryProducts,
      sampleProducts: [],
      reason: 'broad product/category availability'
    };
  }

  if (wantsProductGallery && sampleProducts.length) {
    return {
      route: 'product_samples',
      categoryProducts: [],
      sampleProducts,
      reason: 'customer asked to see pictures from remembered product choices'
    };
  }

  if (wantsProductGallery && rememberedProducts.length) {
    return {
      route: 'product_samples_done',
      categoryProducts: [],
      sampleProducts: [],
      reason: 'no more remembered product photos to show'
    };
  }

  if ((currentProduct || activeOrder) && contactRequest) {
    return { route: 'contact_info', categoryProducts: [], sampleProducts: [], reason: 'customer asked contact info in product/order context' };
  }

  // CRITICAL FIX: Break out of order flow if customer says no, cancels, changes topic abruptly, or sends a greeting
  const orderExitIntent = /\b(cancel|stop|never mind|forget|nevermind|no thanks|no thank|don't want|not buying|not ordering|change my mind|i'm done|that's all|leave me|quit|stop asking|i said no|i told you|stop it|don't ask|enough)\b/i.test(text);
  const abruptTopicChange = !activeOrder?.pendingDetail && (classification.type === 'greeting' || classification.type === 'product_browse' || classification.type === 'lead_source' || classification.type === 'business_general' || classification.type === 'service_question');

  if (activeOrder && orderStages.has(stage) && !contactRequest && !serviceTopic && !broadProductAvailabilityIntent(text)) {
    if (orderExitIntent) {
      // Cancel the order and clear the conversation's order tracking
      if (activeOrder.id) {
        const orderToCancel = data.orders?.find(item => item.id === activeOrder.id);
        if (orderToCancel) orderToCancel.status = 'cancelled';
      }
      conversation.orderStage = '';
      conversation.lastOrderId = '';
      conversation.lastOrderProductId = '';
      if (classification.type === 'greeting') return { route: 'greeting', categoryProducts: [], sampleProducts: [], reason: 'order canceled, greeting' };
      return { route: 'general', categoryProducts: [], sampleProducts: [], reason: 'order canceled by customer' };
    }
    if (abruptTopicChange) {
      // Customer clearly changed topic — don't force order flow
      return { route: 'general', categoryProducts: [], sampleProducts: [], reason: `topic change away from order (${classification.type})` };
    }
    return { route: 'order_flow', categoryProducts: [], sampleProducts: [], reason: `active order stage ${stage}` };
  }

  if (activeOrder && (classification.useOrderContext || orderAnswerIntent(text, activeProduct || {}) || productOrderStartIntent(text)) && !businessFitIntent(text)) {
    return { route: 'order_flow', categoryProducts: [], sampleProducts: [], reason: 'active order detail' };
  }

  if (currentProduct && (productOrderStartIntent(text) || (orderAnswerIntent(text, currentProduct) && !businessFitIntent(text)))) {
    return { route: 'order_flow', categoryProducts: [], sampleProducts: [], reason: 'product order intent' };
  }

  if (currentProduct || classification.useProductContext) {
    return { route: 'product_detail', categoryProducts: [], sampleProducts: [], reason: 'specific or remembered product' };
  }

  if (classification.useOrderContext || realProductOrderIntent(text)) {
    return { route: 'order_flow', categoryProducts: [], sampleProducts: [], reason: 'order intent' };
  }

  if (classification.type === 'lead_source') return { route: 'lead_source', categoryProducts: [], sampleProducts: [], reason: 'lead source' };
  if (classification.type === 'service_question') return { route: 'general', categoryProducts: [], sampleProducts: [], reason: 'product business general question' };
  if (classification.type === 'payment') return { route: 'payment', categoryProducts: [], sampleProducts: [], reason: 'payment question' };
  if (classification.type === 'greeting') return { route: 'greeting', categoryProducts: [], sampleProducts: [], reason: 'greeting' };
  return { route: 'general', categoryProducts: [], sampleProducts: [], reason: 'general fallback' };
};

const routeNeedsProductContext = route => ['product_detail', 'order_flow', 'payment'].includes(route?.route);

const routeFallbackReply = (data, client, route, text) => {
  if (route?.route === 'product_search') {
    const matches = route.categoryProducts?.length ? route.categoryProducts : findProductCategoryMatches(data, client.id, text);
    return matches.length
      ? productChoiceReply(matches, text)
      : productCatalogReply(data, client.id) || 'Please tell me the product type or send a product code, and I will check what is available.';
  }
  if (route?.route === 'product_samples') {
    return productSampleReply(route.sampleProducts || []);
  }
  if (route?.route === 'product_samples_done') {
    return productSamplesDoneReply();
  }
  if (route?.route === 'product_detail') {
    return 'Please send the product code or product name so I can confirm the exact item.';
  }
  if (route?.route === 'order_flow') {
    return 'I can help with the order. Please send the size, quantity, delivery area, or payment question you want me to check.';
  }
  return '';
};

const validateRoutedReply = ({ data, client, route, text, reply }) => {
  const value = String(reply || '').trim();
  const fallback = routeFallbackReply(data, client, route, text);
  if (!value) return fallback;
  if (['product_search', 'product_samples'].includes(route?.route)) {
    const wrongService = /\b(website|automation|service package|consultation|meeting|call|project|proposal)\b/i.test(value);
    const wrongOrderClose = /\b(which size|what size|delivery|payment|order this|continue with the order)\b/i.test(value);
    if ((wrongService || wrongOrderClose) && fallback) return fallback;
  }
  return value;
};

const recoverConversationContext = (conversation, classification, text) => {
  const value = String(text || '');
  const pendingAgeMs = conversation.pendingReplyStartedAt ? Date.now() - new Date(conversation.pendingReplyStartedAt).getTime() : 0;
  const stalePending = pendingAgeMs > 3 * 60 * 1000;
  const explicitReset = /\b(not payment|not a payment|not receipt|not proof|forget that|new question|different question|another question|start over|stop talking about|not that product|not this product)\b/i.test(value);
  const generalRecovery = classification.type === 'lead_source' || classification.type === 'greeting' || classification.type === 'product_browse' || classification.type === 'business_general' || classification.type === 'service_question';
  if (stalePending || explicitReset) {
    conversation.pendingReplyToken = '';
    conversation.pendingReplyStartedAt = '';
  }
  if (explicitReset || (conversation.lastImageUnclearAt && generalRecovery)) {
    conversation.lastProductId = '';
    conversation.lastImageUnclearAt = '';
  }
  if ((classification.type === 'service_question' || classification.type === 'lead_source') && !serviceCloseIntent(value)) {
    conversation.lastBookingId = '';
  }
  return { stalePending, explicitReset };
};

const productReplyText = (product, question = 'details') => {
  const price = productPrice(product);
  const availability = productAvailability(product);
  if (question === 'price' && price) return [
    `Price: ${price}`,
    'That is already the selling price.',
    'Would you like to order or see similar styles?'
  ].filter(Boolean).join('\n');
  if (question === 'sizes' && product.sizes) return `${product.code} - ${product.name}\nSizes: ${product.sizes}`;
  if (question === 'colors' && product.colors) return `${product.code} - ${product.name}\nColors: ${product.colors}`;
  if (question === 'material' && product.material) return `${product.code} - ${product.name}\nMaterial: ${product.material}`;
  if (question === 'availability' && availability) return `${product.code} - ${product.name}\nAvailability: ${availability}`;
  if (question === 'delivery') return `${product.code} - ${product.name}\nPlease send your delivery area and phone number so the team can confirm timing and fee.`;
  if (question === 'order_process') return [
    `Here's how to order ${product.code}:`,
    '1. Tell me your size and color preference',
    '2. I\'ll confirm the details with you',
    '3. I\'ll share payment options (Telebirr, CBE, or delivery payment)',
    '4. After payment, send the screenshot here',
    '5. We arrange delivery or pickup',
    '',
    'Ready to start? Just tell me your size and color!'
  ].join('\n');
  return [
    `${product.code} - ${product.name}`,
    price ? `Price: ${price}` : '',
    product.sizes ? `Sizes: ${product.sizes}` : '',
    product.colors ? `Colors: ${product.colors}` : '',
    product.variantNote ? `Variant note: ${product.variantNote}` : '',
    product.stockNote ? `Stock note: ${product.stockNote}` : '',
    product.material ? `Material: ${product.material}` : '',
    availability ? `Availability: ${availability}` : '',
    product.description ? product.description : '',
    product.notes ? `Notes: ${product.notes}` : ''
  ].filter(Boolean).join('\n');
};

const productCatalogReply = (data, clientId) => {
  const products = activeClientProducts(data, clientId).slice(0, 6);
  if (!products.length) return '';
  const lines = products.map(product => {
    const price = productPrice(product);
    const availability = productAvailability(product);
    return [
      `${product.code || ''} ${product.name || ''}`.trim(),
      price ? `price: ${price}` : '',
      availability ? `availability: ${availability}` : ''
    ].filter(Boolean).join(' | ');
  });
  return [
    'Yes, here are some available products you can ask about:',
    ...lines,
    'Would you like me to send some photos, or do you want to check one product code?'
  ].join('\n');
};

const productChoiceReply = (products, text = '') => {
  const items = (products || []).slice(0, 6);
  if (!items.length) return '';
  const label = productCategoryLabel(text);
  const lines = items.map(product => {
    const price = productPrice(product);
    const availability = productAvailability(product);
    return [
      `${product.code || ''} ${product.name || ''}`.trim(),
      price ? `price: ${price}` : '',
      availability ? `availability: ${availability}` : ''
    ].filter(Boolean).join(' | ');
  });
  return [
    `Yes, we have different ${label} options available.`,
    ...lines,
    'Would you like me to send some photos? You can also send a product code to check one exact item.'
  ].join('\n');
};

const productSampleIntent = text => /\b(picture|pictures|photo|photos|image|images|show me|can i see|send some|see some)\b/i
  .test(String(text || ''));

const productGalleryMoreIntent = text => /\b(show me more|more photos|more pictures|more images|more options|next|next ones|other options|another options?|different options?)\b/i
  .test(String(text || ''));

const productGalleryRequestIntent = text => productSampleIntent(text) || productGalleryMoreIntent(text);

const productBrowseConfirmationIntent = text => {
  const value = String(text || '').trim();
  return value.length <= 40 && /\b(yes|yeah|yep|ok|okay|sure|please|send|show|go ahead|let me see)\b/i.test(value);
};

const rememberProductChoices = (conversation, products = []) => {
  const ids = (products || []).map(product => product.id).filter(Boolean).slice(0, 6);
  if (!ids.length) return;
  conversation.lastProductSearchIds = ids;
  conversation.lastProductSearchAt = now();
  conversation.lastProductSampleIndex = 0;
};

const productChoicesFromMemory = (data, clientId, conversation) => {
  const ids = conversation?.lastProductSearchIds || [];
  if (!ids.length) return [];
  const products = (data.products || []).filter(product =>
    product.clientId === clientId &&
    product.isActive !== false &&
    ids.includes(product.id)
  );
  return ids.map(id => products.find(product => product.id === id)).filter(Boolean);
};

const productSampleReply = products => {
  const items = (products || []).slice(0, 4);
  if (!items.length) return '';
  return [
    `Here are ${items.length === 1 ? 'one option' : `${items.length} options`} you can check:`,
    ...items.map(product => [
      `${product.code || ''} ${product.name || ''}`.trim(),
      productPrice(product) ? `price: ${productPrice(product)}` : '',
      productAvailability(product) ? `availability: ${productAvailability(product)}` : ''
    ].filter(Boolean).join(' | ')),
    'Send the product code you like and I will continue with size, delivery, and order details.'
  ].join('\n');
};

const productSamplesDoneReply = () => 'I have shown the available photos I have for those options. Please send the product code you like, or tell me another product type you want to see.';

const advanceProductGallery = (conversation, products = []) => {
  const ids = conversation?.lastProductSearchIds || [];
  const shownIds = (products || []).map(product => product.id).filter(Boolean);
  if (!ids.length || !shownIds.length) return;
  const lastIndex = Math.max(...shownIds.map(id => ids.indexOf(id)).filter(index => index >= 0));
  if (lastIndex >= 0) conversation.lastProductSampleIndex = Math.min(ids.length, lastIndex + 1);
};

const packageQuestionIntent = text => {
  const value = String(text || '');
  return /\b(package|packages|plan|plans|pricing|timeline|how long|service for|best service|recommend|which service|which package|fit for|suitable for|for my business|for my shop|for my store|retail|boutique|salon|beauty|fashion|restaurant|clinic|business)\b/i.test(value) ||
    (/\b(price|cost|how much)\b/i.test(value) && /\b(service|package|plan|project|website|automation|marketing|training|crm|erp)\b/i.test(value));
};

const textToKeywordSet = value => new Set(String(value || '')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
  .split(/\s+/)
  .filter(word => word.length >= 4 && !['what', 'your', 'have', 'with', 'that', 'this', 'from', 'they', 'there', 'service', 'services', 'package', 'packages', 'business'].includes(word)));

const sourceBlocks = (data, client) => {
  const profile = client.settings?.businessProfile || {};
  const blocks = [
    ['Basic services', profile.services],
    ['Business reference knowledge', profile.referenceKnowledge],
    ['Pricing and packages', profile.pricing],
    ['Business summary', profile.summary],
    ['FAQ', profile.faq],
    ['Project timeline', profile.timeline],
    ['Policies', profile.policies]
  ];
  const fileBlocks = (data.knowledgeFiles || [])
    .filter(file => file.clientId === client.id && file.extractedText && file.isActive !== false)
    .map(file => [file.originalName || 'Knowledge file', file.extractedText]);
  return [...blocks, ...fileBlocks]
    .filter(([, text]) => String(text || '').trim())
    .flatMap(([title, text]) => String(text)
      .split(/\n\s*\n|(?=^#{1,3}\s)|(?=^[A-Z][A-Z\s&-]{8,}$)/gm)
      .map(chunk => [title, chunk.trim()])
      .filter(([, chunk]) => chunk.length >= 60));
};

const businessBrainText = (data, client) => {
  const blocks = sourceBlocks(data, client);
  const categories = [
    ['Services and capabilities', /\b(service|services|website|web|landing page|ecommerce|online store|telegram|mini app|miniapp|automation|ai|crm|erp|marketing|ads|lead|sales|social media|digital|design|development|customer service|support)\b/i],
    ['Packages and business fit', /\b(package|plan|retail|wholesale|enterprise|small business|shop|store|fashion|beauty|salon|restaurant|clinic|business|industry|growth|solution)\b/i],
    ['Pricing, payment, and timeline', /\b(price|pricing|cost|fee|birr|usd|payment|deposit|timeline|delivery time|duration|month|week|day)\b/i],
    ['Operations and delivery', /\b(order|stock|inventory|delivery|shipping|pickup|payment|workflow|management|training|support|implementation|setup)\b/i],
    ['Policies and contact', /\b(contact|phone|email|address|location|policy|refund|return|warranty|guarantee|terms)\b/i]
  ];
  const lines = [];
  for (const [label, pattern] of categories) {
    const matches = blocks
      .filter(([, content]) => pattern.test(content))
      .slice(0, 5)
      .map(([, content]) => content.replace(/\s+/g, ' ').slice(0, 360).trim());
    if (matches.length) {
      lines.push(`${label}:`);
      matches.forEach(item => lines.push(`- ${item}`));
    }
  }
  return lines.join('\n').slice(0, 12000);
};

const servicePackageReply = (data, client, text) => {
  if (!packageQuestionIntent(text)) return '';
  const queryWords = textToKeywordSet(text);
  const blocks = sourceBlocks(data, client)
    .map(([source, content]) => {
      const words = textToKeywordSet(content);
      let score = 0;
      queryWords.forEach(word => {
        if (words.has(word) || String(content).toLowerCase().includes(word)) score += 2;
      });
      if (/\b(retail|shop|store|fashion|beauty|salon|boutique|product|sales|marketing|website|automation|ads|lead)\b/i.test(content)) score += 1;
      return { source, content, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
  if (!blocks.length) return '';
  const snippets = blocks.map(item => {
    const clean = item.content.replace(/\s+/g, ' ').slice(0, 260).trim();
    return `- ${clean}`;
  });
  return [
    'Here are the most relevant options:',
    ...snippets,
    '',
    'If you tell me your business type, budget, and goal, I can guide you to the best option.'
  ].join('\n');
};

const humanList = items => {
  const list = (items || []).filter(Boolean);
  if (list.length <= 1) return list[0] || '';
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
};

const serviceCapabilityReply = (data, client, text) => {
  if (!serviceTopicIntent(text)) return '';
  const lower = String(text || '').toLowerCase();
  const service = serviceLabel(text);
  const queryWords = textToKeywordSet([service, text].filter(Boolean).join(' '));
  const websiteQuestion = /\b(website|web site|landing page|ecommerce|e-commerce|online store|web design|web development)\b/i.test(lower);
  const serviceWords = websiteQuestion
    ? ['website', 'web', 'landing', 'ecommerce', 'online', 'store', 'design', 'development', 'digital']
    : [...queryWords];
  const blocks = sourceBlocks(data, client)
    .map(([source, content]) => {
      const contentLower = String(content || '').toLowerCase();
      let score = 0;
      serviceWords.forEach(word => {
        if (word && contentLower.includes(word)) score += 2;
      });
      if (/\b(service|services|solution|solutions|package|offer|business|digital|sales|marketing|automation|website|web)\b/i.test(content)) score += 1;
      if (/basic services|business summary|pricing|package/i.test(source)) score += 1;
      return { source, content, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  if (!blocks.length) return '';
  const combined = [text, ...blocks.map(item => item.content)].join(' ').toLowerCase();
  const benefits = [];
  if (websiteQuestion || /\b(website|web|landing page|ecommerce|online store|storefront|portal)\b/i.test(combined)) {
    benefits.push('a professional website or online sales page');
  }
  if (/\b(telegram|mini app|miniapp|mini-app|bot)\b/i.test(combined)) {
    benefits.push('Telegram bot or mini app customer journeys');
  }
  if (/\b(ai|automation|customer service|customer support|chatbot|agent|crm|follow-up|follow up)\b/i.test(combined)) {
    benefits.push('AI customer-service automation and customer follow-up');
  }
  if (/\b(lead|sales|marketing|ads|social media|campaign|discoverability)\b/i.test(combined)) {
    benefits.push('lead generation and digital sales support');
  }
  if (/\b(stock|inventory|order|payment|delivery|management)\b/i.test(combined)) {
    benefits.push('order, stock, or business workflow support');
  }
  const uniqueBenefits = [...new Set(benefits)].slice(0, 3);
  if (!uniqueBenefits.length) return `This fits ${client.businessName}'s digital business services.`;
  return `This can include ${humanList(uniqueBenefits)}.`;
};

const salesObjectionIntent = text => {
  const lower = String(text || '').toLowerCase();
  // Richer regex covering explicit and implicit objections
  return /\b(expensive|too much|costly|discount|cheap|cheaper|think about it|later|not sure|trust|guarantee|why you|why should|compare|competitor|can you reduce|last price|out of (my|our) budget|overpriced|pricey|can't afford|too pricey|not worth|i'll get back|let me think|let me check|i need to talk|need to discuss|need to ask|check with (my|our)|talk to (my|our)|let me discuss|not interested|no thanks|not now|maybe later|i'll consider)\b/i.test(lower);
};


const salesObjectionReply = (data, client, text) => {
  if (!salesObjectionIntent(text)) return '';
  const lower = String(text || '').toLowerCase();
  const relevant = sourceBlocks(data, client)
    .filter(([, content]) => /\b(value|result|guarantee|trust|proof|portfolio|experience|quality|support|price|pricing|package|payment|benefit|why|result|ROI|outcome)\b/i.test(content))
    .slice(0, 4)
    .map(([source, content]) => `- ${source}: ${content.replace(/\s+/g, ' ').slice(0, 300).trim()}`);

  // Determine objection type for targeted response
  const isPriceObjection = /\b(expensive|too much|costly|overpriced|pricey|can't afford|too pricey|budget|out of (my|our) budget|afford|payment plan|installment)\b/i.test(lower);
  const isTrustObjection = /\b(trust|guarantee|why you|why should|scam|legit|reliable|experience|proof|portfolio)\b/i.test(lower);
  const isComparisonObjection = /\b(compare|competitor|someone else|other (company|shop|provider)|they have|they offer)\b/i.test(lower);
  const isHesitationObjection = /\b(not sure|not interested|no thanks|maybe later|think about it|later|not now)\b/i.test(lower);

  const base = isPriceObjection
    ? 'I understand. Price is an important factor, especially when you want real results that are worth the investment.'
    : isTrustObjection
      ? 'That is completely fair. You should feel confident before choosing a service provider.'
      : isComparisonObjection
        ? 'It is smart to compare options before deciding. Here is what makes us different:'
        : isHesitationObjection
          ? 'No problem at all. Take your time — this is an important decision.'
          : 'I understand. Let me help with whatever questions you have.';

  return [
    base,
    relevant.length ? relevant.join('\n') : '',
    isPriceObjection && relevant.length
      ? 'The value comes from the results, not just the price. What result would make this worth it for you?'
      : isPriceObjection
        ? 'I can share the options and help you find what fits your budget. What range were you thinking?'
        : isTrustObjection && relevant.length
          ? 'Would seeing a sample of our work help you decide?'
          : isTrustObjection
            ? 'I can connect you with past clients or show examples of our work. Would that help?'
            : isComparisonObjection
              ? 'What matters most to you: price, quality, speed, or support? I can help you compare based on what you value.'
              : isHesitationObjection
                ? 'Is there a specific question I can answer that would help you decide?'
                : 'What would help you move forward?'
  ].filter(Boolean).join('\n');
};

const serviceFollowUpReply = (data, client, conversation, text) => {
  const booking = activeServiceBooking(data, client, conversation);
  if (!booking) return '';
  const lower = String(text || '').toLowerCase();
  const asksFollowUp = /\b(how much|price|cost|package|timeline|how long|when|what about|tell me more|details|include|included|service|website|landing page|ecommerce|online shop)\b/i.test(lower);
  if (!asksFollowUp && !salesObjectionIntent(text)) return '';
  const objection = salesObjectionReply(data, client, text);
  if (objection) return objection;
  const query = [booking.requestedService, text].filter(Boolean).join(' ');
  const packageHint = servicePackageReply(data, client, query);
  if (packageHint) {
    return [
      packageHint,
      'Does this sound close to what you want, or should I help narrow it down?'
    ].join('\n\n');
  }
  const capabilityHint = serviceCapabilityReply(data, client, query);
  const service = booking.requestedService ? serviceLabel(booking.requestedService) : serviceLabel(text);
  return [
    `Yes, ${client.businessName} can help with ${service}.`,
    capabilityHint || 'I can explain the available service options and help the team confirm the best fit.',
    'What result do you want from this project? For example: more sales, a professional website, online orders, lead generation, or automation.'
  ].filter(Boolean).join('\n\n');
};

const safeFallbackReply = (data, client, classification) => {
  if (classification?.type === 'lead_source') {
    return leadSourceReply(client, '');
  }
  if (classification?.type === 'greeting') {
    return `Hello. I can help with ${client.businessName} products, services, pricing, delivery, orders, or payment questions.`;
  }
  if (classification?.type === 'product_browse') {
    return productCatalogReply(data, client.id) || 'Please send the product type or product code, and I will check what is available.';
  }
  return 'I can help with that. Please send a product code, product name, or ask about products, services, pricing, delivery, or payment.';
};

const leadSourceReply = (client, text) => {
  const source = detectLeadSource(text) || 'our ad';
  return [
    `Welcome, thanks for reaching out from ${source}.`,
    `${client.businessName} can help with websites, automation, digital sales systems, products, orders, or customer support depending on what you need.`,
    'What would you like help with first?'
  ].join('\n\n');
};

const prepareCustomerReply = (reply, client = {}) => {
  let text = String(reply || '').trim();
  if (!text) return text;
  const business = client.businessName || 'the business';
  text = text
    .replace(/\bBased on (?:the )?(?:saved )?(?:business )?knowledge(?: base)?[,:\s]*/gi, '')
    .replace(/\bFrom (?:the )?(?:saved )?(?:business )?knowledge(?: base)?[,:\s]*/gi, '')
    .replace(/\bAccording to (?:the )?(?:saved )?(?:settings|automation settings|knowledge base|uploaded files|approved sources)[,:\s]*/gi, '')
    .replace(/\b(?:saved|approved) sources\b/gi, 'information')
    .replace(/\bknowledge base files?\b/gi, 'business information')
    .replace(/\bknowledge base\b/gi, 'business information')
    .replace(/\buploaded files?\b/gi, 'business information')
    .replace(/\bPDF files?\b/gi, 'business information')
    .replace(/\bdocument names?\b/gi, 'business information')
    .replace(/\bautomation settings?\b/gi, 'business information')
    .replace(/\bdashboard settings?\b/gi, 'business information')
    .replace(/\bexact general knowledge detail saved yet\b/gi, 'exact detail confirmed yet')
    .replace(/\bgeneral knowledge detail\b/gi, 'detail')
    .replace(/\bsaved yet\b/gi, 'confirmed yet')
    .replace(/\bsource-of-truth\b/gi, 'business information')
    .replace(/\bretrieval\b/gi, 'business information')
    .replace(/\bmy customers\b/gi, 'your customers')
    .replace(/\bmy business\b/gi, 'your business')
    .replace(/\bmy shop\b/gi, 'your shop')
    .replace(/\bmy store\b/gi, 'your store')
    .replace(/\bthis service is related to these services:\s*/gi, 'this service can include:\n')
    .replace(/\bwebsite is related to these services:\s*/gi, 'website services can include:\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const rawSourceLine = /^\s*-\s*(?:Sprint_|Business summary|Pricing and packages|Basic services|Project timeline|FAQ|Policies|.*\.pdf:)/i;
  const lines = text.split('\n');
  const rawLines = lines.filter(line => rawSourceLine.test(line));
  if (rawLines.length >= 2) {
    const lower = text.toLowerCase();
    const benefits = [];
    if (/\b(website|web|landing page|ecommerce|online store|portal|storefront)\b/i.test(lower)) benefits.push('a professional website or online sales page');
    if (/\b(ai|automation|customer service|customer support|chatbot|crm|follow-up|follow up)\b/i.test(lower)) benefits.push('AI customer support and customer follow-up');
    if (/\b(lead|sales|marketing|ads|social media|campaign|discoverability)\b/i.test(lower)) benefits.push('lead generation and digital sales support');
    if (/\b(stock|inventory|order|payment|delivery|management)\b/i.test(lower)) benefits.push('order, stock, payment, or delivery workflow support');
    const summary = benefits.length
      ? `Yes, ${business} can help with that. This can include ${humanList([...new Set(benefits)].slice(0, 3))}.`
      : `Yes, ${business} can help with that. The team can guide you to the best option for your goal.`;
    const question = /what result|what do you want|would you like/i.test(text)
      ? 'What result do you want most from this: more sales, faster replies, online orders, or better customer follow-up?'
      : '';
    return [summary, question].filter(Boolean).join('\n\n');
  }

  return text;
};


const orderStatusCustomerMessage = (client, order) => {
  const product = [order.productCode, order.productName].filter(Boolean).join(' - ') || 'your order';
  if (order.status === 'cancelled') return `Update from ${client.businessName}: your order for ${product} was cancelled. Please contact the team if this is unexpected.`;
  if (order.deliveryStatus === 'delivered' || order.status === 'delivered') return `Good news from ${client.businessName}: your order for ${product} has been marked delivered. Thank you.`;
  if (order.paymentStatus === 'paid' || order.status === 'paid') return `Update from ${client.businessName}: payment for ${product} is marked as received. The team will continue with the next step.`;
  if (order.status === 'confirmed') return `Update from ${client.businessName}: your order for ${product} is confirmed. The team will follow up with the next step.`;
  if (order.deliveryStatus === 'out-for-delivery') return `Update from ${client.businessName}: your order for ${product} is out for delivery.`;
  if (order.deliveryStatus === 'packed') return `Update from ${client.businessName}: your order for ${product} is packed and being prepared.`;
  return `Update from ${client.businessName}: your order for ${product} is now ${order.status || 'being reviewed'}.`;
};

const bookingStatusCustomerMessage = (client, booking) => {
  const service = booking.requestedService || 'your request';
  if (booking.status === 'cancelled') return `Update from ${client.businessName}: your service request for ${service} was cancelled. Please contact the team if this is unexpected.`;
  if (booking.status === 'done') return `Update from ${client.businessName}: your service request for ${service} is marked complete. Thank you.`;
  if (booking.status === 'contacted') return `Update from ${client.businessName}: the team has contacted or is contacting you about ${service}.`;
  if (booking.status === 'confirmed') return `Update from ${client.businessName}: your service request for ${service} is confirmed. Preferred time: ${booking.preferredDateTime || 'to be confirmed'}.`;
  return `Update from ${client.businessName}: your service request for ${service} is being reviewed by the team.`;
};


const productImageIntent = text => /\b(available|availability|price|cost|how much|size|sizes|color|colors|material|stock|product|item|dress|bag|shoe|shirt|shemiz|is this|do you have|looking for|want this|buy this)\b/i
  .test(String(text || ''));

const paymentProofEvidence = text => /\b(payment|paid|receipt|transfer|transaction|reference|ref|telebirr|cbe|bank|debit|credited|birr|etb|invoice|proof)\b/i
  .test(String(text || ''));

const paymentEvidenceScore = text => {
  const value = String(text || '').toLowerCase();
  return [
    /\b(payment|paid|receipt|proof|invoice)\b/,
    /\b(transaction|reference|ref|id)\b/,
    /\b(telebirr|cbe|bank|debit|credited|transfer)\b/,
    /\b(etb|birr|\d+[,.]?\d*\s*(etb|birr))\b/
  ].reduce((score, pattern) => score + (pattern.test(value) ? 1 : 0), 0);
};

const productEvidenceScore = text => {
  const value = String(text || '').toLowerCase();
  return [
    /\b(product|item|dress|bag|shoe|shirt|shemiz|skirt|jacket|cosmetic|watch|phone|laptop)\b/,
    /\b(price|cost|how much|available|availability|stock|size|color|material)\b/,
    /\b(is this|do you have|want this|buy this|looking for|similar|another)\b/,
    /\b(photo|picture|screenshot|catalog|posted|post)\b/
  ].reduce((score, pattern) => score + (pattern.test(value) ? 1 : 0), 0);
};

const recentIsoWithin = (value, minutes) => {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && Date.now() - time <= minutes * 60 * 1000;
};

const shouldTreatImageAsPaymentProof = ({ caption = '', analysis = {}, productMatch = null, conversation = null, activeOrder = null }) => {
  const captionPayment = paymentProofEvidence(caption);
  const captionProduct = productImageIntent(caption);
  const analysisText = `${analysis.type || ''} ${analysis.description || ''}`;
  const hasProductMatch = productMatch?.product && productMatch.confidence !== 'low';
  const hasRecentPaymentContext = Boolean(
    recentIsoWithin(conversation?.lastPaymentPromptAt, 120) ||
    recentIsoWithin(activeOrder?.paymentPromptSentAt, 120)
  );
  const looksLikeProduct = productEvidenceScore(`${caption} ${analysisText}`) >= 2 || analysis.type === 'product_screenshot';
  const looksLikePayment = paymentEvidenceScore(`${caption} ${analysisText}`) >= 3 || analysis.type === 'payment_proof';
  const analysisPayment = analysis.isPaymentProof &&
    Number(analysis.confidence || 0) >= 90 &&
    paymentEvidenceScore(analysisText) >= 3;
  if (captionProduct && !captionPayment) return false;
  if (hasProductMatch && !captionPayment) return false;
  if (looksLikeProduct && !captionPayment) return false;
  if (captionPayment && looksLikePayment) return true;
  return hasRecentPaymentContext && analysisPayment && !looksLikeProduct;
};

const tokenizeSearch = text => [...new Set(String(text || '').toLowerCase()
  .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
  .split(/\s+/)
  .filter(token => token.length >= 3 && !['the', 'and', 'with', 'this', 'that', 'product', 'image', 'photo'].includes(token)))];

const productVisualMatchScore = (product, imageDescription, caption = '') => {
  const query = tokenizeSearch(`${imageDescription} ${caption}`);
  if (!query.length) return 0;
  const source = tokenizeSearch([
    product.code,
    product.name,
    product.category,
    product.subcategory,
    product.selectedCategory,
    product.selectedSubcategory,
    product.colors,
    product.sizes,
    product.material,
    product.variantNote,
    product.description,
    product.notes,
    product.description
  ].filter(Boolean).join(' '));
  const sourceSet = new Set(source);
  const overlap = query.filter(token => sourceSet.has(token)).length;
  const codeBoost = product.code && String(caption || imageDescription).toLowerCase().includes(String(product.code).toLowerCase()) ? 8 : 0;
  return overlap + codeBoost;
};

const findProductByImageDescription = (data, clientId, imageDescription, caption = '') => {
  const matches = (data.products || [])
    .filter(product => product.clientId === clientId && product.isActive !== false)
    .map(product => ({ product, score: productVisualMatchScore(product, imageDescription, caption) }))
    .sort((a, b) => b.score - a.score);
  const best = matches[0];
  const second = matches[1];
  if (!best || best.score < 2) return { product: null, confidence: 'low', score: best?.score || 0 };
  if (second && best.score - second.score < 2 && best.score < 8) return { product: best.product, confidence: 'uncertain', score: best.score };
  return { product: best.product, confidence: best.score >= 5 ? 'high' : 'medium', score: best.score };
};

const activeKnowledgeText = (data, clientId) => {
  const files = data.knowledgeFiles.filter(file => file.clientId === clientId && file.extractedText && file.isActive !== false);
  return files
    .map(file => `Source: ${file.originalName}\n${file.extractedText.slice(0, 30000)}`)
    .join('\n\n');
};

const missingKnowledgeReply = 'I do not have that information yet. Please contact the business team directly, or share your question and I can ask the team to follow up.';

const isMissingKnowledgeReply = text => String(text || '').trim() === missingKnowledgeReply;

const helpfulMissingReply = (client, text, classification = {}) => {
  const topic = missingTopic(text).toLowerCase();
  if (classification.type === 'lead_source' || leadSourceIntent(text)) {
    return leadSourceReply(client, text);
  }
  if (classification.type === 'service_question' || serviceTopicIntent(text)) {
    const service = serviceLabel(text);
    return `Yes, ${client.businessName} can help with ${service}. What result do you want most from this: more sales, faster customer replies, online orders, or a stronger online presence?`;
  }
  if (classification.type === 'product_followup' || /\b(product|item|price|size|color|available|stock)\b/i.test(String(text || ''))) {
    return `I can help check the exact ${topic} detail. Please send the product code or product name so I can confirm the right item.`;
  }
  return `Thanks for reaching out. I can help with ${client.businessName} services, products, pricing, delivery, orders, or contact details. What would you like to know first?`;
};

const missingTopic = text => {
  const value = String(text || '').toLowerCase();
  if (/\b(price|cost|package|fee|payment)\b/.test(value)) return 'Pricing';
  if (/\b(deliver|delivery|shipping|ship|pickup)\b/.test(value)) return 'Delivery';
  if (/\b(address|location|where|contact|phone|email|whatsapp)\b/.test(value)) return 'Contact and address';
  if (/\b(refund|return|warranty|guarantee|policy|deposit)\b/.test(value)) return 'Policies';
  if (/\b(size|color|material|available|stock|product)\b/.test(value)) return 'Products';
  if (/\b(service|services|offer|business|shop|store)\b/.test(value)) return 'Services';
  return 'General knowledge';
};

const recordUnansweredQuestion = async ({ data, client, conversation, customer, question }) => {
  data.unansweredQuestions ||= [];
  const unansweredAlertDelayMs = 2 * 60 * 60 * 1000;
  const existing = data.unansweredQuestions.find(item =>
    item.clientId === client.id &&
    item.status !== 'resolved' &&
    item.question.toLowerCase() === String(question || '').toLowerCase()
  );
  if (existing) {
    existing.count = Number(existing.count || 1) + 1;
    existing.lastAskedAt = now();
    existing.customerName = customer?.name || existing.customerName || '';
    existing.username = customer?.username || existing.username || '';
    existing.telegramChatId = customer?.telegramChatId || existing.telegramChatId || '';
    existing.updatedAt = now();
    const firstAskedAt = new Date(existing.createdAt || existing.lastAskedAt || 0).getTime();
    const oldEnough = firstAskedAt && Date.now() - firstAskedAt >= unansweredAlertDelayMs;
    if (Number(existing.count || 1) >= 2 && oldEnough) {
      await sendClientNotification(
        data,
        client,
        `unanswered-${existing.id}`,
        [
          'Repeated unanswered customer question',
          '',
          `This question has been asked ${existing.count} times and still needs a shop answer.`,
          `Question: ${existing.question}`,
          `Suggested FAQ section: ${existing.suggestedTopic}`,
          '',
          'Reply to this message and SprintSales will send your answer back to the shopper through your shop bot.'
        ].join('\n'),
        'unanswered',
        120,
        { supportReply: { questionId: existing.id, conversationId: existing.conversationId, telegramChatId: existing.telegramChatId } }
      );
    }
    return existing;
  }
  const record = {
    id: uid('unanswered'),
    clientId: client.id,
    conversationId: conversation.id,
    question: String(question || '').slice(0, 700),
    suggestedTopic: missingTopic(question),
    status: 'open',
    count: 1,
    customerName: customer?.name || '',
    username: customer?.username || '',
    telegramChatId: customer?.telegramChatId || '',
    createdAt: now(),
    lastAskedAt: now()
  };
  data.unansweredQuestions.push(record);
  return record;
};


const extractSensitiveFacts = text => {
  const value = String(text || '');
  const emails = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  const phones = value.match(/(?:\+?\d[\d\s().-]{7,}\d)/g) || [];
  const money = value.match(/(?:[$€£]\s?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s?(?:usd|birr|etb|dollars?)\b)/gi) || [];
  return [...emails, ...phones, ...money].map(item => item.toLowerCase().replace(/\s+/g, ' ').trim());
};


  return {
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
  };
};
