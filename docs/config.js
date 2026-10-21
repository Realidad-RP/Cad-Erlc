/* ============================================================
   LA REALIDAD RP — CONFIGURACIÓN DE LA PÁGINA WEB
   ------------------------------------------------------------
   ⚙️ Este es el ÚNICO archivo que necesitás editar para poner
   tus enlaces reales (Discord, redes, equipo, etc).
   No hace falta saber programar: cambiá el texto entre "comillas".
   ============================================================ */

window.LR_CONFIG = {

  /* ---------- Identidad ---------- */
  nombre: "La Realidad RP",
  ciudad: "Los Angeles",

  /* ---------- Enlaces principales ---------- */
  // ⚠️ IMPORTANTE: reemplazá esto por la invitación REAL de tu Discord.
  //    (En Discord: tu servidor → clic derecho en un canal → Invitar a personas → Editar enlace)
  discord: "https://discord.gg/qytyw8E9dn",

  // Redes sociales. Dejá "" (vacío) en las que no tengas: se ocultan solas.
  instagram: "",
  tiktok: "",
  youtube: "",

  // Correo de soporte (dejá "" para ocultarlo)
  correo: "soporte@larealidadrp.com",

  // Enlace de descarga del CAD (si lo publicás en OneDrive/GitHub/MediaFire).
  // Dejá "" para ocultar el botón.
  cadDescarga: "https://github.com/Realidad-RP/Cad-Erlc/releases/download/v0.1.0/CAD-RLD-0.1.0.exe",

  // Página para llamar al 911 (civiles) — la sirve el servidor de radio
  central911: "https://cad-erlc-radio.onrender.com/911",

  // Servidor del bot de Discord (cuentas + reseñas compartidas).
  // Si abrís la web en tu PC, la web usa automáticamente http://localhost:8790.
  apiBase: "https://cad-erlc-bot.onrender.com",

  // Música de la cinemática del Panel de Ciudadano.
  // Poné el archivo en web/assets/audio/ y escribí la ruta acá.
  // Ejemplo: "assets/audio/one-more-time.mp3". Si no existe, la cinemática
  // sigue sin sonido; no se descarga ninguna canción con derechos.
  introMusic: "assets/audio/one-more-time.mp3",
  introMusicVolume: 0.35,

  /* ---------- Números de la portada ----------
     Poné los números reales de tu comunidad.
     Si dejás miembros en 0, se muestra "—".                          */
  miembros: 0,        // ej: 250  (miembros de tu Discord)
  online: "—",        // ej: "12/50" (jugadores en el servidor de ER:LC)
  ratingBase: 0,      // valoración inicial 0–5 si todavía no hay reseñas (0 = se calcula solo)

  /* ---------- Reseñas fijas (opcional) ----------
     Las reseñas que dejan los visitantes se guardan en su navegador.
     Si querés fijar reseñas que SIEMPRE aparezcan, agregalas aquí:
     { nombre: "Ana", estrellas: 5, texto: "Muy buen rol, staff atento." }   */
  resenasEjemplo: [],

  /* ---------- Equipo fundador (conectado a Roblox) ----------
     🤖 Roblox: pegá el ID de Roblox de cada CEO (robloxId) y la web carga
     sola su avatar y su nombre desde Roblox. Si algo falla, se muestran
     las iniciales en un círculo de color.
       ¿Cómo saco el ID? Entrá a su perfil en roblox.com y copiá el número
       de la barra:  roblox.com/users/ESTE-NUMERO/profile
     roblox:    el usuario, solo de referencia (por si lo necesitás después).
     avatarUrl: opcional; imagen que se muestra al instante mientras carga.
     nombre:    dejalo "" para usar automáticamente el nombre de Roblox,
                o escribí el nombre que quieras mostrar.
     foto:      opcional, una imagen tuya (ej: "assets/equipo/ana.png");
                si la ponés, tiene prioridad sobre el avatar de Roblox.
                                                                    */
  avatarCompleto: false,   // true = avatar de cuerpo entero | false = solo la cara

  equipo: [
    {
      nombre: "",
      rol: "CEO & Fundador",
      desc: "Fundador de la comunidad. Lidera la dirección del proyecto, define los objetivos del servidor y coordina al equipo.",
      foto: "",
      robloxId: "3004160461",
      roblox: "marsineke1234",
      avatarUrl: "https://tr.rbxcdn.com/30DAY-AvatarHeadshot-56514223316685631320578E72A29870-Png/420/420/AvatarHeadshot/Png/noFilter",
      discord: "https://discord.gg/qytyw8E9dn",
      instagram: ""
    },
    {
      nombre: "",
      rol: "CEO & Socio",
      desc: "Socio y director. Supervisa la experiencia de roleplay, fomenta la participación y cuida el ambiente del servidor.",
      foto: "",
      robloxId: "",          // ← pegá acá el ID de Roblox del segundo CEO
      roblox: "",
      avatarUrl: "",
      discord: "https://discord.gg/qytyw8E9dn",
      instagram: ""
    },
    {
      nombre: "",
      rol: "CEO & Director",
      desc: "Lidera la moderación: gestiona denuncias, aplica la normativa y da soporte a los jugadores todos los días.",
      foto: "",
      robloxId: "",          // ← pegá acá el ID de Roblox del tercer CEO
      roblox: "",
      avatarUrl: "",
      discord: "https://discord.gg/qytyw8E9dn",
      instagram: ""
    }
  ],

  /* ---------- Pie de página ---------- */
  anio: new Date().getFullYear()
};
