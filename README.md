# 🚔 CAD ER:LC

CAD de escritorio (Windows) con **radio de voz real** para comunidades de **Emergency Response: Liberty County** (Roblox).

## ✨ Qué incluye

- 🚨 **Despacho**: llamadas con tipo, prioridad y ubicación; despachar unidades, marcar en escena y cerrar.
- 🚓 **Unidades**: indicativos con estados 10-code (10-8, 10-6, 10-97, 10-23, 10-7).
- 👥 **Roster** de personal con rango y departamento.
- 🔎 **BOLOs** de personas y vehículos.
- 📜 **Historial** automático de todo lo que pasa.
- 📻 **Radio de voz** estilo TeamSpeak: canales, quién está hablando y push-to-talk con tecla global (funciona incluso dentro del juego).
- 🖥️ **Servidor integrado**: cualquier miembro puede alojar el radio desde la app con un solo botón.
- 🌍 **Listo para internet**: se puede alojar el servidor en la nube (Render, VPS, Docker) y aceptar gente de cualquier país.

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
3. Todos entran al mismo canal (ej. *Despacho*) y **mantienen pulsada la tecla V para hablar**. 🎙️

Notas:

- La primera vez, Windows pedirá permitir el acceso de red: **Permitir** (redes privadas).
- El push-to-talk funciona incluso con ER:LC a pantalla completa.
- En "Push-to-talk" se puede cambiar la tecla (V, B, N, M, X, C) y el modo (Mantener / Alternar).

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

## 📦 Crear el .exe

```
npm run build
```

Los archivos quedan en la carpeta **dist/** (instalador + versión **portátil** `.exe`).

## 🗂️ Estructura del proyecto

| Archivo | Función |
|---|---|
| `main.js` | Proceso principal: ventana, micrófono, tecla global, servidor integrado |
| `preload.js` | Puente seguro entre la interfaz y el sistema |
| `src/index.html` | Interfaz |
| `src/styles.css` | Estilos (tema oscuro) |
| `src/app.js` | Despacho, unidades, roster, BOLOs, historial |
| `src/radio.js` | Radio de voz (WebRTC) |
| `server/radio-server.js` | Servidor de radio (HTTP + señalización) |
| `server/signaling.js` | Servidor suelto para PC/VPS/nube |
| `server/self-test.js` | Prueba automática del servidor |
| `server/package.json` | Paquete independiente del servidor (para la nube) |
| `server/Dockerfile` | Imagen Docker del servidor (para VPS) |
| `render.yaml` | Despliegue automático en Render (raíz del proyecto) |

Hecho con ❤️ para tu comunidad.
