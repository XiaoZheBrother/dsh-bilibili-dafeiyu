// The growth collector never receives a generic platform/MCP executor.
export function readOnlyBilibili(call) {
 return async (name,args)=>{
  if(!['bili_search','bili_video_info','bili_subtitle','bili_comments','bili_user_videos'].includes(name))throw Error('Read-only platform capability required')
  if(!['bili_search','bili_user_videos'].includes(name)&&!/^BV[0-9A-Za-z]{10}$/.test(args.bvid||''))throw Error('Invalid video ID')
  if(name==='bili_user_videos'&&!/^\d{1,24}$/.test(String(args.uid||'')))throw Error('Invalid account ID')
  if(name==='bili_search'&&(typeof args.keyword!=='string'||args.keyword.length>120))throw Error('Invalid search')
  const result=await call(name,args,{timeoutMs:45000})
  return typeof result==='string'?JSON.parse(result):result
 }
}
