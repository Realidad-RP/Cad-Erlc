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
  discord: "https://discord.gg/TU-INVITACION",

  // Redes sociales. Dejá "" (vacío) en las que no tengas: se ocultan solas.
  instagram: "",
  tiktok: "",
  youtube: "",

  // Correo de soporte (dejá "" para ocultarlo)
  correo: "soporte@larealidadrp.com",

  // Enlace de descarga del CAD (si lo publicás en OneDrive/GitHub/MediaFire).
  // Dejá "" para ocultar el botón.
  cadDescarga: "",

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

  /* ---------- Equipo fundador ----------
     foto: dejá "" para mostrar las iniciales en un círculo de color,
     o poné la ruta de una imagen, ej: "assets/equipo/lucas.png".
     discord / instagram: enlaces; "" = se ocultan.                    */
  equipo: [
    {
      nombre: "Tu Nombre",
      rol: "Fundador & CEO",
      desc: "Fundador de la comunidad. Lidera la dirección del proyecto, define los objetivos del servidor y coordina al equipo.",
      foto: "",
      discord: "https://discord.gg/TU-INVITACION",
      instagram: ""
    },
    {
      nombre: "Nombre Apellido",
      rol: "Socio & Director",
      desc: "Socio y director. Supervisa la experiencia de roleplay, fomenta la participación y cuida el ambiente del servidor.",
      foto: "",
      discord: "https://discord.gg/TU-INVITACION",
      instagram: ""
    },
    {
      nombre: "Nombre Apellido",
      rol: "Jefe de Staff",
      desc: "Lidera el equipo de moderación: gestiona denuncias, aplica la normativa y da soporte a los jugadores todos los días.",
      foto: "",
      discord: "https://discord.gg/TU-INVITACION",
      instagram: ""
    }
  ],

  /* ---------- Tienda (textos de ayuda) ---------- */
  // A dónde lleva el botón "Comprar" de cada producto (por defecto, tu Discord).
  // Si tenés un canal de tickets, pegalo acá, ej:
  // "https://discord.com/channels/123456789/987654321"
  tiendaLink: "",
  moneda: "RealCoins",      // moneda interna de la comunidad

  /* ---------- Pie de página ---------- */
  metodosPago: ["PayPal", "Nequi", "Bancolombia", "PSE", "Transferencia"],
  anio: new Date().getFullYear()
};
