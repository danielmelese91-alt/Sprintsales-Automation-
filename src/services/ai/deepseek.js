/**
 * DeepSeek AI Service
 *
 * Provides text-based order extraction using DeepSeek API.
 * Used as a fallback when rule-based extraction leaves fields uncertain or missing.
 */

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const EXTRACTION_TIMEOUT_MS = 15000;

/**
 * Extract order details from customer text using DeepSeek.
 *
 * @param {object} params
 * @param {string} params.apiKey - DeepSeek API key
 * @param {string} params.text - Customer's message
 * @param {object} params.product - Product being ordered (with color_options, size_options, etc.)
 * @returns {Promise<object|null>} Structured extraction or null
 */
async function extractOrderDetails({ apiKey, text, product }) {
  if (!apiKey) return null;
  if (!text || !String(text).trim()) return null;

  const systemPrompt = buildExtractionSystemPrompt(product);
  const userPrompt = `Extract order details from this customer message:\n\n"${String(text).trim()}"`;

  const response = await fetchApi(apiKey, systemPrompt, userPrompt);

  if (!response) return null;

  return validateExtraction(response, product);
}

/**
 * Build the system prompt for order extraction.
 */
function buildExtractionSystemPrompt(product) {
  const parts = [`You are an order detail extractor for a sales platform. Extract structured data from a customer's order message.`];

  parts.push(``);
  parts.push(`Rules:`);
  parts.push(`- Return ONLY valid JSON, no markdown, no code fences, no extra text.`);
  parts.push(`- Extract: name, phone, color, size/option, address, city, quantity.`);
  parts.push(`- If a field cannot be confidently extracted, set it to null.`);
  parts.push(`- Correct typos, spelling mistakes, and location variations.`);
  parts.push(`- For locations in Ethiopia: "mexico" or "mexico addis" = "Mexico, Addis Ababa".`);
  parts.push(`- phone: extract Ethiopian phone numbers (09..., +251...). Remove spaces.`);
  parts.push(`- color: normalize to proper color name (slver → Silver, blak → Black).`);
  parts.push(`- size/option: normalize to standard size name (mediun → Medium, lrg → Large).`);
  parts.push(`- Set confidence 0.0-1.0 indicating how certain you are about the overall extraction.`);
  parts.push(`- Do NOT invent field values that are not present or strongly implied in the text.`);

  if (product) {
    parts.push(``);
    if (product.color_options && product.color_options.length) {
      const colors = Array.isArray(product.color_options)
        ? product.color_options.join(', ')
        : String(product.color_options);
      parts.push(`Available color options: ${colors}`);
      parts.push(`- Only use colors from the above list. Map common names/typos to the closest match.`);
      parts.push(`- If no color option matches closely, set color to null.`);
    }
    if (product.size_options && product.size_options.length) {
      const sizes = Array.isArray(product.size_options)
        ? product.size_options.join(', ')
        : String(product.size_options);
      parts.push(`Available size/option options: ${sizes}`);
      parts.push(`- Only use sizes from the above list. Map common names/typos to the closest match.`);
      parts.push(`- If no size option matches closely, set option to null.`);
    }
  }

  parts.push(``);
  parts.push(`Respond with JSON like:`);
  parts.push(`{`);
  parts.push(`  "name": "string or null",`);
  parts.push(`  "phone": "string or null",`);
  parts.push(`  "color": "string or null",`);
  parts.push(`  "option": "string or null",`);
  parts.push(`  "address": "string or null",`);
  parts.push(`  "city": "string or null",`);
  parts.push(`  "quantity": number or null,`);
  parts.push(`  "confidence": 0.0 to 1.0`);
  parts.push(`}`);

  return parts.join('\n');
}

/**
 * Call DeepSeek API.
 */
async function fetchApi(apiKey, systemPrompt, userPrompt) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EXTRACTION_TIMEOUT_MS);

    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 500,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`DeepSeek API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      console.warn('DeepSeek returned empty response');
      return null;
    }

    // Parse JSON from response (handle code fences if present)
    return parseJsonResponse(content);
  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn('DeepSeek API request timed out');
    } else {
      console.warn(`DeepSeek API error: ${error.message}`);
    }
    return null;
  }
}

/**
 * Parse JSON from LLM response, handling markdown code fences.
 */
function parseJsonResponse(content) {
  try {
    // Try direct parse first
    return JSON.parse(content.trim());
  } catch {
    // Try extracting from code fences
    const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      try {
        return JSON.parse(fenceMatch[1].trim());
      } catch {
        return null;
      }
    }
    // Try finding JSON object in the text
    const braceMatch = content.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try {
        return JSON.parse(braceMatch[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Validate and normalize extraction against product constraints.
 */
function validateExtraction(extracted, product) {
  if (!extracted || typeof extracted !== 'object') return null;

  const result = {
    name: String(extracted.name || '').trim() || null,
    phone: normalizePhone(String(extracted.phone || '').trim()) || null,
    color: null,
    option: null,
    address: String(extracted.address || '').trim() || null,
    city: String(extracted.city || '').trim() || null,
    quantity: Number(extracted.quantity) > 0 ? Number(extracted.quantity) : 1,
    confidence: Math.max(0, Math.min(1, Number(extracted.confidence) || 0)),
  };

  // Validate color against product color_options
  if (extracted.color && product?.color_options) {
    const colors = Array.isArray(product.color_options)
      ? product.color_options
      : String(product.color_options).split(/[,/|]+/).map(s => s.trim()).filter(Boolean);
    const match = findClosestMatch(String(extracted.color), colors);
    if (match) {
      result.color = match;
      // Lower confidence if fuzzy matched
      if (match.toLowerCase() !== String(extracted.color).toLowerCase().trim()) {
        result.confidence = Math.min(result.confidence, 0.7);
      }
    }
  } else if (extracted.color) {
    result.color = String(extracted.color).trim();
  }

  // Validate option/size against product size_options
  if (extracted.option && product?.size_options) {
    const options = Array.isArray(product.size_options)
      ? product.size_options
      : String(product.size_options).split(/[,/|]+/).map(s => s.trim()).filter(Boolean);
    const match = findClosestMatch(String(extracted.option), options);
    if (match) {
      result.option = match;
      if (match.toLowerCase() !== String(extracted.option).toLowerCase().trim()) {
        result.confidence = Math.min(result.confidence, 0.7);
      }
    }
  } else if (extracted.option) {
    result.option = String(extracted.option).trim();
  }

  return result;
}

/**
 * Normalize Ethiopian phone numbers.
 */
function normalizePhone(phone) {
  if (!phone) return null;
  // Remove spaces, dashes, parentheses
  let cleaned = phone.replace(/[\s\-().]/g, '');
  // +251912345678 → 0912345678
  if (cleaned.startsWith('+251')) cleaned = '0' + cleaned.slice(4);
  // 251912345678 → 0912345678
  if (cleaned.startsWith('251') && cleaned.length === 12) cleaned = '0' + cleaned.slice(3);
  // Validate: Ethiopian numbers are 09XXXXXXXX (10 digits) or +2519XXXXXXXX
  if (/^09\d{8}$/.test(cleaned)) return cleaned;
  if (/^9\d{8}$/.test(cleaned)) return '0' + cleaned;
  return null;
}

/**
 * Find closest match from options list, handling typos and abbreviations.
 */
function findClosestMatch(value, options) {
  if (!options || !options.length) return null;
  if (!value) return null;

  const input = String(value).toLowerCase().trim();

  // Exact match
  const exact = options.find(o => String(o).toLowerCase().trim() === input);
  if (exact) return exact;

  // Contains match
  const contains = options.find(o => input.includes(String(o).toLowerCase().trim()) || String(o).toLowerCase().trim().includes(input));
  if (contains) return contains;

  // Typos with common substitutions
  const typoMap = {
    'slver': 'silver',
    'silvr': 'silver',
    'silv': 'silver',
    'blak': 'black',
    'blck': 'black',
    'blcak': 'black',
    'blk': 'black',
    'whit': 'white',
    'whte': 'white',
    'whie': 'white',
    'gld': 'gold',
    'gol': 'gold',
    'blu': 'blue',
    'bluw': 'blue',
    'gren': 'green',
    'grn': 'green',
    'rd': 'red',
    'browm': 'brown',
    'brn': 'brown',
    'prpl': 'purple',
    'purl': 'purple',
    'orng': 'orange',
    'ornge': 'orange',
    'yellw': 'yellow',
    'yelo': 'yellow',
    'pinkh': 'pink',
    'mediun': 'medium',
    'meduim': 'medium',
    'medim': 'medium',
    'med': 'medium',
    'mid': 'medium',
    'midle': 'medium',
    'middle': 'medium',
    'lrg': 'large',
    'lge': 'large',
    'larg': 'large',
    'smal': 'small',
    'sml': 'small',
    'xtra': 'extra large',
    'xlarge': 'extra large',
  };

  const corrected = typoMap[input] || input;

  // Retry exact match with corrected input
  const exactCorrected = options.find(o => String(o).toLowerCase().trim() === corrected);
  if (exactCorrected) return exactCorrected;

  // Levenshtein distance for close matches
  let best = null;
  let bestDist = 3; // max edit distance

  for (const option of options) {
    const optLower = String(option).toLowerCase().trim();
    const dist = levenshteinDistance(corrected, optLower);
    if (dist < bestDist) {
      bestDist = dist;
      best = option;
    }
  }

  return bestDist <= 2 ? best : null;
}

/**
 * Levenshtein distance for fuzzy matching.
 */
function levenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[m][n];
}

export {
  extractOrderDetails,
  buildExtractionSystemPrompt,
  validateExtraction,
  findClosestMatch,
  normalizePhone,
  DEEPSEEK_API_URL,
  DEEPSEEK_MODEL,
};
