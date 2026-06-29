const normalize = value => String(value || '')
  .toLowerCase()
  .replace(/['\u2019]/g, '')
  .replace(/[^a-z0-9.]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const asList = value => {
  if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean);
  return String(value || '').split(/[,|/]+/).map(item => item.trim()).filter(Boolean);
};

const unique = values => [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
const money = value => {
  const amount = Number(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
};

const stem = value => {
  const token = normalize(value);
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && token.endsWith('es')) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('s')) return token.slice(0, -1);
  return token;
};

const editDistance = (left, right) => {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const previous = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        diagonal + (left[i - 1] === right[j - 1] ? 0 : 1)
      );
      diagonal = previous;
    }
  }
  return row[right.length];
};

const tokenMatches = (queryToken, productToken) => {
  const left = stem(queryToken);
  const right = stem(productToken);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length >= 4 && right.startsWith(left)) return true;
  if (right.length >= 4 && left.startsWith(right)) return true;
  const allowance = Math.max(left.length, right.length) >= 8 ? 2 : 1;
  return Math.min(left.length, right.length) >= 4 && editDistance(left, right) <= allowance;
};

const PRODUCT_STOP_WORDS = new Set([
  'a', 'an', 'and', 'any', 'are', 'available', 'can', 'could', 'do', 'does', 'for', 'have',
  'how', 'i', 'in', 'is', 'it', 'me', 'of', 'please', 'price', 'show', 'tell', 'the', 'there',
  'what', 'which', 'with', 'you', 'your', 'stock', 'cost', 'much', 'about', 'also', 'again'
]);

const COLOR_WORDS = [
  'black', 'white', 'cream', 'red', 'blue', 'navy', 'green', 'yellow', 'pink', 'purple',
  'brown', 'gray', 'grey', 'silver', 'gold', 'beige', 'orange', 'maroon', 'clear',
  'transparent', 'multicolor'
];

const SIZE_WORDS = ['xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl', 'small', 'medium', 'large'];

const productSpecGroups = product => {
  const groups = Array.isArray(product?.specGroups) ? product.specGroups : [];
  return groups.map(group => ({
    key: String(group?.key || '').trim(),
    field: String(group?.field || '').trim(),
    label: String(group?.label || group?.key || 'Option').trim(),
    values: unique(asList(group?.values || group?.options || group?.choices))
  })).filter(group => group.values.length);
};

const productColors = product => unique([
  ...asList(product?.colors),
  ...productSpecGroups(product)
    .filter(group => /colou?r/i.test(group.label) || /colou?r/i.test(group.key) || /colou?r/i.test(group.field))
    .flatMap(group => group.values)
]);

const productSizes = product => unique([
  ...asList(product?.sizes),
  ...productSpecGroups(product)
    .filter(group => /(^|\b)(size|waist|dimension|screen)(\b|$)|shoe\s+size/i.test([group.label, group.key, group.field].join(' ')))
    .flatMap(group => group.values)
]);

const productAllSpecs = product => unique([
  ...asList(product?.options),
  ...productColors(product),
  ...productSizes(product),
  ...productSpecGroups(product).flatMap(group => [group.label, ...group.values])
]);

const searchableParts = product => [
  product?.name,
  product?.code,
  product?.productCode,
  product?.category,
  product?.subcategory,
  product?.description,
  product?.productType,
  ...productAllSpecs(product)
].filter(Boolean);

const productSearchScore = (product, questionTokens, normalizedQuestion) => {
  const searchable = normalize(searchableParts(product).join(' '));
  const productTokens = searchable.split(' ').filter(Boolean);
  const name = normalize(product?.name);
  const code = normalize(product?.code || product?.productCode);
  let score = 0;
  if (code && normalizedQuestion.includes(code)) score += 120;
  if (name && normalizedQuestion.includes(name)) score += 55;
  questionTokens.forEach(token => {
    if (productTokens.some(productToken => tokenMatches(token, productToken))) score += 9;
  });
  return score;
};

const mentionedValues = (question, values) => values.filter(value => {
  const cleanValue = normalize(value);
  if (!cleanValue) return false;
  const questionTokens = normalize(question).split(' ').filter(Boolean);
  const valueTokens = cleanValue.split(' ').filter(Boolean);
  return valueTokens.every(valueToken => questionTokens.some(questionToken => tokenMatches(questionToken, valueToken)));
});

const exactNormalizedIncludes = (values, requested) => values.some(value => {
  const cleanValue = normalize(value);
  const cleanRequested = normalize(requested);
  return cleanValue === cleanRequested ||
    cleanValue.split(' ').includes(cleanRequested) ||
    cleanRequested.split(' ').includes(cleanValue);
});

const requestedSpecFilters = question => {
  const normalizedQuestion = normalize(question);
  const tokens = normalizedQuestion.split(' ').filter(Boolean);
  const raw = String(question || '').toLowerCase();
  const capacities = unique((raw.match(/\b\d+(?:\.\d+)?\s*(?:gb|tb|mb)\b/g) || [])
    .map(value => value.replace(/\s+/g, '').toUpperCase()));
  const numbers = unique((normalizedQuestion.match(/\b\d{1,3}(?:\.\d+)?\b/g) || [])
    .filter(value => !capacities.some(capacity => normalize(capacity).startsWith(value))));
  const colors = COLOR_WORDS.filter(color => tokens.includes(color) || (color === 'gray' && tokens.includes('grey')));
  const sizes = unique([
    ...SIZE_WORDS.filter(size => tokens.includes(size)),
    ...numbers,
    ...capacities
  ]);
  return {
    colors,
    sizes,
    capacities,
    hasAny: Boolean(colors.length || sizes.length || capacities.length)
  };
};

const filterByMentionedAttributes = (products, question, catalogProducts, { strict = false } = {}) => {
  const knownColors = unique([...catalogProducts.flatMap(productColors), ...COLOR_WORDS]);
  const knownSizes = unique([...catalogProducts.flatMap(productSizes), ...catalogProducts.flatMap(productAllSpecs)]);
  const explicit = requestedSpecFilters(question);
  const requestedColors = unique([...mentionedValues(question, knownColors), ...explicit.colors]);
  const requestedSizes = unique([...mentionedValues(question, knownSizes), ...explicit.sizes]);
  if (!requestedColors.length && !requestedSizes.length) return products;

  const filtered = products.filter(product => (
    (!requestedColors.length || requestedColors.some(value => exactNormalizedIncludes(productColors(product), value))) &&
    (!requestedSizes.length || requestedSizes.some(value =>
      exactNormalizedIncludes(productSizes(product), value) ||
      exactNormalizedIncludes(productAllSpecs(product), value)
    ))
  ));
  return filtered.length || strict ? filtered : products;
};

const recentContextProducts = (data, client, conversation, catalogProducts) => {
  if (!conversation?.id) return [];
  const productMap = new Map(catalogProducts.map(product => [String(product.id || ''), product]));
  const ids = [];
  (data?.messages || [])
    .filter(message => message.clientId === client.id && message.conversationId === conversation.id)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 12)
    .forEach(message => {
      (Array.isArray(message.productIds) ? message.productIds : []).forEach(id => {
        const cleanId = String(id || '').trim();
        if (cleanId && !ids.includes(cleanId)) ids.push(cleanId);
      });
    });
  return ids.map(id => productMap.get(id)).filter(Boolean);
};

const hasProductSelection = question => {
  const tokens = normalize(question).split(' ').filter(token => token.length > 1 && !PRODUCT_STOP_WORDS.has(token));
  const spec = requestedSpecFilters(question);
  const specTokens = new Set([...spec.colors.map(normalize), ...spec.sizes.map(normalize), 'size', 'color', 'colour', 'ram', 'storage']);
  return tokens.some(token => !specTokens.has(token));
};

const isFollowUpQuestion = question => {
  const normalizedQuestion = normalize(question);
  const spec = requestedSpecFilters(question);
  return spec.hasAny ||
    /\b(what about|how about|and|also|same|that one|this one|do you have|available)\b/i.test(question) ||
    /\b(price|cost|how much|colour|color|size|ram|storage|screen)\b/.test(normalizedQuestion);
};

const selectMatchingProducts = (catalogProducts, question, preferredProducts = [], options = {}) => {
  const normalizedQuestion = normalize(question);
  const questionTokens = normalizedQuestion.split(' ')
    .filter(token => token.length > 1 && !PRODUCT_STOP_WORDS.has(token));
  const preferredIds = new Set(preferredProducts.map(product => String(product?.id || '')));
  const preferredPool = preferredProducts.length && options.preferOnly ? preferredProducts : catalogProducts;
  const spec = requestedSpecFilters(question);
  const ranked = preferredPool
    .map(product => ({
      product,
      score: productSearchScore(product, questionTokens, normalizedQuestion) +
        (preferredIds.has(String(product.id || '')) ? 20 : 0)
    }))
    .filter(item => item.score > 0 || (options.allowSpecOnly && spec.hasAny))
    .sort((left, right) => right.score - left.score);
  if (!ranked.length) return [];

  const rankedProducts = ranked.map(item => item.product);
  const strictAttributes = options.allowSpecOnly && spec.hasAny;
  const attributeFiltered = filterByMentionedAttributes(
    rankedProducts,
    question,
    catalogProducts,
    { strict: strictAttributes }
  );
  const selected = attributeFiltered.length ? attributeFiltered : (strictAttributes ? [] : rankedProducts);
  if (!selected.length) return [];
  const bestScore = ranked.find(item => item.product === selected[0])?.score || ranked[0]?.score || 0;
  return selected
    .filter(product => {
      const score = ranked.find(item => item.product === product)?.score || 0;
      return options.allowSpecOnly || score >= Math.max(9, bestScore - 24);
    })
    .slice(0, 4);
};

const specValuesLabel = (values, emptyLabel = 'not listed') => {
  const clean = unique(values);
  return clean.length ? clean.join(', ') : emptyLabel;
};

const unavailableSpecAnswer = (question, contextProducts) => {
  const spec = requestedSpecFilters(question);
  const productLabel = contextProducts.length === 1
    ? contextProducts[0].name
    : `${contextProducts.length} items I just showed`;
  const parts = [`I checked ${productLabel}, but I could not find that exact option listed.`];
  if (spec.sizes.length) {
    const sizes = unique(contextProducts.flatMap(productSizes));
    if (sizes.length) parts.push(`Available sizes/specs: ${specValuesLabel(sizes)}.`);
  }
  if (spec.colors.length) {
    const colors = unique(contextProducts.flatMap(productColors));
    if (colors.length) parts.push(`Available colors: ${specValuesLabel(colors)}.`);
  }
  parts.push('You can open the item below, or ask me for another size, color, or product.');
  return parts.join('\n');
};

const answerForProducts = (products, question) => {
  const priceQuestion = /\b(price|cost|how much)\b/i.test(question);
  const colorQuestion = /\b(colou?r|shade)\b/i.test(question);
  const sizeQuestion = /\b(size|waist|inch|screen|ram|storage|gb|tb)\b/i.test(question);
  const codeQuestion = /\bcode\b/i.test(question);
  const spec = requestedSpecFilters(question);
  if (products.length === 1) {
    const product = products[0];
    const details = [];
    const price = money(product.sellingPrice || product.price);
    if (spec.sizes.length) details.push(`Requested option: ${spec.sizes.join(', ')} is available.`);
    if (spec.colors.length) details.push(`Requested color: ${spec.colors.join(', ')} is available.`);
    if (price) details.push(`Price: ${price.toLocaleString('en-US')} Birr`);
    if ((colorQuestion || spec.colors.length) && productColors(product).length) details.push(`Colors: ${productColors(product).join(', ')}`);
    if ((sizeQuestion || spec.sizes.length) && productSizes(product).length) details.push(`Sizes/specs: ${productSizes(product).join(', ')}`);
    if (codeQuestion && (product.code || product.productCode)) details.push(`Code: ${product.code || product.productCode}`);
    productSpecGroups(product)
      .filter(group => !/colou?r|size/i.test(group.label))
      .slice(0, 2)
      .forEach(group => details.push(`${group.label}: ${group.values.join(', ')}`));
    return [
      `Yes, ${product.name} is available.`,
      ...(details.length ? details : (priceQuestion ? ['Please open the item below to see its current price and options.'] : []))
    ].join('\n');
  }
  const prices = products.map(product => money(product.sellingPrice || product.price)).filter(Boolean);
  const range = prices.length
    ? (Math.min(...prices) === Math.max(...prices)
      ? `${Math.min(...prices).toLocaleString('en-US')} Birr`
      : `${Math.min(...prices).toLocaleString('en-US')}-${Math.max(...prices).toLocaleString('en-US')} Birr`)
    : '';
  return [
    `Yes, I found ${products.length} matching items.`,
    priceQuestion && range ? `Prices range from ${range}.` : '',
    spec.sizes.length ? `Matching option: ${spec.sizes.join(', ')}.` : '',
    spec.colors.length ? `Matching color: ${spec.colors.join(', ')}.` : '',
    colorQuestion ? `Available colors include ${unique(products.flatMap(productColors)).slice(0, 8).join(', ')}.` : '',
    sizeQuestion ? `Available sizes/specs include ${unique(products.flatMap(productSizes)).slice(0, 10).join(', ')}.` : '',
    'Open any item below to see all details and order.'
  ].filter(Boolean).join('\n');
};

export const createWebsiteSupportService = ({
  answerProductflowSupportQuestion
} = {}) => {
  const answerCommerceQuestion = async ({ data, client, conversation, question, catalogProducts = [] }) => {
    const contextProducts = recentContextProducts(data, client, conversation, catalogProducts);
    const followUp = contextProducts.length && isFollowUpQuestion(question) && !hasProductSelection(question);

    if (followUp) {
      const contextMatches = selectMatchingProducts(contextProducts, question, contextProducts, {
        allowSpecOnly: true,
        preferOnly: true
      });
      if (contextMatches.length) {
        return {
          reply: answerForProducts(contextMatches, question),
          source: 'shop_info',
          products: contextMatches
        };
      }
      return {
        reply: unavailableSpecAnswer(question, contextProducts),
        source: 'shop_info',
        products: contextProducts.slice(0, 4)
      };
    }

    const local = typeof answerProductflowSupportQuestion === 'function'
      ? await answerProductflowSupportQuestion(data, client, conversation, question)
      : null;
    if (local?.reply) {
      return { reply: local.reply, source: 'shop_info', products: [] };
    }
    const preferred = (local?.batchProducts || []).map(item => item?.product).filter(Boolean);
    const products = selectMatchingProducts(catalogProducts, question, preferred);
    if (!products.length) return null;
    return {
      reply: answerForProducts(products, question),
      source: 'shop_info',
      products
    };
  };

  return {
    answerCommerceQuestion,
    selectMatchingProducts,
    answerForProducts
  };
};
