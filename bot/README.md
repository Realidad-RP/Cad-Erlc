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
| 🪪 **Buscar por DNI** | En Discord: `/dni 30123456` → muestra la ficha de esa persona (licencia, órdenes activas, multas pendientes y vehículos) usando los **📇 Registros** del CAD |
| 🎮 **Estado en vivo** | Muestra cuántos jugadores hay en el servidor de ER:LC (y un mensaje que se actualiza solo) |
| 📡 **Avisos del juego** | Recibe las **llamadas de emergencia** del juego y los comandos con `;` en tiempo real (webhooks) |
| 💬 **Comandos** | `/estado` · `/jugadores` · `/cad` · `/juego` (ejecuta comandos dentro del juego, solo admins) |
| 🪪 **Cuentas web** | Crea cuentas para el **Panel de Ciudadano** de la web con el usuario de Discord, contraseña y **código por MD**. Guarda las **reseñas compartidas** para que se vean desde cualquier dispositivo |

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
3. Clic derecho a cada **canal** → *Copiar ID*. Podés preparar hasta 5 canales:
   - `despacho` — llamadas y despachos del CAD
   - `bolo` — BOLOs
   - `erlc` — avisos en vivo del juego (webhooks)
   - `estado` — un mensaje que se actualiza solo, con los jugadores conectados
   - `panel` — **privado**, donde se guardan las cuentas y reseñas de la web.
     Si no lo creás, el bot crea **#panel-ciudadano** solo (necesita permiso *Gestionar canales*).

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
   `DISCORD_TOKEN`, `DISCORD_GUILD_ID`, `ERLC_SERVER_KEY`, `CAD_KEY` y los canales (`CH_DESPACHO`, `CH_BOLO`, `CH_ERLC`, `CH_ESTADO`, opcional `CH_PANEL`).
4. Cuando termine el deploy, en el CAD poné como dirección del bot: `https://cad-erlc-bot.onrender.com`.

> 💡 En el plan gratuito el servicio se duerme tras un rato sin tráfico HTTP;
> el bot de Discord mantiene la conexión despierta mientras hay movimiento.
>
> 💾 En ese plan el disco se borra en cada reinicio. Por eso las **cuentas web y las reseñas**
> se guardan como mensajes en el canal privado **#panel-ciudadano** de tu Discord:
> siguen ahí aunque Render reinicie el servicio. Las sesiones vencen solas a los 30 días.

---

### Parte 8 — Cuentas del Panel de Ciudadano (web)

La web tiene un botón **Cuenta** (arriba a la derecha y en el menú lateral). El flujo es:

1. La persona escribe su **usuario de Discord**, una **contraseña** y la confirma.
2. El bot busca ese usuario **en tu servidor**, le manda un **MD con un código de 6 dígitos** y la web pide el código.
3. Al ingresarlo, la cuenta queda creada y la persona entra automáticamente, con su **nombre y foto de Discord**.
4. Para volver a entrar: usuario + contraseña. Si la olvidó, pide un código por MD y elige una nueva.
5. Las **reseñas** que publique quedan guardadas en el servidor y se ven desde cualquier dispositivo, con su foto de Discord.

**Requisitos (una sola vez):**

- Activar **SERVER MEMBERS INTENT** en el Developer Portal (Parte 1). Sin esto, la web no puede encontrar el usuario por nombre.
- Que el bot esté en el servidor y que la persona tenga los **MD abiertos** (si no, no puede recibir el código).
- Un lugar privado para guardar los datos:
  - lo ideal es dejar que el bot cree **#panel-ciudadano** (necesita *Gestionar canales*), o
  - crear el canal a mano, darle acceso al bot y poner su ID en `CH_PANEL`.

> ⚠️ El canal del panel debe ser **privado**: guarda hashes de contraseñas (scrypt), sesiones y reseñas.
> No le des acceso a @everyone. El bot no publica las contraseñas en ningún otro lado.

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
| `/dni numero` | Busca una persona en los **📇 Registros del CAD** por su DNI (licencia, órdenes activas, multas pendientes y vehículos) |
| `/juego comando` | Ejecuta un comando dentro del juego (ej. `:h Buenos días`). Solo administradores; límite: 1 cada 5 s |

---

## Pruebas rápidas 🧪

Desde la raíz del proyecto (no necesitan conectarse a Discord):

```bash
node bot/test-web-auth.js        # cuentas, códigos, sesiones y reseñas
node bot/test-discord-store.js   # guardado duradero en #panel-ciudadano
node bot/self-test.js            # configuración y utilidades del bot
```

---

## Problemas comunes 🔧

| Síntoma | Causa y solución |
|---|---|
| El CAD dice “Sin conexión con el bot” | El bot no está corriendo (`npm start`), la dirección no es la correcta, o la `cadKey` no coincide entre bot y CAD |
| `/cad` dice “El CAD todavía no envió datos” | Falta configurar el panel “Enlace con el bot” en la app |
| Error **401** en los avisos del juego | La `erlcServerKey` es vieja; el dueño la regeneró en el juego |
| Error **403** al consultar el juego | El servidor privado no tiene el pack **ERLC API**, o la clave es incorrecta |
| Error **429** | Límite de la API alcanzado; el bot ya espera solo. No lo apures |
| Los comandos no aparecen en Discord | Revisá `guildId`; si lo cambiás, reiniciá el bot (tarda hasta 1 hora si es global) |
| El bot no publica pero no da error | Revisá que los IDs de canales sean correctos y que el bot tenga permiso de *Enviar mensajes* en ese canal |
| La web dice **“No encuentro ese usuario en el servidor”** | Activá **SERVER MEMBERS INTENT** en el Developer Portal y reiniciá el bot |
| La web dice **“No pude enviarte un MD”** | La persona no está en el servidor o tiene los MD cerrados (Privacidad → Mensajes directos) |
| La web dice **“El sistema de cuentas está iniciando”** | El bot todavía no terminó de conectar o no puede leer/crear **#panel-ciudadano**. Dale *Leer historial* y *Gestionar canales*, o creá el canal y configurá `CH_PANEL` |
| Las reseñas no se comparten entre dispositivos | El bot no está guardando en Discord: revisá los permisos del canal del panel y los logs de Render |

## Seguridad 🔒

- `bot/config.js` **no se sube a GitHub** (ya está en `.gitignore`): tiene el token y las claves.
- Si el token se filtra: Developer Portal → Bot → **Reset Token** y actualizá `config.js`.
- La `cadKey` protege el enlace CAD → bot: sin ella, nadie puede publicar en tus canales.
- Las contraseñas web nunca se guardan en texto plano: se usa **scrypt** con sal.
  Los códigos de recuperación son de 6 dígitos, vencen a los **10 minutos** y tienen un enfriamiento de **30 segundos**.
- El canal **#panel-ciudadano** contiene datos privados: no lo hagas público ni le des acceso a roles que no correspondan.

## Estructura

| Archivo | Función |
|---|---|
| `index.js` | Programa principal: Discord, comandos, estado en vivo |
| `lib/erlc.js` | Cliente de la API de ER:LC + verificación de firmas Ed25519 |
| `lib/cad.js` | Espejo del CAD y detección de novedades |
| `lib/server.js` | Servidor HTTP: enlace con el CAD, webhook del juego y cuentas web |
| `lib/web-auth.js` | Cuentas, códigos por MD, sesiones y API de reseñas de la web |
| `lib/store.js` | Guardado duradero: archivo local (pruebas) o canal privado de Discord (producción) |
| `config.js` | Tus claves (privado, no se sube) |
| `self-test.js` | Prueba automática del bot |
| `test-web-auth.js` | Prueba automática de cuentas y reseñas (27 comprobaciones) |
| `test-discord-store.js` | Prueba del guardado en Discord con un canal simulado (13 comprobaciones) |
