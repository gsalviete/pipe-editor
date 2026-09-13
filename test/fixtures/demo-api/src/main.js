const http = require('node:http');

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ service: 'demo-api', status: 'ok' }));
}).listen(Number(process.env.PORT || 3000), '0.0.0.0', () => {
  console.log('Demo listening on port ' + server.address().port);
});
