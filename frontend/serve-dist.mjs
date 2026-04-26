import { createReadStream, existsSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(__dirname, 'dist')
const port = Number(process.env.FRONTEND_PORT || process.env.PORT || 3001)
const backendUrl = (process.env.BACKEND_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '')

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

function sendFile(response, filePath) {
  const ext = path.extname(filePath)
  response.writeHead(200, {
    'Content-Type': contentTypes[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  })
  createReadStream(filePath).pipe(response)
}

async function proxyToBackend(request, response) {
  const target = `${backendUrl}${request.url}`
  const headers = new Headers()

  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue
    headers.set(key, Array.isArray(value) ? value.join(',') : value)
  }

  headers.delete('host')
  headers.delete('connection')

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request,
      duplex: 'half',
    })

    response.writeHead(upstream.status, Object.fromEntries(upstream.headers.entries()))

    if (upstream.body) {
      Readable.fromWeb(upstream.body).pipe(response)
    } else {
      response.end()
    }
  } catch {
    response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify({ code: 502, msg: 'Backend proxy failed' }))
  }
}

const server = createServer(async (request, response) => {
  if (!request.url) {
    response.writeHead(400)
    response.end()
    return
  }

  if (request.url.startsWith('/api/') || request.url === '/api' || request.url.startsWith('/uploads/')) {
    await proxyToBackend(request, response)
    return
  }

  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`)
  const decodedPath = decodeURIComponent(url.pathname)
  const safePath = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, '')
  const candidate = path.join(distDir, safePath)

  if (existsSync(candidate) && statSync(candidate).isFile()) {
    sendFile(response, candidate)
    return
  }

  const indexPath = path.join(distDir, 'index.html')
  const indexHtml = await readFile(indexPath)
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache',
  })
  response.end(indexHtml)
})

server.listen(port, '0.0.0.0', () => {
  console.log(`FlowMuse frontend listening on http://0.0.0.0:${port}`)
})
