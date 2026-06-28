import { Router } from 'express';
import path from 'node:path';
import { miniappTemplateForClient } from '../config/miniapp-templates.js';
import { websiteThemeForClient } from '../config/retail-themes.js';

const slugify = value => String(value || '')
  .toLowerCase()
  .trim()
  .replace(/['"]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80);

const compactSlug = value => slugify(value).replace(/-/g, '');

const cleanHost = value => String(value || '')
  .toLowerCase()
  .split(':')[0]
  .replace(/^www\./, '')
  .trim();

const requestHost = req => String(req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();

const platformDomain = cleanHost(process.env.PUBLIC_PLATFORM_DOMAIN || 'sprintsales.net');
const reservedPlatformHosts = new Set([
  platformDomain,
  `www.${platformDomain}`,
  `automation.${platformDomain}`,
  `bingo.${platformDomain}`,
  cleanHost(process.env.PUBLIC_APP_HOST || ''),
  cleanHost(process.env.PUBLIC_DASHBOARD_HOST || '')
].filter(Boolean));

const platformSubdomainSlug = host => {
  const hostKey = cleanHost(host);
  if (!platformDomain || reservedPlatformHosts.has(hostKey)) return '';
  const suffix = `.${platformDomain}`;
  if (!hostKey.endsWith(suffix)) return '';
  return slugify(hostKey.slice(0, -suffix.length));
};

const cleanUsername = value => {
  const text = String(value || '').trim();
  if (!text) return '';
  const match = text.match(/(?:https?:\/\/t\.me\/)?@?([A-Za-z0-9_]{4,})/i);
  return match ? match[1] : text.replace(/^@/, '');
};

const firstText = values => values
  .map(value => String(value || '').trim())
  .find(Boolean) || '';

const asList = value => {
  if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean);
  return String(value || '')
    .split(/[,|/]+/)
    .map(item => item.trim())
    .filter(Boolean);
};

const uniqueValues = values => asList(values)
  .map(value => value.slice(0, 50))
  .filter((value, index, arr) => arr.findIndex(item => item.toLowerCase() === value.toLowerCase()) === index)
  .slice(0, 20);

const productPrice = product => product?.sellingPrice || product?.price || '';
const moneyNumber = value => {
  const n = Number(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const clampText = (value, max = 180) => String(value || '').trim().slice(0, max);
const cleanSessionId = value => String(value || '')
  .trim()
  .replace(/[^A-Za-z0-9_.:-]/g, '')
  .slice(0, 90);

const statusAllowsCatalog = client => String(client?.status || '').toLowerCase() === 'active';

const productAllowsCatalog = product => {
  if (!product?.name) return false;
  if (product.isActive === false) return false;
  const status = String(product.status || '').toLowerCase();
  if (['inactive', 'disabled', 'draft', 'deleted', 'archived'].includes(status)) return false;
  const stock = String(product.stockStatus || product.availability || product.status || '').toLowerCase();
  if (/(out[_\s-]?of[_\s-]?stock|sold[_\s-]?out|unavailable)/i.test(stock)) return false;
  return true;
};

const clientMiniappSettings = client => {
  const websiteTheme = websiteThemeForClient(client);
  return {
    enabled: client?.settings?.miniapp?.enabled !== false,
    slug: slugify(client?.settings?.miniapp?.slug || client?.settings?.storeSlug || client?.businessName || client?.id),
    customDomain: cleanHost(client?.settings?.miniapp?.customDomain || client?.settings?.miniappDomain || ''),
    template: miniappTemplateForClient(client),
    themeColor: websiteTheme.themeColor,
    accentColor: websiteTheme.accentColor
  };
};

const clientRetailType = client => String(
  client?.settings?.businessProfile?.retailType ||
  client?.settings?.businessProfile?.businessType ||
  client?.retailType ||
  client?.businessTypeLabel ||
  ''
).toLowerCase();

const isCakeClient = client => /cake|bakery|pastry|dessert/.test(clientRetailType(client));

const isCakeProduct = product => /cake|bakery|pastr|dessert|birthday|wedding|fondant|bento|cupcake/.test([
  product?.category,
  product?.subcategory,
  product?.name,
  product?.productType
].filter(Boolean).join(' ').toLowerCase());

const cakeOrderSettings = (client, product = null) => {
  const productRaw = product?.cakePaymentSettings || product?.cakeOrderSettings || null;
  const useProductRaw = productRaw && ['full', 'deposit', 'delivery'].includes(String(productRaw.paymentMode || productRaw.mode || '').toLowerCase());
  const raw = useProductRaw ? productRaw : (client?.settings?.cakeOrderSettings || {});
  const depositType = String(raw.depositType || '').toLowerCase() === 'fixed' ? 'fixed' : 'percent';
  const rawValue = Number(raw.depositValue ?? 30);
  const depositValue = depositType === 'fixed'
    ? Math.max(0, Math.min(999999, Number.isFinite(rawValue) ? rawValue : 0))
    : Math.max(0, Math.min(100, Number.isFinite(rawValue) ? rawValue : 30));
  const rawMode = String(raw.paymentMode || '').toLowerCase();
  return {
    paymentMode: rawMode === 'deposit' || rawMode === 'delivery' ? rawMode : 'full',
    depositType,
    depositValue,
    writingRequired: raw.writingRequired !== false
  };
};

const paymentPlanForOrder = (client, total, product = null) => {
  const fullTotal = Math.max(0, moneyNumber(total));
  const settings = cakeOrderSettings(client, product);
  if (!isCakeClient(client) || settings.paymentMode === 'full') {
    return {
      mode: 'full',
      dueNow: fullTotal,
      balance: 0,
      label: 'Full payment',
      note: 'Full payment is required before delivery.'
    };
  }
  if (settings.paymentMode === 'delivery') {
    return {
      mode: 'delivery',
      dueNow: 0,
      balance: fullTotal,
      label: 'Payment on delivery/pickup',
      note: 'No online payment is required now. The shop will collect payment on delivery or pickup.'
    };
  }
  const rawDeposit = settings.depositType === 'fixed'
    ? settings.depositValue
    : fullTotal * (settings.depositValue / 100);
  const dueNow = Math.min(fullTotal, Math.max(1, Math.round(rawDeposit)));
  const balance = Math.max(0, fullTotal - dueNow);
  return {
    mode: 'deposit',
    dueNow,
    balance,
    label: 'Kabd / advance payment',
    note: balance
      ? `${dueNow} Birr Kabd is required now. Remaining balance: ${balance} Birr.`
      : 'Kabd covers the full order amount.'
  };
};

const paymentDueNowForOrder = order => {
  if (order && order.paymentDueNow !== undefined && order.paymentDueNow !== null && String(order.paymentDueNow) !== '') return String(order.paymentDueNow);
  if (order && order.paymentRequiredAmount !== undefined && order.paymentRequiredAmount !== null && String(order.paymentRequiredAmount) !== '') return String(order.paymentRequiredAmount);
  return String(order?.total || '');
};

const publicShopText = value => {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/created this workspace by self[-\s]?registration/i.test(text)) return '';
  return text;
};

const publicMapUrl = client => {
  const settings = client?.settings || {};
  const profile = settings.businessProfile || {};
  const text = firstText([
    profile.mapUrl,
    settings.delivery?.shop_map_url,
    settings.shopMapUrl
  ]).slice(0, 600);
  if (!text) return '';
  try {
    const url = new URL(text);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const isGoogleMap = host === 'maps.app.goo.gl' || host === 'goo.gl' || host === 'google.com' || host.endsWith('.google.com');
    return url.protocol === 'https:' && isGoogleMap ? text : '';
  } catch {
    return '';
  }
};

const publicShopAddress = client => {
  const settings = client?.settings || {};
  const profile = settings.businessProfile || {};
  const branches = Array.isArray(settings.businessBranches) ? settings.businessBranches : [];
  const primaryBranch = branches.find(branch => branch && (branch.address || branch.city)) || null;
  const address = firstText([
    primaryBranch?.address,
    profile.address,
    settings.delivery?.shop_address,
    client?.address
  ]);
  const city = firstText([
    primaryBranch?.city,
    settings.city,
    client?.city
  ]);
  return [address, city].filter(Boolean).join(address && city && address.toLowerCase().includes(city.toLowerCase()) ? '' : ', ');
};

const pathBasename = value => String(value || '').split(/[\\/]/).pop() || '';

const imageUrlForPath = (clientId, value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  if (text.startsWith('/uploads/')) return text;
  const name = pathBasename(text);
  return name ? `/uploads/products/${encodeURIComponent(clientId)}/${encodeURIComponent(name)}` : '';
};

const imageRecords = product => {
  const records = Array.isArray(product?.images) ? product.images : [];
  const cakeProduct = isCakeProduct(product);
  if (records.length) {
    return records
      .map((item, index) => {
        if (!item) return null;
        if (typeof item === 'string') return { publicPath: item, watermarkedPath: item, isPrimary: index === 0 };
        const publicPath = cakeProduct
          ? (item.originalPath || item.imageOriginalPath || item.publicPath || item.publicImagePath || item.imagePath || item.imageUrl || item.url || '')
          : (item.publicPath || item.publicImagePath || item.watermarkedPath || item.watermarkedImagePath || item.imagePath || item.imageUrl || item.url || '');
        return {
          publicPath,
          watermarkedPath: item.watermarkedPath || item.watermarkedImagePath || publicPath,
          isPrimary: item.isPrimary === true || index === 0
        };
      })
      .filter(item => item?.publicPath || item?.watermarkedPath)
      .slice(0, 5);
  }
  const publicPath = cakeProduct
    ? (product?.originalImagePath || product?.imageOriginalPath || product?.publicImagePath || product?.imagePath || product?.imageUrl || product?.image || '')
    : (product?.publicImagePath || product?.watermarkedImagePath || product?.imagePath || product?.imageUrl || product?.image || '');
  return publicPath ? [{ publicPath, watermarkedPath: product?.watermarkedImagePath || publicPath, isPrimary: true }] : [];
};

const normalizedSpecGroups = product => {
  const groups = [];
  const seen = new Set();
  const seenValues = new Set();
  const addGroup = (key, label, field, values) => {
    const cleanValues = uniqueValues(values);
    const cleanKey = String(key || label || field || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!cleanKey || !cleanValues.length || seen.has(cleanKey)) return;
    seen.add(cleanKey);
    cleanValues.forEach(value => seenValues.add(value.toLowerCase()));
    groups.push({
      key: cleanKey,
      label: String(label || key || 'Option').trim().slice(0, 50),
      field: ['size', 'color', 'option'].includes(field) ? field : 'option',
      values: cleanValues
    });
  };
  const classifyLegacySizeValues = values => {
    const clean = uniqueValues(values);
    const storage = [];
    const ram = [];
    const screen = [];
    const other = [];
    clean.forEach(value => {
      const lower = value.toLowerCase();
      if (/\bram\b/.test(lower)) ram.push(value);
      else if (/^\d+(?:\.\d+)?\s*(?:gb|tb)$/i.test(value)) storage.push(value);
      else if (/\b(?:inch|inches|["”])\b/i.test(value)) screen.push(value);
      else other.push(value);
    });
    return { storage, ram, screen, other };
  };
  (Array.isArray(product?.specGroups) ? product.specGroups : []).forEach(group => {
    const label = String(group?.label || group?.name || group?.key || 'Option').trim();
    const key = group?.key || label;
    const field = /color|colour/i.test(label) ? 'color' : (/size|waist|shoe|ram|storage|capacity/i.test(label) ? 'size' : 'option');
    const values = group?.values || group?.options || group?.choices;
    if (/storage\s*\/\s*memory|memory|storage/i.test(label) && asList(values).some(value => /\bram\b/i.test(value))) {
      const split = classifyLegacySizeValues(values);
      addGroup('storage', 'Storage', 'size', split.storage);
      addGroup('ram', 'RAM', 'size', split.ram);
      addGroup('screen_size', 'Screen Size', 'option', split.screen);
      addGroup(key, label, group?.field || field, split.other);
      return;
    }
    addGroup(key, label, group?.field || field, group?.values || group?.options || group?.choices);
  });
  const fallbackSizes = uniqueValues(product?.sizes || product?.size_options || product?.sizeOptions)
    .filter(value => !seenValues.has(value.toLowerCase()));
  const legacy = classifyLegacySizeValues(fallbackSizes);
  addGroup('storage', 'Storage', 'size', legacy.storage);
  addGroup('ram', 'RAM', 'size', legacy.ram);
  addGroup('screen_size', 'Screen Size', 'option', legacy.screen);
  addGroup('size', 'Size', 'size', legacy.other);
  addGroup('color', 'Color', 'color', product?.colors || product?.color_options || product?.colorOptions);
  addGroup('option', 'Option', 'option', uniqueValues(product?.options || product?.variantOptions || product?.specifications)
    .filter(value => !seenValues.has(value.toLowerCase())));
  return groups.slice(0, 8);
};

const serializeProduct = product => ({
  id: product.id,
  code: product.code || product.productCode || product.product_code || '',
  name: product.name || '',
  description: String(product.description || product.salesPostCaption || product.caption || '').slice(0, 220),
  featured: product.featured === true || product.isFeatured === true || product.miniappFeatured === true,
  price: productPrice(product),
  compareAtPrice: product.compareAtPrice || product.oldPrice || '',
  category: product.category || product.selectedCategory || 'Other',
  subcategory: product.subcategory || product.selectedSubcategory || '',
  availability: product.availability || product.stockStatus || '',
  colors: asList(product.colors || product.color_options || product.colorOptions),
  sizes: asList(product.sizes || product.size_options || product.sizeOptions),
  options: asList(product.options || product.variantOptions || product.specifications),
  specGroups: normalizedSpecGroups(product),
  cakePaymentSettings: product.cakePaymentSettings || product.cakeOrderSettings || null,
  images: imageRecords(product).map(image => imageUrlForPath(product.clientId, image.publicPath || image.watermarkedPath)).filter(Boolean)
});

const ADDIS_AREA_WORDS = [
  'addis', 'addis ababa', 'piassa', 'piazza', 'mexico', 'kazanchis', 'arat killo', '4 kilo',
  'amist killo', 'sidist killo', '6 kilo', 'churchill', 'legehar', 'stadium', 'meskel',
  'bambis', 'bamis', 'filwoha', 'sengatera', 'teklehaimanot', 'sebategna', 'merkato',
  'bole', 'atlas', 'medhanialem', 'rwanda', 'bulbula', 'arabsa', 'gerji', 'imperial',
  '22', 'hayahulet', 'haya hulet', 'haya arat', 'megenagna', 'ayat', 'cmc', 'summit',
  'gurd shola', 'salite', 'figa', 'jakros', 'unity park', 'shola', 'kotebe', 'kara',
  'ferensay', 'gurara', 'kebena', 'jan meda', 'shiromeda', 'entoto', 'gullele',
  'kechene', 'wingate', 'addisu gebeya', 'semen mazoria', 'lideta', 'abnet', 'geja',
  'kocher', 'tor hailoch', 'keraniyo', 'bethel', 'ayer tena', 'kolfe', 'total',
  'zenebework', 'alem bank', 'repi', 'koshe', 'karakore', 'saris', 'gotera', 'kera',
  'bulgaria', 'bisrate', 'old airport', 'mekanisa', 'jemo', 'lebu', 'mebrat hail',
  'hana mariam', 'lafto', 'gofa', 'kality', 'kaliti', 'gelan', 'tulu dimtu', 'akaki',
  'furi', 'burayu', 'sululta', 'sendafa', 'dukem', 'raguel', 'bomb tera', 'dubai tera',
  'ehil berenda'
];
const OUTSIDE_ADDIS_WORDS = [
  'adama', 'nazret', 'hawassa', 'bahir dar', 'gondar', 'mekelle', 'dire dawa', 'harar',
  'jimma', 'dessie', 'debre', 'bishoftu', 'mojo', 'shashemene', 'nekemte', 'ambo',
  'wolkite', 'butajira', 'assela', 'jijiga', 'axum', 'arbaminch'
];
const areaWordRegex = words => new RegExp(`\\b(${words
  .map(word => String(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'))
  .join('|')})\\b`, 'i');
const ADDIS_AREA_RE = areaWordRegex(ADDIS_AREA_WORDS);
const OUTSIDE_ADDIS_RE = areaWordRegex(OUTSIDE_ADDIS_WORDS);
const normalizeKey = value => String(value || '').toLowerCase().replace(/[^a-z0-9\u1200-\u137f]+/g, ' ').trim();
const isInAddis = address => ADDIS_AREA_RE.test(String(address || ''));
const isClearlyOutsideAddis = address => OUTSIDE_ADDIS_RE.test(String(address || ''));

const findDeliveryZoneForAddress = (delivery, address = '') => {
  const zones = Array.isArray(delivery?.zones) ? delivery.zones : [];
  const addressKey = normalizeKey(address);
  if (!addressKey) return null;
  const directMatch = zones.find(zone => {
    if (!zone || zone.enabled === false) return false;
    const areaKey = normalizeKey(zone.area || zone.name);
    return areaKey && (addressKey === areaKey || addressKey.includes(areaKey) || areaKey.includes(addressKey));
  });
  if (directMatch) return directMatch;
  const addressTokens = new Set(addressKey.split(' ').filter(Boolean));
  const tokenMatches = zones.filter(zone => {
    if (!zone || zone.enabled === false) return false;
    const firstToken = normalizeKey(zone.area || zone.name).split(' ')[0];
    return firstToken && addressTokens.has(firstToken);
  });
  return tokenMatches.length === 1 ? tokenMatches[0] : null;
};

const deliveryQuoteForOrder = (client, address, subtotal) => {
  const delivery = client?.settings?.delivery || {};
  const hasLegacyZones = !delivery.mode && Array.isArray(delivery.zones) && delivery.zones.length > 0;
  const mode = hasLegacyZones ? 'location_zones' : (delivery.mode || 'fixed_addis');
  const zone = findDeliveryZoneForAddress(delivery, address);
  if (mode === 'location_zones' && zone) {
    const fee = Math.max(0, Number(zone.fee || 0) || 0);
    const maxHours = Math.max(1, Number(zone.maxHours || 24) || 24);
    return {
      inAddis: true,
      fee,
      status: 'not-started',
      source: 'delivery_zone',
      area: zone.area || zone.name || '',
      maxHours,
      total: Number(subtotal || 0) + fee,
      note: fee ? `Delivery to ${zone.area || zone.name}: ${fee} ETB, max ${maxHours} hour(s)` : `Free delivery to ${zone.area || zone.name}, max ${maxHours} hour(s)`
    };
  }
  if (mode === 'fixed_addis' && (isInAddis(address) || !isClearlyOutsideAddis(address))) {
    const fee = Math.max(0, Number(delivery.addis_delivery_fee ?? 300) || 0);
    const maxHours = Math.max(1, Number(delivery.maxHours || delivery.defaultMaxHours || 24) || 24);
    return {
      inAddis: true,
      fee,
      status: 'not-started',
      source: isInAddis(address) ? 'fixed_addis' : 'fixed_addis_fallback',
      maxHours,
      total: Number(subtotal || 0) + fee,
      note: fee ? `Includes ${fee} ETB delivery fee.` : 'Free delivery.'
    };
  }
  return {
    inAddis: false,
    fee: 0,
    status: delivery.outside_addis_behavior === 'reject' ? 'delivery_rejected' : 'delivery_review_needed',
    source: 'manual',
    total: Number(subtotal || 0),
    note: 'Delivery fee needs shop confirmation before payment.'
  };
};

const validPaymentOptions = client => {
  const methods = client?.settings?.paymentOptions || client?.settings?.paymentMethods || [];
  return (Array.isArray(methods) ? methods : [])
    .slice(0, 3)
    .map(item => typeof item === 'string'
      ? { method: item, accountNumber: '', accountName: '' }
      : {
          method: String(item?.method || '').trim(),
          accountNumber: String(item?.accountNumber || '').trim(),
          accountName: String(item?.accountName || '').trim()
        })
    .filter(item => item.method && item.accountNumber && item.accountName);
};

const publicOrderCode = orderOrId => {
  const id = typeof orderOrId === 'string' ? orderOrId : orderOrId?.id;
  const short = String(id || '').slice(-8);
  return short ? `#${short}` : '';
};

const normalizePhoneDigits = value => {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('251') && digits.length >= 12) digits = `0${digits.slice(3)}`;
  if (digits.startsWith('9') && digits.length === 9) digits = `0${digits}`;
  if (digits.startsWith('7') && digits.length === 9) digits = `0${digits}`;
  return digits;
};

const phoneMatches = (submitted, saved) => {
  const a = normalizePhoneDigits(submitted);
  const b = normalizePhoneDigits(saved);
  if (!a || !b) return false;
  if (a === b) return true;
  return a.length >= 9 && b.length >= 9 && a.slice(-9) === b.slice(-9);
};

const listIncludes = (list, value) => {
  const clean = String(value || '').trim();
  return Boolean(clean) && Array.isArray(list) && list.some(item => String(item || '').trim() === clean);
};

const mergeUnique = (...values) => [...new Set(values.flat()
  .map(value => String(value || '').trim())
  .filter(Boolean))]
  .slice(0, 8);

const chatIdFromTelegramUser = value => {
  const clean = String(value || '').trim();
  return /^\d{5,20}$/.test(clean) ? clean : '';
};

const orderSummary = order => ({
  id: order.id || '',
  trackingCode: publicOrderCode(order),
  productName: order.productName || '',
  productCode: order.productCode || '',
  productImageUrl: order.productImageUrl || '',
  quantity: order.quantity || 1,
  total: order.total || order.totalAmount || '',
  paymentDueNow: order.paymentDueNow || order.paymentRequiredAmount || '',
  paymentBalanceAmount: order.paymentBalanceAmount || '',
  paymentMode: order.paymentMode || '',
  status: order.status || '',
  paymentStatus: order.paymentStatus || '',
  deliveryStatus: order.deliveryStatus || '',
  deliveryArea: order.deliveryArea || '',
  deliveryMaxHours: order.deliveryMaxHours || order.deliveryEtaHours || '',
  createdAt: order.createdAt || ''
});

const miniappCheckoutPayload = (client, order, botUrl = '') => {
  const dueNow = moneyNumber(paymentDueNowForOrder(order));
  const paymentNeededNow = !order.awaitingDeliveryFee && dueNow > 0;
  return {
    order: {
    id: order.id,
    trackingCode: publicOrderCode(order),
    status: order.status,
    paymentStatus: order.paymentStatus,
    productName: order.productName,
    productCode: order.productCode,
    quantity: order.quantity,
    unitPrice: order.unitPrice,
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    deliveryArea: order.deliveryArea,
    deliveryMaxHours: order.deliveryMaxHours,
    deliveryStatus: order.deliveryStatus,
    total: order.total,
    paymentMode: order.paymentMode || 'full',
    paymentDueNow: paymentDueNowForOrder(order),
    paymentBalanceAmount: order.paymentBalanceAmount || '',
    paymentLabel: order.paymentLabel || '',
    paymentNote: order.paymentNote || '',
    cakeWritingText: order.cakeWritingText || '',
    cakeNeededDate: order.cakeNeededDate || '',
    cakeNeededTime: order.cakeNeededTime || '',
    productImageUrl: order.productImageUrl,
    createdAt: order.createdAt,
    awaitingDeliveryFee: order.awaitingDeliveryFee
  },
  payment: {
    ready: paymentNeededNow,
    mode: String(client.settings?.paymentVerificationMode || client.settings?.paymentVerification?.mode || 'manual').toLowerCase() === 'automatic' ? 'automatic' : 'manual',
    collectionMode: order.paymentMode || 'full',
    amount: paymentNeededNow ? paymentDueNowForOrder(order) : '',
    totalAmount: order.total || '',
    balanceAmount: order.paymentBalanceAmount || '',
    label: order.paymentLabel || 'Payment',
    note: order.paymentNote || '',
    options: paymentNeededNow ? validPaymentOptions(client) : [],
    instruction: order.awaitingDeliveryFee
      ? 'The shop needs to confirm the delivery fee before payment.'
      : (!paymentNeededNow ? (order.paymentNote || 'No online payment is required now. The shop will collect payment on delivery or pickup.') 
      : 'After payment, paste the full bank/Telebirr SMS or exact transaction/reference number here so we can verify the payment.'
      )
  },
  botUrl
  };
};

const optionMatch = (value, choices) => {
  const clean = String(value || '').trim();
  if (!clean) return '';
  return choices.find(choice => choice.toLowerCase() === clean.toLowerCase()) || '';
};

const selectedSpecsFromBody = (product, body) => {
  const submitted = body?.specs && typeof body.specs === 'object' ? body.specs : {};
  const selectedSpecs = [];
  for (const group of normalizedSpecGroups(product)) {
    const choices = group.values || [];
    const chosen = choices.length === 1 ? choices[0] : optionMatch(submitted[group.key], choices);
    if (choices.length > 1 && !chosen) {
      return { error: `Please choose ${group.label}.` };
    }
    if (chosen) selectedSpecs.push({ key: group.key, label: group.label, field: group.field, value: chosen });
  }
  return { selectedSpecs };
};

const orderSpecFields = selectedSpecs => ({
  selectedSize: selectedSpecs.filter(item => item.field === 'size').map(item => item.value).join(', '),
  selectedColor: selectedSpecs.find(item => item.field === 'color')?.value || '',
  selectedOption: selectedSpecs.filter(item => item.field === 'option').map(item => item.value).join(', ')
});

const findClientForMiniapp = (data, slugOrId, host) => {
  const hostKey = cleanHost(host);
  const hostSlug = platformSubdomainSlug(hostKey);
  const slugKey = slugify(slugOrId === '_host' && hostSlug ? hostSlug : slugOrId);
  const compactKey = compactSlug(slugKey);
  const activeClients = (data.clients || []).filter(client => statusAllowsCatalog(client));

  const byDomain = activeClients.find(client => {
    const settings = clientMiniappSettings(client);
    return settings.enabled && settings.customDomain && settings.customDomain === hostKey;
  });
  if (byDomain) return byDomain;

  return activeClients.find(client => {
    const settings = clientMiniappSettings(client);
    const candidates = [
      settings.slug,
      client.businessName,
      client.id,
      String(client.id || '').toLowerCase()
    ];
    return settings.enabled && (
      settings.slug === slugKey ||
      slugify(client.businessName) === slugKey ||
      slugify(client.id) === slugKey ||
      String(client.id || '').toLowerCase() === String(slugOrId || '').toLowerCase() ||
      candidates.some(candidate => compactSlug(candidate) === compactKey)
    );
  }) || null;
};

const categoryIconImageFor = (client, label) => {
  const map = client?.settings?.categoryIconImages || client?.settings?.cakeTypeIconImages || {};
  const key = String(label || '').trim();
  if (!key || !map || typeof map !== 'object') return '';
  return publicShopText(map[key] || map[slugify(key)] || '');
};

const categoriesFromProducts = (products, client = null) => {
  const map = new Map();
  for (const product of products) {
    const category = product.category || 'Other';
    if (!map.has(category)) map.set(category, { name: category, count: 0, subcategories: new Map() });
    const entry = map.get(category);
    entry.count += 1;
    if (product.subcategory) entry.subcategories.set(product.subcategory, (entry.subcategories.get(product.subcategory) || 0) + 1);
  }
  return [...map.values()].map(item => ({
    name: item.name,
    count: item.count,
    iconImageUrl: categoryIconImageFor(client, item.name),
    subcategories: [...item.subcategories.entries()].map(([name, count]) => ({
      name,
      count,
      iconImageUrl: categoryIconImageFor(client, name)
    })).sort((a, b) => a.name.localeCompare(b.name))
  })).sort((a, b) => a.name.localeCompare(b.name));
};

export function createMiniappRoutes(deps) {
  const {
    publicDir,
    readData,
    writeData,
    uid = prefix => `${prefix}_${Date.now().toString(36)}`,
    now = () => new Date().toISOString(),
    addAuditLog = () => {},
    sendClientNotification = null,
    sendPlatformAdminBotMessage = null,
    sendCustomerTelegramMessage = null,
    paymentVerificationService = null,
    isProductBusiness = () => true,
    activeClientProducts
  } = deps;
  const router = Router();

  const privateOwnerChatId = client => {
    const settings = client?.settings || {};
    return [
      settings.sprintsalesAdminChatId,
      settings.telegramOwnerChatId,
      settings.ownerChatId,
      settings.hotLeadNotifyChatId
    ]
      .map(value => String(value || '').trim())
      .find(value => /^\d{5,20}$/.test(value)) || '';
  };

  const deliveryButtonsForOrder = order => ({
    inline_keyboard: [
      [{ text: 'Track Order', callback_data: 'productflow:track_order' }],
      [{ text: 'Main Menu', callback_data: 'productflow:main_menu' }]
    ]
  });

  const paymentConfirmedCustomerMessage = (client, order) => [
    `${order.paymentMode === 'deposit' ? 'Kabd payment confirmed' : 'Payment confirmed'}. Thank you, ${order.customerName || 'dear customer'}!`,
    '',
    `Tracking code: ${publicOrderCode(order)}.`,
    order.productName ? `We are preparing: ${[order.productName, order.selectedSize, order.selectedColor, order.selectedOption].filter(Boolean).join(' ')}.` : 'We are preparing your order.',
    order.cakeWritingText ? `Cake writing: ${order.cakeWritingText}` : '',
    order.paymentBalanceAmount && Number(order.paymentBalanceAmount) > 0 ? `Remaining balance: ${order.paymentBalanceAmount} Birr.` : '',
    '',
    `You are always welcome at ${client.businessName || 'the shop'}.`,
    'You can track this order from the bot any time by sending the tracking code above.'
  ].filter(line => line !== '').join('\n');

  const paymentReviewCustomerMessage = (client, order, reason = '') => [
    `We could not verify payment automatically for order ${publicOrderCode(order)}.`,
    'Please paste the full bank/Telebirr SMS or the exact transaction/reference number again.',
    reason ? `Reason: ${String(reason).slice(0, 160)}` : '',
    '',
    `If you need help, use Talk to Support in ${client.businessName || 'the shop'} bot.`
  ].filter(Boolean).join('\n');

  const customerMatchesIdentity = (customer, identity = {}) => customer?.clientId === identity.clientId && (
    (identity.telegramChatId && String(customer.telegramChatId || '') === identity.telegramChatId) ||
    (identity.telegramUserId && String(customer.telegramUserId || '') === identity.telegramUserId) ||
    (identity.telegramUsername && String(customer.username || '').toLowerCase() === identity.telegramUsername.toLowerCase()) ||
    (identity.phone && phoneMatches(identity.phone, customer.phone)) ||
    (identity.shopperSessionId && (
      String(customer.shopperSessionId || '') === identity.shopperSessionId ||
      listIncludes(customer.shopperSessionIds, identity.shopperSessionId)
    ))
  );

  const orderMatchesIdentity = (order, identity = {}) => order?.clientId === identity.clientId && (
    (identity.telegramChatId && String(order.telegramChatId || '') === identity.telegramChatId) ||
    (identity.telegramUserId && String(order.telegramUserId || '') === identity.telegramUserId) ||
    (identity.telegramUsername && String(order.username || '').toLowerCase() === identity.telegramUsername.toLowerCase()) ||
    (identity.phone && phoneMatches(identity.phone, order.phone)) ||
    (identity.shopperSessionId && (
      String(order.shopperSessionId || '') === identity.shopperSessionId ||
      listIncludes(order.shopperSessionIds, identity.shopperSessionId)
    ))
  );

  const upsertMiniappCustomer = (data, client, identity = {}) => {
    data.customers ||= [];
    const nowValue = now();
    const matchIdentity = { ...identity, clientId: client.id };
    let customer = data.customers.find(item => customerMatchesIdentity(item, matchIdentity));
    if (!customer) {
      customer = {
        id: uid('customer'),
        clientId: client.id,
        source: 'miniapp',
        createdAt: nowValue
      };
      data.customers.push(customer);
    }
    customer.name = identity.fullName || customer.name || '';
    customer.customerName = customer.name;
    customer.phone = identity.phone || customer.phone || '';
    customer.address = identity.address || customer.address || '';
    customer.deliveryLocation = identity.address || customer.deliveryLocation || '';
    customer.telegramChatId = identity.telegramChatId || customer.telegramChatId || '';
    customer.telegramUserId = identity.telegramUserId || customer.telegramUserId || '';
    customer.username = identity.telegramUsername || customer.username || '';
    customer.shopperSessionId = identity.shopperSessionId || customer.shopperSessionId || '';
    customer.shopperSessionIds = mergeUnique(customer.shopperSessionIds || [], customer.shopperSessionId, identity.shopperSessionId);
    customer.source = customer.source || 'miniapp';
    customer.updatedAt = nowValue;
    return customer;
  };

  const identityFromPayload = (payload = {}, client) => {
    const telegramUserId = clampText(payload.telegramUserId, 40);
    const telegramChatId = clampText(payload.telegramChatId || payload.chatId || chatIdFromTelegramUser(telegramUserId), 40);
    return {
      clientId: client.id,
      fullName: clampText(payload.fullName || payload.customerName || payload.name, 90),
      phone: clampText(payload.phone, 30),
      address: clampText(payload.address || payload.deliveryLocation || payload.deliveryAddress || payload.deliveryNote, 260),
      telegramChatId,
      telegramUserId,
      telegramUsername: clampText(payload.telegramUsername || payload.username, 80),
      shopperSessionId: cleanSessionId(payload.shopperSessionId || payload.deviceId || payload.sessionId),
      shopperLanguage: clampText(payload.shopperLanguage || payload.language, 24) || 'english'
    };
  };

  const miniappEventIdentityMatches = (item = {}, identity = {}) => (
    (identity.telegramChatId && String(item.telegramChatId || '') === identity.telegramChatId) ||
    (identity.telegramUserId && String(item.telegramUserId || '') === identity.telegramUserId) ||
    (identity.telegramUsername && String(item.username || '').toLowerCase() === identity.telegramUsername.toLowerCase()) ||
    (identity.shopperSessionId && (
      String(item.shopperSessionId || '') === identity.shopperSessionId ||
      listIncludes(item.shopperSessionIds, identity.shopperSessionId)
    ))
  );

  const recordMiniappEvent = (data, client, customer, type, payload = {}, product = null) => {
    data.miniappEvents ||= [];
    data.miniappEvents.push({
      id: uid('miniapp_event'),
      clientId: client.id,
      customerId: customer?.id || '',
      type,
      productId: product?.id || clampText(payload.productId, 80),
      productCode: product?.code || product?.productCode || clampText(payload.productCode, 80),
      category: clampText(payload.category || product?.category, 80),
      subcategory: clampText(payload.subcategory || product?.subcategory, 80),
      query: clampText(payload.query, 160),
      telegramChatId: customer?.telegramChatId || '',
      telegramUserId: customer?.telegramUserId || '',
      username: customer?.username || '',
      shopperSessionId: customer?.shopperSessionId || cleanSessionId(payload.shopperSessionId || ''),
      source: 'miniapp',
      createdAt: now()
    });
    if (data.miniappEvents.length > 5000) data.miniappEvents.splice(0, data.miniappEvents.length - 5000);
  };

  const findMiniappIntent = (data, client, identity, product) => (data.productIntents || []).find(item =>
    item.clientId === client.id &&
    String(item.productId || '') === String(product?.id || '') &&
    miniappEventIdentityMatches(item, identity)
  );

  const recordMiniappProductIntent = (data, client, customer, identity, product, source = 'viewed') => {
    if (!product) return null;
    data.productIntents ||= [];
    const nowValue = now();
    let intent = findMiniappIntent(data, client, identity, product);
    if (!intent) {
      intent = {
        id: uid('intent'),
        clientId: client.id,
        customerId: customer?.id || '',
        productId: product.id || '',
        productCode: product.code || product.productCode || '',
        productName: product.name || product.code || '',
        conversationId: '',
        telegramChatId: identity.telegramChatId || customer?.telegramChatId || '',
        telegramUserId: identity.telegramUserId || customer?.telegramUserId || '',
        username: identity.telegramUsername || customer?.username || '',
        shopperSessionId: identity.shopperSessionId || customer?.shopperSessionId || '',
        shopperSessionIds: mergeUnique(identity.shopperSessionId, customer?.shopperSessionIds || []),
        customerName: identity.fullName || customer?.name || '',
        shopperLanguage: identity.shopperLanguage || customer?.shopperLanguage || 'english',
        source: 'miniapp',
        status: 'watching',
        viewCount: 0,
        remindersSent: 0,
        createdAt: nowValue
      };
      data.productIntents.push(intent);
    }
    intent.customerId = customer?.id || intent.customerId || '';
    intent.telegramChatId = identity.telegramChatId || intent.telegramChatId || customer?.telegramChatId || '';
    intent.telegramUserId = identity.telegramUserId || intent.telegramUserId || customer?.telegramUserId || '';
    intent.username = identity.telegramUsername || intent.username || customer?.username || '';
    intent.shopperSessionId = identity.shopperSessionId || intent.shopperSessionId || customer?.shopperSessionId || '';
    intent.shopperSessionIds = mergeUnique(intent.shopperSessionIds || [], identity.shopperSessionId, customer?.shopperSessionIds || []);
    intent.customerName = identity.fullName || intent.customerName || customer?.name || '';
    intent.productCode = product.code || product.productCode || intent.productCode || '';
    intent.productName = product.name || intent.productName || '';
    intent.shopperLanguage = identity.shopperLanguage || intent.shopperLanguage || 'english';
    intent.lastActivityAt = nowValue;
    intent.updatedAt = nowValue;
    if (source === 'order_started') {
      intent.source = 'order_started';
      intent.status = 'active';
      intent.orderStartedAt = nowValue;
      intent.startedAt ||= nowValue;
    } else if (source === 'ordered') {
      intent.status = 'ordered';
      intent.orderedAt = nowValue;
    } else {
      intent.source = intent.source === 'order_started' ? intent.source : 'repeat_view';
      intent.viewCount = Number(intent.viewCount || 0) + 1;
      if (Number(intent.viewCount || 0) >= 2 && intent.status === 'watching') {
        intent.status = 'active';
        intent.startedAt ||= nowValue;
      }
    }
    return intent;
  };

  const sendMiniappShell = (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.sendFile(path.join(publicDir, 'miniapp', 'index.html'));
  };

  router.get('/', async (req, res, next) => {
    const data = await readData();
    const host = requestHost(req);
    const client = findClientForMiniapp(data, '_host', host);
    const settings = client ? clientMiniappSettings(client) : null;
    const hasShopHost = Boolean(settings?.customDomain) || Boolean(platformSubdomainSlug(host));
    if (!client || !hasShopHost || !isProductBusiness(client)) return next();
    return sendMiniappShell(res);
  });

  router.get('/api/miniapp/shop/:slug', async (req, res) => {
    const data = await readData();
    const client = findClientForMiniapp(data, req.params.slug, requestHost(req));
    if (!client || !isProductBusiness(client)) {
      return res.status(404).json({ error: 'Shop not found' });
    }
    const settings = clientMiniappSettings(client);
    const products = (activeClientProducts ? activeClientProducts(data, client.id) : (data.products || []).filter(product => product.clientId === client.id))
      .filter(productAllowsCatalog)
      .map(serializeProduct);
    const botUsername = cleanUsername(firstText([
      client.settings?.botUsername,
      client.settings?.accountUsername,
      client.settings?.connectedBotUsername
    ]));
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      shop: {
        id: client.id,
        slug: settings.slug,
        businessName: client.businessName || 'Shop',
        retailType: clientRetailType(client),
        isCakeShop: isCakeClient(client),
        logoUrl: client.settings?.businessLogoUrl || '',
        addressLine: publicShopAddress(client),
        mapUrl: publicMapUrl(client),
        summary: publicShopText(client.settings?.businessProfile?.summary),
        firstTimeWelcomeMessage: publicShopText(client.settings?.businessProfile?.firstTimeWelcomeMessage),
        botUsername,
        template: settings.template,
        themeColor: settings.themeColor,
        accentColor: settings.accentColor,
        cakeOrderSettings: isCakeClient(client) ? cakeOrderSettings(client) : null
      },
      categories: categoriesFromProducts(products, client),
      products
    });
  });

  router.post('/api/miniapp/shop/:slug/account', async (req, res) => {
    if (!writeData) return res.status(500).json({ error: 'Account sync is not configured.' });
    const data = await readData();
    const client = findClientForMiniapp(data, req.params.slug, requestHost(req));
    if (!client || !isProductBusiness(client)) return res.status(404).json({ error: 'Shop not found' });
    const identity = identityFromPayload(req.body || {}, client);
    if (!identity.phone && !identity.telegramChatId && !identity.telegramUserId && !identity.telegramUsername && !identity.shopperSessionId) {
      return res.status(400).json({ error: 'A phone number, Telegram identity, or device session is required.' });
    }
    const customer = upsertMiniappCustomer(data, client, identity);
    await writeData(data);
    res.json({
      ok: true,
      customer: {
        id: customer.id,
        name: customer.name || '',
        phone: customer.phone || '',
        address: customer.address || '',
        telegramChatId: customer.telegramChatId || '',
        telegramUserId: customer.telegramUserId || '',
        username: customer.username || '',
        shopperSessionId: customer.shopperSessionId || ''
      }
    });
  });

  router.post('/api/miniapp/shop/:slug/events', async (req, res) => {
    if (!writeData) return res.status(500).json({ error: 'MiniApp event tracking is not configured.' });
    const data = await readData();
    const client = findClientForMiniapp(data, req.params.slug, requestHost(req));
    if (!client || !isProductBusiness(client)) return res.status(404).json({ error: 'Shop not found' });
    const body = req.body || {};
    const type = String(body.type || body.eventType || '').trim().toLowerCase();
    const allowed = new Set(['shop_open', 'product_view', 'order_started', 'search', 'category_view', 'subcategory_view']);
    if (!allowed.has(type)) return res.status(400).json({ error: 'Unsupported MiniApp event.' });
    const identity = identityFromPayload(body, client);
    const products = (activeClientProducts ? activeClientProducts(data, client.id) : (data.products || []).filter(product => product.clientId === client.id))
      .filter(productAllowsCatalog);
    const product = products.find(item =>
      String(item.id || '') === String(body.productId || '') ||
      (body.productCode && String(item.code || item.productCode || '') === String(body.productCode || ''))
    ) || null;
    const hasIdentity = identity.phone || identity.telegramChatId || identity.telegramUserId || identity.telegramUsername || identity.shopperSessionId || identity.fullName;
    const customer = hasIdentity ? upsertMiniappCustomer(data, client, identity) : null;
    recordMiniappEvent(data, client, customer, type, body, product);
    const intent = product && (type === 'order_started' || type === 'product_view')
      ? recordMiniappProductIntent(data, client, customer, identity, product, type === 'order_started' ? 'order_started' : 'viewed')
      : null;
    await writeData(data);
    res.json({
      ok: true,
      intent: intent ? {
        id: intent.id,
        status: intent.status,
        viewCount: intent.viewCount || 0
      } : null
    });
  });

  router.post('/api/miniapp/shop/:slug/orders', async (req, res) => {
    if (!writeData) return res.status(500).json({ error: 'Order creation is not configured.' });
    const data = await readData();
    const client = findClientForMiniapp(data, req.params.slug, requestHost(req));
    if (!client || !isProductBusiness(client)) return res.status(404).json({ error: 'Shop not found' });
    const body = req.body || {};
    const products = (activeClientProducts ? activeClientProducts(data, client.id) : (data.products || []).filter(product => product.clientId === client.id))
      .filter(productAllowsCatalog);
    const product = products.find(item => String(item.id) === String(body.productId) || String(item.code || item.productCode || '') === String(body.productCode || ''));
    if (!product) return res.status(404).json({ error: 'Product is not available.' });

    const customerName = clampText(body.customerName, 90);
    const phone = clampText(body.phone, 30);
    const address = clampText(body.address || body.deliveryLocation || body.deliveryNote, 260);
    const identity = identityFromPayload({ ...body, fullName: customerName, phone, address }, client);
    const telegramUserId = identity.telegramUserId;
    const telegramUsername = identity.telegramUsername;
    const telegramChatId = identity.telegramChatId;
    const shopperSessionId = identity.shopperSessionId;
    if (!customerName) return res.status(400).json({ error: 'Full name is required.' });
    if (!phone) return res.status(400).json({ error: 'Phone number is required.' });
    if (!address) return res.status(400).json({ error: 'Delivery address is required.' });
    const cakeShop = isCakeClient(client);
    const cakeWritingText = clampText(body.cakeWritingText || body.cakeMessage || body.cakeText, 140);
    const cakeNeededDate = clampText(body.cakeNeededDate || body.neededDate || body.deliveryDate, 30);
    const cakeNeededTime = clampText(body.cakeNeededTime || body.neededTime || body.deliveryTime, 30);

    const quantity = Math.max(1, Math.min(99, parseInt(body.quantity, 10) || 1));
    const unitPrice = moneyNumber(productPrice(product));
    if (!unitPrice) return res.status(400).json({ error: 'This product needs a valid price before it can be ordered online.' });
    const selected = selectedSpecsFromBody(product, body);
    if (selected.error) return res.status(400).json({ error: selected.error });
    const selectedSpecs = selected.selectedSpecs || [];
    const specFields = orderSpecFields(selectedSpecs);
    const subtotal = unitPrice * quantity;
    const deliveryQuote = deliveryQuoteForOrder(client, address, subtotal);
    const total = deliveryQuote.total;
    const paymentPlan = paymentPlanForOrder(client, total, product);
    const paymentNeededNow = moneyNumber(paymentPlan.dueNow) > 0;
    const createdAt = now();
    const primaryImage = serializeProduct(product).images[0] || '';
    const customer = upsertMiniappCustomer(data, client, identity);
    const order = {
      id: uid('order'),
      clientId: client.id,
      customerId: customer.id || '',
      conversationId: '',
      source: 'miniapp',
      channel: 'miniapp',
      status: deliveryQuote.inAddis ? 'confirmed' : 'delivery_review_needed',
      paymentStatus: deliveryQuote.inAddis ? (paymentNeededNow ? 'waiting_for_payment_proof' : 'payment_on_delivery') : 'not_requested',
      deliveryStatus: deliveryQuote.status,
      createdAt,
      updatedAt: createdAt,
      productId: product.id || '',
      productCode: product.code || product.productCode || product.product_code || '',
      productName: product.name || '',
      productImageUrl: primaryImage,
      quantity,
      selectedSize: specFields.selectedSize,
      selectedColor: specFields.selectedColor,
      selectedOption: specFields.selectedOption,
      selectedSpecs,
      selectedSpecMap: Object.fromEntries(selectedSpecs.map(item => [item.key, item.value])),
      unitPrice: String(unitPrice),
      mainSubtotal: String(subtotal),
      addOns: [],
      addOnSubtotal: '0',
      subtotal: String(subtotal),
      discountedSubtotal: String(subtotal),
      discountAmount: '0',
      discountReason: '',
      discountLabel: '',
      discountRate: 0,
      total: String(total),
      deliveryFee: String(deliveryQuote.fee),
      delivery_fee_source: deliveryQuote.source,
      deliveryArea: deliveryQuote.area || '',
      deliveryMaxHours: deliveryQuote.maxHours || '',
      deliveryEtaHours: deliveryQuote.maxHours || '',
      paymentMode: paymentPlan.mode,
      paymentDueNow: String(paymentPlan.dueNow),
      paymentRequiredAmount: String(paymentPlan.dueNow),
      paymentBalanceAmount: String(paymentPlan.balance),
      paymentLabel: paymentPlan.label,
      paymentNote: paymentPlan.note,
      cakeWritingText,
      cakeMessage: cakeWritingText,
      cakeNeededDate,
      cakeNeededTime,
      customization: cakeShop ? {
        type: 'cake',
        writingText: cakeWritingText,
        neededDate: cakeNeededDate,
        neededTime: cakeNeededTime
      } : undefined,
      customerName,
      username: telegramUsername,
      telegramUserId,
      telegramChatId,
      shopperSessionId,
      shopperSessionIds: shopperSessionId ? [shopperSessionId] : [],
      phone,
      deliveryLocation: address,
      deliveryNote: deliveryQuote.note,
      notes: clampText(body.notes, 300),
      awaitingDeliveryFee: !deliveryQuote.inAddis,
      awaitingPaymentProof: deliveryQuote.inAddis && paymentNeededNow,
      customerConfirmedOrder: true,
      confirmedAt: createdAt,
      missingDetails: []
    };
    data.orders ||= [];
    data.orders.push(order);
    const intent = recordMiniappProductIntent(data, client, customer, identity, product, 'ordered');
    if (intent) {
      intent.orderId = order.id;
      order.intentId = intent.id;
    }
    addAuditLog(data, {
      user: { role: 'miniapp', email: 'miniapp-shopper' },
      action: 'miniapp.order.created',
      clientId: client.id,
      target: `${order.productCode} ${order.productName}`.trim(),
      details: `MiniApp order ${order.id} was created.`
    });
    if (typeof sendClientNotification === 'function') {
      const alert = [
        `New MiniApp order for ${client.businessName}`,
        `Order: ${publicOrderCode(order)} (${order.id})`,
        `Customer: ${order.customerName}`,
        `Phone: ${order.phone}`,
        `Product: ${[order.productCode, order.productName].filter(Boolean).join(' - ')}`,
        `Quantity: ${order.quantity}`,
        order.cakeWritingText ? `Cake writing: ${order.cakeWritingText}` : '',
        `Total: ${order.total} Birr`,
        order.paymentMode === 'deposit' ? `Kabd due now: ${order.paymentDueNow} Birr` : '',
        order.paymentBalanceAmount && Number(order.paymentBalanceAmount) > 0 ? `Balance after Kabd: ${order.paymentBalanceAmount} Birr` : '',
        `Delivery: ${order.deliveryArea || order.deliveryLocation}`
      ].filter(Boolean).join('\n');
      await sendClientNotification(data, client, `miniapp-order-${order.id}`, alert, 'orders', 0).catch(() => {});
    }
    await writeData(data);
    res.json({
      ok: true,
      ...miniappCheckoutPayload(
        client,
        order,
        cleanUsername(client.settings?.botUsername) ? `https://t.me/${cleanUsername(client.settings?.botUsername)}` : ''
      )
    });
  });

  router.get('/api/miniapp/shop/:slug/my-orders', async (req, res) => {
    const data = await readData();
    const client = findClientForMiniapp(data, req.params.slug, requestHost(req));
    if (!client || !isProductBusiness(client)) return res.status(404).json({ error: 'Shop not found' });
    const identity = {
      clientId: client.id,
      shopperSessionId: cleanSessionId(req.query.sessionId || req.query.shopperSessionId || req.query.deviceId),
      telegramChatId: clampText(req.query.telegramChatId || req.query.chatId || chatIdFromTelegramUser(req.query.telegramUserId), 40),
      telegramUserId: clampText(req.query.telegramUserId, 40),
      telegramUsername: clampText(req.query.telegramUsername, 80)
    };
    if (!identity.shopperSessionId && !identity.telegramChatId && !identity.telegramUserId && !identity.telegramUsername) {
      return res.status(400).json({ error: 'A device session or Telegram identity is required.' });
    }
    const orders = (data.orders || [])
      .filter(order => orderMatchesIdentity(order, identity))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, 25)
      .map(orderSummary);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, orders });
  });

  router.get('/api/miniapp/shop/:slug/orders/:orderId/resume-payment', async (req, res) => {
    const data = await readData();
    const client = findClientForMiniapp(data, req.params.slug, requestHost(req));
    if (!client || !isProductBusiness(client)) return res.status(404).json({ error: 'Shop not found' });
    const identity = {
      clientId: client.id,
      phone: clampText(req.query.phone, 30),
      shopperSessionId: cleanSessionId(req.query.sessionId || req.query.shopperSessionId || req.query.deviceId),
      telegramChatId: clampText(req.query.telegramChatId || req.query.chatId || chatIdFromTelegramUser(req.query.telegramUserId), 40),
      telegramUserId: clampText(req.query.telegramUserId, 40),
      telegramUsername: clampText(req.query.telegramUsername, 80)
    };
    if (!identity.phone && !identity.shopperSessionId && !identity.telegramChatId && !identity.telegramUserId && !identity.telegramUsername) {
      return res.status(400).json({ error: 'A phone, device session, or Telegram identity is required.' });
    }
    const requested = String(req.params.orderId || '').trim().replace(/^#/, '').toLowerCase();
    const order = (data.orders || []).find(item => {
      if (item.clientId !== client.id) return false;
      const publicCode = publicOrderCode(item).replace(/^#/, '').toLowerCase();
      const id = String(item.id || '').toLowerCase();
      const matchesOrder = id === requested || publicCode === requested || id.endsWith(requested);
      return matchesOrder && orderMatchesIdentity(item, identity);
    });
    if (!order) return res.status(404).json({ error: 'Order not found for this shopper.' });
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      ...miniappCheckoutPayload(
        client,
        order,
        cleanUsername(client.settings?.botUsername) ? `https://t.me/${cleanUsername(client.settings?.botUsername)}` : ''
      )
    });
  });

  router.get('/api/miniapp/shop/:slug/orders/track', async (req, res) => {
    const data = await readData();
    const client = findClientForMiniapp(data, req.params.slug, requestHost(req));
    if (!client || !isProductBusiness(client)) return res.status(404).json({ error: 'Shop not found' });
    const code = String(req.query.code || '').trim().replace(/^#/, '').toLowerCase();
    const phone = String(req.query.phone || '').trim();
    const identity = {
      clientId: client.id,
      phone,
      shopperSessionId: cleanSessionId(req.query.sessionId || req.query.shopperSessionId || req.query.deviceId),
      telegramChatId: clampText(req.query.telegramChatId || req.query.chatId || chatIdFromTelegramUser(req.query.telegramUserId), 40),
      telegramUserId: clampText(req.query.telegramUserId, 40),
      telegramUsername: clampText(req.query.telegramUsername, 80)
    };
    if (!code || (!identity.phone && !identity.shopperSessionId && !identity.telegramChatId && !identity.telegramUserId && !identity.telegramUsername)) {
      return res.status(400).json({ error: 'Tracking code and phone number, device session, or Telegram identity are required.' });
    }
    const order = (data.orders || []).find(item => {
      if (item.clientId !== client.id) return false;
      const publicCode = publicOrderCode(item).replace(/^#/, '').toLowerCase();
      const id = String(item.id || '').toLowerCase();
      const codeMatches = publicCode === code || id === code || id.endsWith(code);
      return codeMatches && orderMatchesIdentity(item, identity);
    });
    if (!order) {
      return res.status(404).json({ error: 'No matching order found. Please check the tracking code and phone number.' });
    }
    const nextStep = (() => {
      const payment = String(order.paymentStatus || '').toLowerCase();
      const delivery = String(order.deliveryStatus || '').toLowerCase();
      if (/paid|verified/.test(payment) && /delivered/.test(delivery)) return 'This order is marked delivered.';
      if (/paid|verified/.test(payment)) return 'Payment is confirmed. The shop is preparing delivery updates.';
      if (/review|pending|waiting/.test(payment)) return 'Payment proof is being checked. Please wait for confirmation.';
      if (order.awaitingDeliveryFee) return 'The shop is confirming delivery details before payment.';
      return 'If you already paid, submit the payment SMS/reference from the checkout page or contact the shop in Telegram.';
    })();
    res.json({
      ok: true,
      order: {
        id: order.id,
        trackingCode: publicOrderCode(order),
        status: order.status || '',
        paymentStatus: order.paymentStatus || '',
        deliveryStatus: order.deliveryStatus || '',
        productName: order.productName || '',
        productCode: order.productCode || '',
        quantity: order.quantity || 1,
        total: order.total || order.totalAmount || '',
        deliveryArea: order.deliveryArea || '',
        deliveryMaxHours: order.deliveryMaxHours || order.deliveryEtaHours || '',
        createdAt: order.createdAt || '',
        nextStep
      }
    });
  });

  router.post('/api/miniapp/shop/:slug/orders/:orderId/payment-proof', async (req, res) => {
    if (!writeData) return res.status(500).json({ error: 'Payment proof is not configured.' });
    const data = await readData();
    const client = findClientForMiniapp(data, req.params.slug, requestHost(req));
    if (!client || !isProductBusiness(client)) return res.status(404).json({ error: 'Shop not found' });
    const order = (data.orders || []).find(item =>
      item.clientId === client.id &&
      (String(item.id) === String(req.params.orderId) || publicOrderCode(item).replace(/^#/, '') === String(req.params.orderId || '').replace(/^#/, ''))
    );
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    const identity = identityFromPayload(req.body || {}, client);
    if (!identity.phone && !identity.shopperSessionId && !identity.telegramChatId && !identity.telegramUserId && !identity.telegramUsername) {
      return res.status(400).json({ error: 'A phone, device session, or Telegram identity is required to submit payment proof.' });
    }
    if (!orderMatchesIdentity(order, identity)) {
      return res.status(403).json({ error: 'This payment proof does not belong to this order.' });
    }
    const proofText = clampText(req.body?.proofText || req.body?.reference || req.body?.sms, 1200);
    if (!proofText) return res.status(400).json({ error: 'Please paste the SMS or reference number.' });

    const createdAt = now();
    const proof = {
      id: uid('proof'),
      clientId: client.id,
      orderId: order.id,
      source: 'miniapp',
      type: 'text',
      status: 'received',
      customerName: order.customerName || '',
      phone: order.phone || '',
      manualSmsText: proofText,
      caption: proofText,
      extracted: {},
      createdAt,
      updatedAt: createdAt
    };
    data.paymentProofs ||= [];
    data.paymentProofs.push(proof);
    order.paymentProofId = proof.id;
    order.awaitingPaymentProof = false;
    order.paymentStatus = 'payment_proof_under_review';
    order.updatedAt = createdAt;

    let verification = { action: 'manual_review', reason: 'The shop will review this payment proof.' };
    if (paymentVerificationService?.verifyPaymentProof) {
      verification = await paymentVerificationService.verifyPaymentProof({ data, client, order, proof }).catch(error => ({
        action: 'manual_review',
        reason: error.message || 'Automatic verification could not complete.'
      }));
      if (verification.action === 'verified') {
        const hasPaymentBalance = moneyNumber(order.paymentBalanceAmount) > 0;
        order.status = 'confirmed';
        order.paymentStatus = hasPaymentBalance ? 'deposit_paid' : 'paid';
        order.paymentVerifiedAt = now();
        order.paymentVerifiedBy = 'automatic';
        order.paymentAutoVerified = true;
        order.paymentVerificationReference = verification.reference || proof.extracted?.transactionId || '';
        order.paymentVerificationRequestId = verification.verifyRequestId || '';
        order.deliveryStatus = order.deliveryStatus === 'delivered' ? order.deliveryStatus : 'not-started';
        order.deliveryStartedAt ||= now();
        order.deliveryFeedbackAvailableAt ||= order.deliveryMaxHours
          ? new Date(new Date(order.deliveryStartedAt).getTime() + (Number(order.deliveryMaxHours) * 60 * 60 * 1000 / 3)).toISOString()
          : '';
        proof.status = 'verified';
        proof.verifiedAt = now();
        proof.verifiedBy = 'automatic';
        if (order.telegramChatId && typeof sendCustomerTelegramMessage === 'function') {
          await sendCustomerTelegramMessage(client, order.telegramChatId, paymentConfirmedCustomerMessage(client, order), {
            reply_markup: deliveryButtonsForOrder(order)
          }).then(() => {
            data.messages ||= [];
            data.messages.push({
              id: uid('msg'),
              clientId: client.id,
              conversationId: order.conversationId || '',
              direction: 'outbound',
              text: paymentConfirmedCustomerMessage(client, order),
              telegramChatId: order.telegramChatId,
              orderId: order.id,
              source: 'miniapp_payment_verified',
              createdAt: now()
            });
          }).catch(error => {
            addAuditLog(data, {
              user: { role: 'miniapp', email: 'miniapp-payment' },
              action: 'miniapp.payment.customer_notify_failed',
              clientId: client.id,
              target: order.id,
              details: `Automatic payment was verified but Telegram notify failed: ${error.message}`
            });
          });
        }
      } else if (verification.action === 'duplicate') {
        proof.status = 'duplicate';
        order.paymentStatus = 'payment_proof_duplicate';
      } else if (verification.action === 'pending') {
        proof.status = 'pending';
        order.paymentStatus = 'payment_verification_pending';
      } else {
        proof.status = 'needs_review';
        if (order.telegramChatId && typeof sendCustomerTelegramMessage === 'function') {
          await sendCustomerTelegramMessage(client, order.telegramChatId, paymentReviewCustomerMessage(client, order, verification.reason), {
            reply_markup: { inline_keyboard: [[{ text: 'Talk to Support', callback_data: 'productflow:support' }]] }
          }).catch(() => {});
        }
      }
    }

    if (typeof sendClientNotification === 'function' || typeof sendPlatformAdminBotMessage === 'function') {
      const verified = verification.action === 'verified';
      const verifiedAmount = verification.amount || paymentDueNowForOrder(order) || order.total || 0;
      const alert = [
        verified ? `Payment automatically verified for ${client.businessName}` : `Payment could not be verified automatically for ${client.businessName}`,
        verified
          ? `${verifiedAmount} Birr was automatically verified for the purchase below. Please double-check the deposit in your bank/wallet before delivery.`
          : 'A shopper submitted payment information, but the system could not verify it safely. Please review only if needed and ask the shopper to resend correct SMS/reference.',
        `Order: ${publicOrderCode(order)} (${order.id})`,
        `Customer: ${order.customerName || order.phone}`,
        order.phone ? `Phone: ${order.phone}` : '',
        order.deliveryLocation ? `Address: ${order.deliveryLocation}` : '',
        `Product: ${[order.productCode, order.productName].filter(Boolean).join(' - ')}`,
        `Quantity: ${order.quantity || 1}`,
        order.selectedSize ? `Size: ${order.selectedSize}` : '',
        order.selectedColor ? `Color: ${order.selectedColor}` : '',
        order.selectedOption ? `Option: ${order.selectedOption}` : '',
        order.cakeWritingText ? `Cake writing: ${order.cakeWritingText}` : '',
        `Total: ${order.total} Birr`,
        order.paymentMode === 'deposit' ? `Kabd paid now: ${order.paymentDueNow} Birr` : '',
        order.paymentBalanceAmount && Number(order.paymentBalanceAmount) > 0 ? `Balance remaining: ${order.paymentBalanceAmount} Birr` : '',
        verification.reference ? `Transaction/ref: ${verification.reference}` : proof.extracted?.transactionId ? `Transaction/ref: ${proof.extracted.transactionId}` : '',
        `Status: ${verification.action}`,
        !verified && verification.reason ? `Note: ${verification.reason}` : ''
      ].filter(Boolean).join('\n');
      const ownerChatId = privateOwnerChatId(client);
      const sentByAdminBot = ownerChatId && typeof sendPlatformAdminBotMessage === 'function'
        ? await sendPlatformAdminBotMessage(data, ownerChatId, alert).then(() => true).catch(() => false)
        : false;
      if (!sentByAdminBot && typeof sendClientNotification === 'function') {
        await sendClientNotification(data, client, `miniapp-payment-${proof.id}`, alert, 'orders', 0).catch(() => {});
      }
    }
    await writeData(data);
    const verifiedPaymentMessage = verification.action === 'verified'
      ? (moneyNumber(order.paymentBalanceAmount) > 0
        ? 'Payment verified successfully. Your Kabd has been received. The shop will prepare your cake and may contact you if more information is needed.'
        : 'Payment verified successfully. Thank you for your purchase. The shop will prepare your product for delivery and may contact you if more information is needed.')
      : (verification.action === 'pending'
        ? 'Payment verification is still processing. Please check again shortly.'
        : 'Payment could not be verified automatically. Please paste the full SMS or exact reference again, or contact the shop for support.');
    res.json({
      ok: true,
      status: verification.action,
      message: verifiedPaymentMessage,
      reason: verification.action === 'verified' ? '' : (verification.reason || ''),
      order: {
        id: order.id,
        trackingCode: publicOrderCode(order),
        paymentStatus: order.paymentStatus,
        paymentDueNow: paymentDueNowForOrder(order),
        paymentBalanceAmount: order.paymentBalanceAmount || '',
        status: order.status
      }
    });
  });

  router.get(/^\/shop\/[^/]+(?:\/.*)?$/, (req, res) => {
    sendMiniappShell(res);
  });

  return router;
}
