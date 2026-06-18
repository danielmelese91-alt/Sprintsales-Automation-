import {
  includesAny,
  isVisibleProduct as isVisible,
  modelCompatible,
  normalizeProductText as normalizeText,
  optionValues,
  priceForProduct,
  productFamily as familyFor,
  productText,
  retailFamily as retailFamilyFor
} from './product-taxonomy-service.js';

const priceCapByRetail = {
  electronics: 0.15,
  fashion: 0.50,
  beauty: 0.50,
  home_kitchen: 0.35,
  furniture: 0.15
};

const anchorRules = {
  phone: {
    headline: main => `People also buy for their ${shortName(main)}`,
    accessories: [
      { terms: ['case', 'cover'], score: 100, modelStrict: true },
      { terms: ['screen protector', 'tempered glass'], score: 95, modelStrict: true },
      { terms: ['charger', 'cable', 'power bank'], score: 70 },
      { terms: ['earbud', 'earphone', 'headphone'], score: 55 }
    ]
  },
  laptop: {
    headline: main => `Useful add-ons for ${shortName(main)}`,
    accessories: [
      { terms: ['laptop bag', 'bag', 'sleeve'], score: 90 },
      { terms: ['mouse', 'keyboard', 'stand', 'cooling pad'], score: 80 },
      { terms: ['charger', 'adapter'], score: 65 }
    ]
  },
  tablet: {
    headline: main => `Complete your ${shortName(main)}`,
    accessories: [
      { terms: ['case', 'cover'], score: 95, modelStrict: true },
      { terms: ['screen protector', 'tempered glass'], score: 90, modelStrict: true },
      { terms: ['stylus', 'pen'], score: 75 }
    ]
  },
  console: {
    headline: main => `Gaming extras for ${shortName(main)}`,
    accessories: [
      { terms: ['controller', 'gamepad'], score: 95 },
      { terms: ['headset', 'headphone'], score: 80 },
      { terms: ['charging dock', 'stand'], score: 70 }
    ]
  },
  fashion: {
    headline: main => `Complete the look with ${shortName(main)}`,
    accessories: [
      { terms: ['belt'], score: 88 },
      { terms: ['bag', 'handbag', 'clutch', 'wallet'], score: 78 },
      { terms: ['scarf', 'jewelry', 'necklace', 'earring', 'bracelet', 'watch', 'sunglasses'], score: 72 }
    ]
  },
  beauty: {
    headline: main => `Helpful beauty add-on for ${shortName(main)}`,
    accessories: [
      { terms: ['brush', 'sponge', 'blender', 'palette'], score: 82 },
      { terms: ['liner', 'lip liner', 'sharpener'], score: 74 },
      { terms: ['cleanser', 'toner', 'cotton', 'wipes'], score: 62 }
    ]
  },
  home_kitchen: {
    headline: main => `Often bought with ${shortName(main)}`,
    accessories: [
      { terms: ['cup', 'cups', 'container', 'storage', 'spoon', 'tray'], score: 74 },
      { terms: ['filter', 'cleaner', 'brush', 'glove'], score: 68 },
      { terms: ['baking mold', 'rack', 'stand'], score: 60 }
    ]
  },
  furniture: {
    headline: main => `Small match for ${shortName(main)}`,
    accessories: [
      { terms: ['pillow', 'cover', 'cushion'], score: 78 },
      { terms: ['rug', 'carpet', 'mat'], score: 62 }
    ]
  }
};

const shortName = product => String(product?.name || product?.code || 'this item')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 40);

const candidateOptions = product => ({
  sizes: optionValues(product?.sizes).slice(0, 8),
  colors: optionValues(product?.colors).slice(0, 8),
  options: optionValues(product?.options).slice(0, 8)
});

export const createMatchingService = (deps = {}) => {
  const { productPrice } = deps;

  const isProClient = client => {
    const plan = String(client?.billing?.plan || client?.subscriptionPlan || client?.settings?.subscriptionPlan || 'basic').toLowerCase();
    return plan === 'pro';
  };

  const findCheckoutMatch = ({ client, order, mainProduct } = {}) => {
    if (!isProClient(client)) return null;
    if (!mainProduct || !order) return null;

    const anchor = familyFor(mainProduct);
    const rules = anchorRules[anchor];
    if (!rules) return null;

    const mainPrice = Number(order.discountedSubtotal || order.subtotal || priceForProduct(mainProduct, productPrice));
    const unitMainPrice = Number(order.unitPrice || priceForProduct(mainProduct, productPrice));
    const capFamily = retailFamilyFor(mainProduct);
    const capPercent = priceCapByRetail[capFamily] || 0;
    const maxPrice = Math.max(0, unitMainPrice * capPercent);
    if (!maxPrice) return null;

    const mainId = String(mainProduct.id || '');
    const candidates = (client?.products || [])
      .filter(product => isVisible(product) && String(product.id || '') !== mainId)
      .map(product => {
        const text = productText(product);
        const price = priceForProduct(product, productPrice);
        if (!price || price > maxPrice || price >= mainPrice) return null;
        let best = null;
        for (const rule of rules.accessories) {
          if (!includesAny(text, rule.terms)) continue;
          if (rule.modelStrict && !modelCompatible(mainProduct, product, { strict: true })) continue;
          const sharedColor = optionValues(mainProduct.colors).some(color => text.includes(normalizeText(color)));
          const score = rule.score + (sharedColor ? 8 : 0) + Math.max(0, 15 - Math.round((price / maxPrice) * 10));
          if (!best || score > best.score) best = { rule, score };
        }
        if (!best) return null;
        return {
          product,
          price,
          score: best.score,
          reason: best.rule.terms[0]
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || a.price - b.price);

    const best = candidates[0];
    if (!best) return null;
    return {
      trigger: true,
      product: best.product,
      price: best.price,
      score: best.score,
      reason: best.reason,
      capPercent,
      uiHeadline: rules.headline(mainProduct),
      options: candidateOptions(best.product)
    };
  };

  return {
    isProClient,
    findCheckoutMatch,
    familyFor,
    retailFamilyFor
  };
};
