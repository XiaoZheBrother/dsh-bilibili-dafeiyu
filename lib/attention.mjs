// Pure scheduling gate. Model decisions are data, not a second scheduler.
function material(e) {
 try {
  let b=typeof e.body==='string'?JSON.parse(e.body):e.body
  if(e.kind==='interaction')return b?.direction==='incoming'&&b.messageId?JSON.stringify(['incoming',b.messageId,b.text]):null
  if(e.kind!=='tool')return null
  const r=typeof b.result==='string'?JSON.parse(b.result):b.result
  if(!r||r.error||r.ok===false)return null
  if(e.source==='bili_subtitle'&&r.text)return JSON.stringify([e.source,r.bvid,r.text])
  if(e.source==='bili_comments'&&Array.isArray(r.comments))return JSON.stringify([e.source,r.bvid,r.comments.map(c=>[c.rpid??c.id,c.content??c.text]).sort()])
  if(e.source==='bili_search'&&Array.isArray(r.videos))return JSON.stringify([e.source,r.videos.map(v=>[v.bvid,v.title]).sort()])
 }catch{}
 return null
}
export function attentionGate(prior, decision, evidence, now, previousEvidence=[]) {
 const at=Date.parse(prior?.at)||0
 const explicit=decision && Date.parse(decision.at)>at
 if(explicit&&decision.payload.action==='pause')return {allowed:false,reason:'explicit-pause'}
 if(explicit&&['continue','search','inspect'].includes(decision.payload.action))return {allowed:true,reason:'explicit-resume'}
 const attention=prior?.exploration?.attention
 if(!attention)return {allowed:true,reason:'legacy'}
 if(attention.decision==='continue')return {allowed:true,reason:'model-continue'}
 // Use occurrence time, never a new import/capture of an old record. Do not wake on our own notes.
 const known=new Set(previousEvidence.map(material).filter(Boolean))
 const fresh=evidence.some(e=>{const key=material(e);return key&&!known.has(key)&&Date.parse(e.occurred)>at&&Date.parse(e.occurred)<=now})
 if(fresh)return {allowed:true,reason:'new-evidence'}
 if(attention.decision==='wait'&&attention.revisitAt&&Date.parse(attention.revisitAt)<=now)return {allowed:true,reason:'model-revisit'}
 return {allowed:false,reason:attention.decision==='end'?'model-ended':'model-waiting'}
}
