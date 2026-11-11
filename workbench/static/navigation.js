(() => {
 const q=s=>document.querySelector(s);
 const routes={home:{name:'首页',tabs:[]},interact:{name:'互动',tabs:[['interactions','评论与弹幕'],['relationships','认识的朋友']]},create:{name:'创作',tabs:[['creations','草稿与投稿'],['publications','已发布作品']]},grow:{name:'成长',tabs:[['interests','当前关注'],['artifacts','成长手记'],['memories','记忆'],['experiences','原始经历']]},live:{name:'直播间',tabs:[]},settings:{name:'设置',tabs:[['account','账号'],['automation','自动任务'],['interaction','互动'],['expression','表达'],['advanced','高级'],['operations','运行诊断']]}};
 let page='home',selected='';
 const make=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e};
 function go(p,t){const hash='#/'+p+(t?'/'+t:'');if(location.hash===hash)route();else location.hash=hash}
 function jump(text,p,t,cls='text-button'){const b=make('button',text,cls);b.type='button';b.onclick=()=>go(p,t);return b}
 function panel(title,body,p,t,action){const a=make('article',null,'card home-card');a.append(make('h3',title),make('p',body),jump(action||'查看记录 ↗',p,t));return a}
 function home(){const box=q('#home-content'),d=window.feiyuRecords.data;box.replaceChildren();if(!d){box.append(make('p',q('#notice').textContent||'正在读取本地记录…','notice'));return}
  if(d.warnings?.length)box.append(make('p',d.warnings.join(' '),'notice'));
  const counts=make('div',null,'home-counts');for(const [label,n,p,t] of [['互动记录',d.interactions?.items?.length||0,'interact','interactions'],['已发布',d.publications.length,'create','publications'],['成长手记',d.artifacts.length,'grow','artifacts']])counts.append(jump(label+' · '+n,p,t,'stat'));box.append(counts);
  const grid=make('div',null,'home-grid'),interest=d.latest?.exploration?.interests?.[0],pub=d.publications[0],op=d.character?.operations?.[0];
  grid.append(panel('她最近在关注',interest?interest.question:'还没有新的关注记录。','grow','interests','看看她怎么想 ↗'));
  grid.append(panel('最近的作品',pub?pub.title:'还没有已发布的作品记录。','create','publications','打开作品架 ↗'));
  const messages=d.interactions?.items||[];grid.append(panel('她和大家聊了什么',messages[0]?messages[0].text:'还没有互动记录。','interact','interactions','查看评论与弹幕 ↗'));
  grid.append(panel('最近一次运行记录',op?operationPresentation(op).body:'还没有运行记录。这里不会把历史记录当作实时状态。','settings','operations','查看运行诊断 ↗'));
  box.append(grid,make('p','这里是现有记录的摘要；完整内容、历史版本和来源都保留在对应页面。','home-note'));
 }
 function route(){const refocus=q('#section-nav').contains(document.activeElement);const parts=location.hash.replace(/^#\/?/,'').split('/');page=routes[parts[0]]?parts[0]:'home';const r=routes[page];selected=r.tabs.some(([key])=>key===parts[1])?parts[1]:(r.tabs[0]?.[0]||'');
  for(const e of document.querySelectorAll('[data-page]')){const active=e.dataset.page===page;e.classList.toggle('active',active);if(active)e.setAttribute('aria-current','page');else e.removeAttribute('aria-current')}
  for(const id of ['home-page','records-page','settings-page','live-page'])q('#'+id).hidden=true;
  q('#breadcrumb').textContent=r.name;const nav=q('#section-nav');nav.replaceChildren();nav.hidden=!r.tabs.length;
  for(const [key,label] of r.tabs){const b=jump(label,page,key,'section-tab');b.setAttribute('aria-current',key===selected?'page':'false');if(page==='settings')b.dataset.settingsTab=key;nav.append(b)}
  if(page==='home'){q('#home-page').hidden=false;home()}
  else if(page==='live'){q('#live-page').hidden=false;window.feiyuPluginsOpen?.()}
  else if(page==='settings'&&selected!=='operations'){q('#settings-page').hidden=false;window.feiyuSettingsOpen?.(selected)}
  else{q('#records-page').hidden=false;window.feiyuRecords.show(selected);q('#records-page .page-subtitle').textContent=({interact:'每次说过的话，都有来处。',create:'从一个念头，到留在世界里的作品。',grow:'先看看她的想法，再翻翻背后的经历。',settings:'查看已有运行记录，不会重新启动任务。'})[page]}
  if(refocus)nav.querySelector('[aria-current=page]')?.focus({preventScroll:true});
  window.feiyuSettingsBadges?.();
  window.scrollTo({top:0,behavior:'instant'});
  window.dispatchEvent(new CustomEvent('feiyu:navigation',{detail:{page,tab:selected}}));
 }
 document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.page)));
 window.addEventListener('hashchange',route);window.addEventListener('feiyu:snapshot',()=>{if(page==='home')home()});
 if(new URLSearchParams(location.search).has('preview'))q('#preview-banner').hidden=false;
 route();
})();
