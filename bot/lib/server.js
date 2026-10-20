// Servidor HTTP del bot.
//
// Rutas:
//   GET  /health        → "ok" (chequeo de Render)
//   GET  /              → texto informativo
//   POST /cad/snapshot  → lo llama el CAD con su estado (llamadas/unidades/BOLOs)
//   POST /erlc/webhook  → eventos en tiempo real del juego (firmados con Ed25519)
//   /auth/*  y  /reviews → cuentas del Panel de Ciudadano y reseñas compartidas
//                          (las maneja lib/web-auth.js)
//
// Todo responde con CORS abierto para que el CAD (app de escritorio)
// y la web puedan enviar desde cualquier origen.

const http = require('http');
const { verifyErlcSignature } = require('./erlc');

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => resolve(Buffer.alloc(0)));
  });
}

function createBotServer({ cfg, onCadSnapshot, onErlcEvent, webAuth = null, log = console.log }) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const cors = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'content-type, authorization, x-cad-key',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      };
      const send = (code, body, type = 'text/plain; charset=utf-8') => {
        res.writeHead(code, { ...cors, 'Content-Type': type });
        res.end(body);
      };
      const sendJson = (code, obj) => send(code, JSON.stringify(obj), 'application/json; charset=utf-8');

      if (req.method === 'OPTIONS') return send(204, '');

      const url = (req.url || '/').split('?')[0];

      if (req.method === 'GET' && (url === '/health' || url === '/')) {
        return send(200, url === '/health' ? 'ok' : 'CAD ER:LC — bot activo 🤖\n');
      }

      // ---- Diagnóstico de las cuentas web (sin secretos) ----
      if (req.method === 'GET' && url === '/web/status') {
        if (!webAuth || !webAuth.status) return sendJson(404, { ok: false, error: 'Cuentas web no configuradas.' });
        const status = webAuth.check ? await webAuth.check() : webAuth.status();
        return sendJson(200, { ok: true, ...status });
      }

      // ---- Cuentas de la web y reseñas compartidas ----
      if (webAuth) {
        try {
          if (await webAuth.handle(req, res, url)) return;
        } catch (err) {
          log('[Web] Error atendiendo el pedido:', err.message);
          if (!res.headersSent) return sendJson(500, { ok: false, error: 'Error interno.' });
          return;
        }
      }

      // ---- Enlace con el CAD ----
      if (req.method === 'POST' && url === '/cad/snapshot') {
        if (!cfg.cadKey) {
          return sendJson(403, { ok: false, error: 'El bot no tiene configurada la clave (CAD_KEY).' });
        }
        if (String(req.headers['x-cad-key'] || '') !== cfg.cadKey) {
          return sendJson(401, { ok: false, error: 'Clave incorrecta.' });
        }

        const raw = await readBody(req);
        let snapshot = null;
        try { snapshot = JSON.parse(raw.toString('utf8')); } catch {}
        if (!snapshot || typeof snapshot !== 'object') {
          return sendJson(400, { ok: false, error: 'JSON inválido.' });
        }

        let announced = 0;
        try { announced = (await onCadSnapshot(snapshot)) || 0; } catch (err) {
          log('[CAD] Error al procesar el estado:', err.message);
        }
        return sendJson(200, { ok: true, announced });
      }

      // ---- Webhooks del juego (llamadas de emergencia y comandos con ";") ----
      if (req.method === 'POST' && url === '/erlc/webhook') {
        const raw = await readBody(req);
        const valid = verifyErlcSignature({
          sigHex: req.headers['x-signature-ed25519'],
          timestamp: req.headers['x-signature-timestamp'],
          rawBody: raw,
          publicKeyB64: cfg.erlcWebhookPublicKey,
        });
        if (!valid) {
          log('[ERLC] Webhook con firma inválida → rechazado.');
          return sendJson(401, { ok: false, error: 'Firma inválida.' });
        }

        let data = null;
        try { data = JSON.parse(raw.toString('utf8')); } catch {}
        try { await onErlcEvent(data || {}); } catch (err) {
          log('[ERLC] Error al procesar el evento:', err.message);
        }
        return sendJson(200, { ok: true });
      }

      return send(404, 'No encontrado');
    });

    server.once('error', reject);
    server.listen(cfg.port || 0, () => {
      resolve({
        port: server.address().port,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

module.exports = { createBotServer };
