// Admission policy only: no timers, catch-up queue, model calls or task ownership.
export const PEAK_DEFAULTS = Object.freeze({peakPeriods:'09:00-12:00\n14:00-18:00',peakWeekdays:'1,2,3,4,5',peakOffDates:''})
export function validatePeakConfig(cfg) {
 const c={...PEAK_DEFAULTS,...cfg}
 for(const key of Object.keys(PEAK_DEFAULTS))if(typeof c[key]!=='string'||c[key].length>5000)throw Error('峰谷设置必须是有效文本：'+key)
 const periods=c.peakPeriods.trim().split(/\r?\n/).filter(Boolean).map(line=>{
  const m=line.trim().match(/^([01]\d|2[0-3]):([0-5]\d)\s*-\s*([01]\d|2[0-3]|24):([0-5]\d)$/)
  if(!m||m[3]==='24'&&m[4]!=='00')throw Error('峰时格式应为 HH:MM-HH:MM，每行一段')
  const start=Number(m[1])*60+Number(m[2]),end=Number(m[3])*60+Number(m[4])
  if(start===end)throw Error('峰时起止不能相同；全天请填 00:00-24:00')
  return {start,end}
 })
 if(!periods.length||periods.length>24)throw Error('请配置 1–24 个峰时时段')
 const days=c.peakWeekdays.trim().split(/[ ,，\s]+/).map(Number)
 if(!days.length||days.some(n=>!Number.isInteger(n)||n<1||n>7))throw Error('适用星期请填 1–7，以逗号分隔；1 为周一')
 const dates=c.peakOffDates.trim()?c.peakOffDates.trim().split(/[ ,，\s]+/):[]
 if(dates.some(d=>!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d+'T00:00:00Z'))||new Date(d+'T00:00:00Z').toISOString().slice(0,10)!==d))throw Error('谷时例外日期请填有效的 YYYY-MM-DD')
 return {periods,days:new Set(days),dates:new Set(dates)}
}
export function peakSchedule(cfg,now=new Date()) {
 if(!cfg.peakValleyOnly)return {enabled:false,blocked:false,reason:'峰谷限制未开启',timeZone:'Asia/Shanghai'}
 try {
  const {periods,days,dates}=validatePeakConfig(cfg)
  const t=new Date(now.getTime()+8*3600000),date=t.toISOString().slice(0,10),day=t.getUTCDay()||7,minute=t.getUTCHours()*60+t.getUTCMinutes()
  const previous=new Date(t.getTime()-86400000),previousDate=previous.toISOString().slice(0,10),previousDay=previous.getUTCDay()||7
  const blocked=!dates.has(date)&&periods.some(({start,end})=>end>start?days.has(day)&&minute>=start&&minute<end:(days.has(day)&&minute>=start)||(days.has(previousDay)&&!dates.has(previousDate)&&minute<end))
  return {enabled:true,blocked,reason:blocked?'当前为配置的峰时，自动任务等待谷时':'当前为谷时，自动任务按原间隔运行',timeZone:'Asia/Shanghai',date}
 }catch(e){return {enabled:true,blocked:true,invalid:true,reason:'峰谷设置无效，自动任务已暂停：'+e.message,timeZone:'Asia/Shanghai'}}
}
