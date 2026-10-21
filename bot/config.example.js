// Configuración del bot de Discord — CAD ER:LC
//
// 1) Copiá este archivo como config.js
// 2) Completá tus datos entre las comillas
// 3) config.js NO se sube a GitHub (tiene datos privados)
//
// También se puede configurar todo con variables de entorno
// (útil para Render: DISCORD_TOKEN, DISCORD_GUILD_ID, ERLC_SERVER_KEY,
//  CAD_KEY, PORT, CH_DESPACHO, CH_BOLO, CH_ERLC, CH_ESTADO, CH_PANEL,
//  CH_LICENCIAS, CH_LICENCIAS_CATEGORIA, CH_LICENCIAS_ROL, POLL_SECONDS).
//
// Guía paso a paso: bot/README.md

module.exports = {
  // 1) Token del bot de Discord
  //    (Developer Portal → tu aplicación → Bot → Reset Token → Copy)
  discordToken: 'PEGA-ACA-TU-TOKEN',

  // 2) ID de tu servidor de Discord (los comandos aparecen al instante)
  //    (Discord → Modo desarrollador → clic derecho al servidor → Copiar ID)
  guildId: 'ID-DEL-SERVIDOR-DISCORD',

  // 3) Server-key de tu servidor privado de ER:LC
  //    (en el juego: Settings → API key · requiere el pack "ERLC API")
  erlcServerKey: 'PEGA-ACA-TU-SERVER-KEY',

  // 4) Clave inventada para el enlace con el CAD
  //    (la misma que escribas en la app, panel "Enlace con el bot")
  cadKey: 'inventa-una-clave-larga-y-secreta',

  // Puerto donde escucha el bot (el CAD se conecta acá)
  port: 8790,

  // Canales de Discord (clic derecho al canal → Copiar ID;
  // dejá '' en los que no quieras usar)
  channels: {
    despacho: '', // llamadas nuevas, despachos, cierres
    bolo: '',     // BOLOs nuevos y resueltos
    erlc: '',     // avisos en vivo del juego (webhooks)
    estado: '',   // mensaje que se actualiza solo con el estado del servidor
    panel: '',    // datos privados de la web (si vacío, el bot crea #panel-ciudadano)
    licencias: '', // solicitudes de licencia (si vacío, el bot crea #solicitudes-licencia)
  },

  // Categoría donde se crea #solicitudes-licencia y rol que puede revisar.
  // Si el rol queda vacío, el bot busca Moderador/Staff/Administrador.
  licenseCategory: 'Realidad RP Bot',
  licenseRoleId: '',

  // Cada cuántos segundos consultar el estado del juego (mínimo 30)
  pollSeconds: 60,
};
