(() => {
 const host=document.querySelector('#portrait-page');
 const labels={self:'她自己的记录',partner:'搭档的反馈',system:'系统推测',unknown:'归属待确认'};
 let state=null,mode='overview',filter='all',query='',selected=null,loading=false,error='';
 const make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e};
 const button=(text,action,cls='portrait-button')=>{const b=make('button',cls,text);b.type='button';b.onclick=action;return b};
 const clean=t=>t.replace(/\*\*/g,'').replace(/^[-#]\s*/gm,'').trim();
 const when=t=>new Date(t).toLocaleDateString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'});
 function choose(row){selected=row.id;render();host.querySelector('.portrait-drawer')?.focus({preventScroll:true})}
 function change(next,category='all'){mode=next;filter=category;render()}
 function detail(row){
  const aside=make('aside','portrait-drawer');aside.tabIndex=-1;aside.setAttribute('aria-label','来源详情');
  const top=make('div','portrait-drawer-top');top.append(make('h3','','这条印象从哪来'),button('×',()=>{selected=null;render()},'portrait-close'));aside.append(top);
  if(!row){aside.append(make('p','muted','选择一条记录，查看完整原话与来源。'));return aside}
  aside.append(make('span','portrait-badge '+row.category,row.label),make('h4','',row.title),make('p','portrait-quote',clean(row.text)),make('p','muted',row.note));
  aside.append(make('h4','portrait-subheading','关联来源'));
  for(const id of row.sourceIds){
   const source=state.sources[id];if(!source)continue;
   const d=make('details','portrait-source'),summary=make('summary','',source.path.split('/').at(-1)+' · 查看原文');
   d.append(summary,make('p','muted',(source.author?'记录署名：'+source.author+' · ':'')+source.timeLabel+' '+when(source.at)),make('p','portrait-path',source.path));
   const pre=make('pre','portrait-raw',source.body);d.append(pre,make('p','portrait-path','SHA256：'+source.hash));aside.append(d);
  }
  aside.append(make('h4','portrait-subheading','分开记，才不会混淆'),make('p','muted','她的自述、搭档反馈和系统推测分别保留。原文中的第一人称不作为自动归属依据。'),make('p','portrait-readonly','只读预览 · 不修改人设或记忆'));
  return aside;
 }
 function drawList(container,rows){
  if(!rows.length){container.append(make('p','portrait-empty',filter==='system'?state.inferenceNote:'没有符合条件的记录。'));return}
  for(const row of rows){
   const item=button('',()=>choose(row),'portrait-event'+(selected===row.id?' selected':''));
   const meta=make('div','portrait-event-meta');meta.append(make('span','portrait-badge '+row.category,row.label),make('time','',when(row.at)));
   item.append(meta,make('h4','',row.title),make('p','',clean(row.text).slice(0,150)),make('span','portrait-source-link','查看原话与来源 →'));container.append(item);
  }
 }
 function render(){
  host.replaceChildren();const heading=make('div','portrait-heading');heading.append(make('h2','','她慢慢变成了谁'),make('p','page-subtitle','从经历里，看见偏好、关注与变化。'));
  host.append(heading);const toolbar=make('div','portrait-toolbar');
  for(const [key,label] of [['overview','画像概览'],['timeline','变化记录'],['all','全部记忆']]){const b=button(label,()=>change(key),'portrait-tab');b.setAttribute('aria-pressed',String(mode===key));toolbar.append(b)}
  toolbar.append(button(loading?'读取中…':'刷新记录',()=>load(),'portrait-refresh'));host.append(toolbar);
  const status=make('p','portrait-status',error||(loading?'正在只读读取真实记忆…':state?.coverage||''));status.setAttribute('role','status');host.append(status);
  if(!state)return;
  if(state.warnings.length)host.append(make('p','portrait-warning',state.warnings.join(' ')));
  const layout=make('div','portrait-layout'),left=make('div','portrait-main');layout.append(left);
  if(mode==='overview'){
   left.append(make('h3','portrait-section-title','现在能读到的她'));
   const cards=make('div','portrait-cards');
   for(const [kind,title] of [['self','她自己的偏好'],['partner','搭档的反馈'],['system','待她确认']]){
    const rows=state.entries.filter(e=>e.category===kind),row=kind==='self'?(rows.find(e=>e.status==='recorded')||rows[0]):rows[0];
    const c=button('',()=>change('all',kind),'portrait-card '+kind);
    c.append(make('span','portrait-badge '+kind,labels[kind]),make('h3','',title),make('p','',row?clean(row.text).slice(0,100):'暂无独立保存的推测，不替她下结论。'),make('span','portrait-source-link',rows.length?rows.length+' 条记录 · 查看来源 →':'保留空白，等待真实记录'));
    cards.append(c);
   }left.append(cards);
   const timeline=make('section','portrait-timeline');timeline.append(make('h3','','一点点变化'),make('p','muted','按文件更新时间排列，不代表这些想法发生或生效的时刻。'));
   drawList(timeline,state.entries.filter(e=>e.category!=='unknown').slice(0,5));left.append(timeline);
  }else{
   const tools=make('div','portrait-filter');
   for(const [key,label] of [['all','全部'],...Object.entries(labels).filter(([key])=>mode!=='timeline'||key!=='unknown')]){const b=button(label,()=>{filter=key;render()},'portrait-chip');b.setAttribute('aria-pressed',String(filter===key));tools.append(b)}
   const input=make('input','portrait-search');input.type='search';input.placeholder='搜索原话、标题或来源';input.setAttribute('aria-label','搜索画像记录');input.value=query;
   input.oninput=()=>{query=input.value;drawResults()};tools.append(input);left.append(tools);
   const results=make('section','portrait-results');left.append(results);
   function drawResults(){results.replaceChildren();const rows=state.entries.filter(e=>(mode!=='timeline'||e.category!=='unknown')&&(filter==='all'||e.category===filter)&&((e.title+' '+e.text+' '+e.sourceIds.map(id=>state.sources[id]?.path).join(' ')).toLowerCase().includes(query.toLowerCase())));results.append(make('p','muted',rows.length+' 条来源记录'));drawList(results,rows)}drawResults();
  }
  left.append(make('p','portrait-footnote','原始记录保留，画像只是阅读视图。未重新生成偏好，也不会将反馈自动写入人设。'));
  const chosen=state.entries.find(e=>e.id===selected);layout.append(detail(chosen));host.append(layout);
 }
 async function load(){if(loading)return;loading=true;error='';render();try{const response=await fetch('/api/portrait',{cache:'no-store'});if(!response.ok)throw Error();const next=await response.json();state=next;if(!selected)selected=state.entries.find(e=>e.category==='self'&&e.status==='recorded')?.id;else if(!state.entries.some(e=>e.id===selected))selected=null}catch{error='暂时无法读取画像。'+(state?'保留上次读取的记录，请稍后刷新。':'请稍后重试。')}finally{loading=false;render()}}
 window.feiyuPortrait={open(){if(!state)load();else render()}};
 document.querySelector('#refresh').addEventListener('click',()=>{if(!host.hidden)load()});
})();
