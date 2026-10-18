# 🏛️ CAD | AYUNTAMIENTO | Los Angeles

CAD de escritorio (Windows) con **radio de voz real** para comunidades de **Emergency Response: Liberty County** (Roblox).

## ✨ Qué incluye

- 🚨 **Despacho**: llamadas con tipo, prioridad y ubicación; despachar unidades, marcar en escena y cerrar.
- 🚓 **Unidades**: indicativos con estados 10-code (10-8, 10-6, 10-97, 10-23, 10-7).
- 👥 **Roster** de personal con rango y departamento.
- 🔎 **BOLOs** de personas y vehículos.
- 📜 **Historial** automático de todo lo que pasa.
- 📻 **Radio de voz** estilo TeamSpeak: canales por sección, canales privados con invitación, roles, quién está hablando y push-to-talk con tecla global (funciona incluso dentro del juego).
- 🎧 **Pestaña Audio**: elegí con qué micrófono hablás y por dónde escuchás la radio (parlantes/auriculares), probá tu micrófono con medidor en vivo, escuchate a vos mismo y cambiá la tecla PTT y el volumen.
- 🖥️ **Servidor integrado**: cualquier miembro puede alojar el radio desde la app con un solo botón.
- 🌍 **Listo para internet**: se puede alojar el servidor en la nube (Render, VPS, Docker) y aceptar gente de cualquier país.
- 🤖 **Bot de Discord**: enlaza el CAD con tu Discord (llamadas, unidades, BOLOs, estado del juego en vivo y comandos dentro del juego).

## ▶️ Cómo ejecutarla

Requiere [Node.js](https://nodejs.org). Con la carpeta del proyecto:

```
npm install     (solo la primera vez)
npm start
```

## 📻 Cómo usar el radio en red local (LAN)

1. **El anfitrión** abre el CAD → panel "Radio de voz" → botón **"Alojar radio en esta PC"**.
   La app mostrará una dirección como: `ws://192.168.1.50:8787`
2. **Cada compañero** abre su CAD, escribe esa dirección en "Servidor", pone su nombre y pulsa **Conectar**.
3. Todos entran a un canal (ej. *Despacho Central*) y **mantienen pulsada la tecla V para hablar**. 🎙️

Notas:

- La primera vez, Windows pedirá permitir el acceso de red: **Permitir** (redes privadas).
- El push-to-talk funciona incluso con ER:LC a pantalla completa.
- En "Push-to-talk" se puede cambiar la tecla (V, B, N, M, X, C) y el modo (Mantener / Alternar).

## 📡 Canales, secciones y roles

- Cada sección tiene su **canal exclusivo**: **LCPD**, **CHP** (Highway Patrol), **LCFD** (Bomberos/EMS), **DOT** y **Central 9-1-1**. Solo entra quien pertenece a esa sección.
- Con **➕ Crear canal** se pueden crear más canales:
  - **De tu sección**: solo entra tu departamento (ej. canales extra de bomberos).
  - **🔒 Privados**: solo entran las personas que invites (botón **＋** en el canal).
- **Roles** (los asigna el propietario; se aplican al instante):
  - 👑 **Propietario**: permisos totales. La primera vez creás tu contraseña en la caja "👑 Propietario" del panel de radio; desde **"👑 Administración de roles"** asignás el rol de cada persona conectada (estilo Discord). La contraseña se recuerda en tu PC y podés cerrar sesión cuando quieras.
  - **Miembro**: crea canales de su sección y privados.
  - **Supervisor / Administrador**: crean canales generales y de cualquier sección; pueden invitar y eliminar en cualquier canal.
  - El creador de un canal también puede invitar/eliminar el suyo.
  - *(Opcional)* En Render podés definir la variable `OWNER_PASSWORD` para fijar la contraseña del propietario desde el servidor.
- Los canales creados **se guardan solos**: si el servidor en la nube se reinicia y los olvida, la primera app que se conecte los restaura automáticamente.

## 🎧 Pestaña Audio (micrófono, parlantes y prueba)

En la pestaña **🎧 Audio** de la app se configura todo el sonido:

- **Salida de audio**: elegí por dónde escuchás la radio (parlantes, auriculares, etc.). El cambio se aplica **al instante** a las voces de tus compañeros. El botón **🔔 Probar sonido** reproduce un tono por el dispositivo elegido para confirmar que se escucha.
- **Entrada de audio**: elegí tu micrófono. El botón **🎤 Probar micrófono** lo abre con un **medidor en vivo**: si la barra se mueve y dice "✅ Se está escuchando tu micrófono", está todo bien. Con la casilla **"Escucharme por los parlantes"** te escuchás a vos mismo (usá auriculares para evitar acople).
- **Tecla del micrófono (PTT)**: tecla (**V**, **B**, **N**, **M**, **X**, **C**), modo (mantener/alternar) y volumen de la radio. Está sincronizada con la barra lateral del radio.
- La prueba abre tu micrófono **solo mientras está activa** (se cierra al detenerla o al salir de la pestaña). Para hablar en la radio sigue funcionando la tecla PTT de siempre.

## 🌍 Radio para todo el mundo (internet)

El servidor de radio **solo presenta a las personas** (señalización). La voz viaja directo de PC a PC. Por eso, para gente de otros países hay que poner el servidor en internet:

### Opción recomendada: servidor en la nube (Render, gratis)

1. **Subí este proyecto a GitHub** (si no tenés Git: instalalo desde <https://git-scm.com>; luego `git init`, `git add .`, `git commit -m "CAD"` y creá el repositorio en GitHub para subirlo).
2. Entrá a <https://render.com> → **New +** → **Blueprint** → elegí tu repositorio.
   Render leerá el archivo `render.yaml` (raíz del proyecto) automáticamente (plan **Free**).
   *(Alternativa manual: New + → Web Service → Root Directory: `server` → Build: `npm install` → Start: `npm start`.)*
3. Cuando termine, copiá la dirección que te da Render, tipo `wss://cad-erlc-radio.onrender.com`.
4. En la app: pegá esa dirección en **Servidor**, poné tu nombre y **Conectar**. Todos tus compañeros usan la misma dirección. ✅
   *(En esta copia la dirección ya viene rellenada por defecto.)*

Notas:

- El plan gratuito **duerme** el servidor tras un rato sin uso: la primera conexión puede tardar ~30 segundos. Para uso serio, se puede pasar a un plan pago o usar un VPS.
- No hace falta que nadie tenga la PC encendida: el radio funciona 24/7.

### Redes estrictas (celulares, CGNAT...) → TURN

En algunas redes la voz no logra viajar directo. Para eso existe **TURN** (un "relay" que reenvía el audio). El servidor ya lo soporta:

1. Conseguí un servidor TURN (gratis/económico: proveedores como Metered/Open Relay o Twilio; también podés instalar `coturn` en un VPS).
2. En el servidor en la nube (Render: pestaña *Environment*), agregá estas variables:

   | Variable | Ejemplo |
   |---|---|
   | `TURN_URLS` | `turn:mi-servidor.com:3478,turns:mi-servidor.com:5349` |
   | `TURN_USERNAME` | `usuario` |
   | `TURN_CREDENTIAL` | `contraseña` |

3. Listo: al conectarse, cada app recibe la configuración automáticamente (no hay que tocar nada más). 🔧

### Servidor propio con Docker o VPS

```
cd server
docker build -t cad-radio .
docker run -d --restart unless-stopped -p 8787:8787 -e PORT=8787 \
  -e TURN_URLS=turn:mi-servidor.com:3478 -e TURN_USERNAME=usuario -e TURN_CREDENTIAL=contraseña \
  cad-radio
```

O sin Docker: `cd server && npm install && npm start` (abrí el puerto 8787 TCP en el firewall).

### Opción rápida: abrir el puerto de tu router

En el router del anfitrión, redirigir el puerto **8787 TCP** a su PC; los demás usan `ws://IP-PUBLICA:8787`. ❗ Depende de tu PC encendida y no funciona si tu internet usa CGNAT.

## 🧪 Probar el servidor de radio

```
npm run test-server
```

Debe terminar con: `✅ PRUEBA OK`.

## 🤖 Bot de Discord (CAD ↔ ER:LC)

El bot publica en tu Discord las **llamadas, unidades y BOLOs del CAD al instante**, muestra el **estado en vivo del servidor de ER:LC** (jugadores), recibe las **llamadas de emergencia del juego** y permite **ejecutar comandos dentro del juego** con `/juego`.

Guía completa paso a paso: **[bot/README.md](bot/README.md)**. Resumen:

```
cd bot
npm install     (solo la primera vez)
npm start       (o desde la raíz: npm run bot)
```

Después, en la app: panel **“🔗 Enlace con el bot (Discord)”** → dirección del bot + la misma clave que pusiste en `bot/config.js`.

Requisitos:

- Un bot de Discord (se crea gratis en el Developer Portal; la guía explica cómo).
- Para los avisos del juego en tiempo real: el servidor privado necesita el pack **ERLC API** (se compra con Robux) y pegar el webhook HTTPS en *Settings → Event Webhook*.
- Probar sin Discord ni internet: `npm run test-bot` → debe terminar con `✅ PRUEBA BOT OK`.

## 📦 Crear el .exe

```
npm run build
```

Los archivos quedan en la carpeta **dist/** (instalador + versión **portátil** `.exe`).

## 🌐 Compartir el CAD con tus miembros (sin avisos de Windows)

El `.exe` no está firmado digitalmente, así que al descargarlo desde el navegador Windows muestra el aviso *"Windows protegió tu PC"* (SmartScreen). Es normal en apps nuevas: **no significa que tenga virus** (Microsoft Defender lo escanea y no encuentra amenazas).

### ✅ Recomendado: OneDrive con "acceso directo" (gratis, sin avisos y con actualizaciones automáticas)

1. En tu OneDrive, compartí **la carpeta** (no el archivo) con permiso **"Cualquier persona con el enlace puede editar"**. ⚠️ Tiene que ser **"puede editar"**: con "solo ver" el botón de agregar no les aparece.
2. Cada miembro, en OneDrive.com: inicia sesión (cuenta Microsoft) → **Compartido** → clic en el círculo de la carpeta (o clic derecho) → **"Agregar acceso directo a Mis archivos"**.
3. La carpeta se sincroniza sola a su PC (dentro de su OneDrive, con la app que ya viene en Windows). Abren el `.exe` desde ahí: **sin ningún aviso** ✅.
4. Cuando actualices el `.exe` (mismo nombre), **a todos se les actualiza solo**.

📄 La guía lista para reenviar a Discord: [`docs/COMPARTIR-CON-MIEMBROS.md`](docs/COMPARTIR-CON-MIEMBROS.md)

> Las carpetas compartidas **no gastan** el almacenamiento de los miembros (solo el tuyo). Si alguien borrara el archivo por error, volvés a subirlo y listo.

### Si lo bajan desde el navegador (link normal)

El aviso aparece **una vez**: "Más información" → **"Ejecutar de todas formas"**. Alternativa: clic derecho al `.exe` → **Propiedades** → marcar **"Desbloquear"** → Aplicar.

### 🔏 Firma digital (opcional, de pago)

Firmar el `.exe` con un certificado elimina el aviso para siempre: **EV** (~300–600 USD/año) desde el primer día; **OV** (~130–300 USD/año) después de ganar reputación. Se configura en `package.json` → `build.win` de electron-builder.

## 🗂️ Estructura del proyecto

| Archivo | Función |
|---|---|
| `main.js` | Proceso principal: ventana, micrófono, tecla global, servidor integrado |
| `preload.js` | Puente seguro entre la interfaz y el sistema |
| `src/index.html` | Interfaz |
| `src/styles.css` | Estilos (tema oscuro) |
| `src/app.js` | Despacho, unidades, roster, BOLOs, historial, canales y roles |
| `src/radio.js` | Radio de voz (WebRTC) |
| `server/radio-server.js` | Servidor de radio (HTTP + señalización) |
| `server/signaling.js` | Servidor suelto para PC/VPS/nube |
| `server/self-test.js` | Prueba automática del servidor |
| `server/package.json` | Paquete independiente del servidor (para la nube) |
| `server/Dockerfile` | Imagen Docker del servidor (para VPS) |
| `bot/index.js` | Bot de Discord: comandos, estado en vivo y avisos |
| `bot/lib/cad.js` | Detección de novedades del CAD (llamadas, unidades, BOLOs) |
| `bot/lib/erlc.js` | API de ER:LC (estado, jugadores, comandos) + firmas Ed25519 |
| `bot/lib/server.js` | Servidor HTTP del bot (enlace CAD + webhooks del juego) |
| `bot/config.js` | Claves del bot (privado, no se sube a GitHub) |
| `bot/README.md` | Guía del bot paso a paso |
| `render.yaml` | Despliegue automático en Render (raíz del proyecto) |

Hecho con ❤️ para tu comunidad.
