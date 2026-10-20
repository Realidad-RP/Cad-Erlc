# 🏛️ CAD | AYUNTAMIENTO | Los Angeles

CAD de escritorio (Windows) con **radio de voz real** para comunidades de **Emergency Response: Liberty County** (Roblox).

## ✨ Qué incluye

- 🚨 **Despacho**: llamadas con tipo, prioridad y ubicación; despachar unidades, marcar en escena y cerrar.
- 🚓 **Unidades**: indicativos con estados 10-code (10-8, 10-6, 10-97, 10-23, 10-7).
- 👥 **Roster** de personal con rango y departamento.
- 🔎 **BOLOs** de personas y vehículos.
- 📇 **Registros**: fichas de personas y vehículos con buscador (por nombre, DNI, licencia o placa), multas, órdenes y reportes.
- 🆘 **Botón de pánico**: pedís ayuda con un clic **o con una tecla global (F8, funciona con la ventana minimizada o jugando)** y le salta una alerta roja con sirena a todo el CAD al instante (crea la llamada en Despacho sola).
- 📞 **Central 911 civil**: una página web para que los civiles llamen al 911 y la llamada caiga solita en Despacho (con tipo, nombre y ubicación).
- 🟢 **Servidor ER:LC en vivo**: quiénes están en el juego, con su equipo e indicativo, actualizado solo; y mensajes al juego desde el CAD (requiere el pack ERLC API).
- 🗺️ **Mapa en vivo**: posiciones reales de cada unidad del juego sobre el mapa oficial (calibrado con las coordenadas reales del servidor: 1 unidad = 1 px del mapa), con las llamadas de emergencia marcadas, vista plana y vista 3D, zoom, filtro de civiles y **seguimiento tipo cámara** con calle y código postal de la unidad (requiere el pack ERLC API).
- 🖥️ **Radio flotante sobre el juego**: radio portátil estilo Motorola siempre encima del juego, con tu zona y canal, quién está hablando, tu indicativo y estado en el CAD, cantidad de compañeros y la tecla PTT. La **flechita ❮** la guarda como una pestañita (y la saca de nuevo sin abrir el CAD), la pestaña **Canales** te deja cambiar de canal al toque, y el botón **🚨 PÁNICO** avisa a todo el CAD con el mismo sonido, dejándote cancelar o escribir tu ubicación antes de enviarlo (y luego "✅ Todo controlado").
- 📜 **Historial** automático de todo lo que pasa.
- 📻 **Radio de voz** estilo TeamSpeak: canales organizados en **secciones plegables estilo categorías de Discord**, canales privados con invitación, roles, quién está hablando y push-to-talk con tecla global (funciona incluso dentro del juego). Al abrir y cerrar el micrófono suena un **clic de radio estilo Motorola** al instante (volumen configurable en 🎧 Audio).
- 🎧 **Pestaña Audio**: elegí con qué micrófono hablás y por dónde escuchás la radio (parlantes/auriculares), probá tu micrófono con medidor en vivo, escuchate a vos mismo y cambiá la tecla PTT y el volumen.
- 🖥️ **Servidor integrado**: cualquier miembro puede alojar el radio desde la app con un solo botón.
- 🌍 **Listo para internet**: se puede alojar el servidor en la nube (Render, VPS, Docker) y aceptar gente de cualquier país.
- 🤖 **Bot de Discord**: enlaza el CAD con tu Discord (llamadas, unidades, BOLOs, estado del juego en vivo, comandos dentro del juego y **búsqueda de personas por DNI** con `/dni`).
- 🔐 **Acceso con contraseña**: al abrir la app se pide la contraseña **LAAY** (se cambia en una línea de `src/app.js`) y entrás directo al **MDT general**. La pantalla de acceso tiene fondo cinematográfico estilo ER:LC y el escudo **LAPD** como marca de agua transparente.

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
- Los canales se agrupan en **secciones plegables, igual que las categorías de Discord**: tocá el nombre de la sección para plegarla o mostrarla. Al crear un canal elegís su sección (General, Departamentos, Operaciones, Privados, Comando… o la que quieras).
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
- **Sonidos de la app**: volumen del **clic de radio** (push-to-talk) y del **sonido de pánico**, cada uno con su botón **▶ Probar** para escucharlo y ajustarlo a gusto.
- La prueba abre tu micrófono **solo mientras está activa** (se cierra al detenerla o al salir de la pestaña). Para hablar en la radio sigue funcionando la tecla PTT de siempre.

## 📇 Registros (personas, vehículos, multas, órdenes y reportes)

En la pestaña **📇 Registros** está el "archivo" del CAD, estilo Sonoran:

- 🔎 **Buscador**: escribí un nombre, un **DNI**, una licencia o una placa y te muestra las fichas al instante (con cuántas multas y órdenes activas tiene esa persona).
- 👤 **Personas**: ficha con **DNI**, Nº de licencia y su estado (Válida/Suspendida/Revocada), fecha de nacimiento y notas. Desde la ficha podés **cambiar el estado de la licencia** en un clic.
- 🚗 **Vehículos**: placa, marca/modelo, color, dueño y estado (**Normal / ⚠️ ROBADO** con un botón para alternarlo).
- 🧾 **Multas**: persona, monto y motivo; se marcan como **pagadas** con un clic.
- ⚖️ **Órdenes** de arresto, registro o citación; se marcan como **cumplidas**.
- 📝 **Reportes**: título, tipo, involucrados y narrativa libre (informe policial).
- Todo queda guardado en tu CAD y queda registrado en el **Historial**.

> 💡 Por ahora los registros son **locales** (cada uno tiene su propio archivo). Más adelante se pueden sincronizar entre todos por el servidor.

## 🆘 Botón de pánico

En la barra lateral, panel **🚨 Emergencia**:

1. (Opcional, pero muy recomendado) Escribí **dónde estás**: ayuda muchísimo a los que van a ayudarte.
2. Tocá **🆘 PEDIR AYUDA (PÁNICO)** — o presioná la **tecla de pánico**.

La **tecla de pánico** (por defecto **F8**, se cambia en el mismo panel) funciona **aunque tengas el CAD minimizado o estés jugando ER:LC a pantalla completa**: el ícono del CAD destella en la barra de tareas para confirmarte que la alerta salió.

El pánico suena con un **sonido de botón de pánico** en bucle hasta que se corte (volumen configurable en 🎧 Audio).

A **todos** los conectados al radio les salta al instante una **alerta roja a pantalla completa con sirena** con tu nombre, tu departamento y tu ubicación, **y se crea la llamada en Despacho automáticamente** 📟. Cuando estés a salvo, tocá **✅ TODO CONTROLADO** para avisar que ya pasó (solo vos —o un administrador— pueden cancelarla). Si alguien se conecta después y la alerta sigue activa, también la ve. Hay un límite anti-spam de 15 segundos entre alertas.

## 📞 Central 911 para civiles (página web)

Tus civiles (incluso **sin el CAD instalado**) pueden llamar al 911 desde el celular o la PC:

- El enlace es el **mismo servidor de radio + `/911`**. Ejemplo: `https://cad-erlc-radio.onrender.com/911`. En la app, debajo del campo del servidor de radio, te aparece el enlace exacto para compartir.
- El civil elige el tipo (🚓 🚑 🚒 🛣️ ❓), escribe su nombre, dónde está y qué pasa, y toca **📞 LLAMAR AL 911**.
- Al instante, en el **Despacho de todos** aparece la llamada con tipo, nombre, ubicación y prioridad **Alta**, suena un aviso y queda registrada en el Historial. 📟

Hay un límite anti-spam de 20 segundos entre llamadas por persona. (La página deja bien claro que es para **roleplay**, no para emergencias reales.)

## 🟢 Servidor ER:LC en vivo (pestaña ER:LC)

Si tu servidor privado tiene el pack **ERLC API** (se compra con Robux), la app puede ver el juego en vivo:

1. En el juego: **Settings → API key** (o https://erlc.link/sk) y copiá la clave.
2. En el CAD: pestaña **🟢 ER:LC** → pegá la clave → **🔌 Conectar**.

Vas a ver, actualizado solo cada 10 segundos: el **nombre del servidor**, cuántos **jugadores** hay (12/50), la **clave de ingreso** y la **tabla de conectados** con su **equipo** (policía, bomberos…) e **indicativo** si están en servicio. También podés **mandar mensajes al juego** desde el CAD (los comandos del juego, ej. `:h` aviso global). Límite de la API: 1 comando cada ~5 segundos. La clave queda guardada **solo en tu PC**, nunca se comparte.

> **¿Quién puede usar la pestaña?** Solo aparece para **Propietario, Administrador y Supervisor** (conectados al radio). **Mandar mensajes al juego** solo pueden el **Propietario y los Administradores** — los Supervisores pueden mirar, pero no ejecutar comandos. Para el resto de los miembros la pestaña ni aparece.

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

El bot publica en tu Discord las **llamadas, unidades y BOLOs del CAD al instante**, muestra el **estado en vivo del servidor de ER:LC** (jugadores), recibe las **llamadas de emergencia del juego**, permite **ejecutar comandos dentro del juego** con `/juego` y **busca personas en los registros del CAD** con `/dni 30123456` (licencia, órdenes activas, multas pendientes y vehículos).

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
| `bot/lib/cad.js` | Detección de novedades del CAD + búsqueda por DNI |
| `bot/lib/erlc.js` | API de ER:LC (estado, jugadores, comandos) + firmas Ed25519 |
| `bot/lib/server.js` | Servidor HTTP del bot (enlace CAD + webhooks del juego) |
| `bot/config.js` | Claves del bot (privado, no se sube a GitHub) |
| `bot/README.md` | Guía del bot paso a paso |
| `render.yaml` | Despliegue automático en Render (raíz del proyecto) |
| `web/` | 🌐 Página web de la comunidad (ver [web/README.md](web/README.md); se abre con `npm run web`) |

Hecho con ❤️ para tu comunidad.
