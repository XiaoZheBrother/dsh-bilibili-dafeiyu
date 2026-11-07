(() => {
 const dialog=document.createElement('dialog');dialog.setAttribute('aria-label','直播与游戏');
 const title=document.createElement('h2');title.textContent='直播与游戏';dialog.append(title);
 const description=document.createElement('p');description.textContent='按需安装独立插件。这里仅查看状态和打开页面，不会启动任务。';dialog.append(description);
 const list=document.createElement('div');dialog.append(list);
 const close=document.createElement('button');close.textContent='关闭';close.onclick=()=>dialog.close();dialog.append(close);document.body.append(dialog);
 document.querySelector('#plugins-nav').onclick=async()=>{
  dialog.showModal();list.textContent='读取中…';
  try {const response=await fetch('/api/plugins');if(!response.ok)throw Error();const data=await response.json();list.replaceChildren();
   for(const p of data.plugins){const card=document.createElement('section');const h=document.createElement('h3');h.textContent=p.name==='dsh-live-studio'?'直播工作室':'游戏 Agent';card.append(h);
    const status=document.createElement('p');status.textContent=({running:'运行中',stopped:'已停止','not-configured':'尚未配置',unavailable:'暂时无法连接'})[p.state]||'未知状态';card.append(status);
    for(const [key,label]of [['url','打开控制台'],['preview','打开直播画面']])if(p[key]){const a=document.createElement('a');a.href=p[key];a.textContent=label+' ↗ ';a.target='_blank';a.rel='noopener';card.append(a)}list.append(card)}
  }catch{list.textContent='暂时无法读取插件状态。'}
 };
})();
