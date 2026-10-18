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

  // 9) Botón de pánico: Ana pide ayuda y la alerta llega a todos
  ana.ws.send(JSON.stringify({ type: 'panic', note: 'Ruta 7 frente a la gasolinera' }));
  await wait(200);
  const panicoLlega = ana.messages.some((m) => m.type === 'panic' && m.name === 'Ana' && /Ruta 7/.test(m.note || ''))
    && beto.messages.some((m) => m.type === 'panic' && m.name === 'Ana');

  // 10) Quien se conecta DESPUÉS también ve la alerta activa
  const carla = await mk('Carla', 'CHP');
  await wait(200);
  const panicoParaNuevos = carla.messages.some((m) => m.type === 'panic' && m.name === 'Ana');
  carla.ws.close();

  // 11) Quien no activó la alerta no puede cancelarla; quien la activó sí
  beto.ws.send(JSON.stringify({ type: 'panic-clear' }));
  await wait(200);
  const miembroNoCancela = !ana.messages.some((m) => m.type === 'panic-clear');
  ana.ws.send(JSON.stringify({ type: 'panic-clear' }));
  await wait(200);
  const panicoCancelado = ana.messages.some((m) => m.type === 'panic-clear')
    && beto.messages.some((m) => m.type === 'panic-clear');

  // 12) La página del 911 para civiles se sirve desde el propio servidor
  const civilPage = await fetch(`http://localhost:${server.port}/911`).then((r) => r.text()).catch(() => '');
  const civilPagina = civilPage.includes('LLAMAR AL 911');

  // 13) Una llamada civil aparece al instante en el CAD de todos
  const civilRes = await fetch(`http://localhost:${server.port}/911`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'POLICE', name: 'Ciudadano Test', location: 'Calle 5 con Avenida 2', description: 'Robo en la tienda' }),
  }).then((r) => r.json()).catch(() => ({}));
  await wait(200);
  const civilLlega = !!civilRes.ok && ana.messages.some((m) => m.type === 'civil-call'
    && m.call && m.call.name === 'Ciudadano Test' && m.call.kind === 'POLICE');

  // 14) Anti-spam: la segunda llamada seguida se rechaza
  const civilSpam = await fetch(`http://localhost:${server.port}/911`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'FIRE', name: 'Spam', location: 'x', description: 'y' }),
  }).then((r) => r.status).catch(() => 0);
  const civilAntiSpam = civilSpam === 429;

  // 15) Mapa de unidades: Ana coloca su punto y llega a todos
  ana.ws.send(JSON.stringify({ type: 'unit-pos-set', callsign: 'L-01', dept: 'LCPD', x: 0.2, y: 0.3 }));
  await wait(200);
  const mapaColocado = ana.messages.some((m) => m.type === 'unit-pos' && m.callsign === 'L-01' && Math.abs(m.x - 0.2) < 0.001)
    && beto.messages.some((m) => m.type === 'unit-pos' && m.callsign === 'L-01');

  // 16) Beto coloca SU punto (B-02)
  beto.ws.send(JSON.stringify({ type: 'unit-pos-set', callsign: 'B-02', dept: 'LCFD', x: 0.4, y: 0.5 }));
  await wait(200);
  const mapaPropio = ana.messages.some((m) => m.type === 'unit-pos' && m.callsign === 'B-02' && m.owner === 'Beto');

  // 17) Beto (Supervisor, no admin) NO puede mover el punto de otra persona
  beto.ws.send(JSON.stringify({ type: 'unit-pos-set', callsign: 'L-01', dept: 'LCPD', x: 0.9, y: 0.9 }));
  await wait(200);
  const mapaBloqueado = !!findError(beto, /indicativo/i)
    && !ana.messages.some((m) => m.type === 'unit-pos' && m.callsign === 'L-01' && m.x === 0.9);

  // 18) El Propietario (Ana) SÍ puede corregir el punto de Beto (el dueño no cambia)
  ana.ws.send(JSON.stringify({ type: 'unit-pos-set', callsign: 'B-02', dept: 'LCFD', x: 0.7, y: 0.7 }));
  await wait(200);
  const mapaAdminCorrige = beto.messages.some((m) => m.type === 'unit-pos' && m.callsign === 'B-02' && Math.abs(m.x - 0.7) < 0.001 && m.owner === 'Beto');

  // 19) Quien se conecta después recibe el mapa completo (2 puntos)
  const dora = await mk('Dora', 'CHP');
  await wait(250);
  const mapaSnapshot = dora.messages.some((m) => m.type === 'unit-positions' && Array.isArray(m.list) && m.list.length === 2);

  // 20) Beto no puede borrar el punto de Ana; Ana sí el suyo
  beto.ws.send(JSON.stringify({ type: 'unit-pos-remove', callsign: 'L-01' }));
  await wait(200);
  const mapaQuitarBloqueado = !ana.messages.some((m) => m.type === 'unit-pos-remove');
  ana.ws.send(JSON.stringify({ type: 'unit-pos-remove', callsign: 'L-01' }));
  await wait(200);
  const mapaQuitado = beto.messages.some((m) => m.type === 'unit-pos-remove' && m.callsign === 'L-01');
  dora.ws.close();

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
    panicoLlega,
    panicoParaNuevos,
    miembroNoCancela,
    panicoCancelado,
    civilPagina,
    civilLlega,
    civilAntiSpam,
    mapaColocado,
    mapaPropio,
    mapaBloqueado,
    mapaAdminCorrige,
    mapaSnapshot,
    mapaQuitarBloqueado,
    mapaQuitado,
  };

  console.log('Comprobaciones:', checks);

  const ok = Object.values(checks).every(Boolean);
  console.log(ok
    ? '✅ PRUEBA OK: roles, propietario, permisos, canales, botón de pánico y llamadas al 911 funcionan.'
    : '❌ PRUEBA FALLIDA');

  server.close();
  try { fs.unlinkSync(process.env.CHANNELS_FILE); } catch {}
  try { fs.unlinkSync(process.env.ROLES_FILE); } catch {}
  process.exit(ok ? 0 : 1);
})().catch((err) => {
  console.error('❌ Error en la prueba:', err.message);
  process.exit(1);
});
