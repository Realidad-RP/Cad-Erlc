// ============================================================
// Cuentas de la web + reseñas compartidas (Panel de Ciudadano)
// ------------------------------------------------------------
// - Registro: usuario de Discord + contraseña + código por MD.
// - Login: usuario de Discord + contraseña.
// - Recuperación: código por MD + contraseña nueva.
// - Sesiones con token (30 días) y avatar de Discord.
// - Reseñas guardadas en el servidor (se ven desde cualquier
//   dispositivo, no solo en el navegador de quien la escribió).
//
// Los datos se guardan mediante un "store":
//   - DiscordStore (producción): un canal privado de Discord.
//   - FileStore (desarrollo/respaldo): bot/data/web.json.
// ============================================================

const crypto = require('crypto');
const { createFileStore } = require('./store');

const MAX_BODY = 32 * 1024;
const CODE_TTL = 10 * 60 * 1000;             // 10 minutos
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000; // 30 días
const CODE_COOLDOWN = 30 * 1000;             // 1 código cada 30 s
const MAX_CODE_TRIES = 8;
const MAX_REVIEWS = 1000;
const USERNAME_RE = /^[a-z0-9._]{2,32}$/;

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

function hashCode(username, code) {
  return sha256('lr-web:' + username + ':' + code);
}

function hashToken(token) {
  return sha256('lr-token:' + token);
}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), String(salt), 64).toString('hex');
}

function safeEqualHex(a, b) {
  const ba = Buffer.from(String(a || ''), 'hex');
  const bb = Buffer.from(String(b || ''), 'hex');
  return ba.length > 0 && ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function normalizeUsername(value) {
  return String(value || '').trim().replace(/^@+/, '').toLowerCase();
}

function cleanText(value, max) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanMultiline(value, max) {
  return String(value == null ? '' : value).replace(/\r\n?/g, '\n').trim().slice(0, max);
}

function normalizeDni(value) {
  return String(value == null ? '' : value).trim().toLowerCase().replace(/[\s.\-]/g, '');
}

function normalizeName(value) {
  return String(value == null ? '' : value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function sameCitizenName(a, b) {
  const na = normalizeName(a);
  return !!na && na === normalizeName(b);
}

const DNI_PREFIX = 'C';
const ROBLOX_RE = /^[A-Za-z0-9_]{3,20}$/;
const LICENSE_EXPERIENCE = ['Ninguna', 'Poca', 'Intermedia', 'Mucha'];
const LICENSE_VEHICLES = ['Auto', 'Moto', 'Camión', 'Todos'];
const LICENSE_TTL = 4 * 365.25 * 24 * 60 * 60 * 1000;
const WEAPON_EXPERIENCE = ['Ninguna', 'Poca', 'Intermedia', 'Mucha'];
const WEAPON_TYPES = ['Arma corta', 'Arma larga', 'Ambas'];
const WEAPON_PURPOSES = ['Defensa personal', 'Trabajo de seguridad', 'Deporte y tiro', 'Colección'];
const WEAPON_LICENSE_TTL = 2 * 365.25 * 24 * 60 * 60 * 1000;

function normalizeRoblox(value) {
  return String(value == null ? '' : value).trim().replace(/^@+/, '');
}

function parseDob(value) {
  const dob = String(value == null ? '' : value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const date = new Date(dob + 'T12:00:00Z');
  if (Number.isNaN(date.getTime())) return null;
  if (date.toISOString().slice(0, 10) !== dob) return null;
  return date;
}

function ageFromDob(dob, today = Date.now()) {
  const date = parseDob(dob);
  if (!date) return 0;
  const nowDate = new Date(today);
  let age = nowDate.getUTCFullYear() - date.getUTCFullYear();
  const month = nowDate.getUTCMonth() - date.getUTCMonth();
  if (month < 0 || (month === 0 && nowDate.getUTCDate() < date.getUTCDate())) age--;
  return age;
}

function generateDni(taken) {
  for (let i = 0; i < 80; i++) {
    const number = String(crypto.randomInt(1000000, 10000000));
    const dni = DNI_PREFIX + number;
    if (!taken.has(normalizeDni(dni))) return dni;
  }
  throw httpError(503, 'No pude generar un DNI libre. Probá de nuevo en unos segundos.');
}

function generateLicenseNumber(taken) {
  for (let i = 0; i < 80; i++) {
    const number = 'L' + String(crypto.randomInt(1000000, 10000000));
    if (!taken.has(number)) return number;
  }
  throw httpError(503, 'No pude generar un número de licencia. Probá de nuevo.');
}

function licensePublic(account) {
  const lic = account && account.license;
  if (!lic || !lic.status) {
    return {
      status: 'none',
      label: 'Sin licencia',
      number: '',
      submittedAt: 0,
      reviewedAt: 0,
      reviewedBy: '',
      issuedAt: 0,
      expiresAt: 0,
      rejectionReason: '',
      application: null,
    };
  }
  const labels = { pending: 'En revisión', approved: 'Válida', rejected: 'Rechazada', suspended: 'Suspendida', revoked: 'Revocada' };
  return {
    status: lic.status,
    label: labels[lic.status] || 'Sin licencia',
    number: String(lic.number || ''),
    submittedAt: Number(lic.submittedAt) || 0,
    reviewedAt: Number(lic.reviewedAt) || 0,
    reviewedBy: String(lic.reviewedBy || ''),
    issuedAt: Number(lic.issuedAt) || 0,
    expiresAt: Number(lic.expiresAt) || 0,
    rejectionReason: String(lic.rejectionReason || ''),
    application: lic.application ? {
      experience: String(lic.application.experience || ''),
      vehicleType: String(lic.application.vehicleType || ''),
      trafficRules: String(lic.application.trafficRules || ''),
      reason: String(lic.application.reason || ''),
      submittedAt: Number(lic.application.submittedAt) || 0,
    } : null,
  };
}

function generateWeaponLicenseNumber(taken) {
  for (let i = 0; i < 80; i++) {
    const number = 'W' + String(crypto.randomInt(1000000, 10000000));
    if (!taken.has(number)) return number;
  }
  throw httpError(503, 'No pude generar un número de licencia de armas. Probá de nuevo.');
}

function weaponLicensePublic(account) {
  const lic = account && account.weaponLicense;
  if (!lic || !lic.status) {
    return {
      status: 'none',
      label: 'Sin licencia de armas',
      number: '',
      submittedAt: 0,
      reviewedAt: 0,
      reviewedBy: '',
      issuedAt: 0,
      expiresAt: 0,
      rejectionReason: '',
      application: null,
    };
  }
  const labels = { pending: 'En revisión', approved: 'Válida', rejected: 'Rechazada', suspended: 'Suspendida', revoked: 'Revocada' };
  return {
    status: lic.status,
    label: labels[lic.status] || 'Sin licencia de armas',
    number: String(lic.number || ''),
    submittedAt: Number(lic.submittedAt) || 0,
    reviewedAt: Number(lic.reviewedAt) || 0,
    reviewedBy: String(lic.reviewedBy || ''),
    issuedAt: Number(lic.issuedAt) || 0,
    expiresAt: Number(lic.expiresAt) || 0,
    rejectionReason: String(lic.rejectionReason || ''),
    application: lic.application ? {
      experience: String(lic.application.experience || ''),
      weaponType: String(lic.application.weaponType || ''),
      purpose: String(lic.application.purpose || ''),
      reason: String(lic.application.reason || ''),
      submittedAt: Number(lic.application.submittedAt) || 0,
    } : null,
  };
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(httpError(413, 'El pedido es demasiado grande.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(parsed && typeof parsed === 'object' ? parsed : {});
      } catch {
        reject(httpError(400, 'Los datos enviados no son válidos.'));
      }
    });
    req.on('error', () => resolve({}));
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type, authorization, x-cad-key',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function publicUser(account) {
  const license = licensePublic(account);
  const weaponLicense = weaponLicensePublic(account);
  return {
    username: account.username,
    displayName: account.displayName || account.username,
    avatar: account.avatar || '',
    role: account.role || 'Ciudadano',
    createdAt: account.createdAt || 0,
    dni: account.dni || '',
    citizenName: account.citizenName || '',
    robloxUsername: account.robloxUsername || '',
    robloxId: account.robloxId || '',
    robloxDisplayName: account.robloxDisplayName || '',
    licenseStatus: license.label,
    licenseNumber: license.number,
    weaponLicenseStatus: weaponLicense.label,
    weaponLicenseNumber: weaponLicense.number,
  };
}

/**
 * Crea el manejador de cuentas/reseñas.
 *
 * @param {object} opts
 * @param {object} [opts.store]      almacén (store.js). Si falta, usa un archivo.
 * @param {string} [opts.dataDir]    carpeta para el almacén de archivo.
 * @param {(username:string)=>Promise<object|null>} opts.resolveDiscordUser
 * @param {(discordId:string, content:string)=>Promise<any>} opts.sendDiscordDM
 */
function createWebAuth({
  store,
  dataDir,
  resolveDiscordUser,
  resolveRobloxUser,
  sendDiscordDM,
  sendLicenseApplication,
  sendWeaponLicenseApplication,
  sendEmbed,
  isDiscordReady = () => true,
  getDiscordError = () => '',
  getCadSnapshot = () => null,
  getCadUpdatedAt = () => 0,
  cadKey = '',
  log = console.log,
  now = () => Date.now(),
} = {}) {
  const dataStore = store || createFileStore(dataDir);
  const db = { accounts: {}, pending: {}, resets: {}, sessions: {}, reviews: [] };
  let loaded = false;
  let loading = null;
  let lastLoadError = '';

  async function ensureLoaded() {
    if (loaded) return;
    if (!loading) {
      loading = (async () => {
        const data = await dataStore.load();
        db.accounts = {};
        for (const [key, account] of Object.entries(data.accounts || {})) {
          if (account && account.username) db.accounts[normalizeUsername(key)] = account;
        }
        db.sessions = data.sessions && typeof data.sessions === 'object' ? { ...data.sessions } : {};
        db.reviews = Array.isArray(data.reviews) ? data.reviews.slice() : [];

        // Sesiones vencidas: se quitan de memoria y del almacén.
        const t = now();
        for (const [hash, session] of Object.entries(db.sessions)) {
          if (!session || session.expires < t) {
            delete db.sessions[hash];
            Promise.resolve(dataStore.deleteSession(hash)).catch(() => {});
          }
        }
        loaded = true;
      })().catch((err) => {
        lastLoadError = (err && err.message) || String(err);
        loading = null;
        throw err;
      });
    }
    return loading;
  }

  const lastCodeAt = new Map();
  const lastReviewAt = new Map();

  // ============================================================
  // Panel de Ciudadano: datos del CAD
  // ============================================================
  // El CAD envía un espejo de sus registros al bot (POST /cad/snapshot).
  // Para la web no guardamos una copia aparte: consultamos ese espejo
  // cada vez, así el panel muestra siempre lo último que sabe el CAD.

  function cadSnapshotSafe() {
    try { return getCadSnapshot() || null; } catch { return null; }
  }

  function cadUpdatedAtSafe() {
    try { return Number(getCadUpdatedAt()) || 0; } catch { return 0; }
  }

  function findPersonsByDni(snapshot, dni) {
    const q = normalizeDni(dni);
    if (!snapshot || !q) return [];
    return (snapshot.persons || []).filter((p) => normalizeDni(p && p.dni) === q);
  }

  function buildCitizenProfile(snapshot, person) {
    const snap = snapshot || {};
    const ownerName = String(person && person.name || '');
    const sameOwner = (value) => sameCitizenName(value, ownerName);

    const fines = (snap.fines || [])
      .filter((f) => f && sameOwner(f.person))
      .map((f) => ({
        id: String(f.id || ''),
        amount: Math.max(0, Number(f.amount) || 0),
        reason: String(f.reason || ''),
        officer: String(f.officer || ''),
        status: String(f.status || 'pendiente'),
        ts: Number(f.ts) || 0,
      }))
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 100);

    const warrants = (snap.warrants || [])
      .filter((w) => w && sameOwner(w.person))
      .map((w) => ({
        id: String(w.id || ''),
        wkind: String(w.wkind || 'Orden'),
        reason: String(w.reason || ''),
        officer: String(w.officer || ''),
        status: String(w.status || 'activa'),
        ts: Number(w.ts) || 0,
      }))
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 100);

    const vehicles = (snap.vehicles || [])
      .filter((v) => v && sameOwner(v.owner))
      .map((v) => ({
        id: String(v.id || ''),
        plate: String(v.plate || ''),
        model: String(v.model || ''),
        color: String(v.color || ''),
        status: String(v.status || 'Normal'),
        notes: String(v.notes || ''),
      }))
      .sort((a, b) => a.plate.localeCompare(b.plate))
      .slice(0, 100);

    const pendingFines = fines.filter((f) => normalizeName(f.status) !== 'pagada');
    const activeWarrants = warrants.filter((w) => normalizeName(w.status) === 'activa');

    return {
      dni: String(person.dni || ''),
      name: ownerName,
      dob: String(person.dob || ''),
      age: ageFromDob(person.dob),
      source: 'cad',
      sex: String(person.sex || ''),
      hair: String(person.hair || ''),
      eyes: String(person.eyes || ''),
      heightCm: Number(person.heightCm) || 0,
      weightKg: Number(person.weightKg) || 0,
      address: String(person.address || ''),
      city: String(person.city || ''),
      state: String(person.state || 'CA'),
      zip: String(person.zip || ''),
      issueDate: String(person.issueDate || ''),
      expires: String(person.expires || ''),
      robloxUsername: String(person.robloxUsername || ''),
      notes: String(person.notes || ''),
      fines,
      warrants,
      vehicles,
      totals: {
        fines: pendingFines.length,
        finesAmount: pendingFines.reduce((sum, f) => sum + f.amount, 0),
        warrants: activeWarrants.length,
        vehicles: vehicles.length,
      },
    };
  }

  function prunePending() {
    const t = now();
    for (const [key, p] of Object.entries(db.pending)) {
      if (!p || p.expires < t) delete db.pending[key];
    }
    for (const [key, p] of Object.entries(db.resets)) {
      if (!p || p.expires < t) delete db.resets[key];
    }
  }

  async function createSession(account) {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(token);
    const session = {
      username: normalizeUsername(account.username),
      expires: now() + SESSION_TTL,
      createdAt: now(),
    };
    db.sessions[tokenHash] = session;
    try {
      await dataStore.putSession(tokenHash, session);
    } catch (err) {
      // La sesión funciona en memoria aunque falle el guardado.
      log('[Web] No se pudo guardar la sesión:', err.message);
    }
    return token;
  }

  function accountFromReq(req) {
    const header = String(req.headers.authorization || '');
    const match = header.match(/^Bearer\s+([a-f0-9]{64})$/i);
    if (!match) return null;
    const tokenHash = hashToken(match[1].toLowerCase());
    const session = db.sessions[tokenHash];
    if (!session) return null;
    if (session.expires < now()) {
      delete db.sessions[tokenHash];
      Promise.resolve(dataStore.deleteSession(tokenHash)).catch(() => {});
      return null;
    }
    const account = db.accounts[normalizeUsername(session.username)];
    if (!account) return null;
    return { account, token: match[1], tokenHash };
  }

  async function dmCode(discordId, code, kind) {
    const action = kind === 'reset' ? 'recuperar tu contraseña' : 'crear tu cuenta';
    const content = [
      '🛡️ **La Realidad RP · Panel de Ciudadano**',
      '',
      `Tu código para ${action} es: **${code}**`,
      '',
      '⏳ Vence en 10 minutos. Si no fuiste vos, ignorá este mensaje.',
    ].join('\n');
    if (typeof sendDiscordDM !== 'function') {
      throw httpError(503, 'El bot de Discord todavía no está conectado. Probá en unos minutos.');
    }
    try {
      await sendDiscordDM(discordId, content);
    } catch (err) {
      log('[Web] No se pudo enviar el MD:', err.message);
      throw httpError(502, 'No pude enviarte el mensaje privado. Revisá que tengas los MD abiertos y que estés en el Discord.');
    }
  }

  function newCode() {
    return String(crypto.randomInt(100000, 1000000));
  }

  function checkCooldown(key) {
    const last = lastCodeAt.get(key) || 0;
    const left = CODE_COOLDOWN - (now() - last);
    if (left > 0) {
      throw httpError(429, `Esperá ${Math.ceil(left / 1000)} segundos para pedir otro código.`);
    }
  }

  async function resolveUser(query) {
    if (typeof resolveDiscordUser !== 'function') return null;
    try {
      return await resolveDiscordUser(query);
    } catch (err) {
      log('[Web] Error buscando el usuario en Discord:', err.message);
      throw httpError(502, 'No pude consultar Discord. Probá de nuevo en unos minutos.');
    }
  }

  async function resolveRoblox(username) {
    const name = normalizeRoblox(username);
    if (!ROBLOX_RE.test(name)) {
      throw httpError(400, 'Escribí tu usuario de Roblox (3 a 20 letras, números o guiones bajos).');
    }
    if (typeof resolveRobloxUser !== 'function') {
      return { id: '', username: name, displayName: name };
    }
    try {
      const found = await resolveRobloxUser(name);
      if (!found) throw httpError(404, 'No encontré ese usuario en Roblox. Revisá cómo se escribe.');
      return {
        id: found.id ? String(found.id) : '',
        username: cleanText(found.username || name, 20),
        displayName: cleanText(found.displayName || found.username || name, 60),
      };
    } catch (err) {
      if (err.status) throw err;
      log('[Web] Error consultando Roblox:', err.message);
      // Si Roblox está caído, no bloqueamos el registro: guardamos el nombre
      // escrito por el usuario y se puede verificar más adelante.
      return { id: '', username: name, displayName: name };
    }
  }

  function applyLicense(profile, account) {
    const lic = licensePublic(account);
    profile.license = lic.number;
    profile.licStatus = lic.label;
    profile.licenseInfo = lic;
    const weapon = weaponLicensePublic(account);
    profile.weaponLicense = weapon.number;
    profile.weaponLicenseStatus = weapon.label;
    profile.weaponLicenseInfo = weapon;
    return profile;
  }

  // ---------------- Registro ----------------
  async function register(body) {
    const usernameInput = normalizeUsername(body.username);
    const password = String(body.password || '');

    if (!USERNAME_RE.test(usernameInput)) {
      throw httpError(400, 'Escribí tu usuario de Discord (2 a 32 letras, números, puntos o guiones bajos).');
    }
    if (password.length < 6) throw httpError(400, 'La contraseña debe tener al menos 6 caracteres.');
    if (password.length > 100) throw httpError(400, 'La contraseña es demasiado larga.');

    if (db.accounts[usernameInput]) {
      throw httpError(409, 'Ese usuario ya tiene cuenta. Iniciá sesión o recuperá tu contraseña.');
    }
    checkCooldown('reg:' + usernameInput);

    const du = await resolveUser(usernameInput);
    if (!du || !du.username) {
      throw httpError(404, 'No encontré ese usuario en el Discord. Entrá al servidor primero y revisá el nombre.');
    }
    const username = normalizeUsername(du.username);
    if (!USERNAME_RE.test(username)) throw httpError(500, 'El usuario de Discord tiene un formato no soportado.');
    if (db.accounts[username]) {
      throw httpError(409, 'Ese usuario ya tiene cuenta. Iniciá sesión o recuperá tu contraseña.');
    }

    const roblox = await resolveRoblox(body.robloxUsername);
    const salt = crypto.randomBytes(16).toString('hex');
    const code = newCode();
    db.pending[username] = {
      username,
      displayName: cleanText(du.displayName || du.username, 60),
      avatar: String(du.avatar || '').slice(0, 500),
      discordId: String(du.id || ''),
      robloxUsername: roblox.username,
      robloxId: roblox.id,
      robloxDisplayName: roblox.displayName,
      salt,
      hash: hashPassword(password, salt),
      codeHash: hashCode(username, code),
      expires: now() + CODE_TTL,
      tries: 0,
      createdAt: now(),
    };
    lastCodeAt.set('reg:' + usernameInput, now());
    lastCodeAt.set('reg:' + username, now());

    await dmCode(du.id, code, 'register');
    return { ok: true, pending: true, username, message: 'Te envié un código por MD de Discord.' };
  }

  // ---------------- Verificar registro ----------------
  async function verify(body) {
    const username = normalizeUsername(body.username);
    const code = String(body.code || '').replace(/\D/g, '');

    const p = db.pending[username];
    if (!p) throw httpError(400, 'El código venció o no pediste uno. Volvé a empezar.');
    if (p.expires < now()) {
      delete db.pending[username];
      throw httpError(400, 'El código venció. Pedí uno nuevo.');
    }
    p.tries = (p.tries || 0) + 1;
    if (p.tries > MAX_CODE_TRIES) {
      delete db.pending[username];
      throw httpError(429, 'Demasiados intentos. Volvé a empezar.');
    }
    if (code.length !== 6 || !safeEqualHex(p.codeHash, hashCode(username, code))) {
      throw httpError(400, 'Código incorrecto. Revisá el MD del bot.');
    }

    const account = {
      username: p.username,
      displayName: p.displayName || p.username,
      avatar: p.avatar || '',
      discordId: p.discordId || '',
      robloxUsername: p.robloxUsername || '',
      robloxId: p.robloxId || '',
      robloxDisplayName: p.robloxDisplayName || p.robloxUsername || '',
      role: 'Ciudadano',
      salt: p.salt,
      hash: p.hash,
      createdAt: now(),
      verifiedAt: now(),
    };

    try {
      await dataStore.putAccount(account);
    } catch (err) {
      log('[Web] No se pudo guardar la cuenta:', err.message);
      throw httpError(503, 'No se pudo guardar la cuenta en el servidor. Probá de nuevo en unos segundos.');
    }

    db.accounts[username] = account;
    delete db.pending[username];
    const token = await createSession(account);
    log(`[Web] Cuenta creada: @${username}`);
    return { ok: true, token, user: publicUser(account) };
  }

  // ---------------- Login ----------------
  async function login(body) {
    const username = normalizeUsername(body.username);
    const password = String(body.password || '');
    const account = db.accounts[username];
    if (!account || !password || password.length > 100) {
      throw httpError(401, 'Usuario o contraseña incorrectos.');
    }
    const candidate = hashPassword(password, account.salt);
    if (!safeEqualHex(candidate, account.hash)) {
      throw httpError(401, 'Usuario o contraseña incorrectos.');
    }

    // Las cuentas viejas no tienen Roblox: se completa una sola vez al
    // iniciar sesión. Si ya está guardado, el campo es opcional y solo se
    // usa para comprobar que no sea otra persona.
    const robloxInput = normalizeRoblox(body.robloxUsername);
    if (!account.robloxUsername) {
      const roblox = await resolveRoblox(robloxInput);
      const previous = {
        robloxUsername: account.robloxUsername,
        robloxId: account.robloxId,
        robloxDisplayName: account.robloxDisplayName,
      };
      account.robloxUsername = roblox.username;
      account.robloxId = roblox.id;
      account.robloxDisplayName = roblox.displayName;
      try {
        await dataStore.putAccount(account);
      } catch (err) {
        Object.assign(account, previous);
        log('[Web] No se pudo guardar el usuario de Roblox:', err.message);
        throw httpError(503, 'No se pudo guardar tu usuario de Roblox. Probá de nuevo.');
      }
    } else if (robloxInput && robloxInput.toLowerCase() !== String(account.robloxUsername).toLowerCase()) {
      throw httpError(401, 'El usuario de Roblox no coincide con el de tu cuenta.');
    }

    const token = await createSession(account);

    // Actualizar avatar/nombre en segundo plano (si cambió en Discord)
    if (typeof resolveDiscordUser === 'function') {
      Promise.resolve().then(() => resolveDiscordUser(account.username)).then((du) => {
        if (!du || (du.id && account.discordId && String(du.id) !== String(account.discordId))) return;
        const avatar = String(du.avatar || '');
        const displayName = cleanText(du.displayName || du.username, 60);
        let changed = false;
        if (avatar && avatar !== account.avatar) { account.avatar = avatar; changed = true; }
        if (displayName && displayName !== account.displayName) { account.displayName = displayName; changed = true; }
        if (changed) dataStore.putAccount(account).catch(() => {});
      }).catch(() => {});
    }

    return { ok: true, token, user: publicUser(account) };
  }

  // ---------------- Recuperar contraseña ----------------
  async function resetRequest(body) {
    const username = normalizeUsername(body.username);
    if (!USERNAME_RE.test(username)) {
      throw httpError(400, 'Escribí tu usuario de Discord.');
    }
    checkCooldown('reset:' + username);

    const account = db.accounts[username];
    // No revelamos si existe o no.
    if (!account) {
      lastCodeAt.set('reset:' + username, now());
      return { ok: true, message: 'Si el usuario existe, te enviamos un código por MD.' };
    }

    const code = newCode();
    db.resets[username] = {
      username,
      codeHash: hashCode(username, code),
      expires: now() + CODE_TTL,
      tries: 0,
      createdAt: now(),
    };
    lastCodeAt.set('reset:' + username, now());

    await dmCode(account.discordId, code, 'reset');
    return { ok: true, message: 'Te envié un código por MD de Discord.' };
  }

  async function resetConfirm(body) {
    const username = normalizeUsername(body.username);
    const code = String(body.code || '').replace(/\D/g, '');
    const password = String(body.password || '');

    if (password.length < 6) throw httpError(400, 'La contraseña nueva debe tener al menos 6 caracteres.');
    if (password.length > 100) throw httpError(400, 'La contraseña es demasiado larga.');

    const p = db.resets[username];
    if (!p) throw httpError(400, 'El código venció o no pediste uno. Volvé a empezar.');
    if (p.expires < now()) {
      delete db.resets[username];
      throw httpError(400, 'El código venció. Pedí uno nuevo.');
    }
    p.tries = (p.tries || 0) + 1;
    if (p.tries > MAX_CODE_TRIES) {
      delete db.resets[username];
      throw httpError(429, 'Demasiados intentos. Volvé a empezar.');
    }
    if (code.length !== 6 || !safeEqualHex(p.codeHash, hashCode(username, code))) {
      throw httpError(400, 'Código incorrecto. Revisá el MD del bot.');
    }

    const account = db.accounts[username];
    if (!account) {
      delete db.resets[username];
      throw httpError(404, 'Ese usuario no existe.');
    }

    const oldSalt = account.salt;
    const oldHash = account.hash;
    account.salt = crypto.randomBytes(16).toString('hex');
    account.hash = hashPassword(password, account.salt);
    account.passwordChangedAt = now();

    try {
      await dataStore.putAccount(account);
    } catch (err) {
      account.salt = oldSalt;
      account.hash = oldHash;
      log('[Web] No se pudo guardar la contraseña nueva:', err.message);
      throw httpError(503, 'No se pudo guardar la contraseña en el servidor. Probá de nuevo.');
    }

    delete db.resets[username];

    // Cerrar todas las sesiones anteriores de esa cuenta
    for (const [hash, session] of Object.entries(db.sessions)) {
      if (normalizeUsername(session.username) === username) {
        delete db.sessions[hash];
        Promise.resolve(dataStore.deleteSession(hash)).catch(() => {});
      }
    }

    const token = await createSession(account);
    log(`[Web] Contraseña recuperada: @${username}`);
    return { ok: true, token, user: publicUser(account) };
  }

  // ---------------- Panel de Ciudadano ----------------
  function requireSession(req) {
    const session = accountFromReq(req);
    if (!session) throw httpError(401, 'Sesión vencida. Iniciá sesión de nuevo.');
    return session;
  }

  function restoreCitizenFields(account, previous) {
    for (const key of ['dni', 'citizenName', 'citizenLinkedAt', 'webCitizen']) {
      if (previous[key] === undefined) delete account[key];
      else account[key] = previous[key];
    }
  }

  function citizenBase(account) {
    return {
      ok: true,
      linked: !!account.dni,
      dni: account.dni || '',
      name: account.citizenName || '',
      user: publicUser(account),
      canUnlink: !account.webCitizen,
      cadReady: !!cadSnapshotSafe(),
      cadUpdatedAt: cadUpdatedAtSafe(),
      serverNow: now(),
    };
  }

  function citizenDirectory(req) {
    const expected = String(cadKey || '');
    if (!expected) throw httpError(503, 'El CAD_KEY del bot no está configurado.');
    const received = String(req.headers['x-cad-key'] || '');
    if (received !== expected) throw httpError(401, 'Clave del CAD incorrecta.');

    const citizens = [];
    for (const account of Object.values(db.accounts)) {
      const web = account && account.webCitizen;
      if (!web || !web.dni || !web.name) continue;
      citizens.push({
        dni: String(web.dni),
        name: String(web.name),
        firstName: String(web.firstName || ''),
        lastName: String(web.lastName || ''),
        dob: String(web.dob || ''),
        age: Number(web.age) || ageFromDob(web.dob),
        sex: String(web.sex || ''),
        hair: String(web.hair || ''),
        eyes: String(web.eyes || ''),
        heightCm: Number(web.heightCm) || 0,
        weightKg: Number(web.weightKg) || 0,
        address: String(web.address || ''),
        city: String(web.city || ''),
        state: String(web.state || 'CA'),
        zip: String(web.zip || ''),
        issueDate: String(web.issueDate || ''),
        expires: String(web.expires || ''),
        robloxUsername: String(web.robloxUsername || ''),
        createdAt: Number(web.createdAt) || 0,
        source: 'web',
      });
    }
    citizens.sort((a, b) => b.createdAt - a.createdAt);
    return { ok: true, citizens, count: citizens.length, serverNow: now() };
  }

  function buildWebCitizenProfile(webCitizen, snapshot) {
    const person = {
      name: webCitizen.name,
      dni: webCitizen.dni,
      dob: webCitizen.dob,
      sex: webCitizen.sex || '',
      hair: webCitizen.hair || '',
      eyes: webCitizen.eyes || '',
      heightCm: webCitizen.heightCm || 0,
      weightKg: webCitizen.weightKg || 0,
      address: webCitizen.address || '',
      city: webCitizen.city || '',
      state: webCitizen.state || 'CA',
      zip: webCitizen.zip || '',
      issueDate: webCitizen.issueDate || '',
      expires: webCitizen.expires || '',
      robloxUsername: webCitizen.robloxUsername || '',
      notes: webCitizen.notes || '',
    };
    const profile = buildCitizenProfile(snapshot || {}, person);
    profile.dni = webCitizen.dni;
    profile.name = webCitizen.name;
    profile.dob = webCitizen.dob;
    profile.age = Number(webCitizen.age) || ageFromDob(webCitizen.dob);
    profile.source = 'web';
    return profile;
  }

  async function citizenMe(req) {
    const { account } = requireSession(req);
    const base = citizenBase(account);
    if (!account.dni) return base;

    const snapshot = cadSnapshotSafe();
    const webCitizen = account.webCitizen;
    if (!snapshot) {
      if (webCitizen) {
        return {
          ...base,
          citizen: applyLicense(buildWebCitizenProfile(webCitizen, null), account),
          source: 'web',
          cadMissing: true,
        };
      }
      return { ...base, waiting: true };
    }

    const matches = findPersonsByDni(snapshot, account.dni);
    const person = matches.find((p) => sameCitizenName(p.name, account.citizenName));
    // Si el DNI existe pero el nombre cambió, no mostramos el registro de otra
    // persona: pedimos volver a vincular para confirmar la identidad.
    if (!person) {
      if (webCitizen) {
        return {
          ...base,
          citizen: applyLicense(buildWebCitizenProfile(webCitizen, snapshot), account),
          source: 'web',
          cadMissing: true,
        };
      }
      return { ...base, missing: true };
    }

    return {
      ...base,
      dni: String(person.dni || account.dni),
      name: String(person.name || account.citizenName || ''),
      source: 'cad',
      citizen: applyLicense(buildCitizenProfile(snapshot, person), account),
    };
  }

  async function citizenCreate(req, body) {
    const { account } = requireSession(req);
    if (account.dni) throw httpError(409, 'Ya tenés un DNI vinculado. Desvinculalo desde Ajustes antes de crear otro.');
    if (account.webCitizen) throw httpError(409, 'Ya creaste tu DNI en el panel. Ese DNI queda asociado a tu cuenta.');

    const firstName = cleanText(body.firstName, 40);
    const lastName = cleanText(body.lastName, 40);
    const dob = String(body.dob == null ? '' : body.dob).trim();
    const sex = String(body.sex == null ? '' : body.sex).trim().toUpperCase();
    const hair = cleanText(body.hair, 30);
    const eyes = cleanText(body.eyes, 30);
    const heightCm = Math.round(Number(body.heightCm));
    const weightKg = Math.round(Number(body.weightKg) * 10) / 10;
    const address = cleanText(body.address, 120);
    const city = cleanText(body.city || 'Los Angeles', 60);
    const zip = String(body.zip == null ? '' : body.zip).replace(/\s+/g, '');
    const nameRe = /^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/;
    const shortTextRe = /^[A-Za-zÀ-ÖØ-öø-ÿ0-9' .-]+$/;

    if (firstName.length < 2 || !nameRe.test(firstName)) {
      throw httpError(400, 'Escribí tu nombre (mínimo 2 letras, sin números).');
    }
    if (lastName.length < 2 || !nameRe.test(lastName)) {
      throw httpError(400, 'Escribí tu apellido (mínimo 2 letras, sin números).');
    }
    if (!parseDob(dob)) throw httpError(400, 'Elegí una fecha de nacimiento válida.');

    const age = ageFromDob(dob, now());
    if (age < 0 || age > 120) throw httpError(400, 'La fecha de nacimiento no es válida.');

    if (!['M', 'F', 'X'].includes(sex)) {
      throw httpError(400, 'Elegí tu sexo como figura en el DNI (M, F o X).');
    }
    if (hair.length < 2 || !shortTextRe.test(hair)) {
      throw httpError(400, 'Escribí el color de tu cabello (mínimo 2 letras).');
    }
    if (eyes.length < 2 || !shortTextRe.test(eyes)) {
      throw httpError(400, 'Escribí el color de tus ojos (mínimo 2 letras).');
    }
    if (!Number.isInteger(heightCm) || heightCm < 120 || heightCm > 230) {
      throw httpError(400, 'La altura debe estar entre 120 y 230 cm.');
    }
    if (!Number.isFinite(weightKg) || weightKg < 30 || weightKg > 250) {
      throw httpError(400, 'El peso debe estar entre 30 y 250 kg.');
    }
    if (address.length < 5 || address.length > 120) {
      throw httpError(400, 'Escribí tu dirección (calle y número, mínimo 5 caracteres).');
    }
    if (city.length < 2 || !shortTextRe.test(city)) {
      throw httpError(400, 'Escribí tu ciudad.');
    }
    if (!/^\d{5}$/.test(zip)) {
      throw httpError(400, 'El código postal debe tener 5 números (ej: 90001).');
    }

    const name = firstName + ' ' + lastName;
    const taken = new Set();
    for (const other of Object.values(db.accounts)) {
      if (!other) continue;
      if (other.dni) taken.add(normalizeDni(other.dni));
      if (other.webCitizen && other.webCitizen.dni) taken.add(normalizeDni(other.webCitizen.dni));
    }
    // También evitamos chocar con un DNI que el staff ya haya cargado en el CAD.
    const snapshot = cadSnapshotSafe();
    if (snapshot) {
      for (const person of snapshot.persons || []) {
        if (person && person.dni) taken.add(normalizeDni(person.dni));
      }
    }
    const dni = generateDni(taken);

    const issuedOn = new Date(now());
    const issueDate = issuedOn.toISOString().slice(0, 10);
    const expiresOn = new Date(issuedOn);
    expiresOn.setUTCFullYear(expiresOn.getUTCFullYear() + 4);
    const expiresDate = expiresOn.toISOString().slice(0, 10);

    const webCitizen = {
      dni,
      firstName,
      lastName,
      name,
      dob,
      age,
      sex,
      hair,
      eyes,
      heightCm,
      weightKg,
      address,
      city,
      state: 'CA',
      zip,
      issueDate,
      expires: expiresDate,
      robloxUsername: account.robloxUsername || '',
      notes: '',
      source: 'web',
      createdAt: now(),
    };

    const previous = {
      dni: account.dni,
      citizenName: account.citizenName,
      citizenLinkedAt: account.citizenLinkedAt,
      webCitizen: account.webCitizen,
    };
    account.webCitizen = webCitizen;
    account.dni = dni;
    account.citizenName = name;
    account.citizenLinkedAt = now();

    try {
      await dataStore.putAccount(account);
    } catch (err) {
      restoreCitizenFields(account, previous);
      log('[Web] No se pudo crear el DNI:', err.message);
      throw httpError(503, 'No se pudo guardar el DNI en el servidor. Probá de nuevo en unos segundos.');
    }

    log(`[Web] DNI ${dni} creado desde el panel por @${account.username}`);
    if (sendEmbed) {
      await sendEmbed(cfg.channels.panel, {
        color: 0x8052ff,
        title: '📝 Nuevo Registro de Ciudadano',
        lines: [
          `**Nombre:** ${name}`,
          `**DNI:** ${dni}`,
          `**Discord:** @${account.username}`,
          `**Estado:** Creado exitosamente desde el panel.`
        ]
      }, '[REGISTRO]');
    }
    return {
      ...citizenBase(account),
      source: 'web',
      cadMissing: !cadSnapshotSafe(),
      citizen: applyLicense(buildWebCitizenProfile(webCitizen, cadSnapshotSafe()), account),
    };
  }

  async function citizenLink(req, body) {
    const { account } = requireSession(req);
    if (account.webCitizen) throw httpError(409, 'Tu DNI fue creado en el panel. No hace falta vincularlo de nuevo.');
    const dniInput = cleanText(body.dni, 40);
    const nameInput = cleanText(body.name, 80);
    const dni = normalizeDni(dniInput);

    if (dni.length < 3) throw httpError(400, 'Escribí tu DNI (mínimo 3 caracteres).');
    if (nameInput.length < 2) throw httpError(400, 'Escribí tu nombre completo tal como figura en el CAD.');

    const snapshot = cadSnapshotSafe();
    if (!snapshot) {
      throw httpError(503, 'El CAD todavía no envió datos. Abrí la app del CAD, esperá unos segundos y probá de nuevo.');
    }

    const matches = findPersonsByDni(snapshot, dni);
    if (!matches.length) {
      throw httpError(404, 'No encontré ese DNI en los registros del CAD. Revisalo o pedile al staff que te registre.');
    }

    const person = matches.find((p) => sameCitizenName(p.name, nameInput));
    if (!person) {
      throw httpError(404, 'El DNI existe, pero el nombre no coincide con el registro del CAD.');
    }

    if (account.dni && normalizeDni(account.dni) !== normalizeDni(person.dni || dniInput)) {
      throw httpError(409, 'Ya tenés un DNI vinculado. Desvinculalo desde Ajustes antes de vincular otro.');
    }

    const normalizedPersonDni = normalizeDni(person.dni || dniInput);
    for (const [key, other] of Object.entries(db.accounts)) {
      if (!other || other.username === account.username) continue;
      if (normalizeDni(other.dni) === normalizedPersonDni) {
        throw httpError(409, 'Ese DNI ya está vinculado a otra cuenta. Si es un error, hablá con el staff.');
      }
    }

    const previous = {
      dni: account.dni,
      citizenName: account.citizenName,
      citizenLinkedAt: account.citizenLinkedAt,
    };
    account.dni = String(person.dni || dniInput).trim();
    account.citizenName = String(person.name || nameInput).trim();
    account.citizenLinkedAt = now();

    try {
      await dataStore.putAccount(account);
    } catch (err) {
      restoreCitizenFields(account, previous);
      log('[Web] No se pudo vincular el DNI:', err.message);
      throw httpError(503, 'No se pudo guardar el DNI en el servidor. Probá de nuevo en unos segundos.');
    }

    log(`[Web] DNI ${account.dni} vinculado a @${account.username}`);
    return {
      ...citizenBase(account),
      citizen: applyLicense(buildCitizenProfile(snapshot, person), account),
    };
  }

  async function citizenUnlink(req) {
    const { account } = requireSession(req);
    if (!account.dni) return { ok: true, user: publicUser(account) };
    if (account.webCitizen) {
      throw httpError(409, 'Tu DNI fue creado en el panel y queda asociado a tu cuenta. Si necesitás cambiarlo, hablá con el staff.');
    }

    const previous = {
      dni: account.dni,
      citizenName: account.citizenName,
      citizenLinkedAt: account.citizenLinkedAt,
    };
    delete account.dni;
    delete account.citizenName;
    delete account.citizenLinkedAt;

    try {
      await dataStore.putAccount(account);
    } catch (err) {
      restoreCitizenFields(account, previous);
      log('[Web] No se pudo desvincular el DNI:', err.message);
      throw httpError(503, 'No se pudo desvincular el DNI. Probá de nuevo en unos segundos.');
    }

    log(`[Web] DNI desvinculado de @${account.username}`);
    return { ok: true, user: publicUser(account) };
  }

  // ---------------- Licencia de conducir ----------------
  function buildLicenseApplication(account, body) {
    const experience = cleanText(body.experience, 20);
    const vehicleType = cleanText(body.vehicleType, 20);
    const rulesRaw = cleanText(body.trafficRules, 8);
    const trafficRules = /^s[ií]$/i.test(rulesRaw) ? 'Sí' : /^no$/i.test(rulesRaw) ? 'No' : '';
    const reason = cleanMultiline(body.reason, 800);

    if (!LICENSE_EXPERIENCE.includes(experience)) {
      throw httpError(400, 'Elegí tu experiencia manejando.');
    }
    if (!LICENSE_VEHICLES.includes(vehicleType)) {
      throw httpError(400, 'Elegí qué tipo de vehículo querés manejar.');
    }
    if (!trafficRules) {
      throw httpError(400, 'Indicá si conocés las normas de tránsito.');
    }
    if (reason.length < 20) {
      throw httpError(400, 'Contanos por qué querés la licencia (mínimo 20 caracteres).');
    }
    if (body.confirm !== true && body.confirm !== 'true' && body.confirm !== 'on') {
      throw httpError(400, 'Confirmá que los datos son correctos y que la licencia es de roleplay.');
    }

    return {
      username: account.username,
      displayName: account.displayName || account.username,
      discordId: account.discordId || '',
      name: account.citizenName || (account.webCitizen && account.webCitizen.name) || '',
      dni: account.dni || '',
      robloxUsername: account.robloxUsername || '',
      experience,
      vehicleType,
      trafficRules,
      reason,
      submittedAt: now(),
    };
  }

  async function citizenLicenseApply(req, body) {
    const { account } = requireSession(req);
    if (!account.dni) {
      throw httpError(400, 'Primero creá o vinculá tu DNI. La licencia se solicita después.');
    }

    const current = account.license;
    if (current && current.status === 'pending') {
      throw httpError(409, 'Tu solicitud ya está en revisión. Esperá la respuesta de los moderadores.');
    }
    if (current && current.status === 'approved') {
      throw httpError(409, 'Ya tenés una licencia aprobada. Si necesitás renovarla, hablá con el staff.');
    }
    if (current && (current.status === 'suspended' || current.status === 'revoked')) {
      throw httpError(409, 'Tu licencia no está habilitada. Hablá con el staff para regularizar tu situación.');
    }

    const application = buildLicenseApplication(account, body);
    if (typeof sendLicenseApplication !== 'function') {
      throw httpError(503, 'El canal de licencias del staff todavía no está configurado. Avisá a un moderador.');
    }

    let sent = null;
    try {
      sent = await sendLicenseApplication(application);
    } catch (err) {
      log('[Web] No se pudo enviar la solicitud de licencia:', err.message);
      throw httpError(502, 'No pude enviar la solicitud al canal de mods. Probá de nuevo en unos minutos o avisá al staff.');
    }

    const previous = account.license;
    account.license = {
      status: 'pending',
      application,
      submittedAt: application.submittedAt,
      messageId: sent && sent.id ? String(sent.id) : '',
    };

    try {
      await dataStore.putAccount(account);
    } catch (err) {
      account.license = previous;
      log('[Web] No se pudo guardar la solicitud de licencia:', err.message);
      throw httpError(503, 'No se pudo guardar la solicitud de licencia. Probá de nuevo en unos segundos.');
    }

    log(`[Web] Solicitud de licencia enviada por @${account.username} (DNI ${account.dni})`);
    return {
      ok: true,
      license: licensePublic(account),
      message: 'Solicitud enviada al canal de mods. Te avisamos cuando la revisen.',
    };
  }

  async function reviewLicense(username, decision, reviewer, reason) {
    const key = normalizeUsername(username);
    const account = db.accounts[key];
    if (!account) throw httpError(404, 'No encontré la cuenta del solicitante.');

    const current = account.license;
    if (!current || current.status !== 'pending') {
      throw httpError(409, 'Esa solicitud ya no está pendiente.');
    }

    const approved = decision === 'approve' || decision === 'approved';
    const rejected = decision === 'reject' || decision === 'rejected';
    if (!approved && !rejected) throw httpError(400, 'Decisión de licencia inválida.');

    const reviewedAt = now();
    const previous = current;
    const reviewerName = cleanText(
      reviewer && (reviewer.displayName || reviewer.username || (reviewer.id ? 'Moderador ' + reviewer.id : '')) || 'Staff',
      60
    ) || 'Staff';

    if (approved) {
      const taken = new Set();
      for (const other of Object.values(db.accounts)) {
        if (other && other.license && other.license.number) taken.add(String(other.license.number));
      }
      const number = generateLicenseNumber(taken);
      account.license = {
        status: 'approved',
        application: current.application || {},
        submittedAt: current.submittedAt || reviewedAt,
        reviewedAt,
        reviewedBy: reviewerName,
        reviewedById: reviewer && reviewer.id ? String(reviewer.id) : '',
        number,
        issuedAt: reviewedAt,
        expiresAt: reviewedAt + LICENSE_TTL,
        rejectionReason: '',
      };
    } else {
      account.license = {
        status: 'rejected',
        application: current.application || {},
        submittedAt: current.submittedAt || reviewedAt,
        reviewedAt,
        reviewedBy: reviewerName,
        reviewedById: reviewer && reviewer.id ? String(reviewer.id) : '',
        rejectionReason: cleanText(reason, 300) || 'Solicitud rechazada por el staff.',
        number: '',
        expiresAt: 0,
      };
    }

    try {
      await dataStore.putAccount(account);
    } catch (err) {
      account.license = previous;
      log('[Web] No se pudo guardar la revisión de licencia:', err.message);
      throw httpError(503, 'No se pudo guardar la revisión de licencia. Probá de nuevo.');
    }

    log(`[Web] Licencia ${approved ? 'aprobada' : 'rechazada'} para @${account.username} por ${reviewerName}`);
    return {
      ok: true,
      decision: approved ? 'approved' : 'rejected',
      username: account.username,
      name: account.citizenName || (account.webCitizen && account.webCitizen.name) || '',
      dni: account.dni || '',
      discordId: account.discordId || '',
      robloxUsername: account.robloxUsername || '',
      application: account.license.application,
      license: licensePublic(account),
    };
  }

  // ---------------- Licencia de armas ----------------
  function buildWeaponLicenseApplication(account, body) {
    const experience = cleanText(body.experience, 20);
    const weaponType = cleanText(body.weaponType, 30);
    const purpose = cleanText(body.purpose, 40);
    const reason = cleanMultiline(body.reason, 800);

    if (!WEAPON_EXPERIENCE.includes(experience)) {
      throw httpError(400, 'Elegí tu experiencia con armas de fuego.');
    }
    if (!WEAPON_TYPES.includes(weaponType)) {
      throw httpError(400, 'Elegí qué tipo de arma querés registrar.');
    }
    if (!WEAPON_PURPOSES.includes(purpose)) {
      throw httpError(400, 'Elegí el uso previsto de la licencia.');
    }
    if (reason.length < 20) {
      throw httpError(400, 'Contanos por qué querés la licencia de armas (mínimo 20 caracteres).');
    }
    if (body.confirm !== true && body.confirm !== 'true' && body.confirm !== 'on') {
      throw httpError(400, 'Confirmá que los datos son correctos, que sos mayor de edad y que la licencia es de roleplay.');
    }

    return {
      username: account.username,
      displayName: account.displayName || account.username,
      discordId: account.discordId || '',
      name: account.citizenName || (account.webCitizen && account.webCitizen.name) || '',
      dni: account.dni || '',
      robloxUsername: account.robloxUsername || '',
      experience,
      weaponType,
      purpose,
      reason,
      submittedAt: now(),
    };
  }

  async function citizenWeaponLicenseApply(req, body) {
    const { account } = requireSession(req);
    if (!account.dni) {
      throw httpError(400, 'Primero creá o vinculá tu DNI. La licencia de armas se solicita después.');
    }

    const current = account.weaponLicense;
    if (current && current.status === 'pending') {
      throw httpError(409, 'Tu solicitud de licencia de armas ya está en revisión.');
    }
    if (current && current.status === 'approved') {
      throw httpError(409, 'Ya tenés una licencia de armas aprobada. Si necesitás renovarla, hablá con el staff.');
    }
    if (current && (current.status === 'suspended' || current.status === 'revoked')) {
      throw httpError(409, 'Tu licencia de armas no está habilitada. Hablá con el staff para regularizar tu situación.');
    }

    const application = buildWeaponLicenseApplication(account, body);
    if (typeof sendWeaponLicenseApplication !== 'function') {
      throw httpError(503, 'El canal de licencias del staff todavía no está configurado. Avisá a un moderador.');
    }

    let sent = null;
    try {
      sent = await sendWeaponLicenseApplication(application);
    } catch (err) {
      log('[Web] No se pudo enviar la solicitud de licencia de armas:', err.message);
      throw httpError(502, 'No pude enviar la solicitud al canal de mods. Probá de nuevo en unos minutos o avisá al staff.');
    }

    const previous = account.weaponLicense;
    account.weaponLicense = {
      status: 'pending',
      application,
      submittedAt: application.submittedAt,
      messageId: sent && sent.id ? String(sent.id) : '',
    };

    try {
      await dataStore.putAccount(account);
    } catch (err) {
      account.weaponLicense = previous;
      log('[Web] No se pudo guardar la solicitud de licencia de armas:', err.message);
      throw httpError(503, 'No se pudo guardar la solicitud de licencia de armas. Probá de nuevo en unos segundos.');
    }

    log(`[Web] Solicitud de licencia de armas enviada por @${account.username} (DNI ${account.dni})`);
    return {
      ok: true,
      weaponLicense: weaponLicensePublic(account),
      message: 'Solicitud de licencia de armas enviada al canal de mods. Te avisamos cuando la revisen.',
    };
  }

  async function reviewWeaponLicense(username, decision, reviewer, reason) {
    const key = normalizeUsername(username);
    const account = db.accounts[key];
    if (!account) throw httpError(404, 'No encontré la cuenta del solicitante.');

    const current = account.weaponLicense;
    if (!current || current.status !== 'pending') {
      throw httpError(409, 'Esa solicitud de licencia de armas ya no está pendiente.');
    }

    const approved = decision === 'approve' || decision === 'approved';
    const rejected = decision === 'reject' || decision === 'rejected';
    if (!approved && !rejected) throw httpError(400, 'Decisión de licencia de armas inválida.');

    const reviewedAt = now();
    const previous = current;
    const reviewerName = cleanText(
      reviewer && (reviewer.displayName || reviewer.username || (reviewer.id ? 'Moderador ' + reviewer.id : '')) || 'Staff',
      60
    ) || 'Staff';

    if (approved) {
      const taken = new Set();
      for (const other of Object.values(db.accounts)) {
        if (other && other.weaponLicense && other.weaponLicense.number) taken.add(String(other.weaponLicense.number));
      }
      const number = generateWeaponLicenseNumber(taken);
      account.weaponLicense = {
        status: 'approved',
        application: current.application || {},
        submittedAt: current.submittedAt || reviewedAt,
        reviewedAt,
        reviewedBy: reviewerName,
        reviewedById: reviewer && reviewer.id ? String(reviewer.id) : '',
        number,
        issuedAt: reviewedAt,
        expiresAt: reviewedAt + WEAPON_LICENSE_TTL,
        rejectionReason: '',
      };
    } else {
      account.weaponLicense = {
        status: 'rejected',
        application: current.application || {},
        submittedAt: current.submittedAt || reviewedAt,
        reviewedAt,
        reviewedBy: reviewerName,
        reviewedById: reviewer && reviewer.id ? String(reviewer.id) : '',
        rejectionReason: cleanText(reason, 300) || 'Solicitud de licencia de armas rechazada por el staff.',
        number: '',
        expiresAt: 0,
      };
    }

    try {
      await dataStore.putAccount(account);
    } catch (err) {
      account.weaponLicense = previous;
      log('[Web] No se pudo guardar la revisión de licencia de armas:', err.message);
      throw httpError(503, 'No se pudo guardar la revisión de licencia de armas. Probá de nuevo.');
    }

    log(`[Web] Licencia de armas ${approved ? 'aprobada' : 'rechazada'} para @${account.username} por ${reviewerName}`);
    return {
      ok: true,
      decision: approved ? 'approved' : 'rejected',
      licenseType: 'weapon',
      username: account.username,
      name: account.citizenName || (account.webCitizen && account.webCitizen.name) || '',
      dni: account.dni || '',
      discordId: account.discordId || '',
      robloxUsername: account.robloxUsername || '',
      application: account.weaponLicense.application,
      license: weaponLicensePublic(account),
    };
  }

  // ---------------- Reseñas ----------------
  function getReviews() {
    const list = db.reviews
      .filter((r) => r && typeof r === 'object')
      .sort((a, b) => (b.fecha || 0) - (a.fecha || 0))
      .slice(0, 300)
      .map((r) => ({
        id: r.id,
        nombre: r.nombre,
        estrellas: Math.min(5, Math.max(1, Number(r.estrellas) || 5)),
        texto: r.texto,
        fecha: r.fecha,
        avatar: r.avatar || '',
        username: r.username || '',
      }));
    return { ok: true, reviews: list };
  }

  async function postReview(req, body) {
    const session = accountFromReq(req);
    const estrellas = Math.min(5, Math.max(1, Math.round(Number(body.estrellas) || 0)));
    const texto = cleanMultiline(body.texto, 600);
    let nombre = cleanText(body.nombre, 40);
    let avatar = '';
    let username = '';

    if (session) {
      nombre = cleanText(session.account.displayName || session.account.username, 40);
      avatar = String(session.account.avatar || '').slice(0, 500);
      username = session.account.username;
    }

    if (!nombre || nombre.length < 2) throw httpError(400, 'Escribí tu nombre (mínimo 2 caracteres).');
    if (!Number.isFinite(Number(body.estrellas)) || Number(body.estrellas) < 1) {
      throw httpError(400, 'Elegí una puntuación de 1 a 5 estrellas.');
    }
    if (texto.length < 12) throw httpError(400, 'La reseña debe tener al menos 12 caracteres.');

    // Render está detrás de un proxy: usamos la IP real del visitante
    // (x-forwarded-for) para que el límite sea por persona y no uno solo
    // para todos los anónimos.
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ip = forwarded || req.socket.remoteAddress || '?';
    const limitKey = session ? 'u:' + username : 'ip:' + ip;
    const last = lastReviewAt.get(limitKey) || 0;
    if (now() - last < 45 * 1000) {
      throw httpError(429, 'Ya publicaste una reseña hace poco. Esperá unos segundos.');
    }
    lastReviewAt.set(limitKey, now());

    const review = {
      id: 'r-' + now().toString(36) + '-' + crypto.randomBytes(3).toString('hex'),
      nombre,
      estrellas,
      texto,
      fecha: now(),
      avatar,
      username,
    };

    try {
      await dataStore.putReview(review);
    } catch (err) {
      log('[Web] No se pudo guardar la reseña:', err.message);
      throw httpError(503, 'No se pudo guardar la reseña en el servidor. Probá de nuevo en unos segundos.');
    }

    db.reviews.push(review);
    if (db.reviews.length > MAX_REVIEWS) db.reviews = db.reviews.slice(-MAX_REVIEWS);
    return { ok: true, review };
  }

  async function logout(req) {
    const session = accountFromReq(req);
    if (!session) return { ok: true };
    delete db.sessions[session.tokenHash];
    try { await dataStore.deleteSession(session.tokenHash); } catch { /* da igual */ }
    return { ok: true };
  }

  // ---------------- Router ----------------
  async function handle(req, res, url) {
    if (!url.startsWith('/auth/') && !url.startsWith('/reviews') && !url.startsWith('/citizen/')) return false;

    try {
      await ensureLoaded();
    } catch (err) {
      log('[Web] Almacén de cuentas no disponible:', err.message);
      sendJson(res, 503, {
        ok: false,
        error: 'El sistema de cuentas está iniciando. Esperá unos segundos y probá de nuevo.',
      });
      return true;
    }

    prunePending();

    try {
      if (url === '/auth/register' && req.method === 'POST') {
        sendJson(res, 200, await register(await readJsonBody(req)));
        return true;
      }
      if (url === '/auth/verify' && req.method === 'POST') {
        sendJson(res, 200, await verify(await readJsonBody(req)));
        return true;
      }
      if (url === '/auth/login' && req.method === 'POST') {
        sendJson(res, 200, await login(await readJsonBody(req)));
        return true;
      }
      if (url === '/auth/logout' && req.method === 'POST') {
        sendJson(res, 200, await logout(req));
        return true;
      }
      if (url === '/auth/reset/request' && req.method === 'POST') {
        sendJson(res, 200, await resetRequest(await readJsonBody(req)));
        return true;
      }
      if (url === '/auth/reset/confirm' && req.method === 'POST') {
        sendJson(res, 200, await resetConfirm(await readJsonBody(req)));
        return true;
      }
      if (url === '/auth/me' && req.method === 'GET') {
        const session = accountFromReq(req);
        if (!session) return sendJson(res, 401, { ok: false, error: 'Sesión vencida. Iniciá sesión de nuevo.' }), true;
        sendJson(res, 200, { ok: true, user: publicUser(session.account) });
        return true;
      }
      if (url === '/citizen/me' && req.method === 'GET') {
        sendJson(res, 200, await citizenMe(req));
        return true;
      }
      if (url === '/citizen/create' && req.method === 'POST') {
        sendJson(res, 200, await citizenCreate(req, await readJsonBody(req)));
        return true;
      }
      if (url === '/citizen/directory' && req.method === 'GET') {
        sendJson(res, 200, citizenDirectory(req));
        return true;
      }
      if (url === '/citizen/link' && req.method === 'POST') {
        sendJson(res, 200, await citizenLink(req, await readJsonBody(req)));
        return true;
      }
      if (url === '/citizen/license/apply' && req.method === 'POST') {
        sendJson(res, 200, await citizenLicenseApply(req, await readJsonBody(req)));
        return true;
      }
      if (url === '/citizen/weapon-license/apply' && req.method === 'POST') {
        sendJson(res, 200, await citizenWeaponLicenseApply(req, await readJsonBody(req)));
        return true;
      }
      if (url === '/citizen/unlink' && req.method === 'POST') {
        sendJson(res, 200, await citizenUnlink(req));
        return true;
      }
      if (url === '/reviews' && req.method === 'GET') {
        sendJson(res, 200, getReviews());
        return true;
      }
      if (url === '/reviews' && req.method === 'POST') {
        sendJson(res, 200, await postReview(req, await readJsonBody(req)));
        return true;
      }
      sendJson(res, 404, { ok: false, error: 'Ruta no encontrada.' });
      return true;
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) log('[Web] Error interno:', err.message);
      sendJson(res, status, {
        ok: false,
        error: status >= 500 && !err.status ? 'Error interno. Probá de nuevo.' : err.message,
      });
      return true;
    }
  }

  return {
    handle,
    reviewLicense,
    reviewWeaponLicense,
    get file() { return dataStore.describe ? dataStore.describe() : 'almacén'; },
    stats: () => ({
      accounts: Object.keys(db.accounts).length,
      reviews: db.reviews.length,
      sessions: Object.keys(db.sessions).length,
    }),
    status: () => ({
      loaded,
      loading: !!loading,
      store: dataStore.describe ? dataStore.describe() : 'almacén',
      discordReady: !!isDiscordReady(),
      discordError: getDiscordError(),
      lastError: lastLoadError,
      accounts: Object.keys(db.accounts).length,
      linkedAccounts: Object.values(db.accounts).filter((a) => a && a.dni).length,
      reviews: db.reviews.length,
      sessions: Object.keys(db.sessions).length,
      cadReady: !!cadSnapshotSafe(),
      cadUpdatedAt: cadUpdatedAtSafe(),
    }),
    check: async () => {
      try { await ensureLoaded(); } catch (err) {
        lastLoadError = (err && err.message) || String(err);
      }
      return {
        loaded,
        loading: !!loading,
        store: dataStore.describe ? dataStore.describe() : 'almacén',
        discordReady: !!isDiscordReady(),
        discordError: getDiscordError(),
        lastError: lastLoadError,
        accounts: Object.keys(db.accounts).length,
        linkedAccounts: Object.values(db.accounts).filter((a) => a && a.dni).length,
        reviews: db.reviews.length,
        sessions: Object.keys(db.sessions).length,
        cadReady: !!cadSnapshotSafe(),
        cadUpdatedAt: cadUpdatedAtSafe(),
      };
    },
  };
}

module.exports = { createWebAuth };
