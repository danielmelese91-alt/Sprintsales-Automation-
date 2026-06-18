export const normalizeProductText = value => String(value || '')
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

export const includesAny = (text, terms) => terms.some(term => text.includes(term));

export const productText = product => normalizeProductText([
  product?.name,
  product?.code,
  product?.productCode,
  product?.category,
  product?.subcategory,
  product?.selectedCategory,
  product?.selectedSubcategory,
  product?.description,
  product?.detailedSearchDescription,
  product?.imageDescription,
  product?.material,
  product?.variantNote,
  product?.tags,
  Array.isArray(product?.colors) ? product.colors.join(' ') : product?.colors,
  Array.isArray(product?.sizes) ? product.sizes.join(' ') : product?.sizes,
  Array.isArray(product?.options) ? product.options.join(' ') : product?.options
].filter(Boolean).join(' '));

export const priceNumber = value => {
  const raw = typeof value === 'object' && value
    ? (value.sellingPrice || value.price || value.unitPrice || value.total || '')
    : value;
  const n = Number(String(raw || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export const priceForProduct = (product, productPrice) => priceNumber(productPrice ? productPrice(product) : product);

export const productFamily = product => {
  const text = productText(product);
  if (includesAny(text, ['phone', 'smartphone', 'iphone', 'samsung', 'galaxy', 'tecno', 'infinix', 'redmi', 'xiaomi'])) return 'phone';
  if (includesAny(text, ['laptop', 'notebook', 'computer'])) return 'laptop';
  if (includesAny(text, ['tablet', 'ipad'])) return 'tablet';
  if (includesAny(text, ['playstation', 'xbox', 'console', 'gaming console'])) return 'console';
  if (includesAny(text, ['shoe', 'sneaker', 'heel', 'sandal', 'boot'])) return 'shoes';
  if (includesAny(text, ['dress', 'skirt', 'habesha', 'kemis', 'suit', 'blazer', 'jeans', 'trouser', 'pants', 'shirt', 'top', 'hoodie', 'jacket'])) return 'fashion';
  if (includesAny(text, ['perfume', 'makeup', 'foundation', 'skincare', 'lipstick', 'wig', 'hair extension', 'hair dryer'])) return 'beauty';
  if (includesAny(text, ['blender', 'kettle', 'air fryer', 'microwave', 'oven', 'mitad', 'jebena', 'refrigerator', 'washing machine', 'cookware', 'appliance'])) return 'home_kitchen';
  if (includesAny(text, ['sofa', 'bed', 'mattress', 'wardrobe', 'dining', 'desk', 'chair', 'table', 'cabinet', 'furniture'])) return 'furniture';
  return 'general';
};

export const retailFamily = product => {
  const text = productText(product);
  if (includesAny(text, ['electronics', 'phone', 'laptop', 'tablet', 'console', 'charger', 'case', 'screen protector'])) return 'electronics';
  if (includesAny(text, ['fashion', 'clothing', 'dress', 'jeans', 'shoe', 'bag', 'jewelry', 'belt', 'scarf'])) return 'fashion';
  if (includesAny(text, ['beauty', 'cosmetic', 'makeup', 'skincare', 'perfume', 'wig', 'hair'])) return 'beauty';
  if (includesAny(text, ['furniture', 'sofa', 'bed', 'mattress', 'wardrobe', 'dining', 'desk', 'chair', 'table', 'cabinet'])) return 'furniture';
  if (includesAny(text, ['home', 'kitchen', 'appliance', 'cookware', 'mitad', 'jebena'])) return 'home_kitchen';
  return 'other';
};

export const optionValues = value => (Array.isArray(value) ? value : String(value || '').split(/[,|/;\n]+/))
  .map(item => String(item || '').trim())
  .filter(Boolean);

export const isVisibleProduct = product => {
  if (!product || product.isActive === false) return false;
  const status = normalizeProductText(product.status || product.availability || product.stockStatus || '');
  if (/(out of stock|out_of_stock|sold out|hidden|inactive|archived)/.test(status)) return false;
  return Boolean(product.name || product.code || product.productCode);
};

const modelTokens = product => normalizeProductText([
  product?.name,
  product?.code,
  product?.productCode,
  product?.description,
  product?.variantNote
].filter(Boolean).join(' '))
  .split(/\s+/)
  .filter(token => token.length >= 3 && !new Set([
    'phone', 'smartphone', 'mobile', 'case', 'cover', 'screen', 'protector',
    'tempered', 'glass', 'laptop', 'tablet', 'new', 'used', 'storage'
  ]).has(token));

export const modelCompatible = (main, candidate, { strict = false } = {}) => {
  const family = productFamily(main);
  const tokens = modelTokens(main).filter(token => !/^\d+$/.test(token));
  if (!tokens.length) return !strict;
  const candidateText = productText(candidate);
  const brandTokens = tokens.filter(token => /iphone|samsung|galaxy|tecno|infinix|redmi|xiaomi|ipad|playstation|xbox/i.test(token));
  const modelish = tokens.filter(token => /[a-z]+\d+|\d+[a-z]+|\d{2,}/i.test(token));
  if (['phone', 'tablet'].includes(family)) {
    const hasBrand = !brandTokens.length || brandTokens.some(token => candidateText.includes(token));
    const hasModel = modelish.length ? modelish.some(token => candidateText.includes(token)) : tokens.slice(0, 2).every(token => candidateText.includes(token));
    return hasBrand && hasModel;
  }
  const important = [...brandTokens, ...modelish];
  return (important.length ? important : tokens.slice(0, 2)).some(token => candidateText.includes(token));
};
