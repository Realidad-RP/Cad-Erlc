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
     1) ENLACES Y TEXTOS DESDE config.js
     ============================================================ */
  function applyConfig() {
    const links = {
      discord:   CFG.discord || '',
      instagram: CFG.instagram || '',
      tiktok:    CFG.tiktok || '',
      youtube:   CFG.youtube || '',
      correo:    CFG.correo ? 'mailto:' + CFG.correo : '',
      cad:       CFG.cadDescarga || ''
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
     Las reseñas que dejan los visitantes se guardan en el
     navegador (localStorage). Para un muro compartido entre
     todos haría falta conectarlo al servidor del CAD.
     ============================================================ */
  const STORE_KEY = 'lr_reviews_v1';

  const Reviews = {
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
      return this.seeds().concat(this.stored()).sort((a, b) => b.fecha - a.fecha);
    },
    add(data) {
      const list = this.stored();
      list.push({
        id: 'r-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        nombre: String(data.nombre).slice(0, 40),
        estrellas: Math.min(5, Math.max(1, Number(data.estrellas) || 5)),
        texto: String(data.texto).slice(0, 600),
        fecha: Date.now()
      });
      this.save(list);
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
    return '' +
      '<article class="card review-card">' +
        '<div class="review-head">' +
          '<span class="avatar">' + esc(inicial) + '</span>' +
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

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = (nombre ? nombre.value : '').trim();
      const body = (texto ? texto.value : '').trim();

      const fail = (msg) => {
        if (nota) { nota.textContent = msg; nota.className = 'form-note error'; }
      };

      if (name.length < 2) return fail('Escribí tu nombre (o tu usuario de Discord).');
      if (!estrellas) return fail('Elegí una puntuación de 1 a 5 estrellas.');
      if (body.length < 12) return fail('Contanos un poco más: al menos 12 caracteres.');

      Reviews.add({ nombre: name, estrellas: estrellas, texto: body });

      if (nota) { nota.textContent = '✅ ¡Gracias! Tu reseña se publicó.'; nota.className = 'form-note ok'; }
      form.reset();
      estrellas = 0;
      if (starBox) $$('button', starBox).forEach((b) => b.classList.remove('on'));

      renderReviewLists();
      renderRatingPanel();
      updateStats();
    });
  }

  /* ============================================================
     6) EQUIPO FUNDADOR (desde config.js)
     ============================================================ */
  function renderTeam() {
    const box = $('#equipoGrid');
    if (!box) return;

    const team = CFG.equipo || [];
    if (!team.length) { box.innerHTML = ''; return; }

    box.innerHTML = team.map((m) => {
      const iniciales = String(m.nombre || '?')
        .split(/\s+/).slice(0, 2)
        .map((w) => w.charAt(0).toUpperCase()).join('');

      const foto = m.foto
        ? '<img src="' + esc(m.foto) + '" alt="' + esc(m.nombre) + '">'
        : esc(iniciales);

      const social = [
        m.discord ? '<a href="' + esc(m.discord) + '" target="_blank" rel="noopener" aria-label="Discord de ' + esc(m.nombre) + '"><svg viewBox="0 0 24 24"><path d="M4.5 4h15A2.5 2.5 0 0 1 22 6.5v9A2.5 2.5 0 0 1 19.5 18H9l-5 4v-4H4.5A2.5 2.5 0 0 1 2 15.5v-9A2.5 2.5 0 0 1 4.5 4z"/></svg></a>' : '',
        m.instagram ? '<a href="' + esc(m.instagram) + '" target="_blank" rel="noopener" aria-label="Instagram de ' + esc(m.nombre) + '"><svg viewBox="0 0 24 24"><path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7zm5 3.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 0 1 12 7.5zm0 2A2.5 2.5 0 1 0 14.5 12 2.5 2.5 0 0 0 12 9.5zM17.6 6a1.2 1.2 0 1 1-1.2 1.2A1.2 1.2 0 0 1 17.6 6z"/></svg></a>' : ''
      ].join('');

      return '' +
        '<article class="card team-card">' +
          '<span class="team-photo">' + foto + '</span>' +
          '<h3>' + esc(m.nombre) + '</h3>' +
          '<span class="team-role">' + esc(m.rol) + '</span>' +
          '<p>' + esc(m.desc) + '</p>' +
          (social ? '<div class="team-social">' + social + '</div>' : '') +
        '</article>';
    }).join('');
  }

  /* ============================================================
     ARRANQUE
     ============================================================ */
  document.addEventListener('DOMContentLoaded', () => {
    applyConfig();
    setupHeader();
    renderTeam();
    renderReviewLists();
    renderRatingPanel();
    updateStats();
    setupReviewForm();
    setupReveal();
  });
})();
