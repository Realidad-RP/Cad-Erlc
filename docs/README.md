# 🌆 Página web — La Realidad RP

Sitio oficial de la comunidad (estilo [erlchub.pro](https://erlchub.pro/)): portada, cómo unirse,
servidores, tienda, reseñas, equipo fundador, normativa, términos y privacidad.

Es una web **estática** (solo HTML, CSS y JavaScript): se abre con doble clic y se puede publicar
gratis en cualquier hosting sin servidor.

## ▶️ Cómo verla

- **Doble clic** en `web/index.html`, o
- desde la raíz del proyecto: `npm run web`

## ⚙️ Qué editar (¡lo más importante!)

Casi todo se cambia en **`web/config.js`** (abrilo con el Bloc de notas):

| Qué | Dónde |
|---|---|
| Enlace de tu Discord ⚠️ | `discord: "https://discord.gg/TU-INVITACION"` |
| Instagram / TikTok / YouTube | `instagram`, `tiktok`, `youtube` (vacío `""` = se oculta) |
| Correo de soporte | `correo` |
| Descarga del CAD (opcional) | `cadDescarga` (vacío = se oculta) |
| Miembros del Discord | `miembros` (0 muestra "—") |
| Jugadores en línea | `online` — ejemplo: `"12/50"` |
| Nombres, roles y fotos del equipo | `equipo` (`foto: "assets/equipo/tu-foto.png"` o `""` para iniciales) |
| Nombre de la moneda | `moneda` (por defecto `RealCoins`) |
| Métodos de pago del pie | `metodosPago` |
| Reseñas fijas (opcional) | `resenasEjemplo` |

Para poner **fotos del equipo**: creá la carpeta `web/assets/equipo/`, guardá las imágenes ahí
y en `config.js` poné `foto: "assets/equipo/nombre.png"`.

## 🛒 Editar la tienda

Los productos y precios están escritos directamente en `web/index.html` (sección Tienda)
y en `web/tienda.html` (catálogo completo). Buscá el precio (ej. `$4.99`) y cambialo.

Todos los botones **"Comprar"** llevan al enlace `tiendaLink` de `config.js`
(si está vacío, llevan a tu Discord). Ideal: un canal de tickets.

## ⭐ Sobre las reseñas

El formulario de reseñas funciona **sin servidor**: las reseñas que deja cada visitante
se guardan en **su propio navegador**. Si más adelante conectan la web al servidor del CAD
(o a un pequeño backend), se pueden hacer visibles para todos.

## 🌍 Publicarla gratis

1. **Netlify (lo más fácil):** entrá a <https://app.netlify.com/drop> y **arrastrá la carpeta `web`**.
   Te da un enlace tipo `https://tu-sitio.netlify.app` al instante. (Después podés conectar tu dominio.)
2. **Vercel:** <https://vercel.com> → *Add New → Project* → subí la carpeta (o conectá el repositorio de GitHub).
3. **GitHub Pages:** subí el proyecto a GitHub → *Settings → Pages* → carpeta `/web`.
4. **Tu propio servidor:** copiá la carpeta `web` a cualquier hosting (Hostinger, DonWeb, etc.).

> 💡 También se puede usar el mismo servidor de Render del CAD más adelante para servirla.

## 📁 Estructura

| Archivo | Función |
|---|---|
| `index.html` | Portada: hero, cómo unirse, servidores, tienda, reseñas, nosotros, equipo |
| `tienda.html` | Catálogo completo con filtros (membresías, kits, monedas) |
| `resenas.html` | Muro de reseñas + formulario con estrellas |
| `normativa.html` | Reglas de la comunidad + tabla de sanciones |
| `terminos.html` | Términos y condiciones |
| `privacidad.html` | Política de privacidad |
| `styles.css` | Estilos (tema oscuro con los colores del escudo) |
| `app.js` | Menú móvil, estadísticas, reseñas y equipo |
| `config.js` | ⚙️ Tu configuración (lo único que hace falta editar) |
| `assets/` | Escudo de la comunidad (logo) |

## ✅ Consejos antes de publicar

- Reemplazá `TU-INVITACION` por tu enlace real de Discord (si no, los botones no llevan a ningún lado).
- Escribí los nombres reales del equipo (por defecto dice "Tu Nombre").
- Ajustá los precios de la tienda a los tuyos.
- Poné el número real de miembros del Discord.
