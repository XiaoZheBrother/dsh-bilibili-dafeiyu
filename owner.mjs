import net from 'node:net'

// A held loopback socket provides OS-owned exclusion across host processes.
// A crash releases it automatically; there is no stale PID file to steal.
export function acquireOwner(port=3091) {
  return new Promise((resolve,reject)=>{
    const server=net.createServer(socket=>socket.destroy())
    server.once('error',reject)
    server.listen({host:'127.0.0.1',port,exclusive:true},()=>{
      server.removeListener('error',reject)
      server.on('error',()=>{})
      server.unref()
      let closed=false
      resolve({port:server.address().port,release:()=>new Promise(done=>{
        if(closed)return done()
        closed=true;server.close(()=>done())
      })})
    })
  })
}
