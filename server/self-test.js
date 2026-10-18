// Prueba automática del servidor de radio (HTTP + WebSocket).
// Uso:  npm run test-server

const WebSocket = require('ws');
const { createRadioServer } = require('./radio-server');

(async () => {
  const server = await createRadioServer(8799);
  console.log('Servidor de prueba escuchando en el puerto', server.port);

  const health = await fetch(`http://localhost:${server.port}/health`)
    .then((r) => r.text())
    .catch((e) => 'ERROR: ' + e.message);

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const mk = (name) =>
    new Promise((resolve) => {
      const ws = new WebSocket(`ws://localhost:${server.port}`);
      const messages = [];
      ws.on('message', (d) => messages.push(JSON.parse(d.toString())));
      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'hello', name, department: 'LCPD' }));
        resolve({ ws, messages });
      });
    });

  const ana = await mk('Ana');
  await wait(100);
  ana.ws.send(JSON.stringify({ type: 'join', channel: 'Despacho' }));
  await wait(200);

  const beto = await mk('Beto');
  await wait(100);
  beto.ws.send(JSON.stringify({ type: 'join', channel: 'Despacho' }));
  await wait(300);

  ana.ws.send(JSON.stringify({ type: 'chat', text: 'hola' }));
  await wait(300);

  const anaWelcome = ana.messages.find((m) => m.type === 'welcome');
  const anaJoined = ana.messages.find((m) => m.type === 'joined');
  const anaRoster = ana.messages.filter((m) => m.type === 'roster').pop();
  const betoChat = beto.messages.find((m) => m.type === 'chat');

  const checks = {
    health: health.trim() === 'ok',
    welcome: !!anaWelcome && Array.isArray(anaWelcome.iceServers) && anaWelcome.iceServers.length > 0,
    joined: !!anaJoined,
    roster: !!anaRoster && anaRoster.members.length === 2,
    chat: !!betoChat && betoChat.text === 'hola' && betoChat.name === 'Ana',
  };

  console.log('Comprobaciones:', checks);

  const ok = Object.values(checks).every(Boolean);
  console.log(ok ? '✅ PRUEBA OK: HTTP, conexión, roster y retransmisión funcionan.' : '❌ PRUEBA FALLIDA');

  server.close();
  process.exit(ok ? 0 : 1);
})().catch((err) => {
  console.error('❌ Error en la prueba:', err.message);
  process.exit(1);
});
