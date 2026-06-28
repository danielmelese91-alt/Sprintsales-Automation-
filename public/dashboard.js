// â”€â”€ Core Setup â”€â”€
let user=null,client=null,currentTab='overview',appState={};let _initFired=false,_loginRendered=false;
var uiPage={products:1,orders:1,posts:1},uiPageSize=25;
var orderFilter='active';
var postCenterTab='ready';
var productDraftKey='sprintsales.productDraft.v1',profileDraftKey='sprintsales.profileDraft.v1',botDraftKey='sprintsales.botDraft.v1';
function $(id){return document.getElementById(id)}
function esc(v){if(v===null||v===undefined)return'';var s=String(v);return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}

async function apiFetch(url,opts={}){try{var headers={'Accept':'application/json'};if(!(opts.body instanceof FormData)&&!opts.noContentType)headers['Content-Type']='application/json';var res=await fetch(url,{credentials:'include',...opts,headers:{...headers,...(opts.headers||{})}});var isJson=res.headers.get('content-type')?.includes('application/json');var d=null,raw='';if(!res.ok){if(isJson){try{d=await res.json()}catch(_e){d=null}}else{try{raw=await res.text()}catch(_e){raw=''}}}var htmlMessage='';if(raw){var pre=raw.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);htmlMessage=(pre?pre[1]:raw).replace(/<[^>]+>/g,' ').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/\s+/g,' ').trim().slice(0,240)}if(res.status===401&&window.location.pathname!=='/'){if(!_loginRendered){_loginRendered=true;showPublicPage('login')}throw new Error((d&&d.error&&d.error!=='Authentication required')?d.error:'Your login session expired. Please log in again.')}if(!res.ok){throw new Error((d||{}).error||(d||{}).message||htmlMessage||'Request failed ('+res.status+')')}if(isJson)return await res.json();return await res.text()}catch(e){if(e.message!=='Session expired'){showToast(e.message||'Network error','error')}throw e}}

async function initDashboard(){try{var d=await apiFetch('/api/client/dashboard');appState=d;client=d.client}catch(e){console.warn('Dashboard load error:',e.message)}}

function showToast(msg,type){var el=document.getElementById('toast');if(!el){el=document.createElement('div');el.id='toast';el.className='toast toast-'+type;el.innerHTML='<i class="fas fa-'+(type==='success'?'check-circle':type==='error'?'exclamation-circle':'info-circle')+'"></i> '+msg;document.body.appendChild(el);setTimeout(function(){el.style.opacity='0';el.style.transform='translateX(100%)';setTimeout(function(){el.remove()},300)},4000);return}el.textContent=msg;el.className='toast toast-'+type;el.classList.remove('hidden');setTimeout(function(){el.classList.add('hidden')},4000)}

function niceDialog(opts){
  opts=opts||{};
  return new Promise(function(resolve){
    var old=document.getElementById('nice-dialog');if(old)old.remove();
    var wrap=document.createElement('div');
    wrap.id='nice-dialog';
    wrap.className='nice-dialog-backdrop';
    var isPrompt=opts.prompt===true;
    var input=isPrompt?'<input id="nice-dialog-input" class="field mt-3" type="'+(opts.inputType||'text')+'" placeholder="'+esc(opts.placeholder||'')+'">':'';
    wrap.innerHTML='<div class="nice-dialog-card"><div class="flex items-start gap-3"><div class="nice-dialog-icon"><i class="fas fa-'+esc(opts.icon||'shield-alt')+'"></i></div><div class="min-w-0 flex-1"><h3>'+esc(opts.title||'Please confirm')+'</h3><p>'+esc(opts.message||'')+'</p>'+input+'</div></div><div class="nice-dialog-actions"><button type="button" id="nice-dialog-cancel" class="btn btn-ghost text-xs">'+esc(opts.cancelText||'Cancel')+'</button><button type="button" id="nice-dialog-ok" class="btn btn-primary text-xs">'+esc(opts.okText||'Continue')+'</button></div></div>';
    document.body.appendChild(wrap);
    var done=function(value){wrap.remove();resolve(value)};
    document.getElementById('nice-dialog-cancel').onclick=function(){done(isPrompt?'':false)};
    document.getElementById('nice-dialog-ok').onclick=function(){done(isPrompt?(document.getElementById('nice-dialog-input').value||''):true)};
    if(isPrompt){var field=document.getElementById('nice-dialog-input');field.focus();field.addEventListener('keydown',function(e){if(e.key==='Enter')done(field.value||'')})}
  });
}
function confirmNice(title,message,opts){opts=opts||{};return niceDialog({...opts,title:title,message:message,prompt:false})}
function promptNice(title,message,opts){opts=opts||{};return niceDialog({...opts,title:title,message:message,prompt:true})}

function showPublicPage(tab){_loginRendered=true;document.body.classList.remove('admin-dashboard','client-dashboard');var mobileNav=document.getElementById('mobile-bottom-nav');if(mobileNav)mobileNav.remove();var isAdminLogin=window.location.pathname==='/admin-login';var a=$('loading');if(a)a.classList.add('hidden');var err=$('error-page');if(err)err.classList.add('hidden');var d=$('dashboard');if(d)d.classList.add('hidden');var p=$('public-page');if(p){p.classList.remove('hidden');p.classList.toggle('login-only',window.location.pathname==='/login');p.classList.toggle('admin-login-mode',isAdminLogin)}var b=$('sidebar-biz-name');if(b)b.textContent='SprintSales';var bad=$('sidebar-role-badge');if(bad){bad.textContent='Sign In';bad.className='badge badge-pending text-xs'};var li=$('login-identifier');if(li)li.value='';var lp=$('login-password');if(lp)lp.value='';var lb=$('login-btn');if(lb){lb.disabled=false;lb.innerHTML='<i class="fas fa-sign-in-alt"></i> '+(isAdminLogin?'Log in to Admin':'Log in')}var eyebrow=document.getElementById('auth-eyebrow'),title=document.getElementById('auth-title'),subtitle=document.getElementById('auth-subtitle'),hint=document.getElementById('login-help');if(eyebrow)eyebrow.textContent=isAdminLogin?'Admin access':'Workspace access';if(title)title.textContent=isAdminLogin?'SprintSales Admin Login':'Welcome to SprintSales';if(subtitle)subtitle.textContent=isAdminLogin?'Platform control, client analytics, backups, and security settings.':'Log in or create a business account in a few minutes.';if(hint)hint.textContent=isAdminLogin?'Admins only. Client businesses should use the normal login page.':'Need access? Create an account and we will review your workspace.';if(isAdminLogin)tab='login';if(tab==='register'){var lf=$('auth-login');if(lf)lf.classList.add('hidden');var rf=$('auth-register');if(rf)rf.classList.remove('hidden');var t=$('tab-login-btn');if(t)t.classList.remove('active');var tr=$('tab-register-btn');if(tr)tr.classList.add('active');var le=$('login-error');if(le)le.classList.add('hidden')}else{var lf2=$('auth-login');if(lf2)lf2.classList.remove('hidden');var rf2=$('auth-register');if(rf2)rf2.classList.add('hidden');var t2=$('tab-login-btn');if(t2)t2.classList.add('active');var tr2=$('tab-register-btn');if(tr2)tr2.classList.remove('active');var re=$('reg-error');if(re)re.classList.add('hidden')};window.scrollTo(0,0)}

async function init(){if(_initFired)return;_initFired=true;var timeoutId=setTimeout(function(){var l=$('loading');if(l&&!l.classList.contains('hidden')){l.classList.add('hidden');var ep=$('error-page');var et=$('error-text');var ed=$('error-detail');if(et)et.textContent='Loading taking too long';if(ed)ed.textContent='The server may be unreachable.';if(ep)ep.classList.remove('hidden')}},15000);try{var r=await fetch('/api/me',{credentials:'include'});clearTimeout(timeoutId);if(!r.ok)throw new Error('status '+r.status);var u=await r.json();user=u.user;client=u.client||u.clientSettings;var adminPath=window.location.pathname==='/admin-login';if(user.role==='admin'&&!adminPath){await fetch('/api/logout',{method:'POST'}).catch(function(){});user=null;client=null;throw new Error('admin-route-required')}if(user.role!=='admin'&&adminPath){await fetch('/api/logout',{method:'POST'}).catch(function(){});user=null;client=null;throw new Error('client-route-required')}if(user.role==='admin'){currentTab='overview';loadAdminDashboard()}else{currentTab='overview';await initDashboard();loadClientDashboard()}}catch(e){clearTimeout(timeoutId);_initFired=false;showPublicPage('login')}}

window.addEventListener('DOMContentLoaded',function(){init()});

// â”€â”€ Sidebar Builder â”€â”€
function clientCanUseFeatures(cl){return !!(cl&&cl.status==='active'&&((cl.billing||{}).status!=='suspended'))}
function buildSidebar(sections){var nav=$('sidebar-nav');nav.innerHTML=sections.map(function(s){if(s.type==='label')return'<div class="text-xs text-slate-500 uppercase px-2 pt-4 pb-1 font-semibold">'+esc(s.text)+'</div>';var locked=s.locked&&client&&!clientCanUseFeatures(client);return'<div class="sidebar-link'+(s.active?' active':'')+(locked?' blocked':'')+'" onclick="'+(locked?"showToast('Available after admin approval or subscription reactivation.','info')":s.action)+'"><i class="fas fa-'+(s.icon||'circle')+'"></i><span>'+esc(s.text)+'</span>'+(locked?'<i class="fas fa-lock text-xs ml-auto"></i>':'')+'</div>'}).join('');buildMobileBottomNav(sections)}
function buildMobileBottomNav(sections){if(!user||user.role!=='client')return;var nav=document.getElementById('mobile-bottom-nav');if(!nav){nav=document.createElement('nav');nav.id='mobile-bottom-nav';nav.className='mobile-bottom-nav';document.body.appendChild(nav)}var wanted=['overview','products','orders','customers'];var items=wanted.map(function(tab){return sections.find(function(s){return s.action&&s.action.indexOf("'"+tab+"'")>-1})}).filter(Boolean);items.push({text:'More',icon:'bars',action:'toggleMobileMenu()',active:false});nav.innerHTML=items.map(function(s){var locked=s.locked&&client&&!clientCanUseFeatures(client);return'<button type="button" class="mobile-nav-item'+(s.active?' active':'')+(locked?' locked':'')+'" onclick="'+(locked?"showToast('Available after admin approval or subscription reactivation.','info')":s.action)+'"><i class="fas fa-'+(s.icon||'circle')+'"></i><span>'+esc(s.text)+'</span></button>'}).join('')}
function setMobileDashboardTitle(title){var main=document.querySelector('#dashboard main');if(main)main.setAttribute('data-mobile-title',title||'SprintSales')}

function renderBanner(){var b=$('status-banner');if(!b)return;if(!client||!user||user.role==='admin'){b.classList.add('hidden');return}var notices=(appState&&appState.clientNotices)||[];var notice=notices[0]||null;if(notice&&notice.type!=='warning')setTimeout(function(){markClientNoticeSeen(notice.id)},1800);var noticeHtml='';if(notice){var tone=notice.type==='warning'?'banner-pending':notice.type==='suggestion'?'banner-suspended':'banner-pending';var icon2=notice.type==='warning'?'fa-triangle-exclamation':notice.type==='suggestion'?'fa-lightbulb':'fa-bell';noticeHtml='<div class="banner '+tone+'"><i class="fas '+icon2+' text-xl"></i><div><strong>'+esc(notice.title||'SprintSales notice')+'</strong><p class="text-sm opacity-80 mt-0.5">'+esc(notice.message||'')+'</p></div></div>'}var cls,icon,title,msg;if((client.billing||{}).status==='suspended'){cls='banner-suspended';icon='fa-pause-circle';title='Subscription Suspended';msg='Your service is paused until SprintSales reactivates the subscription.'}else if(client.status==='active'){if(noticeHtml){b.innerHTML=noticeHtml;b.classList.remove('hidden')}else b.classList.add('hidden');return}else if(client.status==='pending'){cls='banner-pending';icon='fa-clock';title='Awaiting Approval';msg='Your account is waiting for review. Features activate after approval.'}else if(client.status==='rejected'){cls='banner-rejected';icon='fa-times-circle';title='Registration Not Approved';msg='Contact SprintSales for more information.'}else{cls='banner-suspended';icon='fa-pause-circle';title='Account Suspended';msg='Contact SprintSales to reactivate.'}b.innerHTML=noticeHtml+'<div class="banner '+cls+'"><i class="fas '+icon+' text-xl"></i><div><strong>'+title+'</strong><p class="text-sm opacity-80 mt-0.5">'+msg+'</p></div></div>';b.classList.remove('hidden')}

// â”€â”€ Client Dashboard â”€â”€
async function loadClientDashboard(){document.body.classList.remove('admin-dashboard');document.body.classList.add('client-dashboard');$('loading').classList.add('hidden');$('public-page').classList.add('hidden');$('error-page').classList.add('hidden');$('dashboard').classList.remove('hidden');$('sidebar-biz-name').textContent=client?client.businessName||'My Business':'My Business';var logo=$('sidebar-client-logo'),logoUrl=client&&client.settings&&client.settings.businessLogoUrl;if(logo){if(logoUrl){logo.src=logoUrl;logo.classList.remove('hidden')}else{logo.classList.add('hidden')}}$('sidebar-role-badge').textContent='Client';$('sidebar-role-badge').className='badge badge-active text-xs';renderBanner();if(window.innerWidth<768)$('mobile-menu-btn').style.display='block';window.scrollTo(0,0);switchClientTab(currentTab||'overview');setTimeout(maybeShowForcedPasswordChange,200)}

function switchClientTab(tab){var sidebar=document.querySelector('.sidebar');if(sidebar)sidebar.classList.remove('open');document.body.classList.remove('mobile-menu-open');currentTab=tab;var titleMap={overview:'Overview',profile:'Business Profile',products:'Products',posts:'Post Center',orders:'Orders',customers:'Customers',bot:'Telegram Bot',miniapp:'MiniApp Shop',aikeys:'AI Keys',delivery:'Delivery',payment:'Payment',discounts:'Discounts'};setMobileDashboardTitle((client&&client.businessName?client.businessName+' · ':'')+(titleMap[tab]||'Dashboard'));renderClientTab(tab);var isActive=clientCanUseFeatures(client);var nav=[{type:'label',text:'Dashboard'},{text:'Overview',icon:'home',action:"switchClientTab('overview')",active:tab==='overview'},{text:'Business Profile',icon:'building',action:"switchClientTab('profile')",active:tab==='profile'},{type:'label',text:'Features'},{text:'Products',icon:'box',action:"switchClientTab('products')",active:tab==='products',locked:!isActive},{text:'Post Center',icon:'bullhorn',action:"switchClientTab('posts')",active:tab==='posts',locked:!isActive},{text:'Orders',icon:'shopping-cart',action:"switchClientTab('orders')",active:tab==='orders',locked:!isActive},{text:'Customers',icon:'users',action:"switchClientTab('customers')",active:tab==='customers',locked:!isActive},{text:'Telegram Bot',icon:'robot',action:"switchClientTab('bot')",active:tab==='bot',locked:!isActive},{text:'MiniApp Shop',icon:'mobile-screen-button',action:"switchClientTab('miniapp')",active:tab==='miniapp',locked:!isActive},{type:'label',text:'Settings'},{text:'AI Keys',icon:'key',action:"switchClientTab('aikeys')",active:tab==='aikeys',locked:!isActive},{text:'Delivery',icon:'truck',action:"switchClientTab('delivery')",active:tab==='delivery',locked:!isActive},{text:'Payment',icon:'credit-card',action:"switchClientTab('payment')",active:tab==='payment',locked:!isActive},{text:'Discounts',icon:'tag',action:"switchClientTab('discounts')",active:tab==='discounts',locked:!isActive}];buildSidebar(nav)}

function renderClientTab(tab){var c=$('dashboard-content');c.innerHTML='';var isActive=clientCanUseFeatures(client);
if(tab==='overview')renderOverviewTab(c,isActive)
else if(tab==='profile')renderProfileTab(c)
else if(tab==='products'&&isActive)try{renderProductsTab(c)}catch(e){c.innerHTML='<div class="card p-6 text-center"><i class="fas fa-exclamation-triangle text-3xl text-red-400 mb-3 block"></i><p class="text-red-400 mb-2">Product tab error: '+esc(e.message)+'</p><p class="text-slate-400 text-sm mb-3">Other features are unaffected.</p><button onclick="switchClientTab(\'overview\')" class="btn btn-ghost text-xs"><i class="fas fa-home"></i> Go to Overview</button></div>'}
else if(tab==='products')renderLockedTab(c,'Products','box')
else if(tab==='posts'&&isActive)try{renderPostCenterTab(c)}catch(e){c.innerHTML='<div class="card p-6 text-center"><i class="fas fa-exclamation-triangle text-3xl text-red-400 mb-3 block"></i><p class="text-red-400 mb-2">Post Center error: '+esc(e.message)+'</p><button onclick="switchClientTab(\'overview\')" class="btn btn-ghost text-xs"><i class="fas fa-home"></i> Go to Overview</button></div>'}
else if(tab==='posts')renderLockedTab(c,'Post Center','bullhorn')
else if(tab==='orders'&&isActive)renderOrdersTab(c)
else if(tab==='orders')renderLockedTab(c,'Orders','shopping-cart')
else if(tab==='customers'&&isActive)renderCustomersTab(c)
else if(tab==='customers')renderLockedTab(c,'Customers','users')
else if(tab==='bot'&&isActive)renderBotTab(c)
else if(tab==='bot')renderLockedTab(c,'Telegram Bot','robot')
else if(tab==='miniapp'&&isActive)renderMiniappTab(c)
else if(tab==='miniapp')renderLockedTab(c,'MiniApp Shop','mobile-screen-button')
else if(tab==='aikeys'&&isActive)renderAiKeysTab(c)
else if(tab==='aikeys')renderLockedTab(c,'AI Keys','key')
else if(tab==='delivery'&&isActive)renderDeliveryTab(c)
else if(tab==='delivery')renderLockedTab(c,'Delivery','truck')
else if(tab==='payment'&&isActive)renderPaymentTab(c)
else if(tab==='payment')renderLockedTab(c,'Payment','credit-card')
else if(tab==='discounts'&&isActive)renderDiscountsTab(c)
else if(tab==='discounts')renderLockedTab(c,'Discounts','tag')
setTimeout(appendClientFooter,0)}

function appendClientFooter(){var c=$('dashboard-content');if(!c||!user||user.role==='admin')return;if(!document.getElementById('client-global-footer'))c.insertAdjacentHTML('beforeend','<footer id="client-global-footer" class="client-footer">© 2026 Built by SprintSales. All rights reserved.</footer>')}

function renderLockedTab(c,title,icon){c.innerHTML='<div class="card p-6"><h2 class="text-lg font-semibold text-white mb-2"><i class="fas fa-'+icon+' text-sprint-400 mr-2"></i>'+esc(title)+'</h2><p class="text-sm text-slate-400 mb-4">This feature will be available after your account is approved.</p><div class="locked-overlay"><i class="fas fa-lock"></i><span>Awaiting admin approval</span></div></div>'}

function ethiopianCityOptions(selected){
  var cityList=['Addis Ababa','Adama','Bahir Dar','Hawassa','Mekelle','Dire Dawa','Jimma','Dessie','Gondar','Harar','Shashamane','Debre Birhan','Bishoftu','Other'];
  return cityList.map(function(city){return'<option value="'+city+'"'+(selected===city?' selected':'')+'>'+city+'</option>'}).join('');
}
function businessBranchesArray(value){
  if(Array.isArray(value))return value.slice(0,3).map(function(item){return{city:item.city||'',address:item.address||item.location||''}});
  return String(value||'').split(/\n+/).map(function(line){return{city:'',address:line.trim()}}).filter(function(item){return item.address}).slice(0,3);
}
function branchRowsHtml(branches,isPending){
  branches=businessBranchesArray(branches);
  var rows=[];
  for(var i=0;i<Math.max(1,branches.length);i++)rows.push(branchRowHtml(i,branches[i]||{},isPending));
  return rows.join('');
}
function branchRowHtml(i,row,isPending){
  return'<div class="branch-row grid grid-cols-1 md:grid-cols-[180px_1fr_auto] gap-2 items-end" data-branch-row="'+i+'"><div><label class="text-xs text-slate-400 block mb-1">Branch city</label><select class="field branch-city"'+(isPending?' disabled':'')+'>'+ethiopianCityOptions(row.city||'')+'</select></div><div><label class="text-xs text-slate-400 block mb-1">Specific location</label><input class="field branch-address" value="'+esc(row.address||'')+'" placeholder="Bole Medhanialem, near..."'+(isPending?' disabled':'')+'></div><button type="button" class="btn btn-ghost text-xs" onclick="removeBranchRow(this)"'+(isPending?' disabled':'')+'><i class="fas fa-trash"></i></button></div>';
}
function addBranchRow(){var box=document.getElementById('bp-branches-box');if(!box)return;var count=box.querySelectorAll('.branch-row').length;if(count>=3){showToast('You can add up to 3 branches for now.','info');return}box.insertAdjacentHTML('beforeend',branchRowHtml(count,{},false));saveProfileDraft()}
function removeBranchRow(btn){var box=document.getElementById('bp-branches-box');if(!box)return;var rows=box.querySelectorAll('.branch-row');if(rows.length<=1){var row=rows[0];if(row){row.querySelector('.branch-city').value='Addis Ababa';row.querySelector('.branch-address').value=''}return}btn.closest('.branch-row').remove();saveProfileDraft()}
function collectBranches(){return Array.from(document.querySelectorAll('#bp-branches-box .branch-row')).map(function(row){return{city:(row.querySelector('.branch-city')||{}).value||'',address:(row.querySelector('.branch-address')||{}).value||''}}).filter(function(item){return item.city||item.address}).slice(0,3)}

// â”€â”€ Overview Tab â”€â”€
function renderOverviewTab(c,isActive){
  var s=appState||{}, d=client||{};
  var bp=((d.settings||{}).businessProfile)||{}, address=bp.address||d.address||((d.settings||{}).delivery||{}).shop_address||'Not set yet';
  var pCount=(s.products||[]).length, oCount=(s.orders||[]).length;
  var postCount=(s.productPosts||[]).length, custCount=(s.customers||[]).length;
  var orders=(s.orders||[]).slice().sort(function(a,b){return orderTime(b)-orderTime(a)});
  var activeOrders=orders.filter(function(o){return orderStatusGroup(o)!=='delivered'&&orderStatusGroup(o)!=='cancelled'}).length;
  var revenue=orders.filter(function(o){return orderStatusGroup(o)!=='cancelled'}).reduce(function(sum,o){return sum+orderAmount(o)},0);
  var topProducts=(s.products||[]).slice(0,5);
  function stat(label,value,icon,tab,sub){return'<button type="button" class="stat-card text-left card-hover" onclick="switchClientTab(\''+tab+'\')"><div class="flex items-center justify-between"><div><p class="text-xs text-slate-400">'+label+'</p><p class="text-2xl font-bold text-white">'+value+'</p>'+(sub?'<p class="text-xs text-slate-500 mt-1">'+sub+'</p>':'')+'</div><i class="fas fa-'+icon+' text-2xl text-sprint-400"></i></div></button>'}
  c.innerHTML='<div class="space-y-6"><div class="overview-hero card p-5"><div class="flex items-center gap-4">'+(((d.settings||{}).businessLogoUrl)?'<img src="'+esc((d.settings||{}).businessLogoUrl)+'" class="overview-logo" onerror="this.style.display=\'none\'">':'<div class="overview-logo fallback"><i class="fas fa-store"></i></div>')+'<div><p class="text-xs text-slate-500 uppercase font-semibold">Business dashboard</p><h2 class="text-2xl font-bold text-white">'+esc(d.businessName||'My Business')+'</h2><p class="text-sm text-slate-400 mt-1">'+(isActive?'Your shop is active. Keep products, orders, and customers moving from here.':'Welcome. Finish setup and request approval when ready.')+'</p></div></div></div>'+
  '<div class="dashboard-grid">'+stat('Products',pCount,'box','products','Manage catalog')+stat('Orders',oCount,'shopping-cart','orders',activeOrders+' active')+stat('Posts',postCount,'bullhorn','posts','Drafts and posted')+stat('Customers',custCount,'users','customers','Leads and buyers')+'</div>'+
  '<div class="grid grid-cols-1 xl:grid-cols-3 gap-5"><div class="card p-5 xl:col-span-2"><h3 class="text-white font-semibold mb-3"><i class="fas fa-chart-line text-sprint-400 mr-2"></i>Sales Snapshot</h3><div class="grid grid-cols-1 sm:grid-cols-3 gap-3"><div class="rounded-lg border border-slate-700 p-3"><p class="text-xs text-slate-500">Order value</p><p class="text-xl font-bold text-white">ETB '+Math.round(revenue).toLocaleString()+'</p></div><div class="rounded-lg border border-slate-700 p-3"><p class="text-xs text-slate-500">Active orders</p><p class="text-xl font-bold text-white">'+activeOrders+'</p></div><div class="rounded-lg border border-slate-700 p-3"><p class="text-xs text-slate-500">Latest order</p><p class="text-sm font-semibold text-white">'+(orders[0]?esc((orders[0].productName||orders[0].productCode||'Order')+' - '+new Date(orders[0].createdAt||orders[0].updatedAt).toLocaleDateString()):'No orders yet')+'</p></div></div><div class="mt-4 h-24 rounded-lg bg-slate-900/40 border border-slate-700 flex items-center justify-center text-sm text-slate-500">Daily order graph will use live traffic as orders grow.</div></div>'+
  '<div class="card p-5"><h3 class="text-white font-semibold mb-3"><i class="fas fa-star text-sprint-400 mr-2"></i>Useful Focus</h3>'+(topProducts.length?'<div class="space-y-2">'+topProducts.map(function(p){return'<button type="button" onclick="switchClientTab(\'products\')" class="w-full text-left rounded-lg border border-slate-700 p-3 hover:bg-slate-900/40"><p class="text-sm font-semibold text-white">'+esc(p.name||p.code||'Product')+'</p><p class="text-xs text-slate-500">'+esc(p.code||'')+' '+esc(p.category||'')+'</p></button>'}).join('')+'</div>':'<p class="text-sm text-slate-500">Add products first, then this area will show products that need attention.</p>')+'</div></div>'+
  '<div class="card p-4"><div class="flex items-start gap-3"><i class="fas fa-map-marker-alt text-sprint-400 mt-1"></i><div><p class="text-xs text-slate-500">Business address</p><p class="text-sm text-white">'+esc(address)+'</p></div></div></div></div>';
}

// â”€â”€ Business Profile Tab (editable for active, view-only for pending) â”€â”€
function renderProfileTab(c){
  var d=client||{}, cs=d.settings||{}, bp=cs.businessProfile||{};
  var isActive=clientCanUseFeatures(d), isPending=!isActive;
  var bizTypes=[['fashion','Fashion / Boutique'],['electronics','Electronics'],['beauty','Beauty / Cosmetics'],['home','Home / Kitchen'],['furniture','Furniture'],['cakes','Cakes / Bakery'],['retail','General Retail']];
  var selectedRetail=bp.retailType||bp.businessType||d.businessTypeLabel||'';
  var bizOpts=bizTypes.map(function(bt){return'<option value="'+bt[0]+'"'+(selectedRetail===bt[0]?' selected':'')+'>'+bt[1]+'</option>'}).join('');
  var cityOpts=ethiopianCityOptions(cs.city||'');
  c.innerHTML='<div class="space-y-6">'+
  '<div class="flex items-center justify-between flex-wrap gap-2">'+
  '<div><h2 class="text-xl font-semibold text-white"><i class="fas fa-building text-sprint-400 mr-2"></i>Business Profile</h2><p class="text-sm text-slate-400 mt-1">'+(isActive?'Active account':'Account status: '+esc(d.status||'pending'))+'</p></div>'+
  (isPending?'<span class="badge badge-pending text-xs px-3 py-1"><i class="fas fa-lock mr-1"></i> View Only</span>':'')+
  '</div>'+
  '<form id="profile-form" class="card p-6 space-y-5">'+

  // Core Information
  '<div class="border-b border-slate-700 pb-4"><h3 class="text-sm font-semibold text-sprint-400 mb-3"><i class="fas fa-info-circle mr-2"></i>Core Information</h3>'+
  '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">'+
  '<div><label class="text-xs text-slate-400 block mb-1">Business Name</label><input id="bp-bizname" class="field" value="'+esc(d.businessName||'')+'" placeholder="Your shop name"'+(isPending?' disabled':'')+'><p class="text-xs text-slate-500 mt-0.5">Shown to shoppers in the bot and dashboard.</p></div>'+
  '<div><label class="text-xs text-slate-400 block mb-1">Owner Full Name</label><input id="bp-owner" class="field" value="'+esc(d.ownerName||bp.ownerName||'')+'" placeholder="Owner name"'+(isPending?' disabled':'')+'><p class="text-xs text-slate-500 mt-0.5">Used for account contact and admin reference.</p></div>'+
  '<div><label class="text-xs text-slate-400 block mb-1">Business Type *</label><select id="bp-type" class="field"'+(isPending?' disabled':'')+'>'+bizOpts+'</select></div>'+
  '<div><label class="text-xs text-slate-400 block mb-1">Status</label><span class="badge badge-'+(isActive?'active':isPending?'pending':d.status==='rejected'?'rejected':'suspended')+' inline-block text-xs px-2 py-1 mt-1">'+esc(d.status||'unknown')+'</span><p class="text-xs text-slate-500 mt-0.5">Joined '+(d.createdAt?new Date(d.createdAt).toLocaleDateString():'-')+'</p></div>'+
  '</div></div>'+

  // Contact Info
  '<div class="border-b border-slate-700 pb-4"><h3 class="text-sm font-semibold text-sprint-400 mb-3"><i class="fas fa-address-book mr-2"></i>Contact Info</h3>'+
  '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">'+
  '<div><label class="text-xs text-slate-400 block mb-1">Phone Number</label><input id="bp-phone" class="field" value="'+esc(d.phone||'')+'" placeholder="09..."'+(isPending?' disabled':'')+'><p class="text-xs text-slate-500 mt-0.5">Main business contact number.</p></div>'+
  '<div><label class="text-xs text-slate-400 block mb-1">Email</label><input id="bp-email" class="field" type="email" value="'+esc(d.email||'')+'" placeholder="owner@example.com"'+(isPending?' disabled':'')+'><p class="text-xs text-slate-500 mt-0.5">Also used for login. Confirm changes with the password for this exact email.</p></div>'+
  '<div><label class="text-xs text-slate-400 block mb-1">City</label><select id="bp-city" class="field"'+(isPending?' disabled':'')+'>'+cityOpts+'</select></div>'+
  '<div><label class="text-xs text-slate-400 block mb-1">Specific Address</label><input id="bp-address" class="field" value="'+esc(bp.address||'')+'" placeholder="Bole Medhanialem, near..."'+(isPending?' disabled':'')+'></div>'+
  '<div class="md:col-span-2"><label class="text-xs text-slate-400 block mb-1">Exact Google Maps Link</label><input id="bp-map-url" class="field" value="'+esc(bp.mapUrl||'')+'" placeholder="Paste Google Maps share link for the shop pin"'+(isPending?' disabled':'')+'><p class="text-xs text-slate-500 mt-1">Used by the MiniApp address button. If the link contains coordinates, SprintSales also uses them for the Telegram map pin.</p></div>'+
  '<div><label class="text-xs text-slate-400 block mb-1">Map Latitude</label><input id="bp-map-lat" class="field" value="'+esc(bp.mapLatitude||((cs.delivery||{}).shop_latitude||''))+'" placeholder="Example: 8.9806"'+(isPending?' disabled':'')+'></div>'+
  '<div><label class="text-xs text-slate-400 block mb-1">Map Longitude</label><input id="bp-map-lng" class="field" value="'+esc(bp.mapLongitude||((cs.delivery||{}).shop_longitude||''))+'" placeholder="Example: 38.7578"'+(isPending?' disabled':'')+'></div>'+
  '<div class="md:col-span-2"><div class="flex items-center justify-between gap-2 mb-2"><label class="text-xs text-slate-400 block">Branches / Multiple Addresses</label><button type="button" class="btn btn-ghost text-xs" onclick="addBranchRow()"'+(isPending?' disabled':'')+'><i class="fas fa-plus"></i> Add location</button></div><div id="bp-branches-box" class="space-y-2">'+branchRowsHtml(cs.businessBranches,isPending)+'</div><p class="text-xs text-slate-500 mt-1">Up to 3 branches. Choose city from the list, then type the exact local address.</p></div>'+
  '</div></div>'+

  // Business Details
  '<div class="border-b border-slate-700 pb-4"><h3 class="text-sm font-semibold text-sprint-400 mb-3"><i class="fas fa-store mr-2"></i>Business Details</h3>'+
  '<div class="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 mb-3"><p class="text-xs text-blue-100"><i class="fas fa-info-circle mr-1"></i>Notice: AI knowledge reference will be taken from this box. Add product rules, shop policies, sizing advice, delivery notes, tone, and common customer answers here.</p></div>'+
  '<div class="mb-4"><label class="text-xs text-slate-400 block mb-1">First-Time Bot Welcome</label><textarea id="bp-first-welcome" class="field" rows="4" placeholder="Example: This is AddisMart. We sell fashion products for women, men, and kids. Browse our available products, search by code, or ask questions here."'+(isPending?' disabled':'')+'>'+esc(bp.firstTimeWelcomeMessage||'')+'</textarea><p class="text-xs text-slate-500 mt-1">Shown once below the greeting when a shopper opens your bot for the first time.</p></div>'+
  '<div><label class="text-xs text-slate-400 block mb-1">AI Knowledge Reference <span class="text-slate-500">(up to 1000 words)</span></label><textarea id="bp-reference-knowledge" class="field" rows="8" placeholder="Example: We sell womens fashion, jeans, shoes, and bags. Customers should ask for size before ordering. Delivery in Bole usually takes 4 hours..."'+(isPending?' disabled':'')+'>'+esc(bp.referenceKnowledge||'')+'</textarea><div class="flex justify-between mt-1"><p class="text-xs text-slate-500">The assistant uses this as business knowledge. Do not paste passwords or private API keys.</p><span id="bp-reference-count" class="text-xs text-slate-500">0 / 1000 words</span></div></div>'+
  '</div></div>'+

  // Branding
  '<div class="border-b border-slate-700 pb-4"><h3 class="text-sm font-semibold text-sprint-400 mb-3"><i class="fas fa-paint-brush mr-2"></i>Branding</h3>'+
  '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">'+
  '<div><label class="text-xs text-slate-400 block mb-1">Business Logo</label><div class="logo-upload-box" onclick="document.getElementById(\'bp-logo-file\').click()" ondragover="event.preventDefault();this.classList.add(\'dragging\')" ondragleave="this.classList.remove(\'dragging\')" ondrop="handleLogoDrop(event)"><input id="bp-logo-file" type="file" accept="image/png,image/jpeg,image/webp" class="hidden" onchange="uploadBusinessLogo()"'+(isPending?' disabled':'')+'><i class="fas fa-cloud-upload-alt"></i><span>Click or drop a logo image</span></div><input id="bp-logo" type="hidden" value="'+esc(cs.businessLogoUrl||'')+'"><div id="bp-logo-preview" class="mt-2">'+(cs.businessLogoUrl?'<img src="'+esc(cs.businessLogoUrl)+'" class="max-h-20 rounded object-contain bg-slate-800" onerror="this.style.display=\'none\'">':'')+'</div></div>'+
  '<div><label class="text-xs text-slate-400 block mb-1">Watermark Business Name</label><input id="bp-watermark-name" class="field" value="'+esc(cs.watermarkName||d.businessName||'')+'" placeholder="Used on product images"'+(isPending?' disabled':'')+'></div>'+
  '<div><label class="text-xs text-slate-400 block mb-1">Public Watermark Footer</label><div class="field bg-slate-50 text-slate-600 flex items-center">Uses your business logo and business name. Phone number is not shown.</div></div>'+
  '</div></div>'+

  '<div class="border-b border-slate-700 pb-4"><h3 class="text-sm font-semibold text-sprint-400 mb-3"><i class="fas fa-shield-alt mr-2"></i>Account Security</h3>'+
  '<div class="rounded-lg border border-slate-700 p-4 space-y-3">'+
  '<p class="text-xs text-slate-500">Password changes require a 6-digit confirmation code sent from the SprintSales Admin bot to the connected owner Telegram chat.</p>'+
  '<div class="grid grid-cols-1 md:grid-cols-3 gap-3">'+
  '<div><label class="text-xs text-slate-400 block mb-1">Current Password</label><input id="acct-current-password" class="field" type="password" autocomplete="current-password"'+(isPending?' disabled':'')+'></div>'+
  '<div><label class="text-xs text-slate-400 block mb-1">New Password</label><input id="acct-new-password" class="field" type="password" autocomplete="new-password" placeholder="At least 5 characters"'+(isPending?' disabled':'')+'></div>'+
  '<div><label class="text-xs text-slate-400 block mb-1">Confirm New Password</label><input id="acct-new-password2" class="field" type="password" autocomplete="new-password"'+(isPending?' disabled':'')+'></div>'+
  '</div>'+
  '<div class="flex flex-wrap gap-2 items-center"><button type="button" class="btn btn-secondary text-xs" onclick="requestPasswordChangeCode()"'+(isPending?' disabled':'')+'><i class="fas fa-paper-plane"></i> Send Confirmation Code</button><span id="acct-password-status" class="text-xs text-slate-500"></span></div>'+
  '<div id="acct-code-row" class="hidden grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end"><div><label class="text-xs text-slate-400 block mb-1">Confirmation Code</label><input id="acct-password-code" class="field" inputmode="numeric" maxlength="6" placeholder="6-digit code"></div><button type="button" class="btn btn-primary text-xs" onclick="confirmPasswordChange()"><i class="fas fa-check"></i> Confirm Password Change</button></div>'+
  '</div></div>'+

  // Online Presence
  '<div><h3 class="text-sm font-semibold text-sprint-400 mb-3"><i class="fas fa-link mr-2"></i>Online Presence</h3>'+
  '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">'+
  '<div><label class="text-xs text-slate-400 block mb-1">Telegram Channel/Group</label><input id="bp-telegram-link" class="field" value="'+esc(cs.telegramChannelLink||'')+'" placeholder="@yourchannel or https://t.me/..."'+(isPending?' disabled':'')+'></div>'+
  '<div><label class="text-xs text-slate-400 block mb-1">Website</label><input id="bp-website" class="field" value="'+esc(cs.businessWebsite||'')+'" placeholder="https://..."'+(isPending?' disabled':'')+'></div>'+
  '<div class="md:col-span-2"><label class="text-xs text-slate-400 block mb-1">Social Media Links</label><textarea id="bp-social" class="field" rows="2" placeholder="Instagram: @handle, Facebook: /page..."'+(isPending?' disabled':'')+'>'+esc(cs.businessSocialMedia||'')+'</textarea></div>'+
  '</div></div>'+

  // Save button
  '<div class="flex gap-2 pt-2">'+(isActive?'<button type="button" class="btn btn-primary text-sm" onclick="saveBusinessProfile()"><i class="fas fa-save"></i> Save Profile</button><span id="bp-save-status" class="text-xs text-slate-400 self-center hidden"></span>':'<div class="bg-slate-800 rounded p-3 text-xs text-slate-400 w-full"><i class="fas fa-info-circle mr-1 text-sprint-400"></i> Editing is available after admin approval.</div>')+'</div>'+

  '</form></div>';
  setTimeout(function(){
    var input=document.getElementById('bp-reference-knowledge');
    restoreProfileDraft();
    profileDraftFields().forEach(function(id){var el=document.getElementById(id);if(el&&!el.dataset.draftBound){el.dataset.draftBound='1';el.addEventListener('input',saveProfileDraft);el.addEventListener('change',saveProfileDraft)}});
    var branchBox=document.getElementById('bp-branches-box');if(branchBox&&!branchBox.dataset.draftBound){branchBox.dataset.draftBound='1';branchBox.addEventListener('input',saveProfileDraft);branchBox.addEventListener('change',saveProfileDraft)}
    if(input){input.addEventListener('input',updateReferenceKnowledgeCount);updateReferenceKnowledgeCount()}
  },0);
}

async function saveBusinessProfile(){
  var status=document.getElementById('bp-save-status');if(status){status.classList.remove('hidden');status.textContent='Saving...'}
  var nextIdentity={
    businessName:document.getElementById('bp-bizname').value.trim(),
    ownerName:document.getElementById('bp-owner').value.trim(),
    phone:document.getElementById('bp-phone').value.trim(),
    email:document.getElementById('bp-email').value.trim()
  };
  var identityChanged=['businessName','ownerName','phone','email'].some(function(key){return String(nextIdentity[key]||'')!==String((client||{})[key]||'')});
  var identityConfirmPassword='',identityConfirmCode='';
  if(identityChanged){
    identityConfirmPassword=await promptNice('Confirm profile change','For account safety, enter your current password to save business name, owner, phone, or email changes.',{inputType:'password',okText:'Save changes',placeholder:'Current password'});
    if(!identityConfirmPassword){if(status){status.textContent='Password required for identity changes.'}showToast('Password confirmation is required for these profile changes.','warning');return}
  }
  var previousRetail=(client&&client.settings&&client.settings.businessProfile&&(client.settings.businessProfile.retailType||client.settings.businessProfile.businessType))||'';
  var nextRetail=document.getElementById('bp-type').value;
  var replaceCategories=false;
  if(nextRetail&&previousRetail&&nextRetail!==previousRetail){
    replaceCategories=await confirmNice('Update product categories?','You changed the business category from "'+previousRetail+'" to "'+nextRetail+'". Replace the category list with matching defaults? Products keep their current saved category names for safety.',{icon:'tags',okText:'Replace defaults',cancelText:'Keep current'});
  }
  var body={
    businessName:nextIdentity.businessName,
    ownerName:nextIdentity.ownerName,
    phone:nextIdentity.phone,
    email:nextIdentity.email,
    identityConfirmPassword:identityConfirmPassword,
    identityConfirmCode:identityConfirmCode,
    businessType:'retail',
    retailType:nextRetail,
    replaceCategoriesWithDefaults:replaceCategories,
    businessFirstTimeWelcome:limitWords((document.getElementById('bp-first-welcome')||{}).value||'',160),
    businessReferenceKnowledge:limitWords((document.getElementById('bp-reference-knowledge')||{}).value||'',1000),
    businessAddress:document.getElementById('bp-address').value.trim(),
    businessMapUrl:(document.getElementById('bp-map-url')||{}).value.trim(),
    shopLatitude:(document.getElementById('bp-map-lat')||{}).value.trim(),
    shopLongitude:(document.getElementById('bp-map-lng')||{}).value.trim(),
    city:document.getElementById('bp-city').value.trim(),
    businessBranches:collectBranches(),
    businessLogoUrl:document.getElementById('bp-logo').value.trim(),
    watermarkName:document.getElementById('bp-watermark-name').value.trim(),
    telegramChannelLink:document.getElementById('bp-telegram-link').value.trim(),
    businessWebsite:document.getElementById('bp-website').value.trim(),
    businessSocialMedia:document.getElementById('bp-social').value.trim()
  };
  try{
    await apiFetch('/api/client/settings',{method:'PUT',body:JSON.stringify(body)});
    client.businessName=body.businessName||client.businessName;
    client.ownerName=body.ownerName||client.ownerName;
    client.phone=body.phone;
    client.email=body.email;
    if(!client.settings)client.settings={};if(!client.settings.businessProfile)client.settings.businessProfile={};
    client.settings.businessProfile.businessType=body.businessType;
    client.settings.businessProfile.retailType=body.retailType;
    client.settings.businessProfile.firstTimeWelcomeMessage=body.businessFirstTimeWelcome;
    client.settings.businessProfile.referenceKnowledge=body.businessReferenceKnowledge;
    client.settings.businessProfile.address=body.businessAddress;
    client.settings.businessProfile.mapUrl=body.businessMapUrl;
    client.settings.businessProfile.mapLatitude=body.shopLatitude;
    client.settings.businessProfile.mapLongitude=body.shopLongitude;
    client.settings.delivery={...(client.settings.delivery||{}),shop_latitude:body.shopLatitude||((client.settings.delivery||{}).shop_latitude||null),shop_longitude:body.shopLongitude||((client.settings.delivery||{}).shop_longitude||null)};
    client.settings.city=body.city;
    client.settings.businessBranches=body.businessBranches;
    client.settings.businessLogoUrl=body.businessLogoUrl;
    client.settings.watermarkName=body.watermarkName;
    client.settings.telegramChannelLink=body.telegramChannelLink;
    client.settings.businessWebsite=body.businessWebsite;
    client.settings.businessSocialMedia=body.businessSocialMedia;
    showToast('Profile saved!','success');
    try{localStorage.removeItem(profileDraftKey)}catch(_e){}
    if(status){status.textContent='Saved!';setTimeout(function(){status.classList.add('hidden')},2000)}
  }catch(err){
    var msg=err.message||'Save failed';
    if(identityChanged&&/wrong password|confirmation code/i.test(msg)&&await confirmNice('Use Telegram code instead?',msg+'\n\nSend a Telegram confirmation code to the connected owner chat instead?',{icon:'paper-plane',okText:'Send code'})){
      try{
        var codeReq=await apiFetch('/api/client/settings/identity-code',{method:'POST',body:JSON.stringify({})});
        showToast((codeReq&&codeReq.message)||'Confirmation code sent.','success');
        identityConfirmCode=await promptNice('Enter confirmation code','Enter the 6-digit code sent to the owner Telegram chat.',{inputType:'text',placeholder:'6-digit code',okText:'Confirm'});
        if(identityConfirmCode){
          body.identityConfirmPassword='';
          body.identityConfirmCode=identityConfirmCode.trim();
          await apiFetch('/api/client/settings',{method:'PUT',body:JSON.stringify(body)});
          client.businessName=body.businessName||client.businessName;
          client.ownerName=body.ownerName||client.ownerName;
          client.phone=body.phone;
          client.email=body.email;
          if(!client.settings)client.settings={};if(!client.settings.businessProfile)client.settings.businessProfile={};
          client.settings.businessProfile.businessType=body.businessType;
          client.settings.businessProfile.retailType=body.retailType;
          client.settings.businessProfile.firstTimeWelcomeMessage=body.businessFirstTimeWelcome;
          client.settings.businessProfile.referenceKnowledge=body.businessReferenceKnowledge;
          client.settings.businessProfile.address=body.businessAddress;
          client.settings.businessProfile.mapUrl=body.businessMapUrl;
          client.settings.businessProfile.mapLatitude=body.shopLatitude;
          client.settings.businessProfile.mapLongitude=body.shopLongitude;
          client.settings.delivery={...(client.settings.delivery||{}),shop_latitude:body.shopLatitude||((client.settings.delivery||{}).shop_latitude||null),shop_longitude:body.shopLongitude||((client.settings.delivery||{}).shop_longitude||null)};
          client.settings.city=body.city;
          client.settings.businessBranches=body.businessBranches;
          client.settings.businessLogoUrl=body.businessLogoUrl;
          client.settings.watermarkName=body.watermarkName;
          client.settings.telegramChannelLink=body.telegramChannelLink;
          client.settings.businessWebsite=body.businessWebsite;
          client.settings.businessSocialMedia=body.businessSocialMedia;
          showToast('Profile saved!','success');
          try{localStorage.removeItem(profileDraftKey)}catch(_e){}
          if(status){status.textContent='Saved!';setTimeout(function(){status.classList.add('hidden')},2000)}
          return;
        }
      }catch(codeErr){msg=codeErr.message||msg}
    }
    showToast(msg,'error');if(status){status.textContent=msg;setTimeout(function(){status.classList.add('hidden')},6000)}
  }
}

async function requestPasswordChangeCode(){
  var status=document.getElementById('acct-password-status');
  var current=(document.getElementById('acct-current-password')||{}).value||'';
  var next=(document.getElementById('acct-new-password')||{}).value||'';
  var next2=(document.getElementById('acct-new-password2')||{}).value||'';
  if(status)status.textContent='Checking...';
  if(!current||!next||!next2){var msg='Fill current password, new password, and confirmation first.';showToast(msg,'warning');if(status)status.textContent=msg;return}
  if(next!==next2){var msg2='New passwords do not match.';showToast(msg2,'warning');if(status)status.textContent=msg2;return}
  try{
    var res=await apiFetch('/api/account/password/request',{method:'POST',body:JSON.stringify({currentPassword:current,newPassword:next})});
    var row=document.getElementById('acct-code-row');if(row)row.classList.remove('hidden');
    if(status)status.textContent=(res&&res.message)||'Confirmation code sent.';
    showToast('Confirmation code sent to the owner Telegram chat.','success');
  }catch(err){var m=err.message||'Could not send confirmation code.';if(status)status.textContent=m}
}

async function confirmPasswordChange(){
  var status=document.getElementById('acct-password-status');
  var code=((document.getElementById('acct-password-code')||{}).value||'').trim();
  if(!/^\d{6}$/.test(code)){var msg='Enter the 6-digit confirmation code.';showToast(msg,'warning');if(status)status.textContent=msg;return}
  if(status)status.textContent='Confirming...';
  try{
    var res=await apiFetch('/api/account/password/confirm',{method:'POST',body:JSON.stringify({code:code})});
    ['acct-current-password','acct-new-password','acct-new-password2','acct-password-code'].forEach(function(id){var el=document.getElementById(id);if(el)el.value=''});
    var row=document.getElementById('acct-code-row');if(row)row.classList.add('hidden');
    if(status)status.textContent=(res&&res.message)||'Password changed successfully.';
    showToast('Password changed successfully.','success');
  }catch(err){var m=err.message||'Password change failed.';if(status)status.textContent=m}
}

function maybeShowForcedPasswordChange(){
  if(!user||user.role!=='client'||!user.mustChangePassword||document.getElementById('forced-password-dialog'))return;
  var wrap=document.createElement('div');
  wrap.id='forced-password-dialog';
  wrap.className='nice-dialog-backdrop';
  wrap.innerHTML='<div class="nice-dialog-card max-w-lg"><div class="flex items-start gap-3"><div class="nice-dialog-icon"><i class="fas fa-key"></i></div><div class="min-w-0 flex-1"><h3>Change your temporary password</h3><p>SprintSales admin reset this account password. Please set your own password before continuing.</p><div class="space-y-3 mt-4"><input id="forced-current-password" class="field" type="password" autocomplete="current-password" placeholder="Temporary password"><input id="forced-new-password" class="field" type="password" autocomplete="new-password" placeholder="New password, at least 5 characters"><input id="forced-new-password2" class="field" type="password" autocomplete="new-password" placeholder="Confirm new password"><p id="forced-password-status" class="text-xs text-slate-500"></p></div></div></div><div class="nice-dialog-actions"><button type="button" id="forced-password-save" class="btn btn-primary text-xs"><i class="fas fa-check"></i> Set New Password</button></div></div>';
  document.body.appendChild(wrap);
  var save=function(){submitForcedPasswordChange()};
  document.getElementById('forced-password-save').onclick=save;
  ['forced-current-password','forced-new-password','forced-new-password2'].forEach(function(id){var el=document.getElementById(id);if(el)el.addEventListener('keydown',function(e){if(e.key==='Enter')save()})});
  var first=document.getElementById('forced-current-password');if(first)first.focus();
}

async function submitForcedPasswordChange(){
  var status=document.getElementById('forced-password-status');
  var current=(document.getElementById('forced-current-password')||{}).value||'';
  var next=(document.getElementById('forced-new-password')||{}).value||'';
  var next2=(document.getElementById('forced-new-password2')||{}).value||'';
  if(status)status.textContent='Checking...';
  if(!current||!next||!next2){if(status)status.textContent='Fill all password fields.';return}
  if(next.length<5){if(status)status.textContent='New password must be at least 5 characters.';return}
  if(next!==next2){if(status)status.textContent='New passwords do not match.';return}
  try{
    var res=await apiFetch('/api/account/password/forced',{method:'POST',body:JSON.stringify({currentPassword:current,newPassword:next})});
    if(res&&res.user)user=res.user;else if(user)user.mustChangePassword=false;
    var wrap=document.getElementById('forced-password-dialog');if(wrap)wrap.remove();
    showToast('Password changed. You can continue.','success');
  }catch(err){if(status)status.textContent=err.message||'Password change failed.'}
}

function limitWords(value,maxWords){return String(value||'').trim().split(/\s+/).filter(Boolean).slice(0,maxWords).join(' ')}
function updateReferenceKnowledgeCount(){
  var input=document.getElementById('bp-reference-knowledge'),out=document.getElementById('bp-reference-count');
  if(!input||!out)return;
  var words=String(input.value||'').trim().split(/\s+/).filter(Boolean);
  if(words.length>1000){input.value=words.slice(0,1000).join(' ');words=words.slice(0,1000)}
  out.textContent=words.length+' / 1000 words';
  out.className='text-xs '+(words.length>=950?'text-yellow-500':'text-slate-500');
}

async function uploadBusinessLogo(){
  var input=document.getElementById('bp-logo-file');
  if(!input||!input.files||!input.files[0])return;
  var fd=new FormData();
  fd.append('logo',input.files[0]);
  try{
    var res=await apiFetch('/api/client/logo',{method:'POST',body:fd});
    var url=(res&&res.logoUrl)||'';
    if(res&&res.client)client=res.client;
    if(url){
      var hidden=document.getElementById('bp-logo');if(hidden)hidden.value=url;
      var preview=document.getElementById('bp-logo-preview');if(preview)preview.innerHTML='<img src="'+esc(url)+'" class="max-h-20 rounded object-contain bg-slate-800">';
      var logo=document.getElementById('sidebar-client-logo');if(logo){logo.src=url;logo.classList.remove('hidden')}
    }
    showToast('Logo uploaded.','success');
  }catch(err){showToast(err.message||'Logo upload failed.','error')}
}
function handleLogoDrop(event){
  event.preventDefault();
  var box=event.currentTarget;if(box)box.classList.remove('dragging');
  var input=document.getElementById('bp-logo-file');
  if(!input||!event.dataTransfer||!event.dataTransfer.files||!event.dataTransfer.files[0])return;
  input.files=event.dataTransfer.files;
  uploadBusinessLogo();
}

function profileDraftFields(){return['bp-first-welcome','bp-reference-knowledge','bp-address','bp-map-url','bp-map-lat','bp-map-lng','bp-telegram-link','bp-website','bp-social']}
function saveProfileDraft(){try{var draft={branches:collectBranches()};profileDraftFields().forEach(function(id){var el=document.getElementById(id);if(el)draft[id]=el.value});localStorage.setItem(profileDraftKey,JSON.stringify(draft))}catch(_e){}}
function restoreProfileDraft(){try{var raw=localStorage.getItem(profileDraftKey);if(!raw)return;var draft=JSON.parse(raw)||{};profileDraftFields().forEach(function(id){var el=document.getElementById(id);if(el&&draft[id]!==undefined)el.value=draft[id]});if(Array.isArray(draft.branches)){var box=document.getElementById('bp-branches-box');if(box)box.innerHTML=branchRowsHtml(draft.branches,false)}updateReferenceKnowledgeCount()}catch(_e){}}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  PRODUCT MANAGEMENT
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// â”€â”€ Default categories per business type (exact match) â”€â”€
function getDefaultCategoriesByType(rawType){
  var bt=String(rawType||'').toLowerCase();
  if(bt.includes('fashion')||bt.includes('boutique')||bt.includes('clothing'))
    return ["Women's Dresses","Men's Pants",'Shirts & Tops','Jackets','Traditional Wear','Shoes','Bags','Accessories'];
  if(bt.includes('electron'))
    return ['Smartphones','Laptops','Tablets','Audio & Sound','Accessories','Smart Watches'];
  if(bt.includes('beauty')||bt.includes('cosmetic'))
    return ['Skincare','Makeup','Hair Care','Fragrances','Personal Care'];
  if(bt.includes('home')||bt.includes('kitchen'))
    return ['Kitchen Appliances','Cookware','Home Decor','Storage','Cleaning Products'];
  if(bt.includes('furniture'))
    return ['Sofas','Beds','Tables','Chairs','Cabinets','Office Furniture'];
  if(bt.includes('cake')||bt.includes('bakery')||bt.includes('pastry')||bt.includes('dessert'))
    return ['Birthday Cakes','Wedding Cakes','Occasion Cakes','Custom Cakes','Cupcakes & Mini Cakes','Pastries & Desserts','Cake Accessories'];
  return ['New Arrivals','Best Sellers','Discount Items','Accessories','Other Products'];
}

function clientIsCakeBusiness(settings){
  settings=settings||{};
  var profile=settings.businessProfile||{};
  var text=[
    settings.retailType,
    settings.businessType,
    settings.productsCategoryFilter,
    profile.retailType,
    profile.businessType,
    profile.category,
    (client||{}).businessTypeLabel
  ].filter(Boolean).join(' ');
  return /cake|bakery|pastry|dessert/i.test(text);
}

// â”€â”€ Get categories from client settings only â”€â”€
function getCategories(){
  var cs=(client||{}).settings||{};
  return cs.categories||[];
}

function getTemplateCategoryNames(){
  var templates=getCategoryTemplates();
  return templates.length?templates.map(function(t){return t.name}).filter(Boolean):getCategories();
}

function getCategoryTemplates(){
  var cs=(client||{}).settings||{};
  if(Array.isArray(cs.categoryTemplates)&&cs.categoryTemplates.length)return cs.categoryTemplates;
  return getCategories().map(function(name){return{name:name,subcategories:[]}});
}

function getSubcategoriesForCategory(cat){
  var item=getCategoryTemplates().find(function(t){return t&&t.name===cat});
  return item&&Array.isArray(item.subcategories)?item.subcategories:[];
}

function iconForCategory(cat){
  var item=getCategoryTemplates().find(function(t){return t&&t.name===cat});
  return retailLabelIcon(cat,item&&item.icon?item.icon:'');
}

function iconForSubcategory(cat,sub){
  var item=getCategoryTemplates().find(function(t){return t&&t.name===cat});
  return retailLabelIcon(sub,item&&item.subcategoryIcons&&item.subcategoryIcons[sub]?item.subcategoryIcons[sub]:'');
}

function categoryIconImageMap(){
  var cs=(client||{}).settings||{};
  return cs.categoryIconImages||cs.cakeTypeIconImages||{};
}

function categoryIconKey(label){
  return String(label||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}

function categoryIconImageValue(label){
  var map=categoryIconImageMap();
  return map[label]||map[categoryIconKey(label)]||'';
}

function categoryIconImageInput(label){
  var id='cat-icon-'+categoryIconKey(label);
  return '<div class="rounded-lg border border-slate-700/70 bg-slate-900/40 p-3">'+
    '<label class="text-xs text-slate-400 block mb-1">'+esc(label)+'</label>'+
    '<input id="'+id+'" data-category-icon-label="'+esc(label)+'" class="field text-sm" value="'+esc(categoryIconImageValue(label))+'" placeholder="Paste image URL for this cake type">'+
  '</div>';
}

function renderCakeTypeIconManager(labels){
  if(!clientIsCakeBusiness((client||{}).settings||{}))return'';
  labels=labels||[];
  if(!labels.length)return'';
  return '<div class="card p-5 mt-4 border border-pink-500/20 bg-pink-500/5">'+
    '<div class="flex items-start justify-between gap-3 flex-wrap mb-3"><div><h3 class="text-white font-semibold"><i class="fas fa-image text-pink-300 mr-2"></i>Cake Type Image Icons</h3><p class="text-xs text-slate-400 mt-1">These images appear at the top of the cake MiniApp, for example Birthday Cakes and Wedding Cakes.</p></div>'+
    '<button type="button" class="btn btn-primary text-xs" onclick="saveCategoryIconImages()"><i class="fas fa-save"></i> Save Icons</button></div>'+
    '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">'+labels.map(categoryIconImageInput).join('')+'</div>'+
  '</div>';
}

async function saveCategoryIconImages(){
  var map={};
  document.querySelectorAll('[data-category-icon-label]').forEach(function(input){
    var label=input.getAttribute('data-category-icon-label')||'';
    var value=(input.value||'').trim();
    if(label&&value){
      map[label]=value;
      map[categoryIconKey(label)]=value;
    }
  });
  try{
    var res=await apiFetch('/api/client/settings',{method:'PUT',body:JSON.stringify({categoryIconImages:map})});
    if(res&&res.client){client=res.client}else{client.settings=client.settings||{};client.settings.categoryIconImages=map}
    showToast('Cake type icons saved.','success');
    renderCategoriesSection();
  }catch(err){showToast(err.message,'error')}
}

function retailLabelIcon(label,fallback){
  var text=String(label||'').toLowerCase();
  var cleanFallback=/[\u00c2\u00c3\u00c5\u00e2\u00ef\u00f0]/i.test(String(fallback||''))?'':fallback;
  var rules=[
    [/iphone|ios|apple phone/,'iPhone'], [/samsung|galaxy/,'Samsung'], [/tecno/,'TECNO'], [/infinix/,'Infinix'], [/redmi|xiaomi/,'Xiaomi'], [/itel/,'itel'],
    [/feature phone|used phone|mobile|smartphone|phone/,'\uD83D\uDCF1'], [/phone accessories?|cases?|screen protectors?|holders?/,'\uD83D\uDEE1\uFE0F'], [/chargers?|cables?|type-c|power banks?|extension cords?/,'\u26A1'],
    [/earphones?|earbuds?|headphones?|audio/,'\uD83C\uDFA7'], [/selfie|memory card|sim adapter/,'\uD83D\uDCF8'], [/laptop|notebook|desktop|computer|pc|monitor/,'\uD83D\uDCBB'], [/keyboard|mouse|webcam|stand|peripheral/,'\u2328\uFE0F'], [/ssd|hard drive|flash disk|ram|storage/,'\uD83D\uDCBE'],
    [/printer|scanner|photocopy|barcode|pos|cash register|toner|ink|laminating|binding|shredder/,'\uD83D\uDDA8\uFE0F'], [/smart tv|led tv|android tv|tv box|receiver|remote|television/,'\uD83D\uDCFA'], [/soundbar|home theater|speaker|projector|microphone/,'\uD83D\uDD0A'], [/camera|cctv|security|doorbell|alarm|tripod|ring light|studio light/,'\uD83D\uDCF7'], [/router|wi-?fi|ethernet|network|modem|access point|fiber|switch/,'\uD83D\uDCF6'], [/solar|inverter|ups|battery|generator|stabilizer|power/,'\uD83D\uDD0B'], [/gaming|playstation|xbox|controller|console|gamepad/,'\uD83C\uDFAE'],
    [/jeans?|denim|trouser|pants?|leggings|cargo|wide-leg|skinny|high-waist/,'\uD83D\uDC56'], [/dress|habesha|kemis|gown|party dress|office dress|casual dress/,'\uD83D\uDC57'], [/skirt/,'\uD83E\uDE71'], [/t-shirt|tee|polo|shirt|crop top|tank top|bodysuit|blouse/,'\uD83D\uDC5A'], [/hoodie|sweatshirt|sweater|cardigan|jacket|coat|blazer|suit|vest|tracksuit|outerwear|knitwear/,'\uD83E\uDDE5'], [/maternity/,'\uD83E\uDD30'], [/baby|newborn/,'\uD83C\uDF7C'], [/kids?|boys|girls|school|pajama|toy/,'\uD83E\uDDD2'],
    [/heel/,'\uD83D\uDC60'], [/flat shoe|sandal|slipper/,'\uD83D\uDC61'], [/sneaker|sports shoe|shoe/,'\uD83D\uDC5F'], [/boot/,'\uD83E\uDD7E'], [/handbag|shoulder bag|crossbody|tote|clutch|bag/,'\uD83D\uDC5C'], [/backpack|school bag/,'\uD83C\uDF92'], [/laptop bag|travel bag|wallet|purse/,'\uD83D\uDCBC'], [/belt|tie|bow tie/,'\uD83D\uDC54'], [/sunglass/,'\uD83D\uDD76\uFE0F'], [/watch/,'\u231A'], [/scarf|hat|cap|sock/,'\uD83E\uDDE3'], [/jewelry|earring|necklace|bracelet|ring|anklet/,'\uD83D\uDC8D'],
    [/sofa|living room|recliner|ottoman|seating/,'\uD83D\uDECB\uFE0F'], [/coffee table|side table|console|tv stand|wardrobe|drawer|cabinet|shelf|storage|rack/,'\uD83D\uDDC4\uFE0F'], [/bed|mattress|bedroom|crib|bunk/,'\uD83D\uDECF\uFE0F'], [/desk|office|workstation/,'\uD83C\uDFE2'], [/chair|stool/,'\uD83E\uDE91'], [/dining|kitchen table/,'\uD83C\uDF7D\uFE0F'], [/outdoor|garden|patio|balcony|bench|shade/,'\uD83C\uDFE1'], [/wood|mdf|metal|plastic|leather|custom/,'\uD83D\uDD28'],
    [/makeup|lipstick|mascara|eyeliner|foundation|concealer|powder|blush|nail/,'\uD83D\uDC84'], [/skincare|cream|serum|sunscreen|cleanser|lotion|mask|scrub|toner|retinol|acne/,'\uD83E\uDDF4'], [/wig|hair extension|braiding|crochet|bundle|hair|shampoo|conditioner|salon|barber|clipper|dryer|straightener|shaver/,'\uD83D\uDC87\u200D\u2640\uFE0F'], [/perfume|fragrance|deodorant|body spray|arabic perfume|oil/,'\u2728'], [/soap|shower|tooth|mouthwash|razor|personal care|hygiene|feminine|cotton/,'\uD83E\uDDFC'], [/beauty tool|facial steamer|manicure|pedicure|mirror|tweezer/,'\uD83E\uDE9E'],
    [/blender|juicer|kettle|coffee|toaster|cooker|air fryer|microwave|oven|stove|mitad|kitchen appliance/,'\uD83C\uDF73'], [/refrigerator|freezer|washing machine|dryer|dishwasher|dispenser|large appliance/,'\u2744\uFE0F'], [/vacuum|iron|fan|air conditioner|heater|humidifier|home appliance/,'\uD83E\uDDF9'], [/pot|pan|plate|bowl|cup|glass|mug|spoon|fork|knife|kitchenware|cookware|tableware/,'\uD83C\uDF7D\uFE0F'], [/jebena|rekebot|sini|injera|mesob|clay|spice|berbere|ethiopian/,'\u2615'], [/mop|broom|cleaning|bucket|dustbin|laundry|detergent|glove/,'\uD83E\uDDFD'], [/bedsheet|blanket|pillow|towel|curtain|carpet|rug|textile|bedding/,'\uD83D\uDECF\uFE0F'], [/light|bulb|lamp|chandelier|lighting/,'\uD83D\uDCA1'],
    [/new arrival/,'\u2728'], [/best seller/,'\uD83D\uDD25'], [/discount|sale|promo/,'\uD83C\uDFF7\uFE0F'], [/accessor/,'\uD83E\uDDE9']
  ];
  var match=rules.find(function(rule){return rule[0].test(text)});
  if(match&&match[1])return match[1];
  return cleanFallback||'\u{1F4E6}';
}

function renderSubcategoryOptions(cat,selected){
  var subs=getSubcategoriesForCategory(cat);
  return '<option value="">Select Subcategory</option>'+subs.map(function(s){return'<option value="'+esc(s)+'"'+(selected===s?' selected':'')+'>'+esc((iconForSubcategory(cat,s)?iconForSubcategory(cat,s)+' ':'')+s)+'</option>'}).join('');
}

function updateProductSubcategories(selected){
  var catEl=document.getElementById('prod-category-select');
  var subEl=document.getElementById('prod-subcategory-select');
  if(!subEl||!catEl)return;
  subEl.innerHTML=renderSubcategoryOptions(catEl.value,selected||'');
  refreshSpecChips();
  saveProductDraft();
}

retailLabelIcon=function(label,fallback){
  var text=String(label||'').toLowerCase();
  var cleanFallback=/[\u00c2\u00c3\u00c5\u00e2\u00ef\u00f0]/i.test(String(fallback||''))?'':fallback;
  var rules=[
    [/birthday cake|wedding cake|custom cake|cake|bakery|cupcake|bento|pastry|dessert/,'🎂'],[/cookie|brownie|donut|cheesecake|tart/,'🍪'],[/candle|topper|cake box|gift packaging/,'🎁'],
    [/iphone|ios|apple phone/,'📱'],[/samsung|galaxy/,'📱'],[/tecno|infinix|redmi|xiaomi|itel|mobile|smart.?phone|feature phone|used phone|phone/,'📱'],
    [/charger|cable|type-c|power bank|phone accessories|screen protector|case|holder/,'🔌'],[/earphone|earbud|headphone|soundbar|speaker|audio/,'🎧'],
    [/laptop|computer|desktop|monitor|keyboard|mouse|ssd|flash|ram|webcam|hard drive|storage/,'💻'],[/printer|scanner|toner|ink|pos|cash register|barcode|office electronics/,'🖨️'],
    [/tv|television|receiver|remote|projector|entertainment/,'📺'],[/camera|cctv|security|door camera|alarm|tripod|ring light/,'📷'],[/router|modem|network|wifi|wi-fi|access point/,'🌐'],[/solar|inverter|ups|battery|generator|power/,'🔋'],[/gaming|playstation|xbox|console|controller/,'🎮'],
    [/habesha|kemis|traditional dress|traditional jewelry/,'👗'],[/dress|skirt|jumpsuit|two-piece|maternity|women/,'👗'],[/jean|denim|trouser|pants|legging|cargo|wide-leg|skinny|high-waist/,'👖'],[/shirt|t-shirt|tee|polo|crop top|tank top|bodysuit|blouse/,'👕'],[/hoodie|sweater|cardigan|jacket|coat|blazer|suit|tracksuit|vest|gym wear/,'🧥'],
    [/baby|newborn|kid|boys|girls|school|pajama|toy/,'🧸'],[/shoe|heel|sandal|sneaker|boot|slipper/,'👟'],[/bag|handbag|backpack|wallet|purse|clutch|tote|laptop bag/,'👜'],[/watch|sunglass|jewelry|earring|necklace|bracelet|ring|belt|hat|cap|scarf|tie/,'💍'],
    [/sofa|recliner|ottoman|living room/,'🛋️'],[/bed|mattress|wardrobe|bedroom|crib|bunk/,'🛏️'],[/desk|office furniture|chair|filing|workstation/,'🪑'],[/dining|bar stool/,'🍽️'],[/outdoor|garden|patio|bench/,'🏡'],[/storage|shelf|rack|cabinet|drawer/,'🗄️'],[/wood|mdf|metal|custom furniture|leather/,'🔨'],
    [/makeup|lipstick|mascara|eyeliner|foundation|powder|nail/,'💄'],[/skincare|cream|serum|sunscreen|cleanser|lotion|mask|scrub/,'🧴'],[/wig|hair extension/,'💇'],[/hair|shampoo|conditioner|salon|barber|clipper/,'💇'],[/perfume|fragrance|deodorant|body spray/,'✨'],[/soap|tooth|razor|personal care|hygiene/,'🧼'],
    [/blender|kettle|coffee|air fryer|microwave|oven|stove|mitad|kitchen appliance/,'🍳'],[/refrigerator|freezer|washing|dryer|dispenser|large appliance/,'🧊'],[/pot|pan|plate|bowl|cup|cutlery|kitchenware/,'🍽️'],[/jebena|rekebot|sini|injera|mesob|clay|spice|berbere|ethiopian kitchen/,'☕'],[/mop|broom|cleaning|bucket|dustbin|glove/,'🧹'],[/bedsheet|blanket|pillow|towel|curtain|carpet|rug|textile/,'🛏️'],[/light|bulb|lamp|chandelier/,'💡'],
    [/new arrival/,'✨'],[/best seller/,'🔥'],[/discount|sale|promo|holiday/,'🏷️']
  ];
  for(var i=0;i<rules.length;i++){if(rules[i][0].test(text))return rules[i][1]}
  if(cleanFallback)return cleanFallback;
  if(/electronics/.test(text))return'⚡';
  if(/fashion|boutique|clothing/.test(text))return'👗';
  if(/furniture/.test(text))return'🛋️';
  if(/beauty|cosmetic/.test(text))return'💄';
  if(/home|kitchen/.test(text))return'🏠';
  if(/cake|bakery|pastry|dessert/.test(text))return'🎂';
  return'📦';
};

var PRODUCT_SPEC_PRESETS={
  tshirt:['XS','S','M','L','XL','XXL','XXXL'],
  clothing:['XS','S','M','L','XL','XXL','XXXL'],
  jeans:['26','28','30','32','34','36','38','40','42','44'],
  jeansColors:['Omo','Classic Blue','Dark Blue','Light Blue','Black','Gray','White','Washed Blue','Navy','Brown'],
  shoes:['35','36','37','38','39','40','41','42','43','44','45','46'],
  kids:['2Y','3Y','4Y','5Y','6Y','7Y','8Y','9Y','10Y','11Y','12Y'],
  colors:['Black','White','Red','Blue','Green','Yellow','Pink','Purple','Brown','Gray','Navy','Beige','Cream','Orange','Gold','Silver'],
  electronicsStorage:['64GB','128GB','256GB','512GB','1TB','2TB'],
  electronicsRam:['4GB RAM','6GB RAM','8GB RAM','12GB RAM','16GB RAM','32GB RAM'],
  phoneScreenSizes:['5.5 inch','6.1 inch','6.5 inch','6.7 inch','6.8 inch','7 inch'],
  computerScreenSizes:['11.6 inch','13 inch','14 inch','15.6 inch','16 inch','17.3 inch','24 inch','27 inch'],
  electronicsCondition:['Brand new','Used like new','Used good','Refurbished'],
  electronicsPower:['110V','220V','Rechargeable','Battery powered','USB-C','Micro USB'],
  kitchenCapacity:['0.5L','1L','1.5L','2L','3L','5L','7L','10L'],
  kitchenMaterial:['Stainless steel','Glass','Ceramic','Non-stick','Plastic','Wood','Aluminum'],
  beautySkin:['Oily skin','Dry skin','Combination skin','Sensitive skin','Normal skin'],
  beautyShade:['Light','Medium','Tan','Dark','Clear','Natural'],
  furnitureSize:['Single','Double','Queen','King','Small','Medium','Large'],
  furnitureMaterial:['Wood','Metal','Leather','Fabric','Foam','Glass','MDF'],
  groceryWeight:['250g','500g','1kg','2kg','5kg','10kg'],
  packSize:['Single','2 pack','3 pack','6 pack','12 pack','Carton'],
  cakeSizes:['0.5 kg','1 kg','1.5 kg','2 kg','3 kg','4 kg','6 inch','8 inch','10 inch','12 inch','Two tier','Three tier'],
  cakeFlavors:['Vanilla','Chocolate','Red velvet','Black forest','Marble','Strawberry','Lemon','Coffee','Carrot','Fruit cake'],
  cakeFrosting:['Buttercream','Whipped cream','Fondant','Chocolate ganache','Cream cheese frosting','No frosting'],
  cakeShapes:['Round','Square','Rectangle','Heart','Number shape','Tiered','Custom shape'],
  cakeOccasions:['Birthday','Wedding','Engagement','Graduation','Anniversary','Baby shower','Corporate event','Religious celebration','Custom occasion']
};
function csvValues(v){return String(v||'').split(/[,|/;\n]+/).map(function(x){return x.trim()}).filter(Boolean)}
function setCsvValues(id,values){var el=document.getElementById(id);if(el)el.value=values.filter(Boolean).join(', ')}
function clearSpecField(id){setCsvValues(id,[])}
function jsQuote(v){return String(v||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'")}
function selectedSpecSet(id){return new Set(csvValues((document.getElementById(id)||{}).value).map(function(v){return v.toLowerCase()}))}
function specContextText(){
  var cat=(document.getElementById('prod-category-select')||{}).value||'';
  var sub=(document.getElementById('prod-subcategory-select')||{}).value||'';
  return (cat+' '+sub).toLowerCase();
}
function productSpecProfile(cat,sub){
  var text=String((cat||'')+' '+(sub||'')).toLowerCase();
  if(/\b(cakes?|bakery|baker(y|ies)|cupcakes?|pastries?|desserts?|birthday|wedding|fondant|bento)\b/.test(text))return{
    sizeLabel:'Cake Size',
    sizeValues:PRODUCT_SPEC_PRESETS.cakeSizes,
    colorLabel:'Theme Color',
    colorValues:['White','Chocolate','Pink','Blue','Gold','Red','Purple','Black','Cream','Custom color'],
    optionLabel:'Flavor / Occasion',
    optionValues:PRODUCT_SPEC_PRESETS.cakeFlavors.concat(PRODUCT_SPEC_PRESETS.cakeOccasions)
  };
  if(/\b(jeans?|denim|bottoms?|pants?|trousers?)\b/.test(text))return{
    sizeLabel:'Waist Size',
    sizeValues:PRODUCT_SPEC_PRESETS.jeans,
    colorLabel:'Jeans Colors',
    colorValues:PRODUCT_SPEC_PRESETS.jeansColors,
    optionLabel:'Fit / Style',
    optionValues:['Skinny','Slim','Straight','Regular','Relaxed','Wide leg','High waist','Low waist','Stretch','Non-stretch']
  };
  if(/\b(shoes?|sneakers?|boots?|sandals?|heels?)\b/.test(text))return{
    sizeLabel:'Shoe Size',
    sizeValues:PRODUCT_SPEC_PRESETS.shoes,
    colorLabel:'Shoe Colors',
    colorValues:PRODUCT_SPEC_PRESETS.colors,
    optionLabel:'Shoe Options',
    optionValues:['Men','Women','Kids','Flat','Low heel','High heel','Sport','Casual','Formal']
  };
  if(/\b(phones?|smartphones?|iphone|samsung|tecno|infinix|xiaomi|laptops?|computers?|tablets?)\b/.test(text))return{
    sizeLabel:'Storage',
    sizeValues:PRODUCT_SPEC_PRESETS.electronicsStorage,
    colorLabel:'Device Colors',
    colorValues:['Black','White','Silver','Gold','Blue','Green','Purple','Graphite','Gray'],
    optionLabel:'Condition',
    optionValues:PRODUCT_SPEC_PRESETS.electronicsCondition
  };
  if(/\b(kitchen|cookware|cooking|pots?|pans?|bottles?|cups?|jars?|blenders?|kettles?)\b/.test(text))return{
    sizeLabel:'Capacity / Size',
    sizeValues:PRODUCT_SPEC_PRESETS.kitchenCapacity,
    colorLabel:'Color',
    colorValues:PRODUCT_SPEC_PRESETS.colors,
    optionLabel:'Material',
    optionValues:PRODUCT_SPEC_PRESETS.kitchenMaterial
  };
  if(/\b(beauty|cosmetics?|makeup|creams?|lotions?|perfumes?|skin|hair)\b/.test(text))return{
    sizeLabel:'Pack / Volume',
    sizeValues:['30ml','50ml','100ml','150ml','200ml','250ml','500ml','Single','Set'],
    colorLabel:'Shade / Color',
    colorValues:PRODUCT_SPEC_PRESETS.beautyShade.concat(['Red','Pink','Nude','Brown','Black','Clear']),
    optionLabel:'Skin / Hair Type',
    optionValues:PRODUCT_SPEC_PRESETS.beautySkin.concat(['All hair types','Curly hair','Dry hair','Oily hair'])
  };
  if(/\b(furniture|sofas?|chairs?|tables?|beds?|mattresses?|cabinets?)\b/.test(text))return{
    sizeLabel:'Furniture Size',
    sizeValues:PRODUCT_SPEC_PRESETS.furnitureSize,
    colorLabel:'Furniture Colors',
    colorValues:['Black','White','Brown','Gray','Beige','Cream','Navy','Green'],
    optionLabel:'Material',
    optionValues:PRODUCT_SPEC_PRESETS.furnitureMaterial
  };
  if(/\b(grocery|groceries|foods?|drinks?|coffee|spices?|oils?|grains?|flour|rice)\b/.test(text))return{
    sizeLabel:'Weight / Pack Size',
    sizeValues:PRODUCT_SPEC_PRESETS.groceryWeight.concat(PRODUCT_SPEC_PRESETS.packSize),
    colorLabel:'Variant',
    colorValues:['Original','Red','Green','Yellow','Brown','White','Black'],
    optionLabel:'Package',
    optionValues:['Fresh','Dry','Bottle','Bag','Box','Carton','Family size']
  };
  return{
    sizeLabel:'Size / Variant',
    sizeValues:PRODUCT_SPEC_PRESETS.clothing,
    colorLabel:'Color Options',
    colorValues:PRODUCT_SPEC_PRESETS.colors,
    optionLabel:'Extra Options',
    optionValues:['Brand new','Used like new','Imported','Local','Single item','Set bundle']
  };
}
function productSpecFamilyFromText(cat,sub,name){
  var text=String((cat||'')+' '+(sub||'')+' '+(name||'')).toLowerCase();
  if(/\b(cakes?|bakery|baker(y|ies)|cupcakes?|pastries?|desserts?|birthday|wedding|fondant|bento)\b/.test(text))return'cakes';
  if(/\b(phone|smartphone|iphone|samsung|tecno|infinix|redmi|xiaomi|laptop|computer|tablet|electronics?|device|charger|cable|power bank|router|tv|camera|printer|gaming|playstation|xbox)\b/.test(text))return'electronics';
  if(/\b(shoe|sneaker|boot|sandal|heel|slipper)\b/.test(text))return'shoes';
  if(/\b(jeans?|denim|pants?|trousers?|bottoms?)\b/.test(text))return'jeans';
  if(/\b(dress|shirt|t.?shirt|top|crop|skirt|shurab|sweater|hoodie|jacket|coat|blazer|suit|clothing|fashion|boutique|habesha|kemis)\b/.test(text))return'fashion';
  if(/\b(makeup|cosmetic|beauty|cream|lotion|perfume|fragrance|skin|hair|wig|extension|lipstick|mascara|sunscreen)\b/.test(text))return'beauty';
  if(/\b(furniture|sofa|chair|table|bed|mattress|cabinet|wardrobe|shelf|desk)\b/.test(text))return'furniture';
  if(/\b(kitchen|appliance|cookware|pot|pan|plate|cup|kettle|blender|mitad|jebena|mesob|home)\b/.test(text))return'home';
  return'general';
}
function incompatibleSpecForFamily(family,field,value){
  var item=String(value||'').toLowerCase();
  var electronicsOnly=/\b(?:\d+\s*(?:gb|tb)\b|ram|storage|ssd|hdd|usb|type-c|micro usb|mah|watt|hz|inch|sim|lte|5g|4g|playstation|xbox)\b/;
  var shoeSizeOnly=/^(?:3[5-9]|4[0-6])$/;
  var genericProductOptions=/\b(?:brand new|used|imported|local|single item|set bundle)\b/;
  if(family!=='electronics'&&electronicsOnly.test(item))return true;
  if(family!=='shoes'&&shoeSizeOnly.test(item))return true;
  if((family==='fashion'||family==='jeans')&&field==='option'&&genericProductOptions.test(item))return true;
  return false;
}
function cleanSpecCurrentValue(field,current,family){
  return csvValues(current).filter(function(v){return!incompatibleSpecForFamily(family,field,v)}).join(', ');
}
function specKey(value){return String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')||'option'}
function specGroupInputId(key){return'prod-spec-'+specKey(key)}
function productSpecGroupsProfile(cat,sub,name){
  var text=String((cat||'')+' '+(sub||'')+' '+(name||'')).toLowerCase();
  var profile=productSpecProfile(cat,[sub,name].filter(Boolean).join(' '));
  if(/\b(cakes?|bakery|baker(y|ies)|cupcakes?|pastries?|desserts?|birthday|wedding|fondant|bento)\b/.test(text)){
    return [
      {key:'cake_size',label:'Cake Size',field:'size',values:PRODUCT_SPEC_PRESETS.cakeSizes},
      {key:'flavor',label:'Flavor',field:'option',values:PRODUCT_SPEC_PRESETS.cakeFlavors},
      {key:'frosting',label:'Cream / Frosting',field:'option',values:PRODUCT_SPEC_PRESETS.cakeFrosting},
      {key:'shape',label:'Shape',field:'option',values:PRODUCT_SPEC_PRESETS.cakeShapes},
      {key:'occasion',label:'Occasion',field:'option',values:PRODUCT_SPEC_PRESETS.cakeOccasions},
      {key:'theme_color',label:'Theme Color',field:'color',values:['White','Chocolate','Pink','Blue','Gold','Red','Purple','Black','Cream','Custom color']}
    ];
  }
  if(/\b(phones?|smartphones?|iphone|samsung|tecno|infinix|xiaomi|redmi|laptops?|computers?|desktop|tablets?)\b/.test(text)){
    var laptopLike=/\b(laptops?|computers?|desktop|pc|notebook)\b/.test(text);
    var phoneLike=/\b(phones?|smartphones?|iphone|samsung|tecno|infinix|xiaomi|redmi)\b/.test(text);
    var groups=[
      {key:'storage',label:'Storage',field:'size',values:PRODUCT_SPEC_PRESETS.electronicsStorage},
      {key:'ram',label:'RAM',field:'size',values:PRODUCT_SPEC_PRESETS.electronicsRam},
      {key:'screen_size',label:'Screen Size',field:'option',values:laptopLike?PRODUCT_SPEC_PRESETS.computerScreenSizes:PRODUCT_SPEC_PRESETS.phoneScreenSizes},
      {key:'color',label:'Color',field:'color',values:['Black','White','Silver','Gold','Blue','Green','Purple','Graphite','Gray']},
      {key:'condition',label:'Condition',field:'option',values:PRODUCT_SPEC_PRESETS.electronicsCondition}
    ];
    return groups;
  }
  return [
    {key:'size',label:profile.sizeLabel,field:'size',values:profile.sizeValues},
    {key:'color',label:profile.colorLabel,field:'color',values:profile.colorValues},
    {key:'option',label:profile.optionLabel,field:'option',values:profile.optionValues}
  ];
}
function productSavedSpecGroups(p){
  var raw=p&&p.specGroups;
  if(typeof raw==='string'){try{raw=JSON.parse(raw)}catch(_e){raw=[]}}
  if(!Array.isArray(raw))raw=[];
  return raw.map(function(g){
    return {
      key:specKey(g.key||g.name||g.label),
      label:g.label||g.name||g.key||'Option',
      field:g.field||'option',
      values:csvValues(Array.isArray(g.values)?g.values.join(', '):g.values)
    };
  }).filter(function(g){return g.key&&g.values.length});
}
function draftSpecGroups(draft){
  if(!draft)return[];
  var raw=draft['prod-spec-groups']||draft.specGroups;
  if(!raw)return[];
  try{return JSON.parse(raw)}catch(_e){return[]}
}
function fallbackSpecValueForGroup(group,p,draft){
  var saved=productSavedSpecGroups(p).find(function(g){return g.key===specKey(group.key)});
  if(saved)return saved.values.join(', ');
  var fromDraft=draftSpecGroups(draft).find(function(g){return specKey(g.key)===specKey(group.key)});
  if(fromDraft)return csvValues(Array.isArray(fromDraft.values)?fromDraft.values.join(', '):fromDraft.values).join(', ');
  var legacy=group.field==='size'?(p?p.sizes:(draft&&draft['prod-sizes'])):group.field==='color'?(p?p.colors:(draft&&draft['prod-colors'])):(p?(p.options||p.variants):(draft&&draft['prod-options']));
  var values=csvValues(legacy);
  if(group.key==='ram')values=values.filter(function(v){return/\bram\b/i.test(v)});
  if(group.key==='storage')values=values.filter(function(v){return!/\bram\b/i.test(v)&&/\b(?:\d+\s*(?:gb|tb)|storage|ssd|hdd)\b/i.test(v)});
  if(group.key==='condition')values=values.filter(function(v){return/\b(?:brand new|used|refurbished|like new|good)\b/i.test(v)});
  return values.join(', ');
}
function currentSpecGroupValues(){
  var values={};
  document.querySelectorAll('[data-spec-group-key]').forEach(function(input){
    values[input.dataset.specGroupKey]=input.value||'';
  });
  return values;
}
function activeSpecGroupsProfile(){
  var category=(document.getElementById('prod-category-select')||{}).value||'';
  var subcategory=(document.getElementById('prod-subcategory-select')||{}).value||'';
  var nameHint=(document.getElementById('prod-name')||{}).value||'';
  return productSpecGroupsProfile(category,subcategory,nameHint);
}
function specGroupsPanelHtml(groups,p,draft,current){
  current=current||{};
  var html='<input id="prod-sizes" type="hidden" value=""><input id="prod-colors" type="hidden" value=""><input id="prod-options" type="hidden" value="">';
  html+=groups.map(function(group){
    var id=specGroupInputId(group.key);
    var value=current[group.key]!==undefined?current[group.key]:fallbackSpecValueForGroup(group,p,draft);
    return specSelectionPanel(id,group.label,group.values,value,'Type custom '+String(group.label||'option').toLowerCase(),group);
  }).join('');
  return html;
}
function collectProductSpecPayload(){
  var groups=activeSpecGroupsProfile().map(function(group){
    var id=specGroupInputId(group.key);
    var values=csvValues((document.getElementById(id)||{}).value);
    return {
      key:specKey(group.key),
      label:group.label,
      field:group.field||'option',
      values:values
    };
  }).filter(function(group){return group.values.length});
  var sizes=[],colors=[],options=[];
  groups.forEach(function(group){
    if(group.field==='size')sizes=sizes.concat(group.values);
    else if(group.field==='color')colors=colors.concat(group.values);
    else options=options.concat(group.values);
  });
  return {
    groups:groups,
    sizes:[...new Set(sizes)].join(', '),
    colors:[...new Set(colors)].join(', '),
    options:[...new Set(options)].join(', ')
  };
}
function syncLegacySpecFields(){
  var payload=collectProductSpecPayload();
  setCsvValues('prod-sizes',csvValues(payload.sizes));
  setCsvValues('prod-colors',csvValues(payload.colors));
  setCsvValues('prod-options',csvValues(payload.options));
  return payload;
}
function specChipGroup(id,values){
  var selected=selectedSpecSet(id);
  return '<div class="flex gap-1.5 flex-wrap mt-2">'+values.map(function(v){
    var active=selected.has(String(v).toLowerCase());
    return '<button type="button" class="spec-chip '+(active?'selected':'')+'" onclick="toggleSpecValue(\''+id+'\',\''+jsQuote(v)+'\')">'+esc(v)+'</button>';
  }).join('')+'</div>';
}
function specSelectionPanel(id,label,values,current,placeholder,group){
  var data=group?' data-spec-group-key="'+esc(specKey(group.key))+'" data-spec-group-field="'+esc(group.field||'option')+'" data-spec-group-label="'+esc(group.label||label||'Option')+'"':'';
  return '<div><label class="text-xs text-slate-400 block mb-1">'+esc(label)+'</label>'+
    '<input id="'+id+'" type="hidden" value="'+esc(current||'')+'"'+data+'>'+
    specChipGroup(id,values)+
    '<div class="mt-2"><label class="text-xs text-slate-500 inline-flex items-center gap-1"><input type="checkbox" onchange="toggleCustomSpec(\''+id+'\')" id="'+id+'-custom-toggle"> Custom</label>'+
    '<div id="'+id+'-custom-wrap" class="hidden mt-1 flex gap-1"><input id="'+id+'-custom-input" class="field text-xs" placeholder="'+esc(placeholder||'Type custom option')+'"><button type="button" class="btn btn-ghost text-xs" onclick="addCustomSpecValue(\''+id+'\')">Add</button></div></div>'+
    '<button type="button" class="btn btn-ghost text-[11px] px-2 py-1 mt-2 text-red-300" onclick="clearSpecField(\''+id+'\'); refreshSpecChips()">Clear</button></div>';
}
function refreshSpecChips(){
  var panel=document.getElementById('spec-groups-panel');
  if(!panel)return;
  var current=currentSpecGroupValues();
  var groups=activeSpecGroupsProfile();
  panel.innerHTML=specGroupsPanelHtml(groups,null,null,current);
  syncLegacySpecFields();
}
function toggleSpecValue(id,value){
  var values=csvValues((document.getElementById(id)||{}).value);
  var idx=values.map(function(v){return v.toLowerCase()}).indexOf(String(value).toLowerCase());
  if(idx>=0)values.splice(idx,1);else values.push(value);
  setCsvValues(id,values);
  refreshSpecChips();
  saveProductDraft();
}
function toggleCustomSpec(id){
  var wrap=document.getElementById(id+'-custom-wrap');
  if(wrap)wrap.classList.toggle('hidden',!(document.getElementById(id+'-custom-toggle')||{}).checked);
}
function addCustomSpecValue(id){
  var input=document.getElementById(id+'-custom-input');
  var value=(input&&input.value||'').trim();
  if(!value)return;
  var values=csvValues((document.getElementById(id)||{}).value);
  if(values.map(function(v){return v.toLowerCase()}).indexOf(value.toLowerCase())<0)values.push(value);
  setCsvValues(id,values);
  if(input)input.value='';
  refreshSpecChips();
  saveProductDraft();
}

function bindProductSpecRefresh(){
  ['prod-category-select','prod-subcategory-select','prod-name'].forEach(function(id){
    var el=document.getElementById(id);
    if(el&&!el.dataset.specBound){
      el.dataset.specBound='1';
      el.addEventListener(id==='prod-name'?'input':'change',function(){refreshSpecChips()});
    }
  });
}

// â”€â”€ Product code generator â”€â”€
function generateProductCode(){
  var s=appState||{}, products=s.products||[];
  var sel=document.getElementById('prod-category-select');
  var catVal=sel?sel.value:'GEN';
  var prefix=catVal.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3)||'GEN';
  var existing=products.filter(function(p){return (p.code||'').indexOf(prefix+'-')===0});
  var nums=existing.map(function(p){var n=parseInt((p.code||'').split('-')[1]);return isNaN(n)?0:n});
  var maxNum=nums.length?Math.max.apply(null,nums):0;
  $('prod-code').value=prefix+'-'+String(maxNum+1).padStart(3,'0');
}

// â”€â”€ Status badge helper â”€â”€
function statusBadgeClass(s){return s==='active'?'badge-active':s==='draft'?'badge-pending':s==='hidden'?'badge-suspended':s==='out_of_stock'?'badge-rejected':'badge-pending'}
function stockBadge(qty){return qty>10?'badge-active':qty>0?'badge-pending':'badge-rejected'}
function stockLabel(qty){return qty>10?'In Stock':qty>0?'Low Stock':'Out of Stock'}

// â”€â”€ Products Tab (table + categories + form) â”€â”€
function renderProductsTab(c){
  var s=appState||{}, products=s.products||[];
  var cats=getCategories();
  var selCat=(client||{}).settings?((client||{}).settings.productsCategoryFilter||''):'';
  if(selCat)products=products.filter(function(p){return p.category===selCat});
  var totalProducts=products.length,page=Math.max(1,Math.min(uiPage.products||1,Math.max(1,Math.ceil(totalProducts/uiPageSize)))),start=(page-1)*uiPageSize;
  uiPage.products=page;
  var visibleProducts=products.slice(start,start+uiPageSize);
  c.innerHTML='<div class="space-y-6">'+

  // Header
  '<div class="flex items-center justify-between flex-wrap gap-2">'+
  '<div><h2 class="text-xl font-semibold text-white"><i class="fas fa-box text-sprint-400 mr-2"></i>Products</h2><p class="text-sm text-slate-400 mt-1">'+products.length+' product'+(products.length!==1?'s':'')+'</p></div>'+
  '<div class="flex gap-2"><button type="button" class="btn btn-ghost text-xs" onclick="showProductsTab(\'categories\')"><i class="fas fa-tags"></i> Categories</button><button type="button" class="btn btn-primary text-xs" onclick="showProductForm()"><i class="fas fa-plus"></i> Add Product</button></div></div>'+

  // Category filter chips
  (cats.length?'<div class="flex gap-1 flex-wrap">'+(!selCat?'<span class="badge badge-active cursor-pointer text-xs">All</span>':'<span class="badge badge-pending cursor-pointer text-xs" onclick="filterProductsByCat(\'\')">All</span>')+cats.map(function(cat){return selCat===cat?'<span class="badge badge-active cursor-pointer text-xs">'+esc(cat)+'</span>':'<span class="badge badge-pending cursor-pointer text-xs" onclick="filterProductsByCat(\''+esc(cat)+'\')">'+esc(cat)+'</span>'}).join('')+'</div>':'')+

  // Product form container
  '<div id="product-form-container"></div>'+

  // Product table
  (products.length?renderProductTable(visibleProducts,s)+renderPager('products',page,totalProducts):'<div class="card p-8 text-center"><i class="fas fa-box-open text-3xl text-slate-600 mb-3 block"></i><p class="text-slate-400">No products yet. Click "Add Product" to get started.</p></div>')+

  // Categories section (hidden by default)
  '<div id="products-categories-section" class="hidden"></div>'+

  '</div>';
}

function filterProductsByCat(cat){
  if(client&&client.settings)client.settings.productsCategoryFilter=cat||'';
  uiPage.products=1;
  renderProductsTab(document.getElementById('dashboard-content'));
}

function renderPager(type,page,total){
  if(total<=uiPageSize)return'';
  var pages=Math.ceil(total/uiPageSize),prev=page>1,next=page<pages;
  return'<div class="flex items-center justify-between gap-2 text-xs text-slate-400"><span>Showing '+(((page-1)*uiPageSize)+1)+'-'+Math.min(page*uiPageSize,total)+' of '+total+'</span><div class="flex gap-1"><button class="btn btn-ghost text-xs" '+(prev?'onclick=\'setListPage("'+type+'",'+(page-1)+')\'':'disabled')+'><i class="fas fa-chevron-left"></i></button><span class="px-2 py-1">Page '+page+' / '+pages+'</span><button class="btn btn-ghost text-xs" '+(next?'onclick=\'setListPage("'+type+'",'+(page+1)+')\'':'disabled')+'><i class="fas fa-chevron-right"></i></button></div></div>';
}
function setListPage(type,page){uiPage[type]=page;var c=document.getElementById('dashboard-content');if(type==='products')renderProductsTab(c);else if(type==='orders')renderOrdersTab(c);else if(type==='posts')renderPostCenterTab(c)}

function renderProductTable(products,s){
  var rows=products.map(function(p){
    var img=p.imagePath?'<img src="/uploads/products/'+p.clientId+'/'+p.imagePath.split('/').pop()+'" class="w-16 h-16 rounded object-cover bg-slate-800" onerror="this.style.display=\'none\'">':'<i class="fas fa-image text-slate-600 text-lg"></i>';
    var dateStr=p.createdAt?new Date(p.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'}):'-';
    var status=p.isActive===false?'draft':(p.stockQuantity!=null&&p.stockQuantity<=0?'out_of_stock':'active');
    var telReady=p.code&&p.name&&p.price?'<span class="badge badge-active text-xs" title="Visible to the bot when active">Bot ready</span>':'<span class="badge badge-pending text-xs" title="Add code, name, and price">Needs info</span>';
    var matchesPost=function(post){return post.productId===p.id||String(post.productCode||'').toUpperCase()===String(p.code||'').toUpperCase()};
    var photoCount=Array.isArray(p.images)&&p.images.length?p.images.length:(p.imagePath?1:0);
    var posted=(appState.productPosts||[]).filter(function(post){return post.status==='posted'&&matchesPost(post)}).length;
    var draft=(appState.productPosts||[]).filter(function(post){return post.status!=='posted'&&matchesPost(post)}).sort(function(a,b){return String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||''))})[0];
    var toggleText=p.isActive===false?'Reactivate':'Pause';
    return'<tr class="border-t border-slate-700/50 hover:bg-slate-800/40 transition-colors">'+
    '<td class="py-2 px-2"><div class="w-16 h-16 rounded bg-slate-800 flex items-center justify-center overflow-hidden">'+img+'</div></td>'+
    '<td class="py-2 px-2"><span class="text-white text-sm font-medium">'+esc(p.name||'-')+'</span><span class="text-xs text-slate-500 ml-1 font-mono">'+esc(p.code||'')+'</span>'+(p.featured?'<span class="block mt-1 badge badge-active text-xs w-fit">Featured</span>':'')+(photoCount?'<span class="block mt-1 badge badge-pending text-xs w-fit">'+photoCount+' photo'+(photoCount===1?'':'s')+'</span>':'')+(posted?'<span class="block mt-1 badge badge-active text-xs w-fit">Posted '+posted+'x</span>':(draft?'<span class="block mt-1 badge badge-pending text-xs w-fit">Draft ready</span>':''))+'</td>'+
    '<td class="py-2 px-2"><span class="text-xs text-slate-300">'+esc(p.category||'-')+'</span>'+(p.subcategory?'<span class="block text-[10px] text-slate-500">'+esc(p.subcategory)+'</span>':'')+'</td>'+
    '<td class="py-2 px-2 text-right"><span class="text-sm font-semibold text-white">'+esc(s.currencySymbol||'')+' '+esc(p.price||'0')+'</span></td>'+
    '<td class="py-2 px-2 text-center"><span class="badge '+stockBadge(p.stockQuantity||0)+' text-xs whitespace-nowrap">'+stockLabel(p.stockQuantity||0)+'</span></td>'+
    '<td class="py-2 px-2 text-center"><span class="badge '+statusBadgeClass(status)+' text-xs whitespace-nowrap">'+status.replace(/_/g,' ')+'</span></td>'+
    '<td class="py-2 px-2"><span class="text-xs text-slate-400">'+dateStr+'</span></td>'+
    '<td class="py-2 px-2 text-center">'+telReady+'</td>'+
    '<td class="py-2 px-2"><div class="flex gap-1 flex-wrap"><button onclick="toggleProductActive(\''+p.id+'\','+(p.isActive===false?'true':'false')+')" class="btn btn-ghost text-xs" title="'+toggleText+'"><i class="fas fa-'+(p.isActive===false?'play':'pause')+'"></i></button>'+(draft?'<button onclick="publishPost(\''+draft.id+'\')" class="btn btn-ghost text-xs" title="Post latest draft"><i class="fas fa-paper-plane"></i></button>':'<button onclick="openPostCenterForProduct(\''+p.id+'\')" class="btn btn-ghost text-xs" title="Create post"><i class="fas fa-bullhorn"></i></button>')+'<button onclick="showProductForm(\''+p.id+'\')" class="btn btn-ghost text-xs" title="Edit"><i class="fas fa-edit"></i></button><button onclick="deleteProduct(\''+p.id+'\')" class="btn btn-ghost text-xs text-red-400" title="Delete"><i class="fas fa-trash"></i></button></div></td>'+
    '</tr>'
  }).join('');
  return'<div class="card overflow-x-auto"><table class="w-full text-sm"><thead><tr class="border-b border-slate-700 text-left"><th class="py-2 px-2 text-xs text-slate-400 font-medium w-20">Image</th><th class="py-2 px-2 text-xs text-slate-400 font-medium">Product</th><th class="py-2 px-2 text-xs text-slate-400 font-medium">Category</th><th class="py-2 px-2 text-xs text-slate-400 font-medium text-right">Price</th><th class="py-2 px-2 text-xs text-slate-400 font-medium text-center">Stock</th><th class="py-2 px-2 text-xs text-slate-400 font-medium text-center">Status</th><th class="py-2 px-2 text-xs text-slate-400 font-medium">Date</th><th class="py-2 px-2 text-xs text-slate-400 font-medium text-center">Bot visibility</th><th class="py-2 px-2 text-xs text-slate-400 font-medium w-36">Actions</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}

function openPostCenterForProduct(id){postCenterTab='ready';switchClientTab('posts');setTimeout(function(){var el=document.getElementById('ready-product-'+id);if(el)el.scrollIntoView({behavior:'smooth',block:'center'})},60)}

async function toggleProductActive(id,isActive){
  try{
    await apiFetch('/api/client/products/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({isActive:Boolean(isActive)})});
    await initDashboard();
    showToast(isActive?'Product reactivated.':'Product paused.','success');
    renderProductsTab(document.getElementById('dashboard-content'));
  }catch(err){showToast(err.message,'error')}
}

function postSettings(){
  var cs=(client&&client.settings)||{}, p=cs.productPosting||{};
  return {
    destination:p.destination||cs.telegramChannelLink||cs.productPostDestination||cs.channelUsername||'',
    autoPostEnabled:Boolean(p.autoPostEnabled),
    autoPostWarningAccepted:Boolean(p.autoPostWarningAccepted),
    language:p.language||'mixed',
    style:p.style||'friendly-sales',
    includePrice:p.includePrice!==false,
    includeSizesColors:p.includeSizesColors!==false,
    includeMaterial:Boolean(p.includeMaterial),
    includeAvailability:p.includeAvailability!==false,
    includeHashtags:p.includeHashtags!==false,
    includeOrderInstruction:p.includeOrderInstruction!==false
  };
}

function postProductById(id){return (appState.products||[]).find(function(p){return p.id===id})||null}
function postPreviewImage(product){return product&&product.id?'/api/client/products/'+encodeURIComponent(product.id)+'/image':''}
function productImageUrlFromPath(p,value){value=String(value||'');if(!value)return'';if(/^https?:\/\//i.test(value)||value.indexOf('/uploads/')===0)return value;return'/uploads/products/'+encodeURIComponent(p.clientId||((client||{}).id)||'')+'/'+encodeURIComponent(value.split(/[\\/]/).pop())}
function productGalleryPreviewHtml(p){
  if(!p)return'';
  var imgs=Array.isArray(p.images)?p.images:[];
  if(imgs.length){
    return imgs.slice(0,5).map(function(img,i){return'<div class="relative group rounded-lg border border-slate-200 bg-white p-1"><img class="rounded h-24 w-full object-cover bg-slate-100" src="'+esc(productImageUrlFromPath(p,img.publicPath||img.watermarkedPath||img.originalPath||''))+'"><button type="button" onclick="deleteProductImage(\''+esc(p.id)+'\','+i+')" class="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/95 border border-red-200 text-red-600 shadow-sm hover:bg-red-50" title="Remove this image"><i class="fas fa-times text-xs"></i></button><p class="text-[10px] text-slate-500 mt-1 px-1">Saved image '+(i+1)+'</p></div>'}).join('');
  }
  return p.imagePath?'<img class="rounded h-24 w-full object-cover bg-slate-800 p-1" src="/api/client/products/'+p.id+'/image">':'';
}
function productIsPostable(p){return p&&p.isActive!==false&&(p.status||'active')!=='hidden'&&String(p.availability||'').toLowerCase()!=='out_of_stock'&&Number(p.stockQuantity||1)>0}
function postStatusLabel(status){return status==='posted'?'Posted':status==='failed'?'Needs review':'Draft'}
function postStatusBadge(status){return status==='posted'?'badge-active':status==='failed'?'badge-rejected':'badge-pending'}
function postShort(text,len){text=String(text||'').replace(/\s+/g,' ').trim();return text.length>len?text.slice(0,len-1)+'...':text}
function postGenerationCount(product){
  if(!product)return 0;
  var postCount=(appState.productPosts||[]).filter(function(post){return post.productId===product.id||((post.productCode||'').toUpperCase()===String(product.code||'').toUpperCase()&&product.code)}).length;
  return Math.max(Number(product.postGenerationCount||product.postDraftGenerationCount||0),postCount);
}
function postGenerationRemaining(product){return Math.max(0,2-postGenerationCount(product))}

function renderPostCenterTab(c){
  var settings=postSettings();
  var posts=(appState.productPosts||[]).slice().sort(function(a,b){return String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||''))});
  var products=(appState.products||[]).filter(productIsPostable).sort(function(a,b){return String(b.createdAt||'').localeCompare(String(a.createdAt||''))});
  var drafts=posts.filter(function(p){return p.status!=='posted'});
  var posted=posts.filter(function(p){return p.status==='posted'});
  var tabs=[['ready','Ready to Post',products.length],['drafts','Drafts',drafts.length],['posted','Posted',posted.length]];
  c.innerHTML='<div class="space-y-6">'+
  '<div class="flex items-start justify-between flex-wrap gap-3">'+
  '<div><h2 class="text-xl font-semibold text-white"><i class="fas fa-bullhorn text-sprint-400 mr-2"></i>Post Center</h2><p class="text-sm text-slate-400 mt-1">Create, review, and publish product posts without duplicating your product work.</p></div>'+
  '<button type="button" class="btn btn-ghost text-xs" onclick="switchClientTab(\'products\')"><i class="fas fa-box"></i> Back to Products</button>'+
  '</div>'+
  renderPostSettings(settings)+
  '<div class="card p-4">'+
  '<div class="flex gap-2 flex-wrap mb-4">'+tabs.map(function(t){return'<button type="button" class="btn '+(postCenterTab===t[0]?'btn-primary':'btn-ghost')+' text-xs" onclick="setPostCenterTab(\''+t[0]+'\')">'+esc(t[1])+' <span class="badge badge-pending ml-1">'+t[2]+'</span></button>'}).join('')+'</div>'+
  renderPostCenterList(products,drafts,posted)+
  '</div>'+
  '</div>';
}

function renderPostSettings(settings){
  function opt(value,label,selected){return'<option value="'+value+'"'+(selected===value?' selected':'')+'>'+label+'</option>'}
  function check(id,label,checked,tip){return'<label class="flex items-start gap-2 text-xs text-slate-300"><input id="'+id+'" type="checkbox" class="mt-0.5"'+(checked?' checked':'')+'><span><strong class="font-medium text-slate-200">'+label+'</strong>'+(tip?'<small class="block text-slate-500 mt-0.5">'+tip+'</small>':'')+'</span></label>'}
  return'<form id="post-settings-form" class="card p-5 space-y-4" onsubmit="savePostSettings(event)">'+
  '<div class="flex items-center justify-between gap-2 flex-wrap"><div><h3 class="text-sm font-semibold text-white"><i class="fas fa-sliders-h text-sprint-400 mr-2"></i>Posting Settings</h3><p class="text-xs text-slate-500 mt-1">Captions now polish the product description you wrote and combine it with saved product facts.</p></div><button type="button" class="btn btn-ghost text-xs" onclick="testPostDestination()"><i class="fas fa-paper-plane"></i> Test Destination</button></div>'+
  '<div class="grid grid-cols-1 md:grid-cols-3 gap-3">'+
  '<div><label class="text-xs text-slate-400 block mb-1">Telegram channel/group</label><input id="post-destination" class="field" value="'+esc(settings.destination)+'" placeholder="@YourChannel or chat ID"><p class="text-xs text-slate-500 mt-0.5">Where public product posts will be sent.</p></div>'+
  '<div><label class="text-xs text-slate-400 block mb-1">Caption language</label><select id="post-language" class="field">'+opt('mixed','Amharic + English',''+settings.language)+opt('english','English',''+settings.language)+opt('amharic','Amharic',''+settings.language)+'</select></div>'+
  '<div><label class="text-xs text-slate-400 block mb-1">Caption style</label><select id="post-style" class="field">'+opt('friendly-sales','Friendly sales',''+settings.style)+opt('simple','Simple',''+settings.style)+opt('luxury','Premium',''+settings.style)+opt('urgent','Promo/urgent',''+settings.style)+'</select></div>'+
  '</div>'+
  '<div class="grid grid-cols-1 md:grid-cols-3 gap-3">'+
  check('post-include-price','Include price',settings.includePrice,'Uses the product price from the catalog.')+
  check('post-include-options','Include sizes/colors',settings.includeSizesColors,'Useful for clothes, shoes, and variant products.')+
  check('post-include-availability','Include availability',settings.includeAvailability,'Mentions stock or availability when helpful.')+
  check('post-include-material','Include material',settings.includeMaterial,'Only when product material is known.')+
  check('post-include-hashtags','Include hashtags',settings.includeHashtags,'Short Telegram/social tags.')+
  check('post-include-order','Include order instruction',settings.includeOrderInstruction,'Tells shoppers to order by product code.')+
  '</div>'+
  '<div class="rounded-lg border border-blue-300/30 bg-blue-50 text-blue-950 p-3 text-xs"><i class="fas fa-pen-nib mr-1"></i>Tip: write a simple honest product description first. SprintSales will improve the wording, add selected facts like price/options, and avoid inventing unsupported claims.</div>'+
  '<div class="rounded-lg border border-amber-300/30 bg-amber-50 text-amber-900 p-3">'+
  '<label class="flex items-start gap-2 text-xs"><input id="post-auto-enabled" type="checkbox" class="mt-0.5"'+(settings.autoPostEnabled?' checked':'')+'><span><strong>Auto-post new products</strong><small class="block mt-0.5">Manual review is safer for version 1. Turn this on only when your destination and caption style are tested.</small></span></label>'+
  '<label class="flex items-start gap-2 text-xs mt-2"><input id="post-auto-accepted" type="checkbox" class="mt-0.5"'+(settings.autoPostWarningAccepted?' checked':'')+'><span>I understand new products can be posted automatically when auto-post is enabled.</span></label>'+
  '</div>'+
  '<div class="flex gap-2"><button type="submit" class="btn btn-primary text-xs"><i class="fas fa-save"></i> Save Settings</button><button type="button" class="btn btn-ghost text-xs" onclick="setPostCenterTab(\'ready\')"><i class="fas fa-list"></i> Review Products</button></div>'+
  '</form>';
}

function renderPostCenterList(products,drafts,posted){
  var list=postCenterTab==='posted'?posted:(postCenterTab==='drafts'?drafts:products);
  var total=list.length,page=Math.max(1,Math.min(uiPage.posts||1,Math.max(1,Math.ceil(total/uiPageSize)))),start=(page-1)*uiPageSize;
  uiPage.posts=page;
  var visible=list.slice(start,start+uiPageSize);
  if(postCenterTab==='ready'){
    if(!visible.length)return'<div class="p-8 text-center text-slate-500"><i class="fas fa-box-open text-3xl mb-3 block"></i>No active products are ready for posting yet.</div>';
    return'<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">'+visible.map(renderReadyPostProduct).join('')+'</div>'+renderPager('posts',page,total);
  }
  if(!visible.length)return'<div class="p-8 text-center text-slate-500"><i class="fas fa-file-alt text-3xl mb-3 block"></i>No '+(postCenterTab==='posted'?'posted items':'drafts')+' yet.</div>';
  return'<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">'+visible.map(renderPostDraftCard).join('')+'</div>'+renderPager('posts',page,total);
}

function renderReadyPostProduct(product){
  var latest=(appState.productPosts||[]).filter(function(p){return p.productId===product.id}).sort(function(a,b){return String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||''))})[0];
  var caption=product.salesPostCaption||product.description||'Caption will be generated from this product details.';
  var remaining=postGenerationRemaining(product), generated=postGenerationCount(product);
  return'<div id="ready-product-'+esc(product.id)+'" class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">'+
  '<div class="flex gap-3">'+
  '<div class="w-24 h-24 rounded-lg bg-slate-100 overflow-hidden flex-shrink-0">'+(postPreviewImage(product)?'<img src="'+postPreviewImage(product)+'" class="w-full h-full object-cover" onerror="this.parentNode.innerHTML=\'<div class=&quot;w-full h-full flex items-center justify-center text-slate-400&quot;><i class=&quot;fas fa-image&quot;></i></div>\'">':'<div class="w-full h-full flex items-center justify-center text-slate-400"><i class="fas fa-image"></i></div>')+'</div>'+
  '<div class="min-w-0 flex-1"><div class="flex items-start justify-between gap-2"><div><h4 class="text-sm font-semibold text-slate-900">'+esc(product.name||'Product')+'</h4><p class="text-xs text-slate-500 font-mono">'+esc(product.code||'No code')+'</p></div>'+(latest?'<span class="badge '+postStatusBadge(latest.status)+' text-xs">'+postStatusLabel(latest.status)+'</span>':'')+'</div>'+
  '<p class="text-xs text-slate-500 mt-1">'+esc(product.category||'Uncategorized')+(product.subcategory?' / '+esc(product.subcategory):'')+'</p>'+
  '<p class="text-sm font-semibold text-slate-900 mt-2">'+esc(appState.currencySymbol||'ETB')+' '+esc(product.price||'0')+'</p>'+
  '<p class="text-xs text-slate-600 mt-2">'+esc(postShort(caption,140))+'</p><p class="text-[11px] text-slate-500 mt-2">Draft generations: '+generated+' / 2'+(remaining?' - '+remaining+' left':' - limit reached')+'</p></div></div>'+
  '<div class="flex gap-2 mt-3"><button type="button" class="btn btn-primary text-xs" '+(remaining?'onclick="generateProductPost(\''+esc(product.id)+'\')"':'disabled')+'><i class="fas fa-wand-magic-sparkles"></i> '+(generated?'Generate Another':'Create Draft')+'</button>'+(latest&&latest.status!=='posted'?'<button type="button" class="btn btn-ghost text-xs" onclick="postCenterTab=\'drafts\';renderPostCenterTab(document.getElementById(\'dashboard-content\'))"><i class="fas fa-edit"></i> Open Draft</button>':'')+'</div>'+
  '</div>';
}

function renderPostDraftCard(post){
  var product=postProductById(post.productId)||{name:post.productName,code:post.productCode};
  var destination=post.destination||postSettings().destination||'';
  var disabled=post.status==='posted';
  var remaining=postGenerationRemaining(product);
  return'<div class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">'+
  '<div class="flex gap-3 mb-3">'+
  '<div class="w-20 h-20 rounded-lg bg-slate-100 overflow-hidden flex-shrink-0">'+(product&&product.id?'<img src="'+postPreviewImage(product)+'" class="w-full h-full object-cover" onerror="this.style.display=\'none\'">':'<div class="w-full h-full flex items-center justify-center text-slate-400"><i class="fas fa-image"></i></div>')+'</div>'+
  '<div class="min-w-0 flex-1"><div class="flex items-start justify-between gap-2"><div><h4 class="text-sm font-semibold text-slate-900">'+esc(post.productName||product.name||'Product post')+'</h4><p class="text-xs text-slate-500 font-mono">'+esc(post.productCode||product.code||'')+'</p></div><span class="badge '+postStatusBadge(post.status)+' text-xs">'+postStatusLabel(post.status)+'</span></div>'+
  '<p class="text-xs text-slate-500 mt-1">'+(post.postedAt?'Posted '+new Date(post.postedAt).toLocaleString():'Updated '+(post.updatedAt?new Date(post.updatedAt).toLocaleString():'recently'))+'</p>'+
  (post.error?'<p class="text-xs text-red-600 mt-1"><i class="fas fa-exclamation-circle"></i> '+esc(post.error)+'</p>':'')+'</div></div>'+
  '<label class="text-xs text-slate-500 block mb-1">Caption</label>'+
  '<textarea id="post-caption-'+esc(post.id)+'" class="field bg-slate-50 text-slate-900 border-slate-200" rows="5"'+(disabled?' disabled':'')+'>'+esc(post.caption||'')+'</textarea>'+
  '<label class="text-xs text-slate-500 block mt-3 mb-1">Destination</label>'+
  '<input id="post-destination-'+esc(post.id)+'" class="field bg-slate-50 text-slate-900 border-slate-200" value="'+esc(destination)+'"'+(disabled?' disabled':'')+'>'+
  '<div class="flex gap-2 flex-wrap mt-3">'+
  (disabled?'<button type="button" class="btn btn-ghost text-xs" '+(remaining?'onclick="generateProductPost(\''+esc(post.productId)+'\')"':'disabled')+'><i class="fas fa-copy"></i> New Draft</button>':'<button type="button" class="btn btn-ghost text-xs" onclick="savePostDraft(\''+esc(post.id)+'\')"><i class="fas fa-save"></i> Save Draft</button><button type="button" class="btn btn-primary text-xs" onclick="publishPost(\''+esc(post.id)+'\')"><i class="fas fa-paper-plane"></i> Post Now</button><button type="button" class="btn btn-ghost text-xs" '+(remaining?'onclick="generateProductPost(\''+esc(post.productId)+'\')"':'disabled')+'><i class="fas fa-rotate"></i> Regenerate</button><button type="button" class="btn btn-ghost text-xs text-red-500" onclick="deletePostDraft(\''+esc(post.id)+'\')"><i class="fas fa-trash"></i> Delete</button>')+
  '</div><p class="text-[11px] text-slate-500 mt-2">'+(remaining?'You can generate '+remaining+' more draft'+(remaining===1?'':'s')+' for this product.':'Draft generation limit reached for this product. Edit one of the saved drafts.')+'</p></div>';
}

function setPostCenterTab(tab){postCenterTab=tab;uiPage.posts=1;renderPostCenterTab(document.getElementById('dashboard-content'))}

function collectPostSettings(){
  return {
    destination:($('post-destination')||{}).value||'',
    language:($('post-language')||{}).value||'mixed',
    style:($('post-style')||{}).value||'friendly-sales',
    includePrice:Boolean(($('post-include-price')||{}).checked),
    includeSizesColors:Boolean(($('post-include-options')||{}).checked),
    includeMaterial:Boolean(($('post-include-material')||{}).checked),
    includeAvailability:Boolean(($('post-include-availability')||{}).checked),
    includeHashtags:Boolean(($('post-include-hashtags')||{}).checked),
    includeOrderInstruction:Boolean(($('post-include-order')||{}).checked),
    autoPostEnabled:Boolean(($('post-auto-enabled')||{}).checked),
    autoPostWarningAccepted:Boolean(($('post-auto-accepted')||{}).checked)
  };
}

async function savePostSettings(event){
  if(event)event.preventDefault();
  await apiFetch('/api/client/product-posting/settings',{method:'PUT',body:JSON.stringify(collectPostSettings())});
  await initDashboard();
  showToast('Posting settings saved.','success');
  renderPostCenterTab(document.getElementById('dashboard-content'));
}

async function testPostDestination(){
  var destination=(($('post-destination')||{}).value||postSettings().destination||'').trim();
  if(!destination){showToast('Add a Telegram destination first.','error');return}
  await apiFetch('/api/client/product-posting/test',{method:'POST',body:JSON.stringify({destination:destination})});
  showToast('Test post sent.','success');
}

async function generateProductPost(productId){
  await apiFetch('/api/client/products/'+encodeURIComponent(productId)+'/post/generate',{method:'POST',body:JSON.stringify(collectPostSettings())});
  await initDashboard();
  postCenterTab='drafts';
  showToast('Draft created. Review it before posting.','success');
  renderPostCenterTab(document.getElementById('dashboard-content'));
}

async function savePostDraft(postId){
  var caption=(($('post-caption-'+postId)||{}).value||'').trim();
  var destination=(($('post-destination-'+postId)||{}).value||'').trim();
  await apiFetch('/api/client/product-posts/'+encodeURIComponent(postId),{method:'PATCH',body:JSON.stringify({caption:caption,destination:destination})});
  await initDashboard();
  showToast('Draft saved.','success');
  renderPostCenterTab(document.getElementById('dashboard-content'));
}

async function publishPost(postId){
  var caption=(($('post-caption-'+postId)||{}).value||'').trim();
  var destination=(($('post-destination-'+postId)||{}).value||'').trim();
  if(!destination){showToast('Add a Telegram destination before posting.','error');return}
  await apiFetch('/api/client/product-posts/'+encodeURIComponent(postId)+'/post',{method:'POST',body:JSON.stringify({caption:caption,destination:destination})});
  await initDashboard();
  postCenterTab='posted';
  showToast('Product post sent.','success');
  renderPostCenterTab(document.getElementById('dashboard-content'));
}

async function deletePostDraft(postId){
  if(!await confirmNice('Delete post draft?','This removes only the saved draft, not the product.',{icon:'trash',okText:'Delete'}))return;
  await apiFetch('/api/client/product-posts/'+encodeURIComponent(postId),{method:'DELETE'});
  await initDashboard();
  showToast('Draft deleted.','success');
  renderPostCenterTab(document.getElementById('dashboard-content'));
}

// â”€â”€ Product Form (ALWAYS full fields) â”€â”€
function showProductForm(editId){
  var container=document.getElementById('product-form-container');
  var p=editId?(appState.products||[]).find(function(pr){return pr.id===editId}):null;
  var draft=!editId?restoreProductDraft():null;
  var cats=getCategories();
  if(cats.length===0){showToast('Add product categories first in the Categories tab.','info');return}
  var initialCategory=p?p.category||'':((draft&&draft['prod-category-select'])||((client&&client.settings&&client.settings.productsCategoryFilter)||''));
  var initialSubcategory=p?p.subcategory||p.selectedSubcategory||'':((draft&&draft['prod-subcategory-select'])||'');
  var catOptions='<option value="">Select Category</option>'+cats.map(function(c){return'<option value="'+esc(c)+'"'+(initialCategory===c?' selected':'')+'>'+esc(c)+'</option>'}).join('');
  var subOptions=renderSubcategoryOptions(initialCategory,initialSubcategory);
  var statusVal=p?(p.isActive===false?'draft':(p.stockQuantity!=null&&p.stockQuantity<=0?'out_of_stock':'active')):((draft&&draft['prod-status'])||'active');
  var specGroups=productSpecGroupsProfile(initialCategory,initialSubcategory,p?p.name:((draft&&draft['prod-name'])||''));
  var showCakePayment=clientIsCakeBusiness((client||{}).settings||{})||/cake|bakery|pastry|dessert/i.test([initialCategory,initialSubcategory].join(' '));
  container.innerHTML=
  '<div class="card p-6 mb-6">'+
  '<h3 class="text-white font-semibold mb-4">'+(p?'Edit Product':'New Product')+'</h3>'+
  '<form id="product-form" enctype="multipart/form-data" class="space-y-4">'+

  // Row 1: Code + Name
  '<div class="grid grid-cols-1 md:grid-cols-3 gap-3">'+
  '<div><label class="text-xs text-slate-400 block mb-1">Product Code *</label><div class="flex gap-1"><input id="prod-code" class="field flex-1" value="'+esc(p?p.code||'':(draft&&draft['prod-code'])||'')+'" placeholder="ELEC-001" required><button type="button" class="btn btn-ghost text-xs px-2" onclick="generateProductCode()" title="Auto-generate"><i class="fas fa-magic"></i></button></div><p class="text-xs text-slate-500 mt-0.5">Auto: select category first</p></div>'+
  '<div class="md:col-span-2"><label class="text-xs text-slate-400 block mb-1">Product Name *</label><input id="prod-name" class="field" value="'+esc(p?p.name:(draft&&draft['prod-name'])||'')+'" required></div>'+
  '</div>'+

  // Row 2: Category + Price + Cost Price
  '<div class="grid grid-cols-1 md:grid-cols-4 gap-3">'+
  '<div><label class="text-xs text-slate-400 block mb-1">Category</label><select id="prod-category-select" class="field" onchange="updateProductSubcategories()">'+catOptions+'</select></div>'+
  '<div><label class="text-xs text-slate-400 block mb-1">Subcategory</label><select id="prod-subcategory-select" class="field" onchange="refreshSpecChips()">'+subOptions+'</select></div>'+
  '<div><label class="text-xs text-slate-400 block mb-1">Price (ETB) *</label><input id="prod-price" class="field" type="number" min="0" step="0.01" value="'+esc(p?p.price||'':(draft&&draft['prod-price'])||'')+'" required></div>'+
  '<div><label class="text-xs text-slate-400 block mb-1">Cost Price (ETB)</label><input id="prod-cost-price" class="field" type="number" min="0" step="0.01" value="'+esc(p?p.costPrice||'':(draft&&draft['prod-cost-price'])||'')+'"></div>'+
  '</div>'+

  // Row 3: Stock Quantity + Stock Status + Product Status
  '<div class="grid grid-cols-1 md:grid-cols-3 gap-3">'+
  '<div><label class="text-xs text-slate-400 block mb-1">Stock Quantity</label><input id="prod-stock" class="field" type="number" min="0" value="'+esc(p?p.stockQuantity||0:(draft&&draft['prod-stock'])||0)+'"></div>'+
  '<div><label class="text-xs text-slate-400 block mb-1">Stock Status</label><input id="prod-stock-status" class="field bg-slate-700 text-slate-300" readonly value="'+stockLabel(p?p.stockQuantity||0:0)+'"></div>'+
  '<div><label class="text-xs text-slate-400 block mb-1">Product Status</label><select id="prod-status" class="field">'+
  ['active','draft','hidden','out_of_stock'].map(function(s){return'<option value="'+s+'"'+(statusVal===s?' selected':'')+'>'+s.replace(/_/g,' ').replace(/\b\w/g,function(l){return l.toUpperCase()})+'</option>'}).join('')+
  '</select><p class="text-xs text-slate-500 mt-0.5">Active = visible to customers</p></div>'+
  '</div>'+

  '<label class="flex items-center gap-2 rounded-lg border border-slate-700 p-3 text-sm text-white bg-slate-900/40"><input id="prod-featured" type="checkbox" '+((p&&p.featured)||(draft&&draft['prod-featured']==='true')?'checked':'')+'> Feature this product on the online shop homepage <span class="text-xs text-slate-500">Use only for best sellers or products you want customers to notice first.</span></label>'+

  // Row 4: Description
  '<div><label class="text-xs text-slate-400 block mb-1">Description</label><textarea id="prod-desc" class="field" rows="3">'+esc(p?p.description||'':(draft&&draft['prod-desc'])||'')+'</textarea></div>'+

  // Row 5: Image upload + URL
  '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">'+
  '<div><label class="text-xs text-slate-400 block mb-1">Product Images (up to 5)</label>'+
  '<div class="grid grid-cols-1 sm:grid-cols-5 gap-2">'+[0,1,2,3,4].map(function(i){return'<label class="image-slot"><input type="file" id="prod-image-file-'+i+'" accept="image/*" onchange="previewProductImage()" class="hidden"><span class="image-slot-box"><i class="fas fa-image"></i><strong>Image '+(i+1)+'</strong><small>'+(i===0?'Main photo':'Optional')+'</small></span></label>'}).join('')+'</div>'+
  '<p class="text-xs text-slate-500 mt-1">'+(p?'Add more photos without removing saved ones. Max 5 total.':'Choose up to 5 product photos. All uploaded images are watermarked locally.')+'</p>'+
  '<div id="prod-image-previews" class="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-2">'+productGalleryPreviewHtml(p)+'</div></div>'+
  '<div><label class="text-xs text-slate-400 block mb-1">Image URL (alternative)</label><input id="prod-image-url" class="field" value="'+esc(p&&p.imageUrl?p.imageUrl:'')+'" placeholder="https://..."><p class="text-xs text-slate-500 mt-0.5">Or paste an image URL</p></div>'+
  '</div>'+

  // Row 6: Product-specific options
  '<div id="spec-groups-panel" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">'+
  specGroupsPanelHtml(specGroups,p,draft,{})+
  '</div>'+

  '<div class="rounded-lg border border-slate-700 p-3"><p class="text-sm font-semibold text-white mb-2"><i class="fas fa-tag text-sprint-400 mr-2"></i>Discount eligibility</p><div class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-slate-300">'+
  '<label class="flex items-center gap-2"><input id="prod-disc-new" type="checkbox" '+((!p||(p.discounts||{}).newBuyer!==false)?'checked':'')+'> New buyer discount can apply</label>'+
  '<label class="flex items-center gap-2"><input id="prod-disc-repeat" type="checkbox" '+((!p||(p.discounts||{}).repeatBuyer!==false)?'checked':'')+'> Loyal buyer discount can apply</label>'+
  '<label class="flex items-center gap-2"><input id="prod-disc-birthday" type="checkbox" '+((!p||(p.discounts||{}).birthdayWeek!==false)?'checked':'')+'> Birthday discount can apply</label>'+
  '<label class="flex items-center gap-2"><input id="prod-disc-sales" type="checkbox" '+((!p||(p.discounts||{}).sales!==false)?'checked':'')+'> Sales discount can apply</label>'+
  '<label class="flex items-center gap-2"><input id="prod-disc-holiday" type="checkbox" '+((!p||(p.discounts||{}).holiday!==false)?'checked':'')+'> Holiday discount can apply</label>'+
  '<label class="flex items-center gap-2"><input id="prod-disc-promo" type="checkbox" '+((!p||(p.discounts||{}).promoCodes!==false)?'checked':'')+'> Promo codes can apply</label>'+
  '<label class="flex items-center gap-2"><input id="prod-exclude-discounts" type="checkbox" '+(p&&p.excludeFromDiscounts?'checked':'')+'> Exclude from all automatic discounts</label>'+
  '</div><p class="text-xs text-slate-500 mt-2">Global discount percentages are managed in the Discounts section.</p></div>'+

  (showCakePayment?cakeProductPaymentPanel(p,draft):'')+

  // Actions
  '<div class="flex gap-2 pt-2"><button type="button" class="btn btn-primary text-xs" onclick="saveProduct(\''+(p?p.id:'')+'\')"><i class="fas fa-save"></i> Save Product</button><button type="button" class="btn btn-ghost text-xs" onclick="document.getElementById(\'product-form-container\').innerHTML=\'\'">Cancel</button></div>'+

  '</form></div>';

  // Update stock status when quantity changes
  var stockInput=document.getElementById('prod-stock');
  if(stockInput)stockInput.oninput=function(){document.getElementById('prod-stock-status').value=stockLabel(parseInt(this.value)||0)};
  bindProductSpecRefresh();
  bindProductDraft();
  refreshSpecChips();
}

function cakeProductPaymentPanel(p,draft){
  var s=p?(p.cakePaymentSettings||p.cakeOrderSettings||{}):{};
  var mode=(p?s.paymentMode:((draft&&draft['prod-cake-payment-mode'])||'default'))||'default';
  var type=(p?s.depositType:((draft&&draft['prod-cake-deposit-type'])||'percent'))||'percent';
  var value=p?(s.depositValue||''):((draft&&draft['prod-cake-deposit-value'])||'');
  return '<div class="rounded-lg border border-pink-400/25 bg-pink-500/5 p-3">'+
    '<p class="text-sm font-semibold text-white mb-1"><i class="fas fa-cake-candles text-pink-300 mr-2"></i>Cake payment rule</p>'+
    '<p class="text-xs text-slate-500 mb-3">Choose how much this cake requires before preparation. Leave default to use the shop-wide Payment Settings rule.</p>'+
    '<div class="grid grid-cols-1 md:grid-cols-3 gap-3">'+
      '<div><label class="text-xs text-slate-400 block mb-1">Payment rule for this cake</label><select id="prod-cake-payment-mode" class="field">'+
        '<option value="default"'+(mode==='default'?' selected':'')+'>Use shop default</option>'+
        '<option value="full"'+(mode==='full'?' selected':'')+'>Full payment first</option>'+
        '<option value="deposit"'+(mode==='deposit'?' selected':'')+'>Kabd / advance first</option>'+
        '<option value="delivery"'+(mode==='delivery'?' selected':'')+'>Full payment on delivery/pickup</option>'+
      '</select></div>'+
      '<div><label class="text-xs text-slate-400 block mb-1">Kabd type</label><select id="prod-cake-deposit-type" class="field"><option value="percent"'+(type!=='fixed'?' selected':'')+'>Percent</option><option value="fixed"'+(type==='fixed'?' selected':'')+'>Fixed Birr</option></select></div>'+
      '<div><label class="text-xs text-slate-400 block mb-1">Kabd value</label><input id="prod-cake-deposit-value" class="field" type="number" min="0" max="999999" value="'+esc(value)+'" placeholder="30"></div>'+
    '</div>'+
    '<p class="text-xs text-slate-500 mt-2">Example: choose Kabd + Percent + 30 to ask 30% now and collect the rest later.</p>'+
  '</div>';
}

function previewProductImage(){
  var files=[0,1,2,3,4].map(function(i){var input=document.getElementById('prod-image-file-'+i);return input&&input.files&&input.files[0]?input.files[0]:null}).filter(Boolean);
  var wrap=document.getElementById('prod-image-previews');
  if(!wrap)return;
  wrap.innerHTML='';
  files.forEach(function(file,idx){
    var box=document.createElement('div');
    box.className='relative';
    box.innerHTML='<div class="h-24 rounded bg-slate-800 animate-pulse"></div><p class="text-[10px] text-slate-500 mt-1">Image '+(idx+1)+'</p>';
    wrap.appendChild(box);
    var reader=new FileReader();
    reader.onload=function(e){box.innerHTML='<img class="rounded h-24 w-full object-cover bg-slate-800 p-1" src="'+e.target.result+'"><p class="text-[10px] text-slate-500 mt-1">Image '+(idx+1)+'</p>'};
    reader.readAsDataURL(file);
  });
}

// â”€â”€ Save Product (FormData for image upload) â”€â”€
function collectProductDraft(){
  var ids=['prod-code','prod-name','prod-category-select','prod-subcategory-select','prod-price','prod-cost-price','prod-stock','prod-status','prod-desc','prod-sizes','prod-colors','prod-options'];
  var draft={};
  ids.forEach(function(id){var el=document.getElementById(id);if(el)draft[id]=el.value});
  var featured=document.getElementById('prod-featured');if(featured)draft['prod-featured']=String(Boolean(featured.checked));
  var payload=collectProductSpecPayload();
  draft['prod-spec-groups']=JSON.stringify(payload.groups);
  return draft;
}
function saveProductDraft(){
  if(!document.getElementById('product-form'))return;
  try{localStorage.setItem(productDraftKey,JSON.stringify(collectProductDraft()))}catch(_e){}
}
function restoreProductDraft(){
  try{var raw=localStorage.getItem(productDraftKey);return raw?JSON.parse(raw):null}catch(_e){return null}
}
function bindProductDraft(){
  var form=document.getElementById('product-form');if(!form||form.dataset.draftBound)return;
  form.dataset.draftBound='1';
  form.addEventListener('input',saveProductDraft);
  form.addEventListener('change',saveProductDraft);
}

async function saveProduct(id){
  var fd=new FormData();
  fd.append('code',(document.getElementById('prod-code').value||'').trim().toUpperCase());
  fd.append('name',document.getElementById('prod-name').value.trim());
  fd.append('category',(document.getElementById('prod-category-select')||{}).value||'');
  fd.append('subcategory',(document.getElementById('prod-subcategory-select')||{}).value||'');
  fd.append('price',String(Number(document.getElementById('prod-price').value)||0));
  fd.append('costPrice',String(Number(document.getElementById('prod-cost-price').value)||0));
  fd.append('stockQuantity',String(Math.max(0,Number(document.getElementById('prod-stock').value)||0)));
  var specs=collectProductSpecPayload();
  fd.append('sizes',specs.sizes);
  fd.append('colors',specs.colors);
  fd.append('options',specs.options);
  fd.append('specGroups',JSON.stringify(specs.groups));
  fd.append('description',document.getElementById('prod-desc').value.trim());
  fd.append('featured',String(Boolean((document.getElementById('prod-featured')||{}).checked)));
  fd.append('discountNewBuyer',String(Boolean((document.getElementById('prod-disc-new')||{}).checked)));
  fd.append('discountRepeatBuyer',String(Boolean((document.getElementById('prod-disc-repeat')||{}).checked)));
  fd.append('discountBirthdayWeek',String(Boolean((document.getElementById('prod-disc-birthday')||{}).checked)));
  fd.append('discountSales',String(Boolean((document.getElementById('prod-disc-sales')||{}).checked)));
  fd.append('discountHoliday',String(Boolean((document.getElementById('prod-disc-holiday')||{}).checked)));
  fd.append('discountPromoCodes',String(Boolean((document.getElementById('prod-disc-promo')||{}).checked)));
  fd.append('excludeFromDiscounts',String(Boolean((document.getElementById('prod-exclude-discounts')||{}).checked)));
  if(document.getElementById('prod-cake-payment-mode')){
    fd.append('cakePaymentMode',(document.getElementById('prod-cake-payment-mode').value||'default'));
    fd.append('cakeDepositType',(document.getElementById('prod-cake-deposit-type').value||'percent'));
    fd.append('cakeDepositValue',String(Math.max(0,Number((document.getElementById('prod-cake-deposit-value')||{}).value)||0)));
  }

  var statusVal=document.getElementById('prod-status').value;
  fd.append('status',statusVal);
  if(statusVal==='draft')fd.append('isActive','false');
  else fd.append('isActive','true');

  var imgFiles=[0,1,2,3,4].map(function(i){var input=document.getElementById('prod-image-file-'+i);return input&&input.files&&input.files[0]?input.files[0]:null}).filter(Boolean).slice(0,5);
  imgFiles.forEach(function(file){fd.append('images',file)});

  if(!fd.get('code')&&$('prod-code')){
    generateProductCode();
    fd.set('code',$('prod-code').value);
  }
  if(!fd.get('code')||!fd.get('name')){showToast('Product name is required.','error');return}

  try{
    var method=id?'PUT':'POST';
    var url='/api/client/products'+(id?'/'+id:'');
    await apiFetch(url,{method:method,body:fd});
    showToast(id?'Product updated!':'Product added!','success');
    try{localStorage.removeItem(productDraftKey)}catch(_e){}
    document.getElementById('product-form-container').innerHTML='';
    await initDashboard();
    renderProductsTab(document.getElementById('dashboard-content'));
  }catch(err){showToast(err.message,'error')}
}

function editProduct(id){showProductForm(id)}

async function deleteProduct(id){
  if(!await confirmNice('Delete product?','This permanently removes the product and its linked post drafts. Existing orders are kept.',{icon:'trash',okText:'Delete product'}))return;
  try{await apiFetch('/api/client/products/'+id,{method:'DELETE'});showToast('Product deleted.','info');await initDashboard();renderProductsTab(document.getElementById('dashboard-content'))}catch(e){showToast(e.message,'error')}
}

// â”€â”€ Categories (inside Products tab) â”€â”€
async function deleteProductImage(productId,index){
  if(!await confirmNice('Remove this photo?','The product will keep its other saved photos. You can upload another one after removing this.',{icon:'image',okText:'Remove photo'}))return;
  try{
    await apiFetch('/api/client/products/'+encodeURIComponent(productId)+'/images/'+index,{method:'DELETE'});
    await initDashboard();
    showToast('Product photo removed.','success');
    renderProductsTab(document.getElementById('dashboard-content'));
    setTimeout(function(){showProductForm(productId)},50);
  }catch(e){showToast(e.message,'error')}
}

function showProductsTab(section){
  if(section==='categories'){
    renderCategoriesPage(document.getElementById('dashboard-content'));
  }
}

function renderCategoriesPage(c){
  c.innerHTML='<div class="space-y-6"><div class="flex items-center justify-between flex-wrap gap-2"><div><h2 class="text-xl font-semibold text-white"><i class="fas fa-tags text-sprint-400 mr-2"></i>Product Categories</h2><p class="text-sm text-slate-400 mt-1">Manage the category list shoppers and product uploads use.</p></div><button type="button" class="btn btn-ghost text-xs" onclick="switchClientTab(\'products\')"><i class="fas fa-arrow-left"></i> Back to Products</button></div><div id="products-categories-section"></div></div>';
  renderCategoriesSection();
}

function renderCategoriesSection(){
  var c=document.getElementById('products-categories-section');
  var cats=getCategories();
  var cakeIconLabels=[].concat(cats);
  getCategoryTemplates().forEach(function(template){
    (template.subcategories||[]).forEach(function(sub){if(cakeIconLabels.indexOf(sub)<0)cakeIconLabels.push(sub)});
  });
  var cl=client||{}, bp=(cl.settings||{}).businessProfile||{};
  var bt=bp.retailType||bp.businessType||cl.businessTypeLabel||'retail';
  c.classList.remove('hidden');
  c.innerHTML='<div class="card p-6 mt-6"><div class="flex items-center justify-between flex-wrap gap-2 mb-4"><h3 class="text-white font-semibold"><i class="fas fa-tags text-sprint-400 mr-2"></i>Manage Categories</h3><div class="flex gap-2 flex-wrap">'+
  '<span class="text-xs text-slate-400 self-center">Type: <strong class="text-white capitalize">'+esc(bt)+'</strong></span>'+
  '<button class="btn btn-ghost text-xs" onclick="resetToDefaultCategories()" title="Add missing business-type categories"><i class="fas fa-plus-circle"></i> Add Missing</button>'+
  '<button class="btn btn-warning text-xs" onclick="replaceWithBusinessCategories()" title="Replace all with business-type defaults"><i class="fas fa-sync-alt"></i> Replace with '+bt.charAt(0).toUpperCase()+bt.slice(1).split('/')[0]+' Defaults</button>'+
  '<button class="btn btn-primary text-xs" onclick="showCategoryForm()"><i class="fas fa-plus"></i> Add Custom</button></div></div>'+
  '<div id="cat-form-container"></div>'+
  (cats.length?'<div class="space-y-1">'+cats.map(function(cat){return'<div class="flex items-center justify-between py-1.5 px-2 rounded hover:bg-slate-800"><span class="text-sm text-white">'+esc(cat)+'</span><button onclick="deleteCategory(\''+esc(cat)+'\')" class="btn btn-ghost text-xs text-red-400"><i class="fas fa-trash"></i></button></div>'}).join('')+'</div>':'<p class="text-sm text-slate-400">No categories yet. Use the buttons above to add business-type defaults or custom categories.</p>')+
  '</div>'+renderCakeTypeIconManager(cakeIconLabels);
}

function showCategoryForm(){
  var container=document.getElementById('cat-form-container');
  container.innerHTML='<div class="card p-3 mb-4 bg-slate-800"><form class="flex gap-2"><input id="new-category" class="field flex-1 text-sm" placeholder="Category name" required><button type="button" class="btn btn-primary text-xs" onclick="saveCategory()"><i class="fas fa-plus"></i> Add</button><button type="button" class="btn btn-ghost text-xs" onclick="document.getElementById(\'cat-form-container\').innerHTML=\'\'">Cancel</button></form></div>';
}

async function saveCategory(){
  var name=(document.getElementById('new-category').value||'').trim();
  if(!name)return;
  var cs=(client||{}).settings||{};
  var cats=[...(cs.categories||[])];
  if(cats.indexOf(name)>=0){showToast('Category already exists.','info');return}
  cats.push(name);
  try{
    await apiFetch('/api/client/settings',{method:'PUT',body:JSON.stringify({categories:cats})});
    showToast('Category added!','success');
    client.settings={...cs,categories:cats};
    document.getElementById('cat-form-container').innerHTML='';
    renderCategoriesSection();
  }catch(err){showToast(err.message,'error')}
}

async function deleteCategory(name){
  if(!await confirmNice('Delete category?','Delete category "'+name+'"? Products already saved with this category are not automatically changed.',{icon:'trash',okText:'Delete'}))return;
  var cs=(client||{}).settings||{};
  var cats=(cs.categories||[]).filter(function(c){return c!==name});
  try{
    await apiFetch('/api/client/settings',{method:'PUT',body:JSON.stringify({categories:cats})});
    showToast('Category deleted.','info');
    client.settings={...cs,categories:cats};
    renderCategoriesSection();
  }catch(err){showToast(err.message,'error')}
}

// â”€â”€ Add missing business-type defaults (adds only, never deletes) â”€â”€
async function resetToDefaultCategories(){
  var cl=client||{};
  var bp=(cl.settings||{}).businessProfile||{};
  var bt=bp.retailType||bp.businessType||cl.businessTypeLabel||'retail';
  var defaults=getTemplateCategoryNames();
  var cs=(cl.settings||{});
  var existing=cs.categories||[];
  var missing=defaults.filter(function(d){return existing.indexOf(d)<0});
  if(!missing.length){showToast('All default categories for '+bt+' are already present.','info');return}
  var msg='Add missing '+bt+' categories?\n\nCategories to add ('+missing.length+'):\n'+missing.map(function(c){return '- '+c}).join('\n');
  if(!await confirmNice('Add default categories?',msg,{icon:'tags',okText:'Add categories'}))return;
  var merged=existing.concat(missing);
  try{
    await apiFetch('/api/client/settings',{method:'PUT',body:JSON.stringify({categories:merged})});
    showToast('Added '+missing.length+' default categor'+(missing.length!==1?'ies':'y')+'!','success');
    client.settings={...cs,categories:merged};
    renderCategoriesSection();
  }catch(err){showToast(err.message,'error')}
}

// â”€â”€ Replace with business-type categories (with product safety check) â”€â”€
async function replaceWithBusinessCategories(){
  var cl=client||{};
  var bp=(cl.settings||{}).businessProfile||{};
  var bt=bp.retailType||bp.businessType||cl.businessTypeLabel||'retail';
  var defaults=getTemplateCategoryNames();
  var cs=(cl.settings||{});
  var existing=cs.categories||[];
  var products=appState.products||[];

  // Identify which existing categories are NOT in defaults
  var toRemove=existing.filter(function(c){return defaults.indexOf(c)<0});

  // Check if any categories to remove have products
  var catsWithProducts=toRemove.filter(function(cat){return products.some(function(p){return p.category===cat})});

  // Build confirmation message
  var warn='';
  if(catsWithProducts.length){
    warn='\n\nWARNING WARNING - Categories with existing products:\n'+catsWithProducts.map(function(c){var n=products.filter(function(p){return p.category===c}).length;return '- '+c+' ('+n+' product'+(n!==1?'s':'')+')'}).join('\n')+'\n\nThese will be KEPT to protect your products. Reassign products first if you want to remove them.';
  }
  var msg='Replace ALL categories with '+bt+' defaults?\n\nNew categories ('+defaults.length+'):\n'+defaults.map(function(c){return '- '+c}).join('\n');
  if(toRemove.length) msg+='\n\nCategories to remove ('+toRemove.length+'):\n'+toRemove.map(function(c){return '- '+c}).join('\n');
  msg+=warn;
  msg+='\n\nClick OK to replace. Cancel to keep current categories.';
  if(!await confirmNice('Replace categories?',msg,{icon:'sync-alt',okText:'Replace categories'}))return;

  // Safe merge: keep categories with products, add all defaults
  var merged=defaults.concat(catsWithProducts);
  try{
    await apiFetch('/api/client/settings',{method:'PUT',body:JSON.stringify({categories:merged})});
    var keptMsg=catsWithProducts.length?' (kept '+catsWithProducts.length+' with products)':'';
    showToast('Categories replaced with '+bt+' defaults!'+keptMsg,'success');
    client.settings={...cs,categories:merged};
    renderCategoriesSection();
  }catch(err){showToast(err.message,'error')}
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  END PRODUCT MANAGEMENT
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// â”€â”€ Orders Tab â”€â”€
function orderTime(o){return new Date(o.updatedAt||o.confirmedAt||o.createdAt||0).getTime()||0}
function orderProduct(o){return(appState.products||[]).find(function(p){return p.id===o.productId||p.code===o.productCode||p.productCode===o.productCode})||{}}
function productImageForOrder(o,p){p=p||orderProduct(o);if(p&&p.id)return'/api/client/products/'+encodeURIComponent(p.id)+'/image';var imgs=p.images||p.productImages||[];if(Array.isArray(imgs)&&imgs.length){var first=imgs[0];if(typeof first==='string')return first;return first.watermarkedUrl||first.publicUrl||first.url||first.imageUrl||first.path||''}return o.productImageUrl||p.publicImageUrl||p.watermarkedImageUrl||p.imageUrl||p.image||p.imagePath||''}
function orderCustomer(o){var keys=[o.customerId,o.telegramUserId,o.telegramChatId,o.phone,o.username,o.customerName].filter(Boolean).map(function(v){return String(v).toLowerCase()});return(appState.customers||[]).find(function(cu){var vals=[cu.id,cu.telegramUserId,cu.telegramChatId,cu.phone,cu.username,cu.name].filter(Boolean).map(function(v){return String(v).toLowerCase()});return vals.some(function(v){return keys.indexOf(v)>=0})})||{}}
function priorCustomerOrders(o){var keys=[o.customerId,o.telegramUserId,o.telegramChatId,o.phone,o.username,o.customerName].filter(Boolean).map(function(v){return String(v).toLowerCase()});var currentTime=orderTime(o);return(appState.orders||[]).filter(function(item){if(item.id===o.id)return false;var vals=[item.customerId,item.telegramUserId,item.telegramChatId,item.phone,item.username,item.customerName].filter(Boolean).map(function(v){return String(v).toLowerCase()});var same=vals.some(function(v){return keys.indexOf(v)>=0});return same&&(!currentTime||orderTime(item)<=currentTime)})}
function deliveryRemainingText(o){var max=Number(o.deliveryMaxHours||o.deliveryEtaHours||0)||0;if(!max)return'Not set';var start=o.deliveryStartedAt||o.paymentVerifiedAt||o.paymentConfirmedAt||o.confirmedAt||o.createdAt;if(!start)return max+' hours max';var elapsed=(Date.now()-(new Date(start).getTime()||Date.now()))/(60*60*1000);var left=Math.max(0,max-elapsed);var rounded=Math.ceil(left);return rounded>0?rounded+' hour'+(rounded===1?'':'s')+' remaining':'Delivery time reached'}
function orderAmount(o){var v=o.total||o.totalAmount||o.grandTotal||o.subtotal||0;var n=Number(String(v).replace(/[^0-9.]/g,''));return Number.isFinite(n)?n:0}
function orderStatusGroup(o){var s=String(o.status||'draft'),p=String(o.paymentStatus||'unpaid'),d=String(o.deliveryStatus||'not-started');if(s==='cancelled'||d==='cancelled')return'cancelled';if(s==='delivered'||d==='delivered')return'delivered';if(d==='out-for-delivery')return'out_for_delivery';if(p==='paid'||s==='paid'||s==='packed'||d==='packed')return'paid';if(p==='unpaid'||p==='partial')return'pending_payment';return'active'}
function orderMatchesFilter(o,filter){var g=orderStatusGroup(o);if(filter==='all')return true;if(filter==='active')return g!=='delivered'&&g!=='cancelled';return g===filter}
function orderBadgeClass(o){var g=orderStatusGroup(o);return g==='delivered'?'badge-active':g==='cancelled'?'badge-rejected':g==='pending_payment'?'badge-pending':'badge-active'}
function orderGroupLabel(g){return{active:'Active orders',pending_payment:'Awaiting payment',paid:'Paid / preparing',out_for_delivery:'Out for delivery',delivered:'Delivered',cancelled:'Cancelled',all:'All orders'}[g]||g.replace(/_/g,' ')}
function orderProofs(o){return(appState.paymentProofs||[]).filter(function(p){return p.orderId===o.id||p.linkedOrderId===o.id})}
function orderInfoLine(label,value){return'<div><span class="text-slate-500">'+esc(label)+':</span> <span class="text-slate-300">'+esc(value||'Not set')+'</span></div>'}
function orderAddOnsHtml(o,currencySymbol){var addOns=Array.isArray(o.addOns)?o.addOns:[];if(!addOns.length)return'';return'<div class="mt-3 pt-3 border-t border-slate-700"><p class="text-xs text-slate-500 mb-2">Matched add-on</p>'+addOns.map(function(item){var details=[item.selectedSize?'Size '+item.selectedSize:'',item.selectedColor?'Color '+item.selectedColor:'',item.selectedOption?'Option '+item.selectedOption:''].filter(Boolean).join(' - ');return'<div class="rounded-lg bg-slate-900/50 border border-slate-700 p-2 mb-2"><div class="text-slate-200 font-medium">'+esc(item.productName||item.productCode||'Add-on')+'</div><div class="text-xs text-slate-400">'+(item.productCode?'Code '+esc(item.productCode)+' - ':'')+esc(item.unitPrice||0)+' '+esc(currencySymbol)+' - Qty '+esc(item.quantity||1)+'</div>'+(details?'<div class="text-xs text-slate-500 mt-1">'+esc(details)+'</div>':'')+'</div>'}).join('')+'</div>'}
function renderOrdersTab(c){
  var s=appState||{}, orders=(s.orders||[]).slice().sort(function(a,b){return orderTime(b)-orderTime(a)}), cs=(client||{}).settings||{};
  var currencySymbol=cs.currency||cs.currencySymbol||'ETB';
  var stats={all:orders.length,active:0,pending_payment:0,paid:0,out_for_delivery:0,delivered:0,cancelled:0,revenue:0};
  orders.forEach(function(o){var g=orderStatusGroup(o);if(g!=='delivered'&&g!=='cancelled')stats.active++;if(stats[g]!==undefined)stats[g]++;if(g!=='cancelled')stats.revenue+=orderAmount(o)});
  var filtered=orders.filter(function(o){return orderMatchesFilter(o,orderFilter)});
  var totalOrders=filtered.length,page=Math.max(1,Math.min(uiPage.orders||1,Math.max(1,Math.ceil(totalOrders/uiPageSize)))),start=(page-1)*uiPageSize;
  uiPage.orders=page;
  var visibleOrders=filtered.slice(start,start+uiPageSize);
  var opts=['active','pending_payment','paid','out_for_delivery','delivered','cancelled','all'].map(function(v){return'<option value="'+v+'"'+(orderFilter===v?' selected':'')+'>'+orderGroupLabel(v)+' ('+(v==='all'?stats.all:stats[v])+')</option>'}).join('');
  c.innerHTML='<div class="space-y-6"><div class="flex flex-col lg:flex-row lg:items-end justify-between gap-3"><div><h2 class="text-xl font-semibold text-white"><i class="fas fa-shopping-cart text-sprint-400 mr-2"></i>Orders</h2><p class="text-sm text-slate-400 mt-1">Track active work, payment, delivery, and customer history from one place.</p></div><div class="w-full lg:w-72"><label class="text-xs text-slate-400 block mb-1">Show orders</label><select id="order-filter" class="field" onchange="setOrderFilter(this.value)">'+opts+'</select></div></div>'+
  (stats.active?'<div class="card p-4 border border-yellow-300/40 bg-yellow-50 text-yellow-900"><div class="flex items-center gap-3"><i class="fas fa-bell text-xl"></i><div><p class="font-semibold">You have '+stats.active+' active order'+(stats.active===1?'':'s')+' needing attention</p><p class="text-xs opacity-80">Open each order to check payment, packing, and delivery status.</p></div></div></div>':'')+
  '<div class="dashboard-grid"><div class="stat-card"><p class="text-xs text-slate-400">Active</p><p class="text-2xl font-bold text-white">'+stats.active+'</p></div><div class="stat-card"><p class="text-xs text-slate-400">Awaiting Payment</p><p class="text-2xl font-bold text-white">'+stats.pending_payment+'</p></div><div class="stat-card"><p class="text-xs text-slate-400">Out for Delivery</p><p class="text-2xl font-bold text-white">'+stats.out_for_delivery+'</p></div><div class="stat-card"><p class="text-xs text-slate-400">Order Value</p><p class="text-2xl font-bold text-white">'+esc(currencySymbol)+' '+Math.round(stats.revenue).toLocaleString()+'</p></div></div>'+
  (orders.length?(visibleOrders.length?visibleOrders.map(function(o){var total=o.total||o.totalAmount||orderAmount(o),group=orderStatusGroup(o),next=o.nextAction||{},proofs=orderProofs(o);return'<div class="card p-4"><div class="flex flex-col lg:flex-row lg:items-start justify-between gap-3"><div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-2"><h3 class="text-white font-semibold">#'+esc((o.id||'').slice(-8))+' - '+esc(o.customerName||o.username||'Customer')+'</h3><span class="badge '+orderBadgeClass(o)+' text-xs">'+esc(orderGroupLabel(group))+'</span>'+(next.title?'<span class="badge badge-pending text-xs">'+esc(next.title)+'</span>':'')+'</div><div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-x-5 gap-y-1 mt-2 text-xs">'+orderInfoLine('Phone',o.phone)+orderInfoLine('Product',o.productName||o.productCode)+orderInfoLine('Address',o.deliveryLocation||o.deliveryNote)+orderInfoLine('Payment',o.paymentStatus||'unpaid')+'</div><div class="flex flex-wrap gap-2 mt-3 text-xs"><span class="text-sprint-400 font-semibold">'+esc(currencySymbol)+' '+esc(total||0)+'</span><span class="text-slate-400">Qty '+esc(o.quantity||1)+'</span>'+(proofs.length?'<span class="text-green-500"><i class="fas fa-receipt"></i> '+proofs.length+' payment proof'+(proofs.length===1?'':'s')+'</span>':'')+'<span class="text-yellow-400"><i class="fas fa-truck"></i> '+esc(deliveryRemainingText(o))+'</span></div></div><div class="flex gap-2 flex-wrap lg:justify-end"><button onclick="showOrderDetail(&quot;'+encodeURIComponent(o.id)+'&quot;)" class="btn btn-ghost text-xs flex-shrink-0"><i class="fas fa-eye"></i> View</button>'+orderQuickButtons(o)+'</div></div></div>'}).join('')+renderPager('orders',page,totalOrders):'<div class="card p-8 text-center"><i class="fas fa-filter text-3xl text-slate-600 mb-3 block"></i><p class="text-slate-400">No '+esc(orderGroupLabel(orderFilter).toLowerCase())+' right now.</p></div>')+'<div id="order-detail-panel"></div>':'<div class="card p-8 text-center"><i class="fas fa-inbox text-3xl text-slate-600 mb-3 block"></i><p class="text-slate-400">No orders yet.</p></div>')+'</div>';
}

// Order helpers
function setOrderFilter(value){orderFilter=value||'active';uiPage.orders=1;renderOrdersTab(document.getElementById('dashboard-content'))}
function orderQuickButtons(o){var g=orderStatusGroup(o);if(g==='delivered'||g==='cancelled')return'';var buttons=[];if((o.paymentStatus||'unpaid')!=='paid')buttons.push('<button class="btn btn-ghost text-xs" onclick="updateOrderStatus(&quot;'+encodeURIComponent(o.id)+'&quot;,{status:&quot;paid&quot;,paymentStatus:&quot;paid&quot;})"><i class="fas fa-check"></i> Paid</button>');if(g==='paid'||g==='pending_payment'||g==='active')buttons.push('<button class="btn btn-ghost text-xs" onclick="updateOrderStatus(&quot;'+encodeURIComponent(o.id)+'&quot;,{status:&quot;packed&quot;,deliveryStatus:&quot;packed&quot;})"><i class="fas fa-box"></i> Packed</button>');if(g!=='out_for_delivery')buttons.push('<button class="btn btn-ghost text-xs" onclick="updateOrderStatus(&quot;'+encodeURIComponent(o.id)+'&quot;,{status:&quot;packed&quot;,deliveryStatus:&quot;out-for-delivery&quot;})"><i class="fas fa-truck"></i> Out</button>');buttons.push('<button class="btn btn-ghost text-xs text-green-600" onclick="markOrderDelivered(&quot;'+encodeURIComponent(o.id)+'&quot;)"><i class="fas fa-flag-checkered"></i> Delivered</button>');buttons.push('<button class="btn btn-ghost text-xs text-red-500" onclick="cancelOrder(&quot;'+encodeURIComponent(o.id)+'&quot;)"><i class="fas fa-times"></i> Cancel</button>');return buttons.join('')}
async function updateOrderStatus(encodedId,patch){var id=decodeURIComponent(encodedId);try{await apiFetch('/api/client/orders/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify(patch||{})});await initDashboard();showToast('Order updated.','success');renderOrdersTab(document.getElementById('dashboard-content'))}catch(err){showToast(err.message,'error')}}
async function markOrderDelivered(encodedId){if(!await confirmNice('Mark delivered?','This marks the order as delivered and reduces product stock.',{icon:'flag-checkered',okText:'Mark delivered'}))return;await updateOrderStatus(encodedId,{status:'delivered',deliveryStatus:'delivered',reduceStock:true})}
async function cancelOrder(encodedId){if(!await confirmNice('Cancel order?','This moves the order to cancelled orders. Customer and product records stay saved.',{icon:'times',okText:'Cancel order'}))return;await updateOrderStatus(encodedId,{status:'cancelled',deliveryStatus:'cancelled'})}
function showOrderDetail(encodedId){var id=decodeURIComponent(encodedId);var o=(appState.orders||[]).find(function(item){return item.id===id});var box=document.getElementById('order-detail-panel');if(!o){showToast('Order not found. Refresh the dashboard and try again.','error');return}if(!box){showToast('Order detail panel not found. Refresh the dashboard and try again.','error');return}var p=orderProduct(o),cu=orderCustomer(o),img=productImageForOrder(o,p),total=o.total||o.totalAmount||orderAmount(o),prior=priorCustomerOrders(o),currencySymbol=((client||{}).settings||{}).currency||((client||{}).settings||{}).currencySymbol||'ETB',proofs=orderProofs(o),next=o.nextAction||{},group=orderStatusGroup(o);box.innerHTML='<div class="card p-5 mt-4 border border-sprint-400/30"><div class="flex items-start justify-between gap-3 mb-4"><div><h3 class="text-lg font-semibold text-white">Order #'+esc((o.id||'').slice(-8))+'</h3><div class="flex flex-wrap gap-2 mt-2 text-xs"><span class="badge '+orderBadgeClass(o)+'">'+esc(orderGroupLabel(group))+'</span><span class="text-slate-400">Created '+esc(o.createdAt?new Date(o.createdAt).toLocaleString():'unknown')+'</span>'+(o.updatedAt?'<span class="text-slate-400">Updated '+esc(new Date(o.updatedAt).toLocaleString())+'</span>':'')+'</div></div><button class="btn btn-ghost text-xs" onclick="document.getElementById(&quot;order-detail-panel&quot;).innerHTML=&quot;&quot;"><i class="fas fa-times"></i> Close</button></div>'+(next.title?'<div class="rounded-lg border border-yellow-300/30 bg-yellow-50 text-yellow-900 p-3 mb-4 text-sm"><strong>'+esc(next.title)+'</strong><p class="text-xs mt-1">'+esc(next.message||'This order needs attention.')+'</p></div>':'')+'<div class="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-5">'+(img?'<img src="'+esc(img)+'" class="w-full max-h-80 object-cover rounded-lg bg-slate-800" onerror="this.style.display=&quot;none&quot;">':'<div class="rounded-lg bg-slate-800 min-h-48 flex items-center justify-center text-slate-500"><i class="fas fa-image text-3xl"></i></div>')+'<div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm"><div class="rounded-lg border border-slate-700 p-3"><h4 class="text-white font-semibold mb-2">Customer</h4>'+orderInfoLine('Name',o.customerName||cu.name||o.username||'Telegram customer')+orderInfoLine('Username',o.username||cu.username)+orderInfoLine('Phone',o.phone||cu.phone)+orderInfoLine('Telegram ID',o.telegramChatId||cu.telegramChatId||cu.telegramUserId)+orderInfoLine('Address',o.deliveryLocation||cu.address||o.deliveryNote)+'<p class="text-sprint-400 mt-2 text-xs">Previous purchases: '+esc(prior.length)+'</p></div><div class="rounded-lg border border-slate-700 p-3"><h4 class="text-white font-semibold mb-2">Product</h4>'+orderInfoLine('Product',o.productName||p.name||'Product')+orderInfoLine('Code',o.productCode||p.code||p.productCode)+orderInfoLine('Quantity',o.quantity||1)+orderInfoLine('Size',o.selectedSize||o.size)+orderInfoLine('Color',o.selectedColor||o.color)+orderInfoLine('Option',o.selectedOption||o.option)+orderAddOnsHtml(o,currencySymbol)+'</div><div class="rounded-lg border border-slate-700 p-3"><h4 class="text-white font-semibold mb-2">Payment</h4>'+orderInfoLine('Status',o.paymentStatus||'unpaid')+orderInfoLine('Subtotal',(o.subtotal||'0')+' '+currencySymbol)+(o.discountAmount&&Number(o.discountAmount)?'<p class="text-green-300">Discount: -'+esc(o.discountAmount)+' '+esc(currencySymbol)+' '+esc(o.discountLabel||'')+'</p>':'')+'<p class="text-sprint-400 font-semibold mt-2">Total: '+esc(total||'Not set')+' '+esc(currencySymbol)+'</p>'+(proofs.length?'<p class="text-xs text-green-400 mt-2">Payment proofs: '+proofs.length+' latest '+esc(proofs[0].status||'received')+'</p>':'<p class="text-xs text-slate-500 mt-2">No payment proof linked yet.</p>')+'</div><div class="rounded-lg border border-slate-700 p-3"><h4 class="text-white font-semibold mb-2">Delivery</h4><div class="mb-2 rounded-lg bg-sprint-400/10 border border-sprint-400/30 p-2"><p class="text-xs text-slate-500">Current delivery status</p><p class="text-lg font-bold text-white">'+esc(String(o.deliveryStatus||'not-started').replace(/-/g,' '))+'</p></div>'+orderInfoLine('Status',o.deliveryStatus||'not-started')+orderInfoLine('Area',o.deliveryArea||o.deliveryZone)+orderInfoLine('Fee',(o.deliveryFee||0)+' '+currencySymbol)+orderInfoLine('Max hour',o.deliveryMaxHours||o.deliveryEtaHours)+orderInfoLine('Time left',deliveryRemainingText(o))+'</div></div></div><div class="mt-4 flex gap-2 flex-wrap">'+orderQuickButtons(o)+'</div>'+(prior.length?'<div class="mt-5"><h4 class="text-white font-semibold mb-2">Previous orders from this customer</h4><div class="space-y-2">'+prior.slice(0,5).map(function(po){return'<div class="rounded-lg bg-slate-900/50 border border-slate-700 p-3 text-xs text-slate-300">#'+esc((po.id||'').slice(-8))+' - '+esc(po.productName||'Product')+' - '+esc(po.total||po.totalAmount||0)+' '+esc(currencySymbol)+' - '+esc(po.status||'pending')+'</div>'}).join('')+'</div></div>':'')+'</div>';box.scrollIntoView({behavior:'smooth',block:'start'})}

// â”€â”€ Telegram Bot Tab â”€â”€
function customerFilterValue(){return(document.getElementById('customer-filter')||{}).value||'all'}
function customerVisibleList(){var filter=customerFilterValue();return(appState.customers||[]).filter(function(cu){var orders=Number(cu.orders||cu.totalPaidOrders||0);var leads=Number(cu.leads||0);if(filter==='purchased')return orders>0;if(filter==='hot_leads')return leads>0&&orders===0;return true})}
function renderCustomerList(){var box=document.getElementById('customer-list');if(!box)return;var customers=customerVisibleList();if(!customers.length){box.innerHTML='<div class="card p-8 text-center"><i class="fas fa-user-friends text-3xl text-slate-600 mb-3 block"></i><p class="text-slate-400">No matching customers yet.</p></div>';return}box.innerHTML=customers.slice(0,150).map(function(cu){var orders=Number(cu.orders||cu.totalPaidOrders||0);var leads=Number(cu.leads||0);var segment=orders>0?'Purchased customer':(leads>0?'Hot lead':'Customer');var badge=orders>0?'badge-active':(leads>0?'badge-pending':'badge');return'<div class="card p-4"><div class="flex flex-col lg:flex-row lg:items-start justify-between gap-3"><div class="min-w-0"><div class="flex flex-wrap items-center gap-2"><h3 class="text-white font-semibold">'+esc(cu.name||cu.username||cu.phone||'Telegram customer')+'</h3><span class="badge '+badge+' text-xs">'+esc(segment)+'</span></div><div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 mt-2 text-xs text-slate-400"><div><span class="text-slate-500">Username:</span> '+esc(cu.username||'Not available')+'</div><div><span class="text-slate-500">Phone:</span> '+esc(cu.phone||'Not shared yet')+'</div><div><span class="text-slate-500">Telegram ID:</span> '+esc(cu.telegramUserId||cu.telegramChatId||'Not available')+'</div><div><span class="text-slate-500">Address:</span> '+esc(cu.address||'Not saved yet')+'</div></div><div class="flex flex-wrap gap-2 mt-3 text-xs"><span class="badge badge-active">'+esc(orders)+' order'+(orders===1?'':'s')+'</span><span class="badge badge-pending">'+esc(leads)+' lead signal'+(leads===1?'':'s')+'</span><span class="text-sprint-400 font-semibold">'+esc(cu.totalSpent||0)+' ETB spent</span>'+(cu.leadScore?'<span class="text-yellow-300">Lead score '+esc(cu.leadScore)+'</span>':'')+'</div>'+(cu.lastMessage?'<p class="text-xs text-slate-500 mt-2 line-clamp-2">'+esc(cu.lastMessage)+'</p>':'')+'</div><div class="flex flex-col items-start lg:items-end gap-2"><div class="text-xs text-slate-500">'+(cu.lastSeenAt?new Date(cu.lastSeenAt).toLocaleString():'')+'</div><button type="button" class="btn btn-ghost text-xs" onclick="showCustomerDetail(&quot;'+encodeURIComponent(cu.id)+'&quot;)"><i class="fas fa-eye"></i> Details</button></div></div></div>'}).join('')}
function renderCustomersTab(c){var customers=appState.customers||[],purchased=customers.filter(function(cu){return Number(cu.orders||cu.totalPaidOrders||0)>0}).length,hot=customers.filter(function(cu){return Number(cu.leads||0)>0&&Number(cu.orders||cu.totalPaidOrders||0)===0}).length;c.innerHTML='<div class="space-y-6"><div class="flex flex-col lg:flex-row lg:items-end justify-between gap-3"><div><h2 class="text-xl font-semibold text-white"><i class="fas fa-users text-sprint-400 mr-2"></i>Customers</h2><p class="text-sm text-slate-400 mt-1">Purchased customers and hot leads, with Telegram name and username when Telegram provides them.</p><p class="text-xs text-slate-500 mt-1">Phone numbers only appear after the customer shares contact or gives a phone during order.</p></div><div class="w-full lg:w-64"><label class="text-xs text-slate-400 block mb-1">Show</label><select id="customer-filter" class="field" onchange="renderCustomerList()"><option value="all">All people ('+customers.length+')</option><option value="purchased">Purchased customers ('+purchased+')</option><option value="hot_leads">Hot leads only ('+hot+')</option></select></div></div><div id="customer-list" class="space-y-3"></div><div id="customer-detail-panel"></div></div>';setTimeout(renderCustomerList,0)}
function customerDetailLine(label,value){return'<div><span class="text-slate-500">'+esc(label)+':</span> <span class="text-slate-300">'+esc(value||'Not available')+'</span></div>'}
async function saveCustomerNote(customerId){var note=(document.getElementById('customer-note-box')||{}).value||'';try{await apiFetch('/api/client/customers/'+encodeURIComponent(customerId)+'/note',{method:'PATCH',body:JSON.stringify({note:note})});showToast('Customer note saved.','success')}catch(err){showToast(err.message,'error')}}
async function sendCustomerManualMessage(customerId){var text=((document.getElementById('customer-message-box')||{}).value||'').trim();if(!text){showToast('Write a message first.','warning');return}try{await apiFetch('/api/client/customers/'+encodeURIComponent(customerId)+'/message',{method:'POST',body:JSON.stringify({text:text})});document.getElementById('customer-message-box').value='';showToast('Message sent.','success')}catch(err){showToast(err.message,'error')}}
async function showCustomerDetail(encodedId){try{var id=decodeURIComponent(encodedId);var d=await apiFetch('/api/client/customers/'+encodeURIComponent(id)+'/timeline');var cu=d.customer||{},box=document.getElementById('customer-detail-panel');if(!box){showToast('Customer detail panel not found. Refresh and try again.','error');return}var timeline=d.timeline||[],recentOrders=timeline.filter(function(item){return item.type==='order'}).slice(0,5),recentActivity=timeline.slice(0,10);box.innerHTML='<div class="card p-5 mt-4 border border-sprint-400/30"><div class="flex items-start justify-between gap-3 mb-4"><div><h3 class="text-lg font-semibold text-white">'+esc(cu.name||cu.username||cu.phone||'Telegram customer')+'</h3><div class="flex flex-wrap gap-2 text-xs mt-2"><span class="badge badge-active">'+esc(cu.orders||cu.totalPaidOrders||0)+' order'+(Number(cu.orders||cu.totalPaidOrders||0)===1?'':'s')+'</span><span class="badge badge-pending">'+esc(cu.leads||0)+' lead signal'+(Number(cu.leads||0)===1?'':'s')+'</span><span class="text-sprint-400 font-semibold">'+esc(cu.totalSpent||0)+' ETB spent</span></div></div><button class="btn btn-ghost text-xs" onclick="document.getElementById(&quot;customer-detail-panel&quot;).innerHTML=&quot;&quot;"><i class="fas fa-times"></i> Close</button></div><div class="grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm"><div class="rounded-lg border border-slate-700 p-3"><h4 class="text-white font-semibold mb-2">Customer Information</h4>'+customerDetailLine('Name',cu.name)+customerDetailLine('Username',cu.username)+customerDetailLine('Phone',cu.phone)+customerDetailLine('Telegram ID',cu.telegramUserId||cu.telegramChatId)+customerDetailLine('Address',cu.address)+customerDetailLine('Last seen',cu.lastSeenAt?new Date(cu.lastSeenAt).toLocaleString():'Not available')+'</div><div class="rounded-lg border border-slate-700 p-3"><h4 class="text-white font-semibold mb-2">Private Note</h4><textarea id="customer-note-box" class="field" rows="5" placeholder="Add owner-only note about this customer...">'+esc(d.note||'')+'</textarea><button type="button" class="btn btn-primary text-xs mt-2" onclick="saveCustomerNote(&quot;'+esc(id)+'&quot;)"><i class="fas fa-save"></i> Save Note</button></div></div><div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4"><div class="rounded-lg border border-slate-700 p-3"><h4 class="text-white font-semibold mb-2">Recent Orders</h4>'+(recentOrders.length?recentOrders.map(function(item){return'<div class="rounded-lg bg-slate-900/50 border border-slate-700 p-3 text-xs text-slate-300 mb-2"><strong>'+esc(item.title||'Order')+'</strong><p class="text-slate-400 mt-1">'+esc(item.description||'')+'</p></div>'}).join(''):'<p class="text-xs text-slate-500">No orders found for this customer yet.</p>')+'</div><div class="rounded-lg border border-slate-700 p-3"><h4 class="text-white font-semibold mb-2">Send Telegram Message</h4><textarea id="customer-message-box" class="field" rows="4" placeholder="Write a short message to this customer..."></textarea><button type="button" class="btn btn-primary text-xs mt-2" onclick="sendCustomerManualMessage(&quot;'+esc(id)+'&quot;)"><i class="fas fa-paper-plane"></i> Send Message</button><p class="text-xs text-slate-500 mt-2">Works only when Telegram chat ID is available.</p></div></div><div class="mt-4"><h4 class="text-white font-semibold mb-2">Recent Activity</h4>'+(recentActivity.length?'<div class="space-y-2">'+recentActivity.map(function(item){return'<div class="rounded-lg bg-slate-900/50 border border-slate-700 p-3 text-xs"><div class="flex items-center justify-between gap-2"><strong class="text-slate-200">'+esc(item.title||item.type||'Activity')+'</strong><span class="text-slate-500">'+esc(item.createdAt?new Date(item.createdAt).toLocaleString():'')+'</span></div>'+(item.description?'<p class="text-slate-400 mt-1">'+esc(item.description)+'</p>':'')+'</div>'}).join('')+'</div>':'<p class="text-xs text-slate-500">No activity recorded yet.</p>')+'</div></div>';box.scrollIntoView({behavior:'smooth',block:'start'})}catch(err){showToast(err.message,'error')}}

function botDraftStorageKey(){return botDraftKey+'.'+((client&&client.id)||'new')}
function readBotDraft(){try{var raw=localStorage.getItem(botDraftStorageKey());return raw?JSON.parse(raw):{}}catch(_e){return{}}}
function saveBotDraft(){try{var draft={};['bot-token','bot-username','bot-owner-chatid','bot-channel-id'].forEach(function(id){var el=document.getElementById(id);if(el)draft[id]=el.value});localStorage.setItem(botDraftStorageKey(),JSON.stringify(draft))}catch(_e){}}
function clearBotDraft(){try{localStorage.removeItem(botDraftStorageKey())}catch(_e){}}
function bindBotDraft(){
  ['bot-token','bot-username','bot-owner-chatid','bot-channel-id'].forEach(function(id){var el=document.getElementById(id);if(el&&!el.dataset.draftBound){el.dataset.draftBound='1';el.addEventListener('input',saveBotDraft);el.addEventListener('change',saveBotDraft)}});
}
function renderBotSetupSteps(){
  return '<div class="card p-5"><h3 class="text-white font-semibold mb-3"><i class="fas fa-list-check text-sprint-400 mr-2"></i>How to create your shop bot</h3><ol class="space-y-2 text-sm text-slate-600 list-decimal pl-5"><li>Open Telegram and search <strong>@BotFather</strong>.</li><li>Send <strong>/newbot</strong>.</li><li>Choose a business-friendly bot name, for example <strong>AddisMart Assistant</strong>.</li><li>Choose a username ending with <strong>bot</strong>, for example <strong>@AddisMartSalesBot</strong>.</li><li>Copy the token BotFather gives you and paste it below.</li><li>Paste the bot username, save settings, then press <strong>Test Connection</strong>.</li></ol><p class="text-xs text-slate-500 mt-3"><i class="fas fa-shield-alt mr-1"></i> Keep the token private. Anyone with the token can control your bot.</p></div>';
}

function renderBotTab(c){
  var cs=(client||{}).settings||{};
  var token=cs.botToken||'';
  var masked=token?(token.slice(0,8)+'...'+token.slice(-4)):'';
  var draft=readBotDraft();
  var draftNotice=Object.keys(draft).some(function(k){return String(draft[k]||'').trim()})?'<div class="rounded-lg border border-yellow-300/40 bg-yellow-50 text-yellow-900 p-3 text-xs"><i class="fas fa-pen mr-1"></i> Unsaved bot settings draft restored on this device.</div>':'';
  var errorNotice=cs.botLastError?'<div class="rounded-lg border border-red-300/40 bg-red-50 text-red-900 p-3 text-xs mb-3"><i class="fas fa-triangle-exclamation mr-1"></i>'+esc(cs.botLastError)+'</div>':'';
  c.innerHTML='<div class="space-y-6"><div><h2 class="text-xl font-semibold text-white"><i class="fas fa-robot text-sprint-400 mr-2"></i>Telegram Bot Setup</h2><p class="text-sm text-slate-400 mt-1">Connect your Telegram bot to automate customer interactions.</p></div>'+
  renderBotSetupSteps()+
  '<div class="card p-6"><h3 class="text-white font-semibold mb-4"><i class="fab fa-telegram text-sprint-400 mr-2"></i>Bot Configuration</h3>'+
  errorNotice+
  draftNotice+
  (masked?'<div class="bg-slate-800 rounded p-3 mb-4 text-xs"><span class="text-slate-400">Current token: </span><span class="text-green-400 font-mono">'+esc(masked)+'</span></div>':'')+
  '<form onsubmit="saveBotSettings(event)" class="space-y-3">'+
  '<div><label class="text-xs text-slate-400 block mb-1">Bot Token (from @BotFather)</label><input id="bot-token" class="field" type="password" placeholder="123456:ABC..." value="'+esc(draft['bot-token']||'')+'"></div>'+
  '<div><label class="text-xs text-slate-400 block mb-1">Bot Username</label><input id="bot-username" class="field" value="'+esc(draft['bot-username']!==undefined?draft['bot-username']:(cs.botUsername||''))+'" placeholder="@YourBot"></div>'+
  '<div><label class="text-xs text-slate-400 block mb-1">Owner Telegram Chat ID</label><input id="bot-owner-chatid" class="field" value="'+esc(draft['bot-owner-chatid']!==undefined?draft['bot-owner-chatid']:(cs.telegramOwnerChatId||''))+'" placeholder="123456789"></div>'+
  '<div><label class="text-xs text-slate-400 block mb-1">Product Posting Channel/Group</label><input id="bot-channel-id" class="field" value="'+esc(draft['bot-channel-id']!==undefined?draft['bot-channel-id']:(cs.telegramChannelLink||cs.productPostDestination||cs.channelUsername||''))+'" placeholder="@channel or -100..."></div>'+
  '<div class="flex gap-2"><button type="submit" class="btn btn-primary text-xs"><i class="fas fa-save"></i> Save Settings</button>'+
  '<button type="button" class="btn btn-ghost text-xs" onclick="testBotConnection()"><i class="fas fa-plug"></i> Test Connection</button>'+
  '<button type="button" class="btn btn-ghost text-xs" onclick="restartBot()"><i class="fas fa-redo"></i> Restart Bot</button></div>'+
  '</form></div></div>';
  setTimeout(bindBotDraft,0);
}

async function saveBotSettings(e){
  e.preventDefault();
  var body={botUsername:document.getElementById('bot-username').value.trim(),telegramOwnerChatId:document.getElementById('bot-owner-chatid').value.trim()};
  var token=document.getElementById('bot-token').value.trim();
  if(token)body.botToken=token;
  if(document.getElementById('bot-channel-id').value.trim())body.telegramChannelLink=document.getElementById('bot-channel-id').value.trim();
  try{
    await apiFetch('/api/client/settings',{method:'PUT',body:JSON.stringify(body)});
    clearBotDraft();
    showToast('Bot settings saved.','success');
    await initDashboard();
    renderBotTab(document.getElementById('dashboard-content'));
  }catch(err){showToast(err.message,'error')}
}

async function testBotConnection(){try{var d=await apiFetch('/api/client/bot/test-connection',{method:'POST'});showToast(d.message||'Connection test sent.','info')}catch(e){showToast(e.message,'error')}}
async function restartBot(){try{await apiFetch('/api/client/bot/restart',{method:'POST'});showToast('Bot restarted.','success')}catch(e){showToast(e.message,'error')}}

// â”€â”€ AI Keys Tab â”€â”€
function renderAiKeysTab(c){
  var cs=(client||{}).settings||{};
  var provider=cs.aiProvider||'deepseek';
  c.innerHTML='<div class="space-y-6"><div><h2 class="text-xl font-semibold text-white"><i class="fas fa-key text-sprint-400 mr-2"></i>AI Provider Settings</h2><p class="text-sm text-slate-400 mt-1">Configure your AI provider API keys.</p></div>'+
  '<div class="card p-6"><h3 class="text-white font-semibold mb-4">API Key Configuration</h3>'+
  '<form onsubmit="saveAiSettings(event)" class="space-y-3">'+
  '<div><label class="text-xs text-slate-400 block mb-1">AI Provider</label><select id="ai-provider" class="field">'+
  ['deepseek','openai','anthropic','gemini','grok'].map(function(p){var label=p==='anthropic'?'Claude / Anthropic':p.charAt(0).toUpperCase()+p.slice(1);return'<option value="'+p+'"'+(provider===p||provider==='claude'&&p==='anthropic'?' selected':'')+'>'+label+'</option>'}).join('')+'</select></div>'+
  '<div><label class="text-xs text-slate-400 block mb-1">API Key</label><input id="ai-api-key" class="field" type="password" value="" data-configured="'+(cs.aiApiKey==='configured'?'1':'0')+'" placeholder="'+(cs.aiApiKey==='configured'?'Key saved - leave blank to keep':'Paste the API key for the selected provider')+'"></div>'+
  '<div><label class="text-xs text-slate-400 block mb-1">Monthly Reply Limit</label><input id="ai-reply-limit" class="field" type="number" min="0" max="100000" value="'+esc(cs.aiMonthlyReplyLimit||'1000')+'"></div>'+
  '<div><label class="text-xs text-slate-400 block mb-1">AI Tone</label><textarea id="ai-tone" class="field" rows="2">'+esc(cs.tone||'Professional, warm, concise, and sales-aware.')+'</textarea></div>'+
  '<p class="text-xs text-slate-500">Usage this month: <strong>'+esc(cs.aiRepliesThisMonth||'0')+'</strong> / '+esc(cs.aiMonthlyReplyLimit||'1000')+' replies</p>'+
  '<button type="submit" class="btn btn-primary text-xs"><i class="fas fa-save"></i> Save AI Settings</button>'+
  '</form></div></div>';
}

async function saveAiSettings(e){
  e.preventDefault();
  var provider=document.getElementById('ai-provider').value;
  var keyInput=document.getElementById('ai-api-key');
  var keyValue=(keyInput.dataset.configured==='1'&&!keyInput.value)?'configured':keyInput.value;
  var body={aiProvider:provider,aiApiKey:keyValue,aiMonthlyReplyLimit:Number(document.getElementById('ai-reply-limit').value)||1000,tone:document.getElementById('ai-tone').value};
  try{await apiFetch('/api/client/settings',{method:'PUT',body:JSON.stringify(body)});showToast('AI settings saved.','success')}catch(err){showToast(err.message,'error')}
}

// â”€â”€ Delivery Tab â”€â”€
var ADDIS_DELIVERY_LOCATIONS=['Piassa','Mexico','Kazanchis','Arat Killo','Amist Killo','Siddist Killo','Churchill Road','Legehar','Stadium','Meskel Square','Bamis','Filwoha','Sengatera','Teklehaimanot','Sebategna','Bole Atlas','Bole Medhanialem','Bole Rwanda','Bole Bulbula','Bole Arabsa','Gerji','Imperial','22 Mazoria','Hayahulet','Haya Arat','Megenagna','Ayat','CMC','Summit','Gurd Shola','Salite Mihret','Figa','Jakros','Egziabher Ab','Unity Park Area','Shola Market','Kotebe','Kara','Ferensay Legasion','Gurara','Kebena','Jan Meda','Belay Zeleke','Shiromeda','Entoto','Gullele','Kechene','Wingate','Addisu Gebeya','Semen Mazoria','Lideta','Abnet','Geja Sefer','Kocher','Tor Hailoch','Keraniyo','Bethel','Ayer Tena','Kolfe','Total','Zenebework','Alem Bank','Repi','Koshe','Karakore','Saris','Saris Abo','Gotera','Kera','Bulgaria','Bisrate Gabriel','Old Airport','Mekanisa','Jemo 1','Jemo 2','Jemo 3','Lebu','Mebrat Hail','Hana Mariam','Lafto','Gofa Camp','Gofa Gabriel','Kality','Gelan','Tulu Dimtu','Akaki','Sari-Addis','Bulbula Lemi','Furi','Sebeta Road','Sululta Road','Burayu Area','Legedadi Area','Sendafa Road','Dukem Road','Merkato','Raguel','Bomb Tera','Dubai Tera','Ehil Berenda'];
var deliveryZonesDraft=[];
var deliveryZoneFilter='';
function deliveryGroupKey(z){return String(Math.max(0,Number(z.fee)||0))+'|'+String(Math.max(1,Number(z.maxHours)||24))}
function deliveryZoneGroups(){var map={};deliveryZonesDraft.forEach(function(z){var key=deliveryGroupKey(z);if(!map[key])map[key]={key:key,fee:Math.max(0,Number(z.fee)||0),maxHours:Math.max(1,Number(z.maxHours)||24),areas:[]};map[key].areas.push(z.area)});return Object.keys(map).map(function(k){map[k].areas.sort(function(a,b){return a.localeCompare(b)});return map[k]}).sort(function(a,b){return a.fee-b.fee||a.maxHours-b.maxHours})}
function renderDeliveryZoneRows(){var box=document.getElementById('delivery-zone-list');if(!box)return;var groups=deliveryZoneGroups();if(!groups.length){box.innerHTML='<div class="rounded-lg border border-dashed border-slate-700 p-4 text-sm text-slate-400">No grouped location prices yet. Select locations with the same price and save them together.</div>';return}box.innerHTML=groups.map(function(g){return'<div class="card p-4 bg-slate-900/40"><div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3"><div><div class="text-white font-semibold text-sm">'+esc(g.fee)+' ETB - max '+esc(g.maxHours)+' hour'+(Number(g.maxHours)===1?'':'s')+'</div><div class="text-xs text-slate-400 mt-1">'+esc(g.areas.length)+' location'+(g.areas.length===1?'':'s')+' in this price group</div></div><button type="button" onclick="removeDeliveryZoneGroup(&quot;'+esc(g.key)+'&quot;)" class="btn btn-ghost text-xs"><i class="fas fa-trash"></i> Remove Group</button></div><div class="flex flex-wrap gap-2 mt-3">'+g.areas.map(function(area){return'<span class="rounded-full bg-slate-800 border border-slate-700 px-2 py-1 text-xs text-slate-300">'+esc(area)+'</span>'}).join('')+'</div></div>'}).join('')}
function deliverySelectedAreas(){return Array.from(document.querySelectorAll('.delivery-zone-check:checked')).map(function(input){return input.value})}
function updateDeliverySelectedCount(){var el=document.getElementById('delivery-selected-count');if(el)el.textContent=deliverySelectedAreas().length+' selected'}
function renderDeliveryLocationPicker(){var box=document.getElementById('delivery-zone-picker');if(!box)return;var q=(deliveryZoneFilter||'').toLowerCase();var priced={};deliveryZonesDraft.forEach(function(z){priced[z.area]=z});var areas=ADDIS_DELIVERY_LOCATIONS.filter(function(area){return !q||area.toLowerCase().includes(q)});box.innerHTML=areas.map(function(area){var existing=priced[area];return'<label class="flex items-center gap-2 rounded-lg border '+(existing?'border-blue-500/30 bg-blue-500/5':'border-slate-700 bg-slate-900/50')+' px-3 py-2 text-xs text-slate-200 cursor-pointer hover:border-sprint-400"><input type="checkbox" class="delivery-zone-check" value="'+esc(area)+'" onchange="updateDeliverySelectedCount()"> <span class="flex-1">'+esc(area)+'</span>'+(existing?'<span class="text-[10px] text-blue-200">'+esc(existing.fee)+' ETB</span>':'')+'</label>'}).join('')||'<div class="text-xs text-slate-500 p-3">No locations match that search.</div>';updateDeliverySelectedCount()}
function filterDeliveryZonePicker(){deliveryZoneFilter=((document.getElementById('delivery-zone-search')||{}).value||'').trim();renderDeliveryLocationPicker()}
function selectUnpricedDeliveryLocations(){var priced={};deliveryZonesDraft.forEach(function(z){priced[z.area]=true});document.querySelectorAll('.delivery-zone-check').forEach(function(input){input.checked=!priced[input.value]});updateDeliverySelectedCount()}
function clearDeliveryLocationSelection(){document.querySelectorAll('.delivery-zone-check').forEach(function(input){input.checked=false});updateDeliverySelectedCount()}
function addDeliveryZoneDraft(){var areas=deliverySelectedAreas();var fee=Math.max(0,Number((document.getElementById('delivery-zone-fee')||{}).value)||0);var maxHours=Math.max(1,Number((document.getElementById('delivery-zone-hours')||{}).value)||24);if(!areas.length){showToast('Choose at least one location for this price group.','warning');return}areas.forEach(function(area){var existing=deliveryZonesDraft.find(function(z){return z.area===area});if(existing){existing.fee=fee;existing.maxHours=maxHours;existing.enabled=true}else{deliveryZonesDraft.push({area:area,fee:fee,maxHours:maxHours,enabled:true})}});deliveryZonesDraft.sort(function(a,b){return a.area.localeCompare(b.area)});clearDeliveryLocationSelection();renderDeliveryLocationPicker();renderDeliveryZoneRows();showToast(areas.length+' location'+(areas.length===1?'':'s')+' saved to this price group.','success')}
function removeDeliveryZoneGroup(key){deliveryZonesDraft=deliveryZonesDraft.filter(function(z){return deliveryGroupKey(z)!==key});renderDeliveryLocationPicker();renderDeliveryZoneRows()}
function toggleDeliveryModeFields(){var mode=(document.getElementById('delivery-mode')||{}).value||'fixed_addis';var fixed=document.getElementById('delivery-fixed-panel');var zones=document.getElementById('delivery-zones-panel');if(fixed)fixed.style.display=mode==='fixed_addis'?'block':'none';if(zones)zones.style.display=mode==='location_zones'?'block':'none'}
function renderDeliveryTab(c){
  var cs=(client||{}).settings||{}, delivery=cs.delivery||{};
  deliveryZonesDraft=Array.isArray(delivery.zones)?delivery.zones.map(function(z){return{area:z.area||z.name||'',fee:Number(z.fee)||0,maxHours:Number(z.maxHours)||24,enabled:z.enabled!==false}}).filter(function(z){return z.area}):[];
  var mode=delivery.mode||'fixed_addis';if(mode==='distance_later')mode='manual';
  c.innerHTML='<div class="space-y-6"><div><h2 class="text-xl font-semibold text-white"><i class="fas fa-truck text-sprint-400 mr-2"></i>Delivery Settings</h2><p class="text-sm text-slate-400 mt-1">Configure delivery zones, fees, and rules.</p></div>'+
  '<div class="card p-6"><h3 class="text-white font-semibold mb-4">Delivery Configuration</h3>'+
  '<form onsubmit="saveDeliverySettings(event)" class="space-y-3">'+
  '<div><label class="text-xs text-slate-400 block mb-1">Delivery Pricing Mode</label><select id="delivery-mode" class="field" onchange="toggleDeliveryModeFields()">'+
  [{v:'fixed_addis',t:'One fixed Addis Ababa fee'},{v:'location_zones',t:'Grouped prices by Addis location'},{v:'manual',t:'Manual confirmation'}].map(function(m){return'<option value="'+m.v+'"'+(mode===m.v?' selected':'')+'>'+m.t+'</option>'}).join('')+'</select><p class="text-xs text-slate-500 mt-1">Choose one pricing system. Fixed Addis and location-group pricing cannot run at the same time.</p></div>'+
  '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">'+
  '<div id="delivery-fixed-panel"><label class="text-xs text-slate-400 block mb-1">Fixed Addis Delivery Fee (ETB)</label><input id="delivery-addis-fee" class="field" type="number" min="0" value="'+esc(delivery.addis_delivery_fee ?? '300')+'"></div>'+
  '<div><label class="text-xs text-slate-400 block mb-1">Outside Addis Behavior</label><select id="delivery-outside" class="field">'+
  ['manual_confirmation','reject'].map(function(o){return'<option value="'+o+'"'+((delivery.outside_addis_behavior||'manual_confirmation')===o?' selected':'')+'>'+o.replace(/_/g,' ').replace(/\b\w/g,function(l){return l.toUpperCase()})+'</option>'}).join('')+'</select></div>'+
  '</div>'+
  '<div><label class="text-xs text-slate-400 block mb-1">Shop Address</label><input id="delivery-address" class="field" value="'+esc(delivery.shop_address||cs.businessProfile?.address||'')+'" placeholder="Bole, Addis Ababa"></div>'+
  '<div id="delivery-zones-panel" class="card p-4 bg-slate-900/40"><div class="grid grid-cols-1 lg:grid-cols-[1fr_160px_160px_auto] gap-3 lg:items-end"><div><label class="text-xs text-slate-400 block mb-1">Choose Locations With This Same Price</label><input id="delivery-zone-search" class="field mb-2" placeholder="Search locations..." oninput="filterDeliveryZonePicker()"><div class="flex gap-2 mb-2"><button type="button" onclick="selectUnpricedDeliveryLocations()" class="btn btn-ghost text-xs"><i class="fas fa-check-double"></i> Select Unpriced</button><button type="button" onclick="clearDeliveryLocationSelection()" class="btn btn-ghost text-xs"><i class="fas fa-times"></i> Clear</button><span id="delivery-selected-count" class="text-xs text-slate-500 self-center">0 selected</span></div><div id="delivery-zone-picker" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1"></div></div><div><label class="text-xs text-slate-400 block mb-1">Fee (ETB)</label><input id="delivery-zone-fee" class="field" type="number" min="0" value="150"></div><div><label class="text-xs text-slate-400 block mb-1">Max Hours</label><input id="delivery-zone-hours" class="field" type="number" min="1" max="168" value="4"></div><button type="button" onclick="addDeliveryZoneDraft()" class="btn btn-secondary text-xs"><i class="fas fa-save"></i> Save Group</button></div><p class="text-xs text-slate-500 mt-3">Example: choose Bole Atlas, Bole Medhanialem, and Gerji, set 150 ETB and 4 hours, then save one group.</p><div id="delivery-zone-list" class="space-y-2 mt-4"></div></div>'+
  '<button type="submit" class="btn btn-primary text-xs"><i class="fas fa-save"></i> Save Delivery Settings</button>'+
  '</form></div></div>';
  setTimeout(function(){renderDeliveryLocationPicker();renderDeliveryZoneRows();toggleDeliveryModeFields()},0);
}

async function saveDeliverySettings(e){
  e.preventDefault();
  var mode=document.getElementById('delivery-mode').value;
  var body={deliveryMode:mode,addisDeliveryFee:Number((document.getElementById('delivery-addis-fee')||{}).value)||0,outsideAddisBehavior:document.getElementById('delivery-outside').value,shopAddress:document.getElementById('delivery-address').value,deliveryZones:mode==='location_zones'?deliveryZonesDraft:[]};
  try{var res=await apiFetch('/api/client/settings',{method:'PUT',body:JSON.stringify(body)});if(res&&res.client){client=res.client}else{client.settings=client.settings||{};client.settings.delivery={...(client.settings.delivery||{}),mode:body.deliveryMode,addis_delivery_fee:body.addisDeliveryFee,outside_addis_behavior:body.outsideAddisBehavior,shop_address:body.shopAddress,zones:body.deliveryZones}}showToast('Delivery settings saved.','success');switchClientTab('delivery')}catch(err){showToast(err.message,'error')}
}

// â”€â”€ Admin Dashboard â”€â”€
var ETH_PAYMENT_METHODS=['Telebirr','Commercial Bank of Ethiopia (CBE)','Awash Bank','Dashen Bank','Bank of Abyssinia','Cooperative Bank of Oromia','Wegagen Bank','Hibret Bank','Nib International Bank','Zemen Bank','Oromia Bank','Lion International Bank','Bunna Bank','Berhan Bank','Abay Bank','Addis International Bank','Debub Global Bank','Enat Bank','Amhara Bank','Goh Betoch Bank','ZamZam Bank','Hijra Bank','Siinqee Bank','Tsedey Bank','Ahadu Bank','Tsehay Bank','Shabelle Bank','Gadaa Bank','Sidama Bank','Rammis Bank','Siket Bank','Omo Bank','Global Bank Ethiopia'];
function paymentMethodOptions(selected){return'<option value="">Select payment method</option>'+ETH_PAYMENT_METHODS.map(function(m){return'<option value="'+esc(m)+'"'+(selected===m?' selected':'')+'>'+esc(m)+'</option>'}).join('')}
function paymentOptionRow(i,opt){opt=opt||{};return'<div class="card p-4 bg-slate-900/40"><div class="flex items-center justify-between mb-3"><h4 class="text-white text-sm font-semibold">Payment Option '+(i+1)+'</h4><span class="text-xs text-slate-500">Optional</span></div><div class="grid grid-cols-1 md:grid-cols-3 gap-3"><div><label class="text-xs text-slate-400 block mb-1">Bank / Wallet</label><select id="pay-method-'+i+'" class="field">'+paymentMethodOptions(opt.method||'')+'</select></div><div><label class="text-xs text-slate-400 block mb-1">Account Number</label><input id="pay-account-'+i+'" class="field" value="'+esc(opt.accountNumber||'')+'" placeholder="Account or wallet number"></div><div><label class="text-xs text-slate-400 block mb-1">Account Full Name</label><input id="pay-name-'+i+'" class="field" value="'+esc(opt.accountName||'')+'" placeholder="Registered account name"></div></div></div>'}
function isCakeClient(){
  var bp=(((client||{}).settings||{}).businessProfile)||{};
  var text=String(bp.retailType||bp.businessType||client?.businessTypeLabel||'').toLowerCase();
  return /cake|bakery|pastry|dessert/.test(text);
}
function cakePaymentSettingsPanel(settings){
  if(!isCakeClient())return'';
  var cake=settings.cakeOrderSettings||{};
  var mode=cake.paymentMode||'full';
  var type=cake.depositType||'percent';
  var value=Number(cake.depositValue||30)||0;
  return '<div class="card p-4 border border-pink-500/20 bg-pink-500/5"><h3 class="text-sm font-semibold text-white mb-2">Cake Kabd / advance payment</h3><p class="text-xs text-slate-400 mb-3">Choose whether cake shoppers pay the full amount now or a first advance payment before the cake is prepared.</p><div class="grid grid-cols-1 md:grid-cols-3 gap-3"><div><label class="text-xs text-slate-400 block mb-1">Cake payment rule</label><select id="cake-payment-mode" class="field"><option value="full"'+(mode!=='deposit'?' selected':'')+'>Full payment</option><option value="deposit"'+(mode==='deposit'?' selected':'')+'>Kabd / deposit first</option></select></div><div><label class="text-xs text-slate-400 block mb-1">Deposit type</label><select id="cake-deposit-type" class="field"><option value="percent"'+(type!=='fixed'?' selected':'')+'>Percent of order</option><option value="fixed"'+(type==='fixed'?' selected':'')+'>Fixed Birr amount</option></select></div><div><label class="text-xs text-slate-400 block mb-1">Deposit value</label><input id="cake-deposit-value" class="field" type="number" min="0" max="999999" value="'+esc(value)+'"></div></div><p class="text-xs text-slate-500 mt-3">Example: 30 percent Kabd means a 2,000 Birr cake asks for 600 Birr now and records 1,400 Birr balance.</p></div>';
}
function renderPaymentTab(c){
  var cs=(client||{}).settings||{},opts=Array.isArray(cs.paymentOptions)?cs.paymentOptions:[],pv=cs.paymentVerification||{},plan=String(((client||{}).billing||{}).plan||'basic').toLowerCase(),isPro=plan==='pro',mode=cs.paymentVerificationMode||pv.mode||'manual',autoAvailable=!!pv.automaticAvailable;
  var autoDisabled=!isPro||!autoAvailable;
  var autoHelp=!isPro?'Automatic verification is a Pro plan option. Manual owner approval still works.':(!pv.apiConfigured?'Automatic verification is waiting for the SprintSales server key.':'SprintSales will check reference, amount, and receiver account before approving.');
  c.innerHTML='<div class="space-y-6"><div><h2 class="text-xl font-semibold text-white"><i class="fas fa-credit-card text-sprint-400 mr-2"></i>Payment Settings</h2><p class="text-sm text-slate-400 mt-1">Add up to 3 accounts customers can pay after confirming an order.</p></div><form onsubmit="savePaymentSettings(event)" class="space-y-4"><div class="card p-4"><h3 class="text-sm font-semibold text-white mb-2">Payment approval mode</h3><p class="text-xs text-slate-500 mb-3">Choose how payment proofs are handled after shoppers pay.</p><div class="grid grid-cols-1 md:grid-cols-2 gap-3"><label class="rounded-xl border border-slate-700 p-4 cursor-pointer '+(mode!=='automatic'?'bg-sprint-500/10 border-sprint-400/40':'')+'"><div class="flex items-start gap-3"><input type="radio" name="payment-verification-mode" value="manual" '+(mode!=='automatic'?'checked':'')+' class="mt-1"><div><p class="text-sm font-semibold text-white">Manual approval</p><p class="text-xs text-slate-500 mt-1">The shop owner receives the proof and confirms or rejects it after checking the bank/wallet.</p></div></div></label><label class="rounded-xl border border-slate-700 p-4 '+(autoDisabled?'opacity-60':'cursor-pointer ')+(mode==='automatic'?'bg-green-500/10 border-green-400/40':'')+'"><div class="flex items-start gap-3"><input type="radio" name="payment-verification-mode" value="automatic" '+(mode==='automatic'?'checked':'')+' '+(autoDisabled?'disabled':'')+' class="mt-1"><div><p class="text-sm font-semibold text-white">Automatic verification <span class="badge badge-active text-xs ml-1">Pro</span></p><p class="text-xs text-slate-500 mt-1">'+esc(autoHelp)+'</p></div></div></label></div></div>'+cakePaymentSettingsPanel(cs)+[0,1,2].map(function(i){return paymentOptionRow(i,opts[i])}).join('')+'<div class="card p-4 border border-yellow-500/20 bg-yellow-500/5"><p class="text-xs text-yellow-200"><i class="fas fa-info-circle mr-1"></i>Only filled rows are saved. Customers see these details only after the system knows the delivery fee. Automatic mode asks shoppers to paste the bank/Telebirr SMS or transaction reference as text.</p></div><button type="submit" class="btn btn-primary text-xs"><i class="fas fa-save"></i> Save Payment Settings</button></form></div>';
}
async function savePaymentSettings(e){
  e.preventDefault();
  var paymentOptions=[0,1,2].map(function(i){return{method:(document.getElementById('pay-method-'+i)||{}).value||'',accountNumber:((document.getElementById('pay-account-'+i)||{}).value||'').trim(),accountName:((document.getElementById('pay-name-'+i)||{}).value||'').trim()}}).filter(function(row){return row.method&&row.accountNumber&&row.accountName});
  var selected=document.querySelector('input[name="payment-verification-mode"]:checked');
  var paymentVerificationMode=selected?selected.value:'manual';
  var body={paymentOptions:paymentOptions,paymentVerificationMode:paymentVerificationMode};
  if(isCakeClient()){
    body.cakeOrderSettings={
      paymentMode:((document.getElementById('cake-payment-mode')||{}).value||'full')==='deposit'?'deposit':'full',
      depositType:((document.getElementById('cake-deposit-type')||{}).value||'percent')==='fixed'?'fixed':'percent',
      depositValue:Math.max(0,Number((document.getElementById('cake-deposit-value')||{}).value)||0),
      writingRequired:true
    };
  }
  try{
    var res=await apiFetch('/api/client/settings',{method:'PUT',body:JSON.stringify(body)});
    if(res&&res.client){client=res.client}else{client.settings=client.settings||{};client.settings.paymentOptions=paymentOptions;client.settings.paymentVerificationMode=paymentVerificationMode;if(body.cakeOrderSettings)client.settings.cakeOrderSettings=body.cakeOrderSettings}
    showToast('Payment settings saved.','success');
    switchClientTab('payment');
  }catch(err){showToast(err.message,'error')}
}

function miniappSlug(value){return String(value||'').toLowerCase().trim().replace(/['"]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)}
function miniappDefaultSlug(){var s=((client||{}).settings||{}).miniapp||{};return miniappSlug(s.slug||((client||{}).businessName)||((client||{}).id)||'shop')}
function miniappPublicBase(){return window.location.origin||'https://automation.sprintsales.net'}
function miniappPlatformDomain(){var host=String(window.location.hostname||'').toLowerCase().replace(/^www\./,'');return host.endsWith('sprintsales.net')?'sprintsales.net':''}
function miniappCleanDomain(value){return String(value||'').trim().toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0]}
function miniappUrlForSlug(slug,customDomain){var cleanCustom=miniappCleanDomain(customDomain);if(cleanCustom)return'https://'+cleanCustom;var cleanSlug=miniappSlug(slug)||miniappDefaultSlug();var domain=miniappPlatformDomain();return domain?'https://'+cleanSlug+'.'+domain:miniappPublicBase()+'/shop/'+encodeURIComponent(cleanSlug)}
function updateMiniappPreview(){var slug=(document.getElementById('miniapp-slug')||{}).value||miniappDefaultSlug();var custom=(document.getElementById('miniapp-domain')||{}).value||'';var url=miniappUrlForSlug(slug,custom);var link=document.getElementById('miniapp-preview-link');var text=document.getElementById('miniapp-preview-text');if(link){link.href=url;link.textContent=url}if(text)text.value=url}
var MINIAPP_DESIGNS=[
  {id:'clean-retail',label:'Design A',name:'Modern Retail',description:'Compact, practical, and optimized for fast everyday shopping.',poster:'/miniapp/previews/design-a-poster.jpg',video:'/miniapp/previews/design-a-preview.mp4'},
  {id:'editorial-boutique',label:'Design B',name:'Editorial Boutique',description:'A premium image-led catalog for brands that want products to stand out.',poster:'/miniapp/previews/design-b-poster.jpg',video:'/miniapp/previews/design-b-preview.mp4'}
];
function normalizeMiniappTemplate(value){return MINIAPP_DESIGNS.some(function(item){return item.id===value})?value:'clean-retail'}
async function chooseMiniappTemplate(value){var selected=normalizeMiniappTemplate(value),input=document.getElementById('miniapp-template');if(input)input.value=selected;document.querySelectorAll('[data-miniapp-design]').forEach(function(card){var active=card.getAttribute('data-miniapp-design')===selected;card.classList.toggle('selected',active);var button=card.querySelector('[data-choose-design]');if(button){button.classList.toggle('btn-primary',active);button.classList.toggle('btn-secondary',!active);button.innerHTML=active?'<i class="fas fa-spinner loading-spinner"></i> Saving':'Use this design';button.disabled=active}});try{var current=(((client||{}).settings||{}).miniapp)||{};var miniapp={enabled:current.enabled!==false,slug:miniappSlug(current.slug||miniappDefaultSlug()),customDomain:miniappCleanDomain(current.customDomain||''),template:selected,themeColor:current.themeColor||'#0f2a52',accentColor:current.accentColor||'#14b8a6'};var res=await apiFetch('/api/client/settings',{method:'PUT',body:JSON.stringify({miniapp:miniapp})});if(res&&res.client){client=res.client}else{client.settings=client.settings||{};client.settings.miniapp=miniapp}showToast('Design saved and published.','success');switchClientTab('miniapp')}catch(err){showToast(err.message||'Could not save the design.','error');switchClientTab('miniapp')}}
function miniappDesignPicker(current,isCake){if(isCake)return '<section class="card p-5 miniapp-cake-design-note"><div class="flex gap-3"><i class="fas fa-cake-candles text-pink-500 mt-1"></i><div><h3 class="text-white font-semibold">Cake storefront active</h3><p class="text-sm text-slate-400 mt-1">Cake businesses keep the dedicated image-first cake design built for custom orders and deposits.</p></div></div><input id="miniapp-template" type="hidden" value="clean-retail"></section>';return '<section class="card p-5"><div class="flex flex-col md:flex-row md:items-end justify-between gap-2 mb-4"><div><h3 class="text-white font-semibold">Choose your shop design</h3><p class="text-sm text-slate-400 mt-1">Changing the design publishes immediately and does not change products, orders, payments, or customer data.</p></div><span class="text-xs text-slate-500">Tap play for a short preview</span></div><input id="miniapp-template" type="hidden" value="'+esc(normalizeMiniappTemplate(current))+'"><div class="miniapp-design-grid">'+MINIAPP_DESIGNS.map(function(item){var active=item.id===normalizeMiniappTemplate(current);return '<article class="miniapp-design-card '+(active?'selected':'')+'" data-miniapp-design="'+esc(item.id)+'"><div class="miniapp-design-media"><video muted loop playsinline controls preload="none" poster="'+esc(item.poster)+'"><source src="'+esc(item.video)+'" type="video/mp4"></video><span>'+esc(item.label)+'</span></div><div class="miniapp-design-copy"><h4>'+esc(item.name)+'</h4><p>'+esc(item.description)+'</p><button type="button" class="btn '+(active?'btn-primary':'btn-secondary')+' text-xs" data-choose-design onclick="chooseMiniappTemplate(\''+esc(item.id)+'\')" '+(active?'disabled':'')+'>'+(active?'<i class="fas fa-check"></i> Selected':'Use this design')+'</button></div></article>'}).join('')+'</div></section>'}
function renderMiniappTab(c){var cs=(client||{}).settings||{},m=cs.miniapp||{},slug=miniappSlug(m.slug||cs.storeSlug||(client||{}).businessName||(client||{}).id),enabled=m.enabled!==false,template=normalizeMiniappTemplate(m.template||'clean-retail'),theme=m.themeColor||'#0f2a52',accent=m.accentColor||'#14b8a6',custom=m.customDomain||cs.miniappDomain||'',productCount=(appState.products||[]).filter(function(p){return p.isActive!==false}).length,isCake=clientIsCakeBusiness(cs),url=miniappUrlForSlug(slug,custom);c.innerHTML='<div class="space-y-6"><div class="flex flex-col lg:flex-row lg:items-end justify-between gap-3"><div><h2 class="text-xl font-semibold text-white"><i class="fas fa-mobile-screen-button text-sprint-400 mr-2"></i>MiniApp Shop</h2><p class="text-sm text-slate-400 mt-1">A mobile storefront that uses the same products, prices, images, delivery, and payment settings already in SprintSales.</p></div><a id="miniapp-preview-link" href="'+esc(url)+'" target="_blank" rel="noopener" class="btn btn-secondary text-xs"><i class="fas fa-arrow-up-right-from-square"></i> Open MiniApp</a></div>'+miniappDesignPicker(template,isCake)+
'<div class="grid grid-cols-1 xl:grid-cols-[1fr_.8fr] gap-5"><form onsubmit="saveMiniappSettings(event)" class="card p-5 space-y-4"><h3 class="text-white font-semibold">MiniApp Doorway</h3><label class="flex items-center gap-2 text-sm text-white"><input id="miniapp-enabled" type="checkbox" '+(enabled?'checked':'')+'> Enable MiniApp catalog</label><div><label class="text-xs text-slate-400 block mb-1">Shop link slug</label><div class="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2"><input id="miniapp-slug" class="field" value="'+esc(slug)+'" placeholder="aman-electronics" oninput="this.value=miniappSlug(this.value);updateMiniappPreview()"><button type="button" class="btn btn-ghost text-xs" onclick="document.getElementById(\'miniapp-slug\').value=miniappDefaultSlug();updateMiniappPreview()"><i class="fas fa-wand-magic-sparkles"></i> Use business name</button></div><p class="text-xs text-slate-500 mt-1">This creates a public link like https://'+esc(slug||'your-shop')+'.sprintsales.net.</p></div><div><label class="text-xs text-slate-400 block mb-1">Public MiniApp URL</label><input id="miniapp-preview-text" class="field" readonly value="'+esc(url)+'"></div><div><label class="text-xs text-slate-400 block mb-1">Custom domain</label><input id="miniapp-domain" class="field" value="'+esc(custom)+'" placeholder="shop.yourbusiness.com" oninput="updateMiniappPreview()"><p class="text-xs text-slate-500 mt-1">Optional. The domain must point to SprintSales before it can load this shop.</p></div><div class="grid grid-cols-1 md:grid-cols-2 gap-3"><div><label class="text-xs text-slate-400 block mb-1">Navy / main color</label><input id="miniapp-theme" class="field" type="color" value="'+esc(theme)+'"></div><div><label class="text-xs text-slate-400 block mb-1">Accent color</label><input id="miniapp-accent" class="field" type="color" value="'+esc(accent)+'"></div></div><p class="text-xs text-slate-500">Colors are applied to the selected design while all shop data stays unchanged.</p><button type="submit" class="btn btn-primary text-xs"><i class="fas fa-save"></i> Save MiniApp Settings</button></form>'+
'<div class="space-y-4"><div class="card p-5"><h3 class="text-white font-semibold mb-3">What the MiniApp Uses</h3><div class="space-y-3 text-sm text-slate-300"><div class="flex gap-3"><i class="fas fa-box text-sprint-400 mt-1"></i><p><b class="text-white">'+esc(productCount)+'</b> active product'+(productCount===1?'':'s')+' from Products.</p></div><div class="flex gap-3"><i class="fas fa-image text-sprint-400 mt-1"></i><p>Watermarked/public product images already saved in SprintSales.</p></div><div class="flex gap-3"><i class="fas fa-tag text-sprint-400 mt-1"></i><p>Existing prices, product codes, categories, colors, sizes, delivery fees, and payment accounts.</p></div><div class="flex gap-3"><i class="fas fa-cart-shopping text-sprint-400 mt-1"></i><p>Shoppers can search, view details, submit orders, and receive payment instructions from the same dashboard data.</p></div></div></div><div class="card p-5 border border-blue-500/20 bg-blue-500/5"><h3 class="text-white font-semibold mb-2">Good to know</h3><p class="text-sm text-slate-400">For now payment proof and support still continue through Telegram, while orders created here appear in your Orders section.</p></div></div></div></div>';setTimeout(updateMiniappPreview,0)}
async function saveMiniappSettings(e){e.preventDefault();var miniapp={enabled:document.getElementById('miniapp-enabled').checked,slug:miniappSlug(document.getElementById('miniapp-slug').value||miniappDefaultSlug()),customDomain:(document.getElementById('miniapp-domain').value||'').trim().toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0],template:document.getElementById('miniapp-template').value,themeColor:document.getElementById('miniapp-theme').value||'#0f2a52',accentColor:document.getElementById('miniapp-accent').value||'#14b8a6'};try{var res=await apiFetch('/api/client/settings',{method:'PUT',body:JSON.stringify({miniapp:miniapp})});if(res&&res.client){client=res.client}else{client.settings=client.settings||{};client.settings.miniapp=miniapp}showToast('MiniApp settings saved.','success');switchClientTab('miniapp')}catch(err){showToast(err.message,'error')}}

async function loadAdminDashboard(){document.body.classList.add('admin-dashboard');document.body.classList.remove('client-dashboard');var mobileNav=document.getElementById('mobile-bottom-nav');if(mobileNav)mobileNav.remove();client=null;appState={};var banner=document.getElementById('status-banner');if(banner)banner.classList.add('hidden');document.getElementById('loading').classList.add('hidden');document.getElementById('public-page').classList.add('hidden');document.getElementById('error-page').classList.add('hidden');document.getElementById('dashboard').classList.remove('hidden');document.getElementById('sidebar-biz-name').textContent='SprintSales Admin';document.getElementById('sidebar-role-badge').textContent='Admin';document.getElementById('sidebar-role-badge').className='badge badge-active text-xs';if(window.innerWidth<768)document.getElementById('mobile-menu-btn').style.display='block';window.scrollTo(0,0);switchAdminTab(currentTab||'overview')}

function switchAdminTab(tab){currentTab=tab;renderAdminTab(tab);var nav=[{type:'label',text:'Admin'},{text:'Overview',icon:'gauge-high',action:"switchAdminTab('overview')",active:tab==='overview'},{text:'Retail Analytics',icon:'chart-line',action:"switchAdminTab('analytics')",active:tab==='analytics'},{text:'Pending Approvals',icon:'user-check',action:"switchAdminTab('approvals')",active:tab==='approvals'},{text:'Client Control',icon:'building',action:"switchAdminTab('clients')",active:tab==='clients'},{text:'Billing',icon:'file-invoice-dollar',action:"switchAdminTab('billing')",active:tab==='billing'},{text:'Client Notices',icon:'bell',action:"switchAdminTab('notices')",active:tab==='notices'},{text:'Storage & Backups',icon:'database',action:"switchAdminTab('storage')",active:tab==='storage'},{text:'Admin Settings',icon:'cog',action:"switchAdminTab('settings')",active:tab==='settings'||tab==='system'||tab==='aiproviders'},{text:'Audit Log',icon:'history',action:"switchAdminTab('audit')",active:tab==='audit'}];buildSidebar(nav)}

async function renderAdminTab(tab){var c=document.getElementById('dashboard-content');c.innerHTML='<div class="text-center py-12"><i class="fas fa-spinner loading-spinner text-2xl text-sprint-400 mb-3 block"></i><p class="text-slate-400">Loading...</p></div>';try{if(tab==='overview'){await renderAdminOverviewTab(c)}else if(tab==='analytics'){await renderAdminAnalyticsTab(c)}else if(tab==='approvals'){await renderApprovalsTab(c)}else if(tab==='clients'){await renderAdminClientsTabV2(c)}else if(tab==='billing'){await renderAdminBillingTab(c)}else if(tab==='notices'){await renderAdminNoticesTab(c)}else if(tab==='storage'){await renderAdminStorageTab(c)}else if(tab==='settings'||tab==='system'||tab==='aiproviders'){await renderAdminSettingsTabV2(c)}else if(tab==='audit'){await renderAdminAuditTabV2(c)}else{await renderAdminOverviewTab(c)}}catch(err){c.innerHTML='<div class="card p-6 text-center"><p class="text-red-400">Error: '+esc(err.message)+'</p><button onclick="renderAdminTab(\''+esc(tab)+'\')" class="btn btn-ghost mt-3"><i class="fas fa-redo"></i> Retry</button></div>'}}
function adminConfirmModal(opts){opts=opts||{};return new Promise(function(resolve){var existing=document.getElementById('admin-confirm-modal');if(existing)existing.remove();var danger=opts.danger!==false;var wrap=document.createElement('div');wrap.id='admin-confirm-modal';wrap.className='fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4';wrap.innerHTML='<div class="w-full max-w-md rounded-xl bg-white text-slate-900 shadow-2xl border border-slate-200 overflow-hidden"><div class="p-5 border-b border-slate-200"><div class="flex items-start gap-3"><div class="w-10 h-10 rounded-lg flex items-center justify-center '+(danger?'bg-red-50 text-red-600':'bg-blue-50 text-blue-700')+'"><i class="fas fa-'+(danger?'shield-halved':'lock')+'"></i></div><div><h3 class="font-semibold text-lg">'+esc(opts.title||'Confirm Admin Action')+'</h3><p class="text-sm text-slate-500 mt-1">'+esc(opts.message||'Enter your admin password to continue.')+'</p></div></div></div><div class="p-5 space-y-3"><label class="text-xs font-semibold text-slate-500 block">Admin Password</label><input id="admin-confirm-password" type="password" class="field" autocomplete="current-password" placeholder="Enter your admin password"><p class="text-xs text-slate-500">'+esc(opts.help||'This action will be recorded in the audit log.')+'</p></div><div class="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2"><button type="button" id="admin-confirm-cancel" class="btn btn-ghost text-xs">Cancel</button><button type="button" id="admin-confirm-ok" class="btn '+(danger?'btn-danger':'btn-primary')+' text-xs"><i class="fas fa-check"></i> Confirm</button></div></div>';document.body.appendChild(wrap);var input=document.getElementById('admin-confirm-password'),ok=document.getElementById('admin-confirm-ok'),cancel=document.getElementById('admin-confirm-cancel');function close(value){wrap.remove();resolve(value)}cancel.onclick=function(){close('')};ok.onclick=function(){close(input.value||'')};wrap.addEventListener('keydown',function(e){if(e.key==='Escape')close('');if(e.key==='Enter')close(input.value||'')});setTimeout(function(){input.focus()},30)})}
function promptAdminPassword(reason){return adminConfirmModal({title:'Protected Admin Action',message:reason||'Confirm this admin action',danger:true})}

function adminStatCard(label,value,help,icon,tone){return'<div class="card p-4"><div class="flex items-start justify-between gap-3"><div><p class="text-xs uppercase tracking-wide text-slate-500">'+esc(label)+'</p><p class="text-2xl font-semibold text-white mt-1">'+esc(value)+'</p>'+(help?'<p class="text-xs text-slate-500 mt-1">'+esc(help)+'</p>':'')+'</div><div class="w-10 h-10 rounded-lg flex items-center justify-center '+(tone||'bg-sprint-500/10 text-sprint-400')+'"><i class="fas fa-'+esc(icon||'chart-line')+'"></i></div></div></div>'}
function adminStatusPill(label,ok){return'<span class="badge '+(ok?'badge-active':'badge-pending')+' text-xs">'+esc(label)+'</span>'}
function adminClientRiskScore(cl){var score=0,q=cl.quality||{},sig=q.signals||{};if((cl.status||'')==='pending')score+=2;if((cl.status||'')==='suspended'||(cl.billing||{}).status==='suspended')score+=3;if((cl.botDebug||{}).level==='bad')score+=5;if((cl.botDebug||{}).level==='warn')score+=2;if(Array.isArray(cl.healthWarnings))score+=cl.healthWarnings.length;if(Number(q.score||100)<70)score+=2;if(q.trustStatus==='watch')score+=2;if(q.trustStatus==='under_review')score+=5;if(q.trustStatus==='restricted_candidate')score+=8;score+=Math.min(4,Number(sig.lowRatings30d||0));score+=Math.min(5,Number(sig.lateReports30d||0));score+=Math.min(6,Number(sig.severeNonDelivery||0)*3);if(Array.isArray(cl.recentErrors))score+=Math.min(3,cl.recentErrors.length);return score}
function adminBackupFilename(prefix){var stamp=new Date().toISOString().replace(/[:.]/g,'-');return prefix+'-'+stamp}
async function downloadAdminJsonBackup(){try{var res=await fetch('/api/admin/backup',{credentials:'include'});if(!res.ok){var d=await res.json().catch(function(){return{error:'Backup failed ('+res.status+')'}});throw new Error(d.error||d.message||'Backup failed')}var blob=await res.blob();var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=adminBackupFilename('sprintsales-platform')+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(a.href)},500);showToast('JSON backup downloaded.','success')}catch(err){showToast(err.message,'error')}}
async function downloadAdminFullBackup(){var adminPassword=await promptAdminPassword('Download full platform backup');if(!adminPassword)return;try{var res=await fetch('/api/admin/backup/full',{credentials:'include',headers:{'x-admin-confirm-password':adminPassword}});if(!res.ok){var d=await res.json().catch(function(){return{error:'Full backup failed ('+res.status+')'}});throw new Error(d.error||d.message||'Full backup failed')}var blob=await res.blob();var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=adminBackupFilename('sprintsales-full-backup')+'.zip';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(a.href)},500);showToast('Full backup downloaded.','success')}catch(err){showToast(err.message,'error')}}
async function testAdminAlert(){var status=document.getElementById('admin-system-status')||document.getElementById('admin-overview-alert-status');if(status)status.textContent='Sending test alert...';try{await apiFetch('/api/admin/settings/test-alert',{method:'POST',body:JSON.stringify({})});if(status)status.textContent='Test alert sent.';showToast('Admin test alert sent.','success')}catch(err){if(status)status.textContent=err.message;showToast(err.message,'error')}}

async function renderAdminOverviewTab(c){
  var data=await Promise.all([apiFetch('/api/admin/clients'),apiFetch('/api/admin/settings'),apiFetch('/api/admin/storage').catch(function(){return null})]);
  var clients=(data[0]&&data[0].clients)||[],ps=((data[1]||{}).platformSettings)||{},storage=data[2]||{};
  var active=clients.filter(function(cl){return cl.status==='active'}).length;
  var pending=clients.filter(function(cl){return cl.status==='pending'}).length;
  var suspended=clients.filter(function(cl){return cl.status==='suspended'||((cl.billing||{}).status==='suspended')}).length;
  var botIssues=clients.filter(function(cl){return ['bad','warn'].includes((cl.botDebug||{}).level)}).length;
  var attention=clients.slice().map(function(cl){cl._risk=adminClientRiskScore(cl);return cl}).filter(function(cl){return cl._risk>0}).sort(function(a,b){return b._risk-a._risk}).slice(0,6);
  var totals=storage.totals||{},counts=storage.counts||{};
  c.innerHTML='<div class="space-y-6"><div class="flex flex-col lg:flex-row lg:items-end justify-between gap-3"><div><h2 class="text-xl font-semibold text-white"><i class="fas fa-gauge-high text-sprint-400 mr-2"></i>Admin Overview</h2><p class="text-sm text-slate-400 mt-1">Platform health, client risk, backup, and alert controls in one place.</p></div><div class="flex gap-2 flex-wrap"><button onclick="renderAdminTab(&quot;overview&quot;)" class="btn btn-ghost text-xs"><i class="fas fa-rotate"></i> Refresh</button><button onclick="switchAdminTab(&quot;settings&quot;)" class="btn btn-secondary text-xs"><i class="fas fa-cog"></i> Settings</button></div></div>'+
  '<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">'+
  adminStatCard('Total clients',clients.length,'All registered businesses','building','bg-sprint-500/10 text-sprint-400')+
  adminStatCard('Active clients',active,suspended+' suspended or billing-blocked','bolt','bg-green-500/10 text-green-500')+
  adminStatCard('Pending approvals',pending,'Waiting for admin review','user-check','bg-yellow-500/10 text-yellow-500')+
  adminStatCard('Bot warnings',botIssues,'Needs setup or attention','triangle-exclamation','bg-red-500/10 text-red-500')+
  '</div><div class="grid grid-cols-1 xl:grid-cols-[1.2fr_.8fr] gap-5"><div class="card p-5"><div class="flex items-center justify-between gap-3 mb-4"><div><h3 class="text-white font-semibold">Needs Attention</h3><p class="text-xs text-slate-500">Clients with setup, bot, billing, or quality warnings.</p></div><button onclick="switchAdminTab(&quot;clients&quot;)" class="btn btn-ghost text-xs">Open Client Control</button></div>'+
  (attention.length?'<div class="space-y-3">'+attention.map(function(cl){var debug=cl.botDebug||{},billing=(cl.billing||{}).status||'trial';return'<div class="rounded-lg border border-slate-700 p-3 flex flex-col md:flex-row md:items-center justify-between gap-3"><div><div class="flex flex-wrap items-center gap-2"><h4 class="text-sm font-semibold text-white">'+esc(cl.businessName||'Client')+'</h4><span class="badge badge-'+(cl.status==='active'?'active':cl.status==='pending'?'pending':'suspended')+' text-xs">'+esc(cl.status||'unknown')+'</span><span class="badge badge-pending text-xs">'+esc(billing)+'</span></div><p class="text-xs text-slate-400 mt-1">'+esc(debug.label||((cl.healthWarnings||[])[0])||'Review setup and account status')+'</p></div><button onclick="switchAdminTab(&quot;clients&quot;)" class="btn btn-secondary text-xs">Review</button></div>'}).join('')+'</div>':'<div class="rounded-lg border border-green-500/20 bg-green-500/5 p-5 text-sm text-green-700">No urgent client issues detected.</div>')+
  '</div><div class="space-y-5"><div class="card p-5"><h3 class="text-white font-semibold mb-3">System Controls</h3><div class="flex flex-wrap gap-2 text-sm">'+adminStatusPill(ps.adminBotToken==='configured'?'Admin bot connected':'Admin bot missing',ps.adminBotToken==='configured')+adminStatusPill(ps.adminAlertsEnabled?'Alerts enabled':'Alerts disabled',ps.adminAlertsEnabled)+adminStatusPill(ps.adminAlertChatId?'Admin chat saved':'Admin chat missing',Boolean(ps.adminAlertChatId))+'</div><div class="flex flex-wrap gap-2 mt-4"><button onclick="testAdminAlert()" class="btn btn-secondary text-xs"><i class="fas fa-paper-plane"></i> Test Alert</button><button onclick="switchAdminTab(&quot;settings&quot;)" class="btn btn-ghost text-xs"><i class="fas fa-shield-alt"></i> Configure</button></div><p id="admin-overview-alert-status" class="text-xs text-slate-500 mt-3"></p></div>'+
  '<div class="card p-5"><h3 class="text-white font-semibold mb-3">Storage & Backups</h3><div class="grid grid-cols-2 gap-3 text-xs"><div><p class="text-slate-500">Data</p><p class="text-white font-semibold">'+esc(totals.appDataMb||0)+' MB</p></div><div><p class="text-slate-500">Backups</p><p class="text-white font-semibold">'+esc(totals.backupsMb||0)+' MB</p></div><div><p class="text-slate-500">Products</p><p class="text-white font-semibold">'+esc(counts.products||0)+'</p></div><div><p class="text-slate-500">Images</p><p class="text-white font-semibold">'+esc(counts.productImages||0)+'</p></div></div><div class="flex flex-wrap gap-2 mt-4"><button onclick="downloadAdminJsonBackup()" class="btn btn-secondary text-xs"><i class="fas fa-file-code"></i> JSON Backup</button><button onclick="downloadAdminFullBackup()" class="btn btn-warning text-xs"><i class="fas fa-box-archive"></i> Full Backup</button><button onclick="switchAdminTab(&quot;storage&quot;)" class="btn btn-ghost text-xs">Details</button></div></div></div></div></div>';
}

async function renderAdminBillingTab(c){
  var d=await apiFetch('/api/admin/billing'),clients=d.clients||[],payments=d.payments||[],totals=d.totals||{},plans=d.subscriptionPlans||{};
  var basicAmount=((plans.basic||{}).amount)||0,proAmount=((plans.pro||{}).amount)||0;
  c.innerHTML='<div class="space-y-6"><div class="flex flex-col lg:flex-row lg:items-end justify-between gap-3"><div><h2 class="text-xl font-semibold text-white"><i class="fas fa-file-invoice-dollar text-sprint-400 mr-2"></i>Billing</h2><p class="text-sm text-slate-400 mt-1">Track renewal dates, payment amounts, and billing history for every client.</p></div><button onclick="renderAdminTab(&quot;billing&quot;)" class="btn btn-ghost text-xs"><i class="fas fa-rotate"></i> Refresh</button></div>'+
  '<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">'+adminStatCard('Due today',totals.dueToday||0,'Clients to follow up now','bell','bg-yellow-500/10 text-yellow-500')+adminStatCard('Overdue',totals.overdue||0,'Unpaid renewal dates in the past','triangle-exclamation','bg-red-500/10 text-red-500')+adminStatCard('Paid clients',totals.paid||0,'Marked paid in billing records','check-circle','bg-green-500/10 text-green-500')+adminStatCard('Recorded payments',adminMoney(totals.totalRecorded||0),'Manual payment history total','coins','bg-sprint-500/10 text-sprint-400')+'</div>'+
  '<form onsubmit="saveAdminBillingPlans(event)" class="card p-4"><h3 class="text-white font-semibold mb-2">Plan Pricing</h3><p class="text-xs text-slate-500 mb-3">Basic is the current first-version feature set. Pro is reserved for recommendations, match recommendations, and announcement campaigns.</p><div class="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end"><div><label class="text-xs text-slate-400 block mb-1">Basic amount</label><input id="billing-plan-basic" class="field" type="number" min="0" value="'+esc(basicAmount)+'"></div><div><label class="text-xs text-slate-400 block mb-1">Pro amount</label><input id="billing-plan-pro" class="field" type="number" min="0" value="'+esc(proAmount)+'"></div><button class="btn btn-primary text-xs" type="submit"><i class="fas fa-save"></i> Save Plan Prices</button></div></form>'+
  '<div class="card overflow-hidden"><div class="p-4 border-b border-slate-700"><h3 class="text-white font-semibold">Client Billing Status</h3><p class="text-xs text-slate-500 mt-1">Set plan, amount, and renewal date here. Recording a payment creates billing history.</p></div><div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="text-left text-xs uppercase text-slate-500 border-b border-slate-700"><th class="py-3 px-4">Client</th><th class="py-3 px-4">Status</th><th class="py-3 px-4">Plan</th><th class="py-3 px-4">Plan Amount</th><th class="py-3 px-4">Renewal</th><th class="py-3 px-4">Record Payment</th><th class="py-3 px-4">Note</th><th class="py-3 px-4">Save</th></tr></thead><tbody>'+clients.map(function(cl){var b=cl.billing||{};return'<tr class="border-b border-slate-800 align-top"><td class="py-3 px-4"><p class="text-white font-semibold">'+esc(cl.businessName||'Client')+'</p><p class="text-xs text-slate-500">'+esc(cl.retailType||'retail')+'</p></td><td class="py-3 px-4"><select id="billing-status-'+esc(cl.id)+'" class="field min-w-[120px]">'+['trial','paid','due','suspended'].map(function(st){return'<option value="'+st+'"'+((b.status||'trial')===st?' selected':'')+'>'+st+'</option>'}).join('')+'</select></td><td class="py-3 px-4"><select id="billing-plan-'+esc(cl.id)+'" class="field min-w-[120px]"><option value="basic"'+((b.plan||'basic')==='basic'?' selected':'')+'>Basic</option><option value="pro"'+((b.plan||'basic')==='pro'?' selected':'')+'>Pro</option></select></td><td class="py-3 px-4"><input id="billing-amount-'+esc(cl.id)+'" class="field min-w-[120px]" type="number" min="0" value="'+esc(b.amount||0)+'"></td><td class="py-3 px-4"><input id="billing-renewal-'+esc(cl.id)+'" class="field min-w-[150px]" type="date" value="'+esc((b.renewalDate||'').slice(0,10))+'"></td><td class="py-3 px-4"><div class="grid grid-cols-1 gap-2 min-w-[150px]"><input id="billing-payment-amount-'+esc(cl.id)+'" class="field" type="number" min="0" placeholder="Amount paid"><input id="billing-payment-date-'+esc(cl.id)+'" class="field" type="date" value="'+esc(new Date().toISOString().slice(0,10))+'"></div></td><td class="py-3 px-4"><input id="billing-note-'+esc(cl.id)+'" class="field min-w-[180px]" value="'+esc(b.note||'')+'" placeholder="Internal note"></td><td class="py-3 px-4"><button onclick="saveAdminBillingRow(&quot;'+esc(cl.id)+'&quot;)" class="btn btn-primary text-xs"><i class="fas fa-save"></i> Save</button></td></tr>'}).join('')+'</tbody></table></div></div>'+
  '<div class="card overflow-hidden"><div class="p-4 border-b border-slate-700"><h3 class="text-white font-semibold">Recent Payment History</h3></div><div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="text-left text-xs uppercase text-slate-500 border-b border-slate-700"><th class="py-3 px-4">Date</th><th class="py-3 px-4">Client</th><th class="py-3 px-4">Amount</th><th class="py-3 px-4">Recorded By</th><th class="py-3 px-4">Note</th></tr></thead><tbody>'+(payments.length?payments.slice(0,80).map(function(p){return'<tr class="border-b border-slate-800"><td class="py-3 px-4 text-slate-400">'+esc(p.paymentDate||p.createdAt||'')+'</td><td class="py-3 px-4 text-white">'+esc(p.businessName||p.clientId||'Client')+'</td><td class="py-3 px-4 text-sprint-400 font-semibold">'+esc(adminMoney(p.amount||0))+'</td><td class="py-3 px-4 text-slate-400">'+esc(p.recordedBy||'admin')+'</td><td class="py-3 px-4 text-slate-300">'+esc(p.note||'')+'</td></tr>'}).join(''):'<tr><td class="py-8 px-4 text-center text-slate-400" colspan="5">No payments recorded yet.</td></tr>')+'</tbody></table></div></div></div>';
}
async function saveAdminBillingPlans(e){e.preventDefault();try{await apiFetch('/api/admin/billing/plans',{method:'PUT',body:JSON.stringify({basicAmount:Number(document.getElementById('billing-plan-basic').value)||0,proAmount:Number(document.getElementById('billing-plan-pro').value)||0})});showToast('Plan prices saved.','success');renderAdminTab('billing')}catch(err){showToast(err.message,'error')}}
async function saveAdminBillingRow(id){try{var body={billingStatus:document.getElementById('billing-status-'+id).value,plan:document.getElementById('billing-plan-'+id).value,amount:Number(document.getElementById('billing-amount-'+id).value)||0,renewalDate:document.getElementById('billing-renewal-'+id).value,paymentAmount:Number(document.getElementById('billing-payment-amount-'+id).value)||0,paymentDate:document.getElementById('billing-payment-date-'+id).value,billingNote:document.getElementById('billing-note-'+id).value};if(body.billingStatus==='suspended'){var adminPassword=await promptAdminPassword('Suspending billing blocks paid dashboard actions and automation.');if(!adminPassword)return;body.adminPassword=adminPassword}await apiFetch('/api/admin/clients/'+id+'/subscription',{method:'PUT',body:JSON.stringify(body)});showToast('Billing saved.','success');renderAdminTab('billing')}catch(err){showToast(err.message,'error')}}

async function renderAdminNoticesTab(c){
  var d=await apiFetch('/api/admin/notices'),clients=d.clients||[],notices=d.notices||[];
  c.innerHTML='<div class="space-y-6"><div class="flex flex-col lg:flex-row lg:items-end justify-between gap-3"><div><h2 class="text-xl font-semibold text-white"><i class="fas fa-bell text-sprint-400 mr-2"></i>Client Notices</h2><p class="text-sm text-slate-400 mt-1">Send clear messages that appear on selected client dashboards or every client dashboard.</p></div><button onclick="renderAdminTab(&quot;notices&quot;)" class="btn btn-ghost text-xs"><i class="fas fa-rotate"></i> Refresh</button></div>'+
  '<div class="grid grid-cols-1 xl:grid-cols-[.9fr_1.1fr] gap-5"><form onsubmit="sendAdminNotice(event)" class="card p-5 space-y-4"><h3 class="text-white font-semibold">Send Notice</h3><div><label class="text-xs text-slate-400 block mb-1">Notice Type</label><select id="notice-type" class="field"><option value="notification">Notification</option><option value="warning">Warning</option><option value="suggestion">Suggestion</option></select></div><label class="flex items-center gap-2 text-sm text-white"><input id="notice-global" type="checkbox" onchange="document.getElementById(&quot;notice-client-list&quot;).classList.toggle(&quot;hidden&quot;,this.checked)"> Send to all clients</label><div id="notice-client-list" class="max-h-52 overflow-auto rounded-lg border border-slate-700 p-3 space-y-2">'+clients.map(function(cl){return'<label class="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" class="notice-client" value="'+esc(cl.id)+'"> '+esc(cl.businessName||'Client')+' <span class="text-xs text-slate-500">('+esc(cl.status||'')+')</span></label>'}).join('')+'</div><div><label class="text-xs text-slate-400 block mb-1">Title</label><input id="notice-title" class="field" maxlength="120" placeholder="Example: Payment reminder"></div><div><label class="text-xs text-slate-400 block mb-1">Message</label><textarea id="notice-message" class="field" rows="5" maxlength="1000" placeholder="Write the exact message the client should see."></textarea></div><button type="submit" class="btn btn-primary text-xs"><i class="fas fa-paper-plane"></i> Send Notice</button></form><div class="card overflow-hidden"><div class="p-4 border-b border-slate-700"><h3 class="text-white font-semibold">Recent Notices</h3></div><div class="divide-y divide-slate-800">'+(notices.length?notices.slice(0,50).map(function(n){return'<div class="p-4"><div class="flex flex-wrap items-center gap-2"><span class="badge badge-pending text-xs">'+esc(n.type||'notification')+'</span><span class="text-xs text-slate-500">'+esc(n.global?'All clients':(n.clientIds||[]).length+' selected')+'</span><span class="text-xs text-slate-500">'+esc(n.createdAt?new Date(n.createdAt).toLocaleString():'')+'</span></div><p class="text-white font-semibold mt-2">'+esc(n.title||'Notice')+'</p><p class="text-sm text-slate-400 mt-1">'+esc(n.message||'')+'</p></div>'}).join(''):'<div class="p-8 text-center text-slate-400">No notices sent yet.</div>')+'</div></div></div></div>';
}
async function sendAdminNotice(e){e.preventDefault();var global=document.getElementById('notice-global').checked;var ids=Array.from(document.querySelectorAll('.notice-client:checked')).map(function(el){return el.value});try{await apiFetch('/api/admin/notices',{method:'POST',body:JSON.stringify({scope:global?'global':'selected',clientIds:ids,type:document.getElementById('notice-type').value,title:document.getElementById('notice-title').value,message:document.getElementById('notice-message').value})});showToast('Notice sent.','success');renderAdminTab('notices')}catch(err){showToast(err.message,'error')}}

async function renderAdminStorageTab(c){
  var storage=await apiFetch('/api/admin/storage'),totals=storage.totals||{},counts=storage.counts||{},clients=storage.clients||[],backups=counts.backups||{};
  c.innerHTML='<div class="space-y-6"><div class="flex flex-col lg:flex-row lg:items-end justify-between gap-3"><div><h2 class="text-xl font-semibold text-white"><i class="fas fa-database text-sprint-400 mr-2"></i>Storage & Backups</h2><p class="text-sm text-slate-400 mt-1">Tracked disk usage, product images, uploaded files, and backup downloads.</p></div><div class="flex gap-2 flex-wrap"><button onclick="downloadAdminJsonBackup()" class="btn btn-secondary text-xs"><i class="fas fa-file-code"></i> JSON Backup</button><button onclick="downloadAdminFullBackup()" class="btn btn-warning text-xs"><i class="fas fa-box-archive"></i> Full Backup</button><button onclick="renderAdminTab(&quot;storage&quot;)" class="btn btn-ghost text-xs"><i class="fas fa-rotate"></i> Refresh</button></div></div>'+
  '<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">'+adminStatCard('Tracked data',(totals.trackedTotalMb||0)+' MB','Data folder plus backups','hard-drive')+adminStatCard('Product images',(totals.productImagesMb||0)+' MB',(counts.productImages||0)+' images','image')+adminStatCard('Uploads',(totals.uploadsMb||0)+' MB',(counts.knowledgeFiles||0)+' knowledge files','upload')+adminStatCard('Backups',(totals.backupsMb||0)+' MB',(backups.json||0)+' JSON, '+(backups.full||0)+' full','box-archive')+'</div>'+
  '<div class="card p-4"><h3 class="text-white font-semibold mb-2">Backup Guide</h3><div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-300"><div class="rounded-lg border border-slate-700 p-3"><strong class="text-white">JSON Backup</strong><p class="text-xs text-slate-500 mt-1">Downloads platform records such as clients, settings, orders, products, logs, and file paths. It does not include uploaded image bytes.</p></div><div class="rounded-lg border border-slate-700 p-3"><strong class="text-white">Full Backup</strong><p class="text-xs text-slate-500 mt-1">Downloads the VM data folder as a compressed archive, including JSON state and uploaded product/knowledge files. Use this when a client needs their files too.</p></div></div><p class="text-xs text-slate-500 mt-3">Backups are generated/downloaded from the VM. The dashboard buttons are the safest way to get them without touching the server manually.</p></div>'+
  '<div class="card overflow-hidden"><div class="p-4 border-b border-slate-700"><h3 class="text-white font-semibold">Largest Client Storage</h3><p class="text-xs text-slate-500 mt-1">Use this to spot runaway image uploads before the VM disk fills.</p></div><div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="text-left text-xs uppercase text-slate-500 border-b border-slate-700"><th class="py-3 px-4">Client</th><th class="py-3 px-4">Status</th><th class="py-3 px-4">Total</th><th class="py-3 px-4">Product Images</th><th class="py-3 px-4">Uploads</th><th class="py-3 px-4">Products</th></tr></thead><tbody>'+
  (clients.length?clients.slice(0,40).map(function(cl){return'<tr class="border-b border-slate-800"><td class="py-3 px-4 text-white">'+esc(cl.businessName||cl.clientId)+'</td><td class="py-3 px-4"><span class="badge badge-'+(cl.status==='active'?'active':cl.status==='pending'?'pending':'suspended')+' text-xs">'+esc(cl.status||'unknown')+'</span></td><td class="py-3 px-4 text-slate-300">'+esc(cl.totalMb||0)+' MB</td><td class="py-3 px-4 text-slate-300">'+esc(cl.productImageMb||0)+' MB</td><td class="py-3 px-4 text-slate-300">'+esc(cl.uploadMb||0)+' MB</td><td class="py-3 px-4 text-slate-300">'+esc(cl.products||0)+'</td></tr>'}).join(''):'<tr><td class="py-8 px-4 text-center text-slate-400" colspan="6">No client storage recorded yet.</td></tr>')+
  '</tbody></table></div></div></div>';
}

function adminMoney(value){return (Number(value)||0).toLocaleString()+' ETB'}
function adminAnalyticsRate(value){return (Number(value)||0).toFixed(Number(value)%1?1:0)+'%'}
function adminRetailRow(row){return'<tr class="border-b border-slate-800"><td class="py-3 px-4 text-white font-semibold">'+esc(row.retailType||'retail')+'</td><td class="py-3 px-4 text-slate-300">'+esc(row.clients||0)+'</td><td class="py-3 px-4 text-slate-300">'+esc(row.activeClients||0)+'</td><td class="py-3 px-4 text-slate-300">'+esc(row.starts30d||0)+'</td><td class="py-3 px-4 text-slate-300">'+esc(row.browseClicks||0)+'</td><td class="py-3 px-4 text-slate-300">'+esc(row.orderClicks||0)+'</td><td class="py-3 px-4 text-slate-300">'+esc(row.orders30d||0)+'</td><td class="py-3 px-4 text-slate-300">'+esc(row.paymentProofs||0)+'</td><td class="py-3 px-4 text-sprint-400 font-semibold">'+esc(adminMoney(row.revenue))+'</td><td class="py-3 px-4"><span class="badge badge-pending text-xs">'+esc(adminAnalyticsRate(row.conversionRate30d))+'</span></td></tr>'}
function adminClientAnalyticsRow(row){return'<tr class="border-b border-slate-800 align-top"><td class="py-3 px-4"><p class="text-white font-semibold">'+esc(row.businessName||'Client')+'</p><p class="text-xs text-slate-500">'+esc(row.retailType||'retail')+' | '+esc(row.status||'unknown')+' | '+esc(row.billingStatus||'trial')+'</p></td><td class="py-3 px-4 text-slate-300">'+esc(row.starts30d||0)+'</td><td class="py-3 px-4 text-slate-300">'+esc(row.browseClicks||0)+'</td><td class="py-3 px-4 text-slate-300">'+esc(row.orderClicks30d||0)+'</td><td class="py-3 px-4 text-slate-300">'+esc(row.orders30d||0)+'</td><td class="py-3 px-4 text-slate-300">'+esc(row.paymentProofs30d||0)+'</td><td class="py-3 px-4 text-sprint-400 font-semibold">'+esc(adminMoney(row.revenue))+'</td><td class="py-3 px-4 text-slate-400">'+esc(row.lastOrderAt?new Date(row.lastOrderAt).toLocaleDateString():'-')+'</td></tr>'}
async function renderAdminAnalyticsTab(c){
  var d=await apiFetch('/api/admin/analytics'),totals=d.totals||{},byType=d.byRetailType||[],clients=d.clients||[];
  c.innerHTML='<div class="space-y-6"><div class="flex flex-col lg:flex-row lg:items-end justify-between gap-3"><div><h2 class="text-xl font-semibold text-white"><i class="fas fa-chart-line text-sprint-400 mr-2"></i>Retail Analytics</h2><p class="text-sm text-slate-400 mt-1">See which retail types and clients bring new shoppers, repeat browsing, order intent, payment proof, and sales through SprintSales.</p></div><button onclick="renderAdminTab(&quot;analytics&quot;)" class="btn btn-ghost text-xs"><i class="fas fa-rotate"></i> Refresh</button></div>'+
  '<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">'+adminStatCard('Clients',totals.clients||0,(totals.activeClients||0)+' active','building')+adminStatCard('New shoppers 30d',totals.starts30d||0,'Unique /start shoppers','user-plus')+adminStatCard('Browse actions',totals.browseClicks||0,'Repeat engagement included','store')+adminStatCard('Order clicks',totals.orderClicks||0,'Tracked from this release','cart-shopping')+adminStatCard('Revenue',adminMoney(totals.revenue),'Delivered order total','coins','bg-green-500/10 text-green-500')+'</div>'+
  '<div class="rounded-lg border border-yellow-300/30 bg-yellow-50 text-yellow-900 p-3 text-sm"><strong>Note:</strong> '+esc((d.notes||{}).starts||'New shoppers deduplicate repeat /start clicks.')+' '+esc((d.notes||{}).browseClicks||'Browse actions count repeat engagement.')+' '+esc((d.notes||{}).orderClicks||'Order click tracking starts from this release.')+'</div>'+
  '<div class="card overflow-hidden"><div class="p-4 border-b border-slate-700"><h3 class="text-white font-semibold">Performance by Retail Type</h3><p class="text-xs text-slate-500 mt-1">Use this to learn which business categories fit SprintSales best.</p></div><div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="text-left text-xs uppercase text-slate-500 border-b border-slate-700"><th class="py-3 px-4">Retail Type</th><th class="py-3 px-4">Clients</th><th class="py-3 px-4">Active</th><th class="py-3 px-4">New Shoppers 30d</th><th class="py-3 px-4">Browse Actions</th><th class="py-3 px-4">Order Clicks</th><th class="py-3 px-4">Orders 30d</th><th class="py-3 px-4">Payment Proofs</th><th class="py-3 px-4">Revenue</th><th class="py-3 px-4">Shopper to Order</th></tr></thead><tbody>'+(byType.length?byType.map(adminRetailRow).join(''):'<tr><td colspan="10" class="py-8 text-center text-slate-400">No retail analytics yet.</td></tr>')+'</tbody></table></div></div>'+
  '<div class="card overflow-hidden"><div class="p-4 border-b border-slate-700"><h3 class="text-white font-semibold">Client Sales Funnel</h3><p class="text-xs text-slate-500 mt-1">Individual client view for sales and engagement diagnosis.</p></div><div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="text-left text-xs uppercase text-slate-500 border-b border-slate-700"><th class="py-3 px-4">Client</th><th class="py-3 px-4">New Shoppers 30d</th><th class="py-3 px-4">Browse Actions</th><th class="py-3 px-4">Order Clicks 30d</th><th class="py-3 px-4">Orders 30d</th><th class="py-3 px-4">Payment Proofs 30d</th><th class="py-3 px-4">Revenue</th><th class="py-3 px-4">Last Order</th></tr></thead><tbody>'+(clients.length?clients.slice(0,80).map(adminClientAnalyticsRow).join(''):'<tr><td colspan="8" class="py-8 text-center text-slate-400">No client activity yet.</td></tr>')+'</tbody></table></div></div></div>';
}

async function renderApprovalsTab(c){var d=await apiFetch('/api/admin/pending-approvals');if(!d)return;var pending=d.pending||[];c.innerHTML='<div class="space-y-6"><div><h2 class="text-xl font-semibold text-white"><i class="fas fa-user-check text-sprint-400 mr-2"></i>Pending Approvals</h2><p class="text-sm text-slate-400 mt-1">'+pending.length+' business'+(pending.length!==1?'es':'')+' waiting for review</p></div>';if(!pending.length){c.innerHTML+='<div class="card p-8 text-center"><i class="fas fa-check-circle text-3xl text-green-400 mb-3 block"></i><p class="text-slate-400">No pending approvals</p></div>';return}pending.forEach(function(p){c.innerHTML+='<div class="card p-5" id="approval-'+p.id+'"><div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div class="flex-1"><h3 class="text-white font-semibold">'+esc(p.businessName)+'</h3><div class="flex flex-wrap gap-2 mt-1 text-xs"><span class="badge badge-pending">'+esc(p.businessType)+'</span><span class="text-slate-400">Owner: '+esc(p.ownerName)+'</span>'+(p.phone?'<span class="text-slate-400">Phone: '+esc(p.phone)+'</span>':'')+(p.email?'<span class="text-slate-400">Email: '+esc(p.email)+'</span>':'')+'</div><p class="text-xs text-slate-500 mt-1">Registered: '+(p.createdAt?new Date(p.createdAt).toLocaleDateString():'-')+'</p></div><div class="flex gap-2 flex-shrink-0"><button onclick="approveClient(\''+p.id+'\')" class="btn btn-success text-xs"><i class="fas fa-check"></i> Approve</button><button onclick="rejectClient(\''+p.id+'\')" class="btn btn-danger text-xs"><i class="fas fa-times"></i> Reject</button></div></div></div>'});c.innerHTML+='</div>'}
renderApprovalsTab=async function(c){
  var d=await apiFetch('/api/admin/pending-approvals');
  if(!d)return;
  var pending=d.pending||[];
  c.innerHTML='<div class="space-y-6"><div><h2 class="text-xl font-semibold text-white"><i class="fas fa-user-check text-sprint-400 mr-2"></i>Pending Approvals</h2><p class="text-sm text-slate-400 mt-1">'+pending.length+' business'+(pending.length!==1?'es':'')+' waiting for review</p></div>';
  if(!pending.length){c.innerHTML+='<div class="card p-8 text-center"><i class="fas fa-check-circle text-3xl text-green-400 mb-3 block"></i><p class="text-slate-400">No pending approvals</p></div>';return}
  pending.forEach(function(p){
    c.innerHTML+='<div class="card p-5" id="approval-'+p.id+'"><div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div class="flex-1"><h3 class="text-white font-semibold">'+esc(p.businessName)+'</h3><div class="flex flex-wrap gap-2 mt-1 text-xs"><span class="badge badge-pending">'+esc(p.businessType)+'</span><span class="text-slate-400">Owner: '+esc(p.ownerName)+'</span>'+(p.phone?'<span class="text-slate-400">Phone: '+esc(p.phone)+'</span>':'')+(p.email?'<span class="text-slate-400">Email: '+esc(p.email)+'</span>':'')+'</div><p class="text-xs text-slate-500 mt-1">Registered: '+(p.createdAt?new Date(p.createdAt).toLocaleDateString():'-')+'</p></div><div class="flex gap-2 flex-shrink-0"><button onclick="approveClient(\''+p.id+'\')" class="btn btn-success text-xs"><i class="fas fa-check"></i> Approve</button><button onclick="rejectClient(\''+p.id+'\')" class="btn btn-danger text-xs"><i class="fas fa-times"></i> Reject</button></div></div></div>';
  });
  c.innerHTML+='</div>';
};
async function approveClient(id){try{var res=await apiFetch('/api/admin/clients/'+id+'/approve',{method:'PATCH'});if(res&&res.welcomeSent){showToast('Client approved and welcome sent.','success')}else{showToast('Client approved. Welcome message was not sent: '+((res&&res.welcomeError)||'owner Telegram chat is not connected yet'),'warning')}renderAdminTab('approvals')}catch(e){showToast(e.message,'error')}}
async function rejectClient(id){var adminPassword=await adminConfirmModal({title:'Reject Business',message:'Rejecting this business blocks the account from using SprintSales.',help:'Use this only when the registration should not be approved.',danger:true});if(!adminPassword)return;try{await apiFetch('/api/admin/clients/'+id+'/reject',{method:'PATCH',body:JSON.stringify({adminPassword:adminPassword})});showToast('Client rejected.','info');renderAdminTab('approvals')}catch(e){showToast(e.message,'error')}}

async function renderAdminClientsTab(c){var d=await apiFetch('/api/admin/clients');if(!d)return;var clients=d.clients||[];c.innerHTML='<div class="space-y-6"><div><h2 class="text-xl font-semibold text-white"><i class="fas fa-building text-sprint-400 mr-2"></i>Client Control</h2><p class="text-sm text-slate-400 mt-1">Control each client account, subscription, automation access, and AI key mode from one place.</p></div>';if(!clients.length){c.innerHTML+='<div class="card p-8 text-center"><p class="text-slate-400">No clients registered yet.</p></div>';return}clients.forEach(function(cl){var badge=cl.status==='active'?'active':cl.status==='pending'?'pending':cl.status==='rejected'?'rejected':'suspended';var s=cl.settings||{},b=cl.billing||{};var provider=s.adminAiProvider||s.aiProvider||'gemini';var mode=s.aiKeyMode||'client';c.innerHTML+='<div class="card p-5 space-y-4"><div class="flex flex-col lg:flex-row lg:items-start justify-between gap-3"><div><h3 class="text-white font-semibold">'+esc(cl.businessName)+'</h3><div class="flex flex-wrap gap-2 mt-1 text-xs"><span class="badge badge-'+badge+'">'+esc(cl.status)+'</span><span class="text-slate-400">'+esc(cl.businessTypeLabel||'retail')+'</span>'+(cl.email?'<span class="text-slate-400">Email: '+esc(cl.email)+'</span>':'')+(cl.phone?'<span class="text-slate-400">Phone: '+esc(cl.phone)+'</span>':'')+'</div><p class="text-xs text-slate-500 mt-1">Billing identity: '+esc((cl.identity||{}).clientId||cl.id)+'</p></div><div class="flex gap-2">'+(cl.status==='active'?'<button onclick="suspendClient(\''+cl.id+'\')" class="btn btn-warning text-xs"><i class="fas fa-pause"></i> Suspend</button>':'')+(cl.status==='suspended'||cl.status==='rejected'?'<button onclick="reactivateClient(\''+cl.id+'\')" class="btn btn-success text-xs"><i class="fas fa-redo"></i> Reactivate</button>':'')+'</div></div><div class="grid grid-cols-1 xl:grid-cols-3 gap-4"><div class="rounded-lg border border-slate-700 p-4 space-y-3"><h4 class="text-sm font-semibold text-white">Account Status</h4><select id="admin-status-'+esc(cl.id)+'" class="field">'+['active','paused','pending','suspended','rejected'].map(function(st){return'<option value="'+st+'"'+(cl.status===st?' selected':'')+'>'+st+'</option>'}).join('')+'</select><button onclick="saveAdminClientStatus(\''+cl.id+'\')" class="btn btn-primary text-xs"><i class="fas fa-save"></i> Save Status</button></div><div class="rounded-lg border border-slate-700 p-4 space-y-3"><h4 class="text-sm font-semibold text-white">Subscription</h4><select id="admin-billing-status-'+esc(cl.id)+'" class="field">'+['trial','paid','due','suspended'].map(function(st){return'<option value="'+st+'"'+((b.status||'trial')===st?' selected':'')+'>'+st+'</option>'}).join('')+'</select><input id="admin-renewal-'+esc(cl.id)+'" type="date" class="field" value="'+esc((b.renewalDate||'').slice(0,10))+'"><input id="admin-billing-note-'+esc(cl.id)+'" class="field" value="'+esc(b.note||'')+'" placeholder="Billing note"><button onclick="saveAdminClientBilling(\''+cl.id+'\')" class="btn btn-primary text-xs"><i class="fas fa-save"></i> Save Billing</button></div><div class="rounded-lg border border-slate-700 p-4 space-y-3"><h4 class="text-sm font-semibold text-white">Client AI Control</h4><select id="admin-ai-mode-'+esc(cl.id)+'" class="field"><option value="client"'+(mode==='client'?' selected':'')+'>Client uses own API key</option><option value="admin"'+(mode==='admin'?' selected':'')+'>Use admin-managed key for this client</option></select><select id="admin-client-ai-provider-'+esc(cl.id)+'" class="field">'+['gemini','deepseek','openai','anthropic','grok'].map(function(p){var label=p==='anthropic'?'Claude / Anthropic':p.charAt(0).toUpperCase()+p.slice(1);return'<option value="'+p+'"'+(provider===p||provider==='claude'&&p==='anthropic'?' selected':'')+'>'+label+'</option>'}).join('')+'</select><input id="admin-client-ai-key-'+esc(cl.id)+'" class="field" type="password" data-configured="'+(s.adminAiApiKey==='configured'?'1':'0')+'" placeholder="'+(s.adminAiApiKey==='configured'?'Admin key saved - leave blank to keep':'Optional per-client admin key')+'"><input id="admin-client-ai-limit-'+esc(cl.id)+'" class="field" type="number" min="0" max="100000" value="'+esc(s.aiMonthlyReplyLimit||1000)+'"><button onclick="saveAdminClientAi(\''+cl.id+'\')" class="btn btn-primary text-xs"><i class="fas fa-save"></i> Save AI</button></div></div></div>'});c.innerHTML+='</div>'}
async function suspendClient(id){var adminPassword=await adminConfirmModal({title:'Suspend Client',message:'Suspending a client stops their account and turns off automation.',help:'The client can be reactivated later from Client Control.',danger:true});if(!adminPassword)return;try{await apiFetch('/api/admin/clients/'+id+'/suspend',{method:'PATCH',body:JSON.stringify({adminPassword:adminPassword})});showToast('Client suspended.','info');renderAdminTab('clients')}catch(e){showToast(e.message,'error')}}
async function reactivateClient(id){try{await apiFetch('/api/admin/clients/'+id+'/reactivate',{method:'PATCH'});showToast('Client reactivated!','success');renderAdminTab('clients')}catch(e){showToast(e.message,'error')}}
async function saveAdminClientStatus(id){try{var status=document.getElementById('admin-status-'+id).value;var body={status:status};if(['paused','pending','suspended','rejected'].includes(status)){var adminPassword=await adminConfirmModal({title:'Change Client Status',message:'Changing account status to '+status+' is protected because it can stop client access.',help:'This change will be recorded in the audit log.',danger:true});if(!adminPassword)return;body.adminPassword=adminPassword}await apiFetch('/api/admin/clients/'+id,{method:'PATCH',body:JSON.stringify(body)});showToast('Client status saved.','success');renderAdminTab('clients')}catch(e){showToast(e.message,'error')}}
async function saveAdminClientBilling(id){try{var body={billingStatus:document.getElementById('admin-billing-status-'+id).value,renewalDate:document.getElementById('admin-renewal-'+id).value,billingNote:document.getElementById('admin-billing-note-'+id).value};if(body.billingStatus==='suspended'){var adminPassword=await adminConfirmModal({title:'Suspend Subscription',message:'Suspending a subscription blocks paid dashboard actions and stops automation.',help:'Use due status first when the client should only be warned.',danger:true});if(!adminPassword)return;body.adminPassword=adminPassword}await apiFetch('/api/admin/clients/'+id+'/subscription',{method:'PUT',body:JSON.stringify(body)});showToast('Subscription saved.','success');renderAdminTab('clients')}catch(e){showToast(e.message,'error')}}
async function saveAdminClientAi(id){try{var key=document.getElementById('admin-client-ai-key-'+id);var body={aiKeyMode:document.getElementById('admin-ai-mode-'+id).value,adminAiProvider:document.getElementById('admin-client-ai-provider-'+id).value,adminAiApiKey:(key.dataset.configured==='1'&&!key.value)?'configured':key.value,aiMonthlyReplyLimit:Number(document.getElementById('admin-client-ai-limit-'+id).value)||1000};await apiFetch('/api/admin/clients/'+id+'/ai-key',{method:'PUT',body:JSON.stringify(body)});showToast('Client AI settings saved.','success');renderAdminTab('clients')}catch(e){showToast(e.message,'error')}}
async function adminResetClientPassword(id,name){
  var password=await promptNice('Reset client password','Set a temporary password for '+(name||'this client')+'. Minimum 5 characters. They will be forced to change it after login.',{inputType:'text',placeholder:'Temporary password',okText:'Continue'});
  if(!password)return;
  if(password.length<5){showToast('Temporary password must be at least 5 characters.','warning');return}
  var adminPassword=await adminConfirmModal({title:'Confirm Password Reset',message:'This changes the client login password and forces them to choose a new one after login.',help:'Use this only for account recovery. The action is recorded in audit logs.',danger:true});
  if(!adminPassword)return;
  try{await apiFetch('/api/admin/clients/'+id+'/password',{method:'POST',body:JSON.stringify({password:password,adminPassword:adminPassword})});showToast('Client password reset. They must change it after login.','success');renderAdminTab('clients')}catch(e){showToast(e.message,'error')}
}
async function saveAdminQualityReview(id){try{var status=document.getElementById('quality-status-'+id).value;var body={status:status,note:document.getElementById('quality-note-'+id).value};if(status==='restricted_candidate'){var adminPassword=await adminConfirmModal({title:'Mark Restricted Candidate',message:'This is still only an internal label, but it is sensitive because it flags a client for possible restriction.',help:'No automatic suspension will happen. The action is recorded in the audit log.',danger:true});if(!adminPassword)return;body.adminPassword=adminPassword}await apiFetch('/api/admin/clients/'+id+'/quality-review',{method:'PATCH',body:JSON.stringify(body)});showToast('Quality review saved.','success');renderAdminTab('clients')}catch(e){showToast(e.message,'error')}}

var adminClientFilter='all',adminClientSearch='';
function setAdminClientFilter(value){adminClientFilter=value||'all';renderAdminTab('clients')}
function adminClientTrustStatus(cl){var review=cl.qualityReview||{},q=cl.quality||{},sig=q.signals||{};return review.status&&review.status!=='none'?review.status:(q.trustStatus||sig.trustStatus||'healthy')}
function adminClientMatchesFilter(cl){var trust=adminClientTrustStatus(cl);if(adminClientFilter==='all')return true;if(adminClientFilter==='needs-attention')return adminClientRiskScore(cl)>0;if(adminClientFilter==='trust-watch')return trust==='watch';if(adminClientFilter==='trust-review')return trust==='under_review';if(adminClientFilter==='trust-restricted')return trust==='restricted_candidate';if(adminClientFilter==='billing')return ((cl.billing||{}).status==='due'||(cl.billing||{}).status==='suspended');if(adminClientFilter==='bot')return ['bad','warn'].includes((cl.botDebug||{}).level);return cl.status===adminClientFilter}
function adminClientMatchesSearch(cl){var q=(adminClientSearch||'').toLowerCase().trim();if(!q)return true;return [cl.businessName,cl.ownerName,cl.email,cl.phone,cl.id,(cl.identity||{}).clientId,(cl.settings||{}).botUsername].filter(Boolean).join(' ').toLowerCase().includes(q)}
function adminProgressBar(value,tone){var n=Math.max(0,Math.min(100,Number(value)||0));return'<div class="w-full h-2 rounded-full bg-slate-800 overflow-hidden"><div class="h-full rounded-full '+(tone||'bg-sprint-400')+'" style="width:'+n+'%"></div></div>'}
function adminClientHealthSummary(cl){var readiness=cl.readiness||{},activity=cl.activity||{},bot=cl.botDebug||{},quality=cl.quality||{},signals=quality.signals||{},review=cl.qualityReview||{},warnings=cl.healthWarnings||[];var score=Number(quality.score||readiness.score||0);var trust=adminClientTrustStatus(cl);var botTone=bot.level==='bad'?'badge-rejected':bot.level==='warn'?'badge-pending':'badge-active';var trustTone=trust==='restricted_candidate'?'badge-rejected':trust==='under_review'?'badge-pending':trust==='watch'?'badge-pending':'badge-active';var progressTone=score>=80?'bg-green-500':score>=50?'bg-yellow-500':'bg-red-500';return'<div class="rounded-lg border border-slate-700 p-4 space-y-3 bg-slate-900/30"><div class="flex items-center justify-between gap-3"><h4 class="text-sm font-semibold text-white">Trust & Health</h4><span class="badge '+trustTone+' text-xs">'+esc(trust.replace(/_/g,' '))+'</span></div>'+(review.status&&review.status!=='none'?'<p class="text-xs text-slate-500">Manual review: '+esc(review.status.replace(/_/g,' '))+(review.note?' - '+esc(review.note):'')+'</p>':'')+'<div><div class="flex items-center justify-between text-xs mb-1"><span class="text-slate-500">Quality score</span><span class="text-slate-300">'+esc(score)+'%</span></div>'+adminProgressBar(score,progressTone)+'</div><div class="flex flex-wrap gap-2 text-xs"><span class="badge '+botTone+'">'+esc(bot.code||'bot ready')+'</span><span class="text-slate-500">'+esc(bot.label||'Automation status looks normal.')+'</span></div><div class="grid grid-cols-2 gap-2 text-xs"><div><p class="text-slate-500">Low ratings 30d</p><p class="text-white font-semibold">'+esc(signals.lowRatings30d||0)+'</p></div><div><p class="text-slate-500">Delivery issues 30d</p><p class="text-white font-semibold">'+esc(signals.lateReports30d||0)+'</p></div><div><p class="text-slate-500">Overdue active</p><p class="text-white font-semibold">'+esc(signals.overdueDeliveries||0)+'</p></div><div><p class="text-slate-500">Severe risk</p><p class="text-white font-semibold">'+esc(signals.severeNonDelivery||0)+'</p></div><div><p class="text-slate-500">Unanswered</p><p class="text-white font-semibold">'+esc(activity.openUnanswered||0)+'</p></div><div><p class="text-slate-500">Open support</p><p class="text-white font-semibold">'+esc(signals.openSupport||0)+'</p></div></div>'+(warnings.length?'<div class="space-y-1">'+warnings.slice(0,4).map(function(w){return'<p class="text-xs text-yellow-400"><i class="fas fa-triangle-exclamation mr-1"></i>'+esc(w.label||w.title||w.message||String(w))+'</p>'}).join('')+'</div>':'')+'</div>'}
function adminClientSetupBlock(cl){var st=cl.setupStatus||{},missing=st.missing||[];return'<div class="rounded-lg border border-slate-700 p-4 space-y-3 bg-slate-900/30"><div class="flex items-center justify-between gap-3"><h4 class="text-sm font-semibold text-white">Setup Details</h4><span class="badge '+(missing.length?'badge-pending':'badge-active')+' text-xs">'+(missing.length?esc(missing.length)+' missing':'Ready')+'</span></div><div class="grid grid-cols-2 gap-2 text-xs"><div><p class="text-slate-500">Products</p><p class="text-white font-semibold">'+esc(st.products||0)+'</p></div><div><p class="text-slate-500">Image storage</p><p class="text-white font-semibold">'+esc(st.imageMb||0)+' MB</p></div><div><p class="text-slate-500">Payment options</p><p class="text-white font-semibold">'+esc(st.paymentOptions||0)+'</p></div><div><p class="text-slate-500">Knowledge words</p><p class="text-white font-semibold">'+esc(st.knowledgeWords||0)+'</p></div></div>'+(missing.length?'<div class="space-y-1">'+missing.slice(0,6).map(function(item){return'<p class="text-xs text-yellow-400"><i class="fas fa-circle-exclamation mr-1"></i>Missing '+esc(item)+'</p>'}).join('')+'</div>':'<p class="text-xs text-green-700">Core setup information is available.</p>')+'</div>'}
function adminQualityEventsBlock(cl){var events=Array.isArray(cl.qualityEvents)?cl.qualityEvents:[],review=adminQualityReviewControls(cl);if(!events.length)return review;return review+'<div class="rounded-lg border border-slate-700 p-4 bg-slate-900/30"><div class="flex items-center justify-between gap-3 mb-3"><h4 class="text-sm font-semibold text-white">Recent Quality Events</h4><span class="text-xs text-slate-500">Audit evidence</span></div><div class="space-y-2">'+events.slice(0,5).map(function(ev){var tone=ev.severity==='bad'?'text-red-500':ev.severity==='warn'?'text-yellow-500':'text-slate-500';var meta=[ev.orderId?('Order '+ev.orderId):'',ev.customer,ev.product].filter(Boolean).join(' | ');return'<div class="rounded-lg border border-slate-700 p-3"><div class="flex flex-col sm:flex-row sm:items-center justify-between gap-1"><p class="text-xs font-semibold '+tone+'">'+esc(ev.title||ev.type||'Quality event')+'</p><p class="text-[11px] text-slate-500">'+esc(ev.createdAt?new Date(ev.createdAt).toLocaleDateString():'')+'</p></div><p class="text-xs text-slate-400 mt-1">'+esc(ev.detail||'')+'</p>'+(meta?'<p class="text-[11px] text-slate-500 mt-1">'+esc(meta)+'</p>':'')+'</div>'}).join('')+'</div></div>'}
function adminQualityReviewControls(cl){var review=cl.qualityReview||{},status=review.status||'cleared';return'<div class="rounded-lg border border-slate-700 p-4 bg-slate-900/30"><h4 class="text-sm font-semibold text-white mb-3">Manual Quality Review</h4><div class="grid grid-cols-1 lg:grid-cols-[220px_1fr_auto] gap-3"><select id="quality-status-'+esc(cl.id)+'" class="field">'+['cleared','watch','under_review','restricted_candidate'].map(function(st){return'<option value="'+st+'"'+(status===st?' selected':'')+'>'+esc(st.replace(/_/g,' '))+'</option>'}).join('')+'</select><input id="quality-note-'+esc(cl.id)+'" class="field" value="'+esc(review.note||'')+'" placeholder="Internal review note"><button onclick="saveAdminQualityReview(\''+cl.id+'\')" class="btn btn-secondary text-xs"><i class="fas fa-clipboard-check"></i> Save Review</button></div><p class="text-xs text-slate-500 mt-2">Internal admin label only. It does not suspend the client or stop their bot.</p>'+(review.updatedAt?'<p class="text-[11px] text-slate-500 mt-1">Last reviewed '+esc(new Date(review.updatedAt).toLocaleString())+' by '+esc(review.reviewedBy||'admin')+'</p>':'')+'</div>'}
function adminClientFilterButton(value,label,count){return'<button type="button" onclick="setAdminClientFilter(&quot;'+esc(value)+'&quot;)" class="btn '+(adminClientFilter===value?'btn-primary':'btn-ghost')+' text-xs">'+esc(label)+' <span class="badge badge-pending ml-1">'+esc(count)+'</span></button>'}

async function renderAdminClientsTabV2(c){
  var d=await apiFetch('/api/admin/clients');if(!d)return;var clients=d.clients||[];
  var counts={all:clients.length,active:clients.filter(function(cl){return cl.status==='active'}).length,pending:clients.filter(function(cl){return cl.status==='pending'}).length,suspended:clients.filter(function(cl){return cl.status==='suspended'||cl.status==='paused'||cl.status==='rejected'}).length,billing:clients.filter(function(cl){return ((cl.billing||{}).status==='due'||(cl.billing||{}).status==='suspended')}).length,bot:clients.filter(function(cl){return ['bad','warn'].includes((cl.botDebug||{}).level)}).length,attention:clients.filter(function(cl){return adminClientRiskScore(cl)>0}).length,watch:clients.filter(function(cl){return adminClientTrustStatus(cl)==='watch'}).length,review:clients.filter(function(cl){return adminClientTrustStatus(cl)==='under_review'}).length,restricted:clients.filter(function(cl){return adminClientTrustStatus(cl)==='restricted_candidate'}).length};
  var visible=clients.filter(adminClientMatchesFilter).filter(adminClientMatchesSearch).sort(function(a,b){return adminClientRiskScore(b)-adminClientRiskScore(a)||String(a.businessName||'').localeCompare(String(b.businessName||''))});
  c.innerHTML='<div class="space-y-6"><div class="flex flex-col lg:flex-row lg:items-end justify-between gap-3"><div><h2 class="text-xl font-semibold text-white"><i class="fas fa-building text-sprint-400 mr-2"></i>Client Control</h2><p class="text-sm text-slate-400 mt-1">Search clients, review health, and control billing, automation, and AI access.</p></div><button onclick="renderAdminTab(&quot;clients&quot;)" class="btn btn-ghost text-xs"><i class="fas fa-rotate"></i> Refresh</button></div>'+
  '<div class="card p-4 space-y-3"><div class="flex flex-col lg:flex-row gap-3 lg:items-center justify-between"><div class="flex flex-wrap gap-2">'+adminClientFilterButton('all','All',counts.all)+adminClientFilterButton('needs-attention','Needs attention',counts.attention)+adminClientFilterButton('trust-watch','Watch',counts.watch)+adminClientFilterButton('trust-review','Under review',counts.review)+adminClientFilterButton('trust-restricted','Restricted candidate',counts.restricted)+adminClientFilterButton('active','Active',counts.active)+adminClientFilterButton('pending','Pending',counts.pending)+adminClientFilterButton('billing','Billing risk',counts.billing)+adminClientFilterButton('bot','Bot warnings',counts.bot)+adminClientFilterButton('suspended','Stopped',counts.suspended)+'</div><div class="flex gap-2 lg:w-[26rem]"><input id="admin-client-search" class="field" value="'+esc(adminClientSearch)+'" placeholder="Search name, email, phone, bot..." oninput="adminClientSearch=this.value" onkeyup="if(event.key===&quot;Enter&quot;)renderAdminTab(&quot;clients&quot;)"><button type="button" onclick="renderAdminTab(&quot;clients&quot;)" class="btn btn-secondary text-xs flex-shrink-0"><i class="fas fa-search"></i> Search</button></div></div><p class="text-xs text-slate-500">Showing '+esc(visible.length)+' of '+esc(clients.length)+' clients. Trust filters are visibility only; they do not suspend anyone automatically.</p></div>';
  if(!clients.length){c.innerHTML+='<div class="card p-8 text-center"><p class="text-slate-400">No clients registered yet.</p></div>';return}
  if(!visible.length){c.innerHTML+='<div class="card p-8 text-center"><i class="fas fa-search text-3xl text-slate-600 mb-3 block"></i><p class="text-slate-400">No clients match this filter.</p></div></div>';return}
  visible.forEach(function(cl){var badge=cl.status==='active'?'active':cl.status==='pending'?'pending':cl.status==='rejected'?'rejected':'suspended';var s=cl.settings||{},b=cl.billing||{};var provider=s.adminAiProvider||s.aiProvider||'gemini';var mode=s.aiKeyMode||'client';var identity=(cl.identity||{}).clientId||cl.id;c.innerHTML+='<div class="card p-5 space-y-4"><div class="flex flex-col lg:flex-row lg:items-start justify-between gap-3"><div><h3 class="text-white font-semibold">'+esc(cl.businessName||'Unnamed client')+'</h3><div class="flex flex-wrap gap-2 mt-1 text-xs"><span class="badge badge-'+badge+'">'+esc(cl.status||'unknown')+'</span><span class="badge badge-pending">'+esc((b.status||'trial'))+'</span><span class="text-slate-400">'+esc(cl.businessTypeLabel||'retail')+'</span>'+(cl.email?'<span class="text-slate-400">Email: '+esc(cl.email)+'</span>':'')+(cl.phone?'<span class="text-slate-400">Phone: '+esc(cl.phone)+'</span>':'')+'</div><p class="text-xs text-slate-500 mt-1">Billing identity: '+esc(identity)+'</p></div><div class="flex gap-2 flex-wrap lg:justify-end">'+(cl.status==='active'?'<button onclick="suspendClient(\''+cl.id+'\')" class="btn btn-warning text-xs"><i class="fas fa-pause"></i> Suspend</button>':'')+(cl.status==='suspended'||cl.status==='rejected'||cl.status==='paused'?'<button onclick="reactivateClient(\''+cl.id+'\')" class="btn btn-success text-xs"><i class="fas fa-redo"></i> Reactivate</button>':'')+'</div></div><div class="grid grid-cols-1 xl:grid-cols-5 gap-4">'+adminClientHealthSummary(cl)+adminClientSetupBlock(cl)+'<div class="rounded-lg border border-slate-700 p-4 space-y-3"><h4 class="text-sm font-semibold text-white">Account Status</h4><select id="admin-status-'+esc(cl.id)+'" class="field">'+['active','paused','pending','suspended','rejected'].map(function(st){return'<option value="'+st+'"'+(cl.status===st?' selected':'')+'>'+st+'</option>'}).join('')+'</select><p class="text-xs text-slate-500">Paused/suspended/rejected states require your password.</p><button onclick="saveAdminClientStatus(\''+cl.id+'\')" class="btn btn-primary text-xs"><i class="fas fa-save"></i> Save Status</button></div><div class="rounded-lg border border-slate-700 p-4 space-y-3"><h4 class="text-sm font-semibold text-white">Subscription</h4><select id="admin-billing-status-'+esc(cl.id)+'" class="field">'+['trial','paid','due','suspended'].map(function(st){return'<option value="'+st+'"'+((b.status||'trial')===st?' selected':'')+'>'+st+'</option>'}).join('')+'</select><input id="admin-renewal-'+esc(cl.id)+'" type="date" class="field" value="'+esc((b.renewalDate||'').slice(0,10))+'"><input id="admin-billing-note-'+esc(cl.id)+'" class="field" value="'+esc(b.note||'')+'" placeholder="Billing note"><button onclick="saveAdminClientBilling(\''+cl.id+'\')" class="btn btn-primary text-xs"><i class="fas fa-save"></i> Save Billing</button></div><div class="rounded-lg border border-slate-700 p-4 space-y-3"><h4 class="text-sm font-semibold text-white">Client AI Control</h4><select id="admin-ai-mode-'+esc(cl.id)+'" class="field"><option value="client"'+(mode==='client'?' selected':'')+'>Client uses own API key</option><option value="admin"'+(mode==='admin'?' selected':'')+'>Use admin-managed key for this client</option></select><select id="admin-client-ai-provider-'+esc(cl.id)+'" class="field">'+['gemini','deepseek','openai','anthropic','grok'].map(function(p){var label=p==='anthropic'?'Claude / Anthropic':p.charAt(0).toUpperCase()+p.slice(1);return'<option value="'+p+'"'+(provider===p||provider==='claude'&&p==='anthropic'?' selected':'')+'>'+label+'</option>'}).join('')+'</select><input id="admin-client-ai-key-'+esc(cl.id)+'" class="field" type="password" data-configured="'+(s.adminAiApiKey==='configured'?'1':'0')+'" placeholder="'+(s.adminAiApiKey==='configured'?'Admin key saved - leave blank to keep':'Optional per-client admin key')+'"><input id="admin-client-ai-limit-'+esc(cl.id)+'" class="field" type="number" min="0" max="100000" value="'+esc(s.aiMonthlyReplyLimit||1000)+'"><button onclick="saveAdminClientAi(\''+cl.id+'\')" class="btn btn-primary text-xs"><i class="fas fa-save"></i> Save AI</button></div></div>'+adminQualityEventsBlock(cl)+'</div>'});
  c.innerHTML+='</div>';
}

var renderAdminClientsTabV2Core=renderAdminClientsTabV2;
renderAdminClientsTabV2=async function(c){
  await renderAdminClientsTabV2Core(c);
  var d=await apiFetch('/api/admin/clients');
  var clients=(d&&d.clients)||[];
  if(!clients.length)return;
  var options=clients.map(function(cl){return'<option value="'+esc(cl.id)+'">'+esc((cl.businessName||'Unnamed client')+' - '+(cl.email||cl.phone||cl.id))+'</option>'}).join('');
  c.insertAdjacentHTML('afterbegin','<div class="card p-4 border border-yellow-300/30 bg-yellow-50 text-yellow-950"><div class="flex flex-col xl:flex-row xl:items-end gap-3 justify-between"><div><h3 class="font-bold text-sm"><i class="fas fa-key mr-1"></i>Password Recovery</h3><p class="text-xs opacity-80 mt-1">Use only when a client cannot reset through Telegram. The next login forces them to set their own password.</p></div><div class="grid grid-cols-1 md:grid-cols-[minmax(220px,1fr)_180px_auto] gap-2 xl:min-w-[680px]"><select id="admin-reset-client-id" class="field">'+options+'</select><input id="admin-reset-temp-password" class="field" placeholder="Temp password"><button type="button" onclick="adminResetClientPasswordFromPanel()" class="btn btn-warning text-xs"><i class="fas fa-key"></i> Reset Password</button></div></div></div>');
};

async function adminResetClientPasswordFromPanel(){
  var id=(document.getElementById('admin-reset-client-id')||{}).value||'';
  var password=(document.getElementById('admin-reset-temp-password')||{}).value||'';
  if(!id){showToast('Choose a client first.','warning');return}
  if(password.length<5){showToast('Temporary password must be at least 5 characters.','warning');return}
  var adminPassword=await adminConfirmModal({title:'Confirm Password Reset',message:'This changes the client login password and forces them to choose a new one after login.',help:'Use this only for account recovery. The action is recorded in audit logs.',danger:true});
  if(!adminPassword)return;
  try{await apiFetch('/api/admin/clients/'+id+'/password',{method:'POST',body:JSON.stringify({password:password,adminPassword:adminPassword})});showToast('Client password reset. They must change it after login.','success');renderAdminTab('clients')}catch(e){showToast(e.message,'error')}
}

async function renderAdminSettingsTab(c){var s=await apiFetch('/api/admin/settings');var ai=await apiFetch('/api/admin/ai-providers');var ps=(s&&s.platformSettings)||{};var configured=ps.adminBotToken==='configured';var provider=(ai.provider||(ai.globalKeys||{}).provider||'gemini');var aiConfigured=ai.apiKey==='configured'||(ai.globalKeys||{}).apiKey==='configured';c.innerHTML='<div class="space-y-6"><div><h2 class="text-xl font-semibold text-white"><i class="fas fa-cog text-sprint-400 mr-2"></i>Admin Settings</h2><p class="text-sm text-slate-400 mt-1">Platform-wide controls for SprintSales: admin bot, alerts, and global AI provider.</p></div><div class="grid grid-cols-1 xl:grid-cols-2 gap-5"><div class="card p-6"><h3 class="text-white font-semibold mb-1"><i class="fas fa-shield-alt text-sprint-400 mr-2"></i>SprintSales Admin Bot</h3><p class="text-xs text-slate-500 mb-4">This bot sends password confirmation codes and future account messages to clients.</p><form onsubmit="saveAdminSystemSettings(event)" class="space-y-4"><div><label class="text-xs text-slate-400 block mb-1">Admin Bot Token</label><input id="admin-bot-token" class="field" type="password" data-configured="'+(configured?'1':'0')+'" placeholder="'+(configured?'Admin bot saved - leave blank to keep':'Paste token from BotFather')+'"></div><div><label class="text-xs text-slate-400 block mb-1">SprintSales Admin Alert Chat ID</label><input id="admin-alert-chat-id" class="field" value="'+esc(ps.adminAlertChatId||'')+'" placeholder="Your Telegram chat ID"></div><label class="flex items-center gap-2 text-sm text-white"><input id="admin-alerts-enabled" type="checkbox" '+(ps.adminAlertsEnabled?'checked':'')+'> Enable system alerts</label><button type="submit" class="btn btn-primary text-xs"><i class="fas fa-save"></i> Save Admin Bot</button><span id="admin-system-status" class="text-xs text-slate-500"></span></form></div><div class="card p-6"><h3 class="text-white font-semibold mb-1"><i class="fas fa-key text-sprint-400 mr-2"></i>Global AI Provider</h3><p class="text-xs text-slate-500 mb-4">Default AI key used when a client is set to admin-managed AI.</p><form onsubmit="saveAdminAiProvider(event)" class="space-y-4"><div><label class="text-xs text-slate-400 block mb-1">Provider</label><select id="admin-ai-provider" class="field">'+['gemini','deepseek','openai','anthropic','grok'].map(function(p){var label=p==='anthropic'?'Claude / Anthropic':p.charAt(0).toUpperCase()+p.slice(1);return'<option value="'+p+'"'+(provider===p||provider==='claude'&&p==='anthropic'?' selected':'')+'>'+label+'</option>'}).join('')+'</select></div><div><label class="text-xs text-slate-400 block mb-1">Global API Key</label><input id="admin-ai-api-key" class="field" type="password" data-configured="'+(aiConfigured?'1':'0')+'" placeholder="'+(aiConfigured?'Global key saved - leave blank to keep':'Paste global API key')+'"></div><button type="submit" class="btn btn-primary text-xs"><i class="fas fa-save"></i> Save Global AI Key</button></form></div></div></div>'}

async function renderAdminSystemTab(c){var d=await apiFetch('/api/admin/settings');var ps=(d&&d.platformSettings)||{};var configured=ps.adminBotToken==='configured';c.innerHTML='<div class="space-y-6"><div><h2 class="text-xl font-semibold text-white"><i class="fas fa-shield-alt text-sprint-400 mr-2"></i>System Bot & Alerts</h2><p class="text-sm text-slate-400 mt-1">Connect the SprintSales Admin bot used for security codes and platform messages to clients.</p></div><div class="card p-6"><form onsubmit="saveAdminSystemSettings(event)" class="space-y-4"><div><label class="text-xs text-slate-400 block mb-1">SprintSales Admin Bot Token</label><input id="admin-bot-token" class="field" type="password" data-configured="'+(configured?'1':'0')+'" placeholder="'+(configured?'Admin bot saved - leave blank to keep':'Paste token from BotFather')+'"><p class="text-xs text-slate-500 mt-1">Used to send password-change confirmation codes and future platform messages to business owners.</p></div><div class="grid grid-cols-1 md:grid-cols-2 gap-3"><div><label class="text-xs text-slate-400 block mb-1">Admin Alert Chat ID</label><input id="admin-alert-chat-id" class="field" value="'+esc(ps.adminAlertChatId||'')+'" placeholder="Telegram chat ID for SprintSales admin"></div><label class="flex items-center gap-2 text-sm text-white mt-6"><input id="admin-alerts-enabled" type="checkbox" '+(ps.adminAlertsEnabled?'checked':'')+'> Enable system alerts</label></div><button type="submit" class="btn btn-primary text-xs"><i class="fas fa-save"></i> Save System Settings</button><span id="admin-system-status" class="text-xs text-slate-500"></span></form></div></div>'}
async function saveAdminSystemSettings(e){e.preventDefault();var token=document.getElementById('admin-bot-token');var welcome=document.getElementById('admin-client-welcome');var loginUrl=document.getElementById('admin-public-login-url');var body={adminAlertChatId:document.getElementById('admin-alert-chat-id').value.trim(),adminAlertsEnabled:document.getElementById('admin-alerts-enabled').checked,adminBotToken:(token.dataset.configured==='1'&&!token.value)?'configured':token.value.trim(),clientApprovalWelcomeMessage:welcome?welcome.value.trim():undefined,publicLoginUrl:loginUrl?loginUrl.value.trim():undefined};var status=document.getElementById('admin-system-status');if(status)status.textContent='Saving...';try{await apiFetch('/api/admin/settings',{method:'PUT',body:JSON.stringify(body)});showToast('System settings saved.','success');if(status)status.textContent='Saved.';renderAdminTab('settings')}catch(err){if(status)status.textContent=err.message;showToast(err.message,'error')}}

async function renderAdminAiProvidersTab(c){var d=await apiFetch('/api/admin/ai-providers');var provider=(d.provider||(d.globalKeys||{}).provider||'deepseek');var configured=d.apiKey==='configured'||(d.globalKeys||{}).apiKey==='configured';c.innerHTML='<div class="space-y-6"><div><h2 class="text-xl font-semibold text-white"><i class="fas fa-key text-sprint-400 mr-2"></i>AI Provider</h2><p class="text-sm text-slate-400 mt-1">Manage the single platform-level AI key used for admin-managed clients.</p></div><div class="card p-6"><h3 class="text-white font-semibold mb-4">Platform AI Key</h3><form onsubmit="saveAdminAiProvider(event)" class="space-y-3"><div><label class="text-xs text-slate-400 block mb-1">Provider</label><select id="admin-ai-provider" class="field">'+['deepseek','openai','anthropic','gemini','grok'].map(function(p){var label=p==='anthropic'?'Claude / Anthropic':p.charAt(0).toUpperCase()+p.slice(1);return'<option value="'+p+'"'+(provider===p||provider==='claude'&&p==='anthropic'?' selected':'')+'>'+label+'</option>'}).join('')+'</select></div><div><label class="text-xs text-slate-400 block mb-1">API Key</label><input id="admin-ai-api-key" class="field" type="password" data-configured="'+(configured?'1':'0')+'" placeholder="'+(configured?'Key saved - leave blank to keep':'Paste the API key for the selected provider')+'"></div><button type="submit" class="btn btn-primary text-xs"><i class="fas fa-save"></i> Save Provider Key</button></form></div></div>'}
async function saveAdminAiProvider(e){e.preventDefault();var keyInput=document.getElementById('admin-ai-api-key');var body={provider:document.getElementById('admin-ai-provider').value,apiKey:(keyInput.dataset.configured==='1'&&!keyInput.value)?'configured':keyInput.value};try{await apiFetch('/api/admin/ai-providers',{method:'PUT',body:JSON.stringify(body)});showToast('Platform AI provider saved.','success');renderAdminTab('settings')}catch(err){showToast(err.message,'error')}}

function adminConfiguredRow(label,ok,help){return'<div class="rounded-lg border border-slate-700 p-3 flex items-start justify-between gap-3"><div><p class="text-sm font-semibold text-white">'+esc(label)+'</p><p class="text-xs text-slate-500 mt-1">'+esc(help||'')+'</p></div>'+adminStatusPill(ok?'Ready':'Missing',ok)+'</div>'}
async function renderAdminSettingsTabV2(c){var data=await Promise.all([apiFetch('/api/admin/settings'),apiFetch('/api/admin/ai-providers')]);var s=data[0]||{},ai=data[1]||{},ps=s.platformSettings||{};var configured=ps.adminBotToken==='configured';var alertsOn=Boolean(ps.adminAlertsEnabled);var provider=(ai.provider||(ai.globalKeys||{}).provider||'gemini');var aiConfigured=ai.apiKey==='configured'||(ai.globalKeys||{}).apiKey==='configured';c.innerHTML='<div class="space-y-6"><div class="flex flex-col lg:flex-row lg:items-end justify-between gap-3"><div><h2 class="text-xl font-semibold text-white"><i class="fas fa-cog text-sprint-400 mr-2"></i>Admin Settings</h2><p class="text-sm text-slate-400 mt-1">Platform bot, monitoring alerts, and the global AI provider used for admin-managed clients.</p></div><button onclick="renderAdminTab(&quot;settings&quot;)" class="btn btn-ghost text-xs"><i class="fas fa-rotate"></i> Refresh</button></div><div class="grid grid-cols-1 xl:grid-cols-3 gap-5"><div class="card p-5 xl:col-span-1"><h3 class="text-white font-semibold mb-3">Configuration Status</h3><div class="space-y-3">'+adminConfiguredRow('SprintSales Admin Bot',configured,'Required for password-change codes and platform Telegram messages.')+adminConfiguredRow('Admin Alert Chat ID',Boolean(ps.adminAlertChatId),'Where system monitoring alerts are delivered.')+adminConfiguredRow('Monitoring Alerts',alertsOn,'Enable after the admin bot and chat ID are saved.')+adminConfiguredRow('Global AI Key',aiConfigured,'Used only for clients set to admin-managed AI.')+'</div><div class="flex flex-wrap gap-2 mt-4"><button onclick="testAdminAlert()" class="btn btn-secondary text-xs"><i class="fas fa-paper-plane"></i> Send Test Alert</button><span id="admin-system-status" class="text-xs text-slate-500 self-center"></span></div></div><div class="card p-6"><h3 class="text-white font-semibold mb-1"><i class="fas fa-shield-alt text-sprint-400 mr-2"></i>SprintSales Admin Bot</h3><p class="text-xs text-slate-500 mb-4">Use the platform-owned admin bot here, not a client shop bot.</p><form onsubmit="saveAdminSystemSettings(event)" class="space-y-4"><div><label class="text-xs text-slate-400 block mb-1">Admin Bot Token</label><input id="admin-bot-token" class="field" type="password" data-configured="'+(configured?'1':'0')+'" placeholder="'+(configured?'Admin bot saved - leave blank to keep':'Paste token from BotFather')+'"></div><div><label class="text-xs text-slate-400 block mb-1">SprintSales Admin Alert Chat ID</label><input id="admin-alert-chat-id" class="field" value="'+esc(ps.adminAlertChatId||'')+'" placeholder="Your Telegram chat ID"></div><label class="flex items-center gap-2 text-sm text-white"><input id="admin-alerts-enabled" type="checkbox" '+(alertsOn?'checked':'')+'> Enable system alerts</label><div class="flex flex-wrap gap-2"><button type="submit" class="btn btn-primary text-xs"><i class="fas fa-save"></i> Save Admin Bot</button><button type="button" onclick="testAdminAlert()" class="btn btn-ghost text-xs"><i class="fas fa-paper-plane"></i> Test</button></div></form></div><div class="card p-6"><h3 class="text-white font-semibold mb-1"><i class="fas fa-key text-sprint-400 mr-2"></i>Global AI Provider</h3><p class="text-xs text-slate-500 mb-4">Clients can still use their own key. This is the fallback for admin-managed AI.</p><form onsubmit="saveAdminAiProvider(event)" class="space-y-4"><div><label class="text-xs text-slate-400 block mb-1">Provider</label><select id="admin-ai-provider" class="field">'+['gemini','deepseek','openai','anthropic','grok'].map(function(p){var label=p==='anthropic'?'Claude / Anthropic':p.charAt(0).toUpperCase()+p.slice(1);return'<option value="'+p+'"'+(provider===p||provider==='claude'&&p==='anthropic'?' selected':'')+'>'+label+'</option>'}).join('')+'</select></div><div><label class="text-xs text-slate-400 block mb-1">Global API Key</label><input id="admin-ai-api-key" class="field" type="password" data-configured="'+(aiConfigured?'1':'0')+'" placeholder="'+(aiConfigured?'Global key saved - leave blank to keep':'Paste global API key')+'"><p class="text-xs text-slate-500 mt-1">Leave blank to keep the saved key. Masked values are never saved as real keys.</p></div><button type="submit" class="btn btn-primary text-xs"><i class="fas fa-save"></i> Save Global AI Key</button></form></div></div></div>'}

renderAdminSettingsTabV2=async function(c){
  var data=await Promise.all([apiFetch('/api/admin/settings'),apiFetch('/api/admin/ai-providers')]);
  var s=data[0]||{},ai=data[1]||{},ps=s.platformSettings||{};
  var configured=ps.adminBotToken==='configured';
  var alertsOn=Boolean(ps.adminAlertsEnabled);
  var provider=(ai.provider||(ai.globalKeys||{}).provider||'gemini');
  var aiConfigured=ai.apiKey==='configured'||(ai.globalKeys||{}).apiKey==='configured';
  var welcome=ps.clientApprovalWelcomeMessage||'';
  var loginUrl=ps.publicLoginUrl||'';
  c.innerHTML=`<div class="space-y-6">
    <div class="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
      <div>
        <h2 class="text-xl font-semibold text-white"><i class="fas fa-cog text-sprint-400 mr-2"></i>Admin Settings</h2>
        <p class="text-sm text-slate-400 mt-1">Platform bot, monitoring alerts, approval welcome message, and global AI provider.</p>
      </div>
      <button onclick="renderAdminTab(&quot;settings&quot;)" class="btn btn-ghost text-xs"><i class="fas fa-rotate"></i> Refresh</button>
    </div>
    <div class="grid grid-cols-1 xl:grid-cols-3 gap-5">
      <div class="card p-5 xl:col-span-1">
        <h3 class="text-white font-semibold mb-3">Configuration Status</h3>
        <div class="space-y-3">
          ${adminConfiguredRow('SprintSales Admin Bot',configured,'Required for approval welcome messages, password-change codes, and platform Telegram messages.')}
          ${adminConfiguredRow('Admin Alert Chat ID',Boolean(ps.adminAlertChatId),'Where system monitoring alerts are delivered.')}
          ${adminConfiguredRow('Monitoring Alerts',alertsOn,'Enable after the admin bot and chat ID are saved.')}
          ${adminConfiguredRow('Approval Welcome',Boolean(welcome),'Sent automatically when an admin approves a new client.')}
          ${adminConfiguredRow('Global AI Key',aiConfigured,'Used only for clients set to admin-managed AI.')}
        </div>
        <div class="flex flex-wrap gap-2 mt-4">
          <button onclick="testAdminAlert()" class="btn btn-secondary text-xs"><i class="fas fa-paper-plane"></i> Send Test Alert</button>
          <span id="admin-system-status" class="text-xs text-slate-500 self-center"></span>
        </div>
      </div>
      <div class="card p-6 xl:col-span-2">
        <h3 class="text-white font-semibold mb-1"><i class="fas fa-shield-alt text-sprint-400 mr-2"></i>SprintSales Admin Bot & Client Welcome</h3>
        <p class="text-xs text-slate-500 mb-4">Use the platform-owned SprintSales bot here. The approval welcome is sent to the verified owner Telegram chat after approval.</p>
        <form onsubmit="saveAdminSystemSettings(event)" class="space-y-4">
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label class="text-xs text-slate-400 block mb-1">Admin Bot Token</label>
              <input id="admin-bot-token" class="field" type="password" data-configured="${configured?'1':'0'}" placeholder="${configured?'Admin bot saved - leave blank to keep':'Paste token from BotFather'}">
            </div>
            <div>
              <label class="text-xs text-slate-400 block mb-1">SprintSales Admin Alert Chat ID</label>
              <input id="admin-alert-chat-id" class="field" value="${esc(ps.adminAlertChatId||'')}" placeholder="Your Telegram chat ID">
            </div>
          </div>
          <div>
            <label class="text-xs text-slate-400 block mb-1">Client login URL</label>
            <input id="admin-public-login-url" class="field" value="${esc(loginUrl)}" placeholder="https://automation.sprintsales.net/login">
          </div>
          <div>
            <label class="text-xs text-slate-400 block mb-1">Approval welcome message</label>
            <textarea id="admin-client-welcome" class="field min-h-[180px]" maxlength="2500" placeholder="Write the message clients receive after approval.">${esc(welcome)}</textarea>
            <p class="text-xs text-slate-500 mt-1">Available placeholders: {businessName}, {ownerName}, {plan}, {loginUrl}</p>
          </div>
          <label class="flex items-center gap-2 text-sm text-white"><input id="admin-alerts-enabled" type="checkbox" ${alertsOn?'checked':''}> Enable system alerts</label>
          <div class="flex flex-wrap gap-2">
            <button type="submit" class="btn btn-primary text-xs"><i class="fas fa-save"></i> Save Bot & Welcome</button>
            <button type="button" onclick="testAdminAlert()" class="btn btn-ghost text-xs"><i class="fas fa-paper-plane"></i> Test Alert</button>
          </div>
        </form>
      </div>
      <div class="card p-6 xl:col-span-3">
        <h3 class="text-white font-semibold mb-1"><i class="fas fa-key text-sprint-400 mr-2"></i>Global AI Provider</h3>
        <p class="text-xs text-slate-500 mb-4">Clients can still use their own key. This is the fallback for admin-managed AI.</p>
        <form onsubmit="saveAdminAiProvider(event)" class="grid grid-cols-1 lg:grid-cols-[260px_1fr_auto] gap-4 items-end">
          <div>
            <label class="text-xs text-slate-400 block mb-1">Provider</label>
            <select id="admin-ai-provider" class="field">${['gemini','deepseek','openai','anthropic','grok'].map(function(p){var label=p==='anthropic'?'Claude / Anthropic':p.charAt(0).toUpperCase()+p.slice(1);return'<option value="'+p+'"'+(provider===p||provider==='claude'&&p==='anthropic'?' selected':'')+'>'+label+'</option>'}).join('')}</select>
          </div>
          <div>
            <label class="text-xs text-slate-400 block mb-1">Global API Key</label>
            <input id="admin-ai-api-key" class="field" type="password" data-configured="${aiConfigured?'1':'0'}" placeholder="${aiConfigured?'Global key saved - leave blank to keep':'Paste global API key'}">
            <p class="text-xs text-slate-500 mt-1">Leave blank to keep the saved key. Masked values are never saved as real keys.</p>
          </div>
          <button type="submit" class="btn btn-primary text-xs"><i class="fas fa-save"></i> Save Global AI Key</button>
        </form>
      </div>
    </div>
  </div>`;
};

var adminAuditSearch='',adminAuditAction='all';
function adminAuditMatches(log){var action=log.action||'activity';if(adminAuditAction!=='all'&&action!==adminAuditAction)return false;var q=(adminAuditSearch||'').toLowerCase().trim();if(!q)return true;return [action,log.clientName,log.clientId,log.userEmail,log.actor,log.details].filter(Boolean).join(' ').toLowerCase().includes(q)}
async function renderAdminAuditTabV2(c){var d=await apiFetch('/api/admin/audit');var logs=(d&&d.logs)||[];var actions=[...new Set(logs.map(function(log){return log.action||'activity'}))].sort();var visible=logs.filter(adminAuditMatches);c.innerHTML='<div class="space-y-6"><div class="flex flex-col sm:flex-row sm:items-end justify-between gap-3"><div><h2 class="text-xl font-semibold text-white"><i class="fas fa-history text-sprint-400 mr-2"></i>Audit Log</h2><p class="text-sm text-slate-400 mt-1">Showing '+esc(visible.length)+' of '+esc(logs.length)+' recent platform actions.</p></div><button onclick="renderAdminTab(&quot;audit&quot;)" class="btn btn-ghost text-xs"><i class="fas fa-rotate"></i> Refresh</button></div><div class="card p-4"><div class="grid grid-cols-1 md:grid-cols-[1fr_260px_auto] gap-3"><input id="admin-audit-search" class="field" value="'+esc(adminAuditSearch)+'" placeholder="Search action, client, actor, details..." oninput="adminAuditSearch=this.value" onkeyup="if(event.key===&quot;Enter&quot;)renderAdminTab(&quot;audit&quot;)"><select id="admin-audit-action" class="field" onchange="adminAuditAction=this.value;renderAdminTab(&quot;audit&quot;)"><option value="all">All actions</option>'+actions.map(function(action){return'<option value="'+esc(action)+'"'+(adminAuditAction===action?' selected':'')+'>'+esc(action)+'</option>'}).join('')+'</select><button onclick="renderAdminTab(&quot;audit&quot;)" class="btn btn-secondary text-xs"><i class="fas fa-search"></i> Search</button></div></div>'+
  (visible.length?'<div class="card overflow-hidden"><div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="text-left text-xs uppercase text-slate-500 border-b border-slate-700"><th class="py-3 px-4">Time</th><th class="py-3 px-4">Action</th><th class="py-3 px-4">Client</th><th class="py-3 px-4">Admin/User</th><th class="py-3 px-4">Details</th></tr></thead><tbody>'+visible.map(function(log){var actor=log.userEmail||log.user?.email||log.user?.name||log.actor||'System';var clientName=log.clientName||log.target||log.clientId||'';var time=log.createdAt||log.time||log.at||'';return'<tr class="border-b border-slate-800 align-top"><td class="py-3 px-4 whitespace-nowrap text-slate-400">'+esc(time?new Date(time).toLocaleString():'unknown')+'</td><td class="py-3 px-4"><span class="badge badge-pending text-xs">'+esc(log.action||'activity')+'</span></td><td class="py-3 px-4 text-slate-300">'+esc(clientName||'-')+'</td><td class="py-3 px-4 text-slate-400">'+esc(actor)+'</td><td class="py-3 px-4 text-slate-300 max-w-xl">'+esc(log.details||'')+'</td></tr>'}).join('')+'</tbody></table></div></div>':'<div class="card p-8 text-center"><i class="fas fa-search text-3xl text-slate-600 mb-3 block"></i><p class="text-slate-400">No audit entries match this filter.</p></div>')+'</div>'}
async function renderAdminAuditTab(c){
  var d=await apiFetch('/api/admin/audit');
  var logs=(d&&d.logs)||[];
  c.innerHTML='<div class="space-y-6"><div class="flex flex-col sm:flex-row sm:items-end justify-between gap-3"><div><h2 class="text-xl font-semibold text-white"><i class="fas fa-history text-sprint-400 mr-2"></i>Audit Log</h2><p class="text-sm text-slate-400 mt-1">Last '+esc(logs.length)+' platform actions, newest first.</p></div><button onclick="renderAdminTab(&quot;audit&quot;)" class="btn btn-ghost text-xs"><i class="fas fa-rotate"></i> Refresh</button></div>'+
  (logs.length?'<div class="card overflow-hidden"><div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="text-left text-xs uppercase text-slate-500 border-b border-slate-700"><th class="py-3 px-4">Time</th><th class="py-3 px-4">Action</th><th class="py-3 px-4">Client</th><th class="py-3 px-4">Admin/User</th><th class="py-3 px-4">Details</th></tr></thead><tbody>'+logs.map(function(log){var actor=log.userEmail||log.user?.email||log.user?.name||log.actor||'System';var clientName=log.clientName||log.target||log.clientId||'';var time=log.createdAt||log.time||log.at||'';return'<tr class="border-b border-slate-800 align-top"><td class="py-3 px-4 whitespace-nowrap text-slate-400">'+esc(time?new Date(time).toLocaleString():'unknown')+'</td><td class="py-3 px-4"><span class="badge badge-pending text-xs">'+esc(log.action||'activity')+'</span></td><td class="py-3 px-4 text-slate-300">'+esc(clientName||'-')+'</td><td class="py-3 px-4 text-slate-400">'+esc(actor)+'</td><td class="py-3 px-4 text-slate-300 max-w-xl">'+esc(log.details||'')+'</td></tr>'}).join('')+'</tbody></table></div></div>':'<div class="card p-8 text-center"><i class="fas fa-clipboard-list text-3xl text-slate-600 mb-3 block"></i><p class="text-slate-400">No audit activity recorded yet.</p></div>')+'</div>';
}

var discountCodesDraft=[];
function discountCapText(value){var n=Number(value)||0;return n>0?n+' per week':'No weekly limit'}
function discountCodeRows(){var box=document.getElementById('discount-code-list');if(!box)return;if(!discountCodesDraft.length){box.innerHTML='<div class="rounded-lg border border-dashed border-slate-700 p-4 text-sm text-slate-400">No promo codes yet. Add a code only when you want customers to type a word like SAVE10.</div>';return}box.innerHTML=discountCodesDraft.map(function(code,i){return'<div class="card p-3 bg-slate-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><div class="text-white font-semibold text-sm">'+esc(code.code)+'</div><div class="text-xs text-slate-400">'+esc(code.value)+'% off'+(code.expiresAt?' - expires '+esc(code.expiresAt):'')+' - '+esc(discountCapText(code.maxPerWeek))+'</div></div><button type="button" onclick="removeDiscountCode('+i+')" class="btn btn-ghost text-xs"><i class="fas fa-trash"></i> Remove</button></div>'}).join('')}
function addDiscountCode(){var code=((document.getElementById('disc-code')||{}).value||'').trim().toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,24);var value=Math.max(0,Math.min(100,Number((document.getElementById('disc-code-value')||{}).value)||0));var expiresAt=((document.getElementById('disc-code-expiry')||{}).value||'').slice(0,10);var maxPerWeek=Math.max(0,Number((document.getElementById('disc-code-weekly-cap')||{}).value)||0);if(!code||!value){showToast('Add a promo code and discount percent first.','warning');return}var existing=discountCodesDraft.find(function(c){return c.code===code});if(existing){existing.value=value;existing.expiresAt=expiresAt;existing.maxPerWeek=maxPerWeek;existing.enabled=true}else{discountCodesDraft.push({code:code,value:value,expiresAt:expiresAt,maxPerWeek:maxPerWeek,enabled:true,type:'percent',maxUses:0,maxUsesPerCustomer:1})}discountCodeRows();showToast('Promo code added.','success')}
function removeDiscountCode(i){discountCodesDraft.splice(i,1);discountCodeRows()}
function discountRuleCard(opts){return'<div class="card p-4 space-y-3"><div><label class="flex items-center gap-2 text-sm text-white font-semibold"><input id="'+opts.enabledId+'" type="checkbox" '+(opts.enabled?'checked':'')+'> '+opts.title+'</label><p class="text-xs text-slate-500 mt-1">'+opts.help+'</p></div><div><label class="text-xs text-slate-400 block mb-1">Discount percent</label><div class="flex items-center gap-2"><input id="'+opts.valueId+'" class="field" type="number" min="0" max="100" value="'+esc(opts.value||0)+'"><span class="text-xs text-slate-500">% off</span></div></div>'+opts.extra+'<div><label class="text-xs text-slate-400 block mb-1">Weekly limit</label><input id="'+opts.capId+'" class="field" type="number" min="0" value="'+esc(opts.maxPerWeek||0)+'"><p class="text-xs text-slate-500 mt-1">0 means no limit. Example: 5 means only the first 5 eligible orders this week get this discount.</p></div></div>'}
function renderDiscountsTab(c){var d=((client||{}).settings||{}).discounts||{};var newBuyer=d.newBuyer||{},repeatBuyer=d.repeatBuyer||{},birthdayWeek=d.birthdayWeek||{},sales=d.sales||{},holiday=d.holiday||{};discountCodesDraft=Array.isArray(d.codes)?d.codes.slice():[];c.innerHTML='<div class="space-y-6"><div><h2 class="text-xl font-semibold text-white"><i class="fas fa-tag text-sprint-400 mr-2"></i>Discount Settings</h2><p class="text-sm text-slate-400 mt-1">Keep this simple: choose who gets a discount, how much they get, and the weekly safety limit.</p></div><form onsubmit="saveDiscountSettings(event)" class="space-y-4"><div class="card p-4 space-y-3"><label class="flex items-center gap-2 text-sm text-white"><input id="disc-enabled" type="checkbox" '+(d.enabled!==false?'checked':'')+'> Turn discounts on</label><label class="flex items-center gap-2 text-sm text-white"><input id="disc-stacking" type="checkbox" '+(d.allowStacking?'checked':'')+'> Let customers receive more than one discount at the same time</label><p class="text-xs text-slate-500">Recommended: leave stacking off. Then the bot gives only the best discount the customer qualifies for.</p></div><div class="grid grid-cols-1 lg:grid-cols-3 gap-4">'+discountRuleCard({title:'New customer discount',help:'For a customer who has never completed a paid order before.',enabledId:'disc-new-enabled',valueId:'disc-new-value',capId:'disc-new-cap',enabled:newBuyer.enabled,value:newBuyer.value,maxPerWeek:newBuyer.maxPerWeek,extra:''})+discountRuleCard({title:'Loyal customer discount',help:'For customers who already bought from this shop before.',enabledId:'disc-repeat-enabled',valueId:'disc-repeat-value',capId:'disc-repeat-cap',enabled:repeatBuyer.enabled,value:repeatBuyer.value,maxPerWeek:repeatBuyer.maxPerWeek,extra:'<div><label class="text-xs text-slate-400 block mb-1">After how many paid orders?</label><input id="disc-repeat-count" class="field" type="number" min="1" value="'+esc(repeatBuyer.purchaseCount||2)+'"><p class="text-xs text-slate-500 mt-1">Example: 2 means give this after the customer has 2 paid orders.</p></div>'})+discountRuleCard({title:'Birthday week discount',help:'Only works if Telegram provides birthday data. We do not ask customers to type birthdays.',enabledId:'disc-birthday-enabled',valueId:'disc-birthday-value',capId:'disc-birthday-cap',enabled:birthdayWeek.enabled,value:birthdayWeek.value,maxPerWeek:birthdayWeek.maxPerWeek,extra:''})+discountRuleCard({title:'Sales discount',help:'A store-wide sale discount. Products can be opted out from the product form.',enabledId:'disc-sales-enabled',valueId:'disc-sales-value',capId:'disc-sales-cap',enabled:sales.enabled,value:sales.value,maxPerWeek:sales.maxPerWeek,extra:''})+discountRuleCard({title:'Holiday discount',help:'For holidays and seasonal campaigns. Products can be opted out from the product form.',enabledId:'disc-holiday-enabled',valueId:'disc-holiday-value',capId:'disc-holiday-cap',enabled:holiday.enabled,value:holiday.value,maxPerWeek:holiday.maxPerWeek,extra:''})+'</div><div class="card p-4"><h3 class="text-white font-semibold mb-1">Promo Codes</h3><p class="text-xs text-slate-500 mb-3">Use this when the owner wants to share a code like SAVE10 on Telegram, TikTok, or posters.</p><div class="grid grid-cols-1 md:grid-cols-5 gap-3"><div><label class="text-xs text-slate-400 block mb-1">Code</label><input id="disc-code" class="field" placeholder="SAVE10"></div><div><label class="text-xs text-slate-400 block mb-1">Percent off</label><input id="disc-code-value" class="field" type="number" min="0" max="100" placeholder="10"></div><div><label class="text-xs text-slate-400 block mb-1">Expires on</label><input id="disc-code-expiry" class="field" type="date"></div><div><label class="text-xs text-slate-400 block mb-1">Weekly limit</label><input id="disc-code-weekly-cap" class="field" type="number" min="0" placeholder="0"></div><button type="button" onclick="addDiscountCode()" class="btn btn-secondary text-xs self-end"><i class="fas fa-plus"></i> Add Code</button></div><div id="discount-code-list" class="space-y-2 mt-3"></div></div><button type="submit" class="btn btn-primary text-xs"><i class="fas fa-save"></i> Save Discounts</button></form></div>';setTimeout(discountCodeRows,0)}
async function saveDiscountSettings(e){e.preventDefault();var discounts={enabled:document.getElementById('disc-enabled').checked,allowStacking:document.getElementById('disc-stacking').checked,newBuyer:{enabled:document.getElementById('disc-new-enabled').checked,type:'percent',value:Number(document.getElementById('disc-new-value').value)||0,maxPerWeek:Number(document.getElementById('disc-new-cap').value)||0},repeatBuyer:{enabled:document.getElementById('disc-repeat-enabled').checked,type:'percent',value:Number(document.getElementById('disc-repeat-value').value)||0,purchaseCount:Number(document.getElementById('disc-repeat-count').value)||2,maxPerWeek:Number(document.getElementById('disc-repeat-cap').value)||0},birthdayWeek:{enabled:document.getElementById('disc-birthday-enabled').checked,type:'percent',value:Number(document.getElementById('disc-birthday-value').value)||0,maxPerWeek:Number(document.getElementById('disc-birthday-cap').value)||0},sales:{enabled:document.getElementById('disc-sales-enabled').checked,type:'percent',value:Number(document.getElementById('disc-sales-value').value)||0,maxPerWeek:Number(document.getElementById('disc-sales-cap').value)||0},holiday:{enabled:document.getElementById('disc-holiday-enabled').checked,type:'percent',value:Number(document.getElementById('disc-holiday-value').value)||0,maxPerWeek:Number(document.getElementById('disc-holiday-cap').value)||0},codes:discountCodesDraft};try{var res=await apiFetch('/api/client/settings',{method:'PUT',body:JSON.stringify({discounts:discounts})});if(res&&res.client){client=res.client}else{client.settings=client.settings||{};client.settings.discounts=discounts}showToast('Discount settings saved.','success');switchClientTab('discounts')}catch(err){showToast(err.message,'error')}}

function closeMobileMenu(){var sidebar=document.querySelector('.sidebar');if(sidebar)sidebar.classList.remove('open');document.body.classList.remove('mobile-menu-open')}
function toggleMobileMenu(){var sidebar=document.querySelector('.sidebar');if(!sidebar)return;sidebar.classList.toggle('open');document.body.classList.toggle('mobile-menu-open',sidebar.classList.contains('open'))}
document.addEventListener('click',function(e){if(!document.body.classList.contains('mobile-menu-open'))return;var sidebar=document.querySelector('.sidebar');var btn=document.getElementById('mobile-menu-btn');if(sidebar&&sidebar.contains(e.target))return;if(btn&&btn.contains(e.target))return;closeMobileMenu()});
window.addEventListener('resize',function(){if(window.innerWidth>=769)closeMobileMenu()});

renderOverviewTab=function(c,isActive){
  var s=appState||{}, d=client||{}, settings=d.settings||{}, bp=settings.businessProfile||{};
  var products=s.products||[], orders=(s.orders||[]).slice().sort(function(a,b){return orderTime(b)-orderTime(a)});
  var posts=s.productPosts||[], customers=s.customers||[];
  var activeOrders=orders.filter(function(o){return orderStatusGroup(o)!=='delivered'&&orderStatusGroup(o)!=='cancelled'}).length;
  var delivered=orders.filter(function(o){return orderStatusGroup(o)==='delivered'}).length;
  var revenue=orders.filter(function(o){return orderStatusGroup(o)!=='cancelled'}).reduce(function(sum,o){return sum+orderAmount(o)},0);
  var readyProducts=products.filter(function(p){return p.isActive!==false&&p.name&&p.price&&p.code}).length;
  var latest=orders[0]||null;
  var address=bp.address||d.address||((settings.delivery||{}).shop_address)||'Not set yet';
  var today=new Date(), days=[];
  for(var i=6;i>=0;i--){var dt=new Date(today);dt.setDate(today.getDate()-i);var key=dt.toISOString().slice(0,10);days.push({key:key,label:dt.toLocaleDateString('en-US',{weekday:'short'}),count:0,total:0})}
  orders.forEach(function(o){var key=String(o.createdAt||o.updatedAt||'').slice(0,10);var day=days.find(function(d){return d.key===key});if(day){day.count+=1;day.total+=orderAmount(o)}});
  var maxCount=Math.max(1,...days.map(function(day){return day.count}));
  var lowStock=products.filter(function(p){return p.stockQuantity!=null&&Number(p.stockQuantity)<=3}).slice(0,4);
  var recentProducts=products.slice(0,4);
  var focus=lowStock.length?lowStock:recentProducts;
  var logo=settings.businessLogoUrl?'<img src="'+esc(settings.businessLogoUrl)+'" class="overview-logo">':'<div class="overview-logo fallback"><i class="fas fa-store"></i></div>';
  function metric(label,value,sub,icon,tab){return'<button type="button" class="metric-tile" onclick="switchClientTab(\''+tab+'\')"><div class="flex items-start justify-between gap-3"><div><p class="text-xs text-slate-500 font-semibold uppercase">'+label+'</p><p class="text-2xl font-black text-white mt-1">'+value+'</p><p class="text-xs text-slate-500 mt-1">'+sub+'</p></div><div class="metric-icon"><i class="fas fa-'+icon+'"></i></div></div></button>'}
  function focusItem(p){var src=p&&p.id?postPreviewImage(p):'';var thumb=src?'<img src="'+esc(src)+'">':'<i class="fas fa-box"></i>';return'<button type="button" onclick="showProductForm(\''+esc(p.id||'')+'\')" class="focus-row"><div class="focus-thumb">'+thumb+'</div><div class="min-w-0 text-left"><p class="text-sm font-bold text-white truncate">'+esc(p.name||p.code||'Product')+'</p><p class="text-xs text-slate-500 truncate">'+esc(p.code||'')+' '+esc(p.category||'')+'</p></div><span class="badge '+stockBadge(Number(p.stockQuantity||0))+' text-xs">'+stockLabel(Number(p.stockQuantity||0))+'</span></button>'}
  c.innerHTML='<div class="space-y-6">'+
  '<div class="command-hero card p-6"><div class="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-5"><div class="flex items-center gap-4">'+logo+'<div><div class="flex flex-wrap gap-2 mb-2"><span class="command-chip"><i class="fas fa-signal"></i> '+(isActive?'Active workspace':'Setup mode')+'</span><span class="command-chip"><i class="fas fa-location-dot"></i> '+esc(address)+'</span></div><h2 class="text-3xl font-black text-white">'+esc(d.businessName||'My Business')+'</h2><p class="text-sm text-white/80 mt-1">'+(isActive?'Your Telegram sales desk is ready. Watch orders, products, posts, and customers from one clean control room.':'Finish the important settings here, then approval unlocks the selling tools.')+'</p></div></div><div class="grid grid-cols-3 gap-3 min-w-[280px]"><div class="rounded-xl bg-white/12 border border-white/15 p-3"><p class="text-xs text-white/70">Revenue</p><p class="text-xl font-black text-white">ETB '+Math.round(revenue).toLocaleString()+'</p></div><div class="rounded-xl bg-white/12 border border-white/15 p-3"><p class="text-xs text-white/70">Active</p><p class="text-xl font-black text-white">'+activeOrders+'</p></div><div class="rounded-xl bg-white/12 border border-white/15 p-3"><p class="text-xs text-white/70">Delivered</p><p class="text-xl font-black text-white">'+delivered+'</p></div></div></div></div>'+
  '<div class="dashboard-grid">'+metric('Products',products.length,readyProducts+' bot-ready','box','products')+metric('Orders',orders.length,activeOrders+' active now','cart-shopping','orders')+metric('Post Center',posts.length,'Drafts and published posts','bullhorn','posts')+metric('Customers',customers.length,'Leads and buyers','users','customers')+'</div>'+
  '<div class="grid grid-cols-1 xl:grid-cols-3 gap-5"><div class="card p-5 xl:col-span-2"><div class="flex items-center justify-between gap-3 mb-3"><div><h3 class="text-white font-bold">7-Day Order Pulse</h3><p class="text-xs text-slate-500">A simple view of recent order activity.</p></div><button onclick="switchClientTab(\'orders\')" class="btn btn-ghost text-xs"><i class="fas fa-arrow-right"></i> Orders</button></div><div class="mini-bar-wrap">'+days.map(function(day){var h=16+Math.round((day.count/maxCount)*100);return'<div class="flex-1 text-center"><div title="'+day.count+' order(s)" class="mini-bar mx-auto" style="height:'+h+'px"></div><p class="text-[10px] text-slate-500 mt-2">'+day.label+'</p></div>'}).join('')+'</div></div>'+
  '<div class="card p-5"><div class="flex items-center justify-between gap-3 mb-3"><div><h3 class="text-white font-bold">Today&apos;s Focus</h3><p class="text-xs text-slate-500">'+(lowStock.length?'Low-stock products need attention.':'Recent products are ready to manage.')+'</p></div><button onclick="switchClientTab(\'products\')" class="btn btn-ghost text-xs"><i class="fas fa-box"></i></button></div><div class="space-y-2">'+(focus.length?focus.map(focusItem).join(''):'<div class="rounded-xl border border-slate-700 p-4 text-sm text-slate-500">Add your first products to activate this workspace.</div>')+'</div></div></div>'+
  '<div class="grid grid-cols-1 xl:grid-cols-3 gap-5"><div class="card p-5"><h3 class="text-white font-bold mb-3">Latest Order</h3>'+(latest?'<div class="space-y-2"><p class="text-lg font-black text-white">'+esc(latest.productName||latest.productCode||'Order')+'</p><p class="text-sm text-slate-500">'+esc(latest.customerName||latest.name||'Customer')+' · '+esc(orderStatusGroup(latest).replace(/_/g,' '))+'</p><p class="text-sm font-bold text-white">ETB '+Math.round(orderAmount(latest)).toLocaleString()+'</p><button onclick="switchClientTab(\'orders\')" class="btn btn-secondary text-xs mt-2"><i class="fas fa-eye"></i> View orders</button></div>':'<p class="text-sm text-slate-500">No orders yet. Once shoppers start buying, the latest order appears here.</p>')+'</div><div class="card p-5 xl:col-span-2"><h3 class="text-white font-bold mb-3">Fast Setup Checklist</h3><div class="grid grid-cols-1 md:grid-cols-3 gap-3">'+
  '<button onclick="switchClientTab(\'products\')" class="rounded-xl border border-slate-700 p-4 text-left hover:bg-slate-900/40"><i class="fas fa-box text-sprint-400 mb-2"></i><p class="text-sm font-bold text-white">Products</p><p class="text-xs text-slate-500">Add photos, prices, options.</p></button>'+
  '<button onclick="switchClientTab(\'payment\')" class="rounded-xl border border-slate-700 p-4 text-left hover:bg-slate-900/40"><i class="fas fa-credit-card text-sprint-400 mb-2"></i><p class="text-sm font-bold text-white">Payment</p><p class="text-xs text-slate-500">Set accounts shoppers pay to.</p></button>'+
  '<button onclick="switchClientTab(\'bot\')" class="rounded-xl border border-slate-700 p-4 text-left hover:bg-slate-900/40"><i class="fas fa-robot text-sprint-400 mb-2"></i><p class="text-sm font-bold text-white">Telegram Bot</p><p class="text-xs text-slate-500">Connect the shop bot.</p></button>'+
  '</div></div></div></div>';
};

// â”€â”€ Public Page Auth Functions â”€â”€
function switchAuthTab(tab){var lf=$('auth-login');var rf=$('auth-register');var lt=$('tab-login-btn');var rt=$('tab-register-btn');var le=$('login-error');var re=$('reg-error');if(tab==='register'){if(lf)lf.classList.add('hidden');if(rf)rf.classList.remove('hidden');if(lt)lt.classList.remove('active');if(rt)rt.classList.add('active');if(le)le.classList.add('hidden')}else{if(lf)lf.classList.remove('hidden');if(rf)rf.classList.add('hidden');if(lt)lt.classList.add('active');if(rt)rt.classList.remove('active');if(re)re.classList.add('hidden')}}

function showForgotPasswordForm(){var f=$('forgot-password-form');if(f)f.classList.toggle('hidden');var id=$('forgot-identifier'),login=$('login-identifier');if(id&&login&&!id.value)id.value=login.value}
async function requestForgotPassword(e){e.preventDefault();var status=$('forgot-status'),btn=$('forgot-btn');var identifier=($('forgot-identifier')||{}).value||'',newPassword=($('forgot-new-password')||{}).value||'';if(status)status.textContent='Sending reset code...';if(btn)btn.disabled=true;try{var r=await fetch('/api/forgot-password/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:identifier,newPassword:newPassword})});var d=await r.json();if(!r.ok)throw new Error(d.error||'Reset request failed');if(status)status.textContent=d.message||'If the account can be verified, a code was sent.';var row=$('forgot-code-row');if(row)row.classList.remove('hidden');showToast('Check the owner Telegram chat for the reset code.','success')}catch(err){if(status)status.textContent=err.message;showToast(err.message,'error')}finally{if(btn)btn.disabled=false}}
async function confirmForgotPassword(){var status=$('forgot-status');var identifier=($('forgot-identifier')||{}).value||'',code=($('forgot-code')||{}).value||'';if(status)status.textContent='Confirming reset...';try{var r=await fetch('/api/forgot-password/confirm',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:identifier,code:code})});var d=await r.json();if(!r.ok)throw new Error(d.error||'Reset failed');if(status)status.textContent=d.message||'Password reset.';showToast('Password reset. Opening your dashboard...','success');if(d.user){user=d.user;client=d.client||d.clientSettings||null;_loginRendered=false;var p=$('public-page');if(p)p.classList.add('hidden');if(user.role==='admin'){currentTab='overview';loadAdminDashboard()}else{currentTab='overview';await initDashboard();loadClientDashboard()}}}catch(err){if(status)status.textContent=err.message;showToast(err.message,'error')}}

async function doPublicLogin(e){e.preventDefault();var id=document.getElementById('login-identifier');var pw=document.getElementById('login-password');var btn=document.getElementById('login-btn');var errEl=document.getElementById('login-error');if(!id||!pw)return;var email=id.value.trim();var password=pw.value;var adminPath=window.location.pathname==='/admin-login';if(!email||!password){if(errEl){errEl.textContent='Please enter email and password.';errEl.classList.remove('hidden')}return}if(errEl)errEl.classList.add('hidden');if(btn){btn.disabled=true;btn.innerHTML='<i class="fas fa-spinner loading-spinner"></i> Signing in...'}try{var r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email,password:password})});var d=await r.json();if(!r.ok)throw new Error(d.error||'Login failed ('+r.status+')');if(adminPath&&(!d.user||d.user.role!=='admin')){await fetch('/api/logout',{method:'POST'}).catch(function(){});throw new Error('This page is for SprintSales admins only. Client businesses should use the normal login page.')}if(!adminPath&&d.user&&d.user.role==='admin'){await fetch('/api/logout',{method:'POST'}).catch(function(){});throw new Error('Please use the dedicated admin login page: /admin-login')}user=d.user;client=d.client||d.clientSettings||null;_loginRendered=false;$('public-page').classList.add('hidden');if(user.role==='admin'){currentTab='overview';loadAdminDashboard()}else{currentTab='overview';await initDashboard();loadClientDashboard()}}catch(err){if(errEl){errEl.textContent=err.message;errEl.classList.remove('hidden')}}finally{if(btn){btn.disabled=false;btn.innerHTML='<i class="fas fa-sign-in-alt"></i> '+(adminPath?'Log in to Admin':'Sign In')}}}

async function requestRegisterCode(){var status=document.getElementById('reg-code-status'),btn=document.getElementById('reg-code-btn');var biz=document.getElementById('reg-business'),phone=document.getElementById('reg-phone');if(status)status.textContent='Checking Telegram phone verification...';if(btn)btn.disabled=true;try{var r=await fetch('/api/register/check-telegram',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({businessName:(biz?biz.value.trim():''),phone:(phone?phone.value.trim():'')})});var d=await r.json();if(!r.ok)throw new Error(d.error||'Telegram verification not found');if(status)status.textContent=d.message||'Telegram owner verified. You can create the account now.';showToast('Telegram owner verified.','success')}catch(err){if(status)status.textContent=err.message;showToast(err.message,'error')}finally{if(btn)btn.disabled=false}}

async function doPublicRegister(e){e.preventDefault();var name=document.getElementById('reg-name');var biz=document.getElementById('reg-business');var phone=document.getElementById('reg-phone');var email=document.getElementById('reg-email');var pw=document.getElementById('reg-password');var pw2=document.getElementById('reg-password2');var rtype=document.getElementById('reg-type');var rplan=document.getElementById('reg-plan');var btn=document.getElementById('reg-btn');var errEl=document.getElementById('reg-error');if(!name||!biz||!pw||!pw2)return;var retailType=(rtype?rtype.value:'');var regData={name:name.value.trim(),businessName:biz.value.trim(),phone:(phone?phone.value.trim():''),email:(email?email.value.trim():''),password:pw.value,password2:pw2.value,businessType:'retail',retailType:retailType,subscriptionPlan:(rplan?rplan.value:'basic'),ownerName:name.value.trim()};if(!regData.password||!regData.name||!regData.businessName||!regData.phone){if(errEl){errEl.textContent='Please fill all required fields.';errEl.classList.remove('hidden')}return}if(!regData.retailType){if(errEl){errEl.textContent='Please choose your business type.';errEl.classList.remove('hidden')}return}if(regData.password!==regData.password2){if(errEl){errEl.textContent='Passwords do not match.';errEl.classList.remove('hidden')}return}if(regData.password.length<5){if(errEl){errEl.textContent='Password must be at least 5 characters.';errEl.classList.remove('hidden')}return}if(errEl)errEl.classList.add('hidden');if(btn){btn.disabled=true;btn.innerHTML='<i class="fas fa-spinner loading-spinner"></i> Registering...'}try{var r=await fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(regData)});var d=await r.json();if(!r.ok)throw new Error(d.error||'Registration failed ('+r.status+')');user=d.user;client=d.client||null;_loginRendered=false;showToast('Account created! Exploring your dashboard...','success');$('public-page').classList.add('hidden');currentTab='overview';await initDashboard();loadClientDashboard()}catch(err){if(errEl){errEl.textContent=err.message;errEl.classList.remove('hidden')}}finally{if(btn){btn.disabled=false;btn.innerHTML='<i class="fas fa-user-plus"></i> Create Account'}}}

async function doLogout(){try{await fetch('/api/logout',{method:'POST'})}catch(e){}user=null;client=null;appState={};_initFired=false;var li=document.getElementById('login-identifier');if(li)li.value='';var lp=document.getElementById('login-password');if(lp)lp.value='';var lb=document.getElementById('login-btn');if(lb){lb.disabled=false;lb.innerHTML='<i class="fas fa-sign-in-alt"></i> Sign In'}var le=document.getElementById('login-error');if(le)le.classList.add('hidden');showPublicPage('login')}
