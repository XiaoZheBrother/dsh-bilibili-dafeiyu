(() => {
 const q=s=>document.querySelector(s), make=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e};
 const groups=[
 ['浏览与作息',[
 ['autoRun','自动浏览','bool'],['autoRunsPerDay','每天最多几轮（0 为不限）','number',0,24],['autoGapMinutes','两轮间隔（分钟）','number',15,240],['peakValleyOnly','仅谷时运行','bool'],
 ['keywords','搜索关键词（每行一个）','text'],['perRoundMax','每轮最多挑几个视频','number',0,20],['perDayMax','每天最多挑几个视频','number',0,120],['minDurationMin','视频最短时长（分钟，0 不限）','number',0,600],['maxDurationMin','视频最长时长（分钟，0 不限）','number',0,600]]],
 ['评论与互动',[
 ['autoComment','允许普通评论','bool'],['circleMode','仅在 UP 主明确邀请时参与（与普通评论互斥）','bool'],['commentPerRound','每轮评论上限','number',0,20],['replyToComments','允许浏览轮回复楼中楼','bool'],['replyPerRound','每轮楼中楼回复上限','number',1,10]]],
 ['评论区守护',[
 ['guardOn','守护评论区','bool'],['guardOwnAll','自己视频下无需 @ 也回复','bool'],['guardScope','守护最近几条视频','number',1,10],['guardDailyCap','守护每天回复上限（仍受总发送硬上限约束）','number',0,500],['guardPerRound','守护每轮回复上限','number',1,20],['guardPollMinutes','扫描间隔（分钟）','number',1,120],['guardWhitelist','普通守护 @ 通知名单 UID','text'],['guardEmoji','允许回复使用表情','bool'],['guardTone','守护表达补充','text']]],
 ['高级设置',[
 ['dutyProvider','模型线路 ID（留空跟随宿主）','text'],['dutyModel','模型名称（留空跟随默认）','text'],['preferSubtitle','字幕优先','bool'],['subtitleProbeMax','每轮最多查几条字幕','number',1,10],['transcribe','允许本地转写','bool'],['transcribePerDay','每日最多转写次数','number',0,50],['asrModel','本地转写模型','text']]]
 ];
 const fields=groups.flatMap(g=>g[1]),labels=Object.fromEntries(fields.map(f=>[f[0],f[1]]));
 let current=null,dirty=false,loading=false,pending=null,uncertain=false;
 function setBusy(value){loading=value;q('#settings-form').querySelectorAll('fieldset,button').forEach(e=>e.disabled=value);q('#settings-reload').disabled=value;q('#login-start').disabled=value;}
 const message=t=>q('#settings-message').textContent=t;
 async function request(path,body){const options={cache:'no-store'};if(body!==undefined){options.method='POST';options.headers={'Content-Type':'application/json','X-Studio-CSRF':current?.csrf||''};options.body=JSON.stringify(body)}const r=await fetch(path,options);const result=await r.json();if(!r.ok)throw new Error(result.error||'服务暂不可用');return result}
 function draw(){
  q('#mentions-uids').value=current.externalMentions.uids.join('\n');
  const form=q('#settings-form');form.replaceChildren();
  for(const [title,rows] of groups){const group=make('fieldset'),legend=make('legend',title);group.append(legend);for(const [key,label,type,min,max] of rows){if(!(key in current.config))continue;const row=make('label'),caption=make('span',label),input=make(type==='text'?'textarea':'input');input.name=key;if(type==='bool'){input.type='checkbox';input.checked=current.config[key]===true;row.className='check-row'}else{if(type==='number'){input.type='number';input.min=min;input.max=max;input.step=1;input.required=true}else{input.rows=2;input.maxLength=key==='keywords'?2000:key==='guardWhitelist'||key==='guardTone'?1000:key==='dutyModel'?200:key==='dutyProvider'?120:100}input.value=key==='keywords'?(current.config[key]||[]).join('\n'):(current.config[key]??'')}row.append(caption,input);group.append(row)}form.append(group)}
  const save=make('button','查看修改并保存');save.type='submit';form.append(save);
  const s=current.status;q('#account-status').textContent=`${s.loggedIn?'已保存登录凭据（不等于已在线验证有效）':'尚未保存登录凭据'} · ${s.running?'正在浏览':s.finalizing?'正在收尾':'当前没有浏览轮运行'} · 今日浏览 ${s.pickedToday??'未知'} 个视频`;
  const p=current.policies['feiyu-policy.json'],t=current.policies['share-target.json'];q('#policy-status').textContent=`${p?`现有发送总闸：${p.enabled?'开启':'关闭'}，每天最多 ${p.dailyAttempts} 次发送尝试，间隔至少 ${p.minimumIntervalSeconds} 秒。`:'本地发送总闸信息读取失败，请先检查原服务。'} ${t?`选择性分享对象：${t.name}（UID ${t.uid}）。分享对象与值班章程绑定，本页仅展示。`:''} 点赞、收藏、私信保持现有配置，本页不修改。`;
 }
 async function load(){if(loading)return;if(dirty&&!window.confirm('重新读取会丢弃未保存的修改，继续吗？'))return;setBusy(true);message('正在读取现有鱼塘设置…');try{current=await request('/api/settings');dirty=false;uncertain=false;draw();message(current.notSynced.length?'已读取。部分原鱼塘配置未同步到 DSH，请在原工作台检查。':'已读取当前生效设置。')}catch(e){message(e.message)}finally{setBusy(false)}}
 q('#settings-nav').onclick=()=>{q('main>.workspace').hidden=true;q('#settings-page').hidden=false;document.querySelectorAll('.nav').forEach(n=>{n.classList.toggle('active',n===q('#settings-nav'));n.removeAttribute('aria-current')});q('#settings-nav').setAttribute('aria-current','page');if(!current)load()};
 document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{q('main>.workspace').hidden=false;q('#settings-page').hidden=true;q('#settings-nav').classList.remove('active');q('#settings-nav').removeAttribute('aria-current')}));
 q('#mentions-form').onsubmit=async e=>{
  e.preventDefault();if(!current||loading)return;
  const button=q('#mentions-save');button.disabled=true;
  try{
   const uids=q('#mentions-uids').value.trim().split(/[\s,，、]+/).filter(Boolean);
   current.externalMentions=await request('/api/external-mentions',{revision:current.externalMentions.revision,uids});
   q('#mentions-uids').value=current.externalMentions.uids.join('\n');message('邀请名单已保存。');
  }catch(error){message(error.message)}finally{button.disabled=false}
 };
 q('#settings-reload').onclick=load;q('#settings-form').addEventListener('input',()=>{dirty=true});
 q('#settings-form').onsubmit=e=>{e.preventDefault();if(loading||!current)return;if(uncertain){message('上次保存结果未确认，请先重新读取，避免重复提交。');return}const patch={};for(const [key,,type] of fields){const input=q('#settings-form').elements.namedItem(key);if(!input)continue;const v=key==='keywords'?input.value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean):type==='bool'?input.checked:type==='number'?Number(input.value):input.value;if(JSON.stringify(v)!==JSON.stringify(current.config[key]))patch[key]=v}if(!Object.keys(patch).length){message('没有需要保存的修改。');return}pending=patch;q('#settings-diff').textContent=Object.entries(patch).map(([k,v])=>`${labels[k]}：${String(current.config[k])} → ${String(v)}`).join('\n');q('#settings-confirm').showModal()};
 q('#settings-cancel').onclick=()=>{if(!loading)q('#settings-confirm').close()};q('#settings-confirm').addEventListener('cancel',e=>{if(loading)e.preventDefault()});
 q('#settings-apply').onclick=async()=>{if(loading)return;setBusy(true);q('#settings-apply').disabled=true;message('正在保存并回读…');try{current=await request('/api/settings',{revision:current.revision,patch:pending});dirty=false;draw();message(current.hostSynced?'已保存，原鱼塘与 DSH 同步完成。':'已保存并回读；原鱼塘已生效，DSH 同步情况请在原工作台确认。')}catch(e){uncertain=true;message(e.message+' 当前草稿保留。')}finally{q('#settings-confirm').close();q('#settings-apply').disabled=false;setBusy(false)}};
 q('#login-start').onclick=async()=>{if(loading||!current)return;setBusy(true);message('正在向原鱼塘申请二维码…');try{const r=await request('/api/login/start',{});q('#login-poll').disabled=false;q('#login-qr').src=r.qr;q('#login-message').textContent='二维码约三分钟有效；确认后点击检查状态。';q('#login-dialog').showModal();message('请完成扫码。')}catch(e){message(e.message)}finally{setBusy(false)}};
 q('#login-poll').onclick=async()=>{if(loading)return;let complete=false;setBusy(true);q('#login-poll').disabled=true;try{const r=await request('/api/login/poll',{});q('#login-message').textContent=({ok:'登录成功，凭据已由原鱼塘保存。',expired:'二维码已过期，请关闭后重新获取。',scanned:'已扫码，请在手机确认。',unknown:'暂未确认，请稍后检查。'})[r.state]||'等待扫码或手机确认。';if(r.state==='ok'){complete=true;q('#login-poll').disabled=true;message('登录成功。可重新读取设置查看状态。')}}catch(e){q('#login-message').textContent=e.message}finally{setBusy(false);q('#login-poll').disabled=complete}};
 q('#login-close').onclick=()=>q('#login-dialog').close();
 window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
})();
