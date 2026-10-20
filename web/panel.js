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
  const licenseTone = (status) => {
    const s = norm(status);
    if (s.includes('revocada')) return 'red';
    if (s.includes('suspendida')) return 'gold';
    if (s.includes('valida') || s.includes('válida')) return 'ok';
    return 'neutral';
  };
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
        '<div><span class="eyebrow">Primer paso</span><h2>Vinculá tu DNI</h2>' +
        '<p>Conectá tu cuenta de Discord con tu personaje del CAD. Es una sola vez.</p></div>' +
      '</div>' +
      '<div class="citizen-grid-2 citizen-link-grid">' +
        '<article class="citizen-card citizen-link-card">' +
          '<div class="citizen-form-head">' + avatarMarkup('citizen-form-avatar') +
            '<div><b>' + esc(user.displayName || user.username) + '</b><span>@' + esc(user.username) + '</span></div>' +
          '</div>' +
          '<form class="citizen-form" id="citizenLinkForm" novalidate>' +
            '<label>DNI del personaje' +
              '<input name="dni" inputmode="numeric" autocomplete="off" placeholder="Ej: 30123456" required>' +
            '</label>' +
            '<label>Nombre completo en el CAD' +
              '<input name="name" autocomplete="off" placeholder="Ej: Juan Pérez" required>' +
            '</label>' +
            '<button class="btn btn-primary citizen-form-submit" type="submit">Vincular mi DNI</button>' +
            '<div class="citizen-form-msg" id="citizenLinkMsg"></div>' +
          '</form>' +
        '</article>' +
        '<aside class="citizen-card citizen-help">' +
          '<span class="eyebrow">Cómo funciona</span>' +
          '<h3>Tu identidad en la ciudad</h3>' +
          '<ol>' +
            '<li>Tu personaje tiene que estar registrado en el CAD.</li>' +
            '<li>Escribí el DNI y el nombre <b>tal como los cargó el staff</b>.</li>' +
            '<li>Si los datos no coinciden, pedile al staff que los revise.</li>' +
          '</ol>' +
          '<p class="citizen-fine">Solo se puede vincular un DNI por cuenta. Podés desvincularlo cuando quieras desde Ajustes.</p>' +
        '</aside>' +
      '</div>' +
      '<article class="citizen-card citizen-note">' +
        '<b>¿Todavía no tenés DNI?</b>' +
        '<p>Pasá por el Discord y pedí tu registro. Cuando el CAD tenga tus datos, volvé acá y vinculalos.</p>' +
      '</article>';
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
    if (c.totals.warrants > 0) {
      alerts.push(banner('red', 'Tenés una orden activa',
        'Acercate a una unidad policial o hablá con el staff para resolverla.',
        '<button class="btn btn-ghost btn-sm" type="button" data-action="go-tab" data-tab="ordenes">Ver orden</button>'));
    }
    if (license === 'red' || license === 'gold') {
      alerts.push(banner(license, 'Licencia ' + c.licStatus,
        license === 'red' ? 'No manejes hasta regularizar tu situación.' : 'Evitá conducir hasta que se resuelva.',
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
          '<p>DNI <b class="citizen-mono">' + esc(c.dni) + '</b><span class="citizen-dot-sep">·</span>Licencia <b>' + esc(c.license || 'sin registro') + '</b></p>' +
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
        statCard('DNI', c.dni, 'Identidad vinculada', 'accent') +
        statCard('Licencia', c.licStatus, c.license ? 'Nº ' + c.license : 'Sin número', license) +
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
    const user = currentUser();
    return '' +
      '<div class="citizen-section-head">' +
        '<div><span class="eyebrow">Documento</span><h2>Mi DNI</h2>' +
        '<p>Tu identidad dentro de La Realidad RP.</p></div>' +
        '<button class="btn btn-ghost btn-sm citizen-print-btn" type="button" data-action="print">Imprimir / PDF</button>' +
      '</div>' +
      '<article class="cid-card">' +
        '<div class="cid-watermark">LOS ANGELES</div>' +
        '<header class="cid-head">' +
          '<img class="cid-logo" src="assets/logo.png" alt="">' +
          '<div><small>Ciudad de Los Angeles · La Realidad RP</small><b>Documento Nacional de Identidad</b></div>' +
          '<span class="cid-seal">RP</span>' +
        '</header>' +
        '<div class="cid-body">' +
          '<div class="cid-photo">' + avatarMarkup('cid-avatar') + '<span>Ciudadano</span></div>' +
          '<div class="cid-data">' +
            '<div><small>Nombre completo</small><b>' + esc(c.name) + '</b></div>' +
            '<div><small>DNI</small><b class="citizen-mono">' + esc(c.dni) + '</b></div>' +
            '<div><small>Fecha de nacimiento</small><b>' + esc(dobFmt(c.dob)) + '</b></div>' +
            '<div><small>Licencia de conducir</small><b>' + esc(c.license || 'Sin registro') + ' · ' + esc(c.licStatus) + '</b></div>' +
          '</div>' +
        '</div>' +
        '<footer class="cid-foot">' +
          '<span>La Realidad RP · Los Angeles (ER:LC)</span>' +
          '<span class="citizen-mono">' + esc(c.dni) + '</span>' +
        '</footer>' +
      '</article>' +
      '<div class="citizen-grid-2">' +
        '<article class="citizen-card">' +
          '<div class="citizen-card-head"><div><span class="eyebrow">Registro</span><h3>Datos del CAD</h3></div></div>' +
          '<div class="citizen-rows">' +
            '<div><span>DNI</span><b class="citizen-mono">' + esc(c.dni) + '</b></div>' +
            '<div><span>Nacimiento</span><b>' + esc(dobFmt(c.dob)) + '</b></div>' +
            '<div><span>Licencia</span><b>' + esc(c.license || 'Sin registro') + '</b></div>' +
            '<div><span>Estado</span>' + chip(c.licStatus, licenseTone(c.licStatus)) + '</div>' +
          '</div>' +
        '</article>' +
        '<article class="citizen-card">' +
          '<div class="citizen-card-head"><div><span class="eyebrow">Notas</span><h3>Antecedentes</h3></div></div>' +
          '<p class="citizen-notes">' + esc(c.notes || 'Sin notas ni antecedentes registrados.') + '</p>' +
          '<p class="citizen-fine">Los datos salen del CAD. Si algo está mal, pedile al staff que lo corrija.</p>' +
        '</article>' +
      '</div>' +
      '<p class="citizen-fine citizen-print-note">Documento de roleplay. No es un documento de identidad real.</p>';
  }

  function renderLicense(c) {
    const tone = licenseTone(c.licStatus);
    return '' +
      '<div class="citizen-section-head">' +
        '<div><span class="eyebrow">Licencia</span><h2>Licencia de conducir</h2>' +
        '<p>Estado y número registrados en el CAD.</p></div>' +
      '</div>' +
      '<article class="citizen-license ' + tone + '">' +
        '<div class="citizen-license-mark">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><circle cx="8.5" cy="11" r="2.2"/><path d="M5.5 16c.6-1.6 1.7-2.3 3-2.3s2.4.7 3 2.3M14 10h4M14 13h4M14 16h2.5"/></svg>' +
        '</div>' +
        '<div class="citizen-license-info">' +
          '<span class="eyebrow">Estado actual</span>' +
          '<h2>' + esc(c.licStatus) + '</h2>' +
          '<p>Nº de licencia <b class="citizen-mono">' + esc(c.license || 'Sin registro') + '</b></p>' +
        '</div>' +
        chip(licenseTone(c.licStatus) === 'ok' ? 'Habilitada' : 'Requiere atención', tone) +
      '</article>' +
      (tone === 'red' ? banner('red', 'Licencia revocada', 'No podés conducir hasta que el staff regularice tu licencia.') : '') +
      (tone === 'gold' ? banner('gold', 'Licencia suspendida', 'No conduzcas hasta resolver la suspensión con el staff.') : '') +
      '<div class="citizen-grid-2">' +
        '<article class="citizen-card">' +
          '<div class="citizen-card-head"><div><span class="eyebrow">Titular</span><h3>Datos de la licencia</h3></div></div>' +
          '<div class="citizen-rows">' +
            '<div><span>Titular</span><b>' + esc(c.name) + '</b></div>' +
            '<div><span>DNI</span><b class="citizen-mono">' + esc(c.dni) + '</b></div>' +
            '<div><span>Número</span><b class="citizen-mono">' + esc(c.license || '—') + '</b></div>' +
            '<div><span>Estado</span>' + chip(c.licStatus, tone) + '</div>' +
          '</div>' +
        '</article>' +
        '<article class="citizen-card">' +
          '<div class="citizen-card-head"><div><span class="eyebrow">Importante</span><h3>Cómo regularizarla</h3></div></div>' +
          '<p class="citizen-notes">Las licencias se gestionan con el staff o en el CAD. Si el estado no coincide con tu situación, abrí un ticket en el Discord.</p>' +
          '<p class="citizen-fine">El panel es de solo lectura: no podés cambiar el estado desde acá.</p>' +
        '</article>' +
      '</div>';
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
            '<div><span>Rol</span>' + chip(user.role || 'Ciudadano', 'role') + '</div>' +
            '<div><span>Miembro desde</span><b>' + dateFmt(user.createdAt) + '</b></div>' +
          '</div>' +
        '</article>' +
        '<article class="citizen-card">' +
          '<div class="citizen-card-head"><div><span class="eyebrow">CAD</span><h3>Vínculo de identidad</h3></div></div>' +
          '<div class="citizen-rows">' +
            '<div><span>DNI</span><b class="citizen-mono">' + esc(dni || 'Sin vincular') + '</b></div>' +
            '<div><span>Personaje</span><b>' + esc((c && c.name) || user.citizenName || '—') + '</b></div>' +
            '<div><span>Última sync</span><b>' + (state.cadUpdatedAt ? relative(state.cadUpdatedAt) : 'Sin datos') + '</b></div>' +
          '</div>' +
        '</article>' +
      '</div>' +
      '<article class="citizen-card citizen-danger-zone">' +
        '<div><b>Desvincular DNI</b><p>El DNI se quita de tu cuenta. Los datos del CAD no se borran.</p></div>' +
        (state.unlinkConfirm
          ? '<div class="citizen-confirm-actions">' +
              '<button class="btn citizen-red-btn" type="button" data-action="unlink-confirm">Sí, desvincular</button>' +
              '<button class="btn btn-ghost" type="button" data-action="unlink-cancel">Cancelar</button>' +
            '</div>'
          : '<button class="btn btn-ghost citizen-red-btn" type="button" data-action="unlink">Desvincular DNI</button>') +
      '</article>' +
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
      state.citizen = d.citizen || null;
      state.cadUpdatedAt = Number(d.cadUpdatedAt) || 0;
      state.serverNow = Number(d.serverNow) || Date.now();
      state.loaded = true;
      state.loading = false;
      state.error = '';
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
      state.error = '';
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
      });
      content.addEventListener('submit', handleLinkSubmit);
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
