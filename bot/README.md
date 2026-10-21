# 🤖 Bot de Discord — CAD ↔ ER:LC

El bot une las tres piezas de tu comunidad:

```
 CAD (tu app)   ──estado (llamadas, unidades, BOLOs)──►  BOT  ──mensajes──►  Discord
 ER:LC (juego)  ──webhooks (tiempo real)─────────────►  BOT  ──mensajes──►  Discord
 ER:LC (API)    ◄──consultas y órdenes───────────────  BOT  ◄──comandos──  Discord
```

## ¿Qué hace?

| Función | Para qué sirve |
|---|---|
| 📟 **Avisos del CAD** | Cuando creás una llamada, despachás unidades o cerrás un caso, aparece en Discord al instante |
| 🚨 **BOLOs** | Publica BOLOs nuevos y los marca resueltos |
| 🪪 **Buscar por DNI** | En Discord: `/dni C1234567` → muestra la ficha de esa persona con sus datos físicos y **todos los antecedentes juntos** (órdenes, multas, reportes y notas) usando los **📇 Registros** del CAD |
| 🎮 **Estado en vivo** | Muestra cuántos jugadores hay en el servidor de ER:LC (y un mensaje que se actualiza solo) |
| 📡 **Avisos del juego** | Recibe las **llamadas de emergencia** del juego y los comandos con `;` en tiempo real (webhooks) |
| 💬 **Comandos** | `/estado` · `/jugadores` · `/cad` · `/juego` (ejecuta comandos dentro del juego, solo admins) |
| 🪪 **Cuentas web** | Crea cuentas para el **Panel de Ciudadano** con usuario de Discord, contraseña, **usuario de Roblox** y **código por MD**. Guarda las **reseñas compartidas** para que se vean desde cualquier dispositivo |
| 🚗 **Licencias desde el panel** | El ciudadano completa un cuestionario en la web; el bot lo publica en **#solicitudes-licencia** y los mods aprueban o rechazan con botones. El CAD ya no administra licencias |

---

## Por partes 🧩

### Parte 1 — Crear el bot en Discord

1. Entrá a **<https://discord.com/developers/applications>** con tu cuenta.
2. **New Application** → ponele nombre (ej. `CAD ERLC`) → Create.
3. Menú izquierdo → **Bot**:
   - Pulsá **Reset Token** → **Copy** y guardá ese texto (es el `discordToken`). ⚠️ No lo compartas con nadie.
   - **Importante para la web:** en **Privileged Gateway Intents** activá **SERVER MEMBERS INTENT** y guardá.
     El bot lo usa para encontrar tu usuario de Discord cuando creás la cuenta web (busca por nombre).
     No hace falta activar `MESSAGE CONTENT INTENT`.
4. Menú izquierdo → **General Information** → copiá el **Application ID**.
5. Invitá el bot a tu servidor: abrí esta dirección cambiando `TU_APPLICATION_ID`:

   ```
   https://discord.com/oauth2/authorize?client_id=TU_APPLICATION_ID&scope=bot+applications.commands&permissions=93200
   ```

   (permisos: ver canales, enviar mensajes, embeds, leer historial, gestionar mensajes y crear el canal privado del panel)

### Parte 2 — IDs de canales y servidor

1. En Discord: **Ajustes de usuario → Avanzado → Modo desarrollador: activado**.
2. Clic derecho a tu **servidor** → *Copiar ID* (ese es el `guildId`).
3. Clic derecho a cada **canal** → *Copiar ID*. Podés preparar hasta 6 canales:
   - `despacho` — llamadas y despachos del CAD
   - `bolo` — BOLOs
   - `erlc` — avisos en vivo del juego (webhooks)
   - `estado` — un mensaje que se actualiza solo, con los jugadores conectados
   - `panel` — **privado**, donde se guardan las cuentas y reseñas de la web.
     Si no lo creás, el bot crea **#panel-ciudadano** solo (necesita permiso *Gestionar canales*).
   - `licencias` — **privado**, donde llegan las solicitudes de licencia del panel.
     Si no lo creás, el bot crea **#solicitudes-licencia** dentro de la categoría
     **Realidad RP Bot** (o la que indiques en `CH_LICENCIAS_CATEGORIA`).

### Parte 3 — Configurar

1. Copiá `bot/config.example.js` como `bot/config.js` (ya existe una copia lista).
2. Completá: `discordToken`, `guildId`, `erlcServerKey`, `cadKey` y los IDs de canales.
   - **`erlcServerKey`** se saca dentro del servidor privado de ER:LC:
     **Settings → API key** (requiere tener comprado el pack **ERLC API**; también está en <https://erlc.link/sk>).
     Si todavía no lo tenés, el bot igual funciona con el CAD: dejalo vacío.
   - **`cadKey`**: inventá una clave larga (ej. `cadenasuper-2026-erlc`). La vas a repetir en la app.

### Parte 4 — Arrancar el bot

Desde la carpeta del proyecto:

```
cd bot
npm install      (solo la primera vez)
npm start
```

O desde la raíz: `npm run bot` (después de hacer `npm install` dentro de `bot/`).

Si todo está bien vas a ver:

```
[Bot] Servidor HTTP activo en el puerto 8790 (salud: /health)
[Bot] Conectado como CAD ERLC#1234 · 1 servidor(es) de Discord
[Bot] Comandos listos: /estado /jugadores /cad /dni /juego
```

Para probar sin Discord ni internet: `npm run test-bot` → debe terminar en `✅ PRUEBA BOT OK`.

### Parte 5 — Enlazar el CAD con el bot

1. Abrí el CAD → panel **“🔗 Enlace con el bot (Discord)”**.
2. Completá:
   - **Dirección del bot**: `http://localhost:8790` si el bot corre en la misma PC.
     Si corre en otra PC de la casa/oficina: `http://IP-DE-ESA-PC:8790`.
   - **Clave del enlace**: la misma `cadKey` del bot.
3. **Guardar y probar** → debe decir ✅ *Enlazado con el bot*.
4. Listo: creá una llamada de prueba en el CAD y mirá el canal de despacho de Discord. 🎉

### Parte 6 — Avisos en vivo del juego (opcional, requiere internet)

El juego exige una **URL HTTPS** para los webhooks, así que esta parte funciona
cuando el bot está alojado en internet (Render). En Render, el bot lo imprime al arrancar:

```
https://cad-erlc-bot.onrender.com/erlc/webhook
```

Ese enlace se pega **dentro del juego**: *Settings → Event Webhook*.
Desde ese momento, las llamadas de emergencia y los comandos `;algo` aparecen en el canal `erlc`.

### Parte 7 — Alojar el bot en Render (para que funcione 24/7)

1. Subí el proyecto a GitHub (que ya tenés).
2. En Render: tu Blueprint → **Sync** (lee el nuevo servicio `cad-erlc-bot` del `render.yaml`).
3. Completá las variables de entorno del servicio:
   `DISCORD_TOKEN`, `DISCORD_GUILD_ID`, `ERLC_SERVER_KEY`, `CAD_KEY` y los canales
   (`CH_DESPACHO`, `CH_BOLO`, `CH_ERLC`, `CH_ESTADO`, opcional `CH_PANEL`,
   opcional `CH_LICENCIAS`). Para licencias también podés definir
   `CH_LICENCIAS_CATEGORIA` (por defecto `Realidad RP Bot`) y `CH_LICENCIAS_ROL`
   (ID del rol de moderadores que puede ver y revisar las solicitudes).
   **`DISCORD_TOKEN` es obligatorio**: sin él el bot no conecta a Discord y las cuentas de la web quedan en 503.
4. Cuando termine el deploy, en el CAD poné como dirección del bot: `https://cad-erlc-bot.onrender.com`.
   Para revisar las cuentas web abrí `https://cad-erlc-bot.onrender.com/web/status`.

> 💡 En el plan gratuito el servicio se duerme tras un rato sin tráfico HTTP;
> el bot de Discord mantiene la conexión despierta mientras hay movimiento.
>
> 💾 En ese plan el disco se borra en cada reinicio. Por eso las **cuentas web y las reseñas**
> se guardan como mensajes en el canal privado **#panel-ciudadano** de tu Discord:
> siguen ahí aunque Render reinicie el servicio. Las sesiones vencen solas a los 30 días.

---

### Parte 8 — Cuentas del Panel de Ciudadano (web)

La web tiene un botón **Cuenta** (arriba a la derecha y en el menú lateral). El flujo es:

1. La persona escribe su **usuario de Discord**, una **contraseña**, la confirma y completa su **usuario de Roblox**.
2. El bot busca el usuario de Discord **en tu servidor** y valida el usuario de Roblox con la API pública de Roblox. Si Roblox no responde, guarda el nombre escrito para no bloquear el registro; si el usuario no existe, lo rechaza.
3. Le manda un **MD con un código de 6 dígitos** y la web pide el código.
4. Al ingresarlo, la cuenta queda creada y la persona entra automáticamente, con su **nombre, foto de Discord y usuario de Roblox**.
5. Para volver a entrar: usuario + contraseña. Las cuentas viejas que no tengan Roblox lo piden **una sola vez** al iniciar sesión; si ya está guardado, el campo es opcional y se usa para comprobar que no sea otra persona.
6. La primera vez, `panel.html` ofrece **crear el DNI** o **vincular uno existente**. Para crear, completa nombre, apellido, fecha de nacimiento, **sexo, cabello, ojos, altura (cm), peso (kg), dirección, ciudad y código postal**. El bot calcula la edad, genera un DNI único `C#######` (7 números), fija emisión y vencimiento a 4 años y guarda el Roblox. Para vincular, escribe el **DNI** (acepta `C#######` y el formato viejo `CA-########`) y el **nombre exacto del personaje** que el staff cargó en el CAD. Se permite **un DNI por cuenta web**.
7. La **licencia de conducir** se pide desde la pestaña **Licencia** con un cuestionario en la misma página (experiencia, vehículo, normas de tránsito, motivo y confirmación). El bot envía la solicitud a **#solicitudes-licencia**, un canal privado de mods. Con los botones **Aprobar y emitir** / **Rechazar**, el mod resuelve; al aprobar se genera un número `L#######` con vencimiento a 4 años y el panel muestra **Válida**. El CAD ya no registra ni administra licencias.
8. El panel muestra en **solo lectura** los vehículos, las multas y las órdenes que el CAD envió al bot. El DNI se puede desvincular desde Ajustes, excepto si fue creado en la web (queda asociado a la cuenta).
9. Las **reseñas** que publique quedan guardadas en el servidor y se ven desde cualquier dispositivo, con su foto de Discord.

> ⚠️ El panel **no modifica** el CAD ni procesa pagos. Las multas se abonan en el juego y las correcciones de datos se piden al staff. Bank of America/economía sigue siendo solo de Discord.

**Cómo llegan los datos al panel:** el CAD envía un espejo de sus registros con `POST /cad/snapshot` al iniciar y cada vez que guarda la base. El bot lo mantiene **en memoria**; si Render reinicia el bot, el panel muestra “CAD sin datos” hasta que el CAD vuelva a enviar el espejo. Los DNI creados en la web se guardan en la cuenta y el CAD los importa desde `GET /citizen/directory` (con la `CAD_KEY`), incluidos los datos físicos y el Roblox, para que el staff los busque y les agregue causas. Las rutas del panel son:

| Ruta | Qué hace |
|---|---|
| `GET /citizen/me` | Devuelve la cuenta, el estado del vínculo, la licencia y el perfil del ciudadano (`waiting` si no hay snapshot, `missing` si el DNI ya no existe) |
| `POST /citizen/create` | Crea `{ firstName, lastName, dob, sex, hair, eyes, heightCm, weightKg, address, city, zip }`, calcula la edad y genera un DNI `C#######`; requiere sesión |
| `POST /citizen/link` | Vincula `{ dni, name }` a la cuenta autenticada; exige coincidencia exacta con el CAD |
| `POST /citizen/license/apply` | Guarda la solicitud `{ experience, vehicleType, trafficRules, reason, confirm }` y la envía al canal de mods; requiere sesión y DNI |
| `POST /citizen/unlink` | Quita el DNI de la cuenta web; no borra nada del CAD |
| `GET /citizen/directory` | Lista los DNI creados en la web con sus datos físicos; requiere el header `x-cad-key` |

Todas usan `Authorization: Bearer <token>` y CORS abierto, igual que `/auth/*` y `/reviews`.

**Requisitos (una sola vez):**

- Activar **SERVER MEMBERS INTENT** en el Developer Portal (Parte 1). Sin esto, la web no puede encontrar el usuario por nombre.
- Que el bot esté en el servidor y que la persona tenga los **MD abiertos** (si no, no puede recibir el código).
- En **#panel-ciudadano**, el bot necesita *Ver canal*, *Enviar mensajes* y *Leer historial*.
  *Gestionar mensajes* es opcional: solo sirve para borrar sesiones vencidas.
- En **#solicitudes-licencia**, el bot necesita *Ver canal*, *Enviar mensajes*, *Insertar enlaces* y *Leer historial*.
  *Gestionar canales* es necesario si querés que el bot cree la categoría y el canal solo.
- Para que los mods vean y revisen licencias:
  - definí `CH_LICENCIAS_ROL` con el ID del rol de moderadores, o
  - dejalo vacío y el bot buscará un rol llamado **Moderador**, **Staff** o **Administrador**;
  - si no encuentra ninguno, el canal queda visible solo para administradores y el bot.
- Un lugar privado para guardar los datos:
  - lo ideal es dejar que el bot cree **#panel-ciudadano** (necesita *Gestionar canales*), o
  - crear el canal a mano, darle acceso al bot y poner su ID en `CH_PANEL`.

> ⚠️ Los canales **#panel-ciudadano** y **#solicitudes-licencia** deben ser **privados**.
> El primero guarda hashes de contraseñas (scrypt), sesiones y reseñas; el segundo, datos personales de las solicitudes. No les des acceso a @everyone.

La web ya apunta a `https://cad-erlc-bot.onrender.com`. Si usás otra dirección, cambiala en `web/config.js` (`apiBase`).
Si abrís la web en tu propia PC, también acepta el bot local en `http://127.0.0.1:8790`.

---

## Comandos de Discord

> 💡 Para que **/dni** encuentre a alguien, la persona tiene que estar cargada en la pestaña **📇 Registros** del CAD con su **DNI**, y el CAD tiene que estar enlazado con el bot (Parte 5).

| Comando | Qué hace |
|---|---|
| `/estado` | Nombre del servidor, jugadores, clave de ingreso, verificación |
| `/jugadores` | Lista de conectados agrupados por equipo |
| `/cad` | Resumen del despacho: llamadas abiertas, unidades y BOLOs |
| `/dni numero` | Busca una persona en los **📇 Registros del CAD** por su DNI (datos físicos, antecedentes unificados, multas, órdenes y vehículos) |
| `/juego comando` | Ejecuta un comando dentro del juego (ej. `:h Buenos días`). Solo administradores; límite: 1 cada 5 s |

---

## Pruebas rápidas 🧪

Desde la raíz del proyecto (no necesitan conectarse a Discord):

```bash
node bot/test-web-auth.js        # cuentas, Roblox, DNI, licencias, sesiones y reseñas
node bot/test-discord-store.js   # guardado duradero en #panel-ciudadano
node bot/self-test.js            # configuración y utilidades del bot
```

---

## Problemas comunes 🔧

| Síntoma | Causa y solución |
|---|---|
| El CAD dice “Sin conexión con el bot” | El bot no está corriendo (`npm start`), la dirección no es la correcta, o la `cadKey` no coincide entre bot y CAD |
| El CAD dice “HTTP 403” al enlazar y `/web/status` muestra `cadKeyReady:false` | Falta `CAD_KEY` en las variables de entorno de Render. Cargala con la misma clave del panel “Enlace con el bot” del CAD y redeployá |
| `/cad` dice “El CAD todavía no envió datos” | Falta configurar el panel “Enlace con el bot” en la app |
| Error **401** en los avisos del juego | La `erlcServerKey` es vieja; el dueño la regeneró en el juego |
| Error **403** al consultar el juego | El servidor privado no tiene el pack **ERLC API**, o la clave es incorrecta |
| Error **429** | Límite de la API alcanzado; el bot ya espera solo. No lo apures |
| Los comandos no aparecen en Discord | Revisá `guildId`; si lo cambiás, reiniciá el bot (tarda hasta 1 hora si es global) |
| El bot no publica pero no da error | Revisá que los IDs de canales sean correctos y que el bot tenga permiso de *Enviar mensajes* en ese canal |
| La web dice **“No encuentro ese usuario en el servidor”** | Activá **SERVER MEMBERS INTENT** en el Developer Portal y reiniciá el bot |
| La web dice **“No pude enviarte un MD”** | La persona no está en el servidor o tiene los MD cerrados (Privacidad → Mensajes directos) |
| La web dice **“El sistema de cuentas está iniciando”** | Abrí `https://cad-erlc-bot.onrender.com/web/status`. Si `discordReady` es `false` y `discordError` dice que falta el token, cargá **`DISCORD_TOKEN`** en Render → *Environment* y reiniciá. Si `lastError` menciona el panel, dale al bot *Ver canal*, *Enviar mensajes* y *Leer historial* en **#panel-ciudadano** (o creá el canal y poné su ID en `CH_PANEL`) |
| Las reseñas no se comparten entre dispositivos | El bot no está guardando en Discord: revisá los permisos del canal del panel y los logs de Render |

## Seguridad 🔒

- `bot/config.js` **no se sube a GitHub** (ya está en `.gitignore`): tiene el token y las claves.
- Si el token se filtra: Developer Portal → Bot → **Reset Token** y actualizá `config.js`.
- La `cadKey` protege el enlace CAD → bot: sin ella, nadie puede publicar en tus canales.
- Las contraseñas web nunca se guardan en texto plano: se usa **scrypt** con sal.
  Los códigos de recuperación son de 6 dígitos, vencen a los **10 minutos** y tienen un enfriamiento de **30 segundos**.
- Los canales **#panel-ciudadano** y **#solicitudes-licencia** contienen datos privados: no los hagas públicos ni les des acceso a roles que no correspondan.

## Estructura

| Archivo | Función |
|---|---|
| `index.js` | Programa principal: Discord, comandos, estado en vivo |
| `lib/erlc.js` | Cliente de la API de ER:LC + verificación de firmas Ed25519 |
| `lib/cad.js` | Espejo del CAD y detección de novedades |
| `lib/server.js` | Servidor HTTP: enlace con el CAD, webhook del juego y cuentas web |
| `lib/web-auth.js` | Cuentas, Roblox, DNI web, licencias, códigos por MD, sesiones y API de reseñas |
| `lib/store.js` | Guardado duradero: archivo local (pruebas) o canal privado de Discord (producción) |
| `config.js` | Tus claves (privado, no se sube) |
| `self-test.js` | Prueba automática del bot |
| `test-web-auth.js` | Prueba automática de cuentas, Roblox, DNI, licencias y reseñas (94 comprobaciones) |
| `test-discord-store.js` | Prueba del guardado en Discord con un canal simulado (13 comprobaciones) |
