import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {resolve,join,isAbsolute} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import net from 'node:net'
const [command,raw,uid,name='']=process.argv.slice(2)
if(!raw||!isAbsolute(raw)||!['init','doctor','resolve'].includes(command))throw Error('Usage: node bin/manage.mjs init|doctor|resolve ABSOLUTE_DSH_HOME [accountUid accountName | operationId confirmed-stopped]')
const home=resolve(raw),dir=join(home,'feiyu-runtime'),duty=join(home,'bili-duty')
if(command==='resolve') {
 if(name!=='confirmed-stopped')throw Error('First verify the entire old process tree has stopped, then pass confirmed-stopped')
 for(const port of [3086,3091])await new Promise((ok,fail)=>{const s=net.connect({host:'127.0.0.1',port});s.once('connect',()=>{s.destroy();fail(Error('Stop resident and DSH before resolving'))});s.once('error',e=>e.code==='ECONNREFUSED'?ok():fail(e));s.setTimeout(1000,()=>{s.destroy();fail(Error('Port state unknown'))})})
 const db=new DatabaseSync(join(dir,'character.sqlite3'))
 try {
  const row=db.prepare("SELECT * FROM operations WHERE id=? AND state='uncertain' AND kind LIKE 'round:%'").get(uid)
  if(!row)throw Error('No uncertain round with this ID')
  const pid=JSON.parse(row.result||'{}')?.pid
  if(pid){try{process.kill(pid,0);throw Error('Recorded child process is still present')}catch(e){if(e.code!=='ESRCH')throw e}}
  db.prepare("UPDATE operations SET state='failed',finished=?,result=? WHERE id=? AND state='uncertain'").run(new Date().toISOString(),JSON.stringify({previous:row.result,resolution:'Operator confirmed old tree stopped; no replay'}),uid)
  console.log('Round settled without replay. Send reservations remain unchanged.')
 }finally{db.close()}
}else if(command==='init') {
 if(!/^\d{1,24}$/.test(uid||''))throw Error('Explicit account UID required')
 const destinations=[join(dir,'config.json'),join(duty,'feiyu-policy.json')]
 if(destinations.some(existsSync))throw Error('Existing configuration preserved; inspect it instead of initializing again')
 mkdirSync(dir,{recursive:true});mkdirSync(duty,{recursive:true})
 writeFileSync(destinations[0],JSON.stringify({profile:'web',accountUid:uid,memoryName:'',growthOwner:'off'},null,2),{flag:'wx'})
 writeFileSync(destinations[1],JSON.stringify({enabled:false,accountUid:uid,accountName:name,dailyAttempts:20,minimumIntervalSeconds:300,timezone:'Asia/Shanghai'},null,2),{flag:'wx'})
 console.log('Initialized with automation disabled. Existing accounts/history were not imported.')
} else {
 const config=existsSync(join(dir,'config.json'))?JSON.parse(readFileSync(join(dir,'config.json'),'utf8')):{}
 const policy=existsSync(join(duty,'feiyu-policy.json'))?JSON.parse(readFileSync(join(duty,'feiyu-policy.json'),'utf8')):{}
 const profile=config.profile||'web';if(!/^[\w-]+$/.test(profile))throw Error('Invalid profile')
 const p=join(home,'profiles',profile,'package.json'),manifest=existsSync(p)?JSON.parse(readFileSync(p,'utf8')):{}
 const bundles=manifest.dsh?.profile?.bundles||[]
 const checks={node:Number(process.versions.node.split('.')[0])>=22,accountBound:/^\d+$/.test(String(policy.accountUid||'')),singleBundle:bundles.filter(x=>['dsh-bili-pond','dsh-feiyu-runtime'].includes(x)).length===1&&bundles.includes('dsh-feiyu-runtime'),growthInstalled:existsSync(join(home,'profiles',profile,'node_modules/dsh-agent-growth/core.js')),credentialsPresent:existsSync(join(duty,'bili_credential.json')),ledgerPresent:existsSync(join(dir,'character.sqlite3'))}
 console.log(JSON.stringify({checks,growthOwner:config.growthOwner||'off',notes:['Credential presence is not a login test','Stop legacy collector before growthOwner=runtime','Do not hot reload; stop entire DSH process tree before upgrades']},null,2))
 if(!checks.node||!checks.accountBound||!checks.singleBundle)process.exitCode=1
}
