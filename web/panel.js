/* ============================================================
   LA REALIDAD RP — RLA OS
   Panel de Ciudadano convertido en un escritorio virtual.
   ------------------------------------------------------------
   - Registro Civil con todos los datos del CAD.
   - Ventanas arrastrables, redimensionables y minimizables.
   - Barra de tareas, menú de inicio, apps y ajustes.
   - La autenticación y los datos siguen viniendo de app.js + bot.
   ============================================================ */

(function () {
  'use strict';

  /* ============================================================
     1) AYUDAS GENERALES
     ============================================================ */

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
  const num = (n) => (Number(n) || 0).toLocaleString('es-AR');
  const dateFmt = (ts) => {
    if (!ts) return '—';
    const d = new Date(Number(ts));
    if (Number.isNaN(d.getTime())) return '—';
    const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return String(d.getDate()).padStart(2, '0') + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
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
  const ageText = (citizen) => {
    const age = Number(citizen && citizen.age) || ageFromDob(citizen && citizen.dob);
    return age ? age + ' año' + (age === 1 ? '' : 's') : '—';
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
  const nowTime = () => new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
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
    if (s.includes('revision') || s.includes('pendiente') || s.includes('suspendida')) return 'gold';
    if (s.includes('valida')) return 'ok';
    return 'neutral';
  };
  const recordTone = (status) => {
    const s = norm(status);
    if (s.includes('activa') || s.includes('robado') || s.includes('vencida')) return 'red';
    if (s.includes('pagada') || s.includes('cumplida') || s.includes('normal') || s.includes('resuelta')) return 'ok';
    return 'gold';
  };
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const isMobile = () => window.innerWidth <= 760;
  const isCoarse = () => window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const readJSON = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  };
  const writeJSON = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* modo privado */ }
  };
  const range = (n) => Array.from({ length: n }, (_, i) => i);

  function LR() {
    return window.LRApp || null;
  }

  function currentUser() {
    return state.user || (LR() && LR().Auth.user) || null;
  }

  function toast(text, ms) {
    const app = LR();
    if (app && app.toast) app.toast(text, ms);
  }

  function chip(text, tone, extra) {
    return '<span class="citizen-chip ' + (tone || 'neutral') + (extra ? ' ' + extra : '') + '">' + esc(text) + '</span>';
  }

  function pcChip(text, tone, extra) {
    return '<span class="pc-chip ' + (tone || 'neutral') + (extra ? ' ' + extra : '') + '">' + esc(text) + '</span>';
  }

  function pcAvatar(extra, userArg) {
    const user = userArg || currentUser();
    const url = safeUrl(user && user.avatar);
    const label = esc(initials(user && (user.displayName || user.username)));
    const seed = String((user && user.username) || 'rla');
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) % 360;
    return '<span class="pc-avatar ' + (extra || '') + '" style="--av-hue:' + hash + '">' +
      (url ? '<img src="' + esc(url) + '" alt="" referrerpolicy="no-referrer" onerror="this.remove()">' : '') +
      '<b>' + label + '</b></span>';
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

  function pcEmpty(icon, title, text, action) {
    return '<div class="pc-empty">' +
      '<span class="pc-empty-icon">' + icon + '</span>' +
      '<h3>' + esc(title) + '</h3>' +
      '<p>' + esc(text) + '</p>' +
      (action || '') +
    '</div>';
  }

  /* ============================================================
     2) DATOS, APPS E ICONOS
     ============================================================ */

  const TABS = ['resumen', 'dni', 'licencia', 'vehiculos', 'multas', 'ordenes', 'antecedentes'];
  const CIVIL_TABS = [
    { id: 'resumen', label: 'Resumen' },
    { id: 'dni', label: 'DNI' },
    { id: 'licencia', label: 'Licencia' },
    { id: 'vehiculos', label: 'Vehículos' },
    { id: 'multas', label: 'Multas' },
    { id: 'ordenes', label: 'Órdenes' },
    { id: 'antecedentes', label: 'Antecedentes' },
  ];

  const ICONS = {
    civil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h8.5L18 7v13.5H6z"/><path d="M14.5 3.5V7H18"/><path d="M9 11h6M9 14h6M9 17h3.5"/><path d="M15.8 15.2l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5z"/></svg>',
    store: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 8h15l-1.1 12H5.6z"/><path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8"/><path d="M9 12h6"/></svg>',
    google: '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z"/></svg>',
    profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c.8-4 3.4-6 7.5-6s6.7 2 7.5 6"/></svg>',
    entornos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 4.8-9 4.8-9-4.8z"/><path d="M3 12l9 4.8 9-4.8M3 16.2l9 4.8 9-4.8"/></svg>',
    files: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 6.5h6l2 2h9v11h-17z"/><path d="M3.5 6.5v-2h6l2 2"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 11.5a8.5 8.5 0 0 1-12.2 7.6L3.5 20.5l1.4-4.7A8.5 8.5 0 1 1 20.5 11.5z"/><path d="M8.7 8.4c.2-.4.4-.4.7-.4h.5c.2 0 .4 0 .5.4l.7 1.6c.1.3.1.5-.1.7l-.5.6c-.1.2-.2.4 0 .7.4.7 1 1.3 1.8 1.7.3.2.5.1.7-.1l.6-.7c.2-.2.4-.2.6-.1l1.6.8c.3.1.4.3.4.5 0 .2-.1 1-.5 1.4-.4.5-1.1.8-1.8.8-1.3 0-3.2-.8-4.7-2.2-1.5-1.5-2.3-3.3-2.3-4.6 0-.5.2-1.1.8-1.1z"/></svg>',
    bank: '<span class="ico-bank-flag"></span><span class="ico-bank-word">BofA</span>',
    mercado: '<span class="ico-ml-word">ML</span><span class="ico-ml-hand">✦</span>',
    social: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v10H9l-5 4z"/><path d="M8 9h8M8 12h5"/><path d="M18.5 4.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/></svg>',
    work: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5h8v2M3 12h18M10 12v2h4v-2"/></svg>',
    onion: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c4 0 6.2 4.1 6.2 8.2 0 5.1-2.7 9.8-6.2 9.8s-6.2-4.7-6.2-9.8C5.8 7.1 8 3 12 3z"/><path d="M12 6v14M9 8c.7 2 5.3 2 6 0M8.6 13c1 1.4 5.8 1.4 6.8 0"/></svg>',
    vps: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><path d="M7 7h.01M7 17h.01M11 7h5M11 17h5"/></svg>',
    crypto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v10M14.8 9.2c-.5-.7-1.5-1-2.8-1-1.7 0-2.8.8-2.8 2s1 1.7 2.8 2c1.8.3 2.8.9 2.8 2.1 0 1.2-1.1 2-2.8 2-1.3 0-2.3-.3-2.8-1"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/></svg>',
  };

  const APP_META = {
    civil: { name: 'Registro Civil', subtitle: 'Los Angeles County', iconClass: 'ico-civil', iconSvg: ICONS.civil, w: 1120, h: 750, minW: 720, minH: 480, storeCat: 'sistema', storeDesc: 'Tu DNI de California, licencia, vehículos, multas, órdenes y antecedentes. Todo en un solo expediente.', rating: 4.9, downloads: '12.4K', keywords: 'dni licencia identidad registro civil california multas ordenes vehiculos antecedentes', render: renderCivilApp, refreshOnData: true },
    store: { name: 'RLA Store', subtitle: 'Tienda de aplicaciones', iconClass: 'ico-store', iconSvg: ICONS.store, w: 1040, h: 720, minW: 680, minH: 460, storeCat: 'sistema', storeDesc: 'Descubrí e instalá aplicaciones para tu RLA OS. La tienda oficial de La Realidad RP.', rating: 4.8, downloads: '8.1K', keywords: 'tienda store apps aplicaciones instalar', render: renderStoreApp },
    google: { name: 'Google', subtitle: 'Buscador', iconClass: 'ico-google', iconSvg: ICONS.google, w: 940, h: 680, minW: 560, minH: 420, storeCat: 'utilidades', storeDesc: 'Buscá en tus registros, abrí aplicaciones y encontrá accesos rápidos de la ciudad.', rating: 4.7, downloads: '20K', keywords: 'google buscar buscador web', render: renderGoogleApp },
    settings: { name: 'Ajustes', subtitle: 'Sistema', iconClass: 'ico-settings', iconSvg: ICONS.settings, w: 920, h: 700, minW: 620, minH: 460, storeCat: 'sistema', storeDesc: 'Cuenta, apariencia, privacidad y datos del sistema. Personalizá tu RLA OS.', rating: 4.6, downloads: '12K', keywords: 'ajustes settings cuenta apariencia fondo color privacidad', render: renderSettingsApp, refreshOnData: true },
    profile: { name: 'Perfil', subtitle: 'Tu cuenta', iconClass: 'ico-profile', iconSvg: ICONS.profile, w: 860, h: 660, minW: 560, minH: 440, storeCat: 'sistema', storeDesc: 'Tu identidad de Discord, Roblox y tu personaje en la ciudad.', rating: 4.5, downloads: '9.4K', keywords: 'perfil profile cuenta discord roblox usuario', render: renderProfileApp, refreshOnData: true },
    entornos: { name: 'Entornos', subtitle: 'Servicios y conexiones', iconClass: 'ico-entornos', iconSvg: ICONS.entornos, w: 980, h: 700, minW: 620, minH: 460, storeCat: 'sistema', storeDesc: 'Estado del CAD, Discord, la API y los entornos de la ciudad en tiempo real.', rating: 4.7, downloads: '7.7K', keywords: 'entornos servidores estado cad discord api sistema', render: renderEntornosApp, mount: mountEntornosApp },
    files: { name: 'Archivos', subtitle: 'Documentos', iconClass: 'ico-files', iconSvg: ICONS.files, w: 1000, h: 700, minW: 660, minH: 460, storeCat: 'utilidades', storeDesc: 'Explorá los documentos de tu personaje y descargá una copia de tu expediente.', rating: 4.5, downloads: '6.8K', keywords: 'archivos files documentos dni licencia carpeta', render: renderFilesApp, refreshOnData: true },
    whatsapp: { name: 'WhatsApp', subtitle: 'Mensajes', iconClass: 'ico-whatsapp', iconSvg: ICONS.whatsapp, w: 960, h: 680, minW: 640, minH: 460, storeCat: 'social', storeDesc: 'Mensajes de la ciudad: central 911, soporte, reclutamiento y tus contactos.', rating: 4.8, downloads: '18K', keywords: 'whatsapp mensajes chat telefono contactos central', render: renderWhatsappApp, mount: mountWhatsappApp },
    bank: { name: 'Bank of America', subtitle: 'Banca', iconClass: 'ico-bank', iconSvg: ICONS.bank, w: 980, h: 700, minW: 660, minH: 460, storeCat: 'finanzas', storeDesc: 'Consultá tu cuenta, movimientos y multas pendientes desde Bank of America.', rating: 4.6, downloads: '10K', keywords: 'banco bank of america bofa cuenta finanzas dinero multas', render: renderBankApp, refreshOnData: true },
    mercado: { name: 'MercadoLibre', subtitle: 'Marketplace', iconClass: 'ico-mercado', iconSvg: ICONS.mercado, w: 1040, h: 700, minW: 680, minH: 460, storeCat: 'utilidades', storeDesc: 'Comprá artículos para tu personaje: tecnología, repuestos, uniformes y más.', rating: 4.4, downloads: '6.1K', keywords: 'mercadolibre mercado comprar tienda productos carrito', render: renderMercadoApp },
    social: { name: 'RLA Social', subtitle: 'Comunidad', iconClass: 'ico-social', iconSvg: ICONS.social, w: 980, h: 700, minW: 660, minH: 460, storeCat: 'social', storeDesc: 'La red social de Los Angeles. Seguí a las cuentas oficiales y compartí con la ciudad.', rating: 4.9, downloads: '14K', keywords: 'social red twitter posts comunidad rla', render: renderSocialApp },
    work: { name: 'RLA Work', subtitle: 'Empleos', iconClass: 'ico-work', iconSvg: ICONS.work, w: 980, h: 690, minW: 660, minH: 460, storeCat: 'social', storeDesc: 'Encontrá trabajo en el LAPD, CHP, LAFD, comercios y empresas de la ciudad.', rating: 4.7, downloads: '5.9K', keywords: 'trabajo empleo work curriculum lapd chp lafd', render: renderWorkApp },
    onion: { name: 'Onion', subtitle: 'Navegador privado', iconClass: 'ico-onion', iconSvg: ICONS.onion, w: 940, h: 660, minW: 620, minH: 440, storeCat: 'explorar', storeDesc: 'Navegador anónimo de roleplay. Explorá sitios de la red Onion simulada.', rating: 4.3, downloads: '3.2K', keywords: 'onion navegador privado anonimo tor', render: renderOnionApp },
    vps: { name: 'VPS Manager', subtitle: 'Servidores', iconClass: 'ico-vps', iconSvg: ICONS.vps, w: 1000, h: 690, minW: 660, minH: 460, storeCat: 'explorar', storeDesc: 'Monitoreá los servidores de RLA Systems: web, bot, CAD y radio.', rating: 4.6, downloads: '2.8K', keywords: 'vps servidores terminal consola cpu ram', render: renderVpsApp },
    crypto: { name: 'Crypto Wallet', subtitle: 'Billetera', iconClass: 'ico-crypto', iconSvg: ICONS.crypto, w: 900, h: 660, minW: 600, minH: 440, storeCat: 'explorar', storeDesc: 'Billetera de criptomonedas de roleplay con tu portafolio y movimientos.', rating: 4.2, downloads: '2.4K', keywords: 'crypto wallet bitcoin ethereum solana billetera', render: renderCryptoApp },
    trash: { name: 'Papelera', subtitle: 'Elementos eliminados', iconClass: 'ico-trash', iconSvg: ICONS.trash, w: 800, h: 580, minW: 520, minH: 400, storeCat: 'sistema', storeDesc: 'Elementos eliminados de tu escritorio.', rating: 0, downloads: '', keywords: 'papelera trash eliminar', render: renderTrashApp },
  };

  const APP_ORDER = ['civil', 'store', 'google', 'settings', 'profile', 'entornos', 'files', 'whatsapp', 'bank', 'mercado', 'social', 'work', 'onion', 'vps', 'crypto', 'trash'];
  const DESKTOP_ORDER = ['trash', 'civil', 'store', 'google', 'settings', 'profile', 'entornos', 'files', 'whatsapp', 'bank', 'mercado', 'social', 'work', 'onion', 'vps', 'crypto'];
  const CORE_APPS = ['civil', 'store', 'google', 'settings', 'profile', 'entornos', 'files', 'whatsapp', 'bank', 'mercado', 'social', 'work', 'trash'];
  const DEFAULT_INSTALLED = CORE_APPS.slice();

  const APPS = {};
  APP_ORDER.forEach((id) => { APPS[id] = Object.assign({ id }, APP_META[id]); });

  const WALLPAPERS = {
    lapd: { name: 'LAPD', css: "url('assets/foto-lapd.jpg')" },
    chp: { name: 'CHP', css: "url('assets/foto-chp.jpg')" },
    lafd: { name: 'LAFD', css: "url('assets/foto-lafd.jpg')" },
    hero: { name: 'Los Angeles', css: "url('assets/erlc-hero-lapd.jpg')" },
    gradient: { name: 'Noche', css: 'linear-gradient(135deg,#05080f 0%,#0b1422 42%,#1a102c 100%)' },
  };

  const ACCENTS = [
    { id: 'teal', name: 'Turquesa', color: '#2ee6cd', color2: '#14b8a6' },
    { id: 'gold', name: 'Dorado', color: '#ffc84a', color2: '#d9a52a' },
    { id: 'violet', name: 'Violeta', color: '#a78bfa', color2: '#7c3aed' },
    { id: 'blue', name: 'Azul', color: '#60a5fa', color2: '#2563eb' },
    { id: 'pink', name: 'Rosa', color: '#fb7185', color2: '#e11d48' },
    { id: 'green', name: 'Verde', color: '#4ade80', color2: '#16a34a' },
  ];

  const DEFAULT_PREFS = { wallpaper: 'lapd', accent: 'teal', compact: false, reduceMotion: false };
  const PREF_KEY = 'rla_os_prefs_v1';
  const INSTALLED_KEY = 'rla_os_installed_v1';
  const SOCIAL_KEY = 'rla_social_posts_v1';
  const SOCIAL_LIKES_KEY = 'rla_social_likes_v1';
  const WORK_KEY = 'rla_work_applied_v1';

  /* ============================================================
     3) ESTADO
     ============================================================ */

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
    source: '',
    cadMissing: false,
    canUnlink: true,
    civilTab: 'resumen',
    licenseFormOpen: false,
    licenseSending: false,
    unlinkConfirm: false,
    autoOpened: false,
    installed: DEFAULT_INSTALLED.slice(),
    prefs: Object.assign({}, DEFAULT_PREFS),
    storeCategory: 'todas',
    storeQuery: '',
    googleQuery: '',
    filesFolder: 'todos',
    filesQuery: '',
    filesSelected: '',
    settingsTab: 'cuenta',
    socialPosts: [],
    socialLikes: [],
    waChat: 'central',
    waChats: [],
    mlQuery: '',
    mlCategory: 'todas',
    mlCart: [],
    mlCartOpen: false,
    workQuery: '',
    workCategory: 'todas',
    workApplied: [],
    onionSite: 'home',
    onionQuery: '',
    onionError: '',
    env: null,
    envLoading: false,
    envError: '',
    vpsServers: [],
    vpsConsole: [],
    cryptoAssets: [],
  };

  let unlinkTimer = null;
  let liveTimer = null;
  let pollTimer = null;
  let clockTimer = null;
  let activeWindowId = null;
  let zCounter = 30;
  let selectedDesktopIcon = null;
  let contextOpen = false;

  const windowMap = new Map();

  /* ============================================================
     4) PREFERENCIAS Y ALMACENAMIENTO LOCAL
     ============================================================ */

  function defaultPrefs() {
    return Object.assign({}, DEFAULT_PREFS);
  }

  function loadPrefs() {
    const raw = readJSON(PREF_KEY, {});
    const prefs = Object.assign({}, DEFAULT_PREFS, raw && typeof raw === 'object' ? raw : {});
    if (!WALLPAPERS[prefs.wallpaper]) prefs.wallpaper = 'lapd';
    if (!ACCENTS.some((a) => a.id === prefs.accent)) prefs.accent = 'teal';
    prefs.compact = !!prefs.compact;
    prefs.reduceMotion = !!prefs.reduceMotion;
    return prefs;
  }

  function savePrefs() {
    writeJSON(PREF_KEY, state.prefs);
  }

  function accentById(id) {
    return ACCENTS.find((a) => a.id === id) || ACCENTS[0];
  }

  function applyPrefs() {
    const accent = accentById(state.prefs.accent);
    const root = document.documentElement;
    root.style.setProperty('--accent', accent.color);
    root.style.setProperty('--accent-2', accent.color2);
    root.style.setProperty('--pc-accent', accent.color);
    const wall = WALLPAPERS[state.prefs.wallpaper] || WALLPAPERS.lapd;
    root.style.setProperty('--pc-wallpaper-image', wall.css);
    document.body.classList.toggle('pc-compact', !!state.prefs.compact);
    document.body.classList.toggle('pc-reduce-motion', !!state.prefs.reduceMotion);
  }

  function loadInstalled() {
    const saved = readJSON(INSTALLED_KEY, null);
    const list = Array.isArray(saved) ? saved.filter((id) => APPS[id]) : DEFAULT_INSTALLED.slice();
    CORE_APPS.forEach((id) => { if (!list.includes(id)) list.push(id); });
    return Array.from(new Set(list));
  }

  function saveInstalled() {
    writeJSON(INSTALLED_KEY, state.installed);
  }

  function isInstalled(id) {
    return CORE_APPS.includes(id) || state.installed.includes(id);
  }

  function hydrateLocalState() {
    state.prefs = loadPrefs();
    state.installed = loadInstalled();
    state.socialLikes = readJSON(SOCIAL_LIKES_KEY, []);
    if (!Array.isArray(state.socialLikes)) state.socialLikes = [];
    const savedPosts = readJSON(SOCIAL_KEY, null);
    state.socialPosts = Array.isArray(savedPosts) ? savedPosts.filter((p) => p && p.text) : [];
    state.workApplied = readJSON(WORK_KEY, []);
    if (!Array.isArray(state.workApplied)) state.workApplied = [];
    state.waChats = defaultChats();
    state.vpsServers = defaultServers();
    state.vpsConsole = defaultConsole();
    state.cryptoAssets = defaultAssets();
  }

  function saveSocial() {
    writeJSON(SOCIAL_KEY, state.socialPosts.filter((p) => p && p.custom));
    writeJSON(SOCIAL_LIKES_KEY, state.socialLikes);
  }

  function saveWork() {
    writeJSON(WORK_KEY, state.workApplied);
  }

  /* ============================================================
     5) DATOS DE APPS (POSTS, CHATS, PRODUCTOS, EMPLEOS, ETC.)
     ============================================================ */

  function defaultPosts() {
    return [
      {
        id: 'lapd-operativo',
        name: 'LAPD Los Angeles',
        handle: '@lapd',
        initials: 'LA',
        tone: 'blue',
        badge: 'Oficial',
        time: 'Hace 12 min',
        text: 'Operativo de control vehicular en Vespucci Boulevard. Circular con documentación al día y respetar las indicaciones de las unidades.',
        image: 'assets/foto-lapd.jpg',
        likes: 248,
        comments: 31,
      },
      {
        id: 'central-911',
        name: 'Central 911',
        handle: '@central911',
        initials: '911',
        tone: 'red',
        badge: 'Emergencias',
        time: 'Hace 45 min',
        text: 'Recordatorio: para emergencias en la ciudad llamá al 911 desde el panel. Indicá tu ubicación y esperá a la unidad asignada.',
        image: '',
        likes: 96,
        comments: 12,
      },
      {
        id: 'rla-store',
        name: 'RLA Store',
        handle: '@rlstore',
        initials: 'RLA',
        tone: 'orange',
        badge: 'Tienda',
        time: 'Hace 2 h',
        text: 'Ya podés instalar Onion, VPS Manager y Crypto Wallet desde la sección Explorar de RLA Store. Personalizá tu escritorio y llevá tu PC al siguiente nivel.',
        image: '',
        likes: 174,
        comments: 28,
      },
      {
        id: 'rla-work',
        name: 'RLA Work',
        handle: '@rlawork',
        initials: 'RW',
        tone: 'teal',
        badge: 'Empleos',
        time: 'Hace 4 h',
        text: 'El LAPD, CHP y LAFD abrieron nuevas vacantes. Entrá a RLA Work para ver requisitos, salarios y postularte desde la ciudad.',
        image: 'assets/foto-chp.jpg',
        likes: 132,
        comments: 19,
      },
    ];
  }

  function defaultChats() {
    return [
      {
        id: 'central',
        name: 'Central 911',
        initials: '911',
        tone: 'red',
        status: 'En línea · Emergencias',
        messages: [
          { from: 'them', text: 'Central 911. ¿Cuál es su emergencia?', time: '12:04' },
          { from: 'me', text: 'Hola, necesito reportar un vehículo sospechoso en Mission Row.', time: '12:05' },
          { from: 'them', text: 'Recibido. Una unidad fue notificada y se dirige al sector. Mantenga la línea.', time: '12:06' },
        ],
      },
      {
        id: 'soporte',
        name: 'RLA Soporte',
        initials: 'RLA',
        tone: 'teal',
        status: 'En línea · Soporte',
        messages: [
          { from: 'them', text: 'Bienvenido a RLA Soporte. Si tenés un problema con tu DNI o licencia, contanos acá.', time: '11:20' },
        ],
      },
      {
        id: 'lapd',
        name: 'LAPD Reclutamiento',
        initials: 'LAPD',
        tone: 'blue',
        status: 'Últ. vez hoy',
        messages: [
          { from: 'them', text: 'Las postulaciones para el LAPD están abiertas. Revisá los requisitos en RLA Work.', time: 'Ayer' },
        ],
      },
      {
        id: 'store',
        name: 'RLA Store',
        initials: 'RLA',
        tone: 'orange',
        status: 'En línea · Pedidos',
        messages: [
          { from: 'them', text: 'Tu pedido de la RLA Store está listo. Podés retirarlo en el centro de la ciudad.', time: 'Ayer' },
        ],
      },
      {
        id: 'familia',
        name: 'Familia',
        initials: 'F',
        tone: 'green',
        status: 'En línea',
        messages: [
          { from: 'them', text: '¿Nos vemos en el centro más tarde?', time: '10:12' },
          { from: 'me', text: 'Dale, nos vemos en la plaza.', time: '10:14' },
        ],
      },
    ];
  }

  function defaultMlProducts() {
    return [
      { id: 'gps', title: 'GPS SPOT Trace para vehículo', cat: 'Tecnología', price: 12999, emoji: '📡', rating: 4.8, shipping: 'Envío gratis', tag: 'Más vendido' },
      { id: 'radio', title: 'Radio portátil Motorola de mano', cat: 'Tecnología', price: 8450, emoji: '📻', rating: 4.9, shipping: 'Envío gratis', tag: '' },
      { id: 'chaleco', title: 'Chaleco táctico LAPD (roleplay)', cat: 'Vehículos', price: 4200, emoji: '🦺', rating: 4.7, shipping: 'Envío gratis', tag: '' },
      { id: 'llantas', title: 'Kit de llantas deportivas 18"', cat: 'Vehículos', price: 32500, emoji: '🛞', rating: 4.6, shipping: 'Envío a cargo', tag: 'Oferta' },
      { id: 'herramientas', title: 'Caja de herramientas profesional', cat: 'Vehículos', price: 15750, emoji: '🧰', rating: 4.8, shipping: 'Envío gratis', tag: '' },
      { id: 'uniforme', title: 'Uniforme CHP completo (roleplay)', cat: 'Vehículos', price: 6800, emoji: '👮', rating: 4.5, shipping: 'Envío gratis', tag: '' },
      { id: 'camara', title: 'Cámara dash 4K para patrulla', cat: 'Tecnología', price: 9900, emoji: '📷', rating: 4.7, shipping: 'Envío gratis', tag: 'Nuevo' },
      { id: 'extintor', title: 'Extintor portátil para vehículo', cat: 'Hogar', price: 2200, emoji: '🧯', rating: 4.9, shipping: 'Envío gratis', tag: '' },
      { id: 'celular', title: 'Celular RLA Phone 5G 128 GB', cat: 'Tecnología', price: 28500, emoji: '📱', rating: 4.4, shipping: 'Envío gratis', tag: 'Oferta' },
      { id: 'cafe', title: 'Café de especialidad Los Angeles 1 kg', cat: 'Hogar', price: 1800, emoji: '☕', rating: 4.8, shipping: 'Envío gratis', tag: '' },
    ];
  }

  function defaultJobs() {
    return [
      { id: 'lapd', title: 'Oficial del LAPD', company: 'Los Angeles Police Department', initials: 'LAPD', tone: 'blue', location: 'Los Angeles, CA', type: 'Tiempo completo', salary: '$65.000 – $95.000', cat: 'Policía', text: 'Patrullaje, respuesta a emergencias y protección de la ciudad. Se valora experiencia previa en roleplay policial.' },
      { id: 'chp', title: 'Oficial de CHP', company: 'California Highway Patrol', initials: 'CHP', tone: 'gold', location: 'Ruta 68, CA', type: 'Tiempo completo', salary: '$60.000 – $88.000', cat: 'Policía', text: 'Control de rutas, persecuciones y operativos de tránsito en las carreteras de Los Angeles.' },
      { id: 'lafd', title: 'Paramédico / Bombero', company: 'Los Angeles Fire Department', initials: 'LAFD', tone: 'red', location: 'Los Angeles, CA', type: 'Tiempo completo', salary: '$55.000 – $80.000', cat: 'Emergencias', text: 'Atención de emergencias médicas, rescates y apoyo en incendios. Certificación de roleplay requerida.' },
      { id: 'mecanico', title: 'Mecánico en Grove Street', company: 'Grove Street Garage', initials: 'GS', tone: 'green', location: 'Grove Street, LA', type: 'Medio tiempo', salary: '$2.500 – $4.000 / semana', cat: 'Comercio', text: 'Reparación de vehículos, tuning y atención al cliente. Herramientas provistas por el taller.' },
      { id: 'repartidor', title: 'Repartidor de RLA Store', company: 'RLA Store', initials: 'RLA', tone: 'orange', location: 'Centro de Los Angeles', type: 'Flexible', salary: '$1.800 – $3.200 / semana', cat: 'Comercio', text: 'Entregá pedidos en toda la ciudad. Necesitás licencia de conducir y un vehículo propio.' },
      { id: 'piloto', title: 'Piloto de helicóptero', company: 'RLA Air Support', initials: 'RLA', tone: 'teal', location: 'Aeropuerto de Los Angeles', type: 'Tiempo completo', salary: '$80.000 – $110.000', cat: 'Emergencias', text: 'Apoyo aéreo para unidades policiales y emergencias. Licencia de piloto de roleplay obligatoria.' },
    ];
  }

  function defaultServers() {
    return [
      { id: 'web', name: 'RLA-WEB', role: 'Panel web y GitHub Pages', status: 'online', cpu: 18, ram: 42, disk: 61, uptime: '14d 08h', ping: 38 },
      { id: 'bot', name: 'RLA-BOT', role: 'Bot de Discord', status: 'online', cpu: 9, ram: 31, disk: 44, uptime: '14d 08h', ping: 24 },
      { id: 'cad', name: 'RLA-CAD', role: 'CAD / ER:LC', status: 'online', cpu: 24, ram: 55, disk: 72, uptime: '3d 12h', ping: 51 },
      { id: 'radio', name: 'RLA-RADIO', role: 'Central 911', status: 'online', cpu: 12, ram: 28, disk: 39, uptime: '7d 02h', ping: 45 },
    ];
  }

  function defaultConsole() {
    return [
      '[OK] rla-web · panel servido correctamente',
      '[OK] rla-bot · Discord conectado',
      '[OK] rla-cad · última sincronización recibida',
      '[INFO] rla-radio · esperando llamadas',
    ];
  }

  function defaultAssets() {
    return [
      { id: 'btc', name: 'Bitcoin', ticker: 'BTC', price: 67240, balance: 0, change: '+2.41%', tone: 'btc' },
      { id: 'eth', name: 'Ethereum', ticker: 'ETH', price: 3480, balance: 0, change: '+1.18%', tone: 'eth' },
      { id: 'sol', name: 'Solana', ticker: 'SOL', price: 172.4, balance: 0, change: '-0.64%', tone: 'sol' },
      { id: 'rla', name: 'RLA Coin', ticker: 'RLA', price: 1, balance: 0, change: '+8.02%', tone: 'rla' },
    ];
  }

  const ONION_SITES = {
    home: {
      title: 'Onion Search',
      kicker: 'NAVEGADOR PRIVADO',
      body: '<p class="pc-onion-lead">Buscá en la red Onion simulada de Los Angeles. Todos los sitios son contenido de roleplay.</p>' +
        '<div class="pc-onion-links">' +
          '<button class="pc-onion-link" data-pc-action="onion-site" data-site="foro"><b>Foro Nocturno</b><span>onion://foro · conversaciones de la ciudad</span></button>' +
          '<button class="pc-onion-link" data-pc-action="onion-site" data-site="mercado"><b>Mercado Gris</b><span>onion://mercado · artículos de roleplay</span></button>' +
          '<button class="pc-onion-link" data-pc-action="onion-site" data-site="filtros"><b>Filtraciones LA</b><span>onion://filtros · rumores y noticias</span></button>' +
          '<button class="pc-onion-link" data-pc-action="onion-site" data-site="radio"><b>Radio Fantasma</b><span>onion://radio · transmisión pirata</span></button>' +
        '</div>',
    },
    foro: {
      title: 'Foro Nocturno',
      kicker: 'onion://foro',
      body: '<div class="pc-onion-post"><b>¿Alguien vio el operativo de Vespucci?</b><span>Anónimo · hace 20 min</span><p>Había tres unidades del LAPD y un helicóptero. Cerraron la calle por casi una hora.</p></div>' +
        '<div class="pc-onion-post"><b>Busco mecánico en Grove Street</b><span>Anónimo · hace 1 h</span><p>Necesito arreglar la suspensión del Sultan. Paguen en efectivo, sin preguntas.</p></div>' +
        '<div class="pc-onion-post"><b>Central 911 está contratando</b><span>Anónimo · hace 3 h</span><p>Vi la publicación en RLA Work. Dicen que buscan operadores para la noche.</p></div>',
    },
    mercado: {
      title: 'Mercado Gris',
      kicker: 'onion://mercado',
      body: '<div class="pc-onion-market"><div><b>Reloj de lujo</b><span>Vendedor anónimo · $4.500</span></div><button class="pc-btn pc-btn-ghost" data-pc-action="toast" data-message="Contacto enviado al vendedor (demo).">Contactar</button></div>' +
        '<div class="pc-onion-market"><div><b>Repuesto de motor V8</b><span>Vendedor anónimo · $12.000</span></div><button class="pc-btn pc-btn-ghost" data-pc-action="toast" data-message="Contacto enviado al vendedor (demo).">Contactar</button></div>' +
        '<div class="pc-onion-market"><div><b>Documentación de vehículo</b><span>Vendedor anónimo · $2.000</span></div><button class="pc-btn pc-btn-ghost" data-pc-action="toast" data-message="Contacto enviado al vendedor (demo).">Contactar</button></div>',
    },
    filtros: {
      title: 'Filtraciones LA',
      kicker: 'onion://filtros',
      body: '<div class="pc-onion-news"><span>EXCLUSIVA</span><h3>El CAD tendría nuevos registros de antecedentes</h3><p>Según una fuente anónima, el sistema estaría unificando multas y órdenes en un solo expediente por ciudadano. El staff no confirmó la información.</p></div>' +
        '<div class="pc-onion-news"><span>RUMOR</span><h3>Nuevo operativo en el puerto esta noche</h3><p>Varias unidades habrían sido vistas cerca de los contenedores. Se recomienda evitar la zona si no tenés nada que hacer allí.</p></div>',
    },
    radio: {
      title: 'Radio Fantasma',
      kicker: 'onion://radio · 103.7 FM',
      body: '<div class="pc-onion-radio"><span class="pc-onion-live">EN VIVO</span><h3>Transmisión Nocturna</h3><p>“Buenas noches, Los Angeles. Este es un mensaje para los que escuchan cuando la ciudad duerme…”</p><div class="pc-onion-wave"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div>' +
        '<p class="pc-onion-lead">La señal se corta cada pocos minutos. Nadie sabe desde dónde transmite.</p>',
    },
  };

  const STORE_CATEGORIES = [
    { id: 'todas', label: 'Todas' },
    { id: 'instaladas', label: 'Instaladas' },
    { id: 'explorar', label: 'Explorar' },
    { id: 'sistema', label: 'Sistema' },
    { id: 'social', label: 'Social' },
    { id: 'finanzas', label: 'Finanzas' },
    { id: 'utilidades', label: 'Utilidades' },
  ];

  const ML_CATEGORIES = ['todas', 'Tecnología', 'Vehículos', 'Hogar'];
  const WORK_CATEGORIES = ['todas', 'Policía', 'Emergencias', 'Comercio'];


  /* ============================================================
     6) ICONOS, RELOJ Y ESTADO DEL SISTEMA
     ============================================================ */

  function appIcon(id, extra) {
    const app = APPS[id];
    if (!app) return '';
    return '<span class="pc-app-ico ' + (app.iconClass || '') + (extra ? ' ' + extra : '') + '" aria-hidden="true">' +
      (app.iconSvg || '') + '</span>';
  }

  function syncInfo() {
    if (!state.user) return { tone: 'neutral', text: 'Sin sesión', tray: 'RLA', title: 'RLA OS' };
    if (state.loading && !state.loaded) return { tone: 'loading', text: 'Sincronizando CAD…', tray: 'CAD', title: 'Consultando el CAD' };
    if (state.error && !state.citizen) return { tone: 'err', text: 'Sin conexión', tray: 'CAD', title: state.error };
    if (state.waiting) return { tone: 'warn', text: 'CAD sin datos', tray: 'CAD', title: 'El CAD todavía no envió datos' };
    if (state.missing) return { tone: 'warn', text: 'DNI no encontrado', tray: 'DNI', title: 'El registro cambió en el CAD' };
    if (!state.cadUpdatedAt) return { tone: 'warn', text: 'Esperando sync', tray: 'CAD', title: 'Esperando la primera sincronización' };
    if (state.error) return { tone: 'warn', text: 'Datos sin actualizar', tray: 'CAD', title: state.error };
    return { tone: 'ok', text: 'CAD conectado', tray: 'CAD', title: 'Actualizado ' + relative(state.cadUpdatedAt) };
  }

  function updateSyncUI() {
    const info = syncInfo();
    const dot = $('#pcSyncDot');
    const text = $('#pcSyncText');
    const btn = $('#pcSyncBtn');
    const trayDot = $('#pcTrayDot');
    const trayText = $('#pcTrayText');
    const trayBtn = $('#pcTraySync');
    if (dot) dot.className = 'pc-sync-dot ' + info.tone;
    if (text) text.textContent = info.text;
    if (btn) btn.title = info.title;
    if (trayDot) trayDot.className = 'pc-tray-dot ' + info.tone;
    if (trayText) trayText.textContent = info.tray;
    if (trayBtn) trayBtn.title = info.title;
  }

  function updateUserUI() {
    const user = currentUser();
    const topName = $('#pcTopName');
    const topRole = $('#pcTopRole');
    const topAvatar = $('#pcTopAvatar');
    const topUser = $('#pcTopUser');
    const lockAvatar = $('#pcLockAvatar');
    if (topName) topName.textContent = user ? (user.displayName || user.username) : 'Ciudadano';
    if (topRole) topRole.textContent = user ? (user.role || 'Ciudadano') : 'RLA OS';
    if (topAvatar) {
      const url = safeUrl(user && user.avatar);
      topAvatar.innerHTML = url
        ? '<img src="' + esc(url) + '" alt="" referrerpolicy="no-referrer" onerror="this.remove()">' + esc(initials(user.displayName || user.username))
        : (user ? esc(initials(user.displayName || user.username)) : 'RLA');
    }
    if (topUser) topUser.title = user ? ('@' + user.username + ' · Abrir perfil') : 'Abrir perfil';
    if (lockAvatar) {
      const url = safeUrl(user && user.avatar);
      lockAvatar.innerHTML = url
        ? '<img src="' + esc(url) + '" alt="" referrerpolicy="no-referrer" onerror="this.remove()">'
        : '<img src="assets/logo.png" alt="">';
    }
  }

  function tickClock() {
    const now = new Date();
    const time = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
    const longDate = now.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
    const shortDate = now.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const lockTime = $('#pcLockTime');
    const lockDate = $('#pcLockDate');
    const deskTime = $('#pcDeskTime');
    const deskDate = $('#pcDeskDate');
    const trayTime = $('#pcTrayTime');
    const trayDate = $('#pcTrayDate');
    if (lockTime) lockTime.textContent = time;
    if (lockDate) lockDate.textContent = longDate.charAt(0).toUpperCase() + longDate.slice(1);
    if (deskTime) deskTime.textContent = time;
    if (deskDate) deskDate.textContent = longDate.charAt(0).toUpperCase() + longDate.slice(1);
    if (trayTime) trayTime.textContent = time;
    if (trayDate) trayDate.textContent = shortDate;
  }

  function startClock() {
    tickClock();
    if (clockTimer) clearInterval(clockTimer);
    clockTimer = setInterval(tickClock, 1000);
  }

  function showLock() {
    const lock = $('#pcLock');
    const shell = $('#pcShell');
    if (lock) lock.hidden = false;
    if (shell) shell.hidden = true;
    document.body.classList.add('pc-locked');
    document.body.classList.remove('pc-shell-open');
    closeLauncher();
    closeContextMenu();
    updateUserUI();
  }

  function showShell() {
    const lock = $('#pcLock');
    const shell = $('#pcShell');
    if (lock) lock.hidden = true;
    if (shell) shell.hidden = false;
    document.body.classList.remove('pc-locked');
    document.body.classList.add('pc-shell-open');
    updateUserUI();
    updateSyncUI();
  }

  /* ============================================================
     7) ICONOS DEL ESCRITORIO Y MENÚ DE INICIO
     ============================================================ */

  function desktopBadge(id) {
    if (id === 'civil' && state.citizen) {
      const info = licenseInfo(state.citizen);
      if (info.status === 'pending') return '<i class="pc-icon-badge gold" title="Licencia en revisión"></i>';
      if (state.citizen.totals && state.citizen.totals.warrants > 0) return '<i class="pc-icon-badge red" title="Orden activa"></i>';
    }
    return '';
  }

  function getDesktopApps() {
    return DESKTOP_ORDER.filter(isInstalled);
  }

  function renderDesktopIcons() {
    const box = $('#pcIcons');
    if (!box) return;
    box.innerHTML = getDesktopApps().map((id) => {
      const app = APPS[id];
      return '<button class="pc-desktop-icon" type="button" data-desktop-app="' + id + '" title="' + esc(app.name) + ' — doble clic para abrir">' +
        '<span class="pc-desktop-icon-art">' + appIcon(id) + desktopBadge(id) + '</span>' +
        '<span class="pc-desktop-icon-label">' + esc(app.name) + '</span>' +
      '</button>';
    }).join('');
    if (selectedDesktopIcon) {
      const again = box.querySelector('[data-desktop-app="' + selectedDesktopIcon + '"]');
      if (again) again.classList.add('is-selected');
    }
  }

  function selectDesktopIcon(btn) {
    selectedDesktopIcon = btn ? btn.getAttribute('data-desktop-app') : '';
    $$('#pcIcons .pc-desktop-icon').forEach((b) => b.classList.toggle('is-selected', b === btn));
  }

  function openLauncher() {
    const launcher = $('#pcLauncher');
    const start = $('#pcStart');
    if (!launcher) return;
    renderLauncher();
    launcher.hidden = false;
    launcher.classList.add('is-open');
    if (start) {
      start.classList.add('is-open');
      start.setAttribute('aria-expanded', 'true');
    }
    closeContextMenu();
    setTimeout(() => {
      const input = $('#pcLauncherSearch');
      if (input && !isCoarse()) input.focus();
    }, 40);
  }

  function closeLauncher() {
    const launcher = $('#pcLauncher');
    const start = $('#pcStart');
    if (launcher) {
      launcher.classList.remove('is-open');
      launcher.hidden = true;
    }
    if (start) {
      start.classList.remove('is-open');
      start.setAttribute('aria-expanded', 'false');
    }
  }

  function toggleLauncher() {
    const launcher = $('#pcLauncher');
    if (launcher && !launcher.hidden) closeLauncher();
    else openLauncher();
  }

  function launcherAppMarkup(id) {
    const app = APPS[id];
    const installed = isInstalled(id);
    return '<button class="pc-launcher-app' + (installed ? '' : ' is-locked') + '" type="button" data-pc-action="launcher-app" data-app="' + id + '" data-search="' + esc(norm(app.name + ' ' + app.keywords)) + '">' +
      '<span class="pc-launcher-app-art">' + appIcon(id) + (installed ? '' : '<i class="pc-launcher-lock">Tienda</i>') + '</span>' +
      '<span class="pc-launcher-app-name">' + esc(app.name) + '</span>' +
    '</button>';
  }

  function renderLauncher() {
    const el = $('#pcLauncher');
    if (!el) return;
    const user = currentUser();
    el.innerHTML = '<div class="pc-launcher-panel" role="dialog" aria-label="Menú de inicio">' +
      '<div class="pc-launcher-head">' +
        '<div class="pc-launcher-user">' + pcAvatar('pc-launcher-avatar') +
          '<div><b>' + esc(user ? (user.displayName || user.username) : 'Invitado') + '</b>' +
          '<span>' + esc(user ? '@' + user.username : 'Iniciá sesión para entrar') + '</span></div>' +
        '</div>' +
        '<div class="pc-launcher-sync">' + '<i class="pc-sync-dot ' + syncInfo().tone + '"></i>' + esc(syncInfo().text) + '</div>' +
      '</div>' +
      '<label class="pc-launcher-search">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>' +
        '<input id="pcLauncherSearch" type="search" autocomplete="off" placeholder="Buscar aplicaciones…" aria-label="Buscar aplicaciones">' +
      '</label>' +
      '<div class="pc-launcher-section-title"><b>Aplicaciones</b><span>Todas las apps de RLA OS</span></div>' +
      '<div class="pc-launcher-grid" id="pcLauncherGrid">' + APP_ORDER.map(launcherAppMarkup).join('') + '</div>' +
      '<div class="pc-launcher-empty" id="pcLauncherEmpty" hidden>No encontramos aplicaciones con ese nombre.</div>' +
      '<div class="pc-launcher-foot">' +
        '<button type="button" data-pc-action="open-app" data-app="store">' + appIcon('store', 'is-sm') + ' RLA Store</button>' +
        '<button type="button" data-pc-action="open-app" data-app="settings">' + appIcon('settings', 'is-sm') + ' Ajustes</button>' +
        '<button type="button" data-pc-action="refresh">Actualizar datos</button>' +
        '<button class="pc-launcher-logout" type="button" data-action="logout">Cerrar sesión</button>' +
      '</div>' +
    '</div>';
    filterLauncher();
  }

  function filterLauncher() {
    const input = $('#pcLauncherSearch');
    const grid = $('#pcLauncherGrid');
    const empty = $('#pcLauncherEmpty');
    if (!grid) return;
    const q = norm(input ? input.value : '');
    let visible = 0;
    $$('.pc-launcher-app', grid).forEach((btn) => {
      const hay = btn.getAttribute('data-search') || '';
      const show = !q || hay.includes(q);
      btn.hidden = !show;
      if (show) visible++;
    });
    if (empty) empty.hidden = visible > 0;
  }

  /* ============================================================
     8) MENÚS CONTEXTUALES
     ============================================================ */

  let contextItems = [];

  function closeContextMenu() {
    const el = $('#pcContext');
    if (el) {
      el.hidden = true;
      el.innerHTML = '';
    }
    contextOpen = false;
    contextItems = [];
  }

  function showContextMenu(x, y, items) {
    const el = $('#pcContext');
    if (!el) return;
    contextItems = items;
    el.innerHTML = items.map((item, index) => {
      if (item.separator) return '<span class="pc-context-sep" aria-hidden="true"></span>';
      return '<button type="button" class="' + (item.danger ? 'is-danger' : '') + '" data-context-index="' + index + '">' +
        (item.icon ? '<span class="pc-context-ico">' + item.icon + '</span>' : '') +
        '<span>' + esc(item.label) + '</span>' +
      '</button>';
    }).join('');
    el.hidden = false;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    contextOpen = true;
    const rect = el.getBoundingClientRect();
    const left = clamp(x, 8, Math.max(8, window.innerWidth - rect.width - 8));
    const top = clamp(y, 8, Math.max(8, window.innerHeight - rect.height - 8));
    el.style.left = left + 'px';
    el.style.top = top + 'px';
  }

  function showDesktopMenu(e) {
    showContextMenu(e.clientX, e.clientY, [
      { label: 'Abrir Registro Civil', icon: '🪪', onSelect: () => openApp('civil') },
      { label: 'Abrir RLA Store', icon: '🛍️', onSelect: () => openApp('store') },
      { separator: true },
      { label: 'Actualizar datos', icon: '↻', onSelect: () => loadCitizen({ force: true }) },
      { label: 'Cambiar fondo', icon: '🖼️', onSelect: () => { state.settingsTab = 'apariencia'; openApp('settings'); } },
      { separator: true },
      { label: 'Cerrar sesión', icon: '⏻', danger: true, onSelect: logout },
    ]);
  }

  function showTaskMenu(e, id) {
    const win = windowMap.get(id);
    if (!win) return;
    showContextMenu(e.clientX, e.clientY, [
      { label: win.minimized ? 'Restaurar' : 'Minimizar', icon: '—', onSelect: () => { if (win.minimized) restoreWindow(id); else minimizeWindow(id); } },
      { label: win.maximized ? 'Restaurar tamaño' : 'Maximizar', icon: '□', onSelect: () => toggleMaximize(id) },
      { separator: true },
      { label: 'Cerrar ventana', icon: '✕', danger: true, onSelect: () => closeWindow(id) },
    ]);
  }

  function showWindowMenu(e, id) {
    const win = windowMap.get(id);
    if (!win) return;
    showContextMenu(e.clientX, e.clientY, [
      { label: 'Minimizar', icon: '—', onSelect: () => minimizeWindow(id) },
      { label: win.maximized ? 'Restaurar tamaño' : 'Maximizar', icon: '□', onSelect: () => toggleMaximize(id) },
      { separator: true },
      { label: 'Cerrar ventana', icon: '✕', danger: true, onSelect: () => closeWindow(id) },
    ]);
  }

  /* ============================================================
     9) GESTOR DE VENTANAS
     ============================================================ */

  function windowBodyMarkup(id) {
    const app = APPS[id];
    if (!app) return '';
    try {
      return app.render ? app.render() : '';
    } catch (err) {
      console.error('[RLA OS] Error renderizando ' + id, err);
      return pcEmpty('⚠️', 'No se pudo abrir esta aplicación', 'Ocurrió un error al preparar la ventana. Probá cerrarla y abrirla de nuevo.');
    }
  }

  function windowMarkup(id) {
    const app = APPS[id];
    return '<div class="pc-win-bar" data-drag-handle>' +
        '<div class="pc-win-title">' + appIcon(id, 'is-sm') +
          '<div class="pc-win-title-text"><b>' + esc(app.name) + '</b><span>' + esc(app.subtitle || 'RLA OS') + '</span></div>' +
        '</div>' +
        '<div class="pc-win-controls">' +
          '<button type="button" data-win-control="minimize" title="Minimizar" aria-label="Minimizar">–</button>' +
          '<button type="button" data-win-control="maximize" title="Maximizar" aria-label="Maximizar">□</button>' +
          '<button type="button" data-win-control="close" title="Cerrar" aria-label="Cerrar">✕</button>' +
        '</div>' +
      '</div>' +
      '<div class="pc-win-content"><div class="pc-win-body" data-app-body="' + id + '">' + windowBodyMarkup(id) + '</div></div>' +
      ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((dir) => '<span class="pc-resize pc-resize-' + dir + '" data-resize-dir="' + dir + '"></span>').join('');
  }

  function openApp(id, opts) {
    opts = opts || {};
    const app = APPS[id];
    if (!app) return null;
    if (!isInstalled(id)) {
      state.storeCategory = 'explorar';
      openApp('store');
      toast('Instalá ' + app.name + ' desde RLA Store para abrirla.');
      return null;
    }
    if (opts.tab && id === 'civil') state.civilTab = TABS.includes(opts.tab) ? opts.tab : 'resumen';
    if (opts.settingsTab) state.settingsTab = opts.settingsTab;
    if (opts.folder) state.filesFolder = opts.folder;
    closeLauncher();
    closeContextMenu();

    const existing = windowMap.get(id);
    if (existing) {
      if (existing.minimized) restoreWindow(id);
      else focusWindow(id);
      if (id === 'civil') refreshApp('civil', true);
      if (id === 'settings') refreshApp('settings', true);
      return existing.el;
    }

    const layer = $('#pcWindows');
    if (!layer) return null;
    const host = layer.getBoundingClientRect();
    const mobile = isMobile();
    const width = mobile ? host.width : clamp(app.w || 900, app.minW || 420, Math.max(320, host.width - 24));
    const height = mobile ? host.height : clamp(app.h || 640, app.minH || 300, Math.max(240, host.height - 24));
    const offset = (windowMap.size % 5) * 20;
    let left = Math.round((host.width - width) / 2 + offset - 36);
    let top = Math.round((host.height - height) / 2 + offset - 24);
    left = clamp(left, 10, Math.max(10, host.width - width - 10));
    top = clamp(top, 10, Math.max(10, host.height - height - 10));

    const el = document.createElement('section');
    el.id = 'pc-win-' + id;
    el.className = 'pc-window pc-window-' + id;
    el.dataset.app = id;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', app.name);
    el.setAttribute('tabindex', '-1');
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    el.style.width = width + 'px';
    el.style.height = height + 'px';
    el.innerHTML = windowMarkup(id);

    const win = {
      id,
      app,
      el,
      minimized: false,
      maximized: false,
      prev: { left, top, width, height },
    };
    windowMap.set(id, win);
    layer.appendChild(el);
    wireWindow(win);

    if (mobile) {
      win.maximized = true;
      el.classList.add('is-maximized');
      updateMaxButton(win);
    }

    focusWindow(id);
    updateTaskbar();
    if (app.mount) {
      try { app.mount(id); } catch (err) { console.error('[RLA OS] Error montando ' + id, err); }
    }
    const body = el.querySelector('[data-app-body]');
    if (body && !isCoarse()) {
      requestAnimationFrame(() => {
        const first = body.querySelector('input, button, select, textarea, [tabindex="0"]');
        if (first && !body.querySelector('.pc-civil-form input:focus')) {
          // No robamos el foco de formularios; solo enfocamos la ventana.
        }
        el.focus({ preventScroll: true });
      });
    }
    return el;
  }

  function updateMaxButton(win) {
    const btn = win.el.querySelector('[data-win-control="maximize"]');
    if (!btn) return;
    btn.textContent = win.maximized ? '❐' : '□';
    btn.title = win.maximized ? 'Restaurar' : 'Maximizar';
    btn.setAttribute('aria-label', btn.title);
  }

  function wireWindow(win) {
    const { id, el } = win;
    el.addEventListener('pointerdown', () => focusWindow(id), true);

    const bar = el.querySelector('[data-drag-handle]');
    if (bar) {
      bar.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('[data-win-control]')) return;
        startDrag(e, id);
      });
      bar.addEventListener('dblclick', (e) => {
        if (e.target.closest('[data-win-control]')) return;
        toggleMaximize(id);
      });
      bar.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showWindowMenu(e, id);
      });
    }

    $$('[data-win-control]', el).forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.getAttribute('data-win-control');
        if (action === 'minimize') minimizeWindow(id);
        else if (action === 'maximize') toggleMaximize(id);
        else if (action === 'close') closeWindow(id);
      });
    });

    $$('[data-resize-dir]', el).forEach((handle) => {
      handle.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        startResize(e, id, handle.getAttribute('data-resize-dir'));
      });
    });
  }

  function focusWindow(id) {
    const win = windowMap.get(id);
    if (!win) return;
    if (win.minimized) restoreWindow(id);
    zCounter += 1;
    activeWindowId = id;
    windowMap.forEach((w) => {
      w.el.classList.toggle('is-active', w.id === id);
      if (w.id !== id) w.el.style.zIndex = '';
    });
    win.el.style.zIndex = String(zCounter);
    updateTaskbar();
  }

  function restoreWindow(id) {
    const win = windowMap.get(id);
    if (!win) return;
    win.minimized = false;
    win.el.classList.remove('is-minimized');
    focusWindow(id);
  }

  function minimizeWindow(id) {
    const win = windowMap.get(id);
    if (!win) return;
    win.minimized = true;
    win.el.classList.add('is-minimized');
    win.el.classList.remove('is-active');
    if (activeWindowId === id) {
      activeWindowId = null;
      const visible = Array.from(windowMap.values()).filter((w) => !w.minimized);
      if (visible.length) {
        const top = visible.sort((a, b) => Number(a.el.style.zIndex || 0) - Number(b.el.style.zIndex || 0)).pop();
        focusWindow(top.id);
      }
    }
    updateTaskbar();
  }

  function toggleMaximize(id, force) {
    const win = windowMap.get(id);
    if (!win) return;
    if (force === true && win.maximized) return;
    if (win.maximized) {
      win.maximized = false;
      win.el.classList.remove('is-maximized');
      if (win.prev) {
        win.el.style.left = win.prev.left + 'px';
        win.el.style.top = win.prev.top + 'px';
        win.el.style.width = win.prev.width + 'px';
        win.el.style.height = win.prev.height + 'px';
      }
    } else {
      win.prev = {
        left: parseFloat(win.el.style.left) || win.el.offsetLeft,
        top: parseFloat(win.el.style.top) || win.el.offsetTop,
        width: parseFloat(win.el.style.width) || win.el.offsetWidth,
        height: parseFloat(win.el.style.height) || win.el.offsetHeight,
      };
      win.maximized = true;
      win.el.classList.add('is-maximized');
    }
    updateMaxButton(win);
    focusWindow(id);
  }

  function closeWindow(id) {
    const win = windowMap.get(id);
    if (!win) return;
    win.el.remove();
    windowMap.delete(id);
    if (activeWindowId === id) {
      activeWindowId = null;
      const visible = Array.from(windowMap.values()).filter((w) => !w.minimized);
      if (visible.length) {
        const top = visible.sort((a, b) => Number(a.el.style.zIndex || 0) - Number(b.el.style.zIndex || 0)).pop();
        focusWindow(top.id);
      }
    }
    updateTaskbar();
  }

  function closeAllWindows() {
    windowMap.forEach((win) => { try { win.el.remove(); } catch { /* nada */ } });
    windowMap.clear();
    activeWindowId = null;
    updateTaskbar();
  }

  function minimizeAllWindows() {
    windowMap.forEach((win) => {
      win.minimized = true;
      win.el.classList.add('is-minimized');
      win.el.classList.remove('is-active');
    });
    activeWindowId = null;
    updateTaskbar();
  }

  function refreshApp(id, force) {
    const win = windowMap.get(id);
    if (!win) return false;
    if (!force && isEditingWindow(win.el)) return false;
    const body = win.el.querySelector('[data-app-body]');
    if (!body) return false;
    const scrollers = $$('.pc-app-scroll', body);
    const scrolls = scrollers.map((s) => s.scrollTop);
    body.innerHTML = windowBodyMarkup(id);
    $$('.pc-app-scroll', body).forEach((s, i) => { if (scrolls[i]) s.scrollTop = scrolls[i]; });
    return true;
  }

  function isEditingWindow(el) {
    const active = document.activeElement;
    if (!active || !el.contains(active)) return false;
    return !!active.closest('input, textarea, select, [contenteditable="true"]');
  }

  function refreshDataApps() {
    const ids = ['civil', 'profile', 'settings', 'files', 'bank'];
    ids.forEach((id) => refreshApp(id, false));
  }

  function setCivilTab(tab, focus) {
    if (!TABS.includes(tab)) tab = 'resumen';
    state.civilTab = tab;
    if (!windowMap.has('civil')) openApp('civil', { tab });
    else {
      refreshApp('civil', true);
      if (focus !== false) focusWindow('civil');
    }
    try { history.replaceState(null, '', '#' + tab); } catch { /* file:// */ }
  }

  function updateTaskbar() {
    const tasks = $('#pcTasks');
    if (!tasks) return;
    tasks.innerHTML = Array.from(windowMap.values()).map((win) => {
      const active = activeWindowId === win.id && !win.minimized;
      return '<button type="button" class="pc-task' + (active ? ' is-active' : '') + (win.minimized ? ' is-minimized' : '') + '" data-task-id="' + win.id + '" title="' + esc(win.app.name) + '" aria-pressed="' + (active ? 'true' : 'false') + '">' +
        appIcon(win.id, 'is-sm') +
        '<span class="pc-task-label">' + esc(win.app.name) + '</span>' +
        '<i class="pc-task-dot"></i>' +
      '</button>';
    }).join('');
  }

  function startDrag(e, id) {
    const win = windowMap.get(id);
    if (!win) return;
    e.preventDefault();
    closeContextMenu();
    const layer = $('#pcWindows');
    if (!layer) return;
    const layerRect = layer.getBoundingClientRect();
    if (win.maximized) {
      const prev = win.prev || { width: layerRect.width, height: layerRect.height };
      const ratio = clamp((e.clientX - layerRect.left) / Math.max(1, layerRect.width), 0.15, 0.85);
      toggleMaximize(id);
      win.el.style.left = clamp(e.clientX - layerRect.left - prev.width * ratio, -prev.width + 120, layerRect.width - 120) + 'px';
      win.el.style.top = clamp(e.clientY - layerRect.top - 18, 0, layerRect.height - 42) + 'px';
    }
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = parseFloat(win.el.style.left) || win.el.offsetLeft;
    const startTop = parseFloat(win.el.style.top) || win.el.offsetTop;
    const width = win.el.offsetWidth;
    const height = win.el.offsetHeight;
    const minLeft = -width + 120;
    const maxLeft = layerRect.width - 120;
    const maxTop = layerRect.height - 42;

    win.el.classList.add('is-dragging');
    document.body.classList.add('pc-dragging');

    const move = (ev) => {
      const left = clamp(startLeft + ev.clientX - startX, minLeft, maxLeft);
      const top = clamp(startTop + ev.clientY - startY, 0, maxTop);
      win.el.style.left = left + 'px';
      win.el.style.top = top + 'px';
    };
    const up = () => {
      win.el.classList.remove('is-dragging');
      document.body.classList.remove('pc-dragging');
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  }

  function startResize(e, id, dir) {
    const win = windowMap.get(id);
    if (!win || win.maximized) return;
    e.preventDefault();
    e.stopPropagation();
    focusWindow(id);
    const layer = $('#pcWindows');
    if (!layer) return;
    const layerRect = layer.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = parseFloat(win.el.style.left) || win.el.offsetLeft;
    const startTop = parseFloat(win.el.style.top) || win.el.offsetTop;
    const startWidth = win.el.offsetWidth;
    const startHeight = win.el.offsetHeight;
    const minW = win.app.minW || 380;
    const minH = win.app.minH || 260;
    win.el.classList.add('is-resizing');
    document.body.classList.add('pc-resizing');

    const move = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      let left = startLeft;
      let top = startTop;
      let width = startWidth;
      let height = startHeight;

      if (dir.includes('e')) width = clamp(startWidth + dx, minW, layerRect.width - startLeft);
      if (dir.includes('s')) height = clamp(startHeight + dy, minH, layerRect.height - startTop);
      if (dir.includes('w')) {
        width = clamp(startWidth - dx, minW, startLeft + startWidth);
        left = startLeft + (startWidth - width);
      }
      if (dir.includes('n')) {
        height = clamp(startHeight - dy, minH, startTop + startHeight);
        top = startTop + (startHeight - height);
      }
      width = clamp(width, minW, layerRect.width);
      height = clamp(height, minH, layerRect.height);
      left = clamp(left, 0, Math.max(0, layerRect.width - width));
      top = clamp(top, 0, Math.max(0, layerRect.height - height));
      win.el.style.left = left + 'px';
      win.el.style.top = top + 'px';
      win.el.style.width = width + 'px';
      win.el.style.height = height + 'px';
      win.prev = { left, top, width, height };
    };
    const up = () => {
      win.el.classList.remove('is-resizing');
      document.body.classList.remove('pc-resizing');
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  }

  function clampAllWindows() {
    const layer = $('#pcWindows');
    if (!layer) return;
    const rect = layer.getBoundingClientRect();
    windowMap.forEach((win) => {
      if (win.maximized) return;
      const w = Math.min(win.el.offsetWidth, rect.width);
      const h = Math.min(win.el.offsetHeight, rect.height);
      const left = clamp(parseFloat(win.el.style.left) || win.el.offsetLeft, 0, Math.max(0, rect.width - 120));
      const top = clamp(parseFloat(win.el.style.top) || win.el.offsetTop, 0, Math.max(0, rect.height - 42));
      win.el.style.width = w + 'px';
      win.el.style.height = h + 'px';
      win.el.style.left = left + 'px';
      win.el.style.top = top + 'px';
      win.prev = { left, top, width: w, height: h };
    });
  }


  /* ============================================================
     10) DATOS DEL CIUDADANO (API DEL BOT)
     ============================================================ */

  function adoptUser(user) {
    if (!user) return;
    state.user = user;
    const app = LR();
    if (!app) return;
    app.Auth.user = user;
    try { app.Auth.save(); } catch { /* modo privado */ }
    if (app.updateAuthUI) app.updateAuthUI();
    updateUserUI();
  }

  async function loadCitizen(opts) {
    opts = opts || {};
    const app = LR();
    if (!app || !state.user || state.requestInFlight) return;
    state.requestInFlight = true;
    if (!opts.silent) {
      state.loading = true;
      state.error = '';
      updateSyncUI();
      refreshDataApps();
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
      updateSyncUI();
      refreshDataApps();
      maybeOpenCivil();
    } catch (err) {
      state.loading = false;
      if (err.status === 401) {
        if (app.Auth && app.Auth.clear) app.Auth.clear();
        showLock();
        toast('Tu sesión venció. Volvé a ingresar.');
        return;
      }
      state.error = err.message || 'No pude consultar el panel.';
      updateSyncUI();
      refreshDataApps();
      if (opts.silent) toast('No se pudo actualizar: ' + state.error);
    } finally {
      state.requestInFlight = false;
    }
  }

  function maybeOpenCivil() {
    if (state.autoOpened || !state.user) return;
    if (windowMap.size > 0) {
      state.autoOpened = true;
      return;
    }
    state.autoOpened = true;
    setTimeout(() => {
      if (!state.user) return;
      openApp('civil', { tab: state.civilTab });
      renderDesktopIcons();
    }, 120);
  }

  function resetSessionState() {
    state.loaded = false;
    state.loading = true;
    state.linked = false;
    state.waiting = false;
    state.missing = false;
    state.citizen = null;
    state.cadUpdatedAt = 0;
    state.serverNow = 0;
    state.requestInFlight = false;
    state.error = '';
    state.source = '';
    state.cadMissing = false;
    state.canUnlink = true;
    state.civilTab = 'resumen';
    state.licenseFormOpen = false;
    state.licenseSending = false;
    state.unlinkConfirm = false;
    state.autoOpened = false;
    state.googleQuery = '';
    state.filesSelected = '';
    state.storeQuery = '';
    state.storeCategory = 'todas';
    state.mlCartOpen = false;
    if (unlinkTimer) clearTimeout(unlinkTimer);
  }

  function handleAuth(user) {
    state.user = user || null;
    if (!user) {
      resetSessionState();
      closeAllWindows();
      showLock();
      renderAllUI();
      return;
    }
    showShell();
    if (!state.loaded) {
      state.loading = true;
      state.error = '';
      updateSyncUI();
      renderAllUI();
      loadCitizen();
    } else {
      renderAllUI();
      refreshDataApps();
      maybeOpenCivil();
    }
  }

  async function handleCreateSubmit(e) {
    e.preventDefault();
    const form = e.target;
    if (!form || form.id !== 'citizenCreateForm') return;
    const app = LR();
    if (!app) return;
    const first = String(form.firstName.value || '').trim();
    const last = String(form.lastName.value || '').trim();
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

    if (!first || !last) return fail('Completá tu nombre y apellido.');
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
        json: { firstName: first, lastName: last, dob, sex, hair, eyes, heightCm, weightKg, address, city, zip },
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
      state.civilTab = 'dni';
      state.autoOpened = true;
      renderAllUI();
      refreshDataApps();
      openApp('civil', { tab: 'dni' });
      app.toast('✅ DNI creado. Tu identidad ya está lista en el Registro Civil.');
    } catch (err) {
      if (err.status === 401) {
        app.Auth.clear();
        showLock();
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
      state.civilTab = 'resumen';
      state.autoOpened = true;
      renderAllUI();
      refreshDataApps();
      openApp('civil', { tab: 'resumen' });
      app.toast('✅ DNI vinculado. ¡Bienvenido a tu panel!');
    } catch (err) {
      if (err.status === 401) {
        app.Auth.clear();
        showLock();
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
      state.civilTab = 'licencia';
      await loadCitizen({ silent: true, force: true });
      refreshApp('civil', true);
      app.toast('✅ Solicitud enviada. Un moderador la va a revisar en Discord.');
    } catch (err) {
      if (err.status === 401) {
        app.Auth.clear();
        showLock();
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
      state.civilTab = 'resumen';
      state.loaded = true;
      state.loading = false;
      if (unlinkTimer) clearTimeout(unlinkTimer);
      renderAllUI();
      refreshDataApps();
      openApp('civil', { tab: 'resumen' });
      app.toast('DNI desvinculado de tu cuenta.');
    } catch (err) {
      app.toast('❌ ' + (err.message || 'No se pudo desvincular el DNI.'));
    }
  }

  async function logout() {
    const app = LR();
    if (!app) return;
    try { await app.Auth.api('/auth/logout', { method: 'POST' }); } catch { /* cerramos igual */ }
    app.Auth.clear();
    resetSessionState();
    closeAllWindows();
    showLock();
    renderAllUI();
    app.toast('👋 Cerraste sesión.');
  }

  function downloadCitizenData() {
    const c = state.citizen;
    if (!c) {
      toast('Todavía no tenés un DNI vinculado para descargar.');
      return;
    }
    const user = currentUser() || {};
    const payload = {
      app: 'RLA OS',
      exportedAt: new Date().toISOString(),
      account: {
        username: user.username || '',
        displayName: user.displayName || '',
        robloxUsername: user.robloxUsername || '',
        role: user.role || 'Ciudadano',
      },
      citizen: c,
      license: licenseInfo(c),
    };
    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'RLA_Registro_' + String(c.dni || 'ciudadano').replace(/[^\w-]+/g, '_') + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast('📄 Descargaste una copia de tu expediente.');
    } catch {
      toast('No se pudo generar la descarga.');
    }
  }

  function printDni() {
    if (!state.citizen) {
      toast('Primero necesitás un DNI para imprimir.');
      return;
    }
    state.civilTab = 'dni';
    if (!windowMap.has('civil')) {
      openApp('civil', { tab: 'dni' });
      setTimeout(printDni, 350);
      return;
    }
    refreshApp('civil', true);
    document.body.classList.add('pc-print-dni');
    setTimeout(() => {
      try { window.print(); } catch { /* algunos navegadores lo bloquean */ }
      setTimeout(() => document.body.classList.remove('pc-print-dni'), 700);
    }, 180);
  }

  /* ============================================================
     11) ACCIONES DE APPS
     ============================================================ */

  function installApp(id) {
    if (!APPS[id]) return;
    if (isInstalled(id)) { openApp(id); return; }
    state.installed.push(id);
    saveInstalled();
    renderAllUI();
    refreshApp('store', true);
    toast('✅ ' + APPS[id].name + ' instalada. Ya está en tu escritorio.');
  }

  function uninstallApp(id) {
    if (CORE_APPS.includes(id)) {
      toast(APPS[id].name + ' es una aplicación del sistema y no se puede desinstalar.');
      return;
    }
    state.installed = state.installed.filter((x) => x !== id);
    saveInstalled();
    if (windowMap.has(id)) closeWindow(id);
    renderAllUI();
    refreshApp('store', true);
    toast('🗑️ ' + APPS[id].name + ' desinstalada.');
  }

  function setWallpaper(id) {
    if (!WALLPAPERS[id]) return;
    state.prefs.wallpaper = id;
    savePrefs();
    applyPrefs();
    refreshApp('settings', true);
    toast('Fondo actualizado: ' + WALLPAPERS[id].name + '.');
  }

  function setAccent(id) {
    const accent = ACCENTS.find((a) => a.id === id);
    if (!accent) return;
    state.prefs.accent = id;
    savePrefs();
    applyPrefs();
    refreshApp('settings', true);
    toast('Color de acento: ' + accent.name + '.');
  }

  function togglePref(key) {
    state.prefs[key] = !state.prefs[key];
    savePrefs();
    applyPrefs();
    refreshApp('settings', true);
  }

  function resetPrefs() {
    state.prefs = defaultPrefs();
    savePrefs();
    applyPrefs();
    refreshApp('settings', true);
    toast('Apariencia restablecida.');
  }

  function toggleSocialLike(postId) {
    const i = state.socialLikes.indexOf(postId);
    if (i >= 0) state.socialLikes.splice(i, 1);
    else state.socialLikes.push(postId);
    saveSocial();
    refreshApp('social', true);
  }

  function handleSocialPost(form) {
    const input = form.querySelector('[name="text"]');
    const text = String(input ? input.value : '').trim();
    if (!text) return;
    const user = currentUser() || {};
    state.socialPosts.unshift({
      id: 'user-' + Date.now(),
      name: user.displayName || user.username || 'Ciudadano',
      handle: '@' + (user.username || 'ciudadano'),
      initials: initials(user.displayName || user.username || 'Ciudadano'),
      tone: 'teal',
      badge: 'Ciudadano',
      time: 'Ahora',
      text,
      image: '',
      likes: 0,
      comments: 0,
      custom: true,
    });
    saveSocial();
    refreshApp('social', true);
    toast('Publicado en RLA Social.');
  }

  function handleWhatsappSend(form) {
    const chat = state.waChats.find((c) => c.id === state.waChat);
    if (!chat) return;
    const input = form.querySelector('[name="message"]');
    const text = String(input ? input.value : '').trim();
    if (!text) return;
    chat.messages.push({ from: 'me', text, time: nowTime() });
    if (input) input.value = '';
    refreshApp('whatsapp', true);
    mountWhatsappApp();
    const replies = {
      central: 'Central 911: recibido. Una unidad fue notificada y se dirige al sector.',
      soporte: 'RLA Soporte: gracias por escribir. Un moderador va a revisar tu caso.',
      lapd: 'LAPD Reclutamiento: tu mensaje fue recibido. Revisá RLA Work para completar la postulación.',
      store: 'RLA Store: tu pedido está en preparación. Te avisamos cuando esté listo.',
      familia: 'Familia: dale, nos vemos en la plaza en un rato.',
    };
    const chatId = chat.id;
    setTimeout(() => {
      const target = state.waChats.find((c) => c.id === chatId);
      if (!target) return;
      target.messages.push({ from: 'them', text: replies[chatId] || 'Mensaje recibido.', time: nowTime() });
      if (windowMap.has('whatsapp')) { refreshApp('whatsapp', true); mountWhatsappApp(); }
    }, 950);
  }

  function handleMlAdd(id) {
    const product = defaultMlProducts().find((p) => p.id === id);
    if (!product) return;
    const item = state.mlCart.find((x) => x.id === id);
    if (item) item.qty += 1;
    else state.mlCart.push({ id, qty: 1 });
    refreshApp('mercado', true);
    toast('🛒 ' + product.title + ' agregado al carrito.');
  }

  function handleMlRemove(id) {
    state.mlCart = state.mlCart.filter((x) => x.id !== id);
    refreshApp('mercado', true);
  }

  function handleWorkApply(id) {
    if (state.workApplied.includes(id)) {
      toast('Ya guardaste tu postulación para esta búsqueda.');
      return;
    }
    state.workApplied.push(id);
    saveWork();
    refreshApp('work', true);
    toast('Postulación guardada. Completala en Discord con el staff.');
  }

  function handleVpsRestart(id) {
    const server = state.vpsServers.find((s) => s.id === id);
    if (!server) return;
    server.status = 'restarting';
    state.vpsConsole.push('[INFO] ' + server.name + ' · reiniciando servicio…');
    refreshApp('vps', true);
    setTimeout(() => {
      server.status = 'online';
      server.cpu = 8 + Math.round(Math.random() * 24);
      server.ram = 24 + Math.round(Math.random() * 36);
      server.ping = 18 + Math.round(Math.random() * 52);
      state.vpsConsole.push('[OK] ' + server.name + ' · servicio reiniciado correctamente');
      if (state.vpsConsole.length > 30) state.vpsConsole = state.vpsConsole.slice(-30);
      if (windowMap.has('vps')) refreshApp('vps', true);
      toast(server.name + ' reiniciado.');
    }, 1300);
  }

  async function loadEnvStatus() {
    if (state.envLoading) return;
    state.envLoading = true;
    state.envError = '';
    refreshApp('entornos', true);
    const base = ((LR() && LR().apiBase) || CFG.apiBase || '').replace(/\/+$/, '');
    const started = performance.now();
    try {
      if (!base) throw new Error('No hay una API configurada.');
      const healthRes = await fetch(base + '/health', { cache: 'no-store' });
      const healthText = await healthRes.text();
      const latency = Math.max(1, Math.round(performance.now() - started));
      let status = null;
      let statusOk = false;
      try {
        const statusRes = await fetch(base + '/web/status', { cache: 'no-store' });
        statusOk = statusRes.ok;
        status = await statusRes.json();
      } catch { statusOk = false; }
      state.env = {
        healthOk: healthRes.ok && /ok/i.test(healthText),
        healthText: String(healthText || '').slice(0, 60),
        latency,
        status,
        statusOk,
        checkedAt: Date.now(),
      };
    } catch (err) {
      state.envError = err.message || 'No pude conectar con la API.';
      state.env = null;
    } finally {
      state.envLoading = false;
      refreshApp('entornos', true);
    }
  }

  function handlePcAction(btn, e) {
    const action = btn.getAttribute('data-pc-action');
    if (!action) return;
    if (e) e.preventDefault();
    const appId = btn.getAttribute('data-app');
    const tab = btn.getAttribute('data-tab');
    const msg = btn.getAttribute('data-message');

    if (action === 'open-register') {
      closeLauncher();
      const app = LR();
      if (app && app.openAuth) app.openAuth('register');
      return;
    }
    if (action === 'launcher-app') {
      closeLauncher();
      if (!appId || !APPS[appId]) return;
      if (isInstalled(appId)) openApp(appId);
      else {
        state.storeCategory = 'explorar';
        openApp('store');
        toast('Instalá ' + APPS[appId].name + ' desde RLA Store.');
      }
      return;
    }
    if (action === 'open-app') {
      if (!appId || !APPS[appId]) return;
      openApp(appId, { tab, settingsTab: btn.getAttribute('data-settings-tab'), folder: btn.getAttribute('data-folder') });
      return;
    }
    if (action === 'open-url') {
      const url = safeUrl(btn.getAttribute('data-url'));
      if (url) window.open(url, '_blank', 'noopener');
      return;
    }
    if (action === 'toast') {
      toast(msg || 'Función disponible próximamente.');
      return;
    }
    if (action === 'refresh') {
      loadCitizen({ force: true });
      return;
    }
    if (action === 'download-citizen') { downloadCitizenData(); return; }
    if (action === 'print-dni') { printDni(); return; }
    if (action === 'set-wallpaper') { setWallpaper(btn.getAttribute('data-wallpaper')); return; }
    if (action === 'set-accent') { setAccent(btn.getAttribute('data-accent')); return; }
    if (action === 'toggle-pref') { togglePref(btn.getAttribute('data-pref')); return; }
    if (action === 'reset-prefs') { resetPrefs(); return; }
    if (action === 'settings-tab') {
      state.settingsTab = btn.getAttribute('data-settings-tab') || 'cuenta';
      refreshApp('settings', true);
      return;
    }
    if (action === 'store-category') {
      state.storeCategory = btn.getAttribute('data-category') || 'todas';
      refreshApp('store', true);
      return;
    }
    if (action === 'store-install') { installApp(btn.getAttribute('data-store-app')); return; }
    if (action === 'store-uninstall') { uninstallApp(btn.getAttribute('data-store-app')); return; }
    if (action === 'store-open') { openApp(btn.getAttribute('data-store-app')); return; }
    if (action === 'env-refresh') { loadEnvStatus(); return; }
    if (action === 'files-folder') {
      state.filesFolder = btn.getAttribute('data-folder') || 'todos';
      state.filesSelected = '';
      refreshApp('files', true);
      return;
    }
    if (action === 'file-select') {
      state.filesSelected = btn.getAttribute('data-file') || '';
      refreshApp('files', true);
      return;
    }
    if (action === 'file-open') {
      openFileById(btn.getAttribute('data-file'));
      return;
    }
    if (action === 'social-like') { toggleSocialLike(btn.getAttribute('data-post')); return; }
    if (action === 'wa-chat') {
      state.waChat = btn.getAttribute('data-chat') || '';
      refreshApp('whatsapp', true);
      return;
    }
    if (action === 'wa-back') {
      state.waChat = '';
      refreshApp('whatsapp', true);
      return;
    }
    if (action === 'ml-cat') {
      state.mlCategory = btn.getAttribute('data-category') || 'todas';
      state.mlQuery = '';
      refreshApp('mercado', true);
      return;
    }
    if (action === 'ml-add') { handleMlAdd(btn.getAttribute('data-product')); return; }
    if (action === 'ml-remove') { handleMlRemove(btn.getAttribute('data-product')); return; }
    if (action === 'ml-cart') {
      state.mlCartOpen = !state.mlCartOpen;
      refreshApp('mercado', true);
      return;
    }
    if (action === 'ml-checkout') {
      if (!state.mlCart.length) { toast('Tu carrito está vacío.'); return; }
      state.mlCart = [];
      state.mlCartOpen = false;
      refreshApp('mercado', true);
      toast('✅ Compra simulada completada. ¡Gracias por comprar en MercadoLibre!');
      return;
    }
    if (action === 'work-cat') {
      state.workCategory = btn.getAttribute('data-category') || 'todas';
      refreshApp('work', true);
      return;
    }
    if (action === 'work-apply') { handleWorkApply(btn.getAttribute('data-job')); return; }
    if (action === 'crypto-toast') { toast(msg || 'Función disponible próximamente.'); return; }
    if (action === 'onion-site') {
      state.onionSite = btn.getAttribute('data-site') || 'home';
      state.onionError = '';
      refreshApp('onion', true);
      return;
    }
    if (action === 'onion-back') {
      state.onionSite = 'home';
      state.onionError = '';
      refreshApp('onion', true);
      return;
    }
    if (action === 'vps-restart') { handleVpsRestart(btn.getAttribute('data-server')); return; }
    if (action === 'show-desktop') { minimizeAllWindows(); return; }
    if (action === 'minimize-all') { minimizeAllWindows(); closeLauncher(); return; }
    if (action === 'open-settings-appearance') {
      state.settingsTab = 'apariencia';
      openApp('settings');
      return;
    }
    if (action === 'bank-tab') {
      toast('Esa sección de Bank of America estará disponible próximamente.');
      return;
    }
  }

  function handleCivilAction(btn, e) {
    const action = btn.getAttribute('data-action');
    if (!action) return;
    if (e) e.preventDefault();
    if (action === 'refresh') { loadCitizen({ force: true }); return; }
    if (action === 'go-tab') { setCivilTab(btn.getAttribute('data-tab')); return; }
    if (action === 'print') { printDni(); return; }
    if (action === 'logout') { logout(); return; }
    if (action === 'unlink') {
      state.unlinkConfirm = true;
      refreshApp('civil', true);
      refreshApp('settings', true);
      if (unlinkTimer) clearTimeout(unlinkTimer);
      unlinkTimer = setTimeout(() => {
        state.unlinkConfirm = false;
        refreshApp('civil', true);
        refreshApp('settings', true);
      }, 8000);
      return;
    }
    if (action === 'unlink-cancel') {
      state.unlinkConfirm = false;
      if (unlinkTimer) clearTimeout(unlinkTimer);
      refreshApp('civil', true);
      refreshApp('settings', true);
      return;
    }
    if (action === 'unlink-confirm') { unlinkCitizen(); return; }
    if (action === 'relink') { unlinkCitizen(); return; }
    if (action === 'license-start') {
      state.licenseFormOpen = true;
      state.civilTab = 'licencia';
      refreshApp('civil', true);
      setTimeout(() => {
        const first = $('#licenseApplyForm select');
        if (first) first.focus();
      }, 60);
      return;
    }
    if (action === 'license-cancel') {
      state.licenseFormOpen = false;
      refreshApp('civil', true);
      return;
    }
  }

  function openFileById(id) {
    const files = buildFiles();
    const file = files.find((f) => f.id === id);
    if (!file) return;
    if (file.app === 'civil') openApp('civil', { tab: file.tab });
    else if (file.app === 'settings') openApp('settings', { settingsTab: file.tab || 'cuenta' });
    else if (file.app === 'external') {
      const url = safeUrl(file.url);
      if (url) window.open(url, '_blank', 'noopener');
    } else if (file.action === 'download') {
      downloadCitizenData();
    }
  }

  /* ============================================================
     12) EVENTOS
     ============================================================ */

  function onDocumentClick(e) {
    const contextBtn = e.target.closest('[data-context-index]');
    if (contextBtn) {
      const index = Number(contextBtn.getAttribute('data-context-index'));
      const item = contextItems[index];
      closeContextMenu();
      if (item && typeof item.onSelect === 'function') item.onSelect();
      return;
    }

    const taskBtn = e.target.closest('[data-task-id]');
    if (taskBtn) {
      const id = taskBtn.getAttribute('data-task-id');
      const win = windowMap.get(id);
      if (win) {
        if (win.minimized) restoreWindow(id);
        else if (activeWindowId === id) minimizeWindow(id);
        else focusWindow(id);
      }
      closeLauncher();
      return;
    }

    const desktopBtn = e.target.closest('[data-desktop-app]');
    if (desktopBtn) {
      // El clic y el doble clic se manejan en #pcIcons.
      return;
    }

    const pcBtn = e.target.closest('[data-pc-action]');
    if (pcBtn) {
      handlePcAction(pcBtn, e);
      return;
    }

    const civilTab = e.target.closest('[data-civil-tab]');
    if (civilTab) {
      setCivilTab(civilTab.getAttribute('data-civil-tab'));
      return;
    }

    const settingsTab = e.target.closest('[data-settings-tab]');
    if (settingsTab) {
      state.settingsTab = settingsTab.getAttribute('data-settings-tab');
      refreshApp('settings', true);
      return;
    }

    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
      handleCivilAction(actionBtn, e);
      return;
    }

    if (!e.target.closest('#pcLauncher, #pcStart, #pcSearchBtn')) closeLauncher();
    if (!e.target.closest('#pcContext') && contextOpen) closeContextMenu();
    if (e.target.closest('#pcDesktop') && !e.target.closest('.pc-window, .pc-icons, .pc-desktop-hint')) {
      selectDesktopIcon(null);
    }
  }

  function onDocumentSubmit(e) {
    const form = e.target;
    if (!form || !form.id) return;
    if (form.id === 'citizenCreateForm') { handleCreateSubmit(e); return; }
    if (form.id === 'citizenLinkForm') { handleLinkSubmit(e); return; }
    if (form.id === 'licenseApplyForm') { handleLicenseSubmit(e); return; }
    if (form.id === 'googleForm') {
      e.preventDefault();
      const input = form.querySelector('[name="q"]');
      state.googleQuery = String(input ? input.value : '').trim();
      refreshApp('google', true);
      return;
    }
    if (form.id === 'socialComposeForm') {
      e.preventDefault();
      handleSocialPost(form);
      return;
    }
    if (form.id === 'waForm') {
      e.preventDefault();
      handleWhatsappSend(form);
      return;
    }
    if (form.id === 'mlForm') {
      e.preventDefault();
      const input = form.querySelector('[name="q"]');
      state.mlQuery = String(input ? input.value : '').trim();
      state.mlCategory = 'todas';
      refreshApp('mercado', true);
      return;
    }
    if (form.id === 'storeSearchForm') {
      e.preventDefault();
      filterStoreCards();
      return;
    }
    if (form.id === 'workForm') {
      e.preventDefault();
      const input = form.querySelector('[name="q"]');
      state.workQuery = String(input ? input.value : '').trim();
      state.workCategory = 'todas';
      refreshApp('work', true);
      return;
    }
    if (form.id === 'onionForm') {
      e.preventDefault();
      const input = form.querySelector('[name="url"]');
      const value = norm(input ? input.value : '');
      const key = Object.keys(ONION_SITES).find((k) => k === value || norm(ONION_SITES[k].title) === value || ('onion://' + k) === value);
      if (key) {
        state.onionSite = key;
        state.onionError = '';
        state.onionQuery = String(input ? input.value : '');
      } else {
        state.onionSite = 'home';
        state.onionError = 'No se pudo resolver “' + String(input ? input.value : '').trim() + '” en la red Onion (demo).';
      }
      refreshApp('onion', true);
    }
  }

  function onDocumentInput(e) {
    const target = e.target;
    if (target && target.name === 'dob' && target.closest('#citizenCreateForm')) {
      const age = ageFromDob(target.value);
      const out = $('#citizenAge');
      if (out) out.textContent = age === null ? '—' : String(age);
    }
    if (target && target.id === 'pcLauncherSearch') filterLauncher();
    if (target && target.id === 'storeSearch') filterStoreCards();
    if (target && target.id === 'filesSearch') filterFiles();
  }

  function onDocumentDblClick(e) {
    const icon = e.target.closest('[data-desktop-app]');
    if (icon) {
      openApp(icon.getAttribute('data-desktop-app'));
      return;
    }
    const file = e.target.closest('[data-file-id]');
    if (file) {
      openFileById(file.getAttribute('data-file-id'));
    }
  }

  function onDocumentKeyDown(e) {
    if (e.key === 'Escape') {
      const launcher = $('#pcLauncher');
      const ctx = $('#pcContext');
      if (ctx && !ctx.hidden) { closeContextMenu(); e.preventDefault(); return; }
      if (launcher && !launcher.hidden) { closeLauncher(); e.preventDefault(); return; }
      const active = document.activeElement;
      if (active && active.closest('input, textarea, select')) active.blur();
    }
  }

  function setupDesktopEvents() {
    const icons = $('#pcIcons');
    if (icons) {
      icons.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-desktop-app]');
        if (!btn) return;
        selectDesktopIcon(btn);
        if (e.detail === 0 || isCoarse()) openApp(btn.getAttribute('data-desktop-app'));
      });
      icons.addEventListener('dblclick', (e) => {
        const btn = e.target.closest('[data-desktop-app]');
        if (btn) openApp(btn.getAttribute('data-desktop-app'));
      });
    }

    const start = $('#pcStart');
    if (start) {
      start.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleLauncher();
      });
    }

    const search = $('#pcSearchBtn');
    if (search) {
      search.addEventListener('click', (e) => {
        e.stopPropagation();
        openLauncher();
        setTimeout(() => {
          const input = $('#pcLauncherSearch');
          if (input) input.focus();
        }, 60);
      });
    }

    const showDesktop = $('#pcShowDesktop');
    if (showDesktop) {
      showDesktop.addEventListener('click', (e) => {
        e.stopPropagation();
        minimizeAllWindows();
        closeLauncher();
      });
    }

    const desktop = $('#pcDesktop');
    if (desktop) {
      desktop.addEventListener('contextmenu', (e) => {
        if (e.target.closest('.pc-window, .pc-icons, .pc-taskbar, .pc-topbar, .pc-launcher, .pc-desktop-hint')) return;
        e.preventDefault();
        showDesktopMenu(e);
      });
    }

    const tasks = $('#pcTasks');
    if (tasks) {
      tasks.addEventListener('contextmenu', (e) => {
        const btn = e.target.closest('[data-task-id]');
        if (!btn) return;
        e.preventDefault();
        showTaskMenu(e, btn.getAttribute('data-task-id'));
      });
    }

    const launcher = $('#pcLauncher');
    if (launcher) {
      launcher.addEventListener('input', (e) => {
        if (e.target && e.target.id === 'pcLauncherSearch') filterLauncher();
      });
    }
  }

  function setupEvents() {
    document.addEventListener('click', onDocumentClick);
    document.addEventListener('submit', onDocumentSubmit);
    document.addEventListener('input', onDocumentInput);
    document.addEventListener('dblclick', onDocumentDblClick);
    document.addEventListener('keydown', onDocumentKeyDown);
    document.addEventListener('lr:auth', (e) => {
      handleAuth(e.detail && e.detail.user);
    });

    setupDesktopEvents();

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        clampAllWindows();
        if (!isMobile()) {
          const launcher = $('#pcLauncher');
          if (launcher && !launcher.hidden) renderLauncher();
        }
      }, 120);
    });

    document.addEventListener('visibilitychange', () => {
      const app = LR();
      if (document.hidden || !app || !app.Auth.user || !state.linked) return;
      const age = Date.now() - Number(state.cadUpdatedAt || 0);
      if (age > 45000) loadCitizen({ silent: true });
    });

    liveTimer = setInterval(() => {
      if (!document.hidden) {
        updateSyncUI();
        tickClock();
      }
    }, 30000);

    pollTimer = setInterval(() => {
      const app = LR();
      if (!document.hidden && app && app.Auth.user && state.linked) loadCitizen({ silent: true });
    }, 60000);

    window.addEventListener('beforeunload', () => {
      if (liveTimer) clearInterval(liveTimer);
      if (pollTimer) clearInterval(pollTimer);
      if (clockTimer) clearInterval(clockTimer);
      if (unlinkTimer) clearTimeout(unlinkTimer);
    });
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

  function renderAllUI() {
    renderDesktopIcons();
    updateUserUI();
    updateSyncUI();
    updateTaskbar();
    const launcher = $('#pcLauncher');
    if (launcher && !launcher.hidden) renderLauncher();
  }

  /* ============================================================
     13) ARRANQUE
     ============================================================ */

  document.addEventListener('DOMContentLoaded', async () => {
    hydrateLocalState();
    applyPrefs();
    startClock();
    showLock();
    setupIntro();
    setupEvents();

    const app = LR();
    if (!app) {
      updateSyncUI();
      return;
    }

    try {
      if (app.Auth.ready) await app.Auth.ready;
    } catch { /* seguimos con el estado local */ }

    const fromHash = String(location.hash || '').replace(/^#/, '');
    if (TABS.includes(fromHash)) state.civilTab = fromHash;

    handleAuth(app.Auth.user);
    renderAllUI();
    document.body.classList.add('pc-ready');
  });

  /* ============================================================
     14) API DE DEPURACIÓN / INTEGRACIÓN
     ============================================================ */

  window.RLAOS = {
    version: '1.0.0',
    openApp,
    closeApp: closeWindow,
    focusApp: focusWindow,
    setCivilTab,
    refresh: () => loadCitizen({ force: true }),
    toast,
    apps: APPS,
    getState: () => ({
      user: state.user,
      linked: state.linked,
      waiting: state.waiting,
      missing: state.missing,
      citizen: state.citizen,
      loading: state.loading,
      loaded: state.loaded,
      error: state.error,
      cadUpdatedAt: state.cadUpdatedAt,
      civilTab: state.civilTab,
      installed: state.installed.slice(),
      windows: Array.from(windowMap.keys()),
      activeWindow: activeWindowId,
      prefs: Object.assign({}, state.prefs),
    }),
  };

  /* ============================================================
     15) RENDERERS DE APPS
     ============================================================ */


  /* ============================================================
     16) REGISTRO CIVIL
     ============================================================ */

  function renderCivilApp() {
    const c = state.citizen;
    let body = '';
    if (state.loading && !state.loaded) {
      body = renderLoading();
    } else if (state.error && !c) {
      body = renderError(state.error);
    } else if (!state.linked) {
      body = renderLinkOnboarding();
    } else if (state.waiting) {
      body = renderWaiting();
    } else if (state.missing) {
      body = renderMissing();
    } else if (!c) {
      body = renderError('No pude encontrar tu expediente en el CAD.');
    } else {
      const tab = TABS.includes(state.civilTab) ? state.civilTab : 'resumen';
      if (tab === 'dni') body = renderDni(c);
      else if (tab === 'licencia') body = renderLicense(c);
      else if (tab === 'vehiculos') body = renderVehicles(c);
      else if (tab === 'multas') body = renderFines(c);
      else if (tab === 'ordenes') body = renderWarrants(c);
      else if (tab === 'antecedentes') body = renderAntecedents(c);
      else body = renderOverview(c);
    }

    const showTabs = !!(state.linked && c && !state.waiting && !state.missing);
    return '<div class="pc-civil">' +
      renderCivilTop(c) +
      (showTabs ? renderCivilTabs(c) : '') +
      '<div class="pc-civil-scroll pc-app-scroll" data-civil-scroll>' + body + '</div>' +
    '</div>';
  }

  function renderCivilTop(c) {
    const user = currentUser() || {};
    const info = c ? licenseInfo(c) : null;
    const sync = syncInfo();
    const title = c ? c.name : (user.displayName || user.username || 'Ciudadano');
    const sub = c
      ? 'DNI ' + c.dni + ' · ' + ageText(c) + ' · ' + (c.city || 'Los Angeles') + ', CA'
      : (state.linked ? 'Expediente no disponible' : 'Vinculá tu DNI para comenzar');
    const chips = [];
    if (c) {
      chips.push(pcChip('DNI ' + c.dni, 'ok'));
      chips.push(pcChip(info.label || 'Sin licencia', licenseTone(info.label)));
      if (c.totals && c.totals.warrants > 0) chips.push(pcChip(c.totals.warrants + ' orden' + (c.totals.warrants === 1 ? ' activa' : 'es activas'), 'red'));
      if (c.totals && c.totals.fines > 0) chips.push(pcChip(c.totals.fines + ' multa' + (c.totals.fines === 1 ? ' pendiente' : 's pendientes'), 'gold'));
    } else {
      chips.push(pcChip(user.role || 'Ciudadano', 'role'));
      chips.push(pcChip(state.linked ? 'Sin expediente' : 'Sin DNI', 'neutral'));
    }
    if (state.error) chips.push(pcChip('Sin conexión', 'red'));

    return '<div class="pc-civil-top">' +
      '<div class="pc-civil-ident">' +
        pcAvatar('pc-civil-avatar') +
        '<div class="pc-civil-ident-text">' +
          '<span class="pc-civil-kicker">Registro Civil · Los Angeles County</span>' +
          '<b>' + esc(title) + '</b>' +
          '<small>' + esc(sub) + '</small>' +
          '<div class="pc-civil-chips">' + chips.join('') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="pc-civil-top-actions">' +
        '<span class="pc-civil-sync"><i class="pc-sync-dot ' + sync.tone + '"></i>' + esc(sync.text) + '</span>' +
        '<button class="pc-icon-btn" type="button" data-action="refresh" title="Actualizar datos" aria-label="Actualizar datos">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>' +
        '</button>' +
        (c ? '<button class="pc-icon-btn" type="button" data-action="print" title="Imprimir DNI" aria-label="Imprimir DNI">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7"/></svg>' +
        '</button>' : '') +
      '</div>' +
    '</div>';
  }

  function renderCivilTabs(c) {
    const counts = {
      multas: (c.totals && c.totals.fines) || 0,
      ordenes: (c.totals && c.totals.warrants) || 0,
    };
    return '<nav class="pc-civil-tabs" role="tablist" aria-label="Secciones de Registro Civil">' +
      CIVIL_TABS.map((tab) => {
        const on = state.civilTab === tab.id;
        return '<button type="button" role="tab" aria-selected="' + (on ? 'true' : 'false') + '" class="' + (on ? 'is-on' : '') + '" data-civil-tab="' + tab.id + '">' +
          '<span>' + esc(tab.label) + '</span>' +
          (counts[tab.id] ? '<i>' + counts[tab.id] + '</i>' : '') +
        '</button>';
      }).join('') +
    '</nav>';
  }

  function renderOverview(c) {
    const info = licenseInfo(c);
    const license = licenseTone(info.label);
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
      const pending = info.status === 'pending';
      alerts.push(banner(license, pending ? 'Licencia en revisión' : 'Licencia ' + info.label,
        pending
          ? 'Un moderador está revisando tu solicitud en Discord. Te avisamos cuando responda.'
          : license === 'red'
            ? 'No manejes hasta regularizar tu situación. Podés volver a solicitar desde la pestaña Licencia.'
            : 'Evitá conducir hasta que se resuelva.',
        '<button class="btn btn-ghost btn-sm" type="button" data-action="go-tab" data-tab="licencia">Ver licencia</button>'));
    }

    const recentFines = (c.fines || []).slice(0, 3);
    const recentVehicles = (c.vehicles || []).slice(0, 2);
    const cta911 = safeUrl(CFG.central911 || '');

    return '<div class="citizen-section-head">' +
        '<div><span class="eyebrow">Resumen</span><h2>Hola, ' + esc(firstName(c.name)) + '</h2>' +
        '<p>Este es el estado de tu personaje en el CAD de Los Angeles.</p></div>' +
        '<button class="citizen-icon-btn" type="button" data-action="refresh" title="Actualizar datos" aria-label="Actualizar datos">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>' +
        '</button>' +
      '</div>' +
      alerts.join('') +
      '<article class="citizen-identity">' +
        '<div class="citizen-identity-photo">' + avatarMarkup('citizen-identity-avatar') + '</div>' +
        '<div class="citizen-identity-info">' +
          chip('Ciudadano verificado', 'ok') +
          '<h3>' + esc(c.name) + '</h3>' +
          '<p>DNI <b class="citizen-mono">' + esc(c.dni) + '</b><span class="citizen-dot-sep">·</span><b>' + esc(ageText(c)) + '</b><span class="citizen-dot-sep">·</span>Licencia <b>' + esc(info.label || 'Sin licencia') + '</b>' + (c.license ? ' · Nº ' + esc(c.license) : '') + '</p>' +
          '<div class="citizen-identity-meta">' +
            '<span>@' + esc((currentUser() && currentUser().username) || 'ciudadano') + '</span>' +
            '<span>Miembro desde ' + dateFmt(currentUser() && currentUser().createdAt) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="citizen-identity-actions">' +
          '<button class="btn btn-primary btn-sm" type="button" data-action="go-tab" data-tab="dni">Ver mi DNI</button>' +
          '<button class="btn btn-ghost btn-sm" type="button" data-pc-action="open-app" data-app="settings">Ajustes</button>' +
        '</div>' +
      '</article>' +
      '<div class="citizen-stats">' +
        statCard('DNI', c.dni, ageText(c) + ' · Identidad vinculada', 'accent') +
        statCard('Licencia', info.label || 'Sin licencia', c.license ? 'Nº ' + c.license : (info.status === 'pending' ? 'Solicitud en revisión' : 'Se solicita desde el panel'), license) +
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
        (cta911
          ? '<a class="btn btn-primary" href="' + esc(cta911) + '" target="_blank" rel="noopener">Llamar al 911</a>'
          : '<button class="btn btn-primary" type="button" data-pc-action="toast" data-message="La central 911 no está configurada.">Llamar al 911</button>') +
      '</article>';
  }

  function renderDni(c) {
    const address = [c.address, c.city, [c.state, c.zip].filter(Boolean).join(' ')]
      .filter(Boolean).join(', ') || '—';
    const height = c.heightCm ? heightImperial(c.heightCm) + ' (' + c.heightCm + ' cm)' : '—';
    const weight = c.weightKg ? weightPounds(c.weightKg) + ' (' + c.weightKg + ' kg)' : '—';
    return '<div class="citizen-section-head">' +
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
          '<div class="citizen-card-head"><div><span class="eyebrow">Notas</span><h3>Antecedentes</h3></div>' +
          '<button class="citizen-text-btn" type="button" data-action="go-tab" data-tab="antecedentes">Ver todo</button></div>' +
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
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><circle cx="8.5" cy="11" r="2.2"/><path d="M5.5 16c.6-1.6 1.7-2.3 3-2.3s2.4.7 3 2.3M14 10h4M14 13h4M14 16h2.5"/></svg>' +
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

    return '<div class="citizen-section-head">' +
        '<div><span class="eyebrow">Licencia</span><h2>Licencia de conducir</h2>' +
        '<p>Solicitud y emisión gestionadas desde el panel, con revisión de moderadores en Discord.</p></div>' +
      '</div>' +
      statusCard +
      action +
      (state.licenseFormOpen && canApply ? renderLicenseApplicationForm() : '') +
      extra;
  }

  function renderVehicles(c) {
    const vehicles = c.vehicles || [];
    if (!vehicles.length) {
      return '<div class="citizen-section-head"><div><span class="eyebrow">Vehículos</span><h2>Tu garage</h2>' +
        '<p>No tenés vehículos a tu nombre en el CAD.</p></div></div>' +
        emptyState('Sin vehículos', 'Cuando registres un vehículo con el staff, va a aparecer acá.');
    }
    return '<div class="citizen-section-head">' +
        '<div><span class="eyebrow">Vehículos</span><h2>Tu garage</h2>' +
        '<p>' + vehicles.length + ' vehículo' + (vehicles.length === 1 ? '' : 's') + ' registrado' + (vehicles.length === 1 ? '' : 's') + ' a tu nombre.</p></div>' +
      '</div>' +
      '<div class="citizen-vehicles">' +
        vehicles.map((v) => {
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
    const fines = c.fines || [];
    const pending = fines.filter((f) => norm(f.status) !== 'pagada');
    const total = pending.reduce((sum, f) => sum + f.amount, 0);
    return '<div class="citizen-section-head">' +
        '<div><span class="eyebrow">Multas</span><h2>Tus multas</h2>' +
        '<p>' + (pending.length ? 'Tenés ' + pending.length + ' multa' + (pending.length === 1 ? '' : 's') + ' pendiente' + (pending.length === 1 ? '' : 's') + '.' : 'No tenés multas pendientes.') + '</p></div>' +
        '<div class="citizen-total"><small>Total pendiente</small><b>' + money(total) + '</b></div>' +
      '</div>' +
      (fines.length ? '<div class="citizen-items">' + fines.map((f) => {
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
    const warrants = c.warrants || [];
    const active = warrants.filter((w) => norm(w.status) === 'activa');
    const history = warrants.filter((w) => norm(w.status) !== 'activa');
    return '<div class="citizen-section-head">' +
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

  function renderAntecedents(c) {
    const info = licenseInfo(c);
    const fines = c.fines || [];
    const warrants = c.warrants || [];
    const timeline = [];
    fines.forEach((f) => timeline.push({
      ts: f.ts,
      kind: 'Multa',
      title: f.reason || 'Multa',
      detail: (f.officer ? 'Oficial ' + f.officer : 'Oficial') + ' · ' + money(f.amount),
      status: f.status || 'pendiente',
      tone: norm(f.status) === 'pagada' ? 'ok' : 'gold',
      icon: '$',
    }));
    warrants.forEach((w) => timeline.push({
      ts: w.ts,
      kind: 'Orden',
      title: (w.wkind || 'Orden') + ' · ' + (w.reason || 'Sin motivo'),
      detail: w.officer ? 'Oficial ' + w.officer : 'Oficial',
      status: w.status || 'activa',
      tone: recordTone(w.status),
      icon: '!',
    }));
    timeline.sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
    const pendingTotal = fines.filter((f) => norm(f.status) !== 'pagada').reduce((sum, f) => sum + f.amount, 0);

    return '<div class="citizen-section-head">' +
        '<div><span class="eyebrow">Expediente</span><h2>Antecedentes</h2>' +
        '<p>Todos tus registros del CAD juntos: notas, multas, órdenes y licencia.</p></div>' +
        '<button class="btn btn-ghost btn-sm" type="button" data-pc-action="download-citizen">Descargar expediente</button>' +
      '</div>' +
      '<div class="citizen-stats">' +
        statCard('Multas', fines.length, pendingTotal ? money(pendingTotal) + ' pendiente' : 'Sin deudas', pendingTotal ? 'gold' : 'ok') +
        statCard('Órdenes', warrants.length, warrants.filter((w) => norm(w.status) === 'activa').length ? 'Hay órdenes activas' : 'Sin órdenes activas', warrants.some((w) => norm(w.status) === 'activa') ? 'red' : 'ok') +
        statCard('Licencia', info.label || 'Sin licencia', info.number ? 'Nº ' + info.number : (info.status === 'pending' ? 'En revisión' : 'Sin emitir'), licenseTone(info.label)) +
        statCard('Vehículos', (c.vehicles || []).length, 'Registrados a tu nombre', 'neutral') +
      '</div>' +
      '<article class="citizen-card">' +
        '<div class="citizen-card-head"><div><span class="eyebrow">Notas del CAD</span><h3>Observaciones y antecedentes</h3></div></div>' +
        '<p class="citizen-notes">' + esc(c.notes || 'Sin notas ni antecedentes registrados.') + '</p>' +
        '<p class="citizen-fine">Estas notas las carga el staff en el CAD. Si encontrás un error, abrí un ticket en Discord.</p>' +
      '</article>' +
      '<article class="citizen-card">' +
        '<div class="citizen-card-head"><div><span class="eyebrow">Historial</span><h3>Multas y órdenes</h3></div>' +
        '<span class="pc-chip neutral">' + timeline.length + ' registro' + (timeline.length === 1 ? '' : 's') + '</span></div>' +
        (timeline.length ? '<div class="citizen-items">' + timeline.map((item) =>
          '<article class="citizen-item ' + item.tone + '">' +
            '<span class="citizen-item-ico">' + item.icon + '</span>' +
            '<div class="citizen-item-main">' +
              '<div class="citizen-item-head"><b>' + esc(item.kind + ' · ' + item.title) + '</b>' + chip(item.status, item.tone) + '</div>' +
              '<small>' + dateFmt(item.ts) + ' · ' + esc(item.detail) + '</small>' +
            '</div>' +
          '</article>').join('') + '</div>'
          : emptyState('Sin antecedentes', 'No tenés multas ni órdenes registradas en el CAD.')) +
      '</article>' +
      '<div class="citizen-grid-2">' +
        '<article class="citizen-card">' +
          '<div class="citizen-card-head"><div><span class="eyebrow">Licencia</span><h3>Historial de licencia</h3></div></div>' +
          '<div class="citizen-rows">' +
            '<div><span>Estado</span><b>' + esc(info.label || 'Sin licencia') + '</b></div>' +
            '<div><span>Número</span><b class="citizen-mono">' + esc(info.number || '—') + '</b></div>' +
            '<div><span>Solicitada</span><b>' + dateFmt(info.submittedAt) + '</b></div>' +
            '<div><span>Revisada</span><b>' + dateFmt(info.reviewedAt) + '</b></div>' +
            '<div><span>Revisada por</span><b>' + esc(info.reviewedBy || '—') + '</b></div>' +
            '<div><span>Vence</span><b>' + dateFmt(info.expiresAt) + '</b></div>' +
          '</div>' +
        '</article>' +
        '<article class="citizen-card">' +
          '<div class="citizen-card-head"><div><span class="eyebrow">Documento</span><h3>Datos personales</h3></div></div>' +
          '<div class="citizen-rows">' +
            '<div><span>Nombre</span><b>' + esc(c.name) + '</b></div>' +
            '<div><span>DNI</span><b class="citizen-mono">' + esc(c.dni) + '</b></div>' +
            '<div><span>Nacimiento</span><b>' + esc(dobFmt(c.dob)) + ' · ' + esc(ageText(c)) + '</b></div>' +
            '<div><span>Dirección</span><b>' + esc([c.address, c.city, c.state, c.zip].filter(Boolean).join(', ')) + '</b></div>' +
            '<div><span>Licencia</span><b>' + esc(info.number || info.label || 'Sin licencia') + '</b></div>' +
          '</div>' +
        '</article>' +
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
      '<span class="eyebrow">Registro Civil</span>' +
      '<h2>No pude cargar tus datos</h2>' +
      '<p>' + esc(message || 'Probá de nuevo en unos segundos.') + '</p>' +
      '<div class="citizen-actions">' +
        '<button class="btn btn-primary" type="button" data-action="refresh">Reintentar</button>' +
        '<button class="btn btn-ghost" type="button" data-action="logout">Cerrar sesión</button>' +
      '</div>' +
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
        '<button class="btn btn-ghost" type="button" data-pc-action="open-app" data-app="settings">Gestionar vínculo</button>' +
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

  function renderLinkOnboarding() {
    const user = currentUser() || {};
    return '<div class="citizen-section-head">' +
        '<div><span class="eyebrow">Primer paso</span><h2>Creá tu identidad</h2>' +
        '<p>Podés generar tu DNI desde la web o vincular uno que ya exista en el CAD.</p></div>' +
      '</div>' +
      '<div class="citizen-form-head citizen-onboard-account">' + avatarMarkup('citizen-form-avatar') +
        '<div><b>' + esc(user.displayName || user.username || 'Ciudadano') + '</b><span>@' + esc(user.username || 'cuenta') +
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
              '<input name="dni" inputmode="text" autocomplete="off" placeholder="Ej: C1234567" required>' +
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


  /* ============================================================
     17) PERFIL
     ============================================================ */

  function renderProfileApp() {
    const user = currentUser() || {};
    const c = state.citizen;
    const info = c ? licenseInfo(c) : null;
    const name = user.displayName || user.username || 'Ciudadano';
    const role = user.role || 'Ciudadano';
    const dni = (c && c.dni) || user.dni || '';
    const badges = [
      pcChip('Cuenta verificada', 'ok'),
      pcChip(role, 'role'),
      pcChip('Los Angeles, CA', 'neutral'),
    ];

    return '<div class="pc-profile pc-app-scroll">' +
      '<div class="pc-profile-cover" style="background-image:url(\'assets/erlc-hero-lapd.jpg\')">' +
        '<span class="pc-profile-cover-tag">RLA OS · Perfil de ciudadano</span>' +
        '<button class="pc-profile-cover-btn" type="button" data-pc-action="open-app" data-app="settings" title="Ajustes">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="pc-profile-inner">' +
        '<div class="pc-profile-head">' +
          pcAvatar('pc-profile-avatar') +
          '<div class="pc-profile-title">' +
            '<h2>' + esc(name) + '</h2>' +
            '<p>@' + esc(user.username || 'ciudadano') + ' · ' + esc(role) + '</p>' +
            '<div class="pc-profile-badges">' + badges.join('') + '</div>' +
          '</div>' +
          '<div class="pc-profile-actions">' +
            (c
              ? '<button class="pc-btn pc-btn-primary" type="button" data-pc-action="open-app" data-app="civil" data-tab="dni">Abrir mi DNI</button>'
              : '<button class="pc-btn pc-btn-primary" type="button" data-pc-action="open-app" data-app="civil">Vincular mi DNI</button>') +
            '<button class="pc-btn pc-btn-ghost" type="button" data-pc-action="open-app" data-app="settings">Ajustes</button>' +
          '</div>' +
        '</div>' +
        '<div class="pc-profile-stats">' +
          '<div><span>DNI</span><b class="citizen-mono">' + esc(dni || '—') + '</b><small>' + (c ? 'Identidad vinculada' : 'Sin vincular') + '</small></div>' +
          '<div><span>Licencia</span><b>' + esc(info ? (info.label || 'Sin licencia') : 'Sin licencia') + '</b><small>' + esc(info && info.number ? 'Nº ' + info.number : 'Gestionada desde el panel') + '</small></div>' +
          '<div><span>Multas</span><b>' + esc(c && c.totals ? c.totals.fines : 0) + '</b><small>' + esc(c && c.totals && c.totals.finesAmount ? money(c.totals.finesAmount) + ' pendientes' : 'Sin deudas') + '</small></div>' +
          '<div><span>Órdenes</span><b>' + esc(c && c.totals ? c.totals.warrants : 0) + '</b><small>' + (c && c.totals && c.totals.warrants ? 'Requiere atención' : 'Todo en orden') + '</small></div>' +
        '</div>' +
        '<div class="pc-profile-grid">' +
          '<section class="pc-panel">' +
            '<div class="pc-panel-head"><div><span class="pc-eyebrow">Cuenta</span><h3>Discord y Roblox</h3></div></div>' +
            '<div class="pc-info-rows">' +
              '<div><span>Usuario de Discord</span><b>@' + esc(user.username || '—') + '</b></div>' +
              '<div><span>Nombre visible</span><b>' + esc(user.displayName || '—') + '</b></div>' +
              '<div><span>Roblox</span><b>' + esc(user.robloxUsername || '—') + '</b></div>' +
              '<div><span>Rol en el servidor</span><b>' + esc(role) + '</b></div>' +
              '<div><span>Miembro desde</span><b>' + dateFmt(user.createdAt) + '</b></div>' +
            '</div>' +
          '</section>' +
          '<section class="pc-panel">' +
            '<div class="pc-panel-head"><div><span class="pc-eyebrow">Personaje</span><h3>Identidad en la ciudad</h3></div></div>' +
            (c
              ? '<div class="pc-info-rows">' +
                  '<div><span>Nombre completo</span><b>' + esc(c.name) + '</b></div>' +
                  '<div><span>DNI</span><b class="citizen-mono">' + esc(c.dni) + '</b></div>' +
                  '<div><span>Nacimiento</span><b>' + esc(dobFmt(c.dob)) + ' · ' + esc(ageText(c)) + '</b></div>' +
                  '<div><span>Dirección</span><b>' + esc([c.address, c.city, c.state, c.zip].filter(Boolean).join(', ') || '—') + '</b></div>' +
                  '<div><span>Licencia</span><b>' + esc(info && info.number ? info.number : (info ? info.label : 'Sin licencia')) + '</b></div>' +
                '</div>'
              : '<div class="pc-profile-link">' +
                  '<p>Todavía no vinculaste un DNI. Creá tu identidad o conectá un registro existente del CAD.</p>' +
                  '<button class="pc-btn pc-btn-primary" type="button" data-pc-action="open-app" data-app="civil">Ir al Registro Civil</button>' +
                '</div>') +
          '</section>' +
        '</div>' +
        '<div class="pc-profile-foot">' +
          '<span>RLA OS · La Realidad RP</span>' +
          '<button class="pc-link-danger" type="button" data-action="logout">Cerrar sesión</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /* ============================================================
     18) AJUSTES
     ============================================================ */

  function renderSettingsApp() {
    const tabs = [
      { id: 'cuenta', label: 'Cuenta' },
      { id: 'apariencia', label: 'Apariencia' },
      { id: 'datos', label: 'Datos y privacidad' },
      { id: 'acerca', label: 'Acerca de RLA OS' },
    ];
    if (!tabs.some((t) => t.id === state.settingsTab)) state.settingsTab = 'cuenta';
    let body = '';
    if (state.settingsTab === 'apariencia') body = renderSettingsAppearance();
    else if (state.settingsTab === 'datos') body = renderSettingsData();
    else if (state.settingsTab === 'acerca') body = renderSettingsAbout();
    else body = renderSettingsAccount();

    return '<div class="pc-settings">' +
      '<div class="pc-settings-nav" role="tablist" aria-label="Ajustes de RLA OS">' +
        '<div class="pc-settings-nav-head"><span class="pc-eyebrow">Sistema</span><h2>Ajustes</h2><p>Personalizá tu cuenta y tu PC.</p></div>' +
        tabs.map((t) => '<button type="button" role="tab" aria-selected="' + (state.settingsTab === t.id ? 'true' : 'false') + '" class="' + (state.settingsTab === t.id ? 'is-on' : '') + '" data-settings-tab="' + t.id + '">' + esc(t.label) + '</button>').join('') +
        '<div class="pc-settings-nav-foot">' + pcAvatar('pc-settings-avatar') + '<div><b>' + esc((currentUser() && (currentUser().displayName || currentUser().username)) || 'Ciudadano') + '</b><span>@' + esc((currentUser() && currentUser().username) || 'cuenta') + '</span></div></div>' +
      '</div>' +
      '<div class="pc-settings-main pc-app-scroll">' + body + '</div>' +
    '</div>';
  }

  function renderSettingsAccount() {
    const user = currentUser() || {};
    const c = state.citizen;
    return '<div class="pc-settings-page">' +
      '<div class="pc-panel-head"><div><span class="pc-eyebrow">Cuenta</span><h2>Tu cuenta</h2><p>Datos de Discord y del vínculo con el CAD.</p></div></div>' +
      '<section class="pc-panel pc-account-card">' +
        '<div class="pc-account-head">' + pcAvatar('pc-account-avatar') +
          '<div><h3>' + esc(user.displayName || user.username || 'Ciudadano') + '</h3><p>@' + esc(user.username || 'cuenta') + ' · ' + esc(user.role || 'Ciudadano') + '</p></div>' +
          pcChip(state.linked ? 'Cuenta vinculada' : 'Sin DNI', state.linked ? 'ok' : 'gold') +
        '</div>' +
        '<div class="pc-info-rows">' +
          '<div><span>Usuario de Discord</span><b>@' + esc(user.username || '—') + '</b></div>' +
          '<div><span>Roblox</span><b>' + esc(user.robloxUsername || '—') + '</b></div>' +
          '<div><span>DNI</span><b class="citizen-mono">' + esc((c && c.dni) || user.dni || '—') + '</b></div>' +
          '<div><span>Licencia</span><b>' + esc(c ? licenseInfo(c).label : 'Sin licencia') + '</b></div>' +
          '<div><span>Miembro desde</span><b>' + dateFmt(user.createdAt) + '</b></div>' +
        '</div>' +
        '<div class="pc-form-actions">' +
          '<button class="pc-btn pc-btn-primary" type="button" data-pc-action="open-app" data-app="profile">Ver perfil</button>' +
          '<button class="pc-btn pc-btn-ghost" type="button" data-action="refresh">Actualizar datos</button>' +
          '<button class="pc-btn pc-btn-ghost" type="button" data-action="logout">Cerrar sesión</button>' +
        '</div>' +
      '</section>' +
      '<section class="pc-panel">' +
        '<div class="pc-panel-head"><div><span class="pc-eyebrow">Seguridad</span><h3>Sesión de Discord</h3></div></div>' +
        '<p class="pc-muted">Tu cuenta se verifica con Discord y un código enviado por mensaje directo. La contraseña viaja por HTTPS al bot y nunca se muestra en el panel.</p>' +
        '<div class="pc-form-actions"><button class="pc-btn pc-btn-ghost" type="button" data-pc-action="open-url" data-url="' + esc(safeUrl(CFG.discord || '')) + '">Abrir Discord</button></div>' +
      '</section>' +
    '</div>';
  }

  function renderSettingsAppearance() {
    const wallKeys = Object.keys(WALLPAPERS);
    return '<div class="pc-settings-page">' +
      '<div class="pc-panel-head"><div><span class="pc-eyebrow">Apariencia</span><h2>Personalizá RLA OS</h2><p>Fondo, color de acento y accesibilidad.</p></div></div>' +
      '<section class="pc-panel">' +
        '<div class="pc-panel-head"><div><span class="pc-eyebrow">Escritorio</span><h3>Fondo de pantalla</h3></div><span class="pc-muted">' + esc((WALLPAPERS[state.prefs.wallpaper] || WALLPAPERS.lapd).name) + '</span></div>' +
        '<div class="pc-wallpaper-grid">' +
          wallKeys.map((key) => {
            const w = WALLPAPERS[key];
            const on = state.prefs.wallpaper === key;
            return '<button type="button" class="pc-wallpaper-thumb' + (on ? ' is-on' : '') + '" data-pc-action="set-wallpaper" data-wallpaper="' + key + '" title="' + esc(w.name) + '">' +
              '<span class="pc-wallpaper-img" style="' + (key === 'gradient' ? 'background-image:' + w.css + ';' : 'background-image:url(\'' + w.css.replace(/^url\('|'\)$/g, '') + '\');') + '"></span>' +
              '<b>' + esc(w.name) + '</b>' +
              (on ? '<i>✓</i>' : '') +
            '</button>';
          }).join('') +
        '</div>' +
      '</section>' +
      '<section class="pc-panel">' +
        '<div class="pc-panel-head"><div><span class="pc-eyebrow">Color</span><h3>Acento del sistema</h3></div></div>' +
        '<div class="pc-accent-grid">' +
          ACCENTS.map((a) => '<button type="button" class="pc-accent-swatch' + (state.prefs.accent === a.id ? ' is-on' : '') + '" data-pc-action="set-accent" data-accent="' + a.id + '" title="' + esc(a.name) + '" style="--swatch:' + a.color + ';--swatch2:' + a.color2 + '"><span></span><b>' + esc(a.name) + '</b></button>').join('') +
        '</div>' +
      '</section>' +
      '<section class="pc-panel">' +
        '<div class="pc-panel-head"><div><span class="pc-eyebrow">Accesibilidad</span><h3>Opciones del escritorio</h3></div></div>' +
        '<div class="pc-toggle-row">' +
          '<div><b>Iconos compactos</b><span>Reduce el tamaño de los iconos del escritorio.</span></div>' +
          '<button type="button" class="pc-switch' + (state.prefs.compact ? ' is-on' : '') + '" role="switch" aria-checked="' + (state.prefs.compact ? 'true' : 'false') + '" data-pc-action="toggle-pref" data-pref="compact"><i></i></button>' +
        '</div>' +
        '<div class="pc-toggle-row">' +
          '<div><b>Reducir movimiento</b><span>Desactiva animaciones y transiciones del sistema.</span></div>' +
          '<button type="button" class="pc-switch' + (state.prefs.reduceMotion ? ' is-on' : '') + '" role="switch" aria-checked="' + (state.prefs.reduceMotion ? 'true' : 'false') + '" data-pc-action="toggle-pref" data-pref="reduceMotion"><i></i></button>' +
        '</div>' +
        '<div class="pc-form-actions"><button class="pc-btn pc-btn-ghost" type="button" data-pc-action="reset-prefs">Restablecer apariencia</button></div>' +
      '</section>' +
    '</div>';
  }

  function renderSettingsData() {
    const c = state.citizen;
    const user = currentUser() || {};
    const info = c ? licenseInfo(c) : null;
    return '<div class="pc-settings-page">' +
      '<div class="pc-panel-head"><div><span class="pc-eyebrow">Datos</span><h2>Datos y privacidad</h2><p>Qué guarda RLA OS y cómo administrar tu vínculo.</p></div></div>' +
      '<section class="pc-panel">' +
        '<div class="pc-panel-head"><div><span class="pc-eyebrow">Sincronización</span><h3>Estado del CAD</h3></div>' + pcChip(syncInfo().text, syncInfo().tone) + '</div>' +
        '<div class="pc-info-rows">' +
          '<div><span>Origen de los datos</span><b>' + esc(state.source || 'CAD / bot') + '</b></div>' +
          '<div><span>Última actualización</span><b>' + (state.cadUpdatedAt ? relative(state.cadUpdatedAt) : 'Sin datos') + '</b></div>' +
          '<div><span>DNI</span><b class="citizen-mono">' + esc((c && c.dni) || user.dni || '—') + '</b></div>' +
          '<div><span>Licencia</span><b>' + esc(info ? info.label : 'Sin licencia') + '</b></div>' +
          '<div><span>Cuenta</span><b>@' + esc(user.username || '—') + '</b></div>' +
        '</div>' +
        '<div class="pc-form-actions">' +
          '<button class="pc-btn pc-btn-primary" type="button" data-action="refresh">Actualizar ahora</button>' +
          '<button class="pc-btn pc-btn-ghost" type="button" data-pc-action="download-citizen" ' + (c ? '' : 'disabled') + '>Descargar expediente</button>' +
          '<button class="pc-btn pc-btn-ghost" type="button" data-action="print" ' + (c ? '' : 'disabled') + '>Imprimir DNI</button>' +
        '</div>' +
      '</section>' +
      '<section class="pc-panel">' +
        '<div class="pc-panel-head"><div><span class="pc-eyebrow">Privacidad</span><h3>Qué datos usa RLA OS</h3></div></div>' +
        '<p class="pc-muted">RLA OS usa tu sesión de Discord para identificarte y los datos que el CAD envía al bot: DNI, licencia, vehículos, multas, órdenes y antecedentes. No vendemos ni compartimos esos datos con terceros.</p>' +
        '<p class="pc-muted">Podés desvincular tu DNI en cualquier momento. La cuenta de Discord se mantiene, pero el panel deja de mostrar el expediente hasta que vincules otro DNI.</p>' +
      '</section>' +
      '<section class="pc-panel pc-danger-zone">' +
        '<div class="pc-panel-head"><div><span class="pc-eyebrow">Zona de riesgo</span><h3>Desvincular DNI</h3></div></div>' +
        (state.unlinkConfirm
          ? '<div class="pc-danger-confirm"><p>¿Seguro que querés desvincular el DNI <b>' + esc((c && c.dni) || user.dni || '') + '</b> de tu cuenta? No se borra del CAD; solo se desconecta de este panel.</p>' +
            '<div class="pc-form-actions"><button class="pc-btn pc-btn-danger" type="button" data-action="unlink-confirm">Sí, desvincular</button><button class="pc-btn pc-btn-ghost" type="button" data-action="unlink-cancel">Cancelar</button></div></div>'
          : '<p class="pc-muted">Esta acción solo desconecta el DNI de tu cuenta de Discord. No elimina tu personaje del CAD.</p>' +
            '<button class="pc-btn pc-btn-danger" type="button" data-action="unlink" ' + (state.linked ? '' : 'disabled') + '>Desvincular mi DNI</button>' +
            (state.linked ? '' : '<p class="pc-muted">No hay un DNI vinculado.</p>')) +
      '</section>' +
    '</div>';
  }

  function renderSettingsAbout() {
    return '<div class="pc-settings-page">' +
      '<div class="pc-panel-head"><div><span class="pc-eyebrow">Sistema</span><h2>Acerca de RLA OS</h2><p>El escritorio virtual del Panel de Ciudadano.</p></div></div>' +
      '<section class="pc-panel pc-about-card">' +
        '<img class="pc-about-logo" src="assets/logo-realidad.svg" alt="La Realidad RP">' +
        '<div><h3>RLA OS <span>v1.0</span></h3><p>La Realidad RP · Los Angeles, California</p><p class="pc-muted">Hecho para la comunidad de ER:LC. DNI, licencia, vehículos, multas, órdenes y apps de la ciudad en un solo lugar.</p></div>' +
      '</section>' +
      '<section class="pc-panel">' +
        '<div class="pc-panel-head"><div><span class="pc-eyebrow">Sistema</span><h3>Información técnica</h3></div></div>' +
        '<div class="pc-info-rows">' +
          '<div><span>Versión</span><b>1.0.0</b></div>' +
          '<div><span>API</span><b class="pc-break">' + esc((LR() && LR().apiBase) || CFG.apiBase || '—') + '</b></div>' +
          '<div><span>Fuente de datos</span><b>CAD + bot de Discord</b></div>' +
          '<div><span>Autenticación</span><b>Discord + código por MD</b></div>' +
          '<div><span>Música de inicio</span><b>“Rising Sun” — Diego Nava · Mixkit Free License</b></div>' +
        '</div>' +
      '</section>' +
      '<section class="pc-panel">' +
        '<div class="pc-panel-head"><div><span class="pc-eyebrow">Enlaces</span><h3>Comunidad</h3></div></div>' +
        '<div class="pc-about-links">' +
          '<button class="pc-btn pc-btn-ghost" type="button" data-pc-action="open-url" data-url="' + esc(safeUrl(CFG.discord || '')) + '">Discord</button>' +
          '<button class="pc-btn pc-btn-ghost" type="button" data-pc-action="open-url" data-url="' + esc(safeUrl(CFG.cadDescarga || '')) + '">Descargar CAD</button>' +
          '<button class="pc-btn pc-btn-ghost" type="button" data-pc-action="open-url" data-url="' + esc(safeUrl(CFG.central911 || '')) + '">Central 911</button>' +
          '<a class="pc-btn pc-btn-ghost" href="privacidad.html">Privacidad</a>' +
        '</div>' +
        '<p class="pc-muted pc-small">RLA OS y La Realidad RP son proyectos de roleplay. No están afiliados a Bank of America, Google, WhatsApp, MercadoLibre ni a sus empresas matrices. Las marcas se usan como referencia dentro de la ficción.</p>' +
      '</section>' +
    '</div>';
  }

  /* ============================================================
     19) ENTORNOS
     ============================================================ */

  function mountEntornosApp() {
    loadEnvStatus();
  }

  function renderEntornosApp() {
    const env = state.env;
    const status = (env && env.status) || {};
    const healthTone = env && env.healthOk ? 'ok' : (state.envLoading ? 'loading' : 'red');
    const discordTone = status.discordReady ? 'ok' : (env ? 'red' : 'neutral');
    const cadTone = state.cadUpdatedAt ? 'ok' : 'gold';
    return '<div class="pc-env pc-app-scroll">' +
      '<header class="pc-app-header">' +
        '<div><span class="pc-eyebrow">RLA Systems</span><h2>Entornos y servicios</h2><p>Estado en vivo del CAD, Discord, la API y los servidores de la ciudad.</p></div>' +
        '<button class="pc-btn pc-btn-ghost" type="button" data-pc-action="env-refresh" ' + (state.envLoading ? 'disabled' : '') + '>' + (state.envLoading ? 'Consultando…' : 'Actualizar estado') + '</button>' +
      '</header>' +
      (state.envError ? '<div class="pc-alert red"><b>No pude conectar con la API</b><span>' + esc(state.envError) + '</span></div>' : '') +
      '<div class="pc-env-grid">' +
        '<article class="pc-env-card">' +
          '<span class="pc-env-ico ico-env-api">API</span>' +
          '<div><span class="pc-eyebrow">Bot / API</span><h3>' + (env && env.healthOk ? 'Operativo' : (state.envLoading ? 'Consultando…' : 'Sin respuesta')) + '</h3>' +
          '<p>' + (env ? 'Latencia ' + env.latency + ' ms' : 'Render · Node.js') + '</p></div>' +
          '<i class="pc-status-dot ' + healthTone + '"></i>' +
        '</article>' +
        '<article class="pc-env-card">' +
          '<span class="pc-env-ico ico-env-discord">DC</span>' +
          '<div><span class="pc-eyebrow">Discord</span><h3>' + (status.discordReady ? 'Conectado' : (env ? 'Desconectado' : 'Sin datos')) + '</h3>' +
          '<p>Bot de La Realidad RP</p></div>' +
          '<i class="pc-status-dot ' + discordTone + '"></i>' +
        '</article>' +
        '<article class="pc-env-card">' +
          '<span class="pc-env-ico ico-env-cad">CAD</span>' +
          '<div><span class="pc-eyebrow">CAD / ER:LC</span><h3>' + (state.cadUpdatedAt ? 'Sincronizado' : 'Sin sincronizar') + '</h3>' +
          '<p>' + (state.cadUpdatedAt ? relative(state.cadUpdatedAt) : 'Esperando snapshot') + '</p></div>' +
          '<i class="pc-status-dot ' + cadTone + '"></i>' +
        '</article>' +
        '<article class="pc-env-card">' +
          '<span class="pc-env-ico ico-env-store">DB</span>' +
          '<div><span class="pc-eyebrow">Almacén</span><h3>' + esc(status.store || 'Conectado') + '</h3>' +
          '<p>Cuentas, DNI y licencias</p></div>' +
          '<i class="pc-status-dot ' + (env ? 'ok' : 'neutral') + '"></i>' +
        '</article>' +
      '</div>' +
      '<div class="pc-env-columns">' +
        '<section class="pc-panel">' +
          '<div class="pc-panel-head"><div><span class="pc-eyebrow">Ciudad</span><h3>Entornos de roleplay</h3></div></div>' +
          '<div class="pc-env-town"><i class="pc-status-dot ok"></i><div><b>Los Angeles</b><span>Ciudad principal · Activo</span></div><button class="pc-btn pc-btn-ghost pc-btn-sm" type="button" data-pc-action="toast" data-message="El mapa de Los Angeles se abre desde el juego.">Ver mapa</button></div>' +
          '<div class="pc-env-town"><i class="pc-status-dot ok"></i><div><b>Sandy Shores</b><span>Zona norte · Activo</span></div><button class="pc-btn pc-btn-ghost pc-btn-sm" type="button" data-pc-action="toast" data-message="El mapa de Sandy Shores se abre desde el juego.">Ver mapa</button></div>' +
          '<div class="pc-env-town"><i class="pc-status-dot gold"></i><div><b>Paleto Bay</b><span>Zona rural · Mantenimiento</span></div><button class="pc-btn pc-btn-ghost pc-btn-sm" type="button" data-pc-action="toast" data-message="Paleto Bay está en mantenimiento de roleplay.">Detalles</button></div>' +
        '</section>' +
        '<section class="pc-panel">' +
          '<div class="pc-panel-head"><div><span class="pc-eyebrow">Seguridad</span><h3>Credenciales protegidas</h3></div></div>' +
          '<div class="pc-info-rows">' +
            '<div><span>Clave del CAD</span><b>' + (status.cadKeyReady ? 'Configurada' : 'No configurada') + '</b></div>' +
            '<div><span>Token de Discord</span><b>' + (status.discordReady ? 'Conectado' : 'No disponible') + '</b></div>' +
            '<div><span>Clave ER:LC</span><b>Oculta en el servidor</b></div>' +
          '</div>' +
          '<p class="pc-muted pc-small">RLA OS nunca muestra claves ni tokens en el navegador. Las credenciales viven solo en el servidor del bot.</p>' +
        '</section>' +
      '</div>' +
      '<section class="pc-panel">' +
        '<div class="pc-panel-head"><div><span class="pc-eyebrow">Accesos</span><h3>Servicios de la ciudad</h3></div></div>' +
        '<div class="pc-about-links">' +
          '<button class="pc-btn pc-btn-ghost" type="button" data-pc-action="open-url" data-url="' + esc(safeUrl(CFG.discord || '')) + '">Discord</button>' +
          '<button class="pc-btn pc-btn-ghost" type="button" data-pc-action="open-url" data-url="' + esc(safeUrl(CFG.central911 || '')) + '">Central 911</button>' +
          '<button class="pc-btn pc-btn-ghost" type="button" data-pc-action="open-url" data-url="' + esc(safeUrl(CFG.cadDescarga || '')) + '">Descargar CAD</button>' +
          '<button class="pc-btn pc-btn-ghost" type="button" data-pc-action="open-app" data-app="vps">VPS Manager</button>' +
          '<button class="pc-btn pc-btn-ghost" type="button" data-pc-action="open-app" data-app="settings">Ajustes</button>' +
        '</div>' +
        '<p class="pc-muted pc-small">Última comprobación: ' + (env && env.checkedAt ? new Date(env.checkedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : 'pendiente') + '</p>' +
      '</section>' +
    '</div>';
  }

  /* ============================================================
     20) ARCHIVOS
     ============================================================ */

  function bytesLabel(n) {
    const value = Number(n) || 0;
    if (value < 1024) return value + ' B';
    if (value < 1024 * 1024) return (value / 1024).toFixed(value < 10240 ? 1 : 0) + ' KB';
    return (value / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function buildFiles() {
    const c = state.citizen;
    const user = currentUser() || {};
    const files = [];
    if (c) {
      files.push({ id: 'dni', name: 'DNI_' + c.dni + '.pdf', type: 'PDF', folder: 'Identidad', tone: 'red', size: 248 * 1024, desc: 'Documento de identidad de California. Podés abrirlo, imprimirlo o guardarlo como PDF.', app: 'civil', tab: 'dni' });
      files.push({ id: 'licencia', name: 'Licencia_de_conducir.txt', type: 'TXT', folder: 'Licencia', tone: 'blue', size: 4.2 * 1024, desc: 'Estado y datos de tu licencia de conducir emitida desde el panel.', app: 'civil', tab: 'licencia' });
      files.push({ id: 'vehiculos', name: 'Vehiculos_registrados.json', type: 'JSON', folder: 'Vehículos', tone: 'gold', size: Math.max(640, JSON.stringify(c.vehicles || []).length + 420), desc: 'Vehículos a tu nombre en el CAD, con patente, modelo y estado.', app: 'civil', tab: 'vehiculos' });
      files.push({ id: 'multas', name: 'Multas_pendientes.csv', type: 'CSV', folder: 'Multas', tone: 'green', size: Math.max(420, (c.fines || []).reduce((n, f) => n + String(f.reason || '').length + 80, 300)), desc: 'Listado de multas y deudas registradas por el CAD.', app: 'civil', tab: 'multas' });
      files.push({ id: 'ordenes', name: 'Ordenes_judiciales.txt', type: 'TXT', folder: 'Órdenes', tone: 'red', size: Math.max(380, (c.warrants || []).reduce((n, w) => n + String(w.reason || '').length + 70, 240)), desc: 'Órdenes activas e historial de órdenes judiciales.', app: 'civil', tab: 'ordenes' });
      files.push({ id: 'antecedentes', name: 'Expediente_completo.json', type: 'JSON', folder: 'Identidad', tone: 'purple', size: Math.max(1024, JSON.stringify(c).length), desc: 'Expediente completo del ciudadano, incluyendo notas y antecedentes.', app: 'civil', tab: 'antecedentes' });
    } else {
      files.push({ id: 'sin-dni', name: 'Crear_o_vincular_DNI.txt', type: 'TXT', folder: 'Identidad', tone: 'gold', size: 720, desc: 'Todavía no vinculaste un DNI. Abrí el Registro Civil para crear tu identidad.', app: 'civil', tab: 'resumen' });
    }
    files.push({ id: 'readme', name: 'LEEME_RLA_OS.txt', type: 'TXT', folder: 'Sistema', tone: 'blue', size: 2100, desc: 'Guía rápida de RLA OS: apps, ventanas, ajustes y privacidad.', app: 'settings', tab: 'acerca' });
    files.push({ id: 'registro', name: 'registro_cad.json', type: 'JSON', folder: 'Sistema', tone: 'purple', size: 680, desc: 'Copia exportable de tu expediente del CAD. Se descarga como archivo JSON.', action: 'download' });
    files.push({ id: 'cuenta', name: 'Cuenta_' + (user.username || 'rla') + '.txt', type: 'TXT', folder: 'Sistema', tone: 'green', size: 640, desc: 'Datos de tu cuenta de Discord y vínculo con el panel.', app: 'settings', tab: 'cuenta' });
    return files;
  }

  function renderFilesApp() {
    const all = buildFiles();
    const folders = ['todos', 'Identidad', 'Licencia', 'Vehículos', 'Multas', 'Órdenes', 'Sistema'];
    const folder = folders.includes(state.filesFolder) ? state.filesFolder : 'todos';
    const files = all.filter((f) => folder === 'todos' || f.folder === folder);
    const selected = all.find((f) => f.id === state.filesSelected) || null;
    const c = state.citizen;

    return '<div class="pc-files">' +
      '<aside class="pc-files-side">' +
        '<div class="pc-files-side-head"><span class="pc-eyebrow">RLA OS</span><h2>Archivos</h2></div>' +
        '<button type="button" class="pc-files-folder' + (folder === 'todos' ? ' is-on' : '') + '" data-pc-action="files-folder" data-folder="todos"><span>▦</span><b>Todos</b><i>' + all.length + '</i></button>' +
        folders.slice(1).map((name) => {
          const count = all.filter((f) => f.folder === name).length;
          return '<button type="button" class="pc-files-folder' + (folder === name ? ' is-on' : '') + '" data-pc-action="files-folder" data-folder="' + esc(name) + '"><span>' + (name === 'Identidad' ? '🪪' : name === 'Licencia' ? '🚗' : name === 'Vehículos' ? '🔑' : name === 'Multas' ? '$' : name === 'Órdenes' ? '!' : '⚙') + '</span><b>' + esc(name) + '</b><i>' + count + '</i></button>';
        }).join('') +
        '<div class="pc-files-side-foot"><span class="pc-muted">Origen</span><b>' + esc(state.source || 'CAD') + '</b><small>' + (state.cadUpdatedAt ? 'Actualizado ' + relative(state.cadUpdatedAt) : 'Sin sincronizar') + '</small></div>' +
      '</aside>' +
      '<section class="pc-files-main">' +
        '<header class="pc-files-toolbar">' +
          '<div class="pc-files-breadcrumb"><span>RLA OS</span><i>›</i><b>' + esc(folder === 'todos' ? 'Archivos' : folder) + '</b></div>' +
          '<label class="pc-files-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input id="filesSearch" type="search" placeholder="Buscar archivos…" autocomplete="off" aria-label="Buscar archivos"></label>' +
          '<div class="pc-files-tools"><button class="pc-btn pc-btn-ghost pc-btn-sm" type="button" data-action="refresh">Actualizar</button><button class="pc-btn pc-btn-primary pc-btn-sm" type="button" data-pc-action="download-citizen" ' + (c ? '' : 'disabled') + '>Descargar copia</button></div>' +
        '</header>' +
        '<div class="pc-files-body">' +
          '<div class="pc-files-list-pane">' +
            '<div class="pc-files-list-head"><span>Nombre</span><span>Tipo</span><span>Tamaño</span><span>Actualizado</span></div>' +
            (files.length
              ? '<div class="pc-files-list" id="pcFilesList">' + files.map((f) =>
                  '<button type="button" class="pc-file-row' + (selected && selected.id === f.id ? ' is-selected' : '') + '" data-pc-action="file-select" data-file="' + esc(f.id) + '" data-file-id="' + esc(f.id) + '" data-file-name="' + esc(norm(f.name + ' ' + f.folder + ' ' + f.type)) + '">' +
                    '<span class="pc-file-name"><span class="pc-file-ico ' + esc(f.tone) + '">' + esc(f.type) + '</span><b>' + esc(f.name) + '</b></span>' +
                    '<span>' + esc(f.type) + '</span>' +
                    '<span>' + bytesLabel(f.size) + '</span>' +
                    '<span>' + dateFmt(state.cadUpdatedAt || Date.now()) + '</span>' +
                  '</button>').join('') + '</div>'
              : pcEmpty('📁', 'No hay archivos', 'No encontramos archivos en esta carpeta. Probá con otra carpeta o actualizá los datos.')) +
          '</div>' +
          '<aside class="pc-files-details">' +
            (selected
              ? '<span class="pc-file-preview ' + esc(selected.tone) + '">' + esc(selected.type) + '</span>' +
                '<h3>' + esc(selected.name) + '</h3>' +
                '<p class="pc-muted">' + esc(selected.desc) + '</p>' +
                '<div class="pc-info-rows">' +
                  '<div><span>Carpeta</span><b>' + esc(selected.folder) + '</b></div>' +
                  '<div><span>Tipo</span><b>' + esc(selected.type) + '</b></div>' +
                  '<div><span>Tamaño</span><b>' + bytesLabel(selected.size) + '</b></div>' +
                  '<div><span>Actualizado</span><b>' + dateFmt(state.cadUpdatedAt || Date.now()) + '</b></div>' +
                '</div>' +
                '<div class="pc-form-actions">' +
                  '<button class="pc-btn pc-btn-primary" type="button" data-pc-action="file-open" data-file="' + esc(selected.id) + '">Abrir</button>' +
                  (selected.action === 'download' ? '<button class="pc-btn pc-btn-ghost" type="button" data-pc-action="download-citizen">Descargar</button>' : '') +
                '</div>'
              : '<div class="pc-files-details-empty"><span>◫</span><h3>Seleccioná un archivo</h3><p>Hacé clic en un archivo para ver sus detalles. Doble clic para abrirlo.</p></div>') +
          '</aside>' +
        '</div>' +
        '<footer class="pc-files-foot"><span>' + files.length + ' elemento' + (files.length === 1 ? '' : 's') + '</span><span>Los archivos son una vista de tus datos del CAD. No se guardan copias en el servidor.</span></footer>' +
      '</section>' +
    '</div>';
  }

  function filterFiles() {
    const input = $('#filesSearch');
    if (!input) return;
    const q = norm(input.value);
    const rows = $$('#pcFilesList .pc-file-row');
    let visible = 0;
    rows.forEach((row) => {
      const show = !q || String(row.getAttribute('data-file-name') || '').includes(q);
      row.hidden = !show;
      if (show) visible++;
    });
    const empty = $('#pcFilesList .pc-files-no-results');
    if (empty) empty.hidden = visible > 0;
  }

  function renderTrashApp() {
    return '<div class="pc-trash pc-app-scroll">' +
      '<header class="pc-app-header"><div><span class="pc-eyebrow">Sistema</span><h2>Papelera</h2><p>Los elementos eliminados de tu escritorio aparecen acá.</p></div>' +
        '<button class="pc-btn pc-btn-ghost" type="button" data-pc-action="open-app" data-app="files">Abrir Archivos</button></header>' +
      '<div class="pc-trash-stage">' +
        '<span class="pc-trash-icon">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/></svg>' +
        '</span>' +
        '<h3>La papelera está vacía</h3>' +
        '<p>Los archivos del Registro Civil no se pueden eliminar desde RLA OS. Si borrás algo del escritorio, va a aparecer acá.</p>' +
        '<div class="pc-form-actions"><button class="pc-btn pc-btn-primary" type="button" data-pc-action="open-app" data-app="files">Explorar archivos</button><button class="pc-btn pc-btn-ghost" type="button" data-pc-action="toast" data-message="No hay elementos para vaciar.">Vaciar papelera</button></div>' +
        '<small>0 elementos · 0 B</small>' +
      '</div>' +
    '</div>';
  }

  /* ============================================================
     21) RLA STORE
     ============================================================ */

  function storeCard(id) {
    const app = APPS[id];
    const installed = isInstalled(id);
    const isCore = CORE_APPS.includes(id);
    return '<article class="pc-store-card" data-store-card data-search="' + esc(norm(app.name + ' ' + app.storeDesc + ' ' + app.keywords)) + '">' +
      '<div class="pc-store-card-top">' +
        appIcon(id, 'is-lg') +
        '<div class="pc-store-card-title"><h3>' + esc(app.name) + '</h3><span>' + esc(app.storeCat) + ' · ' + esc(app.subtitle) + '</span></div>' +
        (installed ? pcChip('Instalada', 'ok') : pcChip('Nueva', 'gold')) +
      '</div>' +
      '<p>' + esc(app.storeDesc) + '</p>' +
      '<div class="pc-store-card-meta"><span>★ ' + esc(String(app.rating || '—')) + '</span><span>' + esc(app.downloads || '—') + ' descargas</span></div>' +
      '<div class="pc-store-card-actions">' +
        (installed
          ? '<button class="pc-btn pc-btn-primary pc-btn-sm" type="button" data-pc-action="store-open" data-store-app="' + id + '">Abrir</button>'
          : '<button class="pc-btn pc-btn-primary pc-btn-sm" type="button" data-pc-action="store-install" data-store-app="' + id + '">Instalar</button>') +
        (installed && !isCore ? '<button class="pc-link-soft" type="button" data-pc-action="store-uninstall" data-store-app="' + id + '">Desinstalar</button>' : '') +
        (isCore && installed ? '<span class="pc-store-system">App del sistema</span>' : '') +
      '</div>' +
    '</article>';
  }

  function renderStoreApp() {
    const category = STORE_CATEGORIES.some((c) => c.id === state.storeCategory) ? state.storeCategory : 'todas';
    let ids = APP_ORDER.filter((id) => id !== 'trash');
    if (category === 'instaladas') ids = ids.filter(isInstalled);
    else if (category === 'explorar') ids = ids.filter((id) => !isInstalled(id));
    else if (category !== 'todas') ids = ids.filter((id) => APPS[id].storeCat === category);
    const exploreCount = APP_ORDER.filter((id) => id !== 'trash' && !isInstalled(id)).length;
    return '<div class="pc-store pc-app-scroll">' +
      '<header class="pc-store-hero">' +
        '<div class="pc-store-hero-text"><span class="pc-eyebrow">RLA Store</span><h2>Todo para tu ciudad.</h2><p>Descubrí aplicaciones para tu RLA OS, instalalas y abrí todo desde el escritorio.</p>' +
          '<div class="pc-store-hero-actions"><button class="pc-btn pc-btn-primary" type="button" data-pc-action="store-open" data-store-app="social">Abrir RLA Social</button><button class="pc-btn pc-btn-ghost" type="button" data-pc-action="store-category" data-category="explorar">Explorar apps' + (exploreCount ? ' · ' + exploreCount : '') + '</button></div>' +
        '</div>' +
        '<div class="pc-store-hero-art">' + appIcon('social', 'is-xl') + '<span>RLA Social</span><small>La comunidad de Los Angeles</small></div>' +
      '</header>' +
      '<div class="pc-store-toolbar">' +
        '<form class="pc-store-search" id="storeSearchForm"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input id="storeSearch" type="search" placeholder="Buscar en RLA Store…" autocomplete="off" aria-label="Buscar en RLA Store"></form>' +
        '<div class="pc-store-categories">' + STORE_CATEGORIES.map((c) => '<button type="button" class="' + (category === c.id ? 'is-on' : '') + '" data-pc-action="store-category" data-category="' + c.id + '">' + esc(c.label) + '</button>').join('') + '</div>' +
      '</div>' +
      '<div class="pc-store-section-head"><div><span class="pc-eyebrow">' + esc(category === 'explorar' ? 'Explorar' : category === 'instaladas' ? 'Tu PC' : 'Catálogo') + '</span><h3>' + esc(category === 'explorar' ? 'Apps para descubrir' : category === 'instaladas' ? 'Instaladas en RLA OS' : category === 'todas' ? 'Aplicaciones' : category) + '</h3></div><span class="pc-muted" id="storeCount">' + ids.length + ' apps</span></div>' +
      '<div class="pc-store-grid" id="pcStoreGrid">' + ids.map(storeCard).join('') + '</div>' +
      '<div class="pc-store-empty" id="storeEmpty"' + (ids.length ? ' hidden' : '') + '>' +
        (category === 'explorar' && !state.storeQuery
          ? '<b>Exploración completada</b><p>Ya instalaste todas las apps de Explorar. Están en tu escritorio y en la sección Instaladas.</p><button class="pc-btn pc-btn-ghost pc-btn-sm" type="button" data-pc-action="store-category" data-category="instaladas">Ver instaladas</button>'
          : '<b>Sin resultados</b><p>No encontramos aplicaciones con esa búsqueda. Probá con otro nombre o categoría.</p>') +
      '</div>' +
      '<footer class="pc-store-foot"><span>RLA Store · Apps de roleplay para La Realidad RP</span><span>' + exploreCount + ' app' + (exploreCount === 1 ? '' : 's') + ' en Explorar</span></footer>' +
    '</div>';
  }

  function filterStoreCards() {
    const input = $('#storeSearch');
    const grid = $('#pcStoreGrid');
    if (!grid) return;
    const q = norm(input ? input.value : '');
    let visible = 0;
    $$('.pc-store-card', grid).forEach((card) => {
      const show = !q || String(card.getAttribute('data-search') || '').includes(q);
      card.hidden = !show;
      if (show) visible++;
    });
    const empty = $('#storeEmpty');
    if (empty) empty.hidden = visible > 0;
    const count = $('#storeCount');
    if (count) count.textContent = visible + ' apps';
  }


  /* ============================================================
     22) BANK OF AMERICA
     ============================================================ */

  function bofaLogoMarkup(extra) {
    return '<span class="bofa-logo ' + (extra || '') + '">' +
      '<span class="bofa-flag" aria-hidden="true"><i></i><i></i><i></i><i></i></span>' +
      '<span class="bofa-wordmark">Bank of America</span>' +
    '</span>';
  }

  function renderBankApp() {
    const user = currentUser() || {};
    const c = state.citizen;
    const pending = c && c.totals ? c.totals.finesAmount || 0 : 0;
    const pendingCount = c && c.totals ? c.totals.fines || 0 : 0;
    const name = user.displayName || user.username || 'Ciudadano';
    return '<div class="pc-bank pc-app-scroll">' +
      '<header class="bofa-header">' +
        '<div class="bofa-header-inner">' +
          bofaLogoMarkup() +
          '<nav class="bofa-nav">' +
            '<button type="button" class="is-on">Resumen</button>' +
            '<button type="button" data-pc-action="bank-tab">Cuentas</button>' +
            '<button type="button" data-pc-action="bank-tab">Transferencias</button>' +
            '<button type="button" data-pc-action="bank-tab">Tarjetas</button>' +
          '</nav>' +
          '<div class="bofa-user">' + pcAvatar('is-sm') + '<span>Hola, ' + esc(firstName(name)) + '</span></div>' +
        '</div>' +
      '</header>' +
      '<div class="bofa-demo-banner"><b>Simulación de roleplay</b><span>Bank of America dentro de La Realidad RP no es un banco real.</span></div>' +
      '<main class="bofa-main">' +
        '<div class="bofa-greeting"><div><span class="pc-eyebrow">Bank of America</span><h2>Buen día, ' + esc(firstName(name)) + '</h2><p>Este es el resumen de tus cuentas en la ciudad.</p></div><span class="bofa-secure">◈ Conexión segura</span></div>' +
        '<div class="bofa-layout">' +
          '<section class="bofa-balance-card">' +
            '<div class="bofa-balance-top"><span>Saldo total disponible</span><button type="button" data-pc-action="toast" data-message="El detalle de la cuenta estará disponible próximamente.">•••</button></div>' +
            '<b class="bofa-balance">$0.00</b>' +
            '<div class="bofa-accounts">' +
              '<div><span>Cuenta de cheques</span><b>$0.00</b><small>•••• 4821</small></div>' +
              '<div><span>Ahorros</span><b>$0.00</b><small>•••• 9034</small></div>' +
            '</div>' +
            '<div class="bofa-card-actions">' +
              '<button type="button" data-pc-action="toast" data-message="Transferencias disponible próximamente.">Transferir</button>' +
              '<button type="button" data-pc-action="toast" data-message="El pago de tarjeta estará disponible próximamente.">Pagar tarjeta</button>' +
              '<button type="button" data-pc-action="open-app" data-app="civil" data-tab="multas">Ver multas del CAD</button>' +
            '</div>' +
          '</section>' +
          '<aside class="bofa-side-card">' +
            '<span class="pc-eyebrow">CAD · La Realidad RP</span>' +
            '<h3>Multas pendientes</h3>' +
            '<b class="bofa-fines">' + money(pending) + '</b>' +
            '<p>' + (pendingCount ? 'Tenés ' + pendingCount + ' multa' + (pendingCount === 1 ? '' : 's') + ' registrada' + (pendingCount === 1 ? '' : 's') + ' en el CAD. Se abonan en el juego con un oficial.' : 'No tenés multas pendientes en el CAD.') + '</p>' +
            '<button class="pc-btn pc-btn-primary" type="button" data-pc-action="open-app" data-app="civil" data-tab="multas">Ver en Registro Civil</button>' +
          '</aside>' +
        '</div>' +
        '<section class="bofa-quick">' +
          '<button type="button" data-pc-action="toast" data-message="Depósitos disponible próximamente."><span>↙</span><b>Depositar</b><small>Cheques y efectivo</small></button>' +
          '<button type="button" data-pc-action="toast" data-message="Transferencias disponible próximamente."><span>⇄</span><b>Transferir</b><small>Entre cuentas</small></button>' +
          '<button type="button" data-pc-action="toast" data-message="Pago de servicios disponible próximamente."><span>⌁</span><b>Pagar</b><small>Servicios y tarjetas</small></button>' +
          '<button type="button" data-pc-action="toast" data-message="Estado de cuenta disponible próximamente."><span>▤</span><b>Estado de cuenta</b><small>Descargar PDF</small></button>' +
        '</section>' +
        '<div class="bofa-columns">' +
          '<section class="bofa-panel">' +
            '<div class="bofa-panel-head"><div><span class="pc-eyebrow">Actividad</span><h3>Movimientos recientes</h3></div><button type="button" data-pc-action="toast" data-message="No hay más movimientos.">Ver todo</button></div>' +
            '<div class="bofa-empty"><span>▤</span><b>Sin movimientos recientes</b><p>Cuando realices una operación en la ciudad, va a aparecer acá.</p></div>' +
          '</section>' +
          '<section class="bofa-panel">' +
            '<div class="bofa-panel-head"><div><span class="pc-eyebrow">Beneficios</span><h3>Tarjetas para tu personaje</h3></div></div>' +
            '<div class="bofa-offer"><span class="bofa-offer-card red"></span><div><b>Cash Rewards</b><span>3% en categorías seleccionadas</span></div><button type="button" data-pc-action="toast" data-message="Solicitud de tarjeta disponible próximamente.">Solicitar</button></div>' +
            '<div class="bofa-offer"><span class="bofa-offer-card blue"></span><div><b>Travel Rewards</b><span>Sin cargos por cambio de moneda</span></div><button type="button" data-pc-action="toast" data-message="Solicitud de tarjeta disponible próximamente.">Solicitar</button></div>' +
          '</section>' +
        '</div>' +
      '</main>' +
      '<footer class="bofa-foot"><span>Bank of America · Simulación de roleplay</span><span>Miembro FDIC (ficticio) · Igualdad de vivienda</span></footer>' +
    '</div>';
  }

  /* ============================================================
     23) RLA SOCIAL
     ============================================================ */

  function socialAvatar(p) {
    const tone = p.tone || 'teal';
    return '<span class="pc-social-avatar tone-' + esc(tone) + '">' + esc(p.initials || initials(p.name)) + '</span>';
  }

  function renderSocialPost(p) {
    const liked = state.socialLikes.includes(p.id);
    const likes = Number(p.likes || 0) + (liked ? 1 : 0);
    const img = p.image && (/^assets\//.test(p.image) ? p.image : safeUrl(p.image));
    return '<article class="pc-social-post">' +
      '<header class="pc-social-post-head">' + socialAvatar(p) +
        '<div class="pc-social-post-id"><div><b>' + esc(p.name || 'Ciudadano') + '</b>' + (p.badge ? '<span class="pc-social-badge">' + esc(p.badge) + '</span>' : '') + '</div><span>@' + esc(p.handle || 'ciudadano') + ' · ' + esc(p.time || 'Ahora') + '</span></div>' +
        '<button type="button" class="pc-social-more" data-pc-action="toast" data-message="Opciones del post disponibles próximamente.">•••</button>' +
      '</header>' +
      '<p class="pc-social-text">' + esc(p.text || '') + '</p>' +
      (img ? '<div class="pc-social-media"><img src="' + esc(img) + '" alt="" loading="lazy"></div>' : '') +
      '<footer class="pc-social-actions">' +
        '<button type="button" class="' + (liked ? 'is-liked' : '') + '" data-pc-action="social-like" data-post="' + esc(p.id) + '"><span>♥</span>' + likes + '</button>' +
        '<button type="button" data-pc-action="toast" data-message="Los comentarios estarán disponibles próximamente."><span>◌</span>' + esc(p.comments || 0) + '</button>' +
        '<button type="button" data-pc-action="toast" data-message="Enlace copiado (demo)."><span>↗</span>Compartir</button>' +
      '</footer>' +
    '</article>';
  }

  function renderSocialApp() {
    const user = currentUser() || {};
    const posts = state.socialPosts.concat(defaultPosts());
    return '<div class="pc-social pc-app-scroll">' +
      '<header class="pc-social-top">' +
        '<div class="pc-social-brand"><span class="pc-social-logo">RLA</span><div><b>RLA Social</b><span>La comunidad de Los Angeles</span></div></div>' +
        '<nav class="pc-social-nav"><button type="button" class="is-on">Para ti</button><button type="button" data-pc-action="toast" data-message="Siguiendo estará disponible próximamente.">Siguiendo</button></nav>' +
        '<div class="pc-social-user">' + pcAvatar('is-sm') + '<span>@' + esc(user.username || 'ciudadano') + '</span></div>' +
      '</header>' +
      '<div class="pc-social-layout">' +
        '<main class="pc-social-feed">' +
          '<form class="pc-social-compose" id="socialComposeForm">' +
            pcAvatar('pc-social-compose-avatar') +
            '<textarea name="text" rows="2" maxlength="500" placeholder="¿Qué está pasando en la ciudad?" required></textarea>' +
            '<div class="pc-social-compose-actions"><span>Máx. 500 caracteres</span><button class="pc-btn pc-btn-primary pc-btn-sm" type="submit">Publicar</button></div>' +
          '</form>' +
          posts.map(renderSocialPost).join('') +
        '</main>' +
        '<aside class="pc-social-side">' +
          '<section class="pc-social-side-card"><span class="pc-eyebrow">Tendencias</span><h3>En Los Angeles</h3>' +
            '<button type="button" data-pc-action="toast" data-message="Tendencia de roleplay."><b>#OperativoVespucci</b><span>248 publicaciones</span></button>' +
            '<button type="button" data-pc-action="toast" data-message="Tendencia de roleplay."><b>#LAPD</b><span>196 publicaciones</span></button>' +
            '<button type="button" data-pc-action="toast" data-message="Tendencia de roleplay."><b>#RLAStore</b><span>84 publicaciones</span></button>' +
          '</section>' +
          '<section class="pc-social-side-card"><span class="pc-eyebrow">Cuentas oficiales</span><h3>Para seguir</h3>' +
            '<div class="pc-social-follow"><span class="pc-social-avatar tone-blue">LA</span><div><b>LAPD Los Angeles</b><span>@lapd</span></div><button type="button" data-pc-action="toast" data-message="Ya seguís a LAPD Los Angeles.">Siguiendo</button></div>' +
            '<div class="pc-social-follow"><span class="pc-social-avatar tone-red">911</span><div><b>Central 911</b><span>@central911</span></div><button type="button" data-pc-action="toast" data-message="Ya seguís a Central 911.">Siguiendo</button></div>' +
            '<div class="pc-social-follow"><span class="pc-social-avatar tone-orange">RLA</span><div><b>RLA Store</b><span>@rlastore</span></div><button type="button" data-pc-action="toast" data-message="Ya seguís a RLA Store.">Siguiendo</button></div>' +
          '</section>' +
          '<footer class="pc-social-side-foot">RLA Social · Roleplay · La Realidad RP</footer>' +
        '</aside>' +
      '</div>' +
    '</div>';
  }

  /* ============================================================
     24) RLA WORK
     ============================================================ */

  function renderWorkApp() {
    const jobs = defaultJobs();
    const q = norm(state.workQuery);
    const category = WORK_CATEGORIES.includes(state.workCategory) ? state.workCategory : 'todas';
    const filtered = jobs.filter((job) => {
      const catOk = category === 'todas' || job.cat === category;
      const qOk = !q || norm(job.title + ' ' + job.company + ' ' + job.text + ' ' + job.cat).includes(q);
      return catOk && qOk;
    });
    return '<div class="pc-work pc-app-scroll">' +
      '<header class="pc-work-hero">' +
        '<div class="pc-work-brand"><span class="pc-work-logo">RLA</span><div><b>RLA Work</b><span>Empleos de Los Angeles</span></div></div>' +
        '<form class="pc-work-search" id="workForm"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input name="q" type="search" value="' + esc(state.workQuery) + '" placeholder="Buscar empleo, empresa o puesto…" aria-label="Buscar empleo"></form>' +
        '<button class="pc-btn pc-btn-ghost" type="button" data-pc-action="open-url" data-url="' + esc(safeUrl(CFG.discord || '')) + '">Abrir Discord</button>' +
      '</header>' +
      '<div class="pc-work-main">' +
        '<div class="pc-work-intro"><div><span class="pc-eyebrow">Bolsa de empleo</span><h2>Encontrá tu próximo trabajo en la ciudad.</h2><p>Policía, emergencias, comercios y empresas de roleplay. Postulate y completá el proceso con el staff en Discord.</p></div><div class="pc-work-stats"><div><b>' + jobs.length + '</b><span>Vacantes</span></div><div><b>' + state.workApplied.length + '</b><span>Postulaciones</span></div><div><b>4</b><span>Empresas</span></div></div></div>' +
        '<div class="pc-work-categories">' + WORK_CATEGORIES.map((cat) => '<button type="button" class="' + (category === cat ? 'is-on' : '') + '" data-pc-action="work-cat" data-category="' + esc(cat) + '">' + esc(cat) + '</button>').join('') + '</div>' +
        '<div class="pc-work-layout">' +
          '<div class="pc-work-list">' +
            (filtered.length ? filtered.map((job) => {
              const applied = state.workApplied.includes(job.id);
              return '<article class="pc-job-card">' +
                '<div class="pc-job-logo tone-' + esc(job.tone) + '">' + esc(job.initials) + '</div>' +
                '<div class="pc-job-main"><div class="pc-job-head"><h3>' + esc(job.title) + '</h3>' + pcChip(job.type, 'neutral') + '</div>' +
                  '<b>' + esc(job.company) + '</b>' +
                  '<div class="pc-job-meta"><span>⌖ ' + esc(job.location) + '</span><span>◷ ' + esc(job.type) + '</span><span>▣ ' + esc(job.salary) + '</span></div>' +
                  '<p>' + esc(job.text) + '</p>' +
                  '<div class="pc-job-foot"><span class="pc-job-tag">' + esc(job.cat) + '</span>' +
                    (applied
                      ? '<button class="pc-btn pc-btn-ghost pc-btn-sm" type="button" disabled>Postulación guardada</button>'
                      : '<button class="pc-btn pc-btn-primary pc-btn-sm" type="button" data-pc-action="work-apply" data-job="' + esc(job.id) + '">Postularme</button>') +
                  '</div>' +
                '</div>' +
              '</article>';
            }).join('') : pcEmpty('💼', 'No encontramos empleos', 'Probá con otra búsqueda o categoría.')) +
          '</div>' +
          '<aside class="pc-work-side">' +
            '<section class="pc-panel"><span class="pc-eyebrow">Cómo funciona</span><h3>Tu postulación</h3><ol class="pc-work-steps"><li><b>Elegí una vacante</b><span>Revisá requisitos, horario y salario.</span></li><li><b>Postulate desde RLA Work</b><span>Guardamos tu interés en esta PC.</span></li><li><b>Completá el proceso</b><span>El staff te contacta por Discord.</span></li></ol><button class="pc-btn pc-btn-primary" type="button" data-pc-action="open-url" data-url="' + esc(safeUrl(CFG.discord || '')) + '">Ir a Discord</button></section>' +
            '<section class="pc-panel pc-work-tip"><span class="pc-eyebrow">Consejo</span><h3>Prepará tu personaje</h3><p>Escribí una breve historia, revisá tu DNI y asegurate de tener la licencia si el puesto requiere vehículo.</p><button class="pc-btn pc-btn-ghost" type="button" data-pc-action="open-app" data-app="civil">Abrir Registro Civil</button></section>' +
          '</aside>' +
        '</div>' +
      '</div>' +
      '<footer class="pc-work-foot"><span>RLA Work · Bolsa de empleo de roleplay</span><span>Las postulaciones se confirman con el staff en Discord.</span></footer>' +
    '</div>';
  }

  /* ============================================================
     25) GOOGLE
     ============================================================ */

  function googleLogo(cls) {
    return '<span class="pc-google-logo ' + (cls || '') + '"><span>G</span><span>o</span><span>o</span><span>g</span><span>l</span><span>e</span></span>';
  }

  function googleQuickCard(appId, title, text) {
    return '<button type="button" class="pc-google-quick" data-pc-action="open-app" data-app="' + appId + '">' + appIcon(appId, 'is-md') +
      '<div><b>' + esc(title) + '</b><span>' + esc(text) + '</span></div>' +
      '<i>→</i>' +
    '</button>';
  }

  function buildGoogleResults(query) {
    const q = norm(query);
    const results = [];
    const apps = APP_ORDER.filter((id) => id !== 'trash' && !['google'].includes(id))
      .filter((id) => norm(APPS[id].name + ' ' + APPS[id].keywords + ' ' + APPS[id].storeDesc).includes(q))
      .slice(0, 5);
    apps.forEach((id) => {
      results.push({
        kind: 'Aplicación',
        title: APPS[id].name,
        text: APPS[id].storeDesc,
        action: '<button type="button" class="pc-google-result-btn" data-pc-action="open-app" data-app="' + id + '">Abrir app</button>',
        icon: appIcon(id, 'is-sm'),
      });
    });

    const c = state.citizen;
    const addCivil = (tab, title, text) => results.push({
      kind: 'Registro Civil',
      title,
      text,
      action: '<button type="button" class="pc-google-result-btn" data-pc-action="open-app" data-app="civil" data-tab="' + tab + '">Abrir</button>',
      icon: appIcon('civil', 'is-sm'),
    });
    if (c && (q.includes('dni') || q.includes('identidad') || q.includes('documento'))) addCivil('dni', 'Mi DNI — ' + c.name, 'DNI ' + c.dni + ' · ' + ageText(c) + ' · California Identity Card');
    if (c && (q.includes('licencia') || q.includes('conducir'))) addCivil('licencia', 'Mi licencia — ' + licenseInfo(c).label, licenseInfo(c).number ? 'Número ' + licenseInfo(c).number + ' · vence ' + dateFmt(licenseInfo(c).expiresAt) : 'Consultá el estado y solicitá tu licencia desde el panel.');
    if (c && (q.includes('multa') || q.includes('deuda'))) addCivil('multas', 'Mis multas — ' + money(c.totals.finesAmount), c.totals.fines + ' multa' + (c.totals.fines === 1 ? '' : 's') + ' pendiente' + (c.totals.fines === 1 ? '' : 's') + ' en el CAD.');
    if (c && (q.includes('vehiculo') || q.includes('auto') || q.includes('garage'))) addCivil('vehiculos', 'Mis vehículos — ' + c.totals.vehicles, c.totals.vehicles ? 'Vehículos registrados a tu nombre en el CAD.' : 'No tenés vehículos registrados.');
    if (c && (q.includes('orden') || q.includes('antecedente'))) addCivil('antecedentes', 'Mis antecedentes', 'Notas, multas y órdenes del CAD en un solo expediente.');
    if (q.includes('perfil') || q.includes('cuenta')) results.push({ kind: 'RLA OS', title: 'Mi perfil', text: 'Tu cuenta de Discord, Roblox y personaje.', action: '<button type="button" class="pc-google-result-btn" data-pc-action="open-app" data-app="profile">Abrir</button>', icon: appIcon('profile', 'is-sm') });
    if (q.includes('banco') || q.includes('dinero') || q.includes('bank')) results.push({ kind: 'RLA OS', title: 'Bank of America', text: 'Resumen de cuentas y multas pendientes.', action: '<button type="button" class="pc-google-result-btn" data-pc-action="open-app" data-app="bank">Abrir</button>', icon: appIcon('bank', 'is-sm') });

    if (q.includes('discord')) results.push({ kind: 'Comunidad', title: 'Discord de La Realidad RP', text: 'Unite al servidor, abrí tickets y hablá con el staff.', action: '<button type="button" class="pc-google-result-btn" data-pc-action="open-url" data-url="' + esc(safeUrl(CFG.discord || '')) + '">Abrir Discord</button>', icon: appIcon('social', 'is-sm') });
    if (q.includes('911') || q.includes('emergencia')) results.push({ kind: 'Central', title: 'Central 911', text: 'Llamá a la central para reportar una emergencia.', action: '<button type="button" class="pc-google-result-btn" data-pc-action="open-url" data-url="' + esc(safeUrl(CFG.central911 || '')) + '">Llamar</button>', icon: appIcon('whatsapp', 'is-sm') });
    if (q.includes('cad') || q.includes('descargar')) results.push({ kind: 'CAD', title: 'Descargar el CAD', text: 'Instalá la aplicación de escritorio del CAD de Los Angeles.', action: '<button type="button" class="pc-google-result-btn" data-pc-action="open-url" data-url="' + esc(safeUrl(CFG.cadDescarga || '')) + '">Descargar</button>', icon: appIcon('vps', 'is-sm') });
    return results;
  }

  function renderGoogleResult(result) {
    return '<article class="pc-google-result">' + result.icon +
      '<div class="pc-google-result-main"><span>' + esc(result.kind) + ' · rla.os</span>' +
        '<h3>' + esc(result.title) + '</h3><p>' + esc(result.text) + '</p>' + result.action +
      '</div>' +
    '</article>';
  }

  function renderGoogleApp() {
    const q = state.googleQuery || '';
    const results = q ? buildGoogleResults(q) : [];
    const user = currentUser() || {};
    const header = '<header class="pc-google-top">' +
      '<button class="pc-google-top-link" type="button" data-pc-action="open-app" data-app="civil">Registro Civil</button>' +
      '<button class="pc-google-top-link" type="button" data-pc-action="open-app" data-app="store">RLA Store</button>' +
      '<div class="pc-google-top-right"><button type="button" class="pc-google-icon-btn" data-pc-action="open-app" data-app="store" title="Aplicaciones">▦</button>' + pcAvatar('is-sm') + '</div>' +
    '</header>';
    const form = '<form class="pc-google-search' + (q ? ' is-compact' : '') + '" id="googleForm">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>' +
      '<input name="q" type="search" value="' + esc(q) + '" placeholder="Buscá en RLA OS o en la web" autocomplete="off" aria-label="Buscar"> ' +
      '<span class="pc-google-mic">◉</span><span class="pc-google-lens">▣</span>' +
      (q ? '<button type="button" class="pc-google-clear" data-pc-action="google-clear" title="Limpiar búsqueda">✕</button>' : '') +
    '</form>';

    if (!q) {
      return '<div class="pc-google pc-app-scroll">' + header +
        '<main class="pc-google-home">' + googleLogo() + form +
          '<div class="pc-google-chips"><button type="button" data-pc-action="open-app" data-app="civil">Mi DNI</button><button type="button" data-pc-action="open-app" data-app="civil" data-tab="multas">Mis multas</button><button type="button" data-pc-action="open-app" data-app="bank">Bank of America</button><button type="button" data-pc-action="open-app" data-app="work">Empleos</button></div>' +
          '<div class="pc-google-quick-grid">' +
            googleQuickCard('civil', 'Registro Civil', 'DNI, licencia, vehículos y antecedentes.') +
            googleQuickCard('store', 'RLA Store', 'Instalá apps para tu RLA OS.') +
            googleQuickCard('bank', 'Bank of America', 'Tus cuentas y multas del CAD.') +
            googleQuickCard('social', 'RLA Social', 'La comunidad de Los Angeles.') +
            googleQuickCard('work', 'RLA Work', 'Encontrá empleo en la ciudad.') +
            googleQuickCard('files', 'Archivos', 'Documentos y copia de tu expediente.') +
          '</div>' +
          '<div class="pc-google-home-foot"><span>RLA OS · Buscador interno</span><button type="button" data-pc-action="open-url" data-url="https://www.google.com">Ir a Google</button></div>' +
        '</main>' +
      '</div>';
    }

    return '<div class="pc-google pc-app-scroll">' + header +
      '<div class="pc-google-results-head">' + googleLogo('is-small') + form + '</div>' +
      '<main class="pc-google-results">' +
        '<p class="pc-google-count">' + (results.length ? results.length + ' resultado' + (results.length === 1 ? '' : 's') + ' para “' + esc(q) + '”' : 'No encontramos resultados internos para “' + esc(q) + '”.') + '</p>' +
        results.map(renderGoogleResult).join('') +
        '<div class="pc-google-external"><span>¿No encontrás lo que buscás?</span><button type="button" data-pc-action="open-url" data-url="https://www.google.com/search?q=' + encodeURIComponent(q) + '">Buscar “' + esc(q) + '” en Google</button></div>' +
        '<p class="pc-google-privacy">RLA OS busca solo en tus apps y registros. Las búsquedas externas se abren en una pestaña nueva.</p>' +
      '</main>' +
    '</div>';
  }

  /* ============================================================
     26) WHATSAPP
     ============================================================ */

  function mountWhatsappApp() {
    const box = $('#pcWaMessages');
    if (box) requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
  }

  function renderWhatsappApp() {
    const user = currentUser() || {};
    const chats = state.waChats || [];
    const chat = chats.find((c) => c.id === state.waChat) || null;
    return '<div class="pc-wa' + (chat ? ' has-chat' : '') + '">' +
      '<aside class="pc-wa-side">' +
        '<header class="pc-wa-side-head"><div class="pc-wa-me">' + pcAvatar('is-sm') + '<b>' + esc(user.displayName || user.username || 'Ciudadano') + '</b></div><button type="button" data-pc-action="toast" data-message="Nuevo chat disponible próximamente." title="Nuevo chat">＋</button></header>' +
        '<label class="pc-wa-search"><span>⌕</span><input type="search" placeholder="Buscar chats" aria-label="Buscar chats" disabled></label>' +
        '<div class="pc-wa-chats">' +
          chats.map((c) => {
            const last = c.messages[c.messages.length - 1];
            return '<button type="button" class="pc-wa-chat' + (chat && chat.id === c.id ? ' is-on' : '') + '" data-pc-action="wa-chat" data-chat="' + esc(c.id) + '">' +
              '<span class="pc-wa-avatar tone-' + esc(c.tone || 'teal') + '">' + esc(c.initials) + '</span>' +
              '<span class="pc-wa-chat-main"><b>' + esc(c.name) + '</b><small>' + esc(last ? last.text : 'Sin mensajes') + '</small></span>' +
              '<span class="pc-wa-chat-time">' + esc(last ? last.time : '') + '</span>' +
            '</button>';
          }).join('') +
        '</div>' +
        '<footer class="pc-wa-side-foot"><span>Mensajes simulados de roleplay</span><button type="button" data-pc-action="open-url" data-url="' + esc(safeUrl(CFG.discord || '')) + '">Abrir Discord</button></footer>' +
      '</aside>' +
      '<section class="pc-wa-main">' +
        (chat
          ? '<header class="pc-wa-head"><button type="button" class="pc-wa-back" data-pc-action="wa-back" title="Volver">←</button><span class="pc-wa-avatar tone-' + esc(chat.tone || 'teal') + '">' + esc(chat.initials) + '</span><div><b>' + esc(chat.name) + '</b><span>' + esc(chat.status || 'En línea') + '</span></div><div class="pc-wa-head-actions"><button type="button" data-pc-action="toast" data-message="Llamadas disponible próximamente." title="Llamar">☎</button><button type="button" data-pc-action="toast" data-message="Opciones del chat disponible próximamente." title="Opciones">⋮</button></div></header>' +
            '<div class="pc-wa-messages" id="pcWaMessages">' +
              chat.messages.map((m) => '<div class="pc-wa-msg ' + (m.from === 'me' ? 'is-mine' : 'is-them') + '"><div class="pc-wa-bubble"><p>' + esc(m.text) + '</p><span>' + esc(m.time || '') + (m.from === 'me' ? ' ✓✓' : '') + '</span></div></div>').join('') +
            '</div>' +
            '<form class="pc-wa-compose" id="waForm"><input name="message" type="text" placeholder="Escribí un mensaje…" autocomplete="off" maxlength="500" aria-label="Mensaje"><button type="submit" title="Enviar">➤</button></form>'
          : '<div class="pc-wa-empty"><span>💬</span><h3>Seleccioná un chat</h3><p>Elegí una conversación de la izquierda para empezar.</p></div>') +
      '</section>' +
    '</div>';
  }

  /* ============================================================
     27) MERCADOLIBRE
     ============================================================ */

  function renderMercadoApp() {
    const products = defaultMlProducts();
    const q = norm(state.mlQuery);
    const cat = state.mlCategory || 'todas';
    const filtered = products.filter((p) => {
      const catOk = cat === 'todas' || p.cat === cat;
      const qOk = !q || norm(p.title + ' ' + p.cat).includes(q);
      return catOk && qOk;
    });
    const cartCount = state.mlCart.reduce((n, i) => n + i.qty, 0);
    const cartTotal = state.mlCart.reduce((sum, i) => {
      const p = products.find((x) => x.id === i.id);
      return sum + (p ? p.price * i.qty : 0);
    }, 0);
    const user = currentUser() || {};

    let body = '';
    if (state.mlCartOpen) {
      body = '<div class="pc-ml-cart-page"><div class="pc-ml-cart-head"><div><span class="pc-eyebrow">Tu compra</span><h2>Carrito</h2></div><button class="pc-btn pc-btn-ghost" type="button" data-pc-action="ml-cart">Seguir comprando</button></div>' +
        (state.mlCart.length
          ? '<div class="pc-ml-cart-list">' + state.mlCart.map((item) => {
              const p = products.find((x) => x.id === item.id);
              if (!p) return '';
              return '<div class="pc-ml-cart-row"><span class="pc-ml-prod-art">' + p.emoji + '</span><div><b>' + esc(p.title) + '</b><span>' + esc(p.shipping) + ' · ' + item.qty + ' unidad' + (item.qty === 1 ? '' : 'es') + '</span></div><b>' + money(p.price * item.qty) + '</b><button type="button" data-pc-action="ml-remove" data-product="' + esc(p.id) + '" title="Quitar">✕</button></div>';
            }).join('') + '</div>' +
            '<div class="pc-ml-cart-summary"><div><span>Productos</span><b>' + money(cartTotal) + '</b></div><div><span>Envío</span><b class="pc-ok-text">Gratis</b></div><div class="pc-ml-cart-total"><span>Total</span><b>' + money(cartTotal) + '</b></div><button class="pc-btn pc-btn-primary" type="button" data-pc-action="ml-checkout">Finalizar compra</button></div>'
          : pcEmpty('🛒', 'Tu carrito está vacío', 'Agregá productos desde el catálogo.', '<button class="pc-btn pc-btn-primary" type="button" data-pc-action="ml-cart">Ver productos</button>')) +
        '<p class="pc-ml-disclaimer">Compra simulada de roleplay. No se procesan pagos reales.</p></div>';
    } else {
      body = '<div class="pc-ml-banner"><div><span class="pc-eyebrow">Ofertas de la ciudad</span><h2>Todo lo que necesitás para tu personaje.</h2><p>Tecnología, repuestos, uniformes y más. Envíos simulados en Los Angeles.</p></div><span class="pc-ml-banner-art">🛍️</span></div>' +
        '<div class="pc-ml-categories">' + ML_CATEGORIES.map((c) => '<button type="button" class="' + (cat === c ? 'is-on' : '') + '" data-pc-action="ml-cat" data-category="' + esc(c) + '">' + esc(c === 'todas' ? 'Todas' : c) + '</button>').join('') + '</div>' +
        '<div class="pc-ml-section-head"><div><span class="pc-eyebrow">Catálogo</span><h3>' + (q ? 'Resultados para “' + esc(state.mlQuery) + '”' : 'Productos destacados') + '</h3></div><span class="pc-muted">' + filtered.length + ' productos</span></div>' +
        (filtered.length ? '<div class="pc-ml-grid">' + filtered.map((p) =>
          '<article class="pc-ml-card">' +
            '<div class="pc-ml-prod-art">' + p.emoji + (p.tag ? '<span class="pc-ml-tag">' + esc(p.tag) + '</span>' : '') + '</div>' +
            '<div class="pc-ml-card-body"><span class="pc-ml-cat">' + esc(p.cat) + '</span><h3>' + esc(p.title) + '</h3><div class="pc-ml-rating">★ ' + esc(String(p.rating)) + ' <span>·</span> ' + esc(p.shipping) + '</div><b class="pc-ml-price">' + money(p.price) + '</b>' +
              '<button class="pc-btn pc-btn-primary pc-btn-sm" type="button" data-pc-action="ml-add" data-product="' + esc(p.id) + '">Agregar al carrito</button>' +
            '</div>' +
          '</article>').join('') + '</div>'
          : pcEmpty('🔎', 'No encontramos productos', 'Probá con otra búsqueda o categoría.')) +
        '<p class="pc-ml-disclaimer">MercadoLibre es una simulación de roleplay. No se procesan pagos reales.</p>';
    }

    return '<div class="pc-ml pc-app-scroll">' +
      '<header class="pc-ml-top">' +
        '<div class="pc-ml-logo"><span>Mercado</span><b>Libre</b></div>' +
        '<form class="pc-ml-search" id="mlForm"><input name="q" type="search" value="' + esc(state.mlQuery) + '" placeholder="Buscar productos, marcas y más…" aria-label="Buscar productos"><button type="submit" aria-label="Buscar">⌕</button></form>' +
        '<div class="pc-ml-top-actions"><button type="button" class="pc-ml-cart-btn" data-pc-action="ml-cart" title="Carrito">🛒<i>' + cartCount + '</i></button><span class="pc-ml-user">' + pcAvatar('is-sm') + '<b>' + esc(firstName(user.displayName || user.username || 'Ciudadano')) + '</b></span></div>' +
      '</header>' +
      '<main class="pc-ml-main">' + body + '</main>' +
      '<footer class="pc-ml-foot"><span>MercadoLibre · Simulación de roleplay</span><span>Los Angeles, California</span></footer>' +
    '</div>';
  }

  /* ============================================================
     28) ONION
     ============================================================ */

  function renderOnionApp() {
    const site = ONION_SITES[state.onionSite] || ONION_SITES.home;
    const address = state.onionSite === 'home' ? 'onion://home' : 'onion://' + state.onionSite;
    return '<div class="pc-onion">' +
      '<div class="pc-onion-browser">' +
        '<div class="pc-onion-dots"><i></i><i></i><i></i></div>' +
        '<button type="button" class="pc-onion-nav" data-pc-action="onion-back" title="Inicio">←</button>' +
        '<form class="pc-onion-address" id="onionForm"><span>◈</span><input name="url" type="text" value="' + esc(address) + '" spellcheck="false" aria-label="Dirección Onion"></form>' +
        '<span class="pc-onion-shield" title="Conexión simulada">◉</span>' +
      '</div>' +
      '<div class="pc-onion-page pc-app-scroll">' +
        '<div class="pc-onion-warn"><b>Red Onion simulada</b><span>Este navegador es parte de La Realidad RP. No accede a la dark web real.</span></div>' +
        '<header class="pc-onion-head"><span class="pc-onion-mark">◉</span><div><span class="pc-eyebrow">' + esc(site.kicker) + '</span><h2>' + esc(site.title) + '</h2></div></header>' +
        (state.onionError ? '<div class="pc-alert red"><b>No se pudo resolver el sitio</b><span>' + esc(state.onionError) + '</span></div>' : '') +
        '<div class="pc-onion-body">' + site.body + '</div>' +
        '<footer class="pc-onion-foot"><span>onion:// · Navegación privada de roleplay</span><span>Sin rastreo · Sin cookies reales</span></footer>' +
      '</div>' +
    '</div>';
  }

  /* ============================================================
     29) VPS MANAGER
     ============================================================ */

  function renderVpsApp() {
    const servers = state.vpsServers || [];
    const online = servers.filter((s) => s.status === 'online').length;
    return '<div class="pc-vps pc-app-scroll">' +
      '<header class="pc-vps-head"><div><span class="pc-eyebrow">RLA Systems · Infraestructura</span><h2>VPS Manager</h2><p>Monitoreo de los servidores de la ciudad. Datos de demostración.</p></div><div class="pc-vps-head-actions"><span class="pc-status-pill"><i class="pc-status-dot ok"></i>' + online + '/' + servers.length + ' en línea</span><button class="pc-btn pc-btn-ghost" type="button" data-pc-action="open-app" data-app="entornos">Ver Entornos</button></div></header>' +
      '<div class="pc-vps-grid">' +
        servers.map((s) => {
          const tone = s.status === 'online' ? 'ok' : (s.status === 'restarting' ? 'gold' : 'red');
          return '<article class="pc-vps-card ' + tone + '">' +
            '<div class="pc-vps-card-head"><div><span class="pc-vps-prompt">$</span><b>' + esc(s.name) + '</b><small>' + esc(s.role) + '</small></div><span class="pc-vps-status"><i class="pc-status-dot ' + tone + '"></i>' + esc(s.status === 'online' ? 'Online' : s.status === 'restarting' ? 'Reiniciando' : 'Offline') + '</span></div>' +
            '<div class="pc-vps-metrics">' +
              '<div><span>CPU <b>' + s.cpu + '%</b></span><i><em style="width:' + clamp(s.cpu, 0, 100) + '%"></em></i></div>' +
              '<div><span>RAM <b>' + s.ram + '%</b></span><i><em style="width:' + clamp(s.ram, 0, 100) + '%"></em></i></div>' +
              '<div><span>Disco <b>' + s.disk + '%</b></span><i><em style="width:' + clamp(s.disk, 0, 100) + '%"></em></i></div>' +
            '</div>' +
            '<div class="pc-vps-foot"><span>' + esc(s.uptime) + ' uptime · ' + esc(s.ping) + ' ms</span><div><button type="button" data-pc-action="vps-restart" data-server="' + esc(s.id) + '" ' + (s.status === 'restarting' ? 'disabled' : '') + '>Reiniciar</button><button type="button" data-pc-action="toast" data-message="La consola de ' + esc(s.name) + ' estará disponible próximamente.">Consola</button></div></div>' +
          '</article>';
        }).join('') +
      '</div>' +
      '<section class="pc-vps-console"><div class="pc-vps-console-head"><span class="pc-vps-dots"><i></i><i></i><i></i></span><b>rla-systems — logs</b><button type="button" data-pc-action="toast" data-message="Consola interactiva disponible próximamente.">Abrir consola</button></div><div class="pc-vps-lines">' +
        (state.vpsConsole || []).slice(-8).map((line) => '<p class="' + (line.includes('[OK]') ? 'ok' : line.includes('[INFO]') ? 'info' : '') + '">' + esc(line) + '</p>').join('') +
      '</div></section>' +
      '<footer class="pc-vps-foot-note">Los servidores y las métricas son de demostración para el roleplay. No representan infraestructura real.</footer>' +
    '</div>';
  }

  /* ============================================================
     30) CRYPTO WALLET
     ============================================================ */

  function renderCryptoApp() {
    const assets = state.cryptoAssets || [];
    const total = assets.reduce((sum, a) => sum + (a.price * a.balance), 0);
    return '<div class="pc-crypto pc-app-scroll">' +
      '<header class="pc-crypto-head"><div class="pc-crypto-brand"><span class="pc-crypto-mark">◈</span><div><b>RLA Wallet</b><span>Billetera de roleplay</span></div></div><div class="pc-crypto-head-right"><span class="pc-crypto-address">rla1q…7k9d</span>' + pcAvatar('is-sm') + '</div></header>' +
      '<section class="pc-crypto-portfolio"><div><span class="pc-eyebrow">Portafolio total</span><b>' + money(total) + '</b><p>Saldo disponible en tu billetera de roleplay.</p></div><div class="pc-crypto-actions"><button class="pc-btn pc-btn-primary" type="button" data-pc-action="crypto-toast" data-message="Recibir criptomonedas estará disponible próximamente.">Recibir</button><button class="pc-btn pc-btn-ghost" type="button" data-pc-action="crypto-toast" data-message="Enviar criptomonedas estará disponible próximamente.">Enviar</button><button class="pc-btn pc-btn-ghost" type="button" data-pc-action="crypto-toast" data-message="Comprar criptomonedas estará disponible próximamente.">Comprar</button></div></section>' +
      '<div class="pc-crypto-grid">' +
        '<section class="pc-panel"><div class="pc-panel-head"><div><span class="pc-eyebrow">Activos</span><h3>Tus monedas</h3></div><span class="pc-muted">Precios de demostración</span></div>' +
          '<div class="pc-crypto-assets">' + assets.map((a) => '<div class="pc-crypto-asset"><span class="pc-crypto-coin tone-' + esc(a.tone) + '">' + esc(a.ticker.slice(0, 1)) + '</span><div><b>' + esc(a.name) + '</b><span>' + esc(a.ticker) + ' · ' + a.balance + ' ' + esc(a.ticker) + '</span></div><div class="pc-crypto-price"><b>' + money(a.price) + '</b><span class="' + (String(a.change).startsWith('-') ? 'pc-down' : 'pc-up') + '">' + esc(a.change) + '</span></div></div>').join('') + '</div>' +
        '</section>' +
        '<section class="pc-panel"><div class="pc-panel-head"><div><span class="pc-eyebrow">Actividad</span><h3>Movimientos</h3></div></div><div class="pc-crypto-empty"><span>◈</span><b>Sin movimientos</b><p>Cuando envíes o recibas criptomonedas, van a aparecer acá.</p><button class="pc-btn pc-btn-ghost" type="button" data-pc-action="crypto-toast" data-message="El historial estará disponible próximamente.">Ver historial</button></div></section>' +
      '</div>' +
      '<p class="pc-crypto-note">RLA Wallet es una simulación de roleplay. No es una billetera real, no guarda fondos y no procesa transacciones.</p>' +
    '</div>';
  }

})();
