const PRODUCT_SPEC_PRESETS = {
  clothing: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'],
  jeans: ['26', '28', '30', '32', '34', '36', '38', '40', '42', '44'],
  jeansColors: ['Omo', 'Classic Blue', 'Dark Blue', 'Light Blue', 'Black', 'Gray', 'White', 'Washed Blue', 'Navy', 'Brown'],
  shoes: ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46'],
  colors: ['Black', 'White', 'Red', 'Blue', 'Green', 'Yellow', 'Pink', 'Purple', 'Brown', 'Gray', 'Navy', 'Beige', 'Cream', 'Orange', 'Gold', 'Silver'],
  electronicsStorage: ['64GB', '128GB', '256GB', '512GB', '1TB', '2TB'],
  electronicsRam: ['4GB RAM', '6GB RAM', '8GB RAM', '12GB RAM', '16GB RAM', '32GB RAM'],
  phoneScreenSizes: ['5.5 inch', '6.1 inch', '6.5 inch', '6.7 inch', '6.8 inch', '7 inch'],
  computerScreenSizes: ['11.6 inch', '13 inch', '14 inch', '15.6 inch', '16 inch', '17.3 inch', '24 inch', '27 inch'],
  electronicsCondition: ['Brand new', 'Used like new', 'Used good', 'Refurbished'],
  electronicsPower: ['110V', '220V', 'Rechargeable', 'Battery powered', 'USB-C', 'Micro USB'],
  kitchenCapacity: ['0.5L', '1L', '1.5L', '2L', '3L', '5L', '7L', '10L'],
  kitchenMaterial: ['Stainless steel', 'Glass', 'Ceramic', 'Non-stick', 'Plastic', 'Wood', 'Aluminum'],
  beautySkin: ['Oily skin', 'Dry skin', 'Combination skin', 'Sensitive skin', 'Normal skin'],
  beautyShade: ['Light', 'Medium', 'Tan', 'Dark', 'Clear', 'Natural'],
  furnitureSize: ['Single', 'Double', 'Queen', 'King', 'Small', 'Medium', 'Large'],
  furnitureMaterial: ['Wood', 'Metal', 'Leather', 'Fabric', 'Foam', 'Glass', 'MDF'],
  groceryWeight: ['250g', '500g', '1kg', '2kg', '5kg', '10kg'],
  packSize: ['Single', '2 pack', '3 pack', '6 pack', '12 pack', 'Carton'],
  cakeSizes: ['0.5 kg', '1 kg', '1.5 kg', '2 kg', '3 kg', '4 kg', '6 inch', '8 inch', '10 inch', '12 inch', 'Two tier', 'Three tier'],
  cakeFlavors: ['Vanilla', 'Chocolate', 'Red velvet', 'Black forest', 'Marble', 'Strawberry', 'Lemon', 'Coffee', 'Carrot', 'Fruit cake'],
  cakeFrosting: ['Buttercream', 'Whipped cream', 'Fondant', 'Chocolate ganache', 'Cream cheese frosting', 'No frosting'],
  cakeShapes: ['Round', 'Square', 'Rectangle', 'Heart', 'Number shape', 'Tiered', 'Custom shape'],
  cakeOccasions: ['Birthday', 'Wedding', 'Engagement', 'Graduation', 'Anniversary', 'Baby shower', 'Corporate event', 'Religious celebration', 'Custom occasion']
};

const textFor = (...values) => values.map(value => String(value || '')).join(' ').toLowerCase();

const group = (key, label, field, values) => ({
  key,
  label,
  field,
  values: [...new Set((values || []).map(value => String(value || '').trim()).filter(Boolean))]
});

export const productSpecGroupsProfile = (category, subcategory, name = '') => {
  const text = textFor(category, subcategory, name);

  if (/\b(cakes?|bakery|baker(y|ies)|cupcakes?|pastries?|desserts?|birthday|wedding|fondant|bento)\b/.test(text)) {
    return [
      group('cake_size', 'Cake Size', 'size', PRODUCT_SPEC_PRESETS.cakeSizes),
      group('flavor', 'Flavor', 'option', PRODUCT_SPEC_PRESETS.cakeFlavors),
      group('frosting', 'Cream / Frosting', 'option', PRODUCT_SPEC_PRESETS.cakeFrosting),
      group('shape', 'Shape', 'option', PRODUCT_SPEC_PRESETS.cakeShapes),
      group('occasion', 'Occasion', 'option', PRODUCT_SPEC_PRESETS.cakeOccasions),
      group('theme_color', 'Theme Color', 'color', ['White', 'Chocolate', 'Pink', 'Blue', 'Gold', 'Red', 'Purple', 'Black', 'Cream', 'Custom color'])
    ];
  }

  if (/\b(phones?|smartphones?|iphone|samsung|tecno|infinix|xiaomi|redmi)\b/.test(text)) {
    return [
      group('color', 'Color', 'color', ['Black', 'White', 'Silver', 'Gold', 'Blue', 'Green', 'Purple', 'Graphite', 'Gray']),
      group('storage', 'Storage', 'size', PRODUCT_SPEC_PRESETS.electronicsStorage),
      group('ram', 'RAM', 'size', PRODUCT_SPEC_PRESETS.electronicsRam),
      group('screen_size', 'Screen Size', 'option', PRODUCT_SPEC_PRESETS.phoneScreenSizes),
      group('condition', 'Condition', 'option', PRODUCT_SPEC_PRESETS.electronicsCondition)
    ];
  }

  if (/\b(laptops?|computers?|desktop|pc|notebook|tablets?)\b/.test(text)) {
    return [
      group('color', 'Color', 'color', ['Black', 'White', 'Silver', 'Gold', 'Blue', 'Gray', 'Graphite']),
      group('storage', 'Storage', 'size', PRODUCT_SPEC_PRESETS.electronicsStorage),
      group('ram', 'RAM', 'size', PRODUCT_SPEC_PRESETS.electronicsRam),
      group('screen_size', 'Screen Size', 'option', PRODUCT_SPEC_PRESETS.computerScreenSizes),
      group('condition', 'Condition', 'option', PRODUCT_SPEC_PRESETS.electronicsCondition)
    ];
  }

  if (/\b(chargers?|cables?|power banks?|routers?|tv|camera|printer|gaming|playstation|xbox|electronics?|device)\b/.test(text)) {
    return [
      group('color', 'Color', 'color', ['Black', 'White', 'Silver', 'Blue', 'Gray']),
      group('power', 'Power / Type', 'option', PRODUCT_SPEC_PRESETS.electronicsPower),
      group('condition', 'Condition', 'option', PRODUCT_SPEC_PRESETS.electronicsCondition)
    ];
  }

  if (/\b(shoes?|sneakers?|boots?|sandals?|heels?|slippers?)\b/.test(text)) {
    return [
      group('color', 'Color', 'color', PRODUCT_SPEC_PRESETS.colors),
      group('size', 'Shoe Size', 'size', PRODUCT_SPEC_PRESETS.shoes),
      group('option', 'Shoe Type', 'option', ['Men', 'Women', 'Kids', 'Flat', 'Low heel', 'High heel', 'Sport', 'Casual', 'Formal'])
    ];
  }

  if (/\b(jeans?|denim|bottoms?|pants?|trousers?)\b/.test(text)) {
    return [
      group('color', 'Jeans Color', 'color', PRODUCT_SPEC_PRESETS.jeansColors),
      group('size', 'Waist Size', 'size', PRODUCT_SPEC_PRESETS.jeans),
      group('option', 'Fit / Style', 'option', ['Skinny', 'Slim', 'Straight', 'Regular', 'Relaxed', 'Wide leg', 'High waist', 'Low waist', 'Stretch', 'Non-stretch'])
    ];
  }

  if (/\b(dress|shirt|t.?shirt|top|crop|skirt|shurab|sweater|hoodie|jacket|coat|blazer|suit|clothing|fashion|boutique|habesha|kemis)\b/.test(text)) {
    return [
      group('color', 'Color', 'color', PRODUCT_SPEC_PRESETS.colors),
      group('size', 'Clothing Size', 'size', PRODUCT_SPEC_PRESETS.clothing),
      group('option', 'Style / Fit', 'option', ['Regular fit', 'Slim fit', 'Oversized', 'Long sleeve', 'Short sleeve', 'Casual', 'Office', 'Party'])
    ];
  }

  if (/\b(makeup|cosmetic|beauty|cream|lotion|perfume|fragrance|skin|hair|wig|extension|lipstick|mascara|sunscreen)\b/.test(text)) {
    return [
      group('shade', 'Shade / Color', 'color', PRODUCT_SPEC_PRESETS.beautyShade.concat(['Red', 'Pink', 'Nude', 'Brown', 'Black', 'Clear'])),
      group('size', 'Pack / Volume', 'size', ['30ml', '50ml', '100ml', '150ml', '200ml', '250ml', '500ml', 'Single', 'Set']),
      group('option', 'Skin / Hair Type', 'option', PRODUCT_SPEC_PRESETS.beautySkin.concat(['All hair types', 'Curly hair', 'Dry hair', 'Oily hair']))
    ];
  }

  if (/\b(furniture|sofa|chair|table|bed|mattress|cabinet|wardrobe|shelf|desk)\b/.test(text)) {
    return [
      group('color', 'Furniture Color', 'color', ['Black', 'White', 'Brown', 'Gray', 'Beige', 'Cream', 'Navy', 'Green']),
      group('size', 'Furniture Size', 'size', PRODUCT_SPEC_PRESETS.furnitureSize),
      group('material', 'Material', 'option', PRODUCT_SPEC_PRESETS.furnitureMaterial)
    ];
  }

  if (/\b(kitchen|appliance|cookware|pot|pan|plate|cup|kettle|blender|mitad|jebena|mesob|home)\b/.test(text)) {
    return [
      group('color', 'Color', 'color', PRODUCT_SPEC_PRESETS.colors),
      group('size', 'Capacity / Size', 'size', PRODUCT_SPEC_PRESETS.kitchenCapacity),
      group('material', 'Material', 'option', PRODUCT_SPEC_PRESETS.kitchenMaterial)
    ];
  }

  if (/\b(grocery|groceries|foods?|drinks?|coffee|spices?|oils?|grains?|flour|rice)\b/.test(text)) {
    return [
      group('variant', 'Variant', 'color', ['Original', 'Red', 'Green', 'Yellow', 'Brown', 'White', 'Black']),
      group('size', 'Weight / Pack Size', 'size', PRODUCT_SPEC_PRESETS.groceryWeight.concat(PRODUCT_SPEC_PRESETS.packSize)),
      group('option', 'Package', 'option', ['Fresh', 'Dry', 'Bottle', 'Bag', 'Box', 'Carton', 'Family size'])
    ];
  }

  return [
    group('color', 'Color Options', 'color', PRODUCT_SPEC_PRESETS.colors),
    group('size', 'Size / Variant', 'size', PRODUCT_SPEC_PRESETS.clothing),
    group('option', 'Extra Options', 'option', ['Brand new', 'Used like new', 'Imported', 'Local', 'Single item', 'Set bundle'])
  ];
};
