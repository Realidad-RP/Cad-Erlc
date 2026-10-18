// Prueba automática del servidor de radio (HTTP + WebSocket).
// Uso:  npm run test-server
//
// Comprueba: salud HTTP, bienvenida, canales con roles/permisos,
// entrada/salida de canales, chat y canales privados.

const path = require('path');
const os = require('os');
const fs = require('fs');

// La prueba usa su propio archivo de canales (no toca los reales)
process.env.CHANNELS_FILE = path.join(os.tmpdir(), 'cad-erlc-test-channels.json');
try { fs.unlinkSync(process.env.CHANNELS_FILE); } catch {}

const WebSocket = require('ws');
const { createRadioServer } = require('./radio-server');

(async () => {
  const server = await createRadioServer(8799);
  console.log('Servidor de prueba escuchando en el puerto', server.port);

  const health = await fetch(`http://localhost:${server.port}/health`)
    .then((r) => r.text())
    .catch((e) => 'ERROR: ' + e.message);

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const mk = (name, department, role) =>
    new Promise((resolve) => {
      const ws = new WebSocket(`ws://localhost:${server.port}`);
      const messages = [];
      ws.on('message', (d) => messages.push(JSON.parse(d.toString())));
      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'hello', name, department, role }));
        resolve({ ws, messages });
      });
    });

  const findError = (client, re) => client.messages.find((m) => m.type === 'error' && re.test(m.message));

  // Ana es oficial de policía (LCPD) con rol básico
  const ana = await mk('Ana', 'LCPD', 'Miembro');
  await wait(100);
  ana.ws.send(JSON.stringify({ type: 'join', channel: 'Despacho Central' }));
  await wait(200);

  // Beto es supervisor de bomberos (LCFD)
  const beto = await mk('Beto', 'LCFD', 'Supervisor');
  await wait(100);
  beto.ws.send(JSON.stringify({ type: 'join', channel: 'Despacho Central' }));
  await wait(300);

  ana.ws.send(JSON.stringify({ type: 'chat', text: 'hola' }));
  await wait(200);

  // 1) Ana NO puede entrar al canal exclusivo de bomberos
  ana.ws.send(JSON.stringify({ type: 'join', channel: 'Bomberos/EMS (LCFD)' }));
  await wait(200);
  const aclDept = findError(ana, /LCFD/);

  // 2) Ana (Miembro) NO puede crear canales generales
  ana.ws.send(JSON.stringify({ type: 'channel-create', name: 'General de Ana' }));
  await wait(200);
  const aclCreate = findError(ana, /supervisores|administradores/i);

  // 3) Beto (Supervisor) crea un canal privado e invita a Ana
  beto.ws.send(JSON.stringify({ type: 'channel-create', name: 'Prueba K9', private: true, members: ['Ana'] }));
  await wait(200);
  const anaChannels = ana.messages.filter((m) => m.type === 'channels').pop();
  const privateCreated = !!anaChannels && anaChannels.channels.some((c) => c.name === 'Prueba K9');

  // 4) Ana (invitada) SÍ puede entrar al canal privado
  ana.ws.send(JSON.stringify({ type: 'join', channel: 'Prueba K9' }));
  await wait(200);
  const privateJoined = ana.messages.some((m) => m.type === 'joined' && m.channel === 'Prueba K9');

  // 5) Beto elimina el canal: Ana debe ser expulsada con aviso
  beto.ws.send(JSON.stringify({ type: 'channel-delete', channel: 'Prueba K9' }));
  await wait(200);
  const kicked = ana.messages.some((m) => m.type === 'kicked');

  const anaWelcome = ana.messages.find((m) => m.type === 'welcome');
  const anaJoined = ana.messages.find((m) => m.type === 'joined');
  const rosterOk = ana.messages.some((m) => m.type === 'roster' && m.members && m.members.length === 2);
  const betoChat = beto.messages.find((m) => m.type === 'chat');

  const checks = {
    health: health.trim() === 'ok',
    welcome: !!anaWelcome
      && Array.isArray(anaWelcome.channels)
      && anaWelcome.channels.length > 0
      && typeof anaWelcome.channels[0] === 'object'
      && typeof anaWelcome.channels[0].name === 'string',
    ice: !!anaWelcome && Array.isArray(anaWelcome.iceServers) && anaWelcome.iceServers.length > 0,
    joined: !!anaJoined && anaJoined.channel === 'Despacho Central',
    roster: rosterOk,
    chat: !!betoChat && betoChat.text === 'hola' && betoChat.name === 'Ana',
    aclDepartamento: !!aclDept,
    aclCrearGeneral: !!aclCreate,
    privadoCreado: privateCreated,
    privadoEntrada: privateJoined,
    expulsadoAlBorrar: kicked,
  };

  console.log('Comprobaciones:', checks);

  const ok = Object.values(checks).every(Boolean);
  console.log(ok
    ? '✅ PRUEBA OK: HTTP, roles, canales por departamento, privados e invitaciones funcionan.'
    : '❌ PRUEBA FALLIDA');

  server.close();
  try { fs.unlinkSync(process.env.CHANNELS_FILE); } catch {}
  process.exit(ok ? 0 : 1);
})().catch((err) => {
  console.error('❌ Error en la prueba:', err.message);
  process.exit(1);
});
