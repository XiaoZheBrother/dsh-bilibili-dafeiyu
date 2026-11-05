/** Mount the packaged workbench inside DSH, with one lazily started viewer child. */
import { spawn } from 'node:child_process'
import http from 'node:http'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stateDirOf, readJson } from './state.mjs'

const PREFIX = '/dafeiyu-studio'

export function mountStudio(ctx) {
  const home = dirname(stateDirOf(ctx))
  const serverFile = fileURLToPath(new URL('../workbench/server.py', import.meta.url))
  let child, starting, port, disposed = false

  function start() {
    if (disposed) return Promise.reject(new Error('插件已停止'))
    if (port) return Promise.resolve(port)
    if (starting) return starting
    starting = new Promise((resolve, reject) => {
      const cfg = readJson(join(home, 'bili-duty/config.json'), {})
      const venv = join(home, 'bili-duty/.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
      const executable = existsSync(venv) ? venv : cfg.pythonPath || 'python'
      const viewer = child = spawn(executable, ['-u', serverFile, '--home', home, '--port', '0',
        '--pond-origin', ctx.webServer.getOrigin()], {
        windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'],
        env: {...process.env, PYTHONUTF8: '1', FEIYU_STUDIO_CHILD: '1'},
      })
      let settled = false, output = ''
      const timeout = setTimeout(() => fail(new Error('启动工作台超时')), 15000)
      function fail(error) {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        viewer.kill()
        reject(error)
      }
      viewer.once('error', () => fail(new Error('请安装 Python 3.11+，或在插件设置中安装运行环境')))
      viewer.once('exit', () => {
        if (child === viewer) port = undefined
        fail(new Error('工作台启动失败，请检查 Python 环境'))
      })
      viewer.stdout.on('data', chunk => {
        output += chunk.toString()
        const match = output.match(/Feiyu Studio: http:\/\/127\.0\.0\.1:(\d+)/)
        if (!match || settled) return
        if (disposed) return fail(new Error('插件已停止'))
        settled = true
        clearTimeout(timeout)
        port = Number(match[1])
        resolve(port)
      })
    }).finally(() => { starting = undefined })
    return starting
  }

  function rejection(req) {
    const address = req.socket?.remoteAddress
    if (!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address)) return 403
    return ctx.connection.requestRejection(req)
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: '/api/bili-pond/studio-location',
    handler: (req, res) => {
      const denied = rejection(req)
      if (denied) {res.writeHead(denied);res.end();return}
      res.writeHead(200, {'Content-Type':'application/json','Cache-Control':'no-store'})
      res.end(JSON.stringify({url:PREFIX + '/'}))
    },
  }), '大肥鱼工作台入口')

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix', path: PREFIX,
    handler: async (req, res) => {
      const denied = rejection(req)
      if (denied || !['GET','POST'].includes(req.method)) {
        res.writeHead(denied || 405); res.end(); return
      }
      let upstreamPort
      try { upstreamPort = await start() }
      catch (error) {
        res.writeHead(503, {'Content-Type':'text/plain; charset=utf-8'})
        res.end(error.message + '。安装后重新打开工作台。'); return
      }
      const path = req.url.slice(PREFIX.length) || '/'
      const headers = {host:'127.0.0.1:' + upstreamPort}
      for (const name of ['content-type','content-length','x-studio-csrf']) {
        if (req.headers[name]) headers[name] = req.headers[name]
      }
      if (req.method === 'POST') headers.origin = 'http://' + headers.host
      let failedAlready = false
      const failed = () => {
        if (failedAlready || res.writableEnded || res.destroyed) return
        failedAlready = true
        if (res.headersSent) {res.destroy();return}
        res.writeHead(502, {'Content-Type':'text/plain; charset=utf-8'})
        res.end('工作台连接中断，请刷新核对状态')
      }
      const upstream = http.request({host:'127.0.0.1', port:upstreamPort, path, method:req.method, headers}, incoming => {
        incoming.on('error', failed)
        incoming.on('aborted', failed)
        const type = incoming.headers['content-type'] || ''
        const transform = type.startsWith('text/html') || type.startsWith('text/javascript') || type.startsWith('text/css')
        const out = {...incoming.headers}
        out['content-security-policy'] = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'"
        if (!transform) {res.writeHead(incoming.statusCode,out);incoming.pipe(res);return}
        let body = ''
        incoming.setEncoding('utf8')
        incoming.on('data', chunk => { body += chunk })
        incoming.on('end', () => {
          body = body.replaceAll('"/assets/', '"'+PREFIX+'/assets/')
            .replaceAll('url("/assets/', 'url("'+PREFIX+'/assets/')
            .replaceAll("url('/assets/", "url('"+PREFIX+"/assets/")
            .replaceAll('url(/assets/', 'url('+PREFIX+'/assets/')
            .replaceAll("'/api/", "'"+PREFIX+"/api/")
            .replaceAll('"/api/', '"'+PREFIX+'/api/')
            .replace(/(src|href)="\/(?!\/)/g, (_, attr) => attr+'="'+PREFIX+'/')
            .replaceAll(PREFIX+PREFIX,PREFIX)
            .replaceAll('http://127.0.0.1:3086/','/')
          out['content-length'] = Buffer.byteLength(body)
          res.writeHead(incoming.statusCode,out);res.end(body)
        })
      })
      upstream.on('error', failed)
      req.pipe(upstream)
    },
  }), '大肥鱼工作台页面')
  ctx.effect(() => () => { disposed = true;child?.stdin.end();child?.kill() }, '关闭工作台子进程')
}
