export function createProductService(deps) {
  const {
    clientFor,
    isProductBusiness,
    defaultSettings
  } = deps;

  const productStock = product => Math.max(0, Number(product.stockQuantity || 0));

  const productLowStockThreshold = product => Math.max(0, Number(product.lowStockThreshold || 0));

  const productAvailability = product => {
    if (Number.isFinite(Number(product.stockQuantity))) {
      const stock = productStock(product);
      if (stock <= 0) return 'Out of stock';
      if (productLowStockThreshold(product) && stock <= productLowStockThreshold(product)) return `Low stock (${stock} left)`;
      return `In stock (${stock} left)`;
    }
    return product.availability || '';
  };

  const productPrice = product => product.sellingPrice || product.price || '';

  const broadProductAvailabilityIntent = text => {
    const value = String(text || '');
    return /\b(do you have|do u have|any|show me|can i see|looking for|looking to buy|i am looking for|i'm looking for|interested in|i want|i need|need|available|what do you have)\b/i.test(value) &&
      /\b(product|products|item|items|dress|dresses|bag|bags|shoe|shoes|shirt|shirts|shemiz|skirt|skirts|jacket|jackets|cosmetic|cosmetics|watch|watches|phone|phones|laptop|laptops)\b/i.test(value);
  };

  const productSearchTerms = product => [
    product.code,
    product.name,
    product.category,
    product.subcategory,
    product.selectedCategory,
    product.selectedSubcategory,
    product.description,
    product.material,
    product.colors,
    product.variantNote,
    product.notes
  ].filter(Boolean).join(' ').toLowerCase();

  const genericProductWords = new Set([
    'product', 'products', 'item', 'items', 'thing', 'things', 'stock', 'catalog',
    'available', 'availability', 'show', 'send', 'have', 'want', 'need', 'looking',
    'for', 'any', 'some', 'another', 'other', 'new', 'please', 'this', 'that',
    'hi', 'hello', 'hey', 'hay', 'selam', 'salam', 'do', 'does', 'did', 'you',
    'how', 'are', 'was', 'were', 'is', 'the', 'a', 'an',
    'your', 'can', 'could', 'would', 'may', 'see', 'pictures', 'picture', 'photos',
    'photo', 'image', 'images', 'yes', 'yeah', 'yep', 'ok', 'okay', 'saw', 'video',
    'tiktok', 'facebook', 'instagram', 'telegram', 'buy', 'interested'
  ]);

  const productWordVariants = word => {
    const value = String(word || '').toLowerCase().trim();
    if (!value) return [];
    const variants = [value];
    if (value.endsWith('ies') && value.length > 4) variants.push(`${value.slice(0, -3)}y`);
    else if (/(sses|ches|shes|xes|zes)$/.test(value) && value.length > 4) variants.push(value.slice(0, -2));
    else if (value.endsWith('oes') && value.length > 4) variants.push(value.slice(0, -1));
    else if (value.endsWith('s') && value.length > 3) variants.push(value.slice(0, -1));
    return [...new Set(variants)].filter(item => item.length >= 3 && !genericProductWords.has(item));
  };

  const productCategoryQuery = text => {
    const words = String(text || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
      .split(/\s+/)
      .map(word => word.trim())
      .flatMap(productWordVariants);
    return [...new Set(words)].slice(0, 6);
  };

  const activeClientProducts = (data, clientId) => {
    const client = clientFor(data, clientId);
    if (client && !isProductBusiness(client)) return [];
    return (data.products || []).filter(product => product.clientId === clientId && product.isActive !== false);
  };

  const getPopulatedCategories = (data, clientId) => {
    const byCategory = new Map();
    for (const product of activeClientProducts(data, clientId)) {
      const category = String(product.category || product.selectedCategory || 'Other').trim();
      if (!category) continue;
      if (!byCategory.has(category)) byCategory.set(category, { productCount: 0, subcategories: new Map() });
      const categoryRecord = byCategory.get(category);
      categoryRecord.productCount += 1;
      const subcategory = String(product.subcategory || product.selectedSubcategory || '').trim();
      if (subcategory) {
        const subMap = categoryRecord.subcategories;
        subMap.set(subcategory, (subMap.get(subcategory) || 0) + 1);
      }
    }
    return [...byCategory.entries()]
      .map(([name, record]) => ({
        name,
        productCount: record.productCount,
        subcategories: [...record.subcategories.entries()]
          .map(([subName, productCount]) => ({ name: subName, productCount }))
          .sort((a, b) => a.name.localeCompare(b.name))
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  const selectedChoiceLabel = value => {
    const lower = String(value || '').trim().toLowerCase();
    if (lower === 's') return 'S';
    if (lower === 'm') return 'M';
    if (lower === 'l') return 'L';
    if (lower === 'xl') return 'XL';
    if (lower === 'xxl') return 'XXL';
    return String(value || '').trim();
  };

  const findProductCategoryMatches = (data, clientId, text) => {
    const query = productCategoryQuery(text);
    if (!query.length) return [];
    return activeClientProducts(data, clientId)
      .map(product => ({
        product,
        score: query.reduce((sum, word) => sum + (productSearchTerms(product).includes(word) ? 1 : 0), 0)
      }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(item => item.product);
  };

  const productCategoryLabel = text => {
    const query = productCategoryQuery(text);
    if (!query.length) return 'product';
    const label = query.slice(0, 2).join(' ');
    if (/shemiz$/i.test(label)) return `${label}es`;
    if (/dress$/i.test(label)) return `${label}es`;
    if (/(shoe|bag|shirt|skirt|jacket)$/i.test(label)) return `${label}s`;
    return label;
  };

  const findProductMention = (data, clientId, text) => {
    const value = String(text || '').toLowerCase();
    const products = activeClientProducts(data, clientId);
    const byCode = products.find(product => {
      const code = String(product.code || '').toLowerCase();
      return code && new RegExp(`(^|[^\\p{L}\\p{N}])${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}\\p{N}]|$)`, 'iu').test(value);
    });
    if (byCode) return byCode;
    const categoryMatches = findProductCategoryMatches(data, clientId, text);
    if (broadProductAvailabilityIntent(text) && categoryMatches.length > 1) return null;
    const nameMatches = products.filter(product => {
      const name = String(product.name || '').toLowerCase().trim();
      return name && value.includes(name);
    });
    if (nameMatches.length > 1) return null;
    if (categoryMatches.length > 1 && nameMatches.length <= 1) return null;
    return nameMatches[0] || null;
  };

  const findExactProductCode = (data, clientId, text) => {
    const value = String(text || '').toLowerCase();
    return activeClientProducts(data, clientId)
      .find(product => {
        const code = String(product.code || '').toLowerCase();
        return code && new RegExp(`(^|[^\\p{L}\\p{N}])${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}\\p{N}]|$)`, 'iu').test(value);
      }) || null;
  };

  const productFromTelegramReply = (data, clientId, replyMessage, conversation = {}) => {
    if (!replyMessage) return null;
    const replyMessageId = String(replyMessage.message_id || replyMessage.id || '');
    const mapped = replyMessageId
      ? (conversation.lastProductMessageMap || []).find(item => String(item.messageId) === replyMessageId)
      : null;
    if (mapped?.productId) {
      return activeClientProducts(data, clientId).find(product => product.id === mapped.productId) || null;
    }
    const text = [
      replyMessage.caption,
      replyMessage.text,
      replyMessage.photo ? replyMessage.caption : ''
    ].filter(Boolean).join('\n');
    return findExactProductCode(data, clientId, text);
  };

  const productPostingSettings = settings => ({
    ...defaultSettings().productPosting,
    ...(settings?.productPosting || {}),
    destination: String(
      settings?.productPosting?.destination ||
      settings?.telegramChannelLink ||
      settings?.productPostDestination ||
      settings?.channelUsername ||
      ''
    ).trim()
  });

  return {
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
  };
}
