const { app, BrowserWindow, dialog, shell } = require('electron');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

let backendProcess = null;
let frontendServer = null;
let isQuitting = false;
let currentFrontendUrl = null;
let desktopStartup = null;

function appPath(...segments) {
  return path.join(app.getAppPath(), ...segments);
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function databaseUrlFromPath(filePath) {
  return `file:${filePath.replace(/\\/g, '/')}`;
}

function ensureEncryptionKey(userDataDir) {
  const securityDir = path.join(userDataDir, 'security');
  const keyPath = path.join(securityDir, 'encryption-key');
  mkdirSync(securityDir, { recursive: true });

  if (existsSync(keyPath)) {
    const existing = readFileSync(keyPath, 'utf8').trim();
    if (existing) return existing;
  }

  const key = randomBytes(48).toString('hex');
  writeFileSync(keyPath, key, { mode: 0o600 });
  return key;
}

function ensureRequiredFile(filePath, label) {
  if (existsSync(filePath)) return;
  throw new Error(`${label} not found: ${filePath}. 请先运行 npm run build:all。`);
}

function nodeRuntimeEnv(extraEnv) {
  return {
    ...process.env,
    ...extraEnv,
    ELECTRON_RUN_AS_NODE: '1',
  };
}

function pipeChildLogs(child, prefix) {
  child.stdout?.on('data', (chunk) => {
    process.stdout.write(`[${prefix}] ${chunk}`);
  });
  child.stderr?.on('data', (chunk) => {
    process.stderr.write(`[${prefix}] ${chunk}`);
  });
}

function runNodeScript(scriptPath, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: path.dirname(app.getAppPath()),
      env: nodeRuntimeEnv(env),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    pipeChildLogs(child, path.basename(scriptPath));

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${scriptPath} exited with ${signal || code}`));
    });
  });
}

function requestHealth(url) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(response.statusCode && response.statusCode >= 200 && response.statusCode < 500);
    });

    request.setTimeout(1000, () => {
      request.destroy();
      resolve(false);
    });

    request.on('error', () => resolve(false));
  });
}

async function waitForBackend(backendUrl, timeoutMs = 30_000) {
  const healthUrl = `${backendUrl}/api/health`;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await requestHealth(healthUrl)) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  throw new Error(`Backend startup timeout: ${healthUrl}`);
}

function startBackend(backendEntry, env) {
  const child = spawn(process.execPath, [backendEntry], {
    cwd: app.getPath('userData'),
    env: nodeRuntimeEnv(env),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  backendProcess = child;
  pipeChildLogs(child, 'backend');

  child.on('exit', (code, signal) => {
    backendProcess = null;
    if (isQuitting) return;
    dialog.showErrorBox('FlowMuse backend stopped', `Backend exited with ${signal || code}`);
    app.quit();
  });

  child.on('error', (error) => {
    if (isQuitting) return;
    dialog.showErrorBox('FlowMuse backend failed', error.message);
    app.quit();
  });

  return child;
}

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function sendFile(response, filePath) {
  const ext = path.extname(filePath);
  response.writeHead(200, {
    'Content-Type': contentTypes[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  createReadStream(filePath).pipe(response);
}

function proxyToBackend(request, response, backendUrl) {
  const target = new URL(request.url || '/', backendUrl);
  const headers = { ...request.headers };
  delete headers.host;
  delete headers.connection;

  const upstream = http.request(
    {
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method: request.method,
      headers,
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    },
  );

  upstream.on('error', () => {
    if (response.headersSent) {
      response.end();
      return;
    }
    response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ code: 502, msg: 'Backend proxy failed' }));
  });

  request.pipe(upstream);
}

function resolveStaticPath(frontendDir, urlPathname) {
  const decoded = decodeURIComponent(urlPathname);
  const relativePath = path
    .normalize(decoded)
    .replace(/^(\.\.[/\\])+/, '')
    .replace(/^[/\\]+/, '');
  const candidate = path.resolve(frontendDir, relativePath);
  const frontendRoot = path.resolve(frontendDir);

  if (candidate !== frontendRoot && !candidate.startsWith(`${frontendRoot}${path.sep}`)) {
    return null;
  }

  return candidate;
}

function startFrontendServer(frontendDir, backendUrl, port) {
  const indexPath = path.join(frontendDir, 'index.html');
  ensureRequiredFile(indexPath, 'Frontend build');

  const server = http.createServer((request, response) => {
    if (!request.url) {
      response.writeHead(400);
      response.end();
      return;
    }

    if (request.url === '/api' || request.url.startsWith('/api/') || request.url.startsWith('/uploads/')) {
      proxyToBackend(request, response, backendUrl);
      return;
    }

    const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    const filePath = resolveStaticPath(frontendDir, requestUrl.pathname);
    if (filePath && existsSync(filePath) && statSync(filePath).isFile()) {
      sendFile(response, filePath);
      return;
    }

    sendFile(response, indexPath);
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function createWindow(frontendUrl) {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 720,
    title: 'FlowMuse',
    icon: appPath('build', 'icon.png'),
    backgroundColor: nativeThemeBackground(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: appPath('electron', 'preload.cjs'),
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(frontendUrl)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(frontendUrl)) return;
    event.preventDefault();
    shell.openExternal(url);
  });

  await window.loadURL(frontendUrl);
}

function nativeThemeBackground() {
  return '#0f172a';
}

async function bootstrapDesktop() {
  const backendEntry = appPath('dist', 'src', 'main.js');
  const frontendDir = appPath('frontend', 'dist');
  const initScript = appPath('scripts', 'init-sqlite.cjs');
  const seedScript = appPath('prisma', 'seed.js');

  ensureRequiredFile(backendEntry, 'Backend build');
  ensureRequiredFile(initScript, 'SQLite initializer');
  ensureRequiredFile(seedScript, 'Prisma seed');

  const userDataDir = app.getPath('userData');
  const dataDir = path.join(userDataDir, 'data');
  const uploadsDir = path.join(userDataDir, 'uploads');
  const backendPort = await getFreePort();
  const frontendPort = await getFreePort();
  const backendUrl = `http://127.0.0.1:${backendPort}`;
  const frontendUrl = `http://127.0.0.1:${frontendPort}`;

  mkdirSync(dataDir, { recursive: true });
  mkdirSync(uploadsDir, { recursive: true });

  const runtimeEnv = {
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    PORT: String(backendPort),
    FRONTEND_PORT: String(frontendPort),
    BACKEND_URL: backendUrl,
    FRONTEND_URL: frontendUrl,
    APP_PUBLIC_URL: backendUrl,
    UPLOADS_DIR: uploadsDir,
    DATABASE_URL: databaseUrlFromPath(path.join(dataDir, 'flowmuse.sqlite')),
    APP_ENCRYPTION_KEY: ensureEncryptionKey(userDataDir),
  };

  await runNodeScript(initScript, runtimeEnv);
  await runNodeScript(seedScript, runtimeEnv);

  startBackend(backendEntry, runtimeEnv);
  await waitForBackend(backendUrl);

  frontendServer = await startFrontendServer(frontendDir, backendUrl, frontendPort);
  currentFrontendUrl = frontendUrl;
  await createWindow(currentFrontendUrl);
}

async function openDesktop() {
  if (currentFrontendUrl) {
    await createWindow(currentFrontendUrl);
    return;
  }

  if (!desktopStartup) {
    desktopStartup = bootstrapDesktop().catch((error) => {
      desktopStartup = null;
      throw error;
    });
  }

  await desktopStartup;
}

function shutdownRuntime() {
  isQuitting = true;
  if (frontendServer) {
    frontendServer.close();
    frontendServer = null;
  }
  currentFrontendUrl = null;
  if (backendProcess) {
    backendProcess.kill(os.platform() === 'win32' ? undefined : 'SIGTERM');
    backendProcess = null;
  }
}

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows();
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  app.on('before-quit', shutdownRuntime);

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    const [window] = BrowserWindow.getAllWindows();
    if (window) {
      window.focus();
      return;
    }
    openDesktop().catch((error) => {
      dialog.showErrorBox('FlowMuse startup failed', error.stack || error.message);
      app.quit();
    });
  });

  app.whenReady()
    .then(openDesktop)
    .catch((error) => {
      dialog.showErrorBox('FlowMuse startup failed', error.stack || error.message);
      app.quit();
    });
}
