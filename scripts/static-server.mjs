import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8'
};

function resolveFilePath(rootDir, requestUrl) {
  const pathname = decodeURIComponent((requestUrl || '/').split('?')[0]);
  const normalizedPath = pathname === '/' ? '/index.html' : pathname;
  const filePath = resolve(rootDir, `.${normalizedPath}`);
  const resolvedRoot = resolve(rootDir);

  if (!filePath.startsWith(resolvedRoot)) {
    return null;
  }

  return filePath;
}

export function startStaticServer(options) {
  const rootDir = resolve(options.rootDir);
  const port = options.port ?? 0;

  return new Promise((resolveStart, rejectStart) => {
    const server = createServer((req, res) => {
      const method = req.method || 'GET';
      if (method !== 'GET' && method !== 'HEAD') {
        res.statusCode = 405;
        res.end('Method Not Allowed');
        return;
      }

      const filePath = resolveFilePath(rootDir, req.url || '/');
      if (!filePath || !existsSync(filePath)) {
        res.statusCode = 404;
        res.end('Not Found');
        return;
      }

      const stats = statSync(filePath);
      if (stats.isDirectory()) {
        res.statusCode = 403;
        res.end('Forbidden');
        return;
      }

      const extension = extname(filePath);
      res.setHeader('Content-Type', MIME_TYPES[extension] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');

      if (method === 'HEAD') {
        res.statusCode = 200;
        res.end();
        return;
      }

      const stream = createReadStream(filePath);
      stream.on('error', () => {
        if (!res.headersSent) {
          res.statusCode = 500;
        }
        res.end('Internal Server Error');
      });
      stream.pipe(res);
    });

    server.on('error', rejectStart);

    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        rejectStart(new Error('Failed to resolve static server address'));
        return;
      }

      const url = `http://127.0.0.1:${address.port}`;
      resolveStart({
        url,
        close: () =>
          new Promise((resolveClose, rejectClose) => {
            server.close((error) => {
              if (error) {
                rejectClose(error);
                return;
              }
              resolveClose(undefined);
            });
          })
      });
    });
  });
}
