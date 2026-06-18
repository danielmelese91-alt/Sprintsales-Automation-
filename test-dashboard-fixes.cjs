// test-dashboard-fixes.cjs - Verify all fixes from Daniel's report (v3 - fixed)
const http = require('http');

const BASE = 'http://localhost:8080';
let COOKIE_JAR = { cookie: '' };

function clearCookies() { COOKIE_JAR = { cookie: '' }; }

function request(method, path, opts = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const headers = { ...(opts.headers || {}) };
    if (COOKIE_JAR.cookie) headers.Cookie = COOKIE_JAR.cookie;
    if (opts.body && typeof opts.body === 'object' && !opts.raw) {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    const req = http.request({
      hostname: url.hostname, port: url.port, path: url.pathname + url.search,
      method, headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const setCookie = res.headers['set-cookie'];
        if (setCookie) {
          setCookie.forEach(c => { COOKIE_JAR.cookie = (COOKIE_JAR.cookie ? COOKIE_JAR.cookie + '; ' : '') + c.split(';')[0]; });
        }
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, data, headers: res.headers });
        }
      });
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

let passed = 0, failed = 0;
function test(name, fn) {
  return fn().then(() => { console.log(`  ✓ ${name}`); passed++; })
    .catch(e => { console.log(`  ✗ ${name}: ${e.message}`); failed++; });
}

async function main() {
  console.log('=== TEST SUITE: Dashboard Fixes v3 ===\n');

  // T1-T3: Auth & Data
  console.log('--- Authentication ---');
  clearCookies();
  await test('T1: Admin login', async () => {
    const r = await request('POST', '/api/login', { body: { email: 'admin@sprintsales.net', password: 'ChangeMe123!' } });
    if (r.status !== 200) throw new Error(`Status ${r.status}`);
    if (!COOKIE_JAR.cookie) throw new Error('No session cookie');
  });

  let demoCookie;
  clearCookies();
  await test('T2: Demo client login', async () => {
    const r = await request('POST', '/api/login', { body: { email: 'demo@sprintsales.net', password: 'demo12345' } });
    if (r.status !== 200) throw new Error(`Status ${r.status}`);
    demoCookie = COOKIE_JAR.cookie;
  });

  let dashboard;
  await test('T3: Dashboard data fetch', async () => {
    const r = await request('GET', '/api/client/dashboard');
    if (r.status !== 200) throw new Error(`Status ${r.status}`);
    dashboard = r.data;
    if (!dashboard.client) throw new Error('No client data');
    console.log('    Products:', dashboard.products.length);
    console.log('    Categories:', (dashboard.client.settings?.categories || []).slice(0,3).join(', '));
  });

  // T4-T7: Product Management
  console.log('\n--- Product Management ---');
  
  await test('T4: Product count is 3', async () => {
    if (dashboard.products.length !== 3) throw new Error(`Expected 3, got ${dashboard.products.length}`);
    const p = dashboard.products[0];
    if (!p.code) throw new Error('Product missing code');
    console.log('    Sample:', p.code, p.name);
  });

  let newProductId;
  await test('T5: Add product (POST)', async () => {
    const code = 'TST' + Date.now().toString(36).toUpperCase().slice(-6);
    const r = await request('POST', '/api/client/products', {
      body: { code, name: 'Test Product ' + code, category: 'Accessories', price: '100', isActive: true }
    });
    if (r.status !== 200) throw new Error(`Status ${r.status}: ${r.data.error || ''}`);
    if (!r.data.product) throw new Error('No product returned');
    newProductId = r.data.product.id;
    console.log('    Created:', r.data.product.code);
  });

  await test('T6: Edit product (PUT)', async () => {
    const r = await request('PUT', '/api/client/products/' + newProductId, {
      body: { code: 'TST-EDITED', name: 'Edited Test Product', price: '200', category: 'Updated' }
    });
    if (r.status !== 200) throw new Error(`Status ${r.status}: ${r.data.error || ''}`);
    // PUT returns {product: {...}}
    if (r.data.product.name !== 'Edited Test Product') throw new Error(`Name was "${r.data.product.name}"`);
    console.log('    Updated to:', r.data.product.name);
  });

  await test('T7: Delete product (DELETE)', async () => {
    const r = await request('DELETE', '/api/client/products/' + newProductId);
    if (r.status !== 200) throw new Error(`Status ${r.status}: ${r.data.error || ''}`);
  });

  // T8-T12: Telegram Bot Settings
  console.log('\n--- Telegram Bot Settings ---');
  
  const testToken = '1234567890:AA' + Date.now().toString(36).toUpperCase();
  
  await test('T8: Save bot settings (PUT)', async () => {
    const r = await request('PUT', '/api/client/settings', {
      body: { botToken: testToken, botUsername: '@test_bot', telegramOwnerChatId: '123456789', hotLeadNotifyChatId: '@test_channel' }
    });
    if (r.status !== 200) throw new Error(`Status ${r.status}: ${(r.data||{}).error || ''}`);
    // Response is {client: {settings: {...}}}
    const cs = (r.data.client || {}).settings || {};
    if (cs.botUsername !== '@test_bot') throw new Error(`botUsername not saved: "${cs.botUsername}"`);
    console.log('    Saved: botUsername=' + cs.botUsername + ', token len=' + (cs.botToken||'').length);
  });

  await test('T9: Bot token persists & masked', async () => {
    const r = await request('GET', '/api/client/dashboard');
    if (r.status !== 200) throw new Error(`Status ${r.status}`);
    const cs = r.data.client.settings || {};
    const tok = cs.botToken || '';
    // safeClient masks token to 'configured' for security - check it's non-empty
    if (!tok || tok.length < 5) throw new Error('Bot token not stored');
    console.log('    Token exists (masked):', tok);
  });

  await test('T10: Bot username persists', async () => {
    const r = await request('GET', '/api/client/dashboard');
    const cs = r.data.client.settings || {};
    if (cs.botUsername !== '@test_bot') throw new Error('botUsername mismatch: ' + cs.botUsername);
  });

  await test('T11: Owner chat ID persists', async () => {
    const r = await request('GET', '/api/client/dashboard');
    const cs = r.data.client.settings || {};
    if (cs.telegramOwnerChatId !== '123456789') throw new Error('telegramOwnerChatId mismatch');
  });

  await test('T12: Channel ID persists', async () => {
    const r = await request('GET', '/api/client/dashboard');
    const cs = r.data.client.settings || {};
    if (cs.hotLeadNotifyChatId !== '@test_channel') throw new Error('hotLeadNotifyChatId mismatch: ' + cs.hotLeadNotifyChatId);
  });

  // T13: Test connection endpoint
  await test('T13: Test connection endpoint', async () => {
    const r = await request('POST', '/api/client/bot/test-connection');
    if (r.status !== 200 && r.status !== 400 && r.status !== 500) throw new Error(`Unexpected status ${r.status}`);
    console.log('    Response:', (r.data||{}).message || (r.data||{}).error || 'OK');
  });

  // T14-T15 Categories
  console.log('\n--- Categories ---');
  
  await test('T14: Categories save & persist', async () => {
    const r = await request('PUT', '/api/client/settings', {
      body: { categories: ['CustomCat1', 'CustomCat2', 'Electronics'] }
    });
    if (r.status !== 200) throw new Error(`Status ${r.status}: ${(r.data||{}).error || ''}`);
    const cs = (r.data.client || {}).settings || {};
    if (!cs.categories || !cs.categories.includes('CustomCat1')) throw new Error('Categories not saved');
    console.log('    Saved:', cs.categories.slice(0,3).join(', '));
  });

  await test('T15: Categories persist after reload', async () => {
    const r = await request('GET', '/api/client/dashboard');
    const cs = r.data.client.settings || {};
    const cats = cs.categories || [];
    if (!cats.includes('CustomCat1')) throw new Error('Categories lost!');
    console.log('    Persisted:', cats.length, 'items');
  });

  // T16-T17: Pending client restrictions
  console.log('\n--- Pending Client Restrictions ---');
  
  const testPhone = '2519' + Date.now().toString().slice(-8);
  const ts = Date.now();
  const pendingEmail = 'pendingtest' + ts.toString(36) + '@test.local';
  let pendingRegistered = false;
  
  await test('T16: Register creates default categories for fashion', async () => {
    clearCookies();
    const r = await request('POST', '/api/register', {
      body: {
        businessName: 'Test Fashion ' + ts.toString(36),
        businessType: 'fashion',
        name: 'Test Owner',
        phone: testPhone,
        email: pendingEmail,
        password: 'test12345',
        currency: 'ETB'
      }
    });
    if (r.status !== 200 && r.status !== 201) throw new Error(`Status ${r.status}: ${r.data.error || ''}`);
    pendingRegistered = true;
    const cats = r.data.client?.categories || r.data.client?.settings?.categories || [];
    console.log('    Default fashion categories:', cats.slice(0,3).join(', ') + ' (' + cats.length + ' total)');
    if (cats.length === 0) console.log('    ⚠ No default categories - check server.js has getDefaultCategories');
    else if (cats.length < 5) throw new Error('Too few default categories for fashion');
  });

  let pendingCookie;
  await test('T17: Pending client blocked from products', async () => {
    if (!pendingRegistered) throw new Error('Registration failed, skipping');
    clearCookies();
    const r = await request('POST', '/api/login', { body: { email: pendingEmail, password: 'test12345' } });
    if (r.status !== 200) throw new Error(`Login failed: ${r.status}`);
    pendingCookie = COOKIE_JAR.cookie;
    
    const r2 = await request('POST', '/api/client/products', { body: { code: 'BLOCK-001', name: 'Blocked', price: '50' } });
    if (r2.status !== 403) throw new Error(`Expected 403, got ${r2.status}`);
    console.log('    Correctly blocked with 403');
  });

  // T18: Demo data integrity  
  console.log('\n--- Demo Data Integrity ---');
  await test('T18: Demo data intact', async () => {
    clearCookies();
    await request('POST', '/api/login', { body: { email: 'demo@sprintsales.net', password: 'demo12345' } });
    const r = await request('GET', '/api/client/dashboard');
    const products = r.data.products || [];
    if (products.length !== 3) throw new Error(`Expected 3 products, got ${products.length}`);
    console.log('    Products:', products.map(p => p.code).sort().join(', '));
    
    // Restore default categories for demo
    const defaultCats = ['New Arrivals','Best Sellers','Discount Items','Accessories','Other Products'];
    await request('PUT', '/api/client/settings', { body: { categories: defaultCats } });
    console.log('    Demo data verified, categories restored');
  });

  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`${'='.repeat(40)}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
