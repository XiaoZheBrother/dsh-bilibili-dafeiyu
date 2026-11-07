import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { install } from './reasoning-prefill.mjs'
export function enablePrefill(home) {
  const here=dirname(fileURLToPath(import.meta.url))
  process.env.DAFEIYU_PREFILL_HOME=home
  const flag=`--import=${pathToFileURL(join(here,'reasoning-prefill.mjs')).href}`
  if(!(process.env.NODE_OPTIONS||'').includes(flag))process.env.NODE_OPTIONS=[process.env.NODE_OPTIONS,flag].filter(Boolean).join(' ')
  const python=join(here,'prefill_python')
  const paths=(process.env.PYTHONPATH||'').split(delimiter).filter(Boolean)
  if(!paths.includes(python))process.env.PYTHONPATH=[python,...paths].join(delimiter)
  install(home)
}
