import assert from 'node:assert/strict';
import {
  RETAIL_WEBSITE_THEMES,
  getRetailWebsiteTheme,
  resolveRetailWebsiteTheme,
  retailWebsiteThemeKey
} from './src/config/retail-themes.js';

const registrationTypes = [
  'electronics',
  'fashion',
  'beauty',
  'shoes',
  'bags',
  'home',
  'furniture',
  'cakes',
  'retail'
];

const relativeLuminance = color => {
  const channels = color.slice(1).match(/../g).map(channel => {
    const value = Number.parseInt(channel, 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
};

const pairs = registrationTypes.map(type => {
  const selected = getRetailWebsiteTheme(type);
  assert.match(selected.themeColor, /^#[0-9a-f]{6}$/);
  assert.match(selected.accentColor, /^#[0-9a-f]{6}$/);
  const whiteTextContrast = 1.05 / (relativeLuminance(selected.accentColor) + 0.05);
  assert.ok(whiteTextContrast >= 4.5, `${type} accent should keep white button text readable`);
  return `${selected.themeColor}:${selected.accentColor}`;
});

assert.equal(new Set(pairs).size, registrationTypes.length, 'every registration business type should have a distinct default palette');
assert.equal(retailWebsiteThemeKey('Home / Kitchen'), 'home');
assert.equal(retailWebsiteThemeKey('Fashion Boutique'), 'fashion');
assert.equal(retailWebsiteThemeKey('Bags & Accessories'), 'bags');
assert.equal(retailWebsiteThemeKey('Cakes and Bakery'), 'cakes');

const migratedElectronics = resolveRetailWebsiteTheme('electronics', {
  themeColor: '#0f2a52',
  accentColor: '#14b8a6'
});
assert.equal(migratedElectronics.themeColor, RETAIL_WEBSITE_THEMES.electronics.themeColor);
assert.equal(migratedElectronics.accentColor, RETAIL_WEBSITE_THEMES.electronics.accentColor);
assert.equal(migratedElectronics.themeCustomized, false);

const customFashion = resolveRetailWebsiteTheme('fashion', {
  themeColor: '#112233',
  accentColor: '#aabbcc',
  themeCustomized: true
});
assert.equal(customFashion.themeColor, '#112233');
assert.equal(customFashion.accentColor, '#aabbcc');
assert.equal(customFashion.themeCustomized, true);

const resetFashion = resolveRetailWebsiteTheme('fashion', {
  themeColor: '#112233',
  accentColor: '#aabbcc',
  themeCustomized: false
});
assert.equal(resetFashion.themeColor, RETAIL_WEBSITE_THEMES.fashion.themeColor);
assert.equal(resetFashion.accentColor, RETAIL_WEBSITE_THEMES.fashion.accentColor);

const invalidCustom = resolveRetailWebsiteTheme('beauty', {
  themeColor: 'not-a-color',
  accentColor: '',
  themeCustomized: true
});
assert.equal(invalidCustom.themeColor, RETAIL_WEBSITE_THEMES.beauty.themeColor);
assert.equal(invalidCustom.accentColor, RETAIL_WEBSITE_THEMES.beauty.accentColor);

console.log('retail website theme tests passed');
