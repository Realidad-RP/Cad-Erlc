# 🌆 Página web — La Realidad RP

Sitio oficial de la comunidad (estilo [erlchub.pro](https://erlchub.pro/)): portada, cómo unirse,
servidores, reseñas, equipo fundador, normativa, términos y privacidad.

La parte visual es **estática** (solo HTML, CSS y JavaScript): se abre con doble clic y se puede
publicar gratis en cualquier hosting. Las **cuentas del Panel de Ciudadano** y el **muro de
reseñas compartido** usan el bot de Discord (`bot/`); sin el bot, la web sigue funcionando y
muestra la última copia guardada en el navegador.

## ▶️ Cómo verla

- **Doble clic** en `web/index.html`, o
- desde la raíz del proyecto: `npm run web`

## 🎬 Portada estilo ER:LC

La portada usa una escena de **Emergency Response: Liberty County** como fondo, con un
post-proceso tipo *shader* hecho en CSS (color grade, bloom cálido, grano de película y
viñeta). El escudo **LAPD** aparece como marca de agua transparente, tanto en la portada
como de fondo en todo el sitio.

| Archivo | Uso |
|---|---|
| `assets/erlc-hero.jpg` | Fondo de la portada (imagen ya graduada) |
| `assets/erlc-hero-lapd.jpg` | Versión con el escudo LAPD incrustado (también se usa como `og:image`) |
| `assets/lapd-badge.svg` | Escudo LAPD a color (transparente) |
| `assets/lapd-watermark.svg` | Versión de línea, pensada para marcas de agua |

> El escudo es una ilustración propia inspirada en la estética policial de Los Angeles.
> No es el emblema oficial del LAPD ni implica afiliación con el departamento.

## ⚙️ Qué editar (¡lo más importante!)

Casi todo se cambia en **`web/config.js`** (abrilo con el Bloc de notas):

| Qué | Dónde |
|---|---|
| Enlace de tu Discord ✅ | `discord: "https://discord.gg/qytyw8E9dn"` (ya configurado) |
| Instagram / TikTok / YouTube | `instagram`, `tiktok`, `youtube` (vacío `""` = se oculta) |
| Correo de soporte | `correo` |
| Descarga del CAD (opcional) | `cadDescarga` (vacío = se oculta) |
| Miembros del Discord | `miembros` (0 muestra "—") |
| Jugadores en línea | `online` — ejemplo: `"12/50"` |
| Equipo (nombres, roles y avatares) | `equipo` — con `robloxId` el avatar y el nombre se cargan solos desde Roblox |
| Reseñas fijas (opcional) | `resenasEjemplo` |
| Servidor del bot (cuentas + reseñas) | `apiBase` — por defecto `https://cad-erlc-bot.onrender.com` |

### 🤖 Avatares de Roblox (equipo)

Cada integrante del equipo puede mostrar **su avatar de Roblox**:

1. Entrá al perfil de la persona en `roblox.com` y copiá el número que aparece en la
   barra de direcciones: `roblox.com/users/`**`TU-NUMERO`**`/profile` (también sirve el
   nombre de usuario: generalo en la web de un buscador de "Roblox ID").
2. Pegá ese número en `config.js`, dentro de su bloque, en `robloxId: "TU-NUMERO"`.

La web carga sola el avatar **y el nombre** desde Roblox (si querés otro nombre, escribilo
en `nombre:` y ese manda). Si no hay internet o Roblox no responde, se muestran las
iniciales en un círculo de color, así nunca queda un hueco vacío.

- `avatarCompleto: true` → muestra el cuerpo entero; `false` (por defecto) → solo la cara.
- El avatar es un enlace al perfil de Roblox (se abre en otra pestaña).
- También podés usar una foto propia: creá `web/assets/equipo/`, guardala ahí y poné
  `foto: "assets/equipo/nombre.png"` (esa foto tiene prioridad sobre Roblox).

## 🪪 Cuentas, Panel de Ciudadano y reseñas compartidas

El botón **Cuenta** (cabecera y menú lateral) abre el acceso. Después de ingresar, el botón
**Abrir mi panel** (o el avatar de la cabecera) lleva a `panel.html`:

1. La persona escribe su **usuario de Discord**, una contraseña y la confirma.
2. El bot la busca en el servidor y le manda un **código de 6 dígitos por MD**.
3. Al ingresar el código, la cuenta queda creada con su **nombre y foto de Discord**.
4. Puede volver a entrar con usuario + contraseña, o recuperarla por código si la olvidó.
5. La primera vez, el panel pide **vincular el DNI**: hay que escribir el DNI y el **nombre
   exacto del personaje** tal como están cargados en el CAD. Se permite **un DNI por cuenta**.
6. El dashboard muestra, en modo **solo lectura**, el resumen, la credencial del DNI, la
   licencia, los vehículos, las multas y las órdenes que el CAD envía al bot. También tiene un
   acceso directo a la **central 911**. El DNI se puede desvincular desde **Ajustes**.
7. Las reseñas se guardan en el servidor y **se ven desde cualquier dispositivo**; si hay
   sesión, llevan el nombre y el avatar de Discord.

El panel no procesa pagos ni modifica registros: las multas se abonan en el juego y cualquier
corrección se pide al staff. Si el CAD todavía no envió datos al bot, el panel conserva el DNI
vinculado y muestra un estado de espera.

El bot guarda las cuentas, el DNI vinculado y las reseñas en el canal privado
**#panel-ciudadano** de Discord (las contraseñas van cifradas con scrypt, nunca en texto plano).
Así los datos sobreviven a los reinicios de Render. La guía de configuración está en
[`../bot/README.md`](../bot/README.md).

> 💡 Si abrís la web con doble clic en tu PC, usa el bot local en `http://127.0.0.1:8790`.
> Si no está corriendo, el muro muestra la última copia cacheada y las cuentas avisan que no
> pueden conectar.

## 🌍 Publicarla gratis

1. **Netlify (lo más fácil):** entrá a <https://app.netlify.com/drop> y **arrastrá la carpeta `web`**.
   Te da un enlace tipo `https://tu-sitio.netlify.app` al instante. (Después podés conectar tu dominio.)
2. **Vercel:** <https://vercel.com> → *Add New → Project* → subí la carpeta (o conectá el repositorio de GitHub).
3. **GitHub Pages:** este repositorio publica la carpeta **`docs/`**. Después de cambiar algo en
   `web/`, copiá el contenido actualizado a `docs/` y subilo:

   ```powershell
   Copy-Item web\* docs\ -Recurse -Force
   ```

   (Se mantienen `docs/COMPARTIR-CON-MIEMBROS.md` y `docs/.nojekyll`.)
   En GitHub: *Settings → Pages* → carpeta `/docs`.
4. **Tu propio servidor:** copiá la carpeta `web` a cualquier hosting (Hostinger, DonWeb, etc.).

> ⚠️ Para que las cuentas y reseñas funcionen en producción, la web tiene que abrirse por
> **HTTPS** (Netlify, Vercel, GitHub Pages o tu dominio) y `apiBase` tiene que apuntar al bot
> con HTTPS. El bot ya permite CORS desde cualquier origen.

## 📁 Estructura

| Archivo | Función |
|---|---|
| `index.html` | Portada: hero, cómo unirse, servidores, reseñas, nosotros, equipo |
| `resenas.html` | Muro de reseñas + formulario con estrellas |
| `panel.html` | Panel de Ciudadano: resumen, DNI, licencia, vehículos, multas, órdenes y ajustes |
| `panel.css` | Estilos del dashboard (tarjetas, credencial, responsive e impresión del DNI) |
| `panel.js` | Lógica del panel: vinculación del DNI, pestañas, estados y actualización |
| `normativa.html` | Reglas de la comunidad + tabla de sanciones |
| `terminos.html` | Términos y condiciones |
| `privacidad.html` | Política de privacidad |
| `styles.css` | Estilos base (tema oscuro, neón, animaciones y fotos) |
| `app.js` | Menú, estadísticas, cuentas Discord, reseñas compartidas, equipo, fotos y partículas |
| `config.js` | ⚙️ Tu configuración (lo único que hace falta editar) |
| `assets/` | Escudo, fotos LCPD/CHP/LCFD, fondo ER:LC y escudos LAPD (color y marca de agua) |

## ✅ Consejos antes de publicar

- ✅ El enlace de Discord ya está configurado (`https://discord.gg/qytyw8E9dn`): todos los botones "Unirme al Discord", "Unirse" y el del pie llevan ahí. Si algún día cambia la invitación, actualizala en `config.js`.
- Completá los `robloxId` de los 3 CEOs en `config.js`: los avatares y nombres se cargan solos desde Roblox.
- Poné el número real de miembros del Discord.
- Para las cuentas: activá **SERVER MEMBERS INTENT** en el bot y dejá que cree **#panel-ciudadano**
  (o creá el canal privado y configurá `CH_PANEL`). El detalle está en [`../bot/README.md`](../bot/README.md).
- Las fotos de la portada se eligen al azar entre `foto-lapd.jpg`, `foto-chp.jpg` y `foto-lafd.jpg`.
  Si querés otras, reemplazalas manteniendo los nombres.
- Las animaciones y partículas respetan la preferencia **reducir movimiento** del sistema.
