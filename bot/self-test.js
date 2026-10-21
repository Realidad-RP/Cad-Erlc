// Prueba automática del bot: no necesita Discord ni internet.
//
// Uso:  npm run test-bot   (desde la raíz del proyecto)
//       npm test           (dentro de la carpeta bot/)

const assert = require('assert');
const crypto = require('crypto');

const { verifyErlcSignature, signForTest } = require('./lib/erlc');
const { createCadMirror, buildCadSummary, findPersonsByDni, buildDniReply } = require('./lib/cad');
const { createBotServer } = require('./lib/server');

let passed = 0;
function ok(cond, label) {
  assert.ok(cond, 'FALLO: ' + label);
  passed++;
  console.log('  ✔', label);
}

(async () => {
  // ---- 1. Firma Ed25519 de los webhooks ----
  console.log('1. Verificación de firmas (Ed25519)');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const pubB64 = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  const body = Buffer.from(JSON.stringify({ Command: ';test' }));
  const ts = String(Date.now());
  const sig = signForTest(privateKey, ts, body);

  ok(verifyErlcSignature({ sigHex: sig, timestamp: ts, rawBody: body, publicKeyB64: pubB64 }), 'firma válida → aceptada');
  ok(!verifyErlcSignature({ sigHex: sig, timestamp: ts, rawBody: Buffer.from('otro cuerpo'), publicKeyB64: pubB64 }), 'cuerpo alterado → rechazado');
  ok(!verifyErlcSignature({ sigHex: 'ab', timestamp: ts, rawBody: body, publicKeyB64: pubB64 }), 'firma falsa → rechazada');
  ok(!verifyErlcSignature({ sigHex: sig, timestamp: '', rawBody: body, publicKeyB64: pubB64 }), 'sin timestamp → rechazada');

  // ---- 2. Detección de novedades del CAD ----
  console.log('2. Detección de novedades del CAD');
  const mirror = createCadMirror();
  const base = {
    calls: [],
    units: [{ id: 'U-1', name: 'L-12', dept: 'LCPD', status: '10-8', operator: 'A. García' }],
    bolos: [],
  };
  ok(mirror.update(base).firstSync === true, 'primera sincronización: no anuncia nada');

  const snap2 = {
    calls: [{
      id: 'C-1', type: 'POLICE', priority: 'Alta', location: 'Ruta 7',
      description: 'Vehículo sospechoso', caller: '911', status: 'pendiente',
      units: [], createdAt: Date.now(),
    }],
    units: base.units,
    bolos: [],
  };
  let res = mirror.update(snap2);
  ok(res.announcements.length === 1 && res.announcements[0].title.includes('Nueva llamada'), 'llamada nueva detectada');

  const snap3 = JSON.parse(JSON.stringify(snap2));
  snap3.calls[0].status = 'despachada';
  snap3.calls[0].units = ['U-1'];
  res = mirror.update(snap3);
  ok(res.announcements.some((a) => a.title.includes('despachada')), 'despacho detectado');
  ok(res.announcements.some((a) => a.title.includes('Unidad asignada')), 'unidad asignada detectada');

  const snap4 = JSON.parse(JSON.stringify(snap3));
  snap4.calls[0].status = 'cerrada';
  snap4.bolos = [{ id: 'B-1', tipo: 'Vehículo', plate: 'ABC 123', description: 'Auto rojo', reason: 'Robo', resolved: false }];
  res = mirror.update(snap4);
  ok(res.announcements.some((a) => a.title.includes('cerrada')), 'cierre de llamada detectado');
  ok(res.announcements.some((a) => a.title.includes('Nuevo BOLO')), 'BOLO nuevo detectado');

  const snap5 = JSON.parse(JSON.stringify(snap4));
  snap5.bolos[0].resolved = true;
  res = mirror.update(snap5);
  ok(res.announcements.length === 1 && res.announcements[0].title.includes('resuelto'), 'BOLO resuelto detectado');

  const summary = buildCadSummary(snap5);
  ok(typeof summary === 'string' && summary.includes('Llamadas abiertas: 0') && summary.includes('L-12'), 'resumen /cad generado');

  // ---- 2b. Búsqueda por DNI (comando /dni) ----
  console.log('2b. Búsqueda por DNI (comando /dni)');
  const snapDni = {
    calls: [], units: [], bolos: [],
    persons: [
      {
        id: 'PER-1', name: 'Juan Pérez', dni: 'C1234567', dob: '1998-03-15',
        sex: 'M', hair: 'Castaño', eyes: 'Marrones', heightCm: 175, weightKg: 72,
        address: '1234 Mission Blvd', city: 'Los Angeles', state: 'CA', zip: '90001',
        issueDate: '2026-01-10', expires: '2030-01-10', robloxUsername: 'JuanRP',
        notes: 'Antecedente por robo (2025).',
      },
      { id: 'PER-2', name: 'Marta Gómez', dni: 'C7654321' },
    ],
    vehicles: [{ id: 'VEH-1', plate: 'ABC 123', owner: 'Juan Pérez', status: 'Robado' }],
    fines: [{ id: 'MUL-1', person: 'Juan Pérez', amount: 500, reason: 'Exceso de velocidad', status: 'pendiente' }],
    warrants: [{ id: 'ORD-1', person: 'Juan Pérez', wkind: 'Arresto', reason: 'Robo', status: 'activa' }],
    reports: [{ id: 'REP-1', title: 'Persecución', rkind: 'Tráfico', involved: 'Juan Pérez', officer: 'Oficial Pérez' }],
  };
  ok(findPersonsByDni(snapDni, 'c-123-4567').length === 1, 'encuentra el DNI C####### aunque se escriba con guiones');
  ok(findPersonsByDni(snapDni, ' C1234567 ')[0].name === 'Juan Pérez', 'encuentra con espacios alrededor');
  ok(findPersonsByDni(snapDni, '111').length === 0, 'DNI inexistente → sin resultados');

  const dniReply = buildDniReply(snapDni, 'C1234567');
  ok(dniReply && dniReply.title.includes('Juan Pérez'), 'respuesta /dni con el nombre');
  ok(dniReply.lines.some((l) => /ANTECEDENTES/.test(l)), 'agrupa los antecedentes en una sola sección');
  ok(dniReply.lines.some((l) => /ÓRDENES ACTIVAS/.test(l)) && dniReply.lines.some((l) => /Arresto/.test(l)), 'incluye órdenes activas');
  ok(dniReply.lines.some((l) => /Multas pendientes: \*\*1\*\*/.test(l)) && dniReply.lines.some((l) => /ABC 123/.test(l)), 'incluye multas y vehículos');
  ok(dniReply.lines.some((l) => /Reportes: \*\*1\*\*/.test(l)) && dniReply.lines.some((l) => /Notas:/.test(l)), 'incluye reportes y notas en antecedentes');
  ok(!dniReply.lines.some((l) => /Licencia/i.test(l)), 'ya no muestra licencia en /dni');
  ok(dniReply.lines.some((l) => /175 cm/.test(l)) && dniReply.lines.some((l) => /@JuanRP/.test(l)), 'incluye datos físicos y Roblox');
  ok(buildDniReply(snapDni, '000000') === null, 'DNI no registrado → null');

  // ---- 3. Servidor HTTP (enlace CAD + webhooks) ----
  console.log('3. Servidor HTTP (enlace CAD + webhook)');
  let cadReceived = null;
  let erlcReceived = null;
  const cfg = { cadKey: 'clave-secreta', port: 0, erlcWebhookPublicKey: pubB64 };
  const srv = await createBotServer({
    cfg,
    onCadSnapshot: async (s) => { cadReceived = s; return 1; },
    onErlcEvent: async (d) => { erlcReceived = d; },
    log: () => {},
  });
  const baseUrl = `http://127.0.0.1:${srv.port}`;

  ok((await (await fetch(baseUrl + '/health')).text()) === 'ok', 'GET /health responde "ok"');

  let r = await fetch(baseUrl + '/cad/snapshot', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  ok(r.status === 401, 'CAD sin clave → 401');

  r = await fetch(baseUrl + '/cad/snapshot', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-cad-key': 'mala' }, body: '{}',
  });
  ok(r.status === 401, 'CAD con clave incorrecta → 401');

  r = await fetch(baseUrl + '/cad/snapshot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cad-key': 'clave-secreta' },
    body: JSON.stringify(snap5),
  });
  const json = await r.json();
  ok(r.status === 200 && json.ok === true && cadReceived && cadReceived.calls.length === 1,
    'CAD con clave correcta → 200 y el bot recibe el estado');

  r = await fetch(baseUrl + '/erlc/webhook', { method: 'POST', body: '{"x":1}' });
  ok(r.status === 401, 'webhook sin firma → 401');

  const evBody = Buffer.from(JSON.stringify({ Player: 'Juan', Team: 'Police' }));
  const ts2 = String(Date.now());
  const sig2 = signForTest(privateKey, ts2, evBody);
  r = await fetch(baseUrl + '/erlc/webhook', {
    method: 'POST',
    headers: { 'X-Signature-Ed25519': sig2, 'X-Signature-Timestamp': ts2 },
    body: evBody,
  });
  ok(r.status === 200 && erlcReceived && erlcReceived.Player === 'Juan',
    'webhook con firma válida → 200 y el bot recibe el evento');

  await srv.close();

  console.log('');
  console.log('✅ PRUEBA BOT OK');
  console.log(`   (${passed} comprobaciones)`);
})().catch((err) => {
  console.error('❌ PRUEBA FALLIDA:', err.message);
  process.exit(1);
});
