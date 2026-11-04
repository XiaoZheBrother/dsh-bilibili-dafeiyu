// One timer owns browsing, guard scans and evidence synchronization. Growth model
// execution remains exclusively owned by dsh-agent-growth, not this scheduler.
export class Coordinator {
 constructor(store,{log=()=>{},interval=60000}={}){this.store=store;this.log=log;this.interval=interval;this.stopped=false;this.busy=false;this.reserved=false;this.timer=null;store.recover()}
 async reserve(kind,work) {
  if(this.stopped||this.reserved)return {started:false,busy:true,error:'Runtime occupied or stopping'}
  this.reserved=true;let id
  try {id=this.store.begin(kind);const result=await work();this.store.finish(id,result?.started===false?'skipped':'done',result??{});return result}
  catch(e){if(id)try{this.store.finish(id,'failed',{error:String(e.message)})}catch(f){this.log('状态写入失败，保留未确认运行：'+f.message)}throw e}
  finally{this.reserved=false}
 }
 start({sync,guard,browse}) {
  if(this.timer)throw Error('Scheduler already started')
  this.pulse=async()=>{
   if(this.stopped||this.busy||this.reserved)return
   this.busy=true
   try {for(const [phase,work] of [['sync',sync],['guard',guard],['browse',browse]]){if(this.stopped)return;try{await work()}catch(e){this.log(`角色调度 ${phase} 失败：${e.message}`)}}}
   finally{this.busy=false}
  }
  this.timer=setInterval(()=>void this.pulse(),this.interval);this.timer.unref?.()
 }
 stop(){this.stopped=true;clearInterval(this.timer);this.timer=null}
}
