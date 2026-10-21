// Prueba del sistema de cuentas y reseñas de la web.
// Ejecutar: node bot/test-web-auth.js

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createWebAuth } = require('./lib/web-auth');
const { createBotServer } = require('./lib/server');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cad-web-test-'));
const sentDMs = [];
const sentLicenseApps = [];
let clock = Date.now();
let pedroDni = '';
let pedroLicenseNumber = '';
const legacySalt = crypto.randomBytes(16).toString('hex');
const legacyHash = crypto.scryptSync('legacy123', legacySalt, 64).toString('hex');
fs.writeFileSync(path.join(dir, 'web.json'), JSON.stringify({
  version: 1,
  accounts: {
    legado: {
      username: 'legado',
      displayName: 'Cuenta Vieja',
      avatar: '',
      discordId: '',
      role: 'Ciudadano',
      salt: legacySalt,
      hash: legacyHash,
      createdAt: clock - 86400000,
      verifiedAt: clock - 86400000,
    },
  },
  sessions: {},
  reviews: [],
}, null, 2));

const cadSnapshot = {
  persons: [
    {
      id: 'PER-1',
      name: 'Ana RP',
      dni: '30123456',
      dob: '1998-04-12',
      sex: 'F',
      hair: 'Castaño',
      eyes: 'Marrones',
      heightCm: 168,
      weightKg: 58,
      address: '1234 Mission Blvd',
      city: 'Los Angeles',
      state: 'CA',
      zip: '90001',
      issueDate: '2026-01-10',
      expires: '2030-01-10',
      robloxUsername: 'Ana_RP',
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
  luis: { id: '333333333333333333', username: 'luis', displayName: 'Luis RP', avatar: 'https://cdn.discordapp.com/avatars/333/luis.png' },
};

const robloxUsers = {
  ana_rp: { id: 9001, username: 'Ana_RP', displayName: 'Ana en Roblox' },
  pedro_rp: { id: 9002, username: 'Pedro_RP', displayName: 'Pedro en Roblox' },
  luis_rp: { id: 9003, username: 'Luis_RP', displayName: 'Luis en Roblox' },
};

const webAuth = createWebAuth({
  dataDir: dir,
  now: () => clock,
  log: () => {},
  resolveDiscordUser: async (query) => {
    const q = String(query || '').toLowerCase().replace(/^@/, '');
    return discordUsers[q] || null;
  },
  resolveRobloxUser: async (query) => {
    const key = String(query || '').trim().replace(/^@+/, '').toLowerCase();
    return robloxUsers[key] || null;
  },
  sendDiscordDM: async (id, content) => {
    sentDMs.push({ id, content });
  },
  sendLicenseApplication: async (application) => {
    sentLicenseApps.push(application);
    return { id: 'lic-msg-' + sentLicenseApps.length };
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
  const regNoRoblox = await api('/auth/register', { method: 'POST', body: { username: 'luis', password: 'luis1234' } });
  check('registro exige usuario de Roblox', regNoRoblox.status === 400);
  const regBadRoblox = await api('/auth/register', {
    method: 'POST',
    body: { username: 'luis', password: 'luis1234', robloxUsername: 'no_existe' },
  });
  check('registro rechaza un Roblox inexistente', regBadRoblox.status === 404);

  const reg1 = await api('/auth/register', {
    method: 'POST',
    body: { username: '@Ana', password: 'secreto1', robloxUsername: '@ana_rp' },
  });
  check('registro pide código', reg1.status === 200 && reg1.data.pending === true && reg1.data.username === 'ana');
  check('el código llega por MD', sentDMs.length === 1 && /^\d{6}$/.test(lastCode()));

  const code1 = lastCode();
  const badVerify = await api('/auth/verify', { method: 'POST', body: { username: 'ana', code: '000000' } });
  check('rechaza código incorrecto', badVerify.status === 400);

  const verify1 = await api('/auth/verify', { method: 'POST', body: { username: 'ana', code: code1 } });
  check('verifica y devuelve token', verify1.status === 200 && !!verify1.data.token);
  check('guarda el avatar de Discord', verify1.data.user && verify1.data.user.avatar.includes('ana.png'));
  check('rol inicial Ciudadano', verify1.data.user && verify1.data.user.role === 'Ciudadano');
  check('guarda el usuario de Roblox verificado', verify1.data.user
    && verify1.data.user.robloxUsername === 'Ana_RP'
    && verify1.data.user.robloxDisplayName === 'Ana en Roblox');
  const token = verify1.data.token;

  const me = await api('/auth/me', { token });
  check('sesión recordada (/auth/me)', me.status === 200 && me.data.user.username === 'ana' && me.data.user.robloxUsername === 'Ana_RP');

  const meBad = await api('/auth/me', { token: 'a'.repeat(64) });
  check('token inválido rechazado', meBad.status === 401);

  // Login
  const loginBad = await api('/auth/login', { method: 'POST', body: { username: 'ana', password: 'mal' } });
  check('login con clave incorrecta falla', loginBad.status === 401);
  const loginOk = await api('/auth/login', { method: 'POST', body: { username: 'ANA', password: 'secreto1' } });
  check('login correcto (usuario sin distinguir mayúsculas)', loginOk.status === 200 && !!loginOk.data.token);
  check('login devuelve el usuario de Roblox', loginOk.data.user && loginOk.data.user.robloxUsername === 'Ana_RP');
  const loginWrongRb = await api('/auth/login', {
    method: 'POST',
    body: { username: 'ana', password: 'secreto1', robloxUsername: 'pedro_rp' },
  });
  check('login rechaza un Roblox que no es el de la cuenta', loginWrongRb.status === 401);

  // Cuenta vieja: no tenía Roblox y se le pide una única vez al entrar.
  const legacyNoRb = await api('/auth/login', { method: 'POST', body: { username: 'legado', password: 'legacy123' } });
  check('login de cuenta vieja pide Roblox', legacyNoRb.status === 400);
  const legacyBadRb = await api('/auth/login', {
    method: 'POST',
    body: { username: 'legado', password: 'legacy123', robloxUsername: 'no_existe' },
  });
  check('login de cuenta vieja valida Roblox', legacyBadRb.status === 404);
  const legacyOk = await api('/auth/login', {
    method: 'POST',
    body: { username: 'legado', password: 'legacy123', robloxUsername: 'ana_rp' },
  });
  check('login de cuenta vieja guarda Roblox', legacyOk.status === 200
    && legacyOk.data.user.robloxUsername === 'Ana_RP');
  const legacyAgain = await api('/auth/login', { method: 'POST', body: { username: 'legado', password: 'legacy123' } });
  check('login posterior ya no exige Roblox', legacyAgain.status === 200);

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
  check('panel: muestra los datos físicos del DNI', linkOk.data.citizen
    && linkOk.data.citizen.sex === 'F'
    && linkOk.data.citizen.heightCm === 168
    && linkOk.data.citizen.address === '1234 Mission Blvd'
    && linkOk.data.citizen.robloxUsername === 'Ana_RP');
  check('panel: la licencia empieza sin solicitud', linkOk.data.citizen
    && linkOk.data.citizen.licenseInfo.status === 'none'
    && linkOk.data.citizen.licStatus === 'Sin licencia');

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
  const regPedro = await api('/auth/register', {
    method: 'POST',
    body: { username: 'pedro', password: 'pedro123', robloxUsername: 'pedro_rp' },
  });
  check('panel: segunda cuenta pide código', regPedro.status === 200 && regPedro.data.pending === true);
  const codePedro = lastCode();
  const verifyPedro = await api('/auth/verify', { method: 'POST', body: { username: 'pedro', code: codePedro } });
  check('panel: segunda cuenta verificada', verifyPedro.status === 200 && !!verifyPedro.data.token);
  const pedroToken = verifyPedro.data.token;

  const pedroData = {
    firstName: 'Pedro',
    lastName: 'Gómez',
    dob: '2000-05-10',
    sex: 'M',
    hair: 'Negro',
    eyes: 'Marrones',
    heightCm: 178,
    weightKg: 74.5,
    address: '742 Sunset Blvd',
    city: 'Los Angeles',
    zip: '90012',
  };

  const createNoAuth = await api('/citizen/create', { method: 'POST', body: pedroData });
  check('panel: crear DNI exige sesión', createNoAuth.status === 401);

  const createBadDob = await api('/citizen/create', {
    method: 'POST',
    token: pedroToken,
    body: { ...pedroData, dob: '2026-02-30' },
  });
  check('panel: rechaza fecha de nacimiento inválida', createBadDob.status === 400);

  const createBadPhysical = await api('/citizen/create', {
    method: 'POST',
    token: pedroToken,
    body: { ...pedroData, heightCm: 20, zip: 'abc' },
  });
  check('panel: valida altura y código postal', createBadPhysical.status === 400);

  const createPedro = await api('/citizen/create', { method: 'POST', token: pedroToken, body: pedroData });
  check('panel: crea el DNI desde la web', createPedro.status === 200
    && createPedro.data.linked === true
    && createPedro.data.citizen
    && createPedro.data.citizen.source === 'web');
  check('panel: el DNI tiene formato de California C#######', /^C\d{7}$/.test(createPedro.data.citizen.dni));
  check('panel: calcula la edad desde la fecha de nacimiento', createPedro.data.citizen.age >= 18);
  check('panel: guarda nombre y apellido', createPedro.data.citizen.name === 'Pedro Gómez');
  check('panel: guarda los datos físicos del DNI', createPedro.data.citizen.sex === 'M'
    && createPedro.data.citizen.hair === 'Negro'
    && createPedro.data.citizen.eyes === 'Marrones'
    && createPedro.data.citizen.heightCm === 178
    && createPedro.data.citizen.weightKg === 74.5
    && createPedro.data.citizen.address === '742 Sunset Blvd'
    && createPedro.data.citizen.city === 'Los Angeles'
    && createPedro.data.citizen.zip === '90012');
  check('panel: emite y vence el DNI', /^\d{4}-\d{2}-\d{2}$/.test(createPedro.data.citizen.issueDate)
    && /^\d{4}-\d{2}-\d{2}$/.test(createPedro.data.citizen.expires));
  check('panel: asocia el Roblox de la cuenta', createPedro.data.citizen.robloxUsername === 'Pedro_RP');
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
  check('panel: el directorio incluye los datos físicos y Roblox', directoryRes.data.citizens[0].sex === 'M'
    && directoryRes.data.citizens[0].heightCm === 178
    && directoryRes.data.citizens[0].weightKg === 74.5
    && directoryRes.data.citizens[0].address === '742 Sunset Blvd'
    && directoryRes.data.citizens[0].zip === '90012'
    && directoryRes.data.citizens[0].robloxUsername === 'Pedro_RP');

  // Panel: licencia solicitada desde la web y revisada por un moderador
  const regLuis = await api('/auth/register', {
    method: 'POST',
    body: { username: 'luis', password: 'luis1234', robloxUsername: 'luis_rp' },
  });
  check('licencia: tercera cuenta creada', regLuis.status === 200 && regLuis.data.pending === true);
  const verifyLuis = await api('/auth/verify', { method: 'POST', body: { username: 'luis', code: lastCode() } });
  check('licencia: tercera cuenta verificada', verifyLuis.status === 200 && !!verifyLuis.data.token);
  const luisToken = verifyLuis.data.token;

  const licenseNoAuth = await api('/citizen/license/apply', {
    method: 'POST',
    body: { experience: 'Ninguna', vehicleType: 'Auto', trafficRules: 'Sí', reason: 'Quiero aprender a manejar en la ciudad.', confirm: true },
  });
  check('licencia: el pedido exige sesión', licenseNoAuth.status === 401);

  const licenseNoDni = await api('/citizen/license/apply', {
    method: 'POST',
    token: luisToken,
    body: { experience: 'Ninguna', vehicleType: 'Auto', trafficRules: 'Sí', reason: 'Quiero aprender a manejar en la ciudad.', confirm: true },
  });
  check('licencia: exige crear o vincular el DNI primero', licenseNoDni.status === 400);

  const licenseBad = await api('/citizen/license/apply', {
    method: 'POST',
    token: citizenToken,
    body: { experience: 'Mucha', vehicleType: 'Todos', trafficRules: 'Sí', reason: 'Corto', confirm: true },
  });
  check('licencia: valida el motivo del cuestionario', licenseBad.status === 400);

  const licenseAna = await api('/citizen/license/apply', {
    method: 'POST',
    token: citizenToken,
    body: {
      experience: 'Intermedia',
      vehicleType: 'Auto',
      trafficRules: 'Sí',
      reason: 'Quiero manejar mi auto para ir al trabajo y respetar las normas.',
      confirm: true,
    },
  });
  check('licencia: guarda la solicitud como pendiente', licenseAna.status === 200
    && licenseAna.data.license.status === 'pending'
    && licenseAna.data.license.application.vehicleType === 'Auto');
  check('licencia: envía el cuestionario al canal de mods', sentLicenseApps.length === 1
    && sentLicenseApps[0].name === 'Ana RP'
    && sentLicenseApps[0].dni === '30123456'
    && sentLicenseApps[0].robloxUsername === 'Ana_RP');

  const licenseAnaAgain = await api('/citizen/license/apply', {
    method: 'POST',
    token: citizenToken,
    body: { experience: 'Mucha', vehicleType: 'Todos', trafficRules: 'Sí', reason: 'Quiero manejar todos los vehículos de la ciudad.', confirm: true },
  });
  check('licencia: no permite duplicar una solicitud pendiente', licenseAnaAgain.status === 409);

  const anaPending = await api('/citizen/me', { token: citizenToken });
  check('licencia: el panel muestra el estado en revisión', anaPending.data.citizen.licenseInfo.status === 'pending'
    && anaPending.data.citizen.licStatus === 'En revisión'
    && anaPending.data.user.licenseStatus === 'En revisión');

  const anaApproved = await webAuth.reviewLicense('ana', 'approve', { id: '999', username: 'mod', displayName: 'Mod Uno' });
  check('licencia: el moderador aprueba y genera número L#######', anaApproved.decision === 'approved'
    && /^L\d{7}$/.test(anaApproved.license.number)
    && anaApproved.license.expiresAt > clock);
  check('licencia: la aprobación queda registrada', anaApproved.license.reviewedBy === 'Mod Uno'
    && anaApproved.license.application.experience === 'Intermedia');

  const anaAfter = await api('/citizen/me', { token: citizenToken });
  check('licencia: el panel muestra la licencia válida', anaAfter.data.citizen.licenseInfo.status === 'approved'
    && anaAfter.data.citizen.licStatus === 'Válida'
    && anaAfter.data.citizen.license === anaApproved.license.number);
  const anaMe = await api('/auth/me', { token: citizenToken });
  check('licencia: el número también queda en la cuenta', anaMe.data.user.licenseStatus === 'Válida'
    && anaMe.data.user.licenseNumber === anaApproved.license.number);

  let reviewClosed = null;
  try {
    await webAuth.reviewLicense('ana', 'approve', { id: '999', username: 'mod', displayName: 'Mod Uno' });
  } catch (err) {
    reviewClosed = err;
  }
  check('licencia: no se revisa dos veces la misma solicitud', reviewClosed && reviewClosed.status === 409);

  const licensePedro = await api('/citizen/license/apply', {
    method: 'POST',
    token: pedroToken,
    body: {
      experience: 'Poca',
      vehicleType: 'Moto',
      trafficRules: 'No',
      reason: 'Quiero sacar la licencia para poder trabajar haciendo entregas.',
      confirm: true,
    },
  });
  check('licencia: segunda cuenta envía su solicitud', licensePedro.status === 200
    && licensePedro.data.license.status === 'pending'
    && sentLicenseApps.length === 2);

  const pedroRejected = await webAuth.reviewLicense(
    'pedro',
    'reject',
    { id: '998', username: 'mod2', displayName: 'Mod Dos' },
    'Faltan datos del vehículo.'
  );
  check('licencia: el moderador puede rechazar', pedroRejected.decision === 'rejected'
    && pedroRejected.license.status === 'rejected'
    && pedroRejected.license.rejectionReason === 'Faltan datos del vehículo.');

  const pedroRejectedMe = await api('/citizen/me', { token: pedroToken });
  check('licencia: el panel muestra el rechazo y el motivo', pedroRejectedMe.data.citizen.licenseInfo.status === 'rejected'
    && pedroRejectedMe.data.citizen.licenseInfo.rejectionReason === 'Faltan datos del vehículo.');

  const licensePedroAgain = await api('/citizen/license/apply', {
    method: 'POST',
    token: pedroToken,
    body: {
      experience: 'Poca',
      vehicleType: 'Moto',
      trafficRules: 'Sí',
      reason: 'Ya completé los datos. Quiero la licencia para trabajar en entregas.',
      confirm: true,
    },
  });
  check('licencia: después de un rechazo se puede volver a solicitar', licensePedroAgain.status === 200
    && licensePedroAgain.data.license.status === 'pending'
    && sentLicenseApps.length === 3);

  const pedroApproved = await webAuth.reviewLicense('pedro', 'approve', { id: '998', username: 'mod2', displayName: 'Mod Dos' });
  check('licencia: la segunda solicitud puede aprobarse', pedroApproved.decision === 'approved'
    && /^L\d{7}$/.test(pedroApproved.license.number));
  pedroLicenseNumber = pedroApproved.license.number;

  const pedroFinal = await api('/citizen/me', { token: pedroToken });
  check('licencia: el DNI web conserva licencia aprobada', pedroFinal.data.citizen.licenseInfo.status === 'approved'
    && pedroFinal.data.citizen.license === pedroLicenseNumber);

  const createAgain = await api('/citizen/create', {
    method: 'POST',
    token: pedroToken,
    body: {
      firstName: 'Otro', lastName: 'Nombre', dob: '1990-01-01', sex: 'M', hair: 'Negro', eyes: 'Marrones',
      heightCm: 170, weightKg: 70, address: 'Calle 123', city: 'Los Angeles', zip: '90001',
    },
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
  check('panel: Roblox guardado en disco', store.accounts.ana.robloxUsername === 'Ana_RP'
    && store.accounts.ana.robloxId === '9001');
  check('panel: DNI web guardado en disco', !!store.accounts.pedro.webCitizen
    && store.accounts.pedro.webCitizen.dni === pedroDni
    && store.accounts.pedro.webCitizen.name === 'Pedro Gómez'
    && store.accounts.pedro.webCitizen.age >= 18
    && store.accounts.pedro.webCitizen.sex === 'M'
    && store.accounts.pedro.webCitizen.heightCm === 178
    && store.accounts.pedro.webCitizen.robloxUsername === 'Pedro_RP');
  check('licencia aprobada guardada en disco', store.accounts.ana.license.status === 'approved'
    && /^L\d{7}$/.test(store.accounts.ana.license.number)
    && store.accounts.pedro.license.status === 'approved'
    && store.accounts.pedro.license.number === pedroLicenseNumber);
  check('la licencia final conserva al revisor', !!store.accounts.pedro.license.application
    && store.accounts.pedro.license.reviewedBy === 'Mod Dos');
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
