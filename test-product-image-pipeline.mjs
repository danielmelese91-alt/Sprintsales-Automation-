import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createAiService } from './src/services/ai-service.js';
import { createProductService } from './src/services/product-service.js';
import { createSalesService } from './src/services/sales-service.js';
import {
  createWatermarkedProductImage,
  getBestTextColorForRegion,
  watermarkedPathForOriginal
} from './src/services/product-watermark-service.js';

const hashFile = async filePath => crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex');

const makeImage = async (filePath, color, width = 640, height = 480) => {
  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: color
    }
  }).jpeg({ quality: 92 }).toFile(filePath);
};

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sprintsales-image-pipeline-'));

try {
  const darkImage = path.join(tmpDir, 'dark.jpg');
  const brightImage = path.join(tmpDir, 'bright.jpg');
  await makeImage(darkImage, '#111111');
  await makeImage(brightImage, '#f5f5f5');

  const darkColor = await getBestTextColorForRegion(darkImage, { left: 0, top: 0, width: 640, height: 480 });
  const brightColor = await getBestTextColorForRegion(brightImage, { left: 0, top: 0, width: 640, height: 480 });
  assert.equal(darkColor.fill, '#ffffff', 'dark regions should use white text');
  assert.equal(brightColor.fill, '#111827', 'bright regions should use dark text');

  const originalHash = await hashFile(darkImage);
  const watermarkedPath = watermarkedPathForOriginal(darkImage);
  const watermark = await createWatermarkedProductImage({
    inputPath: darkImage,
    outputPath: watermarkedPath,
    centerText: '@AddisMart',
    bottomText: 'AddisMart | Dress 007'
  });
  assert.equal(watermark.centerText, '@AddisMart');
  assert.equal(watermark.bottomText, 'AddisMart | Dress 007');
  assert.notEqual(await hashFile(watermarkedPath), originalHash, 'watermarked image should be a separate changed file');
  assert.equal(await hashFile(darkImage), originalHash, 'original image must remain unchanged');

  const noBrokenBottom = await createWatermarkedProductImage({
    inputPath: brightImage,
    outputPath: watermarkedPathForOriginal(brightImage),
    centerText: '@AddisMart',
    bottomText: ['undefined', '', null].filter(value => value && !/^(undefined|null)$/i.test(String(value))).join(' | ')
  });
  assert.equal(noBrokenBottom.bottomText, '', 'missing phone/code should not produce undefined/null bottom text');

  let visionCalls = 0;
  const aiService = createAiService({
    fs,
    fetchWithTimeout: async () => {
      visionCalls += 1;
      return new Response(JSON.stringify({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                detailedSearchDescription: 'A dark green fitted women dress on a mannequin with long sleeves and a solid smooth fabric appearance.',
                salesPostCaption: 'Elegant dark green dress now available. Order with the product code.',
                productAttributes: {
                  category: 'Fashion',
                  productType: "Women's dress",
                  mainColors: ['dark green'],
                  secondaryColors: [],
                  style: 'elegant casual',
                  genderTarget: 'women',
                  materialGuess: { value: 'smooth synthetic fabric', certainty: 'uncertain' },
                  pattern: 'solid',
                  visibleText: [],
                  confidenceScore: 0.86
                }
              })
            }]
          }
        }]
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
    geminiModel: 'gemini-test',
    effectiveAi: () => ({ provider: 'deepseek', apiKey: '', mode: 'client' }),
    productPrice: product => product.price || '',
    productAvailability: () => 'In stock',
    productPostingSettings: () => ({ language: 'english', includePrice: true }),
    businessProfileText: () => '',
    businessBrainText: () => '',
    activeKnowledgeText: () => '',
    activeProductText: () => '',
    isServiceBusiness: () => false,
    isProductBusiness: () => true,
    serviceTopicIntent: () => false,
    aiUsageStatus: () => ({ limit: 0, used: 0, percent: 0 }),
    sendAdminAlert: async () => {},
    sendClientNotification: async () => {},
    trackManagedAiReply: () => {},
    addBotError: () => {},
    missingKnowledgeReply: 'I do not have that information yet.',
    isMissingKnowledgeReply: () => false,
    salesStageLabel: value => value
  });

  const client = {
    businessName: 'Addis Mart',
    settings: {
      visionApiKey: 'test-key',
      productPosting: { language: 'english' }
    }
  };
  const product = {
    code: 'Dress 007',
    name: 'Dark green dress',
    category: 'Fashion',
    price: '2500',
    imageOriginalPath: darkImage,
    imagePath: watermarkedPath
  };
  const analysis = await aiService.analyzeProductImage(client, product);
  assert.equal(visionCalls, 0, 'v1 product upload should not call vision AI for image matching/description');
  assert.equal(analysis.detailedSearchDescription, '');
  assert.equal(analysis.salesPostCaption, '');
  assert.deepEqual(analysis.productAttributes, {});

  const caption = await aiService.generateProductCaption({}, client, {
    ...product,
    salesPostCaption: 'Elegant dark green dress now available. Order with the product code.'
  });
  assert.match(caption, /dark green dress/i, 'public post generation should still use saved/generated sales caption text');
  assert.equal(visionCalls, 0, 'caption reuse must not trigger a vision call');

  const productService = createProductService({
    clientFor: () => ({ settings: {}, businessType: 'retail' }),
    isProductBusiness: () => true,
    defaultSettings: () => ({ productPosting: {} })
  });
  const searchTerms = productService.productSearchTerms({
    code: 'Dress 007',
    name: 'Dark green dress',
    description: 'Dark green dress',
    colors: 'Dark green'
  });
  assert.match(searchTerms, /dark green/);
  assert.doesNotMatch(searchTerms, /fitted mannequin/, 'internal search should not depend on AI image descriptions');

  const salesService = createSalesService({
    now: () => new Date().toISOString(),
    defaultSettings: () => ({}),
    numberFromMoney: value => Number(value || 0),
    productPrice: item => item.price || '',
    productStock: () => 1,
    productLowStockThreshold: () => 0,
    isServiceBusiness: () => false,
    isProductBusiness: () => true,
    businessMode: () => 'retail',
    productAvailability: () => 'In stock',
    productCategoryLabel: () => 'dress',
    activeClientProducts: () => [],
    findExactProductCode: () => null,
    findProductMention: () => null,
    findProductCategoryMatches: () => [],
    resolveProviderKey: () => null,
    extractOrderDetails: async () => ({})
  });
  const matchScore = salesService.productVisualMatchScore({
    code: 'Dress 007',
    description: 'Dark green dress'
  }, 'customer sent a photo of a dark green solid women dress');
  assert.ok(matchScore >= 0, 'legacy visual scorer remains inert for v1 and does not use AI image metadata');

  console.log('product image pipeline tests passed');
} finally {
  await fs.rm(tmpDir, { recursive: true, force: true });
}
