/* ============================================================
   LA REALIDAD RP — Panel de Ciudadano (dashboard)
   ------------------------------------------------------------
   Muestra los datos que el CAD envía al bot:
   DNI, licencia, vehículos, multas y órdenes.
   ============================================================ */

(function () {
  'use strict';

  const CFG = window.LR_CONFIG || {};
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const norm = (s) => String(s == null ? '' : s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  const safeUrl = (s) => (/^https?:\/\//i.test(String(s || '')) ? String(s) : '');
  const money = (n) => '$' + (Number(n) || 0).toLocaleString('es-AR');
  const dateFmt = (ts) => {
    if (!ts) return '—';
    const d = new Date(Number(ts));
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  const dobFmt = (value) => {
    if (!value) return '—';
    const d = new Date(String(value) + 'T12:00:00');
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });
  };
  const usDate = (value) => {
    if (!value) return '—';
    const raw = String(value);
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw + 'T12:00:00' : Number(value));
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  };
  const heightImperial = (cm) => {
    const n = Number(cm);
    if (!n) return '—';
    const total = Math.round(n / 2.54);
    let feet = Math.floor(total / 12);
    let inches = total % 12;
    if (inches === 12) { feet += 1; inches = 0; }
    return feet + "'-" + String(inches).padStart(2, '0') + '"';
  };
  const weightPounds = (kg) => {
    const n = Number(kg);
    return n ? Math.round(n * 2.20462) + ' lb' : '—';
  };
  const sexText = (value) => {
    const v = String(value || '').toUpperCase();
    return v === 'M' ? 'M' : v === 'F' ? 'F' : v === 'X' ? 'X' : '—';
  };
  const licenseInfo = (c) => c && c.licenseInfo ? c.licenseInfo : {
    status: 'none',
    label: (c && c.licStatus) || 'Sin licencia',
    number: (c && c.license) || '',
    submittedAt: 0,
    reviewedAt: 0,
    reviewedBy: '',
    issuedAt: 0,
    expiresAt: 0,
    rejectionReason: '',
    application: null,
  };
  const licenseTone = (status) => {
    const s = norm(status);
    if (s.includes('rechaz') || s.includes('revocada')) return 'red';
    if (s.includes('revision') || s.includes('revisión') || s.includes('pendiente') || s.includes('suspendida')) return 'gold';
    if (s.includes('valida') || s.includes('válida')) return 'ok';
    return 'neutral';
  };
  const ageText = (citizen) => {
    const age = Number(citizen && citizen.age) || ageFromDob(citizen && citizen.dob);
    return age ? age + ' año' + (age === 1 ? '' : 's') : '—';
  };
  const ageFromDob = (value) => {
    const dob = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
    const d = new Date(dob + 'T12:00:00');
    if (Number.isNaN(d.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - d.getFullYear();
    const m = today.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
    return age >= 0 && age <= 120 ? age : null;
  };
  const relative = (ts) => {
    if (!ts) return 'sin datos';
    const s = Math.max(0, Math.floor((Date.now() - Number(ts)) / 1000));
    if (s < 45) return 'hace un momento';
    const m = Math.floor(s / 60);
    if (m < 60) return `hace ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.floor(h / 24);
    return `hace ${d} día${d === 1 ? '' : 's'}`;
  };
  const initials = (value) => {
    const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  };
  const firstName = (value) => String(value || '').trim().split(/\s+/)[0] || 'ciudadano';
  const recordTone = (status) => {
    const s = norm(status);
    if (s.includes('activa') || s.includes('robado') || s.includes('vencida')) return 'red';
    if (s.includes('pagada') || s.includes('cumplida') || s.includes('normal') || s.includes('resuelta')) return 'ok';
    return 'gold';
  };

  const TABS = ['resumen', 'dni', 'licencia', 'vehiculos', 'multas', 'ordenes', 'ajustes'];

  const state = {
    user: null,
    linked: false,
    waiting: false,
    missing: false,
    citizen: null,
    cadUpdatedAt: 0,
    serverNow: 0,
    loading: true,
    loaded: false,
    requestInFlight: false,
    error: '',
    tab: 'resumen',
    unlinkConfirm: false,
    canUnlink: true,
    source: '',
    cadMissing: false,
    licenseFormOpen: false,
    licenseSending: false,
  };

  let unlinkTimer = null;
  let liveTimer = null;
  let pollTimer = null;

  function LR() {
    return window.LRApp || null;
  }

  function currentUser() {
    return state.user || (LR() && LR().Auth.user) || null;
  }

  function avatarMarkup(extraClass) {
    const user = currentUser();
    const cls = 'citizen-avatar' + (extraClass ? ' ' + extraClass : '');
    const url = safeUrl(user && user.avatar);
    const fallback = esc(initials(user && (user.displayName || user.username)));
    if (url) {
      return '<span class="' + cls + '"><img src="' + esc(url) + '" alt="" referrerpolicy="no-referrer" onerror="this.remove()">' + fallback + '</span>';
    }
    return '<span class="' + cls + '">' + fallback + '</span>';
  }

  function chip(text, tone, extra) {
    return '<span class="citizen-chip ' + (tone || 'neutral') + (extra ? ' ' + extra : '') + '">' + esc(text) + '</span>';
  }

  function showGate() {
    const gate = $('#citizenGate');
    const app = $('#citizenApp');
    const live = $('#citizenLive');
    if (gate) gate.hidden = false;
    if (app) app.hidden = true;
    if (live) live.hidden = true;
  }

  function showApp() {
    const gate = $('#citizenGate');
    const app = $('#citizenApp');
    if (gate) gate.hidden = true;
    if (app) app.hidden = false;
  }

  function setLiveTone(tone) {
    const dot = $('#citizenLiveDot');
    if (!dot) return;
    dot.className = 'citizen-live-dot ' + (tone || 'ok');
  }

  function renderLive() {
    const live = $('#citizenLive');
    if (!live) return;
    if (!state.user) {
      live.hidden = true;
      return;
    }
    live.hidden = false;
    const title = $('#citizenLiveTitle');
    const sub = $('#citizenLiveSub');
    if (state.loading && !state.loaded) {
      setLiveTone('loading');
      if (title) title.textContent = 'Consultando el CAD';
      if (sub) sub.textContent = 'Un momento…';
      return;
    }
    if (state.error && !state.citizen) {
      setLiveTone('err');
      if (title) title.textContent = 'Sin conexión';
      if (sub) sub.textContent = 'No pude leer los registros';
      return;
    }
    if (state.waiting) {
      setLiveTone('warn');
      if (title) title.textContent = 'CAD sin datos';
      if (sub) sub.textContent = 'Abrí la app del CAD para sincronizar';
      return;
    }
    if (state.missing) {
      setLiveTone('warn');
      if (title) title.textContent = 'DNI no encontrado';
      if (sub) sub.textContent = 'El registro cambió en el CAD';
      return;
    }
    if (!state.cadUpdatedAt) {
      setLiveTone('warn');
      if (title) title.textContent = 'CAD sin datos';
      if (sub) sub.textContent = 'Esperando la primera sincronización';
      return;
    }
    setLiveTone(state.error ? 'warn' : 'ok');
    if (title) title.textContent = state.error ? 'Datos sin actualizar' : 'CAD conectado';
    if (sub) sub.textContent = 'Actualizado ' + relative(state.cadUpdatedAt);
  }

  function renderSidebar() {
    const box = $('#citizenSideProfile');
    if (!box) return;
    const user = currentUser();
    if (!user) {
      box.innerHTML = '';
      return;
    }
    const dni = (state.citizen && state.citizen.dni) || user.dni || '';
    const linked = state.linked;
    box.innerHTML = '' +
      avatarMarkup('citizen-side-avatar') +
      '<div class="citizen-side-name">' +
        '<b>' + esc(user.displayName || user.username) + '</b>' +
        '<span>@' + esc(user.username) + '</span>' +
      '</div>' +
      '<div class="citizen-side-tags">' +
        chip(user.role || 'Ciudadano', 'role') +
        (linked ? chip('DNI ' + dni, 'ok') : chip('Sin DNI', 'neutral')) +
      '</div>';

    $$('#citizenNav [data-panel-tab]').forEach((btn) => {
      const on = btn.getAttribute('data-panel-tab') === state.tab;
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-current', on ? 'page' : 'false');
    });
  }

  function statCard(label, value, sub, tone) {
    return '<div class="citizen-stat ' + (tone || '') + '">' +
      '<span>' + esc(label) + '</span>' +
      '<b>' + esc(String(value)) + '</b>' +
      '<small>' + esc(sub || '') + '</small>' +
    '</div>';
  }

  function banner(tone, title, text, action) {
    return '<div class="citizen-banner ' + (tone || 'warn') + '">' +
      '<span class="citizen-banner-dot"></span>' +
      '<div><b>' + esc(title) + '</b><p>' + esc(text) + '</p></div>' +
      (action || '') +
    '</div>';
  }

  function emptyState(title, text, extra) {
    return '<div class="citizen-empty">' +
      '<span class="citizen-empty-mark">RP</span>' +
      '<h3>' + esc(title) + '</h3>' +
      '<p>' + esc(text) + '</p>' +
      (extra || '') +
    '</div>';
  }

  function renderLoading() {
    return '<div class="citizen-skeleton" aria-label="Cargando panel">' +
      '<div class="citizen-skeleton-hero"></div>' +
      '<div class="citizen-skeleton-stats"><span></span><span></span><span></span><span></span></div>' +
      '<div class="citizen-skeleton-grid"><span></span><span></span></div>' +
    '</div>';
  }

  function renderError(message) {
    return '<article class="citizen-card citizen-error">' +
      '<span class="eyebrow">Panel de Ciudadano</span>' +
      '<h2>No pude cargar tus datos</h2>' +
      '<p>' + esc(message || 'Probá de nuevo en unos segundos.') + '</p>' +
      '<div class="citizen-actions">' +
        '<button class="btn btn-primary" type="button" data-action="refresh">Reintentar</button>' +
        '<button class="btn btn-ghost" type="button" data-action="logout">Cerrar sesión</button>' +
      '</div>' +
    '</article>';
  }

  function renderLinkOnboarding() {
    const user = currentUser();
    return '' +
      '<div class="citizen-section-head">' +
        '<div><span class="eyebrow">Primer paso</span><h2>Creá tu identidad</h2>' +
        '<p>Podés generar tu DNI desde la web o vincular uno que ya exista en el CAD.</p></div>' +
      '</div>' +
      '<div class="citizen-form-head citizen-onboard-account">' + avatarMarkup('citizen-form-avatar') +
        '<div><b>' + esc(user.displayName || user.username) + '</b><span>@' + esc(user.username) +
          (user.robloxUsername ? ' · Roblox @' + esc(user.robloxUsername) : '') +
          ' · Los Angeles, California</span></div>' +
      '</div>' +
      '<div class="citizen-grid-2 citizen-link-grid">' +
        '<article class="citizen-card citizen-create-card">' +
          '<span class="eyebrow">Nuevo ciudadano</span>' +
          '<h3>Crear mi DNI</h3>' +
          '<p class="citizen-fine">Completá los datos que figuran en tu identidad de California. La edad se calcula sola y el número de DNI se genera automáticamente con formato C#######.</p>' +
          '<form class="citizen-form" id="citizenCreateForm" novalidate>' +
            '<div class="citizen-name-grid">' +
              '<label>Nombre' +
                '<input name="firstName" autocomplete="given-name" placeholder="Ej: Juan" maxlength="40" required>' +
              '</label>' +
              '<label>Apellido' +
                '<input name="lastName" autocomplete="family-name" placeholder="Ej: Pérez" maxlength="40" required>' +
              '</label>' +
            '</div>' +
            '<label>Fecha de nacimiento' +
              '<input name="dob" type="date" autocomplete="bday" required>' +
            '</label>' +
            '<div class="citizen-age-line">Edad calculada <b id="citizenAge">—</b></div>' +
            '<div class="citizen-id-grid">' +
              '<label>Sexo' +
                '<select name="sex" required>' +
                  '<option value="">Elegí…</option>' +
                  '<option value="M">Masculino (M)</option>' +
                  '<option value="F">Femenino (F)</option>' +
                  '<option value="X">No binario (X)</option>' +
                '</select>' +
              '</label>' +
              '<label>Altura (cm)' +
                '<input name="heightCm" type="number" inputmode="numeric" min="120" max="230" placeholder="Ej: 175" required>' +
              '</label>' +
              '<label>Peso (kg)' +
                '<input name="weightKg" type="number" inputmode="decimal" min="30" max="250" step="0.1" placeholder="Ej: 70" required>' +
              '</label>' +
              '<label>Cabello' +
                '<input name="hair" placeholder="Ej: Castaño" maxlength="30" required>' +
              '</label>' +
              '<label>Ojos' +
                '<input name="eyes" placeholder="Ej: Marrones" maxlength="30" required>' +
              '</label>' +
            '</div>' +
            '<label>Dirección' +
              '<input name="address" autocomplete="street-address" placeholder="Ej: 1234 Mission Blvd" maxlength="120" required>' +
            '</label>' +
            '<div class="citizen-name-grid">' +
              '<label>Ciudad' +
                '<input name="city" autocomplete="address-level2" value="Los Angeles" maxlength="60" required>' +
              '</label>' +
              '<label>Código postal' +
                '<input name="zip" inputmode="numeric" autocomplete="postal-code" placeholder="90001" maxlength="5" required>' +
              '</label>' +
            '</div>' +
            '<p class="citizen-fine">El número de DNI es único y se asigna al crearlo. No lo escribas vos.</p>' +
            '<button class="btn btn-primary citizen-form-submit" type="submit">Crear mi DNI</button>' +
            '<div class="citizen-form-msg" id="citizenCreateMsg"></div>' +
          '</form>' +
        '</article>' +
        '<article class="citizen-card citizen-link-card">' +
          '<span class="eyebrow">Ya tengo DNI</span>' +
          '<h3>Vincular mi DNI</h3>' +
          '<p class="citizen-fine">Si el staff ya cargó tu personaje en el CAD, conectalo con tu cuenta.</p>' +
          '<form class="citizen-form" id="citizenLinkForm" novalidate>' +
            '<label>DNI del personaje' +
              '<input name="dni" inputmode="text" autocomplete="off" placeholder="Ej: C1234567 o CA-12345678" required>' +
            '</label>' +
            '<label>Nombre completo en el CAD' +
              '<input name="name" autocomplete="off" placeholder="Ej: Juan Pérez" required>' +
            '</label>' +
            '<button class="btn btn-primary citizen-form-submit" type="submit">Vincular mi DNI</button>' +
            '<div class="citizen-form-msg" id="citizenLinkMsg"></div>' +
          '</form>' +
        '</article>' +
      '</div>' +
      '<aside class="citizen-card citizen-help">' +
        '<span class="eyebrow">¿Cuál elijo?</span>' +
        '<h3>Tu identidad en la ciudad</h3>' +
        '<ol>' +
          '<li><b>Crear mi DNI:</b> si sos nuevo y todavía no tenés registro en el CAD.</li>' +
          '<li><b>Vincular mi DNI:</b> si el staff ya cargó tu personaje y tenés el número.</li>' +
          '<li>El nombre de la cuenta y el del personaje pueden ser distintos.</li>' +
        '</ol>' +
        '<p class="citizen-fine">Un DNI por cuenta. El DNI creado en la web queda asociado a tu cuenta.</p>' +
      '</aside>';
  }

  function renderWaiting() {
    const dni = (state.user && state.user.dni) || '';
    return '<article class="citizen-card citizen-empty citizen-waiting">' +
      '<span class="citizen-empty-mark">CAD</span>' +
      '<span class="eyebrow">Sincronización pendiente</span>' +
      '<h2>El CAD todavía no envió datos</h2>' +
      '<p>Tu DNI <b>' + esc(dni) + '</b> ya está vinculado, pero el bot todavía no recibió el espejo de registros.</p>' +
      '<p class="citizen-fine">Abrí la app del CAD y esperá unos segundos. Si el problema sigue, revisá el enlace con el bot en la app.</p>' +
      '<div class="citizen-actions">' +
        '<button class="btn btn-primary" type="button" data-action="refresh">Reintentar</button>' +
        '<button class="btn btn-ghost" type="button" data-action="go-tab" data-tab="ajustes">Gestionar vínculo</button>' +
      '</div>' +
    '</article>';
  }

  function renderMissing() {
    return '<article class="citizen-card citizen-empty citizen-error">' +
      '<span class="citizen-empty-mark">!</span>' +
      '<span class="eyebrow">Registro no encontrado</span>' +
      '<h2>Tu DNI ya no aparece en el CAD</h2>' +
      '<p>El staff pudo haber modificado o eliminado el registro. Podés desvincular el DNI y volver a intentarlo.</p>' +
      '<div class="citizen-actions">' +
        '<button class="btn btn-primary" type="button" data-action="relink">Desvincular y volver a intentar</button>' +
        '<button class="btn btn-ghost" type="button" data-action="refresh">Actualizar</button>' +
      '</div>' +
    '</article>';
  }

  function renderOverview(c) {
    const license = licenseTone(c.licStatus);
    const alerts = [];
    if (state.cadMissing) {
      alerts.push(banner('gold', 'DNI creado en la web',
        'Tu identidad ya está activa en el panel. El CAD todavía no la importó; cuando el staff la sincronice, tus multas y órdenes van a aparecer acá.'));
    }
    if (c.totals.warrants > 0) {
      alerts.push(banner('red', 'Tenés una orden activa',
        'Acercate a una unidad policial o hablá con el staff para resolverla.',
        '<button class="btn btn-ghost btn-sm" type="button" data-action="go-tab" data-tab="ordenes">Ver orden</button>'));
    }
    if (license === 'red' || license === 'gold') {
      const pending = licenseInfo(c).status === 'pending';
      alerts.push(banner(license, pending ? 'Licencia en revisión' : 'Licencia ' + c.licStatus,
        pending
          ? 'Un moderador está revisando tu solicitud en Discord. Te avisamos cuando responda.'
          : license === 'red'
            ? 'No manejes hasta regularizar tu situación. Podés volver a solicitar desde la pestaña Licencia.'
            : 'Evitá conducir hasta que se resuelva.',
        '<button class="btn btn-ghost btn-sm" type="button" data-action="go-tab" data-tab="licencia">Ver licencia</button>'));
    }

    const recentFines = c.fines.slice(0, 3);
    const recentVehicles = c.vehicles.slice(0, 2);

    return '' +
      '<div class="citizen-section-head">' +
        '<div><span class="eyebrow">Resumen</span><h2>Hola, ' + esc(firstName(c.name)) + '</h2>' +
        '<p>Este es el estado de tu personaje en el CAD de Los Angeles.</p></div>' +
        '<button class="citizen-icon-btn" type="button" data-action="refresh" title="Actualizar datos" aria-label="Actualizar datos">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>' +
        '</button>' +
      '</div>' +
      alerts.join('') +
      '<article class="citizen-identity">' +
        '<div class="citizen-identity-photo">' + avatarMarkup('citizen-identity-avatar') + '</div>' +
        '<div class="citizen-identity-info">' +
          chip('Ciudadano verificado', 'ok') +
          '<h3>' + esc(c.name) + '</h3>' +
          '<p>DNI <b class="citizen-mono">' + esc(c.dni) + '</b><span class="citizen-dot-sep">·</span><b>' + esc(ageText(c)) + '</b><span class="citizen-dot-sep">·</span>Licencia <b>' + esc(c.licStatus || 'Sin licencia') + '</b>' + (c.license ? ' · Nº ' + esc(c.license) : '') + '</p>' +
          '<div class="citizen-identity-meta">' +
            '<span>@' + esc(currentUser().username) + '</span>' +
            '<span>Miembro desde ' + dateFmt(currentUser().createdAt) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="citizen-identity-actions">' +
          '<button class="btn btn-primary btn-sm" type="button" data-action="go-tab" data-tab="dni">Ver mi DNI</button>' +
          '<button class="btn btn-ghost btn-sm" type="button" data-action="go-tab" data-tab="ajustes">Ajustes</button>' +
        '</div>' +
      '</article>' +
      '<div class="citizen-stats">' +
        statCard('DNI', c.dni, ageText(c) + ' · Identidad vinculada', 'accent') +
        statCard('Licencia', c.licStatus || 'Sin licencia', c.license ? 'Nº ' + c.license : (licenseInfo(c).status === 'pending' ? 'Solicitud en revisión' : 'Se solicita desde el panel'), license) +
        statCard('Multas', c.totals.fines, c.totals.fines ? money(c.totals.finesAmount) : 'Sin deudas', c.totals.fines ? 'gold' : 'ok') +
        statCard('Órdenes activas', c.totals.warrants, c.totals.warrants ? 'Requiere atención' : 'Todo en orden', c.totals.warrants ? 'red' : 'ok') +
        statCard('Vehículos', c.totals.vehicles, c.totals.vehicles ? 'A tu nombre' : 'Sin vehículos', 'neutral') +
      '</div>' +
      '<div class="citizen-grid-2">' +
        '<article class="citizen-card">' +
          '<div class="citizen-card-head"><div><span class="eyebrow">Multas</span><h3>Últimos movimientos</h3></div>' +
          '<button class="citizen-text-btn" type="button" data-action="go-tab" data-tab="multas">Ver todas</button></div>' +
          (recentFines.length ? '<div class="citizen-mini-list">' + recentFines.map((f) =>
            '<div class="citizen-mini-row">' +
              '<span class="citizen-mini-ico">$</span>' +
              '<div><b>' + esc(f.reason || 'Multa') + '</b><small>' + dateFmt(f.ts) + ' · ' + esc(f.officer || 'Oficial') + '</small></div>' +
              '<span class="citizen-mini-amount">' + money(f.amount) + '</span>' +
            '</div>').join('') + '</div>'
            : emptyState('Sin multas', 'No tenés multas registradas en el CAD.')) +
        '</article>' +
        '<article class="citizen-card">' +
          '<div class="citizen-card-head"><div><span class="eyebrow">Vehículos</span><h3>Tu garage</h3></div>' +
          '<button class="citizen-text-btn" type="button" data-action="go-tab" data-tab="vehiculos">Ver todos</button></div>' +
          (recentVehicles.length ? '<div class="citizen-mini-list">' + recentVehicles.map((v) =>
            '<div class="citizen-mini-row">' +
              '<span class="citizen-mini-ico">' + esc(v.plate ? v.plate.slice(0, 3) : 'CAR') + '</span>' +
              '<div><b>' + esc(v.model || 'Vehículo') + '</b><small>' + esc(v.plate) + (v.color ? ' · ' + esc(v.color) : '') + '</small></div>' +
              chip(v.status, recordTone(v.status)) +
            '</div>').join('') + '</div>'
            : emptyState('Sin vehículos', 'No tenés vehículos a tu nombre en el CAD.')) +
        '</article>' +
      '</div>' +
      '<article class="citizen-cta">' +
        '<div><span class="eyebrow">Central 911</span><h3>¿Necesitás ayuda en la ciudad?</h3>' +
        '<p>Llamá a la central y un operador despachará una unidad.</p></div>' +
        '<a class="btn btn-primary" id="citizenCta911" href="#" target="_blank" rel="noopener">Llamar al 911</a>' +
      '</article>';
  }

  function renderDni(c) {
    const address = [c.address, c.city, [c.state, c.zip].filter(Boolean).join(' ')]
      .filter(Boolean).join(', ') || '—';
    const height = c.heightCm ? heightImperial(c.heightCm) + ' (' + c.heightCm + ' cm)' : '—';
    const weight = c.weightKg ? weightPounds(c.weightKg) + ' (' + c.weightKg + ' kg)' : '—';
    return '' +
      '<div class="citizen-section-head">' +
        '<div><span class="eyebrow">Documento</span><h2>Mi DNI</h2>' +
        '<p>Tu identidad de California dentro de La Realidad RP.</p></div>' +
        '<button class="btn btn-ghost btn-sm citizen-print-btn" type="button" data-action="print">Imprimir / PDF</button>' +
      '</div>' +
      '<article class="cid-card ca-id">' +
        '<div class="ca-id-top">' +
          '<div class="ca-id-state"><span>CALIFORNIA</span><small>IDENTITY CARD</small></div>' +
          '<div class="ca-id-seal"><span>★</span><small>REAL ID</small></div>' +
        '</div>' +
        '<div class="ca-id-main">' +
          '<div class="ca-id-fields">' +
            '<div class="ca-id-name"><small>NAME / NOMBRE</small><b>' + esc(c.name) + '</b></div>' +
            '<div class="ca-id-grid">' +
              '<div><small>DNI</small><b class="citizen-mono">' + esc(c.dni) + '</b></div>' +
              '<div><small>DOB</small><b>' + esc(usDate(c.dob)) + '</b></div>' +
              '<div><small>SEX</small><b>' + esc(sexText(c.sex)) + '</b></div>' +
              '<div><small>HAIR</small><b>' + esc(c.hair || '—') + '</b></div>' +
              '<div><small>EYES</small><b>' + esc(c.eyes || '—') + '</b></div>' +
              '<div><small>HT</small><b>' + esc(heightImperial(c.heightCm)) + '</b></div>' +
              '<div><small>WT</small><b>' + esc(weightPounds(c.weightKg)) + '</b></div>' +
              '<div><small>ISS</small><b>' + esc(usDate(c.issueDate)) + '</b></div>' +
              '<div><small>EXP</small><b>' + esc(usDate(c.expires)) + '</b></div>' +
            '</div>' +
            '<div class="ca-id-address"><small>ADDRESS / DIRECCIÓN</small><b>' + esc(address) + '</b></div>' +
          '</div>' +
          '<div class="ca-id-photo">' + avatarMarkup('ca-id-avatar') +
            '<span class="ca-id-photo-label">LOS ANGELES<br>CALIFORNIA</span>' +
          '</div>' +
        '</div>' +
        '<div class="ca-id-bottom">' +
          '<div class="ca-id-sign"><small>FIRMA</small><b>' + esc(c.name) + '</b></div>' +
          '<div class="ca-id-number"><small>DNI</small><b class="citizen-mono">' + esc(c.dni) + '</b></div>' +
        '</div>' +
      '</article>' +
      '<div class="citizen-grid-2">' +
        '<article class="citizen-card">' +
          '<div class="citizen-card-head"><div><span class="eyebrow">Documento</span><h3>Datos del DNI</h3></div></div>' +
          '<div class="citizen-rows">' +
            '<div><span>DNI</span><b class="citizen-mono">' + esc(c.dni) + '</b></div>' +
            '<div><span>Nombre</span><b>' + esc(c.name) + '</b></div>' +
            '<div><span>Nacimiento</span><b>' + esc(dobFmt(c.dob)) + ' · ' + esc(ageText(c)) + '</b></div>' +
            '<div><span>Sexo</span><b>' + esc(sexText(c.sex)) + '</b></div>' +
            '<div><span>Cabello / Ojos</span><b>' + esc((c.hair || '—') + ' / ' + (c.eyes || '—')) + '</b></div>' +
            '<div><span>Altura / Peso</span><b>' + esc(height + ' / ' + weight) + '</b></div>' +
            '<div><span>Dirección</span><b>' + esc(address) + '</b></div>' +
            '<div><span>Emisión / Vence</span><b>' + esc(usDate(c.issueDate) + ' / ' + usDate(c.expires)) + '</b></div>' +
            '<div><span>Roblox</span><b>' + esc(c.robloxUsername || (currentUser() && currentUser().robloxUsername) || '—') + '</b></div>' +
          '</div>' +
        '</article>' +
        '<article class="citizen-card">' +
          '<div class="citizen-card-head"><div><span class="eyebrow">Notas</span><h3>Antecedentes</h3></div></div>' +
          '<p class="citizen-notes">' + esc(c.notes || 'Sin notas ni antecedentes registrados.') + '</p>' +
          '<p class="citizen-fine">Los antecedentes y las multas salen del CAD. Los datos físicos se cargaron al crear el DNI; si algo está mal, hablá con el staff.</p>' +
        '</article>' +
      '</div>' +
      '<p class="citizen-fine citizen-print-note">Documento de roleplay. No es un documento de identidad real.</p>';
  }

  function renderLicenseApplicationForm() {
    return '<article class="citizen-card citizen-license-form">' +
      '<div class="citizen-card-head"><div><span class="eyebrow">Cuestionario</span><h3>Solicitar licencia</h3></div></div>' +
      '<p class="citizen-fine">Contestá estas preguntas. La solicitud se envía a un canal privado de moderadores en Discord; el panel no emite la licencia automáticamente.</p>' +
      '<form class="citizen-form" id="licenseApplyForm" novalidate>' +
        '<div class="citizen-id-grid">' +
          '<label>Experiencia manejando' +
            '<select name="experience" required>' +
              '<option value="">Elegí…</option>' +
              '<option value="Ninguna">Ninguna</option>' +
              '<option value="Poca">Poca</option>' +
              '<option value="Intermedia">Intermedia</option>' +
              '<option value="Mucha">Mucha</option>' +
            '</select>' +
          '</label>' +
          '<label>Vehículo que querés manejar' +
            '<select name="vehicleType" required>' +
              '<option value="">Elegí…</option>' +
              '<option value="Auto">Auto</option>' +
              '<option value="Moto">Moto</option>' +
              '<option value="Camión">Camión</option>' +
              '<option value="Todos">Todos</option>' +
            '</select>' +
          '</label>' +
        '</div>' +
        '<label>¿Conocés las normas de tránsito?' +
          '<select name="trafficRules" required>' +
            '<option value="">Elegí…</option>' +
            '<option value="Sí">Sí</option>' +
            '<option value="No">No</option>' +
          '</select>' +
        '</label>' +
        '<label>¿Por qué querés la licencia?' +
          '<textarea name="reason" rows="4" maxlength="800" placeholder="Contanos qué vas a hacer con la licencia, qué experiencia tenés y por qué deberían aprobártela." required></textarea>' +
        '</label>' +
        '<label class="citizen-check"><input type="checkbox" name="confirm" required> Confirmo que mis datos son correctos y que esta licencia es de roleplay.</label>' +
        '<div class="citizen-form-actions">' +
          '<button class="btn btn-primary" type="submit">Enviar solicitud a mods</button>' +
          '<button class="btn btn-ghost" type="button" data-action="license-cancel">Cancelar</button>' +
        '</div>' +
        '<div class="citizen-form-msg" id="licenseApplyMsg"></div>' +
      '</form>' +
    '</article>';
  }

  function renderLicense(c) {
    const info = licenseInfo(c);
    const tone = licenseTone(info.label);
    const approved = info.status === 'approved';
    const pending = info.status === 'pending';
    const rejected = info.status === 'rejected';
    const canApply = !approved && !pending;
    const app = info.application || {};

    const statusCard = '<article class="citizen-license ' + tone + '">' +
      '<div class="citizen-license-mark">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><circle cx="8.5" cy="11" r="2.2"/><path d="M5.5 16c.6-1.6 1.7-2.3 3-2.3s2.4.7 3 2.3M14 10h4M14 13h4M14 16h2.5"/></svg>' +
      '</div>' +
      '<div class="citizen-license-info">' +
        '<span class="eyebrow">Estado actual</span>' +
        '<h2>' + esc(info.label) + '</h2>' +
        (approved
          ? '<p>Nº <b class="citizen-mono">' + esc(info.number || '—') + '</b> · Vence ' + dateFmt(info.expiresAt) + '</p>'
          : pending
            ? '<p>Solicitud enviada ' + dateFmt(info.submittedAt) + '. Los moderadores la revisan en Discord.</p>'
            : rejected
              ? '<p>Motivo: ' + esc(info.rejectionReason || 'Solicitud rechazada por el staff.') + '</p>'
              : '<p>Todavía no tenés una licencia. Podés solicitarla desde acá.</p>') +
      '</div>' +
      chip(approved ? 'Habilitada' : pending ? 'En revisión' : rejected ? 'Rechazada' : 'Sin solicitud', tone) +
    '</article>';

    let action = '';
    if (canApply && !state.licenseFormOpen) {
      action = '<div class="citizen-actions">' +
        '<button class="btn btn-primary" type="button" data-action="license-start">' +
          (rejected ? 'Volver a solicitar' : 'Sacar licencia') +
        '</button>' +
      '</div>';
    } else if (pending) {
      action = '<div class="citizen-actions"><button class="btn btn-ghost" type="button" data-action="refresh">Actualizar estado</button></div>';
    }

    let extra = '';
    if (approved) {
      extra = '<div class="citizen-grid-2">' +
        '<article class="citizen-card">' +
          '<div class="citizen-card-head"><div><span class="eyebrow">Licencia</span><h3>Datos de la licencia</h3></div></div>' +
          '<div class="citizen-rows">' +
            '<div><span>Titular</span><b>' + esc(c.name) + '</b></div>' +
            '<div><span>DNI</span><b class="citizen-mono">' + esc(c.dni) + '</b></div>' +
            '<div><span>Número</span><b class="citizen-mono">' + esc(info.number || '—') + '</b></div>' +
            '<div><span>Emitida</span><b>' + dateFmt(info.issuedAt || info.reviewedAt) + '</b></div>' +
            '<div><span>Vence</span><b>' + dateFmt(info.expiresAt) + '</b></div>' +
            '<div><span>Revisada por</span><b>' + esc(info.reviewedBy || '—') + '</b></div>' +
            '<div><span>Estado</span>' + chip(info.label, tone) + '</div>' +
          '</div>' +
        '</article>' +
        '<article class="citizen-card">' +
          '<div class="citizen-card-head"><div><span class="eyebrow">Solicitud</span><h3>Tu cuestionario</h3></div></div>' +
          '<div class="citizen-rows">' +
            '<div><span>Experiencia</span><b>' + esc(app.experience || '—') + '</b></div>' +
            '<div><span>Vehículo</span><b>' + esc(app.vehicleType || '—') + '</b></div>' +
            '<div><span>Normas</span><b>' + esc(app.trafficRules || '—') + '</b></div>' +
            '<div><span>Motivo</span><b>' + esc(app.reason || '—') + '</b></div>' +
          '</div>' +
        '</article>' +
      '</div>';
    } else if (pending || rejected) {
      extra = '<div class="citizen-grid-2">' +
        '<article class="citizen-card">' +
          '<div class="citizen-card-head"><div><span class="eyebrow">Solicitud</span><h3>Lo que enviaste</h3></div></div>' +
          '<div class="citizen-rows">' +
            '<div><span>Experiencia</span><b>' + esc(app.experience || '—') + '</b></div>' +
            '<div><span>Vehículo</span><b>' + esc(app.vehicleType || '—') + '</b></div>' +
            '<div><span>Normas</span><b>' + esc(app.trafficRules || '—') + '</b></div>' +
            '<div><span>Enviada</span><b>' + dateFmt(info.submittedAt) + '</b></div>' +
            '<div><span>Motivo</span><b>' + esc(app.reason || '—') + '</b></div>' +
          '</div>' +
        '</article>' +
        '<article class="citizen-card">' +
          '<div class="citizen-card-head"><div><span class="eyebrow">Mods</span><h3>Qué pasa ahora</h3></div></div>' +
          (rejected
            ? '<p class="citizen-notes">La solicitud fue rechazada. Podés corregir lo que haga falta y volver a enviarla cuando quieras.</p>'
            : '<p class="citizen-notes">Un moderador revisa tu solicitud en el canal privado de Discord. Si la aprueba, el número de licencia aparece acá automáticamente.</p>') +
          '<p class="citizen-fine">La licencia se emite desde el panel; el CAD ya no administra licencias.</p>' +
        '</article>' +
      '</div>';
    }

    return '' +
      '<div class="citizen-section-head">' +
        '<div><span class="eyebrow">Licencia</span><h2>Licencia de conducir</h2>' +
        '<p>Solicitud y emisión gestionadas desde el panel, con revisión de moderadores en Discord.</p></div>' +
      '</div>' +
      statusCard +
      action +
      (state.licenseFormOpen && canApply ? renderLicenseApplicationForm() : '') +
      extra;
  }

  function renderVehicles(c) {
    if (!c.vehicles.length) {
      return '<div class="citizen-section-head"><div><span class="eyebrow">Vehículos</span><h2>Tu garage</h2>' +
        '<p>No tenés vehículos a tu nombre en el CAD.</p></div></div>' +
        emptyState('Sin vehículos', 'Cuando registres un vehículo con el staff, va a aparecer acá.');
    }
    return '' +
      '<div class="citizen-section-head">' +
        '<div><span class="eyebrow">Vehículos</span><h2>Tu garage</h2>' +
        '<p>' + c.vehicles.length + ' vehículo' + (c.vehicles.length === 1 ? '' : 's') + ' registrado' + (c.vehicles.length === 1 ? '' : 's') + ' a tu nombre.</p></div>' +
      '</div>' +
      '<div class="citizen-vehicles">' +
        c.vehicles.map((v) => {
          const tone = recordTone(v.status);
          return '<article class="citizen-vehicle ' + tone + '">' +
            '<div class="citizen-vehicle-top">' +
              '<span class="citizen-vehicle-plate">' + esc(v.plate || 'SIN PLACA') + '</span>' +
              chip(v.status, tone) +
            '</div>' +
            '<h3>' + esc(v.model || 'Vehículo sin modelo') + '</h3>' +
            '<div class="citizen-vehicle-meta">' +
              (v.color ? '<span>Color: <b>' + esc(v.color) + '</b></span>' : '') +
              '<span>ID: <b class="citizen-mono">' + esc(v.id || '—') + '</b></span>' +
            '</div>' +
            (v.notes ? '<p class="citizen-fine">' + esc(v.notes) + '</p>' : '') +
          '</article>';
        }).join('') +
      '</div>' +
      '<p class="citizen-fine">Si un vehículo figura como robado y ya lo recuperaste, avisale a una unidad policial.</p>';
  }

  function renderFines(c) {
    const pending = c.fines.filter((f) => norm(f.status) !== 'pagada');
    const total = pending.reduce((sum, f) => sum + f.amount, 0);
    return '' +
      '<div class="citizen-section-head">' +
        '<div><span class="eyebrow">Multas</span><h2>Tus multas</h2>' +
        '<p>' + (pending.length ? 'Tenés ' + pending.length + ' multa' + (pending.length === 1 ? '' : 's') + ' pendiente' + (pending.length === 1 ? '' : 's') + '.' : 'No tenés multas pendientes.') + '</p></div>' +
        '<div class="citizen-total"><small>Total pendiente</small><b>' + money(total) + '</b></div>' +
      '</div>' +
      (c.fines.length ? '<div class="citizen-items">' + c.fines.map((f) => {
        const tone = norm(f.status) === 'pagada' ? 'ok' : 'gold';
        return '<article class="citizen-item ' + tone + '">' +
          '<span class="citizen-item-ico">$</span>' +
          '<div class="citizen-item-main">' +
            '<div class="citizen-item-head"><b>' + esc(f.reason || 'Multa') + '</b>' + chip(f.status, tone) + '</div>' +
            '<small>' + dateFmt(f.ts) + ' · ' + esc(f.officer || 'Oficial') + '</small>' +
          '</div>' +
          '<b class="citizen-item-amount">' + money(f.amount) + '</b>' +
        '</article>';
      }).join('') + '</div>'
        : emptyState('Sin multas', 'No tenés multas registradas en el CAD.')) +
      '<p class="citizen-fine">Las multas se abonan en el juego con un oficial. El panel no procesa pagos.</p>';
  }

  function renderWarrants(c) {
    const active = c.warrants.filter((w) => norm(w.status) === 'activa');
    const history = c.warrants.filter((w) => norm(w.status) !== 'activa');
    return '' +
      '<div class="citizen-section-head">' +
        '<div><span class="eyebrow">Órdenes</span><h2>Órdenes judiciales</h2>' +
        '<p>' + (active.length ? 'Tenés ' + active.length + ' orden' + (active.length === 1 ? '' : 'es') + ' activa' + (active.length === 1 ? '' : 's') + '.' : 'No tenés órdenes activas.') + '</p></div>' +
      '</div>' +
      (active.length ? banner('red', 'Atención', 'Una orden activa puede terminar en arresto. Hablá con el staff si creés que es un error.') : '') +
      (active.length ? '<div class="citizen-items">' + active.map((w) =>
        '<article class="citizen-item red">' +
          '<span class="citizen-item-ico">!</span>' +
          '<div class="citizen-item-main">' +
            '<div class="citizen-item-head"><b>' + esc(w.wkind || 'Orden') + ' · ' + esc(w.reason || 'Sin motivo') + '</b>' + chip('Activa', 'red') + '</div>' +
            '<small>' + dateFmt(w.ts) + ' · ' + esc(w.officer || 'Oficial') + '</small>' +
          '</div>' +
        '</article>').join('') + '</div>'
        : emptyState('Todo en orden', 'No tenés órdenes activas en el CAD.')) +
      (history.length ? '<article class="citizen-card"><div class="citizen-card-head"><div><span class="eyebrow">Historial</span><h3>Órdenes anteriores</h3></div></div>' +
        '<div class="citizen-mini-list">' + history.map((w) =>
          '<div class="citizen-mini-row">' +
            '<span class="citizen-mini-ico">' + esc((w.wkind || 'O').slice(0, 1)) + '</span>' +
            '<div><b>' + esc(w.wkind || 'Orden') + ' · ' + esc(w.reason || '') + '</b><small>' + dateFmt(w.ts) + ' · ' + esc(w.officer || 'Oficial') + '</small></div>' +
            chip(w.status, recordTone(w.status)) +
          '</div>').join('') + '</div></article>' : '') +
      '<p class="citizen-fine">Si tenés una orden activa, acercate a una unidad policial o abrí un ticket en el Discord.</p>';
  }

  function renderSettings(c) {
    const user = currentUser();
    const dni = (c && c.dni) || user.dni || '';
    return '' +
      '<div class="citizen-section-head">' +
        '<div><span class="eyebrow">Ajustes</span><h2>Tu cuenta</h2>' +
        '<p>Datos de la cuenta de Discord y del vínculo con el CAD.</p></div>' +
      '</div>' +
      '<div class="citizen-grid-2">' +
        '<article class="citizen-card">' +
          '<div class="citizen-card-head"><div><span class="eyebrow">Discord</span><h3>Cuenta conectada</h3></div></div>' +
          '<div class="citizen-rows">' +
            '<div><span>Usuario</span><b>@' + esc(user.username) + '</b></div>' +
            '<div><span>Nombre</span><b>' + esc(user.displayName || user.username) + '</b></div>' +
            '<div><span>Roblox</span><b>' + esc(user.robloxUsername ? '@' + user.robloxUsername : 'Sin vincular') + '</b></div>' +
            '<div><span>Rol</span>' + chip(user.role || 'Ciudadano', 'role') + '</div>' +
            '<div><span>Miembro desde</span><b>' + dateFmt(user.createdAt) + '</b></div>' +
          '</div>' +
        '</article>' +
        '<article class="citizen-card">' +
          '<div class="citizen-card-head"><div><span class="eyebrow">CAD</span><h3>Vínculo de identidad</h3></div></div>' +
          '<div class="citizen-rows">' +
            '<div><span>DNI</span><b class="citizen-mono">' + esc(dni || 'Sin vincular') + '</b></div>' +
            '<div><span>Personaje</span><b>' + esc((c && c.name) || user.citizenName || '—') + '</b></div>' +
            '<div><span>Licencia</span>' + chip((c && c.licStatus) || 'Sin licencia', licenseTone(c && c.licStatus)) + '</div>' +
            '<div><span>Última sync</span><b>' + (state.cadUpdatedAt ? relative(state.cadUpdatedAt) : 'Sin datos') + '</b></div>' +
          '</div>' +
        '</article>' +
      '</div>' +
      (state.canUnlink
        ? '<article class="citizen-card citizen-danger-zone">' +
            '<div><b>Desvincular DNI</b><p>El DNI se quita de tu cuenta. Los datos del CAD no se borran.</p></div>' +
            (state.unlinkConfirm
              ? '<div class="citizen-confirm-actions">' +
                  '<button class="btn citizen-red-btn" type="button" data-action="unlink-confirm">Sí, desvincular</button>' +
                  '<button class="btn btn-ghost" type="button" data-action="unlink-cancel">Cancelar</button>' +
                '</div>'
              : '<button class="btn btn-ghost citizen-red-btn" type="button" data-action="unlink">Desvincular DNI</button>') +
          '</article>'
        : '<article class="citizen-card citizen-note">' +
            '<b>DNI creado en el panel</b>' +
            '<p>Este DNI queda asociado a tu cuenta. Si necesitás cambiarlo, hablá con el staff.</p>' +
          '</article>') +
      '<article class="citizen-card citizen-note">' +
        '<b>Privacidad</b>' +
        '<p>Tu cuenta solo muestra el DNI que vinculaste. No se puede consultar el DNI de otra persona desde el panel.</p>' +
      '</article>';
  }

  function renderContent() {
    const el = $('#citizenContent');
    if (!el) return;
    if (!state.user) return;

    if (state.loading && !state.loaded && !state.citizen) {
      el.innerHTML = renderLoading();
      return;
    }

    if (state.error && !state.citizen && !state.linked) {
      el.innerHTML = renderError(state.error);
      return;
    }

    if (!state.linked) {
      el.innerHTML = renderLinkOnboarding();
      return;
    }

    if (state.waiting) {
      el.innerHTML = renderWaiting();
      return;
    }

    if (state.missing) {
      el.innerHTML = renderMissing();
      return;
    }

    if (!state.citizen) {
      el.innerHTML = renderError(state.error || 'No pude leer tu registro del CAD. Probá de nuevo.');
      return;
    }

    const stale = state.error
      ? banner('gold', 'Mostrando los últimos datos', 'No se pudo actualizar: ' + state.error)
      : '';

    let body = '';
    if (state.tab === 'resumen') body = renderOverview(state.citizen);
    else if (state.tab === 'dni') body = renderDni(state.citizen);
    else if (state.tab === 'licencia') body = renderLicense(state.citizen);
    else if (state.tab === 'vehiculos') body = renderVehicles(state.citizen);
    else if (state.tab === 'multas') body = renderFines(state.citizen);
    else if (state.tab === 'ordenes') body = renderWarrants(state.citizen);
    else body = renderSettings(state.citizen);

    el.innerHTML = stale + body;
    wireCta911();
  }

  function wireCta911() {
    const link = $('#citizenCta911');
    if (!link) return;
    const url = CFG.central911 || '';
    if (url) link.setAttribute('href', url);
    else link.style.display = 'none';
  }

  function render() {
    renderSidebar();
    renderLive();
    renderContent();
  }

  function setTab(tab) {
    if (!TABS.includes(tab)) tab = 'resumen';
    state.tab = tab;
    if (state.unlinkConfirm && tab !== 'ajustes') state.unlinkConfirm = false;
    try { history.replaceState(null, '', '#' + tab); } catch { /* file:// */ }
    renderSidebar();
    renderContent();
    if (window.innerWidth < 981) {
      const content = $('#citizenContent');
      if (content) content.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function adoptUser(user) {
    if (!user) return;
    state.user = user;
    const app = LR();
    if (!app) return;
    app.Auth.user = user;
    try { app.Auth.save(); } catch { /* modo privado */ }
    app.updateAuthUI();
  }

  async function loadCitizen({ silent = false } = {}) {
    const app = LR();
    if (!app || !state.user || state.requestInFlight) return;
    state.requestInFlight = true;
    if (!silent) {
      state.loading = true;
      state.error = '';
      render();
    }
    try {
      const d = await app.Auth.api('/citizen/me');
      if (d && d.user) adoptUser(d.user);
      state.linked = !!(d && d.linked);
      state.waiting = !!(d && d.waiting);
      state.missing = !!(d && d.missing);
      state.cadMissing = !!(d && d.cadMissing);
      state.canUnlink = !d || d.canUnlink !== false;
      state.source = (d && d.source) || '';
      state.citizen = (d && d.citizen) || null;
      state.cadUpdatedAt = Number(d && d.cadUpdatedAt) || 0;
      state.serverNow = Number(d && d.serverNow) || Date.now();
      state.loaded = true;
      state.loading = false;
      state.error = '';
      render();
    } catch (err) {
      state.loading = false;
      if (err.status === 401) {
        app.Auth.clear();
        showGate();
        app.toast('Tu sesión venció. Volvé a ingresar.');
        return;
      }
      state.error = err.message || 'No pude consultar el panel.';
      render();
      if (silent) app.toast('No se pudo actualizar: ' + state.error);
    } finally {
      state.requestInFlight = false;
    }
  }

  function startTutorial(citizen) {
    if (!citizen) return;
    const steps = [
      {
        icon: '🪪',
        title: 'Tu DNI ya existe',
        text: 'Este es tu documento de California. Tu número es ' + citizen.dni + ' y se genera automáticamente con formato C#######. Guardalo: lo vas a usar para trámites y para que el staff te busque en el CAD.',
      },
      {
        icon: '🚗',
        title: 'Tu licencia',
        text: 'Entrá a la pestaña Licencia y tocá “Sacar licencia”. Completás un cuestionario en la misma página y la solicitud llega a un canal privado de moderadores en Discord. Cuando la aprueben, el número aparece acá.',
      },
      {
        icon: '🚨',
        title: 'Multas y órdenes',
        text: 'Si la policía te pone una multa o emite una orden, la vas a ver en las pestañas Multas y Órdenes. El panel es solo de consulta para esos registros.',
      },
      {
        icon: '🛡️',
        title: 'Tu cuenta',
        text: 'Tu usuario de Roblox queda asociado a la cuenta y al DNI. No compartas tu contraseña; el staff nunca te la va a pedir por Discord.',
      },
      {
        icon: '✅',
        title: 'Todo listo',
        text: 'Usá el menú de la izquierda para entrar a Mi DNI, Licencia, Vehículos, Multas y Órdenes. Podés volver al resumen cuando quieras.',
      },
    ];
    let index = 0;

    const overlay = document.createElement('div');
    overlay.className = 'citizen-tutorial';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Tutorial del Panel de Ciudadano');
    document.body.appendChild(overlay);
    document.body.classList.add('tutorial-open');

    function close() {
      overlay.remove();
      document.body.classList.remove('tutorial-open');
    }

    function draw() {
      const step = steps[index];
      const last = index === steps.length - 1;
      overlay.innerHTML = '' +
        '<div class="citizen-tutorial-box">' +
          '<div class="citizen-tutorial-top">' +
            '<span class="citizen-tutorial-step">Paso ' + (index + 1) + ' de ' + steps.length + '</span>' +
            '<button class="citizen-tutorial-skip" type="button" data-tutorial-action="skip">Saltar tutorial</button>' +
          '</div>' +
          '<div class="citizen-tutorial-icon">' + step.icon + '</div>' +
          '<h2>' + esc(step.title) + '</h2>' +
          '<p>' + esc(step.text) + '</p>' +
          '<div class="citizen-tutorial-dots">' +
            steps.map((_, i) => '<i class="' + (i === index ? 'on' : '') + '"></i>').join('') +
          '</div>' +
          '<div class="citizen-tutorial-actions">' +
            (index > 0 ? '<button class="btn btn-ghost" type="button" data-tutorial-action="back">Atrás</button>' : '<span></span>') +
            '<button class="btn btn-primary" type="button" data-tutorial-action="next">' + (last ? 'Empezar' : 'Siguiente') + '</button>' +
          '</div>' +
        '</div>';
    }

    overlay.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tutorial-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-tutorial-action');
      if (action === 'skip') { close(); return; }
      if (action === 'back') { index = Math.max(0, index - 1); draw(); return; }
      if (action === 'next') {
        if (index >= steps.length - 1) { close(); return; }
        index++;
        draw();
      }
    });

    draw();
  }

  async function handleCreateSubmit(e) {
    e.preventDefault();
    const form = e.target;
    if (!form || form.id !== 'citizenCreateForm') return;
    const app = LR();
    if (!app) return;
    const firstName = String(form.firstName.value || '').trim();
    const lastName = String(form.lastName.value || '').trim();
    const dob = String(form.dob.value || '').trim();
    const sex = String(form.sex.value || '').trim();
    const hair = String(form.hair.value || '').trim();
    const eyes = String(form.eyes.value || '').trim();
    const heightCm = Number(form.heightCm.value);
    const weightKg = Number(form.weightKg.value);
    const address = String(form.address.value || '').trim();
    const city = String(form.city.value || '').trim();
    const zip = String(form.zip.value || '').replace(/\D/g, '');
    const msg = $('#citizenCreateMsg');
    const btn = form.querySelector('button[type="submit"]');
    const age = ageFromDob(dob);

    const fail = (text) => {
      if (msg) { msg.textContent = text; msg.className = 'citizen-form-msg error'; }
    };

    if (!firstName || !lastName) return fail('Completá tu nombre y apellido.');
    if (!dob || age === null) return fail('Elegí una fecha de nacimiento válida.');
    if (age > 120) return fail('Revisá la fecha de nacimiento.');
    if (!['M', 'F', 'X'].includes(sex)) return fail('Elegí tu sexo como figura en el DNI.');
    if (hair.length < 2) return fail('Escribí el color de tu cabello.');
    if (eyes.length < 2) return fail('Escribí el color de tus ojos.');
    if (!Number.isInteger(heightCm) || heightCm < 120 || heightCm > 230) return fail('La altura debe estar entre 120 y 230 cm.');
    if (!Number.isFinite(weightKg) || weightKg < 30 || weightKg > 250) return fail('El peso debe estar entre 30 y 250 kg.');
    if (address.length < 5) return fail('Escribí tu dirección (calle y número).');
    if (city.length < 2) return fail('Escribí tu ciudad.');
    if (!/^\d{5}$/.test(zip)) return fail('El código postal debe tener 5 números (ej: 90001).');

    if (btn) { btn.disabled = true; btn.textContent = 'Creando DNI…'; }
    if (msg) { msg.textContent = 'Generando tu identidad de Los Angeles…'; msg.className = 'citizen-form-msg'; }

    try {
      const d = await app.Auth.api('/citizen/create', {
        method: 'POST',
        json: { firstName, lastName, dob, sex, hair, eyes, heightCm, weightKg, address, city, zip },
      });
      if (d && d.user) adoptUser(d.user);
      state.linked = true;
      state.waiting = false;
      state.missing = false;
      state.cadMissing = !!d.cadMissing;
      state.canUnlink = d.canUnlink !== false;
      state.source = d.source || 'web';
      state.citizen = d.citizen || null;
      state.cadUpdatedAt = Number(d.cadUpdatedAt) || 0;
      state.serverNow = Number(d.serverNow) || Date.now();
      state.loaded = true;
      state.loading = false;
      state.error = '';
      state.licenseFormOpen = false;
      state.tab = 'resumen';
      render();
      app.toast('✅ DNI creado con formato C#######. Tu identidad ya está lista.');
      startTutorial(state.citizen);
    } catch (err) {
      if (err.status === 401) {
        app.Auth.clear();
        showGate();
        return;
      }
      if (msg) { msg.textContent = '❌ ' + (err.message || 'No se pudo crear el DNI.'); msg.className = 'citizen-form-msg error'; }
      if (btn) { btn.disabled = false; btn.textContent = 'Crear mi DNI'; }
    }
  }

  async function handleLinkSubmit(e) {
    e.preventDefault();
    const form = e.target;
    if (!form || form.id !== 'citizenLinkForm') return;
    const app = LR();
    if (!app) return;
    const dni = String(form.dni.value || '').trim();
    const name = String(form.name.value || '').trim();
    const msg = $('#citizenLinkMsg');
    const btn = form.querySelector('button[type="submit"]');

    if (!dni || !name) {
      if (msg) { msg.textContent = 'Completá el DNI y el nombre completo.'; msg.className = 'citizen-form-msg error'; }
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Vinculando…'; }
    if (msg) { msg.textContent = 'Buscando tu DNI en el CAD…'; msg.className = 'citizen-form-msg'; }

    try {
      const d = await app.Auth.api('/citizen/link', { method: 'POST', json: { dni, name } });
      if (d && d.user) adoptUser(d.user);
      state.linked = true;
      state.waiting = false;
      state.missing = false;
      state.cadMissing = false;
      state.canUnlink = d.canUnlink !== false;
      state.source = d.source || 'cad';
      state.citizen = d.citizen || null;
      state.cadUpdatedAt = Number(d.cadUpdatedAt) || 0;
      state.serverNow = Number(d.serverNow) || Date.now();
      state.loaded = true;
      state.loading = false;
      state.error = '';
      state.licenseFormOpen = false;
      state.tab = 'resumen';
      render();
      app.toast('✅ DNI vinculado. ¡Bienvenido a tu panel!');
    } catch (err) {
      if (err.status === 401) {
        app.Auth.clear();
        showGate();
        return;
      }
      if (msg) { msg.textContent = '❌ ' + (err.message || 'No se pudo vincular el DNI.'); msg.className = 'citizen-form-msg error'; }
      if (btn) { btn.disabled = false; btn.textContent = 'Vincular mi DNI'; }
    }
  }

  async function handleLicenseSubmit(e) {
    e.preventDefault();
    const form = e.target;
    if (!form || form.id !== 'licenseApplyForm') return;
    const app = LR();
    if (!app) return;

    const experience = String(form.experience.value || '').trim();
    const vehicleType = String(form.vehicleType.value || '').trim();
    const trafficRules = String(form.trafficRules.value || '').trim();
    const reason = String(form.reason.value || '').trim();
    const confirm = !!(form.confirm && form.confirm.checked);
    const msg = $('#licenseApplyMsg');
    const btn = form.querySelector('button[type="submit"]');
    const fail = (text) => {
      if (msg) { msg.textContent = text; msg.className = 'citizen-form-msg error'; }
    };

    if (!experience) return fail('Elegí tu experiencia manejando.');
    if (!vehicleType) return fail('Elegí qué vehículo querés manejar.');
    if (!trafficRules) return fail('Indicá si conocés las normas de tránsito.');
    if (reason.length < 20) return fail('Contanos por qué querés la licencia (mínimo 20 caracteres).');
    if (!confirm) return fail('Confirmá que los datos son correctos y que la licencia es de roleplay.');

    state.licenseSending = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando a mods…'; }
    if (msg) { msg.textContent = 'Enviando la solicitud al canal privado de moderadores…'; msg.className = 'citizen-form-msg'; }

    try {
      await app.Auth.api('/citizen/license/apply', {
        method: 'POST',
        json: { experience, vehicleType, trafficRules, reason, confirm },
      });
      state.licenseFormOpen = false;
      state.tab = 'licencia';
      await loadCitizen({ silent: true });
      app.toast('✅ Solicitud enviada. Un moderador la va a revisar en Discord.');
    } catch (err) {
      if (err.status === 401) {
        app.Auth.clear();
        showGate();
        return;
      }
      if (msg) { msg.textContent = '❌ ' + (err.message || 'No se pudo enviar la solicitud.'); msg.className = 'citizen-form-msg error'; }
      if (btn) { btn.disabled = false; btn.textContent = 'Enviar solicitud a mods'; }
    } finally {
      state.licenseSending = false;
    }
  }

  async function unlinkCitizen() {
    const app = LR();
    if (!app) return;
    try {
      const d = await app.Auth.api('/citizen/unlink', { method: 'POST' });
      if (d && d.user) adoptUser(d.user);
      state.linked = false;
      state.waiting = false;
      state.missing = false;
      state.citizen = null;
      state.unlinkConfirm = false;
      state.tab = 'resumen';
      render();
      app.toast('DNI desvinculado de tu cuenta.');
    } catch (err) {
      app.toast('❌ ' + (err.message || 'No se pudo desvincular el DNI.'));
    }
  }

  async function logout() {
    const app = LR();
    if (!app) return;
    try { await app.Auth.api('/auth/logout', { method: 'POST' }); } catch { /* igual cerramos */ }
    app.Auth.clear();
    showGate();
    app.toast('👋 Cerraste sesión.');
  }

  function handleAuth(user) {
    state.user = user || null;
    if (!user) {
      state.loaded = false;
      state.linked = false;
      state.citizen = null;
      state.source = '';
      state.cadMissing = false;
      state.canUnlink = true;
      state.error = '';
      state.licenseFormOpen = false;
      state.licenseSending = false;
      showGate();
      return;
    }
    showApp();
    renderSidebar();
    renderLive();
    if (!state.loaded) {
      state.loading = true;
      state.error = '';
      const fromHash = String(location.hash || '').replace(/^#/, '');
      if (TABS.includes(fromHash)) state.tab = fromHash;
      renderContent();
      loadCitizen();
    } else {
      render();
    }
  }

  function setupIntro() {
    const params = new URLSearchParams(location.search);
    if (params.get('intro') !== '1') return false;
    const intro = $('#cineIntro');
    if (!intro) return false;

    intro.hidden = false;
    document.body.classList.add('cine-open');

    const audio = $('#cineAudio');
    const muteBtn = $('#cineMute');
    const skipBtn = $('#cineSkip');
    const cfg = window.LR_CONFIG || {};
    const src = String(cfg.introMusic || '').trim();
    const targetVolume = Math.max(0, Math.min(1, Number(cfg.introMusicVolume) || 0.35));
    let finished = false;
    let muted = false;
    let timer = null;
    let fadeTimer = null;

    const paintMute = () => {
      if (!muteBtn) return;
      muteBtn.textContent = muted ? '🔇' : '🔊';
      muteBtn.setAttribute('aria-label', muted ? 'Activar música' : 'Silenciar música');
      muteBtn.title = muted ? 'Activar música' : 'Silenciar música';
    };

    const startFade = () => {
      if (!audio || finished) return;
      if (fadeTimer) clearInterval(fadeTimer);
      audio.volume = 0;
      fadeTimer = setInterval(() => {
        if (finished || !audio) { clearInterval(fadeTimer); return; }
        audio.volume = Math.min(targetVolume, audio.volume + targetVolume / 26);
        if (audio.volume >= targetVolume) clearInterval(fadeTimer);
      }, 100);
    };

    const finish = () => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      if (fadeTimer) clearInterval(fadeTimer);
      intro.classList.add('cine-out');
      if (audio) audio.pause();
      setTimeout(() => {
        intro.hidden = true;
        intro.classList.remove('cine-out');
        document.body.classList.remove('cine-open');
      }, 580);
    };

    if (muteBtn) {
      muteBtn.addEventListener('click', () => {
        if (!audio || !audio.src) return;
        muted = !muted;
        audio.muted = muted;
        if (!muted) {
          const p = audio.play();
          if (p && p.then) p.then(startFade).catch(() => {});
          else startFade();
        }
        paintMute();
      });
    }
    if (skipBtn) skipBtn.addEventListener('click', finish);

    if (audio && src) {
      audio.volume = 0;
      audio.src = src;
      audio.addEventListener('error', () => {
        if (muteBtn) {
          muteBtn.textContent = '🔇';
          muteBtn.disabled = true;
          muteBtn.title = 'Música no disponible: agregá el archivo en web/assets/audio/';
          muteBtn.setAttribute('aria-label', 'Música no disponible');
        }
      });
      const play = audio.play();
      if (play && play.then) {
        play.then(startFade).catch(() => {
          // El navegador puede bloquear el autoplay. El botón de mute
          // permite activar el sonido con un clic.
          if (muteBtn) muteBtn.title = 'Tocá para activar la música';
        });
      }
    } else if (muteBtn) {
      muteBtn.disabled = true;
      muteBtn.title = 'Música no configurada';
    }

    paintMute();
    timer = setTimeout(finish, 8500);
    return true;
  }

  function setupEvents() {
    const app = LR();
    if (!app) return;

    document.addEventListener('lr:auth', (e) => {
      handleAuth(e.detail && e.detail.user);
    });

    const nav = $('#citizenNav');
    if (nav) {
      nav.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-panel-tab]');
        if (!btn) return;
        setTab(btn.getAttribute('data-panel-tab'));
      });
    }

    const refresh = $('#citizenRefresh');
    if (refresh) refresh.addEventListener('click', () => loadCitizen());

    const logoutBtn = $('#citizenLogout');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);

    const content = $('#citizenContent');
    if (content) {
      content.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.getAttribute('data-action');
        if (action === 'refresh') { loadCitizen(); return; }
        if (action === 'go-tab') { setTab(btn.getAttribute('data-tab')); return; }
        if (action === 'print') { window.print(); return; }
        if (action === 'logout') { logout(); return; }
        if (action === 'unlink') {
          state.unlinkConfirm = true;
          renderContent();
          clearTimeout(unlinkTimer);
          unlinkTimer = setTimeout(() => { state.unlinkConfirm = false; renderContent(); }, 8000);
          return;
        }
        if (action === 'unlink-cancel') {
          state.unlinkConfirm = false;
          clearTimeout(unlinkTimer);
          renderContent();
          return;
        }
        if (action === 'unlink-confirm') { unlinkCitizen(); return; }
        if (action === 'relink') { unlinkCitizen(); return; }
        if (action === 'license-start') {
          state.licenseFormOpen = true;
          renderContent();
          const first = $('#licenseApplyForm select');
          if (first) first.focus();
          return;
        }
        if (action === 'license-cancel') {
          state.licenseFormOpen = false;
          renderContent();
          return;
        }
      });
      content.addEventListener('submit', (e) => {
        if (e.target && e.target.id === 'citizenCreateForm') handleCreateSubmit(e);
        else if (e.target && e.target.id === 'licenseApplyForm') handleLicenseSubmit(e);
        else handleLinkSubmit(e);
      });
      content.addEventListener('input', (e) => {
        if (!e.target || e.target.name !== 'dob') return;
        const form = e.target.closest('#citizenCreateForm');
        if (!form) return;
        const age = ageFromDob(e.target.value);
        const out = $('#citizenAge');
        if (out) out.textContent = age === null ? '—' : String(age);
      });
    }

    const c911 = $('#citizen911');
    if (c911) {
      if (CFG.central911) c911.setAttribute('href', CFG.central911);
      else c911.style.display = 'none';
    }

    window.addEventListener('hashchange', () => {
      const tab = String(location.hash || '').replace(/^#/, '');
      if (TABS.includes(tab) && tab !== state.tab) {
        state.tab = tab;
        renderSidebar();
        renderContent();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden || !app.Auth.user || !state.linked) return;
      const age = Date.now() - Number(state.cadUpdatedAt || 0);
      if (age > 45000) loadCitizen({ silent: true });
    });

    liveTimer = setInterval(() => {
      if (!document.hidden) renderLive();
    }, 30000);

    pollTimer = setInterval(() => {
      if (!document.hidden && app.Auth.user && state.linked) loadCitizen({ silent: true });
    }, 60000);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const app = LR();
    if (!app) {
      showGate();
      return;
    }
    setupIntro();
    setupEvents();
    try {
      if (app.Auth.ready) await app.Auth.ready;
    } catch { /* la página sigue mostrando el acceso */ }
    handleAuth(app.Auth.user);
  });

  window.addEventListener('beforeunload', () => {
    if (liveTimer) clearInterval(liveTimer);
    if (pollTimer) clearInterval(pollTimer);
    if (unlinkTimer) clearTimeout(unlinkTimer);
  });
})();
