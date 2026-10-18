// Cliente de la API oficial de ER:LC (api.erlc.gg) + verificación de webhooks.
//
// Requisitos del lado del juego:
//   - El servidor privado de ER:LC debe tener comprado el pack "ERLC API".
//   - La "server-key" se saca dentro del juego: Settings → API key.
//     (También: https://erlc.link/sk)
//   - Se envía en la cabecera "server-key" en cada petición.
//
// Los webhooks del juego llegan firmados con Ed25519 y se verifican acá
// con la clave pública oficial (ver documentación: /event-webhooks).

const crypto = require('crypto');

const ERLC_BASE = 'https://api.erlc.gg';

// Clave pública oficial de ER:LC para verificar los webhooks (base64 SPKI).
const ERLC_WEBHOOK_PUBLIC_KEY =
  'MCowBQYDK2VwAyEAjSICb9pp0kHizGQtdG8ySWsDChfGqi+gyFCttigBNOA=';

// Petición genérica a la API.
// Devuelve { ok, status, data, retryAfter }.
async function erlcRequest(serverKey, path, { method = 'GET', body = null } = {}) {
  const res = await fetch(ERLC_BASE + path, {
    method,
    headers: {
      'server-key': serverKey,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try { data = await res.json(); } catch {}

  return {
    ok: res.ok,
    status: res.status,
    data,
    retryAfter: parseInt(res.headers.get('retry-after') || '0', 10) || 0,
  };
}

// Estado del servidor: nombre, jugadores, clave de ingreso, etc.
const getServerStatus = (serverKey) => erlcRequest(serverKey, '/v1/server');

// Jugadores conectados (con equipo e indicativo si están en servicio).
const getPlayers = (serverKey) => erlcRequest(serverKey, '/v1/server/players');

// Ejecuta un comando dentro del juego como "virtual server management".
// Ojo: la API permite 1 comando cada ~5 s (bucket "command").
const runCommand = (serverKey, command) =>
  erlcRequest(serverKey, '/v2/server/command', { method: 'POST', body: { command } });

// Verifica la firma Ed25519 que el juego agrega a cada webhook.
//   message = timestamp (texto) + cuerpo crudo, sin separadores.
function verifyErlcSignature({ sigHex, timestamp, rawBody, publicKeyB64 = ERLC_WEBHOOK_PUBLIC_KEY }) {
  try {
    if (!sigHex || !timestamp || !rawBody || !rawBody.length) return false;
    const key = crypto.createPublicKey({
      key: Buffer.from(publicKeyB64, 'base64'),
      format: 'der',
      type: 'spki',
    });
    const message = Buffer.concat([Buffer.from(String(timestamp), 'utf8'), rawBody]);
    return crypto.verify(null, message, key, Buffer.from(sigHex, 'hex'));
  } catch {
    return false;
  }
}

// Firmar (solo para las pruebas automáticas; en producción la firma la pone el juego).
function signForTest(privateKeyPem, timestamp, rawBody) {
  const message = Buffer.concat([Buffer.from(String(timestamp), 'utf8'), rawBody]);
  return crypto.sign(null, message, privateKeyPem).toString('hex');
}

module.exports = {
  ERLC_BASE,
  ERLC_WEBHOOK_PUBLIC_KEY,
  erlcRequest,
  getServerStatus,
  getPlayers,
  runCommand,
  verifyErlcSignature,
  signForTest,
};
