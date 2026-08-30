import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, isAbsolute, join, normalize, relative } from 'node:path';

const port = Number(process.env.PORT || 3000);
const root = join(process.cwd(), 'dist');
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.ico':'image/x-icon'};
const headers = {'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=()'};

createServer((req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, {...headers, 'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Allow':'GET, HEAD'});
    return res.end('Method Not Allowed');
  }
  if (req.url === '/healthz') { res.writeHead(200, {...headers, 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); return res.end('{"status":"ok"}'); }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400, {...headers, 'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});
    return res.end('Bad Request');
  }
  let file = normalize(join(root, pathname));
  const relativePath = relative(root, file);
  if (relativePath === '..' || relativePath.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(relativePath)) {
    res.writeHead(403, headers);
    return res.end('Forbidden');
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) file = extname(pathname) ? join(root, '404.html') : join(root, 'index.html');
  const status = file.endsWith('404.html') ? 404 : 200;
  const hashedAsset = /^\/assets\/.+-[A-Za-z0-9_-]{8,}\.(?:css|js)$/.test(pathname);
  const cache = file.endsWith('.html') ? 'no-cache' : hashedAsset ? 'public, max-age=31536000, immutable' : 'public, max-age=3600';
  res.writeHead(status, {...headers,'Content-Type':types[extname(file)] || 'application/octet-stream','Cache-Control':cache});
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}).listen(port, '0.0.0.0', () => console.log(`Hollywood Evolves listening on 0.0.0.0:${port}`));
