// Servidor de señalización del radio de voz.
//
// No escucha conversaciones: solo conecta a los compañeros entre sí
// (retransmite ofertas WebRTC, respuestas, candidatos de red y estados).
// El audio viaja directo de PC a PC (peer-to-peer), sin pasar por aquí.
//
// Incluye un servidor HTTP mínimo para poder alojarlo en la nube
// (Render, Railway, VPS...): GET /health responde "ok" para los chequeos.
//
// Canales y roles:
//   - Cada canal puede ser de un departamento (solo esa sección entra) o general.
//   - Los canales privados solo dejan entrar a los invitados (o al personal).
//   - Los roles "Propietario", "Administrador" y "Supervisor" pueden gestionar
//     cualquier canal; los "Miembro" pueden crear canales de SU sección y
//     canales privados.
//   - El "Propietario" (contraseña creada en la app, o variable OWNER_PASSWORD)
//     tiene permisos totales y asigna los roles del resto (estilo Discord).
//   - Los canales se guardan en channels.json. Si el servidor pierde ese archivo
//     (reinicio en la nube), la primera app con caché los restaura sola.
//
// Configuración opcional de TURN (relay para redes estrictas):
//   TURN_URLS       -> "turn:mi-servidor.com:3478,turns:mi-servidor.com:5349"
//   TURN_USERNAME   -> usuario
//   TURN_CREDENTIAL -> contraseña
// La configuración se envía automáticamente a las apps al conectarse.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

// Departamentos válidos (deben coincidir con los de la app)
const DEPARTMENTS = ['LCPD', 'CHP', 'LCFD', 'DOT', 'DISPATCH'];

// Roles con permisos de gestión
const STAFF_ROLES = ['Propietario', 'Administrador', 'Supervisor'];

// Roles que el propietario puede asignar desde la app
const ASSIGNABLE_ROLES = ['Miembro', 'Despachador', 'Supervisor', 'Administrador'];

// Dónde se guardan los canales (se puede cambiar con la variable CHANNELS_FILE)
const CHANNELS_FILE = process.env.CHANNELS_FILE || path.join(__dirname, 'channels.json');

// Dónde se guardan el propietario y los roles asignados (variable ROLES_FILE)
const ROLES_FILE = process.env.ROLES_FILE || path.join(__dirname, 'roles.json');

const sha256 = (text) => crypto.createHash('sha256').update(String(text)).digest('hex');

const DEFAULT_CHANNEL_DEFS = [
  { name: 'Despacho Central',     department: null,       private: false, category: 'Central',       members: [], createdBy: null },
  { name: 'Policía (LCPD)',       department: 'LCPD',     private: false, category: 'Departamentos', members: [], createdBy: null },
  { name: 'Highway Patrol (CHP)', department: 'CHP',      private: false, category: 'Departamentos', members: [], createdBy: null },
  { name: 'Bomberos/EMS (LCFD)',  department: 'LCFD',     private: false, category: 'Departamentos', members: [], createdBy: null },
  { name: 'Transporte (DOT)',     department: 'DOT',      private: false, category: 'Departamentos', members: [], createdBy: null },
  { name: 'Central 9-1-1',        department: 'DISPATCH', private: false, category: 'Departamentos', members: [], createdBy: null },
  { name: 'Táctico 1',            department: null,       private: false, category: 'Operaciones',   members: [], createdBy: null },
  { name: 'Táctico 2',            department: null,       private: false, category: 'Operaciones',   members: [], createdBy: null },
];

// Valida y limpia la definición de un canal (venga de un cliente o del disco).
function normalizeChannelDef(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name || '').trim().replace(/\s+/g, ' ').slice(0, 32);
  if (name.length < 2) return null;
  const department = DEPARTMENTS.includes(raw.department) ? raw.department : null;
  const isPrivate = !!raw.private;
  const members = isPrivate
    ? [...new Set(
        (Array.isArray(raw.members) ? raw.members : [])
          .map((m) => String(m || '').trim().slice(0, 40))
          .filter(Boolean)
      )].slice(0, 50)
    : [];
  const createdBy = raw.createdBy ? String(raw.createdBy).slice(0, 40) : null;
  // Sección (categoría) estilo Discord; por defecto "General"
  const category = String(raw.category || '').trim().replace(/\s+/g, ' ').slice(0, 24) || 'General';
  return { name, department, private: isPrivate, members, createdBy, category };
}

// STUN público por defecto (ayuda a descubrir la dirección de cada PC)
const DEFAULT_STUN = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

function buildIceServers() {
  const servers = DEFAULT_STUN.map((s) => ({ urls: [...s.urls] }));

  const urls = String(process.env.TURN_URLS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (urls.length) {
    servers.push({
      urls,
      username: process.env.TURN_USERNAME || '',
      credential: process.env.TURN_CREDENTIAL || '',
    });
    console.log('[Radio] TURN configurado:', urls.join(', '));
  } else {
    console.log('[Radio] Sin TURN configurado (puede fallar en redes estrictas).');
  }

  return servers;
}

// Página pública para que los civiles llamen al 911 (la sirve este mismo servidor).
const CIVILIAN_PAGE = require('./ciudadano-page');

// Intenta escuchar en `port`; si está ocupado, prueba los siguientes puertos.
function createRadioServer(port = 8787, maxTries = 10) {
  return new Promise((resolve, reject) => {
    let tries = 0;

    const tryListen = (p) => {
      const iceServers = buildIceServers();

      const httpServer = http.createServer();

      const wss = new WebSocketServer({ server: httpServer });

      httpServer.once('listening', () => resolve(buildServer(wss, httpServer, p, iceServers)));

      httpServer.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && tries < maxTries) {
          tries += 1;
          console.warn(`[Radio] Puerto ${p} ocupado, probando ${p + 1}...`);
          tryListen(p + 1);
        } else {
          reject(err);
        }
      });

      httpServer.listen(p);
    };

    tryListen(port);
  });
}

function buildServer(wss, httpServer, port, iceServers) {
  let nextId = 1;
  const clients = new Map(); // id -> { id, ws, name, department, role, channel, talking }
  let activePanic = null; // última alerta 🆘 sin "todo controlado" (para quien se conecte después)

  // ---- HTTP: salud, página del 911 para civiles y recepción de llamadas ----
  const civilLastByIp = new Map(); // anti-spam por IP
  const CIVIL_TYPES = { POLICE: 'Policía', MEDICAL: 'Médica', FIRE: 'Incendio', TRAFFIC: 'Tránsito', OTHER: 'Otra' };

  httpServer.on('request', (req, res) => {
    const url = String(req.url || '/').split('?')[0];

    // Página pública para civiles
    if (url === '/911' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(CIVILIAN_PAGE);
      return;
    }

    // Llamada al 911 desde la página de civiles
    if (url === '/911' && req.method === 'POST') {
      const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
        || (req.socket && req.socket.remoteAddress) || '?';
      if (Date.now() - (civilLastByIp.get(ip) || 0) < 20000) {
        res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: 'Esperá unos segundos antes de volver a llamar.' }));
        return;
      }
      let raw = '';
      let tooBig = false;
      req.on('data', (chunk) => {
        raw += chunk;
        if (raw.length > 10000) { tooBig = true; req.destroy(); }
      });
      req.on('end', () => {
        if (tooBig) return;
        let body = {};
        try { body = JSON.parse(raw || '{}'); } catch {}
        const kind = CIVIL_TYPES[body.kind] ? body.kind : 'OTHER';
        const call = {
          id: 'CIV-' + Date.now().toString(36).toUpperCase(),
          kind,
          kindLabel: CIVIL_TYPES[kind],
          name: String(body.name || '').trim().slice(0, 60) || 'Ciudadano anónimo',
          location: String(body.location || '').trim().slice(0, 120) || 'Ubicación desconocida',
          description: String(body.description || '').trim().slice(0, 500) || 'Sin detalles',
          ts: Date.now(),
        };
        civilLastByIp.set(ip, Date.now());
        for (const c of clients.values()) send(c.ws, { type: 'civil-call', call });
        console.log(`[Radio] 📞 911 (${CIVIL_TYPES[kind]}): ${call.name} — ${call.location}`);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: true, id: call.id }));
      });
      return;
    }

    const body = url === '/health' ? 'ok' : 'CAD ER:LC — servidor de radio activo\n';
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(body);
  });

  // ---------------- Estado de los canales ----------------
  let channelDefs = DEFAULT_CHANNEL_DEFS.map((d) => ({ ...d, members: [] }));
  let channelsCustomized = false; // true = hay canales propios (no recién reiniciado)

  const loadChannelsFromDisk = () => {
    try {
      const raw = fs.readFileSync(CHANNELS_FILE, 'utf8');
      const arr = JSON.parse(raw);
      const defs = (Array.isArray(arr) ? arr : []).map(normalizeChannelDef).filter(Boolean);
      if (defs.length) return defs;
    } catch {}
    return null;
  };

  const saveChannelsToDisk = () => {
    try {
      fs.writeFileSync(CHANNELS_FILE, JSON.stringify(channelDefs));
    } catch (err) {
      console.warn('[Radio] No se pudieron guardar los canales:', err.message);
    }
  };

  const storedDefs = loadChannelsFromDisk();
  if (storedDefs) {
    channelDefs = storedDefs;
    channelsCustomized = true;
    console.log(`[Radio] ${storedDefs.length} canales cargados del disco.`);
  }

  // ---------------- Propietario y roles ----------------
  let rolesDb = { ownerHash: null, ownerName: null, assignments: {} };
  let assignmentsTouched = false;

  const loadRolesFromDisk = () => {
    try {
      const raw = fs.readFileSync(ROLES_FILE, 'utf8');
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') return obj;
    } catch {}
    return null;
  };

  const saveRolesToDisk = () => {
    try {
      fs.writeFileSync(ROLES_FILE, JSON.stringify(rolesDb));
    } catch (err) {
      console.warn('[Radio] No se pudieron guardar los roles:', err.message);
    }
  };

  const storedRoles = loadRolesFromDisk();
  if (storedRoles) {
    rolesDb = {
      ownerHash: typeof storedRoles.ownerHash === 'string' ? storedRoles.ownerHash : null,
      ownerName: storedRoles.ownerName ? String(storedRoles.ownerName).slice(0, 40) : null,
      assignments: (storedRoles.assignments && typeof storedRoles.assignments === 'object')
        ? sanitizeAssignments(storedRoles.assignments) : {},
    };
    assignmentsTouched = Object.keys(rolesDb.assignments).length > 0;
    console.log(`[Radio] Roles cargados: propietario ${rolesDb.ownerHash ? 'sí' : 'no'} · ${Object.keys(rolesDb.assignments).length} roles asignados.`);
  }

  // La contraseña del propietario también se puede fijar con la variable OWNER_PASSWORD
  if (!rolesDb.ownerHash && process.env.OWNER_PASSWORD) {
    rolesDb.ownerHash = sha256(process.env.OWNER_PASSWORD);
    console.log('[Radio] Contraseña de propietario cargada desde OWNER_PASSWORD.');
  }

  function sanitizeAssignments(obj) {
    const out = {};
    if (!obj || typeof obj !== 'object') return out;
    for (const [k, v] of Object.entries(obj).slice(0, 300)) {
      const name = String(k).trim().slice(0, 40);
      if (name && ASSIGNABLE_ROLES.includes(v)) out[name] = v;
    }
    return out;
  }

  const roleOf = (client) => {
    if (client.isOwner) return 'Propietario';
    return rolesDb.assignments[client.name] || 'Miembro';
  };

  const sendOwnerStatus = (ownerClient) => {
    send(ownerClient.ws, {
      type: 'owner-status',
      owner: true,
      ownerExists: !!rolesDb.ownerHash,
      ownerName: rolesDb.ownerName,
      rolesFresh: !assignmentsTouched,
      assignments: { ...rolesDb.assignments },
    });
  };

  const send = (ws, msg) => {
    if (ws.readyState === 1) ws.send(JSON.stringify(msg));
  };

  const isStaff = (c) => STAFF_ROLES.includes(c.role);
  const isAdmin = (c) => c.role === 'Administrador' || c.role === 'Propietario';

  const findChannel = (name) =>
    channelDefs.find((d) => d.name.toLowerCase() === String(name || '').toLowerCase());

  // Lo que se envía al cliente: los invitados de un canal privado solo se
  // revelan a quien puede gestionarlo.
  const serializeChannel = (def, client) => {
    const canManage = isAdmin(client) || client.role === 'Supervisor' || (def.createdBy && def.createdBy === client.name);
    return {
      name: def.name,
      category: def.category || 'General',
      department: def.department,
      private: def.private,
      createdBy: def.createdBy,
      memberCount: def.members.length,
      iAmMember: def.members.includes(client.name),
      canManage,
      memberNames: canManage ? [...def.members] : undefined,
    };
  };

  const broadcastChannels = () => {
    for (const c of clients.values()) {
      send(c.ws, { type: 'channels', channels: channelDefs.map((d) => serializeChannel(d, c)) });
    }
  };

  const membersOf = (channel) =>
    [...clients.values()]
      .filter((c) => c.channel === channel)
      .map((c) => ({ id: c.id, name: c.name, department: c.department, role: c.role, talking: !!c.talking }));

  const broadcastRoster = (channel) => {
    const members = membersOf(channel);
    for (const c of clients.values()) {
      if (c.channel === channel) send(c.ws, { type: 'roster', channel, members });
    }
  };

  const broadcastToChannel = (channel, msg, exceptId = null) => {
    for (const c of clients.values()) {
      if (c.channel === channel && c.id !== exceptId) send(c.ws, msg);
    }
  };

  // Lista de todos los conectados (para invitar a canales privados)
  const broadcastUserlist = () => {
    const users = [...clients.values()].map((c) => ({
      id: c.id, name: c.name, department: c.department, role: c.role, channel: c.channel,
    }));
    for (const c of clients.values()) send(c.ws, { type: 'userlist', users });
  };

  wss.on('connection', (ws) => {
    const client = {
      id: nextId++, ws, name: 'Anónimo', department: 'DISPATCH',
      role: 'Miembro', channel: null, talking: false,
    };
    clients.set(client.id, client);
    console.log(`[Radio] Conexión #${client.id} · ${clients.size} en línea`);

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      switch (msg.type) {
        case 'hello': {
          client.name = String(msg.name || 'Anónimo').slice(0, 40);
          client.department = DEPARTMENTS.includes(msg.department) ? msg.department : 'DISPATCH';
          // El rol NO se elige desde la app: lo asigna el propietario.
          // El propietario se identifica con su contraseña.
          client.isOwner = !!rolesDb.ownerHash
            && !!msg.ownerPassword
            && sha256(msg.ownerPassword) === rolesDb.ownerHash;
          client.role = roleOf(client);
          send(ws, {
            type: 'welcome',
            id: client.id,
            role: client.role,
            ownerExists: !!rolesDb.ownerHash,
            ownerName: rolesDb.ownerName,
            channels: channelDefs.map((d) => serializeChannel(d, client)),
            channelsFresh: !channelsCustomized,
            iceServers,
          });
          if (client.isOwner) sendOwnerStatus(client);
          // Un pánico de hace más de 30 minutos ya no se reenvía al entrar.
          if (activePanic && Date.now() - activePanic.ts > 30 * 60 * 1000) activePanic = null;
          if (activePanic) send(ws, { type: 'panic', ...activePanic });
          broadcastUserlist();
          break;
        }

        // La app que se conecta envía su caché de canales si el servidor
        // acaba de arrancar (por ejemplo, tras reiniciarse en la nube).
        case 'channels-restore': {
          if (channelsCustomized) break;
          const defs = (Array.isArray(msg.channels) ? msg.channels : [])
            .map(normalizeChannelDef)
            .filter(Boolean)
            .slice(0, 60);
          if (!defs.length) break;
          channelDefs = defs;
          channelsCustomized = true;
          saveChannelsToDisk();
          broadcastChannels();
          console.log(`[Radio] Canales restaurados desde "${client.name}" (${defs.length}).`);
          break;
        }

        // ---------------- Propietario ----------------
        case 'owner-setup': {
          if (rolesDb.ownerHash) {
            send(ws, { type: 'error', message: 'Este servidor ya tiene propietario.' });
            break;
          }
          const password = String(msg.password || '');
          if (password.length < 4) {
            send(ws, { type: 'error', message: 'La contraseña de propietario debe tener al menos 4 caracteres.' });
            break;
          }
          rolesDb.ownerHash = sha256(password);
          rolesDb.ownerName = client.name;
          client.isOwner = true;
          client.role = 'Propietario';
          saveRolesToDisk();
          console.log(`[Radio] Propietario creado: ${client.name}`);
          sendOwnerStatus(client);
          send(ws, { type: 'role-changed', role: 'Propietario' });
          broadcastUserlist();
          break;
        }

        case 'owner-login': {
          if (!rolesDb.ownerHash) {
            send(ws, { type: 'error', message: 'Este servidor todavía no tiene propietario. Creamos la contraseña primero.' });
            break;
          }
          if (sha256(String(msg.password || '')) !== rolesDb.ownerHash) {
            send(ws, { type: 'error', message: 'Contraseña de propietario incorrecta.' });
            break;
          }
          client.isOwner = true;
          client.role = 'Propietario';
          sendOwnerStatus(client);
          send(ws, { type: 'role-changed', role: 'Propietario' });
          broadcastUserlist();
          console.log(`[Radio] Propietario conectado: ${client.name}`);
          break;
        }

        case 'owner-logout': {
          client.isOwner = false;
          client.role = roleOf(client);
          send(ws, { type: 'role-changed', role: client.role });
          send(ws, { type: 'owner-status', owner: false, ownerExists: !!rolesDb.ownerHash, ownerName: rolesDb.ownerName });
          broadcastUserlist();
          break;
        }

        // La app del propietario envía su lista de roles si el servidor
        // acaba de arrancar (por ejemplo, tras reiniciarse en la nube).
        case 'roles-restore': {
          if (!client.isOwner || assignmentsTouched) break;
          const defs = sanitizeAssignments(msg.assignments);
          if (!Object.keys(defs).length) break;
          rolesDb.assignments = defs;
          assignmentsTouched = true;
          saveRolesToDisk();
          sendOwnerStatus(client);
          broadcastUserlist();
          console.log(`[Radio] Roles restaurados desde "${client.name}" (${Object.keys(defs).length}).`);
          break;
        }

        case 'role-assign': {
          if (!client.isOwner) {
            send(ws, { type: 'error', message: 'Solo el propietario puede asignar roles.' });
            break;
          }
          const targetName = String(msg.name || '').trim().slice(0, 40);
          const role = msg.role;
          if (!targetName || !ASSIGNABLE_ROLES.includes(role)) {
            send(ws, { type: 'error', message: 'Rol o persona inválida.' });
            break;
          }
          if (role === 'Miembro') delete rolesDb.assignments[targetName];
          else rolesDb.assignments[targetName] = role;
          assignmentsTouched = true;
          saveRolesToDisk();
          // Si esa persona está conectada, aplicarle el rol al instante
          for (const c of clients.values()) {
            if (c.name === targetName && !c.isOwner) {
              c.role = roleOf(c);
              send(c.ws, { type: 'role-changed', role: c.role });
            }
          }
          console.log(`[Radio] Rol asignado: ${targetName} -> ${role} (por ${client.name})`);
          sendOwnerStatus(client);
          broadcastUserlist();
          break;
        }

        case 'channel-create': {
          const def = normalizeChannelDef({
            name: msg.name,
            department: msg.department,
            private: msg.private,
            members: msg.members,
            createdBy: client.name,
            category: msg.category,
          });
          if (!def) {
            send(ws, { type: 'error', message: 'Nombre de canal inválido (mínimo 2 letras).' });
            break;
          }
          if (findChannel(def.name)) {
            send(ws, { type: 'error', message: 'Ya existe un canal con ese nombre.' });
            break;
          }
          if (channelDefs.length >= 60) {
            send(ws, { type: 'error', message: 'Hay demasiados canales. Elimina alguno antes de crear otro.' });
            break;
          }
          if (!def.private && !def.department && !isStaff(client)) {
            send(ws, { type: 'error', message: 'Solo supervisores o administradores pueden crear canales generales.' });
            break;
          }
          if (!def.private && def.department && !isStaff(client) && client.department !== def.department) {
            send(ws, { type: 'error', message: 'Solo puedes crear canales para tu propio departamento.' });
            break;
          }
          if (def.private) def.members = [...new Set([client.name, ...def.members])].slice(0, 50);
          channelDefs.push(def);
          channelsCustomized = true;
          saveChannelsToDisk();
          broadcastChannels();
          console.log(`[Radio] Canal creado: "${def.name}" por ${client.name} (${client.role})`);
          break;
        }

        case 'channel-delete': {
          const def = findChannel(msg.channel);
          if (!def) {
            send(ws, { type: 'error', message: 'Ese canal ya no existe.' });
            break;
          }
          if (!(isStaff(client) || def.createdBy === client.name)) {
            send(ws, { type: 'error', message: 'No tienes permiso para eliminar ese canal.' });
            break;
          }
          channelDefs = channelDefs.filter((d) => d !== def);
          channelsCustomized = true;
          saveChannelsToDisk();
          // Sacar del canal a quienes estaban dentro
          for (const c of clients.values()) {
            if (c.channel === def.name) {
              c.channel = null;
              c.talking = false;
              send(c.ws, { type: 'kicked', reason: `El canal "${def.name}" fue eliminado.` });
            }
          }
          broadcastChannels();
          broadcastUserlist();
          console.log(`[Radio] Canal eliminado: "${def.name}" por ${client.name}`);
          break;
        }

        case 'channel-invite': {
          const def = findChannel(msg.channel);
          if (!def || !def.private) {
            send(ws, { type: 'error', message: 'Ese canal no existe o no es privado.' });
            break;
          }
          if (!(isStaff(client) || def.createdBy === client.name)) {
            send(ws, { type: 'error', message: 'No tienes permiso para invitar a ese canal.' });
            break;
          }
          const names = (Array.isArray(msg.members) ? msg.members : [msg.member])
            .map((n) => String(n || '').trim().slice(0, 40))
            .filter(Boolean);
          def.members = [...new Set([...def.members, ...names])].slice(0, 50);
          channelsCustomized = true;
          saveChannelsToDisk();
          broadcastChannels();
          console.log(`[Radio] Invitados a "${def.name}": ${names.join(', ')}`);
          break;
        }

        case 'join': {
          const name = String(msg.channel || '').slice(0, 40);
          if (!name) break;
          const def = findChannel(name);
          if (!def) {
            send(ws, { type: 'error', message: 'Ese canal no existe.' });
            break;
          }
          if (def.department && def.department !== client.department && !isStaff(client)) {
            send(ws, { type: 'error', message: `Canal exclusivo de ${def.department}. No perteneces a ese departamento.` });
            break;
          }
          if (def.private && !def.members.includes(client.name) && !isStaff(client)) {
            send(ws, { type: 'error', message: 'Canal privado: necesitas una invitación.' });
            break;
          }
          if (client.channel) {
            // Si ya estaba en otro canal, avisar a ese canal
            broadcastToChannel(client.channel, { type: 'peer-left', id: client.id });
          }
          client.channel = def.name;
          client.talking = false;
          send(ws, { type: 'joined', channel: def.name, members: membersOf(def.name) });
          broadcastToChannel(def.name, {
            type: 'peer-joined',
            member: { id: client.id, name: client.name, department: client.department, role: client.role, talking: false },
          }, client.id);
          broadcastRoster(def.name);
          broadcastUserlist();
          console.log(`[Radio] #${client.id} ${client.name} entró a "${def.name}"`);
          break;
        }

        case 'leave': {
          if (client.channel) {
            const old = client.channel;
            client.channel = null;
            client.talking = false;
            broadcastToChannel(old, { type: 'peer-left', id: client.id });
            broadcastRoster(old);
            broadcastUserlist();
          }
          break;
        }

        case 'signal': {
          // Retransmitir un mensaje WebRTC al destinatario exacto
          const target = clients.get(msg.to);
          if (target) send(target.ws, { type: 'signal', from: client.id, data: msg.data });
          break;
        }

        case 'talking': {
          client.talking = !!msg.talking;
          if (client.channel) {
            broadcastToChannel(client.channel, { type: 'peer-talking', id: client.id, talking: client.talking }, client.id);
          }
          break;
        }

        case 'chat': {
          if (client.channel && msg.text) {
            broadcastToChannel(client.channel, {
              type: 'chat',
              from: client.id,
              name: client.name,
              department: client.department,
              text: String(msg.text).slice(0, 500),
              ts: Date.now(),
            });
          }
          break;
        }

        // ---------------- Botón de pánico ----------------
        case 'panic': {
          const now = Date.now();
          if (client.lastPanicAt && now - client.lastPanicAt < 15000) break; // anti-spam
          client.lastPanicAt = now;
          activePanic = {
            from: client.id,
            name: client.name,
            department: client.department,
            note: String(msg.note || '').slice(0, 200),
            ts: now,
          };
          for (const c of clients.values()) send(c.ws, { type: 'panic', ...activePanic });
          console.log(`[Radio] 🆘 PÁNICO de ${client.name} (${client.department})${activePanic.note ? ' — ' + activePanic.note : ''}`);
          break;
        }

        case 'panic-clear': {
          if (!activePanic) break;
          // Puede cerrarla quien la activó (por nombre, aunque haya reiniciado
          // el CAD y su conexión sea otra) o un administrador.
          if (client.name !== activePanic.name && !isAdmin(client)) break;
          activePanic = null;
          for (const c of clients.values()) send(c.ws, { type: 'panic-clear', name: client.name, ts: Date.now() });
          console.log(`[Radio] ✅ Pánico controlado por ${client.name}`);
          break;
        }

      }
    });

    const drop = () => {
      if (!clients.has(client.id)) return;
      clients.delete(client.id);
      if (client.channel) {
        broadcastToChannel(client.channel, { type: 'peer-left', id: client.id });
        broadcastRoster(client.channel);
      }
      broadcastUserlist();
      console.log(`[Radio] #${client.id} ${client.name} salió · ${clients.size} en línea`);
    };

    ws.on('close', drop);
    ws.on('error', drop);
  });

  // Ping cada 30 s para detectar conexiones muertas
  const pingInterval = setInterval(() => {
    for (const c of clients.values()) {
      if (c.ws.readyState === 1) c.ws.ping();
    }
  }, 30000);

  wss.on('close', () => clearInterval(pingInterval));

  console.log(`[Radio] Servidor listo en el puerto ${port}`);

  return {
    port,
    wss,
    clientCount: () => clients.size,
    close() {
      for (const c of clients.values()) {
        try { c.ws.close(); } catch {}
      }
      clients.clear();
      wss.close();
      try { httpServer.close(); } catch {}
      console.log('[Radio] Servidor detenido.');
    },
  };
}

module.exports = { createRadioServer, DEFAULT_CHANNELS: DEFAULT_CHANNEL_DEFS };
