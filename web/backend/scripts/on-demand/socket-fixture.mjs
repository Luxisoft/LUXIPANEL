import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
const server = http.createServer((req, res) => {
  const reply = () => res.end(String(process.pid));
  if (req.url === '/command') {
    execute(process.execPath, ['-e', "process.stdout.write('account'); process.stderr.write('diagnostic')"])
      .then(result => res.end(JSON.stringify(result)), error => { res.statusCode = 500; res.end(error.message); });
  }
  else if (req.url === '/slow') { res.writeHead(200); res.flushHeaders(); setTimeout(reply, 600); }
  else reply();
});
server.on('upgrade', (_req, socket) => {
  socket.on('end', () => socket.destroy());
  socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: test\r\n\r\n');
});
server.listen(Number(process.env.DEMAND_SOCKET_PORT), '127.0.0.1');
process.on('SIGTERM', () => server.close(() => process.exit(0)));
