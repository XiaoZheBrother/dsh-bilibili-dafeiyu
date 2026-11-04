(() => {
  const q = selector => document.querySelector(selector);
  const upload = q('#upload-form'), config = q('#danmaku-form');
  const message = q('#media-message'), send = q('#media-send');
  let preview = null, sending = false;

  async function request(path, body) {
    const opts = {cache:'no-store'};
    if (body) {
      const settings = await (await fetch('/api/settings')).json();
      Object.assign(opts, {method:'POST', headers:{'Content-Type':'application/json','X-Studio-CSRF':settings.csrf}, body:JSON.stringify(body)});
    }
    const response = await fetch('/api/media' + path, opts);
    const value = await response.json();
    if (!response.ok) throw Error(value.error || '请求失败');
    return value;
  }

  async function load() {
    const panel = await request('');
    config.elements.enabled.checked = panel.settings.enabled;
    config.elements.cap.value = panel.settings.cap;
    config.querySelector('button').disabled = false;
    q('#media-folder').textContent = '请把成片和封面放入 ' + panel.inbox;
    const history = q('#media-history');
    history.replaceChildren();
    if (!panel.history.length) history.textContent = '还没有投稿或弹幕回执。';
    for (const item of panel.history) {
      const row = document.createElement('p');
      const bv = item.receipt?.bvid;
      row.textContent = item.kind + ' · ' + item.title + ' · ' + (bv || item.receipt?.dmid || '结果待核实，请先检查 B 站');
      if (bv) {
        const status = document.createElement('button');
        status.textContent = '查询审核状态';
        status.onclick = async () => {
          try {const result = await request('/status',{bvid:bv}); status.textContent = result.state_desc || '状态未知';}
          catch (e) {status.textContent = e.message;}
        };
        row.append(status);
      }
      history.append(row);
    }
  }

  config.onsubmit = async e => {
    e.preventDefault();
    try {
      await request('/config',{enabled:config.elements.enabled.checked,cap:Number(config.elements.cap.value)});
      config.querySelector('output').textContent = '已保存';
    } catch (err) {config.querySelector('output').textContent = err.message;}
  };
  function invalidate() {preview = null; send.disabled = true;}
  upload.oninput = invalidate;
  upload.onsubmit = async e => {
    e.preventDefault();
    if (sending) return;
    invalidate();
    const body = Object.fromEntries(new FormData(upload));
    body.tags = body.tags.split(/[,，]/).map(t=>t.trim()).filter(Boolean);
    upload.querySelector('fieldset').disabled = true;
    message.textContent = '正在检查素材、标签和分区…';
    try {
      const result = await request('/preview',body);
      preview = {...body,preview:result.preview,zone:result.zone};
      message.textContent = '投稿到 UID ' + result.uid + ' · ' + (result.zone.zone_name || result.zone.tid_name) + ' · 自制 · 含 AI 生成内容。请核对上方稿件。';
      send.disabled = false;
    } catch (err) {message.textContent = err.message;}
    finally {upload.querySelector('fieldset').disabled = false;}
  };
  send.onclick = async () => {
    if (!preview || sending) return;
    const body = preview;
    invalidate();
    sending = true;
    upload.querySelector('fieldset').disabled = true;
    message.textContent = '正在提交，请等待回执…';
    try {const result = await request('/submit',body); message.textContent = '已提交 ' + result.bvid;}
    catch (err) {message.textContent = err.message;}
    finally {sending = false; upload.querySelector('fieldset').disabled = false; load().catch(()=>{});}
  };
  for (const trigger of [q('#settings-nav'), q('[data-tab="creations"]')]) {
    trigger.addEventListener('click',()=>load().catch(e=>{message.textContent=e.message;config.querySelector('output').textContent=e.message;}));
  }
})();
