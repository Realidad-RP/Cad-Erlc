// Prueba del sistema de cuentas y reseñas de la web.
// Ejecutar: node bot/test-web-auth.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createWebAuth } = require('./lib/web-auth');
const { createBotServer } = require('./lib/server');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cad-web-test-'));
const sentDMs = [];
let clock = Date.now();
let pedroDni = '';

const cadSnapshot = {
  persons: [
    {
      id: 'PER-1',
      name: 'Ana RP',
      dni: '30123456',
      dob: '1998-04-12',
      license: '4471122',
      licStatus: 'Válida',
      notes: 'Sin antecedentes.',
    },
  ],
  vehicles: [
    { id: 'VEH-1', plate: 'ABC123', model: 'Bravado Banshee', color: 'Rojo', owner: 'Ana RP', status: 'Normal', notes: '' },
  ],
  fines: [
    { id: 'MUL-1', person: 'Ana RP', amount: 500, reason: 'Exceso de velocidad', officer: 'Oficial Pérez', status: 'pendiente', ts: clock },
  ],
  warrants: [
    { id: 'ORD-1', person: 'Ana RP', wkind: 'Arresto', reason: 'Robo', officer: 'Oficial Pérez', status: 'activa', ts: clock },
  ],
  calls: [],
  units: [],
  bolos: [],
};

const discordUsers = {
  ana: { id: '111111111111111111', username: 'ana', displayName: 'Ana RP', avatar: 'https://cdn.discordapp.com/avatars/111/ana.png' },
  pedro: { id: '222222222222222222', username: 'pedro', displayName: 'Pedro RP', avatar: 'https://cdn.discordapp.com/avatars/222/pedro.png' },
};

const webAuth = createWebAuth({
  dataDir: dir,
  now: () => clock,
  log: () => {},
  resolveDiscordUser: async (query) => {
    const q = String(query || '').toLowerCase().replace(/^@/, '');
    return discordUsers[q] || null;
  },
  sendDiscordDM: async (id, content) => {
    sentDMs.push({ id, content });
  },
  getCadSnapshot: () => cadSnapshot,
  getCadUpdatedAt: () => clock,
  cadKey: 'test-cad-key',
});

const checks = {};
function check(name, ok) {
  checks[name] = !!ok;
  console.log((ok ? '✅' : '❌') + ' ' + name);
}

function lastCode() {
  const dm = sentDMs[sentDMs.length - 1];
  const m = dm && dm.content.match(/\*\*(\d{6})\*\*/);
  return m ? m[1] : '';
}

(async () => {
  const server = await createBotServer({
    cfg: { port: 0, cadKey: 'test' },
    onCadSnapshot: async () => 0,
    onErlcEvent: async () => {},
    webAuth,
    log: () => {},
  });
  const base = 'http://127.0.0.1:' + server.port;

  async function api(pathname, { method = 'GET', body, token, headers: extraHeaders } = {}) {
    const headers = Object.assign({}, extraHeaders || {});
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (token) headers.authorization = 'Bearer ' + token;
    const r = await fetch(base + pathname, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await r.json(); } catch { data = null; }
    return { status: r.status, data };
  }

  // Salud
  const health = await fetch(base + '/health');
  check('health sigue funcionando', health.status === 200 && (await health.text()) === 'ok');

  const webStatus = await api('/web/status');
  check('diagnóstico web disponible', webStatus.status === 200 && webStatus.data.ok === true && webStatus.data.loaded === true);

  // Registro
  const reg1 = await api('/auth/register', { method: 'POST', body: { username: '@Ana', password: 'secreto1' } });
  check('registro pide código', reg1.status === 200 && reg1.data.pending === true && reg1.data.username === 'ana');
  check('el código llega por MD', sentDMs.length === 1 && /^\d{6}$/.test(lastCode()));

  const code1 = lastCode();
  const badVerify = await api('/auth/verify', { method: 'POST', body: { username: 'ana', code: '000000' } });
  check('rechaza código incorrecto', badVerify.status === 400);

  const verify1 = await api('/auth/verify', { method: 'POST', body: { username: 'ana', code: code1 } });
  check('verifica y devuelve token', verify1.status === 200 && !!verify1.data.token);
  check('guarda el avatar de Discord', verify1.data.user && verify1.data.user.avatar.includes('ana.png'));
  check('rol inicial Ciudadano', verify1.data.user && verify1.data.user.role === 'Ciudadano');
  const token = verify1.data.token;

  const me = await api('/auth/me', { token });
  check('sesión recordada (/auth/me)', me.status === 200 && me.data.user.username === 'ana');

  const meBad = await api('/auth/me', { token: 'a'.repeat(64) });
  check('token inválido rechazado', meBad.status === 401);

  // Login
  const loginBad = await api('/auth/login', { method: 'POST', body: { username: 'ana', password: 'mal' } });
  check('login con clave incorrecta falla', loginBad.status === 401);
  const loginOk = await api('/auth/login', { method: 'POST', body: { username: 'ANA', password: 'secreto1' } });
  check('login correcto (usuario sin distinguir mayúsculas)', loginOk.status === 200 && !!loginOk.data.token);

  // Reseñas compartidas
  clock += 46000;
  const review1 = await api('/reviews', { method: 'POST', token, body: { estrellas: 5, texto: 'Excelente rol, muy buen staff.' } });
  check('publica reseña con la cuenta', review1.status === 200 && review1.data.review.nombre === 'Ana RP');
  check('la reseña guarda el avatar', review1.data.review && review1.data.review.avatar.includes('ana.png'));

  clock += 46000;
  const review2 = await api('/reviews', { method: 'POST', body: { nombre: 'Pedro', estrellas: 4, texto: 'Muy buena comunidad, volvería.' } });
  check('permite reseña sin cuenta', review2.status === 200);

  const wall = await api('/reviews');
  check('el muro ve reseñas de otros dispositivos', wall.status === 200 && wall.data.reviews.length === 2);

  // Recuperar contraseña
  clock += 46000;
  const reset1 = await api('/auth/reset/request', { method: 'POST', body: { username: 'ana' } });
  check('recuperación envía código', reset1.status === 200 && sentDMs.length >= 2);
  const code2 = lastCode();
  const reset2 = await api('/auth/reset/confirm', {
    method: 'POST',
    body: { username: 'ana', code: code2, password: 'nuevaClave9' },
  });
  check('recuperación cambia la clave', reset2.status === 200 && !!reset2.data.token);

  const oldLogin = await api('/auth/login', { method: 'POST', body: { username: 'ana', password: 'secreto1' } });
  check('la clave vieja ya no sirve', oldLogin.status === 401);
  const newLogin = await api('/auth/login', { method: 'POST', body: { username: 'ana', password: 'nuevaClave9' } });
  check('la clave nueva funciona', newLogin.status === 200);
  const citizenToken = newLogin.data.token;

  // Panel de Ciudadano: vinculación con los registros del CAD
  const citizenBefore = await api('/citizen/me', { token: citizenToken });
  check('panel: cuenta sin DNI vinculado', citizenBefore.status === 200 && citizenBefore.data.linked === false);

  const linkNoAuth = await api('/citizen/link', { method: 'POST', body: { dni: '30123456', name: 'Ana RP' } });
  check('panel: vincular DNI exige sesión', linkNoAuth.status === 401);

  const linkWrong = await api('/citizen/link', {
    method: 'POST',
    token: citizenToken,
    body: { dni: '30123456', name: 'Nombre Falso' },
  });
  check('panel: rechaza un nombre que no coincide', linkWrong.status === 404);

  const linkOk = await api('/citizen/link', {
    method: 'POST',
    token: citizenToken,
    body: { dni: '30.123.456', name: 'ana rp' },
  });
  check('panel: vincula DNI y nombre (sin distinguir formato)', linkOk.status === 200 && linkOk.data.linked === true);
  check('panel: devuelve los datos del ciudadano', linkOk.data.citizen && linkOk.data.citizen.name === 'Ana RP');
  check('panel: cuenta multas, vehículos y órdenes', linkOk.data.citizen
    && linkOk.data.citizen.totals.fines === 1
    && linkOk.data.citizen.vehicles.length === 1
    && linkOk.data.citizen.totals.warrants === 1);

  const meWithDni = await api('/auth/me', { token: citizenToken });
  check('panel: el DNI queda guardado en la cuenta', meWithDni.data.user.dni === '30123456');

  const citizenAfter = await api('/citizen/me', { token: citizenToken });
  check('panel: consulta el perfil ya vinculado', citizenAfter.status === 200
    && citizenAfter.data.linked === true
    && citizenAfter.data.citizen.dni === '30123456');

  const originalName = cadSnapshot.persons[0].name;
  cadSnapshot.persons[0].name = 'Ana RP Renombrada';
  const citizenRenamed = await api('/citizen/me', { token: citizenToken });
  check('panel: si el nombre cambia no muestra otro registro y pide revincular',
    citizenRenamed.data.missing === true && !citizenRenamed.data.citizen);
  cadSnapshot.persons[0].name = originalName;

  const unlink = await api('/citizen/unlink', { method: 'POST', token: citizenToken });
  check('panel: desvincula el DNI', unlink.status === 200 && unlink.data.user.dni === '');
  const citizenUnlinked = await api('/citizen/me', { token: citizenToken });
  check('panel: después de desvincular no muestra datos', citizenUnlinked.data.linked === false);

  const linkAgain = await api('/citizen/link', {
    method: 'POST',
    token: citizenToken,
    body: { dni: '30123456', name: 'Ana RP' },
  });
  check('panel: se puede volver a vincular', linkAgain.status === 200 && linkAgain.data.linked === true);

  // Panel: crear un DNI nuevo desde la web
  clock += 46000;
  const regPedro = await api('/auth/register', { method: 'POST', body: { username: 'pedro', password: 'pedro123' } });
  check('panel: segunda cuenta pide código', regPedro.status === 200 && regPedro.data.pending === true);
  const codePedro = lastCode();
  const verifyPedro = await api('/auth/verify', { method: 'POST', body: { username: 'pedro', code: codePedro } });
  check('panel: segunda cuenta verificada', verifyPedro.status === 200 && !!verifyPedro.data.token);
  const pedroToken = verifyPedro.data.token;

  const createNoAuth = await api('/citizen/create', {
    method: 'POST',
    body: { firstName: 'Pedro', lastName: 'Gómez', dob: '2000-05-10' },
  });
  check('panel: crear DNI exige sesión', createNoAuth.status === 401);

  const createBadDob = await api('/citizen/create', {
    method: 'POST',
    token: pedroToken,
    body: { firstName: 'Pedro', lastName: 'Gómez', dob: '2026-02-30' },
  });
  check('panel: rechaza fecha de nacimiento inválida', createBadDob.status === 400);

  const createPedro = await api('/citizen/create', {
    method: 'POST',
    token: pedroToken,
    body: { firstName: 'Pedro', lastName: 'Gómez', dob: '2000-05-10' },
  });
  check('panel: crea el DNI desde la web', createPedro.status === 200
    && createPedro.data.linked === true
    && createPedro.data.citizen
    && createPedro.data.citizen.source === 'web');
  check('panel: el DNI tiene formato de California', /^CA-\d{8}$/.test(createPedro.data.citizen.dni));
  check('panel: calcula la edad desde la fecha de nacimiento', createPedro.data.citizen.age >= 18);
  check('panel: guarda nombre y apellido', createPedro.data.citizen.name === 'Pedro Gómez');
  pedroDni = createPedro.data.citizen.dni;

  const pedroMe = await api('/citizen/me', { token: pedroToken });
  check('panel: consulta el DNI creado sin depender del CAD', pedroMe.status === 200
    && pedroMe.data.linked === true
    && pedroMe.data.citizen
    && pedroMe.data.citizen.source === 'web'
    && pedroMe.data.citizen.totals.fines === 0);

  const dirNoKey = await api('/citizen/directory');
  check('panel: el directorio del CAD exige clave', dirNoKey.status === 401);
  const dirBadKey = await api('/citizen/directory', { headers: { 'x-cad-key': 'mala' } });
  check('panel: el directorio rechaza una clave incorrecta', dirBadKey.status === 401);
  const directoryRes = await api('/citizen/directory', { headers: { 'x-cad-key': 'test-cad-key' } });
  check('panel: el directorio entrega los DNI web al CAD', directoryRes.status === 200
    && directoryRes.data.count === 1
    && directoryRes.data.citizens[0].dni === pedroDni
    && directoryRes.data.citizens[0].name === 'Pedro Gómez');

  const createAgain = await api('/citizen/create', {
    method: 'POST',
    token: pedroToken,
    body: { firstName: 'Otro', lastName: 'Nombre', dob: '1990-01-01' },
  });
  check('panel: no permite crear dos DNI en la misma cuenta', createAgain.status === 409);

  const unlinkWeb = await api('/citizen/unlink', { method: 'POST', token: pedroToken });
  check('panel: el DNI creado en la web no se puede desvincular', unlinkWeb.status === 409);

  // Casos de error
  clock += 46000;
  const dup = await api('/auth/register', { method: 'POST', body: { username: 'ana', password: 'otraClave' } });
  check('no permite registrar dos veces', dup.status === 409);

  clock += 46000;
  const unknown = await api('/auth/register', { method: 'POST', body: { username: 'nadie', password: 'otraClave' } });
  check('usuario que no está en Discord rechazado', unknown.status === 404);

  const shortPass = await api('/auth/login', { method: 'POST', body: { username: 'ana', password: 'x' } });
  check('clave corta rechazada', shortPass.status === 401);

  // CORS
  const opt = await fetch(base + '/auth/login', { method: 'OPTIONS' });
  const allow = opt.headers.get('access-control-allow-headers') || '';
  check('CORS permite authorization', opt.status === 204 && allow.includes('authorization'));

  // Persistencia en archivo
  const store = JSON.parse(fs.readFileSync(path.join(dir, 'web.json'), 'utf8'));
  check('cuenta guardada en disco', !!store.accounts.ana && store.accounts.ana.hash.length === 128);
  check('panel: DNI vinculado guardado en disco', store.accounts.ana.dni === '30123456');
  check('panel: DNI web guardado en disco', !!store.accounts.pedro.webCitizen
    && store.accounts.pedro.webCitizen.dni === pedroDni
    && store.accounts.pedro.webCitizen.name === 'Pedro Gómez'
    && store.accounts.pedro.webCitizen.age >= 18);
  check('reseñas guardadas en disco', store.reviews.length === 2);
  check('no guarda contraseñas en texto plano', !JSON.stringify(store).includes('nuevaClave9'));

  const total = Object.keys(checks).length;
  const ok = Object.values(checks).filter(Boolean).length;
  console.log(`\nWEB AUTH ${ok === total ? 'OK' : 'FALLO'} (${ok}/${total})`);

  await new Promise((r) => setTimeout(r, 300));
  await server.close();
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(ok === total ? 0 : 1);
})().catch((err) => {
  console.error('Error en la prueba:', err);
  process.exit(1);
});
