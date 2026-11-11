(() => {
 const list=document.querySelector('#plugin-cards');
 window.feiyuPluginsOpen=async()=>{
  list.textContent='正在读取已有服务状态…';
  try {const response=await fetch('/api/plugins');if(!response.ok)throw Error();const data=await response.json();list.replaceChildren();
   for(const p of data.plugins){const card=document.createElement('article');card.className='card';const h=document.createElement('h3');h.textContent=p.name==='dsh-live-studio'?'聊天直播':'游戏直播';card.append(h);
    const status=document.createElement('p');status.textContent=({running:'运行中',stopped:'已停止','not-configured':'尚未配置',unavailable:'暂时无法连接'})[p.state]||'未知状态';card.append(status);
    for(const [key,label]of [['url','打开控制台'],['preview','打开直播画面']])if(p[key]){const a=document.createElement('a');a.href=p[key];a.className='text-button';a.textContent=label+' ↗ ';a.target='_blank';a.rel='noopener';card.append(a)}list.append(card)}
   const card=document.createElement('article');card.className='card';const h=document.createElement('h3');h.textContent='陪看制作';const p=document.createElement('p');p.textContent='陪看工具仍在 DSH 主对话中使用。观看、配音与制作进度由原工具管理，这里不自动创建任务。';const a=document.createElement('a');a.href='http://127.0.0.1:3086/';a.target='_blank';a.rel='noopener';a.className='text-button';a.textContent='前往主对话 ↗';card.append(h,p,a);list.append(card);
  }catch{list.textContent='暂时无法读取插件状态，请稍后重试。'}
 };
})();
