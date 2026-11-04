import { CharacterStore } from './lib/character-store.mjs'
import { collectExperiences } from './lib/experience-adapter.mjs'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
const home=resolve(process.env.DSH_HOME||process.argv[2]||'')
if(!process.env.DSH_HOME&&!process.argv[2])throw Error('Explicit DSH_HOME required')
const input=JSON.parse(readFileSync(0,'utf8'))
const store=new CharacterStore(join(home,'feiyu-runtime'))
try {
 let result
 if(input.action==='recall'){collectExperiences(store,home);result={items:store.recall(input.query||'',12,true),relationships:input.subject?store.authored('relationship',input.subject):[],creations:store.authored('creation')}}
 else if(input.action==='save')result=store.save(input.kind,input.subject,input.payload)
 else if(input.action==='observe')result={id:store.append(input.event)}
 else throw Error('Unknown local action')
 process.stdout.write(JSON.stringify(result))
} finally {store.close()}
