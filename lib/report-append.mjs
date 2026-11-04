import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname,join } from 'node:path'
import { fileURLToPath } from 'node:url'
export function appendReport(file,text) {
 const home=dirname(dirname(file))
 const local=join(home,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python')
 const python=process.env.FEIYU_PYTHON||(existsSync(local)?local:'python')
 const r=spawnSync(python,[fileURLToPath(new URL('./duty_reports.py',import.meta.url)),file],{input:String(text),encoding:'utf8',windowsHide:true,timeout:45000,env:{...process.env,PYTHONIOENCODING:'utf-8'}})
 if(r.error||r.status!==0)throw Error('Report archive failed; ledger may have saved the round')
 const receipt=JSON.parse(r.stdout);if(!receipt.ok)throw Error('Report not saved');return receipt
}
