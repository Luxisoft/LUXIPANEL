/** Legacy Node HTTP split: preserve API and health handlers, refuse UI traffic.
 * Installed in an immutable derived image; no customer source or data is edited. */
import { Server } from 'node:http';
export function isBackendPath(url) {
  try {
    const raw = new URL(url, 'http://localhost').pathname;
    const decoded = decodeURIComponent(raw);
    if (decoded.includes('\\') || decoded.includes('\0')) return false;
    const pathname = new URL(decoded, 'http://localhost').pathname;
    return pathname === '/api' || pathname.startsWith('/api/') || pathname === '/health' || pathname === '/healthz';
  } catch { return false; }
}
const emit = Server.prototype.emit;
Server.prototype.emit = function(event, ...args) {
  if ((event === 'request' || event === 'upgrade') && !isBackendPath(args[0]?.url)) {
    if (event === 'upgrade') args[1].end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    else { args[1].writeHead(404, {'content-type':'application/json', 'cache-control':'no-store'}); args[1].end('{"error":"not_found"}'); }
    return true;
  }
  return emit.call(this, event, ...args);
};
