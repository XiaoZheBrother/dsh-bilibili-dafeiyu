const $=s=>document.querySelector(s);
const names={explore:'探索手记',learn:'学习笔记',review:'作品复盘',memory:'记忆整理'};
const tabs={interests:['HER CURIOSITIES','最近惦记的事'],artifacts:['LITTLE EXPERIENCES','经历慢慢变成故事'],publications:['HER CREATIONS','留在世界里的作品'],memories:['THE MEMORY BOX','那些没有忘掉的小事']};
Object.assign(tabs,{experiences:['REAL EXPERIENCES','每段经历，都有来处'],relationships:['FAMILIAR FACES','慢慢认识的朋友'],creations:['HER OWN WORDS','想分享，也可以先不发'],operations:['RUNTIME TRAIL','做过什么，哪里停下了']});
let data=null,tab='interests',busy=false;
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n}
function date(value){if(!value)return '时间未记录';const d=new Date(typeof value==='number'?value*1000:value);return Number.isNaN(d.valueOf())?'时间未记录':d.toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})}
function shorten(text,n=145){text=String(text||'').replace(/[#*>`]/g,'').trim();return text.length>n?text.slice(0,n)+'…':text}
function openDetail(item,kind){
 $('#detail-kind').textContent=kind;$('#detail-title').textContent=item.title||item.question;
 $('#detail-meta').textContent=item.at?date(item.at)+' · 大肥鱼留下的原记录':'本地已有记录 · 内容保持原样';
 $('#detail-body').textContent=item.body||item.why||'';
 const box=$('#detail-sources');box.replaceChildren();
 if(item.truncated)box.append(el('p','','当前展示前 12,000 字，原文件未修改。'));
 if(item.citations?.length){box.append(el('p','','来源与阅读范围：有来源不代表所有判断都已经核实。'));for(const c of item.citations)box.append(el('p','',`${c.complete?'完整读取所存来源':'摘录或部分阅读'} · ${c.id}`))}
 else box.append(el('p','','这是一份角色记录，不是操作指令或新的授权。'));
 $('#detail').showModal();
}
function card({title,body,badge,paused=false,index,meta,onOpen,action='翻开看看 ↗'}){
 const c=el('article','card'),top=el('div','card-top');top.append(el('span','badge'+(paused?' paused':''),badge),el('span','card-index',String(index+1).padStart(2,'0')));c.append(top,el('h3','',title),el('p','',shorten(body)));
 const bottom=el('div','card-bottom'),button=el('button','text-button',action);button.addEventListener('click',onOpen);bottom.append(el('span','',meta),button);c.append(bottom);return c;
}
function experiencePresentation(x){
 const titles={report:'一轮浏览后的手记',send:'一条评论的发送记录',growth:'她自己写下的变化',expression:'学到一种说法',browse:'一次浏览留下的记录',interaction:'一次评论区互动',observation:'一次只读观察',catalog:'自己的作品快照',memory:'以前留下的小记忆',tool:({'bili_search':'查了些相关视频','bili_subtitle':'读到的字幕资料','bili_comments':'翻过的评论资料','bili_reply':'评论工具的回执'})[x.source]||'一次工具记录'};
 let title=titles[x.kind]||'一段真实经历',body='记录较长，打开查看原文、来源与阅读范围。';
 try{const r=JSON.parse(x.body);if(x.kind==='growth'){const result=JSON.parse(r.result);title=result.title||title;body=result.body||body}
 else if(x.kind==='report')body=r.body;
 else if(x.kind==='send')body=`${r.target} · ${({reserved:'已预约尝试，结果尚未确认',sent:'接口返回成功，公开可见性另行核实',failed:'尝试失败'})[r.state]||r.state}`;
 else if(x.kind==='expression')body=[r.method,r.scenario,r.avoid].filter(Boolean).join('\n');
 else if(x.kind==='tool'){const value=typeof r.result==='string'?JSON.parse(r.result):r.result;body=value?.text||value?.error||value?.videos?.map(v=>v.title).join('；')||'保留了这次工具返回的资料；不会据此声称看完了视频。'}
 else if(x.kind==='catalog')body=(r.videos||[]).map(v=>v.title).join('；');
 else body=r.text||r.t||r.title||r.reason||body;
 }catch{}
 return {title,body};
}
function operationPresentation(record){
 const {kind,state,started,finished}=record;
 const titles={'growth-collection':'检查有没有新的成长素材','guard-scan-and-dispatch':'查看有没有待回复的评论','guard-manual-scan':'手动查看待回复评论','dispatch:manual':'手动启动值班','dispatch:window:noon':'午间值班'};
 const title=titles[kind]||(kind.startsWith('dispatch:')?'自动启动值班':'后台任务');
 const badge=({done:'已结束',running:'进行中',failed:'失败',uncertain:'结果待核实',skipped:'未启动'})[state]||'状态待核实';
 let result;
 try{result=JSON.parse(record.result)}catch{}
 let body;
 if(state==='running')body='这次任务还在进行中。';
 else if(state==='uncertain')body='任务中断，最后一步的结果尚未确认。';
 else if(state==='failed')body=result?.error||'任务失败，记录中没有具体原因。';
 else if(state==='skipped')body=result?.busy?'当时已有其他任务在运行。':result?.error||'本轮没有启动值班。';
 else if(state!=='done')body='这条记录的状态有待核实。';
 else if(result?.error)body='本次检查遇到问题：'+result.error;
 else if(typeof result?.queued==='number')body='本次加入待回复队列的评论有 '+result.queued+' 条。';
 else if(result?.started===true)body='本轮值班已启动。';
 else if(kind==='growth-collection')body='到了采集时间才会整理近期经历。这次检查已结束，记录里没有写是否新增了素材。';
 else if(kind.startsWith('guard-'))body='这轮评论检查已结束，记录里没有写发现或回复了几条。';
 else body='任务已结束，记录里没有更多结果。';
 return {title,badge,body,started,finished};
}
function render(){if(!data)return;
 $('#media-drawer').hidden=tab!=='creations';
 const search=$('#search').value.trim().toLocaleLowerCase();const match=x=>!search||JSON.stringify(x).toLocaleLowerCase().includes(search);
 $('#section-kicker').textContent=tabs[tab][0];$('#section-title').textContent=tabs[tab][1];
 const interests=data.latest?.exploration?.interests||[];
 const stats=$('#stats');stats.replaceChildren();for(const [name,n] of [['兴趣',interests.length],['手记',data.artifacts.length],['作品',data.publications.length],['记忆',data.memories.length]]){const pill=el('span','stat',name);pill.append(el('strong','',n));stats.append(pill)}
 const cards=$('#cards');cards.replaceChildren();let list=[];
 if(tab==='interests')list=interests.filter(match).map((x,i)=>card({title:x.question,body:x.why,badge:({active:'还想弄明白',paused:'先放一放',resolved:'有了一个答案'})[x.status]||'兴趣记录',paused:x.status!=='active',index:i,meta:'延续自 '+date(data.latest.at),action:'看看她怎么想 ↗',onOpen:()=>openDetail({title:x.question,body:x.why+'\n\n她接下来想试：\n'+data.latest.exploration.nextExperiment,at:data.latest.at},'一个持续的问题')}));
 if(tab==='artifacts')list=data.artifacts.filter(match).map((x,i)=>card({title:x.title,body:x.body,badge:names[x.kind]||'手记',index:i,meta:date(x.at),onOpen:()=>openDetail(x,names[x.kind]||'经历手记')}));
 if(tab==='memories')list=data.memories.filter(match).map((x,i)=>card({title:x.title,body:x.body,badge:'保留下来的记忆',index:i,meta:x.truncated?'正文为摘录':'原记录只读展示',onOpen:()=>openDetail(x,'记忆小盒')}));
 if(tab==='publications')list=data.publications.filter(match).map((x,i)=>{const c=card({title:x.title,body:x.description,badge:'已经发布',index:i,meta:`${date(x.created)} · ${x.length||'时长未知'}`,onOpen:()=>openDetail({title:x.title,body:x.description},'作品简介')});const counts=el('p','',`播放 ${x.play??'未知'} · 评论 ${x.comment??'未知'} · 快照 ${date(data.catalogAt)}`);c.append(counts);const a=el('a','text-button','在 B站打开 ↗');a.href='https://www.bilibili.com/video/'+x.bvid+'/';a.target='_blank';a.rel='noopener noreferrer';c.append(a);return c});
 if(tab==='experiences')list=(data.character?.experiences||[]).filter(match).map((x,i)=>card({...experiencePresentation(x),badge:({'receipt':'发送回执 ≠ 公开可见','model-authored':'观点或自述，非独立核验','partial':'部分资料，非完整观看'})[x.coverage]||'原始记录',index:i,meta:x.occurred?(/^\d{4}-\d{2}-\d{2}$/.test(x.occurred)?'记录日 '+x.occurred:date(x.occurred)):'采集于 '+date(x.captured),onOpen:()=>openDetail({title:x.source,body:x.body+'\n\n来源 ID：'+x.id+'\n哈希：'+x.hash,at:x.captured,truncated:x.truncated},'经历凭据')}));
 if(['relationships','creations'].includes(tab))list=(data.character?.[tab]||[]).filter(match).map((x,i)=>card({title:x.payload.title||(tab==='relationships'?'B 站用户 '+x.subject.replace(/^bilibili:/,''):x.subject),body:x.payload.body||x.payload.observation,badge:tab==='creations'?x.payload.label||({hold:'先不发',draft:'草稿',ready:'待发布确认'})[x.payload.state]||'原稿':'她的观察，不给人贴标签',index:i,meta:date(x.at),onOpen:()=>openDetail({title:x.payload.title||(tab==='relationships'?'B 站用户 '+x.subject.replace(/^bilibili:/,''):x.subject),body:(x.payload.body||x.payload.observation||'')+(x.payload.uncertainty?'\n\n'+x.payload.uncertainty:'')+'\n\n版本：'+x.id,at:x.at},'保留原想法与历史版本')}));
 if(tab==='operations')list=(data.character?.operations||[]).map(operationPresentation).filter(match).map((entry,index)=>card({
  ...entry,index,meta:date(entry.started),action:'查看记录 ↗',
  onOpen:()=>openDetail({title:entry.title,body:[entry.badge,entry.body,'开始时间 '+date(entry.started),entry.finished&&'结束时间 '+date(entry.finished)].filter(Boolean).join('\n')},'运行足迹')
 }));
 if(!list.length)cards.append(el('div','empty',search?'没有找到这段记录，换个词试试。':'这里还没有记录。等她慢慢留下新的经历。'));else cards.append(...list);
 $('#surprise').textContent=data.latest?.exploration?.surprise||'还没有探索手记。这里会展示她自己记录的意外发现。';
 const share=data.latest?.exploration?.share;$('#share').textContent=share?`${share.decision==='hold'?'先不做视频':'有一份素材，想讨论看看'}。${share.reason}`:'没有新的分享判断。';
 $('#latest').hidden=!data.latest;$('#latest').onclick=()=>openDetail(data.latest,'最新探索原稿');
 $('#stamp').textContent=`本地读取 ${date(data.capturedAt)} · 展示最近 ${data.limits.artifactWindow} 项任务中的已完成成果`;
}
async function refresh(){if(busy)return;busy=true;$('#refresh').disabled=true;$('#notice').textContent='正在读取本地手记…';
 try{const response=await fetch('/api/snapshot',{cache:'no-store'});if(!response.ok)throw new Error('unavailable');data=await response.json();render();$('#notice').textContent=data.warnings.join(' ')}catch{$('#notice').textContent=data?'暂时无法刷新，下面保留上次读取的记录。':'暂时读不到本地记录。请确认只读服务已经启动，再点刷新。'}finally{busy=false;$('#refresh').disabled=false}
}
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{tab=b.dataset.tab;document.querySelectorAll('[data-tab]').forEach(n=>{n.classList.toggle('active',n===b);if(n===b)n.setAttribute('aria-current','page');else n.removeAttribute('aria-current')});$('#search').value='';render()}));
$('#search').addEventListener('input',render);$('#refresh').addEventListener('click',refresh);$('#close').addEventListener('click',()=>$('#detail').close());
refresh();
