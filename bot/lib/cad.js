// Espejo del estado del CAD y detector de novedades.
//
// El CAD (la app de escritorio) envía su estado completo (llamadas, unidades y
// BOLOs) cada vez que algo cambia. Acá lo comparamos con el estado anterior
// para saber exactamente qué anunciar en Discord, sin spamear.
//
// Los catálogos están copiados de src/app.js para que los textos coincidan.

const CALL_TYPES = {
  POLICE: 'Policía',
  MEDICAL: 'Médica',
  FIRE: 'Incendio',
  TRAFFIC: 'Tráfico',
  SUSPECT: 'Sospechoso',
  OTHER: 'Otro',
};

const CALL_STATUSES = {
  pendiente: 'Pendiente',
  despachada: 'Despachada',
  en_escena: 'En escena',
  cerrada: 'Cerrada',
};

const UNIT_STATUSES = {
  '10-8': '10-8 Disponible',
  '10-6': '10-6 Ocupado',
  '10-97': '10-97 En camino',
  '10-23': '10-23 En escena',
  '10-7': '10-7 Fuera de servicio',
};

const DEPT_SHORT = { LCPD: 'LCPD', CHP: 'CHP', LCFD: 'LCFD', DOT: 'DOT', DISPATCH: 'Central' };

// Colores para los embeds de Discord (los mismos tonos que usa el CAD).
const COLORS = {
  Baja: 0x22c55e,
  Media: 0xeab308,
  Alta: 0xf97316,
  'Crítica': 0xef4444,
  despacho: 0x3b82f6,
  bolo: 0xe67e22,
  resuelto: 0x57f287,
  cerrado: 0x95a5a6,
};

const callTypeLabel = (t) => CALL_TYPES[t] || t || 'Otro';
const statusLabel = (s) => CALL_STATUSES[s] || s || '—';

function unitLabel(unit, id) {
  if (!unit) return `🚓 Unidad ${id}`;
  const parts = [`🚓 **${unit.name}**`];
  if (unit.dept) parts.push(DEPT_SHORT[unit.dept] || unit.dept);
  if (unit.operator) parts.push(unit.operator);
  return parts.join(' · ');
}

function unitsLine(call, unitsById) {
  const names = (call.units || [])
    .map((id) => (unitsById.get(id) || {}).name || id)
    .join(', ');
  return `🚓 Unidades: ${names}`;
}

// Compara dos estados y devuelve los anuncios a publicar.
// Cada anuncio: { channel: 'despacho' | 'bolo', color, title, lines: [] }
function diff(prev, next) {
  const out = [];
  const prevCalls = new Map((prev.calls || []).map((c) => [c.id, c]));
  const unitsById = new Map((next.units || []).map((u) => [u.id, u]));

  for (const c of next.calls || []) {
    const old = prevCalls.get(c.id);

    // Llamada nueva
    if (!old) {
      const lines = [
        `**Tipo:** ${callTypeLabel(c.type)}`,
        `**Prioridad:** ${c.priority || '—'}`,
        `📍 **${c.location || 'Sin ubicación'}**`,
      ];
      if (c.description) lines.push(`📝 ${c.description}`);
      if (c.caller) lines.push(`☎️ Reportado por: ${c.caller}`);
      if ((c.units || []).length) lines.push(unitsLine(c, unitsById));
      out.push({
        channel: 'despacho',
        color: COLORS[c.priority] || COLORS.despacho,
        title: `🚨 Nueva llamada ${c.id}`,
        lines,
      });
      continue;
    }

    // Cambios de estado de la llamada
    if (old.status !== c.status) {
      let title = `🔄 Llamada ${c.id} → ${statusLabel(c.status)}`;
      let color = COLORS.despacho;
      const lines = [`📍 ${c.location || 'Sin ubicación'}`];

      if (c.status === 'despachada') {
        title = `📟 Llamada ${c.id} despachada`;
        if ((c.units || []).length) lines.push(unitsLine(c, unitsById));
      } else if (c.status === 'en_escena') {
        title = `🚔 Unidades en escena · llamada ${c.id}`;
        color = 0xa855f7;
        if ((c.units || []).length) lines.push(unitsLine(c, unitsById));
      } else if (c.status === 'cerrada') {
        title = `✅ Llamada ${c.id} cerrada`;
        color = COLORS.cerrado;
      }

      out.push({ channel: 'despacho', color, title, lines });
    }

    // Unidades recién asignadas a una llamada ya conocida
    const oldUnits = new Set(old.units || []);
    for (const uid of c.units || []) {
      if (oldUnits.has(uid)) continue;
      out.push({
        channel: 'despacho',
        color: COLORS.despacho,
        title: `📟 Unidad asignada a la llamada ${c.id}`,
        lines: [unitLabel(unitsById.get(uid), uid), `📍 ${c.location || ''}`.trim()],
      });
    }
  }

  // BOLOs
  const prevBolos = new Map((prev.bolos || []).map((b) => [b.id, b]));
  for (const b of next.bolos || []) {
    const old = prevBolos.get(b.id);
    if (!old) {
      const lines = [b.description || 'Sin descripción'];
      if (b.plate) lines.push(`🔢 Placa/ID: ${b.plate}`);
      if (b.reason) lines.push(`📄 Motivo: ${b.reason}`);
      out.push({
        channel: 'bolo',
        color: COLORS.bolo,
        title: `🚨 Nuevo BOLO ${b.id} · ${b.tipo || ''}`.trim(),
        lines,
      });
    } else if (!old.resolved && b.resolved) {
      out.push({
        channel: 'bolo',
        color: COLORS.resuelto,
        title: `✅ BOLO ${b.id} resuelto`,
        lines: [b.description || 'Sin descripción'],
      });
    }
  }

  return out;
}

// Espejo con memoria: guarda el último estado y entrega los anuncios nuevos.
function createCadMirror() {
  let last = null;
  return {
    hasData: () => !!last,
    get: () => last,
    update(snapshot) {
      const firstSync = !last;
      const announcements = firstSync ? [] : diff(last, snapshot); // la primera vez solo memorizamos
      last = snapshot;
      return { announcements, firstSync };
    },
  };
}

// Resumen para el comando /cad de Discord.
function buildCadSummary(snapshot) {
  if (!snapshot) return null;
  const unitsById = new Map((snapshot.units || []).map((u) => [u.id, u]));
  const open = (snapshot.calls || [])
    .filter((c) => c.status !== 'cerrada')
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const bolos = (snapshot.bolos || []).filter((b) => !b.resolved);
  const inService = (snapshot.units || []).filter((u) => u.status !== '10-7');

  const lines = [`🚨 **Llamadas abiertas: ${open.length}**`];
  for (const c of open.slice(0, 10)) {
    const us = (c.units || []).map((id) => (unitsById.get(id) || {}).name || id).join(', ');
    lines.push(
      `> **${c.id}** · ${callTypeLabel(c.type)} · ${c.priority || '—'} · 📍 ${c.location || ''}` +
      (us ? ` · 🚓 ${us}` : '')
    );
  }
  if (open.length > 10) lines.push(`> …y ${open.length - 10} más`);

  lines.push('', `🚓 **Unidades en servicio: ${inService.length}**`);
  for (const u of inService.slice(0, 12)) {
    lines.push(`> **${u.name}** · ${DEPT_SHORT[u.dept] || u.dept || '—'} · ${UNIT_STATUSES[u.status] || u.status}`);
  }
  if (inService.length > 12) lines.push(`> …y ${inService.length - 12} más`);

  if (bolos.length) {
    lines.push('', `🔎 **BOLOs activos: ${bolos.length}**`);
    for (const b of bolos.slice(0, 6)) {
      lines.push(`> **${b.id}** (${b.tipo || ''}) ${b.description || ''}`.trim());
    }
  }

  return lines.join('\n').slice(0, 3900);
}

// ---- Búsqueda por DNI (para el comando /dni de Discord) ----

// Normaliza un DNI: sin espacios ni puntos/guiones, en minúsculas.
function normalizeDni(s) {
  return String(s ?? '').trim().toLowerCase().replace(/[\s.\-]/g, '');
}

function sameName(a, b) {
  return String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
}

// Personas del CAD cuyo DNI coincide con lo que se buscó.
function findPersonsByDni(snapshot, query) {
  const q = normalizeDni(query);
  if (!snapshot || !q) return [];
  return (snapshot.persons || []).filter((p) => normalizeDni(p.dni) === q);
}

// Respuesta lista para el embed de /dni: { title, color, lines }.
function buildDniReply(snapshot, query) {
  const matches = findPersonsByDni(snapshot, query);
  if (!matches.length) return null;
  const p = matches[0];

  const warrants = (snapshot.warrants || []).filter((w) => w.status === 'activa' && sameName(w.person, p.name));
  const fines = (snapshot.fines || []).filter((f) => f.status !== 'pagada' && sameName(f.person, p.name));
  const reports = (snapshot.reports || []).filter((r) =>
    sameName(r.officer, p.name) || String(r.involved || '').toLowerCase().includes(String(p.name || '').toLowerCase())
  );
  const vehicles = (snapshot.vehicles || []).filter((v) => sameName(v.owner, p.name));
  const totalFines = fines.reduce((sum, f) => sum + (Number(f.amount) || 0), 0);
  const color = warrants.length ? 0xef4444 : fines.length ? 0xeab308 : 0x22c55e;

  const sexLabel = { M: 'Masculino (M)', F: 'Femenino (F)', X: 'No binario (X)' }[String(p.sex || '').toUpperCase()] || p.sex || '—';
  const address = [p.address, p.city, [p.state, p.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const physical = [];
  if (p.hair || p.eyes) physical.push(`💇 **Cabello / ojos:** ${p.hair || '—'} / ${p.eyes || '—'}`);
  if (p.heightCm || p.weightKg) physical.push(`📏 **Altura / peso:** ${p.heightCm ? p.heightCm + ' cm' : '—'} / ${p.weightKg ? p.weightKg + ' kg' : '—'}`);

  const lines = [
    `🪪 **DNI:** ${p.dni || '—'}`,
    `👤 **Nombre:** ${p.name || '—'}`,
    `🎂 **Nacimiento:** ${p.dob || '—'} · **Sexo:** ${sexLabel}`,
  ];
  lines.push(...physical);
  if (address) lines.push(`📍 **Dirección:** ${address}`);
  if (p.issueDate || p.expires) lines.push(`📅 **Emitido / vence:** ${p.issueDate || '—'} / ${p.expires || '—'}`);
  if (p.robloxUsername) lines.push(`🕹️ **Roblox:** @${p.robloxUsername}`);

  lines.push('', '📋 **ANTECEDENTES**');
  if (warrants.length) {
    lines.push(`⚖️ **ÓRDENES ACTIVAS: ${warrants.length}** ⚠️`);
    for (const w of warrants.slice(0, 4)) lines.push(`> ${w.wkind || 'Orden'}: ${w.reason || ''}`);
  }
  lines.push(fines.length
    ? `🧾 Multas pendientes: **${fines.length}** (total $${totalFines})`
    : '🧾 Sin multas pendientes');
  if (reports.length) {
    lines.push(`📝 Reportes: **${reports.length}**`);
    for (const r of reports.slice(0, 3)) lines.push(`> ${r.title || 'Reporte'}${r.rkind ? ' · ' + r.rkind : ''}`);
  }
  if (p.notes) lines.push(`📝 Notas: ${p.notes}`);
  if (!warrants.length && !fines.length && !reports.length && !p.notes) {
    lines.push('✅ Sin antecedentes registrados');
  }

  if (vehicles.length) {
    lines.push('', '🚓 Vehículos a su nombre: ' +
      vehicles.slice(0, 5).map((v) => v.plate + (v.status === 'Robado' ? ' (⚠️ ROBADO)' : '')).join(', '));
  }
  if (matches.length > 1) lines.push('', `ℹ️ Hay ${matches.length - 1} persona(s) más con ese mismo DNI.`);

  return { title: `👤 ${p.name}`, color, lines };
}

module.exports = {
  CALL_TYPES,
  CALL_STATUSES,
  UNIT_STATUSES,
  DEPT_SHORT,
  diff,
  createCadMirror,
  buildCadSummary,
  normalizeDni,
  findPersonsByDni,
  buildDniReply,
};
