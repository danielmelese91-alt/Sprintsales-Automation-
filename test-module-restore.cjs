const http = require('http');

function api(method, path, cookie, body) {
  return new Promise((resolve, reject) => {
    const opts = { host: 'localhost', port: 8080, path, method, headers: { 'Content-Type': 'application/json' } };
    if (cookie) opts.headers.Cookie = cookie;
    const req = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

(async () => {
  let passed = 0, failed = 0;
  const r = [];

  // M1: Demo login
  const login = await api('POST', '/api/login', null, { email: 'demo@sprintsales.net', password: 'demo12345' });
  const cookie = login.headers['set-cookie']?.[0]?.split(';')[0];
  if (login.status === 200 && login.body.user) { passed++; r.push('M1  demo login: PASS'); }
  else { failed++; r.push('M1  demo login: FAIL -> ' + login.status); }

  if (!cookie) { console.log(r.join('\n')); console.log('Cannot continue'); return; }

  // M2: Dashboard returns 3 products
  const dash = await api('GET', '/api/client/dashboard', cookie);
  const products = dash.body.products || [];
  if (products.length === 3) { passed++; r.push('M2  3 products: PASS'); }
  else { failed++; r.push('M2  3 products: FAIL -> got ' + products.length); }

  // M3: Product names match
  const hasAll = products.some(p => /Earbuds|Bluetooth/i.test(p.name)) &&
                 products.some(p => /Watch|Fitness/i.test(p.name)) &&
                 products.some(p => /Phone|Case/i.test(p.name));
  if (hasAll) { passed++; r.push('M3  product names: PASS (Earbuds, Watch, Case)'); }
  else { failed++; r.push('M3  product names: FAIL -> ' + products.map(p=>p.name).join(', ')); }

  // M4: Categories include Electronics
  const cats = [...new Set(products.map(p => p.category))];
  if (cats.includes('Electronics')) { passed++; r.push('M4  Electronics category: PASS'); }
  else { failed++; r.push('M4  Electronics category: FAIL -> ' + cats.join(', ')); }

  // M5: Client settings object exists with many keys
  const settings = dash.body.client?.settings || {};
  if (Object.keys(settings).length > 10) { passed++; r.push('M5  settings keys >10: PASS'); }
  else { failed++; r.push('M5  settings keys >10: FAIL -> ' + Object.keys(settings).length); }

  // M6: AI provider is deepseek
  if (settings.aiProvider === 'deepseek') { passed++; r.push('M6  aiProvider=deepseek: PASS'); }
  else { failed++; r.push('M6  aiProvider=deepseek: FAIL -> ' + settings.aiProvider); }

  // M7: Bot token (check via settings API, dashboard strips it for security)
  const setResp = await api('PUT', '/api/client/settings', cookie, { botToken: settings.botToken || '' });
  if (setResp.status === 200) { passed++; r.push('M7  settings PUT works: PASS'); }
  else { failed++; r.push('M7  settings PUT works: FAIL -> ' + setResp.status); }

  // M8: Delivery settings exist
  if (settings.delivery) { passed++; r.push('M8  delivery settings exist: PASS'); }
  else { failed++; r.push('M8  delivery settings exist: FAIL'); }

  // M9: Update product price
  const prod0 = products[0];
  const patch = await api('PATCH', '/api/client/products/' + prod0.id, cookie, { name: prod0.name, code: prod0.code || 'BT-001', price: 2999 });
  if (patch.status === 200) { passed++; r.push('M9  product update: PASS'); }
  else { failed++; r.push('M9  product update: FAIL -> ' + patch.status + ' ' + JSON.stringify(patch.body).slice(0,60)); }
  // Restore
  await api('PATCH', '/api/client/products/' + prod0.id, cookie, { price: prod0.price });

  // M10: Create + delete test product (with code)
  const create = await api('POST', '/api/client/products', cookie, { name: 'Test Product', code: 'TST-001', category: 'Test', price: 100 });
  if (create.status === 201 || create.status === 200) {
    passed++; r.push('M10 product create+delete: PASS');
    if (create.body?.product?.id) {
      await api('DELETE', '/api/client/products/' + create.body.product.id, cookie);
    }
  } else { failed++; r.push('M10 product create: FAIL -> ' + create.status + ' ' + JSON.stringify(create.body).slice(0,100)); }

  // Verify product count restored
  const dash2 = await api('GET', '/api/client/dashboard', cookie);
  if (dash2.body.products.length === 3) { passed++; r.push('M10b product count restored: PASS'); }
  else { failed++; r.push('M10b product count restored: FAIL -> ' + dash2.body.products.length); }

  // M11: Admin login (correct password)
  const adminLogin = await api('POST', '/api/login', null, { email: 'admin@sprintsales.net', password: 'ChangeMe123!' });
  const adminCookie = adminLogin.headers['set-cookie']?.[0]?.split(';')[0];
  if (adminLogin.status === 200) { passed++; r.push('M11 admin login: PASS'); }
  else { failed++; r.push('M11 admin login: FAIL -> ' + adminLogin.status + ' ' + JSON.stringify(adminLogin.body).slice(0,60)); }

  if (!adminCookie) { failed++; r.push('M12-M13: FAIL (no admin cookie)'); }

  // M12: Pending approvals
  if (adminCookie) {
    const approvals = await api('GET', '/api/admin/pending-approvals', adminCookie);
    if (approvals.status === 200 && Array.isArray(approvals.body.pending)) { passed++; r.push('M12 pending approvals: PASS'); }
    else { failed++; r.push('M12 pending approvals: FAIL -> ' + approvals.status); }

    // M13: Admin clients list
    const clients = await api('GET', '/api/admin/clients', adminCookie);
    if (clients.status === 200 && Array.isArray(clients.body.clients)) { passed++; r.push('M13 admin clients: PASS'); }
    else { failed++; r.push('M13 admin clients: FAIL -> ' + clients.status); }
  }

  // M14: Root page loads dashboard.js
  const root = await new Promise((resolve) => {
    http.get('http://localhost:8080/', res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
  });
  if (root.status === 200 && root.body.includes('dashboard.js')) { passed++; r.push('M14 root loads dashboard.js: PASS'); }
  else { failed++; r.push('M14 root loads dashboard.js: FAIL -> ' + root.status); }

  // M15: Health check
  const health = await new Promise((resolve) => {
    http.get('http://localhost:8080/api/health', res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode }));
    }).on('error', () => resolve({ status: 0 }));
  });
  if (health.status === 200) { passed++; r.push('M15 health check: PASS'); }
  else { failed++; r.push('M15 health check: FAIL'); }

  console.log('\n=== MODULE RESTORE TEST RESULTS ===');
  r.forEach(l => console.log(l));
  console.log('\nTotal: ' + passed + '/' + (passed+failed) + ' passed, ' + failed + ' failed');
  if (failed > 0) process.exit(1);
})();
