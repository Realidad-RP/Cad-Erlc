/* ============================================================
   LA REALIDAD RP — Lógica compartida de todas las páginas
   (menú móvil, enlaces, estadísticas, reseñas y equipo)
   ============================================================ */

(function () {
  'use strict';

  const CFG = window.LR_CONFIG || {};

  /* ---------- Ayudas ---------- */
  const $  = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const STAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01z"/></svg>';

  /* ============================================================
     1b) CUENTAS DISCORD — PANEL DE CIUDADANO
     ------------------------------------------------------------
     Registro con usuario de Discord + contraseña + código por MD.
     El bot guarda las cuentas y las reseñas en un canal privado.
     ============================================================ */

  const API = (() => {
    const local = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1)$/i.test(location.hostname);
    const base = local ? 'http://localhost:8790' : (CFG.apiBase || 'https://cad-erlc-bot.onrender.com');
    return String(base).replace(/\/+$/, '');
  })();

  const TOKEN_KEY = 'lr_auth_token_v1';
  const USER_KEY = 'lr_auth_user_v1';
  const LAST_USER_KEY = 'lr_auth_last_username';
  const PHOTOS = ['assets/foto-lapd.jpg', 'assets/foto-chp.jpg', 'assets/foto-lafd.jpg'];

  let pendingAuth = null;   // { username, password }
  let pendingReset = null;  // username
  let resendTimer = null;
  let resendLeft = 0;

  function randomPhoto() { return PHOTOS[Math.floor(Math.random() * PHOTOS.length)]; }

  function shuffle(list) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  const Auth = {
    token: '',
    user: null,
    load() {
      try { this.token = localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { this.token = ''; }
      try { this.user = JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch (e) { this.user = null; }
      if (!this.token) this.user = null;
    },
    save() {
      try {
        if (this.token) localStorage.setItem(TOKEN_KEY, this.token);
        else localStorage.removeItem(TOKEN_KEY);
        if (this.user) localStorage.setItem(USER_KEY, JSON.stringify(this.user));
        else localStorage.removeItem(USER_KEY);
      } catch (e) { /* modo privado */ }
    },
    setSession(token, user) {
      this.token = token || '';
      this.user = user || null;
      this.save();
      updateAuthUI();
    },
    clear() {
      this.token = '';
      this.user = null;
      this.save();
      updateAuthUI();
    },
    async api(pathname, { method = 'GET', json, headers = {} } = {}) {
      const opts = { method, headers: Object.assign({}, headers) };
      if (json !== undefined) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(json);
      }
      if (this.token) opts.headers.Authorization = 'Bearer ' + this.token;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 75000);
      const run = () => fetch(API + pathname, Object.assign({}, opts, { signal: controller.signal }));
      try {
        let res;
        try {
          res = await run();
        } catch (err) {
          if (err.name === 'AbortError') throw err;
          await new Promise((r) => setTimeout(r, 1200));
          res = await run();
        }
        let data = {};
        try { data = await res.json(); } catch (e) { data = {}; }
        if (!res.ok) {
          const error = new Error(data.error || ('Error del servidor (' + res.status + ')'));
          error.status = res.status;
          throw error;
        }
        return data;
      } catch (err) {
        if (err.name === 'AbortError') {
          throw new Error('El servidor tardó demasiado. Puede estar despertando: probá de nuevo.');
        }
        if (err instanceof TypeError) {
          throw new Error('No pude conectar con el servidor de cuentas. Revisá tu internet e intentá de nuevo.');
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    },
    async init() {
      this.load();
      updateAuthUI();
      if (!this.token) return;
      try {
        const d = await this.api('/auth/me');
        if (d && d.user) {
          this.user = d.user;
          this.save();
          updateAuthUI();
        }
      } catch (err) {
        if (err.status === 401) this.clear();
      }
    },
  };

  /* ============================================================
     1) ENLACES Y TEXTOS DESDE config.js
     ============================================================ */
  function applyConfig() {
    const links = {
      discord:   CFG.discord || '',
      instagram: CFG.instagram || '',
      tiktok:    CFG.tiktok || '',
      youtube:   CFG.youtube || '',
      correo:    CFG.correo ? 'mailto:' + CFG.correo : '',
      cad:       CFG.cadDescarga || '',
      c911:      CFG.central911 || ''
    };

    $$('[data-link]').forEach((el) => {
      const url = links[el.getAttribute('data-link')];
      if (url) {
        el.setAttribute('href', url);
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener');
      } else {
        el.style.display = 'none';
      }
    });

    // Año del pie de página
    const anio = $('#anio');
    if (anio) anio.textContent = CFG.anio || new Date().getFullYear();

    // Jugadores en línea (varias etiquetas con .js-online)
    $$('.js-online').forEach((el) => { el.textContent = CFG.online || '—'; });
  }

  /* ============================================================
     2) CABECERA: fondo al hacer scroll + menú móvil
     ============================================================ */
  function setupHeader() {
    const header = $('.site-header');
    const burger = $('#btnMenu');
    const nav = $('#navLinks');

    if (header) {
      const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }

    if (burger && nav) {
      burger.addEventListener('click', () => nav.classList.toggle('open'));
      $$('a', nav).forEach((a) => a.addEventListener('click', () => nav.classList.remove('open')));
    }
  }

  /* ============================================================
     3) APARICIÓN SUAVE AL HACER SCROLL
     ============================================================ */
  function setupReveal() {
    const targets = $$('.reveal, .card, .stats, .cta-band, .rating-panel, .form-card, .prose .rule');
    if (!targets.length) return;

    if (!('IntersectionObserver' in window)) {
      targets.forEach((t) => t.classList.add('visible'));
      return;
    }

    targets.forEach((t) => {
      if (!t.classList.contains('reveal')) t.classList.add('reveal');
    });

    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const el = e.target;
        const siblings = el.parentElement ? Array.from(el.parentElement.children) : [];
        const idx = Math.max(0, siblings.indexOf(el));
        el.style.transitionDelay = ((idx % 4) * 70) + 'ms';
        el.classList.add('visible');
        io.unobserve(el);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    targets.forEach((t) => io.observe(t));
  }

  /* ============================================================
     4) ESTADÍSTICAS (contadores animados)
     ============================================================ */
  function animateNumber(el, target, decimals) {
    if (!el) return;
    if (!isFinite(target) || target <= 0) { el.textContent = '—'; return; }

    const dur = 900;
    const t0 = performance.now();
    const dec = decimals || 0;

    function frame(now) {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = (target * eased).toFixed(dec);
      if (p < 1) requestAnimationFrame(frame);
      else el.textContent = target.toFixed(dec);
    }
    requestAnimationFrame(frame);
  }

  /* ============================================================
     5) RESEÑAS DE LA COMUNIDAD
     ------------------------------------------------------------
     Se guardan en el servidor del bot (producción: un canal
     privado de Discord) para que el muro sea el mismo en todos
     los dispositivos. localStorage queda solo como caché para
     mostrar la última copia si el servidor no responde.
     ============================================================ */
  const STORE_KEY = 'lr_reviews_v1';

  const Reviews = {
    remote: null, // lista que viene del servidor (compartida entre dispositivos)
    stored() {
      try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; }
      catch (e) { return []; }
    },
    save(list) {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch (e) { /* modo privado */ }
    },
    seeds() {
      return (CFG.resenasEjemplo || []).map((r, i) => ({
        id: 'seed-' + i,
        nombre: r.nombre || 'Anónimo',
        estrellas: Math.min(5, Math.max(1, Number(r.estrellas) || 5)),
        texto: r.texto || '',
        fecha: r.fecha ? Date.parse(r.fecha) : Date.now() - (i + 1) * 86400000
      }));
    },
    all() {
      const base = this.remote !== null ? this.remote : this.stored();
      return this.seeds().concat(base).sort((a, b) => b.fecha - a.fecha);
    },
    async refresh() {
      try {
        const d = await Auth.api('/reviews');
        this.remote = (Array.isArray(d.reviews) ? d.reviews : []).map((r) => ({
          ...r,
          fecha: Number(r.fecha) || Date.now(),
          estrellas: Math.min(5, Math.max(1, Number(r.estrellas) || 5)),
        }));
        this.save(this.remote);
      } catch (e) {
        // Sin servidor: mostramos la última copia guardada en este navegador.
        if (this.remote === null) this.remote = this.stored();
      }
      renderReviewLists();
      renderRatingPanel();
      updateStats();
    },
    async add(data) {
      const d = await Auth.api('/reviews', { method: 'POST', json: data });
      if (d.review) {
        if (this.remote === null) this.remote = this.stored();
        this.remote = [d.review].concat(this.remote.filter((r) => r.id !== d.review.id));
        this.save(this.remote);
      }
      return d.review;
    },
    average() {
      const list = this.all();
      if (!list.length) return 0;
      return list.reduce((s, r) => s + r.estrellas, 0) / list.length;
    }
  };

  function starsMarkup(n) {
    let out = '<span class="stars" aria-label="' + n + ' de 5 estrellas">';
    for (let i = 1; i <= 5; i++) out += '<span class="' + (i <= n ? 'on' : '') + '">' + STAR_SVG + '</span>';
    return out + '</span>';
  }

  function timeAgo(ts) {
    const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return 'hace un momento';
    const m = Math.floor(s / 60);
    if (m < 60) return 'hace ' + m + ' minuto' + (m === 1 ? '' : 's');
    const h = Math.floor(m / 60);
    if (h < 24) return 'hace ' + h + ' hora' + (h === 1 ? '' : 's');
    const d = Math.floor(h / 24);
    if (d < 30) return 'hace ' + d + ' día' + (d === 1 ? '' : 's');
    const mo = Math.floor(d / 30);
    if (mo < 12) return 'hace ' + mo + ' mes' + (mo === 1 ? '' : 'es');
    return new Date(ts).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function reviewCard(r) {
    const inicial = (r.nombre || '?').trim().charAt(0).toUpperCase() || '?';
    const avatar = r.avatar
      ? '<img class="avatar avatar-img" src="' + esc(r.avatar) + '" alt="" loading="lazy" referrerpolicy="no-referrer">'
      : '<span class="avatar">' + esc(inicial) + '</span>';
    return '' +
      '<article class="card review-card">' +
        '<div class="review-head">' +
          avatar +
          '<span class="who"><b>' + esc(r.nombre) + '</b><span>' + timeAgo(r.fecha) + '</span></span>' +
        '</div>' +
        starsMarkup(r.estrellas) +
        '<p class="review-text">' + esc(r.texto) + '</p>' +
      '</article>';
  }

  function emptyReviews(extra) {
    return '<div class="empty-state"><b>Todavía no hay reseñas</b>' +
      (extra || 'La tuya puede ser la primera. ¡Contanos tu experiencia!') + '</div>';
  }

  function renderReviewLists() {
    const all = Reviews.all();
    const wall = $('#resenasMuro');
    if (wall) {
      wall.innerHTML = all.length
        ? all.map(reviewCard).join('')
        : emptyReviews('Dejá tu reseña con el formulario de arriba y aparecerá acá al instante.');
    }
    const destacadas = $('#resenasDestacadas');
    if (destacadas) {
      destacadas.innerHTML = all.length
        ? all.slice(0, 3).map(reviewCard).join('')
        : emptyReviews();
    }
  }

  function renderRatingPanel() {
    const all = Reviews.all();
    const avg = Reviews.average();

    $$('.js-rating-num').forEach((el) => { el.textContent = all.length ? avg.toFixed(1) : '—'; });
    $$('.js-rating-stars').forEach((el) => {
      el.innerHTML = all.length ? starsMarkup(Math.round(avg)) : starsMarkup(0);
    });
    $$('.js-rating-count').forEach((el) => {
      el.textContent = all.length
        ? 'basado en ' + all.length + ' reseña' + (all.length === 1 ? '' : 's')
        : 'todavía sin reseñas';
    });

    // Barras por cantidad de estrellas (página de reseñas)
    const bars = $('#distBars');
    if (bars) {
      const total = all.length || 1;
      for (let lvl = 5; lvl >= 1; lvl--) {
        const n = all.filter((r) => r.estrellas === lvl).length;
        const pct = Math.round((n / total) * 100);
        const fill = $('#bar-' + lvl);
        const pctEl = $('#bar-' + lvl + '-pct');
        if (fill) fill.style.width = (all.length ? pct : 0) + '%';
        if (pctEl) pctEl.textContent = (all.length ? pct : 0) + '%';
      }
    }
  }

  function updateStats() {
    const all = Reviews.all();
    const avg = Reviews.average();
    const rating = all.length ? avg : (Number(CFG.ratingBase) || 0);

    animateNumber($('#statMiembros'), Number(CFG.miembros) || 0, 0);
    const online = $('#statOnline');
    if (online) online.textContent = CFG.online || '—';
    animateNumber($('#statRating'), rating ? Math.round(rating * 10) / 10 : 0, 1);
    const count = $('#statResenas');
    if (count) {
      if (all.length) animateNumber(count, all.length, 0);
      else count.textContent = '0';
    }
  }

  function setupReviewForm() {
    const form = $('#formResena');
    if (!form) return;

    const starBox = $('#starInput');
    const nombre = $('#rNombre');
    const texto = $('#rTexto');
    const nota = $('#rNota');
    let estrellas = 0;

    // Identidad de la reseña (cuenta de Discord)
    const nameField = nombre ? nombre.closest('.field') : null;
    if (nameField && !$('#reviewIdentity')) {
      const box = document.createElement('div');
      box.id = 'reviewIdentity';
      box.className = 'review-identity';
      nameField.appendChild(box);
    }

    if (starBox) {
      $$('button', starBox).forEach((btn) => {
        const v = Number(btn.getAttribute('data-v'));
        btn.innerHTML = STAR_SVG;
        const paint = (n) => $$('button', starBox).forEach((b) => b.classList.toggle('on', Number(b.getAttribute('data-v')) <= n));
        btn.addEventListener('click', () => { estrellas = v; paint(v); });
        btn.addEventListener('mouseenter', () => paint(v));
        btn.addEventListener('mouseleave', () => paint(estrellas));
      });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = (nombre ? nombre.value : '').trim();
      const body = (texto ? texto.value : '').trim();

      const fail = (msg) => {
        if (nota) { nota.textContent = msg; nota.className = 'form-note error'; }
      };
      const ok = (msg) => {
        if (nota) { nota.textContent = msg; nota.className = 'form-note ok'; }
      };

      if (name.length < 2) return fail('Escribí tu nombre (o tu usuario de Discord).');
      if (!estrellas) return fail('Elegí una puntuación de 1 a 5 estrellas.');
      if (body.length < 12) return fail('Contanos un poco más: al menos 12 caracteres.');

      const submit = form.querySelector('button[type="submit"]');
      if (submit) {
        submit.dataset.label = submit.textContent;
        submit.disabled = true;
        submit.textContent = 'Publicando…';
      }

      try {
        await Reviews.add({
          nombre: Auth.user ? (Auth.user.displayName || Auth.user.username) : name,
          estrellas: estrellas,
          texto: body
        });
        ok('✅ ¡Gracias! Tu reseña ya se ve en todos los dispositivos.');
        form.reset();
        estrellas = 0;
        if (starBox) $$('button', starBox).forEach((b) => b.classList.remove('on'));
        if (Auth.user) updateAuthUI();
        await Reviews.refresh();
      } catch (err) {
        if (err.status === 401) {
          Auth.clear();
          fail('Tu sesión venció. Volvé a ingresar y publicá de nuevo.');
        } else {
          fail('❌ ' + (err.message || 'No se pudo publicar la reseña.'));
        }
      } finally {
        if (submit) {
          submit.disabled = false;
          submit.textContent = submit.dataset.label || 'Publicar reseña';
        }
      }
    });
  }

  /* ============================================================
     6) EQUIPO FUNDADOR (desde config.js, con avatares de Roblox)
     ============================================================ */
  const ROBLOX_CACHE_KEY = 'lr_roblox_v1';

  const Roblox = {
    data: {},
    load() {
      try { this.data = JSON.parse(localStorage.getItem(ROBLOX_CACHE_KEY)) || {}; }
      catch (e) { this.data = {}; }
    },
    get(id) {
      const c = this.data[id];
      if (!c) return null;
      if (Date.now() - (c.t || 0) > 7 * 86400000) return null; // la caché dura 7 días
      return c;
    },
    set(id, info) {
      this.data[id] = Object.assign({ t: Date.now() }, info);
      try { localStorage.setItem(ROBLOX_CACHE_KEY, JSON.stringify(this.data)); } catch (e) {}
    }
  };

  function inicialesDe(nombre) {
    const ini = String(nombre || '').trim().split(/\s+/).slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase()).join('');
    return ini || '?';
  }

  // Los datos se piden a roproxy.com: el mismo Roblox, pero con CORS
  // habilitado para que el navegador pueda consultarlo desde la web.
  async function fetchRoblox(id) {
    const info = {};
    const tipo = CFG.avatarCompleto ? 'avatar' : 'avatar-headshot';
    try {
      const r = await fetch('https://thumbnails.roproxy.com/v1/users/' + tipo +
        '?userIds=' + encodeURIComponent(id) + '&size=420x420&format=Png&isCircular=false');
      const j = await r.json();
      const d = j && j.data && j.data[0];
      if (d && d.imageUrl) info.avatarUrl = d.imageUrl;
    } catch (e) { /* sin internet o proxy caído: se usan las iniciales */ }
    try {
      const r = await fetch('https://users.roproxy.com/v1/users/' + encodeURIComponent(id));
      const u = await r.json();
      if (u && (u.displayName || u.name)) info.name = u.displayName || u.name;
    } catch (e) { /* seguimos con lo que haya */ }
    return info;
  }

  function renderTeam() {
    const box = $('#equipoGrid');
    if (!box) return;

    const team = CFG.equipo || [];
    if (!team.length) { box.innerHTML = ''; return; }

    Roblox.load();

    box.innerHTML = team.map((m) => {
      const id = String(m.robloxId || '').trim();
      const cache = id ? Roblox.get(id) : null;
      const nombre = m.nombre || (cache && cache.name) || m.roblox || (id ? 'Cargando…' : 'Por asignar');
      const avatar = m.foto || m.avatarUrl || (cache && cache.avatarUrl) || '';
      const claseCompleto = CFG.avatarCompleto && !m.foto ? ' class="avatar-full"' : '';

      const foto = avatar
        ? '<img src="' + esc(avatar) + '" alt="Avatar de ' + esc(nombre) + '"' + claseCompleto + '>'
        : '<span class="ini">' + esc(inicialesDe(m.nombre || nombre)) + '</span>';

      const cajaFoto = id
        ? '<a class="team-photo" href="https://www.roblox.com/users/' + esc(id) +
          '/profile" target="_blank" rel="noopener" title="Ver perfil de Roblox">' + foto + '</a>'
        : '<span class="team-photo">' + foto + '</span>';

      const social = [
        m.discord ? '<a href="' + esc(m.discord) + '" target="_blank" rel="noopener" aria-label="Discord de ' + esc(nombre) + '"><svg viewBox="0 0 24 24"><path d="M4.5 4h15A2.5 2.5 0 0 1 22 6.5v9A2.5 2.5 0 0 1 19.5 18H9l-5 4v-4H4.5A2.5 2.5 0 0 1 2 15.5v-9A2.5 2.5 0 0 1 4.5 4z"/></svg></a>' : '',
        m.instagram ? '<a href="' + esc(m.instagram) + '" target="_blank" rel="noopener" aria-label="Instagram de ' + esc(nombre) + '"><svg viewBox="0 0 24 24"><path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7zm5 3.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 0 1 12 7.5zm0 2A2.5 2.5 0 1 0 14.5 12 2.5 2.5 0 0 0 12 9.5zM17.6 6a1.2 1.2 0 1 1-1.2 1.2A1.2 1.2 0 0 1 17.6 6z"/></svg></a>' : ''
      ].join('');

      return '' +
        '<article class="card team-card">' +
          cajaFoto +
          '<h3>' + esc(nombre) + '</h3>' +
          '<span class="team-role">' + esc(m.rol) + '</span>' +
          '<p>' + esc(m.desc) + '</p>' +
          (social ? '<div class="team-social">' + social + '</div>' : '') +
        '</article>';
    }).join('');

    // Traer de Roblox el avatar y el nombre (si todavía no están en caché)
    team.forEach((m, i) => {
      const id = String(m.robloxId || '').trim();
      if (!id) return;

      const card = box.children[i];
      if (!card) return;

      const cache = Roblox.get(id);
      if (cache && cache.avatarUrl && cache.name) return;

      fetchRoblox(id).then((info) => {
        if (!info.avatarUrl && !info.name) return;
        Roblox.set(id, info);

        const img = card.querySelector('.team-photo img');
        if (info.avatarUrl && !m.foto && img && info.avatarUrl !== img.getAttribute('src')) {
          img.src = info.avatarUrl;
        } else if (info.avatarUrl && !m.foto && !img) {
          const caja = card.querySelector('.team-photo');
          if (caja) {
            caja.innerHTML = '<img src="' + esc(info.avatarUrl) + '" alt="Avatar de Roblox"' +
              (CFG.avatarCompleto ? ' class="avatar-full"' : '') + '>';
            conRespaldoIniciales(card);
          }
        }
        if (!m.nombre && info.name) {
          const h = card.querySelector('h3');
          if (h) h.textContent = info.name;
        }
      }).catch(() => {});
    });

    $$('.team-photo img', box).forEach((img) => conRespaldoIniciales(img.closest('.team-card')));
  }

  // Si el avatar no carga (sin internet, Roblox caído…), mostramos las iniciales
  function conRespaldoIniciales(card) {
    if (!card) return;
    const img = card.querySelector('.team-photo img');
    if (!img || img.dataset.respaldo === '1') return;
    img.dataset.respaldo = '1';
    img.addEventListener('error', () => {
      const h = card.querySelector('h3');
      const span = document.createElement('span');
      span.className = 'ini';
      span.textContent = inicialesDe(h ? h.textContent : '?');
      img.replaceWith(span);
    });
  }

  /* ============================================================
     7) MENÚ LATERAL DE CATEGORÍAS (botón izquierdo)
     ============================================================ */
  function setupDrawer() {
    const fab = $('#btnDrawer');
    const drawer = $('#sideDrawer');
    const overlay = $('#drawerOverlay');
    const cerrar = $('#btnDrawerClose');
    if (!fab || !drawer || !overlay) return;

    const abrir = () => {
      drawer.classList.add('open');
      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
    };
    const shut = () => {
      drawer.classList.remove('open');
      overlay.classList.remove('open');
      document.body.style.overflow = '';
    };
    const alternar = () => (drawer.classList.contains('open') ? shut() : abrir());

    fab.addEventListener('click', alternar);
    if (cerrar) cerrar.addEventListener('click', shut);
    overlay.addEventListener('click', shut);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') shut(); });
    $$('a', drawer).forEach((a) => a.addEventListener('click', shut));

    // Resaltar la categoría de la página actual
    const aqui = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    $$('a[data-page]', drawer).forEach((a) => {
      const p = (a.getAttribute('data-page') || '').toLowerCase();
      if (p && p === aqui) a.classList.add('active');
    });
  }

  /* ============================================================
     8) CUENTAS DISCORD + PANEL DE CIUDADANO
     ============================================================ */

  const DISCORD_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.5 4h15A2.5 2.5 0 0 1 22 6.5v9A2.5 2.5 0 0 1 19.5 18H9l-5 4v-4H4.5A2.5 2.5 0 0 1 2 15.5v-9A2.5 2.5 0 0 1 4.5 4z"/></svg>';

  function rememberUser(username) {
    try { localStorage.setItem(LAST_USER_KEY, username || ''); } catch (e) { /* modo privado */ }
  }

  function toast(text, ms = 3400) {
    let el = $('#lrToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'lrToast';
      el.className = 'lr-toast';
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.classList.add('on');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => el.classList.remove('on'), ms);
  }

  function setAuthMsg(step, text, kind = '') {
    const modal = $('#authModal');
    const el = modal ? $('[data-auth-pane="' + step + '"] [data-auth-msg]', modal) : null;
    if (!el) return;
    el.textContent = text || '';
    el.className = 'auth-msg' + (kind ? ' ' + kind : '');
  }

  function setBusy(btn, busy) {
    if (!btn) return;
    if (busy) {
      btn.dataset.label = btn.textContent;
      btn.textContent = 'Un momento…';
      btn.disabled = true;
    } else {
      btn.textContent = btn.dataset.label || btn.textContent;
      btn.disabled = false;
    }
  }

  function setAuthStep(step) {
    const modal = $('#authModal');
    if (!modal) return;

    $$('[data-auth-pane]', modal).forEach((pane) => {
      pane.hidden = pane.getAttribute('data-auth-pane') !== step;
    });
    $$('[data-auth-tab]', modal).forEach((tab) => {
      tab.classList.toggle('on', tab.getAttribute('data-auth-tab') === step);
    });
    const tabs = $('#authTabs', modal);
    if (tabs) tabs.hidden = !(step === 'login' || step === 'register');
    const card = $('.auth-card', modal);
    if (card) card.setAttribute('data-step', step);

    if (step === 'login' || step === 'register') {
      const input = $('[data-auth-pane="' + step + '"] input[name="username"]', modal);
      try {
        const last = localStorage.getItem(LAST_USER_KEY);
        if (last && input && !input.value) input.value = last;
      } catch (e) { /* modo privado */ }
    }

    requestAnimationFrame(() => {
      const first = $('[data-auth-pane="' + step + '"] input:not([type="hidden"])', modal);
      if (first) first.focus({ preventScroll: true });
    });
  }

  function openAuth(step) {
    buildAuthModal();
    const modal = $('#authModal');
    if (!modal) return;

    const wanted = step === 'account' && !Auth.user ? 'login' : (step || 'login');
    $$('[data-auth-form]', modal).forEach((form) => {
      const code = form.querySelector('input[name="code"]');
      if (code) code.value = '';
      $$('.auth-msg', form).forEach((msg) => { msg.textContent = ''; msg.className = 'auth-msg'; });
    });

    if (wanted === 'account') updateAuthUI();
    setAuthStep(wanted);
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
      const first = $('[data-auth-pane="' + wanted + '"] input:not([type="hidden"])', modal);
      if (first) first.focus({ preventScroll: true });
    }, 70);
  }

  function closeAuth() {
    const modal = $('#authModal');
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.style.overflow = '';
    if (resendTimer) { clearInterval(resendTimer); resendTimer = null; }
  }

  function startResendTimer() {
    const btn = $('#authModal [data-auth-resend]');
    if (!btn) return;
    if (resendTimer) clearInterval(resendTimer);
    resendLeft = 30;
    const tick = () => {
      if (resendLeft <= 0) {
        btn.disabled = false;
        btn.textContent = 'Reenviar código';
        clearInterval(resendTimer);
        resendTimer = null;
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Reenviar en ' + resendLeft + 's';
      resendLeft--;
    };
    tick();
    resendTimer = setInterval(tick, 1000);
  }

  function buildAuthModal() {
    if ($('#authModal')) return;

    const modal = document.createElement('div');
    modal.className = 'auth-modal';
    modal.id = 'authModal';
    modal.hidden = true;
    modal.innerHTML = `
      <div class="auth-backdrop" data-auth-close></div>
      <div class="auth-card" role="dialog" aria-modal="true" aria-labelledby="authTitle">
        <button class="auth-x" type="button" data-auth-close aria-label="Cerrar">✕</button>

        <div class="auth-visual">
          <div class="auth-visual-img"></div>
          <div class="auth-visual-glow"></div>
          <div class="auth-visual-grid"></div>
          <div class="auth-visual-brand">
            <img src="assets/logo.png" alt="">
            <b>LA REALIDAD <span>RP</span></b>
            <small>Los Angeles · ER:LC</small>
          </div>
          <div class="auth-visual-foot">Panel de Ciudadano · Cuenta Discord</div>
        </div>

        <div class="auth-main">
          <div class="auth-tabs" id="authTabs">
            <button type="button" data-auth-tab="login" class="on">Ingresar</button>
            <button type="button" data-auth-tab="register">Crear cuenta</button>
          </div>

          <div class="auth-pane" data-auth-pane="login">
            <h2 id="authTitle">Bienvenido de vuelta</h2>
            <p class="auth-sub">Entrá con tu usuario de Discord y tu contraseña.</p>
            <form class="auth-form" data-auth-form="login" novalidate>
              <label>Usuario de Discord
                <input name="username" autocomplete="username" placeholder="tu_usuario" spellcheck="false" required>
              </label>
              <label>Contraseña
                <input name="password" type="password" autocomplete="current-password" placeholder="••••••••" required>
              </label>
              <button class="btn btn-primary auth-submit" type="submit">Ingresar</button>
              <div class="auth-links">
                <button type="button" data-auth-goto="reset">¿Olvidaste tu contraseña?</button>
              </div>
              <div class="auth-msg" data-auth-msg></div>
            </form>
          </div>

          <div class="auth-pane" data-auth-pane="register" hidden>
            <h2>Creá tu cuenta</h2>
            <p class="auth-sub">Usá tu usuario de Discord. El bot te manda un código por mensaje privado.</p>
            <form class="auth-form" data-auth-form="register" novalidate>
              <label>Usuario de Discord
                <input name="username" autocomplete="username" placeholder="tu_usuario" spellcheck="false" required>
              </label>
              <div class="auth-two">
                <label>Contraseña
                  <input name="password" type="password" autocomplete="new-password" placeholder="Mínimo 6" required>
                </label>
                <label>Repetir contraseña
                  <input name="confirm" type="password" autocomplete="new-password" placeholder="Otra vez" required>
                </label>
              </div>
              <button class="btn btn-primary auth-submit" type="submit">Poner código</button>
              <div class="auth-msg" data-auth-msg></div>
              <p class="auth-fine">¿Ya tenés cuenta? <button type="button" data-auth-goto="login">Ingresá</button></p>
            </form>
          </div>

          <div class="auth-pane" data-auth-pane="verify" hidden>
            <h2>Revisá tu Discord</h2>
            <p class="auth-sub">Te mandé un código de 6 dígitos por MD a <b data-auth-user></b>.</p>
            <form class="auth-form" data-auth-form="verify" novalidate>
              <input type="hidden" name="username">
              <label>Código del mensaje
                <input name="code" class="auth-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" required>
              </label>
              <button class="btn btn-primary auth-submit" type="submit">Verificar cuenta</button>
              <div class="auth-links">
                <button type="button" data-auth-resend>Reenviar código</button>
              </div>
              <div class="auth-msg" data-auth-msg></div>
            </form>
          </div>

          <div class="auth-pane" data-auth-pane="reset" hidden>
            <h2>Recuperar contraseña</h2>
            <p class="auth-sub">Te mandamos un código por MD para que elijas una contraseña nueva.</p>
            <form class="auth-form" data-auth-form="reset" novalidate>
              <label>Tu usuario de Discord
                <input name="username" autocomplete="username" placeholder="tu_usuario" spellcheck="false" required>
              </label>
              <button class="btn btn-primary auth-submit" type="submit">Enviar código</button>
              <div class="auth-links">
                <button type="button" data-auth-goto="login">Volver a ingresar</button>
              </div>
              <div class="auth-msg" data-auth-msg></div>
            </form>
          </div>

          <div class="auth-pane" data-auth-pane="reset-code" hidden>
            <h2>Nueva contraseña</h2>
            <p class="auth-sub">Código enviado por MD a <b data-auth-user></b>.</p>
            <form class="auth-form" data-auth-form="reset-code" novalidate>
              <input type="hidden" name="username">
              <label>Código del mensaje
                <input name="code" class="auth-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" required>
              </label>
              <div class="auth-two">
                <label>Contraseña nueva
                  <input name="password" type="password" autocomplete="new-password" placeholder="Mínimo 6" required>
                </label>
                <label>Repetir contraseña
                  <input name="confirm" type="password" autocomplete="new-password" placeholder="Otra vez" required>
                </label>
              </div>
              <button class="btn btn-primary auth-submit" type="submit">Cambiar contraseña</button>
              <div class="auth-msg" data-auth-msg></div>
            </form>
          </div>

          <div class="auth-pane auth-account" data-auth-pane="account" hidden>
            <div class="auth-account-head">
              <span class="auth-avatar" id="authAvatar">?</span>
              <div>
                <h2 id="authAccountName">Ciudadano</h2>
                <p class="auth-sub" id="authAccountUser"></p>
              </div>
            </div>
            <div class="auth-meta">
              <span class="auth-role" id="authAccountRole">Ciudadano</span>
              <span id="authAccountSince"></span>
            </div>
            <p class="auth-sub auth-account-text">Tu cuenta está conectada al Discord. Acá vas a ver tu DNI y tus datos de la ciudad cuando el CAD termine de sincronizarlos.</p>
            <button class="btn btn-primary auth-submit" type="button" data-auth-close>Volver al sitio</button>
            <button class="btn btn-ghost auth-submit" type="button" id="authLogout">Cerrar sesión</button>
          </div>

          <div class="auth-foot">La Realidad RP · Panel de Ciudadano</div>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const visual = $('.auth-visual-img', modal);
    if (visual) visual.style.backgroundImage = "url('" + randomPhoto() + "')";

    $$('[data-auth-close]', modal).forEach((x) => x.addEventListener('click', closeAuth));
    $$('[data-auth-tab]', modal).forEach((tab) => {
      tab.addEventListener('click', () => setAuthStep(tab.getAttribute('data-auth-tab')));
    });
    $$('[data-auth-goto]', modal).forEach((btn) => {
      btn.addEventListener('click', () => setAuthStep(btn.getAttribute('data-auth-goto')));
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.hidden) closeAuth();
    });

    // ---- Ingresar ----
    const loginForm = $('[data-auth-form="login"]', modal);
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = loginForm.username.value.trim().replace(/^@+/, '');
      const password = loginForm.password.value;
      if (!username || !password) return setAuthMsg('login', 'Completá tu usuario y contraseña.', 'error');

      const btn = $('[type="submit"]', loginForm);
      setBusy(btn, true);
      setAuthMsg('login', 'Conectando… si el servidor está despertando puede tardar unos segundos.');
      try {
        const d = await Auth.api('/auth/login', { method: 'POST', json: { username, password } });
        Auth.setSession(d.token, d.user);
        rememberUser(d.user.username);
        closeAuth();
        toast('✅ Entraste como ' + (d.user.displayName || d.user.username));
      } catch (err) {
        setAuthMsg('login', '❌ ' + err.message, 'error');
      } finally {
        setBusy(btn, false);
      }
    });

    // ---- Crear cuenta ----
    const regForm = $('[data-auth-form="register"]', modal);
    regForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = regForm.username.value.trim().replace(/^@+/, '');
      const password = regForm.password.value;
      const confirm = regForm.confirm.value;

      if (!username) return setAuthMsg('register', 'Escribí tu usuario de Discord.', 'error');
      if (password.length < 6) return setAuthMsg('register', 'La contraseña debe tener al menos 6 caracteres.', 'error');
      if (password !== confirm) return setAuthMsg('register', 'Las contraseñas no coinciden.', 'error');

      const btn = $('[type="submit"]', regForm);
      setBusy(btn, true);
      setAuthMsg('register', 'Buscando tu usuario en Discord…');
      try {
        const d = await Auth.api('/auth/register', { method: 'POST', json: { username, password } });
        pendingAuth = { username: d.username, password };
        rememberUser(d.username);

        const pane = $('[data-auth-pane="verify"]', modal);
        $('[data-auth-user]', pane).textContent = '@' + d.username;
        pane.querySelector('input[name="username"]').value = d.username;
        setAuthStep('verify');
        setAuthMsg('verify', '📩 Te mandé un código por MD. Abrilo y pegalo acá.', 'ok');
        startResendTimer();
      } catch (err) {
        setAuthMsg('register', '❌ ' + err.message, 'error');
      } finally {
        setBusy(btn, false);
      }
    });

    // ---- Verificar código ----
    const verifyForm = $('[data-auth-form="verify"]', modal);
    verifyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = verifyForm.username.value;
      const code = verifyForm.code.value.replace(/\D/g, '');
      if (code.length !== 6) return setAuthMsg('verify', 'El código tiene 6 números.', 'error');

      const btn = $('[type="submit"]', verifyForm);
      setBusy(btn, true);
      setAuthMsg('verify', 'Verificando…');
      try {
        const d = await Auth.api('/auth/verify', { method: 'POST', json: { username, code } });
        Auth.setSession(d.token, d.user);
        pendingAuth = null;
        if (resendTimer) { clearInterval(resendTimer); resendTimer = null; }
        closeAuth();
        toast('✅ Cuenta creada. ¡Bienvenido, ' + (d.user.displayName || d.user.username) + '!');
      } catch (err) {
        setAuthMsg('verify', '❌ ' + err.message, 'error');
      } finally {
        setBusy(btn, false);
      }
    });

    // ---- Reenviar código de registro ----
    const resend = $('[data-auth-resend]', modal);
    resend.addEventListener('click', async () => {
      if (resendLeft > 0 || !pendingAuth) return;
      resend.disabled = true;
      try {
        await Auth.api('/auth/register', { method: 'POST', json: pendingAuth });
        setAuthMsg('verify', '📩 Te mandé otro código por MD.', 'ok');
        startResendTimer();
      } catch (err) {
        setAuthMsg('verify', '❌ ' + err.message, 'error');
        resend.disabled = false;
      }
    });

    // ---- Recuperar contraseña ----
    const resetForm = $('[data-auth-form="reset"]', modal);
    resetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = resetForm.username.value.trim().replace(/^@+/, '');
      if (!username) return setAuthMsg('reset', 'Escribí tu usuario de Discord.', 'error');

      const btn = $('[type="submit"]', resetForm);
      setBusy(btn, true);
      setAuthMsg('reset', 'Enviando…');
      try {
        const d = await Auth.api('/auth/reset/request', { method: 'POST', json: { username } });
        pendingReset = username;

        const pane = $('[data-auth-pane="reset-code"]', modal);
        $('[data-auth-user]', pane).textContent = '@' + username;
        pane.querySelector('input[name="username"]').value = username;
        setAuthStep('reset-code');
        setAuthMsg('reset-code', '📩 ' + (d.message || 'Si la cuenta existe, te llegó un código por MD.'), 'ok');
      } catch (err) {
        setAuthMsg('reset', '❌ ' + err.message, 'error');
      } finally {
        setBusy(btn, false);
      }
    });

    const resetCodeForm = $('[data-auth-form="reset-code"]', modal);
    resetCodeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = resetCodeForm.username.value;
      const code = resetCodeForm.code.value.replace(/\D/g, '');
      const password = resetCodeForm.password.value;
      const confirm = resetCodeForm.confirm.value;

      if (code.length !== 6) return setAuthMsg('reset-code', 'El código tiene 6 números.', 'error');
      if (password.length < 6) return setAuthMsg('reset-code', 'La contraseña nueva debe tener al menos 6 caracteres.', 'error');
      if (password !== confirm) return setAuthMsg('reset-code', 'Las contraseñas no coinciden.', 'error');

      const btn = $('[type="submit"]', resetCodeForm);
      setBusy(btn, true);
      setAuthMsg('reset-code', 'Guardando…');
      try {
        const d = await Auth.api('/auth/reset/confirm', { method: 'POST', json: { username, code, password } });
        Auth.setSession(d.token, d.user);
        pendingReset = null;
        closeAuth();
        toast('✅ Contraseña actualizada. Ya estás dentro.');
      } catch (err) {
        setAuthMsg('reset-code', '❌ ' + err.message, 'error');
      } finally {
        setBusy(btn, false);
      }
    });

    // ---- Cerrar sesión ----
    const logoutBtn = $('#authLogout', modal);
    logoutBtn.addEventListener('click', async () => {
      logoutBtn.disabled = true;
      try { await Auth.api('/auth/logout', { method: 'POST' }); } catch (e) { /* igual cerramos */ }
      Auth.clear();
      logoutBtn.disabled = false;
      closeAuth();
      toast('👋 Cerraste sesión.');
    });
  }

  function setupAccountEntryPoints() {
    const header = $('.header-inner');
    if (header && !$('#headerAccount')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'headerAccount';
      btn.className = 'header-account';
      btn.innerHTML = '<span class="ha-ic">👤</span><span class="ha-txt">Ingresar</span>';
      btn.addEventListener('click', () => openAuth(Auth.user ? 'account' : 'login'));
      const burger = $('#btnMenu');
      if (burger && burger.parentNode === header) header.insertBefore(btn, burger);
      else header.appendChild(btn);
    }

    $$('[data-open-panel]').forEach((trigger) => {
      trigger.addEventListener('click', (e) => {
        e.preventDefault();
        openAuth(Auth.user ? 'account' : 'login');
      });
    });

    document.addEventListener('click', (e) => {
      const trigger = e.target.closest('[data-open-auth]');
      if (!trigger) return;
      e.preventDefault();
      openAuth('login');
    });
  }

  function updateAuthUI() {
    const user = Auth.user;

    const headerBtn = $('#headerAccount');
    if (headerBtn) {
      headerBtn.classList.toggle('is-user', !!user);
      headerBtn.innerHTML = user
        ? ((user.avatar ? '<img class="ha-avatar" src="' + esc(user.avatar) + '" alt="" referrerpolicy="no-referrer">' : '<span class="ha-ic">🪪</span>') +
           '<span class="ha-txt">' + esc(user.displayName || user.username) + '</span>')
        : '<span class="ha-ic">👤</span><span class="ha-txt">Ingresar</span>';
      headerBtn.title = user ? '@' + user.username + ' · Ver mi cuenta' : 'Ingresar con Discord';
    }

    $$('.drawer-panel').forEach((panel) => {
      const ic = panel.querySelector('.ico, .ic');
      const small = panel.querySelector('small');
      panel.classList.toggle('is-user', !!user);
      if (user) {
        if (ic) ic.innerHTML = user.avatar ? '<img src="' + esc(user.avatar) + '" alt="" referrerpolicy="no-referrer">' : '🪪';
        if (small) small.textContent = '@' + user.username + ' · Conectado';
      } else {
        if (ic) ic.textContent = '🪪';
        if (small) small.textContent = 'Entrá con tu Discord';
      }
    });

    const nameInput = $('#rNombre');
    if (nameInput) {
      if (user) {
        if (!nameInput.readOnly) nameInput.dataset.savedValue = nameInput.value;
        nameInput.value = user.displayName || user.username;
        nameInput.readOnly = true;
        nameInput.classList.add('is-account');
      } else {
        nameInput.readOnly = false;
        nameInput.classList.remove('is-account');
        if (nameInput.dataset.savedValue) {
          nameInput.value = nameInput.dataset.savedValue;
          delete nameInput.dataset.savedValue;
        }
      }
    }

    const identity = $('#reviewIdentity');
    if (identity) {
      identity.innerHTML = user
        ? ((user.avatar ? '<img src="' + esc(user.avatar) + '" alt="" referrerpolicy="no-referrer">' : '') +
           '<span>Publicando como <b>' + esc(user.displayName || user.username) + '</b> · @' + esc(user.username) + '</span>')
        : '<span>¿Querés que tu reseña lleve tu foto de Discord?</span> <button type="button" data-open-auth>Ingresá</button>';
    }

    if (user) {
      const name = $('#authAccountName');
      const uname = $('#authAccountUser');
      const role = $('#authAccountRole');
      const since = $('#authAccountSince');
      const avatar = $('#authAvatar');
      if (name) name.textContent = user.displayName || user.username;
      if (uname) uname.textContent = '@' + user.username;
      if (role) role.textContent = user.role || 'Ciudadano';
      if (since) {
        since.textContent = user.createdAt
          ? 'Miembro desde ' + new Date(user.createdAt).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
          : '';
      }
      if (avatar) {
        avatar.innerHTML = user.avatar
          ? '<img src="' + esc(user.avatar) + '" alt="" referrerpolicy="no-referrer">'
          : esc((user.displayName || '?').charAt(0).toUpperCase());
      }
    }
  }

  /* ============================================================
     9) FOTOS, PARTÍCULAS Y EFECTOS
     ============================================================ */

  function applyRandomPhotos() {
    // La foto principal cambia en cada visita.
    const hero = $('.hero-scene-img');
    if (hero) hero.style.backgroundImage = "url('" + randomPhoto() + "')";
  }

  function setupPhotoBand() {
    if (!$('#como-jugar') || $('#galeria')) return;

    const section = document.createElement('section');
    section.className = 'section photo-band';
    section.id = 'galeria';
    section.innerHTML = '' +
      '<div class="container">' +
        '<div class="section-head reveal">' +
          '<span class="eyebrow">Los Angeles en acción</span>' +
          '<h2>La ciudad, en <span class="grad">primera persona</span></h2>' +
          '<p class="sub">Policía, ruta y bomberos: tres frentes, una misma ciudad.</p>' +
        '</div>' +
        '<div class="photo-grid" id="photoGrid"></div>' +
      '</div>';
    $('#como-jugar').insertAdjacentElement('afterend', section);

    const photos = shuffle([
      { src: 'assets/foto-lapd.jpg', tag: 'LCPD', title: 'Patrulla en la ciudad', text: 'Unidades policiales respondiendo en Los Angeles.' },
      { src: 'assets/foto-chp.jpg', tag: 'CHP', title: 'Highway Patrol', text: 'Control de rutas, persecuciones y operativos.' },
      { src: 'assets/foto-lafd.jpg', tag: 'LCFD', title: 'Bomberos y EMS', text: 'Emergencias médicas y rescates en toda la ciudad.' }
    ]);

    const grid = $('#photoGrid');
    if (!grid) return;
    grid.innerHTML = photos.map((p, i) => (
      '<figure class="photo-card photo-' + i + '" style="--photo:url(\'' + p.src + '\')">' +
        '<div class="photo-card-img"></div>' +
        '<div class="photo-card-shine"></div>' +
        '<figcaption>' +
          '<span class="photo-tag">' + p.tag + '</span>' +
          '<b>' + p.title + '</b>' +
          '<small>' + p.text + '</small>' +
        '</figcaption>' +
      '</figure>'
    )).join('');
  }

  function setupParticles() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if ($('#lrParticles')) return;

    const canvas = document.createElement('canvas');
    canvas.id = 'lrParticles';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.prepend(canvas);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const COLORS = ['46,230,205', '255,200,74', '120,220,255'];
    const dots = [];
    let w = 0, h = 0, dpr = 1, raf = 0;

    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.width = Math.floor(window.innerWidth * dpr);
      h = canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';

      const count = Math.max(22, Math.min(64, Math.round(window.innerWidth / 24)));
      dots.length = 0;
      for (let i = 0; i < count; i++) {
        dots.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.24 * dpr,
          vy: (Math.random() - 0.5) * 0.24 * dpr,
          r: (Math.random() * 1.6 + 0.6) * dpr,
          c: COLORS[i % COLORS.length],
          a: Math.random() * 0.45 + 0.18
        });
      }
    }

    function frame() {
      ctx.clearRect(0, 0, w, h);

      for (const dot of dots) {
        dot.x += dot.vx;
        dot.y += dot.vy;
        if (dot.x < -20) dot.x = w + 20;
        if (dot.x > w + 20) dot.x = -20;
        if (dot.y < -20) dot.y = h + 20;
        if (dot.y > h + 20) dot.y = -20;

        ctx.beginPath();
        ctx.fillStyle = 'rgba(' + dot.c + ',' + dot.a + ')';
        ctx.shadowColor = 'rgba(' + dot.c + ',.8)';
        ctx.shadowBlur = 8 * dpr;
        ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      const max = 120 * dpr;
      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          const a = dots[i], b = dots[j];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist < max) {
            ctx.strokeStyle = 'rgba(46,230,205,' + (0.10 * (1 - dist / max)) + ')';
            ctx.lineWidth = dpr * 0.5;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      raf = requestAnimationFrame(frame);
    }

    resize();
    frame();

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 180);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else { cancelAnimationFrame(raf); frame(); }
    });
  }

  /* ============================================================
     ARRANQUE
     ============================================================ */
  document.addEventListener('DOMContentLoaded', () => {
    applyConfig();
    setupHeader();
    setupDrawer();
    buildAuthModal();
    setupAccountEntryPoints();
    setupReviewForm();
    applyRandomPhotos();
    setupPhotoBand();
    setupParticles();
    renderTeam();
    renderReviewLists();
    renderRatingPanel();
    updateStats();
    setupReveal();

    // Las dos consultas son independientes: no hacemos esperar el muro
    // de reseñas a que termine de validarse la sesión.
    Auth.init();
    Reviews.refresh();

    setInterval(() => {
      if (!document.hidden) Reviews.refresh();
    }, 60000);
  });
})();
