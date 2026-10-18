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
//   - Los roles "Administrador" y "Supervisor" pueden gestionar cualquier canal;
//     los "Miembro" pueden crear canales de SU sección y canales privados.
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
const { WebSocketServer } = require('ws');

// Departamentos válidos (deben coincidir con los de la app)
const DEPARTMENTS = ['LCPD', 'CHP', 'LCFD', 'DOT', 'DISPATCH'];

// Roles con permisos de gestión
const STAFF_ROLES = ['Administrador', 'Supervisor'];

// Dónde se guardan los canales (se puede cambiar con la variable CHANNELS_FILE)
const CHANNELS_FILE = process.env.CHANNELS_FILE || path.join(__dirname, 'channels.json');

const DEFAULT_CHANNEL_DEFS = [
  { name: 'Despacho Central',     department: null,       private: false, members: [], createdBy: null },
  { name: 'Policía (LCPD)',       department: 'LCPD',     private: false, members: [], createdBy: null },
  { name: 'Highway Patrol (CHP)', department: 'CHP',      private: false, members: [], createdBy: null },
  { name: 'Bomberos/EMS (LCFD)',  department: 'LCFD',     private: false, members: [], createdBy: null },
  { name: 'Transporte (DOT)',     department: 'DOT',      private: false, members: [], createdBy: null },
  { name: 'Central 9-1-1',        department: 'DISPATCH', private: false, members: [], createdBy: null },
  { name: 'Táctico 1',            department: null,       private: false, members: [], createdBy: null },
  { name: 'Táctico 2',            department: null,       private: false, members: [], createdBy: null },
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
  return { name, department, private: isPrivate, members, createdBy };
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

// Intenta escuchar en `port`; si está ocupado, prueba los siguientes puertos.
function createRadioServer(port = 8787, maxTries = 10) {
  return new Promise((resolve, reject) => {
    let tries = 0;

    const tryListen = (p) => {
      const iceServers = buildIceServers();

      const httpServer = http.createServer((req, res) => {
        const body = req.url === '/health'
          ? 'ok'
          : 'CAD ER:LC — servidor de radio activo\n';
        res.writeHead(200, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(body);
      });

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

  const send = (ws, msg) => {
    if (ws.readyState === 1) ws.send(JSON.stringify(msg));
  };

  const isStaff = (c) => STAFF_ROLES.includes(c.role);
  const isAdmin = (c) => c.role === 'Administrador';

  const findChannel = (name) =>
    channelDefs.find((d) => d.name.toLowerCase() === String(name || '').toLowerCase());

  // Lo que se envía al cliente: los invitados de un canal privado solo se
  // revelan a quien puede gestionarlo.
  const serializeChannel = (def, client) => {
    const canManage = isAdmin(client) || client.role === 'Supervisor' || (def.createdBy && def.createdBy === client.name);
    return {
      name: def.name,
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
      .map((c) => ({ id: c.id, name: c.name, department: c.department, talking: !!c.talking }));

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
      id: c.id, name: c.name, department: c.department, channel: c.channel,
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
          client.role = STAFF_ROLES.includes(msg.role) ? msg.role : 'Miembro';
          send(ws, {
            type: 'welcome',
            id: client.id,
            channels: channelDefs.map((d) => serializeChannel(d, client)),
            channelsFresh: !channelsCustomized,
            iceServers,
          });
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

        case 'channel-create': {
          const def = normalizeChannelDef({
            name: msg.name,
            department: msg.department,
            private: msg.private,
            members: msg.members,
            createdBy: client.name,
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
            member: { id: client.id, name: client.name, department: client.department, talking: false },
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
