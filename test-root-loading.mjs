// Regression: Unauthenticated Root Page Load Test
// Verifies root page loads without infinite spinner

const BASE = 'http://localhost:8080';
let passed=0,failed=0;

async function doTest(name,fn){try{await fn();passed++;}catch(e){failed++;console.log('  FAIL:',name,'—',e.message)}}
async function fetchText(url){const r=await fetch(url,{redirect:'manual'});return await r.text()}

console.log('\n── K) Unauthenticated Root Page Regression ──');

await doTest('K1: root / returns 200', async ()=>{
  const r=await fetch(BASE+'/');
  if(r.status!==200)throw new Error('status '+r.status);
});

await doTest('K2: root HTML is valid (contains DOCTYPE)', async ()=>{
  const h=await fetchText(BASE+'/');
  if(!h.startsWith('<!DOCTYPE html>'))throw new Error('no DOCTYPE');
});

await doTest('K3: loading spinner div exists', async ()=>{
  const h=await fetchText(BASE+'/');
  if(!h.includes('id="loading"'))throw new Error('no loading div');
});

await doTest('K4: public page div exists', async ()=>{
  const h=await fetchText(BASE+'/');
  if(!h.includes('id="public-page"'))throw new Error('no public-page div');
});

await doTest('K5: dashboard div exists', async ()=>{
  const h=await fetchText(BASE+'/');
  if(!h.includes('id="dashboard"'))throw new Error('no dashboard div');
});

await doTest('K6: init() is defined and auto-called in dashboard.js', async ()=>{
  const h=await fetchText(BASE+'/');
  if(!h.includes('dashboard.js'))throw new Error('dashboard.js not referenced in root page');
  const dash=await fetchText(BASE+'/dashboard.js');
  const matches=(dash.match(/init\(\)/g)||[]).length;
  if(matches<2)throw new Error('init() only appears '+matches+' times in dashboard.js (expected >=2)');
});

await doTest('K7: no infinite recursion pattern (switchTab does NOT call loadDashboard)', async ()=>{
  const h=await fetchText(BASE+'/');
  // switchClientTab should NOT contain loadClientDashboard
  // switchAdminTab should NOT contain loadAdminDashboard
  if(/function switchClientTab\(tab\)\{currentTab=tab;renderClientTab\(tab\);loadClientDashboard/.test(h)){
    throw new Error('client tab switch calls loadClientDashboard (infinite recursion!)');
  }
  if(/function switchAdminTab\(tab\)\{currentTab=tab;renderAdminTab\(tab\);loadAdminDashboard/.test(h)){
    throw new Error('admin tab switch calls loadAdminDashboard (infinite recursion!)');
  }
});

await doTest('K8: CDN scripts are at bottom (not render-blocking in head)', async ()=>{
  const h=await fetchText(BASE+'/');
  const dashPos=h.indexOf('dashboard.js');
  const tailwindPos=h.indexOf('cdn.tailwindcss.com');
  if(dashPos<0)throw new Error('dashboard.js not found');
  if(tailwindPos<0)throw new Error('Tailwind CDN not found');
  if(tailwindPos<dashPos)throw new Error('Tailwind CDN before dashboard.js — render-blocking');
});

await doTest('K9: login form exists', async ()=>{
  const h=await fetchText(BASE+'/');
  if(!h.includes('doPublicLogin'))throw new Error('no login form');
  if(!h.includes('login-identifier'))throw new Error('no login email field');
});

await doTest('K10: register form exists', async ()=>{
  const h=await fetchText(BASE+'/');
  if(!h.includes('doPublicRegister'))throw new Error('no register form');
  if(!h.includes('reg-business'))throw new Error('no business name field');
});

await doTest('K11: error page exists with retry button', async ()=>{
  const h=await fetchText(BASE+'/');
  if(!h.includes('id="error-page"'))throw new Error('no error page');
  if(!h.includes('Try Again'))throw new Error('no retry button');
});

await doTest('K12: /api/me without cookie returns 401 (not 500)', async ()=>{
  const r=await fetch(BASE+'/api/me',{redirect:'manual'});
  if(r.status!==401)throw new Error('expected 401, got '+r.status);
});

await doTest('K13: page sets a 15-second loading timeout in dashboard.js', async ()=>{
  const dash=await fetchText(BASE+'/dashboard.js');
  if(!dash.includes('setTimeout'))throw new Error('no timeout mechanism in dashboard.js');
  if(!dash.includes('15000'))throw new Error('timeout not 15000ms in dashboard.js');
});

console.log('\n'+'═'.repeat(50));
console.log('  Passed: '+passed+'  |  Failed: '+failed);
console.log('═'.repeat(50));
if(failed>0)process.exit(1);
