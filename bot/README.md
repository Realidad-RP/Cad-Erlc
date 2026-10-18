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

---

## Por partes 🧩

### Parte 1 — Crear el bot en Discord

1. Entrá a **<https://discord.com/developers/applications>** con tu cuenta.
2. **New Application** → ponele nombre (ej. `CAD ERLC`) → Create.
3. Menú izquierdo → **Bot**:
   - Pulsá **Reset Token** → **Copy** y guardá ese texto (es el `discordToken`). ⚠️ No lo compartas con nadie.
   - No hace falta activar ningunos “intents” para este bot.
4. Menú izquierdo → **General Information** → copiá el **Application ID**.
5. Invitá el bot a tu servidor: abrí esta dirección cambiando `TU_APPLICATION_ID`:

   ```
   https://discord.com/oauth2/authorize?client_id=TU_APPLICATION_ID&scope=bot+applications.commands&permissions=19456
   ```

   (permisos: ver canales, enviar mensajes y enlaces de embeds)

### Parte 2 — IDs de canales y servidor

1. En Discord: **Ajustes de usuario → Avanzado → Modo desarrollador: activado**.
2. Clic derecho a tu **servidor** → *Copiar ID* (ese es el `guildId`).
3. Clic derecho a cada **canal** → *Copiar ID*. Podés preparar hasta 4 canales:
   - `despacho` — llamadas y despachos del CAD
   - `bolo` — BOLOs
   - `erlc` — avisos en vivo del juego (webhooks)
   - `estado` — un mensaje que se actualiza solo, con los jugadores conectados

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
   `DISCORD_TOKEN`, `DISCORD_GUILD_ID`, `ERLC_SERVER_KEY`, `CAD_KEY` y los canales (`CH_DESPACHO`, `CH_BOLO`, `CH_ERLC`, `CH_ESTADO`).
4. Cuando termine el deploy, en el CAD poné como dirección del bot: `https://cad-erlc-bot.onrender.com`.

> 💡 En el plan gratuito el servicio se duerme tras un rato sin tráfico HTTP;
> el bot de Discord mantiene la conexión despierta mientras hay movimiento.

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

## Seguridad 🔒

- `bot/config.js` **no se sube a GitHub** (ya está en `.gitignore`): tiene el token y las claves.
- Si el token se filtra: Developer Portal → Bot → **Reset Token** y actualizá `config.js`.
- La `cadKey` protege el enlace CAD → bot: sin ella, nadie puede publicar en tus canales.

## Estructura

| Archivo | Función |
|---|---|
| `index.js` | Programa principal: Discord, comandos, estado en vivo |
| `lib/erlc.js` | Cliente de la API de ER:LC + verificación de firmas Ed25519 |
| `lib/cad.js` | Espejo del CAD y detección de novedades |
| `lib/server.js` | Servidor HTTP: enlace con el CAD y webhook del juego |
| `config.js` | Tus claves (privado, no se sube) |
| `self-test.js` | Prueba automática |
