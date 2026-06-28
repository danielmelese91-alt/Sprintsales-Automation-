import path from 'node:path';
import sharp from 'sharp';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const escapeXml = value => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const relativeLuminance = ({ r, g, b }) => {
  const channel = value => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

export const getBestTextColorForRegion = async (inputPath, region, options = {}) => {
  const metadata = await sharp(inputPath).metadata();
  const width = Math.max(1, metadata.width || 1);
  const height = Math.max(1, metadata.height || 1);
  const left = clamp(Math.round(region.left || 0), 0, width - 1);
  const top = clamp(Math.round(region.top || 0), 0, height - 1);
  const sampleWidth = clamp(Math.round(region.width || width), 1, width - left);
  const sampleHeight = clamp(Math.round(region.height || height), 1, height - top);
  const sampleSize = options.sampleSize || 64;
  const { data, info } = await sharp(inputPath)
    .extract({ left, top, width: sampleWidth, height: sampleHeight })
    .resize({
      width: Math.min(sampleSize, sampleWidth),
      height: Math.min(sampleSize, sampleHeight),
      fit: 'inside'
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let total = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    total += relativeLuminance({ r: data[i], g: data[i + 1], b: data[i + 2] });
    count += 1;
  }
  const average = count ? total / count : 1;
  return average < (options.threshold ?? 0.48)
    ? { fill: '#ffffff', shadow: 'rgba(0,0,0,0.55)', luminance: average }
    : { fill: '#111827', shadow: 'rgba(255,255,255,0.65)', luminance: average };
};

const outputFormatFromPath = outputPath => {
  const ext = path.extname(outputPath || '').toLowerCase();
  if (ext === '.png') return 'png';
  if (ext === '.webp') return 'webp';
  return 'jpeg';
};

const VECTOR_GLYPHS = {
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '-': ['00000', '00000', '00000', '11110', '00000', '00000', '00000'],
  '_': ['00000', '00000', '00000', '00000', '00000', '00000', '11110'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '#': ['01010', '01010', '11111', '01010', '11111', '01010', '01010'],
  '|': ['00100', '00100', '00100', '00100', '00100', '00100', '00100'],
  '@': ['01110', '10001', '10111', '10101', '10111', '10000', '01110'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '11100'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10011', '10001', '10001', '01110'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111']
};

const normalizeVectorText = text => String(text || '').toUpperCase().replace(/[^A-Z0-9 @._|#/\-]/g, '');
const vectorTextWidth = (text, fontSize) => {
  const normalized = normalizeVectorText(text);
  const cell = fontSize / 7;
  return Math.max(fontSize * 2, normalized.length * cell * 6);
};

const vectorTextSvg = ({ text, x, y, fontSize, fill, shadow, anchor = 'middle', baseline = 'middle', scale = 1, opacity = 1, rotation = 0 }) => {
  const normalized = normalizeVectorText(text);
  if (!normalized) return '';
  const cell = fontSize / 7;
  const width = vectorTextWidth(normalized, fontSize);
  const height = fontSize;
  const startX = anchor === 'end' ? -width : anchor === 'middle' ? -width / 2 : 0;
  const startY = baseline === 'bottom' ? -height : baseline === 'middle' ? -height / 2 : 0;
  const rects = (color, offset) => normalized.split('').map((char, charIndex) => {
    const glyph = VECTOR_GLYPHS[char] || VECTOR_GLYPHS[' '];
    return glyph.map((row, rowIndex) => row.split('').map((pixel, colIndex) => {
      if (pixel !== '1') return '';
      const rx = startX + charIndex * cell * 6 + colIndex * cell + offset;
      const ry = startY + rowIndex * cell + offset;
      return `<rect x="${rx.toFixed(2)}" y="${ry.toFixed(2)}" width="${Math.max(1, cell * 0.9).toFixed(2)}" height="${Math.max(1, cell * 0.9).toFixed(2)}" rx="${Math.max(0.5, cell * 0.15).toFixed(2)}" fill="${color}" />`;
    }).join('')).join('');
  }).join('');
  return `
  <g opacity="${opacity}" transform="translate(${x} ${y}) rotate(${rotation}) scale(${scale})">
    ${rects(shadow, Math.max(1, cell * 0.35))}
    ${rects(fill, 0)}
  </g>`;
};

export const watermarkLayoutForImage = (rawWidth, rawHeight, options = {}) => {
  const width = Math.max(1, Number(rawWidth) || 1);
  const height = Math.max(1, Number(rawHeight) || 1);
  const paddingRatio = Number(options.paddingRatio || 0.035);
  const bottomFontBase = options.bottomFontScale || clamp(Math.min(width, height * 0.8) * 0.021, 7, 90);
  // Product cards use a 4:5 cover frame. Size and position marks inside that
  // visible frame so landscape and tall portrait uploads look consistent.
  const visibleWidth = Math.min(width, height * 0.8);
  const visibleHeight = visibleWidth * 1.25;
  const visibleLeft = (width - visibleWidth) / 2;
  const visibleTop = (height - visibleHeight) / 2;
  return {
    visibleWidth,
    visibleHeight,
    visibleLeft,
    visibleTop,
    padding: Math.round(visibleWidth * paddingRatio),
    centerFont: Math.round(options.centerFontScale || clamp(visibleWidth * 0.027, 8, 120)),
    bottomFont: Math.max(5, Math.round(bottomFontBase * 0.75))
  };
};

const watermarkSvg = ({ width, height, centerText, bottomText, bottomLogoSpace = 0, centerColor, bottomColor, options, layout }) => {
  const {
    visibleWidth,
    visibleHeight,
    visibleLeft,
    visibleTop,
    padding,
    centerFont,
    bottomFont
  } = layout || watermarkLayoutForImage(width, height, options);
  const centerMax = visibleWidth * 0.86;
  const centerScale = centerText ? Math.min(1, centerMax / vectorTextWidth(centerText, centerFont)) : 1;
  const bottomMax = Math.max(bottomFont * 2, visibleWidth * 0.82 - bottomLogoSpace);
  const bottomScale = bottomText ? Math.min(1, bottomMax / vectorTextWidth(bottomText, bottomFont)) : 1;
  const bottomX = visibleLeft + padding + bottomLogoSpace;
  const bottomY = visibleTop + visibleHeight - padding;
  return Buffer.from(`
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  ${centerText ? `
  ${vectorTextSvg({
    text: escapeXml(centerText),
    x: width / 2,
    y: height / 2,
    fontSize: centerFont,
    fill: centerColor.fill,
    shadow: centerColor.shadow,
    scale: centerScale,
    opacity: options.centerOpacity,
    rotation: 0
  })}` : ''}
  ${bottomText ? `
  <g opacity="${options.bottomOpacity}">
    ${vectorTextSvg({
      text: escapeXml(bottomText),
      x: bottomX,
      y: bottomY,
      fontSize: bottomFont,
      fill: bottomColor.fill,
      shadow: bottomColor.shadow,
      anchor: 'start',
      baseline: 'bottom',
      scale: bottomScale,
      opacity: 1,
      rotation: 0
    })}
  </g>` : ''}
</svg>`);
};

export const createWatermarkedProductImage = async ({
  inputPath,
  outputPath,
  centerText,
  bottomText,
  bottomLogoPath,
  options = {}
}) => {
  if (!inputPath || !outputPath) throw new Error('inputPath and outputPath are required for watermarking.');
  const opts = {
    centerOpacity: 0.58,
    bottomOpacity: 1,
    paddingRatio: 0.035,
    centerFontScale: null,
    bottomFontScale: null,
    allowAutoColor: true,
    ...options
  };
  const metadata = await sharp(inputPath).metadata();
  const width = metadata.width || 1200;
  const height = metadata.height || 1200;
  const layout = watermarkLayoutForImage(width, height, opts);
  const centerRegion = {
    left: layout.visibleLeft + layout.visibleWidth * 0.18,
    top: layout.visibleTop + layout.visibleHeight * 0.35,
    width: layout.visibleWidth * 0.64,
    height: layout.visibleHeight * 0.30
  };
  const bottomRegion = {
    left: layout.visibleLeft + layout.visibleWidth * 0.02,
    top: layout.visibleTop + layout.visibleHeight * 0.78,
    width: layout.visibleWidth * 0.48,
    height: layout.visibleHeight * 0.20
  };
  const centerColor = opts.allowAutoColor
    ? await getBestTextColorForRegion(inputPath, centerRegion)
    : { fill: '#ffffff', shadow: 'rgba(0,0,0,0.55)', luminance: null };
  const bottomColor = opts.allowAutoColor
    ? await getBestTextColorForRegion(inputPath, bottomRegion)
    : centerColor;
  let logoBuffer = null;
  let logoSize = 0;
  if (bottomLogoPath) {
    try {
      logoSize = Math.round(clamp(layout.visibleWidth * 0.075, 34, 180));
      logoBuffer = await sharp(bottomLogoPath)
        .resize({
          width: logoSize,
          height: logoSize,
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .png()
        .toBuffer();
    } catch (_error) {
      logoBuffer = null;
      logoSize = 0;
    }
  }
  const bottomLogoSpace = logoBuffer ? logoSize + Math.round(logoSize * 0.22) : 0;
  const overlay = watermarkSvg({
    width,
    height,
    centerText: String(centerText || '').trim(),
    bottomText: String(bottomText || '').trim(),
    bottomLogoSpace,
    centerColor,
    bottomColor,
    options: opts,
    layout
  });
  const composites = [{ input: overlay, gravity: 'northwest' }];
  if (logoBuffer) {
    composites.push({
      input: logoBuffer,
      left: Math.round(layout.visibleLeft + layout.padding),
      top: Math.round(Math.max(
        layout.visibleTop + layout.padding,
        layout.visibleTop + layout.visibleHeight - layout.padding - logoSize
      ))
    });
  }
  let pipeline = sharp(inputPath)
    .rotate()
    .composite(composites);
  const format = outputFormatFromPath(outputPath);
  if (format === 'png') pipeline = pipeline.png({ compressionLevel: 9, quality: 92 });
  else if (format === 'webp') pipeline = pipeline.webp({ quality: 86, effort: 4 });
  else pipeline = pipeline.jpeg({ quality: 88, mozjpeg: true });
  await pipeline.toFile(outputPath);
  return {
    outputPath,
    centerText: String(centerText || '').trim(),
    bottomText: String(bottomText || '').trim(),
    bottomLogoPath: String(bottomLogoPath || '').trim(),
    centerTextColor: centerColor.fill,
    bottomTextColor: bottomColor.fill,
    centerLuminance: centerColor.luminance,
    bottomLuminance: bottomColor.luminance
  };
};

export const watermarkedPathForOriginal = inputPath => {
  const parsed = path.parse(inputPath);
  return path.join(parsed.dir, `${parsed.name}.watermarked${parsed.ext || '.jpg'}`);
};
