// ============================================================
//  CAD ER:LC — lógica de la interfaz
// ============================================================
// Aquí vive el despacho (llamadas, unidades, roster, BOLOs, historial),
// la conexión con el radio de voz y los ajustes de push-to-talk.

// ============================================================
// 1. Catálogos
// ============================================================

const DEPARTMENTS = {
  LCPD:     { short: 'LCPD',    name: 'LCPD · Policía',      color: '#3b82f6' },
  LCSO:     { short: 'LCSO',    name: 'LCSO · Sheriff',      color: '#d97706' },
  LCFD:     { short: 'LCFD',    name: 'LCFD · Bomberos/EMS', color: '#ef4444' },
  DOT:      { short: 'DOT',     name: 'DOT · Transporte',    color: '#f59e0b' },
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
let db = { seq: 1, calls: [], units: [], roster: [], bolos: [], log: [] };

function loadDb() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) db = Object.assign(db, JSON.parse(raw));
  } catch (err) {
    console.warn('No se pudo cargar la base local:', err);
  }
}

function saveDb() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); } catch {}
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

function deptInfo(key) {
  return DEPARTMENTS[key] || { short: key || '—', name: key || 'Sin departamento', color: '#64748b' };
}

function deptBadgeHtml(key) {
  const d = deptInfo(key);
  return `<span class="badge" style="color:${d.color};border-color:${d.color}55;background:${d.color}18">${esc(d.short)}</span>`;
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

function renderCalls() {
  const cont = $('#calls-list');
  const calls = [...db.calls].sort((a, b) => {
    const openA = a.status === 'cerrada' ? 1 : 0;
    const openB = b.status === 'cerrada' ? 1 : 0;
    return openA - openB || b.createdAt - a.createdAt;
  });
  if (!calls.length) {
    cont.innerHTML = '<div class="empty">No hay llamadas registradas. Crea la primera arriba. ⤴</div>';
    return;
  }
  cont.innerHTML = calls.map(callCardHtml).join('');
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

function renderUnits() {
  const tbody = $('#units-tbody');
  if (!db.units.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">Sin unidades registradas.</td></tr>';
    return;
  }
  tbody.innerHTML = db.units.map((u) => {
    const st = UNIT_STATUSES[u.status] || UNIT_STATUSES['10-8'];
    const call = u.callId ? db.calls.find((c) => c.id === u.callId) : null;
    const options = Object.entries(UNIT_STATUSES)
      .map(([k, v]) => `<option value="${k}" ${k === u.status ? 'selected' : ''}>${esc(v.label)}</option>`)
      .join('');
    return `<tr>
      <td><strong>${esc(u.name)}</strong></td>
      <td>${deptBadgeHtml(u.dept)}</td>
      <td>${esc(u.operator || '—')}</td>
      <td><span class="pill" style="color:${st.color};background:${st.color}1c">${esc(st.label)}</span></td>
      <td>${call ? esc('#' + call.id + ' · ' + call.location) : '<span class="muted">—</span>'}</td>
      <td class="row-actions">
        <select class="status-select" data-id="${u.id}">${options}</select>
        <button class="btn btn-small btn-danger" data-action="unit-delete" data-id="${u.id}">🗑</button>
      </td>
    </tr>`;
  }).join('');
}

$('#units-tbody').addEventListener('change', (e) => {
  const sel = e.target.closest('.status-select');
  if (!sel) return;
  const unit = db.units.find((u) => u.id === sel.dataset.id);
  if (!unit) return;
  setUnitStatus(unit, sel.value);
  saveDb();
  renderAll();
});

$('#units-tbody').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action="unit-delete"]');
  if (!btn) return;
  const unit = db.units.find((u) => u.id === btn.dataset.id);
  if (!unit) return;
  if (!confirm(`¿Eliminar la unidad ${unit.name}?`)) return;
  if (unit.callId) {
    const call = db.calls.find((c) => c.id === unit.callId);
    if (call) call.units = call.units.filter((x) => x !== unit.id);
  }
  db.units = db.units.filter((u) => u.id !== unit.id);
  addLog(`Unidad ${unit.name} eliminada`);
  saveDb();
  renderAll();
});

// ============================================================
// 7. Render del roster
// ============================================================

function renderRoster() {
  const tbody = $('#roster-tbody');
  if (!db.roster.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty">El roster está vacío.</td></tr>';
    return;
  }
  tbody.innerHTML = db.roster.map((p) => `<tr>
      <td><strong>${esc(p.name)}</strong></td>
      <td>${esc(p.rank)}</td>
      <td>${deptBadgeHtml(p.dept)}</td>
      <td class="row-actions">
        <button class="btn btn-small btn-danger" data-action="roster-delete" data-id="${p.id}">🗑</button>
      </td>
    </tr>`).join('');
}

$('#roster-tbody').addEventListener('click', (e) => {
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

function renderBolos() {
  const cont = $('#bolos-list');
  if (!db.bolos.length) {
    cont.innerHTML = '<div class="empty">No hay BOLOs activos.</div>';
    return;
  }
  cont.innerHTML = db.bolos.map((b) => {
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
  }).join('');
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
// 9. Render del historial
// ============================================================

function renderLog() {
  const cont = $('#log-list');
  if (!db.log.length) {
    cont.innerHTML = '<div class="empty">Sin eventos todavía.</div>';
    return;
  }
  cont.innerHTML = db.log.slice(0, 200)
    .map((l) => `<div class="log-row"><span class="muted">${fmtTime(l.ts)}</span><span>${esc(l.text)}</span></div>`)
    .join('');
}

// ============================================================
// 10. Formularios
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
    const unit = {
      id: nextId('U'),
      name,
      dept: $('#unit-dept').value,
      operator: $('#unit-operator').value.trim(),
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

  // ---- Borrar historial ----
  $('#log-clear').addEventListener('click', () => {
    if (!confirm('¿Borrar todo el historial?')) return;
    db.log = [];
    saveDb();
    renderAll();
  });
}

// ============================================================
// 11. Pestañas y reloj
// ============================================================

function wireTabs() {
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-content').forEach((sec) => {
        sec.classList.toggle('active', sec.id === 'tab-' + btn.dataset.tab);
      });
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
// 12. Radio: interfaz
// ============================================================

const RADIO_PREFS_KEY = 'cad-erlc-radio-prefs';

function saveRadioPrefs() {
  const prefs = {
    server: $('#radio-server').value.trim(),
    name: $('#radio-name').value.trim(),
    dept: $('#radio-dept').value,
    pttKey: $('#ptt-key').value,
    pttMode: $('#ptt-mode').value,
  };
  try { localStorage.setItem(RADIO_PREFS_KEY, JSON.stringify(prefs)); } catch {}
}

function loadRadioPrefs() {
  let prefs = {};
  try { prefs = JSON.parse(localStorage.getItem(RADIO_PREFS_KEY) || '{}'); } catch {}
  if (prefs.server) $('#radio-server').value = prefs.server;
  if (prefs.name) $('#radio-name').value = prefs.name;
  if (prefs.dept) $('#radio-dept').value = prefs.dept;
  if (prefs.pttKey) $('#ptt-key').value = prefs.pttKey;
  if (prefs.pttMode) $('#ptt-mode').value = prefs.pttMode;
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

function renderChannels(channels, current) {
  $('#channel-list').innerHTML = channels.map((ch) => {
    const inChannel = ch === current && Radio.state.channel;
    const count = inChannel ? Radio.state.members.size + 1 : '';
    return `<button class="channel ${inChannel ? 'active' : ''}" data-channel="${esc(ch)}">
      <span class="channel-icon">#</span>${esc(ch)}<span class="channel-count">${count}</span>
    </button>`;
  }).join('');
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
    </li>`).join('');
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
      flash('Conectado al servidor de radio');
      break;

    case 'disconnected':
      setRadioStatus(false);
      $('#radio-connect').textContent = 'Conectar';
      $('#radio-connect').classList.add('btn-primary');
      $('#radio-connect').classList.remove('btn-danger');
      renderChannels(Radio.DEFAULT_CHANNELS, null);
      renderMembers([]);
      setPttIndicator(false);
      $('#radio-leave').classList.add('hidden');
      break;

    case 'channels':
      renderChannels(payload, Radio.state.channel);
      break;

    case 'joined':
      renderChannels(Radio.state.channels, payload);
      renderMembers(membersWithSelf());
      $('#radio-leave').classList.remove('hidden');
      flash('Entraste al canal "' + payload + '"');
      break;

    case 'left':
      renderChannels(Radio.state.channels, null);
      renderMembers([]);
      $('#radio-leave').classList.add('hidden');
      break;

    case 'roster':
      renderMembers(membersWithSelf());
      break;

    case 'chat':
      appendRadioChat(payload);
      break;

    case 'ptt':
      setPttIndicator(payload);
      renderMembers(membersWithSelf());
      break;

    case 'ptt-blocked':
      // PTT pulsado sin estar en un canal: no hacemos ruido visual
      break;

    case 'error':
      showRadioError(payload);
      break;
  }
}

function wireRadio() {
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
    const ok = await Radio.connect(url, name, dept);
    btn.disabled = false;
    if (!ok) {
      btn.textContent = 'Conectar';
      btn.classList.add('btn-primary');
      btn.classList.remove('btn-danger');
    }
  });

  // ---- Canales ----
  $('#channel-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('.channel');
    if (!btn) return;
    if (!Radio.state.connected) { showRadioError('Primero conéctate al servidor de radio.'); return; }
    await Radio.joinChannel(btn.dataset.channel);
  });

  $('#radio-leave').addEventListener('click', () => Radio.leaveChannel());

  // ---- Botón de PTT en pantalla (ratón/táctil) ----
  const pttBtn = $('#ptt-button');
  pttBtn.addEventListener('mousedown', (e) => { e.preventDefault(); Radio.pttDown(); });
  pttBtn.addEventListener('mouseup', () => Radio.pttUp());
  pttBtn.addEventListener('mouseleave', () => Radio.pttUp());
  pttBtn.addEventListener('touchstart', (e) => { e.preventDefault(); Radio.pttDown(); });
  pttBtn.addEventListener('touchend', () => Radio.pttUp());

  // ---- Ajustes de PTT ----
  $('#ptt-key').addEventListener('change', () => { Radio.setSettings({ pttKey: $('#ptt-key').value }); saveRadioPrefs(); });
  $('#ptt-mode').addEventListener('change', () => { Radio.setSettings({ pttMode: $('#ptt-mode').value }); saveRadioPrefs(); });
  $('#radio-volume').addEventListener('input', () => Radio.setVolume(parseInt($('#radio-volume').value, 10) / 100));

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
// 13. Push-to-talk (tecla global o modo local)
// ============================================================

function isTypingTarget(t) {
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}

async function setupPtt() {
  const capable = await Radio.isGlobalPttCapable();
  if (capable) {
    window.cadNative.onPttDown(() => Radio.pttDown());
    window.cadNative.onPttUp(() => Radio.pttUp());
    $('#ptt-note').textContent = '✅ Tecla global (' + $('#ptt-key').value + '): funciona incluso dentro de ER:LC.';
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
    $('#ptt-note').textContent = '⚠️ Modo local: la tecla funciona solo con la app en primer plano.';
  }
}

// ============================================================
// 14. Alojar el servidor de radio en esta PC
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
// 15. Arranque
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
  wireHosting();
  setupPtt();

  renderAll();
  renderChannels(Radio.DEFAULT_CHANNELS, null);
  renderMembers([]);
}

init();
