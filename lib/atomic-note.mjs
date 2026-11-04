import {openSync,writeFileSync,fsyncSync,closeSync,linkSync,unlinkSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
export function appendNote(destination,body) {
 const temp=destination+'.'+randomUUID()+'.tmp';let fd
 try {
  fd=openSync(temp,'wx');writeFileSync(fd,body,'utf8');fsyncSync(fd);closeSync(fd);fd=undefined
  try {linkSync(temp,destination);return true}catch(e){if(e.code==='EEXIST')return false;throw e}
 }finally {if(fd!==undefined)closeSync(fd);try{unlinkSync(temp)}catch(e){if(e.code!=='ENOENT')throw e}}
}
