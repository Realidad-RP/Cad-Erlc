// Prueba automática del servidor de radio (HTTP + WebSocket).
// Uso:  npm run test-server
//
// Comprueba: salud HTTP, bienvenida, canales por departamento, canales
// privados con invitación, propietario con contraseña y asignación de roles.

const path = require('path');
const os = require('os');
const fs = require('fs');

// La prueba usa sus propios archivos (no toca los canales/roles reales)
process.env.CHANNELS_FILE = path.join(os.tmpdir(), 'cad-erlc-test-channels.json');
process.env.ROLES_FILE = path.join(os.tmpdir(), 'cad-erlc-test-roles.json');
try { fs.unlinkSync(process.env.CHANNELS_FILE); } catch {}
try { fs.unlinkSync(process.env.ROLES_FILE); } catch {}

const WebSocket = require('ws');
const { createRadioServer } = require('./radio-server');

(async () => {
  const server = await createRadioServer(8799);
  console.log('Servidor de prueba escuchando en el puerto', server.port);

  const health = await fetch(`http://localhost:${server.port}/health`)
    .then((r) => r.text())
    .catch((e) => 'ERROR: ' + e.message);

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const mk = (name, department) =>
    new Promise((resolve) => {
      const ws = new WebSocket(`ws://localhost:${server.port}`);
      const messages = [];
      ws.on('message', (d) => messages.push(JSON.parse(d.toString())));
      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'hello', name, department }));
        resolve({ ws, messages });
      });
    });

  const findError = (client, re) => client.messages.find((m) => m.type === 'error' && re.test(m.message));
  const hasChannel = (client, channelName) =>
    client.messages.some((m) => m.type === 'channels' && Array.isArray(m.channels)
      && m.channels.some((c) => c.name === channelName));

  // Ana es oficial de policía (LCPD); Beto es de bomberos (LCFD)
  const ana = await mk('Ana', 'LCPD');
  await wait(100);
  ana.ws.send(JSON.stringify({ type: 'join', channel: 'Despacho Central' }));
  await wait(200);

  const beto = await mk('Beto', 'LCFD');
  await wait(100);
  beto.ws.send(JSON.stringify({ type: 'join', channel: 'Despacho Central' }));
  await wait(300);

  ana.ws.send(JSON.stringify({ type: 'chat', text: 'hola' }));
  await wait(200);

  // 1) Ana NO puede entrar al canal exclusivo de bomberos
  ana.ws.send(JSON.stringify({ type: 'join', channel: 'Bomberos/EMS (LCFD)' }));
  await wait(200);
  const aclDepartamento = findError(ana, /LCFD/);

  // 2) Ningún Miembro puede crear canales generales (solo staff)
  ana.ws.send(JSON.stringify({ type: 'channel-create', name: 'General de Ana' }));
  await wait(200);
  const aclCrearAna = findError(ana, /supervisores|administradores/i);

  beto.ws.send(JSON.stringify({ type: 'channel-create', name: 'General de Beto' }));
  await wait(200);
  const aclCrearBeto = findError(beto, /supervisores|administradores/i);

  // 3) Ana crea la cuenta de PROPIETARIO con contraseña
  ana.ws.send(JSON.stringify({ type: 'owner-setup', password: 'arca-segura-123' }));
  await wait(200);
  const propietarioCreado = ana.messages.some((m) => m.type === 'owner-status' && m.owner === true);

  // 4) El propietario asigna Supervisor a Beto (se aplica al instante)
  ana.ws.send(JSON.stringify({ type: 'role-assign', name: 'Beto', role: 'Supervisor' }));
  await wait(200);
  const rolAsignado = beto.messages.some((m) => m.type === 'role-changed' && m.role === 'Supervisor');

  // 5) Beto NO puede asignar roles (solo el propietario)
  beto.ws.send(JSON.stringify({ type: 'role-assign', name: 'Ana', role: 'Administrador' }));
  await wait(200);
  const soloPropietarioAsigna = findError(beto, /propietario/i);

  // 6) Con su nuevo rol, Beto ya puede crear un canal general
  beto.ws.send(JSON.stringify({ type: 'channel-create', name: 'Canal Supervisores' }));
  await wait(200);
  const supervisorPuedeCrear = hasChannel(ana, 'Canal Supervisores');

  // 7) Canal privado con invitación: Beto lo crea e invita a Ana
  beto.ws.send(JSON.stringify({ type: 'channel-create', name: 'Prueba K9', private: true, members: ['Ana'] }));
  await wait(200);
  const privadoCreado = hasChannel(ana, 'Prueba K9');

  ana.ws.send(JSON.stringify({ type: 'join', channel: 'Prueba K9' }));
  await wait(200);
  const privadoEntrada = ana.messages.some((m) => m.type === 'joined' && m.channel === 'Prueba K9');

  // 8) Al eliminar el canal, los que estaban dentro son expulsados
  beto.ws.send(JSON.stringify({ type: 'channel-delete', channel: 'Prueba K9' }));
  await wait(200);
  const expulsadoAlBorrar = ana.messages.some((m) => m.type === 'kicked');

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
    rolEnBienvenida: !!anaWelcome && anaWelcome.role === 'Miembro',
    ice: !!anaWelcome && Array.isArray(anaWelcome.iceServers) && anaWelcome.iceServers.length > 0,
    joined: !!anaJoined && anaJoined.channel === 'Despacho Central',
    roster: rosterOk,
    chat: !!betoChat && betoChat.text === 'hola' && betoChat.name === 'Ana',
    aclDepartamento: !!aclDepartamento,
    aclCrearGeneral: !!aclCrearAna,
    aclCrearGeneralBeto: !!aclCrearBeto,
    propietarioCreado,
    rolAsignado,
    soloPropietarioAsigna: !!soloPropietarioAsigna,
    supervisorPuedeCrear,
    privadoCreado,
    privadoEntrada,
    expulsadoAlBorrar,
  };

  console.log('Comprobaciones:', checks);

  const ok = Object.values(checks).every(Boolean);
  console.log(ok
    ? '✅ PRUEBA OK: roles, propietario, permisos, canales por departamento y privados funcionan.'
    : '❌ PRUEBA FALLIDA');

  server.close();
  try { fs.unlinkSync(process.env.CHANNELS_FILE); } catch {}
  try { fs.unlinkSync(process.env.ROLES_FILE); } catch {}
  process.exit(ok ? 0 : 1);
})().catch((err) => {
  console.error('❌ Error en la prueba:', err.message);
  process.exit(1);
});
