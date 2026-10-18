// Servidor de señalización del radio de voz.
//
// No escucha conversaciones: solo conecta a los compañeros entre sí
// (retransmite ofertas WebRTC, respuestas, candidatos de red y estados).
// El audio viaja directo de PC a PC (peer-to-peer), sin pasar por aquí.
//
// Incluye un servidor HTTP mínimo para poder alojarlo en la nube
// (Render, Railway, VPS...): GET /health responde "ok" para los chequeos.
//
// Configuración opcional de TURN (relay para redes estrictas):
//   TURN_URLS       -> "turn:mi-servidor.com:3478,turns:mi-servidor.com:5349"
//   TURN_USERNAME   -> usuario
//   TURN_CREDENTIAL -> contraseña
// La configuración se envía automáticamente a las apps al conectarse.

const http = require('http');
const { WebSocketServer } = require('ws');

const DEFAULT_CHANNELS = ['Despacho', 'Policía', 'Bomberos/EMS', 'Táctico 1', 'Táctico 2'];

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
  const clients = new Map(); // id -> { id, ws, name, department, channel, talking }

  const send = (ws, msg) => {
    if (ws.readyState === 1) ws.send(JSON.stringify(msg));
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

  wss.on('connection', (ws) => {
    const client = { id: nextId++, ws, name: 'Anónimo', department: 'DISPATCH', channel: null, talking: false };
    clients.set(client.id, client);
    console.log(`[Radio] Conexión #${client.id} · ${clients.size} en línea`);

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      switch (msg.type) {
        case 'hello':
          client.name = String(msg.name || 'Anónimo').slice(0, 40);
          client.department = String(msg.department || 'DISPATCH').slice(0, 20);
          send(ws, {
            type: 'welcome',
            id: client.id,
            channels: DEFAULT_CHANNELS,
            iceServers,
          });
          break;

        case 'join': {
          const channel = String(msg.channel || '').slice(0, 40);
          if (!channel) break;
          if (client.channel) {
            // Si ya estaba en otro canal, avisar a ese canal
            broadcastToChannel(client.channel, { type: 'peer-left', id: client.id });
          }
          client.channel = channel;
          client.talking = false;
          send(ws, { type: 'joined', channel, members: membersOf(channel) });
          broadcastToChannel(channel, {
            type: 'peer-joined',
            member: { id: client.id, name: client.name, department: client.department, talking: false },
          }, client.id);
          broadcastRoster(channel);
          console.log(`[Radio] #${client.id} ${client.name} entró a "${channel}"`);
          break;
        }

        case 'leave': {
          if (client.channel) {
            const old = client.channel;
            client.channel = null;
            client.talking = false;
            broadcastToChannel(old, { type: 'peer-left', id: client.id });
            broadcastRoster(old);
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

module.exports = { createRadioServer, DEFAULT_CHANNELS };
