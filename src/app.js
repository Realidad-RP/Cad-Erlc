// ============================================================
//  CAD | AYUNTAMIENTO | Los Angeles — lógica de la interfaz
// ============================================================
// Aquí vive el despacho (llamadas, unidades, roster, BOLOs, historial),
// la conexión con el radio de voz y los ajustes de push-to-talk.

// ============================================================
// 1. Catálogos
// ============================================================

const DEPARTMENTS = {
  LCPD:     { short: 'LCPD',    name: 'LCPD · Policía',      color: '#3b82f6' },
  CHP:      { short: 'CHP',     name: 'CHP · Highway Patrol', color: '#eab308' },
  LCFD:     { short: 'LCFD',    name: 'LCFD · Bomberos/EMS', color: '#ef4444' },
  DOT:      { short: 'DOT',     name: 'DOT · Transporte',    color: '#a855f7' },
  DISPATCH: { short: 'Central', name: 'Central de Despacho', color: '#10b981' },
};

const UNIT_STATUSES = {
  '10-8':  { label: '10-8 · Disponible',        color: '#22c55e' },
  '10-6':  { label: '10-6 · Ocupado',           color: '#eab308' },
  '10-97': { label: '10-97 · En camino',        color: '#3b82f6' },
  '10-23': { label: '10-23 · En escena',        color: '#a855f7' },
  '10-7':  { label: '10-7 · Fuera de servicio', color: '#64748b' },
};

const CALL_TYPES = {
  POLICE:  { label: 'Policía',    color: '#3b82f6' },
  MEDICAL: { label: 'Médica',     color: '#ef4444' },
  FIRE:    { label: 'Incendio',   color: '#f97316' },
  TRAFFIC: { label: 'Tráfico',    color: '#eab308' },
  SUSPECT: { label: 'Sospechoso', color: '#a855f7' },
  OTHER:   { label: 'Otro',       color: '#64748b' },
};

const CALL_PRIORITIES = { Baja: '#22c55e', Media: '#eab308', Alta: '#f97316', Crítica: '#ef4444' };

const CALL_STATUSES = {
  pendiente:  { label: 'Pendiente',  color: '#eab308' },
  despachada: { label: 'Despachada', color: '#3b82f6' },
  en_escena:  { label: 'En escena',  color: '#a855f7' },
  cerrada:    { label: 'Cerrada',    color: '#64748b' },
};

// ============================================================
// 2. Base de datos local (se guarda dentro de la app)
// ============================================================

const STORAGE_KEY = 'cad-erlc-v1';
let db = { seq: 1, calls: [], units: [], roster: [], bolos: [], log: [], persons: [], vehicles: [], fines: [], warrants: [], reports: [] };

function loadDb() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) db = Object.assign(db, JSON.parse(raw));
  } catch (err) {
    console.warn('No se pudo cargar la base local:', err);
  }
  // Asegurar que existan todas las listas (bases de versiones anteriores)
  for (const k of ['calls', 'units', 'roster', 'bolos', 'log', 'persons', 'vehicles', 'fines', 'warrants', 'reports']) {
    if (!Array.isArray(db[k])) db[k] = [];
  }
  // Unidades de versiones anteriores: un solo operador → lista de oficiales.
  for (const u of db.units) {
    if (!Array.isArray(u.officers)) u.officers = u.operator ? [u.operator] : [];
    u.officers = u.officers
      .map((n) => String(n || '').trim())
      .filter((n, i, arr) => n && arr.findIndex((x) => x.toLowerCase() === n.toLowerCase()) === i);
    if (!u.operator && u.officers.length) u.operator = u.officers[0];
  }
}

function saveDb() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); } catch {}
  linkPushSoon(); // avisar al bot de Discord (si el enlace está configurado)
}

function nextId(prefix) { return prefix + '-' + (db.seq++); }

function addLog(text) {
  db.log.unshift({ ts: Date.now(), text });
  if (db.log.length > 500) db.log.length = 500;
}

// ============================================================
// 3. Utilidades
// ============================================================

const $ = (sel) => document.querySelector(sel);

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function fmtTime(ts) {
  return new Date(ts).toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

// Roles que el propietario puede asignar (el Propietario se crea con su contraseña)
const ROLES_ASSIGNABLE = ['Miembro', 'Despachador', 'Supervisor', 'Administrador'];

// En esta PC se recuerdan la contraseña del propietario y los roles asignados
// (para restaurarlos si el servidor de la nube se reinicia y los olvida)
const OWNER_PASS_KEY = 'cad-erlc-owner-pass';
const ROLES_CACHE_KEY = 'cad-erlc-roles-cache';
let pendingOwnerPass = '';
let ownerAutoTried = false; // evita reintentos en bucle si el servidor rechaza la restauración

function getOwnerPass() {
  try { return localStorage.getItem(OWNER_PASS_KEY) || ''; } catch { return ''; }
}

function setOwnerPass(pass) {
  try {
    if (pass) localStorage.setItem(OWNER_PASS_KEY, pass);
    else localStorage.removeItem(OWNER_PASS_KEY);
  } catch {}
}

function deptInfo(key) {
  return DEPARTMENTS[key] || { short: key || '—', name: key || 'Sin departamento', color: '#64748b' };
}

function deptBadgeHtml(key) {
  const d = deptInfo(key);
  return `<span class="badge" style="color:${d.color};border-color:${d.color}66;background:${d.color}30">${esc(d.short)}</span>`;
}

const ROLE_BADGES = {
  Propietario:   { icon: '👑', color: '#eab308' },
  Administrador: { icon: '🛡️', color: '#3b82f6' },
  Supervisor:    { icon: '⭐', color: '#10b981' },
  Despachador:   { icon: '🎧', color: '#a855f7' },
  Miembro:       { icon: '🚓', color: '#94a3b8' },
};

// Qué secciones ve cada rango. null = todas (el Propietario).
// El Historial queda SIEMPRE solo para el Propietario.
const ROLE_SECTIONS = {
  Propietario:   null,
  Administrador: ['despacho', 'mapa', 'unidades', 'roster', 'bolos', 'vehiculos', 'multas', 'ordenes', 'registros', 'audio'],
  Supervisor:    ['despacho', 'mapa', 'unidades', 'roster', 'bolos', 'vehiculos', 'multas', 'ordenes', 'registros', 'audio'],
  Despachador:   ['despacho', 'roster', 'ordenes', 'audio'],
  // Los oficiales conservan las herramientas de policía; el Historial es solo del Propietario.
  Miembro:       ['despacho', 'mapa', 'unidades', 'roster', 'bolos', 'vehiculos', 'multas', 'ordenes', 'registros', 'audio'],
};

// Usuario y rango recordados en esta PC
const SESSION_KEY = 'cad-erlc-session';
const LAST_ROLE_KEY = 'cad-erlc-last-role';
let currentUserName = '';
let currentRole = 'Miembro';

function isStaffRole(role) {
  return ['Propietario', 'Administrador', 'Supervisor'].includes(role || currentRole);
}

function sectionAllowed(tab) {
  if (currentRole === 'Propietario') return true;
  return (ROLE_SECTIONS[currentRole] || ROLE_SECTIONS.Miembro).includes(tab);
}

function currentOfficerName() {
  const input = $('#radio-name');
  return currentUserName || (input && input.value.trim()) || 'Oficial';
}

function readSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}

function saveSession() {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ name: currentUserName, role: currentRole, at: Date.now() }));
  } catch {}
}

function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch {}
}

function cachedRoleFor(name) {
  try {
    const map = JSON.parse(localStorage.getItem(ROLES_CACHE_KEY) || '{}');
    if (name && map[name]) return map[name];
  } catch {}
  return '';
}

function resolveRoleForName(name) {
  // Solo el rol guardado para ESE nombre. El Propietario se recupera con su
  // contraseña al conectar la radio (auto-login), no se hereda entre nombres.
  return cachedRoleFor(name) || 'Miembro';
}

function setCurrentRole(role) {
  const next = role || 'Miembro';
  if (next === currentRole) { applyRoleUI(); return; }
  currentRole = next;
  try { localStorage.setItem(LAST_ROLE_KEY, next); } catch {}
  saveSession();
  applyRoleUI();
}

// Aplica el rango a la interfaz: pestañas, historial y ficha de usuario.
function applyRoleUI() {
  if (Radio.state.connected && Radio.state.role) currentRole = Radio.state.role;
  const chip = $('#user-chip');
  if (chip) {
    const b = ROLE_BADGES[currentRole];
    chip.textContent = currentUserName
      ? '👤 ' + currentUserName + (b ? ' · ' + b.icon + ' ' + currentRole : ' · ' + currentRole)
      : '👤 Invitado';
    chip.classList.toggle('hidden', !currentUserName);
  }
  const logout = $('#logout-btn');
  if (logout) logout.classList.toggle('hidden', !currentUserName);

  document.querySelectorAll('.tab').forEach((btn) => {
    const tab = btn.dataset.tab;
    let show = sectionAllowed(tab);
    if (tab === 'erlc') show = show && erlcCanView();
    btn.classList.toggle('hidden', !show);
  });

  const clear = $('#log-clear');
  if (clear) clear.classList.toggle('hidden', currentRole !== 'Propietario');

  // Si la pestaña actual ya no está permitida, ir a la primera disponible.
  const active = document.querySelector('.tab.active');
  if (active && active.classList.contains('hidden')) {
    const first = Array.from(document.querySelectorAll('.tab')).find((b) => !b.classList.contains('hidden'));
    if (first) first.click();
  }
}

function roleBadgeHtml(role) {
  const r = ROLE_BADGES[role];
  if (!r) return '';
  return `<span class="badge" title="${esc(role)}" style="color:${r.color};border-color:${r.color}66;background:${r.color}30">${r.icon}</span>`;
}

let toastTimer = null;
function flash(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ============================================================
// 4. Render del despacho
// ============================================================

function renderAll() {
  renderCalls();
  renderUnits();
  renderRoster();
  renderBolos();
  renderVehiculos();
  renderMultas();
  renderOrdenes();
  renderStats();
  renderTabBadges();
  renderRegistros();
  renderLog();
}

function callCardHtml(c) {
  const t = CALL_TYPES[c.type] || CALL_TYPES.OTHER;
  const p = CALL_PRIORITIES[c.priority] || '#64748b';
  const st = CALL_STATUSES[c.status] || CALL_STATUSES.pendiente;

  const assigned = c.units.map((uid) => {
    const u = db.units.find((x) => x.id === uid);
    if (!u) return '';
    const short = (UNIT_STATUSES[u.status] || { label: u.status }).label.split('·')[0].trim();
    return `<span class="chip">${esc(u.name)} <em>${esc(short)}</em></span>`;
  }).join('');

  const freeUnits = db.units.filter((u) => u.status === '10-8');
  const freeOptions = freeUnits
    .map((u) => `<option value="${u.id}">${esc(u.name)} (${esc(deptInfo(u.dept).short)})</option>`)
    .join('');

  const actions = [];
  if (c.status !== 'cerrada') {
    if (freeUnits.length) {
      actions.push(`<select class="unit-select" data-id="${c.id}"><option value="">Elegir unidad…</option>${freeOptions}</select>`);
      actions.push(`<button class="btn btn-small btn-primary" data-action="dispatch" data-id="${c.id}">📟 Despachar</button>`);
    } else if (c.status === 'pendiente') {
      actions.push('<span class="muted small">Sin unidades disponibles</span>');
    }
    if (c.status === 'despachada') {
      actions.push(`<button class="btn btn-small" data-action="scene" data-id="${c.id}">📍 Marcar en escena</button>`);
    }
    actions.push(`<button class="btn btn-small btn-ok" data-action="close" data-id="${c.id}">✔ Cerrar</button>`);
  }
  actions.push(`<button class="btn btn-small btn-danger" data-action="delete" data-id="${c.id}">🗑</button>`);

  return `
  <div class="card" style="border-left-color:${t.color}">
    <div class="card-head">
      <span class="pill" style="color:${t.color};background:${t.color}1c">${esc(t.label)}</span>
      <span class="pill" style="color:${p};background:${p}1c">Prioridad ${esc(c.priority)}</span>
      <span class="pill" style="color:${st.color};background:${st.color}1c">${esc(st.label)}</span>
      <span class="muted small">#${esc(c.id)} · ${fmtTime(c.createdAt)}</span>
    </div>
    <div class="card-body">
      <div class="card-location">📍 ${esc(c.location)}</div>
      ${c.description ? `<div class="muted">${esc(c.description)}</div>` : ''}
      ${c.caller ? `<div class="muted small">Reportado por: ${esc(c.caller)}</div>` : ''}
      ${assigned ? `<div class="chips">${assigned}</div>` : ''}
    </div>
    <div class="card-actions">${actions.join('')}</div>
  </div>`;
}

function sectionHtml(title, count, body, cls = '') {
  return `<section class="section-block ${cls}">
    <div class="section-head"><h3>${title}</h3><span class="section-count">${count}</span></div>
    ${body}
  </section>`;
}

function renderCalls() {
  const cont = $('#calls-list');
  const calls = [...db.calls].sort((a, b) => {
    const openA = a.status === 'cerrada' ? 1 : 0;
    const openB = b.status === 'cerrada' ? 1 : 0;
    return openA - openB || b.createdAt - a.createdAt;
  });
  if (!calls.length) {
    cont.innerHTML = '<div class="empty">Sin llamadas.</div>';
    return;
  }
  const groups = [
    { title: '🚨 Pendientes', list: calls.filter((c) => c.status === 'pendiente') },
    { title: '📟 Activas', list: calls.filter((c) => c.status === 'despachada' || c.status === 'en_escena') },
    { title: '✅ Cerradas', list: calls.filter((c) => c.status === 'cerrada') },
  ];
  cont.innerHTML = groups.filter((g) => g.list.length)
    .map((g) => sectionHtml(g.title, g.list.length, `<div class="cards">${g.list.map(callCardHtml).join('')}</div>`))
    .join('');
}

// ============================================================
// 5. Acciones del despacho
// ============================================================

function dispatchUnit(call, unitId) {
  const unit = db.units.find((u) => u.id === unitId);
  if (!unit) return;
  unit.status = '10-97';
  unit.callId = call.id;
  if (!call.units.includes(unitId)) call.units.push(unitId);
  if (call.status === 'pendiente') call.status = 'despachada';
  addLog(`Unidad ${unit.name} despachada a la llamada #${call.id} (${call.location})`);
}

function freeCallUnits(call) {
  for (const uid of call.units) {
    const u = db.units.find((x) => x.id === uid);
    if (u) {
      u.status = '10-8';
      u.callId = null;
    }
  }
}

function closeCall(call) {
  call.status = 'cerrada';
  freeCallUnits(call);
  addLog(`Llamada #${call.id} cerrada (${call.location})`);
}

$('#calls-list').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const call = db.calls.find((c) => c.id === btn.dataset.id);
  if (!call) return;

  const action = btn.dataset.action;

  if (action === 'dispatch') {
    const sel = document.querySelector(`.unit-select[data-id="${call.id}"]`);
    const unitId = sel ? sel.value : '';
    if (!unitId) { flash('Elige una unidad para despachar.'); return; }
    dispatchUnit(call, unitId);
  } else if (action === 'scene') {
    call.status = 'en_escena';
    for (const uid of call.units) {
      const u = db.units.find((x) => x.id === uid);
      if (u) u.status = '10-23';
    }
    addLog(`Llamada #${call.id}: unidades EN ESCENA`);
  } else if (action === 'close') {
    closeCall(call);
  } else if (action === 'delete') {
    if (!confirm(`¿Eliminar la llamada #${call.id}?`)) return;
    freeCallUnits(call);
    db.calls = db.calls.filter((c) => c.id !== call.id);
    addLog(`Llamada #${call.id} eliminada`);
  }

  saveDb();
  renderAll();
});

// ============================================================
// 6. Render de unidades
// ============================================================

function setUnitStatus(unit, status) {
  unit.status = status;
  if (status === '10-8' || status === '10-7') {
    if (unit.callId) {
      const call = db.calls.find((c) => c.id === unit.callId);
      if (call) call.units = call.units.filter((x) => x !== unit.id);
      unit.callId = null;
    }
  }
  addLog(`Unidad ${unit.name} → ${(UNIT_STATUSES[status] || { label: status }).label}`);
}

// Oficiales de una unidad (compatible con unidades viejas de un solo operador)
function unitOfficers(u) {
  if (Array.isArray(u.officers) && u.officers.length) return u.officers;
  return u.operator ? [u.operator] : [];
}

function unitsOfOfficer(name) {
  const who = String(name || '').trim().toLowerCase();
  if (!who) return [];
  return db.units.filter((u) => unitOfficers(u).some((n) => String(n).trim().toLowerCase() === who));
}

function myUnit() {
  return unitsOfOfficer(currentOfficerName())[0] || null;
}

function isUnitMember(u) {
  const who = currentOfficerName().toLowerCase();
  return unitOfficers(u).some((n) => String(n).trim().toLowerCase() === who);
}

function unitRowHtml(u) {
  const st = UNIT_STATUSES[u.status] || UNIT_STATUSES['10-8'];
  const call = u.callId ? db.calls.find((c) => c.id === u.callId) : null;
  const me = currentOfficerName();
  const mine = isUnitMember(u);
  const staff = isStaffRole();
  const canEdit = mine || staff;
  const canJoin = !myUnit() && !mine;
  const officers = unitOfficers(u);
  const options = Object.entries(UNIT_STATUSES)
    .map(([k, v]) => `<option value="${k}" ${k === u.status ? 'selected' : ''}>${esc(v.label)}</option>`)
    .join('');
  const officersHtml = officers.length
    ? officers.map((n) => `<span class="unit-officer${String(n).toLowerCase() === me.toLowerCase() ? ' me' : ''}">${esc(n)}</span>`).join('')
    : '<span class="muted">—</span>';
  const canDelete = staff || (mine && officers.length <= 1);
  return `<tr>
      <td><strong>${esc(u.name)}</strong></td>
      <td>${deptBadgeHtml(u.dept)}</td>
      <td><div class="unit-officers">${officersHtml}</div></td>
      <td><span class="pill" style="color:${st.color};background:${st.color}1c">${esc(st.label)}</span></td>
      <td>${call ? esc('#' + call.id + ' · ' + call.location) : '<span class="muted">—</span>'}</td>
      <td class="row-actions">
        <div class="unit-actions">
          <select class="status-select" data-id="${u.id}" ${canEdit ? '' : 'disabled'} title="${canEdit ? 'Cambiar estado' : 'Solo los oficiales de esta unidad pueden cambiarla'}">${options}</select>
          ${canJoin ? `<button class="btn btn-small" data-action="unit-join" data-id="${u.id}" title="Unirme a esta unidad">➕ Unirme</button>` : ''}
          ${mine ? `<button class="btn btn-small" data-action="unit-leave" data-id="${u.id}" title="Salir de esta unidad">🚪 Salir</button>` : ''}
          ${canDelete ? `<button class="btn btn-small btn-danger" data-action="unit-delete" data-id="${u.id}" title="Eliminar unidad">🗑</button>` : ''}
          ${!canEdit ? '<span class="unit-lock" title="Solo los oficiales de esta unidad pueden modificarla">🔒</span>' : ''}
        </div>
      </td>
    </tr>`;
}

function renderUnits() {
  const cont = $('#units-sections');
  const opInput = $('#unit-operator');
  if (opInput && !opInput.value && currentUserName) opInput.value = currentUserName;
  if (!db.units.length) {
    cont.innerHTML = '<div class="empty">Sin unidades. Creá la primera o unite a una existente.</div>';
    return;
  }
  const groups = [
    { title: '🟢 Disponibles', list: db.units.filter((u) => u.status === '10-8') },
    { title: '🔵 En servicio', list: db.units.filter((u) => u.status === '10-97' || u.status === '10-23') },
    { title: '🟡 Ocupadas', list: db.units.filter((u) => u.status === '10-6') },
    { title: '⚪ Fuera de servicio', list: db.units.filter((u) => u.status === '10-7') },
  ];
  cont.innerHTML = groups.filter((g) => g.list.length).map((g) => sectionHtml(
    g.title, g.list.length,
    `<table class="table"><thead><tr><th>Indicativo</th><th>Departamento</th><th>Oficiales en la unidad</th><th>Estado</th><th>Llamada</th><th></th></tr></thead><tbody>${g.list.map(unitRowHtml).join('')}</tbody></table>`,
    'table-section',
  )).join('');
}

$('#units-sections').addEventListener('change', (e) => {
  const sel = e.target.closest('.status-select');
  if (!sel) return;
  const unit = db.units.find((u) => u.id === sel.dataset.id);
  if (!unit) return;
  if (!isUnitMember(unit) && !isStaffRole()) {
    flash('⛔ Solo los oficiales de esa unidad pueden cambiar su estado.');
    renderAll();
    return;
  }
  setUnitStatus(unit, sel.value);
  saveDb();
  renderAll();
});

$('#units-sections').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const unit = db.units.find((u) => u.id === btn.dataset.id);
  if (!unit) return;

  if (btn.dataset.action === 'unit-join') {
    const actual = myUnit();
    if (actual && actual.id !== unit.id) {
      flash('⚠️ Ya estás en la unidad ' + actual.name + '. Salí de ella para unirte a otra.');
      return;
    }
    const me = currentOfficerName();
    const current = unitOfficers(unit);
    if (current.some((n) => String(n).toLowerCase() === me.toLowerCase())) return;
    unit.officers = current.slice();
    unit.officers.push(me);
    if (!unit.operator) unit.operator = me;
    addLog(`Unidad ${unit.name}: se unió ${me}`);
    saveDb();
    renderAll();
    flash('✅ Te uniste a la unidad ' + unit.name);
    return;
  }

  if (btn.dataset.action === 'unit-leave') {
    const me = currentOfficerName();
    unit.officers = unitOfficers(unit).filter((n) => String(n).toLowerCase() !== me.toLowerCase());
    if (unit.operator && String(unit.operator).toLowerCase() === me.toLowerCase()) {
      unit.operator = unit.officers[0] || '';
    }
    addLog(`Unidad ${unit.name}: salió ${me}`);
    saveDb();
    renderAll();
    flash('Saliste de la unidad ' + unit.name);
    return;
  }

  if (btn.dataset.action === 'unit-delete') {
    const officers = unitOfficers(unit);
    const allowed = isStaffRole() || (isUnitMember(unit) && officers.length <= 1);
    if (!allowed) {
      flash('⛔ Solo el Propietario/Administrador o el último oficial de la unidad pueden eliminarla.');
      return;
    }
    if (!confirm(`¿Eliminar la unidad ${unit.name}?`)) return;
    if (unit.callId) {
      const call = db.calls.find((c) => c.id === unit.callId);
      if (call) call.units = call.units.filter((x) => x !== unit.id);
    }
    db.units = db.units.filter((u) => u.id !== unit.id);
    addLog(`Unidad ${unit.name} eliminada`);
    saveDb();
    renderAll();
  }
});

// ============================================================
// 7. Render del roster
// ============================================================

function renderRoster() {
  const cont = $('#roster-sections');
  if (!db.roster.length) {
    cont.innerHTML = '<div class="empty">Roster vacío.</div>';
    return;
  }
  const byDept = {};
  for (const p of db.roster) (byDept[p.dept] ||= []).push(p);
  cont.innerHTML = Object.entries(byDept).map(([dept, list]) => sectionHtml(
    deptBadgeHtml(dept), list.length,
    `<table class="table"><thead><tr><th>Nombre</th><th>Rango</th><th></th></tr></thead><tbody>${list.map((p) => `<tr>
      <td><strong>${esc(p.name)}</strong></td>
      <td>${esc(p.rank)}</td>
      <td class="row-actions"><button class="btn btn-small btn-danger" data-action="roster-delete" data-id="${p.id}">🗑</button></td>
    </tr>`).join('')}</tbody></table>`,
    'table-section',
  )).join('');
}

$('#roster-sections').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action="roster-delete"]');
  if (!btn) return;
  const p = db.roster.find((x) => x.id === btn.dataset.id);
  if (!p) return;
  if (!confirm(`¿Quitar a ${p.name} del roster?`)) return;
  db.roster = db.roster.filter((x) => x.id !== p.id);
  addLog(`Roster: ${p.name} (${p.rank}) eliminado`);
  saveDb();
  renderAll();
});

// ============================================================
// 8. Render de BOLOs
// ============================================================

function boloCardHtml(b) {
  const active = !b.resolved;
  const color = b.tipo === 'Vehículo' ? '#f59e0b' : '#a855f7';
  return `<div class="card ${active ? '' : 'card-done'}" style="border-left-color:${color}">
      <div class="card-head">
        <span class="pill" style="color:${color};background:${color}1c">${esc(b.tipo)}</span>
        ${active ? '' : '<span class="pill" style="color:#22c55e;background:#22c55e1c">Resuelto</span>'}
        <span class="muted small">#${esc(b.id)} · ${fmtTime(b.createdAt)}</span>
      </div>
      <div class="card-body">
        <div>${esc(b.description)}</div>
        ${b.plate ? `<div class="muted">Placa / ID: <strong>${esc(b.plate)}</strong></div>` : ''}
        ${b.reason ? `<div class="muted small">Motivo: ${esc(b.reason)}</div>` : ''}
      </div>
      <div class="card-actions">
        ${active ? `<button class="btn btn-small btn-ok" data-action="bolo-resolve" data-id="${b.id}">✔ Resuelto</button>` : ''}
        <button class="btn btn-small btn-danger" data-action="bolo-delete" data-id="${b.id}">🗑</button>
      </div>
    </div>`;
}

function renderBolos() {
  const cont = $('#bolos-list');
  if (!db.bolos.length) {
    cont.innerHTML = '<div class="empty">Sin BOLOs.</div>';
    return;
  }
  const active = db.bolos.filter((b) => !b.resolved);
  const done = db.bolos.filter((b) => b.resolved);
  cont.innerHTML =
    (active.length ? sectionHtml('🚨 Activos', active.length, `<div class="cards">${active.map(boloCardHtml).join('')}</div>`) : '') +
    (done.length ? sectionHtml('✅ Resueltos', done.length, `<div class="cards">${done.map(boloCardHtml).join('')}</div>`, 'section-done') : '');
}

$('#bolos-list').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const b = db.bolos.find((x) => x.id === btn.dataset.id);
  if (!b) return;

  if (btn.dataset.action === 'bolo-resolve') {
    b.resolved = true;
    addLog(`BOLO #${b.id} resuelto`);
  } else if (btn.dataset.action === 'bolo-delete') {
    if (!confirm(`¿Eliminar el BOLO #${b.id}?`)) return;
    db.bolos = db.bolos.filter((x) => x.id !== b.id);
    addLog(`BOLO #${b.id} eliminado`);
  }

  saveDb();
  renderAll();
});

// ============================================================
// 8b. Secciones de datos: resumen, vehículos, multas y órdenes
// ============================================================

function renderStats() {
  const cont = $('#stats-row');
  if (!cont) return;
  const cards = [
    { icon: '🚨', label: 'Llamadas activas', value: db.calls.filter((c) => c.status !== 'cerrada').length, tab: 'despacho' },
    { icon: '🚓', label: 'Unidades disponibles', value: `${db.units.filter((u) => u.status === '10-8').length}/${db.units.length}`, tab: 'unidades' },
    { icon: '🔎', label: 'BOLOs activos', value: db.bolos.filter((b) => !b.resolved).length, tab: 'bolos' },
    { icon: '🚗', label: 'Vehículos robados', value: db.vehicles.filter((v) => v.status === 'Robado').length, tab: 'vehiculos' },
    { icon: '🧾', label: 'Multas pendientes', value: db.fines.filter((f) => f.status !== 'pagada').length, tab: 'multas' },
  ];
  cont.innerHTML = cards.map((c) => `
    <button class="stat-card" type="button" data-go-tab="${c.tab}">
      <span class="stat-icon">${c.icon}</span>
      <span class="stat-info"><span class="stat-value">${c.value}</span><span class="stat-label">${c.label}</span></span>
    </button>`).join('');
}

function renderTabBadges() {
  const counts = {
    despacho: db.calls.filter((c) => c.status !== 'cerrada').length,
    unidades: db.units.filter((u) => u.status === '10-8').length,
    bolos: db.bolos.filter((b) => !b.resolved).length,
    vehiculos: db.vehicles.filter((v) => v.status === 'Robado').length,
    multas: db.fines.filter((f) => f.status !== 'pagada').length,
    ordenes: db.warrants.filter((w) => w.status === 'activa').length,
  };
  document.querySelectorAll('.tab-count').forEach((el) => {
    const n = counts[el.dataset.count] || 0;
    el.textContent = n ? n : '';
    el.classList.toggle('hidden', !n);
  });
}

let vehFilter = 'todos';
let fineFilter = 'todas';
let warrantFilter = 'todas';

function openRecDetail(kind, id) {
  recDetail = { kind, id };
  renderAll();
  const tab = document.querySelector('.tab[data-tab="registros"]');
  if (tab) tab.click();
}

function renderVehiculos() {
  const cont = $('#vehiculos-list');
  if (!cont) return;
  document.querySelectorAll('[data-veh-filter]').forEach((b) => b.classList.toggle('active', b.dataset.vehFilter === vehFilter));
  let list = db.vehicles.slice().sort((a, b) => (b.status === 'Robado') - (a.status === 'Robado') || (b.ts || 0) - (a.ts || 0));
  if (vehFilter === 'robados') list = list.filter((v) => v.status === 'Robado');
  if (!list.length) { cont.innerHTML = '<div class="empty">Sin vehículos.</div>'; return; }
  cont.innerHTML = `<table class="table"><thead><tr><th>Placa</th><th>Modelo</th><th>Color</th><th>Dueño</th><th>Estado</th><th></th></tr></thead><tbody>${list.map((v) => `<tr>
    <td><strong>${esc(v.plate)}</strong></td>
    <td>${esc(v.model || '—')}</td>
    <td>${esc(v.color || '—')}</td>
    <td>${esc(v.owner || '—')}</td>
    <td><span class="tag ${v.status === 'Robado' ? 'tag-bad' : 'tag-ok'}">${esc(v.status)}</span></td>
    <td class="row-actions">
      <button class="btn btn-small" type="button" data-open-rec="vehicle" data-id="${esc(v.id)}">👁 Ver</button>
      <button class="btn btn-small ${v.status === 'Robado' ? 'btn-ok' : 'btn-danger'}" type="button" data-action="vehicle-stolen" data-id="${esc(v.id)}">${v.status === 'Robado' ? '✔' : '⚠️'}</button>
    </td></tr>`).join('')}</tbody></table>`;
}

function renderMultas() {
  const cont = $('#multas-list');
  if (!cont) return;
  document.querySelectorAll('[data-fine-filter]').forEach((b) => b.classList.toggle('active', b.dataset.fineFilter === fineFilter));
  const totals = $('#multas-totales');
  if (totals) {
    const pending = db.fines.filter((f) => f.status !== 'pagada');
    const paid = db.fines.filter((f) => f.status === 'pagada');
    const sum = (arr) => arr.reduce((acc, f) => acc + (f.amount || 0), 0);
    totals.innerHTML = `
      <div class="stat-card static"><span class="stat-icon">⏳</span><span class="stat-info"><span class="stat-value">$${sum(pending)}</span><span class="stat-label">${pending.length} pendientes</span></span></div>
      <div class="stat-card static"><span class="stat-icon">✅</span><span class="stat-info"><span class="stat-value">$${sum(paid)}</span><span class="stat-label">${paid.length} pagadas</span></span></div>`;
  }
  let list = db.fines.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
  if (fineFilter === 'pendientes') list = list.filter((f) => f.status !== 'pagada');
  if (fineFilter === 'pagadas') list = list.filter((f) => f.status === 'pagada');
  if (!list.length) { cont.innerHTML = '<div class="empty">Sin multas.</div>'; return; }
  cont.innerHTML = `<table class="table"><thead><tr><th>Persona</th><th>Monto</th><th>Motivo</th><th>Estado</th><th></th></tr></thead><tbody>${list.map((f) => `<tr>
    <td><strong>${esc(f.person)}</strong></td>
    <td>$${f.amount}</td>
    <td>${esc(f.reason || '—')}</td>
    <td><span class="tag ${f.status === 'pagada' ? 'tag-ok' : 'tag-warn'}">${esc(f.status)}</span></td>
    <td class="row-actions">
      <button class="btn btn-small" type="button" data-open-rec="fine" data-id="${esc(f.id)}">👁 Ver</button>
      <button class="btn btn-small ${f.status === 'pagada' ? '' : 'btn-ok'}" type="button" data-action="fine-toggle" data-id="${esc(f.id)}">${f.status === 'pagada' ? '↩️' : '✅'}</button>
    </td></tr>`).join('')}</tbody></table>`;
}

function renderOrdenes() {
  const cont = $('#ordenes-list');
  if (!cont) return;
  document.querySelectorAll('[data-warrant-filter]').forEach((b) => b.classList.toggle('active', b.dataset.warrantFilter === warrantFilter));
  let list = db.warrants.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
  if (warrantFilter === 'activas') list = list.filter((w) => w.status === 'activa');
  if (warrantFilter === 'cumplidas') list = list.filter((w) => w.status === 'cumplida');
  if (!list.length) { cont.innerHTML = '<div class="empty">Sin órdenes.</div>'; return; }
  cont.innerHTML = `<table class="table"><thead><tr><th>Persona</th><th>Tipo</th><th>Motivo</th><th>Estado</th><th></th></tr></thead><tbody>${list.map((w) => `<tr>
    <td><strong>${esc(w.person)}</strong></td>
    <td>${esc(w.wkind || '—')}</td>
    <td>${esc(w.reason || '—')}</td>
    <td><span class="tag ${w.status === 'activa' ? 'tag-bad' : 'tag-ok'}">${esc(w.status)}</span></td>
    <td class="row-actions">
      <button class="btn btn-small" type="button" data-open-rec="warrant" data-id="${esc(w.id)}">👁 Ver</button>
      <button class="btn btn-small ${w.status === 'cumplida' ? '' : 'btn-ok'}" type="button" data-action="warrant-toggle" data-id="${esc(w.id)}">${w.status === 'cumplida' ? '↩️' : '✅'}</button>
    </td></tr>`).join('')}</tbody></table>`;
}

function wireDataSections() {
  document.querySelectorAll('[data-veh-filter]').forEach((b) => b.addEventListener('click', () => { vehFilter = b.dataset.vehFilter; renderVehiculos(); }));
  document.querySelectorAll('[data-fine-filter]').forEach((b) => b.addEventListener('click', () => { fineFilter = b.dataset.fineFilter; renderMultas(); }));
  document.querySelectorAll('[data-warrant-filter]').forEach((b) => b.addEventListener('click', () => { warrantFilter = b.dataset.warrantFilter; renderOrdenes(); }));

  const onListClick = (e) => {
    const open = e.target.closest('[data-open-rec]');
    if (open) { openRecDetail(open.dataset.openRec, open.dataset.id); return; }
    const act = e.target.closest('[data-action]');
    if (act) handleRecAction(act.dataset.action, act.dataset.id);
  };
  ['#vehiculos-list', '#multas-list', '#ordenes-list'].forEach((sel) => {
    const el = $(sel);
    if (el) el.addEventListener('click', onListClick);
  });

  const stats = $('#stats-row');
  if (stats) {
    stats.addEventListener('click', (e) => {
      const go = e.target.closest('[data-go-tab]');
      if (!go) return;
      const tab = document.querySelector('.tab[data-tab="' + go.dataset.goTab + '"]');
      if (tab) tab.click();
    });
  }
}

// ============================================================
// 9. Registros: personas, vehículos, multas, órdenes y reportes
// ============================================================

const REC_PREFIX = { person: 'PER', vehicle: 'VEH', fine: 'MUL', warrant: 'ORD', report: 'REP' };

const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

let recTab = 'person';
let recQuery = '';
let recFormRendered = null;
let recDetail = null; // { kind, id }

function officerName() {
  return ($('#radio-name').value || '').trim() || 'Oficial';
}

function recFormHtml(kind) {
  if (kind === 'person') {
    return `
      <div class="field wide"><label>Nombre completo *</label><input name="name" required placeholder="Ej: Juan Pérez" /></div>
      <div class="field"><label>DNI *</label><input name="dni" required placeholder="Ej: 30123456" /></div>
      <div class="field"><label>Fecha de nacimiento</label><input name="dob" type="date" /></div>
      <div class="field"><label>Nº de licencia</label><input name="license" placeholder="Ej: 4471122" /></div>
      <div class="field"><label>Estado de licencia</label>
        <select name="licStatus"><option>Válida</option><option>Suspendida</option><option>Revocada</option></select>
      </div>
      <div class="field wide"><label>Notas / antecedentes</label><input name="notes" placeholder="Ej: Antecedente por robo (2025)" /></div>
      <div class="field field-btn"><button class="btn btn-primary" type="submit">➕ Guardar persona</button></div>`;
  }
  if (kind === 'vehicle') {
    return `
      <div class="field"><label>Placa *</label><input name="plate" required placeholder="Ej: ABC 123" /></div>
      <div class="field wide"><label>Marca / modelo</label><input name="model" placeholder="Ej: Bravado Banshee" /></div>
      <div class="field"><label>Color</label><input name="color" placeholder="Ej: Rojo" /></div>
      <div class="field"><label>Dueño (opcional)</label><input name="owner" placeholder="Ej: Juan Pérez" /></div>
      <div class="field"><label>Estado</label><select name="status"><option>Normal</option><option>Robado</option></select></div>
      <div class="field wide"><label>Notas</label><input name="notes" placeholder="Ej: Rayón en la puerta derecha" /></div>
      <div class="field field-btn"><button class="btn btn-primary" type="submit">➕ Guardar vehículo</button></div>`;
  }
  if (kind === 'fine') {
    return `
      <div class="field wide"><label>Persona *</label><input name="person" required placeholder="Nombre del infractor" /></div>
      <div class="field"><label>Monto ($)</label><input name="amount" type="number" min="0" step="50" required placeholder="Ej: 500" /></div>
      <div class="field wide"><label>Motivo *</label><input name="reason" required placeholder="Ej: Exceso de velocidad" /></div>
      <div class="field field-btn"><button class="btn btn-primary" type="submit">➕ Emitir multa</button></div>`;
  }
  if (kind === 'warrant') {
    return `
      <div class="field wide"><label>Persona *</label><input name="person" required placeholder="Nombre del buscado" /></div>
      <div class="field"><label>Tipo</label><select name="kind"><option>Arresto</option><option>Registro</option><option>Citación</option></select></div>
      <div class="field wide"><label>Motivo *</label><input name="reason" required placeholder="Ej: Robo a mano armada" /></div>
      <div class="field field-btn"><button class="btn btn-danger" type="submit">⚖️ Emitir orden</button></div>`;
  }
  return `
    <div class="field wide"><label>Título *</label><input name="title" required placeholder="Ej: Arresto por resistencia" /></div>
    <div class="field"><label>Tipo</label><select name="kind"><option>Arresto</option><option>Incidente</option><option>Tráfico</option><option>Otro</option></select></div>
    <div class="field wide"><label>Involucrados</label><input name="involved" placeholder="Ej: Juan Pérez · Testigo: Marta Gómez" /></div>
    <div class="field wide"><label>Narrativa *</label><textarea name="body" required rows="4" placeholder="Contá qué pasó, paso a paso…"></textarea></div>
    <div class="field field-btn"><button class="btn btn-primary" type="submit">➕ Guardar reporte</button></div>`;
}

function createRecordFromForm() {
  const fd = new FormData($('#rec-form'));
  const val = (k) => String(fd.get(k) || '').trim();
  const kind = recTab;
  const rec = { id: nextId(REC_PREFIX[kind]), ts: Date.now() };

  if (kind === 'person') {
    Object.assign(rec, { name: val('name'), dni: val('dni'), dob: val('dob'), license: val('license'), licStatus: val('licStatus') || 'Válida', notes: val('notes') });
    db.persons.unshift(rec);
    addLog('📇 Persona registrada: ' + rec.name + (rec.license ? ' (lic. ' + rec.license + ')' : ''));
  } else if (kind === 'vehicle') {
    Object.assign(rec, { plate: val('plate').toUpperCase(), model: val('model'), color: val('color'), owner: val('owner'), status: val('status') || 'Normal', notes: val('notes') });
    db.vehicles.unshift(rec);
    addLog('🚗 Vehículo registrado: ' + rec.plate + (rec.model ? ' · ' + rec.model : '') + (rec.status === 'Robado' ? ' ⚠️ ROBADO' : ''));
  } else if (kind === 'fine') {
    Object.assign(rec, { person: val('person'), amount: Math.max(0, parseInt(fd.get('amount'), 10) || 0), reason: val('reason'), officer: officerName(), status: 'pendiente' });
    db.fines.unshift(rec);
    addLog('🧾 Multa de $' + rec.amount + ' a ' + rec.person + ' — ' + rec.reason);
  } else if (kind === 'warrant') {
    Object.assign(rec, { person: val('person'), wkind: val('kind') || 'Arresto', reason: val('reason'), officer: officerName(), status: 'activa' });
    db.warrants.unshift(rec);
    addLog('⚖️ Orden de ' + rec.wkind.toLowerCase() + ' contra ' + rec.person + ' — ' + rec.reason);
  } else {
    Object.assign(rec, { title: val('title'), rkind: val('kind') || 'Incidente', involved: val('involved'), body: val('body'), officer: officerName() });
    db.reports.unshift(rec);
    addLog('📝 Reporte: ' + rec.title);
  }

  saveDb();
  $('#rec-form').reset();
  flash('✅ Guardado: ' + (rec.name || rec.plate || rec.title || rec.person || 'registro'));
  renderAll();
}

function renderRecSearch() {
  const box = $('#rec-results');
  if (!box) return;
  const q = recQuery.trim().toLowerCase();
  if (!q) { box.innerHTML = ''; return; }
  const qDni = recQuery.replace(/\D/g, '');
  const persons = db.persons.filter((p) =>
    String(p.name || '').toLowerCase().includes(q) || String(p.license || '').toLowerCase().includes(q)
    || String(p.dni || '').toLowerCase().includes(q)
    || (!!qDni && String(p.dni || '').replace(/\D/g, '').includes(qDni))).slice(0, 6);
  const vehicles = db.vehicles.filter((v) =>
    String(v.plate || '').toLowerCase().includes(q) || String(v.model || '').toLowerCase().includes(q)
    || String(v.owner || '').toLowerCase().includes(q)).slice(0, 6);
  if (!persons.length && !vehicles.length) {
    box.innerHTML = '<div class="muted small">Sin resultados para "' + esc(recQuery) + '".</div>';
    return;
  }
  const cards = [];
  for (const p of persons) {
    const fines = db.fines.filter((f) => sameName(f.person, p.name)).length;
    const ords = db.warrants.filter((w) => w.status === 'activa' && sameName(w.person, p.name)).length;
    cards.push(`<button class="rec-card" type="button" data-open="${esc(p.id)}" data-open-kind="person">
      <span class="rec-card-title">👤 ${esc(p.name)}</span>
      <span class="rec-card-meta">${p.dni ? '🪪 DNI ' + esc(p.dni) + ' · ' : ''}${p.license ? 'Lic. ' + esc(p.license) + ' · ' : ''}${esc(p.licStatus || 'Válida')}${fines ? ' · 🧾 ' + fines + ' multa(s)' : ''}${ords ? ' · ⚖️ ' + ords + ' orden(es) ACTIVA(S)' : ''}</span>
    </button>`);
  }
  for (const v of vehicles) {
    cards.push(`<button class="rec-card" type="button" data-open="${esc(v.id)}" data-open-kind="vehicle">
      <span class="rec-card-title">🚗 ${esc(v.plate)} ${v.status === 'Robado' ? '⚠️ ROBADO' : ''}</span>
      <span class="rec-card-meta">${esc([v.model, v.color].filter(Boolean).join(' · ') || 'Sin datos')}${v.owner ? ' · Dueño: ' + esc(v.owner) : ''}</span>
    </button>`);
  }
  box.innerHTML = cards.join('');
}

function recSection(title, lines) {
  if (!lines.length) return '';
  return `<div class="rec-section"><h3>${title}</h3>${lines.map((l) => '<div class="rec-line">' + l + '</div>').join('')}</div>`;
}

function renderRecDetail() {
  const box = $('#rec-detail');
  if (!box) return;
  if (!recDetail) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  const { kind, id } = recDetail;
  let html = '';
  const closeBtn = '<button class="btn btn-small" type="button" data-action="detail-close">✖ Cerrar ficha</button>';
  const delBtn = (k) => `<button class="btn btn-small btn-danger" type="button" data-action="rec-delete" data-id="${esc(id)}">🗑 Eliminar</button>`;

  if (kind === 'person') {
    const p = db.persons.find((x) => x.id === id);
    if (!p) { recDetail = null; return renderRecDetail(); }
    const vehicles = db.vehicles.filter((v) => sameName(v.owner, p.name));
    const fines = db.fines.filter((f) => sameName(f.person, p.name));
    const warrants = db.warrants.filter((w) => sameName(w.person, p.name));
    const reports = db.reports.filter((r) => String(r.involved || '').toLowerCase().includes(String(p.name).toLowerCase()) || sameName(r.officer, p.name));
    html = `
      <div class="panel-head"><h2>👤 ${esc(p.name)}</h2><div class="rec-actions">${closeBtn}${delBtn()}</div></div>
      <div class="rec-facts">
        <span><b>DNI:</b> <input class="rec-inline-input" data-action="dni-save" data-id="${esc(p.id)}" value="${esc(p.dni || '')}" placeholder="Sin DNI" spellcheck="false" /></span>
        <span><b>Nº de licencia:</b> ${esc(p.license || '—')}</span>
        <span><b>Estado:</b> <select class="rec-inline-select" data-action="lic-change" data-id="${esc(p.id)}">
          ${['Válida', 'Suspendida', 'Revocada'].map((s) => `<option${s === (p.licStatus || 'Válida') ? ' selected' : ''}>${s}</option>`).join('')}
        </select></span>
        <span><b>Nacimiento:</b> ${esc(p.dob || '—')}</span>
        <span><b>Registrada:</b> ${fmtTime(p.ts)}</span>
      </div>
      ${p.notes ? '<div class="muted small">📝 ' + esc(p.notes) + '</div>' : ''}
      ${recSection('🚗 Vehículos a su nombre', vehicles.map((v) => esc(v.plate) + (v.model ? ' · ' + esc(v.model) : '') + (v.status === 'Robado' ? ' <b style="color:#ef4444">⚠️ ROBADO</b>' : '')))}
      ${recSection('🧾 Multas', fines.map((f) => `$${f.amount} · ${esc(f.reason)} · <em>${esc(f.status)}</em>`))}
      ${recSection('⚖️ Órdenes', warrants.map((w) => `${esc(w.wkind)}: ${esc(w.reason)} · <em>${esc(w.status)}</em>`))}
      ${recSection('📝 Reportes', reports.map((r) => esc(r.title)))}`;
  } else if (kind === 'vehicle') {
    const v = db.vehicles.find((x) => x.id === id);
    if (!v) { recDetail = null; return renderRecDetail(); }
    const owner = db.persons.find((p) => sameName(p.name, v.owner));
    html = `
      <div class="panel-head"><h2>🚗 ${esc(v.plate)} ${v.status === 'Robado' ? '⚠️ ROBADO' : ''}</h2><div class="rec-actions">${closeBtn}${delBtn()}</div></div>
      <div class="rec-facts">
        <span><b>Marca/modelo:</b> ${esc(v.model || '—')}</span>
        <span><b>Color:</b> ${esc(v.color || '—')}</span>
        <span><b>Dueño:</b> ${v.owner ? esc(v.owner) + (owner ? ' <em>(en registros)</em>' : ' <em>(sin ficha)</em>') : '—'}</span>
        <span><b>Registrado:</b> ${fmtTime(v.ts)}</span>
      </div>
      ${v.notes ? '<div class="muted small">📝 ' + esc(v.notes) + '</div>' : ''}
      <div class="rec-actions"><button class="btn btn-small ${v.status === 'Robado' ? 'btn-ok' : 'btn-danger'}" type="button" data-action="vehicle-stolen" data-id="${esc(v.id)}">
        ${v.status === 'Robado' ? '✔ Marcar como normal' : '⚠️ Marcar como ROBADO'}
      </button></div>`;
  } else if (kind === 'fine') {
    const f = db.fines.find((x) => x.id === id);
    if (!f) { recDetail = null; return renderRecDetail(); }
    html = `
      <div class="panel-head"><h2>🧾 Multa #${esc(f.id)}</h2><div class="rec-actions">${closeBtn}${delBtn()}</div></div>
      <div class="rec-facts">
        <span><b>Persona:</b> ${esc(f.person)}</span>
        <span><b>Monto:</b> $${f.amount}</span>
        <span><b>Estado:</b> ${esc(f.status)}</span>
        <span><b>Emitida:</b> ${fmtTime(f.ts)} por ${esc(f.officer || '—')}</span>
      </div>
      <div class="muted small">📝 ${esc(f.reason)}</div>
      <div class="rec-actions"><button class="btn btn-small ${f.status === 'pagada' ? '' : 'btn-ok'}" type="button" data-action="fine-toggle" data-id="${esc(f.id)}">
        ${f.status === 'pagada' ? '↩️ Marcar como pendiente' : '✅ Marcar como PAGADA'}
      </button></div>`;
  } else if (kind === 'warrant') {
    const w = db.warrants.find((x) => x.id === id);
    if (!w) { recDetail = null; return renderRecDetail(); }
    html = `
      <div class="panel-head"><h2>⚖️ Orden #${esc(w.id)}</h2><div class="rec-actions">${closeBtn}${delBtn()}</div></div>
      <div class="rec-facts">
        <span><b>Persona:</b> ${esc(w.person)}</span>
        <span><b>Tipo:</b> ${esc(w.wkind)}</span>
        <span><b>Estado:</b> ${esc(w.status)}</span>
        <span><b>Emitida:</b> ${fmtTime(w.ts)} por ${esc(w.officer || '—')}</span>
      </div>
      <div class="muted small">📝 ${esc(w.reason)}</div>
      <div class="rec-actions"><button class="btn btn-small ${w.status === 'cumplida' ? '' : 'btn-ok'}" type="button" data-action="warrant-toggle" data-id="${esc(w.id)}">
        ${w.status === 'cumplida' ? '↩️ Reactivar orden' : '✅ Marcar como CUMPLIDA'}
      </button></div>`;
  } else if (kind === 'report') {
    const r = db.reports.find((x) => x.id === id);
    if (!r) { recDetail = null; return renderRecDetail(); }
    html = `
      <div class="panel-head"><h2>📝 ${esc(r.title)}</h2><div class="rec-actions">${closeBtn}${delBtn()}</div></div>
      <div class="rec-facts">
        <span><b>Tipo:</b> ${esc(r.rkind)}</span>
        <span><b>Involucrados:</b> ${esc(r.involved || '—')}</span>
        <span><b>Fecha:</b> ${fmtTime(r.ts)} por ${esc(r.officer || '—')}</span>
      </div>
      <div class="rec-narrative">${esc(r.body).replace(/\n/g, '<br>')}</div>`;
  }
  box.innerHTML = html;
  box.classList.remove('hidden');
}

function renderRecLists() {
  const grid = $('#rec-lists');
  if (!grid) return;

  const personItems = db.persons.slice(0, 6).map((p) => `
    <div class="rec-item" data-open="${esc(p.id)}" data-open-kind="person">
      <div>👤 ${esc(p.name)}</div>
      <div class="rec-item-row"><span class="tag">${esc(p.licStatus || 'Válida')}</span>${p.dni ? '<span class="tag">🪪 ' + esc(p.dni) + '</span>' : ''}${p.license ? '<span class="tag">Lic. ' + esc(p.license) + '</span>' : ''}</div>
    </div>`).join('');

  const vehicleItems = db.vehicles.slice(0, 6).map((v) => `
    <div class="rec-item" data-open="${esc(v.id)}" data-open-kind="vehicle">
      <div>🚗 ${esc(v.plate)}</div>
      <div class="rec-item-row">
        <span class="tag ${v.status === 'Robado' ? 'tag-bad' : 'tag-ok'}">${esc(v.status)}</span>
        <button class="btn btn-small" type="button" data-action="vehicle-stolen" data-id="${esc(v.id)}">${v.status === 'Robado' ? '✔' : '⚠️'}</button>
      </div>
    </div>`).join('');

  const fineItems = db.fines.slice(0, 6).map((f) => `
    <div class="rec-item" data-open="${esc(f.id)}" data-open-kind="fine">
      <div>${esc(f.person)} · $${f.amount}</div>
      <div class="rec-item-row">
        <span class="tag ${f.status === 'pagada' ? 'tag-ok' : 'tag-warn'}">${esc(f.status)}</span>
        <button class="btn btn-small" type="button" data-action="fine-toggle" data-id="${esc(f.id)}">${f.status === 'pagada' ? '↩️' : '✅'}</button>
      </div>
    </div>`).join('');

  const warrantItems = db.warrants.slice(0, 6).map((w) => `
    <div class="rec-item" data-open="${esc(w.id)}" data-open-kind="warrant">
      <div>${esc(w.person)}</div>
      <div class="rec-item-row">
        <span class="tag ${w.status === 'activa' ? 'tag-bad' : 'tag-ok'}">${esc(w.wkind)} · ${esc(w.status)}</span>
        <button class="btn btn-small" type="button" data-action="warrant-toggle" data-id="${esc(w.id)}">${w.status === 'cumplida' ? '↩️' : '✅'}</button>
      </div>
    </div>`).join('');

  const reportItems = db.reports.slice(0, 6).map((r) => `
    <div class="rec-item" data-open="${esc(r.id)}" data-open-kind="report">
      <div>📝 ${esc(r.title)}</div>
      <div class="rec-item-row"><span class="tag">${esc(r.rkind)}</span><span class="tag">${fmtTime(r.ts)}</span></div>
    </div>`).join('');

  const col = (title, items, empty) =>
    `<div class="rec-col"><h3>${title}</h3>${items || '<div class="muted small">' + empty + '</div>'}</div>`;

  grid.innerHTML =
    col('👤 Personas', personItems, 'Sin personas') +
    col('🚗 Vehículos', vehicleItems, 'Sin vehículos') +
    col('🧾 Multas', fineItems, 'Sin multas') +
    col('⚖️ Órdenes', warrantItems, 'Sin órdenes') +
    col('📝 Reportes', reportItems, 'Sin reportes');
}

function renderRegistros() {
  document.querySelectorAll('.rec-new-tab').forEach((b) => b.classList.toggle('active', b.dataset.rec === recTab));
  if (recFormRendered !== recTab) {
    const form = $('#rec-form');
    if (form) form.innerHTML = recFormHtml(recTab);
    recFormRendered = recTab;
  }
  renderRecSearch();
  renderRecLists();
  renderRecDetail();
}

function handleRecAction(action, id) {
  if (action === 'detail-close') { recDetail = null; renderRecDetail(); return; }
  if (action === 'fine-toggle') {
    const f = db.fines.find((x) => x.id === id);
    if (!f) return;
    f.status = f.status === 'pagada' ? 'pendiente' : 'pagada';
    addLog('🧾 Multa de $' + f.amount + ' a ' + f.person + ' → ' + f.status);
    flash('Multa: ' + f.status);
  } else if (action === 'warrant-toggle') {
    const w = db.warrants.find((x) => x.id === id);
    if (!w) return;
    w.status = w.status === 'cumplida' ? 'activa' : 'cumplida';
    addLog('⚖️ Orden contra ' + w.person + ' → ' + w.status);
    flash('Orden: ' + w.status);
  } else if (action === 'vehicle-stolen') {
    const v = db.vehicles.find((x) => x.id === id);
    if (!v) return;
    v.status = v.status === 'Robado' ? 'Normal' : 'Robado';
    addLog('🚗 Vehículo ' + v.plate + ' → ' + (v.status === 'Robado' ? '⚠️ ROBADO' : 'normal'));
    flash(v.plate + ': ' + v.status);
  } else if (action === 'rec-delete') {
    const arr = recDetail ? { person: db.persons, vehicle: db.vehicles, fine: db.fines, warrant: db.warrants, report: db.reports }[recDetail.kind] : null;
    const i = arr ? arr.findIndex((x) => x.id === id) : -1;
    if (i >= 0) {
      arr.splice(i, 1);
      addLog('🗑 Registro eliminado (' + id + ')');
      flash('Registro eliminado');
      recDetail = null;
    }
  }
  saveDb();
  renderAll();
}

function wireRegistros() {
  document.querySelectorAll('.rec-new-tab').forEach((btn) => {
    btn.addEventListener('click', () => { recTab = btn.dataset.rec; renderRegistros(); });
  });

  $('#rec-search').addEventListener('input', () => {
    recQuery = $('#rec-search').value;
    renderRecSearch();
  });

  $('#rec-form').addEventListener('submit', (e) => {
    e.preventDefault();
    createRecordFromForm();
  });

  $('#rec-results').addEventListener('click', (e) => {
    const el = e.target.closest('[data-open]');
    if (!el) return;
    recDetail = { kind: el.dataset.openKind, id: el.dataset.open };
    renderRecDetail();
  });

  $('#rec-lists').addEventListener('click', (e) => {
    const act = e.target.closest('[data-action]');
    if (act) { handleRecAction(act.dataset.action, act.dataset.id); return; }
    const el = e.target.closest('[data-open]');
    if (el) { recDetail = { kind: el.dataset.openKind, id: el.dataset.open }; renderRecDetail(); }
  });

  $('#rec-detail').addEventListener('click', (e) => {
    const act = e.target.closest('[data-action]');
    if (act && act.tagName !== 'SELECT' && act.tagName !== 'INPUT') handleRecAction(act.dataset.action, act.dataset.id);
  });

  $('#rec-detail').addEventListener('change', (e) => {
    const sel = e.target.closest('select[data-action="lic-change"]');
    if (sel) {
      const p = db.persons.find((x) => x.id === sel.dataset.id);
      if (p) {
        p.licStatus = sel.value;
        addLog('🪪 Licencia de ' + p.name + ' → ' + sel.value);
        saveDb();
        renderRecLists();
        flash(p.name + ': licencia ' + sel.value);
      }
      return;
    }
    const dniInp = e.target.closest('input[data-action="dni-save"]');
    if (dniInp) {
      const p2 = db.persons.find((x) => x.id === dniInp.dataset.id);
      if (p2) {
        p2.dni = dniInp.value.trim();
        addLog('🪪 DNI de ' + p2.name + ' → ' + (p2.dni || '(vacío)'));
        saveDb();
        renderRecLists();
        flash(p2.name + ': DNI guardado');
      }
    }
  });
}

// ============================================================
// 10. Render del historial
// ============================================================

function dayLabel(date) {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Hoy';
  if (date.toDateString() === yesterday.toDateString()) return 'Ayer';
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

function renderLog() {
  const cont = $('#log-list');
  if (!db.log.length) {
    cont.innerHTML = '<div class="empty">Sin eventos.</div>';
    return;
  }
  const groups = [];
  for (const l of db.log.slice(0, 200)) {
    const date = new Date(l.ts);
    const key = date.toDateString();
    let group = groups.find((g) => g.key === key);
    if (!group) { group = { key, title: dayLabel(date), list: [] }; groups.push(group); }
    group.list.push(l);
  }
  cont.innerHTML = groups.map((g) => sectionHtml(
    g.title, g.list.length,
    g.list.map((l) => `<div class="log-row"><span class="muted">${fmtTime(l.ts)}</span><span>${esc(l.text)}</span></div>`).join(''),
  )).join('');
}

// ============================================================
// 11. Formularios
// ============================================================

function populateSelects() {
  $('#call-type').innerHTML = Object.entries(CALL_TYPES)
    .map(([k, v]) => `<option value="${k}" ${k === 'POLICE' ? 'selected' : ''}>${esc(v.label)}</option>`)
    .join('');

  $('#call-priority').innerHTML = Object.keys(CALL_PRIORITIES)
    .map((k) => `<option value="${k}" ${k === 'Media' ? 'selected' : ''}>${esc(k)}</option>`)
    .join('');

  const deptOptions = (sel) => Object.entries(DEPARTMENTS)
    .map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(v.name)}</option>`)
    .join('');

  $('#unit-dept').innerHTML = deptOptions('LCPD');
  $('#roster-dept').innerHTML = deptOptions('LCPD');
  $('#radio-dept').innerHTML = deptOptions('DISPATCH');
  $('#channel-dept').innerHTML = deptOptions('LCPD');
}

function wireForms() {
  // ---- Nueva llamada ----
  $('#call-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const location = $('#call-location').value.trim();
    if (!location) return;
    const call = {
      id: nextId('C'),
      type: $('#call-type').value,
      priority: $('#call-priority').value,
      location,
      description: $('#call-desc').value.trim(),
      caller: $('#call-caller').value.trim(),
      status: 'pendiente',
      units: [],
      createdAt: Date.now(),
    };
    db.calls.push(call);
    addLog(`Nueva llamada #${call.id} (${(CALL_TYPES[call.type] || CALL_TYPES.OTHER).label} · ${call.location})`);
    saveDb();
    e.target.reset();
    renderAll();
    flash('Llamada #' + call.id + ' creada');
  });

  // ---- Registrar unidad ----
  $('#unit-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#unit-name').value.trim();
    if (!name) return;
    const actual = myUnit();
    if (actual && !isStaffRole()) {
      flash('⚠️ Ya estás en la unidad ' + actual.name + '. Salí de ella para crear otra.');
      return;
    }
    const operator = $('#unit-operator').value.trim() || currentOfficerName();
    const unit = {
      id: nextId('U'),
      name,
      dept: $('#unit-dept').value,
      operator,
      officers: operator ? [operator] : [],
      status: '10-8',
      callId: null,
    };
    db.units.push(unit);
    addLog(`Unidad ${unit.name} registrada (${deptInfo(unit.dept).short})`);
    saveDb();
    e.target.reset();
    renderAll();
    flash('Unidad ' + unit.name + ' registrada');
  });

  // ---- Roster ----
  $('#roster-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#roster-name').value.trim();
    if (!name) return;
    const p = { id: nextId('P'), name, rank: $('#roster-rank').value, dept: $('#roster-dept').value };
    db.roster.push(p);
    addLog(`Roster: ${p.name} agregado como ${p.rank}`);
    saveDb();
    e.target.reset();
    renderAll();
    flash(p.name + ' agregado al roster');
  });

  // ---- BOLO ----
  $('#bolo-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const description = $('#bolo-desc').value.trim();
    if (!description) return;
    const bolo = {
      id: nextId('B'),
      tipo: $('#bolo-type').value,
      plate: $('#bolo-plate').value.trim(),
      description,
      reason: $('#bolo-reason').value.trim(),
      resolved: false,
      createdAt: Date.now(),
    };
    db.bolos.push(bolo);
    addLog(`Nuevo BOLO #${bolo.id} (${bolo.tipo}: ${bolo.description})`);
    saveDb();
    e.target.reset();
    renderAll();
    flash('BOLO #' + bolo.id + ' publicado');
  });

  // ---- Borrar historial (solo el Propietario) ----
  $('#log-clear').addEventListener('click', () => {
    if (currentRole !== 'Propietario') {
      flash('⛔ Solo el Propietario puede borrar el historial.');
      return;
    }
    if (!confirm('¿Borrar todo el historial?')) return;
    db.log = [];
    saveDb();
    renderAll();
  });
}

// ============================================================
// 12. Pestañas y reloj
// ============================================================

function wireTabs() {
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('hidden')) return;
      document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-content').forEach((sec) => {
        sec.classList.toggle('active', sec.id === 'tab-' + btn.dataset.tab);
      });
      if (btn.dataset.tab === 'audio') populateAudioDevices();
      else stopMicTest(); // si estabas probando el micrófono, se cierra al salir de la pestaña
      mapOpen(btn.dataset.tab === 'mapa');
    });
  });
}

function startClock() {
  const tick = () => {
    $('#clock').textContent = new Date().toLocaleString('es-ES', {
      weekday: 'short', day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  };
  tick();
  setInterval(tick, 1000);
}

// ============================================================
// 13. Radio: interfaz
// ============================================================

const RADIO_PREFS_KEY = 'cad-erlc-radio-prefs';

function saveRadioPrefs() {
  const prefs = {
    server: $('#radio-server').value.trim(),
    name: $('#radio-name').value.trim(),
    dept: $('#radio-dept').value,
    pttKey: $('#ptt-key').value,
    pttMode: $('#ptt-mode').value,
    volume: parseInt($('#radio-volume').value, 10),
    micDevice: audioPrefs.micDevice,
    outputDevice: audioPrefs.outputDevice,
  };
  try { localStorage.setItem(RADIO_PREFS_KEY, JSON.stringify(prefs)); } catch {}
}

function loadRadioPrefs() {
  let prefs = {};
  try { prefs = JSON.parse(localStorage.getItem(RADIO_PREFS_KEY) || '{}'); } catch {}
  if (prefs.server) $('#radio-server').value = prefs.server;
  if (prefs.name) $('#radio-name').value = prefs.name;
  if (prefs.dept) $('#radio-dept').value = prefs.dept;
  if (prefs.pttKey) { $('#ptt-key').value = prefs.pttKey; $('#audio-ptt-key').value = prefs.pttKey; }
  if (prefs.pttMode) { $('#ptt-mode').value = prefs.pttMode; $('#audio-ptt-mode').value = prefs.pttMode; }
  if (typeof prefs.volume === 'number') applyVolume(prefs.volume);
  audioPrefs.micDevice = prefs.micDevice || '';
  audioPrefs.outputDevice = prefs.outputDevice || '';
  Radio.setSettings({ micDeviceId: audioPrefs.micDevice, outputDeviceId: audioPrefs.outputDevice });
}

function setRadioStatus(conectado, detail) {
  const pill = $('#radio-status');
  pill.textContent = 'Radio: ' + (conectado ? 'conectado' : 'desconectado') + (detail ? ' · ' + detail : '');
  pill.className = 'pill ' + (conectado ? 'pill-on' : 'pill-off');
}

function showRadioError(msg) {
  const el = $('#radio-error');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add('hidden'), 6000);
}

function setPttIndicator(on) {
  const el = $('#ptt-indicator');
  el.textContent = on ? '🔴 TRANSMITIENDO…' : '🎙 Micrófono cerrado';
  el.classList.toggle('on', !!on);
  $('#ptt-button').classList.toggle('transmitting', !!on);
}

function canJoinChannel(ch) {
  const staff = ['Propietario', 'Administrador', 'Supervisor'].includes(Radio.state.role);
  if (ch.department && ch.department !== Radio.state.department && !staff) {
    return { ok: false, why: `Canal exclusivo de ${deptInfo(ch.department).short}. No perteneces a ese departamento.` };
  }
  if (ch.private && !ch.iAmMember && !staff) {
    return { ok: false, why: 'Canal privado: necesitas una invitación.' };
  }
  return { ok: true };
}

// Secciones plegadas de la lista de canales (se recuerdan en tu PC)
let catsColapsadas = new Set();
try { catsColapsadas = new Set(JSON.parse(localStorage.getItem('cad-erlc-ch-cats') || '[]')); } catch {}
function guardarCatsColapsadas() {
  try { localStorage.setItem('cad-erlc-ch-cats', JSON.stringify([...catsColapsadas])); } catch {}
}

function channelRowHtml(ch, current) {
  const name = ch.name || ch;
  const inChannel = name === current && Radio.state.channel;
  const count = inChannel
    ? Radio.state.members.size + 1
    : (ch.private && ch.memberCount ? `👥${ch.memberCount}` : '');
  const badge = ch.department ? deptBadgeHtml(ch.department) : '';
  const icon = ch.private ? '🔒' : '#';
  const special = ch.private || ch.department ? ' special' : '';
  const actions = ch.canManage
    ? `<span class="channel-actions">
         ${ch.private ? `<button class="ch-act" data-invite="${esc(name)}" title="Invitar personas">＋</button>` : ''}
         <button class="ch-act" data-del="${esc(name)}" title="Eliminar canal">🗑</button>
       </span>`
    : '';
  return `<div class="channel-row">
    <button class="channel ${inChannel ? 'active' : ''}${special}" data-channel="${esc(name)}">
      <span class="channel-icon">${icon}</span><span class="channel-name">${esc(name)}</span>${badge}<span class="channel-count">${count}</span>
    </button>${actions}
  </div>`;
}

// Lista de canales agrupada en secciones plegables (estilo categorías de Discord)
function renderChannels(channels, current) {
  const box = $('#channel-list');
  const list = channels || [];
  if (!list.length) { box.innerHTML = '<div class="muted small">Sin canales.</div>'; return; }

  const grupos = new Map();
  for (const ch of list) {
    const cat = String(ch.category || 'General');
    if (!grupos.has(cat)) grupos.set(cat, []);
    grupos.get(cat).push(ch);
  }

  let html = '';
  for (const [cat, chs] of grupos) {
    const colapsada = catsColapsadas.has(cat);
    html += `<button class="ch-cat ${colapsada ? 'collapsed' : ''}" data-cat="${esc(cat)}" type="button" title="${colapsada ? 'Mostrar' : 'Ocultar'} sección ${esc(cat)}">
      <span class="ch-cat-arrow">▾</span><span class="ch-cat-name">${esc(cat)}</span>
      <span class="ch-cat-count">${chs.length}</span>
    </button>`;
    if (!colapsada) {
      html += `<div class="ch-cat-body">${chs.map((ch) => channelRowHtml(ch, current)).join('')}</div>`;
    }
  }
  box.innerHTML = html;
}

// Lista de conectados (con casillas) para invitar a canales privados
function renderInvitePicker(containerSel, excludeNames) {
  const box = $(containerSel);
  const excluded = new Set([Radio.state.name, ...(excludeNames || [])]);
  const users = (Radio.state.userlist || []).filter((u) => !excluded.has(u.name));
  if (!users.length) {
    box.innerHTML = '<div class="muted small">Sin otras personas conectadas.</div>';
    return;
  }
  box.innerHTML = users.map((u) => `<label class="invite-user">
      <input type="checkbox" value="${esc(u.name)}" />
      <span>${esc(u.name)}</span>${deptBadgeHtml(u.department)}
    </label>`).join('');
}

function pickedNames(containerSel) {
  return [...document.querySelectorAll(`${containerSel} input[type="checkbox"]:checked`)]
    .map((i) => i.value);
}

// Si llega o se va gente mientras hay una lista de invitación abierta, la refrescamos
function refreshInvitePickers() {
  if (!$('#channel-invite-box').classList.contains('hidden')) {
    const ch = (Radio.state.channels || []).find((c) => c.name === $('#channel-invite-name').textContent);
    renderInvitePicker('#channel-invite-users', ch ? ch.memberNames : []);
  }
  if (!$('#channel-form').classList.contains('hidden') && $('#channel-vis').value === 'private') {
    renderInvitePicker('#channel-invite-list', []);
  }
}

function membersWithSelf() {
  const list = [...Radio.state.members.values()];
  if (Radio.state.channel && Radio.state.name) {
    list.unshift({
      id: -1,
      name: Radio.state.name + ' (tú)',
      department: Radio.state.department,
      talking: Radio.state.pttActive,
    });
  }
  return list;
}

function renderMembers(list) {
  const ul = $('#member-list');
  if (!list || !list.length) {
    ul.innerHTML = '<li class="muted">Sin conexión</li>';
    return;
  }
  ul.innerHTML = list.map((m) => `<li>
      <span class="talk-dot ${m.talking ? 'talking' : ''}"></span>
      <span>${esc(m.name)}</span>
      ${deptBadgeHtml(m.department)}
      ${roleBadgeHtml(m.role)}
    </li>`).join('');
}

// ---- Caja del propietario (crear contraseña / iniciar sesión) ----
function renderOwnerBox() {
  const st = Radio.state;
  const box = $('#owner-box');
  if (!st.connected) {
    box.innerHTML = '<div class="muted small">Conéctate al radio para administrar.</div>';
    return;
  }
  if (st.isOwner) {
    box.innerHTML = `
      <div class="owner-line">👑 Eres el propietario${st.ownerName ? ' (' + esc(st.ownerName) + ')' : ''}.</div>
      <div class="muted small">Asigná roles en el panel "Administración de roles".</div>
      <button id="owner-logout" class="btn full">Cerrar sesión de propietario</button>`;
  } else if (!st.ownerExists) {
    box.innerHTML = `
      <div class="muted small">Este servidor todavía no tiene propietario. Creá tu contraseña (solo la sabrás vos):</div>
      <input id="owner-pass" type="password" placeholder="Contraseña de propietario" />
      <button id="owner-btn" class="btn btn-primary full">👑 Crear propietario</button>`;
  } else {
    box.innerHTML = `
      <div class="muted small">Servidor con propietario${st.ownerName ? ' (' + esc(st.ownerName) + ')' : ''}. Entrá con tu contraseña:</div>
      <input id="owner-pass" type="password" placeholder="Contraseña de propietario" />
      <button id="owner-btn" class="btn full">Iniciar sesión</button>`;
  }

  const passInput = box.querySelector('#owner-pass');
  if (passInput) {
    passInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') ownerBoxAction(); });
  }
  const logoutBtn = box.querySelector('#owner-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      setOwnerPass('');
      pendingOwnerPass = '';
      Radio.ownerLogout();
      flash('Sesión de propietario cerrada');
    });
  }
  const btn = box.querySelector('#owner-btn');
  if (btn) btn.addEventListener('click', ownerBoxAction);
}

function ownerBoxAction() {
  const input = $('#owner-pass');
  const pass = input ? input.value.trim() : '';
  if (pass.length < 4) { showRadioError('La contraseña debe tener al menos 4 caracteres.'); return; }
  pendingOwnerPass = pass;
  if (Radio.state.ownerExists) Radio.ownerLogin(pass);
  else Radio.ownerSetup(pass);
  flash('Comprobando contraseña…');
}

// ---- Panel de administración de roles (solo propietario) ----
function renderAdminPanel() {
  const panel = $('#admin-panel');
  if (!Radio.state.isOwner) { panel.classList.add('hidden'); return; }
  panel.classList.remove('hidden');

  const users = (Radio.state.userlist || []).filter((u) => u.role !== 'Propietario');
  const box = $('#admin-users');
  if (!users.length) {
    box.innerHTML = '<div class="muted small">Sin nadie más conectado.</div>';
    return;
  }
  box.innerHTML = users.map((u) => `<div class="admin-row">
      <div class="admin-name">${esc(u.name)} ${deptBadgeHtml(u.department)} ${roleBadgeHtml(u.role)}</div>
      <select data-admin-select="${esc(u.name)}">
        ${ROLES_ASSIGNABLE.map((r) => `<option value="${r}" ${(u.role || 'Miembro') === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}
      </select>
      <button class="ch-act" data-admin-apply="${esc(u.name)}" title="Aplicar rol">✔</button>
    </div>`).join('');
}

function appendRadioChat(msg) {
  const list = $('#radio-chat');
  const row = document.createElement('div');
  row.className = 'chat-row';
  const d = deptInfo(msg.department);
  row.innerHTML = `<span class="muted">${new Date(msg.ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span> <span class="chat-name" style="color:${d.color}">${esc(msg.name)}</span>: ${esc(msg.text)}`;
  list.appendChild(row);
  list.scrollTop = list.scrollHeight;
  while (list.children.length > 200) list.removeChild(list.firstChild);
}

function onRadioEvent(event, payload) {
  switch (event) {
    case 'connected':
      setRadioStatus(true, Radio.state.name);
      $('#radio-connect').textContent = 'Desconectar';
      $('#radio-connect').classList.remove('btn-primary');
      $('#radio-connect').classList.add('btn-danger');
      saveRadioPrefs();
      ownerAutoTried = false;
      updateLinkVisibility();
      flash('Conectado al servidor de radio');
      // El propietario de esta PC recupera su rango solo (la contraseña está guardada)
      setTimeout(() => {
        if (Radio.state.connected && !Radio.state.isOwner && getOwnerPass()) {
          Radio.ownerLogin(getOwnerPass());
        }
      }, 1200);
      break;

    case 'disconnected':
      setRadioStatus(false);
      updateErlcVisibility();
      updateLinkVisibility();
      ownerAutoTried = false;
      $('#radio-connect').textContent = 'Conectar';
      $('#radio-connect').classList.add('btn-primary');
      $('#radio-connect').classList.remove('btn-danger');
      renderChannels(Radio.DEFAULT_CHANNELS, null);
      renderMembers([]);
      setPttIndicator(false);
      $('#radio-leave').classList.add('hidden');
      renderOwnerBox();
      renderAdminPanel();
      break;

    case 'channels':
      renderChannels(payload, Radio.state.channel);
      break;

    case 'joined':
      renderChannels(Radio.state.channels, payload);
      renderMembers(membersWithSelf());
      $('#radio-leave').classList.remove('hidden');
      flash('Entraste al canal "' + payload + '"');
      populateAudioDevices(); // con el micrófono ya autorizado, aparecen los nombres reales de los dispositivos
      break;

    case 'left':
      renderChannels(Radio.state.channels, null);
      renderMembers([]);
      $('#radio-leave').classList.add('hidden');
      break;

    case 'roster':
      renderMembers(membersWithSelf());
      break;

    case 'userlist':
      refreshInvitePickers();
      renderAdminPanel();
      break;

    case 'owner':
      // Si el servidor de la nube se reinició de cero y "olvidó" al propietario,
      // esta PC (la única con la contraseña guardada) lo vuelve a crear sola.
      if (!payload.owner && !payload.ownerExists && getOwnerPass() && !ownerAutoTried) {
        ownerAutoTried = true;
        Radio.ownerSetup(getOwnerPass());
      }
      if (payload.owner && payload.assignments) {
        try { localStorage.setItem(ROLES_CACHE_KEY, JSON.stringify(payload.assignments)); } catch {}
      }
      // La contraseña se recuerda solo si el servidor la aceptó
      if (payload.owner && pendingOwnerPass && !getOwnerPass()) {
        setOwnerPass(pendingOwnerPass);
        pendingOwnerPass = '';
      }
      renderOwnerBox();
      renderAdminPanel();
      setCurrentRole(Radio.state.role);
      updateErlcVisibility();
      updateLinkVisibility();
      if (payload.owner && payload.rolesFresh) {
        let cached = null;
        try { cached = JSON.parse(localStorage.getItem(ROLES_CACHE_KEY) || 'null'); } catch {}
        if (cached && Object.keys(cached).length) {
          Radio.restoreRoles(cached);
          flash('Restaurando roles guardados…');
        }
      }
      break;

    case 'role':
      renderOwnerBox();
      renderAdminPanel();
      setCurrentRole(Radio.state.role);
      updateErlcVisibility();
      updateLinkVisibility();
      flash('Tu rol ahora es: ' + Radio.state.role);
      break;

    case 'kicked':
      showRadioError(payload);
      renderChannels(Radio.state.channels, null);
      renderMembers([]);
      $('#radio-leave').classList.add('hidden');
      break;

    case 'chat':
      appendRadioChat(payload);
      break;

    case 'panic':
      showPanicAlert(payload);
      break;

    case 'panic-clear':
      hidePanicAlert(payload);
      break;

    case 'civil-call':
      receiveCivilCall(payload);
      break;

    case 'ptt':
      setPttIndicator(payload);
      playPttSound(); // clic de radio al abrir y al cerrar el micrófono
      renderMembers(membersWithSelf());
      break;

    case 'ptt-blocked':
      // PTT pulsado sin estar en un canal: no hacemos ruido visual
      break;

    case 'error':
      showRadioError(payload);
      break;
  }

  // La radio flotante (overlay) se mantiene al día con cada evento
  overlaySync();
}

// ============================================================
// 14b. Radio flotante sobre el juego (overlay)
// ============================================================
// Manda el estado de la radio a la ventanita siempre-encima. Se llama con
// cada evento de la radio; si nada cambió, no manda nada.
let overlayLastKey = '';

// Último pánico activo (para mostrarlo en la radio flotante)
let panicState = null;

function overlaySync() {
  if (!window.cadNative || !window.cadNative.overlaySend) return;
  const st = Radio.state;
  const members = [...st.members.values()];
  const talker = members.find((m) => m.talking && m.id !== st.myId);
  // Unidad propia en el CAD (indicativo + estado) para mostrarla en la radio
  let unit = null;
  if (typeof db !== 'undefined' && Array.isArray(db.units)) {
    const who = (st.name || currentOfficerName() || '').trim().toLowerCase();
    unit = db.units.find((u) =>
      unitOfficers(u).some((n) => String(n).trim().toLowerCase() === who)
      || (u.operator || '').trim().toLowerCase() === who
    ) || null;
  }
  const unitStatus = unit ? ((UNIT_STATUSES[unit.status] || {}).label || unit.status || '') : '';
  const data = {
    connected: !!st.connected,
    channel: st.channel || '',
    name: st.name || '',
    department: st.department || '',
    role: st.role || '',
    ptt: !!st.pttActive,
    talker: talker ? talker.name : '',
    talkerDept: talker ? (talker.department || '') : '',
    count: members.filter((m) => m.id !== st.myId).length,
    unit: unit ? unit.name : '',
    unitStatus,
    channels: (st.channels || [])
      .filter((ch) => { try { return canJoinChannel(ch).ok; } catch { return false; } })
      .map((ch) => ({ name: ch.name, cat: ch.category || 'General' })),
    panicName: panicState ? (panicState.name || '') : '',
    panicSelf: !!(panicState && panicState.name && panicState.name.trim() === (st.name || '').trim()),
    pttKey: ($('#ptt-key') && $('#ptt-key').value) || 'V',
  };
  const key = JSON.stringify(data);
  if (key === overlayLastKey) return;
  overlayLastKey = key;
  window.cadNative.overlaySend(data);
}

function wireOverlay() {
  const btn = $('#overlay-toggle');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (!window.cadNative || !window.cadNative.overlayToggle) {
      flash('⚠️ Esta versión de la app no incluye la radio flotante. Actualizá el .exe.');
      return;
    }
    const r = await window.cadNative.overlayToggle();
    if (r && r.ok) {
      btn.classList.toggle('btn-primary', !!r.visible);
      flash(r.visible ? '🖥️ Radio flotante activada (queda encima del juego)' : '🖥️ Radio flotante oculta');
      overlaySync();
    }
  });

  // Pánico desde la radio flotante: mismo aviso, sonido y llamada que F8
  if (window.cadNative && cadNative.onOverlayPanic) {
    cadNative.onOverlayPanic((d) => {
      dispararPanico(d && typeof d.location === 'string' ? d.location : '');
    });
  }
  if (window.cadNative && cadNative.onOverlayPanicClear) {
    cadNative.onOverlayPanicClear(() => {
      if (Radio.state.connected) Radio.clearPanic();
    });
  }

  // Cambiar de canal desde la pestaña "Canales" de la radio flotante
  if (window.cadNative && cadNative.onOverlayChannel) {
    cadNative.onOverlayChannel(async (d) => {
      const name = d && typeof d.name === 'string' ? d.name : '';
      if (!name) return;
      if (!Radio.state.connected) { flash('⚠️ Conectate a la radio primero.'); return; }
      const ch = (Radio.state.channels || []).find((c) => c.name === name);
      if (ch) {
        const check = canJoinChannel(ch);
        if (!check.ok) { flash('⛔ ' + check.why); return; }
      }
      await Radio.joinChannel(name);
    });
  }
}

function wireRadio() {
  // Enlace público del 911 para civiles (se calcula según el servidor de radio)
  $('#radio-server').addEventListener('input', updateCivilUrl);
  updateCivilUrl();

  // ---- Conectar / desconectar ----
  $('#radio-connect').addEventListener('click', async () => {
    if (Radio.state.connected) {
      Radio.disconnect();
      return;
    }
    const url = $('#radio-server').value.trim() || 'ws://localhost:8787';
    const name = $('#radio-name').value.trim();
    const dept = $('#radio-dept').value;
    if (!name) { showRadioError('Escribe tu nombre para el radio.'); return; }

    const btn = $('#radio-connect');
    btn.disabled = true;
    btn.textContent = 'Conectando…';
    const ok = await Radio.connect(url, name, dept, getOwnerPass());
    btn.disabled = false;
    if (!ok) {
      btn.textContent = 'Conectar';
      btn.classList.add('btn-primary');
      btn.classList.remove('btn-danger');
    }
  });

  // ---- Canales ----
  let inviteChannel = null;

  const openInviteBox = (name) => {
    const ch = (Radio.state.channels || []).find((c) => c.name === name);
    inviteChannel = ch || null;
    $('#channel-form').classList.add('hidden');
    $('#channel-invite-box').classList.remove('hidden');
    $('#channel-invite-name').textContent = name;
    renderInvitePicker('#channel-invite-users', ch ? ch.memberNames : []);
  };

  $('#channel-list').addEventListener('click', async (e) => {
    const catBtn = e.target.closest('.ch-cat');
    if (catBtn) {
      const cat = catBtn.dataset.cat;
      if (catsColapsadas.has(cat)) catsColapsadas.delete(cat);
      else catsColapsadas.add(cat);
      guardarCatsColapsadas();
      renderChannels(Radio.state.channels, Radio.state.channel);
      return;
    }
    const act = e.target.closest('.ch-act');
    if (act) {
      if (!Radio.state.connected) { showRadioError('Primero conéctate al servidor de radio.'); return; }
      if (act.dataset.invite) { openInviteBox(act.dataset.invite); return; }
      if (act.dataset.del) {
        const name = act.dataset.del;
        if (confirm(`¿Eliminar el canal "${name}"?`)) Radio.deleteChannel(name);
        return;
      }
    }
    const btn = e.target.closest('.channel');
    if (!btn) return;
    if (!Radio.state.connected) { showRadioError('Primero conéctate al servidor de radio.'); return; }
    const name = btn.dataset.channel;
    const ch = (Radio.state.channels || []).find((c) => c.name === name);
    if (ch) {
      const check = canJoinChannel(ch);
      if (!check.ok) { showRadioError(check.why); return; }
    }
    await Radio.joinChannel(name);
  });

  $('#radio-leave').addEventListener('click', () => Radio.leaveChannel());

  // ---- Crear canal ----
  const openCreateForm = () => {
    if (!Radio.state.connected) { showRadioError('Primero conéctate al servidor de radio.'); return; }
    $('#channel-invite-box').classList.add('hidden');
    const form = $('#channel-form');
    form.classList.remove('hidden');
    $('#channel-name').value = '';

    // Secciones sugeridas (estilo categorías de Discord): las básicas + las que ya existen
    const base = ['General', 'Departamentos', 'Operaciones', 'Privados', 'Comando'];
    const cats = [...new Set([...base, ...(Radio.state.channels || []).map((c) => c.category || 'General')])];
    $('#channel-cat-list').innerHTML = cats.map((c) => `<option value="${esc(c)}"></option>`).join('');

    const staff = Radio.state.role === 'Administrador' || Radio.state.role === 'Supervisor';
    const vis = $('#channel-vis');
    vis.querySelector('option[value="general"]').disabled = !staff;
    if (!staff && vis.value === 'general') vis.value = 'dept';

    const deptSel = $('#channel-dept');
    deptSel.value = Radio.state.department;
    deptSel.disabled = !staff || vis.value === 'private';

    $('#channel-invite-wrap').classList.toggle('hidden', vis.value !== 'private');
    if (vis.value === 'private') renderInvitePicker('#channel-invite-list', []);
    $('#channel-cat').value = vis.value === 'private' ? 'Privados' : (vis.value === 'dept' ? 'Departamentos' : 'General');

    $('#channel-name').focus();
  };

  $('#channel-new').addEventListener('click', openCreateForm);
  $('#channel-create-cancel').addEventListener('click', () => $('#channel-form').classList.add('hidden'));

  $('#channel-vis').addEventListener('change', () => {
    const vis = $('#channel-vis').value;
    const staff = Radio.state.role === 'Administrador' || Radio.state.role === 'Supervisor';
    $('#channel-dept').disabled = !staff || vis === 'private';
    $('#channel-invite-wrap').classList.toggle('hidden', vis !== 'private');
    if (vis === 'private') renderInvitePicker('#channel-invite-list', []);
    $('#channel-cat').value = vis === 'private' ? 'Privados' : (vis === 'dept' ? 'Departamentos' : 'General');
  });

  $('#channel-create-ok').addEventListener('click', () => {
    const name = $('#channel-name').value.trim();
    if (name.length < 2) { showRadioError('Escribe un nombre de canal (mínimo 2 letras).'); return; }
    const vis = $('#channel-vis').value;
    const department = vis === 'dept' ? $('#channel-dept').value : null;
    const isPrivate = vis === 'private';
    const members = isPrivate ? pickedNames('#channel-invite-list') : [];
    const category = ($('#channel-cat').value || '').trim() || 'General';
    Radio.createChannel({ name, department, private: isPrivate, members, category });
    $('#channel-form').classList.add('hidden');
    flash('Creando canal…');
  });

  // ---- Invitar a un canal privado ----
  $('#channel-invite-cancel').addEventListener('click', () => {
    $('#channel-invite-box').classList.add('hidden');
    inviteChannel = null;
  });

  $('#channel-invite-ok').addEventListener('click', () => {
    if (!inviteChannel) return;
    const names = pickedNames('#channel-invite-users');
    if (!names.length) { showRadioError('Marca al menos una persona para invitar.'); return; }
    Radio.inviteToChannel(inviteChannel.name, names);
    $('#channel-invite-box').classList.add('hidden');
    flash('Invitados: ' + names.join(', '));
    inviteChannel = null;
  });

  // ---- Panel de administración de roles (solo propietario) ----
  $('#admin-users').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-admin-apply]');
    if (!btn) return;
    const row = btn.closest('.admin-row');
    const sel = row ? row.querySelector('select') : null;
    if (!sel) return;
    Radio.assignRole(btn.dataset.adminApply, sel.value);
    flash('Rol actualizado: ' + btn.dataset.adminApply + ' → ' + sel.value);
  });

  // Asignar rol a un oficial aunque no esté conectado (queda guardado en el servidor)
  const adminRoleSel = $('#admin-role');
  if (adminRoleSel) {
    adminRoleSel.innerHTML = ROLES_ASSIGNABLE.map((r) => `<option value="${r}">${esc(r)}</option>`).join('');
  }
  const adminOffline = $('#admin-apply-offline');
  if (adminOffline) {
    adminOffline.addEventListener('click', () => {
      const name = ($('#admin-name').value || '').trim();
      const role = adminRoleSel ? adminRoleSel.value : 'Miembro';
      if (!name) { flash('⚠️ Escribí el nombre exacto del oficial.'); return; }
      Radio.assignRole(name, role);
      $('#admin-name').value = '';
      flash('Rol guardado: ' + name + ' → ' + role);
    });
  }

  // ---- Botón de PTT en pantalla (ratón/táctil) ----
  const pttBtn = $('#ptt-button');
  pttBtn.addEventListener('mousedown', (e) => { e.preventDefault(); Radio.pttDown(); });
  pttBtn.addEventListener('mouseup', () => Radio.pttUp());
  pttBtn.addEventListener('mouseleave', () => Radio.pttUp());
  pttBtn.addEventListener('touchstart', (e) => { e.preventDefault(); Radio.pttDown(); });
  pttBtn.addEventListener('touchend', () => Radio.pttUp());

  // ---- Ajustes de PTT (sincronizados con la pestaña 🎧 Audio) ----
  $('#ptt-key').addEventListener('change', () => applyPttKey($('#ptt-key').value));
  $('#ptt-mode').addEventListener('change', () => applyPttMode($('#ptt-mode').value));
  $('#radio-volume').addEventListener('input', () => applyVolume(parseInt($('#radio-volume').value, 10)));

  // ---- Chat de radio ----
  const sendChat = () => {
    const input = $('#radio-chat-input');
    const text = input.value.trim();
    if (!text) return;
    Radio.sendChat(text);
    input.value = '';
  };
  $('#radio-chat-send').addEventListener('click', sendChat);
  $('#radio-chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

  // Seguridad: si la ventana pierde el foco mientras hablas, cerramos el micro
  window.addEventListener('blur', () => { if (Radio.state.pttActive) Radio.pttUp(); });
}

// ============================================================
// 14. Push-to-talk (tecla global o modo local)
// ============================================================

function isTypingTarget(t) {
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}

let pttModeText = '';

function updatePttNotes() {
  const key = $('#ptt-key').value;
  const note = pttModeText === 'global'
    ? '✅ Tecla global (' + key + '): funciona incluso dentro de ER:LC.'
    : pttModeText === 'local'
      ? '⚠️ Modo local: la tecla funciona solo con la app en primer plano.'
      : '';
  $('#ptt-note').textContent = note;
  if ($('#audio-ptt-note')) $('#audio-ptt-note').textContent = note;
}

function applyPttKey(key) {
  $('#ptt-key').value = key;
  $('#audio-ptt-key').value = key;
  Radio.setSettings({ pttKey: key });
  updatePttNotes();
  saveRadioPrefs();
  overlaySync();
}

function applyPttMode(mode) {
  $('#ptt-mode').value = mode;
  $('#audio-ptt-mode').value = mode;
  Radio.setSettings({ pttMode: mode });
  saveRadioPrefs();
}

function applyVolume(percent) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  $('#radio-volume').value = p;
  $('#audio-volume').value = p;
  Radio.setVolume(p / 100);
}

async function setupPtt() {
  const capable = await Radio.isGlobalPttCapable();
  if (capable) {
    window.cadNative.onPttDown(() => Radio.pttDown());
    window.cadNative.onPttUp(() => Radio.pttUp());
    pttModeText = 'global';
  } else {
    document.addEventListener('keydown', (e) => {
      if (e.repeat || isTypingTarget(e.target)) return;
      if (e.key.toUpperCase() !== Radio.state.settings.pttKey.toUpperCase()) return;
      if (Radio.state.settings.pttMode === 'toggle') {
        if (Radio.state.pttActive) Radio.pttUp(); else Radio.pttDown();
      } else {
        Radio.pttDown();
      }
    });
    document.addEventListener('keyup', (e) => {
      if (isTypingTarget(e.target)) return;
      if (e.key.toUpperCase() !== Radio.state.settings.pttKey.toUpperCase()) return;
      if (Radio.state.settings.pttMode === 'hold') Radio.pttUp();
    });
    pttModeText = 'local';
  }
  updatePttNotes();
}

// ============================================================
// 15. Alojar el servidor de radio en esta PC
// ============================================================

let hostActive = false;

async function updateHostUi(port) {
  const info = $('#host-info');
  const btn = $('#host-toggle');
  if (port) {
    const ips = await window.cadNative.getLanIps();
    const addrs = ips.length
      ? ips.map((i) => `<code>ws://${i.ip}:${port}</code>`).join('<br>')
      : `<code>ws://TU-IP:${port}</code>`;
    info.innerHTML = `<strong>Servidor activo</strong> (puerto ${port}).<br>Tus compañeros se conectan a:<br>${addrs}`;
    info.classList.remove('hidden');
    btn.textContent = '⏹ Detener radio alojado';
    btn.classList.remove('btn-primary');
  } else {
    info.classList.add('hidden');
    info.innerHTML = '';
    btn.textContent = '🖥️ Alojar radio en esta PC';
    btn.classList.add('btn-primary');
  }
}

function wireHosting() {
  if (!window.cadNative) {
    $('#host-toggle').disabled = true;
    return;
  }

  $('#host-toggle').addEventListener('click', async () => {
    if (!hostActive) {
      const r = await window.cadNative.hostStart(8787);
      if (!r.ok) { showRadioError('No se pudo alojar el radio: ' + r.error); return; }
      hostActive = true;
      $('#radio-server').value = 'ws://localhost:' + r.port;
      saveRadioPrefs();
      await updateHostUi(r.port);
      flash('Radio alojado en el puerto ' + r.port);
    } else {
      await window.cadNative.hostStop();
      hostActive = false;
      await updateHostUi(null);
      flash('Servidor de radio detenido');
    }
  });

  // Si ya estaba alojado (por ejemplo, tras recargar la ventana), reflejarlo
  window.cadNative.hostStatus().then((s) => {
    if (s && s.hosting) {
      hostActive = true;
      updateHostUi(s.port);
    }
  }).catch(() => {});
}

// ============================================================
// 16. Enlace con el bot de Discord (CAD → bot → Discord)
// ============================================================
// El CAD envía su estado (llamadas, unidades, BOLOs y registros) al bot cada
// vez que algo cambia; el bot decide qué anunciar y responde /dni en Discord.
// Ver bot/README.md.

const LINK_PREFS_KEY = 'cad-erlc-link-prefs';
let linkCfg = { url: '', key: '' };
let linkTimer = null;

function loadLinkPrefs() {
  try { linkCfg = Object.assign(linkCfg, JSON.parse(localStorage.getItem(LINK_PREFS_KEY) || '{}')); } catch {}
  $('#link-url').value = linkCfg.url || '';
  $('#link-key').value = linkCfg.key || '';
  if (linkCfg.url) renderLinkStatus();
}

function saveLinkPrefs() {
  linkCfg = {
    url: $('#link-url').value.trim().replace(/\/+$/, ''),
    key: $('#link-key').value.trim(),
  };
  try { localStorage.setItem(LINK_PREFS_KEY, JSON.stringify(linkCfg)); } catch {}
}

function renderLinkStatus(ok, detail) {
  const el = $('#link-status');
  if (!linkCfg.url) {
    el.textContent = 'Sin enlace. Si tenés el bot de Discord, poné su dirección y la clave.';
    el.style.color = '';
    return;
  }
  if (ok === true) {
    el.textContent = '✅ Enlazado con el bot · última sincronización ' +
      new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    el.style.color = '#22c55e';
  } else if (ok === false) {
    el.textContent = '⚠️ Sin conexión con el bot — revisá la dirección y la clave' + (detail ? ' (' + detail + ')' : '');
    el.style.color = '#f97316';
  } else {
    el.textContent = 'Enlace configurado: ' + linkCfg.url;
    el.style.color = '';
  }
}

// Envía el estado completo (llamadas, unidades, BOLOs) al bot.
async function linkPush() {
  if (!linkCfg.url || !linkCfg.key) return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(linkCfg.url + '/cad/snapshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cad-key': linkCfg.key },
      body: JSON.stringify({ calls: db.calls, units: db.units, bolos: db.bolos, persons: db.persons, vehicles: db.vehicles, fines: db.fines, warrants: db.warrants }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    renderLinkStatus(true);
    return true;
  } catch (err) {
    renderLinkStatus(false, err.name === 'AbortError' ? 'sin respuesta' : err.message);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Pequeña espera para agrupar varios cambios seguidos y no saturar al bot.
function linkPushSoon() {
  if (!linkCfg.url || !linkCfg.key) return;
  clearTimeout(linkTimer);
  linkTimer = setTimeout(linkPush, 400);
}

// Trae al CAD los DNI creados desde el Panel de Ciudadano. Así el staff
// puede buscarlos por nombre y agregarles multas u órdenes.
let lastWebSync = 0;
function dniKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function syncWebCitizens({ silent = true } = {}) {
  if (!linkCfg.url || !linkCfg.key) return 0;
  if (Date.now() - lastWebSync < 15000) return 0;
  lastWebSync = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(linkCfg.url + '/citizen/directory', {
      headers: { 'x-cad-key': linkCfg.key },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const list = Array.isArray(data.citizens) ? data.citizens : [];
    let added = 0;
    for (const item of list) {
      const dni = String(item && item.dni || '').trim();
      const name = String(item && item.name || '').trim();
      if (!dni || !name) continue;
      const key = dniKey(dni);
      if (!key || db.persons.some((p) => dniKey(p.dni) === key)) continue;
      db.persons.unshift({
        id: nextId('PER'),
        name,
        dni,
        dob: String(item.dob || ''),
        license: '',
        licStatus: 'Sin licencia',
        notes: 'DNI creado desde el Panel de Ciudadano.',
        source: 'web',
        createdAt: Number(item.createdAt) || Date.now(),
      });
      added++;
    }
    if (added > 0) {
      addLog('🪪 ' + added + ' DNI importado(s) desde el Panel de Ciudadano');
      renderAll();
      saveDb();
      if (!silent) flash('✅ ' + added + ' DNI importado(s) desde el panel');
    } else if (!silent) {
      flash('No hay DNI nuevos en el panel.');
    }
    return added;
  } catch (err) {
    if (!silent) flash('No se pudieron importar los DNI web: ' + (err.name === 'AbortError' ? 'sin respuesta' : err.message));
    return 0;
  } finally {
    clearTimeout(timer);
  }
}

function wireLink() {
  $('#link-save').addEventListener('click', async () => {
    saveLinkPrefs();
    if (!linkCfg.url) { flash('Escribe la dirección del bot.'); renderLinkStatus(); return; }
    if (!linkCfg.key) { flash('Escribe la clave del enlace.'); renderLinkStatus(); return; }
    flash('Probando enlace con el bot…');
    const ok = await linkPush();
    if (ok) {
      flash('Enlace con el bot: OK ✅');
      await syncWebCitizens({ silent: false });
    } else {
      flash('No se pudo enlazar con el bot ⚠️');
    }
  });
  window.addEventListener('focus', () => {
    if (linkCfg.url && linkCfg.key) syncWebCitizens({ silent: true });
  });
  updateLinkVisibility();
}

// El panel del enlace con el bot solo lo ve el propietario:
// la contraseña guardada (y por lo tanto el enlace) viven solo en su PC.
function updateLinkVisibility() {
  const panel = $('#link-panel');
  if (!panel) return;
  const canSee = Radio.state.isOwner || (!Radio.state.connected && !!getOwnerPass());
  panel.classList.toggle('hidden', !canSee);
}

// ============================================================
// 17. Pestaña 🎧 Audio: dispositivos, prueba de micrófono y tecla PTT
// ============================================================

const audioPrefs = { micDevice: '', outputDevice: '' };
let micTest = null; // { stream, ctx, analyser, monitorGain, data, raf, lastLoud }

function deviceLabel(dev, i) {
  if (dev.label) return dev.label;
  return dev.kind === 'audioinput' ? 'Micrófono ' + (i + 1) : 'Salida ' + (i + 1);
}

async function populateAudioDevices() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  let devices = [];
  try { devices = await navigator.mediaDevices.enumerateDevices(); } catch { return; }

  const inputSel = $('#audio-input');
  const outputSel = $('#audio-output');
  if (!inputSel || !outputSel) return;

  const inputs = devices.filter((d) => d.kind === 'audioinput');
  inputSel.innerHTML = inputs.length
    ? inputs.map((d, i) => `<option value="${esc(d.deviceId)}">${esc(deviceLabel(d, i))}</option>`).join('')
    : '<option value="">No se detectaron micrófonos</option>';
  if (audioPrefs.micDevice && inputs.some((d) => d.deviceId === audioPrefs.micDevice)) {
    inputSel.value = audioPrefs.micDevice;
  }

  const outputs = devices.filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'default');
  outputSel.innerHTML = '<option value="default">Predeterminado de Windows</option>'
    + outputs.map((d, i) => `<option value="${esc(d.deviceId)}">${esc(deviceLabel(d, i))}</option>`).join('');
  outputSel.value = outputs.some((d) => d.deviceId === audioPrefs.outputDevice) ? audioPrefs.outputDevice : 'default';
}

async function startMicTest() {
  stopMicTest();
  const box = $('#audio-test-box');
  const status = $('#mic-test-status');
  box.classList.remove('hidden');
  status.textContent = 'Abriendo micrófono…';
  status.classList.remove('ok');
  try {
    const deviceId = $('#audio-input').value;
    const constraints = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } };
    if (deviceId) constraints.audio.deviceId = { exact: deviceId };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    src.connect(analyser);
    const monitorGain = ctx.createGain();
    monitorGain.gain.value = $('#audio-monitor').checked ? 1 : 0;
    src.connect(monitorGain);
    monitorGain.connect(ctx.destination);
    const data = new Uint8Array(analyser.fftSize);
    micTest = { stream, ctx, analyser, monitorGain, data, raf: null, lastLoud: 0 };

    const bar = $('#mic-level-bar');
    const loop = () => {
      if (!micTest) return;
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (let i = 0; i < data.length; i++) {
        const v = Math.abs(data[i] - 128) / 128;
        if (v > peak) peak = v;
      }
      const pct = Math.min(100, Math.round(peak * 140));
      bar.style.width = pct + '%';
      bar.classList.toggle('hot', pct > 55);
      const now = Date.now();
      if (pct > 6) micTest.lastLoud = now;
      if (micTest.lastLoud && now - micTest.lastLoud < 1200) {
        status.textContent = '✅ Se está escuchando tu micrófono.';
        status.classList.add('ok');
      } else {
        status.textContent = '🔇 No detectamos sonido… hablá al micrófono o revisá que no esté silenciado.';
        status.classList.remove('ok');
      }
      micTest.raf = requestAnimationFrame(loop);
    };
    loop();

    const btn = $('#audio-input-test');
    btn.textContent = '⏹ Detener prueba';
    btn.classList.remove('btn-primary');
    populateAudioDevices(); // ya con permiso, aparecen los nombres reales de los micrófonos
  } catch (err) {
    status.textContent = '❌ No se pudo abrir el micrófono: ' + err.message;
  }
}

function stopMicTest() {
  if (!micTest) return;
  try { cancelAnimationFrame(micTest.raf); } catch {}
  try { for (const t of micTest.stream.getTracks()) t.stop(); } catch {}
  try { micTest.ctx.close(); } catch {}
  micTest = null;
  const bar = $('#mic-level-bar');
  if (bar) { bar.style.width = '0%'; bar.classList.remove('hot'); }
  const box = $('#audio-test-box');
  if (box) box.classList.add('hidden');
  const btn = $('#audio-input-test');
  if (btn) { btn.textContent = '🎤 Probar micrófono'; btn.classList.add('btn-primary'); }
}

function testOutputTone() {
  try {
    const ctx = new AudioContext();
    const id = $('#audio-output').value || 'default';
    if (ctx.setSinkId) ctx.setSinkId(id).catch(() => {});
    const beep = (freq, start, dur) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur + 0.05);
    };
    beep(620, 0, 0.18);
    beep(880, 0.22, 0.3);
    setTimeout(() => { try { ctx.close(); } catch {} }, 1200);
  } catch (err) {
    showRadioError('No se pudo probar la salida: ' + err.message);
  }
}

function wireAudioTab() {
  $('#audio-input').addEventListener('change', () => {
    audioPrefs.micDevice = $('#audio-input').value;
    Radio.setMicDevice(audioPrefs.micDevice);
    saveRadioPrefs();
    flash('Micrófono actualizado');
  });

  $('#audio-output').addEventListener('change', () => {
    audioPrefs.outputDevice = $('#audio-output').value;
    Radio.setOutputDevice(audioPrefs.outputDevice === 'default' ? '' : audioPrefs.outputDevice);
    saveRadioPrefs();
    flash('Salida de audio actualizada');
    testOutputTone();
  });

  $('#audio-input-test').addEventListener('click', () => {
    if (micTest) stopMicTest(); else startMicTest();
  });

  $('#audio-monitor').addEventListener('change', () => {
    if (micTest) micTest.monitorGain.gain.value = $('#audio-monitor').checked ? 1 : 0;
  });

  $('#audio-output-test').addEventListener('click', testOutputTone);

  // Ajustes de la tecla PTT dentro de la pestaña (sincronizados con la barra lateral)
  $('#audio-ptt-key').addEventListener('change', () => applyPttKey($('#audio-ptt-key').value));
  $('#audio-ptt-mode').addEventListener('change', () => applyPttMode($('#audio-ptt-mode').value));
  $('#audio-volume').addEventListener('input', () => applyVolume(parseInt($('#audio-volume').value, 10)));

  // ---- Volumen de los sonidos de la app (clic de radio y pánico) ----
  const syncSoundSliders = () => {
    $('#sound-radio-volume').value = Math.round(soundVolume('radioVolume') * 100);
    $('#sound-panic-volume').value = Math.round(soundVolume('panicVolume') * 100);
    $('#sound-radio-val').textContent = Math.round(soundVolume('radioVolume') * 100) + '%';
    $('#sound-panic-val').textContent = Math.round(soundVolume('panicVolume') * 100) + '%';
  };
  try { soundPrefs = Object.assign(soundPrefs, JSON.parse(localStorage.getItem(SOUND_PREFS_KEY) || '{}')); } catch {}
  syncSoundSliders();

  $('#sound-radio-volume').addEventListener('input', () => {
    soundPrefs.radioVolume = parseInt($('#sound-radio-volume').value, 10) / 100;
    saveSoundPrefs();
    syncSoundSliders();
  });
  $('#sound-panic-volume').addEventListener('input', () => {
    soundPrefs.panicVolume = parseInt($('#sound-panic-volume').value, 10) / 100;
    saveSoundPrefs();
    syncSoundSliders();
  });
  $('#sound-radio-test').addEventListener('click', () => playPttSound());
  $('#sound-panic-test').addEventListener('click', () => {
    panicSoundStart();
    setTimeout(panicSoundStop, 2600); // suena un ratito y se corta solo
  });

  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', populateAudioDevices);
  }
}

// ============================================================
// 18. Botón de pánico 🆘 y llamadas al 911 📞
// ============================================================

// ---------- Sonidos de la app (push-to-talk y pánico) ----------
// Los archivos viven en "assets". El volumen se configura en la pestaña 🎧 Audio.

const SOUND_PREFS_KEY = 'cad-erlc-sound-prefs';
let soundPrefs = { radioVolume: 1, panicVolume: 1 };
let panicAudio = null;

function saveSoundPrefs() {
  try { localStorage.setItem(SOUND_PREFS_KEY, JSON.stringify(soundPrefs)); } catch {}
}

function soundVolume(kind) {
  const v = Number(soundPrefs[kind]);
  return isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
}

// Clic del push-to-talk: precargado al arrancar para que suene AL INSTANTE (sin retraso)
const PTT_SOUND_SRC = 'assets/motorola-ptt.mp3';
const pttPool = [];
let pttPoolIdx = 0;

function preloadPttSound() {
  try {
    for (let i = 0; i < 3; i++) {
      const a = new Audio(PTT_SOUND_SRC);
      a.preload = 'auto';
      a.load();
      pttPool.push(a);
    }
  } catch {}
}

function playPttSound() {
  try {
    if (!pttPool.length) preloadPttSound();
    const a = pttPool[pttPoolIdx++ % pttPool.length];
    try { a.pause(); } catch {}
    a.currentTime = 0;
    a.volume = soundVolume('radioVolume');
    a.play().catch(() => {});
  } catch {}
}

// Sonido del pánico: suena assets/panic-button.mp3 en bucle hasta el "todo controlado"
function panicSoundStart() {
  panicSoundStop();
  try {
    panicAudio = new Audio('assets/panic-button.mp3');
    panicAudio.loop = true;
    panicAudio.volume = soundVolume('panicVolume');
    panicAudio.play().catch(() => {});
  } catch {}
}

function panicSoundStop() {
  if (panicAudio) {
    try { panicAudio.pause(); } catch {}
    panicAudio = null;
  }
}

function createPanicCall(p) {
  // Una misma alerta crea UNA sola llamada: el servidor de radio vuelve a
  // avisar del pánico activo cada vez que alguien entra, y no queremos
  // llamadas repetidas en Despacho.
  const already = db.calls.find((c) =>
    (p.ts && c.panicTs === p.ts) ||
    (c.panicFor === p.name && c.status !== 'cerrada' && Date.now() - c.createdAt < 60000));
  if (already) return;
  db.calls.unshift({
    id: nextId('call'),
    type: 'POLICE',
    priority: 'Crítica',
    location: p.note || 'Ubicación desconocida',
    description: '🆘 PÁNICO: ' + p.name + ' (' + deptInfo(p.department).short + ') pide ayuda',
    caller: p.name,
    status: 'pendiente',
    units: [],
    createdAt: Date.now(),
    panicFor: p.name,
    panicTs: p.ts || Date.now(),
  });
  saveDb();
  renderCalls();
}

function showPanicAlert(p) {
  const overlay = $('#panic-overlay');
  if (!overlay) return;
  panicState = { name: p.name || '', note: p.note || '', ts: p.ts || Date.now() };
  const self = String(p.name || '').trim() === ($('#radio-name').value || '').trim();
  const d = deptInfo(p.department);
  const ts = p.ts || Date.now();
  $('#panic-title').textContent = self ? '🆘 TU ALERTA FUE ENVIADA' : '🆘 ' + p.name + ' PIDE AYUDA';
  $('#panic-body').innerHTML =
    deptBadgeHtml(p.department) + ' ' +
    (p.note ? '📍 ' + esc(p.note) : '📍 Ubicación desconocida') +
    (self
      ? '<div class="muted small">Tus compañeros ya recibieron la alerta. Cuando estés a salvo, tocá "✅ TODO CONTROLADO".</div>'
      : '<div class="muted small">La llamada está en Despacho. 📟</div>');
  $('#panic-when').textContent = '⏰ ' + new Date(ts).toLocaleTimeString('es-ES');
  $('#panic-clear').classList.toggle('hidden', !self);
  overlay.classList.remove('hidden');
  // Si el aviso es viejo (por ejemplo, al reabrir el CAD con un pánico que
  // quedó activo), se muestra sin alarma sonora ni aviso emergente repetido.
  const fresh = Date.now() - ts < 120000;
  if (fresh) { panicSoundStart(); flash('🚨 ALERTA: ' + p.name); }
  createPanicCall(p);
  addLog('🆘 ' + p.name + ' (' + d.short + ') ¡PIDIÓ AYUDA!' + (p.note ? ' — ' + p.note : ''));
  renderLog();
}

function hidePanicAlert(p) {
  const overlay = $('#panic-overlay');
  if (overlay) overlay.classList.add('hidden');
  panicState = null;
  panicSoundStop();
  addLog('✅ ' + ((p && p.name) || 'La unidad') + ' dio el TODO CONTROLADO.');
  renderLog();
  flash('✅ Todo controlado — ' + ((p && p.name) || ''));
}

function wirePanic() {
  $('#panic-btn').addEventListener('click', () => dispararPanico());
  $('#panic-key').addEventListener('change', () => {
    sendPanicConfig();
    flash('🆘 Tecla de pánico: ' + ($('#panic-key').value || 'sin tecla'));
  });
  // Tecla global: dispara el pánico aunque la ventana esté minimizada o jugando ER:LC
  if (window.cadNative && cadNative.onPanicHotkey) cadNative.onPanicHotkey(() => dispararPanico());
  $('#panic-ack').addEventListener('click', () => {
    $('#panic-overlay').classList.add('hidden');
    panicSoundStop();
  });
  $('#panic-clear').addEventListener('click', () => Radio.clearPanic());
}

// ---------- Llamadas al 911 (desde la página web para civiles) ----------

function civilCallSound() {
  try {
    const ctx = new AudioContext();
    const play = (when, freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + when);
      gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + when + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + when + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + when);
      osc.stop(ctx.currentTime + when + 0.3);
    };
    play(0, 880);
    play(0.28, 1180);
    setTimeout(() => { try { ctx.close(); } catch {} }, 1200);
  } catch {}
}

function receiveCivilCall(call) {
  if (!call || !call.id) return;
  if (db.calls.some((c) => c.civilId === call.id)) return; // ya la registramos
  db.calls.unshift({
    id: nextId('call'),
    civilId: call.id,
    type: call.kind || 'OTHER',
    priority: 'Alta',
    location: call.location || 'Ubicación desconocida',
    description: '📞 911: ' + (call.description || 'Sin detalles'),
    caller: call.name || 'Ciudadano',
    status: 'pendiente',
    units: [],
    createdAt: Date.now(),
  });
  addLog('📞 Llamada 911 de ' + (call.name || 'un ciudadano') + ' — ' + (call.location || ''));
  saveDb();
  renderCalls();
  renderLog();
  flash('📞 ¡LLAMADA 911! ' + (call.name || 'Ciudadano') + ' — ' + (call.location || ''));
  civilCallSound();
}

// Muestra el enlace público del 911 (según el servidor de radio escrito arriba)
function updateCivilUrl() {
  const el = $('#radio-civil-url');
  if (!el) return;
  const raw = ($('#radio-server').value || '').trim();
  const m = raw.match(/^wss?:\/\/(.+?)\/?$/i);
  if (!m) { el.textContent = ''; return; }
  const httpUrl = (raw.toLowerCase().startsWith('wss') ? 'https://' : 'http://') + m[1].replace(/\/+$/, '');
  el.textContent = '📞 Enlace 911 para civiles: ' + httpUrl + '/911';
}

// ============================================================
// 19. 🟢 Servidor ER:LC en vivo (API oficial)
// ============================================================

const ERLC_KEY_STORAGE = 'cad-erlc-erlc-key';
const erlc = { connected: false, key: '', timer: null, lastCmdAt: 0, server: null, players: [] };

// Permisos de la pestaña ER:LC:
//  - Ver el servidor en vivo: Propietario, Administrador y Supervisor.
//  - Mandar comandos al juego: solo Propietario y Administrador.
// Además hace falta estar conectado al radio (ahí es donde se sabe tu rol).
function erlcCanView() {
  return Radio.state.connected
    && ['Propietario', 'Administrador', 'Supervisor'].includes(Radio.state.role);
}

function erlcCanCommand() {
  return Radio.state.connected
    && ['Propietario', 'Administrador'].includes(Radio.state.role);
}

function updateErlcVisibility() {
  const btn = $('#tab-btn-erlc');
  if (!btn) return;
  const canView = erlcCanView();

  if (!canView) {
    // Si estaba en la pestaña ER:LC, volver a Despacho. El mapa NO se toca:
    // los policías (Miembro) tienen acceso al mapa 2D en vivo.
    const sec = $('#tab-erlc');
    if (sec && sec.classList.contains('active')) {
      const home = document.querySelector('.tab[data-tab="despacho"]');
      if (home) home.click();
    }
    if (erlc.connected) erlcDisconnect();
  } else if (!erlcCanCommand()) {
    $('#erlc-cmd-panel').classList.add('hidden');
  }
  applyRoleUI();
}

function erlcSetStatus(text, ok) {
  const el = $('#erlc-status');
  if (!el) return;
  el.textContent = text;
  el.style.color = ok === true ? 'var(--ok)' : ok === false ? '#ef4444' : '';
}

function erlcPlayerName(p) {
  return String(p.Player || p.Username || '¿?').split(':')[0].trim() || '¿?';
}

function erlcTeamColor(team) {
  if (/police|policía|policia|lcpd/i.test(team)) return '#3b82f6';
  if (/sheriff|chp|highway|patrol/i.test(team)) return '#eab308';
  if (/fire|bomber|ems|medical|médic/i.test(team)) return '#ef4444';
  if (/dot|transport/i.test(team)) return '#a855f7';
  if (/mod|admin|staff|owner/i.test(team)) return '#10b981';
  return '#94a3b8';
}

function renderErlcPlayers() {
  const tbody = $('#erlc-tbody');
  if (!tbody) return;
  const list = erlc.players;
  $('#erlc-players-count').textContent = '👥 ' + list.length + ' en el juego';
  tbody.innerHTML = list.map((p) => {
    const team = String(p.Team || 'Sin equipo');
    const color = erlcTeamColor(team);
    return `<tr>
      <td>${esc(erlcPlayerName(p))}</td>
      <td><span class="pill" style="color:${color};background:${color}1c">${esc(team)}</span></td>
      <td>${p.Callsign ? esc(String(p.Callsign)) : '<span class="muted">—</span>'}</td>
      <td>${p.Permission ? esc(String(p.Permission)) : '<span class="muted">—</span>'}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="4" class="muted">Nadie conectado al juego ahora mismo.</td></tr>';
}

// Un solo sondeo alimenta la pestaña ER:LC y el Mapa (así no gastamos de más
// el límite de la API). /v2/server trae jugadores con ubicación real
// (X/Z + calle + código postal) y las llamadas de emergencia del juego.
let erlcCooldownUntil = 0;

function erlcSchedule() {
  if (erlc.timer) { clearInterval(erlc.timer); erlc.timer = null; }
  if (!erlc.connected && !mapState.open) return;
  const every = mapState.open ? 5000 : 10000;
  erlc.timer = setInterval(() => { erlcRefresh(); }, every);
  erlcRefresh();
}

function erlcStopPolling() {
  if (erlc.timer) { clearInterval(erlc.timer); erlc.timer = null; }
}

async function erlcRefresh() {
  if (!erlc.key) return;
  if (Date.now() < erlcCooldownUntil) return;
  if (!window.cadNative || !window.cadNative.erlcRequest) {
    erlcSetStatus('⚠️ Esta versión de la app no incluye la integración. Actualizá el .exe.', false);
    return;
  }

  const r = await window.cadNative.erlcRequest({
    serverKey: erlc.key,
    path: '/v2/server?Players=true&EmergencyCalls=true',
  });

  if (!r.ok) {
    const st = r.status;
    if (st === 429) {
      const wait = r.retryAfter || 15;
      erlcCooldownUntil = Date.now() + wait * 1000;
      if (erlc.connected) erlcSetStatus('⏳ La API pidió esperar ' + wait + ' s…', false);
      if (mapState.open) mapSetInfo('⏳ Límite de la API: esperando ' + wait + ' s…');
      return;
    }
    if (erlc.connected) {
      if (st === 401 || st === 403) {
        erlcSetStatus('❌ Server-key inválida. Copiala de nuevo desde el juego (Settings → API key).', false);
      } else {
        erlcSetStatus('❌ No se pudo conectar: ' + (r.error || ('HTTP ' + st)), false);
      }
    }
    if (mapState.open) mapSetInfo('⚠️ Sin datos: ' + (r.error || ('HTTP ' + st)));
    return;
  }

  const d = r.data || {};
  erlc.server = d;
  erlc.players = Array.isArray(d.Players) ? d.Players : [];
  mapState.calls = Array.isArray(d.EmergencyCalls) ? d.EmergencyCalls : [];

  if (erlc.connected) {
    const name = d.Name || d.name || 'Servidor ER:LC';
    $('#erlc-server-name').textContent = '🟢 ' + name;
    erlcSetStatus('✅ Conectado. Se actualiza solo cada ' + (mapState.open ? 5 : 10) + ' segundos.', true);
    renderErlcPlayers();

    const parts = ['🕒 Actualizado: ' + new Date().toLocaleTimeString('es-ES')];
    if (d.CurrentPlayers != null) parts.push('🎮 ' + d.CurrentPlayers + '/' + (d.MaxPlayers ?? '?') + ' jugadores');
    if (d.JoinKey) parts.push('🔑 Clave de ingreso: ' + d.JoinKey);
    $('#erlc-updated').textContent = parts.join(' · ');

    $('#erlc-live').classList.remove('hidden');
    $('#erlc-cmd-panel').classList.toggle('hidden', !erlcCanCommand());
  }

  if (mapState.open) mapRender();
}

function erlcConnect() {
  const keyInput = $('#erlc-key');
  const key = (keyInput.value || '').trim() || erlc.key;
  if (!key) {
    erlcSetStatus('⚠️ Pegá primero tu server-key.', false);
    return;
  }
  erlc.key = key;
  keyInput.value = key;
  try { localStorage.setItem(ERLC_KEY_STORAGE, key); } catch {}
  erlc.connected = true;
  $('#erlc-connect').classList.add('hidden');
  $('#erlc-disconnect').classList.remove('hidden');
  erlcSetStatus('⏳ Conectando con la API de ER:LC…');
  erlcSchedule();
}

function erlcDisconnect() {
  erlc.connected = false;
  erlcSchedule();
  $('#erlc-connect').classList.remove('hidden');
  $('#erlc-disconnect').classList.add('hidden');
  $('#erlc-live').classList.add('hidden');
  $('#erlc-cmd-panel').classList.add('hidden');
  erlcSetStatus('Desconectado. La clave queda guardada para la próxima vez.');
}

async function erlcSendCommand() {
  const input = $('#erlc-cmd');
  const cmd = (input.value || '').trim();
  if (!cmd) return;
  if (!erlc.key) { flash('⚠️ Conectate primero al servidor ER:LC.'); return; }
  if (!erlcCanCommand()) { flash('⚠️ Solo el Propietario y los Administradores pueden mandar mensajes al juego.'); return; }
  const wait = 5000 - (Date.now() - erlc.lastCmdAt);
  if (wait > 0) { flash('⏳ Esperá ' + Math.ceil(wait / 1000) + ' s (límite de la API).'); return; }

  const btn = $('#erlc-send');
  btn.disabled = true;
  const r = await window.cadNative.erlcRequest({
    serverKey: erlc.key,
    path: '/v2/server/command',
    method: 'POST',
    body: { command: cmd },
  });
  btn.disabled = false;

  if (r.ok) {
    erlc.lastCmdAt = Date.now();
    input.value = '';
    flash('✅ Enviado al juego: ' + cmd);
    addLog('📨 Mensaje al juego: ' + cmd);
    renderLog();
  } else if (r.status === 429) {
    erlc.lastCmdAt = Date.now();
    flash('⏳ La API pidió esperar ' + (r.retryAfter || 5) + ' segundos.');
  } else {
    flash('❌ No se pudo enviar (' + (r.status ? 'HTTP ' + r.status : r.error) + ').');
  }
}

function wireErlc() {
  try { erlc.key = localStorage.getItem(ERLC_KEY_STORAGE) || ''; } catch {}
  if (erlc.key) {
    $('#erlc-key').value = erlc.key;
    erlcSetStatus('⚡ Tenés una clave guardada. Tocá Conectar para ver el servidor en vivo.');
  }
  $('#erlc-connect').addEventListener('click', erlcConnect);
  $('#erlc-disconnect').addEventListener('click', erlcDisconnect);
  $('#erlc-send').addEventListener('click', erlcSendCommand);
  $('#erlc-cmd').addEventListener('keydown', (e) => { if (e.key === 'Enter') erlcSendCommand(); });

  // Al abrir la pestaña, refrescar al instante (si ya está conectado)
  const tabBtn = document.querySelector('.tab[data-tab="erlc"]');
  if (tabBtn) tabBtn.addEventListener('click', () => { if (erlc.connected) erlcRefresh(); });

  updateErlcVisibility();
}

// ============================================================
// 19c. 🗺️ Mapa en vivo (posiciones reales del juego)
// La API entrega las coordenadas del mundo en el mismo sistema que el mapa
// oficial (5355x5355): 1 unidad = 1 px y (0,0) en la esquina superior
// izquierda (verificado en vivo con el recorrido de un oficial: postales
// 231 -> 225). En la app usamos una copia recortada a 3200x3940.

const MAP_IMG_W = 3200;       // tamaño de src/assets/mapa.jpg
const MAP_IMG_H = 3940;
const MAP_SCALE = 3200 / 4184; // mundo (px del mapa oficial) -> px de la copia
const MAP_CROP_X = 523 * MAP_SCALE; // recorte aplicado (esquina de la isla)
const MAP_CROP_Y = 157 * MAP_SCALE;

const mapState = {
  open: false,
  zoom: 1,
  panX: 0,
  panY: 0,
  follow: null,
  showCiv: false,
  selected: null,
  calls: [],
  didFit: false,
};

function mapWorldToPx(x, z) {
  return {
    x: Number(x || 0) * MAP_SCALE - MAP_CROP_X,
    y: Number(z || 0) * MAP_SCALE - MAP_CROP_Y,
  };
}

function mapSetInfo(text) {
  const el = $('#map-info');
  if (el) el.textContent = text;
}

function mapApplyTransform() {
  const plane = $('#map-plane');
  if (!plane) return;
  plane.style.transform = `translate(${mapState.panX}px, ${mapState.panY}px) scale(${mapState.zoom})`;
}

function mapFit() {
  const vp = $('#map-viewport');
  if (!vp) return;
  const vw = vp.clientWidth || 900;
  const vh = vp.clientHeight || 500;
  mapState.zoom = Math.min(vw / MAP_IMG_W, vh / MAP_IMG_H) * 0.98;
  mapState.panX = (vw - MAP_IMG_W * mapState.zoom) / 2;
  mapState.panY = (vh - MAP_IMG_H * mapState.zoom) / 2;
  mapApplyTransform();
}

function mapCenterOn(px, py) {
  const vp = $('#map-viewport');
  if (!vp) return;
  mapState.panX = vp.clientWidth / 2 - px * mapState.zoom;
  mapState.panY = vp.clientHeight / 2 - py * mapState.zoom;
  mapApplyTransform();
}

function mapZoomAt(cx, cy, factor) {
  const z0 = mapState.zoom;
  const z1 = Math.min(3, Math.max(0.08, z0 * factor));
  const k = z1 / z0;
  mapState.panX = cx - (cx - mapState.panX) * k;
  mapState.panY = cy - (cy - mapState.panY) * k;
  mapState.zoom = z1;
  mapApplyTransform();
}

function mapShowSelected(p) {
  const box = $('#map-selected');
  if (!box || !p) return;
  const L = p.Location || {};
  const color = erlcTeamColor(String(p.Team || ''));
  const street = [L.BuildingNumber, L.StreetName].filter(Boolean).join(' ') || '—';
  const postal = L.PostalCode ? ' · CP ' + L.PostalCode : '';
  const following = mapState.follow === p.Player;
  box.innerHTML = `
    <div class="ms-head">
      <strong>${esc(erlcPlayerName(p))}</strong>
      <span class="pill" style="color:${color};background:${color}1c">${esc(String(p.Team || '—'))}</span>
      <button class="btn btn-small" id="map-sel-close" type="button">✕</button>
    </div>
    <div class="muted small">📍 ${esc(street)}${esc(postal)}</div>
    <div class="muted small">${p.Callsign ? '🚓 Indicativo ' + esc(String(p.Callsign)) + ' · ' : ''}⭐ ${Number(p.WantedStars || 0)} buscado(s)</div>
    <div class="ms-actions">
      <button class="btn btn-small ${following ? 'btn-ok' : 'btn-primary'}" id="map-sel-follow" type="button">${following ? '🎥 Siguiendo…' : '🎥 Seguir (cámara)'}</button>
    </div>`;
  box.classList.remove('hidden');
}

function mapStopFollow(silent) {
  mapState.follow = null;
  mapState.selected = null;
  const btn = $('#map-follow-stop');
  if (btn) btn.classList.add('hidden');
  const box = $('#map-selected');
  if (box) box.classList.add('hidden');
  if (!silent) mapRender();
}

function mapRender() {
  if (!mapState.open) return;
  const markers = $('#map-markers');
  if (!markers) return;

  const players = (erlc.players || []).filter((p) => p && p.Location && p.Location.LocationX != null);
  const others = players.filter((p) => !/civil/i.test(String(p.Team || '')));
  const shown = mapState.showCiv ? players : others;
  const calls = mapState.calls || [];

  let html = '';
  for (const c of calls) {
    if (!Array.isArray(c.Position) || c.Position.length < 2) continue;
    const pt = mapWorldToPx(c.Position[0], c.Position[1]);
    html += `<div class="map-marker map-call" data-map-call="${esc(String(c.CallNumber ?? ''))}" style="left:${pt.x}px;top:${pt.y}px">
      <span class="mm-pin">🚨</span><span class="mm-label">#${esc(String(c.CallNumber ?? '?'))}</span>
    </div>`;
  }
  for (const p of shown) {
    const L = p.Location;
    const pt = mapWorldToPx(L.LocationX, L.LocationZ);
    const color = erlcTeamColor(String(p.Team || ''));
    const label = p.Callsign ? String(p.Callsign) : erlcPlayerName(p);
    const sel = mapState.selected === p.Player || mapState.follow === p.Player;
    html += `<div class="map-marker${sel ? ' selected' : ''}" data-map-player="${esc(String(p.Player))}" style="left:${pt.x}px;top:${pt.y}px">
      <span class="mm-dot" style="background:${color};box-shadow:0 0 8px ${color}"></span>
      <span class="mm-label">${esc(label)}</span>
    </div>`;
  }
  markers.innerHTML = html;

  mapSetInfo(`👮 ${shown.length} en servicio · 👥 ${players.length} en el juego · 🚨 ${calls.length} llamadas · 🕒 ${new Date().toLocaleTimeString('es-ES')}`);

  // Modo "cámara": recentrar en la unidad que se está siguiendo.
  if (mapState.follow) {
    const p = players.find((x) => x.Player === mapState.follow);
    if (p) {
      const pt = mapWorldToPx(p.Location.LocationX, p.Location.LocationZ);
      mapCenterOn(pt.x, pt.y);
      mapShowSelected(p);
    } else {
      mapStopFollow(true);
      mapSetInfo('⚠️ La unidad que seguías salió del servidor.');
    }
  }
}

function mapOpen(on) {
  mapState.open = !!on;
  if (on) {
    if (!erlc.key) {
      mapSetInfo('⚠️ Falta la server-key: cargala en la pestaña ER:LC.');
    }
    if (!mapState.didFit) { mapFit(); mapState.didFit = true; }
    mapRender();
  }
  erlcSchedule();
}

function wireMapa() {
  const vp = $('#map-viewport');
  if (!vp) return;

  // El plano tiene el tamaño real de la imagen para ubicar los marcadores.
  const plane = $('#map-plane');
  if (plane) { plane.style.width = MAP_IMG_W + 'px'; plane.style.height = MAP_IMG_H + 'px'; }

  // Mostrar/ocultar civiles
  const civBtn = $('#map-civ-btn');
  if (civBtn) {
    civBtn.addEventListener('click', () => {
      mapState.showCiv = !mapState.showCiv;
      civBtn.classList.toggle('active', mapState.showCiv);
      mapRender();
    });
  }

  // Zoom
  if ($('#map-zoom-in')) $('#map-zoom-in').addEventListener('click', () => mapZoomAt(vp.clientWidth / 2, vp.clientHeight / 2, 1.3));
  if ($('#map-zoom-out')) $('#map-zoom-out').addEventListener('click', () => mapZoomAt(vp.clientWidth / 2, vp.clientHeight / 2, 1 / 1.3));
  if ($('#map-center')) $('#map-center').addEventListener('click', mapFit);

  // Rueda del mouse: zoom hacia el cursor
  vp.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = vp.getBoundingClientRect();
    mapZoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.15 : 1 / 1.15);
  }, { passive: false });

  // Arrastrar para mover el mapa
  let dragging = false, sx = 0, sy = 0, px0 = 0, py0 = 0;
  vp.addEventListener('mousedown', (e) => {
    if (e.target.closest('.map-marker') || e.target.closest('#map-selected')) return;
    dragging = true; sx = e.clientX; sy = e.clientY; px0 = mapState.panX; py0 = mapState.panY;
    vp.classList.add('dragging');
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    mapState.panX = px0 + (e.clientX - sx);
    mapState.panY = py0 + (e.clientY - sy);
    mapApplyTransform();
  });
  window.addEventListener('mouseup', () => { dragging = false; vp.classList.remove('dragging'); });

  // Clic en unidades y llamadas
  const markersEl = $('#map-markers');
  if (markersEl) {
    markersEl.addEventListener('click', (e) => {
      const m = e.target.closest('[data-map-player]');
      if (m) {
        const p = (erlc.players || []).find((x) => String(x.Player) === m.dataset.mapPlayer);
        if (p) {
          mapState.selected = p.Player;
          mapShowSelected(p);
          mapRender();
        }
        return;
      }
      const c = e.target.closest('[data-map-call]');
      if (c) {
        const call = (mapState.calls || []).find((x) => String(x.CallNumber) === c.dataset.mapCall);
        const box = $('#map-selected');
        if (call && box) {
          box.innerHTML = `
            <div class="ms-head"><strong>🚨 Llamada #${esc(String(call.CallNumber ?? '?'))}</strong>
            <button class="btn btn-small" id="map-sel-close" type="button">✕</button></div>
            <div class="muted small">${esc(String(call.Description || 'Sin detalles'))}</div>
            <div class="muted small">📍 ${esc(String(call.PositionDescriptor || '—'))} · Equipo: ${esc(String(call.Team || '—'))}</div>`;
          box.classList.remove('hidden');
        }
      }
    });
  }

  // Botones de la tarjeta (se re-renderiza, por eso va delegado)
  document.addEventListener('click', (e) => {
    if (e.target.id === 'map-sel-close') {
      const box = $('#map-selected');
      if (box) box.classList.add('hidden');
      mapState.selected = null;
      mapRender();
      return;
    }
    if (e.target.id === 'map-sel-follow') {
      if (mapState.follow) { mapStopFollow(); return; }
      const p = (erlc.players || []).find((x) => String(x.Player) === mapState.selected);
      if (!p) return;
      mapState.follow = p.Player;
      const stop = $('#map-follow-stop');
      if (stop) { stop.classList.remove('hidden'); stop.textContent = '🎥 ' + (p.Callsign || erlcPlayerName(p)) + ' ✕'; }
      mapRender();
      flash('🎥 Siguiendo a ' + (p.Callsign || erlcPlayerName(p)) + ' en el mapa');
    }
  });

  if ($('#map-follow-stop')) $('#map-follow-stop').addEventListener('click', () => mapStopFollow());
}

// ============================================================
// 19b. Acceso con contraseña + tecla global de pánico
// ============================================================

// Contraseña para entrar al MDT (se pide al abrir la app)
const CLAVE_INGRESO = 'LAAY';

function wireLogin() {
  const overlay = $('#login-overlay');
  if (!overlay) return;
  const input = $('#login-pass');
  const nameInput = $('#login-name');
  const saved = readSession();

  if (saved && saved.name) {
    currentUserName = saved.name;
    currentRole = saved.role || resolveRoleForName(saved.name);
    if (nameInput) nameInput.value = saved.name;
    const rn = $('#radio-name');
    if (rn && !rn.value) rn.value = saved.name;
    overlay.classList.add('hidden');
    applyRoleUI();
    setTimeout(() => flash('🔓 Bienvenido de nuevo, ' + currentUserName), 700);
  } else {
    const rn = $('#radio-name');
    if (nameInput && rn && rn.value) nameInput.value = rn.value;
    setTimeout(() => input.focus(), 250);
  }

  const entrar = () => {
    const ok = (input.value || '').trim().toUpperCase() === CLAVE_INGRESO;
    if (!ok) {
      $('#login-error').classList.remove('hidden');
      input.value = '';
      input.focus();
      overlay.classList.remove('shake');
      void overlay.offsetWidth; // reinicia la animación de error
      overlay.classList.add('shake');
      return;
    }
    currentUserName = (nameInput ? nameInput.value.trim() : '') || currentUserName || 'Oficial';
    const rn = $('#radio-name');
    if (rn) rn.value = currentUserName;
    saveRadioPrefs();
    currentRole = (saved && saved.name === currentUserName)
      ? (saved.role || resolveRoleForName(currentUserName))
      : resolveRoleForName(currentUserName);
    saveSession();
    overlay.classList.add('hidden');
    input.value = '';
    applyRoleUI();
    // Directo al MDT general (vista principal)
    const home = document.querySelector('.tab[data-tab="despacho"]');
    if (home) home.click();
    flash('🔓 Bienvenido al MDT general, ' + currentUserName);
  };
  $('#login-enter').addEventListener('click', entrar);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') entrar(); });
  if (nameInput) nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.focus(); } });

  const logout = $('#logout-btn');
  if (logout) {
    logout.addEventListener('click', () => {
      if (!confirm('¿Cerrar sesión en esta PC? Tu nombre y rango quedan guardados para la próxima.')) return;
      clearSession();
      currentUserName = '';
      location.reload();
    });
  }
  applyRoleUI();
}

const PANIC_PREFS_KEY = 'cad-erlc-panic-prefs';

function sendPanicConfig() {
  const sel = $('#panic-key');
  const key = sel ? sel.value : 'F8';
  try { localStorage.setItem(PANIC_PREFS_KEY, JSON.stringify({ key })); } catch {}
  if (window.cadNative && cadNative.setPanicConfig) cadNative.setPanicConfig({ key });
}

function loadPanicPrefs() {
  let prefs = { key: 'F8' };
  try { prefs = Object.assign(prefs, JSON.parse(localStorage.getItem(PANIC_PREFS_KEY) || '{}')); } catch {}
  const sel = $('#panic-key');
  if (sel) sel.value = prefs.key || '';
  sendPanicConfig();
}

// Dispara la alerta de pánico: lo usan el botón, la tecla global y la radio flotante
// (desde la radio flotante se pasa la ubicación escrita ahí).
function dispararPanico(noteArg) {
  if (!Radio.state.connected) {
    showRadioError('Conéctate al radio primero para poder pedir ayuda.');
    return;
  }
  const fromOverlay = typeof noteArg === 'string';
  const note = (fromOverlay ? noteArg : ($('#panic-where').value || '')).trim();
  Radio.sendPanic(note);
  if (!fromOverlay) $('#panic-where').value = '';
  flash('🆘 Enviando alerta a todo el CAD…');
}

// ============================================================
// 20. Arranque
// ============================================================

function init() {
  loadDb();
  populateSelects();
  wireForms();
  wireTabs();
  startClock();

  Radio.setEventHandler(onRadioEvent);
  loadRadioPrefs();
  Radio.setSettings({ pttKey: $('#ptt-key').value, pttMode: $('#ptt-mode').value });
  wireRadio();
  wireOverlay();
  wireAudioTab();
  wireRegistros();
  wireDataSections();
  wirePanic();
  wireErlc();
  wireMapa();
  wireHosting();
  setupPtt();
  populateAudioDevices();
  loadPanicPrefs();
  wireLogin();
  preloadPttSound();

  loadLinkPrefs();
  wireLink();

  renderAll();
  renderChannels(Radio.DEFAULT_CHANNELS, null);
  renderMembers([]);

  linkPushSoon(); // si hay enlace configurado, el bot recibe el estado al arrancar
  setTimeout(() => syncWebCitizens({ silent: true }), 1500); // importar DNI web
}

init();
